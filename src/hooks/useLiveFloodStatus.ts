"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Real-Time Flood Status React Hook
//
// React hook fetching live telemetry, precalculated road inundation, and heatmap
// points from the unified `/api/flood/live` endpoint with multi-layer in-memory
// caching and automatic background polling.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import type { LiveStation } from "@/types";
import type { EvaluatedRoadRisk, FloodHeatmapPoint } from "@/lib/flood-engine";
import type { LiveFloodResponse } from "@/app/api/flood/live/route";

export type TelemetrySource = "database" | "scraper" | "memory";

export interface UseLiveFloodStatusReturn {
  /** Live list of active station telemetry snapshots */
  stations: LiveStation[];
  /** Pre-calculated monitored road flood evaluations */
  evaluatedRoads: EvaluatedRoadRisk[];
  /** Pre-calculated flood heatmap points */
  heatmapPoints: FloodHeatmapPoint[];
  /** High-level summary telemetry and flood metrics */
  metrics: LiveFloodResponse["metrics"] | null;
  /** Regional weather summary */
  weatherSummary: LiveFloodResponse["weather"] | null;
  /** Loading state flag (true during initial connection / snapshot fetch) */
  loading: boolean;
  /** Error object if fetch fails, null otherwise */
  error: Error | null;
  /** Data source indicator */
  source: TelemetrySource;
  /** Latest observation or sync timestamp across telemetry stations */
  lastUpdated: Date | null;
  /** Direct scrape/sync timestamp ISO string from scraper/backend */
  scrapedAt: string | null;
  /** Function to trigger a fresh direct sync */
  refreshScraper: () => Promise<void>;
  /** Update active weather & prediction region dynamically across the Philippines */
  updateRegion: (lat: number, lng: number, bbox?: [number, number, number, number]) => Promise<void>;
}

export interface RegionLocationInput {
  lat: number;
  lng: number;
  bbox?: [number, number, number, number];
}

/** Global in-memory cache shared across React hook instances */
let clientCachedData: LiveFloodResponse | null = null;
let clientCachedAt = 0;
let clientCachedCoords: RegionLocationInput = { lat: 14.60, lng: 121.00 };
let clientLastUpdated: Date | null = null;
let clientScrapedAt: string | null = null;
let inflightFetch: Promise<LiveFloodResponse | null> | null = null;

export function formatScrapedAt(isoOrDate: string | Date | null | undefined): string | null {
  if (!isoOrDate) return null;
  try {
    const d = typeof isoOrDate === "string" ? new Date(isoOrDate) : isoOrDate;
    if (isNaN(d.getTime())) return null;

    const timeStr = d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

    const diffMs = Date.now() - d.getTime();
    let relative = "";
    if (diffMs >= -60_000) {
      const mins = Math.max(0, Math.floor(diffMs / 60000));
      if (mins < 1) relative = "Just now";
      else if (mins < 60) relative = `${mins}m ago`;
      else {
        const hrs = Math.floor(mins / 60);
        relative = `${hrs}h ${mins % 60}m ago`;
      }
    }

    return relative ? `${timeStr} (${relative})` : timeStr;
  } catch {
    return null;
  }
}

