# Task: Khách cùng phòng cũng trang trí được (giống xây)

APPROVED_BY_MANAGER

Verify mode: full
<!-- none: refactor/đổi chữ/không ảnh hưởng UI · light: mặc định · full: luồng người dùng mới, nhiều người dùng, logic đồng bộ -->

## Mục tiêu
- Người chơi vào phòng (không phải chủ phòng) mở được chế độ Trang trí và mua/đặt đồ mới vào quán của chủ phòng, tiền trừ ví của khách.
- Khách chỉ được thêm đồ mới; di chuyển / xoay / bán đồ có sẵn vẫn chỉ chủ phòng (giống xây: khách chỉ xây ô trống, không dỡ).

## Ý tưởng
- Server: `SharedShop.buy` nhận thêm `payer` (như `build`); `handleBuyDecoration` cho khách, trừ ví khách. `move`/`sell` vẫn host-only. Vẫn chỉ trang trí ngoài ca.
- Client: bật nút Trang trí cho khách; DecorController khách không chọn/kéo/xoay đồ đã đặt; DecorPanel hiện ghi chú cho khách giống BuildPanel.

## Quyết định đã chốt
-

## Ngữ cảnh
- `server/src/shop/SharedShop.ts:178` `buy(kind, x, y, rotation)`: kiểm `this.money < def.price`, trừ `this.money`, emit `money` + `added`, `scheduleSave`. Mẫu cần theo: `build(..., payer: SharedShop = this)` (dòng ~328): `guest = payer !== this`, kiểm `payer.money`, `payer.money -= cost`, `payer.emit({type:"money", money: payer.money})`, `if (guest) payer.scheduleSave()`.
- `server/src/rooms/BobaShopRoom.ts` ~1556-1580: `decorateBlockedReason(client)` (hiện chặn mọi người không phải host + chặn khi `GamePhase.Playing`), `handleBuyDecoration`, `handleMoveDecoration`, `handleSellDecoration`. `handleBuildTiles` (~1362) lấy payer bằng `shopOf(this.sessionNames.get(client.sessionId))`. Tách: `decorateBlockedReason(client, hostOnly: boolean)`: luôn chặn khi Playing; chỉ chặn non-host khi `hostOnly`. Buy dùng `hostOnly=false`, move/sell dùng `true`. Thông báo lỗi giữ nguyên.
- `client/src/main.ts` ~558 `updateDecorateBtn`: `decorateBtn.disabled = playing || !amHost || inYard || inPond;` và title cho `!amHost` → bỏ `!amHost` khỏi disabled; title khách: `Trang trí giúp ${host} (ngoài giờ ca), tiền trừ ví của bạn, chỉ thêm đồ mới`.
- `client/src/scenes/DecorController.ts`: `setDraggable(view, enabled)` (~360), `onDragStart` (~371), handler R-xoay (~295-320, dùng `selectedId`), click sàn `select(null)` (~343). Thêm `private isHost()` giống `BuildController.isHost()` (`!!this.room.state.players?.get(this.room.sessionId)?.host`); khách: `setDraggable` luôn tắt (đồ đã đặt không kéo/chọn được), không gửi `MoveDecoration`/`SellDecoration`. Kéo đồ mới từ palette (`Messages.BuyDecoration`, ~482) vẫn dùng bình thường; xoay ghost bằng R vẫn được.
- `client/src/ui/DecorPanel.ts`: `moneyLabel` + listen `money` đã theo ví của người chơi hiện tại. Thêm `guestNote` (`p.hint`, hidden mặc định) như `BuildPanel.ts` (~78) và `$.listen(player, "host", host => guestNote.hidden = host)`; chữ: `Bạn đang trang trí giúp ${room.state.hostName || "chủ phòng"}: tiền trừ vào ví của bạn, chỉ thêm đồ mới (không di chuyển, không bán).`
- Test facts: `window.__GAME__.room.roomId`, `.room.sessionId`, `.send(type, payload)`, `.state.players.get(sessionId).money|host`, `.state.decorations` (ArraySchema, `.length`). Tiền: `PATCH ${TEST_SERVER_URL}/admin/users/<name>/money` body `{set:N}` header `Authorization: Bearer test-admin-token` (`tests/ports.ts` có `TEST_SERVER_URL`). Phiên thứ 2 vào phòng: `guest.goto("/?test=1&room=<roomId>")` rồi nhập tên + submit (xem `tests/build-parity.spec.ts` ~150-160 cho đúng thao tác, phòng riêng chấp nhận khi server e2e có `DEBUG_WARP=1`). Playwright không import được module TS của server. Mua: `send("buy_decoration", {kind, x, y})` — lấy `kind` + toạ độ đặt được từ `DECORATION_CATALOG` / `canPlaceDecoration` của `@boba/shared` (import được ở test, xem `tests/decor-catalog.spec.ts`); chọn món rẻ nhất trong quán trà. Nút Trang trí: `decorateBtn` (đọc id trong `client/index.html`/`main.ts`), bật khi `area === "shop"` hoặc `"restaurant"` và không trong ca.
- Docs: README mục Decorating & saving + AGENTS.md (dòng "Build mode and decorate mode must behave the same way" + Architecture nếu nhắc host-only trang trí) cần sửa cho khớp.

