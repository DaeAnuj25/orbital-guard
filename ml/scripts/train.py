"""Train a YOLO detector (Ultralytics) from a YAML config and record the experiment.

The script is deliberately thin: Ultralytics does the heavy lifting, and this
wrapper guarantees that every run leaves behind a complete, honest record in
``ml/experiments/<run_name>.json`` (config, seed, dataset manifest, per-epoch
losses, final validation metrics, environment). The web dashboard reads those
records and shows them under "Measured results".

Usage
-----
    python ml/scripts/train.py --config ml/configs/baseline.yaml
    python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=2 --set imgsz=416

Any ``--set key=value`` overrides the YAML (handy for quick CPU smoke tests).
"""
from __future__ import annotations

import argparse
import csv
import time
from pathlib import Path

from common import (
    EXPERIMENTS_DIR,
    RUNS_DIR,
    experiment_path,
    load_yaml,
    new_experiment_record,
    parse_overrides,
    read_json,
    seed_everything,
    utc_now_iso,
    write_json,
)


def load_dataset_manifest(data_yaml: Path) -> dict:
    manifest = data_yaml.parent / "dataset_manifest.json"
    if manifest.exists():
        return read_json(manifest)
    return {"name": data_yaml.parent.name, "data_origin": "unknown", "note": "no dataset_manifest.json found"}


def read_results_csv(save_dir: Path) -> list[dict]:
    """Ultralytics writes results.csv with padded column names; normalise them."""
    path = save_dir / "results.csv"
    if not path.exists():
        return []
    rows = []
    with open(path, newline="", encoding="utf-8") as f:
        for raw in csv.DictReader(f):
            row = {k.strip(): v.strip() for k, v in raw.items() if k}
            rows.append(
                {
                    "epoch": int(float(row.get("epoch", 0))),
                    "train_box_loss": float(row.get("train/box_loss", "nan")),
                    "train_cls_loss": float(row.get("train/cls_loss", "nan")),
                    "train_dfl_loss": float(row.get("train/dfl_loss", "nan")),
                    "val_box_loss": float(row.get("val/box_loss", "nan")),
                    "val_cls_loss": float(row.get("val/cls_loss", "nan")),
                    "val_dfl_loss": float(row.get("val/dfl_loss", "nan")),
                    "precision": float(row.get("metrics/precision(B)", "nan")),
                    "recall": float(row.get("metrics/recall(B)", "nan")),
                    "map50": float(row.get("metrics/mAP50(B)", "nan")),
                    "map50_95": float(row.get("metrics/mAP50-95(B)", "nan")),
                }
            )
    return rows


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--config", type=Path, required=True)
    ap.add_argument("--set", action="append", default=[], help="Override config values: key=value")
    args = ap.parse_args()

    cfg = load_yaml(args.config)
    cfg.update(parse_overrides(args.set))
    run_name = cfg.get("name") or args.config.stem
    data_yaml = Path(cfg["data"])
    if not data_yaml.is_absolute():
        data_yaml = (Path.cwd() / data_yaml).resolve()
    if not data_yaml.exists():
        raise SystemExit(
            f"Dataset file not found: {data_yaml}\n"
            "Run ml/scripts/prepare_dataset.py or ml/scripts/generate_synthetic.py first."
        )

    manifest = load_dataset_manifest(data_yaml)
    record = new_experiment_record(run_name, cfg, manifest.get("data_origin", "unknown"))
    record["dataset"] = manifest
    record["status"] = "running"
    record["started_at"] = utc_now_iso()
    EXPERIMENTS_DIR.mkdir(parents=True, exist_ok=True)
    write_json(experiment_path(run_name), record)

    try:
        from ultralytics import YOLO
    except ImportError as exc:
        record["status"] = "failed"
        record["notes"].append("ultralytics is not installed: pip install -r ml/requirements.txt")
        write_json(experiment_path(run_name), record)
        raise SystemExit(record["notes"][-1]) from exc

    seed = int(cfg.get("seed", 42))
    seed_everything(seed)

    # A ".yaml" model builds the architecture from scratch (e.g. yolov8n-p2.yaml
    # with an extra high-resolution P2 head for tiny objects); "pretrained"
    # then transfers compatible COCO weights into it.
    model = YOLO(cfg["model"])
    if str(cfg["model"]).endswith(".yaml") and cfg.get("pretrained"):
        model = model.load(cfg["pretrained"])

    t0 = time.time()
    try:
        results = model.train(
            data=str(data_yaml),
            epochs=int(cfg.get("epochs", 50)),
            imgsz=int(cfg.get("imgsz", 640)),
            batch=int(cfg.get("batch", 16)),
            seed=seed,
            deterministic=True,
            device=cfg.get("device", "cpu"),
            workers=int(cfg.get("workers", 2)),
            optimizer=cfg.get("optimizer", "auto"),
            lr0=float(cfg.get("lr0", 0.01)),
            patience=int(cfg.get("patience", 20)),
            project=str(RUNS_DIR),
            name=run_name,
            exist_ok=True,
            plots=False,
            verbose=True,
            amp=False,
            mosaic=float(cfg.get("mosaic", 1.0)),
            fliplr=float(cfg.get("fliplr", 0.5)),
            flipud=float(cfg.get("flipud", 0.0)),
            degrees=float(cfg.get("degrees", 0.0)),
            scale=float(cfg.get("scale", 0.5)),
        )
    except Exception as exc:  # keep an honest failed record instead of a half-written one
        record["status"] = "failed"
        record["notes"].append(f"training raised {type(exc).__name__}: {exc}")
        write_json(experiment_path(run_name), record)
        raise

    elapsed = time.time() - t0
    save_dir = Path(results.save_dir)
    box = results.box
    f1 = float(box.f1.mean()) if getattr(box, "f1", None) is not None and len(box.f1) else None
    record.update(
        {
            "status": "trained",
            "finished_at": utc_now_iso(),
            "training": {
                "elapsed_seconds": round(elapsed, 1),
                "epochs_completed": len(read_results_csv(save_dir)),
                "curves": read_results_csv(save_dir),
            },
            # Final metrics come from Ultralytics' validation of best.pt on the *val* split.
            "metrics": {
                "split": "val",
                "precision": float(box.mp),
                "recall": float(box.mr),
                "f1": f1,
                "map50": float(box.map50),
                "map50_95": float(box.map),
                "per_class": {
                    str(results.names[i]): {"ap50": float(box.ap50[j]), "ap": float(box.ap[j])}
                    for j, i in enumerate(box.ap_class_index)
                }
                if hasattr(box, "ap_class_index")
                else {},
            },
            "artifacts": {
                "weights_best": str(save_dir / "weights" / "best.pt"),
                "weights_last": str(save_dir / "weights" / "last.pt"),
                "results_csv": str(save_dir / "results.csv"),
            },
        }
    )
    record["notes"].append(
        "Metrics measured by Ultralytics on the validation split; run evaluate.py for held-out test metrics."
    )
    write_json(experiment_path(run_name), record)
    print(f"\nRun '{run_name}' finished in {elapsed/60:.1f} min")
    print(f"val precision={box.mp:.3f} recall={box.mr:.3f} mAP50={box.map50:.3f} mAP50-95={box.map:.3f}")
    print(f"Experiment record: {experiment_path(run_name)}")


if __name__ == "__main__":
    main()
