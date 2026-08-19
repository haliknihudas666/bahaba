"use client";

// ---------------------------------------------------------------------------
// Bahaba – Leaflet Map Component with Continuous OSRM Route & Flood Highlights
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { LiveStation } from "@/types";
import PMTilesFloodRoadsLayer from "./PMTilesFloodRoadsLayer";
import NOAHFloodHazardLayer from "./NOAHFloodHazardLayer";
import FloodHeatmapLayer from "./FloodHeatmapLayer";
import type { RoadRiskResult, GeoJSONLineStringFeature } from "@/lib/engine/roadRisk";
import type { RouteSegmentData, TravelMode } from "@/lib/engine/routeSolver";
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
  /** Travel mode: driving or walking */
  travelMode?: TravelMode;
  /** Trigger integer to recenter map to Metro Manila default center */
  recenterTrigger?: number;
  /** Flood Heatmap overlay active state */
  showHeatmap?: boolean;
  /** UP NOAH Hazard PMTiles overlay active state */
  showHazard?: boolean;
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
  travelMode = "driving",
  recenterTrigger = 0,
  showHeatmap = true,
  showHazard = false,
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
        zoomControl: false,
      });

      // Add Zoom control at bottomright
      L.control.zoom({ position: "bottomright" }).addTo(map);

      // Dark theme map tiles with NO labels or road markings (CartoDB Dark Matter No Labels)
      L.tileLayer(
        "https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png",
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

  // Handle ResizeObserver on map container to keep tiles sharp
  useEffect(() => {
    if (!mapContainerRef.current) return;
    const observer = new ResizeObserver(() => {
      if (leafletMapRef.current && mapLoaded) {
        try {
          leafletMapRef.current.invalidateSize();
        } catch {}
      }
    });
    observer.observe(mapContainerRef.current);
    return () => observer.disconnect();
  }, [mapLoaded]);

  // Recenter trigger effect
  useEffect(() => {
    if (recenterTrigger > 0 && leafletMapRef.current && mapLoaded) {
      try {
        leafletMapRef.current.flyTo([14.633, 121.095], 12, { animate: true, duration: 0.8 });
      } catch (err) {
        console.warn("[RoadFloodMap recenter error]", err);
      }
    }
  }, [recenterTrigger, mapLoaded]);

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

  // FlyTo selected station when selectedStationId changes
  useEffect(() => {
    if (!selectedStationId || !leafletMapRef.current || !mapLoaded) return;
    const marker = stationMarkersRef.current.get(selectedStationId);
    if (marker) {
      const latLng = marker.getLatLng();
      leafletMapRef.current.flyTo(latLng, 14, { animate: true, duration: 0.8 });
      marker.openPopup();
    } else {
      const st = stations.find((s) => s.stationId === selectedStationId);
      if (st && st.latitude && st.longitude) {
        leafletMapRef.current.flyTo([st.latitude, st.longitude], 14, { animate: true, duration: 0.8 });
      }
    }
  }, [selectedStationId, mapLoaded, stations]);

  const selectedRoadMarkerRef = useRef<any>(null);

  // 2B. Focus on Selected Road Corridor
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
        const isWalking = travelMode === "walking";

        // A. Render Base Route Casing & Polyline
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

            if (isWalking) {
              L.polyline(validFullCoords, {
                color: "#022c22",
                weight: 8,
                opacity: 0.9,
                dashArray: "10, 8",
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              }).addTo(routeGroup);

              L.polyline(validFullCoords, {
                color: "#06b6d4",
                weight: 5,
                opacity: 0.95,
                dashArray: "6, 6",
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              }).addTo(routeGroup);
            } else {
              L.polyline(validFullCoords, {
                color: "#0f172a",
                weight: 9,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              }).addTo(routeGroup);

              L.polyline(validFullCoords, {
                color: "#2563eb",
                weight: 6,
                opacity: 0.9,
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              }).addTo(routeGroup);
            }
          }
        }

        // B. Highlight Flooded Sub-Segments directly ON TOP of the polyline
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

            if (validCoords.length >= 2) {
              const segPolyline = L.polyline(validCoords, {
                color: segment.color,
                weight: segment.severity === "CRITICAL" ? 9 : segment.severity === "ALARM" ? 8 : 7,
                opacity: 0.95,
                lineCap: "round",
                lineJoin: "round",
                noClip: true,
              }).addTo(routeGroup);

              segPolyline.bindPopup(`
                <div style="font-family: sans-serif; padding: 4px; color: #0f172a; min-width: 190px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <strong style="font-size: 13px;">🌊 Flooded Segment</strong>
                    <span style="
                      background: ${segment.color};
                      color: #ffffff;
                      font-size: 10px;
                      font-weight: 800;
                      padding: 2px 6px;
                      border-radius: 9999px;
                    ">${segment.severity}</span>
                  </div>
                  <div style="font-size: 11px; margin-top: 6px; color: #334155;">
                    <div>Estimated Depth: <strong style="color: ${segment.color};">${segment.depthCm} cm</strong> (${segment.depthCategory})</div>
                    <div>Elevation: <strong>${segment.elevationM.toFixed(1)} m</strong></div>
                    <div>1h Rain at Station: <strong>${segment.rainMmHr} mm/h</strong></div>
                    <div>Nearest Station: <strong>${segment.nearestStationName}</strong> (${segment.nearestStationDistanceKm} km)</div>
                  </div>
                </div>
              `);
            }
          });
        }

        // C. Render Start Marker (Point A)
        if (originCoords && Array.isArray(originCoords) && originCoords.length === 2 && !isNaN(originCoords[0]) && !isNaN(originCoords[1])) {
          bounds.push(originCoords);
          const pinA = L.divIcon({
            className: "custom-pin-a",
            html: `
              <div style="
                background: linear-gradient(135deg, #10b981, #059669);
                color: #ffffff;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 900;
                font-size: 14px;
                border: 3px solid #ffffff;
                box-shadow: 0 4px 14px rgba(0,0,0,0.5);
              ">A</div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker(originCoords, { icon: pinA, zIndexOffset: 500 })
            .addTo(routeGroup)
            .bindPopup(`<strong>📍 Point A (${isWalking ? "Start Walking" : "Origin"})</strong>`);
        }

        // D. Render Destination Marker (Point B)
        if (destinationCoords && Array.isArray(destinationCoords) && destinationCoords.length === 2 && !isNaN(destinationCoords[0]) && !isNaN(destinationCoords[1])) {
          bounds.push(destinationCoords);
          const pinB = L.divIcon({
            className: "custom-pin-b",
            html: `
              <div style="
                background: linear-gradient(135deg, #ef4444, #dc2626);
                color: #ffffff;
                width: 32px;
                height: 32px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                font-weight: 900;
                font-size: 14px;
                border: 3px solid #ffffff;
                box-shadow: 0 4px 14px rgba(0,0,0,0.5);
              ">B</div>
            `,
            iconSize: [32, 32],
            iconAnchor: [16, 16],
          });
          L.marker(destinationCoords, { icon: pinB, zIndexOffset: 500 })
            .addTo(routeGroup)
            .bindPopup(`<strong>🎯 Point B (${isWalking ? "Walking Destination" : "Destination"})</strong>`);
        }

        // E. Auto Fit Bounds ONLY when route or coordinates change (initial focus)
        const routeKey = `${travelMode}-${originCoords?.join(",")}-${destinationCoords?.join(",")}-${fullRoutePolyline?.length}`;

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
              map.fitBounds(validBounds, { padding: [80, 80], maxZoom: 15 });
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
  }, [fullRoutePolyline, routeSegments, originCoords, destinationCoords, travelMode, mapLoaded]);

  return (
    <div id="bahaba-interactive-map" className="relative w-full h-full min-h-full overflow-hidden bg-slate-950">
      {/* Map Canvas */}
      <div ref={mapContainerRef} className="w-full h-full min-h-full z-0" />

      {/* Embedded Road Flood Overlay & NOAH BBox Vector Layer */}
      {mapLoaded && leafletMapRef.current && (
        <>
          <FloodHeatmapLayer
            map={leafletMapRef.current}
            stations={stations}
            visible={showHeatmap}
          />
          <NOAHFloodHazardLayer
            map={leafletMapRef.current}
            visible={showHazard}
          />
          <PMTilesFloodRoadsLayer
            map={leafletMapRef.current}
            visible={true}
            stations={stations}
          />
        </>
      )}

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
        .leaflet-bottom.leaflet-right {
          margin: 0 !important;
          bottom: 0 !important;
          right: 0 !important;
          display: flex !important;
          flex-direction: column !important;
          align-items: flex-end !important;
          pointer-events: none !important;
        }
        .leaflet-control-zoom {
          margin-right: 12px !important;
          margin-bottom: 60px !important;
          border: 1px solid rgba(51, 65, 85, 0.8) !important;
          border-radius: 14px !important;
          overflow: hidden !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
          pointer-events: auto !important;
        }
        .leaflet-control-zoom-in, .leaflet-control-zoom-out {
          background-color: rgba(15, 23, 42, 0.92) !important;
          color: #f1f5f9 !important;
          border-bottom: 1px solid rgba(51, 65, 85, 0.8) !important;
          width: 32px !important;
          height: 32px !important;
          line-height: 32px !important;
        }
        .leaflet-control-zoom-in:hover, .leaflet-control-zoom-out:hover {
          background-color: rgba(30, 41, 59, 1) !important;
          color: #38bdf8 !important;
        }
        .leaflet-control-attribution {
          margin: 0 !important;
          padding: 2px 8px !important;
          background: rgba(2, 6, 23, 0.85) !important;
          color: #64748b !important;
          backdrop-filter: blur(8px) !important;
          border-top-left-radius: 6px !important;
          font-size: 9px !important;
          line-height: 1.3 !important;
          pointer-events: auto !important;
        }
        .leaflet-control-attribution a {
          color: #94a3b8 !important;
          text-decoration: none !important;
        }
        .leaflet-control-attribution a:hover {
          text-decoration: underline !important;
        }
      `}</style>
    </div>
  );
}
