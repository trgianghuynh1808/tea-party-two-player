# Task: Thêm nội thất từ 4 sheet mới (chỉ món không bị góc xéo)

Verify mode: light

## Mục tiêu
- 16 món nội thất nhìn thẳng/đối xứng từ 4 sheet mới được cắt, pixel hóa cho khớp nét nội thất hiện có, và thêm vào catalog (mua/đặt được ở cả tiệm trà lẫn nhà hàng như mọi món khác).
- Các món bị góc xéo (isometric) đã bị loại hết: không cắt, không thêm.
- 3 món ghế (`armchair_baroque`, `chair_cream`, `armchair_cream`) có `role: "seat"` để khách ngồi được.

## Quyết định đã chốt
- Chỉ lấy đúng 16 món ở bảng dưới; KHÔNG thêm món nào khác dù trong sheet còn (đã được duyệt từng món).
- Không thêm nhóm catalog mới: dùng các nhóm sẵn có (`plants`, `seating`, `lighting`, `bedroom` = "Nội thất").
- Pixel hóa bằng script (không vẽ tay): thu nhỏ, giảm bảng màu, viền tối 1px, rồi phóng nguyên điểm ảnh x4 (lưu 2x chiều cao hiển thị như nội thất hiện có).

## Ngữ cảnh
- Sheet gốc (ngoài repo, nền trong suốt, 2860x1760): `/Users/erihuynh/Downloads/visual novel assets/visual novel (furniture) (2).png` (= A, đồ cổ gỗ sẫm), `(3).png` (= B, hiện đại; KHÔNG dùng món nào), `(4).png` (= C, hoàng gia xanh–vàng), `visual novel (furniture).png` (= D, gỗ sáng dễ thương). ĐÃ được copy sẵn vào repo (OpenCode không đọc được thư mục Downloads — KHÔNG truy cập đường dẫn đó): `client/assets-src/sheets/furniture/furniture-a.png`, `furniture-c.png`, `furniture-d.png` (B không dùng). Chỉ làm việc với 3 file trong repo này.
- Hộp bao quanh từng món (toạ độ điểm ảnh trong sheet, `[left, top, right, bottom]`; trong hộp có thể lẫn mảnh món kế bên, nên chỉ giữ mảng đục lớn nhất — cách `cut_food.py` làm):
  | tên file | sheet | hộp |
  |---|---|---|
  | `armchair_baroque` | a | [1294, 43, 1491, 361] |
  | `lamp_arc_brass` | a | [767, 456, 916, 895] |
  | `lamp_shade_white` | a | [2582, 368, 2686, 658] |
  | `lamp_post_brass` | a | [1754, 503, 1843, 877] |
  | `globe` | a | [2213, 727, 2354, 937] |
  | `coat_stand` | a | [2615, 679, 2709, 952] |
  | `chair_cream` | c | [398, 625, 491, 814] |
  | `armchair_cream` | c | [675, 624, 790, 823] |
  | `vanity_piano` | c | [54, 1377, 273, 1685] |
  | `vanity_mirror` | c | [2670, 983, 2799, 1211] |
  | `fireplace_white` | c | [2115, 1257, 2243, 1459] |
  | `lamp_floor_cream` | d | [283, 1454, 424, 1743] |
  | `plant_leafy` | d | [1434, 849, 1581, 1007] |
  | `plant_big_leaf` | d | [1655, 817, 1801, 1008] |
  | `plant_slim` | d | [2210, 1130, 2316, 1331] |
  | `plant_pattern_pot` | d | [914, 1443, 1099, 1727] |
- Mẫu script cắt: `client/assets-src/tools/cut_food.py` (đọc sheet, crop hộp +4px, mask ngưỡng alpha > 40, `ndi.binary_closing` + `binary_fill_holes`, chọn blob lớn nhất, `binary_dilation(iterations=2)`, crop sát). Cần Pillow, NumPy, SciPy: dùng `/tmp/cut-venv/bin/python` nếu có, không thì `python3 -m venv /tmp/cut-venv && /tmp/cut-venv/bin/pip install pillow numpy scipy`.
- Công thức pixel hóa (đã thử, ra kết quả tốt): sau khi có sprite RGBA đã crop sát, với chiều cao hiển thị `H` (cột `H` bảng dưới) đặt `ph = H // 2`:
  1. `w = round(width * ph / height)`; thu nhỏ bằng `Image.LANCZOS` còn `(w, ph)`.
  2. alpha: `alpha = a[..., 3] > 110` (nhị phân); RGB: `Image.fromarray(rgb).quantize(20, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")`.
  3. Đệm 1px quanh ảnh; pixel nào ngay ngoài vùng đục (`binary_dilation(mask) & ~mask`) tô màu viền `(61, 44, 41, 255)`.
  4. Phóng `Image.NEAREST` x4 → file PNG lưu ra `client/public/assets/decor/furniture/<tên>.png`.
