"""Split one detected sprite whose blob touches a neighbour into two images along a manual cut.

    python split_blob.py sheet.png boxes.json <index> <cut.json> <out_top.png> <out_bottom.png>   # flat background

cut.json: {"y": 660, "xFrom": 253, "yRight": 680}
  -> pixels above y go to the top sprite, plus pixels with x >= xFrom above yRight
     (a stepped cut, for when the top sprite's bottom overlaps the other one's tip).
"""
import json
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

sys.path.insert(0, __import__("os").path.dirname(__file__))
from slice_sheet import sprite_mask  # noqa: E402

sheet, boxes_path, index, cut_path, out_top, out_bottom = sys.argv[1:]
im, mask = sprite_mask(sheet, "flat")
box = json.load(open(boxes_path))[int(index)]
lab, _ = ndi.label(mask)
blob = None
for i, sl in enumerate(ndi.find_objects(lab), 1):
    if sl is not None and [sl[1].start, sl[0].start, sl[1].stop, sl[0].stop] == box:
        blob = lab == i
cut = json.load(open(cut_path))
ys, xs = np.mgrid[: mask.shape[0], : mask.shape[1]]
top = (ys < cut["y"]) | ((xs >= cut["xFrom"]) & (ys < cut["yRight"]))
src = np.asarray(im)
for part, out in ((blob & top, out_top), (blob & ~top, out_bottom)):
    # Keep the largest piece only (drops leaf slivers cut off by the line).
    pl, n = ndi.label(part)
    part = pl == (int(np.argmax(ndi.sum(part, pl, range(1, n + 1)))) + 1)
    rgba = src.copy()
    rgba[..., 3] = np.where(part, rgba[..., 3], 0)
    py, px = np.nonzero(part)
    Image.fromarray(rgba[py.min() : py.max() + 1, px.min() : px.max() + 1]).save(out)
    print(f"{out}  {px.max() - px.min() + 1}x{py.max() - py.min() + 1}")
