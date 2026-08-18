// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Telemetry Cron Ingestion Endpoint
//
// Scrapes PAGASA Pasig-Marikina-Tullahan FFWS telemetry tables, normalises
// values, and executes dual Firestore batch write pipelines.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import { computeGeohash } from "@/lib/firebase/geo-utils";
import { ingestTelemetry } from "@/lib/scraper";
import type { ScrapeResult, StationTelemetry } from "@/types";

/** Minimum duration in milliseconds required between Firestore syncs (30 minutes) */
const MIN_SYNC_INTERVAL_MS = 30 * 60 * 1000;

interface FirestorePersistResult {
  persistedCount: number;
  skipped?: boolean;
  reason?: string;
  lastSyncedAt?: string;
  elapsedMinutes?: number;
  error?: string;
}

/**
 * Safely parse a Firestore Timestamp, Date object, or numeric/string timestamp into a JS Date.
 */
function parseFirestoreTimestamp(val: unknown): Date | null {
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
  if (typeof (val as any).seconds === "number") {
    return new Date((val as any).seconds * 1000);
  }
  if (typeof val === "string" || typeof val === "number") {
    const d = new Date(val);
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

/**
 * Retrieve the most recent sync timestamp from Firestore.
 * Checks `sync_meta/telemetry`, falling back to `stations`.
 */
async function getLastSyncTimestamp(): Promise<Date | null> {
  if (!adminDb) return null;

  try {
    // 1. Primary check: Dedicated sync metadata document
    const syncMetaSnap = await adminDb.collection("sync_meta").doc("telemetry").get();
    if (syncMetaSnap.exists) {
      const data = syncMetaSnap.data();
      const lastSynced = parseFirestoreTimestamp(data?.lastSyncedAt);
      if (lastSynced) return lastSynced;
    }

    // 2. Fallback check: Latest lastUpdated in stations
    const stationSnap = await adminDb
      .collection("stations")
      .orderBy("lastUpdated", "desc")
      .limit(1)
      .get();

    if (!stationSnap.empty) {
      const data = stationSnap.docs[0].data();
      const stationTime = parseFirestoreTimestamp(data?.lastUpdated);
      if (stationTime) return stationTime;
    }
  } catch (err) {
    console.warn("[Firestore] Failed to check last sync timestamp:", err);
  }

  return null;
}

/**
 * Execute Firestore write pipeline for scraped station telemetry.
 * Skips saving to Firestore if the last sync was less than 30 minutes ago (unless force is true).
 */
async function persistTelemetryToFirestore(
  stations: StationTelemetry[],
  force: boolean = false,
): Promise<FirestorePersistResult> {
  if (!stations || stations.length === 0 || !adminDb) {
    return { persistedCount: 0 };
  }

  try {
    // ── Check if last sync was within the last 30 minutes ─────────────────
    if (!force) {
      const lastSyncDate = await getLastSyncTimestamp();
      if (lastSyncDate) {
        const now = Date.now();
        const elapsedMs = now - lastSyncDate.getTime();

        // If last sync was less than 30 minutes ago, skip saving to Firebase
        if (elapsedMs >= 0 && elapsedMs < MIN_SYNC_INTERVAL_MS) {
          const elapsedMinutes = Math.floor(elapsedMs / 60_000);
          const remainingMinutes = Math.ceil((MIN_SYNC_INTERVAL_MS - elapsedMs) / 60_000);
          const reason = `Last sync was ${elapsedMinutes}m ago (< 30m). Next sync allowed in ~${remainingMinutes}m.`;

          console.log(`[Firestore Ingest] Skipping save to Firebase: ${reason}`);

          return {
            persistedCount: 0,
            skipped: true,
            reason,
            lastSyncedAt: lastSyncDate.toISOString(),
            elapsedMinutes,
          };
        }
      }
    }

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FieldValue, GeoPoint } = require("firebase-admin/firestore");

    const batch = adminDb.batch();
    const summaryStationsList = [];

    for (const st of stations) {
      const stationId = slugifyStationId(st.stationName);
      // Prefer PAGASA's authoritative coords from map_list.do; fallback to hardcoded
      const fallbackCoords = getStationCoords(st.stationName);
      const lat = st.latitude ?? fallbackCoords.lat;
      const lng = st.longitude ?? fallbackCoords.lng;
      const geohash = computeGeohash(lat, lng);

      const rain10m = st.rainfall?.rain10min ?? 0;
      const rain1h = st.rainfall?.rain1hr ?? 0;
      const rain24h = st.rainfall?.rain24hr ?? 0;
      const waterLevel = st.waterLevel?.currentLevel ?? 0;
      const waterLevelDelta1h = st.waterLevel?.change1hr ?? 0;

      // Add to consolidated array for single-document O(1) reads
      summaryStationsList.push({
        stationId,
        stationName: st.stationName,
        coordinates: { latitude: lat, longitude: lng },
        geohash,
        rain10m,
        rain1h,
        rain24h,
        waterLevel,
        waterLevelDelta1h,
        waterRiskLevel: st.waterRiskLevel,
        rainRiskLevel: st.rainRiskLevel,
        riskLevel: st.riskLevel,
        lastUpdated: new Date().toISOString(),
      });

      // Pipeline: Active Station Snapshot Document
      const stationRef = adminDb.collection("stations").doc(stationId);
      batch.set(
        stationRef,
        {
          stationId,
          stationName: st.stationName,
          coordinates: new GeoPoint(lat, lng),
          geohash,
          rain10m,
          rain1h,
          rain24h,
          waterLevel,
          waterLevelDelta1h,
          waterRiskLevel: st.waterRiskLevel,
          rainRiskLevel: st.rainRiskLevel,
          riskLevel: st.riskLevel,
          lastUpdated: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    }

    // Consolidated Sync Metadata & Telemetry Snapshot Document
    const syncMetaRef = adminDb.collection("sync_meta").doc("telemetry");
    batch.set(
      syncMetaRef,
      {
        lastSyncedAt: FieldValue.serverTimestamp(),
        stationCount: stations.length,
        status: "SUCCESS",
        updatedAtIso: new Date().toISOString(),
        stations: summaryStationsList,
      },
      { merge: true },
    );

    await batch.commit();
    return {
      persistedCount: stations.length,
      skipped: false,
      lastSyncedAt: new Date().toISOString(),
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Firestore write failed";
    console.error("[Firestore Pipeline Error]", message);
    return { persistedCount: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// GET /api/cron/ingest
// ---------------------------------------------------------------------------

export async function GET(req?: Request): Promise<NextResponse<ScrapeResult>> {
  let force = false;
  if (req && req.url) {
    try {
      const url = new URL(req.url);
      force = url.searchParams.get("force") === "true" || req.headers.get("x-force-sync") === "true";
    } catch {
      // ignore
    }
  }

  // ── Run telemetry scraping ──────────────────────────────────────────────
  const result = await ingestTelemetry();

  // ── Firestore Persistence Pipeline ──────────────────────────────────────
  let firestoreMeta: FirestorePersistResult = { persistedCount: 0 };
  if (result.success && result.stations.length > 0) {
    firestoreMeta = await persistTelemetryToFirestore(result.stations, force);
  }

  // Return 502 when upstream scrape failed
  const status = result.success ? 200 : 502;

  return NextResponse.json(result, {
    status,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "X-Scrape-Duration-Ms": String(result.meta.durationMs),
      "X-Rainfall-Rows": String(result.meta.rainfallRowCount),
      "X-WaterLevel-Rows": String(result.meta.waterLevelRowCount),
      "X-Firestore-Persisted-Stations": String(firestoreMeta.persistedCount),
      "X-Firestore-Skipped": String(Boolean(firestoreMeta.skipped)),
      ...(firestoreMeta.lastSyncedAt ? { "X-Firestore-Last-Synced": firestoreMeta.lastSyncedAt } : {}),
      ...(firestoreMeta.reason ? { "X-Firestore-Skip-Reason": firestoreMeta.reason } : {}),
      ...(firestoreMeta.error ? { "X-Firestore-Error": firestoreMeta.error } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Route segment config
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const maxDuration = 60;

