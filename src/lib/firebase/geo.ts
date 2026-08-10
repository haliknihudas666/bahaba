// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Spatial Query Engine (`lib/firebase/geo.ts`)
//
// Calculates geohash bounding boxes and queries candidate station snapshots from
// Firestore via Admin SDK, returning the nearest station with live hydrological metrics.
// ---------------------------------------------------------------------------

import { geohashQueryBounds, distanceBetween } from "geofire-common";
import { adminDb } from "./admin";
import { computeGeohash, calculateHaversineDistance } from "./geo-utils";
import type { LiveStation, NearestStationResult, StationDoc } from "@/types";

export { computeGeohash, calculateHaversineDistance };

/**
 * Find the nearest PAGASA hydrological station and return its live metrics.
 * Server-side function using Firebase Admin SDK.
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
  const center: [number, number] = [lat, lng];

  // 1. Calculate geohash query bounds covering the radius
  const bounds = geohashQueryBounds(center, radiusInMeters);
  const promises = [];

  for (const b of bounds) {
    const q = adminDb
      .collection("stations")
      .orderBy("geohash")
      .startAt(b[0])
      .endAt(b[1]);

    promises.push(q.get());
  }

  // 2. Execute query bounds in parallel
  const snapshots = await Promise.all(promises);
  const candidateDocs: StationDoc[] = [];

  for (const snap of snapshots) {
    for (const doc of snap.docs) {
      candidateDocs.push(doc.data() as StationDoc);
    }
  }

  // 3. Fallback if geohash query returned empty (e.g. initial setup or out-of-bounds)
  if (candidateDocs.length === 0) {
    const allSnap = await adminDb.collection("stations").get();
    for (const doc of allSnap.docs) {
      candidateDocs.push(doc.data() as StationDoc);
    }
  }

  if (candidateDocs.length === 0) {
    return null;
  }

  // 4. Calculate exact Haversine distance and filter false positives
  let closestStation: LiveStation | null = null;
  let minDistanceKm = Infinity;

  for (const docData of candidateDocs) {
    const stationLat = docData.coordinates?.latitude ?? 0;
    const stationLng = docData.coordinates?.longitude ?? 0;

    const distanceInKm = distanceBetween(center, [stationLat, stationLng]);

    if (distanceInKm < minDistanceKm) {
      minDistanceKm = distanceInKm;

      // Format Firestore Timestamp to JS Date
      let lastUpdatedDate: Date | null = null;
      if (docData.lastUpdated && typeof (docData.lastUpdated as any).toDate === "function") {
        lastUpdatedDate = (docData.lastUpdated as any).toDate();
      } else if (docData.lastUpdated instanceof Date) {
        lastUpdatedDate = docData.lastUpdated;
      }

      closestStation = {
        stationId: docData.stationId,
        stationName: docData.stationName,
        latitude: stationLat,
        longitude: stationLng,
        geohash: docData.geohash,
        rain10m: docData.rain10m,
        rain1h: docData.rain1h,
        rain24h: docData.rain24h,
        waterLevel: docData.waterLevel,
        waterLevelDelta1h: docData.waterLevelDelta1h,
        waterRiskLevel: docData.waterRiskLevel || docData.riskLevel || "UNKNOWN",
        rainRiskLevel: docData.rainRiskLevel || "UNKNOWN",
        riskLevel: docData.riskLevel,
        lastUpdated: lastUpdatedDate,
      };
    }
  }

  if (!closestStation) return null;

  return {
    station: closestStation,
    distanceKm: Math.round(minDistanceKm * 100) / 100,
  };
}
