// ---------------------------------------------------------------------------
// Bahaba – Metro Manila Flood Hotspot & Landmark Geocoding Dictionary
// ---------------------------------------------------------------------------

export interface HotspotLocation {
  roadName: string;
  landmark: string;
  lat: number;
  lng: number;
  aliases: string[];
}

export const METRO_MANILA_HOTSPOTS: HotspotLocation[] = [
  // ── EDSA (Epifanio de los Santos Ave) ──────────────────────────────────
  {
    roadName: "EDSA",
    landmark: "Philam / West Ave",
    lat: 14.6542,
    lng: 121.0334,
    aliases: ["edsa philam", "philam", "edsa west ave", "west avenue", "edsa sm north"],
  },
  {
    roadName: "EDSA",
    landmark: "Munoz / Roosevelt",
    lat: 14.6575,
    lng: 121.0205,
    aliases: ["edsa munoz", "munoz", "roosevelt", "fernando po jr", "edsa roosevelt"],
  },
  {
    roadName: "EDSA",
    landmark: "Camp Aguinaldo / Gate 1",
    lat: 14.6072,
    lng: 121.0583,
    aliases: ["edsa aguinaldo", "camp aguinaldo", "edsa santolan", "santolan edsa"],
  },
  {
    roadName: "EDSA",
    landmark: "Megamall / Ortigas Underpass",
    lat: 14.5855,
    lng: 121.0573,
    aliases: ["edsa ortigas", "ortigas underpass", "edsa megamall", "shaw underpass", "edsa shaw"],
  },
  {
    roadName: "EDSA",
    landmark: "Taft Ave Interchange / Pasay Rotonda",
    lat: 14.5378,
    lng: 121.0014,
    aliases: ["edsa taft", "pasay rotonda", "edsa pasay", "edsa tramo", "edsa roxas"],
  },

  // ── España Boulevard (Manila) ──────────────────────────────────────────
  {
    roadName: "España Boulevard",
    landmark: "Antipolo St.",
    lat: 14.6145,
    lng: 120.9982,
    aliases: ["espana antipolo", "españa antipolo", "espana cor antipolo", "españa cor. antipolo"],
  },
  {
    roadName: "España Boulevard",
    landmark: "Blumentritt St.",
    lat: 14.6198,
    lng: 121.0025,
    aliases: ["espana blumentritt", "españa blumentritt", "espana cor blumentritt", "blumentritt espana"],
  },
  {
    roadName: "España Boulevard",
    landmark: "UST / Lacson Ave.",
    lat: 14.6095,
    lng: 120.9934,
    aliases: ["espana ust", "españa ust", "espana lacson", "españa lacson", "ust espana", "university of santo tomas"],
  },
  {
    roadName: "España Boulevard",
    landmark: "Welcome Rotonda",
    lat: 14.6225,
    lng: 121.0035,
    aliases: ["welcome rotonda", "rotonda espana", "welcome rotonda quezon"],
  },

  // ── Taft Avenue (Manila / Pasay) ───────────────────────────────────────
  {
    roadName: "Taft Avenue",
    landmark: "UN Avenue / PGH",
    lat: 14.5828,
    lng: 120.9852,
    aliases: ["taft un", "taft un avenue", "taft united nations", "taft pgh", "taft kalaw"],
  },
  {
    roadName: "Taft Avenue",
    landmark: "Pedro Gil / Quirino",
    lat: 14.5776,
    lng: 120.9897,
    aliases: ["taft pedro gil", "taft cor pedro gil", "taft quirino", "pedro gil taft"],
  },
  {
    roadName: "Taft Avenue",
    landmark: "Vito Cruz / DLSU",
    lat: 14.5638,
    lng: 120.9945,
    aliases: ["taft vito cruz", "vito cruz", "pablo ocampo", "taft dlsu", "taft oliveros"],
  },

  // ── Araneta Avenue (Quezon City) ──────────────────────────────────────
  {
    roadName: "G. Araneta Avenue",
    landmark: "Quezon Ave Underpass",
    lat: 14.6288,
    lng: 121.0116,
    aliases: ["araneta quezon ave", "araneta q ave", "g araneta quezon ave", "araneta underpass", "araneta avenue"],
  },
  {
    roadName: "G. Araneta Avenue",
    landmark: "Maria Clara St.",
    lat: 14.6212,
    lng: 121.0065,
    aliases: ["araneta maria clara", "maria clara araneta", "araneta cor maria clara"],
  },
  {
    roadName: "G. Araneta Avenue",
    landmark: "E. Rodriguez Sr. Ave",
    lat: 14.6162,
    lng: 121.0098,
    aliases: ["araneta e rodriguez", "araneta e. rod", "e rodriguez araneta", "tatalon"],
  },

  // ── Rizal Avenue & R. Papa (Manila / Caloocan) ─────────────────────────
  {
    roadName: "Rizal Avenue",
    landmark: "R. Papa / 5th Ave",
    lat: 14.6364,
    lng: 120.9827,
    aliases: ["r papa", "r. papa", "rizal ave r papa", "rizal avenue r. papa", "5th ave rizal"],
  },
  {
    roadName: "Rizal Avenue",
    landmark: "Tayuman / Abad Santos",
    lat: 14.6186,
    lng: 120.9824,
    aliases: ["rizal ave tayuman", "tayuman rizal", "abad santos tayuman"],
  },

  // ── C-5 Road / E. Rodriguez Jr. ────────────────────────────────────────
  {
    roadName: "C-5 Road",
    landmark: "Bagong Ilog / Kalayaan Flyover",
    lat: 14.5684,
    lng: 121.0664,
    aliases: ["c5 bagong ilog", "c-5 bagong ilog", "bagong ilog", "c5 kalayaan", "c5 pasig"],
  },
  {
    roadName: "C-5 Road",
    landmark: "Libis / Eastwood",
    lat: 14.6102,
    lng: 121.0805,
    aliases: ["c5 libis", "c-5 libis", "libis eastwood", "c5 eastwood"],
  },

  // ── Commonwealth & Quezon Ave ──────────────────────────────────────────
  {
    roadName: "Commonwealth Avenue",
    landmark: "Tandang Sora / Ever Gotesco",
    lat: 14.6784,
    lng: 121.0772,
    aliases: ["commonwealth tandang sora", "tandang sora commonwealth", "commonwealth ever", "commonwealth litex"],
  },
  {
    roadName: "Quezon Avenue",
    landmark: "Biak na Bato / Banawe",
    lat: 14.6274,
    lng: 121.0028,
    aliases: ["quezon ave banawe", "banawe quezon ave", "biak na bato quezon ave", "q ave banawe"],
  },

  // ── Roxas Boulevard / Pasay / Manila ──────────────────────────────────
  {
    roadName: "Roxas Boulevard",
    landmark: "Kalaw / US Embassy",
    lat: 14.5786,
    lng: 120.9782,
    aliases: ["roxas blvd kalaw", "roxas boulevard us embassy", "roxas blvd padre faura", "roxas boulevard luneta"],
  },
  {
    roadName: "Roxas Boulevard",
    landmark: "Quirino / CCP Complex",
    lat: 14.5615,
    lng: 120.9867,
    aliases: ["roxas blvd quirino", "roxas boulevard ccp", "roxas blvd buendia", "roxas boulevard vito cruz"],
  },

  // ── Marikina & Cainta Corridors ────────────────────────────────────────
  {
    roadName: "Marikina River Park",
    landmark: "Tumana / Provident Village",
    lat: 14.6465,
    lng: 121.0995,
    aliases: ["tumana bridge", "tumana marikina", "provident village", "marikina riverbanks", "sto nino marikina"],
  },
  {
    roadName: "Ortigas Avenue Extension",
    landmark: "Cainta Junction / Brookside",
    lat: 14.5822,
    lng: 121.1185,
    aliases: ["cainta junction", "ortigas ext cainta", "brookside cainta", "junction cainta"],
  },
];

