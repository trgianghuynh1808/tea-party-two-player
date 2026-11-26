# Task: Khu câu cá (ao hồ) — tòa thứ 3 ngoài sân

APPROVED_BY_MANAGER

Verify mode: full
<!-- none: refactor/đổi chữ/không ảnh hưởng UI · light: mặc định · full: luồng người dùng mới, nhiều người dùng, logic đồng bộ -->

## Ý tưởng
- Thêm "khu câu cá" ở bên trái nhà hàng ngoài sân: một cổng (vẽ bằng code, ảnh thật gửi sau) dẫn vào màn hình ao hồ riêng, đi vào bằng tấm thảm cửa giống nhà hàng / tiệm trà.
- Trong ao: bờ gỗ ở trên cùng để người chơi đi ngang, cá (vẽ tạm bằng code) bơi ngang trong nước. Bấm Space/nút để thả lưỡi câu rơi thẳng xuống; chạm cá thì phải GIỮ thanh kéo liên tục để thu dây (nhả ra thì cá kéo ngược lại).
- Nhiều loại cá theo bậc (thường → huyền thoại) giá khác nhau; 5 cấp cần câu, cần càng cao càng dễ cắn cá hiếm. Server quyết định mọi thứ (cá, va chạm, kéo, tiền).
- Một phiên câu 10 phút cả phòng; hết giờ hiện bảng tổng kết tiền mỗi người (tiền vào ví riêng từng người), và có thể dùng tiền nâng cấp cần câu (lưu theo tên người chơi).

## Mục tiêu
1. Ngoài sân có cổng khu câu cá; bước lên thảm vào được màn hình ao, đi ra bằng thảm thoát ở bờ.
2. Trong ao thấy cá bơi (đồng bộ 2 người), người chơi đứng ở bờ trên, thả câu theo đường thẳng xuống; chạm cá thì giữ thanh kéo để thu, thắng thì cá bán ngay vào ví.
3. Có phân loại cá (8 loài, 5 bậc) và cần câu (5 cấp); cần cao hơn → tỉ lệ cắn cá hiếm cao hơn, kéo nhanh hơn.
4. Phiên 10 phút, hết giờ hiện bảng tổng kết (số cá, tiền); nâng cấp cần câu bằng tiền, giữ qua phòng/lần chơi sau.

## Quyết định đã chốt
- Câu cá KHÔNG phải ca làm (không đơn, không khách); có trạng thái riêng `fishPhase` trong schema, không dùng `GamePhase`/`Venue`. Không chạy cùng lúc với ca làm: `start_shift` bị từ chối khi đang câu, `start_fishing` bị từ chối khi đang có ca.
- Mỗi người giữ tiền câu của mình (vào ví riêng ngay khi bắt được), không chia đôi.
- Cá bơi và lưỡi câu mô phỏng ở server (tick 60 Hz sẵn có `update(dt)`); client chỉ vẽ và gửi ý định (`cast`, `reel` giữ/nhả, `retract`).
- Hình ảnh tạm: cổng, ao, cá, cần vẽ bằng Phaser Graphics/DOM, không cần asset ảnh. Người dùng gửi ảnh sau.
- Khu câu cá chỉ là nơi đi vào: không đặt đồ trang trí ở đó (nút Trang trí tắt khi đang ở ao); nút Xây không đổi.
- Số liệu (đặt trong `shared/src/fishing.ts`, có thể chỉnh sau):
  - Cá `{id, name, tier, price, hold}`: `ca_ro` Cá rô (thường, $8, 2s) · `ca_chep` Cá chép (thường, $14, 2.5s) · `ca_tre` Cá trê (ít gặp, $25, 3s) · `ca_he` Cá hè (ít gặp, $40, 3.5s) · `ca_tram` Cá trầm (hiếm, $80, 5s) · `ca_loc` Cá lóc vàng (hiếm, $130, 5.5s) · `ca_koi` Cá koi (sử thi, $300, 7s) · `ca_rong` Cá rồng (huyền thoại, $900, 9s). `hold` = giây giữ liên tục khi cần cấp 1.
  - Cần `{level, name, price, reel, bite}`: 1 Cần tre ($0, reel 1.0) · 2 Cần gỗ ($300, 1.2) · 3 Cần carbon ($900, 1.5) · 4 Cần hợp kim ($2200, 1.9) · 5 Cần vàng ($5000, 2.4). `bite[tier]` = xác suất cá chịu cắn khi lưỡi chạm: cấp 1 `[1, .9, .5, .25, .05]`, cấp 2 `[1, 1, .65, .4, .12]`, cấp 3 `[1, 1, .8, .6, .25]`, cấp 4 `[1, 1, .95, .8, .5]`, cấp 5 `[1, 1, 1, 1, .85]` (thứ tự bậc: thường, ít gặp, hiếm, sử thi, huyền thoại).
  - Kéo: `reelProgress` bắt đầu 0.3; giữ thanh: `+= dt * rod.reel / fish.hold`; nhả: `-= dt * 0.15`; ≥ 1 → bắt được, ≤ 0 → cá thoát; quá 25s kể từ lúc cắn → thoát.
  - Quần thể: luôn giữ 10 con, bốc loài theo trọng số (thường 40/30, ít gặp 12/8, hiếm 4/3, sử thi 2, huyền thoại 1) khi sinh ra; cá bị bắt thì sinh con mới.
  - Phiên `FISH_SECONDS = 600` (env `FISH_SECONDS` ghi đè để test).

