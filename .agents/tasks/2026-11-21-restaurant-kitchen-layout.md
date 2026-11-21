# Task: Sắp xếp lại bếp nhà hàng thành 3 vùng (sơ chế → bàn giao → nấu)

## Mục tiêu
Bếp nhà hàng hiện trải một hàng 14 trạm ở tường sau, thùng nguyên liệu nằm rời, 6 bàn để đồ nằm lẻ ở y=500 nên 2 người khó chia việc. Xếp lại thành 3 vùng theo dòng một chiều: **Sơ chế (trái) → Bàn giao (giữa) → Nấu + giao (phải)**, để một người lấy/thái nguyên liệu rồi đặt lên bàn giao, người kia lấy nấu, bày đĩa và giao. Chỉ nhà hàng, không đụng tiệm trà.

## Quyết định đã chốt
- Chỉ đổi toạ độ/bố cục + nhãn vùng; không đổi luật game (`planKitchen`, `planInteraction`), không đổi id trạm (`r_crate_*`, `r_<process>_<n>`, `r_shelf_*`, `r_counter_*`, `r_delivery`, `r_trash`), không đổi số lượng trạm.
- Bếp nằm trong local x < 990 (`DINING_X` trong `RestaurantView.ts`), sàn từ local y ≥ `WALL_BOTTOM` (120). Phòng ăn bên phải (x ≥ 990) và cửa ra giữ nguyên.
- Toạ độ local là tâm trạm (như hàm `at(x, y)` hiện có). Giữ khe hở ≥ 6px giữa các trạm; `INTERACT_RANGE` = 70 nên đừng xếp sát hơn vì sẽ khó chọn đúng trạm.
- Bố cục mục tiêu (local, tâm trạm; Claude đề xuất, OpenCode được chỉnh ±vài chục px nếu va chạm, miễn giữ đúng thứ tự vùng và các test T1–T4):
  - **Sơ chế (x ≤ 342):** `LEFT_CRATES` (7 thùng thịt/sữa) ở x=40, y=170+i*60. `ISLAND_CRATES` (14) thành 2 cột × 7 hàng: cột 1 x=110, cột 2 x=170, y=170+i*60 (7 đầu vào cột 1, 7 sau vào cột 2). 2 thớt `r_chop_1/2` ở x=300, y=230 và y=330. Thùng rác giữ (40, 712).
  - **Bàn giao (x=440):** 6 bàn `r_counter_1..6` xếp dọc một cột, x=440, y=200+i*66.
  - **Nấu + giao (x ≥ 570):** hàng sau y=145 (BACK_Y), pitch 90 từ x=570: fry1, fry2, boil1, boil2, grill1 (570..930). Hàng 2 y=290: bake1, deepfry1, blend1, brew1 (x=570,660,750,840). Hàng 3 y=500: kệ plate, bowl, glass (x=570,660,750). `r_delivery` giữ (820, 640). Spawn ca nhà hàng: (470, 630) và (560, 630) (đổi nếu đè trạm).
- Nhãn vùng "Sơ chế" / "Bàn giao" / "Nấu" vẽ trên sàn bằng text Phaser (tiếng Việt), không đè lên trạm, không chặn tương tác.
- Test bố cục viết dạng spec Node import thẳng từ `@boba/shared` (không cần trình duyệt) vì đó là dữ liệu tĩnh.
- Rủi ro đã biết: đồ trang trí host từng đặt trong bếp có thể đè trạm mới; chấp nhận, không migrate.

