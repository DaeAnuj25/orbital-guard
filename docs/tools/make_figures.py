"""Generate every technical diagram and data plot used in the five submission
documents.

Rules followed here:
  * Data plots are drawn ONLY from measured evidence in docs/evidence/*.json and
    ml/experiments/*.json (real API responses and real training records).
  * Diagrams are schematic and are captioned as diagrams in the documents.
  * Synthetic tracking output is labelled SYNTHETIC on the figure itself.

Usage: python3 docs/tools/make_figures.py
"""
from __future__ import annotations

import json
from pathlib import Path

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np
from matplotlib.patches import Circle, Ellipse, FancyArrowPatch, FancyBboxPatch, Rectangle
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
FIG = ROOT / "docs/assets/figs"
FIG.mkdir(parents=True, exist_ok=True)
EV = ROOT / "docs/evidence"
DS = ROOT / "docs/assets/dataset"

# Print-friendly palette (dark ink on white; cyan/amber/emerald accents match the app)
NAVY, CYAN, AMBER, GREEN, RED, SLATE, GRID = "#0B1220", "#0E7490", "#B45309", "#047857", "#B91C1C", "#475569", "#D8DEE9"
plt.rcParams.update({
    "figure.dpi": 200, "savefig.dpi": 200, "font.family": "DejaVu Sans", "font.size": 9,
    "axes.titlesize": 10.5, "axes.titleweight": "bold", "axes.labelsize": 9,
    "axes.edgecolor": SLATE, "axes.labelcolor": NAVY, "text.color": NAVY,
    "xtick.color": SLATE, "ytick.color": SLATE, "axes.grid": True, "grid.color": GRID,
    "grid.linewidth": 0.6, "axes.axisbelow": True, "legend.frameon": False, "figure.facecolor": "white",
})


def save(fig, name):
    fig.savefig(FIG / name, bbox_inches="tight", facecolor="white")
    plt.close(fig)
    print("figure:", name)


def load(p):
    return json.loads(Path(p).read_text())


def box(ax, x, y, w, h, title, lines=(), fc="#F1F5F9", ec=CYAN, title_color=NAVY, fs=9):
    ax.add_patch(FancyBboxPatch((x, y), w, h, boxstyle="round,pad=0.012,rounding_size=0.02",
                                linewidth=1.3, edgecolor=ec, facecolor=fc))
    ax.text(x + w / 2, y + h - 0.035, title, ha="center", va="top", fontsize=fs + 0.5, fontweight="bold", color=title_color)
    for i, ln in enumerate(lines):
        ax.text(x + w / 2, y + h - 0.085 - i * 0.042, ln, ha="center", va="top", fontsize=fs - 1.2, color=SLATE)


def arrow(ax, p, q, color=CYAN, style="-|>", lw=1.5, rad=0.0, ls="-"):
    ax.add_patch(FancyArrowPatch(p, q, arrowstyle=style, mutation_scale=13, linewidth=lw,
                                 color=color, linestyle=ls, connectionstyle=f"arc3,rad={rad}", shrinkA=2, shrinkB=2))


# ---------------------------------------------------------------- M1: debris problem
def fig_debris_problem():
    fig, (ax, ax2) = plt.subplots(1, 2, figsize=(11.2, 4.5), gridspec_kw={"width_ratios": [1.05, 1]})
    for a in (ax, ax2):
        a.grid(False); a.set_xlim(0, 1); a.set_ylim(0, 1); a.axis("off")

    # Left: orbital shells (schematic, not to scale)
    cx, cy = 0.32, 0.45
    ax.add_patch(Circle((cx, cy), 0.095, color="#1D4ED8", alpha=0.85, zorder=3))
    ax.text(cx, cy, "EARTH", ha="center", va="center", color="white", fontsize=7.5, fontweight="bold", zorder=4)
    shells = [(0.145, CYAN, "LEO 160–2,000 km", "most tracked debris", 0.70),
              (0.225, "#7C3AED", "MEO ~20,000 km", "navigation satellites", 0.52),
              (0.305, AMBER, "GEO 35,786 km", "one crowded ring", 0.34)]
    rng = np.random.default_rng(7)
    for r, col, l1, l2, ly in shells:
        ax.add_patch(Ellipse((cx, cy), 2 * r, 2 * r * 0.66, fill=False, ec=col, lw=1.4, ls="--" if r > 0.2 else "-"))
        t = rng.uniform(0, 2 * np.pi, {0.145: 150, 0.225: 45, 0.305: 30}[r])
        ax.scatter(cx + r * np.cos(t), cy + r * 0.66 * np.sin(t), s=2.4, color=col, alpha=0.75, zorder=5)
        # legend-style key with a leader line, clear of the ellipses
        ax.plot([0.665, 0.705], [ly, ly], color=col, lw=2)
        ax.text(0.72, ly + 0.035, l1, ha="left", va="center", fontsize=7.8, color=col, fontweight="bold")
        ax.text(0.72, ly - 0.035, l2, ha="left", va="center", fontsize=7.2, color=SLATE)
    ax.text(0.5, 0.965, "Where the problem lives", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.5, 0.035, "Schematic, not to scale. Dots are symbolic: ~35,000 objects >10 cm are tracked;\n~1 million 1–10 cm fragments are estimated but untracked.", ha="center", fontsize=7.4, color=SLATE)

    # Right: cascade chain
    ax2.text(0.5, 0.965, "Why it grows: the collision cascade", ha="center", fontsize=10.5, fontweight="bold")
    items = [("Fragmentation event", "2007 Fengyun-1C test · 2009 Iridium-33 / Cosmos-2251", AMBER),
             ("Thousands of new fragments", "each keeps the parent orbit for years to centuries", CYAN),
             ("Higher collision probability", "LEO relative speeds reach 10–15 km/s", CYAN),
             ("More fragments (Kessler syndrome)", "1 cm fragment ≈ hand-grenade energy", RED)]
    y = 0.83
    for i, (t, s, col) in enumerate(items):
        box(ax2, 0.06, y - 0.145, 0.88, 0.145, t, (s,), ec=col)
        if i < 3:
            arrow(ax2, (0.5, y - 0.15), (0.5, y - 0.185), color=SLATE)
        y -= 0.205
    arrow(ax2, (0.955, 0.115), (0.955, 0.79), color=RED, rad=-0.45, ls=":")
    ax2.text(0.995, 0.45, "feedback", rotation=90, va="center", ha="center", fontsize=7.5, color=RED)
    save(fig, "m1_debris_problem.png")


