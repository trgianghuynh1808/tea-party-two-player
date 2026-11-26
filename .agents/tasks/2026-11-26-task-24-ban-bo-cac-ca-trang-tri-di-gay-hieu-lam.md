# Task: Bỏ cá trang trí gây hiểu lầm, ghi tên nhỏ cho mọi loài cá câu được

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Xoá 4 con vật trang trí bơi lơ lửng trong hồ (rùa, sứa, bạch tuộc, cá ngựa) vì người chơi tưởng là cá câu được; giữ rong, sao biển, vỏ sò, cua dưới đáy.
- Mọi cá thật trong hồ đều có tên nhỏ phía trên (hiện chỉ cá rare trở lên có), chữ ~9px để không rối mắt.
- Dọn art/tool thừa: bỏ 4 ảnh trang trí đó khỏi `cut_fish.py`, `public/assets/pond/` và README.

## Mục tiêu
- Hồ không còn sinh vật trang trí nào bơi/trôi giống cá.
- Mọi cá trong hồ (kể cả common/uncommon) có nhãn tên nhỏ; rare+ vẫn kèm bậc.

## Quyết định đã chốt
- Chỉ bỏ 4 "drifter" (turtle, jellyfish, octopus, seahorse). Cua/sao biển/vỏ sò/rong nằm cố định dưới đáy nên giữ.
- Cá common/uncommon: nhãn chỉ có tên (không bậc); rare/epic/mythic giữ `Tên · Bậc`. Font nhỏ hơn cho mọi nhãn.

## Ngữ cảnh
- `client/src/scenes/PondView.ts`:
  - `POND_DECOR` (const array, dòng ~38): bỏ `"turtle"`, `"jellyfish"`, `"octopus"`, `"seahorse"`.
  - `interface Drifter`, `private readonly drifters`, `drawDrifters()`, `updateDrifters()`, lời gọi `this.updateDrifters()` trong `update` và `this.drawDrifters()` trong hàm vẽ nền, `DRIFT_DEPTH`: xoá hết. Sửa comment đầu file/class nhắc "drifters".
  - `createFishView`: nhãn tạo trong `if (tier === "rare" || ...)`. Đổi: luôn tạo nhãn; text = rare+ ? `${name} · ${TIER_LABELS[tier]}` : `name`; `fontSize: "9px"`, giữ `setDepth(LINE_DEPTH - 1)`. `update` đã đặt vị trí nhãn theo `view.bodyH`; cá nhỏ nên offset `- 8` vẫn ổn. Nhãn đã được destroy trong `removeFishView`/`destroy`.
- `client/assets-src/tools/cut_fish.py`: `POND_CUTS` có 9 mục; bỏ `jellyfish`, `octopus`, `seahorse`, `turtle` (còn 5). Sửa docstring "9 pond decorations" → 5. Dòng `assert len(written) == n_fish + len(POND_CUTS)` tự đúng. Không cần chạy lại tool; chỉ xoá file png tương ứng.
- Xoá `client/public/assets/pond/{turtle,jellyfish,octopus,seahorse}.png`.
- `README.md` mục "### Fishing pond" (dòng ~81): bỏ câu "while a turtle, jellyfish, octopus and seahorse drift by — decoration only..."; thay bằng câu nói mọi cá đều có tên nhỏ phía trên. `AGENTS.md` không nhắc các con vật này (không cần sửa).
- Không có DOM cho nhãn (vẽ trong canvas Phaser) nên không viết e2e; typecheck + Verify bằng ảnh.

## Plan
- [x] 1. [dễ] `client/src/scenes/PondView.ts` → xoá drifters (xem Ngữ cảnh) và đổi `createFishView` để mọi cá có nhãn tên nhỏ (9px).
- [x] 2. [dễ] `client/assets-src/tools/cut_fish.py` → bỏ 4 mục khỏi `POND_CUTS` + docstring; xoá 4 file png trong `client/public/assets/pond/`; sửa câu trong `README.md` mục Fishing pond. Chạy `npm run typecheck`.

- [x] 3. [dễ] Fix: `client/src/scenes/PondView.ts` → `seaweed_brown.png` thực ra là hình CÁ NGỰA (cắt nhầm tên), vẫn hiện dưới đáy hồ và gây hiểu lầm. Xoá `"seaweed_brown"` khỏi `POND_DECOR` và xoá 2 dòng `put("seaweed_brown", 110, 44, true);` và `put("seaweed_brown", 700, 58);` trong `drawBottomDecor`; sửa comment "Seaweed clusters..." cho đúng. Xoá `client/public/assets/pond/seaweed_brown.png`, bỏ mục `seaweed_brown` khỏi `POND_CUTS` trong `client/assets-src/tools/cut_fish.py` (còn 4; sửa docstring "5 pond decorations" → 4) và sửa README mục Fishing pond nếu nhắc số/loại decor. Chạy `npm run typecheck`.

## Test cases
Không viết e2e: thay đổi chỉ là hình vẽ trong canvas, type checker đã bắt tham chiếu sót. Verify dùng 1 ảnh chụp hồ (`.agents/screenshots/task-24-pond-labels.png`, vào hồ với `?test=1`, thấy không còn rùa/sứa/bạch tuộc/cá ngựa và cá có tên nhỏ).

## Trạng thái hiện tại
- Bước 1 xong: `PondView.ts` đã bỏ 4 drifter (turtle/jellyfish/octopus/seahorse) khỏi `POND_DECOR`, xoá `Drifter`/`drawDrifters`/`updateDrifters`/`DRIFT_DEPTH`; `createFishView` luôn tạo nhãn, cá common/uncommon chỉ có tên, rare+ `Tên · Bậc`, font 9px. `npm run typecheck` PASS.
- Bước 2 xong: `cut_fish.py` `POND_CUTS` còn 5 mục + docstring "5 pond decorations"; đã xoá `client/public/assets/pond/{turtle,jellyfish,octopus,seahorse}.png`; README mục Fishing pond bỏ câu drifters, thêm câu mọi cá có nhãn tên nhỏ. `npm run typecheck` PASS.
- Bước 3 xong: `PondView.ts` bỏ `"seaweed_brown"` khỏi `POND_DECOR` và xoá 2 dòng `put("seaweed_brown", ...)` trong `drawBottomDecor`; comment sửa thành "Green seaweed clusters..."; đã xoá `client/public/assets/pond/seaweed_brown.png`; `cut_fish.py` `POND_CUTS` còn 4 mục + docstring "4 pond decorations". `npm run typecheck` PASS.
- Không đổi DOM/UI (nhãn vẽ trong canvas Phaser) nên không có dòng Selectors.
- Docs checked: README mục Fishing pond chỉ nói "seaweed, starfish, shells and a crab" (seaweed_green vẫn còn) nên không cần sửa; AGENTS.md chỉ nhắc "pond decor" chung nên không cần sửa.

## Test status
- Lần chạy cuối: Verify — typecheck PASS, e2e 67 passed.
- Kết quả từng test: không có test case (chỉ typecheck)
- Fail chi tiết: không

## Verify
- `npm run typecheck`: PASS. Cả bộ e2e: 67 passed.
- Mọi cá trong hồ có nhãn tên nhỏ (Cá rô, FISH_TEST), không còn rùa/sứa/bạch tuộc/cá ngựa: PASS — `.agents/screenshots/task-24-pond-labels.png`
- Lưu ý: ảnh chụp ở chế độ FISH_TEST nên chỉ thấy cá thường; nhãn `Tên · Bậc` của cá rare+ không được chụp.

VERIFY: PASS
## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
