"use client";

// ---------------------------------------------------------------------------
// Bahaba – Google Maps-Style Location Autocomplete Component
// ---------------------------------------------------------------------------

import { useState, useEffect, useRef } from "react";
import type { MetroLocationItem } from "@/types";

interface LocationAutocompleteProps {
  /** Label tag above input */
  label: string;
  /** Point A (origin) or Point B (destination) marker type */
  pointType: "origin" | "destination";
  /** Currently selected item name */
  value: string;
  /** Placeholder text */
  placeholder?: string;
  /** Callback when user selects a location from autocomplete suggestions */
  onSelectLocation: (item: {
    id: string;
    name: string;
    subtext: string;
    coords: [number, number] | null;
  }) => void;
}

export default function LocationAutocomplete({
  label,
  pointType,
  value,
  placeholder = "Search location, e.g. UST España, Marikina, Ortigas...",
  onSelectLocation,
}: LocationAutocompleteProps) {
  const [query, setQuery] = useState(value);
  const [isOpen, setIsOpen] = useState(false);
  const [suggestions, setSuggestions] = useState<MetroLocationItem[]>([]);
  const [loadingRemote, setLoadingRemote] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Sync internal state when parent value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Click outside listener to dismiss suggestions dropdown
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Fetch location results from OpenStreetMap Nominatim API as user types
  useEffect(() => {
    if (!query || query.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const trimmed = query.trim();

    const timer = setTimeout(async () => {
      setLoadingRemote(true);
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(trimmed)}&countrycodes=ph&limit=10`;
        const res = await fetch(url);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data) && data.length > 0) {
            const remoteItems: MetroLocationItem[] = data.map((item: any, idx: number) => {
              const namePart = item.display_name.split(",")[0] || item.display_name;
              const subtextParts = item.display_name.split(",").slice(1, 3).join(",").trim();
              return {
                id: `nominatim-${idx}-${item.place_id}`,
                name: namePart,
                subtext: subtextParts || " Philippines",
                category: "landmark" as const,
                coords: [parseFloat(item.lat), parseFloat(item.lon)],
              };
            });
            setSuggestions(remoteItems);
          } else {
            setSuggestions([]);
          }
        }
      } catch (err) {
        // Silent error on network failure
        setSuggestions([]);
      } finally {
        setLoadingRemote(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  const handleSelect = (item: MetroLocationItem) => {
    setQuery(item.name);
    setIsOpen(false);
    onSelectLocation({
      id: item.id,
      name: item.name,
      subtext: item.subtext,
      coords: item.coords,
    });
  };

  const handleClear = () => {
    setQuery("");
    setSuggestions([]);
    setIsOpen(false);
    onSelectLocation({
      id: "",
      name: "",
      subtext: "",
      coords: null,
    });
  };

  const handleUseGeolocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const geoName = `GPS Location (${lat.toFixed(4)}, ${lng.toFixed(4)})`;
        setQuery(geoName);
        setIsOpen(false);
        onSelectLocation({
          id: "gps-location",
          name: geoName,
          subtext: "Current User Location",
          coords: [lat, lng],
        });
      },
      (err) => console.error("Geolocation error:", err)
    );
  };

  return (
    <div ref={wrapperRef} className="relative w-full space-y-1.5">
      {/* Label Bar */}
      <div className="flex items-center justify-between">
        <label
          className={`text-xs font-bold uppercase tracking-wider flex items-center gap-1.5 ${pointType === "origin" ? "text-blue-400" : "text-emerald-400"
            }`}
        >
          <span
            className={`w-4 h-4 rounded-full text-white flex items-center justify-center text-[10px] font-extrabold ${pointType === "origin" ? "bg-blue-500 shadow-blue-500/50" : "bg-emerald-500 shadow-emerald-500/50"
              }`}
          >
            {pointType === "origin" ? "A" : "B"}
          </span>
          {label}
        </label>
        {loadingRemote && (
          <span className="text-[10px] text-cyan-400 animate-pulse">Searching OSM...</span>
        )}
      </div>

      {/* Google Maps Style Search Input */}
      <div className="relative flex items-center">
        <div className="absolute left-3.5 pointer-events-none text-slate-400">
          {pointType === "origin" ? "📍" : "🎯"}
        </div>

        <input
          type="text"
          value={query}
          onFocus={() => setIsOpen(true)}
          onChange={(e) => {
            setQuery(e.target.value);
            setIsOpen(true);
          }}
          placeholder={placeholder}
          className="w-full bg-slate-950 border border-slate-700 text-slate-100 text-sm rounded-xl pl-9 pr-16 py-2.5 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-all font-medium placeholder:text-slate-500"
        />

        {/* Clear & GPS Action Buttons */}
        <div className="absolute right-2 flex items-center gap-1">
          {query && (
            <button
              type="button"
              onClick={handleClear}
              className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
              title="Clear input"
            >
              ✕
            </button>
          )}
          <button
            type="button"
            onClick={handleUseGeolocation}
            className="p-1 text-xs text-cyan-400 hover:text-cyan-300 bg-slate-900 border border-slate-700 rounded-lg hover:bg-slate-800 transition-colors"
            title="Use current GPS location"
          >
            🎯
          </button>
        </div>
      </div>

      {/* Google Maps Style Autocomplete Dropdown */}
      {isOpen && suggestions.length > 0 && (
        <div className="absolute left-0 right-0 top-full mt-1 z-50 bg-slate-900/95 backdrop-blur-lg border border-slate-700 rounded-2xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto custom-scrollbar">
          <div className="px-3 py-2 bg-slate-950/80 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-b border-slate-800 flex justify-between items-center">
            <span>Suggested Metro Manila Locations</span>
            <span>{suggestions.length} Results</span>
          </div>

          <div className="divide-y divide-slate-800/60">
            {suggestions.map((item) => (
              <div
                key={item.id}
                onClick={() => handleSelect(item)}
                className="px-3.5 py-2.5 hover:bg-slate-800/90 transition-colors cursor-pointer flex items-center justify-between gap-3 group"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-slate-800 group-hover:bg-cyan-600/20 border border-slate-700 group-hover:border-cyan-500/40 flex items-center justify-center text-sm shrink-0 transition-colors">
                    {item.category === "station"
                      ? "🌊"
                      : item.category === "road"
                        ? "🛣️"
                        : "🏢"}
                  </div>

                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-slate-100 group-hover:text-cyan-400 transition-colors truncate">
                      {item.name}
                    </h4>
                    <p className="text-[11px] text-slate-400 truncate">
                      {item.subtext}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                    {item.category === "station"
                      ? "Station"
                      : item.category === "road"
                        ? "Corridor"
                        : "Landmark"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
