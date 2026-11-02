"""Shared helpers for the ORBITAL GUARD machine-learning scripts.

Everything the training / evaluation scripts need to agree on lives here:
project paths, the experiment-record format and small utilities. Keeping this
in one place means the web dashboard (which reads ``ml/experiments/*.json``)
and the scripts never drift apart.
"""
from __future__ import annotations

import hashlib
import json
import os
import platform
import random
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ml/scripts/common.py -> ml/ -> project root
ML_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = ML_DIR.parent
EXPERIMENTS_DIR = ML_DIR / "experiments"
WEIGHTS_DIR = ML_DIR / "weights"
DATA_DIR = Path(os.environ.get("ORBITAL_GUARD_DATA_DIR", ML_DIR / "data"))
RUNS_DIR = ML_DIR / "runs"

IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".tif", ".tiff"}


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def seed_everything(seed: int) -> None:
    """Seed Python, NumPy and (if installed) PyTorch for reproducibility.

    Full determinism on GPUs is not guaranteed by PyTorch; we record the seed
    so a run can at least be repeated with identical configuration.
    """
    random.seed(seed)
    os.environ["PYTHONHASHSEED"] = str(seed)
    try:
        import numpy as np

        np.random.seed(seed)
    except ImportError:
        pass
    try:
        import torch

        torch.manual_seed(seed)
    except ImportError:
        pass


def git_commit() -> str | None:
    try:
        out = subprocess.run(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=PROJECT_ROOT,
            capture_output=True,
            text=True,
            timeout=5,
        )
        return out.stdout.strip() or None
    except Exception:  # git missing or not a repository
        return None


def environment_info() -> dict[str, Any]:
    info: dict[str, Any] = {
        "python": sys.version.split()[0],
        "platform": platform.platform(),
        "cpu_count": os.cpu_count(),
        "git_commit": git_commit(),
    }
    try:
        import torch

        info["torch"] = torch.__version__
        info["cuda_available"] = torch.cuda.is_available()
    except ImportError:
        info["torch"] = None
    try:
        import ultralytics

        info["ultralytics"] = ultralytics.__version__
    except ImportError:
        info["ultralytics"] = None
    return info


def file_list_digest(paths: list[Path]) -> str:
    """Stable fingerprint of a dataset split (names + sizes, not pixel data)."""
    h = hashlib.sha256()
    for p in sorted(paths):
        h.update(p.name.encode())
        h.update(str(p.stat().st_size).encode())
    return h.hexdigest()[:16]


def load_yaml(path: Path) -> dict[str, Any]:
    import yaml  # provided by ultralytics' dependencies

    with open(path, "r", encoding="utf-8") as f:
        return yaml.safe_load(f) or {}


def write_json(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, indent=2, default=str)


def read_json(path: Path) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def new_experiment_record(run_name: str, config: dict[str, Any], data_origin: str) -> dict[str, Any]:
    """Create the experiment record that the dashboard renders.

    ``data_origin`` must be honest: ``"real"`` only for genuine observations
    (e.g. StreaksYoloDataset), ``"synthetic"`` for generated frames.
    """
    return {
        "schema_version": 1,
        "id": run_name,
        "status": "created",
        "created_at": utc_now_iso(),
        "data_origin": data_origin,
        "config": config,
        "environment": environment_info(),
        "dataset": {},
        "training": {},
        "metrics": {},
        "evaluation": {},
        "artifacts": {},
        "notes": [],
    }


def experiment_path(run_name: str) -> Path:
    return EXPERIMENTS_DIR / f"{run_name}.json"


def parse_overrides(pairs: list[str]) -> dict[str, Any]:
    """Turn ``--set epochs=2 --set imgsz=416`` into a typed dict."""
    out: dict[str, Any] = {}
    for pair in pairs:
        if "=" not in pair:
            raise SystemExit(f"--set expects key=value, got {pair!r}")
        key, raw = pair.split("=", 1)
        value: Any = raw
        for caster in (int, float):
            try:
                value = caster(raw)
                break
            except ValueError:
                continue
        if raw.lower() in {"true", "false"}:
            value = raw.lower() == "true"
        out[key.strip()] = value
    return out