## Plan
- [x] 1. [vừa] `shared/src/restaurant.ts` → các helper `shelf`, `cooker`, `crate` và hằng `BACK_ROW`/`LEFT_CRATES`/`ISLAND_CRATES`: bỏ `BACK_ROW` một hàng; đặt toạ độ theo bố cục mục tiêu. Cho `shelf`/`cooker` nhận `(x, y)` thay vì chỉ `x`; tách danh sách cooker theo 2 hàng + kệ ở hàng 3; thớt đưa sang vùng sơ chế (x=300).
- [x] 2. [vừa] `shared/src/restaurant.ts` → `RESTAURANT_STATIONS`: sinh 6 counter thành cột dọc (x=440, y=200+i*66); sinh crate theo 3 nhóm (cột trái, 2 cột đảo); giữ `r_delivery` và `r_trash`. Cập nhật comment "Kitchen layout" ở đầu mục theo 3 vùng.
- [x] 3. [dễ] `shared/src/restaurant.ts` → `RESTAURANT_SPAWN_POINTS`: đổi thành (470, 630) và (560, 630), kiểm tra không đè trạm nào.
- [x] 4. [vừa] `client/src/scenes/RestaurantView.ts` → thêm `drawZoneLabels()` gọi từ chỗ dựng nhà hàng: 3 text sàn "🔪 Sơ chế", "🤝 Bàn giao", "🍳 Nấu" (depth thấp, trên sàn, không trùng toạ độ trạm; vị trí gợi ý y≈600–620 cho 3 nhãn, x≈190/440/700, chỉnh nếu đè kệ/giao). Đọc phần vẽ tường (`drawWall`) kiểm tra "pass rail" và giấy dán tường không phụ thuộc vị trí cooker cũ; nếu có thì chỉnh cho khớp.
- [x] 5. [dễ] Kiểm tra `client/src/scenes/` (grep `r_chop`, `r_counter`, `RESTAURANT_STATIONS`, `BACK_Y`) xem còn chỗ nào hard-code toạ độ trạm cũ; nếu có thì ghi lý do vào task file rồi sửa.
- [x] 6. [vừa] `tests/restaurant-layout.spec.ts` (mới): viết T1–T4 theo "Test cases", import `RESTAURANT_STATIONS`, `RESTAURANT_SPAWN_POINTS`, `RESTAURANT` từ `@boba/shared`; đổi sang local bằng `x - RESTAURANT.x`. Tick T1–T4 khi spec đã có.
- [x] 7. [dễ] Chạy `npm run typecheck` + `npx playwright test`, ghi kết quả từng test (T1–T4 và T1–T3 của orders-panel còn pass) vào "Test status".
- [x] 8. [vừa] `shared/src/restaurant.ts` → `RESTAURANT_STATIONS` (crate + `CHOP_BOARDS`): giãn 3 cột thùng để mỗi lối đi giữa 2 cột (hoặc giữa cột và thớt/bàn giao) rộng ≥ 44px (người chơi rộng 36px). Gợi ý: cột thùng x=40, 140, 240 (giữ y=170+i*60, 7 thùng/cột; `ISLAND_CRATES` chia 7/7 vào x=140 và x=240); thớt `r_chop_1/2` dời sang x≈330; nếu lối đi giữa thớt (cạnh phải) và bàn giao x=440 (cạnh trái 411) < 44px thì dịch cột bàn giao sang phải (x≈460) và nhớ giữ khe với cook zone (x ≥ 570, cạnh trái 528). Cập nhật comment "Kitchen layout" cho đúng toạ độ mới. Không đổi id/số lượng trạm.
- [x] 9. [vừa] `tests/restaurant-layout.spec.ts` → T6 (`walkRestaurantPath` waypoints) và hằng liên quan: chỉnh toạ độ đường đi cho khớp bố cục mới (thùng khoai tây, thớt `r_chop_1`, bàn giao `r_counter_1`); T1–T5 và T7 không đổi (T7 là điều kiện nghiệm thu: không còn trạm nào unreachable). Thêm vào T1 hoặc test mới T8: lối đi giữa mọi cặp trạm kề nhau theo trục x trong vùng sơ chế ≥ 44px — chỉ cần nếu T7 chưa đủ bắt lỗi.
- [x] 10. [dễ] Chạy `npm run typecheck` + `npx playwright test`, ghi kết quả từng test (T1–T7, orders-panel T1–T3) vào "Test status"; T7 phải PASS.

