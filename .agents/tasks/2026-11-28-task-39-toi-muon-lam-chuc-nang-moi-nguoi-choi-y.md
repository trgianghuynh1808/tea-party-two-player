# Task: Mời người chơi vào phòng (phòng riêng tư + danh sách online + popup lời mời)

APPROVED_BY_MANAGER

Verify mode: full

## Mục tiêu
- Phòng trở thành riêng tư: người khác không tự vào được (không có nút "Vào", link `?room=` không còn mở cửa cho người lạ); chỉ chủ phòng mời mới vào được.
- Trong phòng, chủ phòng bấm nút "Mời" → thấy danh sách người đang online trong hệ thống, mỗi người có nút "Mời".
- Người nhận thấy popup lời mời (ở sảnh hoặc đang trong game) với nút Đồng ý / Từ chối; đồng ý thì vào phòng đó.

## Ý tưởng
- Thêm một Colyseus room "presence" nhẹ: mọi client đã có tên đều nối vào (kể cả khi đang chơi) để server biết ai online và đẩy lời mời tới đúng người.
- Chủ phòng gửi `invite_player` tới `BobaShopRoom`; server sinh token một lần (hết hạn 2 phút) và gửi qua presence cho người nhận; người nhận join bằng `inviteToken`, `onAuth` kiểm token.
- Nút 🔗 "Mời" (copy link) hiện tại đổi thành mở panel danh sách online; danh sách phòng ở sảnh chỉ còn xem, chỉ phòng của chính mình có "Vào lại".

## Quyết định đã chốt
- Chỉ chủ phòng (`hostName`) mời được; người đã có chỗ trong phòng (vào lại sau rớt mạng) không cần token.
- Khi `DEBUG_WARP=1` (server e2e) `onAuth` vẫn cho vào tự do để các spec cũ dùng `?room=<roomId>` không hỏng.
- Người nhận đang ở phòng khác vẫn nhận popup; đồng ý thì rời phòng cũ rồi vào phòng mới.

## Ngữ cảnh
- `shared/src/lobby.ts`: `JoinOptions`, `JoinError` (4211–4214 đã dùng; thêm `NOT_INVITED: 4215`), `RoomMetadata`. `shared/src/index.ts`: `ROOM_NAME = "boba_shop"`, `Messages` (dòng ~49), `ServerEvents` (dòng ~131). Thêm: `PRESENCE_ROOM_NAME = "presence"`, `Messages.InvitePlayer = "invite_player"` (payload `{ target: string }`, tên người nhận), `Messages.RespondInvite`/`Messages.ListOnline = "list_online"` (client → presence), `ServerEvents.Online = "online"` (payload `OnlinePlayer[]` = `{ name: string; roomId?: string }`), `ServerEvents.Invite = "invite"` (payload `{ from, roomId, roomName, token }`), `ServerEvents.InviteResult = "invite_result"` (`{ target, ok, reason? }` gửi cho chủ phòng). `JoinOptions.inviteToken?: string`.
- `server/src/index.ts`: `defineServer({ rooms: { [ROOM_NAME]: defineRoom(BobaShopRoom) } })` → thêm `[PRESENCE_ROOM_NAME]: defineRoom(PresenceRoom)`. `/rooms` dùng `matchMaker.query({ name: ROOM_NAME })` nên không bị lẫn presence room.
- `server/src/rooms/BobaShopRoom.ts`: `seats` map (module-level, key = `usernameKey(name)`, có `.room`, `.online`) cho biết ai đang ở phòng nào; `onAuth` (dòng ~323) kiểm tên + chỗ trống: thêm kiểm token ở đây (bỏ qua nếu là chủ phòng `key === this.hostKey`, nếu `seats.get(key)?.room === this`, hoặc `process.env.DEBUG_WARP === "1"`; ngược lại throw `ServerError(JoinError.NOT_INVITED, "Phòng riêng tư, cần được mời")`). Handler message đăng ký trong object `messages` của class (xem kiểu `[Messages.X]` quanh dòng ~270–290), đã có mẫu kiểm chủ phòng ở dòng ~1323 (`this.state.hostName`).
- Token: `private invites = new Map<string /*target key*/, { token: string; expires: number }>()` trong `BobaShopRoom`; dùng `randomUUID()` từ `node:crypto`; token dùng một lần (xoá sau khi `onAuth` chấp nhận). Presence registry: module-level `Map<usernameKey, Client>` export từ `server/src/rooms/PresenceRoom.ts` kèm hàm `sendInvite(targetKey, payload): boolean` và `onlineNames()`; `BobaShopRoom` import hàm này. Trạng thái "đang ở phòng nào" lấy từ `seats` (export thêm hàm `roomIdOf(key)` nếu cần, tránh import vòng: để presence nhận callback hoặc để `BobaShopRoom` tự ghép).
- `PresenceRoom`: `maxClients` lớn, `onAuth` kiểm `normalizeUsername`, cho phép nhiều kết nối cùng tên thay thế kết nối cũ (tab mới của cùng người); `onJoin/onLeave` broadcast `ServerEvents.Online`; `autoDispose = false`.
- Client: `client/src/main.ts` — `client` (Colyseus SDK), `username`, `joinOptions()`, `enter(action)`, `renderRooms()` (nút "Vào" dòng ~228–231), `showLobby()` đọc `invitedRoomId` (`?room=`), `copyLinkBtn` (dòng ~65 và ~596, nút `#copy-link-btn` trong `client/index.html` dòng 69), `startGame(room)`, `currentRoom`, `stopGame()`, `openModal/closeModal`. Tạo `client/src/ui/InvitePanel.ts` (danh sách online + nút mời trong modal) và `client/src/ui/InvitePopup.ts` (popup nhận lời mời, DOM overlay cố định, hiện trên cả sảnh lẫn game). Thêm CSS vào file style hiện có của client (tìm bằng `grep -rn "room-item" client/`).
- `client/src/testHook.ts`: `window.__GAME__` có `room`, `send`, `state`; thêm `presence?: Room` không cần. Test dùng DOM.
- Test facts: `window.__GAME__.room.roomId` (không phải `room.id`); chủ phòng vào bằng `joinAsHost(page, name)` trong `tests/helpers.ts`; phiên thứ 2 vào sảnh bằng `page.goto("/?test=1")`, điền `#username-input`, submit `#name-form button[type=submit]` (đứng ở sảnh, không tạo phòng). Playwright không import được module TS của server. Server e2e có `DEBUG_WARP=1` nên test lời mời phải kiểm tra token bằng cách… không dùng được ở e2e (bị bypass); vì vậy T1 kiểm tra luồng mời/đồng ý bằng UI, còn "không tự vào được" kiểm bằng giao diện (không có nút Vào). Username duy nhất: `` `p1-${Date.now()}` ``. Selectors dự kiến (ví dụ, bước test ĐỌC dòng `Selectors:` trong Trạng thái hiện tại do bước UI ghi lại): `#invite-btn`, `#invite-list .invite-row`, `.invite-row button`, `#invite-popup`, `#invite-accept`, `#invite-decline`.

