"""Draw the outdoor props (trees, bench, barrel...) as original pixel art, straight from code.

Usage:  python3 client/assets-src/tools/draw_yard_props.py
Writes  client/public/assets/decor/yard/<name>.png   (native pixel size, scaled up in game with nearest filtering)
and     client/assets-src/yard/preview.png           (every prop on grass, 3x, for a quick look)

Style: light from the top-left, 3-4 tones per material with a 2x2 dither between tones,
and a "sel-out" outline (a darker shade of the neighbouring colour instead of pure black).
"""
import math
import os
import random
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "characters"))
import pngio  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "client", "public", "assets", "decor", "yard")
PREVIEW = os.path.join(ROOT, "client", "assets-src", "yard", "preview.png")

# ---------------------------------------------------------------- palette (dark -> light)

LEAF = [(40, 92, 72), (62, 128, 84), (104, 170, 92), (164, 208, 112)]
PINE = [(30, 72, 66), (44, 104, 80), (74, 140, 92), (120, 176, 104)]
PALM = [(52, 110, 64), (86, 150, 70), (138, 190, 84), (186, 220, 112)]
BARK = [(78, 50, 40), (112, 74, 52), (148, 102, 70), (178, 132, 92)]
WOOD = [(110, 72, 48), (150, 104, 70), (190, 140, 96), (222, 178, 128)]
STRAW = [(150, 112, 60), (190, 150, 82), (222, 186, 112), (244, 216, 150)]
STONE = [(92, 92, 100), (128, 128, 134), (166, 164, 166), (204, 200, 196)]
SNOW = [(178, 198, 222), (214, 228, 242), (244, 248, 252)]
PUMPKIN = [(176, 78, 30), (222, 112, 40), (246, 154, 58), (252, 196, 104)]
METAL = [(54, 52, 60), (88, 86, 96), (130, 128, 140), (178, 176, 186)]
RED = [(130, 36, 44), (190, 56, 60), (232, 96, 88), (250, 156, 140)]
BLUE = [(40, 70, 130), (64, 110, 186), (110, 160, 226), (176, 210, 246)]
YELLOW = [(176, 128, 30), (226, 180, 50), (250, 218, 96), (255, 242, 170)]
PINK = [(160, 60, 110), (214, 98, 150), (242, 150, 186), (252, 204, 222)]
FLAME = [(214, 82, 30), (246, 146, 40), (255, 210, 80), (255, 248, 200)]

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

    def line(self, x0, y0, x1, y1, col):
        n = int(max(abs(x1 - x0), abs(y1 - y0))) + 1
        for i in range(n + 1):
            t = i / n
            self.put(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, col)


def tone(palette, value, x, y):
    """value in -1..1 (dark..light), dithered between neighbouring tones."""
    n = len(palette)
    v = (value + 1) / 2 * (n - 1) + (BAYER[y % 2][x % 2] - 0.5) * 0.7
    return palette[max(0, min(n - 1, int(round(v))))]


def shade(dx, dy, r, rim=0.45):
    """Lighting of a point on a sphere-ish blob: light from the top-left, darker towards the rim."""
    d = math.hypot(dx, dy) / max(r, 1)
    light = -(dx * 0.6 + dy * 0.8) / max(r, 1)
    return max(-1, min(1, light * 0.95 - (d ** 3) * rim + 0.1))


def blob(c, cx, cy, rx, ry, palette, light_bias=0.0, mask=None, rim=0.45):
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dx * dx + dy * dy <= 1:
                c.put(x, y, tone(palette, shade(dx * rx, dy * ry, max(rx, ry), rim) + light_bias, x, y))
                if mask is not None:
                    mask.add((x, y))


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


def snow_cap(c, rnd, depth=3, palette=SNOW, keep=None):
    """Snow lying on every upward-facing surface."""
    snowy = []
    for y in range(c.h):
        for x in range(c.w):
            if c.px[y][x] is None or (keep and (x, y) not in keep):
                continue
            d = depth + (1 if rnd.random() < 0.35 else 0)
            for k in range(1, d + 1):
                if c.get(x, y - k) is None:
                    snowy.append((x, y, k))
                    break
    for x, y, k in snowy:
        c.px[y][x] = palette[2] if k <= 1 else palette[1] if k <= 2 else palette[0]


