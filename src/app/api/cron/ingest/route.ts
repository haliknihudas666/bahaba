// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Telemetry Cron Ingestion Endpoint
//
// Ingests DOST-PAGASA Panahon real-time telemetry (AWS, River Basins, Synoptic),
// normalises values, and executes MongoDB persistence pipeline with multi-tier
// in-memory and database snapshot caching.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getCollection } from "@/lib/mongodb";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import { computeGeohash } from "@/lib/firebase/geo-utils";
import { ingestTelemetry } from "@/lib/scraper";
import type { ScrapeResult, StationTelemetry } from "@/types";

/** Minimum duration in milliseconds required between external scrape syncs (15 minutes) */
const MIN_SYNC_INTERVAL_MS = 15 * 60 * 1000;

/** In-memory cache for fast responses without repeating DB queries */
let memoryCachedResult: ScrapeResult | null = null;
let memoryCachedAt = 0;
const MEMORY_CACHE_TTL_MS = 60_000; // 60 seconds

interface DbPersistResult {
  persistedCount: number;
  skipped?: boolean;
  reason?: string;
  lastSyncedAt?: string;
  elapsedMinutes?: number;
  error?: string;
}

/**
 * Utility to run an async operation with a strict timeout to avoid blocking requests.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, fallbackMsg: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`[Timeout] ${fallbackMsg} (${ms}ms)`)), ms)
    ),
  ]);
}

/**
 * Safely parse a Date or numeric/string timestamp into a JS Date.
 */
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

/**
 * Retrieve cached telemetry snapshot from MongoDB sync_meta if fresh.
 */
async function getFreshTelemetryFromDb(): Promise<ScrapeResult | null> {
  try {
    const syncMetaCol = await getCollection("sync_meta");
    const doc = await withTimeout(
      syncMetaCol.findOne({ _id: "telemetry" as any }),
      2500,
      "MongoDB sync_meta read timeout"
    );

    if (doc && Array.isArray(doc.stations) && doc.stations.length > 0) {
      const lastSynced = parseTimestamp(doc.lastSyncedAt);
      const elapsedMs = lastSynced ? Date.now() - lastSynced.getTime() : Infinity;

      // Map back to StationTelemetry format
      const stations: StationTelemetry[] = doc.stations.map((st: any) => ({
        stationName: st.stationName,
        latitude: st.coordinates?.latitude ?? null,
        longitude: st.coordinates?.longitude ?? null,
        observedAt: st.lastUpdated,
        rainfall: {
          stationName: st.stationName,
          rain10min: st.rain10m ?? 0,
          rain30min: 0,
          rain1hr: st.rain1h ?? 0,
          rain3hr: 0,
          rain6hr: 0,
          rain12hr: 0,
          rain24hr: st.rain24h ?? 0,
          status: "NORMAL",
        },
        waterLevel: {
          stationName: st.stationName,
          currentLevel: st.waterLevel ?? 0,
          change30min: 0,
          change1hr: st.waterLevelDelta1h ?? 0,
          change2hr: 0,
          alertLevel: null,
          alarmLevel: null,
          criticalLevel: null,
        },
        waterRiskLevel: st.waterRiskLevel || "NORMAL",
        rainRiskLevel: st.rainRiskLevel || "NORMAL",
        riskLevel: st.riskLevel || "NORMAL",
      }));


      return {
        success: true,
        scrapedAt: doc.updatedAtIso || doc.lastSyncedAt || new Date().toISOString(),
        stations,
        rainfall: [],
        waterLevels: [],
        meta: {
          durationMs: 0,
          rainfallRowCount: stations.length,
          waterLevelRowCount: stations.length,
        },
      };

    }
  } catch (err: any) {
    console.warn("[MongoDB] Cached telemetry read skipped:", err.message);
  }
  return null;
}

/**
 * Execute MongoDB write pipeline for scraped station telemetry.
 */