# ---------------------------------------------------------------- M2: research workflow
def fig_research_workflow():
    fig, ax = plt.subplots(figsize=(11.2, 2.9))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    stages = [("1 · RESEARCH", ["Radar vs optical sensing", "Streak vs point-source physics", "YOLO / SGP4 literature"], CYAN),
              ("2 · DATASET", ["5 candidates compared", "Licence + provenance check", "StreaksYoloDataset chosen"], CYAN),
              ("3 · PREPROCESSING", ["Author splits respected", "Seeded 360-image subset", "Box validation, manifest"], CYAN),
              ("4 · MODEL SELECTION", ["YOLOv8n (3.2 M params)", "CPU-trainable baseline", "P2 variant as hypothesis"], GREEN)]
    w, gap = 0.215, 0.045
    for i, (t, lines, col) in enumerate(stages):
        x = 0.02 + i * (w + gap)
        box(ax, x, 0.22, w, 0.6, t, lines, ec=col, fs=8.6)
        if i < 3:
            arrow(ax, (x + w + 0.004, 0.52), (x + w + gap - 0.004, 0.52))
    ax.text(0.5, 0.93, "Milestone 2 workflow: from literature to a justified, reproducible model choice", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.5, 0.09, "Every stage leaves an artefact: dataset table → dataset_manifest.json (seed, split digests) → data.yaml → config + experiment record", ha="center", fontsize=7.8, color=SLATE)
    save(fig, "m2_research_workflow.png")


def fig_dataset_distribution():
    man = load(ROOT / "ml/data/streaks/dataset_manifest.json")
    fig, axes = plt.subplots(1, 3, figsize=(11.2, 3.3))
    ax = axes[0]
    labelled, unlabelled = 1642, 2388 - 1642
    ax.bar(["With YOLO label", "No label\n(negative frames)"], [labelled, unlabelled], color=[CYAN, "#94A3B8"], width=0.6)
    for i, v in enumerate([labelled, unlabelled]):
        ax.text(i, v + 30, f"{v:,}", ha="center", fontweight="bold")
    ax.set_title("Full archive: 2,388 frames"); ax.set_ylabel("images"); ax.set_ylim(0, 2000)

    ax = axes[1]
    counts = man["counts"]; keys = ["train", "val", "test"]
    vals = [counts["train"], counts["val"], counts["test"]]
    ax.bar(keys, vals, color=[CYAN, AMBER, GREEN], width=0.6)
    for i, v in enumerate(vals):
        ax.text(i, v + 5, str(v), ha="center", fontweight="bold")
    ax.set_title(f"Selected subset: {sum(vals)} images (seed {man['seed']})"); ax.set_ylabel("images"); ax.set_ylim(0, 300)

    ax = axes[2]
    sizes = [0.25247795386429284]
    ax.bar(["Median box size\n(√(w·h), fraction of frame)"], sizes, color=CYAN, width=0.4)
    ax.axhline(16 / 640, color=RED, ls="--", lw=1.2)
    ax.text(0.42, 16 / 640 + 0.012, "16 px 'small object' limit", color=RED, fontsize=7.6, ha="right")
    ax.text(0, sizes[0] + 0.012, f"{sizes[0]:.3f}  (≈162 px)", ha="center", fontweight="bold")
    ax.set_title("Streaks are LARGE in this data"); ax.set_ylim(0, 0.32); ax.set_ylabel("relative size")
    ax.tick_params(axis="x", labelsize=7.6)
    fig.suptitle("Measured dataset composition — StreaksYoloDataset (CC BY 4.0), 359 streak annotations in the selected subset", fontsize=10.5, fontweight="bold", y=1.04)
    save(fig, "m2_dataset_distribution.png")


