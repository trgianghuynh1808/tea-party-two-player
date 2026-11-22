# Task: Nâng cấp tiệm trà theo phong cách nhà hàng

Verify mode: light

## Mục tiêu
- 8 trạm hàng sau của tiệm trà (kệ ly + 7 máy/nguyên liệu: Trà đen, Trà xanh, Sữa, Trân châu, Kem cheese, Chanh dây) đổi từ ô màu phẳng sang quầy gỗ vẽ chi tiết giống quầy bếp nhà hàng (mặt quầy, thân quầy, viền, đổ bóng), mỗi quầy có thiết bị đặt trên mặt quầy nhận ra được nguyên liệu.
- Sàn tiệm trà có dải gạch caro kem/đất nung dọc khu quầy phía sau (giống viền gạch của nhà hàng), phần còn lại vẫn là sàn gỗ.
- Không đổi id/vị trí/kích thước trạm, luật chơi, tường, nội thất người chơi tự đặt, và nhà hàng.

## Quyết định đã chốt
- Vẽ bằng code (Phaser Graphics → `generateTexture`), cùng cách `KitchenArt.ts`; không thêm PNG.
- Không động vào tường (giữ giấy dán tường sọc và tranh treo) lần này.
- Quầy trà không có cánh tủ: mặt trước để trống một mảng cho icon nguyên liệu sẵn có (`STATION_ICONS`).
- Giữ nguyên bàn caro (`Counter`), quầy giao hàng, thùng rác.

## Ngữ cảnh
- Trạm tiệm trà: `shared/src/menu.ts` ~dòng 98-135: `MACHINE_Y = WALL_BOTTOM(120) + 25 = 145`, `MACHINE_W = 96`, `MACHINE_H = 60`; `cup_shelf` x=76 (type `StationType.CupShelf`), máy `black_tea` 206, `green_tea` 336, `milk` 466, `pearl` 596, `cheese_foam` 726, `passion` 856 (type `StationType.Machine`, có `ingredient`, `processSeconds`). Màu nguyên liệu: `INGREDIENTS[id].color` (black_tea 0x8b4a2b, green_tea 0x7cb342, milk 0xf5f0e1, pearl 0x3e2723, cheese_foam 0xffe082, passion 0xffb300).
- `client/src/scenes/KitchenArt.ts`: quầy bếp vẽ bằng code, export `KITCHEN_ART_RISE = 16`, `kitchenStationTexture(def)` và `makeKitchenStationTextures(scene)`. Mẫu helper (KHÔNG export, W = 84): `counter(g, top, front, edge)` vẽ thân + mặt quầy + viền + bóng + nét viền `OUTLINE = 0x3d2c29`; `doors(g, color)`. Texture cao `60 + KITCHEN_ART_RISE`, rộng W, đứng sát đáy hộp trạm và nhô lên tối đa 16px (`createStationBody` đặt `setOrigin(0.5, 1)` tại `def.y + def.height/2`).
  ```ts
  export function kitchenStationTexture(def: StationDef): string | undefined {
    if (def.type === StationType.Cooker && def.process) return key(def.process);
    if (def.type === StationType.Crate) return key("crate");
    if (def.type === StationType.Shelf) return key("shelf");
    return undefined;
  }
  ```
- `client/src/scenes/ShopScene.ts`:
  - dòng ~296-300 trong `create()`: `this.drawFloor(); this.drawWall(); this.drawExit(); makeKitchenStationTextures(this); new RestaurantView(this, fs, FLOOR_TEXTURE);`
  - `kitchenStationTexture(def)` là điều kiện cho: thân trạm (`createStationBody` ~dòng 704), vị trí nhãn (`labelTop` ~620, trừ `KITCHEN_ART_RISE` khi không phải crate), mặt quầy đặt ly (`topSurfaceBottom` ~641: `def.y - 6`), cỡ vật phẩm nhỏ (`KITCHEN_STATION_ITEM_HEIGHT = 22`, ~649). Trả về key texture cho Machine/CupShelf là các logic này tự chạy đúng.
  - `STATION_ICONS` ~dòng 176-185 và đoạn ~598-603 vẽ icon tại `(def.x, def.y)` dưới ly: với trạm có art mới, đặt icon lên mặt trước quầy (`y = def.y + def.height / 2 - 14`) và giới hạn cao ≤ 22px để không che thiết bị.
  - `drawFloor()` ~dòng 570: `this.add.image(0, 0, FLOOR_TEXTURE).setOrigin(0).setDisplaySize(WORLD_WIDTH, WORLD_HEIGHT).setDepth(-1000);` (sàn gỗ cả phòng; thế giới tiệm 960x600, tường `WALL_BOTTOM = 120`).
