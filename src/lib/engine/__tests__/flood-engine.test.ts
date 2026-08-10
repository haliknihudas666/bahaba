// ---------------------------------------------------------------------------
// Bahaba – Flood Engine: Verification Tests & Edge Case Scenarios
//
// Run with:  npx tsx src/lib/engine/__tests__/flood-engine.test.ts
//
// These are self-contained assertion tests that verify the heuristic scorer
// against real-world flood scenarios calibrated to Metro Manila conditions.
//
// Architecture: Rainfall-Primary / Dual-Signal Model
// All depth estimates are derived from rainfall data (pluvial flooding).
// River water levels only add overflow bonus for roads near river gauges.
// ---------------------------------------------------------------------------

import { extractFeatures, calculateFloodRisk } from "../heuristics";
import { predictFloodRisk, resetSession } from "../inference";
import type { StationTelemetry } from "@/types/telemetry";
import type { FloodEstimation } from "@/types/flood-engine";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string): void {
  if (condition) {
    console.log(`  ✅  ${label}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${label}`);
    failed++;
  }
}

function assertRange(value: number, min: number, max: number, label: string): void {
  assert(
    value >= min && value <= max,
    `${label} — expected [${min}, ${max}], got ${value}`,
  );
}

function section(title: string): void {
  console.log(`\n${"─".repeat(60)}`);
  console.log(`  ${title}`);
  console.log(`${"─".repeat(60)}`);
}

// ---------------------------------------------------------------------------
// Factory: build StationTelemetry from partial overrides
// ---------------------------------------------------------------------------

function makeTelemetry(overrides?: {
  rain10min?: number;
  rain30min?: number;
  rain1hr?: number;
  rain3hr?: number;
  rain6hr?: number;
  rain12hr?: number;
  rain24hr?: number;
  currentLevel?: number;
  change30min?: number;
  change1hr?: number;
  change2hr?: number;
  alertLevel?: number | null;
  alarmLevel?: number | null;
  criticalLevel?: number | null;
  stationName?: string;
  latitude?: number | null;
  longitude?: number | null;
}): StationTelemetry {
  const o = overrides ?? {};
  return {
    stationName: o.stationName ?? "Test Station",
    latitude: o.latitude !== undefined ? o.latitude : 14.65,
    longitude: o.longitude !== undefined ? o.longitude : 121.05,
    rainfall: {
      stationName: o.stationName ?? "Test Station",
      rain10min: o.rain10min ?? 0,
      rain30min: o.rain30min ?? 0,
      rain1hr: o.rain1hr ?? 0,
      rain3hr: o.rain3hr ?? 0,
      rain6hr: o.rain6hr ?? 0,
      rain12hr: o.rain12hr ?? 0,
      rain24hr: o.rain24hr ?? 0,
    },
    waterLevel: {
      stationName: o.stationName ?? "Test Station",
      currentLevel: o.currentLevel ?? 10,
      change30min: o.change30min ?? 10,
      change1hr: o.change1hr ?? 10,
      change2hr: o.change2hr ?? 10,
      alertLevel: o.alertLevel !== undefined ? o.alertLevel : 12,
      alarmLevel: o.alarmLevel !== undefined ? o.alarmLevel : 14,
      criticalLevel: o.criticalLevel !== undefined ? o.criticalLevel : 16,
    },
    waterRiskLevel: "UNKNOWN",
    rainRiskLevel: "UNKNOWN",
    riskLevel: "UNKNOWN",
  };
}

// ---------------------------------------------------------------------------
// Scenario 1: Dry Day — Zero Risk
// ---------------------------------------------------------------------------

section("Scenario 1: Dry Day — No Rain, Normal Water Level");