## Ngữ cảnh
Cấu trúc hiện có (đọc kỹ trước khi sửa, đừng quét cả repo):
- `shared/src/world.ts`: `YARD` (x 0, y 1000, 2400×1600), `OUTDOOR = { x: -1000, y: YARD.y, width: YARD.width + 1000, height: YARD.height }`, `RESTAURANT_BUILDING` (left −900, right −340, top YARD.y+40, bottom YARD.y+320), `RESTAURANT_ENTER_ZONE`, `RESTAURANT_YARD_SPAWN`, `RESTAURANT` (interior `{x:1400,y:0,width:1000,height:620}`), `RESTAURANT_EXIT_ZONE`, `RESTAURANT_ENTRY_SPAWN`, `type Area = "shop"|"restaurant"|"yard"`, `areaOf(p)` (yard nếu `isInYard`, else `p.x >= RESTAURANT.x - 200 ? "restaurant" : "shop"`), `interface DoorDef { inside: "shop"|"restaurant"; enter; exit; insideSpawn; outsideSpawn }`, `DOORS: DoorDef[]`, `doorAt(p, margin)`.
- `shared/src/index.ts`: `Messages` (thêm khóa mới ở đây), `resolveCollisions(pos, tiles)` (inside: đẩy khỏi station + clamp theo `box`, `y >= box.y + WALL_BOTTOM`; yard: `resolveYardCollisions` đẩy khỏi `[SHOP_BUILDING, RESTAURANT_BUILDING]` rồi clamp theo `OUTDOOR`), `PLAYER_RADIUS`, `PLAYER_SPEED`, `WORLD_WIDTH/HEIGHT` (960×600), `export * from "./venues"` (thêm `export * from "./fishing"`).
- `shared/src/schema.ts`: `Player` (x, y, money mirror, teleportSeq…), `BobaShopState` (phase, venue, shiftTimeLeft…). Dùng `@type`; mảng `ArraySchema`, map `MapSchema`.
- `shared/src/placement.ts`: `DECOR_ROOMS` chỉ có shop/restaurant; `areaOf` trả thêm `"pond"` có thể làm typecheck gãy ở `SharedShop.ts` (`venue: areaOf(...)`, dòng ~225), `server/src/admin.ts` (so `areaOf(piece) === venue`) → thu hẹp kiểu (ví dụ chỉ nhận `"shop"|"restaurant"`), đừng thêm pond vào `DECOR_ROOMS`.
- `server/src/rooms/BobaShopRoom.ts`: `onCreate` đăng ký message ở khoảng dòng 150–210 (`use_door: (client) => this.handleUseDoor(client)`, `start_shift`…), `this.setSimulationInterval((deltaTime) => this.update(deltaTime / 1000), 1000/60)` (dòng ~230) → thêm `updateFishing(dt)` vào `update`; `handlePosition` (~dòng 752) chặn đổi area bằng đi bộ, dùng `resolveCollisions`; `handleUseDoor` (~dòng 833) dùng `doorAt(player, 24)` + `DOORS` nên cổng mới tự chạy khi thêm vào `DOORS`; `startShift(venue)` (~510) cần guard khi đang câu; `sessionNames.get(client.sessionId)` = usernameKey; `shopOf(key).earn(amount)` cộng tiền vào ví riêng (`SharedShop.earn`, `server/src/shop/SharedShop.ts:128`), ví phản chiếu lên `player.money` qua listener có sẵn (xem cách `earn` được dùng khi chia tiền ca). `process.env.SHIFT_SECONDS` là mẫu cho `FISH_SECONDS`.
- `server/src/shop/SharedShop.ts` + `server/src/persistence/ShopStore.ts`: `SharedShop` lưu `money` + đồ; thêm trường `rodLevel` (số nguyên 1–5, mặc định 1) vào save (`parseShopSave` phải chấp nhận save cũ không có trường này) và phát event đổi để `Player.rodLevel` cập nhật như cách `money` đang làm.
- `client/src/scenes/ShopScene.ts`: `checkDoor` (~dòng 555) gửi `Messages.UseDoor` khi `doorAt(local.container)`; `updateArea()` (~dòng 563) chọn camera: `area === "yard" ? OUTDOOR : area === "restaurant" ? RESTAURANT : {0,0,WORLD_WIDTH,WORLD_HEIGHT}` rồi `game.events.emit(AREA_EVENT, area)`; vòng input dùng `KeyboardState` (WASD/mũi tên + Space) và `TouchControls`. Dựng view: `new RestaurantView(this, fs, FLOOR_TEXTURE)` (~dòng 308). `AREA_EVENT`, `BUILD_MODE_EVENT`… export ở đầu file.
- `client/src/scenes/YardView.ts`: vẽ sân + nhà hàng (`RESTAURANT_BUILDING`, `RESTAURANT_DOOR_X`, `RESTAURANT_ENTER_ZONE`, dòng ~297–370) bằng code → copy kiểu đó cho cổng khu câu cá; nền sân phải phủ tới phần `OUTDOOR` mở rộng.
- `client/src/main.ts`: `game.events.on(AREA_EVENT, (next: Area) => {...})` (~dòng 523) gọi `shiftOverlay?.setArea(next)`; nút Trang trí quyết định theo area (~dòng 504–510); DOM panel dựng ở đây. `client/src/ui/ShiftOverlay.ts`: `setArea(area)` chỉ biết shop/restaurant.
- `client/src/testHook.ts`: `window.__GAME__ = { room, send, state, tiles(), tileRotations(), stationLabels() }`.
- Server dev/test mặc định: cổng test server 2568, client 5174 (`tests/ports.ts`); `playwright.config.ts` webServer của server có `env: { ...process.env, ADMIN_TOKEN: 'test-admin-token', PORT: ... }` (dòng ~63) → thêm `FISH_SECONDS`, `FISH_TEST`, `DEBUG_WARP` vào đó.

