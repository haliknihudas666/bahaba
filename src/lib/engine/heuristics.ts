// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Flood Estimation Engine: Heuristic Scorer
//
// A deterministic, explainable scoring engine that converts raw PAGASA
// telemetry + road elevation into a road-level flood risk estimate.
//
// Architecture: Rainfall-Primary / Dual-Signal Model
// --------------------------------------------------
// Road surface flooding in Metro Manila is overwhelmingly caused by
// PLUVIAL flooding (rainfall exceeding drainage capacity), not by river
// overflow.  PAGASA river gauges measure river stage height which has
// little direct bearing on road conditions for inland roads.
//
// This engine uses rainfall data as the primary predictor for all roads,
// and only adds a river overflow bonus for roads within ~500m of a river
// gauge that has reached ALARM or CRITICAL level.
//
// Scoring weights (must sum to 1.0):
//   1. Soil Saturation Index      (weight: 0.25)
//   2. Rainfall Intensity         (weight: 0.35)
//   3. Pluvial Depth Score        (weight: 0.15)
//   4. Water Level Rise Rate      (weight: 0.10)  — dampened for inland roads
//   5. Critical Level Proximity   (weight: 0.15)  — dampened for inland roads
// ---------------------------------------------------------------------------

import type { StationTelemetry } from "@/types/telemetry";
import type {
  FloodEstimation,
  FloodFeatures,
  FloodDepthCategory,
  RiskLevel,
} from "@/types/flood-engine";
import { VEHICLE_CLEARANCE_CM } from "@/types/flood-engine";

// ---------------------------------------------------------------------------
// Tuning constants
// ---------------------------------------------------------------------------

/** Decay rate for the logistic soil saturation model. */
const SSI_DECAY_RATE = 0.019;

/**
 * Rainfall intensity thresholds (mm/hr) used by PAGASA's colour coding.
 *
 *  Yellow  : 2.5 - 7.5  mm/hr
 *  Orange  : 7.5 - 15   mm/hr
 *  Red     : 15 - 30    mm/hr
 *  Purple  : > 30       mm/hr
 *
 * We normalise against 30 mm/hr as the 1.0 ceiling.
 */
const RAINFALL_INTENSITY_CEILING_MM_HR = 30;

/**
 * Water-level rise rate ceiling for normalisation (m/hr).
 * Flash-flood studies in Philippine urban catchments show 0.5 m/hr
 * as an extreme rise rate; we use 0.3 m/hr as a conservative ceiling
 * so that typical heavy-rain rises (0.1–0.2 m/hr) score 0.33–0.67.
 */
const RISE_RATE_CEILING_M_HR = 0.3;

// ---------------------------------------------------------------------------
// Pluvial depth model constants
// ---------------------------------------------------------------------------

/**
 * Urban runoff coefficient — fraction of rainfall that becomes surface
 * runoff on impervious road surfaces (asphalt, concrete).
 * Range: 0.7–0.95 for dense urban; 0.8 is a Metro Manila average.
 */
const URBAN_RUNOFF_COEFFICIENT = 0.8;

/**
 * Base urban drainage capacity in mm/hr.
 * Metro Manila's storm drain network can handle ~10 mm/hr under ideal
 * conditions.  This is reduced by soil saturation.
 */
const BASE_DRAINAGE_CAPACITY_MM_HR = 10;

/**
 * Ponding multiplier for low-elevation roads (≤ 3m EL.m).
 * Low-lying areas like Malabon, Navotas, and Tondo accumulate runoff
 * from surrounding higher ground.
 */
const LOW_ELEVATION_PONDING_MULTIPLIER = 1.5;
const LOW_ELEVATION_THRESHOLD_M = 3.0;

/**
 * Conversion factor from net rainfall excess (mm) to road surface depth (cm).
 * 1 mm rainfall over 1 m² = 0.1 cm depth.  We use 0.15 to account for
 * lateral inflow from adjacent surfaces (gutters, sidewalks).
 */
const RAINFALL_TO_DEPTH_CM = 0.15;

// ---------------------------------------------------------------------------
// Fluvial overflow constants
// ---------------------------------------------------------------------------

/**
 * Maximum bonus depth (cm) added when a river reaches CRITICAL level
 * and the road is within the riverbank zone.
 */
const FLUVIAL_OVERFLOW_MAX_BONUS_CM = 20;

/**
 * Distance threshold (km) for riverbank overflow zone.
 * Roads beyond this distance from a river gauge are purely rainfall-driven.
 */
const RIVERBANK_ZONE_KM = 0.5;

