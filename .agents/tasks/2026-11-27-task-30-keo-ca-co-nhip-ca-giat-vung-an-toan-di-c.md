# Task: Kéo cá có nhịp (cá giật, vùng an toàn di chuyển, độ khó theo tier)

APPROVED_BY_MANAGER

Verify mode: full
<!-- none: refactor/đổi chữ/không ảnh hưởng UI · light: mặc định · full: luồng người dùng mới, nhiều người dùng, logic đồng bộ -->

## Mục tiêu
- Kéo cá không còn chỉ "giữ nút là xong": có một con trỏ lực căng và một vùng an toàn di chuyển; chỉ tiến độ kéo tăng khi con trỏ nằm trong vùng.
- Cá giật định kỳ (vùng nhảy sang chỗ khác); cá hiếm hơn thì vùng hẹp hơn, di chuyển nhanh hơn và giật dày hơn.
- Thanh kéo trên UI hiển thị vùng an toàn + con trỏ; các test cũ (giữ Space để bắt cá) vẫn chạy được.

## Ý tưởng
- Server mô phỏng (`updateHookReel`): `reelPos` (0..1) tăng khi giữ, giảm khi thả; `zoneCenter` trôi qua lại, thỉnh thoảng "giật" nhảy; trong vùng → tiến độ tăng theo `reelRate`, ngoài vùng → tiến độ giảm.
- Thông số vùng/giật theo tier nằm ở `shared/src/fishing.ts` (`reelDifficulty(tier)`); cần cao hơn giảm bớt độ khó (vùng rộng hơn một chút).
- `FISH_TEST=1` mặc định vùng phủ cả thanh (test cũ không đổi); message test `debug_reel_mode` (chỉ khi `DEBUG_WARP=1`) bật vùng thật, cố định, không giật để test xác định.

## Quyết định đã chốt
-

## Ngữ cảnh
- `shared/src/fishing.ts`: có `FishTier`, `FISH_TIERS`, `RODS[].reel`, `reelRate(rodLevel, fish)`, hằng `REEL_START=0.3`, `REEL_DECAY=0.15`, `REEL_TIMEOUT=25`. Thêm vào đây:
  ```ts
  export interface ReelDifficulty { zoneWidth: number; zoneSpeed: number; jerkEvery: number } // jerkEvery = giây giữa 2 lần giật
  export const REEL_DIFFICULTY: Record<FishTier, ReelDifficulty> // common rộng 0.5/chậm/6s → mythic 0.2/nhanh/2s
  export const reelDifficulty = (tier: FishTier, rodLevel: number): ReelDifficulty // rod cao: zoneWidth * (1 + 0.05*(level-1))
  export const REEL_POS_RISE = 0.6, REEL_POS_FALL = 0.6 // /giây khi giữ / thả
  ```
