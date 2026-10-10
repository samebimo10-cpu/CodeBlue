import { z } from "zod";
import { aiEnabled, articleText, structured } from "./ai";
import { factSheetText, getOrBuildFactSheet } from "./briefing";
import { audit, db, nowIso, parseJson } from "./db";
import { overLimitParts, PLATFORMS, THREAD_SEPARATOR, TONES } from "./platforms";
import { corpusFor, getStory, targetTitle } from "./queries";
import { getSettings, type Settings } from "./settings";
import { extractNumbers, longestSharedRun, sensitivityFlags, truncate } from "./text";
import type { ArticleRow, AssistLevel, DraftStatus, Fact, FactCheckIssue, Platform, TargetKind, Tone } from "./types";

/** Spec: block any draft sharing 12+ consecutive words with a source. */
export const SIMILARITY_LIMIT = 12;

export interface DraftRow {
  id: number;
  target_kind: TargetKind;
  target_id: number;
  platform: Platform;
  tone: string;
  text: string;
  source_url: string | null;
  source_name: string | null;
  fact_check_status: "unchecked" | "passed" | "flagged" | "blocked";
  fact_check: string;
  similarity_score: number;
  needs_approval: number;
  status: DraftStatus;
  scheduled_at: string | null;
  published_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Context about the target: sensitivity, confirmation, attribution
// ---------------------------------------------------------------------------

interface TargetContext {
  title: string;
  sensitive: string[];
  developing: boolean;
  primary: ArticleRow;
  corpus: ArticleRow[];
}

function targetContext(kind: TargetKind, id: number, corpus: ArticleRow[]): TargetContext {
  const title = targetTitle(kind, id) ?? "";
  let sensitive: string[];
  let developing: boolean;
  if (kind === "story") {
    const s = getStory(id);
    sensitive = s?.sensitivity ?? [];
    developing = s?.story.status !== "confirmed";
  } else {
    const recent = [...corpus].sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 15);
    sensitive = sensitivityFlags(recent.map((a) => a.title).join(". "));
    developing = new Set(recent.slice(0, 5).map((a) => a.domain)).size < 2;
  }
  // Link to the most credible source among the most recent coverage.
  const recent = [...corpus].sort((a, b) => b.published_at.localeCompare(a.published_at)).slice(0, 10);
  // Prefer a direct publisher URL over an aggregator redirect, then the most credible outlet.
  const direct = (a: ArticleRow) => (a.origin === "google-news" ? 0 : 1);
  const primary = [...recent].sort((a, b) => direct(b) - direct(a) || (b.credibility ?? 0) - (a.credibility ?? 0))[0] ?? corpus[0];
  return { title, sensitive, developing, primary, corpus };
}

function effectiveTone(tone: Tone, sensitive: string[]): Tone {
  // Sensitive topics: neutral tone, never jokes or clickbait hooks.
  if (sensitive.length > 0 && (tone === "witty" || tone === "punchy" || tone === "breaking")) return "neutral";
  return tone;
}

// ---------------------------------------------------------------------------
// Attribution
// ---------------------------------------------------------------------------

export function withAttribution(text: string, platform: Platform, source: { name: string; url: string }, settings: Settings): string {
  const spec = PLATFORMS[platform];
  let out = text.trim();
  const mentionsLink = out.includes(source.url);
  if (spec.clickableLinks) {
    if (!mentionsLink) out += `\n\nSource: ${source.name} ${source.url}`;
  } else if (platform === "instagram") {
    if (!/link in bio/i.test(out)) out += `\n\nSource: ${source.name} (link in bio)`;
  } else if (!out.toLowerCase().includes(source.name.toLowerCase())) {
    out += `\n\nON SCREEN: Source: ${source.name}`;
  }
  if (settings.aiDisclosure && !/AI-assisted/i.test(out)) out += "\n\n#AIassisted";
  return out;
}

