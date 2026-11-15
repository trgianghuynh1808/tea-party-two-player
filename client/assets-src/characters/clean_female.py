"""Turn the upscaled female sheet (392x1568, baked checkerboard) into a clean 32x128 RGBA sprite sheet."""
import sys
from collections import deque
sys.path.insert(0, '/tmp/boba-sprite-tools')
from pngio import load, save

src, out = sys.argv[1], sys.argv[2]
W, H, px = load(src)
FRAMES, CELL = 4, 32
fw, fh = W, H // FRAMES
sx, sy = fw / CELL, fh / CELL  # source pixels per sprite pixel (~12.25)

def is_checker(p):
    r, g, b, _ = p
    return max(r, g, b) - min(r, g, b) <= 16 and min(r, g, b) >= 140  # light/mid grey, unsaturated

sheet = []
for f in range(FRAMES):
    # 1) nearest-neighbour downsample: sample the centre of each sprite pixel
    grid = [[px[int(f * fh + (y + 0.5) * sy)][int((x + 0.5) * sx)] for x in range(CELL)] for y in range(CELL)]
    # 2) flood-fill the checkerboard from the frame border; stops at the dark outline
    seen = [[False] * CELL for _ in range(CELL)]
    q = deque((x, y) for x in range(CELL) for y in (0, CELL - 1)) + deque((x, y) for y in range(CELL) for x in (0, CELL - 1))
    while q:
        x, y = q.popleft()
        if not (0 <= x < CELL and 0 <= y < CELL) or seen[y][x] or not is_checker(grid[y][x]): continue
        seen[y][x] = True
        q.extend(((x+1, y), (x-1, y), (x, y+1), (x, y-1)))
    for y in range(CELL):
        sheet.append([(0, 0, 0, 0) if seen[y][x] else (*grid[y][x][:3], 255) for x in range(CELL)])

save(out, sheet)
print("saved", out, f"{CELL}x{CELL*FRAMES}")
