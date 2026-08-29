// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Spatial Risk Matcher for Metro Manila Road Network
// ---------------------------------------------------------------------------

import type { LiveStation } from "@/types";

// ---------------------------------------------------------------------------
// Types & Interfaces
// ---------------------------------------------------------------------------

export type RoadSeverity = "NORMAL" | "ALERT" | "ALARM" | "CRITICAL";

export interface RoadRiskResult {
  /** Name or identifier of the road segment */
  roadName: string;
  /** Road elevation in meters (EL.m) */
  elevationMeters: number;
  /** Severity level based on predicted water depth */
  severity: RoadSeverity;
  /** Google Maps-style traffic severity color hex */
  color: string;
  /** Leaflet polyline rendering weight (3 - 6 px) */
  lineWeight: number;
  /** Estimated flood water depth on road surface in centimeters */
  estimatedDepthCm: number;
  /** Human-readable flood depth description */
  depthCategory: "Normal / Clear" | "Gutter Deep" | "Half-Tire Deep" | "Waist Deep+";
  /** Nearest PAGASA telemetry station metadata */
  nearestStation: {
    stationId: string;
    stationName: string;
    distanceKm: number;
    waterLevel: number;
    rain1h: number;
    delta1h: number;
  };
  /** Vehicle types capable of safely traversing this road segment */
  drivableVehicles: string[];
  /** Calculated composite hazard score (0 - 100) */
  hazardScore: number;
  /** Centroid coordinates of the road segment [lat, lng] */
  centroid: [number, number];
  /** Whether this road is within a riverbank overflow zone (~500m of a river gauge) */
  isNearRiver: boolean;
  /** Official DPWH Route Number (e.g. "N1 / AH26", "N170", "N2", "N11") */
  nationalRoute?: string;
  /** DPWH Highway classification */
  roadClassification?: string;
  /** Administrative region (e.g. "NCR (Metro Manila)", "Region III (Central Luzon)") */
  region?: string;
  /** Detailed description or corridor notes */
  description?: string;
}

export interface GeoJSONLineStringFeature {
  type: "Feature";
  properties?: Record<string, any>;
  geometry: {
    type: "LineString" | "MultiLineString";
    coordinates: number[][] | number[][][];
  };
}

// ---------------------------------------------------------------------------
// Color & Severity Rules Configuration
// ---------------------------------------------------------------------------

export const SEVERITY_RULES = {
  NORMAL: {
    label: "NORMAL",
    minCm: 0,
    maxCm: 4,
    hex: "#00b4d8", // Blue
    weight: 3,
    description: "Normal / Clear (0–4 cm water predicted)",
    depthCategory: "Normal / Clear",
  },
  ALERT: {
    label: "ALERT",
    minCm: 5,
    maxCm: 14,
    hex: "#f97316", // Orange
    weight: 4,
    description: "Low Risk / Alert (5–14 cm / Gutter Deep)",
    depthCategory: "Gutter Deep",
  },
  ALARM: {
    label: "ALARM",
    minCm: 15,
    maxCm: 28,
    hex: "#ef4444", // Red
    weight: 5,
    description: "High Risk / Alarm (15–28 cm / Half-Tire Deep)",
    depthCategory: "Half-Tire Deep",
  },
  CRITICAL: {
    label: "CRITICAL",
    minCm: 29,
    maxCm: Infinity,
    hex: "#7f1d1d", // Dark Red
    weight: 6,
    description: "Critical / Impassable (>28 cm / Waist Deep+)",
    depthCategory: "Waist Deep+",
  },
} as const;

// ---------------------------------------------------------------------------
// Spatial Calculations: Centroid & Distance (Turf compatible)
// ---------------------------------------------------------------------------

/**
 * Calculate the geographical centroid [lat, lng] of a GeoJSON LineString.
 */
export function calculateLineCentroid(coordinates: number[][] | number[][][]): [number, number] {
  let points: number[][] = [];

  if (Array.isArray(coordinates[0]) && typeof coordinates[0][0] === "number") {
    // Standard LineString [[lng, lat], [lng, lat], ...]
    points = coordinates as number[][];
  } else if (Array.isArray(coordinates[0])) {
    // MultiLineString [[[lng, lat], ...], ...]
    points = (coordinates as number[][][]).flat();
  }

  if (!points.length) {
    return [14.633, 121.095]; // Default Metro Manila fallback
  }

  let sumLat = 0;
  let sumLng = 0;

  points.forEach(([lng, lat]) => {
    sumLat += lat;
    sumLng += lng;
  });

  return [sumLat / points.length, sumLng / points.length];
}

