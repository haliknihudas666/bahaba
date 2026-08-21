// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Open-Meteo District Rainfall Service
//
// Fetches high-resolution, hyper-local city and district-level precipitation
// measurements (current rate mm/hr, 24h accumulation) from Open-Meteo API.
// Features in-memory grid-snapped caching (1.1km resolution, 10-min TTL).
// ---------------------------------------------------------------------------

export interface DistrictRainfall {
  latitude: number;
  longitude: number;
  /** Current precipitation intensity in mm/hr */
  currentRainMmHr: number;
  /** 24-hour accumulated precipitation in mm */
  rain24hMm: number;
  /** Whether active rain is detected */
  isRaining: boolean;
  /** Timestamp of observation or forecast */
  fetchedAt: string;
}

const CACHE = new Map<string, { data: DistrictRainfall; expiresAt: number }>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Snap coordinates to 2 decimal places (~1.1 km grid resolution)
 * to maximize cache hit rates across nearby street segments.
 */
function toGridKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

/**
 * Fetch hyper-local city/district rainfall for a single coordinate.
 */
export async function fetchDistrictRainfall(
  lat: number,
  lng: number
): Promise<DistrictRainfall> {
  const key = toGridKey(lat, lng);
  const now = Date.now();

  const cached = CACHE.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.data;
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain&hourly=precipitation,rain&timezone=Asia%2FManila`;

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Bahaba-Flood-Engine/1.0",
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`Open-Meteo HTTP ${res.status}`);
    }

    const json = await res.json();
    const currentPrecip = Number(json?.current?.precipitation ?? json?.current?.rain ?? 0);

    // Compute 24h accumulated rain from hourly if available
    let rain24h = 0;
    if (json?.hourly?.precipitation && Array.isArray(json.hourly.precipitation)) {
      const past24Hours = json.hourly.precipitation.slice(0, 24);
      rain24h = past24Hours.reduce((sum: number, val: number) => sum + (Number(val) || 0), 0);
    } else {
      rain24h = currentPrecip * 3; // conservative proxy
    }

    const result: DistrictRainfall = {
      latitude: lat,
      longitude: lng,
      currentRainMmHr: currentPrecip,
      rain24hMm: Math.round(rain24h * 10) / 10,
      isRaining: currentPrecip > 0.1,
      fetchedAt: new Date().toISOString(),
    };

    CACHE.set(key, { data: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn(
      `[MeteoRainfall] Fetch failed for (${lat.toFixed(2)}, ${lng.toFixed(2)}):`,
      err instanceof Error ? err.message : err
    );

    // Fallback zero reading
    const fallback: DistrictRainfall = {
      latitude: lat,
      longitude: lng,
      currentRainMmHr: 0,
      rain24hMm: 0,
      isRaining: false,
      fetchedAt: new Date().toISOString(),
    };
    return fallback;
  }
}

/**
 * Batch fetch city/district rainfall for multiple coordinates in chunks of up to 50.
 */
export async function batchFetchDistrictRainfall(
  coords: Array<{ lat: number; lng: number }>
): Promise<Map<string, DistrictRainfall>> {
  const results = new Map<string, DistrictRainfall>();
  const uncachedCoords: Array<{ lat: number; lng: number; key: string }> = [];
  const now = Date.now();

  for (const c of coords) {
    const key = toGridKey(c.lat, c.lng);
    const cached = CACHE.get(key);
    if (cached && cached.expiresAt > now) {
      results.set(key, cached.data);
    } else {
      uncachedCoords.push({ lat: c.lat, lng: c.lng, key });
    }
  }

  if (uncachedCoords.length === 0) {
    return results;
  }

  // Process uncached coordinates in batches
  const CHUNK_SIZE = 40;
  for (let i = 0; i < uncachedCoords.length; i += CHUNK_SIZE) {
    const chunk = uncachedCoords.slice(i, i + CHUNK_SIZE);
    const latStr = chunk.map((c) => c.lat.toFixed(4)).join(",");
    const lngStr = chunk.map((c) => c.lng.toFixed(4)).join(",");

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lngStr}&current=precipitation,rain&hourly=precipitation,rain&timezone=Asia%2FManila`;

      const res = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];

        items.forEach((item: any, idx: number) => {
          const target = chunk[idx];
          if (!target) return;

          const currentPrecip = Number(item?.current?.precipitation ?? item?.current?.rain ?? 0);
          let rain24h = 0;
          if (item?.hourly?.precipitation && Array.isArray(item.hourly.precipitation)) {
            const past24 = item.hourly.precipitation.slice(0, 24);
            rain24h = past24.reduce((sum: number, val: number) => sum + (Number(val) || 0), 0);
          } else {
            rain24h = currentPrecip * 3;
          }

          const record: DistrictRainfall = {
            latitude: target.lat,
            longitude: target.lng,
            currentRainMmHr: currentPrecip,
            rain24hMm: Math.round(rain24h * 10) / 10,
            isRaining: currentPrecip > 0.1,
            fetchedAt: new Date().toISOString(),
          };

          CACHE.set(target.key, { data: record, expiresAt: now + CACHE_TTL_MS });
          results.set(target.key, record);
        });
      }
    } catch (err) {
      console.warn("[MeteoRainfall] Batch fetch error:", err instanceof Error ? err.message : err);
    }
  }

  return results;
}
