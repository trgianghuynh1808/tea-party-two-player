"""Cut the 9 farm furniture pieces out of the white-background sheet ../sheets/farm-sheet-1.jpg.

T33 req-2: a farm-style furniture set (cowhide sofa/armchair, wood wardrobe/dresser/hutch,
gingham bed/table, chair, bench) on flat white, cut the way cut_seating.py does it:
near-white pixels flood-filled in from the box edges (white enclosed by an outline stays
transparent), a 1 px light fringe along the cut cleared, only the biggest blob kept
(drops neighbour slivers), the pixel-art resize (whole-pixel NEAREST upscale, LANCZOS
down) and the alpha<32 zero pass that keeps the corners truly transparent.

Needs Pillow, NumPy and SciPy. From client/assets-src/tools/:
    .venv-art/bin/python cut_farm.py ../sheets ../../public/assets/decor          # every piece
    .venv-art/bin/python cut_farm.py ../sheets ../../public/assets/decor sofa_cow  # one piece
"""
import os
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WHITE_MIN, WHITE_SPREAD, FRINGE_MIN = 238, 14, 215

# name -> (box left, top, right, bottom, h) - h = 2x the imageHeight from the T33 table.
CUTS = {
    "sofa_cow": ((278, 155, 484, 298), 120),
    "armchair_cow": ((500, 245, 630, 390), 112),
    "wardrobe_farm": ((660, 290, 782, 520), 172),
    "dresser_farm": ((133, 243, 252, 398), 148),
    "hutch_farm": ((514, 460, 632, 650), 160),
    "bed_gingham": ((325, 335, 452, 610), 176),
    "table_gingham": ((128, 435, 257, 632), 124),
    "chair_farm": ((24, 366, 105, 495), 92),
    "bench_farm": ((330, 662, 456, 755), 60),
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
    im = Image.open(os.path.join(sheets_dir, "farm-sheet-1.jpg"))
    for name, (box, h) in CUTS.items():
        if only and name not in only:
            continue
        path = os.path.join(out_dir, "furniture", name + ".png")
        os.makedirs(os.path.dirname(path), exist_ok=True)
        out = resize(cut(im, box), h)
        a = np.asarray(out).copy()
        a[..., 3][a[..., 3] < 32] = 0  # resize crumbs: keep the corners really transparent
        hh, ww = a.shape[:2]
        for cy, cx in ((0, 0), (0, ww - 1), (hh - 1, 0), (hh - 1, ww - 1)):
            if a[cy, cx, 3] < 128:  # LANCZOS smears the trimmed-away corner: clear it
                a[cy, cx, 3] = 0
        out = Image.fromarray(a)
        out.save(path)
        print(f"{path}  {out.width}x{out.height}")


if __name__ == "__main__":
    main(*sys.argv[1:])
