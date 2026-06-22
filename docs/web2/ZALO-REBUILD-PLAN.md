<!-- #Note: Plan rebuild trang Zalo Web 2.0 (audit + research 2026-06-22). Đọc trước khi code lại trang web2/zalo. Cập nhật dev-log sau thay đổi. | WEB2.0 -->

# KẾ HOẠCH LÀM LẠI TRANG ZALO (Web 2.0) — Audit + Plan

> **Trạng thái:** 📋 PLAN — chờ user duyệt trước khi code. Sinh từ 10 agent research (2 workflow) ngày 2026-06-22.
> **Nguyên tắc:** rebuild giao diện trang `web2/zalo/` thành 3-pane giống app Zalo thật + hardening đăng nhập + lấp tính năng — **GIỮ engine chat shared (`WZChat`) + backend đã chạy + hợp đồng cho 4 trang đang dùng**. KHÔNG viết lại từ đầu, KHÔNG fork (theo convention "tách module nhỏ + share dùng chung").

---

## 0. Quyết định đã chốt với user (2026-06-22)

| Câu hỏi            | Lựa chọn                                                                                                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Phạm vi            | **Rebuild UI trên engine cũ** — dựng lại giao diện 3-pane, giữ engine + backend, không phá 4 trang consumer                                     |
| Tài khoản Zalo bot | **1 TK Zalo phụ riêng cho bot** (khuyến nghị) — chỉ đăng nhập qua n2store, KHÔNG mở chat.zalo.me TK đó ở máy khác; app điện thoại vẫn dùng được |
| Tính năng          | **Toàn bộ 4 nhóm ưu tiên + "nghiên cứu nhiều tính năng Zalo"** → bám feature-matrix §3                                                          |

---

## 1. Hiện trạng (audit) — KHÔNG phải làm từ đầu

Một phiên trước (2026-06-13) đã build chat Zalo theo `ZALO-CHAT-BUILD-SPEC.md`. Đang có:

- **Trang shell** `web2/zalo/` — 5 JS + 1 CSS (1284 dòng), 4 tab (Tài khoản / Hội thoại / Tra cứu / ZNS). UI hiện là **2-pane list đơn giản**, chưa giống app Zalo.
- **Engine chat dùng chung** `web2/shared/zalo-chat/*` (14 module, `window.WZChat`) + `web2/shared/web2-zalo-api.js` (`window.ZaloApi`). Đã có: text/ảnh/file/sticker, reply, reaction (add-only), recall, forward, typing/seen, lightbox, lưới ảnh, @mention nhóm, search trong hội thoại.
- **Embassy** `web2/shared/web2-zalo.js` (`Web2Zalo.mountChat`) — **4 trang phụ thuộc**: native-orders, balance-history, customers, jt-tracking + drawer `Web2CustomerChat`.
- **Backend** `render.com/routes/web2-zalo.js` (2203 dòng — QUÁ 800, cần tách) + `services/web2-zalo-zca.js` (838) + OA service + schema. 40+ route, session mã hoá at-rest, idempotency guard, retention, tracked-groups allowlist.

### Hợp đồng PHẢI giữ nguyên (4 trang + drawer dựa vào)

- `window.Web2Zalo.mountChat(container, {phone|convId, autoSeen, preferAccountKey, ensure, getForwardTargets})`
- `window.ZaloApi.*` (tên method hiện tại)
- `WZChat.mountConversation(container, conv, opts)` → `{conv, reload, refresh, destroy}`
- SSE topic: `web2:zalo:accounts`, `web2:zalo:messages`, `web2:zalo:thread:<threadId>`
- conv shape `{id, account_key, thread_id, thread_type, display_name, avatar_url}`
- `?focus=<phone>` deep-link
- Load order: `web2-zalo.js`/`web2-zalo-api.js` trước `zalo-chat/` modules; `web2-customer-chat-core` → `-modal` → `.js`

---

## 2. ⚠️ SỰ THẬT VỀ ĐĂNG NHẬP "không bị văng nick ở máy khác" — phần lõi

