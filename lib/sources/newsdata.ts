import { domainOf, fetchJson, toIso } from "../http";
import type { RawArticle } from "../types";

/** NewsData.io — 80k+ sources including many African outlets. Needs NEWSDATA_API_KEY. */
interface NewsDataResult {
  title: string;
  link: string;
  description?: string | null;
  pubDate: string;
  source_id?: string;
  source_name?: string;
  source_url?: string;
  image_url?: string | null;
  creator?: string[] | null;
  language?: string;
}

export function newsdataEnabled() {
  return Boolean(process.env.NEWSDATA_API_KEY);
}

export async function newsdataSearch(query: string): Promise<RawArticle[]> {
  const key = process.env.NEWSDATA_API_KEY;
  if (!key) return [];
  const url = `https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(query)}&language=en`;
  const data = await fetchJson<{ results?: NewsDataResult[] }>(url);
  return (data.results ?? []).map((r) => ({
    url: r.link,
    title: r.title,
    summary: r.description ?? "",
    publishedAt: toIso(r.pubDate),
    sourceName: r.source_name ?? r.source_id ?? domainOf(r.link),
    sourceDomain: domainOf(r.source_url ?? r.link),
    imageUrl: r.image_url ?? null,
    author: r.creator?.[0] ?? null,
    language: "en",
    origin: "newsdata" as const,
  }));
}
