"use client";
import { useMemo, useState } from "react";
import type { StoredBriefing } from "@/lib/briefing";
import type { DraftRow, Perspective } from "@/lib/drafts";
import { PLATFORMS, TONES } from "@/lib/platforms";
import type { AssistLevel, Depth, FactCheckIssue, Platform, TargetKind, Tone } from "@/lib/types";
import { BriefingView, type ArticleRef } from "./BriefingView";
import { DraftCard } from "./DraftCard";
import { timeAgo } from "@/lib/format";

type Tab = "briefing" | "take" | "drafts";

async function post<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const ASSIST: { id: AssistLevel; label: string; help: string }[] = [
  { id: "self", label: "Write it myself", help: "Plain editor. Code Blue only fact-checks and formats." },
  { id: "polish", label: "Polish", help: "Fixes grammar and tightens wording. Keeps your words and opinion." },
  { id: "shape", label: "Shape", help: "Turns your notes into platform drafts that carry your stance, nothing added." },
];

export function Workbench(props: {
  kind: TargetKind;
  id: number;
  initialTab: Tab;
  briefing: StoredBriefing | null;
  articles: ArticleRef[];
  perspective: Perspective;
  drafts: DraftRow[];
  defaultPlatforms: Platform[];
  defaultTone: Tone;
  aiOn: boolean;
  sensitive: string[];
}) {
  const [tab, setTab] = useState<Tab>(props.initialTab);
  const [briefing, setBriefing] = useState(props.briefing);
  const [depth, setDepth] = useState<Depth>(props.briefing?.depth ?? "standard");
  const [drafts, setDrafts] = useState(props.drafts);
  const [platforms, setPlatforms] = useState<Platform[]>(props.defaultPlatforms);
  const [tone, setTone] = useState<Tone>(props.defaultTone);
  const [length, setLength] = useState<"short" | "medium" | "long">("medium");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Perspective state
  const [notes, setNotes] = useState(props.perspective.notes);
  const [pinned, setPinned] = useState<string[]>(props.perspective.pinned);
  const [assist, setAssist] = useState<AssistLevel>(props.perspective.assist_level);
  const [take, setTake] = useState(props.perspective.final_text);
  const [angles, setAngles] = useState<string[]>([]);
  const [check, setCheck] = useState<{ status: string; issues: FactCheckIssue[] } | null>(null);
  const [polishNotes, setPolishNotes] = useState<string[]>([]);
  const [savedAt, setSavedAt] = useState(props.perspective.updated_at);

  const articleMap = useMemo(() => new Map(props.articles.map((a) => [a.id, a])), [props.articles]);
  const base = { kind: props.kind, id: props.id };

  async function run<T>(label: string, fn: () => Promise<T>): Promise<T | undefined> {
    setBusy(label);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const genBriefing = (fresh: boolean) =>
    run("briefing", async () => setBriefing(await post<StoredBriefing>("/api/briefing", { ...base, depth, fresh })));

  const genDrafts = (stance?: string) =>
    run("drafts", async () => {
      const res = await post<{ drafts: DraftRow[] }>("/api/drafts", { ...base, platforms, tone, length, stance, pinned: stance ? pinned : undefined });
      setDrafts((d) => [...res.drafts, ...d]);
      setTab("drafts");
    });

  const savePerspective = () =>
    run("save", async () => {
      const p = await post<Perspective>("/api/perspective", { ...base, action: "save", notes, pinned, assist, text: take });
      setSavedAt(p.updated_at);
    });

  const togglePin = (factId: string) => setPinned((p) => (p.includes(factId) ? p.filter((x) => x !== factId) : [...p, factId]));
  const pinnedFacts = briefing?.briefing.keyFacts.filter((f) => pinned.includes(f.id)) ?? [];

  const PlatformPicker = (
    <div>
      <span className="label">Platforms</span>
      <div className="flex flex-wrap gap-2">
        {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
          <label key={p} className={`chip cursor-pointer px-3 py-1 text-sm ${platforms.includes(p) ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
            <input
              type="checkbox"
              className="sr-only"
              checked={platforms.includes(p)}
              onChange={() => setPlatforms((cur) => (cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]))}
            />
            {PLATFORMS[p].label}
          </label>
        ))}
      </div>
    </div>
  );

  return (
    <div className="card">
      <div className="flex gap-1 border-b border-line p-2">
        {(
          [
            ["briefing", "Story Briefing"],
            ["take", "Write my take"],
            ["drafts", `Drafts (${drafts.length})`],
          ] as [Tab, string][]
        ).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t ? "bg-brand-soft text-brand" : "text-muted hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>

      <div className="p-4">
        {!props.aiOn && (
          <p className="mb-3 rounded-lg bg-warn-soft p-2 text-xs text-warm">
            AI is off. Briefings and drafts use extractive summaries and templates. Add ANTHROPIC_API_KEY to .env for full AI briefings, writing and fact-checks.
          </p>
        )}
        {props.sensitive.length > 0 && (
          <p className="mb-3 rounded-lg bg-bad-soft p-2 text-xs text-hot">
            Sensitive topic ({props.sensitive.join(", ")}): drafts use a neutral tone and need your approval before they can be scheduled.
          </p>
        )}
        {error && <p className="mb-3 rounded-lg bg-bad-soft p-2 text-sm text-hot">{error}</p>}

        {tab === "briefing" && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-2">
              <div>
                <span className="label">Depth</span>
                <div className="flex gap-1">
                  {(["quick", "standard", "deep"] as Depth[]).map((d) => (
                    <button key={d} onClick={() => setDepth(d)} className={`btn ${depth === d ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
                      {d === "quick" ? "Quick (1 min)" : d === "standard" ? "Standard" : "Deep dive"}
                    </button>
                  ))}
                </div>
              </div>
              <button className="btn-primary" disabled={busy !== null} onClick={() => genBriefing(false)}>
                {busy === "briefing" ? "Researching… (can take a minute)" : briefing ? "Build briefing at this depth" : "Brief me"}
              </button>
              {briefing && (
                <button className="btn-ghost" disabled={busy !== null} onClick={() => genBriefing(true)}>
                  Regenerate
                </button>
              )}
            </div>
            {briefing ? (
              <>
                <p className="text-xs text-muted">
                  {briefing.depth} briefing from {briefing.articleIds.length} articles · {timeAgo(briefing.generatedAt)} ·{" "}
                  {briefing.model ? "AI-written, every fact linked to its source" : "extractive"}
                </p>
                <BriefingView briefing={briefing.briefing} articles={articleMap} pinned={pinned} onTogglePin={togglePin} />
                <div className="flex gap-2 border-t border-line pt-4">
                  <button className="btn-primary" onClick={() => setTab("take")}>
                    Write my take ({pinned.length} pinned)
                  </button>
                  <button className="btn-ghost" onClick={() => setTab("drafts")}>
                    Quick drafts
                  </button>
                </div>
              </>
            ) : (
              <p className="text-sm text-muted">
                A Story Briefing gives you the bottom line, key facts linked to their sources, a timeline, who&apos;s involved, how outlets cover it
                differently, numbers, what to watch and the unanswered questions.
              </p>
            )}
          </div>
        )}

        {tab === "take" && (
          <div className="grid gap-5 lg:grid-cols-[1fr_1.2fr]">
            <div className="space-y-4">
              <div>
                <span className="label">Pinned facts ({pinnedFacts.length})</span>
                {pinnedFacts.length === 0 ? (
                  <p className="text-sm text-muted">
                    {briefing ? "Pin facts from the briefing to keep them beside you." : "Build a briefing first, then pin the facts you want to use."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {pinnedFacts.map((f) => (
                      <li key={f.id} className="rounded-lg bg-surface-2 p-2 text-sm">
                        {f.claim}
                        <div className="text-xs text-brand">
                          {articleMap.get(f.articleId)?.source} · {articleMap.get(f.articleId)?.date}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div>
                <div className="flex items-center justify-between">
                  <span className="label">Angle ideas</span>
                  <button className="btn-ghost px-2 py-0.5 text-xs" disabled={busy !== null} onClick={() => run("angles", async () => setAngles((await post<{ questions: string[] }>("/api/perspective", { ...base, action: "angles" })).questions))}>
                    {busy === "angles" ? "Thinking…" : "Suggest questions"}
                  </button>
                </div>
                {angles.length > 0 && (
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {angles.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                )}
                <p className="mt-1 text-xs text-muted">Questions only. The opinion is always yours.</p>
              </div>
              {briefing && briefing.briefing.gaps.length > 0 && (
                <div>
                  <span className="label">Unanswered questions</span>
                  <ul className="list-disc space-y-1 pl-5 text-sm">
                    {briefing.briefing.gaps.map((g) => (
                      <li key={g}>{g}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            <div className="space-y-4">
              <div>
                <span className="label">Assist level</span>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ASSIST.map((a) => (
                    <button key={a.id} onClick={() => setAssist(a.id)} className={`rounded-lg border p-2 text-left ${assist === a.id ? "border-brand bg-brand-soft" : "border-line"}`}>
                      <div className="text-sm font-semibold">{a.label}</div>
                      <div className="text-xs text-muted">{a.help}</div>
                    </button>
                  ))}
                </div>
              </div>

              {assist === "shape" ? (
                <div>
                  <span className="label">Your notes and stance (bullets, any language or mix)</span>
                  <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={8} className="input" placeholder="- My view: ...&#10;- Why: ...&#10;- What I want readers to ask: ..." />
                </div>
              ) : (
                <div>
                  <span className="label">Your take</span>
                  <textarea value={take} onChange={(e) => setTake(e.target.value)} rows={10} className="input leading-relaxed" placeholder="Write your view. Facts get checked against the sources; opinions are left alone." />
                </div>
              )}

              {check && (
                <div className="rounded-lg bg-surface-2 p-3 text-sm">
                  <div className="font-semibold">
                    Fact check: {check.status === "passed" ? "no unsupported facts found" : check.status === "blocked" ? "blocked" : "some claims need sources"}
                  </div>
                  {check.issues.map((x, i) => (
                    <div key={i} className="mt-1 text-xs">
                      <span className={x.verdict === "contradicted" ? "font-semibold text-hot" : "font-semibold text-warm"}>{x.verdict}</span>: {x.claim} — {x.note}
                    </div>
                  ))}
                </div>
              )}
              {polishNotes.length > 0 && (
                <ul className="list-disc pl-5 text-xs text-muted">
                  {polishNotes.map((n) => (
                    <li key={n}>{n}</li>
                  ))}
                </ul>
              )}

              {PlatformPicker}

              <div className="flex flex-wrap gap-2">
                {assist === "polish" && (
                  <button
                    className="btn-ghost"
                    disabled={busy !== null || !take.trim()}
                    onClick={() =>
                      run("polish", async () => {
                        const r = await post<{ text: string; changes: string[] }>("/api/perspective", { ...base, action: "polish", text: take });
                        setTake(r.text);
                        setPolishNotes(r.changes);
                      })
                    }
                  >
                    {busy === "polish" ? "Polishing…" : "Polish my text"}
                  </button>
                )}
                {assist !== "shape" && (
                  <>
                    <button className="btn-ghost" disabled={busy !== null || !take.trim()} onClick={() => run("check", async () => setCheck(await post("/api/perspective", { ...base, action: "check", text: take })))}>
                      {busy === "check" ? "Checking…" : "Fact check"}
                    </button>
                    <button
                      className="btn-primary"
                      disabled={busy !== null || !take.trim() || platforms.length === 0}
                      onClick={() =>
                        run("publish", async () => {
                          const r = await post<{ drafts: DraftRow[] }>("/api/perspective", { ...base, action: "publish", text: take, platforms });
                          setDrafts((d) => [...r.drafts, ...d]);
                          setTab("drafts");
                        })
                      }
                    >
                      {busy === "publish" ? "Formatting…" : "Format as drafts"}
                    </button>
                  </>
                )}
                {assist === "shape" && (
                  <button className="btn-primary" disabled={busy !== null || !notes.trim() || platforms.length === 0} onClick={async () => {
                      await savePerspective();
                      await genDrafts(notes);
                    }}>
                    {busy === "drafts" ? "Shaping…" : "Shape into drafts"}
                  </button>
                )}
                <button className="btn-ghost" disabled={busy !== null} onClick={savePerspective}>
                  {busy === "save" ? "Saving…" : "Save"}
                </button>
                {savedAt && <span className="self-center text-xs text-muted">Saved {timeAgo(savedAt)}</span>}
              </div>
            </div>
          </div>
        )}

        {tab === "drafts" && (
          <div className="space-y-4">
            <div className="grid gap-3 rounded-lg bg-surface-2 p-3">
              {PlatformPicker}
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <span className="label">Tone</span>
                  <select value={tone} onChange={(e) => setTone(e.target.value as Tone)} className="input w-auto">
                    {(Object.keys(TONES) as Tone[]).map((t) => (
                      <option key={t} value={t}>
                        {t[0].toUpperCase() + t.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <span className="label">Length</span>
                  <select value={length} onChange={(e) => setLength(e.target.value as typeof length)} className="input w-auto">
                    <option value="short">Short</option>
                    <option value="medium">Medium</option>
                    <option value="long">Long</option>
                  </select>
                </div>
                <button className="btn-primary" disabled={busy !== null || platforms.length === 0} onClick={() => genDrafts()}>
                  {busy === "drafts" ? "Writing & fact-checking…" : "Generate drafts"}
                </button>
              </div>
              <p className="text-xs text-muted">
                Drafts are written from a sourced fact sheet, never copied from one article. Each one is fact-checked and blocked if it shares 12+
                consecutive words with a source. A source credit and link are always added.
              </p>
            </div>
            {drafts.length === 0 && <p className="text-sm text-muted">No drafts yet.</p>}
            {drafts.map((d) => (
              <DraftCard key={d.id} draft={d} onDeleted={(id) => setDrafts((all) => all.filter((x) => x.id !== id))} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
