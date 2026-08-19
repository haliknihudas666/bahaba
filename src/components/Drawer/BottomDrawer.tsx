"use client";

// ---------------------------------------------------------------------------
// Bahaba – Drawer: Sliding Telemetry & Road Predictions Drawer Container
// ---------------------------------------------------------------------------

import StationTable from "@/components/StationTable";
import NearestStationFinder from "@/components/NearestStationFinder";
import MonitoredRoadsTable from "./MonitoredRoadsTable";
import type { LiveStation } from "@/types";
import type { RoadRiskResult } from "@/lib/engine/roadRisk";

export type DrawerTabType = "station-telemetry" | "road-predictions" | "nearest-finder";

interface BottomDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DrawerTabType;
  onTabChange: (tab: DrawerTabType) => void;
  stations: LiveStation[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  roadEvaluations: RoadRiskResult[];
  selectedRoad: RoadRiskResult | null;
  onSelectRoad: (road: RoadRiskResult) => void;
  onShareRoad: (road: RoadRiskResult) => void;
  onSetUserLocation: (loc: { lat: number; lng: number }) => void;
}

export default function BottomDrawer({
  isOpen,
  onClose,
  activeTab,
  onTabChange,
  stations,
  selectedStationId,
  onSelectStation,
  roadEvaluations,
  selectedRoad,
  onSelectRoad,
  onShareRoad,
  onSetUserLocation,
}: BottomDrawerProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
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
              onClick={onClose}
              className="sm:hidden p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Drawer Tab Switcher & Desktop Close */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs w-full sm:w-auto">
              <button
                onClick={() => onTabChange("station-telemetry")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${
                  activeTab === "station-telemetry"
                    ? "bg-cyan-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                💧 Stations ({stations.length})
              </button>

              <button
                onClick={() => onTabChange("road-predictions")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${
                  activeTab === "road-predictions"
                    ? "bg-cyan-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🚗 Monitored Roads ({roadEvaluations.length})
              </button>

              <button
                onClick={() => onTabChange("nearest-finder")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${
                  activeTab === "nearest-finder"
                    ? "bg-cyan-600 text-white shadow-md"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                📍 Nearest Finder
              </button>
            </div>

            <button
              onClick={onClose}
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
          {activeTab === "station-telemetry" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Click on any station to locate and inspect its real-time telemetry on the map.</span>
              </div>
              <StationTable
                stations={stations}
                selectedStationId={selectedStationId}
                onSelectStation={onSelectStation}
              />
            </div>
          )}

          {/* TAB 2: Monitored Roads Flood Predictions Table */}
          {activeTab === "road-predictions" && (
            <MonitoredRoadsTable
              roadEvaluations={roadEvaluations}
              selectedRoad={selectedRoad}
              onSelectRoad={onSelectRoad}
              onShareRoad={onShareRoad}
            />
          )}

          {/* TAB 3: Nearest Station Finder */}
          {activeTab === "nearest-finder" && (
            <div className="space-y-3">
              <NearestStationFinder
                stations={stations}
                onSelectStation={onSelectStation}
                onSetUserLocation={onSetUserLocation}
              />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
