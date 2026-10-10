import { fetchText } from "../http";
import type { RawArticle } from "../types";
import { parseFeed } from "./rss";

/**
 * Google News RSS: aggregates thousands of publishers. Section feeds give the
 * standard topic coverage; search feeds give coverage of any subject.
 */
function edition() {
  const hl = process.env.CODEBLUE_NEWS_HL ?? "en-US";
  const gl = process.env.CODEBLUE_NEWS_GL ?? "US";
  const lang = hl.split("-")[0];
  return `hl=${hl}&gl=${gl}&ceid=${gl}:${lang}`;
}

export function sectionUrl(section: string) {
  return `https://news.google.com/rss/headlines/section/topic/${section}?${edition()}`;
}

/** `when` narrows to a recent window, e.g. "1d", "7d". Omit for all time. */
export function searchUrl(query: string, when?: string) {
  const q = when ? `${query} when:${when}` : query;
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${edition()}`;
}

export async function googleSection(section: string): Promise<RawArticle[]> {
  return parseFeed(await fetchText(sectionUrl(section)), "Google News", "google-news");
}

export async function googleSearch(query: string, when?: string): Promise<RawArticle[]> {
  return parseFeed(await fetchText(searchUrl(query, when)), "Google News", "google-news");
}