- `client/src/scenes/RestaurantView.ts`: `const TILE_KEY = "restaurant-tile"`, hàm private `makeTextures()` tạo texture gạch caro 80x80 (kem 0xf1e6d6 + đất nung 0xd9a38a) một lần (`textures.exists` guard), sàn gạch: `scene.add.tileSprite(x, y, w, h, TILE_KEY).setOrigin(0).setDepth(FLOOR_DEPTH)` với `FLOOR_DEPTH = -1000`.
- Khu quầy tiệm trà: hàng máy y 115..175; bàn đảo ở y≈271..329 → dải gạch y từ `WALL_BOTTOM` (120) đến 215.
- `tests/helpers.ts`: `joinAsHost(page, username)`; hook `window.__GAME__.stationLabels()` trả nhãn các trạm đang hiện.

## Plan
- [x] 1. [khó] `client/src/scenes/TeaArt.ts` (file mới) + `client/src/scenes/KitchenArt.ts` → `kitchenStationTexture`: (a) TeaArt export `makeTeaStationTextures(scene)` và `teaStationTexture(def): string | undefined`; texture rộng 96, cao `60 + KITCHEN_ART_RISE`, cùng bố cục với quầy bếp: thân quầy gỗ (mặt quầy sáng 0xdcc29c / thân 0x9c7457, viền, bóng, nét 0x3d2c29) nhưng KHÔNG có cánh tủ, chừa mảng giữa mặt trước cho icon; thiết bị trên mặt quầy mỗi trạm (màu theo `INGREDIENTS[...]`): `cup_shelf` kệ mở với chồng ly, `black_tea`/`green_tea` bình trà kính có vòi và nước trà màu nguyên liệu, `milk` bình sữa inox/ca sữa, `pearl` nồi nhỏ có nắp và trân châu đen, `cheese_foam` bình xịt kem hoặc tô kem vàng, `passion` hũ thủy tinh hạt chanh dây; (b) `kitchenStationTexture` thêm: `if (def.type === StationType.Machine || def.type === StationType.CupShelf) return teaStationTexture(def)` (import từ `./TeaArt`). Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/scenes/ShopScene.ts` → `create()` và đoạn vẽ icon trạm (~dòng 598-611): gọi `makeTeaStationTextures(this)` ngay sau `makeKitchenStationTextures(this)`; icon của trạm có art mới đặt lên mặt trước quầy (xem Ngữ cảnh), cao ≤ 22px; icon của trạm khác (nếu còn) giữ nguyên. Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/src/scenes/RestaurantView.ts` + `client/src/scenes/ShopScene.ts` → sàn: trong RestaurantView export hàm `ensureTileTexture(scene): string` (tách phần tạo texture gạch khỏi `makeTextures`, trả về `TILE_KEY`, `RestaurantView` dùng lại); trong `ShopScene.drawFloor()` thêm dải gạch: `this.add.tileSprite(0, WALL_BOTTOM, WORLD_WIDTH, 95, ensureTileTexture(this)).setOrigin(0).setDepth(-1000)` (tạo SAU ảnh sàn gỗ để nằm trên) và một vạch viền nâu mảnh (cao 4px, 0x8d5a3b alpha 0.6, cùng depth) ở mép dưới dải; đảm bảo `drawFloor()` chạy trước khi `new RestaurantView` vẫn không tạo texture trùng (guard `textures.exists`). Chạy `npm run typecheck`.
- [x] 4. [khó] `tests/tea-shop-art.spec.ts` (file mới): viết T1. Chạy `npx playwright test tests/tea-shop-art.spec.ts` rồi `npx playwright test`.