def to_rgba(c, shadow=None):
    """Canvas -> RGBA rows; optional soft ground shadow ellipse (cx, cy, rx, ry) under the art."""
    rows = []
    for y in range(c.h):
        row = []
        for x in range(c.w):
            p = c.px[y][x]
            if p is not None:
                row.append((p[0], p[1], p[2], 255))
            elif shadow and ((x + 0.5 - shadow[0]) / shadow[2]) ** 2 + ((y + 0.5 - shadow[1]) / shadow[3]) ** 2 <= 1:
                row.append((30, 40, 20, 70))
            else:
                row.append((0, 0, 0, 0))
        rows.append(row)
    return rows


# ---------------------------------------------------------------- props


def trunk(c, cx, top, bottom, width, palette=BARK, roots=True):
    x0 = cx - width / 2
    for y in range(int(top), int(bottom) + 1):
        flare = 1 if roots and y >= bottom - 1 else 0
        for x in range(int(x0) - flare, int(x0 + width) + flare):
            rel = (x - x0 + 0.5) / width
            v = 0.6 if rel < 0.3 else 0.0 if rel < 0.7 else -0.7
            if (x + y * 3) % 7 == 0:
                v -= 0.5  # bark grooves
            c.put(x, y, tone(palette, v, x, y))


def round_tree(size, seed, snowy=False):
    w, h = {"s": (26, 34), "m": (38, 50), "l": (54, 68)}[size]
    rnd = random.Random(seed)
    c = Canvas(w, h)
    cx, ground = w / 2, h - 3
    r = w * 0.36
    cy = ground - h * 0.52
    trunk(c, cx, cy, ground, max(3, round(w / 9)))
    canopy = set()
    # A big centre clump plus smaller clumps around it, lit as separate leaf masses.
    clumps = [(cx, cy, r, r * 0.92)]
    for i in range(7):
        a = i / 7 * math.tau + rnd.uniform(-0.3, 0.3)
        d = r * rnd.uniform(0.5, 0.7)
        clumps.append((cx + math.cos(a) * d, cy + math.sin(a) * d * 0.8, r * rnd.uniform(0.42, 0.55), r * rnd.uniform(0.38, 0.5)))
    # Centre clump at the back, then the others from the top down (lower ones are in front).
    centre, others = clumps[0], sorted(clumps[1:], key=lambda k: k[1])
    for ccx, ccy, rx, ry in [centre] + others:
        blob(c, ccx, ccy, rx, ry, LEAF, light_bias=-0.35 * (ccy - cy) / r, mask=canopy, rim=1.1)
    # Leaf flecks
    for _ in range(int(w * 0.6)):
        x, y = rnd.randrange(w), rnd.randrange(h)
        if (x, y) in canopy and c.get(x, y - 1) is not None:
            c.put(x, y, LEAF[3] if y < cy else LEAF[0])
    if snowy:
        # Snow sits on the top of every visible leaf clump.
        order = [centre] + others
        for (x, y) in canopy:
            for ccx, ccy, rx, ry in reversed(order):
                dx, dy = (x + 0.5 - ccx) / rx, (y + 0.5 - ccy) / ry
                if dx * dx + dy * dy <= 1:
                    if dy < -0.25 and dx * dx + dy * dy > 0.3 - dy * 0.2:
                        c.put(x, y, tone(SNOW, 0.9 - (dy + 1) * 0.8 - dx * 0.4, x, y))
                    break
    outline(c)
    return to_rgba(c, (cx, ground + 0.5, w * 0.3, 2.2))


