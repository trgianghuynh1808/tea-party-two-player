# Task: Đồ đặt lên mặt bàn (điện thoại, iPad) + TV, piano, bàn trang điểm

Verify mode: full

## Mục tiêu
- Thêm 5 món: `gadget_phone` "Điện thoại", `gadget_tablet` "iPad" (đồ ĐẶT LÊN mặt bàn), `tv_stand` "Kệ TV", `piano_grand` "Piano cơ", `vanity_piano` "Bàn trang điểm piano" (đồ đứng sàn). Ảnh gốc đều bị nghiêng (isometric) trong `client/assets-src/sheets/gadgets-ref/` → vẽ lại NHÌN THẲNG bằng code (điện thoại, iPad nhìn từ trên xuống; TV, piano, bàn trang điểm nhìn mặt trước).
- Cơ chế mới: layer `"tabletop"`. Đồ tabletop chỉ đặt được khi toàn bộ footprint nằm trong mặt trên của một món "mặt bàn" (mọi món `role: "table"` + `tv_stand` + `vanity_piano`); hiển thị nâng lên đúng độ cao mặt bàn, vẽ phía trên cái bàn.
- Di chuyển bàn thì đồ trên bàn đi theo; bán bàn thì bán luôn đồ trên bàn (hoàn 50% cả hai); từ chối xoay bàn khi còn đồ trên nó.
- Lưu/khôi phục shop: bàn được đặt trước, đồ tabletop sau; đồ tabletop không còn bàn thì bị bỏ.
- Docs ghi cơ chế mới và ngoại lệ với quy tắc Xây ↔ Trang trí tương đồng.
- Dừng trước Ship để người dùng xem ảnh preview (Claude làm).

## Quyết định đã chốt
- Art: vẽ lại nhìn thẳng bằng code, dùng `.venv-art/bin/python`. Ảnh gốc chỉ để tham khảo màu/hình.
- "Mặt bàn" = mọi món `role: "table"` hiện có + `tv_stand` + `vanity_piano`. Piano cơ và các bàn phòng tắm (`bath_bench_*`) KHÔNG phải mặt bàn.
- Đồ đi theo bàn, bán cùng. Xoay bàn đang có đồ: từ chối với thông báo "Dọn đồ trên bàn trước khi xoay".
- Liên kết đồ ↔ bàn suy ra từ hình học (vị trí đồ nằm trong footprint của bàn), KHÔNG thêm trường schema mới.
- Mọi món mới `rotation: "none"`. Đồ tabletop KHÔNG có trong chế độ Xây ngoài sân (như thảm và tranh tường: `BUILD_TILES` chỉ lấy `layer === "object"`, giữ nguyên); `tv_stand`, `piano_grand`, `vanity_piano` là layer `"object"` nên tự có trong Xây (giống Trang trí, đúng quy tắc tương đồng).
- Không đổi luồng Xây.

## Ngữ cảnh
- `shared/src/decor.ts`:
  - `DecorationLayer = "floor" | "object" | "wall"` → thêm `"tabletop"`.
  - `DecorationDef { kind, label, price, color, shape, width, height /*footprint*/, layer, image?, imageHeight?, rotation?, views?, role?: "seat"|"table"|"bed", effect?, category? ... }` → thêm `surface?: { height: number }` (độ cao mặt bàn so với sàn, px hiển thị).
  - Helper `decor(kind, label, price, image, width, height, imageHeight, color, rotation)` (ảnh `assets/decor/${image}.png`, layer "object", rotation mặc định "none"); `viewsDecor(...)`; `wallArt(...)`; nhóm bọc `...inCategory("...", [ ... ])`. Bàn: `{ ...decor("table", "Bàn khách", 90, "wicker_table", 44, 26, 48, 0x8d6e63), role: "table" }`, `{ ...viewsDecor("dining_table", "Bàn ăn trái cây", 110, 70, 40, 60), role: "table" }`. Mặc định độ cao mặt bàn = `round(imageHeight * 0.6)` cho các bàn hiện có (tự đặt `surface` bằng helper, đừng tự đoán từng cái).
  - `DECORATION_CATEGORIES` (as const): thêm `{ id: "gadgets", title: "📱 Đồ công nghệ" }` ở cuối. `gadget_phone`, `gadget_tablet`, `tv_stand` vào nhóm `gadgets`; `piano_grand`, `vanity_piano` vào nhóm `bedroom` ("🛏️ Nội thất").
  - `footprintOf(def, rotation)`, `snapToGrid(v)` (lưới `DECOR_GRID = 10`), `refundFor(def)` (50%), `interface PlacedDecoration { id, kind, x, y, rotation? }`.
