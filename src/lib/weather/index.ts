// ---------------------------------------------------------------------------
// Bahaba – Weather Module Barrel Export
// ---------------------------------------------------------------------------

export {
  getLatestTelemetryStations,
  getLatestTelemetrySnapshot,
  getDistrictRainfall,
  interpolateRainfall,
  computeRainfallTrend,
  computeConditionLabel,
  toMeteoGridKey,
  haversineKm,
  type DistrictRainfall,
  type RainfallTrend,
  type WeatherCacheDoc,
} from "./weatherService";
