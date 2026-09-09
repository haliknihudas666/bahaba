// ---------------------------------------------------------------------------
// Bahaba – Standalone DOST-PAGASA Panahon Scraper Worker
// Microservice for Raspberry Pi / PM2: Periodically scrapes nationwide telemetry
// and persists fresh snapshots directly into MongoDB Atlas.
// ---------------------------------------------------------------------------

import dns from "node:dns";
import path from "node:path";
import fs from "node:fs";
import { MongoClient, type Db } from "mongodb";
import { ingestTelemetry } from "../../src/lib/scraper";
import { convertPanahonToLiveStations } from "../../src/lib/panahon-scraper";
import type { LiveStation } from "../../src/types";

// Fix for Windows / Node / Bun c-ares DNS resolving to localhost 127.0.0.1 for SRV records
try {
  const currentServers = dns.getServers();
  if (!currentServers.length || currentServers.every((s) => s === "127.0.0.1" || s === "::1")) {
    dns.setServers(["8.8.8.8", "1.1.1.1", "8.8.4.4"]);
  }
} catch {
  // Ignore in environments where setServers is restricted
}

// Zero-dependency env loader from parent .env.local or local .env
function loadEnvFile(filePath: string) {
  try {
    if (!fs.existsSync(filePath)) return;
    const content = fs.readFileSync(filePath, "utf8");
    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIdx = trimmed.indexOf("=");
      if (eqIdx === -1) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  } catch {}
}

loadEnvFile(path.resolve(__dirname, "../../.env.local"));
loadEnvFile(path.resolve(__dirname, ".env"));

const mongoUri = process.env.MONGODB_URI;
const mongoDbName = process.env.MONGODB_DB || "bahaba";
const intervalMinutes = Math.max(1, parseInt(process.env.INTERVAL_MINUTES || "5", 10));
const INTERVAL_MS = intervalMinutes * 60 * 1000;
const isOnce = process.argv.includes("--once");

let mongoClient: MongoClient | null = null;
let mongoDb: Db | null = null;

async function getDatabase(): Promise<Db> {
  if (!mongoDb) {
    if (!mongoUri) {
      throw new Error(
        "[MongoDB] MONGODB_URI is not defined. Ensure .env.local exists or set MONGODB_URI."
      );
    }
    mongoClient = new MongoClient(mongoUri, {
      serverSelectionTimeoutMS: 8000,
      connectTimeoutMS: 8000,
    });
    await mongoClient.connect();
    mongoDb = mongoClient.db(mongoDbName);
    console.log(`[PanahonWorker] Connected to MongoDB Atlas (${mongoDbName})`);
  }
  return mongoDb;
}

/**
 * Execute a single telemetry scrape and persist to MongoDB Atlas.
 */
async function scrapeAndPersist(): Promise<void> {
  const t0 = Date.now();
  const timeStr = new Date().toLocaleTimeString();
  console.log(`\n========================================================`);
  console.log(`[PanahonWorker] [${timeStr}] Starting Panahon scrape pass...`);
  console.log(`========================================================`);

  try {
    const result = await ingestTelemetry();
    if (!result.success || !Array.isArray(result.stations) || result.stations.length === 0) {
      console.warn(`[PanahonWorker] Scrape finished with no stations (success=${result.success})`);
      return;
    }

    const liveStations: LiveStation[] = convertPanahonToLiveStations(result.stations);
    liveStations.sort((a, b) => a.stationName.localeCompare(b.stationName));
    const scrapedAt = result.scrapedAt || new Date().toISOString();

    const db = await getDatabase();
    const syncMetaCol = db.collection("sync_meta");

    await syncMetaCol.updateOne(
      { _id: "telemetry" as any },
      {
        $set: {
          _id: "telemetry" as any,
          lastSyncedAt: scrapedAt,
          stationCount: liveStations.length,
          status: "SUCCESS",
          updatedAtIso: scrapedAt,
          stations: liveStations.map((s) => ({
            stationId: s.stationId,
            stationName: s.stationName,
            coordinates: { latitude: s.latitude, longitude: s.longitude },
            location: { type: "Point", coordinates: [s.longitude, s.latitude] },
            geohash: s.geohash,
            rain10m: s.rain10m,
            rain1h: s.rain1h,
            rain24h: s.rain24h,
            waterLevel: s.waterLevel,
            waterLevelDelta1h: s.waterLevelDelta1h,
            waterRiskLevel: s.waterRiskLevel,
            rainRiskLevel: s.rainRiskLevel,
            riskLevel: s.riskLevel,
            lastUpdated: s.lastUpdated instanceof Date ? s.lastUpdated.toISOString() : s.lastUpdated,
          })),
        },
      },
      { upsert: true }
    );

    // Compute key metrics for summary logging
    let peakWater = 0;
    let peakWaterStation = "N/A";
    let maxRain1h = 0;
    let maxRain1hStation = "N/A";
    let highRiskCount = 0;

    for (const s of liveStations) {
      if (s.riskLevel === "CRITICAL" || s.riskLevel === "ALARM" || s.riskLevel === "ALERT") {
        highRiskCount++;
      }
      if (s.waterLevel > peakWater) {
        peakWater = s.waterLevel;
        peakWaterStation = s.stationName;
      }
      if (s.rain1h > maxRain1h) {
        maxRain1h = s.rain1h;
        maxRain1hStation = s.stationName;
      }
    }

    const durationSec = ((Date.now() - t0) / 1000).toFixed(2);
    console.log(`[PanahonWorker] SUCCESS: ${liveStations.length} stations saved to MongoDB Atlas!`);
    console.log(`[PanahonWorker] Duration: ${durationSec}s | Scraped At: ${scrapedAt}`);
    console.log(
      `[PanahonWorker] Metrics: Peak Water=${peakWater.toFixed(2)}m (${peakWaterStation}) | Max Rain 1h=${maxRain1h}mm (${maxRain1hStation}) | High Risk=${highRiskCount}`
    );
  } catch (err: any) {
    console.error(`[PanahonWorker] Scrape failed:`, err?.message || err);
  }
}

/**
 * Worker main process entrypoint
 */
async function main() {
  console.log(`\n========================================================`);
  console.log(`🌤️  Bahaba DOST-PAGASA Panahon Telemetry Worker`);
  console.log(`========================================================`);
  console.log(`Target Database: ${mongoDbName}`);
  console.log(`Execution Mode:  ${isOnce ? "SINGLE RUN (--once)" : `DAEMON (every ${intervalMinutes} mins)`}`);

  if (isOnce) {
    await scrapeAndPersist();
    if (mongoClient) await mongoClient.close();
    process.exit(0);
  }

  // Initial immediate run
  await scrapeAndPersist();

  // Scheduled interval
  const intervalTimer = setInterval(async () => {
    await scrapeAndPersist();
  }, INTERVAL_MS);

  // Graceful shutdown handling
  const shutdown = async (sig: string) => {
    console.log(`\n[PanahonWorker] Received ${sig}. Shutting down worker cleanly...`);
    clearInterval(intervalTimer);
    if (mongoClient) {
      try {
        await mongoClient.close();
      } catch {}
    }
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("Fatal error starting Panahon worker:", err);
  process.exit(1);
});
