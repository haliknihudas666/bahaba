"use client";

// ---------------------------------------------------------------------------
// Bahaba – Predictive Flood Road Network Vector Layer (PMTiles)
// ---------------------------------------------------------------------------
//
// Renders the full Philippines vector road network from Hugging Face PMTiles
// using protomaps-leaflet on HTML5 Canvas.
//
// Live Hydro-Predictive Coloring:
// - Dynamically calculates water depth and flood risk for each map tile by fusing:
//   1. Live PAGASA Hydrological Station Telemetry (rain1h, rain24h, water levels)
//   2. Live Open-Meteo precipitation rate (mm/hr & 24h accumulated)
//   3. UP NOAH 100-Year Flood Hazard & Elevation Model (calculateWaterDepth)
// - Roads experiencing standing water depth >= 6 cm turn:
//     • Gutter Deep (6–15 cm): Orange (#f97316)
//     • Half-Tire Deep (16–30 cm): Red (#ef4444)
//     • Waist Deep (>30 cm): Severe Dark Red (#7f1d1d / #dc2626)
// - Clear / dry roads render in a clean, high-contrast cyan/slate dark-mode palette.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import * as protomapsL from "protomaps-leaflet";
import { createCachedPMTiles } from "@/lib/pmtiles/cachedSource";
import type { LiveStation } from "@/types";
import { estimateInundationAtLocation, type SpatialInundationEstimate } from "@/lib/engine/liveFloodGrid";

/** Philippines Vector Road Network PMTiles hosted on Hugging Face */
const PH_ROADS_PMTILES_URL =
  "https://huggingface.co/datasets/Jrabb1t/philippines-map-data/resolve/main/philippines-final.pmtiles";

// Module-level persistent PMTiles instance with IndexedDB and RAM chunk caching
const roadsPMTilesSource = createCachedPMTiles(PH_ROADS_PMTILES_URL);

interface GeoBBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/** Convert Web Mercator tile coordinates (x, y, z) to geographic latitude/longitude bounds */
function tile2bbox(x: number, y: number, z: number): GeoBBox {
  const lon1 = (x / Math.pow(2, z)) * 360 - 180;
  const lon2 = ((x + 1) / Math.pow(2, z)) * 360 - 180;
  const n1 = Math.PI - (2 * Math.PI * y) / Math.pow(2, z);
  const n2 = Math.PI - (2 * Math.PI * (y + 1)) / Math.pow(2, z);
  const lat1 = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n1) - Math.exp(-n1)));
  const lat2 = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n2) - Math.exp(-n2)));

  return {
    minLat: Math.min(lat1, lat2),
    maxLat: Math.max(lat1, lat2),
    minLng: Math.min(lon1, lon2),
    maxLng: Math.max(lon1, lon2),
  };
}

// Global active tile flood state during synchronous canvas painting
let activePaintDepthCm = 0;
let activePaintCategory = "NORMAL";

interface PMTilesFloodRoadsLayerProps {
  /** Leaflet map instance */
  map: any;
  /** Whether the road overlay is visible */
  visible?: boolean;
  /** Active PAGASA telemetry stations */
  stations?: LiveStation[];
  /** Whether background roads should be dimmed (e.g. when route is active / route has flood) */
  dimmed?: boolean;
}

