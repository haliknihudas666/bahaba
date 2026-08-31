// ---------------------------------------------------------------------------
// Bahaba – useLiveAdvisories Hook
// Includes shared client memory caching and deduplication across components.
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import type { ReportedAdvisory, AdvisorySyncResult } from "@/types/advisory";

let clientCachedAdvisories: ReportedAdvisory[] | null = null;
let clientCachedActiveFloodCount = 0;
let clientCachedAt = 0;
let clientLastFetchedAt: string | null = null;
let inflightAdvisoryFetch: Promise<AdvisorySyncResult | null> | null = null;

export function useLiveAdvisories() {
  const [advisories, setAdvisories] = useState<ReportedAdvisory[]>(() => clientCachedAdvisories || []);
  const [activeFloodCount, setActiveFloodCount] = useState<number>(() => clientCachedActiveFloodCount);
  const [isLoading, setIsLoading] = useState<boolean>(() => !clientCachedAdvisories);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(() => clientLastFetchedAt);
  const [selectedAdvisory, setSelectedAdvisory] = useState<ReportedAdvisory | null>(null);

  const fetchAdvisories = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && clientCachedAdvisories && now - clientCachedAt < 45_000) {
      setAdvisories(clientCachedAdvisories);
      setActiveFloodCount(clientCachedActiveFloodCount);
      setLastFetchedAt(clientLastFetchedAt);
      setIsLoading(false);
      return;
    }

    try {
      if (force) setIsRefreshing(true);

      if (!inflightAdvisoryFetch || force) {
        inflightAdvisoryFetch = (async () => {
          const url = force ? "/api/cron/advisories?force=true" : "/api/cron/advisories";
          const res = await fetch(url);
          if (res.ok) {
            const data: AdvisorySyncResult = await res.json();
            return data;
          }
          return null;
        })().finally(() => {
          inflightAdvisoryFetch = null;
        });
      }

      const data = await inflightAdvisoryFetch;
      if (data && data.success) {
        const list = data.advisories || [];
        const activeCount = data.activeFloodCount || 0;

        clientCachedAdvisories = list;
        clientCachedActiveFloodCount = activeCount;
        clientCachedAt = Date.now();
        clientLastFetchedAt = data.scrapedAt;

        setAdvisories(list);
        setActiveFloodCount(activeCount);
        setLastFetchedAt(data.scrapedAt);
      }
    } catch (err) {
      console.warn("[useLiveAdvisories] Fetch error:", err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchAdvisories();
    // Auto-refresh every 2 minutes
    const interval = setInterval(() => {
      fetchAdvisories();
    }, 120_000);
    return () => clearInterval(interval);
  }, [fetchAdvisories]);

  return {
    advisories,
    activeFloodCount,
    isLoading,
    isRefreshing,
    lastFetchedAt,
    selectedAdvisory,
    setSelectedAdvisory,
    refreshAdvisories: () => fetchAdvisories(true),
  };
}
