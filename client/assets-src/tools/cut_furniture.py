"""Cut the 16 front-facing furniture pieces from the sheets in ../sheets/furniture/.

    /tmp/cut-venv/bin/python cut_furniture.py   # needs Pillow, NumPy, SciPy

The sheets already have a transparent background; isometric pieces were rejected, so only
the head-on/symmetric ones below are used. CUTS maps name -> (sheet, left, top, right,
bottom, H) where H is the on-screen height from shared/src/decor.ts. Only the biggest
opaque blob in the box is kept (neighbours may stick into it, like cut_food.py), then the
sprite is pixelated to match the existing furniture: downscaled to H/2 px tall, palette
reduced to 20 colours, 1px dark outline, blown back up x4 (saved at 2x display height).
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHEETS = os.path.join(HERE, "../sheets/furniture")
OUT = os.path.join(HERE, "../../public/assets/decor/furniture")
ALPHA_MIN = 40
OUTLINE = (61, 44, 41)

# name -> (sheet, [left, top, right, bottom], on-screen height H)
CUTS = [
    ("armchair_baroque", "a", (1294, 43, 1491, 361), 70),
    ("lamp_arc_brass", "a", (767, 456, 916, 895), 110),
    ("lamp_shade_white", "a", (2582, 368, 2686, 658), 100),
    ("lamp_post_brass", "a", (1754, 503, 1843, 877), 105),
    ("globe", "a", (2213, 727, 2354, 937), 60),
    ("armchair_cream", "c", (675, 624, 790, 823), 76),
    ("fireplace_white", "c", (2115, 1257, 2243, 1459), 80),
    ("lamp_floor_cream", "d", (283, 1454, 424, 1743), 90),
    ("plant_slim", "d", (2210, 1130, 2316, 1331), 80),
    ("plant_pattern_pot", "d", (914, 1443, 1099, 1727), 90),
]


def cut(sheet, box):
    """Crop the box (+4px margin) and keep only the biggest opaque blob, tightly trimmed."""
    left, top, right, bottom = box
    im = sheet.crop((left - 4, top - 4, right + 4, bottom + 4))
    a = np.asarray(im)
    solid = a[..., 3] > ALPHA_MIN
    # Join the parts of one piece (thin gaps), then keep the biggest blob.
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
    return Image.fromarray(out)


def pixelize(img, h_display):
    """Match the existing furniture's look: H/2 px tall, 20 colours, outline, x4 upscale."""
    ph = h_display // 2
    w = round(img.width * ph / img.height)
    small = img.resize((w, ph), Image.LANCZOS)
    a = np.asarray(small)
    mask = a[..., 3] > 110
    rgb = np.asarray(
        Image.fromarray(np.ascontiguousarray(a[..., :3]))
        .quantize(20, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE)
        .convert("RGB")
    )
    # Pad 1px, then paint every pixel just outside the sprite with the outline colour.
    out = np.zeros((ph + 2, w + 2, 4), dtype=np.uint8)
    out[1:-1, 1:-1, :3] = rgb
    solid = np.zeros((ph + 2, w + 2), dtype=bool)
    solid[1:-1, 1:-1] = mask
    ring = ndi.binary_dilation(solid) & ~solid
    out[ring, :3] = OUTLINE
    keep = solid | ring
    out[..., 3] = np.where(keep, 255, 0)
    out[~keep, :3] = 0
    return Image.fromarray(out).resize(((w + 2) * 4, (ph + 2) * 4), Image.NEAREST)


def main():
    os.makedirs(OUT, exist_ok=True)
    sheets = {}
    for name, sheet_key, box, h_display in CUTS:
        if sheet_key not in sheets:
            path = os.path.join(SHEETS, f"furniture-{sheet_key}.png")
            sheets[sheet_key] = Image.open(path).convert("RGBA")
        pixelize(cut(sheets[sheet_key], box), h_display).save(
            os.path.join(OUT, name + ".png"), optimize=True
        )
        print(name)


if __name__ == "__main__":
    main()
