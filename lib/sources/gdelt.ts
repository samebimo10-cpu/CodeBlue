import { fetchJson, toIso } from "../http";
import type { RawArticle } from "../types";

/**
 * GDELT DOC 2.0 API — free, global, monitors news in 100+ languages.
 * Searches a rolling ~3 month window and returns coverage-volume timelines.
 */
const BASE = "https://api.gdeltproject.org/api/v2/doc/doc";

interface GdeltArticle {
  url: string;
  title: string;
  seendate: string;
  domain: string;
  language?: string;
  socialimage?: string;
}

export async function gdeltArticles(query: string, timespan = "3months", max = 250): Promise<RawArticle[]> {
  const q = /\s/.test(query) && !query.includes('"') && !/\b(OR|AND)\b/.test(query) ? `"${query}"` : query;
  const url = `${BASE}?query=${encodeURIComponent(q)}&mode=artlist&format=json&sort=datedesc&maxrecords=${max}&timespan=${timespan}`;
  const data = await fetchJson<{ articles?: GdeltArticle[] }>(url, 25000);
  return (data.articles ?? [])
    .filter((a) => !a.language || a.language === "English")
    .map((a) => ({
      url: a.url,
      title: a.title,
      summary: "",
      publishedAt: toIso(a.seendate),
      sourceName: a.domain,
      sourceDomain: a.domain.replace(/^www\./, ""),
      imageUrl: a.socialimage || null,
      language: "en",
      origin: "gdelt" as const,
    }));
}

export interface VolumePoint {
  date: string;
  value: number;
}

/** Share of global coverage mentioning the query, per day, over the timespan. */
export async function gdeltVolume(query: string, timespan = "3months"): Promise<VolumePoint[]> {
  const q = /\s/.test(query) && !query.includes('"') && !/\b(OR|AND)\b/.test(query) ? `"${query}"` : query;
  const url = `${BASE}?query=${encodeURIComponent(q)}&mode=timelinevol&format=json&timespan=${timespan}`;
  const data = await fetchJson<{ timeline?: { data: { date: string; value: number }[] }[] }>(url, 25000);
  return (data.timeline?.[0]?.data ?? []).map((p) => ({ date: toIso(p.date).slice(0, 10), value: p.value }));
}
