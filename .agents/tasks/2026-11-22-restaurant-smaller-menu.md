# Task: Nhà hàng gọn hơn (ít món, ít máy, map nhỏ, khay nguyên liệu thưa)

Verify mode: light

## Mục tiêu
- Menu nhà hàng giảm từ 21 xuống 11 món.
- Khay nguyên liệu giảm từ 21 xuống 12, xếp thưa hơn (khe giữa các khay 24px thay vì 8px) để khó lấy nhầm.
- Máy chức năng: trừ thớt (giữ 2 cái) mỗi loại chỉ còn 1 cái; bỏ hẳn lò nướng (không món nào dùng).
- Map nhà hàng nhỏ lại từ 1400×760 xuống 1000×620; mọi trạm vẫn chạm tới được, cửa ra và khu ăn giữa phòng vẫn thông thoáng.

## Quyết định đã chốt
- 11 món giữ lại (id trong `DISHES`): `fries`, `omurice`, `sushi`, `steak`, `spaghetti`, `salad`, `mushroom_soup`, `beef_stew`, `orange_juice`, `black_coffee`, `latte`. Xoá các món còn lại khỏi `DISHES`.
- 12 khay (trái → phải): beef, salmon, egg, potato, tomato, lettuce, mushroom, rice, noodles, milk, orange, coffee.
- Máy còn lại: `r_chop_1`, `r_chop_2`, `r_fry_1`, `r_boil_1`, `r_grill_1`, `r_deepfry_1`, `r_blend_1`, `r_brew_1` (8 máy). Bỏ `r_bake_1`, `r_fry_2`, `r_boil_2`.
- Bàn chuyển tay (`r_counter_N`) giảm từ 6 xuống 4.
- Giữ nguyên `FOODS` / `PROCESSES` / `FoodId` (chỉ đổi danh sách khay và món) để không vỡ ảnh/type ở client.
- Đồ nội thất đã đặt trong nhà hàng nằm ngoài vùng mới sẽ bị kẹp vào trong phòng khi load; món nào vẫn không đặt được thì bị bỏ (đã có log cảnh báo).

## Ngữ cảnh
- `shared/src/restaurant.ts`: `DISHES: DishDef[]` (hàm `dish(...)`), danh sách khay `COOK_CRATES` / `SHARED_CRATES` / `DRINK_CRATES`, `LEFT_OUTER` / `LEFT_INNER` / `RIGHT_MACHINES` (`[ProcessId, n][]`), hằng `TOP_Y`, `CRATE_PITCH_X = 62`, `LEFT_OUTER_X = 60`, `LEFT_INNER_X = 214`, `RIGHT_MACHINE_X = 1340`, `MACHINE_TOP_Y = 270`, `MACHINE_PITCH_Y = 110`, `BOTTOM_Y = 715`, `RESTAURANT_STATIONS` (crate row ở `x = 40 + i*62`, `986 + i*62`, `1126 + i*62`; bottom row: trash x=120, shelf plate 200, bowl 300, 6 counters x=[400,470,540,860,930,1000], delivery x=1120 y=705 (150×80), shelf glass 1250), `RESTAURANT_SPAWN_POINTS = [at(630,600), at(770,600)]`.
- `shared/src/world.ts`: `RESTAURANT = { x: 1400, y: 0, width: 1400, height: 760 }`; `RESTAURANT_EXIT_ZONE` (left `+660`, right `+740`, top `height-24`); `RESTAURANT_ENTRY_SPAWN = { x: RESTAURANT.x + 700, y: height - 70 }`. Cửa nằm giữa phòng theo chiều ngang (`width / 2`).
- `shared/src/placement.ts`: `DECOR_ROOMS` dùng `RESTAURANT.*` (tự theo kích thước mới).
- `client/src/scenes/RestaurantView.ts`: `DINING_RECT = { left: 280, top: 230, right: 1250, bottom: 660 }` (sàn gỗ khu ăn), tự vẽ theo `RESTAURANT.width/height`.
- `server/src/shop/SharedShop.ts` → `apply(save)`: vòng lặp validate lại đồ nội thất bằng `canPlaceDecoration`, chỉ "nudge" y xuống tối đa `RESTORE_NUDGE_STEPS` bước, nếu vẫn không đặt được thì `dropped++`.
- Layout mới (toạ độ local trong phòng, phòng 1000×620):
  - Hàng khay: `TOP_Y` giữ nguyên (170); khay thứ i ở `x = 52 + i * 78` (12 khay, pitch 78).
  - Cột trái ngoài `x=60`: `fry 1` y=260, `boil 1` y=360. Cột trái trong `x=214`: `chop 1` y=260, `deepfry 1` y=360, `grill 1` y=460. Lối đi giữa 2 cột vẫn 70px. Cột phải `x=940`: `chop 2` y=260, `blend 1` y=360, `brew 1` y=460. Hằng mới: `MACHINE_TOP_Y = 260`, `MACHINE_PITCH_Y = 100`, `RIGHT_MACHINE_X = 940`.
  - Hàng dưới `BOTTOM_Y = 575`: trash x=80; kệ đĩa x=170; kệ tô x=262; counters x=340, 405 | khe cửa x 450..550 | counters x=595, 660; delivery x=780 (y = BOTTOM_Y - 10); kệ ly x=905. Cần `r_counter_1..4`.
  - `RESTAURANT_SPAWN_POINTS = [at(440, 480), at(560, 480)]`.
  - `world.ts`: `RESTAURANT = { x: 1400, y: 0, width: 1000, height: 620 }`; exit zone `left +460`, `right +540`; entry spawn `x: RESTAURANT.x + 500`.
  - Khu ăn (`DINING_RECT`, local): `{ left: 280, top: 230, right: 860, bottom: 520 }`. Khe cửa trong test: `{ left: 450, top: 540, right: 550, bottom: 620 }`.
