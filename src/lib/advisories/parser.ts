// ---------------------------------------------------------------------------
// Bahaba – Advisory Parsing & Extraction Engine
// Extracts structured flood depth, passability status, affected roads, and coordinates.
// Accurately and dynamically resolves multi-location flood reports from MMDA bulletins
// and natural language reports from news outlets (GMA, ABS-CBN, News5, Inquirer, etc.)
// Filters out foreign/international events (e.g. Nepal, Bangladesh, Spain) to protect local feeds.
// ---------------------------------------------------------------------------

import type {
  ReportedAdvisory,
  AdvisoryLocationPin,
  FloodDepthLevel,
  AdvisoryPassability,
  AdvisorySource,
} from "@/types/advisory";
import { geocodeAdvisoryLocation, getCachedCoordinates, type GeoCoordinate } from "./dynamic-geocoder";
import { extractPsgcEntityFromText } from "../geo/psgc";

export interface RawTweetInput {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  url: string;
  photoUrls?: string[];
}

/**
 * Foreign / International Location Keywords
 */
const FOREIGN_LOCATIONS_REGEX =
  /\b(nepal|kathmandu|pokhara|bangladesh|dhaka|chittagong|sri\s*lanka|colombo|pakistan|karachi|lahore|islamabad|india|new\s*delhi|mumbai|vietnam|hanoi|ho\s*chi\s*minh|danang|thailand|bangkok|chiang\s*mai|myanmar|yangon|indonesia|jakarta|bali|taiwan|taipei|japan|tokyo|osaka|kyoto|china|beijing|shanghai|guangdong|korea|seoul|spain|valencia|madrid|barcelona|italy|rome|milan|france|paris|germany|berlin|ukraine|russia|moscow|united\s*kingdom|britain|london|england|united\s*states|u\.?s\.?a?|florida|texas|california|hawaii|mexico|brazil|argentina|australia|sydney|melbourne|new\s*zealand|auckland|dubai|uae|saudi\s*arabia|egypt|greece|turkey)\b/i;

/**
 * Domestic Philippine Context Markers
 */
const PH_LOCAL_CONTEXT_REGEX =
  /\b(philippines|pilipinas|pinoy|ph|metro\s*manila|ncr|luzon|visayas|mindanao|pagasa|dost|mmda|ndrrmc|habagat|amihan|bagyo|baha|walang\s*pasok|walangpasok|quezon\s*city|qc|manila|maynila|makati|taguig|pasig|caloocan|valenzuela|malabon|navotas|marikina|pasay|paranaque|parañaque|las\s*pinas|las\s*piñas|muntinlupa|mandaluyong|san\s*juan|pateros|bulacan|cavite|laguna|rizal|batangas|pampanga|cebu|davao|iloilo|bacolod|bicol|cagayan|pangasinan|zambales|tarlac|nueva\s*ecija|bataan|albay)\b/i;

/**
 * Detects whether a tweet/post is reporting an international/foreign disaster
 * (e.g. floods in Nepal, Bangladesh, Spain, etc.) rather than a domestic Philippine incident.
 */
export function isInternationalOrForeignEvent(text: string): boolean {
  if (!text) return false;
  const clean = cleanMultilineText(text);

  if (FOREIGN_LOCATIONS_REGEX.test(clean)) {
    const hasLocalContext = PH_LOCAL_CONTEXT_REGEX.test(clean);
    if (!hasLocalContext) {
      return true;
    }
    // If the headline explicitly introduces a foreign disaster
    if (
      /^(?:LOOK|WATCH|NEWS|UPDATE|READ|JUST IN|ALERT)?:?\s*(?:At least|Heavy|Massive|Deadly|Catastrophic|Severe)?\s*(?:flooding|flood|floods|landslides?|storm|typhoon|earthquake)\s+(?:in|across|hits?|strikes?)\s+(?:nepal|kathmandu|bangladesh|dhaka|india|china|japan|spain|valencia|taiwan|vietnam|indonesia|florida|us|usa)\b/i.test(
        clean
      )
    ) {
      return true;
    }
  }

  return false;
}

/**
 * Checks whether a post is related to weather, flood, or school suspension in the Philippines
 */
export function isWeatherOrFloodRelated(text: string): boolean {
  if (!text) return false;
  if (isInternationalOrForeignEvent(text)) return false;

  const lower = text.toLowerCase();
  return (
    lower.includes("baha") ||
    lower.includes("flood") ||
    lower.includes("flooding") ||
    lower.includes("floodwater") ||
    lower.includes("gutter") ||
    lower.includes("knee") ||
    lower.includes("tire") ||
    lower.includes("waist") ||
    lower.includes("chest") ||
    lower.includes("tuhod") ||
    lower.includes("baywang") ||
    lower.includes("dibdib") ||
    lower.includes("subsided") ||
    lower.includes("humupa") ||
    lower.includes("bagyo") ||
    lower.includes("typhoon") ||
    lower.includes("habagat") ||
    lower.includes("monsoon") ||
    lower.includes("rainfall") ||
    lower.includes("thunderstorm") ||
    lower.includes("walangpasok") ||
    lower.includes("walang pasok")
  );
}

/**
 * Normalizes Unicode text (converts Math bold, sans-serif bold, and special chars to plain ASCII)
 */
export function cleanMultilineText(text: string): string {
  if (!text) return "";

  // Convert Mathematical Alphanumeric Symbols (e.g. 𝐃𝐚𝐭𝐞 -> Date, 𝐕𝐀𝐋𝐄𝐍𝐙𝐔𝐄𝐋𝐀 -> VALENZUELA)
  let normalized = text
    .normalize("NFKD")
    .replace(/[\u{1D400}-\u{1D7FF}]/gu, (char) => {
      const code = char.codePointAt(0);
      if (!code) return char;
      // Bold capital A-Z
      if (code >= 0x1d400 && code <= 0x1d419) return String.fromCharCode(65 + code - 0x1d400);
      // Bold lowercase a-z
      if (code >= 0x1d41a && code <= 0x1d433) return String.fromCharCode(97 + code - 0x1d41a);
      // Bold digits 0-9
      if (code >= 0x1d7ce && code <= 0x1d7d7) return String.fromCharCode(48 + code - 0x1d7ce);
      // Sans-serif bold capital A-Z
      if (code >= 0x1d5d4 && code <= 0x1d5ed) return String.fromCharCode(65 + code - 0x1d5d4);
      // Sans-serif bold lowercase a-z
      if (code >= 0x1d5ee && code <= 0x1d607) return String.fromCharCode(97 + code - 0x1d5ee);
      return char;
    });

  // Replace typographic quotes, hyphens, and whitespace
  normalized = normalized
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201F]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/[\u00A0\u2000-\u200B\u202F\u205F]/g, " ");

  return normalized;
}

/**
 * Normalizes multi-location bulletins (handling both multiline and single-line continuous text)
 * without corrupting conversational news sentences.
 */
export function normalizeFloodReportText(raw: string): string {
  let text = cleanMultilineText(raw);

  // 1. Remove leading dot or stray characters before Date/Time (e.g. ".Date:" -> "Date:")
  text = text.replace(/^\s*\.\s*(?=Date:)/i, "");

  // 2. Normalize N-tilde (Paranaque)
  text = text.replace(/PARAN\u0303AQUE/gi, "PARANAQUE");

  // 3. Only match standalone City section headers (e.g. "\nQUEZON CITY:\n" or "\nVALENZUELA CITY\n")
  // Do NOT match inline occurrences like "near Pegasus in Quezon City"
  const headerCityRegex = /(?:^|\n)\s*[-•*–—]?\s*(VALENZUELA|MANDALUYONG|PARANAQUE|PARA[NÑ]AQUE|MANILA|MALABON|QUEZON|MARIKINA|PASAY|CALOOCAN|MAKATI|TAGUIG|PASIG|SAN\s*JUAN|NAVOTAS|LAS\s*PINAS|LAS\s*PI[NÑ]AS|MUNTINLUPA|PATEROS)\s+(?:CITY|LGU)\b(?:\s*:)?\s*(?:\n|$)/gi;
  text = text.replace(headerCityRegex, "\n___CITY_$1___\n- ");

  // 4. Insert line breaks after Passability statements in multi-bullet bulletins
  text = text.replace(
    /(Passable\s+to\s+all\s+(?:types\s+of\s+)?(?:vehicles|vehicle)\.?|Not\s+Passable\s+to\s+Light\s+(?:vehicles|vehicle)\.?|Not\s+Passable\s+to\s+all\s+(?:types\s+of\s+)?(?:vehicles|vehicle)\.?|Flood\s+Subsided\.?)\s*(?:[-•*–—]|(?=[A-Z0-9]))/gi,
    "$1\n- "
  );

  // 5. Clean disclaimers
  text = text.replace(/Please\s+refresh\s+the\s+post\s+for\s+latest\s+updates\.?/gi, "\n");

  // 6. Normalize bullets and newlines
  text = text.replace(/(?:^|\n)\s*[-•*–—]\s*/g, "\n- ");
  text = text.replace(/\n{2,}/g, "\n");

  return text.trim();
}

/**
 * Extract depth level, explicit inches, and passability from a line or snippet of text
 * Supports English, Tagalog, and numeric formats.
 */
