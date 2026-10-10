import { BadRequest, handle, target } from "@/lib/api";
import { generateDrafts, listDrafts } from "@/lib/drafts";
import { PLATFORM_IDS, TONES } from "@/lib/platforms";
import type { Platform, Tone } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const GET = (req: Request) =>
  handle(() => {
    const u = new URL(req.url);
    const kind = u.searchParams.get("kind") as "story" | "subject" | null;
    const targetId = Number(u.searchParams.get("id")) || undefined;
    return { drafts: listDrafts({ kind: kind ?? undefined, targetId }) };
  });

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as {
      kind?: string;
      id?: number;
      platforms?: string[];
      tone?: string;
      length?: "short" | "medium" | "long";
      stance?: string;
      pinned?: string[];
    };
    const { kind, id } = target(body);
    const platforms = (body.platforms ?? []).filter((p): p is Platform => PLATFORM_IDS.includes(p as Platform));
    if (platforms.length === 0) throw new BadRequest("Pick at least one platform.");
    const tone = (body.tone && body.tone in TONES ? body.tone : "neutral") as Tone;
    return { drafts: await generateDrafts({ kind, id, platforms, tone, length: body.length, stance: body.stance, pinnedFactIds: body.pinned }) };
  });
