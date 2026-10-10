import { z } from "zod";
import { aiEnabled, articleText, formatCorpus, locateSupport, MODEL, structured } from "./ai";
import { db, nowIso, parseJson } from "./db";
import { corpusFor, getSubject, targetTitle } from "./queries";
import { extractEntities, splitSentences, truncate } from "./text";
import type { ArticleRow, Briefing, Depth, Fact, TargetKind } from "./types";

// ---------------------------------------------------------------------------
// Schemas
// ---------------------------------------------------------------------------

const FactSchema = z.object({
  claim: z.string().describe("One factual statement, in your own words."),
  value: z.string().describe("The key number, name or date the claim hinges on; empty string if none."),
  articleId: z.number().int().describe("The numeric id from the [A123] tag of the supporting article."),
  sourceText: z.string().describe("A verbatim snippet (5-25 words) copied from that article's title or summary."),
});

const FactSheetSchema = z.object({ facts: z.array(FactSchema) });

const BriefingSchema = z.object({
  bottomLine: z.string(),
  keyFacts: z.array(FactSchema),
  timeline: z.array(
    z.object({
      date: z.string().describe("YYYY-MM-DD, YYYY-MM or YYYY"),
      event: z.string(),
      articleId: z.number().int().describe("Supporting article id, or 0 if from the background reference."),
    }),
  ),
  whosInvolved: z.array(z.object({ name: z.string(), role: z.string(), position: z.string() })),
  coverage: z.object({ agreement: z.string(), framingDifferences: z.string(), disputed: z.string() }),
  numbersAndContext: z.array(z.string()),
  publicReaction: z.string(),
  whatToWatch: z.array(z.string()),
  gaps: z.array(z.string()),
  relatedQueries: z.array(z.string()),
});

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

const BRIEFING_SYSTEM = `You are the research desk of Code Blue, a newsroom tool that prepares writers to publish their own take on the news.

You receive a set of news articles, each tagged [A<id>] with its outlet and date, and sometimes an encyclopedia background reference. Build a Story Briefing that a writer can trust and cite.

Ground rules (these are hard requirements):
- Use only the supplied material. Never add facts, numbers, names, dates or quotes from memory. If something is not in the material, it does not go in the briefing; say what is unknown under "gaps" instead.
- Every key fact cites exactly one article by its numeric id and includes a short verbatim snippet copied from that article's title or summary.
- Write in your own words. Do not copy article sentences except inside sourceText.
- Separate what is confirmed by several outlets from what only one outlet reports; mark single-source claims as such ("according to <outlet>").
- Stay neutral. Report positions as positions held by the people involved. You never offer an opinion.
- "gaps" lists questions no outlet has answered yet. These often make the best angle for an original take.
- "relatedQueries" suggests 3-5 search phrases for adjacent subjects worth following.
- "publicReaction": summarise reaction only as reported in the articles; if none is reported, say so.
- Timeline entries run oldest to newest and may draw on the background reference (articleId 0) for history.`;

const DEPTH_GUIDE: Record<Depth, string> = {
  quick: "Depth: QUICK (about a one-minute read). Bottom line of 2-3 sentences, 4-6 key facts, up to 5 timeline entries, short sections, 2-3 items in list sections.",
  standard: "Depth: STANDARD. Bottom line of one solid paragraph, 8-12 key facts, up to 12 timeline entries, each section filled where the material allows.",
  deep: "Depth: DEEP DIVE. Bottom line of one rich paragraph, 15-25 key facts, a full timeline including the long-run history from the background reference, detailed coverage analysis by outlet and region, and thorough numbers and context.",
};

const FACTSHEET_SYSTEM = `You build fact sheets for Code Blue's writing engine. From the supplied articles (tagged [A<id>]), extract the verifiable facts a social post could use: who, what, when, where, numbers and short quotes.
- Use only the supplied text. No outside knowledge.
- Each fact cites one article id and copies a short verbatim snippet from that article's title or summary as sourceText.
- Prefer facts confirmed by more than one outlet; include single-source facts but say "according to <outlet>" in the claim.
- 6-15 facts, most important first.`;

// ---------------------------------------------------------------------------
// Grounding
// ---------------------------------------------------------------------------

/** Drop any fact whose cited article does not actually support it. */
export function groundFacts(raw: z.infer<typeof FactSchema>[], corpus: ArticleRow[]): Fact[] {
  const byId = new Map(corpus.map((a) => [a.id, a]));
  const out: Fact[] = [];
  raw.forEach((f, i) => {
    const article = byId.get(f.articleId);
    if (!article) return;
    const support = locateSupport(f.sourceText, article) ?? locateSupport(f.claim, article);
    if (!support) return;
    out.push({ id: `F${i + 1}`, claim: f.claim, value: f.value || undefined, articleId: article.id, sourceText: support });
  });
  return out;
}

