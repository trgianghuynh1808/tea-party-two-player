"""Cut the bathroom pieces from the two bathroom sheets.

    .venv-art/bin/python cut_bathroom.py   # needs Pillow, NumPy, SciPy

Unlike the furniture sheets these have a dark background (sheet 1 ~RGB
36,35,42; sheet 2 ~RGB 44,48,51) instead of transparency, so the background
is separated by colour distance instead of alpha. The black drop shadows
under the pieces never make it into the sprites: only the biggest
colour-distinct blob in each box is kept (like cut_furniture.py), and the
<=2px shadow remnants below a base average away when the crop is
downscaled. CUTS maps (sheet, name) -> (box, H, target) where H is the
on-screen height and target only picks the preview row; every piece goes
to public/assets/decor/bathroom/.
The sprite is pixelated to match the existing furniture: downscaled to
H/2 px tall, palette reduced to 20 colours, 1px dark outline, blown back
up x4 (saved at 2x display height).

Sheet 2's wall pieces grow beside the ✦ watermark, but none of them touch it.

Also writes ../sheets/bathroom-preview-2.png: the 6 new pieces on a
neutral grey, 3x, labelled (wall row top-aligned).
"""
import os

import numpy as np
from PIL import Image, ImageDraw
from scipy import ndimage as ndi

HERE = os.path.dirname(os.path.abspath(__file__))
OUT_FLOOR = os.path.join(HERE, "../../public/assets/decor/bathroom")
OUT_WALL = OUT_FLOOR
PREVIEW = os.path.join(HERE, "../sheets/bathroom-preview-2.png")
DIST_MIN = 28
OUTLINE = (61, 44, 41)

# sheet key -> (path, background colour)
SHEETS = {
    "1": (os.path.join(HERE, "../sheets/bathroom-sheet-1.png"), np.array([36, 35, 42])),
    "2": (os.path.join(HERE, "../sheets/bathroom-sheet-2.png"), np.array([44, 48, 51])),
}

# (sheet, name) -> ((left, top, right, bottom), on-screen height H, "bathroom"|"wall")
CUTS = [
    # sheet 1: the original 4 head-on pieces (unchanged)
    ("1", "cabinet_bottles", (170, 312, 352, 562), 100, "bathroom"),
    ("1", "hook_rack", (50, 372, 128, 455), 48, "wall"),
    ("1", "toilet_front", (96, 765, 200, 945), 74, "bathroom"),
    ("1", "trash_can", (652, 738, 716, 840), 46, "bathroom"),
    # sheet 2 wall
    ("2", "mirror_framed", (476, 93, 553, 197), 52, "wall"),
    ("2", "wall_lamp", (462, 12, 567, 88), 38, "wall"),
    ("2", "towel_rail", (584, 52, 722, 127), 38, "wall"),
    ("2", "towel_hook", (578, 148, 652, 216), 34, "wall"),
    ("2", "towel_shelf_wood", (740, 35, 870, 135), 50, "wall"),
    ("2", "water_heater", (920, 72, 997, 208), 68, "wall"),
]


def cut(sheet, box, bg):
    """Crop the box (+4px margin) and keep only the biggest blob, tightly trimmed."""
    left, top, right, bottom = box
    im = sheet.crop((left - 4, top - 4, right + 4, bottom + 4))
    a = np.asarray(im).copy()
    rgb = a[..., :3].astype(int)
    solid = np.sqrt(((rgb - bg) ** 2).sum(-1)) > DIST_MIN
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


FLOOR_PNGS = []
WALL_PNGS = [
    "mirror_framed", "wall_lamp", "towel_rail", "towel_hook",
    "towel_shelf_wood", "water_heater",
]


def preview():
    """The 6 new pieces at their pixel-grid size x3 on flat grey, with labels."""
    scale, pad, label_h = 3, 14, 10
    rows = []
    for names, folder, align in ((FLOOR_PNGS, "bathroom", "bottom"), (WALL_PNGS, "wall", "top")):
        if not names:
            continue
        imgs = []
        for n in names:
            im = Image.open(os.path.join(OUT_FLOOR if folder == "bathroom" else OUT_WALL, n + ".png"))
            imgs.append((n, im.resize((im.width // 4, im.height // 4), Image.NEAREST)))
        rows.append((imgs, align, max(im.height for _, im in imgs)))
    W = max(sum(im.width * scale for _, im in imgs) + pad * (len(imgs) + 1) for imgs, _, _ in rows)
    H = sum(rh * scale + pad * 2 + label_h for _, _, rh in rows)
    out = Image.new("RGBA", (W, H), (128, 128, 131, 255))
    d = ImageDraw.Draw(out)
    top = 0
    for imgs, align, rh in rows:
        x = pad
        for name, im in imgs:
            y = top + pad if align == "top" else top + pad + (rh - im.height) * scale
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            out.paste(big, (x, y), big)
            d.text((x + im.width * scale // 2 - len(name) * 3, top + pad + rh * scale + 2), name, fill=(30, 30, 34, 255))
            x += im.width * scale + pad
        top += rh * scale + pad * 2 + label_h
    return out


def main():
    os.makedirs(OUT_FLOOR, exist_ok=True)
    os.makedirs(OUT_WALL, exist_ok=True)
    sheets = {k: Image.open(p).convert("RGBA") for k, (p, _) in SHEETS.items()}
    for key, name, box, h_display, target in CUTS:
        out = os.path.join(OUT_WALL if target == "wall" else OUT_FLOOR, name + ".png")
        img = pixelize(cut(sheets[key], box, SHEETS[key][1]), h_display)
        img.save(out, optimize=True)
        print(f"{name}: {img.width}x{img.height} -> {os.path.relpath(out, HERE)}")
    pv = preview()
    pv.save(PREVIEW)
    print(f"preview: {pv.size[0]}x{pv.size[1]} -> {os.path.relpath(PREVIEW, HERE)}")


if __name__ == "__main__":
    main()