def pine_tree(size, seed, snowy=False):
    w, h = {"s": (20, 34), "m": (30, 50), "l": (42, 70)}[size]
    rnd = random.Random(seed)
    c = Canvas(w, h)
    cx, ground = w / 2, h - 2
    trunk_top = ground - h * 0.16
    trunk(c, cx, trunk_top - 4, ground, max(3, round(w / 8)))
    tiers = 3 if size == "s" else 4
    top = 2
    span = trunk_top - top
    foliage = set()
    upper = {}  # pixel -> True if it's in the upper part of the tier drawn last over it
    rows = []
    for i in range(tiers):  # from the top tier down
        t_top = top + span * (i / (tiers + 0.6))
        t_bot = top + span * ((i + 1.6) / (tiers + 0.6))
        half = (w / 2 - 1) * (0.42 + 0.58 * (i + 1) / tiers)
        rows.append((t_top, t_bot, half))
    for t_top, t_bot, half in reversed(rows):  # draw bottom tier first, upper tiers overlap it
        for y in range(int(t_top), int(t_bot) + 1):
            k = (y - t_top) / max(1, t_bot - t_top)
            hw = half * (0.12 + 0.88 * k)
            jag = 1 if y >= t_bot - 1 and (y * 7 + int(hw)) % 3 == 0 else 0
            for x in range(int(cx - hw), int(cx + hw) + 1):
                if y >= int(t_bot) and (x % 3 == 0):
                    continue  # ragged needles at the tier's bottom edge
                rel = (x + 0.5 - cx) / max(hw, 1)
                v = 0.75 - rel * 0.9 - k * 0.35
                if snowy and k < 0.6 and (abs(x + 0.5 - cx) >= hw - 2 or y < t_top + 2 or y < t_top + (t_bot - t_top) * 0.25):
                    c.put(x, y, tone(SNOW, 0.6 - rel * 0.5, x, y))
                else:
                    c.put(x, y, tone(PINE, v, x, y))
                foliage.add((x, y))
                upper[(x, y)] = k < 0.5
            del jag
        # Shadow cast by this tier on the one below.
        for x in range(int(cx - half), int(cx + half) + 1):
            y = int(t_bot) + 1
            if (x, y) in foliage:
                c.put(x, y, PINE[0])
    if snowy:
        pass  # drawn with the tiers above
    outline(c)
    return to_rgba(c, (cx, ground + 0.5, w * 0.32, 2))


def palm_tree(seed):
    w, h = 56, 72
    rnd = random.Random(seed)
    c = Canvas(w, h)
    ground = h - 3
    base = (w / 2 - 4, ground)
    top = (w / 2 + 6, 20)
    ctrl = (w / 2 - 10, 42)
    # Curved trunk made of rings.
    steps = 60
    for i in range(steps + 1):
        t = i / steps
        x = (1 - t) ** 2 * base[0] + 2 * (1 - t) * t * ctrl[0] + t * t * top[0]
        y = (1 - t) ** 2 * base[1] + 2 * (1 - t) * t * ctrl[1] + t * t * top[1]
        half = 3.2 - t * 1.2
        ring = int(y) % 4 == 0
        for dx in range(-int(half) - 1, int(half) + 1):
            rel = (dx + half) / (2 * half)
            v = (0.6 if rel < 0.35 else 0.0 if rel < 0.75 else -0.6) - (0.6 if ring else 0)
            c.put(x + dx, y, tone(BARK, v, int(x + dx), int(y)))
    # Fronds: drooping curves with leaflets on both sides.
    tx, ty = top
    for a_deg, length in ((-168, 26), (-140, 22), (-108, 17), (-72, 17), (-40, 22), (-12, 26), (-196, 18), (16, 18)):
        a = math.radians(a_deg)
        n = int(length * 1.6)
        for i in range(n):
            t = i / n
            x = tx + math.cos(a) * length * t
            y = ty + math.sin(a) * length * t + (t ** 2) * length * 0.75
            # direction for the perpendicular
            nx, ny = -math.sin(a), math.cos(a)
            leaf = max(1.0, 6.5 * math.sin(math.pi * min(1, t * 1.15)))
            for s in (-1, 1):
                for k in range(1, int(leaf) + 1):
                    px = x + nx * k * s + math.cos(a) * k * 0.5
                    py = y + ny * k * s + abs(ny) * k * 0.6
                    if (i + k) % 3 == 0 and k > 1:
                        continue  # gaps between leaflets
                    v = 0.7 if s * ny < 0 else -0.1
                    c.put(px, py, tone(PALM, v - t * 0.5, int(px), int(py)))
            c.put(x, y, PALM[0])
    # Coconuts
    for ox, oy in ((-2, 3), (2, 4), (0, 6)):
        blob(c, tx + ox, ty + oy, 2.2, 2.2, [(70, 46, 30), (104, 70, 44), (140, 98, 62), (170, 128, 86)])
    outline(c)
    return to_rgba(c, (base[0] + 4, ground + 0.5, 12, 2.2))


