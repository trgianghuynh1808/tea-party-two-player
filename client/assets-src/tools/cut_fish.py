"""Cut the fish sprites and the pond decorations out of the two fish sheets.

    python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy
    /tmp/sprite-venv/bin/python cut_fish.py   # or: python3 cut_fish.py

The sheets are the two user-supplied jpgs (copied from .agents/attachments/T22/
into ../sheets/ when missing): fish-sheet-1.jpg is a 6x6 grid of fish on a flat
grey background (~#6a6967), fish-sheet-2.jpg a 7x6 grid of sea creatures on flat
blue (~#3f8eac). Every cell holds exactly one sprite, so each blob of
slice_sheet.py's flat background mask maps to a (row, col) by its centre.

Outputs (all RGBA cut-outs, tight-cropped, native pixel size):
- client/public/assets/fish/<id>.png  -- 15 fish (13 from sheet 1, ca_rong/ca_map from sheet 2),
  each rotated (nearest-neighbour) so its long body axis is horizontal, head facing right
- client/public/assets/pond/<name>.png -- 9 pond decorations from sheet 2 (never rotated)
Rows/cols count from 1. The cell -> species/decor mapping follows the task sheet
(and each cell's dominant colour); FISH_FACING etc. is handled later by the game.
"""
import math
import os
import shutil
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from slice_sheet import sprite_mask  # noqa: E402  (same folder)

SHEETS = os.path.join(HERE, "../sheets")
ATTACH = os.path.join(HERE, "../../../.agents/attachments/T22")
OUT_FISH = os.path.join(HERE, "../../public/assets/fish")
OUT_POND = os.path.join(HERE, "../../public/assets/pond")

# sheet file -> (cols, rows, centre of cell (1,1), pitch between cell centres)
GRIDS = {
    "fish-sheet-1.jpg": (6, 6, (240.0, 240.0), 160.0),
    "fish-sheet-2.jpg": (7, 6, (210.5, 212.7), 142.9),
}

# (row, col) per sheet -> fish id. Existing ids keep their cell; new species take
# the cells listed in the task sheet.
FISH_CUTS = {
    "fish-sheet-1.jpg": {
        "ca_thu": (1, 1),       # new, blue mackerel
        "ca_ro": (1, 6),        # green
        "ca_chep": (2, 1),      # yellow-brown
        "ca_koi": (2, 3),       # red-white
        "ca_tre": (3, 2),       # grey spotted
        "luon": (3, 6),         # new, brown eel
        "ca_duoi": (4, 2),      # new, big grey-blue ray
        "ca_bon": (4, 6),       # new, brown flounder
        "ca_mat_trang": (5, 2), # new, steel-blue moonfish
        "ca_tram": (5, 4),      # red
        "ca_loc": (5, 6),       # olive
        "ca_he": (6, 2),        # silver
        "ca_nuc": (6, 3),       # new, golden puffer
    },
    "fish-sheet-2.jpg": {
        "ca_rong": (1, 1),      # swordfish (id kept from the old fish list)
        "ca_map": (2, 1),       # new, shark
    },
}

# Sheet 2 only: pond-bottom decorations (visual only, no interaction).
POND_CUTS = {
    "seaweed_brown": (3, 7),
    "seaweed_green": (3, 2),
    "jellyfish": (3, 4),
    "octopus": (3, 6),
    "crab": (4, 1),
    "seahorse": (4, 3),
    "shell": (4, 6),
    "starfish": (4, 7),
    "turtle": (5, 5),
}

# Long-bodied fish are drawn tilted on the sheets (head up-right ~30-45deg),
# which makes them look nose-up in the pond. Rotate those cut-outs so the body
# axis is horizontal; the head must stay on the right because PondView mirrors
# the sprite when the fish swims left.
NEAREST = getattr(Image, "Resampling", Image).NEAREST

# Flat/round/wriggly species have no meaningful body axis: keep them as drawn
# unless ANGLE_OVERRIDE says otherwise.
ROUND_FISH = {"ca_duoi", "ca_mat_trang", "ca_nuc", "luon"}

# Hand-picked rotation (deg, PIL counter-clockwise) per fish id; absent -> auto.
ANGLE_OVERRIDE = {}


