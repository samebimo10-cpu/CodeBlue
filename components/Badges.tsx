export function HeatBadge({ heat, score }: { heat: "hot" | "warm" | "mild"; score: number }) {
  const cls = heat === "hot" ? "bg-bad-soft text-hot" : heat === "warm" ? "bg-warn-soft text-warm" : "bg-surface-2 text-muted";
  const dots = heat === "hot" ? "●●●" : heat === "warm" ? "●●○" : "●○○";
  return (
    <span className={`chip ${cls}`} title={`Trend score ${score}`}>
      {dots} {heat}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return status === "confirmed" ? (
    <span className="chip bg-ok-soft text-ok">Confirmed</span>
  ) : (
    <span className="chip bg-warn-soft text-warm" title="Fewer than two independent sources so far">
      Developing
    </span>
  );
}

export function SensitiveBadge({ flags }: { flags: string[] }) {
  if (flags.length === 0) return null;
  return (
    <span className="chip bg-bad-soft text-hot" title="Needs human approval, neutral tone only">
      Sensitive: {flags.join(", ")}
    </span>
  );
}

export function FactCheckBadge({ status }: { status: string }) {
  const map: Record<string, [string, string]> = {
    passed: ["bg-ok-soft text-ok", "Fact-check passed"],
    flagged: ["bg-warn-soft text-warm", "Check flagged claims"],
    blocked: ["bg-bad-soft text-hot", "Blocked by integrity gate"],
    unchecked: ["bg-surface-2 text-muted", "Not checked"],
  };
  const [cls, label] = map[status] ?? map.unchecked;
  return <span className={`chip ${cls}`}>{label}</span>;
}