/**
 * Normalize text by stripping accents, punctuation, and extra spaces
 */
function normalizeString(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Match a raw text string against known hotspot aliases.
 * Returns the best matching HotspotLocation or null.
 */
export function matchHotspotFromText(text: string): HotspotLocation | null {
  if (!text) return null;
  const clean = normalizeString(text);

  // 1. Direct alias check
  for (const hotspot of METRO_MANILA_HOTSPOTS) {
    for (const alias of hotspot.aliases) {
      const cleanAlias = normalizeString(alias);
      if (clean.includes(cleanAlias)) {
        return hotspot;
      }
    }
  }

  // 2. Token-pair checks (e.g. "espana" & "antipolo", "taft" & "un", "edsa" & "philam")
  for (const hotspot of METRO_MANILA_HOTSPOTS) {
    const cleanRoad = normalizeString(hotspot.roadName).replace(/\b(boulevard|avenue|road|ave|blvd|rd|street|st)\b/g, "").trim();
    const cleanLandmark = normalizeString(hotspot.landmark).replace(/\b(avenue|underpass|st|street|cor|gate|ave|blvd)\b/g, "").trim();

    const roadWords = cleanRoad.split(" ").filter((w) => w.length >= 2);
    const landmarkWords = cleanLandmark.split(" ").filter((w) => w.length >= 2);

    const hasRoad = roadWords.some((w) => clean.includes(w));
    const hasLandmark = landmarkWords.some((w) => clean.includes(w));

    if (hasRoad && hasLandmark) {
      return hotspot;
    }
  }

  return null;
}
