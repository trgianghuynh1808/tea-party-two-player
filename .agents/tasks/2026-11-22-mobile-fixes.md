# Task: Sửa các lỗi nhà hàng trên điện thoại

Verify mode: light

## Mục tiêu
- Hộp "Cách làm" (nút ?) không còn bị cắt/tràn ngang khi điện thoại cầm dọc (trang xoay bằng CSS `force-landscape`).
- Nhãn tên máy (Thớt, Chảo dầu, Máy xay...) trên màn hình cảm ứng to và dễ đọc hơn; nhãn thùng nguyên liệu giữ như cũ (hàng thùng rất sát nhau).
- Dòng gợi ý điều khiển ở góc dưới trái không còn đè lên bàn/trạm: nền sáng cho dễ đọc, và trên cảm ứng tự ẩn sau khi người chơi bắt đầu di chuyển.

## Quyết định đã chốt
- Không zoom camera (HUD dùng `scrollFactor 0` ở nhiều chỗ, rủi ro cao); khung game vốn bị giới hạn bởi chiều cao màn hình nên không mở rộng được. Chỉ phóng chữ nhãn máy.
- Không đổi layout bảng đơn hàng / nút panel lần này.

## Ngữ cảnh
- Hộp công thức: `client/src/style.css` ~dòng 700-830 (`.guide`, `.guide-step`, `.guide-flow`, `.guide-box`) và ~1092-1112 (`.modal`, `.modal-card`):
  ```css
  .guide { display:flex; flex-direction:column; gap:10px; max-width:560px; }
  .guide-step { display:flex; align-items:center; gap:8px; padding:6px 8px; ... }
  .guide-flow { display:flex; flex-wrap:wrap; align-items:center; gap:4px; }
  .guide-box { min-width:64px; padding:4px 6px; ... }
  .modal-card { width:420px; max-width:100%; max-height:100%; overflow-y:auto; ... }
  ```
  Lỗi thấy được: ở iPhone dọc (body `force-landscape`, layout 664x390) bước 2 của công thức bị cắt mép trái. Nghi do `.guide` (max-width 560) rộng hơn nội dung thẻ (420-32) nên tràn, và `overflow-y:auto` ngầm bật cả `overflow-x`. Hướng sửa: `.guide { max-width:100%; min-width:0; }`, `.guide-step { min-width:0; }`, `.guide-flow { min-width:0; }`, `.modal-card { overflow-x:hidden; }`; đo `scrollWidth <= clientWidth` của `.modal-card` để chắc đã hết tràn.
- `client/src/scenes/ShopScene.ts`:
  - dòng ~66: `const FONT_SCALE = isTouchDevice() ? 1.3 : 1; const fs = (px) => \`${Math.round(px * FONT_SCALE)}px\`;`
  - dòng ~615-625 (trong vòng tạo nhãn trạm): `fontSize: fs(crate ? 10 : 12)` — thùng (`crate`) giữ nguyên, máy/kệ không phải thùng đổi sang cỡ lớn hơn trên cảm ứng (đề xuất `Math.round(12 * 1.6)` khi `isTouchDevice()`, giữ 12 trên desktop). Không đổi vị trí nhãn.
  - dòng ~724-727 `createHud()`: `this.controlsText = this.add.text(16, WORLD_HEIGHT - 28, "", { fontFamily:"sans-serif", fontSize: fs(13), color:"#6b5b57" }).setDepth(10000).setScrollFactor(0);` và `statusText` ở `WORLD_HEIGHT - 52`.
  - dòng ~461-472 `updateControlsText()`: đặt chữ gợi ý theo `this.touch` / `this.building`.
  - dòng ~502 trong `handleInput`: `dx = this.touch.dx;` (joystick; khác 0 = người chơi đang di chuyển bằng cảm ứng).
- Khung nền nhãn đang dùng ở chỗ khác: `backgroundColor: "#fdf6ecd9"`, `padding: { x: 3, y: 1 }`.

