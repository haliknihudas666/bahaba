"use client";

// ---------------------------------------------------------------------------
// Bahaba – Canvas Flood Inundation Prediction Heatmap Layer Component
//
// Renders a continuous, dynamic flood risk heatmap surface across
// Metro Manila by drawing backend precalculated heatmap points on HTML5 Canvas.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { LiveStation } from "@/types";
import {
  generateFloodHeatmapPoints,
  type FloodHeatmapPoint,
} from "@/lib/engine/liveFloodGrid";

interface FloodHeatmapLayerProps {
  /** Leaflet map instance */
  map: any;
  /** Active PAGASA telemetry stations */
  stations?: LiveStation[];
  /** Precalculated heatmap points from backend */
  heatmapPoints?: FloodHeatmapPoint[];
  /** Whether the heatmap layer is visible */
  visible: boolean;
}

/**
 * Multi-stop color gradient lookup for heatmap rendering
 */
function getHeatmapGradient(ctx: CanvasRenderingContext2D, radius: number, intensity: number): CanvasGradient {
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, radius);
  const i = Math.min(1.0, Math.max(0.0, intensity));

  if (i >= 0.7) {
    // Critical Inundation (>30 cm / Waist Deep) -> Crimson to Vivid Red
    gradient.addColorStop(0.0, `rgba(239, 68, 68, ${0.55 + i * 0.35})`);
    gradient.addColorStop(0.3, `rgba(220, 38, 38, ${0.45 + i * 0.3})`);
    gradient.addColorStop(0.6, `rgba(249, 115, 22, ${0.3 + i * 0.2})`);
    gradient.addColorStop(1.0, "rgba(249, 115, 22, 0.0)");
  } else if (i >= 0.4) {
    // High / Half-Tire Deep (16-30 cm) -> Orange to Amber
    gradient.addColorStop(0.0, `rgba(249, 115, 22, ${0.5 + i * 0.3})`);
    gradient.addColorStop(0.4, `rgba(234, 179, 8, ${0.35 + i * 0.25})`);
    gradient.addColorStop(0.7, `rgba(56, 189, 248, ${0.2 + i * 0.15})`);
    gradient.addColorStop(1.0, "rgba(56, 189, 248, 0.0)");
  } else if (i >= 0.15) {
    // Moderate / Gutter Deep (6-15 cm) -> Cyan to Teal
    gradient.addColorStop(0.0, `rgba(56, 189, 248, ${0.4 + i * 0.3})`);
    gradient.addColorStop(0.5, `rgba(6, 182, 212, ${0.25 + i * 0.2})`);
    gradient.addColorStop(1.0, "rgba(6, 182, 212, 0.0)");
  } else {
    // Low / Passable (0-5 cm) -> Subtle Aqua
    gradient.addColorStop(0.0, "rgba(56, 189, 248, 0.25)");
    gradient.addColorStop(0.6, "rgba(6, 182, 212, 0.12)");
    gradient.addColorStop(1.0, "rgba(6, 182, 212, 0.0)");
  }

  return gradient;
}

export default function FloodHeatmapLayer({
  map,
  stations = [],
  heatmapPoints,
  visible,
}: FloodHeatmapLayerProps) {
  const layerRef = useRef<any>(null);
  const activePointsRef = useRef<FloodHeatmapPoint[]>([]);

  // 1. Sync heatmap points from backend or compute fallback
  useEffect(() => {
    if (heatmapPoints && heatmapPoints.length > 0) {
      activePointsRef.current = heatmapPoints;
    } else {
      activePointsRef.current = generateFloodHeatmapPoints(stations, 0, 0);
    }

    if (layerRef.current && map && map._loaded) {
      try {
        layerRef.current.redraw();
      } catch {}
    }
  }, [heatmapPoints, stations, map]);

  // 2. Initialize Custom Leaflet GridLayer Canvas Renderer
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map || !map._loaded) return;

    if (!layerRef.current) {
      const CanvasHeatmapGrid = L.GridLayer.extend({
        createTile: function (coords: { x: number; y: number; z: number }) {
          const tile = document.createElement("canvas");
          const tileSize = this.getTileSize();
          tile.width = tileSize.x;
          tile.height = tileSize.y;

          const ctx = tile.getContext("2d");
          if (!ctx) return tile;

          const nwPoint = coords;
          const nwLatLng = map.unproject([nwPoint.x * tileSize.x, nwPoint.y * tileSize.y], nwPoint.z);
          const seLatLng = map.unproject([(nwPoint.x + 1) * tileSize.x, (nwPoint.y + 1) * tileSize.y], nwPoint.z);

          const bounds = L.latLngBounds(seLatLng, nwLatLng);
          // Pad bounds slightly to allow smooth blending across tile borders
          const paddedBounds = bounds.pad(0.35);

          const points = activePointsRef.current;
          if (!points || points.length === 0) return tile;

          ctx.globalCompositeOperation = "source-over";

          points.forEach((pt) => {
            if (!paddedBounds.contains([pt.lat, pt.lng])) return;

            // Project lat/lng to tile pixel coordinates
            const layerPoint = map.project([pt.lat, pt.lng], coords.z);
            const tilePixelX = layerPoint.x - coords.x * tileSize.x;
            const tilePixelY = layerPoint.y - coords.y * tileSize.y;

            // Scale radius based on zoom level (z=10..18)
            const zoomScale = Math.pow(1.18, Math.max(0, coords.z - 12));
            const radius = Math.max(25, (pt.radius || 35) * zoomScale);

            ctx.save();
            ctx.translate(tilePixelX, tilePixelY);
            ctx.fillStyle = getHeatmapGradient(ctx, radius, pt.intensity);
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
          });

          return tile;
        },
      });

      layerRef.current = new CanvasHeatmapGrid({
        opacity: 0.85,
        zIndex: 400,
        tileSize: 256,
      });
    }

    const layer = layerRef.current;
    if (!layer) return;

    if (visible) {
      if (!map.hasLayer(layer)) {
        try {
          map.addLayer(layer);
        } catch (err) {
          console.warn("[FloodHeatmapLayer] addLayer warning:", err);
        }
      }
    } else {
      if (map.hasLayer(layer)) {
        try {
          map.removeLayer(layer);
        } catch (err) {
          console.warn("[FloodHeatmapLayer] removeLayer warning:", err);
        }
      }
    }
  }, [map, visible]);

  // Clean up layer on unmount
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