def stump(seed):
    w, h = 26, 18
    c = Canvas(w, h)
    cx = w / 2
    # Side of the stump
    for y in range(6, h - 2):
        for x in range(3, w - 3):
            rel = (x - 3) / (w - 7)
            v = 0.5 if rel < 0.3 else -0.1 if rel < 0.75 else -0.7
            if x % 4 == 1:
                v -= 0.5
            c.put(x, y, tone(BARK, v, x, y))
    c.rect(2, h - 3, 3, 1, BARK[1])
    c.rect(w - 5, h - 3, 3, 1, BARK[0])
    # Top with growth rings
    for y in range(1, 11):
        for x in range(3, w - 3):
            dx, dy = (x + 0.5 - cx) / (w / 2 - 3), (y + 0.5 - 6) / 4.6
            d = dx * dx + dy * dy
            if d <= 1:
                ring = int(math.sqrt(d) * 4.5) % 2 == 1
                c.put(x, y, WOOD[2] if ring else WOOD[3])
                if d > 0.8:
                    c.put(x, y, WOOD[1])
    outline(c)
    return to_rgba(c, (cx, h - 2, 11, 2))


def bench(seed):
    w, h = 44, 26
    c = Canvas(w, h)
    # Back legs + backrest posts
    for x in (5, w - 7):
        c.rect(x, 2, 2, 18, WOOD[0])
    # Backrest planks
    for y in (3, 8):
        for x in range(3, w - 3):
            c.put(x, y, tone(WOOD, 0.6 if y == 3 else 0.3, x, y))
            c.put(x, y + 1, tone(WOOD, 0.0, x, y + 1))
            c.put(x, y + 2, WOOD[1])
    # Seat (seen slightly from above: 2 planks)
    for y in range(14, 19):
        for x in range(2, w - 2):
            v = 0.8 if y < 16 else 0.3 if y < 18 else -0.4
            c.put(x, y, tone(WOOD, v, x, y))
    # Metal armrests / front legs
    for x in (3, w - 5):
        c.rect(x, 11, 2, 4, METAL[1])
        c.rect(x, 19, 2, 6, METAL[1])
        c.put(x, 19, METAL[3])
    outline(c)
    return to_rgba(c, (w / 2, h - 1, 19, 2))


def barrel(seed):
    w, h = 20, 26
    c = Canvas(w, h)
    cx = w / 2
    for y in range(3, h - 2):
        t = (y - 3) / (h - 6)
        half = (w / 2 - 2) * (0.86 + 0.14 * math.sin(math.pi * t))
        for x in range(int(cx - half), int(cx + half) + 1):
            rel = (x + 0.5 - cx) / half
            v = 0.7 - rel * 0.9 - abs(rel) ** 3 * 0.6
            if int((x - cx) * 3 / half) != int((x + 1 - cx) * 3 / half):
                v -= 0.6  # stave joints
            pal = METAL if y in (6, 7, h - 6, h - 5) else WOOD
            c.put(x, y, tone(pal, v, x, y))
    # Open top
    for y in range(1, 6):
        for x in range(2, w - 2):
            dx, dy = (x + 0.5 - cx) / (w / 2 - 2), (y + 0.5 - 3.5) / 2.4
            if dx * dx + dy * dy <= 1:
                c.put(x, y, WOOD[0] if dx * dx + dy * dy < 0.55 else WOOD[2])
    outline(c)
    return to_rgba(c, (cx, h - 2, 9, 2))