## Test cases
- [x] T1. Mọi trạm nằm trong bếp, không chồng nhau — mỗi trạm nhà hàng có local x ∈ [0, 990) và local y ≥ 120; hình chữ nhật (tâm ± width/2, height/2) của hai trạm bất kỳ không giao nhau — tests/restaurant-layout.spec.ts
- [x] T2. Thứ tự vùng đúng — max x của `r_crate_*` và `r_chop_*` < x của mọi `r_counter_*` < min x của mọi cooker khác thớt (`r_fry/boil/grill/bake/deepfry/blend/brew_*`) và kệ `r_shelf_*` — tests/restaurant-layout.spec.ts
- [x] T3. Bàn giao với tới được cả hai phía — có đúng 6 `r_counter_*`, cùng một x; ít nhất 3 bàn có tâm cách một thớt ≤ 160px và cách một cooker ≤ 160px — tests/restaurant-layout.spec.ts
- [x] T4. Spawn hợp lệ — mỗi điểm trong `RESTAURANT_SPAWN_POINTS` nằm trong bếp (local x < 990, y ≥ 120) và không nằm trong hình chữ nhật (+margin 20px) của trạm nào — tests/restaurant-layout.spec.ts
- [x] T5. Bắt đầu ca nhà hàng 2 người chơi & giữ nguyên tiệm trà — mở 2 phiên vào cùng phòng, bật ca nhà hàng qua `window.__GAME__`; P1 và P2 spawn đúng tại `RESTAURANT_SPAWN_POINTS` (local 470,630 và 560,630), 43 trạm nhà hàng và 14 trạm tiệm trà (`STATIONS`) đồng bộ đúng toạ độ — tests/restaurant-layout.spec.ts
- [x] T6. Phối hợp 2 người chơi theo dòng 1 chiều (Sơ chế → Bàn giao → Nấu + bày đĩa) — P1 lấy khoai tây ở vùng Sơ chế, thái tại `r_chop_1`, đặt `food:potato.chop` lên bàn giao `r_counter_1`; P2 lấy từ `r_counter_1`, đem sang vùng Nấu chiên tại `r_deepfry_1`, lấy đĩa ở `r_shelf_plate` và bày thành `plate:potato.chop.deepfry` — tests/restaurant-layout.spec.ts
- [x] T7. Mọi trạm bếp đều đi bộ tiếp cận được từ điểm spawn để tương tác — BFS trên lưới điểm đứng hợp lệ (`resolveCollisions`, `PLAYER_RADIUS = 18`) từ `RESTAURANT_SPAWN_POINTS` trong bếp, kiểm tra mọi trạm trong `RESTAURANT_STATIONS` đều được `findNearestStationDef` (`INTERACT_RANGE = 70`) chọn tại ít nhất một vị trí đi bộ tới được — tests/restaurant-layout.spec.ts
- [x] T8. Lối đi vùng sơ chế đủ rộng — mọi cặp trạm nhà hàng trong vùng sơ chế (`r_crate_*`, `r_chop_*`) có hình chữ nhật chồng nhau theo trục y phải có khe ngang ≥ 44px (người chơi rộng 36px) — tests/restaurant-layout.spec.ts
- [x] T9. Đi bộ thực tế vào hai lối đi 44px giữa 3 cột thùng để lấy thùng hàng giữa — người chơi đi bộ trong trình duyệt qua lối đi 1 (`local x = 76`, giữa cột 1 `x=31` và cột 2 `x=129`) lấy được `food:shrimp` từ `r_crate_shrimp` (`y=350`), và qua lối đi 2 (`local x = 174`, giữa cột 2 `x=129` và cột 3 `x=227`) lấy được `food:tomato` từ `r_crate_tomato` (`y=230`) — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
Đã xong bước 1 + 2 + 3 trong `shared/src/restaurant.ts`: các hàng nấu/thớt như bước 1; bước 2 đã sinh counter thành cột dọc (x=440, y=200+i*66), crate theo 3 nhóm (trái x=40, đảo cột 1 x=110, cột 2 x=170, y=170+i*60), giữ `r_delivery` (820,640) và `r_trash` (40,712), cập nhật comment "Kitchen layout" theo 3 vùng (Sơ chế / Bàn giao / Nấu + giao); bước 3 đã đổi spawn ca nhà hàng thành (470, 630) và (560, 630) — đã kiểm tra bằng script: không điểm nào nằm trong hình chữ nhật trạm nào kể cả margin 20px. Mọi trạm không đè nhau (khe hở ≥ 6px), đúng thứ tự vùng T2 (crate/thớt max x=300 < counter x=440 < cooker/kệ x=570). Đã xong bước 4 trong `client/src/scenes/RestaurantView.ts`: thêm `drawZoneLabels()` gọi từ constructor, 3 text sàn "🔪 Sơ chế" (190,610), "🤝 Bàn giao" (440,610), "🍳 Nấu" (690,610 — dời từ 700 sang 690 để giữ khe với quầy giao bắt đầu x=745 khi font phóng 1.3x trên touch), depth FLOOR_DEPTH+10 (-990, trên gạch sàn -1000, dưới tường -900 và mọi trạm); kiểm tra `drawWall`: giấy dán tường (gạch trắng trải cả bếp local x 0..960) không phụ thuộc vị trí cooker nên giữ nguyên, còn "pass rail" + ticket cũ ở local x 60..360 nằm đúng đoạn hàng 14 trạm sau cũ (hàng cũ bắt đầu x=62) nên đã dời sang x 600..900 (ticket 612..878) ngay trên hàng cooker mới (570..930, tâm 750). Đã xong bước 5: grep toàn `client/src` cho `r_chop`, `r_counter`, `RESTAURANT_STATIONS`, `BACK_Y`, `BACK_ROW`, `LEFT_CRATES`, `ISLAND_CRATES` và mọi id trạm (`r_fry/boil/grill/bake/deepfry/blend/brew/shelf/crate`) — không có kết quả, tức client không hard-code toạ độ/id trạm cũ; `RestaurantView` chỉ dùng `RESTAURANT` làm gốc và đọc trạm từ schema, nên không phải sửa code. Đã xong bước 6: viết `tests/restaurant-layout.spec.ts` — spec Node (không dùng browser), import `RESTAURANT_STATIONS`, `RESTAURANT_SPAWN_POINTS`, `RESTAURANT`, `WALL_BOTTOM`, `StationDef` từ `@boba/shared` (Playwright transpile được `.ts` của workspace package, import qua `@boba/shared` chạy bình thường), đổi toạ độ sang local bằng `x - RESTAURANT.x`; 4 test T1–T4 pass ngay lần chạy đầu. Đã xong bước 7 (bước cuối): chạy lại `npm run typecheck` (server + client PASS) và `npx playwright test` (7/7 PASS: restaurant-layout T1–T4 + orders-panel T1–T3), không cần sửa gì thêm; đã tick checkbox bước 7 và ghi kết quả vào "Test status". Task hoàn tất, chờ Verify.