/**
 * Haversine formula to compute distance between two lat/lng points in kilometers.
 */
export function calculateHaversineDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------------------------------------------------------------------------
// Core Spatial Risk Matcher — Rainfall-Primary Model
// ---------------------------------------------------------------------------

/**
 * Urban runoff coefficient for impervious road surfaces.
 */
const URBAN_RUNOFF_COEFFICIENT = 0.8;

/**
 * Base drainage capacity (mm/hr) of Metro Manila storm drains.
 */
const BASE_DRAINAGE_CAPACITY_MM_HR = 10;

/**
 * Low-elevation threshold for ponding multiplier.
 */
const LOW_ELEVATION_THRESHOLD_M = 3.0;
const LOW_ELEVATION_PONDING_MULTIPLIER = 1.5;

/**
 * Conversion factor: net rainfall excess (mm) → road surface depth (cm).
 */
const RAINFALL_TO_DEPTH_CM = 0.15;

/**
 * Spatial validity radius limits for PAGASA telemetry sensors:
 * - Rainfall AWS / Synoptic stations are valid within 5-10 km (hard cutoff at 10.0 km).
 * - Water level / river basin gauges are strictly localized to river channels (<= 2.0 km, absolute max 5.0 km).
 */
export const MAX_PAGASA_RAIN_RADIUS_KM = 10.0;
export const MAX_PAGASA_WATER_LEVEL_RADIUS_KM = 2.0;
export const RIVERBANK_ZONE_KM = 0.5;
export const RIVERBANK_MAX_RADIUS_KM = 5.0;

/**
 * Maximum fluvial overflow bonus (cm) for roads near rivers at CRITICAL.
 */
const FLUVIAL_OVERFLOW_MAX_BONUS_CM = 20;

/**
 * SSI decay rate for soil saturation model.
 */
const SSI_DECAY_RATE = 0.019;

// ---------------------------------------------------------------------------
// River Basin Identification Helper
// ---------------------------------------------------------------------------

/**
 * Determines whether a given station is a River Basin water level/stage gauge.
 */
export function isRiverGaugeStation(st: LiveStation): boolean {
  if (!st) return false;
  const name = (st.stationName || "").toLowerCase();
  const id = (st.stationId || "").toLowerCase();

  return (
    name.includes("river basin") ||
    name.includes("water level") ||
    name.includes(" wl ") ||
    name.endsWith(" wl") ||
    id.includes("riverbasin") ||
    id.includes("water-level") ||
    st.waterLevel > 0 ||
    (st.waterRiskLevel !== undefined &&
      st.waterRiskLevel !== "NORMAL" &&
      st.waterRiskLevel !== "UNKNOWN")
  );
}

/**
 * Evaluates road-level flood risk by fusing:
 *   1. Hyper-local district rainfall (Open-Meteo & Panahon AWS) for pluvial road pooling
 *   2. Proximity to active River Basin water level gauges for fluvial overflow surge
 *
 * @param roadFeature - GeoJSON LineString road feature
 * @param stations - Array of active PAGASA/Panahon station telemetry records
 * @param districtRainfall - Optional hyper-local Open-Meteo district precipitation
 * @returns RoadRiskResult containing severity, depth, hex color, line weight, and popup metadata
 */
