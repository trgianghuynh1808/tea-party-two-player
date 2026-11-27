"""Cut the furniture out of the room scenes in client/assets-src/sheets/<key>-original.png.

The pieces stand on a patterned floor / wall, so slice_sheet.py can't separate them: instead each piece has a
hand-picked box, and the background is the floor + wall palette (sampled from empty areas, see SCENES) flood-filled
in from the box edges. Drop shadows (floor colours, darker) are background too when a scene sets `shadows`.

Scenes: bedroom* (bedrooms), living (req-1 living room: blue wall, wood floor/skirting; wall has a
dark trim stripe at y~148-156 and a painting at x~346..380 that the bg boxes avoid), kitchen-scene
(req-2 kitchen: white subway tiles behind the counter row, a corn basket hanging over the drawer
cabinet and a kettle on the stove that the boxes cut below, a vase on the fridge, and the dining
chair between the table legs cleaned up with erase boxes), kitchen-pro (T33 req-1: restaurant steel
kitchen on white-brick wall/grey floor - full-box cuts, wall around the prep-table crates erased),
kitchen-pink (T33 req-3: pink kitchen on striped wall/pink wood floor - full-box cuts, the low
cabinet's cluttered top surface erased).

Needs Pillow, NumPy and SciPy (see slice_sheet.py). From client/assets-src/tools/:
    python cut_bedroom.py ../sheets ../../public/assets/decor            # every scene
    python cut_bedroom.py ../sheets ../../public/assets/decor bedroom-3  # one scene

Modes (per scene, or per item to override):
- palette (default): background = colours of the `bg` sample boxes (within `tolerance`), flood-filled from the edges.
- outline: background = anything lighter than `dark` (luminance) reachable from the box edges; for clean pixel art
  whose pieces have closed dark outlines (shadows and wood that matches the floor don't matter then).

Item options:
- box: (x0, y0, x1, y1) in the scene.
- h: output height in px (= 2x the in-game imageHeight / wall height, like the other decor art).
- holes: also clear enclosed background areas of at least this many px (floor seen between chair slats...).
- keep_bg: sample boxes whose colours must NOT count as background for this piece (e.g. a rug under it).
- extra_bg: sample boxes whose colours DO count as background for this piece (e.g. the rug it stands on).
- mirror_x: right half = mirrored left half (hidden by text). fill_top: top N% of rows = mirrored bottom rows.
- drop_reddish: drop brownish pixels (floor shadow around a grey piece). drop_green: drop green/teal pixels.
- shadows: override the scene's shadow detection.
- erase: boxes (scene coords) to clear, e.g. a neighbour overlapping the piece.
"""
import os
import sys
from collections import Counter

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

