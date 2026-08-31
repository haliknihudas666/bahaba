import {
  calculateRouteTraffic,
  evaluateVehiclePassability,
  evaluateRouteWalkability,
  segmentPolylineWithFloodRisk,
  VEHICLE_CONFIGS,
  type RouteSegmentData,
  type TravelMode,
} from "../routeSolver";
import type { LiveStation } from "@/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`❌ FAIL: ${message}`);
    process.exit(1);
  } else {
    console.log(`  ✅ ${message}`);
  }
}

console.log("\n🧪 Running Route Solver (Traffic, Clearance & Walkability) Test Suite...\n");

// 1. Vehicle Clearance Tests
console.log("── Test 1: Vehicle Clearance & Passability ──");
const sedanClear = evaluateVehiclePassability("sedan", 4);
assert(sedanClear.isPassable === true, "Sedan is passable at 4 cm");
assert(sedanClear.statusLevel === "SAFE", "Sedan status is SAFE at 4 cm");

const sedanCaution = evaluateVehiclePassability("sedan", 12);
assert(sedanCaution.isPassable === true, "Sedan is passable with caution at 12 cm");
assert(sedanCaution.statusLevel === "CAUTION", "Sedan status is CAUTION at 12 cm");

const sedanImpassable = evaluateVehiclePassability("sedan", 20);
assert(sedanImpassable.isPassable === false, "Sedan is impassable at 20 cm (>15cm limit)");
assert(sedanImpassable.statusLevel === "IMPASSABLE", "Sedan status is IMPASSABLE at 20 cm");

const suvPassableAt20 = evaluateVehiclePassability("suv", 20);
assert(suvPassableAt20.isPassable === true, "SUV is passable at 20 cm (<=25cm limit)");
assert(suvPassableAt20.statusLevel === "CAUTION", "SUV is CAUTION at 20 cm");

const motorImpassableAt14 = evaluateVehiclePassability("motorcycle", 14);
assert(motorImpassableAt14.isPassable === false, "Motorcycle is impassable at 14 cm (>12cm limit)");

const truckPassableAt35 = evaluateVehiclePassability("truck", 35);
assert(truckPassableAt35.isPassable === true, "Truck is passable at 35 cm (<=40cm limit)");

// 2. Traffic Delay & Speed Calculation Tests
console.log("\n── Test 2: Traffic Delay & Congestion Scoring ──");
const clearSegments: RouteSegmentData[] = [
  {
    coordinates: [[14.6, 121.0], [14.61, 121.01]],
    elevationM: 5,
    rainMmHr: 0,
    rain24hMm: 0,
    severity: "NORMAL",
    color: "#2563eb",
    depthCm: 0,
    depthCategory: "Normal / Clear",
    passableVehicles: ["All Vehicles"],
    hazardScore: 10,
    nearestStationName: "Test Station",
    nearestStationDistanceKm: 1,
    isStationInRadius: true,
    segmentDistanceKm: 1.0,
  },
];

// Test late night off-peak time (23:00 Manila time / 15:00 UTC)
const offPeakDate = new Date("2026-08-21T15:00:00Z");
const clearTrafficOffPeak = calculateRouteTraffic(3.0, 6, 0, clearSegments, offPeakDate);
assert(clearTrafficOffPeak.level === "SMOOTH", "Off-peak clear road maps to SMOOTH traffic");
assert(clearTrafficOffPeak.delayMin === 0, "No rush hour delay during late night off-peak");
assert(clearTrafficOffPeak.averageSpeedKmH >= 25, "Average speed remains fast for smooth traffic");

// Test evening peak rush hour (18:00 Manila time / 10:00 UTC)
const rushHourDate = new Date("2026-08-21T10:00:00Z");
const rushHourTraffic = calculateRouteTraffic(5.0, 11, 0, clearSegments, rushHourDate);
assert(rushHourTraffic.delayMin > 0, "Evening rush hour triggers congestion delay");
assert(rushHourTraffic.label.includes("Rush Hour"), "Traffic label identifies rush hour period");

