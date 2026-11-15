"""Cut the 4 views of the woven chair out of its rotation sheet (2x2 panels on a flat grey background).

    python build_chair_views.py   # needs Pillow, NumPy, SciPy

Writes client/public/assets/decor/woven_chair_{front,back,left,right}.png. Each panel is cropped above its
caption, the panel colour is removed and only the largest blob (the chair + its shadow) is kept.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from slice_sheet import FLAT_TOLERANCE, HOLE_MIN_AREA, HOLE_TOLERANCE  # noqa: E402

SHEET = os.path.join(HERE, "../sheets/chair-woven-4views.png")
OUT = os.path.join(HERE, "../../public/assets/decor")
# (name, (left, top, right, bottom)) inside each panel, above the caption line.
PANELS = [
    ("front", (16, 16, 280, 418)),
    ("back", (298, 16, 562, 418)),
    ("left", (16, 584, 280, 964)),
    ("right", (298, 584, 562, 964)),
]

# The image generator's ✦ watermark sits on the bottom of the right view, partly over the front leg.
WATERMARK = (464, 912, 508, 956)  # left, top, right, bottom in sheet px
LEG_LEFT = 491  # the leg starts here; left of it the star is on the panel background
LEG_PATCH_OFFSET = 45  # repaint the leg from the same column this far above (same wood, no star)


def remove_watermark(sheet):
    a = np.asarray(sheet).copy()
    x0, y0, x1, y1 = WATERMARK
    panel_bg = np.median(a[y0:y1, x0 - 20:x0 - 10, :3].reshape(-1, 3), axis=0)
    # Left of the leg: only the star's pixels (light, colourless grey/white), so the brown rung stays intact.
    region = a[y0:y1, x0:LEG_LEFT, :3]
    rgb = region.astype(int)
    star = (rgb.min(axis=-1) > 120) & (rgb.max(axis=-1) - rgb.min(axis=-1) < 25)
    region[star] = panel_bg
    a[y0:y1, LEG_LEFT:x1] = a[y0 - LEG_PATCH_OFFSET:y1 - LEG_PATCH_OFFSET, LEG_LEFT:x1]
    return Image.fromarray(a)


sheet = remove_watermark(Image.open(SHEET).convert("RGBA"))
for name, box in PANELS:
    a = np.asarray(sheet.crop(box)).copy()
    rgb = a[..., :3].astype(float)
    bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
    dist = np.linalg.norm(rgb - bg, axis=-1)
    solid = ndi.binary_closing(dist > FLAT_TOLERANCE, iterations=1)
    mask = ndi.binary_fill_holes(solid)
    holes, n = ndi.label(mask & ~solid)
    for i in range(1, n + 1):  # background seen between the rungs
        hole = holes == i
        if hole.sum() >= HOLE_MIN_AREA and np.median(dist[hole]) < HOLE_TOLERANCE:
            mask[hole] = False
    lab, n = ndi.label(mask)
    keep = lab == (int(np.argmax(ndi.sum(mask, lab, range(1, n + 1)))) + 1)  # drop the panel number
    a[..., 3] = np.where(keep, 255, 0)
    ys, xs = np.nonzero(keep)
    out = os.path.join(OUT, f"woven_chair_{name}.png")
    Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(out)
    print(f"{os.path.basename(out)}  {xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1}")
