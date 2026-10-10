"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

/** POSTs to an API route, shows progress and errors, then refreshes the page. */
export function ActionButton(props: {
  url: string;
  body?: unknown;
  method?: "POST" | "DELETE" | "PATCH";
  label: string;
  busyLabel?: string;
  variant?: "primary" | "ghost";
  confirm?: string;
  redirect?: string;
  onDone?: (data: unknown) => void;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    if (props.confirm && !window.confirm(props.confirm)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(props.url, {
        method: props.method ?? "POST",
        headers: { "content-type": "application/json" },
        body: props.body === undefined ? undefined : JSON.stringify(props.body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
      props.onDone?.(data);
      if (props.redirect) router.push(props.redirect);
      else router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button onClick={run} disabled={busy} className={props.variant === "primary" ? "btn-primary" : "btn-ghost"}>
        {busy ? (props.busyLabel ?? "Working…") : props.label}
      </button>
      {error && <span className="text-xs text-hot">{error}</span>}
    </span>
  );
}
