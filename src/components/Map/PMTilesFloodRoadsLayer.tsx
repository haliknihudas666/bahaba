"use client";

// ---------------------------------------------------------------------------
// Bahaba – Predictive Flood Road Network Vector Layer (PMTiles)
// ---------------------------------------------------------------------------
//
// Renders the full Philippines vector road network from Hugging Face PMTiles
// using protomaps-leaflet on HTML5 Canvas.
//
// Live Hydro-Predictive Coloring:
// - Dynamically colors roads based on backend-synchronized rainfall & telemetry
// - Roads experiencing standing water depth >= 6 cm turn:
//     • Gutter Deep (6–15 cm): Orange (#f97316)
//     • Half-Tire Deep (16–30 cm): Red (#ef4444)
//     • Waist Deep (>30 cm): Severe Dark Red (#7f1d1d / #dc2626)
// - Clear / dry roads render in a clean, high-contrast cyan/slate dark-mode palette.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
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
  /** Rain rate in mm/hr from backend */
  rainRate?: number;
  /** 24h rain accumulation in mm from backend */
  rain24h?: number;
  /** Whether background roads should be dimmed */
  dimmed?: boolean;
}

export default function PMTilesFloodRoadsLayer({
  map,
  visible = true,
  stations = [],
  rainRate = 0,
  rain24h = 0,
  dimmed = false,
}: PMTilesFloodRoadsLayerProps) {
  const layerRef = useRef<any>(null);
  const stationsRef = useRef<LiveStation[]>(stations);
  const dimmedRef = useRef<boolean>(dimmed);
  const rainRateRef = useRef<number>(rainRate);
  const rain24hRef = useRef<number>(rain24h);

  // Update dimmed ref and redraw only when dimming state changes
  useEffect(() => {
    if (dimmedRef.current !== dimmed) {
      dimmedRef.current = dimmed;
      if (layerRef.current && typeof layerRef.current.redraw === "function") {
        layerRef.current.redraw();
      }
    }
  }, [dimmed]);

  // Update stations ref and redraw when stations change
  useEffect(() => {
    stationsRef.current = stations;
    rainRateRef.current = rainRate;
    rain24hRef.current = rain24h;
    if (layerRef.current && typeof layerRef.current.redraw === "function") {
      layerRef.current.redraw();
    }
  }, [stations, rainRate, rain24h]);

  // Initialize Hardware-Accelerated PMTiles Vector Layer
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

        // Base natural landcover
        const landcoverSymbolizer = new protomapsL.PolygonSymbolizer({
          fill: "#080e1a",
          opacity: 0.95,
        });

        // Urban & commercial landuse
        const landuseSymbolizer = new protomapsL.PolygonSymbolizer({
          fill: (z: number, f: any) => {
            const cls = f?.props?.class;
            if (cls === "commercial" || cls === "industrial") return "#0e1726";
            if (cls === "residential") return "#0a1120";
            return "#0b1424";
          },
          opacity: 0.9,
        });

        // Parks & green spaces
        const parkSymbolizer = new protomapsL.PolygonSymbolizer({
          fill: "#061712",
          opacity: 0.8,
        });

        // Water bodies (oceans, bays, lakes)
        const waterSymbolizer = new protomapsL.PolygonSymbolizer({
          fill: "#051122",
          opacity: 0.98,
        });

        // Waterways (rivers, canals, esteros)
        const waterwaySymbolizer = new protomapsL.LineSymbolizer({
          color: "#0e2c52",
          width: (z: number) => (z >= 14 ? 3.2 : z >= 12 ? 2.0 : 1.2),
          opacity: 0.85,
        });

        // Administrative boundaries
        const boundarySymbolizer = new protomapsL.LineSymbolizer({
          color: "#1e293b",
          width: (z: number) => (z >= 12 ? 1.4 : 0.8),
          opacity: 0.65,
        });

        // Building footprints at close zoom (>=14)
        const buildingSymbolizer = new protomapsL.PolygonSymbolizer({
          fill: "#141e2e",
          opacity: 0.6,
        });

        const layer = protomapsL.leafletLayer({
          url: roadsPMTilesSource as any,
          backgroundColor: "#030712",
          paintRules: [
            // 1. Natural Landcover & Landuse
            {
              dataLayer: "landcover",
              symbolizer: landcoverSymbolizer,
            },
            {
              dataLayer: "landuse",
              symbolizer: landuseSymbolizer,
            },
            {
              dataLayer: "park",
              symbolizer: parkSymbolizer,
            },
            // 2. Water Bodies & River Networks
            {
              dataLayer: "water",
              symbolizer: waterSymbolizer,
            },
            {
              dataLayer: "waterway",
              symbolizer: waterwaySymbolizer,
            },
            // 3. Administrative Boundaries
            {
              dataLayer: "boundary",
              symbolizer: boundarySymbolizer,
            },
            // 4. Building Footprints (High Zoom)
            {
              dataLayer: "building",
              minzoom: 14,
              symbolizer: buildingSymbolizer,
            },
            // 5. Physical Road Vectors with Zoom Filtering & Live Flood Engine Inundation Styling
            {
              dataLayer: "transportation",
              minzoom: 6,
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
            // Major Cities and Municipalities (Manila, QC, Makati, Pasig, Marikina, etc.)
            {
              dataLayer: "place",
              minzoom: 7,
              maxzoom: 15,
              symbolizer: new protomapsL.CenteredTextSymbolizer({
                labelProps: ["name:en", "name", "name_int"],
                fill: "#94a3b8",
                font: "600 11px system-ui, -apple-system, sans-serif",
                stroke: "#020617",
                width: 3.0,
              }),
            },
            // High-Legibility Road Name Labels (street-level zoom >= 14)
            {
              dataLayer: "transportation_name",
              minzoom: 14,
              symbolizer: new protomapsL.LineLabelSymbolizer({
                fill: "#f8fafc",
                font: "600 11px system-ui, -apple-system, sans-serif",
                stroke: "#020617",
                width: 3.2,
              }),
            },
          ],
          maxDataZoom: 14,
          tileDelay: 5,
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
