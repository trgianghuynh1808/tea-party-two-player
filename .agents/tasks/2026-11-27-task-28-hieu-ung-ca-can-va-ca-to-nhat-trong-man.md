# Task: Hiệu ứng cá cắn và "cá to nhất" trong màn tổng kết

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Khi cá cắn câu (hookState chuyển sang "reel") có hiệu ứng rõ ràng: sóng nước lan ra + dấu "❗" trên phao, kèm toast "Cá cắn câu!".
- Màn tổng kết cuối phiên câu hiện "cá to nhất" (loài giá cao nhất mỗi người bắt được trong phiên).

## Ý tưởng
- Server theo dõi `bestCatch` theo từng người (loài có giá cao nhất trong phiên, reset khi phiên mới), đồng bộ qua schema `Player`.
- `PondView` phát hiệu ứng (vòng sóng tween + chữ ❗) khi hook của bất kỳ ai đổi sang "reel"; `FishingPanel` toast cho người cắn và thêm dòng "cá to nhất" vào tổng kết.

## Quyết định đã chốt
-

## Ngữ cảnh
- `shared/src/schema.ts` class `Player`: đã có `fishCaught`, `fishEarned`, `lastCatch`, `catchSeq`, `hookState`. Thêm `@type("string") bestCatch: string = "";` (species id, "" = chưa bắt được).
- `server/src/rooms/BobaShopRoom.ts`: `landFish(sessionId, player, fish, def)` (~dòng 963) — thêm: nếu `!player.bestCatch || def.price > (getFish(player.bestCatch)?.price ?? 0)` thì `player.bestCatch = def.id`. Reset `p.bestCatch = ""` cạnh `p.fishCaught = 0; p.fishEarned = 0;` trong khối "A fresh session zeroes" (~dòng 1015). Bắt cá bắt đầu ở chỗ `player.hookState = "reel"` (~dòng 940).
- `client/src/scenes/PondView.ts`: `drawLines(dt)` lặp qua players; `predictHookY` đã phát hiện đổi state qua `hookCasts` (state/x). Thêm map `lastHookState` theo sessionId; khi chuyển sang "reel" thì tạo hiệu ứng tại `(player.hookX, hookY)`: 2-3 `scene.add.circle`/graphics vòng tròn trắng-xanh nở ra và mờ dần bằng `scene.tweens`, cùng text "❗" bay lên rồi huỷ; depth `LINE_DEPTH`. Đếm số lần hiệu ứng `biteFxCount` (tổng) và trả về trong `renderInfo` thành `biteFx: number` (cập nhật kiểu ở `PondView.renderInfo`, `ShopScene.pondRenderInfo` ~dòng 749, `client/src/testHook.ts` type `pondRender` và 1 chỗ kiểu ở đầu file).
- `client/src/ui/FishingPanel.ts`: `update()` đã có toast cho `catchSeq`/`escapeSeq` (`toast(text)`); thêm theo dõi `me.hookState` chuyển sang "reel" → `toast("❗ Cá cắn câu! Giữ để kéo")`. `updateSummary(state)` dựng các `li` từ players; thêm dòng cá to nhất: `🏆 Cá to nhất: <getFish(bestCatch).name> ($price)` hoặc "chưa bắt được con nào" khi rỗng; có thêm `bestCatch` vào `key` để rebuild đúng. Summary card id `#fishing-summary`. CSS ở `client/src/style.css` (`.fish-card`, `.fishing-toast` ~dòng 1227-1275), chỉ thêm nếu cần.
- Test facts: server test chạy `FISH_SECONDS=20 FISH_TEST=1 DEBUG_WARP=1`, mọi cá là Cá rô (giá 8) luôn cắn. `tests/fishing.spec.ts` đã có helper `snap(page)`, `send(page,type,payload)`, `warp`, `enterPond`, `aimAt`, `uniqueUser`, `joinAsHost` (từ `tests/helpers.ts`); vòng cast tới khi `hookState === "reel"` xem test "T2: cast, bite..." (dòng ~186) — copy mẫu đó. Hook: `window.__GAME__.pondRender()` trả `{hookY, fish, biteFx}` sau thay đổi; `snap().me` có `lastCatch`, `fishCaught` (thêm `bestCatch` nếu cần đọc). Playwright không import được module TS của server.
- Tên bình luận/identifier tiếng Anh, text UI tiếng Việt.

## Plan
- [x] 1. [khó] `shared/src/schema.ts` → `Player.bestCatch`; `server/src/rooms/BobaShopRoom.ts` → `landFish` cập nhật bestCatch theo giá cao nhất và reset ở khối bắt đầu phiên mới. Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/scenes/PondView.ts` → hiệu ứng cá cắn (vòng sóng + ❗) khi hookState của một người chuyển sang "reel"; thêm `biteFx` vào `renderInfo`, `client/src/scenes/ShopScene.ts` → `pondRenderInfo` và `client/src/testHook.ts` → kiểu `pondRender`.
- [x] 3. [vừa] `client/src/ui/FishingPanel.ts` → toast "❗ Cá cắn câu!" khi chuyển sang reel; `updateSummary` thêm dòng "🏆 Cá to nhất" cho từng người (và `client/src/style.css` nếu cần). Chạy `npm run typecheck`.
- [x] 4. [vừa] `tests/fishing.spec.ts` → viết T1, T2 (mở rộng spec có sẵn). Chạy `npx playwright test tests/fishing.spec.ts -g "T28"`.
- [x] 5. [dễ] `README.md` → mục "Fishing pond" (dòng ~84-90): thêm một câu nói cá cắn có hiệu ứng sóng/❗ và tổng kết hiện cá to nhất mỗi người.

## Test cases
- [x] T1. T28 cá cắn có hiệu ứng — khi cá cắn, hiệu ứng sóng phát và toast hiện — tests/fishing.spec.ts
  - Setup: 1 phiên, user `uniqueUser()`, `joinAsHost`, `enterPond`, `send start_fishing`, chờ `fishPhase === "fishing"`.
  - Steps: 1. đọc `pondRender().biteFx` = b0 (số, 0) · 2. vòng cast như test "T2" tới khi `me.hookState === "reel"`.
  - Assert: `pondRender().biteFx` ≥ b0 + 1 (poll); `#fishing-toast` chứa "Cá cắn câu".