- `shared/src/placement.ts`: `canPlaceDecoration(kind, x, y, others, ignoreId?, rotation = 0)` — hiện: lấy `place = decorRoomAt({x,y})`, `rectOf(x,y,w,h)`, `area = def.layer === "wall" ? place.wall : place.floor`; kiểm station chỉ cho `layer === "object"`; vòng `others` bỏ qua cặp khác layer (`od.layer !== def.layer`). Thêm: layer `"tabletop"` → footprint phải nằm trọn trong footprint của MỘT món có `surface` trong `others` (tính bằng `footprintOf` của bàn + `rectOf`), không chồng đồ tabletop khác; không kiểm station; export các hàm `surfaceUnder(kind, x, y, others, rotation?) → PlacedDecoration | undefined` và `piecesOnSurface(table, others) → PlacedDecoration[]` (đồ tabletop có tâm nằm trong footprint bàn) để server và client dùng chung.
- `server/src/shop/SharedShop.ts`: `buy(kind, x, y, rotation)` (kiểm `canPlaceDecoration(..., this.pieces, undefined, rot)`, `this.place(...)`, emit `added`), `move(id, x, y, rotation)` (kiểm `canPlaceDecoration(piece.kind, px, py, this.pieces, piece.id, rot)`, sửa piece, emit `moved`), `sell(id)` (splice, `this.money += refundFor(def)`, emit `removed` + `money`), khôi phục từ save quanh dòng ~490 (vòng nudge `RESTORE_NUDGE_STEPS` + `canPlaceDecoration`, đếm món bị bỏ). `this.pieces: PlacedDecoration-like[]`.
- `server/src/rooms/BobaShopRoom.ts`: `handleBuyDecoration/handleMoveDecoration/handleSellDecoration` gọi `this.hostShop.buy/move/sell` qua `decorateBlockedReason(client)` (chỉ host, không đang trong ca; KHÔNG kiểm khu vực nên test gửi được từ sân).
- `client/src/scenes/DecorController.ts`: `add(state)` tạo view, `applyDepth(view)`, `syncPosition(id)`, `syncRotation(id)`, `select/rotate/onDragStart/onDrag/onDragEnd/previewDrag`, `startPaletteDrag(event)` + `ghostTarget/updateGhost/showFootprint` (kéo món mới từ panel), `placed()` (danh sách đang đặt cho `canPlaceDecoration`), `isOverSellZone`. Cần: tabletop hiển thị cao hơn `surface.height` của bàn đỡ (`surfaceUnder`), depth ngay trên bàn; khi kéo bàn thì đồ trên bàn di chuyển theo (chỉ hiển thị, server sẽ gửi `moved` cho từng đồ); kéo đồ tabletop từ panel hoặc trong shop: con trỏ trỏ vào mặt bàn ĐÃ VẼ (đã nâng lên `surface.height`), nên khi tìm vị trí phải cộng lại `surface.height` của bàn dưới con trỏ để ra toạ độ sàn trước khi gọi `canPlaceDecoration`.
- `client/src/ui/DecorPanel.ts`: `addItem(list, def, onDragStart)` dựng thẻ từ `DECORATION_CATALOG` theo `DECORATION_CATEGORIES`; thêm câu hướng dẫn "Điện thoại, iPad đặt lên mặt bàn, kệ TV, bàn trang điểm" vào chuỗi `help`.
- `shared/src/world.ts`: `BUILD_TILES` có `...DECORATION_CATALOG.filter((d) => d.layer === "object").map(decorProp)` → giữ nguyên (đồ tabletop không vào Xây).
- Art mẫu: `client/assets-src/tools/draw_bathroom_props.py` (pngio, palette 3-4 tông, viền sel-out, quy ước kích thước PNG ≈ 2× kích thước hiển thị + lề, ghi preview `bathroom-preview.png`). Ảnh tham khảo (nền trắng, nghiêng): `client/assets-src/sheets/gadgets-ref/piano-vanity.png` (bàn trang điểm piano: khung vàng gương oval, mặt kem có phím đàn, chân vàng · piano cơ nâu gụ viền vàng, nắp mở), `tv-stand.png` (TV màn đen chân bạc trên kệ thấp vân gỗ nhạt có ngăn), `phone.png` (điện thoại xám đen, màn xanh có đồng hồ), `tablet.png` (iPad viền xám, màn xanh-hồng, bút cảm ứng bạc).
- Kích thước hiển thị mục tiêu (footprint width×height /imageHeight): `gadget_phone` 10×16 (vẽ phẳng từ trên xuống, imageHeight 16) · `gadget_tablet` 18×14 (imageHeight 14) · `tv_stand` 70×22 /56, `surface.height` 12 · `piano_grand` 64×44 /56 · `vanity_piano` 44×24 /70, `surface.height` 22. Giá: phone 40, tablet 70, tv_stand 150, piano_grand 380, vanity_piano 260.
- Ảnh xuất ra: `client/public/assets/decor/gadgets/<kind-không-tiền-tố>.png` = `phone.png`, `tablet.png`, `tv_stand.png`, `piano_grand.png`, `vanity_piano.png` (ảnh catalog `gadgets/phone` ...).

