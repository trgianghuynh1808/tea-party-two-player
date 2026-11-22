# Task: Portal admin (quản lý user, tiền, đồ trang trí theo cửa hàng)

Verify mode: full

## Mục tiêu
- Có trang portal admin tại `/portal` (server phục vụ, không cần build client): nhập `ADMIN_TOKEN`, xem danh sách user, chọn một user để xem tiền và đồ trang trí chia theo cửa hàng (Tiệm trà / Nhà hàng).
- Sửa tiền của user (đặt lại hoặc cộng/trừ).
- Xoá đồ trang trí của user: từng món được chọn, hoặc toàn bộ một cửa hàng; luôn hoàn tiền ĐỦ giá món vào ví user.
- Một nút "Xoá đồ trang trí NHÀ HÀNG của mọi user" (kèm hoàn tiền đủ giá), có chế độ xem trước (dry run) hiện số user/số món/tổng tiền hoàn trước khi bấm xác nhận. Chỉ động tới đồ trong nhà hàng; tiệm trà và sân giữ nguyên.
- Mọi thay đổi áp dụng ngay cả khi user đang trong phòng (SharedShop phát sự kiện). Không sao lưu (người dùng đã quyết định không cần).

## Quyết định đã chốt
- Phạm vi xoá hàng loạt: chỉ nhà hàng. Hoàn tiền: đủ giá (`def.price`), không phải nửa giá.
- Xác thực: header `Authorization: Bearer <ADMIN_TOKEN>` như API admin hiện có (`app.use("/admin", ...)`). Trang `/portal` (HTML tĩnh) KHÔNG cần token để tải, token nhập trong trang và giữ trong `sessionStorage`, gửi kèm mọi lời gọi API. Không ghi token ra log/URL.
- Cửa hàng của một món suy ra từ toạ độ bằng `areaOf({x, y})` của `@boba/shared` (`"shop"` | `"restaurant"`); không thêm trường mới vào dữ liệu lưu.
- Trang portal chỉ dùng HTML/CSS/JS thuần (không framework). Dữ liệu từ server (tên user, kind) hiển thị bằng `textContent`, KHÔNG dùng `innerHTML` (tên user do người chơi tự đặt → tránh XSS).
- Giao diện tiếng Việt; mã/comment tiếng Anh.

## Ngữ cảnh
- `server/src/index.ts`: đã có `ADMIN_TOKEN`, `isAdmin(header)`, `app.use("/admin", ...)` chặn không token (401, hoặc 404 nếu chưa đặt token), `GET /admin/users/:name` và `PUT /admin/users/:name/shop`; `if (serveClient) app.use(express.static(clientDist));` ở cuối `express: (app) => {...}`. Import sẵn: `normalizeUsername`, `usernameKey`, `loadUser`, `parseShopSave`, `openShop`.
- `server/src/persistence/ShopStore.ts`: `interface Backend { name; read(collection, id); write(collection, id, json) }`, `type Collection = "users" | "shops"`; `fileBackend` (thư mục `DATA_DIR/<collection>/<id>.json`, `readdir` để liệt kê) và `upstashBackend` (`command(["GET"|"SET", REDIS_PREFIX[collection] + id])`, `REDIS_PREFIX = { users: "boba:user:", shops: "boba:shop:" }`). `UserRecord = { version, name, key, shopId, createdAt, lastSeenAt }`; `loadUser(usernameKey)`; không có hàm liệt kê.
- `server/src/shop/SharedShop.ts`: `class SharedShop { money; pieces: Piece[] (Required<PlacedDecoration>: {id,kind,x,y,rotation}); earn(amount); sell(id) // xoá + hoàn nửa giá + emit; snapshot(); replace(save); flush(); private scheduleSave(); private emit(event) }`; sự kiện `{type:"removed", id}` và `{type:"money", money}`; `openShop(name, key, seen=false)` trả shop đã tải (cache trong `shops` Map). `sell` dùng `refundFor(def)` (nửa giá): admin cần hàm riêng hoàn ĐỦ giá.
- `shared/src/decor.ts`: `getDecorationDef(kind)` → `{ label, price, ... }`; `shared/src/world.ts`: `areaOf(p)`, `RESTAURANT = { x: 1400, ... }`.
- `shared/src/lobby.ts`: `normalizeUsername(raw)`, `usernameKey(name)`.
- `playwright.config.ts` `webServer[0]` (server) hiện không có `env`: thêm `env: { ADMIN_TOKEN: "test-admin-token" }`. Nếu đang có dev server chạy sẵn không token thì test sẽ không thấy admin API (cần tắt trước khi chạy).
- `tests/helpers.ts`: `joinAsHost(page, username)`; hook `window.__GAME__.send(type, payload)` và `.state`. Gửi `buy_decoration` với `{ kind, x, y }` mua đồ (chủ phòng, ngoài ca); toạ độ nhà hàng bắt đầu x ≥ 1400 (vd `plant` tại `x: 1560, y: 400`), tiệm trà x ≤ 960 (vd `x: 500, y: 450`); cần có tiền (mới vào = $0) nên cấp bằng API admin trước.

