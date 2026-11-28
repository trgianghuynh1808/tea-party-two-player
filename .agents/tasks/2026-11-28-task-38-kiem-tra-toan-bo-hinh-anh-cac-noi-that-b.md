# Task: Rà soát hình ảnh nội thất (xoay xéo / mờ / lệch style)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Tạo các "contact sheet" (ảnh lưới có nhãn tên file) của toàn bộ ảnh nội thất để rà soát bằng mắt.
- Tech Lead xem các sheet, lập danh sách ảnh bị xoay xéo / không rõ / khác style, gửi ảnh cho người dùng. KHÔNG xóa gì trong task này (người dùng sẽ chỉ định xóa sau).

## Ý tưởng
- Script Node dựng trang HTML tạm: mỗi thư mục con của `client/public/assets/decor/` là một lưới ô cùng cỡ, nền caro, tên file bên dưới; chụp bằng Playwright thành PNG.
- Không sửa code game hay asset. Script là công cụ dev dùng một lần.

## Quyết định đã chốt
-

## Ngữ cảnh
- Ảnh nằm ở `client/public/assets/decor/` (206 png): thư mục con `bathroom bedroom wall plants furniture kitchen views gadgets yard`, cộng các png ở gốc (fern_*, lantern_*, rug_*, stool, succulent_*, wicker_table, woven_chair*).
- Máy không có Python PIL; dùng Node + `@playwright/test` (đã cài) để chụp: `import { chromium } from "@playwright/test"`, `page.setContent(html)` với `<img src="file:///...">` (dùng đường dẫn tuyệt đối, `await page.waitForLoadState("load")`), `page.screenshot({ path, fullPage: true })`.
- Ô lưới gợi ý: 160x160, `object-fit: contain`, `image-rendering: pixelated`, nền caro xám để thấy rõ viền/trong suốt, nhãn `relpath` font 11px dưới ảnh. Mỗi sheet tối đa ~40 ảnh (chia `-1`, `-2`... nếu nhiều hơn) để chữ vẫn đọc được.
- Lưu ảnh vào `.agents/screenshots/task-38-<thư-mục>[-n].png`. Ảnh gốc (png ở `decor/` gốc) đặt tên sheet `task-38-root`.
- Đây không phải thay đổi hành vi game: không có e2e test, không cần docs.

## Plan
- [x] 1. [dễ] `scripts/decor-contact-sheet.mjs` → tạo script: duyệt đệ quy `client/public/assets/decor`, nhóm theo thư mục cha, dựng HTML lưới như mô tả, chụp từng nhóm (chia sheet ≤40 ảnh) ra `.agents/screenshots/task-38-*.png`; in ra danh sách file PNG đã tạo.
- [x] 2. [dễ] `scripts/decor-contact-sheet.mjs` → chạy `node scripts/decor-contact-sheet.mjs`, xác nhận ảnh được tạo (`ls .agents/screenshots/task-38-*`) và không rỗng; không chạy gì khác. Chạy `npm run typecheck` chỉ để chắc không ảnh hưởng.

## Test cases
- Không có e2e test (công cụ rà soát, không đổi hành vi game). Tech Lead kiểm tra bằng mắt ở Verify.

## Trạng thái hiện tại
- Bước 1 xong: đã tạo `scripts/decor-contact-sheet.mjs` (duyệt đệ quy, nhóm theo thư mục cha, lưới 160x160 nền caro, chia sheet ≤40, in danh sách PNG). `npm run typecheck` PASS.
- Bước 2 xong: chạy script tạo 10 sheet tại `.agents/screenshots/task-38-{root,bathroom,bedroom,furniture,gadgets,kitchen,plants,views,wall,yard}.png`, tất cả > 0 byte và đã kiểm tra bằng mắt thấy ảnh hiện đúng (furniture, views). `npm run typecheck` PASS.
- Sửa lỗi trong lúc chạy: `page.setContent` làm ảnh `file://` bị chặn (icon ảnh hỏng); đổi sang ghi HTML tạm rồi `page.goto(file://...)` và chờ `naturalWidth > 0`.
- Docs checked: no change needed (công cụ dev một lần, không đổi game).
- Lưu ý: bedroom/ và vài ảnh furniture/kitchen khác style (xem Verify); chưa xóa gì.
- Lưu ý: `.agents/screenshots/` bị `.gitignore`, nên 10 sheet chỉ nằm trên máy chạy (không vào commit); Tech Lead cần mở trực tiếp các file này để duyệt bằng mắt.

## Test status
- Lần chạy cuối: bước 2 — `npm run typecheck` PASS (không có e2e test theo plan).
- Kết quả từng test:
  - Không có test case.
- Fail chi tiết:

## Verify
- Script chạy, 10 sheet tạo ra, đều > 0 byte, ảnh hiện đúng với nhãn đọc được (đã mở root, furniture, bedroom, kitchen): PASS. `npm run typecheck` PASS.
- Ảnh: `.agents/screenshots/task-38-*.png` (root, bathroom, bedroom, furniture, gadgets, kitchen, plants, views, wall, yard).
- Nhận xét nhanh (chưa xóa gì): bedroom/ có style tối viền đen khác furniture/ (vd `bedroom/stove.png`, `bedroom/bed*.png`); `furniture/sofa_blue.png` còn nền nâu dính phía sau; `furniture/dining_chair_blue.png`, `furniture/lamp_arc_brass.png` mờ/nhỏ; `kitchen/fridge_kitchen_left|right`, `washer_kitchen_left|right` là mặt bên đơn giản khác style. Người dùng quyết định xóa sau.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