async function persistTelemetryToMongoDB(
  stations: StationTelemetry[],
): Promise<DbPersistResult> {
  if (!stations || stations.length === 0) {
    return { persistedCount: 0 };
  }

  try {
    const summaryStationsList = [];
    const stationOps = [];
    const nowIso = new Date().toISOString();

    for (const st of stations) {
      const stationId = slugifyStationId(st.stationName);
      const fallbackCoords = getStationCoords(st.stationName);
      const lat = st.latitude ?? fallbackCoords.lat;
      const lng = st.longitude ?? fallbackCoords.lng;
      const geohash = computeGeohash(lat, lng);

      const rain10m = st.rainfall?.rain10min ?? 0;
      const rain1h = st.rainfall?.rain1hr ?? 0;
      const rain24h = st.rainfall?.rain24hr ?? 0;
      const waterLevel = st.waterLevel?.currentLevel ?? 0;
      const waterLevelDelta1h = st.waterLevel?.change1hr ?? 0;

      const stationData = {
        stationId,
        stationName: st.stationName,
        coordinates: { latitude: lat, longitude: lng },
        location: {
          type: "Point",
          coordinates: [lng, lat],
        },
        geohash,
        rain10m,
        rain1h,
        rain24h,
        waterLevel,
        waterLevelDelta1h,
        waterRiskLevel: st.waterRiskLevel,
        rainRiskLevel: st.rainRiskLevel,
        riskLevel: st.riskLevel,
        lastUpdated: st.observedAt || nowIso,
      };

      summaryStationsList.push(stationData);

      stationOps.push({
        updateOne: {
          filter: { stationId },
          update: { $set: stationData },
          upsert: true,
        },
      });
    }

    const stationsCol = await getCollection("stations");
    const syncMetaCol = await getCollection("sync_meta");

    // Execute bulk write to stations and sync metadata with timeout
    const writePromise = Promise.all([
      stationsCol.bulkWrite(stationOps, { ordered: false }),
      syncMetaCol.updateOne(
        { _id: "telemetry" as any },
        {
          $set: {
            _id: "telemetry" as any,
            lastSyncedAt: nowIso,
            stationCount: stations.length,
            status: "SUCCESS",
            updatedAtIso: nowIso,
            stations: summaryStationsList,
          },
        },
        { upsert: true }
      ),
      stationsCol.createIndex({ stationId: 1 }, { unique: true }).catch(() => {}),
      stationsCol.createIndex({ "location": "2dsphere" }).catch(() => {}),
      stationsCol.createIndex({ geohash: 1 }).catch(() => {}),
    ]);

    await withTimeout(writePromise, 5000, "MongoDB persistence write timeout");

    return {
      persistedCount: stations.length,
      skipped: false,
      lastSyncedAt: nowIso,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "MongoDB write failed";
    console.warn("[MongoDB Pipeline Error]", message);
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

  const now = Date.now();

  // Tier 1: Fast in-memory cache (< 60s)
  if (
    !force &&
    memoryCachedResult &&
    memoryCachedResult.success &&
    memoryCachedResult.stations.length > 0 &&
    now - memoryCachedAt < MEMORY_CACHE_TTL_MS
  ) {
    return NextResponse.json(memoryCachedResult, {
      status: 200,
      headers: {
        "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
        "X-Cache": "HIT-MEMORY",
        "X-Scrape-Duration-Ms": String(memoryCachedResult.meta.durationMs),
      },
    });
  }

  // Tier 2: Check MongoDB consolidated snapshot before triggering upstream scrape
  if (!force) {
    const dbCached = await getFreshTelemetryFromDb();
    if (dbCached && dbCached.stations.length > 0) {
      memoryCachedResult = dbCached;
      memoryCachedAt = Date.now();

      return NextResponse.json(dbCached, {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
          "X-Cache": "HIT-MONGODB-SNAPSHOT",
          "X-DB-Stations": String(dbCached.stations.length),
        },
      });
    }
  }

  // Tier 3: Upstream telemetry scrape & persist to MongoDB
  const result = await ingestTelemetry();

  if (result.success && result.stations.length > 0) {
    memoryCachedResult = result;
    memoryCachedAt = Date.now();
  }

  let dbMeta: DbPersistResult = { persistedCount: 0 };
  if (result.success && result.stations.length > 0) {
    try {
      dbMeta = await persistTelemetryToMongoDB(result.stations);
    } catch (persistErr: unknown) {
      const msg = persistErr instanceof Error ? persistErr.message : "MongoDB write skipped";
      console.warn("[MongoDB Ingest] Skipping write:", msg);
      dbMeta = { persistedCount: 0, error: msg };
    }
  }

  const status = result.success ? 200 : 502;

  return NextResponse.json(result, {
    status,
    headers: {
      "Cache-Control": "public, s-maxage=60, stale-while-revalidate=180",
      "X-Cache": "MISS-SCRAPED",
      "X-Scrape-Duration-Ms": String(result.meta.durationMs),
      "X-Rainfall-Rows": String(result.meta.rainfallRowCount),
      "X-WaterLevel-Rows": String(result.meta.waterLevelRowCount),
      "X-DB-Persisted-Stations": String(dbMeta.persistedCount),
      ...(dbMeta.lastSyncedAt ? { "X-DB-Last-Synced": dbMeta.lastSyncedAt } : {}),
      ...(dbMeta.error ? { "X-DB-Error": dbMeta.error } : {}),
    },
  });
}

// ---------------------------------------------------------------------------
// Route segment config
// ---------------------------------------------------------------------------
export const dynamic = "force-dynamic";
export const maxDuration = 60;
