// Decorations (furniture): catalog + placement rules shared by server (validation) and client (drag preview).


export type DecorationLayer =
  /** Lies on the floor (rugs): other furniture can be placed on top of it. */
  | "floor"
  /** Regular furniture: cannot overlap other furniture. */
  | "object"
  /** Hangs on the back wall (paintings, posters): only overlaps-checked against other wall pieces. */
  | "wall";

export interface DecorationDef {
  kind: string;
  label: string;
  price: number;
  /** Fallback colour/shape (catalog swatch when there is no image, or the drawn shape). */
  color: number;
  shape: "rect" | "circle";
  /**
   * Floor footprint in world px: used for placement rules and overlap checks.
   * Wall pieces: the size of the artwork on the wall.
   */
  width: number;
  height: number;
  layer: DecorationLayer;
  /** Artwork under client/public/ (e.g. "assets/decor/stool.png"). */
  image?: string;
  /**
   * On-screen height of the artwork; it stands on the footprint (bottom-aligned) and may rise above it,
   * like furniture seen from the front. Floor items (rugs) ignore this and fill the footprint.
   */
  imageHeight?: number;
  /** How it can be turned in decorate mode (default "none"). */
  rotation?: DecorationRotation;
  /** For rotation "views": artwork per facing, used instead of `image`. */
  views?: Record<DecorationView, string>;
  /** Catalog group shown in the decorate panel (set by inCategory). */
  category?: DecorationCategory;
  /** Small looping animation drawn with the piece (client only). "breeze" = cool air from an air conditioner. */
  effect?: "breeze";
  /**
   * Furniture with a job: customers sit on seats, and drinks are served at tables during shifts
   * (a seat is only used when a table stands next to it, see seatTableMap in seating.ts); players lie down in beds.
   */
  role?: "seat" | "table" | "bed";
  /** Beds: where the sleeper's head goes, as a fraction of the artwork (0..1 from its top-left, as drawn unflipped). */
  pillow?: { x: number; y: number };
}

/**
 * How a piece turns (rotation index 0..3, one press of R = next index):
 * - none:   looks the same from every side (plants, lanterns) — always 0.
 * - flip:   0 = as drawn, 1 = mirrored left/right.
 * - rotate: top-down art (rugs) turned by quarter turns; the footprint swaps width/height on 1 and 3.
 * - views:  separate artwork per facing: 0 front, 1 left, 2 back, 3 right (see VIEW_ORDER).
 */
export type DecorationRotation = "none" | "flip" | "rotate" | "views";
export type DecorationView = "front" | "left" | "back" | "right";
export const VIEW_ORDER: readonly DecorationView[] = ["front", "left", "back", "right"];

export function rotationCount(def: DecorationDef): number {
  return def.rotation === "flip" ? 2 : def.rotation === "rotate" || def.rotation === "views" ? 4 : 1;
}

/** Clamp untrusted input (client messages, old saves) to a rotation this piece supports. */
export function normalizeRotation(def: DecorationDef, rotation: unknown): number {
  const r = Number(rotation);
  return Number.isInteger(r) && r >= 0 && r < rotationCount(def) ? r : 0;
}

/** Floor footprint for a rotation: rugs turned a quarter swap width and height. */
export function footprintOf(def: DecorationDef, rotation = 0): { width: number; height: number } {
  return def.rotation === "rotate" && rotation % 2 === 1
    ? { width: def.height, height: def.width }
    : { width: def.width, height: def.height };
}

const decor = (
  kind: string,
  label: string,
  price: number,
  image: string,
  width: number,
  height: number,
  imageHeight: number,
  color = 0x8d6e63,
  rotation: DecorationRotation = "none",
): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width,
  height,
  layer: "object",
  image: `assets/decor/${image}.png`,
  imageHeight,
  rotation,
});

/** Rugs fill their footprint, so give it the artwork's aspect ratio. */
const rug = (kind: string, label: string, price: number, image: string, color: number, width = 120, height = 80): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width,
  height,
  layer: "floor",
  image: `assets/decor/${image}.png`,
  rotation: "rotate",
});

/** A bed players can lie in (Space next to it): head at (x, y), fractions of the artwork. */
const bed = (def: DecorationDef, x: number, y: number): DecorationDef => ({ ...def, role: "bed", pillow: { x, y } });

