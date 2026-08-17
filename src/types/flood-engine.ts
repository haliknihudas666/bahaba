// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Hydro-Predictive Flood Engine Types
//
// Shared type definitions for the heuristic scorer and ONNX ML inference module.
// ---------------------------------------------------------------------------

/**
 * Risk classification levels for road flooding.
 * More granular than PAGASA's station-level alert thresholds — these describe
 * the *road-level* impact rather than the hydrological station status.
 */
export type RiskLevel = "LOW" | "MEDIUM" | "HIGH";

/**
 * Human-readable flood depth categories that map to driver decision-making.
 *
 *  • Passable    –  < 10 cm  – dry or puddles, all vehicles OK
 *  • Gutter Deep –  10-20 cm – curb-height water, sedans slow-go
 *  • Half-Tire   –  20-45 cm – half a standard 16″ tire submerged
 *  • Waist Deep  –  > 45 cm  – impassable for most vehicles
 */
export type FloodDepthCategory =
  | "Passable"
  | "Gutter Deep"
  | "Half-Tire"
  | "Waist Deep";

/**
 * Vehicle types with approximate ground-clearance thresholds (cm).
 */
export const VEHICLE_CLEARANCE_CM: Record<string, number> = {
  sedan: 15,
  hatchback: 15,
  suv: 25,
  pickup: 25,
  truck: 40,
  bus: 35,
} as const;

/**
 * Intermediate features computed during feature engineering.
 * These feed into both the heuristic scorer and the ONNX model.
 */
export interface FloodFeatures {
  /** 24-hour cumulative rainfall in mm (proxy for soil saturation) */
  rainfall24h: number;

  /** 1-hour cumulative rainfall in mm */
  rainfall1h: number;

  /** 10-minute rainfall in mm */
  rainfall10m: number;

  /**
   * Soil Saturation Index (SSI) — unit-less 0-1 score.
   * Simplified logistic model: SSI = 1 − e^(−k × rain24h).
   * k is calibrated so that ~100 mm ≈ 0.85 saturation.
   */
  soilSaturationIndex: number;

  /**
   * Rate of water-level rise in m/hr.
   * Positive = rising, negative = receding.
   */
  waterLevelRiseRate: number;

  /** Current water level in meters (EL.m) */
  waterLevelCurrent: number;

  /**
   * Proximity to the critical threshold, 0-1.
   * 0 = at or below normal, 1 = at or above critical.
   * null when thresholds are unavailable.
   */
  criticalProximity: number | null;

  /** Road surface elevation in meters above sea level */
  roadElevation: number;

  /**
   * Rainfall-driven surface runoff depth on road in cm (pluvial flooding).
   * Calculated from rainfall intensity, soil saturation, drainage capacity,
   * and road elevation ponding characteristics.
   */
  pluvialDepthCm: number;

  /**
   * River overflow contribution factor, 0-1.
   * Only non-zero when the road is within the riverbank zone AND the
   * nearest river gauge exceeds alarm level.
   * 0 = no river overflow contribution, 1 = full critical overflow.
   */
  fluvialOverflowFactor: number;

  /**
   * Whether this road is within a riverbank overflow zone (~500m of a
   * river gauge station). River water levels only contribute to road
   * flood depth when this is true.
   */
  isNearRiver: boolean;

  /**
   * Combined estimated maximum water depth *above the road surface* in cm.
   * = pluvialDepthCm + (fluvialOverflowFactor × fluvialBonusCm)
   */
  estimatedDepthCm: number;
}

/**
 * Final output schema returned by all flood estimation methods.
 */
export interface FloodEstimation {
  /**
   * Composite risk score, 0-100.
   *  0-33  → LOW
   * 34-66  → MEDIUM
   * 67-100 → HIGH
   */
  riskScore: number;

  /** Categorical risk level */
  riskLevel: RiskLevel;

  /** Estimated maximum water depth above road surface (cm) */
  maxWaterDepthCm: number;

  /** Flood depth category for human interpretation */
  depthCategory: FloodDepthCategory;

  /**
   * List of vehicle types that can still traverse the road
   * based on estimated depth vs ground clearance.
   */
  drivableBy: string[];

  /** Intermediate features (useful for debugging / explainability) */
  features: FloodFeatures;
}

export interface NoahRoadSegment {
  id: string;
  name: string;
  coordinates: [number, number][]; // [[lng, lat], ...]
  elevationM: number;
  noahHazardLevel: number;
  drainageCapacity: number;
}

