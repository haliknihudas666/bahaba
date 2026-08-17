// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Telemetry Cron Ingestion Endpoint
//
// Scrapes PAGASA Pasig-Marikina-Tullahan FFWS telemetry tables, normalises
// values, and executes dual Firestore batch write pipelines.
// ---------------------------------------------------------------------------

import { NextResponse, type NextRequest } from "next/server";
import { adminDb } from "@/lib/firebase/admin";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import { computeGeohash } from "@/lib/firebase/geo-utils";
import { ingestTelemetry } from "@/lib/scraper";
import type { ScrapeResult, StationTelemetry } from "@/types";

/**
 * Execute Firestore dual-pipeline write for scraped station telemetry
 */
async function persistTelemetryToFirestore(stations: StationTelemetry[]): Promise<{
  persistedCount: number;
  error?: string;
}> {
  if (!stations || stations.length === 0 || !adminDb) {
    return { persistedCount: 0 };
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { FieldValue, GeoPoint } = require("firebase-admin/firestore");

    const batch = adminDb.batch();

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

      // Pipeline A: Historical Time-Series Document
      const historyRef = adminDb.collection("telemetry_history").doc();
      batch.set(historyRef, {
        stationId,
        stationName: st.stationName,
        rain10m,
        rain1h,
        rain24h,
        waterLevel,
        waterLevelDelta1h,
        timestamp: FieldValue.serverTimestamp(),
      });

      // Pipeline B: Active Station Snapshot Document
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

    await batch.commit();
    return { persistedCount: stations.length };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Firestore write failed";
    console.error("[Firestore Pipeline Error]", message);
    return { persistedCount: 0, error: message };
  }
}

// ---------------------------------------------------------------------------
// GET /api/cron/ingest
// ---------------------------------------------------------------------------

export async function GET(): Promise<NextResponse<ScrapeResult>> {
  // ── Run telemetry scraping ──────────────────────────────────────────────
  const result = await ingestTelemetry();

  // ── Firestore Persistence Pipeline ──────────────────────────────────────
  let firestoreMeta: { persistedCount: number; error?: string } = { persistedCount: 0 };
  if (result.success && result.stations.length > 0) {
    firestoreMeta = await persistTelemetryToFirestore(result.stations);
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
      ...(firestoreMeta.error ? { "X-Firestore-Error": firestoreMeta.error } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Route segment config
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const maxDuration = 60;

