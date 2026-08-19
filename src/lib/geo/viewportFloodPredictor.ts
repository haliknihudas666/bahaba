// ---------------------------------------------------------------------------
// Bahaba – Viewport-Level Dynamic Flood Prediction Engine
// ---------------------------------------------------------------------------
//
// Takes raw Overpass road segments, fetches elevation + rainfall data from
// Open-Meteo APIs, runs flood depth prediction, and returns only roads with
// meaningful flooding (≥ 6cm / gutter deep).
// ---------------------------------------------------------------------------

import { calculateWaterDepth, classifyFloodRisk } from "@/lib/engine/floodPredictor";
import type { OverpassRoadSegment } from "./overpassRoadFetcher";

/** Predicted flood result for a dynamically-fetched road segment */
export interface DynamicFloodRoad {
  osmId: number;
  name: string;
  highway: string;
  coordinates: [number, number][]; // [lng, lat][]
  elevationM: number;
  rainMmHr: number;
  rain24hMm: number;
  depthCm: number;
  riskCategory: "LOW" | "HIGH" | "CRITICAL";
  color: string;
  label: string;
  lineWeight: number;
}

// ---------------------------------------------------------------------------
// Rainfall Cache (per viewport center, 2-min TTL)
// ---------------------------------------------------------------------------

interface RainfallCache {
  key: string;
  rainMmHr: number;
  rain24hMm: number;
  fetchedAt: number;
}

let rainfallCache: RainfallCache | null = null;
const RAIN_TTL_MS = 2 * 60 * 1000;

/**
 * Fetch current rainfall from Open-Meteo for a coordinate.
 * Cached per lat.toFixed(1),lng.toFixed(1) key with 2-min TTL.
 */
