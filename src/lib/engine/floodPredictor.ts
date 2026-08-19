import type { NoahRoadSegment } from "@/types/flood-engine";
import { NOAH_DEPTH_TABLE, NOAH_DESIGN_STORM_MM_HR } from "@/types/flood-engine";

export type FloodRiskCategory = "NORMAL" | "LOW" | "HIGH" | "CRITICAL";

export interface RiskClassification {
  category: FloodRiskCategory;
  color: string; // Hex color code
  label: string; // Human-readable description
  lineWeight: number; // Suggested Leaflet polyline weight (5-6)
  passableVehicles: string[];
}

export interface NoahRoadFloodPrediction {
  roadId: string;
  roadName: string;
  coordinates: [number, number][];
  elevationM: number;
  noahHazardLevel: number;
  rainMmHr: number;
  rain24hAccMm: number;
  waterDepthCm: number;
  riskCategory: FloodRiskCategory;
  color: string;
  label: string;
  lineWeight: number;
  passableVehicles: string[];
  /** Official DPWH Route Number (e.g. "N1 / AH26", "N170", "N2", "N11") */
  nationalRoute?: string;
  /** DPWH Highway classification */
  roadClassification?: string;
  /** Administrative region */
  region?: string;
}

/**
 * Calculates estimated standing water accumulation depth (D_water in cm)
 * using a rainfall-activated NOAH hazard model:
 *
 *   Water Depth = (Net Rain) + (NOAH Hazard Contribution) - (Elevation Factor)
 *
 * The NOAH hazard contribution is scaled by a rainfall activation ratio
 * rather than a flat multiplier, producing realistic flood depth estimates
 * that correlate with actual weather conditions:
 *
 *   rainfallActivation = clamp(rainMmHr / designStormIntensity, 0, 1)
 *   saturationBoost    = clamp((rain24h - 100) / 100, 0, 0.3)
 *   activation         = clamp(rainfallActivation + saturationBoost, 0, 1)
 *   noahContribution   = NOAH_DEPTH_TABLE[hazardLevel] * activation
 *
 * @param rainMmHr Live rainfall intensity in mm/hr
 * @param rain24hAccMm Cumulative 24-hour rainfall accumulation in mm
 * @param noahHazardLevel UP Project NOAH hazard scale (0 = None, 1 = Low/5-yr, 2 = Medium/25-yr, 3 = High/100-yr)
 * @param elevationM Road altitude above sea level in meters
 * @param drainageCapacity Drainage threshold capacity in mm/hr (default: 25)
 * @returns Calculated water depth in centimeters (rounded to 1 decimal place, minimum 0 cm)
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
  //    Instead of a flat multiplier (old: hazardLevel * 5), scale by how close
  //    the current rainfall is to the 100-year design storm intensity.
  //    At 0 mm/hr → 0 contribution. At 60+ mm/hr → full NOAH depth table value.
  const rainfallActivation = Math.min(1, Math.max(0, safeRainMmHr / NOAH_DESIGN_STORM_MM_HR));

  //    24h saturation boost: sustained rain > 100mm over 24h indicates soil
  //    saturation and accumulated flooding, even if instantaneous rate drops.
  const saturationBoost = safeRain24h > 100
    ? Math.min(0.3, (safeRain24h - 100) / 100 * 0.3)
    : 0;

  const totalActivation = Math.min(1, rainfallActivation + saturationBoost);
  const maxNoahDepthCm = NOAH_DEPTH_TABLE[safeHazardLevel] ?? 0;
  const hazardContribution = maxNoahDepthCm * totalActivation;

  // 3. Elevation Factor Component: Higher elevation reduces standing water depth
  const elevationFactor = Math.max(0, safeElevation * 0.5);

  // 4. Combined Water Depth (cm)
  const rawDepthCm = netRain + hazardContribution - elevationFactor;

  // Constrain depth to non-negative values
  return Math.max(0, Math.round(rawDepthCm * 10) / 10);
}

/**
 * Classifies flood risk level into Google Maps-style color codes and vehicle drivability rules.
 * 
 * Rules:
 * - NORMAL: 0–5 cm (#00b4d8 / Blue)
 * - LOW: 6–15 cm (#f97316 / Orange - Gutter Deep)
 * - HIGH: 16–30 cm (#ef4444 / Red - Half-Tire Deep)
 * - CRITICAL: >30 cm (#7f1d1d / Dark Red - Waist Deep / Impassable)
 */
export function classifyFloodRisk(depthCm: number): RiskClassification {
  if (depthCm > 30) {
    return {
      category: "CRITICAL",
      color: "#7f1d1d", // Dark Red
      label: "Waist Deep / Impassable (>30 cm)",
      lineWeight: 6,
      passableVehicles: ["Truck / Heavy 4x4 Only"],
    };
  }

  if (depthCm >= 16) {
    return {
      category: "HIGH",
      color: "#ef4444", // Red
      label: "Half-Tire Deep (16–30 cm)",
      lineWeight: 6,
      passableVehicles: ["SUV / Pickup", "Truck / Heavy 4x4"],
    };
  }

  if (depthCm >= 6) {
    return {
      category: "LOW",
      color: "#f97316", // Orange
      label: "Gutter Deep (6–15 cm)",
      lineWeight: 5,
      passableVehicles: ["Sedan / Compact", "SUV / Pickup", "Truck / Heavy 4x4"],
    };
  }

  return {
    category: "NORMAL",
    color: "#00b4d8", // Blue
    label: "Normal / Clear (0–5 cm)",
    lineWeight: 5,
    passableVehicles: ["All Vehicles (Sedan, Motorcycle, SUV, Truck)"],
  };
}

/**
 * Runs full offline inundation prediction for a specific NOAH road segment.
 */
export function predictRoadFloodRisk(
  road: NoahRoadSegment,
  rainMmHr: number,
  rain24hAccMm: number = 0
): NoahRoadFloodPrediction {
  const waterDepthCm = calculateWaterDepth(
    rainMmHr,
    rain24hAccMm,
    road.noahHazardLevel,
    road.elevationM,
    road.drainageCapacity
  );

  const classification = classifyFloodRisk(waterDepthCm);

  return {
    roadId: road.id,
    roadName: road.name,
    coordinates: road.coordinates,
    elevationM: road.elevationM,
    noahHazardLevel: road.noahHazardLevel,
    rainMmHr,
    rain24hAccMm,
    waterDepthCm,
    riskCategory: classification.category,
    color: classification.color,
    label: classification.label,
    lineWeight: classification.lineWeight,
    passableVehicles: classification.passableVehicles,
    nationalRoute: road.nationalRoute,
    roadClassification: road.roadClassification,
    region: road.region,
  };
}
