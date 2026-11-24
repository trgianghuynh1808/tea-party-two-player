# Task: Xây tương đồng Trang trí (chọn, di chuyển, xoay, bán, bỏ chọn)

Verify mode: full

## Mục tiêu
- Chế độ Xây dùng cùng mô hình thao tác với Trang trí cho các vật đặt một ô (cây, đồ ngoài trời, nội thất): chọn, kéo di chuyển, xoay (phím R và nút ⟳), bán (kéo vào 🗑 / phím Delete), bỏ chọn (bấm ô trống / Esc).
- Mở panel Xây không chọn sẵn công cụ nào; bấm lại công cụ đang chọn thì bỏ chọn; chỉ hiện hover preview khi có công cụ. (Lỗi cũ: mở vào là bị kẹt ở floor_wood, rất khó tương tác.)
- Vật đặt ô lưu và hiển thị đúng hướng xoay (cả sau khi lưu/tải lại shop, và ở người chơi thứ 2).
- Badge ⟳ trên thẻ món xoay được trong panel Xây, giống panel Trang trí (dùng chung một helper).
- Docs: ghi quy tắc "Xây và Trang trí phải tương đồng" vào AGENTS.md và README.md.

## Quyết định đã chốt
- Chỉ vật `shape: "prop"` có chọn/di chuyển/xoay/bán. Sàn, tường, hàng rào, cửa giữ kiểu kéo vẽ + công cụ Tẩy.
- Chỉ host được di chuyển/xoay/bán. Khách vẫn chỉ đặt mới trên ô trống (như `planCellChange(..., onlyEmpty)`).
- Hướng xoay lưu trong map riêng `tileRotations` (khoá = khoá ô, giá trị = chỉ số 0..n-1); `tiles` giữ nguyên để code cũ đọc không đổi. Save cũ không có trường này vẫn tải được (mặc định 0).
- Số hướng: món nội thất (`def.decor`) theo `rotationCount(getDecorationDef(def.decor))`; đồ ngoài trời (cây, ghế băng...) có 2 hướng (lật ngang).
- Bán một vật hoàn `BUILD_REFUND_RATE` (50%) vào ví host. Di chuyển miễn phí.
- Không đổi luồng Trang trí, trừ việc tách helper dùng chung.

## Ngữ cảnh
- `shared/src/world.ts`:
  - `BuildTileDef { kind, label, price, shape: "floor"|"wall"|"fence"|"door"|"prop", color, accent, image?, group?: "tree"|"outdoor"|"decor", decor?: string, category?, block?: {w,h} }`.
  - `decorProp(d)` tạo tile kind `decor_<kind>` (`decorPropKind`); `BUILD_TILES`, `getBuildTile(kind)`, `ERASE_TOOL = "erase"`, `BUILD_REFUND_RATE`, `buildRefund(def)`.
  - `cellsForTool(tool,x0,y0,x1,y1)`, `planCellChange(tiles, tool, cx, cy, onlyEmpty) → {key, kind, old?}`, `canBuildCell`, `tileKey(cx, cy, layerOf(def))`, `cellRect`, `cellAt`, `propAnchor(cx, cy)`.
