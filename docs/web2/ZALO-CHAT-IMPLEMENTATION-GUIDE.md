<!-- #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Hướng dẫn lập trình phần Chat Zalo (full-stack). -->

# Chat Zalo (Web 2.0) — HƯỚNG DẪN LẬP TRÌNH (Implementation Guide)

> **Mục đích:** tài liệu kỹ thuật phản ánh **code thật đang chạy** của tính năng Chat Zalo Web 2.0 — đọc TRƯỚC khi sửa/thêm bất kỳ thứ gì liên quan Zalo. Giải thích kiến trúc, từng module, hợp đồng giữa các tầng, luồng dữ liệu, và **công thức thêm 1 tính năng mới end-to-end**.
>
> **Tài liệu liên quan** (đọc kèm khi cần):
> - [`ZALO-INTEGRATION.md`](ZALO-INTEGRATION.md) — nghiên cứu hệ sinh thái + lịch sử quyết định kiến trúc.
> - [`ZALO-CHAT-BUILD-SPEC.md`](ZALO-CHAT-BUILD-SPEC.md) — spec build chi tiết v1 (feature matrix).
> - [`ZALO-REBUILD-PLAN.md`](ZALO-REBUILD-PLAN.md) — plan rebuild v2 (3-pane + hardening login).
> - [`SSE-REALTIME.md`](SSE-REALTIME.md) — pattern realtime SSE Web 2.0.
> - [`MODAL-ANTI-LAG.md`](MODAL-ANTI-LAG.md), [`UI-FIRST.md`](UI-FIRST.md) — quy ước modal + optimistic.

---

## 0. NGUYÊN TẮC CỐT LÕI (đọc kỹ trước khi code)

1. **1 NGUỒN ZALO DUY NHẤT.** Trang `web2/zalo/` là nguồn dữ liệu + chức năng Zalo duy nhất. Mọi trang khác (native-orders, balance-history, customers, jt-tracking, drawer `Web2CustomerChat`) đều **mượn engine qua `window.Web2Zalo`** — KHÔNG trang nào gọi Zalo API trực tiếp, KHÔNG fork engine.
2. **KHÔNG gọi Zalo từ browser.** Trình duyệt chỉ nói chuyện với backend Render qua `/api/web2-zalo/*`. Toàn bộ giao tiếp Zalo (zca-js socket, OA OpenAPI) chạy **server-side**.
3. **Web 1.0 ⊥ Web 2.0.** Pool `web2Db || chatDb`, SSE hub `web2RealtimeSseRoutes` (hub Web 2.0, prefix topic `web2:`), bảng prefix `web2_`. KHÔNG đụng bảng/pool Web 1.0.
4. **PER-MÁY (owner-scoped).** Mỗi trình duyệt = 1 owner UUID (`localStorage['web2_zalo_owner']`). Tài khoản cá nhân (zca) chỉ thuộc về máy đăng nhập nó; máy khác không thấy/gửi được. OA dùng CHUNG mọi máy.
5. **KHÔNG lưu phiên Zalo trên server.** Cookie/imei chỉ giữ trong RAM process. Boot lại = tất cả TK cá nhân `disconnected` → user "Đăng nhập Zalo" lại từ trình duyệt (qua extension N2Store).
6. **UI-first cho mutation** (`Web2Optimistic` / optimistic render + rollback) — trừ tiền/ZNS giữ `await` + loading.
7. **Giờ GMT+7** ở tầng hiển thị; lưu DB epoch ms (BIGINT).
8. **Module nhỏ (200–400 dòng, max 800).** Cái gì ≥2 nơi dùng → để `web2/shared/`. Mọi file mới thêm `#Note` header + marker `WEB2.0`.

---

## 1. BẢN ĐỒ KIẾN TRÚC (3 tầng)

```
┌──────────────────────────────────────────────────────────────────────────┐
│ TRÌNH DUYỆT                                                                │
│                                                                            │
│  Trang web2/zalo/ (orchestrator, window.WZApp)                            │
│    rail 4 tab: Chat · Tài khoản · Tra cứu · ZNS                           │
│        │                                                                   │
│        ▼ tab Chat mở 1 hội thoại                                          │
│  ENGINE CHAT shared (window.WZChat) — web2/shared/zalo-chat/*             │
│    store · view · composer · bubbles · realtime · actions ·              │
│    lightbox · reactions · emoji-picker · sticker-picker                  │
│        │                          ▲                                        │
│        ▼ mọi HTTP                  │ SSE realtime                          │
│  ZaloApi (window.ZaloApi) ── web2-zalo-api.js                             │
│    fallback Worker→Render, header x-web2-token + x-web2-zalo-owner        │
│        │                          ▲                                        │
│  Web2Zalo (window.Web2Zalo) — embassy cho 4 trang khác + drawer          │
│    mountChat / sendZNS / sendMessage / openChat / attachZaloButtons      │
│                                                                            │
│  Extension N2Store (Web2Ext) → đọc cookie+imei chat.zalo.me (1-click)     │
└────────────────────────────┬──────────────────────────▲───────────────────┘
                             │ HTTPS /api/web2-zalo/*    │ EventSource
                             ▼                           │ /api/realtime/web2/sse
┌──────────────────────────────────────────────────────────────────────────┐
│ RENDER (chatomni-proxy worker → web2-api-*.onrender.com)                  │
│                                                                            │
│  routes/web2-zalo.js (2300 dòng) — 40+ endpoint                          │
│    accounts · conversations · messages · send-* · react/recall/seen ·    │
│    pin/mute/mark · stickers/quick-replies · media · oa/zns · admin       │
│        │  _persist* (DB write)        │ _notify(topic) → SSE              │
│        ▼                              ▼                                    │
│  services/web2-zalo-zca.js   services/web2-zalo-oa.js                     │
│   (zca-js: socket cá nhân,    (OA OpenAPI: ZNS, CS msg,                   │
│    watchdog, send/recv)        token refresh, templates)                  │
│        │                              │                                    │
│        ▼                              ▼                                    │
│  Postgres web2Db: web2_zalo_* (11 bảng) — lib/web2-secret-crypto.js      │
│        │                                                                   │
│        ▼                                                                   │
│  realtime-sse-web2.js (hub SSE Web 2.0) — topic web2:zalo:<owner>:*       │
└──────────────────────────────────────────────────────────────────────────┘
```

