# Task: Kiểm tra commit có trên staging nhưng chưa có trên main

APPROVED_BY_MANAGER

Verify mode: none

## Mục tiêu
- Báo user danh sách commit trên `staging` chưa có trên `main`. Không đổi code app.

## Quyết định đã chốt
- Task chỉ đọc (read-only). Tech Lead đã chạy `git log --oneline main..staging` lúc lên plan, kết quả ghi ở "Ngữ cảnh".

## Ngữ cảnh
- `git log --oneline main..staging` (lúc lên plan):
  - `74aa993 chore: update kit (76d71d6)`
  - `bee0234 chore: update kit (friendly messages, step reports, ordering, safe ship clean-up)`
- Cả hai chỉ là commit "update kit" (scripts/.agents tooling), không phải tính năng app.
- `git log --oneline staging..main` chỉ có các merge commit (main có merge commit riêng, bình thường).
- Không có test: task không đổi hành vi app.

## Plan
- [x] 1. [dễ] `.agents/tasks/2026-11-25-task-06-ban-kiem-tra-nhanh-staging-xem-commit-na.md` → chạy lại `git log --oneline main..staging`, ghi kết quả vào "Trạng thái hiện tại" (không sửa file nào khác).

## Test cases
Không có (task chỉ đọc, không đổi code).

## Trạng thái hiện tại
- Đã chạy lại `git log --oneline main..staging`, kết quả khớp với "Ngữ cảnh":
  - `74aa993 chore: update kit (76d71d6)`
  - `bee0234 chore: update kit (friendly messages, step reports, ordering, safe ship clean-up)`
- Cả hai là commit "update kit" (scripts/.agents tooling), không phải tính năng app. Không đổi code app.
- `npm run typecheck` PASS (server + client).
- Docs checked: no change needed (task chỉ đọc).

## Test status
- Lần chạy cuối: `npm run typecheck` — PASS
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
