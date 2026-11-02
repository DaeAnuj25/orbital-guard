"""Prepare a YOLO-format detection dataset with reproducible train/val/test splits.

Works for:
  * StreaksYoloDataset (Parisot, LIST; CC BY 4.0; Zenodo 10.5281/zenodo.14047943)
  * any folder tree of images + YOLO ``.txt`` label files with the same stem
  * datasets that already ship ``images/<split>`` + ``labels/<split>`` folders
    (use ``--keep-splits`` to respect them)

The script never modifies the source. It copies (or symlinks with ``--link``)
files into ``<out>/images/{train,val,test}`` and ``<out>/labels/...``, writes
``data.yaml`` for Ultralytics and a ``dataset_manifest.json`` that records the
split seed, counts, class histogram and a digest of each split so experiments
can state exactly which data they used.

Usage
-----
    # Real data (after downloading + unzipping StreaksYoloDataset.zip):
    python ml/scripts/prepare_dataset.py --source /path/to/StreaksYoloDataset \
        --out ml/data/streaks --classes streak --name StreaksYoloDataset \
        --origin real --licence "CC BY 4.0" --split 0.7 0.15 0.15 --seed 42

    # Quick CPU experiment on a subset:
    ... --limit 300
"""
from __future__ import annotations

import argparse
import os
import random
import shutil
from collections import Counter
from pathlib import Path

from common import IMAGE_EXTENSIONS, file_list_digest, utc_now_iso, write_json

SPLITS = ("train", "val", "test")


def find_pairs(source: Path) -> list[tuple[Path, Path | None]]:
    """Return (image, label-or-None) pairs. Labels are matched by file stem.

    Search order for a label: same folder, a sibling ``labels`` folder
    mirroring ``images``, then any ``*.txt`` with the same stem below source.
    """
    images = sorted(p for p in source.rglob("*") if p.suffix.lower() in IMAGE_EXTENSIONS and p.is_file())
    txt_index: dict[str, list[Path]] = {}
    for p in source.rglob("*.txt"):
        if p.name.lower() in {"classes.txt", "readme.txt", "license.txt", "licence.txt"}:
            continue
        txt_index.setdefault(p.stem, []).append(p)

    pairs: list[tuple[Path, Path | None]] = []
    for img in images:
        candidates = [img.with_suffix(".txt")]
        parts = list(img.parts)
        if "images" in parts:
            idx = len(parts) - 1 - parts[::-1].index("images")
            mirrored = Path(*parts[:idx], "labels", *parts[idx + 1 :]).with_suffix(".txt")
            candidates.append(mirrored)
        label = next((c for c in candidates if c.exists()), None)
        if label is None and img.stem in txt_index:
            label = txt_index[img.stem][0]
        pairs.append((img, label))
    return pairs


def split_of(img: Path) -> str | None:
    for part in img.parts:
        low = part.lower()
        if low in SPLITS:
            return low
        if low in {"valid", "validation"}:
            return "val"
    return None


def read_label(label: Path | None) -> list[tuple[int, float, float, float, float]]:
    if label is None or not label.exists():
        return []
    rows = []
    for line in label.read_text(encoding="utf-8", errors="ignore").splitlines():
        parts = line.split()
        if len(parts) < 5:
            continue
        try:
            cls = int(float(parts[0]))
            cx, cy, w, h = (float(v) for v in parts[1:5])
        except ValueError:
            continue
        if not (0 <= cx <= 1 and 0 <= cy <= 1 and 0 < w <= 1 and 0 < h <= 1):
            continue  # malformed box - skip rather than crash training
        rows.append((cls, cx, cy, w, h))
    return rows


