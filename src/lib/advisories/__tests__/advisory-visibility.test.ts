import { isAdvisoryPinVisible, ADVISORY_MAP_PIN_MAX_AGE_MS, type ReportedAdvisory } from "../../../types/advisory";

function runTests() {
  console.log("\n────────────────────────────────────────────────────────────");
  console.log("  Testing Advisory Pin Map Visibility (6-Hour Window)");
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

  const now = new Date("2026-08-29T12:00:00.000Z").getTime();

  const baseAdvisory: ReportedAdvisory = {
    id: "adv-1",
    source: "MMDA",
    postUrl: "https://x.com/MMDA/status/123",
    rawText: "ADVISORY: Flooding along EDSA Taft. Not passable to light vehicles.",
    publishedAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
    photoUrls: [],
    isFloodReport: true,
    category: "FLOOD",
    depthLevel: "TIRE",
    depthInches: 26,
    passability: "NOT_PASSABLE_LIGHT",
    severity: "ALARM",
    badgeColor: "orange",
    passabilityLabel: "Not Passable (Light)",
    coordinates: {
      lat: 14.5378,
      lng: 121.0014,
    },
    status: "ACTIVE",
  };

  // Test 1: Recent advisory (2 hours ago) should be visible on map
  assert(
    isAdvisoryPinVisible(baseAdvisory, now) === true,
    "Advisory published 2 hours ago is visible on the map"
  );

  // Test 2: Advisory published 5 hours and 59 minutes ago should be visible
  const advisory5h59m: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: new Date(now - (5 * 3600 + 59 * 60) * 1000).toISOString(),
  };
  assert(
    isAdvisoryPinVisible(advisory5h59m, now) === true,
    "Advisory published 5h 59m ago is visible on the map"
  );

  // Test 3: Advisory published exactly 6 hours ago should be visible
  const advisory6h: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: new Date(now - 6 * 3600 * 1000).toISOString(),
  };
  assert(
    isAdvisoryPinVisible(advisory6h, now) === true,
    "Advisory published exactly 6 hours ago (boundary) is visible on the map"
  );

  // Test 4: Advisory published 6 hours and 1 second ago should be hidden
  const advisory6h1s: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: new Date(now - (6 * 3600 * 1000 + 1000)).toISOString(),
  };
  assert(
    isAdvisoryPinVisible(advisory6h1s, now) === false,
    "Advisory published 6h 1s ago is hidden on the map (> 6 hours)"
  );

  // Test 5: Advisory published 12 hours ago should be hidden
  const advisory12h: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: new Date(now - 12 * 3600 * 1000).toISOString(),
  };
  assert(
    isAdvisoryPinVisible(advisory12h, now) === false,
    "Advisory published 12 hours ago is hidden on the map"
  );

  // Test 6: Advisory published 24 hours ago should be hidden
  const advisory24h: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: new Date(now - 24 * 3600 * 1000).toISOString(),
  };
  assert(
    isAdvisoryPinVisible(advisory24h, now) === false,
    "Advisory published 24 hours ago is hidden on the map"
  );

  // Test 7: Advisory without coordinates should be hidden on the map
  const advisoryNoCoords: ReportedAdvisory = {
    ...baseAdvisory,
    coordinates: null,
  };
  assert(
    isAdvisoryPinVisible(advisoryNoCoords, now) === false,
    "Advisory without coordinates is not visible on the map"
  );

  // Test 8: Advisory with invalid/missing date should be hidden
  const advisoryBadDate: ReportedAdvisory = {
    ...baseAdvisory,
    publishedAt: "invalid-date",
  };
  assert(
    isAdvisoryPinVisible(advisoryBadDate, now) === false,
    "Advisory with invalid publishedAt string is hidden on the map"
  );

  // Test 9: Verify ADVISORY_MAP_PIN_MAX_AGE_MS equals 6 hours
  assert(
    ADVISORY_MAP_PIN_MAX_AGE_MS === 6 * 60 * 60 * 1000,
    "ADVISORY_MAP_PIN_MAX_AGE_MS is configured to exactly 6 hours (21,600,000 ms)"
  );

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
