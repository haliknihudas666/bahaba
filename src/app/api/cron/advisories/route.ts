// ---------------------------------------------------------------------------
// Bahaba – Live Advisory Route (/api/cron/advisories)
// Reads real-time road flood advisories from Firestore (populated by background worker).
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { scrapeAdvisories } from "@/lib/advisories/scraper";
import type { ReportedAdvisory, AdvisorySyncResult } from "@/types/advisory";

/** In-memory cache for fast responses without repeating DB queries on every request */
let cachedResult: AdvisorySyncResult | null = null;
let cachedAt = 0;
const CACHE_TTL_MS = 45_000; // 45 seconds

export async function GET(req?: Request): Promise<NextResponse<AdvisorySyncResult>> {
  let force = false;
  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true" || req.headers.get("x-force-sync") === "true";
    } catch {
      // ignore
    }
  }

  const now = Date.now();
  if (!force && cachedResult && cachedResult.success && now - cachedAt < CACHE_TTL_MS) {
    return NextResponse.json(cachedResult, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=45, stale-while-revalidate=90",
        "X-Cache": "HIT-MEMORY",
      },
    });
  }

  // 1. Primary Source: Fetch from Firestore collection populated by the worker
  if (adminDb) {
    try {
      const limitParam = req && req.url ? new URL(req.url).searchParams.get("limit") : null;
      const fetchLimit = limitParam ? Math.min(parseInt(limitParam, 10) || 500, 2000) : 1000;

      const snap = await adminDb
        .collection("advisories")
        .orderBy("publishedAt", "desc")
        .limit(fetchLimit)
        .get();

      if (!snap.empty) {
        const advisories: ReportedAdvisory[] = snap.docs.map((doc: any) => doc.data() as ReportedAdvisory);
        const activeFloodCount = advisories.filter(
          (a) => a.isFloodReport && a.status === "ACTIVE"
        ).length;

        const sourceBreakdown: Record<string, number> = {};
        for (const a of advisories) {
          sourceBreakdown[a.source] = (sourceBreakdown[a.source] || 0) + 1;
        }

        const firestoreResult: AdvisorySyncResult = {
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

        cachedResult = firestoreResult;
        cachedAt = Date.now();

        return NextResponse.json(firestoreResult, {
          status: 200,
          headers: {
            "Cache-Control": "public, s-maxage=45, stale-while-revalidate=90",
            "X-Cache": "HIT-FIRESTORE",
            "X-Active-Flood-Count": String(activeFloodCount),
          },
        });
      }
    } catch (err: any) {
      console.warn("[Advisories Route] Firestore query failed, checking fallback:", err.message);
    }
  }

  // 2. Secondary Fallback: Fallback ingestion if configured
  const result = await scrapeAdvisories();

  if (result.success) {
    cachedResult = result;
    cachedAt = Date.now();
  }

  return NextResponse.json(result, {
    status: 200,
    headers: {
      "Cache-Control": "public, s-maxage=45, stale-while-revalidate=90",
      "X-Cache": "FALLBACK",
      "X-Active-Flood-Count": String(result.activeFloodCount),
    },
  });
}

export const dynamic = "force-dynamic";
export const maxDuration = 30;
