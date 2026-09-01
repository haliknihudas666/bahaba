// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Elevation Storage & Ingestion Service
//
// Persistent Digital Elevation Model (DEM) management for coordinates and roads.
// Multi-layer caching strategy:
//   1. In-memory Map cache (instant sub-millisecond lookups)
//   2. MongoDB `elevations` collection (permanent grid-quantized storage on server)
//   3. Open-Meteo Elevation API (batched upstream fetch on cache-miss)
//   4. Calibrated Metro Manila Topological Fallback model
// ---------------------------------------------------------------------------

export interface ElevationDoc {
  _id: string; // e.g. "grid_14.607_120.989"
  lat: number;
  lng: number;
  elevationM: number;
  source: "open-meteo" | "fallback" | "manual";
  createdAt: Date;
  updatedAt: Date;
}

/** Global fast in-memory cache */
const memoryElevationCache = new Map<string, number>();

/**
 * Snap coordinates to 3 decimal places (~110 meters spatial resolution)
 * for optimal spatial caching across road segments and grid cells.
 */
export function toElevationGridKey(lat: number, lng: number): string {
  return `${lat.toFixed(3)}_${lng.toFixed(3)}`;
}

/**
 * Calibrated fallback elevation model for Metro Manila if upstream APIs are unreachable.
 */
export function estimateFallbackElevation(lat: number, lng: number): number {
  // Approximate slope from Manila Bay (West ~120.95, Low) to Sierra Madre foothills (East ~121.15, High)
  const westBound = 120.95;
  const eastBound = 121.15;
  const clampedLng = Math.min(Math.max(lng, westBound), eastBound);
  const normalizedLng = (clampedLng - westBound) / (eastBound - westBound);

  let estimatedElevation = 2.0 + Math.pow(normalizedLng, 1.6) * 45.0;

  // Specific Metro Manila localized depression adjustments:
  // España / UST low bowl
  if (lat >= 14.60 && lat <= 14.62 && lng >= 120.98 && lng <= 121.00) {
    estimatedElevation = 2.4;
  }
  // Taft / PGH low corridor
  else if (lat >= 14.56 && lat <= 14.59 && lng >= 120.97 && lng <= 120.99) {
    estimatedElevation = 2.8;
  }
  // G. Araneta / Talayan basin
  else if (lat >= 14.615 && lat <= 14.638 && lng >= 121.005 && lng <= 121.02) {
    estimatedElevation = 1.8;
  }
  // EDSA Shaw / Ortigas ridge
  else if (lat >= 14.58 && lat <= 14.59 && lng >= 121.045 && lng <= 121.06) {
    estimatedElevation = 22.0;
  }
  // Katipunan / Loyola plateau
  else if (lat >= 14.63 && lat <= 14.66 && lng >= 121.065 && lng <= 121.08) {
    estimatedElevation = 38.0;
  }

  return Math.round(estimatedElevation * 10) / 10;
}

/**
 * Dynamically access MongoDB collection on server-side only
 */
async function getElevationCollection() {
  if (typeof window !== "undefined") return null;
  try {
    const { getCollection } = await import("@/lib/mongodb/client");
    return await getCollection<ElevationDoc>("elevations");
  } catch {
    return null;
  }
}

/**
 * Safely fetch elevations in batch from MongoDB `elevations` collection on server.
 */
async function fetchElevationsFromDb(keys: string[]): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (!keys || keys.length === 0 || typeof window !== "undefined") return result;

  try {
    const col = await getElevationCollection();
    if (!col) return result;
    const docs = await col.find({ _id: { $in: keys } }).toArray();

    for (const doc of docs) {
      if (typeof doc.elevationM === "number") {
        result.set(doc._id, doc.elevationM);
      }
    }
  } catch (err) {
    console.warn("[ElevationStore] MongoDB read skipped:", err instanceof Error ? err.message : err);
  }

  return result;
}

/**
 * Persist discovered elevations to MongoDB collection `elevations` on server.
 */
async function persistElevationsToDb(entries: Array<{ key: string; lat: number; lng: number; elevationM: number; source: "open-meteo" | "fallback" }>) {
  if (!entries || entries.length === 0 || typeof window !== "undefined") return;

  try {
    const col = await getElevationCollection();
    if (!col) return;
    const now = new Date();
    const ops = entries.map((entry) => ({
      updateOne: {
        filter: { _id: entry.key },
        update: {
          $set: {
            lat: entry.lat,
            lng: entry.lng,
            elevationM: entry.elevationM,
            source: entry.source,
            updatedAt: now,
          },
          $setOnInsert: {
            createdAt: now,
          },
        },
        upsert: true,
      },
    }));

    await col.bulkWrite(ops, { ordered: false });
  } catch (err) {
    console.warn("[ElevationStore] MongoDB bulk write warning:", err instanceof Error ? err.message : err);
  }
}

