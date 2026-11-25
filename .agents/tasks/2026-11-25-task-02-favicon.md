# Task: Favicon trà sữa
APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Tab trình duyệt hiển thị favicon hình ly trà sữa thay vì icon mặc định.

## Quyết định đã chốt
- Dùng một file SVG tự vẽ (`client/public/favicon.svg`), không dùng file ảnh nhị phân; Vite copy `public/` nguyên trạng và viết lại href tuyệt đối theo `base`.
- Không đụng server/shared; server đã serve `client/dist` nên favicon tự được phục vụ.

## Ngữ cảnh
- `client/index.html`: `<head>` hiện có `<meta charset>`, viewport, `theme-color`, `<title>Tea Party</title>`. Chưa có `<link rel="icon">`.
- `client/public/` hiện chỉ có thư mục `assets/`. Vite `base` = `process.env.BASE_PATH || "/"`, nên dùng `href="/favicon.svg"` (Vite tự thêm base).
- Màu nền trang `#1e1b2e` (theme-color). SVG gợi ý: viewBox 0 0 64 64, nền bo tròn tím đậm `#1e1b2e`, ly trà sữa (thân hình thang màu kem/nâu `#e8c9a0`, nắp, ống hút hồng, vài hạt trân châu nâu đậm `#3b2418` ở đáy).
- Test: spec mẫu `tests/page-title.spec.ts` dùng `page.goto("/?test=1")`. Playwright baseURL do config lo. Không cần `window.__GAME__`, không cần 2 phiên.

## Plan
- [x] 1. [dễ] `client/public/favicon.svg` → tạo file SVG ly trà sữa (viewBox 0 0 64 64, có `xmlns`, nền bo tròn, ly, ống hút, hạt trân châu).
- [x] 2. [dễ] `client/index.html` → trong `<head>` ngay sau `<title>` thêm `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />`.
- [x] 3. [vừa] `tests/favicon.spec.ts` → viết spec cho T1. Chạy: `npx playwright test tests/favicon.spec.ts -g "T1"`. Sau đó chạy `npm run typecheck`.

## Test cases
- [x] T1. Favicon được khai báo và tải được — thẻ link icon trỏ tới SVG hợp lệ — tests/favicon.spec.ts
  - Setup: 1 phiên, không cần user/tiền.
  - Steps: 1. `page.goto("/?test=1")` · 2. lấy `href` của `link[rel="icon"]` · 3. `page.request.get(new URL(href, page.url()).toString())`.
  - Assert: link tồn tại với `type="image/svg+xml"`; response `ok()` là true, `content-type` chứa `svg`, body chứa `<svg`.

## Trạng thái hiện tại
- Bước 1 xong: đã tạo `client/public/favicon.svg` (nền bo tròn tím `#1e1b2e`, ly trà sữa, nắp, ống hút hồng, trân châu). `npm run typecheck` PASS.
- Bước 2 xong: `client/index.html` thêm `<link rel="icon" type="image/svg+xml" href="/favicon.svg" />` ngay sau `<title>`. `npm run typecheck` PASS.
- Bước 3 xong: viết `tests/favicon.spec.ts` cho T1 (link icon + tải SVG qua `page.request.get`). `npx playwright test tests/favicon.spec.ts -g "T1"` PASS (1 passed); `npm run typecheck` PASS.
- Docs checked: no change needed (không đổi gameplay/control/protocol/env/script).

## Test status
- Lần chạy cuối: typecheck PASS + `npx playwright test tests/favicon.spec.ts -g "T1"` PASS sau bước 3
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết:

## Verify
- T1 PASS (`npx playwright test tests/favicon.spec.ts`), typecheck PASS.
- Favicon render: PASS — `.agents/screenshots/task-02-favicon.png` (ly trà sữa, ống hút hồng, trân châu).
- Docs checked: no change needed.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