(() => {
  const telemetry = makeTelemetry({
    rain1hr: 0,
    rain24hr: 0,
    currentLevel: 10, // well below alert (12)
    change1hr: 10,     // no change
  });

  const result = calculateFloodRisk(telemetry, 11);
  const features = extractFeatures(telemetry, 11);

  assert(features.soilSaturationIndex < 0.05, "SSI near zero when no rain");
  assert(features.waterLevelRiseRate === 0, "Rise rate is 0 with no change");
  assert(features.criticalProximity !== null && features.criticalProximity === 0,
    "Critical proximity 0 — water below alert level");
  assert(features.pluvialDepthCm === 0, "No pluvial depth — no rain");
  assert(features.estimatedDepthCm === 0, "No flooding — no rainfall runoff");
  assert(features.isNearRiver === false, "Not near river (default distance)");
  assert(result.riskLevel === "LOW", "Risk level is LOW");
  assert(result.maxWaterDepthCm === 0, "Zero depth");
  assert(result.depthCategory === "Passable", "Passable");
  assert(result.drivableBy.length === Object.keys(
    { sedan: 1, hatchback: 1, suv: 1, pickup: 1, truck: 1, bus: 1 },
  ).length, "All vehicles can pass");
})();

// ---------------------------------------------------------------------------
// Scenario 2: Steady Moderate Rain — Rainfall-Driven Depth
// ---------------------------------------------------------------------------

section("Scenario 2: Steady Moderate Rain — Rainfall-Driven Depth");

(() => {
  const telemetry = makeTelemetry({
    rain10min: 3,
    rain1hr: 15,       // orange-level rainfall
    rain24hr: 60,
    currentLevel: 12.5, // just above alert (12)
    change1hr: 12.0,    // rising 0.5 m/hr
    alertLevel: 12,
    criticalLevel: 16,
  });

  // Road at 4m elevation, not near river
  const result = calculateFloodRisk(telemetry, 4);
  const features = result.features;

  assertRange(features.soilSaturationIndex, 0.6, 0.75,
    "SSI moderate for 60mm 24h rain");
  assert(features.waterLevelRiseRate === 0.5,
    "Rise rate = 0.5 m/hr (12.5 − 12.0)");
  assert(features.isNearRiver === false,
    "Not near river (default infinite distance)");
  assert(features.pluvialDepthCm > 0,
    "Pluvial depth > 0 — rainfall exceeds drainage");
  assert(features.fluvialOverflowFactor === 0,
    "No fluvial overflow — not near river");
  assert(result.riskScore > 0,
    "Non-zero risk from rainfall");
})();

// ---------------------------------------------------------------------------
// Scenario 3: Flash Flood — Extreme Burst Rain
// ---------------------------------------------------------------------------

section("Scenario 3: Flash Flood — Extreme Burst (30mm in 10min)");

(() => {
  const telemetry = makeTelemetry({
    rain10min: 30,       // extreme intensity
    rain1hr: 50,         // torrential
    rain24hr: 50,        // all of it just started
    currentLevel: 15,    // approaching critical (16)
    change1hr: 13,       // jumped 2m in 1 hour
    alertLevel: 12,
    criticalLevel: 16,
  });

  const result = calculateFloodRisk(telemetry, 4);
  const features = result.features;

  assert(features.waterLevelRiseRate === 2,
    "Rise rate 2 m/hr — flash flood velocity");
  assertRange(features.criticalProximity!, 0.7, 0.8,
    "Critical proximity ~0.75 — near critical");
  assert(features.pluvialDepthCm > 0,
    "Significant pluvial depth from extreme rainfall");
  assert(features.fluvialOverflowFactor === 0,
    "No fluvial factor — not near river (default distance)");
  assert(result.riskLevel === "HIGH" || result.riskLevel === "MEDIUM",
    "High risk from extreme rainfall");
  // Depth now comes from rainfall, not river-road difference
  assert(result.maxWaterDepthCm > 0,
    "Non-zero depth from rainfall runoff");
})();

// ---------------------------------------------------------------------------
// Scenario 4: Post-Storm Receding — Water Dropping
// ---------------------------------------------------------------------------

section("Scenario 4: Post-Storm — Receding Water");

(() => {
  const telemetry = makeTelemetry({
    rain10min: 0,
    rain1hr: 2,         // drizzle
    rain24hr: 120,       // heavy rain earlier
    currentLevel: 11,    // back below alert
    change1hr: 12,       // was higher 1h ago
    alertLevel: 12,
    criticalLevel: 16,
  });

  const result = calculateFloodRisk(telemetry, 4);
  const features = result.features;

  assertRange(features.soilSaturationIndex, 0.88, 0.95,
    "SSI high — ground still saturated from 120mm");
  assert(features.waterLevelRiseRate === -1,
    "Negative rise rate — water receding (11 − 12 = −1)");
  assert(features.criticalProximity === 0,
    "Critical proximity 0 — below alert level, clamped");
  // With only 2mm/hr rain but high saturation, drainage is reduced
  // but 2mm/hr × 0.8 = 1.6mm which is below even reduced drainage
  assert(result.maxWaterDepthCm === 0,
    "No flooding — light rain within drainage capacity");
  assert(result.riskLevel === "LOW",
    "LOW risk — light rain, water receding");
})();

