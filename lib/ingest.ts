import { assignToStory, recomputeStory } from "./cluster";
import { audit, db, nowIso } from "./db";
import { domainOf } from "./http";
import { getSettings } from "./settings";
import { gdeltArticles, gdeltVolume } from "./sources/gdelt";
import { googleSearch, googleSection } from "./sources/googleNews";
import { guardianSearch } from "./sources/guardian";
import { newsdataSearch } from "./sources/newsdata";
import { fetchFeed } from "./sources/rss";
import { wikipediaBackground } from "./sources/wikipedia";
import { credibilityFor, TOPICS, type Topic, type TopicId } from "./topics";
import type { RawArticle, SubjectRow } from "./types";

/** Topic feeds only keep items newer than this. */
const TOPIC_WINDOW_HOURS = 72;

export interface IngestReport {
  fetched: number;
  inserted: number;
  errors: string[];
}

function upsertSource(name: string, domain: string, feedUrl?: string, type = "rss"): number {
  const conn = db();
  const existing = conn.prepare("SELECT id FROM sources WHERE domain = ?").get(domain) as { id: number } | undefined;
  if (existing) return existing.id;
  const info = conn
    .prepare("INSERT INTO sources (name, domain, feed_url, type, credibility) VALUES (?, ?, ?, ?, ?)")
    .run(name, domain, feedUrl ?? null, type, credibilityFor(domain));
  return Number(info.lastInsertRowid);
}

/**
 * Store articles, skipping blocked sources and duplicates (by URL, and by
 * same title from the same domain). Returns ids of every stored-or-existing
 * article, plus which ones are new.
 */
