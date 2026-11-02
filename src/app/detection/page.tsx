"use client";
/**
 * AI Detection Laboratory.
 * Upload an image or choose a synthetic sample, pick the engine (classical
 * source extractor or trained ONNX model), inspect detections and download the
 * annotated frame. The page always shows which engine actually ran.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Badge, Card, DataTable, EmptyState, Field, LimitationsList, PageHeader, Spinner, Stat, downloadText, fmt, pct, toCsvClient } from "@/components/ui";
import { ImageOverlay, type OverlayBox } from "@/components/image-overlay";

interface Sample { id: string; title: string; description: string; width: number; height: number; url: string }
interface Detection { id: number; cls: string; confidence: number; bbox: [number, number, number, number]; centroid: [number, number]; snr: number; area: number; elongation: number; peak: number }
interface Truth { id: number; cls: string; bbox: [number, number, number, number]; peakSnr: number }
interface ModelInfo { onnx: { available: boolean; reason?: string; meta?: { name: string; dataset?: string; data_origin?: string; classes: string[]; imgsz: number; metrics_test?: Record<string, number> } } }
interface DetectResponse {
  ok: boolean; error?: string; engine: "classical" | "onnx"; engineRequested: string; notes: string[]; image: { width: number; height: number };
  detections: Detection[]; stats: Record<string, number>; truth: Truth[] | null; metrics?: Record<string, unknown>; limitations: string[]; runId: string | null; dataOrigin: string; model?: { name: string };
}

export default function DetectionPage() {
  const [samples, setSamples] = useState<Sample[]>([]);
  const [model, setModel] = useState<ModelInfo | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileDims, setFileDims] = useState<{ width: number; height: number } | null>(null);
  const [sampleId, setSampleId] = useState<string>("");
  const [engine, setEngine] = useState<"classical" | "onnx">("classical");
  const [variant, setVariant] = useState<"local-matched-filter" | "global-threshold">("local-matched-filter");
  const [kSigma, setKSigma] = useState(4);
  const [minArea, setMinArea] = useState(3);
  const [conf, setConf] = useState(0.25);
  const [showTruth, setShowTruth] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DetectResponse | null>(null);

  useEffect(() => {
    fetch("/api/samples/list").then((r) => r.json()).then((d) => { setSamples(d.images ?? []); if (d.images?.length) setSampleId(d.images[0].id); }).catch(() => setSamples([]));
    fetch("/api/model").then((r) => r.json()).then(setModel).catch(() => setModel(null));
  }, []);

  useEffect(() => {
    if (!file) { setFileUrl(null); return; }
    const url = URL.createObjectURL(file);
    setFileUrl(url);
    // Read natural dimensions so the preview canvas can be sized before any API call.
    const img = new Image();
    img.onload = () => setFileDims({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => setFileDims(null);
    img.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const previewSrc = file ? fileUrl : sampleId ? `/api/samples/${sampleId}` : null;
  const sample = samples.find((s) => s.id === sampleId);
  const dims = result?.image ?? (file ? fileDims : sample ? { width: sample.width, height: sample.height } : null);

  async function run() {
    setLoading(true); setError(null); setResult(null);
    const params = { engine, variant, kSigma, minArea, conf };
    try {
      let res: Response;
      if (file) {
        const fd = new FormData();
        fd.append("image", file);
        fd.append("params", JSON.stringify(params));
        res = await fetch("/api/detect", { method: "POST", body: fd });
      } else {
        res = await fetch("/api/detect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sampleId, params }) });
      }
      const data = (await res.json()) as DetectResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? `Request failed (${res.status}).`);
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  const boxes = useMemo<OverlayBox[]>(() => {
    if (!result) return [];
    const det = result.detections.map((d) => ({ bbox: d.bbox, label: `${d.cls === "streak" ? "streak" : "point"} ${(d.confidence * 100).toFixed(0)}%`, color: d.cls === "streak" ? "#f59e0b" : "#22d3ee" }));
    const truth = showTruth && result.truth ? result.truth.map((t) => ({ bbox: t.bbox, label: "", color: "rgba(167,139,250,0.7)", dashed: true })) : [];
    return [...truth, ...det];
  }, [result, showTruth]);

  const onnx = model?.onnx;

  return (
    <div className="space-y-6">
      <PageHeader title="AI Detection Laboratory" subtitle="Detect point sources and streaks in optical frames. Choose the transparent classical detector or the trained YOLO model; both report what they are and what they cannot tell you." badge={<Badge tone="ok">Live inference</Badge>} />

      <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
        <div className="space-y-4">
          <Card title="1 · Input image">
            <Field label="Upload PNG or JPEG (≤ 12 MB, ≤ 16 MP)">
              <input type="file" accept="image/png,image/jpeg" className="input file:mr-3 file:rounded file:border-0 file:bg-cyan-400/20 file:px-2 file:py-1 file:text-cyan-100" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setResult(null); }} />
            </Field>
            {file && <button type="button" className="btn-ghost mt-2 !px-2 !py-1 text-xs" onClick={() => setFile(null)}>Clear upload and use a sample instead</button>}
            <div className="my-3 flex items-center gap-2 text-xs text-slate-500"><span className="h-px flex-1 bg-white/10" />or<span className="h-px flex-1 bg-white/10" /></div>
            <Field label="Synthetic sample" hint="Generated from a seed with known ground truth (purple dashed boxes). Demonstration data — not a real telescope image.">
              <select className="input" value={sampleId} disabled={!!file} onChange={(e) => { setSampleId(e.target.value); setResult(null); }}>
                {samples.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </Field>
            {sample && !file && <p className="mt-1 text-xs text-slate-400">{sample.description}</p>}
          </Card>

          <Card title="2 · Engine & parameters">
            <div className="space-y-3">
              <Field label="Detection engine">
                <select className="input" value={engine} onChange={(e) => setEngine(e.target.value as "classical" | "onnx")}>
                  <option value="classical">Classical source extractor (transparent baseline)</option>
                  <option value="onnx" disabled={!onnx?.available}>{onnx?.available ? `Trained YOLOv8 ONNX — ${onnx.meta?.name}` : "Trained YOLOv8 ONNX — not available"}</option>
                </select>
              </Field>
              {engine === "classical" ? (
                <>
                  <Field label="Variant">
                    <select className="input" value={variant} onChange={(e) => setVariant(e.target.value as typeof variant)}>
                      <option value="local-matched-filter">Local background + matched filter (improved)</option>
                      <option value="global-threshold">Global threshold (baseline)</option>
                    </select>
                  </Field>
                  <Field label={`Threshold k·σ = ${kSigma.toFixed(1)}`} hint="Lower finds fainter sources but adds false positives.">
                    <input type="range" min={2} max={10} step={0.5} value={kSigma} onChange={(e) => setKSigma(Number(e.target.value))} className="w-full accent-cyan-400" />
                  </Field>
                  <Field label={`Minimum area = ${minArea} px`} hint="Rejects hot pixels and cosmic-ray hits.">
                    <input type="range" min={1} max={12} step={1} value={minArea} onChange={(e) => setMinArea(Number(e.target.value))} className="w-full accent-cyan-400" />
                  </Field>
                </>
              ) : (
                <>
                  <Field label={`Confidence threshold = ${conf.toFixed(2)}`}>
                    <input type="range" min={0.05} max={0.9} step={0.05} value={conf} onChange={(e) => setConf(Number(e.target.value))} className="w-full accent-cyan-400" />
                  </Field>
                  {onnx?.meta && (
                    <div className="rounded-md border border-emerald-400/20 bg-emerald-400/5 p-2 text-xs text-slate-300">
                      <div><span className="text-slate-400">Trained on:</span> {onnx.meta.dataset ?? "n/a"} ({onnx.meta.data_origin} data)</div>
                      <div><span className="text-slate-400">Classes:</span> {onnx.meta.classes.join(", ")} · input {onnx.meta.imgsz}px</div>
                      {onnx.meta.metrics_test?.map50 !== undefined && <div><span className="text-slate-400">Held-out test mAP@0.5:</span> {fmt(onnx.meta.metrics_test.map50, 3)}</div>}
                    </div>
                  )}
                </>
              )}
              {!onnx?.available && onnx?.reason && <p className="text-xs text-amber-200/80">{onnx.reason}</p>}
              <button type="button" className="btn-primary w-full" onClick={run} disabled={loading || (!file && !sampleId)}>{loading ? "Running…" : "Run detection"}</button>
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Result" actions={result && <div className="flex items-center gap-2"><Badge tone={result.dataOrigin === "synthetic-demo" ? "demo" : "info"}>{result.dataOrigin === "synthetic-demo" ? "Synthetic demo data" : "User upload"}</Badge><Badge tone={result.engine === "onnx" ? "measured" : "neutral"}>{result.engine === "onnx" ? "YOLO ONNX" : "Classical"}</Badge></div>}>
            {loading && <Spinner label="Decoding image and running the detector…" />}
            {error && <Alert tone="danger" title="Detection failed">{error}</Alert>}
            {!loading && !error && !result && (
              dims && previewSrc ? <ImageOverlay src={previewSrc} width={dims.width} height={dims.height} caption="Input preview — run detection to see results." /> : <EmptyState title="Select an input to begin">Upload an image or choose a synthetic sample on the left.</EmptyState>
            )}
            {result && dims && (
              <div className="space-y-4">
                {result.notes.map((n, i) => <Alert key={i} tone="warn" title="Engine fallback">{n}</Alert>)}
                <div className="grid gap-4 md:grid-cols-2">
                  <ImageOverlay src={previewSrc} width={dims.width} height={dims.height} caption="Original" showLabels={false} downloadName="orbital-guard-original.png" />
                  <ImageOverlay src={previewSrc} width={dims.width} height={dims.height} boxes={boxes} caption={`Annotated — ${result.detections.length} detections (cyan: point source, amber: streak${result.truth ? ", purple dashed: ground truth" : ""})`} downloadName="orbital-guard-annotated.png" />
                </div>
                {result.truth && <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={showTruth} onChange={(e) => setShowTruth(e.target.checked)} className="accent-violet-400" />Show synthetic ground truth</label>}
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Detections" value={result.detections.length} hint={`${result.detections.filter((d) => d.cls === "streak").length} streaks`} />
                  {result.engine === "classical" ? (
                    <>
                      <Stat label="Noise σ" value={fmt(result.stats.noiseSigma, 2)} hint="robust MAD estimate" />
                      <Stat label="Threshold" value={fmt(result.stats.threshold, 2)} hint="grey levels above background" />
                      <Stat label="Rejected" value={`${result.stats.rejectedSmall} / ${result.stats.rejectedLarge}`} hint="too small / too large" />
                    </>
                  ) : (
                    <>
                      <Stat label="Model" value={result.model?.name ?? "yolo"} hint="ONNX runtime, CPU" />
                      <Stat label="Conf ≥" value={fmt(result.stats.confThreshold, 2)} />
                      <Stat label="NMS IoU" value={fmt(result.stats.iouThreshold, 2)} />
                    </>
                  )}
                  <Stat label="Elapsed" value={`${result.stats.elapsedMs} ms`} />
                </div>
                {result.metrics && (
                  <div className="rounded-lg border border-violet-400/20 bg-violet-400/5 p-3 text-xs text-slate-300">
                    <div className="mb-1 font-semibold text-violet-200">Scored against this sample&rsquo;s synthetic ground truth</div>
                    Precision {pct(result.metrics.precision as number)} · Recall {pct(result.metrics.recall as number)} · F1 {pct(result.metrics.f1 as number)} · AP (centroid match) {fmt(result.metrics.map as number)} · AP@IoU0.5 {fmt(result.metrics.map50 as number)}
                    <div className="mt-1 text-slate-500">A single synthetic frame — illustrative only. Use the Dataset &amp; Model page for a multi-image benchmark.</div>
                  </div>
                )}
                <DataTable
                  columns={[{ key: "id", label: "#" }, { key: "cls", label: "Class" }, { key: "confidence", label: "Score", align: "right" }, { key: "centroid", label: "Centroid (x, y)" }, { key: "bbox", label: "Box [x1,y1,x2,y2]" }, { key: "snr", label: "SNR", align: "right" }, { key: "area", label: "Area px", align: "right" }, { key: "elong", label: "Elong.", align: "right" }]}
                  rows={result.detections.slice(0, 200).map((d) => ({ id: d.id, cls: d.cls, confidence: d.confidence.toFixed(2), centroid: `${d.centroid[0]}, ${d.centroid[1]}`, bbox: d.bbox.map((v) => Math.round(v)).join(", "), snr: result.engine === "onnx" ? "n/a" : d.snr.toFixed(1), area: d.area, elong: d.elongation.toFixed(2) }))}
                  emptyText="No sources above threshold."
                />
                <div className="flex flex-wrap gap-2">
                  <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-detections.json", JSON.stringify(result, null, 2), "application/json")}>Download JSON</button>
                  <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-detections.csv", toCsvClient(result.detections.map((d) => ({ id: d.id, class: d.cls, confidence: d.confidence, x1: d.bbox[0], y1: d.bbox[1], x2: d.bbox[2], y2: d.bbox[3], cx: d.centroid[0], cy: d.centroid[1], snr: d.snr, area: d.area, elongation: d.elongation }))), "text/csv")}>Download CSV</button>
                  {result.runId && <a className="btn-ghost" href={`/api/reports/${result.runId}?format=md`}>Research report (Markdown)</a>}
                </div>
                <LimitationsList items={result.limitations} />
              </div>
            )}
          </Card>
          <Card title="How to read the output">
            <ul className="list-disc space-y-1 pl-5 text-xs text-slate-400">
              <li><strong className="text-slate-200">point_source</strong>: compact PSF-like blob. In a sidereally tracked exposure most of these are stars.</li>
              <li><strong className="text-slate-200">streak</strong>: elongated signal — an object moving relative to the stars during the exposure (satellite, debris, aircraft, meteor). The trained YOLO model only knows this class.</li>
              <li>Classical scores come from SNR; YOLO scores from a network trained on a few hundred images. Neither is a calibrated probability.</li>
              <li>To tell stars from movers, use the <a className="text-cyan-300 underline" href="/tracking">Tracking</a> module with several frames; to identify a mover you need the <a className="text-cyan-300 underline" href="/orbital">orbital catalogue</a> and calibrated observations.</li>
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
