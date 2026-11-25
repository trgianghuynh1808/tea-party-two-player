# Task: Sửa chữ trong option list (select) của form thêm nội thất ở portal

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Nguyên nhân khả dĩ: `<select>` trong portal chỉ đặt `background: #fff`, không đặt `color` và không khai báo `color-scheme`; khi trình duyệt/OS ở theme tối thì chữ của select/option lấy màu mặc định (sáng) trên nền trắng nên không đọc được.
- Sửa trong CSS của `server/portal/index.html`: đặt `color-scheme: light` cho trang, `color` rõ ràng cho `select` và `select option` (nền trắng, chữ nâu đậm giống `body`).
- Thêm 1 test e2e giả lập `colorScheme: "dark"` và kiểm tra màu computed của select/option trong form thêm nội thất.

## Mục tiêu
- Option list (dropdown Nhóm / Loại / Xoay / Vai trò) trong form thêm nội thất ở `/portal` luôn đọc được (chữ tối trên nền sáng), kể cả khi trình duyệt dùng theme tối.

## Quyết định đã chốt
- Chỉ sửa CSS trong `server/portal/index.html`; không đổi logic JS. Portal vốn là giao diện sáng nên ép `color-scheme: light` thay vì làm theme tối.

## Ngữ cảnh
- `server/portal/index.html` dòng ~39: `select { padding: 8px 10px; border: 1px solid #c9bba8; border-radius: 6px; font: inherit; background: #fff; }` (thiếu `color`). Dòng 10: `body { ...; background: #f5f1ea; color: #3a2f28; }`. Dòng 46: `.cd-form input, .cd-form select { width: 100%; }`. Không có `color-scheme` hay `prefers-color-scheme` nào.
- Các select được tạo bởi `cdSelect(options, value)` (~dòng 586), nằm trong `.cd-form` (Nhóm, Loại, Xoay, Vai trò) của card thêm nội thất, chỉ hiện sau khi tải ảnh và cắt (flow phức tạp).
- Test: `tests/admin-portal.spec.ts` có `const SERVER = TEST_SERVER_URL`, portal mở bằng `page.goto(`${SERVER}/portal`)`; token admin `test-admin-token` (server Playwright bật sẵn ADMIN_TOKEN). Vì form thêm nội thất khó dựng, test chỉ cần tự chèn một `<select class="x"><option>` vào `.cd-form` giả bằng `page.evaluate` rồi đọc `getComputedStyle`; dùng `test.use({ colorScheme: "dark" })` hoặc `browser.newContext({ colorScheme: "dark" })`.
- Không cần user/tiền/2 phiên.

## Plan
- [x] 1. [dễ] `server/portal/index.html` → trong `<style>`: thêm `color-scheme: light;` vào rule `body`, và sửa rule `select` thành có `color: #3a2f28;` cộng thêm rule `select option { background: #fff; color: #3a2f28; }`.
- [x] 2. [vừa] `tests/admin-portal.spec.ts` → thêm test T9 (tên bắt đầu "T9:"; xem Test cases). Chạy: `npx playwright test tests/admin-portal.spec.ts -g "T9"`.

## Test cases
- [x] T1. Select đọc được ở theme tối — màu chữ select/option là tối, nền sáng khi trình duyệt dùng dark — tests/admin-portal.spec.ts (tên test bắt đầu "T9:")
  - Setup: 1 phiên, context `colorScheme: "dark"`, không cần user/tiền.
  - Steps: 1. `page.goto(`${SERVER}/portal`)` · 2. `page.evaluate` chèn `<select><option>A</option></select>` vào `document.body` · 3. đọc `getComputedStyle` của select và option, và `getComputedStyle(document.body).colorScheme`.
  - Assert: `color` của select và option là `rgb(58, 47, 40)`; `background-color` là `rgb(255, 255, 255)`; `color-scheme` computed của `body` chứa `light`.

## Trạng thái hiện tại
- Bước 1 xong: `body` có `color-scheme: light;`, `select` có `color: #3a2f28;`, thêm rule `select option { background: #fff; color: #3a2f28; }`. `npm run typecheck` PASS.
- Bước 2 xong: thêm test T9 trong `tests/admin-portal.spec.ts` (context `colorScheme: "dark"`, chèn `<select><option>` vào body, đọc computed style). `npx playwright test tests/admin-portal.spec.ts -g "T9"` PASS (1 passed). `npm run typecheck` PASS.
- Selectors: select / select option (server/portal/index.html); test dùng `body > select` chèn động.
- Docs checked: no change needed (chỉ đổi CSS + test).

## Test status
- Lần chạy cuối: `npx playwright test tests/admin-portal.spec.ts -g "T9"` — 1 passed
- Kết quả từng test:
  - T1: PASS (T9)
- Fail chi tiết:

## Verify
- Verify mode light: không cần ảnh (kiểm tra computed style bằng spec).
- T1 (T9 trong spec): PASS. Toàn bộ suite e2e 55 passed; `npm run typecheck` PASS.
- Review: diff chỉ CSS + test, không có finding chặn.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
