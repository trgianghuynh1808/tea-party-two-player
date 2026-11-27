# Task: T29 Sổ cá — lưu loài đã bắt theo username, hiện trong FishGuide

APPROVED_BY_MANAGER

Verify mode: full

## Mục tiêu
- Mỗi lần bắt được cá, loài đó được ghi vào "sổ cá" của username và lưu bền (qua restart/phòng khác).
- FishGuide (sidebar ở hồ) đánh dấu loài đã bắt (icon sáng + số lần bắt), loài chưa bắt hiện mờ/"?" và có dòng tổng "Đã bắt X/Y loài".

## Ý tưởng
- `SharedShop` giữ `caught: Record<speciesId, count>`, lưu trong `ShopSave.caught` (parse an toàn, save cũ = rỗng); `landFish` gọi `shop.recordCatch(def.id)`.
- Mirror sang `Player.caughtLog` (string schema, dạng `"ca_ro:3,ca_chep:1"`) qua `ShopEvent {type:"caught"}`, giống cách `rodLevel` được mirror.
- `FishGuide.update()` đọc `caughtLog` của người chơi local, đánh dấu từng hàng `[data-fish]`.

## Quyết định đã chốt
-

## Ngữ cảnh
- `shared/src/decor.ts` ~l.398 `ShopSave` (thêm `caught?: Record<string, number>`). `shared/src/schema.ts` ~l.28 `Player` (thêm `@type("string") caughtLog: string = ""` gần `rodLevel`).
- `shared/src/fishing.ts`: `FISH`, `getFish(id)`. Thêm helper chung ở đây: `encodeCaught(rec): string` và `parseCaught(s): Record<string, number>` (dạng `"id:n,id:n"`, bỏ id không có trong FISH, n nguyên >= 1).
- `server/src/shop/SharedShop.ts`: `ShopEvent` union (l.~65) thêm `{ type: "caught"; log: string }`; thêm field `caught: Record<string, number> = {}`; method `recordCatch(id)` (tăng đếm, `emit`, `scheduleSave()`); `snapshot()` (~l.445) ghi `caught`; `apply()` (~l.515) đọc `save.caught ?? {}`.
- `server/src/persistence/ShopStore.ts` `parseShopSave` (~l.270): thêm `caught` đã lọc (id hợp lệ trong FISH, đếm số nguyên >= 1). Nhớ PUT `/admin/users/<u>/shop` cũng đi qua hàm này.
- `server/src/rooms/BobaShopRoom.ts`: join (~l.348) đặt `player.caughtLog = encodeCaught(shopOf(key).caught)`; `watchWallet` (~l.505) thêm nhánh `event.type === "caught"`; `landFish` (~l.964) gọi `shopOf(key).recordCatch(def.id)` khi có `key`.
- `client/src/ui/FishGuide.ts`: hàng cá `row.dataset.fish = fish.id`, icon `img.fish-guide-icon`; `update()` chạy mỗi 300ms ở hồ. Thêm: `row.dataset.caught="true"` + số lần `×n` (span `.fish-guide-count`) khi đã bắt; chưa bắt thì không có `data-caught` (CSS làm icon mờ/xám `filter: grayscale(1) brightness(.5)`); h2 "🐟 Các loại cá" thêm span `data-testid="fish-guide-progress"` text `Đã bắt X/Y loài`. CSS: tìm `.fish-guide-row` trong `client/` (style.css / index.html).
- Test facts: `window.__GAME__.room.state.players.get(room.sessionId).caughtLog`; helper trong `tests/fishing.spec.ts`: `joinAsHost(page, uniqueUser())`, `enterPond`, `send(page,"start_fishing")`, `castUntilBite(page)`, `send(page,"reel",{holding:true})`, `snap(page)`; cấp dữ liệu/tiền: `request.put(\`${TEST_SERVER_URL}/admin/users/${encodeURIComponent(user)}/shop\`, {headers:{Authorization:"Bearer test-admin-token"}, data:{money:0, decorations:[], caught:{ca_ro:2}}})` TRƯỚC khi join. Phiên 2 vào cùng phòng: `/?test=1&room=<roomId>` (`room.roomId`). Playwright không import được module TS của server. Server test chạy `FISH_TEST=1`: mọi cá là Cá rô (id kiểm tra trong `shared/src/fishing.ts`, test T2 hiện có: "Cá rô"), luôn cắn. Persistence: user rejoin (trang mới, cùng username) thì `caughtLog` còn.