// ---------------------------------------------------------------------------
// Extractive fallbacks (no API key): still useful, still sourced
// ---------------------------------------------------------------------------

function extractiveFacts(corpus: ArticleRow[], max: number): Fact[] {
  const seenDomains = new Set<string>();
  const facts: Fact[] = [];
  for (const a of [...corpus].sort((x, y) => (y.credibility ?? 0) - (x.credibility ?? 0))) {
    if (facts.length >= max) break;
    const key = a.domain ?? a.source_name ?? String(a.id);
    if (seenDomains.has(key) && facts.length < corpus.length / 2) continue;
    seenDomains.add(key);
    const sentence = splitSentences(a.summary)[0] ?? a.title;
    facts.push({
      id: `F${facts.length + 1}`,
      claim: `${truncate(sentence, 240)} (${a.source_name ?? a.domain})`,
      articleId: a.id,
      sourceText: sentence,
    });
  }
  return facts;
}

function extractiveBriefing(title: string, corpus: ArticleRow[], depth: Depth, background?: string | null): Briefing {
  const n = depth === "quick" ? 5 : depth === "standard" ? 10 : 20;
  const sorted = [...corpus].sort((a, b) => a.published_at.localeCompare(b.published_at));
  const byDay = new Map<string, ArticleRow>();
  for (const a of sorted) {
    const day = a.published_at.slice(0, 10);
    if (!byDay.has(day) || (a.credibility ?? 0) > (byDay.get(day)!.credibility ?? 0)) byDay.set(day, a);
  }
  const outlets = [...new Set(corpus.map((a) => a.source_name).filter(Boolean))];
  const latest = [...corpus].sort((a, b) => b.published_at.localeCompare(a.published_at))[0];
  return {
    bottomLine: latest
      ? `Latest on ${title}: ${latest.title} (${latest.source_name}, ${latest.published_at.slice(0, 10)}).${
          background ? ` Background: ${truncate(background, 400)}` : ""
        }`
      : `No coverage found yet for ${title}.`,
    keyFacts: extractiveFacts(corpus, n),
    timeline: [...byDay.entries()].slice(-n).map(([date, a]) => ({ date, event: `${a.title} (${a.source_name})`, articleId: a.id })),
    whosInvolved: extractEntities(corpus.map((a) => a.title).join(". "), 8).map((name) => ({
      name,
      role: "Named in coverage",
      position: "Not analysed (AI disabled)",
    })),
    coverage: {
      agreement: `${corpus.length} articles from ${outlets.length} outlets: ${outlets.slice(0, 10).join(", ")}.`,
      framingDifferences: "Add an Anthropic API key to compare framing across outlets.",
      disputed: "Not analysed (AI disabled).",
    },
    numbersAndContext: [],
    publicReaction: "Not analysed (AI disabled).",
    whatToWatch: [],
    gaps: ["Set ANTHROPIC_API_KEY to generate a full AI briefing with gaps, framing and what to watch."],
    relatedQueries: [],
  };
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface StoredBriefing {
  id: number;
  depth: Depth;
  briefing: Briefing;
  articleIds: number[];
  model: string | null;
  generatedAt: string;
}

export function latestBriefing(kind: TargetKind, id: number, depth?: Depth): StoredBriefing | null {
  const row = (
    depth
      ? db()
          .prepare("SELECT * FROM briefings WHERE target_kind = ? AND target_id = ? AND depth = ? ORDER BY id DESC LIMIT 1")
          .get(kind, id, depth)
      : db().prepare("SELECT * FROM briefings WHERE target_kind = ? AND target_id = ? ORDER BY id DESC LIMIT 1").get(kind, id)
  ) as { id: number; depth: Depth; sections: string; article_ids: string; model: string | null; generated_at: string } | undefined;
  if (!row) return null;
  return {
    id: row.id,
    depth: row.depth,
    briefing: JSON.parse(row.sections) as Briefing,
    articleIds: parseJson<number[]>(row.article_ids, []),
    model: row.model,
    generatedAt: row.generated_at,
  };
}

export async function generateBriefing(kind: TargetKind, id: number, depth: Depth, fresh = false): Promise<StoredBriefing> {
  const title = targetTitle(kind, id);
  if (!title) throw new Error("Not found");
  const max = depth === "quick" ? 40 : depth === "standard" ? 80 : 140;
  const corpus = corpusFor(kind, id, max);
  if (corpus.length === 0) throw new Error("No articles yet. Refresh the subject first.");
  const background = kind === "subject" ? getSubject(id)?.background : null;

  let briefing: Briefing;
  let model: string | null = null;
  if (aiEnabled()) {
    const prompt = [
      `Subject: ${title}`,
      `Today: ${nowIso().slice(0, 10)}`,
      DEPTH_GUIDE[depth],
      background ? `Background reference (Wikipedia: ${background.title}, cite as articleId 0):\n${background.extract.slice(0, depth === "deep" ? 12000 : 5000)}` : "",
      `Articles (${corpus.length}):\n\n${formatCorpus(corpus)}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const raw = await structured({
      schema: BriefingSchema,
      system: BRIEFING_SYSTEM,
      prompt,
      effort: depth === "deep" ? "high" : "medium",
      maxTokens: depth === "deep" ? 32000 : 16000,
      cache: !fresh,
    });
    const known = new Set(corpus.map((a) => a.id));
    briefing = {
      ...raw,
      keyFacts: groundFacts(raw.keyFacts, corpus),
      timeline: raw.timeline
        .filter((t) => t.articleId === 0 || known.has(t.articleId))
        .map((t) => ({ ...t, articleId: t.articleId || undefined })),
    };
    model = MODEL;
  } else {
    briefing = extractiveBriefing(title, corpus, depth, background?.extract);
  }

  const conn = db();
  const info = conn
    .prepare("INSERT INTO briefings (target_kind, target_id, depth, sections, article_ids, model, generated_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
    .run(kind, id, depth, JSON.stringify(briefing), JSON.stringify(corpus.map((a) => a.id)), model, nowIso());
  // The briefing's key facts double as the fact sheet for drafts.
  saveFactSheet(kind, id, briefing.keyFacts, corpus, model);
  return {
    id: Number(info.lastInsertRowid),
    depth,
    briefing,
    articleIds: corpus.map((a) => a.id),
    model,
    generatedAt: nowIso(),
  };
}

function saveFactSheet(kind: TargetKind, id: number, facts: Fact[], corpus: ArticleRow[], model: string | null) {
  db()
    .prepare("INSERT INTO fact_sheets (target_kind, target_id, facts, article_ids, model, generated_at) VALUES (?, ?, ?, ?, ?, ?)")
    .run(kind, id, JSON.stringify(facts), JSON.stringify(corpus.map((a) => a.id)), model, nowIso());
}

export function latestFactSheet(kind: TargetKind, id: number): { facts: Fact[]; articleIds: number[]; generatedAt: string } | null {
  const row = db()
    .prepare("SELECT * FROM fact_sheets WHERE target_kind = ? AND target_id = ? ORDER BY id DESC LIMIT 1")
    .get(kind, id) as { facts: string; article_ids: string; generated_at: string } | undefined;
  if (!row) return null;
  return { facts: parseJson<Fact[]>(row.facts, []), articleIds: parseJson<number[]>(row.article_ids, []), generatedAt: row.generated_at };
}

/**
 * Fact sheet for drafting: reuse a recent one (from a briefing or a previous
 * draft run) unless new articles arrived since, else build one.
 */
export async function getOrBuildFactSheet(kind: TargetKind, id: number): Promise<{ facts: Fact[]; corpus: ArticleRow[] }> {
  const corpus = corpusFor(kind, id, 40);
  if (corpus.length === 0) throw new Error("No articles yet.");
  const existing = latestFactSheet(kind, id);
  const newest = corpus.map((a) => a.published_at).sort().at(-1)!;
  if (existing && existing.facts.length > 0 && existing.generatedAt >= newest) {
    const ids = new Set(existing.articleIds);
    const all = corpusFor(kind, id, 140).filter((a) => ids.has(a.id));
    return { facts: existing.facts, corpus: all.length ? all : corpus };
  }
  let facts: Fact[];
  let model: string | null = null;
  if (aiEnabled()) {
    const raw = await structured({
      schema: FactSheetSchema,
      system: FACTSHEET_SYSTEM,
      prompt: `Subject: ${targetTitle(kind, id)}\n\nArticles:\n\n${formatCorpus(corpus)}`,
      effort: "low",
    });
    facts = groundFacts(raw.facts, corpus);
    model = MODEL;
  } else {
    facts = extractiveFacts(corpus, 8);
  }
  saveFactSheet(kind, id, facts, corpus, model);
  return { facts, corpus };
}

export function factSheetText(facts: Fact[], corpus: ArticleRow[]): string {
  const byId = new Map(corpus.map((a) => [a.id, a]));
  return facts
    .map((f) => {
      const a = byId.get(f.articleId);
      return `${f.id}. ${f.claim}${f.value ? ` [key value: ${f.value}]` : ""} — source: ${a?.source_name ?? "unknown"} (${a?.published_at.slice(0, 10) ?? "?"}); supporting text: "${f.sourceText}"`;
    })
    .join("\n");
}

export { articleText };
