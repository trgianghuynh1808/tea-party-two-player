# Task: Cá và đồ trang trí hồ câu theo bộ hình pixel-art

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Cắt 2 sheet ảnh người dùng gửi thành sprite PNG riêng (cá, sinh vật đáy hồ) bằng tool Python sẵn có.
- Mở rộng danh sách loài cá (giữ nguyên id cũ), mỗi loài gắn 1 sprite; cá trong hồ vẽ bằng sprite thay vì hình elip.
- Trang trí đáy hồ bằng rong, sao biển, vỏ sò, cua, rùa, sứa... (chỉ để đẹp, không tương tác); bảng "Các loại cá" hiện icon.

## Mục tiêu
- Cá bơi trong hồ dùng sprite pixel-art từ ảnh; loài cá lấy theo ảnh (15 loài).
- Hồ có đồ trang trí đáy/nước từ ảnh thứ 2.
- FishGuide liệt kê đủ loài mới kèm icon. Cơ chế câu (cast/bite/reel) không đổi.

## Quyết định đã chốt
- Giữ id cá cũ (đã lưu/sync); thêm loài mới; texture suy ra từ id: `assets/fish/<id>.png`.
- Trang trí hồ chỉ là visual client, không thêm vào schema/catalog nội thất.

## Ngữ cảnh
- Ảnh gốc (Dev mở khi cần): `.agents/attachments/T22/req-1.jpg` (nền xám phẳng, lưới 6 cột x 6 hàng, 36 cá/lươn/đuối... pixel-art), `.agents/attachments/T22/req-2.jpg` (nền xanh phẳng, lưới 7 cột x 6 hàng: cá kiếm, cá heo, cá voi, cá mập, tôm, tôm hùm, ngựa vằn biển, cua, sò, sao biển, bạch tuộc, mực, rùa, sứa, rong biển...).
- Tool cắt: `client/assets-src/tools/slice_sheet.py` (`detect` rồi `extract`, mode `flat` cho nền phẳng; cần venv: `python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy`). Mẫu dùng tool: `cut_bathroom.py`. Copy ảnh vào `client/assets-src/sheets/fish-sheet-1.jpg` và `fish-sheet-2.jpg`. Output vào `client/public/assets/fish/<id>.png` và `client/public/assets/pond/<name>.png`.
- `shared/src/fishing.ts`: `FishDef { id, name, tier, price, hold, speed, weight }`, mảng `FISH` (hiện 8 loài: ca_ro, ca_chep, ca_tre, ca_he, ca_tram, ca_loc, ca_koi, ca_rong). `FISH_COUNT=10`, `pickFishSpecies`. `FISH_TEST=1` ép mọi cá là ca_ro (không đổi).
- Gợi ý map loài → ô trong sheet 1 (hàng,cột, đếm từ 1; Dev tự chỉnh nếu ô lệch): ca_ro r1c6 (xanh lá), ca_chep r2c1 (vàng nâu), ca_tre r3c2 (xám đốm), ca_he r6c2 (bạc), ca_tram r5c4 (đỏ), ca_loc r5c6 (xanh-vàng), ca_koi r2c3 (đỏ-trắng); loài MỚI: ca_thu r1c1 (xanh dương, common), ca_bon r4c6 (cá bơn, uncommon), luon r3c6 (lươn, uncommon), ca_nuc r6c3 (cá nóc, rare), ca_duoi r4c2 (cá đuối, epic), ca_mat_trang r5c2 (cá mặt trăng, epic); sheet 2: ca_rong r1c1 (cá kiếm, mythic, giữ id cũ), ca_map r2c1 (cá mập, mythic). Giá/hold/speed/weight loài mới theo mẫu tier cùng loại (mythic weight 1, epic 2, rare 3-4...).
- `client/src/scenes/PondView.ts`: `createFishView` đang vẽ elip theo `TIER_LOOK`; `drawWater` vẽ rong bằng tam giác (thay bằng sprite). Cá mặc định hướng phải, `setScale(dir)` để lật. Preload texture ở `ShopScene.preload()` (gọi thêm `preloadPondTextures(this)` export từ PondView, giống `preloadBuildTextures`). Sprite cá trong ảnh hơi chéo: hiển thị không xoay, kích thước hiển thị theo tier (`TIER_LOOK.width`), giữ tỉ lệ; có bảng `FISH_FACING` (client) cho sprite quay trái.
- `client/src/ui/FishGuide.ts`: mỗi hàng `.fish-guide-row[data-fish]`; thêm `<img class="fish-guide-icon">` dùng `assets/fish/<id>.png` (CSS trong file style của client, cỡ ~20px, `image-rendering: pixelated`).
- Ví dụ test: `tests/fishing.spec.ts` đã import `FISH`, `FISH_COUNT` từ `@boba/shared`, có helper `snap(page)`, `send(page, type)`; server test chạy `FISH_SECONDS=20 FISH_TEST=1 DEBUG_WARP=1`. Vào pond: `send(page, "start_fishing")` rồi poll `snap(page).fishPhase === "fishing"`. Test không import được module server. PNG tĩnh lấy bằng `page.request.get(new URL("assets/fish/<id>.png", page.url()).href)`.

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_fish.py` → viết script cắt (dùng `slice_sheet.py` mode flat) từ `sheets/fish-sheet-1.jpg` / `fish-sheet-2.jpg` (copy từ attachments): fish → `client/public/assets/fish/<id>.png` cho 15 loài theo bảng map; pond decor từ sheet 2 → `client/public/assets/pond/{seaweed_brown,seaweed_green,starfish,shell,crab,turtle,jellyfish,octopus,seahorse}.png`. Chạy script, mở vài PNG kiểm tra nền trong suốt. Lệnh: `python3 client/assets-src/tools/cut_fish.py`.
- [x] 2. [khó] `shared/src/fishing.ts` → thêm 7 loài mới vào `FISH` (ca_thu, ca_bon, luon, ca_nuc, ca_duoi, ca_mat_trang, ca_map), giữ 8 id cũ, giữ thứ tự common→mythic; cập nhật comment trọng số trong `pickFishSpecies`. Kiểm tra `grep -rn "ca_rong\|FISH\b" server client tests` không có chỗ nào giả định đúng 8 loài. Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/src/scenes/PondView.ts` → thêm `export function preloadPondTextures(scene)` (load `assets/fish/<id>.png` cho mọi `FISH`, và các ảnh `assets/pond/*.png`); `createFishView` dùng `scene.add.image` thay elip/tam giác (cỡ theo tier, giữ tỉ lệ, flip theo `FISH_FACING`); `drawWater` thay rong tam giác bằng sprite rong/sao biển/vỏ sò/cua đặt cố định ở đáy, thêm rùa/sứa/bạch tuộc/cá ngựa trôi chậm trong `update` (visual-only, depth thấp hơn cá). Gọi `preloadPondTextures(this)` trong `client/src/scenes/ShopScene.ts` → `preload()`. Chạy `npm run typecheck`.
- [x] 4. [vừa] `client/src/ui/FishGuide.ts` → thêm icon `<img class="fish-guide-icon" src="assets/fish/<id>.png">` vào mỗi hàng loài cá; thêm CSS tương ứng vào file CSS client đang chứa `.fish-guide-row`. Chạy `npm run typecheck`.
- [x] 5. [vừa] `tests/fishing.spec.ts` → thêm T1, T2 bên dưới (mở rộng spec có sẵn). Chạy `npx playwright test tests/fishing.spec.ts -g "T22"`, sau đó `npx playwright test tests/fishing.spec.ts` để chắc T1-T3 cũ vẫn pass.
- [x] 6. [dễ] `README.md` → mục Gameplay/pond: cập nhật số loài cá và nhắc hồ có đồ trang trí; `AGENTS.md` Codebase Map nhắc `cut_fish.py` trong `client/assets-src/tools/`. Ghi "Docs checked" vào Trạng thái hiện tại.

