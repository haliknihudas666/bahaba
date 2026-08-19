// ---------------------------------------------------------------------------
// Bahaba – Spatial Risk Matcher Unit Tests (Rainfall-Primary Model)
// ---------------------------------------------------------------------------

import {
  calculateLineCentroid,
  calculateHaversineDistance,
  classifySeverity,
  calculateRoadRisk,
  SEVERITY_RULES,
  type GeoJSONLineStringFeature,
} from "../roadRisk";
import type { LiveStation } from "@/types";

// Helper assertion runner
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function runRoadRiskTests() {
  console.log("\n🧪 Running Spatial Risk Matcher (roadRisk.ts) Test Suite — Rainfall-Primary Model...\n");

  // Test 1: Centroid Calculation
  const sampleLineString: GeoJSONLineStringFeature = {
    type: "Feature",
    properties: { name: "España Blvd", elevation: 2.2 },
    geometry: {
      type: "LineString",
      coordinates: [
        [120.9850, 14.6065],
        [120.9950, 14.6135],
      ],
    },
  };

  const centroid = calculateLineCentroid(sampleLineString.geometry.coordinates);
  assert(
    Math.abs(centroid[0] - 14.61) < 0.01 && Math.abs(centroid[1] - 120.99) < 0.01,
    `Calculates accurate centroid: [${centroid[0].toFixed(4)}, ${centroid[1].toFixed(4)}]`
  );

  // Test 2: Haversine Distance
  // Distance between UST (14.608, 120.989) and Sto. Niño Marikina (14.633, 121.095) is ~11.5 km
  const distKm = calculateHaversineDistance(14.608, 120.989, 14.633, 121.095);
  assert(
    distKm > 10 && distKm < 13,
    `Haversine distance calculation is accurate (~${distKm.toFixed(2)} km)`
  );

  // Test 3: Color & Severity Mapping Rules
  const normalRes = classifySeverity(4);
  assert(
    normalRes.severity === "NORMAL" && normalRes.hex === "#00b4d8" && normalRes.weight === 3,
    `0-5 cm maps to NORMAL (#00b4d8, weight: 3)`
  );

  const alertRes = classifySeverity(10);
  assert(
    alertRes.severity === "ALERT" && alertRes.hex === "#f97316" && alertRes.weight === 4,
    `6-15 cm maps to ALERT (#f97316, weight: 4)`
  );

  const alarmRes = classifySeverity(25);
  assert(
    alarmRes.severity === "ALARM" && alarmRes.hex === "#ef4444" && alarmRes.weight === 5,
    `16-30 cm maps to ALARM (#ef4444, weight: 5)`
  );

  const criticalRes = classifySeverity(45);
  assert(
    criticalRes.severity === "CRITICAL" && criticalRes.hex === "#7f1d1d" && criticalRes.weight === 6,
    `>30 cm maps to CRITICAL (#7f1d1d, weight: 6)`
  );

  // Test 4: Road Risk — Inland Road with Heavy Rain
  // España Blvd is ~11.5 km from Sto. Niño station (river gauge).
  // With the rainfall-primary model, risk should come from the 45mm/hr
  // rainfall, NOT from the 18.5m river water level vs 2.2m road elevation.
  const mockStations: LiveStation[] = [
    {
      stationId: "sto-nino",
      stationName: "Sto. Niño",
      latitude: 14.633,
      longitude: 121.095,
      geohash: "",
      rain10m: 12,
      rain1h: 45, // Heavy rainfall rate
      rain24h: 180,
      waterLevel: 18.5, // High river level — should NOT directly affect inland road
      waterLevelDelta1h: 0.8,
      waterRiskLevel: "CRITICAL",
      rainRiskLevel: "CRITICAL",
      riskLevel: "CRITICAL",
      lastUpdated: new Date(),
    },
    {
      stationId: "nangka",
      stationName: "Nangka",
      latitude: 14.665,
      longitude: 121.105,
      geohash: "",
      rain10m: 2,
      rain1h: 5,
      rain24h: 20,
      waterLevel: 14.0,
      waterLevelDelta1h: 0.0,
      waterRiskLevel: "NORMAL",
      rainRiskLevel: "NORMAL",
      riskLevel: "NORMAL",
      lastUpdated: new Date(),
    },
  ];

  const roadRisk = calculateRoadRisk(sampleLineString, mockStations);

  assert(
    roadRisk.roadName === "España Blvd",
    `Matches correct road name (${roadRisk.roadName})`
  );
  assert(
    roadRisk.nearestStation.stationName === "Sto. Niño",
    `Identifies nearest station (${roadRisk.nearestStation.stationName})`
  );
  // Key test: España is ~11.5km from river, so NOT in riverbank zone
  assert(
    roadRisk.isNearRiver === false,
    `España Blvd is NOT in riverbank zone (${roadRisk.nearestStation.distanceKm} km away)`
  );
  // Severity should come from rainfall, not river level differential
  // With distance decay e^(-11.5/6) ≈ 0.15, effective rain1h ≈ 6.6 mm/hr
  // This is moderate but may not cause deep flooding at distance
  assert(
    roadRisk.estimatedDepthCm < 100,
    `Depth is reasonable for rainfall-driven estimate (${roadRisk.estimatedDepthCm} cm), NOT 1600+ cm from river height`
  );
  assert(
    roadRisk.drivableVehicles.length > 0,
    `Provides drivable vehicle recommendations (${roadRisk.drivableVehicles.join(", ")})`
  );

  // Test 5: Road directly next to a river gauge at CRITICAL
  const riverbankRoad: GeoJSONLineStringFeature = {
    type: "Feature",
    properties: { name: "Riverbank Drive", elevation: 3.0 },
    geometry: {
      type: "LineString",
      coordinates: [
        [121.094, 14.632],  // ~100m from Sto. Niño station
        [121.096, 14.634],
      ],
    },
  };

  const riverbankRisk = calculateRoadRisk(riverbankRoad, mockStations);
  assert(
    riverbankRisk.isNearRiver === true,
    `Riverbank Drive IS in riverbank zone (${riverbankRisk.nearestStation.distanceKm} km)`
  );
  // Test 6: DPWH National Highway Route Metadata Propagation
  const nationalHighwayFeature: GeoJSONLineStringFeature = {
    type: "Feature",
    properties: {
      name: "MacArthur Hwy / N2 (Apalit - Sto. Tomas - San Fernando Pampanga Basin)",
      elevation: 2.8,
      nationalRoute: "N2",
      roadClassification: "Primary National",
      region: "Region III (Central Luzon)",
      description: "Manila North Road / Major Pampanga River flood basin"
    },
    geometry: {
      type: "LineString",
      coordinates: [
        [120.7612, 14.9452],
        [120.6865, 15.0345]
      ]
    }
  };

  const nationalRisk = calculateRoadRisk(nationalHighwayFeature, mockStations);
  assert(
    nationalRisk.nationalRoute === "N2",
    `Propagates DPWH national route (${nationalRisk.nationalRoute})`
  );
  assert(
    nationalRisk.roadClassification === "Primary National",
    `Propagates DPWH classification (${nationalRisk.roadClassification})`
  );
  assert(
    nationalRisk.region === "Region III (Central Luzon)",
    `Propagates region tag (${nationalRisk.region})`
  );

  console.log("\n✅ All Spatial Risk Matcher Unit Tests Passed Successfully!\n");
}

runRoadRiskTests();
