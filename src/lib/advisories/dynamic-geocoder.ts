// ---------------------------------------------------------------------------
// Bahaba – Dynamic Advisory Geocoding Engine
// Dynamically resolves any road, intersection, landmark, and LGU across
// the Philippines (with Metro Manila priority) via OpenStreetMap (Nominatim & Photon)
// with query normalization, multi-tier fallback, and in-memory caching.
// ---------------------------------------------------------------------------

import https from "node:https";

export interface GeoCoordinate {
  lat: number;
  lng: number;
}

// Default centroids for Philippine LGUs, provinces & expressway hubs (spatial fallback)
const METRO_MANILA_CITY_CENTROIDS: Record<string, GeoCoordinate> = {
  // Metro Manila
  valenzuela: { lat: 14.7004, lng: 120.9830 },
  manila: { lat: 14.5995, lng: 120.9842 },
  quezon: { lat: 14.6500, lng: 121.0300 },
  qc: { lat: 14.6500, lng: 121.0300 },
  malabon: { lat: 14.6625, lng: 120.9566 },
  mandaluyong: { lat: 14.5794, lng: 121.0359 },
  paranaque: { lat: 14.5000, lng: 120.9967 },
  marikina: { lat: 14.6350, lng: 121.0950 },
  pasay: { lat: 14.5378, lng: 120.9990 },
  caloocan: { lat: 14.6571, lng: 120.9841 },
  makati: { lat: 14.5547, lng: 121.0244 },
  taguig: { lat: 14.5176, lng: 121.0509 },
  pasig: { lat: 14.5764, lng: 121.0851 },
  sanjuan: { lat: 14.6019, lng: 121.0355 },
  navotas: { lat: 14.6667, lng: 120.9417 },
  laspinas: { lat: 14.4445, lng: 120.9939 },
  muntinlupa: { lat: 14.4081, lng: 121.0415 },
  pateros: { lat: 14.5454, lng: 121.0687 },

  // Rizal & Greater Manila
  cainta: { lat: 14.5778, lng: 121.1219 },
  taytay: { lat: 14.5375, lng: 121.1322 },
  antipolo: { lat: 14.5842, lng: 121.1763 },
  sanmateo: { lat: 14.6975, lng: 121.1206 },
  rodriguez: { lat: 14.7303, lng: 121.1444 },
  montalban: { lat: 14.7303, lng: 121.1444 },

  // Bulacan & NLEX North Corridors
  meycauayan: { lat: 14.7358, lng: 120.9575 },
  marilao: { lat: 14.7578, lng: 120.9472 },
  bocaue: { lat: 14.8000, lng: 120.9333 },
  balagtas: { lat: 14.8194, lng: 120.9083 },
  guiguinto: { lat: 14.8306, lng: 120.8806 },
  malolos: { lat: 14.8433, lng: 120.8114 },
  calumpit: { lat: 14.9167, lng: 120.7667 },
  pulilan: { lat: 14.9014, lng: 120.8492 },
  baliuag: { lat: 14.9500, lng: 120.9000 },
  obando: { lat: 14.7083, lng: 120.9333 },
  bulacan: { lat: 14.8527, lng: 120.8160 },

  // Pampanga & Central Luzon Expressways
  sansimon: { lat: 14.9965, lng: 120.7831 },
  pampanga: { lat: 15.0345, lng: 120.6844 },
  sanfernando: { lat: 15.0345, lng: 120.6844 },
  apalit: { lat: 14.9542, lng: 120.7583 },
  candaba: { lat: 15.0933, lng: 120.8286 },
  angeles: { lat: 15.1450, lng: 120.5887 },
  mabalacat: { lat: 15.2236, lng: 120.5739 },
  guagua: { lat: 14.9667, lng: 120.6333 },
  lubao: { lat: 14.9333, lng: 120.6000 },
  bacolor: { lat: 14.9833, lng: 120.6500 },
  tarlac: { lat: 15.4802, lng: 120.5979 },
  bataan: { lat: 14.6833, lng: 120.4833 },
  dinalupihan: { lat: 14.8667, lng: 120.4667 },
  zambales: { lat: 15.3000, lng: 120.0000 },

  // Cavite, Laguna, Batangas & SLEX Corridors
  bacoor: { lat: 14.4624, lng: 120.9645 },
  imus: { lat: 14.4296, lng: 120.9367 },
  kawit: { lat: 14.4444, lng: 120.9028 },
  noveleta: { lat: 14.4278, lng: 120.8806 },
  cavite: { lat: 14.2833, lng: 120.8833 },
  laguna: { lat: 14.2833, lng: 121.3500 },
  sanpedro: { lat: 14.3644, lng: 121.0506 },
  binan: { lat: 14.3333, lng: 121.0833 },
  santarosa: { lat: 14.3167, lng: 121.1167 },
  cabuyao: { lat: 14.2778, lng: 121.1250 },
  calamba: { lat: 14.2167, lng: 121.1667 },
  batangas: { lat: 13.7565, lng: 121.0583 },
};