- `shared/src/decor.ts`: `rotationCount(def)`, `normalizeRotation(def, r)`, `footprintOf`, `getDecorationDef`, `DecorationRotation = "none"|"flip"|"rotate"|"views"`; `views` = artwork per facing (front,left,back,right) = rotation 0..3.
- `shared/src/index.ts`: `Messages` (có `BuildTiles: "build_tiles"`, `MoveDecoration`, `SellDecoration`...), `interface BuildTilesMessage { tool, x0, y0, x1, y1 }`.
- `shared/src/schema.ts`: `@type({ map: "string" }) tiles = new MapSchema<string>()` trong `BobaShopState`.
- `server/src/shop/SharedShop.ts`: `build(tool,x0,y0,x1,y1,blocked,payer)` dòng ~277 (tính cost bằng `getBuildTile` + `buildRefund`, ghi `this.tiles`, `emit({type:"tiles", changes})`, `scheduleSave()`); `snapshot(): ShopSave { version, money, decorations, tiles: Object.fromEntries(this.tiles) }`; `replace(save)`; các event `emit`.
- `server/src/rooms/BobaShopRoom.ts`: handlers trong `messages` (`build_tiles: (client, payload) => this.handleBuildTiles(client, payload)` ~dòng 185); `handleBuildTiles` ~dòng 837 gọi `this.hostShop.build(..., blocked, payer)`; host-check qua player.host. Làm tương tự cho `move_tile` / `sell_tile`, đồng bộ `state.tileRotations` từ event của `SharedShop` như cách `tiles` được đồng bộ.
- `client/src/scenes/BuildController.ts`: lớp với `setEnabled(enabled, showGrid)`, `setTool(tool)`, `onDown/onMove/onUp`, `showPreview(from,to)` (ghost `propTexture(scene, def)` + `propAnchor`), `isHost()`, `money()`. `onUp` gửi `Messages.BuildTiles`.
- `client/src/scenes/DecorController.ts` (mẫu cần bắt chước): `select(id|null)`, `rotate()` (dòng ~296), `onKeyDown` (KeyR, dòng ~339), `onDragStart/onDrag/onDragEnd` (kéo vào sell zone → `SellDecoration`), `isOverSellZone`, `renderRotation(view, rotation)`, `setGhostRotation`.
- `client/src/scenes/YardView.ts`: `propTexture(scene, def)`, `propThumbnail(def)` — vẽ vật đặt ô; cần vẽ theo hướng xoay (views → ảnh theo hướng, flip → `setFlipX`).
- `client/src/ui/BuildPanel.ts`: constructor gọi `this.select("floor_wood")` (phải bỏ); `makeButton(tool, ...)` tạo `button.decor-item.build-item`; `GROUPS`; `ERASE_TOOL` button; callback `onTool(tool)`.
- `client/src/ui/DecorPanel.ts`: `DECOR_ROTATE = "decor-rotate"` (event), nút `⟳ Xoay (R)` (pointerdown → `onRotate()`), badge `span.rotate-badge[data-rotatable]` + tooltip " · Xoay được (R)" trong `addItem` khi `rotationCount(def) > 1`; CSS `.rotate-badge` trong `client/src/style.css`.
- `client/src/main.ts`: `let buildTool = "floor_wood"` (dòng ~91), `buildPanel = new BuildPanel(buildRoot, room, (tool) => { buildTool = tool; ... })` (~476), `setBuilding(on)` (~611) emit `BUILD_TOOL_EVENT`; `setDecorating`; nút `decorateBtn` / `buildBtn`; sự kiện `DECOR_ROTATE`.
- Test: `tests/helpers.ts` có `joinAsHost(page, username)` và `startRestaurantShift`; `window.__GAME__` (`client/src/testHook.ts`, có `send(type, payload)`) — nếu thiếu thứ cần đọc (vd `state.tiles`, `tileRotations`) thì thêm vào hook ở bước client. Player bắt đầu ở sân; nút Xây (`#build-btn`) chỉ mở được khi ở sân. Spec chỉ-Node (không trình duyệt) cho phần shared như trong `tests/decor-catalog.spec.ts`.
- Docs: `AGENTS.md` mục Architecture (danh sách messages), Code Conventions, Codebase Map; `README.md` mục Controls, Decorating & saving.

