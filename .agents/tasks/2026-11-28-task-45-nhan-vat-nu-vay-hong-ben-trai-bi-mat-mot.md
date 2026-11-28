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
- [ ] 1. [vừa] `client/assets-src/characters/build_turnaround_sheet.py` → sửa phần tách nền (mask `bg`/`fg`) để không còn mất pixel bên trong hình (nhất là hàng left), rồi chạy script để ghi lại `client/public/assets/characters/pink_girl.png`. Kiểm tra: không còn pixel trong suốt "lỗ" bên trong thân (dùng `ndi.binary_fill_holes` so sánh alpha từng frame: số pixel lỗ = 0), 4 frame vẫn nằm trong 40x72, chân ở hàng 70/71.
- [ ] 2. [dễ] `client/public/assets/characters/pink_girl.png` → mở ảnh phóng 6x trên nền xanh, đối chiếu với `pink-girl-original.png`, xác nhận hướng trái đầy đủ (mặt, má, tay, váy, giày). Chạy `npm run typecheck`. Ghi kết quả vào "Trạng thái hiện tại" (kèm "Docs checked: no change needed" nếu không đổi docs).

## Test cases
- [ ] T1. Sheet không có lỗ — alpha mỗi frame của `pink_girl.png` không có lỗ bên trong — kiểm tra bằng script Python một lần (không cần spec)
  - Setup: sheet đã build lại
  - Steps: 1. cắt 4 frame 40x72 · 2. với mỗi frame so `alpha>0` với `binary_fill_holes(alpha>0)`
  - Assert: số pixel khác nhau = 0 ở cả 4 frame

## Trạng thái hiện tại

## Test status
- Lần chạy cuối:
- Kết quả từng test:
  - T1: chưa viết
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
