"""Build the game's character sheets: 32x200 RGBA, four 32x50 frames top->bottom (down, left, right, up).

Both characters get the same body height (FIGURE_H) with feet on the same row (FEET_ROW) in every frame,
so they look the same size and don't jump when turning.

    python3 build_sheets.py   # writes ../../public/assets/characters/{male,female}.png
"""
import os
import sys
from collections import deque

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from pngio import load, save

FRAME_W, FRAME_H, FRAMES = 32, 50, 4
FIGURE_H = 40  # body height in pixels (male art at exactly 2x)
FEET_ROW = 48  # rows [FEET_ROW, FRAME_H) stay empty below the feet
OUT_DIR = os.path.join(HERE, "../../public/assets/characters")
CLEAR = (0, 0, 0, 0)


def bbox(grid):
    pts = [(x, y) for y, row in enumerate(grid) for x, p in enumerate(row) if p[3]]
    xs, ys = [p[0] for p in pts], [p[1] for p in pts]
    return min(xs), min(ys), max(xs) + 1, max(ys) + 1


def place(grid):
    """Crop to the figure, then paste it centred with its feet on FEET_ROW."""
    x0, y0, x1, y1 = bbox(grid)
    w, h = x1 - x0, y1 - y0
    assert w <= FRAME_W and h <= FEET_ROW, f"figure {w}x{h} does not fit"
    frame = [[CLEAR] * FRAME_W for _ in range(FRAME_H)]
    ox, oy = (FRAME_W - w) // 2, FEET_ROW - h
    for y in range(h):
        for x in range(w):
            frame[oy + y][ox + x] = grid[y0 + y][x0 + x]
    return frame


def male_frames():
    # Native 32x128 pixel art: scale 2x (nearest) so the 20 px body becomes 40 px.
    w, h, px = load(os.path.join(HERE, "male-original.png"))
    cell = h // FRAMES
    frames = []
    for f in range(FRAMES):
        src = px[f * cell:(f + 1) * cell]
        x0, y0, x1, y1 = bbox(src)
        k = FIGURE_H // (y1 - y0)
        assert k * (y1 - y0) == FIGURE_H, "male body height must divide FIGURE_H"
        frames.append(place([[src[y // k][x // k] for x in range(w * k)] for y in range(cell * k)]))
    return frames


def female_frames():
    # Upscaled source with a baked grey checkerboard: resample at the target resolution, then
    # flood-fill the checkerboard from the border (stops at the dark outline), like clean_female.py.
    W, H, px = load(os.path.join(HERE, "female-original.png"))
    fh = H // FRAMES
    sprite_px = W / 32  # source pixels per original sprite pixel
    body_h = 24  # body height of the "down" frame in original sprite pixels
    scale = FIGURE_H / body_h  # output pixels per original sprite pixel (one scale for all frames)
    n = round(32 * scale)
    step = sprite_px / scale

    def is_checker(p):
        r, g, b, _ = p
        return max(r, g, b) - min(r, g, b) <= 16 and min(r, g, b) >= 140

    frames = []
    for f in range(FRAMES):
        grid = [[px[min(H - 1, int(f * fh + (y + 0.5) * step))][min(W - 1, int((x + 0.5) * step))] for x in range(n)] for y in range(n)]
        seen = [[False] * n for _ in range(n)]
        q = deque([(x, y) for x in range(n) for y in (0, n - 1)] + [(x, y) for y in range(n) for x in (0, n - 1)])
        while q:
            x, y = q.popleft()
            if not (0 <= x < n and 0 <= y < n) or seen[y][x] or not is_checker(grid[y][x]):
                continue
            seen[y][x] = True
            q.extend(((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)))
        frames.append(place([[CLEAR if seen[y][x] else (*grid[y][x][:3], 255) for x in range(n)] for y in range(n)]))
    return frames


for name, frames in (("male", male_frames()), ("female", female_frames())):
    out = os.path.join(OUT_DIR, f"{name}.png")
    save(out, [row for frame in frames for row in frame])
    for i, fr in enumerate(frames):
        x0, y0, x1, y1 = bbox(fr)
        print(f"{name} frame {i}: body {x1 - x0}x{y1 - y0} at x{x0}-{x1 - 1} y{y0}-{y1 - 1}")
    print("saved", os.path.normpath(out), f"{FRAME_W}x{FRAME_H * FRAMES}")
