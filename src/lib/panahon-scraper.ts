// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Panahon (DOST-PAGASA AWS) Telemetry Scraper
//
// Fetches real-time Automated Weather Station (AWS) data across the Philippines
// from DOST-PAGASA's Panahon portal (https://panahon.gov.ph).
// ---------------------------------------------------------------------------

import type { LiveStation, RainfallReading, StationTelemetry } from "@/types";
import { classifyRainRisk } from "./scraper";

export interface PanahonRawAwsItem {
  site_id: string;
  site_name: string;
  lat: number | string;
  lon: number | string;
  parameter: string;
  readable_parameter?: string;
  readable_unit?: string;
  observed_at?: string;
  value: string | number;
  "24_hr_value"?: string | number;
  province?: string;
  region?: string;
  [key: string]: unknown;
}

export interface PanahonAwsResponse {
  success: boolean;
  data?: PanahonRawAwsItem[];
}

export interface PanahonStationTelemetry {
  siteId: string;
  siteName: string;
  latitude: number;
  longitude: number;
  observedAt: string;
  rain1h: number;
  rain24h: number;
  temperatureC?: number;
  heatIndexC?: number;
  humidityPercent?: number;
}

const PANAHON_BASE = "https://panahon.gov.ph";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/**
 * Clean numeric string/number to safe float
 */
function cleanNumber(val: string | number | null | undefined): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  const cleaned = val.trim().replace(/,/g, "");
  if (cleaned === "-" || cleaned === "--" || cleaned === "") return 0;
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Fetches CSRF token and session cookies from the Panahon landing page.
 */
export async function getPanahonSession(): Promise<{ token: string; cookies: string } | null> {
  try {
    const res = await fetch(PANAHON_BASE, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(12000),
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
    console.warn("[Panahon] Session retrieval failed:", err instanceof Error ? err.message : err);
    return null;
  }
}

/**
 * Fetches AWS parameter data from Panahon API.
 * Available parameters:
 *   - "accumulated_rain_1h" (Hourly rain + 24hr rain)
 *   - "currentTemp"
 *   - "heat_index"
 *   - "currentHum"
 */
export async function fetchPanahonParameter(
  parameter = "accumulated_rain_1h",
  session?: { token: string; cookies: string } | null
): Promise<PanahonRawAwsItem[]> {
  try {
    const sess = session ?? (await getPanahonSession());
    if (!sess) return [];

    const url = `${PANAHON_BASE}/api/v1/aws?token=${encodeURIComponent(sess.token)}&parameter=${encodeURIComponent(parameter)}`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": BROWSER_USER_AGENT,
        Cookie: sess.cookies,
        Referer: PANAHON_BASE,
        Accept: "application/json, text/javascript, */*; q=0.01",
        "X-Requested-With": "XMLHttpRequest",
      },
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) return [];

    const json: PanahonAwsResponse = await res.json();
    if (!json.success || !Array.isArray(json.data)) return [];

    return json.data;
  } catch (err) {
    console.warn(`[Panahon] Fetch error for parameter '${parameter}':`, err instanceof Error ? err.message : err);
    return [];
  }
}

/**
 * Fetches Panahon AWS rainfall stations and converts them to StationTelemetry format.
 */
export async function fetchPanahonRainfallStations(): Promise<StationTelemetry[]> {
  const sess = await getPanahonSession();
  if (!sess) return [];

  const rainData = await fetchPanahonParameter("accumulated_rain_1h", sess);
  if (!rainData.length) return [];

  const stations: StationTelemetry[] = [];

  for (const item of rainData) {
    const lat = cleanNumber(item.lat);
    const lon = cleanNumber(item.lon);
    if (!lat || !lon) continue;

    const rain1h = cleanNumber(item.value);
    const rain24h = cleanNumber(item["24_hr_value"]);
    const stationName = item.site_name ? `${item.site_name.trim()} (AWS)` : `Panahon AWS ${item.site_id}`;

    const rainfall: RainfallReading = {
      stationName,
      rain10min: 0,
      rain30min: 0,
      rain1hr: rain1h,
      rain3hr: 0,
      rain6hr: 0,
      rain12hr: 0,
      rain24hr: rain24h,
    };

    const rainRiskLevel = classifyRainRisk(rainfall);

    stations.push({
      stationName,
      latitude: lat,
      longitude: lon,
      rainfall,
      waterLevel: null,
      waterRiskLevel: "UNKNOWN",
      rainRiskLevel,
      riskLevel: rainRiskLevel,
    });
  }

  return stations;
}

/**
 * Map Panahon stations directly to LiveStation format for the UI & engine.
 */
export function convertPanahonToLiveStations(telemetry: StationTelemetry[]): LiveStation[] {
  return telemetry.map((st) => {
    const slug = st.stationName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");

    return {
      stationId: `panahon-${slug}`,
      stationName: st.stationName,
      latitude: st.latitude ?? 14.5995,
      longitude: st.longitude ?? 120.9842,
      geohash: "",
      rain10m: st.rainfall?.rain10min ?? 0,
      rain1h: st.rainfall?.rain1hr ?? 0,
      rain24h: st.rainfall?.rain24hr ?? 0,
      waterLevel: 0,
      waterLevelDelta1h: 0,
      waterRiskLevel: st.waterRiskLevel,
      rainRiskLevel: st.rainRiskLevel,
      riskLevel: st.riskLevel,
      lastUpdated: new Date(),
    };
  });
}
