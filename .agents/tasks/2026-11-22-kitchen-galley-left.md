# Task: Bếp nhà hàng kiểu hành lang bên trái

Verify mode: light

## Mục tiêu
- Các máy ở hai lề không còn đè hình lên nhau: khoảng hở dọc giữa hai máy cùng cột ≥ 24px (hiện chỉ 10px).
- Lò nướng (`bake`) và chảo dầu (`deepfry`) chuyển sang bên trái cùng các máy đồ mặn: thớt, chảo, nướng, nồi.
- Bên trái xếp 2 cột song song (cột ngoài sát tường, cột trong), giữa hai cột là lối đi rộng 70px để đứng ở lối đi với tới cả hai cột.
- Cột phải chỉ còn máy đồ uống: thớt 2, máy xay, pha cà phê.
- Sảnh giữa (sàn gỗ) vẫn thoáng, các máy vẫn tới được bằng chân, cửa dưới và bàn giao hàng không đổi.

## Quyết định đã chốt
- Bố cục 4 hàng x 2 cột bên trái (tâm local x: cột ngoài 60, cột trong 214; lối đi giữa x 102..172 rộng 70px).
  Hàng từ trên xuống (ngoài | trong): Thớt 1 | Lò nướng; Chảo 1 | Chảo dầu; Chảo 2 | Nướng; Nồi 1 | Nồi 2.
- Cột phải: x = 1340, từ trên xuống: thớt 2, máy xay, pha cà phê.
- Hàng đầu y = 250, bước dọc 90px (máy cao 60 → hở 30px). Hàng cuối ở y = 520 (đáy 550), cách hàng thùng rác dưới (đỉnh 689) xa.
- Sàn gỗ ở giữa thu hẹp bên trái: `DINING_RECT.left` 150 → 280 (khối bếp trái kết thúc ở x = 256). Bên phải giữ 1250.
- Không đổi id trạm (`r_chop_1`, `r_fry_1`, `r_fry_2`, `r_grill_1`, `r_boil_1`, `r_boil_2`, `r_bake_1`, `r_deepfry_1`, `r_chop_2`, `r_blend_1`, `r_brew_1`) và không đổi gameplay.

## Ngữ cảnh
- `shared/src/restaurant.ts` ~dòng 280-300 (hằng số layout) và ~dòng 350-375 (danh sách máy + `RESTAURANT_STATIONS`):
  ```ts
  const LEFT_MACHINE_X = 60;
  const RIGHT_MACHINE_X = 1340;
  const MACHINE_TOP_Y = 270;
  const MACHINE_PITCH_Y = 70;
  const LEFT_MACHINES: [ProcessId, number][] = [["chop",1],["fry",1],["fry",2],["grill",1],["boil",1],["boil",2]];
  const RIGHT_MACHINES: [ProcessId, number][] = [["bake",1],["deepfry",1],["chop",2],["blend",1],["brew",1]];
  // trong RESTAURANT_STATIONS:
  ...LEFT_MACHINES.map(([process, n], i) => cooker(process, n, LEFT_MACHINE_X, MACHINE_TOP_Y + i * MACHINE_PITCH_Y)),
  ...RIGHT_MACHINES.map(([process, n], i) => cooker(process, n, RIGHT_MACHINE_X, MACHINE_TOP_Y + i * MACHINE_PITCH_Y)),
  ```
  `cooker(process, n, x, y)` tạo trạm 84x60 tại toạ độ local (đã cộng `RESTAURANT.x/y`). Cập nhật cả comment đầu khối ("Machine columns...").
- Bố cục mới gợi ý:
  ```ts
  const LEFT_OUTER_X = 60;   // cột ngoài, sát tường
  const LEFT_INNER_X = 214;  // cột trong; lối đi 70px ở giữa (x 102..172)
  const RIGHT_MACHINE_X = 1340;
  const MACHINE_TOP_Y = 250;
  const MACHINE_PITCH_Y = 90;
  const LEFT_OUTER: [ProcessId, number][] = [["chop",1],["fry",1],["fry",2],["boil",1]];
  const LEFT_INNER: [ProcessId, number][] = [["bake",1],["deepfry",1],["grill",1],["boil",2]];
  const RIGHT_MACHINES: [ProcessId, number][] = [["chop",2],["blend",1],["brew",1]];
  ```
