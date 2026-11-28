# Task: Xóa điện thoại, tablet và logic đặt đồ lên bàn

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Xóa `gadget_phone` (Điện thoại) và `gadget_tablet` (iPad) khỏi danh mục nội thất.
- Xóa toàn bộ logic đồ để bàn: layer `tabletop`, `surface`, đặt lên bàn, di chuyển/bán theo bàn, chặn xoay bàn.
- Save cũ có phone/tablet vẫn load được (món đó bị bỏ qua, không crash).

## Ý tưởng
- Xóa 2 món + layer `"tabletop"` + field `surface` + `surfaceUnder`/`piecesOnSurface` ở `shared/`; dọn nhánh tương ứng ở `SharedShop`, `DecorController`, portal.
- Giữ `tv_stand_wood`, piano, bàn như đồ thường (chỉ bỏ `surface`). Danh mục "gadgets" vẫn còn vì có piano/kệ TV.
- Save cũ: kind không còn trong catalog bị `canPlaceDecoration` từ chối nên bị bỏ (đã có cơ chế `dropped`).

## Quyết định đã chốt
-

## Ngữ cảnh
- `shared/src/decor.ts`: type `DecorationLayer` có `"tabletop"` (dòng ~12); `DecorationDef.surface?` (~49); helper `table()` (~129) gắn `surface`; `tv_stand` (~306) và `vanity_piano_gold` (~311) và `tv_stand_wood` (~421) có `surface: {...}`; `gadget_phone`/`gadget_tablet` ở ~419-420 (trong `inCategory("gadgets", [...])`). Comment nhắc tabletop ở ~416.
- `shared/src/placement.ts`: `canPlaceDecoration` có dòng `if (def.layer === "tabletop" && !surfaceUnder(...))` (~100) và comment ~91; hàm export `surfaceUnder`, `piecesOnSurface` (~118-155) xóa hẳn (kiểm tra `shared/src/index.ts` có re-export không).
- `shared/src/customDecor.ts`: `LAYERS` (dòng 25) có `"tabletop"`; parse `surface` (~61-66) và `if (surface) def.surface = surface` (~85); comment ~92 nhắc gadgets.
- `server/src/shop/SharedShop.ts`: import `piecesOnSurface` (19); `move()` (~195-225) có `carried` + lỗi "Dọn đồ trên bàn trước khi xoay" + dịch chuyển carried; `sell()` (~227-245) có vòng `def?.surface`; restore (~546-551) có `isTabletop` sắp xếp lại thứ tự, thay bằng lặp thẳng `save.decorations`.
- `client/src/scenes/DecorController.ts`: import `piecesOnSurface`, `surfaceUnder` (16-19); nhánh `"tabletop"` ở ~100, ~386-473 (drag: `dragFloor`, `draggingCarried`, `tabletopFloorAt`, `syncSurfaceView`), ~558-560 (ghost lift), ~603-650 (`syncSurfaceView`, `surfaceAtPoint`, `tabletopFloorAt`). Xóa hết, giữ hành vi kéo thả của đồ thường y như cũ (`applyDepth` luôn chạy).
- `server/portal/index.html`: option layer `{ id: "tabletop", label: "Để bàn" }` (~439), input "Mặt bàn cao (px)" (`surfaceInput`, ~636-700, ~733-734) xóa; chỉnh comment ~664.
- Asset: `client/public/assets/decor/gadgets/phone.png`, `tablet.png` xóa. `client/assets-src/tools/draw_gadget_props.py` có hàm `phone()`/`tablet()` (~137-180), danh sách Writes (dòng 5) và docstring: bỏ phần phone/tablet, giữ tv_stand_wood/piano/vanity.
- Test cũ `tests/gadgets-tabletop.spec.ts` (3 test về tabletop) sẽ xóa hẳn và thay bằng spec mới. Test dùng: `joinAsHost(page, user)`, `writeShopSave(user, {version:1, money:0, decorations:[{kind,x,y,rotation:0}], tiles:{}, tileRotations:{}})`, `shopFile`, `userFile` từ `tests/helpers.ts`; dọn bằng `rm(shopFile(u))`, `rm(userFile(u))`. Playwright không import được module TS của server, nhưng import `@boba/shared` được (xem import ở spec cũ). `window.__GAME__.state.decorations` iterable có `{id, kind, x, y}`. Mẫu `uniqueUser` và `decorationsOf` lấy từ spec cũ.
- Docs: `README.md` dòng ~164-166 (đoạn "Phones and iPads go on a table top") xóa; dòng ~199 bỏ "tabletop" và "table surface" khỏi mô tả portal; `AGENTS.md` dòng 62 (quy ước Tabletop gadgets) xóa, và đoạn `draw_gadget_props.py` ở Codebase Map (dòng 32) sửa thành "head-on TV stand/piano sprites".
- Chú ý trùng kind: sau khi xóa, grep `gadget_phone|gadget_tablet|tabletop|surface` trong `shared client server tests` phải sạch (trừ chữ "surface" của fishing trong `BobaShopRoom.ts`/`fishing.spec.ts` và `surface` của KitchenArt/ShopScene, không liên quan).

