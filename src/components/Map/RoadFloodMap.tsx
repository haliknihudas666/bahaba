"use client";

// ---------------------------------------------------------------------------
// Bahaba – Leaflet Map Component with Continuous OSRM Route & Flood Highlights
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { LiveStation } from "@/types";
import RoadFloodLayer from "./RoadFloodLayer";
import NOAHPredictedRoadsLayer from "./NOAHPredictedRoadsLayer";
import type { RoadRiskResult, GeoJSONLineStringFeature } from "@/lib/engine/roadRisk";
import type { RouteSegmentData } from "@/lib/engine/routeSolver";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

interface RoadFloodMapProps {
  /** Active PAGASA telemetry stations */
  stations: LiveStation[];
  /** Selected station ID for focus */
  selectedStationId?: string | null;
  /** Selected road risk metadata for focus & highlight */
  selectedRoad?: RoadRiskResult | null;
  /** Selected road risk metadata callback */
  onSelectRoad?: (road: RoadRiskResult) => void;
  /** Full continuous OSRM route polyline [lat, lng][] */
  fullRoutePolyline?: [number, number][];
  /** Sub-segment route highlights evaluated for flood risk */
  routeSegments?: RouteSegmentData[];
  /** Point A coordinates [lat, lng] */
  originCoords?: [number, number] | null;
  /** Point B coordinates [lat, lng] */
  destinationCoords?: [number, number] | null;
  /** Custom road features overlay */
  customRoads?: GeoJSONLineStringFeature[];
}