## Plan
- [x] 1. [vừa] `client/assets-src/tools/draw_gadget_props.py` → vẽ 5 sprite nhìn thẳng theo Ngữ cảnh (theo mẫu `draw_bathroom_props.py`, tham khảo màu từ ảnh trong `client/assets-src/sheets/gadgets-ref/`), ghi vào `client/public/assets/decor/gadgets/` và preview `client/assets-src/sheets/gadgets-preview.png` (5 món trên nền xám trung tính, x3, có nhãn). Chạy: `.venv-art/bin/python client/assets-src/tools/draw_gadget_props.py`, xem preview và từng PNG bằng Read, chỉnh tới khi gọn, đúng tỉ lệ và đúng tông ảnh gốc.
- [x] 2. [khó] `shared/src/decor.ts` + `shared/src/placement.ts` → thêm layer `"tabletop"`, `surface?: { height }` vào `DecorationDef`, đánh dấu `surface` cho mọi món `role: "table"` (độ cao = `round(imageHeight * 0.6)`) và cho `tv_stand`, `vanity_piano`; thêm danh mục `gadgets` và 5 món mới (kind, nhãn, giá, kích thước theo Ngữ cảnh; width/imageHeight/độ rộng thật lấy từ PNG đã xuất ở bước 1, không đoán); mở rộng `canPlaceDecoration` cho tabletop và export `surfaceUnder`, `piecesOnSurface`. Chạy `npm run typecheck`.
- [x] 3. [khó] `server/src/shop/SharedShop.ts` → `move`: nếu piece là bàn có đồ trên nó (`piecesOnSurface`) thì từ chối khi đổi `rotation` ("Dọn đồ trên bàn trước khi xoay"), còn lại dời tất cả đồ trên bàn cùng độ lệch (dx, dy) và emit `moved` cho từng cái; `sell`: bán luôn đồ trên bàn (cộng `refundFor` từng món, emit `removed` từng cái, một lần `money`); khôi phục từ save: xử lý bàn trước, đồ tabletop sau, đồ không có bàn đỡ thì bỏ (tính vào số món bị bỏ). `server/src/rooms/BobaShopRoom.ts` → chỉ sửa nếu cần. Chạy `npm run typecheck`.
- [x] 4. [khó] `client/src/scenes/DecorController.ts` + `client/src/ui/DecorPanel.ts` → hiển thị đồ tabletop nâng lên `surface.height` của bàn đỡ và vẽ ngay phía trên bàn (cập nhật khi bàn di chuyển/bị bán); kéo bàn thì đồ trên bàn đi theo trong lúc kéo; kéo mới đồ tabletop từ panel hoặc kéo lại trong shop: tìm bàn dưới con trỏ theo hình đã vẽ (cộng lại `surface.height`) rồi dùng `canPlaceDecoration` cho preview xanh/đỏ; thêm câu hướng dẫn vào `help` ở `DecorPanel`. Chạy `npm run typecheck`.
- [x] 5. [vừa] `tests/gadgets-tabletop.spec.ts` → viết 3 test T1-T3 theo mô tả trong Test cases (T3 tham khảo cách ghi file save JSON trong `tests/build-parity.spec.ts` T1, tái dùng hàm đó, export sang `tests/helpers.ts` nếu cần). Chạy: `npx playwright test tests/gadgets-tabletop.spec.ts`, rồi `npm run typecheck`.
- [x] 6. [dễ] `AGENTS.md` → Code Conventions: ghi ngoại lệ của quy tắc Xây ↔ Trang trí tương đồng (đồ không hợp với lưới một ô như thảm, tranh tường, đồ tabletop không có trong Xây) và nhắc cơ chế đồ đặt lên bàn (đồ đi theo bàn, bán cùng); Codebase Map nhắc `draw_gadget_props.py`. `README.md` → mục Decorating & saving: mô tả đặt đồ lên mặt bàn, đi theo bàn, bán cùng, không xoay bàn khi còn đồ. Ghi "Docs checked" vào Trạng thái hiện tại.
- [x] 7. [vừa] Fix: `client/assets-src/tools/draw_gadget_props.py` → đổi tên đầu ra để không đè kind/ảnh đã có: `tv_stand` → `tv_stand_wood`, `vanity_piano` → `vanity_piano_gold` (tên hàm, danh sách xuất, nhãn preview, docstring). Đổi tên file PNG bằng `git mv`: `client/public/assets/decor/gadgets/tv_stand.png` → `tv_stand_wood.png`, `vanity_piano.png` → `vanity_piano_gold.png`; chạy lại `.venv-art/bin/python client/assets-src/tools/draw_gadget_props.py` để preview đúng nhãn. KHÔNG đụng `client/public/assets/decor/views/tv_stand_*.png` (kệ tivi 4 góc nhìn có sẵn, do `build_furniture_views.py` tạo).
- [x] 8. [khó] Fix: `shared/src/decor.ts` → khôi phục dòng gốc `viewsDecor("tv_stand", "Kệ tivi", 140, 64, 22, 74)` (kệ tivi 4 góc nhìn có sẵn, xoá bản `tv_stand` mới) và thêm `surface: { height: 12 }` cho nó; đổi món mới thành kind `tv_stand_wood` (nhãn "Kệ TV vân gỗ", ảnh `gadgets/tv_stand_wood`, giá 150, surface 12) và `vanity_piano_gold` (nhãn "Bàn trang điểm piano vàng", ảnh `gadgets/vanity_piano_gold`, giá 260, surface 22); sửa comment cho đúng. Lưu ý `vanity_piano` là kind ĐÃ BỊ XOÁ trước đây (nằm trong `REMOVED_ITEMS` của tests/decor-catalog.spec.ts): không được dùng lại. Chạy: `npm run typecheck` rồi `npx playwright test tests/decor-catalog.spec.ts` (phải xanh hoàn toàn, gồm test T2 và furniture-views T1).
- [x] 9. [vừa] Fix: `tests/gadgets-tabletop.spec.ts` → cập nhật theo kind mới (`tv_stand_wood`, `vanity_piano_gold` nếu test có nhắc); thêm trong T1 một assert: `getDecorationDef("tv_stand")` vẫn là `rotation === "views"` và có `surface` (đồ đặt lên kệ tivi 4 góc nhìn có sẵn). Chạy: `npx playwright test tests/gadgets-tabletop.spec.ts tests/decor-catalog.spec.ts`, rồi `npm run typecheck`.
- [x] 10. [dễ] Fix: `README.md` và `AGENTS.md` → sửa mọi chỗ nhắc `tv_stand`/`vanity_piano`/`Kệ TV` thành đúng kind và nhãn mới; ghi "Docs checked".

