// ---------------------------------------------------------------------------
// Bahaba – Flood Engine: Barrel Export
// ---------------------------------------------------------------------------

export { extractFeatures, calculateFloodRisk } from "./heuristics";
export { predictFloodRisk, getSession, resetSession } from "./inference";
export {
  calculateRoadRisk,
  isRiverGaugeStation,
  calculateLineCentroid,
  calculateHaversineDistance,
  classifySeverity,
  SEVERITY_RULES,
  MAX_PAGASA_RAIN_RADIUS_KM,
  MAX_PAGASA_WATER_LEVEL_RADIUS_KM,
  RIVERBANK_ZONE_KM,
  RIVERBANK_MAX_RADIUS_KM,
} from "./roadRisk";

export {
  calculateWaterDepth,
  classifyFloodRisk,
  predictRoadFloodRisk,
  predictProjectedFloodDepth,
} from "./floodPredictor";

export {
  fetchDistrictRainfall,
  batchFetchDistrictRainfall,
  type DistrictRainfall,
  type RainfallTrend,
} from "@/lib/geo/meteo-rainfall";

export type {
  RouteOption,
  RouteSegmentData,
  RouteWeatherForecast,
  TravelMode,
  VehicleType,
} from "./routeSolver";

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

