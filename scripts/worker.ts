/**
 * Code Blue background worker. Runs around the clock:
 *  - polls top sources every CODEBLUE_POLL_FAST_MIN minutes (default 5)
 *  - polls every source every CODEBLUE_POLL_SLOW_MIN minutes (default 30)
 *  - at CODEBLUE_DAILY_HOUR (default 06:00) refreshes your subjects and builds the daily coverage
 *  - every minute, raises alerts for scheduled posts that are due
 */
import cron from "node-cron";
import { dailyRun, ensureTodayDigests, pollTopics, raiseDueAlerts } from "../lib/jobs";
import { aiEnabled } from "../lib/ai";

const fast = Number(process.env.CODEBLUE_POLL_FAST_MIN ?? 5);
const slow = Number(process.env.CODEBLUE_POLL_SLOW_MIN ?? 30);
const dailyHour = Number(process.env.CODEBLUE_DAILY_HOUR ?? 6);

const running = new Set<string>();
async function job(name: string, fn: () => Promise<unknown>) {
  if (running.has(name)) return; // never overlap the same job
  running.add(name);
  const started = Date.now();
  try {
    const result = await fn();
    console.log(`[${new Date().toISOString()}] ${name} done in ${((Date.now() - started) / 1000).toFixed(1)}s`, summarize(result));
  } catch (e) {
    console.error(`[${new Date().toISOString()}] ${name} failed:`, (e as Error).message);
  } finally {
    running.delete(name);
  }
}

function summarize(result: unknown) {
  if (!result || typeof result !== "object") return "";
  const r = result as Record<string, { inserted?: number; errors?: string[] }>;
  const inserted = Object.values(r).reduce((n, v) => n + (v?.inserted ?? 0), 0);
  const errors = Object.values(r).reduce((n, v) => n + (v?.errors?.length ?? 0), 0);
  return Number.isFinite(inserted) ? `(+${inserted} articles, ${errors} source errors)` : "";
}

console.log(`Code Blue worker starting. AI: ${aiEnabled() ? "on" : "off (set ANTHROPIC_API_KEY)"}. Fast poll ${fast}m, full poll ${slow}m, daily run ${dailyHour}:00.`);

cron.schedule(`*/${fast} * * * *`, () => job("poll:fast", () => pollTopics("fast")));
cron.schedule(`*/${slow} * * * *`, () => job("poll:all", () => pollTopics("all")));
cron.schedule(`0 ${dailyHour} * * *`, () => job("daily", dailyRun));
cron.schedule(`* * * * *`, () => job("due", async () => raiseDueAlerts()));

// Warm start: fill the feed now, then make sure today's coverage exists.
void job("startup", async () => {
  const r = await pollTopics("all");
  if (new Date().getHours() >= dailyHour) await ensureTodayDigests();
  return r;
});
