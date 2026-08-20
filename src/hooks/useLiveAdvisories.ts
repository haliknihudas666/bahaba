// ---------------------------------------------------------------------------
// Bahaba – useLiveAdvisories Hook
// ---------------------------------------------------------------------------

import { useState, useEffect, useCallback } from "react";
import type { ReportedAdvisory, AdvisorySyncResult } from "@/types/advisory";

export function useLiveAdvisories() {
  const [advisories, setAdvisories] = useState<ReportedAdvisory[]>([]);
  const [activeFloodCount, setActiveFloodCount] = useState<number>(0);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [lastFetchedAt, setLastFetchedAt] = useState<string | null>(null);
  const [selectedAdvisory, setSelectedAdvisory] = useState<ReportedAdvisory | null>(null);

  const fetchAdvisories = useCallback(async (force = false) => {
    try {
      if (force) setIsRefreshing(true);
      const url = force ? "/api/cron/advisories?force=true" : "/api/cron/advisories";
      const res = await fetch(url);
      if (res.ok) {
        const data: AdvisorySyncResult = await res.json();
        if (data.success) {
          setAdvisories(data.advisories || []);
          setActiveFloodCount(data.activeFloodCount || 0);
          setLastFetchedAt(data.scrapedAt);
        }
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
