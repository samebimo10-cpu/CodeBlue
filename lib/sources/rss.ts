import { XMLParser } from "fast-xml-parser";
import { cleanText, domainOf, fetchText, toIso } from "../http";
import type { RawArticle } from "../types";

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  textNodeName: "#text",
  cdataPropName: false,
  processEntities: false,
  htmlEntities: false,
});

const asArray = <T>(v: T | T[] | undefined): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

type Node = Record<string, unknown>;

function linkOf(item: Node): string {
  const link = item.link;
  if (typeof link === "string") return link.trim();
  for (const l of asArray(link as Node | Node[] | string)) {
    if (typeof l === "string") return l.trim();
    if (l && typeof l === "object") {
      const rel = l["@_rel"];
      if (!rel || rel === "alternate") return String(l["@_href"] ?? l["#text"] ?? "").trim();
    }
  }
  const guid = item.guid as Node | string | undefined;
  if (typeof guid === "string" && guid.startsWith("http")) return guid;
  return "";
}

function imageOf(item: Node): string | null {
  const media = (item["media:content"] ?? item["media:thumbnail"]) as Node | Node[] | undefined;
  for (const m of asArray(media)) if (m && m["@_url"]) return String(m["@_url"]);
  const enc = item.enclosure as Node | undefined;
  if (enc && String(enc["@_type"] ?? "").startsWith("image")) return String(enc["@_url"]);
  return null;
}

/**
 * Parse RSS 2.0, Atom and RSS 1.0 (RDF) documents.
 * `fallbackName` is used when the feed does not name its publisher.
 */
export function parseFeed(xml: string, fallbackName: string, origin: RawArticle["origin"] = "rss"): RawArticle[] {
  const doc = parser.parse(xml) as Node;
  const rss = doc.rss as Node | undefined;
  const channel = (rss?.channel ?? (doc["rdf:RDF"] as Node | undefined)?.channel) as Node | undefined;
  const items: Node[] = rss
    ? asArray(channel?.item as Node[])
    : doc.feed
      ? asArray((doc.feed as Node).entry as Node[])
      : asArray((doc["rdf:RDF"] as Node | undefined)?.item as Node[]);
  const feedTitle = cleanText(channel?.title ?? (doc.feed as Node | undefined)?.title) || fallbackName;

  const out: RawArticle[] = [];
  for (const item of items) {
    const url = linkOf(item);
    let title = cleanText(item.title);
    if (!url || !title) continue;
    let sourceName = fallbackName || feedTitle;
    let sourceDomain = domainOf(url);
    // Google News items carry the real publisher in <source url="...">Name</source>
    const src = item.source as Node | string | undefined;
    if (src && typeof src === "object" && src["@_url"]) {
      sourceName = cleanText(src["#text"]) || sourceName;
      sourceDomain = domainOf(String(src["@_url"]));
      const suffix = ` - ${sourceName}`;
      if (title.endsWith(suffix)) title = title.slice(0, -suffix.length);
    }
    const summary = cleanText(item.description ?? item.summary ?? item.content ?? item["content:encoded"]);
    out.push({
      url,
      title,
      summary: summary === title ? "" : summary.slice(0, 1200),
      publishedAt: toIso(item.pubDate ?? item.published ?? item.updated ?? item["dc:date"]),
      sourceName,
      sourceDomain,
      imageUrl: imageOf(item),
      author: cleanText(item["dc:creator"] ?? (item.author as Node | undefined)?.name ?? item.author) || null,
      language: "en",
      origin,
    });
  }
  return out;
}

export async function fetchFeed(url: string, name: string): Promise<RawArticle[]> {
  return parseFeed(await fetchText(url), name);
}
