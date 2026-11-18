"""Turn a 4x4 character walk sheet (white background, upscaled pixel art) into a transparent sprite sheet
with the same frame layout and body size as the maid (see build_maid.py).

    python build_walk_sheet.py <name>   # needs Pillow, NumPy, SciPy
    # reads <name>-original.png, writes ../../public/assets/characters/<name with - as _>.png
    # e.g. young-master, schoolboy, schoolgirl

Source rows: 0 = misc poses (unused), 1 = walk down, 2 = walk right, 3 = walk up; 4 walk frames each.
Output rows: down, left (mirrored right), right, up. Columns: walk frames (step, stand, step).
Every figure is scaled by the same factor so the tallest is BODY_H px, centred horizontally, feet on FEET_ROW.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = sys.argv[1]
SRC_COLS, SRC_ROWS = 4, 4
WHITE_MIN = 225  # min(r, g, b) at or above this counts as background white
MIN_FRAME_W, FRAME_H = 40, 72  # same as the maid (wider frames only if a figure needs it)
FEET_ROW = 70  # last row of the feet in every frame
BODY_H = 61  # tallest figure after scaling (maid figures are 60-63 px)
USE_COLS = [0, 1, 2]  # source walk frames kept (1 = standing)

src = np.asarray(Image.open(os.path.join(HERE, f"{NAME}-original.png")).convert("RGBA")).copy()
light = src[..., :3].min(axis=-1) >= WHITE_MIN
lab, _ = ndi.label(light)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
bg = ndi.binary_dilation(bg, iterations=2) & (src[..., :3].min(axis=-1) >= WHITE_MIN - 40)  # soft white fringe
fg = ~bg
src[..., 3] = np.where(fg, 255, 0)



def cuts(empty, n):
    """Split points between grid cells: the empty (all background) line closest to each even split."""
    lines = np.where(empty)[0]
    size = len(empty)
    return [0] + [int(lines[np.argmin(np.abs(lines - k * size / n))]) for k in range(1, n)] + [size]


# Figures can nearly touch, so cut the sheet into cells along empty lines, then take each cell's figure.
row_cuts = cuts(~fg.any(axis=1), SRC_ROWS)
col_cuts = cuts(~fg.any(axis=0), SRC_COLS)
blobs, n = ndi.label(fg)
sizes = ndi.sum(fg, blobs, range(n + 1))
fg_clean = fg & (sizes[blobs] >= 30)  # drop stray specks
grid = []
for r in range(SRC_ROWS):
    row = []
    for c in range(SRC_COLS):
        cell = np.zeros_like(fg_clean)
        cell[row_cuts[r]:row_cuts[r + 1], col_cuts[c]:col_cuts[c + 1]] = True
        mask = fg_clean & cell
        assert mask.any(), f"empty cell {r},{c}"
        row.append((ndi.find_objects(mask.astype(int))[0], mask))
    grid.append(row)

walk_rows = grid[1:]  # down, right, up
scale = BODY_H / max(ys.stop - ys.start for row in walk_rows for (ys, _), _ in row)


def shrink(box):
    (ys, xs), mask = box
    fig = src[ys, xs].copy()
    fig[..., 3] = np.where(mask[ys, xs], fig[..., 3], 0)
    fh, fw = fig.shape[:2]
    size = (max(1, round(fw * scale)), max(1, round(fh * scale)))
    # Premultiply so transparent pixels don't bleed white into the edges, then box-filter down.
    rgb = fig[..., :3].astype(float) * (fig[..., 3:4] / 255)
    a = fig[..., 3].astype(float)
    rgb_s = np.stack([np.asarray(Image.fromarray(rgb[..., k].astype(np.float32)).resize(size, Image.BOX)) for k in range(3)], -1)
    a_s = np.asarray(Image.fromarray(a.astype(np.float32)).resize(size, Image.BOX))
    out = np.zeros((size[1], size[0], 4), np.uint8)
    keep = a_s >= 128  # hard pixel-art edge
    out[..., :3] = np.clip(rgb_s / np.maximum(a_s[..., None], 1) * 255, 0, 255).astype(np.uint8)
    out[..., 3] = np.where(keep, 255, 0)
    out[~keep] = 0
    return out


frames = {
    "down": [shrink(walk_rows[0][c]) for c in USE_COLS],
    "right": [shrink(walk_rows[1][c]) for c in USE_COLS],
    "up": [shrink(walk_rows[2][c]) for c in USE_COLS],
}
frames["left"] = [f[:, ::-1] for f in frames["right"]]
widest = max(f.shape[1] for fs in frames.values() for f in fs)
FRAME_W = max(MIN_FRAME_W, widest + 2 + widest % 2)

out = np.zeros((FRAME_H * 4, FRAME_W * len(USE_COLS), 4), np.uint8)
for r, direction in enumerate(["down", "left", "right", "up"]):
    for c, fig in enumerate(frames[direction]):
        fh, fw = fig.shape[:2]
        assert fw <= FRAME_W and fh <= FEET_ROW + 1, f"figure {fw}x{fh} too big for the frame"
        ox = c * FRAME_W + (FRAME_W - fw) // 2
        oy = r * FRAME_H + FEET_ROW + 1 - fh
        region = out[oy:oy + fh, ox:ox + fw]
        np.copyto(region, fig, where=fig[..., 3:4] > 0)
        print(f"{direction} col {c}: {fw}x{fh}")

path = os.path.join(HERE, f"../../public/assets/characters/{NAME.replace('-', '_')}.png")
Image.fromarray(out).save(path)
print(f"saved {path} ({out.shape[1]}x{out.shape[0]}, frames {FRAME_W}x{FRAME_H}, feet row {FEET_ROW}, scale {scale:.3f})")
