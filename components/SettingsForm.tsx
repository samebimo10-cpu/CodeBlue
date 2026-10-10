"use client";
import { useState } from "react";
import type { Settings } from "@/lib/settings";
import { PLATFORMS, TONES } from "@/lib/platforms";
import type { Platform, Tone } from "@/lib/types";

const list = (s: string) => s.split(/[\n,]/).map((x) => x.trim()).filter(Boolean);

export function SettingsForm({ initial, topics }: { initial: Settings; topics: { id: string; label: string }[] }) {
  const [s, setS] = useState(initial);
  const [feeds, setFeeds] = useState(initial.customFeeds.map((f) => `${f.topic} | ${f.name} | ${f.url}`).join("\n"));
  const [saved, setSaved] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((cur) => ({ ...cur, [k]: v }));
  const toggle = <T,>(arr: T[], v: T) => (arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v]);

  async function save() {
    setError(null);
    const customFeeds = feeds
      .split("\n")
      .map((l) => l.split("|").map((x) => x.trim()))
      .filter((p) => p.length === 3 && p[2].startsWith("http"))
      .map(([topic, name, url]) => ({ topic, name, url })) as Settings["customFeeds"];
    const res = await fetch("/api/settings", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...s, customFeeds }) });
    if (!res.ok) return setError((await res.json()).error);
    setSaved(new Date().toLocaleTimeString());
  }

  return (
    <div className="space-y-6">
      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Coverage</h2>
        <div>
          <span className="label">Topics shown first in your daily coverage</span>
          <div className="flex flex-wrap gap-2">
            {topics.map((t) => (
              <button
                key={t.id}
                onClick={() => set("followedTopics", toggle(s.followedTopics, t.id as Settings["followedTopics"][number]))}
                className={`chip px-3 py-1 text-sm ${s.followedTopics.includes(t.id as never) ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <div>
            <label className="label">Keywords that boost stories</label>
            <textarea className="input" rows={4} defaultValue={s.keywords.join("\n")} onChange={(e) => set("keywords", list(e.target.value))} placeholder={"Naira\nfintech\nAfCFTA"} />
          </div>
          <div>
            <label className="label">Hide stories containing</label>
            <textarea className="input" rows={4} defaultValue={s.blockedKeywords.join("\n")} onChange={(e) => set("blockedKeywords", list(e.target.value))} />
          </div>
          <div>
            <label className="label">Blocked source domains</label>
            <textarea className="input" rows={4} defaultValue={s.blockedSources.join("\n")} onChange={(e) => set("blockedSources", list(e.target.value))} placeholder="example.com" />
          </div>
        </div>
        <div>
          <label className="label">Extra RSS feeds (one per line: topic | name | url)</label>
          <textarea className="input font-mono text-xs" rows={4} value={feeds} onChange={(e) => setFeeds(e.target.value)} placeholder="nigeria | BusinessDay | https://businessday.ng/feed/" />
          <p className="mt-1 text-xs text-muted">Topic ids: {topics.map((t) => t.id).join(", ")}</p>
        </div>
      </section>

      <section className="card space-y-4 p-5">
        <h2 className="text-lg font-semibold">Writing</h2>
        <div>
          <span className="label">Default platforms</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(PLATFORMS) as Platform[]).map((p) => (
              <button key={p} onClick={() => set("platforms", toggle(s.platforms, p))} className={`chip px-3 py-1 text-sm ${s.platforms.includes(p) ? "bg-brand text-brand-ink" : "bg-surface-2 text-muted"}`}>
                {PLATFORMS[p].label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <label className="label">Default tone</label>
            <select className="input" value={s.defaultTone} onChange={(e) => set("defaultTone", e.target.value as Tone)}>
              {Object.keys(TONES).map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Language</label>
            <input className="input" value={s.language} onChange={(e) => set("language", e.target.value)} placeholder="English, Pidgin, French…" />
          </div>
          <div>
            <label className="label">Emoji</label>
            <select className="input" value={s.emojiLevel} onChange={(e) => set("emojiLevel", e.target.value as Settings["emojiLevel"])}>
              <option value="none">None</option>
              <option value="light">Light</option>
              <option value="heavy">Heavy</option>
            </select>
          </div>
          <div>
            <label className="label">Hashtags (max)</label>
            <input type="number" min={0} max={10} className="input" value={s.hashtagCount} onChange={(e) => set("hashtagCount", Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="label">Call to action (optional)</label>
          <input className="input" value={s.callToAction} onChange={(e) => set("callToAction", e.target.value)} placeholder="Follow for daily updates" />
        </div>
        <div>
          <label className="label">Brand voice: paste 5-10 of your past posts</label>
          <textarea className="input" rows={6} value={s.brandVoice} onChange={(e) => set("brandVoice", e.target.value)} />
          <p className="mt-1 text-xs text-muted">Your own written takes are added automatically, so drafts sound more like you over time.</p>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={s.aiDisclosure} onChange={(e) => set("aiDisclosure", e.target.checked)} />
          Add an &ldquo;AI-assisted&rdquo; tag to drafts
        </label>
      </section>

      <div className="flex items-center gap-3">
        <button className="btn-primary" onClick={save}>
          Save settings
        </button>
        {saved && <span className="text-sm text-ok">Saved at {saved}</span>}
        {error && <span className="text-sm text-hot">{error}</span>}
      </div>
    </div>
  );
}
