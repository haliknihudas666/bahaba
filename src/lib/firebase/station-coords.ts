// ---------------------------------------------------------------------------
// Bahaba – PAGASA Station Coordinate Map
//
// Geographic coordinates (lat, lng) for Pasig-Marikina-Tullahan river basin
// stations. PAGASA JSON telemetry feeds return station names but omit
// lat/lng coordinates.
// ---------------------------------------------------------------------------

export interface StationCoordinate {
  lat: number;
  lng: number;
}

/**
 * Known station coordinates across Metro Manila river basins.
 * Sourced from PAGASA / MMDA public hydrology registry.
 */
const KNOWN_STATION_COORDINATES: Record<string, StationCoordinate> = {
  "sto. nino":           { lat: 14.6334, lng: 121.0945 }, // Marikina River, Sto. Niño
  "sto. niño":           { lat: 14.6334, lng: 121.0945 },
  "nangka":              { lat: 14.6698, lng: 121.1092 }, // Nangka River
  "montalban":           { lat: 14.7335, lng: 121.1417 }, // Rodriguez / Montalban
  "tumana":              { lat: 14.6548, lng: 121.0931 }, // Tumana Bridge
  "san mateo":           { lat: 14.6982, lng: 121.1186 }, // San Mateo
  "marikina":            { lat: 14.6315, lng: 121.0970 }, // Marikina Bridge
  "san juan":            { lat: 14.6045, lng: 121.0210 }, // San Juan River
  "pandacan":            { lat: 14.5902, lng: 121.0021 }, // Pasig River Pandacan
  "angono":              { lat: 14.5244, lng: 121.1554 }, // Laguna de Bay / Angono
  "rodriguez":           { lat: 14.7335, lng: 121.1417 }, // Upper Marikina
  "tullahan":            { lat: 14.7088, lng: 120.9782 }, // Tullahan River, Valenzuela/Malabon
  "ugong":               { lat: 14.5823, lng: 121.0772 }, // Pasig Ugong
  "rosario":             { lat: 14.5855, lng: 121.0858 }, // Manggahan Floodway, Rosario Weir
  "boso boso":           { lat: 14.6580, lng: 121.2185 }, // Antipolo / Boso Boso
  "mount oro":           { lat: 14.7891, lng: 121.1963 }, // Upper Basin Mount Oro
};

/** Default fallback coordinate (Metro Manila centroid) */
export const METRO_MANILA_CENTROID: StationCoordinate = {
  lat: 14.5995,
  lng: 120.9842,
};

/**
 * Generate a consistent document slug ID from a station name.
 * e.g., "Sto. Niño" -> "sto-nino", "Nangka River" -> "nangka-river"
 */
export function slugifyStationId(stationName: string): string {
  return stationName
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // remove diacritics (ñ -> n)
    .replace(/[^a-z0-9\s-]/g, "")    // strip non-alphanumeric chars except space/dash
    .trim()
    .replace(/\s+/g, "-");
}

/**
 * Lookup coordinates for a PAGASA station name. Returns exact or fuzzy match,
 * defaulting to Metro Manila centroid if unmapped.
 */
export function getStationCoords(stationName: string): StationCoordinate {
  const normalized = stationName.toLowerCase().trim();

  // 1. Direct match
  if (KNOWN_STATION_COORDINATES[normalized]) {
    return KNOWN_STATION_COORDINATES[normalized];
  }

  // 2. Partial match lookup
  for (const [key, coords] of Object.entries(KNOWN_STATION_COORDINATES)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return coords;
    }
  }

  // 3. Fallback
  return METRO_MANILA_CENTROID;
}
