/** Small fetch wrapper with a timeout and an honest user agent. */
const UA =
  "CodeBlue/0.1 (+https://github.com/samebimo10-cpu/CodeBlue; news briefing tool; respects robots.txt)";

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const res = await fetch(url, {
    headers: { "user-agent": UA, accept: "application/rss+xml, application/xml, text/xml, application/json, */*" },
    signal: AbortSignal.timeout(timeoutMs),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

export async function fetchJson<T>(url: string, timeoutMs = 15000): Promise<T> {
  const text = await fetchText(url, timeoutMs);
  return JSON.parse(text) as T;
}

export function domainOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&apos;": "'", "&nbsp;": " ",
  "&#8217;": "’", "&#8216;": "‘", "&#8220;": "“", "&#8221;": "”", "&#8211;": "–", "&#8212;": "—",
  "&hellip;": "…", "&#8230;": "…",
};

/** Strip HTML tags and decode common entities. */
export function cleanText(input: unknown): string {
  if (input == null) return "";
  let s = typeof input === "string" ? input : typeof input === "object" && "#text" in (input as object) ? String((input as Record<string, unknown>)["#text"]) : String(input);
  s = s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
  // Feeds often HTML-escape their HTML, so decode, strip tags, and decode once more.
  for (let pass = 0; pass < 2; pass++) {
    s = s.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ");
    s = s.replace(/<[^>]+>/g, " ");
    s = s.replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)));
    s = s.replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
    s = s.replace(/&[a-z#0-9]+;/gi, (m) => ENTITIES[m] ?? m);
  }
  return s.replace(/\s+/g, " ").trim();
}

export function toIso(value: unknown): string {
  if (!value) return new Date().toISOString();
  const raw = String(value).trim();
  // GDELT style 20261009T120000Z
  const g = raw.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/);
  if (g) return `${g[1]}-${g[2]}-${g[3]}T${g[4]}:${g[5]}:${g[6]}.000Z`;
  // NewsData style "2026-10-09 12:00:00" (UTC)
  const n = raw.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2})$/);
  if (n) return `${n[1]}T${n[2]}.000Z`;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
}
