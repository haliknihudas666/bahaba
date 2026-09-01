// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – UP Project NOAH Hazard Store & Service
//
// Manages UP Project NOAH 100-Year Flood Hazard classifications (`Var` 1, 2, 3)
// across Metro Manila and major river basins & coastal plains nationwide.
//
// NOAH Hazard Scale (from PMTiles `flood_100yr` polygon attribute `Var`):
//   • Var = 1 (Low Hazard): 0 – 0.5m flood depth / 5-yr return period equivalent
//   • Var = 2 (Medium Hazard): >0.5 – 1.5m flood depth / 25-yr return period equivalent
//   • Var = 3 (High Hazard): >1.5m flood depth / 100-yr return period equivalent (depth + velocity)
// ---------------------------------------------------------------------------

import noahRoadsDataset from "@/lib/data/noah-roads.json";
import type { NoahRoadSegment } from "@/types/flood-engine";
import { NOAH_DEPTH_TABLE, NOAH_DESIGN_STORM_MM_HR } from "@/types/flood-engine";

export interface NoahHotspotNode {
  name: string;
  region: string;
  lat: number;
  lng: number;
  noahLevel: 1 | 2 | 3;
  elevationM: number;
  drainage: number;
  description?: string;
}

/**
 * Nationwide UP Project NOAH flood hazard reference nodes across the Philippines
 */
