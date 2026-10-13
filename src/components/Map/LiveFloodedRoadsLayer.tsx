"use client";

// ---------------------------------------------------------------------------
// Bahaba – Live Road Flood Status Vector Layer (Google Maps Traffic Paradigm)
// ---------------------------------------------------------------------------
//
// Renders the live monitored arterial road network across Metro Manila and
// regional floodplains directly over the Carto basemap "at a glance".
//
// Visual Styling (Google Maps Traffic Paradigm):
//   • NORMAL / Clear (<5 cm):            Traffic Emerald Green (#10b981) – Passable to all vehicles
//   • ALERT / Gutter Deep (5–14 cm):     Warning Amber (#f59e0b) – Caution for low-clearance
//   • ALARM / Half-Tire Deep (15–28 cm): High-Risk Red (#ef4444) – Sedans impassable
//   • CRITICAL / Waist Deep+ (>28 cm):   Severe Crimson (#991b1b) + Pulse Aura + ⛔ Impassable Roundel
//   • Active Selection:                  High-Contrast Cyan (#38bdf8) + Pulsing Beacon
//
// Every corridor features a dark casing for razor-sharp legibility over CartoDB
// Dark Matter, official DPWH route shields (AH26, N170, etc.), and rich hover/popup metadata.
// ---------------------------------------------------------------------------

import { useEffect, useRef } from "react";
import type { LiveStation } from "@/types";
import type { EvaluatedRoadRisk } from "@/lib/flood-engine";
import type { RoadRiskResult, RoadSeverity } from "@/lib/engine/roadRisk";
import { calculateWaterDepth, classifyFloodRisk } from "@/lib/engine/floodPredictor";
import noahRoadsDataset from "@/lib/data/noah-roads.json";
import type { NoahRoadSegment } from "@/types/flood-engine";
import { calculateHaversineDistance } from "@/lib/engine/roadRisk";
import { patchLeafletBounds } from "@/lib/leaflet-patch";

interface LiveFloodedRoadsLayerProps {
  /** Leaflet map instance */
  map: any;
  /** Active PAGASA telemetry stations */
  stations: LiveStation[];
  /** Rain rate in mm/hr from backend */
  rainRate?: number;
  /** 24h rain accumulation in mm from backend */
  rain24h?: number;
  /** Optional pre-evaluated roads from backend /api/flood/live */
  evaluatedRoads?: EvaluatedRoadRisk[];
  /** Currently selected road corridor for focus */
  selectedRoad?: RoadRiskResult | null;
  /** Callback when user clicks on a road */
  onSelectRoad?: (road: RoadRiskResult) => void;
  /** Whether road lines should be dimmed (e.g., when an active route is open) */
  dimmed?: boolean;
  /** Whether the road network layer is visible */
  visible?: boolean;
}

interface DisplayRoadItem {
  id: string;
  name: string;
  latLngs: [number, number][]; // [lat, lng][] for Leaflet
  centroid: [number, number];
  elevationM: number;
  noahHazardLevel: number;
  depthCm: number;
  severity: RoadSeverity;
  color: string;
  depthCategory: string;
  drivableVehicles: string[];
  nearestStationName: string;
  nearestStationDistanceKm: number;
  waterLevel: number;
  rain1h: number;
  delta1h: number;
  hazardScore: number;
  nationalRoute?: string;
  isSelected: boolean;
  isFlooded: boolean;
}

/**
 * Traffic-status color mapping matching Google Maps Traffic paradigm
 */
function getTrafficStatusColor(severity: RoadSeverity, depthCm: number, isSelected: boolean): string {
  if (isSelected) return "#38bdf8"; // Electric Cyan focus
  if (severity === "CRITICAL" || depthCm > 28) return "#991b1b"; // Impassable Crimson / Dark Red
  if (severity === "ALARM" || depthCm >= 15) return "#ef4444"; // Half-Tire Vivid Red
  if (severity === "ALERT" || depthCm >= 5) return "#f59e0b"; // Gutter Deep Amber
  return "#10b981"; // Passable Traffic Emerald Green
}

/**
 * Extract concise route shield label (e.g. "N1 / AH26" -> "AH26", "N170" -> "N170")
 */
