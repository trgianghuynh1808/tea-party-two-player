# Task: Bếp nhà hàng dùng rìa, trung tâm để trống cho khách

Verify mode: light

## Mục tiêu
- Thùng nguyên liệu (21 cái) xếp thành MỘT hàng ngang sát tường trên.
- Máy nấu/pha xếp thành MỘT cột dọc sát rìa trái và MỘT cột dọc sát rìa phải (không còn nhiều cột lồng nhau).
- Kệ đĩa/tô/ly, 6 "Bàn" bàn giao, quầy "Mang đi" và thùng rác nằm ở MỘT hàng ngang dưới cùng, chừa một khoảng trống ở giữa cho cửa ra.
- Trung tâm phòng trống hoàn toàn (không station), làm phòng khách: sàn gỗ ở giữa, gạch ở viền; cửa ra dời về giữa cạnh dưới.
- Đường đi: không còn chỗ phải chen qua khe hẹp; mọi station chạm tới được từ khoảng trống ở giữa.

## Quyết định đã chốt
- Phòng khách dời vào trung tâm ngay trong task này (host vẫn trang trí tự do; vùng đặt đồ là phần không đụng station nên không cần đổi `placement.ts`).
- 6 bàn bàn giao + "Mang đi" cùng ở hàng dưới.
- Không đổi RESTAURANT size (1400×760), không đổi menu/công thức/logic server.
- Cột phải có 5 máy: bake, deepfry, chop2, blend, brew (cột trái có 6 máy: chop1, fry1, fry2, grill1, boil1, boil2). Hàng nóng bake/deepfry nằm bên phải vì cột trái chỉ chứa 6.

