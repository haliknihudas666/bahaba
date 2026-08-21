"use client";

// ---------------------------------------------------------------------------
// Bahaba – Layout: Floating Map Dock (Overlays, Legend, Recenter, Nearest)
// ---------------------------------------------------------------------------

import { useState } from "react";
import type { TravelMode } from "@/lib/engine/routeSolver";

interface MapLegendProps {
  travelMode: TravelMode;
  showHeatmap: boolean;
  onToggleHeatmap: () => void;
  showHazard: boolean;
  onToggleHazard: () => void;
  onRecenter: () => void;
}

/**
 * Sleek, accessible iOS-style Toggle Switch
 */
function ToggleSwitch({
  checked,
  onChange,
  activeColor = "#fb923c",
  activeGlow = "rgba(249, 115, 22, 0.4)",
  id,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  activeColor?: string;
  activeGlow?: string;
  id: string;
  label: string;
}) {
  return (
    <button
      id={id}
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={onChange}
      type="button"
      style={{
        position: "relative",
        width: 36,
        height: 20,
        borderRadius: 9999,
        backgroundColor: checked ? activeColor : "rgba(30, 41, 59, 0.9)",
        border: checked
          ? `1.5px solid ${activeColor}`
          : "1.5px solid rgba(71, 85, 105, 0.6)",
        cursor: "pointer",
        transition: "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        boxShadow: checked ? `0 0 8px ${activeGlow}` : "inset 0 1px 2px rgba(0,0,0,0.4)",
        padding: 0,
        outline: "none",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          display: "block",
          width: 14,
          height: 14,
          borderRadius: "50%",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
          transform: checked ? "translateX(16px)" : "translateX(2px)",
          transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        }}
      />
    </button>
  );
}

export default function MapLegend({
  travelMode,
  showHeatmap,
  onToggleHeatmap,
  showHazard,
  onToggleHazard,
  onRecenter,
}: MapLegendProps) {
  const [activePopover, setActivePopover] = useState<"legend" | "overlays" | null>(null);
  const isWalking = travelMode === "walking";
  const activeOverlayCount = [showHeatmap, showHazard].filter(Boolean).length;

  const togglePopover = (type: "legend" | "overlays") => {
    setActivePopover((prev) => (prev === type ? null : type));
  };

  return (
    <div className="absolute bottom-3 right-3 sm:bottom-5 sm:right-4 z-[450] flex flex-col items-end gap-2 pointer-events-auto max-w-[calc(100vw-24px)]">
      {/* ── 1. MAP OVERLAYS POPOVER CARD ────────────────────────────────── */}
      {activePopover === "overlays" && (
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 rounded-2xl p-3.5 shadow-2xl w-[280px] sm:w-[290px] max-w-[calc(100vw-32px)] flex flex-col gap-2.5 animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-sm">🗺️</span>
              <span className="text-xs font-bold text-slate-100">Map Overlays</span>
              <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[10px] font-extrabold font-mono">
                {activeOverlayCount} Active
              </span>
            </div>
            <button
              onClick={() => setActivePopover(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs"
              title="Close overlays card"
            >
              ✕
            </button>
          </div>

          {/* Layer 1: Live Flood Heatmap */}
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🔥</span>
                <div>
                  <div className="text-xs font-bold text-slate-100 leading-tight">
                    Live Flood Heatmap
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                    Telemetry &amp; weather prediction
                  </div>
                </div>
              </div>

              <ToggleSwitch
                id="dock-toggle-flood-heatmap"
                label="Toggle Live Flood Inundation Heatmap"
                checked={showHeatmap}
                onChange={onToggleHeatmap}
                activeColor="#f97316"
                activeGlow="rgba(249, 115, 22, 0.45)"
              />
            </div>

            {showHeatmap && (
              <div className="pt-1.5 border-t border-slate-800/60 flex flex-col gap-1">
                <div
                  className="h-1.5 rounded-full w-full"
                  style={{
                    background: "linear-gradient(to right, #00b4d8, #eab308, #f97316, #ef4444)",
                  }}
                />
                <div className="flex justify-between text-[9px] font-mono text-slate-400">
                  <span>Passable (&lt;5cm)</span>
                  <span>Half-Tire</span>
                  <span className="text-rose-400 font-bold">Critical (&gt;30cm)</span>
                </div>
              </div>
            )}
          </div>

          {/* Layer 2: UP NOAH 100-Year Flood Hazard Polygons */}
          <div className="p-2.5 rounded-xl bg-slate-950/70 border border-slate-800/80 flex flex-col gap-1.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="text-sm">🌊</span>
                <div>
                  <div className="text-xs font-bold text-slate-100 leading-tight">
                    NOAH Flood Risk Hazard
                  </div>
                  <div className="text-[10px] text-slate-400 leading-tight">
                    Worst-case scenario using 100-year return of UP NOAH
                  </div>
                </div>
              </div>

              <ToggleSwitch
                id="dock-toggle-noah-hazard"
                label="Toggle UP NOAH 100-Year Flood Hazard Overlay"
                checked={showHazard}
                onChange={onToggleHazard}
                activeColor="#0284c7"
                activeGlow="rgba(2, 132, 199, 0.45)"
              />
            </div>
          </div>
        </div>
      )}

      {/* ── 2. LEGEND POPOVER CARD ─────────────────────────────────────── */}
      {activePopover === "legend" && (
        <div className="bg-slate-900/95 backdrop-blur-2xl border border-slate-800 p-3 rounded-2xl shadow-2xl text-xs space-y-2 min-w-[210px] animate-in fade-in zoom-in-95 duration-150">
          <div className="flex items-center justify-between font-bold text-slate-300 uppercase tracking-wider text-[10px]">
            <span>{isWalking ? "🚶 Walkability Key" : "🚗 Route Flood Key"}</span>
            <button
              onClick={() => setActivePopover(null)}
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

      {/* ── 3. UNIFIED FLOATING ACTION TOOLBAR ──────────────────────────── */}
      <div className="flex items-center gap-1 sm:gap-2 bg-slate-900/90 backdrop-blur-xl border border-slate-800/90 p-1 rounded-2xl shadow-2xl">
        {/* Toggle Overlays Button */}
        <button
          onClick={() => togglePopover("overlays")}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${activePopover === "overlays"
            ? "bg-cyan-600 text-white shadow-md"
            : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white"
            }`}
          title="Toggle Map Overlays & Layers"
        >
          <span>🗺️</span>
          <span>Overlays</span>
          <span className="px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 text-[9px] font-extrabold font-mono">
            {activeOverlayCount}
          </span>
        </button>

        {/* Toggle Legend Button */}
        <button
          onClick={() => togglePopover("legend")}
          className={`flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all active:scale-95 ${activePopover === "legend"
            ? "bg-cyan-600 text-white shadow-md"
            : "bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white"
            }`}
          title="Toggle Map Flood Risk Legend"
        >
          <span>🎨</span>
          <span>Legend</span>
        </button>

        {/* Recenter Map Button */}
        <button
          onClick={onRecenter}
          className="flex items-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white text-[11px] font-bold transition-all active:scale-95"
          title="Center Map on Metro Manila"
        >
          <span>🧭</span>
          <span className="hidden sm:inline">Center Metro Manila</span>
          <span className="sm:hidden">Center</span>
        </button>
      </div>
    </div>
  );
}