Đã xong bước 8 trong `shared/src/restaurant.ts`: ba cột thùng dời thành x=31/129/227 (`ISLAND_CRATES` vẫn chia 7/7 ở hai cột sau, giữ y=170+i*60), thớt dời sang x=340 và 6 bàn giao dời sang x=455. Các toạ độ này điều chỉnh từ gợi ý để mọi khe theo trục x đều đúng 44px: thùng cột 1 ↔ cột 2, cột 2 ↔ cột 3, cột 3 ↔ thớt, thớt ↔ bàn giao và bàn giao ↔ mép trái cook zone; nếu theo nguyên gợi ý x=40/140/240 thì khe cột 3 ↔ thớt chỉ còn 21px. Giữ nguyên id, số lượng trạm, toạ độ y, spawn và cook zone; đã cập nhật comment "Kitchen layout". T7 PASS sau thay đổi. Không sửa waypoint T6 vì nội dung đó thuộc bước 9.

Đã xong bước 9 trong `tests/restaurant-layout.spec.ts`: chỉnh waypoint T6 theo bố cục sau bước 8, không đổi T1–T5 và T7. P1 đi lối giữa thớt và bàn giao (x=404) lên hành lang trên y=128 tới thùng khoai tây (129,128), đứng bên phải thớt `r_chop_1` tại (400,230) thái, rồi đặt lên `r_counter_1` từ (408,200); P2 đi lối giữa bàn giao và vùng nấu (x=506) lấy `food:potato.chop` từ `r_counter_1` tại (506,200), các chặng nấu/lấy đĩa giữ hình cũ (660,240) và (570,450) nhưng di chuyển qua x=506. Đã thêm test T8 (spec Node) vì T7 chỉ bắt trạm unreachable, không bắt khe hẹp mà trạm vẫn tới được từ lối khác (bố cục gợi ý ban đầu có khe cột 3↔thớt 21px vẫn có thể pass T7): T8 kiểm mọi cặp trạm vùng sơ chế có rect chồng nhau theo trục y phải có khe ngang ≥ 44px; bố cục hiện tại các khe kề nhau đều đúng 44px nên T8 PASS. Đã tick T7 trong "Test cases" vì spec đã có và PASS.

