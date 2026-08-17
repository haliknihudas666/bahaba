import type { NoahRoadSegment } from "@/types/flood-engine";
import noahRoadsDataset from "@/lib/data/noah-roads.json";

export type BoundingBoxTuple = [number, number, number, number]; // [south, west, north, east]

export interface BoundingBoxObject {
  south: number;
  west: number;
  north: number;
  east: number;
}

export type BoundingBoxInput = BoundingBoxTuple | BoundingBoxObject;

/**
 * Normalizes input bounding box into standardized { south, west, north, east } bounds.
 */
function normalizeBBox(bbox: BoundingBoxInput): BoundingBoxObject {
  if (Array.isArray(bbox)) {
    const [south, west, north, east] = bbox;
    return {
      south: Math.min(south, north),
      west: Math.min(west, east),
      north: Math.max(south, north),
      east: Math.max(west, east),
    };
  }

  return {
    south: Math.min(bbox.south, bbox.north),
    west: Math.min(bbox.west, bbox.east),
    north: Math.max(bbox.south, bbox.north),
    east: Math.max(bbox.west, bbox.east),
  };
}

/**
 * Computes spatial bounding box [minLng, minLat, maxLng, maxLat] for a road LineString.
 */
export function getRoadBBox(coordinates: [number, number][]): [number, number, number, number] {
  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of coordinates) {
    if (lng < minLng) minLng = lng;
    if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Checks if a road segment intersects or falls within the target Leaflet viewport bounding box.
 */
export function isRoadInBBox(road: NoahRoadSegment, bboxInput: BoundingBoxInput): boolean {
  if (!road.coordinates || road.coordinates.length === 0) return false;

  const { south, west, north, east } = normalizeBBox(bboxInput);
  const [roadMinLng, roadMinLat, roadMaxLng, roadMaxLat] = getRoadBBox(road.coordinates);

  // Fast Bounding-Box Overlap / Intersection Test
  const latIntersects = roadMaxLat >= south && roadMinLat <= north;
  const lngIntersects = roadMaxLng >= west && roadMinLng <= east;

  return latIntersects && lngIntersects;
}

/**
 * Queries pre-processed Project NOAH road objects within a Leaflet bounding box ([south, west, north, east]).
 * 
 * @param bbox Leaflet bounding box [south, west, north, east] or { south, west, north, east }
 * @param roads Optional custom array of NoahRoadSegment features (defaults to local NOAH dataset)
 * @returns Filtered array of NoahRoadSegment objects in the active viewport
 */
export function getRoadsInBBox(
  bbox: BoundingBoxInput,
  roads: NoahRoadSegment[] = noahRoadsDataset as NoahRoadSegment[]
): NoahRoadSegment[] {
  if (!bbox) return [];

  const activeRoads = Array.isArray(roads) && roads.length > 0
    ? roads
    : (noahRoadsDataset as NoahRoadSegment[]);

  return activeRoads.filter((road) => isRoadInBBox(road, bbox));
}
