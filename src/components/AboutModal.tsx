"use client";

// ---------------------------------------------------------------------------
// Bahaba (Baha ba?) – About & Data Sources Attribution Modal
// Acknowledges all data providers: PAGASA, Panahon API, UP NOAH,
// Twitter / X advisories (MMDA, NDRRMC, LGUs), OpenStreetMap, and
// highlights the civic-tech project mission and safety guidelines.
// ---------------------------------------------------------------------------

import { useState, useEffect } from "react";
import Image from "next/image";
import { trackAboutAction } from "@/lib/firebase/analytics";

interface AboutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenDonationModal?: () => void;
}

type TabType = "overview" | "sources";

export default function AboutModal({ isOpen, onClose, onOpenDonationModal }: AboutModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>("overview");

  // Track modal open
  useEffect(() => {
    if (isOpen) {
      trackAboutAction({ action: "open_modal", tabName: activeTab });
    }
  }, [isOpen, activeTab]);

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

  // Lock body scroll on open
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

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    trackAboutAction({ action: "tab_switch", tabName: tab });
  };

  const handleLinkClick = (linkName: string) => {
    trackAboutAction({ action: "external_link_click", linkName });
  };

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-center justify-center p-3 sm:p-5 bg-slate-950/80 backdrop-blur-md transition-all duration-300 animate-in fade-in"
      onClick={onClose}
    >
      {/* Modal Container */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] sm:max-h-[86vh] flex flex-col bg-slate-900/98 sm:bg-slate-900/95 border border-cyan-500/30 rounded-3xl shadow-2xl shadow-cyan-950/50 text-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Gradient Glow Accent */}
        <div className="absolute top-0 inset-x-0 h-1 sm:h-1.5 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 z-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-4 sm:pt-5 pb-3 sm:pb-4 border-b border-slate-800/80 bg-slate-950/40 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Image
              src="/bahaba.png"
              alt="Baha Ba? Logo"
              width={40}
              height={40}
              className="w-9 h-9 sm:w-10 sm:h-10 object-contain flex-shrink-0 drop-shadow-lg"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-black text-white tracking-tight">
                  About Baha Ba?
                </h2>
                <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                  Civic Tech Philippines
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5 truncate">
                Real-Time Flood Intelligence &amp; Safe Navigation Platform
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 sm:p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors flex-shrink-0"
            title="Close modal (Esc)"
          >
            <svg className="w-4 h-4 sm:w-5 sm:h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-4 sm:px-6 pt-3 pb-2 bg-slate-950/30 border-b border-slate-800/60 flex items-center gap-2 flex-shrink-0">
          <div className="flex items-center p-1 bg-slate-950/80 border border-slate-800 rounded-xl text-xs w-full sm:w-auto">
            <button
              onClick={() => handleTabChange("overview")}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-bold transition-all text-center ${activeTab === "overview"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              📖 Overview &amp; Mission
            </button>
            <button
              onClick={() => handleTabChange("sources")}
              className={`flex-1 sm:flex-none px-3.5 py-1.5 rounded-lg font-bold transition-all text-center ${activeTab === "sources"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-900/40"
                : "text-slate-400 hover:text-slate-200"
                }`}
            >
              🛰️ Data Sources &amp; Credits
            </button>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 sm:space-y-5 text-slate-300 text-xs sm:text-sm leading-relaxed max-h-[calc(86vh-140px)]">
          {/* TAB 1: OVERVIEW & MISSION */}
          {activeTab === "overview" && (
            <div className="space-y-4 animate-in fade-in duration-200">
              {/* Hero Banner */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-cyan-950/40 via-slate-900/90 to-blue-950/40 border border-cyan-500/20">
                <h3 className="text-sm sm:text-base font-black text-cyan-200 flex items-center gap-2">
                  <span>🇵🇭</span> Built for the Filipino Commuter &amp; Citizen
                </h3>
                <p className="mt-2 text-slate-300 text-xs sm:text-sm">
                  <strong>Baha Ba?</strong> (<em>"Is it flooded?"</em>) is an open-source civic-tech platform designed to eliminate the guesswork during typhoons, heavy monsoon rains (<em>Habagat</em>), and sudden flash floods across Metro Manila and surrounding provinces.
                </p>
              </div>

              {/* Angat Buhay Relief Collaboration */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-rose-950/50 via-slate-900 to-pink-950/40 border border-rose-500/40 shadow-lg shadow-rose-950/30">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="p-2 rounded-xl bg-rose-950/80 border border-rose-800/80 text-rose-400 text-lg flex-shrink-0">
                      ❤️
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="font-bold text-rose-200 text-xs sm:text-sm">
                          Disaster Relief: Support Angat Buhay
                        </h4>
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                          Official Relief Partner
                        </span>
                      </div>
                      <p className="mt-1.5 text-[11px] sm:text-xs text-slate-300 leading-relaxed">
                        Instead of donating to the Baha Ba? project, <strong>please donate to Angat Buhay instead</strong>. Let us extend a helping hand to those who need it most during heavy typhoons and floods — <em>tulungan natin ang mas nangangailangan</em>.
                      </p>
                    </div>
                  </div>
                  {onOpenDonationModal && (
                    <button
                      onClick={() => {
                        onClose();
                        onOpenDonationModal();
                      }}
                      className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white font-bold text-xs shadow-lg shadow-rose-950/50 transition-all active:scale-95 flex-shrink-0"
                    >
                      <span>Donate to Angat Buhay</span>
                      <span>❤️</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Open Source & Community Contributions */}
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-cyan-500/30 hover:border-cyan-500/50 transition-colors">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <div className="p-2 rounded-xl bg-slate-900 border border-slate-800 text-cyan-400 flex-shrink-0">
                      <svg className="w-5 h-5 fill-current" viewBox="0 0 24 24">
                        <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
                      </svg>
                    </div>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm flex items-center gap-1.5">
                        Open Source &amp; Community Driven
                        <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          MIT License
                        </span>
                      </h4>
                      <p className="text-[11px] sm:text-xs text-slate-400 mt-0.5">
                        Baha Ba? is open source! Contributions, bug reports, and ideas are warmly welcome to help build better disaster resilience for the Philippines.
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://github.com/haliknihudas666/bahaba"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("github_repo")}
                    className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-bold text-xs shadow-lg shadow-cyan-950/50 transition-all active:scale-95 flex-shrink-0"
                  >
                    <span>Contribute on GitHub</span>
                    <span className="text-xs">↗</span>
                  </a>
                </div>
              </div>

              {/* Core Features Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-cyan-500/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">🌊</span>
                    <h4 className="font-bold text-white text-xs sm:text-sm">Live River Telemetry</h4>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    Real-time water levels and delta trends across the Marikina, Pasig, San Juan, and Tullahan river systems.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-cyan-500/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">🧭</span>
                    <h4 className="font-bold text-white text-xs sm:text-sm">Flood-Safe Routing</h4>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    Intelligent turn-by-turn navigation evaluating road flood hazards, digital elevation models, and vehicle passability (Sedan, SUV, Truck, Walking).
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-cyan-500/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">📢</span>
                    <h4 className="font-bold text-white text-xs sm:text-sm">Live Advisory Wall</h4>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    Direct stream of verified traffic bulletins and flood alerts from MMDA and NDRRMC.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800/80 hover:border-cyan-500/30 transition-colors">
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="text-base">📸</span>
                    <h4 className="font-bold text-white text-xs sm:text-sm">Shareable Report Cards</h4>
                  </div>
                  <p className="text-[11px] sm:text-xs text-slate-400">
                    Generate instant, high-contrast visual safety cards for Instagram Stories, Twitter/X, and family messaging groups.
                  </p>
                </div>
              </div>

              {/* Critical Safety Notice */}
              <div className="p-4 rounded-2xl bg-amber-950/50 border border-amber-500/40">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">⚠️</span>
                  <h4 className="font-black text-amber-200 text-xs sm:text-sm uppercase tracking-wide">
                    Crucial Safety Protocol &amp; Disclaimer
                  </h4>
                </div>
                <p className="text-xs sm:text-sm text-amber-100 font-bold mb-2">
                  "Turn Around, Don't Drown!"
                </p>
                <p className="text-[11px] sm:text-xs text-amber-200/90 leading-relaxed">
                  Calculated flood depths, road risk scores, and predicted travel times are generated via automated sensor telemetry, hydrological approximations, and terrain models. Local conditions during torrential downpours can evolve rapidly.
                </p>
                <ul className="mt-2.5 space-y-1.5 text-[11px] sm:text-xs text-amber-200/80 list-disc list-inside">
                  <li>Never drive or walk through flooded waters of unknown depth or swift currents.</li>
                  <li>Always heed on-site instructions from traffic marshals, PNP, and emergency responders.</li>
                  <li>Avoid submerged electrical infrastructure, downed wires, and open drainage manholes.</li>
                </ul>
              </div>


            </div>
          )}

          {/* TAB 2: DATA SOURCES & CREDITS */}
          {activeTab === "sources" && (
            <div className="space-y-3.5 animate-in fade-in duration-200">
              <p className="text-xs text-slate-400">
                <strong>Baha Ba?</strong> stands on the shoulders of open government data, open-source mapping communities, and disaster response public broadcasts. We gratefully acknowledge:
              </p>

              {/* Source 1: DOST-PAGASA */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-cyan-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">💧</span>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">DOST-PAGASA</h4>
                      <p className="text-[10px] text-cyan-400">
                        Philippine Atmospheric, Geophysical and Astronomical Services Administration
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://bagong.pagasa.dost.gov.ph/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("pagasa")}
                    className="text-[10px] font-bold text-cyan-400 hover:text-cyan-300 underline flex items-center gap-0.5 flex-shrink-0"
                  >
                    Official Portal ↗
                  </a>
                </div>
                <p className="mt-2 text-[11px] text-slate-300">
                  River water level sensors across the Pasig-Marikina River Basin, Automatic Rain Gauges (ARG), radar precipitation observations, and official flood stage alarm thresholds (Normal, Alert, Alarm, Critical).
                </p>
              </div>

              {/* Source 2: Panahon API & AWS Network */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-sky-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🌧️</span>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">Panahon API &amp; Automated Weather Stations</h4>
                      <p className="text-[10px] text-sky-400">
                        Distributed Meteorological Sensors &amp; Rainfall Telemetry
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://www.panahon.gov.ph/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("panahon")}
                    className="text-[10px] font-bold text-sky-400 hover:text-sky-300 underline flex items-center gap-0.5 flex-shrink-0"
                  >
                    Official Portal ↗
                  </a>
                </div>
                <p className="mt-2 text-[11px] text-slate-300">
                  Hyper-local 1-hour rainfall rates (mm/h) and 24-hour cumulative precipitation data across Greater Luzon and Metro Manila stations for predictive water depth calculation.
                </p>
              </div>

              {/* Source 3: UP NOAH & DOST-NOAH */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-blue-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🗺️</span>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">UP NOAH / DOST-NOAH</h4>
                      <p className="text-[10px] text-blue-400">
                        Nationwide Operational Assessment of Hazards
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://noah.up.edu.ph/"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("up_noah")}
                    className="text-[10px] font-bold text-blue-400 hover:text-blue-300 underline flex items-center gap-0.5 flex-shrink-0"
                  >
                    NOAH Portal ↗
                  </a>
                </div>
                <p className="mt-2 text-[11px] text-slate-300">
                  Flood hazard return models (5-year, 25-year, and 100-year flood levels), Digital Elevation Models (DEM), and historical flood susceptibility rankings along major Philippine road networks.
                </p>
              </div>

              {/* Source 4: Twitter / X Emergency & Traffic Accounts */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-amber-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📢</span>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">
                        Official Twitter / X Advisory Feeds
                      </h4>
                      <p className="text-[10px] text-amber-400">
                        Real-Time Ground Reports &amp; Impassability Alerts
                      </p>
                    </div>
                  </div>
                  <span className="text-[9px] font-mono px-2 py-0.5 rounded bg-amber-950 border border-amber-800/60 text-amber-300">
                    Live Feeds
                  </span>
                </div>
                <div className="mt-2.5 grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                  <a
                    href="https://x.com/MMDA"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("twitter_mmda")}
                    className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-colors group block"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-amber-300 font-semibold group-hover:text-amber-200">MMDA (@MMDA)</strong>
                      <span className="text-[9px] text-slate-400">↗</span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5">
                      Gutter, tire, and waist-deep road flood alerts across Metro Manila.
                    </p>
                  </a>

                  <a
                    href="https://x.com/NDRRMC_Open"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("twitter_ndrrmc")}
                    className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-colors group block"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-amber-300 font-semibold group-hover:text-amber-200">NDRRMC (@NDRRMC_Open)</strong>
                      <span className="text-[9px] text-slate-400">↗</span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5">
                      National severe weather warnings and river basin flood advisories.
                    </p>
                  </a>

                  <a
                    href="https://x.com/dost_pagasa"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("twitter_pagasa")}
                    className="p-2 rounded-xl bg-slate-900/90 border border-slate-800 hover:border-amber-500/50 transition-colors group block"
                  >
                    <div className="flex items-center justify-between">
                      <strong className="text-amber-300 font-semibold group-hover:text-amber-200">PAGASA-DOST (@dost_pagasa)</strong>
                      <span className="text-[9px] text-slate-400">↗</span>
                    </div>
                    <p className="text-slate-400 text-[10px] mt-0.5">
                      Official heavy rainfall warnings and thunderstorm advisories.
                    </p>
                  </a>
                </div>
              </div>

              {/* Source 5: OpenStreetMap & OSRM */}
              <div className="p-3.5 rounded-2xl bg-slate-950/60 border border-slate-800/80 hover:border-emerald-500/40 transition-colors">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">🗺️</span>
                    <div>
                      <h4 className="font-bold text-white text-xs sm:text-sm">OpenStreetMap &amp; OSRM</h4>
                      <p className="text-[10px] text-emerald-400">
                        Open-Source Geographic Data &amp; Routing Engine
                      </p>
                    </div>
                  </div>
                  <a
                    href="https://www.openstreetmap.org"
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => handleLinkClick("osm")}
                    className="text-[10px] font-bold text-emerald-400 hover:text-emerald-300 underline flex items-center gap-0.5 flex-shrink-0"
                  >
                    OSM ↗
                  </a>
                </div>
                <p className="mt-2 text-[11px] text-slate-300">
                  Global collaborative mapping project supplying road geometry, national highways, walkways, and graph topologies powered by the Open Source Routing Machine (OSRM).
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between gap-3 flex-shrink-0 text-[11px] text-slate-400">
          <div className="flex items-center gap-1.5">
            <span>🇵🇭</span>
            <span className="sm:inline">Para sa Bayan • For Public Safety</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold transition-all active:scale-95 text-xs"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