## Plan
- [x] 1. [khó] `shared/src/decor.ts` → xóa `gadget_phone`/`gadget_tablet`, layer `"tabletop"`, field `surface` (kể cả trong `table()`, `tv_stand`, `vanity_piano_gold`, `tv_stand_wood`); `shared/src/placement.ts` → xóa `surfaceUnder`, `piecesOnSurface` và nhánh tabletop trong `canPlaceDecoration`; `shared/src/customDecor.ts` → bỏ `"tabletop"` khỏi `LAYERS` và phần parse `surface`; sửa các comment liên quan và export trong `shared/src/index.ts` nếu có.
- [x] 2. [vừa] `server/src/shop/SharedShop.ts` → `move()`, `sell()`, restore: bỏ logic carried/surface/isTabletop (đồ giờ đi/bán một mình); `server/portal/index.html` → bỏ option "Để bàn" và ô "Mặt bàn cao".
- [x] 3. [vừa] `client/src/scenes/DecorController.ts` → xóa mọi nhánh tabletop/surface/carried/dragFloor và 3 hàm `syncSurfaceView`, `surfaceAtPoint`, `tabletopFloorAt`; bỏ import `piecesOnSurface`, `surfaceUnder`. Chạy `npm run typecheck`.
- [x] 4. [dễ] `client/assets-src/tools/draw_gadget_props.py` → bỏ `phone()`/`tablet()` và dòng Writes/docstring tương ứng; xóa file `client/public/assets/decor/gadgets/phone.png` và `tablet.png`.
- [x] 5. [dễ] `README.md` và `AGENTS.md` → cập nhật như mục Docs ở Ngữ cảnh.
- [x] 6. [vừa] `tests/gadgets-tabletop.spec.ts` → xóa file; tạo `tests/decor-no-tabletop.spec.ts` với T1, T2 (xem Test cases). Chạy `npx playwright test tests/decor-no-tabletop.spec.ts` rồi `npx playwright test` một lần.
- [x] 7. [vừa] Fix: `server/src/shop/SharedShop.ts` → bước 1 ĐÃ XONG và commit (không làm lại, không revert); typecheck đỏ ở bước 1 là bình thường vì phụ thuộc chéo. Làm tiếp bước 2→6 theo thứ tự, KHÔNG chạy typecheck ở bước 1/2; chỉ chạy `npm run typecheck` sau bước 3 (phải xanh), rồi `npm run typecheck` lần cuối sau bước 6.

## Test cases
- [x] T1. Catalog sạch — phone/tablet và layer tabletop không còn — tests/decor-no-tabletop.spec.ts
  - Setup: không cần server; import `getDecorationDef`, `DECORATION_CATALOG` từ `@boba/shared`.
  - Steps: 1. gọi `getDecorationDef("gadget_phone")` và `("gadget_tablet")` · 2. duyệt `DECORATION_CATALOG`.
  - Assert: hai lần gọi trả `undefined`; không def nào có `layer === "tabletop"` hay field `surface`; `getDecorationDef("tv_stand_wood")` và `("piano_grand")` vẫn tồn tại.
