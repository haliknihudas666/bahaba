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
  type RoadSeverity,
} from "./roadRisk";
import { calculateWaterDepth, classifyFloodRisk } from "./floodPredictor";

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

export interface RouteTrafficData {
  level: TrafficLevel;
  color: string;
  label: string;
  delayMin: number;
  averageSpeedKmH: number;
  description: string;
}

export type WalkabilityCategory =
  | "WALKABLE_CLEAR"
  | "WALKABLE_BOOTS"
  | "HAZARDOUS_WADING"
  | "IMPASSABLE_DANGEROUS";

export interface RouteWalkabilityData {
  category: WalkabilityCategory;
  label: string;
  score: number; // 0 - 100
  color: string;
  isWalkable: boolean;
  baseDurationMin: number;
  adjustedDurationMin: number;
  wadingDelayMin: number;
  maxWadingDepthCm: number;
  hasLeptospirosisRisk: boolean;
  hasManholeHazard: boolean;
  recommendedGear: string[];
  safetyTips: string[];
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

export interface RouteOption {
  id: string;
  mode: TravelMode;
  summary: string;
  distanceKm: number;
  durationMin: number; // Traffic-adjusted or wading-adjusted duration in minutes
  baseDurationMin: number; // Unadjusted OSRM baseline duration
  geometry: [number, number][]; // Full route [lat, lng] array
  segmentedRoute: RouteSegmentData[];
  maxFloodDepthCm: number;
  totalFloodedKm: number;
  overallStatus: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE";
  warnings: string[];
  traffic?: RouteTrafficData;
  walkability?: RouteWalkabilityData;
  vehiclePassability?: RouteVehiclePassability;
}

export interface RouteSegmentData {
  coordinates: [number, number][]; // [lat, lng]
  elevationM: number;
  rainMmHr: number;
  rain24hMm: number;
  severity: RoadSeverity;
  color: string;
  depthCm: number;
  depthCategory: string;
  passableVehicles: string[];
  hazardScore: number;
  nearestStationName: string;
  nearestStationDistanceKm: number;
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
        const baseDurationMin = Math.max(1, Math.round(rt.duration / 60));

        // Steps 2, 3, 4: Segment polyline, fetch elevation, check rainfall & predict flooding
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
        if (maxFloodDepthCm > 30) {
          overallStatus = "IMPASSABLE";
        } else if (maxFloodDepthCm >= 16) {
          overallStatus = "HIGH_RISK";
        } else if (maxFloodDepthCm >= 6) {
          overallStatus = "CAUTION";
        }

        // -------------------------------------------------------------------
        // Vehicle Mode Calculations (Traffic & Clearance)
        // -------------------------------------------------------------------
        let traffic: RouteTrafficData | undefined = undefined;
        let vehiclePassability: RouteVehiclePassability | undefined = undefined;
        let durationMin = baseDurationMin;

