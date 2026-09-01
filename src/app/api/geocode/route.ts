// ---------------------------------------------------------------------------
// Bahaba – OpenStreetMap Geocoding API Route
// Exclusively queries OpenStreetMap APIs (Nominatim with OSM Photon fallback)
// with server-side caching and compliance with OSM usage policies.
// No local landmark database is used.
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import type { MetroLocationItem } from "@/types";

// In-memory cache for geocoding queries with 1-hour TTL
interface CacheEntry {
  data: MetroLocationItem[];
  timestamp: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const memoryCache = new Map<string, CacheEntry>();

// Rate-limiting tracker for Nominatim (1 req / sec policy)
let lastNominatimRequestTime = 0;

/**
 * Primary: Fetch from official OpenStreetMap Nominatim API
 */
async function fetchOpenStreetMapNominatim(query: string): Promise<MetroLocationItem[]> {
  const now = Date.now();
  const elapsed = now - lastNominatimRequestTime;
  if (elapsed < 1000) {
    await new Promise((resolve) => setTimeout(resolve, 1000 - elapsed));
  }
  lastNominatimRequestTime = Date.now();

  const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
    query
  )}&countrycodes=ph&limit=5&addressdetails=1`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 4000);

  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "BahabaFloodApp/1.0 (https://bahaba.ph; contact@bahaba.ph)",
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    if (!Array.isArray(data)) return [];

    return data
      .map((item: any, idx: number) => {
        const namePart = item.display_name.split(",")[0] || item.display_name;
        const subtextParts = item.display_name.split(",").slice(1, 3).join(",").trim();
        const lat = parseFloat(item.lat);
        const lon = parseFloat(item.lon);

        return {
          id: `osm-nominatim-${item.place_id || idx}`,
          name: namePart,
          subtext: subtextParts || "Philippines",
          category: "landmark" as const,
          coords: [lat, lon] as [number, number],
        };
      })
      .filter((item: MetroLocationItem) => {
        const [lat, lng] = item.coords;
        return (
          !isNaN(lat) &&
          !isNaN(lng) &&
          lat >= 4.5 &&
          lat <= 21.5 &&
          lng >= 116.5 &&
          lng <= 127.0
        );
      });
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

/**
 * Fallback: Fetch from OpenStreetMap Photon API (OSM data) if Nominatim rate-limits (429)
 */
async function fetchOpenStreetMapPhoton(query: string): Promise<MetroLocationItem[]> {
  const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(
    query
  )}&lat=14.5995&lon=120.9842&limit=5`;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 3500);

  try {
    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) return [];

    const data = await res.json();
    if (!data.features || !Array.isArray(data.features)) return [];

    return data.features
      .map((feat: any, idx: number) => {
        const p = feat.properties || {};
        const name = p.name || p.street || query;
        const subtext = [p.street, p.city || p.district || p.state, p.country]
          .filter(Boolean)
          .join(", ");
        const coords = feat.geometry?.coordinates || [120.9842, 14.5995];
        const lat = coords[1];
        const lng = coords[0];

        return {
          id: `osm-photon-${idx}-${p.osm_id || idx}`,
          name,
          subtext: subtext || "Philippines",
          category: "landmark" as const,
          coords: [lat, lng] as [number, number],
        };
      })
      .filter((item: MetroLocationItem) => {
        const [lat, lng] = item.coords;
        return (
          !isNaN(lat) &&
          !isNaN(lng) &&
          lat >= 4.5 &&
          lat <= 21.5 &&
          lng >= 116.5 &&
          lng <= 127.0
        );
      });
  } catch {
    clearTimeout(timeoutId);
    return [];
  }
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const query = url.searchParams.get("q")?.trim();

    if (!query || query.length < 2) {
      return NextResponse.json({ results: [] });
    }

    const cacheKey = query.toLowerCase();
    const cached = memoryCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return NextResponse.json({ results: cached.data, cached: true });
    }

    // Exclusively query OpenStreetMap APIs (Nominatim -> Photon fallback)
    let results = await fetchOpenStreetMapNominatim(query);
    if (results.length === 0) {
      results = await fetchOpenStreetMapPhoton(query);
    }

    // Save to in-memory cache
    memoryCache.set(cacheKey, {
      data: results,
      timestamp: Date.now(),
    });

    return NextResponse.json({ results });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "OpenStreetMap lookup failed";
    return NextResponse.json({ error: msg, results: [] }, { status: 500 });
  }
}
