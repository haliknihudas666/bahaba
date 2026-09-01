# 🚨 Bahaba Advisory Scraper Worker

> **Real-time flood advisory & social bulletin extraction microservice for Bahaba.**

A standalone background worker service that continuously monitors and scrapes official government disaster alerts and accredited news outlets across the Philippines on X (Twitter). It processes text through a modular NLP pipeline, performs dynamic geocoding and multi-location extraction, tags vehicle passability and flood severity, and persists active advisories directly to **MongoDB**.

---

## 🌟 Key Capabilities

- 🤖 **Headless Playwright Scraping**: Stealth browser automation with anti-detection headers, randomized jitter delays, and session cookie re-use (`x-auth.json`).
- 📡 **Multi-Source Ingestion**:
  - **Government Handles**: `@MMDA`, `@NDRRMC_OpCen`, `@dost_pagasa` (scrapes timeline directly).
  - **Accredited News Media**: `@gmanews`, `@ABSCBNNews`, `@News5PH`, `@inquirerdotnet`, `@rapplerdotcom`, `@manilabulletin` (keyword-targeted live search queries).
- 🧠 **Modular NLP & Classification Pipeline**:
  - **Flood Incident vs. General News Classifier**: Distinguishes active roadway inundation from project proposals, commentary, or municipal announcements.
  - **Foreign Event Filtering**: Automatically rejects international disasters (e.g., Nepal, Spain, Bangladesh floods).
  - **Multi-Location Extractor (`locationPins`)**: Parses compound municipal bulletins (e.g., MMDA road status summaries) into dozens of distinct geographic pins with individual depth and passability data.
  - **Severity & Passability Tagging**: Categorizes depths into `GUTTER` (1–15 cm), `KNEE` (16–30 cm), `WAIST` (31–60 cm), `CHEST / ROOF` (> 60 cm), or `SUBSIDED`, mapping to `PASSABLE_ALL`, `NOT_PASSABLE_LIGHT`, `NOT_PASSABLE_ALL`, or `SUBSIDED`.
- 🗺️ **Dynamic Geocoding & Hotspot Resolution**:
  - Direct geocoding via OpenStreetMap Nominatim with strict 1 req/sec rate-limiting and query sanitization.
  - Fast offline fallback against a curated dictionary of major Philippine intersections and national highways (`src/lib/advisories/hotspots.ts`).
- ⚡ **Direct MongoDB Ingestion**:
  - Writes directly into the `advisories` collection.
  - In-memory content hash deduplication (`knownPostHashes`) to eliminate redundant write ops.
  - Automated 24-hour retention window cutoff.
- 📸 **Rich Media Extraction**: Captures attached flood photography and official graphics for display in the Bahaba Live Advisory Wall.

---

## 🛠 Prerequisites & Dependencies

- [Bun](https://bun.sh/) (v1.1+ recommended) or [Node.js](https://nodejs.org/) (v18+)
- Playwright Chromium browser binaries
- Running **MongoDB** instance (Local or MongoDB Atlas)

---

## 🚀 Getting Started

### 1. Install Dependencies & Playwright Browsers

```bash
cd services/advisory-scraper
bun install
bun x playwright install chromium
```

### 2. Configure Environment Variables

The worker automatically reads environment variables from the root `../../.env.local` or a local `.env` file:

```env
# MongoDB Connection String
MONGODB_URI=mongodb://localhost:27017/bahaba
# Or MongoDB Atlas: mongodb+srv://<user>:<password>@cluster.mongodb.net/bahaba?retryWrites=true&w=majority

MONGODB_DB=bahaba
```

### 3. Authenticate with X (Twitter) *(Recommended)*

To prevent aggressive rate-limiting and access live search feeds, save your session cookies:

```bash
bun run save-auth.ts
```
*Follow the interactive prompt in the browser window to log in to X. Once logged in, your session state will be saved to `x-auth.json`.*

### 4. Running the Scraper

#### Single Test Run (`--once`)
Executes a single scrape pass across all government handles and news queries, prints extracted data to console, updates MongoDB, and exits:

```bash
bun run worker.ts --once
```

#### Continuous Daemon Mode (Default)
Runs in an infinite polling loop (every 5 minutes):

```bash
bun run worker.ts
```

#### Production Process Management (PM2)
To keep the worker running indefinitely on a server or VPS:

```bash
# Start background worker with PM2
pm2 start worker.ts --name bahaba-advisories --interpreter bun

# View live worker logs
pm2 logs bahaba-advisories

# Monitor worker health
pm2 status
```

---

## 📊 Database Schema (`advisories` Collection)

Each advisory document in MongoDB contains:

```typescript
interface AdvisoryDoc {
  id: string;                    // Unique post ID (e.g. "x_1829381923812")
  source: "MMDA" | "NDRRMC" | "PAGASA" | "NEWS" | "MANUAL";
  authorName: string;            // e.g. "MMDA" or "GMA News"
  authorHandle: string;          // e.g. "MMDA" or "gmanews"
  authorAvatarUrl?: string;
  publishedAt: string;           // ISO 8601 UTC timestamp
  scrapedAt: string;             // ISO 8601 UTC timestamp
  rawText: string;               // Original post text
  cleanedText: string;
  mediaUrls: string[];           // Array of photo/image URLs
  postUrl: string;               // Link to original tweet
  isFloodReport: boolean;        // true if active domestic flood
  status: "ACTIVE" | "SUBSIDED" | "UNKNOWN";
  severity: "NORMAL" | "ALERT" | "ALARM" | "CRITICAL";
  passability: "PASSABLE_ALL" | "NOT_PASSABLE_LIGHT" | "NOT_PASSABLE_ALL" | "SUBSIDED";
  depthInches?: number;
  depthCategory?: "GUTTER" | "KNEE" | "WAIST" | "CHEST" | "SUBSIDED";
  road?: string;                 // Extracted road name (e.g., "EDSA")
  landmark?: string;             // Extracted landmark (e.g., "Philam")
  city?: string;                 // e.g., "Quezon City"
  coordinates?: {
    lat: number;
    lng: number;
  };
  locationPins?: Array<{         // Multiple location pins extracted from a single post
    id: string;
    road: string;
    landmark?: string;
    city?: string;
    coordinates: { lat: number; lng: number };
    depthCategory?: string;
    passability?: string;
    severity?: string;
  }>;
}
```

---

## 🧪 Testing & Verification

The parser and NLP rules are covered by automated test suites in the main repository:

```bash
# Run advisory visibility, dynamic multi-pin parser, and NLP tests
npm run test:advisories
```