/** Catalog groups, in display order (decorate panel sections). */
export const DECORATION_CATEGORIES = [
  { id: "plants", title: "🌿 Cây cảnh" },
  { id: "seating", title: "🪑 Bàn ghế" },
  { id: "bedroom", title: "🛏️ Nội thất" },
  { id: "lighting", title: "🏮 Đèn" },
  { id: "rugs", title: "🧶 Thảm" },
  { id: "art", title: "🖼️ Tranh & khung ảnh" },
  { id: "appliances", title: "❄️ Thiết bị" },
] as const;
export type DecorationCategory = (typeof DECORATION_CATEGORIES)[number]["id"];

const inCategory = (category: DecorationCategory, defs: DecorationDef[]): DecorationDef[] => defs.map((d) => ({ ...d, category }));

/** Wall art fills its box on the wall (width/height = on-screen size, keep the artwork's aspect ratio). */
const wallArt = (kind: string, label: string, price: number, image: string, width: number, height: number, color = 0xd4a373): DecorationDef => ({
  kind,
  label,
  price,
  color,
  shape: "rect",
  width,
  height,
  layer: "wall",
  // Cut from the sheets in client/assets-src/sheets/ (slice_sheet.py, names in <sheet>.names.json).
  image: `assets/decor/wall/${image}.png`,
});