- [x] T2. Save cũ có phone vẫn load — phone bị bỏ, bàn vẫn còn — tests/decor-no-tabletop.spec.ts
  - Setup: 1 user duy nhất (`uniqueUser()`), 1 phiên; tìm chỗ trống bằng `tableSpot()` copy từ spec cũ (dùng `DECOR_ROOMS[0].floor` + `canPlaceDecoration("table", ...)`); `writeShopSave` với decorations `[{kind:"table",x,y,rotation:0},{kind:"gadget_phone",x,y,rotation:0},{kind:"gadget_tablet",x,y,rotation:0}]`.
  - Steps: 1. `joinAsHost(page, user)` · 2. poll `decorationsOf(page)`.
  - Assert: danh sách có đúng 1 phần tử `kind === "table"` tại `{x, y}`, không có kind `gadget_*`; `finally` xóa `shopFile`/`userFile`.

## Trạng thái hiện tại
- Bước 1 đã làm xong toàn bộ phần code shared và commit (xem git log, commit "task 37 step 1: remove gadget_phone/gadget_tablet, tabletop layer, surface logic from shared"): `shared/src/decor.ts` bỏ `gadget_phone`/`gadget_tablet`, layer `"tabletop"`, field `surface` (trong `table()`, `tv_stand`, `vanity_piano_gold`, `tv_stand_wood`) và các comment liên quan; `shared/src/placement.ts` bỏ `surfaceUnder`, `piecesOnSurface`, nhánh tabletop trong `canPlaceDecoration`, import `normalizeRotation` không còn dùng; `shared/src/customDecor.ts` bỏ `"tabletop"` khỏi `LAYERS`, bỏ parse `surface`, sửa comment "rugs / wall art / gadgets" -> "rugs / wall art". `shared/src/index.ts` dùng `export *` nên không cần đổi. Grep `gadget_phone|gadget_tablet|tabletop|surface` trong `shared/` sạch.
- Checkbox bước 1 KHÔNG tick theo quy tắc (typecheck fail sau 2 lần chạy, xem "Đã thử mà không được"). Lưu ý: code bước 1 đúng và đã commit — bước 2/3 chỉ cần dọn SharedShop.ts/DecorController.ts, không cần làm lại bước 1; typecheck chỉ xanh lại sau khi xong bước 3 (gợi ý: gộp bước 1-3 khi chạy lại, hoặc tick lại bước 1 sau khi bước 3 xanh).
- Bước 2 đã làm xong và commit: `SharedShop.ts` bỏ import `piecesOnSurface`, bỏ `carried`/lỗi "Dọn đồ trên bàn trước khi xoay"/dịch chuyển gadget trong `move()`, bỏ nhánh `def?.surface` trong `sell()`, bỏ `isTabletop` + sắp xếp lại trong `apply()` (giờ lặp thẳng `save.decorations`); `server/portal/index.html` bỏ option layer "Để bàn", ô "Mặt bàn cao (px)" (`surfaceInput`) và phần parse `def.surface`, sửa comment. Grep `tabletop|surface|piecesOnSurface|Để bàn|Mặt bàn` trong 2 file sạch. `npm run typecheck -w server` xanh; `npm run typecheck` (toàn bộ) vẫn đỏ 16 lỗi — tất cả ở `client/src/scenes/DecorController.ts` (bước 3), đúng như plan bước 7 dự kiến.
- Bước 2 tick checkbox dù lỗi typecheck toàn cục còn đỏ, vì lỗi 100% nằm ở file thuộc bước 3 và không thể sửa trong phạm vi bước 2.
- Selectors: `.cd-form`, `select` layers/roles trong `.cd-form` (server/portal/index.html) — bỏ option "Để bàn" và input "Mặt bàn cao".
- Lưu ý: typecheck toàn cục còn đỏ cho tới khi xong bước 3 (DecorController.ts); lỗi không phải do bước 2.
- Bước 3 đã làm xong và commit: `DecorController.ts` bỏ import `piecesOnSurface`/`surfaceUnder`, field `dragFloor`/`draggingCarried`, nhánh `"tabletop"` trong `buildDecorVisual`/`applyDepth`, logic tabletop + carried trong `onDragStart`/`onDrag`/`previewDrag`/`onDragEnd`, `lift` trong `ghostTarget`/`updateGhost`, và xóa hẳn 3 hàm `syncSurfaceView`, `surfaceAtPoint`, `tabletopFloorAt`; `applyDepth` giờ chạy cho mọi piece, kéo thả đồ thường giữ nguyên hành vi. Grep `tabletop|surface|dragFloor|carried` trong file sạch.
- `npm run typecheck` sau bước 3: PASS toàn bộ (server + client, 0 lỗi) — khớp dự kiến plan bước 7.
- Lưu ý: typecheck đã xanh trở lại; theo gợi ý ở "Đã thử mà không được" (bước 1), Tech Lead có thể tick lại checkbox bước 1 (code bước 1 đã commit từ trước, không đổi).
- Bước 4 đã làm xong và commit: `draw_gadget_props.py` bỏ `phone()`/`tablet()`, bỏ khỏi `PROPS` + hàng preview, docstring/Writes còn 3 món (tv_stand_wood, piano_grand, vanity_piano_gold), bỏ palette `BODY` và helper `blend` (chỉ phone/tablet dùng), bỏ các comment "surface height" đã lỗi thời; đã xóa `client/public/assets/decor/gadgets/phone.png` và `tablet.png`. Grep `phone|tablet|tabletop|surface|BODY|blend` trong script sạch; refs còn lại chỉ ở file task/cũ.
- `npm run typecheck` sau bước 4: PASS toàn bộ.
- Bước 5 đã làm xong và commit: `README.md` xóa bullet "Phones and iPads go on a table top" (3 dòng) và bỏ "tabletop"/"table surface" khỏi mô tả portal; `AGENTS.md` xóa quy ước "Tabletop gadgets", bỏ "tabletop gadgets" khỏi ngoại lệ build-mode, sửa Codebase Map `draw_gadget_props.py` thành "head-on TV stand/piano sprites". Grep `tabletop|table top|table surface|iPad|tablet|Tabletop` trong 2 file sạch.
- `npm run typecheck` sau bước 5: PASS toàn bộ. Docs checked: README/AGENTS đã cập nhật, không còn đoạn lỗi thời liên quan.
- Bước 6 đã làm xong và commit: xóa `tests/gadgets-tabletop.spec.ts` (3 test tabletop cũ); tạo `tests/decor-no-tabletop.spec.ts` với T1 (catalog: `gadget_phone`/`gadget_tablet` trả `undefined`, không def nào `layer === "tabletop"` hay có field `surface`, `tv_stand_wood`/`piano_grand` vẫn còn) và T2 (save cũ có `table` + `gadget_phone` + `gadget_tablet`: load còn đúng 1 phần tử `table` tại `{x,y}`, không còn `gadget_*`, dọn `shopFile`/`userFile` trong `finally`).
- `npm run typecheck` sau bước 6: PASS toàn bộ. `npx playwright test tests/decor-no-tabletop.spec.ts`: 2/2 PASS. `npx playwright test` (toàn bộ): 84/84 PASS, 0 fail, 0 flaky.
- Lưu ý: spec mới chạy T1 không cần server và T2 dùng 1 phiên (đúng Test cases); bộ test đầy đủ cũng đã chạy xanh.
- Bước 7 đã làm xong và commit: các bước 2→6 đã hoàn tất từ trước (không làm lại, không revert bước 1); `npm run typecheck` lần cuối sau bước 6 — PASS toàn bộ (server + client, 0 lỗi). Grep `gadget_phone|gadget_tablet|tabletop` chỉ còn trong chính spec mới (assert/comment) và 1 file save test cũ trong `server/data/`; không còn trong code `shared/ client/ server/`. Field `surface` chỉ còn trong assert của spec mới (kiểm tra phải vắng mặt).
- Lưu ý: `server/data/shops/u_9a27b0d07177346edb72ad2af5193d27.json` là dữ liệu test cũ (chứa `gadget_tablet`) còn sót, không phải code; nếu muốn dữ liệu sạch hoàn toàn có thể xóa file này.

