// ---------------------------------------------------------------------------
// Bahaba – Firebase SDK Barrel Export
// ---------------------------------------------------------------------------

export { adminDb, app as adminApp, getAdminFirestore } from "./admin";
export { clientDb, clientApp, getClientFirestore } from "./client";
export { computeGeohash, calculateHaversineDistance } from "./geo-utils";
export { getNearestStationData } from "./geo";
export { getStationCoords, slugifyStationId, METRO_MANILA_CENTROID } from "./station-coords";
export {
  getClientAnalytics,
  logAnalyticsEvent,
  trackPageView,
  trackNearestStationSearch,
  trackRouteCalculation,
  trackStationSelected,
  trackRoadSelected,
  trackShareAction,
  trackTelemetrySync,
  trackTableTabSwitch,
} from "./analytics";
