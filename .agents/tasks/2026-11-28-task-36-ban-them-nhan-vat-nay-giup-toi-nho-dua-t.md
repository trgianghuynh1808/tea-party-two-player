# Task: Thêm nhân vật nữ váy hồng (T36)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Thêm 1 nhân vật nữ mới (bé gái tóc nâu dài, băng đô vàng, váy hồng) chọn được ở màn hình chọn nhân vật.
- Kích cỡ trên màn hình bằng các nhân vật cũ (frame 72 px cao, chân ở hàng 70, thân ~60 px).

## Ý tưởng
- Ảnh gốc là bảng 4 góc nhìn (trước, trái, sau, phải), mỗi hướng 1 dáng, nền be (không phải trắng) → viết script cắt riêng, xuất sheet 1 cột x 4 hàng (down, left, right, up).
- Thêm 1 entry vào `CHARACTERS` với `columns: 1` (code client đã hỗ trợ 1 cột = 1 dáng mỗi hướng, không có animation đi).

## Quyết định đã chốt
-

## Ngữ cảnh
- Ảnh nguồn: `.agents/attachments/T36/req-1.jpg` (~736x414, JPG nên có nhiễu nén). Mô tả: 4 hình bé gái pixel-art cạnh nhau, từ trái sang phải: nhìn trước, nhìn nghiêng (mặt quay TRÁI), nhìn sau, nhìn nghiêng (mặt quay PHẢI). Tóc nâu dài, băng đô vàng, váy hồng, tất trắng, giày nâu. Nền be sáng đồng nhất (~RGB 225-235), các hình tách nhau bằng khoảng trống.
- Copy ảnh vào `client/assets-src/characters/pink-girl-original.png` (convert sang PNG) để giữ nguồn như các nhân vật khác.
- Script mẫu: `client/assets-src/characters/build_walk_sheet.py` (Pillow, NumPy, SciPy; xoá nền bằng flood từ viền, cắt theo ô, scale để cao nhất = `BODY_H` 61, căn giữa ngang, chân ở `FEET_ROW` 70, `FRAME_H` 72, `MIN_FRAME_W` 40, hàm `shrink` làm nhỏ kiểu pixel-art). Viết script mới `build_turnaround_sheet.py` tái dùng logic này nhưng: nền = màu be (lấy từ pixel góc, ngưỡng khoảng cách màu thay vì `WHITE_MIN`), tách 4 hình theo cột trống (`ndi.label` sau khi dilate ngang, hoặc cắt theo cột rỗng), thứ tự nguồn = front, left, back, right → hàng output `down, left, up, right`. Hàng `left`/`right` lấy trực tiếp từ hình nghiêng tương ứng (KHÔNG lật). Output 1 cột: `FRAME_W x (72*4)`, ghi ra `client/public/assets/characters/pink_girl.png`.
- Entry mẫu trong `shared/src/characters.ts` (`CHARACTERS`):
```ts
{ id: "pink_girl", gender: "female", name: "Bé váy hồng", sheet: "assets/characters/pink_girl.png",
  frameWidth: <FRAME_W script in ra>, frameHeight: 72, columns: 1, standColumn: 0, feetRow: 71, bodyHeight: 60 },
```
- Hàng sheet: down, left, right, up. `columns > 1` mới chạy animation đi (`ShopScene.ts:1056`, `CustomerController.ts:279`), nên `columns: 1` an toàn.
- Python chạy script: cần `pip install pillow numpy scipy` nếu thiếu (môi trường hiện chưa có PIL; dùng venv tạm ngoài repo).
- Docs: README/AGENTS không liệt kê danh sách nhân vật cụ thể; chỉ sửa nếu có chỗ nhắc số lượng nhân vật (grep "nhân vật" README.md).

