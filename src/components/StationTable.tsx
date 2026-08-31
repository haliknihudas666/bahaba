"use client";

// ---------------------------------------------------------------------------
// Bahaba – Telemetry Station Table Component
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import type { LiveStation } from "@/types";

interface StationTableProps {
  stations: LiveStation[];
  selectedStationId: string | null;
  onSelectStation: (stationId: string) => void;
}

type DataTab = "waterLevel" | "rainfall";

type SortField =
  | "stationName"
  | "riskLevel"
  // Water Level fields
  | "waterLevel"
  | "waterLevelDelta1h"
  // Rainfall fields
  | "rain10m"
  | "rain1h"
  | "rain24h";

type SortOrder = "asc" | "desc";

const RISK_BADGES: Record<string, { label: string; class: string }> = {
  CRITICAL: { label: "CRITICAL", class: "bg-red-500/20 text-red-400 border-red-500/40" },
  ALARM:    { label: "ALARM",    class: "bg-orange-500/20 text-orange-400 border-orange-500/40" },
  ALERT:    { label: "ALERT",    class: "bg-yellow-500/20 text-yellow-400 border-yellow-500/40" },
  NORMAL:   { label: "NORMAL",   class: "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" },
  UNKNOWN:  { label: "UNKNOWN",  class: "bg-slate-500/20 text-slate-400 border-slate-500/40" },
};

const RISK_ORDER: Record<string, number> = {
  CRITICAL: 4,
  ALARM: 3,
  ALERT: 2,
  NORMAL: 1,
  UNKNOWN: 0,
};

