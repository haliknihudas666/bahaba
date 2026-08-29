"use client";

// ---------------------------------------------------------------------------
// Bahaba – Navigation: Route Option Summary Card
// ---------------------------------------------------------------------------

import type { RouteOption, TravelMode } from "@/lib/engine/routeSolver";

interface RouteOptionCardProps {
  option: RouteOption;
  index: number;
  isSelected: boolean;
  travelMode: TravelMode;
  onSelect: (index: number) => void;
}

export default function RouteOptionCard({
  option,
  index,
  isSelected,
  travelMode,
  onSelect,
}: RouteOptionCardProps) {
  const isWalking = travelMode === "walking";

  return (
    <div
      onClick={() => onSelect(index)}
      className={`p-3 rounded-2xl border transition-all cursor-pointer ${
        isSelected
          ? isWalking
            ? "bg-slate-800/90 border-cyan-500 ring-2 ring-cyan-500/40 shadow-lg"
            : "bg-slate-800/90 border-blue-500 ring-2 ring-blue-500/40 shadow-lg"
          : "bg-slate-950/60 border-slate-800/90 hover:border-slate-700"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-xs sm:text-sm font-extrabold text-white flex items-center gap-1.5 flex-wrap">
            <span>{option.summary}</span>
            {index === 0 && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                {isWalking ? "Shortest Walk" : "Fastest"}
              </span>
            )}
          </h4>
          <p className="text-[10px] text-slate-400 mt-0.5 font-mono">
            {option.distanceKm} km • {option.durationMin} mins {isWalking ? "walk" : "drive"}
          </p>
        </div>

        <div className="text-right flex-shrink-0">
          <span
            className={`text-base font-black font-mono ${
              isWalking ? "text-cyan-400" : "text-blue-400"
            }`}
          >
            {option.durationMin} <span className="text-[9px] font-sans text-slate-400">min</span>
          </span>
        </div>
      </div>

      {/* Flood Hazard & Mode Telemetry Alert Badges */}
      <div className="mt-2 pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-mono gap-1.5 flex-wrap">
        <div className="flex items-center gap-1">
          <span className="text-slate-400 text-[10px]">Max Flood:</span>
          <span
            className={`font-extrabold px-1.5 py-0.5 rounded-full text-[9px] ${
              option.maxFloodDepthCm > 28
                ? "bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse"
                : option.maxFloodDepthCm >= 15
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : option.maxFloodDepthCm >= 5
                    ? "bg-amber-500/20 text-amber-400 border border-amber-500/40"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
            }`}
          >
            {option.maxFloodDepthCm} cm ({option.overallStatus})
          </span>
        </div>

        {!isWalking && option.traffic && (
          <div className="flex items-center gap-1">
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${option.traffic.color}15`,
                color: option.traffic.color,
                border: `1px solid ${option.traffic.color}40`,
              }}
            >
              🚦 {option.traffic.label}
            </span>
            {option.traffic.delayMin > 0 && (
              <span className="text-[9px] font-semibold text-amber-400">
                (+{option.traffic.delayMin}m delay)
              </span>
            )}
          </div>
        )}

        {isWalking && option.walkability && (
          <div className="flex items-center gap-1">
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full"
              style={{
                backgroundColor: `${option.walkability.color}15`,
                color: option.walkability.color,
                border: `1px solid ${option.walkability.color}40`,
              }}
            >
              🥾 {option.walkability.score}/100
            </span>
            {option.walkability.wadingDelayMin > 0 && (
              <span className="text-[9px] font-semibold text-amber-400">
                (+{option.walkability.wadingDelayMin}m wade)
              </span>
            )}
          </div>
        )}

        {/* 3-Hour Rainfall Forecast Outlook Badge */}
        {option.weatherForecast && (
          <div className="flex items-center gap-1">
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                option.weatherForecast.trend === "WORSENING" && option.weatherForecast.forecast3hTotalMm >= 15
                  ? "bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse"
                  : option.weatherForecast.trend === "WORSENING"
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : option.weatherForecast.trend === "IMPROVING"
                  ? "bg-teal-500/20 text-teal-300 border border-teal-500/40"
                  : option.weatherForecast.currentRainMmHr > 0 || option.weatherForecast.forecast3hTotalMm > 0
                  ? "bg-sky-500/20 text-sky-300 border border-sky-500/40"
                  : "bg-slate-800 text-slate-400 border border-slate-700"
              }`}
            >
              {option.weatherForecast.forecast3hTotalMm >= 15
                ? `⛈️ 3h: +${option.weatherForecast.forecast3hTotalMm}mm`
                : option.weatherForecast.forecast3hTotalMm > 0
                ? `🌦️ 3h: +${option.weatherForecast.forecast3hTotalMm}mm`
                : `☀️ Dry 3h`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
