# Task: Bỏ 6 món nội thất vừa thêm

Verify mode: none

## Mục tiêu
- 6 món sau không còn trong catalog, ảnh bị xoá, script cắt không sinh lại: `chair_cream`, `coat_stand`, `plant_big_leaf`, `plant_leafy`, `vanity_piano`, `vanity_mirror`.
- 10 món còn lại của đợt `furniture-sheets` (`armchair_baroque`, `armchair_cream`, 4 đèn sàn, `globe`, `fireplace_white`, `plant_slim`, `plant_pattern_pot`) giữ nguyên.

## Quyết định đã chốt
- Xoá hẳn, không hoàn tiền/migrate: món đã đặt trong shop đã lưu sẽ bị bỏ qua khi tải (đã báo người dùng ở các lần xoá trước).

## Ngữ cảnh
- `shared/src/decor.ts` (tìm theo kind trong `DECORATION_CATALOG`, mỗi món một dòng): `plant_leafy` (~169), `plant_big_leaf` (~170), `chair_cream` (~191), `coat_stand` (~217), `vanity_piano` (~218), `vanity_mirror` (~219). Dòng `armchair_cream` ngay dưới `chair_cream` GIỮ.
- Ảnh cần `git rm`: `client/public/assets/decor/furniture/{chair_cream,coat_stand,plant_big_leaf,plant_leafy,vanity_piano,vanity_mirror}.png`.
- `client/assets-src/tools/cut_furniture.py` dòng ~31-39: danh sách tuple `("tên", "sheet", (hộp), H)`; xoá 6 tuple của 6 món trên, giữ các tuple khác.
- `tests/decor-catalog.spec.ts` ~dòng 30-50: danh sách `{ kind: "...", seat?: true }` của T3 đang chứa 16 kind; xoá 6 dòng của 6 món trên (`chair_cream` ~35, `coat_stand` ~42, `vanity_piano` ~43, `vanity_mirror` ~44, `plant_leafy` ~46, `plant_big_leaf` ~47) — T3 còn kiểm 10 món, ghế `seat` còn 2 (`armchair_baroque`, `armchair_cream`); chỉnh bất kỳ số đếm cứng "16"/"3 ghế" trong test và tên test cho khớp (10 / 2).

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: xoá 6 dòng của 6 kind; `git rm` 6 ảnh; xoá 6 tuple trong `client/assets-src/tools/cut_furniture.py`. Chạy `npm run typecheck`.
- [x] 2. [khó] `tests/decor-catalog.spec.ts` → T2: thêm 6 kind vừa xoá vào kiểm tra "không còn trong catalog và ảnh không còn" (cách T2 đang làm với 8 món cũ), và T3: bỏ 6 kind khỏi danh sách 16 → 10, sửa số đếm/tên test. Chạy `npx playwright test tests/decor-catalog.spec.ts` rồi `npx playwright test`.

## Test cases
- [x] T1. bed_pink đã bị xoá (có sẵn) — tests/decor-catalog.spec.ts
- [x] T2. Các món đã xoá không còn (mở rộng thêm 6 món) — tests/decor-catalog.spec.ts
- [x] T3. 10 món còn lại của đợt furniture-sheets vẫn đủ — kind, ảnh, 2 ghế `seat`, không trùng kind — tests/decor-catalog.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: đã xoá 6 dòng (`plant_leafy`, `plant_big_leaf`, `chair_cream`, `coat_stand`, `vanity_piano`, `vanity_mirror`) khỏi `DECORATION_CATALOG` trong `shared/src/decor.ts`; đã `git rm` 6 ảnh tương ứng trong `client/public/assets/decor/furniture/`; đã xoá 6 tuple trong `client/assets-src/tools/cut_furniture.py`. `npm run typecheck` PASS. Commit 1824692.
- Bước 2 xong: T2 mở rộng thêm 6 kind vừa xoá vào `REMOVED_ITEMS` (8 → 14, đổi tên test); T3 giảm danh sách 16 → 10 món, 2 ghế `seat` (`armchair_baroque`, `armchair_cream`), đổi tên test. `npx playwright test tests/decor-catalog.spec.ts` (3/3 PASS), `npx playwright test` (20/20 PASS), `npm run typecheck` PASS. Commit ce3bb62.

## Test status
- Lần chạy cuối: `npx playwright test tests/decor-catalog.spec.ts` → 3/3 PASS; `npx playwright test` → 20/20 PASS; `npm run typecheck` → PASS.
- Kết quả từng test:
  - T1: PASS (có sẵn)
  - T2: PASS (14 món đã xoá không còn trong catalog và trên đĩa)
  - T3: PASS (10 món còn lại đủ kind/ảnh, 2 ghế `seat`, không trùng kind)
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
