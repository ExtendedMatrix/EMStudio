#!/usr/bin/env python3
"""EMStudio Lab's icon: the public icon with a «LAB» band (docs/LAB.md).

Run once, by hand, when the public icon changes — the result is committed in
apps/desktop/src-tauri/icons-lab/ and read by tauri.lab.conf.json:

    python lab-icon.py <icon_512x512@2x.png> <out.png>      # needs Pillow
    cargo tauri icon <out.png> -o /tmp/icons-lab             # every size
    cp /tmp/icons-lab/{32x32.png,128x128.png,128x128@2x.png,icon.icns,icon.ico} \\
       apps/desktop/src-tauri/icons-lab/

The 1024 px source comes out of the public .icns:
    iconutil -c iconset -o src.iconset apps/desktop/src-tauri/icons/icon.icns
"""
import sys

from PIL import Image, ImageDraw, ImageFont

src, out = sys.argv[1], sys.argv[2]
img = Image.open(src).convert("RGBA").resize((1024, 1024), Image.LANCZOS)
draw = ImageDraw.Draw(img)
# a band across the lower edge, in a colour the public icon never uses, so the
# two apps are told apart in the Dock at 32 px too
band = (0, 760, 1024, 1024)
draw.rectangle(band, fill=(200, 60, 40, 255))
font = None
for path in ("/System/Library/Fonts/Supplemental/Arial Bold.ttf",
             "/System/Library/Fonts/Helvetica.ttc",
             "/Library/Fonts/Arial Bold.ttf"):
    try:
        font = ImageFont.truetype(path, 220)
        break
    except OSError:
        continue
font = font or ImageFont.load_default()
x0, y0, x1, y1 = draw.textbbox((0, 0), "LAB", font=font)
w, h = x1 - x0, y1 - y0
draw.text(((1024 - w) / 2 - x0, band[1] + (band[3] - band[1] - h) / 2 - y0),
          "LAB", font=font, fill=(255, 255, 255, 255))
img.save(out)
print(out)
