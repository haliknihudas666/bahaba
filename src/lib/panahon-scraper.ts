// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – DOST-PAGASA Panahon Scraper & API Client
//
// Direct integration with DOST-PAGASA Panahon Portal (https://panahon.gov.ph).
// Ingests real-time nationwide telemetry:
//   1. Automated Weather Stations (AWS): Unmanned, computerized units continuously
//      measuring and transmitting real-time telemetry (rainfall, temp, heat index, humidity, wind).
//   2. River Basin Sensors: Real-time Water Levels (m) & Rain Gauges (mm).
//   3. Synoptic Stations (SYNOP): Comprehensive observation centers staffed by human
//      observers recording standard international parameters (3-hr rain, MSLP, weather icon)
//      at scheduled synoptic intervals.
//   4. Cyclone Tracks: Tropical cyclone tracks, coordinates, category, and forecast radius.
// ---------------------------------------------------------------------------

import type {
  FloodRiskLevel,
  LiveStation,
  RainfallReading,
  ScrapeResult,
  StationTelemetry,
  WaterLevelReading,
} from "@/types";

// ---------------------------------------------------------------------------
// Configuration & Defaults
// ---------------------------------------------------------------------------

export const PANAHON_BASE = "https://www.panahon.gov.ph";

/** Default fallback API token provided for Panahon data feeds */
export const DEFAULT_PANAHON_TOKEN =
  process.env.PANAHON_API_TOKEN || "hUkBqcnq8GBpfV4SN4TSVb1fB1eKYeHXEx9WvpvK";

const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// TypeScript Interfaces
// ---------------------------------------------------------------------------

export type PanahonAwsParameter =
  | "rainfall"
  | "temperature"
  | "heat-index"
  | "humidity"
  | "pressure"
  | "wind-speed"
  | "wind-direction";

export type PanahonRiverbasinParameter = "waterlevel" | "raingauge";

export type PanahonSynopParameter =
  | "observed_weather"
  | "rain"
  | "currentTemp"
  | "mslp"
  | "windSpeed"
  | "windDirection";

export interface PanahonRawItem {
  site_id: string;
  site_name: string;
  lat: number | string;
  lon: number | string;
  parameter: string;
  readable_parameter?: string;
  readable_unit?: string;
  observed_at?: string;
  value: string | number | null;
  "24_hr_value"?: string | number | null;
  province?: string;
  region?: string;
  min_zoom?: number;
  [key: string]: unknown;
}

export interface PanahonApiResponse<T = PanahonRawItem[]> {
  success: boolean;
  data?: T;
  message?: string;
}

export interface PanahonCycloneTrackPoint {
  cyclone_type: string;
  date: string;
  time: string;
  latitude: string;
  longitude: string;
  radius: string;
}

export interface PanahonCycloneTrackItem {
  cyclone_name: string;
  info: Record<string, PanahonCycloneTrackPoint>;
}

export interface PanahonEnrichedStation extends StationTelemetry {
  siteId?: string;
  temperatureC?: number | null;
  heatIndexC?: number | null;
  humidityPercent?: number | null;
  pressureHpa?: number | null;
  windSpeedMs?: number | null;
  windDirectionDeg?: number | null;
  weatherDescription?: string | null;
  weatherIconUrl?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers & Sanitizers
// ---------------------------------------------------------------------------

/**
 * Clean numeric string/number to a finite float.
 */
export function cleanNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = String(val)
    .trim()
    .replace(/\u00a0/g, "")
    .replace(/\(\*?\)/g, "")
    .replace(/\*/g, "")
    .replace(/,/g, "")
    .trim();