// Test flooded segment with heavy rain and bottlenecks
const floodedSegments: RouteSegmentData[] = [
  {
    coordinates: [[14.6, 121.0], [14.61, 121.01]],
    elevationM: 2,
    rainMmHr: 25,
    rain24hMm: 60,
    severity: "ALARM",
    color: "#ef4444",
    depthCm: 22,
    depthCategory: "Half-Tire Deep",
    passableVehicles: ["SUV / Pickup"],
    hazardScore: 80,
    nearestStationName: "Test Station",
    nearestStationDistanceKm: 0.5,
    isStationInRadius: true,
    segmentDistanceKm: 2.0,
  },
];
const congestedTraffic = calculateRouteTraffic(5.0, 11, 22, floodedSegments, rushHourDate);
assert(congestedTraffic.level === "HEAVY" || congestedTraffic.level === "STANDSTILL", "22cm flood produces HEAVY or STANDSTILL traffic");
assert(congestedTraffic.delayMin > 5, "Flooded segments and rain introduce significant traffic delay");
assert(congestedTraffic.averageSpeedKmH < 20, "Average speed is reduced due to flooded crawl speed");
assert(congestedTraffic.breakdown?.floodDelayMin !== undefined && congestedTraffic.breakdown.floodDelayMin > 0, "Breakdown includes flood bottleneck delay");

// 3. Pedestrian Walkability & Realistic Walking Assessment Tests
console.log("\n── Test 3: Pedestrian Walkability & Realistic Walking Duration ──");
const dryWalkSegments: RouteSegmentData[] = [
  {
    coordinates: [[14.6, 121.0], [14.61, 121.01]],
    elevationM: 6,
    rainMmHr: 0,
    rain24hMm: 0,
    severity: "NORMAL",
    color: "#06b6d4",
    depthCm: 1,
    depthCategory: "Normal / Clear",
    passableVehicles: ["All Vehicles"],
    hazardScore: 5,
    nearestStationName: "Test Station",
    nearestStationDistanceKm: 2,
    isStationInRadius: true,
    segmentDistanceKm: 2.7,
    walkSlowdownFactor: 1.0,
  },
];

// 2.7 km walk at realistic ~4.5 km/h base speed
const realisticBaseWalkMin = Math.round((2.7 / 4.5) * 60); // 36 minutes
assert(realisticBaseWalkMin === 36, "2.7 km walk corresponds to 36 mins realistic pedestrian time (not 5 mins driving time)");

const dryWalk = evaluateRouteWalkability(2.7, realisticBaseWalkMin, 1, dryWalkSegments);
assert(dryWalk.isWalkable === true, "Dry road is 100% walkable");
assert(dryWalk.category === "WALKABLE_CLEAR", "Dry road maps to WALKABLE_CLEAR");
assert(dryWalk.score >= 90, "Dry road has walkability score >= 90");
assert(dryWalk.adjustedDurationMin === 36, "Adjusted duration matches realistic 36 mins for 2.7 km clear walk");
assert(dryWalk.wadingDelayMin === 0, "No wading delay on dry path");

const kneeDeepSegments: RouteSegmentData[] = [
  {
    coordinates: [[14.6, 121.0], [14.61, 121.01]],
    elevationM: 2,
    rainMmHr: 18,
    rain24hMm: 45,
    severity: "ALARM",
    color: "#f97316",
    depthCm: 20,
    depthCategory: "Half-Tire Deep",
    passableVehicles: ["SUV"],
    hazardScore: 70,
    nearestStationName: "Test Station",
    nearestStationDistanceKm: 0.3,
    isStationInRadius: true,
    segmentDistanceKm: 1.0,
    walkSlowdownFactor: 3.2,
  },
];
const kneeDeepWalk = evaluateRouteWalkability(1.0, 13, 20, kneeDeepSegments);
assert(kneeDeepWalk.category === "HAZARDOUS_WADING", "20cm depth maps to HAZARDOUS_WADING");
assert(kneeDeepWalk.hasLeptospirosisRisk === true, "Leptospirosis alert triggered at 20cm flood");
assert(kneeDeepWalk.hasManholeHazard === true, "Open manhole hazard triggered at 20cm flood");
assert(kneeDeepWalk.wadingDelayMin > 0, "Wading resistance adds delay to pedestrian travel");
assert(kneeDeepWalk.adjustedDurationMin > 13, "Adjusted walking duration includes wading & weather delays");
assert(kneeDeepWalk.recommendedGear.includes("High Rubber Boots (Bota)"), "High rubber boots recommended for wading");

