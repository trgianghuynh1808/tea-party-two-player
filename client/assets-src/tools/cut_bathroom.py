"""Cut the 4 head-on bathroom pieces from ../sheets/bathroom-sheet-1.png.

    .venv-art/bin/python cut_bathroom.py   # needs Pillow, NumPy, SciPy

Unlike the furniture sheets this one has a dark background (~RGB 36,35,42)
instead of transparency, so the background is separated by colour distance
instead of alpha. The black drop shadows under the pieces and the watermark
star in the bottom-right corner are dark too but never make it into the
sprites: only the biggest colour-distinct blob in each box is kept (like
cut_furniture.py), and the <=2px shadow remnants below a base average away
when the crop is downscaled. CUTS maps name -> (box, H, target) where H is
the on-screen height and target picks the output folder: floor pieces go to
public/assets/decor/bathroom/, the wall hook rack to public/assets/decor/wall/.
The sprite is pixelated to match the existing furniture: downscaled to H/2 px
tall, palette reduced to 20 colours, 1px dark outline, blown back up x4
(saved at 2x display height).
"""
import os

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
SHEET = os.path.join(HERE, "../sheets/bathroom-sheet-1.png")
OUT_FLOOR = os.path.join(HERE, "../../public/assets/decor/bathroom")
OUT_WALL = os.path.join(HERE, "../../public/assets/decor/wall")
BG = np.array([36, 35, 42])
DIST_MIN = 28
OUTLINE = (61, 44, 41)

# name -> ((left, top, right, bottom), on-screen height H, "bathroom"|"wall")
CUTS = [
    ("cabinet_bottles", (170, 312, 352, 562), 100, "bathroom"),
    ("hook_rack", (50, 372, 128, 455), 48, "wall"),
    ("toilet_front", (96, 765, 200, 945), 74, "bathroom"),
    ("trash_can", (652, 738, 716, 840), 46, "bathroom"),
]


def cut(sheet, box):
    """Crop the box (+4px margin) and keep only the biggest blob, tightly trimmed."""
    left, top, right, bottom = box
    im = sheet.crop((left - 4, top - 4, right + 4, bottom + 4))
    a = np.asarray(im).copy()
    solid = np.sqrt(((a[..., :3].astype(int) - BG) ** 2).sum(-1)) > DIST_MIN
    # Join the parts of one piece (thin gaps), then keep the biggest blob.
    joined = ndi.binary_fill_holes(ndi.binary_closing(solid, iterations=3))
    lab, n = ndi.label(joined)
    if n == 0:
        raise ValueError(f"nothing in {box}")
    sizes = ndi.sum(joined, lab, range(1, n + 1))
    keep = lab == (int(np.argmax(sizes)) + 1)
    out = a.copy()
    out[..., 3] = np.where(keep, 255, 0)
    out[~keep, :3] = 0
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
    os.makedirs(OUT_FLOOR, exist_ok=True)
    os.makedirs(OUT_WALL, exist_ok=True)
    sheet = Image.open(SHEET).convert("RGBA")
    for name, box, h_display, target in CUTS:
        out = os.path.join(OUT_WALL if target == "wall" else OUT_FLOOR, name + ".png")
        img = pixelize(cut(sheet, box), h_display)
        img.save(out, optimize=True)
        print(f"{name}: {img.width}x{img.height} -> {os.path.relpath(out, HERE)}")


if __name__ == "__main__":
    main()
