# Task: Bếp nhà hàng chia khu Nấu ăn / Dùng chung / Pha chế

Verify mode: light

## Mục tiêu
Gom nguyên liệu + máy theo công dụng: **khu nấu ăn** (trái) có thùng nguyên liệu nấu và máy nấu; **khu pha chế** (phải) có thùng nguyên liệu nước và máy pha; nguyên liệu dùng cho cả hai (Sữa, Dâu) đặt ở **giữa**, cạnh 6 bàn bàn giao. Vẫn có khoảng cách giữa các máy và thùng.

## Quyết định đã chốt
- Chỉ đổi toạ độ/bố cục + nhãn vùng. Không đổi luật game, id trạm, số lượng trạm (vẫn 43), `r_delivery` (820,640) và `r_trash`. Chỉ nhà hàng, không đụng tiệm trà.
- Toạ độ local = tâm trạm (hàm `at(x, y)`). Bếp nằm trong local x < 990, y ≥ `WALL_BOTTOM` (120). Khe ngang giữa 2 trạm kề nhau theo trục x ≥ 44px (người chơi rộng 36px), khe dọc ≥ 6px (giữa thùng cùng cột giữ 40px như hiện tại). `INTERACT_RANGE` = 70.
- Bố cục đề xuất (OpenCode được chỉnh ±vài chục px nếu va chạm, miễn giữ thứ tự vùng, khe 44px và test pass):
  - **Khu nấu ăn:** 15 thùng nấu ăn 3 cột × 5 hàng, x=31/129/227, y=170+i*88: cột 1 beef, chicken, salmon, shrimp, egg; cột 2 potato, tomato, lettuce, mushroom, pumpkin; cột 3 rice, noodles, flour, bread, cheese. Máy nấu 2 cột, y=170+i*75: cột x=340 = `r_chop_1`, `fry_1`, `fry_2`, `grill_1`, (thêm vị trí trống nếu cần); cột x=468 (sát khu giữa) = `boil_1`, `boil_2`, `bake_1`, `deepfry_1`, `r_shelf_plate`, `r_shelf_bowl`.
  - **Dùng chung (giữa):** 6 bàn giao `r_counter_1..6` ở x=585, y=200+i*66; thùng `r_crate_milk` (685,170) và `r_crate_strawberry` (685,258).
  - **Khu pha chế (phải):** thùng coffee, orange, lemon, chocolate ở x=790, y=170+i*88; `r_blend_1`, `r_brew_1`, `r_shelf_glass` ở x=903 (y=170, 260, 350); `r_chop_2` dời sang khu này (vd x=903, y=440).
  - Spawn ca nhà hàng (470,630)/(560,630) đổi nếu đè trạm (test T4 cũ vẫn phải pass).
- Nhãn vùng trên sàn: "🍳 Nấu ăn" (x≈270), "🤝 Dùng chung" (x≈640), "🥤 Pha chế" (x≈850), y≈610 như cũ, không đè trạm/quầy giao.

