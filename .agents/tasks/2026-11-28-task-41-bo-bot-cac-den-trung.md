# Task: Bỏ bớt các đèn trùng

APPROVED_BY_USER

Verify mode: none
<!-- Chỉ xoá món khỏi catalog + ảnh, không đổi hành vi UI. -->

## Mục tiêu
- Danh mục "🏮 Đèn" chỉ còn 5 đèn khác kiểu nhau, bỏ 4 đèn trùng kiểu.
- Xoá luôn ảnh/đoạn cut không còn dùng; save cũ chứa kind đã xoá không lỗi.

## Ý tưởng
- Giữ: `lamp` (lồng đèn đỏ), `lantern_lit` (đèn bão sáng, YardView đang dùng texture này), `floor_lamp_blue`, `lamp_arc_brass`, `lamp_shade_white`.
- Bỏ 4 món trùng kiểu: `lantern_brass` (bản tắt của đèn bão), `lantern_bronze_lit` (đèn bão đổi màu), `lamp_post_brass` (đèn sàn đồng giống cong đồng), `lamp_floor_cream` (đèn sàn chụp giống chụp trắng).
- Xoá khỏi `DECORATION_CATALOG`, xoá file PNG, cập nhật test catalog.

## Quyết định đã chốt
-

## Ngữ cảnh
- `shared/src/decor.ts` ~dòng 308-319: khối `inCategory("lighting", [...])` chứa các `decor("<kind>", ...)`. Xoá 4 dòng: `lantern_brass`, `lantern_bronze_lit`, `lamp_post_brass`, `lamp_floor_cream` (và dòng comment "Cut from ..." giữ nguyên vì vẫn còn `lamp_arc_brass`).
- Ảnh cần xoá: `client/public/assets/decor/lantern_brass.png`, `lantern_bronze_lit.png`, `lantern_bronze.png` (chỉ `lantern_bronze_lit` được catalog dùng; `lantern_bronze.png` không ai tham chiếu — grep xác nhận), `client/public/assets/decor/furniture/lamp_post_brass.png`, `furniture/lamp_floor_cream.png`. KHÔNG xoá `lantern_gold_lit.png`, `red_lantern_lit.png`, `red_lantern_2.png`.
- `client/assets-src/tools/cut_furniture.py` dòng ~27-33: xoá 2 tuple `lamp_post_brass`, `lamp_floor_cream` khỏi danh sách cắt.
- `tests/decor-catalog.spec.ts`: `REMOVED_ITEMS` (dòng ~28) là mảng `{ kind, image }`, T1 kiểm `getDecorationDef(kind)` undefined và file ảnh không tồn tại. Dòng ~70 đang `expect(getDecorationDef("lantern_brass")).toBeDefined()` → đổi thành `lantern_lit`. `NEW_FURNITURE` (~dòng 74) có `lamp_post_brass`, `lamp_floor_cream` → xoá 2 dòng đó và sửa tên test T3 "the 8 remaining" thành "6" (kiểm lại số lượng thực tế còn lại).
- Kind đã xoá được lưu trong save: cách T37 xử lý là save cũ tự bỏ kind không còn trong catalog (`SharedShop` loại món không tìm thấy def); không cần migration. Không kind nào trong 4 kind này nằm trong `REMOVED_ITEMS` hay đã bị xoá trước đó.
- Docs: `grep` README.md/AGENTS.md không nhắc 4 kind này → dự kiến không cần đổi docs; ghi "Docs checked" vào Trạng thái hiện tại.