## Test status
- Bước 7: `npm run typecheck` (lần cuối sau bước 6) — PASS toàn bộ (server + client, 0 lỗi). Bước 7 không có lệnh test cụ thể nên không chạy playwright.
- Bước 6: `npm run typecheck` — PASS toàn bộ. `npx playwright test tests/decor-no-tabletop.spec.ts` — 2/2 PASS (T1, T2). `npx playwright test` — 84/84 PASS, 0 fail, 0 flaky.
- Bước 5: `npm run typecheck` — PASS toàn bộ. Bước 5 không có lệnh test cụ thể nên không chạy playwright.
- Bước 4: `npm run typecheck` — PASS toàn bộ. Bước 4 không có lệnh test cụ thể nên không chạy playwright.
- Bước 3: `npm run typecheck` — PASS toàn bộ (server + client, 0 lỗi). Bước 3 không có lệnh test cụ thể (T1/T2 thuộc bước 6) nên không chạy playwright.
- Bước 2: `npm run typecheck` — server PASS, client FAIL 16 lỗi (tất cả `client/src/scenes/DecorController.ts`, thuộc bước 3). Bước 2 không có lệnh test cụ thể nên không chạy playwright (T1/T2 thuộc bước 6).
- Lần chạy cũ của bước 1: `npm run typecheck` (chạy 2 lần) — FAIL.
  - Server (lần 1+2, 4 lỗi, tất cả tại `server/src/shop/SharedShop.ts` — nội dung bước 2 sẽ dọn): (19) import `piecesOnSurface`; (206, 236) `def.surface`; (549) so sánh `"tabletop"`.
  - Client (chạy riêng `npm run typecheck -w client` vì script gốc `&&` dừng ở server, 16 lỗi, tất cả tại `client/src/scenes/DecorController.ts` — nội dung bước 3 sẽ dọn): (16, 19) import `piecesOnSurface`/`surfaceUnder`; (100, 388, 392, 411, 428, 452, 560, 603) so sánh `"tabletop"`; (396, 618, 636, 639) `def.surface`; (401, 402) implicit any (hệ quả của các lỗi trên).
  - Không có lỗi nào trong `shared/` — phần việc bước 1 không có lỗi typecheck.
