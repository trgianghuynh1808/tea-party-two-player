"""Cut sprites out of a sheet whose background is smooth/blurred and whose sprites have crisp outlines.

Needs Pillow, NumPy and SciPy (e.g. in a throwaway venv:
    python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy).

1) Detect sprites, write a numbered preview + the detected boxes:
       python slice_sheet.py detect sheet.png preview.png boxes.json [edges|flat]
2) Name the sprites you want in a JSON file: {"output/path/name.png": [index, ...], ...}
   (several indices = one sprite made of separate pieces), then cut them out:
       python slice_sheet.py extract sheet.png boxes.json names.json <out_dir> [edges|flat]

Background modes (use the same one for both steps):
- edges (default): blurred/gradient background. Strong luminance edges (the sprite outlines) are closed
  and hole-filled into solid masks; the blurred background has almost no edges and drops out.
- flat: plain single-colour background. Pixels that differ from the border colour are the sprites.
"""
import json
import os
import sys

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

EDGE_THRESHOLD = 60  # Sobel magnitude on 0..255 luminance
MIN_AREA = 300  # ignore specks smaller than this (pixels)


FLAT_TOLERANCE = 28  # RGB distance from the background colour
HOLE_MIN_AREA = 30
HOLE_TOLERANCE = 12


def sprite_mask(path, mode="edges"):
    im = Image.open(path).convert("RGBA")
    rgb = np.asarray(im)[..., :3].astype(np.float64)
    if mode == "flat":
        border = np.concatenate([rgb[0], rgb[-1], rgb[:, 0], rgb[:, -1]])
        bg = np.median(border, axis=0)
        dist = np.linalg.norm(rgb - bg, axis=-1)
        solid = ndi.binary_closing(dist > FLAT_TOLERANCE, iterations=1)
        mask = ndi.binary_fill_holes(solid)
        # Re-open holes that are really background seen through the sprite (e.g. between chair slats):
        # big enough and almost exactly the background colour. Small/odd-coloured holes stay filled.
        holes, n = ndi.label(mask & ~solid)
        for i in range(1, n + 1):
            hole = holes == i
            if hole.sum() >= HOLE_MIN_AREA and np.median(dist[hole]) < HOLE_TOLERANCE:
                mask[hole] = False
        return im, ndi.binary_opening(mask, iterations=1)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    edge = np.hypot(ndi.sobel(lum, 1), ndi.sobel(lum, 0)) > EDGE_THRESHOLD
    mask = ndi.binary_fill_holes(ndi.binary_closing(edge, iterations=2))
    return im, ndi.binary_opening(mask, iterations=2)


def detect(sheet, preview_path, boxes_path, mode="edges"):
    im, mask = sprite_mask(sheet, mode)
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


def extract(sheet, boxes_path, names_path, out_dir, mode="edges"):
    im, mask = sprite_mask(sheet, mode)
    boxes = json.load(open(boxes_path))
    names = json.load(open(names_path))
    # Map each detected box back to its blob, so a sprite only keeps its own pixels even when
    # a neighbour's bounding box overlaps it.
    lab, _ = ndi.label(mask)
    blob_of = {}
    for i, sl in enumerate(ndi.find_objects(lab), 1):
        if sl is not None:
            blob_of[(sl[1].start, sl[0].start, sl[1].stop, sl[0].stop)] = i
    src = np.asarray(im)
    for name, idx in names.items():
        x0 = min(boxes[i][0] for i in idx); y0 = min(boxes[i][1] for i in idx)
        x1 = max(boxes[i][2] for i in idx); y1 = max(boxes[i][3] for i in idx)
        own = np.isin(lab, [blob_of[tuple(boxes[i])] for i in idx])
        rgba = src.copy()
        rgba[..., 3] = np.where(own, rgba[..., 3], 0)
        out = os.path.join(out_dir, name)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        Image.fromarray(rgba[y0:y1, x0:x1]).save(out)
        print(f"{out}  {x1 - x0}x{y1 - y0}")


if __name__ == "__main__":
    cmd, *args = sys.argv[1:]
    {"detect": detect, "extract": extract}[cmd](*args)
