"use client";
/**
 * Dataset & Model Laboratory.
 * Three clearly separated blocks:
 *   1. Dataset investigation (documented facts about candidate datasets).
 *   2. MEASURED results — Python/YOLO experiment records + the live synthetic benchmark.
 *   3. The training workflow with exact commands.
 */
import { useEffect, useState } from "react";
import { Alert, Badge, Card, DataTable, EmptyState, Field, LimitationsList, PageHeader, Spinner, Stat, downloadText, fmt, pct } from "@/components/ui";
import { BarSeriesChart, LineSeriesChart } from "@/components/charts";

interface Experiment {
  id: string; status: string; created_at: string; data_origin: string; config: Record<string, unknown>; dataset: Record<string, unknown>;
  training: { elapsed_seconds?: number; epochs_completed?: number; curves?: Array<Record<string, number>> };
  metrics: { precision?: number; recall?: number; f1?: number; map50?: number; map50_95?: number; split?: string };
  evaluation: { precision?: number; recall?: number; f1?: number; map50?: number; map50_95?: number; split?: string; failure_analysis?: { recall_by_gt_size?: Record<string, { total: number; detected: number; recall: number | null }>; false_positives_total?: number; images?: number } };
  environment: Record<string, unknown>; notes: string[];
}
interface ExperimentsResponse { experiments: Experiment[]; model: { available: boolean; reason?: string; meta?: Record<string, unknown> } }
interface BenchVariant { variant: string; metrics: { precision: number; recall: number; f1: number; map: number; map50: number; totalGt: number; totalDetections: number; images: number; perClass: Array<{ cls: string; gt: number; tp: number; fp: number; fn: number; precision: number; recall: number; f1: number; ap: number; ap50: number }>; recallBySnr: Array<{ bin: string; total: number; detected: number; recall: number }> }; elapsedMs: number }
interface BenchResponse { ok: boolean; error?: string; params: Record<string, unknown>; results: BenchVariant[]; limitations: string[]; runId: string | null }

const DATASETS = [
  { name: "StreaksYoloDataset (USED)", source: "Parisot, LIST — Zenodo doi:10.5281/zenodo.14047943 · github.com/oparisot/StreaksYoloDataset", licence: "CC BY 4.0", format: "2,388 JPEG frames 640×640 + YOLO .txt labels (1 class: streak; 1,642 labelled, 746 negatives)", real: "Real raw frames from a Stellina smart telescope (Luxembourg, 2022–23)", limits: "Streaks are not attributed: satellites, debris, aircraft and meteors all leave trails. Single sensor/site; stacked frames; ~1 streak per image." },
  { name: "SPARK 2022 (stream-1 detection)", source: "University of Luxembourg CVI² — Zenodo doi:10.5281/zenodo.6599762 (request access)", licence: "Research use on request", format: "~88k–110k rendered RGB 1024×1024, 11 classes (10 spacecraft + 1 debris)", real: "Synthetic (rendered in a space simulator)", limits: "Photo-realistic but simulated; close-range spacecraft imagery, not telescope survey data. Access gated — not used here." },
  { name: "DUSTstreaks (2026)", source: "Zenodo record 21389101 — RSONAR stratospheric balloon flight", licence: "Check record (open per Zenodo listing)", format: "625 stacked images, 1,574 RSO streak annotations, CV folds, checkpoints", real: "Real balloon-borne observations", limits: "Published after this project's dataset choice; promising next step. Not downloaded here." },
  { name: "SpaceDet (IJCAI 2025)", source: "SpaceDet-100/5000/full — space-based imagery for RSO detection", licence: "See paper/repository", format: "Up to 20k images at 4418×4418, multiple objects per image", real: "Real space-based sensor imagery", limits: "Very large frames; heavy download. Candidate for future work." },
  { name: "Roboflow / Kaggle 'space debris' sets", source: "Various user uploads (e.g. 'Space Debris and Satellite Dataset')", licence: "Mixed / unclear provenance", format: "~1.3k images, 11 classes copied from SPARK", real: "Mostly re-uploads of SPARK renders", limits: "Licence and provenance cannot be verified — deliberately NOT used." },
];

