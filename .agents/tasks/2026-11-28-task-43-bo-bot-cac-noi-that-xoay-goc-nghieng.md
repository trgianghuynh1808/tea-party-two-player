# Task: T43 bỏ bớt các nội thất xoay góc nghiêng

APPROVED_BY_MANAGER

Verify mode: none

## Mục tiêu
- Xóa khỏi catalog 2 món người dùng nhắc tới: lò sưởi (`fireplace_white`) và ghế đỏ (`armchair_baroque`, "Ghế bành hoàng gia").

## Ý tưởng
- Bỏ 2 kind khỏi `DECORATION_CATALOG`, xóa 2 PNG và 2 dòng cắt trong `cut_furniture.py`.
- Cập nhật `tests/decor-catalog.spec.ts` (đưa 2 kind sang danh sách đã xóa, bớt khỏi danh sách còn lại).
- Save cũ chứa kind đã xóa tự bị bỏ qua như các lần xóa trước (T17).

## Quyết định đã chốt
- Người dùng chỉ nói "lò sưởi và ghế màu đỏ" nên chỉ xóa đúng 2 món này. `stove` (Lò sưởi gang, ảnh bếp lò chính diện) giữ nguyên.

## Ngữ cảnh
- `shared/src/decor.ts`: dòng `{ ...decor("armchair_baroque", ...), role: "seat" },` (~227) và `decor("fireplace_white", "Lò sưởi trắng", ...)` (~287).
- Ảnh: `client/public/assets/decor/furniture/armchair_baroque.png`, `.../fireplace_white.png`.
- `client/assets-src/tools/cut_furniture.py` dòng 26 (`armchair_baroque`) và 31 (`fireplace_white`): xóa 2 tuple.
- `tests/decor-catalog.spec.ts`: `REMOVED_ITEMS` (~dòng 40-65, dạng `{ kind, image: "furniture/x.png" }`, test T2 tiêu đề "37 removed") và `NEW_FURNITURE` (~dòng 78, test T3 "6 remaining"). Không dùng window.__GAME__, test thuần đọc catalog; chạy `npx playwright test tests/decor-catalog.spec.ts`.
- Mẫu lần xóa trước: commit 7897ee4. Grep lại `armchair_baroque|fireplace_white` ngoài `.agents/tasks/` phải hết kết quả.

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: xóa 2 kind; xóa 2 PNG; xóa 2 dòng trong `client/assets-src/tools/cut_furniture.py`. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/decor-catalog.spec.ts` → thêm 2 kind vào `REMOVED_ITEMS` (đổi tiêu đề T2 thành 39), bỏ khỏi `NEW_FURNITURE` (T3: còn 4 món, chỉ `armchair_cream` là seat; sửa tiêu đề/số đếm cho khớp). Chạy `npx playwright test tests/decor-catalog.spec.ts`.
- [x] 3. [vừa] `README.md` → grep `fireplace|baroque|Lò sưởi trắng|hoàng gia` trong README.md/AGENTS.md, sửa nếu có nhắc; ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Món đã xóa — 2 kind không còn trong catalog/đĩa, món lân cận còn — tests/decor-catalog.spec.ts
  - Setup: không cần user/phiên, test thuần catalog.
  - Steps: 1. thêm `armchair_baroque`, `fireplace_white` vào `REMOVED_ITEMS` · 2. bỏ khỏi `NEW_FURNITURE`
  - Assert: `getDecorationDef` của 2 kind là undefined, 2 PNG không tồn tại; `armchair_cream`, `globe` vẫn còn.

## Trạng thái hiện tại
Lưu ý: yêu cầu gốc mơ hồ ("xoay góc nghiêng"); mình chỉ xóa 2 món người dùng nêu (lò sưởi trắng, ghế bành hoàng gia đỏ). Nếu còn món khác cần bỏ thì làm task tiếp.
- Bước 1 xong (commit 0e4f1c8): xóa `armchair_baroque`, `fireplace_white` khỏi `DECORATION_CATALOG` (shared/src/decor.ts), xóa 2 PNG tương ứng, bỏ 2 tuple khỏi `cut_furniture.py` (docstring 6 → 4 món). `stove` (Lò sưởi gang) giữ nguyên theo Quyết định đã chốt.
- Bước 2 xong (commit c7378b7): thêm 2 kind vào `REMOVED_ITEMS` (T2 đổi tiêu đề 37 → 39), bỏ khỏi `NEW_FURNITURE` (T3: còn 4 món — `armchair_cream`, `lamp_arc_brass`, `lamp_shade_white`, `globe` — chỉ `armchair_cream` là seat). Grep `armchair_baroque|fireplace_white` ngoài `.agents/tasks/` chỉ còn 2 dòng trong `REMOVED_ITEMS` của spec (bản ghi món đã xóa, như mẫu 7897ee4).
- Bước 3 xong: Docs checked — grep `fireplace|baroque|Lò sưởi trắng|hoàng gia` trong README.md/AGENTS.md không có kết quả, không cần sửa.

## Test status
- Lần chạy cuối: `npx playwright test tests/decor-catalog.spec.ts` (bước 2): 19/19 PASS (6.5s); `npm run typecheck` PASS sau mỗi bước (1, 2, 3).
- Kết quả từng test:
  - T1: PASS — phủ qua T2 (2 kind undefined + 2 PNG đã xóa) và T3 (`armchair_cream`, `globe` còn trong catalog)
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
