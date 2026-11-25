# Task: Nội thất nhà bếp xoay 4 mặt (danh mục "Nhà bếp")

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Lấy ảnh sprite nhà bếp (`~/Downloads/Pixel Art Kitchen Furniture Sprites – Top-Down Game Asset Pack.jpeg`, 736x899, nền tím) làm sheet nguồn; chỉ chọn món có đủ mặt trước/sau/cạnh (mặt phải = lật mặt trái): tủ lạnh, máy giặt, ghế gỗ bếp.
- Viết tool cắt `cut_kitchen.py` (xóa nền tím, giữ pixel-art sắc nét) → 12 PNG trong `client/public/assets/decor/kitchen/`.
- Thêm danh mục mới "🍳 Nhà bếp" trong `shared/src/decor.ts` với 3 món `rotation: "views"` (xoay được bằng R / ⟳ ở cả Trang trí lẫn Xây dựng).
- Bàn bếp, tủ bếp, bếp lò, lò vi sóng, ghế đẩu... chỉ có 1 mặt → KHÔNG đưa vào.

## Mục tiêu
- Có danh mục "Nhà bếp" trong bảng Trang trí (và Xây dựng nếu panel đó lấy danh mục từ `DECORATION_CATEGORIES`).
- Mỗi món bếp trong danh mục có đủ 4 mặt (front/left/back/right) và xoay được; footprint đổi chiều khi xoay.

## Quyết định đã chốt
- Chỉ món có ≥ front + back + 1 mặt cạnh trong ảnh. Mặt cạnh còn lại dựng bằng lật ngang (`ImageOps.mirror`).
- Kind mới (đã grep, chưa tồn tại): `fridge_kitchen`, `washer_kitchen`, `chair_kitchen`. Không đụng kind cũ (`stove`, `bath_washers`, `chair`).
- Chỉ có tủ lạnh/máy giặt/ghế bếp là `layer: "object"` nên dùng được cả chế độ Xây dựng (không cần làm gì thêm: `BUILD_TILES` lấy từ catalog).

## Ngữ cảnh
- `shared/src/decor.ts`: `DECORATION_CATEGORIES` (mảng `{id, title}` `as const`, dòng ~162), `inCategory(category, defs)`, helper `viewsDecor(kind, label, price, width, height, imageHeight, color)` → dùng `views/${kind}_front.png` làm `image` và `viewsOf(kind)` (đường dẫn cố định `assets/decor/views/${kind}_<view>.png`). Cần helper mới cho thư mục `kitchen/`: ví dụ sửa `viewsOf(kind, dir = "views")` và `viewsDecor(..., dir)` hoặc thêm `kitchenDecor` tương tự. `role: "seat"` cho ghế: `{ ...viewsDecor(...), role: "seat" }`. `rotationCount`, `footprintOf(def, rotation)` (đổi width/height khi rotation lẻ), `hasFullViews`.
- Hướng view: 0 front, 1 left, 2 back, 3 right (`VIEW_ORDER`).
- Tool mẫu: `client/assets-src/tools/build_furniture_views.py` (BOXES crop, `cutout_white`, MARGIN 6, ghi PNG RGBA). Chạy bằng `.venv-art/bin/python` (Pillow, NumPy, SciPy). Tool mới cắt nền TÍM đồng nhất (khoảng `#8a8ab0`): lấy màu nền từ góc ảnh, mask = khoảng cách màu < ~12, flood từ viền (`ndi.label` các vùng nền chạm viền), giữ blob lớn nhất. KHÔNG resize bằng LANCZOS (pixel-art): giữ nguyên pixel; nếu cần scale dùng `Image.NEAREST`.
- Ảnh nguồn: copy vào `client/assets-src/sheets/kitchen-sheet-1.jpeg` (hiện chỉ ở `~/Downloads/`). Tool đọc từ đó.
- Toạ độ xấp xỉ trong ảnh (x0,y0,x1,y1; ảnh 736x899), hãy mở ảnh crop ra kiểm tra bằng mắt rồi chỉnh:
  - Tủ lạnh (hàng 1): cạnh `(52,55,128,220)`, trước có nam châm `(172,55,250,218)`, sau lưới `(295,55,372,218)`. Bỏ 2 tủ lạnh mở cửa.
  - Máy giặt (hàng 2): trước `(52,272,128,382)`, sau `(132,272,206,382)`, cạnh `(220,265,288,382)`.
  - Ghế gỗ bếp (hàng 5): cạnh `(58,535,100,606)`, trước `(145,535,188,606)`, sau `(470,545,513,608)`.
  - Nếu một mặt trông sai (vd mặt "sau" thực ra là mặt trước khác) thì chọn mặt khác hợp lý hơn; nếu thật sự không có đủ 3 mặt cho 1 món thì bỏ món đó và ghi vào "Trạng thái hiện tại" bằng dòng `Lưu ý:`.
