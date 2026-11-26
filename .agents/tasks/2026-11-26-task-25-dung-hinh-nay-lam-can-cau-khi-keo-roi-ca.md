# Task: Dùng hình cần câu pixel-art, đổi màu dây theo level cần

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Cắt 1 mẫu cần câu (ô trên-trái, cần thẳng) từ ảnh người dùng gửi thành `client/public/assets/rod.png`; dùng chung cho cả 5 level cần.
- Khi người chơi đang câu (đã quăng, `hookState` là `drop`/`reel`), vẽ cần câu cầm trên tay nhân vật, dây kéo từ đầu cần xuống lưỡi câu ở hồ.
- Mỗi level cần một màu dây riêng (bảng màu trong `shared/src/fishing.ts`), nâng cấp cần thì dây đổi màu.

## Mục tiêu
- Cần câu hiển thị bằng đúng hình người dùng gửi, ở tay nhân vật khi thả/kéo cá (cả người chơi còn lại cũng thấy).
- Cùng 1 hình cho mọi level; màu dây khác nhau theo `rodLevel` 1..5.

## Quyết định đã chốt
- Cần chỉ hiện khi `hookState` là `drop`/`reel` (lúc dây đang ở dưới hồ), giống chỗ vẽ dây hiện tại. Không đụng server/schema.
- Dùng mẫu cần thẳng ô trên-trái. Đoạn dây có sẵn trong ảnh được giữ làm "dây ngắn" của cần; dây màu vẽ tiếp từ đầu mút dưới-trái của đoạn đó tới lưỡi câu.
- Nhân vật quay trái/phải: cần lật theo hướng nhân vật (`player.dir`, xem ShopScene) — nếu khó thì luôn đặt cần phía hồ (hồ ở phía trên dock), không lật.

