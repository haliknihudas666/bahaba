# 🇵🇭 DOST-PAGASA Panahon API Samples & Data Dictionary

This directory contains sanitized, real-world JSON response payloads extracted from the **DOST-PAGASA Panahon Web Portal (`https://www.panahon.gov.ph`)**.

Panahon is the modern unified meteorological and hydrological monitoring platform operated by the Philippine Atmospheric, Geophysical and Astronomical Services Administration (DOST-PAGASA). It exposes REST API endpoints for:
1. **Automated Weather Stations (AWS)** across the Philippine archipelago
2. **Major River Basins** (Water Level gauges & Rain gauges)
3. **Synoptic Stations** (Surface synoptic observations & 3-hour precipitation)
4. **Tropical Cyclone Tracks** (Active storms, historical coordinates, categories, and forecast radius)

> [!NOTE]
> **Station Types & Meteorological Context**:
> - **Automated Weather Stations (AWS)**: Unmanned, computerized sensor units that continuously measure and transmit high-frequency, real-time weather data (hourly/24-hr rainfall, temperature, heat index, humidity, pressure, wind velocity) via automated telemetry and remote communication.
> - **Synoptic Stations (SYNOP)**: Comprehensive observation centers staffed by professional human observers to record standard international meteorological parameters (3-hour rainfall, cloud cover/conditions, MSLP, observed weather icons) at scheduled synoptic intervals according to World Meteorological Organization (WMO) standards.

---

## 📁 Directory Structure

```
data/samples/panahon/
├── README.md                          # This documentation file
├── aws/                               # Automated Weather Stations (AWS)
│   ├── rainfall.json                  # parameter=rainfall (Hourly rain + 24hr accumulated in mm)
│   ├── temperature.json               # parameter=temperature (Ambient temperature in °C)
│   ├── heat-index.json                # parameter=heat-index (Apparent heat index in °C)
│   ├── humidity.json                  # parameter=humidity (Relative humidity in %)
│   ├── pressure.json                  # parameter=pressure (Atmospheric pressure in hPa)
│   ├── wind-speed.json                # parameter=wind-speed (Wind velocity in m/s)
│   └── wind-direction.json            # parameter=wind-direction (Compass degrees 0-360°)
├── riverbasin/                        # River Basin Hydrological Telemetry
│   ├── waterlevel.json                # parameter=waterlevel (River water level in meters)
│   └── raingauge.json                 # parameter=raingauge (River catchment 1-hr rain in mm/m)
├── synop/                             # Synoptic Weather Stations
│   ├── observed_weather.json          # parameter=observed_weather (Weather icons & descriptions)
│   ├── rain.json                      # parameter=rain (3-hour rainfall accumulation in mm)
│   ├── currentTemp.json               # parameter=currentTemp (Current synoptic temperature in °C)
│   ├── mslp.json                      # parameter=mslp (Mean Sea Level Pressure in hPa)
│   ├── windSpeed.json                 # parameter=windSpeed (Synoptic wind speed in m/s)
│   └── windDirection.json             # parameter=windDirection (Compass heading e.g., "ENE")
└── cyclone/                           # Tropical Cyclone Monitoring
    └── cyclone-track.json             # Cyclone coordinates, category (TD/TS/TY/STY), and track
```

---

## 📡 API Endpoints & Parameter Reference

> **Authentication**: All endpoints accept an API / session token passed via query parameter `?token=<API_TOKEN>` or via authenticated session cookies + CSRF tokens obtained from the Panahon landing page.

### 1. Automated Weather Stations (AWS)
- **Base Endpoint**: `https://www.panahon.gov.ph/api/v1/aws`
- **Method**: `GET`
- **Required Query Parameters**: `token=<API_TOKEN>`, `parameter=<PARAM_NAME>`