// Kinds are saved in shop files: keep existing ones (plant, lamp, chair, table, rug) when changing the catalog.
export const DECORATION_CATALOG: DecorationDef[] = [
  ...inCategory("plants", [
    decor("plant", "Chậu dương xỉ", 50, "fern_medium", 30, 28, 44, 0x2a9d8f),
    decor("fern_large", "Dương xỉ lớn", 80, "fern_large", 46, 36, 58, 0x2a9d8f),
    decor("succulent", "Sen đá", 45, "succulent_1", 28, 26, 40, 0x457b9d),
    decor("succulent_large", "Sen đá lớn", 55, "succulent_5", 30, 28, 46, 0x457b9d),
    // Plants cut from client/assets-src/sheets/plants-sheet-1.png (footprint = the pot; foliage rises above it).
    decor("bonsai_red", "Cây cảnh lá đỏ", 55, "plants/bonsai_red", 26, 22, 46, 0xe76f51),
    decor("fern_paw_stand", "Dương xỉ kệ chân mèo", 70, "plants/fern_paw_stand", 34, 24, 46, 0x2a9d8f),
    decor("plant_diamond_pot", "Cây chậu hoa văn", 50, "plants/plant_diamond_pot", 26, 22, 46, 0x2a9d8f),
    decor("cactus_flower", "Xương rồng ra hoa", 55, "plants/cactus_flower", 26, 22, 52, 0x7cb342),
    decor("snake_plant_ball", "Lưỡi hổ chậu bóng", 80, "plants/snake_plant_ball", 30, 24, 70, 0xf4a261),
    decor("plant_tall_stand", "Cây kệ chân cao", 90, "plants/plant_tall_stand", 30, 22, 80, 0xe9c46a),
    decor("fiddle_leaf", "Cây bàng Singapore", 110, "plants/fiddle_leaf", 32, 26, 84, 0x2a9d8f),
    decor("cactus_tall", "Xương rồng cao", 100, "plants/cactus_tall", 30, 24, 92, 0x2a9d8f),
    decor("banana_plant", "Cây chuối cảnh", 120, "plants/banana_plant", 30, 24, 96, 0x7cb342),
    // Cut from the bedroom scenes by client/assets-src/tools/cut_bedroom.py.
    // Hanging plants (plants-sheet-1.png): hang on the wall.
    wallArt("hanging_fern", "Dương xỉ treo", 70, "hanging_fern", 71, 92, 0x2a9d8f),
    wallArt("hanging_pothos", "Trầu bà treo", 65, "hanging_pothos", 44, 96, 0x2a9d8f),
    // Cut from client/assets-src/sheets/furniture/ by client/assets-src/tools/cut_furniture.py (front-facing pieces only).
    decor("plant_leafy", "Cây lá nhỏ chậu đỏ", 50, "furniture/plant_leafy", 24, 20, 56, 0x2a9d8f),
    decor("plant_big_leaf", "Cây lá to chậu đỏ", 60, "furniture/plant_big_leaf", 26, 22, 64, 0x2a9d8f),
    decor("plant_slim", "Cây thân đứng", 75, "furniture/plant_slim", 24, 20, 80, 0x2a9d8f),
    decor("plant_pattern_pot", "Cây lá lớn chậu hoa văn", 90, "furniture/plant_pattern_pot", 28, 22, 90, 0x2a9d8f),
  ]),
  ...inCategory("seating", [
    {
      ...decor("chair", "Ghế mây", 40, "woven_chair_front", 30, 26, 58, 0xa1887f, "views"),
      // Built by client/assets-src/tools/build_chair_views.py from the 4-view sheet.
      views: {
        front: "assets/decor/woven_chair_front.png",
        left: "assets/decor/woven_chair_left.png",
        back: "assets/decor/woven_chair_back.png",
        right: "assets/decor/woven_chair_right.png",
      },
      role: "seat",
    },
    { ...decor("stool", "Đôn gỗ", 35, "stool", 28, 24, 40, 0xa1887f, "flip"), role: "seat" },
    // Built by client/assets-src/tools/build_table_view.py (front view only: the table is round, so it doesn't turn).
    { ...decor("table", "Bàn khách", 90, "wicker_table", 44, 26, 48, 0x8d6e63), role: "table" },
    // Cut from client/assets-src/sheets/furniture/ by client/assets-src/tools/cut_furniture.py (front-facing pieces only).
    { ...decor("armchair_baroque", "Ghế bành hoàng gia", 90, "furniture/armchair_baroque", 34, 26, 70), role: "seat" },
    { ...decor("chair_cream", "Ghế bọc kem", 60, "furniture/chair_cream", 24, 22, 66, 0xc29a78), role: "seat" },
    { ...decor("armchair_cream", "Ghế bành kem", 85, "furniture/armchair_cream", 30, 26, 76, 0xc29a78), role: "seat" },
  ]),
  ...inCategory("bedroom", [
    // Cut from client/assets-src/sheets/bedroom-original.png by client/assets-src/tools/cut_bedroom.py.
    bed(decor("bed_red", "Giường chăn đỏ", 150, "bedroom/bed", 44, 56, 91, 0xb4202a, "flip"), 0.5, 0.3),
    decor("nightstand_lamp", "Tủ đầu giường có đèn", 90, "bedroom/nightstand_lamp", 50, 26, 84, 0xb07a66, "flip"),
    decor("desk_book", "Bàn học có sách", 100, "bedroom/desk_book", 60, 26, 65, 0xb07a66),
    decor("dresser", "Tủ ngăn kéo", 120, "bedroom/dresser", 54, 26, 83, 0x8a4b3d),
    decor("wardrobe", "Tủ quần áo", 140, "bedroom/wardrobe", 54, 26, 86, 0x8a4b3d),
    // bedroom-2-original.png
    decor("grandfather_clock", "Đồng hồ quả lắc", 130, "bedroom/grandfather_clock", 40, 20, 90, 0x7a4a2a),
    decor("chest", "Rương gỗ", 60, "bedroom/chest", 46, 24, 44, 0xa0673a),
    decor("stove", "Lò sưởi gang", 110, "bedroom/stove", 44, 24, 60, 0x555a66),
    // bedroom-3-original.png
    decor("wardrobe_arch", "Tủ áo vòm", 140, "bedroom/wardrobe_arch", 46, 24, 92, 0x8a3e1c),
    decor("desk_typewriter", "Bàn máy đánh chữ", 120, "bedroom/desk_typewriter", 104, 26, 64, 0x8a3e1c),
    decor("nightstand_teal_lamp", "Tủ đầu giường đèn xanh", 90, "bedroom/nightstand_teal_lamp", 58, 24, 64, 0x8a3e1c, "flip"),
    bed(decor("bed_red_2", "Giường chăn đỏ thẫm", 150, "bedroom/bed_red_2", 50, 70, 100, 0xa82410, "flip"), 0.5, 0.22),
    decor("chest_small", "Rương nhỏ", 35, "bedroom/chest_small", 30, 20, 32, 0x7a3a1e),
    decor("music_stand", "Giá nhạc", 45, "bedroom/music_stand", 24, 14, 52, 0x10241e),
    // bedroom-4-original.png
    bed(decor("bed_blue_lamp", "Giường chăn xanh có đèn", 160, "bedroom/bed_blue_lamp", 60, 50, 80, 0x3d7bd0, "flip"), 0.56, 0.2),
    decor("nightstand_green_lamp", "Tủ đầu giường đèn lá", 80, "bedroom/nightstand_green_lamp", 42, 22, 54, 0x7a3f3a, "flip"),
    // Cut from client/assets-src/sheets/furniture/ by client/assets-src/tools/cut_furniture.py (front-facing pieces only).
    decor("globe", "Quả địa cầu", 80, "furniture/globe", 26, 22, 60),
    decor("coat_stand", "Mắc áo đứng", 60, "furniture/coat_stand", 20, 16, 90),
    decor("vanity_piano", "Bàn trang điểm đàn", 150, "furniture/vanity_piano", 50, 24, 80),
    decor("vanity_mirror", "Bàn trang điểm gương", 120, "furniture/vanity_mirror", 40, 20, 90),
    decor("fireplace_white", "Lò sưởi trắng", 180, "furniture/fireplace_white", 50, 24, 80),
  ]),
  ...inCategory("lighting", [
    decor("lamp", "Lồng đèn đỏ", 75, "red_lantern_lit", 30, 26, 56, 0xf4a261),
    decor("lantern_brass", "Đèn bão", 60, "lantern_brass", 26, 22, 48, 0xb08968),
    decor("lantern_lit", "Đèn bão (sáng)", 85, "lantern_gold_lit", 26, 22, 48, 0xffd166),
    decor("lantern_bronze_lit", "Đèn bão đồng (sáng)", 85, "lantern_bronze_lit", 26, 22, 48, 0xb5838d),
    decor("floor_lamp_blue", "Đèn cây chụp xanh", 70, "bedroom/floor_lamp_blue", 24, 16, 80, 0x7ec8f0),
    // Cut from client/assets-src/sheets/furniture/ by client/assets-src/tools/cut_furniture.py (front-facing pieces only).
    decor("lamp_arc_brass", "Đèn sàn cong đồng", 70, "furniture/lamp_arc_brass", 20, 16, 110, 0xb08968),
    decor("lamp_shade_white", "Đèn sàn chụp trắng", 65, "furniture/lamp_shade_white", 20, 16, 100),
    decor("lamp_post_brass", "Đèn sàn cột đồng", 70, "furniture/lamp_post_brass", 18, 16, 105, 0xb08968),
    decor("lamp_floor_cream", "Đèn sàn chụp kem", 55, "furniture/lamp_floor_cream", 18, 16, 90),
  ]),
  ...inCategory("rugs", [
    // Furniture can stand on them.
    // Kind "rug" kept for old saves (it used to be a woven rug).
    rug("rug", "Thảm bánh mì", 120, "rug_bread", 0xf1dcc4, 150, 56),
    rug("rug_lavender", "Thảm oải hương", 70, "rug_lavender", 0xc3a6e6, 176, 54),
    rug("rug_red", "Thảm đỏ", 70, "rug_red", 0xe8616e, 160, 60),
    rug("rug_yellow_check", "Thảm caro vàng", 90, "rug_yellow_check", 0xfbeaa8, 160, 60),
    rug("rug_jute", "Thảm cói tròn", 100, "rug_jute", 0xc8956a, 162, 58),
    rug("rug_lily_pad", "Thảm lá sen", 110, "rug_lily_pad", 0x4fbf83, 158, 62),
    rug("rug_monstera", "Thảm lá monstera", 120, "rug_monstera", 0x7ccb85, 142, 68),
    rug("rug_meadow", "Thảm đồng cỏ hoa", 130, "rug_meadow", 0xa6d07a, 158, 60),
    rug("rug_pineapple", "Thảm quả dứa", 140, "rug_pineapple", 0xf2c45a, 184, 52),
    rug("rug_bear_brown", "Thảm gấu nâu", 150, "rug_bear_brown", 0xb08463, 146, 66),
    rug("rug_bear_white", "Thảm gấu trắng", 150, "rug_bear_white", 0xf1e6d6, 158, 60),
    rug("rug_tiger", "Thảm hổ con", 160, "rug_tiger", 0xe8b04a, 146, 66),
    rug("rug_teal", "Thảm ngọc ô trám", 90, "rug_teal", 0x5ec4c4, 118, 62),
    rug("rug_green", "Thảm xanh rêu tua rua", 120, "rug_green", 0x24705a, 138, 61),
  ]),
  ...inCategory("art", [
    // Hangs on the back wall.
    wallArt("art_dogs", "Tranh chó con", 60, "art_dogs", 52, 63),
    wallArt("art_cats", "Tranh bốn chú mèo", 60, "art_cats", 54, 64),
    wallArt("art_daisies", "Tranh hoa cúc", 50, "art_daisies", 53, 69),
    wallArt("art_tulips", "Tranh hoa tulip", 50, "art_tulips", 56, 71),
    wallArt("art_vase", "Tranh bình hoa", 55, "art_vase", 54, 69),
    wallArt("art_sunset", "Tranh hoàng hôn", 55, "art_sunset", 51, 70),
    wallArt("art_grid", "Tranh ô màu", 70, "art_grid", 60, 82),
    wallArt("art_night", "Tranh trời đêm", 80, "art_night", 68, 84),
    wallArt("art_sunflowers", "Tranh đồng hướng dương", 120, "art_sunflowers", 122, 72),
    wallArt("art_orange", "Tranh quả cam", 40, "art_orange", 50, 58),
    wallArt("art_apple", "Tranh quả táo", 35, "art_apple", 43, 49),
    wallArt("art_heart", "Tranh trái tim", 30, "art_heart", 40, 48),
    wallArt("photo_cat", "Khung ảnh mèo", 25, "photo_cat", 33, 36),
    wallArt("photo_dog", "Khung ảnh cún", 25, "photo_dog", 36, 40),
    wallArt("calendar_board", "Bảng lịch ghim giấy", 70, "calendar_board", 90, 71),
    wallArt("tapestry", "Thảm treo tường", 90, "tapestry", 56, 86),
    wallArt("window_wood", "Cửa sổ khung gỗ", 60, "window_wood", 50, 50, 0x5c2e22),
    wallArt("window_curtain_green", "Cửa sổ rèm xanh lá", 70, "window_curtain_green", 61, 56, 0x2bbf8a),
    wallArt("window_curtain_teal", "Cửa sổ lớn rèm xanh", 110, "window_curtain_teal", 112, 56, 0x2f5f55),
  ]),
  ...inCategory("appliances", [
    // Air conditioner: air-conditioner-original.png, cut out with cutout_white.py.
    { ...wallArt("air_conditioner", "Máy lạnh", 150, "air_conditioner", 110, 37, 0xe0e0e0), effect: "breeze" },
  ]),
];