- Bước 1 không ghi lệnh test cụ thể nên không chạy playwright test (T1/T2 thuộc bước 6).
- Kết quả từng test:
  - T1: PASS (`tests/decor-no-tabletop.spec.ts`)
  - T2: PASS (`tests/decor-no-tabletop.spec.ts`)
- Fail chi tiết: xem "Đã thử mà không được".

## Verify
- typecheck: PASS. T1: PASS, T2: PASS (chạy lại). Bộ e2e đầy đủ 84/84 PASS (OpenCode). Grep code sạch tabletop/phone/tablet.
- Ảnh: bỏ qua (thay đổi chỉ là xóa món khỏi catalog, đã kiểm bằng spec).

VERIFY: PASS

## Đã thử mà không được
- Bước 1 — `npm run typecheck` fail sau khi xóa shared (đã chạy 2 lần, lần 2 kèm `npm run typecheck -w client` riêng):
  - Nguyên nhân: plan chia bước tạo phụ thuộc chéo không thể có typecheck xanh ở giữa. `@boba/shared` resolve trực tiếp `shared/src/index.ts` (xem `shared/package.json`), nên việc bước 1 xóa `piecesOnSurface`/`surfaceUnder`/field `surface`/layer `"tabletop"` tất yếu làm `server/src/shop/SharedShop.ts` (dọn ở bước 2) và `client/src/scenes/DecorController.ts` (dọn ở bước 3) fail typecheck ngay, trước khi các bước đó được chạy.
  - Cách đã thử: chạy typecheck 2 lần — cả 2 lần lỗi giống hệt nhau và 100% nằm ở `SharedShop.ts` (4 lỗi) / `DecorController.ts` (16 lỗi), không lỗi nào trong `shared/`. Không có lần sửa khả thi nào trong phạm vi bước 1: mọi lỗi nằm ở file thuộc bước 2/3, bị cấm sửa theo chỉ thị "làm LẦN LƯỢT các bước 1, không làm bước nào khác"; cách duy nhất khác là revert bước 1 hoặc chạy trước bước 2/3 — đều sai với chỉ thị.
  - Gợi ý cho Tech Lead: code bước 1 đã commit và đúng theo plan; chạy tiếp bước 2 rồi bước 3 là typecheck sẽ xanh (lỗi khớp đúng những gì ngữ cảnh bước 2/3 đã liệt kê: import, def.surface, so sánh "tabletop", carried/syncSurfaceView). Sau đó có thể tick lại checkbox bước 1.

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
