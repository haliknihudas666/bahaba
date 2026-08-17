// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – OSRM Routing Engine & 4-Step Flood Predictor
//
// Step 1: Get Directions (Point A -> Point B via OSRM)
// Step 2: Check Elevations along route segments (Open-Meteo DEM API)
// Step 3: Check Rainfall mm/hr & 24h accumulation from nearby weather telemetry (PAGASA + Panahon AWS)
// Step 4: Calculate standing water depth, risk category, and vehicle passability
// ---------------------------------------------------------------------------

import type { LiveStation } from "@/types";
import { getElevationsForCoordinates } from "@/lib/geo/elevation";
import {
  calculateHaversineDistance,
  classifySeverity,
  type RoadSeverity,
} from "./roadRisk";
import { calculateWaterDepth, classifyFloodRisk } from "./floodPredictor";

export interface RouteOption {
  id: string;
  summary: string;
  distanceKm: number;
  durationMin: number;
  geometry: [number, number][]; // Full route [lat, lng] array
  segmentedRoute: RouteSegmentData[];
  maxFloodDepthCm: number;
  totalFloodedKm: number;
  overallStatus: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE";
  warnings: string[];
}

export interface RouteSegmentData {
  coordinates: [number, number][]; // [lat, lng]
  elevationM: number;
  rainMmHr: number;
  rain24hMm: number;
  severity: RoadSeverity;
  color: string;
  depthCm: number;
  depthCategory: string;
  passableVehicles: string[];
  hazardScore: number;
  nearestStationName: string;
  nearestStationDistanceKm: number;
  segmentDistanceKm: number;
}

/**
 * Step 1: Fetches driving directions from OSRM API between Point A and Point B,
 * then executes Steps 2-4 (Elevation + Rainfall + Inundation prediction) along every segment.
 */
export async function fetchAndEvaluateRoute(
  origin: [number, number], // [lat, lng]
  destination: [number, number], // [lat, lng]
  stations: LiveStation[]
): Promise<RouteOption[]> {
  const [origLat, origLng] = origin;
  const [destLat, destLng] = destination;

  try {
    // 1. OSRM Public Driving Routing API
    const url = `https://router.project-osrm.org/route/v1/driving/${origLng},${origLat};${destLng},${destLat}?overview=full&geometries=geojson&steps=true&alternatives=true`;

    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`OSRM API error: ${res.statusText}`);
    }

    const data = await res.json();
    if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
      throw new Error("No route found between selected points");
    }

    // 2. Map and Evaluate Each Alternative Route asynchronously
    const routeOptions: RouteOption[] = await Promise.all(
      data.routes.map(async (rt: any, idx: number) => {
        const rawCoords: [number, number][] = rt.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => [lat, lng]
        );

        const summary =
          rt.legs?.[0]?.summary ||
          (idx === 0 ? "Fastest Route" : `Alternative Route ${idx}`);
        const distanceKm = Number((rt.distance / 1000).toFixed(1));
        const durationMin = Math.round(rt.duration / 60);

        // Steps 2, 3, 4: Segment polyline, fetch elevation, check rainfall & predict flooding
        const segmented = await segmentPolylineWithFloodRisk(rawCoords, stations);

        let maxFloodDepthCm = 0;
        let totalFloodedKm = 0;
        const warnings: string[] = [];

        segmented.forEach((seg) => {
          if (seg.depthCm > maxFloodDepthCm) {
            maxFloodDepthCm = seg.depthCm;
          }
          if (seg.severity !== "NORMAL") {
            totalFloodedKm += seg.segmentDistanceKm;
            if (seg.depthCm > 15 && !warnings.includes(seg.nearestStationName)) {
              warnings.push(
                `Flood risk (${seg.depthCm} cm / ${seg.severity}) near ${seg.nearestStationName} (Elev: ${seg.elevationM}m, Rain: ${seg.rainMmHr}mm/hr)`
              );
            }
          }
        });

        let overallStatus: "SAFE" | "CAUTION" | "HIGH_RISK" | "IMPASSABLE" = "SAFE";
        if (maxFloodDepthCm > 30) {
          overallStatus = "IMPASSABLE";
        } else if (maxFloodDepthCm >= 16) {
          overallStatus = "HIGH_RISK";
        } else if (maxFloodDepthCm >= 6) {
          overallStatus = "CAUTION";
        }

        return {
          id: `route-${idx}`,
          summary: summary ? `via ${summary}` : "Primary Route",
          distanceKm,
          durationMin,
          geometry: rawCoords,
          segmentedRoute: segmented,
          maxFloodDepthCm,
          totalFloodedKm: Number(totalFloodedKm.toFixed(1)),
          overallStatus,
          warnings,
        };
      })
    );

    return routeOptions;
  } catch (err) {
    console.warn("[RouteSolver] Falling back to direct polyline interpolation:", err);
    return [await createFallbackRoute(origin, destination, stations)];
  }
}

