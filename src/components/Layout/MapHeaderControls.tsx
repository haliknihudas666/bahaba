"use client";

// ---------------------------------------------------------------------------
// Bahaba – Layout: Floating Map Header & HUD Metric Chips
// ---------------------------------------------------------------------------

export interface TelemetryMetrics {
  total: number;
  highRisk: number;
  peakWater: number;
  peakWaterStation: string;
  maxRain1h: number;
  maxRain: number;
}

interface MapHeaderControlsProps {
  lastUpdatedFormatted: string | null;
  metrics: TelemetryMetrics;
  syncing: boolean;
  onSync: () => void;
  onOpenDonationModal: () => void;
  onOpenShareModal: () => void;
  onOpenDrawer: () => void;
  onOpenAdvisoryModal: () => void;
  onOpenAboutModal: () => void;
  activeAdvisoryCount?: number;
}

export default function MapHeaderControls({
  lastUpdatedFormatted,
  metrics,
  syncing,
  onSync,
  onOpenDonationModal,
  onOpenShareModal,
  onOpenDrawer,
  onOpenAdvisoryModal,
  onOpenAboutModal,
  activeAdvisoryCount = 0,
}: MapHeaderControlsProps) {
  return (
    <header className="absolute top-2.5 left-2.5 right-2.5 sm:top-4 sm:left-4 sm:right-4 z-[500] pointer-events-none flex items-center justify-between gap-1.5 sm:gap-4">
      {/* Left: Brand Logo & Live Pulse */}
      <button
        onClick={onOpenAboutModal}
        className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800/95 backdrop-blur-xl border border-slate-800/90 hover:border-cyan-500/50 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl shadow-2xl flex-shrink-0 transition-all text-left group"
        title="About Baha Ba? & Data Attributions"
      >
        <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-sm sm:text-lg shadow-md shadow-cyan-500/30 flex-shrink-0 group-hover:scale-105 transition-transform">
          🌊
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <h1 className="text-xs sm:text-base font-black tracking-tight text-white leading-none group-hover:text-cyan-300 transition-colors">
              Baha Ba?
            </h1>
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
          </div>
          <div className="text-[9px] sm:text-[10px] text-slate-400 leading-tight">
            <span className="hidden sm:inline">PAGASA Live • </span>
            {lastUpdatedFormatted ? (
              <span className="font-mono text-slate-300">{lastUpdatedFormatted}</span>
            ) : (
              <span>Live</span>
            )}
          </div>
        </div>
      </button>

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
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-xl border text-xs transition-colors ${
            metrics.highRisk > 0
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
          title={
            metrics.peakWaterStation !== "N/A"
              ? `Peak River Water Level: ${metrics.peakWater.toFixed(2)}m (${metrics.peakWaterStation})`
              : "Peak River Water Level"
          }
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
        >
          <span className="text-xs">🌊</span>
          <span className="text-slate-400 font-medium">Peak River Level:</span>
          <strong className="text-cyan-400 font-bold font-mono">
            {metrics.peakWater.toFixed(2)}m
          </strong>
        </div>

        {/* Chip 4: Max 1h Rainfall */}
        <div
          title="Highest 1-Hour Rainfall Intensity recorded across all stations"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
        >
          <span className="text-xs">🌧️</span>
          <span className="text-slate-400 font-medium">Max 1h Rain:</span>
          <strong className="text-sky-400 font-bold font-mono">
            {metrics.maxRain1h.toFixed(1)}mm
          </strong>
        </div>

        {/* Chip 5: Max 24h Rainfall */}
        <div
          title="Highest 24-Hour Accumulated Rainfall recorded across all stations"
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-xl bg-slate-950/70 border border-slate-800/80 text-xs"
        >
          <span className="text-xs">☔</span>
          <span className="text-slate-400 font-medium">Max 24h Rain:</span>
          <strong className="text-blue-400 font-bold font-mono">
            {metrics.maxRain.toFixed(1)}mm
          </strong>
        </div>
      </div>

      {/* Right: Quick Action Buttons */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-2">
        {/* Official Advisory Wall Button */}
        <button
          onClick={onOpenAdvisoryModal}
          className="flex items-center gap-1.5 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-amber-300 border border-amber-500/40 hover:border-amber-500/70 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
          title="Open MMDA & NDRRMC Live Official Advisory Wall"
        >
          <span className="text-xs">📢</span>
          <span className="hidden sm:inline">Advisories</span>
          {activeAdvisoryCount > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[9px] font-extrabold shadow-sm animate-pulse">
              {activeAdvisoryCount}
            </span>
          )}
        </button>

        {/* Relief & Donation Drive Button */}
        <button
          onClick={onOpenDonationModal}
          className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white border border-rose-400/40 shadow-xl shadow-rose-950/50 backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
          title="Official Angat Buhay Flood Relief & Donation Channels"
        >
          <span className="text-xs">❤️</span>
          <span className="hidden sm:inline">Donate</span>
        </button>

        {/* Tables & Stations Drawer Button */}
        <button
          onClick={onOpenDrawer}
          className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
          title="Open PAGASA Stations & Monitored Road Tables"
        >
          <span className="text-xs">📊</span>
          <span className="hidden sm:inline">Tables</span>
          {metrics.highRisk > 0 && (
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
          )}
        </button>

        {/* Share Report Button */}
        <button
          onClick={onOpenShareModal}
          className="flex items-center gap-1 text-[11px] sm:text-xs font-bold p-1.5 sm:px-3 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:border-cyan-500/70 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
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

        {/* About & Data Attributions Info Button */}
        <button
          onClick={onOpenAboutModal}
          className="flex items-center gap-1 text-[11px] sm:text-xs font-bold p-1.5 sm:px-3 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:border-cyan-500/60 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
          title="About Baha Ba? Project, PAGASA, NOAH & Social Media Attributions"
        >
          <svg className="w-3.5 h-3.5 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <span className="hidden sm:inline">About</span>
        </button>

        {/* Sync Telemetry Button */}
        <button
          onClick={onSync}
          disabled={syncing}
          className="flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-xl shadow-cyan-950/50 backdrop-blur-xl transition-all disabled:opacity-50 active:scale-95 flex-shrink-0"
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
          <span className="hidden sm:inline">{syncing ? "Syncing" : "Sync"}</span>
        </button>
      </div>
    </header>
  );
}
