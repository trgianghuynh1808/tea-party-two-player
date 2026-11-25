# Task: Giải thích vì sao ảnh lúc duyệt ship không đi kèm test

APPROVED_BY_MANAGER

Verify mode: none

## Mục tiêu
- Trả lời user: vì sao ảnh/báo cáo lúc duyệt ship (task trước, T06) không thấy chạy test nào. Không đổi code app.

## Quyết định đã chốt
- Task chỉ đọc/giải thích. Không viết test, không đổi code.

## Ngữ cảnh
- Task trước (T06) chỉ chạy `git log main..staging`, không đổi code app, nên `Verify mode: none` và "Test cases: Không có". Quy tắc CLAUDE.md: `none` = bỏ qua Verify, chỉ cần `npm run typecheck` PASS rồi ship.
- Vì vậy không có e2e (Playwright) nào được chạy; chỉ có typecheck.
- Ảnh user nhận khi duyệt ship thường là screenshot từ các task trước có Verify `light`/`full` (lưu trong `.agents/screenshots/`, vd `kitchen-drink-zone.png`), hoặc tin tổng hợp lúc /ship liệt kê các commit chưa lên main, nên không gắn với một lần chạy test cụ thể.
- Các task có chạy test: T04 (mobile Build UI, Verify T1/T2), T05 (custom decor); T02/T03/T06 là `none`/nhẹ.

## Plan
- [x] 1. [dễ] `.agents/tasks/2026-11-25-task-07-hien-tai-khi-duyet-ship-hinh-anh-ban-gui.md` → đọc `.agents/tasks/*.md` của T02–T06 (mục "Verify mode" và "Test status"), rồi viết vào "Trạng thái hiện tại" một bảng ngắn bằng tiếng Việt: task nào Verify mode gì, có chạy test không, vì sao; kèm giải thích ảnh lúc /ship đến từ đâu. Không sửa file nào khác.

## Test cases
Không có (task chỉ đọc, không đổi code).

## Trạng thái hiện tại
- Bước 1 xong: đã đọc mục "Verify mode" + "Test status" của T02–T06 và ghi bảng giải thích dưới đây. Không sửa file nào khác.

### Vì sao ảnh lúc duyệt ship không đi kèm test

| Task | Verify mode | Có chạy test? | Vì sao |
| --- | --- | --- | --- |
| T02 (favicon) | light | Có — `tests/favicon.spec.ts` T1 PASS | Task đổi `client/index.html` (thêm favicon) nên có spec riêng, Verify chụp `.agents/screenshots/task-02-favicon.png`. |
| T03 (page title) | none | Có — `tests/page-title.spec.ts` T1 PASS (chạy tay trong bước 2) | Verify mode `none` nên bỏ qua bước Verify, nhưng lúc làm có viết spec + chạy `-g "T1"`; không sinh ảnh Verify. |
| T04 (mobile Build UI) | light | Có — T1 FAIL (lỗi layout 4px, đã biết), T2 PASS | Verify chụp `.agents/screenshots/task-04-build-panel.png`, `task-04-build-selected.png`. |
| T05 (custom decor) | full | Có — `tests/custom-decor.spec.ts` T1/T2/T3 PASS, cả bộ 46 passed | Task lớn nhất, Verify đầy đủ. |
| T06 (kiểm tra nhanh staging) | none | Không (chỉ `git log`, `npm run typecheck` PASS) | Không đổi code app ⇒ không có test case, `none` = bỏ qua Verify, chỉ cần typecheck rồi ship. |

- Ảnh user nhận khi duyệt `/ship` đến từ hai nguồn: (1) screenshot của các task có Verify `light`/`full`, lưu sẵn trong `.agents/screenshots/` (vd `kitchen-drink-zone.png`, `task-02-favicon.png`, `task-04-build-panel.png`); (2) tin tổng hợp của `/ship` liệt kê commit chưa lên main. Cả hai không gắn với một lần chạy test cụ thể — với T06 (Verify `none`) thì đúng là không có e2e nào được chạy, chỉ typecheck.
- Docs checked: no change needed (task chỉ đọc/giải thích).

## Test status
- Lần chạy cuối: `npm run typecheck` — PASS (server + client)
- Kết quả từng test: không có test case (task chỉ đọc, không đổi code)

## Verify
Bỏ qua (Verify mode: none).

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
