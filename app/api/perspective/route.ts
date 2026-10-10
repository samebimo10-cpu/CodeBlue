import { BadRequest, handle, target } from "@/lib/api";
import { angleIdeas, checkTake, draftsFromTake, polishTake, savePerspective } from "@/lib/drafts";
import { PLATFORM_IDS } from "@/lib/platforms";
import type { AssistLevel, Platform } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Perspective mode actions:
 *  save    — persist notes, pinned facts, assist level and final text
 *  polish  — fix grammar/flow, keep the writer's words and stance
 *  angles  — questions to explore (never answers)
 *  check   — fact-check the writer's text; opinions are left alone
 *  publish — turn the final text into platform drafts (Write myself / Polish)
 */
export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as {
      kind?: string;
      id?: number;
      action?: string;
      notes?: string;
      pinned?: string[];
      assist?: AssistLevel;
      text?: string;
      platforms?: string[];
    };
    const { kind, id } = target(body);
    switch (body.action) {
      case "save":
        return savePerspective(kind, id, { notes: body.notes, pinned: body.pinned, assist_level: body.assist, final_text: body.text });
      case "polish":
        if (!body.text?.trim()) throw new BadRequest("Write something to polish first.");
        return polishTake(body.text);
      case "angles":
        return { questions: await angleIdeas(kind, id) };
      case "check":
        if (!body.text?.trim()) throw new BadRequest("Nothing to check yet.");
        return checkTake(kind, id, body.text);
      case "publish": {
        if (!body.text?.trim()) throw new BadRequest("Write your take first.");
        const platforms = (body.platforms ?? []).filter((p): p is Platform => PLATFORM_IDS.includes(p as Platform));
        if (platforms.length === 0) throw new BadRequest("Pick at least one platform.");
        savePerspective(kind, id, { final_text: body.text });
        return { drafts: await draftsFromTake(kind, id, body.text, platforms) };
      }
      default:
        throw new BadRequest("Unknown action");
    }
  });
