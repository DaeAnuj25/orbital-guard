"""Fetch a few REAL sample frames from the StreaksYoloDataset ZIP using HTTP
range requests, without downloading the whole 1.4 GB archive.

Why: the submission documents need a genuine telescope frame with a streak and
its YOLO label as evidence. The full archive is downloaded separately for
checksum verification; this script only pulls the ZIP central directory plus the
few entries we actually show, which is a few hundred kilobytes.

Source (verified): Zenodo record 14047944, CC BY 4.0,
StreaksYoloDataset.zip, 1,397,179,335 bytes, md5 ff4f651b55077a23ebda94c9d157e1b0.

Usage: python3 docs/tools/fetch_sample.py --out docs/assets/dataset --split test --count 4
"""
from __future__ import annotations

import argparse
import io
import struct
import zlib
from pathlib import Path

import requests

URL = "https://zenodo.org/records/14047944/files/StreaksYoloDataset.zip?download=1"
UA = {"User-Agent": "ORBITAL-GUARD documentation builder (student project)"}


def ranged(url: str, start: int, end: int) -> bytes:
    r = requests.get(url, headers={**UA, "Range": f"bytes={start}-{end}"}, timeout=120)
    if r.status_code not in (200, 206):
        raise SystemExit(f"range request failed: HTTP {r.status_code}")
    return r.content


def central_directory(url: str) -> tuple[list[dict], int]:
    head = requests.head(url, headers=UA, timeout=60, allow_redirects=True)
    size = int(head.headers["Content-Length"])
    print(f"archive size: {size:,} bytes; accept-ranges: {head.headers.get('Accept-Ranges')}")
    tail = ranged(url, max(0, size - 65557), size - 1)
    i = tail.rfind(b"PK\x05\x06")
    if i < 0:
        raise SystemExit("EOCD not found")
    cd_size, cd_off = struct.unpack("<II", tail[i + 12 : i + 20])
    cd = ranged(url, cd_off, cd_off + cd_size - 1)
    entries, p = [], 0
    while p < len(cd) and cd[p : p + 4] == b"PK\x01\x02":
        method, = struct.unpack("<H", cd[p + 10 : p + 12])
        csize, usize = struct.unpack("<II", cd[p + 20 : p + 28])
        nlen, elen, clen = struct.unpack("<HHH", cd[p + 28 : p + 34])
        lho, = struct.unpack("<I", cd[p + 42 : p + 46])
        name = cd[p + 46 : p + 46 + nlen].decode("utf-8", "replace")
        entries.append(dict(name=name, method=method, csize=csize, usize=usize, offset=lho))
        p += 46 + nlen + elen + clen
    print(f"central directory entries: {len(entries)}")
    return entries, size


def extract(url: str, e: dict) -> bytes:
    hdr = ranged(url, e["offset"], e["offset"] + 29)
    nlen, elen = struct.unpack("<HH", hdr[26:30])
    data_start = e["offset"] + 30 + nlen + elen
    raw = ranged(url, data_start, data_start + e["csize"] - 1)
    if e["method"] == 0:
        return raw
    if e["method"] == 8:
        return zlib.decompress(raw, -15)
    raise SystemExit(f"unsupported compression method {e['method']}")


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", type=Path, default=Path("docs/assets/dataset"))
    ap.add_argument("--split", default="test")
    ap.add_argument("--count", type=int, default=4)
    args = ap.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)

    entries, size = central_directory(URL)
    imgs = [e for e in entries if f"/{args.split}/images/" in e["name"] and e["name"].lower().endswith((".jpeg", ".jpg"))]
    labels = {Path(e["name"]).stem: e for e in entries if f"/{args.split}/labels/" in e["name"] and e["name"].endswith(".txt")}
    # Prefer images that actually carry a label (a visible streak annotation).
    chosen = [e for e in imgs if Path(e["name"]).stem in labels][: args.count]
    print(f"{args.split}: {len(imgs)} images, {len(labels)} labels; taking {len(chosen)} labelled frames")

    manifest = []
    for e in chosen:
        stem = Path(e["name"]).stem
        img = extract(URL, e)
        lbl = extract(URL, labels[stem]).decode()
        (args.out / f"{args.split}_{stem}.jpeg").write_bytes(img)
        (args.out / f"{args.split}_{stem}.txt").write_text(lbl)
        manifest.append(dict(zip_entry=e["name"], image=f"{args.split}_{stem}.jpeg", label=lbl.strip(), bytes=len(img)))
        print(f"  {e['name']} -> {len(img):,} bytes | label: {lbl.strip()}")

    import json
    (args.out / "provenance.json").write_text(json.dumps({
        "source_url": URL, "zenodo_record": 14047944, "doi": "10.5281/zenodo.14047944",
        "licence": "CC BY 4.0", "archive_bytes": size,
        "archive_md5_published": "ff4f651b55077a23ebda94c9d157e1b0",
        "method": "HTTP range requests: ZIP central directory + selected entries only",
        "samples": manifest,
    }, indent=2))
    print("wrote", args.out / "provenance.json")


if __name__ == "__main__":
    main()