## Plan
- [x] 1. [khó] `shared/src/fishing.ts` → thêm `encodeCaught`/`parseCaught`; `shared/src/decor.ts` → `ShopSave.caught?`; `shared/src/schema.ts` → `Player.caughtLog`.
- [x] 2. [khó] `server/src/shop/SharedShop.ts` → `caught`, `recordCatch`, event `caught`, `snapshot`/`apply`; `server/src/persistence/ShopStore.ts` → `parseShopSave` lọc `caught`; `server/src/rooms/BobaShopRoom.ts` → gán `caughtLog` lúc join, nhánh `caught` trong `watchWallet`, gọi `recordCatch` trong `landFish`. Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/src/ui/FishGuide.ts` → `update()` đánh dấu `data-caught`, `×n`, dòng tiến độ `fish-guide-progress`; thêm CSS cho loài chưa bắt (mờ). Ghi dòng `Selectors:` vào "Trạng thái hiện tại" khi xong. Chạy `npm run typecheck`.
- [x] 4. [vừa] `tests/fishing.spec.ts` → viết T1–T3 (ở cuối file, tái dùng helper). Chạy `npx playwright test tests/fishing.spec.ts -g "T29"`. Test ĐỌC dòng `Selectors:` ở bước 3 (các selector ở trên chỉ là ví dụ).
- [x] 5. [dễ] `README.md` → mục Gameplay/fishing: thêm 1 câu về sổ cá; `AGENTS.md` → Architecture (`SharedShop` giữ sổ cá `caught`, `Player.caughtLog`). Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Sổ cá lưu qua phiên — bắt cá ghi vào sổ, rejoin vẫn còn — tests/fishing.spec.ts (tên test bắt đầu "T29 T1")
  - Setup: user duy nhất `uniqueUser()`, 1 phiên, không cấp gì thêm.
  - Steps: 1. `joinAsHost`, `enterPond`, `start_fishing` · 2. `castUntilBite`, `reel {holding:true}` đến khi `fishCaught` = 1 · 3. `page.reload()`/mở trang mới cùng username (xem cách rejoin ở test persistence/T3 hiện có), `enterPond`.
  - Assert: sau bước 2 `caughtLog` bắt đầu bằng `ca_ro:1` (dùng id thật trong FISH); sau bước 3 `caughtLog` vẫn có `ca_ro:1`.
- [x] T2. FishGuide hiện trạng thái đã bắt — loài đã bắt sáng + ×n, loài chưa bắt không có `data-caught`, tiến độ đúng — tests/fishing.spec.ts ("T29 T2")
  - Setup: PUT shop với `caught:{ca_ro:2, <1 loài khác trong FISH>:1}` trước khi join.
  - Steps: `joinAsHost`, `enterPond`, mở guide `#fish-guide`.
  - Assert: `#fish-guide [data-fish="ca_ro"]` có `data-caught="true"` và chứa "×2"; một loài khác chưa cấp không có `data-caught`; `[data-testid="fish-guide-progress"]` chứa `Đã bắt 2/${FISH.length} loài`.
- [x] T3. Dữ liệu sổ xấu bị lọc — id lạ/đếm âm bị bỏ khi PUT shop — tests/fishing.spec.ts ("T29 T3")
  - Setup: PUT shop với `caught:{ca_ro:1, khong_co:5, <loài hợp lệ>:-3}`.
  - Steps: `joinAsHost`, đọc `caughtLog` qua `window.__GAME__`.
  - Assert: `caughtLog === "ca_ro:1"`.