- `shared/src/schema.ts` class `Player` (dòng ~26-47, cạnh `reelProgress`): thêm `@type("number") reelPos`, `zoneCenter`, `zoneWidth`, `@type("number") jerkSeq` (tăng mỗi lần giật, client dùng để rung/hiệu ứng).
- `shared/src/index.ts`: `Messages` (có `DebugWarp: "debug_warp"` + interface `DebugWarpMessage`); thêm `DebugReelMode: "debug_reel_mode"` và `DebugReelModeMessage { real: boolean }`.
- `server/src/rooms/BobaShopRoom.ts`: `updateHookDrop` (~922) đặt `hookState="reel"`, `reelProgress=REEL_START` khi cắn → khởi tạo `reelPos=0.5`, vùng ở giữa. `updateHookReel` (~953) hiện: `progress += holding ? dt*rod.reel/def.hold : -dt*REEL_DECAY`. `clearHook` (~992) dọn các map nội bộ (thêm map `reelZone: Map<sessionId,{dir,jerkTimer}>`). `messages` ~dòng 261 và khối `debug_warp` ~273 (chỉ đăng ký khi `DEBUG_WARP=1`). `FISH_TEST` const ở dòng 114.
- Quy tắc mới: `reelPos` ±dt*REEL_POS_RISE/FALL kẹp 0..1; `inZone = |reelPos - zoneCenter| <= zoneWidth/2`; trong vùng: `progress += dt*rod.reel/def.hold`; ngoài vùng: `progress -= dt*REEL_DECAY`. Vùng trôi `zoneCenter += dir*zoneSpeed*dt` (bật đầu khi chạm 0+w/2 hoặc 1-w/2); mỗi `jerkEvery` ± ngẫu nhiên: `zoneCenter` nhảy tới vị trí ngẫu nhiên khác, `jerkSeq++`. Khi `FISH_TEST` và chưa bật `real`: `zoneWidth=1`, `zoneCenter=0.5`, không giật.
- `client/src/ui/FishingPanel.ts`: `reelFill` + `reelEl` (dòng ~86-110, cập nhật ~182). `client/src/style.css` ~1208 `.fishing-reel`, `.reel-track`, `.reel-fill`. Thêm vào `.reel-track` hai phần tử: `#reel-zone` (vùng an toàn, left/width % theo `zoneCenter/zoneWidth`) và `#reel-marker` (con trỏ, left % theo `reelPos`); chiều dọc/ngang tuỳ ý nhưng thanh tiến độ `reel-fill` giữ nguyên (có thể thêm track thứ hai cho tiến độ). Thêm class rung `.reel-jerk` ngắn khi `jerkSeq` đổi. Toast "Giữ để kéo" đổi thành "Giữ để kéo, giữ con trỏ trong vùng xanh".
- Sự thật để test: `window.__GAME__` có `send(type, payload)`, `state.players.get(sessionId)`, `room.sessionId`; `tests/fishing.spec.ts` có sẵn helper `snap(page)` (trả `me.{hookState,reelProgress,...}`; thêm `reelPos/zoneCenter/zoneWidth/jerkSeq` vào snap), `send`, `warp`, `aimAt`, `enterPond`, `joinAsHost`, `uniqueUser`; server test chạy `FISH_SECONDS=20 FISH_TEST=1 DEBUG_WARP=1` (`playwright.config.ts`) nên mọi cá là Cá rô luôn cắn. Vòng cast→cắn lặp lại như test "T2: cast, bite, hold the reel" (dòng ~214); tách thành helper `biteOnce(page)` trong file nếu cần. Playwright không import được module TS của server.
- Spec cũ "T2 ... hold the reel" phải vẫn PASS không sửa (vùng phủ cả thanh trong FISH_TEST).

## Plan
- [x] 1. [khó] `shared/src/fishing.ts` → thêm `REEL_DIFFICULTY`, `reelDifficulty`, `REEL_POS_RISE/FALL`; `shared/src/schema.ts` → thêm `reelPos`, `zoneCenter`, `zoneWidth`, `jerkSeq` vào `Player`; `shared/src/index.ts` → thêm `Messages.DebugReelMode` + `DebugReelModeMessage`. Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/rooms/BobaShopRoom.ts` → `updateHookDrop` (khởi tạo vùng/con trỏ), `updateHookReel` (luật vùng an toàn, trôi, giật, `jerkSeq`), `clearHook` (dọn state), handler `debug_reel_mode` (chỉ khi `DEBUG_WARP=1`: bật `real` cho người gửi → vùng thật rộng 0.3 tại 0..0.3 cố định, không giật, không trôi). Chạy `npm run typecheck`.
- [x] 3. [vừa] `client/src/ui/FishingPanel.ts` → thêm `#reel-zone` và `#reel-marker` trong thanh kéo, cập nhật theo `reelPos/zoneCenter/zoneWidth`, class `.reel-jerk` khi `jerkSeq` đổi, đổi toast; `client/src/style.css` → style cho các phần tử mới. Ghi dòng `Selectors:` vào "Trạng thái hiện tại". Chạy `npm run typecheck`.
- [x] 4. [vừa] `tests/fishing.spec.ts` → thêm `reelPos/zoneCenter/zoneWidth/jerkSeq` vào `snap`, viết T1 và T2 bên dưới (đọc dòng `Selectors:` ở bước 3 cho selector UI). Chạy `npx playwright test tests/fishing.spec.ts -g "T30"` rồi `npx playwright test tests/fishing.spec.ts` để chắc test cũ vẫn PASS.
- [x] 5. [dễ] `README.md` → mục Gameplay/Controls: mô tả cách kéo cá mới (vùng an toàn, cá giật); `AGENTS.md` → Architecture: nhắc `debug_reel_mode` cạnh `debug_warp` và vùng kéo trong `fishing.ts`.

