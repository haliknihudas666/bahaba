// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Live Flood Status & Evaluation Endpoint
//
// GET /api/flood/live
// Scoped to the active viewport (`bbox`) or coordinates (`lat`, `lng`) across
// the Philippines. Returns a lightweight, cached payload containing:
//   1. Viewport-scoped or regional telemetry stations
//   2. Pre-calculated monitored road inundation within the viewport
//   3. Pre-calculated continuous heatmap points for the visible area
//   4. Localized weather & precipitation forecast summary (cached in MongoDB)
//   5. Computed flood severity metrics for the active view
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getLatestTelemetrySnapshot, getDistrictRainfall } from "@/lib/weather";
import {
  evaluateMonitoredRoads,
  evaluateHeatmapPoints,
  type EvaluatedRoadRisk,
  type FloodHeatmapPoint,
} from "@/lib/flood-engine";
import type { LiveStation } from "@/types";

export interface LiveFloodResponse {
  success: boolean;
  calculatedAt: string;
  scrapedAt: string;
  metrics: {
    totalStations: number;
    highRiskStationsCount: number;
    floodedRoadsCount: number;
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
  roads: EvaluatedRoadRisk[];
  heatmapPoints: FloodHeatmapPoint[];
  weather: {
    metroManilaRainMmHr: number;
    metroManilaRain24hMm: number;
    forecast3hTotalMm: number;
    trend: string;
    conditionLabel: string;
  };
}

/** Multi-region in-memory cache to prevent repetitive compute across active viewports */
const regionalCache = new Map<string, { data: LiveFloodResponse; cachedAt: number }>();
const CACHE_TTL_MS = 30_000; // 30 seconds

export async function GET(req?: Request): Promise<NextResponse<LiveFloodResponse | { success: false; error: string }>> {
  let targetLat = 14.60;
  let targetLng = 121.00;
  let targetBBox: [number, number, number, number] | undefined = undefined;
  let force = false;

  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true";
      const qLat = parseFloat(url.searchParams.get("lat") || "");
      const qLng = parseFloat(url.searchParams.get("lng") || "");
      if (!isNaN(qLat) && !isNaN(qLng)) {
        targetLat = qLat;
        targetLng = qLng;
      }

      const bboxStr = url.searchParams.get("bbox");
      if (bboxStr) {
        const parts = bboxStr.split(",").map((s) => parseFloat(s.trim()));
        if (parts.length === 4 && parts.every((n) => !isNaN(n))) {
          targetBBox = parts as [number, number, number, number];
          // If bbox is provided, use center of bbox as primary weather coordinate
          targetLat = (targetBBox[0] + targetBBox[2]) / 2;
          targetLng = (targetBBox[1] + targetBBox[3]) / 2;
        }
      }
    } catch {}
  }

  const cacheKey = targetBBox
    ? `bbox_${targetBBox[0].toFixed(2)}_${targetBBox[1].toFixed(2)}_${targetBBox[2].toFixed(2)}_${targetBBox[3].toFixed(2)}`
    : `point_${targetLat.toFixed(2)}_${targetLng.toFixed(2)}`;

  const now = Date.now();
  const cached = regionalCache.get(cacheKey);

  if (!force && cached && now - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "HIT-RAM",
      },
    });
  }

  try {
    // 1. Fetch latest telemetry stations and authoritative scrape timestamp from MongoDB
    const { stations: allStations, scrapedAt } = await getLatestTelemetrySnapshot();

    // 2. Filter stations strictly to the visible viewport (plus a comfortable 25km interpolation margin)
    const visibleStations = targetBBox
      ? allStations.filter((s) => {
          if (!s.latitude || !s.longitude) return false;
          const [south, west, north, east] = targetBBox;
          return (
            s.latitude >= south - 0.25 &&
            s.latitude <= north + 0.25 &&
            s.longitude >= west - 0.25 &&
            s.longitude <= east + 0.25
          );
        })
      : allStations;

    // 3. Fetch regional weather for the requested area across the Philippines (MongoDB-backed)
    const meteo = await getDistrictRainfall(targetLat, targetLng);

    // 4. Batch evaluate monitored roads and heatmap points scoped strictly to the active viewport
    const [roads, heatmapPoints] = await Promise.all([
      evaluateMonitoredRoads(allStations, meteo, targetBBox),
      evaluateHeatmapPoints(allStations, meteo, targetBBox),
    ]);

    // 5. Compute localized metrics for what is currently in view
    let peakWater = 0;
    let peakWaterStation = "N/A";
    let peakWaterStationId: string | null = null;

    let maxRain1h = meteo.currentRainMmHr;
    let maxRain1hStation = visibleStations.length > 0 ? "Regional Weather" : "Open-Meteo Satellite / Grid";
    let maxRain1hStationId: string | null = null;

    let maxRain = meteo.rain24hMm;
    let maxRainStation = visibleStations.length > 0 ? "Regional Weather" : "Open-Meteo Satellite / Grid";
    let maxRainStationId: string | null = null;

    let highRiskCount = 0;

    visibleStations.forEach((s) => {
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

    const floodedRoadsCount = roads.filter((r) => r.isFlooded).length;

    const result: LiveFloodResponse = {
      success: true,
      calculatedAt: new Date().toISOString(),
      scrapedAt,
      metrics: {
        totalStations: visibleStations.length,
        highRiskStationsCount: highRiskCount,
        floodedRoadsCount,
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
      stations: visibleStations,
      roads,
      heatmapPoints,
      weather: {
        metroManilaRainMmHr: meteo.currentRainMmHr,
        metroManilaRain24hMm: meteo.rain24hMm,
        forecast3hTotalMm: meteo.forecast3hTotalMm,
        trend: meteo.trend,
        conditionLabel: meteo.conditionLabel,
      },
    };

    // Store in spatial in-memory cache
    regionalCache.set(cacheKey, { data: result, cachedAt: now });

    // Prune stale cache entries if cache size grows large (> 50 regions)
    if (regionalCache.size > 50) {
      for (const [k, v] of regionalCache.entries()) {
        if (now - v.cachedAt > 60_000) {
          regionalCache.delete(k);
        }
      }
    }

    return NextResponse.json(result, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
        "X-Cache": "MISS",
      },
    });
  } catch (err: any) {
    console.error("[/api/flood/live] Error evaluating live flood status:", err);

    if (cached) {
      return NextResponse.json(cached.data, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=30, stale-while-revalidate=60",
          "X-Cache": "STALE-ERROR-FALLBACK",
        },
      });
    }

    return NextResponse.json(
      { success: false, error: err.message || "Failed to compute live flood status" },
      { status: 500 }
    );
  }
}
