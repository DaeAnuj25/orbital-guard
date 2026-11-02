"use client";
/**
 * Space Object Tracking — multi-frame association in image coordinates.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, DataTable, EmptyState, Field, LimitationsList, PageHeader, Spinner, Stat, downloadText, fmt } from "@/components/ui";
import { ImageOverlay, type OverlayPath, type OverlayBox } from "@/components/image-overlay";
import { SERIES_COLORS } from "@/components/charts";

interface Sequence { id: string; title: string; description: string; frames: number; width: number; height: number }
interface TrackPoint { frame: number; x: number; y: number; measured: boolean }
interface Track { id: number; kind: "moving" | "stationary" | "tentative"; confirmed: boolean; hits: number; misses: number; startFrame: number; endFrame: number; points: TrackPoint[]; speedPxPerFrame: number; headingDeg: number; velocityPxPerFrame: [number, number] }
interface TrackResponse {
  ok: boolean; error?: string; tracks: Track[]; summary: Record<string, number>; detectionsPerFrame: Array<Array<{ bbox: [number, number, number, number]; cls: string; confidence: number }>>;
  truthTracks: Array<{ id: number; points: Array<{ frame: number; x: number; y: number; visible: boolean }> }> | null; recovery?: Record<string, unknown>; image: { width: number; height: number; frames: number }; limitations: string[]; runId: string | null; dataOrigin: string;
}

export default function TrackingPage() {
  const [sequences, setSequences] = useState<Sequence[]>([]);
  const [sequenceId, setSequenceId] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [frameUrls, setFrameUrls] = useState<string[]>([]);
  const [fileDims, setFileDims] = useState<{ width: number; height: number } | null>(null);
  const [gatePx, setGatePx] = useState(18);
  const [maxMisses, setMaxMisses] = useState(3);
  const [minHits, setMinHits] = useState(3);
  const [kSigma, setKSigma] = useState(4);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TrackResponse | null>(null);
  const [frame, setFrame] = useState(0);
  const [showStationary, setShowStationary] = useState(false);

  useEffect(() => {
    fetch("/api/samples/list").then((r) => r.json()).then((d) => { setSequences(d.sequences ?? []); if (d.sequences?.length) setSequenceId(d.sequences[0].id); }).catch(() => setSequences([]));
  }, []);
  useEffect(() => {
    if (!files.length) { setFrameUrls([]); return; }
    const urls = files.map((f) => URL.createObjectURL(f));
    setFrameUrls(urls);
    const img = new Image();
    img.onload = () => setFileDims({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setFileDims(null);
    img.src = urls[0];
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  const seq = sequences.find((s) => s.id === sequenceId);
  const nFrames = files.length ? files.length : seq?.frames ?? 0;
  const dims = result?.image ?? (files.length ? fileDims : seq ? { width: seq.width, height: seq.height } : null);
  const frameSrc = files.length ? frameUrls[frame] ?? null : seq ? `/api/samples/${seq.id}?frame=${frame}` : null;

  async function run() {
    setLoading(true); setError(null); setResult(null); setFrame(0);
    const params = { gatePx, maxMisses, minHits, kSigma };
    try {
      let res: Response;
      if (files.length) {
        const fd = new FormData();
        files.forEach((f) => fd.append("frames", f));
        fd.append("params", JSON.stringify(params));
        res = await fetch("/api/track", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sequenceId, params }) });
      }
      const data = (await res.json()) as TrackResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setResult(data);
    } catch (e) { setError((e as Error).message); } finally { setLoading(false); }
  }

  const visibleTracks = useMemo(() => (result?.tracks ?? []).filter((t) => t.confirmed && (showStationary || t.kind === "moving")), [result, showStationary]);
  const paths = useMemo<OverlayPath[]>(() => visibleTracks.map((t, i) => ({ points: t.points.filter((p) => p.frame <= frame), color: t.kind === "moving" ? SERIES_COLORS[i % SERIES_COLORS.length] : "rgba(148,163,184,0.5)", label: t.kind === "moving" ? `ID ${t.id}` : undefined })), [visibleTracks, frame]);
  const truthPaths = useMemo<OverlayPath[]>(() => (result?.truthTracks ?? []).map((t) => ({ points: t.points.filter((p) => p.frame <= frame && p.visible).map((p) => ({ x: p.x, y: p.y, measured: false })), color: "rgba(167,139,250,0.55)" })), [result, frame]);
  const boxes = useMemo<OverlayBox[]>(() => (result?.detectionsPerFrame[frame] ?? []).map((d) => ({ bbox: d.bbox, label: "", color: "rgba(34,211,238,0.35)" })), [result, frame]);

  return (
    <div className="space-y-6">
      <PageHeader title="Space Object Tracking" subtitle="Associate detections across sequential frames with a constant-velocity Kalman filter. Stationary tracks are stars; moving tracks are candidate resident space objects. All coordinates are pixels — not orbits." badge={<Badge tone="ok">Live tracking</Badge>} />
      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title="1 · Frame sequence">
            <Field label="Upload 2–30 frames (same size, temporal order by filename)" hint="PNG/JPEG. Frames are sorted by name before tracking.">
              <input type="file" multiple accept="image/png,image/jpeg" className="input file:mr-3 file:rounded file:border-0 file:bg-cyan-400/20 file:px-2 file:py-1 file:text-cyan-100" onChange={(e) => { const list = Array.from(e.target.files ?? []).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })); setFiles(list); setResult(null); }} />
            </Field>
            {files.length > 0 && <button type="button" className="btn-ghost mt-2 !px-2 !py-1 text-xs" onClick={() => setFiles([])}>Clear {files.length} uploaded frames</button>}
            <div className="my-3 flex items-center gap-2 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
            <Field label="Synthetic sequence" hint="Fixed stars + moving objects with random dropouts. Demonstration data with known trajectories (purple).">
              <select className="input" value={sequenceId} disabled={files.length > 0} onChange={(e) => { setSequenceId(e.target.value); setResult(null); setFrame(0); }}>
                {sequences.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </Field>
            {seq && !files.length && <p className="mt-1 text-xs text-slate-400">{seq.description}</p>}
          </Card>
          <Card title="2 · Tracker parameters">
            <div className="space-y-3">
              <Field label={`Association gate = ${gatePx} px`} hint="Max distance between prediction and detection."><input type="range" min={4} max={60} step={1} value={gatePx} onChange={(e) => setGatePx(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
              <Field label={`Max consecutive misses = ${maxMisses}`} hint="Frames a track coasts without a detection."><input type="range" min={0} max={8} step={1} value={maxMisses} onChange={(e) => setMaxMisses(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
              <Field label={`Min hits to confirm = ${minHits}`}><input type="range" min={1} max={8} step={1} value={minHits} onChange={(e) => setMinHits(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
              <Field label={`Detector threshold k·σ = ${kSigma.toFixed(1)}`}><input type="range" min={2.5} max={8} step={0.5} value={kSigma} onChange={(e) => setKSigma(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
              <button type="button" className="btn-primary w-full" onClick={run} disabled={loading || nFrames < 2}>{loading ? "Tracking…" : "Run tracking"}</button>
            </div>
          </Card>
        </div>
        <div className="space-y-4">
          <Card title="Trajectories in image coordinates" actions={result && <Badge tone={result.dataOrigin === "synthetic-demo" ? "demo" : "info"}>{result.dataOrigin === "synthetic-demo" ? "Synthetic demo data" : "User upload"}</Badge>}>
            {loading && <Spinner label="Detecting in every frame and associating tracks…" />}
            {error && <Alert tone="danger" title="Tracking failed">{error}</Alert>}
            {!loading && !error && !result && (dims && frameSrc ? <ImageOverlay src={frameSrc} width={dims.width} height={dims.height} caption={`Frame ${frame + 1} of ${nFrames} — run tracking to see trajectories.`} /> : <EmptyState title="Choose a sequence to begin" />)}
            {result && dims && (
              <div className="space-y-4">
                <ImageOverlay src={frameSrc} width={dims.width} height={dims.height} boxes={boxes} paths={[...truthPaths, ...paths]} caption={`Frame ${frame + 1}/${result.image.frames} — coloured: confirmed moving tracks (solid dots = measured, hollow = coasted prediction); purple: synthetic truth; faint boxes: detections in this frame.`} downloadName={`orbital-guard-tracking-frame${frame + 1}.png`} />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="flex flex-1 items-center gap-2 text-xs text-slate-300">Frame<input type="range" min={0} max={result.image.frames - 1} value={frame} onChange={(e) => setFrame(Number(e.target.value))} className="flex-1 accent-cyan-400" /><span className="font-mono">{frame + 1}</span></label>
                  <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showStationary} onChange={(e) => setShowStationary(e.target.checked)} className="accent-cyan-400" />Show stationary (star) tracks</label>
                </div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                  <Stat label="Frames" value={result.summary.frames} /><Stat label="Detections" value={result.summary.detectionsTotal} /><Stat label="Tracks" value={result.summary.tracksTotal} hint={`${result.summary.confirmed} confirmed`} /><Stat label="Moving" value={result.summary.moving} hint="candidate RSOs" /><Stat label="Stationary" value={result.summary.stationary} hint="stars" />
                </div>
                {result.recovery && (
                  <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3 text-xs text-slate-300">
                    <div className="mb-1 font-semibold text-violet-200">Scored against synthetic truth</div>
                    {String(result.recovery.truthMovingObjects)} true movers · {String(result.recovery.movingTracksFound)} moving tracks found · coverage of visible truth positions {fmt((result.recovery.coverage as number) * 100, 1)}% · fragments per true track: {JSON.stringify(result.recovery.fragmentsPerTruthTrack)}
                    <div className="mt-1 text-slate-500">Coverage counts truth positions within 4 px of a confirmed moving track. More than one fragment means the track was split by missed detections.</div>
                  </div>
                )}
                <DataTable columns={[{ key: "id", label: "ID" }, { key: "kind", label: "Kind" }, { key: "frames", label: "Frames" }, { key: "hits", label: "Hits / misses", align: "right" }, { key: "speed", label: "Speed px/frame", align: "right" }, { key: "heading", label: "Heading °", align: "right" }, { key: "start", label: "Start (x, y)" }, { key: "end", label: "End (x, y)" }]} rows={result.tracks.filter((t) => t.confirmed).map((t) => ({ id: t.id, kind: t.kind, frames: `${t.startFrame + 1}–${t.endFrame + 1}`, hits: `${t.hits} / ${t.misses}`, speed: t.speedPxPerFrame.toFixed(2), heading: t.headingDeg.toFixed(0), start: `${t.points[0]?.x}, ${t.points[0]?.y}`, end: `${t.points[t.points.length - 1]?.x}, ${t.points[t.points.length - 1]?.y}` }))} emptyText="No confirmed tracks." />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-tracks.json", JSON.stringify(result, null, 2), "application/json")}>Download JSON</button>
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=csv`}>Download CSV (track points)</a>}
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=md`}>Research report</a>}
                </div>
                <LimitationsList items={result.limitations} />
              </div>
            )}
          </Card>
          <Card title="Image-plane motion vs orbital motion">
            <p className="text-xs text-slate-400">A track here says: &ldquo;something moved N pixels per frame in direction θ on the sensor&rdquo;. To turn that into an orbit you need (1) a plate solution mapping pixels to right ascension/declination, (2) precise exposure mid-times, (3) the observer&rsquo;s position, and (4) an initial orbit determination method (e.g. Gauss or Gooding) over several observations, followed by association with the catalogue. None of that is attempted in this prototype — see the Learning Centre.</p>
          </Card>
        </div>
      </div>
    </div>
  );
}
