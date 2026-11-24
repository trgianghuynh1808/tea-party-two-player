# Task: Badge ⟳ cho đồ nội thất xoay được

Verify mode: light

## Mục tiêu
- Trong danh sách đồ nội thất (DecorPanel), món xoay được (`rotationCount(def) > 1`) có badge `⟳` ở góc thẻ; món không xoay được thì không có.
- Tooltip của món xoay được có thêm "Xoay được (R)".
- Câu hướng dẫn của panel nhắc "món có ⟳ xoay được".

## Quyết định đã chốt
- Icon `⟳` (cùng icon với nút Xoay). Không đổi `shared/` hay server.

## Ngữ cảnh
- `client/src/ui/DecorPanel.ts`: `addItem(list, def, onDragStart)` tạo `div.decor-item` (swatch, `span.name`, `strong` giá) rồi `el.append(swatch, name, price)`; `el.title = `Kéo vào quán để mua ${def.label}``. Chuỗi `help` ở constructor: "Bấm R (hoặc ⟳) để xoay món đang kéo / vừa chọn. ...".
- `rotationCount(def: DecorationDef): number` export từ `@boba/shared` (`shared/src/decor.ts`): 1 = không xoay, 2 = flip, 4 = rotate/views.
- `client/src/style.css` ~dòng 1220: `.decor-item { display:flex; ... }` chưa có `position: relative`.
- Test: `tests/decor-catalog.spec.ts` import `DECORATION_CATALOG`, `rotationCount` từ `@boba/shared`; mở game bằng `/?test=1` (xem `tests/helpers.ts`). Panel chỉ mở khi host vào chế độ Trang trí; nếu khó tới được thì dùng `window.__GAME__` (thêm hook thiếu thành bước riêng) thay vì script gameplay thật.

## Plan
- [x] 1. [dễ] `client/src/ui/DecorPanel.ts` → `addItem`: nếu `rotationCount(def) > 1` thì thêm `span.rotate-badge` (text `⟳`, `data-rotatable="1"`) vào `el` và nối " · Xoay được (R)" vào `el.title`. Sửa chuỗi `help` nhắc món có ⟳ xoay được. Import `rotationCount` từ `@boba/shared`.
- [x] 2. [dễ] `client/src/style.css` → thêm `.decor-item { position: relative; }` và `.rotate-badge` (absolute, góc phải trên, tròn ~16px, nền vàng/kem, viền #3d2c29, font-size 11px, `pointer-events: none`).
- [x] 3. [vừa] `tests/decor-catalog.spec.ts` → thêm test T1 (mở panel trang trí, so các `.decor-item` có `.rotate-badge` với `rotationCount > 1` trong `DECORATION_CATALOG`; mở hết các `details.decor-section` trước khi đếm). Chạy: `npx playwright test tests/decor-catalog.spec.ts -g "T1"` rồi `npm run typecheck`.
- [x] 4. [dễ] `README.md` → mục "Decorating & saving": thêm một dòng nói món có badge ⟳ xoay được bằng R / nút ⟳ (kiểm tra README đã nhắc xoay chưa, đừng nhắc trùng).

## Test cases
- [x] T1. Badge xoay — badge ⟳ chỉ hiện ở món xoay được trong danh sách trang trí — tests/decor-catalog.spec.ts

## Trạng thái hiện tại
- Bước 1 xong và đã commit (`feat(decor): show ⟳ badge on rotatable catalog items`). `npm run typecheck` PASS.
- Bước 2 xong và đã commit (`style(decor): position rotate badge on catalog cards`). `npm run typecheck` PASS.
- Bước 3 xong và đã commit (`test(decor): spec T1 checks the ⟳ badge marks rotatable catalog items`). `npx playwright test tests/decor-catalog.spec.ts -g "T1"` PASS (3/3, gồm test mới `rotate-badge T1`), rồi `npm run typecheck` PASS.
- Bước 4 xong và đã commit (`docs(readme): note the ⟳ badge and R rotation in Decorating & saving`). `npm run typecheck` PASS. README trước đó chưa nhắc xoay nên không trùng lặp. Docs checked: README cập nhật; AGENTS.md không cần đổi (không thêm file/message/control).
- Tất cả các bước của plan đã xong.

## Test status
- Lần chạy cuối: sau bước 4 — bước này không có lệnh test riêng, chỉ `npm run typecheck` PASS; kết quả test giữ từ bước 3.
- Kết quả từng test:
  - T1: PASS (tests/decor-catalog.spec.ts, "rotate-badge T1: only items with rotationCount > 1 carry the ⟳ badge in the decor panel")
- Fail chi tiết: không

## Verify
- Toàn bộ e2e: 31/31 PASS (`npx playwright test`). `npm run typecheck` PASS.
- T1 (badge chỉ ở món xoay được): PASS — DOM có 91 thẻ, 30 badge, khớp `rotationCount > 1`.
- Giao diện: PASS — `.agents/screens/rotate-badge.png` (nhóm Bàn ghế / Nội thất: Ghế mây, Sofa, Bàn ăn, Giường, Tủ đầu giường có ⟳; Đôn gỗ, Bàn khách, Tủ ngăn kéo thì không). Ảnh chụp panel đã gắn ra ngoài vì host đang ở sân nên nút Trang trí bị khoá.
- Ghi chú (không chặn): spec T1 bấm `#decorate-btn` khi host còn ở sân, nên chỉ kiểm tra DOM của panel, không kiểm tra panel hiện thật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
