import { fetchJson } from "../http";

/** Wikipedia background for a subject: the long-run history behind today's news. */
export interface Background {
  title: string;
  url: string;
  description: string;
  extract: string; // plain text, trimmed
  thumbnail?: string | null;
}

const API = "https://en.wikipedia.org/w/api.php";

export async function wikipediaBackground(query: string, maxChars = 12000): Promise<Background | null> {
  const search = await fetchJson<{ query?: { search?: { title: string }[] } }>(
    `${API}?action=query&list=search&srsearch=${encodeURIComponent(query)}&srlimit=1&format=json&origin=*`,
  );
  const title = search.query?.search?.[0]?.title;
  if (!title) return null;
  const page = await fetchJson<{
    query?: { pages?: Record<string, { title: string; extract?: string; description?: string; thumbnail?: { source: string } }> };
  }>(
    `${API}?action=query&prop=extracts|description|pageimages&explaintext=1&piprop=thumbnail&pithumbsize=400&titles=${encodeURIComponent(title)}&format=json&origin=*`,
  );
  const p = Object.values(page.query?.pages ?? {})[0];
  if (!p?.extract) return null;
  return {
    title: p.title,
    url: `https://en.wikipedia.org/wiki/${encodeURIComponent(p.title.replace(/ /g, "_"))}`,
    description: p.description ?? "",
    extract: p.extract.slice(0, maxChars),
    thumbnail: p.thumbnail?.source ?? null,
  };
}