// ---------------------------------------------------------------------------
// Scenario 5: Missing Thresholds — Fallback Logic
// ---------------------------------------------------------------------------

section("Scenario 5: Missing PAGASA Thresholds — Fallback Scoring");

(() => {
  const telemetry = makeTelemetry({
    rain1hr: 25,
    rain24hr: 90,
    currentLevel: 14,
    change1hr: 13.5,
    alertLevel: null,
    alarmLevel: null,
    criticalLevel: null,
  });

  const result = calculateFloodRisk(telemetry, 4);
  const features = result.features;

  assert(features.criticalProximity === null,
    "Critical proximity null — no thresholds published");
  assert(result.riskScore > 0,
    "Non-zero risk score despite missing thresholds");
  assert(result.riskLevel !== undefined,
    "Still produces a valid risk level");
  // Depth should come from rainfall-based pluvial model
  assert(result.maxWaterDepthCm > 0,
    "Non-zero depth from 25mm/hr rainfall");
})();

// ---------------------------------------------------------------------------
// Scenario 6: No Water Level Data — Rainfall Only
// ---------------------------------------------------------------------------

section("Scenario 6: No Water Level Sensor — Rainfall Only");

(() => {
  const telemetry: StationTelemetry = {
    stationName: "Rain-Only Station",
    latitude: 14.65,
    longitude: 121.05,
    rainfall: {
      stationName: "Rain-Only Station",
      rain10min: 8,
      rain30min: 20,
      rain1hr: 35,
      rain3hr: 80,
      rain6hr: 120,
      rain12hr: 150,
      rain24hr: 180,
    },
    waterLevel: null,
    waterRiskLevel: "UNKNOWN",
    rainRiskLevel: "UNKNOWN",
    riskLevel: "UNKNOWN",
  };

  const result = calculateFloodRisk(telemetry, 4);
  const features = result.features;

  assert(features.waterLevelCurrent === 0,
    "Water level defaults to 0 when sensor missing");
  assert(features.waterLevelRiseRate === 0,
    "Rise rate 0 — no historical data");
  assertRange(features.soilSaturationIndex, 0.95, 1.0,
    "SSI near 1.0 — extreme 24h rain (180mm)");
  // KEY CHANGE: With the rainfall-primary model, this station should now
  // produce non-zero depth from its 35mm/hr rainfall intensity
  assert(result.maxWaterDepthCm > 0,
    "Non-zero depth from heavy rainfall (35mm/hr) — no longer needs water level");
  assert(features.pluvialDepthCm > 0,
    "Pluvial depth calculated from rainfall alone");
})();

// ---------------------------------------------------------------------------
// Scenario 7: Elevated Road — Flyover Above Flood
// ---------------------------------------------------------------------------

section("Scenario 7: Elevated Road (Flyover) — Above Flood");

(() => {
  const telemetry = makeTelemetry({
    rain1hr: 20,
    rain24hr: 80,
    currentLevel: 14,
    change1hr: 13,
    alertLevel: 12,
    criticalLevel: 16,
  });

  // Road is at 20m — high-elevation flyover
  // With rainfall-primary model, even flyovers get pluvial depth
  // (they still have road surface), but at high elevation there's
  // no low-elevation ponding bonus
  const result = calculateFloodRisk(telemetry, 20);

  assert(result.depthCategory === "Passable" || result.maxWaterDepthCm < 10,
    "Flyover has minimal flooding (no ponding bonus, good drainage)");
  assert(result.drivableBy.length > 0,
    "Vehicles OK on elevated road");
})();

// ---------------------------------------------------------------------------
// Scenario 8: ONNX Inference Fallback
// ---------------------------------------------------------------------------

section("Scenario 8: ONNX Inference — Graceful Fallback");

