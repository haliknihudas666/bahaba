// ---------------------------------------------------------------------------
// Bahaba – Philippine Standard Geographic Code (PSGC) Engine
// Indexes all 17 Regions, 88 Provinces, 1,647 Cities/Municipalities,
// and 42,029 Barangays for fast, high-accuracy geographic entity extraction,
// contextual enrichment, and geocoding disambiguation.
// ---------------------------------------------------------------------------

import regionsData from "../../../psgc/refregion.json";
import provincesData from "../../../psgc/refprovince.json";
import citymunsData from "../../../psgc/refcitymun.json";
import brgysData from "../../../psgc/refbrgy.json";

export interface PsgcRegion {
  code: string;
  name: string;
  description: string;
}

export interface PsgcProvince {
  code: string;
  name: string;
  regionCode: string;
  isNCR: boolean;
}

export interface PsgcCityMun {
  code: string;
  name: string;
  cleanName: string;
  provCode: string;
  provinceName: string;
  regionCode: string;
  isCity: boolean;
  isNCR: boolean;
}

export interface PsgcBarangay {
  code: string;
  name: string;
  cleanName: string;
  citymunCode: string;
  cityName: string;
  provinceName: string;
}

export interface PsgcExtractedLocation {
  barangay?: string;
  city?: string;
  province?: string;
  region?: string;
  canonicalAddress: string;
  rawMatchedToken: string;
}

/**
 * Standardize capitalization for Philippine place names
 */
