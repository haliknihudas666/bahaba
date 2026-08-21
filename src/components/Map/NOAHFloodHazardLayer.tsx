"use client";

// ---------------------------------------------------------------------------
// Bahaba – UP NOAH 100-Year Flood Hazard PMTiles Overlay Layer
//
// Renders the flood_100yr.pmtiles vector tile archive as a color-coded
// flood hazard zone overlay on the Leaflet map using protomaps-leaflet.
//
// NOAH Hazard Levels (from PMTiles vector layer "flood_100yr", property `Var`):
//   Var=1 (Low Hazard)    → Blue    — flood depth < 0.5m (ankle to knee)
//   Var=2 (Medium Hazard) → Orange  — flood depth 0.5m – 1.5m (knee to neck)
//   Var=3 (High Hazard)   → Red     — flood depth > 1.5m (above neck / waist+)
//
// Caching Strategy:
//   - Module-level singleton layer instance preserves decoded vector tiles
//     and PMTiles directory caches in memory across all toggles.
//   - Toggling off detaches the layer without destroying cache.
//   - Toggling on re-attaches instantly with zero network reload.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import * as protomapsL from "protomaps-leaflet";
import { createCachedPMTiles } from "@/lib/pmtiles/cachedSource";

/** UP NOAH 100-Year Flood Hazard PMTiles hosted on Hugging Face */
const NOAH_PMTILES_URL =
  "https://huggingface.co/datasets/bettergovph/project-noah-hazard-maps/resolve/main/PMTiles/layers/flood_100yr.pmtiles";

// Module-level persistent PMTiles instance with IndexedDB and RAM chunk caching
const noahPMTilesSource = createCachedPMTiles(NOAH_PMTILES_URL);

// Module-level singleton layer cache across toggles and re-renders
let cachedProtomapsLayer: any = null;

interface NOAHFloodHazardLayerProps {
  /** Leaflet map instance */
  map: any;
  /** Whether the hazard overlay is visible */
  visible: boolean;
}

export default function NOAHFloodHazardLayer({
  map,
  visible,
}: NOAHFloodHazardLayerProps) {
  const layerRef = useRef<any>(null);

  useEffect(() => {
    if (!map || typeof window === "undefined" || !map._loaded) return;

    // Create the layer once (reused across toggles and re-renders)
    if (!cachedProtomapsLayer) {
      try {
        cachedProtomapsLayer = protomapsL.leafletLayer({
          url: noahPMTilesSource as any,
          paintRules: [
            // Single unified rule for 3x faster vector feature evaluation
            {
              dataLayer: "flood_100yr",
              minzoom: 8,
              symbolizer: new protomapsL.PolygonSymbolizer({
                fill: (_z: number, f: any) => {
                  const v = f?.props?.Var ?? f?.props?.var;
                  if (v === 3) return "rgba(239, 68, 68, 0.45)"; // High Hazard (>1.5m)
                  if (v === 2) return "rgba(249, 115, 22, 0.40)"; // Medium Hazard (0.5m - 1.5m)
                  return "rgba(59, 130, 246, 0.32)"; // Low Hazard (<0.5m)
                },
                opacity: 1,
                width: 0,
              }),
            },
          ],
          labelRules: [],
          maxDataZoom: 14,
          tileDelay: 5,
        });
      } catch (err) {
        console.warn("[NOAHFloodHazardLayer] Error creating protomaps layer:", err);
      }
    }

    layerRef.current = cachedProtomapsLayer;
    const layer = layerRef.current;
    if (!layer) return;

    if (visible) {
      if (!map.hasLayer(layer)) {
        try {
          map.addLayer(layer);
        } catch (e) {
          console.warn("[NOAHFloodHazardLayer] addLayer warning:", e);
        }
      }
    } else {
      if (map.hasLayer(layer)) {
        try {
          map.removeLayer(layer);
        } catch (e) {
          console.warn("[NOAHFloodHazardLayer] removeLayer warning:", e);
        }
      }
    }
  }, [map, visible]);

  // Clean up layer only when map is completely destroyed / unmounted
  useEffect(() => {
    return () => {
      if (layerRef.current && map) {
        try {
          if (map.hasLayer(layerRef.current)) {
            map.removeLayer(layerRef.current);
          }
        } catch { }
      }
    };
  }, [map]);

  return null;
}
