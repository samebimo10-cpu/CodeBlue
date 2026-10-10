/**
 * Standard topics covered by the daily news coverage, and the feeds that back
 * each one. Every topic is fed by Google News (an aggregator of thousands of
 * outlets) plus a curated set of publisher RSS feeds. Users can add their own
 * feeds in Settings.
 */

export type TopicId =
  | "top"
  | "world"
  | "politics"
  | "business"
  | "technology"
  | "science"
  | "health"
  | "sports"
  | "entertainment"
  | "nigeria"
  | "africa"
  | "crypto";

export interface TopicFeed {
  url: string;
  name: string;
  /** "fast" feeds are polled every few minutes, "slow" ones on the long-tail cadence. */
  tier: "fast" | "slow";
}

export interface Topic {
  id: TopicId;
  label: string;
  /** Google News section id, or a search query when there is no section. */
  googleSection?: string;
  googleQuery?: string;
  feeds: TopicFeed[];
}

export const TOPICS: Topic[] = [
  {
    id: "top",
    label: "Top Stories",
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/rss.xml", name: "BBC News", tier: "fast" },
      { url: "https://feeds.npr.org/1001/rss.xml", name: "NPR", tier: "fast" },
      { url: "https://www.aljazeera.com/xml/rss/all.xml", name: "Al Jazeera", tier: "fast" },
    ],
  },
  {
    id: "world",
    label: "World",
    googleSection: "WORLD",
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/rss.xml", name: "BBC World", tier: "fast" },
      { url: "https://www.theguardian.com/world/rss", name: "The Guardian", tier: "fast" },
    ],
  },
  {
    id: "politics",
    label: "Politics",
    googleQuery: "politics OR election OR parliament OR senate",
    feeds: [
      { url: "https://feeds.npr.org/1014/rss.xml", name: "NPR Politics", tier: "slow" },
      { url: "https://rss.politico.com/politics-news.xml", name: "Politico", tier: "fast" },
      { url: "https://www.theguardian.com/politics/rss", name: "The Guardian", tier: "slow" },
    ],
  },
  {
    id: "business",
    label: "Business",
    googleSection: "BUSINESS",
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business", tier: "fast" },
      { url: "https://www.cnbc.com/id/100003114/device/rss/rss.html", name: "CNBC", tier: "fast" },
      { url: "https://www.theguardian.com/business/rss", name: "The Guardian", tier: "slow" },
    ],
  },
  {
    id: "technology",
    label: "Tech & AI",
    googleSection: "TECHNOLOGY",
    feeds: [
      { url: "https://techcrunch.com/feed/", name: "TechCrunch", tier: "fast" },
      { url: "https://www.theverge.com/rss/index.xml", name: "The Verge", tier: "fast" },
      { url: "https://feeds.arstechnica.com/arstechnica/index", name: "Ars Technica", tier: "slow" },
    ],
  },
  {
    id: "science",
    label: "Science",
    googleSection: "SCIENCE",
    feeds: [
      { url: "https://www.sciencedaily.com/rss/all.xml", name: "ScienceDaily", tier: "slow" },
      { url: "https://feeds.bbci.co.uk/news/science_and_environment/rss.xml", name: "BBC Science", tier: "slow" },
    ],
  },
  {
    id: "health",
    label: "Health",
    googleSection: "HEALTH",
    feeds: [
      { url: "https://www.statnews.com/feed/", name: "STAT", tier: "slow" },
      { url: "https://feeds.bbci.co.uk/news/health/rss.xml", name: "BBC Health", tier: "slow" },
    ],
  },
  {
    id: "sports",
    label: "Sports",
    googleSection: "SPORTS",
    feeds: [
      { url: "https://www.espn.com/espn/rss/news", name: "ESPN", tier: "fast" },
      { url: "https://feeds.bbci.co.uk/sport/rss.xml", name: "BBC Sport", tier: "fast" },
    ],
  },
  {
    id: "entertainment",
    label: "Entertainment",
    googleSection: "ENTERTAINMENT",
    feeds: [
      { url: "https://variety.com/feed/", name: "Variety", tier: "slow" },
      { url: "https://feeds.bbci.co.uk/news/entertainment_and_arts/rss.xml", name: "BBC Arts", tier: "slow" },
    ],
  },
  {
    id: "nigeria",
    label: "Nigeria",
    googleQuery: "Nigeria",
    feeds: [
      { url: "https://www.premiumtimesng.com/feed", name: "Premium Times", tier: "fast" },
      { url: "https://punchng.com/feed/", name: "Punch", tier: "fast" },
      { url: "https://www.vanguardngr.com/feed/", name: "Vanguard", tier: "fast" },
      { url: "https://www.thecable.ng/feed", name: "TheCable", tier: "slow" },
      { url: "https://www.channelstv.com/feed/", name: "Channels TV", tier: "fast" },
    ],
  },
  {
    id: "africa",
    label: "Africa",
    googleQuery: "Africa",
    feeds: [
      { url: "https://feeds.bbci.co.uk/news/world/africa/rss.xml", name: "BBC Africa", tier: "fast" },
      { url: "https://www.theguardian.com/world/africa/rss", name: "The Guardian Africa", tier: "slow" },
      { url: "https://allafrica.com/tools/headlines/rdf/latest/headlines.rdf", name: "AllAfrica", tier: "slow" },
    ],
  },
  {
    id: "crypto",
    label: "Crypto & Markets",
    googleQuery: "bitcoin OR crypto OR stablecoin",
    feeds: [
      { url: "https://www.coindesk.com/arc/outboundfeeds/rss/", name: "CoinDesk", tier: "fast" },
      { url: "https://cointelegraph.com/rss", name: "Cointelegraph", tier: "slow" },
    ],
  },
];

export const TOPIC_IDS = TOPICS.map((t) => t.id);

export function topicById(id: string): Topic | undefined {
  return TOPICS.find((t) => t.id === id);
}

/**
 * Source credibility weights (0-1). Unknown domains default to 0.55.
 * Used in trend scoring and to flag single-source stories.
 */
export const CREDIBILITY: Record<string, number> = {
  "reuters.com": 0.95,
  "apnews.com": 0.95,
  "bbc.co.uk": 0.9,
  "bbc.com": 0.9,
  "npr.org": 0.88,
  "theguardian.com": 0.87,
  "nytimes.com": 0.88,
  "washingtonpost.com": 0.86,
  "ft.com": 0.9,
  "bloomberg.com": 0.9,
  "wsj.com": 0.88,
  "economist.com": 0.88,
  "aljazeera.com": 0.82,
  "cnbc.com": 0.82,
  "politico.com": 0.82,
  "techcrunch.com": 0.78,
  "theverge.com": 0.78,
  "arstechnica.com": 0.8,
  "statnews.com": 0.85,
  "sciencedaily.com": 0.78,
  "nature.com": 0.92,
  "espn.com": 0.8,
  "variety.com": 0.78,
  "coindesk.com": 0.75,
  "cointelegraph.com": 0.65,
  "premiumtimesng.com": 0.8,
  "punchng.com": 0.72,
  "vanguardngr.com": 0.7,
  "thecable.ng": 0.75,
  "channelstv.com": 0.75,
  "allafrica.com": 0.7,
};

export function credibilityFor(domain: string): number {
  const d = domain.replace(/^www\./, "");
  if (CREDIBILITY[d] !== undefined) return CREDIBILITY[d];
  const parent = Object.keys(CREDIBILITY).find((k) => d.endsWith(`.${k}`));
  return parent ? CREDIBILITY[parent] : 0.55;
}
