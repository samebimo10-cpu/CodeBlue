import { BadRequest, handle } from "@/lib/api";
import { deleteDraft, setDraftStatus, updateDraftText } from "@/lib/drafts";
import type { DraftStatus } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const STATUSES: DraftStatus[] = ["draft", "in_review", "approved", "scheduled", "published"];

export const PATCH = (req: Request, ctx: Ctx) =>
  handle(async () => {
    const id = Number((await ctx.params).id);
    const body = (await req.json()) as { text?: string; status?: DraftStatus; scheduledAt?: string };
    let draft;
    if (typeof body.text === "string") draft = await updateDraftText(id, body.text);
    if (body.status) {
      if (!STATUSES.includes(body.status)) throw new BadRequest("Unknown status");
      draft = setDraftStatus(id, body.status, body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null);
    }
    return { draft };
  });

export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    deleteDraft(Number((await ctx.params).id));
  });
