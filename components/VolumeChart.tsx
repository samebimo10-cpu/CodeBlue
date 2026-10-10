/** Coverage volume over time (share of global coverage, from GDELT). */
export function VolumeChart({ points }: { points: { date: string; value: number }[] }) {
  if (points.length < 2) return null;
  const w = 600;
  const h = 90;
  const max = Math.max(...points.map((p) => p.value), 0.0001);
  const x = (i: number) => (i / (points.length - 1)) * w;
  const y = (v: number) => h - (v / max) * (h - 6) - 3;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const peak = points.reduce((a, b) => (b.value > a.value ? b : a));
  return (
    <figure>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full" preserveAspectRatio="none" role="img" aria-label="Coverage volume over time">
        <path d={`${line} L${w},${h} L0,${h} Z`} fill="var(--brand-soft)" />
        <path d={line} fill="none" stroke="var(--brand)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption className="mt-1 flex justify-between gap-2 text-[11px] text-muted [&>span]:whitespace-nowrap">
        <span>{points[0].date}</span>
        <span>
          Peak {peak.date}
        </span>
        <span>{points.at(-1)!.date}</span>
      </figcaption>
    </figure>
  );
}
