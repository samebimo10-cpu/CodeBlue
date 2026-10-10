import { BadRequest, handle, target } from "@/lib/api";
import { generateBriefing } from "@/lib/briefing";
import type { Depth } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as { kind?: string; id?: number; depth?: string; fresh?: boolean };
    const { kind, id } = target(body);
    const depth = (body.depth ?? "standard") as Depth;
    if (!["quick", "standard", "deep"].includes(depth)) throw new BadRequest("depth must be quick, standard or deep");
    return generateBriefing(kind, id, depth, Boolean(body.fresh));
  });