- Kích thước gợi ý (px thế giới): `fridge_kitchen` "Tủ lạnh" giá 180, footprint 30x24, imageHeight 66; `washer_kitchen` "Máy giặt cửa tròn" giá 150, footprint 28x24, imageHeight 46; `chair_kitchen` "Ghế gỗ bếp" giá 45, footprint 22x20, imageHeight 42 (role seat). Ảnh view cạnh hẹp hơn: dùng cùng tỉ lệ pixel/world của mặt trước (không scale riêng từng view).
- Test: `tests/decor-catalog.spec.ts` đã có `decodePng(file)` (kiểm alpha), mẫu "furniture-views T1/T2" (dòng ~79-180) và import `getDecorationDef`, `rotationCount`, `footprintOf`, `DECORATION_CATEGORIES`, `DECORATION_CATALOG` từ `../shared/src/...`. Đây là test cấp node (không mở trình duyệt, không cần `window.__GAME__`); Playwright không import được module server TS nhưng import được `shared/` như file này đang làm.

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_kitchen.py` → tạo: copy ảnh `~/Downloads/Pixel Art Kitchen Furniture Sprites – Top-Down Game Asset Pack.jpeg` thành `client/assets-src/sheets/kitchen-sheet-1.jpeg`; tool cắt 3 món × 4 mặt (BOXES như Ngữ cảnh, mặt `right` = mirror của `left`) và ghi 12 PNG RGBA nền trong suốt vào `client/public/assets/decor/kitchen/<kind>_<view>.png` (kind: `fridge_kitchen`, `washer_kitchen`, `chair_kitchen`). Cuối script assert đủ 12 file không rỗng. Chạy `.venv-art/bin/python client/assets-src/tools/cut_kitchen.py` và xem thử vài PNG.
- [x] 2. [khó] `shared/src/decor.ts` → thêm `{ id: "kitchen", title: "🍳 Nhà bếp" }` vào `DECORATION_CATEGORIES` (sau "bathroom"), thêm helper cho thư mục `kitchen/` (tái dùng `viewsOf`/`viewsDecor` với tham số thư mục, không đổi đường dẫn các món cũ), thêm block `...inCategory("kitchen", [...])` với 3 món trong Ngữ cảnh (ghế có `role: "seat"`). Kiểm tra panel Trang trí/Xây dựng (`client/src/ui/DecorPanel.ts`, `BuildPanel.ts`) tự lấy danh mục từ `DECORATION_CATEGORIES`; nếu có chỗ hard-code danh mục thì thêm "kitchen" ở đó (ghi lý do vào Trạng thái hiện tại). Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/decor-catalog.spec.ts` → thêm 2 test kitchen (T1, T2 bên dưới) cuối file, tái dùng `decodePng`. Chạy `npx playwright test tests/decor-catalog.spec.ts -g "kitchen"`.
- [x] 4. [dễ] `README.md` → mục Decorating & saving: thêm danh mục "Nhà bếp" nếu README liệt kê các danh mục (so với code); nếu không liệt kê thì ghi "Docs checked: no change needed" vào Trạng thái hiện tại. Chạy `npm run typecheck`.

## Test cases
- [x] T1. kitchen-catalog — danh mục "kitchen" có đúng 3 món 4 mặt, mỗi view có PNG alpha trên đĩa — tests/decor-catalog.spec.ts
  - Setup: không cần trình duyệt/user; import từ `../shared/src/decor`.
  - Steps: 1. `DECORATION_CATEGORIES.some(c => c.id === "kitchen" && c.title.includes("Nhà bếp"))`. 2. Với kind `fridge_kitchen`, `washer_kitchen`, `chair_kitchen`: `getDecorationDef(kind)`, đọc `views`, mỗi view `decodePng("client/public/" + path)`.
  - Assert: danh mục tồn tại; `DECORATION_CATALOG.filter(d => d.category === "kitchen")` dài 3; mỗi def `rotation === "views"`, `rotationCount(def) === 4`, `layer === "object"`, giá > 0; 4 file tồn tại, 1 trong 4 góc trong suốt (alpha 0) và vùng giữa có pixel alpha 255; `chair_kitchen.role === "seat"`.
- [x] T2. kitchen-rotate-footprint — xoay đổi chiều footprint, rotation được clamp 0..3 — tests/decor-catalog.spec.ts
  - Setup: như T1.
  - Steps: 1. `footprintOf(fridge, 0)` và `footprintOf(fridge, 1)`, `footprintOf(fridge, 2)`, `footprintOf(fridge, 3)`. 2. `normalizeRotation(fridge, 3)` và `normalizeRotation(fridge, 4)`.
  - Assert: rotation 0/2 giữ `{width: def.width, height: def.height}`; 1/3 đổi chỗ (width = def.height, height = def.width); `normalizeRotation(...,3) === 3`, `(...,4) === 0`.

