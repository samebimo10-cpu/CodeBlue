import { z } from "zod";
import { aiEnabled, FAST_MODEL, structured } from "./ai";
import { audit, db, nowIso, parseJson } from "./db";
import { storyFeed, type StoryCard } from "./queries";
import { TOPICS, type TopicId } from "./topics";

/**
 * The daily news coverage: for each standard topic, a short sourced roundup of
 * the day's biggest stories, built from the clustered story feed.
 */

export interface DigestItem {
  storyId: number;
  headline: string;
  summary: string;
  whyItMatters: string;
}

export interface Digest {
  topic: TopicId;
  date: string;
  overview: string;
  items: DigestItem[];
  model: string | null;
  generatedAt: string;
}

const DigestSchema = z.object({
  overview: z.string().describe("2-3 sentences: the shape of the day in this topic."),
  items: z.array(
    z.object({
      storyId: z.number().int(),
      headline: z.string().describe("Rewritten headline, plain and accurate."),
      summary: z.string().describe("1-2 sentences, facts only, from the supplied text."),
      whyItMatters: z.string().describe("One sentence of context, from the supplied text only."),
    }),
  ),
});

const DIGEST_SYSTEM = `You write Code Blue's daily news coverage. You receive today's top story clusters for one topic, each with an id, its source count and headlines from several outlets.
- Pick up to 8 of the most significant stories, most important first; use the given story ids.
- Use only the supplied headlines and summaries. No outside facts.
- If a story has only one source, say "according to <outlet>" or "reports say".
- Neutral, compact, newsroom style. No opinions.`;

export const today = () => nowIso().slice(0, 10);

function storyBrief(card: StoryCard): string {
  const conn = db();
  const lines = conn
    .prepare(
      `SELECT a.title, a.summary, s.name FROM articles a LEFT JOIN sources s ON s.id = a.source_id
        WHERE a.story_id = ? ORDER BY s.credibility DESC LIMIT 4`,
    )
    .all(card.id) as { title: string; summary: string; name: string }[];
  return `<story id="${card.id}" sources="${card.source_count}" status="${card.status}">\n${lines
    .map((l) => `- ${l.name}: ${l.title}${l.summary ? ` — ${l.summary.slice(0, 280)}` : ""}`)
    .join("\n")}\n</story>`;
}

export async function buildDigest(topic: TopicId, date = today()): Promise<Digest> {
  const cards = storyFeed({ topic, hours: 30, limit: 15 });
  let digest: Digest;
  if (cards.length === 0) {
    digest = { topic, date, overview: "No stories collected yet for this topic today.", items: [], model: null, generatedAt: nowIso() };
  } else if (aiEnabled()) {
    const res = await structured({
      schema: DigestSchema,
      system: DIGEST_SYSTEM,
      prompt: `Topic: ${TOPICS.find((t) => t.id === topic)?.label}\nDate: ${date}\n\n${cards.map(storyBrief).join("\n\n")}`,
      model: FAST_MODEL,
      effort: "low",
      maxTokens: 8000,
    });
    const known = new Set(cards.map((c) => c.id));
    digest = {
      topic,
      date,
      overview: res.overview,
      items: res.items.filter((i) => known.has(i.storyId)),
      model: FAST_MODEL,
      generatedAt: nowIso(),
    };
  } else {
    digest = {
      topic,
      date,
      overview: `${cards.length} developing and confirmed stories collected from ${new Set(cards.flatMap((c) => c.sources)).size} outlets.`,
      items: cards.slice(0, 8).map((c) => ({
        storyId: c.id,
        headline: c.headline,
        summary: c.lead.summary ? c.lead.summary.slice(0, 280) : `Reported by ${c.sources.slice(0, 3).join(", ")}.`,
        whyItMatters: `${c.source_count} source${c.source_count === 1 ? "" : "s"}; ${c.status}.`,
      })),
      model: null,
      generatedAt: nowIso(),
    };
  }
  db()
    .prepare(
      `INSERT INTO digests (date, topic, body, story_ids, model, generated_at) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(date, topic) DO UPDATE SET body = excluded.body, story_ids = excluded.story_ids, model = excluded.model, generated_at = excluded.generated_at`,
    )
    .run(date, topic, JSON.stringify(digest), JSON.stringify(digest.items.map((i) => i.storyId)), digest.model, digest.generatedAt);
  return digest;
}

export async function buildAllDigests(date = today()) {
  const out: Record<string, number> = {};
  for (const t of TOPICS) {
    try {
      out[t.id] = (await buildDigest(t.id, date)).items.length;
    } catch (e) {
      audit("digest.error", { topic: t.id, error: (e as Error).message });
    }
  }
  return out;
}

export function getDigest(topic: TopicId, date = today()): Digest | null {
  const row = db().prepare("SELECT body FROM digests WHERE topic = ? AND date = ?").get(topic, date) as { body: string } | undefined;
  return row ? parseJson<Digest | null>(row.body, null) : null;
}

export function digestDates(limit = 14): string[] {
  return (db().prepare("SELECT DISTINCT date FROM digests ORDER BY date DESC LIMIT ?").all(limit) as { date: string }[]).map((r) => r.date);
}
