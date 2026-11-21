# Task: Ưu tiên trạm đang quay mặt tới khi chọn trạm tương tác

Verify mode: light

## Mục tiêu
Đứng giữa lối đi giữa hai hàng trạm (vd. nồi `r_boil_1` ở y=145 và máy xay `r_blend_1` ở y=290, lối đi rộng 85px), game chọn trạm gần nhất nên nửa lối đi phía dưới luôn chọn máy xay; người chơi cầm đĩa bò tới nồi lấy khoai nhưng bấm Space thì không có gì xảy ra. Cho trạm nằm phía người chơi đang quay mặt tới được ưu tiên, để quay lên là chọn nồi, quay xuống là chọn máy xay.

## Quyết định đã chốt
- Không đổi layout, không đổi `INTERACT_RANGE` (70), không đổi luật `planInteraction`/`planKitchen`.
- Thuật toán chọn: trong các trạm trong `INTERACT_RANGE`, so sánh "khoảng cách hiệu dụng" = `distanceToStation(p, def) - FACING_BIAS` nếu điểm gần nhất của trạm nằm phía trước hướng quay (tích vô hướng giữa vector từ người chơi tới điểm gần nhất và vector hướng > 0), ngược lại bằng khoảng cách thường. `FACING_BIAS = 30`. Không truyền `facing` thì hành xử y như cũ.
- Chỉ áp dụng cho trạm (`stationsAt`). Bàn có khách và giường giữ nguyên so khoảng cách thường.
- Một nguồn luật duy nhất trong `shared/` để client (highlight/preview) và server dùng chung; không nhân đôi hằng số.

## Ngữ cảnh
- `shared/src/index.ts`:
  ```ts
  export const INTERACT_RANGE = 70;
  export type Direction = "up" | "down" | "left" | "right";
  export function distanceToStation(p: Vec2, s: StationDef): number // dòng ~226
  export function findNearestStationDef(p: Vec2): StationDef | undefined // dòng ~236
  export function findInteractTarget(p: Vec2, tables: Iterable<PlacedDecoration>, beds: Iterable<BedSpot> = []): InteractTarget | undefined // dòng ~330
  ```
  Cả hai hàm đều lặp `stationsAt(p)`, giữ `bestDist` khởi tạo = `INTERACT_RANGE`, chọn `d <= bestDist`.
- Gọi `findInteractTarget`:
  - Server `server/src/rooms/BobaShopRoom.ts:861`: `findInteractTarget(player, tablesWaiting(...), bedSpots(...))`, `player.direction` là `string` ("up"|"down"|"left"|"right") trong schema.
  - Client `client/src/scenes/ShopScene.ts:990` (`updateStationHighlight`): `findInteractTarget(local.container, tables, beds)`; hướng của người chơi cục bộ là `this.localDirection` (cùng giá trị client gửi trong `Messages.Position`).
- `findNearestStationDef` chỉ được `tests/restaurant-layout.spec.ts` T7 gọi (không truyền facing, phải giữ nguyên kết quả).
- Tái hiện lỗi: đứng tại local (750, 218) trong bếp nhà hàng (toạ độ local = world x − 1400): `r_boil_1` (750,145, cao 60) cách 43px, `r_blend_1` (750,290) cách 42px → hiện chọn `r_blend_1`. Đứng ở y=198 thì chọn nồi.
- Cặp thùng cùng cột (khe 40px) để test e2e: `r_crate_shrimp` (31,434) và `r_crate_egg` (31,522); đứng tại local (31, 477) cách mỗi thùng 20px. Đã có `walkRestaurantPath(page, waypoints, dir)`, `joinAsHost`, `startRestaurantShift`, `uniqueUser` trong `tests/restaurant-layout.spec.ts` / `tests/helpers.ts`.
- Test hook: `window.__GAME__.send("position", { x, y, direction, teleportSeq })` và `send("interact")`; đọc `state.players.get(room.sessionId).heldItem`.