- [x] T2. T28 tổng kết hiện cá to nhất — sau phiên 20s, summary có dòng cá to nhất — tests/fishing.spec.ts
  - Setup: user mới, `joinAsHost`, `enterPond`, `start_fishing`.
  - Steps: 1. cast tới khi `reel`, `send reel {holding:true}`, chờ `fishCaught === 1`, thả reel · 2. chờ `fishPhase === "ended"` (timeout 40s).
  - Assert: `#fishing-summary` chứa "Cá to nhất" và "Cá rô". (Phiên không bắt được gì thì không test; test này luôn bắt 1 con trước khi hết giờ — nếu 20s không đủ, đặt `test.setTimeout(90_000)` và bắt sớm.)

## Trạng thái hiện tại

- Bước 1 xong: thêm `Player.bestCatch` (schema, `""` = chưa bắt) ở `shared/src/schema.ts`; `landFish` cập nhật `bestCatch` khi giá cá mới cao hơn giá loài hiện tại, reset `p.bestCatch = ""` cạnh `fishCaught/fishEarned` trong khối bắt đầu phiên mới (`server/src/rooms/BobaShopRoom.ts`). `npm run typecheck` PASS (server + client).
- Bước 2 xong: `PondView` có map `lastHookState` theo sessionId; khi hook ai đó chuyển sang "reel" thì `spawnBiteFx(player.hookX, player.hookY)` — 3 vòng tròn trắng-xanh nở ra + mờ dần (tween, huỷ khi xong) + text "❗" bay lên rồi huỷ, depth `LINE_DEPTH`; đếm tổng trong `biteFxCount` và trả `biteFx` trong `renderInfo`. Kiểu đã cập nhật ở `PondView.renderInfo`, `ShopScene.pondRenderInfo`, `testHook.ts` (`StationLabelScene.pondRenderInfo` + `GameTestHook.pondRender`). `npm run typecheck` PASS.
- Bước 3 xong: `FishingPanel.update()` theo dõi `me.hookState` (reset trong `setArea` để không phát lại toast cũ khi quay lại pond) — chuyển sang "reel" thì `toast("❗ Cá cắn câu! Giữ để kéo")`; `updateSummary` thêm dòng `li` "🏆 Cá to nhất: <tên> ($giá)" (hoặc "chưa bắt được con nào") cho từng người, `bestCatch` nằm trong key rebuild qua rows. `style.css` không cần sửa (`.stats`/`.fish-card`/`.fishing-toast` đủ dùng). `npm run typecheck` PASS.
- Bước 4 xong: `tests/fishing.spec.ts` có helper `pondRender` (đọc `biteFx`) và `castUntilBite`, cùng 2 test `T1: T28 ...`, `T2: T28 ...` đúng theo Test cases. `npx playwright test tests/fishing.spec.ts -g "T28"` PASS 2/2 (2.8s và 22.2s).
- Lưu ý: server test chạy `FISH_TEST=1` nên mọi cá đều là Cá rô; logic "cá to nhất theo giá" khi có nhiều loài khác giá chưa được test e2e (chỉ kiểm tra dòng tổng kết với Cá rô).
- Bước 5 xong: `README.md` mục "Fishing pond" nói khi cá cắn có sóng + ❗ + toast "Cá cắn câu!", và tổng kết cuối phiên hiện cá to nhất (giá cao nhất) mỗi người. Docs checked: AGENTS.md không cần đổi (không có hành vi/protocol/control mới). `npm run typecheck` PASS.
- Selectors: #fishing-toast, #fishing-summary, #fishing-hold (client/src/ui/FishingPanel.ts).

## Test status
- Lần chạy cuối: `npm run typecheck` PASS sau bước 5 (bước 5 chỉ sửa README, không có lệnh test riêng); lần chạy Playwright gần nhất `npx playwright test tests/fishing.spec.ts -g "T28"` PASS 2/2 sau bước 4.
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
- Fail chi tiết:

## Verify
- Cả bộ e2e: 72 passed; `npm run typecheck` PASS.
- T1 PASS (toast "Cá cắn câu! Giữ để kéo" hiện, `biteFx` tăng) — ảnh `.agents/screenshots/task-28-bite-effect.png`.
- T2 PASS (summary có "Cá to nhất" + Cá rô).
- Lưu ý: vòng sóng khó thấy trên ảnh tĩnh; chỉ kiểm bằng bộ đếm `biteFx`. Logic cá to nhất theo giá nhiều loài chưa test e2e.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