// In-memory cache for instant sub-millisecond resolution
const dynamicGeocodeMemoryCache = new Map<string, GeoCoordinate | null>();

/**
 * Clean & normalize address tokens
 */
export function sanitizeToken(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\(\)\[\]\{\}]/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Validate that a coordinate is strictly inside the Philippines bounding box
 */
export function isValidPhilippineCoordinate(lat: number, lng: number): boolean {
  return (
    !isNaN(lat) &&
    !isNaN(lng) &&
    lat >= 4.5 &&
    lat <= 21.5 &&
    lng >= 116.5 &&
    lng <= 127.0
  );
}

/**
 * Clean landmark or road string by removing connector/conversational words
 */
function cleanLocationPhrase(phrase: string): string {
  return sanitizeToken(phrase || "")
    .replace(/\b(NB|SB|EB|WB|Northbound|Southbound|Eastbound|Westbound|both|bounds?)\b/gi, " ")
    .replace(
      /\b(cor\.?|corner|fronting|near|malapit\s*sa|sa\s*may|tapat\s*ng|in\s*front\s*of|infront|before|after|along|sa\s*kahabaan\s*ng|kanto\s*ng|intersection\s*of|service\s*road|underloop|underpass|street|st\.?|avenue|ave\.?|blvd\.?|boulevard|highway|hwy)\b/gi,
      " "
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Generate multi-tiered search queries for Nominatim / OSM Photon geocoding
 */
export function buildGeocodeQueryCandidates(
  road?: string,
  landmark?: string,
  city?: string
): string[] {
  const cleanRoadRaw = sanitizeToken(road || "")
    .replace(/\b(NB|SB|EB|WB|Northbound|Southbound|Eastbound|Westbound|both|bounds?)\b/gi, " ")
    .trim();

  const cleanLandmarkRaw = sanitizeToken(landmark || "")
    .replace(/\b(NB|SB|EB|WB|Northbound|Southbound|Eastbound|Westbound|both|bounds?)\b/gi, " ")
    .trim();

  const cleanCity = sanitizeToken(city || "")
    .replace(/\b(city|lgu)\b/gi, "")
    .trim();

  const coreRoad = cleanLocationPhrase(cleanRoadRaw);
  const coreLandmark = cleanLocationPhrase(cleanLandmarkRaw);

  const citySuffix = cleanCity ? `${cleanCity}, Philippines` : "Metro Manila, Philippines";
  const queries: string[] = [];

  const addQuery = (q: string) => {
    const trimmed = q.replace(/\s+/g, " ").trim();
    if (trimmed && !queries.includes(trimmed)) {
      queries.push(trimmed);
    }
  };

  // 1. Precise Landmark in City (e.g. "Pegasus, Quezon City")
  if (cleanLandmarkRaw && cleanCity) {
    addQuery(`${cleanLandmarkRaw}, ${cleanCity}`);
    if (coreLandmark && coreLandmark !== cleanLandmarkRaw) {
      addQuery(`${coreLandmark}, ${cleanCity}`);
    }
  }

  // 2. Intersection / Combined: Landmark + Road + City
  if (cleanLandmarkRaw && cleanRoadRaw && cleanLandmarkRaw.toLowerCase() !== cleanRoadRaw.toLowerCase()) {
    if (cleanCity) {
      addQuery(`${cleanLandmarkRaw}, ${cleanRoadRaw}, ${cleanCity}`);
      addQuery(`${cleanRoadRaw} and ${cleanLandmarkRaw}, ${cleanCity}`);
    }
    addQuery(`${cleanLandmarkRaw}, ${cleanRoadRaw}, Metro Manila`);
  }

  // 3. Road in City
  if (cleanRoadRaw && cleanCity) {
    addQuery(`${cleanRoadRaw}, ${cleanCity}`);
  }

  // 4. Standalone Landmark
  if (cleanLandmarkRaw) {
    addQuery(`${cleanLandmarkRaw}, Metro Manila`);
    addQuery(`${cleanLandmarkRaw}, Philippines`);
  }

  // 5. Standalone Road
  if (cleanRoadRaw) {
    addQuery(`${cleanRoadRaw}, ${citySuffix}`);
  }

  return queries;
}

/**
 * Execute HTTP GET request to Nominatim with timeout and Philippine country constraint
 */
function fetchNominatim(query: string): Promise<any> {
  return new Promise((resolve) => {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
      query.includes("Philippines") ? query : `${query}, Philippines`
    )}&viewbox=120.85,14.85,121.18,14.35&bounded=0&countrycodes=ph&limit=2`;

    const req = https.get(
      url,
      {
        headers: {
          "User-Agent": "BahabaApp/1.0 (https://bahaba.ph; contact@bahaba.ph)",
          Accept: "application/json",
        },
        timeout: 5000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Secondary: Fetch from OpenStreetMap Photon API (Komoot OSM data)
 * Excellent for specific landmarks, clubs, establishments, universities, and cross streets.
 */
function fetchPhoton(query: string): Promise<any> {
  return new Promise((resolve) => {
    const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
      query
    )}&lat=14.5995&lon=120.9842&limit=3`;

    const req = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "BahabaApp/1.0 (https://bahaba.ph)",
        },
        timeout: 4000,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            resolve(JSON.parse(data));
          } catch {
            resolve(null);
          }
        });
      }
    );

    req.on("error", () => resolve(null));
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Paced request helper to avoid Nominatim rate limiting
 */
