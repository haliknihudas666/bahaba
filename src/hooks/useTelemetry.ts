"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Dedicated Telemetry React Hook
//
// Fetches all active DOST-PAGASA Panahon telemetry stations from `/api/telemetry`
// with global in-memory caching and periodic background polling (60s).
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback, useRef } from "react";
import type { LiveStation } from "@/types";
import type { TelemetryApiResponse } from "@/app/api/telemetry/route";

export interface UseTelemetryReturn {
  stations: LiveStation[];
  metrics: TelemetryApiResponse["metrics"] | null;
  scrapedAt: string | null;
  loading: boolean;
  error: Error | null;
  refresh: () => Promise<void>;
}

let cachedTelemetry: TelemetryApiResponse | null = null;
let cachedTelemetryAt = 0;
let inflightTelemetryPromise: Promise<TelemetryApiResponse | null> | null = null;

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

export function useTelemetry(): UseTelemetryReturn {
  const [stations, setStations] = useState<LiveStation[]>(() => cachedTelemetry?.stations || []);
  const [metrics, setMetrics] = useState<TelemetryApiResponse["metrics"] | null>(() => cachedTelemetry?.metrics || null);
  const [scrapedAt, setScrapedAt] = useState<string | null>(() => cachedTelemetry?.scrapedAt || null);
  const [loading, setLoading] = useState<boolean>(() => !cachedTelemetry);
  const [error, setError] = useState<Error | null>(null);

  const fetchTelemetry = useCallback(async (force = false, isBackground = false) => {
    const now = Date.now();
    if (!force && cachedTelemetry && now - cachedTelemetryAt < 30_000) {
      setStations(cachedTelemetry.stations);
      setMetrics(cachedTelemetry.metrics);
      setScrapedAt(cachedTelemetry.scrapedAt);
      setLoading(false);
      return;
    }

    if (!isBackground && !cachedTelemetry) {
      setLoading(true);
    }

    try {
      if (!inflightTelemetryPromise || force) {
        inflightTelemetryPromise = (async () => {
          const url = force ? "/api/telemetry?force=true" : "/api/telemetry";
          const res = await fetch(url);
          if (!res.ok) {
            throw new Error(`Telemetry fetch failed with status ${res.status}`);
          }
          const data: TelemetryApiResponse = await res.json();
          if (data.stations && data.stations.length > 0) {
            data.stations = data.stations.map((st) => ({
              ...st,
              lastUpdated: parseTimestamp(st.lastUpdated) || new Date(),
            }));
            cachedTelemetry = data;
            cachedTelemetryAt = Date.now();
            return data;
          }
          return null;
        })().finally(() => {
          inflightTelemetryPromise = null;
        });
      }

      const data = await inflightTelemetryPromise;
      if (data && data.stations.length > 0) {
        setStations(data.stations);
        setMetrics(data.metrics);
        setScrapedAt(data.scrapedAt);
        setError(null);
      }
    } catch (err: any) {
      console.warn("[useTelemetry] Fetch error:", err.message);
      if (!cachedTelemetry) {
        setError(err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchTelemetry();

    const interval = setInterval(() => {
      fetchTelemetry(false, true);
    }, 60_000);

    return () => clearInterval(interval);
  }, [fetchTelemetry]);

  return {
    stations,
    metrics,
    scrapedAt,
    loading,
    error,
    refresh: () => fetchTelemetry(true),
  };
}
