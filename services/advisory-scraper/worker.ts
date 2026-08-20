// ---------------------------------------------------------------------------
// Bahaba – Standalone Advisory Scraper Worker
// Scrapes @MMDA, @NDRRMC_OpCen, & @dost_pagasa via Playwright & saves to Firestore
// ---------------------------------------------------------------------------

import { chromium, type Browser } from "playwright";
import admin from "firebase-admin";
import dotenv from "dotenv";
import path from "node:path";
import fs from "node:fs";
import * as cheerio from "cheerio";
import { parseAdvisoryPost, isWeatherOrFloodRelated, type RawTweetInput } from "../../src/lib/advisories/parser";

// Load environment variables from parent .env.local or local .env
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config();

// 1. Initialize Firebase Admin
if (!admin.apps.length) {
  const rawKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  let credential = admin.credential.applicationDefault();

  if (rawKey) {
    try {
      const jsonString = rawKey.startsWith("{")
        ? rawKey
        : Buffer.from(rawKey, "base64").toString("utf-8");
      const serviceAccount = JSON.parse(jsonString);
      credential = admin.credential.cert(serviceAccount);
    } catch (e: any) {
      console.warn("[Firebase] Could not parse service account JSON, falling back to projectId:", e.message);
    }
  }

  admin.initializeApp({
    credential,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
}

const db = admin.firestore();
try {
  db.settings({ ignoreUndefinedProperties: true });
} catch { }

// Government accounts — scrape profiles directly, keep all posts
const GOV_HANDLES = ["MMDA", "NDRRMC_OpCen", "dost_pagasa"];

// News outlets — scrape via X search with targeted keywords
const NEWS_SEARCH_KEYWORDS = "baha OR flood OR flooding OR floodwater OR bagyo OR typhoon OR walangpasok";
const NEWS_OUTLETS = ["gmanews", "ABSCBNNews", "News5PH", "inquirerdotnet"];

function buildNewsSearchUrl(handle: string): string {
  const query = `(${NEWS_SEARCH_KEYWORDS}) (from:${handle})`;
  return `https://x.com/search?q=${encodeURIComponent(query)}&f=live&src=typed_query`;
}

const POLL_INTERVAL_MS = 5 * 60 * 1000; // Scrape every 5 minutes
const AUTH_FILE = path.resolve(__dirname, "x-auth.json");

/**
 * Scrapes latest tweets and photos from an X profile or search URL using Playwright.
 * @param cutoffDate If provided, keeps scrolling until tweets older than this date are found.
 * @param filter 'all' returns every post, 'relevant' only #walangpasok + flood/weather posts
 */
async function scrapeProfileWithBrowser(
  browser: Browser,
  handle: string,
  cutoffDate?: Date,
  filter: "all" | "relevant" = "all"
): Promise<RawTweetInput[]> {
  const hasAuth = fs.existsSync(AUTH_FILE);
  if (!hasAuth) {
    console.warn("[Scraper] ⚠ No auth file found. Run 'npx tsx save-auth.ts' to log in first. Scraping will be limited.");
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    ...(hasAuth ? { storageState: AUTH_FILE } : {}),
  });

  const page = await context.newPage();
  const posts: RawTweetInput[] = [];

  try {
    console.log(`[Scraper] Navigating to https://x.com/${handle}...`);
    await page.goto(`https://x.com/${handle}`, {
      waitUntil: "domcontentloaded",
      timeout: 30_000,
    });

    // Wait for article or timeline content
    await page.waitForSelector("article, [data-tweet-id]", { timeout: 10_000 }).catch(() => null);
    await page.waitForTimeout(3000);

    // Scroll the page to load more tweets
    // In backfill mode: scroll until we pass the cutoff date (up to 50 passes)
    // In normal mode: do up to 5 scroll passes
    const MAX_SCROLL_PASSES = cutoffDate ? 50 : 5;
    const seenIds = new Set<string>();
    let reachedCutoff = false;
    let scrollPass = 0;
    let consecutiveStalls = 0;

    for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
      scrollPass = pass + 1;
      const prevPostCount = posts.length;

      const html = await page.content();
      const $ = cheerio.load(html);

      $("article").each((_, el) => {
        const art = $(el);
        const dataId = art.attr("data-tweet-id") || "";
        const href = art.find("a[href*='/status/']").attr("href") || "";
        const idMatch = href.match(/\/status\/([0-9]+)/);
        const id = dataId || (idMatch ? idMatch[1] : Math.random().toString(36).slice(2));

        // Skip duplicates from previous scroll passes
        if (seenIds.has(id)) return;
        seenIds.add(id);

        // 1. Calculate precise publishedAt from Snowflake ID or time datetime
        const timeAttr = art.find("time").attr("datetime");
        let publishedAt = timeAttr || "";
        if (!publishedAt) {
          try {
            const idBig = BigInt(id);
            const ms = Number((idBig >> 22n) + 1288834974657n);
            const d = new Date(ms);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
              publishedAt = d.toISOString();
            }
          } catch { }
        }
        if (!publishedAt) {
          publishedAt = new Date().toISOString();
        }

        // Check if this tweet is older than the cutoff date
        if (cutoffDate && new Date(publishedAt) < cutoffDate) {
          reachedCutoff = true;
          return; // Skip tweets older than cutoff
        }

        // 2. Extract text content
        let text = art.find("[lang]").text().trim();
        if (!text) {
          text = art.find("p").text().trim();
        }
        if (!text) {
          text = art.text().trim();
          // Strip author prefix if present (e.g. "Official MMDA@MMDA37m")
          text = text.replace(/^.*?@\w+\s*(?:\d+[smhdwy]|\w+\s*\d+)?\s*/i, "");
        }

        if (!text || text.trim().length < 5) return;

        // 3. Extract high-res photos
        const photoUrls = art
          .find("img")
          .map((_, img) => $(img).attr("src"))
          .get()
          .filter(
            (src: string) =>
              src &&
              !src.includes("profile_images") &&
              !src.includes("emoji") &&
              !src.includes("svg") &&
              !src.includes("sticky")
          );

        posts.push({
          id,
          text,
          author: handle,
          createdAt: publishedAt,
          url: href ? (href.startsWith("http") ? href : `https://x.com${href}`) : `https://x.com/${handle}/status/${id}`,
          photoUrls,
        });
      });

      // Stop scrolling if we've reached tweets older than the cutoff
      if (reachedCutoff) {
        console.log(`[Scraper] Reached cutoff date (${cutoffDate!.toISOString().split("T")[0]}) for @${handle} after ${scrollPass} scroll passes.`);
        break;
      }

      // Check if this parse pass found any new posts
      const newThisPass = posts.length - prevPostCount;
      if (newThisPass === 0) {
        consecutiveStalls++;
        // Require 2 consecutive stalls before giving up (X can lag loading)
        if (consecutiveStalls >= 2) {
          console.log(`[Scraper] No new content after ${consecutiveStalls} consecutive scroll passes, stopping @${handle}.`);
          break;
        }
      } else {
        consecutiveStalls = 0;
      }

      // Scroll down to trigger lazy loading of more tweets
      if (pass < MAX_SCROLL_PASSES - 1) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
        await page.waitForTimeout(3000);

        if (cutoffDate && pass % 5 === 4) {
          const oldest = posts.length > 0 ? posts[posts.length - 1].createdAt : "N/A";
          console.log(`[Scraper]   ... scroll pass ${scrollPass}, ${posts.length} posts so far, oldest: ${oldest}`);
        }
      }
    }

    if (filter === "relevant") {
      const relevantPosts = posts.filter((p) => {
        const lower = p.text.toLowerCase();
        return lower.includes("walangpasok") || lower.includes("walang pasok") || isWeatherOrFloodRelated(p.text);
      });
      console.log(`✅ [Browser] Extracted ${posts.length} posts from @${handle} (${relevantPosts.length} relevant) in ${scrollPass} scroll passes.`);
      return relevantPosts;
    }

    console.log(`✅ [Browser] Extracted ${posts.length} posts from @${handle} in ${scrollPass} scroll passes.`);
    return posts;
  } catch (err: any) {
    console.warn(`❌ [Browser Warning] Failed scraping @${handle}:`, err.message);
  } finally {
    await context.close();
  }

  return [];
}

