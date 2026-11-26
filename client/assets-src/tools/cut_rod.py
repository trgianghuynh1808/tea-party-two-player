"""Cut the fishing-rod sprite out of the user-supplied rod sheet (T25).

    python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy
    /tmp/sprite-venv/bin/python cut_rod.py   # or: python3 cut_rod.py

rod-sheet-1.jpg (copied from .agents/attachments/T25/req-1.jpg into ../sheets/ when
missing) is a 980x980 grid of 9 pixel-art rods on a flat grey background (~#d2d3d5),
wrapped in a ~1px darker frame. The frame is trimmed first, or slice_sheet.py's
flat-background mask goes wrong (it samples the border colour). The top-left cell --
the straight rod -- is cut out with the background removed and saved tight-cropped at
native pixel size:

- client/public/assets/rod.png -- the one rod sprite for every level; the baked-in thin
  black line stays as the rod's short line, the per-level colour is drawn in PondView.

Also prints the two anchor points PondView needs (px in rod.png): the rod tip (topmost
pixel) and the bottom-left end of the baked-in line segment.
"""
import os
import shutil
import sys
import tempfile

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from slice_sheet import sprite_mask  # noqa: E402  (same folder)

ATTACH = os.path.join(HERE, "../../../.agents/attachments/T25")
SHEET = os.path.join(HERE, "../sheets/rod-sheet-1.jpg")
OUT = os.path.join(HERE, "../../public/assets/rod.png")

FRAME = 2  # the sheet's darker border, trimmed so the flat mask sees the real background

# Top-left cell (straight rod) in sheet coordinates, from the task sheet's estimate.
CELL = (120, 175, 285, 355)  # x0, y0, x1, y1
MIN_AREA = 4000  # each rod blob is ~5000 px; specks are < 300


def main():
    if not os.path.exists(SHEET):
        src = os.path.join(ATTACH, "req-1.jpg")
        if not os.path.exists(src):
            raise SystemExit(f"missing sheet: neither {SHEET} nor {src}")
        shutil.copy(src, SHEET)
    im = Image.open(SHEET).convert("RGB")
    trimmed = im.crop((FRAME,) * 2 + (im.width - FRAME, im.height - FRAME))

    # Flat-background mask; the frame is gone so the border colour is the true background.
    fd, tmp = tempfile.mkstemp(suffix=".png")
    os.close(fd)
    try:
        trimmed.save(tmp)
        _, mask = sprite_mask(tmp, "flat")
    finally:
        os.remove(tmp)

    lab, n = ndi.label(mask)
    objs = ndi.find_objects(lab)
    blobs = []
    for i in range(1, n + 1):
        sl = objs[i - 1]
        if sl is not None and (lab[sl] == i).sum() >= MIN_AREA:
            blobs.append((i, sl, int((lab[sl] == i).sum())))
    if len(blobs) != 9:
        raise SystemExit(f"expected the 9-rod grid, found {len(blobs)} big blobs")
    # Top-left rod: topmost row, then leftmost cell.
    i, (sy, sx), area = min(blobs, key=lambda b: (b[1][0].start, b[1][1].start))
    x0, y0, x1, y1 = sx.start + FRAME, sy.start + FRAME, sx.stop + FRAME, sy.stop + FRAME
    if not (CELL[0] <= x0 <= CELL[0] + 10 and CELL[1] <= y0 <= CELL[1] + 10
            and x1 <= CELL[2] and y1 <= CELL[3]):
        raise SystemExit(f"top-left blob at x {x0}-{x1}, y {y0}-{y1} is outside the cell {CELL}")

    rgba = np.asarray(trimmed.convert("RGBA")).copy()
    m = lab[sy, sx] == i
    rgba[sy, sx][..., 3] = np.where(m, rgba[sy, sx][..., 3], 0)
    ys, xs = np.nonzero(m)
    img = Image.fromarray(rgba[sy.start + ys.min():sy.start + ys.max() + 1,
                               sx.start + xs.min():sx.start + xs.max() + 1])
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT)

    a = np.asarray(img)[..., 3] > 0
    h, w = a.shape
    if a.sum() < MIN_AREA or a[0, 0] or a[0, -1] or a[-1, 0]:
        raise SystemExit("bad cut-out: too small or background left in the corners")
    tys, txs = np.nonzero(a)
    tip_y = int(tys.min())
    tip_x = int(txs[tys == tip_y].min())
    # Bottom-left end of the baked-in line: lowest pixel in the left 40% of the sprite.
    left = a[:, : int(w * 0.4)]
    lys, lxs = np.nonzero(left)
    line_y = int(lys.max())
    line_x = int(lxs[lys == line_y].min())
    if not (line_y < h - 10 and tip_x > w * 0.3):
        raise SystemExit("anchors not found: is this the straight rod cell?")

    print(f"{os.path.relpath(OUT, HERE)}  {w}x{h}  (sheet cell x {x0}-{x1}, y {y0}-{y1}, {area} px)")
    print(f"rod tip (topmost px): ({tip_x}, {tip_y})")
    print(f"line end (bottom-left of the baked-in line): ({line_x}, {line_y})")


if __name__ == "__main__":
    main()