## Test cases
- [x] T1. Luật đặt tabletop — `canPlaceDecoration` chỉ cho đặt đồ tabletop khi nằm trọn trong bàn, không chồng nhau, không cản đồ đứng sàn — tests/gadgets-tabletop.spec.ts
  - Setup: test thuần Node (không trình duyệt, không server), `import { canPlaceDecoration } from "@boba/shared"`; bàn dựng tay `table = { id: "t1", kind: "table", x: 400, y: 400, rotation: 0 }` (footprint `table` = 44×26: x 378..422, y 387..413).
  - Steps: gọi `canPlaceDecoration` lần lượt: (a) `("gadget_phone", 400, 400, [table])`; (b) `("gadget_phone", 460, 400, [table])`; (c) `("gadget_phone", 400, 400, [])`; (d) với `p1 = { id: "p1", kind: "gadget_phone", x: 400, y: 400, rotation: 0 }`: `("gadget_phone", 400, 400, [table, p1])`; (e) `("gadget_phone", 410, 400, [table, p1])`; (f) `("table", 400, 400, [p1], "t1")` không cần bàn khác.
  - Assert: (a) true; (b) false (ngoài mặt bàn); (c) false (không có bàn); (d) false (chồng p1); (e) true (phone 10×16: x 405..415 không chồng p1 x 395..405, và nằm trong bàn); (f) true (đồ đứng sàn bỏ qua đồ tabletop).