export async function fetchRainfall(
  lat: number,
  lng: number
): Promise<{ rainMmHr: number; rain24hMm: number }> {
  const key = `${lat.toFixed(1)},${lng.toFixed(1)}`;

  if (
    rainfallCache &&
    rainfallCache.key === key &&
    Date.now() - rainfallCache.fetchedAt < RAIN_TTL_MS
  ) {
    return { rainMmHr: rainfallCache.rainMmHr, rain24hMm: rainfallCache.rain24hMm };
  }

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain&hourly=precipitation`;
    const res = await fetch(url);
    if (!res.ok) return { rainMmHr: 0, rain24hMm: 0 };

    const data = await res.json();
    const currentRain = data.current?.precipitation ?? data.current?.rain ?? 0;

    let acc24h = 0;
    if (data.hourly?.precipitation && Array.isArray(data.hourly.precipitation)) {
      const last24 = data.hourly.precipitation.slice(0, 24);
      acc24h = last24.reduce((sum: number, val: number) => sum + (val || 0), 0);
    }

    rainfallCache = {
      key,
      rainMmHr: Math.max(0, currentRain),
      rain24hMm: acc24h,
      fetchedAt: Date.now(),
    };

    return { rainMmHr: rainfallCache.rainMmHr, rain24hMm: rainfallCache.rain24hMm };
  } catch (err) {
    console.warn("[ViewportFloodPredictor] Rainfall fetch error:", err);
    return { rainMmHr: 0, rain24hMm: 0 };
  }
}

// ---------------------------------------------------------------------------
// Elevation Cache (per tile-region, batch API)
// ---------------------------------------------------------------------------

const elevationCache = new Map<string, number>();

/**
 * Fetch elevation for road segment centroids from Open-Meteo Elevation API.
 * Batches up to 100 coordinates per API call.
 */
async function fetchElevationsForRoads(
  roads: OverpassRoadSegment[]
): Promise<Map<number, number>> {
  const result = new Map<number, number>();
  const toFetch: { osmId: number; lat: number; lng: number }[] = [];

  for (const road of roads) {
    const cacheKey = `${road.osmId}`;
    const cached = elevationCache.get(cacheKey);
    if (cached !== undefined) {
      result.set(road.osmId, cached);
    } else {
      // Compute centroid
      let sumLat = 0,
        sumLng = 0;
      for (const [lng, lat] of road.coordinates) {
        sumLat += lat;
        sumLng += lng;
      }
      const centLat = sumLat / road.coordinates.length;
      const centLng = sumLng / road.coordinates.length;
      toFetch.push({ osmId: road.osmId, lat: centLat, lng: centLng });
    }
  }

  if (toFetch.length === 0) return result;

  // Batch in groups of 100 (Open-Meteo limit)
  for (let i = 0; i < toFetch.length; i += 100) {
    const batch = toFetch.slice(i, i + 100);
    const lats = batch.map((p) => p.lat.toFixed(4)).join(",");
    const lngs = batch.map((p) => p.lng.toFixed(4)).join(",");

    try {
      const url = `https://api.open-meteo.com/v1/elevation?latitude=${lats}&longitude=${lngs}`;
      const res = await fetch(url);
      if (!res.ok) continue;

      const data = await res.json();
      if (data.elevation && Array.isArray(data.elevation)) {
        for (let j = 0; j < batch.length; j++) {
          const elev = data.elevation[j] ?? 5;
          const safeElev = Math.max(0, Number(elev) || 5);
          result.set(batch[j].osmId, safeElev);
          elevationCache.set(`${batch[j].osmId}`, safeElev);
        }
      }
    } catch (err) {
      console.warn("[ViewportFloodPredictor] Elevation batch error:", err);
      // Fallback: assign default elevation
      for (const p of batch) {
        result.set(p.osmId, 5);
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Heuristic NOAH Hazard Level from Elevation
// ---------------------------------------------------------------------------

/**
 * Estimate a NOAH-like hazard level from elevation alone.
 * Lower elevation = higher flood susceptibility.
 */
function estimateHazardLevel(elevationM: number): number {
  if (elevationM <= 3) return 3; // High hazard (coastal / very low)
  if (elevationM <= 8) return 2; // Medium hazard
  if (elevationM <= 15) return 1; // Low hazard
  return 0; // No hazard (upland)
}

// ---------------------------------------------------------------------------
// Public API: Predict Flooded Roads for Viewport
// ---------------------------------------------------------------------------

/**
 * Takes raw Overpass road segments + viewport center, fetches rainfall &
 * elevation, runs flood prediction, and returns ONLY roads with depth ≥ 6cm.
 */
export async function predictFloodedRoads(
  roads: OverpassRoadSegment[],
  viewportCenterLat: number,
  viewportCenterLng: number
): Promise<DynamicFloodRoad[]> {
  if (roads.length === 0) return [];

  // 1. Fetch rainfall for viewport center
  const { rainMmHr, rain24hMm } = await fetchRainfall(
    viewportCenterLat,
    viewportCenterLng
  );

  // If no rain, no flooding to show
  if (rainMmHr <= 0 && rain24hMm <= 0) return [];

  // 2. Fetch elevation for all road centroids
  const elevations = await fetchElevationsForRoads(roads);

  // 3. Run flood prediction for each road
  const floodedRoads: DynamicFloodRoad[] = [];

  for (const road of roads) {
    const elevationM = elevations.get(road.osmId) ?? 5;
    const hazardLevel = estimateHazardLevel(elevationM);
    const drainageCapacity = 25; // Default drainage capacity mm/hr

    const depthCm = calculateWaterDepth(
      rainMmHr,
      rain24hMm,
      hazardLevel,
      elevationM,
      drainageCapacity
    );

    // Only show roads with meaningful flooding (≥ 6cm = gutter deep or worse)
    if (depthCm < 6) continue;

    const classification = classifyFloodRisk(depthCm);

    // Map NOAH classification to our display categories
    // NORMAL is filtered out above, so only LOW/HIGH/CRITICAL remain
    const riskCategory =
      classification.category === "LOW"
        ? "LOW"
        : classification.category === "HIGH"
          ? "HIGH"
          : "CRITICAL";

    floodedRoads.push({
      osmId: road.osmId,
      name: road.name,
      highway: road.highway,
      coordinates: road.coordinates,
      elevationM,
      rainMmHr,
      rain24hMm,
      depthCm,
      riskCategory: riskCategory as "LOW" | "HIGH" | "CRITICAL",
      color: classification.color,
      label: classification.label,
      lineWeight: classification.lineWeight,
    });
  }

  return floodedRoads;
}