Thiết kế chi tiết (để các bước làm đúng một kiểu):
- **Hình học** (thêm vào `shared/src/world.ts`):
  - `OUTDOOR` mở rộng sang trái: `x: -1900`, `width: YARD.width + 1900`. `POND_BUILDING: Rect = { left: -1760, top: YARD.y + 40, right: -1240, bottom: YARD.y + 320 }` (cổng/vòm, chặn di chuyển như nhà; thêm vào danh sách chặn trong `resolveYardCollisions`), `POND_DOOR_X`, `POND_ENTER_ZONE`, `POND_YARD_SPAWN` giống nhà hàng.
  - Nội thất ao: `POND = { x: 3000, y: 0, width: 960, height: 600 }` (x ≥ 2800 → `areaOf` trả `"pond"`, kiểm tra trước nhánh restaurant). `DOCK` (bờ gỗ để đi): `{ left: POND.x + 24, right: POND.x + 936, top: 70, bottom: 150 }`; người chơi chỉ đi được trong DOCK (clamp ở nhánh pond của `resolveCollisions`). Mặt nước: `WATER = { top: 160, bottom: 580, left: POND.x + 16, right: POND.x + 944 }`. `POND_EXIT_ZONE` ở đầu trái bờ `{ left: POND.x + 24, top: 110, right: POND.x + 90, bottom: 150 }`; `POND_ENTRY_SPAWN = { x: POND.x + 480, y: 110 }` (cách xa thảm thoát, để không bật ngược ngay).
  - `Area` thêm `"pond"`; `DoorDef.inside` thêm `"pond"`; thêm vào `DOORS`.
- **Schema** (`shared/src/schema.ts`):
  - `class Fish extends Schema { id: string; species: string; x: number; y: number; dir: number (1|-1); hooked: boolean }`.
  - `BobaShopState`: `fishPhase: string = "idle"` (`"idle"|"fishing"|"ended"`), `fishTimeLeft: number`, `@type({ map: Fish }) fish`.
  - `Player`: `rodLevel: number = 1`, `hookState: string = ""` (`""|"drop"|"reel"`), `hookX`, `hookY`, `reelProgress` (0..1), `fishCaught: number`, `fishEarned: number`, `lastCatch: string` (species id) và `catchSeq: number` (tăng mỗi lần bắt được, client dùng hiện thông báo), `escapeSeq: number` (tăng mỗi lần cá thoát).