SCENES = {
    "bedroom": {
        "tolerance": 3,
        "bg": [(560, 290, 660, 420), (220, 380, 320, 460), (600, 560, 760, 680), (760, 290, 960, 370), (205, 20, 480, 60), (600, 20, 790, 100)],
        "items": {
            "bedroom/bed.png": {"box": (203, 132, 322, 374), "h": 182},
            "bedroom/nightstand_lamp.png": {"box": (320, 64, 455, 292), "h": 167},
            "wall/window_wood.png": {"box": (478, 16, 598, 136), "h": 83},
            "bedroom/desk_book.png": {"box": (630, 104, 794, 288), "h": 131},
            "bedroom/dresser.png": {"box": (795, 64, 942, 286), "h": 166},
            "bedroom/wardrobe.png": {"box": (932, 52, 1080, 286), "h": 173},
        },
    },
    "bedroom-2": {
        "tolerance": 7,
        "dark": 45,
        "shadows": True,
        "bg": [(60, 390, 340, 440), (240, 190, 300, 230), (60, 60, 100, 110), (330, 60, 360, 80), (180, 60, 230, 70)],
        "items": {
            "rug_teal.png": {"box": (48, 188, 166, 250), "h": 124, "fill_top": 20},  # bed legs on its top edge
            "wall/window_curtain_green.png": {"box": (100, 52, 174, 120), "h": 112},
            "bedroom/grandfather_clock.png": {"box": (176, 72, 230, 184), "h": 180, "shadows": False},
            "bedroom/floor_lamp_blue.png": {"box": (303, 80, 356, 184), "h": 160},
            "bedroom/chest.png": {"box": (170, 268, 235, 330), "h": 88},
            "bedroom/stove.png": {"box": (235, 240, 299, 324), "h": 120},
        },
    },
    "bedroom-3": {
        "tolerance": 3,
        # Floor, wall, skirting board (between the wardrobe and the desk).
        "bg": [(160, 800, 700, 940), (850, 720, 1140, 1000), (720, 1100, 1150, 1340), (160, 210, 520, 260), (1000, 210, 1150, 440), (400, 520, 600, 640)],
        "items": {
            "wall/window_curtain_teal.png": {"box": (526, 213, 997, 454), "h": 112},
            "bedroom/desk_typewriter.png": {"box": (603, 478, 920, 668), "h": 128},
            "bedroom/nightstand_teal_lamp.png": {"box": (918, 453, 1147, 700), "h": 128},
            "bedroom/bed_red_2.png": {"box": (1150, 466, 1364, 872), "h": 200, "erase": [(1195, 846, 1328, 872)]},
            "bedroom/chest_small.png": {"box": (1203, 848, 1324, 970), "h": 64},
            # Stands on the rug: palette mode with the rug's colours (its outline is a bit lighter than the stand's black).
            "bedroom/music_stand.png": {"box": (416, 943, 527, 1112), "h": 104, "extra_bg": [(240, 1060, 420, 1260), (540, 1060, 700, 1260)]},
            "rug_green.png": {"box": (228, 1060, 714, 1274), "h": 122, "fill_top": 30},
        },
    },
    "bedroom-4": {
        "tolerance": 6,
        "shadows": True,
        # Floor (gaps between the pieces), wall, the wall's foot between the nightstand and the desk.
        "bg": [(110, 255, 170, 268), (280, 290, 305, 320), (290, 240, 305, 256), (120, 80, 200, 90), (300, 80, 330, 100), (50, 130, 98, 155), (179, 195, 202, 235)],
        "items": {
            "bedroom/bed_blue_lamp.png": {"box": (46, 156, 120, 252), "h": 160},
            "bedroom/nightstand_green_lamp.png": {"box": (123, 163, 177, 230), "h": 108},
        },
    },
    "living": {
        # The wall is light blue with jpeg noise, dark blue bands (y~100-156, y~175),
        # a painting (x~346..380, y~140..190) and a hanging thing (x~415..450, y~205..215)
        # - all NOT background. The one verified-clean sample window sits between the
        # painting and the hanging thing; tolerance stays tight (12) so the sofa's own
        # blues and the noise spots never match. shadows off: a darkened wall matches
        # the sofa's dark blues.
        "tolerance": 12,
        "shadows": False,
        "bg": [(280, 207, 410, 217)],
        "items": {
            # erase = the neighbour furniture poking into the box's top-left corner.
            "furniture/sofa_blue.png": {"box": (242, 218, 486, 362), "h": 88, "erase": [(242, 218, 250, 226)]},
            # Full-box cut below the black shadow line at the crown's top.
            "furniture/cabinet_glass.png": {"box": (485, 178, 620, 368), "h": 180},
        },
    },
    "kitchen-scene": {
        # The counter row pieces are full-box cuts (nothing to flood: the white tiles
        # would eat the stove/sink/fridge whites), so no shared bg at all; the dining
        # chair brings its own floor + shadow palette through extra_bg.
        "tolerance": 12,
        "bg": [],
        "items": {
            # Corn basket hangs over the drawer fronts down to y~193: cut below it.
            "kitchen/counter_drawers.png": {"box": (92, 194, 277, 268), "h": 120},
            # Kettle, backguard and the tile remnants end by y~154; starts at the cooktop.
            "kitchen/stove_kitchen.png": {"box": (277, 155, 366, 268), "h": 112},
            # Faucet/plant sit above y~163; starts at the wood front below the rim junk.
            "kitchen/counter_sink.png": {"box": (368, 164, 552, 268), "h": 120},
            # Vase on top overlaps the front down to y~124: cut below it.
            "kitchen/fridge_grey.png": {"box": (554, 125, 645, 268), "h": 140},
            # Chair between the table legs: erase the table top band and the leg-side gaps.
            # The shadow sample must stay below the chair legs (y>621) or it eats them.
            "furniture/dining_chair_blue.png": {
                "box": (342, 529, 392, 617),
                "h": 80,
                "extra_bg": [(310, 505, 420, 524), (345, 628, 390, 640)],
                "erase": [(342, 529, 392, 543), (342, 594, 348, 617), (376, 594, 392, 617)],
            },
        },
    },
    "kitchen-pro": {
        # req-1 restaurant steel kitchen (grey floor / white-brick wall): the steel
        # pieces have closed dark outlines but their light faces match the background,
        # so like kitchen-scene every piece is a full-box cut; empty wall that pokes
        # into a box around the taller prep-table crates is cleared with erase boxes.
        "tolerance": 12,
        "bg": [],
        "items": {
            "kitchen/grill_range.png": {"box": (26, 93, 118, 178), "h": 112},
            # Tomato crate on the veg table sticks up above the counter rim (y197): the
            # wall left/right of it inside the box is erased; the table lip starts at
            # x80 on y207, so the bare wall corner at the very left goes too.
            "kitchen/prep_table_veg.png": {
                "box": (78, 197, 170, 285),
                "h": 112,
                "erase": [(78, 197, 140, 207), (164, 197, 170, 207), (78, 207, 80, 209)],
            },
            # Same layout on the tomato table: crate from y199, table lip x183.. y207.
            "kitchen/prep_table_tomato.png": {
                "box": (181, 199, 242, 285),
                "h": 112,
                "erase": [(181, 199, 183, 209), (183, 199, 216, 205), (232, 199, 242, 207)],
            },
            "kitchen/dish_washer_steel.png": {"box": (263, 59, 331, 180), "h": 140},
            # The double-door steel cabinet sits right above the sink: cut starts at
            # its front y306, the dark plinth under the legs runs to y392.
            "kitchen/sink_steel.png": {"box": (282, 306, 331, 393), "h": 104},
        },
    },
    "kitchen-pink": {
        # req-3 pink kitchen (striped wall / pink wood floor): the white pieces sit on
        # a busy floor, so again full-box cuts with hand-checked edges; the low cabinet
        # has small clutter on its top which is erased away as the task asks.
        "tolerance": 12,
        "bg": [],
        "items": {
            "kitchen/fridge_white.png": {"box": (590, 138, 690, 303), "h": 140},
            "kitchen/range_white.png": {"box": (163, 205, 264, 302), "h": 104},
            "kitchen/counter_cream.png": {"box": (368, 221, 468, 303), "h": 104},
            # Wooden dish shelf block: red body x20..133 with the dish tiers on top.
            "kitchen/dish_shelf.png": {"box": (20, 424, 134, 550), "h": 120},
            # Island with sink: dark rim y458..461, red body to y532, legs to y559.
            "kitchen/kitchen_island.png": {"box": (455, 458, 658, 560), "h": 112},
            # Pink-striped tablecloth table: cloth from y895 (plant pot on top incl.),
            # dark base rail y982..983, right edge frame x619..622.
            "furniture/dining_table_pink.png": {"box": (426, 895, 623, 984), "h": 112},
            # White bench: seat edge y1010.., dark skirting y1047..48, red legs to ~y1079.
            "furniture/bench_white.png": {"box": (447, 1010, 601, 1080), "h": 60},
            # Low white cabinet: white body y714..760 in wood frames (x58..61/x206..212),
            # plinth y762..764; the whole cluttered top surface y690..713 is erased.
            "furniture/cabinet_low_white.png": {
                "box": (58, 690, 213, 765),
                "h": 88,
                "erase": [(58, 690, 213, 714)],
            },
        },
    },
}


