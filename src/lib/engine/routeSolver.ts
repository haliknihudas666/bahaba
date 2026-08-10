// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – OSRM Routing Engine & Segment Flood Evaluator
// ---------------------------------------------------------------------------

import type { LiveStation } from "@/types";
import {
  calculateHaversineDistance,
  classifySeverity,
  SEVERITY_RULES,
  type RoadSeverity,
} from "./roadRisk";

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
  severity: RoadSeverity;
  color: string;
  depthCm: number;
  hazardScore: number;
  nearestStationName: string;
  nearestStationDistanceKm: number;
  segmentDistanceKm: number;
}

/**
 * Fetches driving directions from OSRM API between Point A and Point B,
 * then evaluates flood severity along every segment of the route polyline.
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

    // 2. Map and Evaluate Each Alternative Route
    const routeOptions: RouteOption[] = data.routes.map((rt: any, idx: number) => {
      const rawCoords: [number, number][] = rt.geometry.coordinates.map(
        ([lng, lat]: [number, number]) => [lat, lng]
      );

      const summary =
        rt.legs?.[0]?.summary ||
        (idx === 0 ? "Fastest Route" : `Alternative Route ${idx}`);
      const distanceKm = Number((rt.distance / 1000).toFixed(1));
      const durationMin = Math.round(rt.duration / 60);

      // 3. Segment polyline into 300m sub-segments & evaluate flood risk
      const segmented = segmentPolylineWithFloodRisk(rawCoords, stations);

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
              `Flood risk (${seg.depthCm} cm / ${seg.severity}) near ${seg.nearestStationName} station`
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
    });

    return routeOptions;
  } catch (err) {
    console.warn("[RouteSolver] Falling back to direct polyline interpolation:", err);
    return [createFallbackRoute(origin, destination, stations)];
  }
}

/**
 * Splits a dense polyline [lat, lng][] into sub-segments (~300m length)
 * and evaluates flood depth against active PAGASA stations for each portion
 * using a rainfall-primary model.
 *
 * Road surface flooding is estimated from rainfall intensity + soil saturation.
 * River water levels only add bonus depth for segments within ~500m of a
 * river gauge at ALARM or CRITICAL level.
 */
