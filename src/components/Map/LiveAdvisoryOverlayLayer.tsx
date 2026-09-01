"use client";

// ---------------------------------------------------------------------------
// Bahaba – Live Advisory Overlay Layer
// Renders glowing, pulsing ground-truth flood markers from official MMDA/NDRRMC reports.
// Dynamically supports single-location pins and multi-location bulletin pins on the map.
// ---------------------------------------------------------------------------

import { useEffect, useRef, useState } from "react";
import type { ReportedAdvisory, AdvisoryLocationPin } from "@/types/advisory";
import { isAdvisoryPinVisible } from "@/types/advisory";
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

  const lastDirectClickedIdRef = useRef<string | null>(null);

  const [tick, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 60_000);
    return () => clearInterval(interval);
  }, []);

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

      const now = Date.now();

      advisories.forEach((advisory) => {
        // Enforce 6-hour map visibility cutoff
        if (!isAdvisoryPinVisible(advisory, now)) {
          return;
        }

        // Helper to render a pin marker
        const renderPin = (
          pinId: string,
          coords: { lat: number; lng: number },
          roadName?: string,
          landmark?: string,
          direction?: string,
          severity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL" = "NORMAL",
          passabilityLabel: string = "Passable to All Vehicles",
          depthInches: number = 0,
          rawTextSnippet?: string,
          city?: string
        ) => {
          const { lat, lng } = coords;
          if (!lat || !lng) return;

          const isCritical = severity === "CRITICAL";
          const isAlarm = severity === "ALARM";
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

          const locationTitle = roadName
            ? `${roadName}${landmark ? ` (${landmark})` : ""}${city ? ` • ${city}` : ""}`
            : city || "Road Flood Advisory";

          const authorBadgeName = (advisory.authorName && !/^(news|news report)$/i.test(advisory.authorName))
            ? advisory.authorName
            : (advisory.source === "NEWS" ? "NEWS REPORT" : advisory.source);
          const authorHandleText = (advisory.authorHandle && !/^(news|search|feed|unknown|undefined|null)$/i.test(advisory.authorHandle))
            ? `@${advisory.authorHandle.replace(/^@/, "")}`
            : "";

          const popupContent = `
            <div style="font-family: system-ui, sans-serif; padding: 4px; color: #0f172a; max-width: 260px;">
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px; margin-bottom: 2px;">
                <div style="display: flex; align-items: center; gap: 4px; overflow: hidden;">
                  <span style="font-weight: 800; font-size: 10px; padding: 2px 7px; border-radius: 9999px; background-color: ${advisory.source === "NEWS" ? "#0284c7" : "#1d4ed8"}; color: white; white-space: nowrap;">
                    ${authorBadgeName}
                  </span>
                  ${authorHandleText ? `<span style="font-size: 10px; font-weight: 600; color: #0284c7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${authorHandleText}</span>` : ""}
                </div>
                <span style="font-size: 10px; color: #64748b; white-space: nowrap;">
                  ${formatTimeAgo(advisory.publishedAt)}
                </span>
              </div>

              <strong style="font-size: 13px; color: #0f172a; display: block; margin: 4px 0 2px 0;">
                ${locationTitle}
              </strong>

              <div style="font-size: 11px; font-weight: 700; color: ${pinColor}; margin-bottom: 4px;">
                ${passabilityLabel} ${depthInches ? `(${depthInches}")` : ""} ${direction ? `• ${direction}` : ""}
              </div>

              <p style="font-size: 11px; line-height: 1.4; color: #334155; margin: 0 0 6px 0;">
                ${rawTextSnippet ? (rawTextSnippet.length > 140 ? rawTextSnippet.slice(0, 140) + "..." : rawTextSnippet) : advisory.rawText.slice(0, 140)}
              </p>

              ${photoHtml}

              <div style="margin-top: 6px; padding-top: 4px; border-top: 1px solid #e2e8f0; display: flex; justify-content: flex-end;">
                <a href="${advisory.postUrl}" target="_blank" rel="noopener noreferrer" style="font-size: 10px; color: #0284c7; text-decoration: underline;">
                  View post on X ${authorHandleText ? `(${authorHandleText})` : ""} ↗
                </a>
              </div>
            </div>
          `;

          const marker = L.marker([lat, lng], { icon: customIcon, keyboard: false })
            .bindPopup(popupContent, { maxWidth: 270 })
            .on("click", () => {
              lastDirectClickedIdRef.current = advisory.id;
              onSelectAdvisoryRef.current?.(advisory);
            });

          layerGroup.addLayer(marker);
          markersMapRef.current.set(pinId, marker);
          if (!markersMapRef.current.has(advisory.id)) {
            markersMapRef.current.set(advisory.id, marker);
          }
        };

        // If advisory has multi-location pins extracted, render all pins on the map
        if (advisory.locationPins && advisory.locationPins.length > 0) {
          advisory.locationPins.forEach((pin: AdvisoryLocationPin) => {
            if (pin.coordinates && pin.coordinates.lat && pin.coordinates.lng) {
              renderPin(
                pin.id,
                pin.coordinates,
                pin.roadName,
                pin.landmark,
                pin.direction,
                pin.severity,
                pin.passabilityLabel,
                pin.depthInches,
                pin.rawLine,
                pin.city
              );
            }
          });
        } else if (advisory.coordinates && advisory.coordinates.lat && advisory.coordinates.lng) {
          // Render single coordinate pin
          renderPin(
            advisory.id,
            advisory.coordinates,
            advisory.roadName,
            advisory.landmark,
            advisory.direction,
            advisory.severity,
            advisory.passabilityLabel,
            advisory.depthInches,
            advisory.rawText
          );
        }
      });
    } catch (err) {
      console.warn("[LiveAdvisoryOverlayLayer render error]", err);
    }
  }, [map, mapLoaded, advisories, tick]);

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

  // 2. Focus when selectedAdvisory changes from external UI (avoid double triggering on direct map clicks)
  useEffect(() => {
    if (!selectedAdvisory || !map || !mapLoaded || !selectedAdvisory.coordinates) return;

    if (lastDirectClickedIdRef.current === selectedAdvisory.id) {
      lastDirectClickedIdRef.current = null;
      return;
    }

    const { lat, lng } = selectedAdvisory.coordinates;
    try {
      const currentZoom = map.getZoom ? map.getZoom() : 13;
      const targetZoom = Math.max(currentZoom, 14);
      map.setView([lat, lng], targetZoom, { animate: true });
      const marker = markersMapRef.current.get(selectedAdvisory.id);
      if (marker) {
        marker.openPopup();
      }
    } catch (err) {
      console.warn("[LiveAdvisoryOverlayLayer setView error]", err);
    }
  }, [selectedAdvisory, map, mapLoaded]);

  return null;
}