# ---------------------------------------------------------------- dataset sample + detection pair
FONT_CANDIDATES = ["/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"]


def font(sz):
    for f in FONT_CANDIDATES:
        if Path(f).exists():
            return ImageFont.truetype(f, sz)
    return ImageFont.load_default()


def draw_boxes(img_path, boxes, out, title=None):
    """boxes: list of (x1,y1,x2,y2,color,label,dashed)"""
    im = Image.open(img_path).convert("RGB")
    d = ImageDraw.Draw(im)
    for x1, y1, x2, y2, col, lab, dashed in boxes:
        if dashed:
            step = 12
            for x in range(int(x1), int(x2), step * 2):
                d.line([(x, y1), (min(x + step, x2), y1)], fill=col, width=3)
                d.line([(x, y2), (min(x + step, x2), y2)], fill=col, width=3)
            for y in range(int(y1), int(y2), step * 2):
                d.line([(x1, y), (x1, min(y + step, y2))], fill=col, width=3)
                d.line([(x2, y), (x2, min(y + step, y2))], fill=col, width=3)
        else:
            d.rectangle([x1, y1, x2, y2], outline=col, width=3)
        if lab:
            f = font(17)
            tw = d.textlength(lab, font=f)
            ty = max(0, y1 - 24)
            d.rectangle([x1, ty, x1 + tw + 10, ty + 22], fill=(11, 18, 32))
            d.text((x1 + 5, ty + 2), lab, fill=col, font=f)
    if title:
        f = font(19)
        tw = d.textlength(title, font=f)
        d.rectangle([0, im.height - 30, tw + 16, im.height], fill=(11, 18, 32))
        d.text((8, im.height - 27), title, fill=(255, 255, 255), font=f)
    im.save(out)
    return out


def gt_box(stem):
    vals = [float(v) for v in (DS / f"{stem}.txt").read_text().split()[1:5]]
    cx, cy, w, h = [v * 640 for v in vals]
    return [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]


def fig_dataset_sample():
    g = gt_box("test_6")
    draw_boxes(DS / "test_6.jpeg", [(*g, (167, 139, 250), "dataset label: streak", True)],
               FIG / "m2_dataset_sample.png", "StreaksYoloDataset test/6.jpeg (640x640) - real frame, CC BY 4.0")
    print("figure: m2_dataset_sample.png")


def fig_detection_pair():
    stem = "test_6"
    res = load(EV / f"onnx_{stem}.json")
    det = res["detections"][0]
    g = gt_box(stem)
    a = draw_boxes(DS / f"{stem}.jpeg", [(*g, (167, 139, 250), "ground-truth label", True)], FIG / "_in.png", "INPUT: real telescope frame")
    b = draw_boxes(DS / f"{stem}.jpeg", [(*det["bbox"], (245, 158, 11), f"streak {det['confidence']:.3f}", False)], FIG / "_out.png", "OUTPUT: deployed YOLOv8n (ONNX)")
    ia, ib = Image.open(a), Image.open(b)
    canvas = Image.new("RGB", (ia.width + ib.width + 24, ia.height), "white")
    canvas.paste(ia, (0, 0)); canvas.paste(ib, (ia.width + 24, 0))
    canvas.save(FIG / "m3_detection_pair.png")
    for p in (a, b):
        Path(p).unlink()
    print("figure: m3_detection_pair.png  (conf %.3f)" % det["confidence"])


def fig_detection_miss():
    stem = "test_60"
    g = gt_box(stem)
    draw_boxes(DS / f"{stem}.jpeg", [(*g, (185, 28, 28), "label: streak - NOT detected at conf >= 0.25", True)],
               FIG / "m3_detection_miss.png", "FAILURE CASE: test/60.jpeg - thin near-horizontal streak missed")
    print("figure: m3_detection_miss.png")


# ---------------------------------------------------------------- M3: training pipeline / curves
def fig_training_workflow():
    fig, ax = plt.subplots(figsize=(11.2, 3.5))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    row1 = [("prepare_dataset.py", ["splits + manifest", "seed 42"], CYAN),
            ("train.py", ["YOLOv8n from COCO", "20 ep · 512 px · batch 8"], CYAN),
            ("validation split", ["49 images", "model selection (best.pt)"], AMBER),
            ("evaluate.py", ["TEST split, 52 images", "P / R / F1 / mAP + sizes"], GREEN)]
    w, gap = 0.215, 0.045
    for i, (t, l, c) in enumerate(row1):
        x = 0.02 + i * (w + gap)
        box(ax, x, 0.55, w, 0.34, t, l, ec=c, fs=8.6)
        if i < 3:
            arrow(ax, (x + w + 0.004, 0.72), (x + w + gap - 0.004, 0.72))
    box(ax, 0.235, 0.09, 0.24, 0.3, "export_onnx.py", ["best.pt → model.onnx (12.2 MB)", "+ model.json provenance"], ec=GREEN, fs=8.6)
    box(ax, 0.525, 0.09, 0.24, 0.3, "Next.js API", ["onnxruntime-node (CPU)", "/api/detect engine=onnx"], ec=GREEN, fs=8.6)
    arrow(ax, (0.87, 0.55), (0.47, 0.4), rad=0.25)
    arrow(ax, (0.475, 0.24), (0.523, 0.24))
    ax.text(0.5, 0.965, "Milestone 3 workflow: reproducible training, honest evaluation, deployed inference", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.13, 0.24, "experiment record\nml/experiments/*.json\n(config, seed, curves,\nmetrics, environment)", ha="center", va="center", fontsize=7.6, color=SLATE)
    save(fig, "m3_training_workflow.png")


