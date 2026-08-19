// ---------------------------------------------------------------------------
// Bahaba – Tile-Based Overpass API Road Network Fetcher with LRU Cache
// ---------------------------------------------------------------------------
//
// Fetches real OpenStreetMap road geometry for viewport tiles using the
// Overpass API. Implements tile-based spatial partitioning, LRU caching,
// rate limiting, and graceful error handling.
// ---------------------------------------------------------------------------

/** Road segment returned from Overpass API parsing */
export interface OverpassRoadSegment {
  /** OSM way ID */
  osmId: number;
  /** Road name from OSM `name` tag */
  name: string;
  /** Highway classification from OSM `highway` tag */
  highway: string;
  /** Coordinate array [[lng, lat], ...] in GeoJSON order */
  coordinates: [number, number][];
}

/** Tile key format: "z_x_y" */
type TileKey = string;

interface CachedTile {
  roads: OverpassRoadSegment[];
  fetchedAt: number;
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const TILE_SIZE_DEG = 0.02; // ~2.2km at equator — granular enough for caching
const CACHE_MAX_TILES = 200;
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
const MAX_CONCURRENT = 2;
const MIN_GAP_MS = 300;
// Overpass API endpoints — rotate through alternatives to avoid rate limits
const OVERPASS_ENDPOINTS = [
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
  // "https://overpass.private.coffee/api/interpreter",
  // "https://overpass-api.de/api/interpreter",
];
let currentEndpointIdx = 0;

/** Get the next Overpass API endpoint (round-robin rotation) */
function getOverpassEndpoint(): string {
  const endpoint = OVERPASS_ENDPOINTS[currentEndpointIdx];
  return endpoint;
}

/** Rotate to the next endpoint after a failure */
function rotateEndpoint(): void {
  currentEndpointIdx = (currentEndpointIdx + 1) % OVERPASS_ENDPOINTS.length;
  console.log(`[Overpass] Rotating to endpoint: ${OVERPASS_ENDPOINTS[currentEndpointIdx]}`);
}

// Highway types to fetch (major roads only, skip footpaths/service roads)
const HIGHWAY_FILTER = "motorway|trunk|primary|secondary|tertiary|residential|unclassified";

// ---------------------------------------------------------------------------
// LRU Tile Cache
// ---------------------------------------------------------------------------

const tileCache = new Map<TileKey, CachedTile>();

function evictOldest() {
  if (tileCache.size <= CACHE_MAX_TILES) return;
  // Evict oldest entries by insertion order (Map preserves insertion order)
  const keysToRemove = Array.from(tileCache.keys()).slice(
    0,
    tileCache.size - CACHE_MAX_TILES
  );
  for (const key of keysToRemove) {
    tileCache.delete(key);
  }
}

function getCachedTile(key: TileKey): OverpassRoadSegment[] | null {
  const entry = tileCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.fetchedAt > CACHE_TTL_MS) {
    tileCache.delete(key);
    return null;
  }
  // Move to end (most recently accessed) — LRU behavior
  tileCache.delete(key);
  tileCache.set(key, entry);
  return entry.roads;
}

function setCachedTile(key: TileKey, roads: OverpassRoadSegment[]) {
  tileCache.set(key, { roads, fetchedAt: Date.now() });
  evictOldest();
}

// ---------------------------------------------------------------------------
// Tile Grid Computation
// ---------------------------------------------------------------------------

export interface BBox {
  south: number;
  west: number;
  north: number;
  east: number;
}

/** Compute tile keys that cover the given bounding box */
export function getTileKeysForBBox(bbox: BBox): TileKey[] {
  const keys: TileKey[] = [];
  const startLat = Math.floor(bbox.south / TILE_SIZE_DEG) * TILE_SIZE_DEG;
  const startLng = Math.floor(bbox.west / TILE_SIZE_DEG) * TILE_SIZE_DEG;
  const endLat = bbox.north;
  const endLng = bbox.east;

  for (let lat = startLat; lat < endLat; lat += TILE_SIZE_DEG) {
    for (let lng = startLng; lng < endLng; lng += TILE_SIZE_DEG) {
      const tileX = Math.floor(lng / TILE_SIZE_DEG);
      const tileY = Math.floor(lat / TILE_SIZE_DEG);
      keys.push(`t_${tileX}_${tileY}`);
    }
  }

  return keys;
}

/** Get the bounding box for a tile key */
function tileBBox(key: TileKey): BBox {
  const parts = key.split("_");
  const x = parseInt(parts[1], 10);
  const y = parseInt(parts[2], 10);
  return {
    south: y * TILE_SIZE_DEG,
    west: x * TILE_SIZE_DEG,
    north: (y + 1) * TILE_SIZE_DEG,
    east: (x + 1) * TILE_SIZE_DEG,
  };
}

// ---------------------------------------------------------------------------
// Overpass API Query & Parsing
// ---------------------------------------------------------------------------

let lastFetchTime = 0;
let activeFetches = 0;