function formatRouteShield(route?: string): string | null {
  if (!route) return null;
  if (route.includes("AH26")) return "AH26";
  if (route.includes("E6")) return "E6";
  if (route.includes("E2")) return "E2";
  if (route.includes("E3")) return "E3";
  if (route.includes("E5")) return "E5";
  const match = route.match(/(N\d+|E\d+)/);
  return match ? match[1] : null;
}

export default function LiveFloodedRoadsLayer({
  map,
  stations = [],
  rainRate = 0,
  rain24h = 0,
  evaluatedRoads = [],
  selectedRoad = null,
  onSelectRoad,
  dimmed = false,
  visible = true,
}: LiveFloodedRoadsLayerProps) {
  const layerGroupRef = useRef<any>(null);
  const badgesGroupRef = useRef<any>(null);
  const onSelectRoadRef = useRef(onSelectRoad);

  useEffect(() => {
    onSelectRoadRef.current = onSelectRoad;
  }, [onSelectRoad]);

  useEffect(() => {
    const L = (window as any).L;
    if (!map || typeof window === "undefined" || !L || !map._loaded) return;
    patchLeafletBounds(L);

    if (!layerGroupRef.current) {
      layerGroupRef.current = L.layerGroup().addTo(map);
    }
    if (!badgesGroupRef.current) {
      badgesGroupRef.current = L.layerGroup().addTo(map);
    }

    const layerGroup = layerGroupRef.current;
    const badgesGroup = badgesGroupRef.current;
    layerGroup.clearLayers();
    badgesGroup.clearLayers();

    if (!visible) return;

    // 1. Gather all candidate roads to check
    const displayList: DisplayRoadItem[] = [];
    const allNoahRoads = noahRoadsDataset as NoahRoadSegment[];

    // If backend pre-evaluated roads are available, map them
    if (evaluatedRoads && evaluatedRoads.length > 0) {
      evaluatedRoads.forEach((r) => {
        const isSelected = Boolean(
          selectedRoad &&
            (selectedRoad.roadName === r.roadName ||
              (Math.abs(selectedRoad.centroid[0] - r.centroid[0]) < 0.002 &&
                Math.abs(selectedRoad.centroid[1] - r.centroid[1]) < 0.002))
        );

        const depth = r.estimatedDepthCm ?? 0;
        const isFlooded = r.isFlooded || depth >= 5 || r.severity !== "NORMAL";
        const color = getTrafficStatusColor(r.severity, depth, isSelected);

        // Convert [lng, lat] to Leaflet [lat, lng]
        const latLngs: [number, number][] = (r.coordinates || [])
          .filter(
            (c) =>
              Array.isArray(c) &&
              c.length === 2 &&
              typeof c[0] === "number" &&
              isFinite(c[0]) &&
              typeof c[1] === "number" &&
              isFinite(c[1]) &&
              Math.abs(c[1]) <= 90 &&
              Math.abs(c[0]) <= 180
          )
          .map((c) => [c[1], c[0]]);

        if (latLngs.length < 2) return;

        displayList.push({
          id: r.roadId,
          name: r.roadName,
          latLngs,
          centroid: r.centroid,
          elevationM: r.elevationM ?? r.elevationMeters ?? 4,
          noahHazardLevel: r.noahHazardLevel ?? 1,
          depthCm: depth,
          severity: r.severity,
          color,
          depthCategory: r.depthCategory,
          drivableVehicles: r.drivableVehicles || [],
          nearestStationName: r.nearestStation?.stationName || "PAGASA Telemetry",
          nearestStationDistanceKm: r.nearestStation?.distanceKm ?? 0,
          waterLevel: r.nearestStation?.waterLevel ?? 0,
          rain1h: r.nearestStation?.rain1h ?? 0,
          delta1h: r.nearestStation?.delta1h ?? 0,
          hazardScore: r.hazardScore ?? 0,
          nationalRoute: r.nationalRoute,
          isSelected,
          isFlooded,
        });
      });
    } else {
      // Fallback: Evaluate monitored road network on client
      allNoahRoads.forEach((road) => {
        const latLngs: [number, number][] = (road.coordinates || [])
          .filter(
            (c) =>
              Array.isArray(c) &&
              c.length === 2 &&
              typeof c[0] === "number" &&
              isFinite(c[0]) &&
              typeof c[1] === "number" &&
              isFinite(c[1]) &&
              Math.abs(c[1]) <= 90 &&
              Math.abs(c[0]) <= 180
          )
          .map((c) => [c[1], c[0]]);

        if (latLngs.length < 2) return;

        // Compute centroid
        let sumLat = 0;
        let sumLng = 0;
        latLngs.forEach(([lat, lng]) => {
          sumLat += lat;
          sumLng += lng;
        });
        const centLat = sumLat / latLngs.length;
        const centLng = sumLng / latLngs.length;

        const isSelected = Boolean(
          selectedRoad &&
            (selectedRoad.roadName === road.name ||
              (Math.abs(selectedRoad.centroid[0] - centLat) < 0.002 &&
                Math.abs(selectedRoad.centroid[1] - centLng) < 0.002))
        );

        // Find nearest telemetry station
        let nearestSt: LiveStation | null = null;
        let minDist = Infinity;

        if (stations && stations.length > 0) {
          for (const st of stations) {
            if (!st.latitude || !st.longitude) continue;
            const d = calculateHaversineDistance(centLat, centLng, st.latitude, st.longitude);
            if (d < minDist) {
              minDist = d;
              nearestSt = st;
            }
          }
        }

        const stationRain1h = nearestSt?.rain1h ?? 0;
        const stationRain24h = nearestSt?.rain24h ?? 0;
        const distWeight = Math.exp(-minDist / 8.0);
        const effectiveRain1h = Math.max(rainRate, stationRain1h * distWeight);
        const effectiveRain24h = Math.max(rain24h, stationRain24h * distWeight);

        const depthCm = calculateWaterDepth(
          effectiveRain1h,
          effectiveRain24h,
          road.noahHazardLevel,
          road.elevationM,
          road.drainageCapacity
        );

        const classification = classifyFloodRisk(depthCm);
        const severity: RoadSeverity =
          classification.category === "NORMAL"
            ? "NORMAL"
            : classification.category === "LOW"
              ? "ALERT"
              : classification.category === "HIGH"
                ? "ALARM"
                : "CRITICAL";

        const isFlooded = depthCm >= 5 || severity !== "NORMAL";
        const color = getTrafficStatusColor(severity, depthCm, isSelected);

        const rainFactor = Math.min(1.0, effectiveRain1h / 30.0);
        const depthFactor = Math.min(1.0, depthCm / 50.0);
        const elevFactor = Math.max(0, 1.0 - road.elevationM / 20.0);
        const hazardScore = Math.round(
          Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
        );

        displayList.push({
          id: road.id,
          name: road.name,
          latLngs,
          centroid: [centLat, centLng],
          elevationM: road.elevationM,
          noahHazardLevel: road.noahHazardLevel,
          depthCm,
          severity,
          color,
          depthCategory: classification.label,
          drivableVehicles: classification.passableVehicles,
          nearestStationName: nearestSt?.stationName || "Weather Telemetry",
          nearestStationDistanceKm: Number(minDist.toFixed(1)),
          waterLevel: nearestSt?.waterLevel ?? 0,
          rain1h: effectiveRain1h,
          delta1h: nearestSt?.waterLevelDelta1h ?? 0,
          hazardScore,
          nationalRoute: road.nationalRoute,
          isSelected,
          isFlooded,
        });
      });
    }

    const currentZoom = map.getZoom ? map.getZoom() : 12;
    const showBadges = currentZoom >= 11;

    // 2. Render Google Maps Live Traffic-style Polylines
    displayList.forEach((item) => {
      try {
        const isCritical = item.severity === "CRITICAL";
        const isAlarm = item.severity === "ALARM";
        const isAlert = item.severity === "ALERT";

        // Dynamic casing & core weights
        const casingWeight = item.isSelected
          ? 11
          : isCritical
            ? 10
            : isAlarm
              ? 8.5
              : isAlert
                ? 7.5
                : 6.5;

        const coreWeight = item.isSelected
          ? 6.5
          : isCritical
            ? 6
            : isAlarm
              ? 5
              : isAlert
                ? 4.2
                : 3.8;

        const opacityModifier = dimmed ? 0.35 : 1.0;

        // Outer dark casing polyline for maximum contrast against Carto Dark Matter
        L.polyline(item.latLngs, {
          color: "#020617",
          weight: casingWeight,
          opacity: 0.95 * opacityModifier,
          lineCap: "round",
          lineJoin: "round",
          interactive: false,
          noClip: true,
        }).addTo(layerGroup);

        // Core colored polyline
        const corePolyline = L.polyline(item.latLngs, {
          color: item.color,
          weight: coreWeight,
          opacity: 0.96 * opacityModifier,
          lineCap: "round",
          lineJoin: "round",
          className: isCritical ? "flooded-road-pulse" : "",
          interactive: true,
          noClip: true,
        }).addTo(layerGroup);

      // Mouseover / Mouseout feedback
      corePolyline.on("mouseover", () => {
        corePolyline.setStyle({
          weight: coreWeight + 2.5,
          opacity: 1.0,
        });
        corePolyline.bringToFront();
      });

      corePolyline.on("mouseout", () => {
        corePolyline.setStyle({
          weight: coreWeight,
          opacity: 0.96 * opacityModifier,
        });
      });

      // Click to focus or view road
      const handleSelect = () => {
        if (typeof onSelectRoadRef.current === "function") {
          const roadRiskResult: RoadRiskResult = {
            roadName: item.name,
            elevationMeters: item.elevationM,
            severity: item.severity,
            color: item.color,
            lineWeight: coreWeight,
            estimatedDepthCm: item.depthCm,
            depthCategory: item.depthCategory as any,
            nearestStation: {
              stationId: "station-monitored",
              stationName: item.nearestStationName,
              distanceKm: item.nearestStationDistanceKm,
              waterLevel: item.waterLevel,
              rain1h: item.rain1h,
              delta1h: item.delta1h,
            },
            drivableVehicles: item.drivableVehicles,
            hazardScore: item.hazardScore,
            centroid: item.centroid,
            isNearRiver: item.nearestStationDistanceKm <= 0.5,
          };
          onSelectRoadRef.current(roadRiskResult);
        }
      };

      corePolyline.on("click", handleSelect);

      const statusBadgeBg =
        item.severity === "CRITICAL"
          ? "#991b1b"
          : item.severity === "ALARM"
            ? "#ef4444"
            : item.severity === "ALERT"
              ? "#f59e0b"
              : "#10b981";

      const statusLabel =
        item.severity === "CRITICAL"
          ? "IMPASSABLE"
          : item.severity === "ALARM"
            ? "HIGH RISK"
            : item.severity === "ALERT"
              ? "CAUTION"
              : "PASSABLE";

      // Popup metadata
      corePolyline.bindPopup(`
        <div style="font-family: system-ui, -apple-system, sans-serif; padding: 4px; color: #0f172a; min-width: 230px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 6px;">
            <div style="display: flex; align-items: center; gap: 4px;">
              <strong style="font-size: 13px; color: #0f172a;">${item.name}</strong>
            </div>
            <span style="
              background: ${statusBadgeBg};
              color: #ffffff;
              font-size: 9px;
              font-weight: 800;
              padding: 2px 7px;
              border-radius: 9999px;
              letter-spacing: 0.02em;
              white-space: nowrap;
            ">${statusLabel}</span>
          </div>
          <div style="font-size: 11px; color: #334155; line-height: 1.55;">
            <div>Water Depth: <strong style="color: ${item.color}; font-size: 12px;">${item.depthCm} cm</strong> (${item.depthCategory})</div>
            <div>Elevation: <strong>${item.elevationM.toFixed(1)} m</strong> • NOAH Tier: <strong>${item.noahHazardLevel}</strong></div>
            <div style="margin-top: 4px; font-size: 11px;">
              Passable Vehicles:<br/>
              <span style="color: #0284c7; font-weight: 600;">${item.drivableVehicles.join(", ") || "None / Impassable"}</span>
            </div>
            ${
              item.nearestStationName
                ? `<div style="font-size: 10px; color: #64748b; margin-top: 5px; border-top: 1px solid #e2e8f0; padding-top: 4px;">
                    Nearest Sensor: <strong>${item.nearestStationName}</strong> (${item.nearestStationDistanceKm} km away)
                   </div>`
                : ""
            }
          </div>
        </div>
      `);

      // 3. Render Badges: Impassable Roundel (⛔) or National Route Shield
      if (showBadges && !dimmed) {
        if (isCritical) {
          // Road Closed / Impassable Badge (Red circle with white dash - Google Maps style)
          const closedIcon = L.divIcon({
            className: "custom-road-closed-icon",
            html: `
              <div style="
                width: 20px;
                height: 20px;
                border-radius: 50%;
                background-color: #dc2626;
                border: 1.5px solid #ffffff;
                box-shadow: 0 0 8px rgba(220, 38, 38, 0.9);
                display: flex;
                align-items: center;
                justify-content: center;
                cursor: pointer;
              ">
                <span style="display: block; width: 9px; height: 2.2px; background-color: #ffffff; border-radius: 1px;"></span>
              </div>
            `,
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          });

          const closedMarker = L.marker(item.centroid, {
            icon: closedIcon,
            zIndexOffset: 500,
            keyboard: false,
          }).addTo(badgesGroup);

          closedMarker.on("click", handleSelect);
          closedMarker.bindPopup(`
            <div style="font-family: system-ui, sans-serif; padding: 2px 4px; color: #991b1b; font-weight: 700; font-size: 11px;">
              ⛔ ROAD CLOSED / IMPASSABLE<br/>
              <span style="color: #334155; font-weight: 500;">${item.name} (${item.depthCm} cm water)</span>
            </div>
          `);
        } else {
          // National Route Shield (e.g. AH26, N170, E2, N11)
          const shieldText = formatRouteShield(item.nationalRoute);
          if (shieldText && currentZoom >= 12) {
            const isAH = shieldText.startsWith("AH");
            const isExp = shieldText.startsWith("E");

            const shieldStyle = isAH
              ? "background: #1d4ed8; color: #ffffff; border: 1.5px solid #93c5fd;"
              : isExp
                ? "background: #064e3b; color: #fde047; border: 1.5px solid #ca8a04;"
                : "background: #0f172a; color: #f8fafc; border: 1.5px solid #64748b;";

            const shieldIcon = L.divIcon({
              className: "custom-route-shield-icon",
              html: `
                <div style="
                  ${shieldStyle}
                  font-family: system-ui, -apple-system, sans-serif;
                  font-weight: 800;
                  font-size: 9px;
                  line-height: 1;
                  padding: 2px 4.5px;
                  border-radius: 4px;
                  box-shadow: 0 2px 6px rgba(0,0,0,0.6);
                  white-space: nowrap;
                  letter-spacing: 0.02em;
                  cursor: pointer;
                  display: inline-block;
                ">
                  ${shieldText}
                </div>
              `,
              iconSize: [32, 16],
              iconAnchor: [16, 8],
            });

            const shieldMarker = L.marker(item.centroid, {
              icon: shieldIcon,
              zIndexOffset: 300,
              keyboard: false,
            }).addTo(badgesGroup);

            shieldMarker.on("click", handleSelect);
          }
        }
      }
    } catch (err) {
      console.warn("[LiveFloodedRoadsLayer] Error rendering corridor:", item.name, err);
    }
  });

    return () => {
      if (layerGroupRef.current) {
        try {
          layerGroupRef.current.clearLayers();
        } catch {}
      }
      if (badgesGroupRef.current) {
        try {
          badgesGroupRef.current.clearLayers();
        } catch {}
      }
    };
  }, [map, stations, rainRate, rain24h, evaluatedRoads, selectedRoad, dimmed, visible]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      if (layerGroupRef.current && map) {
        try {
          if (map.hasLayer(layerGroupRef.current)) {
            map.removeLayer(layerGroupRef.current);
          }
        } catch {}
        layerGroupRef.current = null;
      }
      if (badgesGroupRef.current && map) {
        try {
          if (map.hasLayer(badgesGroupRef.current)) {
            map.removeLayer(badgesGroupRef.current);
          }
        } catch {}
        badgesGroupRef.current = null;
      }
    };
  }, [map]);

  return null;
}
