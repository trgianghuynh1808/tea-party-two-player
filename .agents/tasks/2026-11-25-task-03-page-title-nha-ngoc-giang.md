# Task: Đổi title trang thành "Nhà Ngọc và Giang"
APPROVED_BY_MANAGER

Verify mode: none
<!-- đổi chữ, không ảnh hưởng hành vi -->

## Mục tiêu
- Tab trình duyệt hiển thị title "Nhà Ngọc và Giang" thay cho "Tea Party".

## Quyết định đã chốt
- Chỉ đổi thẻ `<title>` tĩnh trong `client/index.html`; không có chỗ nào khác set `document.title`.
- Cập nhật spec cũ `tests/page-title.spec.ts` (đang khẳng định "Tea Party") thay vì tạo spec mới.

## Ngữ cảnh
- `client/index.html` dòng 7: `<title>Tea Party</title>`.
- `tests/page-title.spec.ts` hiện: `await page.goto("/?test=1"); await expect(page).toHaveTitle("Tea Party");` (tên test T1 cũng chứa "Tea Party").
- Grep `Tea Party` trong client/src, README.md, AGENTS.md: không có kết quả khác. Docs không cần đổi.
- Chạy test: `npx playwright test tests/page-title.spec.ts -g "T1"`.

## Plan
- [x] 1. [dễ] `client/index.html` → đổi `<title>Tea Party</title>` thành `<title>Nhà Ngọc và Giang</title>`.
- [x] 2. [vừa] `tests/page-title.spec.ts` → sửa test T1: tên test và `toHaveTitle` thành "Nhà Ngọc và Giang". Chạy `npx playwright test tests/page-title.spec.ts -g "T1"` và `npm run typecheck`.

## Test cases
- [x] T1. Page title — tab title là "Nhà Ngọc và Giang" — tests/page-title.spec.ts
  - Setup: không cần user/phòng, 1 phiên.
  - Steps: 1. `page.goto("/?test=1")`
  - Assert: `await expect(page).toHaveTitle("Nhà Ngọc và Giang")`

## Trạng thái hiện tại
- Bước 1 xong: `client/index.html` dùng `<title>Nhà Ngọc và Giang</title>`. `npm run typecheck` PASS. Docs checked: no change needed.
- Bước 2 xong: `tests/page-title.spec.ts` T1 đổi tên test và `toHaveTitle` thành "Nhà Ngọc và Giang". `npx playwright test tests/page-title.spec.ts -g "T1"` PASS (1 passed). `npm run typecheck` PASS. Docs checked: no change needed.

## Test status
- Lần chạy cuối: `npx playwright test tests/page-title.spec.ts -g "T1"` → 1 passed
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết: không có

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
