# Task: Playwright dùng cổng riêng (server 2568, client 5174)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- `npx playwright test` luôn bật server riêng cổng 2568 và client riêng cổng 5174, `reuseExistingServer: false`, nên không bao giờ đụng dev server (2567/5173) của người dùng.
- Client chạy bởi Playwright nối đúng server 2568 (không phải 2567).
- Mọi spec đang dùng cổng cứng (2567/5173) chuyển sang cổng test.
- `npm run dev` vẫn dùng 2567/5173 như cũ.

## Quyết định đã chốt
- Cổng test: server 2568, client 5174, đặt ở một chỗ duy nhất `tests/ports.ts`.
- Client nhận cổng qua env `CLIENT_PORT` (mặc định 5173) và `strictPort: true`; server dùng env `PORT` có sẵn.
- Client trỏ server test bằng env `VITE_SERVER_URL` (đã được `client/src/main.ts` hỗ trợ).
- Không đổi `SERVER_PORT` trong `shared/` (vẫn là cổng dev).
- Dữ liệu vẫn ở `server/data` (helpers ghi file vào đó), không đổi.

## Ngữ cảnh
- `playwright.config.ts`: `use.baseURL`, và `webServer: [{command:'npm run dev:server', url:'http://localhost:2567/health', reuseExistingServer:true, env:{...process.env, ADMIN_TOKEN:'test-admin-token'}}, {command:'npm run dev:client', url:'http://localhost:5173', reuseExistingServer:true}]`.
- `client/vite.config.ts`: `server: { port: 5173, host: true }`.
- `client/src/main.ts:79`: `import.meta.env.VITE_SERVER_URL || (DEV ? `${protocol}//${hostname}:${SERVER_PORT}` : location.origin)`.
- `server/src/index.ts:23`: `const port = Number(process.env.PORT) || SERVER_PORT;`.
- Spec dùng cổng cứng: `tests/gadgets-tabletop.spec.ts:21`, `tests/custom-decor.spec.ts:13`, `tests/admin-portal.spec.ts:16`, `tests/build-parity.spec.ts:28`, `tests/mobile-build-ui.spec.ts:12` và `:41`, đều có `const SERVER = `http://localhost:${SERVER_PORT}``; `tests/mobile-recipe-modal.spec.ts:16` có `baseURL: "http://localhost:5173"`. Xoá `SERVER_PORT` khỏi import `@boba/shared` nếu không còn dùng.
- Sự thật để test: Playwright không import được module TS của server; `tests/helpers.ts` ghi file save vào `server/data`. `GET /health` trả OK khi server sẵn sàng; `GET /rooms` là endpoint HTTP công khai.
- Chạy tay kiểm tra: dev server của bạn ở 2567/5173 không được bị động tới khi chạy test.

## Plan
- [x] 1. [dễ] `client/vite.config.ts` → đọc `Number(process.env.CLIENT_PORT) || 5173` cho `server.port`, thêm `strictPort: true`.
- [x] 2. [vừa] `tests/ports.ts` → tạo mới, export `TEST_SERVER_PORT = 2568`, `TEST_CLIENT_PORT = 5174`, `TEST_SERVER_URL`, `TEST_CLIENT_URL`. Sửa `playwright.config.ts`: import từ `./tests/ports`, `baseURL = TEST_CLIENT_URL`; webServer server: `url: TEST_SERVER_URL + '/health'`, `reuseExistingServer: false`, env thêm `PORT: String(TEST_SERVER_PORT)`; webServer client: `url: TEST_CLIENT_URL`, `reuseExistingServer: false`, `env: { ...process.env, CLIENT_PORT: String(TEST_CLIENT_PORT), VITE_SERVER_URL: TEST_SERVER_URL }`. Cập nhật comment đầu file cho đúng cổng.
- [x] 3. [vừa] `tests/gadgets-tabletop.spec.ts` → trong 6 spec (`gadgets-tabletop`, `custom-decor`, `admin-portal`, `build-parity`, `mobile-build-ui`, `mobile-recipe-modal`): thay `SERVER` bằng `TEST_SERVER_URL` từ `./ports`, thay `baseURL: "http://localhost:5173"` bằng `TEST_CLIENT_URL`, bỏ `SERVER_PORT` khỏi import nếu không dùng nữa. Chạy `npm run typecheck`.
- [x] 4. [vừa] `tests/test-ports.spec.ts` → viết spec T1 (xem Test cases). Chạy `npx playwright test tests/test-ports.spec.ts -g "T1"`.
- [x] 5. [dễ] `README.md` → mục Dev options/test: ghi `npx playwright test` dùng cổng riêng 2568/5174, không dùng lại dev server; cập nhật `AGENTS.md` mục Commands/Testing Rules cùng ý (dòng `npx playwright test` hiện ghi "reusing running ones" → sửa cho đúng). Nếu README không có chỗ hợp, thêm một dòng ngắn vào mục Dev options.
- [x] 6. [dễ] `playwright.config.ts` → chạy cả bộ `npx playwright test` một lần, ghi kết quả vào Test status; nếu có spec fail vì cổng, sửa đúng chỗ đó.