- **Messages**: `StartFishing: "start_fishing"`, `Cast: "cast"` (thả lưỡi tại `player.x`, chỉ khi đang ở pond + `fishPhase === "fishing"` + `hookState === ""`), `Reel: "reel"` payload `{ holding: boolean }`, `Retract: "retract"` (thu lưỡi khi chưa cắn), `UpgradeRod: "upgrade_rod"` (lên cấp kế tiếp nếu đủ tiền, trừ ví), `DebugWarp: "debug_warp"` payload `{ x, y }` (CHỈ đăng ký khi env `DEBUG_WARP=1`, dùng cho e2e).
- **Mô phỏng ở server** (`updateFishing(dt)`):
  - Chỉ khi `fishPhase === "fishing"`; trừ `fishTimeLeft`; về 0 → `fishPhase = "ended"`, mọi `hookState = ""`, xoá cá.
  - Mỗi cá: `x += dir * speed * dt` (tốc độ theo loài 40–110 px/s, cá hiếm nhanh hơn), đảo `dir` ở mép `WATER`; `y` cố định trong làn (`WATER.top + 40 … WATER.bottom - 40`); chỉ ghi vào schema mỗi ~100 ms (tích lũy dt) để đỡ băng thông. Cá `hooked` thì đứng yên ở vị trí lưỡi.
  - Lưỡi `drop`: `hookY += 160 * dt` từ `WATER.top`; chạm cá (khoảng cách ≤ 18 px, cá chưa hooked, chưa được roll trong lần thả này — dùng Set theo player) → roll `rod.bite[tierIndex]` (`FISH_TEST=1` thì luôn cắn); cắn → `fish.hooked = true`, `hookState = "reel"`, `reelProgress = 0.3`; xuống đáy `WATER.bottom` mà không cắn → tự thu (`hookState = ""`).
  - `reel`: lưu cờ `holding` theo player; tick tăng/giảm `reelProgress` theo công thức trên; thắng → `earn(price)`, `fishCaught++`, `fishEarned += price`, `lastCatch`, `catchSeq++`, xoá cá + sinh cá mới; thua/quá 25s → thả cá (hooked=false), `escapeSeq++`, `hookState = ""`.
  - Rời phòng / ra khỏi ao (qua cửa) → thu lưỡi, thả cá đang cắn. Khi `FISH_TEST=1` mọi cá sinh ra là `ca_ro` (luôn cắn, `hold` giữ nguyên) để test ổn định.
  - `start_fishing`: chỉ khi `fishPhase !== "fishing"`, `phase !== Playing`, và người gửi đang ở area `pond`; reset `fishCaught/fishEarned = 0` cho mọi người, `fishTimeLeft = FISH_SECONDS`, sinh 10 cá.
- **Client**:
  - `PondView` (`client/src/scenes/PondView.ts`, mới): vẽ nước (gradient xanh, sóng), bờ gỗ DOCK, thảm thoát, mỗi `Fish` trong schema = một Graphics (thân elip + đuôi, màu/kích thước theo bậc, quay theo `dir`), lưỡi + dây thẳng từ tay người chơi (`hookX` từ `player.y`+ cần) xuống `hookY` cho TẤT CẢ người chơi có `hookState !== ""`.
  - Cổng khu câu cá trong `YardView` vẽ bằng code (vòm gỗ + biển "Khu câu cá" + thảm cửa).
  - Input: Space/nút hành động khi đang ở pond: `hookState === ""` → gửi `Cast`; `hookState === "drop"` → `Retract`; `hookState === "reel"` → GIỮ Space/nút kéo gửi `Reel {holding:true}`, nhả gửi `Reel {holding:false}` (chỉ gửi khi đổi trạng thái).
  - `FishingPanel` (`client/src/ui/FishingPanel.ts`, mới), DOM ids bắt buộc: `#fishing-hud` (đồng hồ còn lại, số cá, tiền câu được, tên cần, nút nâng cấp `#fishing-upgrade`), `#fishing-start` (nút "Bắt đầu câu" khi `fishPhase !== "fishing"` và đang ở ao), `#fishing-reel` (thanh kéo: thanh tiến độ + nút giữ trên mobile, hiện khi `hookState === "reel"`), `#fishing-summary` (bảng tổng kết khi `fishPhase === "ended"`: mỗi người số cá + tiền, nút `#fishing-again`, nút nâng cấp cần), thông báo bắt được `#fishing-toast`. Chữ tiếng Việt.

Sự thật để test:
- Hook: `window.__GAME__` có `room` (dùng `room.sessionId`, `room.roomId`), `send(type, payload)`, `state`. Người chơi mình: `__GAME__.state.players.get(__GAME__.room.sessionId)`. Trường mới: `state.fishPhase`, `state.fishTimeLeft`, `state.fish` (map), `player.hookState`, `player.rodLevel`, `player.fishCaught`, `player.fishEarned`, `player.money`.
- Vào phòng bằng `joinAsHost(page, username)` trong `tests/helpers.ts` (username duy nhất `p1-${Date.now()}`); người thứ 2 vào bằng `/?test=1&room=<roomId>` (không cần cho các test dưới).
- Playwright KHÔNG import được module TS của server; chỉ dùng `window.__GAME__`, HTTP admin API (`ADMIN_TOKEN=test-admin-token`, xem comment đầu `server/src/admin.ts` để cấp tiền: `PUT /admin/users/:name/shop` body `{ money, decorations }`) hoặc ghi file save (`writeShopSave` trong helpers).
- Để vào ao trong test: `DEBUG_WARP=1` bật message `debug_warp`; gửi `send("debug_warp", { x, y })` đặt người chơi tới điểm bất kỳ (tăng `teleportSeq`); đặt vào tâm `POND_ENTER_ZONE` thì client tự gửi `use_door` (thật) và vào ao. Vì test không import được `@boba/shared` runtime qua page, hãy dùng số cố định: tâm thảm cổng ao ≈ `x = POND_DOOR_X = -1500`, `y = YARD.y + 320 + 14 = 1334`; thảm thoát ao ở `x ≈ POND.x + 57 = 3057`, `y ≈ 130`. (Test file có thể `import { POND_ENTER_ZONE, POND_EXIT_ZONE, ... } from "@boba/shared"` ở phía Node như `helpers.ts` đã import `usernameKey`.)
- Nút Xây bật ở sân; Trang trí bật khi ở tiệm/nhà hàng, tắt khi ở ao.
- Test chạy với server env `FISH_TEST=1 FISH_SECONDS=20 DEBUG_WARP=1` (thêm vào `playwright.config.ts`).

