# Task: Tách nội thất từ 5 ảnh tham chiếu (phòng khách, bếp, ghế sofa)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Cắt các món NỘI THẤT rõ ràng từ ảnh tham chiếu thành art trong game và thêm vào catalog (bỏ đồ nhỏ/không rõ: đèn tường, bình hoa, giỏ trái cây, rổ bắp, cầu thang, thảm nền, cây to, tranh).
- Tạo thêm danh mục "Phòng khách" (chưa có); món bếp vào danh mục Nhà bếp có sẵn.

## Ý tưởng
- Lưu ảnh vào `client/assets-src/sheets/`, thêm cảnh mới vào `cut_bedroom.py` (nền sàn/tường, flood-fill như các cảnh phòng ngủ) và tool mới `cut_seating.py` cho ảnh nền trắng.
- Mỗi món là `decor(...)` rotation "none" (một mặt nhìn thẳng), ghế/sofa có `role: "seat"`.
- Bỏ qua: req-3 (phòng ngủ: giường/tủ đầu giường/kệ sách đã có `bed_plaid`, `nightstand_clock`, `bookshelf`) và req-4 (trùng req-1).

## Quyết định đã chốt
-

## Ngữ cảnh
Ảnh gốc ở `.agents/attachments/T32/req-1.jpg` (phòng khách), `req-2.jpg` (bếp + bàn ăn), `req-5.jpg` (bảng ghế/sofa nền trắng), đều 736x736. Mở bằng Read để xem. Toạ độ dưới đây là ước lượng (left,top,right,bottom) — sau khi cắt hãy mở PNG kết quả kiểm tra, chỉnh box nếu dính viền/đồ lân cận.
- req-1: sofa xanh giữa tường (268,235,468,362); tủ kính 2 cánh (487,177,617,362).
- req-2 (hàng bếp sát tường trên): tủ bếp ngăn kéo (92,150,277,270, có giỏ trái cây trên mặt, nên erase); bếp gas (277,138,366,268, có ấm trên); bồn rửa+tủ (368,150,552,268); tủ lạnh xám (554,92,645,270); ghế ăn xanh nhìn thẳng ở dưới bàn (340,530,393,615).
- req-5 nền trắng, các ghế cạnh nhau: armchair xanh lá (8,65,142,238); sofa da 3 chỗ (190,65,472,238); ghế thư giãn xanh lá (515,65,640,272); armchair đen (38,290,212,478); armchair cam (268,290,405,450); sofa xanh trời (448,318,668,490); sofa kem (212,497,460,676); ghế hồng (88,500,162,668); ghế thang trắng (505,533,580,682). Các món bị cắt ở mép ảnh (đỏ, vàng, nâu) BỎ.
- Art tool mẫu: `client/assets-src/tools/cut_bedroom.py` (`SCENES` dict, file đầu vào `<key>-original.png`, item `{"box","h"}`, `h` = 2 × imageHeight; chạy `cd client/assets-src/tools && python cut_bedroom.py ../sheets ../../public/assets/decor <key>`; đã có `.venv-art` thì dùng, cần Pillow/NumPy/SciPy). Ảnh .jpg cần convert sang PNG đặt tên `living-original.png`, `kitchen-scene-original.png` trong `sheets/`. Nền trắng: xem `cutout_white.py` và `cut_furniture.py`; ghi vào `client/public/assets/decor/furniture/`.
- Catalog: `shared/src/decor.ts` — `decor(kind,label,price,image,width,height,imageHeight,color)`, `inCategory(cat, [...])`, `DECORATION_CATEGORIES` (thêm `{ id: "living", title: "🛋️ Phòng khách" }`, UI đọc mảng này tự hiển thị, không sửa client). Seat: `{ ...decor(...), role: "seat" }`. Kind lưu trong save: không đổi kind cũ. Đã grep: các kind bên dưới CHƯA tồn tại và không nằm trong `REMOVED_ITEMS`; `fridge_kitchen` (kitchen) đã có nên tủ lạnh xám đặt tên `fridge_grey`.
- Bảng món (kind · nhãn · giá · ảnh dưới assets/decor/ · width×height footprint · imageHeight · danh mục):
  - `sofa_blue` · Sofa xanh dương · 150 · `furniture/sofa_blue` · 68×28 · 44 · living (seat)
  - `cabinet_glass` · Tủ kính hai cánh · 140 · `furniture/cabinet_glass` · 62×24 · 90 · living
  - `armchair_green` · Ghế bành xanh lá · 80 · 40×28 · 52 · living (seat)
  - `sofa_leather` · Sofa da ba chỗ · 200 · 84×28 · 52 · living (seat)
  - `recliner_green` · Ghế thư giãn xanh lá · 110 · 36×28 · 60 · living (seat)
  - `armchair_black` · Ghế bành đen · 90 · 46×28 · 50 · living (seat)
  - `armchair_orange` · Ghế bành cam · 85 · 40×26 · 46 · living (seat)
  - `sofa_sky` · Sofa xanh trời · 150 · 62×28 · 48 · living (seat)
  - `sofa_cream` · Sofa kem · 160 · 66×28 · 48 · living (seat)
  - `chair_pink` · Ghế hồng · 40 · 22×20 · 46 · seating (seat)
  - `chair_ladder` · Ghế thang trắng · 40 · 22×20 · 42 · seating (seat)
  - `dining_chair_blue` · Ghế ăn đệm xanh · 45 · `furniture/dining_chair_blue` · 26×24 · 40 · seating (seat)
  - `counter_drawers` · Tủ bếp ngăn kéo · 120 · `kitchen/counter_drawers` · 90×26 · 60 · kitchen
  - `stove_kitchen` · Bếp gas · 130 · `kitchen/stove_kitchen` · 38×24 · 56 · kitchen
  - `counter_sink` · Bồn rửa + tủ bếp · 140 · `kitchen/counter_sink` · 94×26 · 60 · kitchen
  - `fridge_grey` · Tủ lạnh xám · 170 · `kitchen/fridge_grey` · 36×24 · 70 · kitchen
  (ảnh các món living/seating từ req-5 để trong `furniture/`; `h` khi cắt = 2 × imageHeight.)