def fig_training_curves():
    rec = load(ROOT / "ml/experiments/baseline-streaks-20ep.json")
    c = rec["training"]["curves"]
    ep = [r["epoch"] + 1 for r in c]
    fig, axes = plt.subplots(1, 3, figsize=(11.4, 3.4))
    ax = axes[0]
    ax.plot(ep, [r["train_box_loss"] for r in c], "-o", ms=3, color=CYAN, label="train box loss")
    ax.plot(ep, [r["val_box_loss"] for r in c], "--s", ms=3, color=AMBER, label="val box loss")
    ax.set_title("Box regression loss"); ax.set_xlabel("epoch"); ax.legend(fontsize=7.5)
    ax = axes[1]
    ax.plot(ep, [r["train_cls_loss"] for r in c], "-o", ms=3, color=CYAN, label="train cls loss")
    ax.plot(ep, [r["val_cls_loss"] for r in c], "--s", ms=3, color=AMBER, label="val cls loss")
    ax.set_title("Classification loss"); ax.set_xlabel("epoch"); ax.legend(fontsize=7.5)
    ax = axes[2]
    ax.plot(ep, [r["precision"] for r in c], "-o", ms=3, color=CYAN, label="precision")
    ax.plot(ep, [r["recall"] for r in c], "-s", ms=3, color=GREEN, label="recall")
    ax.plot(ep, [r["map50"] for r in c], "-^", ms=3, color=AMBER, label="mAP@0.5")
    ax.plot(ep, [r["map50_95"] for r in c], "-v", ms=3, color="#7C3AED", label="mAP@0.5:0.95")
    ax.set_title("Validation metrics"); ax.set_xlabel("epoch"); ax.set_ylim(0, 1); ax.legend(fontsize=7.2, ncol=2)
    fig.suptitle("Measured training curves — run baseline-streaks-20ep (values read from results.csv via the experiment record)", fontsize=10.5, fontweight="bold", y=1.05)
    save(fig, "m3_training_curves.png")


def fig_model_comparison():
    names = ["baseline-streaks-4ep", "baseline-streaks-20ep", "improved-p2-streaks-20ep"]
    labels = ["Baseline\n4 epochs", "Baseline\n20 epochs (deployed)", "P2 variant\n20 epochs"]
    recs = [load(ROOT / f"ml/experiments/{n}.json") for n in names]
    metrics = ["precision", "recall", "f1", "map50", "map50_95"]
    x = np.arange(len(metrics)); w = 0.26
    fig, ax = plt.subplots(figsize=(9.6, 3.6))
    for i, (r, lab, col) in enumerate(zip(recs, labels, ["#94A3B8", CYAN, AMBER])):
        vals = [r["evaluation"].get(m, 0) or 0 for m in metrics]
        ax.bar(x + (i - 1) * w, vals, w, label=lab, color=col)
        for xi, v in zip(x + (i - 1) * w, vals):
            ax.text(xi, v + 0.015, f"{v:.3f}", ha="center", fontsize=6.8, rotation=90)
    ax.set_xticks(x); ax.set_xticklabels(["Precision", "Recall", "F1", "mAP@0.5", "mAP@0.5:0.95"])
    ax.set_ylim(0, 1.12); ax.set_ylabel("score on held-out TEST split (52 images)")
    ax.set_title("Held-out test comparison — the P2 'improvement' did NOT beat the baseline (negative result kept)")
    ax.legend(fontsize=8, ncol=3, loc="lower center")
    save(fig, "m3_model_comparison.png")


