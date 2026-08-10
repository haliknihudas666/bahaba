// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Hydrological Telemetry Schema
// Type definitions for PAGASA Pasig-Marikina-Tullahan FFWS data ingestion
// ---------------------------------------------------------------------------

/**
 * Flood risk classification derived from water-level thresholds published by
 * PAGASA for each station.  The ingestion pipeline stores the raw numbers;
 * risk classification happens downstream, but we define the enum-like map
 * here so every consumer agrees on the vocabulary.
 */
export interface FloodRiskLevel {
  readonly label: "NORMAL" | "ALERT" | "ALARM" | "CRITICAL" | "UNKNOWN";
  readonly numericOrder: number; // 0 = NORMAL … 4 = UNKNOWN
}

export const FLOOD_RISK_LEVELS: Record<FloodRiskLevel["label"], FloodRiskLevel> = {
  NORMAL:   { label: "NORMAL",   numericOrder: 0 },
  ALERT:    { label: "ALERT",    numericOrder: 1 },
  ALARM:    { label: "ALARM",    numericOrder: 2 },
  CRITICAL: { label: "CRITICAL", numericOrder: 3 },
  UNKNOWN:  { label: "UNKNOWN",  numericOrder: 4 },
} as const;

// ---------------------------------------------------------------------------
// Rainfall telemetry (per station row from PAGASA rainfall table)
// ---------------------------------------------------------------------------
export interface RainfallReading {
  /** Human-readable station name, e.g. "Nangka" */
  stationName: string;

  /** 10-minute accumulated rainfall in mm */
  rain10min: number;

  /** 30-minute accumulated rainfall in mm */
  rain30min: number;

  /** 1-hour accumulated rainfall in mm */
  rain1hr: number;

  /** 3-hour accumulated rainfall in mm */
  rain3hr: number;

  /** 6-hour accumulated rainfall in mm */
  rain6hr: number;

  /** 12-hour accumulated rainfall in mm */
  rain12hr: number;

  /** 24-hour accumulated rainfall in mm */
  rain24hr: number;
}

// ---------------------------------------------------------------------------
// Water-level telemetry (per station row from PAGASA water-level table)
// ---------------------------------------------------------------------------
export interface WaterLevelReading {
  /** Human-readable station name, e.g. "Sto. Niño" */
  stationName: string;

  /** Current water level in meters (EL.m) */
  currentLevel: number;

  /** Water level 30 minutes ago (EL.m) */
  change30min: number;

  /** Water level 1 hour ago (EL.m) */
  change1hr: number;

  /** Water level 2 hours ago (EL.m) */
  change2hr: number;

  /** PAGASA per-station alert threshold (EL.m), null if not published */
  alertLevel: number | null;

  /** PAGASA per-station alarm threshold (EL.m), null if not published */
  alarmLevel: number | null;

  /** PAGASA per-station critical threshold (EL.m), null if not published */
  criticalLevel: number | null;
}

// ---------------------------------------------------------------------------
// Combined telemetry for a single station (rainfall + water level joined by
// station name when both are available)
// ---------------------------------------------------------------------------
export interface StationTelemetry {
  stationName: string;
  /** PAGASA-reported latitude (from map_list.do), null if unavailable */
  latitude: number | null;
  /** PAGASA-reported longitude (from map_list.do), null if unavailable */
  longitude: number | null;
  rainfall: RainfallReading | null;
  waterLevel: WaterLevelReading | null;
  /** Risk level derived specifically from water level thresholds */
  waterRiskLevel: FloodRiskLevel["label"];
  /** Risk level derived specifically from rainfall intensity thresholds */
  rainRiskLevel: FloodRiskLevel["label"];
  /** Highest composite risk level between water level and rainfall */
  riskLevel: FloodRiskLevel["label"];
}

// ---------------------------------------------------------------------------
// Top-level scrape result returned by the ingestion API
// ---------------------------------------------------------------------------
export interface ScrapeResult {
  /** Whether the scrape completed without fatal errors */
  success: boolean;

  /** ISO-8601 timestamp of when the scrape was executed */
  scrapedAt: string;

  /** Individual station telemetry records */
  stations: StationTelemetry[];

  /** Raw rainfall readings before joining */
  rainfall: RainfallReading[];

  /** Raw water-level readings before joining */
  waterLevels: WaterLevelReading[];

  /** Human-readable error message when success === false */
  error?: string;

  /** Timing metadata */
  meta: {
    rainfallRowCount: number;
    waterLevelRowCount: number;
    durationMs: number;
  };
}
