# ORBITAL GUARD — AI-Powered Space Debris Detection and Collision Risk Analysis

A research-oriented, scientifically honest prototype that explores how computer vision, multi-frame tracking and
orbital mechanics can support space-debris monitoring. Built for a second-year AI & Robotics engineering student to
run, understand and extend.

> **What this is:** a working web dashboard + REST API with a real classical detector, a *genuinely trained* YOLOv8n
> streak detector (on real telescope data), a Kalman tracker, SGP4 orbital propagation and preliminary close-approach
> screening — every result labelled with its data origin and limitations.
>
> **What this is not:** an operational space-situational-awareness system. No image detection is ever called
> "debris", no collision probabilities are printed, no avoidance advice is given.

---

## Table of contents

1. [Architecture at a glance](#1-architecture-at-a-glance)
2. [Directory tree](#2-directory-tree)
3. [Installation and running (Ubuntu / Windows)](#3-installation-and-running)
4. [The modules, one by one](#4-the-modules)
5. [How an image travels from upload to prediction](#5-how-an-image-travels-from-upload-to-prediction)
6. [How the model is trained and evaluated](#6-how-the-model-is-trained-and-evaluated)
7. [Measured results (what was actually run)](#7-measured-results)
8. [Orbital propagation and its assumptions](#8-orbital-propagation-and-its-assumptions)
9. [REST API reference](#9-rest-api-reference)
10. [Tests](#10-tests)
11. [Configuration](#11-configuration)
12. [Troubleshooting](#12-troubleshooting)
13. [Implemented · demonstrated · future work](#13-implemented--demonstrated--future-work)
14. [Data sources, licences and citations](#14-data-sources-licences-and-citations)

---

## 1. Architecture at a glance

```
 Browser (React 19 + Tailwind 4 + Recharts)
   │  fetch / multipart upload
   ▼
 Next.js 16 App Router  ──  src/app/api/*  (TypeScript route handlers = the REST backend)
   ├─ src/lib/vision/      classical detector · synthetic generator · metrics · Kalman tracker · ONNX (YOLO) runner
   ├─ src/lib/orbital/     TLE/OMM parser+validator · SGP4 (satellite.js) · conjunction screening · catalogue
   └─ src/lib/runs.ts      run log (PostgreSQL via Drizzle) · CSV / Markdown report export
   │
   ├─ ml/weights/model.onnx  ◄── exported by the Python pipeline, executed with onnxruntime-node
   └─ ml/experiments/*.json  ◄── experiment records written by the Python pipeline (read-only for the web app)

 Python (ml/) — Ultralytics YOLOv8 + PyTorch + OpenCV
   generate_synthetic.py → prepare_dataset.py → train.py → evaluate.py → export_onnx.py
```

**Why Next.js route handlers instead of FastAPI?** The deployment platform for this project runs a single Node.js
application, so the REST API is implemented as TypeScript route handlers; this keeps one language for the web stack
and lets the dashboard run everywhere Node runs. All *training* lives in Python (Ultralytics/PyTorch), where the
ecosystem is. The trained model crosses the boundary as an ONNX file, which the API runs with `onnxruntime-node`.
If you prefer a FastAPI backend, every `src/lib/*` function maps one-to-one onto a Pydantic model + endpoint.

Key engineering choices:

| Concern | Choice | Why |
|---|---|---|
| Image decoding | `pngjs`, `jpeg-js` (pure JS) | No native build step; magic-byte sniffing; size/pixel limits |
| Baseline detector | SExtractor-style thresholding in TypeScript | Transparent, parameter-interpretable, always available |
| Deep detector | YOLOv8n via Ultralytics → ONNX | Small enough to train on a CPU; standard export |
| Tracking | Constant-velocity Kalman + gated nearest neighbour (SORT-like) | Simple, handles dropouts, easy to read |
| Propagation | `satellite.js` 7 (Vallado SGP4 port) | Established implementation — no home-made orbital maths |
| Orbital data | CelesTrak GP API, bundled snapshot fallback | Free, documented, with usage guidance (2 h cache) |
| Storage | One `runs` table (PostgreSQL / Drizzle) | Every analysis reproducible and exportable |

---

## 2. Directory tree

```
.
├── README.md                      ← you are here
├── .env.example                   ← environment variables (copy to .env)
├── package.json                   ← scripts: dev, build, start, test, db:push, ml:synthetic
├── next.config.ts                 ← serverExternalPackages: onnxruntime-node
├── drizzle.config.json            ← Drizzle Kit (schema push)
├── vitest.config.ts               ← unit tests
├── src/
│   ├── app/
│   │   ├── layout.tsx, globals.css, page.tsx       ← shell, theme, Mission page
│   │   ├── detection/page.tsx                      ← AI Detection Laboratory
│   │   ├── dataset/page.tsx                        ← Dataset & Model Laboratory
│   │   ├── tracking/page.tsx                       ← Space Object Tracking
│   │   ├── orbital/page.tsx                        ← Orbital Analysis
│   │   ├── conjunction/page.tsx                    ← Close-Approach Analysis
│   │   ├── reports/page.tsx                        ← Results & Research Reports
│   │   ├── tutorial/page.tsx                       ← Step-by-Step Tutorial (interactive checklist)
│   │   ├── how-built/page.tsx                      ← How This Project Was Made (build log + tool inventory)
│   │   ├── learn/page.tsx                          ← Learning Centre
│   │   └── api/
│   │       ├── detect/route.ts                     ← POST image → detections (classical | onnx)
│   │       ├── samples/[id]/route.ts               ← GET synthetic sample PNGs / list
│   │       ├── evaluate/route.ts                   ← POST synthetic benchmark (baseline vs improved)
│   │       ├── track/route.ts                      ← POST frames → tracks
│   │       ├── model/route.ts                      ← GET detector/model availability
│   │       ├── experiments/route.ts                ← GET Python experiment records
│   │       ├── orbital/catalog/route.ts            ← GET element sets (bundled | live)
│   │       ├── orbital/propagate/route.ts          ← POST SGP4 propagation
│   │       ├── conjunction/route.ts                ← POST close-approach screening
│   │       ├── reports/route.ts, reports/[id]/route.ts ← run log, JSON/CSV/MD export, delete
│   │       └── health/route.ts
│   ├── components/  nav.tsx · ui.tsx · charts.tsx · image-overlay.tsx · tutorial.tsx
│   ├── lib/
│   │   ├── vision/  image.ts · synthetic.ts · detector.ts · evaluate.ts · tracker.ts · onnx.ts
│   │   ├── orbital/ tle.ts · propagate.ts · conjunction.ts · catalog.ts · resolve.ts · bundled-tles.ts
│   │   ├── runs.ts · api.ts · log.ts
│   └── db/ index.ts · schema.ts
├── ml/
│   ├── README.md                  ← short Python-side guide
│   ├── requirements.txt
│   ├── configs/ baseline.yaml · improved_p2.yaml · synthetic_smoke.yaml
│   ├── scripts/ common.py · generate_synthetic.py · prepare_dataset.py · train.py · evaluate.py · export_onnx.py
│   ├── experiments/               ← one JSON record per training run (rendered by the dashboard)
│   ├── weights/ model.onnx · model.json  ← deployed detector + provenance
│   ├── data/                      ← datasets (git-ignored)
│   └── runs/                      ← Ultralytics outputs (git-ignored)
└── tests/ detector.test.ts · tracker.test.ts · orbital.test.ts
```

---

## 3. Installation and running

### Prerequisites

| Tool | Version | Notes |
|---|---|---|
| Node.js | 20 or 22 | https://nodejs.org |
| PostgreSQL | 14+ | local server; any database name |
| Python | 3.10 – 3.12 | only for training/export (the web app runs without Python) |
| Git | any | |

### 3.1 Web application (both OSes)

```bash
git clone <this repository> orbital-guard
cd orbital-guard
npm install                       # installs Next.js, Drizzle, satellite.js, onnxruntime-node, ...
cp .env.example .env              # Windows PowerShell: Copy-Item .env.example .env
# edit .env → DATABASE_URL=postgresql://USER:PASSWORD@127.0.0.1:5432/app_db
npm run db:push                   # creates the `runs` table
npm run dev                       # http://localhost:3000
```

Production: `npm run build && npm run start`.

Create the database first if needed:

```bash
# Ubuntu
sudo apt install postgresql
sudo -u postgres psql -c "CREATE DATABASE app_db;" -c "ALTER USER postgres PASSWORD 'postgres';"
# Windows: install from https://www.postgresql.org/download/windows/ then in pgAdmin or psql: CREATE DATABASE app_db;
```

### 3.2 Python environment for training (optional but recommended)

Ubuntu:
```bash
sudo apt install python3-venv
python3 -m venv .venv && source .venv/bin/activate
pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu   # or a CUDA build
pip install -r ml/requirements.txt
```

Windows (PowerShell):
```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
pip install -r ml\requirements.txt
```

### 3.3 Reproduce the trained model

```bash
# 1. Real data (1.4 GB, CC BY 4.0): https://zenodo.org/records/14047944 → unzip StreaksYoloDataset.zip
python ml/scripts/prepare_dataset.py --source /path/to/StreaksYoloDataset --out ml/data/streaks \
  --classes streak --name StreaksYoloDataset --origin real --licence "CC BY 4.0" \
  --source-url https://doi.org/10.5281/zenodo.14047943 --keep-splits --limit 360 --seed 42
#    (drop --limit for the full 1,642 labelled images; add --allow-empty to include the 746 negatives)

# 2. Baseline
python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=20 --set imgsz=512 --set batch=8
# 3. Held-out evaluation + failure analysis
python ml/scripts/evaluate.py --run baseline-streaks
# 4. Export for the web app
python ml/scripts/export_onnx.py --run baseline-streaks
# 5. Improvement (P2 head for small objects) — same seed/splits
python ml/scripts/train.py --config ml/configs/improved_p2.yaml --set epochs=20 --set imgsz=512 --set batch=8
python ml/scripts/evaluate.py --run improved-p2-streaks
```

No real data at hand? `npm run ml:synthetic` writes a synthetic YOLO dataset to `ml/data/synthetic`; train with
`ml/configs/synthetic_smoke.yaml`. Results are labelled `synthetic` everywhere.

---

## 4. The modules

### Mission Overview (`/`)
Problem statement, pipeline diagram, live status (is a trained model present? how old is the bundled catalogue?),
capabilities vs. limitations, navigation.

### AI Detection Laboratory (`/detection`)
Upload a PNG/JPEG (≤ 12 MB, ≤ 16 MP) or pick a synthetic sample. Engines:

* **Classical source extractor** (`src/lib/vision/detector.ts`): local background (grid medians, bilinear
  interpolation) → robust noise σ (MAD) → Gaussian matched filter → k·σ threshold → 8-connected components →
  min/max-area rejection (hot pixels, glare) → centroid, flux, SNR, second-moment shape → `point_source` vs `streak`
  by elongation. A `global-threshold` variant without background modelling is the baseline for comparison.
  Scores are a monotonic function of SNR, *not* probabilities.
* **Trained YOLOv8 (ONNX)** (`src/lib/vision/onnx.ts`): letterbox → NCHW float tensor → `onnxruntime-node` →
  decode `[1, 4+nc, anchors]` → confidence filter → class-wise NMS → map boxes back to the original frame. Only
  offered when `ml/weights/model.onnx` + `model.json` exist; otherwise the UI says why and uses the classical engine.

Synthetic samples come with ground truth, so the page scores that single frame (precision/recall/F1/AP) — labelled
"illustrative". The annotated image, JSON, CSV and a Markdown report are downloadable.

### Dataset & Model Laboratory (`/dataset`)
1. **Dataset investigation table** — StreaksYoloDataset (used), SPARK 2022, DUSTstreaks, SpaceDet, Roboflow/Kaggle
   re-uploads (rejected) with source, licence, format, real-vs-simulated and limitations.
2. **Measured results** — renders `ml/experiments/*.json` verbatim: validation metrics (model selection), held-out
   test metrics (report these), loss/metric curves, recall-by-box-size failure analysis, environment and seed.
   If no training has happened the panel says so.
3. **Live synthetic benchmark** — runs both classical variants on the same seeded frames; precision, recall, F1, AP
   (3-px centroid matching) and AP@IoU 0.5, plus recall by SNR bin. Measured, but on synthetic data — labelled.
4. The exact training workflow with commands.

### Space Object Tracking (`/tracking`)
Upload 2–30 frames or pick a synthetic sequence (fixed stars + movers with random dropouts). Pipeline: per-frame
classical detection → `trackFrames()` (`src/lib/vision/tracker.ts`): 4-state Kalman prediction → gated greedy
association → update / coast / spawn / terminate. Tracks are classified `stationary` (stars) vs `moving` (candidate
resident space objects). The frame slider shows trajectories growing over time; hollow dots mark coasted predictions.
For synthetic sequences a recovery score (truth positions covered within 4 px) and fragmentation count are computed.

### Orbital Analysis (`/orbital`)
Choose the bundled snapshot (16 real element sets fetched 2026-10-21: ISS, Tiangong, Hubble, Cosmos-2251,
Fengyun-1C and Iridium-33 debris) or **live CelesTrak** (cached 2 h), or paste a TLE / OMM JSON. Validation covers
line length, line numbers, checksums, catalogue-number consistency, eccentricity/inclination/mean-motion ranges,
epoch parsing, sample count and **epoch age** (warn > 7 days, refuse > 30 days). Output: elements + derived
period/apogee/perigee/regime, TEME states, geodetic lat/lon/alt, speed, ground track, CSV/JSON/report.

### Close-Approach Analysis (`/conjunction`)
Pick two objects → coarse SGP4 sampling of separation → local minima → golden-section refinement of the global
minimum (≤ 1 ms) → TCA, miss distance, relative speed, RIC components of B relative to A, list of minima below a
threshold, and a sampling-gap warning. Every result carries its assumptions block. **No collision probability** is
computed because TLEs carry no covariance.

### Results & Research Reports (`/reports`)
Lists every saved run (filter by kind) in two tabs — *Experimental* (uploads, catalogue data) and *Demonstration*
(synthetic). Each entry links to `JSON`, `CSV` and a Markdown research report (input, parameters, model/version,
metrics, outputs, limitations, timestamp). Runs can be deleted.

### Step-by-Step Tutorial (`/tutorial`)
Interactive, feature-by-feature walkthrough with a persisted checklist (localStorage), full-text search over guides,
copy-to-clipboard commands and a "pick a path" panel. Nine sections: quick start & result labelling, Detection Lab
(uploads, classical parameters, ONNX engine, reading/exporting output), Dataset & Model Lab (dataset table, experiment
records, live benchmark, training commands, adding your own data), Tracking (sequences, uploads, tracker tuning),
Orbital Analysis (data sources, TLE/OMM import, window, interpretation), Close Approach (running and interpreting a
screening, why there is no Pc), Reports (browsing, exporting, citing), REST API (curl/Python recipes, extending the
project) and Learning Centre + troubleshooting.

### How This Project Was Made (`/how-built`)
Build record with facts read live from the repository: code inventory (files/lines per layer, pages, API routes, test
count), dependency versions resolved from `node_modules`, the ten build phases (what was done, which decision it
forced, what evidence remains, with UTC timestamps), the complete tool inventory (web, backend, AI/CV, orbital
mechanics, testing — each with version, role, why it was chosen over the alternative, and licence), architecture
decisions vs rejected alternatives, the data acquisition and preparation log (dataset download size, split counts,
CelesTrak groups and snapshot timestamp), the training/evaluation runs table rendered from `ml/experiments/*.json`,
the verification log (static checks, tests, end-to-end API smoke results), a module map, honest limits of the build
and the exact reproduce-from-scratch command sequence with expected durations.

### Learning Centre (`/learn`)
Debris types, LEO/MEO/GEO (SVG diagram), radar vs optical, detection & deep learning, YOLO and alternatives,
precision/recall/F1/mAP (diagram + worked example), tracking, TLE/OMM/SGP4/conjunctions (annotated real TLE),
the detection ≠ tracking ≠ risk table, and a glossary.

---

## 5. How an image travels from upload to prediction

1. **Browser** (`src/app/detection/page.tsx`) builds a `FormData` with the file and a JSON `params` string and POSTs to
   `/api/detect` (synthetic samples send JSON `{ sampleId, params }` instead).
2. **Route handler** (`src/app/api/detect/route.ts`) checks the field exists, size > 0 and ≤ 12 MB, then calls
   `decodeImage()`.
3. **Decoding** (`src/lib/vision/image.ts`) sniffs the magic bytes (PNG `89 50 4E 47`, JPEG `FF D8 FF`) — the
   browser-supplied MIME type is never trusted — enforces the 16 MP limit, decodes to RGBA with `pngjs`/`jpeg-js`,
   and produces a `Float32Array` luminance plane plus an RGB byte buffer. Failures become `ImageDecodeError`
   with a user-safe message (HTTP 415); no paths or stack traces leave the server.
4. **Parameter parsing** clamps every numeric parameter to a sane range (`num()` in `src/lib/api.ts`).
5. **Engine selection**: if `engine=onnx` was requested, `getModelStatus()` verifies weights, metadata and runtime;
   on success `detectWithOnnx()` runs the network, otherwise the handler records a *note* explaining the fallback and
   runs `detect()` (classical). The response's `engine` field always states what actually ran.
6. **Scoring (synthetic only)**: `computeMetrics()` compares detections with the known truth.
7. **Persistence**: `saveRun()` writes kind, data origin, model name/version, parameters, input summary, detections,
   metrics and limitations to PostgreSQL (best effort — a DB outage never breaks detection).
8. **Browser** draws boxes on a `<canvas>` over the original image (`image-overlay.tsx`) and offers PNG/JSON/CSV
   downloads and the Markdown report link (`/api/reports/:id?format=md`).

---

## 6. How the model is trained and evaluated

**Task definition.** *Locate streaks — trails of objects moving relative to the stars — in sidereally tracked optical
frames.* Single class `streak`. A streak is evidence of a moving object (satellite, debris, aircraft, meteor), not an
identification.

**Data.** StreaksYoloDataset (real, CC BY 4.0, 640×640 JPEG, YOLO labels). `prepare_dataset.py` respects the
author's train/validation/test folders (`--keep-splits`), optionally subsamples with a seed (`--limit`), copies or
symlinks files, drops malformed boxes, and writes `data.yaml` + `dataset_manifest.json` (counts, class histogram,
split digests, licence, origin). The manifest is embedded in every experiment record.

**Baseline.** `ml/configs/baseline.yaml`: YOLOv8n initialised from COCO weights, imgsz 640 (512 in the sandbox),
SGD/auto optimiser, seed 42, `deterministic=True`, horizontal + vertical flips (streaks have no "up"), mosaic.

**Improvement.** `ml/configs/improved_p2.yaml`: `yolov8n-p2.yaml` adds a stride-4 detection head so objects a few
pixels wide are represented on a high-resolution feature map — the principled fix for small/faint targets. Same
data, seed and schedule so the comparison is fair.

**Training loop.** `train.py` wraps `model.train()`, then stores: config (after CLI overrides), seed, dataset
manifest, per-epoch `train/val box|cls|dfl` losses and val P/R/mAP (from `results.csv`), final validation metrics
of `best.pt`, elapsed time, environment (Python, torch, ultralytics, CPU count, git commit) → `ml/experiments/<run>.json`.
Failures are recorded as `status: failed` instead of leaving a half-written record.

**Evaluation.** `evaluate.py` runs `model.val(split="test")` on images never used for training or model selection and
adds a failure analysis: recall by ground-truth size bin (small < 16 px, medium, large), recall per class and the
false-positive count at conf ≥ 0.25 with greedy IoU ≥ 0.5 matching.

**Export.** `export_onnx.py` exports `best.pt` (opset 12, simplified) to `ml/weights/model.onnx` and writes
`model.json` with classes, input size, dataset, data origin and the val/test metrics — the provenance the dashboard
shows next to every YOLO result.

**Metrics explained** (see Learning Centre §6): precision = TP/(TP+FP), recall = TP/(TP+FN), F1 = harmonic mean,
AP = area under the PR curve, mAP@0.5 and mAP@0.5:0.95 average over classes (and IoU thresholds).

---

## 7. Measured results

All numbers below were produced by the scripts in this repository on 2026-10-21 in a 4-CPU sandbox (no GPU), on a
**seeded 360-image subset** of StreaksYoloDataset (259 train / 49 val / 52 test, seed 42, imgsz 512, batch 8).
They are honest but modest experiments — a short schedule on a small subset — intended to validate the pipeline and
provide a baseline, not to claim state-of-the-art performance. The exact records are in `ml/experiments/`.

| Run | Epochs | Val mAP@0.5 | **Test P** | **Test R** | **Test F1** | **Test mAP@0.5** | Test mAP@0.5:0.95 | Train time |
|---|---|---|---|---|---|---|---|---|
| `baseline-streaks-4ep` (pipeline smoke test) | 4 | 0.430 | 0.455 | 0.558 | 0.501 | 0.496 | 0.325 | 2.8 min |
| `baseline-streaks-20ep` (**deployed ONNX model**) | 20 | 0.707 | 0.816 | 0.808 | 0.812 | 0.875 | — see record | 13.4 min |
| `improved-p2-streaks-20ep` (P2 head) | 20 | 0.579 | 0.634 | 0.750 | 0.687 | 0.665 | 0.362 | 21.8 min |

(`baseline-streaks-20ep` test mAP@0.5:0.95 = 0.698; false positives at conf ≥ 0.25 on the 52 test images: 71 → 17 → 26.)

**Observations.**
* Going from 4 to 20 epochs raised test F1 from 0.50 to 0.81 — the 4-epoch model was simply under-trained.
* The "justified improvement" (P2 head for small objects) **did not help here** (mAP@0.5 0.665 vs 0.875). The failure
  analysis explains why: in StreaksYoloDataset the streaks are *large* (median box ≈ 25 % of the frame, almost all in
  the > 48 px bin), so a stride-4 head adds parameters and training difficulty without addressing a real weakness;
  the architecture also starts from a YAML with only partially transferable COCO weights, which hurts on a 20-epoch
  CPU schedule. This is a useful negative result: the hypothesis "faint/small objects are the bottleneck" must be
  checked against the data's object-size distribution before choosing the fix. For faint-streak data (e.g. survey
  frames with short, dim trails) the P2 variant remains the right experiment to run.
* The deployed model (`baseline-streaks-20ep`) correctly localised the streak in a held-out test image during the
  API smoke test (confidence 0.92, IoU ≈ 0.9 with the label).
* Limitations: single sensor and site, ~1 streak per image, 360-image subset, CPU schedule, one seed (no variance
  estimate); no claim is made about other telescopes or about distinguishing debris from satellites.

**Classical detector, synthetic benchmark** (10 images, seed 1, noise σ 5, example run): baseline global threshold
P 0.94 / R 0.70 / AP 0.72 vs. local-background + matched filter P 0.79 / R 0.89 / AP 0.83 — the matched filter buys
recall on faint sources at the cost of precision. Run your own on the Dataset page; numbers change with seed/noise.

---

## 8. Orbital propagation and its assumptions

* **Model:** SGP4/SDP4 through `satellite.js` 7.1 (port of Vallado's 2006 reference code). Mean elements in, TEME
  position/velocity out. We do not implement any propagation maths ourselves.
* **Frame:** TEME (True Equator, Mean Equinox) — an Earth-centred quasi-inertial frame tied to the TLE convention.
  For display we compute GMST and convert to geodetic latitude/longitude/altitude; separation between two objects is
  computed directly in TEME (frame-consistent).
* **Accuracy:** ~1 km at epoch for LEO, growing by kilometres per day (atmospheric drag variability, manoeuvres, the
  B\* term being a fit parameter). Hence the age checks: warning beyond ±7 days, refusal beyond ±30 days.
* **No covariance, no manoeuvres, no higher-fidelity force models.** That is why the close-approach module stops at
  miss distance / TCA / RIC and never prints a probability.
* **Sampling:** coarse step (default 30 s) then golden-section refinement; the API reports the maximum distance the
  objects move between samples so you can judge whether a short encounter could have been missed.
* **Data freshness:** the bundled snapshot is dated in the UI (`fetchedAt` + each epoch). Live data comes from
  CelesTrak's GP API, cached for 2 h in line with their usage guidance; failures fall back to the snapshot with a notice.

---

## 9. REST API reference

All endpoints return JSON `{ ok: true, ... }` or `{ ok: false, error, details? }`. Errors never include stack traces.

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/health` | DB connectivity |
| GET | `/api/model` | classical defaults + ONNX model availability/provenance |
| GET | `/api/samples/list` | synthetic samples and sequences |
| GET | `/api/samples/:id[?frame=N]` | PNG of a sample (or frame N of a sequence) |
| POST | `/api/detect` | multipart `image` + `params` JSON, or JSON `{sampleId, params}` |
| POST | `/api/evaluate` | synthetic benchmark `{nImages, seed, size, noiseSigma, brightness, kSigma}` |
| POST | `/api/track` | multipart `frames[]` + `params`, or JSON `{sequenceId, params}` |
| GET | `/api/experiments` | Python experiment records + model status |
| GET | `/api/orbital/catalog?source=bundled\|live` | validated element sets |
| POST | `/api/orbital/propagate` | `{source?, noradId \| tleText \| omm, start?, durationMinutes?, stepSeconds?, validateOnly?}` |
| POST | `/api/conjunction` | `{source?, a:{noradId\|tleText\|omm}, b:{...}, start?, durationHours?, stepSeconds?, thresholdKm?}` |
| GET | `/api/reports[?kind=&origin=]` | saved runs (without bulky output) |
| GET | `/api/reports/:id?format=json\|csv\|md` | download one run |
| DELETE | `/api/reports/:id` | remove a run |

Examples:

```bash
# Classical detection on a synthetic sample
curl -s -X POST localhost:3000/api/detect -H 'Content-Type: application/json' \
  -d '{"sampleId":"bright-field","params":{"engine":"classical","kSigma":4}}'
# → {"ok":true,"engine":"classical","detections":[{"id":1,"cls":"point_source","confidence":0.97,"bbox":[..],"centroid":[..],"snr":41.2,...}],
#    "stats":{"background":41.9,"noiseSigma":3.1,"threshold":5.2,...},"metrics":{"precision":0.88,"recall":0.97,...},"limitations":[...],"runId":"…"}

# YOLO (ONNX) on an uploaded file
curl -s -X POST localhost:3000/api/detect -F image=@frame.jpg -F 'params={"engine":"onnx","conf":0.25}'
# → {"ok":true,"engine":"onnx","detections":[{"cls":"streak","confidence":0.921,"bbox":[22.6,336.8,273.3,529.3],...}],"model":{"name":"baseline-streaks-20ep",...}}

# Propagate ISS for one orbit
curl -s -X POST localhost:3000/api/orbital/propagate -H 'Content-Type: application/json' \
  -d '{"noradId":25544,"start":"2026-10-21T12:00:00Z","durationMinutes":95,"stepSeconds":60}'
# → {"ok":true,"record":{...elements...},"samples":[{"t":"2026-10-21T12:00:00.000Z","position":{"x":..,"y":..,"z":..},"altitudeKm":418.8,"speedKmS":7.66,...}],"warnings":[]}

# Screen two Cosmos-2251 fragments for 24 h
curl -s -X POST localhost:3000/api/conjunction -H 'Content-Type: application/json' \
  -d '{"a":{"noradId":33757},"b":{"noradId":33758},"start":"2026-10-21T12:00:00Z","durationHours":24,"stepSeconds":30,"thresholdKm":20}'
# → {"ok":true,"closest":{"tca":"2026-10-21T12:17:52.962Z","missDistanceKm":4121.56,"relativeSpeedKmS":13.61,"ricKm":{...}},"events":[...],"assumptions":[...]}

# Invalid TLE (bad checksum)
# → HTTP 400 {"ok":false,"error":"No valid TLE found in the pasted text.","details":[{"line":1,"message":"Checksum mismatch on line 1 (expected 6)."}]}
```

---

## 10. Tests

```bash
npm test            # vitest: 14 tests — detector (recall, FP rejection, determinism, IoU, variant comparison),
                    #                   tracker (dropout coasting, star/mover separation), TLE/OMM parsing,
                    #                   SGP4 sanity (ISS altitude & speed), conjunction (refined minimum, RIC norm)
npm run typecheck   # TypeScript
npm run build       # production build
```

---

## 11. Configuration

See `.env.example`: `DATABASE_URL` (required), `ORBITAL_GUARD_LIVE_TLE` (0 disables CelesTrak access),
`ORBITAL_GUARD_LOG_LEVEL`, `ORBITAL_GUARD_DATA_DIR` (Python). No secrets are ever sent to the browser; no paid APIs
are used anywhere.

---

## 12. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| `DATABASE_URL is required` on start | Create `.env` from `.env.example`. |
| Reports page says the database is unavailable; analyses still work | Postgres not running or table missing → `npm run db:push`. Runs are simply not saved. |
| "Trained model not available" in the Detection Lab | `ml/weights/model.onnx` / `model.json` missing → run the training + `export_onnx.py`, or download them from your own run. |
| `onnxruntime-node could not be loaded` | Unsupported OS/arch for the prebuilt binary; reinstall with `npm rebuild onnxruntime-node` or use the classical engine. |
| `Window is … days from the element epoch` | Your start time is too far from the TLE epoch → use live data or a start near the epoch. |
| Live catalogue falls back to the snapshot | No internet / CelesTrak rate limit / `ORBITAL_GUARD_LIVE_TLE=0`. |
| `ensurepip is not available` creating the venv (Ubuntu) | `sudo apt install python3-venv`, or `pip install --user` with `PIP_BREAK_SYSTEM_PACKAGES=1`. |
| Ultralytics downloads `yolov8n.pt` and fails offline | Download it once online, or train from `yolov8n.yaml` (no pretrained weights). |
| `cv2` import error (libGL) on servers | Use `opencv-python-headless` (already in requirements). |
| Very slow training | Reduce `--set imgsz=416 --set batch=8`, use `--limit` in `prepare_dataset.py`, or a CUDA GPU (`device: 0`). |
| Upload rejected | Only PNG/JPEG ≤ 12 MB and ≤ 16 MP; multi-frame uploads must share one resolution. |

---

## 13. Implemented · demonstrated · future work

**Implemented and measured**
* Classical detector + metrics + two-variant benchmark; Kalman tracker; TLE/OMM validation; SGP4 propagation;
  close-approach screening with refinement and RIC; run log with JSON/CSV/Markdown export; 14 unit tests.
* Python pipeline run end to end on real data: 3 training runs, held-out test evaluation, failure analysis, ONNX
  export, and the exported model running inside the web API.

**Demonstrated with clearly labelled synthetic data**
* Detection samples with ground truth, tracking sequences with dropouts, and the synthetic benchmark. They validate
  the software, not real-world performance.

**Not implemented (future work / research directions)**
* Astrometric calibration (plate solving), exposure timing and initial orbit determination to turn image tracks into
  orbits and correlate them with the catalogue.
* Covariance-based probability of collision (requires CDM-grade data) and encounter-plane analysis.
* Training on the full StreaksYoloDataset with negatives, longer schedules, DUSTstreaks / SpaceDet, cross-sensor
  generalisation tests, and a proper literature review before any claim of novelty.
* Multi-class detection (point source vs streak) on real data — currently real-data training is single-class.
* Tracking on real sequences (requires time-ordered frames from one sensor) and Hungarian assignment.
* GPU inference, batch processing, authentication and multi-user storage.

---

## 14. Data sources, licences and citations

* **StreaksYoloDataset** — O. Parisot (Luxembourg Institute of Science and Technology), 2024.
  Zenodo, DOI 10.5281/zenodo.14047943. Licence CC BY 4.0. Used for training/evaluation (subset); not redistributed here.
* **CelesTrak GP data** — T. S. Kelso, https://celestrak.org. Bundled snapshot fetched 2026-10-21; live access
  follows CelesTrak's usage guidance (≤ 1 request per group per 2 h).
* **Build record** — see `/how-built` in the app for the phase-by-phase log, tool inventory with versions and the verification results.
* **satellite.js** — MIT; SGP4 after Vallado, Crawford, Hujsak & Kelso, "Revisiting Spacetrack Report #3", AIAA 2006-6753.
* **Ultralytics YOLOv8** — AGPL-3.0 (training code; the exported ONNX graph is yours to use under the same terms).
* **SPARK 2022** — Rathinam et al., Zenodo 10.5281/zenodo.6599762 (documented, not used).
* **DUSTstreaks** — Zenodo record 21389101 (documented, not used). **SpaceDet** — IJCAI 2025 (documented, not used).
* Algorithms referenced: Bertin & Arnouts 1996 (SExtractor), Bewley et al. 2016 (SORT), Redmon et al. 2016 (YOLO),
  Alfano / Foster / Chan (collision probability — *not* implemented, by design).

Project code: MIT. Results produced with this prototype are preliminary research outputs and must not be used for
operational decisions.
