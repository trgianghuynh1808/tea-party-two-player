# Task: Ảnh verify gửi kèm báo cáo bị lệch (ảnh không liên quan task)

APPROVED_BY_MANAGER

Verify mode: none
<!-- Tooling của daemon, không đổi game/UI: không cần chụp ảnh Verify. -->

## Ý tưởng
- Nguyên nhân: `scripts/room-ops.py` → bước D (Verify) coi MỌI ảnh trong `.agents/screenshots/` có mtime ≥ lúc bắt đầu task là "ảnh của task" (`new_shots`), không xét tên. Ảnh của task khác, ảnh Playwright/tool tự sinh, hay ảnh cũ được sửa lại đều lọt vào báo cáo.
- Cách sửa: chỉ nhận ảnh có tên `task-NN-*` (NN = số task) hoặc chứa slug, đúng như quy ước đã dặn Tech Lead; bỏ đường tắt theo cửa sổ thời gian.
- Thêm một test Python nhỏ cho hàm lọc ảnh.

## Mục tiêu
- Báo cáo Verify/finalize/ship của một task chỉ đính kèm ảnh thuộc task đó (tên `task-NN-*` hoặc chứa slug).
- Ảnh không đặt tên theo quy ước không bao giờ được gửi, dù mtime nằm trong thời gian chạy task.

## Quyết định đã chốt
- Không còn fallback theo thời gian. Task không có ảnh đúng tên thì báo "không có ảnh" (đúng với Verify mode `none`).
- Không đổi prompt Tech Lead (đã yêu cầu tên `task-NN-`).

## Ngữ cảnh
- `scripts/room-ops.py`:
  - `screenshots()` (~dòng 1023): glob `.agents/screenshots/**` (bỏ `/archive/`), sort theo mtime.
  - `task_screenshots(t, limit=4, recorded=None)` (~dòng 843): lấy `recorded` (từ `st["task_shots"]`) + file có `base.startswith(f"task-{NN:02d}-")` hoặc `t["slug"] in base`. `t = {"id": "T13", "slug": ...}`.
  - Bước D (~dòng 1299): `new_shots = [f for f in shots if f not in st["shots"] and os.path.getmtime(f) >= st["t0"] - 5]` → đây là chỗ lọt ảnh lạ; kết quả ghi vào `st["shots"]`, `st["task_shots"]`, và gửi trong báo cáo FAIL (`images=new_shots[-3:]`).
- Thêm helper, ví dụ:
  ```python
  def is_task_shot(t, path):
      base = os.path.basename(path)
      return base.startswith(f"task-{int(t['id'][1:]):02d}-") or t["slug"] in base
  ```
  dùng chung ở `task_screenshots` và bước D (trong bước D, `t` đã có sẵn trong hàm `cmd_progress`-tương đương quanh dòng 1225; dùng đúng biến task ở đó).
- File tên có dấu gạch (`room-ops.py`) nên test nạp bằng `importlib.util.spec_from_file_location`. Chạy bằng `python3 -I tests/room_ops_shots.py` (không phải Playwright).
- Script này được copy từ kit `/Users/erihuynh/Documents/projects/claude-opencode-kit` (commit "update kit" ghi đè); chỉ sửa bản trong repo, không sửa kit.

## Plan
- [x] 1. [vừa] `scripts/room-ops.py` → thêm `is_task_shot(t, path)`; dùng trong `task_screenshots` (thay điều kiện lặp lại) và trong bước D: `new_shots` chỉ giữ file thoả `is_task_shot` (bỏ điều kiện mtime, nhưng vẫn loại file đã có trong `st["shots"]`). Cập nhật docstring `task_screenshots`.
- [x] 2. [vừa] `tests/room_ops_shots.py` → test Python tự chứa (nạp `scripts/room-ops.py` bằng importlib, tạo thư mục tạm, gọi `is_task_shot` / `task_screenshots`); chạy `python3 -I tests/room_ops_shots.py` phải thoát 0.

## Test cases
- [x] T1. Lọc ảnh theo task — ảnh task khác/không tên chuẩn bị loại — tests/room_ops_shots.py
  - Setup: `t = {"id": "T13", "slug": "task-13-abc"}`; các đường dẫn giả `task-13-panel.png`, `task-04-build.png`, `edge-layout.png`, `run-task-13-abc-x.png`.
  - Steps: 1. gọi `is_task_shot(t, p)` cho từng đường dẫn · 2. tạo file thật trong thư mục tạm (đặt `AG` của module trỏ vào đó) rồi gọi `task_screenshots(t, recorded=[])`.
  - Assert: True cho `task-13-panel.png` và `run-task-13-abc-x.png`; False cho `task-04-build.png` và `edge-layout.png`; `task_screenshots` chỉ trả 2 file đúng.

## Trạng thái hiện tại
- Bước 1 xong: `scripts/room-ops.py` có `is_task_shot(t, path)` (dòng ~843); `task_screenshots` dùng lại helper (bỏ đoạn lặp prefix/slug, docstring bỏ "time window"); bước D: `new_shots` lọc theo `is_task_shot`, bỏ điều kiện mtime, vẫn loại file đã có trong `st["shots"]`. Key `st["t0"]` không còn ai đọc nhưng giữ nguyên (plan không yêu cầu bỏ).
- Bước 2 xong: `tests/room_ops_shots.py` (T1) — nạp `scripts/room-ops.py` qua importlib, tạo thư mục tạm làm `AG`, kiểm `is_task_shot` trên 4 đường dẫn giả và `task_screenshots(t, recorded=[])` trên file thật; `python3 -I tests/room_ops_shots.py` thoát 0.
- `npm run typecheck` PASS sau cả 2 bước.
- Docs checked: no change needed (chỉ sửa tooling daemon, không động game/UI/protocol; README/AGENTS không nói gì về logic ảnh trong room-ops.py).

## Test status
- Lần chạy cuối: `python3 -I tests/room_ops_shots.py` → T1 PASS, exit 0.
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Lưu ý
- Lưu ý: script nằm trong kit; lần "update kit" sau có thể ghi đè bản sửa, nên nên áp dụng cùng fix vào repo kit.

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
