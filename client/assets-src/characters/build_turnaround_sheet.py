"""Turn a 4-view character turnaround (be background, upscaled pixel art) into a transparent
3-column walk sprite sheet with the same frame size as the maid (see build_walk_sheet.py).

    python build_turnaround_sheet.py [name]   # needs Pillow, NumPy, SciPy; defaults to pink-girl
    # reads <name>-original.png, writes ../../public/assets/characters/<name with - as _>.png

Source figures left to right: front, left (face turned LEFT), back, right (face turned RIGHT).
Output rows: down (front), left, right, up (back). Columns: step, stand, step — the source has
only one pose per direction, so walk_frames() lifts/shifts the leg region of that pose into two
extra walk frames. The left/right rows come straight from the matching side view, never mirrored.
Every figure is scaled by the same factor so the tallest is BODY_H px, centred horizontally, feet
on FEET_ROW.
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
NAME = sys.argv[1] if len(sys.argv) > 1 else "pink-girl"
BG_TOL = 20  # max-channel colour distance from the be corner colour that still counts as background
MIN_FRAME_W, FRAME_H = 40, 72  # same as the maid (wider frames only if a figure needs it)
FEET_ROW = 70  # last row of the feet in every frame
BODY_H = 61  # tallest figure after scaling (maid figures are 60-63 px)

src = np.asarray(Image.open(os.path.join(HERE, f"{NAME}-original.png")).convert("RGBA")).copy()
# The background is one flat be tone: take it from the image corners and mask by colour distance,
# then keep only the blobs that reach the image border. No fringe dilation around the background:
# skin highlights land within ~21 of the be tone and mid-tone skin within ~60, so a dilation would
# eat the face/cheeks/hands (it hollowed out the left-facing figure), and the source outline
# already touches the flat background directly — there is no soft fringe to trim.
corners = np.stack([src[0, 0, :3], src[0, -1, :3], src[-1, 0, :3], src[-1, -1, :3]])
be = corners.mean(axis=0)
dist = np.abs(src[..., :3].astype(int) - be).max(axis=-1)
bgish = dist <= BG_TOL
lab, _ = ndi.label(bgish)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
fg = ~bg
src[..., 3] = np.where(fg, 255, 0)

# Drop stray specks so JPEG noise cannot bridge the gap between two figures.
blobs, n = ndi.label(fg)
sizes = ndi.sum(fg, blobs, range(n + 1))
fg_clean = fg & (sizes[blobs] >= 30)

# The four figures sit side by side: split them along empty columns.
occ = fg_clean.any(axis=0)
groups, start = [], None
for x in range(occ.size):
    if occ[x] and start is None:
        start = x
    elif not occ[x] and start is not None:
        groups.append((start, x))
        start = None
if start is not None:
    groups.append((start, occ.size))
groups = [g for g in groups if g[1] - g[0] >= 20]  # ignore slivers
assert len(groups) == 4, f"expected 4 figures, found {len(groups)}"

figs = []
for x0, x1 in groups:
    cell = np.zeros_like(fg_clean)
    cell[:, x0:x1] = True
    mask = fg_clean & cell
    assert mask.any(), f"empty figure at columns {x0}-{x1}"
    figs.append((ndi.find_objects(mask.astype(int))[0], mask))

scale = BODY_H / max(ys.stop - ys.start for (ys, _), _ in figs)


def shrink(box):
    (ys, xs), mask = box
    fig = src[ys, xs].copy()
    fig[..., 3] = np.where(mask[ys, xs], fig[..., 3], 0)
    fh, fw = fig.shape[:2]
    size = (max(1, round(fw * scale)), max(1, round(fh * scale)))
    # Premultiply so transparent pixels don't bleed be into the edges, then box-filter down.
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


front, left, back, right = (shrink(f) for f in figs)  # source order: front, left, back, right
frames = {"down": front, "left": left, "right": right, "up": back}
widest = max(f.shape[1] for f in frames.values())
FRAME_W = max(MIN_FRAME_W, widest + 2 + widest % 2)

LEG_ROWS = 15  # rows from the dress hem down to the soles that swing when walking


def paste(dst, part, y0, x0):
    """Copy part into dst at row y0 / column x0, clipped to bounds, opaque pixels only."""
    h, w = part.shape[:2]
    r0, r1 = max(y0, 0), min(y0 + h, dst.shape[0])
    c0, c1 = max(x0, 0), min(x0 + w, dst.shape[1])
    if r0 >= r1 or c0 >= c1:
        return
    src = part[r0 - y0:r1 - y0, c0 - x0:c1 - x0]
    np.copyto(dst[r0:r1, c0:c1], src, where=src[..., 3:4] > 0)


def walk_frames(fig, direction):
    """Split one standing pose into (step_a, stand, step_b).

    The leg region (LEG_ROWS rows above the soles) is split at its middle column. Down/up
    lift one half 2 px while the other stays planted (step_a lifts the left foot, step_b the
    right). Left/right shove the front half 2 px along the facing axis and the back half the
    other way, both lifted 1 px, and step_b swaps the two halves' roles. The body above the
    legs is pasted last so the lifted shins tuck under the dress hem instead of punching
    through it. Alpha stays hard 0/255 and no foot drops below the stand pose's soles.
    """
    fh, fw = fig.shape[:2]
    leg0 = fh - LEG_ROWS
    xs = np.where((fig[leg0:, ..., 3] > 0).any(axis=0))[0]
    split = (xs[0] + xs[-1] + 1) // 2  # boundary between the two leg halves
    near, far = slice(0, split), slice(split, fw)  # left/right halves for down and up
    if direction in ("down", "up"):
        moves_a = [(near, -2, 0), (far, 0, 0)]
        moves_b = [(near, 0, 0), (far, -2, 0)]
    else:
        push = 2 if direction == "right" else -2  # front half slides along the facing axis
        front, back = (near, far) if direction == "left" else (far, near)
        moves_a = [(back, -1, -push), (front, -1, push)]
        moves_b = [(back, -1, push), (front, -1, -push)]

    def build(moves):
        out = np.zeros_like(fig)
        legs = fig[leg0:, ...]
        for cols, dy, dx in moves:  # back half first so the front half overlaps it
            paste(out, legs[:, cols, :], leg0 + dy, cols.start + dx)
        paste(out, fig[:leg0, ...], 0, 0)  # dress hem covers the tucked shins
        return out

    return build(moves_a), fig, build(moves_b)


out = np.zeros((FRAME_H * 4, FRAME_W * 3, 4), np.uint8)
for r, direction in enumerate(["down", "left", "right", "up"]):
    for c, fig in enumerate(walk_frames(frames[direction], direction)):
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
