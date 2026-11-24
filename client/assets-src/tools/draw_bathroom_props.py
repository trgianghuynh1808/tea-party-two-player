"""Draw the 5 tilted bathroom pieces head-on as original pixel art, straight from code.

    .venv-art/bin/python client/assets-src/tools/draw_bathroom_props.py

Writes  client/public/assets/decor/bathroom/bath_{vanity_sink,bathtub}.png
and     client/public/assets/decor/wall/bath_{towel_shelf,mirror,vent}.png
plus a  preview client/assets-src/sheets/bathroom-preview.png (all 9 bathroom pieces,
cut and drawn, on a neutral grey, 3x, labelled).

Style follows draw_yard_props.py: light from the top-left, 3-4 tones per material with
a 2x2 Bayer dither, sel-out outline. Palettes are sampled from bathroom-sheet-1.png so
the drawn pieces match the cut ones (wood #b26c24/#cb6e28, porcelain #f2f2f2, mirror
frame #60c5f1, towels #b7543f / #82b300 / #4482b5). The vent is not a separable
object in the sheet, so it follows the plan's description.

Each sprite is drawn at half its display height in pixels (like the cut pieces after
their H/2 downscale) and saved upscaled x4, so every bathroom PNG ends up at the same
resolution: 2x display height + an 8px pad.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "characters"))
import pngio  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_FLOOR = os.path.join(ROOT, "client", "public", "assets", "decor", "bathroom")
OUT_WALL = os.path.join(ROOT, "client", "public", "assets", "decor", "wall")
PREVIEW = os.path.join(ROOT, "client", "assets-src", "sheets", "bathroom-preview.png")

# ---------------------------------------------------------------- palette (dark -> light), sampled from the sheet

WOOD = [(94, 54, 22), (140, 82, 30), (185, 110, 38), (222, 146, 62)]  # #b26c24 / #cb6e28
PORC = [(82, 85, 90), (158, 166, 170), (203, 205, 203), (242, 242, 242)]  # #f2f2f2 / #e5e2dd
METAL = [(54, 52, 60), (88, 86, 96), (130, 128, 140), (178, 176, 186)]
TOWEL_R = [(128, 46, 36), (168, 71, 54), (204, 116, 92), (236, 178, 158)]  # #b7543f
TOWEL_G = [(92, 128, 10), (130, 179, 0), (209, 229, 68), (232, 240, 140)]  # #82b300
TOWEL_B = [(52, 100, 150), (68, 130, 181), (110, 168, 214), (176, 214, 242)]  # #4482b5
GLASS = [(150, 205, 232), (196, 231, 248), (224, 244, 252), (240, 250, 255)]  # #d1effa
FRAME = [(48, 110, 160), (70, 150, 200), (96, 197, 241), (170, 225, 250)]  # #60c5f1

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


# ---------------------------------------------------------------- floor pieces


def vanity_sink():
    """Wooden vanity, white stone counter with a basin, faucet, two bottles, green towel hung on the right."""
    w, h = 46, 49
    c = Canvas(w, h)
    # Cabinet body (left lit, right shadowed), two doors.
    for y in range(17, 45):
        for x in range(8, 44):
            rel = (x - 8) / 35
            v = 0.45 - rel * 0.7 - (0.55 if y == 44 else 0.0)
            if 24 <= x <= 26:  # groove between the doors
                v -= 0.9
            if y > 40:  # bottom rail
                v -= 0.35
            c.put(x, y, tone(WOOD, v, x, y))
    for x, y in ((22, 27), (29, 27)):  # door knobs
        c.put(x, y, METAL[2])
        c.put(x + 1, y, METAL[1])
    for x0, x1 in ((10, 13), (38, 41)):  # short legs
        for y in range(45, 48):
            for x in range(x0, x1 + 1):
                v = 0.0 if x == x0 else -0.5
                c.put(x, y, tone(WOOD, v - (0.4 if y == 47 else 0), x, y))
    # White stone counter slab with a bevelled edge.
    slab(c, 6, 43, 13, 14, PORC, 0.8, 0.1)
    slab(c, 6, 43, 15, 16, PORC, 0.0, -0.8)
    # Basin sunk into the slab (dark inner ellipse with a bright back rim).
    for y in range(14, 17):
        for x in range(16, 30):
            dx = (x + 0.5 - 22.5) / 7
            if dx * dx <= 1:
                c.put(x, y, tone(PORC, -0.9 if y == 14 else -0.55, x, y))
    # Faucet: riser, curved spout, a drop falling into the basin.
    for y in range(5, 13):
        c.put(10, y, tone(METAL, 0.5, 10, y))
        c.put(11, y, tone(METAL, -0.1, 11, y))
    c.rect(9, 4, 4, 1, METAL[2])
    c.rect(12, 5, 2, 1, METAL[1])  # spout head
    c.put(13, 6, METAL[1])
    c.put(13, 8, GLASS[3])
    c.put(13, 9, GLASS[2])
    # Bottles on the counter.
    for x in range(31, 35):
        for y in range(7, 13):
            c.put(x, y, tone(TOWEL_B, 0.5 if x < 33 else -0.2, x, y))
    c.rect(31, 6, 4, 1, METAL[2])
    for x in range(36, 39):
        for y in range(9, 13):
            c.put(x, y, tone(TOWEL_G, 0.5 if x < 37 else -0.2, x, y))
    c.rect(36, 8, 3, 1, WOOD[1])
    # Green towel draped over the counter's right end, hanging down the cabinet side.
    for y in range(12, 28):
        for x in range(40, 45):
            v = 0.35 if x < 42 else -0.25
            if y in (16, 21, 26):
                v -= 0.7  # fold shadows
            if y == 12:
                v += 0.5
            c.put(x, y, tone(TOWEL_G, v, x, y))
    outline(c)
    return to_rgba(c)


def bathtub():
    """White clawfoot tub seen from the front, faucet on the right rim."""
    w, h = 60, 30
    c = Canvas(w, h)
    cx = 28
    # Body: left lit, right shadowed, bottom curved.
    for y in range(6, 23):
        k = (y - 6) / 16
        half = 26 - 3 * max(0, y - 18) / 5
        for x in range(int(cx - half), int(cx + half) + 1):
            rel = (x + 0.5 - cx) / half
            v = 0.7 - rel * 0.5 - k * 0.45
            c.put(x, y, tone(PORC, v, x, y))
    # Rim: top face bright, a dark line under it and an inner wall hint.
    for x in range(2, 55):
        c.put(x, 2, tone(PORC, 1.0, x, 2))
        c.put(x, 3, tone(PORC, 0.75, x, 3))
        c.put(x, 4, tone(PORC, -0.75, x, 4))
        c.put(x, 5, tone(PORC, -0.35, x, 5))
    c.put(2, 2, PORC[2])
    c.put(54, 2, PORC[1])
    # Faucet standing on the right rim: riser, curved spout over the tub, cross handle.
    for y in range(0, 3):
        c.put(50, y, tone(METAL, 0.5, 50, y))
        c.put(51, y, tone(METAL, -0.1, 51, y))
    c.rect(49, 0, 4, 1, METAL[2])
    for x in range(46, 51):
        c.put(x, 1, tone(METAL, 0.3, x, 1))
    c.rect(44, 2, 3, 1, METAL[1])  # spout head
    c.put(44, 3, METAL[0])
    c.put(44, 4, GLASS[3])
    c.put(52, 1, METAL[2])
    c.put(53, 1, METAL[1])  # handle
    # Claw feet (two at the front, dark porcelain).
    for fx in (8, 44):
        for y in range(22, 27):
            for x in range(fx, fx + 7):
                rel = (x - fx) / 6
                if y == 22 and (x - fx) % 3 == 1:
                    continue  # gap between the foot and the curved bottom
                v = 0.2 - rel * 0.5 - (0.5 if y > 24 else 0)
                if x == fx + 3 and y < 25:
                    v -= 0.4  # the "claw" notch
                c.put(x, y, tone(PORC, v, x, y))
        c.put(fx + 2, 27, PORC[1])
        c.put(fx + 4, 27, PORC[0])
    outline(c)
    return to_rgba(c)


# ---------------------------------------------------------------- wall pieces


def towel_shelf():
    """Wooden wall shelf carrying three towel stacks: red, green, blue."""
    w, h = 34, 22
    c = Canvas(w, h)
    # Board: top face bright, front mid, bottom shadow.
    slab(c, 2, 31, 13, 14, WOOD, 0.9, 0.2)
    slab(c, 2, 31, 15, 17, WOOD, 0.25, -0.7)
    c.put(2, 13, WOOD[1])
    c.put(31, 13, WOOD[1])
    # Wall brackets under the board.
    for bx in (4, 27):
        for y in range(18, 21):
            k = (y - 18) / 2
            for x in range(bx, bx + 3):
                c.put(x, y, tone(WOOD, -0.2 - k * 0.5, x, y))
    # Towel stacks folded on the board (fold lines every few rows).
    stacks = ((5, 12, 6, TOWEL_R), (14, 20, 8, TOWEL_G), (22, 29, 5, TOWEL_B))
    for x0, x1, top, pal in stacks:
        for y in range(top, 14):
            for x in range(x0, x1 + 1):
                rel = (x - x0) / (x1 - x0)
                v = 0.5 - rel * 0.6
                if (y - top) % 3 == 2:
                    v -= 0.8  # fold shadow
                if y == top:
                    v += 0.4
                c.put(x, y, tone(pal, v, x, y))
    outline(c)
    return to_rgba(c)


def mirror():
    """Rectangular mirror, blue frame, four screws, glass with a diagonal shine."""
    w, h = 24, 30
    c = Canvas(w, h)
    # Frame.
    for y in range(2, 28):
        for x in range(2, 22):
            if not (4 <= x <= 19 and 4 <= y <= 25):
                edge = x in (2, 21) or y in (2, 27)
                v = 0.5 if (x + y) < 14 else 0.2 if (x + y) < 40 else -0.3
                if edge:
                    v -= 0.35
                c.put(x, y, tone(FRAME, v, x, y))
    # Glass with two diagonal shine bands from the top-left.
    for y in range(4, 26):
        for x in range(4, 20):
            d = (x - 4) + (y - 4) * 0.6
            v = 0.1 - (x - 4) / 16 * 0.35
            if 5 < d % 13 < 8:
                v += 0.8  # shine bands
            c.put(x, y, tone(GLASS, v, x, y))
    # Screws in the frame corners.
    for x, y in ((3, 3), (20, 3), (3, 26), (20, 26)):
        c.put(x, y, METAL[2])
        c.put(x + 1 if x < 12 else x - 1, y, METAL[0])
    outline(c)
    return to_rgba(c)


def vent():
    """Wall air vent: framed horizontal louvers with shadow gaps, on a small bottom ledge."""
    w, h = 32, 17
    c = Canvas(w, h)
    # Ledge under the grill.
    slab(c, 2, 29, 13, 14, METAL, 0.8, 0.1)
    slab(c, 2, 29, 15, 15, METAL, -0.6, -0.6)
    # Frame.
    for y in range(1, 13):
        for x in range(1, 30):
            if x in (1, 29) or y in (1, 12):
                v = 0.6 if x + y < 18 else 0.1
                c.put(x, y, tone(METAL, v, x, y))
    # Louvers: each slat bright on top, shadowed below; transparent gaps in between
    # that the sel-out outline turns into shadow lines.
    for y0 in (3, 6, 9):
        for y in range(y0, y0 + 2):
            for x in range(3, 28):
                v = 0.7 if y == y0 else -0.2
                if x == 3 or x == 27:
                    v -= 0.5
                c.put(x, y, tone(METAL, v, x, y))
    # Corner screws.
    for x, y in ((2, 2), (28, 2)):
        c.put(x, y, METAL[3])
    outline(c)
    return to_rgba(c)


PROPS = [
    ("bath_vanity_sink", "bathroom", vanity_sink),
    ("bath_bathtub", "bathroom", bathtub),
    ("bath_towel_shelf", "wall", towel_shelf),
    ("bath_mirror", "wall", mirror),
    ("bath_vent", "wall", vent),
]


# ---------------------------------------------------------------- preview (all 9 bathroom pieces)

FLOOR_PNGS = ["cabinet_bottles", "bath_vanity_sink", "bath_bathtub", "toilet_front", "trash_can"]
WALL_PNGS = ["hook_rack", "bath_towel_shelf", "bath_mirror", "bath_vent"]


def preview():
    """Every bathroom piece at its pixel-grid size x3 on flat grey, with labels."""
    from PIL import Image, ImageDraw

    scale, pad, label_h = 3, 14, 10
    rows = []
    for names, folder, align in ((FLOOR_PNGS, "bathroom", "bottom"), (WALL_PNGS, "wall", "top")):
        imgs = []
        for n in names:
            im = Image.open(os.path.join(ROOT, "client", "public", "assets", "decor", folder, n + ".png"))
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
    for name, folder, draw in PROPS:
        px = draw()
        big = pngio.scale_nearest(px, 4)
        out = os.path.join(OUT_FLOOR if folder == "bathroom" else OUT_WALL, name + ".png")
        pngio.save(out, big)
        print(f"{name}: {len(big[0])}x{len(big)} -> {os.path.relpath(out, ROOT)}")
    pv = preview()
    pv.save(PREVIEW)
    print("preview:", os.path.relpath(PREVIEW, ROOT), pv.size)


if __name__ == "__main__":
    main()