## Test cases
- [x] T1. T22 sprite cá đủ loài — mọi loài trong `FISH` có PNG và hiện trong FishGuide — tests/fishing.spec.ts
  - Setup: 1 user `p1-${Date.now()}`, 1 phiên, `/?test=1`.
  - Steps: 1. với mỗi `f` của `FISH` gọi `page.request.get` tới `assets/fish/<f.id>.png` · 2. `send(page, "start_fishing")`, poll `fishPhase === "fishing"`.
  - Assert: mọi response status 200 và content-type image/png; `page.locator(".fish-guide-row[data-fish]")` có count `FISH.length` và mỗi hàng có `img.fish-guide-icon`.
- [x] T2. T22 cá hồ dùng loài hợp lệ — cá trong hồ đúng số lượng, species thuộc `FISH`, không lỗi load texture — tests/fishing.spec.ts
  - Setup: như T1, lắng nghe `page.on("console")`/`pageerror` từ lúc mở trang.
  - Steps: 1. vào pond như T1 · 2. đọc `snap(page)` sau khi `fishSize === FISH_COUNT`.
  - Assert: mọi `fish[i].species` nằm trong `FISH.map(f=>f.id)`; không có pageerror; không có console error chứa "Failed to process file" hay "404".

## Trạng thái hiện tại
Lưu ý: hướng cá trong sprite (trái/phải) và việc ô nào ứng với loài nào Dev chỉnh bằng mắt; Verify sẽ chụp màn hình hồ.