## Plan
- [x] 1. [khó] `shared/src/world.ts` → thêm `buildRotationCount(def: BuildTileDef): number`, `normalizeTileRotation(def, r)`, và hàm thuần để lập kế hoạch di chuyển/bán một ô prop (vd `planTileMove(tiles, fromKey, toCx, toCy)`, kiểm tra `canBuildCell`, ô đích trống, đúng layer). `shared/src/index.ts` → thêm `Messages.MoveTile: "move_tile"` (payload `{ cx, cy, toCx, toCy, rotation }`), `Messages.SellTile: "sell_tile"` (`{ cx, cy }`), `rotation?: number` trong `BuildTilesMessage`, và export các kiểu mới. `shared/src/schema.ts` → `@type({ map: "number" }) tileRotations = new MapSchema<number>()` trong `BobaShopState`.
- [x] 2. [khó] `server/src/shop/SharedShop.ts` → thêm `tileRotations: Map<string, number>`, `moveTile(...)`, `sellTile(...)` (hoàn tiền vào host, `scheduleSave`, `emit`), `build(...)` nhận thêm `rotation` cho prop mới; `snapshot()`/`replace()`/load lưu và khôi phục `tileRotations` (trường tuỳ chọn, save cũ vẫn tải được); `server/src/rooms/BobaShopRoom.ts` → handlers `move_tile`, `sell_tile` (chỉ host, kiểm `blocked` như `handleBuildTiles`), truyền rotation trong `handleBuildTiles`, đồng bộ `state.tileRotations` (set/delete cùng lúc với `state.tiles`). Chạy `npm run typecheck`.
- [x] 3. [khó] `client/src/scenes/BuildController.ts` + `client/src/scenes/YardView.ts` → (a) khi `tool === ""` (không chọn): bấm một prop đã đặt thì chọn (viền sáng), kéo để di chuyển với ghost và ô đích hợp lệ/không hợp lệ, thả lên vùng 🗑 (hoặc phím Delete) thì gửi `SellTile`, thả ô hợp lệ thì gửi `MoveTile`, bấm ô trống hoặc Esc bỏ chọn; (b) R hoặc event `DECOR_ROTATE`-tương tự cho Xây xoay prop đang chọn (gửi `MoveTile` cùng ô với hướng mới) hoặc ghost khi đang có công cụ; (c) chỉ vẽ hover preview khi có công cụ; (d) `YardView` vẽ prop theo `tileRotations` (views → ảnh hướng tương ứng, flip → `setFlipX`) và cập nhật khi rotation đổi; (e) chỉ host mới chọn/di chuyển/bán/xoay được. Thêm vào `client/src/testHook.ts` những gì thiếu để test đọc `tiles`/`tileRotations`. Chạy `npm run typecheck`.
- [x] 4. [vừa] `client/src/ui/BuildPanel.ts` → bỏ `this.select("floor_wood")` (mặc định không chọn), bấm lại nút công cụ đang chọn thì bỏ chọn (`onTool("")`), thêm nút `⟳ Xoay (R)`, badge `⟳` + tooltip trên thẻ có `buildRotationCount(def) > 1`; `client/src/ui/DecorPanel.ts` → tách helper dùng chung (vd `client/src/ui/rotateUi.ts`: `makeRotateButton(onRotate)`, `addRotateBadge(el, rotatable)`) và dùng ở cả hai panel; `client/src/main.ts` → `buildTool` mặc định `""`, nối nút xoay và R của Xây; `client/src/style.css` nếu cần. Chạy `npm run typecheck`.
- [x] 5. [vừa] `tests/build-parity.spec.ts` → viết 3 test (mục Test cases). Chạy: `npx playwright test tests/build-parity.spec.ts`, rồi `npm run typecheck`.
- [x] 6. [dễ] `AGENTS.md` → (Code Conventions) thêm quy tắc: "Chế độ Xây và Trang trí phải hoạt động tương đồng — cùng cách chọn / di chuyển / xoay (R và nút ⟳, badge ⟳) / bán (🗑, Delete) / bỏ chọn (Esc, bấm ô trống), không có công cụ nào chọn sẵn. Sửa một bên thì phải sửa bên kia hoặc ghi rõ lý do vào task." (viết bằng tiếng Anh như phần còn lại); (Architecture) thêm `move_tile`, `sell_tile` vào danh sách messages; (Codebase Map) nếu thêm file mới. `README.md` → mục Controls / Decorating & saving: mô tả chọn, di chuyển, xoay, bán, bỏ chọn trong Xây, nói Xây và Trang trí dùng chung cách thao tác. Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Xoay ô lưu và khôi phục — `buildRotationCount`/`normalizeTileRotation` đúng số hướng (nội thất theo decor def, đồ ngoài trời 2 hướng) và `SharedShop` lưu rồi tải lại `tileRotations` (save cũ không có trường vẫn tải được) — tests/build-parity.spec.ts
- [x] T2. Di chuyển và bán ô — host `move_tile` chuyển prop sang ô trống đúng hướng, `sell_tile` xoá và hoàn tiền 50%, khách bị từ chối, ô đích không hợp lệ bị từ chối (2 trình duyệt hoặc gọi trực tiếp `SharedShop`) — tests/build-parity.spec.ts
- [x] T3. Panel Xây tương đồng — mở Xây không có công cụ nào có class `selected`, thẻ món xoay được có badge ⟳, nút `⟳ Xoay (R)` có mặt, bấm lại công cụ đã chọn thì bỏ chọn — tests/build-parity.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `buildRotationCount`, `normalizeTileRotation`, `planTileMove` (hỗ trợ xoay tại chỗ: to = from), `planTileSell` trong `shared/src/world.ts`; `Messages.MoveTile/SellTile`, `MoveTileMessage`/`SellTileMessage`, `rotation?` trong `BuildTilesMessage` trong `shared/src/index.ts`; `tileRotations` (MapSchema<number>) trong `shared/src/schema.ts`. `npm run typecheck` PASS.
- Bước 2 xong: `SharedShop` có `tileRotations`, `moveTile`, `sellTile`, `build(..., rotation, ...)`; `snapshot`/`replace`/`apply` lưu và khôi phục facings (save cũ không có `tileRotations` vẫn tải được); `removeTiles` cũng dọn rotation mồ côi. `BobaShopRoom` có handlers `move_tile`/`sell_tile` (chỉ host), tách `blockedCell()` dùng chung, `handleBuildTiles` truyền rotation, mirror + đồng bộ `state.tileRotations` qua event `tileRotations` mới. `npm run typecheck` PASS.
- Ngoài plan, bước 2 cũng sửa `shared/src/decor.ts`: thêm trường `tileRotations?: Record<string, number>` vào `ShopSave` (interface save nằm ở shared, cần thiết để `snapshot()`/`apply()` typecheck).
- Bước 3 xong: `BuildController` hỗ trợ `tool === ""` — chọn prop (viền vàng), kéo ghost + ô đích xanh/đỏ, thả 🗑 hoặc Delete → `SellTile`, thả ô hợp lệ → `MoveTile`, ô trống/Esc bỏ chọn; R xoay prop đang chọn (gửi `MoveTile` cùng ô, rotation mới) hoặc ghost công cụ (`ghostRotation`, kèm theo `BuildTiles`); hover preview chỉ khi có công cụ; mọi thao tác chọn/kéo/bán/xoay chỉ host. `YardView.propTexture(def, rotation)` trả texture + `flipX` (views → ảnh hướng, flip → lật), `redrawCell` vẽ theo `tileRotations`, nghe callbacks `tileRotations` để vẽ lại. `testHook` thêm `tiles()`/`tileRotations()` (plain object cho test). `npm run typecheck` PASS.
- Bước 4 xong: `client/src/ui/rotateUi.ts` (mới) — `makeRotateButton`/`addRotateBadge` dùng chung ở `DecorPanel` và `BuildPanel`; `BuildPanel` mặc định không chọn công cụ, bấm lại nút đang chọn → `onTool("")`, có nút `⟳ Xoay (R)`, badge ⟳ + tooltip cho thẻ `buildRotationCount(def) > 1`, guest bị ép bỏ Tẩy thì `select("")`; `main.ts` — `buildTool = ""`, BuildPanel nhận onRotate → emit `BUILD_ROTATE`; `ShopScene` nghe `BUILD_ROTATE` → `build.rotate()` (phím R của Xây đã có sẵn trong `BuildController` từ bước 3). `style.css` không cần đổi (`.rotate-btn`/`.rotate-badge` đã dùng chung theo class). `npm run typecheck` PASS.
- Ngoài plan, bước 4 cũng sửa `client/src/scenes/ShopScene.ts`: thêm listener `BUILD_ROTATE` → `build.rotate()` (event từ BuildPanel phải qua ShopScene mới tới được BuildController; pattern giống `DECOR_ROTATE` → `decor.rotate()`).
- Bước 5 xong: `tests/build-parity.spec.ts` với T1 (Node: đếm hướng + clamp; ghi file save JSON đúng format `flush` rồi cho server thật tải lại qua `joinAsHost`, gồm cả save cũ không có `tileRotations`), T2 (2 browser: host build/move/sell qua hook, guest và ô đã chiếm bị từ chối, hoàn 50%), T3 (panel không chọn sẵn, badge ⟳ khớp `buildRotationCount`, nút ⟳ Xoay (R), bấm lại bỏ chọn). Lần chạy đầu T2 fail vì test dùng `room.id` (SDK là `roomId`) — sửa 1 lần rồi PASS.
- Ngoài plan, bước 5 cũng sửa `server/src/persistence/ShopStore.ts`: `parseShopSave` giờ parse/giữ `tileRotations` (trước đó nó build object mới nên strip trường này — save/tải lại qua storage sẽ mất hướng; phát hiện khi soạn T1 vì Playwright không import được module server TS nên test phải đi qua file save thật). Test T1 xác nhận save/tải lại qua file.
- Bước 6 xong: Docs checked. `AGENTS.md` — Architecture liệt kê `move_tile`/`sell_tile`; Code Conventions thêm quy tắc "build mode and decorate mode must behave the same way …" (tiếng Anh); Codebase Map thêm `rotateUi`. `README.md` — Controls thêm R/⟳ Xoay, Delete, Esc cho chế độ trang trí/xây; Decorating & saving mô tả chọn/kéo/xoay/bán/bỏ chọn trong Xây, chỉ host, panel không chọn sẵn, vật giữ hướng khi lưu và với người chơi thứ 2. `npm run typecheck` PASS (docs only).

