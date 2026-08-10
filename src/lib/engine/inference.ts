// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Flood Estimation Engine: ONNX Model Inference
//
// Loads a pre-trained XGBoost model exported to ONNX format and runs
// inference on feature vectors extracted from station telemetry.
//
// Architecture:
//   1. Try to load `onnxruntime-node` (server-side, best performance).
//   2. Fall back to `onnxruntime-web` (browser/edge runtime).
//   3. If neither is available, fall back to the heuristic scorer.
//
// The ONNX model expects a float32 tensor of shape [1, 6]:
//   [rainfall_10m, rainfall_1h, rainfall_24h, wl_current, wl_delta, road_elevation]
//
// The model outputs:
//   - `label` (int64): 0 = LOW, 1 = MEDIUM, 2 = HIGH
//   - `probabilities` (float32[3]): softmax scores per class
// ---------------------------------------------------------------------------

import type { StationTelemetry } from "@/types/telemetry";
import type {
  FloodEstimation,
  FloodFeatures,
  FloodDepthCategory,
  RiskLevel,
} from "@/types/flood-engine";
import { VEHICLE_CLEARANCE_CM } from "@/types/flood-engine";
import { extractFeatures } from "./heuristics";
import { calculateFloodRisk as heuristicFallback } from "./heuristics";

// ---------------------------------------------------------------------------
// ONNX Runtime dynamic import
// ---------------------------------------------------------------------------

/**
 * Minimal interface over the subset of onnxruntime APIs we actually use.
 * This lets us work with either `onnxruntime-node` or `onnxruntime-web`
 * without pulling in their full typings at compile time.
 */
interface OrtSession {
  run(feeds: Record<string, unknown>): Promise<Record<string, OrtTensor>>;
}

interface OrtTensor {
  data: Float32Array | Int32Array | BigInt64Array | number[];
  dims: number[];
}

interface OrtModule {
  InferenceSession: {
    create(
      pathOrBuffer: string | ArrayBuffer | Uint8Array,
      options?: Record<string, unknown>,
    ): Promise<OrtSession>;
  };
  Tensor: new (
    type: string,
    data: Float32Array | number[],
    dims: number[],
  ) => unknown;
}

// ---------------------------------------------------------------------------
// Singleton session cache
// ---------------------------------------------------------------------------

let cachedOrt: OrtModule | null = null;
let cachedSession: OrtSession | null = null;
let sessionLoadFailed = false;

/**
 * Attempt to dynamically load the ONNX Runtime module.
 * Tries `onnxruntime-node` first (server), then `onnxruntime-web` (browser).
 */
