import { handle } from "@/lib/api";
import { recentAlerts } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export const GET = () => handle(() => ({ alerts: recentAlerts() }));
