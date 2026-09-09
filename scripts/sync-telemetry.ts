// ---------------------------------------------------------------------------
// Bahaba – Panahon Live Telemetry Ingestion Worker
//
// Scrapes nationwide DOST-PAGASA telemetry (AWS, river basins, synoptic) from
// a residential Philippine connection and updates MongoDB Atlas.
//
// Usage:
//   bun run sync           # Single immediate sync
//   bun run sync:watch     # Continuous polling every 5 minutes
// ---------------------------------------------------------------------------

import { ingestTelemetry } from "../src/lib/scraper";
import { convertPanahonToLiveStations } from "../src/lib/panahon-scraper";
import { saveTelemetrySnapshot } from "../src/lib/weather";

const isWatch = process.argv.includes("--watch");
const INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

async function runSync() {
  const t0 = Date.now();
  console.log(`\n[SyncWorker] [${new Date().toLocaleTimeString()}] Fetching DOST-PAGASA Panahon telemetry...`);

  try {
    const result = await ingestTelemetry();
    if (!result.success || result.stations.length === 0) {
      console.warn(`[SyncWorker] Scrape finished with no stations (success=${result.success})`);
      return;
    }

    const liveStations = convertPanahonToLiveStations(result.stations);
    const scrapedAt = result.scrapedAt || new Date().toISOString();

    const saved = await saveTelemetrySnapshot(liveStations, scrapedAt);
    const duration = ((Date.now() - t0) / 1000).toFixed(2);

    console.log(
      `[SyncWorker] SUCCESS: ${liveStations.length} stations synced to MongoDB Atlas in ${duration}s (scrapedAt: ${scrapedAt}, dbSaved=${saved})`
    );
  } catch (err: any) {
    console.error(`[SyncWorker] Sync failed:`, err?.message || err);
  }
}

async function main() {
  console.log("=== Bahaba Panahon Telemetry Sync Worker ===");
  if (isWatch) {
    console.log("Running in WATCH mode: synchronizing every 5 minutes (Ctrl+C to stop)...\n");
    await runSync();
    setInterval(runSync, INTERVAL_MS);
  } else {
    await runSync();
    process.exit(0);
  }
}

main().catch((err) => {
  console.error("Fatal error in sync worker:", err);
  process.exit(1);
});