// ---------------------------------------------------------------------------
// Integrity: similarity gate + grounding check + AI fact-check pass
// ---------------------------------------------------------------------------

const FactCheckSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      issues: z.array(
        z.object({
          claim: z.string(),
          verdict: z.enum(["supported", "unsupported", "contradicted"]),
          note: z.string(),
        }),
      ),
    }),
  ),
});

const FACTCHECK_SYSTEM = `You are Code Blue's fact-check pass. Compare each draft against the fact sheet.
- List every factual claim in the draft that hinges on a number, name, date, place or quote.
- verdict "supported": the fact sheet states it. "unsupported": the fact sheet does not state it. "contradicted": the fact sheet says otherwise.
- Opinions, questions, calls to action and the writer's own views are not factual claims: ignore them.
- The source credit line and link are not claims.
- Keep notes short and specific (e.g. "fact sheet says 12, draft says 21").`;

/** Deterministic grounding: numbers in a draft must appear in the fact sheet or sources. */
export function ungroundedNumbers(text: string, groundTruth: string): string[] {
  const truth = new Set(extractNumbers(groundTruth));
  const stripped = text.replace(/https?:\/\/\S+/g, "").replace(/#\w+/g, "").replace(/\b(?:Slide|Part)\s+\d+\b/gi, "").replace(/^\s*\d+\/\d*\s*/gm, "");
  return extractNumbers(stripped).filter((n) => {
    if (truth.has(n)) return false;
    const bare = n.replace(/[^0-9.]/g, "");
    if (!bare || Number(bare) <= 10) return false; // small counts ("3 things") aren't factual claims
    return ![...truth].some((t) => t.replace(/[^0-9.]/g, "") === bare);
  });
}

export interface IntegrityResult {
  status: DraftRow["fact_check_status"];
  issues: FactCheckIssue[];
  similarity: number;
}

export async function checkIntegrity(
  texts: string[],
  facts: Fact[],
  corpus: ArticleRow[],
  opts: { ai?: boolean } = {},
): Promise<IntegrityResult[]> {
  const sources = corpus.map(articleText);
  const sheet = factSheetText(facts, corpus);
  const truth = `${sheet}\n${sources.join("\n")}`;

  let aiIssues: FactCheckIssue[][] = texts.map(() => []);
  if (opts.ai !== false && aiEnabled() && texts.length > 0) {
    const res = await structured({
      schema: FactCheckSchema,
      system: FACTCHECK_SYSTEM,
      prompt: `Fact sheet:\n${sheet}\n\nDrafts:\n${texts.map((t, i) => `<draft index="${i}">\n${t}\n</draft>`).join("\n")}`,
      effort: "low",
      cache: false,
    });
    aiIssues = texts.map((_, i) => (res.results.find((r) => r.index === i)?.issues ?? []).filter((x) => x.verdict !== "supported"));
  }

  return texts.map((text, i) => {
    const similarity = longestSharedRun(text, sources);
    const issues: FactCheckIssue[] = [...aiIssues[i]];
    for (const n of ungroundedNumbers(text, truth)) {
      if (!issues.some((x) => x.claim.includes(n))) {
        issues.push({ claim: n, verdict: "unsupported", note: `The number "${n}" does not appear in the sources.` });
      }
    }
    if (similarity >= SIMILARITY_LIMIT) {
      issues.push({
        claim: "Copied wording",
        verdict: "contradicted",
        note: `Shares ${similarity} consecutive words with a source (limit ${SIMILARITY_LIMIT - 1}). Rewrite in your own words or quote briefly with attribution.`,
      });
    }
    const status: IntegrityResult["status"] = issues.some((x) => x.verdict === "contradicted")
      ? "blocked"
      : issues.length > 0
        ? "flagged"
        : "passed";
    return { status, issues, similarity };
  });
}

// ---------------------------------------------------------------------------
// Draft generation
// ---------------------------------------------------------------------------

const DraftsSchema = z.object({
  drafts: z.array(z.object({ platform: z.string(), text: z.string() })),
});

const WRITER_SYSTEM = `You are Code Blue's writing engine. You turn a fact sheet into ready-to-post social content.

Hard rules:
- Use only facts from the fact sheet. No number, name, date, place or quote may appear unless the fact sheet contains it.
- Write in fresh, original wording. Never copy a source sentence; quotes must be short (under 12 words), in quotation marks and attributed.
- Attribute: name the outlet when a fact comes from a single source ("according to BBC").
- Never invent an opinion. Only include a stance if the writer supplied one; otherwise report.
- Do not add the source link or credit line yourself: Code Blue appends it.
- Respect each platform's format and character limits exactly. For a thread, separate parts with a line containing only ---.
- If the story is marked DEVELOPING, say it is developing and avoid definitive language.
- If the story is marked SENSITIVE, use a calm, neutral tone: no jokes, no emoji, no clickbait hooks.
- Output one draft per requested platform, with "platform" set to the requested id.`;

function voiceBlock(settings: Settings): string {
  const takes = db()
    .prepare("SELECT final_text FROM perspectives WHERE final_text != '' ORDER BY updated_at DESC LIMIT 5")
    .all() as { final_text: string }[];
  const samples = [settings.brandVoice, ...takes.map((t) => t.final_text)].filter(Boolean).join("\n---\n");
  return samples ? `Brand voice samples (match this voice, not these facts):\n${truncate(samples, 4000)}` : "";
}

function styleBlock(settings: Settings, tone: Tone, length: "short" | "medium" | "long"): string {
  return [
    `Tone: ${TONES[tone]}`,
    `Length: ${length}.`,
    `Language: ${settings.language}.`,
    `Emoji: ${settings.emojiLevel}.`,
    `Hashtags: ${settings.hashtagCount} relevant hashtags at most (LinkedIn max 3).`,
    settings.callToAction ? `Call to action to include where natural: ${settings.callToAction}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Without AI, drafts are built from short attributed quotes: honest about the
 * source and inside the copy rules (attributed quotes are exempt from the
 * similarity gate). The writer is expected to edit before posting.
 */
function templateDraft(platform: Platform, ctx: TargetContext, facts: Fact[], corpus: ArticleRow[]): string {
  const byId = new Map(corpus.map((a) => [a.id, a]));
  const quote = (f: Fact, max: number) => `${byId.get(f.articleId)?.source_name ?? "Reports"}: \u201c${truncate(f.sourceText, max)}\u201d`;
  const label = ctx.developing ? "Developing: " : "";
  const lead = facts[0] ? quote(facts[0], 150) : `\u201c${truncate(ctx.title, 150)}\u201d`;
  const more = facts.slice(1, 3).map((f) => `\u2022 ${quote(f, 150)}`);
  switch (platform) {
    case "x":
    case "threads":
      return `${label}${facts[0] ? quote(facts[0], PLATFORMS[platform].limit - 90) : lead}`;
    case "tiktok":
      return `HOOK: ${label}${lead}\n${more.map((m) => `VO: ${m.slice(2)}`).join("\n")}`;
    case "instagram":
      return `${label}${lead}\n\n${more.join("\n")}\n\nLink in bio.`;
    default:
      return `${label}${lead}\n\n${more.join("\n")}`;
  }
}

function insertDraft(d: {
  kind: TargetKind;
  id: number;
  platform: Platform;
  tone: string;
  text: string;
  source: { name: string; url: string };
  integrity: IntegrityResult;
  needsApproval: boolean;
}): number {
  const now = nowIso();
  const info = db()
    .prepare(
      `INSERT INTO drafts (target_kind, target_id, platform, tone, text, source_url, source_name, fact_check_status, fact_check,
         similarity_score, needs_approval, status, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      d.kind,
      d.id,
      d.platform,
      d.tone,
      d.text,
      d.source.url,
      d.source.name,
      d.integrity.status,
      JSON.stringify(d.integrity.issues),
      d.integrity.similarity,
      d.needsApproval ? 1 : 0,
      d.needsApproval ? "in_review" : "draft",
      now,
      now,
    );
  return Number(info.lastInsertRowid);
}

export async function generateDrafts(opts: {
  kind: TargetKind;
  id: number;
  platforms: Platform[];
  tone: Tone;
  length?: "short" | "medium" | "long";
  /** The writer's own stance (Perspective "Shape" mode). */
  stance?: string;
  pinnedFactIds?: string[];
}): Promise<DraftRow[]> {
  const settings = getSettings();
  const { facts, corpus } = await getOrBuildFactSheet(opts.kind, opts.id);
  const ctx = targetContext(opts.kind, opts.id, corpus.length ? corpus : corpusFor(opts.kind, opts.id, 40));
  const tone = effectiveTone(opts.tone, ctx.sensitive);
  const source = { name: ctx.primary.source_name ?? ctx.primary.domain ?? "Source", url: ctx.primary.url };
  const usable = opts.pinnedFactIds?.length ? facts.filter((f) => opts.pinnedFactIds!.includes(f.id)) : facts;

  let texts: Record<string, string> = {};
  if (aiEnabled()) {
    const prompt = [
      `Story: ${ctx.title}`,
      ctx.developing ? "Status: DEVELOPING (fewer than two independent sources confirm it)." : "Status: confirmed by multiple outlets.",
      ctx.sensitive.length ? `SENSITIVE: ${ctx.sensitive.join(", ")}.` : "",
      `Fact sheet:\n${factSheetText(usable.length ? usable : facts, corpus)}`,
      opts.stance
        ? `The writer's own notes and stance (carry this stance faithfully, add no other opinion, and keep their wording where possible):\n${opts.stance}`
        : "",
      styleBlock(settings, tone, opts.length ?? "medium"),
      voiceBlock(settings),
      `Platforms:\n${opts.platforms.map((p) => `- ${p}: ${PLATFORMS[p].label}. ${PLATFORMS[p].guidance} Limit ${PLATFORMS[p].limit} characters${PLATFORMS[p].thread ? " per part" : ""}.`).join("\n")}`,
    ]
      .filter(Boolean)
      .join("\n\n");
    const res = await structured({ schema: DraftsSchema, system: WRITER_SYSTEM, prompt, cache: false });
    texts = Object.fromEntries(res.drafts.map((d) => [d.platform, d.text.replace(/\n\s*---\s*\n/g, THREAD_SEPARATOR)]));
  } else {
    texts = Object.fromEntries(opts.platforms.map((p) => [p, templateDraft(p, ctx, usable.length ? usable : facts, corpus)]));
  }

  const platforms = opts.platforms.filter((p) => texts[p]);
  const integrity = await checkIntegrity(platforms.map((p) => texts[p]), facts, corpus);
  const ids = platforms.map((p, i) => {
    let text = withAttribution(texts[p], p, source, settings);
    // Keep the link inside the limit on threaded platforms by moving it to its own final part if needed.
    if (PLATFORMS[p].thread && overLimitParts(text, p).length > 0 && !texts[p].includes(source.url)) {
      text = `${texts[p].trim()}${THREAD_SEPARATOR}Source: ${source.name} ${source.url}`;
    }
    return insertDraft({
      kind: opts.kind,
      id: opts.id,
      platform: p,
      tone: opts.stance ? "perspective" : tone,
      text,
      source,
      integrity: integrity[i],
      needsApproval: ctx.sensitive.length > 0,
    });
  });
  audit("drafts.generate", { kind: opts.kind, id: opts.id, platforms, tone, ids });
  return ids.map((id) => getDraft(id)!);
}

// ---------------------------------------------------------------------------
// Perspective mode: the writer's take, with as much help as they choose
// ---------------------------------------------------------------------------

const PolishSchema = z.object({ text: z.string(), changes: z.array(z.string()) });
const AnglesSchema = z.object({ questions: z.array(z.string()) });

export async function polishTake(text: string): Promise<{ text: string; changes: string[] }> {
  if (!aiEnabled()) return { text, changes: ["AI disabled: no changes made."] };
  return structured({
    schema: PolishSchema,
    system: `You are a copy editor. Fix grammar, spelling and flow, and tighten wording. Keep the writer's words, voice, language mix (e.g. Pidgin) and opinion exactly; do not add facts, arguments or opinions; do not soften or strengthen their stance. List the main changes briefly.`,
    prompt: text,
    effort: "low",
    cache: false,
  });
}

export async function angleIdeas(kind: TargetKind, id: number): Promise<string[]> {
  const { facts, corpus } = await getOrBuildFactSheet(kind, id);
  if (!aiEnabled()) return ["Who is most affected, and has anyone asked them?", "What happens next, and when?", "What is missing from the coverage so far?"];
  const res = await structured({
    schema: AnglesSchema,
    system: `Suggest 5-7 questions a writer could explore to form their own take on this story (for example "What does this mean for small farmers?"). Questions only: never answer them, never suggest an opinion or which side to take.`,
    prompt: `Story: ${targetTitle(kind, id)}\n\nFact sheet:\n${factSheetText(facts, corpus)}`,
    effort: "low",
  });
  return res.questions;
}

export interface Perspective {
  notes: string;
  pinned: string[];
  assist_level: AssistLevel;
  final_text: string;
  updated_at: string;
}

export function getPerspective(kind: TargetKind, id: number): Perspective {
  const row = db().prepare("SELECT * FROM perspectives WHERE target_kind = ? AND target_id = ?").get(kind, id) as
    | (Omit<Perspective, "pinned"> & { pinned: string })
    | undefined;
  if (!row) return { notes: "", pinned: [], assist_level: "self", final_text: "", updated_at: "" };
  return { ...row, pinned: parseJson<string[]>(row.pinned, []) };
}

export function savePerspective(kind: TargetKind, id: number, p: Partial<Perspective>): Perspective {
  const next = { ...getPerspective(kind, id), ...p, updated_at: nowIso() };
  db()
    .prepare(
      `INSERT INTO perspectives (target_kind, target_id, notes, pinned, assist_level, final_text, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(target_kind, target_id) DO UPDATE SET notes = excluded.notes, pinned = excluded.pinned,
         assist_level = excluded.assist_level, final_text = excluded.final_text, updated_at = excluded.updated_at`,
    )
    .run(kind, id, next.notes, JSON.stringify(next.pinned), next.assist_level, next.final_text, next.updated_at);
  return next;
}

/** Fact-check the writer's own text against the sources. Opinions are left alone. */
export async function checkTake(kind: TargetKind, id: number, text: string): Promise<IntegrityResult> {
  const { facts, corpus } = await getOrBuildFactSheet(kind, id);
  return (await checkIntegrity([text], facts, corpus))[0];
}

/** "Write it myself" / "Polish": turn the writer's final text into a draft per platform. */
export async function draftsFromTake(kind: TargetKind, id: number, text: string, platforms: Platform[]): Promise<DraftRow[]> {
  const settings = getSettings();
  const { facts, corpus } = await getOrBuildFactSheet(kind, id);
  const ctx = targetContext(kind, id, corpus);
  const source = { name: ctx.primary.source_name ?? ctx.primary.domain ?? "Source", url: ctx.primary.url };
  const [integrity] = await checkIntegrity([text], facts, corpus);
  const ids = platforms.map((p) =>
    insertDraft({
      kind,
      id,
      platform: p,
      tone: "perspective",
      text: withAttribution(text, p, source, settings),
      source,
      integrity,
      needsApproval: ctx.sensitive.length > 0,
    }),
  );
  return ids.map((d) => getDraft(d)!);
}

// ---------------------------------------------------------------------------
// Draft CRUD + workflow
// ---------------------------------------------------------------------------

export function getDraft(id: number): DraftRow | null {
  return (db().prepare("SELECT * FROM drafts WHERE id = ?").get(id) as DraftRow | undefined) ?? null;
}

export function listDrafts(filter: { status?: DraftStatus; kind?: TargetKind; targetId?: number } = {}): DraftRow[] {
  const where: string[] = [];
  const args: unknown[] = [];
  if (filter.status) (where.push("status = ?"), args.push(filter.status));
  if (filter.kind) (where.push("target_kind = ?"), args.push(filter.kind));
  if (filter.targetId) (where.push("target_id = ?"), args.push(filter.targetId));
  return db()
    .prepare(`SELECT * FROM drafts ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT 300`)
    .all(...args) as DraftRow[];
}

const TRANSITIONS: Record<DraftStatus, DraftStatus[]> = {
  draft: ["in_review", "approved"],
  in_review: ["approved", "draft"],
  approved: ["scheduled", "published", "draft"],
  scheduled: ["published", "approved", "draft"],
  published: [],
};

export class WorkflowError extends Error {}

/** Edit text: re-runs the integrity gate so edits can't sneak past it. */
export async function updateDraftText(id: number, text: string): Promise<DraftRow> {
  const draft = getDraft(id);
  if (!draft) throw new WorkflowError("Draft not found");
  if (draft.status === "published") throw new WorkflowError("Published drafts can't be edited.");
  const { facts, corpus } = await getOrBuildFactSheet(draft.target_kind, draft.target_id);
  const [integrity] = await checkIntegrity([text], facts, corpus);
  db()
    .prepare(
      `UPDATE drafts SET text = ?, fact_check_status = ?, fact_check = ?, similarity_score = ?, version = version + 1,
         status = CASE WHEN status IN ('approved', 'scheduled') THEN ? ELSE status END, updated_at = ? WHERE id = ?`,
    )
    .run(text, integrity.status, JSON.stringify(integrity.issues), integrity.similarity, draft.needs_approval ? "in_review" : "draft", nowIso(), id);
  return getDraft(id)!;
}

export function setDraftStatus(id: number, status: DraftStatus, scheduledAt?: string | null): DraftRow {
  const draft = getDraft(id);
  if (!draft) throw new WorkflowError("Draft not found");
  if (draft.status !== status && !TRANSITIONS[draft.status].includes(status)) {
    throw new WorkflowError(`Can't move a draft from ${draft.status} to ${status}.`);
  }
  if (["approved", "scheduled", "published"].includes(status) && draft.fact_check_status === "blocked") {
    throw new WorkflowError("This draft failed the integrity gate. Edit it until the fact-check passes.");
  }
  if (status === "draft" && draft.needs_approval) status = "in_review";
  if (status === "scheduled" && !scheduledAt) throw new WorkflowError("Pick a time to schedule.");
  const now = nowIso();
  db()
    .prepare("UPDATE drafts SET status = ?, scheduled_at = ?, published_at = ?, updated_at = ? WHERE id = ?")
    .run(
      status,
      status === "scheduled" ? scheduledAt : status === "published" ? draft.scheduled_at : null,
      status === "published" ? now : null,
      now,
      id,
    );
  audit("drafts.status", { id, from: draft.status, to: status, scheduledAt });
  return getDraft(id)!;
}

export function deleteDraft(id: number) {
  db().prepare("DELETE FROM drafts WHERE id = ?").run(id);
}

/** Scheduled drafts whose time has come (the worker turns these into alerts). */
export function dueDrafts(now = nowIso()): DraftRow[] {
  return db().prepare("SELECT * FROM drafts WHERE status = 'scheduled' AND scheduled_at <= ?").all(now) as DraftRow[];
}
