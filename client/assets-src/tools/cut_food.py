"""Cut the restaurant's food icons (ingredients, dishes, drinks) out of the sheets in ../sheets/food/.

    python cut_food.py   # needs Pillow, NumPy, SciPy

The sheets already have a transparent background. Each entry of food_cuts.json is
    "<name>": ["<sheet>", left, top, right, bottom]
a rough box around one sprite (neighbours may stick into it): only the biggest opaque blob in the box is kept,
trimmed and scaled down to MAX_SIDE px, then written to client/public/assets/food/<name>.png.
"""
import json
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "../sheets/food")
OUT = os.path.join(HERE, "../../public/assets/food")
MAX_SIDE = 128
ALPHA_MIN = 40


def cut(sheet, box):
    left, top, right, bottom = box
    im = sheet.crop((left - 4, top - 4, right + 4, bottom + 4))
    a = np.asarray(im)
    solid = (a[..., 3] > ALPHA_MIN) & (a[..., :3].max(-1) > 25)
    # Join the parts of one sprite (sparkles and thin gaps), then keep the biggest blob.
    joined = ndi.binary_fill_holes(ndi.binary_closing(solid, iterations=3))
    lab, n = ndi.label(joined)
    if n == 0:
        raise ValueError(f"nothing in {box}")
    sizes = ndi.sum(joined, lab, range(1, n + 1))
    keep = ndi.binary_dilation(lab == (int(np.argmax(sizes)) + 1), iterations=2)
    out = a.copy()
    out[..., 3] = np.where(keep, a[..., 3], 0)
    ys, xs = np.nonzero(out[..., 3] > 8)
    out = out[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
    img = Image.fromarray(out, "RGBA")
    scale = min(1.0, MAX_SIDE / max(img.size))
    if scale < 1:
        img = img.resize((round(img.width * scale), round(img.height * scale)), Image.LANCZOS)
    return img


def main():
    cuts = json.load(open(os.path.join(HERE, "food_cuts.json")))
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    for name, (sheet, *box) in cuts.items():
        if sheet not in sheets:
            sheets[sheet] = Image.open(os.path.join(SHEETS, sheet + ".png")).convert("RGBA")
        cut(sheets[sheet], box).save(os.path.join(OUT, name + ".png"), optimize=True)
        print(name)


if __name__ == "__main__":
    main()