## Test status
- Lần chạy cuối: `npx playwright test tests/build-parity.spec.ts` → 3 passed (T1 3.2s, T2 6.0s, T3 1.8s) — chạy ở bước 5; bước 6 chỉ sửa docs nên chỉ chạy `npm run typecheck` (PASS).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS (lần chạy đầu fail: test đọc `room.id` thay vì `roomId` — sửa test, PASS ngay lần sau)
  - T3: PASS
- Fail chi tiết: (đã xử lý) T2 lần 1 timeout 60s — guest `joinById(undefined)` vì `__GAME__.room.id` không tồn tại (SDK Room dùng `roomId`); MatchMakeError "room undefined not found".

## Verify
- Toàn bộ e2e: 35/35 PASS. `npm run typecheck` PASS.
- T1/T2/T3: PASS (tests/build-parity.spec.ts; T2 dùng 2 trình duyệt: host build/move/sell, khách bị từ chối, hoàn 50%).
- Chuột thật trên canvas (1 phiên host): mở Xây không có công cụ nào `selected`; bấm vật đã đặt thì chọn (viền vàng); R xoay 0→1; kéo sang ô khác thì di chuyển (ô đích xanh, vùng 🗑 hiện); bấm ô trống rồi Delete không xoá gì; chọn lại rồi Delete thì bán (tiles rỗng). Ảnh: `.agents/screens/build-parity-2-selected.png`, `-3-rotated.png`, `-4-dragging.png`, `-5-deleted.png`.
- Docs: AGENTS.md có quy tắc "Xây và Trang trí tương đồng", README cập nhật Controls và Decorating.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
