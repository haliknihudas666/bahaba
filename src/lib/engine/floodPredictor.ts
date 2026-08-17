import type { NoahRoadSegment } from "@/types/flood-engine";

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
}

/**
 * Calculates estimated standing water accumulation depth (D_water in cm) using:
 * Water Depth = (Net Rain) + (NOAH Hazard Multiplier * 5) - (Elevation Factor)
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

  // 2. NOAH Hazard Multiplier Component: (noahHazardLevel * 5)
  // Level 0 -> +0cm, Level 1 -> +5cm, Level 2 -> +10cm, Level 3 -> +15cm
  const hazardFactor = safeHazardLevel * 5;

  // 3. Elevation Factor Component: Higher elevation reduces standing water depth
  const elevationFactor = Math.max(0, safeElevation * 0.5);

  // 4. Combined Water Depth (cm)
  const rawDepthCm = netRain + hazardFactor - elevationFactor;

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
  };
}