| Parameter Key | Unit | Description | Sample Request URL | Sample Response File |
| :--- | :--- | :--- | :--- | :--- |
| `rainfall` | `mm` | Hourly rainfall and 24-hr accumulated precipitation | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=rainfall` | [`aws/rainfall.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/rainfall.json) |
| `temperature` | `°C` | Ambient surface air temperature | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=temperature` | [`aws/temperature.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/temperature.json) |
| `heat-index` | `°C` | Apparent temperature / calculated human discomfort index | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=heat-index` | [`aws/heat-index.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/heat-index.json) |
| `humidity` | `%` | Relative atmospheric humidity percentage | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=humidity` | [`aws/humidity.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/humidity.json) |
| `pressure` | `hPa` | Atmospheric station barometric pressure | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=pressure` | [`aws/pressure.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/pressure.json) |
| `wind-speed` | `m/s` | Wind speed velocity | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=wind-speed` | [`aws/wind-speed.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/wind-speed.json) |
| `wind-direction`| `°` | Wind compass direction (0° = North, 90° = East, 180° = South, 270° = West) | `https://www.panahon.gov.ph/api/v1/aws?token=<API_TOKEN>&parameter=wind-direction` | [`aws/wind-direction.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/aws/wind-direction.json) |

---

### 2. River Basin Hydrological Telemetry
Endpoints for water level and rain sensors located across major Philippine river basins (Pampanga, Agno, Bicol, Cagayan, Pasig-Marikina, etc.).

- **Method**: `GET`
- **Required Query Parameters**: `token=<API_TOKEN>`, `parameter=<PARAM_NAME>`

| Endpoint | Parameter Key | Unit | Description | Sample Request URL | Sample Response File |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `/api/v1/riverbasin/waterlevel` | `waterlevel` | `m` | River water level / gauge height | `https://www.panahon.gov.ph/api/v1/riverbasin/waterlevel?token=<API_TOKEN>&parameter=waterlevel` | [`riverbasin/waterlevel.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/riverbasin/waterlevel.json) |
| `/api/v1/riverbasin/raingauge` | `raingauge` | `mm` | River catchment 1-hr rain gauge | `https://www.panahon.gov.ph/api/v1/riverbasin/raingauge?token=<API_TOKEN>&parameter=raingauge` | [`riverbasin/raingauge.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/riverbasin/raingauge.json) |

---

### 3. Synoptic Weather Stations (SYNOP)
Surface observations recorded by human observers at standard WMO synoptic intervals.

- **Base Endpoint**: `https://www.panahon.gov.ph/api/v1/synop`
- **Method**: `GET`
- **Required Query Parameters**: `token=<API_TOKEN>`, `parameter=<PARAM_NAME>`

| Parameter Key | Unit | Description | Sample Request URL | Sample Response File |
| :--- | :--- | :--- | :--- | :--- |
| `observed_weather` | Text/JSON | Observed weather condition description and PAGASA icon URL | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=observed_weather` | [`synop/observed_weather.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/observed_weather.json) |
| `rain` | `mm` | 3-hour accumulated precipitation | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=rain` | [`synop/rain.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/rain.json) |
| `currentTemp` | `°C` | Synoptic surface temperature | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=currentTemp` | [`synop/currentTemp.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/currentTemp.json) |
| `mslp` | `hPa` | Mean Sea Level Pressure | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=mslp` | [`synop/mslp.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/mslp.json) |
| `windSpeed` | `m/s` | Synoptic wind speed velocity | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=windSpeed` | [`synop/windSpeed.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/windSpeed.json) |
| `windDirection` | Cardinal | Cardinal compass wind heading (e.g. `ENE`, `SW`, `NNE`) | `https://www.panahon.gov.ph/api/v1/synop?token=<API_TOKEN>&parameter=windDirection` | [`synop/windDirection.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/synop/windDirection.json) |

---

### 4. Tropical Cyclone Tracking
Live tropical cyclone track coordinates, categorizations, and wind radii.

- **Endpoint**: `https://www.panahon.gov.ph/api/v1/cyclone-track`
- **Method**: `GET`
- **Required Query Parameters**: `token=<API_TOKEN>`

| Endpoint | Description | Sample Request URL | Sample Response File |
| :--- | :--- | :--- | :--- |
| `/api/v1/cyclone-track` | Active tropical cyclone tracking points, category codes (TD/TS/STS/TY/STY), and forecast radii | `https://www.panahon.gov.ph/api/v1/cyclone-track?token=<API_TOKEN>` | [`cyclone/cyclone-track.json`](file:///d:/Hudas/Documents/Repository/bahaba/data/samples/panahon/cyclone/cyclone-track.json) |

---

## 📊 Data Schemas & Field Explanations

### 1. AWS Telemetry (`/api/v1/aws`)

#### Response Envelope:
```json
{
  "success": true,
  "data": [
    {
      "site_id": "98",
      "site_name": "Science Garden, Quezon City",
      "lat": 14.645101,
      "lon": 121.044258,
      "parameter": "rainfall",
      "readable_parameter": "Hourly Rain",
      "readable_unit": "mm",
      "observed_at": "2026-08-21 11:00:00",
      "value": "0",
      "24_hr_value": "0"
    }
  ]
}
```

#### Fields:
- `site_id` *(string)*: Unique sensor identifier assigned by PAGASA.
- `site_name` *(string)*: Geographical location name of the station.
- `lat` *(number)*: Latitude in WGS84 decimal degrees.
- `lon` *(number)*: Longitude in WGS84 decimal degrees.
- `parameter` *(string)*: Requested parameter key (`rainfall`, `temperature`, `heat-index`, `humidity`, `pressure`, `wind-speed`, `wind-direction`).
- `readable_parameter` *(string)*: Human-readable display label.
- `readable_unit` *(string)*: Measurement unit (`mm`, `°C`, `%`, `hPa`, `m/s`, `°`).
- `observed_at` *(string)*: Observation timestamp in Philippine Standard Time (PST / UTC+8) in `YYYY-MM-DD HH:mm:ss` format.
- `value` *(string | number | null)*: Current recorded value.
- `24_hr_value` *(string | number, optional)*: 24-hour accumulated reading (available on `rainfall`).

---

### 2. River Basin Telemetry (`/api/v1/riverbasin/waterlevel` & `/api/v1/riverbasin/raingauge`)

#### Sample Water Level Record:
```json
{
  "site_id": "3",
  "site_name": "Ombao",
  "lat": 13.474834,
  "lon": 123.24125,
  "parameter": "waterlevel",
  "readable_parameter": "Water Level",
  "readable_unit": "m",
  "observed_at": "2026-08-21 10:00:00",
  "value": "0.27"
}
```

#### Fields:
- `site_id` *(string)*: River basin identifier (e.g. `1` = Pampanga, `2` = Agno, `3` = Bicol, etc.).
- `site_name` *(string)*: River station or bridge location name.
- `lat` *(number)*: Latitude of the river gauge.
- `lon` *(number)*: Longitude of the river gauge.
- `parameter` *(string)*: `waterlevel` or `raingauge`.
- `value` *(string | number | null)*: Water level in meters (`m`) or rainfall in millimeters (`mm`).

---

### 3. Synoptic Station Observations (`/api/v1/synop`)

#### Sample Observed Weather Record:
```json
{
  "site_id": "132",
  "site_name": "ITBAYAT, BATANES",
  "lat": "20.79000758",
  "lon": "121.83964751",
  "parameter": "observed_weather",
  "readable_parameter": "Observed Weather",
  "readable_unit": "",
  "observed_at": "2026-08-21 08:00:00",
  "value": "{\"icon\":\"https://pubfiles.pagasa.dost.gov.ph/pagasaweb/icons/weather/64/cloudy-skies-with-rainshowers.png\",\"desc\":\"Cloudy Skies with Rainshowers\"}",
  "min_zoom": 0
}
```

> **Note on `value`**: For `observed_weather`, `value` is a JSON-encoded string with `icon` URL and `desc` description. For numeric parameters like `rain` (3-hr rain), `currentTemp`, `mslp`, etc., `value` is a numeric string (e.g. `"28.5"`).

---

### 4. Tropical Cyclone Tracking (`/api/v1/cyclone-track`)

#### Sample Record:
```json
[
  {
    "cyclone_name": "NENENG{}",
    "info": {
      "2026-08-18 14:00": {
        "cyclone_type": "TD",
        "date": "2026-08-18",
        "time": "14:00",
        "latitude": "20.3",
        "longitude": "131.9",
        "radius": "0"
      }
    }
  }
]
```

#### Fields:
- `cyclone_name` *(string)*: Local PAGASA name of the tropical cyclone.
- `info` *(object)*: Map of observation timestamps to coordinates and classification:
  - `cyclone_type`: Classification code (`TD` = Tropical Depression, `TS` = Tropical Storm, `STS` = Severe Tropical Storm, `TY` = Typhoon, `STY` = Super Typhoon).
  - `latitude`: Latitude position in decimal degrees.
  - `longitude`: Longitude position in decimal degrees.
  - `radius`: Wind radius extent.
