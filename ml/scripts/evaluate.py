"""Evaluate trained weights on the held-out TEST split and analyse failure cases.

Two things happen here:

1. ``model.val(split="test")`` - Ultralytics computes precision, recall,
   mAP@0.5 and mAP@0.5:0.95 on images the model never saw during training or
   model selection. These are the numbers to report.
2. A failure-case analysis: ground-truth boxes are grouped by size (small /
   medium / large, measured in pixels) and recall is computed per group using
   IoU >= 0.5 matching. Small and faint objects are where debris detectors
   usually fail, so this breakdown is more informative than one global number.

Results are written into the experiment record (``evaluation`` section).

Usage
-----
    python ml/scripts/evaluate.py --run baseline-streaks            # uses record's best.pt
    python ml/scripts/evaluate.py --weights path/to/best.pt --data ml/data/streaks/data.yaml --run my-run
"""
from __future__ import annotations

import argparse
from pathlib import Path

import numpy as np

from common import experiment_path, read_json, utc_now_iso, write_json

SIZE_BINS = [("small(<16px)", 0, 16), ("medium(16-48px)", 16, 48), ("large(>48px)", 48, 10**9)]


def iou_matrix(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """IoU between two arrays of xyxy boxes, shape (n,4) and (m,4)."""
    if len(a) == 0 or len(b) == 0:
        return np.zeros((len(a), len(b)))
    x1 = np.maximum(a[:, None, 0], b[None, :, 0])
    y1 = np.maximum(a[:, None, 1], b[None, :, 1])
    x2 = np.minimum(a[:, None, 2], b[None, :, 2])
    y2 = np.minimum(a[:, None, 3], b[None, :, 3])
    inter = np.clip(x2 - x1, 0, None) * np.clip(y2 - y1, 0, None)
    area_a = (a[:, 2] - a[:, 0]) * (a[:, 3] - a[:, 1])
    area_b = (b[:, 2] - b[:, 0]) * (b[:, 3] - b[:, 1])
    return inter / np.clip(area_a[:, None] + area_b[None, :] - inter, 1e-9, None)


def read_gt(label_path: Path, w: int, h: int) -> tuple[np.ndarray, np.ndarray]:
    boxes, classes = [], []
    if label_path.exists():
        for line in label_path.read_text().splitlines():
            p = line.split()
            if len(p) < 5:
                continue
            c, cx, cy, bw, bh = int(float(p[0])), *map(float, p[1:5])
            boxes.append([(cx - bw / 2) * w, (cy - bh / 2) * h, (cx + bw / 2) * w, (cy + bh / 2) * h])
            classes.append(c)
    return np.array(boxes, dtype=float).reshape(-1, 4), np.array(classes, dtype=int)


def failure_analysis(model, data_yaml: Path, imgsz: int, conf: float, iou_thr: float = 0.5) -> dict:
    import yaml

    cfg = yaml.safe_load(data_yaml.read_text())
    root = Path(cfg.get("path", data_yaml.parent))
    test_dir = root / cfg.get("test", "images/test")
    images = sorted(p for p in test_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    bins = {name: {"total": 0, "detected": 0} for name, _, _ in SIZE_BINS}
    per_class = {}
    false_positives = 0
    for img_path in images:
        label_path = root / "labels" / "test" / f"{img_path.stem}.txt"
        res = model.predict(str(img_path), imgsz=imgsz, conf=conf, verbose=False, device="cpu")[0]
        h, w = res.orig_shape
        gt, gt_cls = read_gt(label_path, w, h)
        pred = res.boxes.xyxy.cpu().numpy() if res.boxes is not None else np.zeros((0, 4))
        pred_cls = res.boxes.cls.cpu().numpy().astype(int) if res.boxes is not None else np.zeros(0, int)
        matched_pred = set()
        ious = iou_matrix(gt, pred)
        for gi in range(len(gt)):
            size = float(np.sqrt((gt[gi, 2] - gt[gi, 0]) * (gt[gi, 3] - gt[gi, 1])))
            name = next(n for n, lo, hi in SIZE_BINS if lo <= size < hi)
            bins[name]["total"] += 1
            cls_entry = per_class.setdefault(int(gt_cls[gi]), {"total": 0, "detected": 0})
            cls_entry["total"] += 1
            if len(pred):
                order = np.argsort(-ious[gi])
                for pj in order:
                    if ious[gi, pj] < iou_thr:
                        break
                    if pj not in matched_pred and pred_cls[pj] == gt_cls[gi]:
                        matched_pred.add(pj)
                        bins[name]["detected"] += 1
                        cls_entry["detected"] += 1
                        break
        false_positives += len(pred) - len(matched_pred)
    for b in bins.values():
        b["recall"] = round(b["detected"] / b["total"], 4) if b["total"] else None
    return {
        "method": f"greedy IoU>={iou_thr} matching at conf>={conf}",
        "images": len(images),
        "recall_by_gt_size": bins,
        "recall_by_class": {str(k): {**v, "recall": round(v["detected"] / v["total"], 4) if v["total"] else None} for k, v in per_class.items()},
        "false_positives_total": int(false_positives),
    }


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", required=True, help="Experiment name (ml/experiments/<run>.json)")
    ap.add_argument("--weights", type=Path, help="Defaults to the run's best.pt")
    ap.add_argument("--data", type=Path, help="Defaults to the run's data.yaml")
    ap.add_argument("--imgsz", type=int)
    ap.add_argument("--conf", type=float, default=0.25, help="Confidence used for the failure analysis")
    args = ap.parse_args()

    rec_path = experiment_path(args.run)
    record = read_json(rec_path) if rec_path.exists() else {"id": args.run, "config": {}, "notes": [], "evaluation": {}}
    weights = args.weights or Path(record.get("artifacts", {}).get("weights_best", ""))
    data_yaml = args.data or Path(record.get("config", {}).get("data", ""))
    imgsz = args.imgsz or int(record.get("config", {}).get("imgsz", 640))
    if not weights.exists():
        raise SystemExit(f"Weights not found: {weights}")
    if not data_yaml.exists():
        raise SystemExit(f"data.yaml not found: {data_yaml}")

    from ultralytics import YOLO

    model = YOLO(str(weights))
    metrics = model.val(data=str(data_yaml), split="test", imgsz=imgsz, device="cpu", plots=False, verbose=False)
    box = metrics.box
    f1 = float(box.f1.mean()) if len(box.f1) else None
    record["evaluation"] = {
        "evaluated_at": utc_now_iso(),
        "split": "test",
        "weights": str(weights),
        "imgsz": imgsz,
        "precision": float(box.mp),
        "recall": float(box.mr),
        "f1": f1,
        "map50": float(box.map50),
        "map50_95": float(box.map),
        "per_class": {str(metrics.names[i]): {"ap50": float(box.ap50[j]), "ap": float(box.ap[j])} for j, i in enumerate(box.ap_class_index)},
        "failure_analysis": failure_analysis(model, data_yaml, imgsz, args.conf),
    }
    record["status"] = "evaluated"
    write_json(rec_path, record)
    print(f"test precision={box.mp:.3f} recall={box.mr:.3f} f1={f1} mAP50={box.map50:.3f} mAP50-95={box.map:.3f}")
    print(f"Updated {rec_path}")


if __name__ == "__main__":
    main()