## Plan
- [x] 1. [dễ] `client/src/style.css` → `.guide`, `.guide-step`, `.guide-flow`, `.modal-card`: thêm `max-width:100%`/`min-width:0`/`overflow-x:hidden` theo mục Ngữ cảnh để hộp công thức không tràn ngang ở chế độ dọc. Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/scenes/ShopScene.ts` → vòng tạo nhãn trạm (~dòng 615): nhãn không phải thùng dùng cỡ chữ lớn hơn trên cảm ứng (`isTouchDevice()` ? `Math.round(12 * 1.6)` : 12, không qua `fs`); thùng giữ `fs(10)`.
- [x] 3. [vừa] `client/src/scenes/ShopScene.ts` → `createHud`, `updateControlsText`, `handleInput`: (a) `controlsText` và `statusText` thêm `backgroundColor: "#fdf6ecd9"` và `padding: { x: 4, y: 2 }`; (b) trên cảm ứng ngoài chế độ xây, khi joystick đã dùng lần đầu (`touch.dx !== 0 || touch.dy !== 0`) thì ẩn `controlsText` vĩnh viễn (cờ `controlsDismissed`), còn chế độ xây vẫn hiện chữ hướng dẫn xây như cũ. Chạy `npm run typecheck`.
- [x] 4. [khó] `tests/mobile-recipe-modal.spec.ts` (file mới): viết T1 dưới đây. Dùng `devices["iPhone 13"]` từ `@playwright/test` (context mới, `deviceScaleFactor` 1), `joinAsHost` + `startRestaurantShift` từ `tests/helpers.ts`; tên người dùng duy nhất; đóng context cuối test. Chạy `npx playwright test tests/mobile-recipe-modal.spec.ts` rồi `npx playwright test`.

## Test cases
- [x] T1. Hộp công thức không tràn khi điện thoại dọc — mở hộp bằng nút `?` của đơn đầu tiên trên iPhone 13 dọc: `.modal-card` có `scrollWidth <= clientWidth` và mọi `.guide-step` nằm trong khung `.modal-card` (`getBoundingClientRect`) — tests/mobile-recipe-modal.spec.ts

## Trạng thái hiện tại
- Đã xong bước 1: `.guide`, `.guide-step`, `.guide-flow` thêm `max-width:100%`/`min-width:0`; `.modal-card` thêm `overflow-x:hidden`. `npm run typecheck` pass.
- Đã xong bước 2: nhãn trạm không phải thùng dùng cỡ chữ `isTouchDevice() ? 19 : 12` (không qua `fs`); thùng giữ `fs(10)`. `npm run typecheck` pass.
- Đã xong bước 3: `controlsText`/`statusText` có nền `#fdf6ecd9` + `padding {x:4,y:2}`; cờ `controlsDismissed` ẩn vĩnh viễn hint di chuyển trên cảm ứng sau lần dùng joystick đầu (ngoài chế độ xây); chế độ xây vẫn hiện hint như cũ. `npm run typecheck` pass.
- Đã xong bước 4: viết `tests/mobile-recipe-modal.spec.ts` (T1). `npm run typecheck` pass; `npx playwright test tests/mobile-recipe-modal.spec.ts` pass; `npx playwright test` (16 test) pass. Xong đủ 4 bước trong plan.

## Test status
- Lần chạy cuối: bước 4 — `npm run typecheck` pass; `npx playwright test tests/mobile-recipe-modal.spec.ts` → 1 passed; `npx playwright test` → 16 passed (không fail).
- Kết quả từng test:
  - T1 (mobile-recipe-modal): PASS
- Lịch sử sửa trong bước 4: lần chạy đầu fail vì `testInfo.config.use` là `undefined` ở bản Playwright này (TypeError khi đọc `baseURL`); sửa lần 1 bằng cách đặt `baseURL: "http://localhost:5173"` (giá trị giống `playwright.config.ts`) cho context mới → pass. Không đụng code game.
- Fail chi tiết:

## Verify
- T1: PASS (playwright 16/16, typecheck OK).
- Mobile (iPhone ngang/dọc, Pixel ngang, giả lập Chromium): nhãn máy to hơn, gợi ý điều khiển ẩn sau khi đi, nút hành động vẫn nhặt được đồ. Hộp Cách làm ở chế độ dọc vốn chỉ cuộn dọc (không phải lỗi cắt); CSS chỉ thêm lớp bảo vệ chống tràn ngang.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