export function toTitleCase(str: string): string {
  if (!str) return "";
  return str
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word === "of" || word === "del" || word === "de" || word === "la" || word === "and" || word === "ng" || word === "sa") {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/**
 * Normalize and strip administrative boilerplate from names
 * (e.g. "CITY OF VALENZUELA" -> "Valenzuela", "CITY OF MANILA" -> "Manila")
 */
export function cleanAdministrativeName(name: string): string {
  // Special Cases
  if (/^QUEZON\s+CITY$/i.test(name)) return "Quezon City";
  if (/^CITY\s+OF\s+MANILA$/i.test(name)) return "Manila";
  if (/^CEBU\s+CITY$/i.test(name)) return "Cebu City";
  if (/^DAVAO\s+CITY$/i.test(name)) return "Davao City";
  if (/^ILOILO\s+CITY$/i.test(name)) return "Iloilo City";

  // District mappings for Manila
  if (/^TONDO\s+I\s*\/\s*II$/i.test(name)) return "Tondo";
  if (/^BINONDO$/i.test(name)) return "Binondo";
  if (/^QUIAPO$/i.test(name)) return "Quiapo";
  if (/^SAN NICOLAS$/i.test(name)) return "San Nicolas";
  if (/^SANTA CRUZ$/i.test(name)) return "Santa Cruz";
  if (/^SAMPALOC$/i.test(name)) return "Sampaloc";
  if (/^SAN MIGUEL$/i.test(name)) return "San Miguel";
  if (/^ERMITA$/i.test(name)) return "Ermita";
  if (/^INTRAMUROS$/i.test(name)) return "Intramuros";
  if (/^MALATE$/i.test(name)) return "Malate";
  if (/^PACO$/i.test(name)) return "Paco";
  if (/^PANDACAN$/i.test(name)) return "Pandacan";
  if (/^PORT AREA$/i.test(name)) return "Port Area";
  if (/^SANTA ANA$/i.test(name)) return "Santa Ana";

  let cleaned = name
    .replace(/^CITY OF\s+/i, "")
    .replace(/\s+CITY(?:\s*\(Capital\))?$/i, "")
    .replace(/\s*\(Capital\)$/i, "")
    .replace(/\s*\(Bigaa\)$/i, "")
    .replace(/\s*\(Espiritu\)$/i, "")
    .replace(/\s*\(Pob\.\)$/i, "")
    .replace(/\s*\(Poblacion\)$/i, "")
    .trim();
  if (/^BINONDO$/i.test(name)) return "Binondo";
  if (/^QUIAPO$/i.test(name)) return "Quiapo";
  if (/^SAN NICOLAS$/i.test(name)) return "San Nicolas";
  if (/^SANTA CRUZ$/i.test(name)) return "Santa Cruz";
  if (/^SAMPALOC$/i.test(name)) return "Sampaloc";
  if (/^SAN MIGUEL$/i.test(name)) return "San Miguel";
  if (/^ERMITA$/i.test(name)) return "Ermita";
  if (/^INTRAMUROS$/i.test(name)) return "Intramuros";
  if (/^MALATE$/i.test(name)) return "Malate";
  if (/^PACO$/i.test(name)) return "Paco";
  if (/^PANDACAN$/i.test(name)) return "Pandacan";
  if (/^PORT AREA$/i.test(name)) return "Port Area";
  if (/^SANTA ANA$/i.test(name)) return "Santa Ana";

  return toTitleCase(cleaned);
}

// ---------------------------------------------------------------------------
// In-Memory Global Indices
// ---------------------------------------------------------------------------

let isInitialized = false;

const regionsByCode = new Map<string, PsgcRegion>();
const provincesByCode = new Map<string, PsgcProvince>();
const citiesByCode = new Map<string, PsgcCityMun>();
const citiesByName = new Map<string, PsgcCityMun[]>();
const provincesByName = new Map<string, PsgcProvince>();
const barangaysByName = new Map<string, PsgcBarangay[]>();

// Regex patterns built dynamically from PSGC
let cityPatternRegex: RegExp | null = null;
let provincePatternRegex: RegExp | null = null;

function initializePsgc() {
  if (isInitialized) return;

  // 1. Index Regions
  for (const r of (regionsData as any).RECORDS) {
    regionsByCode.set(r.regCode, {
      code: r.regCode,
      name: r.regDesc,
      description: r.regDesc,
    });
  }

  // 2. Index Provinces
  for (const p of (provincesData as any).RECORDS) {
    const isNCR = p.regCode === "13" || p.provDesc.startsWith("NCR");
    const provName = isNCR ? "Metro Manila" : toTitleCase(p.provDesc);
    const province: PsgcProvince = {
      code: p.provCode,
      name: provName,
      regionCode: p.regCode,
      isNCR,
    };
    provincesByCode.set(p.provCode, province);

    const normKey = provName.toLowerCase();
    if (!provincesByName.has(normKey)) {
      provincesByName.set(normKey, province);
    }
  }

  // 3. Index Cities / Municipalities
  const uniqueCityKeywords = new Set<string>();

  for (const c of (citymunsData as any).RECORDS) {
    const prov = provincesByCode.get(c.provCode);
    const isNCR = c.regDesc === "13" || (prov?.isNCR ?? false);
    const provinceName = prov ? prov.name : (isNCR ? "Metro Manila" : "");
    const cleanName = cleanAdministrativeName(c.citymunDesc);
    const isCity = /CITY/i.test(c.citymunDesc);

    const cityObj: PsgcCityMun = {
      code: c.citymunCode,
      name: toTitleCase(c.citymunDesc),
      cleanName,
      provCode: c.provCode,
      provinceName,
      regionCode: c.regDesc || prov?.regionCode || "",
      isCity,
      isNCR,
    };

    citiesByCode.set(c.citymunCode, cityObj);

    // Index under lowercase variations
    const keys = [
      cleanName.toLowerCase(),
      c.citymunDesc.toLowerCase(),
    ];
    if (isCity && !cleanName.toLowerCase().endsWith("city")) {
      keys.push(`${cleanName.toLowerCase()} city`);
    }

    for (const key of keys) {
      if (!citiesByName.has(key)) {
        citiesByName.set(key, []);
      }
      citiesByName.get(key)!.push(cityObj);
    }

    if (cleanName.length >= 3) {
      uniqueCityKeywords.add(cleanName.toLowerCase());
    }
  }

  // 4. Index Common Aliases (QC, BGC, Montalban, etc.)
  const qcObj = Array.from(citiesByCode.values()).find((c) => c.isNCR && c.cleanName === "Quezon City");
  if (qcObj) {
    if (!citiesByName.has("qc")) citiesByName.set("qc", [qcObj]);
  }
  const taguigObj = Array.from(citiesByCode.values()).find((c) => c.isNCR && c.cleanName === "Taguig");
  if (taguigObj) {
    if (!citiesByName.has("bgc")) citiesByName.set("bgc", [taguigObj]);
    if (!citiesByName.has("fort bonifacio")) citiesByName.set("fort bonifacio", [taguigObj]);
  }
  const rodriguezObj = Array.from(citiesByCode.values()).find((c) => c.cleanName === "Rodriguez");
  if (rodriguezObj) {
    if (!citiesByName.has("montalban")) citiesByName.set("montalban", [rodriguezObj]);
  }

  // 5. Index Barangays
  for (const b of (brgysData as any).RECORDS) {
    const city = citiesByCode.get(b.citymunCode);
    const cleanName = cleanAdministrativeName(b.brgyDesc);
    const brgyObj: PsgcBarangay = {
      code: b.brgyCode,
      name: toTitleCase(b.brgyDesc),
      cleanName,
      citymunCode: b.citymunCode,
      cityName: city ? city.cleanName : "",
      provinceName: city ? city.provinceName : "",
    };

    const normKey = cleanName.toLowerCase();
    if (!barangaysByName.has(normKey)) {
      barangaysByName.set(normKey, []);
    }
    barangaysByName.get(normKey)!.push(brgyObj);
  }

  // 6. Build High-Performance Search Regexes
  const sortedCityNames = Array.from(uniqueCityKeywords).sort((a, b) => b.length - a.length);
  cityPatternRegex = new RegExp(
    `\\b(?:city\\s*of\\s+)?(${sortedCityNames.map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})(?:\\s*city)?\\b`,
    "i"
  );

  const sortedProvNames = Array.from(provincesByName.keys()).sort((a, b) => b.length - a.length);
  provincePatternRegex = new RegExp(
    `\\b(${sortedProvNames.map((s) => s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&")).join("|")})\\b`,
    "i"
  );

  isInitialized = true;
}

// Auto-initialize index on load
initializePsgc();

// ---------------------------------------------------------------------------
// Public API & Query Helpers
// ---------------------------------------------------------------------------

/**
 * Lookup a city or municipality by name (e.g. "San Simon", "Valenzuela", "QC")
 */
export function lookupCity(query: string, provincePreference?: string): PsgcCityMun | null {
  initializePsgc();
  const lower = query.trim().toLowerCase().replace(/^city\s*of\s+/i, "").replace(/\s*city$/i, "");
  const candidates = citiesByName.get(lower) || citiesByName.get(query.trim().toLowerCase());
  if (!candidates || candidates.length === 0) return null;

  if (candidates.length === 1) return candidates[0];

  // Disambiguate by province if provided
  if (provincePreference) {
    const provLower = provincePreference.toLowerCase();
    const match = candidates.find(
      (c) => c.provinceName.toLowerCase().includes(provLower) || provLower.includes(c.provinceName.toLowerCase())
    );
    if (match) return match;
  }

  // Default priority: NCR / Greater Manila / Largest candidate
  const ncrMatch = candidates.find((c) => c.isNCR);
  if (ncrMatch) return ncrMatch;

  return candidates[0];
}

/**
 * Lookup a province by name (e.g. "Pampanga", "Bulacan", "Rizal")
 */
export function lookupProvince(query: string): PsgcProvince | null {
  initializePsgc();
  return provincesByName.get(query.trim().toLowerCase()) || null;
}

/**
 * Lookup a barangay by name and optional city context
 */
export function lookupBarangay(brgyName: string, cityContext?: string): PsgcBarangay | null {
  initializePsgc();
  const lower = brgyName.trim().toLowerCase().replace(/^(?:brgy\.?|barangay)\s+/i, "");
  const candidates = barangaysByName.get(lower);
  if (!candidates || candidates.length === 0) return null;

  if (candidates.length === 1) return candidates[0];

  if (cityContext) {
    const cityLower = cityContext.toLowerCase();
    const match = candidates.find(
      (b) => b.cityName.toLowerCase().includes(cityLower) || cityLower.includes(b.cityName.toLowerCase())
    );
    if (match) return match;
  }

  return candidates[0];
}

/**
 * Extracts Philippine geographic entity (Barangay, City, Province) from conversational text
 */
export function extractPsgcEntityFromText(text: string): PsgcExtractedLocation | null {
  if (!text) return null;
  initializePsgc();

  // 1. Check for explicit Barangay mentions (e.g. "Brgy. Tumana, Marikina", "Barangay San Jose")
  const brgyMatch = text.match(
    /\b(?:brgy\.?|barangay)\s+([A-Za-z0-9\s'\.\-]+?)(?:\s*,\s*([A-Za-z\s]+))?(?:\s+(?:in|sa|along|dahil|due|city)\b|[,\.\n]|$)/i
  );

  if (brgyMatch && brgyMatch[1]) {
    const rawBrgy = brgyMatch[1].trim();
    const cityHint = brgyMatch[2]?.trim();
    const foundBrgy = lookupBarangay(rawBrgy, cityHint);

    if (foundBrgy) {
      const canonical = foundBrgy.provinceName === "Metro Manila"
        ? `Brgy. ${foundBrgy.cleanName}, ${foundBrgy.cityName}`
        : `Brgy. ${foundBrgy.cleanName}, ${foundBrgy.cityName}, ${foundBrgy.provinceName}`;

      return {
        barangay: foundBrgy.cleanName,
        city: foundBrgy.cityName,
        province: foundBrgy.provinceName,
        canonicalAddress: canonical,
        rawMatchedToken: brgyMatch[0].trim(),
      };
    }
  }

  // 2. Check for City / Municipality mentions
  if (cityPatternRegex) {
    const cityMatch = text.match(cityPatternRegex);
    if (cityMatch && cityMatch[1]) {
      const cityObj = lookupCity(cityMatch[1]);
      if (cityObj) {
        const canonical = cityObj.isNCR || !cityObj.provinceName
          ? (cityObj.cleanName.toLowerCase().endsWith("city") || cityObj.cleanName === "Manila"
              ? cityObj.cleanName
              : `${cityObj.cleanName} City`)
          : `${cityObj.cleanName}, ${cityObj.provinceName}`;

        return {
          city: cityObj.cleanName,
          province: cityObj.provinceName,
          region: cityObj.regionCode,
          canonicalAddress: canonical,
          rawMatchedToken: cityMatch[0].trim(),
        };
      }
    }
  }

  // 3. Check for Province mentions
  if (provincePatternRegex) {
    const provMatch = text.match(provincePatternRegex);
    if (provMatch && provMatch[1]) {
      const provObj = lookupProvince(provMatch[1]);
      if (provObj) {
        return {
          province: provObj.name,
          canonicalAddress: `${provObj.name}, Philippines`,
          rawMatchedToken: provMatch[0].trim(),
        };
      }
    }
  }

  return null;
}
