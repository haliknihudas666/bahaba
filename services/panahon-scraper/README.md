# 🌤️ Bahaba DOST-PAGASA Panahon Telemetry Scraper Worker

> **Real-time hydrological and meteorological telemetry ingestion microservice for Bahaba.**

A lightweight, high-reliability background worker designed to run on a **Raspberry Pi** or residential Philippine server using **PM2**. It continuously ingests nationwide Automated Weather Stations (AWS), River Basin water levels/rain gauges, and Synoptic observations from DOST-PAGASA's Panahon Portal (`https://panahon.gov.ph`) and persists consolidated telemetry snapshots directly into **MongoDB Atlas**.

---

## 🌟 Why Run on a Raspberry Pi?

DOST-PAGASA's server (`panahon.gov.ph` on PLDT Enterprise in Manila) uses an anti-scraping WAF that identifies and blocks cloud datacenter IP addresses (such as AWS Lambda on Vercel) by serving a 1x1 tracking PNG image instead of the HMAC signing secret.

Running this worker on your **Raspberry Pi** on a residential Philippine ISP (PLDT, Globe, Converge, Smart, DITO) allows the scraper to:
1. Complete the HMAC signature exchange without any WAF blocking.
2. Ingest all **290 active DOST-PAGASA stations** in **~1.5 seconds**.
3. Keep **MongoDB Atlas** continuously updated every 5 minutes.
4. Allow your Vercel deployment (`https://bahaba.nicolei.games`) to immediately deliver fresh telemetry to web and mobile visitors with **< 50ms latency**!

---

## 🚀 Getting Started on Your Raspberry Pi

### 1. Navigate to the Worker Directory

```bash
cd services/panahon-scraper
```

### 2. Install Dependencies

Using **Bun** (recommended) or **npm**:
```bash
bun install
# or: npm install
```

### 3. Ensure Environment Variables are Configured

The worker automatically reads `../../.env.local` from the repository root, or a local `.env` file in this directory:

```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/?appName=Cluster0
MONGODB_DB=bahaba
# Optional: Interval in minutes (default is 5)
INTERVAL_MINUTES=5
```

---

## 🛠 Running the Worker

### Single Test Run (`--once`)
Runs a single scrape pass, prints station metrics to the console, updates MongoDB Atlas, and exits:

```bash
bun run scrape:once
# or: npm run scrape:once
```

### Production Process Management (PM2)

To keep the worker running 24/7 on your Raspberry Pi alongside `bahaba-advisories`:

```bash
# Start with PM2 using Bun
pm2 start worker.ts --name bahaba-panahon --interpreter bun

# Or start with PM2 using tsx/node:
pm2 start npx --name bahaba-panahon -- tsx worker.ts

# Save PM2 process list so it automatically restarts on Pi reboot:
pm2 save
```

### Useful PM2 Commands

```bash
# View live telemetry scraping logs
pm2 logs bahaba-panahon

# Check worker memory & CPU usage
pm2 status

# Restart the worker
pm2 restart bahaba-panahon

# Stop the worker
pm2 stop bahaba-panahon
```
