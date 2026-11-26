# Task: Câu cá mượt hơn (hết giật lag)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Cá bơi, lưỡi câu chìm/kéo, cần câu + dây hiển thị mượt (không giật từng nấc) cho cả người chơi lẫn người xem.

## Ý tưởng
- Nguyên nhân: client vẽ thẳng giá trị schema (patch mặc định 50ms = 20Hz): `hookY` nhảy ~8px/nấc, cần/dây bám `player.x/y` thô thay vì vị trí sprite đã nội suy, cá chỉ được cập nhật mỗi 100ms.
- Client dự đoán giữa hai patch (cá bơi theo `speed*dir`, lưỡi chìm theo `HOOK_SPEED`) rồi kéo nhẹ về giá trị server; dây/cần bám vị trí sprite người chơi đang vẽ.
- Server tăng patch rate lên ~30Hz.

## Quyết định đã chốt
-

## Ngữ cảnh
- `client/src/scenes/PondView.ts`: `update(dt)` làm `view.x += (state.x - view.x) * k` (k = dt*10); `drawLines()` đọc `player.x/y`, `player.hookX/hookY` thẳng từ schema; constructor `(scene, room)`. Fish: `getFish(species).speed` (px/s), bounce trong `WATER.left/right` (giống server `updateFishing`). `HOOK_SPEED`=160 (px/s) và `WATER` đều có trong `@boba/shared`.
- `client/src/scenes/ShopScene.ts`: `this.players: Map<sessionId, PlayerView>`; `view.container.x/y` là vị trí đã vẽ (local = trực tiếp, remote = nội suy). `this.pond = new PondView(this, room)` ở ~dòng 385; `pondRodInfo(sessionId)` ~dòng 739 là mẫu cho accessor test.
- `client/src/testHook.ts`: `GameTestHook` có `pondRod()` đi qua `StationLabelScene.pondRodInfo`; thêm `pondRender()` theo cùng mẫu (cập nhật type `StationLabelScene` ở đầu file).
- `server/src/rooms/BobaShopRoom.ts` ~dòng 304 (`setSimulationInterval`): `patchRate` là property của Room (number|null), đặt `this.patchRate = 1000 / 30;`. `FISH_SYNC_SECONDS` giữ nguyên 0.1.
- Hướng dự đoán: mỗi fish view giữ `x,y,dir` riêng; mỗi frame `x += dir*speed*dt` (bounce ở WATER), rồi `x += (state.x - x) * min(1, dt*8)`; `dir` lấy từ state. Cá `hooked` thì bám `state.x/y` thẳng. Lưỡi: nếu `hookState==="drop"` thì `hookYRender += HOOK_SPEED*dt` rồi kéo về `player.hookY`; trạng thái khác thì bám schema; reset khi hookState đổi/cast mới (`hookX` đổi).
- Test: Playwright không import được module TS của server. Dùng `window.__GAME__` (`room.sessionId`, `state.players.get(id).hookState`, `send(Messages.Cast)`-tương đương: xem `tests/fishing.spec.ts` T2 dòng ~186 cách cast và `enterPond`/`joinAsHost` ở dòng 112/`tests/helpers.ts`). Server test chạy `FISH_TEST=1` (cá luôn cắn).

