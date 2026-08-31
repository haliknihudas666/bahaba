// ---------------------------------------------------------------------------
// Bahaba – Live Advisory Route (/api/cron/advisories)
// Reads real-time road flood advisories from MongoDB (populated by background worker).
// Uses multi-tier in-memory and HTTP cache headers to minimize database load.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { scrapeAdvisories } from "@/lib/advisories/scraper";
import type { ReportedAdvisory, AdvisorySyncResult } from "@/types/advisory";

interface CacheEntry {
  data: AdvisorySyncResult;
  cachedAt: number;
}

/** In-memory cache keyed by request params (limit, filter) */
const memoryCache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60_000; // 60 seconds

export async function GET(req?: Request): Promise<NextResponse<AdvisorySyncResult>> {
  let force = false;
  let fetchLimit = 1000;

  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true" || req.headers.get("x-force-sync") === "true";
      const limitParam = url.searchParams.get("limit");
      if (limitParam) {
        fetchLimit = Math.min(parseInt(limitParam, 10) || 500, 2000);
      }
    } catch {
      // ignore
    }
  }

  const cacheKey = `advisories:limit=${fetchLimit}`;
  const now = Date.now();
  const cached = memoryCache.get(cacheKey);

  // 1. Return In-Memory Cache if valid (< 60s) and not forced
  if (!force && cached && cached.data.success && now - cached.cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
        "X-Cache": "HIT-MEMORY",
        "X-Cache-Age-Sec": String(Math.floor((now - cached.cachedAt) / 1000)),
      },
    });
  }

  // 2. Primary Source: Fetch from MongoDB collection populated by the worker (24h retention window)
  try {
    const advisoriesCol = await getCollection<ReportedAdvisory>("advisories");
    const cutoffIso = new Date(now - 24 * 60 * 60 * 1000).toISOString();

    // Background housekeeping: asynchronously purge records older than 24 hours
    advisoriesCol.deleteMany({ publishedAt: { $lt: cutoffIso } }).catch(() => {});

    const docs = await advisoriesCol
      .find({ publishedAt: { $gte: cutoffIso } })
      .sort({ publishedAt: -1 })
      .limit(fetchLimit)
      .project({ _id: 0 })
      .toArray();

    if (docs.length > 0) {
      const advisories: ReportedAdvisory[] = docs as unknown as ReportedAdvisory[];
      const activeFloodCount = advisories.filter(
        (a) => a.isFloodReport && a.status === "ACTIVE"
      ).length;

      const sourceBreakdown: Record<string, number> = {};
      for (const a of advisories) {
        sourceBreakdown[a.source] = (sourceBreakdown[a.source] || 0) + 1;
      }

      const mongoResult: AdvisorySyncResult = {
        success: true,
        scrapedAt: new Date().toISOString(),
        advisories,
        totalCount: advisories.length,
        activeFloodCount,
        meta: {
          durationMs: Date.now() - now,
          sourceBreakdown,
        },
      };

      memoryCache.set(cacheKey, { data: mongoResult, cachedAt: Date.now() });

      return NextResponse.json(mongoResult, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
          "X-Cache": "HIT-MONGODB",
          "X-Active-Flood-Count": String(activeFloodCount),
        },
      });
    }
  } catch (err: any) {
    console.warn("[Advisories Route] MongoDB query failed, checking fallback:", err.message);
  }

  // 3. Secondary Fallback: Direct fallback ingestion if DB has no records yet
  const result = await scrapeAdvisories();

  if (result.success) {
    memoryCache.set(cacheKey, { data: result, cachedAt: Date.now() });
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
      "X-Cache": "FALLBACK",
      "X-Active-Flood-Count": String(result.activeFloodCount),
    },
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
