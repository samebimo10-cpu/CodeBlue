import { db, nowIso } from "./db";
import { extractEntities, headlineSimilarity, sensitivityFlags, tokenSet } from "./text";
import type { ArticleRow, StoryRow } from "./types";

/** Two headlines at or above this similarity are treated as the same event. */
export const SAME_STORY = 0.42;
/** Stories stop accepting new articles after this long without updates. */
const OPEN_WINDOW_HOURS = 48;

const hoursBetween = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 3_600_000;

/**
 * Trend score from the spec: source count, velocity (new sources per hour),
 * recency decay and source credibility. Social signals plug in via `social`.
 */
export function trendScore(input: {
  sourceCount: number;
  articlesLast3h: number;
  hoursSinceLastSeen: number;
  avgCredibility: number;
  social?: number;
}): number {
  const breadth = Math.log2(1 + input.sourceCount) * 2;
  const velocity = Math.min(input.articlesLast3h, 12) * 0.4;
  const decay = Math.exp(-input.hoursSinceLastSeen / 18);
  const social = Math.log2(1 + (input.social ?? 0));
  return Math.round((breadth + velocity + social + 1) * (0.5 + input.avgCredibility) * decay * 100) / 10;
}

export function recomputeStory(storyId: number) {
  const conn = db();
  const rows = conn
    .prepare(
      `SELECT a.title, a.summary, a.published_at, s.domain, s.credibility
         FROM articles a LEFT JOIN sources s ON s.id = a.source_id WHERE a.story_id = ?`,
    )
    .all(storyId) as { title: string; summary: string; published_at: string; domain: string | null; credibility: number | null }[];
  if (rows.length === 0) return;
  const domains = new Map<string, number>();
  for (const r of rows) if (r.domain) domains.set(r.domain, r.credibility ?? 0.55);
  const sourceCount = domains.size || 1;
  const avgCred = [...domains.values()].reduce((a, b) => a + b, 0) / (domains.size || 1) || 0.55;
  const now = nowIso();
  const lastSeen = rows.map((r) => r.published_at).sort().at(-1)!;
  const firstSeen = rows.map((r) => r.published_at).sort()[0];
  const recent = rows.filter((r) => hoursBetween(r.published_at, now) <= 3).length;
  const text = rows.map((r) => `${r.title}. ${r.summary}`).join(" ");
  // The headline is the title of the article from the most credible source.
  const best = [...rows].sort((a, b) => (b.credibility ?? 0.55) - (a.credibility ?? 0.55))[0];
  const score = trendScore({
    sourceCount,
    articlesLast3h: recent,
    hoursSinceLastSeen: hoursBetween(lastSeen, now),
    avgCredibility: avgCred,
  });
  conn
    .prepare(
      `UPDATE stories SET headline = ?, source_count = ?, article_count = ?, first_seen = ?, last_seen = ?,
         trend_score = ?, status = ?, entities = ?, sensitivity = ? WHERE id = ?`,
    )
    .run(
      best.title,
      sourceCount,
      rows.length,
      firstSeen,
      lastSeen,
      score,
      sourceCount >= 2 ? "confirmed" : "developing",
      JSON.stringify(extractEntities(rows.map((r) => r.title).join(". "))),
      JSON.stringify(sensitivityFlags(text)),
      storyId,
    );
}

/**
 * Attach an article to the open story it best matches within its topic,
 * or start a new story. Returns the story id.
 */
export function assignToStory(article: Pick<ArticleRow, "id" | "title" | "summary" | "topic" | "published_at">): number {
  const conn = db();
  const topic = article.topic ?? "general";
  const tokens = tokenSet(article.title);
  const cutoff = new Date(Date.now() - OPEN_WINDOW_HOURS * 3_600_000).toISOString();
  const candidates = conn
    .prepare("SELECT id, tokens FROM stories WHERE topic = ? AND last_seen >= ?")
    .all(topic, cutoff) as Pick<StoryRow, "id" | "tokens">[];

  let bestId: number | null = null;
  let bestSim = 0;
  for (const c of candidates) {
    const sim = headlineSimilarity(tokens, new Set(c.tokens.split(" ").filter(Boolean)));
    if (sim > bestSim) {
      bestSim = sim;
      bestId = c.id;
    }
  }

  let storyId: number;
  if (bestId !== null && bestSim >= SAME_STORY) {
    storyId = bestId;
    // Keep the story's token set anchored on its first headlines; add a few new ones.
    const existing = candidates.find((c) => c.id === bestId)!.tokens.split(" ").filter(Boolean);
    const merged = [...new Set([...existing, ...tokens])].slice(0, 40);
    conn.prepare("UPDATE stories SET tokens = ? WHERE id = ?").run(merged.join(" "), storyId);
  } else {
    const info = conn
      .prepare(
        "INSERT INTO stories (headline, topic, tokens, first_seen, last_seen) VALUES (?, ?, ?, ?, ?)",
      )
      .run(article.title, topic, [...tokens].join(" "), article.published_at, article.published_at);
    storyId = Number(info.lastInsertRowid);
  }
  conn.prepare("UPDATE articles SET story_id = ? WHERE id = ?").run(storyId, article.id);
  return storyId;
}

/** In-memory grouping for ad-hoc article sets (e.g. a subject's search results). */
export function groupArticles<T extends { title: string; domain?: string | null }>(articles: T[]): T[][] {
  const groups: { tokens: Set<string>; items: T[] }[] = [];
  for (const a of articles) {
    const t = tokenSet(a.title);
    let target: (typeof groups)[number] | undefined;
    let bestSim = 0;
    for (const g of groups) {
      const sim = headlineSimilarity(t, g.tokens);
      if (sim > bestSim) {
        bestSim = sim;
        target = g;
      }
    }
    if (target && bestSim >= SAME_STORY) {
      target.items.push(a);
      for (const tok of t) if (target.tokens.size < 40) target.tokens.add(tok);
    } else {
      groups.push({ tokens: t, items: [a] });
    }
  }
  return groups.map((g) => g.items);
}
