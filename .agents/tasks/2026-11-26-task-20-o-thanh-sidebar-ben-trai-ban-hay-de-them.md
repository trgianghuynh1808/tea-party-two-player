# Task: Bảng thông tin cá & cần câu ở sidebar

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Thêm một khối thông tin ở sidebar (`aside.side-panel`) khi người chơi đang ở khu ao cá.
- Phía trên: danh sách các loại cá chia theo độ hiếm (tên, giá, độ hiếm); phía dưới: danh sách các loại cần câu (giá, tốc độ kéo), đánh dấu cần đang dùng.
- Dữ liệu lấy từ `FISH`, `RODS`, `TIER_LABELS` trong `shared/src/fishing.ts`, không nhân đôi hằng số; khi ở ao thì ẩn khung đơn hàng cho đỡ chật.

## Mục tiêu
- Ở sidebar có phần "phân loại cá" (trên) và "phân loại cần câu" (dưới) để người chơi nắm thông tin.
- Chỉ hiện khi người chơi ở ao (area `pond`); ra ngoài thì trở lại khung đơn hàng như cũ.
- Cần đang dùng được làm nổi bật và đổi theo khi nâng cấp cần.

## Quyết định đã chốt
- Hiện khi ở ao (không hiện trong quán/sân) vì ngoài ao thông tin này không dùng đến.
- Chỉ đọc, không có nút bấm; tiếng Việt, tên cá/cần lấy từ `shared`.

## Ngữ cảnh
- `shared/src/fishing.ts`: `FISH: FishDef[]` (`id,name,tier,price,hold,speed,weight`), `FISH_TIERS` (common→mythic), `TIER_LABELS: Record<FishTier,string>`, `RODS: RodDef[]` (`level,name,price,reel,bite[]`), `getRod(level)`.
- `client/index.html` ~dòng 65-78: `<aside class="side-panel">` chứa `#decor-panel`, `#build-panel`, `#orders-panel` (class `panel-section`, `hidden` để ẩn). Thêm `<div id="fish-guide" class="panel-section" hidden></div>` ngay trước `#orders-panel`.
- `client/src/style.css` chứa style `.side-panel` / `.panel-section`; thêm style `.fish-guide` ở đó.
- `client/src/main.ts`: `const fishingPanelRoot = $<HTMLElement>("fishing-panel")` (~dòng 73); `let fishingPanel` (~92); tạo `new FishingPanel(fishingPanelRoot, room)` (~477); `game.events.on(AREA_EVENT, (next: Area) => {... fishingPanel?.setArea(next); })` (~531); dọn dẹp `fishingPanel?.destroy(); fishingPanel = undefined;` (~570). Biến `ordersRoot` là `#orders-panel`.
- Mẫu: `client/src/ui/FishingPanel.ts` có `setArea(area)`, `destroy()`, helper `el(tag, className, text)`, timer `setInterval`. Cấp cần của người chơi: `room.state.players.get(room.sessionId)?.rodLevel`.
- Test facts: hook `window.__GAME__` (`room.roomId`, `room.sessionId`, `send(type,payload)`); `joinAsHost(page, username)` trong `tests/helpers.ts`; vào ao bằng `send("debug_warp", {x: POND_DOOR_X, y: (POND_ENTER_ZONE.top+POND_ENTER_ZONE.bottom)/2})` (xem `enterPond`/`warp` trong `tests/fishing.spec.ts`, server test chạy `DEBUG_WARP=1`); ra ao bằng warp vào `POND_EXIT_ZONE`. Playwright không import được module TS của server (chỉ `@boba/shared`). Cấp tiền: admin API `ADMIN_TOKEN=test-admin-token` (xem T3 trong `tests/fishing.spec.ts`).

## Plan
- [x] 1. [vừa] `client/src/ui/FishGuide.ts` → class `FishGuide(root, room)`: `setArea(area)` (hiện khi `pond`), `destroy()`; render 2 khối: `<section data-testid="fish-guide-fish">` nhóm cá theo `FISH_TIERS` (tiêu đề `TIER_LABELS`, mỗi cá một dòng `data-fish="<id>"`: tên + giá), `<section data-testid="fish-guide-rods">` mỗi cần một dòng `data-rod="<level>"` (tên, giá, tốc độ `reel`); timer ~300ms gắn `data-current="true"` cho dòng cần = `rodLevel` của người chơi. Thêm `#fish-guide` vào `client/index.html` và style `.fish-guide` vào `client/src/style.css`.
- [x] 2. [vừa] `client/src/main.ts` → khởi tạo `FishGuide` cạnh `FishingPanel`, gọi `setArea(next)` trong handler `AREA_EVENT`, `destroy()` khi rời phòng; khi `next === "pond"` thì `ordersRoot.hidden = true` và khôi phục khi ra ngoài. Cập nhật `AGENTS.md` (Codebase Map, thêm `FishGuide` vào danh sách `client/src/ui/`) và `README.md` mục Gameplay/ao cá nếu có nhắc sidebar. Ghi dòng `Selectors:` vào "Trạng thái hiện tại".
- [x] 3. [vừa] `tests/fishing.spec.ts` → thêm test T1; ĐỌC dòng `Selectors:` trong Trạng thái hiện tại (selector bên dưới chỉ là ví dụ). Chạy: `npx playwright test tests/fishing.spec.ts -g "T4"`.
- [x] 4. [dễ] `npm run typecheck` rồi `npx playwright test tests/fishing.spec.ts` — sửa lỗi nếu có.

