import { db, parseJson } from "./db";
import type { Platform, Tone } from "./types";
import type { TopicId } from "./topics";

export interface Settings {
  /** Topics shown first on the daily coverage page. */
  followedTopics: TopicId[];
  /** Keywords that raise a story's personal fit score. */
  keywords: string[];
  /** Domains never ingested or shown (e.g. "example.com"). */
  blockedSources: string[];
  /** Words that hide a story from the feed. */
  blockedKeywords: string[];
  platforms: Platform[];
  defaultTone: Tone;
  language: string;
  emojiLevel: "none" | "light" | "heavy";
  hashtagCount: number;
  callToAction: string;
  /** Past posts or takes that teach the writing engine the user's voice. */
  brandVoice: string;
  /** Adds an "AI-assisted" tag to generated drafts. */
  aiDisclosure: boolean;
  customFeeds: { url: string; name: string; topic: TopicId }[];
}

export const DEFAULT_SETTINGS: Settings = {
  followedTopics: ["top", "nigeria", "technology", "business", "world"],
  keywords: [],
  blockedSources: [],
  blockedKeywords: [],
  platforms: ["x", "facebook", "instagram", "linkedin"],
  defaultTone: "neutral",
  language: "English",
  emojiLevel: "light",
  hashtagCount: 2,
  callToAction: "",
  brandVoice: "",
  aiDisclosure: false,
  customFeeds: [],
};

export function getSettings(): Settings {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'user'").get() as { value: string } | undefined;
  return { ...DEFAULT_SETTINGS, ...parseJson<Partial<Settings>>(row?.value, {}) };
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const next = { ...getSettings(), ...patch };
  db()
    .prepare("INSERT INTO settings (key, value) VALUES ('user', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(next));
  return next;
}