def crate(seed):
    w, h = 24, 24
    c = Canvas(w, h)
    # Top face
    for y in range(2, 7):
        for x in range(2, w - 2):
            c.put(x, y, tone(WOOD, 0.8 if y < 4 else 0.5, x, y))
    # Front face: frame + planks + diagonal brace
    for y in range(7, h - 2):
        for x in range(2, w - 2):
            frame = x < 5 or x >= w - 5 or y < 9 or y >= h - 4
            v = 0.2 if frame else -0.2 - (0.4 if (y - 9) % 4 == 3 else 0)
            c.put(x, y, tone(WOOD, v, x, y))
    for i in range(w - 10):
        x, y = 5 + i, h - 5 - i * (h - 14) / (w - 10)
        c.put(x, y, WOOD[2])
        c.put(x, y + 1, WOOD[1])
    for x, y in ((4, 9), (w - 5, 9), (4, h - 5), (w - 5, h - 5)):
        c.put(x, y, METAL[2])
    outline(c)
    return to_rgba(c, (w / 2, h - 2, 11, 2))


def pumpkin(seed):
    w, h = 24, 20
    c = Canvas(w, h)
    cx, cy, rx, ry = w / 2, 12, 10, 7
    for y in range(int(cy - ry), int(cy + ry) + 1):
        for x in range(int(cx - rx), int(cx + rx) + 1):
            dx, dy = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if dx * dx + dy * dy > 1:
                continue
            v = shade(dx * rx, dy * ry, rx)
            # Ribs: darker where the lobes meet
            lobe = math.cos(dx * math.pi * 2.0 / math.sqrt(max(0.15, 1 - dy * dy * 0.6)))
            if lobe > 0.86:
                v -= 0.8
            c.put(x, y, tone(PUMPKIN, v, x, y))
    # Stem and a leaf
    c.rect(11, 3, 3, 3, (92, 112, 50))
    c.put(13, 2, (92, 112, 50))
    c.put(11, 3, (130, 150, 70))
    blob(c, 16.5, 4.5, 2.6, 1.6, LEAF)
    outline(c)
    return to_rgba(c, (cx, h - 2, 10, 1.8))


def rock(seed):
    w, h = 30, 20
    rnd = random.Random(seed)
    c = Canvas(w, h)
    blob(c, 13, 11, 10, 7.5, STONE)
    blob(c, 21, 13, 6.5, 5, STONE, light_bias=-0.15)
    blob(c, 6, 15, 4, 3, STONE, light_bias=-0.1)
    # Cracks and a bit of moss
    for x, y in ((10, 9), (11, 10), (11, 11), (12, 12)):
        c.put(x, y, STONE[0])
    for _ in range(10):
        x, y = rnd.randrange(5, 22), rnd.randrange(4, 9)
        if c.get(x, y) is not None and c.get(x, y - 1) is None:
            c.put(x, y, LEAF[2])
    outline(c)
    return to_rgba(c, (15, h - 2, 13, 2))


def flower_bush(seed, colors=(RED, PINK, YELLOW)):
    w, h = 30, 24
    rnd = random.Random(seed)
    c = Canvas(w, h)
    mask = set()
    for cx, cy, rx, ry in ((15, 13, 11, 8.5), (8, 15, 6, 5.5), (22, 15, 6, 5.5), (15, 8, 7, 5.5)):
        blob(c, cx, cy, rx, ry, LEAF, mask=mask)
    spots = [p for p in mask if p[1] < 17]
    rnd.shuffle(spots)
    placed = []
    for x, y in spots:
        if len(placed) >= 9:
            break
        if any(abs(x - px) + abs(y - py) < 5 for px, py in placed):
            continue
        pal = colors[len(placed) % len(colors)]
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            c.put(x + dx, y + dy, pal[2] if (dx, dy) != (0, -1) else pal[3])
        c.put(x, y, YELLOW[3])
        placed.append((x, y))
    outline(c)
    return to_rgba(c, (15, h - 2, 13, 2))


def balloons(seed):
    w, h = 30, 44
    c = Canvas(w, h)
    anchor = (15, h - 6)
    specs = ((9, 9, RED), (21, 8, BLUE), (15, 15, YELLOW))
    for bx, by, _ in specs:
        c.line(bx, by + 6, anchor[0], anchor[1], (230, 230, 230))
    for bx, by, pal in specs:
        blob(c, bx, by, 5, 6, pal)
        c.put(bx, by + 6, pal[1])
        c.put(bx - 2, by - 3, (255, 255, 255))
    # Little weight
    c.rect(12, h - 6, 6, 4, PINK[1])
    c.rect(12, h - 6, 6, 1, PINK[3])
    outline(c)
    return to_rgba(c, (15, h - 2, 6, 1.5))


