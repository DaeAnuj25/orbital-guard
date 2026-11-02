"""Generate a clearly-labelled SYNTHETIC telescope-frame dataset in YOLO format.

Why this exists
---------------
Real labelled debris imagery is scarce. This generator produces frames that
mimic a sidereally-tracked optical exposure: a noisy background with a mild
gradient, static stars (Gaussian point-spread functions), elongated streaks
left by moving objects, and single hot pixels. It lets you smoke-test the full
training pipeline *before* downloading a real dataset.

What it does NOT do
-------------------
It does not validate real-world debris detection. Synthetic PSFs, noise and
streak statistics are simplified; metrics obtained on this data only show
that the pipeline works end to end. The web dashboard labels every result from
this data as "synthetic".

Classes (YOLO ids): 0 = point_source, 1 = streak

Usage
-----
    python ml/scripts/generate_synthetic.py --out ml/data/synthetic \
        --n-train 400 --n-val 100 --n-test 100 --size 640 --seed 42
"""
from __future__ import annotations

import argparse
import math
from pathlib import Path

import numpy as np

from common import file_list_digest, utc_now_iso, write_json

CLASSES = ["point_source", "streak"]


def add_gaussian(img: np.ndarray, cx: float, cy: float, amp: float, sigma: float) -> None:
    """Add a 2-D Gaussian PSF in-place (only inside a 4-sigma window for speed)."""
    h, w = img.shape
    r = int(math.ceil(4 * sigma))
    x0, x1 = max(0, int(cx) - r), min(w, int(cx) + r + 1)
    y0, y1 = max(0, int(cy) - r), min(h, int(cy) + r + 1)
    if x0 >= x1 or y0 >= y1:
        return
    ys, xs = np.mgrid[y0:y1, x0:x1]
    img[y0:y1, x0:x1] += amp * np.exp(-((xs - cx) ** 2 + (ys - cy) ** 2) / (2 * sigma**2))


def add_streak(img: np.ndarray, x0: float, y0: float, x1: float, y1: float, amp: float, sigma: float) -> None:
    """Add a streak: Gaussian cross-section around the segment (x0,y0)-(x1,y1)."""
    h, w = img.shape
    r = int(math.ceil(4 * sigma))
    bx0, bx1 = max(0, int(min(x0, x1)) - r), min(w, int(max(x0, x1)) + r + 1)
    by0, by1 = max(0, int(min(y0, y1)) - r), min(h, int(max(y0, y1)) + r + 1)
    if bx0 >= bx1 or by0 >= by1:
        return
    ys, xs = np.mgrid[by0:by1, bx0:bx1]
    dx, dy = x1 - x0, y1 - y0
    seg_len2 = dx * dx + dy * dy
    t = np.clip(((xs - x0) * dx + (ys - y0) * dy) / max(seg_len2, 1e-9), 0, 1)
    px, py = x0 + t * dx, y0 + t * dy
    d2 = (xs - px) ** 2 + (ys - py) ** 2
    img[by0:by1, bx0:bx1] += amp * np.exp(-d2 / (2 * sigma**2))