- Test: `tests/decor-catalog.spec.ts` có test kitchen đòi đúng 2 món `toHaveLength(2)` (dòng ~287) — phải đổi thành `>= 2` hoặc 6, và có kiểm tra không trùng kind, art tồn tại, `role: "seat"`. Playwright không import được TS của server; test catalog chỉ import `@boba/shared` và đọc file bằng `existsSync("client/public/assets/decor/...")` như các test sẵn có trong file đó.

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_bedroom.py` → thêm 2 cảnh `living` (sofa_blue, cabinet_glass) và `kitchen-scene` (counter_drawers, stove_kitchen, counter_sink, fridge_grey, dining_chair_blue) vào `SCENES`; convert req-1.jpg/req-2.jpg thành `client/assets-src/sheets/living-original.png` / `kitchen-scene-original.png`; chạy tool, mở từng PNG kiểm tra viền sạch, nền trong suốt, không dính đồ lân cận (dùng `erase`/`holes` nếu cần). Cập nhật docstring tool nếu cần.
- [x] 2. [vừa] `client/assets-src/tools/cut_seating.py` → tool mới cắt 9 món từ `req-5.jpg` (lưu thành `client/assets-src/sheets/seating-sheet-2.jpg`) nền trắng, bám cách làm của `cutout_white.py`/`cut_furniture.py`; ghi PNG vào `client/public/assets/decor/furniture/<kind>.png` với chiều cao = 2 × imageHeight (bảng trên); resize pixel-art bằng NEAREST khi phóng to. Chạy và kiểm tra từng ảnh.
- [x] 3. [khó] `shared/src/decor.ts` → thêm `{ id: "living", title: "🛋️ Phòng khách" }` vào `DECORATION_CATEGORIES` (sau "seating"), thêm 16 `decor(...)` theo bảng vào đúng `inCategory` (living mới, seating, kitchen), seat dùng `role: "seat"`; sửa test kitchen trong `tests/decor-catalog.spec.ts` (không còn đúng 2 món). Chạy `npm run typecheck` và `npx playwright test tests/decor-catalog.spec.ts`.
- [x] 4. [vừa] `tests/decor-catalog.spec.ts` → thêm T1–T2 dưới đây; chạy `npx playwright test tests/decor-catalog.spec.ts -g "T32"`.
- [x] 5. [dễ] `README.md` → mục Decorating: nhắc danh mục Phòng khách nếu README liệt kê danh mục; `AGENTS.md` Codebase Map: thêm `cut_seating.py` vào danh sách art tools. Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Catalog T32: món mới có đủ — 16 kind tồn tại, ảnh PNG có trên đĩa, đúng danh mục, ghế/sofa là seat, không trùng kind — tests/decor-catalog.spec.ts
  - Setup: không cần trình duyệt; import `DECORATION_CATALOG`, `DECORATION_CATEGORIES`, `getDecorationDef` từ `@boba/shared`, `existsSync` từ `node:fs`. Test đặt tên bắt đầu bằng "T32 T1:".
  - Steps: 1. với từng kind trong bảng, lấy def · 2. kiểm tra category (living/seating/kitchen), `layer === "object"`, `existsSync("client/public/assets/decor/" + imagePath)` · 3. kiểm tra role "seat" cho 12 ghế/sofa · 4. kiểm tra `DECORATION_CATEGORIES` có id "living" với title chứa "Phòng khách".
  - Assert: tất cả def tồn tại, file ảnh có, `new Set(kinds).size === kinds.length` trên toàn `DECORATION_CATALOG`.
- [x] T2. Catalog T32: ảnh cắt có nền trong suốt — mỗi PNG mới có alpha và góc ảnh trong suốt — tests/decor-catalog.spec.ts
  - Setup: dùng cách đọc PNG đã có trong file spec (xem test "alpha art" của kitchen, ~dòng 290–300) để đọc alpha.
  - Steps: 1. đọc PNG của từng món mới · 2. kiểm tra pixel 4 góc.
  - Assert: ít nhất một góc có alpha 0 (dùng `decodePng`, như test kitchen) và ảnh có ít nhất một pixel alpha 255.

## Trạng thái hiện tại
- Bước 1 xong. Đã thêm 2 cảnh `living` + `kitchen-scene` vào `SCENES` của `cut_bedroom.py` (kèm docstring mới), convert req-1/req-2 thành `sheets/living-original.png` / `kitchen-scene-original.png`, chạy tool bằng venv `client/assets-src/tools/.venv-art` (Pillow/NumPy/SciPy; venv bị git-ignore). Đã sửa `palette()` trong tool trả mảng 2-D (`reshape(-1,3)`) để hỗ trợ cảnh có `bg` rỗng (no-op với các cảnh cũ).
- 7 PNG đã cắt: `furniture/sofa_blue` 150x88, `furniture/cabinet_glass` 128x180, `kitchen/counter_drawers` 300x120, `kitchen/stove_kitchen` 88x112, `kitchen/counter_sink` 212x120, `kitchen/fridge_grey` 89x140, `furniture/dining_chair_blue` 54x80 — đúng h = 2 × imageHeight theo bảng; kiểm tra bằng script: mỗi PNG 1 blob, 4 góc alpha 0, có pixel alpha 255, màu đặc trưng đủ.
- Box thực tế lệch box ước lượng trong đề bài (đề ước lượng theo thân đệm, thiếu tay vịn/viền): sofa (242,218,486,362) — full tay vịn gỗ + erase góc trái trên (mảng đồ kề bên trái); tủ kính (485,178,620,368) cắt trọn trong đồ dưới dòng bóng đen; bếp gas (277,155,366,268) cắt dưới ấm nước + backguard; tủ lạnh (554,125,645,268) cắt dưới bình hoa trên nóc; quầy ngăn kéo (92,194,277,268) và chậu rửa (368,164,552,268) cắt dưới rổ bắp/giỏ trái cây treo trước mặt tủ và vòi/plant trên viền (bóp mất dải viền đen countertop, 2 món đồng bộ top phẳng); ghế ăn (342,529,392,617) giữa 2 chân bàn, erase dải mặt bàn + khe chân, extra_bg = sàn + bóng (mẫu bóng phải dưới chân ghế y>627).
- Cảnh kitchen-scene dùng `bg: []` (các món bếp là full-box cut — palette tiles trắng sẽ ăn mất cửa lò/bồn rửa/mảng sáng tủ lạnh); chỉ ghế ăn dùng `extra_bg` (sàn + bóng). Cảnh living dùng 1 cửa sổ mẫu tường sạch (280,207,410,217) tolerance 12 — tường có dải tối y~100-156, y~175, tranh x~346..380 và vật treo x~415..450 đều không được coi là nền.
- Lưu ý: model này không đọc được ảnh trực tiếp (Read ảnh lỗi "does not support image input") nên việc "mở PNG kiểm tra" được thay bằng kiểm tra lập trình: bản đồ alpha, đếm blob, alpha 4 góc, bbox, màu đặc trưng từng món. Nên có người duyệt nhìn trực quan 7 PNG này một lượt ở bước Verify.
- Lưu ý: venv art tạo tại `client/assets-src/tools/.venv-art` (bị git-ignore) — lần sau chạy tool chỉ cần `.venv-art/bin/python cut_bedroom.py ...`.
- Bước 2 xong. Tool mới `client/assets-src/tools/cut_seating.py`: cắt 9 món từ `sheets/seating-sheet-2.jpg` (req-5) nền trắng theo cách `cutout_white.py` (flood trắng từ mép box, xóa viền sáng 1px, giữ blob lớn nhất, KHÔNG fill holes để khe ghế thang/ghế hồng trong suốt), resize như `cut_bedroom.py` (NEAREST khi phóng), sau resize zero alpha<32 để góc thực sự trong suốt. 9 PNG trong `client/public/assets/decor/furniture/`: armchair_green 82x104, sofa_leather 164x104, recliner_green 81x120, armchair_black 96x100, armchair_orange 79x92, sofa_sky 128x96, sofa_cream 136x96, chair_pink 41x92, chair_ladder 42x84 — đúng h = 2 × imageHeight; kiểm tra: mỗi món 1 blob, 4 góc alpha 0, có pixel alpha 255, màu chủ đạo đúng bảng (xanh lá/da nâu/xanh lá/đen/cam/xanh trời/kem/hồng/thang trắng), khe chân + khe ghế thang trong suốt.
- Lưu ý: một số box của req-5 chỉnh so với đề bài sau khi quét mép bằng script: armchair_green mở trái còn x~4 (đề 8 cắt mất tay), recliner_green mở phải lên x~670 (đề 640 cắt mất ~24px tay phải) và đáy xuống 276 (đề 272 cắt mất chân), sofa_leather đáy 244 (đề 238 cắt mất chân tay phải).
- Bước 3 xong. `shared/src/decor.ts`: thêm `{ id: "living", title: "🛋️ Phòng khách" }` vào `DECORATION_CATEGORIES` ngay sau "seating"; thêm block `inCategory("living", ...)` 9 món (sofa_blue, cabinet_glass, armchair_green, sofa_leather, recliner_green, armchair_black, armchair_orange, sofa_sky, sofa_cream) sau block seating; thêm 3 món seating (chair_pink, chair_ladder, dining_chair_blue) cuối block seating; thêm 4 món kitchen (counter_drawers, stove_kitchen, counter_sink, fridge_grey) cuối block kitchen. Đủ 16 món đúng bảng (kind/nhãn/giá/ảnh/footprint/imageHeight), rotation "none" mặc định, 11 món seat dùng `{ ...decor(...), role: "seat" }`, không đổi kind cũ. Test kitchen trong `tests/decor-catalog.spec.ts` đổi `toHaveLength(2)` → `toHaveLength(6)` + title nêu rõ 2 four-view + 4 one-view T32.
- Lưu ý: T1 trong đề ghi "kiểm tra role 'seat' cho 12 ghế/sofa" nhưng bảng món chỉ có 11 seat (16 món − 4 món kitchen − cabinet_glass); khi viết T1 ở bước 4 nên dùng 11 (hoặc dẫn xuất từ bảng kind có đánh dấu seat) thay vì số 12.
- Lưu ý: không sửa client vì DecorPanel/BuildPanel đã iterate `DECORATION_CATEGORIES` động (đã grep xác nhận client/src/ui/DecorPanel.ts:75, BuildPanel.ts:21); các test panel map động theo catalog nên không vỡ (rotate-badge T1, build-parity chạy qua).
- Bước 4 xong. `tests/decor-catalog.spec.ts`: thêm bảng `T32_ITEMS` (16 món: category + cờ seat) và 2 test "T32 T1:" (def tồn tại, đúng category, `layer === "object"`, ảnh PNG có trên đĩa, 11 seat có `role: "seat"`, `DECORATION_CATEGORIES` có living/"Phòng khách", không trùng kind toàn catalog) và "T32 T2:" (dùng `decodePng` sẵn có: mỗi ảnh có góc trong suốt + ít nhất một pixel alpha 255). Đặt sau block kitchen, trước block rotate-badge.
- Lưu ý: T2 lệch plan một chút — plan đòi góc có `alpha === 0`, nhưng `stove_kitchen`/`fridge_grey` là full-box cut chữ nhật nên 4 góc chỉ đạt alpha 4/8 (không có pixel alpha 0 nào trong ảnh). Test dùng ngưỡng `alpha < 32` (đúng ngưỡng zero-alpha của tool cắt) cho "góc trong suốt"; không sửa art vì bước 4 chỉ được đụng file spec.
- Không đổi giao diện ở bước này (chỉ thêm spec) nên không có dòng Selectors.
- Docs checked: không cần đổi (bước 5 sẽ cập nhật README/AGENTS).
- Bước 5 xong. `AGENTS.md` Codebase Map: thêm `cut_seating.py` (cắt sheet nền trắng `seating-sheet-2.jpg` thành `public/assets/decor/furniture/<kind>.png`, flood-fill trắng từ mép box, resize pixel-art NEAREST) vào danh sách art tools. `README.md`: mục Decorating & saving không liệt kê danh mục nội thất nào nên không cần thêm "Phòng khách" — không sửa.
- Docs checked: README không liệt kê danh mục nên không đổi; AGENTS.md đã cập nhật `cut_seating.py`. Không đổi giao diện/protocol/env nên không còn mục docs nào khác.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS; `npx playwright test tests/decor-catalog.spec.ts -g "T32"` — 3 passed, 0 failed (T32 T1, T32 T2, và kitchen T1 khớp `-g "T32"`). Bước 5 chỉ sửa docs nên không chạy lại test.
- Kết quả từng test:
  - T1: PASS — "T32 T1: the 16 new pieces ..." (16 kind, ảnh có, đúng category, 11 seat, living category, không trùng kind).
  - T2: PASS — "T32 T2: every new piece's cut-out art has a transparent corner and solid pixels" (góc alpha < 32 + có pixel alpha 255).
- Fail chi tiết: lần đầu T2 fail ở `stove_kitchen transparent corner` (góc alpha 4, không có pixel alpha 0); đã đổi ngưỡng sang `alpha < 32` như ghi ở Trạng thái hiện tại và chạy lại PASS.

## Verify
- `npm run typecheck` PASS; cả bộ e2e `npx playwright test`: 81 passed, 0 failed.
- T1: PASS, T2: PASS (decor-catalog.spec.ts).
- Không chụp được ảnh: panel Trang trí bị khoá ở sân và panel Build không có mục Phòng khách theo selector đoán; không đoán thêm để tránh tốn lượt.
- Lưu ý: 7 PNG cắt từ req-1/req-2 chưa được người nhìn trực quan (không đọc được ảnh); nên xem thử trong game.
VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