def parasol(seed):
    w, h = 48, 50
    c = Canvas(w, h)
    cx = w / 2
    # Pole
    c.rect(cx - 1, 14, 2, h - 18, WOOD[1])
    c.rect(cx - 1, 14, 1, h - 18, WOOD[3])
    c.rect(cx - 5, h - 4, 10, 2, WOOD[0])
    # Thatched dome
    for y in range(2, 20):
        for x in range(1, w - 1):
            dx, dy = (x + 0.5 - cx) / (w / 2 - 2), (y + 0.5 - 18) / 15
            if dx * dx + dy * dy > 1 or y > 18:
                continue
            v = shade(dx * 20, dy * 15, 20)
            if int(math.atan2(dy, dx) * 9) % 2 == 0:
                v -= 0.35  # straw bundles
            c.put(x, y, tone(STRAW, v, x, y))
    # Fringe
    for x in range(2, w - 2):
        drop = 2 + (1 if x % 3 == 0 else 0) + (1 if x % 5 == 0 else 0)
        for k in range(drop):
            c.put(x, 19 + k, STRAW[1] if k else STRAW[2])
    outline(c)
    return to_rgba(c, (cx, h - 2, 18, 2.5))


def signpost(seed):
    w, h = 30, 40
    c = Canvas(w, h)
    c.rect(13, 6, 4, h - 8, WOOD[1])
    c.rect(13, 6, 1, h - 8, WOOD[3])
    c.rect(16, 6, 1, h - 8, WOOD[0])

    def board(y, right):
        for yy in range(y, y + 7):
            for x in range(3, 27):
                tip = abs(yy - (y + 3))
                if right and x > 23 - (3 - tip):
                    continue
                if not right and x < 6 + (3 - tip) - 3 + 3 and x < 3 + tip:
                    continue
                v = 0.6 if yy == y else -0.3 if yy == y + 6 else 0.1
                c.put(x, yy, tone(WOOD, v, x, yy))
        for x in range(8, 20, 2):
            c.put(x, y + 3, WOOD[0])  # carved writing

    board(7, True)
    board(17, False)
    outline(c)
    return to_rgba(c, (15, h - 2, 6, 1.5))


def mailbox(seed):
    w, h = 20, 34
    c = Canvas(w, h)
    c.rect(9, 14, 3, h - 16, WOOD[1])
    c.rect(9, 14, 1, h - 16, WOOD[3])
    for y in range(3, 15):
        for x in range(3, 17):
            top = y < 7 and ((x + 0.5 - 10) / 7) ** 2 + ((y + 0.5 - 7) / 4) ** 2 > 1
            if top:
                continue
            rel = (x - 3) / 13
            v = 0.6 if rel < 0.3 else 0.0 if rel < 0.75 else -0.6
            c.put(x, y, tone(BLUE, v, x, y))
    c.rect(5, 9, 6, 1, BLUE[0])  # letter slot
    c.rect(17, 5, 1, 7, RED[1])  # flag
    c.rect(17, 5, 3, 3, RED[2])
    outline(c)
    return to_rgba(c, (10, h - 2, 6, 1.5))


def lamp_post(seed):
    w, h = 20, 56
    c = Canvas(w, h)
    cx = w // 2
    c.rect(cx - 1, 14, 2, h - 18, METAL[1])
    c.rect(cx - 1, 14, 1, h - 18, METAL[2])
    c.rect(cx - 3, h - 5, 6, 3, METAL[0])
    c.rect(cx - 3, h - 5, 6, 1, METAL[2])
    # Lantern head with a warm glow
    c.rect(cx - 5, 3, 10, 2, METAL[1])
    c.rect(cx - 3, 1, 6, 2, METAL[0])
    for y in range(5, 13):
        for x in range(cx - 4, cx + 4):
            edge = x in (cx - 4, cx + 3) or y == 12
            c.put(x, y, METAL[1] if edge else FLAME[3] if y < 9 else FLAME[2])
    c.rect(cx - 5, 13, 10, 1, METAL[1])
    outline(c)
    return to_rgba(c, (cx, h - 2, 6, 1.5))


