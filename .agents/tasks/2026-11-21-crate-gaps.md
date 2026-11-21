# Task: Giãn thùng nguyên liệu nhà hàng để đi lọt giữa các thùng

Verify mode: light

## Mục tiêu
Trong vùng sơ chế của bếp nhà hàng, các thùng nguyên liệu trong cùng một cột cách nhau chỉ 12px (pitch 60, thùng cao 48) nên người chơi (rộng 36px) không đi lọt giữa các thùng. Giãn theo chiều dọc để mỗi thùng cách thùng kế bên 1 ô (40px = `BUILD_TILE`), người chơi đi qua lại được.

## Quyết định đã chốt
- Chỉ đổi toạ độ: giữ 3 cột x=31/129/227, 7 thùng/cột, thùng 54x48. Pitch dọc đổi 60 → 88 (khe 40px), y đầu giữ 170 (y = 170 + i*88, thùng cuối y=698, đáy 722 < 760).
- `r_trash` dời từ (40, 712) sang (330, 712) vì đè thùng cuối cột 1.
- Không đổi id, số lượng trạm, luật game, thớt, bàn giao, khu nấu, spawn.

## Ngữ cảnh
- `shared/src/restaurant.ts`, mục "Kitchen layout":
  ```ts
  ...LEFT_CRATES.map((f, i) => crate(f, 31, 170 + i * 60)),
  ...ISLAND_CRATES.slice(0, 7).map((f, i) => crate(f, 129, 170 + i * 60)),
  ...ISLAND_CRATES.slice(7).map((f, i) => crate(f, 227, 170 + i * 60)),
  { id: "r_trash", ..., ...at(40, 712), width: 52, height: 52, ... },
  ```
  `crate()` tạo trạm width 54, height 48. `at(x, y)` đổi local → world.
- `tests/restaurant-layout.spec.ts`: T1 (không chồng nhau), T7 (BFS reachable), T8 (khe ngang ≥ 44), T9 (đi bộ lấy `food:shrimp` ở `r_crate_shrimp` qua lối đi x=76 và `food:tomato` ở `r_crate_tomato` qua lối đi x=174), helper `walkRestaurantPath(page, waypoints, dir)`, `rectOf`, `byIdPrefix`. T6 đi tới khoai tây (129, 170) và thớt/bàn giao.
- Toạ độ y mới: LEFT_CRATES (x=31): beef 170, chicken 258, salmon 346, shrimp 434, egg 522, milk 610, cheese 698. ISLAND_CRATES cột 2 (x=129): potato 170, tomato 258, ... mushroom/… tới y=698. Cột 3 (x=227) tương tự.
- `INTERACT_RANGE` = 70, `PLAYER_RADIUS` = 18.

## Plan
- [x] 1. [dễ] `shared/src/restaurant.ts` → `RESTAURANT_STATIONS`: đổi `170 + i * 60` thành `170 + i * 88` cho 3 nhóm crate (có thể tách hằng `CRATE_PITCH = 88`); dời `r_trash` sang `at(330, 712)`; cập nhật comment "Kitchen layout" (thùng cách nhau 40px theo cả hai trục, trash ở đáy vùng sơ chế). Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/restaurant-layout.spec.ts` → viết T1 mới (test Node, đặt tên `T10`, xem "Test cases"); sửa T9 (toạ độ shrimp y=434, tomato y=258 và waypoint đứng giữa hai thùng theo trục y) và waypoint T6 nếu còn trỏ vào y cũ; T1–T8 khác giữ nguyên. Tick T1, T2.
- [x] 3. [dễ] Chạy `npm run typecheck` rồi `npx playwright test tests/restaurant-layout.spec.ts` rồi `npx playwright test`; ghi kết quả từng test vào "Test status".

## Test cases
- [x] T1. Khe dọc giữa thùng cùng cột ≥ 40px — mọi cặp `r_crate_*` cùng x liền kề theo trục y có khe giữa hai rect ≥ 40px; không trạm nào giao nhau, trạm nằm trong sàn (y ≤ 760) — tests/restaurant-layout.spec.ts
- [x] T2. Đi bộ vào khe giữa các thùng — người chơi trong trình duyệt đi vào khe dọc giữa hai thùng cột 1 và lấy được `food:shrimp` (kèm T9 sửa toạ độ mới, T7 vẫn PASS) — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
Cả 3 bước xong. Bước 1: pitch dọc thùng 60 → 88 (`CRATE_PITCH`), `r_trash` sang (330, 712). Bước 2: thêm test Node `T10` (khe dọc ≥ 40px cùng cột, không chồng lấp, trạm trong sàn y ≤ 760); viết lại T9 — lối đi ngang y=630 bị thùng gạo (129, 610) chắn nên đi ven đáy y=742, lên lối đi x=76, bước vào khe dọc giữa tôm (y=434) và trứng (y=522) tại (31, 477) → `food:shrimp`; discard tại thùng rác mới (330, 712); lên lối đi x=174, vào khe giữa cà chua (y=258) và rau (y=346) tại (129, 301) → `food:tomato`. Bước 3: typecheck PASS, spec 10/10 PASS, toàn bộ suite 13/13 PASS.

## Test status
- Lần chạy cuối: Verify (light) — `npx playwright test` 13/13 PASS (43.2s).
- Kết quả từng test:
  - T1: PASS (`tests/restaurant-layout.spec.ts` › `T10` — khe dọc giữa các thùng cùng cột ≥ 40px, không trạm nào chồng lấp, toàn bộ trạm nằm trong sàn y ≤ 760)
  - T2: PASS (`tests/restaurant-layout.spec.ts` › `T9` — người chơi đi bộ vào khe dọc giữa các thùng cột 1 lấy `food:shrimp` và cột 2 lấy `food:tomato`; `T7` — mọi trạm reachable vẫn PASS)
  - `tests/restaurant-layout.spec.ts`: T1–T10 PASS
  - `tests/orders-panel.spec.ts`: T1–T3 PASS
- Fail chi tiết: không

## Verify
- T1 (Khe dọc giữa thùng cùng cột ≥ 40px, không giao nhau, nằm trong sàn y ≤ 760): PASS (đã kiểm tra qua spec `tests/restaurant-layout.spec.ts` › `T10`, `T1`)
- T2 (Người chơi đi bộ vào khe dọc giữa hai thùng cột 1 lấy `food:shrimp`, `T9` và `T7` PASS): PASS (đã kiểm tra qua spec `tests/restaurant-layout.spec.ts` › `T9`, `T7`)

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
