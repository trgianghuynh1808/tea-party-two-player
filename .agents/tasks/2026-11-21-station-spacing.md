# Task: Giãn khoảng cách giữa các máy và các bàn (tiệm trà + nhà hàng)

Verify mode: light

## Mục tiêu
Các máy (cooker/machine/kệ) và bàn (counter) đang sát nhau (khe 2–24px). Giãn ra để giữa hai trạm liền kề cùng hàng/cột có khe ≥ 40px (= `BUILD_TILE`), người chơi (rộng 36px) đi lọt giữa được.

## Quyết định đã chốt
- Chỉ đổi toạ độ, không đổi id/số lượng/luật game.
- Nhà hàng: máy cột bếp pitch 75 → 100 (khe 40); bàn bàn giao pitch 66 → 98 (khe 40); máy khu đồ uống pitch 90 → 100.
- Tiệm trà: hàng máy pitch 120 → 130 (khe 34, thêm chút), 5 bàn pitch 60 → 100 (khe 42), bắt đầu x=260 để không đụng quầy giao hàng (x=850).
- Thùng nguyên liệu đã đủ khe (task crate-gaps), không đổi.

## Ngữ cảnh
- `shared/src/restaurant.ts`: `COOK_MACHINE_PITCH = 75`, `DRINK_MACHINE_PITCH = 90`, `TOP_Y = WALL_BOTTOM + 50` (= 170), máy/kệ 84x60, bàn 58x58:
  ```ts
  ...at(COUNTER_X, 200 + i * 66)   // 6 bàn r_counter_1..6
  { id: "r_trash", ..., ...at(330, 712), width: 52, height: 52 }
  { id: "r_delivery", ..., ...at(820, 640), width: 150, height: 80 }
  ```
  Cột bếp có 6 hàng (4 máy + kệ đĩa + kệ tô) → hàng cuối y = 170 + 5*100 = 670 (đáy 700); `r_trash` (330, 712) sẽ đè kệ → dời sang chỗ trống (vd. x=404, y=730, giữa hai cột máy, đáy 756 ≤ 760). Bàn: y = 200 + i*98 → cuối 690, đáy 719. Sàn cao 760.
