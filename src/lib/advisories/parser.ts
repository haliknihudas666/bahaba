// ---------------------------------------------------------------------------
// Bahaba – Advisory NLP & Regex Parser
// ---------------------------------------------------------------------------

import type {
  ReportedAdvisory,
  AdvisorySource,
  AdvisoryPassability,
  FloodDepthLevel,
} from "@/types/advisory";
import { matchHotspotFromText } from "./hotspots";

export interface RawTweetInput {
  id: string;
  text: string;
  author: string;
  createdAt: string;
  url: string;
  photoUrls?: string[];
}

/**
 * Clean and normalise whitespace, unicode quotes, and Math Bold/Italic unicode letters
 * (e.g. converts "𝐑𝐄𝐏𝐎𝐑𝐓𝐄𝐃 𝐅𝐋𝐎𝐎𝐃𝐈𝐍𝐆𝐒" into standard "REPORTED FLOODINGS")
 */
export function cleanText(raw: string): string {
  if (!raw) return "";
  return raw
    .normalize("NFKD")
    .replace(/\u00a0/g, " ")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Filter to determine if a tweet/post is relevant to flooding, weather, or class suspensions
 */
export function isWeatherOrFloodRelated(raw: string): boolean {
  if (!raw) return false;
  const text = cleanText(raw).toLowerCase();

  // 1. Road Flooding & Passability (MMDA / LGU alerts)
  const floodKeywords =
    /(flood|flooding|reported floodings|baha|binaha|lubog|gutter|knee|tire|waist|chest|subsided|passable|not passable|water level|water elevation|inundation|gutter deep|tire deep|knee deep|waist deep|chest deep)/i;

  // 2. Weather & Rainfall Bulletins (PAGASA / NDRRMC)
  const weatherKeywords =
    /(rainfall|heavy rain|thunderstorm|weather forecast|monsoon|habagat|amihan|bagyo|cyclone|typhoon|low pressure|lpa|tropical|dam|spillway|tullahan|marikina river|gale warning|flood advisory)/i;

  // 3. Class & Work Suspensions
  const suspensionKeywords =
    /(walang pasok|class suspension|suspended|suspension of classes|work suspension|walangpasok)/i;

  // 4. Emergency Alerts & Bulletins
  const bulletinKeywords =
    /(yellow warning|orange warning|red warning|heavy rainfall warning|situational report|situational bulletin|thunderstorm advisory|evacuation)/i;

  return (
    floodKeywords.test(text) ||
    weatherKeywords.test(text) ||
    suspensionKeywords.test(text) ||
    bulletinKeywords.test(text)
  );
}

/**
 * Format relative time (e.g. "5m ago", "1h ago")
 */
export function formatTimeAgo(isoString: string): string {
  try {
    const diffMs = Date.now() - new Date(isoString).getTime();
    if (diffMs < 0 || isNaN(diffMs)) return "Just now";

    const minutes = Math.floor(diffMs / (60 * 1000));
    if (minutes < 1) return "Just now";
    if (minutes < 60) return `${minutes}m ago`;

    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;

    const days = Math.floor(hours / 24);
    if (days < 7) return `${days}d ago`;

    return new Date(isoString).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

/**
 * Parse an incoming tweet or Facebook post into a structured ReportedAdvisory
 */
export function parseAdvisoryPost(item: RawTweetInput): ReportedAdvisory {
  const text = cleanText(item.text);
  const lower = text.toLowerCase();

  // 1. Identify Source
  let source: AdvisorySource = "MMDA";
  const authorLower = (item.author || "").toLowerCase();
  const newsHandles = ["gmanews", "abscbnnews", "news5ph", "inquirerdotnet"];
  if (authorLower.includes("ndrrmc") || lower.includes("ndrrmc")) {
    source = "NDRRMC";
  } else if (authorLower.includes("pagasa") || lower.includes("pagasa")) {
    source = "PAGASA";
  } else if (newsHandles.some((h) => authorLower.includes(h))) {
    source = "NEWS";
  } else {
    source = "MMDA";
  }

  // 2. Identify Category
  let category: ReportedAdvisory["category"] = "BULLETIN";
  const isFloodReport = /(flood|flooding|reported floodings|baha|gutter|knee|tire|waist|chest|subsided|passable|not passable|water level)/i.test(
    lower
  );
  const isSuspension = /(walang pasok|class suspension|suspended|suspension of classes|work suspension)/i.test(
    lower
  );
  const isWeather = /(rainfall|thunderstorm|monsoon|habagat|amihan|typhoon|bagyo|low pressure|lpa|heavy rain)/i.test(
    lower
  );

  if (isFloodReport) {
    category = "FLOOD";
  } else if (isSuspension) {
    category = "SUSPENSION";
  } else if (isWeather) {
    category = "WEATHER";
  }

  // 3. Extract Direction (NB / SB / EB / WB)
  let direction: ReportedAdvisory["direction"] = undefined;
  const dirMatch = text.match(/\b(NB|SB|EB|WB|Northbound|Southbound|Eastbound|Westbound)\b/i);
  if (dirMatch) {
    const d = dirMatch[1].toUpperCase();
    if (d.startsWith("N")) direction = "NB";
    else if (d.startsWith("S")) direction = "SB";
    else if (d.startsWith("E")) direction = "EB";
    else if (d.startsWith("W")) direction = "WB";
  }

  // 4. Extract Depth Level & Inches
  let depthLevel: FloodDepthLevel = "UNKNOWN";
  let depthInches = 0;
  let passability: AdvisoryPassability = "PASSABLE_ALL";
  let status: "ACTIVE" | "SUBSIDED" = "ACTIVE";

  if (/subsided|gutter\s*subsided|flood\s*subsided/i.test(lower)) {
    depthLevel = "SUBSIDED";
    depthInches = 0;
    passability = "SUBSIDED";
    status = "SUBSIDED";
  } else if (/chest\s*deep/i.test(lower)) {
    depthLevel = "CHEST";
    depthInches = 45;
    passability = "NOT_PASSABLE_ALL";
  } else if (/waist\s*deep/i.test(lower)) {
    depthLevel = "WAIST";
    depthInches = 37;
    passability = "NOT_PASSABLE_ALL";
  } else if (/knee\s*deep/i.test(lower)) {
    depthLevel = "KNEE";
    depthInches = 19;
    passability = "NOT_PASSABLE_LIGHT";
  } else if (/tire\s*deep/i.test(lower)) {
    depthLevel = "TIRE";
    depthInches = 26;
    passability = "NOT_PASSABLE_LIGHT";
  } else if (/half\s*tire/i.test(lower)) {
    depthLevel = "HALF_TIRE";
    depthInches = 13;
    passability = "NOT_PASSABLE_LIGHT";
  } else if (/gutter\s*deep/i.test(lower)) {
    depthLevel = "GUTTER";
    depthInches = 8;
    passability = "PASSABLE_ALL";
  }

  // Explicit passability check overriding depth heuristics if mentioned
  if (/not passable to all/i.test(lower) || /not passable to heavy/i.test(lower)) {
    passability = "NOT_PASSABLE_ALL";
  } else if (/not passable to light/i.test(lower) || /not passable light/i.test(lower)) {
    passability = "NOT_PASSABLE_LIGHT";
  } else if (/passable to all/i.test(lower) && depthLevel !== "SUBSIDED") {
    passability = "PASSABLE_ALL";
  }

  // 5. Severity & Visual Badges
  let severity: ReportedAdvisory["severity"] = "NORMAL";
  let badgeColor: ReportedAdvisory["badgeColor"] = "blue";
  let passabilityLabel = "Advisory Bulletin";

  if (status === "SUBSIDED") {
    severity = "NORMAL";
    badgeColor = "green";
    passabilityLabel = "Flood Subsided (Cleared)";
  } else if (passability === "NOT_PASSABLE_ALL") {
    severity = "CRITICAL";
    badgeColor = "red";
    passabilityLabel = "Not Passable (All Vehicles)";
  } else if (passability === "NOT_PASSABLE_LIGHT") {
    severity = "ALARM";
    badgeColor = "orange";
    passabilityLabel = "Not Passable to Light Vehicles";
  } else if (passability === "PASSABLE_ALL" && isFloodReport) {
    severity = "ALERT";
    badgeColor = "yellow";
    passabilityLabel = "Passable to All Vehicles";
  }

  // 6. Match Corridor / Landmark Coordinates
  const matchedHotspot = matchHotspotFromText(text);

  // Clean ID and Post URL
  const cleanId = String(item.id || "").replace(/^(tweet|status)[-_]/i, "").trim();
  const cleanPostUrl = (item.url || `https://x.com/${source}/status/${cleanId}`).replace(
    /\/status\/(?:tweet|status)-/i,
    "/status/"
  );

  return {
    id: cleanId,
    source,
    category,
    postUrl: cleanPostUrl,
    rawText: text,
    publishedAt: item.createdAt,
    photoUrls: item.photoUrls || [],
    isFloodReport,
    roadName: matchedHotspot?.roadName,
    landmark: matchedHotspot?.landmark,
    direction,
    depthLevel,
    depthInches,
    passability,
    severity,
    badgeColor,
    passabilityLabel,
    coordinates: matchedHotspot ? { lat: matchedHotspot.lat, lng: matchedHotspot.lng } : null,
    status,
  };
}
