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

export async function GET(req?: Request): Promise<NextResponse<any>> {
  let force = false;
  let debug = false;
  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true";
      debug = url.searchParams.get("debug") === "true";
    } catch {}
  }

  if (debug) {
    const { diagnosePanahonConnection } = await import("@/lib/panahon-scraper");
    const diag = await diagnosePanahonConnection();
    return NextResponse.json(diag, {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const now = Date.now();
  console.log(`[/api/telemetry] GET request received (force=${force})`);

  if (!force && cachedTelemetryResponse && now - cachedTelemetryAt < TELEMETRY_CACHE_TTL_MS) {
    const ageSec = Math.round((now - cachedTelemetryAt) / 1000);
    console.log(
      `[/api/telemetry] RAM cache HIT: serving ${cachedTelemetryResponse.stations.length} stations (cached ${ageSec}s ago, scrapedAt: ${cachedTelemetryResponse.scrapedAt})`
    );
    return NextResponse.json(cachedTelemetryResponse, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "HIT-RAM",
      },
    });
  }

  try {
    console.log(`[/api/telemetry] Fetching latest telemetry snapshot (force=${force})...`);
    const { stations, scrapedAt } = await getLatestTelemetrySnapshot(force);

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

    console.log(
      `[/api/telemetry] Successfully delivered ${stations.length} stations (scrapedAt: ${scrapedAt}, peakWater: ${peakWater}m @ ${peakWaterStation}, maxRain1h: ${maxRain1h}mm @ ${maxRain1hStation}, highRisk: ${highRiskCount})`
    );

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
      console.warn("[/api/telemetry] Serving stale RAM fallback due to error");
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

/**
 * POST /api/telemetry
 * Ingests external or client-synced telemetry stations into MongoDB Atlas.
 */
export async function POST(req: Request): Promise<NextResponse<any>> {
  try {
    const body = await req.json();
    if (!body || !Array.isArray(body.stations) || body.stations.length === 0) {
      return NextResponse.json(
        { success: false, error: "Invalid payload: 'stations' array is required." },
        { status: 400 }
      );
    }

    const { saveTelemetrySnapshot } = await import("@/lib/weather");
    const scrapedAt = typeof body.scrapedAt === "string" ? body.scrapedAt : new Date().toISOString();
    const success = await saveTelemetrySnapshot(body.stations, scrapedAt);

    // Invalidate local in-memory RAM cache so subsequent GET requests return fresh data immediately
    cachedTelemetryResponse = null;
    cachedTelemetryAt = 0;

    return NextResponse.json({
      success,
      stationCount: body.stations.length,
      scrapedAt,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error("[/api/telemetry] POST error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to process telemetry payload" },
      { status: 500 }
    );
  }
}

// ---------------------------------------------------------------------------
// Route segment config (prevents Next.js aggressive static caching & extends Vercel serverless timeout)
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const revalidate = 0;
export const maxDuration = 60;