## Ngữ cảnh
- Toạ độ local trong phòng (0,0 = góc trên-trái), `at(x, y)` cộng `RESTAURANT.x/y`. Tường trên cao `WALL_BOTTOM = 120`. Player bán kính 18 (`PLAYER_RADIUS`), tầm tương tác 70 (`INTERACT_RANGE`, đo từ tâm player tới mép station).
- `shared/src/restaurant.ts` hiện có: `TOP_Y = WALL_BOTTOM + 50` (=170), `CRATE_PITCH`, `COOK_MACHINE_PITCH`, `COOK_CRATE_X`, `COOK_MACHINE_X`, `COUNTER_X`, `SHARED_CRATE_X`, `DRINK_CRATE_X`, `DRINK_MACHINE_X`, các hàm `shelf(container,x,y)` (84×60), `cooker(process,n,x,y)` (84×60), `crate(foodId,x,y)` (54×48), mảng `COOK_CRATES` (3 cột × 5), `SHARED_CRATES`, `DRINK_CRATES`, `COOK_MACHINES`, `COOK_MACHINES_INNER`, `COOK_SHELVES`, `DRINK_MACHINES`, `RESTAURANT_STATIONS`, `RESTAURANT_SPAWN_POINTS = [at(470,740), at(560,740)]`. Counter id `r_counter_1..6` (58×58, `StationType.Counter`, label "Bàn"), `r_delivery` (150×80, `DeliveryCounter`), `r_trash` (52×52).
- `shared/src/world.ts`: `RESTAURANT_EXIT_ZONE` (left `RESTAURANT.x+1140`..`+1220`, top `y+height-24`, bottom `y+height`) và `RESTAURANT_ENTRY_SPAWN = { x: RESTAURANT.x + 1180, y: RESTAURANT.y + RESTAURANT.height - 70 }`.
- `client/src/scenes/RestaurantView.ts`: hằng `DINING_X = 990` (gạch trái / gỗ phải), `drawWall` (splashback trắng tới `DINING_X-30`, bảng hiệu "🍽️ Nhà hàng" tại `signX`, thanh pass rail x 298..510), `drawExit` (đọc `RESTAURANT_EXIT_ZONE`), `drawZoneLabels` (3 nhãn "Nấu ăn", "Dùng chung", "Pha chế").
- Layout mới (toạ độ local, tâm station). Các số này là chỉ định, giữ đúng:
  - `CRATE_PITCH_X = 62`, hàng thùng ở `y = TOP_Y (170)`. Cook 15 thùng x = 40 + 62·i (i=0..14, thứ tự theo `COOK_CRATES` đọc từng cột: beef…egg, potato…pumpkin, rice…cheese). Shared (milk, strawberry): x = 986, 1048. Drink (coffee, orange, lemon, chocolate): x = 1126, 1188, 1250, 1312.
  - Cột trái x = 60, cột phải x = 1340; y = 270 + 70·i (i=0..5). Trái từ trên xuống: chop1, fry1, fry2, grill1, boil1, boil2. Phải từ trên xuống: bake1, deepfry1, chop2, blend1, brew1.
  - Hàng dưới, tâm y = 715 (khoảng trống cho cửa: x 640..760 không có station): trash x=120 (52×52); shelf plate x=200, shelf bowl x=300; counters 1..3 x = 400, 470, 540; counters 4..6 x = 860, 930, 1000; `r_delivery` x = 1120 (cao 80 → tâm y 705 cho hợp, y = 705); shelf glass x = 1250.
  - Cửa: `RESTAURANT_EXIT_ZONE` x local 660..740 (như cũ y: height-24..height); `RESTAURANT_ENTRY_SPAWN` local (700, 690). `RESTAURANT_SPAWN_POINTS` = `[at(630, 600), at(770, 600)]`.
  - Vùng phòng khách (sàn gỗ) local `{ left: 150, top: 230, right: 1250, bottom: 660 }`; ngoài vùng này là gạch.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` + `shared/src/world.ts`: viết lại phần "Kitchen layout" của `restaurant.ts` theo "Layout mới" ở Ngữ cảnh: bỏ `COOK_CRATE_X/COOK_MACHINE_X/COUNTER_X/SHARED_CRATE_X/DRINK_CRATE_X/DRINK_MACHINE_X`, `COOK_MACHINES_INNER`, `COOK_SHELVES`, thay bằng các hằng/ mảng mô tả hàng thùng, hai cột máy, hàng dưới; cập nhật comment "Kitchen layout" cho đúng; đặt `RESTAURANT_STATIONS` (giữ nguyên id: `r_crate_<food>`, `r_<process>_<n>`, `r_shelf_<container>`, `r_counter_1..6`, `r_delivery`, `r_trash`) và `RESTAURANT_SPAWN_POINTS`. Trong `world.ts` đổi `RESTAURANT_EXIT_ZONE` và `RESTAURANT_ENTRY_SPAWN` sang giữa cạnh dưới (xem Ngữ cảnh). Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/scenes/RestaurantView.ts`: bỏ `DINING_X`; thêm hằng `DINING_RECT = { left: 150, top: 230, right: 1250, bottom: 660 }` (local). Sàn: `tileSprite` gạch phủ cả phòng, rồi `tileSprite` gỗ (`floorTexture`) chỉ trong `DINING_RECT`. `drawWall`: splashback trắng phủ toàn bộ bề ngang (`R.x` tới `R.x + R.width`), bảng hiệu "🍽️ Nhà hàng" đặt giữa (`signX = R.x + R.width / 2`), xoá thanh pass rail và các phiếu order. `drawExit` giữ nguyên (đã đọc `RESTAURANT_EXIT_ZONE`). `drawZoneLabels`: thay 3 nhãn cũ bằng 2 nhãn trên sàn gạch, không đè lên station: "🥬 Nguyên liệu" ở local (700, 215) và "🤝 Bàn giao" ở local (470, 668). Cập nhật comment đầu file/hàm cho đúng. Chạy `npm run typecheck`.
