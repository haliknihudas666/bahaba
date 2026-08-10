"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Flood Navigation & Telemetry Dashboard
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import { useLiveFloodStatus } from "@/hooks/useLiveFloodStatus";
import RoadFloodMap from "@/components/Map/RoadFloodMap";
import LocationAutocomplete from "@/components/LocationAutocomplete";
import StationTable from "@/components/StationTable";
import NearestStationFinder from "@/components/NearestStationFinder";
import {
  fetchAndEvaluateRoute,
  type RouteOption,
} from "@/lib/engine/routeSolver";
import { type RoadRiskResult, type RoadSeverity } from "@/lib/engine/roadRisk";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import type { LiveStation, ScrapeResult } from "@/types";

export default function HomePage() {
  const { stations: firestoreStations, loading: firestoreLoading } = useLiveFloodStatus();
  const [fallbackStations, setFallbackStations] = useState<LiveStation[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);

  // Table selector state below map: "station-telemetry" or "road-predictions"
  const [activeTableTab, setActiveTableTab] = useState<"station-telemetry" | "road-predictions">("station-telemetry");

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

  // OSRM Driving Routes State
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
    try {
      const res = await fetch("/api/cron/ingest");
      if (res.ok) {
        const data: ScrapeResult = await res.json();
        if (data.stations && data.stations.length > 0) {
          const mapped: LiveStation[] = data.stations.map((st) => {
            const fallbackCoords = getStationCoords(st.stationName);
            return {
              stationId: slugifyStationId(st.stationName),
              stationName: st.stationName,
              latitude: st.latitude ?? fallbackCoords.lat,
              longitude: st.longitude ?? fallbackCoords.lng,
              geohash: "",
              rain10m: st.rainfall?.rain10min ?? 0,
              rain1h: st.rainfall?.rain1hr ?? 0,
              rain24h: st.rainfall?.rain24hr ?? 0,
              waterLevel: st.waterLevel?.currentLevel ?? 0,
              waterLevelDelta1h: st.waterLevel?.change1hr ?? 0,
              waterRiskLevel: st.waterRiskLevel,
              rainRiskLevel: st.rainRiskLevel,
              riskLevel: st.riskLevel,
              lastUpdated: new Date(),
            };
          });
          setFallbackStations(mapped);
        }
      }
    } catch (err) {
      console.error("[Telemetry Sync Error]", err);
    } finally {
      setSyncing(false);
    }
  };

  useEffect(() => {
    triggerTelemetrySync();
  }, []);

  // Use Firestore telemetry stations when available; fall back to scraped data
  const activeStations = useMemo(() => {
    return firestoreStations.length > 0 ? firestoreStations : fallbackStations;
  }, [firestoreStations, fallbackStations]);

  // Overall telemetry summary metrics
  const metrics = useMemo(() => {
    const total = activeStations.length;
    const highRisk = activeStations.filter(
      (s) => s.riskLevel === "CRITICAL" || s.riskLevel === "ALARM" || s.riskLevel === "ALERT"
    ).length;

    let peakWater = 0;
    let peakWaterStation = "N/A";
    let maxRain = 0;

    activeStations.forEach((s) => {
      if (s.waterLevel > peakWater) {
        peakWater = s.waterLevel;
        peakWaterStation = s.stationName;
      }
      if (s.rain24h > maxRain) {
        maxRain = s.rain24h;
      }
    });

    return { total, highRisk, peakWater, peakWaterStation, maxRain };
  }, [activeStations]);

  const activeRoute = routeOptions[selectedRouteIdx] || routeOptions[0];

  // Calculate dynamic road flood evaluations based on active route and telemetry
  const roadEvaluations: RoadRiskResult[] = useMemo(() => {
    if (activeRoute && activeRoute.segmentedRoute.length > 0) {
      return activeRoute.segmentedRoute.map((seg, idx) => {
        const matchingStation = activeStations.find(
          (s) => s.stationName.toLowerCase() === seg.nearestStationName.toLowerCase()
        );

        const depthCategory =
          seg.depthCm > 30
            ? "Waist Deep+"
            : seg.depthCm > 15
            ? "Half-Tire Deep"
            : seg.depthCm > 5
            ? "Gutter Deep"
            : "Normal / Clear";

        const drivableVehicles =
          seg.depthCm > 30
            ? ["Truck / Heavy 4x4"]
            : seg.depthCm > 15
            ? ["SUV / Pickup", "Truck / Heavy 4x4"]
            : seg.depthCm > 5
            ? ["Sedan / Compact", "SUV / Pickup", "Truck / Heavy 4x4"]
            : ["All Vehicles (Sedan, Motorcycle, SUV)"];

        const midCoord = seg.coordinates[Math.floor(seg.coordinates.length / 2)] || [14.6, 121.0];

        return {
          roadName: `${activeRoute.summary} (Segment ${idx + 1})`,
          elevationMeters: 12.0,
          severity: seg.severity,
          color: seg.color,
          lineWeight: seg.severity === "CRITICAL" ? 6 : 4,
          estimatedDepthCm: seg.depthCm,
          depthCategory,
          nearestStation: {
            stationId: matchingStation?.stationId || "station-na",
            stationName: seg.nearestStationName,
            distanceKm: seg.nearestStationDistanceKm,
            waterLevel: matchingStation?.waterLevel ?? 0,
            rain1h: matchingStation?.rain1h ?? 0,
            delta1h: matchingStation?.waterLevelDelta1h ?? 0,
          },
          drivableVehicles,
          hazardScore: seg.hazardScore,
          centroid: midCoord,
          isNearRiver: false,
        };
      });
    }

    return activeStations.map((st) => {
      const isCritical = st.riskLevel === "CRITICAL" || st.waterRiskLevel === "CRITICAL";
      const isAlarm = st.riskLevel === "ALARM" || st.waterRiskLevel === "ALARM";
      const isAlert = st.riskLevel === "ALERT" || st.waterRiskLevel === "ALERT";

      const severity: RoadSeverity = isCritical
        ? "CRITICAL"
        : isAlarm
        ? "ALARM"
        : isAlert
        ? "ALERT"
        : "NORMAL";

      const estimatedDepthCm = isCritical ? 45 : isAlarm ? 25 : isAlert ? 10 : 0;

      const color =
        severity === "CRITICAL"
          ? "#7f1d1d"
          : severity === "ALARM"
          ? "#ef4444"
          : severity === "ALERT"
          ? "#f97316"
          : "#00b4d8";

      const depthCategory =
        estimatedDepthCm > 30
          ? "Waist Deep+"
          : estimatedDepthCm > 15
          ? "Half-Tire Deep"
          : estimatedDepthCm > 5
          ? "Gutter Deep"
          : "Normal / Clear";

      const drivableVehicles =
        estimatedDepthCm > 30
          ? ["Truck / Heavy 4x4"]
          : estimatedDepthCm > 15
          ? ["SUV / Pickup", "Truck / Heavy 4x4"]
          : estimatedDepthCm > 5
          ? ["Sedan / Compact", "SUV / Pickup", "Truck / Heavy 4x4"]
          : ["All Vehicles (Sedan, Motorcycle, SUV)"];

      return {
        roadName: `${st.stationName} Vicinity Corridor`,
        elevationMeters: 10.0,
        severity,
        color,
        lineWeight: 4,
        estimatedDepthCm,
        depthCategory,
        nearestStation: {
          stationId: st.stationId,
          stationName: st.stationName,
          distanceKm: 0.2,
          waterLevel: st.waterLevel,
          rain1h: st.rain1h,
          delta1h: st.waterLevelDelta1h,
        },
        drivableVehicles,
        hazardScore: isCritical ? 90 : isAlarm ? 65 : isAlert ? 35 : 5,
        centroid: [st.latitude, st.longitude] as [number, number],
        isNearRiver: false,
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

  // Fetch OSRM driving route whenever Point A or Point B or telemetry changes
  useEffect(() => {
    let isMounted = true;

    if (!originLoc.coords || !destLoc.coords) {
      setRouteOptions([]);
      setLoadingRoute(false);
      return;
    }

    setLoadingRoute(true);

    fetchAndEvaluateRoute(originLoc.coords, destLoc.coords, activeStations)
      .then((routes) => {
        if (isMounted) {
          setRouteOptions(routes);
          setSelectedRouteIdx(0);
          setLoadingRoute(false);
        }
      })
      .catch((err) => {
        console.error("Route calculation error:", err);
        if (isMounted) setLoadingRoute(false);
      });

    return () => {
      isMounted = false;
    };
  }, [originLoc.coords, destLoc.coords, activeStations]);

  // Swap Origin and Destination
  const handleSwap = () => {
    const temp = originLoc;
    setOriginLoc(destLoc);
    setDestLoc(temp);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xl shadow-lg shadow-cyan-500/20">
              🌊
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white flex items-center gap-2">
                Baha Ba?
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Metro Manila
                </span>
              </h1>
              <p className="text-xs text-slate-400 hidden sm:block">
                Driving Directions & Predicted Flood Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Live Indicator */}
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-300 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>PAGASA Telemetry</span>
            </div>

            {/* Sync Button */}
            <button
              onClick={triggerTelemetrySync}
              disabled={syncing}
              className="flex items-center gap-2 text-xs font-semibold px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-md transition-all disabled:opacity-50"
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
              <span>{syncing ? "Syncing..." : "Sync Telemetry"}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-5 space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Monitored Stations
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-white">
                {metrics.total}
              </span>
              <span className="text-xs text-slate-500 font-mono">Active</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Active Alerts / Warning
            </div>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-2xl font-bold font-mono ${metrics.highRisk > 0 ? "text-amber-400" : "text-emerald-400"}`}
              >
                {metrics.highRisk}
              </span>
              <span className="text-xs text-slate-500">Alert / Alarm / Critical</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Peak Water Level
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-cyan-400">
                {metrics.peakWater.toFixed(2)} <span className="text-xs font-sans text-slate-400">m</span>
              </span>
              <span className="text-xs text-slate-400 truncate max-w-[100px]">
                {metrics.peakWaterStation}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Max 24h Rainfall
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-2xl font-bold font-mono text-blue-400">
                {metrics.maxRain.toFixed(1)} <span className="text-xs font-sans text-slate-400">mm</span>
              </span>
              <span className="text-xs text-slate-500">24hr Cumulative</span>
            </div>
          </div>
        </div>

        {/* ── TOP SECTION: Directions Inputs & Interactive Map ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          {/* ── LEFT PANEL: Point A & Point B Directions & Route Options ────── */}
          <div className="lg:col-span-5 flex flex-col space-y-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-4 shadow-2xl backdrop-blur-md">
            {/* Location Autocomplete Search Group */}
            <div className="space-y-3 relative p-3 bg-slate-950/80 border border-slate-800 rounded-xl">
              <LocationAutocomplete
                label="Point A (Origin)"
                pointType="origin"
                value={originLoc.name}
                placeholder="Search origin, e.g. SM San Lazaro..."
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
              <div className="flex justify-end -my-2 relative z-10">
                <button
                  onClick={handleSwap}
                  title="Swap Origin & Destination"
                  className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 shadow-md transition-transform active:scale-95"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4" />
                  </svg>
                </button>
              </div>

              <LocationAutocomplete
                label="Point B (Destination)"
                pointType="destination"
                value={destLoc.name}
                placeholder="Search destination, e.g. SM Caloocan..."
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

            {/* Suggested Driving Routes List */}
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[360px] custom-scrollbar pr-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Suggested Driving Routes</span>
                {loadingRoute && <span className="text-cyan-400 animate-pulse">Calculating...</span>}
              </div>

              {routeOptions.length > 0 ? (
                routeOptions.map((option, idx) => (
                  <div
                    key={option.id}
                    onClick={() => setSelectedRouteIdx(idx)}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer ${selectedRouteIdx === idx
                      ? "bg-slate-800/90 border-blue-500 ring-2 ring-blue-500/40 shadow-lg"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <h4 className="text-sm font-extrabold text-white flex items-center gap-2">
                          <span>{option.summary}</span>
                          {idx === 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              Fastest
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {option.distanceKm} km • {option.durationMin} mins driving
                        </p>
                      </div>

                      <div className="text-right">
                        <span className="text-lg font-black text-blue-400 font-mono">
                          {option.durationMin} <span className="text-xs font-sans text-slate-400">min</span>
                        </span>
                      </div>
                    </div>

                    {/* Flood Hazard Alert Badge */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400">Max Flood Depth:</span>
                      <span
                        className={`font-extrabold px-2 py-0.5 rounded-full text-[11px] ${option.maxFloodDepthCm > 30
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

                    {/* Specific Warning Details */}
                    {option.warnings.length > 0 && (
                      <div className="mt-2 text-[11px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-lg space-y-1">
                        {option.warnings.map((w, i) => (
                          <div key={i} className="flex items-center gap-1.5">
                            <span>⚠️</span> <span>{w}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-2">
                  <div className="text-2xl">🗺️</div>
                  <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Select Point A & Point B
                  </h4>
                  <p className="text-xs text-slate-500">
                    Search and pick origin and destination locations above to calculate flood-safe driving directions.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT PANEL: Interactive Leaflet Map ─────────────────────────── */}
          <div className="lg:col-span-7 h-[600px] flex flex-col space-y-3">
            <div className="flex-1 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <RoadFloodMap
                stations={activeStations}
                selectedStationId={selectedStationId}
                originCoords={originLoc.coords}
                destinationCoords={destLoc.coords}
                fullRoutePolyline={activeRoute?.geometry}
                routeSegments={activeRoute?.segmentedRoute}
                onSelectRoad={(risk) => setSelectedRoadRisk(risk)}
              />
            </div>

            {/* Active Route Summary Footer */}
            {activeRoute && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 flex items-center justify-between text-xs shadow-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-lg">
                    🛣️
                  </div>
                  <div>
                    <strong className="text-white text-sm block font-bold">{activeRoute.summary}</strong>
                    <span className="text-slate-400">
                      Total: {activeRoute.distanceKm} km | {activeRoute.durationMin} mins | Flooded: {activeRoute.totalFloodedKm} km
                    </span>
                  </div>
                </div>

                <div className="text-right">
                  <span
                    className={`font-black text-xs px-3 py-1 rounded-full border ${activeRoute.overallStatus === "SAFE"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : activeRoute.overallStatus === "CAUTION"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        : activeRoute.overallStatus === "HIGH_RISK"
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                          : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                      }`}
                  >
                    {activeRoute.overallStatus === "SAFE" && "✅ SAFE / CLEAR"}
                    {activeRoute.overallStatus === "CAUTION" && "⚠️ GUTTER DEEP WARNING"}
                    {activeRoute.overallStatus === "HIGH_RISK" && "🚨 HALF-TIRE ALARM"}
                    {activeRoute.overallStatus === "IMPASSABLE" && "⛔ IMPASSABLE FLOOD"}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM SECTION: Tables Below the Map ───────────────────────────── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
          {/* Table View Switcher Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <span>📊 Hydrological Telemetry & Flood Condition Tables</span>
              </h2>
              <p className="text-xs text-slate-400">
                Detailed real-time data for PAGASA stations and monitored road corridors
              </p>
            </div>

            {/* Table Selector Tabs */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
              <button
                onClick={() => setActiveTableTab("station-telemetry")}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${activeTableTab === "station-telemetry"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                💧 Water Level & Rainfall Table
              </button>
              <button
                onClick={() => setActiveTableTab("road-predictions")}
                className={`px-3.5 py-1.5 rounded-lg font-bold transition-all ${activeTableTab === "road-predictions"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                🚗 Monitored Road Corridors
              </button>
            </div>
          </div>

          {/* TAB 1: Water Level & Rainfall Table (StationTable Component) */}
          {activeTableTab === "station-telemetry" && (
            <div className="space-y-4">
              <StationTable
                stations={activeStations}
                selectedStationId={selectedStationId}
                onSelectStation={(id) => setSelectedStationId(id)}
              />
            </div>
          )}

          {/* TAB 2: Monitored Road Flood Predictions Table */}
          {activeTableTab === "road-predictions" && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                {/* Severity Filters */}
                <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs">
                  <button
                    onClick={() => setTableFilterSeverity("ALL")}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${tableFilterSeverity === "ALL"
                      ? "bg-cyan-600 text-white shadow-md"
                      : "text-slate-400 hover:text-slate-200"
                      }`}
                  >
                    All ({roadEvaluations.length})
                  </button>
                  <button
                    onClick={() => setTableFilterSeverity("CRITICAL")}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${tableFilterSeverity === "CRITICAL"
                      ? "bg-rose-600 text-white shadow-md"
                      : "text-slate-400 hover:text-rose-400"
                      }`}
                  >
                    Critical
                  </button>
                  <button
                    onClick={() => setTableFilterSeverity("ALARM")}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${tableFilterSeverity === "ALARM"
                      ? "bg-orange-600 text-white shadow-md"
                      : "text-slate-400 hover:text-orange-400"
                      }`}
                  >
                    Alarm
                  </button>
                  <button
                    onClick={() => setTableFilterSeverity("ALERT")}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${tableFilterSeverity === "ALERT"
                      ? "bg-amber-600 text-white shadow-md"
                      : "text-slate-400 hover:text-amber-400"
                      }`}
                  >
                    Alert
                  </button>
                  <button
                    onClick={() => setTableFilterSeverity("NORMAL")}
                    className={`px-2.5 py-1 rounded-lg font-semibold transition-all ${tableFilterSeverity === "NORMAL"
                      ? "bg-emerald-600 text-white shadow-md"
                      : "text-slate-400 hover:text-emerald-400"
                      }`}
                  >
                    Normal
                  </button>
                </div>

                {/* Text Search Input */}
                <div className="relative">
                  <input
                    type="text"
                    value={tableSearchQuery}
                    onChange={(e) => setTableSearchQuery(e.target.value)}
                    placeholder="Filter road or station..."
                    className="bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 font-medium"
                  />
                  <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
                </div>
              </div>

              {/* Data Table */}
              <div className="overflow-x-auto rounded-xl border border-slate-800">
                <table className="w-full text-left text-xs text-slate-300">
                  <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3 font-semibold">Road Segment / Corridor</th>
                      <th className="px-4 py-3 font-semibold">Severity Status</th>
                      <th className="px-4 py-3 font-semibold">Predicted Depth</th>
                      <th className="px-4 py-3 font-semibold">Hazard Score</th>
                      <th className="px-4 py-3 font-semibold">Nearest PAGASA Station</th>
                      <th className="px-4 py-3 font-semibold">Station Hydro Signal</th>
                      <th className="px-4 py-3 font-semibold">Passable Vehicles</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
                    {filteredRoadEvaluations.length > 0 ? (
                      filteredRoadEvaluations.map((road, idx) => (
                        <tr
                          key={idx}
                          onClick={() => setSelectedRoadRisk(road)}
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
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={7} className="px-4 py-6 text-center text-slate-500 italic text-xs">
                          No road segments match the selected filters.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* ── Geo-Search Widget ─────────────────────────────────────── */}
        <NearestStationFinder
          stations={activeStations}
          onSelectStation={(id) => setSelectedStationId(id)}
          onSetUserLocation={(loc) => setUserLocation(loc)}
        />
      </main>

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <footer className="border-t border-slate-800 bg-slate-950 py-6 text-center text-xs text-slate-500 space-y-1">
        <p>🌊 Bahaba – Metro Manila Driving Directions & Hydrological Flood Monitoring System</p>
        <p>Data powered by PAGASA / DOST Telemetry feeds, OSRM Driving Engine & Leaflet Canvas</p>
      </footer>
    </div>
  );
}
