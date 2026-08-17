"use client";

// ---------------------------------------------------------------------------
// Bahaba – Dynamic NOAH-Predicted Road Inundation Vector Layer Component
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import { getRoadsInBBox } from "@/lib/geo/getRoadsInBBox";
import {
  predictRoadFloodRisk,
  type NoahRoadFloodPrediction,
} from "@/lib/engine/floodPredictor";
import type { NoahRoadSegment } from "@/types/flood-engine";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

interface NOAHPredictedRoadsLayerProps {
  /** Leaflet map instance reference from parent or Leaflet context */
  map?: any;
  /** Optional custom road dataset array (defaults to pre-processed NOAH dataset) */
  roadsData?: NoahRoadSegment[];
  /** Callback triggered when a user clicks a predicted road polyline */
  onSelectRoad?: (prediction: NoahRoadFloodPrediction) => void;
}

export default function NOAHPredictedRoadsLayer({
  map,
  roadsData,
  onSelectRoad,
}: NOAHPredictedRoadsLayerProps) {
  const layerGroupRef = useRef<any>(null);
  const isMountedRef = useRef<boolean>(true);
  const [rainRate, setRainRate] = useState<number>(15); // Default 15 mm/hr (Moderate Rain)
  const [rain24h, setRain24h] = useState<number>(45);
  const [predictions, setPredictions] = useState<NoahRoadFloodPrediction[]>([]);
  const lastFetchedCenterRef = useRef<string>("");

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // 1. Fetch live rainfall rate from Open-Meteo API for map center coordinate
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
      
      // Calculate 24h accumulated rainfall if hourly data is present
      let acc24h = 0;
      if (data.hourly?.precipitation && Array.isArray(data.hourly.precipitation)) {
        const last24 = data.hourly.precipitation.slice(0, 24);
        acc24h = last24.reduce((sum: number, val: number) => sum + (val || 0), 0);
      }

      if (isMountedRef.current) {
        setRainRate(Math.max(0, currentRain));
        if (acc24h > 0) setRain24h(acc24h);
      }
    } catch (err) {
      console.warn("[Open-Meteo Rainfall Fetch Warning]", err);
    }
  }, []);

  // 2. Query spatial bounding box service and update road inundation predictions
  const updateViewportPredictions = useCallback(() => {
    if (!map || !map._loaded) return;

    try {
      const bounds = map.getBounds();
      if (!bounds) return;

      const south = bounds.getSouth();
      const west = bounds.getWest();
      const north = bounds.getNorth();
      const east = bounds.getEast();

      if (
        typeof south !== "number" || isNaN(south) ||
        typeof west !== "number" || isNaN(west) ||
        typeof north !== "number" || isNaN(north) ||
        typeof east !== "number" || isNaN(east)
      ) {
        return;
      }

      const center = map.getCenter();
      if (center && typeof center.lat === "number" && !isNaN(center.lat) && typeof center.lng === "number" && !isNaN(center.lng)) {
        fetchOpenMeteoRainfall(center.lat, center.lng);
      }

      // Query local spatial bounding box service for road segments in current viewport
      const visibleRoads = getRoadsInBBox([south, west, north, east], roadsData);

      // Run offline inundation prediction engine on returned roads
      const newPredictions = visibleRoads.map((road) =>
        predictRoadFloodRisk(road, rainRate, rain24h)
      );

      if (isMountedRef.current) {
        setPredictions(newPredictions);
      }
    } catch (err) {
      console.warn("[NOAHPredictedRoadsLayer Viewport Update Warning]", err);
    }
  }, [map, roadsData, rainRate, rain24h, fetchOpenMeteoRainfall]);

  // 3. Attach Leaflet map movement event listeners (`moveend`)
  useEffect(() => {
    if (!map || !map._loaded) return;

    updateViewportPredictions();

    const handleMoveEnd = () => {
      updateViewportPredictions();
    };

    map.on("moveend", handleMoveEnd);
    map.on("zoomend", handleMoveEnd);

    return () => {
      try {
        map.off("moveend", handleMoveEnd);
        map.off("zoomend", handleMoveEnd);
      } catch {}
    };
  }, [map, updateViewportPredictions]);

  // 4. Render painted Polyline vector layers with popups
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map || !map._loaded) return;

    let animFrameId: number | null = null;

    const renderLayers = () => {
      if (!map || !map._loaded) return;
      patchLeafletBounds(L);

      // Do not clear/re-add layers during active drag or zoom animation frames to prevent Leaflet pxBounds mismatch
      if (map._animating || map._zooming) return;

      try {
        if (!layerGroupRef.current) {
          layerGroupRef.current = L.layerGroup().addTo(map);
        } else {
          try {
            layerGroupRef.current.clearLayers();
          } catch {}
        }

        const layerGroup = layerGroupRef.current;

        predictions.forEach((pred) => {
          try {
            if (!pred.coordinates || pred.coordinates.length < 2) return;

            // Convert [lng, lat] GeoJSON coordinates to Leaflet [lat, lng] tuples
            const leafletLatLngs: [number, number][] = pred.coordinates
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

            if (leafletLatLngs.length < 2) return;

            // Paint colored Polyline vectors on the map with line weight 5–6 and opacity 0.85
            const polyline = L.polyline(leafletLatLngs, {
              color: pred.color,
              weight: pred.lineWeight,
              opacity: 0.85,
              lineCap: "round",
              lineJoin: "round",
              noClip: true,
            });

            // Format NOAH hazard level label
            const hazardText =
              pred.noahHazardLevel === 3
                ? "High (100-Yr Return)"
                : pred.noahHazardLevel === 2
                ? "Medium (25-Yr Return)"
                : pred.noahHazardLevel === 1
                ? "Low (5-Yr Return)"
                : "None / Safe";

            // Construct interactive Leaflet Popup displaying required metadata
            const popupHtml = `
              <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; color: #0f172a; min-width: 220px; max-width: 280px;">
                <div style="display: flex; items-center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                  <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #0f172a;">
                    ${pred.roadName}
                  </h3>
                  <span style="
                    font-size: 10px;
                    font-weight: 800;
                    padding: 3px 8px;
                    border-radius: 9999px;
                    background-color: ${pred.color};
                    color: #ffffff;
                    white-space: nowrap;
                  ">
                    ${pred.riskCategory}
                  </span>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 8px; font-size: 11px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
                    <span style="color: #64748b;">Calculated Depth:</span>
                    <strong style="font-size: 13px; color: ${pred.color}; font-family: monospace;">
                      ${pred.waterDepthCm} cm
                    </strong>
                  </div>
                  <div style="font-size: 10px; color: #475569;">(${pred.label})</div>
                </div>

                <div style="font-size: 11px; color: #334155; line-height: 1.5; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">NOAH Hazard Level:</span>
                    <strong style="color: #0f172a;">${hazardText}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">Elevation ASL:</span>
                    <span>${pred.elevationM.toFixed(1)} m</span>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">Local Rain Rate:</span>
                    <strong style="color: #0284c7;">${pred.rainMmHr.toFixed(1)} mm/hr</strong>
                  </div>
                </div>

                <div style="font-size: 10px; color: #475569;">
                  <strong style="color: #1e293b; display: block; margin-bottom: 2px;">Passable Vehicles:</strong>
                  <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${pred.passableVehicles
                      .map(
                        (v) => `
                      <span style="background-color: #e2e8f0; color: #1e293b; padding: 2px 6px; border-radius: 4px; font-weight: 600;">
                        🚗 ${v}
                      </span>`
                      )
                      .join("")}
                  </div>
                </div>
              </div>
            `;

            polyline.bindPopup(popupHtml);

            polyline.on("click", () => {
              if (onSelectRoad) {
                onSelectRoad(pred);
              }
            });

            polyline.addTo(layerGroup);
          } catch (itemErr) {
            // Suppress minor transient rendering warnings during drag transitions
          }
        });
      } catch (err) {
        console.warn("[NOAHPredictedRoadsLayer Render Error]", err);
      }
    };

    if (map && map.whenReady) {
      map.whenReady(() => {
        animFrameId = requestAnimationFrame(renderLayers);
      });
    } else {
      animFrameId = requestAnimationFrame(renderLayers);
    }

    return () => {
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
      }
      if (layerGroupRef.current) {
        try {
          layerGroupRef.current.clearLayers();
        } catch {}
      }
    };
  }, [map, predictions, onSelectRoad]);

  return null; // Pure Leaflet layer controller component
}
