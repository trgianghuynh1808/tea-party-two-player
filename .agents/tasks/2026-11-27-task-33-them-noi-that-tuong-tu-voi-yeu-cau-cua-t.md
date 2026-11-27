# Task: Thêm nội thất từ 3 ảnh tham chiếu mới (bếp nhà hàng, bộ gỗ nông trại, bếp hồng)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Cắt các món NỘI THẤT rõ ràng từ 3 ảnh mới (như T32: bỏ đồ nhỏ/không rõ, cây, thảm, mèo, người, cửa) và thêm vào catalog.
- Món bếp vào "Nhà bếp", sofa/ghế bành/tủ vào "Phòng khách", giường/tủ/bàn gỗ vào "Nội thất" (bedroom), ghế/bàn vào "Bàn ghế".

## Ý tưởng
- Làm đúng cách T32: lưu ảnh vào `client/assets-src/sheets/`, thêm cảnh nền sàn vào `cut_bedroom.py` (req-1, req-3), tool mới `cut_farm.py` cho ảnh nền trắng (req-2, bám `cut_seating.py`).
- Mỗi món là `decor(...)` rotation "none"; ghế/sofa `role: "seat"`.

## Quyết định đã chốt
-

## Ngữ cảnh
Ảnh gốc: `.agents/attachments/T33/req-1.jpg` (347x411, bếp nhà hàng thép, sàn xám/tường gạch trắng), `req-2.jpg` (797x799, bộ nội thất gỗ nông trại nền trắng), `req-3.jpg` (736x1104, bếp hồng sàn gỗ). Mở bằng Read nếu xem được; nếu không, kiểm tra bằng script (alpha 4 góc, 1 blob, bbox) như T32. Toạ độ (left,top,right,bottom) là ƯỚC LƯỢNG: sau khi cắt kiểm tra lại, chỉnh box nếu dính viền/đồ lân cận.
- Mẫu: `client/assets-src/tools/cut_bedroom.py` (`SCENES` dict, cảnh `living`/`kitchen-scene` là mẫu; file vào `sheets/<key>-original.png`; `h` = 2 × imageHeight; chạy `cd client/assets-src/tools && .venv-art/bin/python cut_bedroom.py ../sheets ../../public/assets/decor <key>`; venv có thể phải tạo lại: Pillow/NumPy/SciPy) và `cut_seating.py` (nền trắng, `CUTS = {name: ((box), h)}`, ghi `public/assets/decor/furniture/<kind>.png`).
- Convert jpg → png: `kitchen-pro-original.png` (req-1), `kitchen-pink-original.png` (req-3); `req-2.jpg` lưu thành `sheets/farm-sheet-1.jpg`.
- Bảng món (kind · nhãn · giá · ảnh dưới `assets/decor/` · width×height footprint · imageHeight · danh mục · box ước lượng). Đã grep: các kind này CHƯA có; KHÔNG dùng lại `stove`, `chest`, `dresser`, `wardrobe`, `counter_*`, `fridge_*`.
  - req-1 (cảnh `kitchen-pro`, `bg: []` full-box như `kitchen-scene`, dùng erase nếu dính đồ):
    - `grill_range` · Bếp nướng nhà hàng · 150 · `kitchen/grill_range` · 56×24 · 56 · kitchen · (27,92,118,178)
    - `prep_table_veg` · Bàn sơ chế rau · 110 · `kitchen/prep_table_veg` · 52×24 · 56 · kitchen · (79,208,175,286)
    - `prep_table_tomato` · Bàn sơ chế cà chua · 110 · `kitchen/prep_table_tomato` · 52×24 · 56 · kitchen · (181,208,262,286)
    - `dish_washer_steel` · Máy rửa chén inox · 160 · `kitchen/dish_washer_steel` · 36×24 · 70 · kitchen · (265,57,322,180)
    - `sink_steel` · Bồn rửa inox · 120 · `kitchen/sink_steel` · 30×22 · 52 · kitchen · (282,306,330,390)
  - req-3 (cảnh `kitchen-pink`, sàn gỗ + tường sọc hồng: dùng `bg` mẫu sàn/tường như cảnh `living`, hoặc full-box):
    - `fridge_white` · Tủ lạnh trắng hai cánh · 170 · `kitchen/fridge_white` · 40×24 · 70 · kitchen · (590,138,690,302)
    - `range_white` · Bếp lò trắng · 130 · `kitchen/range_white` · 44×24 · 52 · kitchen · (163,205,264,302)
    - `counter_cream` · Tủ bếp kem · 100 · `kitchen/counter_cream` · 56×24 · 52 · kitchen · (370,222,468,302)
    - `dish_shelf` · Kệ chén gỗ · 110 · `kitchen/dish_shelf` · 56×26 · 60 · kitchen · (22,424,134,556)
    - `kitchen_island` · Đảo bếp có bồn · 160 · `kitchen/kitchen_island` · 80×28 · 56 · kitchen · (456,456,660,560)
    - `dining_table_pink` · Bàn ăn khăn sọc hồng · 120 · `furniture/dining_table_pink` · 60×30 · 56 · seating · (428,900,622,994)
    - `bench_white` · Ghế dài trắng · 60 · `furniture/bench_white` · 56×20 · 30 · seating (seat) · (446,1008,602,1062)
    - `cabinet_low_white` · Tủ thấp trắng · 100 · `furniture/cabinet_low_white` · 52×24 · 44 · living · (60,690,210,775) (có đồ nhỏ trên mặt: erase)
  - req-2 (nền trắng, `cut_farm.py`, ghi `furniture/`; bỏ tranh bò, bình cây nhỏ, đồ viền cắt):
    - `sofa_cow` · Sofa da bò · 200 · `furniture/sofa_cow` · 84×28 · 60 · living (seat) · (278,155,484,298)
    - `armchair_cow` · Ghế bành da bò · 90 · `furniture/armchair_cow` · 40×28 · 56 · living (seat) · (500,245,630,390)
    - `wardrobe_farm` · Tủ quần áo gỗ · 140 · `furniture/wardrobe_farm` · 54×24 · 86 · bedroom · (660,290,782,520)
    - `dresser_farm` · Tủ ngăn kéo gỗ · 120 · `furniture/dresser_farm` · 54×26 · 74 · bedroom · (133,243,252,398)
    - `hutch_farm` · Tủ trưng bày gỗ · 130 · `furniture/hutch_farm` · 48×24 · 80 · living · (514,460,632,650)
    - `bed_gingham` · Giường caro đỏ · 150 · `furniture/bed_gingham` · 44×56 · 88 · bedroom (dùng helper `bed(...)` như `bed_red`) · (325,335,452,610)
    - `table_gingham` · Bàn khăn caro · 90 · `furniture/table_gingham` · 44×26 · 62 · seating · (128,435,257,632)
    - `chair_farm` · Ghế gỗ nông trại · 40 · `furniture/chair_farm` · 22×20 · 46 · seating (seat) · (24,366,105,495)
    - `bench_farm` · Ghế băng gỗ · 50 · `furniture/bench_farm` · 40×20 · 30 · seating (seat) · (330,662,456,755)
  - Bỏ qua: tủ thép cửa đôi, ống hút khói, kệ nhỏ/tủ đầu giường có cây, thảm, đèn, cây, mèo, người, bàn nhỏ có đồ.