- [x] T2. Bàn kéo theo đồ, bán cùng — host mua bàn + điện thoại, dời bàn thì điện thoại đi theo, bán bàn thì bán luôn điện thoại và hoàn đúng tiền — tests/gadgets-tabletop.spec.ts
  - Setup: 1 phiên host: `joinAsHost(page, uniqueUsername)`; cấp tiền bằng admin API `PATCH http://localhost:2567/admin/users/<name>/money` với header `Authorization: Bearer test-admin-token`, body `{ set: 2000 }` (xem `tests/build-parity.spec.ts` T2 cách gọi); server KHÔNG kiểm khu vực nên gửi được từ sân. Chọn ô trống: quét lưới 10px trong `DECOR_ROOMS[0].floor` (import từ `@boba/shared`) tìm (X, Y) mà `canPlaceDecoration("table", X, Y, [])` và `canPlaceDecoration("table", X + 60, Y, [])` cùng true.
  - Steps: (1) `window.__GAME__.send("buy_decoration", { kind: "table", x: X, y: Y, rotation: 0 })`, đợi `__GAME__.state.decorations.length === 1` (dùng `expect.poll`); (2) gửi `buy_decoration` `{ kind: "gadget_phone", x: X, y: Y, rotation: 0 }`, đợi length 2; (3) lấy `id` của bàn (`decorations` phần tử có `kind === "table"`), gửi `move_decoration` `{ id, x: X + 60, y: Y }`; (4) gửi `sell_decoration` `{ id }`.
  - Assert: sau (3) bàn có `x === X + 60` VÀ điện thoại có `x === X + 60` (cùng `y === Y`); sau (4) `decorations.length === 0`; ví người chơi (`state.players.get(room.sessionId).money`) = `2000 - table.price - phone.price + refundFor(table) + refundFor(phone)` (`getDecorationDef`, `refundFor` từ `@boba/shared`).
