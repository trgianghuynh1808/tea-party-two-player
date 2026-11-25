# Task: Đổi tiêu đề trang thành "Tea Party"
APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Tab trình duyệt hiển thị tiêu đề "Tea Party" (thẻ `<title>` của trang).
- Không đổi tên trong game (heading README, tên phòng mặc định ở `main.ts`).

## Quyết định đã chốt
- Chỉ đổi `<title>` trong `client/index.html`; giữ nguyên chữ "Tiệm Trà Bé Ngọc Giang" ở `client/src/main.ts:471` (tên phòng mặc định) và `README.md` dòng 1 (tên game).

## Ngữ cảnh
- `client/index.html:7`: `<title>Tiệm Trà Bé Ngọc Giang</title>` → cần thành `<title>Tea Party</title>`. Không có chỗ nào khác set `document.title`.
- Test: mở `/?test=1` bằng Playwright (config có baseURL 5173), `await page.goto("/?test=1"); await expect(page).toHaveTitle("Tea Party");`. Không cần join phòng, không cần 2 phiên, không cần tiền.
- Tên file spec mới: `tests/page-title.spec.ts` (import `{ expect, test } from "@playwright/test"`).
- Docs: README/AGENTS không nhắc `<title>` → không cần sửa; ghi "Docs checked: no change needed" vào "Trạng thái hiện tại".

## Plan
- [x] 1. [dễ] `client/index.html` → thẻ `<title>`: đổi nội dung thành `Tea Party`.
- [x] 2. [vừa] `tests/page-title.spec.ts` → viết test T1 theo mục Test cases. Chạy: `npx playwright test tests/page-title.spec.ts -g "T1"` và `npm run typecheck`.

## Test cases
- [x] T1. Page title — tiêu đề tab là "Tea Party" — tests/page-title.spec.ts
  - Setup: không cần user/phòng, 1 phiên.
  - Steps: 1. `page.goto("/?test=1")`
  - Assert: `await expect(page).toHaveTitle("Tea Party")`

## Trạng thái hiện tại
- Bước 1 xong: `client/index.html` đổi `<title>` thành `Tea Party`, giữ nguyên "Tiệm Trà Bé Ngọc Giang" ở `main.ts` và README. `npm run typecheck` pass.
- Bước 2 xong: `tests/page-title.spec.ts` có test T1 (goto `/?test=1`, `toHaveTitle("Tea Party")`). `npx playwright test tests/page-title.spec.ts -g "T1"` pass, `npm run typecheck` pass.
- Docs checked: no change needed.

## Test status
- Lần chạy cuối: bước 2 — `npx playwright test tests/page-title.spec.ts -g "T1"` (1 passed) và `npm run typecheck` (pass).
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết:

## Verify
- T1 PASS (spec `tests/page-title.spec.ts`; tiêu đề tab là "Tea Party"). Không cần ảnh: thay đổi không có phần hiển thị trong trang.
- Cả bộ: 32 pass, 8 fail (admin-portal, build-parity T2, gadgets-tabletop T2) — không liên quan tới `<title>`, server dev đang chạy không có ADMIN_TOKEN.
- typecheck PASS. Review: diff chỉ gồm `client/index.html` + spec, không có blocking.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
