import { notFound } from "next/navigation";
import Link from "next/link";
import { HeatBadge, SensitiveBadge, StatusBadge } from "@/components/Badges";
import { Workbench } from "@/components/Workbench";
import { formatDate, timeAgo } from "@/lib/format";
import { getStory } from "@/lib/queries";
import { topicById } from "@/lib/topics";
import { workbenchProps } from "@/lib/workbench";

export const dynamic = "force-dynamic";

export default async function StoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const id = Number((await params).id);
  const { tab } = await searchParams;
  const data = Number.isInteger(id) ? getStory(id) : null;
  if (!data) notFound();
  const { story, articles, entities, sensitivity } = data;
  const heat = story.trend_score >= 25 ? "hot" : story.trend_score >= 14 ? "warm" : "mild";

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 space-y-4">
        <div>
          <Link href={`/feed?topic=${story.topic}`} className="text-sm text-brand">
            ← {topicById(story.topic)?.label ?? story.topic}
          </Link>
          <h1 className="mt-1 text-2xl font-bold leading-tight">{story.headline}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted">
            <HeatBadge heat={heat} score={story.trend_score} />
            <StatusBadge status={story.status} />
            <SensitiveBadge flags={sensitivity} />
            <span>
              {story.source_count} sources · {story.article_count} reports · first seen {timeAgo(story.first_seen)}
            </span>
          </div>
        </div>
        <Workbench {...workbenchProps("story", id, tab, articles, sensitivity)} />
      </div>

      <aside className="space-y-4">
        <div className="card p-4">
          <h2 className="mb-3 font-semibold">Sources ({articles.length})</h2>
          <ul className="space-y-3">
            {articles.map((a) => (
              <li key={a.id}>
                <a href={a.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-brand">
                  {a.title}
                </a>
                <div className="text-xs text-muted">
                  {a.source_name} · {formatDate(a.published_at)} · {timeAgo(a.published_at)}
                </div>
              </li>
            ))}
          </ul>
        </div>
        {entities.length > 0 && (
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Named in coverage</h2>
            <div className="flex flex-wrap gap-2">
              {entities.map((e) => (
                <Link key={e} href={`/subjects?new=${encodeURIComponent(e)}`} className="chip bg-surface-2 px-2 py-1 text-ink hover:text-brand" title="Follow as a subject">
                  {e}
                </Link>
              ))}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