## Plan
<!-- Mỗi bước: - [ ] N. [dễ|vừa|khó] <file> → <hàm>: <làm gì>. Phải có bước viết spec cho các Test cases. -->
- [x] 1. [khó] `shared/src/fishing.ts` (mới) + `shared/src/world.ts`, `shared/src/schema.ts`, `shared/src/index.ts`: tạo `fishing.ts` (`FishTier`, `FISH`, `FISH_TIERS`, `RODS`, `getFish`, `getRod`, `biteChance(rodLevel, tier)`, `reelRate`, hằng số `FISH_SECONDS`, `FISH_COUNT`, `HOOK_SPEED`, `HOOK_RADIUS`, `REEL_START`, `REEL_DECAY`, `REEL_TIMEOUT`, `pickFishSpecies(rng)`); trong `world.ts` thêm `POND_*`, `POND`, `DOCK`, `WATER`, mở rộng `OUTDOOR`, `Area` + `"pond"`, `areaOf`, `DoorDef.inside`, `DOORS`; trong `index.ts` thêm `Messages.StartFishing/Cast/Reel/Retract/UpgradeRod/DebugWarp`, payload types (`ReelMessage`, `DebugWarpMessage`), `export * from "./fishing"`, nhánh pond trong `resolveCollisions` (clamp trong DOCK) và `POND_BUILDING` trong `resolveYardCollisions`; trong `schema.ts` thêm class `Fish` + field của `BobaShopState`/`Player` như mục Thiết kế. Thu hẹp kiểu ở `shared/src/placement.ts`/nơi dùng `Area` để typecheck sạch. Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/rooms/BobaShopRoom.ts` → `onCreate`, `update`, `updateFishing`, `handleStartFishing`, `handleCast`, `handleReel`, `handleRetract`, `handleUpgradeRod`, `handleDebugWarp`, `startShift`: thêm toàn bộ logic mô phỏng cá/lưỡi/kéo/tiền/đồng hồ 10 phút như mục Thiết kế, guard giữa ca làm và phiên câu, dọn lưỡi khi người chơi rời ao/rời phòng; `server/src/shop/SharedShop.ts` + `server/src/persistence/ShopStore.ts` → lưu `rodLevel` (save cũ không có trường thì = 1) và đồng bộ lên `Player.rodLevel`; nếu `areaOf` kiểu mới làm gãy `server/src/admin.ts` thì thu hẹp kiểu ở đó. Chạy `npm run typecheck`.
- [x] 3. [khó] `client/src/scenes/PondView.ts` (mới) + `client/src/scenes/YardView.ts` + `client/src/scenes/ShopScene.ts`: vẽ cổng khu câu cá và mở rộng nền sân sang trái trong `YardView` (theo mẫu nhà hàng, dòng ~297–370); `PondView` vẽ nước/bờ gỗ/cá (đồng bộ từ `state.fish`, nội suy mượt)/dây + lưỡi của mọi người chơi; trong `ShopScene` dựng `PondView`, thêm nhánh `"pond"` vào `updateArea()` (camera cố định 960×600 tại `POND`), xử lý input Space/nút hành động: `Cast` / `Retract` / giữ `Reel {holding}` (chỉ gửi khi đổi), mở rộng `testHook.ts` nếu cần. Chạy `npm run typecheck`.
- [x] 4. [khó] `client/src/ui/FishingPanel.ts` (mới) + `client/src/main.ts` + `client/src/ui/ShiftOverlay.ts` + `client/src/index.html`/CSS hiện có: dựng `FishingPanel` với đúng các id `#fishing-hud`, `#fishing-start`, `#fishing-reel`, `#fishing-upgrade`, `#fishing-summary`, `#fishing-again`, `#fishing-toast` (hiển thị theo `fishPhase`, `hookState`, `reelProgress`, `catchSeq/escapeSeq`; thanh kéo cảm ứng cho mobile); trong `main.ts` nối vào `AREA_EVENT` (ẩn `ShiftOverlay` và tắt nút Trang trí khi area `"pond"`, hiện panel khi ở ao), gửi `StartFishing` / `UpgradeRod`; thêm CSS cho panel; GHI LẠI trong "Trạng thái hiện tại" một dòng `Selectors:` liệt kê các id đã dùng thật. Chạy `npm run typecheck`.
- [x] 5. [vừa] `tests/fishing.spec.ts` (mới) + `playwright.config.ts`: thêm `FISH_SECONDS: '20'`, `FISH_TEST: '1'`, `DEBUG_WARP: '1'` vào `env` của webServer của server; viết 3 spec T1–T3 (xem Test cases) dùng `joinAsHost` từ `tests/helpers.ts`; ĐỌC dòng `Selectors:` trong "Trạng thái hiện tại" trước khi viết (các id trong plan chỉ là ví dụ nếu bước 4 đổi tên). Chạy `npx playwright test tests/fishing.spec.ts`, rồi `npx playwright test` toàn bộ một lần.
- [x] 6. [dễ] `README.md` (+ `AGENTS.md`): ghi khu câu cá vào Gameplay/Controls/Mobile/Dev options (env `FISH_SECONDS`, `FISH_TEST`, `DEBUG_WARP`), `AGENTS.md` Architecture (message mới `start_fishing`, `cast`, `reel`, `retract`, `upgrade_rod`; `fishPhase` trong state) và Codebase Map (`shared/src/fishing.ts`, `PondView`, `FishingPanel`); xoá câu nói cũ không còn đúng ("hai nơi: tiệm trà và nhà hàng" nếu có). Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Cổng ao vào/ra — bước lên thảm cổng thì vào màn hình ao, thảm thoát đưa ra lại sân — tests/fishing.spec.ts
  - Setup: 1 phiên, `joinAsHost(page, \`p1-${Date.now()}\`)`; người chơi mới ở sân (y ≥ 1000).
  - Steps: 1. `send("debug_warp", { x: POND_DOOR_X, y: YARD.y + 334 })` (số lấy từ `@boba/shared` phía Node: tâm `POND_ENTER_ZONE`). 2. `expect.poll` tới khi `player.x >= 2800` (đã vào ao). 3. Kiểm tra `#fishing-start` hiện. 4. `send("debug_warp", { x: POND_EXIT_ZONE tâm })` rồi poll.
  - Assert: sau 2: `player.x` ≈ `POND.x + 480`, `player.y` ≈ 110; `#fishing-start` visible; sau 4: `player.y >= 1000` (về sân), `#fishing-start` không còn hiển thị.
