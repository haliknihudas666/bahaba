"use client";

// ---------------------------------------------------------------------------
// Bahaba – Live Advisory Overlay Layer
// Renders glowing, pulsing ground-truth flood markers from official MMDA/NDRRMC reports.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { ReportedAdvisory } from "@/types/advisory";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0 || isNaN(diffMs)) return "Just now";

    const minutes = Math.floor(diffMs / (60 * 1000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

interface LiveAdvisoryOverlayLayerProps {
  map: any;
  mapLoaded: boolean;
  advisories: ReportedAdvisory[];
  selectedAdvisory?: ReportedAdvisory | null;
  onSelectAdvisory?: (advisory: ReportedAdvisory) => void;
}

export default function LiveAdvisoryOverlayLayer({
  map,
  mapLoaded,
  advisories,
  selectedAdvisory,
  onSelectAdvisory,
}: LiveAdvisoryOverlayLayerProps) {
  const layerGroupRef = useRef<any>(null);
  const markersMapRef = useRef<Map<string, any>>(new Map());
  const onSelectAdvisoryRef = useRef(onSelectAdvisory);
  onSelectAdvisoryRef.current = onSelectAdvisory;

  // 1. Initialize Layer Group and render markers when advisories list changes
  useEffect(() => {
    const L = (window as any).L;
    if (!L || !map || !mapLoaded || !map._loaded) return;
    patchLeafletBounds(L);

    try {
      if (!layerGroupRef.current) {
        layerGroupRef.current = L.layerGroup().addTo(map);
      } else {
        layerGroupRef.current.clearLayers();
      }
      const layerGroup = layerGroupRef.current;
      markersMapRef.current.clear();

      advisories.forEach((advisory) => {
        if (!advisory.coordinates || !advisory.coordinates.lat || !advisory.coordinates.lng) {
          return;
        }

        const { lat, lng } = advisory.coordinates;
        const isCritical = advisory.severity === "CRITICAL";
        const isAlarm = advisory.severity === "ALARM";
        const isSubsided = advisory.status === "SUBSIDED";

        const pinColor = isCritical
          ? "#ef4444" // Red
          : isAlarm
          ? "#f97316" // Orange
          : isSubsided
          ? "#10b981" // Green
          : "#eab308"; // Yellow

        const iconHtml = `
          <div style="position: relative; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            ${
              !isSubsided
                ? `<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: ${pinColor}; opacity: 0.45; animation: ping 1.8s infinite;"></div>`
                : ""
            }
            <div style="
              width: 22px;
              height: 22px;
              border-radius: 50%;
              background: radial-gradient(circle, #ffffff 15%, ${pinColor} 80%);
              border: 2px solid #ffffff;
              box-shadow: 0 0 14px ${pinColor}, 0 2px 6px rgba(0,0,0,0.6);
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 11px;
              color: #ffffff;
            ">
              🚨
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          className: "custom-advisory-marker",
          html: iconHtml,
          iconSize: [28, 28],
          iconAnchor: [14, 14],
        });

        const photoHtml =
          advisory.photoUrls && advisory.photoUrls.length > 0
            ? `<div style="margin-top: 6px; border-radius: 8px; overflow: hidden; max-height: 110px;">
                <img src="${advisory.photoUrls[0]}" style="width: 100%; height: 110px; object-fit: cover;" alt="Flood ground photo" />
              </div>`
            : "";

        const popupContent = `
          <div style="font-family: system-ui, sans-serif; padding: 4px; color: #0f172a; max-width: 240px;">
            <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 4px;">
              <span style="font-weight: 800; font-size: 11px; padding: 2px 6px; border-radius: 9999px; background-color: #0284c7; color: white;">
                ${advisory.source} REPORT
              </span>
              <span style="font-size: 10px; color: #64748b;">
                ${formatTimeAgo(advisory.publishedAt)}
              </span>
            </div>

            <strong style="font-size: 13px; color: #0f172a; display: block; margin-bottom: 2px;">
              ${advisory.roadName || "Road Flood Advisory"}
            </strong>

            <div style="font-size: 11px; font-weight: 700; color: ${pinColor}; margin-bottom: 4px;">
              ${advisory.passabilityLabel} ${advisory.depthInches ? `(${advisory.depthInches}")` : ""}
            </div>

            <p style="font-size: 11px; line-height: 1.4; color: #334155; margin: 0 0 6px 0;">
              ${advisory.rawText.length > 140 ? advisory.rawText.slice(0, 140) + "..." : advisory.rawText}
            </p>

            ${photoHtml}

            <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
              <a href="${advisory.postUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; color: #0284c7; text-decoration: underline;">
                View post on X ↗
              </a>
            </div>
          </div>
        `;

        const marker = L.marker([lat, lng], { icon: customIcon, keyboard: false })
          .bindPopup(popupContent, { maxWidth: 260 })
          .on("click", () => {
            onSelectAdvisoryRef.current?.(advisory);
          });

        layerGroup.addLayer(marker);
        markersMapRef.current.set(advisory.id, marker);
      });
    } catch (err) {
      console.warn("[LiveAdvisoryOverlayLayer render error]", err);
    }
  }, [map, mapLoaded, advisories]);

  // Clean up layer group on map destruction or component unmount
  useEffect(() => {
    return () => {
      try {
        if (layerGroupRef.current && map) {
          if (map.hasLayer && map.hasLayer(layerGroupRef.current)) {
            map.removeLayer(layerGroupRef.current);
          }
          layerGroupRef.current.clearLayers();
        }
      } catch {}
      layerGroupRef.current = null;
      markersMapRef.current.clear();
    };
  }, [map]);

  // 2. Focus / flyTo when selectedAdvisory changes
  useEffect(() => {
    if (!selectedAdvisory || !map || !mapLoaded || !selectedAdvisory.coordinates) return;
    const { lat, lng } = selectedAdvisory.coordinates;
    try {
      map.flyTo([lat, lng], 15, { animate: true, duration: 0.9 });
      const marker = markersMapRef.current.get(selectedAdvisory.id);
      if (marker) {
        marker.openPopup();
      }
    } catch (err) {
      console.warn("[LiveAdvisoryOverlayLayer flyTo error]", err);
    }
  }, [selectedAdvisory, map, mapLoaded]);

  return null;
}