// ---------------------------------------------------------------------------
// Scoring weights — must sum to 1.0
// ---------------------------------------------------------------------------

const WEIGHT_SSI = 0.25;
const WEIGHT_RAINFALL = 0.35;
const WEIGHT_PLUVIAL_DEPTH = 0.15;
const WEIGHT_RISE_RATE = 0.10;
const WEIGHT_CRITICAL_PROXIMITY = 0.15;

/** Risk-level bucket boundaries (inclusive). */
const RISK_THRESHOLD_MEDIUM = 34;
const RISK_THRESHOLD_HIGH = 67;

/** Depth-category breakpoints (cm). */
const DEPTH_GUTTER = 10;
const DEPTH_HALF_TIRE = 20;
const DEPTH_WAIST = 45;

/** Pluvial depth ceiling for score normalisation (cm). */
const PLUVIAL_DEPTH_CEILING_CM = 30;

// ---------------------------------------------------------------------------
// Feature Engineering
// ---------------------------------------------------------------------------

/**
 * Compute all intermediate features from raw station telemetry and the
 * known road-surface elevation.
 *
 * This is the core feature-engineering step shared between heuristic
 * scoring and ML inference.
 *
 * @param distanceToStationKm — optional distance from road to nearest
 *   station in km.  Used to determine riverbank zone membership.
 *   Defaults to Infinity (not near river).
 */
export function extractFeatures(
  telemetry: StationTelemetry,
  roadElevationMeters: number,
  distanceToStationKm: number = Infinity,
): FloodFeatures {
  const rain = telemetry.rainfall;
  const water = telemetry.waterLevel;

  // --- Rainfall features ---
  const rainfall24h = rain?.rain24hr ?? 0;
  const rainfall1h = rain?.rain1hr ?? 0;
  const rainfall10m = rain?.rain10min ?? 0;

  // Logistic soil saturation: SSI = 1 − e^(−k × rain24h)
  const soilSaturationIndex = 1 - Math.exp(-SSI_DECAY_RATE * rainfall24h);

  // --- Water level features (informational, not primary for depth) ---
  const waterLevelCurrent = water?.currentLevel ?? 0;

  // Rate of rise: Δ(current − 1h_ago) / 1 hr
  const level1hAgo = water?.change1hr ?? waterLevelCurrent;
  const waterLevelRiseRate = waterLevelCurrent - level1hAgo;

  // --- Critical-level proximity ---
  let criticalProximity: number | null = null;
  if (water && water.alertLevel !== null && water.criticalLevel !== null) {
    const alertLevel = water.alertLevel;
    const criticalLevel = water.criticalLevel;
    const range = criticalLevel - alertLevel;

    if (range > 0) {
      criticalProximity = clamp(
        (waterLevelCurrent - alertLevel) / range,
        0,
        1,
      );
    } else {
      criticalProximity = waterLevelCurrent >= criticalLevel ? 1 : 0;
    }
  }

  // --- Pluvial depth estimation (rainfall-driven) ---
  // Effective drainage = base capacity × (1 − SSI)
  // When soil is saturated (SSI→1), drainage drops to near zero.
  const effectiveDrainageMmHr =
    BASE_DRAINAGE_CAPACITY_MM_HR * (1 - soilSaturationIndex * 0.8);

  // Net rainfall excess = rainfall that can't be drained
  const netRainfallExcessMm = Math.max(
    0,
    rainfall1h * URBAN_RUNOFF_COEFFICIENT - effectiveDrainageMmHr,
  );

  // Convert to road surface depth (cm)
  let pluvialDepthCm = netRainfallExcessMm * RAINFALL_TO_DEPTH_CM;

  // Low-elevation ponding bonus
  if (roadElevationMeters <= LOW_ELEVATION_THRESHOLD_M) {
    pluvialDepthCm *= LOW_ELEVATION_PONDING_MULTIPLIER;
  }

  // Add burst-rain bonus from 10-minute intensity spike
  // If 10-min rain > 5mm, add extra ponding (drains can't keep up with bursts)
  if (rainfall10m > 5) {
    pluvialDepthCm += (rainfall10m - 5) * 0.2;
  }

  // --- Fluvial overflow factor (river-only, near-river roads only) ---
  const isNearRiver = distanceToStationKm <= RIVERBANK_ZONE_KM;
  let fluvialOverflowFactor = 0;

  if (isNearRiver && criticalProximity !== null && criticalProximity > 0.5) {
    // Scale from 0 at proximity=0.5 to 1.0 at proximity=1.0
    fluvialOverflowFactor = clamp((criticalProximity - 0.5) * 2, 0, 1);
  }

  // --- Combined depth ---
  const fluvialBonusCm = fluvialOverflowFactor * FLUVIAL_OVERFLOW_MAX_BONUS_CM;
  const estimatedDepthCm = Math.round(
    Math.max(0, pluvialDepthCm + fluvialBonusCm),
  );

  return {
    rainfall24h,
    rainfall1h,
    rainfall10m,
    soilSaturationIndex,
    waterLevelRiseRate,
    waterLevelCurrent,
    criticalProximity,
    roadElevation: roadElevationMeters,
    pluvialDepthCm: Math.round(Math.max(0, pluvialDepthCm) * 10) / 10,
    fluvialOverflowFactor,
    isNearRiver,
    estimatedDepthCm,
  };
}

