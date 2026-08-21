"use client";

// ---------------------------------------------------------------------------
// Bahaba – Modal: Hydrological Stations & Monitored Roads Data Table Modal
// Centered glassmorphic modal with searchable tables and quick map targeting
// ---------------------------------------------------------------------------

import { useEffect } from "react";
import StationTable from "@/components/StationTable";
import MonitoredRoadsTable from "@/components/Drawer/MonitoredRoadsTable";
import type { LiveStation } from "@/types";
import type { RoadRiskResult } from "@/lib/engine/roadRisk";

export type DataTableTabType = "station-telemetry" | "road-predictions";

interface DataTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  activeTab: DataTableTabType;
  onTabChange: (tab: DataTableTabType) => void;
  stations: LiveStation[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
  roadEvaluations: RoadRiskResult[];
  selectedRoad: RoadRiskResult | null;
  onSelectRoad: (road: RoadRiskResult) => void;
  onShareRoad: (road: RoadRiskResult) => void;
}

export default function DataTableModal({
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
}: DataTableModalProps) {
  // Handle ESC key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[600] flex items-center justify-center p-2.5 sm:p-6 animate-in fade-in duration-200">
      {/* Backdrop overlay */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/70 backdrop-blur-sm cursor-pointer"
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-5xl h-[88vh] sm:h-[82vh] bg-slate-900/98 backdrop-blur-2xl border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col z-10 overflow-hidden animate-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-shrink-0 bg-slate-950/50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-lg flex-shrink-0">
                📊
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-tight text-white">
                  Hydrological Telemetry &amp; Road Corridors
                </h2>
                <p className="text-[10px] sm:text-xs text-slate-400">
                  Live water levels, rainfall data &amp; monitored road flood evaluations
                </p>
              </div>
            </div>

            {/* Mobile Close Button */}
            <button
              onClick={onClose}
              className="sm:hidden p-1.5 rounded-xl bg-slate-800 text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>

          {/* Modal Tab Switcher & Desktop Close */}
          <div className="flex items-center gap-2">
            <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs w-full sm:w-auto">
              <button
                onClick={() => onTabChange("station-telemetry")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${
                  activeTab === "station-telemetry"
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                💧 Stations ({stations.length})
              </button>

              <button
                onClick={() => onTabChange("road-predictions")}
                className={`flex-1 sm:flex-none px-3 py-1.5 rounded-lg font-bold transition-all text-center ${
                  activeTab === "road-predictions"
                    ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                    : "text-slate-400 hover:text-slate-200"
                }`}
              >
                🚗 Monitored Roads ({roadEvaluations.length})
              </button>
            </div>

            <button
              onClick={onClose}
              className="hidden sm:flex p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all text-xs font-bold"
              title="Close Modal"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3.5 sm:p-6 space-y-4">
          {/* TAB 1: Stations Telemetry Table */}
          {activeTab === "station-telemetry" && (
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Click on any station to center and inspect its real-time telemetry on the map.</span>
              </div>
              <StationTable
                stations={stations}
                selectedStationId={selectedStationId}
                onSelectStation={(id) => {
                  onSelectStation(id);
                  onClose();
                }}
              />
            </div>
          )}

          {/* TAB 2: Monitored Roads Flood Predictions Table */}
          {activeTab === "road-predictions" && (
            <div className="space-y-3">
              <MonitoredRoadsTable
                roadEvaluations={roadEvaluations}
                selectedRoad={selectedRoad}
                onSelectRoad={(road) => {
                  onSelectRoad(road);
                  onClose();
                }}
                onShareRoad={onShareRoad}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
