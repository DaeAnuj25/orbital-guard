"""Create print-optimised copies of every figure/screenshot for embedding in Word.

Screenshots are captured at 1.5x device scale (2160 px wide); 1600 px is still
~250 dpi at the 6.35-inch content width, so nothing readable is lost while the
document size drops by roughly 4x. Diagrams stay PNG (crisp text); photographs
and UI screenshots become high-quality JPEG.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
OPT = ROOT / "docs/assets/opt"
OPT.mkdir(parents=True, exist_ok=True)
MAXW = {"screens": 1500, "figs": 1600, "photos": 1500, "dataset": 1280}
# Figures that contain photographic pixels compress far better as JPEG.
PHOTO_FIGS = {"m2_dataset_sample", "m3_detection_pair", "m3_detection_miss"}

total_before = total_after = 0
for sub, maxw in MAXW.items():
    for p in sorted((ROOT / "docs/assets" / sub).glob("*")):
        if p.suffix.lower() not in {".png", ".jpg", ".jpeg"}:
            continue
        im = Image.open(p)
        if im.width > maxw:
            im = im.resize((maxw, round(im.height * maxw / im.width)), Image.LANCZOS)
        before = p.stat().st_size
        if sub in {"screens", "photos"} or p.stem in PHOTO_FIGS:
            out = OPT / (p.stem + ".jpg")
            im.convert("RGB").save(out, "JPEG", quality=88, optimize=True, progressive=True)
        else:
            # Encode both ways and keep the smaller: PNG wins for line diagrams,
            # JPEG for dense scatter / 3-D shading, so nothing is bloated.
            png_out, jpg_out = OPT / (p.stem + ".png"), OPT / (p.stem + ".jpg")
            im.save(png_out, "PNG", optimize=True)
            im.convert("RGB").save(jpg_out, "JPEG", quality=90, optimize=True, progressive=True)
            if jpg_out.stat().st_size < png_out.stat().st_size:
                png_out.unlink(); out = jpg_out
            else:
                jpg_out.unlink(); out = png_out
        after = out.stat().st_size
        total_before += before; total_after += after
        print(f"{sub}/{p.name}: {before/1024:.0f} KB -> {after/1024:.0f} KB")
print(f"TOTAL {total_before/1e6:.1f} MB -> {total_after/1e6:.1f} MB")
