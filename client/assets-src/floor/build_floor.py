"""Crop the wood floor art (black frame + rounded corners removed) to the 960x600 shop floor.

    python build_floor.py   # needs Pillow; writes client/public/assets/floor/wood.jpg (no transparency needed, much smaller than PNG)
"""
import os

from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
WORLD_W, WORLD_H = 960, 600

src = Image.open(os.path.join(HERE, "wood-original.png")).convert("RGB")
# Wood area is x 134..1454, y 42..849; 22 px inset clears the rounded corners.
top, bottom = 64, 828
height = bottom - top
width = round(height * WORLD_W / WORLD_H)  # keep the 960:600 aspect ratio (no stretching)
cx = (134 + 1454) // 2
box = (cx - width // 2, top, cx - width // 2 + width, bottom)
out = os.path.join(HERE, "../../public/assets/floor/wood.jpg")
os.makedirs(os.path.dirname(out), exist_ok=True)
src.crop(box).resize((WORLD_W, WORLD_H), Image.LANCZOS).save(out, quality=88)
print("crop", box, "->", out)