/** Build Overpass QL query for a tile bounding box */
function buildOverpassQuery(bbox: BBox): string {
  const bboxStr = `${bbox.south.toFixed(5)},${bbox.west.toFixed(5)},${bbox.north.toFixed(5)},${bbox.east.toFixed(5)}`;
  return `[out:json][timeout:15];way["highway"~"^(${HIGHWAY_FILTER})$"](${bboxStr});out geom;`;
}

/** Parse Overpass JSON response into OverpassRoadSegment[] */
function parseOverpassResponse(data: any): OverpassRoadSegment[] {
  if (!data?.elements || !Array.isArray(data.elements)) return [];

  const roads: OverpassRoadSegment[] = [];

  for (const el of data.elements) {
    if (el.type !== "way" || !el.geometry || el.geometry.length < 2) continue;

    const coords: [number, number][] = el.geometry
      .filter(
        (pt: any) =>
          typeof pt.lon === "number" &&
          typeof pt.lat === "number" &&
          !isNaN(pt.lon) &&
          !isNaN(pt.lat)
      )
      .map((pt: any) => [
        Number(pt.lon.toFixed(6)),
        Number(pt.lat.toFixed(6)),
      ]);

    if (coords.length < 2) continue;

    roads.push({
      osmId: el.id,
      name: el.tags?.name || el.tags?.ref || `Road ${el.id}`,
      highway: el.tags?.highway || "road",
      coordinates: coords,
    });
  }

  return roads;
}

/** Fetch a single tile from Overpass API with rate limiting */
async function fetchTile(key: TileKey): Promise<OverpassRoadSegment[]> {
  // Check cache first
  const cached = getCachedTile(key);
  if (cached !== null) return cached;

  // Rate limiting: wait for gap and concurrency slot
  while (activeFetches >= MAX_CONCURRENT) {
    await new Promise((r) => setTimeout(r, 50));
  }

  const now = Date.now();
  const elapsed = now - lastFetchTime;
  if (elapsed < MIN_GAP_MS) {
    await new Promise((r) => setTimeout(r, MIN_GAP_MS - elapsed));
  }

  activeFetches++;
  lastFetchTime = Date.now();

  // Try up to N endpoints before giving up
  const maxAttempts = OVERPASS_ENDPOINTS.length;

  try {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const endpoint = getOverpassEndpoint();
      const bbox = tileBBox(key);
      const query = buildOverpassQuery(bbox);

      try {
        const res = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `data=${encodeURIComponent(query)}`,
        });

        if (res.status === 429 || res.status === 504 || res.status === 503) {
          console.warn(`[Overpass] ${res.status} from ${new URL(endpoint).hostname} — rotating`);
          rotateEndpoint();
          continue; // Try next endpoint
        }

        if (!res.ok) {
          console.warn(`[Overpass] HTTP ${res.status} from ${new URL(endpoint).hostname}`);
          rotateEndpoint();
          continue;
        }

        const data = await res.json();
        const roads = parseOverpassResponse(data);
        setCachedTile(key, roads);
        return roads;
      } catch {
        console.warn(`[Overpass] Network error from ${new URL(endpoint).hostname} — rotating`);
        rotateEndpoint();
        continue;
      }
    }

    // All endpoints failed — cache empty to avoid hammering
    console.warn(`[Overpass] All endpoints failed for tile ${key}`);
    setCachedTile(key, []);
    return [];
  } finally {
    activeFetches--;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all road segments visible in the given viewport bounding box.
 * Uses tile-based caching to minimize Overpass API calls.
 *
 * @returns Array of OverpassRoadSegment with OSM road geometry
 */
export async function fetchRoadsInViewport(
  bbox: BBox
): Promise<OverpassRoadSegment[]> {
  const tileKeys = getTileKeysForBBox(bbox);

  // Separate cached vs uncached tiles
  const uncachedKeys: TileKey[] = [];
  const cachedRoads: OverpassRoadSegment[] = [];

  for (const key of tileKeys) {
    const cached = getCachedTile(key);
    if (cached !== null) {
      cachedRoads.push(...cached);
    } else {
      uncachedKeys.push(key);
    }
  }

  // Fetch uncached tiles in parallel (respecting MAX_CONCURRENT)
  if (uncachedKeys.length > 0) {
    const fetchPromises = uncachedKeys.map((key) => fetchTile(key));
    const results = await Promise.allSettled(fetchPromises);

    for (const result of results) {
      if (result.status === "fulfilled") {
        cachedRoads.push(...result.value);
      }
    }
  }

  // Deduplicate by OSM way ID
  const seen = new Set<number>();
  const unique: OverpassRoadSegment[] = [];
  for (const road of cachedRoads) {
    if (!seen.has(road.osmId)) {
      seen.add(road.osmId);
      unique.push(road);
    }
  }

  return unique;
}

/** Clear the entire tile cache */
export function clearOverpassCache() {
  tileCache.clear();
}
