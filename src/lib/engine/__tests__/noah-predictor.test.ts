import {
  calculateWaterDepth,
  classifyFloodRisk,
  predictRoadFloodRisk,
} from "../floodPredictor";
import { getRoadsInBBox, isRoadInBBox } from "@/lib/geo/getRoadsInBBox";
import type { NoahRoadSegment } from "@/types/flood-engine";


function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function runNoahPredictorTests() {
  console.log("\n🧪 Running NOAH Offline Inundation & Risk Engine Test Suite...\n");

  // Test 1: Water Depth Formula - Baseline / Dry Weather (0 mm/hr, high elevation 14m, level 1 hazard)
  // New model: 0 rain → 0 activation → NOAH hazard contributes 0 cm
  // Net Rain = max(0, 0 - 25) = 0
  // Activation = clamp(0/60, 0, 1) = 0 → hazardContribution = 15 * 0 = 0
  // Elev Factor = 14 * 0.5 = 7 → rawDepth = 0 + 0 - 7 = -7 → 0 cm
  const dryDepth = calculateWaterDepth(0, 0, 1, 14.0, 25);
  assert(dryDepth === 0, `Dry weather returns 0 cm standing water depth (calculated: ${dryDepth} cm)`);

  // Test 2: Water Depth Formula - Heavy Rain on Low Elevation España Blvd (45 mm/hr rain, 2.2m elevation, Level 3 Hazard)
  // New model: rainfall activation = clamp(45/60, 0, 1) = 0.75
  // NOAH Level 3 max depth = 80 cm → contribution = 80 * 0.75 = 60 cm
  // Net Rain = max(0, 45 - 25) = 20
  // Elev Factor = 2.2 * 0.5 = 1.1
  // Total Depth = 20 + 60 - 1.1 = 78.9 cm
  const espanaDepth = calculateWaterDepth(45, 0, 3, 2.2, 25);
  assert(
    Math.abs(espanaDepth - 78.9) < 0.2,
    `España Blvd heavy rain (45mm/hr, elev 2.2m, level 3) computes ~78.9 cm depth (calculated: ${espanaDepth} cm)`
  );

  // Test 3: Risk Classification Mapping
  const normalClass = classifyFloodRisk(3);
  assert(normalClass.category === "NORMAL" && normalClass.color === "#00b4d8", "3 cm maps to NORMAL (#00b4d8)");

  const lowClass = classifyFloodRisk(10);
  assert(lowClass.category === "LOW" && lowClass.color === "#f97316", "10 cm maps to LOW (#f97316 / Gutter Deep)");

  const highClass = classifyFloodRisk(22);
  assert(highClass.category === "HIGH" && highClass.color === "#ef4444", "22 cm maps to HIGH (#ef4444 / Half-Tire Deep)");

  const criticalClass = classifyFloodRisk(40);
  assert(criticalClass.category === "CRITICAL" && criticalClass.color === "#7f1d1d", "40 cm maps to CRITICAL (#7f1d1d / Waist Deep)");

  // Test 4: Spatial Bounding Box Filter (España vs Marikina vs Outside BBox)
  const espanaRoad: NoahRoadSegment = {
    id: "test-espana",
    name: "España Blvd",
    coordinates: [
      [120.985, 14.6065],
      [120.995, 14.6135],
    ],
    elevationM: 2.2,
    noahHazardLevel: 3,
    drainageCapacity: 25,
  };

  const manilaBBox: [number, number, number, number] = [14.59, 120.97, 14.63, 121.01]; // [south, west, north, east]
  const isEspanaInManila = isRoadInBBox(espanaRoad, manilaBBox);
  assert(isEspanaInManila === true, "España Blvd correctly identified inside Manila viewport BBox");

  const cebuBBox: [number, number, number, number] = [10.2, 123.8, 10.4, 124.0];
  const isEspanaInCebu = isRoadInBBox(espanaRoad, cebuBBox);
  assert(isEspanaInCebu === false, "España Blvd correctly excluded from Cebu viewport BBox");

  // Test 5: Local Dataset Query Utility
  const queryResult = getRoadsInBBox(manilaBBox);
  assert(queryResult.length > 0, `getRoadsInBBox returned ${queryResult.length} road segments inside Manila viewport`);

  // Test 6: Full Predictor Integration (50 mm/hr, 20mm 24h acc, hazard 3)
  // activation = clamp(50/60, 0, 1) = 0.8333 → contribution = 80 * 0.8333 ≈ 66.7
  // netRain = max(0, 52 - 25) = 27 → depth ≈ 27 + 66.7 - 1.1 = 92.6 cm → CRITICAL
  const fullPred = predictRoadFloodRisk(espanaRoad, 50, 20);
  assert(fullPred.roadName === "España Blvd", `Predictor retains road name (${fullPred.roadName})`);
  assert(fullPred.waterDepthCm > 30, `Calculated depth ${fullPred.waterDepthCm} cm > 30 cm`);
  assert(fullPred.riskCategory === "CRITICAL", `Risk category is CRITICAL`);

  console.log("\n✅ All NOAH Offline Inundation & Risk Engine Tests Passed Successfully!\n");
}

runNoahPredictorTests();