- `shared/src/decor.ts`: helper đã có (xem ngay trên `DECORATION_CATALOG`):
  ```ts
  const decor = (kind, label, price, image /* không đuôi .png, tính từ assets/decor/ */, width, height, imageHeight, color = 0x8d6e63, rotation: DecorationRotation = "none"): DecorationDef
  // ghế: { ...decor("stool", "Đôn gỗ", 35, "stool", 28, 24, 40, 0xa1887f, "flip"), role: "seat" },
  ```
  Các nhóm: `...inCategory("plants", [ ... ])`, `inCategory("seating", [...])`, `inCategory("bedroom", [...])` ("Nội thất"), `inCategory("lighting", [...])`. Thêm món MỚI vào CUỐI mảng của nhóm tương ứng; không đổi/xoá món cũ. Footprint (`width`, `height`) là ô sàn chiếm, `imageHeight` là chiều cao hình trên màn hình.
- Thông số từng món (`H` = `imageHeight`):
  | kind | label | nhóm | giá | footprint WxH | H | role |
  |---|---|---|---|---|---|---|
  | `armchair_baroque` | Ghế bành hoàng gia | seating | 90 | 34x26 | 70 | seat |
  | `chair_cream` | Ghế bọc kem | seating | 60 | 24x22 | 66 | seat |
  | `armchair_cream` | Ghế bành kem | seating | 85 | 30x26 | 76 | seat |
  | `lamp_arc_brass` | Đèn sàn cong đồng | lighting | 70 | 20x16 | 110 | — |
  | `lamp_shade_white` | Đèn sàn chụp trắng | lighting | 65 | 20x16 | 100 | — |
  | `lamp_post_brass` | Đèn sàn cột đồng | lighting | 70 | 18x16 | 105 | — |
  | `lamp_floor_cream` | Đèn sàn chụp kem | lighting | 55 | 18x16 | 90 | — |
  | `globe` | Quả địa cầu | bedroom | 80 | 26x22 | 60 | — |
  | `coat_stand` | Mắc áo đứng | bedroom | 60 | 20x16 | 90 | — |
  | `vanity_piano` | Bàn trang điểm đàn | bedroom | 150 | 50x24 | 80 | — |
  | `vanity_mirror` | Bàn trang điểm gương | bedroom | 120 | 40x20 | 90 | — |
  | `fireplace_white` | Lò sưởi trắng | bedroom | 180 | 50x24 | 80 | — |
  | `plant_leafy` | Cây lá nhỏ chậu đỏ | plants | 50 | 24x20 | 56 | — |
  | `plant_big_leaf` | Cây lá to chậu đỏ | plants | 60 | 26x22 | 64 | — |
  | `plant_slim` | Cây thân đứng | plants | 75 | 24x20 | 80 | — |
  | `plant_pattern_pot` | Cây lá lớn chậu hoa văn | plants | 90 | 28x22 | 90 | — |
- Màu `color` (đại diện): dùng `0x8d6e63` mặc định cho đồ gỗ, `0x2a9d8f` cho cây, `0xb08968` cho đèn đồng, `0xc29a78` cho ghế kem.
- Test mẫu: `tests/decor-catalog.spec.ts` (đã có, thuần Node, import `DECORATION_CATALOG, getDecorationDef` từ `@boba/shared`, `existsSync`).