- [x] T3. Khôi phục từ save — bàn + đồ trên bàn được tải lại đủ, đồ tabletop mồ côi (không có bàn) bị bỏ — tests/gadgets-tabletop.spec.ts
  - Setup: tái dùng hàm ghi file save JSON của `tests/build-parity.spec.ts` T1 (đúng format `flush`: `decorations: [{ kind, x, y, rotation }]`, `money`, `tiles`); hai username duy nhất A và B. Save A: `[table (X,Y), gadget_phone (X,Y)]` (cùng ô trống chọn như T2). Save B: chỉ `[gadget_phone (X,Y)]`.
  - Steps: với từng username ghi save rồi `joinAsHost(page, username)`; đợi `__GAME__.state.decorations` ổn định (poll tới khi không đổi độ dài).
  - Assert: A có đúng 2 món (một `table`, một `gadget_phone` cùng x, y); B có 0 món (điện thoại mồ côi bị bỏ).

## Trạng thái hiện tại
- Bước 1–10 xong. **Bước 10**: grep `README.md`/`AGENTS.md` không còn chỗ nào nhắc literal `tv_stand`/`vanity_piano`/`Kệ TV`; docs đã dùng mô tả chung ("TV stand", "piano vanity", "Kệ tivi" cho món 4 góc nhìn) đúng với kind/nhãn mới (`tv_stand_wood` "Kệ TV vân gỗ", `vanity_piano_gold` "Bàn trang điểm piano vàng"). Docs checked: no change needed.
- **Bước 9**: `tests/gadgets-tabletop.spec.ts` không nhắc `tv_stand_wood`/`vanity_piano_gold` nên chỉ thêm assert cuối T1: `getDecorationDef("tv_stand")` giữ `rotation === "views"` và có `surface`. Docs checked: chưa cần sửa thêm ở bước này (bước 10 lo docs); ngoại lệ Xây ↔ Trang trí và cơ chế đồ tabletop đã ghi ở bước 6.
- **Bước 8** (`shared/src/decor.ts`): khôi phục `viewsDecor("tv_stand", "Kệ tivi", 140, 64, 22, 74)` về đúng vị trí gốc trong nhóm bedroom (kèm `surface: { height: 12 }`); món mới trong nhóm gadgets đổi kind thành `tv_stand_wood` "Kệ TV vân gỗ" (ảnh `gadgets/tv_stand_wood`, 150, surface 12); món bedroom đổi thành `vanity_piano_gold` "Bàn trang điểm piano vàng" (ảnh `gadgets/vanity_piano_gold`, 260, surface 22) — kind `vanity_piano` đã bị xoá trước đây nên không dùng lại; comment nhóm gadgets sửa cho đúng (tv_stand_wood ≠ tv_stand 4 góc nhìn). 2 FAIL của Verify vòng 1 (decor-catalog T2 + furniture-views T1) đã hết: `npx playwright test tests/decor-catalog.spec.ts` 9/9 PASS. Còn việc bước 10 (docs).
- **Bước 6** (docs): README thêm mục đặt điện thoại/iPad lên mặt bàn, đi theo bàn, bán cùng, không xoay bàn khi còn đồ; AGENTS ghi ngoại lệ thảm/tranh tường/đồ tabletop không có trong Xây và liên kết hình học `surfaceUnder`/`piecesOnSurface`.
- **Bước 5** (`tests/gadgets-tabletop.spec.ts` + `tests/helpers.ts`): viết 3 test T1-T3. Hàm ghi save JSON (`writeShopSave`) và đường dẫn shop/user (`shopFile`, `userFile`, `shopIdOf`) chuyển sang `tests/helpers.ts` để tái dùng; `build-parity.spec.ts` giữ bản riêng (không nằm trong plan nên không sửa). T1 thuần Node; T2 dùng admin API cấp tiền + mua/dời/bán qua room; T3 ghi save cho 2 username rồi join.
- **Bước 4** (`client/src/scenes/DecorController.ts` + `client/src/ui/DecorPanel.ts`):
  - `buildDecorVisual`: tabletop vẽ phẳng phủ footprint như thảm/tranh (không đứng như đồ object).
  - `syncSurfaceView(view)`: đồ tabletop render tại `(state.x, state.y - surface.height của bàn đỡ)` qua `surfaceUnder`, depth = `y bàn + 1` (ngay trên bàn); khi bàn ĐANG bị kéo thì preview theo delta kéo, depth `UI_DEPTH - 0.5` (ngay trên bàn đang kéo ở `UI_DEPTH - 1`). `applyDepth` delegate cho tabletop.
  - Kéo bàn: `draggingCarried` = `piecesOnSurface`; `onDrag` gọi `syncSurfaceView` cho từng đồ → đi theo trong lúc kéo; thả ok thì giữ vị trí dự đoán + resync an toàn sau `RESYNC_MS` cho cả đồ trên bàn; thả hỏng/bán thì snap về state cho cả bàn lẫn đồ.
  - Kéo đồ tabletop (trong shop): `tabletopFloorAt` — tìm bàn dưới con trỏ (`surfaceAtPoint`, point-in-footprint) rồi cộng lại `surface.height` ra toạ độ sàn trước khi `canPlaceDecoration`; container vẽ tại toạ độ đã nâng để dính con trỏ; `previewDrag`/`onDragEnd` dùng toạ độ sàn (`dragFloor`).
  - Kéo mới từ panel: `ghostTarget` tính lift như trên, ghost vẽ tại `(x, y - lift)`, gửi `BuyDecoration` với toạ độ sàn.
  - Xoay bàn có đồ: client vẫn cho xoay preview nhưng server từ chối qua `InteractFailed` → toast "Dọn đồ trên bàn trước khi xoay" + `RESYNC` snap về (đúng luồng hiện có).
  - `DecorPanel.help` thêm: "Điện thoại, iPad đặt lên mặt bàn, kệ TV, bàn trang điểm."
  - Không cần sửa `ShopScene`/`BobaShopRoom` (mirror `onShopEvent` đã generic theo id; `InteractFailed` đã có toast).