def render_frame(rng: np.random.Generator, size: int) -> tuple[np.ndarray, list[tuple[int, float, float, float, float]]]:
    """Return (uint8 image, YOLO labels as (cls, cx, cy, w, h) normalised)."""
    background = rng.uniform(20, 60)
    noise_sigma = rng.uniform(2.5, 7.0)
    img = np.full((size, size), background, dtype=np.float32)
    # Mild sky gradient (vignetting / light pollution)
    gy, gx = np.mgrid[0:size, 0:size] / size
    img += rng.uniform(-10, 10) * gx + rng.uniform(-10, 10) * gy

    labels: list[tuple[int, float, float, float, float]] = []
    n_stars = int(rng.integers(15, 60))
    for _ in range(n_stars):
        cx, cy = rng.uniform(2, size - 2, size=2)
        sigma = rng.uniform(0.9, 1.8)
        # Log-uniform amplitude: many faint, few bright (realistic magnitude distribution)
        amp = float(np.exp(rng.uniform(np.log(3 * noise_sigma), np.log(60 * noise_sigma))))
        add_gaussian(img, cx, cy, amp, sigma)
        half = 3 * sigma
        labels.append((0, cx / size, cy / size, 2 * half / size, 2 * half / size))

    n_streaks = int(rng.integers(0, 4))
    for _ in range(n_streaks):
        cx, cy = rng.uniform(size * 0.1, size * 0.9, size=2)
        length = rng.uniform(12, size * 0.35)
        angle = rng.uniform(0, math.pi)
        sigma = rng.uniform(0.9, 1.6)
        amp = float(np.exp(rng.uniform(np.log(2.5 * noise_sigma), np.log(20 * noise_sigma))))
        x0, y0 = cx - math.cos(angle) * length / 2, cy - math.sin(angle) * length / 2
        x1, y1 = cx + math.cos(angle) * length / 2, cy + math.sin(angle) * length / 2
        add_streak(img, x0, y0, x1, y1, amp, sigma)
        pad = 3 * sigma
        bx0, bx1 = max(0, min(x0, x1) - pad), min(size, max(x0, x1) + pad)
        by0, by1 = max(0, min(y0, y1) - pad), min(size, max(y0, y1) + pad)
        labels.append((1, (bx0 + bx1) / 2 / size, (by0 + by1) / 2 / size, (bx1 - bx0) / size, (by1 - by0) / size))

    # Hot pixels / cosmic-ray hits: single-pixel spikes that are NOT labelled
    # (a good detector must reject them).
    for _ in range(int(rng.integers(0, 12))):
        img[rng.integers(0, size), rng.integers(0, size)] += rng.uniform(80, 200)

    # Shot noise (grows with signal) + read noise
    img += rng.normal(0, 1, img.shape) * np.sqrt(np.clip(img, 1, None)) * 0.4
    img += rng.normal(0, noise_sigma, img.shape)
    return np.clip(img, 0, 255).astype(np.uint8), labels


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--n-train", type=int, default=400)
    ap.add_argument("--n-val", type=int, default=100)
    ap.add_argument("--n-test", type=int, default=100)
    ap.add_argument("--size", type=int, default=640)
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    try:
        import cv2
    except ImportError as exc:  # pragma: no cover
        raise SystemExit("opencv-python-headless is required: pip install -r ml/requirements.txt") from exc

    rng = np.random.default_rng(args.seed)
    counts = {"train": args.n_train, "val": args.n_val, "test": args.n_test}
    split_files: dict[str, list[Path]] = {}
    class_hist = {name: 0 for name in CLASSES}
    for split, n in counts.items():
        img_dir, lbl_dir = args.out / "images" / split, args.out / "labels" / split
        img_dir.mkdir(parents=True, exist_ok=True)
        lbl_dir.mkdir(parents=True, exist_ok=True)
        files = []
        for i in range(n):
            img, labels = render_frame(rng, args.size)
            stem = f"synthetic_{split}_{i:05d}"
            cv2.imwrite(str(img_dir / f"{stem}.png"), img)
            with open(lbl_dir / f"{stem}.txt", "w", encoding="utf-8") as f:
                for cls, cx, cy, w, h in labels:
                    f.write(f"{cls} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n")
                    class_hist[CLASSES[cls]] += 1
            files.append(img_dir / f"{stem}.png")
        split_files[split] = files
        print(f"{split}: {n} images -> {img_dir}")

    data_yaml = args.out / "data.yaml"
    data_yaml.write_text(
        "\n".join(
            [
                f"path: {args.out.resolve()}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                f"nc: {len(CLASSES)}",
                f"names: {CLASSES}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    write_json(
        args.out / "dataset_manifest.json",
        {
            "name": "ORBITAL GUARD synthetic telescope frames",
            "data_origin": "synthetic",
            "generated_at": utc_now_iso(),
            "generator": "ml/scripts/generate_synthetic.py",
            "seed": args.seed,
            "image_size": args.size,
            "classes": CLASSES,
            "counts": counts,
            "class_histogram": class_hist,
            "split_digests": {k: file_list_digest(v) for k, v in split_files.items()},
            "licence": "Generated locally; no third-party data. Use freely.",
            "limitations": [
                "Simplified PSF / noise model; no real sensor artefacts, clouds or tracking errors.",
                "Does not validate real-world debris detection - pipeline smoke test only.",
            ],
        },
    )
    print(f"Wrote {data_yaml}")


if __name__ == "__main__":
    main()
