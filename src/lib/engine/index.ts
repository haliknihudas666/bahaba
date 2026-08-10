// ---------------------------------------------------------------------------
// Bahaba – Flood Engine: Barrel Export
// ---------------------------------------------------------------------------

export { extractFeatures, calculateFloodRisk } from "./heuristics";
export { predictFloodRisk, getSession, resetSession } from "./inference";
export {
  calculateRoadRisk,
  calculateLineCentroid,
  calculateHaversineDistance,
  classifySeverity,
  SEVERITY_RULES,
} from "./roadRisk";

export type {
  FloodEstimation,
  FloodFeatures,
  FloodDepthCategory,
  RiskLevel,
} from "@/types/flood-engine";

export type {
  RoadSeverity,
  RoadRiskResult,
  GeoJSONLineStringFeature,
} from "./roadRisk";
