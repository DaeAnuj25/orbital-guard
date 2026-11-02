"use client";
/**
 * Close-Approach Analysis — preliminary conjunction screening for two catalogued objects.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, DataTable, EmptyState, Field, LimitationsList, PageHeader, Spinner, Stat, downloadText, fmt } from "@/components/ui";
import { LineSeriesChart } from "@/components/charts";

interface Rec { name: string; noradId: number; epoch: string; regime: string; group?: string; perigeeAltKm: number; apogeeAltKm: number; inclinationDeg: number }
interface Event { tca: string; missDistanceKm: number; relativeSpeedKmS: number; ricKm: { radial: number; inTrack: number; crossTrack: number }; refined: boolean; stateA: { altitudeKm: number; latitudeDeg: number; longitudeDeg: number }; stateB: { altitudeKm: number } }
interface ConjResponse {
  ok: boolean; error?: string; a: Rec; b: Rec; closest: Event; events: Event[]; series: Array<{ minutesFromStart: number; separationKm: number; relativeSpeedKmS: number; t: string }>;
  window: { start: string; end: string; durationHours: number; coarseStepSeconds: number; samples: number }; screening: { thresholdKm: number; flagged: boolean; maxSamplingGapKm: number };
  assumptions: string[]; warnings: string[]; limitations: string[]; model: string; frame: string; runId: string | null; dataOrigin: string;
}

export default function ConjunctionPage() {
  const [source, setSource] = useState<"bundled" | "live">("bundled");
  const [objects, setObjects] = useState<Rec[]>([]);
  const [catInfo, setCatInfo] = useState<{ fetchedAt: string; source: string; notice?: string } | null>(null);
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [durationHours, setDurationHours] = useState(24);
  const [stepSeconds, setStepSeconds] = useState(30);
  const [thresholdKm, setThresholdKm] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ConjResponse | null>(null);

  useEffect(() => {
    fetch(`/api/orbital/catalog?source=${source}`).then((r) => r.json()).then((d) => {
      const objs: Rec[] = d.objects ?? [];
      setObjects(objs); setCatInfo({ fetchedAt: d.fetchedAt, source: d.source, notice: d.notice });
      if (objs.length) {
        // Sensible default: two members of the Cosmos-2251 debris cloud (similar orbits → interesting screening).
        const debris = objs.filter((o) => o.group === "cosmos-2251-debris");
        setAId(debris[0]?.noradId ?? objs[0].noradId);
        setBId(debris[1]?.noradId ?? objs[1]?.noradId ?? objs[0].noradId);
      }
    }).catch(() => setObjects([]));
  }, [source]);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    try {
      const res = await fetch("/api/conjunction", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source, a: { noradId: aId }, b: { noradId: bId }, start: new Date(`${start}Z`).toISOString(), durationHours, stepSeconds, thresholdKm }) });
      const data = (await res.json()) as ConjResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setResult(data);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  const series = useMemo(() => (result?.series ?? []).map((s) => ({ t: Number((s.minutesFromStart / 60).toFixed(3)), separation: s.separationKm })), [result]);
  const estSamples = Math.floor((durationHours * 3600) / stepSeconds) + 1;
  const grouped = objects.reduce<Record<string, Rec[]>>((g, o) => { (g[o.group ?? "other"] ??= []).push(o); return g; }, {});
  const ObjectSelect = ({ value, onChange, label }: { value: number | null; onChange: (v: number) => void; label: string }) => (
    <Field label={label}>
      <select className="input" value={value ?? ""} onChange={(e) => onChange(Number(e.target.value))}>
        {Object.entries(grouped).map(([group, objs]) => <optgroup key={group} label={group}>{objs.map((o) => <option key={o.noradId} value={o.noradId}>{o.name} · {o.noradId} · {o.regime}</option>)}</optgroup>)}
      </select>
    </Field>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Close-Approach Analysis" subtitle="Propagate two catalogued objects with SGP4, sample their separation, refine the minimum and report the time of closest approach, miss distance, relative speed and RIC components. Preliminary screening only." badge={<Badge tone="warn">Preliminary screening</Badge>} />
      <Alert tone="warn" title="Read before interpreting results">
        These estimates come from public mean elements without covariance. They are <strong>not</strong> collision probabilities and <strong>not</strong> a basis for avoidance manoeuvres. Operators use owner ephemerides, covariance and validated conjunction services for that.
      </Alert>
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card title="1 · Objects">
            <div className="mb-3 flex gap-2">
              {(["bundled", "live"] as const).map((s) => <button key={s} type="button" onClick={() => setSource(s)} className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${source === s ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>{s === "bundled" ? "Bundled snapshot" : "Live CelesTrak"}</button>)}
            </div>
            {catInfo && <p className="mb-2 text-xs text-slate-400">Catalogue: {catInfo.source} · fetched {new Date(catInfo.fetchedAt).toUTCString()}</p>}
            {catInfo?.notice && <Alert tone="warn">{catInfo.notice}</Alert>}
            {objects.length ? <div className="space-y-3"><ObjectSelect label="Object A (reference for RIC frame)" value={aId} onChange={setAId} /><ObjectSelect label="Object B" value={bId} onChange={setBId} /></div> : <Spinner label="Loading catalogue…" />}
          </Card>
          <Card title="2 · Screening window">
            <div className="space-y-3">
              <Field label="Start (UTC)"><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration (h)"><input type="number" min={0.25} max={168} step={0.25} className="input" value={durationHours} onChange={(e) => setDurationHours(Number(e.target.value))} /></Field>
                <Field label="Coarse step (s)"><input type="number" min={1} max={600} className="input" value={stepSeconds} onChange={(e) => setStepSeconds(Number(e.target.value))} /></Field>
              </div>
              <Field label="Report threshold (km)" hint="Local minima below this distance are listed as events."><input type="number" min={0.1} max={1000} step={0.5} className="input" value={thresholdKm} onChange={(e) => setThresholdKm(Number(e.target.value))} /></Field>
              <p className="text-[11px] text-slate-500">≈ {estSamples.toLocaleString()} samples × 2 objects {estSamples > 20000 && <span className="text-amber-300">— too many; increase the step</span>}</p>
              <button type="button" className="btn-primary w-full" onClick={run} disabled={loading || !aId || !bId || aId === bId || estSamples > 20000}>{loading ? "Screening…" : "Run close-approach screening"}</button>
              {aId === bId && <p className="text-xs text-amber-300">Choose two different objects.</p>}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Closest approach" actions={result && <div className="flex gap-2"><Badge tone="neutral">{result.dataOrigin}</Badge><Badge tone={result.screening.flagged ? "danger" : "ok"}>{result.screening.flagged ? `below ${result.screening.thresholdKm} km threshold` : "above threshold"}</Badge></div>}>
            {loading && <Spinner label="Propagating both objects and refining the minimum…" />}
            {error && <Alert tone="danger" title="Screening rejected">{error}</Alert>}
            {!loading && !error && !result && <EmptyState title="Select two objects and run the screening">Try two fragments of the same debris cloud for a close encounter, or ISS vs HST for a distant one.</EmptyState>}
            {result && (
              <div className="space-y-4">
                {result.warnings.map((w, i) => <Alert key={i} tone="warn">{w}</Alert>)}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="TCA (UTC)" value={<span className="text-sm">{result.closest.tca.replace("T", " ").slice(0, 19)}</span>} hint={result.closest.refined ? "golden-section refined (≤ 1 ms)" : "window boundary (not refined)"} />
                  <Stat label="Miss distance" value={`${fmt(result.closest.missDistanceKm, 3)} km`} hint="Euclidean, TEME" />
                  <Stat label="Relative speed" value={`${fmt(result.closest.relativeSpeedKmS, 3)} km/s`} hint="|vA − vB| at TCA" />
                  <Stat label="RIC of B rel. A" value={<span className="text-xs">R {fmt(result.closest.ricKm.radial, 2)} · I {fmt(result.closest.ricKm.inTrack, 2)} · C {fmt(result.closest.ricKm.crossTrack, 2)} km</span>} hint="radial / in-track / cross-track" />
                </div>
                <div className="text-xs text-slate-400">{result.a.name} (NORAD {result.a.noradId}, {result.a.regime}, {fmt(result.a.perigeeAltKm, 0)}–{fmt(result.a.apogeeAltKm, 0)} km, i={fmt(result.a.inclinationDeg, 1)}°) vs {result.b.name} (NORAD {result.b.noradId}, {result.b.regime}, {fmt(result.b.perigeeAltKm, 0)}–{fmt(result.b.apogeeAltKm, 0)} km, i={fmt(result.b.inclinationDeg, 1)}°) · window {result.window.start.slice(0, 16)}Z → {result.window.end.slice(0, 16)}Z · {result.window.samples} coarse samples · max sampling gap {result.screening.maxSamplingGapKm} km · altitude at TCA A {fmt(result.closest.stateA.altitudeKm, 1)} km / B {fmt(result.closest.stateB.altitudeKm, 1)} km</div>
                <div><div className="mb-1 text-xs text-slate-400">Separation (km, log scale) over the window (hours from start)</div><LineSeriesChart data={series} x="t" series={[{ key: "separation", name: "separation km" }]} height={260} xLabel="hours from start" logY yDomain={["auto", "auto"]} refY={result.screening.thresholdKm} refLabel="threshold" /></div>
                <div>
                  <div className="mb-1 text-xs text-slate-400">Local minima below the threshold (max 10, sorted by distance){result.events.length === 1 && !result.screening.flagged ? " — none below threshold; the global minimum is shown" : ""}</div>
                  <DataTable columns={[{ key: "tca", label: "TCA (UTC)" }, { key: "d", label: "Miss km", align: "right" }, { key: "v", label: "Rel. speed km/s", align: "right" }, { key: "r", label: "Radial km", align: "right" }, { key: "i", label: "In-track km", align: "right" }, { key: "c", label: "Cross-track km", align: "right" }]} rows={result.events.map((e) => ({ tca: e.tca.replace("T", " ").slice(0, 19), d: e.missDistanceKm.toFixed(3), v: e.relativeSpeedKmS.toFixed(3), r: e.ricKm.radial.toFixed(2), i: e.ricKm.inTrack.toFixed(2), c: e.ricKm.crossTrack.toFixed(2) }))} />
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-conjunction.json", JSON.stringify(result, null, 2), "application/json")}>Download JSON</button>
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=csv`}>Download CSV (separation series)</a>}
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=md`}>Research report</a>}
                </div>
                <LimitationsList title="Assumptions stated with this result" items={[...result.assumptions, ...result.limitations]} />
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
