import Link from "next/link";
import { DraftCard } from "@/components/DraftCard";
import { listDrafts } from "@/lib/drafts";
import { targetTitle } from "@/lib/queries";
import type { DraftStatus } from "@/lib/types";

export const dynamic = "force-dynamic";

const TABS: { id: DraftStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "draft", label: "Drafts" },
  { id: "in_review", label: "In review" },
  { id: "approved", label: "Approved" },
  { id: "scheduled", label: "Scheduled" },
  { id: "published", label: "Published" },
];

export default async function DraftsPage({ searchParams }: { searchParams: Promise<{ status?: string; focus?: string }> }) {
  const sp = await searchParams;
  const status = TABS.find((t) => t.id === sp.status)?.id ?? "all";
  const all = listDrafts();
  const drafts = status === "all" ? all : all.filter((d) => d.status === status);
  const count = (s: string) => (s === "all" ? all.length : all.filter((d) => d.status === s).length);
  const scheduled = all
    .filter((d) => d.status === "scheduled" && d.scheduled_at)
    .sort((a, b) => a.scheduled_at!.localeCompare(b.scheduled_at!));
  const byDay = new Map<string, typeof scheduled>();
  for (const d of scheduled) {
    const day = new Date(d.scheduled_at!).toDateString();
    byDay.set(day, [...(byDay.get(day) ?? []), d]);
  }
  const titles = new Map<string, string>();
  for (const d of all) {
    const key = `${d.target_kind}:${d.target_id}`;
    if (!titles.has(key)) titles.set(key, targetTitle(d.target_kind, d.target_id) ?? "(removed)");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
      <div className="min-w-0 space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Drafts & Queue</h1>
          <p className="text-sm text-muted">Draft → In review → Approved → Scheduled → Published. Blocked drafts can&apos;t move forward until they pass the fact-check.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <Link key={t.id} href={`/drafts?status=${t.id}`} className={`chip px-3 py-1 text-sm ${status === t.id ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
              {t.label} ({count(t.id)})
            </Link>
          ))}
        </div>
        {drafts.length === 0 && <p className="card p-6 text-sm text-muted">Nothing here. Open a story or subject to generate drafts.</p>}
        {drafts.map((d) => (
          <DraftCard
            key={d.id}
            draft={d}
            context={
              <Link href={`/${d.target_kind === "story" ? "story" : "subjects"}/${d.target_id}?tab=drafts`} className="mb-2 block text-xs text-brand">
                {d.target_kind === "story" ? "Story" : "Subject"}: {titles.get(`${d.target_kind}:${d.target_id}`)}
              </Link>
            }
          />
        ))}
      </div>
      <aside className="card h-fit p-4">
        <h2 className="mb-3 font-semibold">Content calendar</h2>
        {byDay.size === 0 && <p className="text-sm text-muted">No scheduled posts. Approve a draft, then schedule it.</p>}
        {[...byDay.entries()].map(([day, items]) => (
          <div key={day} className="mb-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted">{day}</div>
            <ul className="mt-1 space-y-1">
              {items.map((d) => (
                <li key={d.id} className="text-sm">
                  <a href={`#draft-${d.id}`} className="hover:text-brand">
                    {new Date(d.scheduled_at!).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {d.platform} ·{" "}
                    {d.text.slice(0, 40)}…
                  </a>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <p className="mt-4 text-xs text-muted">
          Code Blue alerts you when a scheduled post is due; post it with Copy or Open in platform. Direct auto-publishing needs each platform&apos;s
          API app (see README).
        </p>
      </aside>
    </div>
  );
}
