import { aiEnabled } from "./ai";
import { latestBriefing } from "./briefing";
import { getPerspective, listDrafts } from "./drafts";
import { corpusFor } from "./queries";
import { getSettings } from "./settings";
import type { ArticleRow, TargetKind } from "./types";

/** Everything the Workbench client component needs, loaded on the server. */
export function workbenchProps(kind: TargetKind, id: number, tab: string | undefined, articles: ArticleRow[], sensitive: string[]) {
  const settings = getSettings();
  const refs = new Map(articles.map((a) => [a.id, a]));
  for (const a of corpusFor(kind, id, 140)) refs.set(a.id, a);
  return {
    kind,
    id,
    initialTab: (tab === "take" || tab === "drafts" ? tab : "briefing") as "briefing" | "take" | "drafts",
    briefing: latestBriefing(kind, id),
    articles: [...refs.values()].map((a) => ({
      id: a.id,
      title: a.title,
      url: a.url,
      source: a.source_name ?? a.domain ?? "Source",
      date: a.published_at.slice(0, 10),
    })),
    perspective: getPerspective(kind, id),
    drafts: listDrafts({ kind, targetId: id }),
    defaultPlatforms: settings.platforms,
    defaultTone: settings.defaultTone,
    aiOn: aiEnabled(),
    sensitive,
  };
}
