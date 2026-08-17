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
        const mapEl = document.getElementById("bahaba-interactive-map");
        if (!mapEl) {
          setCapturingMap(false);
          return;
        }

        // Delay to allow camera animation and tiles to settle
        await new Promise((r) => setTimeout(r, 450));

        const captureOptions = {
          cacheBust: false,
          pixelRatio: 1.5,
          skipFonts: true,
          filter: (node: HTMLElement) => {
            if (
              node.classList &&
              (node.classList.contains("leaflet-control-zoom") ||
                node.classList.contains("leaflet-control-attribution"))
            ) {
              return false;
            }
            return true;
          },
        };

        let dataUrl: string | null = null;
        try {
          dataUrl = await toPng(mapEl, captureOptions);
        } catch (firstErr) {
          console.warn("[ShareModal] First capture attempt failed, retrying...", firstErr);
          await new Promise((r) => setTimeout(r, 400));
          dataUrl = await toPng(mapEl, captureOptions);
        }

        if (dataUrl) {
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
      <div className="relative w-full max-w-xl bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[92vh] overflow-hidden my-auto">
        {/* Modal Header Bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/80 gap-2.5">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/20 flex-shrink-0">
              📸
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Share Flood Report</h3>
              <p className="text-[10px] text-slate-400">Generate high-res Story or Feed Card</p>
            </div>
          </div>

          {/* Format Switcher Pills */}
          <div className="flex items-center p-0.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs">
            <button
              onClick={() => setShareFormat("story")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 text-[11px] ${shareFormat === "story"
                  ? "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
                }`}
            >
              <span>📱</span>
              <span>IG Story</span>
            </button>

            <button
              onClick={() => setShareFormat("card")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 text-[11px] ${shareFormat === "card"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
                }`}
            >
              <span>🖼️</span>
              <span>Feed Card</span>
            </button>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
            title="Close"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable Preview Area */}
        <div className="p-3 sm:p-4 overflow-y-auto flex-1 bg-slate-950/60 flex flex-col items-center custom-scrollbar">
          <div className="w-full text-[10px] text-slate-400 font-medium flex items-center justify-between mb-2.5 px-1">
            <span>
              FORMAT:{" "}
              <strong className="text-cyan-400 uppercase">
                {shareFormat === "story" ? "📱 IG Story (9:16)" : "🖼️ Standard Feed Card"}
              </strong>
            </span>
            <span className="font-mono text-cyan-400">
              {capturingMap ? "🔄 Capturing Map..." : "✓ 2x Retina Ready"}
            </span>
          </div>

          {/* ══════════════════════════════════════════════════════════════════ */}
          {/* ── FORMAT 1: INSTAGRAM STORY (9:16 PORTRAIT WITH CENTERED CARD) ── */}
          {/* ══════════════════════════════════════════════════════════════════ */}
          {shareFormat === "story" ? (
            <div
              ref={cardRef}
              id="bahaba-share-card"
              className="w-full max-w-[340px] sm:max-w-[370px] aspect-[9/16] bg-[#060a14] shadow-2xl p-3.5 sm:p-4 text-white font-sans relative overflow-hidden flex flex-col justify-center items-center rounded-none"
            >
              {/* Atmospheric Background Lighting */}
              <div className="absolute top-10 left-1/2 -translate-x-1/2 w-64 h-32 bg-cyan-600/10 rounded-full blur-3xl pointer-events-none" />
              <div className="absolute bottom-12 left-1/2 -translate-x-1/2 w-64 h-32 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

              {/* ── Inner Floating Card (Centered in Safe Zone) ──────────────── */}
              <div className="w-full bg-[#0b1222]/95 border border-slate-800/90 rounded-[28px] p-3.5 sm:p-4 shadow-2xl space-y-2.5 relative z-10">
                {/* Header Row */}
                <div className="flex items-center justify-between border-b border-slate-800/80 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/30 flex-shrink-0">
                      🌊
                    </div>
                    <div>
                      <div className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                        Baha Ba?
                        <span className="text-[8px] font-extrabold px-1.5 py-0.2 rounded bg-gradient-to-r from-pink-500/30 to-amber-500/30 text-pink-300 border border-pink-500/40">
                          LIVE ALERT
                        </span>
                      </div>
                      <div className="text-[9px] text-slate-400">Metro Manila Flood Telemetry</div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="inline-flex items-center gap-1 text-[8px] font-semibold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2 py-0.5 rounded-full">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                      PAGASA + Panahon
                    </div>
                    <div className="text-[8px] text-slate-400 font-mono mt-0.5">{timestampStr}</div>
                  </div>
                </div>

                {/* Section 1: Monitored Road Segment / Driving Route */}
                {isRouteActive && origin && destination && activeRoute ? (
                  <div className="bg-[#070c18]/90 border border-slate-800/80 rounded-2xl p-2.5 space-y-1 shadow-sm">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
                      <span>Driving Route</span>
                      <span className="text-blue-400 font-mono text-[10px]">{activeRoute.distanceKm} km • {activeRoute.durationMin} mins</span>
                    </div>
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white font-black text-[9px] flex items-center justify-center flex-shrink-0">
                          A
                        </span>
                        <strong className="text-slate-100 text-xs truncate">
                          {origin.name}
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center flex-shrink-0">
                          B
                        </span>
                        <strong className="text-slate-100 text-xs truncate">
                          {destination.name}
                        </strong>
                      </div>
                    </div>
                  </div>
                ) : selectedRoad ? (
                  <div className="bg-[#070c18]/90 border border-slate-800/80 rounded-2xl p-2.5 space-y-0.5 shadow-sm">
                    <div className="text-[9px] font-bold text-cyan-400 uppercase tracking-wider">
                      Monitored Road Segment
                    </div>
                    <strong className="text-xs sm:text-sm font-bold text-white block truncate">
                      {selectedRoad.roadName}
                    </strong>
                    <div className="text-[9px] text-slate-400 flex items-center gap-2 font-mono">
                      <span>Elev: {selectedRoad.elevationMeters.toFixed(1)}m</span>
                      <span>•</span>
                      <span>Stn: {selectedRoad.nearestStation.stationName}</span>
                    </div>
                  </div>
                ) : null}

                {/* Section 2: Flood Risk Assessment */}
                <div className="p-2.5 rounded-2xl bg-[#070c18]/90 border border-slate-800/80 text-center space-y-1 shadow-sm">
                  <div className="text-[9px] font-bold uppercase tracking-wider text-slate-400">
                    Flood Risk Assessment
                  </div>
                  <div>
                    <div
                      className={`inline-block px-3 py-1 rounded-full text-xs font-black border tracking-wide shadow-md whitespace-normal break-words text-center ${statusColorClass}`}
                    >
                      {statusLabel}
                    </div>
                  </div>
                  <div className="text-[10px] text-slate-300 font-mono flex items-center justify-center gap-3 pt-0.5">
                    <span>
                      Max Depth: <strong className="text-white text-[11px]">{maxDepthCm} cm</strong>
                    </span>
                    {activeRoute && (
                      <span>
                        Flooded: <strong className="text-white text-[11px]">{activeRoute.totalFloodedKm} km</strong>
                      </span>
                    )}
                  </div>
                </div>

                {/* Section 3: Map Snapshot Visual */}
                <div className="relative w-full h-[155px] sm:h-[170px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-inner">
                  {capturingMap ? (
                    <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                      <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                      <span className="text-[10px]">Rendering map view...</span>
                    </div>
                  ) : mapSnapshotUrl ? (
                    <img
                      src={mapSnapshotUrl}
                      alt="Map snapshot"
                      className="w-full h-full object-cover"
                      crossOrigin="anonymous"
                    />
                  ) : (
                    <div className="text-slate-500 text-xs italic">Map snapshot preview</div>
                  )}

                  <div className="absolute bottom-1.5 left-1.5 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-mono text-cyan-300 border border-slate-800">
                    🗺️ Live Basin View
                  </div>
                </div>

                {/* Section 4: Passable Vehicles Section */}
                <div className="bg-[#070c18]/90 border border-slate-800/80 rounded-2xl p-2 space-y-1 shadow-sm">
                  <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Passable Vehicles</div>
                  <div className="flex flex-wrap gap-1">
                    {passableVehicles.map((v: string, i: number) => (
                      <span
                        key={i}
                        className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-[#131d35] text-slate-200 border border-slate-700/80 flex items-center gap-1"
                      >
                        <span>🚗</span> {v}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Advisories if present */}
                {isRouteActive && activeRoute?.warnings && activeRoute.warnings.length > 0 && (
                  <div className="text-[9px] text-amber-300 bg-amber-950/50 border border-amber-800/60 p-1.5 rounded-xl space-y-0.5">
                    <div className="font-bold flex items-center gap-1 text-amber-400 text-[9px]">
                      <span>⚠️</span> Route Advisories
                    </div>
                    {activeRoute.warnings.map((w, i) => (
                      <div key={i}>• {w}</div>
                    ))}
                  </div>
                )}

                {/* Section 5: Link Sticker & Watermark */}
                <div className="pt-1.5 border-t border-slate-800/80 flex flex-col items-center text-center space-y-0.5">
                  <div className="inline-flex items-center gap-1 text-[9px] font-bold text-cyan-400 bg-cyan-950/80 border border-cyan-500/40 px-3 py-1 rounded-full shadow-md">
                    <span>🔗</span> https://bahaba.nicolei.games
                  </div>
                  <div className="text-[8px] text-slate-500 font-mono">
                    Baha Ba? • Open Flood Risk Navigation Engine
                  </div>
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
              className="w-full max-w-[440px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-700/90 rounded-2xl p-3.5 sm:p-4 shadow-2xl space-y-3 text-white font-sans relative overflow-hidden"
            >
              {/* Top Branding & Live Stamp */}
              <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/30 flex-shrink-0">
                    🌊
                  </div>
                  <div>
                    <div className="text-xs sm:text-sm font-black tracking-tight text-white flex items-center gap-1.5">
                      Baha Ba?
                      <span className="text-[9px] font-bold px-1.5 py-0.2 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                        METRO MANILA
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-400">Flood Navigation & Hydrological Telemetry</div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="inline-flex items-center gap-1 text-[8px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2 py-0.5 rounded-full">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                    PAGASA + Panahon
                  </div>
                  <div className="text-[8px] text-slate-400 font-mono mt-0.5">{timestampStr}</div>
                </div>
              </div>

              {/* Route & Destination Segment Header */}
              {isRouteActive && origin && destination && activeRoute ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-4 h-4 rounded-full bg-blue-600 text-white font-black text-[9px] flex items-center justify-center">
                          A
                        </span>
                        <strong className="text-slate-100 text-xs truncate max-w-[160px] sm:max-w-[220px]">
                          {origin.name}
                        </strong>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center">
                          B
                        </span>
                        <strong className="text-slate-100 text-xs truncate max-w-[160px] sm:max-w-[220px]">
                          {destination.name}
                        </strong>
                      </div>
                    </div>

                    <div className="text-right font-mono">
                      <div className="text-xs font-bold text-white">{activeRoute.durationMin} mins</div>
                      <div className="text-[10px] text-slate-400">{activeRoute.distanceKm} km</div>
                    </div>
                  </div>
                </div>
              ) : selectedRoad ? (
                <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-2.5 space-y-1">
                  <div className="text-[9px] font-bold text-cyan-400 uppercase">Monitored Road Corridor</div>
                  <div className="text-xs sm:text-sm font-bold text-white truncate">{selectedRoad.roadName}</div>
                  <div className="text-[9px] text-slate-400 font-mono">
                    Elevation: {selectedRoad.elevationMeters.toFixed(1)}m | Station: {selectedRoad.nearestStation.stationName}
                  </div>
                </div>
              ) : null}

              {/* Status & Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2 space-y-0.5">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase">Status</div>
                  <div className="text-xs font-bold">
                    <span className={`px-2 py-0.5 rounded-md border inline-block text-[10px] whitespace-normal break-words ${statusColorClass}`}>
                      {statusLabel}
                    </span>
                  </div>
                </div>

                <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2 space-y-0.5">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase">Max Depth</div>
                  <div className="text-xs font-black font-mono text-cyan-400">
                    {maxDepthCm} <span className="text-[9px] font-sans text-slate-400">cm</span>
                  </div>
                </div>

                <div className="col-span-2 sm:col-span-1 bg-slate-950/90 border border-slate-800 rounded-xl p-2 space-y-0.5">
                  <div className="text-[9px] font-semibold text-slate-400 uppercase">Telemetry Signal</div>
                  <div className="text-xs font-mono text-emerald-400 truncate">
                    {metrics ? `${metrics.peakWater.toFixed(2)}m Peak` : "Live Feed"}
                  </div>
                </div>
              </div>

              {/* Map Snapshot Visual in Feed Card */}
              <div className="relative w-full h-[140px] sm:h-[160px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-inner">
                {capturingMap ? (
                  <div className="flex flex-col items-center gap-2 text-slate-400 text-xs">
                    <div className="w-5 h-5 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-[10px]">Rendering map view...</span>
                  </div>
                ) : mapSnapshotUrl ? (
                  <img
                    src={mapSnapshotUrl}
                    alt="Map snapshot"
                    className="w-full h-full object-cover"
                    crossOrigin="anonymous"
                  />
                ) : (
                  <div className="text-slate-500 text-xs italic">Map snapshot preview</div>
                )}
                <div className="absolute bottom-1.5 left-1.5 bg-slate-950/80 backdrop-blur-md px-1.5 py-0.5 rounded text-[8px] font-mono text-cyan-300 border border-slate-800">
                  🗺️ Map Snapshot
                </div>
              </div>

              {/* Passable Vehicles Badges */}
              <div className="space-y-1">
                <div className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Passable Vehicles</div>
                <div className="flex flex-wrap gap-1">
                  {passableVehicles.map((v: string, i: number) => (
                    <span
                      key={i}
                      className="text-[9px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-200 border border-slate-700 flex items-center gap-1"
                    >
                      <span>🚗</span> {v}
                    </span>
                  ))}
                </div>
              </div>

              {/* Advisories & Warnings if any */}
              {isRouteActive && activeRoute?.warnings && activeRoute.warnings.length > 0 && (
                <div className="text-[9px] text-amber-300 bg-amber-950/40 border border-amber-800/60 p-2 rounded-lg space-y-0.5">
                  <div className="font-bold flex items-center gap-1 text-amber-400">
                    <span>⚠️</span> Route Advisories
                  </div>
                  {activeRoute.warnings.map((w, i) => (
                    <div key={i}>• {w}</div>
                  ))}
                </div>
              )}

              {/* Footer Watermark */}
              <div className="pt-1.5 border-t border-slate-800/70 flex items-center justify-between text-[8px] text-slate-500 font-mono">
                <span>Baha Ba? – Flood Risk Navigation Engine</span>
                <span>https://bahaba.nicolei.games</span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Action Buttons Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/95 space-y-2">
          {/* Primary Action Button */}
          {canNativeShare ? (
            <button
              onClick={handleNativeShare}
              disabled={Boolean(actionLoading) || capturingMap}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 hover:opacity-95 rounded-xl transition-all shadow-md shadow-pink-600/25 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {actionLoading === "share" ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>📱</span>
              )}
              <span>Share {shareFormat === "story" ? "Instagram Story" : "Feed Card"}</span>
            </button>
          ) : (
            <button
              onClick={handleDownloadImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="w-full py-2.5 px-4 text-xs font-bold text-white bg-gradient-to-r from-cyan-600 to-blue-600 hover:opacity-95 rounded-xl transition-all shadow-md shadow-cyan-600/25 flex items-center justify-center gap-2 active:scale-95 disabled:opacity-50"
            >
              {actionLoading === "download" ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <span>💾</span>
              )}
              <span>Download High-Res PNG</span>
            </button>
          )}

          {/* Secondary Quick Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleDownloadImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="py-2 px-2 text-[11px] font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-1 disabled:opacity-50"
              title="Save PNG image"
            >
              <span>💾</span>
              <span>Download</span>
            </button>

            <button
              onClick={handleCopyImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="py-2 px-2 text-[11px] font-semibold text-white bg-cyan-700 hover:bg-cyan-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1 disabled:opacity-50"
              title="Copy image to clipboard"
            >
              <span>📋</span>
              <span>Copy Image</span>
            </button>

            <button
              onClick={handleCopyText}
              disabled={Boolean(actionLoading)}
              className="py-2 px-2 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-1"
              title="Copy formatted text summary"
            >
              <span>💬</span>
              <span>Copy Text</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
