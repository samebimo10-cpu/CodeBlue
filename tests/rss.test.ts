import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseFeed } from "@/lib/sources/rss";
import { cleanText, toIso } from "@/lib/http";

const fixture = (f: string) => fs.readFileSync(path.join(__dirname, "fixtures", f), "utf8");

describe("parseFeed", () => {
  it("reads Google News items with the real publisher and strips the title suffix", () => {
    const items = parseFeed(fixture("google.xml"), "Google News", "google-news");
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      title: "Lagos approves new rail line extension",
      sourceName: "Premium Times",
      sourceDomain: "premiumtimesng.com",
      origin: "google-news",
      publishedAt: "2026-10-09T10:00:00.000Z",
    });
    // The description that just repeats the headline is dropped.
    expect(items[0].summary).toBe("");
    expect(items[1].sourceDomain).toBe("punchng.com");
  });

  it("reads Atom entries", () => {
    const [item] = parseFeed(fixture("atom.xml"), "The Verge");
    expect(item.url).toBe("https://www.theverge.com/2026/10/9/chip");
    expect(item.title).toBe('Chipmaker unveils "fastest" AI accelerator');
    expect(item.summary).toBe("The new part doubles throughput.");
    expect(item.author).toBe("Jane Writer");
    expect(item.publishedAt).toBe("2026-10-09T12:00:00.000Z");
  });
});

describe("helpers", () => {
  it("cleans HTML and entities", () => {
    expect(cleanText("<p>Tom &amp; Jerry&#8217;s</p>")).toBe("Tom & Jerry’s");
  });
  it("parses GDELT and NewsData dates", () => {
    expect(toIso("20261009T120000Z")).toBe("2026-10-09T12:00:00.000Z");
    expect(toIso("2026-10-09 12:00:00")).toBe("2026-10-09T12:00:00.000Z");
  });
});
