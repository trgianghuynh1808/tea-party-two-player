# Task: T34 — thêm món nước (juice) cho tiệm trà + giảm độ khó

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Thêm nhóm món nước trái cây (nước cam, dưa hấu, chanh, ...) với máy/nguyên liệu RIÊNG; chỉ Sữa dùng chung và nằm GIỮA dãy máy: bên trái là máy trà sữa, bên phải là máy nước.
- Giảm độ khó: ca dài hơn, khách kiên nhẫn hơn.

## Ý tưởng
- Thêm 3 IngredientId mới (`orange`, `watermelon`, `lemon`) + 5 món nước trong `shared/src/menu.ts`; xếp lại dãy máy: trà (đen, xanh, trân châu, cheese, chanh dây) | Sữa | nước (cam, dưa hấu, chanh). Kệ ly chuyển ra chỗ khác.
- Client vẽ máy bằng code (`TeaArt`), icon bằng emoji, ly nước dùng ly rỗng nhuộm màu.
- Tăng `shiftSeconds` và `durationStart/End` của venue `shop`, tăng `VIP_DURATION_SECONDS`.

## Quyết định đã chốt
- Drink nước cam dùng id `juice_orange` (thay vì `orange_juice` như plan) vì `orange_juice` đã là dish id nhà hàng ("Nước cam ép", shared/src/restaurant.ts:168) và `getMenuItem`/`servedItemFor` tra DRINKS trước → trùng id sẽ làm khách nhà hàng nhận ly thay vì ly thủy tinh. Tên hiển thị vẫn là "Nước cam" $20.
- Kệ ly dời xuống sàn cạnh tường trái: (76, 290) — không đè máy (y 115..175), thùng rác (y 392..448), dãy counter (x 231..), cửa ra (x 440..520, đáy) và spawn vào shop (480, 530).

## Ngữ cảnh
Ảnh tham khảo (Dev mở khi cần): `.agents/attachments/T34/req-1.jpg` (bảng đồ uống: cà phê/trà nóng bên trái; bên phải là các ly/chai nước ép: cam, dưa hấu, chanh, dâu, nho, bơ...), `req-2.jpg` (bảng trái cây/thực phẩm: táo, chuối, nho, chanh, dâu, sữa hộp, ...), `req-3.jpg` (hũ gia vị/bột, không dùng cho task này). Không cần cắt ảnh; chỉ lấy ý tưởng món.

`shared/src/menu.ts`:
- `IngredientId` union + `INGREDIENTS: Record<IngredientId, {label, short, color}>` (thêm 3 id mới, màu cam 0xff9800, dưa hấu 0xf06292, chanh 0xcddc39).
- `DRINKS: DrinkDef[]` (`steps` có thứ tự). Thêm: `orange_juice` ["orange"] $20, `watermelon_juice` ["watermelon"] $20, `lemonade` ["lemon"] $18, `orange_lemon` ["orange","lemon"] $26, `watermelon_milk` ["watermelon","milk"] $28 (sữa dùng chung). Kiểm tra id không trùng (grep `DRINKS`, `id:` trong menu.ts, venues.ts, restaurant.ts).
- `STATIONS`: hàm `machine(id, x, label, processSeconds)`, `MACHINE_Y = WALL_BOTTOM + 25`, `MACHINE_W = 96`. Hiện cách nhau 130px (x=206..856) và `cup_shelf` ở x=76 cùng hàng. Dãy mới 9 máy cách 102px: x = 60 + i*102 (i=0..8): black_tea, green_tea, pearl, cheese_foam, passion, **milk (i=5, giữa)**, orange, watermelon, lemon. Máy nước `processSeconds` 1.5. Kệ ly phải dời khỏi hàng tường: chọn chỗ trống ở sàn (vd. cạnh tường trái, y≈290) KHÔNG chắn cửa sang nhà hàng/lối đi/spawn (kiểm tra `SPAWN`/door trong `shared/src/index.ts`, `world.ts`) và không đè dãy `counter_*` (x 260..660, y 300) hay thùng rác (52,420). `placement.ts` dùng `STATIONS` để chặn đặt nội thất, tự cập nhật.
- `RecipeGuide.drinkGuide` tự tra máy theo `ingredient`, không cần sửa logic.
- `isValidPartial` chặn trộn trà với nước vì không có công thức chung → tự đảm bảo "tách biệt".

