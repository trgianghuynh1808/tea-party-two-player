# Task: Đưa ảnh nội thất nhà tắm từ thư mục `wall/` sang `bathroom/`

APPROVED_BY_MANAGER

Verify mode: none

## Ý tưởng
- Các món nhà tắm (gương, khăn, đèn tường, bình nước nóng, giá móc) đã nằm trong nhóm "🛁 Phòng tắm" nhưng file ảnh vẫn nằm lẫn trong `client/public/assets/decor/wall/`.
- Dùng `git mv` chuyển 8 ảnh sang `client/public/assets/decor/bathroom/` và đổi đường dẫn ảnh trong `shared/src/decor.ts`.
- Sửa 2 script cắt/vẽ ảnh để lần chạy lại ghi vào thư mục mới. Kind (id) giữ nguyên nên shop đã lưu không bị ảnh hưởng.

## Mục tiêu
- Mọi ảnh của món `category: "bathroom"` nằm trong `assets/decor/bathroom/`; `wall/` không còn ảnh nhà tắm.
- Không đổi kind, nhãn, giá, kích thước hay hành vi.

## Quyết định đã chốt
- "path" trong yêu cầu = "bath". Chỉ chuyển file ảnh, không đổi nhóm (đã đúng nhóm).
- Chỉ 8 ảnh được dùng bởi kind `bath_*` wallArt: `bath_mirror`, `hook_rack`, `mirror_framed`, `wall_lamp`, `towel_rail`, `towel_hook`, `towel_shelf_wood`, `water_heater`. Ảnh `wall/` khác giữ nguyên.

