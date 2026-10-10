import { fetchJson, toIso } from "../http";
import type { RawArticle } from "../types";

/** The Guardian Open Platform — searchable archive back to 1999. Needs GUARDIAN_API_KEY. */
interface GuardianResult {
  webTitle: string;
  webUrl: string;
  webPublicationDate: string;
  fields?: { trailText?: string; thumbnail?: string; byline?: string };
}

export function guardianEnabled() {
  return Boolean(process.env.GUARDIAN_API_KEY);
}

export async function guardianSearch(query: string, orderBy: "newest" | "relevance" | "oldest" = "newest", pageSize = 50): Promise<RawArticle[]> {
  const key = process.env.GUARDIAN_API_KEY;
  if (!key) return [];
  const url = `https://content.guardianapis.com/search?q=${encodeURIComponent(query)}&order-by=${orderBy}&page-size=${pageSize}&show-fields=trailText,thumbnail,byline&api-key=${key}`;
  const data = await fetchJson<{ response?: { results?: GuardianResult[] } }>(url);
  return (data.response?.results ?? []).map((r) => ({
    url: r.webUrl,
    title: r.webTitle,
    summary: (r.fields?.trailText ?? "").replace(/<[^>]+>/g, ""),
    publishedAt: toIso(r.webPublicationDate),
    sourceName: "The Guardian",
    sourceDomain: "theguardian.com",
    imageUrl: r.fields?.thumbnail ?? null,
    author: r.fields?.byline ?? null,
    language: "en",
    origin: "guardian" as const,
  }));
}
