# Task: Kéo lưỡi câu lên vẫn có thể dính cá

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Khi người chơi thu lưỡi (hoặc lưỡi chạm đáy), lưỡi không biến mất ngay mà đi ngược lên; nếu trên đường lên móc chạm cá thì cá vẫn có thể cắn (tính là câu trúng, vào minigame kéo như bình thường).

## Ý tưởng
- Thêm `hookState = "rise"` (chuỗi, không đổi schema): `handleRetract` và chạm đáy chuyển `drop` → `rise`; lưỡi đi lên với `HOOK_SPEED`, chạm `WATER.top` thì `clearHook`.
- `updateHookRise` dùng chung logic cắn với `updateHookDrop` (tách hàm `tryHookFish`), cùng `biteRolled` nên mỗi con cá chỉ roll 1 lần mỗi lần thả.
- Client: coi `rise` là lưỡi đang ở dưới nước (vẽ, dự đoán y đi lên, nhãn nút), không gửi thêm lệnh trong lúc `rise`.

## Quyết định đã chốt
-

## Ngữ cảnh
- `server/src/rooms/BobaShopRoom.ts`: `updateFishing` gọi `updateHookDrop` (hookState "drop") / `updateHookReel` ("reel"); `updateHookDrop` tăng `player.hookY += HOOK_SPEED*dt`, duyệt `this.fishSim`, bỏ qua cá có trong `this.biteRolled.get(sessionId)`, khoảng cách `HOOK_RADIUS`, roll `biteChance(player.rodLevel, def.tier)` (bỏ qua nếu `FISH_TEST`), khi cắn: đặt sim/fish x,y = hook, `fish.hooked=true`, `hookedFish`, `hookTimer`, `hookState="reel"`, `reelProgress=REEL_START`, `startReelZone`. Cuối hàm: `if (player.hookY >= WATER.bottom) this.clearHook(...)` → đổi thành `player.hookState = "rise"`. `handleRetract` hiện chỉ nhận "drop" và gọi `clearHook` → đổi thành đặt "rise" (giữ `biteRolled`). `handleCast` chỉ cho phép khi `hookState === ""`.
- `clearHook` xóa `biteRolled`; chỉ gọi khi hook lên tới `WATER.top` (hookY <= WATER.top), khi mất/đổi phiên, hoặc kết thúc.
- `client/src/scenes/PondView.ts`: dòng ~338 (`hookState !== "drop" && !== "reel"` → thêm "rise"), `predictHookY` (~375: chỉ dự đoán cho "drop", thêm "rise" với y -= HOOK_SPEED*dt, kẹp >= WATER.top), `renderInfo` (~446 `hookOut`).
- `client/src/scenes/ShopScene.ts`: `handlePondAction` (~589, "rise" không gửi gì) và nhãn nút (~1107: thêm "rise" → "↩ Đang thu").
- `client/src/ui/FishingPanel.ts`: chỉ nhắc `reel`; kiểm tra xem có chỗ nào cần xử lý "rise" không (có thể không).
- Test: `tests/fishing.spec.ts` có sẵn helper `snap(page)` (me.hookState, me.hookY?, fish[]), `send(page, type, payload)`, `warp`, `aimAt`, `castUntilBite`, `joinAsHost`, `enterPond`, `uniqueUser`; server test chạy với `FISH_TEST=1` (cá luôn là Cá rô, luôn cắn) và `DEBUG_WARP=1`. Thông điệp: `cast`, `retract`, `reel`, `start_fishing`. Hằng số: `HOOK_SPEED`, `WATER`, `DOCK`, `PLAYER_RADIUS` đã import trong spec. Playwright không import được module server TS. Kiểm tra `snap` có trả `hookY` chưa; nếu chưa, thêm vào helper trong spec (đọc từ `__GAME__` đang dùng).
- Docs: tìm mô tả cách câu trong `README.md` (Gameplay/Controls) và `AGENTS.md`; cập nhật nếu có nhắc "thu lưỡi" làm lưỡi biến mất.