def torch(seed):
    w, h = 12, 36
    c = Canvas(w, h)
    c.rect(5, 12, 2, h - 14, WOOD[1])
    c.rect(5, 12, 1, h - 14, WOOD[3])
    c.rect(3, 9, 6, 4, STRAW[1])  # wrapped head
    c.rect(3, 9, 6, 1, STRAW[2])
    for y in range(1, 10):
        for x in range(2, 10):
            dx = (x + 0.5 - 6) / (3.6 * (y / 9) + 0.5)
            if abs(dx) > 1:
                continue
            c.put(x, y, FLAME[3] if abs(dx) < 0.35 and y > 4 else FLAME[2] if abs(dx) < 0.7 else FLAME[1])
    outline(c)
    return to_rgba(c, (6, h - 2, 3, 1))


PROPS = [
    # name, drawing
    ("tree_round_s", lambda: round_tree("s", 3)),
    ("tree_round_m", lambda: round_tree("m", 5)),
    ("tree_round_l", lambda: round_tree("l", 8)),
    ("pine_s", lambda: pine_tree("s", 2)),
    ("pine_m", lambda: pine_tree("m", 4)),
    ("pine_l", lambda: pine_tree("l", 6)),
    ("palm", lambda: palm_tree(1)),
    ("tree_round_snow", lambda: round_tree("l", 8, snowy=True)),
    ("pine_snow", lambda: pine_tree("l", 6, snowy=True)),
    ("stump", lambda: stump(1)),
    ("bench", lambda: bench(1)),
    ("barrel", lambda: barrel(1)),
    ("crate", lambda: crate(1)),
    ("pumpkin", lambda: pumpkin(1)),
    ("rock", lambda: rock(3)),
    ("flower_bush", lambda: flower_bush(4)),
    ("balloons", lambda: balloons(1)),
    ("parasol", lambda: parasol(1)),
    ("signpost", lambda: signpost(1)),
    ("mailbox", lambda: mailbox(1)),
    ("lamp_post", lambda: lamp_post(1)),
    ("torch", lambda: torch(1)),
]


def preview(images, scale=3, cols=8, pad=6):
    """All props on a grass background, bottom-aligned per row."""
    rows = [images[i:i + cols] for i in range(0, len(images), cols)]
    cell_w = max(len(img[0]) for _, img in images) + pad
    row_hs = [max(len(img) for _, img in row) + pad for row in rows]
    W, H = cell_w * cols * scale, sum(row_hs) * scale
    grass = [(147, 197, 106), (132, 182, 92)]
    out = [[(*grass[((x // (8 * scale)) + (y // (8 * scale))) % 2], 255) for x in range(W)] for y in range(H)]
    top = 0
    for row, rh in zip(rows, row_hs):
        for i, (_, img) in enumerate(row):
            ih, iw = len(img), len(img[0])
            ox = (i * cell_w + (cell_w - iw) // 2) * scale
            oy = (top + rh - pad // 2 - ih) * scale
            for y in range(ih):
                for x in range(iw):
                    r, g, b, a = img[y][x]
                    if a == 0:
                        continue
                    for sy in range(scale):
                        for sx in range(scale):
                            br, bg, bb, _ = out[oy + y * scale + sy][ox + x * scale + sx]
                            k = a / 255
                            out[oy + y * scale + sy][ox + x * scale + sx] = (
                                int(r * k + br * (1 - k)), int(g * k + bg * (1 - k)), int(b * k + bb * (1 - k)), 255)
        top += rh
    return out


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    os.makedirs(os.path.dirname(PREVIEW), exist_ok=True)
    images = []
    for name, draw in PROPS:
        img = draw()
        pngio.save(os.path.join(OUT_DIR, f"{name}.png"), img)
        images.append((name, img))
        print(f"{name}: {len(img[0])}x{len(img)}")
    pngio.save(PREVIEW, preview(images))
    print("preview:", PREVIEW)


if __name__ == "__main__":
    main()
