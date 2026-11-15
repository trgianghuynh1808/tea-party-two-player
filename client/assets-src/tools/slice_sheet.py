"""Cut sprites out of a sheet whose background is smooth/blurred and whose sprites have crisp outlines.

Needs Pillow, NumPy and SciPy (e.g. in a throwaway venv:
    python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy).

1) Detect sprites, write a numbered preview + the detected boxes:
       python slice_sheet.py detect sheet.png preview.png boxes.json
2) Name the sprites you want in a JSON file: {"output/path/name.png": [index, ...], ...}
   (several indices = one sprite made of separate pieces), then cut them out:
       python slice_sheet.py extract sheet.png boxes.json names.json <out_dir>

How it works: strong luminance edges (the sprite outlines) are closed and hole-filled into solid masks;
the blurred background has almost no edges, so it drops out and becomes transparent.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

EDGE_THRESHOLD = 60  # Sobel magnitude on 0..255 luminance
MIN_AREA = 300  # ignore specks smaller than this (pixels)


def sprite_mask(path):
    im = Image.open(path).convert("RGBA")
    rgb = np.asarray(im)[..., :3].astype(np.float64)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    edge = np.hypot(ndi.sobel(lum, 1), ndi.sobel(lum, 0)) > EDGE_THRESHOLD
    mask = ndi.binary_fill_holes(ndi.binary_closing(edge, iterations=2))
    return im, ndi.binary_opening(mask, iterations=2)


def detect(sheet, preview_path, boxes_path):
    im, mask = sprite_mask(sheet)
    lab, _ = ndi.label(mask)
    boxes = []
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        ys, xs = sl
        if (lab[sl] == i).sum() < MIN_AREA:
            continue
        boxes.append([xs.start, ys.start, xs.stop, ys.stop])
    # Reading order: rows (by centre, ~80 px bands), then left to right.
    boxes.sort(key=lambda b: (round((b[1] + b[3]) / 2 / 80), b[0]))
    prev = im.convert("RGB")
    d = ImageDraw.Draw(prev)
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        d.rectangle([x0, y0, x1 - 1, y1 - 1], outline=(255, 0, 255), width=2)
        d.text((x0 + 3, y0 + 2), str(k), fill=(255, 255, 0))
    prev.save(preview_path)
    json.dump(boxes, open(boxes_path, "w"))
    print(f"{len(boxes)} sprites -> {preview_path}, {boxes_path}")


def extract(sheet, boxes_path, names_path, out_dir):
    im, mask = sprite_mask(sheet)
    boxes = json.load(open(boxes_path))
    names = json.load(open(names_path))
    rgba = np.asarray(im).copy()
    rgba[..., 3] = np.where(mask, rgba[..., 3], 0)
    for name, idx in names.items():
        x0 = min(boxes[i][0] for i in idx); y0 = min(boxes[i][1] for i in idx)
        x1 = max(boxes[i][2] for i in idx); y1 = max(boxes[i][3] for i in idx)
        out = os.path.join(out_dir, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        Image.fromarray(rgba[y0:y1, x0:x1]).save(out)
        print(f"{out}  {x1 - x0}x{y1 - y0}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    {"detect": detect, "extract": extract}[cmd](*args)
