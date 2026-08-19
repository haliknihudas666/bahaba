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

export {
  NOAH_DEPTH_TABLE,
  NOAH_DESIGN_STORM_MM_HR,
} from "@/types/flood-engine";

export type {
  RoadSeverity,
  RoadRiskResult,
  GeoJSONLineStringFeature,
} from "./roadRisk";

export {
  interpolateRainfall,
  estimateInundationAtLocation,
  generateFloodHeatmapPoints,
  METRO_MANILA_FLOOD_HOTSPOTS,
  type FloodHeatmapPoint,
  type SpatialInundationEstimate,
} from "./liveFloodGrid";