## Plan
- [x] 1. [khó] `server/src/shop/SharedShop.ts` → `buy(...)`: thêm tham số `payer: SharedShop = this`; kiểm tiền/trừ tiền/emit `money` trên `payer`, `payer.scheduleSave()` khi khách (theo mẫu `build`). Rồi `server/src/rooms/BobaShopRoom.ts` → `decorateBlockedReason(client, hostOnly)` + `handleBuyDecoration` (cho khách, payer = `shopOf(key)`), `handleMoveDecoration`/`handleSellDecoration` giữ host-only. Chạy `npm run typecheck`.
- [x] 2. [khó] `client/src/main.ts` → `updateDecorateBtn`: bỏ `!amHost` khỏi `disabled`, đổi title cho khách. `client/src/scenes/DecorController.ts`: `isHost()`; khách không chọn/kéo/xoay/bán đồ đã đặt. `client/src/ui/DecorPanel.ts`: `guestNote` cho khách. Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/guest-decorate.spec.ts`: viết T1, T2 (2 phiên). Chạy `npx playwright test tests/guest-decorate.spec.ts`.
- [x] 4. [dễ] `README.md` (Decorating & saving, Gameplay nếu nhắc chỉ chủ phòng trang trí) và `AGENTS.md` (Code Conventions/Architecture): sửa cho khớp, bỏ câu cũ không còn đúng.

## Test cases
- [x] T1. Khách mua đồ bằng ví của mình — khách mở được Trang trí, mua thành công, trừ ví khách không trừ ví host — tests/guest-decorate.spec.ts
  - Setup: host `joinAsHost(page, uniqueName)`; cấp host $500 và guest $500 qua admin API (guest chưa có shop khi chưa vào → vào phòng trước rồi PATCH, ví mirror live). Guest vào bằng `/?test=1&room=<roomId>`. 2 context.
  - Steps: 1. chờ `state.players.size === 2` trên cả hai · 2. guest: đợi nút Trang trí không disabled (đang ở khu quán, chưa ca) · 3. guest `send("buy_decoration", {kind: <món rẻ nhất>, x, y})` với vị trí hợp lệ · 4. đọc `state.decorations.length` và ví hai bên.
  - Assert: nút Trang trí của guest `toBeEnabled`; sau mua `decorations.length` +1 trên cả host lẫn guest; ví guest = 500 − giá; ví host vẫn 500.
- [x] T2. Khách không di chuyển/bán được đồ có sẵn — move/sell của khách bị từ chối, host vẫn làm được — tests/guest-decorate.spec.ts
  - Setup: như T1; host mua 1 món trước (ví host $500), ghi `id` và vị trí của nó.
  - Steps: 1. guest `send("move_decoration", {id, x: x2, y: y2})` (x2,y2 hợp lệ khác) · 2. guest `send("sell_decoration", {id})` · 3. host `send("move_decoration", ...)`.
  - Assert: sau 1 và 2 đồ vẫn ở vị trí cũ, `decorations.length` không đổi, ví host không đổi; sau 3 vị trí đổi sang (x2,y2).

## Trạng thái hiện tại
- Bước 1 xong: `SharedShop.buy(kind, x, y, rotation, payer = this)` kiểm/trừ tiền trên `payer`, emit `money` trên `payer`, `payer.scheduleSave()` khi khách (theo mẫu `build`). `decorateBlockedReason(client, hostOnly)`: luôn chặn khi `GamePhase.Playing`, chỉ chặn non-host khi `hostOnly`. `handleBuyDecoration` cho mọi người trong phòng, payer = `shopOf(key)`; move/sell giữ host-only, thông báo lỗi giữ nguyên. Không có lệnh test cụ thể cho bước này nên chỉ chạy `npm run typecheck` (PASS).
- Bước 2 xong: `updateDecorateBtn` bỏ `!amHost` khỏi `disabled`, title khách: `Trang trí giúp ${host} (ngoài giờ ca), tiền trừ ví của bạn, chỉ thêm đồ mới`. `DecorController`: thêm `isHost()`; `setDraggable` luôn tắt cho khách (đồ đã đặt không kéo/chọn được) + guard `isHost()` trong `onDragStart`; kéo đồ mới từ palette và R-xoay ghost vẫn dùng bình thường (không gửi `MoveDecoration`/`SellDecoration` từ khách). `DecorPanel`: `guestNote` (`.hint`, hidden theo flag `host`) như BuildPanel. Không có lệnh test cụ thể cho bước này nên chỉ chạy `npm run typecheck` (PASS).
- Selectors: `#decorate-btn` (client/index.html:70, hành vi trong client/src/main.ts:563), `#decor-panel` + guestNote `#decor-panel .hint` (client/index.html:76, dựng trong client/src/ui/DecorPanel.ts)
- Bước 3 xong: thêm `tests/guest-decorate.spec.ts` với T1, T2 (2 browser context): guest vào phòng host bằng `/?test=1&room=<roomId>`, warp vào trong tiệm (`debug_warp` + `SHOP_ENTRY_SPAWN`) để nút Trang trí bật; cấp tiền qua admin API sau khi guest đã vào phòng. T1 mua món rẻ nhất (`photo_cat`, $25) bằng ví guest; T2 guest move/sell đồ host đã đặt bị từ chối rồi host move thành công. `decorSpot` chỉ thử toạ độ bội số `DECOR_GRID` vì server snap vị trí. Lưu ý: test chưa mô phỏng thao tác kéo chuột trong `DecorController`; chỉ kiểm server qua `window.__GAME__` và trạng thái nút Trang trí (Verify phase kiểm giao diện thật). Chạy `npm run typecheck` PASS và `npx playwright test tests/guest-decorate.spec.ts` PASS (2/2).
- Bước 4 xong: cập nhật `README.md` (Rooms & usernames: khách chỉ thêm đồ, tiền trừ ví khách, move/xoay/bán vẫn host; Restaurant: khách thêm đồ vào phòng ăn; Decorating & saving: mô tả đúng quyền của khách và nguồn tiền) và `AGENTS.md` (Architecture mô tả `decorations`; Code Conventions thêm quy tắc chia quyền trang trí giống xây). Không có lệnh test riêng cho bước docs nên chỉ chạy `npm run typecheck` (PASS). Docs checked: README + AGENTS updated.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS (sau bước 4); lần chạy e2e gần nhất `npx playwright test tests/guest-decorate.spec.ts` PASS (2/2, sau bước 3).
- Kết quả từng test:
  - T1: PASS (`tests/guest-decorate.spec.ts`)
  - T2: PASS (`tests/guest-decorate.spec.ts`)
- Fail chi tiết:

## Verify
- Cả bộ e2e: 88/88 PASS; `npm run typecheck` PASS. T1: PASS, T2: PASS.
- Mục tiêu 1 (khách mở Trang trí, mua bằng ví khách): PASS (T1 + ảnh `.agents/screenshots/task-40-guest-decorate.png`: nút Trang trí bật, panel hiện ghi chú khách và "Ví của bạn").
- Mục tiêu 2 (khách không move/bán): PASS (T2, server từ chối).
- Lưu ý: đoạn hướng dẫn chung trong DecorPanel vẫn nhắc "kéo đồ để di chuyển/bán" dù khách không làm được (ghi chú khách đã nói rõ), không chặn.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
