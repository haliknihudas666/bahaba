"use client";

// ---------------------------------------------------------------------------
// Bahaba – Advisory Wall Modal
// Displays live scraped bulletins and road flood advisories from MMDA & NDRRMC
// with image support, passability tags, and instant map centering.
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import type { ReportedAdvisory } from "@/types/advisory";
import { isAdvisoryPinVisible } from "@/types/advisory";

function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0 || isNaN(diffMs)) return "Just now";

    const minutes = Math.floor(diffMs / (60 * 1000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

interface AdvisoryWallModalProps {
  isOpen: boolean;
  onClose: () => void;
  advisories: ReportedAdvisory[];
  activeFloodCount: number;
  isLoading: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  onSelectAdvisory: (advisory: ReportedAdvisory) => void;
}

type FilterTab = "ALL" | "FLOOD" | "WEATHER" | "SUSPENSION" | "MMDA" | "NDRRMC" | "PAGASA" | "NEWS";

export default function AdvisoryWallModal({
  isOpen,
  onClose,
  advisories,
  activeFloodCount,
  isLoading,
  isRefreshing,
  onRefresh,
  onSelectAdvisory,
}: AdvisoryWallModalProps) {
  const [activeTab, setActiveTab] = useState<FilterTab>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [previewPhotoUrl, setPreviewPhotoUrl] = useState<string | null>(null);

  const filteredAdvisories = useMemo(() => {
    return advisories.filter((item) => {
      // Tab filter
      if (activeTab === "FLOOD" && !item.isFloodReport && item.category !== "FLOOD") return false;
      if (activeTab === "WEATHER" && item.category !== "WEATHER" && !/rainfall|thunderstorm|weather|monsoon|typhoon|bagyo/i.test(item.rawText)) return false;
      if (activeTab === "SUSPENSION" && item.category !== "SUSPENSION" && !/walang pasok|class suspension|suspended|walangpasok|suspension/i.test(item.rawText)) return false;
      if (activeTab === "MMDA" && item.source !== "MMDA") return false;
      if (activeTab === "NDRRMC" && item.source !== "NDRRMC") return false;
      if (activeTab === "PAGASA" && item.source !== "PAGASA") return false;
      if (activeTab === "NEWS" && item.source !== "NEWS") return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const textMatch = item.rawText.toLowerCase().includes(q);
        const roadMatch = item.roadName?.toLowerCase().includes(q) || false;
        const landmarkMatch = item.landmark?.toLowerCase().includes(q) || false;
        const sourceMatch = item.source?.toLowerCase().includes(q) || false;
        return textMatch || roadMatch || landmarkMatch || sourceMatch;
      }
      return true;
    });
  }, [advisories, activeTab, searchQuery]);

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 md:p-6 bg-black/80 backdrop-blur-md animate-in fade-in duration-200"
        onClick={onClose}
      >
        <div
          className="relative w-full max-w-2xl max-h-[90vh] flex flex-col bg-slate-900/98 sm:bg-slate-900/95 border border-cyan-500/30 rounded-3xl shadow-2xl shadow-cyan-950/60 text-slate-100 overflow-hidden animate-in zoom-in-95 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Top Glow Accent */}
          <div className="absolute top-0 inset-x-0 h-1 sm:h-1.5 bg-gradient-to-r from-cyan-500 via-sky-500 to-indigo-500 z-10" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-4 sm:px-6 pt-5 pb-4 border-b border-slate-800/80 bg-slate-950/50 flex-shrink-0 gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 flex-shrink-0 text-lg">
              📢
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  Official Advisory Wall
                </h2>
                {advisories.length > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                    {advisories.length} Reports
                  </span>
                )}
                {activeFloodCount > 0 && (
                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    <span className="w-1.5 h-1.5 rounded-full bg-rose-400 animate-pulse" />
                    {activeFloodCount} Active Flood{activeFloodCount > 1 ? "s" : ""}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time official reports from MMDA, NDRRMC, PAGASA &amp; News Outlets
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-all border border-slate-700/60"
              title="Refresh latest posts"
            >
              <span className={`text-xs ${isRefreshing ? "animate-spin" : ""}`}>🔄</span>
              <span className="hidden sm:inline">Refresh</span>
            </button>

            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 active:scale-95 text-slate-400 hover:text-white flex items-center justify-center transition-all border border-slate-700/60"
              title="Close"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Search & Filter Bar */}
        <div className="p-3 sm:px-6 sm:py-3.5 bg-slate-950/30 border-b border-slate-800/60 flex flex-col gap-2.5">
          {/* Tab buttons */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80 self-start flex-wrap">
            <button
              onClick={() => setActiveTab("ALL")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "ALL"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All ({advisories.length})
            </button>
            <button
              onClick={() => setActiveTab("FLOOD")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "FLOOD"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🌊 Floods
            </button>
            <button
              onClick={() => setActiveTab("WEATHER")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "WEATHER"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🌧️ Weather
            </button>
            <button
              onClick={() => setActiveTab("SUSPENSION")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "SUSPENSION"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🏫 Walang Pasok
            </button>
            <button
              onClick={() => setActiveTab("MMDA")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "MMDA"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🚦 MMDA
            </button>
            <button
              onClick={() => setActiveTab("PAGASA")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "PAGASA"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              ⛅ PAGASA
            </button>
            <button
              onClick={() => setActiveTab("NDRRMC")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "NDRRMC"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              🛡️ NDRRMC
            </button>
            <button
              onClick={() => setActiveTab("NEWS")}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all ${
                activeTab === "NEWS"
                  ? "bg-cyan-500 text-slate-950 shadow-md shadow-cyan-500/20"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              📰 News
            </button>
          </div>

          {/* Search box */}
          <div className="relative flex-1">
            <input
              type="text"
              placeholder="Search roads, intersections, news or keywords..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-900/90 border border-slate-800/90 focus:border-cyan-500/50 rounded-xl px-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 outline-none transition-all"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Advisory List Scroll Area */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3.5 custom-scrollbar">
          {isLoading ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <span className="animate-spin text-2xl">⏳</span>
              <p className="text-xs">Fetching live official advisories...</p>
            </div>
          ) : filteredAdvisories.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-2">
              <span className="text-3xl">🛡️</span>
              <p className="text-xs sm:text-sm font-semibold text-slate-200">No advisories found for this filter</p>
              <p className="text-[11px] text-slate-400 max-w-sm text-center">
                Try switching filter tabs or clearing your search keywords.
              </p>
            </div>
          ) : (
            filteredAdvisories.map((advisory) => {
              const isCritical = advisory.severity === "CRITICAL";
              const isAlarm = advisory.severity === "ALARM";
              const isSubsided = advisory.status === "SUBSIDED";

              return (
                <div
                  key={advisory.id}
                  className={`group relative rounded-2xl p-4 transition-all duration-200 border ${
                    isCritical
                      ? "bg-rose-950/20 border-rose-500/30 hover:border-rose-500/50"
                      : isAlarm
                      ? "bg-amber-950/20 border-amber-500/30 hover:border-amber-500/50"
                      : isSubsided
                      ? "bg-emerald-950/15 border-emerald-500/30 hover:border-emerald-500/50"
                      : "bg-slate-950/40 border-slate-800/80 hover:border-slate-700/80"
                  }`}
                >
                  {/* Top Meta Line */}
                  <div className="flex items-center justify-between gap-2 flex-wrap mb-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full border ${
                          advisory.source === "MMDA"
                            ? "bg-blue-500/20 text-blue-300 border-blue-500/30"
                            : advisory.source === "PAGASA"
                            ? "bg-sky-500/20 text-sky-300 border-sky-500/30"
                            : advisory.source === "NEWS"
                            ? "bg-amber-500/20 text-amber-300 border-amber-500/30"
                            : "bg-indigo-500/20 text-indigo-300 border-indigo-500/30"
                        }`}
                      >
                        {advisory.authorName && !/^(news|news report)$/i.test(advisory.authorName)
                          ? advisory.authorName
                          : advisory.source === "NEWS"
                          ? "📰 News Report"
                          : `${advisory.source} Official`}
                      </span>

                      {advisory.authorHandle && !/^(news|search|feed|unknown|undefined|null)$/i.test(advisory.authorHandle) && (
                        <span className="text-[11px] font-semibold text-cyan-400">
                          @{advisory.authorHandle.replace(/^@/, "")}
                        </span>
                      )}

                      <span className="text-[11px] text-slate-400">
                        {formatTimeAgo(advisory.publishedAt)}
                      </span>
                    </div>

                    {/* Passability / Severity Badge */}
                    <span
                      className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${
                        isCritical
                          ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                          : isAlarm
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/40"
                          : isSubsided
                          ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                          : "bg-sky-500/20 text-sky-300 border-sky-500/40"
                      }`}
                    >
                      {advisory.passabilityLabel}
                    </span>
                  </div>

                  {/* Multi-location badge if present */}
                  {advisory.locationPins && advisory.locationPins.length > 1 && (
                    <div className="flex items-center gap-1.5 flex-wrap mb-2">
                      <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 flex items-center gap-1">
                        <span>🗺️</span>
                        <span>{advisory.locationPins.length} Flood Locations Pinned on Map</span>
                      </span>
                    </div>
                  )}

                  {/* Road Highlight if matched */}
                  {advisory.roadName && (
                    <div className="text-xs font-semibold text-cyan-300 flex items-center gap-1 mb-1">
                      <span>📍</span>
                      <span>
                        {advisory.roadName} {advisory.landmark ? `(${advisory.landmark})` : ""}
                        {advisory.direction ? ` • ${advisory.direction}` : ""}
                      </span>
                    </div>
                  )}

                  {/* Main Post Text */}
                  <p className="text-xs sm:text-sm text-slate-200 leading-relaxed break-words">
                    {advisory.rawText}
                  </p>

                  {/* Attached Photos */}
                  {advisory.photoUrls.length > 0 && (
                    <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                      {advisory.photoUrls.map((url, idx) => (
                        <div
                          key={idx}
                          onClick={(e) => {
                            e.stopPropagation();
                            setPreviewPhotoUrl(url);
                          }}
                          className="relative rounded-xl overflow-hidden border border-slate-700/60 bg-slate-950 flex-shrink-0 cursor-pointer group/img"
                        >
                          <img
                            src={url}
                            alt="Advisory photo"
                            className="w-36 h-24 object-cover group-hover/img:scale-105 transition-transform duration-200"
                          />
                          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover/img:opacity-100 flex items-center justify-center transition-opacity text-white text-xs font-semibold">
                            🔍 Zoom
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Bottom Action Footer */}
                  <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between">
                    {advisory.coordinates ? (
                      (() => {
                        const hasLivePin = isAdvisoryPinVisible(advisory);
                        return (
                          <button
                            onClick={() => {
                              onSelectAdvisory(advisory);
                              onClose();
                            }}
                            className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-xl transition-all border ${
                              hasLivePin
                                ? "text-cyan-400 hover:text-cyan-300 bg-cyan-950/40 hover:bg-cyan-950/70 border-cyan-500/30 shadow-sm"
                                : "text-slate-400 hover:text-slate-200 bg-slate-800/40 hover:bg-slate-800/70 border-slate-700/50"
                            }`}
                            title={
                              hasLivePin
                                ? "Locate live advisory pin on map (active within 6 hours)"
                                : "Report is older than 6 hours (pin is hidden on map). Click to pan to coordinates."
                            }
                          >
                            <span>📍</span>
                            <span>{hasLivePin ? "Locate on Map" : "Locate on Map (Expired >6h)"}</span>
                          </button>
                        );
                      })()
                    ) : (
                      <span className="text-[11px] text-slate-500">General Bulletin</span>
                    )}

                    <a
                      href={advisory.postUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-slate-400 hover:text-slate-200 flex items-center gap-1 transition-colors"
                    >
                      <span>View post on X</span>
                      <span>↗</span>
                    </a>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between text-[11px] text-slate-500 flex-shrink-0">
          <span>Sources: @MMDA, @NDRRMC_OpCen, @dost_pagasa &amp; News Outlets</span>
          <span>Updates automatically</span>
        </div>
      </div>
    </div>

    {/* Full-size Image Lightbox Modal on Top */}
    {previewPhotoUrl && (
      <div
        className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-black/90 backdrop-blur-md animate-in fade-in duration-150"
        onClick={(e) => {
          e.stopPropagation();
          setPreviewPhotoUrl(null);
        }}
      >
        <div
          className="relative max-w-4xl max-h-[90vh] flex flex-col items-center"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewPhotoUrl(null);
            }}
            className="absolute -top-11 right-0 text-white hover:text-cyan-300 font-bold text-xs sm:text-sm bg-slate-800/90 hover:bg-slate-800 px-3.5 py-1.5 rounded-full border border-slate-600 shadow-lg flex items-center gap-1.5 transition-all"
          >
            <span>✕</span>
            <span>Close</span>
          </button>
          <img
            src={previewPhotoUrl}
            alt="Advisory Full View"
            className="max-h-[85vh] max-w-full rounded-2xl border border-slate-700/80 shadow-2xl object-contain"
          />
        </div>
      </div>
    )}
  </>
);
}
