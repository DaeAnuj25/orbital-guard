/**
 * How This Project Was Made — build log, tool inventory and verification record.
 *
 * Server component: the "live facts" (dependency versions, code inventory,
 * experiment records, deployed model metadata, dataset manifest, bundled TLE
 * snapshot date) are read from disk at request time so the page can never drift
 * from what is actually in the repository. Narrative sections record what was
 * done during the build session, with the evidence that backs each claim.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import Link from "next/link";
import { Badge, Card, PageHeader, Stat } from "@/components/ui";
import { Code } from "@/components/tutorial";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "How This Project Was Made — ORBITAL GUARD",
  description: "Build log, complete tool and technology inventory, architecture decisions, data acquisition, training runs and verification results.",
};

/* ------------------------------------------------------- live fact readers */

const ROOT = process.cwd();
const read = <T,>(p: string, fallback: T): T => {
  try { return JSON.parse(readFileSync(path.join(/* turbopackIgnore: true */ ROOT, p), "utf-8")) as T; } catch { return fallback; }
};
const pkgVersion = (name: string) => read<{ version?: string }>(`node_modules/${name}/package.json`, {}).version ?? "—";

function walk(dir: string, out: string[] = []): string[] {
  if (!existsSync(/* turbopackIgnore: true */ dir)) return out;
  for (const e of readdirSync(/* turbopackIgnore: true */ dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "__pycache__") walk(p, out); }
    else out.push(p);
  }
  return out;
}
const lines = (files: string[]) => files.reduce((n, f) => { try { return n + readFileSync(/* turbopackIgnore: true */ f, "utf-8").split("\n").length; } catch { return n; } }, 0);
const rel = (p: string) => path.relative(ROOT, p);

interface ExpRec { id: string; status: string; created_at?: string; finished_at?: string; data_origin: string; config: Record<string, unknown>; dataset: Record<string, unknown>; environment: Record<string, unknown>; training: { elapsed_seconds?: number; epochs_completed?: number; curves?: unknown[] }; metrics: Record<string, number | undefined>; evaluation: Record<string, number | undefined> & { failure_analysis?: { images?: number; false_positives_total?: number; recall_by_gt_size?: Record<string, { total: number; recall: number | null }> } } }

