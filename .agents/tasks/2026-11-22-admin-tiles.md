# Task: Portal admin quản lý ô xây (sàn, tường, đồ dựng ở sân)

Verify mode: light

## Mục tiêu
- Portal hiện số ô xây của từng user: thêm cột "Ô xây" vào bảng "Người chơi".
- Trong trang chi tiết user có card "Ô xây (sân)": bảng gom theo loại ô (tên, dạng: sàn / tường / hàng rào / cửa / đồ vật, giá, số ô) — kể cả các món nội thất dựng ở sân (giường, ghế... có kind `decor_<kind>`, tên lấy từ catalog xây).
- Xoá được từng loại ô (nút "Xoá" mỗi hàng, một hộp xác nhận) hoặc toàn bộ ô xây của user; luôn hoàn tiền ĐỦ giá (giá mỗi ô x số ô) vào ví chủ shop. Áp dụng ngay cả khi user đang trong phòng (client nhận sự kiện `tiles`).
- Không đụng tới đồ trang trí (`decorations`) ở bước này.

## Quyết định đã chốt
- Ô xây nằm trong `ShopSave.tiles` của shop CHỦ PHÒNG (cùng bản ghi với tiền và decorations); portal quản lý đúng bản ghi đó. Hoàn tiền vào ví của chủ shop, đủ giá `BUILD_TILES[kind].price` mỗi ô (kind không còn trong catalog: giá 0, không hoàn).
- Không sao lưu, không có xoá hàng loạt nhiều user ở bước này.
- Dữ liệu từ server hiển thị bằng `textContent`, KHÔNG `innerHTML`.

## Ngữ cảnh
- `shared/src/world.ts`: `BuildTileDef { kind; label; price; shape: "floor"|"wall"|"fence"|"door"|"prop"; group?; decor?; ... }`, `BUILD_TILES: BuildTileDef[]` (gồm các ô thường và `decorProp` của món nội thất, kind `decor_<kind>`), `getBuildTile(kind)`, `layerOf(def)` ("floor" | "structure"), `tileKey(cx, cy, layer)` = `"f:cx,cy"` hoặc `"s:cx,cy"`, `parseTileKey(key)`, `canBuildCell(cx, cy)`.
- `server/src/shop/SharedShop.ts`: `class SharedShop { money; pieces; readonly tiles = new Map<string, string>() /* tileKey -> kind */; private scheduleSave(); private emit(event) }`; `ShopEvent` có `{ type: "tiles"; changes: [string, string][] }` (kind `""` = đã xoá) và `{ type: "money"; money }`. Mẫu phương thức admin có sẵn: `piecesByVenue()`, `removePieces(selector, refund)` (xoá, cộng `def.price`, emit `removed` + `money`, `scheduleSave`), kiểu `RefundMode = "full" | "none"`.
- `server/src/admin.ts`: `registerAdminRoutes(app)`; `GET /admin/users` trả mảng `{ name, key, money, lastSeenAt, counts: { shop, restaurant } }` (mỗi user mở bằng `openShop(user.name, user.key, false)`); `shopOfUser(name)`; `GET /admin/users/:name/decorations`; `DELETE /admin/users/:name/decorations`; `parseRefundMode`; `JSON_BODY`; cập nhật comment đầu file cho các route mới.
- `server/portal/index.html`: `renderUsers()` tạo hàng từ `[u.name, fmtMoney(u.money), String(u.counts.shop), String(u.counts.restaurant), fmtDate(u.lastSeenAt)]` + ô nút "Xoá" (bảng có 6 `<th>`, `colSpan = 6` ở hàng rỗng); `loadDetail(name)` gọi `api("/admin/users/<name>/decorations")` và vẽ hai card đồ trang trí; `api(path, options)`; `setMsg(text, kind)`; `window.confirm` đã dùng cho nút xoá user; helper `$`, `fmtMoney`.
- `tests/admin-portal.spec.ts`: có `SERVER`, `ADMIN_TOKEN = "test-admin-token"`, `AUTH`, `uniqueUser()`, `joinAsHost`. `PUT /admin/users/:name/shop` (body `{ money, decorations, tiles }`) tạo user chưa từng chơi; khi tải, `parseShopSave` chỉ giữ ô nếu `getBuildTile(kind)` có, kind thuộc đúng lớp (`f:` cho sàn, `s:` cho còn lại) và `canBuildCell(cx, cy)` đúng: trong test import `canBuildCell`, `tileKey`, `getBuildTile` từ `@boba/shared` và chọn 3 ô đầu tiên (lặp `cx`, `cy` từ 0) thoả `canBuildCell`; dùng `floor_wood` (sàn, giá 2) cho 2 ô lớp sàn và `decor_bed_red` (giường; đồ vật ở lớp kết cấu) cho 1 ô; kiểm tra `getBuildTile("decor_bed_red")` có, nếu không thì dùng kind `decor_*` đầu tiên trong `BUILD_TILES`.