## Test cases
- [x] T1. Tiệm trà tải được với art mới — vào phòng không có `pageerror`/console error, `__GAME__.stationLabels()` (poll) chứa đủ "Kệ ly", "Trà đen", "Trà xanh", "Sữa", "Trân châu", "Kem cheese", "Chanh dây" — tests/tea-shop-art.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: đã thêm `client/src/scenes/TeaArt.ts` — `makeTeaStationTextures(scene)` tạo 7 texture quầy gỗ 96×76 (`tea-cup_shelf`, `tea-black_tea`, `tea-green_tea`, `tea-milk`, `tea-pearl`, `tea-cheese_foam`, `tea-passion`): thân quầy gỗ cùng bố cục quầy bếp (mặt 0xdcc29c / thân 0x9c7457, viền 0x7a5a43, bóng, nét 0x3d2c29), KHÔNG cánh tủ (chừa mảng giữa mặt trước cho icon); thiết bị trên mặt quầy: kệ mở chồng ly (cup_shelf), bình trà kính có vòi (black/green_tea, màu nước theo INGREDIENTS), ca sữa inox (milk), nồi nắp + khay trân châu (pearl), tô kem cheese swirl (cheese_foam), hũ thủy tinh hạt chanh dây (passion).
- `KitchenArt.ts` → `kitchenStationTexture` đã thêm nhánh Machine/CupShelf trả `teaStationTexture(def)` (import từ `./TeaArt`). Import vòng TeaArt ↔ KitchenArt an toàn: TeaArt chỉ đọc `KITCHEN_ART_RISE` trong hàm (`layout()`), không ở top-level module.
- Lưu ý giữa các bước: `makeTeaStationTextures` CHƯA được gọi trong `ShopScene.create()` (thuộc bước 2), nên nếu chạy game ở trạng thái này Phaser sẽ warn texture thiếu và vẽ fallback — biết trước, sửa ở bước 2.
- Bước 2 xong: `ShopScene.create()` gọi `makeTeaStationTextures(this)` ngay sau `makeKitchenStationTextures(this)`; icon của trạm có art TeaArt (`teaStationTexture(def)` trả key) chuyển lên mặt trước quầy: `y = def.y + def.height/2 - 14`, cao `min(iconDef.height, 22)px`; trạm khác giữ nguyên vị trí/kích thước icon. 7 trạm tiệm trà giờ hiển thị texture `tea-*` (đã nạp trước `createStations()`), nhãn/vị trí ly/tiến trình tự chạy đúng qua `kitchenStationTexture`.
- Bước 3 xong: `RestaurantView` export `ensureTileTexture(scene): string` (tách code tạo texture gạch caro 80×80, guard `textures.exists`, trả `TILE_KEY`), constructor gọi hàm này thay `makeTextures()` (đã xóa method private trùng lặp). `ShopScene.drawFloor()` thêm dải gạch `tileSprite(0, WALL_BOTTOM, WORLD_WIDTH, 95)` depth -1000 tạo SAU ảnh sàn gỗ (nằm trên) + vạch viền nâu 4px (0x8d5a3b, alpha 0.6) ở mép dưới dải (y 211..215). `drawFloor()` chạy trước `new RestaurantView` nhưng texture gạch chỉ tạo một lần nhờ guard.
- Bước 4 xong: đã thêm `tests/tea-shop-art.spec.ts` — T1 vào phòng qua `joinAsHost` (username duy nhất `p1-<ts>-<seq>`), gắn listener `pageerror` + console error NGAY TRƯỚC khi load, poll `__GAME__.stationLabels()` đến khi chứa đủ 7 nhãn "Kệ ly", "Trà đen", "Trà xanh", "Sữa", "Trân châu", "Kem cheese", "Chanh dây" (kiểm tra substring vì máy có thời gian có hậu tố " ⏱…"), rồi assert không có page error/console error. Cả 4 bước plan hoàn tất; toàn bộ 17 test (16 cũ + T1 mới) PASS.

## Test status
- Lần chạy cuối: `npx playwright test` (toàn bộ suite, sau bước 4) — 17/17 PASS (~57s), không regress test cũ.
- Kết quả từng test:
  - T1: PASS — `npx playwright test tests/tea-shop-art.spec.ts` (1 passed) rồi trong cả bộ suite (17 passed).
- Bước 4 quy trình: `npm run typecheck` PASS → `npx playwright test tests/tea-shop-art.spec.ts` 1 passed → `npx playwright test` 17 passed.
- Fail chi tiết:

## Verify
- T1: PASS (playwright 17/17, typecheck OK). Ảnh tiệm trà: 8 quầy gỗ có thiết bị + dải gạch caro; nhà hàng không đổi.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
