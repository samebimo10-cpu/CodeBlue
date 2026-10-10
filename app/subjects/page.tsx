import Link from "next/link";
import { NewSubjectForm } from "@/components/NewSubjectForm";
import { timeAgo } from "@/lib/format";
import { listSubjects } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function SubjectsPage({ searchParams }: { searchParams: Promise<{ new?: string }> }) {
  const sp = await searchParams;
  const subjects = listSubjects();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">My Subjects</h1>
        <p className="text-sm text-muted">
          Follow any subject you write on. Code Blue pulls today&apos;s coverage (Google News, NewsData), the last three months (GDELT), the archive
          back to 1999 (The Guardian, with a key) and the long-run background (Wikipedia), then refreshes it every morning.
        </p>
      </div>
      <NewSubjectForm initial={sp.new} />
      {subjects.length === 0 ? (
        <p className="text-sm text-muted">No subjects yet. Add the first thing you want to write about.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <Link key={s.id} href={`/subjects/${s.id}`} className="card p-4 hover:border-brand">
              <div className="flex items-start justify-between gap-2">
                <div className="font-semibold">{s.name}</div>
                {s.daily ? <span className="chip bg-ok-soft text-ok">Daily</span> : <span className="chip bg-surface-2 text-muted">Paused</span>}
              </div>
              {s.query !== s.name && <div className="mt-0.5 text-xs text-muted">Searching: {s.query}</div>}
              <div className="mt-2 text-xs text-muted">
                {s.article_count} articles · latest {timeAgo(s.latest)} · refreshed {timeAgo(s.last_refreshed)}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
