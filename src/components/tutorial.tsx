"use client";
/**
 * Tutorial content + interactive renderer.
 *
 * One guide per module, written as numbered steps that mirror exactly what the
 * UI shows (control names, defaults, and what each result field means). Feature
 * progress is persisted in localStorage so a student can work through the
 * checklist across sessions; the search box filters features by title/keywords.
 */
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { Badge } from "@/components/ui";

/* ------------------------------------------------------------------ types */

interface Step { text: ReactNode }
interface Feature { title: string; keywords: string; steps: Step[]; tip?: ReactNode }
interface Section { id: string; title: string; blurb: string; minutes: number; features: Feature[] }

const s = (text: ReactNode): Step => ({ text });
const c = (cmd: string) => <Code>{cmd}</Code>;

/* ------------------------------------------------------------------ small UI */

export function Code({ children }: { children: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="group/code relative my-1 block">
      <code className="block overflow-x-auto whitespace-pre rounded-md border border-white/10 bg-black/50 px-3 py-2 font-mono text-[11px] leading-relaxed text-cyan-100">{children}</code>
      <button
        type="button"
        aria-label="Copy command"
        onClick={() => { navigator.clipboard?.writeText(children).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200); }); }}
        className="absolute right-1.5 top-1.5 rounded border border-white/10 bg-white/10 px-1.5 py-0.5 text-[10px] text-slate-200 opacity-0 transition group-hover/code:opacity-100 focus:opacity-100"
      >
        {copied ? "copied" : "copy"}
      </button>
    </span>
  );
}

function Note({ children }: { children: ReactNode }) {
  return <p className="my-1 rounded-md border border-cyan-400/20 bg-cyan-400/5 px-3 py-2 text-xs text-slate-300">{children}</p>;
}

/* ------------------------------------------------------------------ content */

