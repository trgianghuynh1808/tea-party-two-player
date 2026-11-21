# Task: Bỏ chữ "Bàn" trên bàn trống và thu nhỏ nguyên liệu trên trạm bếp

Verify mode: light

## Mục tiêu
1. Các bàn trống (`StationType.Counter`, nhãn "Bàn") không hiện chữ "Bàn" nữa. Các trạm có chức năng (thớt, nồi, chảo, kệ, thùng nguyên liệu...) vẫn giữ nhãn.
2. Món/nguyên liệu đặt lên bàn hoặc bỏ vào nồi/thiết bị bếp (nhà hàng) hiện đang quá to, che hết trạm. Làm nhỏ lại để vẫn thấy được thân trạm.

## Quyết định đã chốt
- Chỉ đổi phía client (hiển thị). Không đổi `label` trong `shared/` (nhãn còn dùng cho text khác).
- Nhãn bị ẩn chỉ với `StationType.Counter`; `DeliveryCounter` giữ nhãn.
- Kích thước món trên trạm nhà hàng: 32 → 22px (hằng mới `KITCHEN_STATION_ITEM_HEIGHT = 22`). Trạm quán trà (ly/cốc) giữ `STATION_CUP_HEIGHT = 32`.
- Thêm vào test hook `stationLabels(): string[]` (nhãn đang hiển thị) để test được text trong canvas.

## Ngữ cảnh
- `client/src/scenes/ShopScene.ts`:
  - `const STATION_CUP_HEIGHT = 32;` (~dòng 204)
  - `private createStations()`: mỗi trạm tạo `this.add.text(def.x, labelTop - ..., def.label + timed, ...)` (nhãn) và
    `const itemCup = new CupView(this, def.x, Math.min(def.y + STATION_CUP_HEIGHT / 2, topSurfaceBottom), STATION_CUP_HEIGHT);`
  - `kitchenStationTexture(def)` trả texture khác null cho trạm bếp nhà hàng (dùng để nhận biết trạm nhà hàng).
  - `StationType.Counter` từ `@boba/shared` (`shared/src/menu.ts`).
- `client/src/testHook.ts`: `GameTestHook = { room, send, state }`, `installTestHook(room)` (gọi ở `client/src/main.ts:432`).
- `tests/helpers.ts`: `joinAsHost(page, username)`, `startRestaurantShift(page)`. Mở game ở `http://localhost:5173/?test=1`.
- `RESTAURANT_STATIONS` có `r_counter_1..6` (label "Bàn"), `STATIONS` có `counter_1..5` (label "Bàn").

## Plan
- [x] 1. [vừa] `client/src/scenes/ShopScene.ts` → `createStations`: (a) không tạo text nhãn khi `def.type === StationType.Counter`; lưu các text nhãn đã tạo vào mảng/Map để lấy được chữ đang hiển thị, thêm method public `stationLabelTexts(): string[]`; (b) thêm hằng `KITCHEN_STATION_ITEM_HEIGHT = 22` và dùng nó thay `STATION_CUP_HEIGHT` khi `kitchenStationTexture(def)` khác null hoặc trạm là bàn nhà hàng `r_counter_*`; chỉnh lại `y` của `itemCup` cho khớp chiều cao mới (vẫn đứng trên mặt bàn/trong nồi). Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/testHook.ts` + `client/src/main.ts` → thêm `stationLabels(): string[]` vào `GameTestHook`/`installTestHook`, trả về `shopScene.stationLabelTexts()` (lấy scene qua Phaser game đã boot trong main.ts). Chạy `npm run typecheck`.
- [x] 3. [dễ] `tests/restaurant-layout.spec.ts` → thêm test T1 (xem "Test cases"). Chạy `npx playwright test tests/restaurant-layout.spec.ts -g "T1"` rồi `npm run typecheck`.

## Test cases
- [x] T1. Bàn trống không có nhãn — mở `?test=1`, vào phòng, `window.__GAME__.stationLabels()` không chứa "Bàn" nhưng vẫn chứa nhãn trạm chức năng (vd "Giao hàng") — tests/restaurant-layout.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: `ShopScene.createStations` bỏ nhãn cho `StationType.Counter` (cả `counter_1..5` lẫn `r_counter_1..6`), nhãn đã tạo lưu trong `stationLabels` Map, method public `stationLabelTexts()`; thêm hằng `KITCHEN_STATION_ITEM_HEIGHT = 22` dùng cho trạm có kitchen texture hoặc `r_counter_*` (trạm trà giữ 32), `itemCup` y = `Math.min(def.y + itemHeight/2, topSurfaceBottom)` nên đáy item vẫn nằm trên mặt bàn/trong nồi.
- Bước 2 xong: `GameTestHook` có `stationLabels(): string[]`; `installTestHook(room, getShopScene)` nhận accessor lấy scene (structural type, không import scene vào testHook); `main.ts` truyền `() => game?.scene.getScene("ShopScene") as ShopScene | undefined` (closure đọc `game` lazy, scene chưa boot thì trả `[]`).
- Bước 3 xong: thêm test T1 cuối `tests/restaurant-layout.spec.ts` — join phòng ở `?test=1`, poll tới khi `stationLabels()` có nhãn, assert không nhãn nào chứa "Bàn" và có nhãn chứa "Giao hàng". Cả 3 bước của plan đã xong.

## Test status
- Lần chạy cuối: `npx playwright test tests/restaurant-layout.spec.ts -g "T1"` → 5 passed (16.5s; grep khớp T1 cũ, T10, T11, T12 và T1 mới); sau đó `npm run typecheck` — PASS.
- Kết quả từng test:
  - T1: PASS (`T1: empty counters show no "Bàn" label while functional stations keep theirs`)
- Fail chi tiết:

## Verify
- Full suite `npx playwright test`: 16/16 PASS (T1 mới: PASS).
- Mục tiêu 1 (bỏ nhãn "Bàn"): PASS — screenshot `.agents/screenshots/hide-counter-label-restaurant.png`: các bàn trống không có chữ, trạm chức năng (Thớt, Lò nướng, Kệ đĩa/tô/ly, Thùng rác...) vẫn có nhãn.
- Mục tiêu 2 (item 22px): PASS (quan sát) — vật trên kệ đĩa/tô/ly và trạm bếp nhỏ gọn, thấy rõ thân trạm. Chưa chụp cảnh bỏ nguyên liệu vào nồi vì cần chơi thật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
