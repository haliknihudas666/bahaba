"use client";

// ---------------------------------------------------------------------------
// Bahaba – Flood Report Share Modal (Instagram Story 9:16 & Standard Card)
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect, useCallback } from "react";
import { toPng, toBlob } from "html-to-image";
import type { RouteOption } from "@/lib/engine/routeSolver";
import type { RoadRiskResult } from "@/lib/engine/roadRisk";
import { classifyFloodRisk } from "@/lib/engine/floodPredictor";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  origin?: { name: string; subtext?: string } | null;
  destination?: { name: string; subtext?: string } | null;
  activeRoute?: RouteOption | null;
  metrics?: {
    total: number;
    highRisk: number;
    peakWater: number;
    peakWaterStation: string;
    maxRain: number;
  };
  selectedRoad?: RoadRiskResult | null;
}

type ShareFormat = "story" | "card";

export default function ShareModal({
  isOpen,
  onClose,
  origin,
  destination,
  activeRoute,
  metrics,
  selectedRoad,
}: ShareModalProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [shareFormat, setShareFormat] = useState<ShareFormat>("story");
  const [mapSnapshotUrl, setMapSnapshotUrl] = useState<string | null>(null);
  const [capturingMap, setCapturingMap] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);

  const timestampStr = new Date().toLocaleString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });

  // Check Web Share API capability
  useEffect(() => {
    if (typeof navigator !== "undefined" && !!navigator.share) {
      setCanNativeShare(true);
    }
  }, []);

  const showToast = useCallback((text: string, type: "success" | "error" | "info" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  }, []);

  // Capture Map Snapshot whenever Modal opens
  useEffect(() => {
    if (!isOpen) {
      setMapSnapshotUrl(null);
      return;
    }

    setCapturingMap(true);

    const captureMap = async () => {
      try {
        // Find map container
        const mapEl = document.getElementById("bahaba-interactive-map");
        if (mapEl) {
          // Delay briefly to ensure Leaflet camera and tiles finish rendering
          await new Promise((r) => setTimeout(r, 400));

          const dataUrl = await toPng(mapEl, {
            cacheBust: true,
            pixelRatio: 1.8,
            skipFonts: false,
            filter: (node: HTMLElement) => {
              // Exclude zoom controls from map screenshot
              if (node.classList && node.classList.contains("leaflet-control-zoom")) {
                return false;
              }
              return true;
            },
          });
          setMapSnapshotUrl(dataUrl);
        }
      } catch (err) {
        console.warn("[ShareModal] Error capturing map screenshot:", err);
      } finally {
        setCapturingMap(false);
      }
    };

    captureMap();
  }, [isOpen]);

  if (!isOpen) return null;

  // Determine Flood Status details
  const isRouteActive = Boolean(origin?.name && destination?.name && activeRoute);

  const statusLabel = isRouteActive
    ? activeRoute?.overallStatus === "SAFE"
      ? "SAFE / PASSABLE"
      : activeRoute?.overallStatus === "CAUTION"
        ? "GUTTER DEEP WARNING"
        : activeRoute?.overallStatus === "HIGH_RISK"
          ? "HALF-TIRE ALARM"
          : "IMPASSABLE FLOOD"
    : selectedRoad
      ? `${selectedRoad.severity} (${selectedRoad.depthCategory})`
      : metrics && metrics.highRisk > 0
        ? `${metrics.highRisk} ACTIVE FLOOD ALERTS`
        : "MONITORING METRO MANILA";

  const statusColorClass = isRouteActive
    ? activeRoute?.overallStatus === "SAFE"
      ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
      : activeRoute?.overallStatus === "CAUTION"
        ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
        : activeRoute?.overallStatus === "HIGH_RISK"
          ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
          : "bg-rose-500/20 text-rose-400 border-rose-500/50"
    : selectedRoad
      ? selectedRoad.severity === "NORMAL"
        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
        : selectedRoad.severity === "ALERT"
          ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
          : selectedRoad.severity === "ALARM"
            ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
            : "bg-rose-500/20 text-rose-400 border-rose-500/50"
      : "bg-cyan-500/20 text-cyan-400 border-cyan-500/50";

  const maxDepthCm = isRouteActive
    ? activeRoute?.maxFloodDepthCm ?? 0
    : selectedRoad
      ? selectedRoad.estimatedDepthCm
      : 0;

  const passableVehicles: string[] = isRouteActive
    ? (activeRoute ? classifyFloodRisk(activeRoute.maxFloodDepthCm).passableVehicles : ["All Vehicles Passable"])
    : selectedRoad
      ? selectedRoad.drivableVehicles
      : ["All Monitored Vehicles"];

  // Generate plain-text summary for messaging/clipboard
  const buildTextSummary = () => {
    let lines = [`🌊 *BAHA BA? FLOOD ASSESSMENT REPORT*`];
    lines.push(`⏱️ *As of:* ${timestampStr}`);

    if (isRouteActive && origin && destination && activeRoute) {
      lines.push(`📍 *Route:* ${origin.name} ➔ ${destination.name}`);
      lines.push(`📏 *Distance:* ${activeRoute.distanceKm} km (~${activeRoute.durationMin} mins)`);
      lines.push(`🚨 *Flood Status:* ${statusLabel} (Max Depth: ${maxDepthCm} cm)`);
      if (activeRoute.totalFloodedKm > 0) {
        lines.push(`⚠️ *Flooded Segment Length:* ${activeRoute.totalFloodedKm} km`);
      }
      lines.push(`🚗 *Passable Vehicles:* ${passableVehicles.join(", ")}`);
      if (activeRoute.warnings.length > 0) {
        lines.push(`⚠️ *Advisories:* ${activeRoute.warnings.join("; ")}`);
      }
    } else if (selectedRoad) {
      lines.push(`🛣️ *Road Corridor:* ${selectedRoad.roadName}`);
      lines.push(`🚨 *Risk Level:* ${selectedRoad.severity} (${selectedRoad.estimatedDepthCm} cm depth)`);
      lines.push(`📊 *Nearest Station:* ${selectedRoad.nearestStation.stationName} (${selectedRoad.nearestStation.waterLevel}m level)`);
      lines.push(`🚗 *Passable Vehicles:* ${passableVehicles.join(", ")}`);
    } else {
      lines.push(`📊 *Metro Manila Hydro Summary:*`);
      lines.push(`• Active Stations: ${metrics?.total ?? 0}`);
      lines.push(`• Flood Alerts/Alarms: ${metrics?.highRisk ?? 0}`);
      lines.push(`• Peak Water Level: ${metrics?.peakWater.toFixed(2)}m (${metrics?.peakWaterStation})`);
      lines.push(`• Max 24h Rainfall: ${metrics?.maxRain.toFixed(1)} mm`);
    }

    lines.push(`🔗 *Live Telemetry:* ${typeof window !== "undefined" ? window.location.origin : "https://bahaba.nicolei.games"}`);
    return lines.join("\n");
  };

  // 1. Action: Copy Image to Clipboard
  const handleCopyImage = async () => {
    if (!cardRef.current) return;
    setActionLoading("copy-img");
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      if (!blob) throw new Error("Could not generate image blob");

      if (typeof navigator !== "undefined" && navigator.clipboard && (window as any).ClipboardItem) {
        await navigator.clipboard.write([
          new (window as any).ClipboardItem({
            "image/png": blob,
          }),
        ]);
        showToast("✅ Image copied to clipboard! Ready to paste into Instagram Story, Messenger, etc.", "success");
      } else {
        await handleDownloadImage();
        showToast("📋 Direct clipboard image not supported on this browser. Image downloaded instead!", "info");
      }
    } catch (err) {
      console.error("Clipboard copy error:", err);
      showToast("❌ Failed to copy image. Trying download instead...", "error");
      await handleDownloadImage();
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Action: Download High-Res PNG
  const handleDownloadImage = async () => {
    if (!cardRef.current) return;
    setActionLoading("download");
    try {
      const dataUrl = await toPng(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      const filename = `bahaba-flood-${shareFormat === "story" ? "story" : "report"}-${Date.now()}.png`;
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`✅ ${shareFormat === "story" ? "Instagram Story (9:16)" : "Flood Report"} image saved!`, "success");
    } catch (err) {
      console.error("Download error:", err);
      showToast("❌ Failed to export image", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 3. Action: Native Web Share
  const handleNativeShare = async () => {
    if (!cardRef.current) return;
    setActionLoading("share");
    try {
      const blob = await toBlob(cardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      if (blob && navigator.share) {
        const filename = shareFormat === "story" ? "bahaba-story.png" : "bahaba-report.png";
        const file = new File([blob], filename, { type: "image/png" });
        const textSummary = buildTextSummary();

        if (navigator.canShare && navigator.canShare({ files: [file] })) {
          await navigator.share({
            title: "Baha Ba? Flood Navigation Report",
            text: textSummary,
            files: [file],
          });
          showToast("✅ Shared successfully!", "success");
          return;
        } else {
          await navigator.share({
            title: "Baha Ba? Flood Navigation Report",
            text: textSummary,
            url: window.location.href,
          });
          showToast("✅ Shared text report!", "success");
          return;
        }
      }

      await handleCopyImage();
    } catch (err: any) {
      if (err.name !== "AbortError") {
        console.error("Share error:", err);
        showToast("ℹ️ Share cancelled or not supported.", "info");
      }
    } finally {
      setActionLoading(null);
    }
  };

  // 4. Action: Copy Plain Text Alert
  const handleCopyText = async () => {
    setActionLoading("copy-text");
    try {
      const summary = buildTextSummary();
      await navigator.clipboard.writeText(summary);
      showToast("✅ Formatted text summary copied to clipboard!", "success");
    } catch (err) {
      console.error("Text copy error:", err);
      showToast("❌ Failed to copy text", "error");
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-5 bg-black/85 backdrop-blur-md overflow-y-auto animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 transition-all animate-bounce ${toastMessage.type === "success"
              ? "bg-emerald-950/90 text-emerald-300 border-emerald-500/50"
              : toastMessage.type === "error"
                ? "bg-rose-950/90 text-rose-300 border-rose-500/50"
                : "bg-slate-900/95 text-cyan-300 border-cyan-500/50"
            }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col overflow-hidden my-auto">
        {/* Modal Header Bar */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/20">
              📸
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Share Flood Report</h3>
              <p className="text-[11px] text-slate-400">Generate high-res Instagram Story or Feed Card</p>
            </div>
          </div>

          {/* Format Switcher Pills */}
          <div className="flex items-center p-1 bg-slate-900 border border-slate-700/80 rounded-xl text-xs">
            <button
              onClick={() => setShareFormat("story")}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${shareFormat === "story"
                  ? "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
                }`}
            >
              <span>📱</span>
              <span className="hidden sm:inline">IG Story</span>
            </button>

            <button
              onClick={() => setShareFormat("card")}
              className={`px-3 py-1 rounded-lg font-bold transition-all flex items-center gap-1.5 ${shareFormat === "card"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
                }`}
            >
              <span>🖼️</span>
              <span className="hidden sm:inline">Feed Card</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Preview Area */}
        <div className="p-3 sm:p-5 overflow-y-auto max-h-[65vh] bg-slate-950/60 flex flex-col items-center">
          <div className="w-full text-[11px] text-slate-400 font-medium flex items-center justify-between mb-3 px-1">
            <span>
              FORMAT:{" "}
              <strong className="text-cyan-400 uppercase">
                {shareFormat === "story" ? "📱 Instagram Story (9:16 Portrait)" : "🖼️ Standard Feed Card"}
              </strong>
            </span>
            <span className="font-mono text-cyan-400">2x Retina Canvas</span>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── FORMAT 1: INSTAGRAM STORY (9:16 PORTRAIT) ───────────────────── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {shareFormat === "story" ? (
            <div
              ref={cardRef}
              id="bahaba-share-card"
              className="w-full max-w-[360px] bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 border-2 border-slate-700/90 rounded-[28px] p-5 shadow-2xl space-y-3.5 text-white font-sans relative overflow-hidden"
              style={{ minHeight: "640px" }}
            >
              {/* Instagram Story Top Header */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xl shadow-lg shadow-cyan-500/30">
                    🌊
                  </div>
                  <div>
                    <div className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                      Baha Ba?
                      <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded bg-gradient-to-r from-pink-500/30 to-amber-500/30 text-pink-300 border border-pink-500/40">
                        LIVE ALERT
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">Metro Manila Flood Telemetry</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    PAGASA + Panahon
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">{timestampStr}</div>
                </div>
              </div>

              {/* Route or Selected Road Banner */}
              {isRouteActive && origin && destination && activeRoute ? (
                <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 space-y-2 shadow-md">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
                    <span>Driving Route</span>
                    <span className="text-blue-400 font-mono">{activeRoute.distanceKm} km • {activeRoute.durationMin} mins</span>
                  </div>
                  <div className="space-y-1.5">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center flex-shrink-0">
                        A
                      </span>
                      <strong className="text-slate-100 text-xs truncate">
                        {origin.name}
                      </strong>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center flex-shrink-0">
                        B
                      </span>
                      <strong className="text-slate-100 text-xs truncate">
                        {destination.name}
                      </strong>
                    </div>
                  </div>
                </div>
              ) : selectedRoad ? (
                <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 shadow-md space-y-0.5">
                  <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Monitored Corridor</div>
                  <div className="text-sm font-black text-white">{selectedRoad.roadName}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    Elevation: {selectedRoad.elevationMeters.toFixed(1)}m ASL • Nearest: {selectedRoad.nearestStation.stationName}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/90 border border-slate-800 rounded-2xl p-3 shadow-md flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Metro Manila Overview</div>
                    <div className="text-[10px] text-slate-400">Pasig-Marikina Basin Telemetry</div>
                  </div>
                  <div className="text-xs font-mono text-cyan-400 font-bold">
                    {metrics?.total ?? 0} Stations
                  </div>
                </div>
              )}

              {/* Hero Status Callout Banner */}
              <div
                className={`p-3 rounded-2xl border flex items-center justify-between shadow-lg ${statusColorClass}`}
              >
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Flood Status</div>
                  <div className="text-xs font-black tracking-wide">{statusLabel}</div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-bold uppercase tracking-wider opacity-80">Max Depth</div>
                  <div className="text-lg font-black font-mono leading-none">
                    {maxDepthCm} <span className="text-xs font-sans">cm</span>
                  </div>
                </div>
              </div>

              {/* Portrait Map Screenshot Snapshot */}
              <div className="w-full h-56 rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 relative flex items-center justify-center shadow-inner">
                {capturingMap ? (
                  <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                    <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Capturing map...</span>
                  </div>
                ) : mapSnapshotUrl ? (
                  <img
                    src={mapSnapshotUrl}
                    alt="Flood Map Snapshot"
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="text-slate-500 text-xs italic">Map snapshot preview</div>
                )}

                {/* Map Tag */}
                <div className="absolute bottom-2 left-2 bg-slate-950/80 backdrop-blur-md px-2 py-0.5 rounded-lg border border-slate-800 text-[9px] font-mono text-cyan-300">
                  🗺️ Live Basin View
                </div>
              </div>

              {/* Passable Vehicles Section */}
              <div className="bg-slate-950/80 border border-slate-800 rounded-2xl p-2.5 space-y-1.5 shadow-sm">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passable Vehicles</div>
                <div className="flex flex-wrap gap-1.5">
                  {passableVehicles.map((v: string, i: number) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1"
                    >
                      <span>🚗</span> {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Advisories if present */}
              {isRouteActive && activeRoute?.warnings && activeRoute.warnings.length > 0 && (
                <div className="text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/60 p-2 rounded-xl space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-amber-400">
                    <span>⚠️</span> Route Advisories
                  </div>
                  {activeRoute.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Instagram Story Footer / Link Sticker Callout */}
              <div className="pt-2 border-t border-slate-800/80 flex flex-col items-center text-center space-y-1">
                <div className="inline-flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-500/40 px-3 py-1 rounded-full shadow-sm">
                  <span>🔗</span> https://bahaba.nicolei.games
                </div>
                <div className="text-[8px] text-slate-500 font-mono">
                  Baha Ba? • Open Hydrological Telemetry & Road Risk Engine
                </div>
              </div>
            </div>
          ) : (
            /* ══════════════════════════════════════════════════════════════════ */
            /* ── FORMAT 2: STANDARD FEED / LANDSCAPE CARD ────────────────────── */
            /* ══════════════════════════════════════════════════════════════════ */
            <div
              ref={cardRef}
              id="bahaba-share-card"
              className="w-full bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-700/90 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 text-white font-sans relative overflow-hidden"
            >
              {/* Top Branding & Live Stamp */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-lg shadow-md shadow-cyan-500/30">
                    🌊
                  </div>
                  <div>
                    <div className="text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                      Baha Ba?
                      <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        METRO MANILA
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-400">Flood Navigation & Hydrological Telemetry</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    PAGASA + Panahon AWS
                  </div>
                  <div className="text-[9px] text-slate-400 font-mono mt-0.5">{timestampStr}</div>
                </div>
              </div>

              {/* Route & Destination Segment Header */}
              {isRouteActive && origin && destination && activeRoute ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-blue-600 text-white font-black text-[10px] flex items-center justify-center">
                          A
                        </span>
                        <strong className="text-slate-100 text-xs truncate max-w-[200px] sm:max-w-[260px]">
                          {origin.name}
                        </strong>
                      </div>
                      <div className="flex items-center gap-2 text-xs">
                        <span className="w-5 h-5 rounded-full bg-rose-600 text-white font-black text-[10px] flex items-center justify-center">
                          B
                        </span>
                        <strong className="text-slate-100 text-xs truncate max-w-[200px] sm:max-w-[260px]">
                          {destination.name}
                        </strong>
                      </div>
                    </div>

                    <div className="text-right pl-2 border-l border-slate-800">
                      <div className="text-sm font-extrabold text-blue-400 font-mono">
                        {activeRoute.durationMin} <span className="text-[10px] font-sans text-slate-400">mins</span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono">{activeRoute.distanceKm} km</div>
                    </div>
                  </div>
                </div>
              ) : selectedRoad ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3">
                  <div className="text-xs text-slate-400">Monitored Corridor:</div>
                  <div className="text-sm font-extrabold text-white">{selectedRoad.roadName}</div>
                  <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                    Elevation: {selectedRoad.elevationMeters.toFixed(1)}m ASL • Nearest: {selectedRoad.nearestStation.stationName}
                  </div>
                </div>
              ) : (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 flex items-center justify-between">
                  <div>
                    <div className="text-xs font-bold text-white">Metro Manila Flood Status Overview</div>
                    <div className="text-[10px] text-slate-400">Hydrological basin network active monitoring</div>
                  </div>
                  <div className="text-right font-mono text-xs text-cyan-400">
                    {metrics?.total ?? 0} Stations Active
                  </div>
                </div>
              )}

              {/* Map Visual Snapshot Area */}
              <div className="w-full h-52 sm:h-64 rounded-xl overflow-hidden border border-slate-800 bg-slate-950 relative flex items-center justify-center">
                {capturingMap ? (
                  <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                    <div className="w-6 h-6 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span>Rendering map snapshot...</span>
                  </div>
                ) : mapSnapshotUrl ? (
                  <img
                    src={mapSnapshotUrl}
                    alt="Flood Map Snapshot"
                    className="w-full h-full object-cover object-center"
                  />
                ) : (
                  <div className="text-slate-500 text-xs italic">Map snapshot preview</div>
                )}

                {/* In-Map Severity Badge Overlay */}
                <div className="absolute top-2.5 right-2.5">
                  <span
                    className={`text-[10px] font-black tracking-wider uppercase px-2.5 py-1 rounded-full border shadow-lg backdrop-blur-md ${statusColorClass}`}
                  >
                    {statusLabel}
                  </span>
                </div>
              </div>

              {/* Flood Metrics Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Max Flood Depth</div>
                  <div className="text-base font-black font-mono text-cyan-400">
                    {maxDepthCm} <span className="text-[11px] font-sans text-slate-400">cm</span>
                  </div>
                </div>

                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Passable Vehicles</div>
                  <div className="text-xs font-bold text-slate-200 truncate">
                    {passableVehicles.slice(0, 2).join(", ")}
                    {passableVehicles.length > 2 ? ` +${passableVehicles.length - 2}` : ""}
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-0.5">
                  <div className="text-[10px] font-semibold text-slate-400 uppercase">Telemetry Signal</div>
                  <div className="text-xs font-mono text-emerald-400 truncate">
                    {metrics ? `${metrics.peakWater.toFixed(2)}m Peak Water` : "Live Feed"}
                  </div>
                </div>
              </div>

              {/* Passable Vehicles Badges */}
              <div className="space-y-1">
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passable Vehicles</div>
                <div className="flex flex-wrap gap-1.5">
                  {passableVehicles.map((v: string, i: number) => (
                    <span
                      key={i}
                      className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1"
                    >
                      <span>🚗</span> {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Advisories & Warnings if any */}
              {isRouteActive && activeRoute?.warnings && activeRoute.warnings.length > 0 && (
                <div className="text-[10px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-lg space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-amber-400">
                    <span>⚠️</span> Route Advisories
                  </div>
                  {activeRoute.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Footer Watermark */}
              <div className="pt-2 border-t border-slate-800/70 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                <span>Baha Ba? – Flood Risk Navigation Engine</span>
                <span>https://bahaba.nicolei.games</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons Bar */}
        <div className="p-4 sm:p-5 border-t border-slate-800 bg-slate-950/90 flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Close
          </button>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Copy Plain Text */}
            <button
              onClick={handleCopyText}
              disabled={Boolean(actionLoading)}
              className="px-3.5 py-2 text-xs font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5"
            >
              <span>💬</span>
              <span>Copy Text</span>
            </button>

            {/* Download PNG */}
            <button
              onClick={handleDownloadImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="px-3.5 py-2 text-xs font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading === "download" ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>💾</span>
              )}
              <span>Download PNG</span>
            </button>

            {/* Copy Image to Clipboard */}
            <button
              onClick={handleCopyImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-cyan-600 hover:bg-cyan-500 rounded-xl transition-all shadow-md shadow-cyan-600/20 flex items-center gap-1.5 disabled:opacity-50"
            >
              {actionLoading === "copy-img" ? (
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>📋</span>
              )}
              <span>Copy Image</span>
            </button>

            {/* Native Share (Mobile / Supported Desktops) */}
            {canNativeShare && (
              <button
                onClick={handleNativeShare}
                disabled={Boolean(actionLoading) || capturingMap}
                className="px-4 py-2 text-xs font-bold text-white bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 hover:opacity-90 rounded-xl transition-all shadow-md shadow-pink-600/30 flex items-center gap-1.5 disabled:opacity-50"
              >
                {actionLoading === "share" ? (
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                ) : (
                  <span>📱</span>
                )}
                <span>Share Story</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
