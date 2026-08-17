"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Real-Time Flood Status React Hook
//
// React hook subscribing to the `stations` Firestore collection via `onSnapshot`.
// Provides real-time stream of station updates, loading state, and error handling.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import { collection, onSnapshot, query, orderBy, Timestamp } from "firebase/firestore";
import { clientDb } from "@/lib/firebase/client";
import type { LiveStation } from "@/types";

export interface UseLiveFloodStatusReturn {
  /** Live list of active station telemetry snapshots */
  stations: LiveStation[];
  /** Loading state flag (true during initial connection / snapshot fetch) */
  loading: boolean;
  /** Error object if subscription fails, null otherwise */
  error: Error | null;
}

/**
 * Custom React hook for streaming real-time PAGASA station telemetry from Firestore.
 *
 * @returns `{ stations, loading, error }`
 */
export function useLiveFloodStatus(): UseLiveFloodStatusReturn {
  const [stations, setStations] = useState<LiveStation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!clientDb) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const stationsRef = collection(clientDb, "stations");
      const q = query(stationsRef, orderBy("stationName", "asc"));

      const unsubscribe = onSnapshot(
        q,
        (snapshot: any) => {
          const liveList: LiveStation[] = [];

          snapshot.forEach((docSnap: any) => {
            const data = docSnap.data();

            // Extract coordinates from GeoPoint or object
            let latitude = 0;
            let longitude = 0;
            if (data.coordinates) {
              latitude = typeof data.coordinates.latitude === "number"
                ? data.coordinates.latitude
                : data.coordinates._lat ?? 0;

              longitude = typeof data.coordinates.longitude === "number"
                ? data.coordinates.longitude
                : data.coordinates._long ?? 0;
            }

            // Parse Firestore Timestamp into Date
            let lastUpdatedDate: Date | null = null;
            if (data.lastUpdated instanceof Timestamp) {
              lastUpdatedDate = data.lastUpdated.toDate();
            } else if (data.lastUpdated && typeof data.lastUpdated.toDate === "function") {
              lastUpdatedDate = data.lastUpdated.toDate();
            } else if (data.lastUpdated?.seconds) {
              lastUpdatedDate = new Date(data.lastUpdated.seconds * 1000);
            }

            liveList.push({
              stationId: data.stationId || docSnap.id,
              stationName: data.stationName || "Unknown Station",
              latitude,
              longitude,
              geohash: data.geohash || "",
              rain10m: Number(data.rain10m ?? 0),
              rain1h: Number(data.rain1h ?? 0),
              rain24h: Number(data.rain24h ?? 0),
              waterLevel: Number(data.waterLevel ?? 0),
              waterLevelDelta1h: Number(data.waterLevelDelta1h ?? 0),
              waterRiskLevel: data.waterRiskLevel || data.riskLevel || "UNKNOWN",
              rainRiskLevel: data.rainRiskLevel || "UNKNOWN",
              riskLevel: data.riskLevel || "UNKNOWN",
              lastUpdated: lastUpdatedDate,
            });
          });

          setStations(liveList);
          setLoading(false);
        },
        (err: Error) => {
          console.error("[useLiveFloodStatus] Firestore subscription error:", err);
          setError(err);
          setLoading(false);
        },
      );

      return () => {
        unsubscribe();
      };
    } catch (err: unknown) {
      console.warn("[useLiveFloodStatus] Firestore Client SDK not available.");
      setLoading(false);
    }
  }, []);

  return { stations, loading, error };
}
