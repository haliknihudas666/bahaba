// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – PAGASA Telemetry Scraper
//
// Fetches rainfall and water-level data from the Pasig-Marikina-Tullahan
// Flood Forecasting & Warning System's internal JSON APIs.
//
// The PAGASA pages at /rainfall/table.do and /water/table.do are JS-rendered
// shells — the actual data is loaded via AJAX calls to:
//   POST /rainfall/table_list.do  → JSON array of rainfall items
//   POST /water/table_list.do     → JSON array of water-level items
// ---------------------------------------------------------------------------

import https from "node:https";
import axios, { type AxiosInstance } from "axios";
import type {
  RainfallReading,
  WaterLevelReading,
  StationTelemetry,
  ScrapeResult,
} from "@/types";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PAGASA_BASE = "https://pasig-marikina-tullahanffws.pagasa.dost.gov.ph";

/** Internal JSON API endpoints (discovered from the page's jQuery AJAX calls) */
export const RAINFALL_API = `${PAGASA_BASE}/rainfall/table_list.do`;
export const WATERLEVEL_API = `${PAGASA_BASE}/water/table_list.do`;

/** Map endpoints that return station coordinates (lat/lon) alongside telemetry */
export const RAINFALL_MAP_API = `${PAGASA_BASE}/rainfall/map_list.do`;
export const WATERLEVEL_MAP_API = `${PAGASA_BASE}/water/map_list.do`;

/** Browser-like headers so PAGASA doesn't reject the request */
const BROWSER_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
  Accept: "application/json, text/javascript, */*; q=0.01",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "gzip, deflate, br",
  "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
  "X-Requested-With": "XMLHttpRequest",
  Origin: PAGASA_BASE,
  Connection: "keep-alive",
} as const;

/** Timeout for each HTTP request (ms) */
const REQUEST_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// Raw JSON shapes returned by PAGASA's internal APIs
// ---------------------------------------------------------------------------

/** Shape of a single item from /rainfall/table_list.do */
interface PagasaRainfallItem {
  obscd: string;    // station code
  obsnm: string;    // station name
  rf: string;       // current 10-min rainfall
  rf30m: string;    // 30-min accumulated
  rf01h: string;    // 1-hr accumulated
  rf03h: string;    // 3-hr accumulated
  rf06h: string;    // 6-hr accumulated
  rf12h: string;    // 12-hr accumulated
  rf24h: string;    // 24-hr accumulated
  agctype: string;  // agency type (colour code)
}

/** Shape of a single item from /water/table_list.do */
interface PagasaWaterLevelItem {
  obscd: string;       // station code
  obsnm: string;       // station name
  wl: string;          // current water level
  wl30m: string;       // water level 30 min ago
  wl1h: string;        // water level 1 hr ago
  wl2h: string;        // water level 2 hr ago
  alertwl: string | null;    // alert threshold
  alarmwl: string | null;    // alarm threshold
  criticalwl: string | null; // critical threshold
  agctype: string;     // agency type
}

/** Shape of items from /rainfall/map_list.do and /water/map_list.do */
interface PagasaMapItem {
  obscd: string;       // station code
  obsnm: string;       // station name
  lat: number;         // latitude (authoritative)
  lon: number;         // longitude (authoritative)
  [key: string]: unknown; // other fields we don't use here
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Clean a raw value from PAGASA JSON.
 *
 * Handles common quirks:
 *   • "-"  → 0          (no data / sensor offline)
 *   • "0.00(*)" → 0     (asterisk annotation)
 *   • null / undefined → 0
 *   • Non-numeric residual → 0
 */
export function cleanNumericValue(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined) return 0;

  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;

  const cleaned = raw
    .trim()
    .replace(/\u00a0/g, "")   // non-breaking space
    .replace(/\(\*?\)/g, "")  // trailing (*) or ()
    .replace(/\*/g, "")       // stray asterisks
    .replace(/,/g, "")        // thousands separator
    .trim();

