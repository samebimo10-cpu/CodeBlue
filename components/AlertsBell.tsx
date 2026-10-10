"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { timeAgo } from "@/lib/format";

interface Alert {
  id: number;
  at: string;
  kind: "hot_story" | "post_due";
  title: string;
  href: string;
}

const SEEN_KEY = "codeblue.alerts.seen";

export function AlertsBell() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);

  useEffect(() => {
    try {
      setSeen(Number(localStorage.getItem(SEEN_KEY) ?? 0));
    } catch {}
    const load = () =>
      fetch("/api/alerts")
        .then((r) => r.json())
        .then((d) => setAlerts(d.alerts ?? []))
        .catch(() => {});
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, []);

  const unread = alerts.filter((a) => a.id > seen).length;
  const toggle = () => {
    setOpen(!open);
    if (!open && alerts[0]) {
      setSeen(alerts[0].id);
      try {
        localStorage.setItem(SEEN_KEY, String(alerts[0].id));
      } catch {}
    }
  };

  return (
    <div className="relative">
      <button onClick={toggle} className="btn-ghost relative" aria-label="Alerts">
        Alerts
        {unread > 0 && <span className="chip bg-hot text-white">{unread}</span>}
      </button>
      {open && (
        <div className="card absolute right-0 z-40 mt-2 max-h-96 w-80 overflow-y-auto p-2 shadow-xl">
          {alerts.length === 0 && <p className="p-3 text-sm text-muted">No alerts yet. Hot stories in your topics and due posts show up here.</p>}
          {alerts.map((a) => (
            <Link key={a.id} href={a.href} onClick={() => setOpen(false)} className="block rounded-lg p-2 hover:bg-surface-2">
              <div className="text-xs font-semibold uppercase tracking-wide text-hot">{a.kind === "hot_story" ? "Hot story" : "Post due"}</div>
              <div className="text-sm">{a.title}</div>
              <div className="text-xs text-muted">{timeAgo(a.at)}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