## Ngữ cảnh
- `shared/src/decor.ts` ~182: `wallArt(kind, label, price, image, w, h, color)` đặt `image: `assets/decor/wall/${image}.png``. Món sàn dùng `decor(..., "bathroom/trash_can", ...)` (đường dẫn đầy đủ sau `assets/decor/`).
- Cách đổi gọn: cho `wallArt` nhận `image` có thể chứa thư mục: nếu `image` có `/` thì dùng `assets/decor/${image}.png`, ngược lại giữ `wall/`. Rồi 8 dòng trong `inCategory("bathroom", ...)` (~343-350) đổi thành `"bathroom/hook_rack"`, `"bathroom/bath_mirror"`, `"bathroom/mirror_framed"`, `"bathroom/wall_lamp"`, `"bathroom/towel_rail"`, `"bathroom/towel_hook"`, `"bathroom/towel_shelf_wood"`, `"bathroom/water_heater"`. Không đụng các wallArt ngoài nhóm bathroom.
- Chỉ `shared/src/decor.ts` tham chiếu các ảnh này (grep đã kiểm tra); client load ảnh theo `def.image`.
- `client/assets-src/tools/cut_bathroom.py:31` `OUT_WALL = .../decor/wall` và `draw_bathroom_props.py:28` `OUT_WALL = .../decor/wall` → đổi thành cùng thư mục `bathroom` (`OUT_WALL = OUT_FLOOR`). Preview ở hai file đọc ảnh qua `OUT_WALL` nên vẫn đúng. Docstring `draw_bathroom_props.py` dòng 6 ghi `decor/wall/bath_mirror.png` → sửa thành `decor/bathroom/`.
- Test: `tests/decor-catalog.spec.ts` đã có test "bathroom-2 T1" (đọc `def.image` + `existsSync`), tự bắt ảnh thiếu. Hàm có sẵn: `getDecorationDef`, `DECORATION_CATALOG`. Playwright không import được module server; spec này chỉ import `shared` (xem đầu file).
- Docs: README/AGENTS không nhắc thư mục `wall/` của nhà tắm (kiểm tra lại bằng grep `decor/wall`).

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → `wallArt` + 8 dòng bathroom: chạy `git mv client/public/assets/decor/wall/{bath_mirror,hook_rack,mirror_framed,wall_lamp,towel_rail,towel_hook,towel_shelf_wood,water_heater}.png client/public/assets/decor/bathroom/`, cho `wallArt` chấp nhận `image` dạng `thư_mục/tên`, đổi 8 dòng bathroom sang `bathroom/<tên>`. Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/assets-src/tools/cut_bathroom.py` → `OUT_WALL`: trỏ vào thư mục `bathroom`; cùng việc đó ở `client/assets-src/tools/draw_bathroom_props.py` (`OUT_WALL` + docstring dòng 6). Không chạy lại script.
- [x] 3. [vừa] `tests/decor-catalog.spec.ts` → thêm test T1 (xem dưới) vào cuối khối bathroom, rồi chạy `npx playwright test tests/decor-catalog.spec.ts`.

## Test cases
- [x] T1. Ảnh nhà tắm nằm trong thư mục bathroom — mọi món bathroom có ảnh dưới `assets/decor/bathroom/` và `wall/` không còn 8 file cũ — tests/decor-catalog.spec.ts
  - Setup: không cần trình duyệt; test thuần (như các test catalog khác), dùng `DECORATION_CATALOG`, `existsSync`.
  - Steps: 1. lọc `DECORATION_CATALOG` theo `category === "bathroom"` · 2. với mỗi món đọc `def.image` · 3. kiểm tra 8 tên file cũ không còn trong `client/public/assets/decor/wall/`.
  - Assert: mỗi `def.image` bắt đầu bằng `assets/decor/bathroom/` và file tồn tại; `existsSync("client/public/assets/decor/wall/<tên>.png")` là false cho 8 tên. Lệnh: `npx playwright test tests/decor-catalog.spec.ts -g "bathroom"`.

## Trạng thái hiện tại
- Bước 1 xong: đã `git mv` 8 ảnh `bath_mirror, hook_rack, mirror_framed, wall_lamp, towel_rail, towel_hook, towel_shelf_wood, water_heater` từ `client/public/assets/decor/wall/` sang `client/public/assets/decor/bathroom/`. `wallArt` trong `shared/src/decor.ts` giờ chấp nhận `image` có thư mục (chứa `/` → `assets/decor/<thư_mục>/<tên>.png`, ngược lại giữ `wall/`); 8 dòng `inCategory("bathroom")` đã đổi sang `bathroom/<tên>`. Kind không đổi nên shop đã lưu không bị ảnh hưởng. `npm run typecheck` PASS. Docs (README/AGENTS) không nhắc thư mục `wall/` nhà tắm — không cần sửa ở bước này.
- Bước 2 xong: `OUT_WALL = OUT_FLOOR` ở `cut_bathroom.py` (dòng 31) và `draw_bathroom_props.py` (dòng 28); docstring `draw_bathroom_props.py` dòng 6 ghi `decor/bathroom/bath_mirror.png`; docstring `cut_bathroom.py` (câu "target picks the output folder...") sửa lại cho đúng vì giờ mọi piece đều ghi vào `bathroom/`. Không chạy lại script theo plan. `npm run typecheck` PASS. Grep `decor/wall` trong `client/assets-src/tools` sạch.
- Lưu ý: ngoài literal của plan, còn sửa 2 chỗ để script chạy lại không hỏng: (1) docstring `cut_bathroom.py` mô tả output folder cũ; (2) `preview()` của `draw_bathroom_props.py` (dòng ~275) ghép đường dẫn bằng chuỗi `"wall"` thay vì `OUT_WALL` (plan ghi "preview đọc qua OUT_WALL" — chỉ đúng với `cut_bathroom.py`), nên đã đổi sang `OUT_FLOOR if folder == "bathroom" else OUT_WALL`. Cả hai đều trong file plan đã nêu tên.
- Bước 3 xong: thêm test `"bathroom-images T1"` vào cuối khối bathroom trong `tests/decor-catalog.spec.ts` (sau `bathroom-2 T1`): lọc `DECORATION_CATALOG` theo `category === "bathroom"`, kiểm tra mỗi `def.image` bắt đầu bằng `assets/decor/bathroom/` và file tồn tại, và `existsSync` false cho 8 tên cũ trong `client/public/assets/decor/wall/`. Chạy `npx playwright test tests/decor-catalog.spec.ts` — 15/15 PASS. `npm run typecheck` PASS. Docs (README/AGENTS) không nhắc thư mục `wall/` nhà tắm — không cần sửa.
- Lưu ý: tên test dùng `"bathroom-images T1"` (không phải `"bathroom T1"`) để tránh trùng title với test `"bathroom T1"` đã có; vẫn khớp filter `-g "bathroom"`.

## Test status
- Lần chạy cuối: `npm run typecheck` và `npx playwright test tests/decor-catalog.spec.ts` (sau bước 3) — PASS (15/15).
- Kết quả từng test:
  - T1: PASS (`bathroom-images T1`)
- Fail chi tiết:

## Verify

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
