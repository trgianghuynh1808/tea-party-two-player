# Task: Hình gạo/mì sau khi nấu

Verify mode: light

## Mục tiêu
- Gạo sau khi luộc (`rice.boil`) hiện hình bát cơm trắng thay vì bao gạo; áp dụng cả khi cầm/để trên nồi lẫn khi đã múc vào đĩa/tô.
- Mì sợi sau khi luộc (`noodles.boil`) hiện hình bát mì thay vì gói mì, cũng ở mọi chỗ như trên.
- Nguyên liệu chưa nấu và các món khác giữ nguyên hình.

## Quyết định đã chốt
- Cơm dùng bát cơm có sẵn trong `dishes.png`, không vẽ bằng code.
- Chỉ làm gạo và mì lần này; các nguyên liệu khác sau.
- Không đổi `RecipeGuide`/`OrdersPanel` (vẫn hiện hình nguyên liệu thô).

## Ngữ cảnh
- `client/assets-src/tools/food_cuts.json`: dạng `"name": ["sheet", left, top, right, bottom]`, ví dụ `"dish_omurice": ["dishes", 811, 742, 938, 808]`. Toạ độ khớp ảnh sheet ở kích thước gốc.
- `client/assets-src/tools/cut_food.py` đọc `../sheets/food/<sheet>.png`, ghi `client/public/assets/food/<name>.png`. Cần Pillow, NumPy, SciPy; máy chưa cài, tạo venv ngoài repo: `python3 -m venv /tmp/cut-venv && /tmp/cut-venv/bin/pip install pillow numpy scipy`.
- Hình mới: bát cơm ở góc trên trái `dishes.png` ≈ `[303, 25, 385, 105]`; bát mì trơn ở `dishes-fancy.png` ≈ `[245, 870, 325, 935]`. Mở file PNG sau khi cắt để kiểm tra đúng hình, chỉnh box nếu sai.
- `shared/src/restaurant.ts`:
  ```ts
  export interface FoodDef { label: string; image: string; color: number; }
  // ...cuối file FOODS:
  for (const [id, def] of Object.entries(FOODS)) if (!def.image) def.image = `assets/food/ing_${id}.png`;
  export function parseFood(key: string): { food: FoodId; steps: ProcessId[] } | undefined
  ```
- `client/src/scenes/CupView.ts`: `foodTextureKey = (id) => \`food-${id}\``; `preloadCupTextures` load mọi `FOODS`; `showKitchenItem` có 2 chỗ dùng `foodTextureKey(parsed.food)` (nguyên liệu đơn, và `parts` trong đĩa/tô). `ShopScene.ts:675` cũng gọi `foodTextureKey(def.food)` cho icon thùng (giữ hình thô, không đổi).
- Tests: `tests/restaurant-layout.spec.ts` là mẫu spec thuần Node import từ `@boba/shared`, không cần trình duyệt.

## Plan
- [x] 1. [dễ] `client/assets-src/tools/food_cuts.json`: thêm `"ing_rice_cooked": ["dishes", 303, 25, 385, 105]` và `"ing_noodles_cooked": ["dishes-fancy", 245, 870, 325, 935]`; chạy `/tmp/cut-venv/bin/python client/assets-src/tools/cut_food.py` (xem Ngữ cảnh để tạo venv), kiểm tra 2 file mới trong `client/public/assets/food/` đúng hình (bát cơm, bát mì), commit cả 2 PNG.
- [x] 2. [khó] `shared/src/restaurant.ts` + `client/src/scenes/CupView.ts`: (a) thêm `cooked?: Partial<Record<ProcessId, string>>` vào `FoodDef`, đặt `rice.cooked = { boil: "assets/food/ing_rice_cooked.png" }`, `noodles.cooked = { boil: "assets/food/ing_noodles_cooked.png" }`; (b) export `foodImage(food: FoodId, steps: ProcessId[]): string` trả về `cooked[step]` của bước cuối cùng có ảnh riêng, không có thì `FOODS[food].image`; (c) trong `CupView.ts` đổi `foodTextureKey(id, steps = [])` thành key theo hình (vd `food-rice-boil`), preload thêm mọi ảnh `cooked`, và dùng `foodTextureKey(parsed.food, parsed.steps)` ở cả 2 chỗ trong `showKitchenItem`; icon thùng ở `ShopScene.ts:675` giữ nguyên (gọi không có steps). Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/cooked-food-image.spec.ts`: viết T1 và T2 dưới đây (thuần Node, theo mẫu `tests/restaurant-layout.spec.ts`, import `foodImage`, `FOODS` từ `@boba/shared`, `existsSync` kiểm tra file dưới `client/public/`). Chạy `npx playwright test tests/cooked-food-image.spec.ts`, rồi `npm run typecheck`.

## Test cases
- [x] T1. Ảnh sau khi nấu — `foodImage("rice", ["boil"])` và `foodImage("noodles", ["boil"])` khác ảnh thô; `foodImage("rice", [])`, `foodImage("noodles", ["chop"])`, `foodImage("beef", ["fry"])` vẫn là `FOODS[...].image` — tests/cooked-food-image.spec.ts
- [x] T2. File ảnh tồn tại — mọi đường dẫn `cooked` trong `FOODS` trỏ tới file có thật trong `client/public/` — tests/cooked-food-image.spec.ts

## Trạng thái hiện tại
- Cả 3 bước đều xong. Bước 3: viết `tests/cooked-food-image.spec.ts` (T1, T2 thuần Node theo mẫu `restaurant-layout.spec.ts`), chạy `npx playwright test tests/cooked-food-image.spec.ts` — 2 passed (làm 1 lần, không phải sửa lại); `npm run typecheck` PASS. Commit spec `44fe0f6`. Chưa chạy Verify (mode light, chưa được yêu cầu).

## Test status
- Lần chạy cuối: `npx playwright test tests/cooked-food-image.spec.ts` — 2 passed; `npm run typecheck` — PASS.
- Kết quả từng test:
  - T1: PASS
  - T2: PASS
- Fail chi tiết: (không có)

## Verify
- T1 PASS, T2 PASS (toàn bộ suite 21/21 pass), `npm run typecheck` pass.
- Hình `ing_rice_cooked.png` (bát cơm, có ít rau + bánh) và `ing_noodles_cooked.png` (bát mì) cắt đúng.
- Không chụp trong game: `CupView` chỉ đổi key texture theo `parsed.steps`, không có hook để đọc texture; review diff thấy đúng ở cả món đơn lẻ và `parts` trong đĩa/tô.
- Non-blocking: `foodTextureKey` (client) lặp logic của `foodImage` (shared).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
