import { audit, db, nowIso } from "./db";
import { buildAllDigests, getDigest, today } from "./digest";
import { dueDrafts } from "./drafts";
import { ingestAllTopics, refreshDailySubjects } from "./ingest";
import { storyFeed } from "./queries";
import { getSettings } from "./settings";
import { TOPICS } from "./topics";

/** Jobs shared by the background worker and the "Refresh" buttons in the app. */

export async function pollTopics(tier: "fast" | "all") {
  const report = await ingestAllTopics(tier);
  raiseHotStoryAlerts();
  return report;
}

export async function dailyRun() {
  const subjects = await refreshDailySubjects();
  const digests = await buildAllDigests(today());
  audit("daily.run", { subjects: Object.keys(subjects).length, digests });
  return { subjects, digests };
}

/** Build today's digests if the worker starts after the daily hour and none exist. */
export async function ensureTodayDigests() {
  const missing = TOPICS.some((t) => !getDigest(t.id, today()));
  if (missing) await buildAllDigests(today());
}

export interface Alert {
  id: number;
  at: string;
  kind: "hot_story" | "post_due";
  title: string;
  href: string;
}

/** Alert once when a high-heat story breaks in a followed topic or matches a keyword. */
export function raiseHotStoryAlerts() {
  const settings = getSettings();
  const followed = new Set<string>(settings.followedTopics);
  const conn = db();
  const already = new Set(
    (conn.prepare("SELECT detail FROM audit_log WHERE kind = 'alert' AND at >= ?").all(new Date(Date.now() - 3 * 86400000).toISOString()) as { detail: string }[])
      .map((r) => JSON.parse(r.detail).href as string),
  );
  for (const s of storyFeed({ hours: 6, limit: 60 })) {
    if (s.heat !== "hot" || (!followed.has(s.topic) && s.fit === 0)) continue;
    const href = `/story/${s.id}`;
    if (already.has(href)) continue;
    audit("alert", { kind: "hot_story", title: s.headline, href });
  }
}

export function raiseDueAlerts() {
  const conn = db();
  for (const d of dueDrafts()) {
    const href = `/drafts?focus=${d.id}`;
    const seen = conn.prepare("SELECT 1 FROM audit_log WHERE kind = 'alert' AND detail LIKE ?").get(`%"href":"${href}"%`);
    if (!seen) audit("alert", { kind: "post_due", title: `Scheduled ${d.platform} post is due`, href });
  }
}

export function recentAlerts(limit = 20): Alert[] {
  return (db().prepare("SELECT id, at, detail FROM audit_log WHERE kind = 'alert' ORDER BY id DESC LIMIT ?").all(limit) as { id: number; at: string; detail: string }[]).map(
    (r) => ({ id: r.id, at: r.at, ...(JSON.parse(r.detail) as Omit<Alert, "id" | "at">) }),
  );
}

export function lastIngestAt(): string | null {
  const row = db().prepare("SELECT at FROM audit_log WHERE kind = 'ingest.topic' ORDER BY id DESC LIMIT 1").get() as { at: string } | undefined;
  return row?.at ?? null;
}

export { nowIso };