- [x] T2. Câu được cá — thả câu, cá cắn, giữ kéo → thắng, tiền vào ví — tests/fishing.spec.ts
  - Setup: 1 phiên, host mới, `debug_warp` vào ao như T1 (vào tâm thảm cổng rồi poll `player.x >= 2800`). Server chạy `FISH_TEST=1` (mọi cá là `ca_ro` $8, luôn cắn).
  - Steps: 1. Bấm `#fishing-start` (hoặc `send("start_fishing")`). 2. Poll `state.fishPhase === "fishing"`. 3. Vòng lặp tối đa 40 s: nếu `player.hookState === ""` thì `send("cast")`; tới khi `hookState === "reel"` (nếu bờ chưa có cá bên dưới thì lưỡi tự thu và vòng lặp thả lại; có thể `debug_warp` sang x khác trên bờ giữa các lần để quét). 4. `send("reel", { holding: true })`. 5. Poll `player.fishCaught === 1`. 6. `send("reel", { holding: false })`.
  - Assert: sau 2 `state.fish.size === 10`; sau 3 `hookState === "reel"` và `#fishing-reel` visible; sau 5 `player.money === 8` (ví mới = 0), `player.fishEarned === 8`, `player.hookState === ""`, `#fishing-toast` chứa "Cá rô".
- [x] T3. Tổng kết và nâng cấp cần — hết 20 s hiện bảng tổng kết, nâng cấp cần bằng tiền — tests/fishing.spec.ts
  - Setup: 1 phiên, host mới; cấp tiền bằng admin API: `PUT http://localhost:<TEST_SERVER_PORT>/admin/users/<username>/shop` header `Authorization: Bearer test-admin-token`, body `{ money: 500, decorations: [] }` TRƯỚC khi vào phòng (hoặc `writeShopSave`); vào ao bằng `debug_warp`. `FISH_SECONDS=20`.
  - Steps: 1. `send("start_fishing")`. 2. Chờ `state.fishPhase === "ended"` (timeout 40 s). 3. Đọc `#fishing-summary`. 4. Bấm `#fishing-upgrade` (hoặc `send("upgrade_rod")`).
  - Assert: sau 2 `#fishing-summary` visible và ghi số cá `0` và tiền `$0` của người chơi; sau 4 `player.rodLevel === 2`, `player.money === 200` (500 − 300), nút nâng cấp hiện giá cấp 3 ($900) và bị khoá vì thiếu tiền.

