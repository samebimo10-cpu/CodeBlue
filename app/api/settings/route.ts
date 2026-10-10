import { handle } from "@/lib/api";
import { getSettings, saveSettings, type Settings } from "@/lib/settings";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => getSettings());
export const POST = (req: Request) => handle(async () => saveSettings((await req.json()) as Partial<Settings>));
