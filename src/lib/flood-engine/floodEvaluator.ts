// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Unified Modular Flood Calculation Engine
//
// Fuses:
//   1. Persistent Elevation Model (MongoDB DEM store)
//   2. UP Project NOAH 100-Year Flood Hazard Classification (`Var` 1, 2, 3)
//   3. Ground-truth PAGASA Telemetry (AWS & River Basins)
//   4. Open-Meteo Precipitation & 3-Hour Forecasts
// ---------------------------------------------------------------------------

import { getElevationsForCoordinates, getElevation } from "@/lib/elevation";
import { getNearestNoahHazard, getNoahRoadSegments, NOAH_PHILIPPINES_HOTSPOTS, NOAH_DEPTH_TABLE, type NoahHotspotNode } from "@/lib/noah";
import { getRoadsInBBox } from "@/lib/geo/getRoadsInBBox";
import { getLatestTelemetryStations, getDistrictRainfall, interpolateRainfall, haversineKm, type DistrictRainfall } from "@/lib/weather";
import type { LiveStation } from "@/types";
import type { NoahRoadSegment } from "@/types/flood-engine";

export type FloodRiskCategory = "NORMAL" | "LOW" | "HIGH" | "CRITICAL";
export type RoadSeverity = "NORMAL" | "ALERT" | "ALARM" | "CRITICAL";
export type DepthCategory = "Normal / Clear" | "Gutter Deep" | "Half-Tire Deep" | "Waist Deep+";

export interface EvaluatedLocation {
  lat: number;
  lng: number;
  isFlooded: boolean; // Depth >= 5 cm (standing water)
  depthCm: number;
  hazardScore: number; // 0 - 100
  riskCategory: FloodRiskCategory;
  severity: RoadSeverity;
  color: string;
  label: string;
  elevationM: number;
  noahLevel: number;
  effectiveRain1h: number;
  effectiveRain24h: number;
  drivableVehicles: string[];
}

export interface EvaluatedRoadRisk {
  roadId: string;
  roadName: string;
  coordinates: [number, number][]; // [[lng, lat], ...]
  centroid: [number, number]; // [lat, lng]
  elevationM: number;
  elevationMeters: number;
  noahHazardLevel: number;
  isFlooded: boolean;
  estimatedDepthCm: number;
  hazardScore: number;
  severity: RoadSeverity;
  color: string;
  depthCategory: DepthCategory;
  lineWeight: number;
  drivableVehicles: string[];
  nearestStation: {
    stationId: string;
    stationName: string;
    distanceKm: number;
    waterLevel: number;
    rain1h: number;
    delta1h: number;
  };
  isNearRiver: boolean;
  nationalRoute?: string;
  roadClassification?: string;
  region?: string;
  description?: string;
}

export interface FloodHeatmapPoint {
  lat: number;
  lng: number;
  intensity: number; // 0.0 to 1.0
  depthCm: number;
  category: FloodRiskCategory;
  radius: number;
  isFlooded: boolean;
}

/**
 * Calculates estimated standing water accumulation depth (cm)
 * using the calibrated rainfall-activated NOAH hazard model:
 *
 *   Water Depth = (Net Rain) + (NOAH Hazard Contribution) - (Elevation Factor)
 */
export function calculateWaterDepth(
  rainMmHr: number,
  rain24hAccMm: number = 0,
  noahHazardLevel: number = 0,
  elevationM: number = 5,
  drainageCapacity: number = 25
): number {
  const safeRainMmHr = Math.max(0, Number(rainMmHr) || 0);
  const safeRain24h = Math.max(0, Number(rain24hAccMm) || 0);
  const safeHazardLevel = Math.min(3, Math.max(0, Number(noahHazardLevel) || 0));
  const safeElevation = Math.max(0, Number(elevationM) || 0);
  const safeDrainage = Math.max(1, Number(drainageCapacity) || 25);

  // 1. Net Rain Component: Effective rainfall exceeding drainage threshold
  const grossRainfallImpact = safeRainMmHr + safeRain24h * 0.1;
  const netRain = Math.max(0, grossRainfallImpact - safeDrainage);

  // 2. Rainfall-Activated NOAH Hazard Contribution
  const rainfallActivation = Math.min(1, Math.max(0, safeRainMmHr / 35.0));
  const saturationBoost = safeRain24h > 60 ? Math.min(0.3, ((safeRain24h - 60) / 100) * 0.3) : 0;
  const totalActivation = Math.min(1, rainfallActivation + saturationBoost);

  const maxNoahDepthCm = NOAH_DEPTH_TABLE[safeHazardLevel] ?? 0;
  const hazardContribution = maxNoahDepthCm * totalActivation;

  // 3. Elevation Factor Component: Higher elevation reduces standing water depth
  const elevationFactor = Math.max(0, safeElevation * 0.5);

  // 4. Combined Water Depth (cm)
  const rawDepthCm = netRain + hazardContribution - elevationFactor;
  return Math.max(0, Math.round(rawDepthCm * 10) / 10);
}

