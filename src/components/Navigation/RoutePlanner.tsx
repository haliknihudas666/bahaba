"use client";

// ---------------------------------------------------------------------------
// Bahaba – Navigation: Route Planner & Directions Sidebar
// ---------------------------------------------------------------------------

import LocationAutocomplete from "@/components/LocationAutocomplete";
import RouteOptionCard from "./RouteOptionCard";
import {
  type RouteOption,
  type TravelMode,
  type VehicleType,
  VEHICLE_CONFIGS,
} from "@/lib/engine/routeSolver";

export interface LocationItemState {
  id: string;
  name: string;
  subtext: string;
  coords: [number, number] | null;
}

interface RoutePlannerProps {
  isOpen: boolean;
  onClose: () => void;
  travelMode: TravelMode;
  onTravelModeChange: (mode: TravelMode) => void;
  selectedVehicle: VehicleType;
  onSelectVehicle: (vehicle: VehicleType) => void;
  originLoc: LocationItemState;
  destLoc: LocationItemState;
  onSelectOrigin: (item: LocationItemState) => void;
  onSelectDest: (item: LocationItemState) => void;
  onSwapLocations: () => void;
  routeOptions: RouteOption[];
  selectedRouteIdx: number;
  onSelectRouteIdx: (idx: number) => void;
  loadingRoute: boolean;
  activeRoute?: RouteOption;
}

export default function RoutePlanner({
  isOpen,
  onClose,
  travelMode,
  onTravelModeChange,
  selectedVehicle,
  onSelectVehicle,
  originLoc,
  destLoc,
  onSelectOrigin,
  onSelectDest,
  onSwapLocations,
  routeOptions,
  selectedRouteIdx,
  onSelectRouteIdx,
  loadingRoute,
  activeRoute,
}: RoutePlannerProps) {
  const isWalking = travelMode === "walking";

  return (
    <div
      className={`absolute top-16 sm:top-20 left-3 sm:left-4 bottom-4 sm:bottom-6 z-[450] w-[calc(100vw-24px)] sm:w-[410px] md:w-[430px] max-w-[calc(100vw-32px)] flex flex-col pointer-events-auto transition-all duration-300 ease-in-out ${
        isOpen
          ? "translate-x-0 opacity-100"
          : "-translate-x-[calc(100%+32px)] pointer-events-none opacity-0"
      }`}
    >
      <div className="bg-slate-900/92 backdrop-blur-2xl border border-slate-800/90 rounded-3xl shadow-2xl flex flex-col h-full max-h-full overflow-hidden">
        {/* Sidebar Header & Toggle */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800/80 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-base">{isWalking ? "🚶" : "🚗"}</span>
            <span className="text-xs sm:text-sm font-bold text-white uppercase tracking-wider">
              Flood Safe Directions
            </span>
          </div>
          <button
            onClick={onClose}
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
              onClick={() => onTravelModeChange("driving")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                !isWalking
                  ? "bg-blue-600 text-white shadow-md shadow-blue-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🚗</span>
              <span>Drive (Vehicle)</span>
            </button>

            <button
              type="button"
              onClick={() => onTravelModeChange("walking")}
              className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 px-3 rounded-lg text-xs font-bold transition-all ${
                isWalking
                  ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              <span>🚶</span>
              <span>Walk (Pedestrian)</span>
            </button>
          </div>

          {/* Vehicle Type Selector (Only in Drive mode) */}
          {!isWalking && (
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
                      onClick={() => onSelectVehicle(vType)}
                      className={`flex flex-col items-center justify-center py-1 px-0.5 rounded-xl border text-center transition-all ${
                        isSelected
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
              label={`Point A (${isWalking ? "Start" : "Origin"})`}
              pointType="origin"
              value={originLoc.name}
              placeholder="Search origin, e.g. UST, SM San Lazaro..."
              onSelectLocation={(item) =>
                onSelectOrigin({
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
                onClick={onSwapLocations}
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
              label={`Point B (${isWalking ? "Destination" : "Destination"})`}
              pointType="destination"
              value={destLoc.name}
              placeholder="Search destination, e.g. SM Marikina..."
              onSelectLocation={(item) =>
                onSelectDest({
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
              {!isWalking ? (
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
                        <span>
                          Speed: <strong className="text-slate-200">{activeRoute.traffic.averageSpeedKmH} km/h</strong>
                        </span>
                        <span>
                          Delay:{" "}
                          <strong className={activeRoute.traffic.delayMin > 0 ? "text-amber-400" : "text-emerald-400"}>
                            +{activeRoute.traffic.delayMin} min
                          </strong>
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Vehicle Passability Check Card */}
                  {activeRoute.vehiclePassability && (
                    <div
                      className={`p-2.5 rounded-xl border text-xs space-y-1 ${
                        activeRoute.vehiclePassability.statusLevel === "SAFE"
                          ? "bg-emerald-950/40 border-emerald-800/60 text-emerald-300"
                          : activeRoute.vehiclePassability.statusLevel === "CAUTION"
                            ? "bg-amber-950/40 border-amber-800/60 text-amber-300"
                            : "bg-rose-950/40 border-rose-800/60 text-rose-300"
                      }`}
                    >
                      <div className="flex items-center justify-between font-bold text-[10px]">
                        <span>
                          {VEHICLE_CONFIGS[selectedVehicle].icon} {VEHICLE_CONFIGS[selectedVehicle].name} Clearance
                        </span>
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
            <span>Suggested {isWalking ? "Walking" : "Driving"} Routes</span>
            {loadingRoute && <span className="text-cyan-400 animate-pulse text-[10px]">Calculating...</span>}
          </div>

          {/* Suggested Routes List */}
          {routeOptions.length > 0 ? (
            routeOptions.map((option, idx) => (
              <RouteOptionCard
                key={option.id}
                option={option}
                index={idx}
                isSelected={selectedRouteIdx === idx}
                travelMode={travelMode}
                onSelect={onSelectRouteIdx}
              />
            ))
          ) : (
            <div className="p-4 sm:p-5 bg-slate-950/60 border border-slate-800/80 rounded-2xl text-center space-y-2">
              <div className="text-2xl">{isWalking ? "🚶" : "🗺️"}</div>
              <h4 className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Select Origin & Destination
              </h4>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                Search locations above to calculate flood-safe {isWalking ? "walking" : "driving"} directions and
                real-time inundation predictions.
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
              className={`font-black text-[10px] px-2 py-0.5 rounded-full border truncate flex-shrink-0 ${
                activeRoute.overallStatus === "SAFE"
                  ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                  : activeRoute.overallStatus === "CAUTION"
                    ? "bg-amber-500/20 text-amber-400 border-amber-500/40"
                    : activeRoute.overallStatus === "HIGH_RISK"
                      ? "bg-orange-500/20 text-orange-400 border-orange-500/40"
                      : "bg-rose-500/20 text-rose-400 border-rose-500/40"
              }`}
            >
              {isWalking
                ? activeRoute.walkability?.label || (activeRoute.overallStatus === "SAFE" ? "WALKABLE" : "WADING")
                : activeRoute.overallStatus}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
