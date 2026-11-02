"""Export trained YOLO weights to ONNX so the Next.js API can run them.

The web API (src/lib/vision/onnx.ts) loads ``ml/weights/model.onnx`` with
onnxruntime-node and reads ``ml/weights/model.json`` for class names, input
size and provenance. Only run this on weights you actually trained/evaluated;
the metadata file is what the dashboard uses to describe the model honestly.

Usage
-----
    python ml/scripts/export_onnx.py --run baseline-streaks
    python ml/scripts/export_onnx.py --weights ml/runs/baseline-streaks/weights/best.pt --imgsz 640
"""
from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from common import WEIGHTS_DIR, experiment_path, read_json, utc_now_iso, write_json


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--run", help="Experiment name whose best.pt should be exported")
    ap.add_argument("--weights", type=Path)
    ap.add_argument("--imgsz", type=int)
    ap.add_argument("--opset", type=int, default=12)
    args = ap.parse_args()

    record = {}
    if args.run and experiment_path(args.run).exists():
        record = read_json(experiment_path(args.run))
    weights = args.weights or Path(record.get("artifacts", {}).get("weights_best", ""))
    imgsz = args.imgsz or int(record.get("config", {}).get("imgsz", 640))
    if not weights or not weights.exists():
        raise SystemExit(f"Weights not found: {weights}")

    from ultralytics import YOLO

    model = YOLO(str(weights))
    onnx_path = Path(model.export(format="onnx", imgsz=imgsz, opset=args.opset, simplify=True, dynamic=False, device="cpu"))
    WEIGHTS_DIR.mkdir(parents=True, exist_ok=True)
    target = WEIGHTS_DIR / "model.onnx"
    shutil.copy2(onnx_path, target)
    names = model.names if isinstance(model.names, dict) else dict(enumerate(model.names))
    meta = {
        "format": "ultralytics-yolov8-onnx",
        "name": record.get("id") or weights.stem,
        "exported_at": utc_now_iso(),
        "source_weights": str(weights),
        "imgsz": imgsz,
        "opset": args.opset,
        "classes": [names[i] for i in sorted(names)],
        "input": {"name": "images", "shape": [1, 3, imgsz, imgsz], "layout": "NCHW RGB 0-1"},
        "output": {"layout": "[1, 4 + num_classes, num_anchors] (cx, cy, w, h, class scores)"},
        "data_origin": record.get("data_origin", "unknown"),
        "dataset": record.get("dataset", {}).get("name"),
        "metrics_val": record.get("metrics", {}),
        "metrics_test": {k: v for k, v in record.get("evaluation", {}).items() if k in {"precision", "recall", "f1", "map50", "map50_95"}},
    }
    write_json(WEIGHTS_DIR / "model.json", meta)
    if record:
        record.setdefault("artifacts", {})["onnx"] = str(target)
        write_json(experiment_path(args.run), record)
    print(f"Exported {target} ({target.stat().st_size/1e6:.1f} MB) with metadata model.json")


if __name__ == "__main__":
    main()
