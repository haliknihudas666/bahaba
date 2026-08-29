// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – OSRM Routing Engine & 4-Step Flood Predictor
//
// Step 1: Get Directions (Point A -> Point B via OSRM Driving or Walking)
// Step 2: Check Elevations along route segments (Open-Meteo DEM API)
// Step 3: Check Rainfall mm/hr & 24h accumulation from nearby weather telemetry (PAGASA + Panahon AWS)
// Step 4: Calculate standing water depth, traffic conditions, vehicle clearance, and pedestrian walkability
// ---------------------------------------------------------------------------

import type { LiveStation } from "@/types";
import { getElevationsForCoordinates } from "@/lib/geo/elevation";
import {
  calculateHaversineDistance,
  classifySeverity,
  MAX_PAGASA_RAIN_RADIUS_KM,
  MAX_PAGASA_WATER_LEVEL_RADIUS_KM,
  RIVERBANK_ZONE_KM,
  isRiverGaugeStation,
  type RoadSeverity,
} from "./roadRisk";
import {
  calculateWaterDepth,
  classifyFloodRisk,
  predictProjectedFloodDepth,
} from "./floodPredictor";
import {
  batchFetchDistrictRainfall,
  toGridKey,
  computeConditionLabel,
  type DistrictRainfall,
  type RainfallTrend,
} from "@/lib/geo/meteo-rainfall";

export type TravelMode = "driving" | "walking";

export type VehicleType = "all" | "sedan" | "suv" | "motorcycle" | "truck";

export interface VehicleConfig {
  id: VehicleType;
  name: string;
  clearanceCm: number;
  cautionCm: number;
  icon: string;
  description: string;
}

export const VEHICLE_CONFIGS: Record<VehicleType, VehicleConfig> = {
  all: {
    id: "all",
    name: "All Vehicles",
    clearanceCm: 40,
    cautionCm: 15,
    icon: "🌐",
    description: "General vehicle fleet passability",
  },
  sedan: {
    id: "sedan",
    name: "Sedan / Hatchback",
    clearanceCm: 15,
    cautionCm: 8,
    icon: "🚗",
    description: "Ground clearance ~15 cm (Vulnerable to gutter-deep water)",
  },
  suv: {
    id: "suv",
    name: "SUV / Crossover",
    clearanceCm: 25,
    cautionCm: 15,
    icon: "🚙",
    description: "Ground clearance ~25 cm (Higher clearance, half-tire limit)",
  },
  motorcycle: {
    id: "motorcycle",
    name: "Motorcycle / Scooter",
    clearanceCm: 12,
    cautionCm: 6,
    icon: "🏍️",
    description: "Ground clearance ~12 cm (Low air intake, hydroplaning hazard)",
  },
  truck: {
    id: "truck",
    name: "4x4 Pickup / Truck",
    clearanceCm: 40,
    cautionCm: 25,
    icon: "🚚",
    description: "Ground clearance ~40 cm (Heavy duty rescue & wading capacity)",
  },
};

export type TrafficLevel = "SMOOTH" | "MODERATE" | "HEAVY" | "STANDSTILL";

export interface RouteTrafficBreakdown {
  rushHourDelayMin: number;
  weatherDelayMin: number;
  floodDelayMin: number;
  rushHourLabel?: string;
}

export interface RouteTrafficData {
  level: TrafficLevel;
  color: string;
  label: string;
  delayMin: number;
  averageSpeedKmH: number;
  description: string;
  breakdown?: RouteTrafficBreakdown;
}

export type WalkabilityCategory =
  | "WALKABLE_CLEAR"
  | "WALKABLE_BOOTS"
  | "HAZARDOUS_WADING"
  | "IMPASSABLE_DANGEROUS";

export interface RouteWalkabilityBreakdown {
  baseWalkMin: number;
  wadingDelayMin: number;
  rainDelayMin: number;
  averageSpeedKmH: number;
}

export interface RouteWalkabilityData {
  category: WalkabilityCategory;
  label: string;
  score: number; // 0 - 100
  color: string;
  isWalkable: boolean;
  baseDurationMin: number;
  adjustedDurationMin: number;
  wadingDelayMin: number;
  rainDelayMin?: number;
  maxWadingDepthCm: number;
  hasLeptospirosisRisk: boolean;
  hasManholeHazard: boolean;
  recommendedGear: string[];
  safetyTips: string[];
  breakdown?: RouteWalkabilityBreakdown;
}

export interface RouteVehiclePassability {
  vehicleType: VehicleType;
  vehicleName: string;
  isPassable: boolean;
  clearanceCm: number;
  maxWaterDepthCm: number;
  statusText: string;
  statusLevel: "SAFE" | "CAUTION" | "IMPASSABLE";
}

export interface RouteWeatherForecast {
  currentRainMmHr: number;
  forecast1hMm: number;
  forecast2hMm: number;
  forecast3hMm: number;
  forecast3hTotalMm: number;
  forecastPeakMmHr: number;
  precipProbabilityMax: number;
  trend: RainfallTrend;
  conditionLabel: string;
  summary: string;
  projectedMaxDepth3hCm: number;
  projectedStatus3h: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE";
  nearestStationName?: string;
  nearestStationDistanceKm?: number;
  isStationInRadius?: boolean;
}

export interface RouteOption {
  id: string;
  mode: TravelMode;
  summary: string;
  distanceKm: number;
  durationMin: number; // Traffic-adjusted or wading-adjusted duration in minutes
  baseDurationMin: number; // Unadjusted baseline duration
  geometry: [number, number][]; // Full route [lat, lng] array
  segmentedRoute: RouteSegmentData[];
  maxFloodDepthCm: number;
  totalFloodedKm: number;
  overallStatus: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE";
  warnings: string[];
  traffic?: RouteTrafficData;
  walkability?: RouteWalkabilityData;
  vehiclePassability?: RouteVehiclePassability;
  weatherForecast?: RouteWeatherForecast;
}

