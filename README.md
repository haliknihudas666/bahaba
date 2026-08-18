# 🌊 Bahaba (Baha ba?) — Real-Time Metro Manila Flood Monitoring & Route Solver

> *"Baha ba?"* — Tagalog for **"Is It Flooded?"**

![Bahaba Interface Screenshot](bahaba.jpg)

[![Next.js](https://img.shields.io/badge/Next.js-16.3.0-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![React](https://img.shields.io/badge/React-19.1.0-blue?style=for-the-badge&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue?style=for-the-badge&logo=typescript)](https://www.typescriptlang.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.1-38bdf8?style=for-the-badge&logo=tailwind-css)](https://tailwindcss.com/)
[![Firebase](https://img.shields.io/badge/Firebase-Firestore-ffca28?style=for-the-badge&logo=firebase)](https://firebase.google.com/)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9.4-199900?style=for-the-badge&logo=leaflet)](https://leafletjs.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=for-the-badge)](LICENSE)

**Bahaba** is an open-source, hyper-local flood monitoring, hazard prediction, and turn-by-turn navigation platform built for Metro Manila and the Pasig-Marikina-Tullahan River Basin. It combines live hydrological and weather telemetry from **PAGASA** and **DOST-PAGASA Panahon Automated Weather Stations (AWS)**, evaluates road surface inundation depths using hydro-predictive heuristics and machine learning models, and computes flood risk along turn-by-turn **Driving** and **Walking** routes.

---

## 🌟 Key Features

### 📡 Dual Live Telemetry Ingestion Pipeline
- **PAGASA FFWS Scraper**: Scrapes 10-minute rainfall and water-level readings from the Pasig-Marikina-Tullahan Flood Forecasting & Warning System internal AJAX APIs.
- **DOST-PAGASA Panahon AWS Scraper**: Scrapes nationwide Automated Weather Station (AWS) network data via authenticated session handshakes to monitor hourly and 24-hour rainfall accumulation across Metro Manila and surrounding catchments.
- **Throttled Cron Ingestion (`/api/cron/ingest`)**: Automatic 30-minute deduplication throttling with override support (`?force=true` or `x-force-sync: true`), persisting consolidated telemetry snapshots to `sync_meta` and active snapshots to `stations`.

### 🧠 Dual-Signal Hydrological Flood Risk Engine
- **Pluvial-Primary Urban Modeling**: Calibrated to Metro Manila urban hydrology where road surface flooding is overwhelmingly pluvial (rainfall exceeding storm drain capacity) rather than river overflow.
- **Soil Saturation Index (SSI)**: Logistic decay model ($SSI = 1 - e^{-0.019 \times \text{Rain}_{24h}}$) tracking antecedent soil moisture.
- **Surface Water Depth Calculation**: Accounts for urban runoff coefficients (0.8), base storm drain capacities (10–32 mm/hr), low-elevation ponding multipliers (1.5× for $\le 3.0\text{m}$), and 10-minute rainfall intensity spikes ($>5\text{mm}$).
- **Fluvial Riverbank Surge**: Dynamically adds overflow depth only for roads within $\le 500\text{m}$ of river gauges at ALARM or CRITICAL stage.
- **Machine Learning Inference**: ONNX Runtime integration loading trained XGBoost flood classification models with automatic fallback to heuristic scoring.
- **UP Project NOAH Integration**: Return-period flood hazard classification (5-yr, 25-yr, 100-yr) coupled with road elevation to predict standing water accumulation.

### 🚗 Turn-by-Turn Flood-Aware Route Solver
- **OSRM Integration**: Calculates turn-by-turn directions between any two points in Metro Manila, discretizing routes into ~300m sub-segments for spatial risk analysis.
- **Digital Elevation Model (DEM) Sampling**: Batch-queries Open-Meteo DEM API with local in-memory caching (24h TTL) and a calibrated Metro Manila topological gradient fallback model (UST low bowl 2.4m, G. Araneta 1.8m, Taft 2.8m, EDSA Shaw 22m, Katipunan 38m).
- **Vehicle Clearance & Passability Engine**: Real-time passability assessment tailored to vehicle types:
  - **Sedan / Hatchback**: 15 cm clearance (caution at 8 cm)
  - **SUV / Crossover**: 25 cm clearance (caution at 15 cm)
  - **Motorcycle / Scooter**: 12 cm clearance (caution at 6 cm, hydroplaning hazard)
  - **4x4 Pickup / Truck**: 40 cm clearance (caution at 25 cm)
- **Traffic Congestion & Delay Modeling**: Estimates flood-induced bottleneck delays and crawl speeds, categorizing traffic into Smooth, Moderate, Heavy, and Standstill Gridlock.

### 🚶 Pedestrian Walkability & Health Hazard Modeling
- **Footpath Inundation Scoring**: Evaluates walking corridors (0–100 score) and calculates physical wading slowdown delays.
- **Health & Safety Alerts**: Generates crucial warnings including **DOH Leptospirosis infection risks** for contaminated floodwaters and **submerged open manhole / suction drain hazards**.
- **Gear Recommendations**: Recommends appropriate gear based on depth (e.g. high rubber boots / *bota*, ground probing walking sticks, waterproof bags).

### 🎨 Dark-Themed Interactive Map & Visuals
- **Leaflet.js + CartoDB Dark Matter**: High-performance dark canvas with pulsating station indicators and responsive/collapsible mobile flood legends.
- **Continuous Route Overlay**: Displays base driving/walking polyline with high-contrast highlighted overlays on flooded segments.
- **Monitored Road Corridors**: Pre-configured layers for key flood-prone arteries (España Blvd, G. Araneta Ave, Taft Ave, EDSA Shaw, Katipunan Ave, Marikina Riverbanks, Maysilo Circle) with radar focus beacons.
- **Autocomplete & Proximity Finder**: OpenStreetMap Nominatim place search coupled with Geohash bounding-box queries (`geofire-common`) and Haversine distance calculations.

### 📸 High-Resolution Social Share Engine
- **Instagram Story (9:16 Portrait)**: Generates 2× retina-ready images formatted with centered card overlays and safe zones for Instagram Stories.
- **Standard Feed Card (Landscape)**: Formatted for Facebook, X (Twitter), and Discord feeds.
- **One-Click Sharing**: Direct image copy to clipboard (`navigator.clipboard`), native Web Share API with attached files, and formatted plain-text alert generation.

### 📊 Telemetry & Analytics
- **Firestore Streaming**: Real-time WebSocket updates via `useLiveFloodStatus` hook with automatic fallback to live scraping.
- **Firebase Analytics**: SSR-safe event telemetry tracking route searches, station selections, road inspections, share formats, and sync actions.

---

## 🏗 System Architecture & Data Flow

```mermaid
flowchart TD
    subgraph External_Data["External Telemetry & APIs"]
        PAGASA["PAGASA Pasig-Marikina FFWS\n(/rainfall & /water APIs)"]
        PANAHON["DOST-PAGASA Panahon\n(AWS Rainfall Network)"]
        OSRM["OSRM Public Routing API\n(Driving & Walking Profiles)"]
        OPEN_METEO["Open-Meteo DEM API\n(Elevation in Meters ASL)"]
        NOMINATIM["OpenStreetMap Nominatim\n(Geocoding Autocomplete)"]
    end

    subgraph Ingestion_Persistence["Ingestion & Persistence"]
        CRON["/api/cron/ingest Endpoint\n(30-Min Throttled Sync)"]
        SCRAPER["Dual Scraper Engine\n(PAGASA FFWS + Panahon)"]
        FIRESTORE[("Cloud Firestore\n• sync_meta (snapshot)\n• stations")]
    end

    subgraph Risk_Navigation_Engine["Hydrological & Navigation Engine"]
        ELEV_SVC["Elevation Service\n(Open-Meteo + Metro Manila DEM)"]
        HEURISTIC["Pluvial Heuristic Scorer\n(SSI + Drainage + Ponding)"]
        ONNX["ONNX XGBoost Model\n(ML Inference + Fallback)"]
        NOAH["NOAH Hazard Predictor\n(Return-Period Inundation)"]
        ROUTE_SOLVER["Route Solver Engine\n(300m Segmentation)"]
        TRAFFIC_ENG["Traffic & Delay Model\n(Crawl Speed & Bottlenecks)"]
        WALK_ENG["Walkability & Health Model\n(Leptospirosis & Wading Delay)"]
        VEHICLE_ENG["Vehicle Clearance Engine\n(Sedan, SUV, Motorcycle, Truck)"]
    end

    subgraph Frontend_UI["Frontend Application (Next.js 16 + React 19)"]
        HOOK["useLiveFloodStatus Hook\n(Firestore Stream / Fallback)"]
        MAP["Leaflet Dark Matter Map\n(Continuous Polyline + Radar Focus)"]
        AUTOCOMPLETE["Location Autocomplete Search"]
        STATION_TABLE["Telemetry & Road Tables\n(Multi-Column Sort)"]
        SHARE_MODAL["Social Share Modal\n(9:16 IG Story & Feed Cards)"]
        ANALYTICS["Firebase Analytics Telemetry"]
    end

    %% Ingestion flow
    PAGASA -->|HTTP AJAX| SCRAPER
    PANAHON -->|Session & Cookie AWS API| SCRAPER
    CRON -->|Trigger Sync| SCRAPER
    SCRAPER -->|Batch Write| FIRESTORE
    FIRESTORE -->|Real-time Snapshot Stream| HOOK

    %% UI consumption
    HOOK --> MAP
    HOOK --> STATION_TABLE
    NOMINATIM --> AUTOCOMPLETE
    AUTOCOMPLETE --> ROUTE_SOLVER

    %% Routing flow
    ROUTE_SOLVER -->|Fetch Polyline| OSRM
    ROUTE_SOLVER -->|Sample Coordinates| ELEV_SVC
    ELEV_SVC -->|Query Elevations| OPEN_METEO
    HOOK -->|Live Telemetry| ROUTE_SOLVER
    ROUTE_SOLVER --> HEURISTIC
    ROUTE_SOLVER --> ONNX
    ROUTE_SOLVER --> NOAH
    ROUTE_SOLVER --> TRAFFIC_ENG
    ROUTE_SOLVER --> WALK_ENG
    ROUTE_SOLVER --> VEHICLE_ENG

    %% Outputs to UI
    ROUTE_SOLVER -->|Segmented Risk Polyline| MAP
    MAP --> SHARE_MODAL
    ROUTE_SOLVER --> SHARE_MODAL
    HOOK --> ANALYTICS
```

---

## 🛠 Tech Stack

| Layer | Technology | Purpose |
| :--- | :--- | :--- |
| **Framework** | [Next.js 16.3 (App Router)](https://nextjs.org/) | Core full-stack framework with React Server Components and dynamic route handlers |
| **UI Library** | [React 19.1](https://react.dev/) | Component architecture, hooks, and transitions |
| **Styling** | [Tailwind CSS 4.1](https://tailwindcss.com/) | Modern utility-first responsive styling with dark-mode aesthetic |
| **Language** | [TypeScript 5.8](https://www.typescriptlang.org/) | End-to-end type safety |
| **Interactive Map** | [Leaflet.js 1.9.4](https://leafletjs.com/) | Custom HTML markers, GeoJSON layers, pulsating beacons, and polyline overlays |
| **Map Tiles** | CartoDB Dark Matter | High-contrast dark theme vector basemap |
| **Routing Engine** | [OSRM (Open Source Routing Machine)](http://project-osrm.org/) | Driving and walking route calculations between Point A and Point B |
| **Elevation Service**| [Open-Meteo DEM API](https://open-meteo.com/en/docs/elevation-api) | Batch digital elevation sampling along polyline coordinates |
| **Geocoding** | [OpenStreetMap Nominatim](https://nominatim.org/) | Debounced autocomplete place and landmark search |
| **Database & Realtime**| [Firebase Cloud Firestore 10.13](https://firebase.google.com/docs/firestore) | Real-time station snapshots and historical telemetry time-series |
| **Server Admin** | [Firebase Admin SDK 12.4](https://firebase.google.com/docs/admin/setup) | Server-side batch writes and geohash spatial queries |
| **Spatial Indexing** | [Geofire Common 6.0](https://www.npmjs.com/package/geofire-common) | Geohash bounding-box calculations for station discovery |
| **Image Generation**| [html-to-image 1.11](https://www.npmjs.com/package/html-to-image) | Client-side 2× retina PNG generation for Instagram Stories & Feed Cards |
| **ML Inference** | [ONNX Runtime](https://onnxruntime.ai/) | XGBoost model execution with heuristic fallback |
| **HTTP & Scraping** | [Axios](https://axios-http.com/), [Cheerio](https://cheerio.js.org/) | Scrapes PAGASA FFWS and Panahon AWS endpoints |
| **Testing** | [tsx](https://github.com/privatenumber/tsx) | Fast TypeScript test runner for engine verification |

---

## 📐 Hydrological & Mathematical Formulation

### 1. Soil Saturation Index (SSI)
Measures antecedent soil moisture using an exponential logistic decay formula calibrated so that 100 mm of 24-hour rainfall yields ~0.85 saturation:
$$SSI = 1 - e^{-0.019 \times \text{Rain}_{24h}}$$

### 2. Pluvial Surface Water Depth
Pluvial flooding is calculated from net rainfall excess exceeding effective drainage:
$$\text{Drainage}_{\text{eff}} = \text{Drainage}_{\text{base}} \times (1 - 0.8 \times SSI)$$
$$\text{Excess}_{\text{net}} = \max\left(0, \text{Rain}_{1h} \times 0.8 - \text{Drainage}_{\text{eff}}\right)$$
$$\text{Depth}_{\text{pluvial}} = \text{Excess}_{\text{net}} \times 0.15 \times \text{Multiplier}_{\text{pond}} + \text{Bonus}_{\text{burst}}$$

Where:
- $\text{Drainage}_{\text{base}} = 10\text{ mm/hr}$ (adjusted up to $32\text{ mm/hr}$ for elevated corridors)
- $\text{Multiplier}_{\text{pond}} = 1.5$ if road elevation $\le 3.0\text{m ASL}$, else $1.0$
- $\text{Bonus}_{\text{burst}} = (\text{Rain}_{10m} - 5) \times 0.2\text{ cm}$ if $\text{Rain}_{10m} > 5\text{ mm}$

### 3. Fluvial Riverbank Surge
Added only when the road is within $500\text{m}$ of a river station at ALARM or CRITICAL level:
$$\text{Depth}_{\text{total}} = \text{Depth}_{\text{pluvial}} + \text{Bonus}_{\text{fluvial}} + \max(0, \Delta\text{WaterLevel}_{1h}) \times 30$$

### 4. Traffic Congestion & Delay Model
Flood-induced crawl speeds on sub-segments calculate total trip delay:
- **$> 30\text{ cm}$ (Waist Deep)**: 10× delay (Gridlock / Impassable)
- **$16 - 30\text{ cm}$ (Half-Tire Deep)**: 4.5× delay (~6 km/h crawl speed)
- **$6 - 15\text{ cm}$ (Gutter Deep)**: 2.2× delay (~15 km/h cautious speed)

### 5. Pedestrian Walkability Score
$$\text{Score}_{\text{walk}} = \max\left(5, 100 - \text{Depth}_{\text{cm}} \times 2.2\right)$$
- If $\text{Depth} > 25\text{ cm}$: Marked as **IMPASSABLE / DO NOT WALK** (risk of open manhole suction and deep water hazards).
- If $\text{Depth} \ge 10\text{ cm}$: Triggers **Leptospirosis Health Alert**.

---

## 🚦 Severity & Clearance Breakpoints

| Severity | Flood Depth | Color Code | Driving Traffic Status | Pedestrian Walkability | Vehicle Passability |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **NORMAL** | $0 - 5\text{ cm}$ | `#00b4d8` (Blue) | Smooth Flow | 100% Walkable & Clear | All Vehicles (Sedan, Motorcycle, SUV, Truck) |
| **ALERT** | $6 - 15\text{ cm}$ (Gutter Deep) | `#f97316` (Orange) | Moderate Slowdown | Walkable (Boots Advised) | Sedan Caution, SUV / Truck Safe |
| **ALARM** | $16 - 30\text{ cm}$ (Half-Tire Deep) | `#ef4444` (Red) | Heavy Traffic Crawl | Hazardous Wading (Knee Deep) | SUV / Truck Only (Sedan Impassable) |
| **CRITICAL** | $> 30\text{ cm}$ (Waist Deep+) | `#7f1d1d` (Dark Red) | Severe Gridlock / Standstill | **DO NOT WALK** (Open Drain Risk) | Impassable (Heavy 4x4 / Amphibious Only) |

---

## 📁 Repository Structure

```
bahaba/
├── public/
│   ├── models/
│   │   └── xgboost_flood.onnx          # Pre-trained ONNX flood prediction model
│   └── bahaba.jpg                  # Application UI preview
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   └── cron/
│   │   │       └── ingest/
│   │   │           └── route.ts        # Telemetry scraping & Firestore persistence endpoint
│   │   ├── globals.css                 # Global Tailwind CSS 4 directives & animations
│   │   ├── layout.tsx                  # Root HTML layout & metadata
│   │   └── page.tsx                    # Main interactive flood monitoring dashboard
│   ├── components/
│   │   ├── Map/
│   │   │   ├── NOAHPredictedRoadsLayer.tsx  # UP Project NOAH offline inundation vector layer
│   │   │   ├── RoadFloodLayer.tsx           # Monitored road network overlay with radar pins
│   │   │   └── RoadFloodMap.tsx             # Interactive Leaflet map & route polyline renderer
│   │   ├── FirebaseAnalytics.tsx       # Browser-side Firebase Analytics initializer
│   │   ├── FloodMap.tsx                # Base flood station map component
│   │   ├── LocationAutocomplete.tsx    # Debounced OSM Nominatim search input
│   │   ├── NearestStationFinder.tsx    # Proximity geo-search widget
│   │   ├── ShareModal.tsx              # Instagram Story (9:16) & Feed Card export modal
│   │   └── StationTable.tsx            # Multi-column sortable telemetry & risk table
│   ├── hooks/
│   │   └── useLiveFloodStatus.ts       # Firestore onSnapshot listener with offline fallback
│   ├── lib/
│   │   ├── data/
│   │   │   └── noah-roads.json         # GeoJSON dataset of flood-prone Metro Manila roads
│   │   ├── engine/
│   │   │   ├── __tests__/              # Automated test suites
│   │   │   │   ├── flood-engine.test.ts
│   │   │   │   ├── noah-predictor.test.ts
│   │   │   │   ├── road-risk.test.ts
│   │   │   │   └── route-solver.test.ts
│   │   │   ├── floodPredictor.ts       # UP NOAH water depth & hazard category logic
│   │   │   ├── heuristics.ts           # Pluvial/fluvial deterministic risk scoring
│   │   │   ├── inference.ts            # ONNX Runtime model loader & fallback runner
│   │   │   ├── roadRisk.ts             # Spatial centroid matcher & road risk evaluator
│   │   │   └── routeSolver.ts          # OSRM route segmentation, traffic & walkability engine
│   │   ├── firebase/
│   │   │   ├── __tests__/
│   │   │   │   └── geo.test.ts         # Coordinates & Geohash tests
│   │   │   ├── admin.ts                # Firebase Admin SDK initialization
│   │   │   ├── analytics.ts            # Custom Firebase Analytics event trackers
│   │   │   ├── client.ts               # Firebase Client SDK initialization
│   │   │   ├── geo-utils.ts            # Geohash and Haversine distance math
│   │   │   ├── geo.ts                  # Server-side bounding-box station queries
│   │   │   └── station-coords.ts       # Authoritative PAGASA station coordinates & slugifier
│   │   ├── geo/
│   │   │   ├── elevation.ts            # Open-Meteo DEM batch client with local gradient fallback
│   │   │   └── getRoadsInBBox.ts       # Spatial bounding-box filter for road segments
│   │   ├── leaflet-patch.ts            # Leaflet bounds & NaN coordinate guard patches
│   │   ├── panahon-scraper.ts          # DOST-PAGASA Panahon AWS scraper & session manager
│   │   └── scraper.ts                  # PAGASA FFWS AJAX scraper & telemetry merger
│   └── types/
│       ├── firestore.ts                # Firestore document schemas & LiveStation types
│       ├── flood-engine.ts             # Risk levels, vehicle clearances & feature vectors
│       ├── index.ts                    # Root barrel exports
│       ├── location.ts                 # Location search result types
│       └── telemetry.ts                # Rainfall & water level reading interfaces
├── firestore.rules                     # Cloud Firestore security rules
├── firestore.indexes.json              # Firestore composite index definitions
├── package.json                        # Project scripts & dependencies
└── tsconfig.json                       # TypeScript compiler configuration
```

---

## ⚡ Quickstart & Local Setup

### Prerequisites
- **Node.js**: v18.x or higher
- **npm** or **bun**: v9.x / v1.1 or higher
- **Firebase Account**: (Optional — application automatically falls back to direct client-side scraping when Firebase credentials are omitted).

### 1. Clone & Install Dependencies

```bash
git clone https://github.com/haliknihudas666/bahaba.git
cd bahaba
npm install
```

### 2. Configure Environment Variables

Copy the example configuration file:

```bash
cp .env.local.example .env.local
```

Populate `.env.local` with your Firebase project credentials:

```env
# Firebase Client SDK (Public)
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=G-XXXXXXXXXX

# Firebase Admin SDK (Server-Side)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY_HERE\n-----END PRIVATE KEY-----\n"
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 4. Trigger Ingestion Pipeline

To test telemetry scraping and sync data to Firestore:
- Click the **Sync Telemetry** button in the dashboard navigation bar, or
- Trigger the ingestion endpoint directly via `curl`:

```bash
# Standard sync (respects 30-minute throttling window)
curl http://localhost:3000/api/cron/ingest

# Forced sync (bypasses 30-minute interval check)
curl http://localhost:3000/api/cron/ingest?force=true
```

---

## 🧪 Automated Testing

Bahaba includes comprehensive unit tests verifying the hydrological formula, spatial matching, elevation sampling, vehicle clearance, traffic delay, and walkability logic:

```bash
# 1. Run Core Hydro-Engine & Edge Case Tests
npm run test:engine

# 2. Run Spatial Road Risk & Centroid Evaluator Tests
npm run test:road-risk

# 3. Run UP Project NOAH Inundation Predictor Tests
npm run test:noah

# 4. Run Route Solver, Traffic, Clearance & Walkability Tests
npm run test:route-solver

# 5. Run Station Coordinates & Geohash Math Tests
npx tsx src/lib/firebase/__tests__/geo.test.ts
```

---

## 📡 API Reference

### `GET /api/cron/ingest`
Scrapes PAGASA FFWS and Panahon AWS stations, normalizes rainfall and water level readings, calculates composite risk, and commits batch updates to Cloud Firestore.

#### Query Parameters / Headers
- `?force=true` or Header `x-force-sync: true`: Forces ingestion write even if the previous sync was completed within the last 30 minutes.

#### Response Headers
- `X-Scrape-Duration-Ms`: Ingestion pipeline execution time in milliseconds.
- `X-Rainfall-Rows`: Count of normalized rainfall rows.
- `X-WaterLevel-Rows`: Count of normalized water-level rows.
- `X-Firestore-Persisted-Stations`: Number of stations written to Firestore.
- `X-Firestore-Skipped`: `true` if write was skipped due to 30-minute throttling window.

#### Response Body Example
```json
{
  "success": true,
  "scrapedAt": "2026-08-19T00:30:00.000Z",
  "stations": [
    {
      "stationName": "Sto. Niño",
      "latitude": 14.6334,
      "longitude": 121.0945,
      "rainfall": {
        "stationName": "Sto. Niño",
        "rain10min": 2.5,
        "rain1hr": 18.0,
        "rain24hr": 64.0
      },
      "waterLevel": {
        "stationName": "Sto. Niño",
        "currentLevel": 15.2,
        "change1hr": 0.4,
        "alertLevel": 15.0,
        "alarmLevel": 16.0,
        "criticalLevel": 17.0
      },
      "waterRiskLevel": "ALERT",
      "rainRiskLevel": "ALARM",
      "riskLevel": "ALARM"
    }
  ],
  "meta": {
    "rainfallRowCount": 42,
    "waterLevelRowCount": 28,
    "durationMs": 1420
  }
}
```

---

## 🤝 Contributing

Contributions are welcome! To contribute:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Ensure all tests pass (`npm run test:engine && npm run test:road-risk && npm run test:noah && npm run test:route-solver`).
4. Commit your changes (`git commit -m 'Add amazing feature'`).
5. Push to your branch (`git push origin feature/amazing-feature`).
6. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See [LICENSE](LICENSE) for details.