## Plan
- [x] 1. [khó] `shared/src/lobby.ts` → thêm `JoinError.NOT_INVITED`, `JoinOptions.inviteToken`, kiểu `OnlinePlayer`, `InvitePayload`; `shared/src/index.ts` → thêm `PRESENCE_ROOM_NAME`, `Messages.InvitePlayer`, `Messages.ListOnline`, `ServerEvents.Online/Invite/InviteResult` như mô tả ở Ngữ cảnh. Chạy `npm run typecheck`.
- [x] 2. [khó] `server/src/rooms/PresenceRoom.ts` (mới) + `server/src/index.ts` đăng ký phòng; `server/src/rooms/BobaShopRoom.ts` → handler `Messages.InvitePlayer` (chỉ chủ phòng, người nhận phải online qua presence, phòng chưa đầy, không tự mời mình, phát token qua `sendInvite`, báo `InviteResult` cho chủ phòng) và kiểm `inviteToken` trong `onAuth` theo Ngữ cảnh. Cập nhật `README.md` + `AGENTS.md` (Architecture: presence room, message mới, phòng riêng tư; Codebase Map). Chạy `npm run typecheck`.
- [x] 3. [khó] `client/src/ui/InvitePanel.ts`, `client/src/ui/InvitePopup.ts` (mới), `client/src/main.ts`, `client/index.html`, CSS client → nối presence room sau khi có tên (kết nối lại khi đổi tên/ rớt mạng), nút `#copy-link-btn` đổi thành `#invite-btn` mở panel danh sách online (loại chính mình và người đã trong phòng này, mỗi dòng nút "Mời", báo "Đã mời"/lỗi), popup nhận lời mời với Đồng ý/Từ chối (đồng ý → `enter(() => client.joinById(roomId, { ...joinOptions(), inviteToken }))`, rời phòng hiện tại nếu đang chơi), `renderRooms()` chỉ còn "Vào lại" cho phòng của mình (phòng người khác: nhãn "Riêng tư", nút disabled), bỏ tự join `?room=` cho người chưa có chỗ (giữ cho refresh của người đang ở phòng: lỗi `NOT_INVITED` → `describeError` hiện "Phòng riêng tư, cần được mời"). Ghi dòng `Selectors:` vào "Trạng thái hiện tại" khi xong. Chạy `npm run typecheck`.
- [x] 4. [vừa] `tests/invite.spec.ts` → viết T1 và T2 (đọc dòng `Selectors:` ở Trạng thái hiện tại). Chạy `npx playwright test tests/invite.spec.ts`.

