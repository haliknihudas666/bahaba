# 🌊 Bahaba (Baha ba?) — Real-Time Metro Manila Flood Monitoring & Route Solver

> *"Baha ba?"* — Tagalog for **"Is It Flooded?"**

![Bahaba Interface Screenshot](screenshot.png)

Bahaba is an open-source, hyper-local flood monitoring and driving route navigation platform for Metro Manila, Philippines (specifically covering the Pasig-Marikina-Tullahan River Basin). It ingests live hydrological and rainfall telemetry from PAGASA (Philippine Atmospheric, Geophysical and Astronomical Services Administration), calculates real-time road surface flood depths using hydro-predictive heuristics and machine learning models, and evaluates flood risk along turn-by-turn driving routes.

---

## 🌟 Key Features

- **📡 Live Telemetry Ingestion Pipeline**: Scrapes and normalizes 10-minute rainfall and water-level readings from PAGASA's Pasig-Marikina-Tullahan Flood Forecasting & Warning System (FFWS).
- **🔥 Real-Time Firestore Synchronization**: Persists historical telemetry time-series records and active station snapshots to Cloud Firestore, streaming live updates to clients via WebSocket subscriptions.
- **🧠 Hydro-Predictive Flood Risk Engine**: Combines a 4-dimensional heuristic scoring algorithm (Soil Saturation Index, Rainfall Intensity, Water-Level Rise Rate, Critical Level Proximity) with an ONNX-exported XGBoost model to estimate road-level flood depths in centimeters.
- **🚗 Segment-by-Segment Flood Navigation**: Integrates Open Source Routing Machine (OSRM) to calculate turn-by-turn driving directions between any two locations in Metro Manila, discretizing polyline geometry into 300m sub-segments and superimposing flood risk highlights directly onto the route.
- **📍 Location Search & Nearest Station Discovery**: OpenStreetMap Nominatim-powered place search coupled with Geohash bounding box and Haversine spatial queries to locate proximity to telemetry stations.
- **🎨 Interactive Dark-Theme Map**: Leaflet.js-powered dark canvas visualization with pulsating station indicators, custom map pins, vehicle clearance advisories, and interactive hazard drawers.

---

## 🏗 System Architecture & Data Flow

```mermaid
flowchart TD
    subgraph External_APIs["External Data & APIs"]
        PAGASA["PAGASA FFWS Internal APIs"]
        OSRM["OSRM Public Routing API"]
        NOMINATIM["OSM Nominatim Geocoding"]
    end

    subgraph Backend_Ingestion["Backend & Ingestion"]
        CRON["/api/cron/ingest Endpoint"]
        SCRAPER["PAGASA Telemetry Scraper"]
        FIRESTORE[("Cloud Firestore DB")]
    end

    subgraph Hydrological_Engine["Hydrological Risk Engine"]
        ENGINE["Flood Risk Engine"]
        HEURISTIC["Rule-Based Heuristic Scorer"]
        ONNX["ONNX XGBoost ML Model"]
    end

    subgraph Frontend_App["Frontend Application"]
        HOOK["useLiveFloodStatus Hook"]
        MAP["Leaflet Dark Flood Map"]
        NAV["OSRM Driving Directions"]
        TABLE["Predicted Floods Table"]
    end

    PAGASA -->|HTTP POST JSON| SCRAPER
    CRON -->|Trigger Scrape| SCRAPER
    SCRAPER -->|Batch Write| FIRESTORE
    FIRESTORE -->|Real-time Snapshot Stream| HOOK
    HOOK --> MAP
    HOOK --> TABLE

    NOMINATIM -->|Place Geocoding| NAV
    NAV -->|Request Route| OSRM
    OSRM -->|Full Route Polyline| ENGINE
    HOOK -->|Live Telemetry| ENGINE
    ENGINE --> HEURISTIC
    ENGINE --> ONNX
    HEURISTIC -->|300m Segment Risk Overlay| NAV
    ONNX -->|300m Segment Risk Overlay| NAV
    NAV --> MAP
```

---

## 🛠 Tech Stack

