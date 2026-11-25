# Task: Popup báo có phiên bản mới (bắt buộc reload)

APPROVED_BY_USER

Verify mode: light

## Mục tiêu
- Khi server/host có bản client mới hơn bản đang chạy trong trình duyệt, hiện popup "Có phiên bản mới" với nút "Tải lại".
- Popup không tắt được (không nút đóng, Esc và bấm nền đều vô tác dụng); chỉ nút Tải lại (reload trang) mới làm nó biến mất.
- Nếu đang ở bản mới nhất thì không hiện gì.

## Quyết định đã chốt
- Cách phát hiện: mỗi lần build sinh một `BUILD_ID`; client nhúng id đó (`__BUILD_ID__`) và định kỳ tải `version.json` (cùng base URL, `cache: "no-store"`) do build xuất ra. Khác id → hiện popup. Cách này chạy được cả trên Render (cùng origin) lẫn GitHub Pages (BASE_PATH), không cần đụng server/ hay shared/.
- Kiểm tra: khi tải trang, mỗi 60 giây, và khi tab được focus lại (`visibilitychange`). Lỗi mạng/404/JSON hỏng thì bỏ qua im lặng (không hiện popup).
- Popup hiện được cả ở lobby lẫn trong game (gắn vào `document.body`, z-index cao nhất). Trong dev (`vite dev`) `__BUILD_ID__ = "dev"` và middleware phục vụ `/version.json` = `{"id":"dev"}` nên không bao giờ hiện popup nếu không bị giả lập.
- Không lưu/đổi state game; reload là reload thường (`location.reload()`).

## Ngữ cảnh
- `client/vite.config.ts` hiện chỉ có `base: process.env.BASE_PATH || "/"` và `server`. Cần thêm plugin Vite nhỏ + `define`.
- Client: `client/src/main.ts` (import ở dòng 1–41, `import "./style.css"` dòng 1), `client/src/style.css`, `client/src/testHook.ts` (`isTestMode`, `TEST_MODE_PARAM`), tsconfig `types: ["vite/client"]` nên khai báo global `declare const __BUILD_ID__: string;` trong file `.d.ts` mới dưới `client/src/`.
- URL version: `${import.meta.env.BASE_URL}version.json` (BASE_URL luôn kết thúc bằng `/`).
- Plugin gợi ý:
```ts
const buildId = process.env.BUILD_ID || `${Date.now().toString(36)}`;
function versionPlugin(isBuild: boolean): Plugin {
  const id = isBuild ? buildId : "dev";
  return {
    name: "boba-version",
    generateBundle() { this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ id }) }); },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split("?")[0].endsWith("/version.json")) {
          res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store");
          res.end(JSON.stringify({ id })); return;
        }
        next();
      });
    },
  };
}
// export default defineConfig(({ command }) => ({ ..., define: { __BUILD_ID__: JSON.stringify(command === "build" ? buildId : "dev") }, plugins: [versionPlugin(command === "build")] }))
```
- Module mới `client/src/updateChecker.ts` export `initUpdateChecker(): void`: gọi một lần từ `main.ts` ngay khi khởi động (trước lobby). Trong `isTestMode` gán thêm `window.__UPDATE__ = { check: () => Promise<void> }` (khai báo `declare global { interface Window { __UPDATE__?: { check(): Promise<void> } } }` trong chính file này).
- DOM popup (để test bám vào): `<div id="update-modal" class="update-backdrop" role="alertdialog" aria-modal="true">` chứa tiêu đề "Có phiên bản mới 🎉", câu "Bản cập nhật vừa ra mắt. Hãy tải lại để tiếp tục chơi.", và `<button id="update-reload-btn" class="btn primary">Tải lại</button>`. Không có nút đóng; chặn `keydown` Escape (capture, `preventDefault` + `stopPropagation`) khi popup đang hiện; click nền không làm gì. Chỉ tạo một popup (nếu đã có thì bỏ qua).
- `.btn`, `.btn.primary` đã có trong `style.css`; thêm `.update-backdrop` (fixed, inset 0, flex center, nền tối mờ, z-index 99999) và hộp nội dung cùng phong cách card hiện có.
- Sự thật để test: Playwright config dùng client port 5174 (baseURL), chạy `vite dev` nên `__BUILD_ID__ === "dev"`. Giả lập bản mới bằng `page.route("**/version.json*", r => r.fulfill({ json: { id: "new-build" } }))`, sau đó gọi `await page.evaluate(() => window.__UPDATE__!.check())`. Chỉ cần mở `/?test=1` (lobby), không cần vào phòng hay tạo user/tiền. Test không import được module TS của client/server.

