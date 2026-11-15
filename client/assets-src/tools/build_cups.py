"""Build the in-game cup sprites (client/public/assets/cups/) from the sliced item tiles.

    python build_cups.py   # needs Pillow + NumPy + SciPy (see slice_sheet.py)

- Cups in items/tiles/ sit on a coloured square tile: the tile (frame + flat fill) is flood-filled away
  from the border, leaving only the cup.
- cup_milk_tea is the black-tea cup with its liquid recoloured to milk-tea brown.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, "../../public/assets")
OUT = os.path.join(ASSETS, "cups")
FRAME = 12  # tile frame (dark outline) thickness in px, generous
FILL_TOLERANCE = 38  # max RGB distance from the tile fill colour


def untile(path):
    a = np.asarray(Image.open(path).convert("RGBA")).astype(np.int32)
    h, w = a.shape[:2]
    rgb = a[..., :3]
    # Tile fill colour: median of a ring just inside the frame.
    ring = np.zeros((h, w), bool)
    ring[FRAME:FRAME + 4, FRAME:w - FRAME] = ring[h - FRAME - 4:h - FRAME, FRAME:w - FRAME] = True
    ring[FRAME:h - FRAME, FRAME:FRAME + 4] = ring[FRAME:h - FRAME, w - FRAME - 4:w - FRAME] = True
    fill = np.median(rgb[ring & (a[..., 3] > 0)], axis=0)
    near_fill = np.linalg.norm(rgb - fill, axis=-1) < FILL_TOLERANCE
    yy, xx = np.mgrid[:h, :w]
    in_frame = np.minimum(np.minimum(xx, w - 1 - xx), np.minimum(yy, h - 1 - yy)) < FRAME
    passable = (a[..., 3] == 0) | near_fill | in_frame
    # Background = passable pixels connected to the border.
    lab, _ = ndi.label(passable)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    keep = ndi.binary_opening(~bg, iterations=1)  # drop 1-px leftovers of the tile
    lab2, n = ndi.label(keep)
    if n > 1:  # keep the cup (largest blob) only
        sizes = ndi.sum(keep, lab2, range(1, n + 1))
        keep = lab2 == (int(np.argmax(sizes)) + 1)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.nonzero(keep)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1].astype(np.uint8)


def recolor_liquid(a, src_rgb, dst_rgb, tolerance=70):
    """Shift pixels close to the liquid colour towards a new colour, keeping their shading."""
    a = a.astype(np.int32).copy()
    rgb = a[..., :3]
    d = np.linalg.norm(rgb - np.array(src_rgb), axis=-1)
    m = (d < tolerance) & (a[..., 3] > 0)
    shifted = rgb + (np.array(dst_rgb) - np.array(src_rgb))
    rgb[m] = np.clip(shifted[m], 0, 255)
    return a.astype(np.uint8)


def save(name, arr):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(arr).save(os.path.join(OUT, name + ".png"))
    print(f"cups/{name}.png  {arr.shape[1]}x{arr.shape[0]}")


tiles = os.path.join(ASSETS, "items/tiles")
cups = {name: untile(os.path.join(tiles, f"cup_{name}.png")) for name in ("empty", "black_tea", "green_tea")}
for name, arr in cups.items():
    save(name, arr)

# Black-tea liquid colour: the most common saturated brown in that cup.
bt = cups["black_tea"].astype(np.int32)
px = bt[(bt[..., 3] > 0)][:, :3]
brown = px[(px[:, 0] > px[:, 2] + 40) & (px[:, 0] < 200)]
liquid = np.median(brown, axis=0)
print("black tea liquid rgb", liquid.astype(int))
save("milk_tea", recolor_liquid(cups["black_tea"], liquid, (198, 156, 109)))  # 0xc69c6d