`shared/src/venues.ts` `VENUES.shop`: hiện `shiftSeconds: 180, durationStart: 60, durationEnd: 35, spawnStart: 9, spawnEnd: 5, stars: [100,220,350]`. Đổi: shiftSeconds 240, durationStart 85, durationEnd 55, spawnStart 11, spawnEnd 7, stars [120,260,420]. `menu.ts` còn `ORDER_DURATION_*`, `SHIFT_SECONDS`, `STAR_THRESHOLDS` (hằng cũ, chỉ cập nhật cho khớp nếu còn dùng) và `VIP_DURATION_SECONDS = 25` → 35 (dùng ở `BobaShopRoom.ts` ~dòng 825).

Client:
- `client/src/scenes/TeaArt.ts`: `DRAW: Record<"cup_shelf" | IngredientId, ...>` bắt buộc đủ khóa → thêm `orange`, `watermelon`, `lemon` (vẽ bình/máy ép đơn giản bằng `INGREDIENTS[id].color`, theo mẫu `passion`). `W = 96` khớp `MACHINE_W`.
- `client/src/scenes/ShopScene.ts`: `STATION_TEXTURES` (không cần thêm: máy vẽ bằng code qua `teaStationTexture`), `STATION_ICONS` (dòng ~180, icon PNG): với 3 máy mới dùng emoji 🍊🍉🍋 làm icon (thêm nhánh hiển thị text emoji, ví dụ field `emoji` trong entry, đọc chỗ dùng `stationIconKey`).
- `client/src/scenes/CupView.ts` `cupLook(item)`: base chỉ có `empty|black_tea|green_tea|milk_tea`, topping `cheese_foam|passion`. Với ly có nguyên liệu nước (`orange|watermelon|lemon`) dùng base `empty` và nhuộm màu (`setTint`) bằng `cupColor(item)` (đã export từ `@boba/shared`), đừng dùng cheese/passion topping.
- `OrdersPanel` dùng `INGREDIENTS[id]` tự động, không cần sửa.

Sự thật để test: `window.__GAME__.stationLabels(): string[]` (nhãn mọi trạm; máy có giờ thêm hậu tố " ⏱…" nên so khớp bằng substring). Dùng `joinAsHost(page, user)` từ `tests/helpers.ts`; username duy nhất `p1-${Date.now()}`. Playwright không import được module TS của server nhưng import được `@boba/shared`/đường dẫn tương đối `../shared/src/...` như `tests/restaurant-layout.spec.ts` (xem cách nó import `STATIONS`). Spec hiện có `tests/tea-shop-art.spec.ts` có `EXPECTED_LABELS` (7 nhãn) cần cập nhật: thêm "Cam", "Dưa hấu", "Chanh", đổi tên theo label thật bạn đặt, kệ ly vẫn là "Kệ ly".