export function storeArticles(raw: RawArticle[], topic: string | null): { ids: number[]; newIds: number[] } {
  const conn = db();
  const settings = getSettings();
  const blocked = new Set(settings.blockedSources.map((d) => d.replace(/^www\./, "").toLowerCase()));
  const findByUrl = conn.prepare("SELECT id FROM articles WHERE url = ?");
  const findByTitle = conn.prepare(
    "SELECT a.id FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.title = ? AND s.domain = ? LIMIT 1",
  );
  const insert = conn.prepare(
    `INSERT INTO articles (source_id, url, title, author, published_at, summary, image_url, language, topic, origin, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const ids: number[] = [];
  const newIds: number[] = [];
  const tx = conn.transaction((items: RawArticle[]) => {
    for (const a of items) {
      const domain = (a.sourceDomain || domainOf(a.url)).toLowerCase();
      if (!a.url || !a.title || blocked.has(domain)) continue;
      const hit = (findByUrl.get(a.url) ?? findByTitle.get(a.title, domain)) as { id: number } | undefined;
      if (hit) {
        ids.push(hit.id);
        continue;
      }
      const sourceId = upsertSource(a.sourceName || domain, domain, undefined, a.origin);
      const info = insert.run(
        sourceId,
        a.url,
        a.title,
        a.author ?? null,
        a.publishedAt,
        a.summary ?? "",
        a.imageUrl ?? null,
        a.language ?? "en",
        topic,
        a.origin,
        nowIso(),
      );
      const id = Number(info.lastInsertRowid);
      ids.push(id);
      newIds.push(id);
    }
  });
  tx(raw);
  return { ids, newIds };
}

async function settle<T>(label: string, p: Promise<T>, errors: string[]): Promise<T | null> {
  try {
    return await p;
  } catch (e) {
    errors.push(`${label}: ${(e as Error).message}`);
    return null;
  }
}

function feedsFor(topic: Topic, tier: "fast" | "slow" | "all") {
  const custom = getSettings()
    .customFeeds.filter((f) => f.topic === topic.id)
    .map((f) => ({ ...f, tier: "slow" as const }));
  // The long-tail ("slow") pass re-polls everything; the fast pass only top sources.
  return [...topic.feeds, ...custom].filter((f) => tier !== "fast" || f.tier === "fast");
}

/** Pull one topic's feeds, store new articles and cluster them into stories. */
export async function ingestTopic(topic: Topic, tier: "fast" | "slow" | "all" = "all"): Promise<IngestReport> {
  const errors: string[] = [];
  const jobs: Promise<RawArticle[] | null>[] = feedsFor(topic, tier).map((f) => settle(f.name, fetchFeed(f.url, f.name), errors));
  if (topic.googleSection) jobs.push(settle("Google News", googleSection(topic.googleSection), errors));
  if (topic.googleQuery) jobs.push(settle("Google News", googleSearch(topic.googleQuery, "1d"), errors));
  const results = (await Promise.all(jobs)).flatMap((r) => r ?? []);

  const cutoff = Date.now() - TOPIC_WINDOW_HOURS * 3_600_000;
  const fresh = results.filter((a) => Date.parse(a.publishedAt) >= cutoff);
  const { newIds } = storeArticles(fresh, topic.id);

  const conn = db();
  const get = conn.prepare("SELECT id, title, summary, topic, published_at FROM articles WHERE id = ?");
  const touched = new Set<number>();
  // Oldest first, so stories form around the earliest report.
  const rows = newIds
    .map((id) => get.get(id) as { id: number; title: string; summary: string; topic: string; published_at: string })
    .sort((a, b) => a.published_at.localeCompare(b.published_at));
  for (const row of rows) touched.add(assignToStory(row));
  for (const id of touched) recomputeStory(id);

  audit("ingest.topic", { topic: topic.id, tier, fetched: results.length, inserted: newIds.length, errors: errors.length });
  return { fetched: results.length, inserted: newIds.length, errors };
}

export async function ingestAllTopics(tier: "fast" | "slow" | "all" = "all", only?: TopicId[]): Promise<Record<string, IngestReport>> {
  const report: Record<string, IngestReport> = {};
  for (const topic of TOPICS) {
    if (only && !only.includes(topic.id)) continue;
    report[topic.id] = await ingestTopic(topic, tier);
  }
  rescoreRecentStories();
  return report;
}

/** Recency decay changes scores even without new articles. */
export function rescoreRecentStories() {
  const cutoff = new Date(Date.now() - 96 * 3_600_000).toISOString();
  const ids = db().prepare("SELECT id FROM stories WHERE last_seen >= ?").all(cutoff) as { id: number }[];
  for (const { id } of ids) recomputeStory(id);
}

/**
 * Research a subject across every available source: current coverage
 * (Google News, NewsData), the last ~3 months (GDELT), the archive (Guardian,
 * back to 1999) and long-run background (Wikipedia).
 */
export async function ingestSubject(subjectId: number): Promise<IngestReport> {
  const conn = db();
  const subject = conn.prepare("SELECT * FROM subjects WHERE id = ?").get(subjectId) as SubjectRow | undefined;
  if (!subject) throw new Error(`Subject ${subjectId} not found`);
  const q = subject.query;
  const errors: string[] = [];

  const [latest, week, allTime, gdelt, guardianNew, guardianArchive, newsdata, background, volume] = await Promise.all([
    settle("Google News (24h)", googleSearch(q, "1d"), errors),
    settle("Google News (7d)", googleSearch(q, "7d"), errors),
    settle("Google News (all)", googleSearch(q), errors),
    settle("GDELT", gdeltArticles(q, "3months", 250), errors),
    settle("Guardian (newest)", guardianSearch(q, "newest", 50), errors),
    settle("Guardian (archive)", guardianSearch(q, "relevance", 50), errors),
    settle("NewsData", newsdataSearch(q), errors),
    settle("Wikipedia", wikipediaBackground(q), errors),
    settle("GDELT volume", gdeltVolume(q, "3months"), errors),
  ]);

  const all = [latest, week, allTime, gdelt, guardianNew, guardianArchive, newsdata].flatMap((r) => r ?? []);
  const { ids, newIds } = storeArticles(all, null);
  const link = conn.prepare("INSERT OR IGNORE INTO subject_articles (subject_id, article_id) VALUES (?, ?)");
  conn.transaction(() => ids.forEach((id) => link.run(subjectId, id)))();

  conn
    .prepare(
      "UPDATE subjects SET last_refreshed = ?, background = COALESCE(?, background), volume = COALESCE(?, volume) WHERE id = ?",
    )
    .run(nowIso(), background ? JSON.stringify(background) : null, volume?.length ? JSON.stringify(volume) : null, subjectId);

  audit("ingest.subject", { subjectId, query: q, fetched: all.length, inserted: newIds.length, errors });
  return { fetched: all.length, inserted: newIds.length, errors };
}

export function createSubject(name: string, query?: string, notes = ""): number {
  const info = db()
    .prepare("INSERT INTO subjects (name, query, notes, created_at) VALUES (?, ?, ?, ?)")
    .run(name.trim(), (query ?? name).trim(), notes, nowIso());
  return Number(info.lastInsertRowid);
}

export async function refreshDailySubjects(): Promise<Record<number, IngestReport>> {
  const subjects = db().prepare("SELECT id FROM subjects WHERE daily = 1").all() as { id: number }[];
  const out: Record<number, IngestReport> = {};
  for (const s of subjects) out[s.id] = await ingestSubject(s.id);
  return out;
}
