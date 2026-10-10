# Code Blue

Code Blue watches the news around the clock and does two jobs:

1. **Daily news coverage.** Every morning it writes a sourced roundup of the day's biggest stories across 12 standard topics: Top Stories, World, Politics, Business, Tech & AI, Science, Health, Sports, Entertainment, Nigeria, Africa, and Crypto & Markets.
2. **Your subjects.** For any subject you write on, it pulls today's coverage, the last three months, the archive and the long-run background. It builds a **Story Briefing** from all of that and helps you publish **your own take** as ready-to-post drafts for each platform.

Built from the NewsPulse product spec. Product name: Code Blue.

## Quick start

```bash
npm install
cp .env.example .env        # add ANTHROPIC_API_KEY (optional, but recommended)
npm run ingest              # one-off: pull all feeds, refresh subjects, build today's coverage
npm run dev                 # app on http://localhost:3000
npm run worker              # in a second terminal: keeps everything fresh around the clock
```

Production on your own server: `npm run build && npm run start:all`, which runs the app and the worker together.

Requires Node 20+. Data lives in one SQLite file (`data/codeblue.db`).

## Put it online (get your app link)

**Render (one click):**
1. Sign in at [render.com](https://render.com) with GitHub.
2. Choose **New → Blueprint** and pick this repo and branch. Render reads `render.yaml`.
3. When asked, fill in `ANTHROPIC_API_KEY` and **`CODEBLUE_PASSWORD`**. The password protects your app, and your API credit, from strangers. `GUARDIAN_API_KEY` and `NEWSDATA_API_KEY` are optional.
4. Click **Apply**. Your link appears at the top of the service page, e.g. `https://code-blue.onrender.com`. Log in as `admin` with your password.

The blueprint uses Render's Starter plan, because the news database needs a persistent disk. It runs the web app and the 24/7 news worker together, and it sets Google News to the Nigeria edition and the clock to Lagos time (6am daily coverage). Change `CODEBLUE_NEWS_GL`, `CODEBLUE_NEWS_HL` or `TZ` to switch.

**Railway / Fly.io / any Docker host:** deploy the included `Dockerfile`. Mount a volume at `/var/data` and set the same environment variables.

## Where the news comes from

| Source | Used for | Key |
| --- | --- | --- |
| Google News RSS | Topic sections and search across thousands of publishers | none |
| 30+ curated publisher RSS feeds (BBC, Guardian, NPR, Al Jazeera, CNBC, TechCrunch, Premium Times, Punch, Vanguard, Channels TV, CoinDesk…) | Topic coverage | none |
| Your own RSS feeds | Added in Settings | none |
| GDELT DOC 2.0 | Global coverage of a subject over the last 3 months, plus a coverage-volume chart | none |
| Wikipedia | Background and history for subjects | none |
| The Guardian Open Platform | Archive back to 1999 | `GUARDIAN_API_KEY` (free) |
| NewsData.io | 80k+ more sources, many of them African | `NEWSDATA_API_KEY` |

Code Blue does not crawl sites. It uses licensed APIs and public feeds, stores headlines and summaries only, and always links back to the publisher.

## How it works

```
worker (node-cron)
  ├─ every 5 min   poll top feeds ─┐
  ├─ every 30 min  poll all feeds ─┼─► store articles ─► cluster into stories ─► trend score ─► hot-story alerts
  ├─ 06:00 daily   refresh subjects (Google News 24h/7d/all, GDELT, Guardian, NewsData, Wikipedia)
  │                build the daily coverage per topic (Claude)
  └─ every minute  alert on scheduled posts that are due

app (Next.js)
  Today ─ Story Feed ─ Story / Subject workbench (Briefing · Write my take · Drafts) ─ Drafts & Queue ─ Settings
```

- **Clustering:** each new article joins the open story in its topic whose headline it matches, or starts a new story. One card is one event, with N sources.
- **Trend score:** combines source count, velocity (reports in the last 3 hours), recency decay and source credibility. Your keywords raise a story's rank; blocked words and sources hide it.
- **Status:** a story with fewer than two independent sources is labelled **Developing**.
- **Sensitive topics:** stories about deaths, violence, disasters, elections, health, crime or minors get a neutral tone and need your approval before posting.

### AI (Claude)

- **Story Briefing** (Quick / Standard / Deep dive): bottom line, key facts, timeline, who's involved, how outlets cover it, numbers, public reaction, what to watch, gaps (the questions nobody has answered yet) and related subjects to follow. Every key fact cites its article and a verbatim snippet. A fact the cited article doesn't support is dropped.
- **Drafts** are written from the fact sheet, never paraphrased from one article. Platforms: X and Threads (single post or thread), Facebook, Instagram (caption plus carousel text, "link in bio"), LinkedIn, TikTok/Reels/Shorts (video script), WhatsApp and Telegram. Tone presets are Neutral, Punchy, Explainer, Witty and Breaking. A source credit and link are always added.
- **Write my take** has three assist levels. *Write it myself*: Code Blue only fact-checks and formats. *Polish*: grammar and flow, keeping your words and stance. *Shape*: turns your notes into drafts that carry your stance and add nothing else. The *Angle ideas* button suggests questions only, never answers. Your written takes teach the brand voice.

Models: `CODEBLUE_MODEL` (default `claude-opus-5-5`) handles briefings, writing and fact-checks. `CODEBLUE_FAST_MODEL` (default `claude-haiku-5-5`) handles the bulk daily coverage. Responses are cached per input, so the same story is never paid for twice. Requests use structured outputs, handle refusals, and turn on Claude's server-side refusal fallback where the model supports it.

**Without an API key** the app still works. Coverage is extractive, briefings list sourced facts and a timeline, and drafts are short attributed quotes for you to edit.

### Integrity gates (hard-coded, not settings)

- **No copying:** a draft that shares 12 or more consecutive words with a source is **blocked**. Short quotes in quotation marks are exempt.
- **Grounding:** a number that doesn't appear in the sources is flagged.
- **AI fact-check pass:** a second Claude call compares every claim with the fact sheet. Contradictions block the draft. Opinions are left alone.
- **Edits are re-checked:** a blocked draft can't be approved, scheduled or published until it passes.
- **Audit log:** every fetch, generation and status change is recorded in `audit_log`.

### Workflow

Draft → In review → Approved → Scheduled → Published. The content calendar shows what's queued. "Best time" suggests the next good slot for each platform. When a post is due you get an alert, and you post it with **Copy** or **Open in X / Threads / Facebook / LinkedIn / WhatsApp / Telegram**.

## Not built yet (from the spec roadmap)

- **Direct auto-publishing:** OAuth apps for X, Meta, LinkedIn and TikTok, or an aggregator such as Ayrshare. Each platform needs its own developer app and review, so publishing today is copy or share-intent, which the spec lists as the always-available fallback.
- **Engagement analytics feedback, autopilot mode, team workspaces and roles, billing (Stripe/Paystack), email/WhatsApp alerts, image and quote cards, voice notes.**
- **Embedding-based clustering and Postgres + pgvector for scale.** The schema already mirrors the spec's data model, so moving off SQLite is mechanical.
- **Legal review:** the spec recommends a media lawyer review the attribution and image policy before a public launch, especially for EU and Nigerian markets.

## Development

```bash
npm test          # pipeline tests run fully offline (fetch mocked, no API key)
npm run typecheck
npm run build
```

| Path | What |
| --- | --- |
| `lib/sources/` | Connectors: RSS/Atom/RDF, Google News, GDELT, Guardian, NewsData, Wikipedia |
| `lib/ingest.ts` | Topic polling, subject research, dedupe, blocked sources |
| `lib/cluster.ts` | Story clustering and trend score |
| `lib/briefing.ts` | Fact sheets and Story Briefings, with grounding |
| `lib/drafts.ts` | Draft writing, integrity gates, Perspective mode, workflow |
| `lib/digest.ts` | Daily coverage per topic |
| `lib/jobs.ts`, `scripts/worker.ts` | Scheduling and alerts |
| `app/` | Pages and API routes |