def fig_failure_analysis():
    fig, axes = plt.subplots(1, 2, figsize=(11.2, 3.3))
    ax = axes[0]
    names = ["baseline-streaks-20ep", "improved-p2-streaks-20ep"]
    bins = ["small(<16px)", "medium(16-48px)", "large(>48px)"]
    x = np.arange(len(bins)); w = 0.34
    for i, (n, col, lab) in enumerate(zip(names, [CYAN, AMBER], ["Baseline 20 ep", "P2 20 ep"])):
        fa = load(ROOT / f"ml/experiments/{n}.json")["evaluation"]["failure_analysis"]["recall_by_gt_size"]
        vals = [fa[b]["recall"] if fa[b]["recall"] is not None else 0 for b in bins]
        ns = [fa[b]["total"] for b in bins]
        ax.bar(x + (i - 0.5) * w, vals, w, color=col, label=lab)
        for xi, v, nn in zip(x + (i - 0.5) * w, vals, ns):
            ax.text(xi, 0.03 if nn == 0 else v + 0.02, "no objects\nin bin" if nn == 0 else f"{v:.2f}\n(n={nn})", ha="center", fontsize=6.8)
    ax.set_xticks(x); ax.set_xticklabels(["small < 16 px", "medium 16–48 px", "large > 48 px"], fontsize=8)
    ax.set_ylim(0, 1.15); ax.set_ylabel("recall (IoU ≥ 0.5, conf ≥ 0.25)")
    ax.set_title("Failure analysis by object size (TEST split)"); ax.legend(fontsize=8)

    ax = axes[1]
    b = load(EV / "benchmark.json")
    snr = b["results"][0]["metrics"]["recallBySnr"]
    labels = [s["bin"].split(" (")[0] for s in snr]
    x = np.arange(len(labels)); w = 0.34
    for i, r in enumerate(b["results"]):
        vals = [s["recall"] for s in r["metrics"]["recallBySnr"]]
        ax.bar(x + (i - 0.5) * w, vals, w, color=["#94A3B8", CYAN][i],
               label="global threshold (baseline)" if i == 0 else "local bg + matched filter")
    ax.set_xticks(x); ax.set_xticklabels(labels, fontsize=8); ax.set_ylim(0, 1.12)
    ax.set_ylabel("recall"); ax.set_title("Classical detector on SYNTHETIC frames by SNR")
    ax.legend(fontsize=7.6)
    fig.suptitle("Where the detectors fail: measured recall breakdowns (left: real test data · right: synthetic benchmark)", fontsize=10.5, fontweight="bold", y=1.05)
    save(fig, "m3_failure_analysis.png")


def fig_classical_pipeline():
    fig, ax = plt.subplots(figsize=(11.2, 2.5))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    stages = [("Background", ["32 px grid medians", "bilinear interpolation"]),
              ("Noise σ", ["median absolute", "deviation × 1.4826"]),
              ("Matched filter", ["Gaussian, σ = PSF", "boosts faint sources"]),
              ("Threshold", ["k·σ (default 4)", "8-connected pixels"]),
              ("Filtering", ["min area 3 px rejects", "hot pixels / cosmic rays"]),
              ("Measurement", ["centroid, flux, SNR", "2nd moments → shape"])]
    w, gap = 0.145, 0.026
    for i, (t, l) in enumerate(stages):
        x = 0.012 + i * (w + gap)
        box(ax, x, 0.24, w, 0.55, t, l, ec=CYAN if i < 5 else GREEN, fs=8.2)
        if i < 5:
            arrow(ax, (x + w + 0.002, 0.515), (x + w + gap - 0.002, 0.515))
    ax.text(0.5, 0.93, "Classical source extractor (transparent baseline, no training required)", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.5, 0.1, "Output class: elongation ≥ 2.2 → 'streak', otherwise 'point_source'.  Confidence = 1 − exp(−(SNR − kσ)/2kσ): a ranking heuristic, not a probability.", ha="center", fontsize=7.6, color=SLATE)
    save(fig, "m3_classical_pipeline.png")


# ---------------------------------------------------------------- M4: tracking + orbits
def fig_kalman_diagram():
    fig, ax = plt.subplots(figsize=(10.6, 4.2))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    box(ax, 0.03, 0.62, 0.2, 0.28, "PREDICT", ["x = [x, y, vx, vy]", "constant-velocity F", "P = FPFᵀ + Q"], fs=8.4)
    box(ax, 0.29, 0.62, 0.2, 0.28, "GATE", ["distance ≤ 18 px", "between prediction", "and detection"], ec=AMBER, fs=8.4)
    box(ax, 0.55, 0.62, 0.2, 0.28, "ASSOCIATE", ["greedy nearest-first", "one-to-one assignment", "(SORT-like)"], ec=AMBER, fs=8.4)
    box(ax, 0.81, 0.62, 0.16, 0.28, "UPDATE", ["Kalman gain K", "x ← x + K·y", "hits += 1"], ec=GREEN, fs=8.4)
    for a, b in [(0.23, 0.29), (0.49, 0.55), (0.75, 0.81)]:
        arrow(ax, (a + 0.002, 0.76), (b - 0.002, 0.76))
    box(ax, 0.29, 0.16, 0.2, 0.28, "COAST", ["no match: keep prediction", "misses += 1", "max 3 frames"], ec=SLATE, fs=8.4)
    box(ax, 0.55, 0.16, 0.2, 0.28, "TERMINATE", ["misses > maxMisses", "drop trailing predictions", "track ends"], ec=RED, fs=8.4)
    box(ax, 0.81, 0.16, 0.16, 0.28, "SPAWN", ["unmatched detection", "starts new track", "confirm at 3 hits"], ec=CYAN, fs=8.4)
    arrow(ax, (0.65, 0.62), (0.39, 0.44), rad=0.2, color=SLATE)
    arrow(ax, (0.49, 0.3), (0.55, 0.3), color=RED)
    arrow(ax, (0.89, 0.62), (0.89, 0.44), color=CYAN)
    arrow(ax, (0.03, 0.76), (0.03, 0.3), color=CYAN, rad=0.0)
    ax.text(0.14, 0.09, "next frame", fontsize=8, color=CYAN, ha="center")
    arrow(ax, (0.03, 0.3), (0.13, 0.62), color=CYAN, rad=-0.3)
    ax.text(0.5, 0.965, "Four-state Kalman tracker with gated association (image coordinates only)", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.14, 0.5, "speed < 0.6 px/frame → stationary (star)\notherwise → moving candidate RSO", ha="center", fontsize=7.4, color=SLATE)
    save(fig, "m4_kalman_diagram.png")


