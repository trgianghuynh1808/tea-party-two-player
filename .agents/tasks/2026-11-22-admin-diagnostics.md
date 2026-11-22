# Task: Chẩn đoán danh sách user trống trên portal admin (production Upstash)

Verify mode: light

## Mục tiêu
- Portal hiện một khung "Chẩn đoán lưu trữ" ngay trên bảng người chơi: tên backend (Upstash Redis / file), số key hồ sơ user server thấy, số đọc được, số shop, và danh sách bản ghi bị bỏ qua kèm lý do ngắn.
- Khi liệt kê user bằng Upstash không ra kết quả (SCAN trả rỗng), server thử lại bằng `KEYS <prefix>*` (database nhỏ nên chấp nhận được) trước khi kết luận là rỗng.
- Server ghi log một dòng cho mỗi lần liệt kê: số key thấy / số user đọc được / số bị bỏ qua (kèm lý do), để xem trên Render Logs.
- Danh sách user hiện có (`GET /admin/users`, trả mảng) giữ nguyên định dạng; hành vi bỏ qua bản ghi hỏng giữ nguyên (không đưa vào danh sách bản ghi có id không khớp hash, vì `openShop` sẽ tạo trùng hồ sơ).

## Quyết định đã chốt
- Bối cảnh: trên production, Upstash Data Browser có key `boba:user:u_...` và `boba:shop:u_...` nhưng `GET /admin/users` trả `[]` (cả hai lần, nên không phải cache). Đã mô phỏng Upstash (SCAN phân trang) với 552 user: đọc đủ, nên chưa rõ nguyên nhân; task này thêm khả năng quan sát và một đường dự phòng.
- Không đổi dữ liệu nào, chỉ đọc.
- Dữ liệu từ server hiển thị bằng `textContent`, KHÔNG `innerHTML`.

## Ngữ cảnh
- `server/src/persistence/ShopStore.ts`:
  - `Backend.list(collection)`: file backend dùng `readdir`; Upstash dùng vòng `SCAN <cursor> MATCH <prefix>* COUNT 200` rồi `ids.push(String(key).slice(prefix.length))` (xem `upstashBackend`, ~dòng 92-103). `command(args)` gọi REST Upstash, trả `body.result`.
  - `export const storageName = backend.name` (vd "Upstash Redis" hoặc "files in <dir>").
  - `export async function listUsers(): Promise<UserRecord[]>` (~dòng 148): lấy `ids = await backend.list("users")`, đọc từng id, bỏ qua (có `console.warn`) bản ghi nếu `typeof name/key !== "string"`, hoặc `userIdOf(data.key) !== id`, hoặc `!isValidShopId(data.shopId)`, hoặc JSON hỏng.
  - `userIdOf(key) = "u_" + sha256(key).slice(0,32)`.
- `server/src/admin.ts`: `registerAdminRoutes(app)`; dòng `GET /admin/users` dùng `listUsers()`; có middleware `/admin` kiểm tra token; mẫu route + try/catch 500 như các route khác.
- `server/portal/index.html`: view `#listView` có `<div class="card">` chứa `<h2>Người chơi</h2>`, `loadUsers()` (~dòng 206) gọi `api("/admin/users")`; hàm `api(path, options)` thêm header Authorization, ném `UnauthorizedError` khi 401; helper `$` = getElementById; `renderUsers()`. Ở nơi gọi `loadUsers()` sau khi đăng nhập (xem `enterWithToken`) cũng gọi hàm tải chẩn đoán mới.
- `tests/admin-portal.spec.ts`: có `SERVER`, `ADMIN_TOKEN = "test-admin-token"`, `AUTH`, `uniqueUser()`; `joinAsHost` từ `tests/helpers.ts`. Server test dùng file backend.