## Trạng thái hiện tại
- Bước 1 xong: `encodeCaught`/`parseCaught` thêm vào `shared/src/fishing.ts` (sau `getFish`), `ShopSave.caught?` thêm vào `shared/src/decor.ts`, `Player.caughtLog` (string schema) thêm vào `shared/src/schema.ts` ngay sau `rodLevel`. `npm run typecheck` PASS.
- Bước 2 xong: `SharedShop` có field `caught` + `recordCatch(id)` (tăng đếm, emit `{type:"caught", log}`, `scheduleSave`), `ShopEvent` thêm nhánh `caught`, `snapshot()` ghi `caught`, `apply()` đọc `save.caught ?? {}` qua vòng encode/parse để lọc; `ShopStore.parseShopSave` thêm `parseCaughtLog` (chỉ giữ id trong FISH, đếm nguyên >= 1 — PUT `/admin/users/<u>/shop` đã đi qua `parseShopSave`, không cần sửa admin.ts); `BobaShopRoom`: `onJoin` gán `player.caughtLog = encodeCaught(shop.caught)` (gộp 3 lần `shopOf(key)` thành biến `shop`), `watchWallet` thêm nhánh `caught`, `landFish` gọi `shop.recordCatch(def.id)` khi có key. `npm run typecheck` PASS sau bước 2.
- Lưu ý: các bước 1–2 chỉ đổi dữ liệu đồng bộ (không có UI mới), FishGuide UI là bước 3; chưa chạy Playwright vì plan các bước 1–2 không ghi lệnh test nào ngoài `npm run typecheck`.
- Bước 3 xong: `FishGuide` giữ `fishRows` (Map id → row + count span) và span `progress`; `update()` (chạy 300ms ở hồ + ngay khi `setArea("pond")`) parse `caughtLog` của người chơi local: hàng đã bắt có `data-caught="true"` + `×n` trong `.fish-guide-count`, hàng chưa bắt không có `data-caught` (CSS mờ icon); h2 "🐟 Các loại cá" chứa span tiến độ "Đã bắt X/Y loài" (Y = `FISH.length`). CSS thêm trong `client/src/style.css` sau khối `.fish-guide-row[data-current]`. `npm run typecheck` PASS sau bước 3.
- Bước 4 xong: `tests/fishing.spec.ts` có helper `caughtLog(page)` đọc `caughtLog` của người chơi local qua `window.__GAME__`; T1 bắt 1 Cá rô (FISH_TEST) rồi `page.reload()` (URL `?room=` tự rejoin) kiểm tra sổ còn; T2 PUT shop `caught:{ca_ro:2,ca_chep:1}` rồi kiểm tra `data-caught`, `×2`, loài chưa bắt và dòng tiến độ; T3 PUT shop có id lạ + đếm âm, kiểm tra `caughtLog === "ca_ro:1"`. `npm run typecheck` PASS; `npx playwright test tests/fishing.spec.ts -g "T29"` → 3/3 PASS (10.4s).
- Lưu ý: T1 rejoin bằng `page.reload()` (client tự `joinById` qua `?room=`), không mở context mới; T3 chỉ kiểm tra lọc qua đọc `caughtLog` sau join, không kiểm tra file JSON lưu trên đĩa.
- Selectors: `#fish-guide` (client/index.html); `[data-testid="fish-guide-progress"]` (span trong h2 "🐟 Các loại cá"), `.fish-guide-row[data-fish="<id>"]` với `data-caught="true"`, `.fish-guide-count` (span ×n) — tạo trong client/src/ui/FishGuide.ts; `.fish-guide-row[data-fish]:not([data-caught="true"]) .fish-guide-icon` (CSS mờ loài chưa bắt) — client/src/style.css.
- Bước 5 xong: `README.md` mục Fishing pond thêm câu về sổ cá (guide sáng loài đã bắt + ×n, làm mờ loài chưa bắt, dòng "Đã bắt X/Y loài", lưu cùng shop qua restart); `AGENTS.md` Architecture cập nhật `SharedShop` giữ `caught` mirror sang `Player.caughtLog`. Docs checked: README + AGENTS.md đã khớp code, không còn chỗ lệch. `npm run typecheck` PASS.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS sau bước 5 (bước 5 chỉ sửa docs, không có lệnh test riêng); lần chạy Playwright gần nhất `npx playwright test tests/fishing.spec.ts -g "T29"` → 3/3 PASS (10.4s).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
- Fail chi tiết:

## Verify
- Typecheck PASS; cả bộ e2e: 74 PASS, 1 FAIL (`T27 the sinking hook moves smoothly` — test đo khung hình, flaky: PASS 1/2 lần chạy lại, không liên quan sổ cá).
- T1 (sổ cá lưu qua reload): PASS. T2 (FishGuide đánh dấu đã bắt, ×n, tiến độ): PASS. T3 (lọc dữ liệu xấu): PASS.
- Ảnh: `.agents/screenshots/task-29-fish-guide-caught.png` — "Đã bắt 2/15 loài", Cá rô ×2, Cá chép ×1, loài chưa bắt hiện bóng mờ.
- Lưu ý: T27 (khung hình) đôi khi fail do tải máy, không thuộc task này.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
