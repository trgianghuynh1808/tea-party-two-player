# Task: Vỉ nướng cùng hàng với nồi (nhà hàng)

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Nồi (`r_boil_1`) đang ở cột ngoài, hàng 2 (y=360); vỉ nướng ở cột trong hàng 3 (y=460).
- Đổi thứ tự cột trong của dãy bếp trái: chop, grill, deepfry → vỉ nướng lên hàng 2 cùng hàng với nồi, bếp chiên ngập dầu xuống hàng 3.
- Chỉ đổi dữ liệu bố cục trong `shared/`, cập nhật assertion trong spec bố cục hiện có.

## Mục tiêu
- Trong giao diện nhà hàng, vỉ nướng nằm cùng hàng (cùng y) với nồi.

## Quyết định đã chốt
- Hoán đổi vỉ nướng với bếp chiên ngập dầu (giữ nguyên toạ độ cột, không thêm/bớt trạm).

## Ngữ cảnh
- `shared/src/restaurant.ts` ~dòng 343: 
  ```ts
  const LEFT_INNER: [ProcessId, number][] = [["chop", 1], ["deepfry", 1], ["grill", 1]];
  ```
  Hàng i có y = `MACHINE_TOP_Y + i * MACHINE_PITCH_Y`. `LEFT_OUTER` = fry (hàng 0), boil (hàng 1). Cần đổi thành `["chop",1], ["grill",1], ["deepfry",1]`. Cũng sửa comment "the chop board, the fryer and the grill" cho khớp.
- `tests/restaurant-layout.spec.ts` dòng 102-103 hiện: deepfry `{x:214,y:360}`, grill `{x:214,y:460}` → đổi thành grill y=360, deepfry y=460. Các assert khác (khoảng cách, aisle) không phụ thuộc thứ tự.
- Test thuần Node (không cần `window.__GAME__`), toạ độ station là local-space qua `local()`.

## Plan
- [x] 1. [dễ] `shared/src/restaurant.ts` → `LEFT_INNER`: đổi thứ tự thành chop, grill, deepfry và sửa comment liền trên.
- [x] 2. [vừa] `tests/restaurant-layout.spec.ts` → test bố cục dòng ~102-103: grill y=360, deepfry y=460, thêm assert `local(grill).y === local(boil).y`. Chạy `npx playwright test tests/restaurant-layout.spec.ts` và `npm run typecheck`.
- [x] 3. [dễ] `README.md`: kiểm tra mô tả bố cục bếp nhà hàng (dòng ~63), sửa nếu nhắc vị trí vỉ nướng; ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Vỉ nướng cùng hàng nồi — vỉ nướng và nồi cùng y, bếp chiên không đè — tests/restaurant-layout.spec.ts
  - Setup: không cần trình duyệt; dùng `RESTAURANT_STATIONS` từ `@boba/shared`.
  - Steps: 1. lấy `r_grill_1`, `r_boil_1`, `r_deepfry_1` qua `station()` + `local()`.
  - Assert: grill = {x:214,y:360}; boil = {x:60,y:360}; deepfry = {x:214,y:460}; grill.y === boil.y. Toàn bộ spec bố cục vẫn PASS.

## Trạng thái hiện tại
- Bước 1 xong: `LEFT_INNER` giờ là chop, grill, deepfry; comment cập nhật theo. `npm run typecheck` PASS.
- Bước 2 xong: `tests/restaurant-layout.spec.ts` assert grill `{x:214,y:360}`, deepfry `{x:214,y:460}` và `grill.y === boil.y`. `npx playwright test tests/restaurant-layout.spec.ts` 11/11 PASS; `npm run typecheck` PASS.
- Bước 3 xong — Docs checked: `README.md` không nhắc vị trí vỉ nướng; đã bỏ mục "♨️ oven" đã bị xoá khỏi `RESTAURANT_STATIONS` trong danh sách cooker. `npm run typecheck` PASS.
- Lưu ý: ngoài phạm vi "vị trí vỉ nướng", README còn liệt kê lò nướng (oven) không còn tồn tại nên đã xoá cho khớp code.
- Selectors: không có (chỉ đổi dữ liệu bố cục, spec và README, không tạo/đổi giao diện).

## Test status
- Lần chạy cuối: bước 3 — `npm run typecheck` PASS (bước docs, không có lệnh test riêng).
- Kết quả từng test:
  - T1: PASS (tests/restaurant-layout.spec.ts — edge-layout T1)
- Fail chi tiết:

## Verify
- Đổi chỉ dữ liệu bố cục (không UI mới): chạy cả bộ e2e 53/53 PASS, `npm run typecheck` PASS.
- T1: PASS (grill cùng y với nồi, deepfry xuống hàng dưới).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
