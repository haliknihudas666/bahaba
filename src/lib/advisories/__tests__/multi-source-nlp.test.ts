// ---------------------------------------------------------------------------
// Bahaba – Multi-Source NLP & Geocoding Test Suite
// Tests natural language flood post parsing, landmark reverse searching,
// Nepal/foreign flood filtering, and map pin visibility.
// ---------------------------------------------------------------------------

import { parseAdvisoryPostAsync, isInternationalOrForeignEvent, extractConversationalEntities } from "../parser";
import { isAdvisoryPinVisible } from "@/types/advisory";
import { isValidPhilippineCoordinate } from "../dynamic-geocoder";

async function runTests() {
  console.log("\n────────────────────────────────────────────────────────────");
  console.log("  Testing Multi-Source Advisory NLP & Geocoding Engine");
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

  // ── Test 1: Pegasus in Quezon City (Conversational News Post) ──────────
  console.log("\n[Test 1] Pegasus in Quezon City (Conversational)");
  const pegasusPost = {
    id: "news_pegasus_001",
    text: "There is a knee level deep near Pegasus in Quezon City as heavy rains continue to affect motorists.",
    author: "ABSCBNNews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/ABSCBNNews/status/news_pegasus_001",
  };

  const pegasusAdvisory = await parseAdvisoryPostAsync(pegasusPost);
  assert(pegasusAdvisory.source === "NEWS", "Source classified as NEWS");
  assert(pegasusAdvisory.isFloodReport === true, "Identified as flood report");
  assert(pegasusAdvisory.depthLevel === "KNEE", "Depth level extracted as KNEE");
  assert(pegasusAdvisory.depthInches === 19, "Depth inches is ~19 inches");
  assert(pegasusAdvisory.passability === "NOT_PASSABLE_LIGHT", "Passability is NOT_PASSABLE_LIGHT");
  assert(pegasusAdvisory.landmark === "Pegasus", "Landmark extracted as Pegasus");
  assert(pegasusAdvisory.coordinates !== null, "Coordinates successfully geocoded");
  if (pegasusAdvisory.coordinates) {
    const { lat, lng } = pegasusAdvisory.coordinates;
    assert(isValidPhilippineCoordinate(lat, lng), "Coordinates inside Philippines");
    assert(lat >= 14.62 && lat <= 14.65 && lng >= 121.01 && lng <= 121.03, "Resolved near Pegasus (Quezon Ave / Sct. Chuatoco)");
  }
  assert(pegasusAdvisory.locationPins?.length === 1, "Generated 1 map location pin");
  assert(isAdvisoryPinVisible(pegasusAdvisory) === true, "Visible on map as flood alert pin");

  // ── Test 2: Foreign Disaster Filter (Nepal Flooding) ──────────────────
  console.log("\n[Test 2] Foreign Disaster Filter (Nepal Floods)");
  const nepalPost = {
    id: "news_nepal_001",
    text: "LOOK: At least 40 people were killed after heavy monsoon rains triggered catastrophic flooding and landslides across Nepal, including the capital Kathmandu.",
    author: "gmanews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/gmanews/status/news_nepal_001",
  };

  assert(isInternationalOrForeignEvent(nepalPost.text) === true, "isInternationalOrForeignEvent returns true for Nepal");
  const nepalAdvisory = await parseAdvisoryPostAsync(nepalPost);
  assert(nepalAdvisory.isFloodReport === false, "Nepal post rejected as domestic flood report");
  assert(nepalAdvisory.coordinates === null, "No coordinates assigned for foreign event");
  assert(nepalAdvisory.locationPins === undefined, "No location pins created for foreign event");
  assert(isAdvisoryPinVisible(nepalAdvisory) === false, "Hidden from Philippine map overlay");

  // ── Test 3: Other International Disasters Filter ───────────────────────
  console.log("\n[Test 3] International Noise Filtering (Spain, Bangladesh)");
  const spainPost = "Deadly floods strike Valencia, Spain as torrential rain leaves thousands stranded.";
  const bangladeshPost = "Severe flooding submerges villages in northern Bangladesh after dam release.";
  assert(isInternationalOrForeignEvent(spainPost) === true, "Valencia, Spain rejected as foreign");
  assert(isInternationalOrForeignEvent(bangladeshPost) === true, "Bangladesh rejected as foreign");

  // ── Test 4: Fatima University in Valenzuela (Tagalog News Post) ────────
  console.log("\n[Test 4] Fatima University along MacArthur Hwy, Valenzuela");
  const fatimaPost = {
    id: "news_fatima_002",
    text: "Baha ngayon sa tapat ng Fatima University sa MacArthur Highway, Valenzuela hanggang tuhod ang tubig.",
    author: "News5PH",
    createdAt: new Date().toISOString(),
    url: "https://x.com/News5PH/status/news_fatima_002",
  };

  const fatimaAdvisory = await parseAdvisoryPostAsync(fatimaPost);
  assert(fatimaAdvisory.isFloodReport === true, "Identified as flood report");
  assert(fatimaAdvisory.roadName === "MacArthur Highway", "Road extracted as MacArthur Highway");
  assert(fatimaAdvisory.landmark === "Fatima University", "Landmark extracted as Fatima University");
  assert(fatimaAdvisory.depthLevel === "KNEE", "Tagalog 'hanggang tuhod' mapped to KNEE");
  assert(fatimaAdvisory.coordinates !== null, "Fatima University geocoded successfully");
  if (fatimaAdvisory.coordinates) {
    const { lat, lng } = fatimaAdvisory.coordinates;
    assert(lat >= 14.66 && lat <= 14.69 && lng >= 120.97 && lng <= 120.99, "Coordinates locate Fatima Valenzuela");
  }
  assert(isAdvisoryPinVisible(fatimaAdvisory) === true, "Visible on map");

  // ── Test 5: Subsided Flood Report (Araneta Avenue, QC) ─────────────────
  console.log("\n[Test 5] Subsided Flood Report");
  const subsidedPost = {
    id: "news_subsided_003",
    text: "UPDATE: Subsided na ang tubig baha sa G. Araneta Avenue sa Quezon City. Passable to all vehicles.",
    author: "inquirerdotnet",
    createdAt: new Date().toISOString(),
    url: "https://x.com/inquirerdotnet/status/news_subsided_003",
  };

  const subsidedAdvisory = await parseAdvisoryPostAsync(subsidedPost);
  assert(subsidedAdvisory.source === "NEWS", "Inquirer classified as NEWS");
  assert(subsidedAdvisory.status === "SUBSIDED", "Status marked as SUBSIDED");
  assert(subsidedAdvisory.depthLevel === "SUBSIDED", "Depth marked as SUBSIDED");
  assert(subsidedAdvisory.passability === "SUBSIDED", "Passability marked as SUBSIDED");
  assert(subsidedAdvisory.badgeColor === "green", "Badge color is green for subsided");

  // ── Test 6: Conversational Entity Extractor Unit Tests ──────────────────
  console.log("\n[Test 6] Conversational Entity Extractor Patterns");
  const ent1 = extractConversationalEntities("There is a knee level deep near Pegasus in Quezon City");
  assert(ent1.landmark === "Pegasus", "Extracted Pegasus");
  assert(ent1.city === "Quezon City", "Extracted Quezon City");

  const ent2 = extractConversationalEntities("Baha sa tapat ng UST sa España, Maynila");
  assert(ent2.landmark === "UST", "Extracted UST");
  assert(ent2.roadName === "España Blvd", "Extracted España Blvd");
  assert(ent2.city === "Manila", "Extracted Manila");

  const ent3 = extractConversationalEntities("Gutter deep flood along Taft Avenue corner Pedro Gil in Manila");
  assert(ent3.roadName === "Taft Avenue", "Extracted Taft Avenue");
  assert(ent3.landmark === "Pedro Gil", "Extracted Pedro Gil");
  assert(ent3.city === "Manila", "Extracted Manila");

  // ── Test 7: Contextual News vs Real Flood Filtering (User Screenshot Scenarios) ──
  console.log("\n[Test 7] Contextual News Filtering (No Fake 'Passable to All' or Map Pins)");

  // Scenario A: Imus Retarding Basin (Infrastructure project)
  const imusProjectPost = {
    id: "news_imus_basin_001",
    text: "DPWH Sec. Vince Dizon said the Imus Retarding Basin is a good example of an effective flood-control project, having saved low-lying areas from disaster.",
    author: "gmanews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/gmanews/status/news_imus_basin_001",
  };
  const imusAdvisory = await parseAdvisoryPostAsync(imusProjectPost);
  assert(imusAdvisory.isFloodReport === false, "Imus retarding basin project is NOT an active flood incident");
  assert(imusAdvisory.passabilityLabel === "News Report", "Passability label is 'News Report' (NOT 'Passable to All Vehicles')");
  assert(imusAdvisory.coordinates === null, "No map coordinates generated");
  assert(isAdvisoryPinVisible(imusAdvisory) === false, "Hidden from map pins");
  assert(imusAdvisory.authorName === "GMA News", "Author name is 'GMA News'");
  assert(imusAdvisory.authorHandle === "gmanews", "Author handle is 'gmanews'");

  // Scenario B: Antipolo Bishop Statement (Political / Commentary)
  const antipoloBishopPost = {
    id: "news_antipolo_bishop_002",
    text: "Antipolo bishop urges Pinoys to scrutinize leaders ahead of elections amid flooding Read more: https://news.abs-cbn.com",
    author: "ABSCBNNews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/ABSCBNNews/status/news_antipolo_bishop_002",
  };
  const bishopAdvisory = await parseAdvisoryPostAsync(antipoloBishopPost);
  assert(bishopAdvisory.isFloodReport === false, "Bishop election commentary is NOT an active flood incident");
  assert(bishopAdvisory.passabilityLabel === "News Report", "Passability label is 'News Report'");
  assert(isAdvisoryPinVisible(bishopAdvisory) === false, "Hidden from map pins");
  assert(bishopAdvisory.authorName === "ABS-CBN News", "Author name is 'ABS-CBN News'");
  assert(bishopAdvisory.authorHandle === "ABSCBNNews", "Author handle is 'ABSCBNNews'");

  // Scenario C: Rodriguez Two-Storey Houses Proposal (Government policy)
  const rodriguezMayorPost = {
    id: "news_rodriguez_mayor_003",
    text: "Rodriguez, Rizal, Mayor Ronnie Evangelista on Monday proposed that residents build two-storey houses as the town's long-term solution to recurring floods.",
    author: "manilabulletin",
    createdAt: new Date().toISOString(),
    url: "https://x.com/manilabulletin/status/news_rodriguez_mayor_003",
  };
  const rodriguezAdvisory = await parseAdvisoryPostAsync(rodriguezMayorPost);
  assert(rodriguezAdvisory.isFloodReport === false, "Mayor building proposal is NOT an active flood incident");
  assert(rodriguezAdvisory.passabilityLabel === "News Report", "Passability label is 'News Report'");
  assert(isAdvisoryPinVisible(rodriguezAdvisory) === false, "Hidden from map pins");
  assert(rodriguezAdvisory.authorName === "Manila Bulletin", "Author name is 'Manila Bulletin'");
  assert(rodriguezAdvisory.authorHandle === "manilabulletin", "Author handle is 'manilabulletin'");

  // Scenario D: Sunog Apog Pumping Station Security (Security deployment)
  const tondoStationPost = {
    id: "news_tondo_station_004",
    text: "LOOK: The Philippine Coast Guard (PCG) deploys personnel to secure the Sunog Apog Pumping Station in Tondo, Manila, ahead of the typhoon.",
    author: "News5PH",
    createdAt: new Date().toISOString(),
    url: "https://x.com/News5PH/status/news_tondo_station_004",
  };
  const tondoAdvisory = await parseAdvisoryPostAsync(tondoStationPost);
  assert(tondoAdvisory.isFloodReport === false, "Pumping station security guard is NOT an active flood incident");
  assert(tondoAdvisory.passabilityLabel === "News Report", "Passability label is 'News Report'");
  assert(isAdvisoryPinVisible(tondoAdvisory) === false, "Hidden from map pins");
  assert(tondoAdvisory.authorName === "News5", "Author name is 'News5'");
  assert(tondoAdvisory.authorHandle === "News5PH", "Author handle is 'News5PH'");

  // ── Test 8: Author Resolution from URLs and Content ─────────────────────
  console.log("\n[Test 8] Author Resolution from URLs and Content");

  // Post with generic author "NEWS" but postUrl from Inquirer
  const inquirerByUrl = await parseAdvisoryPostAsync({
    id: "news_url_inq_001",
    text: "Sotto seeks Senate probe into typhoon impacts, disaster mitigation",
    author: "NEWS",
    createdAt: new Date().toISOString(),
    url: "https://x.com/inquirerdotnet/status/1962381283",
  });
  assert(inquirerByUrl.authorName === "Inquirer", "Inferred Inquirer from post URL");
  assert(inquirerByUrl.authorHandle === "inquirerdotnet", "Inferred @inquirerdotnet handle from post URL");

  // Post with completely unknown author and non-branded URL
  const anonymousNews = await parseAdvisoryPostAsync({
    id: "news_anon_002",
    text: "Classes suspended in several areas due to bad weather.",
    author: "NEWS",
    createdAt: new Date().toISOString(),
    url: "https://x.com/i/status/1962381284",
  });
  assert(anonymousNews.authorName === "News Report", "Generic authorName is 'News Report'");
  assert(anonymousNews.authorHandle === "", "Generic authorHandle is empty string (never '@NEWS')");

  // ── Test 9: Highway and Expressway Flood Incident Resolution ──────────
  console.log("\n[Test 9] Highway and Expressway Flood Incident Resolution");

  // Post A: News5 - Motorists stuck overnight on NLEX due to flooding
  const nlexStuckPost = await parseAdvisoryPostAsync({
    id: "news_nlex_stuck_001",
    text: "#FrontlineExpress | Passengers and motorists have been stuck overnight on the North Luzon Expressway (NLEX) due to flooding that still hasn't subsided. | via Laila Pangilinan",
    author: "News5PH",
    createdAt: new Date().toISOString(),
    url: "https://x.com/News5PH/status/1962382001",
  });
  assert(nlexStuckPost.isFloodReport === true, "Motorists stuck on NLEX is an active flood report");
  assert(nlexStuckPost.roadName === "North Luzon Expressway (NLEX)", "Road is North Luzon Expressway (NLEX)");
  assert(nlexStuckPost.landmark === "San Simon Interchange", "Landmark resolved to San Simon Interchange");
  assert(nlexStuckPost.coordinates !== null, "Coordinates assigned for NLEX hotspot");
  assert(Math.abs((nlexStuckPost.coordinates?.lat || 0) - 14.9965) < 0.01, "Coordinates centered on San Simon Pampanga");
  assert(isAdvisoryPinVisible(nlexStuckPost) === true, "Visible on map as flood alert pin");

  // Post B: ABS-CBN News - San Simon Interchange NLEX entry points closed, routes flooded
  const sanSimonAbsCbnPost = await parseAdvisoryPostAsync({
    id: "news_sansimon_abscbn_002",
    text: "The ABS-CBN News team did not reach the San Simon Interchange because many entry points on the NLEX were closed, while the alternative routes were flooded. Some motorists were stranded and going around in circles, so others just went home after losing hope. | via @JervisManahan",
    author: "ABSCBNNews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/ABSCBNNews/status/1962382002",
  });
  assert(sanSimonAbsCbnPost.isFloodReport === true, "Closed entry points & flooded routes is an active flood report");
  assert(sanSimonAbsCbnPost.landmark === "San Simon Interchange", "Landmark is San Simon Interchange");
  assert(sanSimonAbsCbnPost.coordinates !== null, "Coordinates assigned");
  assert(isAdvisoryPinVisible(sanSimonAbsCbnPost) === true, "Visible on map as flood pin");

  // Post C: GMA News - NLEX-San Simon Interchange traffic heavy as flooding prompts diversions
  const gmaSanSimonPost = await parseAdvisoryPostAsync({
    id: "news_gma_sansimon_003",
    text: "NLEX-San Simon Interchange traffic remains heavy as flooding prompts diversions Read more:",
    author: "gmanews",
    createdAt: new Date().toISOString(),
    url: "https://x.com/gmanews/status/1962382003",
  });
  assert(gmaSanSimonPost.isFloodReport === true, "Flooding prompts diversions is an active flood report");
  assert(gmaSanSimonPost.landmark === "San Simon Interchange", "Landmark is San Simon Interchange");
  assert(gmaSanSimonPost.coordinates !== null, "Coordinates assigned");
  assert(isAdvisoryPinVisible(gmaSanSimonPost) === true, "Visible on map as flood pin");

  // Post D: Inquirer - Aerial inspection of habagat damage across Bulacan, NLEX, Pampanga
  const inqAerialPost = await parseAdvisoryPostAsync({
    id: "news_inq_aerial_004",
    text: "LOOK: Government officials conducted an aerial inspection today, Aug. 31, of areas affected by heavy rains brought by the southwest monsoon, or habagat, including Bulacan, NLEX, Pampanga and Tarlac. The inspection aimed to assess the extent of flooding and damage and determine",
    author: "inquirerdotnet",
    createdAt: new Date().toISOString(),
    url: "https://x.com/inquirerdotnet/status/1962382004",
  });
  assert(inqAerialPost.isFloodReport === false, "Aerial damage inspection is classified as general News Report");
  assert(inqAerialPost.passabilityLabel === "News Report", "Passability label is 'News Report'");
  assert(isAdvisoryPinVisible(inqAerialPost) === false, "Hidden from map pins");

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