**Quy tắc vàng:** dữ liệu đi xuống qua `ZaloApi` (request/response), đi lên qua **SSE** (chỉ báo "có thay đổi" → client re-fetch + diff). SSE KHÔNG mang PII.

---

## 2. CÂY FILE (ai làm gì)

### 2.1 Frontend — trang `web2/zalo/`
| File | Dòng | Vai trò | Global |
|------|------|---------|--------|
| `index.html` | 423 | Shell 3-pane + 4 tab + 2 modal (add-personal / OA). Thứ tự load script quan trọng (xem §2.4). | — |
| `js/web2-zalo-utils.js` | 157 | Base namespace: `$`, `esc`, `avatarHtml`, modal a11y (focus-trap), `fmtTime`, `STATUS_LABEL`, **`state`** dùng chung. | `window.WZApp` |
| `js/web2-zalo-accounts.js` | 359 | Tab Tài khoản: render thẻ TK + đèn sức khoẻ, thêm TK cá nhân, **đăng nhập 1-click qua extension**, auto-renew, kết nối OA. | `WZApp.*` |
| `js/web2-zalo-chat.js` | 319 | Tab Hội thoại: fill select TK, load/render danh sách hội thoại, mở hội thoại (delegate `WZChat.mountConversation`), panel thông tin, context-menu pin/mute/mark. | `WZApp.*` |
| `js/web2-zalo-notify.js` | 163 | Thông báo tin mới: toast + beep (Web Audio, throttle) + badge `document.title` + Web Notification. Diff unread. | `WZApp.zaloNotify` |
| `js/web2-zalo-lookup-zns.js` | 236 | Tab Tra cứu (profile theo SĐT) + tab ZNS (template form động, gửi, log). | `WZApp.*` |
| `js/web2-zalo-app.js` | 192 | Orchestrator: `switchTab`, bind sự kiện, **subscribe SSE**, init. Load LAST. | `WZApp.switchTab/init` |
| `css/web2-zalo.css` | — | CSS trang (rail, 3-pane, thẻ TK, modal, ZNS). | — |

### 2.2 Frontend — engine chat shared `web2/shared/zalo-chat/`
| File | Dòng | Export | Vai trò |
|------|------|--------|---------|
| `chat-store.js` | 213 | `window.WZChat` (+ `WZ.store`, utils) | State phiên chat + tiện ích (`esc`, `fmtTime`, `dayLabel`, `avatarHtml`, `REACTIONS`, `openMenu`). |
| `chat-view.js` | 809 | `WZChat.mountConversation(el, conv, opts)` | **Controller chính** 1 hội thoại: shell, render body, optimistic send, load-older/backfill, search-in-conv, tools, lifecycle. |
| `composer.js` | 596 | `WZChat.mountComposer(root, ctx)` | Soạn tin: text auto-grow, ảnh/file (paste+drag-drop), emoji, sticker, **ghi âm voice**, **@mention nhóm**, quick-reply ("/"). |
| `bubbles.js` | 268 | `WZChat.renderMessages(msgs, conv)` | Render HTML 9 loại bong bóng + reaction chip + toolbar hover + date/unread/system divider. |
| `chat-actions.js` | 103 | `WZChat.actions` | Network mutation: `react`, `recall`, `deleteForMe`, `forward`, `markSeen` (throttle 3s), `emitTyping` (throttle 2s). |
| `realtime.js` | 55 | `WZChat.subscribeRealtime(convId, threadId, h)` | SSE thread topic → debounce 450ms `refetch` + `onTyping` (auto-off 4s). |
| `reactions.js` | 67 | `WZChat.openReactionBar(anchor, cb)` | Thanh 6 cảm xúc (HEART/LIKE/HAHA/WOW/CRY/ANGRY — add-only). |
| `emoji-picker.js` | 104 | `WZChat.openEmojiPicker(anchor, cb)` | 4 nhóm emoji + recents (localStorage), client-only. |
| `sticker-picker.js` | 112 | `WZChat.openStickerPicker(anchor, accKey, cb)` | Tìm sticker qua API + gợi ý + recents. |
| `lightbox.js` | 85 | `WZChat.openLightbox(imgs, i)` | Xem ảnh full màn + prev/next + tải. |
| `chat-bubbles.css` / `chat-composer.css` / `chat-lightbox.css` | — | — | CSS engine (prefix `wz-*`). |

