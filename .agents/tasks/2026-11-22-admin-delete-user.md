# Task: Xoá user trong portal admin (+ gỡ khung chẩn đoán lưu trữ)

Verify mode: light

## Mục tiêu
- Mỗi hàng trong bảng "Người chơi" của portal có nút "Xoá". Bấm nút hiện hộp xác nhận một lần (không phải gõ tên) nêu rõ tên, tiền và số món sẽ mất; đồng ý thì xoá hồ sơ user và shop (tiền + đồ trang trí) khỏi kho lưu trữ (Upstash hoặc file).
- An toàn: không xoá được user đang trong phòng (đang chơi), và một lần lưu trễ của shop không bao giờ ghi lại bản ghi vừa xoá.
- Xoá xong user có thể vào game lại như người mới ($0).
- Gỡ khung "Chẩn đoán lưu trữ" khỏi portal, cùng endpoint `GET /admin/storage` và test T3 của nó (nguyên nhân đã tìm ra: thiếu biến Upstash trên Render). Giữ nguyên phần dự phòng `KEYS` khi SCAN rỗng và dòng log tóm tắt `[ShopStore] users: ...`.

## Quyết định đã chốt
- Xác nhận: hộp thoại `window.confirm` của trình duyệt ở portal (người dùng chọn "bấm xác nhận là được, đừng bắt gõ tên"). Server vẫn yêu cầu `{ "confirm": true }` trong body của `DELETE` để một lời gọi thiếu body không xoá nhầm.
- Chặn khi shop đang được phòng nào dùng (có listener): trả 409 `{ error: "user is in a room" }`; portal hiện "User đang trong phòng, thử lại sau".
- Xoá shop trước, rồi hồ sơ user (dừng giữa chừng thì chỉ còn hồ sơ không shop, game tự tạo shop rỗng).
- Không sao lưu. Không xoá hàng loạt, chỉ từng user.
- Dữ liệu từ server hiển thị bằng `textContent`, KHÔNG `innerHTML`.

## Ngữ cảnh
- `server/src/persistence/ShopStore.ts`: `type Collection = "users" | "shops"`; `interface Backend { name; read; write; list }`; `fileBackend` (`path.join(DATA_DIR, collection, id + ".json")`, imports từ `node:fs/promises`); `upstashBackend` dùng `command([...])` và `REDIS_PREFIX = { users: "boba:user:", shops: "boba:shop:" }`; `userIdOf(key)`; `UserRecord = { version, name, key, shopId, createdAt, lastSeenAt }`; `checkId(shopId)`. `inspectUsers()` (dùng bởi `listUsers()`) trả thêm `backend/userKeys/shopKeys/skipped`: GIỮ hàm, chỉ bỏ phần xuất ra endpoint.
- `server/src/shop/SharedShop.ts`: `class SharedShop { shopId; money; pieces; private listeners: Set<...>; subscribe(listener); private saveTimer; private scheduleSave(); async flush() }`; `flush()` gọi `saveShop(this.shopId, this.snapshot())` nên một lần lưu trễ sẽ GHI LẠI shop vừa xoá; cache module-level `const shops = new Map<string, SharedShop>()` theo usernameKey; `openShop(name, key, seen)`, `shopOf(key)`.
- `server/src/admin.ts`: `registerAdminRoutes(app)`; có `GET /admin/storage` (import `inspectUsers`) cần gỡ; helper `shopOfUser(name)`; mẫu route có try/catch 500, `JSON_BODY = express.json({ limit: "100kb" })`, `normalizeUsername`, `usernameKey`, `loadUser`; log `console.log("[admin] ...")` (không log token). Cập nhật comment đầu file cho khớp.
- `server/portal/index.html`: `renderUsers()` (~dòng 186) tạo mỗi hàng `<tr class="clickable">` với 5 ô `td` từ `[u.name, fmtMoney(u.money), counts.shop, counts.restaurant, fmtDate(u.lastSeenAt)]`, click hàng gọi `openDetail(u.name)`; tiêu đề bảng có 5 `<th>` (Tên, Tiền, Số món Tiệm trà, Số món Nhà hàng, Lần cuối); `colSpan = 5` ở hàng "Không có user nào"; `button.danger` có sẵn CSS; `api(path, options)` ném `UnauthorizedError` khi 401, lỗi khác ném Error có message (kèm status nếu có thể: cần phân biệt 409); `setMsg(text, kind)`, `loadUsers()`; khối chẩn đoán gồm `<div id="diagBox" class="card">` trong `#listView`, hàm `loadDiag()` và các chỗ gọi nó (sau đăng nhập, sau các thao tác đổi dữ liệu).
- `tests/admin-portal.spec.ts`: có T1, T2, T3 (T3 = chẩn đoán lưu trữ, cần gỡ), `SERVER`, `ADMIN_TOKEN = "test-admin-token"`, `AUTH`, `uniqueUser()`, `joinAsHost`. `PUT /admin/users/:name/shop` tạo user chưa từng chơi (body `{ money, decorations }`).

