// ---------------------------------------------------------------------------
// Bahaba – Spatial Live Flood Prediction & Heatmap Interpolation Engine
//
// Calculates continuous spatial flood inundation predictions and heatmap
// intensity by fusing:
//   1. Live PAGASA Hydrological Station Telemetry (rain1h, rain24h, water level)
//   2. Live Open-Meteo precipitation intensity
//   3. UP NOAH flood hazard zones (100-Yr Return Period Var 1, 2, 3)
//   4. Road elevation and urban drainage capacity
// ---------------------------------------------------------------------------

import type { LiveStation } from "@/types";
import { calculateWaterDepth, classifyFloodRisk, type FloodRiskCategory } from "./floodPredictor";

export interface FloodHeatmapPoint {
  lat: number;
  lng: number;
  intensity: number; // 0.0 to 1.0
  depthCm: number;
  category: FloodRiskCategory;
  radius: number; // Suggested pixel radius for canvas splat
}

export interface SpatialInundationEstimate {
  lat: number;
  lng: number;
  rain1hMm: number;
  rain24hMm: number;
  noahHazardLevel: number;
  estimatedDepthCm: number;
  riskIntensity: number; // 0.0 - 1.0
  riskCategory: FloodRiskCategory;
  color: string;
  label: string;
}

/**
 * Known critical flood-prone reference nodes across Metro Manila
 * with pre-calibrated NOAH hazard levels and elevations.
 */
export const METRO_MANILA_FLOOD_HOTSPOTS = [
  // 1. Manila / UST / España Corridor (Low elevation, high pluvial accumulation)
  { name: "España Blvd / UST", lat: 14.6065, lng: 120.9895, noahLevel: 3, elevationM: 2.2, drainage: 20 },
  { name: "Sampaloc / Lacson", lat: 14.6090, lng: 120.9950, noahLevel: 3, elevationM: 2.5, drainage: 20 },
  { name: "Taft Ave / PGH", lat: 14.5775, lng: 120.9880, noahLevel: 2, elevationM: 2.8, drainage: 25 },
  { name: "Rizal Ave / Blumentritt", lat: 14.6230, lng: 120.9840, noahLevel: 3, elevationM: 2.0, drainage: 20 },

  // 2. Marikina River Basin (Fluvial & Pluvial extreme risk)
  { name: "Marikina River Park", lat: 14.6335, lng: 121.0965, noahLevel: 3, elevationM: 5.0, drainage: 20 },
  { name: "Sto. Niño Marikina", lat: 14.6465, lng: 121.1010, noahLevel: 3, elevationM: 6.5, drainage: 20 },
  { name: "Tumana Marikina", lat: 14.6620, lng: 121.1080, noahLevel: 3, elevationM: 7.0, drainage: 18 },
  { name: "Nangka Marikina", lat: 14.6750, lng: 121.1160, noahLevel: 3, elevationM: 8.0, drainage: 18 },
  { name: "Provident Village", lat: 14.6220, lng: 121.0920, noahLevel: 3, elevationM: 4.8, drainage: 18 },

  // 3. CAMANAVA (Caloocan, Malabon, Navotas, Valenzuela - Coastal/Tidal Lowland)
  { name: "Malabon City Center", lat: 14.6625, lng: 120.9570, noahLevel: 3, elevationM: 1.2, drainage: 15 },
  { name: "Navotas Coastal Basin", lat: 14.6580, lng: 120.9450, noahLevel: 3, elevationM: 0.8, drainage: 15 },
  { name: "Tullahan River Valenzuela", lat: 14.6850, lng: 120.9750, noahLevel: 3, elevationM: 3.5, drainage: 20 },
  { name: "Polo Valenzuela", lat: 14.7120, lng: 120.9500, noahLevel: 2, elevationM: 2.5, drainage: 20 },

  // 4. San Juan River & Quezon City low-lying areas
  { name: "San Juan River Confluence", lat: 14.5950, lng: 121.0250, noahLevel: 3, elevationM: 3.5, drainage: 22 },
  { name: "E. Rodriguez Sr. Ave", lat: 14.6210, lng: 121.0280, noahLevel: 2, elevationM: 8.0, drainage: 25 },
  { name: "Araneta Ave / Talayan", lat: 14.6310, lng: 121.0080, noahLevel: 3, elevationM: 4.0, drainage: 20 },
  { name: "EDSA / Santolan", lat: 14.6080, lng: 121.0560, noahLevel: 2, elevationM: 12.0, drainage: 25 },

  // 5. Pasig, Mandaluyong & Taguig (Laguna Lake Basin)
  { name: "Pasig City Hall / Kapasigan", lat: 14.5610, lng: 121.0820, noahLevel: 2, elevationM: 4.5, drainage: 25 },
  { name: "Manggahan Floodway", lat: 14.5820, lng: 121.1030, noahLevel: 3, elevationM: 4.0, drainage: 20 },
  { name: "C6 / Taguig Lakeshore", lat: 14.5150, lng: 121.0750, noahLevel: 3, elevationM: 2.5, drainage: 18 },
  { name: "Shaw Blvd / Kalentong", lat: 14.5880, lng: 121.0290, noahLevel: 2, elevationM: 4.0, drainage: 25 },

  // 6. South NCR (Parañaque, Las Piñas, Muntinlupa)
  { name: "Parañaque River / Sucat", lat: 14.4550, lng: 121.0450, noahLevel: 2, elevationM: 3.0, drainage: 22 },
  { name: "Alabang / Zapote Road", lat: 14.4420, lng: 120.9980, noahLevel: 2, elevationM: 4.0, drainage: 22 },
];