export default function RoadFloodMap({
  stations,
  selectedStationId,
  selectedRoad,
  onSelectRoad,
  fullRoutePolyline = [],
  routeSegments = [],
  originCoords,
  destinationCoords,
  customRoads,
}: RoadFloodMapProps) {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const routeLayerGroupRef = useRef<any>(null);
  const stationMarkersRef = useRef<Map<string, any>>(new Map());
  const [mapLoaded, setMapLoaded] = useState(false);

  // 1. Initialize Leaflet Map Instance with Canvas Renderer
  useEffect(() => {
    if (typeof window === "undefined" || !mapContainerRef.current) return;

    const initMap = () => {
      const L = (window as any).L;
      if (!L || leafletMapRef.current) return;
      patchLeafletBounds(L);

      const map = L.map(mapContainerRef.current, {
        center: [14.633, 121.095], // Metro Manila Pasig-Marikina River Basin center
        zoom: 12,
        zoomControl: true,
      });

      // Dark theme map tiles (CartoDB Dark Matter)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
        {
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
          subdomains: "abcd",
          maxZoom: 19,
          crossOrigin: true,
        }
      ).addTo(map);

      map.whenReady(() => {
        map.invalidateSize();
        routeLayerGroupRef.current = L.layerGroup().addTo(map);
        leafletMapRef.current = map;
        setMapLoaded(true);
      });
    };

    if ((window as any).L) {
      initMap();
    } else {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.integrity = "sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=";
      script.crossOrigin = "";
      script.onload = initMap;
      document.head.appendChild(script);
    }

    return () => {
      if (leafletMapRef.current) {
        try {
          if (routeLayerGroupRef.current) {
            routeLayerGroupRef.current.clearLayers();
          }
          stationMarkersRef.current.forEach((marker) => marker.remove());
          stationMarkersRef.current.clear();
          leafletMapRef.current.remove();
        } catch (err) {
          console.warn("[RoadFloodMap Teardown Warning]", err);
        } finally {
          leafletMapRef.current = null;
        }
      }
    };
  }, []);

  // 2. Render Telemetry Station Markers
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map || !mapLoaded || !map._loaded) return;

    const renderMarkers = () => {
      stationMarkersRef.current.forEach((marker) => marker.remove());
      stationMarkersRef.current.clear();

      stations.forEach((st) => {
        if (!st.latitude || !st.longitude || isNaN(st.latitude) || isNaN(st.longitude)) return;

        const isSelected = st.stationId === selectedStationId;
        const isHighRisk = st.riskLevel === "CRITICAL" || st.riskLevel === "ALARM";

        const pinColor =
          st.riskLevel === "CRITICAL"
            ? "#ef4444"
            : st.riskLevel === "ALARM"
              ? "#f97316"
              : st.riskLevel === "ALERT"
                ? "#eab308"
                : "#10b981";

        const customIcon = L.divIcon({
          className: "custom-station-icon",
          html: `
            <div style="position: relative; display: flex; align-items: center; justify-content: center;">
              ${isHighRisk
              ? `<div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background-color: ${pinColor}; opacity: 0.4; animation: ping 1.5s infinite;"></div>`
              : ""
            }
              <div style="
                width: ${isSelected ? "22px" : "16px"};
                height: ${isSelected ? "22px" : "16px"};
                border-radius: 50%;
                background-color: ${pinColor};
                border: 2px solid ${isSelected ? "#ffffff" : "#0f172a"};
                box-shadow: 0 0 10px ${pinColor};
                cursor: pointer;
              "></div>
            </div>
          `,
          iconSize: [24, 24],
          iconAnchor: [12, 12],
        });

        const marker = L.marker([st.latitude, st.longitude], { icon: customIcon })
          .addTo(map)
          .bindPopup(`
            <div style="font-family: sans-serif; padding: 4px; color: #0f172a; min-width: 180px;">
              <strong style="font-size: 13px;">🌊 ${st.stationName}</strong>
              <div style="font-size: 11px; margin-top: 4px; color: #334155;">
                <div>Water Level: <strong>${st.waterLevel.toFixed(2)} m</strong></div>
                <div>1h Delta: <strong>${st.waterLevelDelta1h >= 0 ? "+" : ""}${st.waterLevelDelta1h.toFixed(2)} m</strong></div>
                <div>Status: <span style="font-weight: 700; color: ${pinColor};">${st.riskLevel}</span></div>
              </div>
            </div>
          `);

        stationMarkersRef.current.set(st.stationId, marker);
      });
    };

    map.whenReady(renderMarkers);
  }, [stations, selectedStationId, mapLoaded]);

  const selectedRoadMarkerRef = useRef<any>(null);

  // 2B. Focus on Selected Road Corridor with smooth camera flyTo and radar beacon
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map || !mapLoaded || !map._loaded) return;

    if (selectedRoadMarkerRef.current) {
      try {
        selectedRoadMarkerRef.current.remove();
      } catch {}
      selectedRoadMarkerRef.current = null;
    }

    if (selectedRoad?.centroid) {
      const [lat, lng] = selectedRoad.centroid;
      if (typeof lat === "number" && typeof lng === "number" && !isNaN(lat) && !isNaN(lng)) {
        try {
          map.flyTo([lat, lng], 15, {
            animate: true,
            duration: 0.8,
          });

          const beaconIcon = L.divIcon({
            className: "custom-road-focus-marker",
            html: `
              <div style="position: relative; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 50px; height: 50px; border-radius: 50%; background-color: ${selectedRoad.color}; opacity: 0.4; animation: ping 1.5s infinite;"></div>
                <div style="
                  background-color: #0f172a;
                  color: #ffffff;
                  border: 2px solid ${selectedRoad.color};
                  font-weight: 800;
                  font-size: 11px;
                  padding: 4px 8px;
                  border-radius: 9999px;
                  box-shadow: 0 4px 14px rgba(0,0,0,0.6);
                  white-space: nowrap;
                  display: flex;
                  align-items: center;
                  gap: 4px;
                ">
                  <span>🛣️</span>
                  <span style="color: ${selectedRoad.color};">${selectedRoad.estimatedDepthCm} cm</span>
                </div>
              </div>
            `,
            iconSize: [60, 30],
            iconAnchor: [30, 15],
          });

          const marker = L.marker([lat, lng], { icon: beaconIcon, zIndexOffset: 1000 }).addTo(map);
          selectedRoadMarkerRef.current = marker;
        } catch (err) {
          console.warn("[RoadFocus flyTo error]", err);
        }
      }
    }
  }, [selectedRoad, mapLoaded]);

  const lastFittedKeyRef = useRef<string>("");

  // 3. Render Continuous OSRM Route Polyline & Flooded Segment Highlights
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMapRef.current;
    if (!L || !map || !mapLoaded || !map._loaded || !routeLayerGroupRef.current) return;

    const renderRoute = () => {
      try {
        patchLeafletBounds(L);
        const routeGroup = routeLayerGroupRef.current;
        if (!routeGroup || !map._loaded) return;

        try {
          map.invalidateSize();
        } catch {}

        routeGroup.clearLayers();

        const bounds: [number, number][] = [];

        // A. Render Base Driving Route Casing & Polyline
        if (fullRoutePolyline && fullRoutePolyline.length >= 2) {
          const validFullCoords = fullRoutePolyline.filter(
            (c) =>
              Array.isArray(c) &&
              c.length === 2 &&
              typeof c[0] === "number" &&
              !isNaN(c[0]) &&
              isFinite(c[0]) &&
              Math.abs(c[0]) <= 90 &&
              typeof c[1] === "number" &&
              !isNaN(c[1]) &&
              isFinite(c[1]) &&
              Math.abs(c[1]) <= 180
          );

          if (validFullCoords.length >= 2) {
            validFullCoords.forEach((c) => bounds.push(c));

            // Outer Casing (Border)
            L.polyline(validFullCoords, {
              color: "#0f172a",
              weight: 9,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round",
              noClip: true,
            }).addTo(routeGroup);

            // Base Driving Blue Polyline (Google Maps Style)
            L.polyline(validFullCoords, {
              color: "#2563eb", // Google Maps Driving Blue
              weight: 6,
              opacity: 0.9,
              lineCap: "round",
              lineJoin: "round",
              noClip: true,
            }).addTo(routeGroup);
          }
        }

        // B. Highlight Flooded Sub-Segments directly ON TOP of the driving polyline
        if (routeSegments && routeSegments.length > 0) {
          routeSegments.forEach((segment) => {
            if (!segment.coordinates || segment.coordinates.length < 2) return;

            const validCoords = segment.coordinates.filter(
              (c) =>
                Array.isArray(c) &&
                c.length === 2 &&
                typeof c[0] === "number" &&
                !isNaN(c[0]) &&
                isFinite(c[0]) &&
                Math.abs(c[0]) <= 90 &&
                typeof c[1] === "number" &&
                !isNaN(c[1]) &&
                isFinite(c[1]) &&
                Math.abs(c[1]) <= 180
            );
            if (validCoords.length < 2) return;

            validCoords.forEach((c) => bounds.push(c));

            // Only draw highlighted overlay if there is a flood alert/warning (>5 cm)
            if (segment.depthCm > 5) {
              const isCritical = segment.severity === "CRITICAL";
              const isAlarm = segment.severity === "ALARM";

              // Flooded Highlight Overlay Polyline
              const highlightPolyline = L.polyline(validCoords, {
                color: segment.color,
                weight: isCritical ? 9 : isAlarm ? 8 : 7,
                opacity: 0.95,
                dashArray: isCritical ? "8, 10" : undefined,
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              });

              const passableTags = (segment.passableVehicles || [])
                .map((v) => `<span style="background-color: #f1f5f9; color: #1e293b; padding: 2px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">🚗 ${v}</span>`)
                .join(" ");

              const popupHtml = `
              <div style="font-family: system-ui, -apple-system, sans-serif; padding: 8px; color: #0f172a; min-width: 220px; max-width: 280px;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
                  <strong style="font-size: 13px; color: #0f172a;">⚠️ Route Flood Inundation</strong>
                  <span style="font-size: 10px; font-weight: 800; padding: 2px 7px; border-radius: 9999px; background-color: ${segment.color}; color: #ffffff;">
                    ${segment.severity}
                  </span>
                </div>

                <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 6px 8px; margin-bottom: 6px; font-size: 11px;">
                  <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
                    <span style="color: #64748b;">Predicted Water Depth:</span>
                    <strong style="font-size: 13px; color: ${segment.color}; font-family: monospace;">
                      ${segment.depthCm} cm
                    </strong>
                  </div>
                  <div style="font-size: 10px; color: #64748b;">(${segment.depthCategory || "Calculated Inundation"})</div>
                </div>

                <div style="font-size: 11px; color: #334155; line-height: 1.5; border-bottom: 1px dashed #e2e8f0; padding-bottom: 6px; margin-bottom: 6px;">
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">Road Elevation:</span>
                    <strong>${segment.elevationM !== undefined ? `${segment.elevationM.toFixed(1)} m ASL` : "DEM Model"}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">Rainfall Intensity:</span>
                    <strong style="color: #0284c7;">${segment.rainMmHr !== undefined ? `${segment.rainMmHr.toFixed(1)} mm/hr` : "Live Telemetry"}</strong>
                  </div>
                  <div style="display: flex; justify-content: space-between;">
                    <span style="color: #64748b;">Telemetry Station:</span>
                    <span style="font-size: 10px;">${segment.nearestStationName} (${segment.nearestStationDistanceKm} km)</span>
                  </div>
                </div>

                ${passableTags ? `
                <div style="font-size: 10px;">
                  <span style="color: #64748b; font-weight: 600; display: block; margin-bottom: 3px;">Passable Vehicles:</span>
                  <div style="display: flex; flex-wrap: wrap; gap: 4px;">
                    ${passableTags}
                  </div>
                </div>` : ""}
              </div>
            `;

              highlightPolyline.bindPopup(popupHtml);
              highlightPolyline.addTo(routeGroup);
            }
          });
        }

        // C. Render Point A (Origin) Pin
        if (originCoords && !isNaN(originCoords[0]) && !isNaN(originCoords[1])) {
          bounds.push(originCoords);
          const originIcon = L.divIcon({
            className: "custom-pin-a",
            html: `
            <div style="position: relative; display: flex; items-center; justify-content: center;">
              <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: #3b82f6; opacity: 0.3; animation: ping 2s infinite;"></div>
              <div style="background-color: #2563eb; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; border: 3px solid white; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.6);">
                A
              </div>
            </div>
          `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker(originCoords, { icon: originIcon })
            .addTo(routeGroup)
            .bindPopup("<strong>📍 Point A (Origin)</strong>");
        }

        // D. Render Point B (Destination) Pin
        if (destinationCoords && !isNaN(destinationCoords[0]) && !isNaN(destinationCoords[1])) {
          bounds.push(destinationCoords);
          const destIcon = L.divIcon({
            className: "custom-pin-b",
            html: `
            <div style="position: relative; display: flex; items-center; justify-content: center;">
              <div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: #ef4444; opacity: 0.3; animation: ping 2s infinite;"></div>
              <div style="background-color: #dc2626; color: white; width: 30px; height: 30px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 13px; border: 3px solid white; box-shadow: 0 4px 12px rgba(220, 38, 38, 0.6);">
                B
              </div>
            </div>
          `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker(destinationCoords, { icon: destIcon })
            .addTo(routeGroup)
            .bindPopup("<strong>🎯 Point B (Destination)</strong>");
        }

        // E. Auto Fit Bounds ONLY when route or coordinates change (initial focus)
        const routeKey = `${originCoords?.join(",")}-${destinationCoords?.join(",")}-${fullRoutePolyline?.length}`;

        if (bounds.length > 0 && lastFittedKeyRef.current !== routeKey) {
          const validBounds = bounds.filter(
            (c) =>
              Array.isArray(c) &&
              c.length === 2 &&
              typeof c[0] === "number" &&
              !isNaN(c[0]) &&
              isFinite(c[0]) &&
              Math.abs(c[0]) <= 90 &&
              typeof c[1] === "number" &&
              !isNaN(c[1]) &&
              isFinite(c[1]) &&
              Math.abs(c[1]) <= 180
          );

          if (validBounds.length > 0 && map && map._loaded) {
            try {
              map.fitBounds(validBounds, { padding: [50, 50], maxZoom: 15 });
              lastFittedKeyRef.current = routeKey;
            } catch (e) {
              console.warn("[RoadFloodMap fitBounds warning]", e);
            }
          }
        }
      } catch (err) {
        console.warn("[RoadFloodMap renderRoute warning]", err);
      }
    };

    map.whenReady(renderRoute);
  }, [fullRoutePolyline, routeSegments, originCoords, destinationCoords, mapLoaded]);

  return (
    <div id="bahaba-interactive-map" className="relative w-full h-full min-h-[460px] rounded-2xl overflow-hidden border border-slate-800 shadow-2xl bg-slate-950">
      {/* Map Container */}
      <div ref={mapContainerRef} className="w-full h-full min-h-[460px] z-0" />

      {/* Embedded Road Flood Overlay & NOAH BBox Vector Layer */}
      {mapLoaded && leafletMapRef.current && (
        <>
          <RoadFloodLayer
            map={leafletMapRef.current}
            stations={stations}
            roads={customRoads}
            onSelectRoad={onSelectRoad}
          />
          <NOAHPredictedRoadsLayer map={leafletMapRef.current} />
        </>
      )}

      {/* Dynamic Map Legend Overlay */}
      <div className="absolute bottom-4 left-4 z-[400] bg-slate-900/90 backdrop-blur-md border border-slate-800 p-3 rounded-xl shadow-xl text-xs space-y-1.5 min-w-[210px]">
        <div className="font-semibold text-slate-300 uppercase tracking-wider text-[10px] mb-1">
          Route Flood Highlight Legend
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-[#2563eb] shadow-sm"></span>
          <span className="text-slate-300">Clear Route (0–5 cm)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-[#f97316] shadow-sm"></span>
          <span className="text-slate-300">Gutter Deep (6–15 cm)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-[#ef4444] shadow-sm"></span>
          <span className="text-slate-300">Half-Tire Deep (16–30 cm)</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-4 h-1.5 rounded-full bg-[#7f1d1d] shadow-sm"></span>
          <span className="text-slate-300">Waist Deep+ (&gt;30 cm)</span>
        </div>
      </div>

      <style jsx global>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .custom-station-icon, .custom-pin-a, .custom-pin-b {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          background: #ffffff !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.4) !important;
        }
        .leaflet-popup-tip {
          background: #ffffff !important;
        }
      `}</style>
    </div>
  );
}
