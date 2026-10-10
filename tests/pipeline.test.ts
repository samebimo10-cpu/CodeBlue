import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Run the whole pipeline offline: no API key, fetch served from fixtures.
delete process.env.ANTHROPIC_API_KEY;
delete process.env.ANTHROPIC_AUTH_TOKEN;

const { resetDbForTests, db } = await import("@/lib/db");
const { ingestTopic, createSubject, ingestSubject } = await import("@/lib/ingest");
const { storyFeed, getSubject } = await import("@/lib/queries");
const { generateBriefing } = await import("@/lib/briefing");
const drafts = await import("@/lib/drafts");
const { buildDigest } = await import("@/lib/digest");
const { saveSettings } = await import("@/lib/settings");

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toUTCString();

function rss(items: { title: string; link: string; h: number; desc?: string; src?: [string, string] }[]) {
  return `<?xml version="1.0"?><rss version="2.0"><channel><title>Feed</title>${items
    .map(
      (i) =>
        `<item><title>${i.title}</title><link>${i.link}</link><pubDate>${hoursAgo(i.h)}</pubDate><description>${i.desc ?? ""}</description>${
          i.src ? `<source url="${i.src[1]}">${i.src[0]}</source>` : ""
        }</item>`,
    )
    .join("")}</channel></rss>`;
}

const RAIL_DESC = "The Lagos State House of Assembly approved a 27 kilometre extension of the Blue Line rail on Thursday, the commissioner said.";

function mockFetch(url: string): Response {
  const u = String(url);
  if (u.includes("news.google.com")) {
    return new Response(
      rss([
        { title: "Lagos approves Blue Line rail extension - Premium Times", link: "https://news.google.com/a1", h: 2, desc: RAIL_DESC, src: ["Premium Times", "https://www.premiumtimesng.com"] },
        { title: "Lagos Blue Line rail extension approved by assembly - Punch", link: "https://news.google.com/a2", h: 1, desc: "Lawmakers approved the Blue Line extension, Punch reports.", src: ["Punch", "https://punchng.com"] },
        { title: "Gunmen kill 12 in attack on Zamfara village - Channels TV", link: "https://news.google.com/a3", h: 3, desc: "Police confirmed 12 people were killed.", src: ["Channels TV", "https://www.channelstv.com"] },
      ]),
    );
  }
  if (u.includes("api.gdeltproject.org") && u.includes("timelinevol")) {
    return Response.json({ timeline: [{ data: [{ date: "20261001T000000Z", value: 0.2 }, { date: "20261002T000000Z", value: 0.5 }] }] });
  }
  if (u.includes("api.gdeltproject.org")) {
    return Response.json({ articles: [{ url: "https://www.bbc.com/news/lagos-rail-2026", title: "Lagos rail project enters new phase", seendate: "20260815T090000Z", domain: "bbc.com", language: "English" }] });
  }
  if (u.includes("wikipedia.org") && u.includes("list=search")) return Response.json({ query: { search: [{ title: "Lagos Rail Mass Transit" }] } });
  if (u.includes("wikipedia.org")) {
    return Response.json({ query: { pages: { "1": { title: "Lagos Rail Mass Transit", description: "Urban rail system", extract: "The Lagos Rail Mass Transit is an urban rail system. The Blue Line opened in 2023." } } } });
  }
  // Publisher feeds: return an empty channel.
  return new Response(rss([]));
}

beforeEach(() => {
  resetDbForTests();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => mockFetch(url)));
});
afterEach(() => vi.unstubAllGlobals());

describe("topic ingestion", () => {
  it("clusters reports of one event into one story with N sources", async () => {
    const report = await ingestTopic({ id: "nigeria", label: "Nigeria", googleQuery: "Nigeria", feeds: [{ url: "https://punchng.com/feed/", name: "Punch", tier: "fast" }] });
    expect(report.inserted).toBe(3);
    const feed = storyFeed({ topic: "nigeria" });
    expect(feed).toHaveLength(2);
    const rail = feed.find((s) => s.headline.includes("Blue Line"))!;
    expect(rail.source_count).toBe(2);
    expect(rail.status).toBe("confirmed");
    const attack = feed.find((s) => s.headline.includes("Gunmen"))!;
    expect(attack.status).toBe("developing");
    expect(JSON.parse(attack.sensitivity)).toContain("deaths");
  });

  it("is idempotent and respects blocked sources", async () => {
    saveSettings({ blockedSources: ["punchng.com"] });
    const topic = { id: "nigeria" as const, label: "Nigeria", googleQuery: "Nigeria", feeds: [] };
    const first = await ingestTopic(topic);
    const second = await ingestTopic(topic);
    expect(first.inserted).toBe(2);
    expect(second.inserted).toBe(0);
  });

  it("builds a daily digest without an API key", async () => {
    await ingestTopic({ id: "nigeria", label: "Nigeria", googleQuery: "Nigeria", feeds: [] });
    const digest = await buildDigest("nigeria");
    expect(digest.items.length).toBe(2);
    expect(digest.model).toBeNull();
  });
});