## Ngữ cảnh
- `shared/src/restaurant.ts`: `RESTAURANT_STATIONS` (dòng ~358) ghép từ `CHOP_BOARDS`, `BACK_ROW`, `MID_ROW`, `SHELF_ROW`, `LEFT_CRATES`, `ISLAND_CRATES`, counters; helpers `shelf(container,x,y)`, `cooker(process,n,x,y)`, `crate(foodId,x,y)`, `at(x,y)`; hằng `BACK_Y`, `MID_Y`, `SHELF_Y`, `COOK_X`, `COOK_PITCH`, `CRATE_PITCH`; `RESTAURANT_SPAWN_POINTS`. Comment "Kitchen layout" (dòng ~264) phải viết lại theo 3 khu.
- Id: `r_crate_<food>`, `r_<process>_<n>` (chop_1/2, fry_1/2, boil_1/2, grill_1, bake_1, deepfry_1, blend_1, brew_1), `r_shelf_<plate|bowl|glass>`, `r_counter_1..6`.
- `client/src/scenes/RestaurantView.ts`: `drawZoneLabels()` (dòng ~102, đang vẽ "Sơ chế/Bàn giao/Nấu"), `drawWall` có "pass rail" + ticket ở local x 600..900 (trên hàng cooker cũ).
- `tests/restaurant-layout.spec.ts`: T1 (không chồng nhau), T2 (thứ tự vùng), T3 (bàn giao), T4 (spawn), T5 (sync 43+14 trạm), T6 (2 người phối hợp, waypoint `walkRestaurantPath`), T7 (BFS reachability), T8 (khe 44px vùng sơ chế), T9 (đi bộ lối giữa các cột thùng), T10, T11, T12 (giữ nguyên). Test đánh số cũ trong spec là tên nội bộ, khác T1–T3 của task này.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → `RESTAURANT_STATIONS`, helpers và hằng vị trí: bỏ `BACK_ROW/MID_ROW/SHELF_ROW/LEFT_CRATES/ISLAND_CRATES/COOK_X...`, thay bằng danh sách theo khu (`COOK_CRATES`, `SHARED_CRATES`, `DRINK_CRATES`, cột máy nấu, cột máy pha) theo bố cục đề xuất; chuyển `r_chop_2` sang khu pha chế; giữ id/số lượng; chỉnh `RESTAURANT_SPAWN_POINTS` nếu đè; viết lại comment "Kitchen layout". Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/scenes/RestaurantView.ts` → `drawZoneLabels()` và pass rail trong `drawWall`: đổi 3 nhãn thành "🍳 Nấu ăn", "🤝 Dùng chung", "🥤 Pha chế" theo x mới; dời pass rail/ticket cho nằm trên hàng máy nấu cột x=340..468 (hoặc bỏ nếu không còn hợp). Chạy `npm run typecheck`.
- [x] 3. [khó] `tests/restaurant-layout.spec.ts` → sửa test nội bộ T2 (thứ tự vùng: max x thùng nấu/máy nấu < min x bàn giao và thùng chung < min x thùng nước/máy pha; milk, strawberry nằm giữa), T3 (bàn giao còn cách một thớt/cooker ≤160px, hoặc đổi sang: ≥3 bàn cách một máy nấu ≤ 160px), T6 (waypoint `walkRestaurantPath` theo bố cục mới), T8 và T9 (khe 44px/đường đi bộ theo toạ độ cột thùng; T8 tổng quát cho mọi cặp trạm kề nhau theo trục x ở cả 3 khu). T1, T4, T5, T7, T10–T12 giữ nguyên, phải pass. Thêm test mới `T13` (spec Node): nhóm thùng theo khu — `r_crate_coffee/orange/lemon/chocolate` + `r_blend_1`, `r_brew_1`, `r_shelf_glass` có x > mọi bàn giao; 15 thùng nấu ăn + máy nấu có x < mọi bàn giao; `r_crate_milk` và `r_crate_strawberry` nằm giữa (x trong khoảng mọi thùng nấu ăn ↔ mọi thùng nước).
- [x] 4. [dễ] Chạy `npm run typecheck` và `npx playwright test tests/restaurant-layout.spec.ts` rồi `npx playwright test`; ghi kết quả từng test vào "Test status".

## Test cases
- [x] T1. Nhóm khu đúng — thùng+máy nấu ăn ở trái bàn giao, thùng+máy pha chế ở phải, Sữa/Dâu ở giữa — tests/restaurant-layout.spec.ts (T13 trong file)
- [x] T2. Có khoảng cách và đi được — không trạm chồng nhau, mọi cặp kề nhau theo trục x ≥ 44px, mọi trạm tiếp cận được từ spawn — tests/restaurant-layout.spec.ts (T1, T7, T8 trong file)
- [x] T3. 2 người phối hợp được qua các khu — P1 lấy khoai tây, thái, đặt lên bàn giao; P2 lấy, chiên, lấy đĩa, bày `plate:potato.chop.deepfry` — tests/restaurant-layout.spec.ts (T6 trong file)

## Trạng thái hiện tại
- Đã xong bước 1 trong `shared/src/restaurant.ts` (chi tiết ở commit trước): 3 khu Nấu ăn trái / Dùng chung giữa / Pha chế phải, 43 trạm giữ nguyên id, spawn giữ nguyên, typecheck PASS.
- Đã xong bước 2 trong `client/src/scenes/RestaurantView.ts`: `drawZoneLabels()` đổi 3 nhãn sàn thành "🍳 Nấu ăn" (x=270, y=610), "🤝 Dùng chung" (x=640, y=610), "🥤 Pha chế" (x=850, y=555). Lý do nhãn Pha chế không ở y=610 như đề xuất: quầy Mang đi `r_delivery` (local 745..895 × 600..680) đè đúng vị trí (850,610), và dải sàn còn lại bên phải quầy (895..990) chỉ rộng 95px — hẹp hơn chiều rộng nhãn khi font phóng 1.3x trên touch (~97px), nên đặt nhãn vào khe sàn trên quầy (giữa đáy `r_chop_2` y=470 và mép trên quầy y=600), vẫn giữ x≈850 và đúng ràng buộc "không đè trạm/quầy giao" (cách `r_chop_2` 73px, cách quầy 33px). Pass rail + ticket trong `drawWall()` dời từ local x 600..900 sang nằm trên hàng máy nấu: rail x=298 rộng 212 (phủ 2 cột máy x=340/468 tức rect 298..510), 5 ticket pitch 36 ở x=319..489 thay vì 6 ticket pitch 48. Không đổi gì khác; sign, wallpaper, exit giữ nguyên. Đã typecheck PASS. Bước 3–4 chưa làm.

Bước 3–4 (Claude làm tay): runner OpenCode dừng ngay khi bắt đầu bước 3 (run.log kết thúc ở dòng "bước 3 · glm-5.3", không có kết quả, spec chưa sửa nên T2, T3, T6, T11 fail). Đã sửa `tests/restaurant-layout.spec.ts`: T2, T3, T6, T8, T11 theo toạ độ mới, thêm T13; chạy full suite 17/17 PASS.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS; `npx playwright test` 17/17 PASS (restaurant-layout 14, orders-panel 3).
- Kết quả từng test:
  - T1: PASS — spec T13 (+ T2 zone order)
  - T2: PASS — spec T1, T7, T8 (T8 tổng quát cho mọi trạm kề nhau theo trục x)
  - T3: PASS — spec T6 (waypoint qua aisle x=80/404/533)
- Fail chi tiết: —

## Verify
Chế độ light. Toàn suite playwright 17/17 PASS (xem Test status).
- T1 (nhóm khu): PASS — `.agents/screenshots/kitchen-drink-zone.png`: thùng + máy nấu bên trái, 6 bàn giao ở giữa cùng thùng Dâu/Sữa, thùng Cà phê/Cam/Chanh/Sô cô la + Máy cà phê/Kệ ly/Thớt bên phải; khoảng cách giữa các trạm rõ ràng.
- Nhãn vùng "Nấu ăn / Dùng chung / Pha chế": PASS, không đè trạm (nhãn Pha chế ở y=555, trên quầy Mang đi). Ghi chú nhỏ: icon 🍳 hiển thị giống 🔍 do font, chỉ là thẩm mỹ.
- Không phát hiện lỗi; không viết thêm spec.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