/**
 * Classifies flood risk level into color codes and passable vehicles.
 */
export function classifyFloodRisk(depthCm: number): {
  category: FloodRiskCategory;
  severity: RoadSeverity;
  depthCategory: DepthCategory;
  color: string;
  label: string;
  lineWeight: number;
  passableVehicles: string[];
} {
  if (depthCm > 28) {
    return {
      category: "CRITICAL",
      severity: "CRITICAL",
      depthCategory: "Waist Deep+",
      color: "#7f1d1d", // Dark Red
      label: "Waist Deep / Impassable (>28 cm)",
      lineWeight: 6,
      passableVehicles: ["Truck / Heavy 4x4 Only", "Heavy Rescue Only"],
    };
  }

  if (depthCm >= 15) {
    return {
      category: "HIGH",
      severity: "ALARM",
      depthCategory: "Half-Tire Deep",
      color: "#ef4444", // Red
      label: "Half-Tire Deep (15–28 cm)",
      lineWeight: 6,
      passableVehicles: ["SUV / Pickup", "Truck / Heavy 4x4"],
    };
  }

  if (depthCm >= 5) {
    return {
      category: "LOW",
      severity: "ALERT",
      depthCategory: "Gutter Deep",
      color: "#f97316", // Orange
      label: "Gutter Deep (5–14 cm)",
      lineWeight: 5,
      passableVehicles: ["Sedan / Compact", "SUV / Pickup", "Truck / Heavy 4x4"],
    };
  }

  return {
    category: "NORMAL",
    severity: "NORMAL",
    depthCategory: "Normal / Clear",
    color: "#00b4d8", // Blue
    label: "Normal / Clear (0–4 cm)",
    lineWeight: 4,
    passableVehicles: ["All Vehicles (Sedan, Motorcycle, SUV, Truck)"],
  };
}

/**
 * Evaluates a single coordinate point for real-time flood exposure.
 */
export async function evaluateLocation(
  lat: number,
  lng: number,
  options?: {
    noahLevelOverride?: number;
    stations?: LiveStation[];
    meteo?: DistrictRainfall;
  }
): Promise<EvaluatedLocation> {
  const stations = options?.stations || (await getLatestTelemetryStations());
  const meteo = options?.meteo || (await getDistrictRainfall(lat, lng));
  const elevationM = await getElevation(lat, lng);

  const noahHazard = options?.noahLevelOverride !== undefined
    ? { noahLevel: options.noahLevelOverride, drainageCapacity: 25 }
    : getNearestNoahHazard(lat, lng);

  // Interpolate rainfall from stations
  const { rain1h: stRain1h, rain24h: stRain24h, riverAlertWeight } = interpolateRainfall(
    lat,
    lng,
    stations,
    meteo.currentRainMmHr,
    meteo.rain24hMm
  );

  const effectiveRain1h = Math.max(stRain1h, meteo.currentRainMmHr * 0.85);
  const effectiveRain24h = Math.max(stRain24h, meteo.rain24hMm * 0.85);

  let calculatedDepth = calculateWaterDepth(
    effectiveRain1h,
    effectiveRain24h,
    noahHazard.noahLevel,
    elevationM,
    noahHazard.drainageCapacity
  );

  // River surge bonus
  if (riverAlertWeight > 0.3) {
    calculatedDepth += riverAlertWeight * 12;
  }

  const depthCm = Math.round(calculatedDepth * 10) / 10;
  const classification = classifyFloodRisk(depthCm);

  // Compute composite hazard score (0 - 100)
  const rainFactor = Math.min(1.0, effectiveRain1h / 30.0);
  const depthFactor = Math.min(1.0, depthCm / 45.0);
  const elevFactor = Math.max(0, 1.0 - elevationM / 25.0);
  const hazardScore = Math.round(
    Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
  );

  return {
    lat,
    lng,
    isFlooded: depthCm >= 5,
    depthCm,
    hazardScore,
    riskCategory: classification.category,
    severity: classification.severity,
    color: depthCm < 5 ? "#00b4d8" : classification.color,
    label: classification.label,
    elevationM,
    noahLevel: noahHazard.noahLevel,
    effectiveRain1h,
    effectiveRain24h,
    drivableVehicles: classification.passableVehicles,
  };
}

