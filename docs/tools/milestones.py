"""The shared 'Project Milestones' section inserted into all five documents.

Identical structure, numbering and facts across the set, so the five documents
present one consistent five-milestone timeline. Every number comes from the
measured evidence loaded by build_docs.py; nothing is invented here.
"""
from __future__ import annotations

from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
FIG = ROOT / "docs/assets/figs"
SCR = ROOT / "docs/assets/screens"
PHO = ROOT / "docs/assets/photos"


def add_milestones(b, F):
    """b: docx_style.Builder, F: measured facts dictionary."""
    b.page_break()
    b.h1("Project Milestones")
    b.p("This section records the complete journey of ORBITAL GUARD from the initial idea to the working, "
        "tested implementation. It is organised as five sequential milestones. Each milestone states its "
        "objective, the work performed, the engineering decisions taken, the measured outcome and the evidence "
        "that supports it. The same five-milestone timeline appears in all five submission documents.")

    b.table(
        ["#", "Milestone", "Focus", "Principal deliverable", "Evidence in the repository"],
        [
            ["1", "Problem Identification and Project Planning", "Why debris monitoring matters; scope and objectives",
             "Problem statement, objectives, expected outcomes", "README.md §1; Mission page"],
            ["2", "Research, Dataset Collection and Technology Selection", "Literature, licensed data, tool choices",
             "Verified dataset + prepared splits + technology stack", "docs/evidence/dataset_verification.json; ml/data/streaks/dataset_manifest.json"],
            ["3", "AI Model Development and Space Object Detection", "Training, evaluation, deployment",
             f"YOLOv8n detector, test mAP@0.5 = {F['b20']['map50']:.3f}, 12.2 MB ONNX model", "ml/experiments/*.json; ml/weights/model.json"],
            ["4", "Tracking, Orbital Analysis and Collision Risk Assessment", "Multi-frame tracking, SGP4, conjunction screening",
             "Kalman tracker, propagation and screening modules", "docs/evidence/track_synthetic.json, prop_iss.json, conjunction.json"],
            ["5", "Website Integration, Testing and Final Project Delivery", "Full-stack integration and verification",
             "10-page dashboard, 12 API routes, 14 passing tests", "src/; tests/; docs/evidence/; docs/assets/screens/"],
        ],
        caption="The five-milestone project timeline (consistent across all submission documents).",
        widths=[0.3, 1.75, 1.5, 1.5, 1.3], font_size=8.5,
    )

    # ---------------------------------------------------------------- M1
    b.page_break()
    b.h1("Milestone 1 — Problem Identification and Project Planning")
    b.band([("Objective", "Establish why orbital debris is a safety problem, what is missing in current practice, and what a student-scale AI project can honestly contribute."),
            ("Phase", "Weeks 1–2 · scoping and planning"),
            ("Key outputs", "Problem statement · objectives · scope boundaries · success criteria"),
            ("Status", "Complete")])

    b.h2("1.1  What space debris is, and why it is serious")
    b.p("Space debris is any human-made object in Earth orbit that no longer serves a useful function: defunct "
        "satellites, spent rocket bodies, fragments from explosions and collisions, and mission-related hardware "
        "such as lens caps and separation bolts. The danger comes from speed rather than mass. In low Earth orbit "
        "(LEO) objects travel at roughly 7.8 km/s, and two objects in crossing orbits can meet at 10–15 km/s. At "
        "those speeds a 1 cm aluminium fragment carries kinetic energy comparable to a hand grenade, and a 10 cm "
        "fragment can destroy a spacecraft outright.")
    b.p("Approximately 35,000 objects larger than 10 cm are tracked and catalogued, while statistical models "
        "estimate on the order of one million fragments between 1 and 10 cm that are too small to catalogue yet "
        "large enough to be lethal. Two events dominate the current environment: the 2007 Fengyun-1C "
        "anti-satellite test and the 2009 accidental collision between Iridium-33 and Cosmos-2251. This project "
        "uses real catalogued element sets from both fragment clouds, so the analysis is performed on the actual "
        "debris population rather than on invented objects.")
    b.figure(PHO / "earth_debris_illustration.png",
             "The orbital debris environment around Earth (generated illustration, not a photograph).",
             "Individual debris fragments are far too small to be photographed at planetary scale, so every "
             "planetary-scale 'debris photo' is a rendering. This illustration was generated for the report and is "
             "labelled accordingly; the density of dots is symbolic, not a measured distribution.")

    b.h2("1.2  Why monitoring matters")
    b.bullet("Crewed platforms such as the ISS perform debris-avoidance manoeuvres; each manoeuvre costs fuel, mission time and science.", lead="Protecting people and assets — ")
    b.bullet("Weather, navigation, communications and Earth-observation services depend on satellites that must survive a progressively harsher environment.", lead="Continuity of services — ")
    b.bullet("Without monitoring and mitigation, collision fragments raise the probability of further collisions (the Kessler syndrome), which can make whole orbital shells unusable for generations.", lead="Long-term sustainability — ")
    b.bullet("Operators need timely, quantified warnings to decide whether to manoeuvre; that requires an unbroken chain from observation to orbit determination to conjunction assessment.", lead="Actionable warning — ")

    b.h2("1.3  Problems with traditional monitoring")
    b.p("Traditional space surveillance is built around large radars and dedicated optical sites. It works, but it "
        "has structural limitations that motivate this project:")
    b.bullet("Radar and survey telescopes are expensive, few in number, and their data are not always openly available at short notice.", lead="Cost and access — ")
    b.bullet("Radar sensitivity falls with the fourth power of range, so it favours LEO; optical sensors favour higher orbits and need darkness, clear skies and a sunlit target.", lead="Physical coverage gaps — ")
    b.bullet("Manual inspection of images does not scale to the volume produced by modern sensors, and small or faint streaks are easy for a human to miss.", lead="Human throughput — ")
    b.bullet("Public two-line element sets (TLEs) carry no uncertainty information, so a screening result is often misread as a collision prediction.", lead="Uncertainty is hidden — ")
    b.bullet("A bright dot or streak in an image is frequently reported as 'debris' when it may be a star, an aircraft, a meteor or a working satellite.", lead="Confusion between detection and identification — ")

    b.h2("1.4  Why an AI-based approach was chosen")
    b.p("Machine learning is well matched to the specific bottleneck of finding faint, elongated signals in "
        "noisy images at scale. A convolutional detector can be trained on real annotated frames and then applied "
        "consistently to thousands of images, while a transparent classical detector provides an interpretable "
        "baseline that shows exactly what the network is being compared against. Crucially, AI is applied only "
        "where it is appropriate: the image-analysis stage. Orbital motion is computed with an established "
        "physical model (SGP4), not learned, because the physics is already known and validated.")
    b.callout("Scope decision", "The project deliberately separates four questions that are often conflated: "
              "(1) is there a signal in this image, (2) is it moving relative to the stars, (3) where is a "
              "catalogued object at a given time, and (4) how close do two catalogued objects come. Only the first "
              "is an AI problem; the last is an orbital-mechanics problem.", "info")

    b.h2("1.5  Objectives")
    for i, t in enumerate([
        "Build a working web system that detects point sources and streaks in optical frames using both a classical detector and a genuinely trained neural detector.",
        "Train and evaluate the neural detector on real, openly licensed telescope data, with held-out test metrics and a documented failure analysis.",
        "Track detections across sequential frames and separate stationary stars from moving candidate objects.",
        "Import and validate real TLE/OMM element sets and propagate them with an established SGP4 implementation.",
        "Screen pairs of catalogued objects for close approaches and report time of closest approach, miss distance and relative velocity with explicit assumptions.",
        "Deliver reproducible scripts, automated tests, downloadable reports and beginner-level documentation.",
        "Remain scientifically honest: label synthetic data, preserve negative results and never claim a collision probability without covariance.",
    ], start=1):
        b.numbered(t)

    b.h2("1.6  Expected outcomes")
    b.p("A usable research prototype rather than an operational system: a dashboard with real inference, "
        "measured model metrics on a held-out test split, a transparent classical baseline, multi-frame tracking, "
        "validated orbital propagation, preliminary conjunction screening, and documentation complete enough for "
        "another student to reproduce and extend the work.")

    b.figure(FIG / "m1_debris_problem.png",
             "The space debris problem: where debris lives (left) and why the population grows (right).",
             "Schematic diagram generated for this report. Orbital shells are not to scale; the cascade on the "
             "right explains why a single fragmentation event has consequences lasting decades.")

    b.table(["Problem", "Impact", "Proposed solution in ORBITAL GUARD"],
            [["Faint streaks are easy to miss by eye and hard to find at scale", "Real objects go unreported; catalogues stay incomplete",
              "Classical matched-filter detector plus a YOLOv8n model trained on real annotated streaks"],
             ["A single frame cannot say whether a signal is moving", "Stars, satellites and debris are confused",
              "Multi-frame Kalman tracking that separates stationary from moving sources"],
             ["Public TLEs have no covariance information", "Screening distances are misread as collision predictions",
              "SGP4 screening with explicit assumptions; no probability is printed"],
             ["Results are hard to reproduce or audit", "Claims cannot be checked by others",
              "Every run logged with parameters, metrics, limitations; JSON/CSV/Markdown export"],
             ["Beginners cannot tell a demo from a measurement", "Overstated capability",
              "Data-origin badges, synthetic labels, and preserved negative results throughout the UI"]],
            caption="Problem → impact → proposed solution mapping agreed at the planning stage.",
            widths=[2.1, 1.9, 2.35], font_size=8.5)

    # ---------------------------------------------------------------- M2
    b.page_break()
    b.h1("Milestone 2 — Research, Dataset Collection and Technology Selection")
    b.band([("Objective", "Understand the sensing and orbital physics, find legally usable real data, and choose tools that a student can actually run."),
            ("Phase", "Weeks 2–4 · research and data acquisition"),
            ("Key outputs", "Dataset comparison · verified download · prepared splits · technology stack"),
            ("Status", "Complete — dataset checksum verified against the publisher record")])

    b.h2("2.1  Research into existing monitoring techniques")
    b.p("The study phase covered five areas. Radar observation provides range and range-rate directly and works "
        "in daylight and cloud, but its sensitivity falls with range to the fourth power, so it is most effective "
        "in LEO. Optical observation measures two angles (right ascension and declination) and is inexpensive, "
        "but requires darkness and a sunlit target; it excels at MEO and GEO. Image processing supplies the "
        "classical toolkit for finding sources — background estimation, noise modelling, matched filtering and "
        "connected-component analysis. Deep learning (the YOLO family in particular) supplies learned detectors "
        "that handle difficult appearance at the cost of needing labelled data. Orbital mechanics supplies the "
        "propagation model (SGP4/SDP4) that turns catalogued mean elements into positions.")
    b.p("A key insight from this phase shaped the whole project: in a sidereally tracked exposure, stars are "
        "points and moving objects are streaks. Motion, not brightness, is the discriminator — and even motion "
        "does not identify an object as debris.")
    b.figure(PHO / "telescope_observatory.jpg",
             "Optical observation: an observatory under a star-filled sky (contextual photograph).",
             "Photograph by Jason D via Pexels (Pexels licence). Shown for context only — the project's training "
             "frames come from a Stellina smart telescope in the StreaksYoloDataset, not from this site.")

    b.h2("2.2  Dataset selection and verification")
    b.p("Five candidate datasets were compared on licence, provenance, format and whether the pixels are real or "
        "rendered. SPARK 2022 is photo-realistic but simulated and access-gated; DUSTstreaks and SpaceDet are "
        "promising but were published later or are very large; Roboflow/Kaggle 'space debris' sets are mostly "
        "re-uploads of SPARK renders with unverifiable provenance and were rejected. StreaksYoloDataset was "
        "selected because it is real, openly licensed and already in YOLO format.")
    b.callout("Verified source",
              f"Zenodo record {F['ver']['zenodo_record_id']} · DOI {F['ver']['doi']} · "
              f"{F['ver']['title']} · licence CC BY 4.0. Archive {F['ver']['downloaded_size_bytes']:,} bytes; "
              f"published MD5 {F['ver']['published_md5']}; computed MD5 {F['ver']['computed_md5']} — "
              f"{'MATCH' if F['ver']['match'] else 'MISMATCH'}. Verified {F['ver']['verified_at'][:19]}Z "
              "(docs/evidence/dataset_verification.json).", "measured")

    b.h2("2.3  Dataset composition and the selected subset")
    b.p("The archive contains 2,388 JPEG frames at 640 × 640 pixels captured with a Stellina smart telescope "
        "(80 mm aperture, 400 mm focal length, Sony IMX178 sensor) between March 2022 and February 2023. Of these, "
        "1,642 frames carry a YOLO label file; the remaining 746 are unlabelled negatives. The single class is "
        "'streak'. For a CPU-feasible experiment a seeded subset of 360 labelled frames was prepared, respecting "
        "the author's original train/validation/test folders, containing 359 streak annotations.")
    b.table(["Split", "Images", "Share of subset", "Purpose"],
            [["Training", "259", "71.9 %", "Weight updates"],
             ["Validation", "49", "13.6 %", "Model selection / early stopping (best.pt)"],
             ["Test (held out)", "52", "14.4 %", "Final reported metrics; never used for tuning"],
             ["**Total**", "**360**", "**100 %**", "**359 streak annotations, seed 42**"]],
            caption="Distribution of the selected StreaksYoloDataset subset (from dataset_manifest.json).",
            widths=[1.5, 0.9, 1.2, 2.75], font_size=9)
    b.figure(FIG / "m2_dataset_distribution.png",
             "Measured dataset composition: full archive, selected subset, and object-size distribution.",
             "The right-hand panel matters for Milestone 3: the median streak box is about 25 % of the frame "
             "(≈162 px), i.e. these streaks are large, which later explains why a small-object head did not help.")
    b.figure(FIG / "m2_dataset_sample.png",
             "A real training-domain frame: StreaksYoloDataset test/6.jpeg with its published label box.",
             "Actual dataset image (CC BY 4.0), retrieved directly from the verified archive. The dashed box is "
             "the author's annotation; the diagonal trail is a moving object crossing the field during the exposure.")

    b.h2("2.4  Technology selection")
    b.p("YOLOv8n was chosen because its nano variant (about 3.2 million parameters) trains in minutes on a CPU, "
        "has a mature training/validation/export toolchain in Ultralytics, and exports cleanly to ONNX so the "
        "web backend can run it without Python. For orbital propagation, satellite.js was chosen because it is a "
        "direct port of Vallado's reference SGP4/SDP4 implementation — the same model that the TLE format was "
        "designed for — and it runs inside the Node.js API, avoiding a second service. Writing our own "
        "propagator was explicitly rejected: the physics is standard and re-implementing it would add risk "
        "without adding value.")
    b.table(["Layer", "Technology", "Version", "Why it was selected"],
            [["Frontend", "Next.js / React / TypeScript", f"{F['v']['next']} / {F['v']['react']} / {F['v']['typescript']}", "One deployable app for UI and REST API; strict typing"],
             ["Styling & charts", "Tailwind CSS / Recharts", f"{F['v']['tailwindcss']} / {F['v']['recharts']}", "Consistent dark theme; declarative React charts"],
             ["Detection (AI)", "Ultralytics YOLOv8n + PyTorch", f"{F['env'].get('ultralytics')} / {F['env'].get('torch')}", "CPU-trainable, mature export path"],
             ["Inference in API", "onnxruntime-node", F['v']['onnxruntime-node'], "Runs the trained model in-process, no Python at request time"],
             ["Classical CV", "Own implementation (TypeScript)", "1.0", "Transparent, interpretable baseline; no training data needed"],
             ["Orbits", "satellite.js (SGP4/SDP4)", F['v']['satellite.js'], "Reference implementation; correct frame handling"],
             ["Images", "pngjs / jpeg-js", f"{F['v']['pngjs']} / {F['v']['jpeg-js']}", "Pure JavaScript, no native build step"],
             ["Storage", "PostgreSQL + Drizzle ORM", f"14+ / {F['v']['drizzle-orm']}", "Typed access to a single run-log table"],
             ["Testing", "Vitest + ESLint + tsc", F['v']['vitest'], "Fast TypeScript-native tests and static gates"]],
            caption="Technology stack selected at Milestone 2 (versions read from the installed packages).",
            widths=[1.0, 1.75, 1.15, 2.45], font_size=8.5)
    b.figure(FIG / "m2_research_workflow.png",
             "Milestone 2 workflow: research → dataset → preprocessing → model selection.",
             "Each stage produced an artefact that the later milestones depend on, which is what makes the "
             "experiment reproducible.")

    # ---------------------------------------------------------------- M3
    b.page_break()
    b.h1("Milestone 3 — AI Model Development and Space Object Detection")
    b.band([("Objective", "Train a real detector on real data, measure it honestly on held-out images, and deploy it inside the web application."),
            ("Phase", "Weeks 4–7 · model development"),
            ("Key outputs", f"Trained YOLOv8n · test mAP@0.5 {F['b20']['map50']:.3f} · 12.2 MB ONNX model served by /api/detect"),
            ("Status", "Complete — three runs recorded, including a negative result")])

    b.h2("3.1  Dataset preparation and annotation handling")
    b.p("prepare_dataset.py copies (or symlinks) images and their YOLO label files into a canonical "
        "images/{split} + labels/{split} layout, respects the author's splits when --keep-splits is given, and "
        "takes a reproducible subset when --limit is used. Every label line is validated: the class id must be an "
        "integer and the four box coordinates must be numeric and inside the unit square; malformed lines are "
        "skipped rather than allowed to crash training. A dataset_manifest.json records the licence, origin, "
        "seed, split counts, class histogram, number of unlabelled images skipped and a digest of each split, so "
        "any experiment can state exactly which data it used.")

    b.h2("3.2  Image preprocessing")
    b.bullet("Training: images are resized to 512 × 512, normalised to 0–1, and augmented with mosaic, horizontal and vertical flips (a streak has no 'up', so vertical flips are physically valid) and scale jitter.", lead="Neural pipeline — ")
    b.bullet("Inference: the uploaded frame is letterboxed to 512 × 512 with grey (114) padding, converted to a [1,3,512,512] RGB float tensor, and predictions are mapped back to original pixel coordinates before class-wise non-maximum suppression at IoU 0.45.", lead="Deployment pipeline — ")
    b.bullet("Classical pipeline: colour is reduced to Rec. 601 luminance; a grid of local medians removes sky gradients; the noise level is estimated robustly from the median absolute deviation.", lead="Classical detector — ")

    b.h2("3.3  Training configuration")
    b.table(["Parameter", "Value", "Rationale"],
            [["Architecture", "YOLOv8n (yolov8n.pt, COCO initialisation)", "3.2 M parameters; transfer learning from a general detector"],
             ["Epochs", "20", "CPU-feasible; the 4-epoch smoke run was clearly under-trained"],
             ["Image size", "512 px", "Memory/time compromise on 4 CPU cores"],
             ["Batch size", "8", "Fits in ~3.9 GB RAM without a GPU"],
             ["Seed", "42 (deterministic=True)", "Reproducibility; recorded in the experiment record"],
             ["Device", "CPU (4 cores, CUDA unavailable)", "Sandbox hardware; no GPU was available"],
             ["Optimiser / lr0", "auto / 0.01", "Ultralytics default schedule"],
             ["Augmentation", "mosaic 1.0, fliplr 0.5, flipud 0.5, scale 0.5", "Physically valid for streaks"],
             ["Wall-clock time", f"{F['b20']['minutes']:.1f} minutes", "Measured for the deployed run"]],
            caption="Configuration of the deployed baseline run (baseline-streaks-20ep).",
            widths=[1.35, 2.35, 2.65], font_size=8.5)
    b.figure(FIG / "m3_training_workflow.png",
             "Model development workflow from prepared data to a deployed ONNX detector.",
             "Validation data select the best weights; only the untouched test split produces the numbers that "
             "are reported. The export step also writes provenance metadata that the UI displays.")

    b.h2("3.4  The classical computer-vision detector")
    b.p("Alongside the neural model, the project implements a transparent detector in the tradition of "
        "SExtractor. It estimates the sky background on a 32-pixel grid of medians and interpolates bilinearly, "
        "estimates the noise σ as 1.4826 × the median absolute deviation of the residual, applies a Gaussian "
        "matched filter sized to the point-spread function (which raises the signal-to-noise ratio of faint "
        "sources), thresholds at k·σ, and labels 8-connected components. Components smaller than three pixels "
        "are rejected as hot pixels or cosmic rays; very large components are rejected as glare. For each "
        "surviving component it measures the intensity-weighted centroid, flux, SNR and the second-moment shape, "
        "and classifies it as a streak when the major/minor axis ratio exceeds 2.2.")
    b.figure(FIG / "m3_classical_pipeline.png",
             "The classical detection pipeline: background → noise → matched filter → threshold → filtering → measurement.",
             "Every parameter has a physical meaning, which is why this detector serves as the interpretable "
             "baseline for the neural model.")
    b.callout("Confidence is not probability", "The classical score is 1 − exp(−(SNR − kσ)/2kσ), a monotonic "
              "ranking heuristic. The neural score is an uncalibrated network output. Neither is a probability "
              "that the object is debris, and the interface says so.", "warn")

    b.h2("3.5  Measured results")
    b.table(["Run", "Epochs", "Val mAP@0.5", "Test P", "Test R", "Test F1", "Test mAP@0.5", "Test mAP@0.5:0.95", "Time"],
            [["baseline-streaks-4ep", "4", f"{F['b4']['val_map50']:.3f}", f"{F['b4']['precision']:.3f}", f"{F['b4']['recall']:.3f}", f"{F['b4']['f1']:.3f}", f"{F['b4']['map50']:.3f}", f"{F['b4']['map50_95']:.3f}", f"{F['b4']['minutes']:.1f} min"],
             ["**baseline-streaks-20ep (deployed)**", "20", f"{F['b20']['val_map50']:.3f}", f"**{F['b20']['precision']:.3f}**", f"**{F['b20']['recall']:.3f}**", f"**{F['b20']['f1']:.3f}**", f"**{F['b20']['map50']:.3f}**", f"**{F['b20']['map50_95']:.3f}**", f"{F['b20']['minutes']:.1f} min"],
             ["improved-p2-streaks-20ep", "20", f"{F['p2']['val_map50']:.3f}", f"{F['p2']['precision']:.3f}", f"{F['p2']['recall']:.3f}", f"{F['p2']['f1']:.3f}", f"{F['p2']['map50']:.3f}", f"{F['p2']['map50_95']:.3f}", f"{F['p2']['minutes']:.1f} min"]],
            caption="Measured performance on the held-out test split (52 real images), from ml/experiments/*.json.",
            widths=[1.75, 0.5, 0.72, 0.5, 0.5, 0.5, 0.72, 0.85, 0.6], font_size=8)
    b.figure(FIG / "m3_training_curves.png",
             "Actual training curves for the deployed run: box loss, classification loss and validation metrics per epoch.",
             "Plotted from the per-epoch values that Ultralytics wrote to results.csv and that train.py copied "
             "into the experiment record. No curve has been reconstructed from summary statistics.")
    b.figure(FIG / "m3_model_comparison.png",
             "Held-out test comparison of the three recorded runs.",
             "Extending training from 4 to 20 epochs raised F1 from 0.501 to 0.812. The P2 variant, hypothesised "
             "to help small objects, performed worse — a negative result that is preserved, not hidden.")

    b.h2("3.6  ONNX conversion and deployment")
    b.p(f"export_onnx.py converts best.pt to ONNX (opset 12, simplified) and writes model.json alongside it. "
        f"The deployed artefact is {F['model_bytes']/1e6:.1f} MB with a 512 × 512 input and a single class, "
        f"'streak'. The Next.js API loads it with onnxruntime-node on the CPU; if the weights or the runtime are "
        f"missing, the API reports the reason and falls back to the classical detector rather than pretending a "
        f"network ran. In the project's original end-to-end smoke test the deployed model returned one streak "
        f"with confidence 0.921 on a held-out frame.")
    b.figure(FIG / "m3_detection_pair.png",
             "Actual input and output: real telescope frame test/6.jpeg processed by the deployed ONNX model.",
             f"Left: the published ground-truth box. Right: the model's prediction, confidence "
             f"{F['onnx6']['conf']:.3f}, IoU {F['onnx6']['iou']:.3f} with the label, produced through the live "
             f"/api/detect endpoint in {F['onnx6']['ms']} ms.")
    b.p("The same verification was repeated on four held-out frames retrieved directly from the verified "
        "archive. Two were detected and two were missed at the 0.25 confidence threshold; both outcomes are "
        "reported here because a detector that is only shown on its successes is not being evaluated.")
    b.table(["Frame (test split)", "Ground truth", "ONNX result at conf ≥ 0.25", "IoU with label", "Outcome"],
            [["test/6.jpeg", "1 streak", f"1 streak, confidence {F['onnx6']['conf']:.3f}", f"{F['onnx6']['iou']:.3f}", "Correct detection"],
             ["test/601.jpeg", "1 streak", f"1 streak, confidence {F['onnx601']['conf']:.3f}", f"{F['onnx601']['iou']:.3f}", "Correct detection"],
             ["test/60.jpeg", "1 streak", "no detection", "—", "Missed (thin, near-horizontal streak)"],
             ["test/602.jpeg", "1 streak", "no detection", "—", "Missed"]],
            caption="Per-frame verification of the deployed model on real held-out images (docs/evidence/onnx_*.json).",
            widths=[1.3, 0.95, 1.85, 0.85, 1.4], font_size=8.5)
    b.figure(FIG / "m3_detection_miss.png",
             "A genuine failure case: test/60.jpeg, whose thin near-horizontal streak was not detected at conf ≥ 0.25.",
             "Failure cases like this are the reason the project reports recall by object size and by SNR rather "
             "than a single headline number.")
    b.figure(FIG / "m3_failure_analysis.png",
             "Measured failure analysis: recall by object size on real test data, and by SNR on synthetic frames.",
             "The 'small' size bin contains no objects in this dataset, which is precisely why the P2 "
             "small-object head could not demonstrate a benefit here.")

    b.h2("3.7  Detecting a streak is not identifying debris")
    b.callout("Scientific boundary", "The detector's output means 'an elongated signal consistent with an object "
              "moving relative to the stars during the exposure'. Satellites, debris, aircraft and meteors all "
              "produce such signals. Identifying the object requires astrometric calibration, accurate timing and "
              "association with a catalogue — none of which a single image provides. ORBITAL GUARD therefore "
              "never labels a detection as 'debris'.", "danger")

    # ---------------------------------------------------------------- M4
    b.page_break()
    b.h1("Milestone 4 — Tracking, Orbital Analysis and Collision Risk Assessment")
    b.band([("Objective", "Follow detections across frames, propagate real catalogued orbits, and screen pairs for close approaches without overstating what the data support."),
            ("Phase", "Weeks 7–10 · tracking and orbital mechanics"),
            ("Key outputs", "Kalman tracker · SGP4 propagation · conjunction screening with assumptions"),
            ("Status", "Complete — tracking validated on labelled synthetic sequences")])

    b.h2("4.1  Tracking detections across frames")
    b.p("Each frame is processed by the classical detector, and the resulting centroids are fed to a "
        "tracking-by-detection stage in the spirit of SORT. Every track carries a four-state vector "
        "[x, y, vx, vy] in image coordinates with a constant-velocity motion model.")
    b.numbered("Propagate the state and covariance one frame forward (x ← Fx, P ← FPFᵀ + Q).", lead="Predict — ")
    b.numbered("Only detections within a gate (18 px by default) of a prediction are considered candidates.", lead="Gate — ")
    b.numbered("Candidate pairs are sorted by distance and matched greedily, one-to-one. This is a fast approximation of the optimal Hungarian assignment.", lead="Associate — ")
    b.numbered("Matched tracks are corrected with the Kalman gain; their hit count increases.", lead="Update — ")
    b.numbered("Unmatched tracks continue on their prediction for up to three frames, so a dropped detection does not immediately break a track; these points are marked as coasted, not measured.", lead="Coast — ")
    b.numbered("A track is confirmed after three real detections; unmatched detections spawn new tracks; tracks that exceed the miss limit are terminated and their trailing predictions discarded.", lead="Confirm / spawn / terminate — ")
    b.p("Finally, a confirmed track whose fitted speed is below 0.6 px per frame is classified as stationary "
        "(a star in a sidereally tracked sequence); faster tracks are moving candidates. The velocity used for "
        "this decision comes from a least-squares fit over the measured points, which is more robust than the "
        "instantaneous filter state.")
    b.figure(FIG / "m4_kalman_diagram.png",
             "The four-state Kalman tracking loop with gating, coasting, confirmation and termination.",
             "Diagram generated for this report; the parameter values shown are the defaults actually used in "
             "src/lib/vision/tracker.ts.")
    b.callout("Synthetic test — labelled", f"The tracking test below uses generated frames, not telescope "
              f"observations. Result: {F['track']['frames']} frames, {F['track']['detectionsTotal']} detections, "
              f"{F['track']['tracksTotal']} tracks of which {F['track']['confirmed']} were confirmed — "
              f"{F['track']['moving']} moving and {F['track']['stationary']} stationary. Coverage of the known "
              f"moving-object positions was {F['track']['coverage']*100:.0f} %, with one track fragment per true "
              "object (no identity splits).", "measured")
    b.figure(FIG / "m4_tracking_trajectories.png",
             "SYNTHETIC tracking test: confirmed trajectories in image coordinates and their linear motion.",
             "Cyan tracks are the two moving objects; grey tracks are stationary stars; the purple dotted lines "
             "are the generator's ground truth. Hollow markers are coasted predictions where the detector "
             "missed a frame — the mechanism that keeps a track alive through dropouts.")

    b.h2("4.2  Why image-plane tracking is not an orbit")
    b.table(["Aspect", "Image-plane tracking (implemented)", "Orbital tracking (not implemented)"],
            [["Coordinates", "Pixels on the sensor", "Kilometres in an inertial frame (TEME)"],
             ["Velocity", "Pixels per frame", "km/s, from a fitted orbit"],
             ["Required inputs", "A sequence of frames from one sensor", "Astrometric plate solution, exposure mid-times, observer position"],
             ["Method", "Kalman filter + association", "Initial orbit determination (Gauss/Gooding) + catalogue correlation"],
             ["What it can tell you", "Something moved relative to the stars", "Which catalogued object it is, and where it will be"],
             ["What it cannot tell you", "Altitude, identity, or future position", "—"]],
            caption="Image tracking versus orbital tracking — the gap this project deliberately does not pretend to close.",
            widths=[1.25, 2.5, 2.6], font_size=8.5)

    b.h2("4.3  TLE/OMM data and SGP4/SDP4 propagation")
    b.p("A two-line element set encodes the mean orbital elements of a catalogued object at an epoch, together "
        "with the B* drag term. The Orbit Mean-Elements Message (OMM, CCSDS 502) carries the same content in "
        "JSON or XML with named fields. The importer validates line length, line numbers, catalogue-number "
        "consistency, modulo-10 checksums, element ranges and the epoch, and it warns when a requested window is "
        "more than seven days from the epoch, refusing beyond thirty days.")
    b.p("Propagation uses SGP4 (with the SDP4 deep-space extensions) through satellite.js. Output positions and "
        "velocities are in the TEME frame; geodetic latitude, longitude and altitude are derived via Greenwich "
        "mean sidereal time for display. Typical accuracy is about one kilometre at epoch, degrading by "
        "kilometres per day in LEO because of drag variability and unmodelled manoeuvres.")
    b.callout("Measured sanity check", f"ISS (NORAD 25544) propagated for 95 minutes at 60-second steps produced "
              f"{F['iss']['n']} samples with a starting altitude of {F['iss']['alt0']:.1f} km and an inertial "
              f"speed of {F['iss']['speed0']:.3f} km/s — both inside the physically expected range for the "
              "station, and asserted automatically in the test suite.", "measured")
    b.figure(FIG / "m4_iss_propagation.png",
             "Measured ISS propagation: altitude, inertial speed and ground track over one orbit.",
             "Computed by /api/orbital/propagate from the bundled real element set; the oscillation in altitude "
             "and the anti-correlated speed follow directly from the orbit's small eccentricity.")

    b.h2("4.4  Close-approach screening")
    b.p("Both objects are propagated on a coarse grid and the Euclidean separation of their TEME positions is "
        "computed at every sample. Local minima are located, and the global minimum is refined by a "
        "golden-section search between the neighbouring samples to about one millisecond in time. The result "
        "reports the time of closest approach (TCA), the miss distance, the relative speed |v_A − v_B|, and the "
        "miss vector resolved into the radial / in-track / cross-track (RIC) frame of object A. A warning is "
        "issued when the objects can move further between samples than twice the reporting threshold, because "
        "such a window could under-sample a brief encounter.")
    b.table(["Quantity", "Measured value", "Notes"],
            [["Objects", f"{F['conj']['a_name']} (33757) vs {F['conj']['b_name']} (33758)", "Two fragments of the Cosmos-2251 cloud"],
             ["Window", "24 h from 2026-10-21T12:00:00Z", f"{F['conj']['samples']:,} coarse samples at 30 s"],
             ["Time of closest approach", F['conj']['tca'], "Golden-section refined"],
             ["Miss distance", f"{F['conj']['miss']:,.3f} km", "Euclidean, TEME frame"],
             ["Relative speed", f"{F['conj']['vrel']} km/s", "Magnitude of the velocity difference at TCA"],
             ["RIC components (B relative to A)", f"R {F['conj']['ric']['radial']:,.1f} · I {F['conj']['ric']['inTrack']:,.1f} · C {F['conj']['ric']['crossTrack']:,.1f} km", "Norm equals the miss distance"],
             ["Screening outcome", f"Not flagged (threshold {F['conj']['threshold']} km)", "No close approach in this window"],
             ["Collision probability", "Not computed", "TLEs carry no covariance — see below"]],
            caption="Measured close-approach screening result (docs/evidence/conjunction.json).",
            widths=[1.8, 2.4, 2.15], font_size=8.5)
    b.figure(FIG / "m4_closest_approach.png",
             "Measured orbital geometry and separation: propagated paths of both fragments and the 24-hour separation series.",
             "Left: real SGP4 positions in TEME with the miss vector at TCA. Right: the sampled separation on a "
             "logarithmic scale; the periodic dips are the repeated encounters of two objects in similar orbits.")
    b.callout("Why no collision probability is calculated", "A scientifically valid probability of collision "
              "requires the position covariance of both objects and a validated method (for example Foster, "
              "Alfano or Chan) applied in the encounter plane. Public TLEs contain no covariance, so any number "
              "produced here would be fabricated. The system therefore reports a preliminary screening distance "
              "and explicitly stops short of a probability or any manoeuvre recommendation.", "danger")

    # ---------------------------------------------------------------- M5
    b.page_break()
    b.h1("Milestone 5 — Website Integration, Testing and Final Project Delivery")
    b.band([("Objective", "Integrate every module into one usable, tested web application and deliver documentation that another student can follow."),
            ("Phase", "Weeks 10–13 · integration, verification and delivery"),
            ("Key outputs", "10-page dashboard · 12 API routes · run logging and reports · 14 passing tests"),
            ("Status", "Complete — production build and health check pass")])

    b.h2("5.1  Frontend and backend integration")
    b.p(f"The application is a single Next.js {F['v']['next']} deployment. React {F['v']['react']} components "
        f"written in TypeScript {F['v']['typescript']} and styled with Tailwind CSS {F['v']['tailwindcss']} "
        f"provide the interface; twelve App Router route handlers provide the REST backend. PostgreSQL, accessed "
        f"through Drizzle ORM {F['v']['drizzle-orm']}, stores one row per analysis run with its inputs, "
        f"parameters, model version, metrics, outputs and limitations, which is what makes the Reports page and "
        f"the JSON/CSV/Markdown exports possible.")
    b.figure(FIG / "m5_architecture.png",
             "Final system architecture: browser, API routes, domain libraries, model runtime, catalogue and database.",
             "The Python training pipeline is offline: it produces the ONNX model and the experiment records "
             "that the running application reads. Nothing is trained at request time.")

    b.h2("5.2  The dashboard and its major pages")
    b.table(["Page", "Purpose", "What the user can do"],
            [["Mission overview", "Project framing and live status", "See which engines are available and how fresh the catalogue is"],
             ["Detection Lab", "Image-based detection", "Upload a frame or pick a sample, choose engine and parameters, download annotated results"],
             ["Dataset & Model", "Data and measured experiments", "Inspect dataset facts, training records, curves; run the synthetic benchmark"],
             ["Tracking", "Multi-frame association", "Run the Kalman tracker on a sequence and replay trajectories frame by frame"],
             ["Orbital Analysis", "TLE/OMM import and SGP4", "Validate element sets, propagate, inspect altitude, speed and ground track"],
             ["Close Approach", "Conjunction screening", "Select two objects, screen a window, read TCA, miss distance and RIC"],
             ["Reports", "Run log and exports", "Filter runs, download JSON/CSV/Markdown, delete records"],
             ["Tutorial", "Hands-on guidance", "Follow 21 step-by-step feature guides with a saved checklist"],
             ["How It's Built", "Build record", "Read the phase log, tool inventory and verification results"],
             ["Learning Centre", "Theory", "Study debris, orbits, detection metrics, tracking and conjunctions"]],
            caption="The ten pages of the delivered dashboard.",
            widths=[1.3, 1.8, 3.25], font_size=8.5)
    b.figure(SCR / "01_mission.png",
             "Actual screenshot — Mission overview page with live system status.",
             "Captured from the running production build. The status panel reports the real availability of the "
             "trained model and the age of the bundled catalogue.")

    b.h2("5.3  Image upload and detection workflow")
    b.p("A file selected in the browser is sent as multipart form data to /api/detect. The server sniffs the "
        "magic bytes (rather than trusting the declared MIME type), enforces a 12 MB and 16-megapixel limit, "
        "decodes with pngjs or jpeg-js, clamps every parameter to a safe range, runs the selected engine, scores "
        "against ground truth when the input is a known synthetic sample, writes a run record, and returns "
        "detections with the engine that actually ran. The browser draws the boxes on a canvas over the original "
        "image and offers PNG, JSON and CSV downloads plus a Markdown report link.")
    b.figure(SCR / "02b_detection_results_crop.png",
             "Actual screenshot — Detection Lab results: original and annotated frames, diagnostics and measurements.",
             "This is the classical engine on a synthetic sample; the panel reports the measured noise level, "
             "threshold, rejected components and the score against that sample's known ground truth.")

    b.h2("5.4  Tracking and orbital modules in the interface")
    b.figure(SCR / "03b_tracking_results_crop.png",
             "Actual screenshot — Tracking interface with confirmed trajectories and the frame slider.",
             "Synthetic demonstration sequence. Moving tracks are coloured, stationary star tracks are muted, "
             "and the recovery panel scores the result against the generator's truth.")
    b.figure(SCR / "04b_orbital_results_crop.png",
             "Actual screenshot — Orbital Analysis results for the ISS: parameters, altitude, speed and ground track.",
             "Real element set, real SGP4 propagation; the frame and the epoch-age assumptions are stated with "
             "the result.")

    b.h2("5.5  API integration, database logging and model deployment")
    b.bullet("Twelve JSON endpoints cover detection, tracking, benchmarking, catalogue access, propagation, conjunction screening, sample images, experiment records, model status, reports and health.", lead="API surface — ")
    b.bullet("Every analysis is logged with its data origin, so demonstration runs (synthetic) are never mixed with experimental runs (uploads or catalogue data). Saving is best-effort: a database outage never breaks an analysis.", lead="Run logging — ")
    b.bullet("The exported ONNX model is loaded lazily on first use and kept in memory; if it or the runtime is unavailable the API explains why and falls back to the classical detector.", lead="Model deployment — ")

    b.h2("5.6  Testing and verification")
    b.table(["Check", "Command / method", "Result"],
            [["Type generation", "npx next typegen", "Passed"],
             ["Type checking", "tsc --noEmit (strict)", "0 errors"],
             ["Linting", "eslint src tests", "0 errors, 0 warnings"],
             ["Unit / integration tests", "vitest run", f"{F['tests']} tests passed in 3 files"],
             ["Production build", "npm run build", "Completed successfully"],
             ["Page smoke test", "HTTP GET on all pages", "10 of 10 pages returned HTTP 200"],
             ["API smoke test", "curl against every endpoint", "All endpoints returned expected results, including error cases"],
             ["Model verification", "Real held-out frames through /api/detect", f"test/6.jpeg detected at {F['onnx6']['conf']:.3f} (IoU {F['onnx6']['iou']:.3f}); two of four frames missed and reported"],
             ["Orbital sanity", "ISS altitude and speed assertions", f"{F['iss']['alt0']:.1f} km, {F['iss']['speed0']:.3f} km/s — within expected bounds"],
             ["Data integrity", "MD5 of the downloaded archive", "Matches the publisher's checksum"]],
            caption="Software testing and verification results at delivery.",
            widths=[1.5, 2.2, 2.65], font_size=8.5)

    b.h2("5.7  Limitations and future improvements")
    b.p("The delivered system is a research prototype. The detector was trained on a 360-image subset with a "
        "short CPU schedule and a single seed, so no variance estimate exists. Tracking has been validated on "
        "synthetic sequences, not on real time-tagged observations. No astrometric calibration or orbit "
        "determination is implemented, so image tracks cannot be linked to catalogue objects. Close-approach "
        "results are screening estimates from public mean elements without covariance, and no collision "
        "probability or avoidance advice is produced.")
    b.figure(FIG / "m5_roadmap.png",
             "Future development roadmap: from the delivered prototype to covariance-based risk assessment.",
             "Each stage depends on the previous one; collision probability appears only once covariance data "
             "and a validated method are available.")
    b.table(["Horizon", "Work item", "Why it matters"],
            [["Next", "Train on all 1,642 labelled frames including negatives; multi-seed study", "Reduces overfitting and gives error bars"],
             ["Next", "Evaluate on DUSTstreaks / SpaceDet", "Tests cross-sensor generalisation"],
             ["Then", "Plate solving, exposure timing, initial orbit determination", "Turns image tracks into orbits and enables catalogue correlation"],
             ["Then", "Hungarian assignment and real sequence tracking", "Reduces identity switches in crowded fields"],
             ["Later", "Covariance / CDM ingestion and validated Pc methods", "The only defensible route to a collision probability"],
             ["Later", "CI pipeline, authentication, batch processing", "Makes the platform usable by a group"]],
            caption="Future development roadmap in tabular form.",
            widths=[0.8, 2.9, 2.65], font_size=8.5)
    b.callout("Delivery statement", "ORBITAL GUARD is delivered as a working, tested and documented research "
              "prototype. It performs real detection, real tracking and real orbital propagation, and it is "
              "explicit about every boundary it does not cross. It is not an operational space-situational-"
              "awareness system and must not be used for manoeuvre decisions.", "info")