## Trạng thái hiện tại
- Bước 1 xong: `shared/src/fishing.ts` (loài cá + cần + công thức kéo + hằng số), `world.ts` (OUTDOOR mở rộng sang trái tới x −1900, `POND_BUILDING/POND_DOOR_X/POND_ENTER_ZONE/POND_YARD_SPAWN`, `POND/DOCK/WATER/POND_EXIT_ZONE/POND_ENTRY_SPAWN`, `Area` + `"pond"` kiểm tra trước nhánh restaurant, `DOORS` có cửa ao), `index.ts` (6 message mới + `ReelMessage`/`DebugWarpMessage`, nhánh pond clamp trong DOCK, `POND_BUILDING` chặn ở sân), `schema.ts` (class `Fish`, `fishPhase/fishTimeLeft/fish` của state, `rodLevel/hookState/hookX/hookY/reelProgress/fishCaught/fishEarned/lastCatch/catchSeq/escapeSeq` của Player). Thu hẹp `PieceInfo.venue` ở `server/src/shop/SharedShop.ts` thành `"shop" | "restaurant"` (nơi dùng `Area` theo plan; `placement.ts` không cần đổi). `npm run typecheck` PASS.
- Bước 3 xong: `YardView` vẽ cổng ao (vòm 2 cột gỗ + dầm + biển "🎣 Khu câu cá" + ao nhỏ trước cổng + thảm cửa + biển chỉ đường "⬅ 🎣 Khu câu cá" cạnh nhà hàng); nền sân phủ `OUTDOOR` mở rộng bằng tileSprite sẵn có. `PondView` (mới): nước gradient + gợn sóng động + bờ gỗ DOCK + thảm thoát + hint, cá vẽ bằng code theo bậc (màu/kích thước theo `TIER_LOOK`, cá hiếm trở lên có nhãn tên), nội suy lerp về vị trí `state.fish` (server sync mỗi 0.1s), dây + lưỡi vẽ mỗi frame cho mọi người có `hookState !== ""`. `ShopScene`: dựng `PondView` trong `bindRoom` (dọn khi shutdown), `updateArea()` có nhánh pond (camera `POND` 960×600), `handleInput` chuyển action key sang `handlePondAction` khi ở ao (Cast/Retract khi nhấn, Reel{holding} chỉ gửi khi đổi trạng thái giữ; mobile kéo bằng nút giữ của FishingPanel ở bước 4), `updateStationHighlight` hiện nhãn nút hành động "🎣 Thả câu / ↩ Thu lưỡi / 🎣 Giữ để kéo" khi ở ao. `testHook.ts` không cần mở rộng (state đã đủ cho test). Bước 3 không tạo DOM id/class mới (PondView/YardView vẽ trong canvas Phaser). `npm run typecheck` PASS.
- Bước 4 xong: `FishingPanel` (mới, overlay trong `.game-wrap` cạnh `#shift-overlay`) dựng DOM một lần rồi cập nhật mỗi 100 ms: HUD (`⏱` đồng hồ phiên, `🐟` số cá, `💰` tiền câu được, tên cần, nút `#fishing-upgrade` hiện giá cấp kế, khoá khi thiếu tiền / đã max), `#fishing-start` hiện khi `fishPhase !== "fishing"`, `#fishing-summary` + `#fishing-again` khi `"ended"` (số cá + tiền từng người), `#fishing-reel` (thanh `reelProgress` + nút giữ `#fishing-hold` gửi `Reel{holding}` theo pointer events cho mobile; desktop giữ Space như bước 3), `#fishing-toast` hiện theo `catchSeq/escapeSeq`. `main.ts`: dựng panel trong `startGame`, nối `AREA_EVENT` → `fishingPanel.setArea` + `shiftOverlay.setArea`; `updateDecorateBtn` tắt nút Trang trí khi ở ao (title "Khu câu cá không có đồ trang trí"), nút Xây giữ nguyên logic (ao không phải yard → tự tắt); `stopGame` dọn panel. `ShiftOverlay.setArea` thêm `forceHidden` khi ở ao (render tôn trọng cờ). CSS: section "Fishing panel (pond overlay)" + biến thể compact. `npm run typecheck` PASS.
Selectors: #fishing-panel (client/index.html — root overlay), #fishing-hud, #fishing-start, #fishing-upgrade, #fishing-reel, #fishing-hold, #fishing-summary, #fishing-again, #fishing-toast (client/src/ui/FishingPanel.ts — dựng vào #fishing-panel)
- Bước 5 xong: `playwright.config.ts` thêm `FISH_SECONDS: '20'`, `FISH_TEST: '1'`, `DEBUG_WARP: '1'` vào `env` của webServer server (giữ nguyên `ADMIN_TOKEN`, `PORT`). `tests/fishing.spec.ts` (mới) có T1–T3 dùng `joinAsHost`, hằng số `POND_*`/`DOCK`/`WATER`/`YARD` import từ `@boba/shared` phía Node và `window.__GAME__` để đọc state/gửi message; T2 tự ngắm `debug_warp` trên bờ theo quỹ đạo rơi của lưỡi + tốc độ bơi của loài để câu trúng (server vẫn quyết định va chạm/cắn/kéo); T3 cấp tiền qua admin API `PUT /admin/users/:name/shop` trước khi join. `npx playwright test tests/fishing.spec.ts` PASS 3/3, `npx playwright test` toàn bộ PASS 61/61.
- Bước 6 xong: Docs checked — `README.md` thêm mục "Fishing pond" (Gameplay), dòng Space/hold ở Controls, nút giữ kéo trên mobile (Mobile), env `FISH_SECONDS`/`FISH_TEST`/`DEBUG_WARP` (Dev options). `AGENTS.md` cập nhật Architecture (players có rod/hook, state có `fishPhase/fishTimeLeft/fish`, message `start_fishing/cast/reel/retract/upgrade_rod`, `debug_warp` chỉ khi `DEBUG_WARP=1`, mô phỏng `updateFishing`), Codebase Map (`shared/src/fishing.ts`, `PondView`, `FishingPanel`, `world.ts` có `POND/DOCK/WATER`, `BobaShopRoom` có fishing). Không tìm thấy câu cũ "hai nơi: tiệm trà và nhà hàng" trong README/AGENTS nên không có gì để xoá. `npm run typecheck` PASS (server + client).
Lưu ý: T2/T3 phụ thuộc env test `FISH_TEST=1` (mọi cá là Cá rô luôn cắn) và `FISH_SECONDS=20`; nếu chạy spec này với server dev không có các env đó thì T2 có thể không bắt được cá hiếm và T3 sẽ chờ 10 phút.
- Bước 2 xong: `BobaShopRoom.ts` có section Fishing — `updateFishing(dt)` chạy khi `fishPhase === "fishing"` (đồng hồ, cá bơi trong `fishSim` map nội bộ sync lên `state.fish` mỗi 0.1s, lưỡi `drop` rơi 160px/s + roll `biteChance` mỗi cá một lần mỗi lần thả, `reel` tăng/giảm `reelProgress` theo `rod.reel/fish.hold` và `REEL_DECAY`, thắng → `shopOf(key).earn(price)` vào ví riêng + `catchSeq++` + sinh cá mới, thua/quá 25s → `escapeSeq++`); handlers `start_fishing/cast/reel/retract/upgrade_rod` + `debug_warp` (chỉ đăng ký khi `DEBUG_WARP=1`); guard 2 chiều: `start_shift` từ chối khi đang câu (gửi `InteractFailed`), `start_fishing` từ chối khi `phase === Playing` hoặc không đứng ở ao; `handleUseDoor`/`onLeave`/`releaseName`/`takeOver` gọi `clearHook` (thả cá đang cắn, thu lưỡi). `SharedShop` thêm `rodLevel` + event `rodLevel` + `upgradeRod()` (tự trừ tiền, emit money + rodLevel), `watchWallet` mirror cả `rodLevel` lên `Player`, `onJoin` gán `player.rodLevel`; `parseShopSave` đọc `rodLevel` (clamp 1–5, thiếu = 1). `npm run typecheck` PASS.
- Plan cần Verify mode `full` vì có luồng người chơi mới + đồng bộ 2 người; khi Verify mở 2 phiên cùng phòng, cả hai vào ao, kiểm tra cá hiện giống nhau và dây câu của người kia hiện ở phiên mình.
Lưu ý: `server/src/shop/SharedShop.ts` bị sửa ngay ở bước 1 chỉ để thu hẹp kiểu `PieceInfo.venue` như plan bước 1 yêu cầu ("nơi dùng Area").
Lưu ý: bước 2 phải thêm 1 dòng `rodLevel?: number` vào `ShopSave` ở `shared/src/decor.ts` (ngoài các file plan ghi tên) vì interface định dạng save nằm ở shared — không có nó thì không persist được `rodLevel`; kiểu vẫn tương thích save cũ (trường optional, parse thiếu = 1).

