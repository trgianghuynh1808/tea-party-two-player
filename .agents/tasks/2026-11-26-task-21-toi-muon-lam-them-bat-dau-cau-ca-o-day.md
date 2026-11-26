# Task: Thẻ "Câu cá" trong bảng "Sẵn sàng mở quán?"

APPROVED_BY_MANAGER

Verify mode: light

## Ý tưởng
- Ảnh người dùng gửi là bảng "☀️ Sẵn sàng mở quán?" với 2 thẻ Tiệm trà / Nhà hàng: thêm thẻ thứ 3 "🎣 Câu cá" ngay cạnh, có nút "▶ Bắt đầu câu".
- Bấm thẻ: server dịch người bấm tới ao (điểm vào ao) rồi bắt đầu phiên câu; nếu phiên đang chạy thì chỉ đưa người đó vào ao.
- Không đụng luật sẵn có: không câu khi đang có ca làm; nút "Bắt đầu câu" trong ao vẫn giữ.

## Mục tiêu
1. Bảng chọn ca ngoài sân/trong quán có thẻ "Câu cá" cùng kiểu với 2 thẻ kia (icon, tên, thời lượng 10 phút, nút bắt đầu).
2. Bấm thẻ khi đang đứng ngoài ao → người chơi xuất hiện ở ao và phiên câu bắt đầu (`fishPhase === "fishing"`).
3. Đang có ca làm thì không câu được (giữ nguyên guard); bảng vẫn ẩn khi đứng ở ao.

## Quyết định đã chốt
- Warp bằng server (client không tự đổi toạ độ): dùng cùng cách `handleUseDoor` (set x/y, `teleportSeq++`, `resetMoveBudget`).
- Không đổi `shared/`, không thêm message mới: tái dùng `Messages.StartFishing`.

## Ngữ cảnh
- Ảnh tham khảo: `.agents/attachments/T21/req-1.jpg` (bảng "Sẵn sàng mở quán?", 2 thẻ `.venue-pick` Tiệm trà / Nhà hàng, mỗi thẻ: icon, tên, `⏱ N phút`, `⭐ $...`, nút `▶ Bắt đầu ca`; dưới cùng link "Ẩn bảng để đi dạo").
- `server/src/rooms/BobaShopRoom.ts` → `handleStartFishing(client)` (~dòng 995): hiện `return fail("Phải đứng ở ao hồ mới câu được")` khi `areaOf(player) !== "pond"`, và `return` sớm nếu `fishPhase === "fishing"`. Guard ca làm: `if (this.state.phase === GamePhase.Playing) return fail(...)` giữ nguyên, đặt TRƯỚC khi warp.
- Warp mẫu (`handleUseDoor`, ~dòng 1145): `player.bedId = ""; player.x = spawn.x; player.y = spawn.y; player.direction = "up"; player.teleportSeq++; this.resetMoveBudget(client.sessionId);` với `spawn = POND_ENTRY_SPAWN` (từ `@boba/shared`, `shared/src/world.ts`).
- Thứ tự mới: guard ca → nếu `areaOf(player) !== "pond"` thì warp tới `POND_ENTRY_SPAWN` → nếu `fishPhase === "fishing"` thì return (đã vào ao) → khởi tạo phiên như cũ.
- `client/src/ui/ShiftOverlay.ts` → `actions(startLabel)` dựng `.venue-picks` từ `Object.values(VENUES)`; thêm thẻ thứ 3 vào cùng `picks` (class `venue-pick fish`, id `shift-fish-pick`), nội dung: `🎣` / `Câu cá` / `⏱ 10 phút` (dùng hằng có sẵn nếu có ở `shared/src/fishing.ts`, ví dụ thời lượng phiên; không hard-code số mới nếu hằng đã có) / `🐟 Cá & cần câu` / `▶ Bắt đầu câu`. Click: `this.room.send(Messages.StartFishing)`, blur. Ở `renderResults` hiện cũng gọi `actions(...)` nên thẻ xuất hiện ở cả hai; chấp nhận được.
- CSS thẻ: `client/src/style.css` ~dòng 1047 (`.venue-picks`, `.venue-pick`); chỉ chỉnh nếu 3 thẻ không vừa hàng (đổi `flex-wrap`/độ rộng).
- Overlay tự ẩn ở ao (`setArea`), nên sau warp bảng biến mất và `FishingPanel` hiện HUD.
- Facts để test: hook `window.__GAME__` (xem `tests/fishing.spec.ts` + `tests/helpers.ts` → `joinAsHost`, có helper `snap(page)` đọc `fishPhase`, `me.x/y`); server test chạy `FISH_SECONDS=20 FISH_TEST=1 DEBUG_WARP=1`; tên user duy nhất `p1-${Date.now().toString(36)}-n`; Playwright không import được module TS server. `fishPhase` ban đầu là `""`/idle, sau khi bắt đầu là `"fishing"`. Người chơi mới vào đang ở ngoài sân (yard) nên bảng chọn ca hiện sẵn.
- Selectors: ví dụ `#shift-fish-pick` — bước test PHẢI đọc dòng `Selectors:` trong "Trạng thái hiện tại" (bước 2 ghi lại khi xong).
- Kiểm tra spec cũ: grep `Phải đứng ở ao` trong `tests/` — nếu có test mong đợi bị từ chối khi gửi `start_fishing` ngoài ao thì cập nhật cho khớp hành vi mới.

