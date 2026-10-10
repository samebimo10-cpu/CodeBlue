"use client";
import { useState } from "react";
import type { DraftRow } from "@/lib/drafts";
import { overLimitParts, PLATFORMS, THREAD_SEPARATOR, weightedLength } from "@/lib/platforms";
import type { FactCheckIssue } from "@/lib/types";
import { FactCheckBadge } from "./Badges";
import { timeAgo } from "@/lib/format";
import { nextBestTime } from "@/lib/bestTime";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  in_review: "In review",
  approved: "Approved",
  scheduled: "Scheduled",
  published: "Published",
};

function shareUrl(d: DraftRow): string | null {
  const first = d.text.split(THREAD_SEPARATOR)[0];
  const t = encodeURIComponent(first);
  const u = encodeURIComponent(d.source_url ?? "");
  switch (d.platform) {
    case "x":
      return `https://twitter.com/intent/tweet?text=${t}`;
    case "threads":
      return `https://www.threads.net/intent/post?text=${t}`;
    case "facebook":
      return `https://www.facebook.com/sharer/sharer.php?u=${u}`;
    case "linkedin":
      return `https://www.linkedin.com/sharing/share-offsite/?url=${u}`;
    case "whatsapp":
      return `https://wa.me/?text=${t}`;
    case "telegram":
      return `https://t.me/share/url?url=${u}&text=${t}`;
    default:
      return null;
  }
}

const localInput = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600_000);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function DraftCard({ draft: initial, onDeleted, context }: { draft: DraftRow; onDeleted?: (id: number) => void; context?: React.ReactNode }) {
  const [draft, setDraft] = useState(initial);
  const [text, setText] = useState(initial.text);
  const [when, setWhen] = useState(localInput(initial.scheduled_at));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const spec = PLATFORMS[draft.platform];
  const issues = JSON.parse(draft.fact_check) as FactCheckIssue[];
  const dirty = text !== draft.text;
  const parts = spec.thread ? text.split(THREAD_SEPARATOR) : [text];
  const over = overLimitParts(text, draft.platform);
  const locked = draft.status === "published";

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/drafts/${draft.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setText(data.draft.text);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!confirm("Delete this draft?")) return;
    await fetch(`/api/drafts/${draft.id}`, { method: "DELETE" });
    onDeleted?.(draft.id);
  }

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  const share = shareUrl(draft);

  return (
    <div className="card p-4" id={`draft-${draft.id}`}>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="font-semibold">{spec.label}</span>
        <span className="chip bg-surface-2 text-muted">{draft.tone}</span>
        <span className="chip bg-brand-soft text-brand">{STATUS_LABEL[draft.status]}</span>
        <FactCheckBadge status={draft.fact_check_status} />
        {draft.needs_approval === 1 && <span className="chip bg-bad-soft text-hot">Sensitive: needs approval</span>}
        <span className="ml-auto text-xs text-muted">
          v{draft.version} · {timeAgo(draft.updated_at)}
        </span>
      </div>
      {context}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={locked}
        rows={Math.min(14, Math.max(4, text.split("\n").length + 1))}
        className="input font-[inherit] leading-relaxed"
      />
      <div className="mt-1 flex flex-wrap gap-3 text-xs text-muted">
        {parts.map((p, i) => (
          <span key={i} className={over.includes(i + 1) ? "font-semibold text-hot" : ""}>
            {parts.length > 1 ? `Part ${i + 1}: ` : ""}
            {weightedLength(p, spec)}/{spec.limit}
          </span>
        ))}
        {draft.similarity_score > 0 && <span>Longest shared run with a source: {draft.similarity_score} words</span>}
      </div>
      {issues.length > 0 && (
        <ul className="mt-2 space-y-1 rounded-lg bg-surface-2 p-2 text-xs">
          {issues.map((x, i) => (
            <li key={i}>
              <span className={x.verdict === "contradicted" ? "font-semibold text-hot" : "font-semibold text-warm"}>{x.verdict}</span>: {x.claim}
              {x.note ? ` — ${x.note}` : ""}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="mt-2 text-xs text-hot">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {dirty && !locked && (
          <button className="btn-primary" disabled={busy} onClick={() => patch({ text })}>
            {busy ? "Checking…" : "Save & re-check"}
          </button>
        )}
        <button className="btn-ghost" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
        {share && (
          <a className="btn-ghost" href={share} target="_blank" rel="noreferrer">
            Open in {spec.label}
          </a>
        )}
        {!locked && !dirty && (
          <>
            {draft.status === "draft" && (
              <button className="btn-ghost" disabled={busy} onClick={() => patch({ status: "in_review" })}>
                Send for review
              </button>
            )}
            {(draft.status === "draft" || draft.status === "in_review") && (
              <button className="btn-ghost" disabled={busy || draft.fact_check_status === "blocked"} onClick={() => patch({ status: "approved" })}>
                Approve
              </button>
            )}
            {(draft.status === "approved" || draft.status === "scheduled") && (
              <span className="inline-flex items-center gap-1">
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} className="input w-auto py-1" />
                <button className="btn-ghost" title="Suggest the next good slot for this platform" onClick={() => setWhen(localInput(nextBestTime(draft.platform).toISOString()))}>
                  Best time
                </button>
                <button className="btn-ghost" disabled={busy} onClick={() => patch({ status: "scheduled", scheduledAt: new Date(when).toISOString() })}>
                  {draft.status === "scheduled" ? "Reschedule" : "Schedule"}
                </button>
              </span>
            )}
            {(draft.status === "approved" || draft.status === "scheduled") && (
              <button className="btn-ghost" disabled={busy} onClick={() => patch({ status: "published" })}>
                Mark published
              </button>
            )}
          </>
        )}
        <button className="btn-ghost ml-auto text-hot" onClick={remove}>
          Delete
        </button>
      </div>
      {draft.status === "scheduled" && draft.scheduled_at && <p className="mt-2 text-xs text-muted">Due {new Date(draft.scheduled_at).toLocaleString()}</p>}
    </div>
  );
}
