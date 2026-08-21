// ---------------------------------------------------------------------------
// Bahaba – Firebase Analytics Helper Module
//
// Safe client-side analytics initialization with custom event telemetry.
// Works seamlessly in Next.js App Router (SSR-safe, browser-only initialization).
// ---------------------------------------------------------------------------

import { clientApp } from "./client";
import { getAnalytics, isSupported, logEvent, type Analytics } from "firebase/analytics";

let analyticsInstance: Analytics | null = null;
let initPromise: Promise<Analytics | null> | null = null;

/**
 * Initializes and retrieves the singleton Firebase Analytics instance.
 * Returns `null` if running server-side or if analytics is unsupported in the browser.
 */
export async function getClientAnalytics(): Promise<Analytics | null> {
  if (typeof window === "undefined" || !clientApp) {
    return null;
  }

  if (analyticsInstance) {
    return analyticsInstance;
  }

  if (!initPromise) {
    initPromise = (async () => {
      try {
        const supported = await isSupported();
        if (supported) {
          analyticsInstance = getAnalytics(clientApp);
          return analyticsInstance;
        }
      } catch (err) {
        console.warn("[Firebase Analytics] Not supported or failed to initialize:", err);
      }
      return null;
    })();
  }

  return initPromise;
}

/**
 * Generic event logger for Firebase Analytics.
 * Silently catches errors to ensure UI flows are never blocked.
 */
export async function logAnalyticsEvent(
  eventName: string,
  eventParams?: Record<string, any>
): Promise<void> {
  try {
    const analytics = await getClientAnalytics();
    if (analytics) {
      logEvent(analytics, eventName, eventParams);
    }
  } catch (err) {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[Firebase Analytics] Error logging "${eventName}":`, err);
    }
  }
}

// ---------------------------------------------------------------------------
// Typed Domain Trackers for Bahaba
// ---------------------------------------------------------------------------

/** Track page views */
export function trackPageView(pagePath?: string, pageTitle?: string) {
  logAnalyticsEvent("page_view", {
    page_location: typeof window !== "undefined" ? window.location.href : "",
    page_path: pagePath || (typeof window !== "undefined" ? window.location.pathname : "/"),
    page_title: pageTitle || (typeof document !== "undefined" ? document.title : "Bahaba"),
  });
}

/** Track Nearest Station Finder queries */
export function trackNearestStationSearch(params: {
  locationName: string;
  latitude: number;
  longitude: number;
  nearestStationName?: string;
  distanceKm?: number;
  riskLevel?: string;
}) {
  logAnalyticsEvent("search_nearest_station", {
    location_name: params.locationName,
    latitude: params.latitude,
    longitude: params.longitude,
    nearest_station: params.nearestStationName ?? "unknown",
    distance_km: params.distanceKm ?? 0,
    risk_level: params.riskLevel ?? "unknown",
  });
}

/** Track Route Directions calculation */
export function trackRouteCalculation(params: {
  origin: string;
  destination: string;
  distanceKm: number;
  durationMin: number;
  maxFloodDepthCm: number;
  overallStatus: string;
  mode?: string;
  vehicleType?: string;
  trafficLevel?: string;
  walkabilityCategory?: string;
}) {
  logAnalyticsEvent("calculate_flood_route", {
    origin: params.origin,
    destination: params.destination,
    distance_km: params.distanceKm,
    duration_min: params.durationMin,
    max_flood_depth_cm: params.maxFloodDepthCm,
    overall_status: params.overallStatus,
    travel_mode: params.mode ?? "driving",
    vehicle_type: params.vehicleType ?? "all",
    traffic_level: params.trafficLevel ?? "SMOOTH",
    walkability_category: params.walkabilityCategory ?? "WALKABLE_CLEAR",
  });
}

/** Track Station selection from map or table */
export function trackStationSelected(params: {
  stationId: string;
  stationName: string;
  waterLevel?: number;
  riskLevel?: string;
  source?: "map" | "table" | "finder" | "telemetry-panel";
}) {
  logAnalyticsEvent("select_station", {
    station_id: params.stationId,
    station_name: params.stationName,
    water_level: params.waterLevel ?? 0,
    risk_level: params.riskLevel ?? "NORMAL",
    source: params.source ?? "table",
  });
}

/** Track Monitored Road Corridor selection */
export function trackRoadSelected(params: {
  roadName: string;
  severity: string;
  estimatedDepthCm: number;
  hazardScore?: number;
}) {
  logAnalyticsEvent("select_monitored_road", {
    road_name: params.roadName,
    severity: params.severity,
    estimated_depth_cm: params.estimatedDepthCm,
    hazard_score: params.hazardScore ?? 0,
  });
}

/** Track Share modal and actions (Story, Card, Copy, Download, WebShare) */
export function trackShareAction(params: {
  action: "open_modal" | "native_share" | "download_png" | "copy_image" | "copy_text";
  format?: "story" | "card";
  targetType?: "route" | "road" | "general";
}) {
  logAnalyticsEvent("share_flood_report", {
    share_action: params.action,
    format: params.format ?? "story",
    target_type: params.targetType ?? "general",
  });
}

/** Track Manual Telemetry sync click */
export function trackTelemetrySync() {
  logAnalyticsEvent("sync_telemetry_trigger", {
    timestamp: new Date().toISOString(),
  });
}

/** Track Table view tab switch */
export function trackTableTabSwitch(
  tabName: "station-telemetry" | "road-predictions" | "nearest-finder" | string
) {
  logAnalyticsEvent("switch_table_tab", {
    tab_name: tabName,
  });
}

/** Track Donation modal and account copy actions */
export function trackDonationAction(params: {
  action: "open_modal" | "copy_bpi" | "copy_bdo" | "copy_email" | "view_image";
}) {
  logAnalyticsEvent("donation_interaction", {
    donation_action: params.action,
  });
}

/** Track About / Info modal interactions */
export function trackAboutAction(params: {
  action: "open_modal" | "tab_switch" | "external_link_click";
  tabName?: string;
  linkName?: string;
}) {
  logAnalyticsEvent("about_interaction", {
    about_action: params.action,
    tab_name: params.tabName ?? "overview",
    link_name: params.linkName,
  });
}