## Test cases
- [x] T1. Mời và nhận lời mời — chủ phòng thấy người online, mời, người nhận thấy popup, đồng ý thì vào cùng phòng — tests/invite.spec.ts
  - Setup: 2 browser context. Host `host-${Date.now()}` vào bằng `joinAsHost`. Guest `guest-${Date.now()}` mở `/?test=1`, nhập tên, ở lại sảnh (không bấm gì).
  - Steps: 1. Host bấm `#invite-btn`. 2. Trong danh sách tìm dòng có tên guest, bấm nút "Mời". 3. Guest chờ popup lời mời, bấm Đồng ý.
  - Assert: danh sách của host chứa tên guest và không chứa tên host; guest thấy popup chứa tên host/tên phòng; sau đồng ý guest có `window.__GAME__`, `guest.__GAME__.room.roomId === host.__GAME__.room.roomId`, và host `state.players.size === 2`.
- [x] T2. Từ chối + sảnh không cho vào tự do — người nhận từ chối thì ở lại sảnh; phòng của người khác không có nút vào — tests/invite.spec.ts
  - Setup: như T1 (host trong phòng, guest ở sảnh).
  - Steps: 1. Guest nhìn danh sách phòng ở sảnh. 2. Host mời guest. 3. Guest bấm Từ chối.
  - Assert: dòng phòng của host ở sảnh guest không có nút "Vào" bật được (không có nút enabled); sau từ chối popup biến mất, guest vẫn không có `window.__GAME__`, host `state.players.size === 1`.

