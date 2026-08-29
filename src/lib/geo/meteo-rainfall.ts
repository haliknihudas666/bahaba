// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Open-Meteo District Rainfall & 3-Hour Forecast Service
//
// Fetches high-resolution, hyper-local city and district-level precipitation
// measurements (current rate mm/hr, 24h accumulation, and +1h/+2h/+3h forecast)
// from Open-Meteo API. Features in-memory grid-snapped caching (1.1km resolution, 10-min TTL).
// ---------------------------------------------------------------------------

export type RainfallTrend = "IMPROVING" | "WORSENING" | "STEADY" | "DRY";

export interface DistrictRainfall {
  latitude: number;
  longitude: number;
  /** Current precipitation intensity in mm/hr */
  currentRainMmHr: number;
  /** 24-hour accumulated precipitation in mm */
  rain24hMm: number;
  /** Forecasted rain in next 1 hour in mm */
  forecast1hMm: number;
  /** Forecasted rain in next 2 hours in mm */
  forecast2hMm: number;
  /** Forecasted rain in next 3 hours in mm */
  forecast3hMm: number;
  /** Total 3-hour accumulated rainfall forecast in mm */
  forecast3hTotalMm: number;
  /** Peak projected rain intensity in mm/hr over next 3 hours */
  forecastPeakMmHr: number;
  /** Maximum probability of precipitation (%) over next 3 hours */
  precipProbability: number;
  /** Rainfall intensity trend over the next 3 hours */
  trend: RainfallTrend;
  /** Human-friendly condition descriptor */
  conditionLabel: string;
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
export function toGridKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

/**
 * Computes rainfall trend over the next 3 hours compared to current rate.
 */
export function computeRainfallTrend(
  currentRain: number,
  f1: number,
  f2: number,
  f3: number
): RainfallTrend {
  const maxFuture = Math.max(f1, f2, f3);
  const totalFuture = f1 + f2 + f3;

  if (currentRain <= 0.1 && totalFuture <= 0.3) {
    return "DRY";
  }
  if (maxFuture > currentRain + 2.5 || (currentRain <= 1.0 && totalFuture >= 5.0)) {
    return "WORSENING";
  }
  if (currentRain >= 2.0 && maxFuture <= currentRain * 0.5 && totalFuture <= currentRain * 1.5) {
    return "IMPROVING";
  }
  return "STEADY";
}

/**
 * Generates a concise human-readable weather label.
 */
export function computeConditionLabel(
  currentRain: number,
  forecast3hTotal: number,
  peakMmHr: number,
  trend: RainfallTrend
): string {
  if (peakMmHr >= 30 || forecast3hTotal >= 50) {
    return "Torrential Rain Alert";
  }
  if (peakMmHr >= 15 || forecast3hTotal >= 25) {
    return "Heavy Downpour";
  }
  if (peakMmHr >= 7.5 || forecast3hTotal >= 12) {
    return trend === "WORSENING" ? "Moderate Rain (Intensifying)" : "Moderate Rain";
  }
  if (peakMmHr >= 2.0 || forecast3hTotal >= 3.0) {
    return trend === "IMPROVING" ? "Light Showers (Easing)" : "Light Showers";
  }
  if (currentRain > 0.1 || forecast3hTotal > 0.5) {
    return "Drizzle / Passing Showers";
  }
  return "Clear & Dry";
}

/**
 * Parses raw Open-Meteo item into typed DistrictRainfall.
 */
function parseMeteoItem(lat: number, lng: number, item: any): DistrictRainfall {
  const currentPrecip = Number(item?.current?.precipitation ?? item?.current?.rain ?? 0);

  // Hourly arrays
  const hourlyPrecip: number[] = Array.isArray(item?.hourly?.precipitation)
    ? item.hourly.precipitation.map((p: any) => Number(p) || 0)
    : [];
  const hourlyProb: number[] = Array.isArray(item?.hourly?.precipitation_probability)
    ? item.hourly.precipitation_probability.map((p: any) => Number(p) || 0)
    : [];

  // 24h accumulation
  let rain24h = 0;
  if (hourlyPrecip.length >= 24) {
    rain24h = hourlyPrecip.slice(0, 24).reduce((sum, v) => sum + v, 0);
  } else {
    rain24h = currentPrecip * 3;
  }

  // 3-hour hourly forecast (+1h, +2h, +3h)
  // Index 0 represents current hour, index 1-3 represent next 3 hours
  const f1 = hourlyPrecip[1] ?? currentPrecip;
  const f2 = hourlyPrecip[2] ?? f1;
  const f3 = hourlyPrecip[3] ?? f2;
  const forecast3hTotal = Math.round((f1 + f2 + f3) * 10) / 10;
  const peakMmHr = Math.round(Math.max(currentPrecip, f1, f2, f3) * 10) / 10;

  const next4Probs = hourlyProb.slice(0, 4);
  const maxProb = next4Probs.length > 0 ? Math.max(...next4Probs) : (currentPrecip > 0 ? 90 : 10);

  const trend = computeRainfallTrend(currentPrecip, f1, f2, f3);
  const conditionLabel = computeConditionLabel(currentPrecip, forecast3hTotal, peakMmHr, trend);

  return {
    latitude: lat,
    longitude: lng,
    currentRainMmHr: Math.round(currentPrecip * 10) / 10,
    rain24hMm: Math.round(rain24h * 10) / 10,
    forecast1hMm: Math.round(f1 * 10) / 10,
    forecast2hMm: Math.round(f2 * 10) / 10,
    forecast3hMm: Math.round(f3 * 10) / 10,
    forecast3hTotalMm: forecast3hTotal,
    forecastPeakMmHr: peakMmHr,
    precipProbability: maxProb,
    trend,
    conditionLabel,
    isRaining: currentPrecip > 0.1,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Creates default fallback DistrictRainfall (dry).
 */
function createFallbackRainfall(lat: number, lng: number): DistrictRainfall {
  return {
    latitude: lat,
    longitude: lng,
    currentRainMmHr: 0,
    rain24hMm: 0,
    forecast1hMm: 0,
    forecast2hMm: 0,
    forecast3hMm: 0,
    forecast3hTotalMm: 0,
    forecastPeakMmHr: 0,
    precipProbability: 0,
    trend: "DRY",
    conditionLabel: "Clear & Dry",
    isRaining: false,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Fetch hyper-local city/district rainfall and 3-hour forecast for a single coordinate.
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
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain,weather_code&hourly=precipitation,precipitation_probability,rain,weather_code&forecast_hours=6&timezone=Asia%2FManila`;

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
    const result = parseMeteoItem(lat, lng, json);

    CACHE.set(key, { data: result, expiresAt: now + CACHE_TTL_MS });
    return result;
  } catch (err) {
    console.warn(
      `[MeteoRainfall] Fetch failed for (${lat.toFixed(2)}, ${lng.toFixed(2)}):`,
      err instanceof Error ? err.message : err
    );
    return createFallbackRainfall(lat, lng);
  }
}

/**
 * Batch fetch city/district rainfall and 3-hour forecast for multiple coordinates in chunks of up to 40.
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

  // Process uncached coordinates in batches of 40
  const CHUNK_SIZE = 40;
  for (let i = 0; i < uncachedCoords.length; i += CHUNK_SIZE) {
    const chunk = uncachedCoords.slice(i, i + CHUNK_SIZE);
    const latStr = chunk.map((c) => c.lat.toFixed(4)).join(",");
    const lngStr = chunk.map((c) => c.lng.toFixed(4)).join(",");

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latStr}&longitude=${lngStr}&current=precipitation,rain,weather_code&hourly=precipitation,precipitation_probability,rain,weather_code&forecast_hours=6&timezone=Asia%2FManila`;

      const res = await fetch(url, {
        headers: { Accept: "application/json", "User-Agent": "Bahaba-Flood-Engine/1.0" },
        signal: AbortSignal.timeout(10_000),
      });

      if (res.ok) {
        const json = await res.json();
        const items = Array.isArray(json) ? json : [json];

        items.forEach((item: any, idx: number) => {
          const target = chunk[idx];
          if (!target) return;

          const record = parseMeteoItem(target.lat, target.lng, item);
          CACHE.set(target.key, { data: record, expiresAt: now + CACHE_TTL_MS });
          results.set(target.key, record);
        });
      } else {
        // Fallback for failed batch
        chunk.forEach((target) => {
          const fallback = createFallbackRainfall(target.lat, target.lng);
          results.set(target.key, fallback);
        });
      }
    } catch (err) {
      console.warn("[MeteoRainfall] Batch fetch error:", err instanceof Error ? err.message : err);
      chunk.forEach((target) => {
        const fallback = createFallbackRainfall(target.lat, target.lng);
        results.set(target.key, fallback);
      });
    }
  }

  return results;
}