Đã xong bước 10 (bước cuối): chạy `npm run typecheck` PASS và `npx playwright test` (toàn bộ suite) 11/11 PASS trong 33.3s — orders-panel T1–T3 PASS, restaurant-layout T1–T8 PASS, T7 (điều kiện nghiệm thu) PASS. Đã ghi kết quả từng test vào "Test status". Task hoàn tất 10/10 bước; bước Verify cuối (nếu có) sẽ chạy lại trên trình duyệt thật.

## Test status
- Lần chạy cuối: Verify lần 2 (2026-11-21) — `npm run typecheck` PASS; `npx playwright test` (toàn bộ suite): 12/12 PASS (39.0s), gồm orders-panel 3/3 và restaurant-layout 9/9.
- Kết quả từng test:
  - T1: PASS — tests/restaurant-layout.spec.ts (mọi trạm trong bếp, không cặp rect nào giao nhau).
  - T2: PASS — tests/restaurant-layout.spec.ts (max x crate/thớt = 340 < counter x = 455 < min x cooker/kệ = 570).
  - T3: PASS — tests/restaurant-layout.spec.ts (đúng 6 bàn giao cùng x=455; ít nhất 3 bàn cách một thớt và một cooker ≤ 160px).
  - T4: PASS — tests/restaurant-layout.spec.ts (spawn (470,630)/(560,630) trong bếp, ngoài mọi rect trạm kể cả margin 20px).
  - T5: PASS — tests/restaurant-layout.spec.ts (2 người chơi spawn đúng `RESTAURANT_SPAWN_POINTS`; 43 trạm nhà hàng + 14 trạm tiệm trà đồng bộ đúng toạ độ).
  - T6: PASS — tests/restaurant-layout.spec.ts (P1: khoai tây (129,170) → thái `r_chop_1` từ (400,230) → đặt `r_counter_1` từ (408,200); P2: lấy tại (506,200) → chiên `r_deepfry_1` → lấy đĩa `r_shelf_plate` (570,450) → bày `plate:potato.chop.deepfry`).
  - T7: PASS — tests/restaurant-layout.spec.ts (BFS từ hai spawn chọn được mọi trạm bếp trong `INTERACT_RANGE`; không còn trạm unreachable).
  - T8: PASS — tests/restaurant-layout.spec.ts (mọi cặp trạm vùng sơ chế chồng nhau theo trục y có khe ngang ≥ 44px; các khe kề nhau đều đúng 44px).
  - T9: PASS — tests/restaurant-layout.spec.ts (người chơi đi bộ trong trình duyệt qua cả hai lối đi 44px `x=76` và `x=174` lấy được thùng hàng giữa cột 1 `food:shrimp` và cột 2 `food:tomato`).
  - orders-panel T1–T3: PASS — tests/orders-panel.spec.ts (3/3: container line là bước cuối mọi công thức; câu chữ "<icon> Bày ra <container>" và câu cũ đã mất; đường kẻ nét đứt phía trên).

## Verify
### Lần 1 (FAIL, đã chuyển thành steps 8–10; Verify lần 2 ghi tiếp bên dưới, kết luận cuối là dòng `VERIFY:` cuối mục)
Đã mở 2 phiên trình duyệt riêng (`playwright-cli -s=p1` và `playwright-cli -s=p2`) tại `http://localhost:5173/?test=1`, cùng vào một phòng và bật ca nhà hàng qua `window.__GAME__.send("start_shift", { venue: "restaurant" })`:

