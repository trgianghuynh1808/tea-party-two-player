# Task: Kiểm tra file rác, không dùng thì xoá (T44)

APPROVED_BY_MANAGER

Verify mode: light

## Mục tiêu
- Tìm các file không còn được dùng (ảnh/artifact tạm bị commit, art game không còn được nạp, script mồ côi) và xoá chúng.
- Không làm hỏng game: typecheck và toàn bộ e2e vẫn pass, không có ảnh /assets nào bị 404.

## Ý tưởng
- Xoá artifact tạm đã commit (ảnh chụp, yml của playwright-cli) rồi kiểm tra art trong `client/public/assets` bằng script tạm: file nào không được catalog/code/test tham chiếu (kể cả tên sinh động) thì xoá.
- Viết 1 spec bắt mọi response /assets lỗi để chắc không xoá nhầm.

## Quyết định đã chốt
-

## Ngữ cảnh
- Chắc chắn rác (tracked trong git, không code nào đọc): `.playwright-cli/*.yml` (3 file), `.agents/screens/*.png` (11 file, 3.9MB), `.agents/shots/edge-layout.png`. Xoá bằng `git rm -r`. Thêm `.playwright-cli/` vào `.gitignore`. KHÔNG đụng `.agents/tasks/`, `.agents/MANAGER.md`, `.agents/config.sh`, `.agents/screenshots/` (ignored, daemon dùng).
- Cần kiểm tra thủ công trước khi xoá: `tests/room_ops_shots.py` (test python của `scripts/room-ops.py`, không có script nào gọi): CHỈ xoá nếu `scripts/room-ops.py` không còn hàm `is_task_shot`/`task_screenshots`; còn thì giữ.
- Art ứng viên (grep tên file không thấy trong `client/src shared/src server/src tests`): `client/public/assets/decor/{fern_medium_2,red_lantern_2,succulent_2,succulent_3,succulent_4}.png`, `decor/kitchen/{fridge,washer}_kitchen_{front,back,left,right}.png`, `decor/views/{bed_plaid,bookshelf,desk_pc,dining_table,nightstand_clock,sofa_lilac,tv_stand,wardrobe_open}_*.png`, và `food/` (dish_*, drink_*, ing_*...).
- CẢNH BÁO: ảnh được nạp bằng đường dẫn SINH ĐỘNG (vd `food/${id}.png`, `decor/views/${kind}_${facing}.png`, `build/`, `items/`, `fish/`, `stations/`), nên grep tên file KHÔNG đủ. Với mỗi ứng viên phải đọc code nạp ảnh (`grep -rn "assets/" client/src shared/src server/src`; `DECORATION_CATALOG` trong `shared/src/decor.ts`, `shared/src/menu.ts`, `shared/src/customDecor.ts`) để xác nhận path đó không bao giờ được sinh ra. Gợi ý: viết script node tạm (KHÔNG commit) import `@boba/shared`, liệt kê mọi path ảnh từ catalog/menu/tiles/fish, rồi so với `git ls-files client/public/assets`. Bất kỳ file nào còn nghi ngờ thì GIỮ.
- Không xoá `client/assets-src/` (nguồn art + tool, có tools còn dùng; chỉ xoá file mà không script nào trong `client/assets-src/tools/` hoặc `client/assets-src/**/*.py` đọc, và chỉ khi chắc chắn; mặc định giữ). Không xoá `scripts/*`, `.github/`, `render.yaml`.
- Test facts: `joinAsHost(page, username)` trong `tests/helpers.ts` mở `/?test=1`, tạo phòng; `window.__GAME__` có `send(type, payload)`. Playwright không import được module server TS. Test chạy trên cổng 5174/2568 (`tests/ports.ts`). Unique username: `` `junk-${Date.now()}` ``.
- Docs: nếu xoá tool/thư mục được nhắc trong `AGENTS.md` (Codebase Map) hoặc `README.md` thì sửa cho khớp.

## Plan
- [x] 1. [dễ] `.gitignore` → `git rm -r` `.playwright-cli`, `.agents/screens`, `.agents/shots`; thêm dòng `.playwright-cli/` vào `.gitignore`; xử lý `tests/room_ops_shots.py` theo điều kiện ở Ngữ cảnh. Chạy `npm run typecheck`.
- [x] 2. [khó] `client/public/assets` → kiểm tra từng ứng viên art ở Ngữ cảnh bằng script tạm liệt kê mọi path ảnh sinh ra từ catalog/menu/code, `git rm` các file chắc chắn không dùng, ghi danh sách đã xoá và danh sách giữ lại (kèm lý do) vào "Trạng thái hiện tại". Rà `client/assets-src/` theo quy tắc bảo thủ; sửa `AGENTS.md`/`README.md` nếu nhắc tới file đã xoá.
- [x] 3. [vừa] `tests/asset-404.spec.ts` → viết spec T1 (file mới nhỏ). Chạy `npx playwright test tests/asset-404.spec.ts -g "T1"`, sau đó `npm run typecheck` và `npx playwright test` toàn bộ một lần.