Research (zca-js issues #153/#198/#293/#331/#333/#344 + README) làm rõ cơ chế:

1. **Zalo chỉ cho phép 1 "listener" realtime / tài khoản.** Listener = WebSocket nghe tin. Mở **chat.zalo.me (Zalo Web) tài khoản đó ở máy khác → server bị kick** (close code 3000 DuplicateConnection / 3003 KickConnection). **App điện thoại nói chung KHÔNG kick** — chỉ Zalo Web / automation thứ 2 mới kick.
2. **Bị kick KHÔNG = mất đăng nhập.** Cookie vẫn còn hiệu lực: vẫn **gửi** được, vẫn **đăng nhập lại** bằng cookie cũ được — chỉ phần **nhận** chết. Khôi phục = re-login bằng cookie đã lưu + gắn lại handler (KHÔNG cần quét QR).
3. **KHÔNG thể** để 1 tài khoản giữ phiên Zalo Web sống ở 2 máy cùng lúc — đây là luật server của Zalo, không bypass được. **NHƯNG nhân viên đã có thể dùng trang n2store ở nhiều máy cùng lúc** vì listener nằm ở **server Render**, mỗi trình duyệt chỉ đọc qua SSE. Đây mới là "dùng mọi nơi" mà shop cần.
4. Session = bộ ba bất biến `{cookie, imei, userAgent}` (imei = uuid + MD5(userAgent)). `zpw_sek` ~7 ngày, `zpsid` ~365 ngày, **KHÔNG có API refresh** → trong 7 ngày phải re-login để gia hạn.
5. **Lỗ hổng code hiện tại:** khi bị kick chỉ set `status='disconnected'` rồi **đứng im** — KHÔNG có watchdog, KHÔNG keepalive, KHÔNG auto re-login. Có sẵn auto-renew-khi-mở-trang + guard `expectedUid` nhưng thiếu watchdog server.

### → Chiến lược "không bị văng" (Phase 1 / P0)

- **TK phụ chuyên dụng** + KHÔNG mở Zalo Web TK đó ở máy khác (app ĐT OK).
- **Watchdog server** (1–5 phút): kiểm tra `ws.readyState===OPEN` + `_closeTimer===null` + 1 call rẻ (`getOwnId`). Listener chết → re-login từ cookie đã lưu + **gắn lại toàn bộ `listener.on`** + cooldown vài giây; rẽ nhánh theo close code (1000 thủ công / 3000 / 3003 / 1006).
- **keepAlive** ~2 phút (presence ping) + **re-login chủ động mỗi 3–5 ngày** (trong cửa sổ 7 ngày của `zpw_sek`), luôn gắn lại listener sau re-login.
- **Single-listener lock** chống rolling-deploy chồng instance: Postgres advisory lock per account + `listener.stop()` chờ đóng hẳn (graceful SIGTERM) trước khi instance mới kết nối (tránh tự-kick 3000/3003).
- **Pin imei/UA** bất biến per slot (lưu imei riêng, không regenerate, không đổi UA).
- **Quan sát**: lưu `last_close_code`, `last_event_at` per account; UI hiện đèn sức khoẻ + cảnh báo "đừng mở Zalo Web TK này ở máy khác" + nút re-login.
- **Fallback tin giao dịch**: nếu listener cá nhân chết, OA/ZNS vẫn gửi tin xác nhận đơn/nhắc CK (kênh chính thức, không phụ thuộc zca-js).
- Verify SSE `web2:zalo:*` đã đi qua Postgres LISTEN/NOTIFY cross-instance (memory `reference_web2_sse_cross_instance`).

---

## 3. FEATURE MATRIX — Zalo app → zca-js (cài đặt 2.1.2) → trạng thái → ưu tiên

> zca-js 2.1.2 cài trong repo có **148 method** (wrapper hiện chỉ dùng ~30). `P` = đợt build (P0 = lõi login, P1/P2/P3 giảm dần).

### A. Quản lý hội thoại (list) — đa số CHƯA wrap, làm mới

| Tính năng                       | zca method                                         | Trạng thái                                 | P      |
| ------------------------------- | -------------------------------------------------- | ------------------------------------------ | ------ |
| Ghim hội thoại                  | `setPinnedConversations`/`getPinConversations`     | cột `is_pinned` có, chưa wrap              | P2     |
| Tắt thông báo (mute)            | `setMute`/`getMute`                                | cột `is_muted`/`muted_until` có, chưa wrap | P2     |
| Đánh dấu chưa đọc               | `addUnreadMark`/`removeUnreadMark`/`getUnreadMark` | chưa                                       | P2     |
| Nhãn/phân loại (folder màu)     | `updateLabels`/`getLabels`                         | chưa                                       | P3     |
| Lưu trữ (archive)               | `updateArchivedChatList`/`getArchivedChatList`     | chưa                                       | P3     |
| Ẩn hội thoại (PIN)              | `setHiddenConversations`/`updateHiddenConversPin`  | chưa                                       | P3     |
| Badge chưa đọc trên tab/sidebar | client                                             | chưa                                       | **P2** |
| Online/last-seen                | `lastOnline`/`getFriendOnlines`                    | chưa                                       | P3     |

### B. Nhắn tin 1-1 / chung

| Tính năng                                                       | zca method                                                          | Trạng thái           | P             |
| --------------------------------------------------------------- | ------------------------------------------------------------------- | -------------------- | ------------- |
| Text/ảnh/file/sticker/reply/reaction/recall/forward/typing/seen | (đã wrap)                                                           | **XONG**             | —             |
| Gửi voice (thu mic)                                             | `sendVoice` (cần URL → tự host bytea)                               | chưa                 | **P3** (chọn) |
| Gửi video                                                       | `sendVideo` (URL+thumb → tự host)                                   | chưa                 | P3            |
| GIF                                                             | gửi như attachment/sticker                                          | chưa                 | **P3** (chọn) |
| Link preview (nhận + gửi)                                       | `parseLink` / `sendLink`                                            | render thô           | P2            |
| Danh thiếp (contact card)                                       | `sendCard`                                                          | chưa                 | P3            |
| Quick replies (lưu mẫu, trigger `/`)                            | `addQuickMessage`/`update`/`remove` (+ `getQuickMessageList` đã có) | route POST còn THIẾU | P2            |
| Nhảy tới tin được quote                                         | client-only                                                         | chưa                 | P2            |
| Xoá phía tôi (delete-for-me)                                    | `deleteMessage(onlyMe=true)`                                        | chưa                 | P3            |
| TTL/tin tự xoá                                                  | `updateAutoDeleteChat`                                              | chưa                 | P3            |
| Emoji picker (search + category)                                | client                                                              | thô                  | P2            |
| Sticker theo danh mục/gói                                       | `getStickerCategoryDetail`                                          | chỉ search           | **P3** (chọn) |
| Backfill lịch sử 1-1                                            | `listener.requestOldMessages` (+ event `old_messages`)              | **CHƯA rõ — spike**  | P1 spike      |

### C. Nhóm

| Tính năng                           | zca method                                                                                    | P                   |
| ----------------------------------- | --------------------------------------------------------------------------------------------- | ------------------- |
| @mention (đã có 1 phần)             | `sendMessage({mentions})`                                                                     | P2 hoàn thiện       |
| Tin hệ thống (join/leave/kick…)     | listener `group_event`                                                                        | P2                  |
| Tạo/quản lý nhóm, thành viên, admin | `createGroup`/`addUserToGroup`/`removeUserFromGroup`/`addGroupDeputy`/`updateGroupSettings`/… | P4 (tuỳ chọn)       |
| Poll / Note / Reminder              | `createPoll`/`votePoll`/`createNote`/`createReminder`/…                                       | P4 (tuỳ chọn)       |
| Per-member read receipts            | ❌ KHÔNG hỗ trợ (seen gộp)                                                                    | — (ghi rõ giới hạn) |
| Pin tin trong nhóm                  | ❌ KHÔNG có API (chỉ pin cả hội thoại)                                                        | —                   |

### D. Thông báo (user chọn)

| Tính năng                                           | Cách          | P             |
| --------------------------------------------------- | ------------- | ------------- |
| Toast/banner trong app khi có tin (đang ở tab khác) | client + SSE  | **P2**        |
| Âm thanh + Web Notification API                     | client        | **P2**        |
| Badge tổng trên tiêu đề tab                         | client        | **P2**        |
| Push khi đóng tab (FCM/service worker)              | hạ tầng riêng | P4 (tuỳ chọn) |

### E. ZNS / OA (user chọn)

| Tính năng                                      | Cách                                                   | P      |
| ---------------------------------------------- | ------------------------------------------------------ | ------ |
| Form ZNS động theo template (khỏi gõ JSON)     | render từ template params (đã có `web2_zns_templates`) | **P2** |
| Tự gửi ZNS xác nhận đơn / nhắc CK              | wire `Web2Zalo.sendZNS` vào native-orders + SePay      | **P3** |
| Webhook nhận trạng thái ZNS (delivered/opened) | route webhook mới                                      | P4     |

### F. NGOÀI TẦM (zca KHÔNG hỗ trợ — ghi rõ, không hứa)

Gọi thoại/video, **sửa tin (edit)**, hẹn giờ gửi (zca), gỡ reaction, per-member read nhóm, pin tin trong thread, đăng story/feed, thanh toán/ví. → Hiển thị disabled hoặc bỏ; tin giao dịch quan trọng đẩy qua OA/ZNS.

---

## 4. Kiến trúc đích (3-pane giống Zalo, vanilla, no build step)

```
web2/zalo/index.html  → shell mới: icon-rail trái + view chính
┌──────┬───────────────────┬────────────────────────────┬───────────────┐
│ icon │  Danh sách hội     │   Khung chat (WZChat        │  Panel thông  │
│ rail │  thoại (search,    │   .mountConversation —      │  tin (media/  │
│ 64px │  pin, label, unread│   GIỮ NGUYÊN engine)        │  file/link,   │
│      │  badge, preview    │                             │  thành viên)  │
│ Chat │  nhãn media)       │                             │  collapsible  │
│ Bạn  │  ~320-360px        │   flex-1                    │  ~340px       │
│ ZNS  │                    │                             │               │
│ Cấu  │                    │                             │               │
│ hình │                    │                             │               │
└──────┴───────────────────┴────────────────────────────┴───────────────┘
```

- **Icon rail** thay 4 tab cũ: Chat (3-pane), Danh bạ/Tài khoản, ZNS, Tra cứu, Cấu hình (health đăng nhập). Giống rail trái Zalo PC.
- **Khung chat giữa = `WZChat.mountConversation` GIỮ NGUYÊN** (hợp đồng) — chỉ nâng cấp bên trong + thêm panel phải.
- Màu: `var(--web2-primary, #0068ff)` (xanh Zalo). KHÔNG hardcode tím, KHÔNG `backdrop-filter: blur()`, box-shadow ≤ 24px (modal anti-lag).

### Module mới (tách nhỏ, đặt đúng chỗ shared vs page)

**Backend (tách `web2-zalo.js` 2203 dòng):**

- `routes/web2-zalo/` → `accounts.js`, `login.js`, `conversations.js`, `messages.js`, `send.js`, `convmgmt.js` (pin/mute/unread/label), `oa-zns.js`, `admin.js`, `index.js` (mount).
- `services/web2-zalo-watchdog.js` — watchdog + keepalive + re-login + single-listener lock (P0).
- Mở rộng `services/web2-zalo-zca.js`: wrap thêm `sendVoice/sendVideo/sendLink/sendCard/parseLink/uploadAttachment`, conv-mgmt (`setPinnedConversations/setMute/addUnreadMark/updateLabels/…`), quick-message CRUD, `keepAlive`, `getOwnId`, `listener.requestOldMessages`.

**Frontend (engine shared `web2/shared/zalo-chat/`):**

- Sửa **single-conversation global store** → store theo `convId` (cho phép 3-pane chuyển hội thoại + mount nhiều panel an toàn). RỦI RO cao nhất, làm cẩn thận.
- Thêm: `info-panel.js` (panel phải media/file/link/thành viên), `notifications.js` (toast/sound/Web Notification/tab badge), `conv-list.js` (list 3-pane với pin/label/unread — có thể ở page), emoji search + sticker categories, jump-to-quoted.
- Bỏ drift `ENGINE_VER`: 1 nguồn version.

**Page `web2/zalo/js/`:** rebuild shell 3-pane (rail + list + info-panel) + tab Cấu hình (health login). Giữ `?focus=`.

---

## 5. LỘ TRÌNH (build order) — backend trước, deploy + verify rồi mới frontend

- **Phase 0 — Plan** (file này) + spike verify `listener.requestOldMessages` có backfill 1-1 không.
- **Phase 1 — P0 ĐĂNG NHẬP BỀN** (lõi "không bị văng"): watchdog + auto-reconnect + keepalive + re-login chủ động + single-listener lock + pin imei/UA + observability + UI health/cảnh báo. Deploy + verify kick→tự hồi.
- **Phase 2 — Rebuild UI 3-pane** (giữ engine): icon-rail + conv-list nâng cấp + info-panel + **thông báo (toast/sound/badge)** + **pin/mute/mark-unread** + **quick-replies POST** + **ZNS form động** + link-preview + emoji/sticker polish + jump-to-quote.
- **Phase 3 — Lấp tính năng chat** (user chọn): **voice record→gửi**, **GIF**, **sticker theo gói**, video, contact card, delete-for-me, TTL + **tự gửi ZNS theo đơn** (native-orders + SePay).
- **Phase 4 — Nhóm nâng cao + modular hoá** (tuỳ chọn): system messages, poll/note/reminder, quản lý nhóm; tách route 2203 dòng; multi-conv store; labels/archive/hidden; FCM push.
- **Phase 5 — Test + Docs**: Playwright `--ext n2store-extension`, **chỉ self-thread / clone `0123456788`** (KHÔNG khách thật); cập nhật `dev-log.md`, `ZALO-INTEGRATION.md`, overview `#auditPages`, `WEB2-PAGES-ANALYSIS.md`, memory.

---

## 6. RỦI RO & BẤT BIẾN (không được phá)

- **Không phá 4 trang consumer** — giữ mọi hợp đồng §1. Mọi đổi engine phải defensive + bump version đồng loạt.
- **Single-store → multi-store** là refactor rủi ro nhất (reply/pending bleed giữa panel). Test kỹ.
- **Reconnect storm**: phải `await listener.stop()` xong + cooldown trước re-login (kẻo tự-kick).
- **Ban risk zca-js**: throttle gửi, dùng TK phụ, pin version (issue #333: >2.0.0-beta.19 hay 1006 ở quy mô lớn → cân nhắc khi nâng cấp).
- **Bảo mật**: `WEB2_ENC_KEY` PHẢI set (session plaintext nếu thiếu); mọi write gắn `x-web2-token`; escape XSS mọi content/tên/preview; media `referrerpolicy="no-referrer"`.
- **GMT+7** mọi hiển thị thời gian; epoch lưu UTC.
- File mới ≤ 800 dòng, `#Note` + `WEB2.0` header; mutation dùng `Web2Optimistic` (trừ money/validation-strict).

---

## 7. Nguồn tham chiếu

- zca-js 2.1.2 (148 method) — `render.com/node_modules/zca-js/dist/zalo.d.ts`; repo RFS-ADRENO/zca-js (issues #153/#198/#293/#331/#333/#344).
- Zalo UI: bond-hub-fe, nxquan/Zalo-Clone, Quindart/zalo-meta-web; help.zalo.me.
- Nội bộ: `docs/web2/ZALO-INTEGRATION.md`, `ZALO-CHAT-BUILD-SPEC.md`, `SSE-REALTIME.md`, memory `reference_web2_zalo` / `reference_zalo_cookie_login` / `reference_web2_sse_cross_instance`.