let lastNominatimRequestTime = 0;
async function pacedFetchNominatim(query: string): Promise<any> {
  const now = Date.now();
  const timeSinceLast = now - lastNominatimRequestTime;
  if (timeSinceLast < 1000) {
    await new Promise((r) => setTimeout(r, 1000 - timeSinceLast));
  }
  lastNominatimRequestTime = Date.now();
  return fetchNominatim(query);
}

export function getCityCentroid(city?: string): GeoCoordinate | null {
  if (!city) return null;
  const key = sanitizeToken(city).toLowerCase().replace(/\s*(city|lgu)\s*/g, "").replace(/\s+/g, "");
  return METRO_MANILA_CITY_CENTROIDS[key] || null;
}

/**
 * Dynamically geocode an advisory location by trying candidates sequentially
 * across Nominatim and Photon OpenStreetMap engines with strict Philippine bounds validation.
 */
export async function geocodeAdvisoryLocation(
  road?: string,
  landmark?: string,
  city?: string
): Promise<GeoCoordinate | null> {
  const cleanRoad = (road || "").trim();
  const cleanLandmark = (landmark || "").trim();
  const cleanCity = (city || "").trim();

  if (!cleanRoad && !cleanLandmark && !cleanCity) {
    return null;
  }

  const cacheKey = `${cleanCity.toLowerCase()}:${cleanRoad.toLowerCase()}:${cleanLandmark.toLowerCase()}`.trim();

  if (dynamicGeocodeMemoryCache.has(cacheKey)) {
    const cached = dynamicGeocodeMemoryCache.get(cacheKey);
    if (cached) return cached;
  }

  const queries = buildGeocodeQueryCandidates(cleanRoad, cleanLandmark, cleanCity);

  for (const q of queries) {
    // 1. Try Photon first for rich landmarks/cross streets (super fast & accurate for POIs)
    try {
      const pData = await fetchPhoton(q);
      if (pData && Array.isArray(pData.features) && pData.features.length > 0) {
        for (const feat of pData.features) {
          const coords = feat.geometry?.coordinates;
          const country = (feat.properties?.country || "").toLowerCase();
          if (Array.isArray(coords) && coords.length >= 2) {
            const lng = coords[0];
            const lat = coords[1];
            // Reject non-Philippine results
            if (country && country !== "philippines" && country !== "ph") {
              continue;
            }
            if (isValidPhilippineCoordinate(lat, lng)) {
              const result: GeoCoordinate = { lat, lng };
              dynamicGeocodeMemoryCache.set(cacheKey, result);
              return result;
            }
          }
        }
      }
    } catch {
      // Continue to Nominatim
    }

    // 2. Try Nominatim
    try {
      const data = await pacedFetchNominatim(q);
      if (Array.isArray(data) && data.length > 0 && data[0].lat && data[0].lon) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);

        if (isValidPhilippineCoordinate(lat, lng)) {
          const result: GeoCoordinate = { lat, lng };
          dynamicGeocodeMemoryCache.set(cacheKey, result);
          return result;
        }
      }
    } catch {
      // Continue to next candidate
    }
  }

  // Fallback to recognized city centroid if specific street/landmark wasn't resolved
  const cityFallback = getCityCentroid(cleanCity);
  if (cityFallback) {
    // Add small micro-jitter so multiple city points don't perfectly overlap
    const jitter = (Math.random() - 0.5) * 0.005;
    const fallbackCoord = { lat: cityFallback.lat + jitter, lng: cityFallback.lng + jitter };
    dynamicGeocodeMemoryCache.set(cacheKey, fallbackCoord);
    return fallbackCoord;
  }

  return null;
}

/**
 * Synchronously get cached coordinates if available
 */
export function getCachedCoordinates(
  road?: string,
  landmark?: string,
  city?: string
): GeoCoordinate | null {
  const cacheKey = `${(city || "").toLowerCase()}:${(road || "").toLowerCase()}:${(landmark || "").toLowerCase()}`.trim();
  const cached = dynamicGeocodeMemoryCache.get(cacheKey);
  if (cached) return cached;
  return getCityCentroid(city);
}

/**
 * Pre-populate or seed cache with known coordinates
 */
export function setCachedCoordinate(
  road: string,
  landmark: string | undefined,
  city: string | undefined,
  coord: GeoCoordinate
) {
  const cacheKey = `${(city || "").toLowerCase()}:${(road || "").toLowerCase()}:${(landmark || "").toLowerCase()}`.trim();
  dynamicGeocodeMemoryCache.set(cacheKey, coord);
}
