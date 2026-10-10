"use client";
import type { Briefing } from "@/lib/types";

export interface ArticleRef {
  id: number;
  title: string;
  url: string;
  source: string;
  date: string;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-line pt-4">
      <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-muted">{title}</h3>
      {children}
    </section>
  );
}

function Cite({ a }: { a?: ArticleRef }) {
  if (!a) return null;
  return (
    <a href={a.url} target="_blank" rel="noreferrer" className="text-xs text-brand hover:underline" title={a.title}>
      {a.source}, {a.date}
    </a>
  );
}

export function BriefingView({
  briefing,
  articles,
  pinned,
  onTogglePin,
}: {
  briefing: Briefing;
  articles: Map<number, ArticleRef>;
  pinned?: string[];
  onTogglePin?: (factId: string) => void;
}) {
  const b = briefing;
  return (
    <div className="space-y-4">
      <section>
        <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-brand">Bottom line</h3>
        <p className="leading-relaxed">{b.bottomLine}</p>
      </section>

      <Section title={`Key facts (${b.keyFacts.length})`}>
        <ol className="space-y-2">
          {b.keyFacts.map((f, i) => {
            const isPinned = pinned?.includes(f.id);
            return (
              <li key={f.id} className={`rounded-lg p-2 ${isPinned ? "bg-brand-soft" : ""}`}>
                <div className="flex gap-2">
                  <span className="text-sm font-bold text-muted">{i + 1}.</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm">{f.claim}</p>
                    <p className="mt-0.5 text-xs italic text-muted">&ldquo;{f.sourceText}&rdquo;</p>
                    <Cite a={articles.get(f.articleId)} />
                  </div>
                  {onTogglePin && (
                    <button onClick={() => onTogglePin(f.id)} className="btn-ghost h-fit px-2 py-0.5 text-xs">
                      {isPinned ? "Unpin" : "Pin"}
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Section>

      {b.timeline.length > 0 && (
        <Section title="Timeline">
          <ol className="relative space-y-3 border-l-2 border-line pl-4">
            {b.timeline.map((t, i) => (
              <li key={i}>
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-brand" />
                <div className="text-xs font-semibold text-muted">{t.date}</div>
                <div className="text-sm">{t.event}</div>
                {t.articleId ? <Cite a={articles.get(t.articleId)} /> : <span className="text-xs text-muted">Background reference</span>}
              </li>
            ))}
          </ol>
        </Section>
      )}

      {b.whosInvolved.length > 0 && (
        <Section title="Who's involved">
          <div className="grid gap-2 sm:grid-cols-2">
            {b.whosInvolved.map((p, i) => (
              <div key={i} className="rounded-lg bg-surface-2 p-3">
                <div className="font-semibold">{p.name}</div>
                <div className="text-xs text-muted">{p.role}</div>
                <div className="mt-1 text-sm">{p.position}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section title="How it's being covered">
        <dl className="space-y-2 text-sm">
          <div>
            <dt className="font-semibold">Where outlets agree</dt>
            <dd>{b.coverage.agreement}</dd>
          </div>
          <div>
            <dt className="font-semibold">Framing differences</dt>
            <dd>{b.coverage.framingDifferences}</dd>
          </div>
          <div>
            <dt className="font-semibold">Disputed or unconfirmed</dt>
            <dd>{b.coverage.disputed}</dd>
          </div>
        </dl>
      </Section>

      {b.numbersAndContext.length > 0 && (
        <Section title="Numbers and context">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {b.numbersAndContext.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}

      <Section title="Public reaction">
        <p className="text-sm">{b.publicReaction}</p>
      </Section>

      {b.whatToWatch.length > 0 && (
        <Section title="What to watch next">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {b.whatToWatch.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}

      {b.gaps.length > 0 && (
        <Section title="Gaps: unanswered questions (your best angles)">
          <ul className="list-disc space-y-1 pl-5 text-sm">
            {b.gaps.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        </Section>
      )}

      {b.relatedQueries.length > 0 && (
        <Section title="Related subjects to follow">
          <div className="flex flex-wrap gap-2">
            {b.relatedQueries.map((q) => (
              <a key={q} href={`/subjects?new=${encodeURIComponent(q)}`} className="chip bg-surface-2 px-3 py-1 text-sm text-ink hover:text-brand">
                + {q}
              </a>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}
