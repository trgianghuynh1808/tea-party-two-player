# Task: Thu nhỏ cần câu (follow-up T25)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Cần câu (sprite `rod.png`, 151x169 px) đang vẽ ở tỉ lệ 1:1 nên quá to so với nhân vật; thu nhỏ cho vừa tay nhân vật.
- Dây màu theo level vẫn nối đúng từ đầu cần xuống phao.

## Ý tưởng
- Thêm hằng `ROD_SCALE` (~0.4) trong `PondView.ts`, gọi `rod.setScale(ROD_SCALE)`.
- Nhân `ROD_SCALE` vào offset `ROD_LINE_ANCHOR - ROD_HANDLE` khi vẽ dây để dây vẫn nối đúng đầu cần.
- T25 đã merge vào staging; task này chỉ chỉnh kích thước, Manager sẽ ship cả hai.

## Quyết định đã chốt
- Chỉ chỉnh kích thước hiển thị, không đổi art/`cut_rod.py`.

## Ngữ cảnh
- `client/src/scenes/PondView.ts`: `ROD_HANDLE = {x:130,y:150}` (tay cầm = origin), `ROD_LINE_ANCHOR = {x:1,y:139}` (đầu dây trong ảnh). Trong `drawLines()` rod tạo bằng `add.image(player.x, player.y+6, ROD_TEXTURE)` + `setOrigin(ROD_HANDLE.x/rod.width, ROD_HANDLE.y/rod.height)`; dây vẽ `lineBetween(player.x + ROD_LINE_ANCHOR.x - ROD_HANDLE.x, player.y + 6 + ROD_LINE_ANCHOR.y - ROD_HANDLE.y, hookX, hookY)`.
- Ảnh gốc 151x169 → ở scale 0.4 còn ~60x68 px, hợp với nhân vật (thân ~40 px). Dev có thể chỉnh 0.35–0.45 nếu nhìn lệch.
- `tests/fishing.spec.ts` T5 đã kiểm tra rod hiện/ẩn (`pondRod()`); không cần test mới.

## Plan
- [x] 1. [dễ] `client/src/scenes/PondView.ts` → thêm `const ROD_SCALE = 0.4;`; trong `drawLines()` gọi `rod.setScale(ROD_SCALE)` khi tạo rod; nhân `ROD_SCALE` vào `(ROD_LINE_ANCHOR.x - ROD_HANDLE.x)` và `(ROD_LINE_ANCHOR.y - ROD_HANDLE.y)` của `lineBetween`. Chạy `npm run typecheck` và `npx playwright test tests/fishing.spec.ts -g "T5"`.

## Test cases
- [x] T1. Rod sprite vẫn hiện khi thả câu — đã có sẵn, chỉ chạy lại — tests/fishing.spec.ts (test "T5: rod sprite shows while the hook is out")
  - Setup: không đổi, spec có sẵn
  - Steps: chạy `npx playwright test tests/fishing.spec.ts -g "T5"`
  - Assert: PASS

## Trạng thái hiện tại
- Bước 1 xong: thêm `ROD_SCALE = 0.4` trong `client/src/scenes/PondView.ts`, gọi `rod.setScale(ROD_SCALE)` khi tạo rod và nhân `ROD_SCALE` vào offset `ROD_LINE_ANCHOR - ROD_HANDLE` của `lineBetween`; dây màu level vẫn nối đúng đầu cần xuống phao. `npm run typecheck` PASS, `npx playwright test tests/fishing.spec.ts -g "T5"` PASS.
- Docs checked: no change needed (chỉ chỉnh kích thước hiển thị, không đổi art/`cut_rod.py` hay hành vi).

## Test status
- Lần chạy cuối: 2026-11-26, `npx playwright test tests/fishing.spec.ts -g "T5"`
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết: không có

## Verify
- Cả bộ e2e: 69 passed. `npm run typecheck` PASS.
- T1 (rod hiện khi thả câu): PASS.
- Ảnh: `.agents/screenshots/task-26-rod-scaled.png` — cần câu vừa tay nhân vật, dây nối từ đầu cần xuống phao: PASS.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
