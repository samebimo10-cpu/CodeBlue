import Database from "better-sqlite3";
import fs from "node:fs";
import path from "node:path";

/**
 * SQLite store. One file, zero setup. The schema mirrors the spec's data model
 * (Source, Article, Story, FactSheet, Draft, Briefing, Perspective, ...) so it
 * can be moved to Postgres + pgvector later without reshaping the app.
 */

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sources (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT NOT NULL UNIQUE,
  feed_url TEXT,
  type TEXT NOT NULL DEFAULT 'rss',
  credibility REAL NOT NULL DEFAULT 0.6,
  region TEXT,
  language TEXT DEFAULT 'en'
);

CREATE TABLE IF NOT EXISTS stories (
  id INTEGER PRIMARY KEY,
  headline TEXT NOT NULL,
  topic TEXT NOT NULL,
  entities TEXT NOT NULL DEFAULT '[]',
  sensitivity TEXT NOT NULL DEFAULT '[]',
  tokens TEXT NOT NULL DEFAULT '',
  trend_score REAL NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  article_count INTEGER NOT NULL DEFAULT 0,
  first_seen TEXT NOT NULL,
  last_seen TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'developing'
);
CREATE INDEX IF NOT EXISTS idx_stories_topic_last ON stories(topic, last_seen);
CREATE INDEX IF NOT EXISTS idx_stories_score ON stories(trend_score);

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY,
  source_id INTEGER REFERENCES sources(id),
  url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  author TEXT,
  published_at TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  language TEXT DEFAULT 'en',
  topic TEXT,
  origin TEXT NOT NULL,
  story_id INTEGER REFERENCES stories(id),
  fetched_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_articles_story ON articles(story_id);
CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  query TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  daily INTEGER NOT NULL DEFAULT 1,
  background TEXT,
  volume TEXT,
  created_at TEXT NOT NULL,
  last_refreshed TEXT
);

CREATE TABLE IF NOT EXISTS subject_articles (
  subject_id INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  PRIMARY KEY (subject_id, article_id)
);

CREATE TABLE IF NOT EXISTS fact_sheets (
  id INTEGER PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  facts TEXT NOT NULL,
  article_ids TEXT NOT NULL,
  model TEXT,
  generated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_fact_sheets_target ON fact_sheets(target_kind, target_id);

CREATE TABLE IF NOT EXISTS briefings (
  id INTEGER PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  depth TEXT NOT NULL,
  sections TEXT NOT NULL,
  article_ids TEXT NOT NULL,
  model TEXT,
  generated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_briefings_target ON briefings(target_kind, target_id);

CREATE TABLE IF NOT EXISTS perspectives (
  id INTEGER PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  pinned TEXT NOT NULL DEFAULT '[]',
  assist_level TEXT NOT NULL DEFAULT 'self',
  final_text TEXT NOT NULL DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE(target_kind, target_id)
);

CREATE TABLE IF NOT EXISTS drafts (
  id INTEGER PRIMARY KEY,
  target_kind TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  platform TEXT NOT NULL,
  tone TEXT NOT NULL,
  text TEXT NOT NULL,
  source_url TEXT,
  source_name TEXT,
  fact_check_status TEXT NOT NULL DEFAULT 'unchecked',
  fact_check TEXT NOT NULL DEFAULT '[]',
  similarity_score INTEGER NOT NULL DEFAULT 0,
  needs_approval INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft',
  scheduled_at TEXT,
  published_at TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_drafts_status ON drafts(status);

CREATE TABLE IF NOT EXISTS digests (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL,
  topic TEXT NOT NULL,
  body TEXT NOT NULL,
  story_ids TEXT NOT NULL,
  model TEXT,
  generated_at TEXT NOT NULL,
  UNIQUE(date, topic)
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY,
  at TEXT NOT NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ai_cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL
);
`;

let instance: Database.Database | null = null;

export function dbPath(): string {
  return process.env.CODEBLUE_DB ?? path.join(process.cwd(), "data", "codeblue.db");
}

export function db(): Database.Database {
  if (instance) return instance;
  const file = dbPath();
  if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
  const conn = new Database(file);
  conn.pragma("journal_mode = WAL");
  conn.pragma("foreign_keys = ON");
  conn.pragma("busy_timeout = 5000");
  conn.exec(SCHEMA);
  instance = conn;
  return conn;
}

/** For tests: swap in a fresh database. */
export function resetDbForTests(): Database.Database {
  instance?.close();
  instance = null;
  process.env.CODEBLUE_DB = ":memory:";
  return db();
}

export const nowIso = () => new Date().toISOString();

export function audit(kind: string, detail: unknown) {
  db()
    .prepare("INSERT INTO audit_log (at, kind, detail) VALUES (?, ?, ?)")
    .run(nowIso(), kind, typeof detail === "string" ? detail : JSON.stringify(detail));
}

export function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