- `shared/src/menu.ts`: `MACHINE_W = 96`, `MACHINE_Y = 145`; máy x = 76,196,...,796 (pitch 120); 5 bàn `x: 340 + i * 60, y: 300, 58x58`; quầy giao hàng (850,450,180x95); trash (52,420).
- `tests/restaurant-layout.spec.ts`: có helper `rectOf`, `rectsOverlap`, `local`, `byIdPrefix`; T1 (không chồng), T7 (BFS reachable/INTERACT_RANGE=70), T8 (khe ngang ≥ 44), T10 (khe dọc crate ≥ 40), T6/T9 đi bộ theo waypoint cố định.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → `COOK_MACHINE_PITCH` = 100, `DRINK_MACHINE_PITCH` = 100, bàn `200 + i * 98`, dời `r_trash` ra khỏi cột máy (vd. `at(404, 730)`); kiểm tra không trạm nào chồng nhau, trạm còn trong sàn (y ≤ 760), `r_delivery` và `RESTAURANT_SPAWN_POINTS` không bị đè; cập nhật comment "Kitchen layout". Chạy `npm run typecheck`.
- [x] 2. [khó] `shared/src/menu.ts` → `STATIONS`: máy x = 76 + i*130 (cup_shelf, black_tea, green_tea, milk, pearl, cheese_foam, passion; sửa từng literal hoặc dùng hằng `MACHINE_PITCH = 130`), 5 bàn `x: 260 + i * 100`. Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/restaurant-layout.spec.ts` → thêm 2 test (xem Test cases); sửa waypoint T6/T9/T7 nếu còn trỏ vào toạ độ cũ của máy/bàn/trash. Chạy `npx playwright test tests/restaurant-layout.spec.ts`, rồi `npx playwright test`; ghi kết quả từng test vào "Test status".

## Test cases
- [x] T1. Khe giữa máy/bàn nhà hàng ≥ 40px — mọi cặp máy (`r_fry|boil|grill|bake|deepfry|blend|brew|chop`, kệ) cùng cột liền kề và mọi cặp `r_counter_*` liền kề có khe ≥ 40px; không trạm chồng nhau, nằm trong sàn y ≤ 760; T7 (reachable) vẫn PASS — tests/restaurant-layout.spec.ts
- [x] T2. Khe giữa máy/bàn tiệm trà ≥ 40px (máy ≥ 30px) — các `Machine`/`CupShelf` liền kề khe ≥ 30px, 5 `counter_*` khe ≥ 40px, không chồng quầy giao hàng, trong khung 960x600 — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `COOK_MACHINE_PITCH`/`DRINK_MACHINE_PITCH` = 100, `COUNTER_PITCH` = 98 (bàn y = 200 + i*98, đáy hàng cuối 719), `r_trash` dời (330,712) → (404,730) (giữa hai cột máy, đáy 756, không chồng kệ tô). Kiểm chứng hình học (script tạm, esbuild+node, không commit): 0 cặp station chồng nhau, mọi đáy ≤ 760, mọi khe dọc cột máy/bàn = 40, `r_delivery` không bị đè.
- Lưu ý (ngoài pitch/trash, cùng file `restaurant.ts`): bàn mới `counter_5` (y 563..621) và kệ tô mới (y 640..700) chạm vòng player (radius 18) tại spawn cũ (470/560, 630) → dời `RESTAURANT_SPAWN_POINTS` xuống (470, 740), (560, 740) (cách station gần nhất 40 / 21, đáy player 758 ≤ 760).
- Bước 2 xong: tiệm trà sửa literal máy x = 76, 206, 336, 466, 596, 726, 856 (pitch 130, khe 34) và 5 bàn x = 260 + i*100 (khe 42), không đổi id/loại nào. Kiểm chứng hình học (script tạm, không commit): không station chồng nhau, không chồng quầy giao hàng/trash, tất cả trong khung 960x600.
- Bước 3 xong (spec `tests/restaurant-layout.spec.ts`):
  - Thêm 2 test theo Test cases: "T1: restaurant machines, shelves and counters in one column leave a 40px vertical gap" và "T2: tea shop machines leave a 30px gap and counters a 40px gap, clear of the delivery counter" (thêm `StationType`, `WORLD_WIDTH`, `WORLD_HEIGHT` vào import từ `@boba/shared`).
  - Sửa waypoint T6, T9 vì toạ độ cũ trỏ máy/bàn/trash cũ: trash (404, 730) chặn lối đáy giữa hai cột máy → đường vòng qua khe máy y=220 (aisle 533 → 404 → 276 → đáy → aisle 80); T6 P2: deepfry (533,470), kệ đĩa (533,570); T9 discard đứng (404,660) hướng xuống (trash gần hơn kệ tô nhờ FACING_BIAS 30); khe tomato/lettuce mới 40px → T9 dùng (129,302) + facing "up" (cũ lệch 19/21, giờ 20/20 cần bias).
  - T7 không phải sửa (không có toạ độ cứng; BFS tự thích ứng, PASS).
  - Ngoài T6/T9 được plan nêu, cùng spec còn 2 test trỏ toạ độ cũ của máy (layout mới làm fail nếu giữ nguyên) nên sửa luôn, cùng file duy nhất của bước: T11 boilGap (468,205) → (468,212) (khe boil mới 40px, cần điểm lệch để facing "down" chọn r_boil_2 với FACING_BIAS=30); T12 crateGapPath đổi sang đường vòng như T9. Không test nào khác đổi.

## Test status
- Lần chạy cuối: `npm run typecheck` → PASS; `npx playwright test tests/restaurant-layout.spec.ts` → 16 passed; `npx playwright test` → 19 passed (16 restaurant-layout + 3 orders-panel), 0 fail.
- Kết quả từng test (theo task):
  - T1 (khe máy/bàn nhà hàng ≥ 40, không chồng, trong sàn; T7 reachable) → PASS: spec "T1: restaurant machines, shelves and counters in one column leave a 40px vertical gap" + "T1: every station stays inside the kitchen and no two stations overlap" + T7 PASS.
  - T2 (khe máy tiệm trà ≥ 30, bàn ≥ 40, không chồng quầy giao hàng, khung 960x600) → PASS: spec "T2: tea shop machines leave a 30px gap and counters a 40px gap, clear of the delivery counter".
  - Các test cũ trong spec sau khi đổi toạ độ: T2 zone order, T3 bridge, T4 spawn, T5 2-player spawn snapshot, T6 collaborate (waypoint mới), T7 BFS reachable, T8 aisle 44, T10 crate gap, T11 facing, T9 crate walk (waypoint mới), T12 facing per-room (waypoint mới), T13 zone crates, T1 labels — tất cả PASS.
- Fail chi tiết: không.

## Verify
- T1 (khe máy/bàn nhà hàng ≥ 40px): PASS (spec `T1` restaurant machines..., T7/T8 vẫn PASS)
- T2 (khe máy/bàn tiệm trà): PASS (spec `T2`)
- Toàn bộ suite 19/19 PASS, typecheck PASS.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