## Plan
- [x] 1. [vừa] `server/src/rooms/BobaShopRoom.ts` → `handleStartFishing`: giữ guard ca làm; nếu người gửi không ở ao thì warp tới `POND_ENTRY_SPAWN` (cùng cách `handleUseDoor`, bỏ `bedId`, `teleportSeq++`, `resetMoveBudget`) thay vì `fail`; nếu `fishPhase === "fishing"` thì dừng sau khi warp. Sửa comment doc của hàm cho đúng. Chạy `npm run typecheck`.
- [x] 2. [vừa] `client/src/ui/ShiftOverlay.ts` → `actions()`: thêm thẻ "🎣 Câu cá" (`#shift-fish-pick`, class `venue-pick fish`) gửi `Messages.StartFishing`; chỉnh `client/src/style.css` nếu 3 thẻ không vừa. Ghi dòng `Selectors:` vào "Trạng thái hiện tại". Chạy `npm run typecheck`.
- [x] 3. [vừa] `tests/fishing.spec.ts` → thêm test T1 (dùng `joinAsHost`, `snap`). Chạy: `npx playwright test tests/fishing.spec.ts -g "T1"` rồi cả `npx playwright test tests/fishing.spec.ts` để chắc test cũ không vỡ.
- [x] 4. [dễ] `README.md` → mục Gameplay/Controls về câu cá: ghi có thể bắt đầu câu từ bảng chọn ca (thẻ "Câu cá"); kiểm tra `AGENTS.md` (không cần đổi nếu không có gì mới) và ghi "Docs checked" vào "Trạng thái hiện tại".

## Test cases
- [x] T1. Bắt đầu câu từ bảng chọn ca — bấm thẻ Câu cá ngoài sân thì được đưa vào ao và phiên bắt đầu — tests/fishing.spec.ts
  - Setup: 1 phiên, `joinAsHost(page, uniqueUser())`, người chơi đang ở sân, chưa có ca.
  - Steps: 1. `snap` ban đầu. 2. Click `#shift-fish-pick` (đọc selector thật ở dòng Selectors). 3. Chờ `fishPhase === "fishing"`.
  - Assert: ban đầu `fishPhase !== "fishing"` và `me.y` ngoài vùng ao (không trong `POND`); sau click `fishPhase === "fishing"`, `me` nằm trong vùng ao (`me.x`/`me.y` gần `POND_ENTRY_SPAWN`, sai số ~40px), `fish.length === FISH_COUNT`, bảng `#shift-overlay` ẩn (`hidden`).

## Trạng thái hiện tại
- Bước 1 xong: `handleStartFishing` giữ guard ca làm trước, warp người gửi tới `POND_ENTRY_SPAWN` (bỏ `bedId`, `teleportSeq++`, `resetMoveBudget`) khi chưa ở ao, rồi mới return nếu `fishPhase === "fishing"`.
- `npm run typecheck` PASS sau bước 1.
- Bước 2 xong: thẻ "🎣 Câu cá" (`#shift-fish-pick`, class `venue-pick fish`) trong `actions()` gửi `Messages.StartFishing`; nhãn dùng `FISH_SECONDS / 60`; `.venue-picks` đổi sang 3 cột, thu nhỏ pill của thẻ cá để vừa hàng.
- `npm run typecheck` PASS sau bước 2.
- Bước 3 xong: thêm test T1 vào `tests/fishing.spec.ts` (bấm `#shift-fish-pick` ngoài sân → `fishPhase === "fishing"`, người chơi ở `POND_ENTRY_SPAWN` ±40px, đủ `FISH_COUNT` cá, `#shift-overlay` ẩn); test cũ vẫn xanh.
- `npm run typecheck` PASS sau bước 3.
- Bước 4 xong: README (Fishing pond + Controls) ghi có thể bắt đầu câu từ thẻ "Câu cá" ở bảng chọn ca; AGENTS.md thêm 1 câu `start_fishing` tự warp từ ngoài ao tới `POND_ENTRY_SPAWN`.
- `npm run typecheck` PASS sau bước 4.
- Docs checked: README.md (Fishing pond, Controls) và AGENTS.md (Architecture) đã cập nhật; không còn chỗ nào mô tả sai hành vi mới.
- Lưu ý: thẻ "Câu cá" cũng hiện ở màn kết quả ca vì `renderResults` dùng chung `actions()` (plan đã chấp nhận). Test mới trùng tiền tố "T1" với test cổng ao cũ nên `-g "T1"` chạy cả hai; cả hai đều PASS.
- Selectors: #shift-fish-pick, .venue-picks, .venue-pick, .venue-pick.fish (client/src/ui/ShiftOverlay.ts và client/src/style.css)
- Docs checked: chưa (sẽ làm ở bước 4).

## Test status
- Lần chạy cuối: 2026-11-26 — `npx playwright test tests/fishing.spec.ts -g "T1"` PASS (2 test), `npx playwright test tests/fishing.spec.ts` PASS (6 test)
- Kết quả từng test:
  - T1: PASS (mới, bắt đầu câu từ bảng chọn ca)
  - T1 (cũ, cổng ao): PASS
  - T2: PASS
  - T3: PASS
  - T4 (2 test): PASS
- Fail chi tiết:

## Verify
- Typecheck PASS; cả bộ e2e 64/64 PASS (T1 PASS).
- Mục tiêu 1: PASS — bảng có thẻ "Câu cá" cùng kiểu 2 thẻ kia (`.agents/screenshots/task-21-fish-card.png`).
- Mục tiêu 2: PASS — bấm thẻ ngoài sân → vào ao, phiên câu chạy (`.agents/screenshots/task-21-fish-started.png`).
- Mục tiêu 3: PASS — guard ca làm giữ nguyên (đọc diff), bảng ẩn ở ao.
- Review diff: không có lỗi chặn.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
