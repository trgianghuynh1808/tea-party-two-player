# Task: Favicon cho trang admin portal

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Tái dùng favicon ly trà sữa của game (`client/public/favicon.svg`) cho trang `/portal`.
- Portal là HTML tĩnh do server phục vụ riêng (`server/portal/index.html`), nên copy SVG vào `server/portal/` và thêm route để server trả file này.
- Thêm `<link rel="icon">` vào `<head>` của portal; thêm 1 test e2e kiểm tra link + tải được SVG.

## Mục tiêu
- Tab trình duyệt của `/portal` hiển thị favicon ly trà sữa thay vì icon mặc định.

## Quyết định đã chốt
- Copy nguyên `client/public/favicon.svg` sang `server/portal/favicon.svg` (portal không phụ thuộc client build; server dev không serve `client/public`).
- Route mới `GET /portal/favicon.svg` nằm cạnh route `/portal`, trong cùng khối chỉ bật khi có `ADMIN_TOKEN`.

## Ngữ cảnh
- `server/src/index.ts` (~dòng 68): 
  ```ts
  app.get("/portal", (_req, res) => {
    res.sendFile(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../portal/index.html"));
  });
  ```
- `server/portal/index.html`: `<head>` có `<meta charset>`, viewport, `<title>Portal Admin — ...</title>` rồi `<style>`. Chưa có link icon.
- Test: `tests/admin-portal.spec.ts` đã có `const SERVER = TEST_SERVER_URL`; portal mở bằng `page.goto(`${SERVER}/portal`)`. Playwright config tự chạy server với `ADMIN_TOKEN=test-admin-token`. Không cần user/tiền/2 phiên. Mẫu test favicon của game: `tests/favicon.spec.ts`.

## Plan
- [x] 1. [vừa] `server/src/index.ts` → thêm `app.get("/portal/favicon.svg", ...)` ngay sau route `/portal`, `res.sendFile` tới `../portal/favicon.svg` (cùng cách resolve); tạo `server/portal/favicon.svg` (copy từ `client/public/favicon.svg`); trong `server/portal/index.html` thêm `<link rel="icon" type="image/svg+xml" href="/portal/favicon.svg">` ngay sau `<title>`. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/admin-portal.spec.ts` → thêm test T1 (đặt tên bắt đầu "T8:" để không trùng T1 cũ trong file; xem mục Test cases). Chạy: `npx playwright test tests/admin-portal.spec.ts -g "T8"`.

## Test cases
- [x] T1. Portal có favicon — link icon trỏ tới SVG tải được — tests/admin-portal.spec.ts (tên test bắt đầu "T8:")
  - Setup: 1 phiên, không cần user/tiền.
  - Steps: 1. `page.goto(`${SERVER}/portal`)` · 2. lấy `href` của `link[rel="icon"]` · 3. `page.request.get(new URL(href, page.url()).toString())`.
  - Assert: link tồn tại với `type="image/svg+xml"`; response `ok()`, `content-type` chứa `svg`, body chứa `<svg`.

## Trạng thái hiện tại
- Bước 1 xong: thêm route `GET /portal/favicon.svg`, copy `client/public/favicon.svg` → `server/portal/favicon.svg`, thêm `<link rel="icon">` sau `<title>` trong portal. `npm run typecheck` PASS (bước này không có lệnh test riêng).
- Bước 2 xong: thêm test T8 vào `tests/admin-portal.spec.ts` (link `link[rel="icon"]` + tải SVG), `npx playwright test tests/admin-portal.spec.ts -g "T8"` PASS, `npm run typecheck` PASS.
- Docs checked: no change needed.
- Selectors: `link[rel="icon"]` (server/portal/index.html), route `/portal/favicon.svg` (server/src/index.ts)

## Test status
- Lần chạy cuối: `npx playwright test tests/admin-portal.spec.ts -g "T8"` — 1 passed; `npm run typecheck` PASS
- Kết quả từng test:
  - T1 (spec: "T8"): PASS
- Fail chi tiết:

## Verify
- Chạy cả bộ e2e: 54 passed; `npm run typecheck` PASS.
- T1 (spec "T8"): PASS — link icon svg + SVG tải được. Không cần ảnh (favicon không chụp được qua spec).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
