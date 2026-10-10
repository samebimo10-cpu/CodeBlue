import { describe, expect, it } from "vitest";
import { extractNumbers, headlineSimilarity, longestSharedRun, sensitivityFlags, tokenSet } from "@/lib/text";
import { trendScore } from "@/lib/cluster";
import { ungroundedNumbers } from "@/lib/drafts";
import { overLimitParts } from "@/lib/platforms";

describe("similarity gate", () => {
  const source = "The central bank raised its benchmark interest rate by 50 basis points to 27.5 percent on Tuesday, citing stubborn inflation.";
  it("measures the longest shared run of words", () => {
    const copied = "Big news: the central bank raised its benchmark interest rate by 50 basis points to 27.5 percent on Tuesday!";
    expect(longestSharedRun(copied, [source])).toBeGreaterThanOrEqual(12);
  });
  it("passes original wording", () => {
    const fresh = "Rates are up again: a 50bp hike takes the policy rate to 27.5%, as inflation refuses to cool.";
    expect(longestSharedRun(fresh, [source])).toBeLessThan(12);
  });
  it("ignores short attributed quotes", () => {
    const quoted = 'Governor: "the central bank raised its benchmark interest rate by 50 basis points to 27.5 percent" — via BBC';
    expect(longestSharedRun(quoted, [source])).toBeLessThan(12);
  });
});

describe("clustering similarity", () => {
  it("matches two headlines about the same event", () => {
    const a = tokenSet("Lagos approves new rail line extension");
    const b = tokenSet("Lagos rail extension approved by state assembly");
    expect(headlineSimilarity(a, b)).toBeGreaterThanOrEqual(0.42);
  });
  it("separates different events", () => {
    const a = tokenSet("Lagos approves new rail line extension");
    const b = tokenSet("Super Eagles qualify for World Cup after win in Abuja");
    expect(headlineSimilarity(a, b)).toBeLessThan(0.2);
  });
});

describe("classification and scoring", () => {
  it("flags sensitive stories", () => {
    expect(sensitivityFlags("Gunmen kill 12 in attack on village")).toEqual(expect.arrayContaining(["deaths", "violence"]));
    expect(sensitivityFlags("Startup raises seed round")).toEqual([]);
  });
  it("rewards breadth, credibility and freshness", () => {
    const base = { sourceCount: 1, articlesLast3h: 1, hoursSinceLastSeen: 1, avgCredibility: 0.6 };
    expect(trendScore({ ...base, sourceCount: 8 })).toBeGreaterThan(trendScore(base));
    expect(trendScore({ ...base, hoursSinceLastSeen: 30 })).toBeLessThan(trendScore(base));
    expect(trendScore({ ...base, avgCredibility: 0.9 })).toBeGreaterThan(trendScore(base));
  });
});

describe("grounding", () => {
  it("extracts and normalises numbers", () => {
    expect(extractNumbers("₦1,200 billion and 27.5 percent")).toEqual(expect.arrayContaining(["1200billion", "27.5%"]));
  });
  it("flags numbers that are not in the sources", () => {
    const truth = "Turnout was 27.5% across 36 states, officials said.";
    expect(ungroundedNumbers("Turnout hit 27.5% in 36 states", truth)).toEqual([]);
    expect(ungroundedNumbers("Turnout hit 42% in 36 states", truth)).toEqual(["42%"]);
  });
  it("does not treat links, hashtags or slide numbers as claims", () => {
    expect(ungroundedNumbers("Slide 2: read more https://x.com/a/123456 #Vote2027", "nothing")).toEqual([]);
  });
});

describe("platform limits", () => {
  it("counts X links as 23 characters and checks each thread part", () => {
    const long = "a".repeat(270) + " https://example.com/" + "b".repeat(100);
    expect(overLimitParts(long, "x")).toEqual([1]);
    expect(overLimitParts("short\n\n---\n\n" + "c".repeat(300), "x")).toEqual([2]);
  });
});
