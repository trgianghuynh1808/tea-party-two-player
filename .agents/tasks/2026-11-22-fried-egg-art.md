# Task: Bỏ nhãn vùng bếp và hình trứng ốp la

Verify mode: light

## Mục tiêu
- Nhà hàng không còn hiện chữ "🥬 Nguyên liệu" và "🤝 Bàn giao" trên sàn.
- Trứng sau khi chiên (`egg.fry`) hiện hình trứng ốp la (cắt từ `dishes.png`) thay vì quả trứng sống, cả khi cầm/để trên chảo lẫn khi đã vào đĩa/tô (cơ chế giống gạo).
- Trứng chưa chiên, trứng luộc (`egg.boil`, sheet không có hình riêng) và các món khác giữ nguyên hình.

## Quyết định đã chốt
- Trong sheet có trứng ốp la: bát gỗ đựng trứng ốp ở `dishes.png` ≈ `[505, 143, 590, 228]` (cạnh chảo trứng ốp ≈ `[375, 143, 475, 232]`, không dùng vì có tay cầm chảo). Không có trứng luộc nên bỏ qua `boil`.
- Dùng lại cơ chế `FoodDef.cooked` + `foodImage()` đã có (commit b7f92c0).

## Ngữ cảnh
- `client/src/scenes/RestaurantView.ts` ~dòng 97-113: hàm `private drawZoneLabels()` vẽ 2 nhãn; được gọi 1 lần trong file (grep `drawZoneLabels`). Xoá hàm + chỗ gọi + comment đi kèm; nếu import/hằng (`FLOOR_DEPTH`, `this.fs`) thành không dùng thì dọn cho typecheck sạch.
- `client/assets-src/tools/food_cuts.json`: dạng `"name": ["sheet", left, top, right, bottom]`, ví dụ `"ing_rice_cooked": ["dishes", 303, 25, 385, 105]`. `cut_food.py` ghi `client/public/assets/food/<name>.png` (cần Pillow, NumPy, SciPy; tạo venv ngoài repo: `python3 -m venv /tmp/cut-venv && /tmp/cut-venv/bin/pip install pillow numpy scipy`, chạy `/tmp/cut-venv/bin/python client/assets-src/tools/cut_food.py`). Mở PNG sau khi cắt để kiểm tra đúng hình (bát trứng ốp, không dính hàng xóm), chỉnh box nếu sai.
- `shared/src/restaurant.ts` ~dòng 108:
  ```ts
  FOODS.rice.cooked = { boil: "assets/food/ing_rice_cooked.png" };
  FOODS.noodles.cooked = { boil: "assets/food/ing_noodles_cooked.png" };
  ```
  `foodImage(food, steps)` trả ảnh của bước cuối có ảnh riêng; `CupView.ts` đã tự preload mọi `cooked`, không cần sửa.
- `tests/cooked-food-image.spec.ts`: T1 kiểm `foodImage(...)` cho rice/noodles; T2 duyệt mọi `cooked` trỏ tới file có thật (đã bao trùm ảnh trứng mới).

## Plan
- [x] 1. [dễ] `client/src/scenes/RestaurantView.ts` → `drawZoneLabels`: xoá hàm và chỗ gọi nó (cùng comment), dọn import/hằng thừa. Chạy `npm run typecheck`.
- [x] 2. [dễ] `client/assets-src/tools/food_cuts.json`: thêm `"ing_egg_fried": ["dishes", 505, 143, 590, 228]`; chạy `cut_food.py` (xem Ngữ cảnh), kiểm tra `client/public/assets/food/ing_egg_fried.png` đúng hình bát trứng ốp; commit PNG. Nếu script cắt lại làm đổi các PNG khác thì chỉ `git add` file mới.
- [x] 3. [khó] `shared/src/restaurant.ts` → sau `FOODS.noodles.cooked`: thêm `FOODS.egg.cooked = { fry: "assets/food/ing_egg_fried.png" };` và sửa `tests/cooked-food-image.spec.ts` T1: thêm `expect(foodImage("egg", ["fry"])).not.toBe(FOODS.egg.image)`, `expect(foodImage("egg", [])).toBe(FOODS.egg.image)`, `expect(foodImage("egg", ["boil"])).toBe(FOODS.egg.image)`. Chạy `npm run typecheck` rồi `npx playwright test tests/cooked-food-image.spec.ts`.

## Test cases
- [x] T1. Ảnh trứng sau khi chiên — `foodImage("egg", ["fry"])` khác ảnh thô; trứng thô và `egg.boil` giữ ảnh thô — tests/cooked-food-image.spec.ts
- [x] T2. File ảnh tồn tại — mọi đường dẫn `cooked` (gồm trứng ốp) trỏ tới file có thật (test đã có, chỉ chạy lại) — tests/cooked-food-image.spec.ts

## Trạng thái hiện tại
- Bước 1 xong: đã xoá `drawZoneLabels` cùng chỗ gọi và comment, `npm run typecheck` pass.
- Bước 2 xong: thêm `ing_egg_fried` vào `food_cuts.json`, chạy `cut_food.py` (chỉ sinh thêm PNG mới, không đổi PNG cũ), đã xem `ing_egg_fried.png` đúng là bát gỗ đựng trứng ốp la; `npm run typecheck` pass.
- Bước 3 xong: thêm `FOODS.egg.cooked = { fry: "assets/food/ing_egg_fried.png" }` vào `shared/src/restaurant.ts`, thêm 3 expect cho trứng vào T1 của `tests/cooked-food-image.spec.ts`. `npm run typecheck` pass, `npx playwright test tests/cooked-food-image.spec.ts` pass (2/2).
- Cả 3 bước của plan đã hoàn tất.

## Test status
- Lần chạy cuối: `npx playwright test tests/cooked-food-image.spec.ts` (sau bước 3) — 2 passed.
- Kết quả từng test:
  - T1: PASS (foodImage cho rice/noodles/egg; trứng chiên đổi ảnh, trứng thô và `egg.boil` giữ ảnh thô)
  - T2: PASS (mọi đường dẫn `cooked`, gồm `ing_egg_fried.png`, trỏ tới file có thật)
- Fail chi tiết: (không có)

## Verify
- T1, T2: PASS (playwright 15/15, typecheck OK). Ảnh ing_egg_fried.png đúng hình bát trứng ốp. Nhãn vùng đã xoá khỏi RestaurantView.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