Bước 1 xong: `client/assets-src/tools/cut_fish.py` (dùng `slice_sheet.py` mode flat) cắt từ `client/assets-src/sheets/fish-sheet-1.jpg` / `fish-sheet-2.jpg` (đã copy từ attachments; script tự copy lại nếu thiếu) → 24 PNG: 15 cá ở `client/public/assets/fish/<id>.png` (13 loài sheet 1 theo map trong plan + `ca_rong` r1c1, `ca_map` r2c1 sheet 2) và 9 decor ở `client/public/assets/pond/{seaweed_brown,seaweed_green,starfish,shell,crab,turtle,jellyfish,octopus,seahorse}.png`. Nền trong suốt đã kiểm bằng assert trong script (góc alpha=0, có pixel đặc) + xem lại silhouette ASCII của cá_ro/ca_map/ca_duoi/jellyfish/turtle/seahorse: hình dạng nguyên vẹn.
Map decor (sheet 2, hàng-cột đếm từ 1): seaweed_green r3c2, jellyfish r3c4, octopus r3c6, seaweed_brown r3c7, crab r4c1, seahorse r4c3, shell r4c6, starfish r4c7, turtle r5c5. Các ô cá sheet 1 khớp màu gợi ý trong plan (ca_ro xanh lá, ca_tram đỏ, ca_koi đỏ-trắng, ca_thu xanh dương, ca_nuc vàng...).
Lưu ý: lệnh chạy cần venv art như docstring script (`python3 -m venv /tmp/sprite-venv && .../pip install pillow numpy scipy` rồi `/tmp/sprite-venv/bin/python client/assets-src/tools/cut_fish.py`) — python3 hệ thống thiếu numpy/scipy; venv cũ tại /tmp/sprite-venv bị hỏng nên đã tạo lại.
Lưu ý: model trong phiên này không đọc trực tiếp được file ảnh, nên map ô được kiểm chứng bằng thống kê màu + silhouette pixel của từng ô (khớp màu gợi ý trong plan); Verify cần chụp hồ + FishGuide để xác nhận loài, nhất là seahorse (r4c3) và shell (r4c6).

Bước 2 xong: `shared/src/fishing.ts` thêm 7 loài mới — ca_thu common (18$/2.5s/50px/s/w30), ca_bon uncommon (32/3/58/8), luon uncommon (48/3.5/66/8), ca_nuc rare (150/5.5/84/3), ca_duoi epic (380/7.5/98/2), ca_mat_trang epic (450/8/104/2), ca_map mythic (1200/10/118/1) — giá/hold/speed theo mẫu tier, weight theo hint plan (mythic 1, epic 2, rare 3-4). 8 id cũ giữ nguyên vị trí tương đối, mảng vẫn common→mythic với price/hold/speed tăng dần. Comment trọng số `pickFishSpecies` cập nhật: common 40/30/30, uncommon 12/8/8/8, rare 4/3/3, epic 2/2/2, mythic 1/1 (tổng 154). Grep `ca_rong\|FISH\b` trên server/client/tests: mọi chỗ dùng động (FishGuide filter theo tier, test dùng `FISH.length`, FISH_TEST dùng `getFish("ca_ro")`) — không chỗ nào giả định đúng 8 loài.
Lưu ý: sprite `ca_rong` giờ là cá kiếm (sheet 2 r1c1) nhưng tên hiển thị vẫn "Cá rồng" — plan chỉ yêu cầu giữ id, không yêu cầu đổi tên; nếu muốn đổi tên hiển thị thì người duyệt quyết ở bước khác.

