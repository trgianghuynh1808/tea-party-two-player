# Task: Chỉ cho xoay nội thất có đủ 4 ảnh (4 mặt)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Một món chỉ xoay được (badge ⟳, nút ⟳ Xoay, phím R) khi có đủ 4 ảnh 4 mặt (`rotation: "views"` với `views` đủ front/left/back/right).
- Món chỉ có 1 ảnh (thảm, giường/ghế/tủ kiểu "flip", cây thông ngoài sân, món custom từ portal) KHÔNG xoay được nữa, không còn badge ⟳.
- Server cũng từ chối xoay (clamp về 0), save cũ có rotation > 0 của món đó vẫn load được (về mặt 0).
- Chế độ Build và Decorate vẫn hành xử giống nhau.

## Quyết định đã chốt
- Bỏ hẳn kiểu "flip" (lật gương) và "rotate" (thảm xoay 90°): chỉ còn "none" và "views".
- Thảm = "none" (không xoay). Props ngoài sân (pine_s...) không có decor = 1 hướng (trước đây 2).
- Món custom từ portal có `rotation` "flip"/"rotate" thì ép về "none" (không từ chối, để không làm hỏng catalog/save đã có).
- Người chơi bị ảnh hưởng: món đã đặt với rotation > 0 hiển thị mặt 0 (normalizeRotation đã clamp).

## Ngữ cảnh
- `shared/src/decor.ts`:
  - `type DecorationRotation = "none" | "flip" | "rotate" | "views"` (dòng ~63); `rotationCount(def)` = flip→2, rotate/views→4, còn lại 1; `normalizeRotation`; `footprintOf` (đổi w/h khi rotation lẻ với rotate|views).
  - Helper `decor(kind,label,price,image,w,h,imageHeight,color,rotation="none")`, `rug(...)` (đang `rotation: "rotate"`), `viewsDecor(...)` (có `views: viewsOf(kind)` đủ 4 mặt), ghế `chair` dùng `"views"` + `views: {...}` viết tay (dòng ~216-225, kiểm tra đủ 4 mặt).
  - Các món đang `"flip"`: `stool` (~226), `bed_red`, `nightstand_lamp`, `nightstand_teal_lamp`, `bed_red_2`, `bed_blue_lamp`, `nightstand_green_lamp` (~238-256) → đổi thành "none".