def place(src: Path, dst: Path, link: bool) -> None:
    dst.parent.mkdir(parents=True, exist_ok=True)
    if dst.exists() or dst.is_symlink():
        dst.unlink()
    if link:
        os.symlink(src.resolve(), dst)
    else:
        shutil.copy2(src, dst)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", type=Path, required=True)
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument("--classes", nargs="+", required=True, help="Class names in YOLO id order")
    ap.add_argument("--name", default="custom-dataset")
    ap.add_argument("--origin", choices=["real", "synthetic", "mixed"], required=True)
    ap.add_argument("--licence", default="unknown - check the dataset page")
    ap.add_argument("--source-url", default="")
    ap.add_argument("--split", nargs=3, type=float, default=(0.7, 0.15, 0.15), metavar=("TRAIN", "VAL", "TEST"))
    ap.add_argument("--seed", type=int, default=42)
    ap.add_argument("--limit", type=int, default=0, help="Use at most N images (random subset, seeded)")
    ap.add_argument("--keep-splits", action="store_true", help="Respect existing train/val/test folders")
    ap.add_argument("--link", action="store_true", help="Symlink instead of copying")
    ap.add_argument("--allow-empty", action="store_true", help="Keep images without labels (background images)")
    args = ap.parse_args()

    if abs(sum(args.split) - 1.0) > 1e-6:
        raise SystemExit("--split fractions must sum to 1")
    if not args.source.exists():
        raise SystemExit(f"Source folder not found: {args.source}")

    pairs = find_pairs(args.source)
    if not pairs:
        raise SystemExit("No images found under --source")
    labelled = [(i, l) for i, l in pairs if l is not None]
    skipped_unlabelled = len(pairs) - len(labelled)
    if args.allow_empty:
        labelled = pairs

    rng = random.Random(args.seed)
    rng.shuffle(labelled)
    if args.limit and len(labelled) > args.limit:
        labelled = labelled[: args.limit]

    assignment: dict[str, list[tuple[Path, Path | None]]] = {s: [] for s in SPLITS}
    if args.keep_splits:
        for img, lbl in labelled:
            s = split_of(img)
            if s:
                assignment[s].append((img, lbl))
        if not assignment["train"]:
            raise SystemExit("--keep-splits given but no train/ folder detected")
    else:
        n = len(labelled)
        n_train = int(round(n * args.split[0]))
        n_val = int(round(n * args.split[1]))
        assignment["train"] = labelled[:n_train]
        assignment["val"] = labelled[n_train : n_train + n_val]
        assignment["test"] = labelled[n_train + n_val :]

    class_hist: Counter[str] = Counter()
    box_sizes: list[float] = []
    counts = {}
    digests = {}
    for split, items in assignment.items():
        out_imgs = []
        for img, lbl in items:
            dst_img = args.out / "images" / split / img.name
            place(img, dst_img, args.link)
            rows = read_label(lbl)
            dst_lbl = args.out / "labels" / split / f"{img.stem}.txt"
            dst_lbl.parent.mkdir(parents=True, exist_ok=True)
            dst_lbl.write_text("".join(f"{c} {cx:.6f} {cy:.6f} {w:.6f} {h:.6f}\n" for c, cx, cy, w, h in rows))
            for c, _, _, w, h in rows:
                class_hist[args.classes[c] if c < len(args.classes) else f"id_{c}"] += 1
                box_sizes.append((w * h) ** 0.5)
            out_imgs.append(dst_img)
        counts[split] = len(items)
        digests[split] = file_list_digest(out_imgs) if out_imgs else None
        print(f"{split}: {len(items)} images")

    (args.out / "data.yaml").write_text(
        "\n".join(
            [
                f"path: {args.out.resolve()}",
                "train: images/train",
                "val: images/val",
                "test: images/test",
                f"nc: {len(args.classes)}",
                f"names: {list(args.classes)}",
                "",
            ]
        ),
        encoding="utf-8",
    )
    manifest = {
        "name": args.name,
        "data_origin": args.origin,
        "licence": args.licence,
        "source_url": args.source_url,
        "prepared_at": utc_now_iso(),
        "source_folder": str(args.source.resolve()),
        "seed": args.seed,
        "split_fractions": list(args.split),
        "limit": args.limit or None,
        "classes": list(args.classes),
        "counts": counts,
        "class_histogram": dict(class_hist),
        "images_without_labels_skipped": skipped_unlabelled if not args.allow_empty else 0,
        "box_relative_size_median": sorted(box_sizes)[len(box_sizes) // 2] if box_sizes else None,
        "split_digests": digests,
    }
    write_json(args.out / "dataset_manifest.json", manifest)
    print(f"Wrote {args.out / 'data.yaml'} and dataset_manifest.json")


if __name__ == "__main__":
    main()