def fig_tracking_trajectories():
    t = load(EV / "track_synthetic.json")
    W, H = t["image"]["width"], t["image"]["height"]
    fig, axes = plt.subplots(1, 2, figsize=(11.2, 4.6))
    ax = axes[0]
    ax.set_facecolor("#0B1220")
    for tr in t["tracks"]:
        if not tr["confirmed"]:
            continue
        pts = tr["points"]
        xs, ys = [p["x"] for p in pts], [p["y"] for p in pts]
        if tr["kind"] == "moving":
            ax.plot(xs, ys, "-", lw=1.8, color="#22D3EE", zorder=3)
            for p in pts:
                ax.scatter(p["x"], p["y"], s=26, facecolor="#22D3EE" if p["measured"] else "none",
                           edgecolor="#22D3EE", linewidths=1.2, zorder=4)
            ax.text(xs[-1] + 5, ys[-1], f"ID {tr['id']}", color="#22D3EE", fontsize=8, fontweight="bold")
        else:
            ax.plot(xs, ys, "-", lw=0.6, color="#64748B", alpha=0.65, zorder=2)
    for tt in t["truthTracks"]:
        xs = [p["x"] for p in tt["points"] if p["visible"]]; ys = [p["y"] for p in tt["points"] if p["visible"]]
        ax.plot(xs, ys, ":", lw=1.4, color="#A78BFA", zorder=5)
    ax.set_xlim(0, W); ax.set_ylim(H, 0); ax.set_aspect("equal")
    ax.set_title("Confirmed tracks over 8 frames", color=NAVY)
    ax.set_xlabel("x (pixels)"); ax.set_ylabel("y (pixels)")
    ax.text(0.02, 0.02, "cyan = moving tracks (filled = measured, hollow = coasted)\ngrey = stationary stars · purple dotted = synthetic truth",
            transform=ax.transAxes, fontsize=7, color="white", va="bottom")

    ax = axes[1]
    moving = [tr for tr in t["tracks"] if tr["kind"] == "moving"]
    frames = list(range(t["image"]["frames"]))
    for tr, col in zip(moving, [CYAN, AMBER]):
        measured = {p["frame"]: p for p in tr["points"]}
        ax.plot(frames, [measured[f]["x"] if f in measured else np.nan for f in frames], "-o", ms=4, color=col, label=f"track {tr['id']} x(t)")
        ax.plot(frames, [measured[f]["y"] if f in measured else np.nan for f in frames], "--s", ms=3, color=col, alpha=0.6, label=f"track {tr['id']} y(t)")
    ax.set_xlabel("frame index"); ax.set_ylabel("image coordinate (pixels)")
    ax.set_title("Linear motion in the image plane"); ax.legend(fontsize=7, ncol=2)
    s = t["summary"]; r = t["recovery"]
    fig.suptitle(f"SYNTHETIC tracking test (labelled demonstration data): {s['frames']} frames · {s['detectionsTotal']} detections · "
                 f"{s['confirmed']} confirmed tracks ({s['moving']} moving, {s['stationary']} stationary) · truth coverage {r['coverage']*100:.0f}%",
                 fontsize=10, fontweight="bold", y=1.03)
    save(fig, "m4_tracking_trajectories.png")


def fig_iss_propagation():
    p = load(EV / "prop_iss.json")
    s = p["samples"]
    t = [x["minutesFromStart"] for x in s]
    fig, axes = plt.subplots(1, 3, figsize=(11.4, 3.3))
    axes[0].plot(t, [x["altitudeKm"] for x in s], color=CYAN, lw=1.8)
    axes[0].set_title("Altitude above ellipsoid"); axes[0].set_xlabel("minutes from start"); axes[0].set_ylabel("km")
    axes[1].plot(t, [x["speedKmS"] for x in s], color=AMBER, lw=1.8)
    axes[1].set_title("Inertial speed (TEME)"); axes[1].set_xlabel("minutes from start"); axes[1].set_ylabel("km/s")
    axes[2].scatter([x["longitudeDeg"] for x in s], [x["latitudeDeg"] for x in s], s=8, color=GREEN)
    axes[2].set_xlim(-180, 180); axes[2].set_ylim(-90, 90)
    axes[2].set_title("Ground track (sub-satellite point)"); axes[2].set_xlabel("longitude (°)"); axes[2].set_ylabel("latitude (°)")
    fig.suptitle(f"Measured SGP4 propagation — ISS (NORAD 25544), {len(s)} samples, start {p['params']['start']}, "
                 f"altitude {s[0]['altitudeKm']:.1f} km, speed {s[0]['speedKmS']:.3f} km/s", fontsize=10, fontweight="bold", y=1.05)
    save(fig, "m4_iss_propagation.png")


