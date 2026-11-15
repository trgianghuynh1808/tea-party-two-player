"""Cut a single item out of a white background and trim it.

    python cutout_white.py <in.png> <out.png>   # needs Pillow, NumPy, SciPy

- Near-white pixels connected to the image border become transparent (white inside the outline stays).
- Only the largest remaining blob is kept (drops crop leftovers such as bits of neighbouring art).
- A 1 px light fringe along the cut is removed so no white halo shows on dark floors.
"""
import sys

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

WHITE_MIN, WHITE_SPREAD, FRINGE_MIN = 238, 14, 215

src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert("RGBA")).copy()
rgb = a[..., :3].astype(int)
white = (rgb.min(-1) >= WHITE_MIN) & (rgb.max(-1) - rgb.min(-1) <= WHITE_SPREAD)
lab, _ = ndi.label(white)
border = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
bg = np.isin(lab, list(border))
bg |= ndi.binary_dilation(bg) & (rgb.min(-1) >= FRINGE_MIN)
fg, n = ndi.label(~bg)
keep = fg == (int(np.argmax(ndi.sum(~bg, fg, range(1, n + 1)))) + 1)
keep = ndi.binary_fill_holes(keep)
a[..., 3] = np.where(keep, a[..., 3], 0)
ys, xs = np.nonzero(keep)
Image.fromarray(a[ys.min():ys.max() + 1, xs.min():xs.max() + 1]).save(out)
print(f"saved {out} ({xs.max() - xs.min() + 1}x{ys.max() - ys.min() + 1})")