## Plan
- [x] 1. [khó] `server/src/persistence/ShopStore.ts` → `Backend` + `listUsers()`: thêm `list(collection): Promise<string[]>` vào `Backend` (file: `readdir` các `*.json` bỏ đuôi, `ENOENT` → `[]`; Upstash: vòng `SCAN <cursor> MATCH <prefix>* COUNT 200` qua `command([...])` đến khi cursor = "0", bỏ prefix), và export `listUsers(): Promise<UserRecord[]>` đọc từng user qua `loadUser`-tương-đương (parse an toàn; bỏ qua bản ghi hỏng, không throw). Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/shop/SharedShop.ts` → thêm 3 hàm công khai: `piecesByVenue(): { id, kind, label, price, x, y, rotation, venue }[]` (dùng `getDecorationDef` + `areaOf`); `adjustMoney(delta)` (cộng/trừ, không xuống dưới 0, emit `money`, `scheduleSave`; dùng/tái dùng `earn`); `removePieces(ids: string[] | ((p: Piece) => boolean), refund: "full" | "none")`: xoá món khớp, phát `removed` cho từng món, cộng `def.price` (đủ giá) khi `refund === "full"` rồi emit `money`, `scheduleSave`; trả về `{ removed: number, refunded: number }`. Chạy `npm run typecheck`.
- [x] 3. [khó] `server/src/admin.ts` (file mới) + `server/src/index.ts`: export `registerAdminRoutes(app)` chứa (sau middleware `/admin` hiện có, di chuyển 2 route cũ vào đây giữ nguyên hành vi): `GET /admin/users` (mảng `{ name, key, money, lastSeenAt, counts: { shop, restaurant } }`, mở shop bằng `openShop(name, key, false)`), `GET /admin/users/:name/decorations` (`piecesByVenue()`), `PATCH /admin/users/:name/money` (body `{ set?: number } | { delta?: number }`, số nguyên hữu hạn, `set` ≥ 0; 400 khi sai), `DELETE /admin/users/:name/decorations` (body `{ ids?: string[], venue?: "shop"|"restaurant", refund?: "full"|"none" }`: phải có `ids` hoặc `venue`; mặc định `refund = "full"`), `POST /admin/decorations/reset` (body `{ venue: "restaurant", refund: "full", dryRun?: boolean }`; chỉ chấp nhận `venue === "restaurant"`; duyệt mọi user; `dryRun` chỉ trả `{ users, pieces, refund }` không đổi gì; thật thì trả thêm `{ removed, refunded }` và `console.log` một dòng tổng, không log token). Dùng `express.json({ limit: "100kb" })`; bọc try/catch trả 500 như route cũ. Trong `index.ts`: gọi `registerAdminRoutes(app)`; thêm `app.get("/portal", (_req, res) => res.sendFile(path.resolve(<thư mục file index.ts>, "../portal/index.html")))` TRƯỚC `express.static`. Chạy `npm run typecheck`.
- [x] 4. [khó] `server/portal/index.html` (file mới, HTML+CSS+JS thuần, một file): màn hình nhập token (lưu `sessionStorage`, nút Đăng xuất); sau khi nhập gọi `GET /admin/users` (401 → báo "Sai token"); bảng user (tìm theo tên, cột Tên / Tiền / Số món Tiệm trà / Số món Nhà hàng / Lần cuối); bấm user mở chi tiết: ô sửa tiền (đặt lại / cộng-trừ), hai bảng đồ trang trí "Tiệm trà" và "Nhà hàng" (cột chọn, tên món, giá, toạ độ), nút "Xoá món đã chọn (hoàn tiền đủ)" và "Xoá toàn bộ nhà hàng của user (hoàn tiền đủ)"; khu "Dọn nhà hàng cho mọi user": nút "Xem trước" (gọi dry run, hiện số user/món/tiền hoàn) rồi nút "Xoá thật" chỉ bật sau khi xem trước và bắt gõ chữ `XOA` để xác nhận. Mọi dữ liệu từ server dùng `textContent`/`createElement`, tuyệt đối không `innerHTML`. Có thông báo thành công/lỗi; sau mỗi thao tác tải lại dữ liệu. Bố cục dùng được ở 1280px (không cần mobile). Chạy `npm run typecheck`.
- [x] 5. [khó] `playwright.config.ts` + `tests/admin-portal.spec.ts` (file mới): thêm `env: { ADMIN_TOKEN: "test-admin-token" }` cho webServer server; viết T1, T2 dưới đây (dùng `request` fixture cho API, `page` cho portal, header `Authorization: Bearer test-admin-token`, username duy nhất `p1-${Date.now()}`). Chạy `npx playwright test tests/admin-portal.spec.ts -g "T1"` rồi `-g "T2"`, rồi `npx playwright test`.

## Test cases
- [x] T1. API admin — không token → 401; sau `joinAsHost` + `PATCH money {set: 1000}` + mua 1 món ở nhà hàng (`x ≥ 1400`) và 1 món ở tiệm trà: `GET /admin/users/:name/decorations` có đúng 1 món `venue: "restaurant"` và 1 `venue: "shop"`; `DELETE` với `venue: "restaurant"` trả `removed: 1`, tiền tăng đúng bằng giá món (hoàn đủ), món tiệm trà còn nguyên; `POST /admin/decorations/reset` với `venue: "shop"` → 400 — tests/admin-portal.spec.ts
- [x] T2. Portal UI — mở `/portal`, nhập token sai → thấy báo lỗi; nhập token đúng → bảng có hàng của user test với số món Nhà hàng = 1; mở chi tiết, bấm "Xoá toàn bộ nhà hàng của user" → số món nhà hàng về 0 và tiền tăng — tests/admin-portal.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `ShopStore.ts` có `Backend.list` (file `readdir` + Upstash `SCAN`) và `listUsers()` bỏ qua bản ghi hỏng. Đã commit b3fcac6.
- Bước 2 xong: `SharedShop.ts` có `piecesByVenue()` / `adjustMoney()` / `removePieces()` (hoàn đủ giá, emit `removed` + `money`). Đã commit 8160c8c.
- Bước 3 xong: `server/src/admin.ts` mới với `registerAdminRoutes(app)` (2 route cũ giữ nguyên + 5 route mới: list users, decorations theo venue, PATCH money, DELETE decorations, POST reset nhà hàng có dryRun); `index.ts` gọi register + route `/portal` trước `express.static`. Typecheck PASS (tự sửa 1 lần sai type `Express` → `Application`), đã commit ef8d08d.
- Bước 5 xong: `playwright.config.ts` thêm `env: { ...process.env, ADMIN_TOKEN: "test-admin-token" }` cho webServer server (spread `process.env` vì Playwright thay toàn bộ env, mất PATH thì npm không chạy được); `tests/admin-portal.spec.ts` mới với T1 (API qua `request` fixture) + T2 (portal qua `page`). Lệch so với gợi ý trong plan, cả hai đều ghi chú trong spec:
  - Món nhà hàng mua tại `plant (1800, 400)` thay vì ví dụ `(1560, 400)`: toạ độ gợi ý đè lên cột máy nấu trong của bếp (local x 166..262, y 344..416) nên `canPlaceDecoration` từ chối; `(1800, 400)` vẫn thỏa `x ≥ 1400`.
  - Username đổi thành `p1-${Date.now().toString(36)}-${seq}`: `p1-${Date.now()}-${seq}` dài 18 ký tự vượt `USERNAME_MAX = 16` (lobby.ts), form join bị cắt bớt tên (client main.ts đặt `maxLength`) nên admin API gọi tên đầy đủ trả 400 "bad name" (fail lần chạy T1 đầu, sửa 1 lần là PASS).
  - Typecheck PASS (server + client). T1 PASS, T2 PASS, chạy cả bộ `npx playwright test` 22/22 PASS. Tất cả bước trong plan đã xong.

## Test status
- Lần chạy cuối: `npx playwright test` (toàn bộ, sau bước 5) — 22/22 PASS (kể cả T1, T2 của admin-portal); `npm run typecheck` sau bước 5 — PASS (server + client).
- Kết quả từng test:
  - T1 (admin-portal): PASS — `npx playwright test tests/admin-portal.spec.ts -g "T1"` (sau 1 lần tự sửa username quá dài).
  - T2 (admin-portal): PASS — `npx playwright test tests/admin-portal.spec.ts -g "T2"`.
  - Các spec khác (orders-panel, restaurant-layout, decor-catalog, cooked-food-image, mobile-recipe-modal, tea-shop-art): PASS trong lần chạy cả bộ.
- Fail chi tiết: T1 fail 1 lần đầu tiên (PATCH money 400 "bad name" do username 18 ký tự > `USERNAME_MAX` 16, form cắt bớt); đã sửa `uniqueUser()` sang base36, các lần chạy sau PASS hết.

## Verify
- T1, T2: PASS (playwright 22/22, typecheck OK).
- Kịch bản thật (2 user đang trong phòng, ADMIN_TOKEN): dry run không đổi dữ liệu; `venue: shop` → 400; xoá hàng loạt nhà hàng hoàn tiền đủ giá (A +$50, B +$185), đồ tiệm trà còn nguyên, client đang trong phòng cập nhật ngay (decorations và tiền). Portal: đăng nhập, danh sách, chi tiết, sửa tiền, xoá món hiển thị đúng.
- Không chặn: Enter không đăng nhập được (chỉ nút bấm); xoá hàng loạt chưa `flush()` ngay (lưu sau ~1s).

VERIFY: PASS

## Đã thử mà không được
- Bước 4: file `server/portal/index.html` đã được viết xong (413 dòng) nhưng OpenCode bị kẹt khi tự chạy server thử thủ công (ghi vào `/tmp` bị từ chối quyền). Claude đã commit file này. KHÔNG tự chạy server hay lệnh ngoài plan; bước 4 coi như xong (không `innerHTML`, đã kiểm tra). Chỉ làm bước 5 và chạy đúng lệnh test ghi trong bước.

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa: 1 (bước 5: username `p1-${Date.now()}-${seq}` dài 18 > USERNAME_MAX 16 → đổi sang base36)
- Model dùng: opencode-go/glm-5.3
