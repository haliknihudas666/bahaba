// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Weather & Telemetry Ingestion Service
//
// Manages:
//   1. Ground-truth PAGASA Panahon AWS & River Basin station telemetry
//   2. Open-Meteo district precipitation and 3-hour forecast with MongoDB caching
//   3. Inverse Distance Weighting (IDW) spatial rainfall interpolation
// ---------------------------------------------------------------------------

import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import type { LiveStation } from "@/types";

export type RainfallTrend = "IMPROVING" | "WORSENING" | "STEADY" | "DRY";

export interface DistrictRainfall {
  latitude: number;
  longitude: number;
  currentRainMmHr: number;
  rain24hMm: number;
  forecast1hMm: number;
  forecast2hMm: number;
  forecast3hMm: number;
  forecast3hTotalMm: number;
  forecastPeakMmHr: number;
  precipProbability: number;
  trend: RainfallTrend;
  conditionLabel: string;
  isRaining: boolean;
  fetchedAt: string;
}

export interface WeatherCacheDoc extends DistrictRainfall {
  _id: string; // e.g. "grid_14.61_121.00"
  expiresAt: Date;
}

// In-memory caches for high-speed sub-millisecond response
let memoryStationsCache: LiveStation[] | null = null;
let memoryStationsCachedAt = 0;
let memoryStationsScrapedAt: string | null = null;
const STATIONS_RAM_TTL_MS = 30_000; // 30 seconds

const memoryMeteoCache = new Map<string, { data: DistrictRainfall; expiresAt: number }>();
const METEO_RAM_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * Dynamically access MongoDB collection on server-side only
 */
async function getWeatherMongoCollection(name: string) {
  if (typeof window !== "undefined") return null;
  try {
    const { getCollection } = await import("@/lib/mongodb/client");
    return await getCollection(name);
  } catch {
    return null;
  }
}

/**
 * Snap coordinates to 2 decimal places (~1.1 km grid resolution)
 */
export function toMeteoGridKey(lat: number, lng: number): string {
  return `${lat.toFixed(2)}_${lng.toFixed(2)}`;
}

/**
 * Compute Haversine distance in km
 */
export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Retrieve active PAGASA telemetry stations from MongoDB on server.
 */
export async function getLatestTelemetryStations(): Promise<LiveStation[]> {
  const now = Date.now();
  if (memoryStationsCache && now - memoryStationsCachedAt < STATIONS_RAM_TTL_MS) {
    return memoryStationsCache;
  }

  try {
    const syncMetaCol = await getWeatherMongoCollection("sync_meta");
    if (syncMetaCol) {
      const metaDoc = await syncMetaCol.findOne({ _id: "telemetry" as any });

      if (metaDoc && Array.isArray(metaDoc.stations) && metaDoc.stations.length > 0) {
        memoryStationsScrapedAt = metaDoc.updatedAtIso || metaDoc.lastSyncedAt || metaDoc.scrapedAt || new Date().toISOString();
        const mapped: LiveStation[] = metaDoc.stations.map((st: any) => {
          const fallbackCoords = getStationCoords(st.stationName);
          return {
            stationId: st.stationId || slugifyStationId(st.stationName),
            stationName: st.stationName,
            latitude: st.coordinates?.latitude ?? fallbackCoords.lat,
            longitude: st.coordinates?.longitude ?? fallbackCoords.lng,
            geohash: st.geohash || "",
            rain10m: st.rainfall?.rain10min ?? 0,
            rain1h: st.rainfall?.rain1hr ?? 0,
            rain24h: st.rainfall?.rain24hr ?? 0,
            waterLevel: st.waterLevel ?? 0,
            waterLevelDelta1h: st.waterLevelDelta1h ?? 0,
            waterRiskLevel: st.waterRiskLevel || st.riskLevel || "NORMAL",
            rainRiskLevel: st.rainRiskLevel || "NORMAL",
            riskLevel: st.riskLevel || "NORMAL",
            lastUpdated: st.lastUpdated ? new Date(st.lastUpdated) : new Date(),
          };
        });

        mapped.sort((a, b) => a.stationName.localeCompare(b.stationName));
        memoryStationsCache = mapped;
        memoryStationsCachedAt = now;
        return mapped;
      }
    }

    // Fallback directly to stations collection
    const stationsCol = await getWeatherMongoCollection("stations");
    if (stationsCol) {
      const docs = await stationsCol.find({}).toArray();
      if (docs.length > 0) {
        memoryStationsScrapedAt = new Date().toISOString();
        const mapped: LiveStation[] = docs.map((st: any) => {
          const fallbackCoords = getStationCoords(st.stationName);
          return {
            stationId: st.stationId || slugifyStationId(st.stationName),
            stationName: st.stationName,
            latitude: st.coordinates?.latitude ?? fallbackCoords.lat,
            longitude: st.coordinates?.longitude ?? fallbackCoords.lng,
            geohash: st.geohash || "",
            rain10m: st.rain10m ?? 0,
            rain1h: st.rain1h ?? 0,
            rain24h: st.rain24h ?? 0,
            waterLevel: st.waterLevel ?? 0,
            waterLevelDelta1h: st.waterLevelDelta1h ?? 0,
            waterRiskLevel: st.waterRiskLevel || st.riskLevel || "NORMAL",
            rainRiskLevel: st.rainRiskLevel || "NORMAL",
            riskLevel: st.riskLevel || "NORMAL",
            lastUpdated: st.lastUpdated ? new Date(st.lastUpdated) : new Date(),
          };
        });

        mapped.sort((a, b) => a.stationName.localeCompare(b.stationName));
        memoryStationsCache = mapped;
        memoryStationsCachedAt = now;
        return mapped;
      }
    }
  } catch (err) {
    console.warn("[WeatherService] MongoDB telemetry read failed:", err);
  }

  return memoryStationsCache || [];
}

