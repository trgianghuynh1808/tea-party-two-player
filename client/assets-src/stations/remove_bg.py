"""Make the light background around a station image transparent (flood fill from the border).

    python3 remove_bg.py <in.png> <out.png>

Accepts 8-bit RGB or RGBA PNGs; writes RGBA. Only background connected to the image border is removed,
so light pixels inside the dark outline are kept.
"""
import os
import struct
import sys
import zlib
from collections import deque

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "../characters"))
from pngio import save


def load_any(path):
    d = open(path, "rb").read()
    i, idat = 8, b""
    while i < len(d):
        l, t = struct.unpack(">I4s", d[i:i + 8])
        c = d[i + 8:i + 8 + l]
        if t == b"IHDR":
            w, h, bd, ct = struct.unpack(">IIBB", c[:10])
            assert bd == 8 and ct in (2, 6), "expects 8-bit RGB or RGBA"
        if t == b"IDAT":
            idat += c
        i += 12 + l
    bpp = 4 if ct == 6 else 3
    raw, st, rows, prev, o = zlib.decompress(idat), w * bpp, [], bytearray(w * bpp), 0
    for _ in range(h):
        f = raw[o]; o += 1
        line = bytearray(raw[o:o + st]); o += st
        for x in range(st):
            a = line[x - bpp] if x >= bpp else 0
            b = prev[x]
            c = prev[x - bpp] if x >= bpp else 0
            if f == 1: line[x] = (line[x] + a) & 255
            elif f == 2: line[x] = (line[x] + b) & 255
            elif f == 3: line[x] = (line[x] + (a + b) // 2) & 255
            elif f == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[x] = (line[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        rows.append(line); prev = line
    return w, h, [[tuple(r[x * bpp:x * bpp + 3]) + ((r[x * bpp + 3],) if bpp == 4 else (255,)) for x in range(w)] for r in rows]


def is_background(p):
    r, g, b, a = p
    return a == 0 or min(r, g, b) >= 200  # white / very light


src, out = sys.argv[1], sys.argv[2]
w, h, px = load_any(src)
seen = [[False] * w for _ in range(h)]
q = deque([(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)])
while q:
    x, y = q.popleft()
    if not (0 <= x < w and 0 <= y < h) or seen[y][x] or not is_background(px[y][x]):
        continue
    seen[y][x] = True
    q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
save(out, [[(0, 0, 0, 0) if seen[y][x] else px[y][x] for x in range(w)] for y in range(h)])
print(f"saved {out} ({w}x{h}), {sum(map(sum, seen))} background pixels cleared")