## Test cases
- [x] T1. Bảng cá/cần chỉ hiện ở ao — sidebar liệt kê đủ cá theo độ hiếm + cần, tự ẩn khi ra ngoài — tests/fishing.spec.ts (đặt tên test "T4: ..." để lọc `-g "T4"`)
  - Setup: user duy nhất `p1-${Date.now().toString(36)}-${userSeq++}`, 1 phiên, `joinAsHost`.
  - Steps: 1. Lúc ở sân, kiểm tra `#fish-guide`. 2. `enterPond(page)` rồi đọc `#fish-guide`. 3. `exitPond(page)` rồi đọc lại.
  - Assert: 1. `#fish-guide` ẩn, `#orders-panel` hiện. 2. `#fish-guide` hiện; số dòng `[data-fish]` = `FISH.length` (import `FISH`, `RODS` từ `@boba/shared`); số dòng `[data-rod]` = `RODS.length`; khối cá nằm trên khối cần (boundingBox y nhỏ hơn); dòng `[data-rod="1"]` có `data-current="true"`; `#orders-panel` ẩn. 3. `#fish-guide` ẩn lại, `#orders-panel` hiện.

## Trạng thái hiện tại
- Bước 1 + 2 xong: `FishGuide` đã wired vào `client/src/main.ts` (khởi tạo cạnh `FishingPanel`, `setArea` trong handler `AREA_EVENT`, `destroy()` trong `stopGame`); ở ao `#fish-guide` hiện và `#orders-panel` ẩn (`ordersRoot.hidden = next === "pond"` trong handler `AREA_EVENT`), ra ngoài thì khôi phục khung đơn hàng. `AGENTS.md` đã thêm `FishGuide` vào danh sách `client/src/ui/`; `README.md` mục "Fishing pond" đã thêm dòng về bảng cá/cần ở sidebar.
- Bước 3 xong: thêm test "T4: the sidebar fish/rod guide only lives at the pond, replacing the orders panel" trong `tests/fishing.spec.ts` (kiểm tra ẩn/hiện ở sân, số dòng `[data-fish]` = `FISH.length`, `[data-rod]` = `RODS.length`, khối cá trên khối cần, `[data-rod="1"]` có `data-current="true"`, `#orders-panel` ẩn ở ao và hiện lại khi ra). Đã chạy đúng lệnh `npx playwright test tests/fishing.spec.ts -g "T4"` — 2 test PASS. `npm run typecheck` PASS. Docs checked: no change needed (bước test không đổi tài liệu). Chưa làm bước 4 theo chỉ định của người giao việc.
- Bước 4 xong: `npm run typecheck` PASS; `npx playwright test tests/fishing.spec.ts` PASS 5/5 (T1, T2, T3, T4 guide, T4 hai người). Không phải sửa lỗi. Docs checked: no change needed.
- Selectors: `#fish-guide`, `#orders-panel` (client/index.html); `[data-testid="fish-guide-fish"]`, `[data-testid="fish-guide-rods"]`, `[data-fish="<id>"]`, `[data-rod="<level>"]`, `[data-rod="<level>"][data-current="true"]`, `.fish-guide-row` (client/src/ui/FishGuide.ts).
- Lưu ý: test mới đặt tên "T4: ..." đúng theo plan nên lệnh `-g "T4"` chạy thêm cả test "T4: two players in the pond..." có sẵn (cả 2 đều PASS); nếu muốn chỉ chạy test mới, dùng tên riêng.
- Lưu ý: lệnh `npx playwright test tests/fishing.spec.ts` chạy cả spec (5 test), đúng theo plan bước 4.

## Test status
- Lần chạy cuối: `npx playwright test tests/fishing.spec.ts` (sau bước 4) — PASS 5/5; `npm run typecheck` — PASS.
- Kết quả từng test:
  - T1: PASS (viết trong `tests/fishing.spec.ts` với tiêu đề "T4: the sidebar fish/rod guide ...") — chạy trong toàn spec bước 4.
- Fail chi tiết:

## Verify
- Chạy cả bộ e2e: 63 passed (1 test mobile-build-ui T1 flaky ở lần đầu, đã pass khi retry); `npm run typecheck` PASS.
- T1 (sidebar chỉ hiện ở ao, đủ cá/cần, cần hiện tại được đánh dấu, ẩn lại khi ra): PASS bằng spec, không cần kiểm tra thị giác thêm.
- Review diff: không có lỗi chặn; docs (README, AGENTS) đã cập nhật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
