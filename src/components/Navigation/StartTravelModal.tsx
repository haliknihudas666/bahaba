"use client";

// ---------------------------------------------------------------------------
// Bahaba – Navigation: Start Travel App Picker Modal
// ---------------------------------------------------------------------------

import React, { useEffect, useState } from "react";
import Image from "next/image";
import {
  NAVIGATION_APPS,
  type NavigationAppId,
  type NavigationLaunchParams,
  launchNavigation,
  getDeviceInfo,
  type DeviceInfo,
} from "@/lib/geo/navigationLauncher";

interface StartTravelModalProps {
  isOpen: boolean;
  onClose: () => void;
  params: NavigationLaunchParams;
}

export default function StartTravelModal({
  isOpen,
  onClose,
  params,
}: StartTravelModalProps) {
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    isMobile: false,
    isIOS: false,
    isAndroid: false,
    isDesktop: true,
  });

  useEffect(() => {
    if (isOpen) {
      setDeviceInfo(getDeviceInfo());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isWalking = params.mode === "walking";

  const handleSelectApp = (appId: NavigationAppId) => {
    launchNavigation(appId, params, deviceInfo);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full sm:max-w-md bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom duration-300"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-800/80 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-lg">
              🧭
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-black text-white">
                Start Travel Navigation
              </h3>
              <p className="text-[11px] text-slate-400 font-mono">
                {isWalking ? "🚶 Walking directions" : "🚗 Driving navigation"}
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white flex items-center justify-center transition-colors text-sm"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        {/* Route Details Banner */}
        <div className="px-4 py-2.5 bg-slate-950/40 border-b border-slate-800/60 flex items-center justify-between text-[11px]">
          <span className="text-slate-400 truncate max-w-[200px]">
            To: <strong className="text-slate-200">{params.destinationName || "Destination"}</strong>
          </span>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300">
            {deviceInfo.isMobile ? (deviceInfo.isIOS ? "📱 iOS Device" : "📱 Android Device") : "💻 Desktop Browser"}
          </span>
        </div>

        {/* Navigation App Options */}
        <div className="p-4 sm:p-5 space-y-2.5">
          <p className="text-[11px] text-slate-400 font-medium">
            Select navigation app to start turn-by-turn guidance:
          </p>

          <div className="space-y-2">
            {NAVIGATION_APPS.map((app) => {
              const isWazeAndWalking = isWalking && app.id === "waze";

              return (
                <button
                  key={app.id}
                  onClick={() => handleSelectApp(app.id)}
                  className={`w-full p-3 rounded-2xl border transition-all flex items-center justify-between gap-3 text-left group ${
                    app.id === "google"
                      ? "bg-slate-800/60 hover:bg-slate-800 border-slate-700/80 hover:border-cyan-500/60 hover:ring-1 hover:ring-cyan-500/30"
                      : "bg-slate-950/60 hover:bg-slate-800/60 border-slate-800/80 hover:border-slate-700"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-950/90 border border-slate-800 flex items-center justify-center p-1.5 flex-shrink-0 group-hover:scale-105 transition-transform overflow-hidden shadow-inner">
                      <Image
                        src={app.logoSrc}
                        alt={`${app.name} logo`}
                        width={28}
                        height={28}
                        className="w-7 h-7 object-contain"
                      />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs sm:text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">
                          {app.name}
                        </span>
                        {app.badge && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30">
                            {app.badge}
                          </span>
                        )}
                        {app.id === "apple" && deviceInfo.isIOS && (
                          <span className="text-[9px] font-bold px-1.5 py-0.2 rounded-full bg-slate-700 text-slate-300">
                            Native App
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 mt-0.5">
                        {isWazeAndWalking
                          ? "Note: Waze opens driving route"
                          : app.subtitle}
                      </p>
                    </div>
                  </div>

                  <div className="text-slate-500 group-hover:text-cyan-400 group-hover:translate-x-0.5 transition-all text-sm font-mono flex-shrink-0">
                    ➔
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer info */}
        <div className="p-3 sm:p-4 bg-slate-950/80 border-t border-slate-800/80 text-center">
          <p className="text-[10px] text-slate-500">
            Bahaba calculates flood hazards and elevations. Your external navigation app will provide live turn-by-turn directions.
          </p>
        </div>
      </div>
    </div>
  );
}