- `shared/src/customDecor.ts` dòng ~46-48: parse `rotation` (hiện cho "none"|"flip"|"rotate" với floor) → ép về "none".
- `shared/src/world.ts` `buildRotationCount(def)` (~406): prop không có `decor` trả 2 → đổi thành 1; prop có decor thì theo `rotationCount`. `normalizeTileRotation` dùng nó.
- Client dùng nhánh flip/rotate cần dọn: `client/src/scenes/DecorController.ts` (dòng ~73 `flipped`, ~105 `setAngle(... "rotate")`, ~111 `setFlipX`), `client/src/scenes/YardView.ts` (~57 `flipX`). UI badge/nút đã tự theo `rotationCount`/`buildRotationCount`: `client/src/ui/DecorPanel.ts:139`, `client/src/ui/BuildPanel.ts:69`; `rotate()` trong `BuildController.ts` (~281) và DecorController đã chặn khi count < 2.
- Server clamp qua `normalizeRotation` / `normalizeTileRotation` (SharedShop `buy`/`move`/`buildTiles`/`moveTile`) — không cần đổi nếu shared đúng.
- Test facts: `window.__GAME__` có `room`, `send(type, payload)`, `state`, `tiles()`, `tileRotations()`, `stationLabels()`. Đặt đồ: `send("buy_decoration", {kind,x,y,rotation})`, `send("move_decoration", {id,x,y,rotation})`, `send("build_tiles", {tool,x0,y0,x1,y1,rotation})`. Đồ đã đặt đọc ở `__GAME__.state.decorations` (mỗi phần tử có `id`, `kind`, `rotation`). Cấp tiền: `PATCH ${TEST_SERVER_URL}/admin/users/<name>/money` header `Authorization: Bearer test-admin-token`, body `{set: 500}`. Phiên thứ 2 vào bằng `/?test=1&room=<roomId>` (`room.roomId`). Playwright KHÔNG import được module TS của server (chỉ import `@boba/shared` thì được, như `tests/build-parity.spec.ts`). Nút Decorate `#decorate-btn`, panel `#decor-panel`, card `.decor-item`, badge `.rotate-badge`; Build/Decorate chỉ bật ở khu sân/nhà (xem `tests/build-parity.spec.ts` T3 và `tests/decor-catalog.spec.ts` "rotate-badge T1" để lấy cách mở panel).
- Spec hiện có sẽ vỡ vì giả định cũ, phải sửa: `tests/build-parity.spec.ts` (T1 dòng ~76-78 `decor_bed_red`→2, `pine_s`→2; T2 dùng `pine_s` rotation 1 và khoản tiền 460 — đổi sang món views, ví dụ tool `decor_sofa_lilac`, và tính lại tiền theo giá của nó), `tests/decor-catalog.spec.ts` (kiểm tra mọi dòng nhắc rotation "flip"/"rotate", test rotate-badge vẫn đúng vì dùng `rotationCount`), `tests/custom-decor.spec.ts` (gửi `rotation: "flip"` — vẫn phải trả 200). Grep thêm `rotation` / `flip` trong `tests/` để chắc không sót.

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → bỏ "flip"/"rotate" khỏi `DecorationRotation`, `rotationCount`, `footprintOf`; đổi `rug()` và 7 món flip liệt kê ở Ngữ cảnh sang "none"; thêm guard: `rotationCount` chỉ trả 4 khi `def.rotation === "views"` và `def.views` có đủ 4 mặt VIEW_ORDER, ngược lại 1 (và `footprintOf` dùng cùng điều kiện). Kiểm tra `chair.views` đủ 4 mặt. `shared/src/customDecor.ts` → ép `rotation` về "none" (bỏ cho phép flip/rotate, cập nhật comment đầu file). `shared/src/world.ts` → `buildRotationCount`: prop không có decor trả 1, sửa comment. `client/src/scenes/DecorController.ts` + `client/src/scenes/YardView.ts` → xóa nhánh `flip`/`rotate` (setFlipX, setAngle, flipX) đã chết. Chạy `npm run typecheck`.
- [x] 2. [vừa] `tests/build-parity.spec.ts` → sửa T1 (expect `decor_bed_red`→1, `pine_s`→1, giữ `decor_sofa_lilac`→4) và T2 (thay `pine_s` bằng prop views `decor_sofa_lilac` hoặc món views khác rẻ, rotation 1 giữ nguyên khi move, tính lại tiền theo giá trong `DECORATION_CATALOG`); `tests/decor-catalog.spec.ts` + `tests/custom-decor.spec.ts` sửa các chỗ còn giả định flip/rotate. Chạy `npx playwright test tests/build-parity.spec.ts tests/decor-catalog.spec.ts tests/custom-decor.spec.ts`.
- [x] 3. [vừa] `tests/decor-catalog.spec.ts` → thêm test T1–T3 (xem Test cases), tái dùng `joinAsHost`/helper có sẵn. Chạy `npx playwright test tests/decor-catalog.spec.ts -g "only-4-views"`.
- [x] 4. [dễ] `README.md` → mục Decorating (dòng ~116): ⟳ chỉ xuất hiện trên món có đủ 4 mặt; bỏ mọi chỗ nói lật/xoay món 1 ảnh. `AGENTS.md` → nếu có nhắc rotation kiểu flip/rotate thì sửa (thêm 1 câu vào Code Conventions: chỉ món `rotation: "views"` đủ 4 ảnh mới xoay được). Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Catalog: chỉ món 4 mặt xoay được — rule shared đúng cho decorate + build — tests/decor-catalog.spec.ts
  - Setup: không cần trình duyệt (chỉ import `@boba/shared`).
  - Steps: 1. với mỗi def trong `DECORATION_CATALOG`: tính `rotationCount(def)`. 2. với `getBuildTile("pine_s")`, `getBuildTile("decor_bed_red")`, `getBuildTile("decor_sofa_lilac")`: `buildRotationCount`. 3. parse custom decor `{rotation:"flip"}` qua `parseCustomDecor` (tên hàm xem `shared/src/customDecor.ts`).
  - Assert: `rotationCount(def) === 4` ⇔ `def.rotation === "views"` và có đủ 4 key `front/left/back/right`, còn lại `=== 1`; không def nào có rotation "flip"/"rotate"; thảm (`layer === "floor"`) = 1; `pine_s`→1, `decor_bed_red`→1, `decor_sofa_lilac`→4; custom "flip" → rotation "none".