### 2.3 Frontend — embassy + bridge `web2/shared/`
| File | Export | Vai trò |
|------|--------|---------|
| `web2-zalo-api.js` | `window.ZaloApi` | HTTP wrapper mỏng: dual fallback URL, owner UUID, ~40 method 1-1 với route. **Hợp đồng client↔server.** |
| `web2-zalo.js` | `window.Web2Zalo` | Embassy cho trang khác: `mountChat`, `sendZNS`, `sendMessage`, `getConversation`, `openChat`, `attachZaloButtons`, `getCookieAccountKey`, lazy `loadChatEngine`. |
| `web2-extension-bridge.js` | `window.Web2Ext` | Cầu `postMessage` tới extension N2Store: `hasExtension()`, `request(type, data, ms)`. |

### 2.4 Thứ tự load script (index.html, KHÔNG đổi bừa)
```
shared chung:  web2-auth → web2-user-info → web2-optimistic → web2-sidebar
               → web2-sse-bridge → web2-extension-bridge
ZaloApi:       web2-zalo-api.js
engine WZChat: chat-store → lightbox → emoji-picker → sticker-picker → reactions
               → bubbles → composer → realtime → chat-actions → chat-view   (view LAST)
page app:      utils → accounts → notify → chat → lookup-zns → app           (app LAST)
```
- `web2-auth.js` load SỚM NHẤT vì set `window.API_CONFIG`/`WEB2_CONFIG` (base URL 1 nguồn).
- Engine load TRƯỚC page app để `web2-zalo-chat.js` có thể delegate `WZChat.mountConversation`.
- Trang khác KHÔNG nhúng tay 14 script này — gọi `Web2Zalo.loadChatEngine()` (lazy, cache promise).

### 2.5 Backend — Render
| File | Dòng | Vai trò |
|------|------|---------|
| `render.com/routes/web2-zalo.js` | 2312 | Tất cả endpoint + helper `_persist*` + `_notify` + `ensureSchema` + retention. *(>800 dòng — nợ kỹ thuật, kế hoạch tách: xem §10.)* |
| `render.com/services/web2-zalo-zca.js` | 1130 | zca-js: session RAM, watchdog/reconnect, send/recv, resolve user/group, stickers, quick-replies. |
| `render.com/services/web2-zalo-oa.js` | 325 | OA OpenAPI: OAuth code→token, refresh (xoay token), ZNS, CS message, sync templates. |
| `render.com/db/web2-zalo-schema.js` | 341 | DDL 11 bảng `web2_zalo_*` + ALTER `web2_customers` + index. |
| `render.com/lib/web2-secret-crypto.js` | — | AES-256-GCM at-rest (secret/token OA). Zero-lockout fallback. |
| `render.com/routes/realtime-sse-web2.js` | — | Hub SSE Web 2.0 (`notifyClients`). |
| `render.com/server.js` | — | Mount route + `initializeNotifiers` + `ensureSchema` + `stopZalo` (SIGTERM) + cron retention. |

### 2.6 Extension N2Store (1-click login)
| File | Vai trò |
|------|---------|
| `n2store-extension/content/zalo-creds.js` | Content script trên `chat.zalo.me`: đọc `imei` (`localStorage z_uuid`), `userAgent`, `uid` đang đăng nhập. |
| `n2store-extension/background/service-worker.js` | Đọc cookie (kể cả httpOnly) qua `chrome.cookies`, trả `{cookie, imei, userAgent, uid}`. |

---

## 3. FRONTEND — TRANG `web2/zalo/`

### 3.1 Vòng đời & state
`web2-zalo-utils.js` tạo `window.WZApp` chứa **`state`** dùng chung mọi sub-module:
```js
state = {
  tab: 'accounts',                 // tab hiện tại (init đổi sang 'chat')
  zcaAvailable: true,              // zca-js sẵn sàng trên server?
  accounts: [],                    // TK của MÁY NÀY (owner-scoped) + OA chung
  conv: { list, total, activeId, activeConv, messages, accountKey, search },
  zns: { templates, log },
}
```
`web2-zalo-app.js#init()` → `bind()` (sự kiện) → `subscribeSse()` → `switchTab('chat')`. `switchTab` set `state.tab`, toggle panel `[hidden]`, và gọi loader tương ứng (`loadAccounts` / `loadConversations` / `fillAccountSelect` / `loadTemplates+loadZnsLog`).

### 3.2 SSE subscribe (web2-zalo-app.js#subscribeSse)
Owner = `Web2ZaloOwner()` (UUID máy). Subscribe **2 cặp topic** (owner-scoped + global chung cho OA/reset), đều **debounce**:
```js
web2:zalo:<owner>:accounts  +  web2:zalo:accounts   → refAcc()  (debounce 500ms → loadAccounts)
web2:zalo:<owner>:messages  +  web2:zalo:messages   → refList() (debounce 600ms → loadConversations, chỉ khi tab=chat)
```
Tin của **hội thoại đang mở** do `WZChat.subscribeRealtime` (topic `:thread:<id>`) lo riêng → tránh double-refetch.

### 3.3 Tab Tài khoản (web2-zalo-accounts.js)
- `loadAccounts()` → `ZaloApi.status()` → `renderAccounts()` (thẻ TK + 2 thẻ "choice" thêm mới) + `renderStatusStrip()` (đèn N/M ở chân rail) + `autoRenewZalo()`.
- **Thẻ TK cá nhân**: `connected` → nút Chat + Ngắt; khác → nút **"Đăng nhập Zalo"** (`data-act=zalologin`). Hiện cảnh báo `kicked` (mở nơi khác) + hint "TK của MÁY NÀY".
- **Đăng nhập 1-click** `loginZaloCookie(key, silent)`:
  1. `Web2Ext.request('GET_ZALO_CREDS', {}, 15000)` → `{cookie, imei, userAgent}` từ extension.
  2. `ZaloApi.loginCookie(key, {cookie, imei, userAgent, silent})`.
  3. `silent=true` (auto-renew nền) → server chỉ tự nối TK chính của máy; TK phụ trả `{skipped}`.