export default function DatasetPage() {
  const [exp, setExp] = useState<ExperimentsResponse | null>(null);
  const [expErr, setExpErr] = useState<string | null>(null);
  const [selected, setSelected] = useState(0);
  const [bench, setBench] = useState<BenchResponse | null>(null);
  const [benchLoading, setBenchLoading] = useState(false);
  const [benchErr, setBenchErr] = useState<string | null>(null);
  const [nImages, setNImages] = useState(20);
  const [seed, setSeed] = useState(2026);
  const [noiseSigma, setNoiseSigma] = useState(5);
  const [brightness, setBrightness] = useState(1);
  const [kSigma, setKSigma] = useState(4);

  useEffect(() => {
    fetch("/api/experiments").then((r) => r.json()).then(setExp).catch(() => setExpErr("Could not load experiment records."));
  }, []);

  async function runBench() {
    setBenchLoading(true); setBenchErr(null); setBench(null);
    try {
      const res = await fetch("/api/evaluate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nImages, seed, noiseSigma, brightness, kSigma, size: 256 }) });
      const data = (await res.json()) as BenchResponse;
      if (!res.ok || !data.ok) throw new Error(data.error ?? "Benchmark failed.");
      setBench(data);
    } catch (e) { setBenchErr((e as Error).message); } finally { setBenchLoading(false); }
  }

  const experiments = exp?.experiments ?? [];
  const current = experiments[selected];
  const curves = (current?.training?.curves ?? []).map((c) => ({ epoch: c.epoch, train_box: c.train_box_loss, val_box: c.val_box_loss, train_cls: c.train_cls_loss, val_cls: c.val_cls_loss, map50: c.map50, precision: c.precision, recall: c.recall }));

  return (
    <div className="space-y-8">
      <PageHeader title="Dataset & Model Laboratory" subtitle="Which data exist, what was actually trained, what was measured — and how to reproduce or extend it." badge={<Badge tone="measured">Measured + documented</Badge>} />

      <Card title="1 · Dataset investigation (public, legally usable sources)">
        <p className="mb-3 text-sm text-slate-300">
          The detection task is defined as: <strong className="text-white">locate streaks (trails of objects moving relative to the stars) and point sources in optical telescope frames.</strong>
          Genuine, labelled, openly licensed <em>debris</em> imagery is rare; the table records what was found and why each source was or was not used.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-cyan-200"><th className="px-2 py-1">Dataset</th><th className="px-2 py-1">Source</th><th className="px-2 py-1">Licence</th><th className="px-2 py-1">Format / size</th><th className="px-2 py-1">Real or simulated</th><th className="px-2 py-1">Known limitations</th></tr></thead>
            <tbody>{DATASETS.map((d) => <tr key={d.name} className="border-t border-white/5 align-top text-slate-300"><td className="px-2 py-2 font-medium text-white">{d.name}</td><td className="px-2 py-2">{d.source}</td><td className="px-2 py-2">{d.licence}</td><td className="px-2 py-2">{d.format}</td><td className="px-2 py-2">{d.real}</td><td className="px-2 py-2">{d.limits}</td></tr>)}</tbody>
          </table>
        </div>
        <Alert tone="info" title="Decision">
          StreaksYoloDataset was chosen because it is <em>real</em> telescope data with an explicit CC BY 4.0 licence and YOLO labels. Its single class is <code>streak</code>; the project therefore never claims to classify &ldquo;debris&rdquo; from images — only to find trails. A synthetic generator (point sources + streaks) complements it for pipeline tests and is always labelled as such.
        </Alert>
      </Card>

      <Card title="2a · Measured results — Python / Ultralytics YOLO experiments" actions={exp?.model && <Badge tone={exp.model.available ? "measured" : "warn"}>{exp.model.available ? "ONNX model deployed" : "no ONNX model"}</Badge>}>
        {expErr && <Alert tone="danger">{expErr}</Alert>}
        {!exp && !expErr && <Spinner label="Loading experiment records…" />}
        {exp && experiments.length === 0 && (
          <EmptyState title="No training has been run yet">Records appear here after <code>python ml/scripts/train.py</code> writes <code>ml/experiments/*.json</code>. Nothing is shown until a run actually happens.</EmptyState>
        )}
        {current && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {experiments.map((e, i) => <button key={e.id} type="button" onClick={() => setSelected(i)} className={`rounded-full border px-3 py-1 text-xs ${i === selected ? "border-cyan-400/60 bg-cyan-400/15 text-cyan-100" : "border-white/10 text-slate-300 hover:bg-white/5"}`}>{e.id} <span className="opacity-60">· {e.status}</span></button>)}
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
              <Badge tone={current.data_origin === "real" ? "measured" : "demo"}>{current.data_origin} data</Badge>
              <span>dataset: <strong className="text-slate-200">{String(current.dataset?.name ?? "?")}</strong> · licence {String(current.dataset?.licence ?? "?")}</span>
              <span>· splits {JSON.stringify(current.dataset?.counts ?? {})}</span>
              <span>· model {String(current.config.model)} · imgsz {String(current.config.imgsz)} · epochs {String(current.config.epochs)} · seed {String(current.config.seed)} · {String(current.environment?.torch ?? "torch ?")} on {String(current.environment?.cpu_count)} CPUs · {current.training?.elapsed_seconds ? `${(current.training.elapsed_seconds / 60).toFixed(1)} min` : ""}</span>
            </div>
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <div className="mb-1 text-xs font-semibold text-slate-300">Validation split (used for model selection)</div>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <Stat label="Precision" value={fmt(current.metrics.precision)} /><Stat label="Recall" value={fmt(current.metrics.recall)} /><Stat label="mAP@0.5" value={fmt(current.metrics.map50)} /><Stat label="mAP@0.5:0.95" value={fmt(current.metrics.map50_95)} />
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs font-semibold text-emerald-200">Held-out TEST split (report these)</div>
                {current.evaluation?.map50 !== undefined ? (
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Stat label="Precision" value={fmt(current.evaluation.precision)} /><Stat label="Recall" value={fmt(current.evaluation.recall)} /><Stat label="F1" value={fmt(current.evaluation.f1)} /><Stat label="mAP@0.5" value={fmt(current.evaluation.map50)} hint={`mAP@0.5:0.95 ${fmt(current.evaluation.map50_95)}`} />
                  </div>
                ) : <EmptyState title="Not evaluated on the test split yet">Run <code>python ml/scripts/evaluate.py --run {current.id}</code>.</EmptyState>}
              </div>
            </div>
            {curves.length > 1 && (
              <div className="grid gap-4 md:grid-cols-2">
                <div><div className="mb-1 text-xs text-slate-400">Box loss per epoch (train vs val)</div><LineSeriesChart data={curves} x="epoch" series={[{ key: "train_box", name: "train box loss" }, { key: "val_box", name: "val box loss", dashed: true }]} height={220} /></div>
                <div><div className="mb-1 text-xs text-slate-400">Validation precision / recall / mAP@0.5 per epoch</div><LineSeriesChart data={curves} x="epoch" series={[{ key: "precision" }, { key: "recall" }, { key: "map50", name: "mAP@0.5" }]} height={220} yDomain={[0, 1]} /></div>
              </div>
            )}
            {current.evaluation?.failure_analysis?.recall_by_gt_size && (
              <div>
                <div className="mb-1 text-xs text-slate-400">Failure analysis on the test split — recall by ground-truth box size ({current.evaluation.failure_analysis.images} images, {current.evaluation.failure_analysis.false_positives_total} false positives at conf ≥ 0.25)</div>
                <DataTable columns={[{ key: "bin", label: "Size bin" }, { key: "total", label: "GT objects", align: "right" }, { key: "detected", label: "Detected", align: "right" }, { key: "recall", label: "Recall", align: "right" }]} rows={Object.entries(current.evaluation.failure_analysis.recall_by_gt_size).map(([bin, v]) => ({ bin, total: v.total, detected: v.detected, recall: v.recall === null ? "—" : pct(v.recall) }))} />
              </div>
            )}
            {current.notes?.length > 0 && <ul className="list-disc pl-5 text-xs text-slate-400">{current.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>}
            <div className="flex gap-2"><button type="button" className="btn-secondary" onClick={() => downloadText(`${current.id}.json`, JSON.stringify(current, null, 2), "application/json")}>Download experiment record (JSON)</button></div>
            {experiments.length > 1 && (
              <div>
                <div className="mb-1 text-xs text-slate-400">Comparison across recorded runs (test split where available, else validation)</div>
                <BarSeriesChart data={experiments.map((e) => ({ run: e.id, precision: e.evaluation?.precision ?? e.metrics.precision ?? 0, recall: e.evaluation?.recall ?? e.metrics.recall ?? 0, map50: e.evaluation?.map50 ?? e.metrics.map50 ?? 0 }))} x="run" series={[{ key: "precision" }, { key: "recall" }, { key: "map50", name: "mAP@0.5" }]} yDomain={[0, 1]} />
              </div>
            )}
          </div>
        )}
      </Card>

      <Card title="2b · Measured results — synthetic benchmark of the classical detector (runs now, in your browser session)" actions={<Badge tone="demo">Synthetic data</Badge>}>
        <p className="mb-3 text-xs text-slate-400">Compares the global-threshold <strong className="text-slate-200">baseline</strong> with the local-background + matched-filter <strong className="text-slate-200">improvement</strong> on the same seeded images. Numbers are computed live — they are measured, but on synthetic frames, so they validate the pipeline rather than real-world performance.</p>
        <div className="grid gap-3 sm:grid-cols-5">
          <Field label={`Images: ${nImages}`}><input type="range" min={5} max={60} step={5} value={nImages} onChange={(e) => setNImages(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
          <Field label="Seed"><input type="number" className="input" value={seed} onChange={(e) => setSeed(Number(e.target.value) || 0)} /></Field>
          <Field label={`Noise σ: ${noiseSigma}`}><input type="range" min={2} max={12} step={1} value={noiseSigma} onChange={(e) => setNoiseSigma(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
          <Field label={`Brightness ×${brightness.toFixed(1)}`}><input type="range" min={0.3} max={2} step={0.1} value={brightness} onChange={(e) => setBrightness(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
          <Field label={`Threshold k·σ: ${kSigma}`}><input type="range" min={2} max={8} step={0.5} value={kSigma} onChange={(e) => setKSigma(Number(e.target.value))} className="w-full accent-cyan-400" /></Field>
        </div>
        <button type="button" className="btn-primary mt-2" onClick={runBench} disabled={benchLoading}>{benchLoading ? "Benchmarking…" : "Run benchmark"}</button>
        <div className="mt-4">
          {benchLoading && <Spinner label="Rendering frames and running both detector variants…" />}
          {benchErr && <Alert tone="danger">{benchErr}</Alert>}
          {bench && (
            <div className="space-y-4">
              <div className="grid gap-3 md:grid-cols-2">
                {bench.results.map((r) => (
                  <div key={r.variant} className="rounded-lg border border-white/10 p-3">
                    <div className="mb-2 flex items-center justify-between"><span className="font-semibold text-white">{r.variant === "global-threshold" ? "Baseline: global threshold" : "Improved: local background + matched filter"}</span><span className="text-xs text-slate-500">{r.elapsedMs} ms</span></div>
                    <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
                      <Stat label="Precision" value={pct(r.metrics.precision)} /><Stat label="Recall" value={pct(r.metrics.recall)} /><Stat label="F1" value={pct(r.metrics.f1)} /><Stat label="mAP (3 px)" value={fmt(r.metrics.map)} /><Stat label="mAP@IoU.5" value={fmt(r.metrics.map50)} />
                    </div>
                    <div className="mt-2 text-[11px] text-slate-500">{r.metrics.totalGt} ground-truth objects · {r.metrics.totalDetections} detections over {r.metrics.images} images</div>
                  </div>
                ))}
              </div>
              <div>
                <div className="mb-1 text-xs text-slate-400">Failure analysis — recall by ground-truth peak SNR (faint objects are where detectors fail)</div>
                <BarSeriesChart data={bench.results[0].metrics.recallBySnr.map((b, i) => ({ bin: b.bin, baseline: b.recall, improved: bench.results[1].metrics.recallBySnr[i]?.recall ?? 0, n: b.total }))} x="bin" series={[{ key: "baseline", name: "baseline recall" }, { key: "improved", name: "improved recall" }]} yDomain={[0, 1]} />
              </div>
              <DataTable columns={[{ key: "variant", label: "Variant" }, { key: "cls", label: "Class" }, { key: "gt", label: "GT", align: "right" }, { key: "tp", label: "TP", align: "right" }, { key: "fp", label: "FP", align: "right" }, { key: "fn", label: "FN", align: "right" }, { key: "p", label: "P", align: "right" }, { key: "r", label: "R", align: "right" }, { key: "f1", label: "F1", align: "right" }, { key: "ap", label: "AP", align: "right" }, { key: "ap50", label: "AP@.5", align: "right" }]} rows={bench.results.flatMap((r) => r.metrics.perClass.map((c) => ({ variant: r.variant, cls: c.cls, gt: c.gt, tp: c.tp, fp: c.fp, fn: c.fn, p: fmt(c.precision, 3), r: fmt(c.recall, 3), f1: fmt(c.f1, 3), ap: fmt(c.ap, 3), ap50: fmt(c.ap50, 3) })))} />
              <div className="flex flex-wrap gap-2">
                <button type="button" className="btn-secondary" onClick={() => downloadText("orbital-guard-benchmark.json", JSON.stringify(bench, null, 2), "application/json")}>Download JSON</button>
                {bench.runId && <a className="btn-ghost" href={`/api/reports/${bench.runId}?format=csv`}>Download CSV</a>}
                {bench.runId && <a className="btn-ghost" href={`/api/reports/${bench.runId}?format=md`}>Research report</a>}
              </div>
              <LimitationsList items={bench.limitations} />
            </div>
          )}
        </div>
      </Card>

      <Card title="3 · Training & evaluation workflow (Python, reproducible)">
        <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-300">
          <li><strong className="text-white">Environment</strong>: <code className="kbd">pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu</code> then <code className="kbd">pip install -r ml/requirements.txt</code></li>
          <li><strong className="text-white">Data</strong>: download <code className="kbd">StreaksYoloDataset.zip</code> from Zenodo, unzip, then <code className="kbd">python ml/scripts/prepare_dataset.py --source &lt;unzipped&gt; --out ml/data/streaks --classes streak --name StreaksYoloDataset --origin real --licence &quot;CC BY 4.0&quot; --keep-splits --limit 360 --seed 42</code> (drop <code>--limit</code> for the full set). Or generate synthetic frames: <code className="kbd">npm run ml:synthetic</code>.</li>
          <li><strong className="text-white">Baseline</strong>: <code className="kbd">python ml/scripts/train.py --config ml/configs/baseline.yaml</code> (YOLOv8n from COCO weights; override anything with <code>--set epochs=20</code>).</li>
          <li><strong className="text-white">Improvement</strong>: <code className="kbd">python ml/scripts/train.py --config ml/configs/improved_p2.yaml</code> — adds a stride-4 P2 head for small, faint objects; same seed and splits so the comparison is fair.</li>
          <li><strong className="text-white">Held-out evaluation + failure analysis</strong>: <code className="kbd">python ml/scripts/evaluate.py --run baseline-streaks</code></li>
          <li><strong className="text-white">Deploy to the web app</strong>: <code className="kbd">python ml/scripts/export_onnx.py --run baseline-streaks</code> writes <code>ml/weights/model.onnx</code> + <code>model.json</code>; the Detection Lab picks it up automatically.</li>
        </ol>
        <p className="mt-3 text-xs text-slate-500">Every run records config, seed, dataset manifest (split digests), environment and metrics in <code>ml/experiments/&lt;run&gt;.json</code>; this page renders those files verbatim.</p>
      </Card>
    </div>
  );
}
