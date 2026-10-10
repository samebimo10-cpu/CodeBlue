import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { aiEnabled } from "@/lib/ai";
import { digestDates, getDigest, today } from "@/lib/digest";
import { formatDay, timeAgo } from "@/lib/format";
import { lastIngestAt } from "@/lib/jobs";
import { getStory, listSubjects } from "@/lib/queries";
import { getSettings } from "@/lib/settings";
import { TOPICS } from "@/lib/topics";
import { StatusBadge } from "@/components/Badges";

export const dynamic = "force-dynamic";

export default async function TodayPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: requested } = await searchParams;
  const date = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today();
  const settings = getSettings();
  const followed = new Set<string>(settings.followedTopics);
  const topics = [...TOPICS].sort((a, b) => Number(followed.has(b.id)) - Number(followed.has(a.id)));
  const digests = topics.map((t) => ({ topic: t, digest: getDigest(t.id, date) }));
  const hasAny = digests.some((d) => d.digest);
  const subjects = listSubjects().slice(0, 8);
  const dates = digestDates();
  const lastIngest = lastIngestAt();

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-brand">Daily coverage</p>
          <h1 className="text-3xl font-bold tracking-tight">{formatDay(date)}</h1>
          <p className="mt-1 text-sm text-muted">
            Feeds last checked {timeAgo(lastIngest)} · AI {aiEnabled() ? "on" : "off (add ANTHROPIC_API_KEY for AI summaries)"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {dates.length > 1 && (
            <form className="flex gap-2">
              <select name="date" defaultValue={date} className="input w-auto">
                {[today(), ...dates.filter((d) => d !== today())].map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
              <button className="btn-ghost">Go</button>
            </form>
          )}
          <ActionButton url="/api/refresh" body={{ scope: "topics" }} label="Pull latest news" busyLabel="Pulling feeds…" />
          <ActionButton url="/api/refresh" body={{ scope: "digests" }} label="Build today's coverage" busyLabel="Writing coverage…" variant="primary" />
        </div>
      </section>

      {subjects.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-semibold">Your subjects</h2>
            <Link href="/subjects" className="text-sm text-brand">
              Manage →
            </Link>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {subjects.map((s) => (
              <Link key={s.id} href={`/subjects/${s.id}`} className="card p-4 hover:border-brand">
                <div className="font-semibold">{s.name}</div>
                <div className="mt-1 text-xs text-muted">
                  {s.article_count} articles · latest {timeAgo(s.latest)}
                </div>
                <div className="mt-2 text-xs text-brand">Open briefing & write →</div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {!hasAny && (
        <section className="card p-6">
          <h2 className="text-lg font-semibold">No coverage for this day yet</h2>
          <p className="mt-1 text-sm text-muted">
            Pull the latest news, then build today&apos;s coverage. The background worker (<code>npm run worker</code>) does both automatically
            every day.
          </p>
        </section>
      )}

      {hasAny && digests.some((d) => d.digest && d.digest.items.length === 0) && (
        <p className="text-sm text-muted">
          Nothing collected yet today for:{" "}
          {digests
            .filter((d) => d.digest && d.digest.items.length === 0)
            .map((d) => d.topic.label)
            .join(", ")}
          .
        </p>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {digests
          .filter((d) => d.digest && d.digest.items.length > 0)
          .map(({ topic, digest }) => (
            <section key={topic.id} className="card p-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <h2 className="text-xl font-bold">{topic.label}</h2>
                <Link href={`/feed?topic=${topic.id}`} className="text-sm text-brand">
                  All stories →
                </Link>
              </div>
              <p className="mb-4 text-sm text-muted">{digest!.overview}</p>
              <ol className="space-y-4">
                {digest!.items.map((item, i) => {
                  const s = getStory(item.storyId);
                  return (
                    <li key={item.storyId} className="flex gap-3">
                      <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-soft text-xs font-bold text-brand">{i + 1}</span>
                      <div className="min-w-0">
                        <Link href={`/story/${item.storyId}`} className="font-semibold leading-snug hover:text-brand">
                          {item.headline}
                        </Link>
                        <p className="mt-0.5 text-sm">{item.summary}</p>
                        <p className="mt-0.5 text-sm text-muted">{item.whyItMatters}</p>
                        {s && (
                          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                            <StatusBadge status={s.story.status} />
                            <span>
                              {s.story.source_count} source{s.story.source_count === 1 ? "" : "s"} ·{" "}
                              {[...new Set(s.articles.map((a) => a.source_name))].slice(0, 3).join(", ")}
                            </span>
                            <Link href={`/story/${item.storyId}?tab=take`} className="text-brand">
                              Write my take
                            </Link>
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
              <p className="mt-4 text-xs text-muted">
                {digest!.model ? "AI-written from the linked sources" : "Extractive summary"} · {timeAgo(digest!.generatedAt)}
              </p>
            </section>
          ))}
      </div>
    </div>
  );
}