export const getDecorationDef = (kind: string) => DECORATION_CATALOG.find((d) => d.kind === kind);

/** Selling furniture refunds this fraction of its price. */
export const DECORATION_REFUND_RATE = 0.5;
export const refundFor = (def: DecorationDef) => Math.floor(def.price * DECORATION_REFUND_RATE);

/** Furniture snaps to this grid (world pixels). */
export const DECOR_GRID = 10;

/** Height of the skirting board at the foot of the wall: nothing hangs over it. */
export const WALL_SKIRTING = 12;

export const snapToGrid = (v: number) => Math.round(v / DECOR_GRID) * DECOR_GRID;

export interface PlacedDecoration {
  id: string;
  kind: string;
  x: number;
  y: number;
  rotation?: number;
}

// Where pieces may go (tea shop or restaurant) is checked by canPlaceDecoration in placement.ts.

// ---------------------------------------------------------------- Persistence

/** What is saved for a shop between rooms / server restarts. */
export interface ShopSave {
  version: 1;
  money: number;
  decorations: { kind: string; x: number; y: number; rotation?: number }[];
  /** Yard buildings: tileKey(cx, cy) -> tile kind (missing in saves from before the yard existed). */
  tiles?: Record<string, string>;
}

/** Shop ids are generated by the host's browser; keep them filename-safe. */
export const isValidShopId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(id);