- `tests/restaurant-layout.spec.ts` (~600 dòng) cứng mã layout cũ: `edge-layout T1` (21 khay, 11 máy, cột x 60/214/1340, `r_bake_1`, 6 counter, `DINING_RECT`/`DOOR_GAP_RECT` cũ, khe dọc ≥48), `edge-layout T2`, `T4`, `T7`, `T11` (dùng `r_bake_1`/`r_fry_1` và `r_crate_shrimp`/`r_crate_egg`), `T5`, `edge-layout T3`, `T12`. Helper: `tests/helpers.ts` (`joinAsHost`, `startRestaurantShift`).

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → sửa `DISHES` (chỉ giữ 11 món đã chốt), danh sách khay (một mảng 12 khay đúng thứ tự, pitch 78, bỏ `SHARED_CRATES`/`DRINK_CRATES` nếu thành thừa), `LEFT_OUTER`/`LEFT_INNER`/`RIGHT_MACHINES`, các hằng layout, `RESTAURANT_STATIONS` (4 counter, toạ độ hàng dưới), `RESTAURANT_SPAWN_POINTS` theo phần "Layout mới". Cập nhật comment đầu mục "Kitchen layout" cho đúng (12 khay, 8 máy).
- [x] 2. [khó] `shared/src/world.ts` → `RESTAURANT` = 1000×620, `RESTAURANT_EXIT_ZONE` và `RESTAURANT_ENTRY_SPAWN` theo `width / 2` (cửa giữa phòng). Đồng thời `client/src/scenes/RestaurantView.ts` → `DINING_RECT` = `{ left: 280, top: 230, right: 860, bottom: 520 }`. Sau đó chạy `npm run typecheck`.
- [x] 3. [vừa] `server/src/shop/SharedShop.ts` → trong `apply()`, với món nội thất thuộc nhà hàng (dùng `areaOf({x, y}) === "restaurant"`), kẹp `x`/`y` vào hộp sàn của phòng (`DECOR_ROOMS`/`RESTAURANT`) trước vòng nudge hiện có, để đồ cũ nằm ngoài vùng mới được kéo vào thay vì bị bỏ. Không đổi gì khác.
- [x] 4. [khó] `tests/restaurant-layout.spec.ts` → cập nhật theo layout mới: `edge-layout T1` (12 khay y=170, 8 máy, cột x 60/214/940, `r_chop_2/r_blend_1/r_brew_1` ở cột phải, 4 counter, khe dọc giữa máy cùng cột ≥ 40, `DINING_RECT`/`DOOR_GAP_RECT` mới ở "Ngữ cảnh"), `edge-layout T2`/`T4`/`T7` (spawn mới, vẫn chạm được mọi trạm), `T11` (thay `r_bake_1`/`r_fry_1` bằng `r_fry_1`/`r_boil_1`, và `r_crate_shrimp`/`r_crate_egg` bằng 2 khay kề nhau như `r_crate_beef`/`r_crate_salmon`: đứng sát khay trái 2px, nhìn trái chọn khay trái, nhìn phải chọn khay phải), `T5`/`T12`/`edge-layout T3` (toạ độ, id khay/máy còn tồn tại). Thêm test mới T3 (menu) vào cùng file. Chạy: `npx playwright test tests/restaurant-layout.spec.ts`, rồi `npm run typecheck`.