## Test cases
- [x] T1. Test chạy trên cổng riêng — xác nhận client/server test ở 2568/5174 và client nối đúng server test — tests/test-ports.spec.ts
  - Setup: 1 phiên, username `p1-${Date.now()}`, không cần tiền.
  - Steps: 1. `expect(page.url())` sau `joinAsHost(page, username)` · 2. `page.request.get(TEST_SERVER_URL + "/health")` · 3. `page.request.get(TEST_SERVER_URL + "/rooms")` và tìm phòng vừa tạo.
  - Assert: URL của page bắt đầu bằng `http://localhost:5174`; `/health` trả status 200; `/rooms` (cổng 2568) chứa `room.roomId` của phòng vừa tạo (`window.__GAME__.room.roomId`), chứng tỏ client dùng server 2568.

## Trạng thái hiện tại
- Bước 1 xong: `client/vite.config.ts` đọc `CLIENT_PORT` (mặc định 5173) và bật `strictPort: true`. `npm run typecheck` pass.
- Bước 2 xong: thêm `tests/ports.ts` (2568/5174), `playwright.config.ts` dùng `TEST_CLIENT_URL` làm `baseURL`, hai webServer chạy cổng test với `reuseExistingServer: false`, truyền `PORT`, `CLIENT_PORT`, `VITE_SERVER_URL`. `npm run typecheck` pass.
- Bước 3 xong: 6 spec dùng `TEST_SERVER_URL`/`TEST_CLIENT_URL` từ `./ports`, bỏ `SERVER_PORT` khỏi import `@boba/shared`, không còn cổng cứng 2567/5173 trong `tests/`. `npm run typecheck` pass.
- Bước 4 xong: `tests/test-ports.spec.ts` có T1 (page ở cổng 5174, `/health` 200, `/rooms` cổng 2568 chứa `roomId` của phòng vừa tạo). Typecheck pass, T1 pass.
- Bước 5 xong: README mục Dev options thêm dòng `npx playwright test` dùng cổng 2568/5174; AGENTS.md Commands + Testing Rules nói đúng cổng riêng và `reuseExistingServer: false` (bỏ ghi chú "tests/ chưa có spec" đã lỗi thời). Typecheck pass.
- Bước 6 xong: chạy cả bộ `npx playwright test` trên cổng test 2568/5174 — 47 passed, 0 failed (dòng ✘ của `mobile-build-ui` T1 là `test.fail()` cố ý cho bug badge ⟳ đã biết, được tính là pass). Không spec nào fail vì cổng. Docs checked: README/AGENTS đã cập nhật ở bước 5, không còn gì lỗi thời.

## Test status
- Lần chạy cuối: `npx playwright test` (bước 6, cả bộ) — 47 passed / 0 failed; server 2568 + client 5174, `reuseExistingServer: false`
- Kết quả từng test:
  - T1: PASS (`tests/test-ports.spec.ts`, chạy riêng ở bước 4 và trong cả bộ ở bước 6)
- Fail chi tiết: không có. (`mobile-build-ui` T1 là `test.fail()` cho bug badge ⟳ tràn 4px đã biết từ task-04, không liên quan cổng.)

## Verify
- Typecheck PASS; cả bộ `npx playwright test` 47 passed trên cổng 2568/5174 (chạy lại bởi Tech Lead).
- T1: PASS. Không cần xem giao diện (không đổi UI).
- Review: không có finding blocking; docs README/AGENTS đã cập nhật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