export default function PMTilesFloodRoadsLayer({
  map,
  visible = true,
  stations = [],
  dimmed = false,
}: PMTilesFloodRoadsLayerProps) {
  const layerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const stationsRef = useRef<LiveStation[]>(stations);
  const dimmedRef = useRef<boolean>(dimmed);
  const [rainRate, setRainRate] = useState<number>(0);
  const [rain24h, setRain24h] = useState<number>(0);
  const rainRateRef = useRef<number>(0);
  const rain24hRef = useRef<number>(0);
  const lastFetchedCenterRef = useRef<{ lat: number; lng: number; time: number }>({
    lat: 0,
    lng: 0,
    time: 0,
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Update dimmed ref and redraw when dimming state changes
  useEffect(() => {
    dimmedRef.current = dimmed;
    if (layerRef.current && typeof layerRef.current.redraw === "function") {
      layerRef.current.redraw();
    }
  }, [dimmed]);

  // Update stations ref and redraw only if station count or high-risk count changed
  useEffect(() => {
    stationsRef.current = stations;
    if (layerRef.current && typeof layerRef.current.redraw === "function") {
      layerRef.current.redraw();
    }
  }, [stations]);

  // Keep rainfall in ref and trigger redraw when weather updates
  useEffect(() => {
    rainRateRef.current = rainRate;
    rain24hRef.current = rain24h;
    if (layerRef.current && typeof layerRef.current.redraw === "function") {
      layerRef.current.redraw();
    }
  }, [rainRate, rain24h]);

  // 1. Fetch live Open-Meteo rainfall for current map center (debounced & distance-throttled)
  const fetchOpenMeteoRainfall = useCallback(async (lat: number, lng: number) => {
    const now = Date.now();
    const last = lastFetchedCenterRef.current;
    const distMoved = Math.hypot(lat - last.lat, lng - last.lng);

    // Only query API if map moved > ~5km (0.045 deg) or > 60 seconds elapsed
    if (distMoved < 0.045 && now - last.time < 60000) return;
    lastFetchedCenterRef.current = { lat, lng, time: now };

    try {
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lng.toFixed(4)}&current=precipitation,rain&hourly=precipitation`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      const currentRain = data.current?.precipitation ?? data.current?.rain ?? 0;

      let acc24h = 0;
      if (data.hourly?.precipitation && Array.isArray(data.hourly.precipitation)) {
        const last24 = data.hourly.precipitation.slice(0, 24);
        acc24h = last24.reduce((sum: number, val: number) => sum + (val || 0), 0);
      }

      if (isMountedRef.current) {
        setRainRate(Math.max(0, currentRain));
        setRain24h(Math.max(0, acc24h));
      }
    } catch (err) {
      console.warn("[PMTilesFloodRoadsLayer Open-Meteo Fetch Warning]", err);
    }
  }, []);

  // Update rainfall on map move (debounced)
  useEffect(() => {
    if (!map || !map._loaded) return;

    let timeoutId: NodeJS.Timeout | null = null;
    const handleViewChange = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        try {
          const center = map.getCenter();
          if (center && typeof center.lat === "number" && typeof center.lng === "number") {
            fetchOpenMeteoRainfall(center.lat, center.lng);
          }
        } catch {}
      }, 500);
    };

    handleViewChange();
    map.on("moveend", handleViewChange);

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      try {
        map.off("moveend", handleViewChange);
      } catch {}
    };
  }, [map, fetchOpenMeteoRainfall]);

  // 2. Initialize Hardware-Accelerated PMTiles Vector Layer
  useEffect(() => {
    if (!map || typeof window === "undefined" || !map._loaded) return;

    if (!layerRef.current) {
      try {
        const roadSymbolizer = new protomapsL.LineSymbolizer({
          color: (_z: number, f: any) => {
            const cls = f?.props?.class;
            const floodDepthCm = activePaintDepthCm;
            const floodCategory = activePaintCategory;

            // ── FLOODED ROAD STYLING (Standing water >= 6cm) ──
            if (floodDepthCm >= 6) {
              if (floodCategory === "CRITICAL" || floodDepthCm > 30) {
                // Waist Deep (> 30 cm) / Impassable
                if (cls === "motorway" || cls === "trunk") return "rgba(220, 38, 38, 0.98)";
                if (cls === "primary") return "rgba(185, 28, 28, 0.98)";
                if (cls === "secondary") return "rgba(153, 27, 27, 0.95)";
                if (cls === "tertiary") return "rgba(127, 29, 29, 0.90)";
                return "rgba(185, 28, 28, 0.85)";
              }

              if (floodCategory === "HIGH" || floodDepthCm >= 16) {
                // Half-Tire Deep (16–30 cm)
                if (cls === "motorway" || cls === "trunk") return "rgba(249, 115, 22, 0.98)";
                if (cls === "primary") return "rgba(239, 68, 68, 0.98)";
                if (cls === "secondary") return "rgba(220, 38, 38, 0.95)";
                if (cls === "tertiary") return "rgba(234, 88, 12, 0.90)";
                return "rgba(249, 115, 22, 0.80)";
              }

              // Gutter Deep (6–15 cm)
              if (cls === "motorway" || cls === "trunk") return "rgba(245, 158, 11, 0.98)";
              if (cls === "primary") return "rgba(249, 115, 22, 0.98)";
              if (cls === "secondary") return "rgba(251, 146, 60, 0.95)";
              if (cls === "tertiary") return "rgba(253, 186, 116, 0.90)";
              return "rgba(251, 146, 60, 0.75)";
            }

            // ── CLEAR / DRY ROADS (Dimmed Soft White / Slate Hierarchy) ──
            const isDimmed = dimmedRef.current;
            if (isDimmed) {
              if (cls === "motorway" || cls === "trunk") return "rgba(241, 245, 249, 0.32)";
              if (cls === "primary") return "rgba(226, 232, 240, 0.24)";
              if (cls === "secondary") return "rgba(203, 213, 225, 0.17)";
              if (cls === "tertiary") return "rgba(148, 163, 184, 0.12)";
              return "rgba(100, 116, 139, 0.08)";
            }

            if (cls === "motorway" || cls === "trunk") return "rgba(248, 250, 252, 0.72)";
            if (cls === "primary") return "rgba(241, 245, 249, 0.60)";
            if (cls === "secondary") return "rgba(226, 232, 240, 0.48)";
            if (cls === "tertiary") return "rgba(203, 213, 225, 0.34)";
            return "rgba(148, 163, 184, 0.20)";
          },
          width: (z: number, f: any) => {
            const cls = f?.props?.class;
            const isFlooded = activePaintDepthCm >= 6;
            const boost = isFlooded ? 2.0 : 0;

            if (cls === "motorway" || cls === "trunk") {
              return (z >= 14 ? 5.5 : z >= 12 ? 4 : 2.5) + boost;
            }
            if (cls === "primary") {
              return (z >= 14 ? 4.5 : z >= 12 ? 3 : 2) + boost;
            }
            if (cls === "secondary") {
              return (z >= 14 ? 3.5 : z >= 12 ? 2.2 : 1.5) + boost;
            }
            if (cls === "tertiary") {
              return (z >= 14 ? 2.5 : z >= 12 ? 1.6 : 1) + boost;
            }
            return (z >= 14 ? 1.8 : z >= 13 ? 1.0 : 0) + (isFlooded && z >= 13 ? 1.5 : 0);
          },
          opacity: 0.92,
        });

        // Hook into LineSymbolizer.before to read precalculated tile flood status from canvas
        const origBefore = roadSymbolizer.before.bind(roadSymbolizer);
        roadSymbolizer.before = function (ctx: CanvasRenderingContext2D, z: number) {
          const est = (ctx.canvas as any)?._tileFloodEstimate as SpatialInundationEstimate | undefined;
          if (est) {
            activePaintDepthCm = est.estimatedDepthCm;
            activePaintCategory = est.riskCategory;
          } else {
            activePaintDepthCm = 0;
            activePaintCategory = "NORMAL";
          }
          return origBefore(ctx, z);
        };

        const layer = protomapsL.leafletLayer({
          url: roadsPMTilesSource as any,
          paintRules: [
            // Physical Road Vectors with Zoom Filtering & Live Flood Engine Inundation Styling
            {
              dataLayer: "transportation",
              minzoom: 8,
              filter: (z: number, f: any) => {
                const cls = f?.props?.class;
                // At low zoom (<11), draw only motorways and primary highways to keep map fast & responsive
                if (z < 11) {
                  return cls === "motorway" || cls === "trunk" || cls === "primary";
                }
                // At mid zoom (11..12), add secondary roads
                if (z < 13) {
                  return cls === "motorway" || cls === "trunk" || cls === "primary" || cls === "secondary";
                }
                // At street-level zoom (>=13), exclude non-drivable footpaths / service steps to avoid clutter
                return (
                  cls !== "path" &&
                  cls !== "footway" &&
                  cls !== "pedestrian" &&
                  cls !== "steps" &&
                  cls !== "cycleway"
                );
              },
              symbolizer: roadSymbolizer,
            },
          ],
          labelRules: [
            // High-Legibility Crisp Road Name Labels (street-level zoom only to save labeler index compute)
            {
              dataLayer: "transportation_name",
              minzoom: 13,
              symbolizer: new protomapsL.LineLabelSymbolizer({
                fill: "#f8fafc",
                font: "600 11px system-ui, -apple-system, sans-serif",
                stroke: "#020617",
                width: 3.2,
              }),
            },
          ],
          maxDataZoom: 14,
          tileDelay: 0,
        });

        // Intercept renderTile to calculate flood estimation ONCE per tile before canvas painting
        const origRenderTile = (layer as any).renderTile.bind(layer);
        (layer as any).renderTile = function (
          coords: any,
          canvas: HTMLCanvasElement,
          key: string,
          done: any
        ) {
          try {
            const maxCoord = Math.pow(2, coords.z);
            if (coords.x < 0 || coords.x >= maxCoord || coords.y < 0 || coords.y >= maxCoord) {
              if (typeof done === "function") done(null, canvas);
              return;
            }

            const bbox = tile2bbox(coords.x, coords.y, coords.z);
            const centLat = (bbox.minLat + bbox.maxLat) / 2;
            const centLng = (bbox.minLng + bbox.maxLng) / 2;

            // Calculate inundation once per tile (uses memoized cache in liveFloodGrid)
            const estimate = estimateInundationAtLocation(
              centLat,
              centLng,
              stationsRef.current,
              rainRateRef.current,
              rain24hRef.current
            );

            (canvas as any)._tileFloodEstimate = estimate;
            const res = origRenderTile(coords, canvas, key, done);
            if (res && typeof res.catch === "function") {
              return res.catch((err: any) => {
                if (typeof done === "function") done(null, canvas);
              });
            }
            return res;
          } catch {
            if (typeof done === "function") done(null, canvas);
          }
        };

        layerRef.current = layer;
      } catch (err) {
        console.warn("[PMTilesFloodRoadsLayer] Error initializing PMTiles layer:", err);
      }
    }

    const layer = layerRef.current;
    if (!layer) return;

    if (visible) {
      if (!map.hasLayer(layer)) {
        try {
          map.addLayer(layer);
        } catch (e) {
          console.warn("[PMTilesFloodRoadsLayer] addLayer warning:", e);
        }
      }
    } else {
      if (map.hasLayer(layer)) {
        try {
          map.removeLayer(layer);
        } catch (e) {
          console.warn("[PMTilesFloodRoadsLayer] removeLayer warning:", e);
        }
      }
    }
  }, [map, visible]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (layerRef.current && map) {
        try {
          if (map.hasLayer(layerRef.current)) {
            map.removeLayer(layerRef.current);
          }
        } catch {}
      }
    };
  }, [map]);

  return null;
}