export function calculateRoadRisk(
  roadFeature: GeoJSONLineStringFeature,
  stations: LiveStation[],
  districtRainfall?: { currentRainMmHr: number; rain24hMm: number; forecast3hTotalMm?: number; forecastPeakMmHr?: number }
): RoadRiskResult {
  const roadName = roadFeature.properties?.name || roadFeature.properties?.highway || "Unnamed Road";
  const roadElevation = roadFeature.properties?.elevation ?? 4.0; // Default 4.0m EL.m for low-lying urban areas

  // 1. Calculate Centroid [lat, lng]
  const centroid = calculateLineCentroid(roadFeature.geometry.coordinates);
  const [roadLat, roadLng] = centroid;

  // 2. Find Nearest Telemetry Station
  if (!stations || stations.length === 0) {
    return createFallbackRiskResult(
      roadName,
      roadElevation,
      centroid,
      roadFeature.properties?.nationalRoute,
      roadFeature.properties?.roadClassification,
      roadFeature.properties?.region,
      roadFeature.properties?.description
    );
  }

  let nearestStation: LiveStation = stations[0];
  let minDistanceKm = Infinity;

  // Track nearest river station separately
  let nearestRiverStation: LiveStation | null = null;
  let minRiverDistanceKm = Infinity;

  for (const st of stations) {
    if (!st.latitude || !st.longitude) continue;
    const dist = calculateHaversineDistance(roadLat, roadLng, st.latitude, st.longitude);
    if (dist < minDistanceKm) {
      minDistanceKm = dist;
      nearestStation = st;
    }

    if (isRiverGaugeStation(st) && dist < minRiverDistanceKm) {
      minRiverDistanceKm = dist;
      nearestRiverStation = st;
    }
  }

  // 3. Proximity Distance Decay Factor for rainfall data with 10km spatial validity cutoff
  const distanceWeight = minDistanceKm <= MAX_PAGASA_RAIN_RADIUS_KM
    ? Math.exp(-minDistanceKm / 6.0)
    : 0;

  // 4. Extract Telemetry Signals from Nearest Station + Optional District Rainfall
  const stationRain1h = nearestStation.rain1h ?? 0;
  const stationRain24h = nearestStation.rain24h ?? 0;
  const stationRain10m = nearestStation.rain10m ?? 0;

  // Predictive rain rate: Current Rain + 3h Forecast Total
  const meteoPredictiveRain = districtRainfall
    ? Math.max(districtRainfall.currentRainMmHr, districtRainfall.forecastPeakMmHr ?? 0) + (districtRainfall.forecast3hTotalMm ?? 0) * 0.8
    : 0;

  // Fuse Open-Meteo hyper-local district rainfall with ground-truth AWS station telemetry
  const effectiveRain1h = districtRainfall
    ? Math.max(meteoPredictiveRain, stationRain1h * distanceWeight)
    : stationRain1h * distanceWeight;

  const effectiveRain24h = districtRainfall
    ? Math.max(districtRainfall.rain24hMm + (districtRainfall.forecast3hTotalMm ?? 0), stationRain24h * distanceWeight)
    : stationRain24h * distanceWeight;

  // 5. Pluvial Depth Estimation (Rainfall-Driven)
  const soilSaturationIndex = 1 - Math.exp(-SSI_DECAY_RATE * effectiveRain24h);
  const effectiveDrainageMmHr =
    BASE_DRAINAGE_CAPACITY_MM_HR * (1 - soilSaturationIndex * 0.8);

  const netRainfallExcessMm = Math.max(
    0,
    effectiveRain1h * URBAN_RUNOFF_COEFFICIENT - effectiveDrainageMmHr,
  );

  let pluvialDepthCm = netRainfallExcessMm * RAINFALL_TO_DEPTH_CM;

  // Low-elevation ponding bonus
  if (roadElevation <= LOW_ELEVATION_THRESHOLD_M) {
    pluvialDepthCm *= LOW_ELEVATION_PONDING_MULTIPLIER;
  }

  // Burst-rain bonus from 10-min intensity
  const effectiveRain10m = stationRain10m * distanceWeight;
  if (effectiveRain10m > 5) {
    pluvialDepthCm += (effectiveRain10m - 5) * 0.2;
  }

  // 6. Fluvial Overflow Component (River-only, strictly localized within valid riverbank radius)
  const isNearRiver =
    minRiverDistanceKm <= RIVERBANK_MAX_RADIUS_KM &&
    (minRiverDistanceKm <= RIVERBANK_ZONE_KM ||
      (minDistanceKm <= RIVERBANK_ZONE_KM && isRiverGaugeStation(nearestStation)));

  let fluvialBonusCm = 0;

  if (isNearRiver && nearestRiverStation && minRiverDistanceKm <= RIVERBANK_MAX_RADIUS_KM) {
    const riverRisk = nearestRiverStation.riskLevel;
    const riverProximityWeight = Math.max(0, 1 - minRiverDistanceKm / RIVERBANK_MAX_RADIUS_KM);

    if (riverRisk === "CRITICAL") {
      fluvialBonusCm = FLUVIAL_OVERFLOW_MAX_BONUS_CM * riverProximityWeight;
    } else if (riverRisk === "ALARM") {
      fluvialBonusCm = FLUVIAL_OVERFLOW_MAX_BONUS_CM * 0.5 * riverProximityWeight;
    }
    // Add water level surge contribution for near-river roads
    const riverWaterDelta1h = nearestRiverStation.waterLevelDelta1h ?? 0;
    const surgeCm = Math.max(0, riverWaterDelta1h) * 100 * 0.3 * riverProximityWeight;
    fluvialBonusCm += surgeCm;
  }

  const estimatedDepthCm = Math.round(Math.max(0, pluvialDepthCm + fluvialBonusCm));

  // 7. Calculate Hazard Score (0 - 100)
  const rainScore = Math.min(1.0, effectiveRain1h / 30.0); // 30mm/hr ceiling
  const depthScore = Math.min(1.0, estimatedDepthCm / 50.0); // 50cm depth ceiling
  const ssiScore = soilSaturationIndex;

  // Rainfall-weighted hazard: rain (0.40) + depth (0.35) + saturation (0.25)
  const hazardScore = Math.round(
    Math.min(100, (rainScore * 0.40 + depthScore * 0.35 + ssiScore * 0.25) * 100)
  );

  // 8. Map Severity & Color Rules
  const classification = classifySeverity(estimatedDepthCm);

  // 9. Determine Vehicle Traversability
  const drivableVehicles = getDrivableVehicles(estimatedDepthCm);

  return {
    roadName,
    elevationMeters: roadElevation,
    severity: classification.severity,
    color: classification.hex,
    lineWeight: classification.weight,
    estimatedDepthCm,
    depthCategory: classification.depthCategory,
    nearestStation: {
      stationId: nearestStation.stationId,
      stationName: nearestStation.stationName,
      distanceKm: Number(minDistanceKm.toFixed(2)),
      waterLevel: nearestStation.waterLevel,
      rain1h: nearestStation.rain1h,
      delta1h: nearestStation.waterLevelDelta1h,
    },
    drivableVehicles,
    hazardScore,
    centroid,
    isNearRiver,
    nationalRoute: roadFeature.properties?.nationalRoute,
    roadClassification: roadFeature.properties?.roadClassification,
    region: roadFeature.properties?.region,
    description: roadFeature.properties?.description,
  };
}