1. **Bố cục 3 vùng bếp nhà hàng, vị trí spawn 2 người chơi & không ảnh hưởng tiệm trà (T1–T5): PASS**
   - P1 và P2 xuất hiện đúng tại `RESTAURANT_SPAWN_POINTS` (local `(470, 630)` và `(560, 630)`), không đè lên trạm nào.
   - Bếp chia rõ 3 vùng từ trái sang phải trong `local x < 990, y ≥ 120`: Sơ chế (thùng nguyên liệu + 2 thớt ở `x ≤ 300`, thùng rác ở `(40, 712)`), Bàn giao (6 bàn `r_counter_1..6` xếp thành 1 cột dọc tại `x = 440, y = 200..530`), Nấu + giao (hàng cooker sau `y = 145`, hàng cooker giữa `y = 290`, hàng kệ đĩa/tô/ly `y = 500` từ `x = 570`, quầy `Mang đi` tại `(820, 640)`).
   - 14 trạm tiệm trà (`STATIONS`) giữ nguyên trong `[0, 960] × [0, 600]`, không bị ảnh hưởng.
   - Screenshot: `test-results/verify-01-spawn-p1.png`, `test-results/verify-01-spawn-p2.png`.

2. **Hiển thị 3 nhãn vùng trên sàn & thanh pass rail trên tường sau: PASS**
   - 3 nhãn sàn tiếng Việt `"🔪 Sơ chế"` (local `190, 610`), `"🤝 Bàn giao"` (local `440, 610`), `"🍳 Nấu"` (local `690, 610`) hiển thị rõ trên nền gạch bếp, nằm dưới nhân vật và không đè lên bất kỳ trạm nào (nhãn `"🍳 Nấu"` cách gọn bên trái quầy `Mang đi`).
   - Thanh kẹp order ("pass rail" + 6 tờ ticket) trên tường sau đã nằm tại `local x = 600..900`, ngay phía trên hàng 5 cooker mới (`Chảo`, `Chảo`, `Nồi`, `Nồi`, `Vỉ nướng` tại `x = 570..930`).
   - Screenshot: `test-results/verify-01-spawn-p1.png`, `test-results/verify-02-backwall-cookers-p2.png`.

3. **Luồng phối hợp 2 người chơi theo dòng 1 chiều (Sơ chế → Bàn giao → Nấu + bày đĩa + giao đơn — T6): PASS (với nguyên liệu ở rìa ngoài khối thùng)**
   - P1 (Sơ chế) đi tới thùng `Khoai tây` (`r_crate_potato` ở đầu cột đảo 1 `110, 170`), lấy `food:potato`, đi tới thớt `r_chop_1` (`300, 230`) thái 2s thành `food:potato.chop`, rồi đặt lên bàn giao `r_counter_1` (`440, 200`).
   - P2 (Nấu + giao) đứng bên phải bàn giao `r_counter_1` nhặt `food:potato.chop`, đưa sang chảo dầu `r_deepfry_1` (`660, 290`) chiên 4s, đi xuống `Kệ đĩa` (`r_shelf_plate` ở `570, 500`) lấy `plate`, quay lại `r_deepfry_1` xúc khoai tây chiên vào đĩa thành `plate:potato.chop.deepfry` (`Khoai tây chiên`), rồi mang tới quầy `Mang đi` (`r_delivery` ở `820, 640`) giao đơn thành công (`servedCount = 1`).
   - Screenshot: `test-results/verify-03-handover-placed-p1.png`, `test-results/verify-04-cook-plate-delivery-p2.png`, `test-results/verify-05-delivered-p2.png`.