export interface RouteSegmentData {
  coordinates: [number, number][]; // [lat, lng]
  elevationM: number;
  rainMmHr: number;
  rain24hMm: number;
  forecast1hMm?: number;
  forecast2hMm?: number;
  forecast3hMm?: number;
  forecast3hTotalMm?: number;
  forecastPeakMmHr?: number;
  precipProbability?: number;
  projectedDepth3hCm?: number;
  forecastTrend?: RainfallTrend;
  severity: RoadSeverity;
  color: string;
  depthCm: number;
  depthCategory: string;
  passableVehicles: string[];
  hazardScore: number;
  nearestStationName: string;
  nearestStationDistanceKm: number;
  isStationInRadius: boolean;
  segmentDistanceKm: number;
  trafficLevel?: TrafficLevel;
  isWalkableSegment?: boolean;
  walkSlowdownFactor?: number;
}

export interface RouteQueryOptions {
  mode?: TravelMode;
  vehicleType?: VehicleType;
}

/**
 * Step 1: Fetches directions from OSRM API (driving or walking) between Point A and Point B,
 * then executes Steps 2-4 (Elevation + Rainfall + Inundation prediction + Traffic/Walkability modeling).
 */
export async function fetchAndEvaluateRoute(
  origin: [number, number], // [lat, lng]
  destination: [number, number], // [lat, lng]
  stations: LiveStation[],
  options: RouteQueryOptions = {}
): Promise<RouteOption[]> {
  const [origLat, origLng] = origin;
  const [destLat, destLng] = destination;
  const mode: TravelMode = options.mode || "driving";
  const vehicleType: VehicleType = options.vehicleType || "all";

  try {
    // 1. OSRM API Endpoint based on travel mode
    const osrmProfile = mode === "walking" ? "walking" : "driving";
    const url = `https://router.project-osrm.org/route/v1/${osrmProfile}/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error("No route found between selected points");
    }

    // 2. Map and Evaluate Each Alternative Route asynchronously
    const routeOptions: RouteOption[] = await Promise.all(
      data.routes.map(async (rt: any, idx: number) => {
        const rawCoords: [number, number][] = rt.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        );

        const summary =
          rt.legs?.[0]?.summary ||
          (idx === 0
            ? mode === "walking"
              ? "Primary Footpath"
              : "Fastest Route"
            : `Alternative ${mode === "walking" ? "Walk" : "Route"} ${idx}`);
        const distanceKm = Number((rt.distance / 1000).toFixed(1));

        // Realistic Baseline Duration:
        // - Walking: Pedestrian standard pace is 4.5 km/h (~13.3 min/km in urban terrain with street crossings).
        // - Driving: Realistic urban base speed (28 km/h without traffic/flood), compared with OSRM's free-flow.
        let baseDurationMin: number;
        if (mode === "walking") {
          baseDurationMin = Math.max(1, Math.round((distanceKm / 4.5) * 60));
        } else {
          const urbanBaseMin = Math.max(1, Math.round((distanceKm / 28) * 60));
          baseDurationMin = Math.max(urbanBaseMin, Math.max(1, Math.round((rt.duration || 0) / 60)));
        }

        // Steps 2, 3, 4: Segment polyline, fetch elevation, check Open-Meteo & PAGASA rainfall, predict flooding
        const segmented = await segmentPolylineWithFloodRisk(rawCoords, stations, mode);

        let maxFloodDepthCm = 0;
        let totalFloodedKm = 0;
        const warnings: string[] = [];

        segmented.forEach((seg) => {
          if (seg.depthCm > maxFloodDepthCm) {
            maxFloodDepthCm = seg.depthCm;
          }
          if (seg.severity !== "NORMAL") {
            totalFloodedKm += seg.segmentDistanceKm;
            if (seg.depthCm > 15 && !warnings.includes(seg.nearestStationName)) {
              if (mode === "walking") {
                warnings.push(
                  `Wading hazard (${seg.depthCm} cm / ${seg.severity}) near ${seg.nearestStationName} (Elev: ${seg.elevationM}m, Rain: ${seg.rainMmHr}mm/hr)`
                );
              } else {
                warnings.push(
                  `Flood risk (${seg.depthCm} cm / ${seg.severity}) near ${seg.nearestStationName} (Elev: ${seg.elevationM}m, Rain: ${seg.rainMmHr}mm/hr)`
                );
              }
            }
          }
        });

        let overallStatus: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE" = "SAFE";
        if (maxFloodDepthCm > 28) {
          overallStatus = "IMPASSABLE";
        } else if (maxFloodDepthCm >= 15) {
          overallStatus = "HIGH_RISK";
        } else if (maxFloodDepthCm >= 5) {
          overallStatus = "CAUTION";
        }

        // -------------------------------------------------------------------
        // 3-Hour Weather Forecast & Flood Progression Aggregation
        // -------------------------------------------------------------------
        const segCount = Math.max(1, segmented.length);
        const peakCurrentRain = Math.round(Math.max(...segmented.map((s) => s.rainMmHr), 0) * 10) / 10;
        const avgForecast1h = Math.round((segmented.reduce((sum, s) => sum + (s.forecast1hMm ?? 0), 0) / segCount) * 10) / 10;
        const avgForecast2h = Math.round((segmented.reduce((sum, s) => sum + (s.forecast2hMm ?? 0), 0) / segCount) * 10) / 10;
        const avgForecast3h = Math.round((segmented.reduce((sum, s) => sum + (s.forecast3hMm ?? 0), 0) / segCount) * 10) / 10;
        const maxForecast3hTotal = Math.round(Math.max(...segmented.map((s) => s.forecast3hTotalMm ?? 0), 0) * 10) / 10;
        const peakForecastRate = Math.round(Math.max(...segmented.map((s) => s.forecastPeakMmHr ?? s.rainMmHr), peakCurrentRain) * 10) / 10;
        const maxPrecipProb = Math.max(...segmented.map((s) => s.precipProbability ?? 0), 0);
        const projectedMaxDepth3hCm = Math.max(...segmented.map((s) => s.projectedDepth3hCm ?? s.depthCm), 0);

        let projectedStatus3h: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE" = "SAFE";
        if (projectedMaxDepth3hCm > 28) {
          projectedStatus3h = "IMPASSABLE";
        } else if (projectedMaxDepth3hCm >= 15) {
          projectedStatus3h = "HIGH_RISK";
        } else if (projectedMaxDepth3hCm >= 5) {
          projectedStatus3h = "CAUTION";
        }

        let overallTrend: RainfallTrend = "DRY";
        if (segmented.some((s) => s.forecastTrend === "WORSENING")) {
          overallTrend = "WORSENING";
        } else if (segmented.some((s) => s.forecastTrend === "IMPROVING")) {
          overallTrend = "IMPROVING";
        } else if (segmented.some((s) => s.forecastTrend === "STEADY")) {
          overallTrend = "STEADY";
        }

        const conditionLabel = computeConditionLabel(peakCurrentRain, maxForecast3hTotal, peakForecastRate, overallTrend);

        let forecastSummary = "Clear weather projected over the next 3 hours.";
        if (overallTrend === "WORSENING" && (peakForecastRate >= 15 || maxForecast3hTotal >= 20)) {
          forecastSummary = `⚠️ Torrential Rain Expected (+${maxForecast3hTotal}mm in 3h). Flood depths along low-lying segments may rise to ~${projectedMaxDepth3hCm}cm (${projectedStatus3h}).`;
          if (!warnings.some((w) => w.includes("3-Hour Forecast"))) {
            warnings.push(`⛈️ 3-Hour Forecast Alert: Heavy rainfall (+${maxForecast3hTotal}mm) projected to elevate flood depth to ${projectedMaxDepth3hCm}cm within 1-2 hours.`);
          }
        } else if (overallTrend === "WORSENING") {
          forecastSummary = `🌧️ Rain incoming (+${maxForecast3hTotal}mm in 3h). Projected water depth ~${projectedMaxDepth3hCm}cm.`;
        } else if (overallTrend === "IMPROVING" && maxFloodDepthCm > 0) {
          forecastSummary = `🌦️ Rain easing. Standing flood depths projected to gradually recede over the next 1-3 hours.`;
        } else if (peakCurrentRain > 0) {
          forecastSummary = `Steady rain (${peakCurrentRain} mm/hr). Projected 3h depth ~${projectedMaxDepth3hCm}cm.`;
        }

        const primarySeg = segmented[0];
        const weatherForecast: RouteWeatherForecast = {
          currentRainMmHr: peakCurrentRain,
          forecast1hMm: avgForecast1h,
          forecast2hMm: avgForecast2h,
          forecast3hMm: avgForecast3h,
          forecast3hTotalMm: maxForecast3hTotal,
          forecastPeakMmHr: peakForecastRate,
          precipProbabilityMax: maxPrecipProb,
          trend: overallTrend,
          conditionLabel,
          summary: forecastSummary,
          projectedMaxDepth3hCm,
          projectedStatus3h,
          nearestStationName: primarySeg?.nearestStationName,
          nearestStationDistanceKm: primarySeg?.nearestStationDistanceKm,
          isStationInRadius: primarySeg?.isStationInRadius,
        };

        // -------------------------------------------------------------------
        // Vehicle Mode Calculations (Traffic & Clearance)
        // -------------------------------------------------------------------
        let traffic: RouteTrafficData | undefined = undefined;
        let vehiclePassability: RouteVehiclePassability | undefined = undefined;
        let durationMin = baseDurationMin;

        if (mode === "driving") {
          // Calculate traffic slowdown & delay based on baseline speed, rush hour, weather, & flood bottlenecks
          traffic = calculateRouteTraffic(distanceKm, baseDurationMin, maxFloodDepthCm, segmented);
          durationMin = baseDurationMin + traffic.delayMin;

          // Calculate vehicle-specific clearance
          vehiclePassability = evaluateVehiclePassability(vehicleType, maxFloodDepthCm);
        }

        // -------------------------------------------------------------------
        // Walking Mode Calculations (Walkability & Wading Delays)
        // -------------------------------------------------------------------
        let walkability: RouteWalkabilityData | undefined = undefined;
        if (mode === "walking") {
          walkability = evaluateRouteWalkability(distanceKm, baseDurationMin, maxFloodDepthCm, segmented);
          durationMin = walkability.adjustedDurationMin;

          if (walkability.hasLeptospirosisRisk && !warnings.some(w => w.includes("Leptospirosis"))) {
            warnings.push("⚠️ Leptospirosis Alert: Avoid wading with open wounds; take prophylaxis if exposed.");
          }
          if (walkability.hasManholeHazard && !warnings.some(w => w.includes("Manhole"))) {
            warnings.push("🕳️ Submerged Drain Alert: Risk of displaced manhole covers in flooded segments.");
          }
        }

        return {
          id: `route-${mode}-${idx}`,
          mode,
          summary: summary ? `via ${summary}` : mode === "walking" ? "Foot Corridor" : "Primary Route",
          distanceKm,
          durationMin,
          baseDurationMin,
          geometry: rawCoords,
          segmentedRoute: segmented,
          maxFloodDepthCm,
          totalFloodedKm: Number(totalFloodedKm.toFixed(1)),
          overallStatus,
          warnings,
          traffic,
          walkability,
          vehiclePassability,
          weatherForecast,
        };
      })
    );

    return routeOptions;
  } catch (err) {
    console.warn("[RouteSolver] Falling back to direct polyline interpolation:", err);
    return [await createFallbackRoute(origin, destination, stations, mode, vehicleType)];
  }
}

/**
 * Splits a dense polyline [lat, lng][] into sub-segments (~300m length)
 * and executes:
 *   - Step 2: Sampling elevations (EL.m) via DEM
 *   - Step 3: Interpolating Open-Meteo current + 3h forecast and PAGASA telemetry
 *   - Step 4: Predicting standing water depth, drivability, walkability, and risk category
 */
export async function segmentPolylineWithFloodRisk(
  polyline: [number, number][],
  stations: LiveStation[],
  mode: TravelMode = "driving"
): Promise<RouteSegmentData[]> {
  if (!polyline || polyline.length < 2) return [];

  const CHUNK_SIZE = Math.max(2, Math.floor(polyline.length / 15)); // ~15 sub-segments
  const rawSegments: {
    chunk: [number, number][];
    centLat: number;
    centLng: number;
    segDistKm: number;
  }[] = [];

  for (let i = 0; i < polyline.length - 1; i += CHUNK_SIZE - 1) {
    const chunk = polyline.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) continue;

    let segDistKm = 0;
    let sumLat = 0;
    let sumLng = 0;

    chunk.forEach(([lat, lng], idx) => {
      sumLat += lat;
      sumLng += lng;
      if (idx > 0) {
        const prev = chunk[idx - 1];
        segDistKm += calculateHaversineDistance(prev[0], prev[1], lat, lng);
      }
    });

    rawSegments.push({
      chunk,
      centLat: sumLat / chunk.length,
      centLng: sumLng / chunk.length,
      segDistKm: Number(segDistKm.toFixed(2)),
    });
  }

  // Step 2: Sample elevations for all segment centroids in batch
  const centroidCoords: [number, number][] = rawSegments.map((s) => [s.centLat, s.centLng]);
  const [elevations, meteoMap] = await Promise.all([
    getElevationsForCoordinates(centroidCoords),
    batchFetchDistrictRainfall(centroidCoords.map(([lat, lng]) => ({ lat, lng }))),
  ]);

  const segments: RouteSegmentData[] = [];

  for (let idx = 0; idx < rawSegments.length; idx++) {
    const { chunk, centLat, centLng, segDistKm } = rawSegments[idx];
    const roadElevation = elevations[idx] ?? 4.0;
    const gridKey = toGridKey(centLat, centLng);
    const meteoData = meteoMap.get(gridKey);

    // Step 3: Check PAGASA stations within valid spatial radius
    let nearestSt: LiveStation | null = null;
    let minDist = Infinity;

    if (stations && stations.length > 0) {
      for (const st of stations) {
        if (!st.latitude || !st.longitude) continue;
        const d = calculateHaversineDistance(centLat, centLng, st.latitude, st.longitude);
        if (d < minDist) {
          minDist = d;
          nearestSt = st;
        }
      }
    }

    let nearestStationName = "Open-Meteo 1.1km Grid";
    let nearestStationDistKm = 0;
    const isStationInRadius = minDist <= MAX_PAGASA_RAIN_RADIUS_KM;

    let stationRain1h = 0;
    let stationRain24h = 0;
    let waterDelta1h = 0;
    let stRiskLevel = "NORMAL";

    if (nearestSt) {
      nearestStationName = nearestSt.stationName;
      nearestStationDistKm = Number(minDist.toFixed(1));

      if (isStationInRadius) {
        // Distance decay factor within valid 10km radius
        const distWeight = Math.exp(-minDist / 6.0);
        stationRain1h = (nearestSt.rain1h ?? 0) * distWeight;
        stationRain24h = (nearestSt.rain24h ?? 0) * distWeight;
        waterDelta1h = nearestSt.waterLevelDelta1h ?? 0;
        stRiskLevel = nearestSt.riskLevel ?? "NORMAL";
      }
    }

    // Blend Open-Meteo hyper-local current rainfall with nearby PAGASA AWS ground truth
    const meteoCurrentRain = meteoData?.currentRainMmHr ?? 0;
    const meteoRain24h = meteoData?.rain24hMm ?? 0;

    const rainMmHr = Math.round(Math.max(meteoCurrentRain, stationRain1h) * 10) / 10;
    const rain24hMm = Math.round(Math.max(meteoRain24h, stationRain24h) * 10) / 10;

    // 3-Hour Forecast Data from Open-Meteo
    const forecast1hMm = meteoData?.forecast1hMm ?? rainMmHr;
    const forecast2hMm = meteoData?.forecast2hMm ?? forecast1hMm;
    const forecast3hMm = meteoData?.forecast3hMm ?? forecast2hMm;
    const forecast3hTotalMm = meteoData?.forecast3hTotalMm ?? Math.round((forecast1hMm + forecast2hMm + forecast3hMm) * 10) / 10;
    const forecastPeakMmHr = meteoData?.forecastPeakMmHr ?? Math.max(rainMmHr, forecast1hMm, forecast2hMm, forecast3hMm);
    const forecastTrend = meteoData?.trend ?? (forecast3hTotalMm > rainMmHr * 2 ? "WORSENING" : "DRY");
    const precipProbability = meteoData?.precipProbability ?? (rainMmHr > 0 ? 85 : 10);

    // Step 4: Calculate elevation, predictive rainfall (Current + 3h Forecast), drainage, and hazard
    const baseDrainage = roadElevation <= 3.0 ? 18 : roadElevation <= 6.0 ? 25 : 32;
    const inferredNoahHazard =
      roadElevation <= 2.2 ? 3 : roadElevation <= 3.5 ? 2 : roadElevation <= 6.0 ? 1 : 0;

    // Fused predictive rainfall: current rain rate + 3-hour forecasted rainfall accumulation
    const predictiveRainRate = Math.max(rainMmHr, forecastPeakMmHr) + forecast3hTotalMm * 0.8;
    const predictiveRain24h = rain24hMm + forecast3hTotalMm;

    let depthCm = calculateWaterDepth(
      predictiveRainRate,
      predictiveRain24h,
      inferredNoahHazard,
      roadElevation,
      baseDrainage
    );

    // Fluvial surge if strictly within MAX_PAGASA_WATER_LEVEL_RADIUS_KM (<=2.0 km) of active river gauge
    if (minDist <= MAX_PAGASA_WATER_LEVEL_RADIUS_KM && nearestSt && isRiverGaugeStation(nearestSt)) {
      if (stRiskLevel === "CRITICAL" || stRiskLevel === "ALARM") {
        const riverBonus = stRiskLevel === "CRITICAL" ? 18 : 8;
        const surgeBonus = Math.max(0, waterDelta1h) * 100 * 0.25;
        const riverProximityWeight = Math.max(0, 1 - minDist / MAX_PAGASA_WATER_LEVEL_RADIUS_KM);
        depthCm = Math.round(depthCm + (riverBonus + surgeBonus) * riverProximityWeight);
      }
    }

    // Calculate Projected 3-Hour Flood Depth
    const projectedDepth3hCm = predictProjectedFloodDepth(
      depthCm,
      predictiveRainRate,
      forecast3hTotalMm,
      forecastPeakMmHr,
      inferredNoahHazard,
      roadElevation,
      baseDrainage
    );

    const classification = classifyFloodRisk(depthCm);
    const severityClassification = classifySeverity(depthCm);

    // Color: #2563eb for Normal / Clear (0-4cm), else severity color (#f97316 for 5-14cm, #ef4444 for 15-28cm, #7f1d1d for >28cm)
    const color = depthCm < 5 ? (mode === "walking" ? "#06b6d4" : "#2563eb") : classification.color;

    // Composite Hazard Score (0-100)
    const rainFactor = Math.min(1.0, predictiveRainRate / 30.0);
    const depthFactor = Math.min(1.0, depthCm / 50.0);
    const elevFactor = Math.max(0, 1.0 - roadElevation / 20.0);
    const hazardScore = Math.round(
      Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
    );

    // Traffic calculation for segment
    let trafficLevel: TrafficLevel = "SMOOTH";
    if (depthCm > 28) {
      trafficLevel = "STANDSTILL";
    } else if (depthCm >= 15) {
      trafficLevel = "HEAVY";
    } else if (depthCm >= 5) {
      trafficLevel = "MODERATE";
    }

    // Walking calculation for segment
    const isWalkableSegment = depthCm <= 25;
    let walkSlowdownFactor = 1.0;
    if (depthCm > 28) {
      walkSlowdownFactor = 4.5;
    } else if (depthCm >= 15) {
      walkSlowdownFactor = 2.5;
    } else if (depthCm >= 5) {
      walkSlowdownFactor = 1.5;
    }

    segments.push({
      coordinates: chunk,
      elevationM: roadElevation,
      rainMmHr,
      rain24hMm,
      forecast1hMm,
      forecast2hMm,
      forecast3hMm,
      forecast3hTotalMm,
      forecastPeakMmHr,
      precipProbability,
      projectedDepth3hCm,
      forecastTrend,
      severity: severityClassification.severity,
      color,
      depthCm,
      depthCategory: classification.label,
      passableVehicles: classification.passableVehicles,
      hazardScore,
      nearestStationName,
      nearestStationDistanceKm: nearestStationDistKm,
      isStationInRadius,
      segmentDistanceKm: segDistKm,
      trafficLevel,
      isWalkableSegment,
      walkSlowdownFactor,
    });
  }

  return segments;
}

/**
 * Computes vehicle traffic conditions and estimated congestion delay (in minutes).
 * Evaluates:
 * 1. Base urban driving speed with stoplights/intersections (~28 km/h).
 * 2. Real-time Rush Hour congestion index (Philippine Time UTC+8).
 * 3. Inclement weather / heavy rain road delays.
 * 4. Flood bottlenecks and lane submergence slowdowns.
 */
export function calculateRouteTraffic(
  distanceKm: number,
  baseDurationMin: number,
  maxFloodDepthCm: number,
  segments: RouteSegmentData[],
  now: Date = new Date()
): RouteTrafficData {
  // 1. Time-of-day / Rush Hour Congestion Modeling (Philippine Standard Time UTC+8)
  const manilaHour = (now.getUTCHours() + 8) % 24;
  const manilaMinute = now.getUTCMinutes();
  const timeDecimal = manilaHour + manilaMinute / 60;

  let rushFactor = 0.15; // default day traffic
  let rushHourLabel = "Normal Urban Traffic";

  if (timeDecimal >= 7.0 && timeDecimal < 10.0) {
    // Morning Rush (07:00 - 10:00)
    rushFactor = 0.55;
    rushHourLabel = "Morning Rush Hour";
  } else if (timeDecimal >= 11.5 && timeDecimal < 13.5) {
    // Midday Lunch Busy (11:30 - 13:30)
    rushFactor = 0.28;
    rushHourLabel = "Midday Urban Traffic";
  } else if (timeDecimal >= 17.0 && timeDecimal < 21.0) {
    // Evening Peak Rush (17:00 - 21:00)
    rushFactor = 0.65;
    rushHourLabel = "Evening Peak Rush Hour";
  } else if (
    (timeDecimal >= 6.0 && timeDecimal < 7.0) ||
    (timeDecimal >= 10.0 && timeDecimal < 11.5) ||
    (timeDecimal >= 13.5 && timeDecimal < 17.0) ||
    (timeDecimal >= 21.0 && timeDecimal < 22.5)
  ) {
    // Regular active hours
    rushFactor = 0.20;
    rushHourLabel = "Moderate Daytime Traffic";
  } else {
    // Off-peak late night / early dawn (22:30 - 06:00)
    rushFactor = 0.0;
    rushHourLabel = "Off-Peak Clear Flow";
  }

  const rushHourDelayMin = Math.round(baseDurationMin * rushFactor);

  // 2. Weather and Flood Segment Delays
  let weatherDelayMin = 0;
  let floodDelayMin = 0;

  segments.forEach((seg) => {
    const segDist = seg.segmentDistanceKm || 0.3;
    // Expected normal segment driving time in minutes at baseline urban speed (~28 km/h):
    const segBaseMin = (segDist / 28) * 60;

    // Rain slowdown on wet asphalt / reduced visibility
    if (seg.rainMmHr >= 25) {
      weatherDelayMin += segBaseMin * 0.45; // Torrential downpour
    } else if (seg.rainMmHr >= 10) {
      weatherDelayMin += segBaseMin * 0.25; // Moderate-heavy rain
    } else if (seg.rainMmHr >= 2) {
      weatherDelayMin += segBaseMin * 0.10; // Light rain / wet roads
    }

    // Flood bottleneck delay
    if (seg.depthCm > 30) {
      // Impassable / Gridlock: extreme delay multiplier
      floodDelayMin += segBaseMin * 9.0;
    } else if (seg.depthCm >= 16) {
      // Half-tire: crawl speed 4-6 km/h -> 4x delay
      floodDelayMin += segBaseMin * 4.0;
    } else if (seg.depthCm >= 6) {
      // Gutter-deep: crawl speed 12-15 km/h -> 1.5x delay
      floodDelayMin += segBaseMin * 1.5;
    } else if (seg.depthCm >= 2) {
      // Minor standing water
      floodDelayMin += segBaseMin * 0.2;
    }
  });

  const roundedWeatherDelay = Math.round(weatherDelayMin);
  const roundedFloodDelay = Math.round(floodDelayMin);
  const totalDelayMin = rushHourDelayMin + roundedWeatherDelay + roundedFloodDelay;

  const totalDurationMin = Math.max(1, baseDurationMin + totalDelayMin);
  const averageSpeedKmH = Math.max(
    3,
    Number((distanceKm / (totalDurationMin / 60)).toFixed(1))
  );

  let level: TrafficLevel = "SMOOTH";
  let color = "#10b981"; // Emerald
  let label = rushHourLabel;
  let description = "Normal driving speed with smooth flow.";

  if (maxFloodDepthCm > 30 || averageSpeedKmH <= 7) {
    level = "STANDSTILL";
    color = "#ef4444"; // Red
    label = "Severe Gridlock / Standstill";
    description = "Roadway submerged or impassable with severe traffic standstill.";
  } else if (maxFloodDepthCm >= 16 || averageSpeedKmH <= 14 || totalDelayMin >= 15) {
    level = "HEAVY";
    color = "#f97316"; // Orange
    label = `${rushHourLabel} (Heavy Congestion)`;
    description = "Slow-moving bumper-to-bumper traffic crawl due to congestion and bottlenecks.";
  } else if (maxFloodDepthCm >= 6 || averageSpeedKmH <= 22 || totalDelayMin >= 4) {
    level = "MODERATE";
    color = "#eab308"; // Yellow
    label = `${rushHourLabel} (Moderate)`;
    description = "Moderate traffic flow with typical urban intersections and wet road slowdown.";
  } else {
    level = "SMOOTH";
    color = "#10b981";
    label = rushHourLabel === "Off-Peak Clear Flow" ? "Off-Peak Fast Flow" : "Smooth Flow";
    description = "Clear road conditions with steady traffic speed.";
  }

  return {
    level,
    color,
    label,
    delayMin: totalDelayMin,
    averageSpeedKmH,
    description,
    breakdown: {
      rushHourDelayMin,
      weatherDelayMin: roundedWeatherDelay,
      floodDelayMin: roundedFloodDelay,
      rushHourLabel,
    },
  };
}

/**
 * Evaluates passability for a specific vehicle type based on flood clearance limits.
 */
export function evaluateVehiclePassability(
  vehicleType: VehicleType,
  maxFloodDepthCm: number
): RouteVehiclePassability {
  const config = VEHICLE_CONFIGS[vehicleType] || VEHICLE_CONFIGS.all;

  let isPassable = true;
  let statusLevel: "SAFE" | "CAUTION" | "IMPASSABLE" = "SAFE";
  let statusText = `Safe to drive: ${config.name} can safely traverse (Clearance: ${config.clearanceCm} cm)`;

  if (maxFloodDepthCm > config.clearanceCm) {
    isPassable = false;
    statusLevel = "IMPASSABLE";
    statusText = `Impassable: Flood depth (${maxFloodDepthCm} cm) exceeds ${config.name} clearance (${config.clearanceCm} cm). High risk of engine stall / hydro-locking!`;
  } else if (maxFloodDepthCm > config.cautionCm) {
    isPassable = true;
    statusLevel = "CAUTION";
    statusText = `Caution: Water depth (${maxFloodDepthCm} cm) is near ${config.name} threshold (${config.clearanceCm} cm). Drive slowly in lowest gear.`;
  }

  return {
    vehicleType,
    vehicleName: config.name,
    isPassable,
    clearanceCm: config.clearanceCm,
    maxWaterDepthCm: maxFloodDepthCm,
    statusText,
    statusLevel,
  };
}

/**
 * Evaluates pedestrian walkability, wading delays, and safety advisories along a walking route.
 * Standards:
 * - Base urban pedestrian pace: 4.5 km/h (~13.3 min/km).
 * - Rain slowdown: +10% to +35% for rain gear & poor visibility.
 * - Flood resistance:
 *   - 2-5 cm (puddles): +15% slowdown
 *   - 6-15 cm (gutter/ankle): +70% slowdown (walking in boots)
 *   - 16-25 cm (knee-deep): +220% slowdown (difficult wading)
 *   - >25 cm: +400% slowdown (hazardous struggle / DO NOT WALK)
 */
export function evaluateRouteWalkability(
  distanceKm: number,
  baseDurationMin: number,
  maxFloodDepthCm: number,
  segments: RouteSegmentData[]
): RouteWalkabilityData {
  let wadingDelayMin = 0;
  let rainDelayMin = 0;
  let hasLeptospirosisRisk = false;
  let hasManholeHazard = false;

  segments.forEach((seg) => {
    const segDist = seg.segmentDistanceKm || 0.3;
    // Expected normal walking duration for segment at 4.5 km/h:
    const segBaseWalkMin = (segDist / 4.5) * 60;
    const slowdownFactor =
      seg.walkSlowdownFactor ||
      (seg.depthCm > 25
        ? 5.0
        : seg.depthCm >= 16
        ? 3.2
        : seg.depthCm >= 6
        ? 1.7
        : seg.depthCm >= 3
        ? 1.15
        : 1.0);

    wadingDelayMin += segBaseWalkMin * (slowdownFactor - 1.0);

    // Weather impact on pedestrian travel
    if (seg.rainMmHr >= 25) {
      rainDelayMin += segBaseWalkMin * 0.35; // Heavy torrential downpour
    } else if (seg.rainMmHr >= 10) {
      rainDelayMin += segBaseWalkMin * 0.20; // Moderate rain
    } else if (seg.rainMmHr >= 2) {
      rainDelayMin += segBaseWalkMin * 0.10; // Light rain / drizzle
    }

    if (seg.depthCm >= 10 || seg.rainMmHr >= 15) {
      hasLeptospirosisRisk = true;
    }
    if (seg.depthCm >= 12) {
      hasManholeHazard = true;
    }
  });

  const roundedWadingDelay = Math.round(wadingDelayMin);
  const roundedRainDelay = Math.round(rainDelayMin);
  const adjustedDurationMin = Math.max(1, baseDurationMin + roundedWadingDelay + roundedRainDelay);
  const averageSpeedKmH = Math.max(0.8, Number((distanceKm / (adjustedDurationMin / 60)).toFixed(1)));

  let category: WalkabilityCategory = "WALKABLE_CLEAR";
  let label = "100% Walkable & Safe";
  let score = 95;
  let color = "#10b981"; // Emerald
  let isWalkable = true;

  const recommendedGear: string[] = ["Comfortable Walking Shoes", "Umbrella / Raincoat"];
  const safetyTips: string[] = [];

  if (maxFloodDepthCm > 25) {
    category = "IMPASSABLE_DANGEROUS";
    label = "CRITICAL / DO NOT WALK";
    score = Math.max(5, Math.round(100 - maxFloodDepthCm * 2.2));
    color = "#ef4444"; // Red
    isWalkable = false;
    recommendedGear.push("High Rubber Boots (Bota)", "Walking Stick / Ground Probe", "Waterproof Bag");
    safetyTips.push("⛔ DO NOT WADE: Deep flood waters conceal missing manhole covers and open drainage inlets with strong suction.");
    safetyTips.push("⚡ Electrical Hazard: Avoid areas near submerged lampposts and ground-level utility boxes.");
    safetyTips.push("🦠 Severe Leptospirosis Risk: Seek alternative elevated paths or emergency transport.");
  } else if (maxFloodDepthCm >= 16) {
    category = "HAZARDOUS_WADING";
    label = "Hazardous Wading (Knee-Deep)";
    score = Math.max(30, Math.round(75 - (maxFloodDepthCm - 15) * 3));
    color = "#f97316"; // Orange
    isWalkable = true;
    recommendedGear.push("High Rubber Boots (Bota)", "Walking Stick / Ground Probe");
    safetyTips.push("⚠️ Wading Required: Water reaches knee height (16–25 cm). Walk slowly and probe ground ahead with an umbrella or stick.");
    safetyTips.push("🦠 DOH Leptospirosis Warning: Do not walk if you have skin abrasions; wash thoroughly with soap and water immediately.");
  } else if (maxFloodDepthCm >= 6) {
    category = "WALKABLE_BOOTS";
    label = "Walkable (Boots Advised)";
    score = Math.max(60, Math.round(90 - (maxFloodDepthCm - 5) * 2));
    color = "#eab308"; // Yellow
    isWalkable = true;
    recommendedGear.push("Water-Resistant Shoes / Boots");
    safetyTips.push("👢 Gutter Deep (6–15 cm): Walkable with waterproof boots. Watch footing around submerged curbs.");
  } else {
    safetyTips.push("✅ Clear Footpaths: Puddles under 5 cm. Standard walking shoes are safe.");
  }

  return {
    category,
    label,
    score,
    color,
    isWalkable,
    baseDurationMin,
    adjustedDurationMin,
    wadingDelayMin: roundedWadingDelay,
    rainDelayMin: roundedRainDelay,
    maxWadingDepthCm: maxFloodDepthCm,
    hasLeptospirosisRisk,
    hasManholeHazard,
    recommendedGear,
    safetyTips,
    breakdown: {
      baseWalkMin: baseDurationMin,
      wadingDelayMin: roundedWadingDelay,
      rainDelayMin: roundedRainDelay,
      averageSpeedKmH,
    },
  };
}

async function createFallbackRoute(
  origin: [number, number],
  destination: [number, number],
  stations: LiveStation[],
  mode: TravelMode = "driving",
  vehicleType: VehicleType = "all"
): Promise<RouteOption> {
  const [lat1, lng1] = origin;
  const [lat2, lng2] = destination;
  const STEPS = 20;

  const polyline: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    polyline.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
  }

  const distanceKm = Number(calculateHaversineDistance(lat1, lng1, lat2, lng2).toFixed(1));
  const baseSpeed = mode === "walking" ? 4.5 : 28;
  const baseDurationMin = Math.max(1, Math.round((distanceKm / baseSpeed) * 60));

  const segmented = await segmentPolylineWithFloodRisk(polyline, stations, mode);
  const maxFloodDepthCm = Math.max(...segmented.map((s) => s.depthCm), 0);

  let traffic: RouteTrafficData | undefined = undefined;
  let vehiclePassability: RouteVehiclePassability | undefined = undefined;
  let walkability: RouteWalkabilityData | undefined = undefined;
  let durationMin = baseDurationMin;

  if (mode === "driving") {
    traffic = calculateRouteTraffic(distanceKm, baseDurationMin, maxFloodDepthCm, segmented);
    durationMin = baseDurationMin + traffic.delayMin;
    vehiclePassability = evaluateVehiclePassability(vehicleType, maxFloodDepthCm);
  } else {
    walkability = evaluateRouteWalkability(distanceKm, baseDurationMin, maxFloodDepthCm, segmented);
    durationMin = walkability.adjustedDurationMin;
  }

  const segCount = Math.max(1, segmented.length);
  const peakCurrentRain = Math.round(Math.max(...segmented.map((s) => s.rainMmHr), 0) * 10) / 10;
  const maxForecast3hTotal = Math.round(Math.max(...segmented.map((s) => s.forecast3hTotalMm ?? 0), 0) * 10) / 10;
  const peakForecastRate = Math.round(Math.max(...segmented.map((s) => s.forecastPeakMmHr ?? s.rainMmHr), peakCurrentRain) * 10) / 10;
  const projectedMaxDepth3hCm = Math.max(...segmented.map((s) => s.projectedDepth3hCm ?? s.depthCm), 0);

  const weatherForecast: RouteWeatherForecast = {
    currentRainMmHr: peakCurrentRain,
    forecast1hMm: Math.round((segmented.reduce((sum, s) => sum + (s.forecast1hMm ?? 0), 0) / segCount) * 10) / 10,
    forecast2hMm: Math.round((segmented.reduce((sum, s) => sum + (s.forecast2hMm ?? 0), 0) / segCount) * 10) / 10,
    forecast3hMm: Math.round((segmented.reduce((sum, s) => sum + (s.forecast3hMm ?? 0), 0) / segCount) * 10) / 10,
    forecast3hTotalMm: maxForecast3hTotal,
    forecastPeakMmHr: peakForecastRate,
    precipProbabilityMax: Math.max(...segmented.map((s) => s.precipProbability ?? 0), 0),
    trend: segmented.some((s) => s.forecastTrend === "WORSENING")
      ? "WORSENING"
      : segmented.some((s) => s.forecastTrend === "IMPROVING")
      ? "IMPROVING"
      : "DRY",
    conditionLabel: computeConditionLabel(peakCurrentRain, maxForecast3hTotal, peakForecastRate, "DRY"),
    summary: peakCurrentRain > 0 ? `Rainfall ~${peakCurrentRain} mm/hr along corridor.` : "Clear weather conditions along corridor.",
    projectedMaxDepth3hCm,
    projectedStatus3h: projectedMaxDepth3hCm > 28 ? "IMPASSABLE" : projectedMaxDepth3hCm >= 15 ? "HIGH_RISK" : projectedMaxDepth3hCm >= 5 ? "CAUTION" : "SAFE",
  };

  return {
    id: `route-${mode}-fallback`,
    mode,
    summary: mode === "walking" ? "Direct Walking Corridor" : "Direct Connecting Corridor",
    distanceKm,
    durationMin,
    baseDurationMin,
    geometry: polyline,
    segmentedRoute: segmented,
    maxFloodDepthCm,
    totalFloodedKm: 0,
    overallStatus:
      maxFloodDepthCm > 28
        ? "IMPASSABLE"
        : maxFloodDepthCm >= 15
        ? "HIGH_RISK"
        : maxFloodDepthCm >= 5
        ? "CAUTION"
        : "SAFE",
    warnings: [],
    traffic,
    walkability,
    vehiclePassability,
    weatherForecast,
  };
}


