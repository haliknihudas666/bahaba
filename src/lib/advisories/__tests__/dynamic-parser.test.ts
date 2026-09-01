// ---------------------------------------------------------------------------
// Bahaba – Dynamic Advisory Parser & Multi-Location Test Suite
// Validates dynamic extraction of all flood locations from real MMDA posts.
// ---------------------------------------------------------------------------

import { parseAdvisoryPost, parseAdvisoryPostAsync } from "../parser";
import type { RawTweetInput } from "../parser";
import { setCachedCoordinate } from "../dynamic-geocoder";
import { isAdvisoryPinVisible } from "@/types/advisory";

const MMDA_SAMPLE_POST = `
MMDA Post regarding flooding
𝐃𝐚𝐭𝐞: 𝟎𝟖-𝟐𝟗-𝟐𝟎𝟐𝟔
𝐓𝐢𝐦𝐞: 8:06 𝐏𝐌

𝐑𝐄𝐏𝐎𝐑𝐓𝐄𝐃 𝐅𝐋𝐎𝐎𝐃𝐈𝐍𝐆𝐒:

𝐕𝐀𝐋𝐄𝐍𝐙𝐔𝐄𝐋𝐀 𝐂𝐈𝐓𝐘
- MacArthur Highway fronting Goodyear/Toyota - below Gutter deep. Passable to all types of Vehicle.
- MacArthur Highway corner T. Santiago St. to G. Lazaro St. - Below Gutter Deep. Passable to all types of Vehicles.
- MacArthur Highway corner Fatima Hospital - Below Gutter Deep. Passable to all types of Vehicles
- McArthur Calle Uno EB - Gutter deep. Passable to all types of Vehicle.
-MacArthur Highway corner Pio Valenzuela St. (BBB) - Knee deep. Not Passable to Light Vehicles
-McArthur Highway A. Fernando NB/SB - Knee deep (19 inches), Not Passable to Light Vehicles

𝐌𝐀𝐍𝐃𝐀𝐋𝐔𝐘𝐎𝐍𝐆 𝐂𝐈𝐓𝐘
-Boni. Avenue cor. F. Ortigas St. - Gutter to half Knee deep. Passable to all types of Vehicle

𝐏𝐀𝐑𝐀Ñ𝐀𝐐𝐔𝐄 𝐂𝐈𝐓𝐘:
-Dr.A.Santos Ave. Near Olivarez School - Gutter to half Knee deep. Passable to all types of Vehicle.

𝐌𝐀𝐍𝐈𝐋𝐀 𝐂𝐈𝐓𝐘:
- Taft Avenue cor. Quirino Avenue (northbound) - Below Gutter deep (1-2 Inches) Passable to all types of Vehicle
- Roxas P.Ocampo Service road NB - Gutter deep (8 Inches) Passable to all types of Vehicle
- Roxas Pedro Gil NB - Gutter deep (8 Inches) Passable to all types of Vehicle
- Taft infront PGH - Gutter deep (8 Inches) Passable to all types of Vehicle
- Taft Gen.Malvar - Gutter deep (8 Inches) Passable to all types of Vehicle
- España Blvd Corner Antipolo St - Half Gutter Deep (6 Inches) Passable to all types of Vehicle
- España Blvd Corner M. Dela Fuente St. - Gutter deep (8 Inches) Passable to all types of Vehicle
- Rizal Ave. Rapa -Half Knee deep (16 Inches), Not Passable to Light Vehicles
- Jose Abad Santos Ave. Solis - Gutter deep (8 Inches) Passable to all types of Vehicle
-UN Avenue Taft NB/SB-Gutter Deep (8 inches) Passable to all types of Vehicle
-España Blvd Corner Antipolo St- below gutter deep (6 inches) Passable to all types of Vehicle
- Abad Santos cor. Tayuman St., Gutter Deep (8 inches) Passable to all types of Vehicle
-Abad Santos cor. Antipolo St- Gutter Deep (8 inches) Passable to all types of Vehicle
-Roxas blvd. NB fro pedro gil to kalaw - Half knee deep (10 inches) Passable to all types of Vehicle

𝐌𝐀𝐋𝐀𝐁𝐎𝐍 𝐂𝐈𝐓𝐘:
- F. Sevilla Blvd. (Bayan) - Half gutter to gutter deep. Passable to all types of vehicles.
- Gov. Pascual Ave (Sitio 6) - Half gutter deep. Passable to all types of vehicles
- M.H. Del Pilar St. - Gutter deep. Passable to all types of vehicles.
- Don Basilio Bautista - Gutter deep. Passable to all types of Vehicles
-Rizal Ave extn - half knee Deep (10 Inches), Passable to all types of Vehicle
-Hulong Duhat, women’s club-Gutter deep (8 Inches) Passable to all types of Vehicle.
𝐐𝐔𝐄𝐙𝐎𝐍 𝐂𝐈𝐓𝐘:
- A.Bonifacio Balintawak Cloverleaf Sb - Gutter deep (8 Inches) Passable to all types of Vehicle.
- Quezon Avenue Agham Eb - Gutter deep (8 Inches) Passable to all types of Vehicle.
- E.ROD ARANETA SB - Knee deep (19 Inches) Not Passable to Light Vehicles
- E.ROD ARANETA NB - Knee deep (19 Inches) Not Passable to Light Vehicles
- Araneta Talayan NB/SB- Waist Deep (37 Inches) Not Passable to all types of Vehicles
- Araneta Maria clara SB - half tire deep (13 Inches) Not Passable to Light Vehicles
- Araneta Maria clara NB - tire deep (26 Inches) Not Passable to all types of Vehicles
G. Araneta Sr. Avenue - Waist deep to Waist deep (37 Inches) Not Passable to all types of Vehicles
- Quezon ave. Biak na bato WB/EB-Knee Deep. Not passable to all types of vehicles

𝐌𝐀𝐑𝐈𝐊𝐈𝐍𝐀 𝐂𝐈𝐓𝐘:
- SM Marikina Marcos Highway underloop WB - Gutter deep. Passable to all types of vehicles.

𝐏𝐀𝐒𝐀𝐘 𝐂𝐈𝐓𝐘:
-EDSA Roxas Blvd. NB - Half Knee deep. Passable to all types of vehicles.
Please refresh the post for latest updates.
-Tramo (Aurora blvd) before Andrews Ave. SB - Above Gutter deep (8-9 Inches), Passable to all types of Vehicle.

𝐂𝐀𝐋𝐎𝐎𝐂𝐀𝐍 𝐂𝐈𝐓𝐘:
-C3-Road corner NLEX Connector - Gutter deep (8 Inches) Passable to all types of Vehicle.
`;