/**
 * Computes Haversine distance in kilometers between two points.
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth radius in km
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

/**
 * Inverse Distance Weighting (IDW) interpolation of telemetry rainfall
 * for any geographic point [lat, lng].
 */
export function interpolateRainfall(
  lat: number,
  lng: number,
  stations: LiveStation[],
  fallbackRainRate: number = 0,
  fallbackRain24h: number = 0
): { rain1h: number; rain24h: number; riverAlertWeight: number } {
  if (!stations || stations.length === 0) {
    return {
      rain1h: fallbackRainRate,
      rain24h: fallbackRain24h,
      riverAlertWeight: 0,
    };
  }

  let totalWeight = 0;
  let weightedRain1h = 0;
  let weightedRain24h = 0;
  let weightedAlert = 0;
  const p = 2; // IDW power exponent

  for (const st of stations) {
    if (!st.latitude || !st.longitude || isNaN(st.latitude) || isNaN(st.longitude)) continue;

    const distKm = Math.max(0.2, haversineKm(lat, lng, st.latitude, st.longitude));
    const weight = 1 / Math.pow(distKm, p);

    const alertScore =
      st.riskLevel === "CRITICAL"
        ? 1.0
        : st.riskLevel === "ALARM"
        ? 0.7
        : st.riskLevel === "ALERT"
        ? 0.4
        : 0.0;

    totalWeight += weight;
    weightedRain1h += (st.rain1h ?? fallbackRainRate) * weight;
    weightedRain24h += (st.rain24h ?? fallbackRain24h) * weight;
    weightedAlert += alertScore * weight;
  }

  if (totalWeight === 0) {
    return {
      rain1h: fallbackRainRate,
      rain24h: fallbackRain24h,
      riverAlertWeight: 0,
    };
  }

  const rain1h = Math.max(0, weightedRain1h / totalWeight);
  const rain24h = Math.max(0, weightedRain24h / totalWeight);
  const riverAlertWeight = Math.min(1.0, Math.max(0, weightedAlert / totalWeight));

  return {
    rain1h: Math.round(rain1h * 10) / 10,
    rain24h: Math.round(rain24h * 10) / 10,
    riverAlertWeight,
  };
}

/**
 * Calculates spatial flood inundation prediction for a specific coordinate.
 */
