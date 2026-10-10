import type { Platform, Tone } from "./types";

export interface PlatformSpec {
  id: Platform;
  label: string;
  /** Character limit per post (or per thread part). */
  limit: number;
  /** URLs count as this many characters (X wraps links with t.co). */
  linkWeight?: number;
  thread: boolean;
  clickableLinks: boolean;
  guidance: string;
}

export const PLATFORMS: Record<Platform, PlatformSpec> = {
  x: {
    id: "x",
    label: "X",
    limit: 280,
    linkWeight: 23,
    thread: true,
    clickableLinks: true,
    guidance:
      "Single post under 280 characters, or a thread of 2-5 parts if the story needs it. Strong first line. Link goes in the last part.",
  },
  threads: {
    id: "threads",
    label: "Threads",
    limit: 500,
    thread: true,
    clickableLinks: true,
    guidance: "Conversational post under 500 characters, or a short thread. Link at the end.",
  },
  facebook: {
    id: "facebook",
    label: "Facebook",
    limit: 2000,
    thread: false,
    clickableLinks: true,
    guidance: "Hook in the first two lines (before 'See more'), then 2-4 short paragraphs. Link at the end for the preview card.",
  },
  instagram: {
    id: "instagram",
    label: "Instagram",
    limit: 2200,
    thread: false,
    clickableLinks: false,
    guidance:
      "Caption with a hook line, short paragraphs, then 'Link in bio' instead of a URL. Also give carousel slide text: 4-6 slides, each under 20 words, as lines starting 'Slide 1:', 'Slide 2:' etc. after the caption.",
  },
  linkedin: {
    id: "linkedin",
    label: "LinkedIn",
    limit: 3000,
    thread: false,
    clickableLinks: true,
    guidance: "Professional, longer form: a clear hook, context, why it matters for professionals, a question to invite discussion. Few hashtags (max 3).",
  },
  tiktok: {
    id: "tiktok",
    label: "TikTok / Reels / Shorts",
    limit: 2200,
    thread: false,
    clickableLinks: false,
    guidance:
      "A 30-60 second video script. Spoken hook in the first 3 seconds. Format as lines 'HOOK:', 'VO:' (voice-over) and 'ON SCREEN:' (caption text), ending with a source credit on screen.",
  },
  whatsapp: {
    id: "whatsapp",
    label: "WhatsApp Channel",
    limit: 1000,
    thread: false,
    clickableLinks: true,
    guidance: "Short plain-text update (3-5 lines), no markdown, link at the end.",
  },
  telegram: {
    id: "telegram",
    label: "Telegram",
    limit: 1500,
    thread: false,
    clickableLinks: true,
    guidance: "Short update with a bold-free plain headline line, 2-3 lines of detail, link at the end.",
  },
};

export const PLATFORM_IDS = Object.keys(PLATFORMS) as Platform[];

export const TONES: Record<Tone, string> = {
  neutral: "Neutral: plain, factual, calm. No hype.",
  punchy: "Punchy: short sentences, strong verbs, energetic, but no clickbait and no exaggeration.",
  explainer: "Explainer: lead with what happened, then 'why it matters' in simple terms.",
  witty: "Witty: light, clever phrasing where appropriate, never mocking victims, never at the expense of accuracy.",
  breaking: "Breaking: urgent, the newest confirmed fact first, label as BREAKING only if the story is from the last few hours.",
};

export const THREAD_SEPARATOR = "\n\n---\n\n";

/** Weighted length: URLs count as `linkWeight` chars where the platform shortens them. */
export function weightedLength(text: string, spec: PlatformSpec): number {
  if (!spec.linkWeight) return [...text].length;
  return [...text.replace(/https?:\/\/\S+/g, "x".repeat(spec.linkWeight))].length;
}

/** Parts of a post that exceed the platform limit (1-based part numbers). */
export function overLimitParts(text: string, platform: Platform): number[] {
  const spec = PLATFORMS[platform];
  const parts = spec.thread ? text.split(THREAD_SEPARATOR) : [text];
  return parts.map((p, i) => (weightedLength(p, spec) > spec.limit ? i + 1 : 0)).filter(Boolean);
}