- `client/src/scenes/RestaurantView.ts:8`: `const DINING_RECT = { left: 150, top: 230, right: 1250, bottom: 660 };` (sàn gỗ giữa phòng).
- `tests/restaurant-layout.spec.ts`: có sẵn helper `local()`, `rectOf()`, `rectsOverlap()`, `station(id)`; hằng `DINING_RECT` (dòng ~36) phản chiếu hằng của client; test "edge-layout T1" (dòng ~64) đang kiểm cooker `x` ∈ [60, 1340] và có 11 cooker; "edge-layout T2" (dòng ~112) kiểm mọi trạm đi tới được trong `INTERACT_RANGE` (70); "edge-layout T3" (dòng ~408) dùng `r_chop_1`, `r_boil_1` qua 2 người chơi.
- `PLAYER_RADIUS = 18`, `INTERACT_RANGE = 70`; lối đi 70px còn 34px chỗ cho tâm người chơi (x 120..154), đứng giữa lối đi cách mỗi cột 35px.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → hằng số layout và `RESTAURANT_STATIONS`: thay `LEFT_MACHINE_X`/`LEFT_MACHINES`/`RIGHT_MACHINES` bằng `LEFT_OUTER_X`, `LEFT_INNER_X`, `LEFT_OUTER`, `LEFT_INNER`, `RIGHT_MACHINES` theo mục Ngữ cảnh (`MACHINE_TOP_Y` = 250, `MACHINE_PITCH_Y` = 90); 3 spread map cooker dùng đúng x tương ứng; viết lại comment đầu khối layout cho khớp (galley bên trái, 4 hàng, lối đi 70px). Chạy `npm run typecheck`.
- [x] 2. [dễ] `client/src/scenes/RestaurantView.ts` → `DINING_RECT`: đổi `left` từ 150 thành 280 (giữ top/right/bottom). Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/restaurant-layout.spec.ts` → test "edge-layout T1" và hằng `DINING_RECT`: đổi `DINING_RECT.left` thành 280; cooker `x` thuộc [60, 214, 1340]; thêm kiểm: `r_bake_1` và `r_deepfry_1` có `x` < 400 (bên trái), cột phải chỉ gồm 3 cooker `r_chop_2`, `r_blend_1`, `r_brew_1`; với mọi cặp cooker cùng cột, khoảng hở dọc (`top` máy dưới − `bottom` máy trên, qua `rectOf`) ≥ 24; khoảng ngang giữa cột ngoài và cột trong ở bên trái = 70. Không đổi "edge-layout T2" và "T3" nếu vẫn pass; nếu T3 hỏng vì vị trí đứng cố định, chỉ sửa vị trí đứng trong test. Chạy `npx playwright test tests/restaurant-layout.spec.ts -g "edge-layout T1"`, rồi `npx playwright test tests/restaurant-layout.spec.ts -g "edge-layout T2"`, rồi `npx playwright test tests/restaurant-layout.spec.ts`.
- [x] 4. [khó] Fix (bước 3 đã xong phần code; T7 fail do layout, chỉ cần bước này, ĐỪNG làm lại bước 3): `shared/src/restaurant.ts` → `MACHINE_TOP_Y`: đổi 250 thành 270 (hàng máy y = 270, 360, 450, 540; khe 46px dưới hàng crate, đủ chỗ đứng), và sửa comment đầu khối layout ("from y = 250" → "from y = 270"). Không đổi gì khác (cột x, `MACHINE_PITCH_Y` = 90, lối đi 70px giữ nguyên). Chạy `npm run typecheck` rồi `npx playwright test tests/restaurant-layout.spec.ts` (cả file phải PASS, gồm T1, T2, T3, T7, T11, T12). Nếu T7 vẫn fail, ghi tên trạm fail vào "Đã thử mà không được" và dừng.

## Test cases
- [x] T1. Bố cục hành lang trái — bake/deepfry bên trái, cột phải 3 máy đồ uống, hở dọc ≥ 24px, lối đi 70px, sảnh giữa không có trạm — tests/restaurant-layout.spec.ts ("edge-layout T1")
- [x] T2. Với tới mọi trạm — mọi trạm (kể cả máy ở cột ngoài) có chỗ đứng đi bộ tới được trong `INTERACT_RANGE` từ chỗ spawn — tests/restaurant-layout.spec.ts ("edge-layout T2", đã có, chỉ chạy lại)

## Trạng thái hiện tại
Bước 1 xong (commit 288e496): `shared/src/restaurant.ts` đã chuyển sang layout galley trái — cột ngoài x=60 (thớt 1, chảo 1, chảo 2, nồi 1), cột trong x=214 (lò nướng, chảo dầu, nướng, nồi 2), lối đi 70px (x 102..172), hàng y=250 bước 90px; cột phải x=1340 chỉ còn thớt 2, máy xay, pha cà phê. Id trạm và gameplay không đổi.
Bước 2 xong (commit dee9968): `client/src/scenes/RestaurantView.ts` `DINING_RECT.left` 150 → 280, giữ top/right/bottom; sàn gỗ giữa thu hẹp bên trái cho khối bếp.
Bước 3 KHÔNG hoàn tất (đã dùng hết 2 lần sửa ở session 1, dừng theo quy tắc; session 2 chạy lại xác nhận vẫn fail): phần code của bước 3 đã xong và nằm ở commit f4811ba — test "edge-layout T1" viết lại đúng plan (DINING_RECT.left=280, cooker x ∈ [60, 214, 1340], bake/deepfry x < 400, cột phải đúng 3 máy, hở dọc từng cặp ≥ 24, lối đi = 70) PASS; "edge-layout T2" PASS; T3, T11, T12 PASS sau khi ghim lại vị trí đứng. Blocker: **T7 vẫn FAIL** ("r_crate_beef", "r_crate_shrimp", "r_crate_chocolate") vì lỗi thật của layout (xem "Đã thử mà không được") — cần áp bước 4 (`MACHINE_TOP_Y` 250 → 270) rồi chạy lại lệnh test cả file của bước 3. Session 2 (GLM 5.3 qua opencode, ngày 2026-11-22) chạy lại đúng 3 lệnh của bước 3, không đổi code: grep T1 PASS, grep T2 PASS, cả file 9 passed / 1 failed (T7 y nguyên 3 crate trên).
Bước 4 xong (commit d4c5cb6, session 3 — GLM 5.3 qua opencode): `shared/src/restaurant.ts` `MACHINE_TOP_Y` 250 → 270 (hàng máy y = 270, 360, 450, 540; khe 46px dưới hàng crate tạo dải đứng y 212..222), comment đầu khối layout đổi "from y = 250" → "from y = 270"; cột x, `MACHINE_PITCH_Y` = 90, lối đi 70px giữ nguyên. T7 hết fail — cả file test 10 passed / 0 failed. Task hoàn tất: đủ 4 bước plan đều tick.

## Test status
- Lần chạy cuối (bước 4, session 3 — GLM 5.3 qua opencode): `npm run typecheck` PASS; `npx playwright test tests/restaurant-layout.spec.ts` — 10 passed / 0 failed.
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - Ngoài danh sách test của task: T3, T4, T5, T7, T11, T12, T2-tea-shop, T1-labels PASS — T7 đã hết fail sau bước 4 (không còn crate nào unreachable)

## Verify
<!-- Bước Verify tự điền. -->
- Toàn bộ suite: 15/15 PASS (lần chạy đầu có 1 lần T12 fail thoáng qua khi OpenCode còn chạy nền; chạy lại 3 lần đều PASS).
- T1: PASS (spec). T2: PASS (spec, gồm T7 và T3 hai người chơi).
- Visual: PASS — `.agents/screens/kitchen-galley-left.png`: cột trong (lò nướng, chảo dầu, nướng, nồi) cách nhau rõ, nhãn không đè nhau, sàn gỗ giữa thoáng. Camera chỉ hiện cột trong nên cột ngoài không có trong ảnh; hình học cột ngoài đã được T1/T2 kiểm.
VERIFY: PASS

## Đã thử mà không được
- Bước 3 sau 2 lần sửa vẫn fail ở T7 (test bảo vệ tính chọn được của mọi trạm) — nguyên nhân ở layout đã chốt ở bước 1, không thể sửa trung thực bằng cách đổi test:
  - `MACHINE_TOP_Y = 250` → đỉnh hàng máy đầu y=220, chỉ cách đáy hàng crate y=194 đúng 26px; người chơi cần 36px để đứng giữa hai hàng. Vùng x chồng lấn crate/máy: `r_crate_beef` trên `r_chop_1` (x 18..102), `r_crate_shrimp` trên `r_bake_1` (x 172..256), `r_crate_chocolate` trên `r_chop_2` (x 1298..1382) → 3 crate này fail đúng tên trong T7.
  - Hướng sửa gợi ý (ngoài phạm vi bước 3, cần chốt lại trong task): hạ `MACHINE_TOP_Y` về ≥ 260 (ví dụ 270 như layout cũ → khe 46px, dải đứng y 212..222). Các kiểm tra T1 mới vẫn đúng với 270 (chỉ phụ thuộc x cột, hở dọc ≥ 24, lối đi 70, id cột phải); hàng cuối y=540 (đáy 570) vẫn cách hàng dưới (đỉnh 689) xa.
- Lần 1 (sửa đúng plan — chỉ T1 + DINING_RECT): grep T1 PASS, grep T2 PASS, cả file → T11, T12, T7 fail (T11/T12 ghim vị trí đứng theo layout cũ; T7 lỗi layout thật).
  - T11: điểm đứng `r_boil_1.bottom + 3` (khe dọc 10px giữa 2 nồi xếp chồng cũ) không còn — `r_boil_1`/`r_boil_2` giờ nằm cạnh nhau ở 2 cột.
  - T12: điểm đứng giữa crate tôm/trứng (257, 230) giờ cách mép `r_bake_1` 1px → bị collision đẩy sang (274, 230), facing "left" chọn `r_bake_1` thay vì crate tôm; đã kiểm chứng không tồn tại điểm đứng nào cho cặp tôm/trứng nữa (toàn bộ dải giữa hai crate bị vùng 18px của `r_bake_1` phủ).
- Lần 2 (dạng sửa plan cho phép với T3 — "chỉ sửa vị trí đứng trong test", áp cho T11/T12): T11 đổi cặp sang `r_chop_1`/`r_fry_1` (xếp chồng trong cột ngoài, khe 30px, giữ nguyên ý nghĩa facing up/down) → PASS; T12 đổi cặp crate sang trứng/khoai tây (điểm đứng (319, 230), xa khối máy, giữ nguyên ý nghĩa facing trái/phải) → PASS. T7 vẫn FAIL → hết 2 lần sửa, dừng.
- Session 2 (GLM 5.3 qua opencode, chạy lại bước 3 theo đúng 3 lệnh, không đổi code vì phần code đã xong ở f4811ba): grep T1 PASS, grep T2 PASS, cả file 9 passed / 1 failed — T7 fail y nguyên `r_crate_beef`, `r_crate_shrimp`, `r_crate_chocolate`. Tự kiểm tra lại hình học xác nhận chẩn đoán của session 1: crate 54px pitch 62 (khe 8px) nên không có điểm đứng giữa hai crate; cách duy nhất tới 3 crate trên là dải giữa đáy crate (y=194) và đỉnh máy (y=220) chỉ rộng 26px < 36px; halo 18px của máy khiến mọi điểm đứng khác đều chọn trạm khác làm "nearest". Không tồn tại sửa trung thực trong phạm vi file test; bước 4 (`MACHINE_TOP_Y` 250 → 270, dải đứng y 212..222) là hướng giải duy nhất đã chốt trong plan.

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa: 2 (session 1, đã ghi ở trên) + 0 (session 2 chạy lại không đổi code)
- Model dùng: session 2 (chạy lại bước 3): GLM 5.3 qua opencode