- [x] 3. [khó] `tests/restaurant-layout.spec.ts`: bố cục cũ bị đổi nên sửa spec cho khớp. Xoá các test chỉ khẳng định cấu trúc cũ: "T2: zone order…", "T3: the handover column…", "T13: crates sit with their zone…", "T8: every x-adjacent station pair…", "T10: adjacent crates in the same column…", "T1: restaurant machines, shelves and counters in one column…", "T9: a player can walk into the vertical gaps between crates…" (và các hằng/hàm chỉ chúng dùng). Giữ và sửa toạ độ/đường đi cứng cho khớp layout mới các test còn lại ("T4" spawn hợp lệ, "T5" 2 người vào ca, "T7" mọi station tới được, "T11" facing, "T12" server chọn crate theo hướng, "T1: empty counters show no Bàn label", "T2: tea shop…" của tea shop): chỗ nào đang hard-code toạ độ cũ thì lấy vị trí từ `RESTAURANT_STATIONS`/`RESTAURANT_SPAWN_POINTS`. Viết T1–T3 mới ở mục Test cases (đặt tên có tiền tố "edge-layout" để không trùng test cũ, ví dụ `test("edge-layout T1: …")`). Test cũ "T6" (2 người cộng tác) sửa thành "edge-layout T3" theo layout mới (đi theo trung tâm). Chạy `npx playwright test tests/restaurant-layout.spec.ts`, rồi toàn bộ `npx playwright test` và `npm run typecheck`.

## Test cases
- [x] T1. edge-layout T1 hình dạng bố cục — mọi thùng cùng `y = 170`; máy chỉ ở x=60 hoặc x=1340; kệ/bàn/quầy giao/thùng rác đều `y ≥ 685` và không station nào trong khoảng cửa x 640..760 hay trong `DINING_RECT` (150..1250 × 230..660); không hai station nào chồng nhau, tất cả nằm trong phòng — tests/restaurant-layout.spec.ts
- [x] T2. edge-layout T2 đường đi — từ mỗi `RESTAURANT_SPAWN_POINTS` và `RESTAURANT_ENTRY_SPAWN` đi bộ được tới điểm đứng cách mọi station ≤ `INTERACT_RANGE` (tái dùng lưới đi bộ của "T7" cũ), và hai điểm spawn + exit không đè lên station — tests/restaurant-layout.spec.ts
- [x] T3. edge-layout T3 hai người cộng tác — người 1 lấy khoai (thùng trên) → thái ở `r_chop_1` → đặt lên `r_counter_1`; người 2 lấy từ counter → luộc ở `r_boil_1` (hoặc nấu theo công thức đang có trong T6 cũ) → đặt vào đĩa; dùng đường đi qua trung tâm — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `restaurant.ts` đã chuyển sang layout rìa — 21 thùng thành 1 hàng ngang y=170 (cook x=40+62·i, milk/strawberry x=986/1048, drink x=1126..1312); máy chia 2 cột: trái x=60 (chop1, fry1, fry2, grill1, boil1, boil2), phải x=1340 (bake1, deepfry1, chop2, blend1, brew1), y=270+70·i; hàng dưới y≈715: trash x=120, kệ đĩa x=200, kệ tô x=300, counters x=400/470/540/860/930/1000, `r_delivery` x=1120 y=705, kệ ly x=1250 (id station giữ nguyên). `world.ts`: `RESTAURANT_EXIT_ZONE` local x 660..740 (giữa cạnh dưới), `RESTAURANT_ENTRY_SPAWN` local (700, 690). `RESTAURANT_SPAWN_POINTS` = (630,600), (770,600). Đã bỏ các hằng cột vùng cũ (`COOK_CRATE_X`…, `COOK_MACHINES_INNER`, `COOK_SHELVES`) và các pitch dọc cũ.
- Bước 2 xong: `RestaurantView.ts` bỏ `DINING_X`, thêm `DINING_RECT = { left: 150, top: 230, right: 1250, bottom: 660 }` (local); sàn gạch phủ cả phòng, `tileSprite` gỗ chỉ trong `DINING_RECT`; `drawWall`: splashback trắng phủ toàn bề ngang, bảng hiệu "🍽️ Nhà hàng" đặt giữa (`signX = R.x + R.width / 2`), đã xoá thanh pass rail + phiếu order; `drawExit` giữ nguyên (chỉ sửa comment cho đúng vị trí cửa mới); `drawZoneLabels`: 2 nhãn "🥬 Nguyên liệu" (700, 215) và "🤝 Bàn giao" (470, 668); comment đầu file/hàm đã cập nhật.
- Bước 3 xong: `tests/restaurant-layout.spec.ts` đã viết lại theo layout mới — xoá 7 test cấu trúc cũ ("T2 zone order", "T3 handover column", "T13", "T8", "T10", "T1 one column", "T9") cùng các hằng/hàm chỉ chúng dùng (`KITCHEN_MAX_X`, `BRIDGE_RANGE`, `DRINK_/SHARED_IDS`, `cookSide`, `byIdPrefix`, `cookers`…); giữ+sửa T4 (bound phòng 1400), T7 (bound phải mới), T11 (khe boil1/boil2 cột trái, khe shrimp/egg hàng thùng — vị trí lấy từ `RESTAURANT_STATIONS`), T12 (điểm đứng giữa shrimp/egg dưới hàng thùng, đường qua trung tâm); T5, "T2: tea shop", "T1: empty counters" giữ nguyên; "T6" cũ trở thành "edge-layout T3" (khoai → chop_1 → counter_1 → boil_1 → đĩa, đi qua trung tâm); viết mới edge-layout T1 (hình dạng) và edge-layout T2 (đường đi BFS từ 2 spawn + entry spawn, dùng `distanceToStation`/`INTERACT_RANGE`). Cả 3 lệnh của bước đã chạy: `npx playwright test tests/restaurant-layout.spec.ts` (10/10 PASS), `npx playwright test` (15/15 PASS), `npm run typecheck` PASS.

