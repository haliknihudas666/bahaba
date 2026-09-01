// ---------------------------------------------------------------------------
// Bahaba – PSGC Geographic Index & Entity Extraction Test Suite
// ---------------------------------------------------------------------------

import {
  lookupCity,
  lookupProvince,
  lookupBarangay,
  extractPsgcEntityFromText,
  cleanAdministrativeName,
} from "../psgc";

let passed = 0;
let failed = 0;

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`  ✅  ${message}`);
    passed++;
  } else {
    console.error(`  ❌  FAIL: ${message}`);
    failed++;
  }
}

async function runTests() {
  console.log("────────────────────────────────────────────────────────────");
  console.log("  Testing Philippine Standard Geographic Code (PSGC) Engine");
  console.log("────────────────────────────────────────────────────────────\n");

  // 1. City & Municipality Lookup
  console.log("[Test 1] City & Municipality Lookups");
  const sanSimon = lookupCity("San Simon");
  assert(sanSimon !== null, "San Simon found in PSGC");
  assert(sanSimon?.provinceName === "Pampanga", "San Simon mapped to Pampanga province");

  const valenzuela = lookupCity("City of Valenzuela");
  assert(valenzuela !== null, "Valenzuela found in PSGC");
  assert(valenzuela?.cleanName === "Valenzuela", "Cleaned 'City of Valenzuela' to 'Valenzuela'");
  assert(valenzuela?.isNCR === true, "Valenzuela is in NCR");

  const calumpit = lookupCity("Calumpit");
  assert(calumpit !== null, "Calumpit found in PSGC");
  assert(calumpit?.provinceName === "Bulacan", "Calumpit mapped to Bulacan");

  const qc = lookupCity("QC");
  assert(qc !== null, "QC alias resolved to Quezon City");
  assert(qc?.cleanName === "Quezon City", "QC cleanName is Quezon City");

  // 2. Province Lookup
  console.log("\n[Test 2] Province Lookups");
  const pampanga = lookupProvince("Pampanga");
  assert(pampanga !== null, "Pampanga found in PSGC");
  assert(pampanga?.name === "Pampanga", "Pampanga province name correct");

  const bulacan = lookupProvince("Bulacan");
  assert(bulacan !== null, "Bulacan found in PSGC");
  assert(bulacan?.name === "Bulacan", "Bulacan province name correct");

  // 3. Barangay Lookups with Disambiguation
  console.log("\n[Test 3] Barangay Lookups");
  const tumanaMarikina = lookupBarangay("Tumana", "Marikina");
  assert(tumanaMarikina !== null, "Tumana found in PSGC");
  assert(tumanaMarikina?.cityName === "Marikina", "Tumana disambiguated to Marikina");

  const potreroMalabon = lookupBarangay("Potrero", "Malabon");
  assert(potreroMalabon !== null, "Potrero found in PSGC");
  assert(potreroMalabon?.cityName === "Malabon", "Potrero disambiguated to Malabon");

  // 4. Conversational Text Entity Extraction
  console.log("\n[Test 4] Conversational Text Entity Extraction");

  const textA = "Baha sa Brgy. Tumana, Marikina dahil sa pagtaas ng tubig sa Marikina River.";
  const extractedA = extractPsgcEntityFromText(textA);
  assert(extractedA?.barangay === "Tumana", "Extracted Barangay Tumana from text");
  assert(extractedA?.city === "Marikina", "Extracted City Marikina from text");

  const textB = "Flooding reported along San Simon, Pampanga near the NLEX exit.";
  const extractedB = extractPsgcEntityFromText(textB);
  assert(extractedB?.city === "San Simon", "Extracted San Simon from text");
  assert(extractedB?.province === "Pampanga", "Extracted Pampanga from text");

  const textC = "Lubog sa baha ang mga kalsada sa Calumpit ngayong umaga.";
  const extractedC = extractPsgcEntityFromText(textC);
  assert(extractedC?.city === "Calumpit", "Extracted Calumpit from text");
  assert(extractedC?.province === "Bulacan", "Auto-resolved Bulacan as parent province for Calumpit");

  const textD = "Mataas ang tubig sa Brgy. Potrero, Malabon City.";
  const extractedD = extractPsgcEntityFromText(textD);
  assert(extractedD?.barangay === "Potrero", "Extracted Barangay Potrero");
  assert(extractedD?.city === "Malabon", "Extracted City Malabon");

  console.log("\n════════════════════════════════════════════════════════════");
  console.log(`  Results: ${passed} passed, ${failed} failed`);
  console.log("════════════════════════════════════════════════════════════\n");

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