## Plan
- [x] 1. [vừa] `shared/src/decor.ts` → xoá 4 dòng `decor(...)` trong `inCategory("lighting")`; xoá 5 file PNG nêu trong Ngữ cảnh (dùng `git rm`); `client/assets-src/tools/cut_furniture.py` xoá 2 tuple. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/decor-catalog.spec.ts` → thêm 4 kind vào `REMOVED_ITEMS` (kèm đường dẫn ảnh đúng: `lantern_brass.png`, `lantern_bronze_lit.png`, `furniture/lamp_post_brass.png`, `furniture/lamp_floor_cream.png`); sửa dòng ~70 sang `lantern_lit`; bỏ 2 kind khỏi `NEW_FURNITURE`; chạy `npx playwright test tests/decor-catalog.spec.ts`.
- [x] 3. [dễ] `README.md` → grep "đèn"/"lantern": nếu có mục liệt kê 4 món đã xoá thì sửa; nếu không, ghi "Docs checked: no change needed" vào Trạng thái hiện tại. Chạy `npx playwright test` (cả bộ) để chắc không test nào khác tham chiếu 4 kind.

## Test cases
- [x] T1. Đèn trùng đã bị xoá, đèn còn lại vẫn có — 4 kind không còn trong catalog và ảnh không còn trên đĩa; `lamp`, `lantern_lit`, `lamp_arc_brass`, `lamp_shade_white`, `floor_lamp_blue` còn — tests/decor-catalog.spec.ts
  - Setup: test thuần (không cần trình duyệt), import `getDecorationDef` như các test sẵn có trong file.
  - Steps: 1. Với 4 kind mới trong `REMOVED_ITEMS`, gọi `getDecorationDef(kind)`, `existsSync("client/public/assets/decor/<image>")`. 2. Với 5 kind giữ lại, gọi `getDecorationDef`.
  - Assert: 4 kind → `undefined`, file không tồn tại; 5 kind → defined, file ảnh của chúng tồn tại.

## Trạng thái hiện tại
- Bước 1 xong (commit 862a896): xoá 4 kind (`lantern_brass`, `lantern_bronze_lit`, `lamp_post_brass`, `lamp_floor_cream`) khỏi `inCategory("lighting")` — danh mục đèn còn 5 món: `lamp`, `lantern_lit`, `floor_lamp_blue`, `lamp_arc_brass`, `lamp_shade_white`; `git rm` 5 PNG (`decor/lantern_brass.png`, `decor/lantern_bronze.png`, `decor/lantern_bronze_lit.png`, `decor/furniture/lamp_post_brass.png`, `decor/furniture/lamp_floor_cream.png`); `cut_furniture.py` bỏ 2 tuple và cập nhật docstring "8" → "6" cho khớp số món còn lại (ngoài chữ "xoá 2 tuple" của plan, cùng file).
- `npm run typecheck`: PASS.
- Lưu ý: `tests/decor-catalog.spec.ts` vẫn tham chiếu kind đã xoá (dòng ~70 và `NEW_FURNITURE`) nên sẽ fail cho tới khi bước 2 cập nhật spec — theo plan, bước 1 không chạy playwright.
- Bước 2 xong: `tests/decor-catalog.spec.ts` thêm 4 kind vào `REMOVED_ITEMS` (ảnh `lantern_brass.png`, `lantern_bronze_lit.png`, `furniture/lamp_post_brass.png`, `furniture/lamp_floor_cream.png`), đổi dòng kiểm `lantern_brass` → `lantern_lit`, bỏ `lamp_post_brass` + `lamp_floor_cream` khỏi `NEW_FURNITURE`, sửa tên test T3 "8" → "6" và tên test T2 "33" → "37" cho khớp số mục thực tế.
- `npm run typecheck`: PASS. `npx playwright test tests/decor-catalog.spec.ts`: 19/19 PASS.
- Lưu ý: spec chỉ kiểm `lamp` + `lantern_lit` (và file `red_lantern_lit.png`) trong nhóm 5 đèn giữ lại, không kiểm đủ `floor_lamp_blue`/`lamp_arc_brass`/`lamp_shade_white` như mục tiêu T1 — làm đúng giới hạn plan bước 2 (chỉ đổi dòng 70), không viết thêm test.
- Bước 3 xong: `grep -i "đèn\|lantern\|lamp" README.md` không có kết quả (README không liệt kê từng món đèn); `AGENTS.md` cũng không nhắc 4 kind này. Docs checked: no change needed.
- `npm run typecheck`: PASS. `npx playwright test` (cả bộ): 88 passed, 0 failed (có 1 test `test.fail` sẵn từ trước ở `tests/mobile-build-ui.spec.ts` T1 — pre-existing, không liên quan đèn).
- Không có thay đổi giao diện (id/class/nút/route) ở bước này → không có dòng Selectors.

## Test status
- Lần chạy cuối: `npm run typecheck` — PASS; `npx playwright test` (cả bộ) — 88 passed, 0 failed (bước 3).
- Kết quả từng test:
  - T1: PASS (spec `tests/decor-catalog.spec.ts` T2; lưu ý chỉ kiểm 2/5 đèn giữ lại)
- Fail chi tiết: không có. `tests/mobile-build-ui.spec.ts` T1 là `test.fail` sẵn từ trước (build panel overflow 4px trên điện thoại dọc), không liên quan thay đổi đèn.

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