## Test status
- Lần chạy cuối: `npx playwright test` (toàn bộ, lệnh cuối của bước 3) — 15/15 PASS; `npm run typecheck` — PASS.
- Kết quả từng test:
  - T1 (edge-layout T1 hình dạng bố cục): PASS
  - T2 (edge-layout T2 đường đi): PASS
  - T3 (edge-layout T3 hai người cộng tác): PASS
  - Các test giữ lại (T4, T5, T7, T11, T12, T1 empty counters, T2 tea shop) và 5 test của các spec khác: PASS
- Fail chi tiết: lần chạy đầu của `tests/restaurant-layout.spec.ts` fail đúng 1 test — edge-layout T1 báo `r_crate_rice blocks the door gap` vì dải cửa tôi định nghĩa kéo dài cả chiều cao phòng, trong khi thùng rice (x=660, theo layout chỉ định) nằm trên hàng thùng y=170. Đã sửa `DOOR_GAP_RECT` về dải hàng dưới (top 685, đáy phòng — đúng nghĩa "khoảng trống cho cửa" ở hàng dưới trong Ngữ cảnh); lần chạy thứ 2 trở đi PASS hết.

## Verify
- Chạy cả suite: 15/15 PASS (T1, T2, T3 PASS), `npm run typecheck` PASS.
- Ảnh trong game (ca nhà hàng, 1 người): `.agents/shots/edge-layout.png` — PASS: hàng thùng sát tường trên, sàn gỗ trống ở giữa, kệ + bàn giao ở hàng dưới, cửa "Ra sân" giữa cạnh dưới, nhãn "Nguyên liệu" / "Bàn giao" không đè station. Camera chỉ hiện một phần phòng nên cột máy trái/phải không vào khung; được kiểm bằng T1.
- Console: chỉ lỗi favicon 404 (không liên quan).
- Non-blocking: cột phải trộn bake/deepfry với máy pha chế (đã ghi trong Quyết định đã chốt).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