- [x] T2. Server clamp — món 1 ảnh không xoay được, món 4 mặt xoay được — tests/decor-catalog.spec.ts
  - Setup: user duy nhất `p1-${Date.now()}`, `joinAsHost`, cấp 1000 tiền qua admin API, 1 phiên.
  - Steps: 1. `send("buy_decoration", {kind:"bed_red", x, y, rotation:1})` và `send("buy_decoration", {kind:"sofa_lilac", x, y, rotation:1})` ở 2 vị trí trống hợp lệ trong nhà (lấy x,y như `tests/gadgets-tabletop.spec.ts` dòng ~103). 2. đọc `__GAME__.state.decorations`.
  - Assert: poll được bed_red có `rotation === 0`; sofa_lilac có `rotation === 1`.
- [x] T3. UI: badge ⟳ và nút Xoay — decorate + build chỉ hiện cho món 4 mặt — tests/decor-catalog.spec.ts
  - Setup: user duy nhất, `joinAsHost`, 1 phiên.
  - Steps: 1. mở `#decorate-btn`, mở hết `details.decor-section`. 2. đếm `.rotate-badge` và đối chiếu theo `.name`. 3. mở panel Build (cách mở xem `tests/build-parity.spec.ts` T3), đếm badge.
  - Assert: card "Giường chăn đỏ", "Đôn gỗ", thảm không có `.rotate-badge`; "Sofa tím oải hương", "Kệ sách" có `.rotate-badge`; panel Build: card cây thông không có badge, card sofa có.