/**
 * Scrapes an X search results page
 */
async function scrapeSearchWithBrowser(browser: Browser, searchUrl: string, label: string, cutoffDate?: Date): Promise<RawTweetInput[]> {
  const hasAuth = fs.existsSync(AUTH_FILE);
  if (!hasAuth) {
    console.warn("[Scraper] ⚠ No auth file — search requires login. Skipping hashtag search.");
    return [];
  }

  const context = await browser.newContext({
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
    viewport: { width: 1280, height: 900 },
    storageState: AUTH_FILE,
  });

  const page = await context.newPage();
  const posts: RawTweetInput[] = [];

  try {
    console.log(`[Scraper] Searching X for ${label}...`);
    await page.goto(searchUrl, { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.waitForSelector("article", { timeout: 10_000 }).catch(() => null);
    await page.waitForTimeout(3000);

    const MAX_SCROLL_PASSES = cutoffDate ? 30 : 3;
    const seenIds = new Set<string>();
    let reachedCutoff = false;
    let scrollPass = 0;
    let consecutiveStalls = 0;

    for (let pass = 0; pass < MAX_SCROLL_PASSES; pass++) {
      scrollPass = pass + 1;
      const prevPostCount = posts.length;

      const html = await page.content();
      const $ = cheerio.load(html);

      $("article").each((_, el) => {
        const art = $(el);
        const href = art.find("a[href*='/status/']").attr("href") || "";
        const idMatch = href.match(/\/status\/([0-9]+)/);
        const id = idMatch ? idMatch[1] : Math.random().toString(36).slice(2);

        if (seenIds.has(id)) return;
        seenIds.add(id);

        // Extract author from the tweet link (e.g. /username/status/123)
        const authorMatch = href.match(/^\/([^\/]+)\/status/);
        const author = authorMatch ? authorMatch[1] : "search";

        const timeAttr = art.find("time").attr("datetime");
        let publishedAt = timeAttr || "";
        if (!publishedAt) {
          try {
            const idBig = BigInt(id);
            const ms = Number((idBig >> 22n) + 1288834974657n);
            const d = new Date(ms);
            if (!isNaN(d.getTime()) && d.getFullYear() >= 2020) {
              publishedAt = d.toISOString();
            }
          } catch { }
        }
        if (!publishedAt) publishedAt = new Date().toISOString();

        if (cutoffDate && new Date(publishedAt) < cutoffDate) {
          reachedCutoff = true;
          return;
        }

        let text = art.find("[lang]").text().trim();
        if (!text) text = art.find("p").text().trim();
        if (!text || text.trim().length < 5) return;

        const photoUrls = art
          .find("img")
          .map((_, img) => $(img).attr("src"))
          .get()
          .filter(
            (src: string) =>
              src &&
              !src.includes("profile_images") &&
              !src.includes("emoji") &&
              !src.includes("svg") &&
              !src.includes("sticky")
          );

        posts.push({
          id,
          text,
          author,
          createdAt: publishedAt,
          url: href.startsWith("http") ? href : `https://x.com${href}`,
          photoUrls,
        });
      });

      if (reachedCutoff) {
        console.log(`[Scraper] Reached cutoff date for #WalangPasok search after ${scrollPass} scroll passes.`);
        break;
      }

      const newThisPass = posts.length - prevPostCount;
      if (newThisPass === 0) {
        consecutiveStalls++;
        if (consecutiveStalls >= 2) {
          console.log(`[Scraper] No new search results after ${consecutiveStalls} stalls, stopping.`);
          break;
        }
      } else {
        consecutiveStalls = 0;
      }

      if (pass < MAX_SCROLL_PASSES - 1) {
        await page.evaluate(() => window.scrollBy(0, window.innerHeight * 3));
        await page.waitForTimeout(3000);
      }
    }

    console.log(`✅ [Search] ${label}: ${posts.length} results in ${scrollPass} scroll passes.`);
    return posts;
  } catch (err: any) {
    console.warn(`❌ [Browser Warning] Failed scraping search:`, err.message);
  } finally {
    await context.close();
  }

  return [];
}

/**
 * Main Scraper Job: Scrapes all profiles, parses NLP/hotspots, and writes to Firestore
 */
export async function runScraperJob() {
  const start = Date.now();
  console.log(`\n========================================================`);
  console.log(`[${new Date().toISOString()}] Starting Bahaba Advisory Ingestion Job`);
  console.log(`========================================================`);

  let browser: Browser | null = null;

  try {
    browser = await chromium.launch({
      headless: false,
      args: ["--no-sandbox", "--disable-setuid-sandbox", "--disable-dev-shm-usage"],
    });

    const allRawItems: RawTweetInput[] = [];

    // Parse --backfill flag for initial deep scrape
    const backfillArg = process.argv.find((a) => a.startsWith("--backfill"));
    let cutoffDate: Date | undefined;
    if (backfillArg) {
      const dateStr = backfillArg.includes("=") ? backfillArg.split("=")[1] : "2026-08-15";
      cutoffDate = new Date(dateStr);
      console.log(`[Scraper] Backfill mode: scrolling until ${cutoffDate.toISOString().split("T")[0]}`);
    }

    for (const handle of GOV_HANDLES) {
      const items = await scrapeProfileWithBrowser(browser, handle, cutoffDate, "all");
      allRawItems.push(...items);
    }

    // Scrape news outlets via X search (targeted keyword queries)
    for (const handle of NEWS_OUTLETS) {
      const searchUrl = buildNewsSearchUrl(handle);
      const items = await scrapeSearchWithBrowser(browser, searchUrl, `@${handle}`, cutoffDate);
      allRawItems.push(...items);
    }

    if (allRawItems.length === 0) {
      console.log("[Scraper] No posts extracted in this cycle.");
      return;
    }

    // Parse all raw items through NLP, depth analysis, and landmark geocoder
    const advisories = allRawItems
      .map(parseAdvisoryPost)
      .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    const activeFloodCount = advisories.filter((a) => a.isFloodReport && a.status === "ACTIVE").length;

    console.log(`[Parser] Processed ${advisories.length} total advisories (${activeFloodCount} active flood alerts).`);

    // Write to Firestore in batch
    const batch = db.batch();

    for (const advisory of advisories) {
      const docRef = db.collection("advisories").doc(advisory.id);
      const sanitized = JSON.parse(JSON.stringify(advisory));
      batch.set(docRef, sanitized, { merge: true });
    }

    // Write Sync Metadata
    const metaRef = db.collection("sync_meta").doc("advisories");
    batch.set(
      metaRef,
      {
        lastSyncedAt: new Date().toISOString(),
        totalCount: advisories.length,
        activeFloodCount,
        durationMs: Date.now() - start,
      },
      { merge: true }
    );

    await batch.commit();
    console.log(`✅ [Firestore] Successfully committed ${advisories.length} advisories in ${Date.now() - start}ms.`);
  } catch (err: any) {
    console.error(`❌ [Scraper Error]:`, err.message);
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

// ── Runner entrypoint ──────────────────────────────────────────────────────
const isOnce = process.argv.includes("--once");

if (isOnce) {
  runScraperJob().then(() => {
    console.log("[Worker] Single scrape complete. Exiting.");
    process.exit(0);
  });
} else {
  // Continuous worker loop
  runScraperJob();
  setInterval(runScraperJob, POLL_INTERVAL_MS);
  console.log(`[Worker] Continuous advisory scraper running (polling every ${POLL_INTERVAL_MS / 1000}s)...`);
}
