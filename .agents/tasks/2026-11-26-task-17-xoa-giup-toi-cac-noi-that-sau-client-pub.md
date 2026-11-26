# Task: Xoá 19 món nội thất (nhà tắm, tủ áo vòm, 2 cây, ghế bếp, 2 đồ treo tường)

APPROVED_BY_USER

Verify mode: none

## Ý tưởng
- Xoá 19 món khỏi `DECORATION_CATALOG` (`shared/src/decor.ts`), `git rm` ảnh tương ứng, bỏ khỏi các script cắt ảnh để không sinh lại.
- Cập nhật `tests/decor-catalog.spec.ts`: thêm các món vừa xoá vào danh sách "đã xoá", chỉnh các số đếm cứng (nhà tắm, bếp, danh sách cây).
- Xoá hẳn, không hoàn tiền/migrate (món đã đặt sẽ bị bỏ qua khi tải, như các lần xoá trước).

## Mục tiêu
- 19 kind sau không còn trong catalog, ảnh bị xoá, script cắt không sinh lại: `bath_bench_plain`, `bath_bench_soap`, `bath_plant_shelf`, `bath_plant_tall`, `bath_shower_glass`, `bath_sink_wood`, `bath_tall_cabinet`, `bath_toilet_cream`, `bath_tub_duck`, `bath_washers`, `wardrobe_arch`, `plant_pattern_pot`, `plant_slim`, `chair_kitchen` (4 ảnh front/left/back/right), `bath_vent`, `bath_towel_shelf`.
- Các món khác giữ nguyên (đặc biệt `bath_towel_shelf_wood`, `bath_mirror`, `bath_bathtub`, `fridge_kitchen`, `washer_kitchen`, `wardrobe`).

## Quyết định đã chốt
- Xoá hẳn, không migrate. `chair_kitchen` là món `seat` duy nhất của bếp → danh mục bếp còn 2 món (tủ lạnh, máy giặt).
- Task T18 (pending, chuyển món nhà tắm sang loại khác) có thể đụng cùng file/danh sách; task này làm trước.

## Ngữ cảnh
- `shared/src/decor.ts` (xoá từng dòng theo kind): `wardrobe_arch` ~254; `plant_slim` ~217, `plant_pattern_pot` ~218; `wallArt("bath_vent"...)` ~349, `wallArt("bath_towel_shelf"...)` ~350 (GIỮ `bath_towel_shelf_wood` ~366); 10 dòng `decor("bath_shower_glass"|"bath_toilet_cream"|"bath_tall_cabinet"|"bath_plant_shelf"|"bath_sink_wood"|"bath_bench_soap"|"bath_washers"|"bath_bench_plain"|"bath_tub_duck"|"bath_plant_tall"...)` ~352-361; `{ ...viewsDecor("chair_kitchen"...), role: "seat" }` ~375 (xoá cả dòng; cập nhật comment khối kitchen "3 pieces" → 2 nếu có).
- Ảnh cần `git rm`:
  - `client/public/assets/decor/bathroom/{bench_plain,bench_soap,plant_shelf,plant_tall,shower_glass,sink_wood,tall_cabinet,toilet_cream,tub_duck,washers}.png`
  - `client/public/assets/decor/bedroom/wardrobe_arch.png`
  - `client/public/assets/decor/furniture/{plant_pattern_pot,plant_slim}.png`
  - `client/public/assets/decor/kitchen/chair_kitchen_{front,left,back,right}.png`
  - `client/public/assets/decor/wall/{bath_vent,bath_towel_shelf}.png`
- Script cắt (xoá mục tương ứng, giữ mục khác):
  - `client/assets-src/tools/cut_bathroom.py`: 10 tuple sheet "2" (~dòng 56-65), `STAR_SAFE = {"plant_tall"}` (~76 → đổi thành `set()` hoặc bỏ nếu không còn dùng; nếu `plant_tall` được nhắc trong docstring ~20 thì sửa cho khớp), danh sách `FLOOR_PNGS` (~134-135, xoá hết 10 tên → `[]`; kiểm tra code dùng nó không lỗi khi rỗng).
  - `client/assets-src/tools/cut_bedroom.py` ~67: dòng `"bedroom/wardrobe_arch.png": {...}`.
  - `client/assets-src/tools/cut_furniture.py` ~34-35: tuple `plant_slim`, `plant_pattern_pot`.
  - `client/assets-src/tools/cut_kitchen.py`: mục `"chair_kitchen"` trong `BOXES` (~39) và chỉnh docstring/chú thích "3 pieces / 12 files" → 2 / 8.
  - `client/assets-src/tools/draw_bathroom_props.py`: bỏ `("bath_towel_shelf", ...)`, `("bath_vent", ...)` khỏi `PROPS` (~317-319) và `"bath_towel_shelf"`, `"bath_vent"` khỏi `WALL_PNGS` (~326); các hàm `towel_shelf`, `vent` không còn dùng thì xoá.
