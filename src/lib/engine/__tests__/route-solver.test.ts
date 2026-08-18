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
    depthCm: 2,
    depthCategory: "Normal / Clear",
    passableVehicles: ["All Vehicles"],
    hazardScore: 10,
    nearestStationName: "Test Station",
    nearestStationDistanceKm: 1,
    segmentDistanceKm: 1.0,
  },
];
const clearTraffic = calculateRouteTraffic(3.0, 6, 2, clearSegments);
assert(clearTraffic.level === "SMOOTH", "0-2cm flood maps to SMOOTH traffic");
assert(clearTraffic.delayMin === 0, "No traffic delay on clear dry road");
assert(clearTraffic.averageSpeedKmH >= 25, "Average speed remains standard for smooth traffic");

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
    segmentDistanceKm: 2.0,
  },
];
const congestedTraffic = calculateRouteTraffic(5.0, 10, 22, floodedSegments);
assert(congestedTraffic.level === "HEAVY" || congestedTraffic.level === "STANDSTILL", "22cm flood produces HEAVY or STANDSTILL traffic");
assert(congestedTraffic.delayMin > 0, "Flooded segments introduce traffic delay");
assert(congestedTraffic.averageSpeedKmH < 20, "Average speed is reduced due to flooded crawl speed");

// 3. Pedestrian Walkability & Wading Assessment Tests
console.log("\n── Test 3: Pedestrian Walkability & Flood Wading ──");
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
    segmentDistanceKm: 1.0,
    walkSlowdownFactor: 1.0,
  },
];
const dryWalk = evaluateRouteWalkability(1.0, 12, 1, dryWalkSegments);
assert(dryWalk.isWalkable === true, "Dry road is 100% walkable");
assert(dryWalk.category === "WALKABLE_CLEAR", "Dry road maps to WALKABLE_CLEAR");
assert(dryWalk.score >= 90, "Dry road has walkability score >= 90");
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
    segmentDistanceKm: 1.0,
    walkSlowdownFactor: 2.4,
  },
];
const kneeDeepWalk = evaluateRouteWalkability(1.0, 12, 20, kneeDeepSegments);
assert(kneeDeepWalk.category === "HAZARDOUS_WADING", "20cm depth maps to HAZARDOUS_WADING");
assert(kneeDeepWalk.hasLeptospirosisRisk === true, "Leptospirosis alert triggered at 20cm flood");
assert(kneeDeepWalk.hasManholeHazard === true, "Open manhole hazard triggered at 20cm flood");
assert(kneeDeepWalk.wadingDelayMin > 0, "Wading resistance adds delay to pedestrian travel");
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
    segmentDistanceKm: 1.0,
    walkSlowdownFactor: 4.0,
  },
];
const waistDeepWalk = evaluateRouteWalkability(1.0, 12, 38, waistDeepSegments);
assert(waistDeepWalk.isWalkable === false, "38cm depth is marked as NOT walkable / dangerous");
assert(waistDeepWalk.category === "IMPASSABLE_DANGEROUS", "38cm depth maps to IMPASSABLE_DANGEROUS");
assert(waistDeepWalk.score <= 20, "Critical flood depth yields very low walkability score");

console.log("\n════════════════════════════════════════════════════════════");
console.log("  All Route Solver & Walkability Tests Passed Successfully! ");
console.log("════════════════════════════════════════════════════════════\n");