/**
 * Batch fetch elevation (meters above sea level) for an array of [lat, lng] coordinates.
 */
export async function getElevationsForCoordinates(
  coords: [number, number][]
): Promise<number[]> {
  if (!coords || coords.length === 0) return [];

  const results: (number | null)[] = new Array(coords.length).fill(null);
  const keys = coords.map(([lat, lng]) => toElevationGridKey(lat, lng));

  // 1. Check RAM Cache
  const uncachedIndices: number[] = [];
  const uncachedKeys: string[] = [];

  keys.forEach((key, idx) => {
    if (memoryElevationCache.has(key)) {
      results[idx] = memoryElevationCache.get(key)!;
    } else {
      uncachedIndices.push(idx);
      uncachedKeys.push(key);
    }
  });

  if (uncachedKeys.length === 0) {
    return results.map((val) => val ?? 4.0);
  }

  // 2. Query MongoDB for missing keys (Server-side)
  const uniqueUncachedKeys = Array.from(new Set(uncachedKeys));
  const dbElevations = await fetchElevationsFromDb(uniqueUncachedKeys);

  const stillUncachedIndices: number[] = [];
  const stillUncachedCoords: [number, number][] = [];
  const stillUncachedKeys: string[] = [];

  uncachedIndices.forEach((idx) => {
    const key = keys[idx];
    if (dbElevations.has(key)) {
      const elev = dbElevations.get(key)!;
      results[idx] = elev;
      memoryElevationCache.set(key, elev);
    } else {
      stillUncachedIndices.push(idx);
      stillUncachedCoords.push(coords[idx]);
      stillUncachedKeys.push(key);
    }
  });

  if (stillUncachedCoords.length === 0) {
    return results.map((val) => val ?? 4.0);
  }

  // 3. Fetch from Open-Meteo DEM API in batches of 80
  const BATCH_SIZE = 80;
  const newDbEntries: Array<{ key: string; lat: number; lng: number; elevationM: number; source: "open-meteo" | "fallback" }> = [];

  for (let b = 0; b < stillUncachedCoords.length; b += BATCH_SIZE) {
    const batchCoords = stillUncachedCoords.slice(b, b + BATCH_SIZE);
    const batchIndices = stillUncachedIndices.slice(b, b + BATCH_SIZE);
    const batchKeys = stillUncachedKeys.slice(b, b + BATCH_SIZE);

    const latStr = batchCoords.map((c) => c[0].toFixed(5)).join(",");
    const lngStr = batchCoords.map((c) => c[1].toFixed(5)).join(",");

    let fetchSuccess = false;

    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lngStr}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.elevation)) {
          fetchSuccess = true;
          data.elevation.forEach((elev: number | null, itemIdx: number) => {
            const originalIdx = batchIndices[itemIdx];
            const coord = batchCoords[itemIdx];
            const key = batchKeys[itemIdx];
            const safeElev =
              typeof elev === "number" && Number.isFinite(elev)
                ? Math.round(elev * 10) / 10
                : estimateFallbackElevation(coord[0], coord[1]);

            results[originalIdx] = safeElev;
            memoryElevationCache.set(key, safeElev);
            newDbEntries.push({
              key,
              lat: coord[0],
              lng: coord[1],
              elevationM: safeElev,
              source: "open-meteo",
            });
          });
        }
      }
    } catch (err) {
      console.warn("[ElevationStore] Open-Meteo DEM fetch failed, using topological fallback:", err instanceof Error ? err.message : err);
    }

    // 4. Fallback for this batch if upstream failed
    if (!fetchSuccess) {
      batchCoords.forEach((coord, itemIdx) => {
        const originalIdx = batchIndices[itemIdx];
        const key = batchKeys[itemIdx];
        const fallbackElev = estimateFallbackElevation(coord[0], coord[1]);

        results[originalIdx] = fallbackElev;
        memoryElevationCache.set(key, fallbackElev);
        newDbEntries.push({
          key,
          lat: coord[0],
          lng: coord[1],
          elevationM: fallbackElev,
          source: "fallback",
        });
      });
    }
  }

  // 5. Asynchronously persist newly fetched elevations to MongoDB on server
  if (newDbEntries.length > 0) {
    persistElevationsToDb(newDbEntries).catch(() => {});
  }

  return results.map((val, idx) => val ?? estimateFallbackElevation(coords[idx][0], coords[idx][1]));
}

/**
 * Fetch elevation for a single coordinate point.
 */
export async function getElevation(lat: number, lng: number): Promise<number> {
  const res = await getElevationsForCoordinates([[lat, lng]]);
  return res[0] ?? estimateFallbackElevation(lat, lng);
}