## Trạng thái hiện tại
- Bước 1 xong: `shared/src/decor.ts` — `DecorationRotation` chỉ còn `"none" | "views"`; thêm helper `hasFullViews` (đủ 4 ảnh theo `VIEW_ORDER`); `rotationCount` = 4 chỉ khi `rotation === "views"` && `hasFullViews`, ngược lại 1; `footprintOf` hoán đổi w/h theo cùng điều kiện; `rug()` bỏ `rotation: "rotate"` (mặc định none); 7 món flip (stool, bed_red, nightstand_lamp, nightstand_teal_lamp, bed_red_2, bed_blue_lamp, nightstand_green_lamp) về mặc định none; `chair.views` đã có đủ 4 mặt front/left/back/right (không cần sửa). `shared/src/customDecor.ts` — `parseCustomDecoration` luôn đặt `rotation: "none"` (không từ chối record flip/rotate cũ), comment đầu file cập nhật. `shared/src/world.ts` — `buildRotationCount`: prop không có decor trả 1, comment sửa. `client/src/scenes/DecorController.ts` — bỏ `flipped`/`setFlipX`/`setAngle` và comment nhắc flip/rotate. `client/src/scenes/YardView.ts` — `propTexture` bỏ trường `flipX`, chỗ vẽ prop bỏ `.setFlipX`, comment sửa.
- File ngoài plan phải đổi: `client/src/scenes/BuildController.ts` (2 chỗ `.setFlipX(tex.flipX)` trong `showPreview`/`previewPropDrag`) — `propTexture` bỏ trường `flipX` nên `npm run typecheck` buộc phải sửa theo.
- Bước 2 xong: `tests/build-parity.spec.ts` — T1 expect `decor_bed_red`→1, `pine_s`→1, giữ `decor_sofa_lilac`→4; phần clamp đổi sang kiểm tra `pine_s` luôn về 0 và `decor_sofa_lilac` 0/1/3 giữ, 4→0; save test dùng `decor_sofa_lilac` rotation 1 (pine_s không còn xoay nên load sẽ về 0) và vẫn kiểm tra save cũ thiếu `tileRotations` load được. T2 đổi 2 cây thông (2x$20) sang 2 sofa views `decor_sofa_lilac` (2x$160): tiền 500→180, bán 50% ($80)→260, facing 1 giữ khi move. `tests/decor-catalog.spec.ts` và `tests/custom-decor.spec.ts` không có chỗ nào còn giả định flip/rotate (custom gửi "flip" vẫn 200 vì parse ép "none"), không phải sửa.
- `npm run typecheck` PASS; `npx playwright test tests/build-parity.spec.ts tests/decor-catalog.spec.ts tests/custom-decor.spec.ts` 15/15 PASS.
- Bước 3 xong: `tests/decor-catalog.spec.ts` thêm 3 test "only-4-views": T1 kiểm tra rule shared cho mọi def trong `DECORATION_CATALOG` (4 ⇔ views đủ front/left/back/right, còn lại 1, không còn flip/rotate, thảm layer floor = 1), `buildRotationCount` cho `pine_s`→1, `decor_bed_red`→1, `decor_sofa_lilac`→4, và `parseCustomDecoration` với rotation "flip" → "none"; T2 (browser) cấp 1000 tiền qua admin API, host mua `bed_red` rotation 1 và `sofa_lilac` rotation 1 ở 2 spot hợp lệ trong quán (spot của sofa tính theo rotation 1 vì footprint đổi w/h), poll `state.decorations` ra `[0, 1]`; T3 (browser) mở `#decorate-btn` + mở hết `details.decor-section`, đọc badge theo `.name` (Giường chăn đỏ/Đôn gỗ/Thảm bánh mì = không badge; Sofa tím oải hương/Kệ sách = có), rồi mở `#build-btn` kiểm tra Thông nhỏ = không badge, Sofa tím oải hương = có. Cũng rút ngắn `uniqueUser` của file dùng `Date.now().toString(36)` để tên ≤ 16 ký tự (admin API trả 400 "bad name" với tên dài hơn).
- `npm run typecheck` PASS; `npx playwright test tests/decor-catalog.spec.ts -g "only-4-views"` 3/3 PASS.
- Bước 4 xong: `README.md` mục Decorating & saving — badge ⟳ giờ nói rõ chỉ món có đủ 4 mặt mới xoay được, món 1 ảnh (thảm, phần lớn giường/ghế/tủ, prop ngoài sân, custom từ portal) không xoay và không có badge; câu build mode và mục Controls cũng thêm "(only pieces with all four side artworks can turn)". `AGENTS.md` Code Conventions — thêm 1 câu: chỉ món `rotation: "views"` đủ 4 ảnh front/left/back/right mới xoay được (⟳, R, ⟳ Xoay), còn lại cố định mặt 0 qua `rotationCount` / `buildRotationCount`. Docs checked: README + AGENTS đã cập nhật theo code; không còn chỗ nào nói lật/xoay món 1 ảnh.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS (bước 4, không có lệnh playwright riêng; không đổi spec).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
- Fail chi tiết:

## Verify
- Chạy cả bộ e2e: 50/50 PASS (mobile-build-ui T1 flaky lần đầu, pass khi retry). `npm run typecheck` PASS.
- T1/T2/T3 PASS (spec đã kiểm tra rule shared, server clamp, badge ⟳ decorate+build). Verify light: không cần kiểm tra thị giác thêm.
- Review diff: không có lỗi blocking; docs README/AGENTS đã cập nhật.

VERIFY: PASS
## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