- `tests/decor-catalog.spec.ts`:
  - `REMOVED_ITEMS` (~28-43): thêm kind + image (đường dẫn dưới `client/public/assets/decor/`) của 19 file ảnh trên; kind khớp catalog (`bath_*` có tiền tố `bath_`; ảnh `bathroom/<tên>.png`, wall `wall/bath_vent.png`; kitchen: 4 ảnh `kitchen/chair_kitchen_<view>.png`, chỉ cần kiểm 1 kind + 4 ảnh). Đổi số trong tên T2 ("14 removed" → số mới).
  - `NEW_FURNITURE` (~55-66, T3): bỏ `plant_slim`, `plant_pattern_pot` → 8 món; sửa tên test "10 remaining" → 8.
  - `BATHROOM_2_FLOOR` (~209-220): xoá cả mảng 10 kind (và vòng lặp dùng nó trong "bathroom-2 T1" ~234; mảng `BATHROOM_2_WALL` giữ nguyên 6 kind); danh sách `["bath_mirror", "bath_towel_shelf", "bath_toilet_front", "bath_bathtub"]` ~256 bỏ `bath_towel_shelf`; `toHaveLength(25)` → 13; sửa tên test "the 16 new items" → "6".
  - Kitchen (~263-297): `KITCHEN_KINDS` bỏ `chair_kitchen`; `toHaveLength(3)` → 2; tên test "3 four-view items" → "2"; xoá dòng `expect(getDecorationDef("chair_kitchen")!.role).toBe("seat")`.