/**
 * Batch evaluates monitored road corridors, optionally filtered by viewport bounding box.
 */
export async function evaluateMonitoredRoads(
  stations?: LiveStation[],
  regionalMeteo?: DistrictRainfall,
  bbox?: [number, number, number, number]
): Promise<EvaluatedRoadRisk[]> {
  const activeStations = stations || (await getLatestTelemetryStations());
  const allRoads: NoahRoadSegment[] = getNoahRoadSegments();
  const roads = bbox ? getRoadsInBBox(bbox, allRoads) : allRoads;
  const activeRoadsList = roads.length > 0 ? roads : allRoads;

  // Compute centroids
  const centroids: [number, number][] = activeRoadsList.map((road) => {
    let sumLat = 0;
    let sumLng = 0;
    road.coordinates.forEach(([lng, lat]) => {
      sumLat += lat;
      sumLng += lng;
    });
    return [sumLat / road.coordinates.length, sumLng / road.coordinates.length];
  });

  // Batch query elevations from database / Open-Meteo store
  const elevations = await getElevationsForCoordinates(centroids);
  const fallbackMeteo = regionalMeteo || (await getDistrictRainfall(14.6, 121.0));

  return activeRoadsList.map((road, idx) => {
    const [centLat, centLng] = centroids[idx];
    const elevationM = elevations[idx] ?? road.elevationM;

    // Find nearest station
    let nearestSt: LiveStation | null = null;
    let minDist = Infinity;

    if (activeStations && activeStations.length > 0) {
      for (const st of activeStations) {
        if (!st.latitude || !st.longitude) continue;
        const d = haversineKm(centLat, centLng, st.latitude, st.longitude);
        if (d < minDist) {
          minDist = d;
          nearestSt = st;
        }
      }
    }

    const distWeight = Math.exp(-minDist / 8.0);
    const stationRain1h = nearestSt?.rain1h ?? fallbackMeteo.currentRainMmHr;
    const stationRain24h = nearestSt?.rain24h ?? fallbackMeteo.rain24hMm;

    const effectiveRain1h = Math.round(Math.max(stationRain1h * distWeight, fallbackMeteo.currentRainMmHr * 0.8) * 10) / 10;
    const effectiveRain24h = Math.round(Math.max(stationRain24h * distWeight, fallbackMeteo.rain24hMm * 0.8) * 10) / 10;

    let depthCm = calculateWaterDepth(
      effectiveRain1h,
      effectiveRain24h,
      road.noahHazardLevel,
      elevationM,
      road.drainageCapacity
    );

    // River gauge alert surge
    const isNearRiver = minDist <= 0.5;
    if (isNearRiver && (nearestSt?.riskLevel === "CRITICAL" || nearestSt?.riskLevel === "ALARM")) {
      depthCm += nearestSt.riskLevel === "CRITICAL" ? 15 : 8;
    }

    depthCm = Math.round(depthCm * 10) / 10;
    const classification = classifyFloodRisk(depthCm);

    const rainFactor = Math.min(1.0, effectiveRain1h / 30.0);
    const depthFactor = Math.min(1.0, depthCm / 50.0);
    const elevFactor = Math.max(0, 1.0 - elevationM / 20.0);
    const hazardScore = Math.round(
      Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
    );

    return {
      roadId: road.id,
      roadName: road.name,
      coordinates: road.coordinates,
      centroid: [centLat, centLng],
      elevationM,
      elevationMeters: elevationM,
      noahHazardLevel: road.noahHazardLevel,
      isFlooded: depthCm >= 5,
      estimatedDepthCm: depthCm,
      hazardScore,
      severity: classification.severity,
      color: depthCm < 5 ? "#00b4d8" : classification.color,
      depthCategory: classification.depthCategory,
      lineWeight: classification.lineWeight,
      drivableVehicles: classification.passableVehicles,
      nearestStation: {
        stationId: nearestSt?.stationId ?? "station-none",
        stationName: nearestSt?.stationName ?? "Telemetry Offline",
        distanceKm: Number(minDist.toFixed(1)),
        waterLevel: nearestSt?.waterLevel ?? 0,
        rain1h: effectiveRain1h,
        delta1h: nearestSt?.waterLevelDelta1h ?? 0,
      },
      isNearRiver,
      nationalRoute: road.nationalRoute,
      roadClassification: road.roadClassification,
      region: road.region,
      description: road.description,
    };
  });
}