        if (mode === "driving") {
          // Calculate traffic slowdown & delay based on baseline speed & flood bottleneck points
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
 *   - Step 3: Interpolating rainfall mm/hr & 24h accumulation from stations
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
  const elevations = await getElevationsForCoordinates(centroidCoords);

  const segments: RouteSegmentData[] = [];

  for (let idx = 0; idx < rawSegments.length; idx++) {
    const { chunk, centLat, centLng, segDistKm } = rawSegments[idx];
    const roadElevation = elevations[idx] ?? 4.0;

    // Step 3: Check all rainfall mm/hr along the way & around the area
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

    let nearestStationName = "Weather Telemetry";
    let nearestStationDistKm = 0;
    let rainMmHr = 0;
    let rain24hMm = 0;
    let waterDelta1h = 0;
    let stRiskLevel = "NORMAL";

    if (nearestSt) {
      nearestStationName = nearestSt.stationName;
      nearestStationDistKm = Number(minDist.toFixed(1));
      // Distance decay weight (effective rainfall influence radius)
      const distWeight = Math.exp(-minDist / 8.0);
      rainMmHr = Math.round((nearestSt.rain1h ?? 0) * distWeight * 10) / 10;
      rain24hMm = Math.round((nearestSt.rain24h ?? 0) * distWeight * 10) / 10;
      waterDelta1h = nearestSt.waterLevelDelta1h ?? 0;
      stRiskLevel = nearestSt.riskLevel ?? "NORMAL";
    }

    // Step 4: Calculate elevation, rainfall, drainage, and hazard
    // Base drainage capacity for urban corridor: 25 mm/hr (adjusted by elevation)
    const baseDrainage = roadElevation <= 3.0 ? 18 : roadElevation <= 6.0 ? 25 : 32;

    // NOAH hazard estimate based on low-lying profile
    const inferredNoahHazard =
      roadElevation <= 2.2 ? 3 : roadElevation <= 3.5 ? 2 : roadElevation <= 6.0 ? 1 : 0;

    let depthCm = calculateWaterDepth(
      rainMmHr,
      rain24hMm,
      inferredNoahHazard,
      roadElevation,
      baseDrainage
    );

    // Fluvial surge if within 500m of a river gauge at alert/critical
    if (minDist <= 0.5 && (stRiskLevel === "CRITICAL" || stRiskLevel === "ALARM")) {
      const riverBonus = stRiskLevel === "CRITICAL" ? 18 : 8;
      const surgeBonus = Math.max(0, waterDelta1h) * 100 * 0.25;
      depthCm = Math.round(depthCm + riverBonus + surgeBonus);
    }

    const classification = classifyFloodRisk(depthCm);
    const severityClassification = classifySeverity(depthCm);

    // Color: #2563eb for Normal / Clear (0-5cm), else severity color
    const color = depthCm <= 5 ? (mode === "walking" ? "#06b6d4" : "#2563eb") : classification.color;

    // Composite Hazard Score (0-100)
    const rainFactor = Math.min(1.0, rainMmHr / 30.0);
    const depthFactor = Math.min(1.0, depthCm / 50.0);
    const elevFactor = Math.max(0, 1.0 - roadElevation / 20.0);
    const hazardScore = Math.round(
      Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
    );

    // Traffic calculation for segment
    let trafficLevel: TrafficLevel = "SMOOTH";
    if (depthCm > 30) {
      trafficLevel = "STANDSTILL";
    } else if (depthCm >= 16) {
      trafficLevel = "HEAVY";
    } else if (depthCm >= 6) {
      trafficLevel = "MODERATE";
    }

    // Walking calculation for segment
    const isWalkableSegment = depthCm <= 25;
    let walkSlowdownFactor = 1.0;
    if (depthCm > 25) {
      walkSlowdownFactor = 4.0;
    } else if (depthCm >= 16) {
      walkSlowdownFactor = 2.4;
    } else if (depthCm >= 6) {
      walkSlowdownFactor = 1.4;
    }

    segments.push({
      coordinates: chunk,
      elevationM: roadElevation,
      rainMmHr,
      rain24hMm,
      severity: severityClassification.severity,
      color,
      depthCm,
      depthCategory: classification.label,
      passableVehicles: classification.passableVehicles,
      hazardScore,
      nearestStationName,
      nearestStationDistanceKm: nearestStationDistKm,
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
 */
export function calculateRouteTraffic(
  distanceKm: number,
  baseDurationMin: number,
  maxFloodDepthCm: number,
  segments: RouteSegmentData[]
): RouteTrafficData {
  let trafficDelayMin = 0;

  // 1. Calculate flood-induced bottleneck delay across all segments
  segments.forEach((seg) => {
    const segDist = seg.segmentDistanceKm || 0.3;
    // Expected normal segment driving time in minutes at 30 km/h:
    const segBaseMin = (segDist / 30) * 60;

    if (seg.depthCm > 30) {
      // Impassable / Gridlock: 10x delay
      trafficDelayMin += segBaseMin * 9.0;
    } else if (seg.depthCm >= 16) {
      // Half-tire: crawl speed 6 km/h -> 4x delay
      trafficDelayMin += segBaseMin * 3.5;
    } else if (seg.depthCm >= 6) {
      // Gutter-deep: crawl speed 15 km/h -> 1.5x delay
      trafficDelayMin += segBaseMin * 1.2;
    } else if (seg.rainMmHr > 15) {
      // Heavy rain driving slowdown
      trafficDelayMin += segBaseMin * 0.4;
    }
  });

  trafficDelayMin = Math.round(trafficDelayMin);
  const totalDurationMin = Math.max(1, baseDurationMin + trafficDelayMin);
  const averageSpeedKmH = Math.max(
    3,
    Number((distanceKm / (totalDurationMin / 60)).toFixed(1))
  );

  let level: TrafficLevel = "SMOOTH";
  let color = "#10b981"; // Emerald
  let label = "Fast / Clear Flow";
  let description = "Normal driving speed with minimal weather delay.";

  if (maxFloodDepthCm > 30 || averageSpeedKmH <= 7) {
    level = "STANDSTILL";
    color = "#ef4444"; // Red
    label = "Severe Gridlock / Standstill";
    description = "Road is submerged/impassable with severe traffic standstill.";
  } else if (maxFloodDepthCm >= 16 || averageSpeedKmH <= 15 || trafficDelayMin >= 15) {
    level = "HEAVY";
    color = "#f97316"; // Orange
    label = "Heavy Traffic Delay";
    description = "Slow-moving traffic crawl due to flooded lanes and bottlenecks.";
  } else if (maxFloodDepthCm >= 6 || averageSpeedKmH <= 24 || trafficDelayMin >= 5) {
    level = "MODERATE";
    color = "#eab308"; // Yellow
    label = "Moderate Traffic";
    description = "Minor delays from gutter-deep water and wet road conditions.";
  }

  return {
    level,
    color,
    label,
    delayMin: trafficDelayMin,
    averageSpeedKmH,
    description,
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
 */
export function evaluateRouteWalkability(
  distanceKm: number,
  baseDurationMin: number,
  maxFloodDepthCm: number,
  segments: RouteSegmentData[]
): RouteWalkabilityData {
  let wadingDelayMin = 0;
  let hasLeptospirosisRisk = false;
  let hasManholeHazard = false;

  segments.forEach((seg) => {
    const segDist = seg.segmentDistanceKm || 0.3;
    // Expected normal walking duration for segment (~4.8 km/h):
    const segBaseWalkMin = (segDist / 4.8) * 60;
    const slowdownFactor = seg.walkSlowdownFactor || 1.0;

    wadingDelayMin += segBaseWalkMin * (slowdownFactor - 1.0);

    if (seg.depthCm >= 10 || seg.rainMmHr >= 15) {
      hasLeptospirosisRisk = true;
    }
    if (seg.depthCm >= 12) {
      hasManholeHazard = true;
    }
  });

  wadingDelayMin = Math.round(wadingDelayMin);
  const adjustedDurationMin = Math.max(1, baseDurationMin + wadingDelayMin);

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
    wadingDelayMin,
    maxWadingDepthCm: maxFloodDepthCm,
    hasLeptospirosisRisk,
    hasManholeHazard,
    recommendedGear,
    safetyTips,
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
  const baseSpeed = mode === "walking" ? 4.8 : 30;
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
      maxFloodDepthCm > 30
        ? "IMPASSABLE"
        : maxFloodDepthCm >= 16
        ? "HIGH_RISK"
        : maxFloodDepthCm >= 6
        ? "CAUTION"
        : "SAFE",
    warnings: [],
    traffic,
    walkability,
    vehiclePassability,
  };
}