- **Thêm TK mới** (`saveAddPersonalCookie`): `createAccount(label)` tạo slot rỗng → `loginZaloCookie(newKey,false)`; fail/hủy → `deleteAccount(newKey)` dọn slot rác.
- **OA** (`saveOa`): `oaConnect({appId, secret, code, oaId, oaName})`.

### 3.4 Tab Hội thoại (web2-zalo-chat.js)
- `loadConversations()` → snapshot unread (notify) → `ZaloApi.conversations({accountKey, search, limit:200})` → `renderConvList()` → `zaloNotify.notify(prevMap)` → `maybeAutoSync()`.
- **Auto-seed**: lần đầu chọn TK đã connect mà list rỗng → `syncConversations(true)` (1 lần/key) gọi `ZaloApi.syncConversations` (nạp bạn bè + nhóm thành conversations).
- `openConversation(id)`: destroy view cũ → tìm conv trong `state.conv.list` → `WZChat.mountConversation($('#wzChatMain'), conv, { getForwardTargets })` → `renderInfoPanel(conv)`.
- **Context-menu** pin/mute/mark (`openConvMenu` + `_convAction`): UI-first qua `Web2Optimistic.run` → `ZaloApi.pin/mute/markConversation`.

### 3.5 Thông báo tin mới (web2-zalo-notify.js)
SSE chỉ báo "có thay đổi" → mỗi `loadConversations` chụp `snapshot()` (map id→unread) TRƯỚC, sau khi load gọi `notify(prevMap)` diff: conv nào `unread_count` tăng + inbound + không phải conv đang mở → toast + `beep()` + badge title + `browserNotify()` (chỉ khi tab ẩn). Bỏ qua lần đầu + khi đang search.

### 3.6 Tab Tra cứu + ZNS (web2-zalo-lookup-zns.js)
- Tra cứu: `ZaloApi.lookup({accountKey, phone})` / `ZaloApi.self(accountKey)` → render profile.
- ZNS form động: `loadTemplates()` → render `<select>` + `renderZnsFields()` sinh 1 ô/`template.params` (chuẩn hoá `_tplParams`). `sendZns()` thu data (`_collectZnsData`, validate required) → `ZaloApi.sendZns({phone, templateId, data, sentBy})` → `loadZnsLog()`.

---

## 4. ENGINE CHAT SHARED (`window.WZChat`)

### 4.1 Store (chat-store.js)
`window.WZChat` = namespace gốc, vừa chứa **tiện ích** vừa chứa **`WZ.store`**.

State `_s`: `{ conv, account, messages[], replyTarget, pending[] }`.

API store:
```
setConversation(conv, account, messages)   setMessages(messages)
setReplyTarget(m) / getReplyTarget() / clearReply()
addPending(item) / removePending(id) / getPending() / clearPending()
markRecalled(msgId)   markSeen()   patchReaction(msgId, emoji, uid)   // realtime patch
```
Tiện ích: `esc`, `initial`, `fmtTime`, `dayKey`, `dayLabel` (Hôm nay/Hôm qua), `avatarHtml` (img `referrerpolicy=no-referrer` + fallback chữ cái), `notify`, `REACTIONS` (6 cảm xúc), `openMenu/closeMenu` (dropdown), `_previewOf(m)`.

### 4.2 View — controller 1 hội thoại (chat-view.js)
`WZChat.mountConversation(container, conv, opts) → { conv, reload, refresh, destroy }`.

`opts`: `getForwardTargets()` (trả danh sách thread để forward), `autoSeen` (mặc định true).

Trình tự `init()`: `store.setConversation` → `shell()` (render khung HTML) → `mountComposer` → `reload()` (fetch tin đầu) → `markSeen()` → `subscribeRealtime()`.

Khung HTML: `.wz-chat-head` (avatar/tên/**account chip**/nút search) · `.wz-srch-bar` · `.wz-chat-body` (tin + divider) · `.wz-scroll-fab` · `#wzcvCompose`.

Điểm cốt lõi:
- **Account chip** (`_fillAccChip`): hiện TK Zalo đang gửi; cảnh báo cam khi nhóm chưa có TK trong nhóm / 1-1 dùng TK phụ; "TK chính" nếu `is_primary`.
- **Optimistic send**: `optimistic(m)` đẩy tin `send_status='sending'` (`cli_msg_id='temp_N'`) → `reconcile(tempCli, patch, ok)` match theo `cli_msg_id`, set `msg_id`/`attachments`, đổi status `sent`/`failed`.
- **Send callbacks** truyền vào composer: `onSendText` (build quote từ reply qua `buildReplyQuote`, gắn `mentions`), `onSendMedia`, `onSendFile`, `onSendVoice` (gửi như file), `onSendSticker`.
- **Load older / backfill** (`loadOlder`): DB còn tin → `ZaloApi.loadHistory({before, beforeId})` (keyset, prepend giữ scroll); DB hết + nhóm → `ZaloApi.backfill(convId, count)` (kéo ~200 tin từ Zalo về DB rồi `messages()` lại).
- **Search-in-conv**: `_loadAllForSearch` (nạp đủ tin 1 lần) → `_computeMatches` (NFD bỏ dấu, lowercase) → `_paintSearch` (`<mark>` + highlight) → `_gotoMatch` (Enter next / Shift+Enter prev / Esc đóng).
- **Tools** (`bindBody` + `[data-act]`): reply / react (`openReactionBar`→`actions.react`) / recall (confirm→optimistic→`actions.recall`, rollback) / delete-me (UI-first splice, rollback) / forward (`openMenu`→`actions.forward`) / retry / lightbox (`[data-lb]`).
- `reload()` fetch `messages(conv.id, 100)` + heal tên/avatar conv. `refresh()` (từ realtime, debounce 450ms) giữ tin pending (sending/failed). `destroy()` unsub + clear.

