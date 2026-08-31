"use client";

// ---------------------------------------------------------------------------
// Bahaba – Drawer: Monitored Roads Table & Philippine Highway Class Filter
// ---------------------------------------------------------------------------

import { useState, useMemo } from "react";
import type { RoadRiskResult } from "@/lib/engine/roadRisk";

interface MonitoredRoadsTableProps {
  roadEvaluations: RoadRiskResult[];
  selectedRoad: RoadRiskResult | null;
  onSelectRoad: (road: RoadRiskResult) => void;
  onShareRoad: (road: RoadRiskResult) => void;
}

export default function MonitoredRoadsTable({
  roadEvaluations,
  selectedRoad,
  onSelectRoad,
  onShareRoad,
}: MonitoredRoadsTableProps) {
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [highwayClassFilter, setHighwayClassFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState<string>("");

  const filteredRoads = useMemo(() => {
    return roadEvaluations.filter((road) => {
      const matchesSeverity =
        severityFilter === "ALL" || road.severity === severityFilter;

      let matchesHighwayClass = true;
      if (highwayClassFilter === "PRIMARY") {
        matchesHighwayClass = road.roadClassification === "Primary National";
      } else if (highwayClassFilter === "SECONDARY") {
        matchesHighwayClass = road.roadClassification === "Secondary National";
      } else if (highwayClassFilter === "NCR") {
        matchesHighwayClass = Boolean(road.region && road.region.includes("NCR"));
      } else if (highwayClassFilter === "PROVINCIAL") {
        matchesHighwayClass = Boolean(road.region && !road.region.includes("NCR"));
      }

      const query = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !query ||
        road.roadName.toLowerCase().includes(query) ||
        Boolean(road.nationalRoute && road.nationalRoute.toLowerCase().includes(query)) ||
        Boolean(road.roadClassification && road.roadClassification.toLowerCase().includes(query)) ||
        Boolean(road.region && road.region.toLowerCase().includes(query)) ||
        Boolean(road.description && road.description.toLowerCase().includes(query)) ||
        road.nearestStation.stationName.toLowerCase().includes(query) ||
        road.depthCategory.toLowerCase().includes(query);

      return matchesSeverity && matchesHighwayClass && matchesQuery;
    });
  }, [roadEvaluations, severityFilter, highwayClassFilter, searchQuery]);

  return (
    <div className="space-y-4">
      {/* Filter Bars */}
      <div className="space-y-2.5">
        {/* Top Row: Severity Filters & Search */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          {/* Severity Filters */}
          <div className="flex items-center p-1 bg-slate-950 border border-slate-800 rounded-xl text-xs overflow-x-auto custom-scrollbar">
            <button
              onClick={() => setSeverityFilter("ALL")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                severityFilter === "ALL"
                  ? "bg-cyan-600 text-white shadow-md"
                  : "text-slate-400 hover:text-slate-200"
              }`}
            >
              All Severity ({roadEvaluations.length})
            </button>
            <button
              onClick={() => setSeverityFilter("CRITICAL")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                severityFilter === "CRITICAL"
                  ? "bg-rose-600 text-white shadow-md"
                  : "text-slate-400 hover:text-rose-400"
              }`}
            >
              Critical
            </button>
            <button
              onClick={() => setSeverityFilter("ALARM")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                severityFilter === "ALARM"
                  ? "bg-orange-600 text-white shadow-md"
                  : "text-slate-400 hover:text-orange-400"
              }`}
            >
              Alarm
            </button>
            <button
              onClick={() => setSeverityFilter("ALERT")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                severityFilter === "ALERT"
                  ? "bg-amber-600 text-white shadow-md"
                  : "text-slate-400 hover:text-amber-400"
              }`}
            >
              Alert
            </button>
            <button
              onClick={() => setSeverityFilter("NORMAL")}
              className={`px-2.5 py-1 rounded-lg font-semibold transition-all whitespace-nowrap ${
                severityFilter === "NORMAL"
                  ? "bg-emerald-600 text-white shadow-md"
                  : "text-slate-400 hover:text-emerald-400"
              }`}
            >
              Normal
            </button>
          </div>

          {/* Search Input */}
          <div className="relative w-full sm:w-72">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter route (e.g. N1, N170, MacArthur)..."
              className="w-full bg-slate-950 border border-slate-800 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-1.5 focus:outline-none focus:border-cyan-500 font-medium"
            />
            <span className="absolute left-2.5 top-2 text-slate-500 text-xs">🔍</span>
          </div>
        </div>

        {/* Bottom Row: Philippine Highway Network Classification Filters */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950/70 border border-slate-800/80 rounded-xl text-xs overflow-x-auto custom-scrollbar">
          <span className="text-[10px] font-bold text-cyan-400 px-2 py-0.5 whitespace-nowrap flex items-center gap-1">
            <span>🇵🇭</span> DPWH Routes:
          </span>
          <button
            onClick={() => setHighwayClassFilter("ALL")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap ${
              highwayClassFilter === "ALL"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            All Corridors ({roadEvaluations.length})
          </button>
          <button
            onClick={() => setHighwayClassFilter("PRIMARY")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
              highwayClassFilter === "PRIMARY"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-400 hover:text-blue-300"
            }`}
          >
            <span>🛡️</span> Primary National (N1–N11)
          </button>
          <button
            onClick={() => setHighwayClassFilter("SECONDARY")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
              highwayClassFilter === "SECONDARY"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-400 hover:text-blue-300"
            }`}
          >
            <span>🛣️</span> Secondary National (N120–N401)
          </button>
          <button
            onClick={() => setHighwayClassFilter("NCR")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
              highwayClassFilter === "NCR"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-400 hover:text-blue-300"
            }`}
          >
            <span>🏙️</span> Metro Manila (NCR)
          </button>
          <button
            onClick={() => setHighwayClassFilter("PROVINCIAL")}
            className={`px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all whitespace-nowrap flex items-center gap-1 ${
              highwayClassFilter === "PROVINCIAL"
                ? "bg-blue-600 text-white shadow-md font-bold"
                : "text-slate-400 hover:text-blue-300"
            }`}
          >
            <span>📍</span> Provincial Arterials
          </button>
        </div>
      </div>

      {/* Mobile Cards View (<md) */}
      <div className="grid grid-cols-1 gap-3 md:hidden">
        {filteredRoads.length > 0 ? (
          filteredRoads.map((road, idx) => (
            <div
              key={idx}
              onClick={() => onSelectRoad(road)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer space-y-2.5 ${
                selectedRoad?.roadName === road.roadName
                  ? "bg-slate-800/90 border-cyan-500/80 ring-1 ring-cyan-500/40 shadow-lg"
                  : "bg-slate-950/70 border-slate-800 hover:border-slate-700"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-1">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {road.nationalRoute && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/90 border border-blue-400/40 text-[10px] font-extrabold text-blue-300 tracking-wider shadow-sm font-mono">
                        <span>🛣️</span> {road.nationalRoute}
                      </span>
                    )}
                    {road.region && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        • {road.region}
                      </span>
                    )}
                  </div>
                  <strong className="text-white text-xs block font-bold">{road.roadName}</strong>
                  <span className="text-[10px] text-slate-500 font-mono">
                    Elev: {road.elevationMeters.toFixed(1)}m EL.m
                  </span>
                </div>
                <span
                  style={{ backgroundColor: road.color }}
                  className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full text-white tracking-wider shadow-sm flex-shrink-0"
                >
                  {road.severity}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 p-2 rounded-xl bg-slate-900/60 border border-slate-800/80 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-slate-400 block">Est. Depth</span>
                  <strong style={{ color: road.color }} className="text-sm font-bold">
                    {road.estimatedDepthCm} cm
                  </strong>
                  <span className="text-[10px] text-slate-500 block">({road.depthCategory})</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 block">Hazard Score</span>
                  <strong className="text-sm font-bold text-cyan-400">
                    {road.hazardScore}
                  </strong>
                  <span className="text-[10px] text-slate-500"> / 100</span>
                </div>
              </div>

              <div className="text-[11px] text-slate-300 flex items-center justify-between border-t border-slate-800/60 pt-2 font-mono">
                <span className="truncate max-w-[150px] text-slate-400">
                  📍 {road.nearestStation.stationName}
                </span>
                <div className="flex items-center gap-2 text-right text-[10px]">
                  <span>💧 {road.nearestStation.waterLevel.toFixed(2)}m</span>
                  <span>🌧️ {road.nearestStation.rain1h}mm</span>
                </div>
              </div>

              <div className="flex items-center justify-between gap-2 pt-1">
                <div className="flex flex-wrap gap-1 flex-1">
                  {road.drivableVehicles.slice(0, 2).map((v, i) => (
                    <span
                      key={i}
                      className="text-[9px] font-medium px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                    >
                      🚗 {v}
                    </span>
                  ))}
                </div>

                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onShareRoad(road);
                  }}
                  className="px-2.5 py-1 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-cyan-500/30 text-[10px] font-bold flex items-center gap-1 shadow-sm transition-all active:scale-95 flex-shrink-0"
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                    />
                  </svg>
                  <span>Share</span>
                </button>
              </div>
            </div>
          ))
        ) : (
          <div className="p-6 text-center text-slate-500 italic text-xs bg-slate-950/60 rounded-2xl border border-slate-800">
            No road segments match the selected filters.
          </div>
        )}
      </div>

      {/* Desktop Data Table (md+) */}
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-800">
        <table className="w-full text-left text-xs text-slate-300">
          <thead className="bg-slate-950 text-slate-400 uppercase tracking-wider font-mono text-[10px] border-b border-slate-800">
            <tr>
              <th className="px-4 py-3 font-semibold">Highway Corridor / Route</th>
              <th className="px-4 py-3 font-semibold">Severity Status</th>
              <th className="px-4 py-3 font-semibold">Predicted Depth</th>
              <th className="px-4 py-3 font-semibold">Hazard Score</th>
              <th className="px-4 py-3 font-semibold">Nearest Station</th>
              <th className="px-4 py-3 font-semibold">Station Signal</th>
              <th className="px-4 py-3 font-semibold">Passable Vehicles</th>
              <th className="px-4 py-3 font-semibold text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 bg-slate-900/40">
            {filteredRoads.length > 0 ? (
              filteredRoads.map((road, idx) => (
                <tr
                  key={idx}
                  onClick={() => onSelectRoad(road)}
                  className={`hover:bg-slate-800/70 transition-colors cursor-pointer ${
                    selectedRoad?.roadName === road.roadName ? "bg-slate-800/90" : ""
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                      {road.nationalRoute && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-950/90 border border-blue-400/40 text-[10px] font-extrabold text-blue-300 tracking-wider shadow-sm font-mono">
                          <span>🛣️</span> {road.nationalRoute}
                        </span>
                      )}
                      {road.roadClassification && (
                        <span className="text-[9.5px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                          {road.roadClassification}
                        </span>
                      )}
                    </div>
                    <strong className="text-slate-100 block font-bold text-xs">{road.roadName}</strong>
                    <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                      <span>Elev: {road.elevationMeters.toFixed(1)}m EL.m</span>
                      {road.region && <span>• {road.region}</span>}
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      style={{ backgroundColor: road.color }}
                      className="text-[10px] font-extrabold px-2.5 py-1 rounded-full text-white tracking-wider shadow-sm inline-block"
                    >
                      {road.severity}
                    </span>
                  </td>

                  <td className="px-4 py-3 font-mono">
                    <strong style={{ color: road.color }} className="text-sm">
                      {road.estimatedDepthCm} cm
                    </strong>
                    <span className="block text-[10px] text-slate-400">({road.depthCategory})</span>
                  </td>

                  <td className="px-4 py-3 font-mono">
                    <span className="text-cyan-400 font-extrabold text-sm">{road.hazardScore}</span>
                    <span className="text-slate-500 text-[10px]"> / 100</span>
                  </td>

                  <td className="px-4 py-3">
                    <strong className="text-slate-200 block">{road.nearestStation.stationName}</strong>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {road.nearestStation.distanceKm} km away
                    </span>
                  </td>

                  <td className="px-4 py-3 font-mono text-[11px]">
                    <div>💧 Level: <strong>{road.nearestStation.waterLevel.toFixed(2)} m</strong></div>
                    <div className="text-slate-400">
                      🌧️ 1h Rain: <strong>{road.nearestStation.rain1h} mm</strong>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {road.drivableVehicles.map((v, i) => (
                        <span
                          key={i}
                          className="text-[10px] font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700"
                        >
                          🚗 {v}
                        </span>
                      ))}
                    </div>
                  </td>

                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onShareRoad(road);
                      }}
                      className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 hover:border-cyan-500/50 shadow-sm transition-all"
                      title="Focus map on this corridor & share report"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
                        />
                      </svg>
                    </button>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} className="px-4 py-6 text-center text-slate-500 italic text-xs">
                  No road segments match the selected filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
