"use client";

// ---------------------------------------------------------------------------
// Bahaba – Interactive Metro Manila Hydrological Leaflet Map
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { LiveStation } from "@/types";

interface FloodMapProps {
  stations: LiveStation[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  userLocation?: { lat: number; lng: number } | null;
}

const RISK_COLORS: Record<string, { bg: string; border: string; hex: string }> = {
  CRITICAL: { bg: "#ef4444", border: "#b91c1c", hex: "#ef4444" },
  ALARM:    { bg: "#f97316", border: "#c2410c", hex: "#f97316" },
  ALERT:    { bg: "#eab308", border: "#a16207", hex: "#eab308" },
  NORMAL:   { bg: "#10b981", border: "#047857", hex: "#10b981" },
  UNKNOWN:  { bg: "#64748b", border: "#334155", hex: "#64748b" },
};

export default function FloodMap({
  stations,
  selectedStationId,
  onSelectStation,
  userLocation,
}: FloodMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMap = useRef<any>(null);
  const markersRef = useRef<Map<string, any>>(new Map());

  useEffect(() => {
    if (typeof window === "undefined" || !mapRef.current) return;

    // Dynamically load Leaflet JS script if not already present
    const initMap = () => {
      const L = (window as any).L;
      if (!L) return;

      if (!leafletMap.current && mapRef.current) {
        // Center on Metro Manila / Marikina River basin (14.633, 121.095)
        const map = L.map(mapRef.current, {
          center: [14.633, 121.095],
          zoom: 12,
          zoomControl: true,
        });

        // Dark theme tile layer (CartoDB Dark Matter)
        L.tileLayer(
          "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png",
          {
            attribution:
              '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
            subdomains: "abcd",
            maxZoom: 19,
          },
        ).addTo(map);

        leafletMap.current = map;
      }
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
      if (leafletMap.current) {
        leafletMap.current.remove();
        leafletMap.current = null;
      }
    };
  }, []);

  // Update station markers whenever stations array changes
  useEffect(() => {
    const L = (window as any).L;
    const map = leafletMap.current;
    if (!L || !map) return;

    // Clear existing markers
    markersRef.current.forEach((marker) => marker.remove());
    markersRef.current.clear();

    stations.forEach((st) => {
      if (!st.latitude || !st.longitude) return;

      const colors = RISK_COLORS[st.riskLevel] || RISK_COLORS.UNKNOWN;
      const isSelected = st.stationId === selectedStationId;
      const isCriticalOrAlarm = st.riskLevel === "CRITICAL" || st.riskLevel === "ALARM";

      // Custom HTML marker pin with pulse effect for high risk
      const customIcon = L.divIcon({
        className: "custom-station-marker",
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            ${
              isCriticalOrAlarm
                ? `<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: ${colors.hex}; opacity: 0.4; animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>`
                : ""
            }
            <div style="
              width: ${isSelected ? "24px" : "18px"};
              height: ${isSelected ? "24px" : "18px"};
              border-radius: 50%;
              background-color: ${colors.bg};
              border: 3px solid ${isSelected ? "#ffffff" : colors.border};
              box-shadow: 0 0 10px ${colors.hex};
              transition: all 0.2s ease;
              cursor: pointer;
            "></div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });

      const popupContent = `
        <div style="font-family: sans-serif; padding: 4px; color: #0f172a; min-width: 180px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <strong style="font-size: 14px; font-weight: 700;">${st.stationName}</strong>
            <span style="
              font-size: 10px;
              font-weight: 800;
              padding: 2px 6px;
              border-radius: 9999px;
              background-color: ${colors.bg};
              color: #ffffff;
            ">${st.riskLevel}</span>
          </div>
          <div style="font-size: 12px; line-height: 1.5; color: #334155;">
            <div>💧 Water Level: <strong>${st.waterLevel.toFixed(2)} m</strong></div>
            <div>📉 1h Delta: <strong>${st.waterLevelDelta1h >= 0 ? "+" : ""}${st.waterLevelDelta1h.toFixed(2)} m</strong></div>
            <div>🌧️ 24h Rain: <strong>${st.rain24h.toFixed(1)} mm</strong></div>
            <div style="font-size: 10px; color: #64748b; margin-top: 4px;">📍 ${st.latitude.toFixed(4)}, ${st.longitude.toFixed(4)}</div>
          </div>
        </div>
      `;

      const marker = L.marker([st.latitude, st.longitude], { icon: customIcon })
        .addTo(map)
        .bindPopup(popupContent);

      marker.on("click", () => {
        onSelectStation(st.stationId);
      });

      markersRef.current.set(st.stationId, marker);
    });

    // Handle user location pin if present
    if (userLocation) {
      const userIcon = L.divIcon({
        className: "custom-user-marker",
        html: `
          <div style="position: relative; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 32px; height: 32px; border-radius: 50%; background-color: #3b82f6; opacity: 0.3; animation: ping 2s infinite;"></div>
            <div style="width: 16px; height: 16px; border-radius: 50%; background-color: #3b82f6; border: 2px solid #ffffff; box-shadow: 0 0 8px #3b82f6;"></div>
          </div>
        `,
        iconSize: [20, 20],
        iconAnchor: [10, 10],
      });

      const userMarker = L.marker([userLocation.lat, userLocation.lng], { icon: userIcon })
        .addTo(map)
        .bindPopup("<strong>📍 Your Selected Location</strong>");

      markersRef.current.set("__user_location__", userMarker);
    }
  }, [stations, selectedStationId, userLocation, onSelectStation]);

  // Center map on selected station
  useEffect(() => {
    const map = leafletMap.current;
    if (!map || !selectedStationId) return;

    const selectedStation = stations.find((s) => s.stationId === selectedStationId);
    if (selectedStation && selectedStation.latitude && selectedStation.longitude) {
      map.flyTo([selectedStation.latitude, selectedStation.longitude], 14, {
        duration: 1.2,
      });

      const marker = markersRef.current.get(selectedStationId);
      if (marker) {
        marker.openPopup();
      }
    }
  }, [selectedStationId, stations]);

  return (
    <div className="relative w-full h-full min-h-[420px] rounded-2xl overflow-hidden border border-slate-800 shadow-xl bg-slate-900">
      <div ref={mapRef} className="w-full h-full min-h-[420px] z-0" />
      <style jsx global>{`
        @keyframes ping {
          75%, 100% {
            transform: scale(2);
            opacity: 0;
          }
        }
        .custom-station-marker, .custom-user-marker {
          background: transparent !important;
          border: none !important;
        }
        .leaflet-popup-content-wrapper {
          background: #ffffff !important;
          border-radius: 12px !important;
          box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.5) !important;
        }
        .leaflet-popup-tip {
          background: #ffffff !important;
        }
      `}</style>
    </div>
  );
}
