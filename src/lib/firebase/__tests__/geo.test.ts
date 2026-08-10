// ---------------------------------------------------------------------------
// Bahaba – Firebase Geo Engine Unit Tests
// ---------------------------------------------------------------------------

import { computeGeohash, calculateHaversineDistance } from "../geo-utils";
import { getStationCoords, slugifyStationId } from "../station-coords";

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion Failed: ${message}`);
  }
}

console.log("────────────────────────────────────────────────────────────");
console.log("  Testing Station Coordinates & Geohash Utilities");
console.log("────────────────────────────────────────────────────────────");

// 1. Test slugifyStationId
const slug1 = slugifyStationId("Sto. Niño");
assert(slug1 === "sto-nino", `Expected 'sto-nino', got '${slug1}'`);
console.log("  ✅  slugifyStationId('Sto. Niño') -> 'sto-nino'");

const slug2 = slugifyStationId("Nangka River Station");
assert(slug2 === "nangka-river-station", `Expected 'nangka-river-station', got '${slug2}'`);
console.log("  ✅  slugifyStationId('Nangka River Station') -> 'nangka-river-station'");

// 2. Test getStationCoords
const coordsStoNino = getStationCoords("Sto. Niño");
assert(coordsStoNino.lat === 14.6334 && coordsStoNino.lng === 121.0945, "Sto. Niño coords mismatch");
console.log("  ✅  getStationCoords('Sto. Niño') resolves correctly");

const coordsFuzzy = getStationCoords("Marikina Floodway");
assert(coordsFuzzy.lat !== 0 && coordsFuzzy.lng !== 0, "Fuzzy match returned invalid coords");
console.log("  ✅  getStationCoords fuzzy match works");

// 3. Test computeGeohash
const geohash = computeGeohash(14.6334, 121.0945);
assert(typeof geohash === "string" && geohash.length > 5, "Geohash string invalid");
console.log(`  ✅  computeGeohash(14.6334, 121.0945) -> '${geohash}'`);

// 4. Test calculateHaversineDistance
// Distance between Sto. Niño (14.6334, 121.0945) and Nangka (14.6698, 121.1092) is ~4.3 km
const distKm = calculateHaversineDistance(14.6334, 121.0945, 14.6698, 121.1092);
assert(distKm > 4.0 && distKm < 4.6, `Expected ~4.3 km, got ${distKm}`);
console.log(`  ✅  calculateHaversineDistance -> ${distKm.toFixed(2)} km`);

console.log("\n════════════════════════════════════════════════════════════");
console.log("  All Geo & Station utility tests passed!");
console.log("════════════════════════════════════════════════════════════\n");