export default function StationTable({
  stations,
  selectedStationId,
  onSelectStation,
}: StationTableProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [riskFilter, setRiskFilter] = useState<string>("ALL");
  const [sortField, setSortField] = useState<SortField>("riskLevel");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");
  const [activeTab, setActiveTab] = useState<DataTab>("waterLevel");

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc");
    } else {
      setSortField(field);
      setSortOrder("desc");
    }
  };

  const handleTabSwitch = (tab: DataTab) => {
    setActiveTab(tab);
    // Reset sort to a sensible default for the new tab
    if (tab === "waterLevel") {
      setSortField("riskLevel");
      setSortOrder("desc");
    } else {
      setSortField("rain24h");
      setSortOrder("desc");
    }
  };

  const sortIndicator = (field: SortField) =>
    sortField === field ? (sortOrder === "asc" ? " ▲" : " ▼") : "";

  const filteredAndSortedStations = useMemo(() => {
    return stations
      .filter((st) => {
        const matchesSearch = st.stationName.toLowerCase().includes(searchQuery.toLowerCase());
        const tabRisk = activeTab === "waterLevel" ? (st.waterRiskLevel || st.riskLevel) : (st.rainRiskLevel || st.riskLevel);
        const matchesRisk = riskFilter === "ALL" || tabRisk === riskFilter;
        return matchesSearch && matchesRisk;
      })
      .sort((a, b) => {
        let comp = 0;
        switch (sortField) {
          case "stationName":
            comp = a.stationName.localeCompare(b.stationName);
            break;
          case "waterLevel":
            comp = a.waterLevel - b.waterLevel;
            break;
          case "waterLevelDelta1h":
            comp = a.waterLevelDelta1h - b.waterLevelDelta1h;
            break;
          case "rain10m":
            comp = a.rain10m - b.rain10m;
            break;
          case "rain1h":
            comp = a.rain1h - b.rain1h;
            break;
          case "rain24h":
            comp = a.rain24h - b.rain24h;
            break;
          case "riskLevel": {
            const aRisk = activeTab === "waterLevel" ? (a.waterRiskLevel || a.riskLevel) : (a.rainRiskLevel || a.riskLevel);
            const bRisk = activeTab === "waterLevel" ? (b.waterRiskLevel || b.riskLevel) : (b.rainRiskLevel || b.riskLevel);
            comp = (RISK_ORDER[aRisk] ?? 0) - (RISK_ORDER[bRisk] ?? 0);
            break;
          }
        }
        return sortOrder === "asc" ? comp : -comp;
      });
  }, [stations, searchQuery, riskFilter, sortField, sortOrder, activeTab]);

  // Column count differs per tab (for colspan on empty state)
  const colCount = activeTab === "waterLevel" ? 6 : 7;

  return (
    <div className="flex flex-col h-full bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
      {/* Controls Bar */}
      <div className="p-3.5 sm:p-4 border-b border-slate-800 space-y-3 bg-slate-900/80 backdrop-blur">
        {/* Tab Switcher */}
        <div className="flex items-center gap-0 bg-slate-950 p-1 rounded-xl border border-slate-800 w-full sm:w-fit">
          <button
            onClick={() => handleTabSwitch("waterLevel")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "waterLevel"
                ? "bg-cyan-600 text-white shadow-md shadow-cyan-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 17h18M3 12h18M3 7h18" />
            </svg>
            Water Level
          </button>
          <button
            onClick={() => handleTabSwitch("rainfall")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-3.5 py-1.5 sm:py-2 text-xs font-bold rounded-lg transition-all ${
              activeTab === "rainfall"
                ? "bg-blue-600 text-white shadow-md shadow-blue-600/30"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v18m-4-4l4 4 4-4M7 8a5 5 0 0110 0" />
            </svg>
            Rainfall
          </button>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Search Bar */}
          <div className="relative flex-1">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <input
              type="text"
              placeholder="Filter by station name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-xs sm:text-sm bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition-colors"
            />
          </div>

          {/* Risk Level Filter Chips */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 custom-scrollbar">
            {["ALL", "CRITICAL", "ALARM", "ALERT", "NORMAL"].map((risk) => (
              <button
                key={risk}
                onClick={() => setRiskFilter(risk)}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg border transition-all whitespace-nowrap ${
                  riskFilter === risk
                    ? "bg-cyan-500/20 text-cyan-300 border-cyan-500/50 shadow-sm"
                    : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                }`}
              >
                {risk}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── MOBILE CARDS VIEW (<md screens) ────────────────────────── */}
      <div className="p-3 grid grid-cols-1 gap-2.5 md:hidden overflow-y-auto max-h-[500px] custom-scrollbar">
        {filteredAndSortedStations.length === 0 ? (
          <div className="py-8 text-center text-slate-500 text-xs">
            No telemetry stations matching search criteria.
          </div>
        ) : (
          filteredAndSortedStations.map((st) => {
            const isSelected = st.stationId === selectedStationId;
            const tabRisk = activeTab === "waterLevel" ? (st.waterRiskLevel || st.riskLevel) : (st.rainRiskLevel || st.riskLevel);
            const badge = RISK_BADGES[tabRisk] || RISK_BADGES.UNKNOWN;

            return (
              <div
                key={st.stationId}
                onClick={() => onSelectStation(st.stationId)}
                className={`p-3 rounded-xl border transition-all cursor-pointer space-y-2 ${
                  isSelected
                    ? "bg-cyan-950/40 border-cyan-500/60 ring-1 ring-cyan-500/30 shadow-md"
                    : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-bold text-xs text-white">{st.stationName}</div>
                    <div className="text-[10px] text-slate-500 font-mono">
                      {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                      {st.lastUpdated && !isNaN(st.lastUpdated.getTime()) && (
                        <span> • {st.lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                      )}
                    </div>
                  </div>
                  <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-full border flex-shrink-0 ${badge.class}`}>
                    {badge.label}
                  </span>
                </div>

                {activeTab === "waterLevel" ? (
                  <div className="flex items-center justify-between text-xs font-mono p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 block">Water Level</span>
                      <strong className="text-sm font-bold text-slate-100">
                        {st.waterLevel.toFixed(2)} <span className="text-[10px] text-slate-400 font-sans">m</span>
                      </strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">1h Delta</span>
                      <span
                        className={`text-xs font-semibold ${
                          st.waterLevelDelta1h > 0
                            ? "text-red-400"
                            : st.waterLevelDelta1h < 0
                            ? "text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        {st.waterLevelDelta1h > 0 ? "▲ +" : st.waterLevelDelta1h < 0 ? "▼ " : ""}
                        {st.waterLevelDelta1h.toFixed(2)} m
                      </span>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-1.5 text-center text-xs font-mono p-2 rounded-lg bg-slate-900/60 border border-slate-800/80">
                    <div>
                      <span className="text-[10px] text-slate-400 block">10 min</span>
                      <RainfallCell value={st.rain10m} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">1 hr</span>
                      <RainfallCell value={st.rain1h} />
                    </div>
                    <div>
                      <span className="text-[10px] text-slate-400 block">24 hr</span>
                      <RainfallCell value={st.rain24h} highlight />
                    </div>
                  </div>
                )}

                <div className="flex justify-end pt-1">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectStation(st.stationId);
                    }}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-cyan-600 text-[10px] font-bold text-cyan-300 hover:text-white border border-slate-700 transition-colors flex items-center gap-1"
                  >
                    <span>📍 Locate on Map</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── DESKTOP TABLE VIEW (md+ screens) ─────────────────────────── */}
      <div className="hidden md:block flex-1 overflow-auto max-h-[520px] scrollbar-thin scrollbar-thumb-slate-800">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-950/80 text-xs font-semibold uppercase tracking-wider text-slate-400 sticky top-0 backdrop-blur z-10 border-b border-slate-800">
            <tr>
              <th
                onClick={() => handleSort("stationName")}
                className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
              >
                Station Name{sortIndicator("stationName")}
              </th>
              <th
                onClick={() => handleSort("riskLevel")}
                className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors"
              >
                Status{sortIndicator("riskLevel")}
              </th>

              {/* ── Water Level columns ─────────────────────────────── */}
              {activeTab === "waterLevel" && (
                <>
                  <th
                    onClick={() => handleSort("waterLevel")}
                    className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors text-right"
                  >
                    Current (EL.m){sortIndicator("waterLevel")}
                  </th>
                  <th
                    onClick={() => handleSort("waterLevelDelta1h")}
                    className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors text-right hidden sm:table-cell"
                  >
                    Δ 1hr{sortIndicator("waterLevelDelta1h")}
                  </th>
                </>
              )}

              {/* ── Rainfall columns ────────────────────────────────── */}
              {activeTab === "rainfall" && (
                <>
                  <th
                    onClick={() => handleSort("rain10m")}
                    className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors text-right"
                  >
                    10 min{sortIndicator("rain10m")}
                  </th>
                  <th
                    onClick={() => handleSort("rain1h")}
                    className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors text-right hidden sm:table-cell"
                  >
                    1 hr{sortIndicator("rain1h")}
                  </th>
                  <th
                    onClick={() => handleSort("rain24h")}
                    className="py-3 px-4 cursor-pointer hover:text-cyan-400 transition-colors text-right"
                  >
                    24 hr{sortIndicator("rain24h")}
                  </th>
                </>
              )}

              <th className="py-3 px-4 text-center">Locate</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {filteredAndSortedStations.length === 0 ? (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-slate-500">
                  No telemetry stations matching search criteria.
                </td>
              </tr>
            ) : (
              filteredAndSortedStations.map((st) => {
                const isSelected = st.stationId === selectedStationId;
                const tabRisk = activeTab === "waterLevel" ? (st.waterRiskLevel || st.riskLevel) : (st.rainRiskLevel || st.riskLevel);
                const badge = RISK_BADGES[tabRisk] || RISK_BADGES.UNKNOWN;

                return (
                  <tr
                    key={st.stationId}
                    onClick={() => onSelectStation(st.stationId)}
                    className={`cursor-pointer transition-colors ${
                      isSelected
                        ? "bg-cyan-950/40 text-slate-100 font-medium"
                        : "hover:bg-slate-800/40"
                    }`}
                  >
                    {/* Station Name */}
                    <td className="py-3 px-4">
                       <div className="font-semibold text-slate-100">{st.stationName}</div>
                       <div className="text-[11px] text-slate-500 font-mono">
                         {st.latitude.toFixed(4)}, {st.longitude.toFixed(4)}
                         {st.lastUpdated && !isNaN(st.lastUpdated.getTime()) && (
                           <span> • {st.lastUpdated.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit", hour12: true })}</span>
                         )}
                       </div>
                    </td>

                    {/* Status Badge */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-block px-2.5 py-0.5 text-[11px] font-bold rounded-full border ${badge.class}`}
                      >
                        {badge.label}
                      </span>
                    </td>

                    {/* ── Water Level data cells ───────────────────── */}
                    {activeTab === "waterLevel" && (
                      <>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-100">
                            {st.waterLevel.toFixed(2)}{" "}
                            <span className="text-slate-500 text-xs font-sans">m</span>
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap hidden sm:table-cell">
                          <span
                            className={`font-mono text-xs ${
                              st.waterLevelDelta1h > 0
                                ? "text-red-400 font-semibold"
                                : st.waterLevelDelta1h < 0
                                ? "text-emerald-400"
                                : "text-slate-400"
                            }`}
                          >
                            {st.waterLevelDelta1h > 0 ? "▲ +" : st.waterLevelDelta1h < 0 ? "▼ " : ""}
                            {st.waterLevelDelta1h.toFixed(2)} m
                          </span>
                        </td>
                      </>
                    )}

                    {/* ── Rainfall data cells ──────────────────────── */}
                    {activeTab === "rainfall" && (
                      <>
                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <RainfallCell value={st.rain10m} />
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap hidden sm:table-cell">
                          <RainfallCell value={st.rain1h} />
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <RainfallCell value={st.rain24h} highlight />
                        </td>
                      </>
                    )}

                    {/* Locate Button */}
                    <td className="py-3 px-4 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectStation(st.stationId);
                        }}
                        className="p-1.5 rounded-lg bg-slate-800 hover:bg-cyan-600 text-slate-300 hover:text-white transition-colors"
                        title="Focus on map"
                      >
                        📍
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rainfall intensity cell with color-coded thresholds
// ---------------------------------------------------------------------------

function RainfallCell({ value, highlight }: { value: number; highlight?: boolean }) {
  // PAGASA rainfall intensity colour thresholds (mm)
  let colorClass = "text-slate-400";
  if (value >= 30) colorClass = "text-red-400 font-semibold";
  else if (value >= 15) colorClass = "text-orange-400 font-semibold";
  else if (value >= 7.5) colorClass = "text-yellow-400";
  else if (value > 0) colorClass = "text-blue-400";

  return (
    <span className={`font-mono text-xs ${colorClass} ${highlight ? "font-bold text-sm" : ""}`}>
      {value.toFixed(1)}{" "}
      <span className="text-slate-500 font-sans">mm</span>
    </span>
  );
}
