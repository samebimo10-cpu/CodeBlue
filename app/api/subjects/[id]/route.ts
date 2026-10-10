import { BadRequest, handle } from "@/lib/api";
import { db } from "@/lib/db";
import { ingestSubject } from "@/lib/ingest";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Ctx = { params: Promise<{ id: string }> };

const idOf = async (ctx: Ctx) => {
  const id = Number((await ctx.params).id);
  if (!Number.isInteger(id)) throw new BadRequest("Bad id");
  return id;
};

/** Refresh: pull everything new on the subject now. */
export const POST = (_req: Request, ctx: Ctx) => handle(async () => ({ report: await ingestSubject(await idOf(ctx)) }));

export const PATCH = (req: Request, ctx: Ctx) =>
  handle(async () => {
    const id = await idOf(ctx);
    const body = (await req.json()) as { name?: string; query?: string; notes?: string; daily?: boolean };
    const row = db().prepare("SELECT * FROM subjects WHERE id = ?").get(id) as Record<string, unknown> | undefined;
    if (!row) throw new BadRequest("Subject not found");
    db()
      .prepare("UPDATE subjects SET name = ?, query = ?, notes = ?, daily = ? WHERE id = ?")
      .run(body.name ?? row.name, body.query ?? row.query, body.notes ?? row.notes, body.daily === undefined ? row.daily : body.daily ? 1 : 0, id);
    return { ok: true };
  });

export const DELETE = (_req: Request, ctx: Ctx) =>
  handle(async () => {
    const id = await idOf(ctx);
    const conn = db();
    conn.transaction(() => {
      conn.prepare("DELETE FROM subject_articles WHERE subject_id = ?").run(id);
      conn.prepare("DELETE FROM briefings WHERE target_kind = 'subject' AND target_id = ?").run(id);
      conn.prepare("DELETE FROM fact_sheets WHERE target_kind = 'subject' AND target_id = ?").run(id);
      conn.prepare("DELETE FROM perspectives WHERE target_kind = 'subject' AND target_id = ?").run(id);
      conn.prepare("DELETE FROM subjects WHERE id = ?").run(id);
    })();
    return { ok: true };
  });