function parseTimestamp(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof (val as any).toDate === "function") {
    try {
      const d = (val as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {}
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function useLiveFloodStatus(): UseLiveFloodStatusReturn {
  const [stations, setStations] = useState<LiveStation[]>(() => clientCachedData?.stations || []);
  const [evaluatedRoads, setEvaluatedRoads] = useState<EvaluatedRoadRisk[]>(() => clientCachedData?.roads || []);
  const [heatmapPoints, setHeatmapPoints] = useState<FloodHeatmapPoint[]>(() => clientCachedData?.heatmapPoints || []);
  const [metrics, setMetrics] = useState<LiveFloodResponse["metrics"] | null>(() => clientCachedData?.metrics || null);
  const [weatherSummary, setWeatherSummary] = useState<LiveFloodResponse["weather"] | null>(() => clientCachedData?.weather || null);

  const [loading, setLoading] = useState<boolean>(() => !clientCachedData);
  const [error, setError] = useState<Error | null>(null);
  const [source, setSource] = useState<TelemetrySource>(() => (clientCachedData ? "memory" : "database"));
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => clientLastUpdated);
  const [scrapedAt, setScrapedAt] = useState<string | null>(() => clientScrapedAt);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const activeCoordsRef = useRef<RegionLocationInput>(clientCachedCoords);

  const fetchLiveFloodData = useCallback(async (force = false, isBackground = false, coords?: RegionLocationInput) => {
    const targetCoords = coords || activeCoordsRef.current;
    activeCoordsRef.current = targetCoords;

    const now = Date.now();
    const distMoved = Math.hypot(targetCoords.lat - clientCachedCoords.lat, targetCoords.lng - clientCachedCoords.lng);

    if (!force && clientCachedData && distMoved < 0.15 && now - clientCachedAt < 30_000) {
      setStations(clientCachedData.stations);
      setEvaluatedRoads(clientCachedData.roads);
      setHeatmapPoints(clientCachedData.heatmapPoints);
      setMetrics(clientCachedData.metrics);
      setWeatherSummary(clientCachedData.weather);
      setLastUpdated(clientLastUpdated);
      setScrapedAt(clientScrapedAt);
      setLoading(false);
      return;
    }

    if (!isBackground && !clientCachedData) {
      setLoading(true);
    }

    try {
      if (!inflightFetch || force || distMoved >= 0.15) {
        inflightFetch = (async () => {
          const params = new URLSearchParams();
          if (force) params.set("force", "true");
          params.set("lat", targetCoords.lat.toFixed(4));
          params.set("lng", targetCoords.lng.toFixed(4));
          if (targetCoords.bbox && targetCoords.bbox.length === 4) {
            params.set("bbox", targetCoords.bbox.map((b) => b.toFixed(4)).join(","));
          }

          const url = `/api/flood/live?${params.toString()}`;
          const res = await fetch(url);
          if (!res.ok) {
            // Fallback to legacy ingest route if /api/flood/live is unavailable
            const fallbackRes = await fetch(force ? "/api/cron/ingest?force=true" : "/api/cron/ingest");
            if (!fallbackRes.ok) {
              throw new Error(`Telemetry fetch failed with status ${res.status}`);
            }
            const fallbackData = await fallbackRes.json();
            return {
              success: true,
              calculatedAt: new Date().toISOString(),
              scrapedAt: fallbackData.scrapedAt || new Date().toISOString(),
              metrics: {
                totalStations: fallbackData.stations?.length || 0,
                highRiskStationsCount: 0,
                floodedRoadsCount: 0,
                peakWaterLevel: 0,
                peakWaterStation: "N/A",
                peakWaterStationId: null,
                maxRain1h: 0,
                maxRain1hStation: "N/A",
                maxRain1hStationId: null,
                maxRain24h: 0,
                maxRain24hStation: "N/A",
                maxRain24hStationId: null,
              },
              stations: (fallbackData.stations || []).map((st: any) => ({
                stationId: st.stationName ? String(st.stationName).toLowerCase().replace(/[^a-z0-9]+/g, "-") : "station",
                stationName: st.stationName,
                latitude: st.latitude,
                longitude: st.longitude,
                geohash: "",
                rain10m: st.rainfall?.rain10min ?? 0,
                rain1h: st.rainfall?.rain1hr ?? 0,
                rain24h: st.rainfall?.rain24hr ?? 0,
                waterLevel: st.waterLevel?.currentLevel ?? 0,
                waterLevelDelta1h: st.waterLevel?.change1hr ?? 0,
                waterRiskLevel: st.waterRiskLevel || "NORMAL",
                rainRiskLevel: st.rainRiskLevel || "NORMAL",
                riskLevel: st.riskLevel || "NORMAL",
                lastUpdated: parseTimestamp(st.observedAt) || new Date(),
              })),
              roads: [],
              heatmapPoints: [],
              weather: {
                metroManilaRainMmHr: 0,
                metroManilaRain24hMm: 0,
                forecast3hTotalMm: 0,
                trend: "DRY",
                conditionLabel: "Clear & Dry",
              },
            } as LiveFloodResponse;
          }

          const data: LiveFloodResponse = await res.json();
          if (data.stations && data.stations.length > 0) {
            const parsedStations = data.stations.map((st) => ({
              ...st,
              lastUpdated: parseTimestamp(st.lastUpdated) || new Date(),
            }));
            data.stations = parsedStations;
            clientCachedCoords = { lat: targetCoords.lat, lng: targetCoords.lng };
            clientCachedData = data;
            clientCachedAt = Date.now();
            clientScrapedAt = data.scrapedAt || new Date().toISOString();
            clientLastUpdated = parseTimestamp(data.scrapedAt) || new Date();
            return data;
          }
          return null;
        })().finally(() => {
          inflightFetch = null;
        });
      }

      const data = await inflightFetch;
      if (data && data.stations.length > 0) {
        setStations(data.stations);
        setEvaluatedRoads(data.roads);
        setHeatmapPoints(data.heatmapPoints);
        setMetrics(data.metrics);
        setWeatherSummary(data.weather);
        setSource("database");
        setLastUpdated(clientLastUpdated);
        setScrapedAt(clientScrapedAt);
        setError(null);
      }
    } catch (err: any) {
      console.warn("[useLiveFloodStatus] Fetch error:", err.message);
      if (!clientCachedData) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLiveFloodData();

    // Auto-refresh in background every 60 seconds
    pollIntervalRef.current = setInterval(() => {
      fetchLiveFloodData(false, true);
    }, 60_000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchLiveFloodData]);

  return {
    stations,
    evaluatedRoads,
    heatmapPoints,
    metrics,
    weatherSummary,
    loading,
    error,
    source,
    lastUpdated,
    scrapedAt,
    refreshScraper: () => fetchLiveFloodData(true),
    updateRegion: (lat: number, lng: number, bbox?: [number, number, number, number]) =>
      fetchLiveFloodData(false, true, { lat, lng, bbox }),
  };
}