### 4.3 Composer (composer.js)
`WZChat.mountComposer(root, ctx) → WZChat.composer`. `ctx` chứa `conv`, `account`, và các `onSend*`.

Chức năng: text auto-grow (max 140px); ảnh/file (`addFiles` validate ≤25MB → tray pending; hỗ trợ paste clipboard + drag-drop overlay); emoji picker; sticker picker; **voice** (`MediaRecorder`, validate ≥600ms & ≥800B, gửi qua đường file); **@mention nhóm** (`_loadMembers` qua `ZaloApi.groupMembers`, parse `@query` tại caret, dropdown ↑↓/Enter/Tab, `_buildMentions` re-derive vị trí thật → `[{uid,pos,len}]`); **quick-reply** (gõ "/" mở picker `ZaloApi.quickReplies`, lưu mới `addQuickReply`); reply-bar.

API public: `composer.setReply(m)`, `reset()`, `focus()`, `refresh()`.

### 4.4 Bubbles (bubbles.js)
`WZChat.renderMessages(messages, conv) → HTML`. `bubbleKind(m)` phân loại từ `msg_type` + `attachments[0]`: **text · image (đơn/lưới ≤4) · sticker · video · voice · file · contact · location · link(card)**. `fmtText` escape + highlight `@mention`. HTML: divider ngày/`Tin chưa đọc`/system (`.wz-sys-msg`); mỗi tin `.wz-msg out|in grouped...` có toolbar hover (reply/react/recall/delete-me), reply-quote, reaction chip, meta (giờ + tick 🕓/✓/Đã xem/⚠️ Thử lại). Nhóm: avatar+tên chỉ ở **tin cuối** của 1 lượt cùng người.

### 4.5 Actions + Realtime
- `WZChat.actions`: `react/recall/deleteForMe/forward/markSeen/emitTyping`. `markSeen` throttle 3s/conv, `emitTyping` throttle 2s/thread (fire-and-forget).
- `WZChat.subscribeRealtime(convId, threadId, { refetch, onTyping })`: `new EventSource` qua bridge topic `web2:zalo:<owner>:thread:<threadId>`. `action='typing'` → `onTyping(true)` (auto-off 4s); `message|reaction|recall|seen` → `refetch()` debounce 450ms. Trả `unsub`.

### 4.6 Picker phụ
`reactions.js` (thanh 6 cảm xúc, z-index 100000), `emoji-picker.js` (4 nhóm + recents `wz_emoji_recents`), `sticker-picker.js` (search `ZaloApi.stickers` + gợi ý + recents `wz_sticker_recents`), `lightbox.js` (`openLightbox` + `collectThreadImages`).

---

## 5. EMBASSY `window.Web2Zalo` — DÙNG TỪ TRANG KHÁC

Đây là **API duy nhất** trang khác được phép dùng. KHÔNG import trực tiếp `WZChat`/`ZaloApi` từ trang ngoài.

```js
// Mở khung chat Zalo trong 1 container (drawer/khu vực) — tự lazy-load engine.
const chat = await Web2Zalo.mountChat(containerEl, {
  phone: '0971234567',        // hoặc { conv } / { convId }
  preferAccountKey: 'zca_..', // TK ưu tiên để gửi
  autoLogin: true,            // tự tạo slot + cookie-login nếu cần (default)
  ensure: true,               // tạo conv rỗng nếu chưa từng chat (default)
  autoSeen: true,
  getForwardTargets: () => [...],
});
// → { conv, reload, refresh, destroy }
// Lỗi: chat._needLogin (máy chưa đăng nhập Zalo) / chat._ensureErr.

await Web2Zalo.sendZNS({ phone, templateId, data, orderRef, customerId });
await Web2Zalo.sendMessage({ accountKey, threadId, text, threadType });
const conv = await Web2Zalo.getConversation(phone, accountKey?);
const st   = await Web2Zalo.status();
Web2Zalo.openChat(phoneOrId);          // mở /web2/zalo/?focus=<...>
Web2Zalo.attachZaloButtons(rootEl?);   // scan [data-w2zalo-phone] → nút "Zalo <sđt>"
const key = await Web2Zalo.getCookieAccountKey(); // TK đang mở chat.zalo.me (cache 30s)
```

`loadChatEngine()` nạp đúng 14 script + CSS theo thứ tự §2.4 (cache `_enginePromise`). 4 trang consumer hiện tại: **native-orders, balance-history, customers, jt-tracking** + drawer `Web2CustomerChat`. **Khi sửa engine, KHÔNG được phá hợp đồng `mountChat`/`ZaloApi`/`WZChat.mountConversation`/deep-link `?focus=` — bump `?v=` để 4 trang nạp bản mới.**

---

## 6. BACKEND — ROUTES `/api/web2-zalo/*`

Pool: `const db = req.app.locals.web2Db || req.app.locals.chatDb`. Mọi mutation gọi `_persist*` rồi `_notify(topic, action, code)` SAU commit, TRƯỚC `res.json`.