export function estimateInundationAtLocation(
  lat: number,
  lng: number,
  stations: LiveStation[],
  localRainRate: number = 0,
  localRain24h: number = 0,
  noahLevelOverride?: number
): SpatialInundationEstimate {
  // 1. Interpolate live rainfall from PAGASA stations + Open-Meteo
  const { rain1h, rain24h, riverAlertWeight } = interpolateRainfall(
    lat,
    lng,
    stations,
    localRainRate,
    localRain24h
  );

  // 2. Identify nearest NOAH flood hotspot tier
  let noahLevel = noahLevelOverride ?? 1;
  let elevationM = 5.0;
  let drainage = 25;

  let nearestDist = Infinity;
  for (const hotspot of METRO_MANILA_FLOOD_HOTSPOTS) {
    const d = haversineKm(lat, lng, hotspot.lat, hotspot.lng);
    if (d < nearestDist) {
      nearestDist = d;
      if (noahLevelOverride === undefined && d < 3.5) {
        noahLevel = hotspot.noahLevel;
        elevationM = hotspot.elevationM;
        drainage = hotspot.drainage;
      }
    }
  }

  // 3. Compute predicted water depth in cm
  const effectiveRain1h = Math.max(rain1h, localRainRate * 0.8);
  const effectiveRain24h = Math.max(rain24h, localRain24h * 0.8);

  let calculatedDepth = calculateWaterDepth(
    effectiveRain1h,
    effectiveRain24h,
    noahLevel,
    elevationM,
    drainage
  );

  // Bonus for active river alarm/critical alerts in riverbank zones
  if (nearestDist < 1.0 && riverAlertWeight > 0.3) {
    calculatedDepth += riverAlertWeight * 15;
  }

  const roundedDepth = Math.round(calculatedDepth * 10) / 10;
  const classification = classifyFloodRisk(roundedDepth);

  // Normalize risk intensity: 0.0 (0 cm) to 1.0 (>= 45 cm)
  const riskIntensity = Math.min(1.0, Math.max(0.0, roundedDepth / 45.0));

  return {
    lat,
    lng,
    rain1hMm: effectiveRain1h,
    rain24hMm: effectiveRain24h,
    noahHazardLevel: noahLevel,
    estimatedDepthCm: roundedDepth,
    riskIntensity,
    riskCategory: classification.category,
    color: classification.color,
    label: classification.label,
  };
}

/**
 * Generates an array of FloodHeatmapPoint items for canvas heatmap rendering.
 */
export function generateFloodHeatmapPoints(
  stations: LiveStation[],
  liveRainRate: number = 0,
  liveRain24h: number = 0
): FloodHeatmapPoint[] {
  const points: FloodHeatmapPoint[] = [];

  // A. Add PAGASA telemetry station points
  if (stations && stations.length > 0) {
    stations.forEach((st) => {
      if (!st.latitude || !st.longitude || isNaN(st.latitude) || isNaN(st.longitude)) return;

      const rain1h = st.rain1h ?? liveRainRate;
      const rain24h = st.rain24h ?? liveRain24h;
      const hazardLevel = st.riskLevel === "CRITICAL" ? 3 : st.riskLevel === "ALARM" ? 2 : 1;

      const depth = calculateWaterDepth(rain1h, rain24h, hazardLevel, 4.0, 22);
      const intensity = Math.min(1.0, Math.max(0.1, depth / 40.0));
      const classification = classifyFloodRisk(depth);

      points.push({
        lat: st.latitude,
        lng: st.longitude,
        intensity,
        depthCm: depth,
        category: classification.category,
        radius: 35 + intensity * 25,
      });
    });
  }

  // B. Add all calibrated NOAH flood hotspots with live rainfall evaluation
  METRO_MANILA_FLOOD_HOTSPOTS.forEach((spot) => {
    const est = estimateInundationAtLocation(
      spot.lat,
      spot.lng,
      stations,
      liveRainRate,
      liveRain24h,
      spot.noahLevel
    );

    // Only emit active intensity when rainfall or hazard produces flood potential
    const intensity = Math.max(0.05, est.riskIntensity);

    points.push({
      lat: spot.lat,
      lng: spot.lng,
      intensity,
      depthCm: est.estimatedDepthCm,
      category: est.riskCategory,
      radius: 30 + intensity * 30,
    });
  });

  return points;
}