describe("subjects, briefings and drafts", () => {
  it("researches a subject across sources and history", async () => {
    const id = createSubject("Lagos rail", "Lagos Blue Line rail");
    const r = await ingestSubject(id);
    expect(r.errors).toEqual([]);
    const data = getSubject(id)!;
    expect(data.articles.length).toBe(4); // 3 Google News + 1 GDELT archive item
    expect(data.background?.title).toBe("Lagos Rail Mass Transit");
    expect(data.volume).toHaveLength(2);
  });

  it("produces a sourced briefing and drafts that pass the integrity gate", async () => {
    const id = createSubject("Lagos rail", "Lagos Blue Line rail");
    await ingestSubject(id);
    const b = await generateBriefing("subject", id, "quick");
    expect(b.briefing.keyFacts.length).toBeGreaterThan(0);
    for (const f of b.briefing.keyFacts) expect(b.articleIds).toContain(f.articleId);

    const out = await drafts.generateDrafts({ kind: "subject", id, platforms: ["x", "instagram"], tone: "witty" });
    expect(out).toHaveLength(2);
    // Even without AI, generated drafts must clear their own integrity gate.
    for (const d of out) expect(d.fact_check_status).not.toBe("blocked");
    const ig = out.find((d) => d.platform === "instagram")!;
    expect(ig.text).toMatch(/link in bio/i);
    const x = out.find((d) => d.platform === "x")!;
    expect(x.text).toContain("http");
    // Sensitive coverage (the attack story is in the corpus) forces neutral tone and human review.
    expect(x.tone).toBe("neutral");
    expect(x.status).toBe("in_review");
  });

  it("blocks copied text and enforces the approval workflow", async () => {
    const id = createSubject("Lagos rail", "Lagos Blue Line rail");
    await ingestSubject(id);
    const [d] = await drafts.generateDrafts({ kind: "subject", id, platforms: ["facebook"], tone: "neutral" });
    const copied = await drafts.updateDraftText(d.id, `${RAIL_DESC} Big win for commuters.`);
    expect(copied.fact_check_status).toBe("blocked");
    expect(() => drafts.setDraftStatus(d.id, "approved")).toThrow(/integrity gate/);

    const fixed = await drafts.updateDraftText(d.id, "Lagos lawmakers have signed off on a 27 kilometre Blue Line extension, per Premium Times.");
    expect(fixed.fact_check_status).toBe("passed");
    expect(drafts.setDraftStatus(d.id, "approved").status).toBe("approved");
    expect(() => drafts.setDraftStatus(d.id, "scheduled")).toThrow(/Pick a time/);
    const when = new Date(Date.now() - 60_000).toISOString();
    expect(drafts.setDraftStatus(d.id, "scheduled", when).status).toBe("scheduled");
    expect(drafts.dueDrafts().map((x) => x.id)).toContain(d.id);
    expect(drafts.setDraftStatus(d.id, "published").published_at).toBeTruthy();
  });

  it("flags invented numbers in the writer's own take but leaves opinions alone", async () => {
    const id = createSubject("Lagos rail", "Lagos Blue Line rail");
    await ingestSubject(id);
    const ok = await drafts.checkTake("subject", id, "I think the 27 kilometre extension is overdue and the state should move faster.");
    expect(ok.status).toBe("passed");
    const bad = await drafts.checkTake("subject", id, "The 90 kilometre extension is overdue.");
    expect(bad.status).toBe("flagged");
    expect(bad.issues[0].claim).toContain("90");
  });
});

it("keeps an audit log of what was fetched", async () => {
  resetDbForTests();
  vi.stubGlobal("fetch", vi.fn(async (url: string) => mockFetch(url)));
  await ingestTopic({ id: "nigeria", label: "Nigeria", googleQuery: "Nigeria", feeds: [] });
  const n = (db().prepare("SELECT COUNT(*) AS n FROM audit_log WHERE kind = 'ingest.topic'").get() as { n: number }).n;
  expect(n).toBe(1);
});

void fs;
void path;