## Plan
- [x] 1. [khó] `server/src/persistence/ShopStore.ts` + `server/src/shop/SharedShop.ts` → xoá ở tầng lưu trữ: thêm `delete(collection, id)` vào `Backend` (file: `unlink`, bỏ qua `ENOENT`; Upstash: `command(["DEL", REDIS_PREFIX[collection] + id])`); export `deleteUserRecords(user: UserRecord): Promise<void>` xoá shop (`user.shopId`, qua `checkId`) rồi hồ sơ user (`userIdOf(user.key)`); trong `SharedShop.ts` thêm `isInUse(): boolean` (`listeners.size > 0`), `discard(): void` (huỷ `saveTimer`, đặt cờ `discarded` để `flush()`/`scheduleSave()` không ghi nữa) và export `forgetShop(key: string): void` (gọi `discard()` rồi xoá khỏi map `shops`). Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/admin.ts` → thêm `DELETE /admin/users/:name` (dùng `JSON_BODY`): 400 khi tên sai hoặc `body.confirm !== true`; 404 khi user không tồn tại; mở shop bằng `openShop(user.name, user.key, false)` rồi 409 nếu `shop.isInUse()`; nếu không: ghi lại `money`/số món, `forgetShop(user.key)`, `await deleteUserRecords(user)`; trả `{ ok: true, name, money, decorations }` (giá trị TRƯỚC khi xoá) và `console.log` một dòng `[admin] deleted user <name> ($<money>, <n> decoration(s))`. Đồng thời GỠ route `GET /admin/storage` và import `inspectUsers` nếu không còn dùng, cập nhật comment đầu file. Chạy `npm run typecheck`.
- [x] 3. [khó] `server/portal/index.html` → (a) GỠ `#diagBox`, `loadDiag()` và mọi chỗ gọi nó; (b) thêm cột cuối "Thao tác" (thêm `<th>` và `colSpan = 6`) với nút `button.danger` "Xoá" trên mỗi hàng của `renderUsers()`: bấm thì `event.stopPropagation()` (không mở chi tiết), hiện `window.confirm("Xoá user " + u.name + "? Sẽ mất " + fmtMoney(u.money) + " và " + (u.counts.shop + u.counts.restaurant) + " món trang trí. Không hoàn tác được.")`, đồng ý thì `api("/admin/users/" + encodeURIComponent(u.name), { method: "DELETE", body: JSON.stringify({ confirm: true }) })`; thành công thì `setMsg("Đã xoá user …", "success")` và `loadUsers()`; 409 thì `setMsg("User đang trong phòng, thử lại sau", "error")`; lỗi khác thì hiện thông báo lỗi như các thao tác khác. Chạy `npm run typecheck`.
- [x] 4. [khó] `tests/admin-portal.spec.ts` → GỠ T3 (chẩn đoán lưu trữ) và thêm T4, T5. Chạy `npx playwright test tests/admin-portal.spec.ts -g "T4"` rồi `-g "T5"`, rồi `npx playwright test`.