## Test cases
- [x] T1. T30 Vùng thật khi cá cắn — giữ con trỏ trong vùng thì bắt được cá, giữ quá tay (con trỏ lên cao khỏi vùng) thì tiến độ tụt — tests/fishing.spec.ts
  - Setup: user mới `uniqueUser()`, `joinAsHost`, `enterPond`, 1 phiên; gửi `start_fishing`, rồi `send("debug_reel_mode", { real: true })`.
  - Steps: 1. cast lặp tới khi `me.hookState === "reel"` (như spec cũ) · 2. đọc `zoneWidth`, `reelProgress` · 3. `send("reel",{holding:true})` giữ 2s liên tục (con trỏ rời vùng 0..0.3 sau ~0.5s) · 4. đọc `reelPos`, `reelProgress` · 5. `send("reel",{holding:false})`.
  - Assert: bước 2 `zoneWidth` ≈ 0.3 (không bằng 1); bước 4 `reelPos > 0.3 + 0.0` (ngoài vùng) và `reelProgress` thấp hơn giá trị lớn nhất từng thấy trong lúc giữ (không đạt 1, `fishCaught` vẫn 0); UI `#reel-zone` và `#reel-marker` hiển thị khi `hookState==="reel"`.
- [x] T2. T30 Cá giật & độ khó theo tier — tests/fishing.spec.ts
  - Setup: như T1 nhưng KHÔNG gửi `debug_reel_mode`.
  - Steps: 1. cast tới khi `hookState==="reel"` · 2. đọc `zoneWidth`, `zoneCenter`.
  - Assert: `zoneWidth === 1` (FISH_TEST dễ nhất, không bị giật) và `jerkSeq === 0`; thêm đoạn kiểm bằng `page.evaluate` không import server: cá rô vẫn bắt được bằng giữ Space (đã phủ bởi spec "T2: cast, bite, hold the reel" — chạy lại ở bước 4 để chắc không hỏng). Bắt buộc tên test chứa "T30".

