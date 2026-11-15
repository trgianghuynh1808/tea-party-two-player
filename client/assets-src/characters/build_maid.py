"""Turn the maid walk sheet (white background, 3 walk frames x 4 directions) into an evenly spaced,
transparent sprite sheet the game can slice.

    python build_maid.py   # needs Pillow, NumPy, SciPy; writes ../../public/assets/characters/maid.png

The source isn't on an exact grid (columns drift, feet spill into the next row), so each figure is cut out
as its own blob and re-packed into FRAME_W x FRAME_H frames: centred horizontally, feet on FEET_ROW.
Output rows: down, left, right, up. Columns: walk frames (step, stand, step).
White background connected to the image border is removed; white inside the outline (apron, headband) stays.
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
COLS, ROWS = 3, 4
WHITE_MIN = 225  # min(r, g, b) at or above this counts as background white
FRAME_W, FRAME_H = 40, 72
FEET_ROW = 70  # last row of the feet in every frame

src = np.asarray(Image.open(os.path.join(HERE, "maid-original.png")).convert("RGBA")).copy()
h, w = src.shape[:2]
light = src[..., :3].min(axis=-1) >= WHITE_MIN
lab, _ = ndi.label(light)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
bg = ndi.binary_dilation(bg, iterations=1) & (src[..., :3].min(axis=-1) >= WHITE_MIN - 30)  # soft white fringe
fg = ~bg
src[..., 3] = np.where(fg, 255, 0)

# One blob per figure: close small gaps (feet, hair strands) before labelling.
blobs, n = ndi.label(ndi.binary_closing(fg, iterations=2))
sizes = ndi.sum(fg, blobs, range(1, n + 1))
figures = [i + 1 for i in np.argsort(sizes)[::-1][: COLS * ROWS]]
boxes = [ndi.find_objects((blobs == i).astype(int))[0] for i in figures]
assert len(boxes) == COLS * ROWS, f"expected {COLS * ROWS} figures, found {len(boxes)}"
# Reading order: rows by vertical centre, then columns left to right.
boxes.sort(key=lambda b: (b[0].start + b[0].stop) / 2)
grid = [sorted(boxes[r * COLS:(r + 1) * COLS], key=lambda b: b[1].start) for r in range(ROWS)]

out = np.zeros((FRAME_H * ROWS, FRAME_W * COLS, 4), np.uint8)
for r, row in enumerate(grid):
    for c, (ys, xs) in enumerate(row):
        fig = src[ys, xs] * (blobs[ys, xs] > 0)[..., None]  # only this figure's pixels
        fh, fw = fig.shape[:2]
        assert fw <= FRAME_W and fh <= FEET_ROW + 1, f"figure {fw}x{fh} too big for the frame"
        ox = c * FRAME_W + (FRAME_W - fw) // 2
        oy = r * FRAME_H + FEET_ROW + 1 - fh
        region = out[oy:oy + fh, ox:ox + fw]
        np.copyto(region, fig, where=fig[..., 3:4] > 0)
        print(f"row {r} col {c}: {fw}x{fh}")

path = os.path.join(HERE, "../../public/assets/characters/maid.png")
Image.fromarray(out).save(path)
print(f"saved {path} ({out.shape[1]}x{out.shape[0]}, frames {FRAME_W}x{FRAME_H}, feet row {FEET_ROW})")
