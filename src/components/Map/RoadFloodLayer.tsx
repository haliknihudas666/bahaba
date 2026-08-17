"use client";

// ---------------------------------------------------------------------------
// Bahaba – Leaflet Road Flood Prediction Polyline Layer Component
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState, useCallback } from "react";
import type { LiveStation } from "@/types";
import {
  calculateRoadRisk,
  type GeoJSONLineStringFeature,
  type RoadRiskResult,
} from "@/lib/engine/roadRisk";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

interface RoadFloodLayerProps {
  /** Map instance reference from window.L */
  map: any;
  /** Active PAGASA telemetry stations */
  stations: LiveStation[];
  /** Custom road features */
  roads?: GeoJSONLineStringFeature[];
  /** Callback when a user clicks a road polyline segment */
  onSelectRoad?: (riskResult: RoadRiskResult) => void;
}

export default function RoadFloodLayer({
  map,
  stations,
  roads = [],
  onSelectRoad,
}: RoadFloodLayerProps) {
  const layerGroupRef = useRef<any>(null);
  const snappedGeometriesRef = useRef<Map<string, [number, number][]>>(new Map());
  const isMountedRef = useRef<boolean>(true);
  const [, forceUpdate] = useState({});

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  // Asynchronously snap a road corridor to exact OSRM road network geometry
  const snapRoadToOSRM = useCallback(async (road: GeoJSONLineStringFeature) => {
    const id = road.properties?.id || road.properties?.name;
    if (!id || snappedGeometriesRef.current.has(id)) return;

    const rawCoords = road.geometry.coordinates;
    let coords: number[][] = [];
    if (Array.isArray(rawCoords[0]) && typeof rawCoords[0][0] === "number") {
      coords = rawCoords as number[][];
    } else if (Array.isArray(rawCoords[0])) {
      coords = (rawCoords as number[][][])[0];
    }

    if (coords.length < 2) return;

    const start = coords[0]; // [lng, lat]
    const end = coords[coords.length - 1]; // [lng, lat]

    try {
      const url = `https://router.project-osrm.org/route/v1/driving/${start[0]},${start[1]};${end[0]},${end[1]}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      if (!res.ok) return;

      const data = await res.json();
      if (data.code === "Ok" && data.routes?.[0]?.geometry?.coordinates) {
        const rawOsrm = data.routes[0].geometry.coordinates;
        // Strictly sanitize returned OSRM [lng, lat] pairs -> convert to [lat, lng]
        const validOsrmLatLngs: [number, number][] = rawOsrm
          .filter(
            (pt: any) =>
              Array.isArray(pt) &&
              pt.length >= 2 &&
              typeof pt[0] === "number" &&
              !isNaN(pt[0]) &&
              isFinite(pt[0]) &&
              Math.abs(pt[0]) <= 180 &&
              typeof pt[1] === "number" &&
              !isNaN(pt[1]) &&
              isFinite(pt[1]) &&
              Math.abs(pt[1]) <= 90
          )
          .map(([lng, lat]: [number, number]) => [lat, lng]);

        if (validOsrmLatLngs.length >= 2 && isMountedRef.current) {
          snappedGeometriesRef.current.set(id, validOsrmLatLngs);
          forceUpdate({}); // Trigger layer re-render with snapped road geometry
        }
      }
    } catch {
      // Fallback silently to baseline road geometry
    }
  }, []);

  useEffect(() => {
    // Initiate background OSRM road snapping for all road corridors
    roads.forEach((road) => {
      snapRoadToOSRM(road);
    });
  }, [roads, snapRoadToOSRM]);

  useEffect(() => {
    const L = (window as any).L;

    // Safety Guard: Ensure Leaflet map is fully initialized and bounds ready before rendering polylines
    if (!L || !map || !map._loaded) return;

    const renderLayers = () => {
      if (!map || !map._loaded) return;
      patchLeafletBounds(L);

      try {
        // Ensure layer group exists and is attached to active map
        if (!layerGroupRef.current) {
          layerGroupRef.current = L.layerGroup().addTo(map);
        } else {
          layerGroupRef.current.clearLayers();
        }

        const layerGroup = layerGroupRef.current;

        roads.forEach((road) => {
          const id = road.properties?.id || road.properties?.name;

          // 1. Calculate spatial risk using Turf-compatible engine
          const risk = calculateRoadRisk(road, stations);

          let rawLatLngs: [number, number][] = [];

          if (id && snappedGeometriesRef.current.has(id)) {
            rawLatLngs = snappedGeometriesRef.current.get(id) || [];
          } else {
            // Extract fallback coordinates: [lng, lat] to Leaflet [lat, lng]
            const rawCoords = road.geometry.coordinates;

            if (Array.isArray(rawCoords[0]) && typeof rawCoords[0][0] === "number") {
              rawLatLngs = (rawCoords as number[][]).map(([lng, lat]) => [lat, lng]);
            } else if (Array.isArray(rawCoords[0])) {
              rawLatLngs = (rawCoords as number[][][])[0].map(([lng, lat]) => [lat, lng]);
            }
          }

          // Strict coordinate sanitization (valid lat [-90,90] and lng [-180,180])
          const validLatLngs = rawLatLngs.filter(
            (pt) =>
              Array.isArray(pt) &&
              pt.length === 2 &&
              typeof pt[0] === "number" &&
              !isNaN(pt[0]) &&
              isFinite(pt[0]) &&
              Math.abs(pt[0]) <= 90 &&
              typeof pt[1] === "number" &&
              !isNaN(pt[1]) &&
              isFinite(pt[1]) &&
              Math.abs(pt[1]) <= 180
          );

          if (validLatLngs.length < 2) return;

          // 2. Dynamic Polyline Styling (Traffic Severity Palette)
          const polyline = L.polyline(validLatLngs, {
            color: risk.color,
            weight: risk.lineWeight,
            opacity: 0.9,
            lineCap: "round",
            lineJoin: "round",
            noClip: true,
          });

          // 3. Interactive Popup Construction
          const severityBg = risk.color;
          const floodModeLabel = risk.isNearRiver ? "🏞️ Riverbank Zone" : "🏙️ Urban Surface";
          const floodModeColor = risk.isNearRiver ? "#3b82f6" : "#6b7280";

          const popupHtml = `
            <div style="font-family: system-ui, -apple-system, sans-serif; padding: 6px; color: #0f172a; min-width: 240px; max-width: 300px;">
              <!-- Header -->
              <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                <div>
                  <h3 style="font-size: 14px; font-weight: 700; margin: 0; color: #0f172a; line-height: 1.3;">
                    ${risk.roadName}
                  </h3>
                  <p style="font-size: 11px; color: #64748b; margin: 2px 0 0 0;">
                    Elevation: ${risk.elevationMeters.toFixed(1)}m EL.m
                  </p>
                </div>
                <span style="
                  font-size: 10px;
                  font-weight: 800;
                  padding: 3px 8px;
                  border-radius: 9999px;
                  background-color: ${severityBg};
                  color: #ffffff;
                  letter-spacing: 0.05em;
                  white-space: nowrap;
                  box-shadow: 0 2px 4px rgba(0,0,0,0.15);
                ">
                  ${risk.severity}
                </span>
              </div>

              <!-- Flood Mode Badge -->
              <div style="margin-bottom: 8px;">
                <span style="font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 9999px; background-color: ${floodModeColor}; color: #ffffff;">
                  ${floodModeLabel}
                </span>
              </div>

              <!-- Hydro Metrics Grid -->
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px; margin-bottom: 8px; display: grid; grid-template-columns: 1fr 1fr; gap: 6px; font-size: 11px;">
                <div>
                  <span style="color: #64748b; display: block; font-size: 10px;">ESTIMATED DEPTH</span>
                  <strong style="font-size: 13px; color: ${risk.color}; font-family: monospace;">
                    ${risk.estimatedDepthCm} cm
                  </strong>
                  <span style="font-size: 10px; color: #475569; display: block;">(${risk.depthCategory})</span>
                </div>
                <div>
                  <span style="color: #64748b; display: block; font-size: 10px;">HAZARD SCORE</span>
                  <strong style="font-size: 13px; color: #1e293b; font-family: monospace;">
                    ${risk.hazardScore}/100
                  </strong>
                  <span style="font-size: 10px; color: #475569; display: block;">Rainfall Risk</span>
                </div>
              </div>

              <!-- Telemetry Station Info (Rainfall-focused) -->
              <div style="font-size: 11px; color: #334155; margin-bottom: 8px; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px;">
                <div style="display: flex; justify-content: space-between;">
                  <span style="color: #64748b;">Nearest Station:</span>
                  <strong style="color: #0f172a;">${risk.nearestStation.stationName}</strong>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span style="color: #64748b;">Distance:</span>
                  <span>${risk.nearestStation.distanceKm} km</span>
                </div>
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span style="color: #64748b;">Rainfall (1h):</span>
                  <strong style="color: ${risk.nearestStation.rain1h > 15 ? '#ef4444' : risk.nearestStation.rain1h > 7.5 ? '#f97316' : '#10b981'};">
                    ${risk.nearestStation.rain1h} mm/hr
                  </strong>
                </div>
                ${risk.isNearRiver ? `
                <div style="display: flex; justify-content: space-between; margin-top: 2px;">
                  <span style="color: #64748b;">River Level Rise:</span>
                  <span>${risk.nearestStation.delta1h >= 0 ? "+" : ""}${risk.nearestStation.delta1h.toFixed(2)} m/hr</span>
                </div>
                ` : ''}
              </div>

              <!-- Drivability Info -->
              <div style="font-size: 10px; color: #475569;">
                <strong style="color: #1e293b; display: block; margin-bottom: 2px;">Passable By:</strong>
                <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                  ${risk.drivableVehicles
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

          // 4. Hover & Click Interactivity
          polyline.on("mouseover", () => {
            polyline.setStyle({
              weight: risk.lineWeight + 3,
              opacity: 1.0,
            });
          });

          polyline.on("mouseout", () => {
            polyline.setStyle({
              weight: risk.lineWeight,
              opacity: 0.9,
            });
          });

          polyline.on("click", () => {
            if (onSelectRoad) {
              onSelectRoad(risk);
            }
          });

          polyline.addTo(layerGroup);
        });
      } catch (err) {
        console.warn("[RoadFloodLayer render error]", err);
      }
    };

    map.whenReady(renderLayers);

    return () => {
      if (layerGroupRef.current) {
        try {
          layerGroupRef.current.clearLayers();
        } catch {
          // Ignore cleanup errors during unmount
        }
      }
    };
  }, [map, stations, roads, onSelectRoad]);

  return null; // Pure Leaflet layer manager component
}


