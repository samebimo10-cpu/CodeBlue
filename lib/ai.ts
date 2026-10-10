import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import crypto from "node:crypto";
import { z } from "zod";
import { db, nowIso, parseJson } from "./db";
import { tokenSet, overlap, splitSentences } from "./text";
import type { ArticleRow } from "./types";

/**
 * Thin wrapper over the Claude API: model selection, structured outputs,
 * refusal handling, and a per-input cache so the same story is never paid for
 * twice (spec: "Cache LLM outputs per story").
 */

export const MODEL = process.env.CODEBLUE_MODEL || "claude-opus-5-5";
export const FAST_MODEL = process.env.CODEBLUE_FAST_MODEL || "claude-haiku-5-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AiRefusal extends Error {}

/** Server-side refusal fallback is available on the Opus, Fable and Sonnet 5.5 lines. */
function supportsFallback(model: string) {
  return /^claude-(opus-5|fable-5|sonnet-5-5)/.test(model);
}

function cacheKey(parts: unknown[]): string {
  return crypto.createHash("sha256").update(JSON.stringify(parts)).digest("hex");
}

export async function structured<S extends z.ZodType>(opts: {
  schema: S;
  system: string;
  prompt: string;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  maxTokens?: number;
  /** Set false to bypass the response cache (e.g. "regenerate"). */
  cache?: boolean;
}): Promise<z.infer<S>> {
  const model = opts.model ?? MODEL;
  const key = cacheKey([model, opts.effort, opts.system, opts.prompt]);
  if (opts.cache !== false) {
    const hit = db().prepare("SELECT value FROM ai_cache WHERE key = ?").get(key) as { value: string } | undefined;
    if (hit) return JSON.parse(hit.value) as z.infer<S>;
  }

  const fallback = supportsFallback(model);
  const response = await anthropic().beta.messages.parse({
    model,
    max_tokens: opts.maxTokens ?? 16000,
    ...(fallback ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
    output_config: {
      effort: opts.effort ?? "medium",
      format: betaZodOutputFormat(opts.schema),
    },
    // Stable system prompt first so it is cached across stories.
    system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: opts.prompt }],
  });

  if (response.stop_reason === "refusal") {
    throw new AiRefusal(response.stop_details?.explanation ?? "The model declined this request.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("The AI response was cut off (max_tokens). Try a shorter depth.");
  }
  const parsed = response.parsed_output;
  if (!parsed) throw new Error("The AI response could not be parsed.");
  db()
    .prepare("INSERT OR REPLACE INTO ai_cache (key, value, created_at) VALUES (?, ?, ?)")
    .run(key, JSON.stringify(parsed), nowIso());
  return parsed as z.infer<S>;
}

// ---------------------------------------------------------------------------
// Corpus formatting and grounding helpers
// ---------------------------------------------------------------------------

export function articleText(a: Pick<ArticleRow, "title" | "summary">): string {
  return a.summary ? `${a.title}. ${a.summary}` : a.title;
}

export function formatCorpus(articles: ArticleRow[]): string {
  return articles
    .map(
      (a) =>
        `[A${a.id}] ${a.source_name ?? a.domain ?? "Unknown"} | ${a.published_at.slice(0, 10)}\n${a.title}${
          a.summary ? `\n${a.summary.slice(0, 700)}` : ""
        }`,
    )
    .join("\n\n");
}

const norm = (s: string) => s.toLowerCase().replace(/[‘’“”"']/g, "").replace(/\s+/g, " ").trim();

/**
 * Find where a cited snippet lives in its article. Returns the verbatim text
 * from the source (exact match, else the best-overlapping sentence), or null
 * if the article does not support it.
 */
export function locateSupport(snippet: string, article: Pick<ArticleRow, "title" | "summary">): string | null {
  const text = articleText(article);
  if (snippet && norm(text).includes(norm(snippet))) return snippet;
  const target = tokenSet(snippet);
  let best: string | null = null;
  let bestScore = 0;
  for (const s of [article.title, ...splitSentences(article.summary)]) {
    const score = overlap(target, tokenSet(s));
    if (score > bestScore) {
      bestScore = score;
      best = s;
    }
  }
  return bestScore >= 0.5 ? best : null;
}

export function cachedJson<T>(key: string): T | null {
  const row = db().prepare("SELECT value FROM ai_cache WHERE key = ?").get(key) as { value: string } | undefined;
  return row ? parseJson<T | null>(row.value, null) : null;
}

export function errorMessage(e: unknown): string {
  if (e instanceof AiRefusal) return `The AI declined: ${e.message}`;
  if (e instanceof Anthropic.AuthenticationError) return "Anthropic API key is invalid. Check ANTHROPIC_API_KEY.";
  if (e instanceof Anthropic.RateLimitError) return "Rate limited by the Anthropic API. Try again in a minute.";
  if (e instanceof Anthropic.APIError) return `Anthropic API error ${e.status}: ${e.message}`;
  return (e as Error)?.message ?? String(e);
}