  if (cleaned === "-" || cleaned === "--" || cleaned === "") return 0;

  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Parse a nullable threshold value.  Returns null when the threshold
 * is not published (some stations don't have warning levels).
 */
function parseThreshold(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === "" || raw === "-") return null;
  const parsed = parseFloat(String(raw).trim());
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Clean station name: trim, collapse whitespace.
 */
export function cleanStationName(raw: string | undefined): string {
  if (!raw) return "Unknown Station";
  return raw
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ");
}
/**
 * Build the `ymdhm` parameter PAGASA expects: "YYYYMMDDHHmm", rounded
 * down to the nearest 10 minutes (matching the sensor reporting interval)
 * in Philippine Standard Time (UTC+8).
 */
export function currentYmdhm(): string {
  const now = new Date();
  const phtOffset = 8 * 60; // PHT is UTC+8
  const utcMinutes = now.getTime() + (now.getTimezoneOffset() * 60000);
  const phtDate = new Date(utcMinutes + (phtOffset * 60000));

  const min = Math.floor(phtDate.getMinutes() / 10) * 10;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");

  return (
    `${phtDate.getFullYear()}` +
    `${pad(phtDate.getMonth() + 1)}` +
    `${pad(phtDate.getDate())}` +
    `${pad(phtDate.getHours())}` +
    `${pad(min)}`
  );
}

/**
 * Parse a PAGASA ymdhm string into an authoritative UTC ISO string.
 */
export function parseYmdhmToIso(ymdhm: string): string {
  if (ymdhm && ymdhm.length === 12) {
    const y = parseInt(ymdhm.substring(0, 4), 10);
    const m = parseInt(ymdhm.substring(4, 6), 10) - 1;
    const d = parseInt(ymdhm.substring(6, 8), 10);
    const h = parseInt(ymdhm.substring(8, 10), 10);
    const min = parseInt(ymdhm.substring(10, 12), 10);
    // Interpreted in UTC+8
    const utcMs = Date.UTC(y, m, d, h - 8, min);
    const date = new Date(utcMs);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Shared HTTP client
// ---------------------------------------------------------------------------

function createHttpClient(): AxiosInstance {
  // PAGASA's HTTPS certificate uses a government CA that is not in Node.js's
  // default trust store, causing "unable to verify the first certificate".
  // We scope this relaxed TLS config strictly to this client instance.
  const httpsAgent = new https.Agent({ rejectUnauthorized: false });

  return axios.create({
    timeout: REQUEST_TIMEOUT_MS,
    headers: BROWSER_HEADERS,
    httpsAgent,
    maxRedirects: 3,
  });
}

// ---------------------------------------------------------------------------
// Rainfall fetcher
// ---------------------------------------------------------------------------

export async function fetchRainfall(
  client?: AxiosInstance,
): Promise<RainfallReading[]> {
  const http = client ?? createHttpClient();
  const ymdhm = currentYmdhm();

  const { data } = await http.post<PagasaRainfallItem[]>(
    RAINFALL_API,
    `ymdhm=${ymdhm}`,
  );

  if (!Array.isArray(data)) return [];

  return data.map((item) => ({
    stationName: cleanStationName(item.obsnm),
    rain10min: cleanNumericValue(item.rf),
    rain30min: cleanNumericValue(item.rf30m),
    rain1hr:   cleanNumericValue(item.rf01h),
    rain3hr:   cleanNumericValue(item.rf03h),
    rain6hr:   cleanNumericValue(item.rf06h),
    rain12hr:  cleanNumericValue(item.rf12h),
    rain24hr:  cleanNumericValue(item.rf24h),
  }));
}

// ---------------------------------------------------------------------------
// Water-level fetcher
// ---------------------------------------------------------------------------

export async function fetchWaterLevel(
  client?: AxiosInstance,
): Promise<WaterLevelReading[]> {
  const http = client ?? createHttpClient();
  const ymdhm = currentYmdhm();

  const { data } = await http.post<PagasaWaterLevelItem[]>(
    WATERLEVEL_API,
    `ymdhm=${ymdhm}`,
  );

  if (!Array.isArray(data)) return [];

  return data.map((item) => ({
    stationName:   cleanStationName(item.obsnm),
    currentLevel:  cleanNumericValue(item.wl),
    change30min:   cleanNumericValue(item.wl30m),
    change1hr:     cleanNumericValue(item.wl1h),
    change2hr:     cleanNumericValue(item.wl2h),
    alertLevel:    parseThreshold(item.alertwl),
    alarmLevel:    parseThreshold(item.alarmwl),
    criticalLevel: parseThreshold(item.criticalwl),
  }));
}

// ---------------------------------------------------------------------------
// Map coordinate fetcher
// ---------------------------------------------------------------------------

/** Coordinates indexed by normalised station name */
export interface StationCoordMap {
  [normalizedName: string]: { lat: number; lng: number };
}

/**
 * Fetch authoritative lat/lng from both PAGASA map endpoints.
 * These GET endpoints accept `ymdhm`, `basin`, and `_` (cache-bust) params.
 */
export async function fetchMapCoordinates(
  client?: AxiosInstance,
): Promise<StationCoordMap> {
  const http = client ?? createHttpClient();
  const ymdhm = currentYmdhm();
  const cacheBust = Date.now();
  const normalize = (name: string) => name.toLowerCase().trim();

  const coords: StationCoordMap = {};

  // Fetch both map endpoints in parallel
  const [rainfallMapRes, waterMapRes] = await Promise.allSettled([
    http.get<PagasaMapItem[]>(
      `${RAINFALL_MAP_API}?ymdhm=${ymdhm}&basin=&_=${cacheBust}`,
    ),
    http.get<PagasaMapItem[]>(
      `${WATERLEVEL_MAP_API}?ymdhm=${ymdhm}&basin=&_=${cacheBust}`,
    ),
  ]);

  // Process rainfall map stations
  if (rainfallMapRes.status === "fulfilled" && Array.isArray(rainfallMapRes.value.data)) {
    for (const item of rainfallMapRes.value.data) {
      if (item.lat && item.lon && item.obsnm) {
        coords[normalize(item.obsnm)] = { lat: item.lat, lng: item.lon };
      }
    }
  }

  // Process water-level map stations (may overwrite rainfall coords for
  // stations that appear in both — water-level coords are equally valid)
  if (waterMapRes.status === "fulfilled" && Array.isArray(waterMapRes.value.data)) {
    for (const item of waterMapRes.value.data) {
      if (item.lat && item.lon && item.obsnm) {
        coords[normalize(item.obsnm)] = { lat: item.lat, lng: item.lon };
      }
    }
  }

  return coords;
}

// ---------------------------------------------------------------------------
// Join rainfall + water level by station name → StationTelemetry[]
// ---------------------------------------------------------------------------

export function mergeStationData(
  rainfall: RainfallReading[],
  waterLevels: WaterLevelReading[],
  coordMap: StationCoordMap = {},
  observedAt?: string | null,
): StationTelemetry[] {
  const normalize = (name: string) => name.toLowerCase().trim();

  const rainMap = new Map<string, RainfallReading>();
  for (const r of rainfall) {
    rainMap.set(normalize(r.stationName), r);
  }

  const waterMap = new Map<string, WaterLevelReading>();
  for (const w of waterLevels) {
    waterMap.set(normalize(w.stationName), w);
  }

  const allKeys = new Set([...rainMap.keys(), ...waterMap.keys()]);

  const stations: StationTelemetry[] = [];
  for (const key of allKeys) {
    const rain = rainMap.get(key) ?? null;
    const water = waterMap.get(key) ?? null;
    const coord = coordMap[key] ?? null;

    const waterRiskLevel = classifyWaterRisk(water);
    const rainRiskLevel = classifyRainRisk(rain);
    const riskLevel = getCompositeRisk(waterRiskLevel, rainRiskLevel);

    stations.push({
      stationName: rain?.stationName ?? water?.stationName ?? key,
      latitude: coord?.lat ?? null,
      longitude: coord?.lng ?? null,
      rainfall: rain,
      waterLevel: water,
      waterRiskLevel,
      rainRiskLevel,
      riskLevel,
      observedAt: observedAt || new Date().toISOString(),
    });
  }

  stations.sort((a, b) => a.stationName.localeCompare(b.stationName));
  return stations;
}

// ---------------------------------------------------------------------------
// Risk classification using PAGASA's per-station thresholds & standard rules
// ---------------------------------------------------------------------------

const RISK_WEIGHTS: Record<StationTelemetry["riskLevel"], number> = {
  CRITICAL: 4,
  ALARM: 3,
  ALERT: 2,
  NORMAL: 1,
  UNKNOWN: 0,
};

/**
 * Classify water level risk based on PAGASA per-station warning levels.
 */

export function classifyWaterRisk(
  water: WaterLevelReading | null,
): StationTelemetry["waterRiskLevel"] {
  if (!water || water.currentLevel === 0) return "UNKNOWN";

  // Use PAGASA's published per-station thresholds when available
  if (water.criticalLevel !== null && water.currentLevel >= water.criticalLevel)
    return "CRITICAL";
  if (water.alarmLevel !== null && water.currentLevel >= water.alarmLevel)
    return "ALARM";
  if (water.alertLevel !== null && water.currentLevel >= water.alertLevel)
    return "ALERT";

  // If thresholds are published and we're below all of them → NORMAL
  if (water.alertLevel !== null) return "NORMAL";

  // No thresholds available for this station
  return "UNKNOWN";
}

/**
 * Classify rainfall risk based on PAGASA Heavy Rainfall Warning System thresholds:
 *   • CRITICAL (Red):     1-hr rain >= 30 mm OR 24-hr rain >= 150 mm
 *   • ALARM (Orange):     1-hr rain >= 15 mm OR 24-hr rain >= 100 mm
 *   • ALERT (Yellow):     1-hr rain >= 7.5 mm OR 24-hr rain >= 50 mm
 *   • NORMAL:             rainfall recorded below alert levels
 *   • UNKNOWN:            no rainfall data recorded for station
 */
export function classifyRainRisk(
  rain: RainfallReading | null,
): StationTelemetry["rainRiskLevel"] {
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
  waterRisk: StationTelemetry["waterRiskLevel"],
  rainRisk: StationTelemetry["rainRiskLevel"],
): StationTelemetry["riskLevel"] {
  const wWeight = RISK_WEIGHTS[waterRisk] ?? 0;
  const rWeight = RISK_WEIGHTS[rainRisk] ?? 0;

  if (wWeight >= rWeight && wWeight > 0) return waterRisk;
  if (rWeight > 0) return rainRisk;
  return "UNKNOWN";
}

import { fetchPanahonRainfallStations } from "./panahon-scraper";

// ---------------------------------------------------------------------------
// Orchestrator – run all telemetry fetchers in parallel, merge, and return
// ---------------------------------------------------------------------------

export async function ingestTelemetry(): Promise<ScrapeResult> {
  const start = Date.now();

  try {
    const client = createHttpClient();

    // Fire all data sources concurrently (PAGASA FFWS + Panahon AWS)
    const [rainfallRes, waterLevelsRes, coordMapRes, panahonStationsRes] = await Promise.allSettled([
      fetchRainfall(client),
      fetchWaterLevel(client),
      fetchMapCoordinates(client),
      fetchPanahonRainfallStations(),
    ]);

    const rainfall = rainfallRes.status === "fulfilled" ? rainfallRes.value : [];
    const waterLevels = waterLevelsRes.status === "fulfilled" ? waterLevelsRes.value : [];
    const coordMap = coordMapRes.status === "fulfilled" ? coordMapRes.value : ({} as StationCoordMap);
    const panahonStations = panahonStationsRes.status === "fulfilled" ? panahonStationsRes.value : [];

    const observedAtIso = parseYmdhmToIso(currentYmdhm());
    const ffwsStations = mergeStationData(rainfall, waterLevels, coordMap, observedAtIso);

    // Merge FFWS stations with Panahon AWS stations
    // Prevent duplicate stations if named similarly
    const existingStationNames = new Set(ffwsStations.map((s) => s.stationName.toLowerCase().trim()));
    const additionalPanahonStations = panahonStations.filter(
      (p) => !existingStationNames.has(p.stationName.toLowerCase().trim())
    );

    const stations = [...ffwsStations, ...additionalPanahonStations];
    stations.sort((a, b) => a.stationName.localeCompare(b.stationName));

    return {
      success: true,
      scrapedAt: new Date().toISOString(),
      stations,
      rainfall,
      waterLevels,
      meta: {
        rainfallRowCount: rainfall.length + additionalPanahonStations.length,
        waterLevelRowCount: waterLevels.length,
        durationMs: Date.now() - start,
      },
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : "Unknown ingestion error";

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