## Test cases
- [x] T1. Không ảnh /assets nào bị 404 — kiểm tra việc xoá file không làm hỏng art đang dùng — tests/asset-404.spec.ts
  - Setup: 1 phiên, username `junk-${Date.now()}`, `joinAsHost`. Gắn `page.on("response")` TRƯỚC khi `joinAsHost`, gom mọi response có url chứa `/assets/` và status >= 400 (và `page.on("requestfailed")` cho url chứa `/assets/`).
  - Steps: 1. `joinAsHost` · 2. chờ 2s cho scene nạp xong · 3. `__GAME__.send("start_shift", { venue: "restaurant" })` rồi `startRestaurantShift`-tương đương (dùng `startRestaurantShift(page)` từ helpers) · 4. chờ 1s.
  - Assert: danh sách response lỗi /assets rỗng (`expect(failed).toEqual([])`).

## Trạng thái hiện tại
- Bước 1 xong: `git rm -r` 3 file `.playwright-cli/*.yml`, 11 file `.agents/screens/*.png`, 1 file `.agents/shots/edge-layout.png`; xoá thêm artifact untracked `.playwright-cli/console-*.log`; thêm `.playwright-cli/` vào `.gitignore`. Giữ `tests/room_ops_shots.py` vì `scripts/room-ops.py` vẫn còn `is_task_shot` (dòng 1164) và `task_screenshots` (dòng 1171). `npm run typecheck` PASS.
- Docs checked: no change needed.
- Bước 2 xong. Script tạm (không commit) import `@boba/shared` dựng tập path ảnh sinh ra từ `DECORATION_CATALOG` (kể cả `views`), `BUILD_TILES` (mask 0..15 + `d`), `FISH`, `FOODS`/`DISHES`, `CHARACTERS`, art hardcode ở client (pond, rod, cups, items, stations, floor) + quét literal `assets/...` trong `client/src shared/src server/src tests`, rồi so với `git ls-files client/public/assets`. Sau khi xoá còn 376 file tracked; script chỉ còn báo 3 file "không dùng" là input của tool.
- Đã xoá (35 file, `git rm`): decor `fern_medium_2`, `lantern_bronze`, `red_lantern_2`, `succulent_2/3/4`, `woven_chair`; food `dish_{burger,fish_chips,fried_chicken,pancake,pizza,pumpkin_soup,ramen,roast_chicken,sandwich,tempura}`, `drink_{hot_chocolate,lemonade,strawberry_smoothie}`; items/icons `cheese`, `cheese_foam`, `chocolate_bar`, `chocolate_piece`, `coffee_bean`; items/tiles `cheese_foam`, `cup_milk`, `passion`, `passion_seeds`, `passion_seeds_2`, `passion_seeds_3`, `pearl`, `pearl_2`, `whipped_cream`, `whipped_cream_2`.
- Giữ lại có lý do: toàn bộ `decor/views/*` và `decor/kitchen/{fridge,washer}_kitchen_*` (được sinh từ `viewsDecor`), `items/tiles/{cup_empty,cup_black_tea,cup_green_tea}` (input của `client/assets-src/tools/build_cups.py`), toàn bộ `client/assets-src/` (nguồn art + tool, quy tắc bảo thủ, không đụng).
- `AGENTS.md`/`README.md`: không nhắc tới file nào đã xoá → không sửa.
- Bước 3 xong: viết `tests/asset-404.spec.ts` (T1) — gắn `page.on("response")` + `page.on("requestfailed")` TRƯỚC `joinAsHost`, gom mọi URL chứa `/assets/` lỗi, chờ 2s, `startRestaurantShift(page)`, chờ 1s, `expect(failed).toEqual([])`. Chạy riêng T1 PASS; `npm run typecheck` PASS; `npx playwright test` toàn bộ: 89 expected pass, 0 failed, 0 flaky.
- Lưu ý: suite còn 1 `test.fail` sẵn có ở `tests/mobile-build-ui.spec.ts` T1 (bug ⟳ badge tràn panel 4px, đã ghi trong test) — không liên quan thay đổi lần này. 3 file `client/public/assets/items/tiles/{cup_empty,cup_black_tea,cup_green_tea}.png` vẫn "không dùng lúc chạy" nhưng được giữ vì là input của `build_cups.py`.

## Test status
- Lần chạy cuối: bước 3 — `npx playwright test tests/asset-404.spec.ts -g "T1"` PASS; `npm run typecheck` PASS; `npx playwright test` toàn bộ: 89 passed (0 unexpected, 0 flaky), trong đó có 1 `test.fail` sẵn có của `mobile-build-ui` T1.
- Kết quả từng test:
  - T1: PASS
- Fail chi tiết: không có (lỗi duy nhất trong log là `test.fail` có chủ đích của `mobile-build-ui.spec.ts` T1).

## Verify
- Typecheck PASS; toàn bộ e2e 89 passed. T1 (không /assets nào 404): PASS. Không chụp ảnh (chỉ xoá file, không đổi UI).

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
