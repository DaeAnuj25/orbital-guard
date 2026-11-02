"use client";
/**
 * Results & Research Reports — every saved run with filters and downloads.
 * Demonstration (synthetic) results are visually separated from experimental ones.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Badge, Card, EmptyState, PageHeader, Spinner } from "@/components/ui";

interface Run { id: string; kind: string; title: string; dataOrigin: string; modelName: string | null; modelVersion: string | null; params: Record<string, unknown>; metrics: Record<string, unknown> | null; limitations: string[]; createdAt: string }

const KINDS = ["detection", "tracking", "evaluation", "propagation", "conjunction"];
const ORIGIN_TONE: Record<string, "demo" | "info" | "ok" | "neutral"> = { "synthetic-demo": "demo", "user-upload": "info", "live-catalog": "ok", "bundled-catalog": "neutral", "user-import": "info" };

function summarise(run: Run): string {
  const m = run.metrics ?? {};
  switch (run.kind) {
    case "detection": return m.precision !== undefined ? `P ${(Number(m.precision) * 100).toFixed(0)}% · R ${(Number(m.recall) * 100).toFixed(0)}% (vs synthetic truth)` : `engine ${String(run.params.engineUsed ?? "classical")}`;
    case "tracking": return m.coverage !== undefined ? `truth coverage ${(Number(m.coverage) * 100).toFixed(0)}% · ${String(m.movingTracksFound)} moving tracks` : "uploaded frames";
    case "evaluation": { const v = m["local-matched-filter"] as Record<string, number> | undefined; return v ? `improved F1 ${(v.f1 * 100).toFixed(0)}% · mAP ${v.map.toFixed(2)}` : ""; }
    case "propagation": return `${String(m.samples)} samples · step ${String(run.params.stepSeconds)} s`;
    case "conjunction": return `miss ${Number(m.missDistanceKm).toFixed(2)} km · ${Number(m.relativeSpeedKmS).toFixed(2)} km/s · ${m.flagged ? "flagged" : "not flagged"}`;
    default: return "";
  }
}

export default function ReportsPage() {
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState("");
  const [tab, setTab] = useState<"experimental" | "demo">("experimental");

  const load = useCallback(() => {
    fetch(`/api/reports${kind ? `?kind=${kind}` : ""}`)
      .then((r) => r.json())
      .then((d) => { if (!d.ok) throw new Error(d.error); setError(null); setRuns(d.runs); })
      .catch(() => setError("Could not load saved runs (is the database running?)."));
  }, [kind]);
  useEffect(() => { load(); }, [load]);

  async function remove(id: string) {
    if (!confirm("Delete this run record?")) return;
    await fetch(`/api/reports/${id}`, { method: "DELETE" });
    load();
  }

  const shown = (runs ?? []).filter((r) => (tab === "demo" ? r.dataOrigin === "synthetic-demo" : r.dataOrigin !== "synthetic-demo"));

  return (
    <div className="space-y-6">
      <PageHeader title="Results & Research Reports" subtitle="Each analysis is logged with its input, parameters, model/version, measured metrics, outputs, limitations and timestamp. Download JSON or CSV, or generate a Markdown research report." badge={<Badge tone="ok">Run log</Badge>}>
        <div className="flex flex-wrap items-center gap-2">
          <select className="input !w-auto" value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Filter by kind"><option value="">All kinds</option>{KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          <button type="button" className="btn-secondary" onClick={load}>Refresh</button>
        </div>
      </PageHeader>
      <div className="flex gap-1 rounded-md bg-white/5 p-1 text-sm">
        <button type="button" onClick={() => setTab("experimental")} className={`flex-1 rounded px-3 py-1.5 ${tab === "experimental" ? "bg-cyan-400/20 text-cyan-100" : "text-slate-300"}`}>Experimental (uploads, catalogue data)</button>
        <button type="button" onClick={() => setTab("demo")} className={`flex-1 rounded px-3 py-1.5 ${tab === "demo" ? "bg-violet-400/20 text-violet-100" : "text-slate-300"}`}>Demonstration (synthetic data)</button>
      </div>
      {tab === "demo" && <Alert tone="demo" title="Demonstration results">Runs in this tab used synthetic, seed-generated frames. They show that the pipeline works and how it degrades with noise — they are not evidence about real-world debris detection.</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}
      {!runs && !error && <Spinner label="Loading runs…" />}
      {runs && shown.length === 0 && <EmptyState title="No runs recorded yet in this category">Run an analysis in any module; it will appear here automatically.</EmptyState>}
      <div className="grid gap-3">
        {shown.map((r) => (
          <Card key={r.id} className="!p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="neutral">{r.kind}</Badge>
                  <Badge tone={ORIGIN_TONE[r.dataOrigin] ?? "neutral"}>{r.dataOrigin}</Badge>
                  <span className="truncate font-semibold text-white">{r.title}</span>
                </div>
                <div className="mt-1 text-xs text-slate-400">{new Date(r.createdAt).toUTCString()} · {r.modelName ?? "—"} {r.modelVersion ? `(${r.modelVersion.slice(0, 19)})` : ""}</div>
                <div className="mt-1 text-xs text-cyan-200/90">{summarise(r)}</div>
                <details className="mt-2 text-xs text-slate-400"><summary className="cursor-pointer text-slate-300">Parameters & limitations</summary><pre className="mt-1 max-h-48 overflow-auto rounded bg-black/40 p-2 font-mono text-[11px]">{JSON.stringify(r.params, null, 1)}</pre><ul className="mt-1 list-disc pl-5">{r.limitations.slice(0, 4).map((l, i) => <li key={i}>{l}</li>)}</ul></details>
              </div>
              <div className="flex flex-none flex-wrap gap-2">
                <a className="btn-secondary !px-3 !py-1.5 text-xs" href={`/api/reports/${r.id}?format=json`}>JSON</a>
                <a className="btn-secondary !px-3 !py-1.5 text-xs" href={`/api/reports/${r.id}?format=csv`}>CSV</a>
                <a className="btn-primary !px-3 !py-1.5 text-xs" href={`/api/reports/${r.id}?format=md`}>Report (MD)</a>
                <button type="button" className="btn-ghost !px-2 !py-1.5 text-xs text-rose-300" onClick={() => remove(r.id)}>Delete</button>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
