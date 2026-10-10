import { handle } from "@/lib/api";
import { buildAllDigests, buildDigest } from "@/lib/digest";
import { dailyRun, pollTopics } from "@/lib/jobs";
import { topicById } from "@/lib/topics";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Manual refresh: { scope: "topics" | "digests" | "daily", topic? } */
export const POST = (req: Request) =>
  handle(async () => {
    const body = (await req.json().catch(() => ({}))) as { scope?: string; topic?: string };
    if (body.scope === "digests") {
      const t = body.topic ? topicById(body.topic) : undefined;
      return t ? { digest: await buildDigest(t.id) } : { digests: await buildAllDigests() };
    }
    if (body.scope === "daily") return dailyRun();
    return { report: await pollTopics("all") };
  });
