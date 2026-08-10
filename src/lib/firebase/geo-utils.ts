// ---------------------------------------------------------------------------
// Bahaba – Client-Safe Geo Utilities (`lib/firebase/geo-utils.ts`)
//
// Pure spatial mathematical helpers with fallback support if geofire-common is loading.
// ---------------------------------------------------------------------------

let geohashForLocationFn: ((location: [number, number]) => string) | null = null;
let distanceBetweenFn: ((location1: [number, number], location2: [number, number]) => number) | null = null;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const gf = require("geofire-common");
  geohashForLocationFn = gf.geohashForLocation;
  distanceBetweenFn = gf.distanceBetween;
} catch {
  // Fallback Haversine implementation if geofire-common package is pending npm install
  distanceBetweenFn = (c1: [number, number], c2: [number, number]): number => {
    const R = 6371; // Earth radius in km
    const dLat = ((c2[0] - c1[0]) * Math.PI) / 180;
    const dLng = ((c2[1] - c1[1]) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((c1[0] * Math.PI) / 180) *
        Math.cos((c2[0] * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  geohashForLocationFn = ([lat, lng]: [number, number]): string => {
    return `${lat.toFixed(2)},${lng.toFixed(2)}`;
  };
}

/**
 * Compute geohash for a (lat, lng) location string.
 */
export function computeGeohash(lat: number, lng: number): string {
  if (geohashForLocationFn) {
    return geohashForLocationFn([lat, lng]);
  }
  return `${lat.toFixed(2)},${lng.toFixed(2)}`;
}

/**
 * Calculate exact Haversine distance between two coordinates in kilometers.
 */
export function calculateHaversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  if (distanceBetweenFn) {
    return distanceBetweenFn([lat1, lng1], [lat2, lng2]);
  }
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