async function runTests() {
  console.log("\n────────────────────────────────────────────────────────────");
  console.log("  Testing Dynamic Multi-Location Flood Parser");
  console.log("────────────────────────────────────────────────────────────");

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, msg: string) {
    if (condition) {
      console.log(`  ✅  ${msg}`);
      passed++;
    } else {
      console.error(`  ❌  FAIL: ${msg}`);
      failed++;
    }
  }

  const rawInput: RawTweetInput = {
    id: "mmda-flood-bulletin-20260829",
    text: MMDA_SAMPLE_POST,
    author: "MMDA",
    createdAt: new Date().toISOString(),
    url: "https://x.com/MMDA/status/1961421000",
  };

  // Seed sample mock coordinate cache to test instant offline dynamic resolution
  setCachedCoordinate("MacArthur Highway", "Goodyear/Toyota", "Valenzuela", { lat: 14.7042, lng: 120.9575 });
  setCachedCoordinate("MacArthur Highway", "T. Santiago St. to G. Lazaro St.", "Valenzuela", { lat: 14.6985, lng: 120.9635 });
  setCachedCoordinate("MacArthur Highway", "Fatima Hospital", "Valenzuela", { lat: 14.6712, lng: 120.9836 });
  setCachedCoordinate("MacArthur Highway", "Calle Uno", "Valenzuela", { lat: 14.6645, lng: 120.9848 });
  setCachedCoordinate("MacArthur Highway", "Pio Valenzuela St. (BBB)", "Valenzuela", { lat: 14.6678, lng: 120.9842 });
  setCachedCoordinate("MacArthur Highway", "A. Fernando", "Valenzuela", { lat: 14.6748, lng: 120.9818 });
  setCachedCoordinate("Boni Avenue", "F. Ortigas St.", "Mandaluyong", { lat: 14.5775, lng: 121.0360 });
  setCachedCoordinate("Dr. A. Santos Ave", "Olivarez School", "Paranaque", { lat: 14.4984, lng: 120.9996 });
  setCachedCoordinate("Taft Avenue", "Quirino Avenue", "Manila", { lat: 14.5702, lng: 120.9915 });
  setCachedCoordinate("G. Araneta Avenue", "Talayan", "Quezon City", { lat: 14.6335, lng: 121.0125 });
  setCachedCoordinate("Marcos Highway", "SM Marikina Underloop", "Marikina", { lat: 14.6272, lng: 121.0858 });

  const advisory = parseAdvisoryPost(rawInput);

  // 1. In Advisory Feed / Wall: Post is represented as 1 single card (not 41 duplicate wall posts)
  assert(advisory.id === "mmda-flood-bulletin-20260829", "Advisory post has original single ID in feed");
  assert(advisory.isFloodReport === true, "Advisory is flagged as flood report");

  // 2. On the Map: All 41 flood locations are extracted into locationPins
  const pins = advisory.locationPins || [];
  assert(pins.length === 41, `Extracted all 41 flood location pins for the map (got: ${pins.length})`);

  // 3. Check Valenzuela City extractions
  const valenzuelaPins = pins.filter((p) => p.city?.toUpperCase().includes("VALENZUELA"));
  assert(valenzuelaPins.length === 6, `Valenzuela City has 6 map pins (got: ${valenzuelaPins.length})`);

  const fatimaPin = pins.find((p) => p.landmark?.includes("Fatima Hospital"));
  assert(!!fatimaPin, "Found Fatima Hospital map pin");
  assert(fatimaPin?.depthLevel === "GUTTER", "Fatima Hospital depth is GUTTER");
  assert(fatimaPin?.passability === "PASSABLE_ALL", "Fatima Hospital is PASSABLE_ALL");

  const pioValenzuelaPin = pins.find((p) => p.landmark?.includes("Pio Valenzuela"));
  assert(pioValenzuelaPin?.passability === "NOT_PASSABLE_LIGHT", "Pio Valenzuela BBB is NOT_PASSABLE_LIGHT");
  assert(pioValenzuelaPin?.depthLevel === "KNEE", "Pio Valenzuela BBB is KNEE deep");

  // 4. Check Manila City extractions
  const manilaPins = pins.filter((p) => p.city?.toUpperCase().includes("MANILA"));
  assert(manilaPins.length === 14, `Manila City has 14 map pins (got: ${manilaPins.length})`);

  const quirinoPin = pins.find((p) => p.landmark?.includes("Quirino"));
  assert(quirinoPin?.direction === "NB", "Taft Quirino direction is NB");
  assert(quirinoPin?.depthInches === 2, `Taft Quirino parsed explicit 1-2 inches as 2" (got: ${quirinoPin?.depthInches})`);

  // 5. Check Quezon City extractions
  const qcPins = pins.filter((p) => p.city?.toUpperCase().includes("QUEZON"));
  assert(qcPins.length === 9, `Quezon City has 9 map pins (got: ${qcPins.length})`);

  const talayanPin = pins.find((p) => p.landmark?.includes("Talayan"));
  assert(talayanPin?.depthLevel === "WAIST", "Araneta Talayan is WAIST deep");
  assert(talayanPin?.depthInches === 37, `Araneta Talayan has 37" depth (got: ${talayanPin?.depthInches})`);
  assert(talayanPin?.passability === "NOT_PASSABLE_ALL", "Araneta Talayan is NOT_PASSABLE_ALL");
  assert(talayanPin?.severity === "CRITICAL", "Araneta Talayan severity is CRITICAL");

  // 6. Check Malabon extractions
  const malabonPins = pins.filter((p) => p.city?.toUpperCase().includes("MALABON"));
  assert(malabonPins.length === 6, `Malabon City has 6 map pins (got: ${malabonPins.length})`);

  // 7. Check unique pin ID generation for each map marker
  const uniquePinIds = new Set(pins.map((p) => p.id));
  assert(uniquePinIds.size === pins.length, `All ${pins.length} map pins have distinct unique IDs`);

  // 8. Verify Advisory Visibility on Map
  assert(isAdvisoryPinVisible(advisory) === true, "Advisory with locationPins is visible on map");

  // 9. Check single tweet parsing fallback
  const singleTweet: RawTweetInput = {
    id: "single-1",
    text: "MMDA FLOOD ALERT: As of 8:30 PM, España Blvd. cor. Antipolo St. is Gutter deep. Passable to all types of vehicles.",
    author: "MMDA",
    createdAt: new Date().toISOString(),
    url: "https://x.com/MMDA/status/1961429999",
  };
  const singleParsed = parseAdvisoryPost(singleTweet);
  assert(singleParsed.id === "single-1", "Single tweet parsed as 1 advisory");
  assert(singleParsed.depthLevel === "GUTTER", "Single tweet parsed depth as GUTTER");
  assert(singleParsed.passability === "PASSABLE_ALL", "Single tweet passability is PASSABLE_ALL");

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
