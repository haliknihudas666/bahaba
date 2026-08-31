// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Spatial Query Engine (`lib/mongodb/geo.ts`)
//
// Calculates geohash bounding boxes / geospatial queries against MongoDB stations collection,
// returning the nearest station with live hydrological metrics.
// Includes in-memory station caching to minimize database stress.
// ---------------------------------------------------------------------------

import { getCollection } from "./client";
import { computeGeohash, calculateHaversineDistance } from "@/lib/firebase/geo-utils";
import type { LiveStation, NearestStationResult, StationDoc } from "@/types";

export { computeGeohash, calculateHaversineDistance };

/** In-memory cache of station records with TTL */
let cachedStationsList: any[] = [];
let cachedStationsAt = 0;
const STATIONS_CACHE_TTL_MS = 60_000; // 60 seconds

async function getCachedStations(): Promise<any[]> {
  const now = Date.now();
  if (cachedStationsList.length > 0 && now - cachedStationsAt < STATIONS_CACHE_TTL_MS) {
    return cachedStationsList;
  }

  try {
    const stationsCol = await getCollection("stations");
    const docs = await stationsCol.find({}).toArray();
    if (docs.length > 0) {
      cachedStationsList = docs;
      cachedStationsAt = Date.now();
    }
    return docs;
  } catch (err) {
    console.warn("[getCachedStations] Error fetching stations from MongoDB:", err);
    return cachedStationsList;
  }
}

/**
 * Find the nearest PAGASA hydrological station and return its live metrics from MongoDB.
 *
 * @param lat Latitude of target road/user location
 * @param lng Longitude of target road/user location
 * @param radiusInMeters Search radius around coordinate (default: 20,000 meters / 20 km)
 * @returns NearestStationResult containing the closest station & distance in km, or null if no stations match
 */
export async function getNearestStationData(
  lat: number,
  lng: number,
  radiusInMeters: number = 20_000,
): Promise<NearestStationResult | null> {
  try {
    const docs = await getCachedStations();
    if (!docs || docs.length === 0) {
      return null;
    }

    // Calculate exact Haversine distance and select closest station within radius
    let closestStation: LiveStation | null = null;
    let minDistanceKm = Infinity;
    const maxRadiusKm = radiusInMeters / 1000;

    for (const docData of docs) {
      const stationLat = docData.coordinates?.latitude ?? docData.location?.coordinates?.[1] ?? 0;
      const stationLng = docData.coordinates?.longitude ?? docData.location?.coordinates?.[0] ?? 0;

      if (!stationLat && !stationLng) continue;

      const distanceInKm = calculateHaversineDistance(lat, lng, stationLat, stationLng);

      if (distanceInKm <= maxRadiusKm && distanceInKm < minDistanceKm) {
        minDistanceKm = distanceInKm;

        let lastUpdatedDate: Date | null = null;
        if (docData.lastUpdated instanceof Date) {
          lastUpdatedDate = docData.lastUpdated;
        } else if (typeof docData.lastUpdated === "string" || typeof docData.lastUpdated === "number") {
          const d = new Date(docData.lastUpdated);
          if (!isNaN(d.getTime())) lastUpdatedDate = d;
        }

        closestStation = {
          stationId: docData.stationId || "",
          stationName: docData.stationName || "Unknown",
          latitude: stationLat,
          longitude: stationLng,
          geohash: docData.geohash || "",
          rain10m: docData.rain10m ?? 0,
          rain1h: docData.rain1h ?? 0,
          rain24h: docData.rain24h ?? 0,
          waterLevel: docData.waterLevel ?? 0,
          waterLevelDelta1h: docData.waterLevelDelta1h ?? 0,
          waterRiskLevel: docData.waterRiskLevel || docData.riskLevel || "UNKNOWN",
          rainRiskLevel: docData.rainRiskLevel || "UNKNOWN",
          riskLevel: docData.riskLevel || "UNKNOWN",
          lastUpdated: lastUpdatedDate,
        };
      }
    }

    if (!closestStation) return null;

    return {
      station: closestStation,
      distanceKm: Math.round(minDistanceKm * 100) / 100,
    };
  } catch (err) {
    console.warn("[getNearestStationData] Spatial calculation failed:", err);
    return null;
  }
}