## Test cases
- [x] T1. API admin (có sẵn) — tests/admin-portal.spec.ts
- [x] T2. Portal UI (có sẵn) — tests/admin-portal.spec.ts
- [x] T4. API xoá user — `PUT /admin/users/<tên>/shop` tạo user có tiền; `DELETE` không token → 401; thiếu `confirm: true` → 400; có `confirm` → 200 và `GET /admin/users/<tên>` → 404, tên không còn trong `GET /admin/users`; `GET /admin/storage` giờ trả 404; user đang trong phòng (sau `joinAsHost`, trang còn mở) → `DELETE` trả 409 và user vẫn còn — tests/admin-portal.spec.ts
- [x] T5. Portal xoá user trên danh sách — tạo user bằng `PUT`, mở `/portal`, đăng nhập (xử lý hộp thoại bằng `page.once("dialog", d => d.accept())`): bấm "Xoá" ở hàng của user thì hàng biến mất, không mở chi tiết; trang không còn `#diagBox` — tests/admin-portal.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `ShopStore` có `Backend.delete` (file: unlink bỏ qua ENOENT; Upstash: DEL), `deleteUserRecords` xoá shop rồi user; `SharedShop` có `isInUse`/`discard` (cờ `discarded` chặn `flush`/`scheduleSave`), `forgetShop(key)` discard + xoá khỏi cache. `npm run typecheck` PASS.
- Bước 2 xong: `admin.ts` có `DELETE /admin/users/:name` (400 tên sai/thiếu `confirm: true`, 404 không tồn tại, 409 khi `isInUse()`, xoá qua `forgetShop` + `deleteUserRecords`, trả giá trị trước xoá); đã gỡ route `GET /admin/storage` và import `inspectUsers`, cập nhật comment đầu file. `npm run typecheck` PASS.
- Bước 3 xong: portal gỡ sạch `#diagBox`/`loadDiag()` và mọi chỗ gọi (không còn "diag" trong file); bảng có cột "Thao tác" (`<th>` thứ 6, `colSpan = 6`) với nút `danger` "Xoá": `stopPropagation`, `window.confirm` nêu tên/tiền/số món, `DELETE` kèm `{ confirm: true }`, thành công thì `setMsg` + `loadUsers()`, 409 thì "User đang trong phòng, thử lại sau", lỗi khác qua `handleError`; `api()` giờ gắn `err.status` để phân biệt 409. `npm run typecheck` PASS.
- Bước 4 xong: `tests/admin-portal.spec.ts` gỡ T3, thêm T4 (API xoá user: 401/400/404/200/409, `/admin/storage` 404) và T5 (portal: nút Xoá xoá hàng, không mở chi tiết, không còn `#diagBox`); comment đầu file cập nhật. `npm run typecheck` PASS; `npx playwright test tests/admin-portal.spec.ts -g "T4"` PASS, `-g "T5"` PASS, `npx playwright test` 24/24 PASS.

## Test status
- Lần chạy cuối: `npx playwright test` (sau bước 4) — 24/24 PASS.
- Kết quả từng test:
  - T1: PASS (có sẵn)
  - T2: PASS (có sẵn)
  - T4: PASS (`npx playwright test tests/admin-portal.spec.ts -g "T4"`)
  - T5: PASS (`npx playwright test tests/admin-portal.spec.ts -g "T5"`)
- Fail chi tiết:

## Verify
- T4, T5: PASS (playwright 24/24, typecheck OK). Chụp portal: nút "Xoá" ở cột Thao tác, hộp xác nhận nêu tên/tiền/số món, xoá xong hàng biến mất; không còn khung chẩn đoán, `/admin/storage` đã gỡ.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
