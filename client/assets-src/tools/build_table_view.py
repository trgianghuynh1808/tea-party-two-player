"""Cut the wicker guest table ("Bàn khách") out of its rotation sheet (2x2 panels on a flat grey background).

    python build_table_view.py   # needs Pillow, NumPy, SciPy

Only the front view (panel 2) is used: the table is round, so the side views look the same, and the
"top" view is drawn in a different perspective than the game's 3/4 view.
Writes client/public/assets/decor/wicker_table.png (table + its shadow, like the woven chair views).
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from slice_sheet import FLAT_TOLERANCE, HOLE_MIN_AREA, HOLE_TOLERANCE  # noqa: E402

SHEET = os.path.join(HERE, "../sheets/table-wicker-4views.png")
OUT = os.path.join(HERE, "../../public/assets/decor/wicker_table.png")
FRONT_PANEL = (298, 60, 562, 415)  # left, top, right, bottom: below the panel number, above the caption

a = np.asarray(Image.open(SHEET).convert("RGBA").crop(FRONT_PANEL)).copy()
rgb = a[..., :3].astype(float)
bg = np.median(np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]]), axis=0)
dist = np.linalg.norm(rgb - bg, axis=-1)
solid = ndi.binary_closing(dist > FLAT_TOLERANCE, iterations=1)
mask = ndi.binary_fill_holes(solid)
holes, n = ndi.label(mask & ~solid)
for i in range(1, n + 1):  # background seen between the legs
    hole = holes == i
    if hole.sum() >= HOLE_MIN_AREA and np.median(dist[hole]) < HOLE_TOLERANCE:
        mask[hole] = False
lab, n = ndi.label(mask)
keep = lab == (int(np.argmax(ndi.sum(mask, lab, range(1, n + 1)))) + 1)
a[..., 3] = np.where(keep, 255, 0)
ys, xs = np.nonzero(keep)
Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(OUT)
print(f"{os.path.basename(OUT)}  {xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1}")