## Plan
- [x] 1. [vừa] `server/src/rooms/BobaShopRoom.ts` → tách `tryHookFish(sessionId, player, fishSim loop)` từ `updateHookDrop`; thêm `updateHookRise` (hookY -= HOOK_SPEED*dt, gọi `tryHookFish`, `hookY <= WATER.top` → `clearHook`); `updateFishing` gọi nó cho `hookState === "rise"`; `handleRetract` và chạm đáy chuyển sang "rise" thay vì `clearHook`.
- [x] 2. [vừa] `client/src/scenes/PondView.ts` → coi "rise" là lưỡi đang ra (vòng vẽ ~338, `renderInfo` ~446), `predictHookY` đi lên khi "rise"; `client/src/scenes/ShopScene.ts` → nhãn nút "↩ Đang thu" cho "rise", `handlePondAction` không gửi gì ở "rise". Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/fishing.spec.ts` → viết T1, T2 (xem Test cases). Chạy `npx playwright test tests/fishing.spec.ts -g "T31"` rồi cả `npx playwright test tests/fishing.spec.ts`.
- [x] 4. [dễ] `README.md` → cập nhật phần câu cá (nếu có) cho đúng: thu lưỡi/chạm đáy thì lưỡi đi lên và vẫn có thể dính cá; ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. T31 retract rises — thu lưỡi chuyển sang "rise", hookY giảm dần và về "" khi lên mặt nước — tests/fishing.spec.ts
  - Setup: user duy nhất, `FISH_TEST` có sẵn; `joinAsHost`, `enterPond`, `start_fishing`, đợi `fishPhase === "fishing"`; warp sát bờ trái dock (`HOOK_SAFE_LEFT`, `DOCK_CAST_Y`) để ít cá chạm.
  - Steps: 1. `send cast`, poll `hookState === "drop"` 2. `send retract` ngay khi hookY > WATER.top + 20 3. đọc 2 snapshot cách 200ms.
  - Assert: hookState là "rise" (hoặc "reel" nếu vô tình dính cá — khi đó retry); hookY snapshot sau < snapshot trước; cuối cùng poll hookState `""` (hoặc "reel").
- [x] T2. T31 bite on the way up — cá chạm móc khi lưỡi đang đi lên vẫn cắn — tests/fishing.spec.ts
  - Setup: như T1.
  - Steps: 1. vòng lặp tối đa ~12 lần: warp tới x của một cá rô gần (dùng `aimAt` cho lúc hook quay lại lane của cá: x cá dự đoán sau `(hookY − f.y)/HOOK_SPEED` giây), cast, poll tới khi hookY > f.y + 30 và hookState "drop", `send retract` 2. sau mỗi lần poll tới khi hookState khác "rise".
  - Assert: ít nhất một lần chuỗi trạng thái quan sát được là "rise" → "reel" (ghi lại hookState từng snapshot); khi "reel" thì `#fishing-reel` hiện. Nếu cả 12 lần đều không đạt thì fail.

## Trạng thái hiện tại
- Bước 1 xong: server tách `tryHookFish`, thêm `updateHookRise`; `handleRetract` và chạm đáy chuyển `hookState = "rise"` (giữ `biteRolled`) thay vì `clearHook`. `npm run typecheck` pass.
- Bước 2 xong: PondView vẽ/dự đoán "rise" (đi lên, kẹp `WATER.top`), `renderInfo` coi "rise" là lưỡi đang ra; ShopScene nhãn "↩ Đang thu", `handlePondAction` không gửi gì ở "rise". `npm run typecheck` pass.
- Bước 3 xong: thêm `hookX`/`hookY` vào `snap`, viết T31 T1 và T2. T2 dùng vòng lặp kín (chờ cá sắp bơi vào đường dây đúng lúc lưỡi đi lên rồi mới thu) thay vì dự đoán từ xa, ổn định hơn. `npx playwright test tests/fishing.spec.ts -g "T31"` chạy 5 lần: 10/10 pass.
- Lưu ý: chạy cả `tests/fishing.spec.ts` có 2 test cũ flaky không liên quan (`T27 sinking hook smooth` lỗi maxJump > 6, `T30 T1 real reel zone` lỗi reelPos < 0.3). Đã kiểm chứng cả hai fail y hệt trên code base commit `c918642` (trước thay đổi của task này), nên không phải do task gây ra; không sửa vì ngoài phạm vi plan.
- Bước 4 xong: README mục Fishing pond và Controls ghi rõ thu lưỡi/chạm đáy thì lưỡi đi lên và vẫn có thể dính cá. Docs checked: AGENTS.md không có câu nào nói thu lưỡi làm lưỡi biến mất nên không cần sửa.
- Selectors: `#fishing-reel`, `#reel-zone`, `#reel-marker` (client/src/ui/FishingPanel.ts); nhãn nút hành động qua `touch.setAction`/`actionHint` (client/src/scenes/ShopScene.ts, không có id DOM riêng).

## Test status
- Lần chạy cuối: `npx playwright test tests/fishing.spec.ts -g "T31" --repeat-each=5` → 10/10 pass; `npx playwright test tests/fishing.spec.ts` → 20 passed, 1 failed (T27, test cũ flaky).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
- Fail chi tiết: T27 `maxJump` và T30 T1 `reelPos` là test cũ flaky, đã tái hiện trên base `c918642` (xem "Lưu ý"), không liên quan thay đổi "rise".

## Verify
- typecheck: PASS. Cả bộ e2e: 77 passed, 2 failed (T27 sinking hook, T30 T1 real reel — flaky cũ, đã tái hiện trên base c918642, không liên quan).
- T1 (retract → rise): PASS. T2 (rise → reel): PASS.
- Ảnh: không chụp (hook đi lên chỉ là chuyển động ngắn, spec đã kiểm tra hookY/hookState và #fishing-reel).

VERIFY: PASS
## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