## Plan
- [x] 1. [khó] `server/src/shop/SharedShop.ts` → thêm hai phương thức công khai: `tilesByKind(): { kind: string; label: string; price: number; shape: string; count: number }[]` (gom `this.tiles` theo kind, dùng `getBuildTile`; kind không có trong catalog: `label = kind`, `price = 0`, `shape = "unknown"`; sắp xếp giảm dần theo `count`) và `removeTiles(selector: string[] | "all", refund: RefundMode): { removed: number; refunded: number }`: xoá mọi ô có kind trong danh sách (hoặc tất cả khi `"all"`), `emit({ type: "tiles", changes })` với `[key, ""]` cho từng ô đã xoá, cộng `price` mỗi ô khi `refund === "full"` (kind lạ giá 0) rồi `emit` `money`, `scheduleSave()`; không có ô nào bị xoá thì không phát sự kiện. Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/admin.ts` → (a) `GET /admin/users`: thêm `counts.tiles = shop.tiles.size`; (b) `GET /admin/users/:name/tiles` → `{ name, money, tiles: shop.tilesByKind(), total }`; (c) `DELETE /admin/users/:name/tiles` body `{ kinds?: string[], all?: true, refund?: "full" | "none" }`: phải có đúng một trong `kinds` (mảng chuỗi không rỗng) hoặc `all: true` (nếu không 400), `refund` mặc định `"full"` (sai 400), 404 khi user không tồn tại; trả `{ ok: true, removed, refunded, money }` và log `[admin] removed N tile(s) of <name>, refunded $X`. Cập nhật comment đầu file. Chạy `npm run typecheck`.
- [x] 3. [khó] `server/portal/index.html` → (a) thêm `<th>` "Ô xây" và ô dữ liệu `String(u.counts.tiles ?? 0)` vào bảng người chơi (cập nhật `colSpan`); (b) trong `#detailView` thêm card "Ô xây (sân)" (đặt dưới hai card đồ trang trí): bảng Loại / Dạng / Giá / Số ô / nút "Xoá" mỗi hàng và nút đỏ "Xoá toàn bộ ô xây của user (hoàn tiền đủ)"; `loadDetail` gọi thêm `api("/admin/users/<name>/tiles")` để vẽ; bấm "Xoá" từng loại hoặc toàn bộ thì `window.confirm` nêu tên loại/số ô/số tiền hoàn rồi gọi `DELETE /admin/users/<name>/tiles` (`{ kinds: [kind] }` hoặc `{ all: true }`); thành công thì `setMsg` (có số ô và tiền hoàn) và tải lại chi tiết; mọi dữ liệu dùng `textContent`; hàng "Chưa có ô xây nào" khi rỗng. Dịch nhãn dạng: floor "Sàn", wall "Tường", fence "Hàng rào", door "Cửa", prop "Đồ vật", unknown "Không còn trong catalog". Chạy `npm run typecheck`.
- [x] 4. [khó] `tests/admin-portal.spec.ts` → thêm T6, T7 (giữ các test cũ). Chạy `npx playwright test tests/admin-portal.spec.ts -g "T6"` rồi `-g "T7"`, rồi `npx playwright test`.

## Test cases
- [x] T1, T2, T4, T5. Có sẵn — tests/admin-portal.spec.ts
- [x] T6. API ô xây — `PUT /admin/users/<tên>/shop` tạo user có `money: 100` và 3 ô xây (2 `floor_wood`, 1 `decor_*` giường); `GET /admin/users` có `counts.tiles === 3` cho user đó; `GET .../tiles` trả 2 nhóm với `count` 2 và 1 và `total` 3; `DELETE .../tiles` với `{ kinds: ["floor_wood"] }` trả `removed: 2`, `refunded` bằng 2 x giá `floor_wood`, `money` tăng đúng số đó; `DELETE` với `{}` → 400; `DELETE` với `{ all: true }` xoá ô còn lại và hoàn đủ giá — tests/admin-portal.spec.ts
- [x] T7. Portal ô xây — tạo user như T6, mở `/portal`, đăng nhập: cột "Ô xây" của user hiện 3; mở chi tiết thấy card "Ô xây (sân)" có hàng "Sàn gỗ" số ô 2; bấm "Xoá toàn bộ ô xây của user" (chấp nhận `dialog`) thì bảng ô xây trống ("Chưa có ô xây nào") và tiền tăng — tests/admin-portal.spec.ts

## Trạng thái hiện tại
- Bước 1 xong (commit f8dafb4): `SharedShop.tilesByKind()` và `SharedShop.removeTiles()` đã thêm; typecheck PASS. Không có lệnh test riêng cho bước này.
- Bước 2 xong (commit 17dfafb): `counts.tiles` trong `GET /admin/users`; mới `GET/DELETE /admin/users/:name/tiles` (validate kinds/all, refund mặc định full, 404 user lạ); cập nhật comment đầu file; typecheck PASS. Không có lệnh test riêng cho bước này.
- Bước 3 xong (commit e2203da): portal thêm cột "Ô xây" (colSpan 7), card "Ô xây (sân)" dưới hai card đồ trang trí (bảng Loại/Dạng/Giá/Số ô/Xoá, nút "Xoá toàn bộ ô xây của user (hoàn tiền đủ)", confirm, `textContent`, hàng "Chưa có ô xây nào"); `loadDetail` gọi thêm API tiles; typecheck PASS. Không có lệnh test riêng cho bước này.
- Bước 4 xong (commit d16a215): T6, T7 đã thêm vào `tests/admin-portal.spec.ts` (các test cũ giữ nguyên). Cả 4 bước hoàn tất; task đã xong phần lập trình, còn chờ Verify.

## Test status
- Lần chạy cuối: `npx playwright test` (sau bước 4) — 26/26 PASS.
- Kết quả từng test:
  - T1, T2, T4, T5: PASS (có sẵn)
  - T6: PASS (`npx playwright test tests/admin-portal.spec.ts -g "T6"`)
  - T7: PASS (`npx playwright test tests/admin-portal.spec.ts -g "T7"`)
- Fail chi tiết:

## Verify
- T6, T7: PASS (playwright 26/26, typecheck OK). Chụp portal với user mẫu: card "Ô xây (sân)" gom theo loại (Sàn gỗ 3, Giường chăn đỏ 2 dạng Đồ vật, Sàn đá 1) kèm nút Xoá từng loại và xoá toàn bộ.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
