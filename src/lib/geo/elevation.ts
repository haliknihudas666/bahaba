// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Elevation Service
//
// Fetches high-resolution Digital Elevation Model (DEM) data (meters above sea level)
// for coordinates along route waypoints and monitored roads using Open-Meteo DEM API.
// Includes in-memory caching and a calibrated Metro Manila topological fallback model.
// ---------------------------------------------------------------------------

interface ElevationCacheEntry {
  elevation: number;
  timestamp: number;
}

const elevationCache = new Map<string, ElevationCacheEntry>();
const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours (elevation is static geography)

/**
 * Key format: rounded to 4 decimals (~11m spatial resolution)
 */
function cacheKey(lat: number, lng: number): string {
  return `${lat.toFixed(4)},${lng.toFixed(4)}`;
}

/**
 * Fallback elevation estimation for Metro Manila if external API is unreachable.
 * Calibrated based on Metro Manila topography:
 *   - Manila Bay coastline / UST / Sampaloc / Taft: 2.0m - 4.5m
 *   - San Juan / Mandaluyong / Pasig riverbanks: 4.0m - 12.0m
 *   - Ortigas / EDSA Shaw: 18.0m - 28.0m
 *   - Quezon City / Diliman / Katipunan / Antipolo foothills: 35.0m - 75.0m
 */
export function estimateFallbackElevation(lat: number, lng: number): number {
  // Approximate longitude-based slope from Manila Bay (West ~120.95, Low) to Sierra Madre (East ~121.15, High)
  const westBound = 120.95;
  const eastBound = 121.15;
  const clampedLng = Math.min(Math.max(lng, westBound), eastBound);
  const normalizedLng = (clampedLng - westBound) / (eastBound - westBound);

  // Approximate base gradient: 2.0m at coast to 45.0m at Marikina ridge
  let estimatedElevation = 2.0 + Math.pow(normalizedLng, 1.6) * 45.0;

  // Specific Metro Manila localized adjustments:
  // Espana / UST low bowl
  if (lat >= 14.60 && lat <= 14.62 && lng >= 120.98 && lng <= 121.00) {
    estimatedElevation = 2.4;
  }
  // Taft / Manila City Hall low-lying corridor
  else if (lat >= 14.56 && lat <= 14.59 && lng >= 120.97 && lng <= 120.99) {
    estimatedElevation = 2.8;
  }
  // G. Araneta / Talayan depression
  else if (lat >= 14.615 && lat <= 14.638 && lng >= 121.005 && lng <= 121.02) {
    estimatedElevation = 1.8;
  }
  // EDSA Shaw / Crossing elevated ridge
  else if (lat >= 14.58 && lat <= 14.59 && lng >= 121.045 && lng <= 121.06) {
    estimatedElevation = 22.0;
  }
  // Katipunan / Ateneo plateau
  else if (lat >= 14.63 && lat <= 14.66 && lng >= 121.065 && lng <= 121.08) {
    estimatedElevation = 38.0;
  }

  return Math.round(estimatedElevation * 10) / 10;
}

/**
 * Batch fetches elevations in meters for an array of [lat, lng] coordinates.
 * Queries Open-Meteo elevation API in chunks of up to 100 coordinates.
 */
export async function getElevationsForCoordinates(
  coords: [number, number][]
): Promise<number[]> {
  if (!coords || coords.length === 0) return [];

  const results: (number | null)[] = new Array(coords.length).fill(null);
  const uncachedIndices: number[] = [];
  const uncachedCoords: [number, number][] = [];

  const now = Date.now();

  // 1. Check cache first
  coords.forEach(([lat, lng], idx) => {
    const key = cacheKey(lat, lng);
    const cached = elevationCache.get(key);
    if (cached && now - cached.timestamp < CACHE_TTL_MS) {
      results[idx] = cached.elevation;
    } else {
      uncachedIndices.push(idx);
      uncachedCoords.push([lat, lng]);
    }
  });

  if (uncachedCoords.length === 0) {
    return results.map((val) => val ?? 4.0);
  }

  // 2. Fetch uncached coordinates in batches of 80 to prevent query string limits
  const BATCH_SIZE = 80;
  for (let b = 0; b < uncachedCoords.length; b += BATCH_SIZE) {
    const batchCoords = uncachedCoords.slice(b, b + BATCH_SIZE);
    const batchIndices = uncachedIndices.slice(b, b + BATCH_SIZE);

    const latStr = batchCoords.map((c) => c[0].toFixed(5)).join(",");
    const lngStr = batchCoords.map((c) => c[1].toFixed(5)).join(",");

    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${latStr}&longitude=${lngStr}`;
      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.elevation)) {
          data.elevation.forEach((elev: number | null, itemIdx: number) => {
            const originalIdx = batchIndices[itemIdx];
            const coord = batchCoords[itemIdx];
            const safeElev =
              typeof elev === "number" && Number.isFinite(elev)
                ? Math.round(elev * 10) / 10
                : estimateFallbackElevation(coord[0], coord[1]);

            results[originalIdx] = safeElev;
            elevationCache.set(cacheKey(coord[0], coord[1]), {
              elevation: safeElev,
              timestamp: now,
            });
          });
          continue;
        }
      }
    } catch (err) {
      console.warn("[ElevationService] Open-Meteo elevation API failed, falling back:", err instanceof Error ? err.message : err);
    }

    // Fallback for this batch if network fails
    batchCoords.forEach((coord, itemIdx) => {
      const originalIdx = batchIndices[itemIdx];
      const fallbackElev = estimateFallbackElevation(coord[0], coord[1]);
      results[originalIdx] = fallbackElev;
      elevationCache.set(cacheKey(coord[0], coord[1]), {
        elevation: fallbackElev,
        timestamp: now,
      });
    });
  }

  return results.map((val, idx) => val ?? estimateFallbackElevation(coords[idx][0], coords[idx][1]));
}