## Plan
- [x] 1. [khó] `server/src/persistence/ShopStore.ts` → `Backend.list` (Upstash) và `inspectUsers()`: (a) trong `upstashBackend.list`, nếu vòng SCAN thu được 0 id thì thử một lần `command(["KEYS", prefix + "*"])` (kết quả là mảng chuỗi) và dùng nó; (b) thêm `export async function inspectUsers(): Promise<{ backend: string; userKeys: number; shopKeys: number; users: UserRecord[]; skipped: { id: string; reason: string }[] }>`: dùng `backend.list("users")` / `backend.list("shops")`, đọc/validate từng user đúng như `listUsers` nhưng thu `skipped` (`reason`: "json hỏng", "thiếu name/key", "id không khớp hash của key", "shopId không hợp lệ", "đọc lỗi: <message>", tối đa 200 ký tự) thay vì chỉ `console.warn`; (c) viết lại `listUsers()` = `(await inspectUsers()).users` (giữ nguyên hành vi), và `console.log` một dòng `[ShopStore] users: <userKeys> keys, <users.length> read, <skipped.length> skipped` mỗi lần gọi, kèm tối đa 5 `skipped` đầu tiên. Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/admin.ts` → thêm `GET /admin/storage`: trả `{ backend, userKeys, shopKeys, users: <số đọc được>, skipped }` từ `inspectUsers()` (không trả nội dung bản ghi). Chạy `npm run typecheck`.
- [x] 3. [khó] `server/portal/index.html` → khung chẩn đoán: trong `#listView` (trên card "Người chơi") thêm một `<div id="diagBox" class="card">` có tiêu đề "Chẩn đoán lưu trữ", dòng tóm tắt "Lưu trữ: <backend> · <userKeys> hồ sơ user · <users> đọc được · <shopKeys> shop · <skipped.length> bỏ qua", và nếu có `skipped` thì một danh sách `id — lý do` (tối đa 50, bằng `createElement`/`textContent`); hàm `loadDiag()` gọi `api("/admin/storage")`, chạy cùng lúc với `loadUsers()` sau khi đăng nhập và sau mỗi thao tác làm đổi dữ liệu; lỗi tải chẩn đoán chỉ hiện chữ "Không tải được chẩn đoán" trong khung, không chặn phần còn lại. Chạy `npm run typecheck`.
- [x] 4. [khó] `tests/admin-portal.spec.ts` → thêm T3 (giữ T1, T2): chạy `npx playwright test tests/admin-portal.spec.ts -g "T3"` rồi `npx playwright test`.

## Test cases
- [x] T1. API admin (có sẵn) — tests/admin-portal.spec.ts
- [x] T2. Portal UI (có sẵn) — tests/admin-portal.spec.ts
- [x] T3. Chẩn đoán lưu trữ — `GET /admin/storage` không token → 401; có token, sau `joinAsHost` với user mới: `backend` là chuỗi bắt đầu bằng "files", `userKeys >= 1`, `users >= 1`, `users <= userKeys`, `skipped` là mảng; mở `/portal`, đăng nhập đúng token thì `#diagBox` hiện chữ "Lưu trữ:" và "hồ sơ user" — tests/admin-portal.spec.ts

## Trạng thái hiện tại
- Bước 1-4 xong (đủ plan): `inspectUsers()` + KEYS fallback trong ShopStore (log 1 dòng mỗi lần liệt kê); `GET /admin/storage`; portal `#diagBox` với `loadDiag()` chạy cùng `loadUsers()` sau đăng nhập và sau mỗi thao tác đổi dữ liệu, lỗi tải chỉ hiện "Không tải được chẩn đoán"; spec T3 trong tests/admin-portal.spec.ts (T1, T2 giữ nguyên).

## Test status
- Lần chạy cuối: `npm run typecheck` PASS (sau mỗi bước 1-4); `npx playwright test tests/admin-portal.spec.ts -g "T3"` → 1 passed; `npx playwright test` → 23 passed (toàn bộ suite, gồm admin-portal T1-T3).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
- Fail chi tiết: không có

## Verify
- T3: PASS (playwright 23/23, typecheck OK). Với Upstash giả lập (SCAN phân trang, 552 user): `/admin/storage` trả backend "Upstash Redis", userKeys/users khớp, skipped rỗng; log server in dòng tóm tắt.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