## Plan
- [x] 1. [vừa] `client/src/scenes/PondView.ts` → `constructor`, `update`, `drawLines`: (a) constructor nhận thêm `playerPos: (id: string) => {x:number;y:number} | undefined`; rod/dây bám vị trí này (fallback schema); (b) cá dự đoán như mục Ngữ cảnh; (c) lưỡi dự đoán `hookYRender` theo Map sessionId; (d) thêm `renderInfo(sessionId)` trả `{ hookY: number | null; fish: {id: string; x: number}[] }` (hookY = giá trị đang vẽ, null nếu không có lưỡi). Sửa `client/src/scenes/ShopScene.ts` (truyền callback từ `this.players`, thêm `pondRenderInfo(sessionId)`) và `client/src/testHook.ts` (thêm `pondRender()` vào `GameTestHook`, `StationLabelScene` và `installTestHook`).
- [x] 2. [dễ] `server/src/rooms/BobaShopRoom.ts` → `onCreate` (cạnh `setSimulationInterval`): `this.patchRate = 1000 / 30;`, cập nhật comment ngay trên đó ("patches go out at ~30Hz"). Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/fishing.spec.ts`: viết T1 bên dưới (thêm cuối file, tái dùng `joinAsHost`, `enterPond`, `uniqueUser`). Chạy: `npx playwright test tests/fishing.spec.ts -g "T27"`; sau đó chạy cả `npx playwright test tests/fishing.spec.ts` để chắc các test cũ vẫn qua.
- [x] 4. [dễ] `README.md`/`AGENTS.md`: chỉ sửa nếu có câu nói patch rate/đồng bộ cá không còn đúng (grep "patch", "100 ms"); không thì ghi "Docs checked: no change needed" vào Trạng thái hiện tại. Sửa comment "100 ms updates" ở đầu class `PondView` nếu còn sai.

## Test cases
- [x] T1. T27 lưỡi câu chìm mượt — hook vẽ đổi vị trí gần như mọi frame (không đứng rồi nhảy) — tests/fishing.spec.ts
  - Setup: 1 phiên, user `uniqueUser()`, `joinAsHost`, `enterPond`, bắt đầu session câu (như T2 hiện có), tên test bắt đầu bằng "T1: T27 ...".
  - Steps: 1. cast (giống T2) · 2. trong `page.evaluate`, mỗi `requestAnimationFrame` đọc `window.__GAME__.pondRender().hookY`, dừng sau 40 frame hoặc khi `state.players.get(sessionId).hookState !== "drop"` · 3. trả mảng mẫu.
  - Assert: có ≥ 20 mẫu; số frame `hookY` bằng frame trước (đứng yên) ≤ 10% số mẫu; không có bước nhảy nào > 6px giữa hai frame liên tiếp (HOOK_SPEED/60 ≈ 2.7px).

## Trạng thái hiện tại
- Bước 1 xong. `PondView`: constructor nhận `playerPos` (ShopScene truyền `view.container.x/y` từ `this.players`, fallback schema); `update` dự đoán cá mỗi frame (`x += dir*speed*dt`, bounce kẹp ở `WATER.left/right`, kéo về schema với `min(1, dt*8)`, cá hooked bám thẳng schema); `predictHookY(id, player, dt)` dự đoán lưỡi: `drop` thì `+HOOK_SPEED*dt` rồi kéo về `player.hookY` với `min(1, dt*8)`, state khác bám schema, reset khi `hookState` đổi hoặc `hookX` đổi (map `hookCasts`/`hookYs`, dọn khi hết câu); `renderInfo(sessionId)` trả `{ hookY, fish }`. `ShopScene` thêm `pondRenderInfo`; `testHook` thêm `pondRender()` (đi qua `pondRenderInfo`, như `pondRod`).
- Selectors: `window.__GAME__.pondRender()` → `{ hookY: number | null; fish: { id: string; x: number }[] }` (client/src/testHook.ts; accessor `pondRenderInfo` ở client/src/scenes/ShopScene.ts, nguồn client/src/scenes/PondView.ts `renderInfo`). Không thêm id/class/DOM nào.
- Bước 2 xong: `BobaShopRoom.onCreate` đặt `this.patchRate = 1000 / 30;` ngay sau `setSimulationInterval`, comment đổi thành "patches go out at ~30Hz (smoother fish/hook for clients)". `FISH_SYNC_SECONDS` giữ nguyên 0.1.
- Bước 3 xong: cuối `tests/fishing.spec.ts` có "T1: T27 the sinking hook moves smoothly every frame (no stalls, no jumps)": cast từ dock, chờ `hookState === "drop"`, rồi trong `page.evaluate` đọc `window.__GAME__.pondRender().hookY` mỗi `requestAnimationFrame` (tối đa 40 mẫu, dừng khi hookState đổi). Assert ≥ 20 mẫu, số frame đứng yên ≤ 10%, bước nhảy giữa hai frame ≤ 6px.
- Bước 4 xong. Docs checked: no change needed — `README.md`/`AGENTS.md` không có câu nào nói patch rate/đồng bộ cá (grep "patch", "100 ms", "Hz" chỉ ra mô tả gameplay, không sai). Comment "100 ms updates" đầu class `PondView` vẫn đúng vì `state.fish` vẫn sync mỗi `FISH_SYNC_SECONDS` = 0.1s; chỉ patch rate chung tăng lên 30Hz.
- Lưu ý: Không sửa comment "100 ms updates" ở đầu `PondView` vì nó nói về sync của `state.fish` (vẫn 0.1s), không phải patch rate chung (nay 30Hz).

## Test status
- Lần chạy cuối: `npm run typecheck` (sau bước 4) — PASS (server + client); `npx playwright test tests/fishing.spec.ts -g "T27"` — PASS (1/1); `npx playwright test tests/fishing.spec.ts` — PASS (12/12).
- Kết quả từng test:
  - T1: PASS (spec "T1: T27 ..." trong tests/fishing.spec.ts)
- Fail chi tiết:

## Verify
- `npm run typecheck`: PASS. Toàn bộ e2e (70 test): PASS.
- T1 (lưỡi câu chìm mượt): PASS.
- Ảnh: không chụp (mượt là hiệu ứng theo thời gian, spec đo từng frame đã kiểm tra; ảnh tĩnh không thể hiện).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