Bước 3 xong: `PondView.ts` thêm `preloadPondTextures(scene)` (load `assets/fish/<id>.png` cho 15 loài + 9 ảnh `assets/pond/*.png`), `createFishView` đổi sang `scene.add.image` (scale theo `TIER_LOOK.width` của tier, giữ tỉ lệ, không xoay; nhãn tên dùng `bodyH` = displayHeight), `update` flip = hướng bơi × `FISH_FACING`; `drawWater` bỏ rong tam giác, thay bằng decor đáy cố định (3 cụm seaweed_green + 2 seaweed_brown gốc y=WATER.bottom, 2 starfish, 2 shell, 1 crab, origin đáy, depth -990) + 5 decor trôi trong `update` (turtle, 2 jellyfish, octopus, seahorse — sine ngang + bob dọc, depth -980, luôn dưới cá vì depth cá = y ≥ 0). Pond textures đặt filter NEAREST trong constructor PondView; giữ fallback vẽ elip cũ khi texture thiếu (không xảy ra khi preload đủ). `ShopScene.preload()` gọi `preloadPondTextures(this)`.
Lưu ý: phân tích pixel 15 sprite (centroid + silhouette) cho thấy tất cả đều vẽ hướng PHẢI (đuôi dưới-trái, khối dồn phải) nên `FISH_FACING` hiện là bảng rỗng — nếu Verify thấy con nào bơi lùi thì thêm id vào bảng này là lật ngay.

Bước 4 xong: `FishGuide.ts` mỗi hàng loài cá thêm `<img class="fish-guide-icon" src="assets/fish/<id>.png">` (alt rỗng vì tên hiển thị ngay cạnh); CSS trong `client/src/style.css`: `.fish-guide-icon` 20x20, `image-rendering: pixelated`, `object-fit: contain`, `flex: none`, và `.fish-guide-row .fish-guide-name { flex: 1 }` để icon+name nhóm trái, giá giữ phải (áp dụng cả hàng cần câu, layout không đổi).
Selectors: img.fish-guide-icon, .fish-guide-row[data-fish], .fish-guide-row[data-rod] (client/src/ui/FishGuide.ts; CSS: client/src/style.css)

Bước 5 xong: `tests/fishing.spec.ts` thêm 2 spec cuối file, tiêu đề chứa "T22" để `-g "T22"` chỉ chọn chúng — `T1: T22 every fish species has a PNG sprite and a FishGuide icon` (GET `assets/fish/<id>.png` cho mọi `FISH` → 200 + image/png; `start_fishing` (server tự warp vào hồ) rồi poll `fishPhase === "fishing"`; `.fish-guide-row[data-fish]` và `img.fish-guide-icon` trong đó đếm đúng `FISH.length`) và `T2: T22 pond fish use valid species and load without errors` (bắt `console`/`pageerror` từ trước `joinAsHost`; poll `fishPhase` + `fishSize === FISH_COUNT`; mọi `fish[i].species` thuộc `FISH`, không pageerror, không console error chứa "Failed to process file"/"404").
Lưu ý: T2 chỉ kiểm tra lỗi console/pageerror tính tới lúc chụp snapshot đầu tiên sau khi cá xuất hiện, không theo dõi tiếp cả phiên; cá được kiểm ở lần spawn đầu, chưa đợi vòng respawn.

Bước 6 xong: Docs checked. `README.md` mục Fishing pond cập nhật "15 fish in 5 rarities" (thay 8), thêm mô tả cá vẽ bằng pixel-art sprite + hồ có decor đáy/nước (rong, sao biển, vỏ sò, cua, rùa, sứa, bạch tuộc, cá ngựa — chỉ để đẹp), FishGuide nói rõ có sprite icon, và ghi nguồn sprite (`fish-sheet-1/2.jpg` → `cut_fish.py` → `assets/fish/<id>.png`, `assets/pond/<name>.png`). `AGENTS.md` Codebase Map thêm `cut_fish.py` vào danh sách tool. Grep không còn chỗ nào ghi 8 loài.

## Test status
- Lần chạy cuối: bước 6 — `npm run typecheck` PASS; bước 6 chỉ sửa docs nên không có lệnh playwright riêng (kết quả test giữ từ bước 5: `-g "T22"` 2/2 PASS, cả spec 8/8 PASS).
- Kết quả từng test:
  - T1: PASS — `T1: T22 every fish species has a PNG sprite and a FishGuide icon`
  - T2: PASS — `T2: T22 pond fish use valid species and load without errors`
- Fail chi tiết: không có.

## Verify
- Toàn bộ e2e: 66/66 PASS; typecheck PASS. T1 PASS, T2 PASS.
- Ảnh hồ: `.agents/screenshots/task-22-pond-sprites.png` — PASS: cá vẽ bằng sprite, decor đáy/trôi (bạch tuộc, cá ngựa, sao biển, rong...), FishGuide có icon 15 loài.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
