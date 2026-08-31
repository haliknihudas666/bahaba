# Bahaba Advisory Scraper Worker

Standalone background microservice that continuously scrapes official road flood advisories and bulletins from **@MMDA** and **@NDRRMC_OpCen** on X (Twitter) using headless **Playwright**, runs NLP passability/geocoding, and writes the results directly into **Firestore**.

---

## Features
- 🚀 **100% Free & Zero-API Setup**: Runs headless Chromium directly with anti-detection headers.
- 📸 **Photo & Media Extraction**: Automatically captures flood photos attached to tweets.
- 🗺️ **Geocoding Hotspots**: Maps reported intersections (*"EDSA Philam"*, *"España Antipolo"*, *"Taft UN Ave"*) directly to coordinates for instant map rendering.
- ⚡ **Direct Firestore Ingestion**: Updates the `advisories` collection in Firestore so the Next.js app reads live data with zero latency.

---

## Getting Started

### 1. Install Playwright Browsers (One-time setup)
```bash
bun x playwright install chromium
```

### 2. Run Single Scrape (Test run)
```bash
bun run worker.ts --once
```

### 3. Run as Continuous Daemon (Every 4 mins)
```bash
bun run worker.ts
```

Or using **PM2** in production/VPS:
```bash
pm2 start worker.ts --name bahaba-advisories --interpreter bun
```
