"""MICRO-SEG30 · the icon of EMStudio lab: the app's icon with a «lab» band.

    python3 apps/desktop/make-lab-icon.py   (Pillow; then `cargo tauri icon`)

Writes src-tauri/icons-lab/source.png from src-tauri/icons/icon.png, then
`cargo tauri icon` makes the set tauri.lab.conf.json names (icons-lab/).
Run again only when the app's icon changes; the result is committed, so the
lab build needs neither Pillow nor this script.
"""
import pathlib
import subprocess
import sys

from PIL import Image, ImageDraw, ImageFont

HERE = pathlib.Path(__file__).resolve().parent / "src-tauri"
src = Image.open(HERE / "icons" / "icon.png").convert("RGBA")
size = 1024
im = src.resize((size, size), Image.LANCZOS)
draw = ImageDraw.Draw(im)
# a band across the lower third, the word in white: readable at 32 px
band_top, band_bottom = int(size * 0.66), int(size * 0.90)
draw.rounded_rectangle((int(size * 0.08), band_top, int(size * 0.92), band_bottom), radius=int(size * 0.05),
                       fill=(196, 40, 40, 245))
font = None
for cand in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf", "/System/Library/Fonts/Helvetica.ttc",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"):
    try:
        font = ImageFont.truetype(cand, int(size * 0.19))
        break
    except OSError:
        continue
if font is None:
    sys.exit("no font found for the «lab» band")
text = "lab"
box = draw.textbbox((0, 0), text, font=font)
w, h = box[2] - box[0], box[3] - box[1]
draw.text(((size - w) / 2 - box[0], band_top + (band_bottom - band_top - h) / 2 - box[1]), text, font=font,
          fill=(255, 255, 255, 255))
out = HERE / "icons-lab"
out.mkdir(exist_ok=True)
im.save(out / "source.png")
subprocess.run(["cargo", "tauri", "icon", str(out / "source.png"), "-o", str(out)], check=True, cwd=HERE)
# only what tauri.lab.conf.json names (the lab is a desktop build: no mobile, no Store)
import shutil
KEEP = {"32x32.png", "128x128.png", "128x128@2x.png", "icon.icns", "icon.ico", "icon.png", "source.png"}
for p in out.iterdir():
    if p.name not in KEEP:
        shutil.rmtree(p) if p.is_dir() else p.unlink()
print(f"icons in {out}")