export function extractDepthAndPassability(text: string): {
  depthLevel: FloodDepthLevel;
  depthInches: number;
  passability: AdvisoryPassability;
  status: "ACTIVE" | "SUBSIDED";
  severity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL";
  badgeColor: "red" | "orange" | "yellow" | "green" | "blue";
  passabilityLabel: string;
} {
  const lower = text.toLowerCase();

  let depthLevel: FloodDepthLevel = "UNKNOWN";
  let depthInches = 0;
  let passability: AdvisoryPassability = "PASSABLE_ALL";
  let status: "ACTIVE" | "SUBSIDED" = "ACTIVE";

  // Check explicit numeric inches: e.g. "(19 inches)", "(8-9 Inches)", "6 inches", "1-2 Inches"
  const inchMatch = text.match(/\(?\b(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?\s*(?:inches|inch|in\.?)\b\)?/i);
  if (inchMatch) {
    const val1 = parseFloat(inchMatch[1]);
    const val2 = inchMatch[2] ? parseFloat(inchMatch[2]) : null;
    depthInches = val2 !== null ? Math.round((val1 + val2) / 2) : Math.round(val1);
  }

  // Check explicit centimeters/meters
  const cmMatch = text.match(/\(?\b(\d+(?:\.\d+)?)\s*(?:cm|centimeters|sentimetro)\b\)?/i);
  if (cmMatch && !depthInches) {
    const cm = parseFloat(cmMatch[1]);
    depthInches = Math.round(cm / 2.54);
  }

  // 1. Subsided / Cleared
  if (/subsided|gutter\s*subsided|flood\s*subsided|humupa|hupa\s*na|wala\s*nang\s*baha|cleared/i.test(lower)) {
    depthLevel = "SUBSIDED";
    depthInches = 0;
    passability = "SUBSIDED";
    status = "SUBSIDED";
  }
  // 2. Chest Deep / Neck / Head level (Tagalog: dibdib, leeg, lagpas-tao)
  else if (/chest\s*(?:deep|level)|hanggang\s*dibdib|pandibdib|lagpas\s*tao|lagpas-tao|neck\s*deep/i.test(lower)) {
    depthLevel = "CHEST";
    if (!depthInches) depthInches = 45;
    passability = "NOT_PASSABLE_ALL";
  }
  // 3. Waist Deep (Tagalog: baywang, pambaywang)
  else if (/waist\s*(?:deep|level)|hanggang\s*baywang|pambaywang|lagpas\s*baywang/i.test(lower)) {
    depthLevel = "WAIST";
    if (!depthInches) depthInches = 37;
    passability = "NOT_PASSABLE_ALL";
  }
  // 4. Tire Deep / Full wheel (Tagalog: gulong, buong gulong)
  else if ((/tire\s*(?:deep|level)|hanggang\s*gulong|wheel\s*deep/i.test(lower) && !/half\s*tire|kalahating\s*gulong/i.test(lower))) {
    depthLevel = "TIRE";
    if (!depthInches) depthInches = 26;
    passability = "NOT_PASSABLE_ALL";
  }
  // 5. Half Tire (Tagalog: kalahating gulong)
  else if (/half\s*tire|kalahating\s*gulong/i.test(lower)) {
    depthLevel = "HALF_TIRE";
    if (!depthInches) depthInches = 13;
    passability = "NOT_PASSABLE_LIGHT";
  }
  // 6. Half Knee / Gutter to half knee
  else if (/half\s*knee|gutter\s*to\s*half\s*knee/i.test(lower)) {
    depthLevel = "KNEE";
    if (!depthInches) depthInches = 12;
    passability = "PASSABLE_ALL";
  }
  // 7. Knee Deep / Knee level (Tagalog: tuhod, pantuhod, lagpas tuhod)
  else if (/knee\s*(?:deep|level)|hanggang\s*tuhod|pantuhod|lagpas\s*tuhod|calf\s*deep/i.test(lower)) {
    depthLevel = "KNEE";
    if (!depthInches) depthInches = 19;
    passability = "NOT_PASSABLE_LIGHT";
  }
  // 8. Above Gutter
  else if (/above\s*gutter/i.test(lower)) {
    depthLevel = "GUTTER";
    if (!depthInches) depthInches = 9;
    passability = "PASSABLE_ALL";
  }
  // 9. Half Gutter / Below Gutter
  else if (/half\s*gutter|below\s*gutter/i.test(lower)) {
    depthLevel = "GUTTER";
    if (!depthInches) depthInches = 4;
    passability = "PASSABLE_ALL";
  }
  // 10. Gutter Deep / Ankle level (Tagalog: bukong-bukong, sakong)
  else if (/gutter\s*(?:deep|level)|gutter|ankle\s*(?:deep|level)|bukong-bukong|sakong/i.test(lower)) {
    depthLevel = "GUTTER";
    if (!depthInches) depthInches = 8;
    passability = "PASSABLE_ALL";
  }
  // 11. Disrupted / Stranded / Highway Flood / Flooding prompts diversions / Stuck overnight
  else if (
    /stuck|stranded|na-stranded|na-trap|inabot\s*ng\s*baha/i.test(lower) ||
    /flooding\s*(?:that\s*)?(?:still\s*)?hasn't\s*subsided/i.test(lower) ||
    /routes\s*(?:were|are)\s*flooded|entry\s*points\s*.*?\s*closed/i.test(lower) ||
    /flooding\s*prompts\s*(?:diversions|rerouting|closure)/i.test(lower)
  ) {
    if (depthLevel === "UNKNOWN") {
      depthLevel = "KNEE";
      if (!depthInches) depthInches = 19;
    }
    passability = "NOT_PASSABLE_LIGHT";
  }

  // Passability overrides
  if (status === "SUBSIDED" || depthLevel === "SUBSIDED") {
    passability = "SUBSIDED";
  } else if (/not\s*passable\s*to\s*all|di\s*madaanan\s*ng\s*lahat|sarado\s*sa\s*(?:lahat|trapiko)|impassable/i.test(lower)) {
    passability = "NOT_PASSABLE_ALL";
  } else if (/not\s*passable\s*to\s*light|di\s*madaanan\s*ng\s*(?:mga\s*)?magagaan|not\s*passable/i.test(lower)) {
    if (passability !== "NOT_PASSABLE_ALL") {
      passability = "NOT_PASSABLE_LIGHT";
    }
  } else if (/passable\s*to\s*all|madaanan\s*ng\s*lahat|passable/i.test(lower)) {
    if (depthLevel !== "WAIST" && depthLevel !== "CHEST" && depthLevel !== "TIRE") {
      passability = "PASSABLE_ALL";
    }
  }

  // Severity classification
  let severity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL" = "NORMAL";
  let badgeColor: "red" | "orange" | "yellow" | "green" | "blue" = "blue";
  let passabilityLabel = "Advisory Bulletin";

  if (status === "SUBSIDED") {
    severity = "NORMAL";
    badgeColor = "green";
    passabilityLabel = "Flood Subsided";
  } else if (passability === "NOT_PASSABLE_ALL" || depthLevel === "WAIST" || depthLevel === "CHEST") {
    severity = "CRITICAL";
    badgeColor = "red";
    passabilityLabel = "Not Passable (All Vehicles)";
  } else if (
    passability === "NOT_PASSABLE_LIGHT" ||
    depthLevel === "KNEE" ||
    depthLevel === "TIRE" ||
    depthLevel === "HALF_TIRE"
  ) {
    severity = "ALARM";
    badgeColor = "orange";
    passabilityLabel = "Not Passable to Light Vehicles";
  } else if (
    depthLevel === "GUTTER" ||
    /passable\s*to\s*all|madaanan\s*ng\s*lahat/i.test(lower) ||
    (depthLevel !== "UNKNOWN" && passability === "PASSABLE_ALL")
  ) {
    severity = "ALERT";
    badgeColor = "yellow";
    passabilityLabel = "Passable to All Vehicles";
  } else {
    severity = "NORMAL";
    badgeColor = "blue";
    passabilityLabel = "Advisory Bulletin";
  }

  return {
    depthLevel,
    depthInches,
    passability,
    status,
    severity,
    badgeColor,
    passabilityLabel,
  };
}

/**
 * Comprehensive Philippine Road & Corridor Normalization Dictionary
 */
/**
 * Comprehensive Philippine Road & Corridor Normalization Dictionary
 */
const ROAD_SYNONYMS: [RegExp, string][] = [
  // Expressways & Major Arteries
  [/\b(north\s*luzon\s*expressway|nlex)\b/gi, "North Luzon Expressway (NLEX)"],
  [/\b(south\s*luzon\s*expressway|slex)\b/gi, "South Luzon Expressway (SLEX)"],
  [/\b(subic[-–—\s]*clark[-–—\s]*tarlac\s*expressway|sctex)\b/gi, "SCTEX"],
  [/\b(tarlac[-–—\s]*pangasinan[-–—\s]*la\s*union\s*expressway|tplex)\b/gi, "TPLEX"],
  [/\b(cavite[-–—\s]*manila\s*expressway|cavitex)\b/gi, "CAVITEX"],
  [/\b(cavite[-–—\s]*laguna\s*expressway|calax)\b/gi, "CALAX"],
  [/\b(metro\s*manila\s*skyway|skyway)\b/gi, "Skyway"],
  [/\b(naia\s*expressway|naiax)\b/gi, "NAIAX"],
  [/\b(muntinlupa[-–—\s]*cavite\s*expressway|mcx)\b/gi, "MCX"],
  [/\b(candaba\s*viaduct)\b/gi, "Candaba Viaduct"],
  [/\b(san\s*simon\s*(?:interchange|exit|section)?)\b/gi, "San Simon Interchange"],
  [/\b(bocaue\s*(?:interchange|exit|toll)?)\b/gi, "Bocaue Interchange"],
  [/\b(marilao\s*(?:interchange|exit)?)\b/gi, "Marilao Interchange"],
  [/\b(meycauayan\s*(?:interchange|exit)?)\b/gi, "Meycauayan Interchange"],
  [/\b(balintawak\s*(?:cloverleaf|toll|exit)?)\b/gi, "Balintawak Cloverleaf"],

  // Metro Manila Major Thoroughfares
  [/\b(macarthur|mcarthur)\s*(?:highway|hi-way|hwy)?\b/gi, "MacArthur Highway"],
  [/\b(espa[nñ]a)\s*(?:blvd|boulevard)?\b/gi, "España Blvd"],
  [/\b(quezon)\s*(?:ave|avenue)\b/gi, "Quezon Avenue"],
  [/\b(edsa|e\.?\s*d\.?\s*s\.?\s*a\.?)\b/gi, "EDSA"],
  [/\b(taft)\s*(?:ave|avenue)?\b/gi, "Taft Avenue"],
  [/\b(c-?3|c3)\s*(?:road)?\b/gi, "C-3 Road"],
  [/\b(c-?5|c5)\s*(?:road)?\b/gi, "C-5 Road"],
  [/\b(roxas)\s*(?:blvd|boulevard)?\b/gi, "Roxas Boulevard"],
  [/\b(araneta|g\.?\s*araneta)\s*(?:ave|avenue|sr\.?\s*ave)?\b/gi, "G. Araneta Avenue"],
  [/\b(e\.?\s*rodriguez|e\.?\s*rod)\s*(?:sr\.?\s*ave|avenue|ave)?\b/gi, "E. Rodriguez Sr. Ave"],
  [/\b(marcos)\s*(?:highway|hwy)\b/gi, "Marcos Highway"],
  [/\b(aurora)\s*(?:blvd|boulevard)\b/gi, "Aurora Blvd"],
  [/\b(boni|bonifacio)\s*(?:ave|avenue)\b/gi, "Boni Avenue"],
  [/\b(dr\.?\s*a\.?\s*santos|sucat\s*road)\b/gi, "Dr. A. Santos Ave"],
  [/\b(rizal)\s*(?:ave|avenue|ave\.?\s*extn?|avenue\s*extension)?\b/gi, "Rizal Avenue"],
  [/\b(jose\s*abad\s*santos|abad\s*santos)\s*(?:ave|avenue)?\b/gi, "Abad Santos Avenue"],
  [/\b(un|u\.?\s*n\.?)\s*(?:ave|avenue)\b/gi, "UN Avenue"],
  [/\b(quirino)\s*(?:ave|avenue|highway)?\b/gi, "Quirino Avenue"],
  [/\b(pedro\s*gil)\b/gi, "Pedro Gil"],
  [/\b(p\.?\s*ocampo|vito\s*cruz)\b/gi, "P. Ocampo"],
  [/\b(f\.?\s*sevilla)\s*(?:blvd|boulevard)?\b/gi, "F. Sevilla Blvd"],
  [/\b(gov\.?\s*pascual)\s*(?:ave|avenue)?\b/gi, "Gov. Pascual Ave"],
  [/\b(m\.?\s*h\.?\s*del\s*pilar|del\s*pilar)\s*(?:st|street)?\b/gi, "M.H. Del Pilar St"],
  [/\b(don\s*basilio\s*bautista)\b/gi, "Don Basilio Bautista"],
  [/\b(hulong\s*duhat)\b/gi, "Hulong Duhat"],
  [/\b(a\.?\s*bonifacio)\b/gi, "A. Bonifacio Avenue"],
  [/\b(sct\.?\s*chuatoco|scout\s*chuatoco)\s*(?:st|street)?\b/gi, "Scout Chuatoco Street"],
  [/\b(timog)\s*(?:ave|avenue)?\b/gi, "Timog Avenue"],
  [/\b(tomas\s*morato)\s*(?:ave|avenue)?\b/gi, "Tomas Morato Avenue"],
  [/\b(banawe)\s*(?:st|street)?\b/gi, "Banawe Street"],
  [/\b(commonwealth)\s*(?:ave|avenue)?\b/gi, "Commonwealth Avenue"],
  [/\b(katipunan)\s*(?:ave|avenue)?\b/gi, "Katipunan Avenue"],
  [/\b(ortigas)\s*(?:ave|avenue|ext|extension)?\b/gi, "Ortigas Avenue"],
  [/\b(shaw)\s*(?:blvd|boulevard)?\b/gi, "Shaw Boulevard"],
  [/\b(buendia|gil\s*puyat|sen\.?\s*gil\s*puyat)\s*(?:ave|avenue)?\b/gi, "Gil Puyat Avenue"],
  [/\b(ayala)\s*(?:ave|avenue)?\b/gi, "Ayala Avenue"],
];

/**
 * City & Provincial LGU Detection Regex for conversational posts
 */
const CITIES_REGEX: [RegExp, string][] = [
  // Metro Manila
  [/\b(quezon\s*city|qc)\b/i, "Quezon City"],
  [/\b(manila|maynila)\b/i, "Manila"],
  [/\b(valenzuela(?:\s*city)?)\b/i, "Valenzuela"],
  [/\b(malabon(?:\s*city)?)\b/i, "Malabon"],
  [/\b(navotas(?:\s*city)?)\b/i, "Navotas"],
  [/\b(marikina(?:\s*city)?)\b/i, "Marikina"],
  [/\b(pasig(?:\s*city)?)\b/i, "Pasig"],
  [/\b(mandaluyong(?:\s*city)?)\b/i, "Mandaluyong"],
  [/\b(san\s*juan(?:\s*city)?)\b/i, "San Juan"],
  [/\b(makati(?:\s*city)?)\b/i, "Makati"],
  [/\b(taguig(?:\s*city)?|bgc|fort\s*bonifacio)\b/i, "Taguig"],
  [/\b(pasay(?:\s*city)?)\b/i, "Pasay"],
  [/\b(para[nñ]aque(?:\s*city)?)\b/i, "Paranaque"],
  [/\b(las\s*pi[nñ]as(?:\s*city)?)\b/i, "Las Pinas"],
  [/\b(muntinlupa(?:\s*city)?|alabang)\b/i, "Muntinlupa"],
  [/\b(caloocan(?:\s*city)?|kalookan)\b/i, "Caloocan"],
  [/\b(pateros)\b/i, "Pateros"],

  // Rizal & Greater Manila
  [/\b(cainta)\b/i, "Cainta"],
  [/\b(taytay)\b/i, "Taytay"],
  [/\b(antipolo)\b/i, "Antipolo"],
  [/\b(san\s*mateo)\b/i, "San Mateo"],
  [/\b(rodriguez|montalban)\b/i, "Rodriguez"],

  // Pampanga & Central Luzon Expressways
  [/\b(san\s*simon)\b/i, "San Simon, Pampanga"],
  [/\b(san\s*fernando(?:\s*pampanga)?)\b/i, "San Fernando, Pampanga"],
  [/\b(angeles(?:\s*city)?)\b/i, "Angeles City, Pampanga"],
  [/\b(mabalacat(?:\s*city)?)\b/i, "Mabalacat, Pampanga"],
  [/\b(apalit)\b/i, "Apalit, Pampanga"],
  [/\b(candaba)\b/i, "Candaba, Pampanga"],
  [/\b(guagua)\b/i, "Guagua, Pampanga"],
  [/\b(lubao)\b/i, "Lubao, Pampanga"],
  [/\b(bacolor)\b/i, "Bacolor, Pampanga"],
  [/\b(pampanga)\b/i, "Pampanga"],
  [/\b(tarlac(?:\s*city)?)\b/i, "Tarlac"],
  [/\b(bataan|dinalupihan|hermosa)\b/i, "Bataan"],
  [/\b(zambales|olongapo)\b/i, "Zambales"],
  [/\b(nueva\s*ecija)\b/i, "Nueva Ecija"],

  // Bulacan & NLEX North Corridors
  [/\b(bocaue)\b/i, "Bocaue, Bulacan"],
  [/\b(marilao)\b/i, "Marilao, Bulacan"],
  [/\b(meycauayan)\b/i, "Meycauayan, Bulacan"],
  [/\b(balagtas)\b/i, "Balagtas, Bulacan"],
  [/\b(guiguinto)\b/i, "Guiguinto, Bulacan"],
  [/\b(malolos(?:\s*city)?)\b/i, "Malolos, Bulacan"],
  [/\b(calumpit)\b/i, "Calumpit, Bulacan"],
  [/\b(pulilan)\b/i, "Pulilan, Bulacan"],
  [/\b(baliuag|baliwag)\b/i, "Baliwag, Bulacan"],
  [/\b(obando)\b/i, "Obando, Bulacan"],
  [/\b(bulacan)\b/i, "Bulacan"],

  // Cavite, Laguna, Batangas & SLEX Corridors
  [/\b(bacoor)\b/i, "Bacoor, Cavite"],
  [/\b(imus)\b/i, "Imus, Cavite"],
  [/\b(kawit)\b/i, "Kawit, Cavite"],
  [/\b(noveleta)\b/i, "Noveleta, Cavite"],
  [/\b(cavite)\b/i, "Cavite"],
  [/\b(laguna)\b/i, "Laguna"],
  [/\b(san\s*pedro(?:\s*laguna)?)\b/i, "San Pedro, Laguna"],
  [/\b(bi[nñ]an)\b/i, "Binan, Laguna"],
  [/\b(santa\s*rosa|sta\.?\s*rosa)\b/i, "Santa Rosa, Laguna"],
  [/\b(cabuyao)\b/i, "Cabuyao, Laguna"],
  [/\b(calamba(?:\s*city)?)\b/i, "Calamba, Laguna"],
  [/\b(batangas(?:\s*city)?)\b/i, "Batangas"],
];

/**
 * Authoritative Flood Hotspots & Expressway Interchanges Dictionary
 */
export interface HotspotEntry {
  patterns: RegExp[];
  roadName: string;
  landmark: string;
  city: string;
  coordinates: GeoCoordinate;
}

export const KNOWN_HOTSPOTS: HotspotEntry[] = [
  // Expressways & Interchanges
  {
    patterns: [/\b(?:san\s*simon|san\s*simon\s*interchange|san\s*simon\s*exit|km\s*54)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "San Simon Interchange",
    city: "San Simon, Pampanga",
    coordinates: { lat: 14.9965, lng: 120.7831 },
  },
  {
    patterns: [/\b(?:candaba\s*viaduct|viaduct)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "Candaba Viaduct",
    city: "Apalit, Pampanga",
    coordinates: { lat: 14.9850, lng: 120.7890 },
  },
  {
    patterns: [/\b(?:san\s*fernando\s*interchange|san\s*fernando\s*exit)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "San Fernando Interchange",
    city: "San Fernando, Pampanga",
    coordinates: { lat: 15.0450, lng: 120.6970 },
  },
  {
    patterns: [/\b(?:bocaue\s*interchange|bocaue\s*exit|bocaue\s*toll)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "Bocaue Interchange",
    city: "Bocaue, Bulacan",
    coordinates: { lat: 14.8016, lng: 120.9427 },
  },
  {
    patterns: [/\b(?:marilao\s*interchange|marilao\s*exit)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "Marilao Interchange",
    city: "Marilao, Bulacan",
    coordinates: { lat: 14.7644, lng: 120.9576 },
  },
  {
    patterns: [/\b(?:meycauayan\s*interchange|meycauayan\s*exit)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "Meycauayan Interchange",
    city: "Meycauayan, Bulacan",
    coordinates: { lat: 14.7368, lng: 120.9632 },
  },
  {
    patterns: [/\b(?:balintawak\s*cloverleaf|balintawak\s*toll)\b/i],
    roadName: "North Luzon Expressway (NLEX)",
    landmark: "Balintawak Cloverleaf",
    city: "Quezon City",
    coordinates: { lat: 14.6575, lng: 121.0040 },
  },
  {
    patterns: [/\b(?:bicutan\s*interchange|bicutan\s*exit)\b/i],
    roadName: "South Luzon Expressway (SLEX)",
    landmark: "Bicutan Interchange",
    city: "Parañaque",
    coordinates: { lat: 14.4886, lng: 121.0475 },
  },
  {
    patterns: [/\b(?:sucat\s*interchange|sucat\s*exit)\b/i],
    roadName: "South Luzon Expressway (SLEX)",
    landmark: "Sucat Interchange",
    city: "Muntinlupa",
    coordinates: { lat: 14.4533, lng: 121.0478 },
  },
  {
    patterns: [/\b(?:alabang\s*viaduct|alabang\s*exit)\b/i],
    roadName: "South Luzon Expressway (SLEX)",
    landmark: "Alabang Viaduct",
    city: "Muntinlupa",
    coordinates: { lat: 14.4172, lng: 121.0441 },
  },

  // Major Metros & Landmarked Establishments
  {
    patterns: [/\b(?:pegasus|sct\.?\s*chuatoco)\b/i],
    roadName: "Quezon Avenue",
    landmark: "Pegasus (Scout Chuatoco)",
    city: "Quezon City",
    coordinates: { lat: 14.6348, lng: 121.0189 },
  },
  {
    patterns: [/\b(?:fatima\s*university|fatima\s*hospital|fatima\s*valenzuela)\b/i],
    roadName: "MacArthur Highway",
    landmark: "Fatima University",
    city: "Valenzuela",
    coordinates: { lat: 14.6750, lng: 120.9817 },
  },
  {
    patterns: [/\b(?:ust|university\s*of\s*santo\s*tomas)\b/i],
    roadName: "España Blvd",
    landmark: "UST (España)",
    city: "Manila",
    coordinates: { lat: 14.6095, lng: 120.9898 },
  },
  {
    patterns: [/\b(?:talayan\s*village|talayan)\b/i],
    roadName: "G. Araneta Avenue",
    landmark: "Talayan Village",
    city: "Quezon City",
    coordinates: { lat: 14.6369, lng: 121.0094 },
  },
  {
    patterns: [/\b(?:cityland|dela\s*rosa)\b/i],
    roadName: "Buendia / Gil Puyat",
    landmark: "Cityland Dela Rosa",
    city: "Makati",
    coordinates: { lat: 14.5578, lng: 121.0125 },
  },
];

/**
 * Matches known hotspots or expressways from text
 */
export function matchHotspotFromText(text: string): HotspotEntry | null {
  for (const hotspot of KNOWN_HOTSPOTS) {
    if (hotspot.patterns.some((p) => p.test(text))) {
      return hotspot;
    }
  }
  return null;
}

/**
 * Extracts city/LGU from raw text using canonical Metro Manila dictionary & PSGC nationwide index
 */
export function extractCityFromText(text: string): string | null {
  // 1. Check CITIES_REGEX (canonical Metro Manila LGUs & common hubs)
  for (const [regex, canonicalCity] of CITIES_REGEX) {
    if (regex.test(text)) {
      return canonicalCity;
    }
  }

  // 2. Check PSGC entity lookup (handles all 1,647 cities & municipalities nationwide)
  const psgc = extractPsgcEntityFromText(text);
  if (psgc && psgc.city) {
    if (psgc.province && psgc.province !== "Metro Manila") {
      return `${psgc.city}, ${psgc.province}`;
    }
    return psgc.city;
  }

  if (psgc && psgc.province) {
    return psgc.province;
  }

  return null;
}

/**
 * Extracts normalized road name, intersection landmark, and cardinal direction
 */
export function extractRoadAndLandmark(line: string): {
  roadName: string | null;
  landmark: string | null;
  direction?: "NB" | "SB" | "EB" | "WB" | "BOTH";
} {
  let cleaned = line.replace(/^[-•*–—\d+\.]\s*/, "").trim();

  // Extract Direction
  let direction: "NB" | "SB" | "EB" | "WB" | "BOTH" | undefined = undefined;
  if (/\b(nb\/sb|sb\/nb|both\s*bounds?|both\s*directions?)\b/i.test(cleaned)) {
    direction = "BOTH";
  } else if (/\b(northbound|nb)\b/i.test(cleaned)) {
    direction = "NB";
  } else if (/\b(southbound|sb)\b/i.test(cleaned)) {
    direction = "SB";
  } else if (/\b(eastbound|eb)\b/i.test(cleaned)) {
    direction = "EB";
  } else if (/\b(westbound|wb)\b/i.test(cleaned)) {
    direction = "WB";
  }

  // Strip trailing depth & passability
  const beforeDepth =
    cleaned.split(
      /\s*-\s*(?:below|half|above|gutter|knee|tire|waist|chest|passable|not\s*passable|subsided|hanggang|pantuhod|pambaywang)/i
    )[0] || cleaned;

  // Find road name
  let matchedRoad: string | null = null;
  for (const [regex, canonicalName] of ROAD_SYNONYMS) {
    if (regex.test(beforeDepth)) {
      matchedRoad = canonicalName;
      break;
    }
  }

  // Extract landmark / intersection
  let landmark: string | null = null;
  const connectorRegex =
    /\b(near|malapit\s*sa|tapat\s*ng|in\s*front\s*of|infront|fronting|corner(?:\s*of)?|cor\.?|kanto\s*ng|sa\s*may|before|after)\s+([^,\.\n]+?)(?:\s+(?:in|sa|along|dahil|as\s*of|due\s*to)\b|[,\.\n]|$)/i;
  const connMatch = beforeDepth.match(connectorRegex);

  if (connMatch && connMatch[2]) {
    landmark = connMatch[2]
      .replace(/\s*(?:nb\/sb|sb\/nb|nb|sb|eb|wb|northbound|southbound|eastbound|westbound|\(.*?\))\s*$/i, "")
      .trim();
  } else if (beforeDepth.includes("(")) {
    const pMatch = beforeDepth.match(/\((.*?)\)/);
    if (pMatch) {
      landmark = pMatch[1].trim();
    }
  }

  // Check known hotspot dictionary as fallback
  if (!landmark) {
    const hotspot = matchHotspotFromText(cleaned);
    if (hotspot) {
      matchedRoad = matchedRoad || hotspot.roadName;
      landmark = hotspot.landmark;
    }
  }

  // Fallback: If no connector word, extract landmark from remaining tokens after stripping road name
  if (!landmark && matchedRoad) {
    const leftover = beforeDepth
      .replace(
        /\b(macarthur|mcarthur|highway|espa[nñ]a|blvd|boulevard|quezon|ave|avenue|edsa|taft|c-?3|c-?5|road|roxas|araneta|g\.?\s*araneta|sr\.?\s*ave|e\.?\s*rodriguez|e\.?\s*rod|marcos|aurora|boni|bonifacio|dr\.?\s*a\.?\s*santos|sucat|rizal|jose\s*abad\s*santos|abad\s*santos|un|u\.?\s*n\.?|quirino|pedro\s*gil|p\.?\s*ocampo|vito\s*cruz|f\.?\s*sevilla|gov\.?\s*pascual|m\.?\s*h\.?\s*del\s*pilar|del\s*pilar|st|street|don\s*basilio\s*bautista|hulong\s*duhat|a\.?\s*bonifacio|timog|tomas\s*morato|sct\.?\s*chuatoco)\b/gi,
        ""
      )
      .replace(/\s*(?:nb\/sb|sb\/nb|nb|sb|eb|wb|northbound|southbound|eastbound|westbound|\(.*?\))\s*$/i, "")
      .trim();
    if (leftover.length > 1) {
      landmark = leftover;
    }
  }

  return {
    roadName: matchedRoad,
    landmark: landmark || null,
    direction,
  };
}

/**
 * Natural language entity extractor for news / social sentences
 * (e.g. "There is a knee level deep near Pegasus in Quezon City")
 */
export function extractConversationalEntities(text: string): {
  roadName: string | null;
  landmark: string | null;
  city: string | null;
  barangay?: string;
  province?: string;
  direction?: "NB" | "SB" | "EB" | "WB" | "BOTH";
  coordinates?: GeoCoordinate;
} {
  const psgc = extractPsgcEntityFromText(text);
  const city = extractCityFromText(text);
  const barangay = psgc?.barangay;
  const province = psgc?.province;

  // Extract Road
  let roadName: string | null = null;
  for (const [regex, canonicalName] of ROAD_SYNONYMS) {
    if (regex.test(text)) {
      roadName = canonicalName;
      break;
    }
  }

  // Extract Landmark using conversational connectors
  let landmark: string | null = null;
  const landmarkMatch = text.match(
    /\b(?:near|malapit\s*sa|tapat\s*ng|in\s*front\s*of|infront|fronting|sa\s*may|kanto\s*ng|corner(?:\s*of)?|cor\.?)\s+([A-Z0-9][A-Za-z0-9\s'\.\-&]+?)(?:\s+(?:in|sa|along|sa\s*kahabaan|dahil|due\s*to|as\s*of|northbound|southbound)\b|[,\.\n]|$)/i
  );

  if (landmarkMatch && landmarkMatch[1]) {
    const rawLandmark = landmarkMatch[1].trim();
    // Exclude if extracted word is just a city name
    if (!CITIES_REGEX.some(([r]) => r.test(rawLandmark))) {
      landmark = rawLandmark;
    }
  }

  // If a barangay was extracted and no explicit landmark exists, use the barangay
  if (barangay && !landmark) {
    landmark = `Brgy. ${barangay}`;
  }

  // Check known hotspots
  const hotspot = matchHotspotFromText(text);
  let resolvedCity = city;
  let resolvedCoords: GeoCoordinate | undefined = undefined;

  if (hotspot) {
    roadName = roadName || hotspot.roadName;
    landmark = landmark || hotspot.landmark;
    resolvedCity = resolvedCity || hotspot.city;
    resolvedCoords = hotspot.coordinates;
  }

  // If Road is NLEX and text mentions Pampanga / San Simon / Candaba or is a generic NLEX flood report
  if (
    (roadName === "North Luzon Expressway (NLEX)" || /\bnlex\b/i.test(text)) &&
    (/\b(?:pampanga|san\s*simon|candaba|stuck|stranded|interchange)\b/i.test(text) || !landmark)
  ) {
    if (!landmark) landmark = "San Simon Interchange";
    if (!resolvedCity) resolvedCity = "San Simon, Pampanga";
    if (!resolvedCoords) resolvedCoords = { lat: 14.9965, lng: 120.7831 };
  }

  // Extract Direction
  let direction: "NB" | "SB" | "EB" | "WB" | "BOTH" | undefined = undefined;
  if (/\b(nb\/sb|sb\/nb|both\s*bounds?|both\s*directions?)\b/i.test(text)) {
    direction = "BOTH";
  } else if (/\b(northbound|nb)\b/i.test(text)) {
    direction = "NB";
  } else if (/\b(southbound|sb)\b/i.test(text)) {
    direction = "SB";
  } else if (/\b(eastbound|eb)\b/i.test(text)) {
    direction = "EB";
  } else if (/\b(westbound|wb)\b/i.test(text)) {
    direction = "WB";
  }

  return {
    roadName,
    landmark,
    city: resolvedCity,
    barangay,
    province,
    direction,
    coordinates: resolvedCoords,
  };
}

/**
 * Classifies author handle into standardized AdvisorySource
 */
export interface AuthorDetails {
  source: AdvisorySource;
  authorHandle: string;
  authorName: string;
}

/**
 * Extracts normalized source type, author handle, and human-friendly profile name.
 * Resolves outlet identity from handle, post URL, or text mentions.
 */
export function extractAuthorDetails(
  authorRaw?: string,
  postUrl?: string,
  text?: string
): AuthorDetails {
  let clean = (authorRaw || "").replace(/^@/, "").trim();

  // If authorRaw is generic or missing, extract handle from postUrl (e.g. https://x.com/inquirerdotnet/status/...)
  if (!clean || /^(news|search|feed|admin|bot|official|unknown|null|undefined)$/i.test(clean)) {
    const urlMatch = (postUrl || "").match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)\/status/i);
    if (urlMatch && urlMatch[1] && !/^(i|status|home|search|news)$/i.test(urlMatch[1])) {
      clean = urlMatch[1];
    }
  }

  // If still generic or missing, infer from content / links
  const combinedText = `${text || ""} ${postUrl || ""}`.toLowerCase();
  if (!clean || /^(news|search|feed|admin|bot|official|unknown|null|undefined)$/i.test(clean)) {
    if (combinedText.includes("gmanews") || combinedText.includes("gmanetwork.com") || combinedText.includes("gma integrated news")) {
      clean = "gmanews";
    } else if (combinedText.includes("abscbn") || combinedText.includes("abs-cbn") || combinedText.includes("news.abs-cbn.com")) {
      clean = "ABSCBNNews";
    } else if (combinedText.includes("news5") || combinedText.includes("news5ph") || combinedText.includes("interaksyon")) {
      clean = "News5PH";
    } else if (combinedText.includes("inquirer") || combinedText.includes("inquirer.net")) {
      clean = "inquirerdotnet";
    } else if (combinedText.includes("rappler") || combinedText.includes("rappler.com")) {
      clean = "rapplerdotcom";
    } else if (combinedText.includes("manilabulletin") || combinedText.includes("mb.com.ph") || combinedText.includes("manila bulletin")) {
      clean = "manilabulletin";
    } else if (combinedText.includes("philstar") || combinedText.includes("philippinestar")) {
      clean = "PhilippineStar";
    }
  }

  const lower = clean.toLowerCase();

  if (lower.includes("mmda")) {
    return { source: "MMDA", authorHandle: clean || "MMDA", authorName: "MMDA" };
  }
  if (lower.includes("ndrrmc")) {
    return { source: "NDRRMC", authorHandle: clean || "NDRRMC_OpCen", authorName: "NDRRMC" };
  }
  if (lower.includes("pagasa") || lower.includes("dost")) {
    return { source: "PAGASA", authorHandle: clean || "dost_pagasa", authorName: "DOST-PAGASA" };
  }
  if (lower.includes("gmanews") || lower === "gma") {
    return { source: "NEWS", authorHandle: "gmanews", authorName: "GMA News" };
  }
  if (lower.includes("abscbn") || lower.includes("abs-cbn")) {
    return { source: "NEWS", authorHandle: "ABSCBNNews", authorName: "ABS-CBN News" };
  }
  if (lower.includes("news5")) {
    return { source: "NEWS", authorHandle: "News5PH", authorName: "News5" };
  }
  if (lower.includes("inquirer")) {
    return { source: "NEWS", authorHandle: "inquirerdotnet", authorName: "Inquirer" };
  }
  if (lower.includes("rappler")) {
    return { source: "NEWS", authorHandle: "rapplerdotcom", authorName: "Rappler" };
  }
  if (lower.includes("manilabulletin") || lower === "bulletin") {
    return { source: "NEWS", authorHandle: "manilabulletin", authorName: "Manila Bulletin" };
  }
  if (lower.includes("philstar") || lower.includes("philippinestar")) {
    return { source: "NEWS", authorHandle: "PhilippineStar", authorName: "The Philippine STAR" };
  }
  if (lower.includes("dzbb")) {
    return { source: "NEWS", authorHandle: "dzbb", authorName: "Super Radyo DZBB" };
  }
  if (lower.includes("dzmm") || lower.includes("teleradyo")) {
    return { source: "NEWS", authorHandle: "dzmm", authorName: "DZMM TeleRadyo" };
  }
  if (lower.includes("pna")) {
    return { source: "NEWS", authorHandle: "pna_gov_ph", authorName: "Philippine News Agency" };
  }
  if (lower.includes("sunstar")) {
    return { source: "NEWS", authorHandle: "sunstaronline", authorName: "SunStar Philippines" };
  }
  if (lower.includes("abante")) {
    return { source: "NEWS", authorHandle: "abante_tonite", authorName: "Abante News" };
  }
  if (lower.includes("cnnph")) {
    return { source: "NEWS", authorHandle: "cnnphilippines", authorName: "CNN Philippines" };
  }

  // If handle is a specific non-generic username
  if (clean && !/^(news|search|feed|admin|bot|official|unknown|null|undefined)$/i.test(clean)) {
    return {
      source: "NEWS",
      authorHandle: clean,
      authorName: `@${clean}`,
    };
  }

  // Fallback for untagged general news reports (never return @NEWS as a handle)
  return {
    source: "NEWS",
    authorHandle: "",
    authorName: "News Report",
  };
}

/**
 * Classifies author handle into standardized AdvisorySource (backward-compatible helper)
 */
export function classifyAdvisorySource(author: string): AdvisorySource {
  return extractAuthorDetails(author).source;
}

/**
 * Evaluates whether a post is describing a genuine active/recent physical road flood incident,
 * as opposed to general news, government projects (retarding basin, pumping stations),
 * political statements, hearings, opinion, or historical background commentary.
 */
export function isActualRoadFloodIncident(text: string): boolean {
  if (!text || typeof text !== "string") return false;
  if (isInternationalOrForeignEvent(text)) return false;

  const lower = text.toLowerCase();

  // Exclude general governance/investigation/project articles that aren't ground passability updates
  const isGovernmentInspectionOrPolicy =
    /\b(?:aerial\s*inspection|aerial\s*survey|inspection\s*aimed\s*to\s*assess|assess\s*the\s*extent\s*of\s*(?:flooding|damage)|inspeksyon|inspeksiyon)\b/i.test(lower) ||
    /\b(?:retarding\s*basin|pumping\s*station\s*ahead|two-storey\s*houses|long-term\s*solution|senate\s*probe|house\s*probe|election|bishop\s*urges)\b/i.test(lower);

  if (isGovernmentInspectionOrPolicy && !/\b(?:stuck|stranded|closed|not\s*passable|impassable|knee|gutter|waist|chest|submerged)\b/i.test(lower)) {
    return false;
  }

  // 1. Definite road flood depth terms (English & Tagalog)
  const hasExplicitDepth =
    /\b(?:knee|gutter|ankle|waist|chest|tire|half\s*tire|below\s*gutter|above\s*gutter)\s*(?:deep|level)\b/i.test(lower) ||
    /\b(?:hanggang|pantuhod|pambaywang|pandibdib|lagpas)\s*(?:tuhod|baywang|bukong-bukong|sakong|dibdib|tao|gulong)\b/i.test(lower) ||
    /\b(?:lubog\s*sa\s*baha|mataas\s*ang\s*tubig|baha\s*ang\s*kalsada|taas\s*ng\s*baha|lalim\s*ng\s*baha)\b/i.test(lower) ||
    /\(?\b\d+(?:\.\d+)?\s*(?:-\s*\d+(?:\.\d+)?)?\s*(?:inches|inch|in\.|cm|sentimetro)\s*(?:deep|level|ang\s*lalim|ang\s*taas)?\)?/i.test(lower);

  // 2. Definite road passability & highway disruptions
  const hasExplicitPassability =
    /\b(?:not\s*passable\s*to\s*light|not\s*passable\s*to\s*all|passable\s*to\s*all|passable\s*to\s*heavy|impassable)\b/i.test(lower) ||
    /\b(?:di\s*madaanan\s*ng\s*(?:mga\s*)?magagaan|di\s*madaanan\s*ng\s*lahat|sarado\s*sa\s*trapiko|sarado\s*sa\s*lahat)\b/i.test(lower) ||
    /\b(?:flood\s*subsided|gutter\s*subsided|humupa\s*na\s*ang\s*baha|hupa\s*na\s*ang\s*tubig)\b/i.test(lower) ||
    /\b(?:stuck|stranded|na-stranded|na-trap|inabot\s*ng\s*baha|submerged|inundated)\b.*?\b(?:due\s*to\s*(?:flooding|baha)|dahil\s*sa\s*baha|flooding|baha)\b/i.test(lower) ||
    /\b(?:flooding\s*(?:that\s*)?(?:still\s*)?hasn't\s*subsided|baha\s*na\s*di\s*pa\s*humuhupa|baha\s*pa\s*rin)\b/i.test(lower) ||
    /\b(?:flooding\s*prompts\s*(?:diversions|rerouting|closure)|prompts\s*diversions|dahil\s*sa\s*baha\s*(?:ay\s*)?(?:isinara|sarado|rerouting))\b/i.test(lower) ||
    /\b(?:routes\s*(?:were|are)\s*flooded|roads\s*(?:were|are)\s*flooded|alternative\s*routes?\s*(?:are|were)\s*flooded|binaha\s*ang\s*alternatibong\s*daan)\b/i.test(lower) ||
    /\b(?:entry\s*points?|exits?|interchange|lanes?)\s*(?:on|along|at)?\s*(?:the\s*)?[A-Za-z0-9\s-]+\s*(?:were|are|was|is)?\s*(?:closed|flooded|inundated|impassable|submerged)\b/i.test(lower);

  // 3. Definite active road flood occurrence on a street/road/intersection/expressway
  const hasActiveRoadFlooding =
    /\b(?:baha\s*sa|baha\s*ngayon\s*sa|binaha\s*ang|binabaha\s*ang|tubig\s*baha\s*sa|pagbaha\s*sa\s*kahabaan|bahang\s*nararanasan\s*sa)\b/i.test(lower) ||
    /\b(?:flooded\s*(?:along|in|at|near|portion)|flooding\s*(?:along|in|at|near|reported|submerges|inundates)|high\s*water\s*(?:along|on|at))\b/i.test(lower) ||
    /\b(?:flood\s*alert|flood\s*advisory|road\s*condition:\s*flooded|as\s*of\s*\d+:\d+\s*(?:am|pm)?\s*[-–—]\s*(?:flood|gutter|knee|tire|waist|chest|subsided))\b/i.test(lower) ||
    /\b(?:nlex|slex|sctex|tplex|expressway|interchange)\b.*?\b(?:flooded|flooding|binaha|lubog\s*sa\s*baha|tubig\s*baha)\b/i.test(lower);

  // 4. Check for multi-location bulletin formats (e.g. MMDA lines with "___CITY_" or "- Road (Landmark) - Depth")
  const isMultiLocationBulletin = /(?:___CITY_|\b(?:VALENZUELA|MANILA|QUEZON|MALABON|PASAY|CALOOCAN|MAKATI|TAGUIG|PASIG)\s+CITY\s*:)/i.test(text);

  if (hasExplicitDepth || hasExplicitPassability || hasActiveRoadFlooding || isMultiLocationBulletin) {
    return true;
  }

  return false;
}

/**
 * Asynchronously parses a raw agency or news social post into a single ReportedAdvisory
 * with all individual flood locations dynamically resolved into `locationPins` and geocoded.
 */
export async function parseAdvisoryPostAsync(item: RawTweetInput): Promise<ReportedAdvisory> {
  const { source, authorHandle, authorName } = extractAuthorDetails(item.author, item.url, item.text);
  const rawText = item.text || "";

  // 1. Foreign / International Noise Filter (e.g. Nepal, Bangladesh, Spain floods)
  const isForeign = isInternationalOrForeignEvent(rawText);

  const normalizedText = normalizeFloodReportText(rawText);
  const lower = normalizedText.toLowerCase();

  // Classify Category & Actual Road Flood Status
  const isSuspension = /(walang\s*pasok|class\s*suspension|suspended|no\s*classes)/i.test(lower);
  const isFloodReport = !isForeign && isActualRoadFloodIncident(rawText);
  const isWeather = /(rainfall|thunderstorm|monsoon|habagat|amihan|typhoon|bagyo|low pressure|lpa|heavy rain)/i.test(lower);

  let category: "FLOOD" | "WEATHER" | "SUSPENSION" | "BULLETIN" | "NEWS" = "BULLETIN";
  if (isFloodReport) {
    category = "FLOOD";
  } else if (isSuspension) {
    category = "SUSPENSION";
  } else if (isWeather) {
    category = "WEATHER";
  } else if (source === "NEWS") {
    category = "NEWS";
  }

  const cleanId = String(item.id || "").replace(/^(tweet|status)[-_]/i, "").trim();
  const cleanPostUrl = (item.url || `https://x.com/${authorHandle || source}/status/${cleanId}`).replace(
    /\/status\/(?:tweet|status)-/i,
    "/status/"
  );

  // If this is an international disaster or general news/commentary (not active road flood), return clean non-flood advisory (NO MAP PIN, NO PASSABLE_ALL BADGE)
  if (isForeign || !isFloodReport) {
    const isOfficialWeatherAlert =
      isWeather && (source === "PAGASA" || source === "NDRRMC" || /\b(?:bulletin|signal\s*no|weather\s*advisory|gale\s*warning|forecast|track|heavy\s*rainfall)\b/i.test(lower));

    const passabilityLabel = isSuspension
      ? "Class Suspension"
      : isOfficialWeatherAlert
      ? "Weather Update"
      : source === "NEWS"
      ? "News Report"
      : "General Bulletin";

    return {
      id: cleanId,
      source,
      authorHandle,
      authorName,
      publishedAt: item.createdAt || new Date().toISOString(),
      rawText: item.text,
      category: isSuspension ? "SUSPENSION" : isOfficialWeatherAlert ? "WEATHER" : source === "NEWS" ? "NEWS" : "BULLETIN",
      isFloodReport: false,
      depthLevel: "UNKNOWN",
      depthInches: 0,
      passability: "PASSABLE_ALL",
      status: "ACTIVE",
      severity: "NORMAL",
      badgeColor: "blue",
      passabilityLabel,
      coordinates: null,
      photoUrls: item.photoUrls || [],
      postUrl: cleanPostUrl,
    };
  }

  // 2. Check if this is a Multi-Bullet Bulletin (e.g. MMDA Format)
  const lines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const locationPins: AdvisoryLocationPin[] = [];
  let currentCity = "";
  const hasCityHeaders = lines.some((l) => /^___CITY_([A-Z\s]+)___$/i.test(l));

  if (hasCityHeaders) {
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const cityMatch = line.match(/^___CITY_([A-Z\s]+)___$/i);
      if (cityMatch && cityMatch[1]) {
        currentCity = cityMatch[1].trim();
        continue;
      }

      if (/^(date|time|reported floodings|floodings|advisory|flood alert|please refresh|stay safe|for more updates):?/i.test(line)) {
        continue;
      }

      const hasFloodKeywords = /(gutter|knee|tire|waist|chest|passable|not passable|subsided|inches|deep|pantuhod|pambaywang)/i.test(line);

      if (line.length > 3 && hasFloodKeywords) {
        const { roadName, landmark, direction } = extractRoadAndLandmark(line);
        const depthData = extractDepthAndPassability(line);
        const coords = await geocodeAdvisoryLocation(roadName || undefined, landmark || undefined, currentCity);

        locationPins.push({
          id: `${cleanId}_pin${locationPins.length}`,
          roadName: roadName || undefined,
          landmark: landmark || (currentCity ? `${currentCity}` : undefined),
          city: currentCity || undefined,
          direction,
          depthLevel: depthData.depthLevel,
          depthInches: depthData.depthInches,
          passability: depthData.passability,
          severity: depthData.severity,
          badgeColor: depthData.badgeColor,
          passabilityLabel: depthData.passabilityLabel,
          authorHandle,
          authorName,
          coordinates: coords || { lat: 0, lng: 0 },
          rawLine: line,
        });
      }
    }
  }

  // 3. Conversational / Single Sentence Flood News Post (e.g. "There is a knee level deep near Pegasus in Quezon City")
  if (locationPins.length === 0) {
    const singleDepth = extractDepthAndPassability(rawText);
    const entities = extractConversationalEntities(rawText);
    let coords = entities.coordinates || null;

    if (!coords || coords.lat === 0 || coords.lng === 0) {
      coords = await geocodeAdvisoryLocation(
        entities.roadName || undefined,
        entities.landmark || undefined,
        entities.city || undefined
      );
    }

    const passabilityLabel =
      singleDepth.passabilityLabel === "Advisory Bulletin"
        ? singleDepth.depthLevel !== "UNKNOWN"
          ? "Flood Advisory"
          : "Passable to All Vehicles"
        : singleDepth.passabilityLabel;

    if (coords && coords.lat !== 0 && coords.lng !== 0) {
      locationPins.push({
        id: `${cleanId}_pin0`,
        roadName: entities.roadName || undefined,
        landmark: entities.landmark || entities.roadName || (entities.city ? `${entities.city}` : undefined),
        city: entities.city || undefined,
        direction: entities.direction,
        depthLevel: singleDepth.depthLevel,
        depthInches: singleDepth.depthInches,
        passability: singleDepth.passability,
        severity: singleDepth.severity,
        badgeColor: singleDepth.badgeColor,
        passabilityLabel,
        authorHandle,
        authorName,
        coordinates: coords,
        rawLine: rawText.length > 120 ? `${rawText.slice(0, 117)}...` : rawText,
      });
    }

    const primaryCoords = coords || null;

    return {
      id: cleanId,
      source,
      authorHandle,
      authorName,
      publishedAt: item.createdAt || new Date().toISOString(),
      rawText: item.text,
      category: "FLOOD",
      isFloodReport: true,
      depthLevel: singleDepth.depthLevel,
      depthInches: singleDepth.depthInches,
      passability: singleDepth.passability,
      status: singleDepth.status,
      severity: singleDepth.severity,
      badgeColor: singleDepth.badgeColor,
      passabilityLabel,
      roadName: entities.roadName || undefined,
      landmark: entities.landmark || undefined,
      direction: entities.direction,
      coordinates: primaryCoords,
      locationPins: locationPins.length > 0 ? locationPins : undefined,
      photoUrls: item.photoUrls || [],
      postUrl: cleanPostUrl,
    };
  }

  // Calculate Overall Depth & Passability for Multi-Bullet Posts
  let overallDepthLevel: FloodDepthLevel = "UNKNOWN";
  let overallDepthInches = 0;
  let overallPassability: AdvisoryPassability = "PASSABLE_ALL";
  let overallSeverity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL" = "NORMAL";
  let overallBadgeColor: "red" | "orange" | "yellow" | "green" | "blue" = "blue";
  let overallPassabilityLabel = "Advisory Bulletin";
  let primaryCoords: { lat: number; lng: number } | null = null;
  let primaryRoadName: string | undefined = undefined;
  let primaryLandmark: string | undefined = undefined;
  let primaryDirection: "NB" | "SB" | "EB" | "WB" | "BOTH" | undefined = undefined;

  if (locationPins.length > 0) {
    primaryCoords = locationPins[0].coordinates;
    primaryRoadName = locationPins.length === 1 ? locationPins[0].roadName : `${locationPins.length} Flood Locations`;
    primaryLandmark = locationPins.length === 1 ? locationPins[0].landmark : undefined;
    primaryDirection = locationPins.length === 1 ? locationPins[0].direction : undefined;

    const hasCritical = locationPins.some((p) => p.severity === "CRITICAL");
    const hasAlarm = locationPins.some((p) => p.severity === "ALARM");
    const maxInches = Math.max(...locationPins.map((p) => p.depthInches));
    overallDepthInches = maxInches;

    const allSubsided = locationPins.every((p) => p.depthLevel === "SUBSIDED");

    if (allSubsided) {
      overallSeverity = "NORMAL";
      overallBadgeColor = "green";
      overallPassability = "SUBSIDED";
      overallDepthLevel = "SUBSIDED";
      overallPassabilityLabel = "Flood Subsided";
    } else if (hasCritical) {
      overallSeverity = "CRITICAL";
      overallBadgeColor = "red";
      overallPassability = "NOT_PASSABLE_ALL";
      overallDepthLevel = "WAIST";
      overallPassabilityLabel = "Not Passable (All Vehicles)";
    } else if (hasAlarm) {
      overallSeverity = "ALARM";
      overallBadgeColor = "orange";
      overallPassability = "NOT_PASSABLE_LIGHT";
      overallDepthLevel = "KNEE";
      overallPassabilityLabel = "Not Passable to Light Vehicles";
    } else {
      overallSeverity = "ALERT";
      overallBadgeColor = "yellow";
      overallPassability = "PASSABLE_ALL";
      overallDepthLevel = "GUTTER";
      overallPassabilityLabel = "Passable to All Vehicles";
    }
  }

  return {
    id: cleanId,
    source,
    authorHandle,
    authorName,
    publishedAt: item.createdAt || new Date().toISOString(),
    rawText: item.text,
    category: "FLOOD",
    isFloodReport: true,
    depthLevel: overallDepthLevel,
    depthInches: overallDepthInches,
    passability: overallPassability,
    status: overallDepthLevel === "SUBSIDED" ? "SUBSIDED" : "ACTIVE",
    severity: overallSeverity,
    badgeColor: overallBadgeColor,
    passabilityLabel: overallPassabilityLabel,
    roadName: primaryRoadName,
    landmark: primaryLandmark,
    direction: primaryDirection,
    coordinates: primaryCoords,
    locationPins: locationPins.length > 0 ? locationPins : undefined,
    photoUrls: item.photoUrls || [],
    postUrl: cleanPostUrl,
  };
}

/**
 * Synchronous variant of parseAdvisoryPostAsync (uses cached coordinates)
 */
export function parseAdvisoryPost(item: RawTweetInput): ReportedAdvisory {
  const { source, authorHandle, authorName } = extractAuthorDetails(item.author, item.url, item.text);
  const rawText = item.text || "";

  const isForeign = isInternationalOrForeignEvent(rawText);
  const normalizedText = normalizeFloodReportText(rawText);
  const lower = normalizedText.toLowerCase();

  const isSuspension = /(walang\s*pasok|class\s*suspension|suspended|no\s*classes)/i.test(lower);
  const isFloodReport = !isForeign && isActualRoadFloodIncident(rawText);
  const isWeather = /(rainfall|thunderstorm|monsoon|habagat|amihan|typhoon|bagyo|low pressure|lpa|heavy rain)/i.test(lower);

  let category: "FLOOD" | "WEATHER" | "SUSPENSION" | "BULLETIN" | "NEWS" = "BULLETIN";
  if (isFloodReport) {
    category = "FLOOD";
  } else if (isSuspension) {
    category = "SUSPENSION";
  } else if (isWeather) {
    category = "WEATHER";
  } else if (source === "NEWS") {
    category = "NEWS";
  }

  const cleanId = String(item.id || "").replace(/^(tweet|status)[-_]/i, "").trim();
  const cleanPostUrl = (item.url || (authorHandle ? `https://x.com/${authorHandle}/status/${cleanId}` : `https://x.com/i/status/${cleanId}`)).replace(
    /\/status\/(?:tweet|status)-/i,
    "/status/"
  );

  if (isForeign || !isFloodReport) {
    const isOfficialWeatherAlert =
      isWeather && (source === "PAGASA" || source === "NDRRMC" || /\b(?:bulletin|signal\s*no|weather\s*advisory|gale\s*warning|forecast|track|heavy\s*rainfall)\b/i.test(lower));

    const passabilityLabel = isSuspension
      ? "Class Suspension"
      : isOfficialWeatherAlert
      ? "Weather Update"
      : source === "NEWS"
      ? "News Report"
      : "General Bulletin";

    return {
      id: cleanId,
      source,
      authorHandle,
      authorName,
      publishedAt: item.createdAt || new Date().toISOString(),
      rawText: item.text,
      category: isSuspension ? "SUSPENSION" : isOfficialWeatherAlert ? "WEATHER" : source === "NEWS" ? "NEWS" : "BULLETIN",
      isFloodReport: false,
      depthLevel: "UNKNOWN",
      depthInches: 0,
      passability: "PASSABLE_ALL",
      status: "ACTIVE",
      severity: "NORMAL",
      badgeColor: "blue",
      passabilityLabel,
      coordinates: null,
      photoUrls: item.photoUrls || [],
      postUrl: cleanPostUrl,
    };
  }

  const lines = normalizedText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  const locationPins: AdvisoryLocationPin[] = [];
  let currentCity = "";
  const hasCityHeaders = lines.some((l) => /^___CITY_([A-Z\s]+)___$/i.test(l));

  if (hasCityHeaders) {
    for (let idx = 0; idx < lines.length; idx++) {
      const line = lines[idx];
      const cityMatch = line.match(/^___CITY_([A-Z\s]+)___$/i);
      if (cityMatch && cityMatch[1]) {
        currentCity = cityMatch[1].trim();
        continue;
      }

      if (/^(date|time|reported floodings|floodings|advisory|flood alert|please refresh|stay safe|for more updates):?/i.test(line)) {
        continue;
      }

      const hasFloodKeywords = /(gutter|knee|tire|waist|chest|passable|not passable|subsided|inches|deep|pantuhod|pambaywang)/i.test(line);

      if (line.length > 3 && hasFloodKeywords) {
        const { roadName, landmark, direction } = extractRoadAndLandmark(line);
        const depthData = extractDepthAndPassability(line);
        const coords = getCachedCoordinates(roadName || undefined, landmark || undefined, currentCity);

        locationPins.push({
          id: `${cleanId}_pin${locationPins.length}`,
          roadName: roadName || undefined,
          landmark: landmark || (currentCity ? `${currentCity}` : undefined),
          city: currentCity || undefined,
          direction,
          depthLevel: depthData.depthLevel,
          depthInches: depthData.depthInches,
          passability: depthData.passability,
          severity: depthData.severity,
          badgeColor: depthData.badgeColor,
          passabilityLabel: depthData.passabilityLabel,
          authorHandle,
          authorName,
          coordinates: coords || { lat: 0, lng: 0 },
          rawLine: line,
        });
      }
    }
  }

  if (locationPins.length === 0) {
    const singleDepth = extractDepthAndPassability(rawText);
    const entities = extractConversationalEntities(rawText);
    const coords =
      entities.coordinates ||
      getCachedCoordinates(
        entities.roadName || undefined,
        entities.landmark || undefined,
        entities.city || undefined
      );

    const passabilityLabel =
      singleDepth.passabilityLabel === "Advisory Bulletin"
        ? singleDepth.depthLevel !== "UNKNOWN"
          ? "Flood Advisory"
          : "Passable to All Vehicles"
        : singleDepth.passabilityLabel;

    if (coords && coords.lat !== 0 && coords.lng !== 0) {
      locationPins.push({
        id: `${cleanId}_pin0`,
        roadName: entities.roadName || undefined,
        landmark: entities.landmark || entities.roadName || (entities.city ? `${entities.city}` : undefined),
        city: entities.city || undefined,
        direction: entities.direction,
        depthLevel: singleDepth.depthLevel,
        depthInches: singleDepth.depthInches,
        passability: singleDepth.passability,
        severity: singleDepth.severity,
        badgeColor: singleDepth.badgeColor,
        passabilityLabel,
        authorHandle,
        authorName,
        coordinates: coords,
        rawLine: rawText.length > 120 ? `${rawText.slice(0, 117)}...` : rawText,
      });
    }

    const primaryCoords = coords || null;

    return {
      id: cleanId,
      source,
      authorHandle,
      authorName,
      publishedAt: item.createdAt || new Date().toISOString(),
      rawText: item.text,
      category: "FLOOD",
      isFloodReport: true,
      depthLevel: singleDepth.depthLevel,
      depthInches: singleDepth.depthInches,
      passability: singleDepth.passability,
      status: singleDepth.status,
      severity: singleDepth.severity,
      badgeColor: singleDepth.badgeColor,
      passabilityLabel,
      roadName: entities.roadName || undefined,
      landmark: entities.landmark || undefined,
      direction: entities.direction,
      coordinates: primaryCoords,
      locationPins: locationPins.length > 0 ? locationPins : undefined,
      photoUrls: item.photoUrls || [],
      postUrl: cleanPostUrl,
    };
  }

  let overallDepthLevel: FloodDepthLevel = "UNKNOWN";
  let overallDepthInches = 0;
  let overallPassability: AdvisoryPassability = "PASSABLE_ALL";
  let overallSeverity: "CRITICAL" | "ALARM" | "ALERT" | "NORMAL" = "NORMAL";
  let overallBadgeColor: "red" | "orange" | "yellow" | "green" | "blue" = "blue";
  let overallPassabilityLabel = "Advisory Bulletin";
  let primaryCoords: { lat: number; lng: number } | null = null;
  let primaryRoadName: string | undefined = undefined;
  let primaryLandmark: string | undefined = undefined;
  let primaryDirection: "NB" | "SB" | "EB" | "WB" | "BOTH" | undefined = undefined;

  if (locationPins.length > 0) {
    primaryCoords = locationPins[0].coordinates;
    primaryRoadName = locationPins.length === 1 ? locationPins[0].roadName : `${locationPins.length} Flood Locations`;
    primaryLandmark = locationPins.length === 1 ? locationPins[0].landmark : undefined;
    primaryDirection = locationPins.length === 1 ? locationPins[0].direction : undefined;

    const hasCritical = locationPins.some((p) => p.severity === "CRITICAL");
    const hasAlarm = locationPins.some((p) => p.severity === "ALARM");
    const maxInches = Math.max(...locationPins.map((p) => p.depthInches));
    overallDepthInches = maxInches;

    const allSubsided = locationPins.every((p) => p.depthLevel === "SUBSIDED");

    if (allSubsided) {
      overallSeverity = "NORMAL";
      overallBadgeColor = "green";
      overallPassability = "SUBSIDED";
      overallDepthLevel = "SUBSIDED";
      overallPassabilityLabel = "Flood Subsided";
    } else if (hasCritical) {
      overallSeverity = "CRITICAL";
      overallBadgeColor = "red";
      overallPassability = "NOT_PASSABLE_ALL";
      overallDepthLevel = "WAIST";
      overallPassabilityLabel = "Not Passable (All Vehicles)";
    } else if (hasAlarm) {
      overallSeverity = "ALARM";
      overallBadgeColor = "orange";
      overallPassability = "NOT_PASSABLE_LIGHT";
      overallDepthLevel = "KNEE";
      overallPassabilityLabel = "Not Passable to Light Vehicles";
    } else {
      overallSeverity = "ALERT";
      overallBadgeColor = "yellow";
      overallPassability = "PASSABLE_ALL";
      overallDepthLevel = "GUTTER";
      overallPassabilityLabel = "Passable to All Vehicles";
    }
  }

  return {
    id: cleanId,
    source,
    authorHandle,
    authorName,
    publishedAt: item.createdAt || new Date().toISOString(),
    rawText: item.text,
    category: "FLOOD",
    isFloodReport: true,
    depthLevel: overallDepthLevel,
    depthInches: overallDepthInches,
    passability: overallPassability,
    status: overallDepthLevel === "SUBSIDED" ? "SUBSIDED" : "ACTIVE",
    severity: overallSeverity,
    badgeColor: overallBadgeColor,
    passabilityLabel: overallPassabilityLabel,
    roadName: primaryRoadName,
    landmark: primaryLandmark,
    direction: primaryDirection,
    coordinates: primaryCoords,
    locationPins: locationPins.length > 0 ? locationPins : undefined,
    photoUrls: item.photoUrls || [],
    postUrl: cleanPostUrl,
  };
}

export const parseAdvisoriesFromPostAsync = parseAdvisoryPostAsync;
export const parseAdvisoriesFromPost = parseAdvisoryPost;