def palette(im, boxes):
    counts = Counter()
    for x0, y0, x1, y1 in boxes:
        counts.update(map(tuple, im[y0:y1, x0:x1].reshape(-1, 3)))
    return np.array([c for c, n in counts.items() if n >= 3], dtype=np.int32).reshape(-1, 3)


def distance(c, pal):
    out = np.full(c.shape[:2], 999, dtype=np.int32)
    for p in pal:  # loop keeps memory low on big scenes
        np.minimum(out, np.abs(c - p).max(-1), out=out)
    return out


def shadow_distance(c, pal):
    """How far each pixel is from a darkened palette colour (drop shadow on the floor)."""
    cf = c.astype(np.float64)
    out = np.full(c.shape[:2], 999.0)
    for p in pal.astype(np.float64):
        f = np.clip((cf @ p) / (p @ p), 0.35, 0.97)
        np.minimum(out, np.abs(cf - f[..., None] * p).max(-1), out=out)
    return out


def resize(img, height):
    """Pixel art: upscale by whole pixels, then smooth-downscale to the target height."""
    if img.height < height:
        k = -(-height // img.height)
        img = img.resize((img.width * k, img.height * k), Image.NEAREST)
    return img.resize((max(1, round(img.width * height / img.height)), height), Image.LANCZOS)


def cut_scene(src, scene, out_dir):
    im = np.asarray(Image.open(src).convert("RGB")).astype(np.int32)
    tol = scene["tolerance"]
    base = palette(im, scene["bg"])
    for name, item in scene["items"].items():
        x0, y0, x1, y1 = item["box"]
        c = im[y0:y1, x0:x1]
        pal = base
        if "keep_bg" in item:
            keep = palette(im, item["keep_bg"])
            pal = np.array([p for p in pal if np.abs(keep - p).max(-1).min() > tol])
        if "extra_bg" in item:
            pal = np.concatenate([pal, palette(im, item["extra_bg"])])
        if item.get("mode", scene.get("mode", "palette")) == "outline":
            is_bg = 0.299 * c[..., 0] + 0.587 * c[..., 1] + 0.114 * c[..., 2] >= item.get("dark", scene.get("dark"))
        else:
            is_bg = distance(c, pal) <= tol
            if item.get("shadows", scene.get("shadows")):
                is_bg |= shadow_distance(c, base) <= tol
        lab, _ = ndi.label(is_bg)
        edge = set(np.unique(np.concatenate([lab[0], lab[-1], lab[:, 0], lab[:, -1]]))) - {0}
        bg = np.isin(lab, list(edge))
        if "holes" in item:
            holes, n = ndi.label(is_bg & ~bg)
            for i in range(1, n + 1):
                if (holes == i).sum() >= item["holes"]:
                    bg |= holes == i
        fg = ndi.binary_opening(~bg, iterations=1)
        for ex0, ey0, ex1, ey1 in item.get("erase", []):
            fg[max(ey0 - y0, 0) : max(ey1 - y0, 0), max(ex0 - x0, 0) : max(ex1 - x0, 0)] = False
        if item.get("drop_reddish"):
            fg &= ~(c[..., 0] > c[..., 2] + 25)
        if item.get("drop_green"):
            fg &= ~((c[..., 1] > c[..., 0] + 30) & (c[..., 1] > c[..., 2]))
        blobs, n = ndi.label(fg)
        if n > 1:
            fg = blobs == np.argmax(ndi.sum(fg, blobs, range(1, n + 1))) + 1
        ys, xs = np.where(fg)
        if not len(ys):
            sys.exit(f"{name}: nothing left after removing the background")
        rgba = np.dstack([c, fg * 255]).astype(np.uint8)[ys.min() : ys.max() + 1, xs.min() : xs.max() + 1]
        if item.get("mirror_x"):
            w = rgba.shape[1]
            rgba[:, w - w // 2 :] = rgba[:, : w // 2][:, ::-1]
        if "fill_top" in item:
            n = rgba.shape[0] * item["fill_top"] // 100
            rgba[:n] = rgba[::-1][:n]
        out = resize(Image.fromarray(rgba), item["h"])
        a = np.asarray(out).copy()
        hh, ww = a.shape[:2]
        for cy, cx in ((0, 0), (0, ww - 1), (hh - 1, 0), (hh - 1, ww - 1)):
            if a[cy, cx, 3] < 128:  # LANCZOS smears the opened-away box corner: clear it
                a[cy, cx, 3] = 0
        out = Image.fromarray(a)
        path = os.path.join(out_dir, name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        out.save(path)
        print(f"{path}  {out.width}x{out.height}")


def main(sheets_dir, out_dir, *only):
    for key, scene in SCENES.items():
        if not only or key in only:
            cut_scene(os.path.join(sheets_dir, f"{key}-original.png"), scene, out_dir)


if __name__ == "__main__":
    main(*sys.argv[1:])
