"""Cut the 4 views of 8 furniture items out of their 4-view sheets (2x2 panels on a white background).

    .venv-art/bin/python build_furniture_views.py   # needs Pillow, NumPy, SciPy

Each sheet client/assets-src/sheets/views/<kind>-4views.png holds the front/back/left/right artwork.
The generator's ✦ watermark (a translucent white veil, not near-white pixels) is inpainted by diffusion first,
then the white background is cut out (as in cutout_white.py),
each view is rescaled to a common pixel/world ratio and written to
client/public/assets/decor/views/<kind>_<view>.png (8 kinds x 4 views = 32 files).
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "../sheets/views")
OUT = os.path.join(HERE, "../../public/assets/decor/views")

# Crop boxes (left, top, right, bottom) in sheet px, one panel per box; a 6 px margin is left around each.
BOXES = {
    "nightstand_clock": {
        "front": (179, 35, 482, 440),
        "back": (732, 35, 1035, 440),
        "left": (734, 461, 1023, 872),
        "right": (190, 461, 479, 872),
    },
    "bookshelf": {
        "front": (202, 39, 521, 437),
        "back": (673, 39, 992, 437),
        "left": (297, 461, 417, 872),
        "right": (764, 461, 884, 872),
    },
    "bed_plaid": {
        "front": (49, 30, 518, 446),
        "back": (618, 96, 1086, 436),
        "left": (581, 553, 1122, 862),
        "right": (14, 553, 555, 862),
    },
    "tv_stand": {
        "front": (161, 45, 529, 438),
        "back": (693, 45, 1065, 437),
        "left": (261, 462, 422, 871),
        "right": (807, 462, 968, 871),
    },
    "wardrobe_open": {
        "front": (44, 53, 560, 860),
        "back": (654, 53, 1143, 434),
        "left": (910, 465, 1132, 860),
        "right": (661, 465, 837, 860),
    },
    "sofa_lilac": {
        "front": (18, 105, 596, 367),
        "back": (627, 94, 1182, 367),
        "left": (785, 472, 1159, 856),
        "right": (42, 472, 405, 856),
    },
    "desk_pc": {
        "front": (80, 51, 556, 455),
        "back": (645, 51, 1120, 455),
        "left": (113, 461, 522, 866),
        "right": (683, 461, 1065, 866),
    },
    "dining_table": {
        "front": (43, 33, 579, 437),
        "back": (622, 33, 1158, 437),
        "left": (132, 438, 496, 845),
        "right": (704, 438, 1068, 845),
    },
}

# The ✦ watermark (a translucent white veil) sits over these views at these sheet-px centres;
# it is inpainted before cutting out the background.
STARS = {
    "wardrobe_open": (1080, 775),
    "sofa_lilac": (1080, 775),
    "bed_plaid": (1015, 821),
}
STAR_RADIUS = 28  # |dx| + |dy| <= R covers the star; the mask is dilated 3 px more

# Views drawn at a different scale than the front: rescale so every view shares the pixel/world ratio
# (the wardrobe's front/back panels are drawn about twice the size of its side panels;
# the sofa's side panels are drawn ~45% taller than its front).
SCALE = {
    "wardrobe_open": {"front": 0.49, "back": 0.52},
    "sofa_lilac": {"left": 0.68, "right": 0.68},
}

WHITE_MIN, WHITE_SPREAD, FRINGE_MIN = 238, 14, 215  # as in cutout_white.py
MARGIN = 6


def inpaint_star(a, center):
    """Erase the ✦ watermark: refill the masked diamond from its 4 neighbours by diffusion (~300 sweeps).

    The star is a translucent white layer, so the masked pixels are repeatedly replaced with the average
    of their 4 neighbours (red/black checkerboard order so each sweep carries the fill across the mask);
    pixels outside the mask never change.
    """
    h, w = a.shape[:2]
    cx, cy = center
    yy, xx = np.mgrid[0:h, 0:w]
    mask = ndi.binary_dilation(np.abs(xx - cx) + np.abs(yy - cy) <= STAR_RADIUS, iterations=3)
    rgb = a[..., :3].astype(float)
    ys, xs = np.nonzero(mask)
    y0, y1 = max(ys.min() - 2, 0), min(ys.max() + 3, h)
    x0, x1 = max(xs.min() - 2, 0), min(xs.max() + 3, w)
    sub = rgb[y0:y1, x0:x1]
    checker = (np.add.outer(np.arange(y1 - y0), np.arange(x1 - x0)) & 1).astype(bool)
    for _ in range(300):
        for parity in (False, True):
            inner = (mask[y0:y1, x0:x1] & (checker == parity))[1:-1, 1:-1]
            avg = (sub[:-2, 1:-1] + sub[2:, 1:-1] + sub[1:-1, :-2] + sub[1:-1, 2:]) / 4.0
            sub[1:-1, 1:-1][inner] = avg[inner]
    a[..., :3] = rgb.astype(a.dtype)


def cutout_white(a):
    """As cutout_white.py: border-connected white becomes transparent, keep the largest blob, drop the light fringe."""
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) >= WHITE_MIN) & (rgb.max(-1) - rgb.min(-1) <= WHITE_SPREAD)
    lab, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg |= ndi.binary_dilation(bg) & (rgb.min(-1) >= FRINGE_MIN)
    fg, n = ndi.label(~bg)
    keep = fg == (int(np.argmax(ndi.sum(~bg, fg, range(1, n + 1)))) + 1)
    keep = ndi.binary_fill_holes(keep)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.nonzero(keep)
    return a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


os.makedirs(OUT, exist_ok=True)
written = []
for kind, boxes in BOXES.items():
    sheet = np.asarray(Image.open(os.path.join(SHEETS, f"{kind}-4views.png")).convert("RGBA")).copy()
    if kind in STARS:
        inpaint_star(sheet, STARS[kind])
    h, w = sheet.shape[:2]
    for view, (x0, y0, x1, y1) in boxes.items():
        panel = sheet[max(0, y0 - MARGIN):min(h, y1 + MARGIN), max(0, x0 - MARGIN):min(w, x1 + MARGIN)].copy()
        img = Image.fromarray(cutout_white(panel))
        f = SCALE.get(kind, {}).get(view, 1.0)
        if f != 1.0:
            img = img.resize((max(1, round(img.width * f)), max(1, round(img.height * f))), Image.LANCZOS)
        out = os.path.join(OUT, f"{kind}_{view}.png")
        img.save(out)
        written.append(out)
        print(f"{kind}_{view}.png  {img.width}x{img.height}")

assert len(written) == 4 * len(BOXES), f"expected {4 * len(BOXES)} files, wrote {len(written)}"
for out in written:
    assert os.path.getsize(out) > 0, f"{out} is empty"
print(f"OK: {len(written)} non-empty files in {os.path.relpath(OUT, HERE)}")
