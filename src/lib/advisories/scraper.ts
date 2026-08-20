// ---------------------------------------------------------------------------
// Bahaba – Advisory Ingestion & Scraper Pipeline
// Pluggable scraper/API consumer for MMDA & NDRRMC road advisories.
// ---------------------------------------------------------------------------

import type { AdvisorySyncResult, ReportedAdvisory } from "@/types/advisory";
import { parseAdvisoryPost, type RawTweetInput } from "./parser";

/**
 * Ingest live advisories from a configured API/scraper endpoint.
 * Supports any custom API, webhook, or external microservice returning tweet/post arrays.
 */
export async function scrapeAdvisories(): Promise<AdvisorySyncResult> {
  const start = Date.now();
  const apiUrl = process.env.ADVISORY_API_URL;
  const apiKey = process.env.ADVISORY_API_KEY;

  let rawItems: RawTweetInput[] = [];

  if (apiUrl) {
    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (apiKey) {
        headers["Authorization"] = `Bearer ${apiKey}`;
        headers["x-api-key"] = apiKey;
      }

      const response = await fetch(apiUrl, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(15_000),
      });

      if (response.ok) {
        const data = await response.json();
        const items = Array.isArray(data) ? data : data.items || data.tweets || data.posts || [];

        if (Array.isArray(items)) {
          const parsed = items
            .map((t: any): RawTweetInput | null => {
              const text =
                t.full_text ||
                t.text ||
                t.fullText ||
                t.tweetText ||
                t.description ||
                t.content ||
                t.title ||
                "";

              if (!text || typeof text !== "string" || text.trim().length < 5) {
                return null;
              }

              const rawAuthor =
                t.author?.userName ||
                t.author?.screen_name ||
                t.user?.screen_name ||
                t.userName ||
                t.username ||
                t.author_username ||
                t.user_screen_name ||
                (text.toLowerCase().includes("ndrrmc") ? "NDRRMC_OpCen" : "MMDA");

              const author = String(rawAuthor).replace(/^@/, "").trim();

              const rawId = String(
                t.id_str ||
                t.id ||
                t.tweetId ||
                t.idStr ||
                t.rest_id ||
                Math.random().toString(36).slice(2)
              );
              const id = rawId.replace(/^(tweet|status)[-_]/i, "").trim();

              let createdAt = new Date().toISOString();
              if (t.created_at) createdAt = new Date(t.created_at).toISOString();
              else if (t.createdAt) createdAt = new Date(t.createdAt).toISOString();
              else if (t.timestamp) createdAt = new Date(t.timestamp).toISOString();

              let url = t.url || t.tweetUrl || t.twitterUrl || `https://x.com/${author}/status/${id}`;
              url = url.replace(/\/status\/(?:tweet|status)-/i, "/status/");

              const photoUrls: string[] = [];
              if (Array.isArray(t.media)) {
                t.media.forEach((m: any) => {
                  const u = m.media_url_https || m.url || m.mediaUrl;
                  if (u && typeof u === "string") photoUrls.push(u);
                });
              }
              if (Array.isArray(t.extended_entities?.media)) {
                t.extended_entities.media.forEach((m: any) => {
                  const u = m.media_url_https || m.url;
                  if (u && typeof u === "string") photoUrls.push(u);
                });
              }
              if (Array.isArray(t.images)) {
                t.images.forEach((img: any) => {
                  const u = typeof img === "string" ? img : img.url;
                  if (u && typeof u === "string") photoUrls.push(u);
                });
              }
              if (Array.isArray(t.photos)) {
                t.photos.forEach((img: any) => {
                  const u = typeof img === "string" ? img : img.url;
                  if (u && typeof u === "string") photoUrls.push(u);
                });
              }

              return {
                id,
                text,
                author,
                createdAt,
                url,
                photoUrls,
              };
            })
            .filter((item): item is RawTweetInput => item !== null);

          if (parsed.length > 0) {
            rawItems = parsed;
          }
        }
      }
    } catch (err: unknown) {
      console.warn(
        "[AdvisoryScraper] Ingestion request failed:",
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // Parse all raw inputs through NLP & geocoder
  const advisories: ReportedAdvisory[] = rawItems
    .map(parseAdvisoryPost)
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

  const activeFloodCount = advisories.filter(
    (a) => a.isFloodReport && a.status === "ACTIVE"
  ).length;

  const sourceBreakdown: Record<string, number> = {};
  for (const a of advisories) {
    sourceBreakdown[a.source] = (sourceBreakdown[a.source] || 0) + 1;
  }

  return {
    success: true,
    scrapedAt: new Date().toISOString(),
    advisories,
    totalCount: advisories.length,
    activeFloodCount,
    meta: {
      durationMs: Date.now() - start,
      sourceBreakdown,
    },
  };
}