## Ngữ cảnh
- Ảnh gốc: `.agents/attachments/T25/req-1.jpg` (980x980, nền xám phẳng ~#d3d5d9). 9 cần câu pixel-art xếp lưới: hàng 1 có 4 cần thẳng, hàng 2 có 2 cần thẳng + 2 cần cong, hàng 3 có 1 cần cong. Mỗi cần: thân xám-xanh chéo từ đỉnh (trên-trái) xuống tay cầm xanh dương ở dưới-phải, guồng quay vàng, 1 đoạn dây đen mảnh từ đỉnh cần xuống góc dưới-trái. Dùng cần ô trên-trái: khoảng x 120–275, y 180–345 trong ảnh.
- Công cụ cắt có sẵn: `client/assets-src/tools/slice_sheet.py` (`sprite_mask`, tách nền phẳng) và `cut_fish.py` (mẫu cắt, copy ảnh từ `.agents/attachments/` sang `client/assets-src/sheets/` khi thiếu). Chạy: `python3 -m venv /tmp/sprite-venv && /tmp/sprite-venv/bin/pip install pillow numpy scipy`. Viết `client/assets-src/tools/cut_rod.py` ngắn: copy ảnh thành `sheets/rod-sheet-1.jpg`, crop ô trên-trái, tách nền (alpha), tight-crop, lưu `client/public/assets/rod.png` (RGBA, kích thước gốc).
- `client/src/scenes/PondView.ts`: `preloadPondTextures(scene)` (dòng ~48) load ảnh; constructor set filter NEAREST cho texture; `drawLines()` (dòng ~284) hiện vẽ `lineBetween(player.x, player.y + 6, player.hookX, player.hookY)` màu `0x3d2c29` cho mọi player có `hookState` `drop`/`reel`, `LINE_DEPTH = 8000`; `destroy()` dọn `lines`. Cần thêm Map sessionId → `Phaser.GameObjects.Image` cho cần, tạo/ẩn/xóa theo player.
- `shared/src/fishing.ts`: `RodDef { level, name, price, reel, bite }`, `RODS` (5 level), `getRod(level)`. Thêm `lineColor: number` vào `RodDef` (hex số, ví dụ L1 `0x3d2c29` nâu, L2 `0x2e9e44` xanh lá, L3 `0x1e88e5` xanh dương, L4 `0x8e44ad` tím, L5 `0xf5b301` vàng) và hàm `rodLineColor(level)`. Màu phải khác nhau và đọc rõ trên nền nước.
- `player.rodLevel` (schema, number), `player.hookState` ("", "drop", "reel"), `player.hookX/hookY`, `player.x/y`.
- `client/src/testHook.ts`: `GameTestHook` + `installTestHook(room, getShopScene)`; `getShopScene` trả về object cấu trúc `StationLabelScene = { stationLabelTexts(): string[] }`. Thêm method `pondRod(): { visible: boolean; lineColor: number } | null` (cần của người chơi hiện tại) — ShopScene cần expose `pondRodInfo()` gọi `this.pond?.rodInfo(sessionId)`.
- Sự thật để test (xem `tests/fishing.spec.ts`): hook `window.__GAME__` có `room.sessionId`, `state.players.get(id)`, `send(type, payload)`; helper `snap(page)`, `send`, `warp` đã có trong spec; test câu cá chạy server với `FISH_TEST=1`, `FISH_SECONDS` ngắn, `DEBUG_WARP=1` (xem `playwright.config.ts`). Câu cá: `send "start_fishing"` rồi `send "cast"` (hook rơi → `hookState === "drop"`). Nâng cấp cần: `send "upgrade_rod"` cần đủ tiền (admin API với `ADMIN_TOKEN=test-admin-token`; xem T3 trong `tests/fishing.spec.ts` cách cấp tiền). Playwright không import được module TS của server.
- Tài liệu: `AGENTS.md`/`README.md` chỉ cần sửa nếu nói về "dây câu"/assets (kiểm tra mục Fishing trong README, thêm `cut_rod.py` vào Codebase Map nếu có mục tools).

## Plan
- [x] 1. [vừa] `client/assets-src/tools/cut_rod.py` → viết script cắt cần ô trên-trái từ `.agents/attachments/T25/req-1.jpg` (copy vào `client/assets-src/sheets/rod-sheet-1.jpg`), chạy để sinh `client/public/assets/rod.png` (nền trong suốt, tight-crop, mở ảnh kiểm tra bằng mắt). Ghi lại trong Trạng thái hiện tại tọa độ đầu cần (điểm cao nhất) và đầu mút dưới-trái của đoạn dây trong ảnh đã cắt (px) để bước 3 dùng.
- [x] 2. [khó] `shared/src/fishing.ts` → thêm `lineColor: number` vào `RodDef` và 5 phần tử `RODS`; thêm `export const rodLineColor = (level: number) => getRod(level)?.lineColor ?? RODS[0].lineColor`. Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/src/scenes/PondView.ts` → `preloadPondTextures`: `scene.load.image("rod", "assets/rod.png")`; constructor set NEAREST cho texture `rod`; thêm `private readonly rods = new Map<string, Phaser.GameObjects.Image>()`; `drawLines()`: với mỗi player có hook `drop`/`reel`, tạo/cập nhật ảnh cần (origin ở tay cầm, đặt cạnh `player.x/y`, depth `LINE_DEPTH - 1`), tính điểm đầu dây = đầu mút dưới-trái của đoạn dây trong ảnh (theo số đo bước 1, hằng số `ROD_LINE_ANCHOR`), vẽ dây `lineStyle(2, rodLineColor(player.rodLevel), 0.95)` từ điểm đó tới `hookX/hookY`; ẩn/xóa ảnh cần của player không còn hook; `destroy()` dọn `rods`. Thêm `rodInfo(sessionId): { visible: boolean; lineColor: number } | null`.
- [x] 4. [vừa] `client/src/testHook.ts` → thêm `pondRod()` vào `GameTestHook` + `installTestHook`; mở rộng kiểu `StationLabelScene` với `pondRodInfo(sessionId)`; `client/src/scenes/ShopScene.ts` → thêm method `pondRodInfo(sessionId: string)` gọi `this.pond?.rodInfo(sessionId) ?? null`; `pondRod()` truyền `room.sessionId`. (Cả 3 file thuộc client, cùng 1 chủ đề.)
- [x] 5. [vừa] `tests/fishing.spec.ts` → thêm test T1, T2 bên dưới (mở rộng file có sẵn, dùng lại helper). Chạy: `npx playwright test tests/fishing.spec.ts -g "T5|T6"` (đặt tên test bắt đầu bằng "T5:" và "T6:" cho khỏi trùng T1–T4 đang có). Sau đó `npm run typecheck`.
- [x] 6. [dễ] `README.md` → kiểm tra mục Fishing/Gameplay có nhắc "dây/cần câu" thì cập nhật (cần câu pixel-art, dây đổi màu theo level); nếu không cần sửa thì ghi "Docs checked: no change needed" vào Trạng thái hiện tại.

## Test cases
- [x] T1. Cần hiện khi thả dây — cần câu hiện ở tay lúc `hookState` = drop và ẩn khi thu dây — tests/fishing.spec.ts (tên test: "T5: rod sprite shows while the hook is out")
  - Setup: 1 phiên, user `rod1-${Date.now()}`, server FISH_TEST, giống setup T1/T2 hiện có trong spec (vào phòng, `start_fishing`).
  - Steps: 1. `pondRod()` trước khi cast · 2. `send cast`, poll tới `hookState === "drop"` · 3. `pondRod()` · 4. `send retract`, poll tới `hookState === ""` · 5. `pondRod()`.
  - Assert: bước 1 `visible` false hoặc null; bước 3 `visible` true; bước 5 `visible` false hoặc null.
- [x] T2. Màu dây đổi theo level — sau `upgrade_rod` màu dây khác level 1 — tests/fishing.spec.ts (tên test: "T6: line color changes after a rod upgrade")
  - Setup: 1 phiên, user `rod2-${Date.now()}`, cấp tiền >= 300 bằng admin API như T3 (`ADMIN_TOKEN=test-admin-token`), `start_fishing`.
  - Steps: 1. `send cast`, poll `hookState === "drop"`, đọc `pondRod().lineColor` (c1) · 2. `send retract`, `send upgrade_rod`, poll `me.rodLevel === 2` · 3. `send cast`, poll `drop`, đọc `pondRod().lineColor` (c2).
  - Assert: c1 === 0x3d2c29; c2 === 0x2e9e44 (đúng giá trị L1/L2 trong `RODS`, hoặc import `RODS` từ `@boba/shared` như spec hiện có); c1 !== c2.

## Trạng thái hiện tại
Selectors: `window.__GAME__.pondRod()` → `{ visible: boolean; lineColor: number } | null` (client/src/testHook.ts, chỉ tồn tại với `?test=1`; gọi qua ShopScene.pondRodInfo → PondView.rodInfo)

Bước 1 xong: `client/assets-src/tools/cut_rod.py` sinh `client/public/assets/rod.png` (151x169 RGBA, nền trong suốt, tight-crop, kích thước gốc; sheet copy tại `client/assets-src/sheets/rod-sheet-1.jpg`; ô cần trên-trái trong sheet: x 124–275, y 179–348, 4939 px). Tọa độ trong rod.png cho bước 3: đầu cần (điểm cao nhất) = (63, 0); đầu mút dưới-trái của đoạn dây (ROD_LINE_ANCHOR) = (1, 139). Sheet có viền khung tối ~1px quanh mép, script phải trim FRAME=2 trước khi tách nền phẳng (nếu không `sprite_mask("flat")` lấy nhầm màu viền làm nền).
Lưu ý: model không xem được ảnh, nên "kiểm tra bằng mắt" được thay bằng kiểm tra lập trình trên rod.png: 4 góc trong suốt, toàn ảnh là 1 thành phần liên thông (đoạn dây mảnh dính liền thân cần), thân xám-xanh chéo từ (63,0), guồng vàng tại x 96–112 / y 121–139 (122 px), tay cầm dưới-phải, dây đen chạy từ đầu cần xuống (1–3, 138–139). Người duyệt nên liếc nhanh `client/public/assets/rod.png` (bản phóng to 4x tại `/tmp/rod-preview.png`).
Lưu ý: docs (README mục Fishing, AGENTS.md Codebase Map thêm `cut_rod.py`) theo plan thuộc bước 6, chưa sửa ở bước này.

Bước 2 xong: `shared/src/fishing.ts` có `lineColor: number` trong `RodDef`, 5 phần tử `RODS` lần lượt `0x3d2c29` / `0x2e9e44` / `0x1e88e5` / `0x8e44ad` / `0xf5b301`, và `export const rodLineColor(level)` (level lạ → màu L1). Chỉ `RODS` định nghĩa literal `RodDef` nên thêm trường bắt buộc không ảnh hưởng chỗ khác.

Bước 3 xong: `PondView.ts` load texture `rod` (NEAREST), thêm `rods` Map + hằng số `ROD_HANDLE` (130,150) và `ROD_LINE_ANCHOR` (1,139); `drawLines()` vẽ ảnh cần (origin tại tay cầm, đặt tại điểm tay `(player.x, player.y+6)`, depth `LINE_DEPTH-1`), dây `lineStyle(2, rodLineColor(player.rodLevel), 0.95)` từ đầu mút đoạn dây trong ảnh tới hook, xóa ảnh cần của player không còn hook/đã rời phòng; `destroy()` dọn `rods`; thêm `rodInfo(sessionId)`.
Lưu ý: bước 3 dùng phương án fallback đã chốt trong "Quyết định": KHÔNG lật cần theo `player.dir` (plan bước 3 không nhắc flip) — cần luôn nghiêng lên-trái từ tay người chơi, mọi hướng nhân vật như nhau. Nước hồ thực tế nằm DƯỚI dock (DOCK y 70–150, WATER y 160–580; quyết định ghi "hồ phía trên dock" là sai sự thật geometry), dây vẽ từ đầu mút đoạn dây xuống hook nên nhìn vẫn liền mạch. Cần vẽ đúng kích thước gốc 151x169 (plan không yêu cầu scale, nhân vật ~60px cao). Muốn chỉnh nghiêng/flip thì sửa `drawLines()` trong PondView.

Bước 4 xong: `testHook.ts` — kiểu `StationLabelScene` thêm `pondRodInfo(sessionId)`, `GameTestHook` thêm `pondRod()`, `installTestHook` gán `pondRod: () => getShopScene()?.pondRodInfo(room.sessionId) ?? null`; `ShopScene.ts` thêm method `pondRodInfo(sessionId)` gọi `this.pond?.rodInfo(sessionId) ?? null` (đặt cạnh `stationLabelTexts()`). `main.ts` không phải sửa (truyền cả ShopScene nên kiểu structural tự khớp).

Bước 5 xong: `tests/fishing.spec.ts` thêm helper `pondRod(page)` và 2 test cuối file — "T5: rod sprite shows while the hook is out" (T1) và "T6: line color changes after a rod upgrade" (T2, fund shop 500 qua admin API rồi upgrade lên level 2). `npx playwright test tests/fishing.spec.ts -g "T5|T6"` PASS (2/2), `npm run typecheck` PASS.
Lưu ý: tên user test dùng `rod1-`/`rod2-` + `Date.now().toString(36)` thay vì `Date.now()` như plan, vì `USERNAME_MAX = 16` khiến "rod2-" + 13 chữ số bị admin API trả 400; base36 vẫn duy nhất theo từng lần chạy.

Bước 6 xong: README mục Fishing thêm cần câu pixel-art + dây đổi màu theo level (nâu/xanh lá/xanh dương/tím/vàng cho L1–L5) và nhắc `cut_rod.py` → `client/public/assets/rod.png`; AGENTS.md Codebase Map thêm `cut_rod.py` vào danh sách tools. Không có lệnh test riêng; `npm run typecheck` PASS.
Lưu ý: dù plan bước 6 chỉ ghi `README.md`, đã sửa thêm 1 dòng AGENTS.md (Codebase Map) vì Documentation Rules yêu cầu khi thêm script mới và phần Ngữ cảnh có nhắc "thêm cut_rod.py vào Codebase Map nếu có mục tools".

## Test status
- Lần chạy cuối: bước 6 chỉ sửa tài liệu, không có lệnh test riêng; `npm run typecheck` PASS. Lần chạy test gần nhất: `npx playwright test tests/fishing.spec.ts -g "T5|T6"` PASS (2/2, sau bước 5).
- Kết quả từng test:
  - T1: PASS (spec "T5: rod sprite shows while the hook is out")
  - T2: PASS (spec "T6: line color changes after a rod upgrade")
- Fail chi tiết: lần đầu T6 fail ở bước fund admin API (400) do username 18 ký tự > USERNAME_MAX=16; đã đổi sang base36, chạy lại PASS.

## Verify
- Toàn bộ e2e: 69/69 PASS; `npm run typecheck` PASS.
- T1 (cần hiện khi thả dây): PASS. T2 (màu dây đổi theo level): PASS.
- Ảnh: `.agents/screenshots/task-25-rod-in-pond.png` — cần pixel-art ở tay nhân vật, dây nối liền từ đầu cần xuống lưỡi câu.
Lưu ý: cần vẽ kích thước gốc 151x169 nên khá to, đầu cần chạm mép trên khung game; có thể scale nhỏ lại (ROD_HANDLE/scale trong PondView) nếu thấy to quá. Cần không lật theo hướng nhân vật.
VERIFY: PASS
## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa: 0 (script chạy đúng ngay lần đầu)
- Model dùng: opencode-go/glm-5.3
