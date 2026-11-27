"""Cut the 9 seating pieces out of the white-background sheet ../sheets/seating-sheet-2.jpg.

The pieces sit side by side on flat white, so each hand-picked box only needs the white
removed, the way cutout_white.py does it: near-white pixels flood-filled in from the box
edges (white enclosed by an outline, e.g. between a ladder chair's rungs, stays
transparent), a 1 px light fringe along the cut cleared, only the biggest blob kept
(drops neighbour slivers), then the pixel-art resize from cut_bedroom.py (whole-pixel
NEAREST upscale, LANCZOS down). The output height is 2x the in-game imageHeight.

Needs Pillow, NumPy and SciPy. From client/assets-src/tools/:
    .venv-art/bin/python cut_seating.py ../sheets ../../public/assets/decor          # every piece
    .venv-art/bin/python cut_seating.py ../sheets ../../public/assets/decor sofa_sky  # one piece
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WHITE_MIN, WHITE_SPREAD, FRINGE_MIN = 238, 14, 215

# name -> (box left, top, right, bottom, h) - h = 2x the imageHeight from the T32 table.
# The pieces cut off at the sheet's right edge (red, yellow, brown) are not listed.
CUTS = {
    "armchair_green": ((2, 60, 146, 242), 104),
    "sofa_leather": ((184, 60, 466, 244), 104),
    "recliner_green": ((510, 60, 670, 276), 120),
    "armchair_black": ((32, 288, 214, 472), 100),
    "armchair_orange": ((264, 288, 410, 456), 92),
    "sofa_sky": ((442, 312, 672, 484), 96),
    "sofa_cream": ((206, 492, 466, 672), 96),
    "chair_pink": ((80, 498, 166, 672), 92),
    "chair_ladder": ((500, 530, 586, 686), 84),
}


def cut(im, box):
    """Crop the box, flood the white in from the edges, keep the biggest blob, trim."""
    x0, y0, x1, y1 = box
    a = np.asarray(im.crop((x0, y0, x1, y1)).convert("RGBA")).copy()
    rgb = a[..., :3].astype(int)
    white = (rgb.min(-1) >= WHITE_MIN) & (rgb.max(-1) - rgb.min(-1) <= WHITE_SPREAD)
    lab, _ = ndi.label(white)
    border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
    bg = np.isin(lab, list(border))
    bg |= ndi.binary_dilation(bg) & (rgb.min(-1) >= FRINGE_MIN)
    fg, n = ndi.label(~bg)
    if n == 0:
        sys.exit(f"{box}: nothing left after removing the white background")
    keep = fg == (int(np.argmax(ndi.sum(~bg, fg, range(1, n + 1)))) + 1)
    a[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.nonzero(a[..., 3] > 8)
    return Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1])


def resize(img, height):
    """Pixel art: upscale by whole pixels, then smooth-downscale to the target height."""
    if img.height < height:
        k = -(-height // img.height)
        img = img.resize((img.width * k, img.height * k), Image.NEAREST)
    return img.resize((max(1, round(img.width * height / img.height)), height), Image.LANCZOS)


def main(sheets_dir, out_dir, *only):
    im = Image.open(os.path.join(sheets_dir, "seating-sheet-2.jpg"))
    for name, (box, h) in CUTS.items():
        if only and name not in only:
            continue
        path = os.path.join(out_dir, "furniture", name + ".png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        out = resize(cut(im, box), h)
        a = np.asarray(out).copy()
        a[..., 3][a[..., 3] < 32] = 0  # resize crumbs: keep the corners really transparent
        out = Image.fromarray(a)
        out.save(path)
        print(f"{path}  {out.width}x{out.height}")


if __name__ == "__main__":
    main(*sys.argv[1:])
