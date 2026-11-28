"""Draw the 3 standing gadget pieces head-on as original pixel art, straight from code.

    .venv-art/bin/python client/assets-src/tools/draw_gadget_props.py

Writes  client/public/assets/decor/gadgets/{tv_stand_wood,piano_grand,vanity_piano_gold}.png
plus a  preview client/assets-src/sheets/gadgets-preview.png (all 3 pieces on a
neutral grey, 3x, labelled).

Style follows draw_bathroom_props.py: light from the top-left, 3-4 tones per material
with a 2x2 Bayer dither, sel-out outline. Palettes are sampled from the tilted
references in client/assets-src/sheets/gadgets-ref/ (TV slate screen #24243c with pale
pinkish wood, mahogany #6c3c24 with gold #cc9c54 trim, cream #e4e4cc vanity top).

The pieces face the viewer. Each sprite is drawn at half its display size in pixels and
saved upscaled x4, so every PNG ends up at 2x display size + an 8px pad, matching the
bathroom set:

    tv_stand_wood 37x30 -> 148x120 (70x56)   piano_grand 34x30 -> 136x120 (64x56)
    vanity_piano_gold 24x37 -> 96x148 (44x70)
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "characters"))
import pngio  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT = os.path.join(ROOT, "client", "public", "assets", "decor", "gadgets")
PREVIEW = os.path.join(ROOT, "client", "assets-src", "sheets", "gadgets-preview.png")

# ---------------------------------------------------------------- palettes (dark -> light), sampled from the refs

SCREEN = [(34, 56, 104), (58, 128, 176), (118, 178, 218), (188, 222, 242)]  # #243c6c / #3c84b4
SILVER = [(84, 84, 88), (128, 128, 132), (168, 168, 172), (206, 206, 210)]  # TV legs
SLATE = [(28, 28, 46), (46, 46, 70), (66, 70, 96), (96, 104, 130)]  # TV screen #24243c / #3c3c54
BEZEL = [(40, 40, 44), (66, 66, 72), (104, 104, 112), (146, 146, 154)]  # TV frame grey
PALEWOOD = [(130, 106, 106), (162, 136, 136), (194, 168, 168), (222, 202, 202)]  # pale pinkish wood
MAHOG = [(56, 32, 12), (104, 58, 34), (152, 104, 58), (198, 148, 92)]  # #3c240c / #6c3c24 / #9c6c3c
GOLD = [(94, 62, 26), (148, 102, 42), (202, 154, 82), (240, 204, 128)]  # #cc9c54 trim
CREAM = [(198, 190, 158), (222, 216, 184), (236, 230, 202), (247, 243, 224)]  # #e4e4cc vanity top
IVORY = [(210, 204, 178), (232, 228, 208), (246, 243, 230), (253, 251, 244)]  # piano keys
BLACKKEY = [(42, 34, 26), (66, 54, 40)]
GLASS = [(150, 205, 232), (196, 231, 248), (224, 244, 252), (240, 250, 255)]  # mirror glass

BAYER = [[0.0, 0.5], [0.75, 0.25]]


class Canvas:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def put(self, x, y, col):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = col

    def rect(self, x0, y0, w, h, col):
        for y in range(int(y0), int(y0 + h)):
            for x in range(int(x0), int(x0 + w)):
                self.put(x, y, col)


def tone(palette, value, x, y):
    """value in -1..1 (dark..light), dithered between neighbouring tones."""
    n = len(palette)
    v = (value + 1) / 2 * (n - 1) + (BAYER[y % 2][x % 2] - 0.5) * 0.7
    return palette[max(0, min(n - 1, int(round(v))))]


def darker(col, k=0.55):
    return tuple(int(v * k) for v in col)


def outline(c, k=0.5):
    """Sel-out outline: transparent pixels next to the shape get a dark shade of their neighbour."""
    adds = []
    for y in range(c.h):
        for x in range(c.w):
            if c.px[y][x] is not None:
                continue
            for nx, ny in ((x, y + 1), (x, y - 1), (x + 1, y), (x - 1, y)):
                n = c.get(nx, ny)
                if n is not None:
                    adds.append((x, y, darker(n, k)))
                    break
    for x, y, col in adds:
        c.px[y][x] = col


def to_rgba(c):
    rows = []
    for y in range(c.h):
        rows.append([(p[0], p[1], p[2], 255) if p is not None else (0, 0, 0, 0) for p in c.px[y]])
    return rows


def slab(c, x0, x1, y0, y1, palette, top=0.9, bottom=-0.6):
    """A man-made band lit from above: bright near the top, darker near the bottom edge."""
    for y in range(y0, y1 + 1):
        k = (y - y0) / max(1, y1 - y0)
        for x in range(x0, x1 + 1):
            c.put(x, y, tone(palette, top - k * (top - bottom), x, y))


def keys(c, x0, x1, y0, y1, ivory=IVORY, black=BLACKKEY):
    """A run of piano keys: ivory slabs with dark gaps and a few black keys."""
    for y in range(y0, y1 + 1):
        for x in range(x0, x1 + 1):
            v = 0.75 - (y - y0) / max(1, y1 - y0) * 1.1
            if (x - x0) % 6 == 5:
                v -= 1.4  # gap between the keys
            c.put(x, y, tone(ivory, v, x, y))
    for x in range(x0 + 2, x1 - 1, 6):  # black keys over the back half
        for y in range(y0, y0 + max(1, y1 - y0)):
            c.put(x, y, black[0] if (x + y) % 2 else black[1])


# ---------------------------------------------------------------- standing pieces (front view)


def tv_stand_wood():
    """TV on silver legs over a low pale-wood cabinet with two compartments."""
    c = Canvas(37, 30)
    # Cabinet: top slab at y23, front with two
    # dark compartments between the side stiles, bottom rail and plinth feet on the floor.
    slab(c, 1, 35, 23, 23, PALEWOOD, 0.95, 0.6)
    slab(c, 1, 35, 24, 24, PALEWOOD, 0.05, -0.55)
    for y in (25, 26):
        for x in range(1, 36):
            if 5 <= x <= 16 or 20 <= x <= 31:
                c.put(x, y, tone(PALEWOOD, -0.75, x, y))  # compartment opening
            elif 17 <= x <= 19:
                c.put(x, y, tone(PALEWOOD, -0.05, x, y))  # centre divider
            else:
                c.put(x, y, tone(PALEWOOD, -0.3, x, y))  # side stiles
    slab(c, 1, 35, 27, 27, PALEWOOD, -0.1, -0.5)  # bottom rail
    slab(c, 1, 35, 28, 28, PALEWOOD, -0.55, -0.65)  # plinth along the floor
    for fx in (3, 30):
        for x in range(fx, fx + 4):
            c.put(x, 28, tone(PALEWOOD, -0.95, x, 28))  # darker feet blocks
    # Silver legs between the cabinet top and the TV.
    for lx in (9, 25):
        for y in range(19, 23):
            for x in range(lx, lx + 3):
                c.put(x, y, tone(SILVER, 0.4 if x == lx else -0.15, x, y))
    # TV: grey bezel with cut corners, slate screen with two diagonal shine bands.
    for y in range(1, 19):
        for x in range(5, 32):
            if (x, y) in ((5, 1), (31, 1), (5, 18), (31, 18)):
                continue
            rel = (x - 5) / 26
            v = 0.35 - rel * 0.9 - (0.5 if y == 18 else 0.0)
            c.put(x, y, tone(BEZEL, v, x, y))
    for y in range(3, 17):
        for x in range(7, 30):
            d = (x - 7) + (y - 3) * 0.6
            v = 0.15 - (x - 7) / 23 * 0.5
            if 5 < d % 13 < 8:
                v += 0.75  # shine bands from the top-left
            c.put(x, y, tone(SLATE, v, x, y))
    c.put(29, 17, SCREEN[2])  # standby LED
    outline(c)
    return to_rgba(c)


def piano_grand():
    """Grand piano from the front: open lid rising to the right, gold trim, ivory keys."""
    c = Canvas(34, 30)
    # Open lid: a slab of constant thickness slanted up to the right (hinge on the
    # left), gold trim along its lower front edge; the body top rail hides the left end.
    for x in range(2, 33):
        top = 2 + (32 - x) * 0.18
        for y in range(int(top), int(top) + 6):
            rel = (x - 2) / 30
            v = 0.15 - rel * 0.75 + (0.3 if (x + y) % 7 < 2 else 0.0)
            if y == int(top) + 5:
                v -= 0.5  # shaded lower edge
            c.put(x, y, tone(MAHOG, v, x, y))
        c.put(x, int(top) + 6, tone(GOLD, 0.3, x, int(top) + 6))  # gold trim along the lid edge
    # Body: top rail, gold strip, keyboard, key slip, front board with a gold inlay.
    slab(c, 2, 32, 11, 12, MAHOG, 0.35, -0.5)
    slab(c, 3, 31, 13, 13, GOLD, 0.45, -0.3)
    keys(c, 4, 29, 14, 16)
    slab(c, 3, 31, 17, 17, MAHOG, -0.7, -0.7)
    slab(c, 2, 32, 18, 21, MAHOG, 0.1, -0.8)
    slab(c, 4, 30, 19, 19, GOLD, 0.2, -0.4)  # gold inlay line on the front board
    # Front legs with gold casters and the pedal lyre between them.
    for lx in (6, 24):
        for y in range(22, 28):
            for x in range(lx, lx + 4):
                v = 0.2 if x == lx else -0.45
                c.put(x, y, tone(MAHOG, v - (0.3 if y == 27 else 0), x, y))
        c.put(lx + 2, 28, GOLD[2])
    for y in range(22, 27):  # slim pedal column
        for x in range(15, 18):
            c.put(x, y, tone(GOLD, 0.1 - (0.3 if y == 26 else 0), x, y))
    c.put(14, 27, GOLD[1])
    c.put(17, 27, GOLD[1])  # the two gold pedals
    outline(c)
    return to_rgba(c)


def vanity_piano_gold():
    """Vanity piano: gold oval mirror over a cream counter that carries piano keys, gold legs."""
    c = Canvas(24, 37)
    # Oval mirror: gold frame ring around light glass with a diagonal shine.
    cx, cy, rx, ry = 11.5, 13.0, 7.2, 11.5
    for y in range(2, 25):
        dy = (y + 0.5 - cy) / ry
        if abs(dy) >= 1:
            continue
        half = rx * (1 - dy * dy) ** 0.5
        for x in range(int(cx - half), int(cx + half) + 1):
            dx = abs(x + 0.5 - cx) / rx
            edge = (1 - dy * dy) - dx * dx < 2.6 / (rx * ry) ** 0.35
            if edge:
                v = 0.5 - ((x + y) - 14) / 46  # gold lit from the top-left
                c.put(x, y, tone(GOLD, v, x, y))
            else:
                d = (x - 4) + (y - 2) * 0.6
                v = 0.05 - (y - 2) / 24 * 0.4
                if 5 < d % 13 < 8:
                    v += 0.85  # shine bands
                c.put(x, y, tone(GLASS, v, x, y))
    # Counter: cream top, keys, cream front with gold line.
    slab(c, 2, 21, 25, 25, CREAM, 0.85, 0.35)
    keys(c, 3, 20, 26, 28)
    slab(c, 2, 21, 29, 29, CREAM, -0.25, -0.25)
    slab(c, 3, 20, 30, 33, CREAM, 0.25, -0.6)
    slab(c, 4, 19, 31, 31, GOLD, 0.25, -0.35)  # gold inlay on the apron
    # Gold legs with a stretcher bar between them.
    for lx in (3, 17):
        for y in range(30, 36):
            for x in range(lx, lx + 4):
                v = 0.35 if x == lx else -0.3
                c.put(x, y, tone(GOLD, v - (0.3 if y == 35 else 0), x, y))
    slab(c, 6, 17, 33, 34, GOLD, 0.1, -0.5)
    outline(c)
    return to_rgba(c)


PROPS = [
    ("tv_stand_wood", tv_stand_wood),
    ("piano_grand", piano_grand),
    ("vanity_piano_gold", vanity_piano_gold),
]


# ---------------------------------------------------------------- preview (all 3 pieces)

def preview():
    """Every gadget piece at its pixel-grid size x3 on flat grey, with labels."""
    from PIL import Image, ImageDraw

    scale, pad, label_h = 3, 14, 10
    rows = [
        [("tv_stand_wood", "tv_stand_wood"), ("piano_grand", "piano_grand"), ("vanity_piano_gold", "vanity_piano_gold")],
    ]
    imgs = []
    for row in rows:
        loaded = []
        for name, label in row:
            im = Image.open(os.path.join(OUT, name + ".png"))
            loaded.append((label, im.resize((im.width // 4, im.height // 4), Image.NEAREST)))
        imgs.append(loaded)
    W = max(sum(im.width * scale for _, im in row) + pad * (len(row) + 1) for row in imgs)
    H = sum(max(im.height for _, im in row) * scale + pad * 2 + label_h for row in imgs)
    out = Image.new("RGBA", (W, H), (128, 128, 131, 255))
    d = ImageDraw.Draw(out)
    top = 0
    for row in imgs:
        rh = max(im.height for _, im in row)
        x = pad
        for label, im in row:
            y = top + pad + (rh - im.height) * scale
            big = im.resize((im.width * scale, im.height * scale), Image.NEAREST)
            out.paste(big, (x, y), big)
            d.text((x + im.width * scale // 2 - len(label) * 3, top + pad + rh * scale + 2), label, fill=(30, 30, 34, 255))
            x += im.width * scale + pad
        top += rh * scale + pad * 2 + label_h
    return out


def main():
    os.makedirs(OUT, exist_ok=True)
    for name, draw in PROPS:
        px = draw()
        big = pngio.scale_nearest(px, 4)
        out = os.path.join(OUT, name + ".png")
        pngio.save(out, big)
        print(f"{name}: {len(big[0])}x{len(big)} -> {os.path.relpath(out, ROOT)}")
    pv = preview()
    pv.save(PREVIEW)
    print("preview:", os.path.relpath(PREVIEW, ROOT), pv.size)


if __name__ == "__main__":
    main()
