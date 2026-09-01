"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Flood Navigation & Telemetry Dashboard
// Google Maps-Style Full-Height Stacked Redesign
// ---------------------------------------------------------------------------

import { useState, useEffect, useMemo } from "react";
import { useTelemetry } from "@/hooks/useTelemetry";
import { useLiveFloodStatus, formatScrapedAt } from "@/hooks/useLiveFloodStatus";
import { useLiveAdvisories } from "@/hooks/useLiveAdvisories";
import RoadFloodMap from "@/components/Map/RoadFloodMap";
import RoutePlanner, { type LocationItemState } from "@/components/Navigation/RoutePlanner";
import DataTableModal, { type DataTableTabType } from "@/components/DataTableModal";
import MapHeaderControls, { type TelemetryMetrics, type HighRiskStationSummary } from "@/components/Layout/MapHeaderControls";
import TelemetrySidePanel from "@/components/Layout/TelemetrySidePanel";
import MapLegend from "@/components/Layout/MapLegend";
import ShareModal from "@/components/ShareModal";
import DonationModal from "@/components/DonationModal";
import AdvisoryWallModal from "@/components/Advisory/AdvisoryWallModal";
import AboutModal from "@/components/AboutModal";
import {
  fetchAndEvaluateRoute,
  type RouteOption,
  type TravelMode,
  type VehicleType,
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
  // 1. Dedicated Telemetry Hook (Delivers all stations nationwide)
  const {
    stations: activeStations,
    scrapedAt: telemetryScrapedAt,
    refresh: refreshTelemetry,
  } = useTelemetry();

  // 2. Viewport-Aware Live Flood Prediction Hook (Roads, Heatmap, Weather)
  const {
    evaluatedRoads: backendEvaluatedRoads,
    heatmapPoints: backendHeatmapPoints,
    weatherSummary,
    updateRegion,
  } = useLiveFloodStatus();

  const {
    advisories,
    activeFloodCount,
    isLoading: isLoadingAdvisories,
    isRefreshing: isRefreshingAdvisories,
    selectedAdvisory,
    setSelectedAdvisory,
    refreshAdvisories,
  } = useLiveAdvisories();

  // Layout & Modal Overlay States
  const [syncing, setSyncing] = useState<boolean>(false);
  const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
  const [, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const [isShareModalOpen, setIsShareModalOpen] = useState<boolean>(false);
  const [isDonationModalOpen, setIsDonationModalOpen] = useState<boolean>(false);
  const [isAdvisoryModalOpen, setIsAdvisoryModalOpen] = useState<boolean>(false);
  const [isAboutModalOpen, setIsAboutModalOpen] = useState<boolean>(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  const [isTelemetryOpen, setIsTelemetryOpen] = useState<boolean>(true);
  const [isTableModalOpen, setIsTableModalOpen] = useState<boolean>(false);
  const [recenterTrigger, setRecenterTrigger] = useState<number>(0);
  const [showFloodHeatmap, setShowFloodHeatmap] = useState<boolean>(true);
  const [showFloodHazard, setShowFloodHazard] = useState<boolean>(false);

  // Close flood safe directions sidebar & telemetry panel by default on mobile devices
  useEffect(() => {
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setIsSidebarOpen(false);
      setIsTelemetryOpen(false);
    }
  }, []);

  // Travel Mode (Driving vs Walking) & Vehicle Type State
  const [travelMode, setTravelMode] = useState<TravelMode>("driving");
  const [selectedVehicle, setSelectedVehicle] = useState<VehicleType>("all");

  // Data table tab state
  const [activeTableTab, setActiveTableTab] = useState<DataTableTabType>("station-telemetry");

  // Location state for Point A (Origin) and Point B (Destination)
  const [originLoc, setOriginLoc] = useState<LocationItemState>({
    id: "",
    name: "",
    subtext: "",
    coords: null,
  });

  const [destLoc, setDestLoc] = useState<LocationItemState>({
    id: "",
    name: "",
    subtext: "",
    coords: null,
  });

  // OSRM Driving/Walking Routes State
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteIdx, setSelectedRouteIdx] = useState<number>(0);
  const [loadingRoute, setLoadingRoute] = useState<boolean>(false);
  const [selectedRoadRisk, setSelectedRoadRisk] = useState<RoadRiskResult | null>(null);

  // Telemetry Sync Trigger
  const triggerTelemetrySync = async () => {
    setSyncing(true);
    trackTelemetrySync();
    try {
      await Promise.all([refreshTelemetry(), refreshAdvisories()]);
    } finally {
      setSyncing(false);
    }
  };

  // Recenter map to Metro Manila
  const handleRecenter = () => {
    setRecenterTrigger((prev) => prev + 1);
  };

  // Overall telemetry summary metrics
  const metrics: TelemetryMetrics = useMemo(() => {
    const total = activeStations.length;
    const highRiskStations: HighRiskStationSummary[] = [];

    let peakWater = 0;
    let peakWaterStation = "N/A";
    let peakWaterStationId: string | null = null;

    let maxRain1h = 0;
    let maxRain1hStation = "N/A";
    let maxRain1hStationId: string | null = null;

    let maxRain = 0;
    let maxRainStation = "N/A";
    let maxRainStationId: string | null = null;

    activeStations.forEach((s) => {
      if (s.riskLevel === "CRITICAL" || s.riskLevel === "ALARM" || s.riskLevel === "ALERT") {
        highRiskStations.push({
          stationId: s.stationId,
          stationName: s.stationName,
          waterLevel: s.waterLevel,
          riskLevel: s.riskLevel,
          rain1h: s.rain1h,
        });
      }

      if (s.waterLevel > peakWater) {
        peakWater = s.waterLevel;
        peakWaterStation = s.stationName;
        peakWaterStationId = s.stationId;
      }
      if (s.rain1h > maxRain1h) {
        maxRain1h = s.rain1h;
        maxRain1hStation = s.stationName;
        maxRain1hStationId = s.stationId;
      }
      if (s.rain24h > maxRain) {
        maxRain = s.rain24h;
        maxRainStation = s.stationName;
        maxRainStationId = s.stationId;
      }
    });

    // Sort high-risk stations by water level descending
    highRiskStations.sort((a, b) => b.waterLevel - a.waterLevel);

    return {
      total,
      highRisk: highRiskStations.length,
      highRiskStations,
      peakWater,
      peakWaterStation,
      peakWaterStationId,
      maxRain1h,
      maxRain1hStation,
      maxRain1hStationId,
      maxRain,
      maxRainStation,
      maxRainStationId,
    };
  }, [activeStations]);

  // Formatted observation / sync timestamp
  const lastUpdatedFormatted = useMemo(() => {
    if (!telemetryScrapedAt) return null;
    const d = new Date(telemetryScrapedAt);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleTimeString("en-PH", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  }, [telemetryScrapedAt]);

  // Formatted scrapedAt timestamp with date, time, and relative freshness
  const scrapedAtFormatted = useMemo(() => {
    return formatScrapedAt(telemetryScrapedAt);
  }, [telemetryScrapedAt]);

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

    // If backend pre-calculated road evaluations are available, use them directly
    if (backendEvaluatedRoads && backendEvaluatedRoads.length > 0) {
      return backendEvaluatedRoads;
    }

    // Default fallback: Evaluate monitored Metro Manila roads
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
        color: depthCm < 5 ? "#00b4d8" : classification.color,
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
        nationalRoute: road.nationalRoute,
        roadClassification: road.roadClassification,
        region: road.region,
        description: road.description,
      };
    });
  }, [activeRoute, activeStations, backendEvaluatedRoads]);

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
    setIsTableModalOpen(false);
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
    setIsTableModalOpen(false);
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
          heatmapPoints={backendHeatmapPoints}
          weatherSummary={weatherSummary}
          selectedStationId={selectedStationId}
          advisories={advisories}
          selectedAdvisory={selectedAdvisory}
          onSelectAdvisory={(advisory) => setSelectedAdvisory(advisory)}
          selectedRoad={selectedRoadRisk}
          originCoords={originLoc.coords}
          destinationCoords={destLoc.coords}
          fullRoutePolyline={activeRoute?.geometry}
          routeSegments={activeRoute?.segmentedRoute}
          travelMode={travelMode}
          recenterTrigger={recenterTrigger}
          showHeatmap={showFloodHeatmap}
          showHazard={showFloodHazard}
          onSelectRoad={(risk) => setSelectedRoadRisk(risk)}
          onRegionChange={updateRegion}
        />
      </div>

      {/* ── 2. TOP FLOATING HEADER / HUD BAR ───────────────────────────── */}
      <MapHeaderControls
        lastUpdatedFormatted={lastUpdatedFormatted}
        metrics={metrics}
        syncing={syncing}
        onSync={triggerTelemetrySync}
        onOpenDonationModal={() => setIsDonationModalOpen(true)}
        onOpenShareModal={() => setIsShareModalOpen(true)}
        onOpenAdvisoryModal={() => setIsAdvisoryModalOpen(true)}
        onOpenAboutModal={() => setIsAboutModalOpen(true)}
        activeAdvisoryCount={activeFloodCount}
        isTelemetryOpen={isTelemetryOpen}
        onToggleTelemetry={() => setIsTelemetryOpen((prev) => !prev)}
        onOpenDrawer={() => {
          setIsTableModalOpen(true);
          trackTableTabSwitch(activeTableTab);
        }}
      />

      {/* ── 3. FLOATING LEFT SEARCH & ROUTE SIDEBAR ────────────────────── */}
      <RoutePlanner
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        travelMode={travelMode}
        onTravelModeChange={setTravelMode}
        selectedVehicle={selectedVehicle}
        onSelectVehicle={setSelectedVehicle}
        originLoc={originLoc}
        destLoc={destLoc}
        onSelectOrigin={setOriginLoc}
        onSelectDest={setDestLoc}
        onSwapLocations={handleSwap}
        routeOptions={routeOptions}
        selectedRouteIdx={selectedRouteIdx}
        onSelectRouteIdx={setSelectedRouteIdx}
        loadingRoute={loadingRoute}
        activeRoute={activeRoute}
      />

      {/* ── 4. FLOATING RIGHT TELEMETRY & WEATHER SIDEBAR ──────────────── */}
      <TelemetrySidePanel
        isOpen={isTelemetryOpen}
        onClose={() => setIsTelemetryOpen(false)}
        metrics={metrics}
        lastUpdatedFormatted={lastUpdatedFormatted}
        scrapedAt={telemetryScrapedAt}
        scrapedAtFormatted={scrapedAtFormatted}
        syncing={syncing}
        onSync={triggerTelemetrySync}
        onOpenStationsTable={() => {
          setActiveTableTab("station-telemetry");
          setIsTableModalOpen(true);
          trackTableTabSwitch("station-telemetry");
        }}
        onOpenRoadsTable={() => {
          setActiveTableTab("road-predictions");
          setIsTableModalOpen(true);
          trackTableTabSwitch("road-predictions");
        }}
        onSelectStation={(id) => {
          setSelectedStationId(id);
          const st = activeStations.find((s) => s.stationId === id);
          if (st) {
            trackStationSelected({
              stationId: st.stationId,
              stationName: st.stationName,
              waterLevel: st.waterLevel,
              riskLevel: st.riskLevel,
              source: "telemetry-panel",
            });
          }
        }}
      />

      {/* ── 5. FLOATING BUTTON TO RESTORE DIRECTIONS (When Minimized) ─── */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="absolute top-[54px] sm:top-20 left-2.5 sm:left-4 z-[450] flex items-center gap-1.5 sm:gap-2 px-3 py-1.5 sm:px-3.5 sm:py-2.5 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-white border border-slate-700 hover:border-cyan-500/60 shadow-2xl backdrop-blur-xl transition-all active:scale-95"
          title="Open Directions & Route Panel"
        >
          <span>🧭</span>
          <span className="text-xs font-bold">Directions &amp; Routes</span>
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* ── 5. FLOATING MAP CONTROLS & DOCK (Bottom Right) ─────────────── */}
      <MapLegend
        travelMode={travelMode}
        showHeatmap={showFloodHeatmap}
        onToggleHeatmap={() => setShowFloodHeatmap((prev) => !prev)}
        showHazard={showFloodHazard}
        onToggleHazard={() => setShowFloodHazard((prev) => !prev)}
        onRecenter={handleRecenter}
      />

      {/* ── 6. HYDROLOGICAL TELEMETRY & MONITORED ROADS MODAL ─────────── */}
      <DataTableModal
        isOpen={isTableModalOpen}
        onClose={() => setIsTableModalOpen(false)}
        activeTab={activeTableTab}
        onTabChange={(tab) => {
          setActiveTableTab(tab);
          trackTableTabSwitch(tab);
        }}
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
        roadEvaluations={roadEvaluations}
        selectedRoad={selectedRoadRisk}
        onSelectRoad={handleSelectRoad}
        onShareRoad={handleFocusAndShareRoad}
      />

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

      {/* ── 8. ANGAT BUHAY RELIEF & DONATIONS MODAL ───────────────────── */}
      <DonationModal
        isOpen={isDonationModalOpen}
        onClose={() => setIsDonationModalOpen(false)}
      />

      {/* ── 9. OFFICIAL MMDA & NDRRMC ADVISORY WALL MODAL ─────────────── */}
      <AdvisoryWallModal
        isOpen={isAdvisoryModalOpen}
        onClose={() => setIsAdvisoryModalOpen(false)}
        advisories={advisories}
        activeFloodCount={activeFloodCount}
        isLoading={isLoadingAdvisories}
        isRefreshing={isRefreshingAdvisories}
        onRefresh={refreshAdvisories}
        onSelectAdvisory={(advisory) => {
          setSelectedAdvisory(advisory);
        }}
      />

      {/* ── 10. ABOUT BAHA BA? & DATA SOURCES ATTRIBUTIONS MODAL ────────── */}
      <AboutModal
        isOpen={isAboutModalOpen}
        onClose={() => setIsAboutModalOpen(false)}
        onOpenDonationModal={() => {
          setIsAboutModalOpen(false);
          setIsDonationModalOpen(true);
        }}
      />
    </div>
  );
}
