# Task: Cá bơi nằm ngang (T23)

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Nhiều sprite cá cắt từ sheet bị vẽ nghiêng ~30–45° (đầu chếch lên phải), nên trong hồ trông như cá đang ngóc lên.
- Sửa tại nguồn: `cut_fish.py` tự xoay từng sprite cho trục thân nằm ngang (đầu vẫn quay phải, xoay nearest-neighbor để giữ pixel art), rồi cắt lại các PNG.
- Cá tròn/dẹt (nóc, mặt trăng, cá đuối, lươn) giữ nguyên hoặc chỉnh tay; code game không phải đổi ngoài một dòng comment.

## Mục tiêu
- Cá dạng thân dài trong `client/public/assets/fish/*.png` nằm ngang (trục chính lệch < 12°), vẫn đầu quay phải như cũ để `PondView` lật theo `dir` đúng.

## Quyết định đã chốt
- Xoay ở bước cắt (tool), không xoay lúc vẽ bằng Phaser: tránh răng cưa và không đụng logic hiển thị.

## Ngữ cảnh
- `client/assets-src/tools/cut_fish.py`: `cut(im, blob)` trả `Image` đã crop; `main()` gọi `img = cut(im, cells[cell])` rồi `img.save(out)` (chỉ cho cá khi `folder == OUT_FISH`; đồ trang trí hồ `OUT_POND` giữ nguyên). Chạy: `/tmp/sprite-venv/bin/python client/assets-src/tools/cut_fish.py` (có numpy, scipy, PIL; hệ thống không có PIL). Sheet nguồn ở `client/assets-src/sheets/`.
- 15 cá: ca_bon, ca_chep, ca_duoi, ca_he, ca_koi, ca_loc, ca_map, ca_mat_trang, ca_nuc, ca_ro, ca_rong, ca_thu, ca_tram, ca_tre, luon. Sprite hiện vuông (~107–160px); từ ảnh contact sheet: ca_thu, ca_he, ca_tram, ca_tre, ca_rong, ca_ro, ca_loc, ca_map, ca_chep, ca_bon, ca_koi đều nghiêng đầu chếch lên-phải ~30–45°. ca_duoi, ca_mat_trang, ca_nuc, luon là dạng tròn/dẹt/cong: không ép xoay theo trục (để góc 0 trừ khi nhìn thấy rõ nghiêng).
- Cách làm gợi ý: hàm `level_angle(img)` tính góc trục chính bằng PCA toạ độ pixel alpha>0 (độ dài trục: tỉ lệ eigenvalue > ~1.6 mới xoay, ngược lại 0); dict `ANGLE_OVERRIDE = {id: deg}` để chỉnh tay; `img.rotate(angle, resample=Image.NEAREST, expand=True)` rồi crop lại theo bbox alpha (`img.crop(img.getchannel("A").getbbox())`). Góc quy về (-90, 90] để đầu vẫn ở bên phải. Kiểm tra bằng mắt: ghép contact sheet ra `/tmp` rồi Read ảnh.
- `client/src/scenes/PondView.ts` ~dòng 286: comment "drawn slightly diagonal; shown unrotated" cần sửa cho đúng (đã nằm ngang). Hiển thị dùng `look.width / body.width`, nên đổi kích thước PNG không hỏng layout.
- Test: Playwright không import được module TS server; ảnh phục vụ qua `baseURL` client (`/assets/fish/<id>.png`), dùng `page.goto("/?test=1")` rồi `page.evaluate` tải ảnh vào canvas. Không cần room/tiền.
- Docs: `AGENTS.md` dòng Codebase Map (cut_fish.py) và `README.md` ~dòng 97 mô tả cut_fish; thêm "và xoay cho nằm ngang" nếu hợp, ghi "Docs checked" vào Trạng thái hiện tại.

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_fish.py` → thêm `level_angle`, `ANGLE_OVERRIDE`, xoay NEAREST + crop trong `main()` chỉ cho cá (`folder == OUT_FISH`); chạy lại tool để ghi đè `client/public/assets/fish/*.png`; xem contact sheet để chắc cá nằm ngang, đầu quay phải, không bị cắt mép; chỉnh `ANGLE_OVERRIDE` nếu con nào còn lệch.
- [x] 2. [dễ] `client/src/scenes/PondView.ts` → sửa comment ở `createFishView` (~dòng 286) cho đúng; `AGENTS.md` / `README.md` cập nhật mô tả `cut_fish.py` nếu cần.
- [x] 3. [vừa] `tests/fishing.spec.ts` → thêm test T1 (xem Test cases). Chạy: `npx playwright test tests/fishing.spec.ts -g "T1"` rồi `npm run typecheck`.

## Test cases
- [x] T1. Cá nằm ngang — mọi sprite cá thân dài có trục chính lệch < 12° so với phương ngang — tests/fishing.spec.ts
  - Setup: không cần user/room; `page.goto("/?test=1")` (1 phiên).
  - Steps: 1. trong `page.evaluate`, với mỗi id trong ["ca_thu","ca_he","ca_tram","ca_tre","ca_rong","ca_ro","ca_loc","ca_map","ca_chep","ca_koi"] tải `/assets/fish/<id>.png` vào `Image`, vẽ lên canvas, lấy pixel alpha>0. 2. tính góc trục chính: `0.5*atan2(2*sxy, sxx-syy)` (độ, từ hiệp phương sai).
  - Assert: `Math.abs(angle) < 12` cho từng id (gom id lỗi vào message). 

## Trạng thái hiện tại
- Bước 1 xong (commit 85e3ee9): `cut_fish.py` có `level_angle` (PCA trục chính, chỉ xoay khi tỉ lệ eigenvalue > 1.6), `ROUND_FISH` (ca_duoi, ca_mat_trang, ca_nuc, luon giữ góc 0), `ANGLE_OVERRIDE` (đang rỗng — chưa con nào cần chỉnh tay); `main()` xoay NEAREST + crop bbox alpha chỉ khi `folder == OUT_FISH`. Đã chạy lại tool: 11 cá thân dài xoay -39.7°..-51.0°, ghi đè 11 PNG (ca_bon, ca_chep, ca_he, ca_koi, ca_loc, ca_map, ca_ro, ca_rong, ca_thu, ca_tram, ca_tre); pond decor không đổi.
- Kiểm số học trên PNG mới: 11 cá thân dài trục chính ≤ 0.1° (mục tiêu < 12°); diện tích alpha so bản cũ lệch tối đa 0.29% (không mất pixel, không cắt méo); xoay quanh tâm với |góc| < 90° nên đầu vẫn bên phải như sheet gốc.
- Docs checked: đã soát ở bước 2 (README/AGENTS đã cập nhật, không còn chỗ nào nói sprite nghiêng/không xoay).
- Bước 2 xong (commit 28dc7b8): comment `createFishView` ở `client/src/scenes/PondView.ts:286` sửa thành "cut_fish.py already levels the sprite (body horizontal, head right); scale to tier width, aspect kept."; `README.md` mục Fishing pond ghi chú "long fish rotated level, head facing right"; `AGENTS.md` Codebase Map mô tả `cut_fish.py` "(long fish rotated level, head right)". Docs checked: đã soát README/AGENTS, không còn chỗ nào nói sprite nghiêng/không xoay.
- Bước 3 xong: thêm test `T1: T23 long fish sprites lie flat (main axis within 12° of horizontal)` vào `tests/fishing.spec.ts` — `page.goto("/?test=1")` rồi `page.evaluate` tải 10 PNG cá thân dài vào canvas, lấy pixel alpha>0, tính góc trục chính `0.5*atan2(2*sxy, sxx-syy)`; assert `|angle| < 12°` cho từng id (gom id lỗi vào message). Bước này chỉ thêm test, không đổi giao diện → không cần Selectors.
- Lưu ý: model này không đọc được file ảnh nên chưa xác nhận bằng mắt được; contact sheet đã ghép sẵn tại /tmp/fish-contact.png — người duyệt/Verify nên xem để chắc cá nằm ngang, đầu quay phải, nhất là 4 cá tròn/dẹt đang giữ 0° theo plan (luon có PCA -49° nhưng là cá cong nên bỏ qua theo chỉ định); nếu con nào trông lệch thì bổ sung ANGLE_OVERRIDE ở bước sau.

## Test status
- Lần chạy cuối: `npm run typecheck` (sau bước 3) — PASS (server + client); `npx playwright test tests/fishing.spec.ts -g "T1"` — 4 passed (gồm T1 của T23).
- Bước 1–2 không có lệnh test riêng trong plan (T1 thuộc bước 3, chưa viết). Bước 1 đã đo trực tiếp bằng cùng công thức PCA của T1 trên từng PNG kết quả: cả 10 cá trong danh sách T1 (cộng ca_bon) đều |angle| ≤ 0.1°. Bước 2 chỉ sửa comment/docs nên không đổi hành vi.
- Kết quả từng test:
  - T1: PASS (spec `T1: T23 long fish sprites lie flat (main axis within 12° of horizontal)` trong `tests/fishing.spec.ts`).
- Fail chi tiết: không có.

## Verify
- Typecheck PASS; cả bộ e2e 67/67 PASS (gồm T1 cá nằm ngang): PASS.
- Xem contact sheet: 11 cá thân dài nằm ngang, đầu quay phải; cá tròn/dẹt giữ nguyên: PASS. Ảnh: `.agents/screenshots/task-23-fish-pond.png`.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
