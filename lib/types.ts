/** A news item as returned by any source connector, before it is stored. */
export interface RawArticle {
  url: string;
  title: string;
  summary: string;
  publishedAt: string; // ISO
  sourceName: string;
  sourceDomain: string;
  imageUrl?: string | null;
  author?: string | null;
  language?: string;
  origin: "rss" | "google-news" | "gdelt" | "guardian" | "newsdata";
}

export interface ArticleRow {
  id: number;
  source_id: number | null;
  url: string;
  title: string;
  author: string | null;
  published_at: string;
  summary: string;
  image_url: string | null;
  language: string | null;
  topic: string | null;
  origin: string;
  story_id: number | null;
  fetched_at: string;
  source_name?: string;
  domain?: string;
  credibility?: number;
}

export interface StoryRow {
  id: number;
  headline: string;
  topic: string;
  entities: string;
  sensitivity: string;
  tokens: string;
  trend_score: number;
  source_count: number;
  article_count: number;
  first_seen: string;
  last_seen: string;
  status: "developing" | "confirmed";
}

export interface SubjectRow {
  id: number;
  name: string;
  query: string;
  notes: string;
  daily: number;
  background: string | null;
  volume: string | null;
  created_at: string;
  last_refreshed: string | null;
}

export type TargetKind = "story" | "subject";

export interface Fact {
  id: string;
  claim: string;
  /** The number, name or date the claim hinges on, if any. */
  value?: string;
  articleId: number;
  /** Sentence or snippet from the source that supports the claim. */
  sourceText: string;
}

export interface Briefing {
  bottomLine: string;
  keyFacts: Fact[];
  timeline: { date: string; event: string; articleId?: number }[];
  whosInvolved: { name: string; role: string; position: string }[];
  coverage: { agreement: string; framingDifferences: string; disputed: string };
  numbersAndContext: string[];
  publicReaction: string;
  whatToWatch: string[];
  gaps: string[];
  relatedQueries: string[];
}

export type Depth = "quick" | "standard" | "deep";

export type Platform =
  | "x"
  | "threads"
  | "facebook"
  | "instagram"
  | "linkedin"
  | "tiktok"
  | "whatsapp"
  | "telegram";

export type Tone = "neutral" | "punchy" | "explainer" | "witty" | "breaking";

export type AssistLevel = "self" | "polish" | "shape";

export interface FactCheckIssue {
  claim: string;
  verdict: "supported" | "unsupported" | "contradicted";
  note: string;
}

export type DraftStatus = "draft" | "in_review" | "approved" | "scheduled" | "published";