/**
 * Precomputes spatial heatmap points across nationwide reference nodes and telemetry stations.
 */
export async function evaluateHeatmapPoints(
  stations?: LiveStation[],
  regionalMeteo?: DistrictRainfall,
  bbox?: [number, number, number, number]
): Promise<FloodHeatmapPoint[]> {
  const activeStations = stations || (await getLatestTelemetryStations());
  const meteo = regionalMeteo || (await getDistrictRainfall(14.6, 121.0));
  const points: FloodHeatmapPoint[] = [];

  // 1. Telemetry station points across the active region
  activeStations.forEach((st) => {
    if (!st.latitude || !st.longitude || isNaN(st.latitude) || isNaN(st.longitude)) return;
    if (bbox) {
      const [south, west, north, east] = bbox;
      if (st.latitude < south - 0.25 || st.latitude > north + 0.25 || st.longitude < west - 0.25 || st.longitude > east + 0.25) {
        return;
      }
    }

    const rain1h = st.rain1h ?? meteo.currentRainMmHr;
    const rain24h = st.rain24h ?? meteo.rain24hMm;
    const hazardLevel = st.riskLevel === "CRITICAL" ? 3 : st.riskLevel === "ALARM" ? 2 : 1;

    const depth = calculateWaterDepth(rain1h, rain24h, hazardLevel, 4.0, 22);
    const intensity = Math.min(1.0, Math.max(0.05, depth / 40.0));
    const classification = classifyFloodRisk(depth);

    // Only render heatmap blob if there is measurable rainfall, water level elevation, or flood depth
    const hasActivity = depth >= 4 || rain1h >= 2.0 || rain24h >= 15.0 || st.riskLevel !== "NORMAL";
    if (hasActivity) {
      points.push({
        lat: st.latitude,
        lng: st.longitude,
        intensity,
        depthCm: depth,
        category: classification.category,
        radius: 30 + intensity * 25,
        isFlooded: depth >= 5,
      });
    }
  });

  // 2. Nationwide NOAH hotspots (filtered to viewport or full list)
  NOAH_PHILIPPINES_HOTSPOTS.forEach((spot: NoahHotspotNode) => {
    if (bbox) {
      const [south, west, north, east] = bbox;
      if (spot.lat < south - 0.25 || spot.lat > north + 0.25 || spot.lng < west - 0.25 || spot.lng > east + 0.25) {
        return;
      }
    }

    const { rain1h, rain24h, riverAlertWeight } = interpolateRainfall(
      spot.lat,
      spot.lng,
      activeStations,
      meteo.currentRainMmHr,
      meteo.rain24hMm
    );

    let depth = calculateWaterDepth(rain1h, rain24h, spot.noahLevel, spot.elevationM, spot.drainage);
    if (riverAlertWeight > 0.3) {
      depth += riverAlertWeight * 12;
    }

    const roundedDepth = Math.round(depth * 10) / 10;
    const classification = classifyFloodRisk(roundedDepth);
    const intensity = Math.min(1.0, Math.max(0.05, roundedDepth / 45.0));

    // Only render hotspot on heatmap if active rainfall or flood risk is present
    const hasActivity = roundedDepth >= 4 || rain1h >= 2.0 || rain24h >= 15.0 || riverAlertWeight > 0.2;
    if (hasActivity) {
      points.push({
        lat: spot.lat,
        lng: spot.lng,
        intensity,
        depthCm: roundedDepth,
        category: classification.category,
        radius: 25 + intensity * 30,
        isFlooded: roundedDepth >= 5,
      });
    }
  });

  return points;
}
