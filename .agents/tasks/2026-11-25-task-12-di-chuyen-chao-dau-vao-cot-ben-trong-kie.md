# Task: Dãy bếp có nồi gồm 3 máy (nhà hàng)

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Hiện cột ngoài (có nồi, x=60) có 2 máy: chảo y=260, nồi y=360; cột trong (x=214) có 3: thớt, vỉ nướng, bếp chiên ngập dầu.
- Theo góp ý mới nhất: dãy có nồi phải có 3 máy → chuyển bếp chiên ngập dầu (`deepfry`) sang cột ngoài, hàng 3 (y=460), dưới nồi.
- Vỉ nướng giữ nguyên (đã cùng hàng với nồi từ T11, và vẫn cần cho món bò bít tết `beef.grill`) → cột trong còn thớt + vỉ nướng.
- Chỉ đổi dữ liệu bố cục trong `shared/`, sửa assertion trong spec bố cục có sẵn.

## Mục tiêu
- Cột bếp có nồi (cột ngoài, x=60) có đúng 3 máy: chảo, nồi, bếp chiên ngập dầu; cột trong có 2: thớt, vỉ nướng.
- Vỉ nướng vẫn cùng hàng với nồi; không trạm nào đè nhau, lối đi giữa 2 cột vẫn 70px.

## Quyết định đã chốt
- Kiểm tra: vỉ nướng VẪN được dùng (món `steak` cần `beef.grill`) → không xoá.
- Production (`origin/main` = cedcabb) đã khớp code hiện tại, không có lệch client/server: client vẽ đúng theo `RESTAURANT_STATIONS`. Vì bạn nói bố cục hiện tại không như mong muốn, hiểu góp ý cuối ("3 máy ở dãy có nồi") là cột có nồi phải có 3 máy.

## Ngữ cảnh
- `shared/src/restaurant.ts` ~dòng 338-348 (hàng i có y = `MACHINE_TOP_Y + i * MACHINE_PITCH_Y`, 260/360/460):
  ```ts
  /** Left galley, outer column (top to bottom): a pan and a pot. */
  const LEFT_OUTER: [ProcessId, number][] = [["fry", 1], ["boil", 1]];
  /** Left galley, inner column (top to bottom): the chop board, the grill and the fryer. */
  const LEFT_INNER: [ProcessId, number][] = [["chop", 1], ["grill", 1], ["deepfry", 1]];
  ```
  Đổi thành outer = fry, boil, deepfry; inner = chop, grill; sửa 2 comment đó. Cũng xem comment bố cục đầu mục (~dòng 265-275) có nhắc "inner/outer column" thì sửa cho khớp.
- Id trạm giữ nguyên (`r_deepfry_1`...). Chỉ `tests/restaurant-layout.spec.ts` nhắc deepfry/vị trí cột; test thuần Node, dùng `local()`/`station()`.
- Spec dòng ~99-104 hiện: fry {60,260}, boil {60,360}, chop {214,260}, grill {214,360}, deepfry {214,460}. Dòng ~82 cho phép x ∈ {60,214,940}; ~124-126 tính aisle từ `Math.max(right)` cột 60 và `Math.min(left)` cột 214 — vẫn đúng (cùng độ rộng 84) nên không đổi.
- README dòng 63 chỉ liệt kê loại máy, không nói vị trí → thường không cần sửa.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → `LEFT_OUTER` / `LEFT_INNER`: chuyển `["deepfry", 1]` từ `LEFT_INNER` sang cuối `LEFT_OUTER` (thứ tự fry, boil, deepfry); sửa 2 comment cho đúng ("a pan, a pot and the fryer" / "the chop board and the grill") và comment bố cục đầu mục nếu nhắc số máy mỗi cột. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/restaurant-layout.spec.ts` → test bố cục (dòng ~99-104): deepfry `{x:60,y:460}`, thêm assert `columns.get(60)` có 3 máy và `columns.get(214)` có 2 (tên: ids `["r_fry_1","r_boil_1","r_deepfry_1"]` và `["r_chop_1","r_grill_1"]` theo thứ tự y); giữ assert grill.y === boil.y. Sửa comment đầu file/test nếu nói "galley" 3 máy cột trong. Chạy `npx playwright test tests/restaurant-layout.spec.ts` rồi `npm run typecheck`.
- [x] 3. [dễ] `README.md` + `AGENTS.md`: so với code, sửa nếu có chỗ mô tả vị trí máy bếp; nếu không có thì ghi "Docs checked: no change needed" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Cột có nồi 3 máy — cột ngoài gồm chảo/nồi/bếp chiên, cột trong gồm thớt/vỉ nướng, vỉ nướng cùng hàng nồi — tests/restaurant-layout.spec.ts
  - Setup: không cần trình duyệt; dùng `RESTAURANT_STATIONS` từ `@boba/shared`.
  - Steps: 1. lấy `r_fry_1`, `r_boil_1`, `r_deepfry_1`, `r_chop_1`, `r_grill_1` qua `station()` + `local()`. 2. gom cooker theo x.
  - Assert: fry {60,260}; boil {60,360}; deepfry {60,460}; chop {214,260}; grill {214,360}; grill.y === boil.y; cột x=60 có 3 máy, cột x=214 có 2; toàn bộ spec bố cục (khoảng cách dọc ≥40, aisle 70, không đè, vùng ăn/cửa trống) vẫn PASS.

## Trạng thái hiện tại
Lưu ý: góp ý của người dùng mâu thuẫn nhau ("3 máy trong, 2 máy ngoài" rồi "3 máy ở dãy có nồi"); plan theo câu sau: cột có nồi (ngoài) có 3 máy. Nếu ý thật là ngược lại thì bố cục hiện tại (trong 3, ngoài 2) đã đúng và task chỉ cần đóng.
Lưu ý: vỉ nướng vẫn được dùng (món bò bít tết cần `beef.grill`), không xoá.
Bước 1 xong: deepfry chuyển sang cuối LEFT_OUTER (fry {60,260}, boil {60,360}, deepfry {60,460}); LEFT_INNER còn chop, grill; 2 comment cột đã sửa; comment bố cục đầu mục không nhắc số máy mỗi cột nên không đổi. Typecheck PASS. Không đổi giao diện DOM nên không có selector mới.
Bước 2 xong: spec cập nhật deepfry {x:60,y:460}; thêm assert cột x=60 = `["r_fry_1","r_boil_1","r_deepfry_1"]` (theo y), cột x=214 = `["r_chop_1","r_grill_1"]`; giữ grill.y === boil.y. Comment đầu file/T11 vẫn đúng (chỉ nói "two-column galley", không nói số máy cột trong) nên không sửa. `npx playwright test tests/restaurant-layout.spec.ts` PASS 11/11; typecheck PASS. Không đổi giao diện DOM nên không có selector mới.
Bước 3 xong: Docs checked: no change needed. README (dòng 63-64) chỉ liệt kê loại máy (board/pan/pot/grill/fryer/blender/coffee), không nói vị trí hay số máy mỗi cột; AGENTS.md chỉ nêu tên file `shared/src/restaurant.ts`, không mô tả vị trí máy. Typecheck PASS.

## Test status
- Lần chạy cuối: `npx playwright test tests/restaurant-layout.spec.ts` (sau bước 2) — PASS 11/11; `npm run typecheck` (sau bước 3) — PASS.
- Kết quả từng test:
  - T1: PASS (tests/restaurant-layout.spec.ts)
- Fail chi tiết:

## Verify
- Toàn bộ e2e (53 test) PASS, typecheck PASS. T1 PASS. Thay đổi chỉ là dữ liệu bố cục, không cần ảnh.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
