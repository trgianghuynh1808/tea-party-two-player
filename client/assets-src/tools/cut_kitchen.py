"""Cut the 3 kitchen furniture pieces (front/back/left) out of the purple-background sheet.

    .venv-art/bin/python cut_kitchen.py   # needs Pillow, NumPy, SciPy

Sheet client/assets-src/sheets/kitchen-sheet-1.jpeg (736x899) holds top-down kitchen furniture on a flat
purple background (~#8e87b0). Only the pieces drawn with a front, a back and a side view are used
(fridge, washing machine, wooden kitchen chair); the missing right view of each is the horizontal
mirror of its left view. The background is removed by colour distance from the corner colour plus a
border flood fill, with no resampling at all (pixel art must stay pixel-sharp; if a view ever needs
scaling use Image.NEAREST, never LANCZOS). Each view is written as an RGBA cut-out to
client/public/assets/decor/kitchen/<kind>_<view>.png (3 kinds x 4 views = 12 files).
"""
import os

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "../sheets")
OUT = os.path.join(HERE, "../../public/assets/decor/kitchen")

SHEET = "kitchen-sheet-1.jpeg"

# Crop boxes (left, top, right, bottom) in sheet px for the 3 available views; a 6 px margin is
# left around each box before the background is cut out. The other single-view pieces of the sheet
# (counter, stove, microwave, stools, open-door fridges) are skipped on purpose.
BOXES = {
    "fridge_kitchen": {
        "front": (172, 55, 250, 218),  # door with magnets
        "left": (52, 55, 128, 220),     # side panel
        "back": (295, 55, 372, 218),    # wire grid
    },
    "washer_kitchen": {
        "front": (52, 272, 128, 382),   # round porthole
        "left": (220, 265, 288, 382),    # side panel
        "back": (132, 272, 206, 382),    # hoses
    },
    "chair_kitchen": {
        "front": (145, 535, 188, 606),
        "left": (58, 535, 100, 606),
        "back": (470, 545, 513, 608),
    },
}

BG_TOL = 12      # colour distance counted as background
FRINGE_TOL = 30  # JPEG fringe near the flood-filled background is swept away with it
MARGIN = 6


def cutout_purple(a, bg):
    """Border-connected purple background becomes transparent; keep the largest blob (as cutout_white.py)."""
    dist = np.abs(a[..., :3].astype(int) - bg).max(-1)
    lab, _ = ndi.label(dist < BG_TOL)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bgm = np.isin(lab, list(border))
    bgm |= ndi.binary_dilation(bgm, iterations=2) & (dist < FRINGE_TOL)
    fg, n = ndi.label(~bgm)
    keep = fg == (int(np.argmax(ndi.sum(~bgm, fg, range(1, n + 1)))) + 1)
    # Close gaps inside the piece, but only with non-background pixels: holes that show the sheet
    # background (the fridge-back wire grid) stay transparent instead of turning purple.
    keep = ndi.binary_fill_holes(keep) & ~(dist < BG_TOL)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.nonzero(keep)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


os.makedirs(OUT, exist_ok=True)
sheet = np.asarray(Image.open(os.path.join(SHEETS, SHEET)).convert("RGBA")).copy()
h, w = sheet.shape[:2]
# One background colour for the whole sheet (its corners match), so every panel cuts with the same tolerance.
BG = np.median(sheet[[0, 0, -1, -1], [0, -1, 0, -1], :3], axis=0).astype(int)
written = []
for kind, boxes in BOXES.items():
    views = {}
    for view, (x0, y0, x1, y1) in boxes.items():
        panel = sheet[max(0, y0 - MARGIN):min(h, y1 + MARGIN), max(0, x0 - MARGIN):min(w, x1 + MARGIN)].copy()
        views[view] = Image.fromarray(cutout_purple(panel, BG))
    views["right"] = ImageOps.mirror(views["left"])  # right view = mirrored left view
    for view, img in views.items():
        out = os.path.join(OUT, f"{kind}_{view}.png")
        img.save(out)
        written.append(out)
        print(f"{kind}_{view}.png  {img.width}x{img.height}")

assert len(written) == 4 * len(BOXES), f"expected {4 * len(BOXES)} files, wrote {len(written)}"
for out in written:
    assert os.path.getsize(out) > 0, f"{out} is empty"
print(f"OK: {len(written)} non-empty files in {os.path.relpath(OUT, HERE)}")
