import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Health check for the host: confirms the server is up and the database opens. */
export function GET() {
  db().prepare("SELECT 1").get();
  return NextResponse.json({ ok: true });
}