### 6.1 Bảng endpoint (nhóm chức năng)
| Nhóm | Endpoint chính |
|------|----------------|
| **Trạng thái / TK** | `GET /status`, `GET /accounts`, `POST /accounts` (tạo slot), `POST /accounts/:key/login-cookie`, `POST /accounts/:key/disconnect`, `DELETE /accounts/:key`, `GET /accounts/:key/self`, `GET /accounts/:key/friends`, `GET /accounts/:key/groups`, `POST /accounts/:key/sync-conversations`, `POST /accounts/:key/repair-group-names` |
| **Tra cứu** | `GET /lookup`, `GET /conversation/:phone`, `POST /conversation/ensure` |
| **Hội thoại / tin** | `GET /conversations`, `GET /conversations/:id/messages` (keyset `sent_at,id` + lazy-heal tên/avatar), `POST /conversations/:id/backfill`, `GET /conversations/:id/members` |
| **Gửi (zca)** | `POST /send-message`, `POST /send-image`, `POST /send-file`, `POST /send-sticker` |
| **Mutation tin** | `POST /react`, `POST /recall`, `POST /delete-message`, `POST /forward`, `POST /typing`, `POST /seen` |
| **Quản lý hội thoại** | `POST /conversations/:id/pin`, `/mute`, `/mark` |
| **Asset** | `GET /stickers`, `GET /quick-replies`, `POST /quick-replies`, `GET /media/:id` (bytea self-host, token IDOR-safe) |
| **OA / ZNS** | `POST /oa/connect`, `POST /oa/sync-templates`, `GET /zns/templates`, `POST /send-zns` (rate-limit 5/60s/SĐT), `POST /oa/send-cs`, `GET /zns/log` |
| **Nhóm theo dõi** | `GET/POST /tracked-groups`, `DELETE /tracked-groups/:accountKey/:threadId` |
| **Admin** | `POST /admin/reset-to-tracked` (wipe + seed allowlist, header `x-admin-secret`, có `dryRun`) |

Exports module: `router`, `ensureSchema(pool)`, `initializeNotifiers(fn)`, `runZaloRetention(days=7)`, `stopZalo()`.

### 6.2 Per-máy isolation (BẮT BUỘC khi thêm route đọc TK/tin)
- Header `x-web2-zalo-owner` → `_owner(req)`.
- TK cá nhân + tin 1-1 scope theo owner; OA dùng chung.
- Route đọc theo `:id` serial (đoán được) PHẢI guard owner. Customer 1-1 dùng `_ownerConnectedAccount(db, ownerId)`; máy chưa login → `400 { needLogin: true }`.
- SSE: `_notify` luôn qua `_ownerTopic(accountKey, suffix)`.

### 6.3 Idempotency (3 tầng)
1. **Send** — `_sendKey(accountKey, threadId, cliMsgId)` Map in-process TTL 60s (chống double-click/F5/retry). Client gửi `cliMsgId` ổn định/lần soạn.
2. **ZNS** — dedupe DB cửa sổ 10 phút theo `(phone, template_id, order_ref)` với `status IN (sent,pending)`.
3. **Tin Zalo** — UNIQUE `(account_key, msg_id) WHERE msg_id IS NOT NULL` → relay double-fire `ON CONFLICT DO NOTHING`.

### 6.4 Lazy-heal tên/avatar nhóm
Mở chat: nếu `info_synced_at` null hoặc >6h → `zca.getGroupsInfo` (timeout 2s) UPDATE tên NHÓM, **chỉ stamp `info_synced_at` khi resolve OK** (timeout/lỗi không đóng băng sai).

### 6.5 Media self-host
Shop gửi ảnh → zca upload Zalo CDN nhưng KHÔNG trả URL ổn định → copy bytea vào `web2_zalo_media` → phục vụ `GET /media/<token>` (token 36 hex bất khả đoán, cache `private, max-age=31536000, immutable`). URL này nhúng vào `attachments`.

---

## 7. BACKEND — SERVICES

