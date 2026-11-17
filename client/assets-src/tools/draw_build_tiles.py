"""Draw the yard's walls, fences and doors as thin, connecting pixel-art pieces.

Usage:  python3 client/assets-src/tools/draw_build_tiles.py
Writes  client/public/assets/build/<kind>_<mask>.png  for every wall / fence kind and every neighbour mask,
        client/public/assets/build/door_h.png, door_v.png
and     client/assets-src/yard/build_preview.png      (a few sample layouts, 3x)

A piece is one 40 px cell seen in 3/4 view. Its floor footprint is a thin strip through the middle of the cell
(a centre post plus an arm towards each connected neighbour); the art stands on that footprint and rises
HEIGHT px above it, so the image is 40 wide and 40 + HEIGHT tall, anchored at the cell's bottom-left corner.
Mask bits: 1 = north, 2 = east, 4 = south, 8 = west (keep in sync with shared/src/world.ts).
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "characters"))
import pngio  # noqa: E402

ROOT = os.path.abspath(os.path.join(HERE, "..", "..", ".."))
OUT_DIR = os.path.join(ROOT, "client", "public", "assets", "build")
PREVIEW = os.path.join(ROOT, "client", "assets-src", "yard", "build_preview.png")

T = 40
N, E, S, W = 1, 2, 4, 8

# Must match WALL_HEIGHT / WALL_THICKNESS / FENCE_* in shared/src/world.ts.
WALL_H = 34
WALL_T = 16
FENCE_H = 20
FENCE_T = 6

BAYER = [[0.0, 0.5], [0.75, 0.25]]


def tone(palette, v, x, y):
    n = len(palette)
    i = (v + 1) / 2 * (n - 1) + (BAYER[y % 2][x % 2] - 0.5) * 0.6
    return palette[max(0, min(n - 1, int(round(i))))]


def darker(c, k):
    return tuple(int(v * k) for v in c)


def clean_top(palette, edge):
    """Top of a wall: one flat colour (no dither), a light lip on the edge facing the viewer, a darker back edge."""
    return palette[3] if edge == "front" else palette[1] if edge == "back" else palette[2]


# ---------------------------------------------------------------- materials
# Each material paints the front face (facing the viewer) and the top face of a wall.
# Coordinates passed in are cell-local (0..39) so patterns line up across neighbouring cells.


class Brick:
    face = [(120, 52, 40), (150, 66, 48), (172, 82, 58), (190, 104, 76)]
    mortar = (196, 176, 156)
    top = [(150, 140, 128), (176, 166, 152), (200, 190, 176), (222, 214, 202)]

    def front(self, x, y, fy):
        """fy = height above the ground (0 at the bottom of the wall)."""
        row = fy // 5
        if fy % 5 == 4:
            return self.mortar
        if (x + (5 if row % 2 else 0)) % 10 == 9:
            return self.mortar
        v = 0.15 - (0.35 if fy < 3 else 0) + (0.25 if fy > WALL_H - 5 else 0)
        if (x * 7 + row * 13) % 11 == 0:
            v -= 0.45  # an odd darker brick
        return tone(self.face, v, x, y)

    def top_face(self, x, y, edge):
        return clean_top(self.top, edge)


class Wood:
    face = [(92, 60, 42), (118, 80, 56), (142, 100, 70), (164, 122, 88)]
    top = [(104, 70, 48), (136, 94, 64), (166, 120, 84), (190, 146, 106)]

    def front(self, x, y, fy):
        if x % 8 == 7:
            return self.face[0]  # gap between planks
        v = -0.1 + (0.35 if x % 8 == 0 else 0) - (0.4 if fy < 3 else 0)
        if (x // 8 * 5 + fy) % 13 == 0:
            v -= 0.5  # knots / grain
        return tone(self.face, v, x, y)

    def top_face(self, x, y, edge):
        return clean_top(self.top, edge)


class Plaster:
    face = [(196, 184, 168), (218, 208, 194), (236, 228, 216), (248, 244, 236)]
    skirting = [(110, 78, 56), (140, 100, 72)]
    top = [(128, 92, 66), (156, 114, 82), (182, 138, 100), (204, 162, 122)]

    def front(self, x, y, fy):
        if fy < 4:
            return self.skirting[1] if fy == 3 else self.skirting[0]
        v = 0.25 - (0.5 if fy < 6 else 0) + (0.2 if fy > WALL_H - 4 else 0)
        return tone(self.face, v, x, y)

    def top_face(self, x, y, edge):
        return clean_top(self.top, edge)


MATERIALS = {"wall_brick": Brick(), "wall_wood": Wood(), "wall_white": Plaster()}

FENCE_WOOD = [(96, 66, 46), (128, 90, 62), (160, 118, 82), (190, 150, 108)]


# ---------------------------------------------------------------- geometry


def footprint(mask, thick):
    """Floor rects (x0, y0, x1, y1) of a piece: centre post + an arm per connected side."""
    a, b = (T - thick) // 2, (T + thick) // 2
    rects = [("c", a, a, b, b)]
    if mask & N:
        rects.append(("n", a, 0, b, a))
    if mask & S:
        rects.append(("s", a, b, b, T))
    if mask & E:
        rects.append(("e", b, a, T, b))
    if mask & W:
        rects.append(("w", 0, a, a, b))
    return rects


class Img:
    def __init__(self, w, h):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]
        self.shadow = set()

    def put(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = c

    def get(self, x, y):
        return self.px[y][x] if 0 <= x < self.w and 0 <= y < self.h else None

    def outline(self, k=0.55, skip_edges=()):
        adds = []
        for y in range(self.h):
            for x in range(self.w):
                if self.px[y][x] is not None:
                    continue
                for nx, ny in ((x, y + 1), (x, y - 1), (x + 1, y), (x - 1, y)):
                    n = self.get(nx, ny)
                    if n is not None:
                        adds.append((x, y, darker(n, k)))
                        break
        for x, y, c in adds:
            self.px[y][x] = c

    def rgba(self):
        out = []
        for y in range(self.h):
            row = []
            for x in range(self.w):
                p = self.px[y][x]
                if p is not None:
                    row.append((p[0], p[1], p[2], 255))
                elif (x, y) in self.shadow:
                    row.append((30, 36, 20, 64))
                else:
                    row.append((0, 0, 0, 0))
            out.append(row)
        return out


def wall_piece(material, mask, door_south=False):
    """`door_south`: the south neighbour is a door, so the arm towards it ends with a visible front face."""
    H = WALL_H
    img = Img(T, T + H)
    rects = footprint(mask, WALL_T)
    # Which footprint edges face the viewer (front face visible): horizontal parts always;
    # the centre only if the wall doesn't continue south; the south arm only if it ends at a door.
    def exposed(name):
        if name in ("e", "w"):
            return True
        if name == "c":
            return not (mask & S) or door_south
        if name == "s":
            return door_south
        return False

    # Front faces first (top faces of the run going south cover them).
    for name, x0, y0, x1, y1 in rects:
        if not exposed(name):
            continue
        if name == "c" and (mask & S) and door_south:
            continue  # the south arm's face is the visible one
        for fy in range(H):
            y = y1 + H - 1 - fy  # image y (image top = ground y - H)
            for x in range(x0, x1):
                img.put(x, y, material.front(x, y, fy))
        # A soft shadow on the ground in front of the wall.
        for x in range(x0, x1):
            for d in range(1, 4):
                img.shadow.add((x, y1 + H - 1 + d))
    # Top faces.
    for name, x0, y0, x1, y1 in rects:
        for y in range(y0, y1):
            for x in range(x0, x1):
                yy = y  # image y = ground y - H + H
                cx0, cy0, cx1, cy1 = rects[0][1:]
                edge = "front" if y == y1 - 1 and name in ("c", "e", "w") and (name != "c" or exposed("c")) else \
                    "back" if y == y0 and name in ("c", "e", "w") and not (name == "c" and mask & N) else ""
                if name in ("n", "s") and (x == x0 or x == x1 - 1):
                    edge = "back" if x == x1 - 1 else "front"
                if name == "s" and door_south and y == y1 - 1:
                    edge = "front"
                img.put(x, yy, material.top_face(x, yy, edge))
    img.outline()
    return img


def fence_piece(mask):
    H = FENCE_H
    img = Img(T, T + H)
    a, b = (T - FENCE_T) // 2, (T + FENCE_T) // 2
    ground = lambda y: y + H  # image y of a floor y
    rails = (6, 14)  # heights of the two rails above the ground

    def wood(v, x, y):
        return tone(FENCE_WOOD, v, x, y)

    # Rails running north / south (seen from above: thin strips, the upper rail drawn last).
    for h in rails:
        for name, bit, y0, y1 in (("n", N, 0, a), ("s", S, b, T)):
            if not mask & bit:
                continue
            for y in range(y0, y1):
                for x in range(a + 1, b - 1):
                    img.put(x, ground(y) - h, wood(0.4 if x == a + 1 else -0.2, x, y))
    # Rails running east / west (seen from the front: 3 px tall boards).
    for h in rails:
        for bit, x0, x1 in ((E, b - 1, T), (W, 0, a + 1)):
            if not mask & bit:
                continue
            gy = ground((a + b) // 2)
            for x in range(x0, x1):
                for k in range(3):
                    y = gy - h - k
                    img.put(x, y, wood(0.5 if k == 2 else -0.1 if k == 1 else -0.6, x, y))
    # The post, in front of the rails: a squared log with a pointed cap.
    post_bottom = ground(b) - 1
    post_top = post_bottom - (H + 3)
    for y in range(post_top, post_bottom + 1):
        for x in range(a, b):
            rel = (x - a) / (FENCE_T - 1)
            v = 0.55 if rel < 0.3 else 0.0 if rel < 0.7 else -0.55
            if y > post_bottom - 2:
                v -= 0.4
            if (y * 3 + x) % 9 == 0:
                v -= 0.35
            img.put(x, y, wood(v, x, y))
    for k, (x0, x1) in enumerate(((a + 2, b - 2), (a + 1, b - 1))):
        for x in range(x0, x1):
            img.put(x, post_top - 2 + k, wood(0.6 if x < (a + b) / 2 else -0.2, x, post_top - 2 + k))
    for x in range(a, b):
        for d in range(1, 3):
            img.shadow.add((x, post_bottom + d))
    img.outline()
    return img


def door_piece(vertical):
    """A doorway in a wall line: walk through it. Frame posts + lintel at wall height, open leaf, threshold."""
    H = WALL_H
    img = Img(T, T + H)
    frame = Wood()
    a, b = (T - WALL_T) // 2, (T + WALL_T) // 2
    if not vertical:
        # Threshold on the floor between the posts.
        for y in range(a + H, b + H):
            for x in range(4, T - 4):
                img.put(x, y, tone(frame.top, 0.3 if y == a + H else -0.1, x, y))
        # Posts (front faces) at both ends, and the lintel across the top.
        for x0, x1 in ((0, 4), (T - 4, T)):
            for fy in range(H):
                y = b + H - 1 - fy
                for x in range(x0, x1):
                    img.put(x, y, tone(frame.face, 0.4 if x == x0 else -0.3, x, y))
        for fy in range(H - 6, H):
            y = b + H - 1 - fy
            for x in range(0, T):
                img.put(x, y, tone(frame.face, 0.1 if fy < H - 1 else 0.6, x, y))
        for y in range(a, b):
            for x in range(0, T):
                img.put(x, y, frame.top_face(x, y, "front" if y == b - 1 else "back" if y == a else ""))
        # Door leaf swung open against the left post (seen edge-on), with a brass knob.
        for fy in range(H - 7):
            y = b + H - 1 - fy
            for x in range(4, 9):
                img.put(x, y, tone(frame.face, 0.5 if x == 4 else 0.0, x, y))
        img.put(7, b + H - 14, (240, 200, 90))
    else:
        # Wall runs north-south: an opening in it (the wall ends on both sides), with a threshold on the floor.
        for y in range(H + 3, T + H - 3):
            for x in range(a - 2, b + 2):
                img.put(x, y, tone(frame.top, 0.5 if x == a - 2 else -0.3 if x == b + 1 else 0.15, x, y))
    img.outline()
    return img


# ---------------------------------------------------------------- preview

def composite(layout, pieces, scale=3):
    """layout: rows of strings; W/B/P = wood/brick/plaster wall, F = fence, D = door, . = floor."""
    kinds = {"W": "wall_wood", "B": "wall_brick", "P": "wall_plaster", "F": "fence", "D": "door"}
    rows, cols = len(layout), len(layout[0])
    Wpx, Hpx = cols * T, rows * T + WALL_H
    grass = [(147, 197, 106), (138, 188, 98)]
    floor = (200, 150, 106)
    out = [[grass[((x // 8) + (y // 8)) % 2] for x in range(Wpx)] for y in range(Hpx)]
    def at(r, c):
        return layout[r][c] if 0 <= r < rows and 0 <= c < cols else "."
    # Floor: every cell of a house (walls included) has floor; same trimming rule as the game (YardView):
    # under a wall, the floor stops on the sides whose neighbour has no floor, so nothing sticks out.
    has_floor = set()
    for r in range(rows):
        inside = False
        for c in range(cols):
            pass
    # Houses = wall/door cells and the '.' cells they enclose (flood fill from the border = outside).
    outside, todo = set(), [(0, 0)]
    while todo:
        r, c = todo.pop()
        if (r, c) in outside or not (0 <= r < rows and 0 <= c < cols) or at(r, c) not in ".F":
            continue
        outside.add((r, c))
        todo += [(r + 1, c), (r - 1, c), (r, c + 1), (r, c - 1)]
    for r in range(rows):
        for c in range(cols):
            if (r, c) not in outside and at(r, c) != "F":
                has_floor.add((r, c))
    a, b = (T - WALL_T) // 2, (T + WALL_T) // 2
    for r, c in has_floor:
        x0, y0, x1, y1 = 0, 0, T, T
        if at(r, c) != ".":
            if (r - 1, c) not in has_floor: y0 = a
            if (r + 1, c) not in has_floor: y1 = b
            if (r, c - 1) not in has_floor: x0 = a
            if (r, c + 1) not in has_floor: x1 = b
        for y in range(y0, y1):
            for x in range(x0, x1):
                out[WALL_H + r * T + y][c * T + x] = floor
    # Draw pieces from the top row down so lower ones overlap.
    for r in range(rows):
        for c in range(cols):
            ch = at(r, c)
            if ch == ".":
                continue
            conn = lambda rr, cc: at(rr, cc) != "."
            if ch == "D":
                img = pieces["door_v" if conn(r - 1, c) and conn(r + 1, c) else "door_h"]
            else:
                mask = (N if conn(r - 1, c) else 0) | (E if conn(r, c + 1) else 0) | (S if conn(r + 1, c) else 0) | (W if conn(r, c - 1) else 0)
                name = "fence" if ch == "F" else {"W": "wall_wood", "B": "wall_brick", "P": "wall_white"}[ch]
                key = f"{name}_{mask}" + ("d" if ch != "F" and at(r + 1, c) == "D" else "")
                img = pieces[key]
            for y in range(len(img)):
                for x in range(T):
                    p = img[y][x]
                    if p[3] == 0:
                        continue
                    oy, ox = r * T + y, c * T + x
                    k = p[3] / 255
                    o = out[oy][ox]
                    out[oy][ox] = tuple(int(p[i] * k + o[i] * (1 - k)) for i in range(3))
    big = []
    for row in out:
        line = [(*p, 255) for p in row for _ in range(scale)]
        for _ in range(scale):
            big.append(line)
    return big


def main():
    os.makedirs(OUT_DIR, exist_ok=True)
    pieces = {}
    for kind, material in MATERIALS.items():
        for mask in range(16):
            img = wall_piece(material, mask).rgba()
            pngio.save(os.path.join(OUT_DIR, f"{kind}_{mask}.png"), img)
            pieces[f"{kind}_{mask}"] = img
            if mask & S:
                # Same piece when the south neighbour is a door (its wall end faces the viewer).
                img = wall_piece(material, mask, door_south=True).rgba()
                pngio.save(os.path.join(OUT_DIR, f"{kind}_{mask}d.png"), img)
                pieces[f"{kind}_{mask}d"] = img
    for mask in range(16):
        img = fence_piece(mask).rgba()
        pngio.save(os.path.join(OUT_DIR, f"fence_{mask}.png"), img)
        pieces[f"fence_{mask}"] = img
    for name, vertical in (("door_h", False), ("door_v", True)):
        img = door_piece(vertical).rgba()
        pngio.save(os.path.join(OUT_DIR, f"{name}.png"), img)
        pieces[name] = img

    layout = [
        "...........................",
        ".BBBBBB..WWWWW..PPPPPP.....",
        ".B....B..W...W..P....P.FFFF",
        ".B....B..W...D..P....P.F..F",
        ".B....B..W...W..PPDPPP.F..F",
        ".BBDBBB..WWWWW.........FFFF",
        "...........................",
    ]
    pngio.save(PREVIEW, composite(layout, pieces))
    print(f"{len(pieces)} pieces -> {OUT_DIR}")
    print("preview:", PREVIEW)


if __name__ == "__main__":
    main()