4. **Khả năng đi bộ tiếp cận mọi thùng nguyên liệu ở vùng Sơ chế (T7): FAIL**
   - **Lỗi phát hiện:** Trong vùng Sơ chế, 3 cột thùng nguyên liệu (`width = 54, height = 48`) được đặt tại `x = 40` (cạnh phải `67`), `x = 110` (cạnh trái `83`, cạnh phải `137`) và `x = 170` (cạnh trái `143`, cạnh phải `197`), với `y = 170 + i * 60` (`i = 0..6`).
   - Khe hở ngang giữa cột trái (`x = 40`) và cột đảo 1 (`x = 110`) chỉ rộng `83 - 67 = 16px`; khe hở giữa cột đảo 1 (`x = 110`) và cột đảo 2 (`x = 170`) chỉ rộng `143 - 137 = 6px`; khe hở dọc giữa các hàng chỉ rộng `60 - 48 = 12px`. Trong khi đó hình tròn va chạm của người chơi có đường kính `2 * PLAYER_RADIUS = 36px` (`PLAYER_RADIUS = 18` trong `shared/src/index.ts`).
   - Hệ quả: Người chơi **không thể đi lọt vào lối đi giữa các cột thùng** (khi đi từ phía trên xuống tại `local x = 75, y = 128` bằng phím `ArrowDown`, nhân vật bị kẹt cứng tại `y = 129` giữa thùng `Bò` và thùng `Khoai tây`). Khi đứng ở hành lang bên phải cột đảo 2 (`local x ≥ 215`), khoảng cách tới các thùng cột đảo 1 là `≥ 78px` và tới cột trái là `≥ 148px` (đều vượt quá `INTERACT_RANGE = 70px` và bị cột đảo 2 chắn).
   - Vì vậy, **10/21 thùng nguyên liệu** nằm ở 5 hàng giữa (`y = 230..470`) của cột trái và cột đảo 1 hoàn toàn không thể tiếp cận để lấy nguyên liệu khi chơi:
     - Cột trái (`x = 40`): `r_crate_chicken` (Gà), `r_crate_salmon` (Cá hồi), `r_crate_shrimp` (Tôm), `r_crate_egg` (Trứng), `r_crate_milk` (Sữa).
     - Cột đảo 1 (`x = 110`): `r_crate_tomato` (Cà chua), `r_crate_lettuce` (Rau xà lách), `r_crate_mushroom` (Nấm), `r_crate_pumpkin` (Bí đỏ), `r_crate_rice` (Gạo).
   - Các đơn hàng trong ca như `Cơm trứng omurice` (cần Gạo + Trứng), `Súp bí đỏ` (cần Bí đỏ + Sữa), `Cà phê latte` (cần Sữa), `Tôm tempura`, `Sushi cá hồi`... đều bị kẹt không thể làm được.
   - Screenshot: `test-results/verify-06-blocked-crates-p1.png`, `test-results/verify-07-aisle-blocked-top-p1.png`.

(Kết luận lần 1: FAIL do T7)

### Lần 2 (sau khi hoàn tất steps 8–10)
Đã chạy `npx playwright test` (PASS toàn bộ) rồi mở 2 phiên trình duyệt riêng (`playwright-cli -s=p1` và `playwright-cli -s=p2`) tại `http://localhost:5173/?test=1`, cùng vào một phòng và bật ca nhà hàng qua `window.__GAME__.send("start_shift", { venue: "restaurant" })`:

1. **Bố cục 3 vùng bếp nhà hàng, vị trí spawn 2 người chơi & giữ nguyên tiệm trà (T1–T5): PASS**
   - Tiệm trà giữ nguyên 14 trạm (`STATIONS`) tại `[0, 960] × [0, 600]`, không bị ảnh hưởng.
   - Khi bắt đầu ca nhà hàng, P1 và P2 spawn đúng tại `RESTAURANT_SPAWN_POINTS` (local `(470, 630)` và `(560, 630)`), không đè lên bất kỳ trạm nào (kể cả margin 20px).
   - 43 trạm bếp nhà hàng nằm gọn trong `local x ∈ [0, 990), y ≥ 120`, không có cặp trạm nào chồng nhau, đúng thứ tự 3 vùng từ trái sang phải: Sơ chế (3 cột thùng nguyên liệu tại `x = 31, 129, 227`, 2 thớt `r_chop_1/2` tại `x = 340, y = 230/330`, thùng rác `(40, 712)`) → Bàn giao (6 bàn `r_counter_1..6` thẳng cột tại `x = 455, y = 200..530`) → Nấu + giao (hàng cooker sau `y = 145`, hàng cooker giữa `y = 290`, hàng kệ đĩa/tô/ly `y = 500` từ `x = 570`, quầy `Mang đi` tại `(820, 640)`).
   - Screenshot: `test-results/verify2-00-teashop-p1.png`, `test-results/verify2-01-spawn-p1.png`, `test-results/verify2-01-spawn-p2.png`.

