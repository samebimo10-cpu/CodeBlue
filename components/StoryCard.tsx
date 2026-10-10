import Link from "next/link";
import type { StoryCard as Card } from "@/lib/queries";
import { timeAgo } from "@/lib/format";
import { HeatBadge, SensitiveBadge, StatusBadge } from "./Badges";
import { topicById } from "@/lib/topics";

export function StoryCard({ story, showTopic }: { story: Card; showTopic?: boolean }) {
  const flags = JSON.parse(story.sensitivity) as string[];
  return (
    <article className="card flex gap-4 p-4">
      <div className="min-w-0 flex-1">
        <div className="mb-1.5 flex flex-wrap items-center gap-1.5">
          <HeatBadge heat={story.heat} score={story.trend_score} />
          <StatusBadge status={story.status} />
          <SensitiveBadge flags={flags} />
          {showTopic && <span className="chip bg-brand-soft text-brand">{topicById(story.topic)?.label ?? story.topic}</span>}
          {story.fit > 0 && <span className="chip bg-brand-soft text-brand">Matches your keywords</span>}
        </div>
        <Link href={`/story/${story.id}`} className="block text-base font-semibold leading-snug hover:text-brand">
          {story.headline}
        </Link>
        {story.lead.summary && <p className="mt-1 line-clamp-2 text-sm text-muted">{story.lead.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
          <span>
            {story.source_count} source{story.source_count === 1 ? "" : "s"}: {story.sources.slice(0, 3).join(", ")}
            {story.sources.length > 3 ? "…" : ""}
          </span>
          <span>First seen {timeAgo(story.first_seen)}</span>
          <span>Updated {timeAgo(story.last_seen)}</span>
        </div>
        <div className="mt-3 flex gap-2">
          <Link href={`/story/${story.id}?tab=briefing`} className="btn-ghost">
            Brief me
          </Link>
          <Link href={`/story/${story.id}?tab=drafts`} className="btn-ghost">
            Draft posts
          </Link>
          <Link href={`/story/${story.id}?tab=take`} className="btn-ghost">
            Write my take
          </Link>
        </div>
      </div>
      {story.lead.image_url && (
        // Publisher images are shown only as a link preview of their own article.
        <a href={story.lead.url} target="_blank" rel="noreferrer" className="hidden shrink-0 sm:block">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={story.lead.image_url} alt="" className="h-24 w-36 rounded-lg object-cover" loading="lazy" />
        </a>
      )}
    </article>
  );
}