- Playwright không import được module server TS nhưng import `shared/` được (spec này đã làm vậy), không cần server/UI.

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: xoá 16 kind (xem Ngữ cảnh); `git rm` 19 ảnh; sửa 5 script trong `client/assets-src/tools/` (`cut_bathroom.py`, `cut_bedroom.py`, `cut_furniture.py`, `cut_kitchen.py`, `draw_bathroom_props.py`) như Ngữ cảnh. Grep lại các kind trên trong `shared/ client/src server/src` đảm bảo không còn tham chiếu. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/decor-catalog.spec.ts` → T2/T3 và các test bathroom-2 T1, kitchen T1: cập nhật như Ngữ cảnh. Chạy `npx playwright test tests/decor-catalog.spec.ts` rồi `npx playwright test`.

## Test cases
- [x] T1. Món đã xoá không còn — 19 ảnh/16 kind không còn trong catalog và trên đĩa; các món lân cận còn (`bath_towel_shelf_wood`, `bath_mirror`, `fridge_kitchen`, 8 món furniture còn lại; nhà tắm còn 13, bếp còn 2 và tất cả đủ ảnh/4 mặt) — tests/decor-catalog.spec.ts
  - Setup: không cần server/trình duyệt; test thuần import `shared/` như các test khác trong file.
  - Steps: 1. mở rộng `REMOVED_ITEMS` (T2) với 16 kind mới · 2. chỉnh T3, bathroom-2 T1, kitchen T1 theo số mới · 3. chạy `npx playwright test tests/decor-catalog.spec.ts`.
  - Assert: mỗi kind trong `REMOVED_ITEMS`: `getDecorationDef(kind)` là `undefined` và `existsSync` ảnh = false; bathroom có đúng 13 món; kitchen đúng 2 món; không kind trùng.

## Trạng thái hiện tại
- Bước 1 xong, commit `d8f9285` ("refactor(decor): remove 19 furniture pieces from catalog, art and cutting scripts").
  - `shared/src/decor.ts`: xoá 16 kind (kèm comment "Bathroom set 2" và comment furniture-sheet của plants vì hết mục con) — `bath_towel_shelf_wood`, `bath_mirror`, `bath_bathtub`, `fridge_kitchen`, `washer_kitchen`, `wardrobe` giữ nguyên.
  - `git rm` 19 ảnh (10 bathroom, 1 bedroom, 2 furniture, 4 kitchen, 2 wall) — khớp danh sách trong Ngữ cảnh.
  - 5 script cắt: `cut_bathroom.py` bỏ 10 tuple sheet-2 floor, bỏ hẳn `STAR_SAFE` + tham số `drop_grey` (chỉ phục vụ `plant_tall`, theo phương án "bỏ nếu không còn dùng"), `FLOOR_PNGS = []` và `preview()` thêm `if not names: continue` để không lỗi `max()` trên hàng rỗng, docstring 16 → 6; `cut_bedroom.py` bỏ `wardrobe_arch`; `cut_furniture.py` bỏ 2 tuple, "16 pieces" → 8; `cut_kitchen.py` bỏ `chair_kitchen`, "3 pieces / 12 files" → 2 / 8; `draw_bathroom_props.py` bỏ `towel_shelf`/`vent` khỏi `PROPS` + `WALL_PNGS`, xoá 2 hàm, docstring 5 → 3 và 9 → 7. Cả 5 script qua `python3 -m py_compile`.
  - Grep 16 kind trong `shared/src`, `client/src`, `server/src`: không còn tham chiếu (kết quả duy nhất là `bath_towel_shelf_wood` — kind phải giữ; `plant_tall_stand` là kind khác, giữ).
  - `npm run typecheck`: PASS (server + client).
- Lưu ý: `tests/decor-catalog.spec.ts` chưa cập nhật (thuộc bước 2) nên bộ test decor-catalog sẽ fail ở trạng thái hiện tại; bước 1 không có lệnh test riêng ngoài typecheck nên chưa chạy playwright.
- Lưu ý: palette `TOWEL_R` trong `draw_bathroom_props.py` không còn được dùng sau khi xoá hàm `towel_shelf`; giữ nguyên vì task chỉ yêu cầu xoá các hàm.
- Bước 2 xong:
  - `REMOVED_ITEMS`: thêm 19 entry (16 kind; `chair_kitchen` có 4 ảnh front/left/back/right) → 33 entry; tên T2 "14 removed" → "33 removed".
  - `NEW_FURNITURE`: bỏ `plant_slim`, `plant_pattern_pot` → 8 món; tên T3 "10 remaining" → "8 remaining".
  - `BATHROOM_2_FLOOR`: xoá cả mảng 10 kind; bathroom-2 T1 giờ chỉ lặp `BATHROOM_2_WALL` (6 kind, layer "wall"), bỏ `bath_towel_shelf` khỏi danh sách kiểm tra, `toHaveLength(25)` → `13`, tên test "16 new items" → "6 new items".
  - Kitchen: `KITCHEN_KINDS` bỏ `chair_kitchen` → 2; `toHaveLength(3)` → `2`; tên test "3 four-view" → "2 four-view"; xoá assert `chair_kitchen` role `seat`.
  - Selectors: không đổi giao diện; selector hiện có trong test (không đổi): `#decorate-btn`, `#decor-panel .decor-item`, `.rotate-badge`, `#build-btn`, `#build-panel .build-item` (tests/decor-catalog.spec.ts).
- Docs checked: README/AGENTS không nói tới 19 món đã xoá hay số đếm cụ thể của nhà tắm/bếp, không cần sửa.
- Lưu ý: test `mobile-build-ui.spec.ts` T1 là `test.fail()` (annotation "fail", expectedStatus "failed") — lỗi overflow 4px đã biết, không liên quan task này; `npx playwright test` báo 57 passed, 0 unexpected.

## Test status
- Lần chạy cuối:
  - `npm run typecheck` → PASS (server + client).
  - `npx playwright test tests/decor-catalog.spec.ts` → 14 passed.
  - `npx playwright test` → 57 passed, 0 unexpected (test `mobile-build-ui.spec.ts` T1 là `test.fail()` đã biết).
- Kết quả từng test:
  - T1: PASS (gồm T2/T3, bathroom-2 T1, kitchen T1 trong `tests/decor-catalog.spec.ts`).
- Fail chi tiết: không.

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
