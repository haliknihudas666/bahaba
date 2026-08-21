"use client";

// ---------------------------------------------------------------------------
// Bahaba – Layout: Right Side Telemetry & Live Weather Panel
// Displays full unabbreviated hydrology telemetry metrics, stations, and rain
// ---------------------------------------------------------------------------

import type { TelemetryMetrics } from "./MapHeaderControls";

interface TelemetrySidePanelProps {
  isOpen: boolean;
  onClose: () => void;
  metrics: TelemetryMetrics;
  lastUpdatedFormatted: string | null;
  syncing: boolean;
  onSync: () => void;
  onOpenStationsTable: () => void;
  onOpenRoadsTable: () => void;
  onSelectStation?: (stationId: string) => void;
}

export default function TelemetrySidePanel({
  isOpen,
  onClose,
  metrics,
  lastUpdatedFormatted,
  syncing,
  onSync,
  onOpenStationsTable,
  onOpenRoadsTable,
  onSelectStation,
}: TelemetrySidePanelProps) {
  // Determine rainfall severity level
  const getRain1hLabel = (val: number) => {
    if (val >= 30) return { label: "Torrential Rain", color: "text-rose-400 bg-rose-950/60 border-rose-800" };
    if (val >= 15) return { label: "Heavy Rain", color: "text-amber-400 bg-amber-950/60 border-amber-800" };
    if (val >= 7.5) return { label: "Moderate Rain", color: "text-sky-400 bg-sky-950/60 border-sky-800" };
    if (val > 0) return { label: "Light Rain", color: "text-cyan-400 bg-cyan-950/60 border-cyan-800" };
    return { label: "No Rain", color: "text-slate-400 bg-slate-900 border-slate-800" };
  };

  const rain1hInfo = getRain1hLabel(metrics.maxRain1h);

  // Handle focusing station on map
  const handleFocusStation = (stationId?: string | null) => {
    if (!stationId || !onSelectStation) return;
    onSelectStation(stationId);
    if (typeof window !== "undefined" && window.innerWidth < 768) {
      onClose();
    }
  };

  return (
    <div
      className={`fixed inset-0 sm:inset-auto sm:top-20 sm:right-4 sm:bottom-6 z-[550] w-full sm:w-[380px] md:w-[410px] max-w-full sm:max-w-[calc(100vw-32px)] flex flex-col pointer-events-auto transition-all duration-300 ease-in-out ${
        isOpen
          ? "translate-x-0 opacity-100"
          : "translate-x-full sm:translate-x-[calc(100%+32px)] pointer-events-none opacity-0"
      }`}
    >
      <div className="bg-slate-950 sm:bg-slate-900/95 sm:backdrop-blur-2xl border-0 sm:border border-slate-800/90 rounded-none sm:rounded-3xl shadow-2xl flex flex-col h-full max-h-full overflow-hidden">
        {/* ── 1. SIDEBAR HEADER ────────────────────────────────────────── */}
        <div className="p-3.5 sm:p-4 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-shrink-0 bg-slate-950/40">
          <div className="flex items-center gap-2">
            <span className="text-lg">📊</span>
            <div>
              <div className="flex items-center gap-1.5">
                <h2 className="text-xs sm:text-sm font-black tracking-wider text-white uppercase">
                  Live Telemetry &amp; Weather
                </h2>
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              </div>
              <div className="text-[10px] text-slate-400">
                PAGASA &amp; Panahon Sensor Network
              </div>
            </div>
          </div>

          <button
            onClick={onClose}
            className="flex items-center gap-1 px-2.5 py-1 sm:p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all active:scale-95 text-xs font-semibold"
            title="Minimize telemetry panel"
          >
            <span className="sm:hidden">Close</span>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* ── 2. LIVE SYNC & OBSERVATION STATUS BAR ─────────────────────── */}
        <div className="px-3.5 py-2.5 bg-slate-950/80 border-b border-slate-800/80 flex items-center justify-between gap-2 flex-shrink-0">
          <div className="flex items-center gap-2 text-xs">
            <span className="text-xs">🕒</span>
            <div className="flex flex-col">
              <span className="text-[10px] text-slate-400 font-medium">Last Live Sync</span>
              <strong className="text-slate-200 font-mono text-[11px]">
                {lastUpdatedFormatted || "Connecting..."}
              </strong>
            </div>
          </div>

          <button
            onClick={onSync}
            disabled={syncing}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 hover:border-cyan-500/70 transition-all text-xs font-bold active:scale-95 disabled:opacity-50"
            title="Refresh hydrological telemetry"
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
            <span>{syncing ? "Syncing..." : "Sync Now"}</span>
          </button>
        </div>

        {/* ── 3. SCROLLABLE TELEMETRY METRIC CARDS ─────────────────────── */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 custom-scrollbar">
          {/* Card 1: Monitored Hydrological Stations */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/90 transition-all shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-base">
                  💧
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Monitored Stations
                  </div>
                  <div className="text-lg sm:text-xl font-black text-white font-mono leading-none mt-0.5">
                    {metrics.total > 0 ? metrics.total.toLocaleString() : "--"} Active
                  </div>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[10px] font-bold">
                ● Live
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Real-time water level and rainfall telemetry streaming from PAGASA &amp; Panahon IoT hydrological monitoring networks.
            </p>
          </div>

          {/* Card 2: Active Flood Warnings & Elevated Gauges */}
          <div
            className={`p-3.5 rounded-2xl border transition-all shadow-md ${
              metrics.highRisk > 0
                ? "bg-amber-950/30 border-amber-800/70 shadow-amber-950/20"
                : "bg-emerald-950/30 border-emerald-800/70"
            }`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center text-base border ${
                    metrics.highRisk > 0
                      ? "bg-amber-500/20 border-amber-500/40 text-amber-300"
                      : "bg-emerald-500/20 border-emerald-500/40 text-emerald-300"
                  }`}
                >
                  {metrics.highRisk > 0 ? "⚠️" : "✅"}
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Active Flood Alerts
                  </div>
                  <div
                    className={`text-lg sm:text-xl font-black font-mono leading-none mt-0.5 ${
                      metrics.highRisk > 0 ? "text-amber-300" : "text-emerald-300"
                    }`}
                  >
                    {metrics.highRisk} Stations Elevated
                  </div>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${
                  metrics.highRisk > 0
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-300 animate-pulse"
                    : "bg-emerald-500/20 border-emerald-500/50 text-emerald-300"
                }`}
              >
                {metrics.highRisk > 0 ? "Warning Active" : "All Normal"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              {metrics.highRisk > 0
                ? `${metrics.highRisk} telemetry sensor(s) have breached Critical, Alarm, or Alert river elevation levels.`
                : "All monitored hydrological sensors are currently within normal baseline river water levels."}
            </p>

            {/* List of Elevated Stations */}
            {metrics.highRiskStations && metrics.highRiskStations.length > 0 && (
              <div className="mt-3 pt-3 border-t border-amber-800/40 space-y-1.5">
                <div className="text-[10px] font-bold uppercase tracking-wider text-amber-400/90 flex items-center justify-between">
                  <span>Elevated River Sensors</span>
                  <span className="text-slate-400 text-[9px] font-normal">Click sensor to locate</span>
                </div>
                <div className="max-h-48 overflow-y-auto custom-scrollbar space-y-1.5 pr-0.5">
                  {metrics.highRiskStations.map((st) => (
                    <button
                      key={st.stationId}
                      onClick={() => handleFocusStation(st.stationId)}
                      className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-amber-500/60 transition-all text-left group shadow-sm active:scale-[0.99]"
                      title={`Locate ${st.stationName} on map`}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs flex-shrink-0">⚠️</span>
                        <div className="truncate min-w-0">
                          <div className="text-xs font-bold text-white group-hover:text-amber-300 transition-colors truncate">
                            {st.stationName}
                          </div>
                          <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                            <span>Water:</span>
                            <span className="font-mono text-amber-300 font-bold">
                              {st.waterLevel.toFixed(2)}m
                            </span>
                            {st.rain1h > 0 && (
                              <>
                                <span>•</span>
                                <span>Rain:</span>
                                <span className="font-mono text-cyan-300">
                                  {st.rain1h.toFixed(1)}mm/h
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/70 px-2 py-1 rounded-lg flex-shrink-0 group-hover:bg-cyan-600 group-hover:text-white transition-all ml-2">
                        <span>📍</span>
                        <span>Locate</span>
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Card 3: Peak River Water Level */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/90 transition-all shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-base">
                  🌊
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Peak River Level
                  </div>
                  <div className="text-lg sm:text-xl font-black text-cyan-400 font-mono leading-none mt-0.5">
                    {metrics.peakWater > 0 ? `${metrics.peakWater.toFixed(2)} meters` : "--"}
                  </div>
                </div>
              </div>
            </div>

            {/* Clickable Peak Water Level Sensor Badge */}
            {metrics.peakWaterStation !== "N/A" && (
              <button
                onClick={() => handleFocusStation(metrics.peakWaterStationId)}
                disabled={!metrics.peakWaterStationId}
                className="w-full mt-2.5 p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-cyan-500/60 flex items-center justify-between gap-2 transition-all text-left group shadow-sm active:scale-[0.99] disabled:opacity-60"
                title={`Locate ${metrics.peakWaterStation} on map`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">📍</span>
                  <div className="truncate min-w-0">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Gauge Sensor
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-cyan-300 transition-colors truncate">
                      {metrics.peakWaterStation}
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold text-cyan-400 bg-cyan-950/60 border border-cyan-800/70 px-2 py-1 rounded-lg flex-shrink-0 group-hover:bg-cyan-600 group-hover:text-white transition-all">
                  <span>Locate</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            )}

            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Highest recorded river water level measured relative to local gauge datum.
            </p>
          </div>

          {/* Card 4: Maximum 1-Hour Rainfall Intensity */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/90 transition-all shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-base">
                  🌧️
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Max 1-Hour Rain
                  </div>
                  <div className="text-lg sm:text-xl font-black text-sky-400 font-mono leading-none mt-0.5">
                    {metrics.maxRain1h.toFixed(1)} mm/hr
                  </div>
                </div>
              </div>
              <span className={`px-2 py-0.5 rounded-full border text-[10px] font-bold ${rain1hInfo.color}`}>
                {rain1hInfo.label}
              </span>
            </div>

            {/* Clickable Max 1h Rain Sensor Badge */}
            {metrics.maxRain1hStation && metrics.maxRain1hStation !== "N/A" && (
              <button
                onClick={() => handleFocusStation(metrics.maxRain1hStationId)}
                disabled={!metrics.maxRain1hStationId}
                className="w-full mt-2.5 p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-sky-500/60 flex items-center justify-between gap-2 transition-all text-left group shadow-sm active:scale-[0.99] disabled:opacity-60"
                title={`Locate ${metrics.maxRain1hStation} on map`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">🌧️</span>
                  <div className="truncate min-w-0">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Rain Gauge Sensor
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-sky-300 transition-colors truncate">
                      {metrics.maxRain1hStation}
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold text-sky-400 bg-sky-950/60 border border-sky-800/70 px-2 py-1 rounded-lg flex-shrink-0 group-hover:bg-sky-600 group-hover:text-white transition-all">
                  <span>Locate</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            )}

            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Peak 60-minute rainfall intensity recorded across all active rain gauge sensors.
            </p>
          </div>

          {/* Card 5: Maximum 24-Hour Accumulated Rainfall */}
          <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800/90 hover:border-slate-700/90 transition-all shadow-md">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-base">
                  ☔
                </div>
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                    Max 24-Hour Rain
                  </div>
                  <div className="text-lg sm:text-xl font-black text-indigo-300 font-mono leading-none mt-0.5">
                    {metrics.maxRain.toFixed(1)} mm
                  </div>
                </div>
              </div>
            </div>

            {/* Clickable Max 24h Rain Sensor Badge */}
            {metrics.maxRainStation && metrics.maxRainStation !== "N/A" && (
              <button
                onClick={() => handleFocusStation(metrics.maxRainStationId)}
                disabled={!metrics.maxRainStationId}
                className="w-full mt-2.5 p-2 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-800 hover:border-indigo-500/60 flex items-center justify-between gap-2 transition-all text-left group shadow-sm active:scale-[0.99] disabled:opacity-60"
                title={`Locate ${metrics.maxRainStation} on map`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm flex-shrink-0">☔</span>
                  <div className="truncate min-w-0">
                    <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">
                      Basin Rain Sensor
                    </div>
                    <div className="text-xs font-bold text-white group-hover:text-indigo-300 transition-colors truncate">
                      {metrics.maxRainStation}
                    </div>
                  </div>
                </div>
                <span className="flex items-center gap-1 text-[10px] font-bold text-indigo-300 bg-indigo-950/60 border border-indigo-800/70 px-2 py-1 rounded-lg flex-shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all">
                  <span>Locate</span>
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </span>
              </button>
            )}

            <p className="text-xs text-slate-400 mt-2 leading-relaxed">
              Highest accumulated 24-hour precipitation volume for catchment basin flood forecasting.
            </p>
          </div>
        </div>

        {/* ── 4. QUICK EXPLORATION ACTIONS FOOTER ───────────────────────── */}
        <div className="p-3 sm:p-3.5 border-t border-slate-800/80 bg-slate-950/80 space-y-2 flex-shrink-0">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={onOpenStationsTable}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-cyan-500/50 transition-all text-xs font-bold active:scale-95 shadow-md"
            >
              <span>💧</span>
              <span>Stations Table</span>
            </button>

            <button
              onClick={onOpenRoadsTable}
              className="flex items-center justify-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800/90 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 hover:border-cyan-500/50 transition-all text-xs font-bold active:scale-95 shadow-md"
            >
              <span>🚗</span>
              <span>Road Risk Table</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