Lưu ý: hình cổng/ao/cá/cần chỉ là hình vẽ tạm bằng code; ảnh thật sẽ thay sau. Các con số cá/cần/giá ở mục "Quyết định đã chốt" là đề xuất để cân bằng sau khi chơi thử.

## Test status
- Lần chạy cuối: `npm run typecheck` (sau bước 6) — PASS (server + client). Bước 6 chỉ sửa docs, không có lệnh test riêng; kết quả test gần nhất (bước 5): `npx playwright test tests/fishing.spec.ts` — PASS 3/3; `npx playwright test` toàn bộ — PASS 61/61 (results.json: expected 61, unexpected 0).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
  - T4 (Verify, 2 người): PASS
- Fail chi tiết: (không có)

## Verify
- Toàn bộ e2e (`npx playwright test`): PASS 61/61; `npm run typecheck`: PASS.
- T1–T3: PASS (cổng vào/ra, câu được cá + tiền vào ví, tổng kết + nâng cấp cần).
- Thêm T4 (`tests/fishing.spec.ts`): 2 phiên cùng phòng vào ao, thấy cùng 10 con cá (cùng id) và host thấy lưỡi câu của khách (`hookState`) — PASS.
- Không chụp ảnh: hình ao/cá chỉ là hình vẽ tạm bằng code, kiểm bằng state qua `window.__GAME__`.
Lưu ý: phần vẽ (cổng, ao, cá, dây câu) chưa được kiểm bằng mắt, chỉ kiểm state/DOM; ảnh thật sẽ thay sau.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