- Bước 2-3: xem mô tả ở commit trước (đầy đủ trong lịch sử file task). **Lưu ý tv_stand** vẫn còn hiệu lực: `tests/decor-catalog.spec.ts` "furniture-views T1" sẽ FAIL khi chạy lại, cần cập nhật ở bước 5/Verify.

## Test status
- Lần chạy cuối (bước 10): `npm run typecheck` PASS (server + client). Bước chỉ sửa docs nên không chạy lại spec.
- Lần chạy spec gần nhất (bước 9): `npx playwright test tests/gadgets-tabletop.spec.ts tests/decor-catalog.spec.ts` PASS 12/12 (~8.0s) — gadgets T1 (gồm assert mới `tv_stand` giữ `rotation === "views"` + `surface`), T2, T3; decor-catalog 9/9.
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
- Fail chi tiết: không có. Hai FAIL của Verify vòng 1 (decor-catalog T2 + furniture-views T1) đã được bước 8 xử lý xong.

## Verify
- Vòng 1: Claude chạy cả bộ e2e → 37 passed, 2 FAIL (kind `tv_stand` và `vanity_piano` đè/dùng lại kind đã có). Sửa ở bước 7-10.
- Vòng 2: toàn bộ e2e 39/39 PASS, `npm run typecheck` PASS; `tv_stand` kệ tivi 4 góc nhìn cũ còn nguyên và có thêm `surface`.
- T1/T2/T3 (tests/gadgets-tabletop.spec.ts): PASS.
- Trình duyệt thật (1 phiên host, vào tiệm bằng `use_door`): mua bàn khách + bàn ăn + điện thoại + iPad → điện thoại nằm trên bàn khách, iPad nằm trên bàn ăn (`.agents/screens/gadgets-1-placed.png`); dời bàn khách → điện thoại đi theo cùng (60,210)→(100,240); xoay bàn ăn khi còn iPad → bị từ chối (vẫn r0); bán bàn khách → điện thoại bán luôn (`gadgets-2-moved.png`, `gadgets-3-sold.png`).
- Art: `client/assets-src/sheets/gadgets-preview.png`. Chờ người dùng duyệt art trước khi ship.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
