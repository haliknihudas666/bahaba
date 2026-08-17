"use client";

// ---------------------------------------------------------------------------
// Bahaba – Nearest Station Geo-Search Widget with Autocomplete
// ---------------------------------------------------------------------------

import { useState } from "react";
import { calculateHaversineDistance } from "@/lib/firebase/geo-utils";
import { trackNearestStationSearch } from "@/lib/firebase/analytics";
import type { LiveStation, NearestStationResult } from "@/types";
import LocationAutocomplete from "./LocationAutocomplete";

interface NearestStationFinderProps {
  stations: LiveStation[];
  onSelectStation: (stationId: string) => void;
  onSetUserLocation: (location: { lat: number; lng: number }) => void;
}

export default function NearestStationFinder({
  stations,
  onSelectStation,
  onSetUserLocation,
}: NearestStationFinderProps) {
  const [selectedLocationName, setSelectedLocationName] = useState("Marikina City Hall");
  const [latInput, setLatInput] = useState("14.6334");
  const [lngInput, setLngInput] = useState("121.0945");
  const [result, setResult] = useState<NearestStationResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const handleSearch = (latNum: number, lngNum: number) => {
    setLoading(true);
    setErrorMsg("");

    if (isNaN(latNum) || isNaN(lngNum)) {
      setErrorMsg("Please enter valid decimal coordinates.");
      setLoading(false);
      return;
    }

    onSetUserLocation({ lat: latNum, lng: lngNum });

    if (!stations || stations.length === 0) {
      setErrorMsg("No active telemetry stations available.");
      setLoading(false);
      return;
    }

    let minDistanceKm = Infinity;
    let closestStation: LiveStation | null = null;

    for (const st of stations) {
      if (!st.latitude || !st.longitude) continue;
      const dist = calculateHaversineDistance(latNum, lngNum, st.latitude, st.longitude);
      if (dist < minDistanceKm) {
        minDistanceKm = dist;
        closestStation = st;
      }
    }

    if (closestStation) {
      const dist = Math.round(minDistanceKm * 100) / 100;
      setResult({
        station: closestStation,
        distanceKm: dist,
      });
      onSelectStation(closestStation.stationId);
      trackNearestStationSearch({
        locationName: selectedLocationName,
        latitude: latNum,
        longitude: lngNum,
        nearestStationName: closestStation.stationName,
        distanceKm: dist,
        riskLevel: closestStation.riskLevel,
      });
    } else {
      setErrorMsg("No station found in proximity.");
      trackNearestStationSearch({
        locationName: selectedLocationName,
        latitude: latNum,
        longitude: lngNum,
      });
    }

    setLoading(false);
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
            <span>📍 Location Search</span>
          </h3>
          <p className="text-[11px] sm:text-xs text-slate-400">
            Type any place or landmark in Metro Manila to identify the nearest PAGASA telemetry station
          </p>
        </div>
      </div>

      {/* Location Autocomplete Input */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
        <div className="md:col-span-8">
          <LocationAutocomplete
            label="Search Target Location"
            pointType="origin"
            value={selectedLocationName}
            placeholder="Type place, e.g. UST Manila, SM Marikina, Ortigas, Fairview..."
            onSelectLocation={(item) => {
              setSelectedLocationName(item.name);
              if (item.coords) {
                setLatInput(item.coords[0].toFixed(4));
                setLngInput(item.coords[1].toFixed(4));
                handleSearch(item.coords[0], item.coords[1]);
              }
            }}
          />
        </div>

        {/* Action Button */}
        <div className="md:col-span-4 flex items-end gap-2">
          <button
            onClick={() => handleSearch(parseFloat(latInput), parseFloat(lngInput))}
            disabled={loading}
            className="w-full py-2.5 px-4 bg-cyan-600 hover:bg-cyan-500 text-white font-semibold text-xs rounded-xl shadow-lg transition-colors disabled:opacity-50"
          >
            {loading ? "Calculating..." : "Find Nearest Station"}
          </button>
        </div>
      </div>

      {errorMsg && (
        <div className="p-3 text-xs bg-red-950/50 border border-red-800 text-red-300 rounded-xl">
          {errorMsg}
        </div>
      )}

      {/* Search Result Card */}
      {result && (
        <div className="p-4 bg-slate-950/80 border border-cyan-500/30 rounded-xl space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-cyan-400 uppercase tracking-wider">
              Closest Telemetry Station Identified
            </span>
            <span className="text-xs font-mono font-bold px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
              {result.distanceKm} km away
            </span>
          </div>

          <div className="flex items-center justify-between">
            <h4 className="text-lg font-bold text-white">{result.station.stationName}</h4>
            <span
              className={`px-2.5 py-0.5 text-xs font-bold rounded-full ${result.station.riskLevel === "CRITICAL"
                ? "bg-red-500/20 text-red-400 border border-red-500/40"
                : result.station.riskLevel === "ALARM"
                  ? "bg-orange-500/20 text-orange-400 border border-orange-500/40"
                  : result.station.riskLevel === "ALERT"
                    ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/40"
                    : "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40"
                }`}
            >
              {result.station.riskLevel}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-800/80 text-xs">
            <div>
              <span className="block text-slate-500">Water Level</span>
              <span className="font-mono font-bold text-slate-200">
                {result.station.waterLevel.toFixed(2)} m
              </span>
            </div>
            <div>
              <span className="block text-slate-500">1h Rise Rate</span>
              <span className="font-mono font-bold text-slate-200">
                {result.station.waterLevelDelta1h >= 0 ? "+" : ""}
                {result.station.waterLevelDelta1h.toFixed(2)} m
              </span>
            </div>
            <div>
              <span className="block text-slate-500">24h Rainfall</span>
              <span className="font-mono font-bold text-slate-200">
                {result.station.rain24h.toFixed(1)} mm
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
