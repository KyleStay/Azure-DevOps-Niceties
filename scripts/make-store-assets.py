"""Render the brand's promotional tile; requires Pillow (not a runtime dependency)."""
from pathlib import Path
from PIL import Image, ImageDraw
import shutil

root = Path(__file__).resolve().parent.parent
assets = root / "store/assets"
assets.mkdir(parents=True, exist_ok=True)
image = Image.new("RGB", (440, 280))
pixels = image.load()
for y in range(280):
    for x in range(440):
        # Light and dark halves communicate the system-theme feature.
        t = x / 439
        pixels[x, y] = (int(18 + 9*t), int(93 - 60*t), int(171 - 105*t))
draw = ImageDraw.Draw(image)
draw.rounded_rectangle((38, 58, 171, 222), radius=16, fill=(230, 243, 255))
draw.rounded_rectangle((269, 58, 402, 222), radius=16, fill=(19, 28, 46))
for offset in (0, 1):
    left = 54 + offset * 231
    draw.rounded_rectangle((left, 82, left+98, 93), radius=5,
                           fill=(110, 168, 220) if not offset else (51, 102, 160))
    for row in range(3):
        y = 115 + row * 28
        draw.rounded_rectangle((left, y, left+98, y+17), radius=4,
                               fill=(192, 218, 242) if not offset else (40, 57, 80))
        draw.rounded_rectangle((left+7, y+5, left+67, y+11), radius=3,
                               fill=(92, 157, 216) if not offset else (96, 164, 224))
icon = Image.open(root / "icons/icon-128.png").convert("RGBA")
image.paste(icon, (156, 76), icon)
image.save(assets / "promo-440x280.png")
shutil.copyfile(root / "icons/icon-128.png", assets / "icon-128.png")
