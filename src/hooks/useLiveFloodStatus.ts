"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Real-Time Flood Status React Hook
//
// React hook fetching live telemetry with multi-layer in-memory caching
// and periodic background polling to minimize database and server load.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import type { LiveStation, ScrapeResult } from "@/types";

export type TelemetrySource = "database" | "scraper" | "memory";

export interface UseLiveFloodStatusReturn {
  /** Live list of active station telemetry snapshots */
  stations: LiveStation[];
  /** Loading state flag (true during initial connection / snapshot fetch) */
  loading: boolean;
  /** Error object if fetch fails, null otherwise */
  error: Error | null;
  /** Data source indicator */
  source: TelemetrySource;
  /** Latest observation or sync timestamp across telemetry stations */
  lastUpdated: Date | null;
  /** Function to trigger a fresh direct scrape */
  refreshScraper: () => Promise<void>;
}

/** Global in-memory cache shared across React hook instances */
let clientCachedStations: LiveStation[] | null = null;
let clientCachedAt = 0;
let clientLastUpdated: Date | null = null;
let inflightFetch: Promise<LiveStation[]> | null = null;

function parseTimestamp(val: unknown): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof (val as any).toDate === "function") {
    try {
      const d = (val as any).toDate();
      if (d instanceof Date && !isNaN(d.getTime())) return d;
    } catch {
      // ignore
    }
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

export function useLiveFloodStatus(): UseLiveFloodStatusReturn {
  const [stations, setStations] = useState<LiveStation[]>(() => clientCachedStations || []);
  const [loading, setLoading] = useState<boolean>(() => !clientCachedStations);
  const [error, setError] = useState<Error | null>(null);
  const [source, setSource] = useState<TelemetrySource>(() => clientCachedStations ? "memory" : "database");
  const [lastUpdated, setLastUpdated] = useState<Date | null>(() => clientLastUpdated);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchTelemetry = useCallback(async (force = false, isBackground = false) => {
    // If not forced and we have recent client cache (< 45s), reuse it
    const now = Date.now();
    if (!force && clientCachedStations && now - clientCachedAt < 45_000) {
      setStations(clientCachedStations);
      setLastUpdated(clientLastUpdated);
      setLoading(false);
      return;
    }

    if (!isBackground && !clientCachedStations) {
      setLoading(true);
    }

    try {
      // Deduplicate concurrent requests
      if (!inflightFetch || force) {
        inflightFetch = (async () => {
          const url = force ? "/api/cron/ingest?force=true" : "/api/cron/ingest";
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Telemetry fetch failed with status ${res.status}`);
          }
          const data: ScrapeResult = await res.json();
          if (data.stations && data.stations.length > 0) {
            const mapped: LiveStation[] = data.stations.map((st) => {
              const fallbackCoords = getStationCoords(st.stationName);
              const stationTime = parseTimestamp(st.observedAt) || parseTimestamp(data.scrapedAt) || new Date();
              return {
                stationId: slugifyStationId(st.stationName),
                stationName: st.stationName,
                latitude: st.latitude ?? fallbackCoords.lat,
                longitude: st.longitude ?? fallbackCoords.lng,
                geohash: "",
                rain10m: st.rainfall?.rain10min ?? 0,
                rain1h: st.rainfall?.rain1hr ?? 0,
                rain24h: st.rainfall?.rain24hr ?? 0,
                waterLevel: st.waterLevel?.currentLevel ?? 0,
                waterLevelDelta1h: st.waterLevel?.change1hr ?? 0,
                waterRiskLevel: st.waterRiskLevel || st.riskLevel || "UNKNOWN",
                rainRiskLevel: st.rainRiskLevel || "UNKNOWN",
                riskLevel: st.riskLevel || "UNKNOWN",
                lastUpdated: stationTime,
              };
            });

            mapped.sort((a, b) => a.stationName.localeCompare(b.stationName));
            clientCachedStations = mapped;
            clientCachedAt = Date.now();

            const latestTime = mapped.reduce<Date | null>((max, s) => {
              if (!s.lastUpdated) return max;
              if (!max || s.lastUpdated.getTime() > max.getTime()) return s.lastUpdated;
              return max;
            }, null) || parseTimestamp(data.scrapedAt) || new Date();

            clientLastUpdated = latestTime;
            return mapped;
          }
          return [];
        })().finally(() => {
          inflightFetch = null;
        });
      }

      const mapped = await inflightFetch;
      if (mapped.length > 0) {
        setStations(mapped);
        setSource("database");
        setLastUpdated(clientLastUpdated);
        setError(null);
      }
    } catch (err: any) {
      console.warn("[useLiveFloodStatus] Fetch error:", err.message);
      if (!clientCachedStations) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();

    // Auto-refresh in background every 2 minutes
    pollIntervalRef.current = setInterval(() => {
      fetchTelemetry(false, true);
    }, 120_000);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, [fetchTelemetry]);

  return {
    stations,
    loading,
    error,
    source,
    lastUpdated,
    refreshScraper: () => fetchTelemetry(true),
  };
}
