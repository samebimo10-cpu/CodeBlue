import { BadRequest, handle } from "@/lib/api";
import { createSubject, ingestSubject } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json()) as { name?: string; query?: string; notes?: string };
    const name = body.name?.trim();
    if (!name) throw new BadRequest("Give the subject a name.");
    const id = createSubject(name, body.query?.trim() || name, body.notes ?? "");
    const report = await ingestSubject(id);
    return { id, report };
  });
