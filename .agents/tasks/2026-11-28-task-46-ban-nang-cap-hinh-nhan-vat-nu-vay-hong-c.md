# Task: Bé váy hồng có animation bước chân (3 frame/hướng)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Bé váy hồng (`pink_girl`) đi lại có animation bước chân như các nhân vật khác (step, stand, step), không còn trượt đứng yên một tư thế.
- Giữ nguyên hình dáng/kích thước, 4 hướng (xuống, trái, phải, lên), đứng yên vẫn dùng tư thế gốc.

## Ý tưởng
- Nguồn chỉ có 1 tư thế mỗi hướng (`pink-girl-original.png`), không có art bước chân thật. Dùng script Python sinh 2 frame bước từ tư thế đứng: tách vùng chân (từ dưới váy xuống giày) thành chân trái/phải rồi nhấc/dịch lệch nhau 1-2 px, cả thân nhún nhẹ 1 px.
- Hướng xuống/lên: chân trái nhấc ở frame 0, chân phải nhấc ở frame 2. Hướng trái/phải (nhìn nghiêng): hai chân dịch ngược chiều nhau theo trục ngang.
- Đổi `pink_girl` sang `columns: 3`, `standColumn: 1`; client đã tự chạy WALK_COLUMNS khi `columns > 1`.

## Quyết định đã chốt
-

## Ngữ cảnh
- Script hiện tại: `client/assets-src/characters/build_turnaround_sheet.py` (bg be, tách 4 hình front/left/back/right, scale về BODY_H=61, FEET_ROW=70, FRAME_H=72, MIN_FRAME_W=40, xuất 1 cột/hướng ra `client/public/assets/characters/pink_girl.png`). Chạy: `python3 client/assets-src/characters/build_turnaround_sheet.py` (cần Pillow, NumPy, SciPy; nếu thiếu thì `pip install` vào venv tạm ngoài repo). Cuối script: mảng `out` shape `(FRAME_H*4, FRAME_W, 4)`, hàng theo thứ tự down, left, right, up. Cần đổi thành `(FRAME_H*4, FRAME_W*3, 4)`, cột 0=step, 1=stand (nguyên bản), 2=step.
- Các sheet đi bộ khác: cột 3 frame, hàng down/left/right/up, ví dụ `schoolgirl.png` có frameWidth 52. FRAME_W của pink_girl phải khớp `frameWidth` trong `shared/src/characters.ts` (mục `id: "pink_girl"`, hiện `frameWidth: 40, columns: 1, standColumn: 0`). Script in ra FRAME_W thực tế; nếu khác 40 thì cập nhật frameWidth.
- Sửa `shared/src/characters.ts` mục `pink_girl`: `columns: 3`, `standColumn: 1`, sửa comment "built by" cho đúng. Cập nhật docstring của `CHARACTERS` (đang nói single-pose sheet dùng cho turnaround) nếu còn đúng thì giữ.
- Client dùng sẵn: `WALK_COLUMNS = [0,1,2,1]`, `WALK_FPS = 8` (`client/src/scenes/characterArt.ts`); `ShopScene.ts` ~dòng 1056 chỉ animate khi `columns > 1`. Không cần sửa client.
- Cách sinh frame bước: với mỗi hướng, lấy mảng figure đã scale (`front,left,back,right` sau `shrink`). Vùng chân = các hàng từ y_legs (~ hàng cách đáy figure 14-16 px, dưới viền váy) đến đáy. Hướng down/up: chia vùng chân ở cột giữa, bên được "nhấc" dịch lên 2 px (giữ bàn chân không chui xuống dưới FEET_ROW), bên kia giữ nguyên; frame 2 đảo bên. Hướng left/right: chia chân thành 2 nửa theo cột, nửa trước dịch +1..2 px theo hướng nhìn, nửa sau dịch -1..2 px, nhấc 1 px; frame 2 đảo. Phần thân phía trên không đổi (hoặc nhún lên 1 px ở cả hai frame bước). Không để chân thò ra ngoài FRAME_W hay dưới FEET_ROW; giữ viền pixel cứng alpha 0/255.
- Test facts: `window.__GAME__` chỉ tồn tại với `/?test=1`. Test e2e không import được module TS của server/shared bằng Playwright; chỉ đọc file PNG qua fs nếu cần. Không có test e2e hợp lý cho animation nên chỉ kiểm tra kích thước sheet bằng script và typecheck.

## Plan
- [ ] 1. [vừa] `client/assets-src/characters/build_turnaround_sheet.py` → sau `shrink`, thêm hàm `walk_frames(fig, direction)` trả về (step_a, stand, step_b) theo mục Ngữ cảnh; ghi sheet 3 cột (rộng FRAME_W*3, cao FRAME_H*4); cập nhật docstring đầu file (3 cột thay vì 1 cột, bỏ câu "no walk animation"). Chạy script để sinh lại `client/public/assets/characters/pink_girl.png`, rồi tự mở ảnh kiểm tra bằng Read: 3 cột x 4 hàng, chân khác nhau giữa frame 0 và 2, không bị cắt, cột 1 giống tư thế cũ.
- [ ] 2. [dễ] `shared/src/characters.ts` → mục `pink_girl`: `columns: 3`, `standColumn: 1`, `frameWidth` khớp FRAME_W script in ra, sửa comment. Chạy `npm run typecheck`.
- [ ] 3. [dễ] `README.md` / `AGENTS.md`: kiểm tra có chỗ nào nói pink_girl là sheet 1 tư thế / không có animation đi bộ (grep `pink`, `turnaround`) và sửa; nếu không có thì ghi "Docs checked: no change needed" vào Trạng thái hiện tại.

## Test cases
- [ ] T1. Sheet bé váy hồng có đủ 3 cột — kích thước PNG khớp `frameWidth*3` x `72*4` và `columns: 3` — kiểm tra bằng lệnh, không cần spec e2e
  - Setup: không
  - Steps: 1. đọc kích thước `client/public/assets/characters/pink_girl.png` (python3 + Pillow, hoặc `file`) · 2. so với `frameWidth` trong `shared/src/characters.ts`
  - Assert: width = frameWidth*3, height = 288; `npm run typecheck` pass

## Trạng thái hiện tại
Lưu ý: không có art bước chân thật cho bé váy hồng, frame bước được sinh bằng code từ tư thế đứng nên chuyển động chỉ ở mức đơn giản; muốn đẹp hơn cần user cung cấp sheet đi bộ 4x4 (dùng `build_walk_sheet.py`).

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
