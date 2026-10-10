"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewSubjectForm({ initial }: { initial?: string }) {
  const router = useRouter();
  const [name, setName] = useState(initial ?? "");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/subjects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name, query }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      router.push(`/subjects/${data.id}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="card grid gap-3 p-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div>
        <label className="label" htmlFor="subject-name">
          Subject you write on
        </label>
        <input id="subject-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Dangote Refinery, Naira exchange rate, AI regulation" required />
      </div>
      <div>
        <label className="label" htmlFor="subject-query">
          Search terms (optional)
        </label>
        <input id="subject-query" className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder='e.g. "Dangote refinery" OR "Dangote petroleum"' />
      </div>
      <button className="btn-primary h-[38px]" disabled={busy || !name.trim()}>
        {busy ? "Researching every source…" : "Follow & research"}
      </button>
      {error && <p className="text-sm text-hot sm:col-span-3">{error}</p>}
    </form>
  );
}
