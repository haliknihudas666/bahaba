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
import type { LiveStation } from "@/types";
import { estimateInundationAtLocation } from "@/lib/engine/liveFloodGrid";

/** Philippines Vector Road Network PMTiles hosted on Hugging Face */
const PH_ROADS_PMTILES_URL =
  "https://huggingface.co/datasets/Jrabb1t/philippines-map-data/resolve/main/philippines-final.pmtiles";

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

interface PMTilesFloodRoadsLayerProps {
  /** Leaflet map instance */
  map: any;
  /** Whether the road overlay is visible */
  visible?: boolean;
  /** Active PAGASA telemetry stations */
  stations?: LiveStation[];
}

export default function PMTilesFloodRoadsLayer({
  map,
  visible = true,
  stations = [],
}: PMTilesFloodRoadsLayerProps) {
  const layerRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const stationsRef = useRef<LiveStation[]>(stations);
  const [rainRate, setRainRate] = useState<number>(0);
  const [rain24h, setRain24h] = useState<number>(0);
  const rainRateRef = useRef<number>(0);
  const rain24hRef = useRef<number>(0);
  const lastFetchedCenterRef = useRef<string>("");

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Keep live stations in ref
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

  // 1. Fetch live Open-Meteo rainfall for current map center
  const fetchOpenMeteoRainfall = useCallback(async (lat: number, lng: number) => {
    const centerKey = `${lat.toFixed(2)},${lng.toFixed(2)}`;
    if (lastFetchedCenterRef.current === centerKey) return;
    lastFetchedCenterRef.current = centerKey;

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

  // Update rainfall on map pan / zoom
  useEffect(() => {
    if (!map || !map._loaded) return;

    const handleViewChange = () => {
      try {
        const center = map.getCenter();
        if (center && typeof center.lat === "number" && typeof center.lng === "number") {
          fetchOpenMeteoRainfall(center.lat, center.lng);
        }
      } catch {}
    };

    handleViewChange();
    map.on("moveend", handleViewChange);

    return () => {
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
        const layer = protomapsL.leafletLayer({
          url: PH_ROADS_PMTILES_URL,
          paintRules: [
            // Physical Road Vectors with Live Flood Engine Inundation Styling
            {
              dataLayer: "transportation",
              symbolizer: new protomapsL.LineSymbolizer({
                color: (_z: number, f: any) => {
                  const cls = f?.props?.class;
                  const bbox = (layer as any)._currentTileBBox as GeoBBox | undefined;

                  let floodDepthCm = 0;
                  let floodCategory = "NORMAL";

                  if (bbox) {
                    const centLat = (bbox.minLat + bbox.maxLat) / 2;
                    const centLng = (bbox.minLng + bbox.maxLng) / 2;

                    // Run offline & live hydro-prediction model for this tile
                    const estimate = estimateInundationAtLocation(
                      centLat,
                      centLng,
                      stationsRef.current,
                      rainRateRef.current,
                      rain24hRef.current
                    );

                    floodDepthCm = estimate.estimatedDepthCm;
                    floodCategory = estimate.riskCategory;
                  }

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
                    if (cls === "motorway" || cls === "trunk") return "rgba(56, 189, 248, 0.95)";
                    if (cls === "primary") return "rgba(249, 115, 22, 0.98)";
                    if (cls === "secondary") return "rgba(251, 146, 60, 0.95)";
                    if (cls === "tertiary") return "rgba(253, 186, 116, 0.90)";
                    return "rgba(251, 146, 60, 0.75)";
                  }

                  // ── CLEAR / DRY ROADS (Sleek Dark Mode Cyan / Slate Palette) ──
                  if (cls === "motorway" || cls === "trunk") return "rgba(56, 189, 248, 0.95)";
                  if (cls === "primary") return "rgba(96, 165, 250, 0.90)";
                  if (cls === "secondary") return "rgba(147, 197, 253, 0.80)";
                  if (cls === "tertiary") return "rgba(148, 163, 184, 0.65)";
                  return "rgba(100, 116, 139, 0.45)";
                },
                width: (z: number, f: any) => {
                  const cls = f?.props?.class;
                  const bbox = (layer as any)._currentTileBBox as GeoBBox | undefined;

                  let isFlooded = false;
                  if (bbox) {
                    const centLat = (bbox.minLat + bbox.maxLat) / 2;
                    const centLng = (bbox.minLng + bbox.maxLng) / 2;
                    const estimate = estimateInundationAtLocation(
                      centLat,
                      centLng,
                      stationsRef.current,
                      rainRateRef.current,
                      rain24hRef.current
                    );
                    isFlooded = estimate.estimatedDepthCm >= 6;
                  }

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
              }),
            },
          ],
          labelRules: [
            // High-Legibility Crisp Road Name Labels
            {
              dataLayer: "transportation_name",
              symbolizer: new protomapsL.LineLabelSymbolizer({
                fill: "#f8fafc",
                font: "600 11px system-ui, -apple-system, sans-serif",
                stroke: "#020617",
                width: 3.2,
              }),
            },
          ],
          maxDataZoom: 14,
        });

        // Intercept renderTile to track active tile bounding box during canvas rendering
        const origRenderTile = (layer as any).renderTile.bind(layer);
        (layer as any).renderTile = function (coords: any, canvas: HTMLCanvasElement, key: string, done: any) {
          (layer as any)._currentTileBBox = tile2bbox(coords.x, coords.y, coords.z);
          return origRenderTile(coords, canvas, key, done);
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
