"use client";

// ---------------------------------------------------------------------------
// Bahaba – Dynamic Viewport-Driven Flood Road Overlay Layer
// ---------------------------------------------------------------------------
//
// Google Maps traffic-layer style: fetches real OSM road geometry from
// Overpass API for the current viewport, predicts flood depth using
// Open-Meteo rainfall + elevation, and renders only flooded roads
// (≥ 6cm / gutter deep). Clear roads are hidden.
//
// Activates at zoom ≥ 13 only.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import { fetchRoadsInViewport, type BBox } from "@/lib/geo/overpassRoadFetcher";
import {
  predictFloodedRoads,
  type DynamicFloodRoad,
} from "@/lib/geo/viewportFloodPredictor";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

interface DynamicFloodRoadsLayerProps {
  /** Leaflet map instance */
  map?: any;
  /** Whether the layer is visible */
  visible?: boolean;
}

const MIN_ZOOM = 13;
const DEBOUNCE_MS = 800;

export default function DynamicFloodRoadsLayer({
  map,
  visible = true,
}: DynamicFloodRoadsLayerProps) {
  const layerGroupRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastBBoxKeyRef = useRef<string>("");
  const [floodedRoads, setFloodedRoads] = useState<DynamicFloodRoad[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentZoom, setCurrentZoom] = useState(12);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  // Track zoom level
  useEffect(() => {
    if (!map || !map._loaded) return;

    const updateZoom = () => {
      if (isMountedRef.current) {
        setCurrentZoom(map.getZoom());
      }
    };

    updateZoom();
    map.on("zoomend", updateZoom);
    return () => {
      try {
        map.off("zoomend", updateZoom);
      } catch {}
    };
  }, [map]);

  // Fetch and predict flooded roads for the current viewport
  const updateViewport = useCallback(async () => {
    if (!map || !map._loaded || !isMountedRef.current) return;

    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM) {
      if (isMountedRef.current) setFloodedRoads([]);
      return;
    }

    try {
      const bounds = map.getBounds();
      if (!bounds) return;

      const bbox: BBox = {
        south: bounds.getSouth(),
        west: bounds.getWest(),
        north: bounds.getNorth(),
        east: bounds.getEast(),
      };

      // Skip if viewport hasn't meaningfully changed
      const bboxKey = `${bbox.south.toFixed(3)},${bbox.west.toFixed(3)},${bbox.north.toFixed(3)},${bbox.east.toFixed(3)}`;
      if (bboxKey === lastBBoxKeyRef.current) return;
      lastBBoxKeyRef.current = bboxKey;

      setLoading(true);

      // 1. Fetch road geometry from Overpass API
      const roads = await fetchRoadsInViewport(bbox);

      if (!isMountedRef.current) return;

      // 2. Get viewport center for rainfall query
      const center = map.getCenter();
      const centerLat = center?.lat ?? (bbox.south + bbox.north) / 2;
      const centerLng = center?.lng ?? (bbox.west + bbox.east) / 2;

      // 3. Predict flooded roads (only returns ≥ 6cm)
      const flooded = await predictFloodedRoads(roads, centerLat, centerLng);

      if (isMountedRef.current) {
        setFloodedRoads(flooded);
        setLoading(false);
      }
    } catch (err) {
      console.warn("[DynamicFloodRoadsLayer] Update error:", err);
      if (isMountedRef.current) setLoading(false);
    }
  }, [map]);

  // Debounced viewport listener
  useEffect(() => {
    if (!map || !map._loaded) return;

    const handleViewChange = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        updateViewport();
      }, DEBOUNCE_MS);
    };

    // Initial fetch
    handleViewChange();

    map.on("moveend", handleViewChange);
    map.on("zoomend", handleViewChange);

    return () => {
      try {
        map.off("moveend", handleViewChange);
        map.off("zoomend", handleViewChange);
      } catch {}
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [map, updateViewport]);

  // Render polylines on Leaflet map
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map || !map._loaded) return;

    let animFrameId: number | null = null;

    const renderLayers = () => {
      if (!map || !map._loaded) return;
      patchLeafletBounds(L);

      if (map._animating || map._zooming) return;

      try {
        if (!layerGroupRef.current) {
          layerGroupRef.current = L.layerGroup().addTo(map);
        } else {
          try {
            layerGroupRef.current.clearLayers();
          } catch {}
        }

        // Don't render if not visible or below min zoom
        if (!visible || currentZoom < MIN_ZOOM) return;

        const layerGroup = layerGroupRef.current;

        for (const road of floodedRoads) {
          try {
            if (!road.coordinates || road.coordinates.length < 2) continue;

            // Convert [lng, lat] → Leaflet [lat, lng]
            const leafletLatLngs: [number, number][] = road.coordinates
              .filter(
                (c) =>
                  Array.isArray(c) &&
                  c.length === 2 &&
                  typeof c[0] === "number" &&
                  !isNaN(c[0]) &&
                  isFinite(c[0]) &&
                  Math.abs(c[0]) <= 180 &&
                  typeof c[1] === "number" &&
                  !isNaN(c[1]) &&
                  isFinite(c[1]) &&
                  Math.abs(c[1]) <= 90
              )
              .map(([lng, lat]) => [lat, lng]);

            if (leafletLatLngs.length < 2) continue;

            const polyline = L.polyline(leafletLatLngs, {
              color: road.color,
              weight: road.lineWeight,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
              noClip: true,
            });

            // Popup with flood info
            const severityIcon =
              road.riskCategory === "CRITICAL"
                ? "🟤"
                : road.riskCategory === "HIGH"
                  ? "🔴"
                  : "🟠";

            const popupHtml = `
              <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; color: #0f172a; min-width: 200px; max-width: 280px;">
                <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                  <div>
                    <h3 style="font-size: 13px; font-weight: 700; margin: 0; color: #0f172a; line-height: 1.3;">
                      ${road.name}
                    </h3>
                    <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
                      <span style="text-transform: capitalize;">${road.highway}</span> • Elev: ${road.elevationM.toFixed(1)}m
                    </div>
                  </div>
                  <span style="
                    font-size: 10px;
                    font-weight: 800;
                    padding: 3px 8px;
                    border-radius: 9999px;
                    background-color: ${road.color};
                    color: #ffffff;
                    white-space: nowrap;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                  ">
                    ${severityIcon} ${road.riskCategory}
                  </span>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; font-size: 11px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #64748b;">Est. Depth:</span>
                    <strong style="color: ${road.color}; font-family: monospace;">${road.depthCm} cm</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #64748b;">Rainfall:</span>
                    <strong style="font-family: monospace;">${road.rainMmHr} mm/hr</strong>
                  </div>
                  <div style="font-size: 10px; color: #475569;">${road.label}</div>
                </div>
              </div>
            `;

            polyline.bindPopup(popupHtml);

            // Hover effects
            polyline.on("mouseover", () => {
              polyline.setStyle({
                weight: road.lineWeight + 3,
                opacity: 1,
              });
            });
            polyline.on("mouseout", () => {
              polyline.setStyle({
                weight: road.lineWeight,
                opacity: 0.85,
              });
            });

            layerGroup.addLayer(polyline);
          } catch {}
        }
      } catch (err) {
        console.warn("[DynamicFloodRoadsLayer] Render error:", err);
      }
    };

    animFrameId = requestAnimationFrame(renderLayers);

    return () => {
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  }, [map, floodedRoads, visible, currentZoom]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      try {
        if (layerGroupRef.current && map) {
          layerGroupRef.current.clearLayers();
          map.removeLayer(layerGroupRef.current);
          layerGroupRef.current = null;
        }
      } catch {}
    };
  }, [map]);

  return null;
}