/**
 * Retrieve latest telemetry stations along with the authoritative scrape timestamp.
 * Ensures the scrape timestamp is never in the future.
 */
export async function getLatestTelemetrySnapshot(): Promise<{ stations: LiveStation[]; scrapedAt: string }> {
  const stations = await getLatestTelemetryStations();
  const rawScrapedAt = memoryStationsScrapedAt || new Date().toISOString();
  const scrapedAtDate = new Date(rawScrapedAt);
  const scrapedAt = !isNaN(scrapedAtDate.getTime()) && scrapedAtDate.getTime() <= Date.now()
    ? rawScrapedAt
    : new Date().toISOString();

  return { stations, scrapedAt };
}

/**
 * Compute rainfall trend over 3-hour projection
 */
export function computeRainfallTrend(
  currentRain: number,
  f1: number,
  f2: number,
  f3: number
): RainfallTrend {
  const maxFuture = Math.max(f1, f2, f3);
  const totalFuture = f1 + f2 + f3;

  if (currentRain <= 0.1 && totalFuture <= 0.3) return "DRY";
  if (maxFuture > currentRain + 2.5 || (currentRain <= 1.0 && totalFuture >= 5.0)) return "WORSENING";
  if (currentRain >= 2.0 && maxFuture <= currentRain * 0.5 && totalFuture <= currentRain * 1.5) return "IMPROVING";
  return "STEADY";
}

/**
 * Human readable weather condition label
 */
export function computeConditionLabel(
  currentRain: number,
  forecast3hTotal: number,
  peakMmHr: number,
  trend: RainfallTrend
): string {
  if (peakMmHr >= 30 || forecast3hTotal >= 50) return "Torrential Rain Alert";
  if (peakMmHr >= 15 || forecast3hTotal >= 25) return "Heavy Downpour";
  if (peakMmHr >= 7.5 || forecast3hTotal >= 12) {
    return trend === "WORSENING" ? "Moderate Rain (Intensifying)" : "Moderate Rain";
  }
  if (peakMmHr >= 2.0 || forecast3hTotal >= 3.0) {
    return trend === "IMPROVING" ? "Light Showers (Easing)" : "Light Showers";
  }
  if (currentRain > 0.1 || forecast3hTotal > 0.5) return "Drizzle / Passing Showers";
  return "Clear & Dry";
}

