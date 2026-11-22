# Task: Xoá 8 món nội thất

Verify mode: none

## Mục tiêu
- 8 món sau không còn trong catalog và ảnh bị xoá: `bucket` (Xô thiếc), `chair_wood_back` (Ghế gỗ quay lưng), `chair_wood_side` (Ghế gỗ nghiêng), `desk_set` (Bàn làm việc bày đồ), `fern_small` (Dương xỉ nhỏ), `red_lantern` (Lồng đèn tắt), `rug_blue` (Thảm xanh hoa văn), `rug_oval_blue` (Thảm bầu dục xanh).
- Các món khác không đổi (đặc biệt `lamp` "Lồng đèn đỏ" dùng ảnh `red_lantern_lit` và `red_lantern_2.png` GIỮ NGUYÊN).

## Quyết định đã chốt
- Xoá hẳn, không hoàn tiền/migrate: món đã đặt trong shop đã lưu sẽ bị bỏ qua khi tải (`ShopStore` lọc kind không có trong catalog) — đã báo người dùng.

## Ngữ cảnh
- `shared/src/decor.ts` (số dòng gần đúng, tìm theo kind trong `DECORATION_CATALOG`):
  ```ts
  decor("fern_small", "Dương xỉ nhỏ", 30, "fern_small", ...),                     // ~151
  { ...decor("chair_wood_back", ..., "bedroom/chair_back", ...), role: "seat" },  // ~186
  { ...decor("chair_wood_side", ..., "bedroom/chair_side", ..., "flip"), role: "seat" }, // ~187
  decor("bucket", "Xô thiếc", 20, "bedroom/bucket", ...),                         // ~196
  decor("desk_set", "Bàn làm việc bày đồ", ..., "bedroom/desk_set", ..., "flip"), // ~211
  decor("red_lantern", "Lồng đèn (tắt)", 55, "red_lantern", ...),                 // ~215 (dòng "lamp" ngay trên GIỮ)
  rug("rug_blue", "Thảm xanh hoa văn", 110, "rug_blue", ...),                     // ~236
  rug("rug_oval_blue", "Thảm bầu dục xanh", 70, "rug_oval_blue", ...),            // ~239
  ```
  Xoá nguyên dòng của từng món; nếu có comment chỉ dành riêng cho món đó thì xoá cùng.
- Ảnh cần `git rm` (dưới `client/public/assets/decor/`): `bedroom/bucket.png`, `bedroom/chair_back.png`, `bedroom/chair_side.png`, `bedroom/desk_set.png`, `fern_small.png`, `red_lantern.png`, `rug_blue.png`, `rug_oval_blue.png`.
- `client/assets-src/tools/cut_bedroom.py` có entry sinh lại 6 ảnh (xoá các dòng này để chạy lại script không sinh lại file): `"bedroom/bucket.png"`, `"rug_blue.png"`, `"bedroom/chair_back.png"`, `"bedroom/chair_side.png"`, `"bedroom/desk_set.png"`, `"rug_oval_blue.png"` (trong dict `"items"` của từng scene). `fern_small` và `red_lantern` không có trong script.
- Đã grep: không còn chỗ nào khác trong `client/src`, `server/src`, `tests` tham chiếu các kind/ảnh này.
- `tests/decor-catalog.spec.ts` (đã có, thuần Node) hiện có T1 kiểm `bed_pink` đã xoá và `bed_red` còn:
  ```ts
  import { existsSync } from "node:fs";
  // ... getDecorationDef("bed_pink") undefined, DECORATION_CATALOG không có kind đó, ảnh không tồn tại, bed_red còn.
  ```

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: xoá 8 dòng của 8 kind trong Mục tiêu; `git rm` 8 file ảnh trong Ngữ cảnh; xoá 6 entry tương ứng trong `client/assets-src/tools/cut_bedroom.py`. Chạy `npm run typecheck`.
- [x] 2. [khó] `tests/decor-catalog.spec.ts` → thêm T2 (test mới trong cùng file, giữ T1): cho từng trong 8 kind, `getDecorationDef(kind)` là `undefined`; `getDecorationDef("lamp")` và `getDecorationDef("lantern_brass")` vẫn có; 8 file ảnh không còn (`existsSync("client/public/assets/decor/<đường dẫn>")` false) còn `client/public/assets/decor/red_lantern_lit.png` vẫn tồn tại. Chạy `npx playwright test tests/decor-catalog.spec.ts`, rồi `npx playwright test`.

## Test cases
- [x] T1. bed_pink đã bị xoá (đã có từ task trước, chạy lại) — tests/decor-catalog.spec.ts
- [x] T2. 8 món đã bị xoá, món liên quan giữ nguyên — 8 kind không còn trong catalog, ảnh không còn; `lamp`, `lantern_brass`, `red_lantern_lit.png` còn — tests/decor-catalog.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: xoá 8 kind (`bucket`, `chair_wood_back`, `chair_wood_side`, `desk_set`, `fern_small`, `red_lantern`, `rug_blue`, `rug_oval_blue`) khỏi `DECORATION_CATALOG` trong `shared/src/decor.ts`; `git rm` 8 ảnh dưới `client/public/assets/decor/`; xoá 6 entry trong `client/assets-src/tools/cut_bedroom.py`. `npm run typecheck` PASS. `lamp` (dùng `red_lantern_lit`) giữ nguyên.
- Bước 2 xong: thêm T2 vào `tests/decor-catalog.spec.ts` (giữ T1); typecheck PASS; `npx playwright test tests/decor-catalog.spec.ts` 2/2 PASS; `npx playwright test` (cả bộ) 19/19 PASS.

## Test status
- Lần chạy cuối: `npx playwright test` (sau bước 2) — 19 passed
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
- Fail chi tiết: không có

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
