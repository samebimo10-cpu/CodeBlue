import { SettingsForm } from "@/components/SettingsForm";
import { aiEnabled, FAST_MODEL, MODEL } from "@/lib/ai";
import { getSettings } from "@/lib/settings";
import { guardianEnabled } from "@/lib/sources/guardian";
import { newsdataEnabled } from "@/lib/sources/newsdata";
import { TOPICS } from "@/lib/topics";

export const dynamic = "force-dynamic";

function Status({ on, label, hint }: { on: boolean; label: string; hint: string }) {
  return (
    <li className="flex items-start gap-2 text-sm">
      <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${on ? "bg-ok" : "bg-line"}`} />
      <span>
        <span className="font-medium">{label}</span> <span className="text-muted">— {hint}</span>
      </span>
    </li>
  );
}

export default function SettingsPage() {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <h1 className="text-2xl font-bold">Settings</h1>
      <section className="card p-5">
        <h2 className="mb-3 text-lg font-semibold">Sources and AI</h2>
        <ul className="space-y-2">
          <Status on={aiEnabled()} label="Claude AI" hint={aiEnabled() ? `writing & briefings: ${MODEL}; daily coverage: ${FAST_MODEL}` : "set ANTHROPIC_API_KEY in .env"} />
          <Status on label="Google News" hint="thousands of publishers, topic sections and search (no key)" />
          <Status on label="Publisher RSS" hint={`${TOPICS.reduce((n, t) => n + t.feeds.length, 0)} curated feeds across ${TOPICS.length} topics, plus yours`} />
          <Status on label="GDELT" hint="global coverage and volume over the last 3 months (no key)" />
          <Status on label="Wikipedia" hint="background and history for subjects (no key)" />
          <Status on={guardianEnabled()} label="The Guardian archive" hint={guardianEnabled() ? "archive back to 1999" : "set GUARDIAN_API_KEY (free) for history back to 1999"} />
          <Status on={newsdataEnabled()} label="NewsData.io" hint={newsdataEnabled() ? "80k+ sources" : "set NEWSDATA_API_KEY for 80k+ more sources"} />
        </ul>
      </section>
      <SettingsForm initial={getSettings()} topics={TOPICS.map((t) => ({ id: t.id, label: t.label }))} />
    </div>
  );
}