| Component                | Technology                                                                                                                                 |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Framework**            | [Next.js 16 (App Router)](https://nextjs.org/)                                                                                             |
| **UI & Styling**         | [React 19](https://react.dev/), [Tailwind CSS 4](https://tailwindcss.com/)                                                                 |
| **Language**             | [TypeScript 5](https://www.typescriptlang.org/)                                                                                            |
| **Interactive Mapping**  | [Leaflet.js](https://leafletjs.com/), CartoDB Dark Matter Tiles                                                                            |
| **Routing & Navigation** | [Open Source Routing Machine (OSRM)](http://project-osrm.org/)                                                                             |
| **Geocoding**            | [OpenStreetMap Nominatim API](https://nominatim.org/)                                                                                      |
| **Database & Realtime**  | [Firebase Cloud Firestore](https://firebase.google.com/docs/firestore), [Firebase Admin SDK](https://firebase.google.com/docs/admin/setup) |
| **Inference Engine**     | [ONNX Runtime](https://onnxruntime.ai/) (XGBoost ONNX Model)                                                                               |
| **Scraper & HTTP**       | [Axios](https://axios-http.com/), [Cheerio](https://cheerio.js.org/)                                                                       |

---

## ⚡ Quickstart & Local Setup

### Prerequisites

- **Node.js**: v18.x or higher
- **npm**: v9.x or higher
- **Firebase Project**: (Optional for local development — fallback client scraping is included out-of-the-box).

### 1. Repository Setup

```bash
git clone https://github.com/haliknihudas666/bahaba.git
cd bahaba
npm install
```

### 2. Environment Variables

Copy the example environment configuration file:

```bash
cp .env.local.example .env.local
```

Configure your `.env.local` file:

```env

# Firebase Client SDK Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your_api_key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your_project_id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your_project.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
NEXT_PUBLIC_FIREBASE_APP_ID=your_app_id

# Firebase Admin SDK Configuration (Server-Side)
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your_project_id.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...YOUR_PRIVATE_KEY...\n-----END PRIVATE KEY-----\n"
```

### 3. Run Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the active flood monitoring dashboard.

### 4. Telemetry Ingestion (Automated Vercel Cron / Local Test)

Bahaba uses **Vercel Cron Jobs** configured in `vercel.json` to automatically trigger `/api/cron/ingest` every 5 minutes (`*/5 * * * *`).

To trigger the telemetry scraper manually for local testing:

```bash
curl http://localhost:3000/api/cron/ingest
```

If `CRON_SECRET` is configured in your `.env.local`:
```bash
curl -H "Authorization: Bearer your_cron_secret" http://localhost:3000/api/cron/ingest
```

---

## 📐 Flood Risk Estimation Engine

Bahaba evaluates flood hazard using a composite risk engine calibrated to Philippine urban hydrology:

### Feature Vector Formulation

1. **Soil Saturation Index (SSI)**: Logistic decay model based on 24-hour antecedent rainfall:
   $$SSI = 1 - e^{-0.019 \times \text{Rain}_{24h}}$$
2. **Rainfall Intensity Ratio**: Normalised against PAGASA heavy rainfall ceiling ($30\text{ mm/hr}$).
3. **Water-Level Rise Rate**: $\Delta(\text{WaterLevel}_{\text{current}} - \text{WaterLevel}_{1h\text{ ago}})$ normalised against $0.3\text{ m/hr}$.
4. **Critical Level Proximity**: Normalized delta relative to station alert, alarm, and critical stage thresholds.

### Risk Buckets & Vehicle Clearance Breakpoints

| Severity     | Flood Depth                          | Traffic Color        | Vehicle Clearance                      |
| ------------ | ------------------------------------ | -------------------- | -------------------------------------- |
| **NORMAL**   | $0 - 5\text{ cm}$                    | `#00b4d8` (Blue)     | All Vehicles (Sedan, SUV, Truck)       |
| **ALERT**    | $6 - 15\text{ cm}$ (Gutter Deep)     | `#f97316` (Orange)   | Sedan Caution, SUV Safe                |
| **ALARM**    | $16 - 30\text{ cm}$ (Half-Tire Deep) | `#ef4444` (Red)      | SUV / Truck Only                       |
| **CRITICAL** | $> 30\text{ cm}$ (Waist Deep+)       | `#7f1d1d` (Dark Red) | Impassable (Heavy Trucks / Boats Only) |

---

## 🧪 Testing

Run the automated test suites for the flood estimation heuristics and spatial road risk engine:

```bash
# Run Hydro-Engine & Edge Case Tests
npm run test:engine

# Run Road Risk & Polyline Segment Evaluator Tests
npm run test:road-risk
```

---

## 📡 API Reference

### `GET /api/cron/ingest`

Executes the PAGASA telemetry scraper, normalizes station readings, and executes dual batch writes to Firestore.

- **Response**: `ScrapeResult` JSON object containing timestamp, station count, and telemetry snapshots.

---

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository.
2. Create your feature branch (`git checkout -b feature/amazing-feature`).
3. Commit your changes (`git commit -m 'Add amazing feature'`).
4. Push to the branch (`git checkout -b feature/amazing-feature`).
5. Open a Pull Request.

---

## 📄 License

Distributed under the MIT License. See `LICENSE` for details.