/**
 * Splits a dense polyline [lat, lng][] into sub-segments (~300m length)
 * and executes:
 *   - Step 2: Sampling elevations (EL.m) via DEM
 *   - Step 3: Interpolating rainfall mm/hr & 24h accumulation from stations
 *   - Step 4: Predicting standing water depth, drivability, and risk category
 */
export async function segmentPolylineWithFloodRisk(
  polyline: [number, number][],
  stations: LiveStation[]
): Promise<RouteSegmentData[]> {
  if (!polyline || polyline.length < 2) return [];

  const CHUNK_SIZE = Math.max(2, Math.floor(polyline.length / 15)); // ~15 sub-segments
  const rawSegments: {
    chunk: [number, number][];
    centLat: number;
    centLng: number;
    segDistKm: number;
  }[] = [];

  for (let i = 0; i < polyline.length - 1; i += CHUNK_SIZE - 1) {
    const chunk = polyline.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) continue;

    let segDistKm = 0;
    let sumLat = 0;
    let sumLng = 0;

    chunk.forEach(([lat, lng], idx) => {
      sumLat += lat;
      sumLng += lng;
      if (idx > 0) {
        const prev = chunk[idx - 1];
        segDistKm += calculateHaversineDistance(prev[0], prev[1], lat, lng);
      }
    });

    rawSegments.push({
      chunk,
      centLat: sumLat / chunk.length,
      centLng: sumLng / chunk.length,
      segDistKm: Number(segDistKm.toFixed(2)),
    });
  }

  // Step 2: Sample elevations for all segment centroids in batch
  const centroidCoords: [number, number][] = rawSegments.map((s) => [s.centLat, s.centLng]);
  const elevations = await getElevationsForCoordinates(centroidCoords);

  const segments: RouteSegmentData[] = [];

  for (let idx = 0; idx < rawSegments.length; idx++) {
    const { chunk, centLat, centLng, segDistKm } = rawSegments[idx];
    const roadElevation = elevations[idx] ?? 4.0;

    // Step 3: Check all rainfall mm/hr along the way & around the area
    let nearestSt: LiveStation | null = null;
    let minDist = Infinity;

    if (stations && stations.length > 0) {
      for (const st of stations) {
        if (!st.latitude || !st.longitude) continue;
        const d = calculateHaversineDistance(centLat, centLng, st.latitude, st.longitude);
        if (d < minDist) {
          minDist = d;
          nearestSt = st;
        }
      }
    }

    let nearestStationName = "Weather Telemetry";
    let nearestStationDistKm = 0;
    let rainMmHr = 0;
    let rain24hMm = 0;
    let waterDelta1h = 0;
    let stRiskLevel = "NORMAL";

    if (nearestSt) {
      nearestStationName = nearestSt.stationName;
      nearestStationDistKm = Number(minDist.toFixed(1));
      // Distance decay weight (effective rainfall influence radius)
      const distWeight = Math.exp(-minDist / 8.0);
      rainMmHr = Math.round((nearestSt.rain1h ?? 0) * distWeight * 10) / 10;
      rain24hMm = Math.round((nearestSt.rain24h ?? 0) * distWeight * 10) / 10;
      waterDelta1h = nearestSt.waterLevelDelta1h ?? 0;
      stRiskLevel = nearestSt.riskLevel ?? "NORMAL";
    }

    // Step 4: Calculate elevation, rainfall, drainage, and hazard
    // Base drainage capacity for urban corridor: 25 mm/hr (adjusted by elevation)
    const baseDrainage = roadElevation <= 3.0 ? 18 : roadElevation <= 6.0 ? 25 : 32;

    // NOAH hazard estimate based on low-lying profile
    const inferredNoahHazard =
      roadElevation <= 2.2 ? 3 : roadElevation <= 3.5 ? 2 : roadElevation <= 6.0 ? 1 : 0;

    let depthCm = calculateWaterDepth(
      rainMmHr,
      rain24hMm,
      inferredNoahHazard,
      roadElevation,
      baseDrainage
    );

    // Fluvial surge if within 500m of a river gauge at alert/critical
    if (minDist <= 0.5 && (stRiskLevel === "CRITICAL" || stRiskLevel === "ALARM")) {
      const riverBonus = stRiskLevel === "CRITICAL" ? 18 : 8;
      const surgeBonus = Math.max(0, waterDelta1h) * 100 * 0.25;
      depthCm = Math.round(depthCm + riverBonus + surgeBonus);
    }

    const classification = classifyFloodRisk(depthCm);
    const severityClassification = classifySeverity(depthCm);

    // Color: #2563eb for Normal / Clear (0-5cm), else severity color
    const color = depthCm <= 5 ? "#2563eb" : classification.color;

    // Composite Hazard Score (0-100)
    const rainFactor = Math.min(1.0, rainMmHr / 30.0);
    const depthFactor = Math.min(1.0, depthCm / 50.0);
    const elevFactor = Math.max(0, 1.0 - roadElevation / 20.0);
    const hazardScore = Math.round(
      Math.min(100, (rainFactor * 0.35 + depthFactor * 0.45 + elevFactor * 0.20) * 100)
    );

    segments.push({
      coordinates: chunk,
      elevationM: roadElevation,
      rainMmHr,
      rain24hMm,
      severity: severityClassification.severity,
      color,
      depthCm,
      depthCategory: classification.label,
      passableVehicles: classification.passableVehicles,
      hazardScore,
      nearestStationName,
      nearestStationDistanceKm: nearestStationDistKm,
      segmentDistanceKm: segDistKm,
    });
  }

  return segments;
}

async function createFallbackRoute(
  origin: [number, number],
  destination: [number, number],
  stations: LiveStation[]
): Promise<RouteOption> {
  const [lat1, lng1] = origin;
  const [lat2, lng2] = destination;
  const STEPS = 20;

  const polyline: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    polyline.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
  }

  const distanceKm = Number(calculateHaversineDistance(lat1, lng1, lat2, lng2).toFixed(1));
  const durationMin = Math.round((distanceKm / 30) * 60);

  const segmented = await segmentPolylineWithFloodRisk(polyline, stations);
  const maxFloodDepthCm = Math.max(...segmented.map((s) => s.depthCm), 0);

  return {
    id: "route-fallback",
    summary: "Direct Connecting Corridor",
    distanceKm,
    durationMin,
    geometry: polyline,
    segmentedRoute: segmented,
    maxFloodDepthCm,
    totalFloodedKm: 0,
    overallStatus:
      maxFloodDepthCm > 30
        ? "IMPASSABLE"
        : maxFloodDepthCm >= 16
        ? "HIGH_RISK"
        : maxFloodDepthCm >= 6
        ? "CAUTION"
        : "SAFE",
    warnings: [],
  };
}