2. **Hiển thị 3 nhãn vùng trên sàn & thanh pass rail trên tường sau: PASS**
   - 3 nhãn sàn tiếng Việt `"🔪 Sơ chế"` (local `190, 610`), `"🤝 Bàn giao"` (local `440, 610`), `"🍳 Nấu"` (local `690, 610`) vẽ rõ trên sàn gạch (`FLOOR_DEPTH + 10`), không đè lên trạm, không chặn tương tác.
   - Thanh pass rail + 6 tờ order ticket trên tường sau nằm tại `local x = 600..900`, khớp ngay phía trên hàng 5 cooker sau (`Chảo`, `Chảo`, `Nồi`, `Nồi`, `Vỉ nướng` tại `x = 570..930`).
   - Screenshot: `test-results/verify2-01-spawn-p1.png`, `test-results/verify2-02-backwall-cookers-p2.png`.

3. **Lối đi 44px giữa 3 cột thùng nguyên liệu & khả năng đi bộ tiếp cận mọi thùng hàng giữa (T7, T8, T9): PASS**
   - Khe hở ngang giữa cột 1 (`x = 31`, cạnh phải `58`) ↔ cột 2 (`x = 129`, cạnh trái `102`, cạnh phải `156`) ↔ cột 3 (`x = 227`, cạnh trái `200`, cạnh phải `254`) ↔ thớt (`x = 340`, cạnh trái `298`, cạnh phải `382`) ↔ bàn giao (`x = 455`, cạnh trái `426`, cạnh phải `484`) ↔ vùng nấu (`x = 570`, cạnh trái `528`) đều rộng đúng `44px` (người chơi rộng `36px`).
   - P1 đi bộ thực tế vào lối đi 1 (`local x = 76..80`) lấy được `Nấm` (`food:mushroom`, cột 2 `y = 350`), `Tôm` (`food:shrimp`, cột 1 `y = 350`) và `Gà` (`food:chicken`, cột 1 `y = 230`); đi bộ qua lối đi 2 (`local x = 174..178`) lấy được `Cà chua` (`food:tomato`, cột 2 `y = 230`) và `Rau xà lách` (`food:lettuce`, cột 2 `y = 290`) — toàn bộ 10 thùng hàng giữa từng bị chặn ở Verify lần 1 đều đã đi bộ tiếp cận và tương tác bình thường.
   - Screenshot: `test-results/verify2-03-aisle1-walk-p1.png`, `test-results/verify2-04-aisle2-shrimp-p1.png`.

4. **Phối hợp 2 người chơi theo dòng 1 chiều (Sơ chế → Bàn giao → Nấu + bày đĩa + giao đơn — T6): PASS**
   - Luồng 1 (`Khoai tây chiên`): P1 lấy `food:potato` ở vùng Sơ chế `(129, 170)`, thái tại `r_chop_1` `(340, 230)` thành `food:potato.chop`, đặt lên bàn giao `r_counter_1` `(455, 200)`; P2 đứng bên phải bàn giao `(506, 200)` nhặt `food:potato.chop`, đem sang `r_deepfry_1` `(660, 290)` chiên 4s, lấy đĩa tại `r_shelf_plate` `(570, 500)` và xúc thành `plate:potato.chop.deepfry`.
   - Luồng 2 (giao đơn thực tế `Gà nướng lò`): P1 đi vào lối đi 1 (`x = 76, y = 230`) lấy `food:chicken` từ `r_crate_chicken` đặt lên bàn giao `r_counter_2` `(455, 266)`; P2 lấy từ `r_counter_2` đưa vào `r_bake_1` `(570, 290)` nướng 6s, xúc ra đĩa thành `plate:chicken.bake` rồi giao tại quầy `Mang đi` (`r_delivery` ở `820, 640`), `servedCount` tăng lên `1`.
   - Lỗi phát hiện: Không có.
   - Screenshot: `test-results/verify2-05-handover-placed-p1.png`, `test-results/verify2-06-cook-plate-p2.png`, `test-results/verify2-07-delivered-p2.png`.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
