# Task: Đưa dòng tô/đĩa/ly xuống cuối công thức trong đơn nhà hàng

## Mục tiêu
Trong panel Đơn hàng (nhà hàng), dòng chỉ vật chứa (tô/đĩa/ly) hiện ở đầu nên dễ bị hiểu là bước đầu. Đưa xuống sau các bước làm.

## Quyết định đã chốt
- Chữ hiển thị: "<icon> Bày ra <tên vật chứa viết thường>" (vd "🍽️ Bày ra đĩa"), bỏ "Cầm … đi gom:".
- Chỉ đổi thứ tự + chữ + style nhẹ, không đổi logic game.
- `window.__GAME__` chỉ bật khi URL có `?test=1` (đọc 1 lần lúc load, giữ qua `setUrl` như `forceTouch`).
- Hook tối thiểu, mở rộng được: `window.__GAME__ = { room, send(type, payload?), state }` (`send` = `room.send`, dùng `Messages.*` từ shared; `state` = `room.state`). Không thêm helper theo tính năng; task e2e foundation sau này chỉ thêm field/hàm vào cùng object, type `GameTestHook` nằm trong `client/src/testHook.ts`.
- Test bật ca nhà hàng bằng `__GAME__.send("start_shift", { venue: "restaurant" })` (server nhận từ bất kỳ client, không cần 2 người; đơn đầu sau ~2s), rồi chờ `.order .part-into`. Không script gameplay thật.

## Plan
- [x] 1. [dễ] `client/src/ui/OrdersPanel.ts`, hàm `recipeSteps`: chuyển dòng `parts.append(span("part-into", ...))` xuống sau vòng `for (const part of dish.parts)` (trước `return parts`); đổi text thành `${CONTAINER_ICONS[dish.container]} Bày ra ${CONTAINERS[dish.container].label.toLowerCase()}`.
- [x] 2. [dễ] `client/src/style.css`, rule `.order .part-into`: thêm `margin-top: 2px; padding-top: 3px; border-top: 1px dashed #d9cbb8;` để tách khỏi các bước.
- [ ] 3. [vừa] `client/src/testHook.ts` (mới): export type `GameTestHook`, `isTestMode` (đọc `?test=1` một lần) và `installTestHook(room)` (chỉ chạy khi `isTestMode`, gán `window.__GAME__`; khai báo `declare global { interface Window { __GAME__?: GameTestHook } }`).
- [ ] 4. [dễ] `client/src/main.ts`: giữ param `test=1` trong `setUrl`; gọi `installTestHook(room)` trong `startGame`; xoá `window.__GAME__` ở chỗ rời phòng (cùng chỗ `ordersPanel?.destroy()`).
- [ ] 5. [vừa] `tests/helpers.ts` (mới): `joinAsHost(page, username)` — mở `/?test=1`, nhập tên (`#username-input`, submit `#name-form`), bấm `#create-btn`, chờ `window.__GAME__`; `startRestaurantShift(page)` — `page.evaluate` gọi `__GAME__.send("start_shift", { venue: "restaurant" })`, chờ `#orders-panel .order .part-into`.
- [ ] 6. [vừa] `tests/orders-panel.spec.ts` (mới): viết T1–T3 theo mục "Test cases", username duy nhất `p1-${Date.now()}`; tick T1–T3 khi spec đã tồn tại.
- [ ] 7. [dễ] Chạy `npm run typecheck` + `npx playwright test`, ghi kết quả từng test (T1–T3) vào "Test status".

## Test cases
- [ ] T1. Vật chứa là bước cuối — `.part-into` là con cuối của `.parts` trong mỗi `.order-drink`, sau mọi `.part` — tests/orders-panel.spec.ts
- [ ] T2. Chữ hiển thị đúng — text của `.part-into` khớp `/^(🍽️|🥣|🥤) Bày ra (đĩa|tô|ly)$/`, và panel Đơn hàng không còn chứa "Cầm" / "đi gom" — tests/orders-panel.spec.ts
- [ ] T3. Separator nét đứt — computed `border-top-style` của `.part-into` là `dashed` (width 1px) — tests/orders-panel.spec.ts

## Trạng thái hiện tại
Code đã xong (bước 1 commit 70dfe04, bước 2 thêm separator CSS). Còn thiếu hook `window.__GAME__` (`?test=1`) và spec e2e kiểm tra T1–T3 (bước 3–7).

## Test status
- Lần chạy cuối: 2026-11-21 — `npm run typecheck` PASS; `npx playwright test` không có spec ("No tests found", như mong đợi vì `tests/` trống).
- Kết quả từng test:
  - T1: chưa viết
  - T2: chưa viết
  - T3: chưa viết
- Fail chi tiết: không.

## Verify
<!-- Bước Verify tự điền: từng kịch bản đã kiểm tra trên trình duyệt, PASS/FAIL, screenshot, lỗi phát hiện, dòng kết luận cuối cùng. -->

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