export function segmentPolylineWithFloodRisk(
  polyline: [number, number][],
  stations: LiveStation[]
): RouteSegmentData[] {
  if (!polyline || polyline.length < 2) return [];

  const CHUNK_SIZE = Math.max(2, Math.floor(polyline.length / 15)); // Break polyline into ~15 sub-segments
  const segments: RouteSegmentData[] = [];

  // Pluvial model constants (matching roadRisk.ts)
  const SSI_DECAY_RATE = 0.019;
  const URBAN_RUNOFF_COEFFICIENT = 0.8;
  const BASE_DRAINAGE_CAPACITY_MM_HR = 10;
  const LOW_ELEVATION_THRESHOLD_M = 3.0;
  const LOW_ELEVATION_PONDING_MULTIPLIER = 1.5;
  const RAINFALL_TO_DEPTH_CM = 0.15;
  const RIVERBANK_ZONE_KM = 0.5;
  const FLUVIAL_OVERFLOW_MAX_BONUS_CM = 20;

  for (let i = 0; i < polyline.length - 1; i += CHUNK_SIZE - 1) {
    const chunk = polyline.slice(i, i + CHUNK_SIZE);
    if (chunk.length < 2) continue;

    // Calculate segment distance & centroid
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

    const centLat = sumLat / chunk.length;
    const centLng = sumLng / chunk.length;

    // Find nearest PAGASA station
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

    // Estimate flood depth using rainfall-primary model
    let depthCm = 0;
    let nearestStationName = "PAGASA Station";
    let nearestStationDistKm = 0;

    if (nearestSt) {
      const st = nearestSt as LiveStation;
      nearestStationName = st.stationName;
      nearestStationDistKm = Number(minDist.toFixed(1));

      const distWeight = Math.exp(-minDist / 6.0);
      const rain1h = st.rain1h ?? 0;
      const rain24h = st.rain24h ?? 0;
      const rain10m = st.rain10m ?? 0;
      const delta1h = st.waterLevelDelta1h ?? 0;
      const roadElevation = 4.0; // Default urban road elevation

      // Pluvial depth estimation
      const soilSaturationIndex = 1 - Math.exp(-SSI_DECAY_RATE * rain24h);
      const effectiveDrainageMmHr =
        BASE_DRAINAGE_CAPACITY_MM_HR * (1 - soilSaturationIndex * 0.8);

      const effectiveRain1h = rain1h * distWeight;
      const netRainfallExcessMm = Math.max(
        0,
        effectiveRain1h * URBAN_RUNOFF_COEFFICIENT - effectiveDrainageMmHr,
      );

      let pluvialDepthCm = netRainfallExcessMm * RAINFALL_TO_DEPTH_CM;

      if (roadElevation <= LOW_ELEVATION_THRESHOLD_M) {
        pluvialDepthCm *= LOW_ELEVATION_PONDING_MULTIPLIER;
      }

      const effectiveRain10m = rain10m * distWeight;
      if (effectiveRain10m > 5) {
        pluvialDepthCm += (effectiveRain10m - 5) * 0.2;
      }

      // Fluvial overflow bonus (near-river only)
      let fluvialBonusCm = 0;
      const isNearRiver = minDist <= RIVERBANK_ZONE_KM;

      if (isNearRiver) {
        if (st.riskLevel === "CRITICAL") {
          fluvialBonusCm = FLUVIAL_OVERFLOW_MAX_BONUS_CM;
        } else if (st.riskLevel === "ALARM") {
          fluvialBonusCm = FLUVIAL_OVERFLOW_MAX_BONUS_CM * 0.5;
        }
        const surgeCm = Math.max(0, delta1h) * 100 * 0.3;
        fluvialBonusCm += surgeCm;
      }

      depthCm = Math.round(Math.max(0, pluvialDepthCm + fluvialBonusCm));
    }

    const classification = classifySeverity(depthCm);

    // Default route color: Vibrant Google Maps Blue (#2563eb) for Normal/Clear, or severity highlight
    const color = depthCm <= 5 ? "#2563eb" : classification.hex;

    // Rainfall-weighted hazard score
    const rainScore = nearestSt ? Math.min(1.0, nearestSt.rain1h / 30.0) : 0;
    const depthScore = Math.min(1.0, depthCm / 50.0);
    const ssiScore = nearestSt
      ? 1 - Math.exp(-SSI_DECAY_RATE * (nearestSt.rain24h ?? 0))
      : 0;
    const hazardScore = Math.round(
      Math.min(100, (rainScore * 0.40 + depthScore * 0.35 + ssiScore * 0.25) * 100)
    );

    segments.push({
      coordinates: chunk,
      severity: classification.severity,
      color,
      depthCm,
      hazardScore,
      nearestStationName,
      nearestStationDistanceKm: nearestStationDistKm,
      segmentDistanceKm: Number(segDistKm.toFixed(2)),
    });
  }

  return segments;
}

function createFallbackRoute(
  origin: [number, number],
  destination: [number, number],
  stations: LiveStation[]
): RouteOption {
  // Direct multi-point interpolated line between Point A and Point B
  const [lat1, lng1] = origin;
  const [lat2, lng2] = destination;
  const STEPS = 20;

  const polyline: [number, number][] = [];
  for (let i = 0; i <= STEPS; i++) {
    const t = i / STEPS;
    polyline.push([lat1 + (lat2 - lat1) * t, lng1 + (lng2 - lng1) * t]);
  }

  const distanceKm = Number(calculateHaversineDistance(lat1, lng1, lat2, lng2).toFixed(1));
  const durationMin = Math.round((distanceKm / 30) * 60); // 30 km/h avg speed

  const segmented = segmentPolylineWithFloodRisk(polyline, stations);
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
    overallStatus: maxFloodDepthCm > 30 ? "IMPASSABLE" : maxFloodDepthCm >= 16 ? "HIGH_RISK" : maxFloodDepthCm >= 6 ? "CAUTION" : "SAFE",
    warnings: [],
  };
}
