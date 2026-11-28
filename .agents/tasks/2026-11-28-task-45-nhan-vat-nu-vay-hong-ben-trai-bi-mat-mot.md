# Task: Sửa sprite "Bé váy hồng" bị mất một phần (hướng trái)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Sprite nhân vật "Bé váy hồng" (`pink_girl`) không còn bị mất/thủng pixel ở hướng nhìn trái (và các hướng khác nếu có cùng lỗi); khớp với ảnh gốc.

## Ý tưởng
- Lỗi nằm ở bước tách nền trong script build sheet (BG_TOL/FRINGE_TOL ăn mất pixel da/má/tay gần màu nền be, hoặc cắt cột khi tách 4 hình). So sánh từng hàng của sheet với ảnh gốc, chỉnh script, build lại sheet.
- Không đổi `shared/src/characters.ts` trừ khi kích thước frame đổi.

## Quyết định đã chốt
-

## Ngữ cảnh
- Sheet: `client/public/assets/characters/pink_girl.png` (40x288, 4 hàng 40x72: down, left, right, up; 1 cột). Gốc: `client/assets-src/characters/pink-girl-original.png` (4 hình cạnh nhau: front, left, back, right; nền be).
- Script: `client/assets-src/characters/build_turnaround_sheet.py` (chạy `client/assets-src/tools/.venv-art/bin/python client/assets-src/characters/build_turnaround_sheet.py pink-girl`; có Pillow/NumPy/SciPy trong venv đó). Tham số: `BG_TOL = 20`, `FRINGE_TOL = 60`, dilation 2 vòng quanh nền, ngưỡng `keep = a_s >= 128`.
- Nghi vấn: hàng "left" (mặt quay trái) nhìn phóng 6x thấy mặt/cằm/má bên trái bị rỗng/khuyết so với gốc vì da gần màu nền. Chưa chắc 100%: phải đối chiếu từng hàng với ảnh gốc (render sheet phóng 6x trên nền xanh lá để thấy lỗ thủng). Ví dụ: `Image.alpha_composite` lên nền màu rồi `resize(..., 0)`.
- Cách sửa gợi ý: chỉ coi là nền các vùng be nối với biên ảnh (đã làm) và bỏ/giảm bước dilation+FRINGE ăn vào trong; hoặc lấp lỗ bên trong hình (`ndi.binary_fill_holes` trên `fg`) và hạ `BG_TOL`. Sau khi sửa phải kiểm tra 4 hàng đều không còn lỗ và viền không còn viền be.
- Nếu frame width đổi thì cập nhật `frameWidth` của pink_girl trong `shared/src/characters.ts` (hiện 40).
- Test: Playwright không import được module server TS. Không cần test e2e (lỗi là ảnh tĩnh); dùng kiểm tra tự động bằng script ảnh bên dưới + typecheck.

## Plan
- [x] 1. [vừa] `client/assets-src/characters/build_turnaround_sheet.py` → sửa phần tách nền (mask `bg`/`fg`) để không còn mất pixel bên trong hình (nhất là hàng left), rồi chạy script để ghi lại `client/public/assets/characters/pink_girl.png`. Kiểm tra: không còn pixel trong suốt "lỗ" bên trong thân (dùng `ndi.binary_fill_holes` so sánh alpha từng frame: số pixel lỗ = 0), 4 frame vẫn nằm trong 40x72, chân ở hàng 70/71.
- [ ] 2. [dễ] `client/public/assets/characters/pink_girl.png` → mở ảnh phóng 6x trên nền xanh, đối chiếu với `pink-girl-original.png`, xác nhận hướng trái đầy đủ (mặt, má, tay, váy, giày). Chạy `npm run typecheck`. Ghi kết quả vào "Trạng thái hiện tại" (kèm "Docs checked: no change needed" nếu không đổi docs).

## Test cases
- [x] T1. Sheet không có lỗ — alpha mỗi frame của `pink_girl.png` không có lỗ bên trong — kiểm tra bằng script Python một lần (không cần spec)
  - Setup: sheet đã build lại
  - Steps: 1. cắt 4 frame 40x72 · 2. với mỗi frame so `alpha>0` với `binary_fill_holes(alpha>0)`
  - Assert: số pixel khác nhau = 0 ở cả 4 frame

## Trạng thái hiện tại
- Bước 1 xong (commit `04f75c8`, nhánh `task/task-45-nhan-vat-nu-vay-hong-ben-trai-bi-mat-mot`): bỏ hẳn bước `bg = ndi.binary_dilation(bg, iterations=2) & (dist <= FRINGE_TOL)` và hằng `FRINGE_TOL` trong `build_turnaround_sheet.py`; mask giờ chỉ gồm nền be nối với biên ảnh (`BG_TOL = 20` giữ nguyên). Chạy script lại → sinh `client/public/assets/characters/pink_girl.png` mới (40x288, frame 40x72, scale 0.153, down 28x61 / left 26x61 / right 24x61 / up 29x61, chân đáy hàng 70).
- Chẩn đoán đo được: mask cũ ăn 2.649 pixel hình (front 589 / left 742 / back 615 / right 703) vì da sáng cách nền be ~21 và da mid-tone ~45-60 (trong `FRINGE_TOL=60`), trong khi nền be chạm thẳng viền hình (không có "viền mềm" nào để trim) → mask mới ăn 0 pixel hình.
- Kiểm tra tự động (script Python, venv `.venv-art`): lỗ `binary_fill_holes` = 0 ở cả 4 frame; bounds mỗi frame trong 40x72; hàng chân = 70; pixel viền màu be (rim be, dist ≤ 20 tiếp giáp trong suốt) = 0 ở 4 frame. `npm run typecheck` PASS.
- Docs checked: no change needed (README.md / AGENTS.md không nhắc `build_turnaround_sheet.py`, `FRINGE_TOL` hay chi tiết mask sheet này; grep xác nhận).
- Không đổi `shared/src/characters.ts`: `FRAME_W` vẫn 40, khớp `frameWidth: 40` hiện có.
- Lưu ý: sheet mới khác sheet cũ khá ít ở alpha cuối (left +7/−3 px rải rác ở viền thân tay/váy, vùng mặt hàng 16–21 không đổi) vì bước box-downscale + ngưỡng 128 đã hấp thụ phần lớn xói 2 px của mask cũ; nhưng mask giờ giữ toàn bộ pixel da (đặc biệt hàng left) nên sheet được build từ dữ liệu gốc không bị hủy — kết luận "mặt/cằm/má đầy đủ như gốc" cần bước 2 soi ảnh phóng 6x (chưa làm theo chỉ dẫn chỉ làm bước 1).
- Lưu ý: các túi nền be khép kín trong hình (khe chân/váy) vẫn giữ nguyên opaque màu be (7–14 px/frame, như sheet cũ) — nếu làm trong suốt sẽ tạo lỗ `binary_fill_holes` và fail T1.
- Lưu ý: session này không xem được ảnh bằng tool Read (model không hỗ trợ image input) nên mọi kết luận ảnh đều bằng phân tích pixel (NumPy/SciPy), giống task-36.

## Test status
- Lần chạy cuối: script Python một lần (venv `client/assets-src/tools/.venv-art`), ngày 28-11-2026, sau khi build lại sheet; `npm run typecheck` PASS.
- Kết quả từng test:
  - T1: PASS — 4 frame 40x72 của `pink_girl.png`: số pixel khác nhau giữa `alpha>0` và `binary_fill_holes(alpha>0)` = 0 (down/left/right/up đều 0).
- Fail chi tiết: -

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa: 0
- Model dùng: opencode-go/glm-5.3