def fig_closest_approach_3d():
    a, b = load(EV / "prop_objA.json"), load(EV / "prop_objB.json")
    c = load(EV / "conjunction.json")
    fig = plt.figure(figsize=(10.8, 4.6))
    ax = fig.add_subplot(1, 2, 1, projection="3d")
    for spine in ax.spines.values():
        spine.set_visible(False)
    u, v = np.mgrid[0:2 * np.pi:24j, 0:np.pi:12j]
    R = 6378.137
    ax.plot_surface(R * np.cos(u) * np.sin(v), R * np.sin(u) * np.sin(v), R * np.cos(v), color="#1D4ED8", alpha=0.25, linewidth=0)
    for data, col, lab in [(a, CYAN, f"A: {c['a']['name']} ({c['a']['noradId']})"), (b, AMBER, f"B: {c['b']['name']} ({c['b']['noradId']})")]:
        xs = [s["position"]["x"] for s in data["samples"]]; ys = [s["position"]["y"] for s in data["samples"]]; zs = [s["position"]["z"] for s in data["samples"]]
        ax.plot(xs, ys, zs, color=col, lw=1.5, label=lab)
    ca, cb = c["closest"]["stateA"]["position"], c["closest"]["stateB"]["position"]
    ax.plot([ca["x"], cb["x"]], [ca["y"], cb["y"]], [ca["z"], cb["z"]], color=RED, lw=2, ls="--")
    ax.scatter([ca["x"]], [ca["y"]], [ca["z"]], color=CYAN, s=45, marker="o")
    ax.scatter([cb["x"]], [cb["y"]], [cb["z"]], color=AMBER, s=45, marker="^")
    ax.set_xlabel("TEME x (km)", fontsize=7); ax.set_ylabel("TEME y (km)", fontsize=7); ax.set_zlabel("TEME z (km)", fontsize=7)
    ax.tick_params(labelsize=6); ax.grid(False)
    ax.set_title("Propagated paths (95 min window)", fontsize=9.5)
    ax.legend(fontsize=7, loc="upper left")

    ax2 = fig.add_subplot(1, 2, 2)
    ser = c["series"]
    hrs = [s["minutesFromStart"] / 60 for s in ser]
    ax2.semilogy(hrs, [s["separationKm"] for s in ser], color=CYAN, lw=1.3)
    tca_h = (np.datetime64(c["closest"]["tca"].replace("Z", "")) - np.datetime64(c["window"]["start"].replace("Z", ""))) / np.timedelta64(1, "h")
    ax2.axhline(c["screening"]["thresholdKm"], color=AMBER, ls="--", lw=1.2, label=f"report threshold {c['screening']['thresholdKm']} km")
    ax2.scatter([tca_h], [c["closest"]["missDistanceKm"]], color=RED, zorder=5, s=45,
                label=f"minimum {c['closest']['missDistanceKm']:,.1f} km")
    ax2.set_xlabel("hours from window start"); ax2.set_ylabel("separation (km, log scale)")
    ax2.set_title("Separation over the 24 h screening window"); ax2.legend(fontsize=7.5)
    fig.suptitle(f"Measured close-approach screening (SGP4, TEME): TCA {c['closest']['tca']} · miss {c['closest']['missDistanceKm']:,.3f} km · "
                 f"relative speed {c['closest']['relativeSpeedKmS']} km/s\nPreliminary screening only — no collision probability is computed (no covariance in TLEs)",
                 fontsize=9.5, fontweight="bold", y=1.04)
    save(fig, "m4_closest_approach.png")


