# ml/ — training, evaluation and export pipeline (Python)

The web app never trains anything; it only *reads* what this folder produces:

* `experiments/<run>.json` — one record per run (config, seed, dataset manifest, curves, val + test metrics,
  failure analysis, environment). Rendered verbatim by the Dataset & Model page.
* `weights/model.onnx` + `weights/model.json` — the deployed detector and its provenance.

## Scripts (run from the project root, with the venv active)

| Script | What it does |
|---|---|
| `scripts/generate_synthetic.py` | Writes a SYNTHETIC YOLO dataset (point sources + streaks + hot pixels) for pipeline tests. |
| `scripts/prepare_dataset.py` | Builds seeded train/val/test splits from any YOLO-format folder (StreaksYoloDataset supported out of the box), writes `data.yaml` + `dataset_manifest.json`. |
| `scripts/train.py` | Trains Ultralytics YOLO from a YAML config (`--set key=value` overrides), records everything in `experiments/`. |
| `scripts/evaluate.py` | Held-out TEST metrics + recall by object size / class + false-positive count. |
| `scripts/export_onnx.py` | Exports `best.pt` to `weights/model.onnx` with metadata. |
| `scripts/common.py` | Paths, seeding, experiment-record format, environment capture. |

## Configs

* `configs/baseline.yaml` — YOLOv8n from COCO weights.
* `configs/improved_p2.yaml` — YOLOv8n + stride-4 P2 head (small/faint objects), same seed and data.
* `configs/synthetic_smoke.yaml` — 3-epoch smoke test on synthetic frames.

## Typical session

```bash
python ml/scripts/prepare_dataset.py --source /path/StreaksYoloDataset --out ml/data/streaks \
  --classes streak --name StreaksYoloDataset --origin real --licence "CC BY 4.0" --keep-splits --limit 360 --seed 42
python ml/scripts/train.py --config ml/configs/baseline.yaml --set epochs=20 --set imgsz=512 --set batch=8
python ml/scripts/evaluate.py --run baseline-streaks
python ml/scripts/export_onnx.py --run baseline-streaks
```

Honesty rules baked in: `data_origin` must be `real` or `synthetic`; a failed run is recorded as failed; metrics on
the validation split are labelled as such and only `evaluate.py` produces test numbers.