// ---------------------------------------------------------------------------
// Helpers & Classification Rules
// ---------------------------------------------------------------------------

export function classifySeverity(depthCm: number): {
  severity: RoadSeverity;
  hex: string;
  weight: number;
  depthCategory: "Normal / Clear" | "Gutter Deep" | "Half-Tire Deep" | "Waist Deep+";
} {
  if (depthCm > 28) {
    return {
      severity: "CRITICAL",
      hex: SEVERITY_RULES.CRITICAL.hex,
      weight: SEVERITY_RULES.CRITICAL.weight,
      depthCategory: SEVERITY_RULES.CRITICAL.depthCategory,
    };
  }
  if (depthCm >= 15) {
    return {
      severity: "ALARM",
      hex: SEVERITY_RULES.ALARM.hex,
      weight: SEVERITY_RULES.ALARM.weight,
      depthCategory: SEVERITY_RULES.ALARM.depthCategory,
    };
  }
  if (depthCm >= 5) {
    return {
      severity: "ALERT",
      hex: SEVERITY_RULES.ALERT.hex,
      weight: SEVERITY_RULES.ALERT.weight,
      depthCategory: SEVERITY_RULES.ALERT.depthCategory,
    };
  }
  return {
    severity: "NORMAL",
    hex: SEVERITY_RULES.NORMAL.hex,
    weight: SEVERITY_RULES.NORMAL.weight,
    depthCategory: SEVERITY_RULES.NORMAL.depthCategory,
  };
}

function getDrivableVehicles(depthCm: number): string[] {
  const vehicles: string[] = [];
  if (depthCm <= 10) vehicles.push("Sedan / Hatchback");
  if (depthCm <= 20) vehicles.push("Crossover / SUV");
  if (depthCm <= 40) vehicles.push("4x4 Pickup / Truck");
  if (vehicles.length === 0) vehicles.push("Heavy Rescue / Amphibious Only");
  return vehicles;
}

function createFallbackRiskResult(
  roadName: string,
  roadElevation: number,
  centroid: [number, number],
  nationalRoute?: string,
  roadClassification?: string,
  region?: string,
  description?: string
): RoadRiskResult {
  return {
    roadName,
    elevationMeters: roadElevation,
    severity: "NORMAL",
    color: SEVERITY_RULES.NORMAL.hex,
    lineWeight: SEVERITY_RULES.NORMAL.weight,
    estimatedDepthCm: 0,
    depthCategory: "Normal / Clear",
    nearestStation: {
      stationId: "none",
      stationName: "Telemetry Unavailable",
      distanceKm: 0,
      waterLevel: 0,
      rain1h: 0,
      delta1h: 0,
    },
    drivableVehicles: ["Sedan / Hatchback", "Crossover / SUV", "4x4 Pickup / Truck"],
    hazardScore: 0,
    centroid,
    isNearRiver: false,
    nationalRoute,
    roadClassification,
    region,
    description,
  };
}