function parseMeteoItem(lat: number, lng: number, item: any): DistrictRainfall {
  const currentPrecip = Number(item?.current?.precipitation ?? item?.current?.rain ?? 0);
  const hourlyPrecip: number[] = Array.isArray(item?.hourly?.precipitation)
    ? item.hourly.precipitation.map((p: any) => Number(p) || 0)
    : [];
  const hourlyProb: number[] = Array.isArray(item?.hourly?.precipitation_probability)
    ? item.hourly.precipitation_probability.map((p: any) => Number(p) || 0)
    : [];

  let rain24h = 0;
  if (hourlyPrecip.length >= 24) {
    rain24h = hourlyPrecip.slice(0, 24).reduce((sum, v) => sum + v, 0);
  } else {
    rain24h = currentPrecip * 3;
  }

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
 * Fetch Open-Meteo precipitation with RAM and MongoDB cache.
 */
export async function getDistrictRainfall(lat: number, lng: number): Promise<DistrictRainfall> {
  const key = toMeteoGridKey(lat, lng);
  const now = Date.now();

  const memCached = memoryMeteoCache.get(key);
  if (memCached && memCached.expiresAt > now) {
    return memCached.data;
  }

  // Check MongoDB weather_cache on server
  try {
    const col = await getWeatherMongoCollection("weather_cache");
    if (col) {
      const doc = await col.findOne({ _id: key as any, expiresAt: { $gt: new Date() } } as any);
      if (doc) {
        memoryMeteoCache.set(key, { data: doc as any, expiresAt: (doc as any).expiresAt.getTime() });
        return doc as any;
      }
    }
  } catch {}

  // Fetch from Open-Meteo API
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain,weather_code&hourly=precipitation,precipitation_probability,rain,weather_code&forecast_hours=6&timezone=Asia%2FManila`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (res.ok) {
      const json = await res.json();
      const record = parseMeteoItem(lat, lng, json);
      const expiresAtDate = new Date(now + METEO_RAM_TTL_MS);

      memoryMeteoCache.set(key, { data: record, expiresAt: now + METEO_RAM_TTL_MS });

      // Save to MongoDB asynchronously on server
      getWeatherMongoCollection("weather_cache").then((col) => {
        if (col) {
          col.updateOne(
            { _id: key as any },
            { $set: { ...record, _id: key, expiresAt: expiresAtDate } },
            { upsert: true }
          ).catch(() => {});
        }
      }).catch(() => {});

      return record;
    }
  } catch (err) {
    console.warn("[WeatherService] Open-Meteo fetch failed:", err instanceof Error ? err.message : err);
  }

  return createFallbackRainfall(lat, lng);
}

/**
 * Inverse Distance Weighting (IDW) interpolation of telemetry rainfall
 */
export function interpolateRainfall(
  lat: number,
  lng: number,
  stations: LiveStation[],
  fallbackRainRate: number = 0,
  fallbackRain24h: number = 0
): { rain1h: number; rain24h: number; riverAlertWeight: number } {
  if (!stations || stations.length === 0) {
    return { rain1h: fallbackRainRate, rain24h: fallbackRain24h, riverAlertWeight: 0 };
  }

  let totalWeight = 0;
  let weightedRain1h = 0;
  let weightedRain24h = 0;
  let weightedAlert = 0;

  for (const st of stations) {
    if (!st.latitude || !st.longitude || isNaN(st.latitude) || isNaN(st.longitude)) continue;

    const dLat = Math.abs(st.latitude - lat);
    const dLng = Math.abs(st.longitude - lng);
    if (dLat > 0.8 || dLng > 0.8) continue; // bounding box cutoff

    const distKm = Math.max(0.2, haversineKm(lat, lng, st.latitude, st.longitude));
    const weight = 1 / (distKm * distKm);

    const alertScore =
      st.riskLevel === "CRITICAL"
        ? 1.0
        : st.riskLevel === "ALARM"
        ? 0.7
        : st.riskLevel === "ALERT"
        ? 0.4
        : 0.0;

    totalWeight += weight;
    weightedRain1h += (st.rain1h ?? fallbackRainRate) * weight;
    weightedRain24h += (st.rain24h ?? fallbackRain24h) * weight;
    weightedAlert += alertScore * weight;
  }

  if (totalWeight === 0) {
    return { rain1h: fallbackRainRate, rain24h: fallbackRain24h, riverAlertWeight: 0 };
  }

  return {
    rain1h: Math.round((weightedRain1h / totalWeight) * 10) / 10,
    rain24h: Math.round((weightedRain24h / totalWeight) * 10) / 10,
    riverAlertWeight: Math.min(1.0, Math.max(0, weightedAlert / totalWeight)),
  };
}