## Trạng thái hiện tại
- Bước 1 xong: copy ảnh nguồn vào `client/assets-src/sheets/kitchen-sheet-1.jpeg` (736x899); tạo `client/assets-src/tools/cut_kitchen.py` (nền tím lấy từ góc sheet, ngưỡng 12 + fringe 30, flood từ viền, giữ blob lớn nhất, lấp lỗ chỉ bằng pixel không-phải-nền, không resize); chạy tool ghi 12 PNG RGBA vào `client/public/assets/decor/kitchen/` (fridge 75-78x164, washer 65-73x110-119, chair 39-42x62-70; mặt `right` = mirror `left`); script assert 12 file không rỗng. `npm run typecheck` PASS.
- Lưu ý: model này không đọc được ảnh, nên "xem thử PNG" được thay bằng kiểm tra số trên từng file: 4 góc alpha 0, vùng giữa alpha 255, 0 pixel màu nền sót trong vùng trong suốt, right là mirror pixel-chính-xác của left, cover blob 0.70–0.99. Người duyệt nên mở vài PNG (đặc biệt `fridge_kitchen_back.png` — ô lưới để trong suốt) xác nhận bằng mắt.
- Bước 2 xong: `shared/src/decor.ts` — thêm `{ id: "kitchen", title: "🍳 Nhà bếp" }` vào `DECORATION_CATEGORIES` sau "bathroom"; `viewsOf(kind, dir = "views")` và `viewsDecor(..., color, dir = "views")` nhận tham số thư mục (món cũ vẫn dùng mặc định "views", đường dẫn không đổi); block `...inCategory("kitchen", [...])` sau bathroom với 3 món `viewsDecor` dir "kitchen": Tủ lạnh 180 (30x24, imageHeight 66, 0xe5e2dd), Máy giặt cửa tròn 150 (28x24, 46, 0xe5e2dd), Ghế gỗ bếp 45 (22x20, 42, 0xa9744f, `role: "seat"`). DecorPanel/BuildPanel/customDecor đều tự lấy danh mục từ `DECORATION_CATEGORIES` (không phải sửa); `BUILD_TILES` tự nhận 3 món qua `DECORATION_CATALOG.filter(layer === "object")` (world.ts). Sửa ngoài file plan: `server/portal/index.html` `CD_CATEGORIES` (dòng ~422) hard-code danh mục cho select nhóm của custom furniture — thêm `{ id: "kitchen", title: "🍳 Nhà bếp" }` đúng chỉ dẫn "chỗ hard-code danh mục thì thêm kitchen", để portal gán được nhóm bếp cho nội thất tuỳ chỉnh. `npm run typecheck` PASS.
- Selectors: `details.decor-section` + `.decor-item` + `.rotate-badge` (client/src/ui/DecorPanel.ts, group "🍳 Nhà bếp"), `h3.build-group` + `.decor-item.build-item` (client/src/ui/BuildPanel.ts, group "🍳 Nhà bếp (nội thất, bấm vào 1 ô)").
- Bước 3 xong: thêm 2 test cuối `tests/decor-catalog.spec.ts` (trước phần ⟳ badge) — `kitchen T1` kiểm danh mục `kitchen` (title chứa "Nhà bếp"), đúng 3 món `rotation: "views"`, `rotationCount` 4, `layer: "object"`, giá > 0, mỗi view có PNG tồn tại + 1 góc alpha 0 + giữa có alpha 255, `chair_kitchen.role === "seat"`; `kitchen T2` kiểm `footprintOf(fridge, 0/2)` giữ nguyên, `1/3` đổi chỗ width/height, `normalizeRotation(fridge, 3) === 3`, `(..., 4) === 0`. Chạy `npm run typecheck` PASS và `npx playwright test tests/decor-catalog.spec.ts -g "kitchen"` PASS (2/2).
- Bước 4 xong: Docs checked: no change needed. README mục "Decorating & saving" không liệt kê danh mục trang trí (chỉ mô tả badge ⟳, xoay, tabletop, xây dựng và trỏ tới `shared/src/decor.ts`), nên không thêm "Nhà bếp"; câu "most beds/chairs/cabinets … can't be turned" vẫn đúng với code (3 món bếp đều 4 mặt). `npm run typecheck` PASS.

## Test status
- Lần chạy cuối: bước 4 chỉ `npm run typecheck` → PASS (docs only, plan không có lệnh test riêng).
- Kết quả từng test:
  - T1: PASS (bước 3)
  - T2: PASS (bước 3)
- Fail chi tiết:

## Verify
- Full suite `npx playwright test`: 57/57 PASS (T1, T2 PASS); `npm run typecheck` PASS.
- Visual: montage 3 món x 4 mặt, nền trong suốt sạch, right = lật của left, ghế/tủ lạnh/máy giặt đúng hướng. Ảnh: `.agents/screenshots/task-16-kitchen-views.png`.
- Lưu ý: tủ lạnh/máy giặt ra màu be/nâu nhạt (theo ảnh nguồn), không phải trắng; đã sửa portal `server/portal/index.html` thêm nhóm "Nhà bếp" ngoài plan.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
