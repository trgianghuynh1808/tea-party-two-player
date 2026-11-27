# Task: T35 — thêm kệ ly thứ hai ở bên phải tiệm trà

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Có thêm một kệ ly (lấy ly rỗng) ở phía bên phải tiệm trà, gần các máy nước, để pha món nước tiện hơn. Kệ ly cũ bên trái giữ nguyên.

## Ý tưởng
- Thêm station `cup_shelf_2` (cùng type `CupShelf`) vào `STATIONS` ở sàn cạnh tường phải, đối xứng kệ trái.
- Client dùng lại hình/icon của `cup_shelf` bằng cách thêm entry cho id mới.

## Quyết định đã chốt
- Kệ mới: id `cup_shelf_2`, nhãn "Kệ ly", x=884, y=290 (cùng cỡ MACHINE_W×MACHINE_H = 96×60, phủ x 836..932, y 260..320). Không đè máy (y 115..175), quầy giao hàng (x 760..940, y 402..498), dãy counter (x ≤ 689) hay lối ra.

## Ngữ cảnh
- `shared/src/menu.ts` `STATIONS`: kệ trái hiện là `{ id: "cup_shelf", type: StationType.CupShelf, label: "Kệ ly", x: 76, y: 290, width: MACHINE_W, height: MACHINE_H, color: 0x8ecae6 }`. Thêm một dòng tương tự ngay sau nó với id `cup_shelf_2`, x: 884. `interaction.ts` xử lý theo `type`, `placement.ts` đọc `STATIONS` nên tự chặn nội thất, không cần sửa.
- `client/src/scenes/TeaArt.ts:18`: texture chọn theo `type === CupShelf` → kệ mới tự vẽ, không sửa.
- `client/src/scenes/ShopScene.ts`: `STATION_TEXTURES` (dòng ~137, có `cup_shelf: "assets/stations/cup_shelf.png"`) và `STATION_ICONS` (dòng ~188, `cup_shelf: { url: "assets/cups/empty.png", height: 40 }`) tra theo `def.id` → phải thêm entry `cup_shelf_2` giống hệt. `stationIconKey(id)` = `station-icon-${id}`, vòng load ở ~292/301 tự nạp theo key mới (nhiều id cùng url đều ổn).
- Test: `tests/tea-shop-art.spec.ts` có `EXPECTED_LABELS` (so substring với `window.__GAME__.stationLabels()`), dùng `joinAsHost(page, user)` từ `tests/helpers.ts`; import `STATIONS`, `StationType` từ `@boba/shared`. Spec này có test thuần (không trình duyệt) như T2.

## Plan
- [x] 1. [khó] `shared/src/menu.ts` — thêm station `cup_shelf_2` vào `STATIONS` (cập nhật comment cho đúng: có 2 kệ ly); `client/src/scenes/ShopScene.ts` — thêm `cup_shelf_2` vào `STATION_TEXTURES` và `STATION_ICONS`. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/tea-shop-art.spec.ts` — thêm T1 (test thuần). Chạy `npx playwright test tests/tea-shop-art.spec.ts`.
- [x] 3. [dễ] `README.md` dòng ~45 — sửa câu "The cup shelf now stands on the floor by the left wall" thành có 2 kệ ly (trái và phải); kiểm `AGENTS.md` không nhắc kệ ly; ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Hai kệ ly — có đúng 2 kệ ly, kệ mới ở bên phải và không chồng station khác — tests/tea-shop-art.spec.ts
  - Setup: test thuần, không trình duyệt; import `STATIONS`, `StationType` từ `@boba/shared`.
  - Steps: 1. lọc `STATIONS` có `type === StationType.CupShelf`. 2. so từng kệ với mọi station khác theo hình chữ nhật (tâm x,y, rộng width, cao height).
  - Assert: có đúng 2 kệ; kệ có x lớn nhất có `x > 480` (bên phải) và id `cup_shelf_2`; không cặp station nào có hình chữ nhật giao nhau với kệ đó.

## Trạng thái hiện tại
- Lưu ý: ảnh verify không thấy bên trong tiệm trà nên chưa xem được kệ mới bằng mắt; chỉ kiểm bằng test hình học T1.
- Bước 1 xong: đã thêm station `cup_shelf_2` (CupShelf, "Kệ ly", x=884, y=290, 96×60) vào `STATIONS` (shared/src/menu.ts) ngay sau kệ trái, comment dòng trên đã sửa lại cho đúng (2 kệ ly: trái + phải gần máy nước ép); đã thêm `cup_shelf_2` vào `STATION_TEXTURES` và `STATION_ICONS` trong client/src/scenes/ShopScene.ts (cùng ảnh/icon với `cup_shelf`). `npm run typecheck` PASS (server + client).
- Bước 2 xong: đã thêm test thuần "T1: hai kệ ly — đúng 2 kệ, kệ mới (cup_shelf_2) ở bên phải, không chồng station nào" vào cuối tests/tea-shop-art.spec.ts (lọc CupShelf, kiểm đúng 2 kệ, kệ x lớn nhất là `cup_shelf_2` với x > 480, mỗi kệ không giao hình chữ nhật với station nào khác). `npx playwright test tests/tea-shop-art.spec.ts` PASS 3/3. `npm run typecheck` PASS.
- Bước 3 xong: README.md dòng 45 sửa thành "Two cup shelves stand on the floor: one by the left wall and one by the right wall, near the juice machines." Docs checked: `AGENTS.md` không nhắc kệ ly (grep "cup shelf|cup_shelf|kệ ly" không match trong AGENTS.md) nên không cần sửa. `npm run typecheck` PASS.
- Selectors: station id `cup_shelf_2` trong STATIONS (shared/src/menu.ts); entries `cup_shelf_2` trong STATION_TEXTURES / STATION_ICONS (client/src/scenes/ShopScene.ts) — không thêm DOM id/class nào.

## Test status
- Lần chạy cuối: `npx playwright test tests/tea-shop-art.spec.ts` — 3 passed (T1 task-35 mới + 2 test cũ của spec không đổi, vẫn pass).
- Kết quả từng test:
  - T1: PASS — đúng 2 kệ ly, kệ mới `cup_shelf_2` ở bên phải (x=884 > 480), không kệ nào chồng station khác.
- Fail chi tiết:

## Verify
- T1: PASS (bộ e2e đầy đủ 85/85 pass, typecheck PASS).
- Ảnh: `.agents/screenshots/task-35-cup-shelf-right.png` chỉ chụp được sân ngoài (người chơi spawn ngoài sân), không thấy nội thất tiệm trà; vị trí kệ được xác nhận bằng test T1 (không chồng station).
- Docs: README đã cập nhật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
