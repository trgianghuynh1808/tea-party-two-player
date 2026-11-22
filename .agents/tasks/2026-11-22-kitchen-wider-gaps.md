# Task: Nới khe giữa các máy bếp và đổi chỗ thớt

Verify mode: light

## Mục tiêu
- Khe dọc giữa hai máy cùng cột rộng ≥ 48px (hiện 30px) để người chơi (bán kính 18) đi lọt qua các ngách.
- Thớt 1 (`r_chop_1`) chuyển từ cột ngoài (rìa) sang cột trong của galley trái; lò nướng (`r_bake_1`) lấy chỗ thớt cũ ở đầu cột ngoài.
- Không đổi id trạm, không đổi gameplay, các máy vẫn tới được và không đè nhau.

## Quyết định đã chốt
- Bước dọc `MACHINE_PITCH_Y` 90 → 110 (máy cao 60 → khe 50px). `MACHINE_TOP_Y` giữ 270 → 4 hàng ở y = 270, 380, 490, 600 (đáy hàng cuối 630, cách hàng dưới ≥ 59px). Áp dụng cho cả cột phải (3 máy).
- Hoán đổi `chop 1` ↔ `bake 1`: cột ngoài (x=60) từ trên xuống: bake1, fry1, fry2, boil1; cột trong (x=214): chop1, deepfry1, grill1, boil2.
- Cột ngang (x = 60 / 214 / 1340) và lối đi 70px giữa hai cột giữ nguyên.

## Ngữ cảnh
- `shared/src/restaurant.ts` ~dòng 283-300 (comment layout + hằng số) và ~353-366:
  ```ts
  const MACHINE_TOP_Y = 270;
  const MACHINE_PITCH_Y = 90;   // -> 110
  const LEFT_OUTER: [ProcessId, number][] = [["chop",1],["fry",1],["fry",2],["boil",1]]; // -> bake1 đầu cột
  const LEFT_INNER: [ProcessId, number][] = [["bake",1],["deepfry",1],["grill",1],["boil",2]]; // -> chop1 đầu cột
  ```
  Comment đầu khối ghi "90px pitch (60px machines, 30px gaps)" và doc-comment của `LEFT_OUTER`/`LEFT_INNER` ("the chop board, the pans, a pot" / "the oven, ...") cần sửa cho khớp.
- `tests/restaurant-layout.spec.ts`:
  - ~dòng 80: kiểm `r_bake_1` x < 400; ~dòng 95: `expect(lower.top - upper.bottom ...).toBeGreaterThanOrEqual(24)` (khe dọc) → đổi thành 48.
  - T11 (~dòng 316-324): dùng khe giữa `r_chop_1` và `r_fry_1` ở cột ngoài; chop1 giờ ở cột trong và dưới nó là `r_deepfry_1`. Đổi sang cặp `r_bake_1` (trên) / `r_fry_1` (dưới) ở cột ngoài (hoặc `r_chop_1`/`r_deepfry_1`), chỉnh offset đứng (`bottom + 3`) nếu khe 50px làm kết quả facing khác; mục đích test (facing thắng nearest) giữ nguyên.
  - Test 2 người (~dòng 484-505) dùng `r_chop_1`: `chopStand = [rectOf(chop1).right + 18, local(chop1).y]` đứng bên phải thớt cũ ở cột ngoài; chop1 giờ ở cột trong (x=214, lối đi nằm bên TRÁI nó) → đứng `rectOf(chop1).left - 18` hoặc bên phải (`right + 18`, ra sảnh giữa), chọn bên phải cho khỏi đổi hướng nhìn nếu test đang dùng "left"; chỉnh hướng nhìn cho khớp.
  - Test "T7" (không đè nhau) và "T2" (tới được mọi trạm) tự thích ứng, chỉ chạy lại.
- `PLAYER_RADIUS = 18`, `INTERACT_RANGE = 70`.

## Plan
- [x] 1. [khó] `shared/src/restaurant.ts` → hằng số layout: `MACHINE_PITCH_Y` = 110; hoán `["chop",1]` với `["bake",1]` giữa `LEFT_OUTER` (bake1 đầu cột) và `LEFT_INNER` (chop1 đầu cột); cập nhật comment đầu khối layout và doc-comment của `LEFT_OUTER`/`LEFT_INNER` ("110px pitch, 50px gaps", chop board nằm cột trong, oven ở cột ngoài). Chạy `npm run typecheck`.
- [x] 2. [khó] `tests/restaurant-layout.spec.ts` → cập nhật theo mục Ngữ cảnh: khe dọc ≥ 48; T11 đổi cặp trạm; test 2 người đổi `chopStand`/hướng nhìn; thêm kiểm `r_chop_1` x == 214 (cột trong) và `r_bake_1` x == 60 (cột ngoài) vào test "edge-layout T1" (T1 hiện có, ~dòng 64-100). Chạy `npx playwright test tests/restaurant-layout.spec.ts -g "edge-layout T1"` rồi `npx playwright test tests/restaurant-layout.spec.ts`.

## Test cases
- [x] T1. Khe rộng và thớt vào cột trong — khe dọc ≥ 48px, `r_chop_1` ở cột trong, `r_bake_1` ở cột ngoài — tests/restaurant-layout.spec.ts ("edge-layout T1")
- [x] T2. Không đè và tới được mọi trạm — các test T7/T2/T11 và test 2 người vẫn PASS sau khi đổi layout — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
- Bước 1 + 2 xong. Layout mới: `MACHINE_PITCH_Y` 110 (khe dọc 50px, hàng y = 270/380/490/600), bake1 đầu cột ngoài (x=60), chop1 đầu cột trong (x=214). Spec đã cập nhật: "edge-layout T1" thêm kiểm `r_chop_1` x==214 / `r_bake_1` x==60 và khe dọc ≥ 48; T11 đổi sang cặp `r_bake_1`/`r_fry_1` với offset đứng `bottom + 18` (khe 50px làm offset +3 cũ sai hướng: 47-30 > 3 nên facing down không thắng; 18 vs 32 thì thắng); test 2 người giữ `chopStand = right + 18` (giờ ra sảnh giữa, x=274) và hướng nhìn "left" theo phương án "chọn bên phải" trong Ngữ cảnh — đã kiểm chứng bằng script tsx (resolveCollisions không đẩy, findNearestStationDef chọn đúng trạm) trước khi chạy test. `npm run typecheck` PASS sau cả 2 bước; `npx playwright test tests/restaurant-layout.spec.ts` 10/10 PASS.

## Test status
- Lần chạy cuối: `npx playwright test tests/restaurant-layout.spec.ts` (sau bước 2) — 10 passed.
- Kết quả từng test:
  - T1: PASS — "edge-layout T1" (khe dọc ≥ 48, `r_chop_1` x==214 cột trong, `r_bake_1` x==60 cột ngoài)
  - T2: PASS — "edge-layout T2" (tới được mọi trạm), T7, T11 (cặp bake1/fry1, facing thắng nearest), T5 + "edge-layout T3" (2 người, chop1 cột trong) đều PASS
- Fail chi tiết: không.

## Verify
- T1, T2: PASS (npx playwright test 15/15, typecheck OK); layout kiểm bằng spec nên không cần screenshot.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