# ---------------------------------------------------------------- M5: architecture + roadmap
def fig_architecture():
    fig, ax = plt.subplots(figsize=(11.2, 5.6))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    # Row heights are sized so every text line stays inside its box.
    box(ax, 0.03, 0.79, 0.94, 0.16,
        "BROWSER — React 19.2.6 · TypeScript 5.9.3 · Tailwind CSS 4.1.17 · Recharts 3.10.1",
        ["10 pages: Mission · Detection Lab · Dataset & Model · Tracking · Orbital Analysis · Close Approach · Reports · Tutorial · How It's Built · Learning Centre"],
        fc="#ECFEFF", fs=9)
    box(ax, 0.03, 0.56, 0.94, 0.18,
        "NEXT.JS 16.2.6 APP ROUTER — 12 JSON API routes (the REST backend)",
        ["/api/detect · /api/track · /api/evaluate · /api/orbital/catalog · /api/orbital/propagate · /api/conjunction",
         "/api/samples/[id] · /api/experiments · /api/model · /api/reports · /api/reports/[id] · /api/health"],
        fc="#F0FDFA", fs=9)
    arrow(ax, (0.5, 0.79), (0.5, 0.745))
    ax.text(0.515, 0.752, "fetch / multipart upload", fontsize=7.5, color=SLATE)

    cols = [0.03, 0.36, 0.69]
    w = 0.28
    mid = [("VISION LIBRARY", ["detector.ts · synthetic.ts", "evaluate.ts · tracker.ts", "image.ts (pngjs / jpeg-js)"], CYAN),
           ("PERSISTENCE & REPORTS", ["runs.ts → Drizzle ORM 0.45.2", "PostgreSQL 'runs' table", "JSON / CSV / Markdown export"], GREEN),
           ("ORBITAL LIBRARY", ["tle.ts (validation) · catalog.ts", "propagate.ts · conjunction.ts", "satellite.js 7.1.0 (SGP4/SDP4)"], CYAN)]
    low = [("ONNX RUNTIME (CPU)", ["onnxruntime-node 1.30.0", "ml/weights/model.onnx 12.2 MB", "+ model.json provenance"], AMBER),
           ("PYTHON ML PIPELINE (offline)", ["Ultralytics 8.3.253 · PyTorch 2.14.1", "prepare → train → evaluate → export", "writes ml/experiments/*.json"], "#7C3AED"),
           ("CELESTRAK GP API", ["live TLE / OMM (2 h cache)", "bundled snapshot: 16 element sets", "fetched 2026-10-21"], AMBER)]
    for x, (t, l, c) in zip(cols, mid):
        box(ax, x, 0.32, w, 0.20, t, l, ec=c, fs=8.4)
        arrow(ax, (x + w / 2, 0.56), (x + w / 2, 0.525))
    for x, (t, l, c) in zip(cols, low):
        box(ax, x, 0.04, w, 0.22, t, l, ec=c, fs=8.4)
    arrow(ax, (cols[0] + w / 2, 0.32), (cols[0] + w / 2, 0.265), color=AMBER)   # vision -> onnx
    arrow(ax, (cols[2] + w / 2, 0.32), (cols[2] + w / 2, 0.265), color=AMBER)   # orbital -> celestrak
    # offline artefacts: short dotted hops that never cross another box
    arrow(ax, (cols[1], 0.15), (cols[0] + w, 0.15), color="#7C3AED", ls=":")
    arrow(ax, (cols[1] + w / 2, 0.26), (cols[1] + w / 2, 0.32), color="#7C3AED", ls=":")
    ax.text(0.5, 0.975, "ORBITAL GUARD — deployed system architecture (single Node.js application + offline Python training)",
            ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.5, 0.005, "Solid arrows: request-time data flow · dotted arrows: offline artefacts (ONNX model, experiment records)",
            ha="center", fontsize=7.4, color=SLATE)
    save(fig, "m5_architecture.png")


def fig_roadmap():
    fig, ax = plt.subplots(figsize=(11.2, 3.6))
    ax.grid(False); ax.set_xlim(0, 1); ax.set_ylim(0, 1); ax.axis("off")
    cols = [("NOW — delivered", ["Classical + YOLOv8n detection", "Kalman image-plane tracking", "SGP4 propagation + screening", "Reports, tests, documentation"], GREEN),
            ("NEXT — data & model", ["Full 1,642-image training set", "Negative frames in training", "Multi-seed variance study", "DUSTstreaks / SpaceDet transfer"], CYAN),
            ("THEN — astrometry", ["Plate solving (pixel → RA/Dec)", "Exposure timing + observer site", "Initial orbit determination", "Catalogue correlation of tracks"], AMBER),
            ("LATER — risk & ops", ["Covariance / CDM ingestion", "Validated Pc (Alfano / Chan)", "Encounter-plane analysis", "Multi-user study platform"], "#7C3AED")]
    w, gap = 0.225, 0.033
    for i, (t, lines, col) in enumerate(cols):
        x = 0.015 + i * (w + gap)
        box(ax, x, 0.2, w, 0.62, t, lines, ec=col, fc="#F8FAFC", fs=8.6)
        if i < 3:
            arrow(ax, (x + w + 0.003, 0.51), (x + w + gap - 0.003, 0.51), color=SLATE)
    ax.text(0.5, 0.93, "Future development roadmap (each stage unlocks the next)", ha="center", fontsize=10.5, fontweight="bold")
    ax.text(0.5, 0.09, "Collision probability appears only in the last stage: it requires covariance data and a validated method, neither of which public TLEs provide.", ha="center", fontsize=7.8, color=RED)
    save(fig, "m5_roadmap.png")


def crop_screens():
    """Trim very tall element screenshots to the informative region for print."""
    crops = {"02b_detection_results.png": 1500, "03b_tracking_results.png": 1750, "04b_orbital_results.png": 1800, "06_dataset_experiments.png": 1608}
    src = ROOT / "docs/assets/screens"
    for name, h in crops.items():
        p = src / name
        if not p.exists():
            continue
        im = Image.open(p)
        if im.height > h:
            im.crop((0, 0, im.width, h)).save(src / name.replace(".png", "_crop.png"))
            print("cropped:", name, "->", h)


if __name__ == "__main__":
    fig_debris_problem()
    fig_research_workflow()
    fig_dataset_distribution()
    fig_dataset_sample()
    fig_detection_pair()
    fig_detection_miss()
    fig_training_workflow()
    fig_training_curves()
    fig_model_comparison()
    fig_failure_analysis()
    fig_classical_pipeline()
    fig_kalman_diagram()
    fig_tracking_trajectories()
    fig_iss_propagation()
    fig_closest_approach_3d()
    fig_architecture()
    fig_roadmap()
    crop_screens()
    print("ALL FIGURES DONE")