### 7.1 zca-js (web2-zalo-zca.js) — TK cá nhân
- **Session RAM**: `_sessions = Map<accountKey, { api, listener, status, creds, expectedUid, lastEventAt, reconnecting, consecutiveKicks, disposed, ... }>`. KHÔNG lưu DB.
- **`configure(callbacks)`**: route inject `onMessage→_persistIncoming`, `onStatus`, `onTyping`, `onReaction`, `onUndo`, `onSeen`, `onConnected→_repairConvNames`.
- **`loginWithCredentials(key, {cookie, imei, userAgent}, label, opts)`**: guard `expectedUid` (sai uid → reject `WRONG_ACCOUNT`), gắn listener, watchdog. Gate `connecting` chống 2 phiên đua nhau.
- **Watchdog** (tham số chính): `KEEPALIVE_TIMEOUT 8s`, `WATCHDOG 90s`, `PROACTIVE_RELOGIN 3.5 ngày` (trước zpw_sek ~7 ngày), backoff `[5,15,30,60,120]s` cho 1006/network, `KICK_RECONNECT 30s` + `KICK_CAP 4` (kick liên tiếp → ngủ 10') cho 3000/3003, `MAX_RECONNECT 10` (cookie chết → bỏ cuộc, chờ login tay).
- **Send**: `send / sendMedia / sendSticker / react / recall / deleteForMe / forward / sendTyping / sendSeen`. Quote bị Zalo từ chối → degrade gửi lại không quote.
- **Resolve**: `getUserInfo / findUser / getAllFriends / getAllGroups / getRoster / getGroupMembers / getGroupMembersInfo / getGroupsInfo / getGroupHistory`. `_normMessage` chuẩn hoá tin → shape DB; `_normGroupEvent` → tin `system`.
- **Health**: `isAvailable / isConnected / status(key) / statusAll / fetchSelf / disconnect`. `startWatchdog / stopAll` (graceful, timer unref).

### 7.2 OA (web2-zalo-oa.js) — Official Account
- **`exchangeCode(pool, {appId, secret, code, oaId, oaName, accountKey})`**: OAuth `authorization_code` → UPSERT `web2_zalo_accounts (account_type='oa')`, **encrypt** secret/token trước lưu. Endpoint `oauth.zaloapp.com/v4/oa/access_token`.
- **`refreshToken` / `getValidToken`**: token gần hết (`<60s`) auto-refresh; Zalo **xoay refresh token mỗi lần** → luôn lưu refresh mới; dedup `_refreshInFlight` chống đua.
- **`sendZNS(pool, {phone, templateId, data, orderRef, oaRef, customerId, sentBy})`**: format `84...`, dedupe orderRef, log pending → POST `business.openapi.zalo.me/message/template` → update log (sent/failed, msgId, quota).
- **`sendCsMessage`**: POST `openapi.zalo.me/v3.0/oa/message/cs` (tin tư vấn user đã nhắn OA).
- **`syncTemplates`**: GET `business.openapi.zalo.me/template/all?status=1` → UPSERT `web2_zns_templates`.

### 7.3 Mã hoá at-rest (web2-secret-crypto.js)
Env `WEB2_ENC_KEY` (32 byte hex/base64). Có key → `encryptString/encryptJson` sinh `enc:v1:<base64url(iv|tag|ct)>` (JSONB wrap `{__enc__}`). `decrypt*` nhận diện marker: có → giải, không → plaintext legacy (**zero-lockout**, idempotent, không double-wrap). Không set key → tắt mã hoá (plaintext như cũ). Sinh key: `openssl rand -hex 32`.

---

## 8. DATABASE — 11 BẢNG `web2_zalo_*`

| Bảng | Vai trò | Cột/Index đáng nhớ |
|------|---------|--------------------|
| `web2_zalo_accounts` | TK cá nhân + OA | `account_key` UNIQUE, `account_type`, `zalo_uid`, `oa_id`, `session` JSONB (**NULL** — không lưu phiên), `oa_secret/access_token/refresh_token` **ENCRYPTED**, `token_expires`, `status`, **`owner_id`** (per-máy) + index, `last_connected_at` |
| `web2_zalo_conversations` | 1 dòng / (account × thread) | UNIQUE`(account_key, thread_id)`, `thread_type`, `display_name`, `phone`, `customer_id`, `unread_count`, `is_pinned/is_muted/muted_until`, `last_msg_*`, `last_msg_sender_uid`, `info_synced_at` (gate heal 6h), index `last_msg_at DESC NULLS LAST` |
| `web2_zalo_messages` | tin (append-only) | `msg_id`, `cli_msg_id`, `direction` (in/out/**system**), `msg_type`, `content`, `attachments` JSONB, `reply_to_*`, `reactions` JSONB, `recalled*`, `hidden_for_me`, `seen_at`, `sender_uid`, `send_status`, `sent_at`. UNIQUE`(account_key, msg_id) WHERE msg_id NOT NULL`; index `(account_key, thread_id, sent_at DESC)` |
| `web2_zalo_media` | bytea self-host | `data` BYTEA, `mime`, `width/height/size`, `token` UNIQUE (IDOR-safe) |
| `web2_zalo_members` | cache tên thành viên nhóm | PK`(account_key, uid)`, `display_name`, `avatar` |
| `web2_zalo_tracked_groups` | allowlist nhóm | PK`(account_key, thread_id)` — bật filter khi env=1 & bảng ≥1 row |
| `web2_zns_templates` | cache template ZNS | `template_id` UNIQUE, `params` JSONB, `status`, `is_active` |
| `web2_zns_log` | audit ZNS (append-only) | `log_id` UNIQUE, `phone`, `template_id`, `status`, `order_ref`, `quota_cost`, `sent_by`, `error_msg` |
| `web2_zalo_send_jobs` | bulk send (master) | `job_id` UNIQUE, `job_type`, `status`, `total/sent/failed` |
| `web2_zalo_send_items` | bulk send (chi tiết) | `job_id`, `phone/thread_id`, `params`, `status`, `error_msg` |
| `web2_customers` (ALTER) | gộp identity Zalo | `+ zalo_uid`, `+ zalo_followed_oa` |

`ensureSchema(pool)` chạy lúc boot (idempotent — Render restart chạy lại) + nạp cache tracked-groups/owners (refresh 60s).

---

## 9. REALTIME SSE (Web 2.0 hub)

Topic: `web2:zalo:<owner>:<suffix>`. `owner` null → `_none` (không máy nào nghe).

| Topic | Producer | Consumer | Khi nào |
|-------|----------|----------|---------|
| `web2:zalo:<owner>:accounts` | route login/disconnect/status | tab Tài khoản | TK đổi trạng thái |
| `web2:zalo:<owner>:messages` | `_persistIncoming/_persistOut/pin/mute/mark` | danh sách hội thoại | tin mới / unread / cài đặt conv |
| `web2:zalo:<owner>:thread:<threadId>` | `_notifyThread` | khung chat đang mở | message/reaction/recall/seen/typing |

Client subscribe qua **`Web2SSE.subscribe(topic, cb)`** (`web2-sse-bridge.js`) — KHÔNG tạo `EventSource` thủ công. Verify bằng Admin SSE Monitor (`web2/system/?tab=sse`).

---

## 10. CÔNG THỨC THÊM 1 TÍNH NĂNG MỚI (end-to-end)

Ví dụ: thêm hành động tin "Ghim tin nhắn" (pin message).

1. **Backend route** (`routes/web2-zalo.js`): thêm `POST /messages/:id/pin`. Lấy `db = web2Db||chatDb`, guard owner, gọi zca nếu cần, UPDATE bảng, **`_notify(_ownerTopic(accountKey, 'thread:'+threadId), 'pin', msgId)`** SAU commit. (Nếu cần cột mới → thêm migration idempotent trong `ensureSchema`.)
2. **Service zca** (nếu Zalo có API): thêm method trong `web2-zalo-zca.js` (vd `pinMessage`), normalize lỗi.
3. **Schema** (nếu cần): cột `pinned_at` trong `ensureSchema` (`ALTER ... ADD COLUMN IF NOT EXISTS`).
4. **ZaloApi** (`web2-zalo-api.js`): thêm `pinMessage(body)` map 1-1 với route.
5. **Engine**: `chat-actions.js` thêm `pinMessage(...)`; `bubbles.js` thêm nút `[data-act=pin]` trong toolbar; `chat-view.js#bindBody` dispatch → optimistic (`store` patch) → `actions.pinMessage` → rollback nếu lỗi.
6. **Realtime**: `realtime.js` map `action='pin'` → `refetch()` (nếu cần render khác).
7. **Bump version**: đổi `?v=` các file engine sửa trong `index.html` + `ENGINE_VER` trong `web2-zalo.js` (để 4 trang consumer nạp bản mới).
8. **Wire server** (chỉ khi thêm notifier mới): `server.js` đã `initializeNotifiers(web2RealtimeSseRoutes.notifyClients)` — không cần thêm.
9. **Verify**: browser test (`--start web2/overview/index.html` → nav `web2/zalo`), console-first eval, mở SSE Monitor xác nhận `Notified N clients`. Cập nhật `docs/dev-log.md`.

> ⚠ Quy ước bắt buộc: UI-first (`Web2Optimistic`/optimistic), GMT+7 hiển thị, `referrerpolicy="no-referrer"` mọi ảnh CDN Zalo, per-máy owner trên mọi request, module mới <800 dòng + `#Note` + marker `WEB2.0`, KHÔNG fork engine — sửa shared 1 nguồn.

---

## 11. TROUBLESHOOTING NHANH

| Hiện tượng | Nguyên nhân | Cách xử lý |
|-----------|-------------|-----------|
| Boot xong TK `disconnected` | Không lưu phiên server (cố ý) | User bấm "Đăng nhập Zalo" lại (extension + chat.zalo.me) |
| TK `kicked` | Mở Zalo Web TK đó ở máy/browser khác | Đóng nơi khác (app điện thoại OK), watchdog tự nối lại; >4 kick → ngủ 10' |
| "Đăng nhập Zalo" báo `no_session/no_imei` | Chưa đăng nhập chat.zalo.me hoặc chưa cài extension | Mở chat.zalo.me đăng nhập trước; cài tiện ích N2Store |
| Gửi tin fail `WRONG_ACCOUNT` | uid login ≠ `expectedUid` | Đăng nhập đúng TK trên trình duyệt |
| UI tab khác không cập nhật | SSE chưa tới / chưa subscribe | Mở Admin SSE Monitor xem `Notified N clients`; kiểm tra owner topic + bridge `web2-sse-bridge.js` |
| Tên NHÓM hiển thị sai (tên người) | Bug cũ + chưa heal | Mở chat (lazy-heal 6h) hoặc `POST /accounts/:key/repair-group-names` |
| Ảnh Zalo vỡ (403/hết hạn) | Thiếu `referrerpolicy` / token CDN hết | `avatarHtml` đã set no-referrer + fallback chữ; media shop gửi self-host `/media/<token>` |
| ZNS gửi trùng | Thiếu/đổi `orderRef` | Truyền `orderRef` ổn định (dedupe 10') |

**ENV liên quan**: `WEB2_ENC_KEY` (mã hoá OA secret), `WEB2_ZALO_GROUP_ALLOWLIST` (1=lọc nhóm, mặc định tắt=lưu hết), `CLEANUP_SECRET` (admin reset). **Header**: `x-web2-token` (auth), `x-web2-zalo-owner` (per-máy), `x-admin-secret` (reset).

---

## 12. NỢ KỸ THUẬT / LƯU Ý

- `routes/web2-zalo.js` ~2300 dòng (>800) — **kế hoạch tách module HOÃN** đến khi login ổn (tách lớn rủi ro vỡ listener). Khi tách: giữ nguyên exports `router/ensureSchema/initializeNotifiers/runZaloRetention/stopZalo`.
- Re-login từ cookie cứu được drop tạm; **không cứu cookie đã chết** → cần user login tay. Cookie-login (chia sẻ phiên chat.zalo.me) KHÔNG đá nhau; QR tạo phiên mới → đá nhau (vì vậy QR đã GỠ 2026-06-23).
- Reaction **add-only** (zca không gỡ). `deleteForMe` chỉ ẩn phía mình (`hidden_for_me`).
- Khi đổi engine: **bump `?v=`** + thử lại 4 trang consumer (native-orders, balance-history, customers, jt-tracking) trước khi đóng task.
