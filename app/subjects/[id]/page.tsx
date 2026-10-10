import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/ActionButton";
import { VolumeChart } from "@/components/VolumeChart";
import { Workbench } from "@/components/Workbench";
import { formatDate, timeAgo } from "@/lib/format";
import { getSubject } from "@/lib/queries";
import { sensitivityFlags, truncate } from "@/lib/text";
import { workbenchProps } from "@/lib/workbench";

export const dynamic = "force-dynamic";

const VIEWS = {
  today: { label: "Last 24h", maxH: 24, minH: 0 },
  week: { label: "This week", maxH: 24 * 7, minH: 0 },
  months: { label: "Last 3 months", maxH: 24 * 92, minH: 0 },
  archive: { label: "Archive (older)", maxH: Infinity, minH: 24 * 92 },
  all: { label: "Everything", maxH: Infinity, minH: 0 },
} as const;

export default async function SubjectPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; view?: keyof typeof VIEWS }>;
}) {
  const id = Number((await params).id);
  const sp = await searchParams;
  const data = Number.isInteger(id) ? getSubject(id) : null;
  if (!data) notFound();
  const { subject, articles, groups, background, volume } = data;
  const view = sp.view && sp.view in VIEWS ? sp.view : "week";
  const range = VIEWS[view];
  const age = (iso: string) => (Date.now() - Date.parse(iso)) / 3_600_000;
  const visible = groups
    .map((g) => g.filter((a) => age(a.published_at) <= range.maxH && age(a.published_at) >= range.minH))
    .filter((g) => g.length > 0)
    .sort((a, b) => b.length - a.length || b[0].published_at.localeCompare(a[0].published_at))
    .slice(0, 60);
  const counts = Object.fromEntries(
    Object.entries(VIEWS).map(([k, r]) => [k, articles.filter((a) => age(a.published_at) <= r.maxH && age(a.published_at) >= r.minH).length]),
  );
  const oldest = articles.at(-1)?.published_at;
  const sensitive = sensitivityFlags(articles.slice(0, 15).map((a) => a.title).join(". "));

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href="/subjects" className="text-sm text-brand">
              ← My Subjects
            </Link>
            <h1 className="mt-1 text-2xl font-bold">{subject.name}</h1>
            <p className="text-sm text-muted">
              {articles.length} articles{oldest ? ` going back to ${formatDate(oldest)}` : ""} · refreshed {timeAgo(subject.last_refreshed)}
              {subject.daily ? " · refreshes every morning" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ActionButton url={`/api/subjects/${id}`} label="Refresh now" busyLabel="Searching every source…" variant="primary" />
            <ActionButton url={`/api/subjects/${id}`} method="PATCH" body={{ daily: !subject.daily }} label={subject.daily ? "Pause daily refresh" : "Refresh daily"} />
            <ActionButton url={`/api/subjects/${id}`} method="DELETE" label="Remove" confirm={`Stop following "${subject.name}"?`} redirect="/subjects" />
          </div>
        </div>

        <Workbench {...workbenchProps("subject", id, sp.tab, articles.slice(0, 200), sensitive)} />
      </div>

      <aside className="space-y-4">
        {background && (
          <div className="card p-4">
            <h2 className="font-semibold">Background & history</h2>
            <p className="text-xs text-muted">{background.description}</p>
            <p className="mt-2 text-sm leading-relaxed">{truncate(background.extract, 900)}</p>
            <a href={background.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-brand">
              Wikipedia: {background.title} →
            </a>
          </div>
        )}
        {volume.length > 1 && (
          <div className="card p-4">
            <h2 className="mb-2 font-semibold">Coverage over 3 months</h2>
            <VolumeChart points={volume} />
          </div>
        )}
        <div className="card p-4">
          <h2 className="mb-2 font-semibold">All coverage</h2>
          <div className="mb-3 flex flex-wrap gap-1">
            {(Object.keys(VIEWS) as (keyof typeof VIEWS)[]).map((k) => (
              <Link key={k} href={`/subjects/${id}?view=${k}`} className={`chip px-2 py-1 ${view === k ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
                {VIEWS[k].label} ({counts[k]})
              </Link>
            ))}
          </div>
          {visible.length === 0 && <p className="text-sm text-muted">Nothing in this range.</p>}
          <ul className="space-y-3">
            {visible.map((g) => {
              const lead = g[0];
              return (
                <li key={lead.id}>
                  <a href={lead.url} target="_blank" rel="noreferrer" className="text-sm font-medium hover:text-brand">
                    {lead.title}
                  </a>
                  <div className="text-xs text-muted">
                    {lead.source_name} · {formatDate(lead.published_at)}
                    {g.length > 1 && ` · +${g.length - 1} more: ${[...new Set(g.slice(1).map((a) => a.source_name))].slice(0, 3).join(", ")}`}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>
    </div>
  );
}
