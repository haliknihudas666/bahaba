// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – PAGASA / Panahon Telemetry Scraper
//
// Complete migration to DOST-PAGASA Panahon Portal (https://panahon.gov.ph).
// Ingests real-time Automated Weather Station (AWS), River Basin water level/rain,
// and Synoptic telemetry across the Philippines.
// ---------------------------------------------------------------------------

import type {
  RainfallReading,
  WaterLevelReading,
  StationTelemetry,
  ScrapeResult,
  FloodRiskLevel,
} from "@/types";

import {
  fetchPanahonCompleteTelemetry,
  cleanNumber,
  cleanStationName,
  classifyRainRisk,
  classifyWaterRisk,
  getCompositeRisk,
  fetchPanahonAws,
  fetchPanahonRiverbasin,
  fetchPanahonSynop,
  fetchPanahonCycloneTrack,
  convertPanahonToLiveStations,
} from "./panahon-scraper";

// Re-export core functions and utilities from the Panahon scraper
export {
  cleanNumber,
  cleanStationName,
  classifyRainRisk,
  classifyWaterRisk,
  getCompositeRisk,
  fetchPanahonAws,
  fetchPanahonRiverbasin,
  fetchPanahonSynop,
  fetchPanahonCycloneTrack,
  convertPanahonToLiveStations,
  fetchPanahonCompleteTelemetry,
};

/** Alias cleanNumericValue to cleanNumber for backward compatibility */
export const cleanNumericValue = cleanNumber;

/**
 * Coordinate mapping interface for backward compatibility.
 */
export interface StationCoordMap {
  [normalizedName: string]: { lat: number; lng: number };
}

/**
 * Build a YMDHM timestamp in PST (UTC+8).
 */
export function currentYmdhm(): string {
  const now = new Date();
  const phtOffset = 8 * 60; // PHT is UTC+8
  const utcMinutes = now.getTime() + now.getTimezoneOffset() * 60000;
  const phtDate = new Date(utcMinutes + phtOffset * 60000);

  const min = Math.floor(phtDate.getMinutes() / 10) * 10;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");

  return (
    `${phtDate.getFullYear()}` +
    `${pad(phtDate.getMonth() + 1)}` +
    `${pad(phtDate.getDate())}` +
    `${pad(phtDate.getHours())}` +
    `${pad(min)}`
  );
}

/**
 * Parse a PAGASA ymdhm string into an authoritative UTC ISO string.
 */
export function parseYmdhmToIso(ymdhm: string): string {
  if (ymdhm && ymdhm.length === 12) {
    const y = parseInt(ymdhm.substring(0, 4), 10);
    const m = parseInt(ymdhm.substring(4, 6), 10) - 1;
    const d = parseInt(ymdhm.substring(6, 8), 10);
    const h = parseInt(ymdhm.substring(8, 10), 10);
    const min = parseInt(ymdhm.substring(10, 12), 10);
    const utcMs = Date.UTC(y, m, d, h - 8, min);
    const date = new Date(utcMs);
    if (!isNaN(date.getTime())) return date.toISOString();
  }
  return new Date().toISOString();
}

/**
 * Merge rainfall + water levels by station name (backward compatibility helper).
 */
export function mergeStationData(
  rainfall: RainfallReading[],
  waterLevels: WaterLevelReading[],
  coordMap: StationCoordMap = {},
  observedAt?: string | null
): StationTelemetry[] {
  const normalize = (name: string) => name.toLowerCase().trim();

  const rainMap = new Map<string, RainfallReading>();
  for (const r of rainfall) {
    rainMap.set(normalize(r.stationName), r);
  }

  const waterMap = new Map<string, WaterLevelReading>();
  for (const w of waterLevels) {
    waterMap.set(normalize(w.stationName), w);
  }

  const allKeys = new Set([...rainMap.keys(), ...waterMap.keys()]);

  const stations: StationTelemetry[] = [];
  for (const key of allKeys) {
    const rain = rainMap.get(key) ?? null;
    const water = waterMap.get(key) ?? null;
    const coord = coordMap[key] ?? null;

    const waterRiskLevel: FloodRiskLevel["label"] = classifyWaterRisk(water);
    const rainRiskLevel: FloodRiskLevel["label"] = classifyRainRisk(rain);
    const riskLevel = getCompositeRisk(waterRiskLevel, rainRiskLevel);

    stations.push({
      stationName: rain?.stationName ?? water?.stationName ?? key,
      latitude: coord?.lat ?? null,
      longitude: coord?.lng ?? null,
      rainfall: rain,
      waterLevel: water,
      waterRiskLevel,
      rainRiskLevel,
      riskLevel,
      observedAt: observedAt || new Date().toISOString(),
    });
  }

  stations.sort((a, b) => a.stationName.localeCompare(b.stationName));
  return stations;
}

// ---------------------------------------------------------------------------
// Primary Orchestrator – Fully Migrated to DOST-PAGASA Panahon
// ---------------------------------------------------------------------------

/**
 * Ingest live telemetry from DOST-PAGASA Panahon Portal.
 */
export async function ingestTelemetry(): Promise<ScrapeResult> {
  return fetchPanahonCompleteTelemetry();
}
