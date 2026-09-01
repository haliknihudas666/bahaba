// ---------------------------------------------------------------------------
// Bahaba (Baha ba? / "Is It Flooded?") – Elevation Lookup API Endpoint
//
// GET /api/flood/elevation?lat=14.60&lng=120.99
// GET /api/flood/elevation?coords=14.60,120.99;14.61,121.00
// ---------------------------------------------------------------------------

import { NextResponse } from "next/server";
import { getElevation, getElevationsForCoordinates } from "@/lib/elevation";

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const latStr = url.searchParams.get("lat");
    const lngStr = url.searchParams.get("lng");
    const coordsStr = url.searchParams.get("coords");

    if (latStr && lngStr) {
      const lat = parseFloat(latStr);
      const lng = parseFloat(lngStr);
      if (isNaN(lat) || isNaN(lng)) {
        return NextResponse.json({ error: "Invalid lat/lng parameters" }, { status: 400 });
      }
      const elevationM = await getElevation(lat, lng);
      return NextResponse.json({ lat, lng, elevationM });
    }

    if (coordsStr) {
      const pairs = coordsStr.split(";").map((pair) => {
        const [lat, lng] = pair.split(",").map(Number);
        return [lat, lng] as [number, number];
      }).filter(([lat, lng]) => !isNaN(lat) && !isNaN(lng));

      if (pairs.length === 0) {
        return NextResponse.json({ error: "No valid coordinate pairs provided" }, { status: 400 });
      }

      const elevations = await getElevationsForCoordinates(pairs);
      return NextResponse.json({
        elevations: pairs.map(([lat, lng], idx) => ({
          lat,
          lng,
          elevationM: elevations[idx],
        })),
      });
    }

    return NextResponse.json({ error: "Missing lat/lng or coords parameter" }, { status: 400 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Elevation query failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