async function loadOrt(): Promise<OrtModule | null> {
  if (cachedOrt) return cachedOrt;

  // Attempt 1: server-side (Node.js)
  try {
    // Dynamic import — will throw if the package is not installed.
    // We use a variable to prevent Next.js/webpack from resolving at build time.
    const moduleName = "onnxruntime-node";
    cachedOrt = (await import(/* webpackIgnore: true */ moduleName)) as OrtModule;
    return cachedOrt;
  } catch {
    // Not available — try browser runtime
  }

  // Attempt 2: browser / edge
  try {
    const moduleName = "onnxruntime-web";
    cachedOrt = (await import(/* webpackIgnore: true */ moduleName)) as OrtModule;
    return cachedOrt;
  } catch {
    // Neither available
  }

  return null;
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------

/** Default path to the ONNX model file. */
const DEFAULT_MODEL_PATH = "public/models/xgboost_flood.onnx";

/**
 * Load (or retrieve from cache) an ONNX inference session.
 *
 * @param modelPath - Filesystem path or URL to the .onnx file.
 *                    Defaults to `public/models/xgboost_flood.onnx`.
 */
export async function getSession(
  modelPath: string = DEFAULT_MODEL_PATH,
): Promise<OrtSession | null> {
  if (cachedSession) return cachedSession;
  if (sessionLoadFailed) return null;

  const ort = await loadOrt();
  if (!ort) {
    console.warn(
      "[flood-engine/inference] ONNX runtime not available — " +
        "install onnxruntime-node or onnxruntime-web. " +
        "Falling back to heuristic scorer.",
    );
    sessionLoadFailed = true;
    return null;
  }

  try {
    cachedSession = await ort.InferenceSession.create(modelPath, {
      executionProviders: ["cpu"],
    });
    return cachedSession;
  } catch (err) {
    console.warn(
      "[flood-engine/inference] Failed to load ONNX model:",
      err instanceof Error ? err.message : err,
    );
    sessionLoadFailed = true;
    return null;
  }
}

/**
 * Reset the cached session.  Useful for tests or hot-swapping models.
 */
export function resetSession(): void {
  cachedSession = null;
  cachedOrt = null;
  sessionLoadFailed = false;
}

// ---------------------------------------------------------------------------
// Label mapping
// ---------------------------------------------------------------------------

const RISK_LABELS: RiskLevel[] = ["LOW", "MEDIUM", "HIGH"];

// ---------------------------------------------------------------------------
// Inference
// ---------------------------------------------------------------------------

/**
 * Build the 6-element feature vector expected by the ONNX model.
 *
 * Vector layout:
 *   [0] rainfall_10m    – mm
 *   [1] rainfall_1h     – mm
 *   [2] rainfall_24h    – mm
 *   [3] wl_current      – meters (EL.m)
 *   [4] wl_delta         – m/hr (rise rate)
 *   [5] road_elevation  – meters (EL.m)
 */
function buildFeatureVector(features: FloodFeatures): Float32Array {
  return new Float32Array([
    features.rainfall10m,
    features.rainfall1h,
    features.rainfall24h,
    features.waterLevelCurrent,
    features.waterLevelRiseRate,
    features.roadElevation,
  ]);
}

/**
 * Run ONNX-based flood risk inference.
 *
 * If the ONNX runtime or model is unavailable, transparently falls back
 * to the rule-based heuristic scorer — the caller always gets a valid
 * `FloodEstimation` regardless.
 *
 * @param telemetry           — merged station telemetry
 * @param roadElevationMeters — road surface elevation (EL.m)
 * @param modelPath           — optional override for the .onnx file location
 */
export async function predictFloodRisk(
  telemetry: StationTelemetry,
  roadElevationMeters: number,
  modelPath?: string,
): Promise<FloodEstimation> {
  // --- Feature engineering (shared with heuristics) ---
  const features = extractFeatures(telemetry, roadElevationMeters);
  const vector = buildFeatureVector(features);

  // --- Attempt ONNX inference ---
  const session = await getSession(modelPath);
  if (!session) {
    // Graceful fallback
    return heuristicFallback(telemetry, roadElevationMeters);
  }

  try {
    const ort = cachedOrt!;
    const inputTensor = new ort.Tensor("float32", vector, [1, 6]);

    const results = await session.run({ input: inputTensor });

    // --- Parse model outputs ---
    // XGBoost ONNX exports typically emit 'label' and 'probabilities'.
    const labelTensor = results["label"] ?? results["output_label"];
    const probTensor =
      results["probabilities"] ?? results["output_probability"];

    let riskLevel: RiskLevel;
    let riskScore: number;

    if (labelTensor && probTensor) {
      // Full model output available
      const labelIdx = Number(labelTensor.data[0]);
      riskLevel = RISK_LABELS[labelIdx] ?? "MEDIUM";

      // Derive a 0-100 score from class probabilities
      const probs = Array.from(probTensor.data as Float32Array);
      // Weighted expectation: 0×P(LOW) + 50×P(MED) + 100×P(HIGH)
      riskScore = Math.round(
        0 * (probs[0] ?? 0) + 50 * (probs[1] ?? 0) + 100 * (probs[2] ?? 0),
      );
    } else if (labelTensor) {
      // Label only — no probabilities
      const labelIdx = Number(labelTensor.data[0]);
      riskLevel = RISK_LABELS[labelIdx] ?? "MEDIUM";
      riskScore = labelIdx === 0 ? 15 : labelIdx === 1 ? 50 : 85;
    } else {
      // Unexpected output schema — fall back
      console.warn(
        "[flood-engine/inference] Unexpected model output keys:",
        Object.keys(results),
      );
      return heuristicFallback(telemetry, roadElevationMeters);
    }

    // --- Depth & vehicle assessment (uses rainfall-primary depth from features) ---
    const maxWaterDepthCm = features.estimatedDepthCm;
    const depthCategory = classifyDepthCategory(maxWaterDepthCm);
    const drivableBy = determineDrivableVehicles(maxWaterDepthCm);

    return {
      riskScore,
      riskLevel,
      maxWaterDepthCm,
      depthCategory,
      drivableBy,
      features,
    };
  } catch (err) {
    console.warn(
      "[flood-engine/inference] Inference error, falling back to heuristics:",
      err instanceof Error ? err.message : err,
    );
    return heuristicFallback(telemetry, roadElevationMeters);
  }
}

// ---------------------------------------------------------------------------
// Shared classification helpers (duplicated from heuristics to keep this
// module independently importable without circular deps)
// ---------------------------------------------------------------------------

function classifyDepthCategory(depthCm: number): FloodDepthCategory {
  if (depthCm >= 45) return "Waist Deep";
  if (depthCm >= 20) return "Half-Tire";
  if (depthCm >= 10) return "Gutter Deep";
  return "Passable";
}

function determineDrivableVehicles(depthCm: number): string[] {
  return Object.entries(VEHICLE_CLEARANCE_CM)
    .filter(([, clearance]) => clearance > depthCm)
    .map(([vehicle]) => vehicle);
}