## Test cases
- [x] T1. Layout gọn — 12 khay thành một hàng y=170 cách nhau ≥ 20px, đúng 8 máy với mỗi loại ≤ 1 trừ thớt = 2, không có `r_bake_1`, 4 counter, không trạm nào nằm trong khu ăn hoặc khe cửa, nằm trọn trong phòng 1000×620, không chồng nhau — tests/restaurant-layout.spec.ts
- [x] T2. Đi tới được mọi trạm — từ spawn và entry mọi trạm có chỗ đứng đi bộ tới được trong `INTERACT_RANGE`; spawn và cửa ra không đè trạm — tests/restaurant-layout.spec.ts
- [x] T3. Menu 11 món — `DISHES` đúng 11 id đã chốt; mọi nguyên liệu và bước nấu mà món dùng đều có khay tương ứng và máy tương ứng trong `RESTAURANT_STATIONS` (không món nào làm không được); không khay nào thừa — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `shared/src/restaurant.ts` đã giảm menu còn 11 món, gộp khay thành 1 mảng 12 khay (pitch 78, x = 52 + i*78), 8 máy (bỏ `r_bake_1`/`r_fry_2`/`r_boil_2`), 4 counter `r_counter_1..4`, `BOTTOM_Y = 575`, `MACHINE_TOP_Y = 260`, `MACHINE_PITCH_Y = 100`, `RIGHT_MACHINE_X = 940`, spawn `[at(440,480), at(560,480)]`; comment "Kitchen layout" đã viết lại.
- Bước 2 xong: `shared/src/world.ts` đã thu `RESTAURANT` về 1000×620, exit zone về left `+460`/right `+540`, entry spawn về `x: RESTAURANT.x + 500`; `client/src/scenes/RestaurantView.ts` đã đổi `DINING_RECT` thành `{ left: 280, top: 230, right: 860, bottom: 520 }`.
- Bước 3 xong: `server/src/shop/SharedShop.ts` → `apply()` giờ kẹp `x`/`y` của món nội thất nhà hàng (`areaOf(...) === "restaurant"`) vào `DECOR_ROOMS` floor box (trừ nửa footprint) trước vòng nudge, rồi nudge/place dùng toạ độ đã kẹp; import thêm `DECOR_ROOMS`, `footprintOf`.
- Bước 4 xong (hoàn tất plan): `tests/restaurant-layout.spec.ts` cập nhật theo layout mới — `edge-layout T1` viết lại (12 khay y=170 gap ≥20, 8 máy cột 60/214/940 với `perProcess` chop=2 còn lại 1, không `r_bake_1`, khe dọc ≥40, aisle 70, bottom row 9 trạm y≥565 với 4 counter, `DINING_RECT {280,230,860,520}` / `DOOR_GAP_RECT {450,540,550,620}`); `T11` đổi sang `r_fry_1`/`r_boil_1` (đứng +18px dưới chảo) và `r_crate_beef`/`r_crate_salmon` (đứng +2px phải khay beef); `T12` giữ egg/potato nhưng stand hạ về `rectOf(egg).bottom + 18 = 212` và path vòng qua x=390 (cột trong x=214 chắn đường thẳng cũ); thêm test `T3` (menu 11 món, khay/máy/kệ đủ, không thừa). `edge-layout T2`/`T4`/`T7`/`T5`/`edge-layout T3` dùng hằng/toạ độ tính từ station nên giữ nguyên code, pass với layout mới. Kết quả: `npx playwright test tests/restaurant-layout.spec.ts` 11/11 PASS (33.3s); `npm run typecheck` PASS.

## Test status
- Lần chạy cuối: `npx playwright test tests/restaurant-layout.spec.ts` (sau bước 4) — 11 passed / 0 failed; `npm run typecheck` — PASS.
- Kết quả từng test:
  - T1: PASS — "edge-layout T1" (12 khay hàng y=170 gap ≥20, 8 máy đúng loại/số, cột 60/214/940, 4 counter, không đè khu ăn/khe cửa, trong phòng 1000×620, không chồng nhau)
  - T2: PASS — "edge-layout T2" (+ `T4`, `T7`: spawn/entry hợp lệ, mọi trạm có chỗ đứng trong `INTERACT_RANGE`, exit thoáng)
  - T3: PASS — "T3: the menu is 11 dishes..." (11 id đúng danh sách chốt; đủ khay/máy/kệ, không khay/máy thừa)
  - (Các test khác trong file: `T2` tea shop, `T11`, `T5`, `edge-layout T3`, `T12`, `T1` label — đều PASS)
- Fail chi tiết: (không)

## Verify
- Toàn bộ e2e: 27/27 PASS; T1, T2, T3 PASS (đều trong tests/restaurant-layout.spec.ts); `npm run typecheck` PASS.
- Giao diện nhà hàng khi vào ca: PASS (12 khay thưa một hàng, 8 máy, cửa giữa phòng, khu ăn gọn) — screenshot: /private/tmp/claude-501/-Users-erihuynh-Documents-projects-tea-party-two-players/53d0604d-e937-4d9a-9107-a5ab5aeb4743/scratchpad/restaurant.png

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
