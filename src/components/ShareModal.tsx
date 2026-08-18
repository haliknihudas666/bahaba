"use client";

// ---------------------------------------------------------------------------
// Bahaba – Flood Report Share Modal (Instagram Story 9:16 & Standard Card)
// Full-resolution export with centered, responsive auto-scaled preview.
// ---------------------------------------------------------------------------

import { useState, useRef, useEffect, useCallback } from "react";
import { toPng, toBlob } from "html-to-image";
import type { RouteOption } from "@/lib/engine/routeSolver";
import type { RoadRiskResult } from "@/lib/engine/roadRisk";
import { classifyFloodRisk } from "@/lib/engine/floodPredictor";
import { trackShareAction } from "@/lib/firebase/analytics";

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
  const [shareFormat, setShareFormat] = useState<ShareFormat>("story");
  const [mapSnapshotUrl, setMapSnapshotUrl] = useState<string | null>(null);
  const [capturingMap, setCapturingMap] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" | "info" } | null>(null);
  const [canNativeShare, setCanNativeShare] = useState<boolean>(false);

  // References for preview container and export capture node
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const exportCardRef = useRef<HTMLDivElement>(null);
  const [previewScale, setPreviewScale] = useState<number>(0.5);

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

  // Determine Flood Status details
  const isRouteActive = Boolean(origin?.name && destination?.name && activeRoute);
  const isWalking = activeRoute?.mode === "walking";

  const statusLabel = isRouteActive
    ? isWalking
      ? activeRoute?.walkability?.label || (activeRoute?.overallStatus === "SAFE" ? "WALKABLE / CLEAR" : "WADING HAZARD")
      : activeRoute?.overallStatus === "SAFE"
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
    ? isWalking
      ? activeRoute?.walkability?.category === "WALKABLE_CLEAR"
        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/50"
        : activeRoute?.walkability?.category === "WALKABLE_BOOTS"
          ? "bg-amber-500/20 text-amber-400 border-amber-500/50"
          : activeRoute?.walkability?.category === "HAZARDOUS_WADING"
            ? "bg-orange-500/20 text-orange-400 border-orange-500/50"
            : "bg-rose-500/20 text-rose-400 border-rose-500/50"
      : activeRoute?.overallStatus === "SAFE"
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

  // Dynamic Scale Calculation for Centered & Fitted Modal Preview
  useEffect(() => {
    if (!isOpen) return;

    const computeScale = () => {
      if (!previewContainerRef.current) return;
      const rect = previewContainerRef.current.getBoundingClientRect();
      const availableWidth = rect.width > 0 ? rect.width - 24 : 360;
      const availableHeight = rect.height > 0 ? rect.height - 24 : 500;

      const baseW = shareFormat === "story" ? 540 : 560;
      const baseH = shareFormat === "story" ? 960 : 700;

      const scaleX = availableWidth / baseW;
      const scaleY = availableHeight / baseH;
      const fitted = Math.min(scaleX, scaleY, 1);
      setPreviewScale(Math.max(0.3, Math.min(1, fitted)));
    };

    computeScale();
    window.addEventListener("resize", computeScale);
    const t = setTimeout(computeScale, 120);
    return () => {
      window.removeEventListener("resize", computeScale);
      clearTimeout(t);
    };
  }, [isOpen, shareFormat, capturingMap]);

  // Capture Map Snapshot and track open whenever Modal opens
  useEffect(() => {
    if (!isOpen) {
      setMapSnapshotUrl(null);
      return;
    }

    trackShareAction({
      action: "open_modal",
      format: shareFormat,
      targetType: isRouteActive ? "route" : selectedRoad ? "road" : "general",
    });

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

  // Generate plain-text summary for messaging/clipboard
  const buildTextSummary = () => {
    const lines = [`🌊 *BAHA BA? FLOOD ASSESSMENT REPORT*`];
    lines.push(`⏱️ *As of:* ${timestampStr}`);

    if (isRouteActive && origin && destination && activeRoute) {
      if (isWalking) {
        lines.push(`🚶 *Mode:* Walking / Pedestrian`);
        lines.push(`📍 *Route:* ${origin.name} ➔ ${destination.name}`);
        lines.push(`📏 *Distance:* ${activeRoute.distanceKm} km (~${activeRoute.durationMin} mins walk)`);
        lines.push(`🥾 *Walkability:* ${statusLabel} (Score: ${activeRoute.walkability?.score ?? 80}/100)`);
        lines.push(`🌊 *Max Wading Depth:* ${maxDepthCm} cm`);
        if (activeRoute.walkability?.wadingDelayMin && activeRoute.walkability.wadingDelayMin > 0) {
          lines.push(`⏱️ *Wading Delay:* +${activeRoute.walkability.wadingDelayMin} mins slowdown`);
        }
        if (activeRoute.walkability?.recommendedGear) {
          lines.push(`🎒 *Gear:* ${activeRoute.walkability.recommendedGear.join(", ")}`);
        }
      } else {
        lines.push(`🚗 *Mode:* Driving / Vehicle`);
        lines.push(`📍 *Route:* ${origin.name} ➔ ${destination.name}`);
        lines.push(`📏 *Distance:* ${activeRoute.distanceKm} km (~${activeRoute.durationMin} mins)`);
        lines.push(`🚨 *Flood Status:* ${statusLabel} (Max Depth: ${maxDepthCm} cm)`);
        if (activeRoute.traffic) {
          lines.push(`🚦 *Traffic Condition:* ${activeRoute.traffic.label} (${activeRoute.traffic.averageSpeedKmH} km/h avg speed)`);
        }
        if (activeRoute.totalFloodedKm > 0) {
          lines.push(`⚠️ *Flooded Segment Length:* ${activeRoute.totalFloodedKm} km`);
        }
        lines.push(`🚗 *Passable Vehicles:* ${passableVehicles.join(", ")}`);
      }
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

  // 1. Action: Copy High-Res Image to Clipboard
  const handleCopyImage = async () => {
    if (!exportCardRef.current) return;
    setActionLoading("copy-img");
    trackShareAction({
      action: "copy_image",
      format: shareFormat,
      targetType: isRouteActive ? "route" : selectedRoad ? "road" : "general",
    });
    try {
      const blob = await toBlob(exportCardRef.current, {
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
        showToast("✅ Full-res image copied to clipboard! Ready to paste into Instagram Story or chat.", "success");
      } else {
        await handleDownloadImage();
        showToast("📋 Direct clipboard image not supported on this browser. Downloaded instead!", "info");
      }
    } catch (err) {
      console.error("Clipboard copy error:", err);
      showToast("❌ Failed to copy image. Downloading instead...", "error");
      await handleDownloadImage();
    } finally {
      setActionLoading(null);
    }
  };

  // 2. Action: Download Full-Resolution PNG
  const handleDownloadImage = async () => {
    if (!exportCardRef.current) return;
    setActionLoading("download");
    trackShareAction({
      action: "download_png",
      format: shareFormat,
      targetType: isRouteActive ? "route" : selectedRoad ? "road" : "general",
    });
    try {
      const dataUrl = await toPng(exportCardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      const filename = `bahaba-flood-${shareFormat === "story" ? "story-9x16" : "feed-card"}-${Date.now()}.png`;
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      showToast(`✅ ${shareFormat === "story" ? "Full-Res IG Story (1080x1920)" : "Full-Res Feed Card"} saved!`, "success");
    } catch (err) {
      console.error("Download error:", err);
      showToast("❌ Failed to export image", "error");
    } finally {
      setActionLoading(null);
    }
  };

  // 3. Action: Native Web Share
  const handleNativeShare = async () => {
    if (!exportCardRef.current) return;
    setActionLoading("share");
    trackShareAction({
      action: "native_share",
      format: shareFormat,
      targetType: isRouteActive ? "route" : selectedRoad ? "road" : "general",
    });
    try {
      const blob = await toBlob(exportCardRef.current, {
        pixelRatio: 2,
        cacheBust: true,
      });

      if (blob && navigator.share) {
        const filename = shareFormat === "story" ? "bahaba-story-9x16.png" : "bahaba-flood-report.png";
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
    trackShareAction({
      action: "copy_text",
      format: shareFormat,
      targetType: isRouteActive ? "route" : selectedRoad ? "road" : "general",
    });
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

  // Shared parameters for Story & Feed Card Renderers
  const cardData = {
    timestampStr,
    isRouteActive,
    isWalking,
    origin,
    destination,
    activeRoute,
    selectedRoad,
    metrics,
    statusLabel,
    statusColorClass,
    maxDepthCm,
    passableVehicles,
    mapSnapshotUrl,
    capturingMap,
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-hidden animate-in fade-in duration-200">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-5 left-1/2 -translate-x-1/2 z-[10000] px-4 py-2.5 rounded-xl shadow-2xl border text-xs font-semibold flex items-center gap-2 transition-all animate-bounce ${
            toastMessage.type === "success"
              ? "bg-emerald-950/95 text-emerald-300 border-emerald-500/50"
              : toastMessage.type === "error"
                ? "bg-rose-950/95 text-rose-300 border-rose-500/50"
                : "bg-slate-900/95 text-cyan-300 border-cyan-500/50"
          }`}
        >
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Modal Dialog Box */}
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-700/80 rounded-3xl shadow-2xl flex flex-col max-h-[94vh] overflow-hidden my-auto">
        {/* Modal Header Bar */}
        <div className="px-4 sm:px-5 py-3 border-b border-slate-800 flex items-center justify-between bg-slate-950/90 gap-2 flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-base shadow-md shadow-cyan-500/20 flex-shrink-0">
              📸
            </div>
            <div>
              <h3 className="text-sm font-bold text-white tracking-tight">Share Flood Report</h3>
              <p className="text-[10px] text-slate-400">Export full-res Story or Feed Card</p>
            </div>
          </div>

          {/* Format Switcher Pills */}
          <div className="flex items-center p-0.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs">
            <button
              onClick={() => setShareFormat("story")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 text-[11px] ${
                shareFormat === "story"
                  ? "bg-gradient-to-r from-fuchsia-600 via-pink-600 to-amber-500 text-white shadow-md"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <span>📱</span>
              <span>IG Story</span>
            </button>

            <button
              onClick={() => setShareFormat("card")}
              className={`px-2.5 py-1 rounded-lg font-bold transition-all flex items-center gap-1 text-[11px] ${
                shareFormat === "card"
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

        {/* ── Centered & Responsive Preview Area ──────────────────────── */}
        <div
          ref={previewContainerRef}
          className="p-2 sm:p-3 flex-1 bg-slate-950/70 flex flex-col items-center justify-center min-h-[380px] max-h-[64vh] sm:max-h-[68vh] overflow-hidden relative"
        >
          {/* Format Header Status Info */}
          <div className="w-full text-[10px] text-slate-400 font-medium flex items-center justify-between px-2 mb-1 flex-shrink-0">
            <span>
              FORMAT:{" "}
              <strong className="text-cyan-400 uppercase">
                {shareFormat === "story" ? "📱 IG Story (9:16 • 1080x1920)" : "🖼️ Standard Feed Card"}
              </strong>
            </span>
            <span className="font-mono text-cyan-400">
              {capturingMap ? "🔄 Capturing Map..." : "✓ Full Resolution"}
            </span>
          </div>

          {/* Centered Scaled Box */}
          <div
            style={{
              width: `${(shareFormat === "story" ? 540 : 560) * previewScale}px`,
              height: `${(shareFormat === "story" ? 960 : 700) * previewScale}px`,
            }}
            className="relative flex items-center justify-center transition-all duration-150 shadow-2xl rounded-2xl overflow-hidden border border-slate-800/90 flex-shrink-0"
          >
            <div
              style={{
                width: `${shareFormat === "story" ? 540 : 560}px`,
                height: `${shareFormat === "story" ? 960 : 700}px`,
                transform: `scale(${previewScale})`,
                transformOrigin: "top left",
                position: "absolute",
                top: 0,
                left: 0,
              }}
            >
              {shareFormat === "story" ? (
                <StoryCardContent {...cardData} />
              ) : (
                <FeedCardContent {...cardData} />
              )}
            </div>
          </div>
        </div>

        {/* ── Modal Action Buttons Bar ───────────────────────────────── */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/95 space-y-2 flex-shrink-0">
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
              <span>Share {shareFormat === "story" ? "Instagram Story (9:16)" : "Feed Card"}</span>
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
              <span>Download Full-Res PNG (1080x1920)</span>
            </button>
          )}

          {/* Secondary Action Buttons */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={handleDownloadImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="py-2 px-2 text-[11px] font-semibold text-slate-200 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
              title="Save full resolution PNG image"
            >
              <span>💾</span>
              <span>Download</span>
            </button>

            <button
              onClick={handleCopyImage}
              disabled={Boolean(actionLoading) || capturingMap}
              className="py-2 px-2 text-[11px] font-semibold text-white bg-cyan-700 hover:bg-cyan-600 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5 disabled:opacity-50 active:scale-95"
              title="Copy high-res image to clipboard"
            >
              <span>📋</span>
              <span>Copy Image</span>
            </button>

            <button
              onClick={handleCopyText}
              disabled={Boolean(actionLoading)}
              className="py-2 px-2 text-[11px] font-semibold text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors flex items-center justify-center gap-1.5 active:scale-95"
              title="Copy formatted text summary"
            >
              <span>💬</span>
              <span>Copy Text</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Offscreen Target Node for High-Res Export Capture ────────── */}
      <div
        aria-hidden="true"
        style={{
          position: "fixed",
          left: "-9999px",
          top: 0,
          width: shareFormat === "story" ? "540px" : "560px",
          height: shareFormat === "story" ? "960px" : "700px",
          zIndex: -1000,
          pointerEvents: "none",
          opacity: 1,
        }}
      >
        <div ref={exportCardRef}>
          {shareFormat === "story" ? (
            <StoryCardContent {...cardData} />
          ) : (
            <FeedCardContent {...cardData} />
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Instagram Story Content Component (540 x 960 Canvas)
// Standard 9:16 Aspect Ratio with Safe Zones & Centered Floating Card
// ---------------------------------------------------------------------------
function StoryCardContent({
  timestampStr,
  isRouteActive,
  isWalking,
  origin,
  destination,
  activeRoute,
  selectedRoad,
  metrics,
  statusLabel,
  statusColorClass,
  maxDepthCm,
  passableVehicles,
  mapSnapshotUrl,
  capturingMap,
}: any) {
  return (
    <div className="w-[540px] h-[960px] max-h-[960px] bg-[#050813] text-white font-sans relative overflow-hidden flex flex-col justify-between p-6 pt-9 pb-7 select-none">
      {/* Ambient Lighting Gradients */}
      <div className="absolute -top-12 left-1/2 -translate-x-1/2 w-[420px] h-[260px] bg-cyan-600/15 rounded-full blur-[90px] pointer-events-none" />
      <div className="absolute -bottom-12 left-1/2 -translate-x-1/2 w-[420px] h-[260px] bg-indigo-600/15 rounded-full blur-[90px] pointer-events-none" />

      {/* ── TOP SAFE ZONE: Brand & Live Header ───────────────────────── */}
      <div className="flex items-center justify-between relative z-10 px-1 border-b border-slate-800/80 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-xl shadow-lg shadow-cyan-500/30 flex-shrink-0">
            🌊
          </div>
          <div>
            <div className="text-base font-black tracking-tight text-white flex items-center gap-2">
              Baha Ba?
              <span className="text-[9px] font-extrabold px-2 py-0.5 rounded-full bg-gradient-to-r from-pink-500/30 to-amber-500/30 text-pink-300 border border-pink-500/40">
                LIVE ALERT
              </span>
            </div>
            <div className="text-[11px] text-slate-400 font-medium">Metro Manila Flood Telemetry</div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1.5 text-[9px] font-bold text-emerald-400 bg-emerald-950/80 border border-emerald-500/40 px-2.5 py-1 rounded-full">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            PAGASA + Panahon
          </div>
          <div className="text-[10px] text-slate-400 font-mono mt-1">{timestampStr}</div>
        </div>
      </div>

      {/* ── MIDDLE SAFE ZONE: Floating Information Card ──────────────── */}
      <div className="w-full bg-[#0a1224]/95 border border-slate-700/80 rounded-[28px] p-5 shadow-2xl space-y-3 relative z-10 backdrop-blur-xl">
        {/* Route / Corridor Header */}
        {isRouteActive && origin && destination && activeRoute ? (
          <div className="bg-[#060b17]/95 border border-slate-800/90 rounded-2xl p-3 space-y-1.5 shadow-sm">
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider flex items-center justify-between">
              <span>{isWalking ? "🚶 Walking Route" : "🚗 Driving Route"}</span>
              <span className="text-blue-400 font-mono text-[11px]">
                {activeRoute.distanceKm} km • {activeRoute.durationMin} mins {isWalking ? "walk" : "drive"}
              </span>
            </div>
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full ${isWalking ? "bg-cyan-600" : "bg-blue-600"} text-white font-black text-[9px] flex items-center justify-center flex-shrink-0`}>
                  A
                </span>
                <strong className="text-slate-100 truncate max-w-[420px]">{origin.name}</strong>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center flex-shrink-0">
                  B
                </span>
                <strong className="text-slate-100 truncate max-w-[420px]">{destination.name}</strong>
              </div>
            </div>
            {!isWalking && activeRoute.traffic && (
              <div className="text-[10px] pt-1.5 text-slate-300 flex items-center justify-between border-t border-slate-800/80 font-mono">
                <span className="text-slate-400">Traffic Status:</span>
                <span className="font-bold" style={{ color: activeRoute.traffic.color }}>
                  🚦 {activeRoute.traffic.label} ({activeRoute.traffic.averageSpeedKmH} km/h)
                </span>
              </div>
            )}
            {isWalking && activeRoute.walkability && (
              <div className="text-[10px] pt-1.5 text-slate-300 flex items-center justify-between border-t border-slate-800/80 font-mono">
                <span className="text-slate-400">Walkability Score:</span>
                <span className="font-bold" style={{ color: activeRoute.walkability.color }}>
                  🥾 {activeRoute.walkability.score}/100 ({activeRoute.walkability.label})
                </span>
              </div>
            )}
          </div>
        ) : selectedRoad ? (
          <div className="bg-[#060b17]/95 border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
              Monitored Road Corridor
            </div>
            <strong className="text-sm font-bold text-white block truncate">
              {selectedRoad.roadName}
            </strong>
            <div className="text-[10px] text-slate-400 flex items-center gap-2 font-mono">
              <span>Elev: {selectedRoad.elevationMeters.toFixed(1)}m</span>
              <span>•</span>
              <span>Station: {selectedRoad.nearestStation.stationName}</span>
            </div>
          </div>
        ) : (
          <div className="bg-[#060b17]/95 border border-slate-800/90 rounded-2xl p-3 space-y-1 shadow-sm">
            <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">
              Metro Manila Hydro Summary
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-0.5">
              <span className="text-slate-300">Active Stations: <strong>{metrics?.total ?? 0}</strong></span>
              <span className="text-amber-400">Alerts / Alarms: <strong>{metrics?.highRisk ?? 0}</strong></span>
            </div>
          </div>
        )}

        {/* Flood Risk Assessment Banner */}
        <div className="p-3 rounded-2xl bg-[#060b17]/95 border border-slate-800/90 text-center space-y-1.5 shadow-sm">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
            {isWalking ? "Walkability & Flood Depth" : "Flood Risk Assessment"}
          </div>
          <div>
            <div className={`inline-block px-4 py-1 rounded-full text-xs font-black border tracking-wide shadow-md whitespace-normal break-words text-center ${statusColorClass}`}>
              {statusLabel}
            </div>
          </div>
          <div className="text-[11px] text-slate-300 font-mono flex items-center justify-center gap-4 pt-0.5">
            <span>
              {isWalking ? "Max Wading:" : "Max Depth:"} <strong className="text-white text-xs">{maxDepthCm} cm</strong>
            </span>
            {activeRoute && (
              <span>
                Flooded: <strong className="text-white text-xs">{activeRoute.totalFloodedKm} km</strong>
              </span>
            )}
          </div>
        </div>

        {/* Map Snapshot Visual */}
        <div className="relative w-full h-[180px] rounded-2xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-inner">
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

          <div className="absolute bottom-2 left-2 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 border border-slate-800">
            🗺️ Live Basin View
          </div>
        </div>

        {/* Actionable Gear OR Passable Vehicles */}
        {isWalking ? (
          <div className="bg-[#060b17]/95 border border-slate-800/90 rounded-2xl p-2.5 space-y-1 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommended Pedestrian Gear</div>
            <div className="flex flex-wrap gap-1.5">
              {(activeRoute?.walkability?.recommendedGear || ["Comfortable Walking Shoes", "Umbrella / Raincoat"]).map((g: string, i: number) => (
                <span
                  key={i}
                  className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-[#111c36] text-cyan-200 border border-cyan-700/60 flex items-center gap-1"
                >
                  <span>🥾</span> {g}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <div className="bg-[#060b17]/95 border border-slate-800/90 rounded-2xl p-2.5 space-y-1 shadow-sm">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Passable Vehicles</div>
            <div className="flex flex-wrap gap-1.5">
              {passableVehicles.map((v: string, i: number) => (
                <span
                  key={i}
                  className="text-[10px] font-semibold px-2.5 py-0.5 rounded-md bg-[#111c36] text-slate-200 border border-slate-700/80 flex items-center gap-1"
                >
                  <span>🚗</span> {v}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Advisories if present */}
        {isRouteActive && activeRoute?.warnings && activeRoute.warnings.length > 0 && (
          <div className="text-[10px] text-amber-300 bg-amber-950/50 border border-amber-800/60 p-2 rounded-xl space-y-0.5">
            <div className="font-bold flex items-center gap-1 text-amber-400 text-[10px]">
              <span>⚠️</span> Route Advisories
            </div>
            {activeRoute.warnings.slice(0, 2).map((w: string, i: number) => (
              <div key={i} className="truncate">• {w}</div>
            ))}
          </div>
        )}
      </div>

      {/* ── BOTTOM SAFE ZONE: Link Sticker & Watermark ──────────────── */}
      <div className="flex flex-col items-center text-center space-y-1 relative z-10">
        <div className="inline-flex items-center gap-1.5 text-xs font-bold text-cyan-300 bg-cyan-950/90 border border-cyan-500/50 px-4 py-1 rounded-full shadow-lg shadow-cyan-500/20">
          <span>🔗</span> https://bahaba.nicolei.games
        </div>
        <div className="text-[9px] text-slate-500 font-mono">
          Baha Ba? • Open Flood Risk Navigation Engine
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2. Standard Feed Card Content Component (560 x 700 Canvas)
// Standard Landscape / Square Feed Card for Social Feeds & Messages
// ---------------------------------------------------------------------------
function FeedCardContent({
  timestampStr,
  isRouteActive,
  isWalking,
  origin,
  destination,
  activeRoute,
  selectedRoad,
  metrics,
  statusLabel,
  statusColorClass,
  maxDepthCm,
  passableVehicles,
  mapSnapshotUrl,
  capturingMap,
}: any) {
  return (
    <div className="w-[560px] h-[700px] max-h-[700px] bg-gradient-to-b from-slate-900 via-slate-900 to-slate-950 border-2 border-slate-700/90 rounded-2xl p-5 shadow-2xl flex flex-col justify-between text-white font-sans relative overflow-hidden select-none">
      {/* Header Bar */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-3">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center text-lg shadow-md shadow-cyan-500/30 flex-shrink-0">
            🌊
          </div>
          <div>
            <div className="text-sm font-black tracking-tight text-white flex items-center gap-2">
              Baha Ba?
              <span className="text-[9px] font-bold px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                METRO MANILA
              </span>
            </div>
            <div className="text-[10px] text-slate-400">Flood Navigation & Hydrological Telemetry</div>
          </div>
        </div>

        <div className="text-right">
          <div className="inline-flex items-center gap-1 text-[9px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            PAGASA + Panahon
          </div>
          <div className="text-[9px] text-slate-400 font-mono mt-0.5">{timestampStr}</div>
        </div>
      </div>

      {/* Segment / Route Details */}
      {isRouteActive && origin && destination && activeRoute ? (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1.5">
          <div className="flex items-center justify-between text-xs">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs">
                <span className={`w-4 h-4 rounded-full ${isWalking ? "bg-cyan-600" : "bg-blue-600"} text-white font-black text-[9px] flex items-center justify-center`}>
                  A
                </span>
                <strong className="text-slate-100 text-xs truncate max-w-[280px]">{origin.name}</strong>
              </div>
              <div className="flex items-center gap-2 text-xs">
                <span className="w-4 h-4 rounded-full bg-rose-600 text-white font-black text-[9px] flex items-center justify-center">
                  B
                </span>
                <strong className="text-slate-100 text-xs truncate max-w-[280px]">{destination.name}</strong>
              </div>
            </div>

            <div className="text-right font-mono">
              <div className="text-sm font-bold text-white">{activeRoute.durationMin} mins</div>
              <div className="text-[11px] text-slate-400">{activeRoute.distanceKm} km {isWalking ? "walk" : "drive"}</div>
            </div>
          </div>
        </div>
      ) : selectedRoad ? (
        <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-3 space-y-1">
          <div className="text-[10px] font-bold text-cyan-400 uppercase">Monitored Road Corridor</div>
          <div className="text-sm font-bold text-white truncate">{selectedRoad.roadName}</div>
          <div className="text-[10px] text-slate-400 font-mono">
            Elevation: {selectedRoad.elevationMeters.toFixed(1)}m | Station: {selectedRoad.nearestStation.stationName}
          </div>
        </div>
      ) : null}

      {/* 3-Column Status Grid */}
      <div className="grid grid-cols-3 gap-2.5 text-xs">
        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase">{isWalking ? "Walkability" : "Status"}</div>
          <div className="text-xs font-bold">
            <span className={`px-2 py-0.5 rounded-md border inline-block text-[10px] whitespace-normal break-words ${statusColorClass}`}>
              {statusLabel}
            </span>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase">{isWalking ? "Wading Depth" : "Max Depth"}</div>
          <div className="text-sm font-black font-mono text-cyan-400">
            {maxDepthCm} <span className="text-[10px] font-sans text-slate-400">cm</span>
          </div>
        </div>

        <div className="bg-slate-950/90 border border-slate-800 rounded-xl p-2.5 space-y-1">
          <div className="text-[10px] font-semibold text-slate-400 uppercase">{isWalking ? "Wading Delay" : "Traffic"}</div>
          <div className="text-xs font-mono text-emerald-400 truncate">
            {isWalking
              ? `+${activeRoute?.walkability?.wadingDelayMin ?? 0}m delay`
              : activeRoute?.traffic
                ? activeRoute.traffic.label
                : metrics ? `${metrics.peakWater.toFixed(2)}m Peak` : "Live Feed"}
          </div>
        </div>
      </div>

      {/* Map Snapshot Visual */}
      <div className="relative w-full h-[170px] rounded-xl overflow-hidden border border-slate-800 bg-slate-950 flex items-center justify-center shadow-inner">
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
        <div className="absolute bottom-2 left-2 bg-slate-950/85 backdrop-blur-md px-2 py-0.5 rounded text-[9px] font-mono text-cyan-300 border border-slate-800">
          🗺️ Map Snapshot
        </div>
      </div>

      {/* Passable Vehicles or Gear */}
      {isWalking ? (
        <div className="space-y-1">
          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Recommended Gear</div>
          <div className="flex flex-wrap gap-1.5">
            {(activeRoute?.walkability?.recommendedGear || ["Comfortable Walking Shoes", "Raincoat"]).map((g: string, i: number) => (
              <span
                key={i}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-cyan-300 border border-cyan-800 flex items-center gap-1"
              >
                <span>🥾</span> {g}
              </span>
            ))}
          </div>
        </div>
      ) : (
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
      )}

      {/* Footer Watermark */}
      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[9px] text-slate-500 font-mono">
        <span>Baha Ba? – Flood Risk Navigation Engine</span>
        <span>https://bahaba.nicolei.games</span>
      </div>
    </div>
  );
}