(async () => {
  resetSession(); // clear any cached session

  const telemetry = makeTelemetry({
    rain1hr: 10,
    rain24hr: 50,
    currentLevel: 13,
    change1hr: 12.5,
  });

  // No ONNX model file exists — should fall back to heuristics
  const result = await predictFloodRisk(telemetry, 4, "/nonexistent/model.onnx");

  assert(result.riskScore >= 0 && result.riskScore <= 100,
    "Valid risk score from fallback");
  assert(["LOW", "MEDIUM", "HIGH"].includes(result.riskLevel),
    "Valid risk level from fallback");
  assert(result.features !== undefined,
    "Features populated from fallback");
  // Depth now from pluvial model, not river-road difference
  assert(result.features.pluvialDepthCm >= 0,
    "Pluvial depth field populated");
})();

// ---------------------------------------------------------------------------
// Scenario 9: Inland Road + Heavy Rain — Pure Pluvial Flooding
// ---------------------------------------------------------------------------

section("Scenario 9: Inland Road (5km from river) + Heavy Rain");

(() => {
  const telemetry = makeTelemetry({
    rain10min: 15,
    rain1hr: 40,       // extreme rainfall
    rain24hr: 100,      // ground saturated
    currentLevel: 15,   // river is high, but road is far away
    change1hr: 14,
    alertLevel: 12,
    criticalLevel: 16,
  });

  // 5km from river — purely rainfall-driven
  const result = calculateFloodRisk(telemetry, 3, 5.0);
  const features = result.features;

  assert(features.isNearRiver === false,
    "Not in riverbank zone at 5km");
  assert(features.fluvialOverflowFactor === 0,
    "No fluvial contribution at 5km from river");
  assert(features.pluvialDepthCm > 0,
    "Significant pluvial depth from 40mm/hr rain on saturated ground");
  assert(result.maxWaterDepthCm > 0,
    "Non-zero flood depth from rainfall alone");
  assert(result.riskScore > 30,
    "Meaningful risk from heavy rainfall");
})();

// ---------------------------------------------------------------------------
// Scenario 10: Riverbank Road + River at CRITICAL — Fluvial + Pluvial
// ---------------------------------------------------------------------------

section("Scenario 10: Riverbank Road (200m from river) + River CRITICAL");

(() => {
  const telemetry = makeTelemetry({
    rain10min: 10,
    rain1hr: 25,       // heavy rain
    rain24hr: 80,
    currentLevel: 16,   // AT critical level
    change1hr: 15,      // rising 1m/hr
    alertLevel: 12,
    criticalLevel: 16,
  });

  // 200m from river — in riverbank zone
  const result = calculateFloodRisk(telemetry, 3, 0.2);
  const features = result.features;

  assert(features.isNearRiver === true,
    "In riverbank zone at 200m");
  assert(features.criticalProximity === 1.0,
    "At critical level — proximity = 1.0");
  assert(features.fluvialOverflowFactor > 0,
    "Non-zero fluvial overflow factor — river at critical");
  assert(features.pluvialDepthCm > 0,
    "Pluvial depth from rainfall");
  // Total depth = pluvial + fluvial bonus
  assert(result.maxWaterDepthCm > features.pluvialDepthCm,
    "Total depth exceeds pluvial-only — fluvial bonus applied");
})();

// ---------------------------------------------------------------------------
// Scenario 11: Low-Elevation Road — Ponding Multiplier
// ---------------------------------------------------------------------------

section("Scenario 11: Low-Elevation Road (2m EL.m) — Ponding Multiplier");

(() => {
  const telemetry = makeTelemetry({
    rain1hr: 20,
    rain24hr: 60,
  });

  // Road at 2m (below LOW_ELEVATION_THRESHOLD_M = 3.0)
  const resultLow = calculateFloodRisk(telemetry, 2);
  // Road at 5m (above threshold)
  const resultHigh = calculateFloodRisk(telemetry, 5);

  assert(resultLow.maxWaterDepthCm >= resultHigh.maxWaterDepthCm,
    "Low-elevation road has equal or greater depth due to ponding");
})();

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------

// Wait for async tests to complete
setTimeout(() => {
  console.log(`\n${"═".repeat(60)}`);
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log(`${"═".repeat(60)}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}, 500);