## Plan
- [x] 1. [khó] `shared/src/menu.ts` — thêm 3 ingredient + 5 món vào `INGREDIENTS`/`DRINKS`, xếp lại `STATIONS` (dãy 9 máy, Sữa ở giữa i=5, kệ ly dời chỗ trống, `machine()` cho 3 máy nước 1.5s); `shared/src/venues.ts` — chỉnh `VENUES.shop` như mục Ngữ cảnh; `VIP_DURATION_SECONDS` 35. Chạy `npm run typecheck` (sẽ lỗi ở client do `DRAW` thiếu khóa — bước 2 sửa).
- [x] 2. [vừa] `client/src/scenes/TeaArt.ts` — thêm 3 hàm vẽ `orange`/`watermelon`/`lemon` vào `DRAW`; `client/src/scenes/ShopScene.ts` — icon emoji cho 3 máy trong `STATION_ICONS`; `client/src/scenes/CupView.ts` — `cupLook` ly nước dùng ly rỗng nhuộm `cupColor`. Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/tea-shop-art.spec.ts` — viết T1–T2 (mở rộng spec có sẵn, cập nhật `EXPECTED_LABELS`). Chạy `npx playwright test tests/tea-shop-art.spec.ts`.
- [x] 4. [dễ] `README.md` — cập nhật mục Gameplay/menu tiệm trà (thêm món nước, dãy máy tách trà | sữa | nước, ca 4 phút nếu có nhắc 3 phút) và `AGENTS.md` nếu có chỗ nhắc số máy/độ dài ca; ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Dãy máy mới — tiệm trà hiện đủ nhãn trạm mới và không lỗi console — tests/tea-shop-art.spec.ts
  - Setup: 1 phiên, user `p1-${Date.now()}-N`, `joinAsHost`.
  - Steps: 1. chờ `window.__GAME__.stationLabels()` chứa mọi nhãn kỳ vọng (Kệ ly, Trà đen, Trà xanh, Trân châu, Kem cheese, Chanh dây, Sữa, 3 máy nước).
  - Assert: đủ nhãn; `pageerror` và console error rỗng.
- [x] T2. Bố cục tách biệt & công thức — Sữa nằm giữa, nguyên liệu trà/nước không trộn — tests/tea-shop-art.spec.ts
  - Setup: không cần trình duyệt (test thuần); import `STATIONS`, `DRINKS`, `isValidPartial`, `getVenue` từ shared theo cách `restaurant-layout.spec.ts`.
  - Steps: 1. lấy máy (`type === "machine"`) sắp theo x. 2. kiểm tra `isValidPartial(["black_tea","orange"])` và `isValidPartial(["orange","black_tea"])`. 3. đọc `getVenue("shop")`.
  - Assert: máy `milk` có đúng 4 máy bên trái (x nhỏ hơn) toàn là nguyên liệu trà và 3 máy bên phải là cam/dưa hấu/chanh; hai `isValidPartial` đều false; `isValidPartial(["watermelon","milk"])` true; `shiftSeconds > 180` và `durationStart > 60`.

## Trạng thái hiện tại
- Bước 1 xong (commit 89fac01): `shared/src/menu.ts` thêm 3 ingredient (orange 0xff9800, watermelon 0xf06292, lemon 0xcddc39) + 5 món nước (`juice_orange` $20, `watermelon_juice` $20, `lemonade` $18, `orange_lemon` $26, `watermelon_milk` $28); `STATIONS` thành dãy 9 máy x = 60 + i*102 (i=0..8, máy nước 1.5s, milk i=5 giữa), kệ ly dời (76, 290) theo "Quyết định đã chốt"; `shared/src/venues.ts` shop: shiftSeconds 240, spawn 11→7, duration 85→55, stars [120,260,420]; `VIP_DURATION_SECONDS` 25→35.
- Hằng cũ `ORDER_DURATION_*`, `SHIFT_SECONDS`, `STAR_THRESHOLDS` trong menu.ts KHÔNG cập nhật: đã grep toàn repo, không còn nơi nào dùng (BobaShopRoom dùng venue* từ venues.ts), đúng quy tắc "chỉ cập nhật cho khớp nếu còn dùng".
- Lưu ý: drink nước cam có id `juice_orange`, không phải `orange_juice` như plan, vì trùng dish id nhà hàng (restaurant.ts:168) — xem "Quyết định đã chốt".
- Bước 2 xong (commit 0cddeef): `TeaArt.ts` thêm helper `juiceJar` (bình nước ép + lát trái cây trên nắp, theo mẫu passion) + 3 hàm vẽ `orange`/`watermelon`/`lemon` vào `DRAW` (dưa hấu có thêm hạt trong bình); `ShopScene.ts` — `STATION_ICONS` thêm interface `StationIcon` (field `emoji?`) + 3 entry 🍊/🍉/🍋, nhánh load bỏ qua entry emoji, nhánh hiển thị tạo Phaser text thay image (cùng vị trí/depth, cap 22px trên mặt máy); `CupView.ts` — `cupLook` trả thêm `tint`, ly có nguyên liệu nước dùng base `empty` + `setTint(cupColor(item))` không topping, `setItem` reset tint khi không có. Lỗi TS2739 TeaArt.ts:71 của bước 1 đã hết sau bước 2, đúng như plan.
- Lưu ý: test hiện có `tests/restaurant-layout.spec.ts` test "T2: tea shop machines leave a 30px gap and counters a 40px gap..." sẽ FAIL sau bước 1 (kỳ vọng 7 trạm cùng hàng gap ≥ 30px; giờ là 10 trạm, máy cách nhau 6px, kệ ly đã rời hàng máy sang sàn) — plan không có bước nào cập nhật spec này, cần người duyệt/bước 3 bổ sung.
- Lưu ý: Test case T2 của task này ghi "milk có đúng 4 máy bên trái" nhưng dãy 9 máy theo plan có 5 máy trà bên trái milk (đen, xanh, trân châu, cheese, chanh dây) — cần chỉnh assert thành 5 khi viết test ở bước 3.
- Bước 1, 2 không tạo/đổi giao diện DOM nên không có selector mới (icon emoji là Phaser text trong world, không phải DOM).

- Bước 3 xong: `tests/tea-shop-art.spec.ts` cập nhật `EXPECTED_LABELS` thêm Cam/Dưa hấu/Chanh (10 nhãn) và thêm T2 (thuần Node): máy `milk` có 5 máy trà bên trái (đen, xanh, trân châu, cheese, chanh dây) + 3 máy nước bên phải (cam, dưa hấu, chanh); `isValidPartial(["black_tea","orange"])`/`(["orange","black_tea"])` false, `(["watermelon","milk"])` true; mọi `DRINKS` không trộn trà với nước; `getVenue("shop")` shiftSeconds > 180, durationStart > 60.
- Lưu ý: T2 dùng 5 máy trà bên trái milk (không phải 4 như câu chữ Test case), theo đúng dãy 9 máy ở "Quyết định đã chốt"/plan.
- Lưu ý: `tests/restaurant-layout.spec.ts` test "T2: tea shop machines leave a 30px gap..." vẫn còn kỳ vọng cũ (7 trạm) nên sẽ FAIL nếu chạy cả bộ; bước 3 chỉ chạy đúng `tests/tea-shop-art.spec.ts` theo yêu cầu nên chưa sửa spec đó.
- Bước 3 không tạo/đổi giao diện DOM (chỉ test) nên không có selector mới.

- Bước 4 xong: `README.md` cập nhật Gameplay tiệm trà — ca 4 phút, sao $120/$260/$420, nhịp khách 11s→7s và chờ 85s→55s, VIP chờ 35s, thêm dòng dãy 9 máy (trà/topping trái · Sữa giữa · nước cam/dưa hấu/chanh phải, kệ ly xuống sàn cạnh tường trái). Docs checked: `AGENTS.md` không nhắc số máy/độ dài ca (chỉ nói chung "timed shifts") nên không cần sửa.
- Bước 4 không tạo/đổi giao diện DOM (chỉ docs) nên không có selector mới.

## Test status
- Lần chạy cuối: `npm run typecheck` (bước 4): server PASS, client PASS. Bước 4 chỉ docs, plan không có lệnh playwright riêng nên không chạy e2e; T1/T2 đã PASS ở bước 3.
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
- Fail chi tiết: không có.

## Verify
- Cả bộ e2e: 82 PASS, 2 FAIL ban đầu: `restaurant-layout T2` (kỳ vọng cũ 7 trạm/gap 30px) đã sửa spec thành 9 máy, gap >= 6 → PASS; `fishing T31 T2` flaky, chạy lại riêng PASS (không liên quan task).
- T1: PASS, T2: PASS. typecheck PASS.
- Ảnh: `.agents/screenshots/task-34-juice-machines.png` — dãy 9 máy: trà | Sữa | Cam/Dưa hấu/Chanh, icon emoji, kệ ly ở sàn trái, ca 3:58. PASS.
- Lưu ý: spec `tests/restaurant-layout.spec.ts` T2 được Verify sửa (khoảng cách máy 30px→6px vì 9 máy rộng 96 trên 960px).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