## Plan
- [x] 1. [vừa] `shared/src/index.ts` → thêm `FACING_BIAS = 30` và helper dùng chung (vd. `stationScore(p, def, facing?)`: trả khoảng cách hiệu dụng); thêm tham số tuỳ chọn `facing?: string` vào `findNearestStationDef(p, facing?)` và `findInteractTarget(p, tables, beds, facing?)`. Chỉ vòng lặp trạm dùng score mới; `bestDist` so sánh theo score (vẫn lọc trạm có khoảng cách thật ≤ `INTERACT_RANGE`); bàn/giường giữ nguyên. Hướng không hợp lệ hoặc `undefined` → không bias. Chạy `npm run typecheck`.
- [x] 2. [dễ] `server/src/rooms/BobaShopRoom.ts` (dòng ~861) truyền `player.direction` làm tham số `facing`; `client/src/scenes/ShopScene.ts` (`updateStationHighlight`, dòng ~990) truyền `this.localDirection`. Không đổi gì khác. Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/restaurant-layout.spec.ts` → viết T1 (test Node) và T2 (e2e) theo "Test cases"; tick T1, T2.
- [x] 4. [dễ] Chạy `npm run typecheck`, `npx playwright test tests/restaurant-layout.spec.ts -g "T1[0-9]|T11|T12"` (dùng tên test thực tế của hai test mới), rồi `npx playwright test` toàn bộ; ghi kết quả từng test vào "Test status".

## Test cases
- [x] T1. Chọn trạm theo hướng quay mặt — tại local (750,218): không truyền facing → `r_blend_1`; facing "up" → `r_boil_1`; facing "down" → `r_blend_1`; tại local (31,477): "up" → `r_crate_shrimp`, "down" → `r_crate_egg`; T7 (không facing) vẫn PASS — tests/restaurant-layout.spec.ts (spec test "T11", vì T1–T10 đã dùng trong file này)
- [x] T2. Server chọn đúng theo hướng — 2 context độc lập, mỗi context tạo phòng riêng và bắt đầu ca nhà hàng; đi tới local (31,477) rồi bấm interact: bên quay "up" cầm `food:shrimp`, bên quay "down" cầm `food:egg` — tests/restaurant-layout.spec.ts (spec test "T12")

## Trạng thái hiện tại
- Bước 1 xong (commit 5008eaf): `shared/src/index.ts` có `FACING_BIAS = 30`, helper `stationScore(p, def, facing?)`, và tham số `facing?: string` ở `findNearestStationDef` / `findInteractTarget`. Không truyền `facing` (hoặc hướng không hợp lệ) → hành xử y như cũ; vòng lặp bàn/giường không đổi; trạm vẫn lọc khoảng cách thật ≤ `INTERACT_RANGE`. `npm run typecheck` PASS.
- Bước 2 xong (commit ec4afae): server `handleInteract` truyền `player.direction`, client `updateStationHighlight` truyền `this.localDirection` vào `findInteractTarget`; không đổi gì khác. `npm run typecheck` PASS.
- Bước 3 xong (commit c73dbb9): viết 2 test trong `tests/restaurant-layout.spec.ts` — test case T1 → spec "T11" (Node: tại local (750,218) không facing → `r_blend_1`, "up" → `r_boil_1`, "down" → `r_blend_1`; tại local (31,477) "up" → `r_crate_shrimp`, "down" → `r_crate_egg`), test case T2 → spec "T12" (e2e: 2 context độc lập, mỗi context phòng riêng + `startRestaurantShift`, đi tới local (31,477), interact → "up" cầm `food:shrimp`, "down" cầm `food:egg`). Đặt tên T11/T12 vì T1–T10 đã tồn tại trong spec (bước 4 grep theo `T11|T12`). `npm run typecheck` PASS (lưu ý: `tests/` không thuộc include của tsconfig server/client, spec sẽ do Playwright biên dịch khi chạy ở bước 4).
- Bước 4 xong: `npm run typecheck` PASS; `npx playwright test tests/restaurant-layout.spec.ts -g "T11|T12"` (tên thực tế của hai test mới) → 2/2 PASS; `npx playwright test` toàn bộ → 15/15 PASS (53.6s). Không còn dev server/browser sót (đã kiểm tra port 2567/5173, không có `.playwright-mcp/`). Không có thay đổi code ở bước này.

## Test status
- Lần chạy cuối: `npx playwright test` toàn bộ — 15/15 PASS (53.2s).
- Kết quả từng test:
  - T1 (spec "T11" + "T7" trong `tests/restaurant-layout.spec.ts`): PASS — chọn trạm theo hướng quay mặt tại local (750,218) và (31,477) đúng như "Test cases"; T7 (không facing) vẫn PASS.
  - T2 (spec "T12" trong `tests/restaurant-layout.spec.ts`): PASS — 2 context độc lập tại local (31,477): quay "up" cầm `food:shrimp`, quay "down" cầm `food:egg`.
  - Các spec còn lại trong suite (`tests/orders-panel.spec.ts` T1–T3, `tests/restaurant-layout.spec.ts` T1–T10): 13/13 PASS.
- Fail chi tiết: không có (15/15 PASS).

## Verify
- Mục tiêu (ưu tiên trạm nằm phía người chơi đang quay mặt tới khi chọn trạm tương tác): PASS (kiểm chứng qua spec T11, T12).
- T1 (Chọn trạm theo hướng quay mặt tại local (750,218) và (31,477), T7 giữ nguyên): PASS — đã kiểm tra đầy đủ bằng spec `T11` và `T7` trong `tests/restaurant-layout.spec.ts` (không dùng screenshot vì spec đã cover toàn bộ).
- T2 (Server chọn đúng theo hướng với 2 context độc lập tại local (31,477)): PASS — đã kiểm tra đầy đủ bằng spec `T12` trong `tests/restaurant-layout.spec.ts` (không dùng screenshot vì spec đã cover toàn bộ).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
