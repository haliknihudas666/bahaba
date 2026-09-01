// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Dedicated Telemetry API Endpoint
//
// GET /api/telemetry
// Delivers all active DOST-PAGASA Panahon telemetry stations (AWS, River Basins,
// Synoptic water levels and rain gauges) with in-memory caching and sync metadata.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getLatestTelemetrySnapshot } from "@/lib/weather";
import type { LiveStation } from "@/types";

export interface TelemetryApiResponse {
  success: boolean;
  scrapedAt: string;
  cachedAt: string;
  metrics: {
    totalStations: number;
    highRiskStationsCount: number;
    peakWaterLevel: number;
    peakWaterStation: string;
    peakWaterStationId: string | null;
    maxRain1h: number;
    maxRain1hStation: string;
    maxRain1hStationId: string | null;
    maxRain24h: number;
    maxRain24hStation: string;
    maxRain24hStationId: string | null;
  };
  stations: LiveStation[];
}

let cachedTelemetryResponse: TelemetryApiResponse | null = null;
let cachedTelemetryAt = 0;
const TELEMETRY_CACHE_TTL_MS = 30_000; // 30 seconds

export async function GET(req?: Request): Promise<NextResponse<TelemetryApiResponse | { success: false; error: string }>> {
  let force = false;
  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true";
    } catch {}
  }

  const now = Date.now();
  if (!force && cachedTelemetryResponse && now - cachedTelemetryAt < TELEMETRY_CACHE_TTL_MS) {
    return NextResponse.json(cachedTelemetryResponse, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "HIT-RAM",
      },
    });
  }

  try {
    const { stations, scrapedAt } = await getLatestTelemetrySnapshot();

    let peakWater = 0;
    let peakWaterStation = "N/A";
    let peakWaterStationId: string | null = null;

    let maxRain1h = 0;
    let maxRain1hStation = "N/A";
    let maxRain1hStationId: string | null = null;

    let maxRain = 0;
    let maxRainStation = "N/A";
    let maxRainStationId: string | null = null;

    let highRiskCount = 0;

    stations.forEach((s) => {
      if (s.riskLevel === "CRITICAL" || s.riskLevel === "ALARM" || s.riskLevel === "ALERT") {
        highRiskCount++;
      }
      if (s.waterLevel > peakWater) {
        peakWater = s.waterLevel;
        peakWaterStation = s.stationName;
        peakWaterStationId = s.stationId;
      }
      if (s.rain1h > maxRain1h) {
        maxRain1h = s.rain1h;
        maxRain1hStation = s.stationName;
        maxRain1hStationId = s.stationId;
      }
      if (s.rain24h > maxRain) {
        maxRain = s.rain24h;
        maxRainStation = s.stationName;
        maxRainStationId = s.stationId;
      }
    });

    const result: TelemetryApiResponse = {
      success: true,
      scrapedAt,
      cachedAt: new Date().toISOString(),
      metrics: {
        totalStations: stations.length,
        highRiskStationsCount: highRiskCount,
        peakWaterLevel: peakWater,
        peakWaterStation,
        peakWaterStationId,
        maxRain1h,
        maxRain1hStation,
        maxRain1hStationId,
        maxRain24h: maxRain,
        maxRain24hStation: maxRainStation,
        maxRain24hStationId: maxRainStationId,
      },
      stations,
    };

    cachedTelemetryResponse = result;
    cachedTelemetryAt = now;

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    console.error("[/api/telemetry] Error fetching telemetry:", err);
    if (cachedTelemetryResponse) {
      return NextResponse.json(cachedTelemetryResponse, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          "X-Cache": "STALE-ERROR-FALLBACK",
        },
      });
    }

    return NextResponse.json(
      { success: false, error: err.message || "Failed to fetch telemetry stations" },
      { status: 500 }
    );
  }
}
