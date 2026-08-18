"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Flood Navigation & Telemetry Dashboard
// Google Maps-Style Full-Height Stacked Redesign
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLiveFloodStatus } from "@/hooks/useLiveFloodStatus";
import RoadFloodMap from "@/components/Map/RoadFloodMap";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import StationTable from "@/components/StationTable";
import NearestStationFinder from "@/components/NearestStationFinder";
import ShareModal from "@/components/ShareModal";
import {
  fetchAndEvaluateRoute,
  type RouteOption,
  type TravelMode,
  type VehicleType,
  VEHICLE_CONFIGS,
} from "@/lib/engine/routeSolver";
import { type RoadRiskResult, type RoadSeverity, calculateHaversineDistance } from "@/lib/engine/roadRisk";
import { calculateWaterDepth, classifyFloodRisk } from "@/lib/engine/floodPredictor";
import noahRoadsDataset from "@/lib/data/noah-roads.json";
import {
  trackRouteCalculation,
  trackStationSelected,
  trackRoadSelected,
  trackTelemetrySync,
  trackTableTabSwitch,
} from "@/lib/firebase/analytics";
import type { LiveStation } from "@/types";
import type { NoahRoadSegment } from "@/types/flood-engine";

export default function HomePage() {
  const {
    stations: activeStations,
    loading: firestoreLoading,
    source: telemetrySource,
    lastUpdated,
    refreshScraper,
  } = useLiveFloodStatus();

  const [syncing, setSyncing] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

  // Layout Overlay States
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isDrawerOpen, setIsDrawerOpen] = useState<boolean>(false);
  const [isLegendOpen, setIsLegendOpen] = useState<boolean>(false);
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);

  // Travel Mode (Driving vs Walking) & Vehicle Type State
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("all");

  // Drawer table tab state: "station-telemetry" | "road-predictions" | "nearest-finder"
  const [activeDrawerTab, setActiveDrawerTab] = useState<"station-telemetry" | "road-predictions" | "nearest-finder">("station-telemetry");

  // Dynamic Location state for Point A (Origin) and Point B (Destination)
  const [originLoc, setOriginLoc] = useState<{
    id: string;
    name: string;
    subtext: string;
    coords: [number, number] | null;
  }>({
    id: "",
    name: "",
    subtext: "",
    coords: null,
  });

  const [destLoc, setDestLoc] = useState<{
    id: string;
    name: string;
    subtext: string;
    coords: [number, number] | null;
  }>({
    id: "",
    name: "",
    subtext: "",
    coords: null,
  });

  // OSRM Driving/Walking Routes State
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0);
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);

  // Filter & Search State for Monitored Roads Table
  const [tableFilterSeverity, setTableFilterSeverity] = useState<string>("ALL");
  const [tableSearchQuery, setTableSearchQuery] = useState<string>("");
  const [selectedRoadRisk, setSelectedRoadRisk] = useState<RoadRiskResult | null>(null);

  // Telemetry Sync Trigger
  const triggerTelemetrySync = async () => {
    setSyncing(true);
    trackTelemetrySync();
    try {
      await refreshScraper();
    } finally {
      setSyncing(false);
    }
  };

  // Recenter map to Metro Manila
  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  // Overall telemetry summary metrics
  const metrics = useMemo(() => {
    const total = activeStations.length;
    const highRisk = activeStations.filter(
      (s) => s.riskLevel === "CRITICAL" || s.riskLevel === "ALARM" || s.riskLevel === "ALERT"
    ).length;

    let peakWater = 0;
    let peakWaterStation = "N/A";
    let maxRain1h = 0;
    let maxRain = 0;

    activeStations.forEach((s) => {
      if (s.waterLevel > peakWater) {
        peakWater = s.waterLevel;
        peakWaterStation = s.stationName;
      }
      if (s.rain1h > maxRain1h) {
        maxRain1h = s.rain1h;
      }
      if (s.rain24h > maxRain) {
        maxRain = s.rain24h;
      }
    });

    return { total, highRisk, peakWater, peakWaterStation, maxRain1h, maxRain };
  }, [activeStations]);

  // Formatted observation / sync timestamp
  const lastUpdatedFormatted = useMemo(() => {
    if (!lastUpdated || isNaN(lastUpdated.getTime())) return null;
    return lastUpdated.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, [lastUpdated]);

  const lastUpdatedFullDate = useMemo(() => {
    if (!lastUpdated || isNaN(lastUpdated.getTime())) return null;
    return lastUpdated.toLocaleString("en-PH", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, [lastUpdated]);

  const activeRoute = routeOptions[selectedRouteIdx] || routeOptions[0];

  // Calculate dynamic road flood evaluations based on active route and telemetry
  const roadEvaluations: RoadRiskResult[] = useMemo(() => {
    if (activeRoute && activeRoute.segmentedRoute.length > 0) {
      return activeRoute.segmentedRoute.map((seg, idx) => {
        const matchingStation = activeStations.find(
          (s) => s.stationName.toLowerCase() === seg.nearestStationName.toLowerCase()
        );

        const midCoord = seg.coordinates[Math.floor(seg.coordinates.length / 2)] || [14.6, 121.0];

        return {
          roadName: `${activeRoute.summary} (Segment ${idx + 1})`,
          elevationMeters: seg.elevationM,
          severity: seg.severity,
          color: seg.color,
          lineWeight: seg.severity === "CRITICAL" ? 6 : 4,
          estimatedDepthCm: seg.depthCm,
          depthCategory: seg.depthCategory as any,
          nearestStation: {
            stationId: matchingStation?.stationId || "station-na",
            stationName: seg.nearestStationName,
            distanceKm: seg.nearestStationDistanceKm,
            waterLevel: matchingStation?.waterLevel ?? 0,
            rain1h: seg.rainMmHr,
            delta1h: matchingStation?.waterLevelDelta1h ?? 0,
          },
          drivableVehicles: seg.passableVehicles,
          hazardScore: seg.hazardScore,
          centroid: midCoord,
          isNearRiver: false,
        };
      });
    }

    // Default: Evaluate all monitored Metro Manila roads (España, EDSA, Shaw, Taft, etc.)
    const roads = noahRoadsDataset as NoahRoadSegment[];
    return roads.map((road) => {
      let sumLat = 0;
      let sumLng = 0;
      road.coordinates.forEach(([lng, lat]) => {
        sumLat += lat;
        sumLng += lng;
      });
      const centLat = sumLat / road.coordinates.length;
      const centLng = sumLng / road.coordinates.length;

      let nearestSt: LiveStation | null = null;
      let minDist = Infinity;

      if (activeStations && activeStations.length > 0) {
        for (const st of activeStations) {
          if (!st.latitude || !st.longitude) continue;
          const d = calculateHaversineDistance(centLat, centLng, st.latitude, st.longitude);
          if (d < minDist) {
            minDist = d;
            nearestSt = st;
          }
        }
      }

      const rain1h = nearestSt?.rain1h ?? 0;
      const rain24h = nearestSt?.rain24h ?? 0;
      const distWeight = Math.exp(-minDist / 8.0);
      const effectiveRain1h = Math.round(rain1h * distWeight * 10) / 10;
      const effectiveRain24h = Math.round(rain24h * distWeight * 10) / 10;

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

      const rainFactor = Math.min(1.0, effectiveRain1h / 30.0);
      const depthFactor = Math.min(1.0, depthCm / 50.0);
      const elevFactor = Math.max(0, 1.0 - road.elevationM / 20.0);
      const hazardScore = Math.round(
        Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
      );

      return {
        roadName: road.name,
        elevationMeters: road.elevationM,
        severity,
        color: depthCm <= 5 ? "#00b4d8" : classification.color,
        lineWeight: severity === "CRITICAL" ? 6 : 4,
        estimatedDepthCm: depthCm,
        depthCategory: classification.label as any,
        nearestStation: {
          stationId: nearestSt?.stationId ?? "station-none",
          stationName: nearestSt?.stationName ?? "Weather Telemetry",
          distanceKm: Number(minDist.toFixed(1)),
          waterLevel: nearestSt?.waterLevel ?? 0,
          rain1h: effectiveRain1h,
          delta1h: nearestSt?.waterLevelDelta1h ?? 0,
        },
        drivableVehicles: classification.passableVehicles,
        hazardScore,
        centroid: [centLat, centLng],
        isNearRiver: minDist <= 0.5,
      };
    });
  }, [activeRoute, activeStations]);

  // Filtered road predictions table dataset
  const filteredRoadEvaluations = useMemo(() => {
    return roadEvaluations.filter((road) => {
      const matchesSeverity =
        tableFilterSeverity === "ALL" || road.severity === tableFilterSeverity;
      const query = tableSearchQuery.toLowerCase().trim();
      const matchesQuery =
        !query ||
        road.roadName.toLowerCase().includes(query) ||
        road.nearestStation.stationName.toLowerCase().includes(query) ||
        road.depthCategory.toLowerCase().includes(query);
      return matchesSeverity && matchesQuery;
    });
  }, [roadEvaluations, tableFilterSeverity, tableSearchQuery]);

  // Fetch OSRM driving or walking route whenever Point A or Point B or telemetry or mode changes
  useEffect(() => {
    let isMounted = true;

    if (!originLoc.coords || !destLoc.coords) {
      setRouteOptions([]);
      setLoadingRoute(false);
      return;
    }

    setLoadingRoute(true);

    fetchAndEvaluateRoute(originLoc.coords, destLoc.coords, activeStations, {
      mode: travelMode,
      vehicleType: selectedVehicle,
    })
      .then((routes) => {
        if (isMounted) {
          setRouteOptions(routes);
          setSelectedRouteIdx(0);
          setLoadingRoute(false);

          if (routes.length > 0) {
            const fastest = routes[0];
            trackRouteCalculation({
              origin: originLoc.name,
              destination: destLoc.name,
              distanceKm: fastest.distanceKm,
              durationMin: fastest.durationMin,
              maxFloodDepthCm: fastest.maxFloodDepthCm,
              overallStatus: fastest.overallStatus,
              mode: travelMode,
              vehicleType: selectedVehicle,
              trafficLevel: fastest.traffic?.level,
              walkabilityCategory: fastest.walkability?.category,
            });
          }
        }
      })
      .catch((err) => {
        console.error("Route calculation error:", err);
        if (isMounted) setLoadingRoute(false);
      });

    return () => {
      isMounted = false;
    };
  }, [originLoc.coords, destLoc.coords, activeStations, travelMode, selectedVehicle]);

  // Swap Origin and Destination
  const handleSwap = () => {
    const temp = originLoc;
    setOriginLoc(destLoc);
    setDestLoc(temp);
  };

  // Focus Map on Selected Monitored Road Corridor
  const handleSelectRoad = (road: RoadRiskResult) => {
    setSelectedRoadRisk(road);
    trackRoadSelected({
      roadName: road.roadName,
      severity: road.severity,
      estimatedDepthCm: road.estimatedDepthCm,
      hazardScore: road.hazardScore,
    });
    // On mobile or when drawer is open, auto close drawer so user sees map highlight
    setIsDrawerOpen(false);
  };

  // Focus Map First, let camera fly to the road, then Open Share Modal
  const handleFocusAndShareRoad = (road: RoadRiskResult) => {
    setSelectedRoadRisk(road);
    trackRoadSelected({
      roadName: road.roadName,
      severity: road.severity,
      estimatedDepthCm: road.estimatedDepthCm,
      hazardScore: road.hazardScore,
    });
    setIsDrawerOpen(false);
    setTimeout(() => {
      setIsShareModalOpen(true);
    }, 750);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-slate-950 text-slate-100 flex flex-col font-sans select-none">
      {/* ── 1. FULL-SCREEN INTERACTIVE MAP (Base Layer) ────────────────── */}
      <div className="absolute inset-0 w-full h-full z-0">
        <RoadFloodMap
          stations={activeStations}
          selectedStationId={selectedStationId}
          selectedRoad={selectedRoadRisk}
          originCoords={originLoc.coords}
          destinationCoords={destLoc.coords}
          fullRoutePolyline={activeRoute?.geometry}
          routeSegments={activeRoute?.segmentedRoute}
          travelMode={travelMode}
          recenterTrigger={recenterTrigger}
          onSelectRoad={(risk) => setSelectedRoadRisk(risk)}
        />
      </div>

      {/* ── 2. TOP FLOATING HEADER / HUD BAR ───────────────────────────── */}
      <header className="absolute top-3 left-3 right-3 sm:top-4 sm:left-4 sm:right-4 z-[500] pointer-events-none flex items-center justify-between gap-2.5 sm:gap-4">
        {/* Left: Brand Logo & Live Pulse */}
        <div className="pointer-events-auto flex items-center gap-2 sm:gap-3 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 px-3 py-2 rounded-2xl shadow-2xl">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base sm:text-lg shadow-md shadow-cyan-500/30 flex-shrink-0">
            🌊
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-sm sm:text-base font-black tracking-tight text-white">
                Baha Ba?
              </h1>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-slate-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline">PAGASA Live</span>
              {lastUpdatedFormatted && (
                <span className="font-mono text-slate-300">
                  {lastUpdatedFormatted}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: HUD Telemetry Quick Metric Chips (Desktop only) */}
        <div className="pointer-events-auto hidden xl:flex items-center gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 px-3 py-1.5 rounded-2xl shadow-2xl">
          {/* Chip 1: Monitored Stations */}
          <div
            title="Total Active PAGASA & Panahon Hydrological Telemetry Stations"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
          >
            <span className="text-xs">💧</span>
            <span className="text-slate-400 font-medium">Stations:</span>
            <strong className="text-white font-bold font-mono">{metrics.total}</strong>
          </div>

          {/* Chip 2: Active Flood Alerts */}
          <div
            title="Active Flood Alerts (Critical, Alarm, or Alert Level)"
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-colors ${metrics.highRisk > 0
              ? "bg-amber-950/50 border-amber-800/70 text-amber-300"
              : "bg-emerald-950/50 border-emerald-800/70 text-emerald-300"
              }`}
          >
            <span className="text-xs">{metrics.highRisk > 0 ? "⚠️" : "✅"}</span>
            <span className="font-medium">Active Alerts:</span>
            <strong className="font-bold font-mono">{metrics.highRisk}</strong>
          </div>

          {/* Chip 3: Peak River Water Level */}
          <div
            title={metrics.peakWaterStation !== "N/A" ? `Peak River Water Level: ${metrics.peakWater.toFixed(2)}m (${metrics.peakWaterStation})` : "Peak River Water Level"}
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
          >
            <span className="text-xs">🌊</span>
            <span className="text-slate-400 font-medium">Peak River Level:</span>
            <strong className="text-cyan-400 font-bold font-mono">{metrics.peakWater.toFixed(2)}m</strong>
          </div>

          {/* Chip 4: Max 1h Rainfall */}
          <div
            title="Highest 1-Hour Rainfall Intensity recorded across all stations"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
          >
            <span className="text-xs">🌧️</span>
            <span className="text-slate-400 font-medium">Max 1h Rain:</span>
            <strong className="text-sky-400 font-bold font-mono">{metrics.maxRain1h.toFixed(1)}mm</strong>
          </div>

          {/* Chip 5: Max 24h Rainfall */}
          <div
            title="Highest 24-Hour Accumulated Rainfall recorded across all stations"
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
          >
            <span className="text-xs">☔</span>
            <span className="text-slate-400 font-medium">Max 24h Rain:</span>
            <strong className="text-blue-400 font-bold font-mono">{metrics.maxRain.toFixed(1)}mm</strong>
          </div>
        </div>

        {/* Right: Quick Action Buttons */}
        <div className="pointer-events-auto flex items-center gap-2">
          {/* Tables & Stations Drawer Button */}
          <button
            onClick={() => {
              setIsDrawerOpen(true);
              trackTableTabSwitch(activeDrawerTab);
            }}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
            title="Open PAGASA Stations & Monitored Road Tables"
          >
            <span>📊</span>
            <span className="hidden sm:inline">Data Tables</span>
            {metrics.highRisk > 0 && (
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
            )}
          </button>

          {/* Share Report Button */}
          <button
            onClick={() => setIsShareModalOpen(true)}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:border-cyan-500/70 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
            title="Generate Shareable Flood Safety Report Card"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
              />
            </svg>
            <span className="hidden sm:inline">Share</span>
          </button>

          {/* Sync Telemetry Button */}
          <button
            onClick={triggerTelemetrySync}
            disabled={syncing}
            className="flex items-center gap-1.5 text-xs font-bold px-3 py-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-xl shadow-cyan-950/50 backdrop-blur-xl transition-all disabled:opacity-50 active:scale-95 flex-shrink-0"
            title="Sync Latest PAGASA & Weather Telemetry"
          >
            <svg
              className={`w-3.5 h-3.5 ${syncing ? "animate-spin" : ""}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
            <span>{syncing ? "Syncing" : "Sync"}</span>
          </button>
        </div>
      </header>

      {/* ── 3. FLOATING LEFT SEARCH & ROUTE SIDEBAR (Google Maps Style) ─ */}
      <div
        className={`absolute top-16 sm:top-20 left-3 sm:left-4 bottom-4 sm:bottom-6 z-[450] w-[calc(100vw-24px)] sm:w-[410px] md:w-[430px] max-w-[calc(100vw-32px)] flex flex-col pointer-events-auto transition-all duration-300 ease-in-out ${isSidebarOpen
          ? "translate-x-0 opacity-100"
          : "-translate-x-[calc(100%+32px)] pointer-events-none opacity-0"
          }`}
      >
        <div className="bg-slate-900/92 backdrop-blur-2xl border border-slate-800/90 rounded-3xl shadow-2xl flex flex-col h-full max-h-full overflow-hidden">
          {/* Sidebar Header & Toggle */}
          <div className="p-3.5 sm:p-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base">{travelMode === "walking" ? "🚶" : "🚗"}</span>
              <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
                Flood Safe Directions
              </span>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95"
              title="Minimize directions panel"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
          </div>

          {/* Controls: Drive vs Walk + Vehicle Type Chips */}
          <div className="p-3 sm:p-3.5 space-y-2.5 bg-slate-950/70 border-b border-slate-800/70 flex-shrink-0">
            {/* Travel Mode Toggle */}
            <div className="flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-xl">
              <button
                type="button"
                onClick={() => setTravelMode("driving")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${travelMode === "driving"
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <span>🚗</span>
                <span>Drive (Vehicle)</span>
              </button>

              <button
                type="button"
                onClick={() => setTravelMode("walking")}
                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${travelMode === "walking"
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                <span>🚶</span>
                <span>Walk (Pedestrian)</span>
              </button>
            </div>

            {/* Vehicle Type Selector (Only in Drive mode) */}
            {travelMode === "driving" && (
              <div className="space-y-1">
                <div className="flex items-center justify-between text-[10px] text-slate-400 font-semibold px-0.5">
                  <span>Clearance Filter:</span>
                  <span className="text-cyan-400 font-mono">
                    Limit: {VEHICLE_CONFIGS[selectedVehicle].clearanceCm} cm
                  </span>
                </div>
                <div className="grid grid-cols-5 gap-1 text-[11px]">
                  {(["all", "sedan", "suv", "motorcycle", "truck"] as VehicleType[]).map((vType) => {
                    const cfg = VEHICLE_CONFIGS[vType];
                    const isSelected = selectedVehicle === vType;
                    return (
                      <button
                        key={vType}
                        type="button"
                        onClick={() => setSelectedVehicle(vType)}
                        className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl border text-center transition-all ${isSelected
                          ? "bg-blue-600/30 border-blue-500 text-white font-bold shadow-sm ring-1 ring-blue-500/50"
                          : "bg-slate-900/60 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700"
                          }`}
                        title={cfg.description}
                      >
                        <span className="text-xs">{cfg.icon}</span>
                        <span className="text-[9px] truncate max-w-full font-medium">
                          {vType === "all" ? "All" : vType === "motorcycle" ? "Motor" : vType.toUpperCase()}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Origin & Destination Autocomplete Inputs */}
            <div className="space-y-2.5 relative pt-1">
              <LocationAutocomplete
                label={`Point A (${travelMode === "walking" ? "Start" : "Origin"})`}
                pointType="origin"
                value={originLoc.name}
                placeholder="Search origin, e.g. UST, SM San Lazaro..."
                onSelectLocation={(item) =>
                  setOriginLoc({
                    id: item.id,
                    name: item.name,
                    subtext: item.subtext,
                    coords: item.coords,
                  })
                }
              />

              {/* Swap Button */}
              <div className="flex justify-end -my-2.5 relative z-10">
                <button
                  onClick={handleSwap}
                  title="Swap Origin & Destination"
                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 shadow-md transition-transform active:scale-95"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </button>
              </div>

              <LocationAutocomplete
                label={`Point B (${travelMode === "walking" ? "Destination" : "Destination"})`}
                pointType="destination"
                value={destLoc.name}
                placeholder="Search destination, e.g. SM Marikina..."
                onSelectLocation={(item) =>
                  setDestLoc({
                    id: item.id,
                    name: item.name,
                    subtext: item.subtext,
                    coords: item.coords,
                  })
                }
              />
            </div>
          </div>

          {/* Scrollable Routes & Live Telemetry Breakdown Body */}
          <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 space-y-3">
            {/* Active Route Telemetry Breakdown Card */}
            {activeRoute && (
              <div className="space-y-2">
                {travelMode === "driving" ? (
                  <>
                    {/* Live Traffic Card */}
                    {activeRoute.traffic && (
                      <div className="p-2.5 rounded-xl bg-slate-950/80 border border-slate-800 space-y-1">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs">🚦</span>
                            <span className="text-[11px] font-bold text-slate-200">Traffic Telemetry</span>
                          </div>
                          <span
                            className="text-[9px] font-extrabold px-2 py-0.5 rounded-full"
                            style={{
                              backgroundColor: `${activeRoute.traffic.color}20`,
                              color: activeRoute.traffic.color,
                              border: `1px solid ${activeRoute.traffic.color}50`,
                            }}
                          >
                            {activeRoute.traffic.label}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 pt-0.5 border-t border-slate-800/60">
                          <span>Speed: <strong className="text-slate-200">{activeRoute.traffic.averageSpeedKmH} km/h</strong></span>
                          <span>Delay: <strong className={activeRoute.traffic.delayMin > 0 ? "text-amber-400" : "text-emerald-400"}>+{activeRoute.traffic.delayMin} min</strong></span>
                        </div>
                      </div>
                    )}

                    {/* Vehicle Passability Check Card */}
                    {activeRoute.vehiclePassability && (
                      <div
                        className={`p-2.5 rounded-xl border text-xs space-y-1 ${activeRoute.vehiclePassability.statusLevel === "SAFE"
                          ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                          : activeRoute.vehiclePassability.statusLevel === "CAUTION"
                            ? "bg-amber-950/40 border-amber-800/60 text-amber-300"
                            : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                          }`}
                      >
                        <div className="flex items-center justify-between font-bold text-[10px]">
                          <span>{VEHICLE_CONFIGS[selectedVehicle].icon} {VEHICLE_CONFIGS[selectedVehicle].name} Clearance</span>
                          <span className="font-mono text-[9px]">
                            {activeRoute.maxFloodDepthCm}cm / {activeRoute.vehiclePassability.clearanceCm}cm limit
                          </span>
                        </div>
                        <p className="text-[10px] leading-snug">{activeRoute.vehiclePassability.statusText}</p>
                      </div>
                    )}
                  </>
                ) : (
                  /* Walking Mode Walkability & Safety Card */
                  activeRoute.walkability && (
                    <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🚶</span>
                          <div>
                            <span className="text-[11px] font-bold text-slate-200 block">Walkability Score</span>
                            <span className="text-[9px] text-slate-400 font-mono">
                              {activeRoute.baseDurationMin}m base + {activeRoute.walkability.wadingDelayMin}m wading
                            </span>
                          </div>
                        </div>
                        <span
                          className="text-[10px] font-extrabold px-2 py-0.5 rounded-full"
                          style={{
                            backgroundColor: `${activeRoute.walkability.color}20`,
                            color: activeRoute.walkability.color,
                            border: `1px solid ${activeRoute.walkability.color}50`,
                          }}
                        >
                          {activeRoute.walkability.score}/100 • {activeRoute.walkability.label}
                        </span>
                      </div>

                      {activeRoute.walkability.safetyTips.length > 0 && (
                        <div className="p-2 rounded-lg bg-amber-950/30 border border-amber-800/40 text-[10px] space-y-1 text-amber-200">
                          {activeRoute.walkability.safetyTips.map((tip, i) => (
                            <div key={i} className="flex items-start gap-1">
                              <span className="mt-0.5">•</span>
                              <span>{tip}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                )}
              </div>
            )}

            {/* Suggested Routes Header */}
            <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between pt-1">
              <span>Suggested {travelMode === "walking" ? "Walking" : "Driving"} Routes</span>
              {loadingRoute && <span className="text-cyan-400 animate-pulse text-[10px]">Calculating...</span>}
            </div>

            {/* Suggested Routes List */}
            {routeOptions.length > 0 ? (
              routeOptions.map((option, idx) => (
                <div
                  key={option.id}
                  onClick={() => setSelectedRouteIdx(idx)}
                  className={`p-3 rounded-2xl border transition-all cursor-pointer ${selectedRouteIdx === idx
                    ? travelMode === "walking"
                      ? "bg-slate-800/90 border-cyan-500 ring-2 ring-cyan-500/40 shadow-lg"
                      : "bg-slate-800/90 border-blue-500 ring-2 ring-blue-500/40 shadow-lg"
                    : "bg-slate-950/60 border-slate-800/90 hover:border-slate-700"
                    }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 flex-wrap">
                        <span>{option.summary}</span>
                        {idx === 0 && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            {travelMode === "walking" ? "Shortest Walk" : "Fastest"}
                          </span>
                        )}
                      </h4>
                      <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
                        {option.distanceKm} km • {option.durationMin} mins {travelMode === "walking" ? "walk" : "drive"}
                      </p>
                    </div>

                    <div className="text-right flex-shrink-0">
                      <span
                        className={`text-base font-black font-mono ${travelMode === "walking" ? "text-cyan-400" : "text-blue-400"
                          }`}
                      >
                        {option.durationMin} <span className="text-[9px] font-sans text-slate-400">min</span>
                      </span>
                    </div>
                  </div>

                  {/* Flood Hazard & Mode Telemetry Alert Badges */}
                  <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono gap-1.5 flex-wrap">
                    <div className="flex items-center gap-1">
                      <span className="text-slate-400 text-[10px]">Max Flood:</span>
                      <span
                        className={`font-extrabold px-1.5 py-0.5 rounded-full text-[9px] ${option.maxFloodDepthCm > 30
                          ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                          : option.maxFloodDepthCm >= 16
                            ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                            : option.maxFloodDepthCm >= 6
                              ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                              : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                          }`}
                      >
                        {option.maxFloodDepthCm} cm ({option.overallStatus})
                      </span>
                    </div>

                    {travelMode === "driving" && option.traffic && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${option.traffic.color}15`,
                          color: option.traffic.color,
                          border: `1px solid ${option.traffic.color}40`,
                        }}
                      >
                        🚦 {option.traffic.label}
                      </span>
                    )}

                    {travelMode === "walking" && option.walkability && (
                      <span
                        className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${option.walkability.color}15`,
                          color: option.walkability.color,
                          border: `1px solid ${option.walkability.color}40`,
                        }}
                      >
                        🥾 {option.walkability.score}/100
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="p-4 sm:p-5 bg-slate-950/60 border border-slate-800/80 rounded-2xl text-center space-y-2">
                <div className="text-2xl">{travelMode === "walking" ? "🚶" : "🗺️"}</div>
                <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                  Select Origin & Destination
                </h4>
                <p className="text-[11px] text-slate-500 leading-relaxed">
                  Search locations above to calculate flood-safe {travelMode === "walking" ? "walking" : "driving"} directions and real-time inundation predictions.
                </p>
              </div>
            )}
          </div>

          {/* Active Route Quick Summary Footer inside Sidebar */}
          {activeRoute && (
            <div className="p-3 bg-slate-950/90 border-t border-slate-800/80 flex items-center justify-between gap-2 flex-shrink-0">
              <div className="min-w-0 flex-1">
                <strong className="text-white text-xs block font-bold truncate">
                  {activeRoute.summary}
                </strong>
                <span className="text-slate-400 text-[10px] block font-mono truncate">
                  {activeRoute.distanceKm} km • {activeRoute.durationMin}m • Flooded: {activeRoute.totalFloodedKm} km
                </span>
              </div>

              <span
                className={`font-black text-[10px] px-2 py-0.5 rounded-full border truncate flex-shrink-0 ${activeRoute.overallStatus === "SAFE"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : activeRoute.overallStatus === "CAUTION"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : activeRoute.overallStatus === "HIGH_RISK"
                      ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                  }`}
              >
                {travelMode === "walking"
                  ? activeRoute.walkability?.label || (activeRoute.overallStatus === "SAFE" ? "WALKABLE" : "WADING")
                  : activeRoute.overallStatus}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ── 4. FLOATING BUTTON TO RESTORE SIDEBAR (When Minimized) ────── */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="absolute top-18 sm:top-20 left-3 sm:left-4 z-[450] flex items-center gap-2 px-3.5 py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 hover:border-cyan-500/60 shadow-2xl backdrop-blur-xl transition-all active:scale-95"
          title="Open Directions & Route Panel"
        >
          <span>🧭</span>
          <span className="text-xs font-bold">Directions &amp; Routes</span>
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── 5. FLOATING MAP CONTROLS DOCK (Bottom Right) ──────────── */}
      <div className="absolute bottom-6 right-3 sm:right-4 z-[450] flex flex-col items-end gap-2 pointer-events-auto max-w-[calc(100vw-24px)]">
        {/* Legend Popup Card (Expands above the dock) */}
        {isLegendOpen && (
          <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 p-3 rounded-2xl shadow-2xl text-xs space-y-2 min-w-[210px] animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between font-bold text-slate-300 uppercase tracking-wider text-[10px]">
              <span>{travelMode === "walking" ? "🚶 Walkability Key" : "🚗 Route Flood Key"}</span>
              <button
                onClick={() => setIsLegendOpen(false)}
                className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800"
              >
                ✕
              </button>
            </div>

            {travelMode === "walking" ? (
              <div className="space-y-1.5 font-mono">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#06b6d4] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Clear Walk (0–5 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#eab308] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Boots Advised (6–15 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#f97316] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Hazardous Wading (16–25 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#ef4444] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">DO NOT WALK (&gt;25 cm)</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1.5 font-mono">
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#2563eb] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Clear Route (0–5 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#f97316] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Gutter Deep (6–15 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#ef4444] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Half-Tire Deep (16–30 cm)</span>
                </div>
                <div className="flex items-center gap-2 text-[11px]">
                  <span className="w-3.5 h-1.5 rounded-full bg-[#7f1d1d] shadow-sm flex-shrink-0"></span>
                  <span className="text-slate-300">Waist Deep+ (&gt;30 cm)</span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Unified Floating Action Toolbar */}
        <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 p-1 rounded-2xl shadow-2xl">
          {/* Toggle Legend */}
          <button
            onClick={() => setIsLegendOpen(!isLegendOpen)}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
              isLegendOpen
                ? "bg-cyan-600 text-white shadow-md"
                : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white"
            }`}
            title="Toggle Map Flood Risk Legend"
          >
            <span>🎨</span>
            <span>Legend</span>
          </button>

          {/* Recenter Map */}
          <button
            onClick={handleRecenter}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold transition-all active:scale-95"
            title="Center Map on Metro Manila"
          >
            <span>🧭</span>
            <span className="hidden sm:inline">Center Metro Manila</span>
            <span className="sm:hidden">Center</span>
          </button>

          {/* Quick Nearest Station Finder Trigger */}
          <button
            onClick={() => {
              setActiveDrawerTab("nearest-finder");
              setIsDrawerOpen(true);
            }}
            className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-[11px] font-bold transition-all active:scale-95"
            title="Find nearest telemetry station to your location"
          >
            <span>📍</span>
            <span className="hidden sm:inline">Nearest Station</span>
            <span className="sm:hidden">Nearest</span>
          </button>
        </div>
      </div>

      {/* ── 6. SLIDE-UP / FLOATING TELEMETRY & DATA TABLES DRAWER ──────── */}
      {isDrawerOpen && (
        <>
          {/* Backdrop overlay */}
          <div
            onClick={() => setIsDrawerOpen(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[600] animate-in fade-in duration-200"
          />

          {/* Drawer Container */}
          <div className="fixed bottom-0 left-0 right-0 max-h-[85vh] sm:max-h-[80vh] bg-slate-900/98 backdrop-blur-2xl border-t border-slate-700/80 rounded-t-3xl shadow-2xl z-[610] flex flex-col transition-all duration-300 animate-in slide-in-from-bottom duration-300">
            {/* Drawer Header with Tabs & Close */}
            <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-lg">📊</span>
                  <div>
                    <h2 className="text-sm sm:text-base font-bold text-white">
                      Hydrological Telemetry &amp; Road Predictions
                    </h2>
                    <p className="text-[10px] sm:text-xs text-slate-400">
                      Live PAGASA water levels, rainfall data &amp; monitored road corridors
                    </p>
                  </div>
                </div>

                {/* Close Button on Mobile Header */}
                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="sm:hidden p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
                >
                  ✕
                </button>
              </div>

              {/* Drawer Tab Switcher & Desktop Close */}
              <div className="flex items-center gap-2">
                <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs w-full sm:w-auto">
                  <button
                    onClick={() => {
                      setActiveDrawerTab("station-telemetry");
                      trackTableTabSwitch("station-telemetry");
                    }}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${activeDrawerTab === "station-telemetry"
                      ? "bg-cyan-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    💧 Stations ({activeStations.length})
                  </button>

                  <button
                    onClick={() => {
                      setActiveDrawerTab("road-predictions");
                      trackTableTabSwitch("road-predictions");
                    }}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${activeDrawerTab === "road-predictions"
                      ? "bg-cyan-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    🚗 Monitored Roads ({roadEvaluations.length})
                  </button>

                  <button
                    onClick={() => {
                      setActiveDrawerTab("nearest-finder");
                      trackTableTabSwitch("nearest-finder" as any);
                    }}
                    className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${activeDrawerTab === "nearest-finder"
                      ? "bg-cyan-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    📍 Nearest Finder
                  </button>
                </div>

                <button
                  onClick={() => setIsDrawerOpen(false)}
                  className="hidden sm:flex p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all"
                  title="Close Drawer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Drawer Body Content */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-4 sm:p-6 space-y-4">
              {/* TAB 1: Stations Telemetry Table */}
              {activeDrawerTab === "station-telemetry" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Click on any station to locate and inspect its real-time telemetry on the map.</span>
                  </div>
                  <StationTable
                    stations={activeStations}
                    selectedStationId={selectedStationId}
                    onSelectStation={(id) => {
                      setSelectedStationId(id);
                      const st = activeStations.find((s) => s.stationId === id);
                      if (st) {
                        trackStationSelected({
                          stationId: st.stationId,
                          stationName: st.stationName,
                          waterLevel: st.waterLevel,
                          riskLevel: st.riskLevel,
                          source: "table",
                        });
                      }
                      setIsDrawerOpen(false);
                    }}
                  />
                </div>
              )}

              {/* TAB 2: Monitored Roads Flood Predictions Table */}
              {activeDrawerTab === "road-predictions" && (
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                    {/* Severity Filters */}
                    <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs overflow-x-auto custom-scrollbar">
                      <button
                        onClick={() => setTableFilterSeverity("ALL")}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${tableFilterSeverity === "ALL"
                          ? "bg-cyan-600 text-white shadow-md"
                          : "text-slate-400 hover:text-slate-200"
                          }`}
                      >
                        All ({roadEvaluations.length})
                      </button>
                      <button
                        onClick={() => setTableFilterSeverity("CRITICAL")}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${tableFilterSeverity === "CRITICAL"
                          ? "bg-rose-600 text-white shadow-md"
                          : "text-slate-400 hover:text-rose-400"
                          }`}
                      >
                        Critical
                      </button>
                      <button
                        onClick={() => setTableFilterSeverity("ALARM")}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${tableFilterSeverity === "ALARM"
                          ? "bg-orange-600 text-white shadow-md"
                          : "text-slate-400 hover:text-orange-400"
                          }`}
                      >
                        Alarm
                      </button>
                      <button
                        onClick={() => setTableFilterSeverity("ALERT")}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${tableFilterSeverity === "ALERT"
                          ? "bg-amber-600 text-white shadow-md"
                          : "text-slate-400 hover:text-amber-400"
                          }`}
                      >
                        Alert
                      </button>
                      <button
                        onClick={() => setTableFilterSeverity("NORMAL")}
                        className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${tableFilterSeverity === "NORMAL"
                          ? "bg-emerald-600 text-white shadow-md"
                          : "text-slate-400 hover:text-emerald-400"
                          }`}
                      >
                        Normal
                      </button>
                    </div>

                    {/* Search Input */}
                    <div className="relative w-full sm:w-64">
                      <input
                        type="text"
                        value={tableSearchQuery}
                        onChange={(e) => setTableSearchQuery(e.target.value)}
                        placeholder="Filter road or station..."
                        className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 font-medium"
                      />
                      <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
                    </div>
                  </div>

                  {/* Mobile Cards View (<md) */}
                  <div className="grid grid-cols-1 gap-3 md:hidden">
                    {filteredRoadEvaluations.length > 0 ? (
                      filteredRoadEvaluations.map((road, idx) => (
                        <div
                          key={idx}
                          onClick={() => handleSelectRoad(road)}
                          className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${selectedRoadRisk?.roadName === road.roadName
                            ? "bg-slate-800/90 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg"
                            : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                            }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <strong className="text-white text-xs block font-bold">{road.roadName}</strong>
                              <span className="text-[10px] text-slate-500 font-mono">
                                Elev: {road.elevationMeters.toFixed(1)}m EL.m
                              </span>
                            </div>
                            <span
                              style={{ backgroundColor: road.color }}
                              className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full text-white tracking-wider shadow-sm flex-shrink-0"
                            >
                              {road.severity}
                            </span>
                          </div>

                          <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
                            <div>
                              <span className="text-[10px] text-slate-400 block">Est. Depth</span>
                              <strong style={{ color: road.color }} className="text-sm font-bold">
                                {road.estimatedDepthCm} cm
                              </strong>
                              <span className="text-[10px] text-slate-500 block">({road.depthCategory})</span>
                            </div>
                            <div>
                              <span className="text-[10px] text-slate-400 block">Hazard Score</span>
                              <strong className="text-sm font-bold text-cyan-400">
                                {road.hazardScore}
                              </strong>
                              <span className="text-[10px] text-slate-500"> / 100</span>
                            </div>
                          </div>

                          <div className="text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                            <span className="truncate max-w-[150px] text-slate-400">
                              📍 {road.nearestStation.stationName}
                            </span>
                            <div className="flex items-center gap-2 text-right text-[10px]">
                              <span>💧 {road.nearestStation.waterLevel.toFixed(2)}m</span>
                              <span>🌧️ {road.nearestStation.rain1h}mm</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between gap-2 pt-1">
                            <div className="flex flex-wrap gap-1 flex-1">
                              {road.drivableVehicles.slice(0, 2).map((v, i) => (
                                <span
                                  key={i}
                                  className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                                >
                                  🚗 {v}
                                </span>
                              ))}
                            </div>

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleFocusAndShareRoad(road);
                              }}
                              className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 flex-shrink-0"
                            >
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.368 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                              </svg>
                              <span>Share</span>
                            </button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="p-6 text-center text-slate-500 italic text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
                        No road segments match the selected filters.
                      </div>
                    )}
                  </div>

                  {/* Desktop Data Table (md+) */}
                  <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-800">
                    <table className="w-full text-left text-xs text-slate-300">
                      <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                        <tr>
                          <th className="px-4 py-3 font-semibold">Road Segment / Corridor</th>
                          <th className="px-4 py-3 font-semibold">Severity Status</th>
                          <th className="px-4 py-3 font-semibold">Predicted Depth</th>
                          <th className="px-4 py-3 font-semibold">Hazard Score</th>
                          <th className="px-4 py-3 font-semibold">Nearest Station</th>
                          <th className="px-4 py-3 font-semibold">Station Signal</th>
                          <th className="px-4 py-3 font-semibold">Passable Vehicles</th>
                          <th className="px-4 py-3 font-semibold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                        {filteredRoadEvaluations.length > 0 ? (
                          filteredRoadEvaluations.map((road, idx) => (
                            <tr
                              key={idx}
                              onClick={() => handleSelectRoad(road)}
                              className={`hover:bg-slate-800/70 transition-colors cursor-pointer ${selectedRoadRisk?.roadName === road.roadName ? "bg-slate-800/90" : ""
                                }`}
                            >
                              <td className="px-4 py-3">
                                <strong className="text-slate-100 block font-bold text-xs">{road.roadName}</strong>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  Elev: {road.elevationMeters.toFixed(1)}m EL.m
                                </span>
                              </td>

                              <td className="px-4 py-3">
                                <span
                                  style={{ backgroundColor: road.color }}
                                  className="text-[10px] font-extrabold px-2.5 py-1 rounded-full text-white tracking-wider shadow-sm inline-block"
                                >
                                  {road.severity}
                                </span>
                              </td>

                              <td className="px-4 py-3 font-mono">
                                <strong style={{ color: road.color }} className="text-sm">
                                  {road.estimatedDepthCm} cm
                                </strong>
                                <span className="block text-[10px] text-slate-400">({road.depthCategory})</span>
                              </td>

                              <td className="px-4 py-3 font-mono">
                                <span className="text-cyan-400 font-extrabold text-sm">{road.hazardScore}</span>
                                <span className="text-slate-500 text-[10px]"> / 100</span>
                              </td>

                              <td className="px-4 py-3">
                                <strong className="text-slate-200 block">{road.nearestStation.stationName}</strong>
                                <span className="text-[10px] text-slate-500 font-mono">
                                  {road.nearestStation.distanceKm} km away
                                </span>
                              </td>

                              <td className="px-4 py-3 font-mono text-[11px]">
                                <div>💧 Level: <strong>{road.nearestStation.waterLevel.toFixed(2)} m</strong></div>
                                <div className="text-slate-400">
                                  🌧️ 1h Rain: <strong>{road.nearestStation.rain1h} mm</strong>
                                </div>
                              </td>

                              <td className="px-4 py-3">
                                <div className="flex flex-wrap gap-1">
                                  {road.drivableVehicles.map((v, i) => (
                                    <span
                                      key={i}
                                      className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                                    >
                                      🚗 {v}
                                    </span>
                                  ))}
                                </div>
                              </td>

                              <td className="px-4 py-3 text-right">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleFocusAndShareRoad(road);
                                  }}
                                  className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 shadow-sm transition-all"
                                  title="Focus map on this corridor & share report"
                                >
                                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                                  </svg>
                                </button>
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={8} className="px-4 py-6 text-center text-slate-500 italic text-xs">
                              No road segments match the selected filters.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* TAB 3: Nearest Station Finder */}
              {activeDrawerTab === "nearest-finder" && (
                <div className="space-y-3">
                  <NearestStationFinder
                    stations={activeStations}
                    onSelectStation={(id) => {
                      setSelectedStationId(id);
                      setIsDrawerOpen(false);
                    }}
                    onSetUserLocation={(loc) => setUserLocation(loc)}
                  />
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── 7. SHARE REPORT MODAL ────────────────────────────────────── */}
      <ShareModal
        isOpen={isShareModalOpen}
        onClose={() => setIsShareModalOpen(false)}
        origin={originLoc.name ? originLoc : null}
        destination={destLoc.name ? destLoc : null}
        activeRoute={activeRoute}
        metrics={metrics}
        selectedRoad={selectedRoadRisk}
      />
    </div>
  );
}