export const NOAH_PHILIPPINES_HOTSPOTS: NoahHotspotNode[] = [
  // ── 1. METRO MANILA (NCR) ────────────────────────────────────────────────
  { name: "España Blvd / UST", region: "NCR", lat: 14.6065, lng: 120.9895, noahLevel: 3, elevationM: 2.2, drainage: 20 },
  { name: "Sampaloc / Lacson", region: "NCR", lat: 14.6090, lng: 120.9950, noahLevel: 3, elevationM: 2.5, drainage: 20 },
  { name: "Taft Ave / PGH", region: "NCR", lat: 14.5775, lng: 120.9880, noahLevel: 2, elevationM: 2.8, drainage: 25 },
  { name: "Rizal Ave / Blumentritt", region: "NCR", lat: 14.6230, lng: 120.9840, noahLevel: 3, elevationM: 2.0, drainage: 20 },
  { name: "Marikina River Park", region: "NCR", lat: 14.6335, lng: 121.0965, noahLevel: 3, elevationM: 5.0, drainage: 20 },
  { name: "Sto. Niño Marikina", region: "NCR", lat: 14.6465, lng: 121.1010, noahLevel: 3, elevationM: 6.5, drainage: 20 },
  { name: "Tumana Marikina", region: "NCR", lat: 14.6620, lng: 121.1080, noahLevel: 3, elevationM: 7.0, drainage: 18 },
  { name: "Nangka Marikina", region: "NCR", lat: 14.6750, lng: 121.1160, noahLevel: 3, elevationM: 8.0, drainage: 18 },
  { name: "Provident Village", region: "NCR", lat: 14.6220, lng: 121.0920, noahLevel: 3, elevationM: 4.8, drainage: 18 },
  { name: "Malabon City Center", region: "NCR", lat: 14.6625, lng: 120.9570, noahLevel: 3, elevationM: 1.2, drainage: 15 },
  { name: "Navotas Coastal Basin", region: "NCR", lat: 14.6580, lng: 120.9450, noahLevel: 3, elevationM: 0.8, drainage: 15 },
  { name: "Tullahan River Valenzuela", region: "NCR", lat: 14.6850, lng: 120.9750, noahLevel: 3, elevationM: 3.5, drainage: 20 },
  { name: "Polo Valenzuela", region: "NCR", lat: 14.7120, lng: 120.9500, noahLevel: 2, elevationM: 2.5, drainage: 20 },
  { name: "San Juan River Confluence", region: "NCR", lat: 14.5950, lng: 121.0250, noahLevel: 3, elevationM: 3.5, drainage: 22 },
  { name: "E. Rodriguez Sr. Ave", region: "NCR", lat: 14.6210, lng: 121.0280, noahLevel: 2, elevationM: 8.0, drainage: 25 },
  { name: "Araneta Ave / Talayan", region: "NCR", lat: 14.6310, lng: 121.0080, noahLevel: 3, elevationM: 4.0, drainage: 20 },
  { name: "EDSA / Santolan", region: "NCR", lat: 14.6080, lng: 121.0560, noahLevel: 2, elevationM: 12.0, drainage: 25 },
  { name: "Pasig City Hall / Kapasigan", region: "NCR", lat: 14.5610, lng: 121.0820, noahLevel: 2, elevationM: 4.5, drainage: 25 },
  { name: "Manggahan Floodway", region: "NCR", lat: 14.5820, lng: 121.1030, noahLevel: 3, elevationM: 4.0, drainage: 20 },
  { name: "C6 / Taguig Lakeshore", region: "NCR", lat: 14.5150, lng: 121.0750, noahLevel: 3, elevationM: 2.5, drainage: 18 },
  { name: "Shaw Blvd / Kalentong", region: "NCR", lat: 14.5880, lng: 121.0290, noahLevel: 2, elevationM: 4.0, drainage: 25 },
  { name: "Parañaque River / Sucat", region: "NCR", lat: 14.4550, lng: 121.0450, noahLevel: 2, elevationM: 3.0, drainage: 22 },
  { name: "Alabang / Zapote Road", region: "NCR", lat: 14.4420, lng: 120.9980, noahLevel: 2, elevationM: 4.0, drainage: 22 },

  // ── 2. CENTRAL LUZON (Region III - Pampanga & Bulacan River Basins) ─────
  { name: "Calumpit Bulacan / Pampanga Delta", region: "Region III", lat: 14.9180, lng: 120.7650, noahLevel: 3, elevationM: 2.5, drainage: 18 },
  { name: "Hagonoy Bulacan Coastal", region: "Region III", lat: 14.8330, lng: 120.7330, noahLevel: 3, elevationM: 1.5, drainage: 15 },
  { name: "Meycauayan River Corridor", region: "Region III", lat: 14.7380, lng: 120.9600, noahLevel: 3, elevationM: 3.0, drainage: 20 },
  { name: "Marilao Bulacan Basin", region: "Region III", lat: 14.7580, lng: 120.9500, noahLevel: 3, elevationM: 3.2, drainage: 20 },
  { name: "San Fernando Pampanga / Dolores", region: "Region III", lat: 15.0330, lng: 120.6850, noahLevel: 3, elevationM: 4.0, drainage: 20 },
  { name: "Candaba Swamp / Pampanga Basin", region: "Region III", lat: 15.0920, lng: 120.8250, noahLevel: 3, elevationM: 2.0, drainage: 15 },
  { name: "Guagua & Sasmuan Delta", region: "Region III", lat: 14.9660, lng: 120.6330, noahLevel: 3, elevationM: 1.8, drainage: 16 },

  // ── 3. ILOCOS & PANGASINAN (Region I - Agno River Basin) ────────────────
  { name: "Dagupan City Center / Pantal River", region: "Region I", lat: 16.0430, lng: 120.3340, noahLevel: 3, elevationM: 1.5, drainage: 16 },
  { name: "Calasiao Pangasinan", region: "Region I", lat: 16.0120, lng: 120.3580, noahLevel: 3, elevationM: 3.0, drainage: 18 },
  { name: "Lingayen Agno River Delta", region: "Region I", lat: 16.0220, lng: 120.2310, noahLevel: 2, elevationM: 2.5, drainage: 22 },

  // ── 4. CAGAYAN VALLEY (Region II - Cagayan River Basin) ─────────────────
  { name: "Tuguegarao City / Cagayan River", region: "Region II", lat: 17.6130, lng: 121.7270, noahLevel: 3, elevationM: 12.0, drainage: 18 },
  { name: "Ilagan Isabela Floodplain", region: "Region II", lat: 17.1480, lng: 121.8900, noahLevel: 3, elevationM: 18.0, drainage: 20 },
  { name: "Aparri Cagayan River Mouth", region: "Region II", lat: 18.3580, lng: 121.6420, noahLevel: 3, elevationM: 1.8, drainage: 16 },

  // ── 5. CALABARZON (Region IV-A - Laguna Lake & Cavite Basins) ───────────
  { name: "Bacoor Coastal / Zapote River", region: "Region IV-A", lat: 14.4600, lng: 120.9400, noahLevel: 3, elevationM: 2.0, drainage: 20 },
  { name: "Kawit & Noveleta Cavite Basin", region: "Region IV-A", lat: 14.4450, lng: 120.8950, noahLevel: 3, elevationM: 1.5, drainage: 18 },
  { name: "Biñan & Santa Rosa Lakeshore", region: "Region IV-A", lat: 14.3150, lng: 121.1100, noahLevel: 2, elevationM: 4.5, drainage: 22 },
  { name: "San Pedro Laguna Lakeshore", region: "Region IV-A", lat: 14.3650, lng: 121.0550, noahLevel: 2, elevationM: 3.5, drainage: 22 },

  // ── 6. BICOL REGION (Region V - Bicol River Basin) ──────────────────────
  { name: "Naga City / Bicol River Basin", region: "Region V", lat: 13.6218, lng: 123.1948, noahLevel: 3, elevationM: 4.5, drainage: 18 },
  { name: "Milaor & Libmanan Floodplains", region: "Region V", lat: 13.5850, lng: 123.1700, noahLevel: 3, elevationM: 3.0, drainage: 16 },
  { name: "Legazpi City / Albay Gulf Basin", region: "Region V", lat: 13.1390, lng: 123.7438, noahLevel: 2, elevationM: 5.0, drainage: 22 },

  // ── 7. WESTERN VISAYAS (Region VI - Iloilo & Jalaur River Basins) ───────
  { name: "Iloilo City / Jaro River Corridor", region: "Region VI", lat: 10.7200, lng: 122.5600, noahLevel: 3, elevationM: 2.5, drainage: 20 },
  { name: "Pavia & Santa Barbara Iloilo", region: "Region VI", lat: 10.7750, lng: 122.5400, noahLevel: 3, elevationM: 5.0, drainage: 18 },
  { name: "Bacolod City / Banago Coastal", region: "Region VI", lat: 10.6765, lng: 122.9510, noahLevel: 2, elevationM: 4.0, drainage: 22 },

  // ── 8. CENTRAL VISAYAS (Region VII - Metro Cebu Corridors) ──────────────
  { name: "Mandaue City / Subangdaku River", region: "Region VII", lat: 10.3235, lng: 123.9320, noahLevel: 3, elevationM: 3.0, drainage: 20 },
  { name: "Downtown Cebu / Colon St Basin", region: "Region VII", lat: 10.2970, lng: 123.9015, noahLevel: 3, elevationM: 3.5, drainage: 20 },
  { name: "Talisay City / Mananga River", region: "Region VII", lat: 10.2520, lng: 123.8450, noahLevel: 2, elevationM: 4.0, drainage: 22 },
  { name: "Mactan Island Lowland", region: "Region VII", lat: 10.3150, lng: 123.9800, noahLevel: 1, elevationM: 6.0, drainage: 25 },

  // ── 9. EASTERN VISAYAS (Region VIII - Leyte Floodplains) ────────────────
  { name: "Tacloban City Downtown & Coastal", region: "Region VIII", lat: 11.2440, lng: 125.0040, noahLevel: 3, elevationM: 2.0, drainage: 20 },
  { name: "Ormoc City / Anilao River Basin", region: "Region VIII", lat: 11.0050, lng: 124.6070, noahLevel: 3, elevationM: 5.0, drainage: 18 },

  // ── 10. NORTHERN MINDANAO (Region X - CDO & Mandulog River Basins) ──────
  { name: "Cagayan de Oro River / Isla de Oro", region: "Region X", lat: 8.4820, lng: 124.6470, noahLevel: 3, elevationM: 5.0, drainage: 20 },
  { name: "Iligan City / Mandulog River", region: "Region X", lat: 8.2280, lng: 124.2450, noahLevel: 3, elevationM: 4.5, drainage: 18 },

  // ── 11. DAVAO REGION (Region XI - Davao & Matina River Basins) ──────────
  { name: "Davao River / Jade Valley", region: "Region XI", lat: 7.0850, lng: 125.5950, noahLevel: 3, elevationM: 6.0, drainage: 18 },
  { name: "Matina Pangi / Crossing Davao", region: "Region XI", lat: 7.0580, lng: 125.5750, noahLevel: 3, elevationM: 5.0, drainage: 20 },
  { name: "Tagum City / Libuganon River", region: "Region XI", lat: 7.4470, lng: 125.8080, noahLevel: 3, elevationM: 8.0, drainage: 18 },

  // ── 12. CARAGA REGION (Region XIII - Agusan River Basin) ────────────────
  { name: "Butuan City / Agusan River Delta", region: "Region XIII", lat: 8.9515, lng: 125.5440, noahLevel: 3, elevationM: 3.0, drainage: 16 },

  // ── 13. SOCCSKSARGEN & BARMM (Cotabato & Rio Grande de Mindanao) ────────
  { name: "Cotabato City / Rio Grande de Mindanao", region: "BARMM", lat: 7.2230, lng: 124.2460, noahLevel: 3, elevationM: 2.5, drainage: 16 },
  { name: "Tamontaka River / Maguindanao", region: "BARMM", lat: 7.1850, lng: 124.2150, noahLevel: 3, elevationM: 2.0, drainage: 16 },
];