## Trạng thái hiện tại
- Bước 1 xong (commit 74cb325): `REEL_DIFFICULTY` (common 0.5/0.15/6s → mythic 0.2/0.35/2s), `reelDifficulty(tier, rodLevel)` (+5% bề rộng mỗi level cần), `REEL_POS_RISE/FALL = 0.6`; `Player` có `reelPos/zoneCenter/zoneWidth/jerkSeq`; `Messages.DebugReelMode` + `DebugReelModeMessage`. `npm run typecheck` PASS.
- Bước 2 xong (commit 7243706): `startReelZone` khởi tạo khi cá cắn (`reelPos=0.5`, vùng ở giữa; FISH_TEST chưa bật real → vùng phủ cả thanh; real → cố định 0.3 tại 0..0.3); `updateHookReel`: con trỏ ±`REEL_POS_RISE/FALL` kẹp 0..1, trong vùng mới tăng tiến độ, ngoài vùng tụt `REEL_DECAY`; `updateReelZone` trôi bật đầu + giật mỗi `jerkEvery` (`jerkSeq++`); `clearHook` dọn map `reelZone`; handler `debug_reel_mode` trong khối `DEBUG_WARP`. `npm run typecheck` PASS.
- Lưu ý: flag `real` (Set `reelReal`) được dọn trong `onLeave` chứ không phải `clearHook`, vì T1 gửi `debug_reel_mode` một lần rồi cast lặp lại (mỗi lần thả câu trống đều qua `clearHook`); dọn ở `clearHook` sẽ làm mất flag và T1 fail.
- Lưu ý: T1 ghi chú "(con trỏ rời vùng 0..0.3 sau ~0.5s)" không khớp khởi tạo `reelPos=0.5` (con trỏ nằm ngoài vùng 0..0.3 ngay từ đầu theo đúng spec); các assert của T1 (zoneWidth ≈ 0.3, reelPos > 0.3 sau 2s giữ, tiến độ tụt, fishCaught 0) vẫn thỏa với luật hiện tại.
- Bước 3 xong (commit 9a28c14): `FishingPanel` thêm `#reel-zone` + `#reel-marker` vào `.reel-track` hiện có (cùng track với `reel-fill` giữ nguyên; fill ở dưới, zone xanh bán trong suốt và con trỏ đen ở trên, `position: relative` + `overflow: hidden` cho track); cập nhật mỗi 100 ms theo `zoneCenter/zoneWidth/reelPos` (kẹp 0..1, tâm vùng kẹp [w/2, 1-w/2]); rung `.reel-jerk` (shake 0.25s, restart bằng reflow) chỉ khi `jerkSeq` TĂNG so với lần trước (reset về 0 ở lần cắn mới không rung; `setArea` vào lại ao cũng reset `lastJerkSeq`); toast đổi thành "❗ Cá cắn câu! Giữ để kéo, giữ con trỏ trong vùng xanh". `npm run typecheck` PASS.
- Selectors: #reel-zone, #reel-marker, .reel-jerk, .reel-track, #fishing-reel, #fishing-hold (client/src/ui/FishingPanel.ts; style: client/src/style.css).
- Bước 4 xong (commit 950f022): `snap` trả thêm `reelPos/zoneCenter/zoneWidth/jerkSeq`; thêm `T30 T1` (bật `debug_reel_mode`, vùng rộng 0.3, giữ 2s → tiến độ tụt, `reelPos > 0.3`, `fishCaught` 0, `#reel-zone`/`#reel-marker` hiển thị) và `T30 T2` (không bật cờ → `zoneWidth === 1`, `jerkSeq === 0`, vẫn bắt được Cá rô khi giữ). `npm run typecheck` PASS.
- Lưu ý: `T30 T1` giữ 2s làm tiến độ về 0 nên cá sổng (`loseHook`); assert vẫn đọc được `reelPos > 0.3` vì `clearHook` không reset `reelPos`. `T30 T2` kiểm lại việc bắt Cá rô bằng giữ, trùng phạm vi spec cũ "T2: cast, bite, hold the reel" (chạy lại toàn file PASS).
- Bước 5 xong (commit f73d801): README (Gameplay › Fishing pond, Mobile, Controls) mô tả con trỏ lực căng, vùng an toàn xanh trôi/giật, độ khó theo tier và cần cao mở rộng vùng; AGENTS.md Architecture nhắc `debug_reel_mode` cạnh `debug_warp` và vùng kéo tune ở `shared/src/fishing.ts` (`reelDifficulty`) / mô phỏng trong `updateHookReel`. `npm run typecheck` PASS.
## Test status
- Lần chạy cuối: `npm run typecheck` (sau bước 5) — PASS. Bước 5 chỉ sửa docs, plan không có lệnh test riêng; kết quả bước 4 vẫn giữ: `npx playwright test tests/fishing.spec.ts -g "T30"` — 2 passed; `npx playwright test tests/fishing.spec.ts` — 19 passed.
- Kết quả từng test:
  - T1: PASS (T30 T1 — tests/fishing.spec.ts)
  - T2: PASS (T30 T2 — tests/fishing.spec.ts)
- Fail chi tiết: không có.

## Verify
- `npm run typecheck`: PASS. Cả bộ e2e `npx playwright test`: 77 passed.
- T1 (vùng thật 0.3, giữ quá tay thì tiến độ tụt, #reel-zone/#reel-marker hiện): PASS.
- T2 (FISH_TEST vùng phủ cả thanh, jerkSeq 0, test cũ giữ Space vẫn bắt cá): PASS.
- Ảnh: `.agents/screenshots/task-30-reel-zone.png` — thanh kéo có vùng an toàn xanh + con trỏ, toast mới hiển thị. PASS.
- Review diff: không có lỗi chặn; docs đã cập nhật.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
