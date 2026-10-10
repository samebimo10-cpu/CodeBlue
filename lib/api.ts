import { NextResponse } from "next/server";
import { errorMessage } from "./ai";
import { WorkflowError } from "./drafts";
import type { TargetKind } from "./types";

export async function handle(fn: () => Promise<unknown> | unknown) {
  try {
    return NextResponse.json((await fn()) ?? { ok: true });
  } catch (e) {
    const status = e instanceof WorkflowError ? 409 : e instanceof BadRequest ? 400 : 500;
    if (status === 500) console.error(e);
    return NextResponse.json({ error: errorMessage(e) }, { status });
  }
}

export class BadRequest extends Error {}

export function target(body: { kind?: string; id?: unknown }): { kind: TargetKind; id: number } {
  if (body.kind !== "story" && body.kind !== "subject") throw new BadRequest("kind must be 'story' or 'subject'");
  const id = Number(body.id);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequest("id must be a positive integer");
  return { kind: body.kind, id };
}
