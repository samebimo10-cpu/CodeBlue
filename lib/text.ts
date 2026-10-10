/**
 * Text utilities shared by clustering, classification and the integrity gates.
 * Deliberately dependency-free so the pipeline runs without an embeddings API.
 */

const STOPWORDS = new Set(
  `a an and are as at be been but by for from has have he her his in into is it its of on or our she that the their them they this to was were what when where which who will with would after over says said say new news live update updates more than about amid could may might not no yes up out off than then there these those how why we you your i us all any can do does did just also first last week year years day days today yesterday tomorrow`.split(
    /\s+/,
  ),
);

/** Very light stemmer: enough to merge "election"/"elections", "tariff"/"tariffs". */
export function stem(word: string): string {
  if (word.length > 5 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && word.endsWith("es") && !word.endsWith("ses")) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  if (word.length > 6 && word.endsWith("ing")) return word.slice(0, -3);
  if (word.length > 5 && word.endsWith("ed")) return word.slice(0, -2);
  return word;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[‘’']/g, "")
    .split(/[^a-z0-9À-ɏ]+/)
    .filter((w) => w.length > 1 && !STOPWORDS.has(w))
    .map(stem);
}

export function tokenSet(text: string): Set<string> {
  return new Set(tokenize(text));
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Overlap coefficient: forgiving when one title is much shorter than the other. */
export function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / Math.min(a.size, b.size);
}

/** Similarity used to decide whether two headlines describe the same event. */
export function headlineSimilarity(a: Set<string>, b: Set<string>): number {
  const j = jaccard(a, b);
  const o = overlap(a, b);
  // Require at least three shared tokens for the overlap path to count.
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return Math.max(j, inter >= 3 ? o * 0.8 : 0);
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z0-9“"])/)
    .map((s) => s.trim())
    .filter((s) => s.length > 20);
}

/** Proper-noun-ish spans: "Bola Tinubu", "Central Bank of Nigeria", "OpenAI". */
export function extractEntities(text: string, limit = 12): string[] {
  const counts = new Map<string, number>();
  const re = /\b([A-Z][a-zA-Z0-9&.\-]+(?:\s+(?:of|the|and|for|de|du|van|von)?\s*[A-Z][a-zA-Z0-9&.\-]+)*)/g;
  const skip = new Set(["The", "A", "An", "In", "On", "At", "For", "And", "But", "How", "Why", "What", "Who", "When", "Where", "This", "That", "After", "Before", "As", "With", "Live", "Watch", "Breaking", "Opinion", "Analysis", "Video"]);
  for (const m of text.matchAll(re)) {
    const e = m[1].replace(/[.\-]+$/, "").trim();
    if (e.length < 3 || skip.has(e)) continue;
    counts.set(e, (counts.get(e) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([e]) => e);
}

/** Sensitive categories: these always need human approval and a neutral tone. */
const SENSITIVE: Record<string, RegExp> = {
  deaths: /\b(dead|death|deaths|died|dies|kill|kills|killed|killing|fatal|fatalities|bodies|massacre|murder(ed)?|suicide)\b/i,
  violence: /\b(attack|attacks|shooting|gunmen|bomb(ing)?|explosion|terror(ist|ism)?|kidnap(ped|ping)?|bandits|clashes|war|airstrike|hostage)\b/i,
  disasters: /\b(earthquake|flood(s|ing)?|hurricane|cyclone|wildfire|tsunami|landslide|collapse|crash|disaster)\b/i,
  elections: /\b(election|elections|ballot|polls?|vote|voting|electoral|inec|candidate|primaries)\b/i,
  health: /\b(vaccine|outbreak|virus|cholera|ebola|mpox|cancer|cure|epidemic|pandemic|disease|drug trial|fda|who warns)\b/i,
  crime: /\b(arrest(ed)?|charged|court|trial|fraud|police|robbery|convicted|sentenced|efcc)\b/i,
  minors: /\b(child|children|minor|minors|teen|teenager|schoolgirls?|schoolboys?|student|pupils?|baby|infant)\b/i,
};

export function sensitivityFlags(text: string): string[] {
  return Object.entries(SENSITIVE)
    .filter(([, re]) => re.test(text))
    .map(([k]) => k);
}

/**
 * Integrity gate: the longest run of consecutive words a draft shares with any
 * source text. The spec blocks drafts at 12+ words (short quotes excepted).
 */
export function longestSharedRun(draft: string, sources: string[]): number {
  const norm = (s: string) =>
    s
      .toLowerCase()
      .replace(/[“”"]/g, "")
      .replace(/[‘’]/g, "'")
      .split(/[^a-z0-9']+/)
      .filter(Boolean);
  // Ignore text inside quotation marks in the draft: attributed quotes are allowed.
  const unquoted = draft.replace(/[“"][^”"]{0,200}[”"]/g, " | ");
  const d = norm(unquoted);
  if (d.length === 0) return 0;
  let best = 0;
  for (const src of sources) {
    const s = norm(src);
    if (s.length === 0) continue;
    // Classic longest-common-substring over word arrays, O(n*m) with a rolling row.
    let prev = new Array<number>(s.length + 1).fill(0);
    for (let i = 1; i <= d.length; i++) {
      const cur = new Array<number>(s.length + 1).fill(0);
      for (let j = 1; j <= s.length; j++) {
        if (d[i - 1] === s[j - 1]) {
          cur[j] = prev[j - 1] + 1;
          if (cur[j] > best) best = cur[j];
        }
      }
      prev = cur;
    }
  }
  return best;
}

/** Numbers, years and percentages mentioned in a text, normalised for comparison. */
export function extractNumbers(text: string): string[] {
  const found = text.match(/\b\d[\d,]*(?:\.\d+)?\s?(?:%|percent|million|billion|trillion|bn|m|k)?/gi) ?? [];
  return [...new Set(found.map((n) => n.toLowerCase().replace(/,/g, "").replace(/\s+/g, "").replace("percent", "%")))];
}

export function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max - 1).replace(/\s+\S*$/, "") + "…";
}