export default async function HowBuiltPage() {
  // --- code inventory
  const tsFiles = walk(path.join(ROOT, "src")).filter((f) => /\.(ts|tsx)$/.test(f));
  const pyFiles = walk(path.join(ROOT, "ml")).filter((f) => f.endsWith(".py"));
  const testFiles = walk(path.join(ROOT, "tests")).filter((f) => f.endsWith(".ts"));
  const apiRoutes = walk(path.join(ROOT, "src/app/api")).filter((f) => f.endsWith("route.ts"));
  const pages = walk(path.join(ROOT, "src/app")).filter((f) => f.endsWith("page.tsx"));
  const testCount = testFiles.reduce((n, f) => n + (readFileSync(/* turbopackIgnore: true */ f, "utf-8").match(/\bit\(/g)?.length ?? 0), 0);
  const pkg = read<{ dependencies?: Record<string, string>; devDependencies?: Record<string, string> }>("package.json", {});
  const nDeps = Object.keys(pkg.dependencies ?? {}).length + Object.keys(pkg.devDependencies ?? {}).length;

  // --- ML artefacts
  const experiments = (existsSync(path.join(/* turbopackIgnore: true */ ROOT, "ml/experiments")) ? readdirSync(path.join(/* turbopackIgnore: true */ ROOT, "ml/experiments")).filter((f) => f.endsWith(".json")).sort() : [])
    .map((f) => read<ExpRec>(`ml/experiments/${f}`, null as unknown as ExpRec)).filter(Boolean);
  const model = read<Record<string, unknown> & { metrics_test?: Record<string, number> }>("ml/weights/model.json", {});
  const onnxBytes = existsSync(path.join(/* turbopackIgnore: true */ ROOT, "ml/weights/model.onnx")) ? statSync(path.join(/* turbopackIgnore: true */ ROOT, "ml/weights/model.onnx")).size : 0;
  const manifest = read<Record<string, unknown>>("ml/data/streaks/dataset_manifest.json", {});

  // --- bundled catalogue snapshot
  const bundledSrc = existsSync(path.join(/* turbopackIgnore: true */ ROOT, "src/lib/orbital/bundled-tles.ts")) ? readFileSync(path.join(/* turbopackIgnore: true */ ROOT, "src/lib/orbital/bundled-tles.ts"), "utf-8") : "";
  const fetchedAt = /BUNDLED_FETCHED_AT = "([^"]+)"/.exec(bundledSrc)?.[1] ?? "unknown";
  const bundledCount = (bundledSrc.match(/^1 /gm) ?? []).length;
  const env = experiments[0]?.environment ?? {};

  const facts: Facts = { apiRoutes: apiRoutes.length, testCount, env };
  const TG = toolGroups(facts);
  const MODS = modules(facts);

  const stats = [
    { label: "Pages / API routes", value: `${pages.length} / ${apiRoutes.length}` },
    { label: "TypeScript (src)", value: `${lines(tsFiles).toLocaleString()} lines`, hint: `${tsFiles.length} files (.ts/.tsx)` },
    { label: "Python (ml)", value: `${lines(pyFiles).toLocaleString()} lines`, hint: `${pyFiles.length} scripts` },
    { label: "Tests", value: `${testCount} in ${testFiles.length} files`, hint: `${lines(testFiles)} lines, Vitest` },
    { label: "npm packages", value: `${nDeps}`, hint: "runtime + dev, all open source" },
    { label: "Deployed model", value: onnxBytes ? `${(onnxBytes / 1e6).toFixed(1)} MB ONNX` : "none", hint: String(model.name ?? "—") },
    { label: "Training runs recorded", value: `${experiments.length}`, hint: experiments.filter((e) => e.status === "evaluated").length + " evaluated on held-out test" },
    { label: "Bundled element sets", value: `${bundledCount}`, hint: `CelesTrak snapshot ${fetchedAt.slice(0, 10)}` },
  ];

  return (
    <div className="space-y-8">
      <PageHeader
        title="How This Project Was Made"
        subtitle="The complete build record: the process followed phase by phase, every tool and library used (with versions and why), the architecture decisions and the alternatives that were rejected, how the data was obtained and validated, what was actually trained and measured, and the verification that was run before delivery."
        badge={<Badge tone="measured">Build log · measured facts</Badge>}
      >
        <Link href="/tutorial" className="btn-secondary">Hands-on tutorial →</Link>
      </PageHeader>

      <Card title="At a glance (read live from the repository)">
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stats.map((s) => <Stat key={s.label} label={s.label} value={<span className="text-base">{s.value}</span>} hint={s.hint} />)}</div>
        <p className="mt-3 text-xs text-slate-500">Built {fetchedAt.slice(0, 10)} in a sandboxed Linux container: Node {process.versions.node}, Python {String(env.python ?? "3.11")}, {String(env.cpu_count ?? 4)} CPU cores, ~3.9 GB RAM, <strong className="text-slate-300">no GPU</strong> ({String(env.cuda_available ?? false)} CUDA). Every number above is computed from the files on disk when this page is requested.</p>
      </Card>

      <Card title="1 · Build process (the ten phases actually followed)">
        <p className="mb-3 text-sm text-slate-300">The brief specified a ten-phase process. Each phase below lists what was done, the decision it forced, and the evidence left behind. Timestamps are UTC from the build session on {fetchedAt.slice(0, 10)}.</p>
        <div className="space-y-2">
          {PHASES.map((p) => (
            <details key={p.n} className="group rounded-lg border border-white/10 bg-white/5 p-3 open:border-cyan-400/30">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm">
                <span className="font-semibold text-white">Phase {p.n} · {p.title}</span>
                <span className="flex flex-none items-center gap-2 text-[11px] text-slate-400">{p.time}<span className="text-cyan-300 transition group-open:rotate-90">▸</span></span>
              </summary>
              <div className="mt-3 space-y-2 text-xs text-slate-300">
                <div><span className="font-semibold text-cyan-200">Done: </span>{p.done}</div>
                <div><span className="font-semibold text-cyan-200">Decision: </span>{p.decision}</div>
                <div><span className="font-semibold text-cyan-200">Evidence: </span>{p.evidence}</div>
              </div>
            </details>
          ))}
        </div>
      </Card>

      <Card title="2 · Tools and technologies (complete inventory)">
        <div className="space-y-6">
          {TG.map((g) => (
            <div key={g.title}>
              <h3 className="mb-2 text-sm font-semibold text-white">{g.title}</h3>
              <div className="overflow-x-auto rounded-lg border border-white/10">
                <table className="w-full text-[11px]">
                  <thead className="bg-white/5 text-cyan-200"><tr>{["Tool", "Version", "Role in this project", "Why this one (and what was rejected)", "Licence"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
                  <tbody>{g.rows.map((r, i) => <tr key={i} className="border-t border-white/5 align-top text-slate-300">{r.map((cell, j) => <td key={j} className={`px-2 py-1.5 ${j === 0 ? "font-medium text-white" : ""} ${j === 1 ? "font-mono text-cyan-100" : ""}`}>{cell}</td>)}</tr>)}</tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card title="3 · Architecture decisions and rejected alternatives">
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-[11px]">
            <thead className="bg-white/5 text-cyan-200"><tr>{["Decision", "Alternatives considered", "Why", "Consequence you should know"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>{DECISIONS.map((d, i) => <tr key={i} className="border-t border-white/5 align-top text-slate-300">{d.map((cell, j) => <td key={j} className={`px-2 py-1.5 ${j === 0 ? "font-medium text-white" : ""}`}>{cell}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card title="4 · Data acquisition and preparation log">
        <ol className="space-y-3 text-sm text-slate-300">
          <li><strong className="text-white">Literature/dataset survey (web research).</strong> Searched for openly licensed, genuinely labelled space-object imagery. Candidates documented on the <Link className="text-cyan-300 underline" href="/dataset">Dataset &amp; Model</Link> page: StreaksYoloDataset (real, CC BY 4.0), SPARK 2022 (synthetic, request-gated), DUSTstreaks, SpaceDet, and Roboflow/Kaggle re-uploads (rejected: unverifiable provenance/licence).</li>
          <li><strong className="text-white">Download.</strong> StreaksYoloDataset.zip fetched from Zenodo (record 14047944) — <span className="font-mono">1,397,179,335 bytes (1.40 GB)</span>, completed 15:03 UTC. Unzipped: 2,388 JPEG frames at 640×640 in <code>train/</code> (1,722), <code>validation/</code> (333), <code>test/</code> (333), of which 1,642 carry a YOLO label file (the rest are deliberate negatives).</li>
          <li><strong className="text-white">Preparation (15:04 UTC).</strong> <code>prepare_dataset.py --keep-splits --limit 360 --seed 42 --link</code> respected the author&rsquo;s splits, took a seeded 360-image subset (259 train / 49 val / 52 test) for a CPU-feasible experiment, validated every label box (ranges, numeric fields), skipped 746 unlabelled images, and wrote <code>data.yaml</code> plus <code>dataset_manifest.json</code>.{manifest.class_histogram ? <> Manifest still in repo: licence <span className="font-mono">{String(manifest.licence)}</span>, seed <span className="font-mono">{String(manifest.seed)}</span>, classes <span className="font-mono">{JSON.stringify(manifest.class_histogram)}</span>, median box size <span className="font-mono">{String(manifest.box_relative_size_median)}</span> of the frame.</> : null}</li>
          <li><strong className="text-white">Orbital data (14:51–15:08 UTC).</strong> CelesTrak GP API queried for five groups (<code>stations</code>, <code>science</code>, <code>cosmos-2251-debris</code>, <code>fengyun-1c-debris</code>, <code>iridium-33-debris</code>) in TLE format plus one OMM/JSON record. {bundledCount} element sets were selected, checksum-verified and frozen into <code>src/lib/orbital/bundled-tles.ts</code> with the fetch timestamp <span className="font-mono">{fetchedAt}</span> — generated programmatically from the downloaded text so no checksummed character was retyped by hand.</li>
          <li><strong className="text-white">No restricted sources.</strong> Nothing behind authentication was scraped; CelesTrak&rsquo;s usage guidance (≤ 1 request per group per 2 h) is enforced by a 2-hour in-memory cache, and live access can be switched off with <code>ORBITAL_GUARD_LIVE_TLE=0</code>.</li>
          <li><strong className="text-white">Synthetic data.</strong> Two generators were written from scratch and kept in sync: <code>ml/scripts/generate_synthetic.py</code> (Python, for training smoke tests) and <code>src/lib/vision/synthetic.ts</code> (TypeScript, for the demo samples, sequences and benchmark). Both use a seeded PRNG, a Gaussian PSF, log-uniform source amplitudes, shot + read noise, and unlabelled hot pixels. Everything they produce is tagged <Badge tone="demo">synthetic</Badge> in the UI and in the run log.</li>
        </ol>
      </Card>

      <Card title="5 · Training and evaluation runs actually executed">
        <p className="mb-3 text-xs text-slate-400">Read live from <code>ml/experiments/*.json</code>. All runs: Ultralytics YOLOv8, CPU only, seeded, deterministic, on the 360-image real subset at 512 px, batch 8.</p>
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-[11px]">
            <thead className="bg-white/5 text-cyan-200"><tr>{["Run", "Status", "Model / config", "Epochs", "Time", "Val mAP@0.5", "Test P", "Test R", "Test F1", "Test mAP@0.5", "Test mAP@0.5:0.95"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {experiments.map((e) => (
                <tr key={e.id} className="border-t border-white/5 align-top text-slate-300">
                  <td className="px-2 py-1.5 font-medium text-white">{e.id}</td>
                  <td className="px-2 py-1.5"><Badge tone={e.status === "evaluated" ? "measured" : "warn"}>{e.status}</Badge></td>
                  <td className="px-2 py-1.5 font-mono">{String(e.config.model)}<br />imgsz {String(e.config.imgsz)} · batch {String(e.config.batch)} · seed {String(e.config.seed)}</td>
                  <td className="px-2 py-1.5">{String(e.training.epochs_completed ?? "—")}/{String(e.config.epochs)}</td>
                  <td className="px-2 py-1.5">{e.training.elapsed_seconds ? `${(e.training.elapsed_seconds / 60).toFixed(1)} min` : "—"}</td>
                  <td className="px-2 py-1.5">{f3(e.metrics.map50)}</td>
                  <td className="px-2 py-1.5">{f3(e.evaluation.precision)}</td>
                  <td className="px-2 py-1.5">{f3(e.evaluation.recall)}</td>
                  <td className="px-2 py-1.5">{f3(e.evaluation.f1)}</td>
                  <td className="px-2 py-1.5 font-semibold text-emerald-200">{f3(e.evaluation.map50)}</td>
                  <td className="px-2 py-1.5">{f3(e.evaluation.map50_95)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3 space-y-2 text-xs text-slate-300">
          <p><strong className="text-white">Environment recorded with every run:</strong> Python {String(env.python)}, PyTorch {String(env.torch)}, Ultralytics {String(env.ultralytics)}, CUDA available {String(env.cuda_available)}, {String(env.cpu_count)} CPUs, {String(env.platform)}.</p>
          <p><strong className="text-white">Deployed artefact:</strong> <code>ml/weights/model.onnx</code> ({(onnxBytes / 1e6).toFixed(1)} MB, opset 12, input {String(model.imgsz)}×{String(model.imgsz)}, classes {JSON.stringify(model.classes)}, exported {String(model.exported_at)}) from run <span className="font-mono">{String(model.name)}</span> — its metadata carries the dataset name, data origin and the measured metrics so the UI can always show provenance.</p>
          <p><strong className="text-white">The negative result, kept on purpose.</strong> The &ldquo;improved&rdquo; P2 variant scored <em>below</em> the baseline (mAP@0.5 0.665 vs 0.875). The failure analysis explains it: in this dataset almost every streak falls in the &gt; 48 px bin (median box ≈ 25 % of the frame), so a stride-4 head for tiny objects solves a problem the data does not have, while costing parameters and transferable weights on a short CPU schedule. Reporting this honestly is worth more than quoting the better number alone — and it tells you exactly when the P2 experiment <em>would</em> be the right choice (faint, short trails in wide-field survey frames).</p>
          <p><strong className="text-white">Not done, and therefore not claimed:</strong> multiple seeds (no variance estimate), the full 1,642-image set, longer schedules, hyper-parameter search, cross-sensor generalisation, and a literature-grade comparison against published streak detectors.</p>
        </div>
      </Card>

      <Card title="6 · Verification log (what was run before delivery)">
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">Static checks &amp; tests</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>✅ <code>npx next typegen</code> — route types generated.</li>
              <li>✅ <code>tsc --noEmit</code> — 0 errors (strict mode).</li>
              <li>✅ <code>next build</code> — production build, {pages.length} pages + {apiRoutes.length} API routes compiled.</li>
              <li>✅ <code>eslint src tests</code> — 0 errors, 0 warnings (incl. React-hooks rules).</li>
              <li>✅ <code>vitest run</code> — {testCount} tests: detector recall/false-positive rejection/determinism, IoU, variant comparison, Kalman coasting through a missing frame, star-vs-mover separation, TLE checksum &amp; range validation, OMM parsing, SGP4 sanity (ISS altitude 380–450 km, speed 7.5–7.8 km/s), epoch-age refusal, conjunction refinement and RIC-norm consistency.</li>
              <li>✅ <code>drizzle-kit push</code> — <code>runs</code> table created; <code>/api/health</code> returns <code>{'{ ok: true }'}</code>.</li>
            </ul>
          </div>
          <div>
            <h3 className="mb-2 text-sm font-semibold text-white">End-to-end API smoke test (measured)</h3>
            <ul className="space-y-1 text-xs text-slate-300">
              <li>✅ Classical detection on a synthetic sample: 41 detections, precision 0.878 / recall 0.973 vs that frame&rsquo;s truth, 173 ms.</li>
              <li>✅ ONNX/YOLO on a <em>real</em> held-out test image: 1 streak at confidence 0.921, box [22.6, 336.8, 273.3, 529.3] ≈ IoU 0.9 with the label — the deployed model works through the web API.</li>
              <li>✅ Malformed upload rejected with HTTP 415 and a user-safe message (no path or stack trace leaked).</li>
              <li>✅ Tracking a synthetic sequence: 8 frames, 287 detections, 36 confirmed tracks (2 moving, 34 stationary), 100 % truth coverage, 1 fragment per true track.</li>
              <li>✅ Corrupted TLE (bad checksum) rejected: <em>&ldquo;Checksum mismatch on line 1 (expected 6)&rdquo;</em>.</li>
              <li>✅ ISS propagation: 96 samples, altitude 418.8 km at start, no warnings.</li>
              <li>✅ Conjunction screen (two Cosmos-2251 fragments, 24 h @ 30 s = 2,881 samples): TCA 12:17:52.962Z, miss 4,121.56 km, relative speed 13.61 km/s, RIC norm equals the miss distance.</li>
              <li>✅ Benchmark: baseline P 0.936 / R 0.700 vs improved P 0.792 / R 0.889 — the expected precision/recall trade-off.</li>
              <li>✅ All {pages.length} pages returned HTTP 200; sample PNG endpoint served <code>image/png</code>.</li>
            </ul>
          </div>
        </div>
      </Card>

      <Card title="7 · Module map (what each part is responsible for)">
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-[11px]">
            <thead className="bg-white/5 text-cyan-200"><tr>{["File", "Responsibility", "Key design point"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-semibold">{h}</th>)}</tr></thead>
            <tbody>{MODS.map((m, i) => <tr key={i} className="border-t border-white/5 align-top text-slate-300"><td className="px-2 py-1.5 font-mono text-cyan-100">{m[0]}</td><td className="px-2 py-1.5 text-white">{m[1]}</td><td className="px-2 py-1.5">{m[2]}</td></tr>)}</tbody>
          </table>
        </div>
      </Card>

      <Card title="8 · Honest limits of this build">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
          <li><strong className="text-white">Backend shape.</strong> The brief suggested FastAPI; the deployment platform runs one Node.js app, so the REST API is implemented as Next.js route handlers (same endpoints, same validation discipline, Pydantic-equivalent hand-rolled clamping). Training stays in Python. Each <code>src/lib/*</code> function maps one-to-one onto a FastAPI endpoint if you want to split the stack later.</li>
          <li><strong className="text-white">No GPU, one session.</strong> Experiments are CPU-scale: a 360-image subset, ≤ 20 epochs, single seed. They are a validated baseline, not a competitive detector.</li>
          <li><strong className="text-white">Data is not redistributed.</strong> The 1.4 GB dataset and the Python virtual environment are not part of the repo; only provenance (manifest, experiment records, exported ONNX + metadata) is. Re-create them with the documented commands.</li>
          <li><strong className="text-white">No CI pipeline.</strong> Checks are runnable locally (<code>npm test</code>, <code>npm run typecheck</code>, <code>npm run build</code>) but no GitHub Actions workflow is committed.</li>
          <li><strong className="text-white">Optional native dependency.</strong> <code>onnxruntime-node</code> needs a prebuilt binary for your platform; if it cannot load, the app reports that and keeps working with the classical detector.</li>
          <li><strong className="text-white">Scope boundaries kept on purpose:</strong> no plate solving or orbit determination (image tracks stay in pixels), no covariance-based collision probability, no manoeuvre advice, no user accounts.</li>
        </ul>
      </Card>

      <Card title="9 · Reproduce this build from scratch">
        <p className="mb-2 text-xs text-slate-400">Expected wall-clock times on 4 CPU cores / no GPU.</p>
        <Code>{`# 1. Web app (~2 min)
npm install && cp .env.example .env && npm run db:push && npm run dev

# 2. Python ML environment (~5-10 min, mostly download)
python3 -m venv .venv && source .venv/bin/activate
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r ml/requirements.txt

# 3. Data (~10 min for the 1.4 GB download)
#    download + unzip https://doi.org/10.5281/zenodo.14047943
python ml/scripts/prepare_dataset.py --source /path/to/StreaksYoloDataset --out ml/data/streaks \\
  --classes streak --name StreaksYoloDataset --origin real --licence "CC BY 4.0" \\
  --source-url https://doi.org/10.5281/zenodo.14047943 --keep-splits --limit 360 --seed 42

# 4. Train + evaluate + deploy (~14 min baseline, ~22 min P2 variant)
python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=20 --set imgsz=512 --set batch=8
python ml/scripts/evaluate.py --run baseline-streaks
python ml/scripts/export_onnx.py --run baseline-streaks
python ml/scripts/train.py --config ml/configs/improved_p2.yaml --set epochs=20 --set imgsz=512 --set batch=8
python ml/scripts/evaluate.py --run improved-p2-streaks-20ep

# 5. Verify (~1 min)
npm test && npm run typecheck && npm run build`}
        </Code>
      </Card>
    </div>
  );
}

const f3 = (v: number | undefined) => (v === undefined || Number.isNaN(v) ? "—" : v.toFixed(3));

/* ------------------------------------------------------------- static data */

const PHASES: Array<{ n: number; title: string; time: string; done: string; decision: string; evidence: string }> = [
  { n: 1, title: "Inspect the environment, fix the architecture", time: "14:47–14:50", done: "Probed the sandbox: Node 22, Python 3.11, 4 CPUs, 3.9 GB RAM, no GPU, no torch/opencv preinstalled, 20 GB free disk, internet available. Read the starter (Next 16 + Drizzle + Postgres).", decision: "Keep the platform's Next.js/TypeScript stack for the web app and API; put all training in Python; cross the boundary with ONNX. Do not promise a separate FastAPI service the platform cannot run.", evidence: "next.config.ts (serverExternalPackages), src/app/api/*, ml/." },
  { n: 2, title: "Dataset feasibility investigation", time: "14:50–14:52", done: "Web research on openly licensed, labelled space-object imagery; compared five candidate sources on licence, format, size and whether the pixels are real or rendered.", decision: "Use StreaksYoloDataset (real telescope frames, CC BY 4.0, YOLO labels, single class 'streak'); document SPARK/DUSTstreaks/SpaceDet as future options; reject unverifiable Roboflow/Kaggle re-uploads.", evidence: "Dataset table on /dataset; ml/data/streaks/dataset_manifest.json." },
  { n: 3, title: "Backend and functional frontend skeleton", time: "14:52–15:00", done: "Installed npm deps (recharts, satellite.js, pngjs, jpeg-js, onnxruntime-node, vitest). Wrote the image codec layer, logging, error-envelope helpers, Drizzle schema for the run log, nav/layout/theme and shared UI primitives.", decision: "Pure-JS image codecs (no native build step) with magic-byte sniffing and hard size limits; one 'runs' table instead of a normalised schema; every route wrapped in an error boundary that never leaks stack traces.", evidence: "src/lib/vision/image.ts, src/lib/api.ts, src/db/schema.ts, src/components/ui.tsx." },
  { n: 4, title: "Detection pipeline and model integration", time: "15:00–15:12", done: "Implemented the classical source extractor (two variants), the synthetic frame generator with ground truth, and the ONNX inference path (letterbox → NCHW → decode [1,4+nc,A] → NMS). Trained the first real YOLO run and exported it.", decision: "Ship a transparent classical detector as the always-available baseline, and treat the neural model as an optional engine whose availability and provenance are reported explicitly.", evidence: "src/lib/vision/detector.ts, onnx.ts; ml/weights/model.json." },
  { n: 5, title: "Evaluation and experiment tracking", time: "15:12–15:25", done: "Wrote metrics (precision/recall/F1/AP with both centroid and IoU matching), the seeded synthetic benchmark API, and the Python experiment-record format; ran the 20-epoch baseline and the P2 variant with held-out test evaluation and size-binned failure analysis.", decision: "Record every run (config, seed, dataset digest, curves, environment) in ml/experiments/*.json and render those files verbatim in the UI — no number appears on screen that is not in a record.", evidence: "src/lib/vision/evaluate.ts, ml/scripts/{train,evaluate}.py, /dataset page." },
  { n: 6, title: "Tracking where feasible", time: "15:14–15:20", done: "Implemented a 4-state Kalman filter with gated greedy association, coasting, confirmation and termination; generated multi-frame synthetic sequences with dropouts; added a truth-recovery score.", decision: "No real image sequences with timestamps were available, so tracking is demonstrated on synthetic sequences and user uploads, and its output is explicitly labelled as image-plane motion.", evidence: "src/lib/vision/tracker.ts, tests/tracker.test.ts, /tracking." },
  { n: 7, title: "Orbital import, propagation, conjunction screening", time: "14:51–15:16", done: "Fetched real CelesTrak element sets (TLE + OMM), froze a checksum-verified snapshot into the repo, wrote strict TLE/OMM validation, SGP4 propagation with frame/age checks, and conjunction screening with golden-section refinement and RIC decomposition.", decision: "Use satellite.js (Vallado's reference SGP4 port) rather than writing orbital maths; refuse to print a collision probability because TLEs carry no covariance.", evidence: "src/lib/orbital/{tle,propagate,conjunction,catalog}.ts, tests/orbital.test.ts." },
  { n: 8, title: "Dashboard integration and downloadable reports", time: "15:16–15:26", done: "Built all eight original pages plus the API surface, wired every module to the run log, and added JSON/CSV/Markdown export with a Markdown research-report generator.", decision: "Best-effort persistence: a database outage must never break an analysis, so saveRun() logs a warning and returns null.", evidence: "src/lib/runs.ts, /reports, src/app/api/reports/*." },
  { n: 9, title: "Test the whole application, fix what broke", time: "15:26–15:35", done: "Ran a full API smoke test against a temporary production server (every endpoint, valid and invalid inputs), fixed a Tailwind v4 @apply error, a Float32Array variance type error, a setState-in-effect lint error, and UTC parsing of datetime inputs.", decision: "Verify by execution, not by reading: every claim on the home page status panel is backed by a call that was actually made.", evidence: "Verification log below; git-tracked fixes in globals.css, detector.ts, reports/page.tsx." },
  { n: 10, title: "Documentation and setup guide", time: "15:35–15:50", done: "Wrote the README (architecture, tree, install for Ubuntu/Windows, data flow, training, propagation assumptions, API reference with examples, troubleshooting, implemented/demonstrated/future lists), ml/README.md, .env.example, .gitignore, then the interactive Tutorial and this build record.", decision: "Document what is missing as clearly as what works, and give exact commands with expected durations so a student can reproduce everything.", evidence: "README.md, ml/README.md, ml/data/README.md, /tutorial, /how-built." },
];

type Facts = { apiRoutes: number; testCount: number; env: Record<string, unknown> };

const toolGroups = (F: Facts): Array<{ title: string; rows: Array<Array<string>> }> => [
  {
    title: "Web frontend",
    rows: [
      ["Next.js (App Router)", pkgVersion("next"), "Pages, routing, server components and the REST API in one deployable app", "The platform's stack; server components let pages read experiment records from disk with zero client JS", "MIT"],
      ["React", pkgVersion("react"), "UI rendering for the eight interactive modules", "Comes with Next 16; concurrent features not needed here", "MIT"],
      ["TypeScript", pkgVersion("typescript"), "Strict typing across lib, API and UI", "Catches unit/frame mistakes (e.g. Float32Array variance) at compile time", "Apache-2.0"],
      ["Tailwind CSS", pkgVersion("tailwindcss"), "Dark space theme, responsive layout, accessible focus states", "Already wired in the starter; v4 CSS-first config with a custom @theme palette", "MIT"],
      ["Recharts", pkgVersion("recharts"), "Loss/metric curves, benchmark bars, separation-over-time (log scale), ground track scatter", "Chosen over Chart.js/D3 for declarative React charts; ground track drawn without map tiles to avoid an external tile provider", "MIT"],
      ["Canvas 2D (native)", "—", "Annotation overlay: boxes, labels, trajectories, PNG export", "No extra dependency; pixel-accurate and downloadable via toDataURL", "—"],
    ],
  },
  {
    title: "Backend, API and data",
    rows: [
      ["Next.js route handlers", pkgVersion("next"), `${F.apiRoutes} JSON endpoints (detect, track, evaluate, propagate, conjunction, catalog, samples, experiments, model, reports, health)`, "FastAPI was the brief's suggestion but the platform runs a single Node app; handlers give the same REST contract", "MIT"],
      ["Drizzle ORM", pkgVersion("drizzle-orm"), "Typed access to the 'runs' table (experiment/analysis log)", "Lightweight, SQL-first, no codegen step needed for one table", "Apache-2.0"],
      ["node-postgres (pg)", pkgVersion("pg"), "Connection pool to PostgreSQL", "Standard driver; DATABASE_URL from .env only", "MIT"],
      ["PostgreSQL", "14+ (server)", "Persistent run log: inputs, params, metrics, outputs, limitations", "Provided by the platform; a DB outage degrades gracefully to 'not saved'", "PostgreSQL Licence"],
      ["pngjs / jpeg-js", `${pkgVersion("pngjs")} / ${pkgVersion("jpeg-js")}`, "Server-side image decode/encode without native builds", "sharp/jimp rejected: native binaries complicate install on student machines", "MIT / BSD"],
      ["Zod-like hand-rolled validation", "—", "Clamping and validation of every request field (num(), parseParams, TLE/OMM validators)", "Keeps the dependency count low; validation messages are written for users", "—"],
    ],
  },
  {
    title: "AI / computer vision",
    rows: [
      ["Python", String(F.env.python ?? "3.11"), "Training, evaluation, dataset preparation, ONNX export", "The ML ecosystem's language; kept entirely inside ml/", "PSF"],
      ["PyTorch (CPU build)", String(F.env.torch ?? "2.14.x"), "Tensor backend for training", "CPU wheel from download.pytorch.org to keep the install small (no GPU in the sandbox)", "BSD-3"],
      ["Ultralytics YOLOv8", String(F.env.ultralytics ?? "8.3.x"), "Detector architecture, training loop, validation, ONNX export", "YOLOv8n = 3.2 M params, trains on a laptop CPU; yolov8n-p2.yaml provides the small-object head", "AGPL-3.0"],
      ["OpenCV (headless)", "5.x", "Image I/O in the Python generators", "headless variant avoids libGL failures on servers", "Apache-2.0"],
      ["NumPy", "2.x", "Array maths in the synthetic generator", "Standard", "BSD-3"],
      ["ONNX + onnxslim", "1.1x", "Portable model graph, simplified for CPU inference", "Lets the TypeScript API run the trained model without Python at request time", "Apache-2.0"],
      ["onnxruntime-node", pkgVersion("onnxruntime-node"), "In-process CPU inference of ml/weights/model.onnx", "Listed in serverExternalPackages so its native binaries are not bundled; optional at runtime", "MIT"],
      ["Classical CV (own code)", "1.0", "Background modelling, MAD noise estimate, matched filter, connected components, second-moment shape analysis", "SExtractor-style baseline: transparent, interpretable, works with zero training data", "MIT (this project)"],
      ["Kalman filter + gated NN association (own code)", "1.0", "Multi-frame tracking in image coordinates", "SORT-like but dependency-free and readable; Hungarian assignment left as future work", "MIT (this project)"],
    ],
  },
  {
    title: "Orbital mechanics and space data",
    rows: [
      ["satellite.js", pkgVersion("satellite.js"), "SGP4/SDP4 propagation, GMST, TEME→geodetic conversion", "Port of Vallado's reference implementation — no invented orbital maths; Skyfield (Python) was the brief's suggestion but propagation is needed inside the Node API", "MIT"],
      ["CelesTrak GP data API", "live", "Real TLE/OMM element sets (stations, science, three debris clouds)", "Free, documented, no key; 2 h cache respects their usage guidance; snapshot bundled as fallback", "See CelesTrak usage guidance"],
      ["StreaksYoloDataset", "Zenodo 14047944", "2,388 real annotated telescope frames used for training/evaluation", "Only candidate that is real, openly licensed and YOLO-formatted", "CC BY 4.0"],
      ["Own TLE/OMM validator", "1.0", "Line length, line numbers, catalogue-number consistency, modulo-10 checksums, element ranges, epoch parsing, age checks", "Bad element sets must fail loudly before SGP4 sees them", "MIT (this project)"],
    ],
  },
  {
    title: "Testing, quality and developer tooling",
    rows: [
      ["Vitest", pkgVersion("vitest"), `${F.testCount} unit/integration tests across detector, tracker, TLE parsing, SGP4 sanity and conjunction geometry`, "Fast, TS-native, no Babel; jsdom not needed (pure logic tests)", "MIT"],
      ["ESLint + eslint-config-next", pkgVersion("eslint"), "Lint gate including react-hooks rules", "Caught a setState-in-effect pattern that was refactored to useSyncExternalStore", "MIT"],
      ["tsc --noEmit / next typegen", pkgVersion("typescript"), "Strict type gate and generated route types", "Run before every build", "Apache-2.0"],
      ["drizzle-kit", pkgVersion("drizzle-kit"), "Schema push without migration files (npm run db:push)", "Simplest path for a single-table schema", "Apache-2.0"],
      ["curl + python3 one-liners", "—", "End-to-end API smoke tests against a temporary production server", "Verifies real responses (including the ONNX path on a real test image) rather than assuming", "—"],
      ["Git", "—", "Version control; .gitignore excludes ml/data, ml/runs and *.pt but keeps weights/model.onnx, model.json and experiment records", "Artefacts that the UI depends on must ship; bulk data must not", "GPL-2.0"],
    ],
  },
];

const DECISIONS: Array<Array<string>> = [
  ["One deployable Next.js app instead of separate React+FastAPI services", "Vite SPA + FastAPI; microservices", "The platform runs a single Node process; splitting would add a proxy, CORS and a second deploy target for no functional gain", "Python is still used where it matters (training); the API contract is plain REST/JSON so it could be re-hosted on FastAPI unchanged"],
  ["Classical detector as the default engine, YOLO as optional", "YOLO-only; classical-only", "A neural model may be absent on a fresh clone; the app must still do real work and teach something", "Every response states which engine ran, and a fallback is announced in a banner — never silently"],
  ["Train on real data, benchmark the classical detector on synthetic data", "Train on synthetic data and call it debris detection", "Only real frames can support a claim about real observations; synthetic frames are fine for pipeline validation and are labelled as such", "Two clearly separated result categories in the UI and in the run log (data_origin)"],
  ["satellite.js SGP4 instead of writing propagation maths", "Kepler-only propagation; Skyfield via a Python sidecar", "SGP4 is the standard for TLEs and matches how the catalogue was built; a sidecar would add a second runtime", "Output frame (TEME) and accuracy limits are printed with every result"],
  ["Screening only — no collision probability", "Fake a Pc from an assumed covariance", "TLEs have no covariance; any Pc would be fabricated. Operators need CDM-grade data and validated methods", "The Close-Approach page states this in a banner, in the assumptions list and in every report"],
  ["One 'runs' table with JSONB columns", "Normalised schema per module; file-only storage", "Five heterogeneous analysis kinds share the same lifecycle (params → output → limitations → export)", "runToRows()/runToMarkdown() flatten each kind for CSV and reports"],
  ["Bundled TLE snapshot + optional live fetch", "Live-only; bundled-only", "Live-only breaks offline demos; bundled-only goes stale silently", "Snapshot carries its fetch date; live results are cached 2 h and failures fall back with a notice"],
  ["Pure-JS image codecs", "sharp (native), jimp, browser-side canvas decoding", "No native build step, works on any Node install; server-side decoding keeps uploads validated before any processing", "12 MB / 16 MP limits protect against decompression bombs"],
  ["Deterministic seeded generators in both languages", "Random demos; shipping binary sample images", "Samples, sequences and benchmarks are reproducible and the repo stays text-only", "Python and TS generators implement the same scene model so results are comparable"],
];

const modules = (F: Pick<Facts, "apiRoutes" | "testCount">): Array<[string, string, string]> => [
  ["src/lib/vision/image.ts", "Upload handling: magic-byte sniffing, PNG/JPEG decode, luminance + RGB planes, size limits", "Rejects by content, not by declared MIME type"],
  ["src/lib/vision/detector.ts", "Classical source extractor (two variants) with SNR, shape and elongation measurements", "Every parameter has a physical meaning; confidence is documented as a heuristic"],
  ["src/lib/vision/synthetic.ts", "Seeded synthetic frames, curated samples and multi-frame sequences with ground truth", "Includes unlabelled hot pixels so false-positive rejection is testable"],
  ["src/lib/vision/evaluate.ts", "Matching, precision/recall/F1/AP (centroid + IoU@0.5), SNR-binned failure analysis, benchmark runner", "Reports lenient and strict matching side by side"],
  ["src/lib/vision/tracker.ts", "4-state Kalman filter, gated greedy association, coasting, confirmation, star/mover classification", "Velocity from a least-squares fit over measured points, not the raw filter state"],
  ["src/lib/vision/onnx.ts", "Optional YOLO inference: letterbox, CHW tensor, output decode, class-wise NMS, model status reporting", "Explains precisely why the engine is unavailable when it is"],
  ["src/lib/orbital/tle.ts", "TLE/OMM parsing, checksum and range validation, Keplerian derived quantities, regime classification", "Validation happens before propagation, with line-level error messages"],
  ["src/lib/orbital/propagate.ts", "SGP4 window propagation, TEME→geodetic conversion, epoch-age warnings and refusals", "Sample cap (20k) prevents runaway requests"],
  ["src/lib/orbital/conjunction.ts", "Coarse separation sampling, local minima, golden-section refinement, RIC decomposition, assumptions block", "Deliberately returns no probability"],
  ["src/lib/orbital/catalog.ts", "Bundled snapshot + live CelesTrak fetch with 2 h cache and graceful fallback", "Data freshness is always labelled"],
  ["src/lib/runs.ts", "Run persistence, CSV flattening per run kind, Markdown research-report generation", "Best-effort: DB failures never break an analysis"],
  ["src/app/api/*", `${F.apiRoutes} REST endpoints with shared error envelopes and input clamping`, "No stack traces, paths or secrets in responses"],
  ["ml/scripts/*.py", "Synthetic generator, dataset preparation, training, evaluation, ONNX export", "Each run writes a complete, honest experiment record"],
  ["ml/experiments/*.json", "Measured records: config, seed, dataset manifest, per-epoch curves, val + test metrics, environment", "The UI renders these files verbatim"],
  ["tests/*.test.ts", `${F.testCount} tests covering detection, tracking, TLE/OMM, SGP4 sanity and conjunction geometry`, "Assert physical sanity (ISS altitude/speed) as well as code behaviour"],
];
