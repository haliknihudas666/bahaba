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
import ShareModal from "@/components/ShareModal";
import {
  fetchAndEvaluateRoute,
  type RouteOption,
} from "@/lib/engine/routeSolver";
import { type RoadRiskResult, type RoadSeverity, calculateHaversineDistance } from "@/lib/engine/roadRisk";
import { calculateWaterDepth, classifyFloodRisk } from "@/lib/engine/floodPredictor";
import noahRoadsDataset from "@/lib/data/noah-roads.json";
import { getStationCoords, slugifyStationId } from "@/lib/firebase/station-coords";
import {
  trackRouteCalculation,
  trackStationSelected,
  trackRoadSelected,
  trackTableTabSwitch,
} from "@/lib/firebase/analytics";
import type { LiveStation, ScrapeResult } from "@/types";
import type { NoahRoadSegment } from "@/types/flood-engine";


export default function HomePage() {
  const { stations: firestoreStations, loading: firestoreLoading } = useLiveFloodStatus();
  const [fallbackStations, setFallbackStations] = useState<LiveStation[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);

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

  // Initial Telemetry Fetch Fallback (if Firestore is empty/connecting)
  useEffect(() => {
    let isMounted = true;
    async function loadFallbackTelemetry() {
      try {
        const res = await fetch("/api/cron/ingest");
        if (res.ok) {
          const data: ScrapeResult = await res.json();
          if (isMounted && data.stations && data.stations.length > 0) {
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
        console.warn("[Telemetry Initial Load Warn]", err);
      }
    }

    if (firestoreStations.length === 0) {
      loadFallbackTelemetry();
    }

    return () => {
      isMounted = false;
    };
  }, [firestoreStations.length]);

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
      // 1. Calculate road centroid [lat, lng]
      let sumLat = 0;
      let sumLng = 0;
      road.coordinates.forEach(([lng, lat]) => {
        sumLat += lat;
        sumLng += lng;
      });
      const centLat = sumLat / road.coordinates.length;
      const centLng = sumLng / road.coordinates.length;

      // 2. Find nearest weather telemetry station (PAGASA FFWS or Panahon AWS)
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

      // 3. Compute predicted water depth
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

          if (routes.length > 0) {
            const fastest = routes[0];
            trackRouteCalculation({
              origin: originLoc.name,
              destination: destLoc.name,
              distanceKm: fastest.distanceKm,
              durationMin: fastest.durationMin,
              maxFloodDepthCm: fastest.maxFloodDepthCm,
              overallStatus: fastest.overallStatus,
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
  }, [originLoc.coords, destLoc.coords, activeStations]);

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
    const mapElement = document.getElementById("bahaba-interactive-map");
    if (mapElement) {
      mapElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
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
    const mapElement = document.getElementById("bahaba-interactive-map");
    if (mapElement) {
      mapElement.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    // Delay opening the modal to allow smooth map flyTo animation & tile loading to settle
    setTimeout(() => {
      setIsShareModalOpen(true);
    }, 750);
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans">
      {/* ── Top Header Bar ────────────────────────────────────────────── */}
      <header className="sticky top-0 z-50 bg-slate-900/90 backdrop-blur-md border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-3.5 sm:px-6 lg:px-8 py-3 flex items-center justify-between gap-2.5 sm:gap-4">
          <div className="flex items-center gap-2.5 sm:gap-3">
            <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-lg sm:text-xl shadow-lg shadow-cyan-500/20 flex-shrink-0">
              🌊
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-bold tracking-tight text-white flex items-center gap-1.5 sm:gap-2">
                Baha Ba?
                <span className="text-[10px] sm:text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  Metro Manila
                </span>
              </h1>
              <p className="text-[11px] sm:text-xs text-slate-400 hidden sm:block">
                Driving Directions & Predicted Flood Telemetry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            {/* Real-time Telemetry Live Indicator */}
            <div className="flex items-center gap-2 text-xs text-slate-300 bg-slate-950/80 px-2.5 sm:px-3 py-1.5 rounded-xl border border-slate-800 backdrop-blur shadow-sm">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span className="hidden sm:inline font-medium text-slate-200">PAGASA Telemetry</span>
            </div>

            {/* Share Report Button */}
            <button
              onClick={() => setIsShareModalOpen(true)}
              className="flex items-center gap-1.5 sm:gap-2 text-xs font-semibold px-2.5 sm:px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white shadow-md shadow-cyan-950/40 transition-all active:scale-95 flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
              </svg>
              <span>Share<span className="hidden sm:inline"> Report</span></span>
            </button>
          </div>
        </div>
      </header>

      {/* ── Main Container ───────────────────────────────────────────── */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-5 space-y-5 sm:space-y-6">
        {/* Metric Summary Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              Monitored Stations
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-white">
                {metrics.total}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 font-mono">Active</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              Active Alerts
            </div>
            <div className="flex items-baseline justify-between">
              <span
                className={`text-xl sm:text-2xl font-bold font-mono ${metrics.highRisk > 0 ? "text-amber-400" : "text-emerald-400"}`}
              >
                {metrics.highRisk}
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500 truncate max-w-[85px] sm:max-w-none">Critical/Alarm</span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              Peak Water Level
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-cyan-400">
                {metrics.peakWater.toFixed(2)} <span className="text-[10px] sm:text-xs font-sans text-slate-400">m</span>
              </span>
              <span className="text-[10px] sm:text-xs text-slate-400 truncate max-w-[85px] sm:max-w-[100px]">
                {metrics.peakWaterStation}
              </span>
            </div>
          </div>

          <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 sm:p-4 space-y-1 shadow-lg backdrop-blur">
            <div className="text-[11px] sm:text-xs font-semibold text-slate-400 uppercase tracking-wider truncate">
              Max 24h Rain
            </div>
            <div className="flex items-baseline justify-between">
              <span className="text-xl sm:text-2xl font-bold font-mono text-blue-400">
                {metrics.maxRain.toFixed(1)} <span className="text-[10px] sm:text-xs font-sans text-slate-400">mm</span>
              </span>
              <span className="text-[10px] sm:text-xs text-slate-500">24hr Total</span>
            </div>
          </div>
        </div>

        {/* ── TOP SECTION: Directions Inputs & Interactive Map ───────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-5 items-stretch">
          {/* ── LEFT PANEL: Point A & Point B Directions & Route Options ────── */}
          <div className="lg:col-span-5 flex flex-col space-y-4 bg-slate-900/90 border border-slate-800 rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-md">
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
            <div className="flex-1 space-y-3 overflow-y-auto max-h-[340px] sm:max-h-[360px] custom-scrollbar pr-1">
              <div className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>Suggested Driving Routes</span>
                {loadingRoute && <span className="text-cyan-400 animate-pulse text-[11px]">Calculating...</span>}
              </div>

              {routeOptions.length > 0 ? (
                routeOptions.map((option, idx) => (
                  <div
                    key={option.id}
                    onClick={() => setSelectedRouteIdx(idx)}
                    className={`p-3 sm:p-3.5 rounded-xl border transition-all cursor-pointer ${selectedRouteIdx === idx
                      ? "bg-slate-800/90 border-blue-500 ring-2 ring-blue-500/40 shadow-lg"
                      : "bg-slate-950/60 border-slate-800 hover:border-slate-700"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-2.5">
                      <div>
                        <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 sm:gap-2 flex-wrap">
                          <span>{option.summary}</span>
                          {idx === 0 && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                              Fastest
                            </span>
                          )}
                        </h4>
                        <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                          {option.distanceKm} km • {option.durationMin} mins driving
                        </p>
                      </div>

                      <div className="text-right flex-shrink-0">
                        <span className="text-base sm:text-lg font-black text-blue-400 font-mono">
                          {option.durationMin} <span className="text-[10px] sm:text-xs font-sans text-slate-400">min</span>
                        </span>
                      </div>
                    </div>

                    {/* Flood Hazard Alert Badge */}
                    <div className="mt-2.5 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono">
                      <span className="text-slate-400 text-[11px]">Max Flood:</span>
                      <span
                        className={`font-extrabold px-2 py-0.5 rounded-full text-[10px] sm:text-[11px] ${option.maxFloodDepthCm > 30
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
                <div className="p-5 sm:p-6 bg-slate-950/60 border border-slate-800 rounded-xl text-center space-y-2">
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
          <div className="lg:col-span-7 h-[420px] sm:h-[500px] lg:h-[600px] flex flex-col space-y-3">
            <div className="flex-1 rounded-2xl overflow-hidden shadow-2xl border border-slate-800">
              <RoadFloodMap
                stations={activeStations}
                selectedStationId={selectedStationId}
                selectedRoad={selectedRoadRisk}
                originCoords={originLoc.coords}
                destinationCoords={destLoc.coords}
                fullRoutePolyline={activeRoute?.geometry}
                routeSegments={activeRoute?.segmentedRoute}
                onSelectRoad={(risk) => setSelectedRoadRisk(risk)}
              />
            </div>

            {/* Active Route Summary Footer */}
            {activeRoute && (
              <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3 sm:p-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5 text-xs shadow-lg">
                <div className="flex items-center gap-2.5 sm:gap-3">
                  <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-blue-600/20 text-blue-400 border border-blue-500/40 flex items-center justify-center font-bold text-base sm:text-lg flex-shrink-0">
                    🛣️
                  </div>
                  <div className="min-w-0 flex-1">
                    <strong className="text-white text-xs sm:text-sm block font-bold truncate">{activeRoute.summary}</strong>
                    <span className="text-slate-400 text-[11px] sm:text-xs block truncate">
                      {activeRoute.distanceKm} km • {activeRoute.durationMin} mins • Flooded: {activeRoute.totalFloodedKm} km
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-800/80">
                  <span
                    className={`font-black text-[11px] sm:text-xs px-2.5 sm:px-3 py-1 rounded-full border truncate ${activeRoute.overallStatus === "SAFE"
                      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                      : activeRoute.overallStatus === "CAUTION"
                        ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                        : activeRoute.overallStatus === "HIGH_RISK"
                          ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                          : "bg-rose-500/20 text-rose-400 border-rose-500/40"
                      }`}
                  >
                    {activeRoute.overallStatus === "SAFE" && "✅ SAFE"}
                    {activeRoute.overallStatus === "CAUTION" && "⚠️ GUTTER DEEP"}
                    {activeRoute.overallStatus === "HIGH_RISK" && "🚨 HALF-TIRE"}
                    {activeRoute.overallStatus === "IMPASSABLE" && "⛔ IMPASSABLE"}
                  </span>

                  <button
                    onClick={() => setIsShareModalOpen(true)}
                    className="p-1.5 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 shadow-sm transition-all flex items-center gap-1 text-[11px] font-bold flex-shrink-0 active:scale-95"
                    title="Share this route & flood assessment"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                    </svg>
                    <span>Share</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── BOTTOM SECTION: Tables Below the Map ───────────────────────────── */}
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
          {/* Table View Switcher Bar */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>📊 Hydrological Telemetry & Road Tables</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-400">
                Detailed real-time data for PAGASA stations and monitored road corridors
              </p>
            </div>

            {/* Table Selector Tabs */}
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs w-full sm:w-auto">
              <button
                onClick={() => {
                  setActiveTableTab("station-telemetry");
                  trackTableTabSwitch("station-telemetry");
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${activeTableTab === "station-telemetry"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                💧 Stations Telemetry
              </button>
              <button
                onClick={() => {
                  setActiveTableTab("road-predictions");
                  trackTableTabSwitch("road-predictions");
                }}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${activeTableTab === "road-predictions"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
                  }`}
              >
                🚗 Monitored Roads
              </button>
            </div>
          </div>

          {/* TAB 1: Water Level & Rainfall Table (StationTable Component) */}
          {activeTableTab === "station-telemetry" && (
            <div className="space-y-4">
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
                }}
              />
            </div>
          )}

          {/* TAB 2: Monitored Road Flood Predictions Table */}
          {activeTableTab === "road-predictions" && (
            <div className="space-y-4">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                {/* Severity Filters (Scrollable on small screens) */}
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

                {/* Text Search Input */}
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

              {/* ── MOBILE CARDS VIEW (<md screens) ────────────────────── */}
              <div className="grid grid-cols-1 gap-3 md:hidden">
                {filteredRoadEvaluations.length > 0 ? (
                  filteredRoadEvaluations.map((road, idx) => (
                    <div
                      key={idx}
                      onClick={() => handleSelectRoad(road)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer space-y-2.5 ${selectedRoadRisk?.roadName === road.roadName
                        ? "bg-slate-800/90 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg"
                        : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                        }`}
                    >
                      {/* Card Header: Road Name, Elevation, Severity Pill */}
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

                      {/* Card Key Metrics */}
                      <div className="grid grid-cols-2 gap-2 p-2 rounded-lg bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
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

                      {/* Nearest Station & Hydro Signal */}
                      <div className="text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                        <span className="truncate max-w-[150px] text-slate-400">
                          📍 {road.nearestStation.stationName}
                        </span>
                        <div className="flex items-center gap-2 text-right text-[10px]">
                          <span>💧 {road.nearestStation.waterLevel.toFixed(2)}m</span>
                          <span>🌧️ {road.nearestStation.rain1h}mm</span>
                        </div>
                      </div>

                      {/* Passable Vehicles & Action Button */}
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
                          {road.drivableVehicles.length > 2 && (
                            <span className="text-[9px] text-slate-500 px-1">
                              +{road.drivableVehicles.length - 2} more
                            </span>
                          )}
                        </div>

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleFocusAndShareRoad(road);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 flex-shrink-0"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                          </svg>
                          <span>Share</span>
                        </button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-6 text-center text-slate-500 italic text-xs bg-slate-950/60 rounded-xl border border-slate-800">
                    No road segments match the selected filters.
                  </div>
                )}
              </div>

              {/* ── DESKTOP DATA TABLE (md+ screens) ────────────────────── */}
              <div className="hidden md:block overflow-x-auto rounded-xl border border-slate-800">
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
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 shadow-sm transition-all"
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

      {/* ── Share Modal ────────────────────────────────────────────── */}
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
