// ---------------------------------------------------------------------------
// Bahaba – Firestore Schema & Type Definitions
// ---------------------------------------------------------------------------

import type { FloodRiskLevel } from "./telemetry";

/**
 * Historical time-series record appended to `telemetry_history` collection.
 * Document ID: auto-generated autoId.
 */
export interface TelemetryHistoryDoc {
  /** Slugified or unique ID of the telemetry station */
  stationId: string;
  /** Human-readable station name (e.g. "Nangka") */
  stationName: string;
  /** 10-minute accumulated rainfall in mm */
  rain10m: number;
  /** 1-hour accumulated rainfall in mm */
  rain1h: number;
  /** 24-hour accumulated rainfall in mm */
  rain24h: number;
  /** Current water level in meters (EL.m) */
  waterLevel: number;
  /** Water level delta in past 1 hour (meters) */
  waterLevelDelta1h: number;
  /** Server timestamp when document was persisted */
  timestamp: unknown;
}

/**
 * Active station snapshot document in `stations` collection.
 * Document ID: `stations/{stationId}` (e.g. "nangka", "sto-nino").
 */
export interface StationDoc {
  /** Slugified or unique ID of the telemetry station */
  stationId: string;
  /** Human-readable station name */
  stationName: string;
  /** GeoPoint (lat, lng) location of station */
  coordinates: { latitude: number; longitude: number; _lat?: number; _long?: number };
  /** Geohash string computed from lat/lng */
  geohash: string;
  /** 10-minute accumulated rainfall in mm */
  rain10m: number;
  /** 1-hour accumulated rainfall in mm */
  rain1h: number;
  /** 24-hour accumulated rainfall in mm */
  rain24h: number;
  /** Current water level in meters (EL.m) */
  waterLevel: number;
  /** Water level delta in past 1 hour (meters) */
  waterLevelDelta1h: number;
  /** Water level risk classification */
  waterRiskLevel?: FloodRiskLevel["label"];
  /** Rainfall intensity risk classification */
  rainRiskLevel?: FloodRiskLevel["label"];
  /** Composite/overall risk classification label */
  riskLevel: FloodRiskLevel["label"];
  /** Server timestamp of last station update */
  lastUpdated: unknown;
}

/**
 * Client-side representations of station documents where Timestamps and GeoPoints
 * are converted into simple JavaScript primitives (Date / number).
 */
export interface LiveStation {
  stationId: string;
  stationName: string;
  latitude: number;
  longitude: number;
  geohash: string;
  rain10m: number;
  rain1h: number;
  rain24h: number;
  waterLevel: number;
  waterLevelDelta1h: number;
  waterRiskLevel: FloodRiskLevel["label"];
  rainRiskLevel: FloodRiskLevel["label"];
  riskLevel: FloodRiskLevel["label"];
  lastUpdated: Date | null;
}

/**
 * Result returned by getNearestStationData in lib/firebase/geo.ts
 */
export interface NearestStationResult {
  station: LiveStation;
  distanceKm: number;
}

/**
 * Telemetry synchronization metadata and consolidated snapshot document in `sync_meta/telemetry`.
 */
export interface TelemetrySyncMetaDoc {
  /** Server timestamp when sync was executed */
  lastSyncedAt: unknown;
  /** Number of stations persisted */
  stationCount: number;
  /** Status of last ingestion pipeline */
  status: "SUCCESS" | "FAILED";
  /** ISO string of last update */
  updatedAtIso?: string;
  /** Consolidated active stations array for O(1) single-document reads */
  stations?: StationDoc[];
}

