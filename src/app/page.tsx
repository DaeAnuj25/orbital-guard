import Link from "next/link";
import { Badge, Card, ModuleLink } from "@/components/ui";
import { getModelStatus } from "@/lib/vision/onnx";
import { getBundledCatalog } from "@/lib/orbital/catalog";

export const dynamic = "force-dynamic";

const PIPELINE = [
  { step: "1", title: "Image / sequence", text: "Upload a telescope frame or pick a labelled synthetic sample." },
  { step: "2", title: "Detection", text: "Classical source extractor (always) or trained YOLO model (when weights exist)." },
  { step: "3", title: "Tracking", text: "Kalman + association across frames → stationary stars vs moving candidates." },
  { step: "4", title: "Orbit data", text: "Validated TLE / OMM elements from CelesTrak, propagated with SGP4." },
  { step: "5", title: "Close approach", text: "Sampled separation, refined minimum, RIC miss vector — screening only." },
  { step: "6", title: "Report", text: "Every run logged with parameters, metrics, limitations; export JSON/CSV/MD." },
];

export default async function HomePage() {
  const model = await getModelStatus();
  const catalog = getBundledCatalog();
  return (
    <div className="space-y-10">
      <section className="relative overflow-hidden rounded-2xl border border-cyan-400/20 bg-gradient-to-br from-space-800/80 via-space-900/80 to-space-950 p-8 sm:p-12">
        <OrbitArt />
        <div className="relative max-w-3xl">
          <Badge tone="info">Research prototype · v0.1</Badge>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-white sm:text-5xl">ORBITAL GUARD</h1>
          <p className="mt-2 text-lg text-cyan-200">AI-Powered Space Debris Detection and Collision Risk Analysis</p>
          <p className="mt-4 text-slate-300">
            An honest, end-to-end exploration of how computer vision, multi-frame tracking and orbital mechanics can support
            space-debris monitoring: detect objects in optical frames, follow them across a sequence, propagate catalogued
            orbits with SGP4, and screen pairs of objects for close approaches — while being explicit about what each step
            can and cannot claim.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href="/detection" className="btn-primary">Open the Detection Lab</Link>
            <Link href="/learn" className="btn-secondary">Start with the Learning Centre</Link>
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-3">
        <Card title="The problem" className="lg:col-span-2">
          <div className="space-y-3 text-sm text-slate-300">
            <p>
              Earth orbit holds roughly 35,000 tracked objects larger than 10 cm and an estimated million fragments between 1 and 10 cm
              (ESA Space Environment Report). At orbital speeds of ~7.5 km/s in LEO, even a 1 cm fragment carries the energy of a
              hand grenade. Fragmentation events — the 2007 Fengyun-1C test and the 2009 Iridium-33 / Cosmos-2251 collision among the
              worst — created debris clouds that are still tracked today (this project ships real element sets from those clouds).
            </p>
            <p>
              Keeping satellites safe is a chain of very different tasks: <strong className="text-white">observing</strong> objects
              with radar or telescopes, <strong className="text-white">detecting</strong> them in sensor data,
              <strong className="text-white"> tracking</strong> them to build orbits, <strong className="text-white">cataloguing</strong>
              and propagating those orbits, and <strong className="text-white">screening</strong> for conjunctions. A deep-learning
              detector helps only with one link of this chain — and ORBITAL GUARD is built to make that distinction visible.
            </p>
          </div>
        </Card>
        <Card title="Live system status">
          <ul className="space-y-2 text-sm">
            <StatusRow ok label="Classical detector" detail="source extractor v1.0 (always available)" />
            <StatusRow ok={model.available} label="Trained YOLO model (ONNX)" detail={model.available ? `${model.meta?.name} · ${model.meta?.dataset ?? "dataset n/a"} · ${model.meta?.data_origin} data` : "not available — see Dataset & Model"} />
            <StatusRow ok label="Kalman tracker" detail="image-plane tracking, synthetic or uploaded frames" />
            <StatusRow ok label="SGP4 propagation" detail={`satellite.js · ${catalog.objects.length} bundled real element sets (snapshot ${catalog.fetchedAt.slice(0, 10)})`} />
            <StatusRow ok label="Run log & reports" detail="PostgreSQL via Drizzle; JSON / CSV / Markdown export" />
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">System pipeline</h2>
        <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          {PIPELINE.map((p) => (
            <li key={p.step} className="card relative p-4">
              <div className="mb-2 flex h-7 w-7 items-center justify-center rounded-full bg-cyan-400/15 font-mono text-sm text-cyan-200">{p.step}</div>
              <div className="font-semibold text-white">{p.title}</div>
              <p className="mt-1 text-xs text-slate-400">{p.text}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <Card title="What the system does (implemented)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>Runs a transparent classical detector on any PNG/JPEG you upload, with bounding boxes, class, SNR-based score and annotated download.</li>
            <li>Runs a <em>genuinely trained</em> YOLOv8n streak detector (Ultralytics, CPU, real StreaksYoloDataset subset) through ONNX when the weights are present.</li>
            <li>Benchmarks two detector variants on seeded synthetic frames with precision, recall, F1, AP and recall-by-SNR failure analysis.</li>
            <li>Tracks objects across frames with a Kalman filter, survives missed detections, and separates stationary stars from movers.</li>
            <li>Validates TLE/OMM input (format, checksum, ranges, epoch age) and propagates with SGP4 via satellite.js, in a stated frame.</li>
            <li>Screens two catalogued objects for closest approach with a refined TCA, miss distance, relative speed and RIC components.</li>
            <li>Logs every run with parameters, metrics and limitations; exports JSON, CSV and Markdown reports.</li>
          </ul>
        </Card>
        <Card title="What it does not claim (current limitations)">
          <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-300">
            <li>No image detection is ever labelled &ldquo;debris&rdquo;. A streak or point source is a signal; identification needs orbit association with calibrated observations.</li>
            <li>The trained model is small (few hundred training images, CPU, short schedule): useful as a baseline, not as a validated detector.</li>
            <li>Synthetic benchmarks validate the pipeline, not real-world performance; they are labelled as demonstration data everywhere.</li>
            <li>Image-plane tracks are not orbits — no plate solution or orbit determination is implemented.</li>
            <li>Close-approach results are screening estimates from public TLEs; no covariance → no collision probability, no manoeuvre advice.</li>
            <li>Live CelesTrak data depends on network access; otherwise a dated bundled snapshot is used and labelled as such.</li>
          </ul>
        </Card>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-white">Modules</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <ModuleLink href="/detection" title="AI Detection Laboratory" description="Upload or pick a sample, choose the engine, inspect boxes, scores and diagnostics." status={<Badge tone="ok">Live</Badge>} />
          <ModuleLink href="/dataset" title="Dataset & Model Laboratory" description="Dataset investigation, measured training runs, synthetic benchmark, training scripts." status={<Badge tone={model.available ? "measured" : "warn"}>{model.available ? "Measured" : "No weights"}</Badge>} />
          <ModuleLink href="/tracking" title="Space Object Tracking" description="Multi-frame tracking in image coordinates with IDs, trajectories and dropout handling." status={<Badge tone="ok">Live</Badge>} />
          <ModuleLink href="/orbital" title="Orbital Analysis" description="Import TLE/OMM, validate, propagate with SGP4, plot altitude and ground track." status={<Badge tone="ok">Live</Badge>} />
          <ModuleLink href="/conjunction" title="Close-Approach Analysis" description="Screen two catalogued objects: TCA, miss distance, relative velocity, RIC frame." status={<Badge tone="warn">Screening</Badge>} />
          <ModuleLink href="/reports" title="Results & Research Reports" description="Every run with parameters, metrics and limitations; JSON/CSV/Markdown downloads." status={<Badge tone="ok">Live</Badge>} />
          <ModuleLink href="/tutorial" title="Step-by-Step Tutorial" description="Hands-on guide to every feature: controls, defaults, how to read results, exports and fixes." status={<Badge tone="info">Interactive</Badge>} />
          <ModuleLink href="/how-built" title="How It's Built" description="Build log, complete tool inventory with versions, architecture decisions, training runs and verification results." status={<Badge tone="measured">Build log</Badge>} />
          <ModuleLink href="/learn" title="Learning Centre" description="Debris, orbits, detection metrics, tracking, TLEs and conjunction analysis explained." status={<Badge tone="info">Guide</Badge>} />
          <ModuleLink href="/api/experiments" title="REST API" description="JSON endpoints for detection, tracking, propagation, conjunction, reports (see README)." status={<Badge tone="neutral">Docs</Badge>} />
        </div>
      </section>
    </div>
  );
}

function StatusRow({ ok, label, detail }: { ok: boolean; label: string; detail: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={`mt-1 inline-block h-2.5 w-2.5 flex-none rounded-full ${ok ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
      <div>
        <div className="text-slate-100">{label}</div>
        <div className="text-xs text-slate-400">{detail}</div>
      </div>
    </li>
  );
}

function OrbitArt() {
  return (
    <svg className="pointer-events-none absolute -right-16 -top-16 h-[420px] w-[420px] opacity-40" viewBox="0 0 400 400" aria-hidden="true">
      <circle cx="200" cy="200" r="60" fill="url(#g)" />
      <defs><radialGradient id="g"><stop offset="0%" stopColor="#22d3ee" stopOpacity="0.5" /><stop offset="100%" stopColor="#22d3ee" stopOpacity="0" /></radialGradient></defs>
      {[90, 130, 175].map((r, i) => <ellipse key={r} cx="200" cy="200" rx={r} ry={r * 0.42} fill="none" stroke={i === 1 ? "#a5b4fc" : "#67e8f9"} strokeWidth="1" transform={`rotate(${-20 + i * 25} 200 200)`} />)}
      <circle cx="290" cy="165" r="3" fill="#f8fafc" /><circle cx="95" cy="240" r="2.5" fill="#f8fafc" /><circle cx="330" cy="260" r="2" fill="#f8fafc" />
    </svg>
  );
}