/** Alias for backward compatibility */
export const NOAH_METRO_MANILA_HOTSPOTS = NOAH_PHILIPPINES_HOTSPOTS;

/**
 * Computes Haversine distance in km
 */
function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

/**
 * Get all monitored NOAH road segments
 */
export function getNoahRoadSegments(): NoahRoadSegment[] {
  return noahRoadsDataset as NoahRoadSegment[];
}

/**
 * Find the nearest NOAH flood hazard baseline for any coordinate across the Philippines.
 */
export function getNearestNoahHazard(lat: number, lng: number): {
  noahLevel: number;
  elevationM: number;
  drainageCapacity: number;
  nearestHotspotName?: string;
  region?: string;
  distanceKm: number;
} {
  let nearestDist = Infinity;
  let nearestNode = NOAH_PHILIPPINES_HOTSPOTS[0];

  for (const spot of NOAH_PHILIPPINES_HOTSPOTS) {
    const d = haversineKm(lat, lng, spot.lat, spot.lng);
    if (d < nearestDist) {
      nearestDist = d;
      nearestNode = spot;
    }
  }

  // If within 6.0km of a major nationwide hazard zone, adopt its NOAH hazard parameters
  if (nearestDist <= 6.0) {
    return {
      noahLevel: nearestNode.noahLevel,
      elevationM: nearestNode.elevationM,
      drainageCapacity: nearestNode.drainage,
      nearestHotspotName: nearestNode.name,
      region: nearestNode.region,
      distanceKm: Math.round(nearestDist * 100) / 100,
    };
  }

  // If within 15km, blend hazard level
  if (nearestDist <= 15.0) {
    return {
      noahLevel: Math.max(1, nearestNode.noahLevel - 1),
      elevationM: Math.max(5.0, nearestNode.elevationM + 2.0),
      drainageCapacity: 25,
      nearestHotspotName: nearestNode.name,
      region: nearestNode.region,
      distanceKm: Math.round(nearestDist * 100) / 100,
    };
  }

  // General nationwide default baseline for Philippine roads outside known river basins
  return {
    noahLevel: 1,
    elevationM: 10.0,
    drainageCapacity: 25,
    distanceKm: Math.round(nearestDist * 100) / 100,
  };
}

export { NOAH_DEPTH_TABLE, NOAH_DESIGN_STORM_MM_HR };
