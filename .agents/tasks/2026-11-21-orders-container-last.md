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
- [x] 3. [vừa] `client/src/testHook.ts` (mới): export type `GameTestHook`, `isTestMode` (đọc `?test=1` một lần) và `installTestHook(room)` (chỉ chạy khi `isTestMode`, gán `window.__GAME__`; khai báo `declare global { interface Window { __GAME__?: GameTestHook } }`).
- [x] 4. [dễ] `client/src/main.ts`: giữ param `test=1` trong `setUrl`; gọi `installTestHook(room)` trong `startGame`; xoá `window.__GAME__` ở chỗ rời phòng (cùng chỗ `ordersPanel?.destroy()`).
- [x] 5. [vừa] `tests/helpers.ts` (mới): `joinAsHost(page, username)` — mở `/?test=1`, nhập tên (`#username-input`, submit `#name-form`), bấm `#create-btn`, chờ `window.__GAME__`; `startRestaurantShift(page)` — `page.evaluate` gọi `__GAME__.send("start_shift", { venue: "restaurant" })`, chờ `#orders-panel .order .part-into`.
- [x] 6. [vừa] `tests/orders-panel.spec.ts` (mới): viết T1–T3 theo mục "Test cases", username duy nhất `p1-${Date.now()}`; tick T1–T3 khi spec đã tồn tại.
- [ ] 7. [dễ] Chạy `npm run typecheck` + `npx playwright test`, ghi kết quả từng test (T1–T3) vào "Test status".

## Test cases
- [x] T1. Vật chứa là bước cuối — `.part-into` là con cuối của `.parts` trong mỗi `.order-drink`, sau mọi `.part` — tests/orders-panel.spec.ts
- [x] T2. Chữ hiển thị đúng — text của `.part-into` khớp `/^(🍽️|🥣|🥤) Bày ra (đĩa|tô|ly)$/`, và panel Đơn hàng không còn chứa "Cầm" / "đi gom" — tests/orders-panel.spec.ts
- [x] T3. Separator nét đứt — computed `border-top-style` của `.part-into` là `dashed` (width 1px) — tests/orders-panel.spec.ts

## Trạng thái hiện tại
Code đã xong (bước 1 commit 70dfe04, bước 2 separator CSS, bước 3 commit c3e782f: `client/src/testHook.ts` có `GameTestHook`, `isTestMode` (?test=1, đọc 1 lần lúc load), `installTestHook(room)`, `declare global Window.__GAME__`, kèm `TEST_MODE_PARAM` cho bước 4). Bước 4 xong: `client/src/main.ts` giữ `?test=1` trong `setUrl`, gọi `installTestHook(room)` đầu `startGame`, `delete window.__GAME__` trong `stopGame` (cùng chỗ `ordersPanel?.destroy()`). Bước 5 xong: `tests/helpers.ts` có `joinAsHost(page, username)` (mở `/?test=1`, nhập tên, submit `#name-form`, bấm `#create-btn`, chờ `window.__GAME__` qua `waitForFunction`) và `startRestaurantShift(page)` (`page.evaluate` gọi `__GAME__.send("start_shift", { venue: "restaurant" })`, chờ `#orders-panel .order .part-into`, timeout 20s vì đơn đầu sau ~2s; cast `window.__GAME__` inline trong callback vì evaluate không hỗ trợ closure). Bước 6 xong (commit 339c1ef): `tests/orders-panel.spec.ts` có 3 test T1–T3, mỗi test `joinAsHost` với username duy nhất `p1-${Date.now()}-${seq++}` rồi `startRestaurantShift`; T1 dùng `evaluateAll` trên `.order-drink .parts` kiểm `.part-into` là con cuối và đứng sau mọi `.part` (compareDocumentPosition); T2 kiểm text từng `.part-into` khớp regex `^(\u{1F37D}\u{FE0F}|\u{1F963}|\u{1F964}) Bày ra (đĩa|tô|ly)$/u` (icon viết bằng codepoint escape vì plate có variation selector FE0F) và `#orders-panel` không chứa "Cầm" / "đi gom" (`not.toContainText`); T3 kiểm computed `border-top-style: dashed` + `border-top-width: 1px` của mọi `.part-into`. Chạy lần này: `npm run typecheck` PASS, `npx playwright test` 3/3 PASS (T1–T3). Còn thiếu: bước 7 (đã chạy typecheck + test khi làm bước 6 nhưng chưa tick).

## Test status
- Lần chạy cuối: 2026-11-21 (sau bước 6, kèm commit 339c1ef) — `npm run typecheck` PASS; `npx playwright test` 3 passed (15.0s), exit 0.
- Kết quả từng test:
  - T1: PASS — `tests/orders-panel.spec.ts:14` "T1: the container line is the last step of every restaurant recipe" (4.0s)
  - T2: PASS — `tests/orders-panel.spec.ts:41` "T2: the container line reads '<icon> Bày ra <container>' and the old wording is gone" (3.4s)
  - T3: PASS — `tests/orders-panel.spec.ts:57` "T3: the container line is separated by a dashed top border" (3.4s)
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
