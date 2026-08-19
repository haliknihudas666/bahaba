"use client";

// ---------------------------------------------------------------------------
// Bahaba – Layout: Floating Map Legend Popover & Bottom-Right Toolbar
// ---------------------------------------------------------------------------

import type { TravelMode } from "@/lib/engine/routeSolver";

interface MapLegendProps {
  isOpen: boolean;
  onToggle: () => void;
  onClose: () => void;
  travelMode: TravelMode;
  onRecenter: () => void;
  onOpenNearestFinder: () => void;
  onOpenDonationModal: () => void;
}

export default function MapLegend({
  isOpen,
  onToggle,
  onClose,
  travelMode,
  onRecenter,
  onOpenNearestFinder,
  onOpenDonationModal,
}: MapLegendProps) {
  const isWalking = travelMode === "walking";

  return (
    <div className="absolute bottom-6 right-3 sm:right-4 z-[450] flex flex-col items-end gap-2 pointer-events-auto max-w-[calc(100vw-24px)]">
      {/* Legend Popup Card (Expands above the dock) */}
      {isOpen && (
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 p-3 rounded-2xl shadow-2xl text-xs space-y-2 min-w-[210px] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between font-bold text-slate-300 uppercase tracking-wider text-[10px]">
            <span>{isWalking ? "🚶 Walkability Key" : "🚗 Route Flood Key"}</span>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800"
            >
              ✕
            </button>
          </div>

          {isWalking ? (
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
          onClick={onToggle}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${
            isOpen
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
          onClick={onRecenter}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold transition-all active:scale-95"
          title="Center Map on Metro Manila"
        >
          <span>🧭</span>
          <span className="hidden sm:inline">Center Metro Manila</span>
          <span className="sm:hidden">Center</span>
        </button>

        {/* Quick Nearest Station Finder Trigger */}
        <button
          onClick={onOpenNearestFinder}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-300 hover:text-cyan-200 text-[11px] font-bold transition-all active:scale-95"
          title="Find nearest telemetry station to your location"
        >
          <span>📍</span>
          <span className="hidden sm:inline">Nearest Station</span>
          <span className="sm:hidden">Nearest</span>
        </button>

        {/* Angat Buhay Relief Donation Trigger */}
        <button
          onClick={onOpenDonationModal}
          className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-300 hover:text-white text-[11px] font-bold transition-all active:scale-95"
          title="Official Angat Buhay Flood Relief & Donation Channels"
        >
          <span>❤️</span>
          <span className="hidden sm:inline">Relief / Donate</span>
          <span className="sm:hidden">Donate</span>
        </button>
      </div>
    </div>
  );
}