const waistDeepSegments: RouteSegmentData[] = [
  {
    coordinates: [[14.6, 121.0], [14.61, 121.01]],
    elevationM: 1,
    rainMmHr: 35,
    rain24hMm: 120,
    severity: "CRITICAL",
    color: "#ef4444",
    depthCm: 38,
    depthCategory: "Waist Deep+",
    passableVehicles: ["Truck Only"],
    hazardScore: 95,
    nearestStationName: "River Station",
    nearestStationDistanceKm: 0.2,
    isStationInRadius: true,
    segmentDistanceKm: 1.0,
    walkSlowdownFactor: 5.0,
  },
];
const waistDeepWalk = evaluateRouteWalkability(1.0, 13, 38, waistDeepSegments);
assert(waistDeepWalk.isWalkable === false, "38cm depth is marked as NOT walkable / dangerous");
assert(waistDeepWalk.category === "IMPASSABLE_DANGEROUS", "38cm depth maps to IMPASSABLE_DANGEROUS");
assert(waistDeepWalk.score <= 20, "Critical flood depth yields very low walkability score");

// 4. Open-Meteo & PAGASA 3-Hour Rainfall Forecast & Flood Depth Projection
console.log("\n── Test 4: 3-Hour Rainfall Forecast & Projected Flood Progression ──");
import { predictProjectedFloodDepth } from "../floodPredictor";
import { computeRainfallTrend, computeConditionLabel } from "@/lib/geo/meteo-rainfall";

// Trend calculation tests
const worseningTrend = computeRainfallTrend(2.0, 8.0, 18.0, 25.0);
assert(worseningTrend === "WORSENING", "Increasing rainfall (+18mm, +25mm) is classified as WORSENING");

const improvingTrend = computeRainfallTrend(20.0, 5.0, 2.0, 0.0);
assert(improvingTrend === "IMPROVING", "Tapering rainfall is classified as IMPROVING");

const dryTrend = computeRainfallTrend(0.0, 0.0, 0.0, 0.0);
assert(dryTrend === "DRY", "Zero rainfall is classified as DRY");

// Condition label tests
const torrentialLabel = computeConditionLabel(30, 60, 35, "WORSENING");
assert(torrentialLabel === "Torrential Rain Alert", "Severe incoming rainfall generates Torrential Rain Alert");

// Projected Flood Depth tests
// Scenario A: Low-lying road (elev 2.0m, NOAH level 2) currently clear (2cm), but +35mm incoming in 3h
const projectedSevere = predictProjectedFloodDepth(2, 2, 35, 25, 2, 2.0, 25);
assert(
  projectedSevere > 15,
  `Incoming heavy rain (+35mm) projects flood depth escalation from 2cm to ${projectedSevere}cm (>15cm / High Risk)`
);

// Scenario B: Road currently flooded (20cm), but rain completely stops (0mm in 3h)
const projectedReceding = predictProjectedFloodDepth(20, 0, 0, 0, 0, 6.0, 25);
assert(
  projectedReceding < 20,
  `Dry forecast allows standing water to recede from 20cm down to ${projectedReceding}cm`
);

console.log("\n════════════════════════════════════════════════════════════");
console.log("  All Route Solver, Forecast & Walkability Tests Passed! ");
console.log("════════════════════════════════════════════════════════════\n");