## Trạng thái hiện tại
- Bước 1 xong: `shared/src/lobby.ts` có `JoinError.NOT_INVITED` (4215), `JoinOptions.inviteToken`, kiểu `OnlinePlayer` (`{ name, roomId? }`) và `InvitePayload` (`{ from, roomId, roomName, token }`). `shared/src/index.ts` có `PRESENCE_ROOM_NAME = "presence"`, `Messages.InvitePlayer` ("invite_player", payload `InvitePlayerMessage { target }`), `Messages.ListOnline` ("list_online"), `ServerEvents.Online/Invite/InviteResult` và `InviteResultEvent` (`{ target, ok, reason? }`). `npm run typecheck` PASS.
- Bước 2 xong: `server/src/rooms/PresenceRoom.ts` mới (registry `online` username key → newest client, `sendInvite`, `onlineNames`, `registerSeatLookup` callback lấy `seats` của BobaShopRoom tránh import vòng, `autoDispose = false`, broadcast `ServerEvents.Online` mỗi join/leave + `list_online`). `server/src/index.ts` đăng ký `[PRESENCE_ROOM_NAME]: defineRoom(PresenceRoom)`. `BobaShopRoom`: `invite_player` handler (chỉ host, kiểm tên hợp lệ, không tự mời, không mời người đã có chỗ trong phòng, phòng chưa đầy, token `randomUUID()` hết hạn 2 phút qua `INVITE_EXPIRES_MS`, push qua `sendInvite`, báo `ServerEvents.InviteResult` cho host đủ các nhánh lỗi) và `onAuth` quăng `JoinError.NOT_INVITED` ("Phòng riêng tư, cần được mời") khi joiner không phải host, không giữ chỗ trong phòng, `DEBUG_WARP !== "1"` và không có token hợp lệ (token dùng một lần, xoá sau khi chấp nhận). `README.md` + `AGENTS.md` đã cập nhật (presence room, messages mới, phòng riêng tư; Codebase Map — bao gồm cả client `InvitePanel`/`InvitePopup` sẽ tạo ở bước 3 để docs chỉ cập nhật một lần theo plan). `npm run typecheck` PASS.
- Lưu ý: docs (README/AGENTS) đã được viết mô tả đầy đủ cả UI client của bước 3 (nút Mời, popup Đồng ý/Từ chối, danh sách online) theo đúng thiết kế đã chốt, nên giữa commit bước 2 và bước 3 docs đi trước UI một bước.
- Bước 3 xong: `InvitePanel` (modal trong game: `#invite-list` với `.invite-row` mỗi người online — loại mình + người có chỗ trong phòng, nút `.btn.small.primary` "Mời" mỗi dòng, `.invite-status` hiện "Đã mời ✓"/lỗi từ `ServerEvents.InviteResult`, danh sách tự cập nhật qua presence broadcast + players add/remove; huỷ đăng ký listener trong `destroy()` gọi từ `closeModal()`). `InvitePopup` (`#invite-popup` overlay cố định trên sảnh lẫn game, `#invite-accept` Đồng ý / `#invite-decline` Từ chối; lời mời mới đè lời mời cũ; Từ chối chỉ đóng popup). `main.ts`: `syncPresence()` join/rejoin `PRESENCE_ROOM_NAME` theo tên (đổi tên → join lại, mất kết nối → retry 5s, mở form tên → rời presence; tự gửi `list_online` sau khi đăng ký handler), `acceptInvite` rời phòng cũ rồi `joinById` với token. `#invite-btn` chỉ host bấm được (disabled cho guest, title giải thích); mở panel cũng gửi `list_online`. `renderRooms()`: phòng người khác chỉ có nút disabled nhãn "Riêng tư", phòng mình "Vào lại". `?room=`: bỏ tự join cho người lạ — chờ danh sách phòng, chỉ tự vào lại khi còn có chỗ trong phòng đó; `?test=1` (e2e, server DEBUG_WARP=1) vẫn auto-join mọi roomId để các spec cũ không hỏng. `describeError` thêm `NOT_INVITED`. CSS: `.invite-panel/.invite-list/.invite-row/.invite-status/.invite-popup*`. Smoke probe SDK trên server tự chạy (PORT=2599) PASS toàn bộ: không token → 4215, invite push đúng payload, `invite_result` ok, tự mời bị chặn, join bằng token vào đúng phòng, token dùng một lần, online list kèm roomId.
- Selectors: `#invite-btn` (client/index.html, nút 🤝 Mời trong game, disabled cho guest), `#invite-popup`, `#invite-accept`, `#invite-decline` (client/index.html + client/src/ui/InvitePopup.ts), `#invite-list`, `.invite-row`, `.invite-row .btn.small` (nút "Mời"), `.invite-status` (client/src/ui/InvitePanel.ts), `.room-item .btn.small` (client/src/main.ts renderRooms: "Vào lại"/"Riêng tư"), `#username-input`, `#name-form button[type=submit]` (client/index.html).
- Bước 4 xong: `tests/invite.spec.ts` có T1 (host mở `#invite-btn`, danh sách có tên guest và không có tên host, mời → guest thấy `#invite-popup` chứa tên host/tên phòng, bấm `#invite-accept` → guest có `window.__GAME__`, `roomId` bằng host và host `players.size === 2`) và T2 (guest ở sảnh thấy dòng phòng host nút disabled "Riêng tư", host mời → guest bấm `#invite-decline` → popup ẩn, guest không có `window.__GAME__`, host `players.size === 1`). Mỗi test dùng 2 browser context, tên duy nhất trong giới hạn 16 ký tự. `npm run typecheck` PASS; `npx playwright test tests/invite.spec.ts` PASS (2/2).
- Lưu ý: T1/T2 chỉ kiểm luồng mời qua giao diện; server e2e chạy `DEBUG_WARP=1` nên nhánh từ chối token `NOT_INVITED` (phòng riêng tư) không được kiểm ở e2e, chỉ được kiểm bằng thủ công/smoke ở bước 2.
- Lưu ý: client có thể hụt broadcast `online` đầu tiên ngay lúc join presence (handler đăng ký sau khi promise resolve) — đã tự chữa bằng gửi `list_online` ngay sau khi đăng ký handler, và panel Mời luôn request danh sách mới khi mở; e2e cũ dùng `?room=` vẫn auto-join khi `?test=1` (đúng Quyết định đã chốt về DEBUG_WARP), còn bản production chỉ tự vào lại phòng khi còn chỗ của mình.

## Test status
- Lần chạy cuối: `npm run typecheck` sau bước 4 — PASS (server + client). `npx playwright test tests/invite.spec.ts` — PASS (T1, T2).
- Kết quả từng test:
  - T1: PASS — tests/invite.spec.ts
  - T2: PASS — tests/invite.spec.ts
- Fail chi tiết:

## Verify
- Typecheck PASS; cả bộ e2e 86/86 PASS (gồm T1, T2 của tests/invite.spec.ts).
- Mục tiêu 1 (phòng riêng tư): PASS — sảnh chỉ còn nút disabled "Riêng tư" cho phòng người khác (T2).
- Mục tiêu 2 (host mời từ danh sách online): PASS — .agents/screenshots/task-39-invite-panel.png
- Mục tiêu 3 (popup Đồng ý/Từ chối): PASS — .agents/screenshots/task-39-invite-popup.png
- Lưu ý: nhánh từ chối token NOT_INVITED không được e2e kiểm (server test có DEBUG_WARP=1); chỉ kiểm bằng smoke thủ công ở bước 2.

VERIFY: PASS

## Đã thử mà không được
-

## Số liệu
- Quota Claude:
- Quota Go:
- Số lần tự sửa:
- Model dùng:
