import { groupArticles } from "./cluster";
import { db, parseJson } from "./db";
import { getSettings } from "./settings";
import { tokenSet } from "./text";
import type { ArticleRow, StoryRow, SubjectRow, TargetKind } from "./types";

const ARTICLE_COLS = `a.*, s.name AS source_name, s.domain AS domain, s.credibility AS credibility`;

export interface StoryCard extends StoryRow {
  fit: number;
  rank: number;
  heat: "hot" | "warm" | "mild";
  lead: ArticleRow;
  sources: string[];
}

function heatOf(score: number): StoryCard["heat"] {
  if (score >= 25) return "hot";
  if (score >= 14) return "warm";
  return "mild";
}

/** Personal fit: keyword matches lift a story, blocked keywords hide it. */
function fitScore(story: StoryRow, keywords: string[]): number {
  if (keywords.length === 0) return 0;
  const tokens = new Set(story.tokens.split(" "));
  const hay = story.headline.toLowerCase();
  let fit = 0;
  for (const k of keywords) {
    const kt = [...tokenSet(k)];
    if (hay.includes(k.toLowerCase()) || (kt.length > 0 && kt.every((t) => tokens.has(t)))) fit += 1;
  }
  return fit;
}

export function storyFeed(opts: { topic?: string; hours?: number; limit?: number } = {}): StoryCard[] {
  const conn = db();
  const settings = getSettings();
  const cutoff = new Date(Date.now() - (opts.hours ?? 36) * 3_600_000).toISOString();
  const stories = (
    opts.topic
      ? conn.prepare("SELECT * FROM stories WHERE topic = ? AND last_seen >= ? ORDER BY trend_score DESC LIMIT 300").all(opts.topic, cutoff)
      : conn.prepare("SELECT * FROM stories WHERE last_seen >= ? ORDER BY trend_score DESC LIMIT 600").all(cutoff)
  ) as StoryRow[];
  const blocked = settings.blockedKeywords.map((k) => k.toLowerCase()).filter(Boolean);
  const leadStmt = conn.prepare(
    `SELECT ${ARTICLE_COLS} FROM articles a LEFT JOIN sources s ON s.id = a.source_id
      WHERE a.story_id = ? ORDER BY (a.image_url IS NOT NULL) DESC, s.credibility DESC, a.published_at ASC LIMIT 1`,
  );
  const srcStmt = conn.prepare(
    `SELECT DISTINCT s.name FROM articles a JOIN sources s ON s.id = a.source_id WHERE a.story_id = ? ORDER BY s.credibility DESC LIMIT 6`,
  );
  return stories
    .filter((s) => !blocked.some((k) => s.headline.toLowerCase().includes(k)))
    .map((s) => {
      const fit = fitScore(s, settings.keywords);
      return {
        ...s,
        fit,
        rank: s.trend_score * (1 + 0.5 * fit),
        heat: heatOf(s.trend_score),
        lead: leadStmt.get(s.id) as ArticleRow,
        sources: (srcStmt.all(s.id) as { name: string }[]).map((r) => r.name),
      };
    })
    .filter((s) => s.lead)
    .sort((a, b) => b.rank - a.rank)
    .slice(0, opts.limit ?? 40);
}

export function getStory(id: number) {
  const conn = db();
  const story = conn.prepare("SELECT * FROM stories WHERE id = ?").get(id) as StoryRow | undefined;
  if (!story) return null;
  const articles = conn
    .prepare(
      `SELECT ${ARTICLE_COLS} FROM articles a LEFT JOIN sources s ON s.id = a.source_id
        WHERE a.story_id = ? ORDER BY a.published_at ASC`,
    )
    .all(id) as ArticleRow[];
  return {
    story,
    articles,
    entities: parseJson<string[]>(story.entities, []),
    sensitivity: parseJson<string[]>(story.sensitivity, []),
  };
}

export function listSubjects(): (SubjectRow & { article_count: number; latest: string | null })[] {
  return db()
    .prepare(
      `SELECT sub.*, COUNT(sa.article_id) AS article_count, MAX(a.published_at) AS latest
         FROM subjects sub
         LEFT JOIN subject_articles sa ON sa.subject_id = sub.id
         LEFT JOIN articles a ON a.id = sa.article_id
        GROUP BY sub.id ORDER BY sub.created_at DESC`,
    )
    .all() as (SubjectRow & { article_count: number; latest: string | null })[];
}

export function getSubject(id: number) {
  const conn = db();
  const subject = conn.prepare("SELECT * FROM subjects WHERE id = ?").get(id) as SubjectRow | undefined;
  if (!subject) return null;
  const articles = conn
    .prepare(
      `SELECT ${ARTICLE_COLS} FROM subject_articles sa
         JOIN articles a ON a.id = sa.article_id
         LEFT JOIN sources s ON s.id = a.source_id
        WHERE sa.subject_id = ? ORDER BY a.published_at DESC`,
    )
    .all(id) as ArticleRow[];
  return {
    subject,
    articles,
    groups: groupArticles(articles),
    background: parseJson<{ title: string; url: string; description: string; extract: string; thumbnail?: string | null } | null>(
      subject.background,
      null,
    ),
    volume: parseJson<{ date: string; value: number }[]>(subject.volume, []),
  };
}

/**
 * The article set the AI works from. For a subject, balance fresh coverage
 * with the archive so briefings carry history, and favour credible sources.
 */
export function corpusFor(kind: TargetKind, id: number, max = 80): ArticleRow[] {
  if (kind === "story") return (getStory(id)?.articles ?? []).slice(-max);
  const data = getSubject(id);
  if (!data) return [];
  // One representative per event cluster, best source first.
  const reps = data.groups.map(
    (g) => [...g].sort((a, b) => (b.credibility ?? 0) - (a.credibility ?? 0) || b.summary.length - a.summary.length)[0],
  );
  const byDate = [...reps].sort((a, b) => b.published_at.localeCompare(a.published_at));
  const recent = byDate.slice(0, Math.ceil(max * 0.65));
  const older = byDate.slice(Math.ceil(max * 0.65));
  // Spread the remaining budget evenly across the archive.
  const budget = max - recent.length;
  const step = older.length > budget ? older.length / budget : 1;
  const archive: ArticleRow[] = [];
  for (let i = 0; i < older.length && archive.length < budget; i += step) archive.push(older[Math.floor(i)]);
  return [...recent, ...archive];
}

export function targetTitle(kind: TargetKind, id: number): string | null {
  if (kind === "story") return getStory(id)?.story.headline ?? null;
  const row = db().prepare("SELECT name FROM subjects WHERE id = ?").get(id) as { name: string } | undefined;
  return row?.name ?? null;
}

export function targetSensitivity(kind: TargetKind, id: number): string[] {
  if (kind === "story") return getStory(id)?.sensitivity ?? [];
  return [];
}
