import Link from "next/link";
import { ActionButton } from "@/components/ActionButton";
import { StoryCard } from "@/components/StoryCard";
import { storyFeed } from "@/lib/queries";
import { TOPICS, topicById } from "@/lib/topics";

export const dynamic = "force-dynamic";

export default async function FeedPage({ searchParams }: { searchParams: Promise<{ topic?: string; hours?: string }> }) {
  const sp = await searchParams;
  const topic = sp.topic && topicById(sp.topic) ? sp.topic : undefined;
  const hours = Math.min(Math.max(Number(sp.hours) || 36, 1), 168);
  const stories = storyFeed({ topic, hours, limit: 60 });

  const href = (t?: string, h = hours) => `/feed?${new URLSearchParams({ ...(t ? { topic: t } : {}), hours: String(h) })}`;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Story Feed</h1>
          <p className="text-sm text-muted">Clustered stories ranked by trend score, freshness and fit to your keywords. One card = one event, N sources.</p>
        </div>
        <ActionButton url="/api/refresh" body={{ scope: "topics" }} label="Pull latest news" busyLabel="Pulling feeds…" variant="primary" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Link href={href()} className={`chip px-3 py-1 text-sm ${!topic ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
          All topics
        </Link>
        {TOPICS.map((t) => (
          <Link key={t.id} href={href(t.id)} className={`chip px-3 py-1 text-sm ${topic === t.id ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
            {t.label}
          </Link>
        ))}
        <span className="mx-1 self-center text-xs text-muted">Window:</span>
        {[6, 24, 36, 72].map((h) => (
          <Link key={h} href={href(topic, h)} className={`chip px-3 py-1 text-sm ${hours === h ? "bg-brand-soft text-brand" : "bg-surface-2 text-muted"}`}>
            {h}h
          </Link>
        ))}
      </div>
      {stories.length === 0 ? (
        <div className="card p-6 text-sm text-muted">No stories in this window yet. Pull the latest news or widen the window.</div>
      ) : (
        <div className="space-y-3">
          {stories.map((s) => (
            <StoryCard key={s.id} story={s} showTopic={!topic} />
          ))}
        </div>
      )}
    </div>
  );
}
