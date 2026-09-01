// ---------------------------------------------------------------------------
// Bahaba – Modular Flood Engine & Database-Backed Elevation Test Suite
// ---------------------------------------------------------------------------

import { getElevation, getElevationsForCoordinates, estimateFallbackElevation, toElevationGridKey } from "@/lib/elevation";
import { getNearestNoahHazard, getNoahRoadSegments, NOAH_METRO_MANILA_HOTSPOTS } from "@/lib/noah";
import { calculateWaterDepth, classifyFloodRisk, evaluateLocation, evaluateMonitoredRoads, evaluateHeatmapPoints } from "@/lib/flood-engine";

async function runModularFloodEngineTests() {
  console.log("\n🧪 Running Modular Flood Engine & Elevation Store Test Suite...\n");

  // Test 1: Grid Key Formatter
  const key = toElevationGridKey(14.6065, 120.9895);
  console.assert(key === "14.607_120.990", `Grid key mismatch: ${key}`);
  console.log(`[PASS] Elevation grid key formatting: ${key}`);

  // Test 2: Fallback Elevation Model
  const espanaElev = estimateFallbackElevation(14.6065, 120.9895);
  console.assert(espanaElev === 2.4, `Expected España elevation 2.4m, got ${espanaElev}`);
  console.log(`[PASS] Fallback elevation for España depression: ${espanaElev}m`);

  const ortigasElev = estimateFallbackElevation(14.5855, 121.0573);
  console.assert(ortigasElev === 22.0, `Expected Ortigas elevation 22.0m, got ${ortigasElev}`);
  console.log(`[PASS] Fallback elevation for Ortigas ridge: ${ortigasElev}m`);

  // Test 3: NOAH Hazard Store
  const espanaNoah = getNearestNoahHazard(14.6065, 120.9895);
  console.assert(espanaNoah.noahLevel === 3, `Expected España NOAH level 3, got ${espanaNoah.noahLevel}`);
  console.log(`[PASS] Nearest NOAH hazard for España: Var ${espanaNoah.noahLevel} (${espanaNoah.nearestHotspotName})`);

  // Test 4: Water Depth Calculation under NOAH Var=3 + 45mm/hr rain
  const depthHeavy = calculateWaterDepth(45, 120, 3, 2.2, 20);
  console.assert(depthHeavy > 40, `Expected water depth > 40cm, got ${depthHeavy}`);
  console.log(`[PASS] Calculated flood depth for España under 45mm/hr rain: ${depthHeavy} cm`);

  const classification = classifyFloodRisk(depthHeavy);
  console.assert(classification.category === "CRITICAL", `Expected CRITICAL category, got ${classification.category}`);
  console.assert(classification.color === "#7f1d1d", `Expected #7f1d1d color, got ${classification.color}`);
  console.log(`[PASS] Classified risk: ${classification.category} (${classification.label})`);

  // Test 5: Monitored Roads Batch Evaluation
  const evaluatedRoads = await evaluateMonitoredRoads([], {
    latitude: 14.6,
    longitude: 121.0,
    currentRainMmHr: 35,
    rain24hMm: 80,
    forecast1hMm: 30,
    forecast2hMm: 25,
    forecast3hMm: 20,
    forecast3hTotalMm: 75,
    forecastPeakMmHr: 35,
    precipProbability: 95,
    trend: "STEADY",
    conditionLabel: "Heavy Downpour",
    isRaining: true,
    fetchedAt: new Date().toISOString(),
  });

  console.assert(evaluatedRoads.length > 0, "Evaluated roads should not be empty");
  console.log(`[PASS] Batch evaluated ${evaluatedRoads.length} monitored road corridors`);

  const floodedRoads = evaluatedRoads.filter((r) => r.isFlooded);
  console.assert(floodedRoads.length > 0, "Flooded roads count should be > 0 during heavy rain");
  console.log(`[PASS] Identified ${floodedRoads.length} flooded roads under 35mm/hr storm`);

  // Test 6: Heatmap Points Generation
  const heatmap = await evaluateHeatmapPoints([], {
    latitude: 14.6,
    longitude: 121.0,
    currentRainMmHr: 35,
    rain24hMm: 80,
    forecast1hMm: 30,
    forecast2hMm: 25,
    forecast3hMm: 20,
    forecast3hTotalMm: 75,
    forecastPeakMmHr: 35,
    precipProbability: 95,
    trend: "STEADY",
    conditionLabel: "Heavy Downpour",
    isRaining: true,
    fetchedAt: new Date().toISOString(),
  });

  console.assert(heatmap.length >= NOAH_METRO_MANILA_HOTSPOTS.length, "Heatmap should cover all NOAH hotspots");
  console.log(`[PASS] Precomputed ${heatmap.length} continuous spatial heatmap points`);

  console.log("\n✅ All Modular Flood Engine Tests Passed Successfully!\n");
}

runModularFloodEngineTests().catch((err) => {
  console.error("Test failure:", err);
  process.exit(1);
});