// ---------------------------------------------------------------------------
// Heuristic Scoring
// ---------------------------------------------------------------------------

/**
 * Run the full heuristic flood-risk estimation pipeline.
 *
 * @param telemetry     — merged station telemetry from the scraper
 * @param roadElevationMeters — road surface elevation in meters (EL.m)
 * @param distanceToStationKm — distance from road centroid to nearest
 *   station (km).  Used for riverbank zone detection.
 * @returns              FloodEstimation with riskScore, riskLevel, depth, etc.
 */
export function calculateFloodRisk(
  telemetry: StationTelemetry,
  roadElevationMeters: number,
  distanceToStationKm: number = Infinity,
): FloodEstimation {
  const features = extractFeatures(
    telemetry,
    roadElevationMeters,
    distanceToStationKm,
  );

  // --- Sub-scores (each normalised 0-1) ---

  // 1. Soil saturation — already 0-1
  const ssiScore = features.soilSaturationIndex;

  // 2. Rainfall intensity — normalise 1h rainfall against ceiling
  const rainfallScore = clamp(
    features.rainfall1h / RAINFALL_INTENSITY_CEILING_MM_HR,
    0,
    1,
  );

  // 3. Pluvial depth score — normalise estimated road surface depth
  const pluvialDepthScore = clamp(
    features.pluvialDepthCm / PLUVIAL_DEPTH_CEILING_CM,
    0,
    1,
  );

  // 4. Rise rate — normalise against ceiling, clamped to [0, 1]
  //    Negative (receding) contributes 0.
  //    Dampened for inland roads (not near river).
  const riseRateRaw = clamp(
    features.waterLevelRiseRate / RISE_RATE_CEILING_M_HR,
    0,
    1,
  );
  const riseRateScore = features.isNearRiver ? riseRateRaw : riseRateRaw * 0.3;

  // 5. Critical proximity — when thresholds are unavailable, fall back to a
  //    rainfall-only proxy (rain24h > 100mm → high concern).
  //    Dampened for inland roads.
  let criticalScore: number;
  if (features.criticalProximity !== null) {
    criticalScore = features.isNearRiver
      ? features.criticalProximity
      : features.criticalProximity * 0.3;
  } else {
    criticalScore = clamp(features.rainfall24h / 100, 0, 1) * 0.5;
  }

  // --- Weighted composite ---
  const rawScore =
    WEIGHT_SSI * ssiScore +
    WEIGHT_RAINFALL * rainfallScore +
    WEIGHT_PLUVIAL_DEPTH * pluvialDepthScore +
    WEIGHT_RISE_RATE * riseRateScore +
    WEIGHT_CRITICAL_PROXIMITY * criticalScore;

  // Scale to 0-100
  const riskScore = Math.round(clamp(rawScore * 100, 0, 100));

  // --- Classification ---
  const riskLevel = classifyRiskLevel(riskScore);
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
}

// ---------------------------------------------------------------------------
// Classification helpers
// ---------------------------------------------------------------------------

function classifyRiskLevel(score: number): RiskLevel {
  if (score >= RISK_THRESHOLD_HIGH) return "HIGH";
  if (score >= RISK_THRESHOLD_MEDIUM) return "MEDIUM";
  return "LOW";
}

function classifyDepthCategory(depthCm: number): FloodDepthCategory {
  if (depthCm >= DEPTH_WAIST) return "Waist Deep";
  if (depthCm >= DEPTH_HALF_TIRE) return "Half-Tire";
  if (depthCm >= DEPTH_GUTTER) return "Gutter Deep";
  return "Passable";
}

/**
 * Determine which vehicle types can still traverse the estimated flood depth.
 */
function determineDrivableVehicles(depthCm: number): string[] {
  return Object.entries(VEHICLE_CLEARANCE_CM)
    .filter(([, clearance]) => clearance > depthCm)
    .map(([vehicle]) => vehicle);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
