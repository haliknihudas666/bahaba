import {
  interpolateRainfall,
  estimateInundationAtLocation,
  generateFloodHeatmapPoints,
  METRO_MANILA_FLOOD_HOTSPOTS,
} from "../liveFloodGrid";
import type { LiveStation } from "@/types";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`[FAIL] ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function runLiveFloodGridTests() {
  console.log("\n🧪 Running Live Flood Grid & Heatmap Interpolation Test Suite...\n");

  const mockStations: LiveStation[] = [
    {
      stationId: "st-marikina",
      stationName: "Sto. Niño Marikina",
      latitude: 14.6465,
      longitude: 121.101,
      geohash: "wdw5",
      rain10m: 10,
      rain1h: 40,
      rain24h: 110,
      waterLevel: 17.5,
      waterLevelDelta1h: 0.8,
      waterRiskLevel: "CRITICAL",
      rainRiskLevel: "CRITICAL",
      riskLevel: "CRITICAL",
      lastUpdated: new Date(),
    },
    {
      stationId: "st-napindan",
      stationName: "Napindan Pasig",
      latitude: 14.545,
      longitude: 121.085,
      geohash: "wdw4",
      rain10m: 2,
      rain1h: 10,
      rain24h: 30,
      waterLevel: 12.2,
      waterLevelDelta1h: 0.1,
      waterRiskLevel: "NORMAL",
      rainRiskLevel: "NORMAL",
      riskLevel: "NORMAL",
      lastUpdated: new Date(),
    },
  ];

  // Test 1: IDW Rainfall Interpolation close to Marikina Station
  const marikinaInterp = interpolateRainfall(14.648, 121.102, mockStations, 5, 10);
  assert(
    marikinaInterp.rain1h > 35,
    `Point close to Marikina station receives ~40 mm/hr (computed: ${marikinaInterp.rain1h} mm/hr)`
  );
  assert(
    marikinaInterp.riverAlertWeight > 0.8,
    `Point close to Marikina receives high river alert weight (computed: ${marikinaInterp.riverAlertWeight})`
  );

  // Test 2: IDW Rainfall Interpolation at midpoint between Marikina and Napindan
  const midInterp = interpolateRainfall(14.595, 121.093, mockStations, 0, 0);
  assert(
    midInterp.rain1h >= 10 && midInterp.rain1h <= 40,
    `Midpoint rainfall is smoothly blended between stations (${midInterp.rain1h} mm/hr)`
  );

  // Test 3: Spatial Inundation Estimate under heavy rain on España Blvd
  const espanaEstimate = estimateInundationAtLocation(
    14.6065,
    120.9895,
    mockStations,
    45, // 45 mm/hr local rain
    100 // 100 mm 24h
  );
  assert(
    espanaEstimate.estimatedDepthCm > 30,
    `España Blvd under 45mm/hr rain yields depth > 30 cm (calculated: ${espanaEstimate.estimatedDepthCm} cm)`
  );
  assert(
    espanaEstimate.riskCategory === "CRITICAL",
    `España Blvd risk category is CRITICAL (${espanaEstimate.riskCategory})`
  );
  assert(
    espanaEstimate.riskIntensity > 0.6,
    `España Blvd risk intensity is high (${espanaEstimate.riskIntensity})`
  );

  // Test 4: Spatial Inundation Estimate in Dry Weather
  const dryEstimate = estimateInundationAtLocation(
    14.550,
    121.050,
    [], // No active station alerts
    0,  // 0 mm/hr rain
    0
  );
  assert(
    dryEstimate.estimatedDepthCm === 0,
    `Dry weather produces 0 cm depth (computed: ${dryEstimate.estimatedDepthCm} cm)`
  );
  assert(
    dryEstimate.riskCategory === "NORMAL",
    `Dry weather maps to NORMAL (${dryEstimate.riskCategory})`
  );

  // Test 5: Heatmap Points Generation
  const heatmapPoints = generateFloodHeatmapPoints(mockStations, 25, 60);
  assert(
    heatmapPoints.length >= METRO_MANILA_FLOOD_HOTSPOTS.length,
    `Generated ${heatmapPoints.length} heatmap points covering all flood hotspots & stations`
  );
  const criticalPoints = heatmapPoints.filter((p) => p.category === "CRITICAL");
  assert(
    criticalPoints.length > 0,
    `Identified ${criticalPoints.length} active critical flood hotspots during heavy rain`
  );

  console.log("\n✅ All Live Flood Grid & Heatmap Interpolation Tests Passed Successfully!\n");
}

runLiveFloodGridTests();