## Plan
- [x] 1. [vừa] `client/vite.config.ts` → thêm `versionPlugin` (emit `version.json` khi build, middleware `/version.json` khi dev) và `define: { __BUILD_ID__ }` như snippet ở Ngữ cảnh; tạo `client/src/buildInfo.d.ts` với `declare const __BUILD_ID__: string;`. Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/updateChecker.ts` → tạo `initUpdateChecker()` (fetch `version.json` no-store, so với `__BUILD_ID__`, hiện popup không tắt được, nút `#update-reload-btn` gọi `location.reload()`, poll 60s + `visibilitychange`, hook `window.__UPDATE__.check` khi `isTestMode`); thêm CSS `.update-backdrop`/hộp nội dung vào `client/src/style.css`; gọi `initUpdateChecker()` trong `client/src/main.ts` khi khởi động. Chạy `npm run typecheck`. Ghi dòng `Selectors:` vào "Trạng thái hiện tại" (id/role thực tế đã dùng) cho bước test đọc.
- [x] 3. [vừa] `tests/update-popup.spec.ts` → viết T1–T3 theo "Test cases", đọc dòng `Selectors:` trong "Trạng thái hiện tại" (các id ở trên chỉ là ví dụ). Chạy `npx playwright test tests/update-popup.spec.ts`.
- [x] 4. [dễ] `README.md` → thêm vài dòng ở mục Dev options/Play online: popup tự báo khi có bản mới sau khi deploy (dựa vào `version.json` do build tạo, kiểm tra mỗi 60s); `AGENTS.md` → thêm `client/src/updateChecker.ts` vào Codebase Map. Ghi "Docs checked" vào "Trạng thái hiện tại".

## Test cases
- [x] T1. Bản mới nhất không hiện popup — `version.json` trùng id → không có popup — tests/update-popup.spec.ts
  - Setup: 1 phiên, không route giả.
  - Steps: 1. `page.goto("/?test=1")` · 2. `await page.evaluate(() => window.__UPDATE__!.check())`
  - Assert: `#update-modal` có count 0 sau cả hai bước.
- [x] T2. Có bản mới thì hiện popup — id khác → popup + nút Tải lại — tests/update-popup.spec.ts
  - Setup: 1 phiên; `page.route("**/version.json*", r => r.fulfill({ json: { id: "new-build" } }))` đặt trước khi gọi check.
  - Steps: 1. `goto("/?test=1")` · 2. gọi `window.__UPDATE__.check()`
  - Assert: `#update-modal` visible; chứa chữ "Có phiên bản mới"; `#update-reload-btn` visible; không có nút đóng nào khác trong popup (`#update-modal button` count 1).
- [x] T3. Popup không tắt được, chỉ reload mới mất — Esc/bấm nền vô tác dụng, bấm Tải lại thì trang reload — tests/update-popup.spec.ts
  - Setup: như T2 (popup đang hiện); đặt `window.__marker = 1` bằng `page.evaluate`.
  - Steps: 1. `page.keyboard.press("Escape")` · 2. click vào `#update-modal` tại góc (position {x:5,y:5}) · 3. `page.unroute("**/version.json*")` rồi click `#update-reload-btn` · 4. đợi load xong
  - Assert: sau bước 1–2 `#update-modal` vẫn visible; sau bước 3–4 `window.__marker` là `undefined` (trang đã reload) và `#update-modal` count 0 (vì đã bỏ route nên id trùng).

## Trạng thái hiện tại
- Bước 1 xong (commit 2246cc2): `client/vite.config.ts` có `versionPlugin` (emit `version.json` khi build, middleware dev trả `{"id":"dev"}`) + `define: { __BUILD_ID__ }`; tạo `client/src/buildInfo.d.ts`. `npm run typecheck` PASS.
- Bước 2 xong (commit 2d1bfd8): `client/src/updateChecker.ts` có `initUpdateChecker()` — check khi tải trang, poll 60s, `visibilitychange`; popup `#update-modal` không có nút đóng, chặn Escape (capture), click nền vô tác dụng, `#update-reload-btn` reload; `window.__UPDATE__.check` khi `isTestMode`. CSS `.update-backdrop`/`.update-card` thêm vào cuối `client/src/style.css`. `client/src/main.ts` gọi `initUpdateChecker()` ngay sau imports (trước lobby). `npm run typecheck` PASS.
- Selectors: #update-modal (div.update-backdrop, role="alertdialog"), #update-reload-btn (button.btn.primary) — tạo động trong client/src/updateChecker.ts; .update-backdrop, .update-card (client/src/style.css); test hook window.__UPDATE__.check() (client/src/updateChecker.ts, chỉ khi ?test=1)
- Bước 3 xong: tạo `tests/update-popup.spec.ts` (T1–T3) theo Test cases, dùng `window.__UPDATE__.check()` sau `?test=1` và route giả `version.json` cho bản mới. `npm run typecheck` PASS; `npx playwright test tests/update-popup.spec.ts` → 3 passed.
- Bước 4 xong: `README.md` mục Dev options thêm ghi chú popup "Có phiên bản mới" (dựa vào `version.json` của build, kiểm tra khi tải trang/mỗi 60s/khi focus lại, dev báo `"dev"`); `AGENTS.md` Codebase Map thêm `client/src/updateChecker.ts`. Docs checked: dòng `client/src/updateChecker.ts` trong Codebase Map và ghi chú Dev options là đủ, các mục khác không đổi. `npm run typecheck` PASS.

## Test status
- Lần chạy cuối: `npm run typecheck` PASS (cả 4 bước); `npx playwright test tests/update-popup.spec.ts` → 3 passed (bước 4 chỉ sửa docs, không có lệnh test cụ thể).
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
  - T3: PASS
- Fail chi tiết:

## Verify
- T1 PASS, T2 PASS, T3 PASS (cả bộ e2e: 53 passed; typecheck PASS).
- Popup hiển thị đúng (ảnh: .agents/screenshots/task-10-update-popup.png): PASS.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