- Catalog: `shared/src/decor.ts` — `decor(kind,label,price,image,width,height,imageHeight,color)`, `inCategory(cat,[...])`; seat: `{ ...decor(...), role: "seat" }`; ví dụ T32 ở khối `kitchen` (~dòng 383), `living` (~dòng 252), `seating` (~dòng 241), `bedroom` (~dòng 262, xem `bed(...)`). Không đổi kind cũ; không cần thêm danh mục, không sửa client (panel đọc catalog động).
- Test: `tests/decor-catalog.spec.ts` có bảng `T32_ITEMS` + test "T32 T1/T2" (kiểm kind/category/seat/ảnh tồn tại, góc alpha < 32). Test kitchen đòi `toHaveLength(6)` (kind có `viewsDecor`+T32) → phải tăng lên số mới (6 + 10 = 16 khi thêm 5 req-1 + 5 req-3 kitchen), đọc test để xác nhận. Playwright không import được TS server; test chỉ import `@boba/shared` và `existsSync("client/public/assets/decor/...")`.

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_bedroom.py` → thêm 2 cảnh `kitchen-pro` (req-1, 5 món) và `kitchen-pink` (req-3, 5 món kitchen + `dining_table_pink`, `bench_white`, `cabinet_low_white`) vào `SCENES`; convert req-1/req-3 thành `sheets/kitchen-pro-original.png` / `kitchen-pink-original.png`; chạy tool; kiểm tra từng PNG bằng script (1 blob, 4 góc alpha < 32, có pixel alpha 255, bbox đúng, không dính đồ lân cận), chỉnh box/erase nếu cần.
- [x] 2. [vừa] `client/assets-src/tools/cut_farm.py` → tool mới cắt 9 món từ `sheets/farm-sheet-1.jpg` (req-2) nền trắng, bám `cut_seating.py` (cùng hàm `cut`/`resize`, CUTS theo bảng); ghi vào `client/public/assets/decor/furniture/`; chạy và kiểm tra từng PNG như bước 1.
- [x] 3. [khó] `shared/src/decor.ts` → thêm 22 `decor(...)` theo bảng vào đúng `inCategory` (kitchen 10, seating 4, living 4, bedroom 3... đếm theo bảng), seat dùng `role: "seat"`, giường dùng `bed(...)` giống `bed_red`; sửa `tests/decor-catalog.spec.ts` test kitchen (`toHaveLength`) cho đúng số món mới. Chạy `npm run typecheck` và `npx playwright test tests/decor-catalog.spec.ts`.
- [x] 4. [vừa] `tests/decor-catalog.spec.ts` → thêm bảng `T33_ITEMS` và T1–T2 dưới đây (bám `T32_ITEMS`/"T32 T1/T2"); chạy `npx playwright test tests/decor-catalog.spec.ts -g "T33"`.
- [x] 5. [dễ] `AGENTS.md` → Codebase Map: thêm `cut_farm.py` vào danh sách art tools; README chỉ sửa nếu liệt kê danh mục. Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Catalog T33: món mới có đủ — mọi kind trong bảng tồn tại, đúng danh mục, ảnh PNG có trên đĩa, ghế/sofa/ghế dài là seat, không trùng kind — tests/decor-catalog.spec.ts
  - Setup: không cần trình duyệt; import `DECORATION_CATALOG`, `getDecorationDef` từ `@boba/shared`, `existsSync` từ `node:fs`. Tên test bắt đầu "T33 T1:".
  - Steps: 1. với từng kind trong `T33_ITEMS` (category + cờ seat), lấy def · 2. kiểm tra category, `layer === "object"`, `existsSync("client/public/assets/decor/" + imagePath)` · 3. seat có `role: "seat"` (bench_white, sofa_cow, armchair_cow, chair_farm, bench_farm).
  - Assert: mọi def tồn tại, file ảnh có, `new Set(kinds).size === kinds.length` trên toàn `DECORATION_CATALOG`.
- [x] T2. Catalog T33: ảnh cắt có nền trong suốt — mỗi PNG mới có góc alpha < 32 và có pixel alpha 255 — tests/decor-catalog.spec.ts
  - Setup: dùng `decodePng` sẵn có trong spec (như "T32 T2:").
  - Steps: 1. đọc PNG từng món mới · 2. kiểm tra 4 góc.
  - Assert: ít nhất một góc alpha < 32 và có ít nhất một pixel alpha 255.

## Trạng thái hiện tại
- Bước 1 xong (commit 281dbaf). `cut_bedroom.py` có 2 cảnh mới: `kitchen-pro` (req-1, full-box như `kitchen-scene`, `bg: []`) và `kitchen-pink` (req-3, full-box, task nền sọc/sàn gỗ vân màu quá gần món nên không flood an toàn). req-1/req-3 đã convert thành `sheets/kitchen-pro-original.png` (347x411) / `kitchen-pink-original.png` (736x1104). 13 PNG: `kitchen/grill_range` 121x112, `kitchen/prep_table_veg` 117x112, `kitchen/prep_table_tomato` 79x112, `kitchen/dish_washer_steel` 79x140, `kitchen/sink_steel` 59x104, `kitchen/fridge_white` 85x140, `kitchen/range_white` 108x104, `kitchen/counter_cream` 127x104, `kitchen/dish_shelf` 109x120, `kitchen/kitchen_island` 223x112, `furniture/dining_table_pink` 248x112, `furniture/bench_white` 132x60, `furniture/cabinet_low_white` 267x88 — đúng h = 2 x imageHeight theo bảng. Kiểm script: từng PNG 1 blob, góc alpha < 32, có pixel 255.
- Box đã chỉnh so ước lượng sau khi đo biên bằng lum từng pixel (model không đọc được ảnh — Read ảnh lỗi "does not support image input" như T32, nên toàn bộ toạ độ được kiểm bằng script đo lum/RGB + ASCII map): grill (26,93,118,178) (viền kép trái x26, sàn bắt đầu y178); prep_table_veg (78,197,170,285) + erase tường quanh thùng cà chua/rau nhô trên viền (thùng cao tới y197 > ước lượng y208); prep_table_tomato (181,199,242,285) + erase (mép phải thật x242, không phải x262); dish_washer_steel (263,59,331,180) (mép phải là cột viền x330, không phải x322); sink (282,306,331,393) (tủ thép cửa đôi y292-304 ở trên bị bỏ, chân tối tới y392); fridge (590,138,690,303) (đế tới y302, không phải 302); range (163,205,264,302) — giữ nguyên ước lượng (quai trái x163-166, vùng phải có sàn/bóng không tách chắc được bằng lum); counter (368,221,468,303); dish_shelf (20,424,134,550) (kệ gỗ đỏ liền x20-133 y427-549, đáy y549, không phải y556); kitchen_island (455,458,658,560) (viền tối y458-461, chân tới y559); dining_table_pink (426,895,623,984) (khăn + chậu từ y895, đế tối y982-983, viền phải x619-622, không có chân dưới — y994 của ước lượng là ván sàn); bench_white (447,1010,601,1080) (mặt ghế y1010, chân đỏ tới ~y1079, ước lượng y1=1062 cắt giữa chân); cabinet_low_white (58,690,213,765) + erase toàn bộ mặt trên (58,690,213,714) theo "có đồ nhỏ trên mặt: erase" (mặt có khăn đỏ lớn + cây xanh + chậu; sau erase còn thân trắng + khung gỗ 2 bên + đế).
- Thêm 1 bước nhỏ trong `cut_scene`: sau resize, pixel góc có alpha < 128 bị zero (LANCZOS làm mờ góc đã bị opening xoá thành alpha ~62-82 ở các món blob cao hơn h — fridge/bench — khiến góc > 32; bước này chỉ ảnh hưởng pixel góc mờ, PNG cũ không chạy lại nên không đổi). Đã thử `up2x` (pre-upscale NEAREST) cho fridge/bench nhưng làm góc tệ hơn (82/79) nên đã bỏ.
- Lưu ý: cabinet_low_white có 2 góc TRÊN alpha 255 (viền gỗ trái/phải của thân tủ — nội dung thật, không phải nền); 2 góc dưới = 0. T2 theo đúng Assert "ít nhất một góc alpha < 32" thì PASS, nhưng nếu người duyệt muốn cả 4 góc trong suốt thì phải erase 2x2 góc trên (mất 2px đỉnh khung gỗ). Các món còn lại đủ 4 góc < 32 (0-18).
- Lưu ý: range_white giữ nguyên box ước lượng (163,205,264,302): đo lum cho thấy mép trái x159-165 là mảng tường hồng đậm chuyển dần, mép phải x256+ xen kẽ bóng/sàn — không tìm được biên chắc chắn bằng số, nên bám box người viết đã xem ảnh. Người duyệt nên nhìn PNG này một lượt trong Verify.

- Bước 2 xong (commit 8b17260). Tool mới `client/assets-src/tools/cut_farm.py` bám `cut_seating.py` y hệt (WHITE flood từ mép box + xóa viền sáng 1px + blob lớn nhất + resize NEAREST/LANCZOS + zero alpha<32), thêm 1 bước zero pixel góc alpha<128 sau resize (wardrobe_farm blob ~230 cao hơn h=172 nên resize LANCZOS thuần làm 4 góc mờ alpha ~81 — cùng cơ chế fridge/bench ở bước 1); req-2 lưu thành `sheets/farm-sheet-1.jpg` (797x799). CUTS dùng nguyên 9 box ước lượng — profile lum xác nhận mỗi box bao vừa khít món (vùng đậm + dải vát nghiêng ~13px quanh mép thuộc món) và mép ngoài sạch trắng, không có bóng dưới chân chạm box. 9 PNG trong `client/public/assets/decor/furniture/`: sofa_cow 173x120, armchair_cow 100x112, wardrobe_farm 91x172, dresser_farm 114x148, hutch_farm 99x160, bed_gingham 81x176, table_gingham 81x124, chair_farm 57x92, bench_farm 82x60 — đúng h = 2 x imageHeight.
- Lưu ý (bước 2): các PNG còn pixel trắng ENCLOSED (đã kiểm bằng label: không cụm nào chạm mép PNG): bed_gingham 1603px (ô trắng khăn chăn caro), sofa_cow 44 + armchair_cow 13 (đốm da bò), hutch_farm 13 (ô kính tủ trưng bày), table_gingham 47 (khăn caro), chair_farm 125 (khe gỗ) — đó là nội dung món, flood trắng đúng thiết kế không xoá ô kín. bed_gingham có đầu giường 2 trụ với khoảng giữa trong suốt (ảnh gốc giữa 2 trụ là nền trắng nhìn xuyên) — đúng art, không phải lỗi cắt. dresser_farm/hutch_farm có 2 góc DƯỚI alpha 255 (chân/đế tới đáy blob); 2 góc trên = 0, min góc < 32 đạt.
- Bước 3 xong (commit be7b81c). `shared/src/decor.ts`: 22 món mới theo đúng bảng T33 (rotation "none" mặc định), vào đúng `inCategory` — kitchen 10 (grill_range, prep_table_veg, prep_table_tomato, dish_washer_steel, sink_steel, fridge_white, range_white, counter_cream, dish_shelf, kitchen_island), seating 5 (dining_table_pink, bench_white, table_gingham, chair_farm, bench_farm), living 4 (cabinet_low_white, sofa_cow, armchair_cow, hutch_farm), bedroom 3 (wardrobe_farm, dresser_farm, bed_gingham). Seat đúng bảng: bench_white, sofa_cow, armchair_cow, chair_farm, bench_farm có `role: "seat"`; bed_gingham dùng `bed(decor(...), 0.5, 0.3)` giống bed_red (color 0xb4202a theo bed_red). Bảng không ghi color nên các món còn lại dùng màu default 0x8d6e63. `tests/decor-catalog.spec.ts` test kitchen đổi `toHaveLength(6)` -> `toHaveLength(16)` + tiêu đề "plus 14 one-view T32/T33 pieces" (đúng hướng dẫn ngữ cảnh: 6 + 10 = 16). Món mới tự vào build mode qua layer "object" (BUILD_TILES lấy từ catalog, không cần sửa gì thêm).
- Lưu ý: bed_gingham đặt pillow (0.5, 0.3) theo bed_red vì model không xem được ảnh để định vị gối chính xác; nếu khi soi thấy đầu giường 2 trụ khiến điểm nằm lệch thì chỉnh pillow (0.5, ~0.2) — chỉ 1 số trong decor.ts.
- Lưu ý: plan ghi "seating 4" nhưng bảng liệt kê 5 món seating (dining_table_pink, bench_white, table_gingham, chair_farm, bench_farm); đã làm theo bảng ("đếm theo bảng") — tổng 22 đúng yêu cầu.
- Bước 4 xong. `tests/decor-catalog.spec.ts`: thêm `T33_ITEMS` (22 món: kitchen 10, seating 5, living 4, bedroom 3, seat đúng bảng gồm bench_white/sofa_cow/armchair_cow/chair_farm/bench_farm) và 2 test "T33 T1:" (kind/category/layer `object`/ảnh tồn tại/seat + không trùng kind) và "T33 T2:" (góc alpha < 32 + có pixel alpha 255), bám T32 T1/T2. Không đổi UI nên không có Selectors mới.
- Lưu ý: T33 T2 dùng Assert "ít nhất một góc alpha < 32" như plan; cabinet_low_white có 2 góc trên đặc (viền gỗ) nhưng vẫn PASS nhờ 2 góc dưới trong suốt.
- Bước 5 xong. `AGENTS.md` Codebase Map: thêm `cut_farm.py` (cắt sheet nền trắng `farm-sheet-1.jpg` — sofa/armchair/wardrobe/dresser/hutch/bed/table/chair/bench — vào `public/assets/decor/furniture/<kind>.png`, cùng cách `cut_seating.py`) vào danh sách art tools. `README.md` không sửa: không có mục liệt kê danh mục nội thất (chỉ trỏ tới `shared/src/decor.ts`). Docs checked: README no change needed; AGENTS.md đã cập nhật `cut_farm.py`. Không đổi giao diện/protocol/env.

## Test status
- Bước 5 không có lệnh test cụ thể trong plan (chỉ docs). `npm run typecheck` PASS. T1/T2 giữ nguyên PASS từ bước 4.
- Bước 4 (lệnh test trong plan: `npx playwright test tests/decor-catalog.spec.ts -g "T33"`): 3/3 PASS (kitchen T1 khớp 16 món mới, T33 T1, T33 T2). `npm run typecheck` PASS. T1 PASS, T2 PASS.
- Bước 3 (lệnh test trong plan: `npx playwright test tests/decor-catalog.spec.ts`): 17/17 PASS, gồm kitchen T1 (đã đổi 16 món) và các test hiện có (T32 T1/T2, rotate-badge, only-4-views — món mới không ⟳ badge vì rotation "none", catalog không trùng kind). `npm run typecheck` PASS. Chưa có spec T33 (T1/T2 thuộc bước 4, chưa tới).
- Bước 2 không có lệnh test cụ thể trong plan (kiểm PNG như bước 1). Đã kiểm script: 9/9 PNG đạt (1 blob không blob rác, góc alpha < 32 — wardrobe fix góc mờ bằng zero-corner, dresser/hutch 2 góc dưới là chân/đế thật, có pixel 255, đúng h, không có pixel trắng nào chạm mép PNG). `npm run typecheck` PASS. Chưa có spec T33 (T1/T2 thuộc bước 4, chưa tới).
- Bước 1 không có lệnh test cụ thể trong plan (chỉ chạy tool + kiểm PNG bằng script). Đã kiểm bằng script như mục tiêu: 13/13 PNG đạt (1 blob, góc alpha < 32 — cabinet 2 góc trên đặc là viền, có pixel alpha 255, kích thước đúng h = 2 x imageHeight, silhouette cho thấy thùng cà chua/rau nhô trên viền bàn và 2 bên trong suốt đúng thiết kế erase). `npm run typecheck` PASS. Chưa có spec T33 (T1/T2 thuộc bước 3-4, chưa tới).

## Verify
- Typecheck: PASS. Cả bộ e2e: 82 PASS, 1 FAIL (fishing T31 T2) — chạy lại riêng thì PASS (flaky, không liên quan T33).
- T1: PASS (T33 catalog), T2: PASS (alpha ảnh cắt).
- Ảnh: `.agents/screenshots/task-33-new-furniture-sheet.png` (bảng ghép 22 sprite mới; không mở được game bằng trình duyệt để xem vì model không đọc ảnh).
- Lưu ý: model không xem được ảnh nên chưa ai nhìn trực quan các sprite (đặc biệt range_white, cabinet_low_white, bed_gingham pillow).
VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
