"use client";
/**
 * Orbital Analysis — catalogue browser, TLE/OMM import with validation, SGP4 propagation.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, DataTable, EmptyState, Field, LimitationsList, PageHeader, Spinner, Stat, downloadText, fmt } from "@/components/ui";
import { GroundTrackChart, LineSeriesChart } from "@/components/charts";

interface Rec { name: string; noradId: number; intlDesignator: string; epoch: string; meanMotionRevPerDay: number; eccentricity: number; inclinationDeg: number; raanDeg: number; argPerigeeDeg: number; meanAnomalyDeg: number; bstar: number; periodMinutes: number; semiMajorAxisKm: number; perigeeAltKm: number; apogeeAltKm: number; regime: string; group?: string; source: string; line1: string; line2: string }
interface CatalogResponse { ok: boolean; source: string; fetchedAt: string; provider: string; objects: Rec[]; notice?: string; liveEnabled: boolean; model: string; frame: string; now: string }
interface Sample { t: string; minutesFromStart: number; position: { x: number; y: number; z: number }; velocity: { x: number; y: number; z: number }; latitudeDeg: number; longitudeDeg: number; altitudeKm: number; speedKmS: number }
interface PropResponse { ok: boolean; error?: string; details?: unknown; record: Rec; samples: Sample[]; warnings: string[]; params: Record<string, unknown>; model: string; frame: string; limitations: string[]; runId: string | null; dataOrigin: string }

const ageDays = (epoch: string, now: string) => (new Date(now).getTime() - new Date(epoch).getTime()) / 86400000;

export default function OrbitalPage() {
  const [source, setSource] = useState<"bundled" | "live">("bundled");
  const [catalog, setCatalog] = useState<CatalogResponse | null>(null);
  const [catLoading, setCatLoading] = useState(false);
  const [noradId, setNoradId] = useState<number | null>(null);
  const [mode, setMode] = useState<"catalog" | "tle" | "omm">("catalog");
  const [tleText, setTleText] = useState("");
  const [ommText, setOmmText] = useState("");
  const [start, setStart] = useState(() => new Date().toISOString().slice(0, 16));
  const [durationMinutes, setDurationMinutes] = useState(95);
  const [stepSeconds, setStepSeconds] = useState(30);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string[]>([]);
  const [result, setResult] = useState<PropResponse | null>(null);

  useEffect(() => {
    setCatLoading(true);
    fetch(`/api/orbital/catalog?source=${source}`).then((r) => r.json()).then((d: CatalogResponse) => { setCatalog(d); if (d.objects?.length && (noradId === null || !d.objects.some((o) => o.noradId === noradId))) setNoradId(d.objects[0].noradId); }).catch(() => setCatalog(null)).finally(() => setCatLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [source]);

  const selected = catalog?.objects.find((o) => o.noradId === noradId) ?? null;

  async function run() {
    setLoading(true); setError(null); setErrorDetails([]); setResult(null);
    try {
      const body: Record<string, unknown> = { source, start: new Date(`${start}Z`).toISOString(), durationMinutes, stepSeconds };
      if (mode === "catalog") body.noradId = noradId;
      else if (mode === "tle") body.tleText = tleText;
      else { try { body.omm = JSON.parse(ommText); } catch { throw new Error("OMM text is not valid JSON."); } }
      const res = await fetch("/api/orbital/propagate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as PropResponse;
      if (!res.ok || !data.ok) {
        const det = Array.isArray(data.details) ? (data.details as Array<{ message?: string } | string>).map((d) => (typeof d === "string" ? d : d.message ?? "")) : [];
        setErrorDetails(det.filter(Boolean));
        throw new Error(data.error ?? `Request failed (${res.status}).`);
      }
      setResult(data);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  const chartData = useMemo(() => (result?.samples ?? []).map((s) => ({ t: s.minutesFromStart, altitude: s.altitudeKm, speed: s.speedKmS, lat: s.latitudeDeg, lon: s.longitudeDeg })), [result]);
  const groundTrack = useMemo(() => (result?.samples ?? []).map((s) => ({ lon: s.longitudeDeg, lat: s.latitudeDeg })), [result]);
  const rec = result?.record ?? selected;

  return (
    <div className="space-y-6">
      <PageHeader title="Orbital Analysis" subtitle="Import validated TLE/OMM element sets and propagate them with SGP4 (satellite.js). Positions are in the TEME frame; ground tracks are derived for visualisation." badge={<Badge tone="ok">SGP4 · satellite.js</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[380px_1fr]">
        <div className="space-y-4">
          <Card title="1 · Orbital data source">
            <div className="mb-3 flex gap-2">
              {(["bundled", "live"] as const).map((s) => <button key={s} type="button" onClick={() => setSource(s)} className={`flex-1 rounded-md border px-3 py-1.5 text-xs ${source === s ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>{s === "bundled" ? "Bundled snapshot" : "Live CelesTrak"}</button>)}
            </div>
            {catLoading && <Spinner label="Loading catalogue…" />}
            {catalog && (
              <div className="space-y-2 text-xs text-slate-400">
                <div><Badge tone={catalog.source === "live" ? "ok" : "neutral"}>{catalog.source}</Badge> <span className="ml-1">{catalog.provider}</span></div>
                <div>Fetched {new Date(catalog.fetchedAt).toUTCString()} · {catalog.objects.length} objects</div>
                {catalog.notice && <Alert tone="warn">{catalog.notice}</Alert>}
              </div>
            )}
            <div className="mt-3 flex gap-1 rounded-md bg-white/5 p-1 text-xs">
              {(["catalog", "tle", "omm"] as const).map((m) => <button key={m} type="button" onClick={() => setMode(m)} className={`flex-1 rounded px-2 py-1 ${mode === m ? "bg-cyan-400/20 text-cyan-100" : "text-slate-300"}`}>{m === "catalog" ? "Catalogue" : m === "tle" ? "Paste TLE" : "Paste OMM JSON"}</button>)}
            </div>
            <div className="mt-3">
              {mode === "catalog" && catalog && (
                <Field label="Object">
                  <select className="input" value={noradId ?? ""} onChange={(e) => setNoradId(Number(e.target.value))}>
                    {Object.entries(catalog.objects.reduce<Record<string, Rec[]>>((g, o) => { (g[o.group ?? "other"] ??= []).push(o); return g; }, {})).map(([group, objs]) => (
                      <optgroup key={group} label={group}>{objs.map((o) => <option key={o.noradId} value={o.noradId}>{o.name} · {o.noradId} · {o.regime}</option>)}</optgroup>
                    ))}
                  </select>
                </Field>
              )}
              {mode === "tle" && <Field label="TLE (2 or 3 lines)" hint="Checksums, field ranges and catalogue-number consistency are validated."><textarea className="input h-28 font-mono text-[11px]" value={tleText} onChange={(e) => setTleText(e.target.value)} placeholder={"ISS (ZARYA)\n1 25544U 98067A   ...\n2 25544  51.6327 ..."} /></Field>}
              {mode === "omm" && <Field label="OMM JSON (CelesTrak FORMAT=json)" hint="Object or single-element array with OBJECT_NAME, EPOCH, MEAN_MOTION, ECCENTRICITY, INCLINATION, …"><textarea className="input h-28 font-mono text-[11px]" value={ommText} onChange={(e) => setOmmText(e.target.value)} placeholder='{"OBJECT_NAME":"ISS (ZARYA)","EPOCH":"2026-10-21T01:08:59","MEAN_MOTION":15.4896, ...}' /></Field>}
            </div>
          </Card>
          <Card title="2 · Propagation window">
            <div className="space-y-3">
              <Field label="Start (UTC)"><input type="datetime-local" className="input" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Duration (min)"><input type="number" min={1} max={10080} className="input" value={durationMinutes} onChange={(e) => setDurationMinutes(Number(e.target.value))} /></Field>
                <Field label="Step (s)"><input type="number" min={1} max={3600} className="input" value={stepSeconds} onChange={(e) => setStepSeconds(Number(e.target.value))} /></Field>
              </div>
              <button type="button" className="btn-primary w-full" onClick={run} disabled={loading || (mode === "catalog" && !noradId)}>{loading ? "Propagating…" : "Validate & propagate"}</button>
              {selected && mode === "catalog" && catalog && Math.abs(ageDays(selected.epoch, new Date(`${start}Z`).toISOString())) > 7 && <Alert tone="warn">The window is {Math.abs(ageDays(selected.epoch, new Date(`${start}Z`).toISOString())).toFixed(1)} days from this element set&rsquo;s epoch; accuracy degrades quickly. Switch to live data if possible.</Alert>}
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Orbital parameters" actions={rec && <Badge tone="neutral">{rec.source.toUpperCase()} · epoch {rec.epoch.slice(0, 19)}Z</Badge>}>
            {rec ? (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <Stat label="Object" value={<span className="text-sm">{rec.name}</span>} hint={`NORAD ${rec.noradId} · ${rec.intlDesignator}`} />
                <Stat label="Regime" value={rec.regime} hint={`period ${fmt(rec.periodMinutes, 1)} min`} />
                <Stat label="Perigee / apogee" value={<span className="text-sm">{fmt(rec.perigeeAltKm, 0)} / {fmt(rec.apogeeAltKm, 0)} km</span>} hint={`a = ${fmt(rec.semiMajorAxisKm, 1)} km`} />
                <Stat label="Inclination" value={`${fmt(rec.inclinationDeg, 3)}°`} hint={`e = ${rec.eccentricity.toFixed(6)}`} />
                <Stat label="RAAN / arg. perigee" value={<span className="text-sm">{fmt(rec.raanDeg, 2)}° / {fmt(rec.argPerigeeDeg, 2)}°</span>} />
                <Stat label="Mean anomaly" value={`${fmt(rec.meanAnomalyDeg, 2)}°`} />
                <Stat label="Mean motion" value={`${fmt(rec.meanMotionRevPerDay, 5)}`} hint="rev/day" />
                <Stat label="B* drag term" value={rec.bstar.toExponential(3)} hint="1/Earth radii" />
              </div>
            ) : <EmptyState title="No object selected" />}
          </Card>
          <Card title="Propagated states" actions={result && <Badge tone={result.dataOrigin === "live-catalog" ? "ok" : result.dataOrigin === "user-import" ? "info" : "neutral"}>{result.dataOrigin}</Badge>}>
            {loading && <Spinner label="Running SGP4…" />}
            {error && <Alert tone="danger" title="Propagation rejected">{error}{errorDetails.length > 0 && <ul className="mt-1 list-disc pl-5">{errorDetails.map((d, i) => <li key={i}>{d}</li>)}</ul>}</Alert>}
            {!loading && !error && !result && <EmptyState title="Run a propagation to see altitude, speed and ground track">Validation (format, checksum, ranges, epoch age) happens before any propagation.</EmptyState>}
            {result && (
              <div className="space-y-4">
                {result.warnings.map((w, i) => <Alert key={i} tone="warn">{w}</Alert>)}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Samples" value={result.samples.length} hint={`every ${String(result.params.stepSeconds)} s`} />
                  <Stat label="Altitude range" value={<span className="text-sm">{fmt(Math.min(...result.samples.map((s) => s.altitudeKm)), 1)} – {fmt(Math.max(...result.samples.map((s) => s.altitudeKm)), 1)} km</span>} />
                  <Stat label="Speed range" value={<span className="text-sm">{fmt(Math.min(...result.samples.map((s) => s.speedKmS)), 3)} – {fmt(Math.max(...result.samples.map((s) => s.speedKmS)), 3)} km/s</span>} />
                  <Stat label="Frame" value={<span className="text-xs">TEME → geodetic</span>} hint={result.model.split("(")[0]} />
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div><div className="mb-1 text-xs text-slate-400">Altitude above ellipsoid (km) vs minutes</div><LineSeriesChart data={chartData} x="t" series={[{ key: "altitude", name: "altitude km" }]} height={220} xLabel="minutes from start" /></div>
                  <div><div className="mb-1 text-xs text-slate-400">Inertial speed (km/s) vs minutes</div><LineSeriesChart data={chartData} x="t" series={[{ key: "speed", name: "speed km/s", color: "#a78bfa" }]} height={220} xLabel="minutes from start" /></div>
                </div>
                <div><div className="mb-1 text-xs text-slate-400">Ground track (sub-satellite point)</div><GroundTrackChart points={groundTrack} /></div>
                <DataTable columns={[{ key: "t", label: "UTC" }, { key: "x", label: "x km", align: "right" }, { key: "y", label: "y km", align: "right" }, { key: "z", label: "z km", align: "right" }, { key: "lat", label: "lat °", align: "right" }, { key: "lon", label: "lon °", align: "right" }, { key: "alt", label: "alt km", align: "right" }, { key: "v", label: "|v| km/s", align: "right" }]} rows={result.samples.filter((_, i) => i % Math.max(1, Math.ceil(result.samples.length / 25)) === 0).map((s) => ({ t: s.t.slice(11, 19), x: s.position.x.toFixed(1), y: s.position.y.toFixed(1), z: s.position.z.toFixed(1), lat: s.latitudeDeg.toFixed(2), lon: s.longitudeDeg.toFixed(2), alt: s.altitudeKm.toFixed(1), v: s.speedKmS.toFixed(3) }))} />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-ephemeris.json", JSON.stringify(result, null, 2), "application/json")}>Download JSON</button>
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=csv`}>Download CSV</a>}
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=md`}>Research report</a>}
                </div>
                <LimitationsList items={result.limitations} />
              </div>
            )}
          </Card>
          <Card title="Why image detections are not matched to this catalogue">
            <p className="text-xs text-slate-400">Associating a streak in an image with a catalogued object needs: the exact exposure time, the telescope&rsquo;s pointing and plate scale (an astrometric solution), the observer&rsquo;s geodetic position, and then a comparison of predicted sky positions of candidate objects with the measured one, with uncertainties on both sides. The uploaded images in this prototype carry none of that metadata, so no association is attempted — doing it anyway would be fabrication.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