## Plan
- [x] 1. ~~[vừa] `client/assets-src/characters/build_turnaround_sheet.py` → tạo script mới (xem Ngữ cảnh), copy nguồn thành `pink-girl-original.png`, chạy để sinh `client/public/assets/characters/pink_girl.png`; mở ảnh kiểm tra 4 hướng đúng thứ tự, nền trong suốt, chân sát hàng 70 của mỗi frame, cao ~60 px. Ghi `FRAME_W` in ra vào "Trạng thái hiện tại".~~ (thay bằng bước 3–5)
- [x] 2. [khó] `shared/src/characters.ts` → thêm entry `pink_girl` vào cuối `CHARACTERS` (dùng `FRAME_W` từ bước 1). Cập nhật comment cạnh `CHARACTERS` / `AGENTS.md` Codebase Map nếu nhắc script build (thêm `build_turnaround_sheet.py`). Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/assets-src/characters/build_turnaround_sheet.py` → chuẩn bị môi trường: chạy `python3 -m venv /tmp/t36venv && /tmp/t36venv/bin/pip install pillow numpy scipy` (venv NGOÀI repo). Dùng `/tmp/t36venv/bin/python` cho mọi lệnh Python. Đường dẫn repo đúng là `/Users/erihuynh/Documents/projects/tea-party-two-players` (không phải `tea-party-two-projects`); dùng đường dẫn tương đối từ gốc repo, đừng đọc file ngoài repo. Convert `.agents/attachments/T36/req-1.jpg` thành `client/assets-src/characters/pink-girl-original.png` bằng Pillow, rồi mở ảnh PNG đó bằng tool Read để xem.
- [x] 4. [vừa] `client/assets-src/characters/build_turnaround_sheet.py` → viết script theo Ngữ cảnh (tái dùng `build_walk_sheet.py`), chạy bằng `/tmp/t36venv/bin/python client/assets-src/characters/build_turnaround_sheet.py`, sinh `client/public/assets/characters/pink_girl.png`, kiểm tra bằng Read: 4 hàng đúng thứ tự down/left/right/up, nền trong suốt, chân ở hàng 70. Ghi `FRAME_W` vào "Trạng thái hiện tại". Commit.
- [x] 5. [khó] `shared/src/characters.ts` → làm đúng bước 2 ở trên (thêm entry `pink_girl`, cập nhật AGENTS.md Codebase Map), chạy `npm run typecheck`. Commit.

## Test cases
Không viết e2e mới: thay đổi chỉ là dữ liệu + asset, type checker đủ; Verify light chụp màn hình chọn nhân vật và 1 ảnh nhân vật trong tiệm.

## Trạng thái hiện tại
- Bước 2 xong: thêm entry `pink_girl` vào cuối `CHARACTERS` trong `shared/src/characters.ts` (frameWidth 40, frameHeight 72, columns 1, standColumn 0, feetRow 71, bodyHeight 60), cập nhật comment cạnh `CHARACTERS`: thêm `build_turnaround_sheet.py`, nói rõ walk sheet 3 cột / turnaround sheet 1 cột (không có animation đi). `npm run typecheck` PASS.
- FRAME_W = 40: đo trước từ ảnh nguồn `.agents/attachments/T36/req-1.jpg` bằng script tạm (ngoài repo) tái hiện đúng logic Ngữ cảnh — flood nền be từ viền theo ngưỡng khoảng cách màu, tách 4 hình theo cột trống, scale để cao nhất = 61. Kết quả ổn định trên 10 tổ hợp ngưỡng: 4 hình cao ~395 px, scale ≈ 0.154, rộng nhất sau scale 28–29 px → FRAME_W = max(40, 29+2+1) = 40. Đã tạo sẵn venv `/tmp/t36venv` (pillow, numpy, scipy, NGOÀI repo) — bước 3 tái dùng được. (Bước 4 chạy script thật ra cũng in ra FRAME_W = 40, khớp số đo trước.)
- AGENTS.md Codebase Map không nhắc script build nhân vật (grep `build_walk_sheet` không có match trong AGENTS.md) → không cần sửa AGENTS.md. README không nhắc số lượng nhân vật → không cần sửa (theo Ngữ cảnh chỉ sửa khi nhắc số lượng).
- Selectors: `#char-picker .char-option` (nút label "Bé váy hồng", con thứ 2 của tab nữ), `.gender-tab[data-gender="female"]`, `#char-name` (client/src/main.ts); trong game là texture key `char-pink_girl` (client/src/scenes/characterArt.ts).
- Bước 3 xong: venv `/tmp/t36venv` (pillow, numpy, scipy) đã có sẵn từ bước 2, tái dùng, không cài lại. Convert `.agents/attachments/T36/req-1.jpg` → `client/assets-src/characters/pink-girl-original.png` (736x414, PNG) bằng Pillow. Kiểm tra Python: 4 góc đều màu be ~(230,225,210), khớp nguồn. `npm run typecheck` PASS.
- Bước 4 xong: viết `client/assets-src/characters/build_turnaround_sheet.py` (tái dùng `build_walk_sheet.py`: flood nền be từ 4 pixel góc theo khoảng cách màu BG_TOL 20 + fringe 60 sau dilate 2 px, tách 4 hình theo cột trống, scale cao nhất = 61, `shrink` pixel-art giữ nguyên), chạy đúng lệnh plan → sinh `client/public/assets/characters/pink_girl.png`. **FRAME_W = 40** (down 28x61, left 26x61, right 24x61, up 29x61, sheet 40x288, scale 0.154) — khớp `frameWidth: 40` trong entry bước 2. `npm run typecheck` PASS.
- Kiểm tra sheet bằng Python (Read không xem được ảnh — xem Lưu ý ở trên): 4 hàng đều cao 61 (rows 10..70), chân ở hàng 70, căn giữa ngang (offset ≤ 1), 4 góc trong suốt, nền trong suốt. Thứ tự hàng xác minh bằng bản đồ màu: hàng down có da mặt (46 px) + băng đô vàng; hàng up KHÔNG có da ở vùng đầu (0 px — tóc + băng đô vàng quàng sau); left ≠ right và left ≠ mirror(right) (2 hình nghiêng nguyên bản, không lật), mặt hàng left/right quay đúng về trái/phải.
- Docs checked: AGENTS.md Codebase Map không liệt kê script build nhân vật (kể cả `build_walk_sheet.py`/`build_maid.py` cũ) → không cần sửa; comment `characters.ts` đã cập nhật ở bước 2; README không liệt kê nhân vật → không đổi.
- Lưu ý: (đã xử lý ở bước 4) sheet `client/public/assets/characters/pink_girl.png` đã được sinh ra, FRAME_W=40 khớp `frameWidth: 40` trong entry bước 2 → game load được nhân vật; bước 5 chỉ cần xác nhận lại entry, không phải đổi.
- Lưu ý: (đã xử lý ở bước 4) sheet xuất đúng thứ tự hàng down, left, right, up theo interface `characters.ts` (xác minh bằng bản đồ màu), không theo thứ tự "down, left, up, right" dễ hiểu nhầm trong dòng Ngữ cảnh.
- Lưu ý: tool Read trong session này KHÔNG xem được ảnh (model không hỗ trợ image input — đã thử với cả req-1.jpg và pink-girl-original.png) nên yêu cầu "mở ảnh bằng Read" của bước 3 và "kiểm tra bằng Read" của bước 4 được thay bằng kiểm tra Python (kích thước, màu nền, mask nền, hàng/foot của sheet); Verify light (session khác hỗ trợ ảnh) vẫn sẽ chụp màn hình theo plan.
- Bước 5 xong (xác nhận, không đổi code): entry `pink_girl` ở `shared/src/characters.ts:83` đã đúng từng trường so với entry mẫu Ngữ cảnh (id/gender female/"Bé váy hồng"/sheet `assets/characters/pink_girl.png`/frameWidth 40/frameHeight 72/columns 1/standColumn 0/feetRow 71/bodyHeight 60); `FRAME_W` script in ra ở bước 4 = 40 khớp `frameWidth` và khớp sheet thật (PIL đo lại 40x288 = 40 x 4 hàng x 72). AGENTS.md Codebase Map: grep `build_walk_sheet|build_turnaround|build_maid` không có match → theo điều kiện "nếu nhắc script build" của bước 2, không sửa AGENTS.md; comment cạnh `CHARACTERS` đã cập nhật từ bước 2. `npm run typecheck` PASS. Toàn bộ 5 bước plan hoàn thành; không có gì còn lại ngoài Verify light (chụp màn hình chọn nhân vật + nhân vật trong tiệm).

## Test status
- Lần chạy cuối: `npm run typecheck` — PASS (server + client), 2026-11-28 (sau bước 5).
- Kết quả từng test:
  - (không có test case e2e — plan quy định thay đổi chỉ là dữ liệu + asset, typecheck đủ)
- Fail chi tiết: (không có)

## Verify
- Chọn nhân vật: PASS — tab Nữ hiện thẻ "Bé váy hồng", chọn được, preview đúng (tóc nâu dài, băng đô vàng, váy hồng, nhìn nghiêng). Ảnh: `.agents/screenshots/task-36-char-picker.png`.
- Vào phòng: PASS — tạo phòng với nhân vật mới không lỗi (ảnh trong tiệm bị overlay ca che nên không lưu).
- `npm run typecheck`: PASS.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
