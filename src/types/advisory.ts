// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Advisory Types
// ---------------------------------------------------------------------------

export type AdvisorySource = "MMDA" | "NDRRMC" | "PAGASA" | "NEWS";

export type AdvisoryPassability =
  | "PASSABLE_ALL"
  | "NOT_PASSABLE_LIGHT"
  | "NOT_PASSABLE_ALL"
  | "SUBSIDED";

export type FloodDepthLevel =
  | "GUTTER"     // ~8 inches (~0.2m)
  | "HALF_TIRE"  // ~13 inches (~0.33m)
  | "TIRE"       // ~26 inches (~0.66m)
  | "KNEE"       // ~19 inches (~0.5m)
  | "WAIST"      // ~37 inches (~0.95m)
  | "CHEST"      // ~45 inches (~1.15m)
  | "SUBSIDED"   // 0 inches (cleared)
  | "UNKNOWN";

export interface ReportedAdvisory {
  id: string;
  source: AdvisorySource;
  postUrl: string;
  rawText: string;
  publishedAt: string; // ISO 8601 string
  
  // Media attachments (photos/tables posted by agency)
  photoUrls: string[];

  // Parsed flood intelligence
  category?: "FLOOD" | "WEATHER" | "SUSPENSION" | "BULLETIN";
  isFloodReport: boolean;
  roadName?: string;
  landmark?: string;
  direction?: "NB" | "SB" | "EB" | "WB" | "BOTH";
  depthLevel: FloodDepthLevel;
  depthInches: number;
  passability: AdvisoryPassability;
  
  // Visual severity indicators
  severity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL";
  badgeColor: "red" | "orange" | "yellow" | "green" | "blue";
  passabilityLabel: string;

  // Spatial location
  coordinates: {
    lat: number;
    lng: number;
  } | null;
  
  status: "ACTIVE" | "SUBSIDED";
}

export interface AdvisorySyncResult {
  success: boolean;
  scrapedAt: string;
  advisories: ReportedAdvisory[];
  totalCount: number;
  activeFloodCount: number;
  error?: string;
  meta?: {
    durationMs: number;
    sourceBreakdown: Record<string, number>;
  };
}

/** Maximum validity duration for advisory pins on the map (6 hours) */
export const ADVISORY_MAP_PIN_MAX_AGE_MS = 6 * 60 * 60 * 1000; // 6 hours (21,600,000 ms)

/**
 * Determines whether a reported advisory should be visible as a pin on the map.
 * Pins are only visible if they have valid geographic coordinates and were published
 * within the last 6 hours.
 */
export function isAdvisoryPinVisible(
  advisory: ReportedAdvisory,
  now: number = Date.now()
): boolean {
  if (!advisory.coordinates || !advisory.coordinates.lat || !advisory.coordinates.lng) {
    return false;
  }
  if (!advisory.publishedAt) {
    return false;
  }
  const publishedMs = new Date(advisory.publishedAt).getTime();
  if (isNaN(publishedMs)) {
    return false;
  }
  const ageMs = now - publishedMs;
  // Valid if published within the 6-hour window (with 60-second tolerance for slight clock drift)
  return ageMs >= -60_000 && ageMs <= ADVISORY_MAP_PIN_MAX_AGE_MS;
}