def level_angle(img):
    """PCA angle (deg) that levels the blob's long axis; 0 when too round.

    Coordinates are image-style (y grows down), so a fish with its head up on
    the right yields a negative angle and PIL's rotate() (counter-clockwise on
    screen) brings it back down. Elongation check first: near-circular blobs
    (eigenvalue ratio <= 1.6) have no meaningful axis. Result in (-90, 90].
    """
    a = np.asarray(img)
    ys, xs = np.nonzero(a[..., 3] > 0)
    x = xs.astype(float) - xs.mean()
    y = ys.astype(float) - ys.mean()
    sxx, syy, sxy = (x * x).mean(), (y * y).mean(), (x * y).mean()
    tr = sxx + syy
    lam = math.sqrt(max(tr * tr / 4 - (sxx * syy - sxy * sxy), 0.0))
    if (tr / 2 + lam) / max(tr / 2 - lam, 1e-9) <= 1.6:
        return 0.0
    return 0.5 * math.degrees(math.atan2(2 * sxy, sxx - syy))


def blobs_by_cell(sheet_path, cols, rows, first, pitch):
    """sprite_mask (flat) -> {(row, col): (slice, boolean mask of that blob)}."""
    im, mask = sprite_mask(sheet_path, "flat")
    lab, _ = ndi.label(mask)
    out = {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is None:
            continue
        m = lab[sl] == i
        if m.sum() < 300:  # JPEG specks, same floor as slice_sheet's MIN_AREA
            continue
        cx = (sl[1].start + sl[1].stop) / 2
        cy = (sl[0].start + sl[0].stop) / 2
        c = int(round((cx - first[0]) / pitch)) + 1
        r = int(round((cy - first[1]) / pitch)) + 1
        if not (1 <= r <= rows and 1 <= c <= cols):
            raise ValueError(f"blob at ({cx:.0f},{cy:.0f}) outside the {rows}x{cols} grid")
        if (r, c) in out:
            raise ValueError(f"two blobs claim cell r{r}c{c} of {sheet_path}")
        out[(r, c)] = (sl, m)
    return im, out


def cut(im, blob):
    """Keep only the blob's pixels, alpha 0 elsewhere, tightly cropped."""
    sl, m = blob
    rgba = np.asarray(im).copy()
    rgba[sl][..., 3] = np.where(m, rgba[sl][..., 3], 0)
    ys, xs = np.nonzero(m)
    sub = rgba[sl][ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    # A sprite is solid art: holes fully enclosed by the sprite stay filled
    # (already done by sprite_mask), so only check it actually has pixels.
    if (sub[..., 3] > 0).sum() < 300:
        raise ValueError("empty cut-out")
    return Image.fromarray(sub)


def main():
    for name in GRIDS:
        src = os.path.join(ATTACH, "req-" + name.split("fish-sheet-")[-1])
        dst = os.path.join(SHEETS, name)
        if not os.path.exists(dst) and os.path.exists(src):
            shutil.copy(src, dst)
        if not os.path.exists(dst):
            raise SystemExit(f"missing sheet {dst}")
    os.makedirs(OUT_FISH, exist_ok=True)
    os.makedirs(OUT_POND, exist_ok=True)

    written = []
    for name, (cols, rows, first, pitch) in GRIDS.items():
        im, cells = blobs_by_cell(os.path.join(SHEETS, name), cols, rows, first, pitch)
        targets = {**FISH_CUTS.get(name, {})}
        if name == "fish-sheet-2.jpg":
            targets.update(POND_CUTS)
        for out_name, cell in targets.items():
            if cell not in cells:
                raise ValueError(f"{name}: no sprite found at r{cell[0]}c{cell[1]}")
            folder = OUT_POND if out_name in POND_CUTS else OUT_FISH
            img = cut(im, cells[cell])
            if folder == OUT_FISH:
                angle = ANGLE_OVERRIDE.get(out_name)
                if angle is None:
                    angle = 0.0 if out_name in ROUND_FISH else level_angle(img)
                if angle:
                    img = img.rotate(angle, resample=NEAREST, expand=True)
                    img = img.crop(img.getchannel("A").getbbox())
                print(f"  {out_name}: level {angle:+.1f} deg")
            out = os.path.join(folder, out_name + ".png")
            img.save(out)
            written.append(out)
            print(f"{out_name}.png  {img.width}x{img.height} -> {os.path.relpath(out, HERE)}")

    n_fish = sum(len(v) for v in FISH_CUTS.values())
    assert len(written) == n_fish + len(POND_CUTS), f"expected {n_fish + len(POND_CUTS)} files, wrote {len(written)}"
    for out in written:
        assert os.path.getsize(out) > 0, f"{out} is empty"
        a = np.asarray(Image.open(out))
        assert a[..., 3].max() > 0, f"{out} is fully transparent"
        # corners of a cut-out must be transparent (background removed)
        assert a[0, 0, 3] == 0 and a[-1, -1, 3] == 0, f"{out} has opaque corners"
    print(f"OK: {len(written)} cut-outs in {os.path.relpath(OUT_FISH, HERE)} and {os.path.relpath(OUT_POND, HERE)}")


if __name__ == "__main__":
    main()
