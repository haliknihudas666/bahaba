"use client";

// ---------------------------------------------------------------------------
// Bahaba – Layout: Floating Map Header & Centered Desktop HUD Telemetry
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import Image from "next/image";

export interface HighRiskStationSummary {
  stationId: string;
  stationName: string;
  waterLevel: number;
  riskLevel: string;
  rain1h: number;
}

export interface TelemetryMetrics {
  total: number;
  highRisk: number;
  highRiskStations?: HighRiskStationSummary[];
  peakWater: number;
  peakWaterStation: string;
  peakWaterStationId?: string | null;
  maxRain1h: number;
  maxRain1hStation?: string;
  maxRain1hStationId?: string | null;
  maxRain: number;
  maxRainStation?: string;
  maxRainStationId?: string | null;
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
  isTelemetryOpen?: boolean;
  onToggleTelemetry?: () => void;
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
  isTelemetryOpen = false,
  onToggleTelemetry,
}: MapHeaderControlsProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMobileMenuOpen(false);
      }
    };
    if (isMobileMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isMobileMenuOpen]);

  // Close mobile menu on Escape key press
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isMobileMenuOpen) {
        setIsMobileMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isMobileMenuOpen]);

  return (
    <header className="absolute top-2.5 left-2.5 right-2.5 sm:top-4 sm:left-4 sm:right-4 z-[500] pointer-events-none flex items-center justify-between gap-2 sm:gap-4">
      {/* ── 1. LEFT: BRAND LOGO & LIVE PULSE ────────────────────────────── */}
      <div className="flex items-center justify-start min-w-0">
        <button
          onClick={onOpenAboutModal}
          className="pointer-events-auto flex items-center gap-2 bg-slate-900/90 hover:bg-slate-800/95 backdrop-blur-xl border border-slate-800/90 hover:border-cyan-500/50 px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl shadow-2xl flex-shrink-0 transition-all text-left group"
          title="About Baha Ba? & Data Attributions"
        >
          <Image
            src="/bahaba.png"
            alt="Baha Ba? Logo"
            width={36}
            height={36}
            className="w-7 h-7 sm:w-9 sm:h-9 object-contain flex-shrink-0 group-hover:scale-105 transition-transform drop-shadow-md"
            priority
          />
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
      </div>

      {/* ── 2. RIGHT: QUICK ACTION BUTTONS & TELEMETRY TOGGLE ───────────── */}
      <div className="pointer-events-auto flex items-center gap-1 sm:gap-1.5 2xl:gap-2 min-w-0">
        {/* Live Telemetry Panel Toggle Button */}
        {onToggleTelemetry && (
          <button
            onClick={onToggleTelemetry}
            className={`flex items-center gap-1.5 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl border shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0 ${
              isTelemetryOpen
                ? "bg-cyan-600 text-white border-cyan-400/70 shadow-cyan-950/50"
                : "bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border-cyan-500/40 hover:border-cyan-500/70"
            }`}
            title="Toggle Live Telemetry & Hydrology Side Panel"
          >
            <span className="text-xs">📊</span>
            <span className="hidden sm:inline">Telemetry</span>
            {metrics.highRisk > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold shadow-sm animate-pulse">
                {metrics.highRisk}
              </span>
            )}
          </button>
        )}

        {/* Official Advisory Wall Button (Always visible) */}
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

        {/* Relief & Donation Drive Button (Always visible) */}
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
          className="hidden md:flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-3 sm:py-2 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 hover:border-cyan-500/50 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
          title="Open PAGASA Stations & Monitored Road Tables"
        >
          <span className="text-xs">📋</span>
          <span className="hidden lg:inline">Tables</span>
        </button>

        {/* Desktop-only Buttons: Share, About, Sync */}
        {/* Share Report Button (Desktop) */}
        <button
          onClick={onOpenShareModal}
          className="hidden sm:flex items-center gap-1 text-[11px] sm:text-xs font-bold p-1.5 sm:px-2.5 sm:py-2 2xl:px-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-cyan-300 border border-cyan-500/40 hover:border-cyan-500/70 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
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
          <span className="hidden 2xl:inline">Share</span>
        </button>

        {/* About & Data Attributions Info Button (Desktop) */}
        <button
          onClick={onOpenAboutModal}
          className="hidden sm:flex items-center gap-1 text-[11px] sm:text-xs font-bold p-1.5 sm:px-2.5 sm:py-2 2xl:px-3 rounded-2xl bg-slate-900/90 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700 hover:border-cyan-500/60 shadow-xl backdrop-blur-xl transition-all active:scale-95 flex-shrink-0"
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
          <span className="hidden 2xl:inline">About</span>
        </button>

        {/* Sync Telemetry Button (Desktop) */}
        <button
          onClick={onSync}
          disabled={syncing}
          className="hidden sm:flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1.5 sm:px-2.5 sm:py-2 2xl:px-3 rounded-2xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-xl shadow-cyan-950/50 backdrop-blur-xl transition-all disabled:opacity-50 active:scale-95 flex-shrink-0"
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
          <span className="hidden 2xl:inline">{syncing ? "Syncing" : "Sync"}</span>
        </button>

        {/* ── 3. MOBILE-ONLY MORE MENU BUTTON (•••) ───────────────────────── */}
        <div ref={menuRef} className="sm:hidden relative">
          <button
            onClick={() => setIsMobileMenuOpen((prev) => !prev)}
            className={`flex items-center justify-center w-8 h-8 rounded-2xl text-xs font-bold transition-all active:scale-95 ${
              isMobileMenuOpen
                ? "bg-cyan-600 text-white border border-cyan-400/60 shadow-lg shadow-cyan-950/50"
                : "bg-slate-900/90 hover:bg-slate-800 text-slate-200 border border-slate-700 shadow-xl backdrop-blur-xl"
            }`}
            title="More Options & Telemetry Info"
            aria-label="More Options Menu"
            aria-expanded={isMobileMenuOpen}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 8c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
            </svg>
          </button>

          {/* Mobile Popover Dropdown Card */}
          {isMobileMenuOpen && (
            <div className="absolute right-0 top-10 w-72 max-w-[calc(100vw-24px)] bg-slate-900/95 backdrop-blur-2xl border border-slate-700/80 rounded-2xl p-3 shadow-2xl flex flex-col gap-2.5 z-[600] animate-in fade-in zoom-in-95 duration-150">
              {/* Header inside popover */}
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-200">
                  <span>⚙️</span>
                  <span>Quick Actions &amp; Weather</span>
                </div>
                <button
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors text-xs"
                >
                  ✕
                </button>
              </div>

              {/* Action 1: Open Full Telemetry Panel */}
              {onToggleTelemetry && (
                <button
                  onClick={() => {
                    setIsMobileMenuOpen(false);
                    onToggleTelemetry();
                  }}
                  className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-cyan-950/50 hover:bg-cyan-900/60 border border-cyan-800/70 text-cyan-300 hover:text-cyan-200 transition-all text-xs font-bold text-left"
                >
                  <div className="flex items-center gap-2">
                    <span>📊</span>
                    <span>Live Hydrology Dashboard</span>
                  </div>
                  {metrics.highRisk > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-slate-950 text-[9px] font-extrabold">
                      {metrics.highRisk} Alerts
                    </span>
                  )}
                </button>
              )}

              {/* Action 2: Open Station & Road Tables */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenDrawer();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition-all text-xs font-semibold text-left"
              >
                <span>📋</span>
                <span>Open Stations &amp; Road Tables</span>
              </button>

              {/* Action 3: Sync Telemetry */}
              <button
                onClick={() => {
                  onSync();
                  setIsMobileMenuOpen(false);
                }}
                disabled={syncing}
                className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition-all text-xs font-semibold text-left"
              >
                <div className="flex items-center gap-2">
                  <svg
                    className={`w-4 h-4 text-cyan-400 ${syncing ? "animate-spin" : ""}`}
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
                  <span>{syncing ? "Syncing Telemetry..." : "Sync Live Data"}</span>
                </div>
                <span className="text-[10px] font-mono text-slate-400">
                  {lastUpdatedFormatted || "Live"}
                </span>
              </button>

              {/* Action 4: Share Report Card */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenShareModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-cyan-300 hover:text-cyan-200 transition-all text-xs font-semibold text-left"
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                  />
                </svg>
                <span>Share Safety Report Card</span>
              </button>

              {/* Action 5: About & Attributions */}
              <button
                onClick={() => {
                  setIsMobileMenuOpen(false);
                  onOpenAboutModal();
                }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-800/70 hover:bg-slate-800 border border-slate-700/60 text-slate-200 hover:text-white transition-all text-xs font-semibold text-left"
              >
                <svg className="w-4 h-4 text-cyan-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                  />
                </svg>
                <span>About &amp; Data Sources</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}