const GUIDE: Section[] = [
  {
    id: "start", title: "Quick start & orientation", blurb: "Get a first result in about five minutes and learn where everything lives.", minutes: 5,
    features: [
      {
        title: "Five-minute first run", keywords: "quick start first run demo hello world overview",
        steps: [
          s(<>Open <Link className="text-cyan-300 underline" href="/detection">Detection Lab</Link>. The left panel already has a synthetic sample selected (<em>Bright star field + 2 streaks</em>).</>),
          s(<>Leave the engine on <em>Classical source extractor</em> and press <strong>Run detection</strong>. In under a second you get the original and the annotated frame side by side, plus a diagnostics row (noise σ, threshold, rejected components) and a table of every detection.</>),
          s(<>Switch the sample to <em>Multiple streaks</em> and re-run: the amber boxes are <code>streak</code> (moving objects), the cyan ones <code>point_source</code> (stars). Purple dashed boxes are the synthetic ground truth of that sample.</>),
          s(<>Press <strong>Download annotated PNG</strong> under the right-hand image, and <strong>Download JSON</strong> to get the raw measurement table.</>),
          s(<>Open <Link className="text-cyan-300 underline" href="/conjunction">Close Approach</Link> and press <strong>Run close-approach screening</strong> with the default pair (two Cosmos-2251 fragments). You get a time of closest approach, miss distance and relative speed from real, validated element sets.</>),
          s(<>Finally open <Link className="text-cyan-300 underline" href="/reports">Reports</Link>: both of those runs are logged there with their parameters and limitations, and each has JSON / CSV / Markdown downloads.</>),
        ],
        tip: <>Everything in this app works without an account and without paid services. The only optional pieces are the trained YOLO model (needs <code>ml/weights/</code>) and live CelesTrak data (needs internet).</>,
      },
      {
        title: "Reading the labels the app puts on results", keywords: "badge data origin synthetic demo measured limitations honesty",
        steps: [
          s(<><Badge tone="demo">Synthetic demo data</Badge> means the input came from the seeded generator in <code>src/lib/vision/synthetic.ts</code>. Those runs prove the software works; they say nothing about real skies.</>),
          s(<><Badge tone="info">User upload</Badge> means you supplied the pixels. There is no ground truth, so no precision/recall is reported.</>),
          s(<><Badge tone="measured">Measured</Badge> appears next to numbers produced by an actual run of the code (Python training records, benchmark API).</>),
          s(<><Badge tone="neutral">Bundled snapshot</Badge> / <Badge tone="ok">Live</Badge> on the orbital pages tell you whether element sets are frozen in the repo (with a fetch date) or freshly downloaded from CelesTrak.</>),
          s(<>Every result block ends with a <strong>Limitations &amp; assumptions</strong> panel. Read it before quoting a number anywhere — that is the whole point of this prototype.</>),
        ],
      },
    ],
  },
  {
    id: "detection", title: "Detection Lab", blurb: "Upload or generate a frame, choose the detector, tune it, read the output.", minutes: 10,
    features: [
      {
        title: "Uploading your own image", keywords: "upload file png jpeg limits error unsupported",
        steps: [
          s(<>Use <strong>1 · Input image → Upload PNG or JPEG</strong>. Accepted: PNG and JPEG only, ≤ 12 MB, ≤ 16 megapixels (≈ 4000×4000). The file type is decided by its magic bytes, not by the browser, so a renamed <code>.txt</code> is rejected.</>),
          s(<>Your file is previewed immediately at its true resolution — detection has not run yet. Press <strong>Run detection</strong> when ready.</>),
          s(<>If you see <em>&ldquo;Unsupported file type&rdquo;</em> convert to PNG/JPEG first (e.g. FITS must be converted: <span className="font-mono">astropy</span> or <span className="font-mono">convert in.fits out.png</span>). If you see <em>&ldquo;The file could not be decoded&rdquo;</em> the file is truncated or uses an exotic variant.</>),
          s(<>Click <strong>Clear upload and use a sample instead</strong> to go back to the synthetic samples.</>),
        ],
        tip: <>Good test images: any dark sky photo, a long-exposure frame with satellite trails, or a noisy synthetic frame. Colour images are converted to luminance internally, so colour is not lost information for detection — it just is not used.</>,
      },
      {
        title: "Classical detector parameters (baseline vs improved variant)", keywords: "k sigma threshold min area cell size psf sigma matched filter global threshold variant",
        steps: [
          s(<><strong>Variant = Local background + matched filter</strong> (default, the &ldquo;improved&rdquo; baseline): a 32 px grid of local medians is subtracted (removes gradients and vignetting), noise σ is estimated robustly from the median absolute deviation, the residual is convolved with a Gaussian matched to the PSF, and pixels above <code>k·σ</code> become candidate components.</>),
          s(<><strong>Variant = Global threshold</strong> is the simpler baseline: one median background, one σ, threshold on the raw residual. Compare the two — on faint sources the matched filter wins on recall, the global threshold often wins on precision.</>),
          s(<><strong>Threshold k·σ</strong> (default 4, range 2–10): lower finds fainter sources but adds false positives from noise. This is the single most important knob. Watch <em>Rejected</em> and the detection count change.</>),
          s(<><strong>Minimum area</strong> (default 3 px, range 1–12): connected pixels required per object. Raising it removes hot pixels and cosmic-ray hits (1 px) at the price of very compact faint stars.</>),
          s(<>Server-side constants you can change in <code>src/lib/vision/detector.ts</code>: <code>maxArea</code> (rejects the Moon / galaxies / glare), <code>cellSize</code>, <code>psfSigma</code> (match it to your seeing/PSF!) and <code>elongationThreshold</code> (2.2) which decides <code>point_source</code> vs <code>streak</code>.</>),
          s(<>The <em>Noise σ</em> and <em>Threshold</em> statistics in the result row are measured from your image — if σ is much larger than expected your frame is probably under-exposed or heavily noise-boosted.</>),
        ],
      },
      {
        title: "Trained YOLO model (ONNX engine)", keywords: "onnx yolo trained model confidence nms fallback engine unavailable",
        steps: [
          s(<>Open <strong>2 · Engine &amp; parameters</strong>. If <em>Trained YOLOv8 ONNX</em> is selectable, the weights exist at <code>ml/weights/model.onnx</code> and the card shows provenance: run name, dataset, data origin, classes, input size and the held-out test mAP.</>),
          s(<>Select it and set the <strong>Confidence threshold</strong> (default 0.25). Detections below it are discarded before non-maximum suppression (IoU 0.45).</>),
          s(<>Press <strong>Run detection</strong>. The result header shows <Badge tone="measured">YOLO ONNX</Badge> and the <em>Model</em> statistic; inference runs on CPU with onnxruntime-node (typically 0.2–1 s depending on image size).</>),
          s(<>If the option is greyed out, the reason is printed under the dropdown — no weights, missing/invalid <code>model.json</code>, or onnxruntime not loadable. Nothing is faked: the app never pretends the network ran.</>),
          s(<>If inference fails at run time you get a yellow <em>Engine fallback</em> banner and the classical detector&rsquo;s results instead. The <code>engine</code> field in the JSON response always states what actually executed.</>),
          s(<>Train and deploy your own model with: {c("python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=20 --set imgsz=512 --set batch=8\npython ml/scripts/evaluate.py --run baseline-streaks\npython ml/scripts/export_onnx.py --run baseline-streaks")}</>),
        ],
        tip: <>The deployed model knows exactly one class: <code>streak</code>. It will not box stars, and it must not be used to claim &ldquo;debris detected&rdquo; — a streak is any moving object (satellite, debris, aircraft, meteor).</>,
      },
      {
        title: "Reading and exporting detection output", keywords: "output table snr flux elongation centroid download json csv report ground truth metrics",
        steps: [
          s(<><strong>Class</strong>: <code>point_source</code> (compact, PSF-like) or <code>streak</code> (elongated; set when elongation ≥ threshold and area ≥ 2× minimum).</>),
          s(<><strong>Score</strong>: for the classical detector this is <code>1 − exp(−(SNR − kσ) / 2kσ)</code> clipped to [0.05, 0.99] — a ranking heuristic derived from signal-to-noise, <em>not</em> a probability. For YOLO it is the network&rsquo;s class score.</>),
          s(<><strong>Centroid / Box</strong>: intensity-weighted centre and the axis-aligned bounding box in pixels; <strong>SNR</strong> = flux / (σ·√area), <strong>Area</strong> = connected pixels, <strong>Elong.</strong> = ratio of the principal axes of the second moments.</>),
          s(<>For synthetic samples the violet panel scores that single frame against its known truth (precision, recall, F1, AP at 3 px centroid matching and AP@IoU 0.5). It is illustrative — one frame, not a benchmark.</>),
          s(<>Toggle <strong>Show synthetic ground truth</strong> to draw or hide the purple dashed truth boxes on the annotated canvas.</>),
          s(<>Exports: <strong>Download annotated PNG</strong> (canvas render), <strong>Download JSON</strong> (full response incl. stats, params, limitations), <strong>Download CSV</strong> (one row per detection), <strong>Research report (Markdown)</strong> (server-rendered report for the logged run).</>),
        ],
      },
    ],
  },
  {
    id: "dataset", title: "Dataset & Model Laboratory", blurb: "Inspect the data, read the measured experiments, run the live benchmark, train your own model.", minutes: 20,
    features: [
      {
        title: "Using the dataset investigation table", keywords: "dataset streaksyolo spark duststreaks spacedet roboflow licence cc by 4.0 real synthetic",
        steps: [
          s(<>Read the six-row table: source, licence, format, real-vs-simulated and known limitations for every dataset considered.</>),
          s(<>The <em>Decision</em> panel explains why StreaksYoloDataset was chosen: real telescope frames, explicit CC BY 4.0 licence, YOLO-format labels. Its single class is <code>streak</code>.</>),
          s(<>Datasets marked <em>not used</em> are documented so you can extend the project without re-doing the research. Roboflow/Kaggle re-uploads were rejected because provenance and licence could not be verified.</>),
        ],
      },
      {
        title: "Reading a measured experiment record", keywords: "experiment val test precision recall f1 map curves failure analysis environment seed record",
        steps: [
          s(<>The pills at the top list every run found in <code>ml/experiments/*.json</code> with its status (<code>created</code>, <code>running</code>, <code>trained</code>, <code>evaluated</code>, <code>failed</code>). Click one to inspect it.</>),
          s(<>The header line gives reproducibility details: dataset name and licence, split counts, model, <code>imgsz</code>, epochs, seed, torch version, CPU count and wall-clock time.</>),
          s(<><strong>Validation split</strong> numbers were used for model selection (early stopping / best weights). <strong>Held-out TEST split</strong> numbers are the ones to quote — they come from <code>evaluate.py</code>.</>),
          s(<>The two line charts show <em>box loss</em> (train vs val) and <em>precision / recall / mAP@0.5</em> per epoch, straight from Ultralytics&rsquo; <code>results.csv</code>. Diverging curves mean overfitting.</>),
          s(<>The <strong>failure analysis</strong> table breaks test recall down by ground-truth box size and reports the false-positive count at conf ≥ 0.25. This is where you look for &ldquo;does it fail on faint/small objects?&rdquo;</>),
          s(<>With two or more runs a bar chart compares them on the same axes. <strong>Download experiment record (JSON)</strong> gives you the full record for your report.</>),
          s(<>If the panel says <em>No training has been run yet</em>, nothing has been fabricated — run the commands in the next feature.</>),
        ],
      },
      {
        title: "Running the live synthetic benchmark", keywords: "benchmark synthetic evaluate api nImages seed noise brightness ksigma baseline improved recall by snr",
        steps: [
          s(<>Set <strong>Images</strong> (5–60), <strong>Seed</strong>, <strong>Noise σ</strong>, <strong>Brightness</strong> and <strong>Threshold k·σ</strong>. Same seed ⇒ same frames ⇒ comparable runs.</>),
          s(<>Press <strong>Run benchmark</strong>. The API renders those frames, runs <em>both</em> classical variants on them and computes precision, recall, F1, AP (3 px centroid matching) and AP@IoU 0.5.</>),
          s(<>Read the <em>recall by SNR bin</em> bar chart: faint (&lt; 5), low (5–10), medium (10–25), bright (&gt; 25). This is the failure analysis for the classical detector.</>),
          s(<>Experiment ideas: raise noise σ to 8 and watch recall collapse; lower kσ to 3 and watch precision fall; compare <em>Brightness ×0.5</em> with <em>×1.5</em>.</>),
          s(<>Downloads: JSON, CSV (via the logged run) and a Markdown research report. The run is tagged <Badge tone="demo">synthetic-demo</Badge> in Reports so it never mixes with experimental data.</>),
        ],
      },
      {
        title: "Training a model yourself (Python)", keywords: "train venv pip prepare dataset export onnx config baseline improved p2 ultralytics commands",
        steps: [
          s(<>Create the environment: {c("python3 -m venv .venv && source .venv/bin/activate   # Windows: .\\.venv\\Scripts\\Activate.ps1\npip install torch torchvision --index-url https://download.pytorch.org/whl/cpu\npip install -r ml/requirements.txt")}</>),
          s(<>Get the real data (1.4 GB) from <span className="font-mono">https://zenodo.org/records/14047944</span>, unzip it, then build splits: {c("python ml/scripts/prepare_dataset.py --source /path/to/StreaksYoloDataset --out ml/data/streaks \\\n  --classes streak --name StreaksYoloDataset --origin real --licence \"CC BY 4.0\" \\\n  --source-url https://doi.org/10.5281/zenodo.14047943 --keep-splits --limit 360 --seed 42")}</>),
          s(<>No real data? Generate a clearly-labelled synthetic set instead: {c("npm run ml:synthetic")}</>),
          s(<>Train the baseline, then evaluate on the held-out test split, then export: {c("python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=20 --set imgsz=512 --set batch=8\npython ml/scripts/evaluate.py --run baseline-streaks\npython ml/scripts/export_onnx.py --run baseline-streaks")}</>),
          s(<>Run the justified improvement and compare on the same splits/seed: {c("python ml/scripts/train.py --config ml/configs/improved_p2.yaml --set epochs=20 --set imgsz=512 --set batch=8\npython ml/scripts/evaluate.py --run improved-p2-streaks")}</>),
          s(<>Reload the <em>Dataset &amp; Model</em> page: the new record appears, and once <code>model.onnx</code> exists the Detection Lab offers the ONNX engine automatically.</>),
        ],
        tip: <>Any config key can be overridden with <code>--set key=value</code>. Time on 4 CPU cores: ~13 min for 20 epochs at 512 px on 259 images; a GPU (<code>--set device=0</code>) cuts this to a couple of minutes.</>,
      },
      {
        title: "Adding your own dataset", keywords: "custom dataset yolo format labels classes loader extend integrate",
        steps: [
          s(<>Put images and matching <code>.txt</code> YOLO label files anywhere (same stem, sibling <code>labels/</code> folder, or existing <code>images/train|val|test</code> layout — <code>prepare_dataset.py</code> handles all three).</>),
          s(<>Run it with your class list in YOLO-id order and an honest origin flag: {c("python ml/scripts/prepare_dataset.py --source ~/my_data --out ml/data/mine \\\n  --classes debris satellite --name MyData --origin real --licence \"my licence\" --seed 7")}</>),
          s(<>Point a config at it: copy <code>ml/configs/baseline.yaml</code>, change <code>data:</code> and <code>name:</code>, then train/evaluate/export as above. Multi-class models work unchanged — the ONNX metadata records every class name.</>),
          s(<>Malformed label lines (non-numeric or out-of-range boxes) are skipped rather than crashing training; the manifest records how many images were skipped for having no labels.</>),
        ],
      },
    ],
  },
  {
    id: "tracking", title: "Space Object Tracking", blurb: "Associate detections across frames and tell stars from movers.", minutes: 10,
    features: [
      {
        title: "Tracking a synthetic sequence", keywords: "sequence sample frames movers dropouts recovery coverage fragmentation",
        steps: [
          s(<>Pick a sequence under <strong>1 · Frame sequence</strong> (e.g. <em>Two moving objects, 8 frames</em>) and press <strong>Run tracking</strong>.</>),
          s(<>The canvas shows the current frame with faint boxes for its detections, coloured polylines for confirmed moving tracks (solid dots = measured, hollow = coasted prediction) and purple lines for the known truth trajectories.</>),
          s(<>Drag the <strong>Frame</strong> slider to replay; tick <strong>Show stationary (star) tracks</strong> to also draw the near-zero-velocity tracks (stars).</>),
          s(<>Read the statistics: frames, detections, tracks, confirmed, <em>Moving</em> (candidate resident space objects) and <em>Stationary</em> (stars).</>),
          s(<>The violet panel scores the run against truth: movers found, coverage of visible truth positions (within 4 px) and <em>fragments per true track</em> — a value &gt; 1 means a track was split by missed detections.</>),
        ],
      },
      {
        title: "Tracking your own frames", keywords: "upload frames multiple images same size temporal order limit",
        steps: [
          s(<>Use <strong>Upload 2–30 frames</strong>. Rules: 2–30 files, PNG/JPEG, all the same dimensions, and the browser&rsquo;s file order is normalised by filename (numeric-aware), so <code>frame_01.png … frame_12.png</code> sorts correctly.</>),
          s(<>Frames must come from the same sensor and exposure sequence. Sidereal tracking (stars fixed) is assumed — otherwise &ldquo;moving&rdquo; and &ldquo;stationary&rdquo; swap meaning.</>),
          s(<>A mismatched size is rejected with <em>&ldquo;All frames must have the same dimensions&rdquo;</em>; resize first (e.g. <span className="font-mono">convert -resize 512x512 in.png out.png</span>).</>),
          s(<>Click <strong>Clear N uploaded frames</strong> to return to the synthetic sequences.</>),
        ],
      },
      {
        title: "Tuning the tracker", keywords: "gate maxMisses minHits kalman association coasting parameters stationary speed",
        steps: [
          s(<><strong>Association gate</strong> (default 18 px): max distance between a predicted and a detected position. Too small ⇒ fragmented tracks; too large ⇒ identity switches in crowded fields. Rule of thumb: a few times the per-frame motion.</>),
          s(<><strong>Max consecutive misses</strong> (default 3): frames a track coasts on its prediction. Raise it for frequently dropped detections; lower it to kill ghost tracks faster.</>),
          s(<><strong>Min hits to confirm</strong> (default 3): detections needed before a track is reported. Raising it removes noise-driven one-off tracks.</>),
          s(<><strong>Detector threshold k·σ</strong> (default 4) feeds the per-frame detector — lowering it gives the tracker more (and noisier) candidates.</>),
          s(<>In <code>src/lib/vision/tracker.ts</code> you can also change <code>stationarySpeedPx</code> (0.6) which separates stars from movers, and <code>processNoise</code> / <code>measurementNoise</code> of the Kalman filter.</>),
          s(<>Exports: JSON (full tracks), CSV of track points (via the report link) and a Markdown report; the canvas has <strong>Download annotated PNG</strong> per frame.</>),
        ],
        tip: <>A track here is <em>pixels per frame on the sensor</em>. Turning it into an orbit needs a plate solution, exposure times, observer position and orbit determination — deliberately out of scope and stated in the limitations panel.</>,
      },
    ],
  },
  {
    id: "orbital", title: "Orbital Analysis", blurb: "Validate element sets, propagate with SGP4, inspect states and ground track.", minutes: 10,
    features: [
      {
        title: "Choosing a data source", keywords: "bundled snapshot live celestrak catalogue cache offline freshness epoch age",
        steps: [
          s(<><strong>Bundled snapshot</strong>: 16 real element sets (ISS, Tiangong, Hubble, Cosmos-2251, Fengyun-1C and Iridium-33 debris) frozen in the repo with a fetch timestamp shown next to the badge.</>),
          s(<><strong>Live CelesTrak</strong>: downloads the same groups from the CelesTrak GP API, cached in memory for 2 hours (their usage guidance), and labelled <Badge tone="ok">live</Badge>.</>),
          s(<>If the live fetch fails (offline, rate-limited) you get a yellow notice and the snapshot instead — the app never silently mixes stale and fresh data.</>),
          s(<>Check the epoch age before trusting a propagation: the page warns when your window is more than 7 days from the element epoch and the API refuses beyond 30 days.</>),
        ],
      },
      {
        title: "Pasting a TLE or OMM element set", keywords: "paste tle text omm json import checksum validation errors",
        steps: [
          s(<>Switch to <strong>Paste TLE</strong> and enter two lines (a name line is optional and ignored for parsing): {c("ISS (ZARYA)\n1 25544U 98067A   26294.04791053  .00009575  00000+0  18188-3 0  9996\n2 25544  51.6327  37.2623 0006759 289.5321  70.4938 15.48967427591263")}</>),
          s(<>Validation is strict and the error messages say exactly what is wrong: 69 characters per line, line numbers <code>1</code>/<code>2</code>, matching catalogue numbers on both lines, modulo-10 checksums, eccentricity in [0,1), inclination in [0,180], mean motion in (0,20) rev/day, parseable epoch day-of-year.</>),
          s(<>Switch to <strong>Paste OMM JSON</strong> for CelesTrak&rsquo;s <code>FORMAT=json</code> output (an object or a single-element array). It is validated field by field, including that <code>EPOCH</code> is ISO-8601 UTC.</>),
          s(<>Only the first element set of pasted text is used; multi-set files are parsed for validation purposes but propagation takes one object at a time.</>),
        ],
      },
      {
        title: "Setting the propagation window", keywords: "start utc duration minutes step seconds samples validate window",
        steps: [
          s(<><strong>Start (UTC)</strong> is a local datetime picker that is interpreted as UTC (a <code>Z</code> is appended) — no timezone surprises.</>),
          s(<><strong>Duration</strong> in minutes (1 … 7 days) and <strong>Step</strong> in seconds (1 … 3600). Sample count = duration/step + 1, capped at 20,000; the API tells you if you exceed it.</>),
          s(<>One orbit of the ISS is ~93 minutes, so <em>95 min @ 30 s</em> (the default) shows a full pass. A GEO object needs a day-long window to show anything interesting.</>),
          s(<>Press <strong>Validate &amp; propagate</strong>. Validation runs first and returns HTTP 422 with reasons if the window is impossible — no propagation is attempted on bad input.</>),
        ],
      },
      {
        title: "Interpreting the propagation output", keywords: "altitude speed teme geodetic ground track ephemeris table download csv json",
        steps: [
          s(<>The <em>Orbital parameters</em> card shows the six mean elements plus derived quantities: period, semi-major axis, perigee/apogee altitude and regime (LEO/MEO/GEO/HEO from the Keplerian relation on mean motion).</>),
          s(<>Charts: altitude above the ellipsoid and inertial speed versus minutes. LEO altitude oscillates with the eccentricity; speed is anti-correlated with altitude (vis-viva).</>),
          s(<>The <strong>ground track</strong> is longitude vs latitude of the sub-satellite point — a flat view (no basemap tiles), showing the westward drift caused by Earth&rsquo;s rotation between passes.</>),
          s(<>The table lists TEME x/y/z in km, geodetic lat/lon, altitude and |v|; it is subsampled to ≤ 25 rows on screen but the downloads contain every sample.</>),
          s(<>Coordinates are TEME (the frame SGP4 outputs); latitude/longitude/altitude are derived via GMST for display only. This is stated in the result header and the limitations panel.</>),
        ],
      },
    ],
  },
  {
    id: "conjunction", title: "Close-Approach Analysis", blurb: "Screen two catalogued objects for closest approach — and know exactly what that number means.", minutes: 10,
    features: [
      {
        title: "Running a screening", keywords: "select objects a b window duration step threshold flagged events",
        steps: [
          s(<>Choose the data source, then <strong>Object A</strong> and <strong>Object B</strong> from the grouped dropdowns. A is the reference for the RIC frame. Defaults are two Cosmos-2251 fragments (similar orbits ⇒ interesting encounters).</>),
          s(<>Set <strong>Start (UTC)</strong>, <strong>Duration</strong> (0.25–168 h), <strong>Coarse step</strong> (1–600 s) and <strong>Report threshold</strong> in km.</>),
          s(<>The sample counter under the fields shows how many SGP4 evaluations will run (max 20,000). Increase the step if it is too high; the button is disabled while it is.</>),
          s(<>Press <strong>Run close-approach screening</strong>. Typical time: a second or two for 24 h @ 30 s.</>),
        ],
      },
      {
        title: "Interpreting the result", keywords: "tca miss distance relative speed ric radial in-track cross-track log chart minima assumptions",
        steps: [
          s(<><strong>TCA</strong> = time of closest approach, refined by golden-section search to ≤ 1 ms between the coarse samples (the hint under the value says whether refinement applied or the minimum sits on a window boundary).</>),
          s(<><strong>Miss distance</strong> is the Euclidean norm of the TEME position difference at TCA — a geometric distance, not a probability.</>),
          s(<><strong>Relative speed</strong> = |v_A − v_B|. At 10+ km/s even a kilometre-scale miss passes in a fraction of a second.</>),
          s(<><strong>RIC of B relative to A</strong>: radial (along A&rsquo;s position vector, ≈ altitude difference), in-track (along A&rsquo;s velocity), cross-track (out of plane). Their norm equals the miss distance — a useful self-check.</>),
          s(<>The log-scale chart shows separation over the window with the threshold drawn as a dashed line; dips are the periodic encounters of two objects in similar orbits.</>),
          s(<>The <em>local minima</em> table lists every minimum below the threshold (max 10). If none is below it, the global minimum is shown and the badge reads <em>above threshold</em>.</>),
          s(<>A <em>sampling gap</em> warning appears when the objects move more than twice the threshold between coarse samples — shorten the step if you see it.</>),
          s(<>The <strong>Assumptions stated with this result</strong> panel lists the propagation model, frame, data epochs and what is deliberately absent (covariance, manoeuvres). Read it before quoting the number.</>),
        ],
        tip: <>Why no collision probability? Pc needs position covariance for both objects (CDM-grade data) and a validated method (Foster/Alfano/Chan). Public TLEs carry no covariance, so printing a probability would be fabrication. Screening answers &ldquo;is this pair worth a closer look?&rdquo;.</>,
      },
    ],
  },
  {
    id: "reports", title: "Results & Research Reports", blurb: "Every run is logged with parameters, metrics and limitations.", minutes: 5,
    features: [
      {
        title: "Browsing, filtering and exporting runs", keywords: "reports list filter kind tabs experimental demonstration json csv markdown delete download",
        steps: [
          s(<>Two tabs keep the science honest: <strong>Experimental</strong> (your uploads, catalogue/OMM data) and <strong>Demonstration</strong> (synthetic frames). The demo tab carries a banner explaining what those numbers do and do not show.</>),
          s(<>Filter by kind: <code>detection</code>, <code>tracking</code>, <code>evaluation</code>, <code>propagation</code>, <code>conjunction</code>. <strong>Refresh</strong> re-reads the log after new runs.</>),
          s(<>Each card shows kind, data origin, title, UTC timestamp, model name/version and a one-line summary (e.g. <em>miss 4121.56 km · 13.61 km/s · not flagged</em>). Expand <strong>Parameters &amp; limitations</strong> for the exact request parameters.</>),
          s(<>Downloads per run: <strong>JSON</strong> (complete record incl. output arrays), <strong>CSV</strong> (the run&rsquo;s tabular output: detections / track points / metric rows / ephemeris samples / separation series) and <strong>Report (MD)</strong> — a self-contained research report with input, parameters, model, metrics, limitations, timestamp and a 200-row CSV preview.</>),
          s(<><strong>Delete</strong> asks for confirmation. If the database is unavailable the page says so; analyses still run, they are just not logged.</>),
        ],
      },
      {
        title: "Citing a run in your report", keywords: "reproducibility seed parameters citation markdown report template",
        steps: [
          s(<>Download the Markdown report — it is structured like a lab-record entry and can be pasted into a thesis appendix.</>),
          s(<>Quote the run id, timestamp, data origin, model name/version and the parameter block; for training runs also the dataset split counts, seed and split digests from <code>ml/experiments/*.json</code>.</>),
          s(<>Always carry the limitations panel into your write-up. A screening miss distance without its assumptions is not a result.</>),
        ],
      },
    ],
  },
  {
    id: "api", title: "Using the REST API directly", blurb: "Every page is a thin client over JSON endpoints you can script.", minutes: 10,
    features: [
      {
        title: "Calling the endpoints from a terminal or notebook", keywords: "curl api detect track propagate conjunction reports samples model experiments health json",
        steps: [
          s(<>Check the service and the model status: {c("curl -s localhost:3000/api/health\ncurl -s localhost:3000/api/model | python3 -m json.tool | head -30")}</>),
          s(<>Detect on a synthetic sample, or on a file: {c(`curl -s -X POST localhost:3000/api/detect -H 'Content-Type: application/json' \\\\\n  -d '{"sampleId":"streak-rich","params":{"engine":"classical","kSigma":4}}'\n\ncurl -s -X POST localhost:3000/api/detect -F image=@frame.jpg -F 'params={"engine":"onnx","conf":0.25}'`)}</>),
          s(<>Track a synthetic sequence, or upload frames (repeat <code>-F frames=@…</code> per file, in temporal order): {c(`curl -s -X POST localhost:3000/api/track -H 'Content-Type: application/json' -d '{"sequenceId":"two-movers"}'\n\ncurl -s -X POST localhost:3000/api/track -F frames=@f01.png -F frames=@f02.png -F frames=@f03.png -F 'params={"gatePx":18}'`)}</>),
          s(<>Propagate and screen: {c(`curl -s -X POST localhost:3000/api/orbital/propagate -H 'Content-Type: application/json' \\\\\n  -d '{"noradId":25544,"start":"2026-10-21T12:00:00Z","durationMinutes":95,"stepSeconds":60}'\n\ncurl -s -X POST localhost:3000/api/conjunction -H 'Content-Type: application/json' \\\\\n  -d '{"a":{"noradId":33757},"b":{"noradId":33758},"start":"2026-10-21T12:00:00Z","durationHours":24,"stepSeconds":30,"thresholdKm":20}'`)}</>),
          s(<>List and download runs: {c("curl -s 'localhost:3000/api/reports?kind=detection' | python3 -m json.tool | head -20\ncurl -sOJ 'localhost:3000/api/reports/<run-id>?format=csv'")}</>),
          s(<>In Python: {c(`import requests\nr = requests.post("http://localhost:3000/api/detect", json={"sampleId":"faint-field","params":{"kSigma":3.5}})\nd = r.json(); print(d["engine"], len(d["detections"]), d["stats"])`)}</>),
          s(<>Errors are always <code>{'{ ok: false, error, details? }'}</code> with a meaningful status (400 bad input, 404 unknown id, 413 too large, 415 undecodable, 422 invalid orbit/window) and never contain stack traces or filesystem paths.</>),
        ],
      },
      {
        title: "Extending the project", keywords: "extend add class detector endpoint module future work orbit determination covariance",
        steps: [
          s(<>Add a detector variant: extend the <code>DetectorVariant</code> union and the branch in <code>src/lib/vision/detector.ts</code>, then add it to <code>runBenchmark()</code> in <code>evaluate.ts</code> so it gets benchmarked automatically.</>),
          s(<>Add a class: train a multi-class model (<code>--classes debris satellite</code>), re-export ONNX; the class names flow through <code>model.json</code> into the UI.</>),
          s(<>Add an endpoint: create <code>src/app/api/&lt;name&gt;/route.ts</code>, use <code>withErrorBoundary</code>, <code>jsonError</code> and <code>saveRun</code> — you inherit validation, logging and reporting.</>),
          s(<>Add a test: drop a file in <code>tests/*.test.ts</code> and run <code>npm test</code>.</>),
          s(<>Research directions that would need real data: plate solving + orbit determination to link tracks to the catalogue, covariance-based Pc, cross-sensor generalisation, and real (not synthetic) sequence tracking.</>),
        ],
      },
    ],
  },
  {
    id: "learn", title: "Learning Centre & troubleshooting", blurb: "Theory on demand, and fixes for the errors you will actually hit.", minutes: 5,
    features: [
      {
        title: "Using the Learning Centre", keywords: "learn glossary theory debris leo meo geo radar optical yolo metrics tle sgp4 diagrams",
        steps: [
          s(<>The sticky left-hand index jumps to any of the nine sections; on mobile the same links are at the top of the article.</>),
          s(<>Diagrams are inline SVG: orbital shells, the IoU/confusion-matrix figure, and a real bundled TLE annotated field by field.</>),
          s(<>Section 6 has a worked precision/recall/F1 example you can redo with numbers from your own benchmark run.</>),
          s(<>The glossary at the end defines 20 terms (B*, covariance, GMST, IoU, NMS, PSF, RIC, SGP4, TEME, TCA, …) — use it while reading any other page.</>),
        ],
      },
      {
        title: "Fixing the common errors", keywords: "troubleshooting database onnxruntime celestrak epoch ensurepip opencv slow training",
        steps: [
          s(<><em>Reports page says the database is unavailable</em> → Postgres is not running or the table is missing: {c("npm run db:push")}</>),
          s(<><em>&ldquo;Trained model not available&rdquo;</em> in the Detection Lab → the reason is printed under the dropdown (no weights / bad metadata / runtime). Export weights or keep using the classical engine.</>),
          s(<><em>onnxruntime-node could not be loaded</em> → rebuild it for your platform: {c("npm rebuild onnxruntime-node")}</>),
          s(<><em>&ldquo;Window is … days from the element epoch&rdquo;</em> → pick a start near the epoch or switch to <strong>Live CelesTrak</strong> data.</>),
          s(<><em>Live catalogue falls back to the snapshot</em> → no internet, CelesTrak rate limit, or <code>ORBITAL_GUARD_LIVE_TLE=0</code> in <code>.env</code>.</>),
          s(<>Python side: {c("sudo apt install python3-venv          # 'ensurepip is not available'\npip install opencv-python-headless      # cv2 / libGL errors on servers\n# slow training: --set imgsz=416 --set batch=8, or --limit in prepare_dataset.py, or --set device=0")}</>),
        ],
      },
    ],
  },
];

/* ------------------------------------------------------------------ component */

const STORAGE_KEY = "orbital-guard-tutorial-progress";
const ALL_FEATURES = GUIDE.flatMap((sec) => sec.features.map((f) => `${sec.id}::${f.title}`));

const EMPTY_PROGRESS: Record<string, boolean> = {};
let progressCache: Record<string, boolean> | null = null;
const progressListeners = new Set<() => void>();
const notifyProgress = () => progressListeners.forEach((l) => l());

/** Read/write the checklist in localStorage through an external store (SSR-safe, no setState-in-effect). */
function useTutorialProgress() {
  const subscribe = (onChange: () => void) => {
    progressListeners.add(onChange);
    // Another tab may have changed the checklist; invalidate our cache then re-render.
    const onStorage = (e: StorageEvent) => { if (e.key === STORAGE_KEY) { progressCache = null; notifyProgress(); } };
    window.addEventListener("storage", onStorage);
    return () => { progressListeners.delete(onChange); window.removeEventListener("storage", onStorage); };
  };
  const getSnapshot = () => {
    if (progressCache) return progressCache;
    try { progressCache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Record<string, boolean>; } catch { progressCache = EMPTY_PROGRESS; }
    return progressCache;
  };
  const done = useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_PROGRESS);
  const write = (next: Record<string, boolean>) => {
    progressCache = next;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* private mode / quota */ }
    notifyProgress();
  };
  return { done, toggle: (key: string) => write({ ...done, [key]: !done[key] }), reset: () => write({}) };
}

export function Tutorial() {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState<string>(GUIDE[0].id);
  const { done, toggle, reset } = useTutorialProgress();

  // Highlight the section currently in view (IntersectionObserver on the section headers).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => { const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0]; if (visible) setActive(visible.target.id); },
      { rootMargin: "-15% 0px -70% 0px", threshold: 0 },
    );
    GUIDE.forEach((sec) => { const el = document.getElementById(sec.id); if (el) obs.observe(el); });
    return () => obs.disconnect();
  }, []);

  const q = query.trim().toLowerCase();
  const sections = useMemo(() => {
    if (!q) return GUIDE;
    return GUIDE.map((sec) => ({ ...sec, features: sec.features.filter((f) => (f.title + " " + f.keywords).toLowerCase().includes(q)) })).filter((sec) => sec.features.length > 0);
  }, [q]);

  const completed = ALL_FEATURES.filter((k) => done[k]).length;
  const progress = Math.round((completed / ALL_FEATURES.length) * 100);
  
  return (
    <div className="space-y-6">
      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="text-sm font-semibold text-white">Your progress through the tutorial</div>
            <div className="text-xs text-slate-400">{completed} of {ALL_FEATURES.length} feature guides ticked off · saved in this browser</div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-2 w-40 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Tutorial progress">
              <div className="h-full rounded-full bg-cyan-400 transition-all" style={{ width: `${progress}%` }} />
            </div>
            <span className="font-mono text-xs text-cyan-200">{progress}%</span>
            <button type="button" className="btn-ghost !px-2 !py-1 text-xs" onClick={reset}>Reset</button>
          </div>
        </div>
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <input className="input sm:max-w-sm" placeholder="Search features, controls, parameters… (e.g. k·σ, RIC, OMM, benchmark)" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search the tutorial" />
          <span className="text-xs text-slate-500">{sections.reduce((n, s2) => n + s2.features.length, 0)} guides shown{q && ` for “${query}”`}</span>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[220px_1fr]">
        <nav className="card sticky top-20 hidden h-fit p-3 lg:block" aria-label="Tutorial sections">
          <ul className="space-y-0.5 text-sm">
            {GUIDE.map((sec) => (
              <li key={sec.id}>
                <a href={`#${sec.id}`} className={`block rounded px-2 py-1.5 transition ${active === sec.id ? "bg-cyan-400/15 text-cyan-100" : "text-slate-300 hover:bg-white/5"}`}>
                  {sec.title}
                  <span className="block text-[10px] text-slate-500">{sec.features.length} guides · ~{sec.minutes} min</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="space-y-8">
          {sections.length === 0 && <p className="text-sm text-slate-400">No guide matches “{query}”. Try <em>detection</em>, <em>tracking</em>, <em>TLE</em>, <em>benchmark</em>, <em>RIC</em> or <em>troubleshooting</em>.</p>}
          {sections.map((sec) => (
            <section key={sec.id} id={sec.id} className="scroll-mt-24 space-y-4">
              <div className="border-b border-white/10 pb-2">
                <h2 className="text-xl font-semibold text-white">{sec.title}</h2>
                <p className="text-xs text-slate-400">{sec.blurb} <span className="text-slate-500">· ~{sec.minutes} min</span></p>
              </div>
              {sec.features.map((f) => {
                const key = `${sec.id}::${f.title}`;
                const isDone = !!done[key];
                return (
                  <article key={key} className={`card p-4 transition ${isDone ? "border-emerald-400/30" : ""}`}>
                    <header className="mb-3 flex items-start justify-between gap-3">
                      <h3 className="font-semibold text-white">{f.title}</h3>
                      <label className="flex flex-none cursor-pointer items-center gap-2 text-xs text-slate-300">
                        <input type="checkbox" checked={isDone} onChange={() => toggle(key)} className="h-4 w-4 accent-emerald-400" aria-label={`Mark "${f.title}" as done`} />
                        {isDone ? "Done" : "Mark done"}
                      </label>
                    </header>
                    <ol className="space-y-2">
                      {f.steps.map((st, i) => (
                        <li key={i} className="flex gap-3 text-sm text-slate-300">
                          <span className="mt-0.5 flex h-5 w-5 flex-none items-center justify-center rounded-full bg-cyan-400/15 font-mono text-[11px] text-cyan-200">{i + 1}</span>
                          <div className="min-w-0 flex-1 leading-relaxed [&_code]:rounded [&_code]:bg-white/10 [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.85em] [&_code]:text-cyan-100 [&_a]:text-cyan-300 [&_a]:underline">{st.text}</div>
                        </li>
                      ))}
                    </ol>
                    {f.tip && <div className="mt-3"><Note>{f.tip}</Note></div>}
                  </article>
                );
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}