## Plan
- [x] 1. [khó] `client/assets-src/tools/cut_furniture.py` (file mới): đọc `client/assets-src/sheets/furniture/furniture-{a,c,d}.png`, cắt 16 món theo bảng hộp, pixel hóa theo công thức, ghi `client/public/assets/decor/furniture/<tên>.png`; 3 sheet đã có sẵn trong `client/assets-src/sheets/furniture/` (không `cp` gì từ Downloads), chạy script bằng `/tmp/cut-venv/bin/python`, mở vài PNG kiểm tra đúng hình (không dính món kế bên, nền trong suốt, có viền tối). Commit script + sheet + 16 PNG.
- [x] 2. [khó] `shared/src/decor.ts` → `DECORATION_CATALOG`: thêm 16 món theo bảng thông số vào cuối các nhóm `plants`, `seating`, `bedroom`, `lighting`; ảnh `furniture/<tên>`; 3 ghế `role: "seat"` (dạng `{ ...decor(...), role: "seat" }`); `rotation` để mặc định `"none"`. Thêm comment ngắn: "Cut from client/assets-src/sheets/furniture/ by client/assets-src/tools/cut_furniture.py (front-facing pieces only)". Chạy `npm run typecheck`.
- [x] 3. [khó] `tests/decor-catalog.spec.ts` → thêm T3 (giữ T1, T2): với 16 kind trong bảng, `getDecorationDef(kind)` có, `existsSync("client/public/" + def.image)` true, 3 ghế có `role === "seat"`, và không kind nào trùng với món cũ (mỗi kind chỉ xuất hiện 1 lần trong `DECORATION_CATALOG`). Chạy `npx playwright test tests/decor-catalog.spec.ts` rồi `npx playwright test`.

## Test cases
- [x] T1. bed_pink đã bị xoá (có sẵn) — tests/decor-catalog.spec.ts
- [x] T2. 8 món đã bị xoá (có sẵn) — tests/decor-catalog.spec.ts
- [x] T3. 16 món mới vào catalog — đủ kind, ảnh tồn tại, 3 ghế là `seat`, kind không trùng — tests/decor-catalog.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `client/assets-src/tools/cut_furniture.py` chạy bằng `/tmp/cut-venv/bin/python`, cắt + pixel hóa 16 món từ 3 sheet ra `client/public/assets/decor/furniture/` (cao đúng 2H+8 px như nội thất hiện có). Môi trường agent không xem được ảnh nên kiểm PNG bằng phân tích chương trình: 16/16 nền trong suốt (alpha nhị phân), mọi pixel sát nền đều là viền tối (61,44,41), blob lớn nhất không chạm mép crop (không dính món kế bên), màu đặc trưng đúng từng món (ghế kem, cây xanh chậu đỏ, lò sưởi trắng...). `npm run typecheck` PASS.
- Bước 2 xong: 16 món thêm vào cuối 4 nhóm (`plants` 4 món, `seating` 3 món có `role: "seat"`, `bedroom` 5 món, `lighting` 4 món), ảnh `furniture/<tên>`, `rotation` mặc định `"none"`, màu theo quy ước (gỗ 0x8d6e63, cây 0x2a9d8f, đèn đồng 0xb08968, ghế kem 0xc29a78), kèm comment chỉ nguồn cắt ở mỗi nhóm. `npm run typecheck` PASS.
- Bước 3 xong: T3 thêm vào `tests/decor-catalog.spec.ts` (giữ nguyên T1, T2). `npx playwright test tests/decor-catalog.spec.ts`: 3/3 PASS. `npx playwright test`: 20/20 PASS. `npm run typecheck` PASS. Cả 3 bước của plan hoàn tất.

## Test status
- Lần chạy cuối: bước 3 — `npx playwright test tests/decor-catalog.spec.ts` (3 passed) rồi `npx playwright test` (20 passed). `npm run typecheck` PASS.
- Kết quả từng test:
  - T1, T2: PASS (có sẵn)
  - T3: PASS — đủ 16 kind, ảnh tồn tại trên đĩa, 3 ghế (`armchair_baroque`, `chair_cream`, `armchair_cream`) có `role === "seat"`, không kind nào trùng món cũ
- Fail chi tiết: không

## Verify
- T3: PASS (playwright 20/20, typecheck OK). 16 PNG đúng hình, nền trong suốt, có viền tối; so sánh cạnh nội thất cũ ở cùng kích thước thấy khớp phong cách (mắc áo hơi tối/lấm). Chưa đặt thử trong game vì tài khoản mới có $0.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