  if (cleaned === "-" || cleaned === "--" || cleaned === "" || cleaned.toLowerCase() === "null") {
    return 0;
  }
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Clean station name: trim, collapse whitespace, decode common accents.
 */
export function cleanStationName(raw: string | undefined): string {
  if (!raw) return "Unknown Station";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ");
}

/**
 * Parse a Panahon timestamp string (`YYYY-MM-DD HH:mm:ss` in UTC+8) to an authoritative UTC ISO string.
 */
export function parseObservedAtToIso(observedAt: string | undefined | null): string {
  if (!observedAt) return new Date().toISOString();
  try {
    const trimmed = observedAt.trim();
    // Handle format "YYYY-MM-DD HH:mm:ss" or "YYYY-MM-DD HH:mm"
    const match = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?/);
    if (match) {
      const [, y, m, d, h, min, s] = match;
      // Interpreted in UTC+8 (Philippine Standard Time)
      const utcMs = Date.UTC(
        parseInt(y, 10),
        parseInt(m, 10) - 1,
        parseInt(d, 10),
        parseInt(h, 10) - 8,
        parseInt(min, 10),
        s ? parseInt(s, 10) : 0
      );
      const date = new Date(utcMs);
      if (!isNaN(date.getTime())) return date.toISOString();
    }

    const directDate = new Date(observedAt);
    if (!isNaN(directDate.getTime())) return directDate.toISOString();
  } catch {
    // fallback
  }
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Session & Token Management
// ---------------------------------------------------------------------------

/**
 * Fetches CSRF token and session cookies dynamically from the Panahon landing page.
 */
export async function getPanahonSession(): Promise<{ token: string; cookies: string } | null> {
  try {
    const res = await fetch(PANAHON_BASE, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) return null;

    const html = await res.text();
    const tokenMatch = html.match(/meta\s+name=["']csrf-token["']\s+content=["']([^"']+)["']/i);
    const token = tokenMatch ? tokenMatch[1] : null;
    if (!token) return null;

    const setCookie = res.headers.get("set-cookie");
    const cookies = setCookie
      ? setCookie
          .split(",")
          .map((c) => c.split(";")[0].trim())
          .join("; ")
      : "";

    return { token, cookies };
  } catch (err) {
    console.warn("[Panahon] Session handshake warning:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Resolve effective token (env variable, param override, default token, or dynamic handshake).
 */
async function resolveToken(tokenOverride?: string): Promise<{ token: string; cookies?: string }> {
  if (tokenOverride) return { token: tokenOverride };
  if (DEFAULT_PANAHON_TOKEN) return { token: DEFAULT_PANAHON_TOKEN };

  const session = await getPanahonSession();
  if (session?.token) {
    return { token: session.token, cookies: session.cookies };
  }

  return { token: DEFAULT_PANAHON_TOKEN };
}

// ---------------------------------------------------------------------------
// Low-Level Fetchers
// ---------------------------------------------------------------------------

/**
 * Fetch Automated Weather Station (AWS) parameter data from Panahon API.
 */
export async function fetchPanahonAws(
  parameter: PanahonAwsParameter = "rainfall",
  tokenOverride?: string
): Promise<PanahonRawItem[]> {
  try {
    const { token, cookies } = await resolveToken(tokenOverride);
    const url = `${PANAHON_BASE}/api/v1/aws?token=${encodeURIComponent(token)}&parameter=${encodeURIComponent(parameter)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: PANAHON_BASE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const json: PanahonApiResponse = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    return json.data;
  } catch (err) {
    console.warn(`[Panahon] AWS fetch error for '${parameter}':`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch River Basin Water Level or Rain Gauge readings from Panahon API.
 */
export async function fetchPanahonRiverbasin(
  parameter: PanahonRiverbasinParameter = "waterlevel",
  tokenOverride?: string
): Promise<PanahonRawItem[]> {
  try {
    const { token, cookies } = await resolveToken(tokenOverride);
    const endpoint = parameter === "raingauge" ? "raingauge" : "waterlevel";
    const url = `${PANAHON_BASE}/api/v1/riverbasin/${endpoint}?token=${encodeURIComponent(token)}&parameter=${encodeURIComponent(parameter)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: PANAHON_BASE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const json: PanahonApiResponse = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    return json.data;
  } catch (err) {
    console.warn(`[Panahon] Riverbasin fetch error for '${parameter}':`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch Synoptic Station parameter data from Panahon API.
 */
export async function fetchPanahonSynop(
  parameter: PanahonSynopParameter = "rain",
  tokenOverride?: string
): Promise<PanahonRawItem[]> {
  try {
    const { token, cookies } = await resolveToken(tokenOverride);
    const url = `${PANAHON_BASE}/api/v1/synop?token=${encodeURIComponent(token)}&parameter=${encodeURIComponent(parameter)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: PANAHON_BASE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const json: PanahonApiResponse = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    return json.data;
  } catch (err) {
    console.warn(`[Panahon] Synop fetch error for '${parameter}':`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetch active Tropical Cyclone Track details from Panahon API.
 */
export async function fetchPanahonCycloneTrack(
  tokenOverride?: string
): Promise<PanahonCycloneTrackItem[]> {
  try {
    const { token, cookies } = await resolveToken(tokenOverride);
    const url = `${PANAHON_BASE}/api/v1/cyclone-track?token=${encodeURIComponent(token)}`;

    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Referer: PANAHON_BASE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
        ...(cookies ? { Cookie: cookies } : {}),
      },
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    if (!res.ok) return [];

    const json = await res.json();
    if (Array.isArray(json)) return json as PanahonCycloneTrackItem[];
    if (json.data && Array.isArray(json.data)) return json.data as PanahonCycloneTrackItem[];

    return [];
  } catch (err) {
    console.warn("[Panahon] Cyclone track fetch error:", err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Risk Classification Engine
// ---------------------------------------------------------------------------

const RISK_WEIGHTS: Record<FloodRiskLevel["label"], number> = {
  CRITICAL: 4,
  ALARM: 3,
  ALERT: 2,
  NORMAL: 1,
  UNKNOWN: 0,
};

/**
 * Classify water level risk based on river water stage heuristics and thresholds.
 */
export function classifyWaterRisk(
  water: WaterLevelReading | null
): FloodRiskLevel["label"] {
  if (!water || water.currentLevel === 0) return "UNKNOWN";

  // If specific PAGASA thresholds are defined:
  if (water.criticalLevel !== null && water.currentLevel >= water.criticalLevel) return "CRITICAL";
  if (water.alarmLevel !== null && water.currentLevel >= water.alarmLevel) return "ALARM";
  if (water.alertLevel !== null && water.currentLevel >= water.alertLevel) return "ALERT";

  // General river gauge stage heuristics (in meters):
  if (water.currentLevel >= 18.0) return "CRITICAL";
  if (water.currentLevel >= 16.0) return "ALARM";
  if (water.currentLevel >= 14.0) return "ALERT";

  return "NORMAL";
}

/**
 * Classify rainfall risk based on PAGASA Heavy Rainfall Warning System:
 *   • CRITICAL (Red):     1-hr rain >= 30 mm OR 24-hr rain >= 150 mm
 *   • ALARM (Orange):     1-hr rain >= 15 mm OR 24-hr rain >= 100 mm
 *   • ALERT (Yellow):     1-hr rain >= 7.5 mm OR 24-hr rain >= 50 mm
 *   • NORMAL:             rainfall recorded below alert levels
 *   • UNKNOWN:            no rainfall data recorded for station
 */
export function classifyRainRisk(
  rain: RainfallReading | null
): FloodRiskLevel["label"] {
  if (!rain) return "UNKNOWN";

  const { rain1hr, rain24hr } = rain;

  if (rain1hr >= 30 || rain24hr >= 150) return "CRITICAL";
  if (rain1hr >= 15 || rain24hr >= 100) return "ALARM";
  if (rain1hr >= 7.5 || rain24hr >= 50) return "ALERT";

  return "NORMAL";
}

/**
 * Determine composite risk level (highest severity between water & rain risk).
 */
export function getCompositeRisk(
  waterRisk: FloodRiskLevel["label"],
  rainRisk: FloodRiskLevel["label"]
): FloodRiskLevel["label"] {
  const wWeight = RISK_WEIGHTS[waterRisk] ?? 0;
  const rWeight = RISK_WEIGHTS[rainRisk] ?? 0;

  if (wWeight >= rWeight && wWeight > 0) return waterRisk;
  if (rWeight > 0) return rainRisk;
  return "UNKNOWN";
}

// ---------------------------------------------------------------------------
// Unified Complete Ingestion Engine
// ---------------------------------------------------------------------------

/**
 * Orchestrates complete real-time telemetry ingestion from DOST-PAGASA Panahon API:
 *   - River Basin Water Levels
 *   - River Basin Rain Gauges
 *   - Automated Weather Stations (AWS) Rainfall, Temperature, Heat Index, Humidity
 *   - Synoptic Station 3-Hour Rainfall
 *
 * Joins by station location, calculates flood & rainfall risks, and outputs standardized ScrapeResult.
 */
export async function fetchPanahonCompleteTelemetry(): Promise<ScrapeResult> {
  const start = Date.now();

  try {
    // Concurrently fetch all relevant Panahon data streams
    const [
      riverWaterRes,
      riverRainRes,
      awsRainRes,
      awsTempRes,
      awsHeatRes,
      awsHumRes,
      synopRainRes,
    ] = await Promise.allSettled([
      fetchPanahonRiverbasin("waterlevel"),
      fetchPanahonRiverbasin("raingauge"),
      fetchPanahonAws("rainfall"),
      fetchPanahonAws("temperature"),
      fetchPanahonAws("heat-index"),
      fetchPanahonAws("humidity"),
      fetchPanahonSynop("rain"),
    ]);

    const riverWaterItems = riverWaterRes.status === "fulfilled" ? riverWaterRes.value : [];
    const riverRainItems = riverRainRes.status === "fulfilled" ? riverRainRes.value : [];
    const awsRainItems = awsRainRes.status === "fulfilled" ? awsRainRes.value : [];
    const awsTempItems = awsTempRes.status === "fulfilled" ? awsTempRes.value : [];
    const awsHeatItems = awsHeatRes.status === "fulfilled" ? awsHeatRes.value : [];
    const awsHumItems = awsHumRes.status === "fulfilled" ? awsHumRes.value : [];
    const synopRainItems = synopRainRes.status === "fulfilled" ? synopRainRes.value : [];

    // Helper lookup key builder
    const makeKey = (lat: number, lon: number, name: string) =>
      `${lat.toFixed(3)}_${lon.toFixed(3)}_${name.toLowerCase().trim()}`;

    // Auxiliary maps for meteorological parameters
    const tempMap = new Map<string, number>();
    for (const item of awsTempItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (lat && lon && item.site_name) {
        tempMap.set(makeKey(lat, lon, item.site_name), cleanNumber(item.value));
      }
    }

    const heatMap = new Map<string, number>();
    for (const item of awsHeatItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (lat && lon && item.site_name) {
        heatMap.set(makeKey(lat, lon, item.site_name), cleanNumber(item.value));
      }
    }

    const humMap = new Map<string, number>();
    for (const item of awsHumItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (lat && lon && item.site_name) {
        humMap.set(makeKey(lat, lon, item.site_name), cleanNumber(item.value));
      }
    }

    const synopRainMap = new Map<string, number>();
    for (const item of synopRainItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (lat && lon && item.site_name) {
        synopRainMap.set(makeKey(lat, lon, item.site_name), cleanNumber(item.value));
      }
    }

    // Consolidated Station Master Map
    const stationMap = new Map<string, PanahonEnrichedStation>();
    const rawRainfallReadings: RainfallReading[] = [];
    const rawWaterLevelReadings: WaterLevelReading[] = [];

    // 1. Process AWS Rainfall Stations
    for (const item of awsRainItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (!lat || !lon) continue;

      const stationName = cleanStationName(item.site_name) || `Panahon AWS ${item.site_id}`;
      const key = makeKey(lat, lon, stationName);
      const rain1h = cleanNumber(item.value);
      const rain24h = cleanNumber(item["24_hr_value"]);
      const rain3h = synopRainMap.get(key) ?? 0;
      const observedAtIso = parseObservedAtToIso(item.observed_at);

      const rainfall: RainfallReading = {
        stationName,
        rain10min: 0,
        rain30min: 0,
        rain1hr: rain1h,
        rain3hr: rain3h,
        rain6hr: 0,
        rain12hr: 0,
        rain24hr: rain24h,
      };

      rawRainfallReadings.push(rainfall);

      const rainRiskLevel = classifyRainRisk(rainfall);
      const waterRiskLevel: FloodRiskLevel["label"] = "NORMAL";
      const riskLevel = getCompositeRisk(waterRiskLevel, rainRiskLevel);

      stationMap.set(key, {
        stationName,
        latitude: lat,
        longitude: lon,
        rainfall,
        waterLevel: null,
        waterRiskLevel,
        rainRiskLevel,
        riskLevel,
        observedAt: observedAtIso,
        siteId: item.site_id,
        temperatureC: tempMap.get(key) ?? null,
        heatIndexC: heatMap.get(key) ?? null,
        humidityPercent: humMap.get(key) ?? null,
      });
    }

    // 2. Process River Basin Rain Gauges
    for (const item of riverRainItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (!lat || !lon) continue;

      const stationName = cleanStationName(item.site_name) || `Riverbasin Rain ${item.site_id}`;
      const key = makeKey(lat, lon, stationName);
      const rain1h = cleanNumber(item.value);
      const observedAtIso = parseObservedAtToIso(item.observed_at);

      const rainfall: RainfallReading = {
        stationName,
        rain10min: 0,
        rain30min: 0,
        rain1hr: rain1h,
        rain3hr: 0,
        rain6hr: 0,
        rain12hr: 0,
        rain24hr: rain1h * 3, // estimation if 24h unavailable
      };

      rawRainfallReadings.push(rainfall);

      const existing = stationMap.get(key);
      if (existing) {
        if (!existing.rainfall || rain1h > existing.rainfall.rain1hr) {
          existing.rainfall = rainfall;
          existing.rainRiskLevel = classifyRainRisk(rainfall);
          existing.riskLevel = getCompositeRisk(existing.waterRiskLevel, existing.rainRiskLevel);
        }
      } else {
        const rainRiskLevel = classifyRainRisk(rainfall);
        stationMap.set(key, {
          stationName: `${stationName} (River Basin)`,
          latitude: lat,
          longitude: lon,
          rainfall,
          waterLevel: null,
          waterRiskLevel: "NORMAL",
          rainRiskLevel,
          riskLevel: rainRiskLevel,
          observedAt: observedAtIso,
          siteId: item.site_id,
        });
      }
    }

    // 3. Process River Basin Water Levels
    for (const item of riverWaterItems) {
      const lat = cleanNumber(item.lat);
      const lon = cleanNumber(item.lon);
      if (!lat || !lon) continue;

      const stationName = cleanStationName(item.site_name) || `Riverbasin WL ${item.site_id}`;
      const key = makeKey(lat, lon, stationName);
      const currentLevel = cleanNumber(item.value);
      const observedAtIso = parseObservedAtToIso(item.observed_at);

      const waterLevel: WaterLevelReading = {
        stationName,
        currentLevel,
        change30min: 0,
        change1hr: 0,
        change2hr: 0,
        alertLevel: null,
        alarmLevel: null,
        criticalLevel: null,
      };

      rawWaterLevelReadings.push(waterLevel);

      const waterRiskLevel = classifyWaterRisk(waterLevel);
      const existing = stationMap.get(key);

      if (existing) {
        existing.waterLevel = waterLevel;
        existing.waterRiskLevel = waterRiskLevel;
        existing.riskLevel = getCompositeRisk(waterRiskLevel, existing.rainRiskLevel);
        if (observedAtIso) existing.observedAt = observedAtIso;
      } else {
        const rainRiskLevel: FloodRiskLevel["label"] = "NORMAL";
        const riskLevel = getCompositeRisk(waterRiskLevel, rainRiskLevel);

        stationMap.set(key, {
          stationName: `${stationName} (Water Level)`,
          latitude: lat,
          longitude: lon,
          rainfall: null,
          waterLevel,
          waterRiskLevel,
          rainRiskLevel,
          riskLevel,
          observedAt: observedAtIso,
          siteId: item.site_id,
        });
      }
    }

    const stations = Array.from(stationMap.values());
    stations.sort((a, b) => a.stationName.localeCompare(b.stationName));

    return {
      success: true,
      scrapedAt: new Date().toISOString(),
      stations,
      rainfall: rawRainfallReadings,
      waterLevels: rawWaterLevelReadings,
      meta: {
        rainfallRowCount: rawRainfallReadings.length,
        waterLevelRowCount: rawWaterLevelReadings.length,
        durationMs: Date.now() - start,
      },
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Panahon telemetry ingestion failed";
    console.error("[Panahon] Complete Ingestion Error:", message);

    return {
      success: false,
      scrapedAt: new Date().toISOString(),
      stations: [],
      rainfall: [],
      waterLevels: [],
      error: message,
      meta: {
        rainfallRowCount: 0,
        waterLevelRowCount: 0,
        durationMs: Date.now() - start,
      },
    };
  }
}

/**
 * Backward-compatible alias for fetching rainfall stations only.
 */
export async function fetchPanahonRainfallStations(): Promise<StationTelemetry[]> {
  const result = await fetchPanahonCompleteTelemetry();
  return result.stations;
}

/**
 * Map Panahon station telemetry directly to LiveStation format for client UI & mapping.
 */
export function convertPanahonToLiveStations(telemetry: StationTelemetry[]): LiveStation[] {
  return telemetry.map((st) => {
    const slug = st.stationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    const lastUpdatedDate = st.observedAt ? new Date(st.observedAt) : new Date();

    return {
      stationId: slug.startsWith("panahon-") ? slug : `panahon-${slug}`,
      stationName: st.stationName,
      latitude: st.latitude ?? 14.5995,
      longitude: st.longitude ?? 120.9842,
      geohash: "",
      rain10m: st.rainfall?.rain10min ?? 0,
      rain1h: st.rainfall?.rain1hr ?? 0,
      rain24h: st.rainfall?.rain24hr ?? 0,
      waterLevel: st.waterLevel?.currentLevel ?? 0,
      waterLevelDelta1h: st.waterLevel?.change1hr ?? 0,
      waterRiskLevel: st.waterRiskLevel,
      rainRiskLevel: st.rainRiskLevel,
      riskLevel: st.riskLevel,
      lastUpdated: isNaN(lastUpdatedDate.getTime()) ? new Date() : lastUpdatedDate,
    };
  });
}
