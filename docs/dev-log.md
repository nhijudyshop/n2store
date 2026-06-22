# Dev Log

## 2026-06-22

### [feat] Zalo rebuild Phase 2b-rest — quick-replies lưu/“/” trigger + ZNS form động + link preview card

Hoàn tất phần còn lại của Phase 2b (notifications + conv-mgmt đã xong trước). 3 tính năng, tách nhỏ + tái dùng shared chat engine (dùng chung cho native-orders/live-chat qua `Web2Zalo.mountChat`).

- **Quick-replies — lưu mới + “/” trigger**: `web2-zalo-zca.js` thêm `addQuickMessage(accountKey,{keyword,title})` (zca `api.addQuickMessage`) + chuẩn hoá `getQuickMessages` → `{id,keyword,title}` (cũ trả `message` object thô → composer map sai). Route `POST /quick-replies`. `ZaloApi.addQuickReply`. Composer (`zalo-chat/composer.js`): picker fix shape + thêm mục “➕ Lưu câu trả lời nhanh…” (Popup.prompt nội dung+từ khoá, fallback prompt) + gõ “/” đầu ô → mở picker, chọn THAY nguyên text (`replaceSlash`).
- **ZNS form động**: thay textarea JSON thô bằng form render 1 ô / param của template (`web2_zns_templates.params`): required (\*) + type NUMBER→input number + placeholder = sample. Template KHÔNG có metadata param → ẩn form, mở `<details>` “Nhập JSON thủ công (nâng cao)” (giữ fallback power-user). `_collectZnsData` validate required client-side, build `data` từ form hoặc JSON. `lookup-zns.js` + `index.html` (#wzZnsFields/#wzZnsRaw).
- **Link preview card**: `_extractAttachment` tách `desc` riêng cho kind `link` (giữ fallback tên tệp cho kind khác). `bubbles.js` kind `link` → card xem trước (thumb 1.91:1 + title 2-dòng + desc + host) khi có metadata; thiếu → link gọn `.wz-msg-linkbox` như cũ. CSS `.wz-msg-linkcard` (chat-bubbles.css).
- **Verify browser (localhost, 0 lỗi console)**: ZNS form render đúng 3 ô (customer_name\*, order_code\*, amount=number), raw JSON thu gọn; template 0 param → form ẩn + raw mở. Link card: title/host(shopee.vn)/thumb đủ; link không metadata → fallback linkbox. node --check pass 7 file. Bump `?v=20260622p3` (index.html + ENGINE_VER ở web2-zalo.js cho trang tiêu thụ).
- **Còn lại**: live verify quick-reply + ZNS cần TK Zalo + OA kết nối (localhost không có); deploy Render cho route mới. Tiếp Phase 3 (voice/GIF/sticker pack/video/contact + auto-ZNS).

### [feat] Xưởng Video AI — frontend "Giọng AI Pro" (engine + tab kho giọng, mặc định Adam 3)

Nối tiếp backend: cắm engine `pro` vào `Web2VideoTTS` + tab kho giọng.

- **video-tts.js**: thêm engine `pro` (proStatus/listProVoices/\_proChunk gọi `/api/web2-tts-pro`, decode .wav→samples), dispatch trong synthesize + synthVoiceMeta, hỗ trợ addLibraryVoice/\_persistLib/loadLibraryVoices (proId). **Adam 3 = VOICES[0]** (mặc định, ưu tiên theo yêu cầu; nhãn "Adam 3", proId community id).
- **video-library.js**: tab "Giọng AI Pro" (renderPro/\_loadProVoices/\_appendProRows/previewProVoice/addProVoice) — search server-side (vd "adam") + cuộn nạp thêm + nghe thử (synth mẫu ngắn) + Thêm vào picker. Mirror tab ElevenLabs.
- **Giấu nhà cung cấp**: nhãn "Giọng AI Pro"/"Adam 3", route trung tính, audio relay .wav → frontend không lộ lucylab/ttsapi/vivibe.
- Bump `video-tts.js`/`video-library.js`?v=20260622d. Còn lại: chờ Render deploy xong → verify route live + browser test.

### [feat] Xưởng Video AI — thêm engine "Giọng AI Pro" (backend, giấu nhà cung cấp)

Tích hợp dịch vụ TTS tiếng Việt (giọng cộng đồng "Adam 3"…) vào Web 2.0. **Yêu cầu user: KHÔNG để lộ tên nhà cung cấp ra frontend** → đặt tên trung tính "Giọng AI Pro", route `/api/web2-tts-pro`, backend RELAY audio (domain nhà cung cấp không xuất hiện ở browser).

- **Research trước khi code**: site chặn bot → curl UA đọc `api-docs.html`; GitHub có nhiều client tham chiếu (xác nhận flow). **Probe live bằng key**: `getUserVoices` OK (total 0), `getCommunityVoices` accessible-via-key (các method search/marketplace bị chặn) → **Adam 3 id = (community voice)**; chạy thử `ttsLongText`→poll `active→completed`~4s→ `.wav` công khai. Pipeline verified end-to-end.
- **Backend mới**: `services/web2-tts-pro-service.js` (JSON-RPC api.lucylab.io; xoay tua `VIVIBE_API_KEY1..5` + cooldown 1h failover; `listCommunityVoices`/`listUserVoices`; `tts()` = ttsLongText→poll getExportStatus 2s/120s→tải .wav→Buffer) + `routes/web2-tts-pro.js` (`/status`,`/voices`?scope=community|user,`/tts` audio/wav, requireWeb2AuthSoft+rateLimit). Mount server.js cạnh elevenlabs. Worker auto-forward (prefix web2-).
- **Giấu nhà cung cấp**: route trung tính + relay .wav qua server → frontend không thấy lucylab.io/ttsapi.app; key chỉ ở env Render.
- **Còn lại**: set env VIVIBE_API_KEY1..5 trên web2-api + deploy; build frontend engine `vivibe`/"pro" trong Web2VideoTTS + UI chọn giọng (ưu tiên Adam 3); test live.

### [refactor] Table unify Web 2.0 → canonical .data-table (Step 6, workflow 7-agent)

Tiếp button-unify: migrate bảng fork → look canonical `.data-table` (native-orders: header #f0eeee bold, zebra #f7f9fb, grid #d9dde0/#e5e8ea, padding 8px/10px). Method low-risk: **THÊM class `data-table` vào markup** (giữ fork class cho column-width) + **xoá rule fork xung đột** (thead bg/font/padding/border, td padding/border, zebra, hover, border-collapse) → canonical thắng; **GIỮ column widths + special cells** (status pill, badge, muted, sticky, sortable indicator).

- Fork migrated: `u-table` (users), `sd-table`/`sd-detail-table`/`sd-congno-table` (supplier-debt, 4 bảng), `rt-table` (returns), `wc-table` (customers, giữ min-width 920 + sticky), `sw-table` (supplier-wallet + customer-wallet), `w2bh-table` (balance-history). check-others: kpi/report-revenue/report-delivery/audit-log/dashboard/fb-ads-stats.
- ⚠ Retarget row-tint khỏi `tr` → `> td` ở supplier-debt (expanded/credit-move) + `!important` detail-cell để canonical zebra (apply trên `> td`) không đè semantic tint.
- **Verify browser**: users (8 col/6 row), customers (8 col/50 row), balance-history (5 col/50 row) — thBg #f0eeee, weight 700, padding 8/10, zebra #f7f9fb, **cột + special cell nguyên vẹn** (screenshot customers OK). CSS brace-balanced.
- Commit bị "auto: session update" hook gom chung (`f4892eded`) — đã verify + pushed. ⚠ EXCLUDE zalo (session khác đang code Phase2b). **Còn lại: Step 7 modals → shared `.modal-*`.**

### [refactor] Button consistency toàn Web 2.0 — audit 47 trang (workflow) + unify fork → canonical

User: "Hình 1 vs Hình 2 button khác nhau" + "audit từng button/bảng/modal từng trang rồi làm". Dùng workflow ultracode: audit 47 trang (7 agent batch, tránh rate-limit) → synthesis canonical + fix plan → implement (7 agent, mỗi agent 1 nhóm file, không đụng nhau).

- **Gốc khác biệt**: 5 trang (so-order, users, supplier-debt, reconcile, customer-wallet) **redefine LOCAL `.btn-*`** (teal #0d9488 / indigo #3730a3 / gradient + glow + `translateY(-1px)` lift + radius 6-8px) → HTML trông canonical nhưng render lệch. Nhiều trang khác fork họ nút riêng (.jt-btn/.fbp-btn/.ps-btn/.mt-btn/.vm-btn/.vb-btn/.pcard-btn/.pe-btn) + màu primary lệch brand (cyan #0891b2, generic #3b82f6).
- **Canonical** = `.web2-btn` (web2-components.css) + `.btn/.btn-*` (web2-theme.css, scoped `.web2-theme`/`body:has(.web2-shell)`, Zalo-blue #0068ff). Geometry ở `.btn` base; `.btn-primary` chỉ thêm màu/gradient (Zalo Refresh Pack — gradient nhẹ là CANONICAL, KHÔNG flatten).
- **Step 1** — XOÁ local `.btn-*` ở 5 trang (canonical out-specifies → tự kế thừa, 0 markup). **Step 2** — recolor off-brand → var(--web2-primary): reconcile/ck-dashboard teal, balance-history cyan, live-chat/report-delivery #3b82f6, customers token. **Step 3** — restyle 11 fork-button-class in-place (radius 2px, weight 500, bỏ translateY lift + glow, primary solid). fb-posts.css shared → fix 3 trang FB.
- **⚠ BUG tự bắt + sửa**: so-order (29) + customer-wallet (7) dùng `class="btn-primary"` TRẦN (không `.btn` base) → xoá local block làm nút mất geometry (browser default radius 0/weight 400). Fix: thêm `.btn` vào markup (HTML+JS) → `class="btn btn-primary"`. users/supplier-debt/reconcile vốn dùng `.btn btn-*` nên OK. Verify browser: reconcile/supplier-debt render canonical (gradient, 9px, weight 500) đồng nhất.
- **EXCLUDE**: zalo (session khác đang code), leave-alone list (photo-studio/live-tv/product-counter standalone app, .w2p-bulk-btn dark bar, tab-nav structure, swatch chips, canonical .btn gradient). 23 file CSS brace-balanced. **Còn lại (đợt sau, risk cao)**: Step 4 toolbar markup, Step 6 tables→.data-table, Step 7 modals→shared .modal-\*.

### [feat] Zalo rebuild — Phase 2b (core): thông báo tin mới + quản lý hội thoại (ghim/mute/đánh dấu chưa đọc)

- **Thông báo tin mới** — module mới `web2/zalo/js/web2-zalo-notify.js` (`WZApp.zaloNotify`): toast (notificationManager) + beep Web Audio (throttle 1.5s, tắt được qua localStorage) + **badge số chưa đọc trên `document.title`** + Web Notification API (khi tab ẩn, xin quyền ở user-gesture mở hội thoại). Phát hiện tin mới = diff unread danh sách hội thoại trước/sau mỗi `loadConversations` (bỏ qua lần đầu + khi đang tìm). Wire trong `web2-zalo-chat.js` (snapshot→notify) + `openConversation` gọi `ensurePermission`.
- **Quản lý hội thoại (DB-driven)** — backend `routes/web2-zalo.js`: `POST /conversations/:id/{pin,mute,mark}` (cột `is_pinned/is_muted/muted_until/unread_count`), GET `/conversations` ORDER BY `is_pinned DESC` (ghim nổi lên đầu), `_notify('web2:zalo:messages')` để tab khác refresh. Client `ZaloApi.{pinConversation,muteConversation,markConversation}`. Frontend `web2-zalo-chat.js`: icon ghim/chuông-tắt trên item + nút "⋯" hover → context menu (Ghim / Tắt thông báo / Đánh dấu chưa đọc), wire `Web2Optimistic` (UI-first + rollback). CSS `.wz-conv-side/.wz-conv-menu/.wz-ctx-menu/.wz-conv-ic` + dim item muted.
- **Verify Playwright**: menu "⋯" mở đúng 3 mục, tab title `(11) Zalo - WEB 2.0` (badge unread chạy), 0 JS error, no overflow. Routes pin/mute/mark cần deploy Render mới persist (optimistic apply + rollback nếu 404 trước deploy). Còn lại Phase 2b: quick-replies POST (zca `addQuickMessage`) + ZNS form động.

### [feat] Zalo — bỏ giới hạn allowlist nhóm (hiện TẤT CẢ nhóm + hội thoại 1-1)

User: "nhớ bỏ giới hạn hiện group đi". Trước đây Zalo CHỈ lưu/hiện 2 nhóm trong `web2_zalo_tracked_groups` (allowlist BẬT khi bảng ≥1 row) → đụng mục tiêu "full Zalo như app thật".

- `render.com/routes/web2-zalo.js`: allowlist nhóm giờ **MẶC ĐỊNH TẮT** — `_filterActive = _ALLOWLIST_ON && _trackedSet.size > 0`, với `_ALLOWLIST_ON = process.env.WEB2_ZALO_GROUP_ALLOWLIST === '1'`. Env unset (mặc định) → filter OFF → `_persistIncoming` (line 332) + `sync-conversations` (user+group) KHÔNG bỏ qua hội thoại nào → lưu/hiện TẤT CẢ.
- GIỮ bảng `web2_zalo_tracked_groups` + route `/tracked-groups` làm **opt-in tương lai** (vd "nhóm ưu tiên") — không xoá capability, chỉ đổi default. Bật lại = set env `WEB2_ZALO_GROUP_ALLOWLIST=1`.
- Cần **deploy Render** + bấm "Đồng bộ" (sync-conversations) 1 lần để seed toàn bộ bạn bè + nhóm vào danh sách (tin mới từ nhóm khác cũng tự tạo hội thoại). Retention 7 ngày giữ nguyên (không liên quan).

### [feat] Zalo rebuild — Phase 2a: layout 3-pane giống app Zalo PC (icon rail · danh sách · chat · info panel)

Rebuild giao diện trang `web2/zalo/` từ top-tabs 2-pane → **3-pane giống Zalo PC**, GIỮ engine chat shared (`WZChat.mountConversation`) + mọi hợp đồng (4 trang consumer + `?focus=` deep-link).

- **`index.html`**: bỏ `.wz-page-head` + top `.wz-tabs` → **icon rail dọc** (`.wz-rail`: brand + Chat/Tài khoản/Tra cứu/ZNS + đèn sức khoẻ chân rail). **Chat là khu vực MẶC ĐỊNH**. Panel Chat thành 3-pane `.wz-chat3`: `.wz-conv-col` (account select + `#wzConvList`) · `#wzChatMain` (engine shared) · `#wzInfoPanel` (cột thông tin phải, ẩn khi chưa mở hội thoại). GIỮ nguyên mọi ID JS phụ thuộc.
- **`web2-zalo-app.js`**: `.wz-tab`→`.wz-rail-tab`, keyboard ↑/↓ cho rail dọc, `init()` mặc định `switchTab('chat')`, SSE accounts luôn refresh (đèn sức khoẻ rail realtime).
- **`web2-zalo-chat.js`**: `openConversation` render thêm `renderInfoPanel(conv)` (avatar/tên/loại + SĐT/UID/Tài khoản, nút ẩn panel).
- **`web2-zalo-accounts.js`**: `renderStatusStrip` → đèn sức khoẻ chân rail `#wzRailHealth` (N/M + màu connected/reconnecting/error + tooltip kicked).
- **`web2-zalo.css`**: block "PHASE 2 REBUILD" — `.wz-main` full-height flex, rail/view/3-pane/info-panel/empty-state + responsive (info panel overlay <1180px, rail→thanh trên <680px). Rule ID `#wzPanelChat !important` đè min-height/padding/animation global của `.wz-panel` (panel bị cap 750 thay vì 900).
- **Verify Playwright @1456×900**: 4 rail tab, chat mặc định, 3-pane đầy chiều cao (900/900/900), mở hội thoại → engine mount (header+composer+tin thật) + info panel hiện, 4 tab render, **0 JS error, docOverflowX=0**. Bump `?v=20260622p2`. Tiếp: Phase 2b pin/mute/badge/thông báo/quick-reply/ZNS form.

### [feat] Zalo rebuild — Phase 1: login watchdog "không bị văng nick" (auto-reconnect + keepalive + proactive re-login)

User: "Làm lại toàn bộ trang web2/zalo + nghiên cứu sâu phần đăng nhập không bị văng nick ở máy khác → audit lên plan trước khi làm" → duyệt plan (`docs/web2/ZALO-REBUILD-PLAN.md`) → "Làm tất cả". Bắt đầu Phase 1 (lõi đăng nhập bền).

- **Research (10 agent, 2 workflow)**: cơ chế "văng nick" = Zalo CHỈ cho 1 listener realtime/TK; mở chat.zalo.me TK đó ở máy khác → kick listener (close 3000/3003); **app điện thoại KHÔNG kick**; **bị kick KHÔNG mất cookie** (vẫn re-login lại được). zca-js KHÔNG có refresh API; `zpw_sek` ~7 ngày. Lỗ hổng code cũ: rớt là đứng im (không watchdog/keepalive/reconnect). zca-js 2.1.2 cài sẵn có 148 method (wrapper mới dùng ~30).
- **Watchdog trong `services/web2-zalo-zca.js`**: lưu `creds/label/expectedUid/connectedAt` per phiên để tự re-login (không đọc lại DB). `_scheduleReconnect(code)` + `_doReconnect()`: close/error → tự kết nối lại; **1006/network = backoff lũy thừa** [5,15,30,60,120]s (cap 10 lần → bỏ cuộc `gaveUp` chờ login tay, tránh hammer→ban); **3000/3003 (bị giành phiên) = reconnect chậm 30s + trần KICK_CAP=4 liên tiếp → nghỉ 10 phút + status `kicked`** (tránh "đấu" với máy khác/instance deploy chồng). `_doReconnect` stop listener cũ + cooldown 3s trước re-login (chống tự-kick). `_watchdogTick` mỗi 90s: keepAlive (~ping giữ phiên) + liveness + reconnect phiên chết + **re-login chủ động ở 3.5 ngày** (cuốn cookie trong cửa sổ 7 ngày). `_bumpEvent` cập nhật `lastEventAt`. `stopAll()` graceful (đóng listener nhường phiên cho instance mới khi deploy).
- **Observability**: `status()/statusAll()` trả `healthy/connectedAt/lastEventAt/lastCloseCode/reconnecting/consecutiveKicks`. Route `_safeAccount` surface `health{...}` cho `/status` + `/accounts`.
- **Graceful shutdown** (`server.js`): gọi `web2ZaloRoutes.stopZalo()` (→ `zca.stopAll()`) trước khi đóng HTTP → instance cũ nhả WS, instance mới ăn phiên không "đấu" (xử lý deploy overlap mà KHÔNG cần lock riêng).
- **Frontend health UI** (`web2-zalo-accounts.js` + utils + css): đèn `reconnecting` (vàng pulse) / `kicked` (đỏ); cảnh báo **"Tài khoản đang mở ở nơi khác — đừng mở chat.zalo.me TK này trên máy khác (app điện thoại OK), bấm Kết nối lại"**; hint TK connected: **"Đang nghe realtime trên máy chủ → nhân viên dùng được ở mọi máy"**. Label `kicked`/`reconnecting` thêm vào STATUS_LABEL.
- **Files**: `render.com/services/web2-zalo-zca.js`, `render.com/routes/web2-zalo.js`, `render.com/server.js`, `web2/zalo/js/web2-zalo-{accounts,utils}.js`, `web2/zalo/css/web2-zalo.css`. Syntax + load smoke PASS. Cross-instance lock chính thức: hoãn (graceful stopZalo + kick-cap đã phủ deploy overlap; chỉ cần khi xác minh zca chạy đa-service đồng thời qua log).
- **Plan tổng**: `docs/web2/ZALO-REBUILD-PLAN.md` (Phase 1 login → 2 UI 3-pane → 3 feature fill → 4 group+modular → 5 test). Chờ deploy verify kick→tự hồi.

### [feat] live-chat → layout 3 CỘT (Comment | Kho SP to | Video+Thống kê) + bảng thông tin livestream

User (screenshot): Kho SP (cột phải cũ) nhỏ quá khó nhìn/tương tác → cho cột comment hẹp lại, dời Kho SP sang cột riêng to hơn; dưới ô video giờ trống → cho video to hơn + thêm thông tin livestream (tổng comment, lượt view, like, chia sẻ…).

- **Layout đổi từ 2 cột → 3 cột** (`live-chat/index.html`): `#liveColumn` (comment, flex:1 — hẹp lại) | `#khoSpColumn` (Kho SP, **320→400px**, SP to dễ kéo/bấm) | `#videoColumn` (MỚI, 304px = ô video live to + bảng "Thông tin Livestream"). Trước đây video dock vào đỉnh Kho SP; nay tách hẳn sang cột Video riêng. `#videoColumn` thêm vào danh sách ẩn `html.lc-mobile` (mobile chỉ đọc comment).
- **Ô video to hơn**: `SNAP_VIDEO_W` 160→**224** (`live-livestream-snap-state.js`) — capture đọc `videoWidth` động nên an toàn; frame chụp cũng nét hơn. `_ensureVideoDock` (`live-livestream-snap-stream.js`) retarget vào `#liveVideoDockHost` (fallback Kho SP nếu thiếu cột); placeholder "📹 Chưa kết nối video" ẩn/hiện qua class `has-video` (set khi capture, remove khi ngắt).
- **SP card TO hơn** (`inventory-panel.css`): thêm `@container (min-width:340px)` (panel ~400px) → thumbnail **56→88px**, nút + **32→42px**, giá **15→18px**, tên 2 dòng. Verify: panelW 399 → thumb 88×88, add 42, price 18px.
- **Bảng "Thông tin Livestream"** (MỚI): module `js/live/live-stats-panel.js` (`window.LiveStatsPanel`) + CSS `css/live/live-stats.css`. Gom số liệu CÁC bài live đang chọn: 💬 bình luận / 👁️ lượt xem / ❤️ lượt thích / 🔁 chia sẻ / 📞 SĐT thu / 🛒 đơn đã tạo / 🙈 đã ẩn + pill 🔴Đang live / Đã kết thúc. **Event-driven** — `LiveCommentList._updateTotalBadge()` gọi `scheduleUpdate()` (debounce 400ms) mỗi nhịp render comment → KHÔNG poller (CLAUDE.md rule 6).
- **Shared `fetchLivePosts`** (`web2/shared/web2-chat-live.js`): map thêm `viewCount/likeCount/reactionCount/shareCount/savedCount/phoneCount/liveStatus` từ Pancake post API (trước chỉ `commentCount`) — 1 nguồn, backward-compat. Field thật xác minh qua browser-test: `comment_count/view_count/reactions{like_count,love_count,…}/share_count/phone_number_count/live_video_status`.
- **Verify** (Playwright @1440, live thật): 3 cột 394/400/304, video 224px, 7 ô stats (💬333 📞13 🙈1, pill "Đã kết thúc"), 0 console error. "0 SP" trong test = campaign phiên test không có SP (data env), không phải lỗi layout — card to verified qua inject. Bump `?v=20260622lc3col`.

### [chore] Web 2.0 selective data-wipe tooling (audit→execute) — xoá đơn/SP/NCC/ví/KPI/chiến-dịch-cha, GIỮ KH+chuyển khoản

User: audit toàn bộ data Web 2.0 → xoá đơn hàng/SP/NCC/ví KH/KPI + chiến dịch cha (hiển thị SP ở live-control/live-tv); GIỮ khách hàng + chuyển khoản + data vận hành (live comment, Zalo/chat, FB, noti, J&T) + auth/config.

- **Quyết định KEEP/DELETE** (qua AskUserQuestion + các tin nhắn): DELETE = web2_so_order/order_tags/returns/cart_history/native_orders/fast_sale_orders (đơn) + web2_products/variants/product_history/campaign_products (SP) + web2_supplier_meta/ledger (NCC) + web2_customer_wallets/wallet_transactions/wallet_adjustments/payment_signals/payment_qr_codes/pending_matches (ví/tiền KH) + web2_live_parent_campaigns (chiến dịch cha) + web2_kpi_assignments/\_history/events (KPI). KEEP = web2_customers + web2_balance_history + vận hành + auth/config.
- **Truy cập web2Db**: local BỊ CHẶN — n2store_web2 có IP Access Control (web1 connect OK, web2 từ chối SSL handshake). Sửa firewall = security action → KHÔNG tự làm. Pivot sang **kênh admin sẵn có trong Render**.
- **Endpoint** `POST /api/admin/web2-data-wipe` thêm vào `admin-web2-wallet-reset.js` (tái dùng authOk x-admin-secret=CLEANUP_SECRET + assertSafeTable + guard web2Db≠chatDb). `{mode:'audit'}` = đếm dòng + phân loại + check FK cascade (CHỈ đọc). `{mode:'execute', confirm:'XOA-HET'}` = TRUNCATE … RESTART IDENTITY CASCADE. HARD_KEEP guard (customers/balance_history/customer_intents/users/sessions/migrations/zalo_accounts) không bao giờ truncate. Worker route `/api/admin/web2-*`→web2-api (có web2Db).
- Script standalone `render.com/scripts/web2-selective-wipe.js` (chạy Render Shell qua WEB2_DATABASE_URL) làm fallback.
- **Flow**: deploy → gọi audit (show counts) → user confirm → gọi execute. Audit-first, KHÔNG xoá mù.
- **ĐÃ THỰC THI (verified)**: execute confirm:'XOA-HET' + dropBackups + clearRecords → **22 bảng TRUNCATE (435 dòng), 23 bảng `_bak_*` DROP, web2_records cleared**. Audit lại: delete-set = 0, _bak_\* = 0. **GIỮ NGUYÊN: web2_customers 64.369, web2_balance_history 240, vận hành (live_comments 17.553, notifications 3.086, zalo_messages 396, jt_tracking 226)**. Endpoint để lại (guard x-admin-secret như wallet-reset). web2_records sau wipe có 1 dòng mới = data tươi (data cũ đã sạch).

### [fix] hide ElevenLabs/VieNeu brand khỏi UI Web 2.0 → nhãn trung tính

User: bỏ tên hãng "ElevenLabs"/"VieNeu" hiển thị trên web (4 screenshot video-maker). Đổi text HIỂN THỊ:

- "ElevenLabs" (tab Kho giọng, label, status, error toast) → **"Giọng AI"**; help bật tính năng genericize (bỏ elevenlabs.io + tên env key khỏi UI).
- "VieNeu" (card "Giọng cao cấp / Clone giọng (VieNeu)", status, notify, tooltip cảm xúc) → bỏ / **"Giọng cao cấp"**.
- Files: video-maker (index.html + video-tts/library/maker/vieneu.js), web2-vieneu.js, printer-settings. GIỮ NGUYÊN: comment code (không hiển thị) + nội dung .bat installer (chạy cmd, KHÔNG trên web; tên task/thư mục N2StoreVieNeu/VieNeu-TTS là functional — đổi sẽ vỡ gỡ-cài). Commit `aee1cd462`.

### [fix] Xưởng Video AI — preview nổi ĐÈ lên card → dock thành CỘT riêng (hết đè, cân đối)

User report (screenshot): khung xem trước (PiP nổi `position:absolute`) đè lên card "Các cảnh"/"Hiệu ứng chung" ở mode wide-edit → giao diện "chưa cân đối + bị đè lên nhau".

- **Gốc**: `.vm-stage` ở wide-edit/hidden = `position:absolute; right:18px; bottom:84px` nổi TRÊN `.vm-panel`; card lấp full width (`auto-fill minmax(320px,1fr)`) → card phải nằm DƯỚI PiP → đè.
- **Fix (theo pro-editor CapCut/Canva)**: preview LUÔN là 1 CỘT trong grid, KHÔNG absolute. wide-edit = `grid-template-columns: minmax(0,1fr) clamp(288px,26vw,372px)` (panel rộng trái + rail preview nhỏ phải, dock full-height); preview-focus = `420px minmax(0,1fr)`; preview-hidden = `1fr` (stage `display:none` + FAB "Xem trước" `position:fixed` góc dưới-phải). PiP bar (Phóng to/Ẩn) → `absolute top:10 right:10` trong rail (không đẩy canvas).
- **Verify Playwright @1440px**: wide-edit → stage x=1050..1422, panelRight=1050, **stageOverlapsCards=[]** (0 đè); preview-focus → panel 420(→688) | stage 734(688→1422) khít; preview-hidden → panel full 1164px + stage display:none + FAB fixed; canvas 16:9 fit trong rail; 0 console error. Screenshot xác nhận rail tách biệt, "Các cảnh" hiện đủ. Bump `video-maker.css?v=20260622c`.
- **Tác động**: chỉ **web2/video-maker** (desktop ≥921px). Mobile/iPad ≤920px app-frame không đổi.

### [feat/fix] Sidebar Web 2.0: click icon (thu gọn) → bung + expand group; gỡ "Sổ Order" trùng khỏi Sale Online

User (2 ý): (1) sidebar thu gọn (icon-only) bấm icon group → mở sidebar + expand group đó; (2) 2 "Sổ Order" → chỉ giữ 1 bên Mua hàng.

- **(1) Click group-head khi collapsed**: thêm `Web2Sidebar.onGroupHead(this)` — nếu `isCollapsed()` → `setCollapsed(false)` + `group.add('is-open')`; nếu đang mở → toggle như cũ. Thay inline `onclick="...toggle('is-open')"` ở group-head bằng handler. Collapsed CSS chỉ ẩn label/caret/sub (group-head vẫn click được).
- **(2) Dedup "Sổ Order"**: gỡ item `{label:'Sổ Order', our:'../so-order/index.html'}` khỏi group **Sale Online** (trùng `../so-order/index.html` với **"Sổ Order NCC"** group Mua hàng). Sổ Order là mua hàng từ NCC → thuộc Mua hàng.
- **Verify browser**: Sale Online = [Đơn Web, Live Chat, Chat Pancake, Comment Live, Điều khiển TV, TV Livestream] (hết "Sổ Order"); Mua hàng giữ "Sổ Order NCC"; tổng "Sổ Order" = 1. Collapse→click "Mua hàng": collapsedAfter=false + groupIsOpen=true + submenu hiện. 0 console error. Bump `web2-sidebar.js?v=20260622a` (45 trang).
- **Tác động**: **toàn bộ trang Web 2.0** (sidebar dùng chung) — UX menu thu gọn + bớt 1 mục trùng.

### [fix] products: cột GHI CHÚ lệch hàng (zebra so le) — clamp đặt sai trên `<td>`

User report (screenshot): cột "GHI CHÚ" trang `web2/products` lệch — ô note cao 53px trong hàng 76px, top-align → chừa khoảng trống dưới → zebra/viền so le khó chịu.

- **Gốc**: `.note-cell` (web2-base.css) đặt `display:-webkit-box` + `-webkit-line-clamp:2` **TRỰC TIẾP lên `<td>`** → td mất `display:table-cell` → co lại bằng nội dung (53px), không fill chiều cao hàng. products render `<td class="note-cell">text</td>` (text con trực tiếp).
- **native-orders KHÔNG lỗi** vì dùng pattern đúng: `<div class="web2-note-cell">text</div>` BÊN TRONG td (clamp ở div, td vẫn table-cell).
- **Fix (theo pattern native-orders, DRY)**: (1) `.note-cell` → bỏ clamp, giữ `display:table-cell` + `vertical-align:middle` + color/font/max-width; (2) products render bọc note trong `<div class="web2-note-cell">` (class clamp 2 dòng sẵn có ở web2-components.css, products đã load). Clamp vẫn hoạt động, td fill hàng.
- **Verify browser**: 4 hàng đầu → noteDisplay `table-cell`, noteH=76=nameH, topDelta=0 (thẳng hàng), có inner div. Screenshot xác nhận zebra cột GHI CHÚ khớp hàng. 0 console error. Bump `web2-base.css?v=20260622b3`.
- **Tác động**: chỉ **web2/products** (trang duy nhất render `.note-cell` kiểu cũ). native-orders + trang khác không đổi.

### [feat] Xưởng Video AI — 4 việc (P1-P4): bố cục pro-editor + giọng Piper (bỏ hỏng/nghe-không-tải-model) + ElevenLabs VN

User 4 điểm + ultracode; research 4-agent. P1: Piper nghe thử = clip mẫu HF (<audio> no-cors, KHÔNG tải model) — samplePreviewUrl/previewUrlForVoice. P3: bỏ giọng Piper hỏng vi_VN-25hours_single-low + vivos-x_low (130-symbol→OrtRun OOB), giữ mms+vais; \_piperChunk catch OOB. P2: model eleven_multilingual_v2 KHÔNG có VN → eleven_flash_v2_5 + language_code=vi; backend /shared-voices (lọc+phân trang) + /add-shared + /tts voice_settings; tab ElevenLabs = 1020 giọng VN ưu-tiên + lọc + cuộn + panel cài đặt; deploy web2-api live. P4: 3 mode data-vm-mode (wide-edit + PiP nổi/preview-focus/hidden), desktop ≥921, mobile giữ app-frame. Verify Playwright OK, 0 pageerror. v=20260622b.

### [fix] Button audit toàn Web 2.0 (625+ nút, 12 trang) — fix hamburger UA-default trên native-orders

Audit empiric nút "chưa có giao diện" (đúng phàn nàn gốc của user): browser sweep 12 trang đại diện, đếm nút render UA-default (bg `rgb(239,239,239)` / border đen). Kết quả: **chỉ 1 nút lỗi** = `.w2-mobile-menu-btn` (hamburger mobile) trên **native-orders** — hiện xám trên desktop + không drawer mobile.

- **Gốc**: pack mobile responsive (ẩn hamburger desktop + drawer off-canvas + scrim) nằm CHỈ trong `web2-theme.css` (block F04 ≤900px). **native-orders là trang base-only DUY NHẤT** (load `web2-base.css`, KHÔNG load theme) → thiếu pack → hamburger (do `web2-sidebar.js` tạo) không bị ẩn + không styled.
- **Fix**: thêm "MOBILE SHELL PACK" vào cuối `web2-base.css` (mirror Y HỆT F04 theme): desktop ẩn `.w2-mobile-menu-btn`+`.web2-aside-scrim`; `@media(max-width:900px)` hiện + style hamburger fixed, aside drawer `translateX`, scrim, grid 1-col, main padding. Hamburger/scrim/toggle `.w2-aside-open` đã có sẵn ở sidebar.js → giờ đủ CSS.
- **Vì sao base.css** (không phải theme/mobile.css): native-orders chỉ load base.css; 49 trang khác đã có F04 trong theme → KHÔNG đụng (zero-risk). Trang load cả base+theme nhận rule trùng (identical, theme thắng) — vô hại. theme-only (balance-history) không đụng. Redundancy base↔theme là _necessary_ vì 2 profile load rời nhau.
- **Verify browser**: native-orders desktop 1440px → hamburger `display:none` (offsetParent null), rule desktop-hide + @media parsed trong stylesheet; **0 nút unstyled** (trước=1), 0 page error, 0 console error. Modal check 3 profile: styled OK cả base-only(radius 12px)/themed(18px) — khác bo góc nhỏ, không vỡ. Bump `web2-base.css?v=20260622b2` (11 trang).
- **Tác động**: chỉ **native-orders** (trang base-only duy nhất) — desktop hết nút xám lạc + mobile có drawer; các trang khác không đổi.

### [refactor] CSS consolidate — verify audit (10-agent PASS) + 3 consolidation an toàn (table token / pagination / dead filters)

Tiếp "tất cả → audit → debug → lặp lại tới khi hoàn hảo". **Verify audit workflow `wbgqi1xn7` (10 agent, adversarial)**: verdict **PASS — `noRegressions:true`, `fixNow:[]`**. 5 finding đều LOW/MED = _remaining-consolidation gap_, KHÔNG phải defect do commit trước. Live UI nguyên vẹn.

- **Bảng = 1 NGUỒN token thật** (thay 5 literal hand-synced): thêm `--web2-table-line-strong (#c8ced3)`, `--web2-table-line (#d9dde0)`, `--web2-table-line-soft (#e5e8ea)`, `--web2-table-zebra (#f7f9fb)`, `--web2-table-hover (#eaf2fb)` vào `:root` CẢ web2-base.css VÀ web2-theme.css (mirror — page load mixed: native-orders=base-only, balance-history=theme-only, products=cả 2). `.data-table` 2 file giờ ref token. Đổi look bảng toàn Web 2.0 = sửa 5 dòng.
- **Pagination base ↔ theme đồng nhất**: `.page-btn` trong base.css 32px/6px/`0 10px` → 30px/3px/`0 9px` khớp theme (native-orders base-only giờ đồng bộ themed).
- **Xoá DEAD `.filters`/`.filters-section`** (0 trang dùng bare class, HTML+JS xác nhận): gỡ block dedicated theme.css + 4 selector embedded + 2 selector mobile.css. Input filter các trang vẫn style qua selector input chung; toolbar mỗi trang fork namespaced riêng (.pr-/.ts-/.rc-audit-/.sd-).
- **Verify browser (port 9941, ext, --start overview)**: products (themed) + native-orders (base-only) render BẰNG NHAU 100% — header `#f0eeee`/borders `#c8ced3`+`#d9dde0`/td `#d9dde0`+`#e5e8ea`/zebra `#f7f9fb`, token resolve cả 2, pagination 30px. **0 page error, 0 app console error.** Bump `web2-theme.css?v=20260622t5` (46 trang), `web2-base.css?v=20260622b` (11 trang), `web2-mobile.css?v=20260622a` (sidebar inject).
- **DEFER có chủ đích** (audit xếp LOW/MED follow-up, ép hợp nhất = tự gây regression vì design khác nhau thật): modal base/skin file-unify (3 profile load khác nhau cần def đầy đủ mỗi file), page-header fork (`*-page-head` divergent, chỉ `.so-page-head` trùng thật), filter-fork hợp thành 1 component, purple-tint polish (native-orders-scoped).

### [refactor] CSS Web 2.0 về 1 NGUỒN/component — audit toàn cục (6-agent) + bắt đầu consolidate

User: "web 2.0 module css về 1 nguồn ... bảng/button/modal/header/footer... audit toàn cục → chắc chắn rồi làm". Mục tiêu: mỗi component CSS có 1 nguồn canonical, mọi trang tham chiếu, hết trùng/drift.

- **Audit toàn cục (workflow 6-agent, 21 component)**: map mọi định nghĩa CSS qua 10 file shared + per-page. Phát hiện: trùng lặp NHIỀU nhưng **live UI đã đúng nhờ load-order** (web2-theme.css load CUỐI trên 49 trang → thắng). Vấn đề thật = **dead/duplicate block gây drift**. Chốt canonical: **theme.css=SKIN, base.css=STRUCTURE + look native-orders (trang duy nhất không load theme), components.css=`.web2-btn*`, sidebar.css=shell/sidebar**.
- **Đã làm (LOW-risk, verified)**:
    - **Bảng = look native-orders mặc định toàn Web 2.0** (commit `f2ea3f21b`): rewrite `.data-table` override trong theme.css clone web2-base (grid-line + zebra + header đậm), generic striping. Verified products/balance-history/customers — đồng bộ.
    - **Xoá 4 file orphan** `web2/balance-history/css/{web2-theme,styles,live-mode,accountant}.css` (grep xác nhận 0 ref; ⚠ giữ `modern.css` vì supplier-debt Web 1.0 load, giữ `styles.css` của supplier-debt riêng).
    - **Gỡ dead block page-builder.css** (table/pagination/modal AdminLTE-flat cũ): cả 5 trang page-builder load theme SAU page-builder → block bị override (dead) → giờ bảng/modal/pagination lấy 1 nguồn theme+base. CSS brace-balanced. Bump `page-builder.css?v=20260622cons`.
- **Còn lại (MED-risk, theo executionOrder audit, chưa làm)**: theme.css internal stale (Block B zebra L661 cũ, badge obsolete, card merge), form-controls de-purple + .filters 1 nguồn, page-header chuẩn hoá `.page-head-mini`, modal base/skin split + retire legacy `.btn-*` khỏi base, table full-unify (HIGH — đụng native-orders, defer). Tool browser-test bị flaky giữa chừng nên verify visual hạn chế; các thay đổi đã làm là dead-code/orphan (rủi ro thấp, fallback về canonical).

### [polish] "Chụp Live" — bỏ toast success sau khi chụp (user req)

- User: "không cần thông báo toast sau khi chụp" (chụp liên tục lúc live → toast spam phiền). Gỡ `successMsg` khỏi `Web2Optimistic.run` trong `captureAndSave()` → `if(opts.successMsg)` không bắn → im. Lỗi thật vẫn báo qua `errLabel` + rollback. Manual fallback path vốn đã không có toast success. Syntax PASS.

### [fix] "Chụp Live" chụp ra ảnh trắng — sidebar Kho Hình che iframe lúc capture

User: "nút chụp live → chụp hình bị lỗi … lúc chụp cái này nhảy ra che iframe nên chụp vào bị như hình" (tile lưu vào kho = trắng tinh).

- **Gốc bug**: `captureAndSave()` ([live-chat/js/live/live-livestream-gallery.js](../live-chat/js/live/live-livestream-gallery.js)) gọi `openSidebar()` **TRƯỚC** `api.captureCurrentFrame()`. Sidebar "Hình Livestream" (`position:fixed; right:0; width:380px; z-index:99400`, nền `#fafafa`) trượt ra phủ đúng vùng iframe FB live (`#live-snap-fb-wrapper` dock cột Kho SP / fixed góc phải). Extension `captureVisibleTab` chụp nguyên viewport (đang bị sidebar che) rồi crop theo rect wrapper → ra nền trắng sidebar. Mean luminance ~250 nên `_isFrameBlank` (mean<10) KHÔNG bắt → ảnh trắng vẫn được lưu.
- **Fix**: **CHỤP TRƯỚC, MỞ SIDEBAR SAU** + tạm ẩn sidebar nếu đang mở sẵn (chụp lần 2+). Reorder: set busy → `aside.style.visibility='hidden'` (no transition, reflow ép repaint) nếu `STATE.sidebarOpen` → chờ 2 rAF (compositor bỏ sidebar khỏi frame, cho cả stream lẫn tab-capture) → `captureCurrentFrame()` → `finally` khôi phục visibility → `openSidebar()` hiện tile mới. JS no-cache (không cần bump version). Syntax PASS.

### [polish] SSE consumer LOW hygiene — vá 5 item sweep (report-delivery realtime + 4 debounce)

Dọn nốt LOW từ consumer-robustness sweep cho "trơn tru hoàn hảo" (không phải bug correctness, chỉ freshness/efficiency):

- **report-delivery KHÔNG có realtime** → thêm `Web2SSE.subscribe('web2:delivery'|'web2:fast-sale-orders'|'web2:native-orders', sseReload)` debounce 600ms (mirror report-revenue) → giờ tự cập nhật khi phiếu giao/đơn đổi (trước chỉ refresh khi bấm tay).
- **Debounce 4 badge/handler bắn fetch mỗi event** → gom burst: `web2-pending-match.js` (web2:wallet:\* → refresh, +clear timer cleanup), `balance-history/index.html` + `live-chat/index.html` + `live-chat/chat.html` (web2:payment-signals → refreshCount /stats), `ck-dashboard-app.js` (web2:customer-intents → loadCol, nhất quán sibling payment-signals đã debounce).
- so-order receive-path KHÔNG đụng: `pullOnce()` đã version-gated (event version ≤ local → skip, không fetch) → benign, debounce thừa.
- Bump `web2-pending-match.js?v=20260622d` + `ck-dashboard-app.js?v=20260622d`. Syntax PASS.

### [test][fix] Browser test TỪNG TRANG Web 2.0 (treo SSE monitor + 32 trang) — ALL PASS + fix bug "cứ vào nhầm Web 1.0"

User: "treo server sse → vào từng trang test → debug → audit → lặp lại đến khi hoàn hảo" + "bạn vào nhầm web 1.0 rồi / tôi có note này lại mà sao cứ vào nhầm vậy?"

- **🔴 GỐC BUG "cứ vào nhầm Web 1.0"**: `scripts/n2store-browser-session.js` sau login **hardcode nav `orders-report/main.html` = WEB 1.0** (dòng 370), KHÔNG có cờ đổi → mỗi lần browser test Web 2.0 là flash/đứng Web 1.0. **Cộng dồn**: driver `/cmd` của tôi bị bug PORT (`source env` KHÔNG export → `os.environ`=None → mọi `nav` fail im lặng → browser đứng nguyên trang đích Web 1.0). **Fix**: thêm cờ `--start <url>` (override landing; relative ghép BASE) + đọc PORT từ file env. Đã cập nhật CLAUDE.md §"Browser test Web 2.0 → --start web2/overview" + MEMORY [[feedback_web2_browser_start_flag]].
- **Treo SSE monitor**: stream `web2:_admin:sse-log` (`/tmp/sse-monitor.log`) xem notify/connect realtime trong lúc test.
- **Test 32 trang** (2 batch) qua browser thật + extension, landing web2/overview: mỗi trang verify (1) nav đúng Web 2.0, (2) `Web2SSE.topics()` chứa topic mong đợi (sub), (3) bắn `/sse/test` từ browser (token sống) → probe nhận event (recv), (4) 0 console error. **KẾT QUẢ: TẤT CẢ PASS** — products/variants/native-orders/fast-sale-orders/customers/customer-wallet/supplier-wallet/balance-history/so-order/order-tags/notifications/reconcile/returns/delivery/refunds/dashboard/supplier-debt/multi-tool/live-tv/live-control/zalo/jt-tracking/fb-posts/printer/users/purchase-refund/ck-dashboard/kpi/report-revenue/product-category/live-chat. `web2:wallet:*` pages (customer-wallet, supplier-debt) recv=Y → **R4 server-side prefix-match chạy thật trên browser**.
- **3 "anomaly" = tôi đoán sai topic, KHÔNG phải bug**: multi-tool subscribe `web2:comment-boost` (produced ✓), product-category subscribe `web2:productcategory` (produced qua generic route `web2:${entity}` ✓), cart consumer ở `live-chat/inventory-panel` chứ không phải trang riêng (produced cart.js ✓). Re-fire đúng key → recv=Y hết.
- **Bẫy test (ghi lại)**: (a) `/sse?keys=` PHẢI URL-encode comma; (b) bắn `/sse/test` PHẢI từ browser (token python stale → 403; macOS SSL verify fail). Token sống = `JSON.parse(localStorage.web2_auth).token` trong eval.

### [fix] SSE audit producer↔consumer TOÀN HỆ (18-agent) — vá 2 MEDIUM "route quên emit" + 3 LOW dead-emit

Tiếp pass live-test (R4 đã chứng minh static review hiểu sai dispatch). Lần này audit **mọi cặp producer↔consumer** với dispatch model ĐÚNG (server lọc theo exact key; `:*` đã được R4 server-side prefix-match phủ). Mục tiêu: tìm lớp bug "consumer subscribe topic mà route KHÔNG emit" (giống bug ví nhưng ở topic khác).

- **Transport baseline** (curl `/sse?keys=`+`/sse/test`): 14 topic chính đều giao (web2:products/variants/delivery/native-orders… `clientsNotified:1`). _(Bẫy test: `keys=` phải URL-encode comma; loop 14 POST rapid làm curl buffer chưa flush lúc kill → 0/14 GIẢ — inline probe xác nhận OK.)_
- **2 MEDIUM (route quên emit → tab khác stale, SSE là kênh DUY NHẤT)**:
    1. `refunds.js` DELETE `/:number` → 0 emit → phiếu trả đã xoá vẫn hiện tab khác. Fix: emit `web2:refunds {action:'delete',number}` (mirror status route). Consumer subscribe EXACT `web2:refunds`.
    2. `delivery-invoices.js` PATCH + DELETE → 0 emit (chỉ create + 4 state-transition có). Fix: emit `web2:delivery {action:'update'|'delete'}`. Consumer EXACT `web2:delivery`.
- **3 LOW dead-emit (churn cross-instance NOTIFY, 0 subscriber)**: `web2-msg-send.js` 2 emit plain `web2:bulk-send` (1 chạy MỖI progress tick — chỉ per-job `web2:bulk-send:<jobId>` được consume) → gỡ; `kpi.js` emit `web2:kpi:<beneficiary_id>` (chỉ `web2:kpi-dashboard` được consume) → gỡ, giữ broadcast. LOW #5 (web2-wallet-balance double-invalidate `web2:wallet:*` + `web2:customer-wallet`) = idempotent benign → giữ.
- Syntax 4 file PASS. Commit `88f8b0a91`.
- **✅ Verify deploy**: deploy mới landed (bootId `7d74f474c`), **2 route healthy 200** (`/api/delivery-invoices/load` + `/api/refunds/load`) — edit KHÔNG vỡ boot/routing. **Tables delivery_invoices + refunds đều RỖNG** (`orders` len=0) → không có row để PATCH/DELETE test (bug stale chưa thể xảy ra khi 0 row; seed PBH-chain sẽ chạm data thật → KHÔNG làm). Emit là statement straight-line TRƯỚC `res.json` (reachable, guard `if(web2RealtimeSseNotify)` luôn true prod, ĐỒNG NHẤT pattern với create-emit/status-emit đã chạy 10 dòng trên) → verified bằng pattern-identity + route-health + transport-proven. KHÁC R4 (bug khái niệm dispatch cần live-test); đây là thêm-1-dòng-giống-code-đang-chạy.
- **Tiếp**: consumer-robustness sweep (lens cuối — resync no-op / debounce / throw-safety mọi subscriber) → converge.

### [fix] SSE realtime — re-audit toàn diện (39-agent) + 8 fix vá khoảng trống còn lại (KEEP SSE, KHÔNG cần WS)

User: "kiểm lại, audit toàn bộ web 2.0 để chắc chắn server SSE realtime hoạt động, còn không thì coi chuyển qua WS → debug → audit → lặp lại đến khi hoàn hảo".

- **Verdict: KEEP SSE — KHÔNG cần WebSocket.** Workflow audit 39-agent (map 5 + 6 dimension adversarial verify) chốt: WS **KHÔNG** fix được root cause (hub là `Map` per-process — WS hub cũng y hệt). Fix nằm TRÊN tầng wire = Postgres LISTEN/NOTIFY (đã có, đúng). SSE còn lợi thế: 1 EventSource multiplex (né cap 6-conn/origin), auto-reconnect + resync sẵn, worker đã proxy SSE (WS route mới = 404 nếu chưa thêm). 22/27 finding confirmed; backbone "SOLID_WITH_FIXES".
- **Live recon**: `/sse/stats` healthy — `crossInstance:true`, `liveInstances:1`, `crossStats.published===received` (16/16, kênh sống), `multiInstanceWarning:false`, BOOT_ID đủ suffix per-instance.
- **8 fix (5 MED + 3 LOW)** — `realtime-sse-web2.js` + `web2-sse-bridge.js` + `web2-customer-wallet-app.js` + `web2-balance-history.js`:
    1. **(MED) oversized cross-instance payload** all-or-nothing drop → degrade về TICKLE `{action,code,truncated}` (cap 7800; bulk confirm-purchase/mark-printed nhiều mã KHÔNG còn rớt cross-instance lúc deploy).
    2. **(MED) LISTEN reconnect gap** không resync: pg LISTEN/NOTIFY không buffer cho listener rớt → event trong cửa sổ ~3s mất, mà SSE browser KHÔNG đứt nên client không tự lành → **server bắn `event: resync` local khi re-LISTEN sau mất** (`_broadcastLocalResync` + `_pendingResyncOnReconnect`); bridge map → `_dispatchResync`.
    3. **(MED) exact `web2:wallet:<phone>` không tới subscriber `web2:wallet:*`** (PBH trừ ví / returns refund / manual deposit stale): **bridge prefix-match `:*`** (đóng CẢ LỚP — mọi route exact hiện tại + tương lai), mirror server `_localNotifyWildcard`.
    4. **(MED) customer-wallet no-op trên resync** (data:null): xử lý resync = `load()` TRƯỚC fast-path gated phone; + coalesce per-phone (1 refresh + 1 toast — chống double-fire từ SePay dual-emit + rank3).
    5. **(MED) heartbeat reopen-storm**: server gửi `:heartbeat` COMMENT → EventSource nuốt → `lastEventAt` không bump → refocus tab quiet >60s reopen oan (resync+reload toàn bộ). → **server gửi NAMED `event: heartbeat`**, bridge bump `lastEventAt` (không dispatch) + ngưỡng refocus 60→90s.
    6. **(LOW) `_pgNotify` không fallback khi LISTEN client half-open** → drop NOTIFY: reject → fallback pool 1 lần.
    7. **(LOW) pool fallback amplify lúc reconnect**: cap `_poolNotifyInflight` ≤ 12 (1 web2Db blip + burst KHÔNG vắt kiệt pool max~10).
    8. **(LOW) dead notify** `web2:wallet:update` (manual-deposit) — bỏ (sau prefix-match còn double-fire `:*`).
- **Phụ**: sửa comment bridge sai ("→ n2store-fallback" → đúng là **web2-api**, fallback chỉ relay). Bump `web2-sse-bridge.js?v=20260621r6→20260622r7` (38 trang) cho prod nạp.
- Syntax check 4 file PASS. Commit R1 `0ce6293e3`.

**Re-audit R2 (23-agent regression hunt trên commit R1)** — 18 candidate, 6 confirmed; converged=false vì 1 MEDIUM. Đã vá:

- **(MED) `live-livestream-snap-init.js` no-op trên resync** (cùng lớp bug customer-wallet nhưng ở consumer KHÔNG đụng tới — resync `data:null` rơi xuống `if(!customerFbUserId)return` → thumbnail/counts kẹt cũ). Fix: gộp resync vào nhánh `purge/wipe-all` (wipe cache + re-queue mọi row hiển thị).
- **(LOW) resync thundering-herd + spurious liveness-ping resync**: bridge coalesce `_scheduleResync()` trailing 250ms (server-resync + client-reconnect-resync + ping false-positive chồng nhau → 1 đợt re-fetch); clear timer trong `close()`.
- **(LOW) pool-fallback drop im lặng**: thêm `_crossStats.poolDropped` → lộ ở `/sse/stats`.
- **(LOW) foot-gun**: comment ⚠ LOAD-BEARING ở `notifyClientsWildcard('web2:wallet')` (đừng xoá — bridge cũ còn cache cần đường wildcard).
- 4 LOW còn lại (half-open >12 drop = tradeoff bảo vệ pool + self-heal; broadcast-kind degrade = unreachable) reviewer chốt KHÔNG block. Bump bridge `r7→r8` (38 trang). Syntax PASS. Commit R2 `b07144f98`. R3 (3-agent) **converged=true, 0 finding**.

**🔴 LIVE-TEST R4 (browser thật) BẮT ĐƯỢC LỖI 3 VÒNG STATIC REVIEW (39+23+3 agent) ĐỀU MISS** — vì sao phải test thật:

- **Triệu chứng**: browser subscribe `web2:wallet:*` rồi `POST /sse/test {key:'web2:wallet:0123456788'}` → `clientsNotified:0`, browser nhận 0. → **rank-3 (bridge prefix-match) là DEAD CODE**.
- **Root cause THẬT**: hub đăng ký connection theo ĐÚNG key đã subscribe (`web2:wallet:*`). `notifyClients(exact 'web2:wallet:<phone>')` chỉ exact-match `sseClients.get('web2:wallet:<phone>')` → KHÔNG có → event **KHÔNG RỜI server** → bridge prefix-match (client-side) vô dụng vì event chẳng bao giờ tới browser. → **6 trang ví** (customer-wallet, balance-history ×2, supplier-wallet, wallet-balance, supplier-debt) **bỏ lỡ realtime** từ 4 route chỉ-emit-exact (PBH-deduct/refund/return-credit/manual-deposit). 4 route chỉ có `notifyClients` (không có `notifyClientsWildcard` qua app.locals).
- **FIX ĐÚNG = SERVER-SIDE prefix-match trong `_localNotify`**: sau khi gửi exact, scan `sseClients` cho subscriber `:*` khớp prefix `key` → gửi với `payload.key = ĐÚNG key '*'` (bridge cũ+mới đều exact-match). Đóng CẢ LỚP tại 1 điểm, KHÔNG phụ thuộc route nhớ co-emit (hết drift), KHÔNG cần wiring mới. Bỏ `notifyClientsWildcard('web2:wallet')` ở SePay hub (giờ redundant → tránh double-fire). **Revert** client prefix-match (sai tầng, dead). Bump bridge `r8→r9`. **Bài học: static review hiểu sai dispatch model (tưởng server gửi hết, client lọc; thực ra server lọc theo exact key) — chỉ live-test mới lộ. Test thật > review.**
- **✅ VERIFIED LIVE (curl, prod web2-api sau deploy R4 `8d6abe393`, bootId `5cd8f5967d`)**: (1) exact `web2:wallet:0123456788` → **`clientsNotified:1`** (trước 0) + stream `web2:wallet:*` nhận `{key:'web2:wallet:*', pattern:'web2:wallet', data:{phone:...}}`; (2) exact topic thường vẫn giao (1); (3) near-miss `web2:wallet-config:x` → **0** (KHÔNG over-match); (4) unrelated → 0; (5) end-to-end: trang customer-wallet trên browser (subscriber thứ 2) cũng nhận. **code-reviewer APPROVE 0 CRITICAL/HIGH/MEDIUM** (2 LOW = doc nit). → **HỘI TỤ + LIVE-VERIFIED**. KEEP SSE chốt (WS không fix gì root cause).

### [fix] SSE realtime XƯƠNG SỐNG Web 2.0 — cross-instance fan-out (Postgres LISTEN/NOTIFY) + observability + graceful deploy

User: "audit lên plan tìm hiểu bug realtime ... fix server realtime chạy chính xác, vì đây là xương sống web 2.0". Điều tra sâu (4-agent audit code + Render API + đo live) → **đính chính chẩn đoán ban đầu** rồi fix gốc + **3 vòng adversarial review** (19→6→4 finding, hội tụ).

- **ROOT CAUSE (chứng minh dứt khoát)**: hub SSE (`realtime-sse-web2.js`) là `Map<topic,Set<Response>>` **in-RAM PER-PROCESS**, KHÔNG fan-out cross-process. web2-api steady-state = 1 instance (Render API `numInstances=1`) NHƯNG **rolling-deploy chồng 2-4 instance vài giây** (quan sát thật `liveInstances:2-4` + `bootId=srv-...-9bf555fb8-kb4px-...` cho thấy `RENDER_INSTANCE_ID` có phần per-instance). Lúc đó mutation rơi instance A, SSE bám instance B → broadcast lệch → **realtime rớt ÂM THẦM** (delivery all-or-nothing tuỳ trùng instance). Triệu chứng ban đầu "web2:products không tới" = artifact test ngay lúc deploy + lỗi đo (event `test` vs `update`); steady-state thực ra giao 100%.
- **FIX E — cross-instance fan-out**: Postgres `LISTEN/NOTIFY` channel `web2_sse` trên web2Db (KHÔNG cần Redis). `notifyClients` broadcast local + `pg_notify`; instance khác nhận NOTIFY → broadcast local; bỏ self (`origin===BOOT_ID`). Dedicated `PgClient` (keepAlive, statement_timeout:0, auto-reconnect 1-timer-guard). Publish qua chính LISTEN client (chống pool churn). Kill-switch `WEB2_SSE_NO_CROSS=1`.
- **FIX gate (audit r1 #1)**: CHỈ web2-api init fan-out (`!WEB2_API_FORWARD_URL`); fallback chỉ HTTP-relay → tránh double-deliver (fallback+web2-api chung web2Db). **r2 #1 (HIGH regression)**: gate làm `web2:wallet:*` wildcard mất đường → `notifyClientsWildcard`/`broadcastToAll` CŨNG forward (`kind`) + relay-notify route theo kind.
- **FIX A/B observability**: `BOOT_ID` (random suffix — slice cũ cắt nhầm per-instance id) vào connectionId/connected/stats; bảng `web2_sse_instances` heartbeat 30s → `/sse/stats` lộ `liveInstances`/`multiInstanceWarning`/`crossStats{published,received,deliveredFromPeers}`; cảnh báo boot nếu >1.
- **FIX C graceful deploy**: SIGTERM → `gracefulClose()` (async, await DELETE registry + `.end()` bọc timeout) đóng SSE sạch → client reconnect NHANH sang instance mới (bridge resync re-fetch). server.js gọi 1 nguồn + đóng web2Pool.
- **3 review rounds (24+16+6 agent, adversarial verify)**: r1 19 finding→vá 18, r2 6→vá 5 (HIGH wildcard), r3 4→vá 3 (MED `.end()` timeout, LOW timer unref + broadcast whitelist). #3 (pg_notify share LISTEN client) reviewer chốt acceptable.
- **✅ VERIFIED LIVE**: fan-out kênh sống (`published===received`, 1→16); delivery steady-state 100% (5-10/10 nhiều lần qua `Web2SSE.subscribe`); multi-instance **quan sát được** (`multiWarn:true` + 3 instance lúc deploy, **TẤT CẢ web2-api** — fallback gated đúng) + **settle về 1** sau 3 phút (observability đúng); regression sau mỗi deploy OK. File: `render.com/routes/realtime-sse-web2.js` + `server.js` + `web2-campaign-products.js` (D: PATCH /pending broadcast thêm web2:products).

## 2026-06-21

### [feat] TV Livestream Web 2.0 — migrate fork + test realtime (Phase 5-6) + fix

- **Phase 6 (migrate fork → 1 nguồn)**: `native-orders-filters-campaigns.js` (bỏ `LIVE_COMMENTS_API`+`_liveCommentsHeaders`+5 fetch) + `live-chat/js/live/live-campaign-manager.js` (CRUD+posts) đều chuyển sang `Web2Campaign`. Load `web2-campaign.js` 2 trang. → **Web2Campaign = 1 nguồn cho 4 trang** (live-tv, live-control, native-orders, live-chat). Verified live: parent campaigns + modal 📁 render qua Web2Campaign, 0 console error.
- **⚠ FINDING SSE đa-instance (quan trọng)**: test phát hiện `web2:products` SSE **KHÔNG tới browser** (cả EventSource thô lẫn bridge) dù subscribe đúng — trong khi `web2:campaign-products` thì TỚI. Cả `/api/web2-products` + `/api/web2-campaign-products` + `/api/realtime/web2/sse` đều → service `web2-api` (isWeb2Path), nên KHÔNG phải đa-service; nghi **web2-api chạy nhiều instance, SSE hub in-memory per-instance** → mutation landed instance khác SSE connection → broadcast lệch. `web2:campaign-products` tới được (mutation+SSE cùng instance lúc test). → **Fix feature**: "số NCC báo" đi qua `PATCH /api/web2-campaign-products/pending` (set tuyệt đối pending_qty + `_notify('pending')` trên **web2:campaign-products** = topic tin cậy) thay vì `adjust-pending` (web2:products). TV+control subscribe cả 2 topic (defensive).
- **Fix khác**: (a) `[hidden]`+display gotcha `.ltv-empty/.ltv-grid` → `display:none!important` (empty `height:100%` đẩy grid xuống fold); (b) control page gọi `Web2Sidebar.mount('#web2Aside')` (sidebar không auto-mount).
- **✅ VERIFIED LIVE end-to-end** (admin, campaign 2, SP ÁO BLAZER 2 biến thể): add SP → SSE `web2:campaign-products` `{add,c:2}` tới TV → board hiện; gom biến thể đúng (2 biến thể → 1 card 1 ảnh); `setPending`=99 → **TV tự đổi [25→99] KHÔNG refresh** (sync timestamp đổi); picker "Chờ hàng (Sổ Order)" `/pending` 16 SP; sidebar+board+picker render OK. Cleanup pending về gốc (25,15).

### [feat] TV Livestream Web 2.0 — shared module + 2 trang (Phase 2-4,7)

- **Phase 2 (shared)**: `web2/shared/web2-campaign.js` (`Web2Campaign` — 1 NGUỒN: campaign CRUD + post assign/unassign + **product attach/detach/reorder/pin** + `subscribe()` SSE web2:live-comments + web2:campaign-products) gom logic chiến dịch (sẽ migrate 2 fork về). `web2/shared/web2-variant-group.js` (`Web2VariantGroup.group()` — gom SP cùng `name` → 1 tên + 1 ảnh đại diện + danh sách biến thể có tồn/chờ từng cái; sort màu→size; ghim/sort lên đầu).
- **Phase 3 (trang TV `web2/live-tv/`)**: fullscreen standalone (KHÔNG sidebar), ảnh TO, card gom biến thể (TỒN xanh + CHỜ vàng per biến thể), chọn chiến dịch, realtime qua `Web2Campaign.subscribe` (re-fetch debounce 500ms, lọc theo code trên board), nút toàn màn hình + tap ảnh phóng to (Web2ImageLightbox). 3 file (html/css/js).
- **Phase 4 (trang điều khiển `web2/live-control/`)**: web2 page có sidebar. Chọn/tạo chiến dịch, 2 panel: (trái) SP trên TV — gom biến thể, up/down/ghim/xoá nhóm + **nhập "số NCC báo" = pending_qty** per biến thể (adjustPending delta, optimistic saved-state, hoãn re-render khi đang gõ); (phải) picker thêm SP 2 tab "Chờ hàng (Sổ Order)" `/pending` + "Tất cả SP" `/list` + search. Nút "Mở TV". 3 file.
- **Phase 7 (menu)**: thêm "Điều khiển TV 🎛️" + "TV Livestream 📺" vào nhóm Sale Online (web2-sidebar.js).

### [feat] TV Livestream Web 2.0 (Phase 1/6 — backend SP⇄chiến dịch)

User: shop live cần 1 màn TV cho người live (user1) xem ẢNH TO + TỒN KHO + SỐ CHỜ HÀNG + biến thể; user2 ở dưới nhập số NCC báo realtime. Board xoay quanh **chiến dịch livestream** (kiểu live-chat), user2 cho SP vào chiến dịch (ưu tiên SP Sổ Order chờ hàng). Chiến dịch = module dùng chung. Chạy **2 workflow audit (7+4 agent)** trước khi code.

- **Phát hiện audit**: kho = `web2_products` (mỗi biến thể 1 row; `stock`=tồn, `pending_qty`+`status=CHO_MUA`=chờ hàng = "số NCC báo" user2 nhập — user chốt dùng pending_qty). Chiến dịch = `web2_live_parent_campaigns` (web2-live-comments.js) **chỉ gom BÀI, chưa có SP**. Logic chiến dịch FORK 2 nơi (live-campaign-manager.js + native-orders-filters-campaigns.js), chưa có shared. TV cũ `soluong-live/` = Web 1.0 (Firebase+TPOS) — chỉ mượn UX.
- **Phase 1 (backend)**: bảng nối MỚI `web2_campaign_products` (campaign_id, product_code, sort, pinned, added_by, UNIQUE(campaign_id,product_code)) + route `render.com/routes/web2-campaign-products.js` (GET list JOIN kho, POST add bulk sort-cuối, DELETE, PATCH /reorder, PATCH /pin) + SSE topic RIÊNG `web2:campaign-products` (membership; tồn/chờ hàng đã có `web2:products` lo). Wire server.js (require+mount+initializeNotifiers). Worker tự route `/api/web2-*` (routes.js:391) → khỏi sửa. KHÔNG thêm cột web2_products (số NCC báo = pending_qty sẵn có).

### [refactor+security] Hệ KPI — gom 1 nguồn module (core + Web2Kpi) + enforce scope NV/admin + fix bug

User: "NV nào thấy KPI nv đó, admin thấy tất cả → KPI chính chia module để trang tham chiếu → audit → test → lặp đến hoàn hảo". Chạy **workflow audit 11-agent** (42 findings · 3 critical · 17 high · 5 scope-leak xác nhận) → kế hoạch → thực thi.

- **B1 BACKEND core `render.com/services/web2-kpi-core.js` (MỚI, 1 nguồn)**: `RATE_PER_SP`, `sanitizeCampaignName`, `buildProductMap`, `resolveBeneficiaryBySTT`, `computeKpiQty(products,base,mode,metaMap)→{qty,lines}` (mode 'inbox'|'live'), `loadKpiRanges(pool,filterUserId?)`. Trước đây toán KPI FORK y hệt ở kpi.js + web2-order-tags-service.js (mirror lúc làm pill) → drift.
- **B2 dùng core, XOÁ fork**: `kpi.js` xoá `_productMap/_orderKpiQty/_beneficiaryByStt/sanitizeCampaignName/RATE`; `web2-order-tags-service.js` xoá `_kpi*` (4 hàm) → `kpiUserDetail` gọi core. Unit-test 5 ca khớp (FIX: SP trùng mã giờ cộng dồn đúng).
- **B3 bug correctness**: (a) `/kpi` Dự báo/Thực tường minh `draft→forecast, else→actual` (trước 'delivered' lọt nhầm dự báo); (b) `resolveBeneficiary` fallback actor non-finite→null+`fallback_actor_invalid`; (c) `_isChotDonTemplate` word-boundary `/\bchot\s+don\b/` (trước substring→false-positive khóa nhầm base); (d) log khi forecast/actual âm bị clamp.
- **B5 SCOPE (security — gốc lớn nhất)**: `/events` thêm `requireWeb2AuthSoft+applyKpiScope`+self-scope (staff ÉP `beneficiary_user_id=viewer.id`, dò id khác→403); `/forecast`+`/actual` self-scope; `/assignments`+`/employee-ranges`(+/history) thêm `requireWeb2AuthSoft`. **MASK pill server-side**: `enrichOrdersWithTags(pool,orders,{viewerUser})`→`computeAutoTags(...,{viewerUser})`→ đơn NV khác (beneficiaryId≠viewer.id)→ pill `👤 KPI` xám, KHÔNG detail (che tên+tiền). native-orders `/load` truyền `req.kpiUser`. Server = nguồn-tin-duy-nhất.
- **B4 FRONTEND `web2/shared/web2-kpi.js` (MỚI, `window.Web2Kpi`)**: `authHeaders/isAdmin/fmtVnd/escapeHtml/rateFrom/fetchKpi/fetchEvents`. Migrate fork ở kpi-dashboard/native-orders-kpi(+self-only guard)/kpi-health(skip `👤 KPI`)/render(isAdmin). **FIX kpi-dashboard `loadEvents` thiếu auth** (sẽ 401 sau gate /events) + bỏ hardcode `*5000`→rate API. kpi-assignments reads thêm token.
- 14 file (2 mới). Backend=Render; FE=GH Pages. Unit mask PASS.
- **VERIFIED LIVE đa-user** (admin id1 + staff kpitest_an id3, reset pass qua `/api/web2-users/:id/password`): `/load` admin→pill `test_staff`+detail (thấy hết); staff id3→ đơn NV khác = `👤 KPI` masked, KHÔNG detail (che tên+tiền) · đơn của chính mình (STT1→id3)→ pill `kpitest_an` full + list scope chỉ trả đơn trong dải. `/events`: no-token→**401**, staff→chỉ của mình, staff dò `beneficiary_id=1`→**403**, admin dò→200. `/forecast` staff dò `user_id=1`→**403**. `/kpi` admin→200 rate 5000 (từ core) scope 'all'. Cleanup assignment ảo.
- **Tooling**: `scripts/save-web2-session.js` (MỚI) + `save-login-session.js` thêm web2 login → lưu `web2_auth` vào session block → browser test web2 "vào thẳng bằng cookies" (verified fresh session nav web2/kpi không bounce login).

### [fix] GLOBAL: web2 shell ≤900px main full-width (mọi trang tablet/phone) — sửa flex-direction no-op

Nối tiếp fix iPad (page-scoped) → user OK sửa GLOBAL. Gốc: `web2-theme.css @media(max-width:900px)` đặt `.web2-shell{flex-direction:column}` nhưng shell là `display:grid(260px 1fr)` → no-op → aside off-canvas (position:fixed) khiến MAIN kẹt track 260px ở **MỌI trang web2 trên ≤900px** (phí ~⅔ màn).

- **Fix 1 dòng** `web2-theme.css`: `flex-direction:column` → `grid-template-columns:1fr` (ép shell 1 cột → main full-width; sidebar đã là drawer phủ).
- **Bump cache** `web2-theme.css?v=` → `20260621shellfix` trên **47 file html** (chuẩn hoá từ 7 version cũ) để prod nạp bản mới.
- Verify Playwright 820px (login web2) 6 trang đa layout: overview/products/customers/kpi/dashboard/so-order → mainW fill **98-101%** (trước ~32-35%), `overflowX:false`, 0 pageerror. Screenshot products full-width OK.
- Page-scoped fix ở `video-maker.css` GIỮ LẠI (trùng nhưng vô hại, belt-and-suspenders nếu cache theme lệch).

### [fix+feat] video-maker iPad: full-width main (fix shell bug) + tablet layout (portrait 2-cột, landscape 2-pane touch)

User hỏi "ipad thì sao". Phát hiện **bug shell dùng chung**: `web2-theme.css @media(max-width:900px)` đặt `.web2-shell{flex-direction:column}` NHƯNG shell là `display:grid (grid-template-columns:260px 1fr)` → `flex-direction` VÔ TÁC DỤNG → grid vẫn chừa track 260px; aside `position:fixed` (off-canvas) nên MAIN rơi vào track 260px hẹp → **main kẹt ~260-288px ở MỌI trang ≤900px** (phí nửa màn iPad portrait + điện thoại; phone trước đó fill chỉ ~67%).

- **Fix page-scoped** (`video-maker.css`, chỉ trang này): `@media(max-width:900px){ body:has(.web2-shell) .web2-shell{ grid-template-columns:1fr !important } }` → main full-width. Verify: phone 393 fill 96% (trước ~67%), iPad portrait 820 fill 98% (trước ~35%), 0 overflow/error. ⚠ Bug gốc còn ở theme dùng chung — ảnh hưởng mọi trang web2 trên tablet/phone; chưa sửa global (sửa shared theme đụng 40+ trang, để user quyết).
- **iPad PORTRAIT (700–920px)**: preview cao hơn `clamp(300px,44vh,480px)` + tool card xếp **2 cột masonry** (`column-count:2` + `break-inside:avoid`) tận dụng bề ngang.
- **iPad LANDSCAPE / màn lớn cảm ứng (≥921 + pointer:coarse)**: 2-pane editor, panel rộng **440px**, target chạm ≥44px.
- Verify Playwright 820×1180 + 1180×820 (login web2): portrait masonry full-width, landscape 2-pane `440px 1fr`, 0 pageerror. Bump CSS `?v=20260621ipad2`.

### [redesign] video-maker mobile = app edit chuyên nghiệp (preview ghim, tab segmented, Xuất ghim đáy)

User: "giao diện điện thoại như 1 app edit chuyên nghiệp". Mobile-only re-skin (`@media max-width:920px` trong `video-maker.css`), KHÔNG đụng desktop / JS / id.

- **Preview GHIM trên cùng** (`.vm-stage` `order:-1` + `position:sticky;top:0`, height `clamp(210px,40vh,330px)`, bo góc đáy + shadow) — luôn thấy khi chỉnh. Transport "Xem trước/Dừng" = pill nổi trắng-mờ trên nền tối. Hamburger nổi góc trái như app.
- **Tab segmented GHIM ngay dưới preview** (`.vm-tabbar` `sticky;top:var(--vm-prev-h)`). Vùng công cụ (card) cuộn giữa. **Nút "Xuất video" GHIM đáy** (`.vm-export-bar` sticky bottom + `env(safe-area-inset-bottom)`, nút cao 50px).
- ⚠ Mấu chốt: `.vm-panel{overflow:visible}` trên mobile để sticky bám `.web2-main` (scroller thật), không bám panel. Header gọn (giấu `.vm-sub`, né hamburger). Touch target ≥44px. Input+nút (chủ đề AI / sfx) full-width (`.vm-topic` wrap).
- Verify Playwright 393×852 (login web2 + inject): preview pinned `top:20` GIỮ NGUYÊN sau scroll 650px, tabbar pinned `top:350`, export sticky, `docOverflowX:false`, 0 app error (chỉ 2 noise 404). Bump CSS `?v=20260621app`.

### [feat] TAG KPI User — nút Chốt KPI (admin) + health bar chưa-gán/chưa-chốt + filter NV + amber + deep-link

User: làm #1 (nút Chốt KPI chỉ admin) → dùng nó tạo base → làm #2/#3/#4 test. (Tiếp theo audit "chốt đơn = gửi tin mẫu Chốt đơn", endpoint thủ công `/lock-kpi-base` chưa UI nào gọi.)

- **#1 Nút Chốt KPI (admin-only)**: backend `POST /api/native-orders/:code/lock-kpi-base` thêm `requireWeb2Admin` (403 nếu không admin) + `_notify('kpi-base-locked')` sau khóa. Frontend `native-orders-render.js`: `NO.isAdmin()` (Web2Auth role), `NO.lockKpiBase(code)` (POST + authHeaders → reload, map reason empty-order/no-unbased/race). Nút nằm trong **popup KPI** (Web2OrderTagDetail), chỉ hiện khi `notChoted` + admin; non-admin thấy note "Chỉ admin chốt KPI được".
- **#3 amber + deep-link**: engine `computeAutoTags` kpi_user → màu **hổ phách `#f59e0b`** khi đã gán NV nhưng `notChoted` (phân biệt xanh=đã chốt, đỏ=lỗi gán). Popup error → nút **"Chia dải STT chiến dịch này"** → `../web2/kpi/assignments.html?campaign=<name>` (kpi-assignments.js đã hỗ trợ `?campaign` preselect sẵn). `Web2OrderTagDetail.open(o, tag, {kpiActions:{isAdmin,onLock,onAssign}})`.
- **#2 + #4 health bar** (`native-orders-kpi-health.js` MỚI): tự tính TỪ pill kpi_user trong tbody (không gọi API), inject `#noKpiHealthBar` sau `#noKpiStrip`. Hiện chip **⚠ N chưa gán NV** (+ link Cấu hình KPI) · **⏳ N chưa chốt** · chip mỗi NV (tên·số đơn). Bấm chip → **lọc bảng client-side** (ẩn row không khớp), MutationObserver tbody auto-update, "Bỏ lọc" reset. Bù cho leaderboard `#noKpiStrip` (chỉ hiện khi /kpi có NV).
- Files: native-orders.js, web2-order-tags-service.js, web2-order-tag-detail.js (?v=kpi2), native-orders-render.js (?v=kpi), +native-orders-kpi-health.js (?v=kpi). Backend=Render deploy; FE=GH Pages.
- **Verified LIVE prod** (browser, extension, role=admin): deploy → lock-kpi-base=401 không token (admin gate live). Seed dải STT 1 chiến dịch → 2 đơn pill **hổ phách "NV Test KPI"** (đã gán, chưa chốt) + health "2 chưa gán · 2 chưa chốt · NV Test KPI·2". Bấm **"Chốt KPI ngay"** (popup, admin) → toast "Đã chốt KPI đơn NJ-…0001 · base khóa 1 mã SP" → pill **hổ phách→xanh**, health "chưa chốt" 2→1, popup hậu-chốt "Base 2 → SL hiện tại 2" mất nút Chốt + note. Filter chip NV → ẩn đúng 2 row khớp, "Bỏ lọc" khôi phục (0 row kẹt). Cleanup assignment ảo (base lock giữ — bất biến, beta-ok). 1 screenshot health bar.

### [feat] TAG đơn — thêm trigger "KPI User" (pill động hiện tên NV nhận KPI + popup breakdown)

User: "TAG KPI User nữa → audit nói lại logic KPI user". Audit (2 Explore agent) → recap logic KPI; chốt thiết kế: pill ĐỘNG hiện TÊN NV + click chi tiết; livestream STT ngoài mọi dải = LỖI chia dải (pill đỏ).

- **Engine** (`web2-order-tags-service.js`): thêm trigger `kpi_user` (nhóm "KPI") + predicate (fire mọi đơn còn sống có SP) + `kpiUserDetail(o,ctx)` MIRROR `routes/v2/kpi.js` (`resolveBeneficiary`+`_orderKpiQty`) → khớp 100% dashboard KPI: **livestream** = NV theo dải STT (`web2_kpi_assignments`), KPI qty = base-delta (Σ max(0, hiện−`kpi_base`) = upsell sau chốt), STT ngoài dải → `state:'error'` pill đỏ "⚠ STT n chưa gán NV"; **inbox** = `created_by`, 100% SL; chưa chốt (`kpi_base` null) → qty 0 vẫn hiện NV. `computeAutoTags` special-case kpi_user: `tag.name`=tên NV/label-lỗi, `tag.color` đỏ khi lỗi, `tag.detail.kpiUser`={source,state,resolveText,kpiQty,kpiAmount,lines[],notChoted}. `buildContext` thêm `kpiRanges` (load `web2_kpi_assignments` chỉ khi có tag kpi_user active). Seed mặc định +1 (`kpi_user`, priority 5) cho install mới.
- **Popup** (`web2-order-tag-detail.js`): branch `kpi_user` → hero NV/avatar (đỏ+icon khi lỗi) + 3 box (SL KPI · Tiền · đơn giá 5.000đ) + note "chưa chốt" + list SP (base→hiện tại, badge "+N KPI"). Bump `?v=20260621kpi`.
- **Frontend native-orders KHÔNG đổi**: pill đã render từ `o.autoTags` + clickable sẵn → kpi_user tự hoạt động.
- Unit-test local 4 ca (live-assigned Hoa +3=15k · live-ERROR STT99 đỏ · inbox Lan 100%=6SP=30k · live chưa-chốt qty0 vẫn hiện Hoa) PASS. Engine = Render deploy; pill/popup = GH Pages.
- **Verified LIVE prod** (browser-test, extension): deploy → /triggers=22 (nhóm "KPI"); tạo tag KPI User qua API (x-web2-token, 200); native-orders 9/9 đơn có pill KPI; trước seed assignment = **đỏ "⚠ STT n chưa gán NV"** (đúng — chưa phân công); seed range 1 chiến dịch (PUT /api/web2/kpi/employee-ranges) → 2 đơn STT 1–2 flip **xanh "NV Test KPI"**, chiến dịch khác giữ đỏ; popup OK (hero xanh + STT∈dải + box 0SP/0đ/5.000đ + note chưa-chốt + line SP) & ERROR (hero đỏ + tên chiến dịch + "Vào Cấu hình KPI chia range") đều render đúng (2 screenshot). Cleanup assignment ảo. Tag KPI User sống trong prod (priority 5).

### [redesign] video-maker → "Xưởng Video AI": layout 2-tab + card + xoay tua key ElevenLabs + 3 tính năng AI

User: làm lại toàn bộ giao diện + đổi tên trang, audit→commit→debug→lặp. Trước đó: cấp 3 key ElevenLabs (xoay tua) + tích hợp chức năng AI.

- **Xoay tua 3 key** (`22a05c807`): service đọc `ELEVENLABS_API_KEY1/2/3`, round-robin rải tải + failover 401/quota/429 → cooldown 1h. Verify 3 key OK (22 giọng, có 'Adam').
- **3 tính năng AI** (`0842d8e5d`): hiệu ứng âm thanh (`/sound`), chép lời STT (`/stt`→điền ô lời đọc từ video import), lọc tạp âm (`/isolate`→mục Tách nhạc). Voice Design DORMANT (API chỉ gói trả phí — verify 403). Verify call thật: sound/stt/isolation OK.
- **Redesign UI** (commit này): rename trang → **Xưởng Video AI** (title + h1 + sidebar label). Layout left-panel chia **2 tab CSS-only** (Nội dung & Cảnh · Giọng & Âm thanh) + **card** nhóm tính năng (Bắt đầu nhanh / Khung hình / Nguồn / Cảnh / Giọng đọc / VieNeu / Nhạc nền / Hiệu ứng âm thanh / Công cụ audio) + **thanh "Xuất video" sticky** luôn hiện + tabbar sticky top. Panel nền soft, card trắng nổi khối. **GIỮ NGUYÊN mọi id/class/data-attr** → JS không đổi.
- **Fix bug `[hidden]`**: `.vm-btn{display:inline-flex}` (+`.vm-row`/`.vm-split-actions` flex) đè UA `[hidden]` → nút "Dừng"/clear/clone lỡ hiện. Thêm guard `[hidden]{display:none!important}`.
- Verify browser (overview→trang, extension): rename OK, 2 tab swap đúng (content flex/voice none ↔), 9 card, ratios/accents/tones/cues/canvas render, cue chèn `[cười]`, Kho giọng mở, #vmStop ẩn đúng sau fix, 0 console error. Screenshot desktop 2 tab OK.

### [feat] TAG đơn — icon picker tìm kiếm (thay ô nhập tay)

Theo yêu cầu: field Icon ở modal Cấu hình TAG đơn → picker hiện list icon tìm kiếm + chọn (thay vì gõ tên lucide tay). `order-tags-app.js`: `allIconNames()` lấy 1373 icon từ `window.lucide.icons` (PascalCase→kebab), `COMMON_ICONS` ~60 icon hay dùng hiện mặc định; ô nhập = ô tìm (focus → grid, gõ → filter full registry ≤120, mousedown chọn beat blur), preview box icon đang chọn + nút × xoá, pill xem-trước cập nhật. Verified browser: 60 icon default · "arrow"→62 match render SVG · chọn flame · clear · edit prefill 'clock' + screenshot. Frontend-only (`order-tags-app.js?v=icon`).

### [feat] video-maker: kho giọng (Piper + ElevenLabs) + import video lồng tiếng + giọng theo cảnh + thẻ cảm xúc VieNeu

User: (1) thẻ cảm xúc VieNeu; (2) import video để ghép voice; (3) chọn nhiều voice theo list + kho giọng sẵn (kiểu 'Adam'). Hỏi scope → cả 2 nguồn giọng, cả 2 kiểu multi-voice, slider tiếng gốc.

- **Thẻ cảm xúc VieNeu** (`31ae0603e`): `CUES` ([cười]/[thở dài]/[hắng giọng]) chèn vào lời đọc — chỉ engine `vieneu` hiểu; engine khác `stripCues`. Chip insert-at-cursor + hint theo giọng.
- **Kho giọng** (`3248fa8fc`): `video-library.js` modal — tab Piper (catalog ~100+ giọng named, lọc ngôn ngữ, nghe thử, "Kéo về" tải IndexedDB) + tab ElevenLabs (proxy `/api/web2-elevenlabs`, key env `ELEVENLABS_API_KEY`, gated). `video-tts.js` thêm `listPiperCatalog/downloadPiperVoice/synthVoiceMeta` + engine `elevenlabs` + `addLibraryVoice` persist localStorage. ⚠ ElevenLabs free KHÔNG có quyền TM (cần $5) → Piper là mặc định free/commercial-OK. **Cần set key Render mới chạy ElevenLabs.**
- **Import video lồng tiếng** (`6cc4e479c`): `video-import.js` — load video → vẽ khung hình canvas + nối tiếng gốc MediaElementSource→gain→graph; branch `drawAt/totalDur/applyCanvasSize/play/exportVideo`; slider âm lượng tiếng gốc (20%).
- **Giọng theo từng cảnh** (commit này): scene-editor thêm input "Lời đọc riêng" + select "Giọng cảnh này"; `genNarrationPerScene` synth từng cảnh giọng riêng, nới `dur` cho vừa lời, mix OfflineAudioContext 44.1kHz canh theo mốc cảnh.
- Verify browser (localhost+extension, 0 console error): catalog 80 row + 35 ngôn ngữ + add/persist/remove; ElevenLabs "chưa bật"; import canvas 320×180 + clear→1280×720; per-scene dur 3→4.4 khi audio 4s.

### [feat] Popup lý do tag — thêm ẢNH sản phẩm

Theo yêu cầu "hiện ảnh sản phẩm" trong popup lý do tag. `buildContext` thêm `image_url` (web2_products) vào productStatus; `tagDetail` đính `imageUrl` mỗi SP (ưu tiên catalog, fallback snapshot dòng đơn). `Web2OrderTagDetail` render thumbnail 52px (object-fit cover) + placeholder icon khi lỗi/không ảnh. Unit test imageUrl (catalog + fallback) PASS. Bump `web2-order-tag-detail.js?v=ot3`.

### [feat] Bấm TAG đơn hàng → popup lý do chi tiết (SP chờ hàng / âm mã + ai đang giữ)

User: bấm pill tag ở cột Thẻ hiện lý do — chờ hàng → list SP chờ; âm mã → list SP vượt tồn + nếu âm do người khác giữ thì hiện tên người giữ + đơn giữ.

- **Server** `web2-order-tags-service.js`: `tagDetail(trigger,o,ctx)` đính `tag.detail.products` cho 4 trigger SP (cho_hang/am_ma/het_hang/mua_1_phan) ở `/load` — chờ hàng `{code,name,pendingQty}`; âm mã `{code,name,stock,held,orderQty}`. Unit test PASS.
- **Shared** `web2/shared/web2-order-tag-detail.js` (`Web2OrderTagDetail.open(order,tag)`): popup; SP-tag render list từ `tag.detail`; **âm mã fetch `/api/web2-products/usage?codes=` → "ai đang giữ"** (STT + tên KH + ×SL + trạng thái nháp/PBH, đánh dấu "đơn này"); trigger khác hiện mô tả registry. CSS inject 1 lần, Esc/overlay đóng.
- **native-orders**: `_autoTagPills` bọc pill clickable → `NativeOrdersApp.openTagDetail(code,trigger)` (stopPropagation chống toggle expand); load detail module. Bump render/public-api/index version.

### [perf] inventory-tracking Quản Lý Ảnh — Phase 2: lưu per-NCC (chỉ upload NCC vừa sửa)

Tiếp Phase 1: sửa 1 NCC trong đợt lớn (Đợt 2 = 80+ NCC) trước vẫn re-upload cả slot. Phase 2 chuyển sang **diff per-NCC** + upsert.

- **Server `routes/v2/inventory-tracking.js`** PUT thêm chế độ granular: body `{upserts:[{ncc,urls}], deletes:[ncc...]}` (không có `rows`) → `INSERT ... ON CONFLICT (ngay_di_hang,dot_so,ncc) DO UPDATE` cho upserts + `DELETE ... AND ncc=$` cho deletes, trong 1 transaction + advisory lock. Giữ nguyên slot-replace (rows) cho orphan-clear + fallback. Trả `{success,upserted,deleted}`.
- **Client `api-client.js`**: thêm `productImagesApi.granularSave({date,dotSo,upserts,deletes})`.
- **Client `modal-image-manager.js`**: snapshot `_originalDotContent` đổi sang `Map(dotSo→Map(ncc→urlsKey))` (key length-prefixed chống đụng base64). save() diff per-NCC → chỉ gửi NCC đổi/thêm (upserts) + NCC bị xoá (deletes); đợt không đổi gửi rỗng. **Fallback**: server cũ trả 400 'rows must be an array' → tự `bulkSave` slot-replace (deploy-order-independent).
- Web 1.0, KHÔNG đổi schema (unique key `(ngay_di_hang,dot_so,ncc)` đã có từ migration 058). Verify: unit test client diff 9/9 (add/del/rename/reorder/collision/new-đợt); test SQL granular trên Postgres local 10/10 (upsert đúng NCC, NCC khác + đợt khác không đụng, idempotent, delete-nonexistent no-op) — tạo/drop DB test, KHÔNG đụng prod. `node --check` 3 file PASS. Browser test bỏ qua (1 agent khác đang chiếm session — tránh contention).
- ⚠ Server granular chỉ live sau khi Render deploy; trong lúc chờ, client tự fallback slot-replace (đúng, chỉ chậm như Phase 1). Sau deploy nên probe granular trên prod (đợt-test 99) rồi cleanup.

### [feat] Thẻ cảm xúc VieNeu (cười/thở dài/hắng giọng) cho video-maker

User: VieNeu-TTS (github pnnbao97/VieNeu-TTS) có chức năng cảm xúc → thêm vào trang Tạo video (`web2/video-maker/`).

**Bản chất:** cảm xúc VieNeu = **token ngoặc vuông chèn thẳng vào lời đọc** (`[cười]` cười, `[thở dài]` thở dài, `[hắng giọng]` hắng giọng) — v3 Turbo (thử nghiệm). Server `/synthesize`+`/clone` đã forward `text` nguyên văn → **KHÔNG cần đổi server**, chỉ thêm UX chèn token + xử lý engine.

- **`video-tts.js` (Web2VideoTTS)** — thêm `CUES` (3 token, 1 nguồn) + `isCueCapable(voiceId)` (chỉ engine `vieneu`) + `stripCues(text)` (bỏ token + gom space). `synthesize()`: engine ≠ vieneu → `stripCues` trước khi split (MMS/Piper khỏi đọc literal "cười"). Export thêm `CUES`/`isCueCapable`/`stripCues`.
- **`video-maker.js`** — `renderCues()` (chip từ `CUES` + insert-at-cursor `insertAtCursor`, tự thêm space 2 đầu, không double-space) gọi trong `renderVoices()` (hint đồng bộ khi đổi giọng/kết nối VieNeu). Hint đổi theo giọng: VieNeu = "hoạt động (thử nghiệm)"; giọng khác = "chọn VieNeu mới có tác dụng, giọng khác bỏ qua". "Nghe nhanh" (giọng OS) cũng `stripCues` trước khi đọc.
- **`index.html`** — hàng chip `#vmCues` + hint `#vmCuesHint` trên textarea lời đọc; bump cache-bust video-tts.js?v=...cue + video-maker.js?v=...cue.
- Verify browser (localhost, có extension): 3 chip render, `stripCues("Áo trắng [cười] đẹp lắm [thở dài] nhé")`→"Áo trắng đẹp lắm nhé", `isCueCapable` mms=false/vieneu=true, chèn giữa câu 1 space, hint flip đúng khi chọn giọng VieNeu, 0 console error.

### [feat] TAG đơn hàng (auto theo trigger) + chặn PBH khi có SP chờ hàng (native-orders)

User: (1) đơn có SP "chờ hàng" (web2_products.status=CHO_MUA) → KHÔNG tạo PBH, phải tạo Phiếu soạn hàng; (2) thêm cột TAG ở native-orders + trang Cấu hình "TAG đơn hàng" gắn chức năng theo trigger (Phiếu bán hàng/Chờ hàng/Âm mã + "lấy hết trigger"). 4 quyết định locked: chặn cả đơn→soạn hàng · chỉ CHO_MUA · tag AUTO-only theo trigger · âm mã = đơn nháp giữ + PBH > tồn.

**Kiến trúc — tag tính SERVER-SIDE ở /load (auto-only, không lưu cứng → không drift):**

- **`render.com/services/web2-order-tags-service.js` (MỚI)** — engine 1 nguồn: TRIGGER registry 21 trigger (cho_hang/am_ma/het_hang/mua_1_phan/pbh_created/pbh_chua_tt/is_draft|confirmed|cancelled/chua_nhan_ck/da_nhan_ck/co_coc/thieu_dia_chi/thieu_sdt/ship_tinh/ship_tp/gop_don/don_tach/da_in/tu_livestream/tu_inbox) + PREDICATES + `orderProductFlags` + `buildContext` (query web2_products status/stock + held-in-drafts aggregate) + `computeAutoTags` + `enrichOrdersWithTags` + `ensureTable`/seed 3 tag mặc định. **Âm mã = held_in_drafts > stock_hiện_tại** (PBH đã trừ stock → tương đương held+PBH > tồn_gốc); chỉ áp đơn nháp; loại trừ SP CHO_MUA. 18 unit test pure-logic PASS.
- **`render.com/routes/web2-order-tags.js` (MỚI)** — CRUD bảng `web2_order_tags` (web2Db) + `GET /triggers` (registry cho UI) + SSE `web2:order-tags`. Mount `/api/web2-order-tags` (worker auto-route qua prefix `/api/web2-`). Mutation gắn `requireWeb2AuthSoft`.
- **native-orders `/load`** — sau mọi enrich gọi `enrichOrdersWithTags` → mỗi đơn có `o.autoTags` (pills) + `o.hasChoHang` (chặn PBH).
- **fast-sale-orders `/from-native-order`** — guard: SP CHO_MUA ở dòng bán → 400 `cho_hang_blocked` (force=true bỏ qua). Defense-in-depth.

**Frontend:**

- **`web2/shared/web2-order-tag-pill.js` (MỚI)** — `Web2OrderTagPill` render pill màu (1 nguồn cho cột Thẻ + preview trang config).
- **`web2/order-tags/` (MỚI)** — trang Cấu hình: card grid + modal (trigger picker nhóm + color + icon + live preview) + danh sách trigger tham chiếu + SSE. Đăng ký sidebar "Cấu hình" + WEB2_PAGES.
- **native-orders cột "Thẻ"** — th/td `col-tag` (sau Mã), COL_KEYS+COL_DEFAULT (`tag:true`), `NO._autoTagPills`, colspan 16→17 (2 expand row + loading), `autoTags`/`hasChoHang` vào `_rowSignature`.
- **Chặn PBH** — `createPbh` (chặn sớm `src.hasChoHang` → mời Phiếu soạn hàng), `_doCreatePbh` (handle `cho_hang_blocked`), `bulkCreatePbh` (tách đơn chờ hàng, báo rõ). SSE thêm sub `web2:products`/`web2:fast-sale-orders`/`web2:order-tags` → reload tính lại tag.
- Verify: `node --check` 13 file PASS + 18 unit test engine PASS. ⚠ Tag/guard chỉ live sau deploy Render (server tính autoTags).

### [audit d] Money-path adversarial audit (25 agent → 20 finding → 9 confirmed) — fix 9/9

User chọn (d) audit thêm 1 vùng. Chọn **money/ledger** (rủi ro cao nhất + regression-check fix a). Workflow 5 finder (supplier-wallet/customer-wallet/PBH/sepay/over-refund-regression) → skeptic verify từng finding. 9 confirmed, fix HẾT:

- **#1+#2 HIGH (regression của fix a)** — over-refund cap: (1) `/tx` pin `min(serverQty,client,prev)` → row partial nhận 2/10 pin 2 → KHOÁ vĩnh viễn dù sau nhận đủ 10; (2) `/quick-refund` không pin `ordered` → cross-path asymmetry. **Gốc**: lib trả `row.qty` (ĐẶT) không phải NHẬN. **Fix**: `loadSoOrderRowQtyMap`→`loadSoOrderReceivedQtyMap` status-aware (received=partial→min(qtyReceived,qty), received→qty, else 0 — khớp client `aggregateSuppliers`); cap = serverQty (received, tính LẠI mỗi lần) khi tra được → bỏ qua client/pin (hết khoá); so-order wipe → fallback tightest(prev,client); không nguồn → reject. Pin `ordered=cap` ở CẢ 2 path. 11-case matrix PASS.
- **#5 HIGH PBH oversell** — `POST /` (manual create) thiếu advisory lock như `from-native-order` → 2 create cùng SP qua validateStock (ngoài txn) rồi cùng `GREATEST(0,stock-qty)` nuốt âm = oversell thầm lặng. **Fix**: port khối `pg_advisory_xact_lock` per code (sort) + recheck tồn tươi trong txn → throw `__overSell`; catch → 400.
- **#6 HIGH PBH stock drift** — `PATCH /:number` `orderLines` overwrite order_lines KHÔNG điều chỉnh tồn (thêm dòng=không trừ; cancel sau restock qty sai). 0 client dùng. **Fix**: reject 400 `order_lines_immutable` (sửa dòng = huỷ+tạo lại).
- **#7 HIGH wallet drift** — `wallet_deducted = $1` (overwrite) race với `applyWalletToUnpaidPbhs` (SePay đến cùng lúc) → ghi đè, hoàn thiếu khi cancel. **Fix**: `wallet_deducted = COALESCE(wallet_deducted,0) + $1` (additive) ở POST / + from-native.
- **#9 MED→ SePay race** — webhook ↔ reprocess-cron cùng `debt_added=FALSE` → cùng `processDeposit` → double-credit khi index #8 vắng. **Fix (sau verify regression)**: KHÔNG dùng advisory-lock wrapper giữ thêm connection (bản đầu gây **deadlock pool** khi burst — verify bắt được). Đóng race ở ĐÚNG điểm credit: `processDeposit` re-check sepay dup SAU `FOR UPDATE` ví (2 caller cùng phone serialize trên wallet lock → caller 2 thấy tx caller 1 → alreadyProcessed) — connection-safe, độc lập index.
- **#8 HIGH SePay index** — unique index `idx_..._sepay` bị SKIP ở boot nếu có dup → mất backstop. Mitigated bởi #9 (serialize). **Fix**: log CRITICAL + note (KHÔNG auto-DELETE row ví ở boot — đụng balance).
- **#4 MED customer-wallet withdraw** — `processWithdraw` thiếu in-tx dup-check (deposit có MED-6) → TOCTOU. **Fix**: thêm dup-check `(type=WITHDRAW, reference_id)` sau FOR UPDATE → alreadyProcessed.
- **#3 HIGH customer-wallet double-click** — server UUID/req fallback KHÔNG dedupe 2 request rời (comment sai). 0 active caller (`Web2WalletApi.deposit/withdraw` chưa dùng). **Fix**: thêm param `idempotencyKey`→ header `x-idempotency-key` ở client (seam cho caller tương lai gửi key ổn định/lần mở modal) + sửa comment server cho đúng. Bump `web2-wallet-api.js?v=20260621d`.
- 11 finding refuted (false positive) — verifier skeptic loại. Verify: `node --check` 6 file PASS + cap-matrix PASS. ⚠ Money path — chỉ live sau deploy Render.

### [perf] inventory-tracking Quản Lý Ảnh — lưu chậm vì "lưu lại toàn bộ + load lại toàn bộ"

User báo lưu trong modal Quản Lý Ảnh lâu. Chẩn đoán đúng: `open()` nạp TẤT CẢ đợt vào `_rows`, `save()` bucket MỌI đợt → PUT từng đợt → sửa 1 ảnh re-upload cả bảng base64; mỗi PUT server `DELETE+INSERT` cả slot rồi **trả về TOÀN BỘ bảng** (mọi base64) + SSE push full table → tải lại toàn bộ.

- **Client `modal-image-manager.js`**: (1) `_canonicalDotContent()` + snapshot `_originalDotContent` lúc open → `save()` CHỈ PUT đợt thực sự đổi (no-op save = 0 request); (2) rebuild `globalState.productImages` từ `_rows` trong RAM thay vì từ response nặng (không tải full table); refresh snapshot sau lưu.
- **Server `routes/v2/inventory-tracking.js`**: PUT trả slim `{success,count}` (bỏ SELECT full table); `_scheduleImagesNotify()` gửi SSE nhẹ `{action:'update'}` thay vì cả bảng.
- **Client SSE `data-loader.js`**: handler `product_images` bỏ qua echo của chính máy vừa lưu (self-write) → không tải lại sau mỗi save; reconcile 1 lần sau cửa sổ self-write để bắt save đồng thời từ máy khác.
- **Deploy-safe**: client tương thích ngược server cũ (PUT body không đổi, không phụ thuộc shape response, SSE handler chịu cả full-table lẫn lightweight). Server-side benefit kích hoạt sau khi Render deploy; degrade graceful.
- Web 1.0 (pool `chatDb`), KHÔNG đổi schema/SQL write semantics (vẫn slot DELETE+INSERT). Verify Playwright live trên prod (server cũ): no-op save = 0 PUT (71ms); sửa 1 đợt = đúng 1 PUT đợt đó (đợt khác không đụng); globalState rebuild đúng; seed/sửa/clear đợt-test 99 rồi cleanup sạch (totalImages 82→82). `node --check` 3 file PASS.
- ⚠ Còn lại (chưa làm): sửa 1 NCC trong đợt lớn (vd Đợt 2 = 81 NCC) vẫn re-upload cả slot đó. Phase 2 (per-NCC upsert `ON CONFLICT (ngay_di_hang,dot_so,ncc)`) cần staged server+client deploy → defer, hỏi user nếu vẫn chậm.

### [fix] inventory-tracking — đồng bộ 2 chiều tab Đợt giữa "Theo Dõi Đơn Hàng" và "Quản Lý Ảnh"

User báo: tạo Đợt 3 ở tab theo dõi đơn hàng (Hình 1) nhưng modal Quản Lý Ảnh (Hình 2) không có Đợt 3 — và ngược lại. Gốc: 2 surface tính danh sách đợt từ **2 nguồn KHÔNG hợp nhất** — order-tracking (`getAvailableDotSoList`) chỉ đọc `globalState.shipments[].dotSo`; image-manager (`_allDotSos`) chỉ đọc `_rows` (từ `globalState.productImages` + 1 row trống ở đợt active). Đợt chỉ có shipment (chưa có ảnh) hoặc chỉ có ảnh (chưa có shipment) bị thiếu ở surface kia.

- **Fix 1** `data-loader.js getAvailableDotSoList()` → UNION shipment đợt + product-image đợt (order-tracking hiện đợt chỉ-có-ảnh).
- **Fix 2** `modal-image-manager.js _allDotSos()` → union rows + `_knownDotSos` (shipments+ảnh) → modal hiện đợt chỉ-có-shipment (vd Đợt 3 mới tạo, count 0).
- **Fix 3** `open()` → đợt active mặc định lấy `UIState.getActiveDotTab()` (mở modal từ Đợt 3 → modal vào Đợt 3).
- **Fix 4** `save()` → gọi `DotTabs.render()` sau khi cập nhật `globalState.productImages` (đợt tạo trong modal hiện ngay ở order-tracking; `applyFiltersAndRender` không rebuild tab bar).
- Web 1.0 (pool `chatDb`, không đụng DB/pool). Verify Playwright live: shipments=[1,2,3] images=[2,3] → modal tabs [Đợt 1·0, Đợt 2·81, Đợt 3·2] active Đợt 3 (trước thiếu Đợt 1); inject đợt-ảnh ảo 9 → order-tracking tabs [1,2,3,9] → revert sạch (no DB write). `node --check` 3 file PASS.

### [feature b] Gate worker `/api/facebook-graph` — allowlist read-only + GET-only (chặn open Graph relay)

`handleFacebookGraph` (cloudflare-worker/modules/handlers/facebook-handler.js) là proxy Graph GET MỞ: ai có access_token đọc node Graph tuỳ ý. Audit xác nhận **0 caller frontend** dùng route worker này (web2-fb-posts đi Render riêng; orders-report dùng TPOS `/api/facebook-graph/*` khác host; `/livevideo` là route FACEBOOK_LIVE riêng) → gate an toàn, không ảnh hưởng Web 1.0/2.0.

- `normalizeAllowedGraphPath()` + `FB_GRAPH_ALLOW` (regex): chỉ cho edge READ (`me`, `me/accounts`, `debug_token`, `oauth/access_token`, `{id}`, `{id}/{comments|feed|posts|live_videos|insights|...}`, `act_{id}/{insights|campaigns|...}`). Chặn scheme (`://`), `@`, `\`, `..`, `//`, path > 256 → 403.
- GET-only → 405 (OPTIONS preflight đã short-circuit ở worker.js:86). Host upstream cố định graph.facebook.com nên `path` không đổi host được.
- Verify: ESM `node --check` PASS; 9 allow + 10 block case PASS (gồm SSRF `http://169.254.169.254`, traversal, `:80`, `@`).
- ⚠ **Worker change — chỉ có hiệu lực sau `wrangler deploy`** (git push KHÔNG deploy worker).

### [feature a] Over-refund cap ví NCC — SERVER-AUTHORITATIVE qua so-order (cả /quick-refund + /tx)

User chọn làm tiếp (a) over-refund feature. Trần (cap) SL trả NCC giờ lấy SL đã mua THẬT từ `web2_so_order` ở CẢ 2 money path, không còn no-op khi client giấu `ordered`.

- **Lib dùng chung** `render.com/lib/web2-so-order-qty.js` — `loadSoOrderRowQtyMap(client)` build `Map(rowId→Σ qty)` từ so-order doc 'main'. Tách lib vì `purchase-refund.js` đã `require('./web2-supplier-wallet')` → tránh circular require; cả 2 route cùng require lib.
- **purchase-refund.js `/quick-refund`** (branch rowReturns): bỏ hàm `loadSoOrderRowQtyMap` local → dùng lib. Trần = min(serverQty, clientOrdered) các giá trị >0; **cap===null (không nguồn nào tra được SL mua) → REJECT 400** thay vì cho trả vô hạn (trước đây cap=null = no-op).
- **web2-supplier-wallet.js `/tx` type=return**: thêm `loadSoOrderRowQtyMap` (đọc 1 lần trong transaction, dưới meta FOR UPDATE). Trần = min(serverQty, prevOrdered-pinned, claimedOrdered) các giá trị >0 — serverQty (so-order) ưu tiên, chỉ cho SIẾT không NỚI; **cap===null → REJECT 400**. Pin `ordered=cap` (trần siết chặt nhất) cho lần trả sau.
- Flow purchase-refund quick/bulk (KHÔNG gửi rowReturns) + `/tx` payment KHÔNG đổi (negative-stock-by-design giữ nguyên; chỉ siết đường rowReturns). Legacy `updateSupplierWallet` (type=return không rowReturns) không ảnh hưởng.
- Verify: `node --check` 3 file PASS; offline 8-case cap matrix PASS (server caps inflated client, no-server→client, nothing→reject, pin-tighter-wins). Money path — KHÔNG smoke prod (chỉ deploy Render mới live).

### [audit r9] Adversarial audit 7 mặt cuối (33 agent) → 16 bug → fix 16 (delivery/refund gate staged)

7 finder (worker-handlers/remaining-pages/generic-entity/zalo-oa-creds/native-orders-modules/sse-notify-completeness/mutation-idempotency). 16 confirmed, fix hết:

- **worker-handlers (2)**: `pancake-handler` log `targetUrl` chứa `access_token` (mọi chat/settings call) → import+dùng `redactUrlForLog` (export từ proxy-handler). `image-proxy` SSRF guard bị bỏ qua ở nhánh resize (forward `?url=` sang Render không validate → `url=http://169.254.169.254/...`) → validate TRƯỚC nhánh wantResize.
- **remaining-pages (3)**: report-revenue `new Date(s.day)` UTC → nhãn ngày lệch −1 (GMT+7) → parse local midnight. delivery+refund state-mutation POST KHÔNG gửi token + route không gate → client gửi authHeaders (gate route ở commit staged sau). printer-settings native `confirm()` → `Popup.danger`.
- **generic-entity (3)**: dedicated-entity history không cap → MAX_HISTORY=300 (khớp generic); `_storage` GET không auth (lộ entity_slug+size) → gate; dedicated-entity `parseInt(page/limit)` NaN khi `?page=` rỗng → `|| default`.
- **zalo-oa-creds (2)**: ZNS sendZNS không idempotency → gửi trùng tốn phí khi retry → check (phone,template,orderRef) sent/pending 10 phút. `/send-zns` không rate-limit → thêm limiter 5 tin/SĐT/phút (+prune map).
- **native-orders-modules (1)**: `_showFbBusinessLoginPrompt` nhánh fallback gọi `window.Popup.confirm` KHI Popup undefined → TypeError → dùng `confirm()` native.
- **sse-notify-completeness (2)**: campaign CRUD (create/delete/assign/unassign) + "Lưu Live" save/delete KHÔNG `_notify` → tab khác stale → thêm `_notify('campaign'|'saved')`.
- **mutation-idempotency (3)**: supplier-wallet `nextval` tiêu TRƯỚC dup-check → gap số PAY/YEAR/NNNN khi retry → pre-check tx_id trước nextval. msg-templates DELETE không check rowCount → false 200+SSE giả → RETURNING+404. quick-replies seed cold-start race nhân đôi → cache PROMISE (chạy 1 lần).
- **STAGED**: delivery-invoices.js + refunds.js route gating → làm sau khi client (dlv-app/rf-app ?v=r9) deploy lên nhijudy.store (tránh 401-window như ck-dashboard r8).
- **STAGED DONE** (commit này, sau khi nhijudy.store serve client ~60s): gate delivery-invoices (from-pbh/ship/deliver/return/cancel/patch/delete) + refunds (approve/complete/cancel/delete) bằng requireWeb2AuthSoft. /from-pbh refunds = 410 stub (bỏ qua).
- Cache-bust `?v=20260621r9` (native-orders-state/dlv-app/rf-app). report-revenue/printer-settings = inline script (tự fresh khi load trang).

### [hotfix r8] ck-dashboard 401 — fetchJson thiếu token sau khi gate customer-intents

User báo `ck-dashboard` 401 `Cần đăng nhập Web 2.0` trên `/api/web2/customer-intents`. Regression r8: gate GET customer-intents nhưng client `ck-dashboard-app.js fetchJson` (dùng cho CẢ payment-signals + customer-intents) chỉ `credentials:'include'`, KHÔNG gửi `x-web2-token`. Fix: `fetchJson` thêm `Web2Auth.authHeaders()`. Bump `?v=20260621r8fix`. (Bài học: khi gate GET, verify ĐÚNG hàm fetch của caller gửi token — ck-dashboard có 2 đường fetch, chỉ POST /done có token, GET list thì không.) Kèm fix icon lucide `message-square-warning` (không có trong 0.294.0) → `message-square`.

### [audit r8] Adversarial audit 7 mặt còn lại (39 agent) → 19 bug → fix 16, defer 3 + phát hiện secret leak Web 1.0

7 finder mới (zalo/shared-2/wallet-routes/pages-logic/livechat/media-ai/worker-security). livechat=0 (sạch). 19 confirmed, fix 16:

- **CRITICAL ✅ Zalo double-encrypt** `web2-secret-crypto.js` `encryptJson` không idempotent → `web2-zalo` persistSession encrypt rồi `_saveSession` encrypt LẦN 2 (WEB2_ENC_KEY bật ở prod) → ciphertext lồng → decryptJson ra `{__enc__}` thay vì creds → **restore phiên Zalo FAIL toàn bộ**. Fix: `encryptJson` trả nguyên nếu value đã `{__enc__: enc:v1:...}`. (Session đã hỏng cần re-login 1 lần.)
- **CRITICAL ✅ double-debit /withdraw** `v2/web2-wallets.js` thiếu idemKey server-side khi client không gửi header (deposit đã fix #19, withdraw bỏ sót) → double-click/retry trừ ví 2 lần. Fix: sinh `mwdr_<uuid>` + dup-check luôn (partial unique index bảo vệ).
- **HIGH ✅ Zalo** reconnect thiếu `expectedUid` guard (gắn nhầm danh tính) + persistSession nuốt lỗi (`_pool` null cold-start → báo 'connected' nhưng session không vào DB → mất sau restart). Fix: thêm guard + ném lỗi thay vì nuốt + `_saveSession` throw khi `_pool` null.
- **HIGH ✅ rò secret/token vào log**: Pancake JWT trong `?token=` URL avatar (`web2-customer-chat-core.js` → worker log) → bỏ token (avatar FB public); Gemini key trong `?key=` URL (`web2-caption-service.js`) → header `x-goog-api-key`; worker trả `error.stack` cho client (`worker.js`) → message generic + log server; SePay dashboard nhận creds qua GET query + log email (`sepay-dashboard-handler.js`) → chỉ POST + bỏ log email.
- **HIGH ✅ auth gap (PII)**: `v2/web2-customer-orders.js` GET (tên/SĐT/địa chỉ+đơn+tiền) hoàn toàn không auth → gate + 2 client gửi token (customer360, pbh-render; returns-api đã gửi). `web2-customer-intents` GET `/`+`/stats` (PSID/msg/intent) → gate (ck-dashboard đã gửi token). `web2-comment-boost` GET `/jobs`+`/job/:id` → gate (multi-tool đã gửi token).
- **MED ✅**: photo-studio batch object URL không revoke → leak handle → revoke sau 5s; cutout (4 fetch) + comment-boost-worker (2 fetch) thiếu timeout → `AbortSignal.timeout` (cạn worker slot); geocode cache vô hạn → trần 5000 + evict oldest; customers tier-3b import tuần tự ≤12 RTT → `Promise.allSettled`; Zalo `MEDIA_BASE` fallback raw-Render host → worker proxy (URL media bền khi đổi host).
- **DEFER (cần user/feature)**: (1) supplier over-refund cap null khi `ordered` vắng — ép `ordered>0` sẽ chặn return hợp lệ khi SL đặt unknown → cần server tra so-order received-qty (feature, như r5 #1); (2) worker `/api/facebook-graph` open Graph proxy (GET-only) — allowlist rủi ro vỡ Web 1.0 orders-report; (3) imgbb key hardcode trong worker (`image-proxy-handler.js`) — cần xoay key + CF secret.
- **⚠️ PHÁT HIỆN NGOÀI SCOPE (CRITICAL, Web 1.0)**: SePay email+password+api_key HARDCODE plaintext trong `shared/js/navigation-modern.js` (nạp MỌI trang) + `service-costs/js/service-costs.js` → lộ cho mọi browser xem source. Cần: chuyển creds vào worker env server-side + **xoay password & api_key** + client gọi không kèm creds. SURFACE cho user (cần xoay key = user action).
- Cache-bust `?v=20260621r8` (customer360/pbh-render/customer-chat-core/photo-studio-edit/customers-events).

### [audit r7] Adversarial audit 7 mặt mới (29 agent) → 11 bug xác nhận → fix HẾT 11

7 finder mới (cron-workers/native-orders-core/soorder-stock/frontend-xss/auth-session/reconcile-sepay/schema-migrations) + skeptic/finding. XSS surface = 0 (sạch). 11 confirmed, fix hết:

- **cron-workers (4)**: `web2-webhook-retry.js` — (a) enqueue ON CONFLICT ghi đè next_retry_at=2min làm SỤP backoff khi SePay re-deliver → `GREATEST(existing, EXCLUDED)` giữ lịch xa hơn; (b) SELECT FOR UPDATE SKIP LOCKED chạy autocommit (lock nhả ngay → vô hiệu) → bọc CLAIM trong transaction + lease next_retry_at +10min, processFn ngoài txn + `_processing` guard chống overlap tick. `web2-ck-watcher.js` N+1 QR lookup (200 query/signal) → `_prefetchQrMap` 1 query + `_resolveTxIdentity(db,tx,qrMap)`. `web2-unread-reconcile.js` `_fetchConversations` chỉ trang 1 → phân trang `page_number` (cap 10) + guard dừng nếu API không phân trang.
- **native-orders-core (1)**: `native-orders-render.js` `_rowSignature` THIẾU `ckSignal` → badge "💸 KH báo đã CK" (đổi qua SSE, không bump updated_at) không hiện trên row tái dùng DOM → thêm `ckSignal.id:status` vào chữ ký.
- **soorder-stock (2)**: `so-order-receive.js` index lookup chỉ name|variant "first match wins" → 2 SP cùng tên+biến thể KHÁC NCC cộng tồn nhầm SP → 2 index (name|variant|supplier ưu tiên + fallback name|variant). `so-order-storage-sync.js` 409 conflict DROP `_pendingState` → mất edit (pullOnce tab-focus đè) → khôi phục `_pendingState=stateSnapshot` + pullOnce guard thêm `_pendingState`.
- **auth-session (1)**: `web2-auth.js` verify() gửi `?token=` URL → lộ token vào log Render (server.js ghi req.url) → chuyển sang header `x-web2-token`. Defense-in-depth: server.js `_redactUrl` che `token=/page_access_token=/jwt=` trước khi log (cũng che SSE/avatar buộc dùng query).
- **reconcile-sepay (2)**: `web2-payment-signals.js` /approve gửi tin xác nhận KHÔNG claim `confirm_msg_sent` → KH nhận 2 tin khi QR-match + approve cùng GD → claim flag atomic trước `sendCkReply`. `web2-ck-watcher.js` `_applyMatch` rollback ghi `sig.status` (stale) → clobber staff-confirm xen giữa → CASE chỉ revert 'pending' khi `confirmed_by='(watcher tự động)'`.
- **schema-migrations (1)**: `web2-sepay-matching.js` DROP+ADD CHECK constraint MỌI boot → AccessExclusiveLock + scan web2_balance_history → guard `IF EXISTS pg_constraint THEN RETURN` (sau lần đầu = catalog-lookup không lock).
- Cache-bust `?v=20260621r7`: web2-auth(49)/web2-sidebar(46)/native-orders-render(1)/so-order-receive(1)/so-order-storage-sync(1) + sidebar inject.

### [audit r6 batch 2] fast-sale-orders — gate auth toàn bộ mutation + chống over-sell race (2 bug cuối)

Hoàn tất 2 finding critical-path còn lại của r6 (PBH/tồn kho). Staged deploy chống 401-window:

- **K — auth gap (MED/HIGH)**: TOÀN BỘ mutation `/api/fast-sale-orders/*` (13 route: POST `/`, `/from-native-order`, `/bulk-confirm`, `/bulk-cancel`, `/merge`, `/backfill-customer-links`, `/reset-stt`, PATCH `/:number`, POST `/:number/cancel`, `/by-source/:code/cancel`, `/:number/confirm`, `/:number/print`, DELETE `/:number`) KHÔNG có auth → ai biết worker URL đều tạo/huỷ/xác nhận PBH + trừ kho + trừ ví. Agent enumerate 11 client call-site thiếu token. **Staged**:
    - stage1 (`4e3b49217`): client gửi `x-web2-token` — pbh-actions (7), native-orders-pbh-bill (3), bulk-operations (2), print.html (đọc localStorage). Harmless (route chưa gate). Deploy + verify nhijudy.store đã serve client mới (8+3 ref).
    - stage2 (commit này): gate 13 route bằng `requireWeb2AuthSoft`. Extension KHÔNG gọi fast-sale-orders. ⚠ QA scripts `pbh-qa-test.js`/`test-pbh-wallet-cod.js` sẽ 401 (cần wire token khi chạy — không ảnh hưởng prod).
- **L — over-sell race (HIGH)** (`b9f7b0f56`): `validateStock` chạy NGOÀI txn + advisory lock chỉ theo `source_id` → 2 PBH khác native-order cùng 1 SP chạy song song đều qua check rồi cùng trừ → `GREATEST(0,stock-qty)` nuốt âm = over-sell thầm lặng. Fix: trong `withTransaction` trước INSERT, `pg_advisory_xact_lock('web2_product_stock:<code>')` (sort tránh deadlock) + re-check tồn tươi → `__overSell` throw → 400 over_sell (format client đã xử lý). `force=true` vẫn bypass.

### [audit r6] Adversarial audit 7 mặt (28 agent) → 14 bug xác nhận → fix 12 (1 CRITICAL ví)

Workflow 7 finder (worker/sse/money/pancake-zalo/orders-stock/shared-core/write-validation) + skeptic nghiêm/finding → 14 confirmed. Fix đợt này 12 (2 fast-sale-orders để pass sau):

- **CRITICAL ✅ ví trừ không atomic** `web2-returns.js` nhánh `van_de_shipper`: `processWithdraw(pool)` commit ngay rồi INSERT riêng (`pool.query`) → INSERT fail (non-23505/hết retry) thì ví ĐÃ trừ mà KHÔNG có phiếu → khách mất tiền không dấu vết. Fix: bọc `withTransaction` (processWithdraw nhận `client`), retry-23505 tạo txn MỚI mỗi lần — mirror đúng nhánh `van_de_khach`.
- **HIGH ✅ auth gap (lộ PII/metadata)**: `web2-msg-send.js` 4 GET (`/active`,`/:id`,`/failed-codes`,`/extension-items` — lộ fb_user_id/thread_id/message) + `web2-live-relay.js` GET `/pages` (lộ Pancake page/account) → thêm `requireWeb2AuthSoft`. Client tương ứng (`web2-msg-template-send.js` 4 fetch, `pancake-settings-api.js` /pages) thêm `authHeaders` (extension KHÔNG gọi msg-send → an toàn).
- **HIGH ✅ worker misroute** `cloudflare-worker/.../routes.js`: `/api/admin/web2-*` (data-reset/wallet-reset/import-\*) rơi catch-all TPOS (tomato.tpos.vn 404) vì khớp `/api/admin/` không `/api/web2-`. Thêm `startsWith('/api/admin/web2-')→WEB2_GENERIC` trước catch-all.
- **HIGH ✅ DoS bulk-write** `web2-products.js` 4 route (adjust-stock/adjust-pending/upsert-pending/confirm-purchase-partial): mảng không cap + loop SELECT FOR UPDATE/item → cạn pool. Thêm `MAX_BULK_ITEMS=1000`.
- **HIGH ✅ SSE stale** `web2-sse-bridge.js`: `suppressResyncOnce` kẹt `true` nếu reopen-đổi-topic lỗi trước `connected` → reconnect thật bỏ resync → trang stale. Xoá cờ trong `_scheduleReconnect`.
- **HIGH→ MED ✅ silent 401** `web2-customer-store.js` `_post` không check `r.ok` → 401 trả `{}` im lặng (cột khách trống vô cớ). Thêm check + cảnh báo throttle 60s khi 401.
- **MED ✅** `popup.js`: keydown gắn trên document cho MỌI popup → Enter/Escape resolve nhầm popup dưới (có thể chạy xoá ngoài ý). Thêm `_popupStack`, chỉ popup trên cùng nhận phím.
- **MED ✅** `web2-variants.js` PATCH/DELETE `/:id` thiếu ràng buộc `(\d+)` (GET đã có) → id phi số lộ lỗi type bigint. Thêm `(\\d+)`.
- **MED ✅** `web2-generic.js` `data.history` push không giới hạn → JSONB phình. Cap `MAX_HISTORY=300` (giữ entry gần nhất).
- **CÒN LẠI (pass sau, critical-path PBH)**: `fast-sale-orders.js` (a) mutations thiếu auth, (b) validateStock race over-sell — cần verify client + transaction kỹ.
- Cache-bust: bump `?v=20260621r6` cho web2-sidebar(46)/sse-bridge(35)/customer-store(4)/msg-template-send(1)/pancake-settings-api(1) + popup.js inject.

### [audit r5] Giải quyết 6 deferred-item — fix 2 (fb-posts auth gate + inventory clamp), 4 xác nhận không-bug

User: "làm tất cả -> audit -> tìm lỗi -> lặp lại đến khi hệ thống hoàn hảo". Soi ground-truth 6 item deferred từ r1-r4:

- **FIX ✅ #4 fb-posts auth** `render.com/routes/web2-fb-posts.js` — 8 read GET (`/list`,`/post-detail`,`/engagement`,`/insights-probe`,`/ad-accounts`,`/ad-insights`,`/ad-entries`,`/drafts`) thêm `requireWeb2AuthSoft`. An toàn vì client shared `web2/shared/web2-fb-client.js` ĐÃ gửi `Web2Auth.authHeaders()` trên MỌI request (jget+jpost), và `/caption`+`/publish` POST cùng route đã gate + chạy prod OK → token đã forward. Giữ `/status`+`/auth/*` mở (OAuth callback FB redirect phải reachable). Đóng info-disclosure bài FB + ad-spend của shop.
- **FIX ✅ #6 inventory-tracking DoS** `render.com/routes/v2/inventory-tracking.js` (Web 1.0, chỉ đọc — KHÔNG đổi pool/data) — thêm `clampLimit` (def 200, MAX 1000) + `clampOffset` (≥0), thay 3 site `parseInt(limit/offset)` (paginate + meta echo). Chống `?limit=99999999` kéo cả bảng + `LIMIT NaN` crash khi `?limit=abc`.
- **KHÔNG-BUG / không sửa (ground-truth)**:
    - #1 over-refund cap `web2-supplier-wallet.js` — ĐÃ server-authoritative: client `supplier-wallet-actions.js:91-92` gửi `ordered` thật, server pin min-ceiling dưới `FOR UPDATE` (chống `ordered` phồng + race 2 modal). Residual = row thiếu ordered qty = data-completeness, không phải code bug.
    - #2 wallet UNIQUE index `web2-wallet-service.js` — double-credit ĐÃ chặn bằng `FOR UPDATE` + check-after-lock (deposit #2 thấy tx #1 committed → alreadyProcessed). Thêm UNIQUE trên bảng tiền THẬT rủi ro fail-boot nếu có dup cũ → reward<risk, giữ nguyên.
    - #3 dashboard "SP chờ" `dashboard-kpi.js:153` — đếm số DÒNG SP chưa nhận (`pending.length`), self-consistent; sum-quantity là preference hiển thị, không phải bug.
    - #5 audit-log cast `v2/audit-log.js` — UNION đã type-consistent: 4 block đều emit `timestamptz` (`to_timestamp()` cho BIGINT, native TIMESTAMPTZ cho wallet). Không mismatch — FP.
- **Bonus**: phát hiện + khôi phục 983 dòng `docs/dev-log.md` bị xoá nhầm (uncommitted, không ai yêu cầu) → `git checkout HEAD`.

### [audit r4] Web 2.0 round-4 audit (live-chat/ai-media/products/fb/notif/perf) → fix 1, phần lớn FP/out-scope/defer

Audit 6 mặt cuối → 31 finding → verify → 16 confirmed. Nhưng soi kỹ: chỉ **1 fix thật autonomous-safe**, phần lớn là false-positive / Web 1.0 / cần user quyết → tín hiệu **HỘI TỤ** cho phần sửa tự động.

- **FIX ✅** `video-tts.js:196` (HIGH) — `toAudioBuffer` thêm fallback `getChannelData().set()` khi browser cũ (Safari/iOS) thiếu `copyToChannel` → hết crash phát giọng. Khớp web2-video-audio.js.
- **FALSE-POSITIVE (KHÔNG fix — sẽ phá tính năng)**: 3 "CRITICAL IDOR" + 1 HIGH ở `v2/notifications.js` (unread-count/mark-all-read/:id/read/create thiếu lọc user_id). Thực tế notifications là **shop-wide by design**: cột `user_id` nullable, KHÔNG producer nào set user_id (toàn null = thông báo chung cho mọi NV shop nhỏ). Thêm `WHERE user_id=$1` → mọi NV thấy 0 thông báo. Muốn per-user là **đổi feature**, không phải fix bug.
- **OUT OF SCOPE (Web 1.0)**: `v2/inventory-tracking.js` 3 HIGH unbounded LIMIT (DoS) + 1 MED NaN — inventory-tracking là **Web 1.0** (CLAUDE.md: /api/v2/\* core). KHÔNG sửa trong đợt Web 2.0; **surface cho user** xử lý riêng (cap LIMIT an toàn).
- **NEGLIGIBLE / không sửa**: video-maker BufferSource one-shot tự GC (không leak thật); web2-products `newStatus=row.status` giữ NULL cũ (không tạo corruption mới).
- **DEFER cho user quyết (verify caller trước)**: `web2-fb-posts.js` /list,/post-detail,/ad-insights,/ad-accounts — unauth GET đọc dữ liệu FB post của shop (KHÔNG lộ token — response không chứa token). Nên gate `requireWeb2AuthSoft` NHƯNG frontend fb-posts fetch Pancake browser-direct, chưa xác nhận caller route gửi token → gate ẩu có thể vỡ. `v2/audit-log.js` UNION `created_at` type mismatch (MED) — cần verify cast SQL kỹ.

**KẾT LUẬN 4 vòng**: 51 confirmed → **44 fix đã push** (r1:25, r2:7, r3:12, r4:1) gồm 4 CRITICAL thật (capture-lock auth, zalo boot expectedUid, so-order footer cost, + r2 over-refund được re-grade). Còn lại là FP / Web 1.0 / cần user quyết (over-refund cap design, wallet UNIQUE index, dashboard SP-chờ semantics, fb-posts gate, audit-log cast, inventory-tracking Web1).

### [audit r3] Web 2.0 round-3 audit hội tụ (native/so-order app, worker, KPI, a11y) → fix 12 ✅

Audit 5 mặt chưa quét sâu → 18 finding → verify → **13 confirmed**. Fix 12, defer 1 (ambiguous).

- **CRITICAL** `so-order-render.js:715` — footer "Tổng tiền" dùng `sellPrice` (giá bán) thay vì `costPrice` (giá nhập) → đơn MUA NCC hiển thị tổng sai (phồng). Đổi sang costPrice, khớp `so-order-modal-core:456-458` ("Σ SL × GIÁ NHẬP").
- **HIGH** `native-orders-pbh-bill.js:762` — gọi `renderOrders()` không tồn tại → ReferenceError, list không refresh sau huỷ đơn → `NO.renderRows()`.
- **HIGH** `native-orders-bulk-operations.js:61` — STT confirm dùng `displayStt` trần → dùng `NO.computeOrderStt()` (ưu tiên campaignStt cho đơn livestream).
- **HIGH** `realtime-sse-web2.js` relay-notify — chặn relay topic `web2:_admin:*` (403), cap payload 10KB (413), whitelist event type; `setForwardTarget` bắt buộc https (SSRF guard nhẹ).
- **HIGH** `dashboard-kpi.js:57` — revenue 7d WHERE lọc rolling 7×24h UTC nhưng GROUP BY theo ngày +7 → bucket sớm bị cắt; đổi WHERE lọc theo ngày VN (khớp GROUP BY).
- **HIGH** `report-revenue/index.html:564` — `onclick="openCustomerModal(${c.customerId})"` chưa escape → coerce `Number(c.customerId)||0` (number literal, hết XSS); `c360Close` thêm aria-label + tap-target.
- **HIGH/MED a11y** `purchase-refund/index.html` 4 nút `×` thêm `aria-label="Đóng"`; `.pr-quick-close` tap target ≥44px.
- **DEFER (cần user quyết)**: `dashboard-kpi.js:156` `unrecvProducts += pending.length` — "Y SP chờ" nghĩa là số DÒNG SP hay TỔNG SỐ LƯỢNG? Ambiguous → không đổi number dashboard theo phỏng đoán.
- `node --check` pass; bump `?v=` (so-order-render, native-orders-pbh-bill/bulk, purchase-refund.css).

### [audit r2] Web 2.0 round-2 audit sâu (money/sql/xss/auth/race/pages + regression r1) ✅

Workflow audit sâu 7 mặt → 44 finding → verify → **11 confirmed**. Fix 7 thật, defer 2 (money cần design), bỏ 3 false-positive. **Regression check r1: SẠCH** (không lỗi mới từ 25 fix round 1).

- **r2a** — auth-gate 4 route READ lộ data nhạy cảm không auth: `v2/web2-customers` batch-by-fbid + batch-by-phone (PII KH), `v2/web2-wallets` batch-summary + batch-full (số dư ví) → `requireWeb2AuthSoft`. Vá caller duy nhất thiếu token (`comments-mobile-state.js` postJson gắn x-web2-token) trước khi gate. XSS `multi-tool.js:82` `r.reason` → `esc()`.
- **r2b** — `reconcile-actions.js` audit date filter (`tsToInput`/`inputToTs`) dùng giờ LOCAL → đổi GMT+7 (offset +07:00 cố định).
- **DEFER (cần user/design, KHÔNG fix tự động)**:
    - Over-refund cap `web2-supplier-wallet.js:287` — cap chỉ active khi client gửi `ordered`; client HIỆN KHÔNG gửi (shape `{qty,amount}`) → cap null → không chặn. Fix đúng = server tra SL-đã-nhận authoritative từ so-order (feature, không phải patch); ép reject khi thiếu `ordered` sẽ CHẶN MỌI return hợp lệ → KHÔNG làm.
    - Wallet manual-deposit UNIQUE index `web2-wallet-service.js:216` — double-credit thực tế ĐÃ chặn bởi `FOR UPDATE` ví (serialize same-phone); UNIQUE index là defense-in-depth nhưng rủi ro fail boot trên money DB nếu có row trùng → cần test-migration trên clone riêng trước.
- **FALSE-POSITIVE (đã đúng/đã fix sẵn)**: `deductStock` đã atomic value-based (`SET stock = stock - $1`, before/after chỉ để log); products-modal openCreate ĐÃ có guard không đè lựa chọn user (2026-06-20); so-order deeplink ĐÃ có retry 6× re-assert tab (2026-06-14).
- `node --check` pass; bump `?v=` (comments-mobile-state, multi-tool, reconcile-actions).

### [audit] Web 2.0 full-surface audit (adversarial-verified) → fix 25 bug ✅

Workflow audit 8 mặt (sse/ws, render-route, pancake, zalo, frontend-js, css-modal-ui, click-path, firebase) → 47 finding raw → skeptic refute → **27 confirmed** → fix 25 (6 commit r1a-r1f), 1 false-positive (native-orders-modal-edit: `#productPickerInput` rebuild mỗi lần mở modal nên listener KHÔNG tích lũy).

- **r1a** — QR-write auth (`v2/web2-customer-wallet` POST `/:phone/qr` + client gắn `x-web2-token`); `web2-live-comments` seq fallback non-empty numeric (hết đè comment) + N+1 DELETE → 1 query `unnest+EXISTS`; relay 401 log rõ; so-order-storage-sync conflict clear `_pushTimer` (giữ `_pendingState`).
- **r1b** (CRITICAL) — `web2-generic` capture-lock acquire/release `requireWeb2AuthSoft` (release qua sendBeacon → token đi trong **body**, client gắn vào payload); `web2-zalo-zca` restoreAll truyền `expectedUid=a.zalo_uid||null` (chống boot login nhầm danh tính) + audit log + `web2-zalo` restoreSessions SELECT thêm `zalo_uid`; `web2-zalo` GET `/conversation/:phone` fallback ưu tiên TK `is_primary`/`connected`.
- **r1c** — cleanup SSE/timer leak khi `pagehide` (web2-bh-data, web2-pending-match, web2-wallet-balance shared); web2-msg-template-send poll 3s→10s + pagehide clear.
- **r1d** — purchase-refund modal anti-lag (bỏ `backdrop-filter:blur`, box-shadow 32px→8px24px ×2).
- **r1e** — native-orders dup listener filterStatus/filterLimit; purchase-refund + products modal double-submit guard.
- **r1f** — native-orders-snapshots check `r.ok`; web2-qr-modal `last_used_at` GMT+7; so-order-app remoteHandler hoãn renderAll khi đang focus ô nhập.
- Tất cả `node --check` pass; bump `?v=` các file shared/page (wallet-balance, msg-template-send, qr-modal, purchase-refund.css, products-modal, …). **Cần verify browser-test**: capture-lock leader/heartbeat/release end-to-end (sendBeacon+token body), Zalo boot restore trên Render.
- Bối cảnh: từ task "đọc hiểu 10 repo (redis/tanstack-query/glide/dragonfly/sdwebimage/nextchat/chatwoot/chatui/simplex/wunjo) → tích hợp Web 2.0". Ground-truth: phần cache/async (dedup/LRU/onSettled) phần lớn ĐÃ có (initPromise dedup, SSE invalidate, IDB TTL) → pivot sang audit+fix toàn bộ Web 2.0.

## 2026-06-20

### [perf] Trigram index web2_balance_history.content (ILIKE substring) ✅ + remaining defer

- **`web2-sepay-matching.js`** ensureTables: `CREATE EXTENSION pg_trgm` + `idx_web2_bh_content_trgm USING gin (content gin_trgm_ops)` → ILIKE `%..%` (tìm kiếm UI + match) dùng index thay seq scan. pg_trgm đã bật web2Db (web2-customers-schema). Self-apply khi Render restart. `node --check` pass.
- **Defer (cần infra/test riêng, KHÔNG rush)**:
    - Web 1.0 `balance_history.content` trigram (HOT path webhook SePay) — bảng chatDb tạo qua MIGRATION (không có boot-ensure), migration chạy THỦ CÔNG (`run-migration-NNN.js`) → cần tạo migration + apply tay vào prod money DB. SQL sẵn: `CREATE EXTENSION IF NOT EXISTS pg_trgm; CREATE INDEX CONCURRENTLY idx_bh_content_trgm ON balance_history USING gin (content gin_trgm_ops);`
    - **KPI N+1** (fast-sale-orders:1899) — cần batch API trong kpi module + giữ dedup `client_event_id`, hot-path tạo PBH, số SP/đơn nhỏ → impact thấp.
    - **OFFSET→keyset** (fast_sale_orders, web2_customers list) — đổi contract API + frontend; đã thêm `id DESC` tie-break giảm page-drift, keyset đầy đủ để sau.

### [live-comments O3] Bỏ poller fetch comment → WS-live là nguồn DUY NHẤT (hết dòng trùng) ✅ + deploy Cloudflare worker (O7)

User: "bỏ poller đi luôn → liên quan message thì cứ WS live". O3 = poller ghi key `${postId}_${mid}` trùng dòng WS ghi `${convId}_${seq}` cùng 1 comment.

- **`web2-livestream-poller.js`**: `pollPostNow` + `pollNow` + `_doPollPost` → **NO-OP** (`{ran:false, disabled:'ws-live-only'}`). Không còn fetch+`upsertComments` → KHÔNG tạo dòng `postId_mid`. GIỮ: `reconcileFullText`/`reconcileRecentTruncated` (vá "…" của dòng WS, UPDATE tại chỗ — không tạo dòng mới), `listLivePostsForAssign` (liệt kê bài gom chiến dịch). `_cycle`/`_loop` vốn dead (không schedule) → để nguyên.
- **`/poll-now` route**: bỏ pollPostNow → gọi `reconcileRecentTruncated({hours:6})` (nút "poll now" giờ vá full-text, không dup).
- **2 caller degrade an toàn**: web2-customers tier-3 `pollNow()` no-op → đọc DB do WS đổ; comment realtime vào DB DUY NHẤT qua WS `/ingest`. `/bulk` (live-chat auto-save) là path riêng, không đụng.
- **O7 deploy**: `wrangler deploy` worker `chatomni-proxy` (version `ead1ae3c`) — header denylist LIVE. Verify SSRF guard `file://`→400, metadata IP→403.
- ✅ `node --check` poller + live-comments pass.

### [security/perf] Re-verify audit 09:10 + fix các mục còn lại (A3/O7/O2 + N+1 web2-returns) ✅

Re-verify audit `WEB2-FULL-REVIEW-20260620.md` (121 bug) vs code hiện tại (workflow 8 agent): **22/24 mục distinct ĐÃ fix** từ sáng (toàn bộ auth router, money-validate, idempotency, permission, XSS, FB token encrypt). Fix tiếp các mục còn lại user duyệt:

- **A3** `web2-fb-posts.js`: `/draft`+`/ad-entry` (POST+DELETE) `requireWeb2AuthSoft` → **`requireWeb2Admin`** (đồng bộ /connect/publish/delete).
- **O7** `cloudflare-worker/.../proxy-handler.js`: `/api/proxy?headers=` JSON merge thẳng → thêm **`PROXY_HEADER_DENYLIST`** (host/cookie/authorization/x-forwarded-_/cf-_/via/x-real-ip) chống relay credential + spoof IP. URL đã allowlist sẵn; header an toàn (accept/origin/referer/sec-\*/x-kas cho vnhub) vẫn cho. image-proxy không nhận ?headers= → không dính.
- **O2** `web2-zalo.js` + `web2-zalo-schema.js`: `/media/:id` IDOR — thêm cột `token` (36 hex bất khả đoán) + unique index; media MỚI trả URL `/media/<token>`; URL legacy numeric id **bắt buộc** `account_key` scope (bỏ param = 404) → hết enumerate BIGSERIAL.
- **S1**: KIỂM TRA lại → OA secret/token **ĐÃ mã hoá sẵn** ở `web2-zalo-oa.js:154-156` (encryptString khi write, decrypt khi read) — verifier nhầm vì chỉ soi schema/web2-zalo.js. **No-op.**
- **Perf N+1** `web2-returns.js _applyStock`: vòng `for` UPDATE từng item → **1 UPDATE batch** `FROM (VALUES …)` gom theo code (sign đồng nhất 1 chiều/lần gọi → kết quả y hệt). Đơn 30 dòng: 30 query → 1.
- **DEFER (báo user, việc lớn/rủi ro hơn, cần focus + test riêng)**: O3 (unify key live-comments — WS ghi/conv-update `convId_count` vs poller ghi/message `postId_mid`, khác granularity + WS thiếu message-id → đụng realtime core); N+1 KPI emit fast-sale-orders:1899 (cần batch API trong kpi module + giữ dedup client_event_id, hot path tạo PBH); ILIKE balance_history.content (bảng tiền, đụng matching SePay); OFFSET→keyset (đổi contract API + frontend).
- ✅ `node --check` 5 file backend + worker pass. Commits `c2693e8f5`(A3+O7), `9675bcc6c`(O2), `f81bac13c`(N+1).

### [render.com] Audit pagination/index toàn dự án (5 agent) + apply quick-win index ✅

Audit cursor pagination + index coverage toàn bộ Render (workflow 5 agent). Cursor/keyset ĐÃ dùng tốt: `web2_live_comments` `?sinceUpdated`, wallet reset `afterId`, zalo messages, Pancake conv list (frontend). Đa số list endpoint dùng OFFSET. Index đa số tốt; thiếu vài cái quan trọng → **apply quick-win** (CREATE INDEX IF NOT EXISTS, idempotent, tự chạy khi Render restart, đã verify cột tồn tại + `node --check` 5 file):

- `web2-live-comments.js` ensureTables: `idx_w2lc_updated ON web2_live_comments(updated_at)` — cột CURSOR delta-sync, bảng lớn nhất → payoff cao nhất.
- `web2-sepay-matching.js`: `idx_web2_bh_phone` (partial linked_customer_phone), `idx_web2_bh_unprocessed` (partial wallet_processed=FALSE), `idx_web2_bh_account_num`.
- `web2-pancake-refresh.js` ensureColumns: `idx_pancake_acc_active`, `idx_pancake_acc_last_used`, `idx_pancake_acc_auto_refresh` (partial) — bảng trước đây 0 index.
- One-line tie-break chống page-drift: `web2-customers.js` /list ORDER BY `+ id DESC` (63k rows), `notifications.js` ORDER BY `+ id DESC`.
- **Chưa làm (defer)**: chuyển OFFSET→keyset (fast_sale_orders, web2_customers list); fix N+1 (web2-returns stock loop, fast-sale KPI emit); ILIKE '%...%' trên balance_history.content. Đều là việc lớn hơn, ghi nhận để sau.

### [live-chat] chat.html: realtime cập nhật INCREMENTAL (hết "render lại nguyên cột gây rối") ✅

User: khi nhận tin mới từ KH, cột chat **render lại nguyên cột gây rối** (innerHTML rebuild → nhấp nháy, avatar reload, huỷ animation). Học cách chat app làm: **keyed reconcile** thay vì rebuild.

- **`pancake-conversation-list.js`**: tách `_computeFiltered()` (nguồn lọc chung) + `_detectNewIds()` + `_renderEmpty()`; `renderConversationList()` slim lại (full render — chỉ dùng khi đổi filter/search/load đầu). Thêm **`reconcileConversationList()`** (keyed theo `data-conv-id`): chèn dòng MỚI (animate `pk-conv-enter`), dời dòng có tin mới lên đúng vị trí (highlight `pk-conv-updated`), **patch nội dung tại chỗ** (preview/time/unread/active) qua `_patchConversationRow()` — KHÔNG đụng avatar → ảnh không reload, **TÁI DÙNG cùng 1 DOM element** (verify `sameElementReused=true`).
- **Wiring**: realtime (`pancake-realtime.js` `_scheduleListRefresh`) + `selectConversation` (click) + chat-window `markRead`/`onConversationUpdate` → gọi `reconcileConversationList()` thay `renderConversationList()`. Đổi filter/search vẫn full render.
- ✅ Verify Playwright: (a) conv cũ có tin mới → nhảy lên đầu, **cùng element**, có highlight, preview patched, row count ổn định; (b) conv MỚI → chèn top + `pk-conv-enter`, dòng kế **không bị đụng**, switch tab vẫn chạy; 0 console error. Bump `?v=20260620ls5`.

### [live-chat] chat.html: hiệu ứng "KH chat tới" (dòng trượt vào + glow avatar) ✅

User muốn hội thoại mới hiện hiệu ứng khi có KH chat tới (học hiệu ứng GitHub). Làm bằng CSS thuần (không thêm lib nặng — đúng web rule compositor-friendly: transform+opacity).

- **`pancake-conversation-list.js`**: thêm `_seenIds` (Set id hội thoại đã render). Mỗi lần `renderConversationList`, diff id mới so lần trước → hội thoại MỚI (KH vừa chat) nhận class `pk-conv-enter`. Bỏ qua render đầu + burst >8 (reload) để cả list không nhấp nháy. Diff theo `state.conversations` (KHÔNG theo filtered) → đổi tab không animate lại.
- **`pancake-chat.css`**: `@keyframes pkConvEnter` (trượt vào + fade + sáng xanh nhẹ) + `pkAvatarPing` (vòng glow quanh avatar) + cải tiến `pkConvUpdated` (KH nhắn tiếp nhảy lên đầu). Respect `prefers-reduced-motion`. Bump `?v=20260620ls4`.
- ✅ Verify Playwright: chèn hội thoại giả → row `pk-conv-enter`, `animationName=pkConvEnter`, avatar `::after`=`pkAvatarPing`.

### [web2/livestream-poller] FIX 2 lỗi (NOTIFICATION_CONFIG redeclare + 401 /stats,/poller-pages) + audit "trang còn cần không" ✅

User hỏi trang `web2/livestream-poller/index.html` có cần thiết không + liên quan trang nào; kèm console: `Uncaught SyntaxError: NOTIFICATION_CONFIG already declared` + `GET /stats 401` + `/poller-pages 401`.

- **Bug 1 (redeclare)**: trang include thủ công `notification-system.js?v=20260610` (line 146) TRONG KHI `web2-sidebar.js autoLoadSharedModules` đã tự nạp `notification-system.js?v=20260613a` → nạp 2 lần → `const NOTIFICATION_CONFIG` khai báo lại → SyntaxError (chặn cả script sau). Fix: **bỏ include thủ công** (sidebar lo).
- **Bug 2 (401)**: `loadStat()` + `loadPages()` dùng `fetch()` TRẦN không `x-web2-token` (route GET `/stats`,`/poller-pages` soft-gated `requireWeb2AuthSoft`), trong khi mutation (`_httpJson`) đã có token. Fix: route 2 GET qua `_httpJson`.
- **Audit kết luận (evidence backend)**: poller nền ĐÃ TẮT (`web2-livestream-poller.js:481` "background poll DISABLED, event-driven only"; `_loop` không schedule). Comment realtime giờ vào DB qua **WS relay → POST /ingest (WS-DIRECT)** — KHÔNG đọc `web2_live_poller_pages`. Bảng config (trang này sửa) chỉ còn được đọc bởi `listLivePostsForAssign()` + `pollNow()` (on-demand) + `_loop` (chết). ⇒ Trang = **admin cấu hình nguồn page + xem tổng comment (17.259)**, dùng hiếm (2 trang House/Store đã seed sẵn), KHÔNG điều khiển luồng thu realtime. Verdict: **GIỮ + đã fix** (không xoá vì còn là UI duy nhất quản `web2_live_poller_pages` + stat). Liên quan: sidebar "Lấy comment Live (poller)", overview, live-chat Live Comment (cùng kho `web2_live_comments`), route `web2-live-comments.js`, service `web2-livestream-poller.js`, picker chiến dịch cha (chat.html + native-orders).
- **Files**: `web2/livestream-poller/index.html` (bỏ include noti + 2 GET qua \_httpJson).
- ✅ Verify Playwright: stat "17.259 comment", 2 trang (House+Store) load, 0 lỗi NOTIFICATION_CONFIG, 0 console error.

### [live-chat + native-orders] Picker livestream: chọn CHIẾN DỊCH CHA hoặc BÀI LIVE (multi-select) + fix native-orders 401 chiến dịch cha ✅

User: (1) chat.html cho "chọn chiến dịch cha **hoặc như hình**" (ảnh: checklist bài live + "Hôm nay/Bỏ chọn" + badge House/Store); (2) `native-orders/index.html` **chưa load được chiến dịch cha** (console `GET /api/web2-live-comments/campaigns 401` + `/page-posts 401`).

- **chat.html — nâng picker** (`pancake-livestream-filter.js` viết lại): thay `<select>` đơn bằng **dropdown 2 mục**: `CHIẾN DỊCH CHA` (radio, `/campaigns`) **HOẶC** `BÀI LIVESTREAM` (checkbox đa chọn, `/posts` = 53 bài, badge Store/House theo `page_id`, count comment, nhãn `Live HH:mm DD-MM` vì `/posts` không có title) + nút **"Hôm nay"** (lọc bài `last_at` = hôm nay GMT+7) / **"Bỏ chọn"**. Loại trừ 2 chiều (chọn cha → bỏ bài; chọn bài → bỏ cha). Build commenter set: cha → `/?campaignId=`, bài → `/?postIds=`. Persist `{mode,campaignId,postIds}` localStorage. SSE `web2:live-comments` debounce 4s refetch. Fix z-index dropdown (`--pkr-z-dropdown` 400 > sticky 100 → search box hết đè).
- **native-orders FIX 401**: 6 fetch `web2-live-comments` (`/campaigns`,`/posts`,`/page-posts`,`POST /campaigns`,`/assign`,`/unassign`) THIẾU `x-web2-token` → 401 (route soft-gated) → "Chưa có chiến dịch cha". Thêm helper `NO._liveCommentsHeaders()` (Web2Auth.authHeaders / fallback localStorage web2_auth) cho cả 6. Cùng regression đã fix cho live-chat 19/06. Bump `native-orders-filters-campaigns.js?v=20260620lc`. (⚠ `/page-posts` vẫn trả 0 bài trên web2-api — tech-debt riêng, ngoài scope.)
- **Files**: `live-chat/js/pancake/pancake-livestream-filter.js` (viết lại), `live-chat/css/pancake-chat.css` (dropdown/section/row/badge/mini), `live-chat/chat.html` (bump `?v=20260620ls3`), `native-orders/js/native-orders-filters-campaigns.js`, `native-orders/index.html`.
- ✅ Verify Playwright (localhost, web2 admin): native-orders 2 chiến dịch cha load (hết 401). chat.html dropdown 2 radio cha + 53 checkbox bài (badge Store/House, sort mới→cũ); "Hôm nay" → 5 bài → 399 khách → Livestream 63 + Inbox 9 = 72; chọn cha "10/06…" → posts cleared, 149 khách (loại trừ 2 chiều OK); 0 console error. Screenshot xác nhận layout sạch.

### [live-chat] Chat Pancake (`chat.html`): tab Comment→Livestream theo chiến dịch + sub-filter tin nhắn/bình luận + fix overlap ✅

User (ảnh `live-chat/chat.html`): (1) fix giao diện 2 hàng tab bị đè (gear ⚙ đè "Lưu Live"); (2) đổi tab **Comment → Livestream** + đổi chức năng; (3) cho **chọn chiến dịch** như `index.html` → lấy danh sách khách comment → đưa người đó (cả comment + inbox) vào tab **Livestream**; (4) người KHÔNG trong danh sách → tab **Inbox**; (5) bỏ tab **Lưu Live** → còn 3 tab; (6) thêm **filter tin nhắn / bình luận** ở mọi tab.

- **Module mới** `js/pancake/pancake-livestream-filter.js` (`window.PancakeLivestreamFilter`): thanh chọn chiến dịch (render vào `#pkLivestreamBar`) → `GET /api/web2-live-comments/campaigns` + `/?campaignId=X&limit=5000` (gắn `x-web2-token` qua `Web2Auth.authHeaders`) → build Set `fbIds`+`phones` (dedupe commenter). `isLivestreamConv(conv)` đối chiếu `from.id/from_psid/customer.psid/id/fb_id` + SĐT chuẩn hoá. Lưu chiến dịch chọn vào `localStorage` (sống qua reload). **SSE** `web2:live-comments` debounce 4s → refetch set khi live chạy (realtime, KHÔNG poller).
- **Tab filter (theo NGƯỜI)** `pancake-conversation-list.js`: `livestream` = `isLivestreamConv` true; `inbox` = false (người không trong chiến dịch); `all` = tất cả. **Sub-filter (loại hội thoại, mọi tab)** `typeFilter`: `message`=INBOX / `comment`=COMMENT / `all`. Áp sub-filter TRƯỚC tab. Empty-state Livestream khi chưa chọn chiến dịch → hướng dẫn.
- **Shell** `pancake-init.js` `_renderShell`: 3 tab `Tất cả|Inbox|Livestream` + `#pkLivestreamBar` (trên) + hàng `.pk-subfilter` (Tất cả/Tin nhắn/Bình luận). Wiring dùng `closest()` (tab Livestream có `<i>`) + `applyTypeFilter`. `pancake-state.js`: `activeFilter` thêm `livestream`, bỏ `comment/live-saved`; thêm `typeFilter`.
- **Fix overlap (#1)**: tabs cuộn trong `.pk-filter-tabs-scroll` riêng (flex:1, overflow-x), nút gear `.pk-filter-gear` ghim phải `flex:0 0 auto` → hết đè (trước: 4 tab + gear `margin-left:auto` tràn 339px). CSS bar/subfilter thêm vào `pancake-chat.css`.
- **Files**: `js/pancake/pancake-livestream-filter.js` (mới), `js/pancake/pancake-state.js`, `js/pancake/pancake-conversation-list.js`, `js/pancake/pancake-init.js`, `css/pancake-chat.css`, `chat.html` (+script + bump `?v=20260620ls`).
- ✅ Verify Playwright (localhost, web2 admin): 3 tab `["Tất cả","Inbox","Livestream"]` + sub-filter `["Tất cả","Tin nhắn","Bình luận"]`; gear `gearOverlapsTabs:false`; chọn chiến dịch "10/06/2026…(156)" → 149 fbId + 10 SĐT, bar "149 khách"; partition CHÍNH XÁC: Livestream 7 + Inbox 69 = Tất cả 76; sub-filter Bình luận 61 + Tin nhắn 15 = 76. 0 console error, 0 page error. Screenshot xác nhận layout sạch, không đè.

### [printer-settings/vieneu-tts] FIX file cài giọng lỗi PowerShell "Unexpected token '}'" @line 48 ✅

User: trang `web2/printer-settings/` → tải `cai-may-pos.bat` → cài Print Bridge OK nhưng **VieNeu + OmniVoice fail**: `engine-setup.ps1:48 char:1 + } Unexpected token '}' in expression or statement.`

- **Root cause**: `vieneu-tts/vieneu-windows-setup.ps1` (file mà bat tải về thành `engine-setup.ps1`) có **em-dash `—` (U+2014) NẰM TRONG string literal** ở line 30 + 45 (`Write-Host "... Khong tai duoc file — bo qua."` / `"... Da cai Python — CHAY LAI ..."`). File serve **UTF-8 KHÔNG BOM** → Windows PowerShell 5.1 đọc theo ANSI codepage → 3 byte em-dash decode thành rác chứa ký tự giống dấu nháy → vỡ chuỗi → lệch ngoặc → báo `}` thừa ở line 48 (ngoặc kế tiếp sau chỗ hỏng). Mọi `Write-Host` khác trong file đã cố ý né dấu tiếng Việt; 2 em-dash này lọt. `scripts/print-bridge.ps1` không có non-ASCII ngoài comment → cài OK.
- **Fix**: (1) đổi 2 em-dash trong string literal → ASCII `-` (code lines giờ thuần ASCII, độc lập encoding). (2) Thêm **UTF-8 BOM** (`EF BB BF`) → PowerShell đọc đúng UTF-8 tuyệt đối + comment tiếng Việt decode đúng + chống tái phát nếu sau này lỡ thêm tiếng Việt vào string. Comment lines 1-5 còn tiếng Việt nhưng `#` an toàn mọi encoding.
- **Files**: `vieneu-tts/vieneu-windows-setup.ps1` (2 string literal + BOM).
- ✅ Verify: brace/paren balance 0/0; grep non-ASCII ngoài comment = rỗng. bat tự re-download `%VPS1%` mỗi lần chạy → chạy lại bat là lấy file đã sửa (không cần gỡ thủ công).

### [native-orders] Đơn Inbox: "Gán FB khác" — gán lại Facebook đúng nếu auto-dò nhầm ✅

User: "Cho gán lại facebook khác nếu nhầm" — sau khi chọn KH từ kho, hệ thống tự dò hội thoại Pancake theo SĐT có thể gắn nhầm Facebook (nhiều profile cùng SĐT). Thêm nút **"Gán FB khác"** trong chip "KH đã chọn" → mở panel tìm hội thoại Pancake (CHỈ Pancake) → chọn đúng FB → re-bind, **GIỮ NGUYÊN tên + SĐT** đơn (chỉ bù field rỗng).

- **Files**: `native-orders/js/native-orders-inbox-add.js` (panel `#noAddFbRebind` + input/suggest, `openFbRebind/closeFbRebind`, pick handler set `selectedFbId/PageId/ConvId/UserName/AvatarUrl` + `selToken++` huỷ background resolve cũ; chip thêm nút `.no-add-selected-rebind`), `web2/shared/web2-base.css` (`.no-add-selected-actions/-rebind`, `.no-add-fb-rebind*`). Bump `?v=20260620b` ở index.html.
- ✅ Verify Playwright (localhost web2 admin): chọn "Huỳnh Thành Đạt/0908123456" → auto-bind page …390370; bấm "Gán FB khác" → panel prefill SĐT + focus → tìm "huynh thanh dat" → 3 hội thoại Pancake (đều avatar, page khác nhau …364524/…086607/…390370) → chọn page …364524 → fbStatus đổi sang page …364524, name/phone GIỮ NGUYÊN, panel đóng, toast "Đã gán lại Facebook", 0 console error. Screenshot xác nhận.

### [native-orders] Đơn Inbox: admin xoá đơn rỗng + avatar Facebook trong ô tìm KH ✅

User (ảnh modal "Thêm đơn Inbox"): (1) admin được quyền xoá đơn inbox trạng thái nháp/huỷ + giỏ trống; (2) ô nhập KH hiện avatar/tên/thông tin Facebook theo Pancake để chọn, cho tìm lại nếu nhầm KH.

- **Files**: `native-orders/js/native-orders-state.js` (+`NO.isAdmin()` mirror web2-sidebar `_isAdmin`: Web2Auth role → fallback loginindex_auth/userType), `native-orders/js/native-orders-render.js` (nút 🗑 `web2-btn-danger` ở col-actions, gate `channel==='web2_inbox' && status∈{draft,cancelled} && giỏ rỗng && isAdmin()` → gọi `removeOrder()` có sẵn confirm), `native-orders/js/native-orders-inbox-add.js` (avatar trong suggestion kho KH + Pancake; chip "KH đã chọn" avatar+tên+nguồn + nút "Đổi khách" clear+focus tìm lại), `web2/shared/web2-base.css` (`.no-add-av*`, `.no-add-suggest-flex/main/line`, `.no-add-selected*`). Bump `?v=20260620a` ở index.html.
- Backend DELETE `/api/native-orders/:code` đã có sẵn (chặn nếu còn PBH liên kết) — không sửa server. removeOrder() đã có confirm + cập nhật state + SSE `_notify('delete')`.
- ✅ Verify Playwright (localhost, login web2 admin): Inbox tab 3 đơn draft+rỗng → 3 nút xoá; click → confirm "Xóa đơn NJ-…?" → "Xoá đơn" → 3→2 đơn, 0 console error. Gate: nhồi SP vào 1 đơn → nút xoá 2→1; tab Livestream → 0 nút xoá. Modal tìm "01234" → 8 kết quả đều có avatar (FB thật cho KH có fb_id, vòng tròn chữ cái cho KH không có); chọn → chip avatar+tên+"nhắn tin được"+"Đổi khách"; "Đổi khách" → clear chip + focus lại ô tìm. Screenshot xác nhận avatar FB load thật.

### [live-chat] FIX regression: load comment từ DB thiếu x-web2-token → "Chưa có comment nào" (0 comment) ✅

User báo `live-chat/index.html`: "không thấy comment", console `401` + `[Live-INIT] Loaded 0 comments (DB) from 4 campaigns`. Nguyên nhân: commit `40ec6ff2a` gate GET read endpoints `web2-live-comments` (`requireWeb2AuthSoft`, chống PII leak), nhưng fetch DB comments trong `live-init-wiring.js` (nguồn comment chính) chỉ gửi `{ signal }`, **KHÔNG** `x-web2-token` → backend 401 → 0 comment. (Campaigns load OK vì fetch ở `live-init-lifecycle.js` đã có `_w2AuthHeaders` → log đúng "4 campaigns".)

- Fix: fetch `GET /api/web2-live-comments?postIds=…` thêm `headers: window.LiveColumnManager._w2AuthHeaders()` (đúng pattern shared dùng khắp live-chat). Bump `live-init-wiring.js?v=20260620f` ở index.html.
- Audit các fetch gated khác (`/saved/ids`, `/saved`, `/bulk`, `/posts`, `/page-posts`, `/{q}`) — đều ĐÃ có `Web2Auth.authHeaders()`/`_w2AuthHeaders`. `live-init-wiring.js` là fetch DUY NHẤT sót → 1 chỗ fix đủ.
- ✅ Verify: `curl GET /api/web2-live-comments` (no token) → 401 (confirm gate). Fix gắn token → request đi đúng.

### [web2/shared] Fix picker không load SP nếu chưa vào Kho SP + promote API client lên shared ✅

User: "fb-posts phải vào trang Kho SP trước nó mới load danh sách SP, còn chưa vào thì 'Không tìm thấy SP'". Gốc rễ: `Web2ProductsCache` (shared) cần `Web2ProductsApi` để fetch, nhưng API client lại nằm **page-local** `web2/products/js/web2-products-api.js` → 4 trang load cache mà KHÔNG load API (fb-posts, product-card, photo-editor, video-maker) chỉ chạy được khi IDB persist đã được Kho SP ghi sẵn.

- **`git mv web2/products/js/web2-products-api.js → web2/shared/web2-products-api.js`** (cache đã shared thì API client cũng phải shared — 1 nguồn). Repoint 4 trang cross-import (products, purchase-refund, supplier-wallet, so-order) sang `../shared/web2-products-api.js`.
- **Self-heal trong `web2-products-cache.js`**: `_loadList()` gọi `_ensureApiLoaded()` — nếu `Web2ProductsApi` thiếu, cache TỰ inject `web2-products-api.js` (resolve qua `document.currentScript.src` của chính cache) rồi mới fetch. → **Trang mới chỉ cần load cache là chạy, khỏi sửa từng HTML.**
- Bump `web2-products-cache.js?v=20260620a` ở 8 trang.
- ✅ Verify Playwright cold start: xóa IDB → vào THẲNG fb-posts (không qua Kho SP) → mở picker → API tự nạp (`apiScriptInDom:true`), fetch 43 SP từ worker, render 43 dòng list. Screenshot SP thật đủ ảnh/tên/mã/giá.

### [web2/shared] Picker SP — đổi lưới ảnh → DANH SÁCH (ảnh + tên + mã + giá) ✅

User: "xem sản phẩm theo danh sách hình ảnh, tên, giá". Picker chọn SP từ Kho (modal "Chọn sản phẩm cho bài đăng" ở Đăng bài FB) trước hiển thị lưới ảnh card → tên/giá nhỏ khó nhìn. Đổi sang dạng **danh sách dọc, mỗi dòng = thumbnail vuông 52px + tên (đậm) + mã (xám nhỏ) + giá (xanh, canh phải) + tick chọn**.

- **`web2/shared/web2-product-picker.js`**: `[data-list]` `grid` → `flex column`; `cellHtml` → `rowHtml` (layout dòng); thêm `applyRowState(el,on)` cập nhật RIÊNG 1 dòng khi toggle (border/bg/tick) thay vì vẽ lại cả list → **giữ vị trí cuộn** khi chọn nhiều.
- Bump `web2-product-picker.js?v=20260620a` ở `web2/fb-posts/index.html`.
- ✅ Verify Playwright: seed 3 SP ảo → list `display:flex`, 3 dòng render đủ ảnh/📦 + tên + mã + giá; toggle multi → count "Đã chọn 1" + tick xanh + border xanh #0068ff. Screenshot duyệt layout.

### [web2/reconcile] FIX regression: client reconcile thiếu x-web2-token → "Cần đăng nhập Web 2.0" ✅

User báo: `web2/reconcile/index.html` đăng nhập admin vẫn lỗi "Lỗi tải DS PBH: Cần đăng nhập Web 2.0 (thiếu/sai token)". Nguyên nhân: audit trước tôi gate `reconcile.js` (`router.use(requireWeb2AuthSoft)` #43) nhưng `reconcile-state.js api()` chỉ gửi `Content-Type`, KHÔNG `x-web2-token` → backend 401.

- Fix: `api()` thêm `...((window.Web2Auth && Web2Auth.authHeaders()) || {})`. Mọi call reconcile qua RC.api (chỉ reconcile-state.js có fetch) → 1 chỗ fix đủ. Bump `?v=20260620auth`.
- Audit lan rộng: các route khác đã gate (products/variants/returns/purchase-refund/supplier-wallet/jt-tracking/msg-send/ai-script/fb-posts/zalo) — client đều có shared authHeaders (grep file-level confirm). reconcile là NGOẠI LỆ vì có api() helper riêng.

## 2026-06-20

### [live-chat/security] Gate API live-comments read endpoints (đóng nốt PII leak) ✅

Sau khi Pages deploy CLIENT (guard + x-web2-token — verify prod đã có), gate 5 endpoint ĐỌC của `render.com/routes/web2-live-comments.js` bằng `requireWeb2AuthSoft` (WEB2_AUTH_ENFORCE=1 → 401 nếu thiếu token):

- `GET /` (comment + fb_id/tên/SĐT khách = PII), `GET /campaigns`, `GET /posts`, `GET /page-posts`, `GET /saved/ids`.
- Đã verify MỌI caller gửi token trước khi gate: `live-comments-stream.js`+`comments-mobile-actions.js`+`pancake-api.js` (đã sửa, commit trước) + `live-campaign-manager.js _api` (đã có `_w2AuthHeaders`). Desktop live-chat có web2-auth.js sẵn.
- Thứ tự deploy an toàn: client (Pages) TRƯỚC → backend (Render) SAU → user hợp lệ không 401 (trang mở cũ cần reload lấy JS mới).
- node --check PASS. Cần Render deploy web2-api để có hiệu lực.

## 2026-06-20

### [live-chat/security] comments-mobile.html lộ comment khách khi ẩn danh — fix CLIENT (guard + token) ✅

User: vào `nhijudy.store/live-chat/comments-mobile.html` ở trình duyệt ẩn danh KHÔNG cần đăng nhập vẫn xem được. Trang static (Pages) không chặn HTML được, nhưng nó load DATA comment (fb_id/tên/SĐT khách = PII) từ API KHÔNG auth.

**Nguyên nhân**: comments-mobile.html (a) KHÔNG load web2-auth.js → không có guard redirect login; (b) fetch live-comments `credentials:'omit'`, KHÔNG gửi x-web2-token; (c) backend GET `/`, `/posts`, `/page-posts`, `/campaigns`, `/saved/ids` KHÔNG gate.

**Fix CLIENT (commit này)**:

- comments-mobile.html: inline AUTH GUARD ở <head> (chưa có `web2_auth.token` → `location.replace('../web2/login?next=')`) + load `web2-auth.js`.
- Mọi fetch read live-comments gửi `Web2Auth.authHeaders()` (x-web2-token): `live-comments-stream.js` (GET /, dùng chung desktop+mobile), `comments-mobile-actions.js` (posts/page-posts/search), `pancake-api.js` (saved/ids).
- Desktop live-chat đã có web2-auth.js sẵn → authHeaders chạy luôn. Bump `?v=20260620auth`.
- **Fix BACKEND (gate GET read endpoints) ở commit kế** — sau khi Pages deploy client để không 401 user hợp lệ.

## 2026-06-20

### [web2/multi-tool] Tăng comment nền: XONG TỰ DỌN comment đã tăng khỏi live-chat ✅

User: "Xong phải chạy dọn comment đã tăng" (job nền tự dọn như nút "Dọn comment đã tăng").

- **`render.com/routes/web2-live-comments.js`**: tách core `boost-mark` thành hàm export `markBoostAndPurge(pool, ids, ttlMs)` (mark conv → /ingest bỏ qua TTL 20' + XOÁ comment đã ingest `id = cid OR starts_with(id, cid||'_')` + SSE `reconcile`). Route `/boost-mark` gọi lại hàm này.
- **`render.com/services/web2-comment-boost-worker.js`**: worker gom `boostedIds` = `${post_id}_${reply_id}` của mỗi comment boost (từ `res.id`), gọi `_cleanupBoosted` (in-process `markBoostAndPurge`) **3 nơi**: đầu job (mark conv + purge spam cũ), sau MỖI vòng, và CUỐI job (đợi 3s cho comment cuối kịp ingest rồi mark+purge toàn bộ). → live-chat không hiện comment tăng. Giống foreground markBoost/markBoostIds.
- Frontend: help job card thêm "Xong tự dọn comment đã tăng khỏi live-chat". `?v=20260620bg3`.

### [index/login] Fix nối tiếp: login.js không copy previousNames vào loginindex_auth ✅

User: đăng nhập phuoc/phuoc2109 vẫn không hiện data (xác nhận "Phước"="Phước đẹp trai").

- **Gốc**: backend JWT + `user` response ĐÃ có `previousNames` (verify: login phuoc → JWT payload `previousNames:["Phước đẹp trai"]`), NHƯNG `index/login.js` dựng `loginindex_auth` bằng **field-list tường minh** → bỏ sót `previousNames`. `SoquyPermissions.isMine` đọc `auth.previousNames` = undefined → alias không khớp → phuoc thấy 0 voucher cũ.
- **Fix**: thêm `previousNames: user.previousNames || []` vào CẢ 2 block authData (login thường line 91 + verify 2FA line 491). node --check PASS.
- **phuoc cần đăng nhập lại 1 lần nữa** (auth đang lưu vẫn thiếu previousNames) → sau đó thấy đủ 1071 voucher.

### [web2/zalo] Chip nhóm: báo "Cần đăng nhập TK trong nhóm" khi không gửi được ✅

User: nhóm J&T mà không có quyền (TK của nhóm đã xoá/chưa kết nối) thì ghi rõ cần đăng nhập TK Zalo CÓ TRONG nhóm.

- `chat-view.js` `_fillAccChip`: thêm `meta.connected` + check `conv.thread_type==='group'`. NHÓM mà TK đã xoá HOẶC chưa kết nối → chip **"⚠ Cần đăng nhập TK trong nhóm"** (cam) + tooltip giải thích Zalo chỉ cho gửi nhóm bằng tài khoản LÀ THÀNH VIÊN → phải đăng nhập 1 TK có trong nhóm này.
- Nhóm có TK kết nối → "[tên] · nhóm" (xanh, bình thường, không cảnh báo). 1-1 TK đã xoá → "TK Zalo không còn" (muted, giữ như cũ). 1-1 TK phụ → cam.
- Bump `ENGINE_VER=20260620grpmsg` + `web2-zalo.js?v=…acc5` (4 page). node --check PASS.

## 2026-06-20

### [web2/multi-tool] Tăng comment nền: LIVE TEST PASS (Nhi Judy House 97→117) + tuning re-check ✅

Nối tiếp feature "chạy nền server" (commit bedcfb08a). Deploy Render web2-api xong → test thật + fix.

- **Live test PASS** (Nhi Judy House, post livestream `..._2080575446230098`): tạo job addTarget=10 → server chụp baseline=97, target=107. Worker: vòng 1 gửi 10 (count Pancake còn trễ = 97 < 107) → tự chạy vòng 2 gửi 10 → re-check count=111 ≥ 107 → **done "Đạt 111/107"**. Verify độc lập Pancake: `comment_count` 97 → **117**. Đúng spec "check lại phải hơn, ít hơn thì chạy lại".
- **Bug fix (correctness)** `f59ae9d5e`: Pancake conversations API lọc `post_id` KHÔNG chặt — trả cả conv của bài KHÁC (bài photo `updated_at` mới hơn) → auto-select-by-newest nhắm SAI bài. Thêm lọc chặt `conv.post_id === selectedPost.id` (fallback nếu format khác). Fix cả tool foreground. (60 conv lọc post X → chỉ 49 thực sự thuộc X.)
- **Tuning over-send**: `RECHECK_DELAY_MS` 7s→30s. comment_count FB/Pancake trễ ~20-40s → re-check sớm thấy count cũ → chạy thừa vòng (test gửi 20 cho target 10). 30s cho count đuổi kịp rồi mới tính deficit → giảm over-send (vẫn đảm bảo ≥ target).
- Files: `render.com/services/web2-comment-boost-worker.js` (RECHECK_DELAY + bỏ dead `_getJob`), `web2/multi-tool/js/multi-tool.js` (lọc conv post_id) `?v=20260620bg2`.

### [web2/zalo] Phase 3 — gửi tin 1-1 ưu tiên TK cookie (wire vào send) ✅ code

Nối tiếp Phase 1+2. Wire `getCookieAccountKey()` vào path gửi 1-1:

- **Backend** `render.com/routes/web2-zalo.js`: `/conversation/:phone?account=<key>` + `/conversation/ensure {accountKey}` → resolve/tạo hội thoại dưới TK truyền vào (TK cookie); không truyền → TK CHÍNH (is_primary) như cũ. Safe-by-fallback.
- **Client** `web2-zalo.js`: `getConversation(phone, accountKey)` thêm `?account=`; `mountChat(opts.preferAccountKey)` truyền vào getConversation + ensure body.
- **Web2CustomerChat** `mountZalo`: chat 1-1 (theo SĐT) → `await Web2Zalo.getCookieAccountKey()` → preferAccountKey. Nhóm (mở theo convId) KHÔNG override (giữ TK nhóm).
- Verified client (Phase 1+2): ext trả uid 852368 (My Njd), getCookieAccountKey→zca_5aa5d9c5 (My Njd), không tạo trùng. zaloUid là string (không lỗi BIGINT precision).
- Bump `web2-zalo.js?v=…acc4` + `web2-customer-chat.js?v=20260620cookieacc` (4 page). node --check PASS 3 file.
- ⏳ Cần Render deploy (backend) mới test end-to-end. Nhóm jt-tracking (TK relay đã xoá) = follow-up riêng.

## 2026-06-20

### [web2/zalo + extension] Nền tảng "ưu tiên TK cookie để gửi tin" — Phase 1+2 (chưa wire) 🚧

User chốt: gửi tin Zalo ưu tiên TK đang đăng nhập chat.zalo.me (cookie), áp dụng cả 1-1 lẫn nhóm; TK chưa kết nối → tự cookie-login.

- **Phase 1 — Extension đưa ra uid** (cần để biết TK nào đang ở chat.zalo.me): content script `zalo-creds.js` đọc thêm `sh_zlast_uid`/`sh_user_ids` → `GET_ZALO_CREDS` (service-worker) trả `uid`. Bump manifest `1.0.27→1.0.28` (CWS auto-publish). node --check PASS.
- **Phase 2 — Client helper `Web2Zalo.getCookieAccountKey()`**: GET_ZALO_CREDS→uid → match account web2 đang kết nối (theo zalo_uid) → chưa kết nối: reconnect slot cũ / tạo slot mới + cookie-login (autoLogin). Cache 30s. Không ext/cookie/uid → null (caller fallback TK chính). **CHƯA wire vào send path → inert, không đổi hành vi.** Bump `web2-zalo.js?v=…acc3` (4 page).
- **Phase 3 (CHƯA làm)**: wire vào resolve hội thoại 1-1 (`/conversation/:phone?account=`) + nhóm (dùng conv của TK cookie nếu là thành viên) + chip phản ánh TK thực gửi. = phần ĐỔI HÀNH VI gửi tin khách → cần live-test với chat.zalo.me đang đăng nhập.
- ⚠ Live-test bị chặn: browser test restart đã mất phiên chat.zalo.me (cần user quét QR lại). Safe-by-fallback: khi không có cookie → vẫn dùng TK chính như cũ.

## 2026-06-20

### [web2/multi-tool] Tăng comment CHẠY NỀN trên server + re-check tới >= target ✅

User: "Cho chạy background trên server được không? Lúc chạy lấy số comment của bài (vd 362), user chọn 700 → chạy nền, xong check lại phải > 1062; nếu ít hơn thì chạy lại tới >= 1062."

- **Mới — Server (web2-api)**:
    - [`render.com/services/web2-comment-boost-worker.js`](render.com/services/web2-comment-boost-worker.js) — worker nền: lấy TẤT CẢ JWT account admin của page (`pancake_accounts` chatDb), đọc `comment_count` THẬT của bài (`pancake.vn/api/v1/pages/{id}/posts` → field `comment_count`), đăng `reply_comment` (giống 100% trang Tăng comment) work-stealing nhiều account + delay/account + rate-limit guard. Sau mỗi vòng RE-CHECK count; `count < target` → chạy tiếp tới `>= target`. Safety: MAX_ROUNDS=40, cap tổng gửi = add×3+50, backoff 60s khi FB rate-limit (3 vòng liên tiếp → dừng), dừng nếu không đọc được count 4 lần.
    - [`render.com/routes/web2-comment-boost.js`](render.com/routes/web2-comment-boost.js) — bảng `web2_comment_boost_jobs` (web2Db). `POST /create` chụp baseline=comment_count hiện tại → `target = baseline + addTarget`, lưu job pending; `GET /jobs`, `GET /job/:id`, `POST /job/:id/stop`. SSE topic `web2:comment-boost`. Auth `requireWeb2AuthSoft`.
    - [`render.com/server.js`](render.com/server.js) — mount `/api/web2-comment-boost` + ensureSchema + initializeNotifiers; start worker trong block `!DISABLE_WEB2_JOBS` (cạnh livestream-poller). `/api/web2-*` auto-route web2-api qua worker (không sửa Cloudflare).
- **Frontend** [`web2/multi-tool/`](web2/multi-tool/index.html): hiện "Bài đang chọn có X comment" (từ `comment_count`), đổi label "Số lượng"→"Số comment muốn thêm", nút **"Chạy nền trên server"** (`boostBg`→POST /create) bên cạnh "Chạy trong tab" (foreground cũ giữ nguyên), panel job realtime (SSE `web2:comment-boost`) hiện baseline→target + progress + sent/rounds + nút Dừng. Load `web2-sse-bridge.js`. Bump `multi-tool.js?v=20260620bg1`.
- **Feasibility verified (browser probe Pancake)**: post NhiJudy Store có field `comment_count` (vd VOD mới nhất = 1027); `getPageAccountJwts` = 6 account. node --check PASS toàn bộ. ⏳ Cần deploy Render web2-api để worker + route sống (test end-to-end sau deploy).

### [web2/zalo] Chip TK Zalo: LUÔN hiện (fallback "TK Zalo không còn" khi account orphaned) ✅

User báo chip không hiện ở khung chat nhóm jt-tracking. Chẩn đoán live: code mới (chat-view.js 20260620zaloacc) ĐÃ load + header render, nhưng nhóm "XỬ LÝ NJD - J&T" có `account_key=zca_55477969` KHÔNG còn trong status() (= My Njd CŨ đã xoá tay) → `_fillAccChip` không match → tự gỡ chip → user thấy trống.

- Fix: thay vì `chip.remove()` khi không resolve được account, hiện cảnh báo muted xám **"TK Zalo không còn"** + title chỉ rõ key tail + gợi ý đăng nhập lại. → Chip LUÔN hiện (đúng ý "luôn thấy account đang dùng").
- Bump `ENGINE_VER=20260620zaloacc2` + `web2-zalo.js?v=` 4 page.
- **Verified live**: nhóm orphaned → chip "TK Zalo không còn" (xám rgb(156,163,175)); 1-1 primary vẫn "Nhijudy Ơi · TK chính". node --check PASS.
- ⚠ Ngụ ý data: nhóm nguồn jt-tracking đang gắn TK relay đã xoá → có thể không gửi được; nên re-link nhóm sang TK hiện có (việc riêng).

## 2026-06-20

### [soquy + users + navigation] Fix mất data Sổ Quỹ khi account đổi tên (phuoc) + tắt tự đổi tên ✅

User: account **phuoc** hồi trước đổi tên (`Phước đẹp trai` → `Phước`) nên Sổ Quỹ hiển thị thiếu data; "lấy theo userType" + "tắt luôn chức năng đổi tên ở navigation modern".

- **Gốc bug**: voucher `soquy_vouchers` lưu `createdBy` = **displayName** (chuỗi đổi được). Non-admin không có `view_all_transactions` chỉ thấy voucher `createdBy === displayName` hiện tại. Đổi tên → 1070 voucher cũ (`createdBy="Phước đẹp trai"`) biến mất, chỉ còn 1 voucher tên mới. Dữ liệu live xác nhận: 1070 "Phước đẹp trai" + 1 "Phước", **không có** account "Phước đẹp trai" khác → chắc chắn là phuoc. Voucher KHÔNG hề lưu id account (`createdByUsername`/`userType` = 0).
- **Hướng fix (user chọn)**: alias-map, **KHÔNG ghi đè 1070 voucher prod**. Khớp owner theo **account ổn định** (username), legacy khớp theo display-name + alias.
- **Backend `render.com/routes/users.js`**: thêm cột `previous_names JSONB DEFAULT '[]'` (idempotent `ensurePreviousNamesColumn`, chạy 1 lần/process ở login/GET/PUT). `generateToken` + `formatUser` trả `previousNames`. `PUT /:username`: khi đổi tên → tự lưu tên cũ vào `previous_names` (admin rename cũng track); nhận `previousNames` tường minh để seed. `PUT /me/display-name` → **403 (disabled)**.
- **Frontend `soquy`**: `createVoucher` lưu thêm `createdByUsername` + `createdByUserId` (voucher mới, immune rename). `SoquyPermissions.isMine(voucher)` = khớp `createdByUsername===username` HOẶC `createdBy ∈ {displayName, ...previousNames}`; `filterByCreator` + `calculateOpeningBalance` dùng `isMine`. (Display vẫn dùng `createdBy` cho cột Người tạo.)
- **Tắt tự đổi tên `shared/js/navigation-modern.js`**: flag `enableDisplayNameEdit=false` → ẩn nút bút chì "Chỉnh sửa tên hiển thị" (desktop + mobile), `showEditDisplayNameModal` early-return. Admin vẫn đổi tên qua user-management (giờ giữ alias).
- **Seed phuoc**: sau deploy, PUT phuoc với `previousNames=["Phước đẹp trai"]` (giữ nguyên displayName/permissions). phuoc **phải đăng xuất + đăng nhập lại** để token mang previousNames → thấy đủ 1071 voucher.
- node --check PASS cả 4 file. Logic `isMine` test 7 case PASS (legacy/post-rename/brand-new/other × token cũ/mới).

### [web2/multi-tool] Tăng comment: giãn nhịp mặc định + tối thiểu 1 giây, 6 account chạy độc lập ✅

User: "Cho mặc định và thấp nhất là 1 giây → với 6 account Pancake chạy độc lập với nhau → account nào xong rồi cứ chạy tiếp".

- **Files**: `web2/multi-tool/index.html` (input `boostDelay` `value=1` `min=1` `step=0.5`, label "tối thiểu 1", hint "= 1000 ms", help text nêu rõ chạy song song nhiều account độc lập), `web2/multi-tool/js/multi-tool.js` (`run()` clamp `Math.max(1, … || 1)` + `updateHint` clamp `Math.max(1, … || 1)`). Bump `multi-tool.js?v=20260620d1s`.
- **6 account độc lập, work-stealing đã có sẵn**: `run()` đã chạy 1 worker / account (`W.getPageAccountJwts(pageId)` → `Promise.all`), mỗi worker tự `nextIdx()` từ counter `claimed` chung + `sleep(delay)` riêng → account nào gửi xong câu trước thì claim câu kế ngay, không chờ nhau. Không đổi kiến trúc, chỉ làm rõ behavior ở help text.
- **Verified live (browser test)**: page tự chọn "NhiJudy Store", delay `1` / min `1` / hint "= 1000 ms", `getPageAccountJwts` trả **6 account** (Con Nhoc, Thu Lai, Thu Huyền, Huyền Nhi, Kỹ Thuật NJD, longxienc) → 6 luồng song song. node --check PASS.

### [web2/multi-tool] Tăng comment: tự mặc định page "NhiJudy Store" → bài mới nhất ✅

User: "Để mặc định page Nhijudy Store → chọn bài mới nhất → để mặc định 1.5 giây" (trang Tăng số lượng comment).

- **File**: `web2/multi-tool/js/multi-tool.js` (`loadPages`) — sau khi dựng `<option>` page, tìm page có tên chuẩn hoá (`lowercase` + bỏ dấu cách) === `nhijudystore` (fallback `includes`), `sel.value = id` rồi gọi `loadPosts()`. `loadPosts()` đã tự `psel.value='0'` (ĐANG live → mới nhất) + `loadConvs()` (hội thoại mới nhất). Bump `multi-tool.js?v=20260620def`.
- Delay mặc định **1.5 giây** giữ nguyên (HTML `value="1.5"`, min 0.5) — không đụng.
- **Verified live (browser test)**: page tự chọn "NhiJudy Store" (id 270136663390370), bài mới nhất "13:15 20-06 — DỒN ĐƠN TĂNG CUỐI…" (index 0, 6 bài), hội thoại mới nhất "Trần Minh Hồng" (60 hội thoại) — tất cả không cần click tay. node --check PASS.

### [delivery-report] Báo cáo: thêm tab "BÁN HÀNG SHOP" + hiển thị SL đơn ở 5 thẻ tiền ✅

User (modal Báo cáo TOMATO/NAP/TP): "Thêm BÁN HÀNG SHOP" + "Hiển thị số lượng đơn ở 5 mục tiền (kể cả BÁN HÀNG SHOP mới thêm)".

- **Files**: `delivery-report/js/report.js`, `delivery-report/css/delivery-report.css` (Web 1.0, pool chatDb — KHÔNG đụng web2).
- **(1) Tab BÁN HÀNG SHOP**: thêm `{ key: 'shop', label: 'BÁN HÀNG SHOP', color: '#059669', bg: '#d1fae5' }` vào `TABS` (màu emerald khớp `.dr-province-header-shop` ở delivery-report.js). `SHIP_FEE_DEFAULTS.shop = 0` (bán tại shop, không phí ship). Toàn bộ render (button, thẻ tiền, bảng, ảnh bill, ship-fee popover) driven bởi `TABS`/`state.activeTab` nên chỉ cần thêm 1 dòng. `group_name='shop'` đã là valid group server-side (`/by-date-group` trả sẵn) + `sendAlongFor` an toàn khi không có channel map (shop → 0).
- **(2) SL đơn ở 5 thẻ**: `computeTotalLeftForTab` giờ trả `{ total, count }` (cộng dồn `sys.sysCount` ở cả 3 nhánh aggregate/merge/single — khớp logic tiền). `paintTabTotals` render `<span class="dr-tab-total-count">N đơn</span>` phía trên số tiền cho cả 4 nhóm + thẻ TỔNG (count tổng). CSS: thẻ đổi `flex-direction: column`, count nhỏ màu trung tính (#6b7280) không đổi theo +/-.
- **Verified live (browser test, range 01→20/06)**: TOMATO 483 đơn/$10.680.000, NAP 1.423/$18.973.000, THÀNH PHỐ 978/$112.052.000, BÁN HÀNG SHOP 0/$0, TỔNG 2.884/$141.705.000. Card count TOMATO (483) = footer SL ĐƠN bảng (483) → cross-check khớp. Tab shop click OK (14 cột, 20 row), 0 page error. node --check PASS.

### [web2/zalo] Chip hiển thị TK Zalo đang dùng để nhắn (badge read-only) ✅

User: khung chat Zalo cần hiển thị account đang dùng + xác nhận là TK chính. Backend đã ưu tiên `is_primary` (route `/conversation/:phone` ORDER BY is_primary DESC) — chỉ thiếu HIỂN THỊ.

- Thêm chip read-only vào header engine chat dùng chung `zalo-chat/chat-view.js` (`#wzcvAccChip` + `_fillAccChip()`): hiện tên account của hội thoại (= `conv.account_key`), tag **"TK chính"** + màu xanh nếu `isPrimary`; account phụ → màu cam cảnh báo. Account không xác định (conv mồ côi account đã xoá) → ẩn chip.
- Nguồn meta: `ZaloApi.status()` (luôn có nơi engine chạy = ENGINE_JS[0]), fallback `Web2Zalo.status()`. Inline style, KHÔNG đụng file CSS.
- Dùng CHUNG: mọi trang mở chat Zalo qua `WZChat.mountConversation` đều có (web2/zalo Hội thoại + Web2Zalo.mountChat → jt-tracking/native-orders/customers/balance-history + Web2CustomerChat tab Zalo).
- Bump `ENGINE_VER=20260620zaloacc` + `web2-zalo.js?v=20260620zaloacc` ở 4 page.
- **Verified live (browser test)**: primary → "Nhijudy Ơi · TK chính" (xanh); phụ → "My Njd" (cam). node --check PASS.

## 2026-06-20

### [web2/shared chat-modal] Cột trái hiện TẤT CẢ hội thoại + pill tên page mỗi dòng ✅

User: "chat left panel hiện tất cả đoạn hội thoại, hiện luôn tên page" (trang jt-tracking).

- **Files**: `web2/shared/web2-customer-chat-modal.js` (seed search), `web2/shared/web2-customer-chat-core.js` (`_convRowHtml` + CSS `.w2cc-row-page`). Bump `web2-customer-chat-core.js?v=20260620p` + `web2-customer-chat-modal.js?v=20260620p` ở 4 trang load (native-orders, web2/customers, web2/jt-tracking, web2/balance-history).
- **(1) Hiện tất cả hội thoại**: `openModal` đổi `seedQ = opts.query || phone` → `seedQ = opts.query` (CHỈ seed khi caller truyền `query`). Phone-only caller (jt-tracking) → cột trái KHÔNG bị lọc, hiện hết; hội thoại của SĐT vẫn auto-chọn + mở thread (`resolvePancakeConv`). Caller có `query` (native-orders, balance-history, customer-detail, pending-match picker) GIỮ filter — không regression.
- **(2) Pill tên page**: `_convRowHtml` thêm `<span class="w2cc-row-page">` = `_pageName(pageId)` (pill xanh nhỏ dưới snippet) → biết hội thoại thuộc page nào khi gộp nhiều page. Áp dụng mọi trang dùng modal.
- **Verify Playwright** (jt-tracking, click SĐT): `searchValue:""`, `totalRows:150` (trước chỉ 3), `pageChips:150`, pages = `["Nhi Judy House","NhiJudy Store","Nhi Judy Ơi"]`, thread vẫn auto-mở (Thiên Kim Lê), 0 console error. Screenshot xác nhận.

### [web2/zalo] Thêm account bằng phiên chat.zalo.me (cookie) — không cần QR ✅

User: nút "Đăng nhập Zalo" (cookie) chỉ RE-CONNECT slot cũ + có guard expectedUid → KHÔNG thêm được account ĐANG MỞ trên chat.zalo.me nếu nó chưa có slot ("Thêm & quét QR" chỉ có QR). Bằng chứng live: chat.zalo.me = My Njd (852368) nhưng web2 chỉ connect Nhijudy Ơi (711743, session cũ).

- **Fix**: thêm nút **"Đăng nhập bằng Zalo đang mở"** vào modal Thêm account (`#wzAddSaveCookie`). Hàm `saveAddPersonalCookie()`: createAccount(label) → slot mới (chưa uid) → `loginZaloCookie(newKey)` → guard `expectedUid=null` nhận đúng account chat.zalo.me. Login fail/hủy → xoá slot rỗng vừa tạo (tránh slot rác).
- Files: `web2/zalo/index.html` (nút + hint 2 cách), `js/web2-zalo-accounts.js` (saveAddPersonalCookie + export), `js/web2-zalo-app.js` (wire). Bump `?v=20260620cookieadd`.
- **Verified live (browser test + extension)**: bấm nút → thêm "My Njd" uid 852368 (đúng account chat.zalo.me) → `connected`, 2/2 kết nối. node --check PASS.
- ⚠ Tech-debt nhỏ: bấm lại khi account đã có slot → tạo slot trùng uid (dedup theo uid nên làm ở backend `_afterLogin`, để sau).

## 2026-06-20

### [web2/jt-tracking] Chat KH (bấm SĐT) → giao diện 3-cột "Chat khách hàng" giống native-orders ✅

User: "cho chat jt-tracking giống native-orders đi" (drawer phải → modal 3-cột).

- **Files**: `web2/jt-tracking/js/jt-tracking-modals.js` (`openMsgModal`), `web2/jt-tracking/index.html` (bump `jt-tracking-modals.js?v=20260620chat`).
- **Đổi**: `Web2CustomerChat.open({ phone, name })` → `Web2CustomerChat.open({ layout: 'modal', phone, name })`. `layout:'modal'` route sang `openModal` (web2-customer-chat-modal.js) = giao diện 3-cột "Chat khách hàng" (sidebar danh sách hội thoại + ô tìm + thread) — đúng module dùng chung native-orders đang dùng (image 2). Tự auto-chọn hội thoại theo SĐT.
- **Không thêm script/CSS**: modal CSS nằm trong `web2-customer-chat-core.js` `ensureStyles()` (auto-inject), panel bundle lazy-load sẵn → 0 file mới.
- **Giữ nguyên** `openChat` (nhóm Zalo nguồn của mã vận đơn) = drawer Zalo-only (đúng, không có hội thoại Pancake để liệt kê sidebar).
- **Verify Playwright** (login web2 admin → click SĐT 0911607768): `drawer:false`, `modal3col:true`, header "Chat khách hàng", 150 hội thoại sidebar, ô tìm "Tìm hội thoại theo tên / SĐT…" → khớp image 2. Screenshot xác nhận.

### [web2/render] "Làm tất cả" — fix HẾT phần audit còn treo (16 mục) ✅

Đóng nốt toàn bộ MEDIUM/LOW còn lại sau scan 121 issue. node --check PASS 17 file, 0 NUL.

**Money/correctness (backend):**

- **#26** SePay 2 tin xác nhận → cột `confirm_msg_sent` + claim atomic ở CẢ 2 sender (`_sendQrConfirmMessage` + ck-watcher `_applyMatch`); gửi fail thì reset cờ (KH không mất tin). Khách chỉ nhận 1 tin.
- **#24** ck-watcher rollback CLAIM khi credit không thành (`!credited && !reconciled`) → signal về trạng thái cũ, tick sau retry (hết kẹt 'confirmed' không cộng ví).
- **#2** products create: transaction + dedupe `LOWER(name)+variant+supplier` FOR UPDATE (khớp cả biến thể+NCC → không chặn SP thật) → hết SP trùng khi 2 create race.
- **#21** msg-send: `client_message_id = item.id` vào payload Pancake (idempotency proxy/recover).
- **#LOW21** emitAfterCommit: 2 caller raw-client (resolveWeb2PendingMatch + revertMatchAudit) tạo+drain `_afterCommit` → emit wallet SSE SAU commit (hết nextTick stale-read).
- **#LOW11** fb-posts: saveToken `DELETE user_id<>$1` → model 1-account rõ ràng.
- **#LOW8** web2-returns `_genCode`: giữ retry-on-23505 (đúng, audit xác nhận) + ghi chú chống "fix" nhầm.

**Messaging (an toàn, chỉ guard, KHÔNG gửi gì):**

- **#28** chat reply-to: forward `replyToId` end-to-end (sendMessage đã map → `replied_message_id`).
- **#27** msg-template: GIỮ blanket mark (chống re-queue khi job chạy = chống gửi-trùng) + endpoint `/:id/failed-codes` + `_unmarkSent` gỡ mark đơn LỖI sau job → cho gửi lại. (Bỏ blanket naive sẽ TĂNG gửi-trùng → không làm.)

**Frontend (local, no customer-send):**

- **#32** photo-studio: `freshAiMask` segment đúng frame vừa chụp (fallback maskC, no regression).
- **#29** product-counter: detector RIÊNG mỗi controller + close() (chỉ cache fileset/WASM).
- **#31** video-beauty: generation token chống 2 previewLoop chồng.
- **#23** page-builder: rollback xoá → `load()` resync (bỏ splice idx stale).
- **#25** bill-service: iframe RIÊNG mỗi job + afterprint cleanup (hết clobber 2 print song song).
- **#LOW28** products: SSE self-echo freshness guard (`updatedAt`).

→ **Toàn bộ 121 audit issue (CRITICAL+HIGH+MEDIUM+LOW) đã đóng.** Cần deploy n2store-fallback + web2-api.

## 2026-06-20

### [web2/render] Quét lại TOÀN BỘ 121 audit issue + fix nốt money/cosmetic ✅

User "quét lại hết". Verify 6 agent song song toàn MEDIUM(39)+LOW(32) trong code hiện tại. CRITICAL(6)+HIGH(43)=100% FIXED. Đa số MED/LOW trùng HIGH đã fix. Fix thêm trong đợt này:

- **#19 manual deposit idempotency** (routes/v2/web2-wallets.js): client thiếu `x-idempotency-key` → sinh server-side `mdep_<uuid>` → reference_id không NULL → partial unique index chống double-deposit.
- **#20 sepay pending_matches unique** (services/web2-sepay-matching.js): dedupe pending cũ + `uq_web2_pending_matches_tx_pending` (partial unique transaction_id WHERE status='pending') + ON CONFLICT DO UPDATE cả 2 INSERT → hết dup pending khi race.
- **#LOW1** admin-web2-data-reset.js: sửa comment mô tả sai bước per-slug delete web2_records (code không thực thi).
- **#LOW2** admin-web2-data-reset.js `tsTag`: thêm giây+random → 2 reset cùng phút không trùng tên bảng backup.
- node --check PASS, 0 NUL. Cần deploy n2store-fallback + web2-api.

**CÒN LẠI (cố ý để xử lý riêng — chạm path gửi tin khách / money-flow tinh tế / cần quyết định sản phẩm):** #24 ck-watcher rollback claim, #26 SePay 2 tin xác nhận (cần cột confirm_msg_sent), #21 msg-send Pancake idem key, #27 msg-template mark-sent (bỏ sai cách lại tăng gửi-trùng), #28 chat replyToId (cần verify Web2Chat downstream), #2 products dedupe (rủi ro chặn tạo SP hợp lệ). Frontend polish LOW: video-beauty rVFC, page-builder rollback, bill iframe, products self-echo, photo mask, product-counter detector — latent, fix sau.

## 2026-06-20

### [web2/render] Audit sót: gate auth 3 router + cap amount quick-refund (đóng nốt HIGH còn treo) ✅

Verify lại audit Web 2.0 trực tiếp trong code (không tin commit message) → đợt fix trước gate hầu hết router nhưng **sót 3 file bare auth + 1 money-trust**. Đóng nốt:

- **`reconcile.js`** (#43): `router.use(requireWeb2AuthSoft)` toàn router (8 route PBH scan/pack/ship/deliver/return-failed…); `userFromReq` ưu tiên `req.web2User` (token đã verify) thay vì tin body.
- **`web2-unread.js`** (#9/#26): gate `POST /reconcile` — chống ai cũng trigger reconcile hammer Pancake toàn bộ hội thoại.
- **`web2-customer-intents.js`** (#9/#26): gate `POST /:id/done` + lấy `done_by` từ `req.web2User`.
- **`purchase-refund.js` `/quick-refund`** (#42): credit ledger NCC nay CAP về `Σ(qty×price)` của chính line items đã trừ kho (cho refund ÍT hơn, chặn phồng >1%) — trước tin `totalAmount` client tách rời số kho.
- node --check PASS cả 4, 0 NUL. requireWeb2AuthSoft → 401 khi WEB2_AUTH_ENFORCE=1 (trang web2 đã gửi x-web2-token sẵn), warn-pass khi transition. Cần deploy n2store-fallback + web2-api để áp prod.

**Đã verify FIXED từ đợt trước (code hiện tại):** TPOS creds worker, SSRF, admin `?secret=`, mã hoá token Zalo/FB at-rest, requireWeb2Permission enforce, `/ingest` fail-closed, over-refund qty cap (#4/#20), msg-send `/result` state-guard (#35), sidebar escapeHtml, chat double-send, live-comments dedup key.

### [orders-report/bill] Bỏ default account hardcode `nvqldonhang` — chưa gắn TPOS thì báo "không ra bill" ✅

User: bill phải ra theo TPOS account GẮN với user Web 1.0; chưa gắn thì báo lỗi, KHÔNG fallback account dùng chung. `bill-token-manager.js` `init()`+`_retryLoadFromRender()` đang tạo default `{label:'Mặc định', username:'nvqldonhang', password:'Aa@123456987'}` khi `accounts.length===0` → `hasCredentials()` LUÔN true → guard báo lỗi không bao giờ chạy + lộ password billing dùng chung.

- Bỏ 2 block fallback hardcode → chưa gắn account thì `accounts` rỗng → `hasCredentials()`=false → `getBillAuthHeader` (tab1-fast-sale.js:294) báo sẵn **"Chưa cấu hình tài khoản TPOS cho bill. Vui lòng vào 'Tài khoản TPOS' để cài đặt."** + throw (không ra bill).
- Account chính vẫn nạp per-user từ Render (`loadFromRender` theo Web 1.0 userId) — không đổi. `setCredentials` legacy (nhận creds từ caller) giữ nguyên.
- Bỏ luôn password `Aa@123456987` khỏi client (lộ creds). node --check OK. Bump `?v=20260620e`.

### [shared/worker/render] TPOS đổi password → bỏ hardcode creds client, dùng proxy-auth toàn bộ ✅

User đổi password TPOS (nvkt/nvktlive1 + nvktshop1) → mọi nơi hardcode password CŨ `Aa@28612345678` trong client JS HỎNG + lộ creds. Worker `/api/token` đã proxy-auth (inject creds từ Cloudflare secret). Migrate hết client/server sang proxy-auth:

- **Worker**: company1=nvktlive1 (env TPOS_USERNAME/PASSWORD/CLIENT_ID), company2=nvktshop1 (default + TPOS_PASSWORD chung). Set CF secret `TPOS_PASSWORD` + đã verify **✅ company 1 & 2 đều lấy token OK**.
- **Client (gửi `{companyId}` JSON, KHÔNG gửi password)**: `shared/js/token-manager.js` + `shared/browser/token-manager.js` (passwordLogin), `shared/js/navigation-modern.js` (SwitchCompany doSwitch), `shared/universal/tpos-client.js`, `soorder/js/soorder-supplier-loader.js`, `hanghoan/js/banhang.js`+`trahang.js`, `orders-report/js/tab-kpi-commission.js`. Bỏ literal username/password khỏi path active (helper getCredentials dead còn lại = password cũ vô hại, đã rotate).
- **Server**: `render.com/services/auth-token-store.js` đã env-based (process.env.TPOS_USERNAME/\_2/PASSWORD/CLIENT_ID). Set Render env `TPOS_PASSWORD` (mới) + `TPOS_USERNAME_2=nvktshop1` trên n2store-fallback.
- Refresh-token grant giữ nguyên (không cần password). node --check PASS, 0 NUL. Bump `?v=20260620d` (45 HTML).
- ⚠ Còn `scripts/tpos-fetch-shapes.js` (dev script, không deploy) còn pw cũ — vô hại, để sau.

### [web2/render/worker] Fix MEDIUM/LOW audit còn lại (workflow 46-agent per-file) ✅

User "làm tất cả fixes". Workflow per-file (đọc report, giữ nguyên fix auth/money/encrypt đợt trước, node --check). 71 medium/low → **25 file đổi NET** (nhiều backend route đã có fix từ đợt 21-file → no-op).

- **Backend (NEW)**: `proxy-handler.js` (worker, medium), `web2-msg-send-worker.js` (medium race counter). Các route khác (admin-wallet-reset tsTag/timing-safe/assertSafeTable, jt-tracking PURGE_THROTTLE chống write-storm GET /list, products stock atomic, …) đã có sẵn trong HEAD.
- **Frontend (23 file)**: video-beauty (camera/canvas leak), photo-studio (ui/canvas/bg), products (modal/detail/actions), reconcile (api/actions), supplier-wallet-actions, page-builder, ck-assign-picker, product-counter, msg-template, variants-app, video-maker, fb-posts-app, live-chat (init-wiring listener leak, comment-list-render, pancake-chat-window), native-orders-pbh-bill. Chủ yếu: EventSource/listener/camera leak cleanup, debounce/guard, escaping, optimistic rollback closure.
- Agents **skip hợp lý** item rủi ro (đổi money/auth logic cần test runtime) + item đã fix.
- ✅ Verify độc lập: node --check 100% PASS, **0 NUL corruption** (0x1F trong live-comment-list là delimiter có sẵn, không phải agent thêm). Bump `?v=20260620c` (14 HTML). Worker redeploy cho proxy-handler.

### [ops] Deploy + kích hoạt toàn bộ fix audit lên prod (worker + Render + mã hoá) ✅

User "làm tất cả, key ở serect_dont_push" + "đã đổi tpos nvkt". Dùng Render API + Cloudflare Global API (từ secrets) thực thi prod:

- **Worker (Cloudflare `chatomni-proxy`)**: `token-handler.js` bỏ hardcode password TPOS → đọc `env.TPOS_PASSWORD`/`TPOS_USERNAME`/`TPOS_CLIENT_ID` (company1), `TPOS_PASSWORD_2`/`TPOS_USERNAME_2` (company2); set CF secret `TPOS_PASSWORD` (password mới); **deploy** (version b6372e3e). Verify: **✅ company1 (live) auth OK**; ⚠️ **company2 (shop) 400 — cần set `TPOS_USERNAME_2`/`TPOS_PASSWORD_2` đúng creds nvktshop1** (ONCALL\_\* worker = PBX/SIP điện thoại, KHÔNG phải TPOS). SSRF proxy/image: **✅ chặn private-IP + host ngoài allowlist**.
- **Mã hoá at-rest KÍCH HOẠT**: generate `WEB2_ENC_KEY` → set Render env **web2-api + web2-realtime + n2store-fallback** + ghi secrets. Deploy web2-api + n2store-fallback (zca Zalo ở fallback, routes ở web2-api) → live. Row cũ plaintext vẫn đọc (zero-lockout); login/refresh mới mã hoá.
- **Dọn Render env**: grep usage toàn repo → xoá **5 var chết** khỏi n2store-fallback (`AUTOFB_*` ×4 feature gỡ, `BUNNY_ACCOUNT_API_KEY`). Giữ ambiguous/sensitive (GOOGLE*PLACES, VERIFY_TOKEN, ONCALL_SIP*\* PBX, FALLBACK_BASE/MAX_EVENTS dùng live-chat/server).
- **Smoke-test prod ✅**: gated writes → 401 không token; reads → 200; app up. Frontend gửi token (93/93 write-call đã verify) → user thật không bị 401.

### [render] Mã hoá token/session Zalo+FB AT-REST (AES-256-GCM, safe-by-default) ✅

Item HIGH còn lại của audit (token/session lưu plaintext). Build helper dùng chung + wire vào các choke-point.

- **MỚI `render.com/lib/web2-secret-crypto.js`** — AES-256-GCM, đọc env `WEB2_ENC_KEY` (32 byte hex/base64). `encryptString/decryptString` (TEXT) + `encryptJson/decryptJson` (JSONB, bọc `{__enc__:...}` để cột vẫn JSON hợp lệ). **AN-TOÀN-MẶC-ĐỊNH**: không có key → no-op (plaintext như cũ); read path luôn tha legacy plaintext (zero-lockout); sai/thiếu key khi data đã mã hoá → ném (không trả rác). **16/16 unit-test PASS** (roundtrip string/JSONB, passthrough, double-encrypt no-op, sai key).
- **Wire (workflow 5-agent, 9 write encrypt + 8 read decrypt)**: `web2-zalo-zca.js` (session: encrypt \_afterLogin, decrypt restoreAll trước zca.login), `web2-zalo-oa.js` (oa_secret/access_token/refresh_token: encrypt INSERT/UPDATE, decrypt trước fetch OA, tránh double-encrypt nhánh fallback), `web2-zalo.js` (session: \_saveSession encrypt, reconnect+restoreSessions decrypt; boolean hasSession không đụng), `web2-fb-posts.js` (loadToken decrypt + saveToken encrypt = 1 choke-point phủ mọi downstream read user_token+pages). `web2-fb-graph-service.js` không đổi (nhận token đã giải mã). Auth-gating/advisory-lock đợt trước được giữ.
- ✅ node --check 5 file OK, 0 NUL byte, import `../lib/web2-secret-crypto` đúng.
- ⚠️ **KÍCH HOẠT** (chưa bật): `openssl rand -hex 32` → set Render env `WEB2_ENC_KEY=<hex>` cho web2-api (+ realtime/fallback nếu cùng đọc bảng). Row CŨ vẫn plaintext (read tha được); re-login Zalo / re-connect FB sẽ ghi đè = mã hoá dần. **Test trước khi bật prod**: set key ở local → re-login Zalo + re-connect FB xác nhận roundtrip.

### [render/worker/shared] FIX audit Web 2.0 — gate auth + SSRF + money + idempotency (21 file, workflow per-file) ✅

User "fix tất cả". Workflow 23-agent (mỗi agent 1 file, đọc report làm spec, `node --check`) → **21 file đổi, 780+ insert**. Tôi verify độc lập: node --check 19 JS OK + 2 worker ESM OK; **bắt + sửa 2 NUL byte agent chèn nhầm** ở `web2-zalo.js:44` (template dedupe key → đổi `\x00`→`|`); xác nhận **KHÔNG GET read nào bị gate** (chỉ writes → giảm rủi ro 401).

- **Auth gating** (14 router): `web2-zalo` (router.use soft + admin disconnect/delete + idempotency 4 send + IDOR /media private), `web2-fb-posts` (admin connect/disconnect/refresh/delete/publish + advisory-lock chống double-publish), `web2-returns`/`purchase-refund`/`web2-supplier-wallet`/`web2-products`/`web2-variants`/`web2-msg-send`/`web2-msg-templates`/`web2-quick-replies`/`web2-jt-tracking`/`web2-ai-script`/`web2-live-comments`/`web2-users` (gate writes; reads mở).
- **Money**: `web2-returns` server-validate walletCredit (cap giá≤đơn, SL≤đã mua, tổng≤wallet_deducted → không mint tiền) + snapshot per-PBH khi huỷ + dedupe 60s; over-refund server-authoritative (`web2-supplier-wallet`+`purchase-refund` tự tính `ordered`, bỏ tin client).
- **Race/idempotency**: zalo send guard (cliMsgId), fb publish pg_advisory_lock (409 nếu trùng), products PATCH stock atomic, msg-send counter, jt `/clear` cần confirm/admin, chat-compose double-send guard.
- **Worker SSRF**: `proxy-handler`+`image-proxy-handler` validate `?url=` (allowlist host exact/subdomain + chặn private/loopback/link-local IPv4+IPv6).
- **Admin**: bỏ `|| req.query.secret` ở 5 route (chỉ nhận header `x-admin-secret`).
- **escapeHtml** (`web2-sidebar.js`): escape thêm `"` `'` (an toàn attribute context).
- ⚠️ **DEFER (cần user)**: (1) đổi mật khẩu TPOS + `wrangler secret` (token-handler Web 1.0, ngoài scope); (2) mã hoá token/session Zalo+FB at-rest (cần key env + schema change); (3) zalo `/media/:id` opaque-token URL (schema) — hiện `<img>` không gửi header được → thumbnail có thể vỡ khi enforce. ⚠️ **RISK**: writes giờ cần `x-web2-token` (trang phải gửi qua Web2Auth.authHeaders); admin-gated routes 403 với non-admin.

### [docs/web2] Rà soát toàn diện Web 2.0 (read-only audit, multi-agent workflow) → WEB2-FULL-REVIEW-20260620.md ✅

User yêu cầu rà soát toàn bộ Web 2.0 (cloudflare/render/firebase/shared + từng trang: input→handler→hiệu ứng, SSE, console.log, bảo mật, liên kết trang) — KHÔNG gửi gì tới FB/Pancake/Zalo. Chạy workflow ~57 agent audit + verify từng lỗi (adversarial) + null-safe synthesis.

- **Kết quả `docs/web2/WEB2-FULL-REVIEW-20260620.md`**: 56 unit, **121 lỗi xác nhận** (đã khử trùng) — 🔴 6 critical · 🟠 43 high · 🟡 39 medium · ⚪ 32 low. Mỗi lỗi qua 1 agent kiểm chứng độc lập (đa số confidence=high) + `file:line` + fix.
- **Phát hiện nổi bật (CRITICAL/HIGH)**: hàng loạt router Web 2.0 **KHÔNG có auth** (`web2-zalo` 44 routes gồm gửi tin + IDOR /media, `web2-fb-posts` token theft + publish, `web2-returns`/`purchase-refund` tiền + over-refund client-controlled, `web2-products`/`web2-variants` mutations, `web2-msg-send`, `web2-jt-tracking` + `/clear` DELETE-all, `web2-ai-script`); worker **hardcode plaintext TPOS creds** (token-handler.js:42) + **open-proxy/SSRF** (`?url=` không validate); admin secret lộ qua `?secret=` query (5 route); Zalo/FB token + session lưu plaintext; `web2-users` permission không enforce server-side; double-send (Zalo) + double-publish (FB) thiếu idempotency.
- Rà soát tĩnh hoàn toàn (Read/Grep), KHÔNG gọi mạng, KHÔNG gửi gì tới khách. Verify dừng sớm ở 122 verdict do candidate trùng lặp nhiều (lỗi auth bị nhiều agent xác nhận) — critical/high đã phủ đủ. Lộ trình fix ưu tiên: gắn auth router hở + đổi mật khẩu TPOS + validate `?url=` worker.

### [CLAUDE.md/MEMORY] Rule BƯỚC 0: đọc web2/shared/ TRƯỚC khi code Web 2.0 ✅

User: "memory/claude/dev-log vẫn chưa nắm rõ thông tin dự án → nhớ xem shared web 2.0 trước khi code để lấy được toàn bộ module web 2.0".

- **`CLAUDE.md`** mục "Quy tắc khi code": thêm callout **⚠️ BƯỚC 0 BẮT BUỘC** — mở/đọc `web2/shared/` (~90+ module) + `docs/web2/WEB2-CODEMAP.md` §1 Shared Modules Registry TRƯỚC khi viết dòng nào → tái dùng, KHÔNG fork.
- **MEMORY**: file mới `feedback_web2_read_shared_first.md` + pointer đầu `MEMORY.md` (Why: tránh trùng lặp/drift; How: ls web2/shared + tra CODEMAP §1 trước).

### [vieneu-tts/web2-pos-installer] Bộ cài máy POS (.bat) → MENU bấm số: Print Bridge / VieNeu / OmniVoice / cài hết ✅

User: "VieNeu / OmniVoice / printer… tất cả file cài bằng bat của Web 2.0 → mở .bat cho chọn option hoặc cài hết bấm số 0,1,2,3".

- **`web2/shared/web2-pos-installer.js`** `batContent()` → sinh `cai-may-pos.bat` dạng **MENU**: `[1]` Print Bridge (in máy IP), `[2]` VieNeu (~595MB), `[3]` OmniVoice (~vài GB, 600+ ngôn ngữ + Voice Design), `[0]` cài hết, `[Q]` thoát. `uninstallBatContent()` gỡ cả 3 (thêm `N2StoreOmniVoice`).
- **`vieneu-tts/vieneu-windows-setup.ps1`** thêm `-Engine <vieneu|omnivoice>` + `-Port` (8123/8124, chạy song song được): thư mục riêng `N2StoreVieNeu`/`N2StoreOmniVoice`, venv riêng, deps riêng (omnivoice kéo torch + `requirements-omnivoice.txt`), launcher `start.cmd` set `TTS_ENGINE`+`PORT` chạy ẩn + auto-start. **Sửa regression**: app.py giờ import `engine_base/engine_vieneu` → ps1 tải thêm các file engine (trước chỉ tải app/serve/requirements → sẽ vỡ).
- **`vieneu-tts/install-windows.bat`** (chạy từ folder) cũng thành menu `[1]` VieNeu `[2]` OmniVoice `[0]` cài hết.
- Bump `web2-pos-installer.js?v=20260620a` (video-maker + printer-settings).
- ✅ Verify: py_compile OK; node render `cai-may-pos.bat` (menu 3 engine, `-Engine` param đúng, VBASE đúng, paren cân, uninstall có OmniVoice). Bat/ps1 thật chạy trên máy Windows shop.

### [vieneu-tts] Thêm engine OmniVoice (k2-fsa, Apache-2.0) cạnh VieNeu — chọn qua TTS_ENGINE, GIỮ NGUYÊN frontend ✅

Research 3 repo TTS user gửi (TTS-WebUI/MIT, OmniVoice-Studio/AGPL, **k2-fsa/OmniVoice/Apache-2.0**). Verdict: OmniVoice là bản nâng cấp khít VieNeu (cùng hình dạng server máy shop, Apache-2.0, **tiếng Việt thật** — ngôn ngữ #607, 8.481h data; clone SOTA + **Voice Design** chỉnh giới tính/tuổi/cao độ/accent không cần mẫu). User chọn **(A)** thêm engine vào `vieneu-tts/` server.

- **MỚI engine abstraction trong `vieneu-tts/`**: `engine_base.py` (interface `TTSEngine` + `float_to_wav_bytes` stdlib WAV PCM16, không cần soundfile), `engine_vieneu.py` (tách hành vi gốc, KHÔNG đổi logic), `engine_omnivoice.py` (wrap `OmniVoice.from_pretrained().generate(text,ref_audio,instruct,num_step,speed)`, tự dò device cuda/mps/xpu/cpu, preset Voice Design tiếng Việt).
- **`app.py` rewrite**: factory chọn engine qua env `TTS_ENGINE` (mặc định `vieneu` → hành vi cũ y nguyên). Cùng contract `/health`(+field `engine`)·`/voices`·`/synthesize`·`/clone` + **MỚI `/design {text,instruct}`** (501 nếu engine không hỗ trợ). Lock serialize giữ nguyên.
- **`serve.py`**: engine-aware (env `TTS_ENGINE` → tên máy hậu tố "(OmniVoice)", heartbeat thêm `note=engine` để UI phân biệt, print khởi động theo engine). Mặc định vieneu KHÔNG đổi.
- **MỚI**: `requirements-omnivoice.txt` (torch cài theo nền tảng trước + omnivoice) · `run-omnivoice-mac.command` (1-click venv riêng `.venv-omnivoice` + torch MPS + omnivoice). venv 2 engine TÁCH RIÊNG (deps khác).
- **Frontend GIỮ NGUYÊN 100%** — `Web2Vieneu` chỉ gọi `/health /voices /synthesize /clone` + registry `/list`, engine-agnostic. Máy OmniVoice tự hiện trong danh sách (note=omnivoice), `voice` preset → instruct, `/clone` → ref_text auto Whisper.
- ✅ Verify offline (KHÔNG tải model, không mạng): py_compile 5 file OK; factory chọn đúng vieneu/omnivoice + list preset; `float_to_wav_bytes` ra WAV hợp lệ RIFF/WAVE mono 24kHz PCM16 (đúng thứ `decodeAudioData` frontend đọc). Inference thật cần máy có torch+omnivoice (máy shop) — code khớp README API đã verify.

### [web2/shared] PWA dùng chung — "Thêm vào Màn hình chính" (iOS/Android), không App Store ✅

User hỏi build app iOS không + không có Apple dev account cài ngoài App Store được không. Tư vấn: native iOS không đáng (không account = chỉ sideload 7-ngày, không bền); **PWA là giải pháp đúng** (miễn phí, không account, không App Store). Build PWA dùng chung:

- **MỚI `web2/shared/web2-manifest.webmanifest`** (name N2Store, standalone, theme #0068ff, icon logo-emblem 256, start_url/scope TƯƠNG ĐỐI → host-agnostic nhijudy.store + github.io/n2store) + **`web2/shared/web2-pwa.js`** (inject manifest link + apple-mobile-web-app-\* + apple-touch-icon + theme-color vào MỌI trang).
- Auto-nạp qua `web2-sidebar.js` autoLoad (như web2-mobile.css) → KHÔNG sửa 40 HTML. Bump `web2-sidebar.js?v=20260620a` (46 trang). Guard: trang tự khai (photo-studio) giữ manifest riêng.
- **CỐ Ý KHÔNG service worker**: app data cần luôn mới, SW cache dễ kẹt code cũ sau deploy; iOS "Thêm màn hình chính" không cần SW.
- ✅ Verify Playwright 3 trang: manifest fetch 200 "N2Store — Web 2.0", appleCapable=yes, apple-touch-icon=yes, theme=#0068ff. Commit `23b5e998a`.

## 2026-06-19

### [web2/shared] Giao diện điện thoại DÙNG CHUNG — web2-mobile.css (1 nguồn mọi trang) ✅

User: "giao diện điện thoại cho vào shared để tất cả trang đọc chung… đọc lại tất cả trang, tổng hợp + cải tiến". Workflow 7-agent audit 33 file CSS trang → tổng hợp.

- **MỚI `web2/shared/web2-mobile.css`** — lớp responsive SHARED, additive, bọc `@media` (tablet ≤900 / phone ≤600 / small ≤380 + reduced-motion). Scope `body:has(.web2-shell)`. Phủ: container guard tràn ngang, lưới chung→1 cột (`!important` override grid cứng), bảng cuộn ngang mượt + thu font/padding, form full-width + font≥16px (chống iOS zoom) + min-height chạm, header trang stack, tab/chips/toolbar wrap-scroll, modal panel gần full-screen + footer nút dọc, sticky bar safe-area iOS, media stage giảm cao.
- **Nạp toàn cục KHÔNG sửa 40 HTML**: `web2-sidebar.js` inject `<link web2-mobile.css>` (cascade SAU theme.css) — pattern như web2-lottie. Bump `web2-sidebar.js?v=20260619m` ở 46 trang.
- **Robust**: broaden selector `.web2-main` → `main` (bắt cả trang dùng `main.main-content` như balance-history) + thêm class header/toolbar bespoke (`.w2bh-head`, `.w2bh-head-actions`).
- ✅ Verify Playwright @390px (5 trang fb-posts/balance-history/products/supplier-wallet/reconcile): cssLink inject, 4 @media parse, **docOverflowX=0** (không tràn ngang), hamburger OK; screenshot balance-history nút stack đầy đủ + chips wrap. Commit `d7296bcfa`. DEDUP: nhiều @media trang giờ thừa (xem output workflow) — chưa xoá.

### [web2/shared] Tách "Tải bộ cài máy POS" → shared Web2PosInstaller (dùng chung) ✅

User: "cho cái tải file cài đặt vào shared web 2.0 → trang nào cần thì tải về cài". Tách logic sinh bat ra khỏi printer-settings thành **`web2/shared/web2-pos-installer.js`** (`Web2PosInstaller`): `downloadInstaller()`/`downloadUninstaller()`/`renderButtons(el)`/`batContent()`. URL tải tính từ **siteRoot** (regex `/web2/` trong pathname) → chạy đúng từ MỌI trang web2 + mọi domain (nhijudy.store / github.io). printer-settings refactor dùng module (xoá 2 hàm trùng); **video-maker thêm nút "Chưa có máy? Tải bộ cài cho máy shop"** (mục Giọng VieNeu). Validate node: sinh bat 2268 ký tự đúng, siteRoot OK. MEDIA-KIT cập nhật.

### [printer-settings + vieneu-tts] Gộp VieNeu vào bat cài máy POS — auto-start nền, xoá auto cũ ✅

User: "tích hợp VieNeu vào bat ở printer-settings, chạy luôn + tắt các bat auto cũ". Trước đó hỏi "bat tự chạy nền khi khởi động đúng không?" → bản cũ KHÔNG (chỉ chạy tay foreground).

- **`vieneu-tts/serve.py`**: thêm `CREATE_NO_WINDOW` (Windows) cho uvicorn + cloudflared → chạy ẩn không cửa sổ.
- **MỚI `vieneu-tts/vieneu-windows-setup.ps1`**: installer VieNeu Windows: tải app.py/serve.py/requirements.txt từ `$VBase` (GH Pages), winget Python nếu thiếu, venv+pip, tải cloudflared, **warm-up model 595MB**, tạo VBS chạy ẩn (`pythonw serve.py`) + Startup folder (auto-start login). Idempotent.
- **`web2/printer-settings/index.html` — bat GỘP**: nút "Tải file cài đặt" sinh `cai-may-pos.bat` cài CẢ Print Bridge + Giọng VieNeu. Trình tự: (0) xoá auto/instance CŨ (`N2StorePrintBridge.vbs`+`N2StoreVieNeu.vbs`+schtasks+kill `*N2Store*`) → (1) Print Bridge → (2) tải&chạy `vieneu-windows-setup.ps1`. Uninstall gỡ CẢ HAI. Auto-start = Startup folder VBS (login, không admin). Validate JS sinh bat OK.

### [web2/fb-posts] Xem trước bài (giống Facebook) + gộp nút tạo nội dung ✅

User: "cho xem post preview trước khi đăng" + "2 nút tạo nội dung dư thừa".

- **Shared `web2/shared/web2-fb-post-preview.js`** (`Web2FbPostPreview.open({pages,caption,media,scheduledTime})`) — thẻ giống bài FB: header page (avatar+tên+Vừa xong/⏰ lịch), caption giữ xuống dòng + hashtag xanh, lưới ảnh/video kiểu FB (1 full / 2 cột / 4+ → 2×2 +N), ảnh dataURL OK, hàng Thích/Bình luận/Chia sẻ. Nút "👁 Xem trước" cạnh Lưu nháp/Đăng. Nháp/lịch tái dùng được.
- **Gộp 2 nút** "Tạo nội dung (miễn phí)" + "AI viết lại" → 1 nút "Tạo nội dung (AI miễn phí)" (ưu tiên AI free Groq, tự fallback mẫu nếu lỗi/thiếu key).
- ✅ Verify browser: preview render đúng (header+caption+hashtag xanh+ảnh, 0 lỗi); 1 nút generate ra caption tông "chị". Commits `c3d009824` + `9e78c109d`.

### [cloudflare-worker] FIX lỗ hổng HỆ THỐNG: route /api/web2-\* quên khai báo → rơi catch-all TPOS ✅

Phát hiện khi vieneu-registry trả trang 404 TPOS. **Gốc**: worker `getRouteType` (routes.js) có generic `/api/web2/` nhưng CHỈ match dấu `/` (gạch chéo), KHÔNG match `/api/web2-` (gạch ngang) → mọi route `/api/web2-*` phải khai báo TƯỜNG MINH từng cái; quên 1 cái → rơi catch-all `TPOS_GENERIC` (`/api/` → tomato.tpos.vn — fallback của Web 1.0 dùng TPOS thật). Earlier separation-audit chỉ check `isWeb2Path` (origin) mà BỎ tầng `getRouteType` (proxy-vs-TPOS) → sót.

- **Fix 2 tầng**: (1) khai báo `WEB2_VIENEU_REGISTRY` (routes.js + worker.js) — `febcffc71`; (2) **generic `/api/web2-*` → `WEB2_GENERIC` → web2-api** trước catch-all TPOS — `83b5d75c0`. Route Web 2.0 mới prefix `web2-` KHỎI cần đăng ký worker, KHÔNG bao giờ chạm TPOS.
- **Verify live**: vieneu-registry trả JSON + register/list OK; route web2- bịa `/api/web2-khong-ton-tai-test-xyz` → `{"error":"Not Found"}` của web2-api (KHÔNG TPOS). Probe 95 route: 0 web2 dính TPOS. 5 route "không khớp" (image-proxy/odata/token → render đúng; aikol/delivery-report-telegram → app gọi thẳng `n2store-fallback.onrender.com`, bypass worker, KHÔNG bug).
- **`catch-all TPOS`** = quy tắc cuối worker: path `/api/*` không nhận ra → tomato.tpos.vn (vì Web 1.0 dùng TPOS thật). Web 2.0 KHÔNG dùng TPOS, phải match tường minh/generic TRƯỚC catch-all.

### [web2/fb-caption] Tông giọng shop dễ thương (xưng em/bọn em, gọi khách "chị") ✅

User: "sửa chúng tôi thành thân thiện như em/bọn em" + "gọi khách bằng chị (các chị/mấy chị/chị đẹp)". Sửa 1 chỗ shared `SYSTEM_VI` (áp dụng cả AI đơn + tổng hợp): shop xưng em/bọn em/shop, gọi khách các chị/mấy chị/chị đẹp/chị dễ thương/các nàng/cả nhà; CẤM "chúng tôi/chúng tớ/công ty" + "các bạn/bạn". Lưới an toàn `_friendlyTone` hậu xử lý thay nếu AI lỡ dùng. ✅ Verify live (groq): "Mới về shop các chị ơi! Bọn em… các nàng… chị đẹp" — 0 "chúng tôi", 0 "các bạn". Commits `d710a31ae`+`b936b1705`.

### [web2/fb-posts] Chọn NHIỀU SP từ Kho cho AI + thứ tự page Store→House→Ơi→Nè ✅

User: "cho chọn nhiều sản phẩm từ kho lấy thông tin cho AI làm việc" + "module riêng nhiều trang đọc vào" + "thứ tự page: Store, House, Ơi, Nè".

- **Shared MỚI `web2/shared/web2-product-picker.js`** (`Web2ProductPicker.open({multi,onPick|onConfirm})`) — overlay chọn SP từ `Web2ProductsCache`, trả full object (name/price/code/image). 1 nguồn cho mọi trang cần chọn SP, KHÔNG dựng lại.
- **Composer**: nút "📦 Chọn SP từ Kho (cho AI)" → picker đa-chọn → chips (tên+giá, xoá được) + **tự thêm ảnh SP** (dedup) + 1 SP đổ vào ô tên/giá, nhiều SP để AI tổng hợp.
- **Caption service nhận `products[]`**: `generateMultiTemplate` + `generateMultiAI` (1 bài giới thiệu loạt mẫu) + `aiComplete` dùng chung. Route `/caption` nhận `products`. Client `caption(opts)` (object).
- **Thứ tự page** sort 1 nơi server `safePages` (`_pageRank`: store0/house1/ơi2/nè3) → composer + fb-insights + fb-ads-stats đồng nhất.
- ✅ Verify live: page order `Store|House|Ơi|Nè`; caption multi-SP template OK. ✅ Browser E2E (stub SP): chọn 2 → 2 chips + 1 ảnh (dedup) + caption "SALE NHIỀU MẪU HOT • Áo… • Quần…". Commit `2c73f6a76`.

### [vieneu-tts] 1-click installer (Win/Mac) + tự dò máy online (registry) + tunnel điện thoại ✅

User: cho file .bat 1-click tự cài; máy shop tắt-mở-lại URL đổi thì sao; nhiều máy thì sao. Giải:

- **Orchestrator `serve.py`** (cross-platform): chạy uvicorn + cloudflared tunnel + đọc URL + **heartbeat POST /register mỗi 30s**. Launcher mỏng: `install-windows.bat` (1-click: winget cài Python + venv + pip + tải `cloudflared.exe` + chạy), `run-mac.command` (nhấp đúp, brew cloudflared), `run_local.sh` (terminal). Tunnel test thật: `https://…trycloudflare.com/health` OK qua internet, 10 giọng.
- **Tự dò máy (registry)** giải "tắt-mở-lại URL đổi" + "nhiều máy": route `render.com/routes/web2-vieneu-registry.js` (IN-MEMORY trên web2-api, TTL 90s) — máy báo danh `{name,url}`, trang `GET /list` máy online. Worker `/api/web2*` → web2-api sẵn. Frontend `Web2Vieneu.listServers()` + UI `video-vieneu.js` hiện chip "Máy đang online" (auto-refresh 20s) → bấm chọn, KHÔNG cần dán URL; tắt-mở-lại máy tự báo URL mới; nhiều máy hiện hết. Vẫn giữ "dán URL thủ công" (details).
- Bump version web2-vieneu/video-vieneu/css. `.gitignore` chặn `.venv`/`cloudflared.exe`/`*.wav`.

### [web2/fb-*] FB khai tử reach per-post + promote FB client → shared module ✅

Verify live phát hiện + xử lý:

- **`/insights-probe` (mới, chẩn đoán)**: thử từng metric post riêng → FB trả `#100 "not a valid metric"` cho `post_impressions`, `post_impressions_unique` (reach), `post_engaged_users` → **FB ĐÃ KHAI TỬ reach/impressions per-post** (deprecate 2024-2025), KHÔNG hãng nào lấy được nữa. Còn sống: `post_clicks`, `post_reactions_by_type_total`, `post_video_views`, `post_activity_by_action_type`.
- **Pivot `getPostInsights`**: dùng 4 metric còn sống → `clicks/reactions/videoViews/comments/shares`. fb-insights thay "📡 reach" bằng "🖱 Lượt bấm" + giữ ▶️ video views. ✅ Verify live: `hasInsights:true`, 6/6 bài có clicks (12/7/15/8) + reactions + video views.
- **Page insights** chỉ còn `page_post_engagements` + `page_views_total` (4 metric kia FB bỏ) — probe resilient tự loại đúng, không vỡ.
- **Promote shared (user: "module riêng nhiều trang đọc vào")**: `fb-posts/js/fb-posts-api.js` → **`web2/shared/web2-fb-client.js`** (`window.Web2FbClient` + alias `FBPostsApi`). 3 trang FB load từ shared; xoá file cũ; regenerate codemap. ✅ Smoke 3 trang: client+alias+postEdit OK, 0 lỗi.
- Commits `e3e76f658`→`764f9a669`. Reach KHÔNG khả thi nữa = giới hạn FB, không phải bug.

### [vieneu-tts + video-maker] Tích hợp VieNeu-TTS (CLONE giọng) — chạy máy shop + tunnel điện thoại ✅

Tích hợp [VieNeu-TTS](https://github.com/pnnbao97/VieNeu-TTS) (clone giọng Việt 3-5s, Apache-2.0, 0.5B). User chốt: chạy **trên máy shop** (free), dùng được **trên điện thoại** (máy shop bật) → tunnel; cài **nhiều máy** → URL cấu hình được. KHÔNG dựng Render now (code chạy cả local lẫn Render, đổi 1 URL là xong).

- **Backend `vieneu-tts/`** verified chạy THẬT trên Mac (CPU, torch-free `vieneu 3.0.5`): init model 54s (tải 595MB, sau cache), synth **~2-4s/câu** @48kHz, **clone giọng OK**. HTTP: `/health`·`/voices` (10 giọng)·`/synthesize`·`/clone` đều PASS qua curl.
- **`run_local.sh`**: dựng venv + chạy uvicorn + **cloudflared tunnel** → in URL HTTPS cho điện thoại. `NO_TUNNEL=1` chỉ local. Mỗi máy chạy → dán URL vào trang.
- **Frontend shared `Web2Vieneu`** ([web2/shared/web2-vieneu.js](web2/shared/web2-vieneu.js)) — kho Voice: URL config (localStorage, nhiều máy) + `health/listVoices/synthesize/clone` (WAV→samples). `video-tts.js` thêm engine `vieneu` + `registerVieneuVoices`. `video-vieneu.js` UI: nhập URL + Kết nối (tự nạp 10 giọng) + **Thu mic 5s / tải file → clone giọng** (auto convert WAV vì libsndfile không đọc webm/mp3). Khối UI trong index.html.
- **Verify end-to-end (browser, trỏ localhost:8123)**: kết nối OK → 10 giọng VieNeu hiện; synth "🎙️ Ngọc Lan" 2.4s; **clone giọng** đăng ký + synth 1.68s; 0 lỗi console. `.venv`/`__pycache__` đã gitignore.

User: "Tôi đã thêm read_insights" + "Làm theo 4" (3 việc ưu tiên từ audit Graph API). Theo rule module Web 2.0: năng lực dùng chung gom vào shared, trang chỉ gọi.

- **Scopes**: `web2-fb-graph-service.js` thêm `SCOPES_FULL` = `pages_show_list,pages_read_engagement,pages_manage_posts,**read_insights,ads_read,business_management**`. `/auth/login-url?scope=full|min` (mặc định full → 1 lần đăng nhập đủ thống kê + QC). Connect overlay đổi nút khi đã kết nối → "Đăng nhập lại (cấp thêm quyền)" + ghi rõ xin read_insights/ads_read.
- **Insights THẬT (read_insights)** — resilient (metric FB deprecate thì bỏ, không vỡ): `getPostInsights` (post_impressions/\_unique=reach/clicks/reactions_by_type/video_views) + `enrichPostsWithInsights` (pool 8, cap 80 bài) + `getPageInsights` (probe 6 metric page 28 ngày). `getLiveVideoMap` lấy thêm `live_views` (người xem live đồng thời — Pancake KHÔNG có). Route `/engagement` trả thêm `pageInsights`/`hasInsights`/`insightsAvailable`.
- **fb-insights**: card "Số liệu trang THẬT (28 ngày)" (reach/hiển thị/tương tác/lượt xem/follow ±) + card "Livestream — người xem" (👁 live_views + ▶️ video views) + per-post hiện 📡 reach + ▶️ views; cảnh báo cũ đổi thành hướng dẫn "đăng nhập lại cấp read_insights".
- **Sửa caption** (không xoá → giữ link/tương tác): service `updatePost(postId,{message,scheduledTime})` + route `/post-edit` + `FBPostsApi.postEdit` + nút "✏️ Sửa caption" trong post viewer (fb-posts-list inline edit).
- **Handoff "Đăng lên FB"** — shared MỚI `web2/shared/web2-fb-share.js` (`Web2FbShare.send/consume`, one-shot sessionStorage, images {url}|{dataUrl}): nút ở **product-card** + **photo-studio** (canvas→dataURL→send) → composer `maybeConsumeShare()` tự upload imgbb + prefill caption (KHÔNG tự chọn page, KHÔNG tự đăng).
- **fb-ads-stats**: auto mode trống → nút "Đăng nhập lại (cấp quyền ads_read)" + "Nhập tay thay thế".
- An toàn giữ nguyên: không tự đăng, giãn 1.5s/page, cảnh báo bản quyền ảnh/nhạc. Chi tiết [[reference_web2_fb_posts]].

### [vieneu-tts + docs] VieNeu-TTS (clone giọng, server Web 2.0) + KHO ĐA DỤNG media/AI 🚧

User: "tích hợp VieNeu-TTS" (clone giọng tiếng Việt 3-5s) + "render của web 2.0" + "có module riêng cho AI/giọng/hình/video chưa? như 1 kho đa dụng". Research: VieNeu = fine-tune NeuTTS Air, **0.5B/595MB GGUF, Apache-2.0, KHÔNG có bản browser** → bắt buộc chạy server (user chốt: server riêng Render Web 2.0, chấp nhận phí + data lên server; mục tiêu clone giọng + chất lượng cao).

- **Backend MỚI `vieneu-tts/`** (commit 8e8656b): FastAPI wrap package `vieneu` (ONNX CPU torch-free). Endpoints `/synthesize` (giọng preset) · `/clone` (multipart text+ref_audio → nhái giọng) · `/voices` · `/health`. CORS allowlist + optional `VIENEU_API_SECRET`, **serialize inference** (CPU nặng). Deploy Render Python rootDir `vieneu-tts`, plan standard (2GB cho model 0.5B), buildFilter `vieneu-tts/**`. CHƯA tạo service + CHƯA wire frontend.
- **MỚI [`docs/web2/MEDIA-KIT.md`](web2/MEDIA-KIT.md) — "KHO ĐA DỤNG"**: gom mọi capability media/AI theo 4 nhóm **Giọng nói / Video / Hình ảnh / AI** (capability→module→file→API→"dùng khi"), đánh dấu ✅shared / ⚠️feature-local / 🛰️backend. Trả lời câu hỏi user: Hình+AI-thị-giác đã shared; **Giọng (Web2VideoTTS/Audio) + Video (Web2VideoRender/Anim/Beauty) CHƯA shared** (kẹt trong video-maker/video-beauty) → lộ trình promote về `web2/shared/` (Web2Voice hợp nhất MMS/Piper/VieNeu…). Con trỏ "ĐỌC VÀO ĐÂY" thêm vào CLAUDE.md Index quick-lookup.

User báo `❌ Lỗi tạo giọng: failed to call OrtRun()... Gather node... idx=132 must be within [-130,129]`. Điều tra (browser-test): KHÔNG phải do ký tự (dump vocab MMS = 96 token maxId 95; mọi text điển hình gồm số/%/emoji/HOA/ngoặc/gạch đều OK id≤93). **Gốc = CONCURRENCY**: bấm "Nghe mẫu" (đang chạy) rồi "Tạo giọng đọc" → 2 `synth()` chồng nhau trên CÙNG 1 ONNX session → input tensor hỏng → index rác 132 (hoặc "reading null"). Tái hiện chắc chắn bằng `Promise.allSettled([synth(a),synth(b)])` → 1 fail; chạy đơn lẻ luôn OK.

- **Fix `video-tts.js`**: thêm khoá toàn cục `_serialize(fn)` (promise-chain) — mọi inference MMS + Piper XẾP HÀNG, mỗi lúc chỉ 1 chạy. Wrap `synth(text)` (`_mmsChunk`) + `tts.predict()` (`_piperChunk`). Bump `?v=20260619e`.
- **Verify**: sau fix, 2 `synthesize()` đồng thời → cả 2 OK (3.54s+2.96s); 3 job chồng (MMS sample + MMS gen + Piper) → cả 3 OK, 0 lỗi console; click nút thật "Nghe mẫu"→"Tạo giọng" ngay → "✅ Đã tạo giọng (3.4s)". Xuất video: mix graph giọng+nhạc `hasAudio:true`, MediaRecorder mp4/webm OK (verify phiên trước).

### [web2/fb-ads-stats] Sổ quảng cáo NHẬP TAY (gắn bài + tiền QC + số đơn) + ad account qua BM ✅

Login (Lê Minh Tú) có 3 ad account nhưng **0 chi tiêu** + không có ad account qua BM → số liệu QC thật không lấy được từ login này (QC chạy ở account/BM khác). User chốt: làm **nhập tay** (`f1e733d18`).

- **Nhập tay**: chọn bài/đợt live (picker /list) → nhập tiền QC / số đơn / doanh thu / reach / tin nhắn / ghi chú + ngày → bảng theo **ngày/tuần/tháng** + tổng hợp (tổng chi, tổng đơn, **CP/đơn**, doanh thu, **ROAS**). Bảng `web2_fb_ad_entries` (web2Db) + route `/ad-entries` (GET list), `/ad-entry` (POST upsert), DELETE `/ad-entry/:id`. Module `FBAdsManual` (`fb-ads-manual.js`). CRUD verified round-trip.
- **Toggle** trang fb-ads-stats: ✍️ Nhập tay (mặc định) / 📊 Tự động (FB Ads). `box()`→#fbaContent.
- **getAdAccounts** gom thêm ad account qua **Business Manager** (`/me/businesses`→owned/client) + gắn nguồn → KHÔNG cần đăng nhập đúng người chạy QC, chỉ cần là thành viên BM. (Login hiện vẫn chỉ thấy 3 account cá nhân.)
- ⚠ Ad data luôn thuộc **ad account**, KHÔNG lấy từ page. Page-level Insights deprecated. Chi tiết [[reference_web2_fb_posts]].

### [web2] Group "Facebook" riêng + 2 trang Thống kê tương tác & Thống kê quảng cáo ✅

User: tách group Facebook (chuyển Đăng bài vào), thêm trang thống kê tương tác + thống kê quảng cáo "chi tiết nhất có thể" (`c799ddd14`).

- **Sidebar**: group mới **Facebook** (icon facebook) = Đăng bài 📢 / Thống kê tương tác 📊 / Thống kê quảng cáo 💰; bỏ "Đăng bài Facebook" khỏi Sale Online.
- **Probe Graph**: page-level Insights (page_impressions/page_fans…) **đã deprecated v21** (#100 invalid). → engagement tính từ **bài đăng** (likes/comments/shares.summary chạy được nhờ pages_read_user_content). Ads: token có `ads_read` → `/me/adaccounts` + `/act_X/insights`.
- **Backend** (web2-fb-graph-service + route): `getPageBasic`, `getEngagementPosts` (per-post like/cmt/share + classify, fallback nếu thiếu quyền), `getAdAccounts`, `getAdInsights` (summary + campaign breakdown). Route `/engagement`, `/ad-accounts`, `/ad-insights`.
- **web2/fb-insights**: follower/đang-nói-đến, tổng tương tác + like/cmt/share, phân loại bài, **khung giờ + thứ đăng hiệu quả** (TB tương tác theo giờ GMT+7/DOW), top 10 bài. Verified: NhiJudy Store follower 160.723, tổng tương tác 5.895/25 bài.
- **web2/fb-ads-stats**: chọn tài khoản QC + khoảng (today/7d/30d/90d/max) → chi tiêu/hiển thị/reach/click/CTR/CPC/CPM/tần suất + kết quả (actions) + bảng chiến dịch + list tài khoản. ⚠ 3 tài khoản của login (Lê Minh Tú) **chưa có chi tiêu** → empty state + gợi ý đăng nhập tài khoản chạy QC. Verified endpoint OK.
- Tái dùng `fb-posts/fb-posts.css` + `fb-posts-api.js` (thêm engagement/adAccounts/adInsights). Chi tiết [[reference_web2_fb_posts]].

### [web2/fb-posts] Nhận diện loại bài + bộ lọc + bỏ auto-chọn page + ghi giá kiểu shop ✅

- **Phân loại bài** (`add3a5bcf`): video có `attachments.target.id` ∈ `live_videos.video.id` → **Livestream** (status LIVE=đang/VOD=đã); còn lại video/album-photo/text. Backend `getLiveVideoMap` (cache 60s) + `classifyPost`; `/list` trả `post.type`+`living`. (Đã verify Graph matching thủ công: target.id khớp video.id.)
- **Bộ lọc tab Bài viết** (`add3a5bcf`): chip Tất cả/🔴Livestream/🎬Video/🖼️Hình/📝Bài viết (lọc client-side trên `_posts` đã tải) + badge mỗi bài. Đếm hiện `X/Y` khi lọc.
- **Bỏ auto-chọn page** (`add3a5bcf`): `loadStatus` không tự tick page nữa (tránh đăng nhầm 4 page) — user tự chọn page muốn đăng. Validate publish vẫn yêu cầu ≥1 page.
- **Ghi giá kiểu shop** (`9e9e52245`): `fmtMoney` → rút gọn vui nhộn, hậu tố ngẫu nhiên k/xu/kk/kkk (14.000→14k/14xu/14kkk), triệu→1tr/1tr5; KHÔNG ghi "14.000đ"/"đ". AI prompt + SYSTEM_VI buộc dùng kiểu này. User chốt qua AskUserQuestion.

### [web2/video-maker] Tích hợp "chất Remotion" vào video-maker (spring/easing, KHÔNG Remotion) ✅

User muốn "tích hợp github.com/remotion-dev/remotion vào web 2.0". Research: Remotion = React + bundler + xuất MP4 nặng (Chromium/FFmpeg server hoặc Lambda) + **license CÓ PHÍ cho công ty ≥4 người**; đường client-side (webcodecs) đang bị Remotion phase-out sang Mediabunny + không chạy Safari/iOS. Web 2.0 lại vanilla JS no-bundler + đã có video-maker in-browser. → Hỏi user, chọn **hướng A: port Ý HAY của Remotion sang vanilla, KHÔNG ôm Remotion** (free, đúng kiến trúc).

- **MỚI `web2/video-maker/js/video-anim.js` (`Web2VideoAnim`)** — port 3 cốt lõi Remotion thuần vanilla on-device: `spring()` (nghiệm giải tích dao động tắt dần, overshoot + settle), `interpolate(x,[in],[out],{easing,extrapolate})` (clamp/extend), `Easing` (cubic/sine/easeOutBack + `cubicBezier` Newton-Raphson như CSS). Deterministic theo thời gian → preview & export khớp khung.
- **`video-render.js` cắm spring/easing** (defensive fallback nếu chưa load): transition ease `easeInOutCubic`; chữ tiêu đề/phụ đề "settle" theo lò xo (trồi lên + nảy nhẹ); Ken Burns êm bằng `easeInOutSine`. Thêm 2 preset: motion **"Nảy vào"** (`springin`) + transition **"Trượt nảy"** (`springslide`, overshoot ~1%) — tự hiện trong scene-editor.
- **Verify**: unit test spring 1.12→1.0 + interpolate/bezier/clamp 0 NaN (node); browser-test localhost — module load đúng thứ tự, `drawFrame` 41 khung qua transition **0 lỗi**, chụp preview render đẹp. KHÔNG React/bundler/license/server.

### [web2/fb-posts] Tab Bài viết: xem nguyên bài in-app + fix khoá scroll + infinite scroll ✅

- **Xem như FB** (`30071c024`): bấm thumbnail/Xem → popup `openViewer` render full bài — mọi ảnh (attachments+subattachments), nội dung giữ xuống dòng, like/cmt/share + 30 comment đầu (thấy cả comment chốt đơn KH), nút Mở FB. Backend `getPostDetail` (fallback ảnh+text nếu page thiếu pages_read_user_content). Verified: 6 ảnh, 9 cmt, 8 like.
- **Fix khoá scroll** (`2c552d62e`): `<main>` thiếu `class="web2-main"` → `.web2-shell{overflow:hidden;100vh}` cắt nội dung, không cuộn. Thêm class (scroll container = `.web2-main{overflow:auto}`). ⚠ Mọi trang web2 phải có class này.
- **Infinite scroll** (`2c552d62e`): `listPagePosts` trả `{posts, after}` (Graph paging cursor); `/list?after=`; frontend IntersectionObserver trên sentinel (root `main.web2-main`, rootMargin 400px) → cuộn gần đáy tự tải 25 bài/lần, đếm tăng, hết → "— Đã hết bài —". Verified: page2 khác hoàn toàn page1, scheduled chỉ page đầu, còn cursor. Chi tiết [[reference_web2_fb_posts]].

### [web2/fb-posts] Kết nối Facebook LIVE + fix 2 gotcha Graph (pages_manage_posts use case, /list #10) ✅

Kết nối thật xong: user **Lê Minh Tú**, 8 page bind (NhiJudy Store `270136663390370`…) trên service `web2-api`. Verified `/status` connected, `/list` trả bài thật, token đủ `pages_manage_posts`+`pages_read_engagement`.

**Gotcha 1 — `pages_manage_posts` không có sẵn:** app N2STORE (`1290728302927895`) cấu hình cho Ads → Explorer/consent KHÔNG hiện `pages_manage_posts` để tick (token chỉ có ads\_\*/pages_read_engagement/pages_show_list). Fix: App Dashboard › **Trường hợp sử dụng › thêm "Quản lý mọi thứ trên Trang"** → quyền xuất hiện → token mới có (Standard Access, app Doanh nghiệp + admin, KHÔNG cần App Review). `/connect` vẫn success khi thiếu (chỉ cần pages_show_list) nhưng không đăng được — nên verify `me/permissions`.

**Gotcha 2 — `/list` lỗi `(#10)` dù có pages_read_engagement:** `likes.summary/comments.summary/shares` đòi feature **"Page Public Content Access"** (App Review riêng). Fix (`cf83133e0`): `listPagePosts` chỉ lấy `id,message,created_time,full_picture,permalink_url,status_type` (chạy với page token); bỏ engagement counts ở UI (xem qua permalink). `/feed` cũng #10 → dùng `/posts`.

**OAuth flow** (`77bcfbcb1`): `/auth/login-url`+`/auth/callback`, redirect_uri `chatomni-proxy…/api/web2-fb-posts/auth/callback` (whitelist trong FB App, Strict Mode OK). Scope least-privilege 3 quyền (`077e15168`). "Dính web luôn" = lưu page token (long-lived). Cách connect không-trình-duyệt: dán User Token vào `FB_USER_TOKEN=` serect → `/connect`. Chi tiết MEMORY [[reference_web2_fb_posts]].

### [web2/zalo + extension + render] "Đăng nhập Zalo" 1-click (cookie phiên chat.zalo.me) + auto-renew + guard danh tính ✅

User: làm nút "Đăng nhập Zalo" 1-click (đừng để chữ "cookie/session") lấy phiên Zalo từ trình duyệt; tự gia hạn khi rớt; không thấy phiên → báo "đăng nhập https://chat.zalo.me/ trước".

Research 5-agent (workflow) chốt: trang web KHÔNG đọc được cookie zalo.me (khác origin) → phải qua **extension**. zca-js `login()` cần `{cookie, imei, userAgent}` khớp nhau (imei = `uuid + "-" + MD5(userAgent)`). IMEI = `localStorage.z_uuid`/`sh_z_uuid` trên chat.zalo.me (origin-bound → cần content script). Cookie = `chrome.cookies.getAll` (đọc cả httpOnly). Nguồn: ZaloDataExtractor + zca-js src.

**Extension** (`n2store-extension` v1.0.26→1.0.27, CWS auto-publish):

- Content script MỚI `content/zalo-creds.js` trên `*://chat.zalo.me/*` (ISOLATED world → đọc được page localStorage): đọc imei (`z_uuid`/`sh_z_uuid`) + userAgent → cache lên background (`ZALO_CREDS_CACHE`) + trả tươi khi hỏi (`ZALO_READ_CREDS`).
- `background/service-worker.js`: handler `GET_ZALO_CREDS` (cookies `chrome.cookies.getAll({url:'https://chat.zalo.me/'})` → shape zca-js Cookie[]; imei từ storage cache, fallback hỏi tab chat.zalo.me; thiếu cookie phiên → `no_session`, thiếu imei → `no_imei`) + `ZALO_CREDS_CACHE` (lưu chrome.storage.local).
- `content/contentscript.js`: thêm `GET_ZALO_CREDS` (INBOUND) + `_SUCCESS`/`_FAILURE` (OUTBOUND) cho cầu nối page↔ext (`Web2Ext.request`, taskId).
- `manifest.json`: thêm content_scripts chat.zalo.me. Quyền `cookies`/`storage`/`tabs`/`<all_urls>` đã có sẵn.

**Backend** (`render.com`):

- Route `POST /accounts/:key/login-cookie` {cookie,imei,userAgent} → `zca.loginWithCredentials(key, {…,language:'vi'}, label, {expectedUid})`. `_afterLogin` tự lưu session + status connected + SSE.
- **GUARD danh tính** (`web2-zalo-zca.js`): `_afterLogin` thêm `opts.expectedUid` — nếu slot đã biết uid mà phiên login ra uid KHÁC → throw `WRONG_ACCOUNT`, KHÔNG lưu (chống "lấy nhầm" phiên Zalo gắn vào slot tài khoản khác → corrupt). Nhờ guard này, auto-renew loop mọi TK an toàn (TK không khớp bị từ chối, chỉ TK đúng kết nối).

**Page** (`web2/zalo`):

- `web2-zalo-api.js`: `loginCookie(key, creds)`.
- `web2-extension-bridge.js`: failure trả kèm `data:m` (đọc được `reason` no_session/no_imei).
- `web2-zalo-accounts.js`: TK cá nhân chưa kết nối → nút CHÍNH **"Đăng nhập Zalo"** (data-act=zalologin) + phụ "Kết nối lại"/"QR". `loginZaloCookie()`: không có extension → nhắc cài; `no_session`/`no_imei` → Popup confirm "đăng nhập chat.zalo.me trước" (+ nút Mở chat.zalo.me). **Auto-renew**: `autoRenewZalo()` chạy 1 lần sau load — TK cá nhân rớt + có extension → silent cookie-login (guard backend đảm bảo đúng danh tính).
- index.html: load `web2-extension-bridge.js` + bump versions.

Files: `n2store-extension/{manifest.json, content/zalo-creds.js (mới), content/contentscript.js, background/service-worker.js}`, `render.com/{routes/web2-zalo.js, services/web2-zalo-zca.js}`, `web2/shared/{web2-zalo-api.js, web2-extension-bridge.js}`, `web2/zalo/{index.html, js/web2-zalo-accounts.js}`. `node --check` + manifest JSON PASS. ⚠ Cần: extension 1.0.27 live (CWS duyệt / load unpacked) + user đăng nhập chat.zalo.me bằng đúng TK rồi bấm "Đăng nhập Zalo".

### [render.com] Tách tuyệt đối Web 1.0 ⊥ Web 2.0 — DB/jobs/router + chống nhầm `chatDb` ✅

User: "tiếp tục làm triệt để tách biệt hoàn toàn web 1.0 và web 2.0" + "hàm và router phải nằm đúng chỗ" + "chatDb/chatDbPool không có 2.0/1.0 nên dễ nhầm". Đọc env cả 3 Render service qua API, audit 4 tầng:

- **TẦNG DB (gốc): boot-guard fail-fast MẶC ĐỊNH** (`server.js` ~167). Trước: `web2Pool||chatDbPool` chỉ exit khi `WEB2_REQUIRE_DB=1` (phụ thuộc nhớ set env). Giờ: `!web2Pool` → **exit(1) mặc định**, escape hatch DUY NHẤT `WEB2_ALLOW_CHATDB_FALLBACK=1` (monolith/local-dev). Hệ quả: process còn sống ⇒ `web2Pool` luôn non-null ⇒ **233 nhánh `web2Db||chatDb` ở 44 route + ensureSchema thành DEAD-SAFE** → Web 2.0 không thể ghi nhầm chatDb, đảm bảo bằng CODE không bằng env.
- **Audit cross-pool**: chiều Web 1.0→web2Db = **0 chỗ** (sạch). Chiều Web 2.0→chatDb = toàn bộ qua idiom (giờ dead-safe); 4 file nghi (livestream-images/snapshots, v2/kpi, purchase-refund) verify code chỉ chạm `web2_*`/`livestream_*` trên web2Db. Ngoại lệ CỐ Ý đọc chéo chatDb từ Web 2.0: **credential Pancake** (`pancake_accounts`/`pancake_page_access_tokens`) — infra dùng CHUNG, READ-ONLY.
- **TẦNG naming (chống nhầm)**: thêm alias `app.locals.web1Db = chatDbPool` (tên RÕ LAYER cho code Web 1.0) + comment chuẩn (chatDb===web1Db=Web1.0, web2Db=Web2.0). Sửa comment STALE: livestream-images "(chatDb pool)"→web2Db, purchase-refund "products ở chatDb"→web2Db.
- **TẦNG jobs**: mọi cron Web 2.0 sau `if(!DISABLE_WEB2_JOBS)`; job Web 1.0 (SIP) sau `if(WEB2_ONLY) return`. Đúng.
- **TẦNG router**: mọi mount `/api/*` Web 2.0 khớp worker `isWeb2Path` → web2-api. 3 mount tên trung tính `/api/users|quick-replies|social-orders/kpi-verify` verify Web 1.0 (chatDb) → đúng để rơi fallback.
- **Render env (qua API)**: web2-api `WEB2_ONLY=1`+`WEB2_REQUIRE_DB=1`+`WEB2_DATABASE_URL`+`WEB2_GEMINI_API_KEY`; fallback thêm `WEB1_ONLY=1` (đã có `DISABLE_WEB2_JOBS=1`+`WEB2_REQUIRE_DB=1`); **xoá biến chết `WEB2_SERVICE`**. web2-realtime chạy `live-chat/server`. `node --check` PASS.

### [web2/fb-posts] Audit chống ban page / bản quyền FB → sửa nội dung mặc định + cơ chế đăng ✅

Sau khi user dặn "chắc chắn từ/hình không dính bản quyền hoặc bị FB block/ban page" → chạy workflow audit đa-agent (23 agent: research 5 chính sách FB 2025-26 → audit code → adversarial verify → synthesize). Kết quả: **14 finding gom 5 vấn đề; CHỈ 1 là đường-ban thật (bản quyền media), còn lại là giảm-reach (demote), KHÔNG phải ban.** Đã sửa hết, không over-engineer (không chặn URL/hash/fingerprint — chỉ cảnh báo).

- **M1 (đường-ban thật) — bản quyền/nhạc media**: thêm cảnh báo cố định dưới thanh media (composer) "nên dùng Từ Kho SP, ảnh/video brand khác → gỡ + strike → khoá Page; video nhạc bản quyền → tắt tiếng/chặn"; nút **"Từ Kho SP ✓"** thành primary (an toàn nhất); cảnh báo nhạc khi dán URL video (`fb-posts-media.js promptUrl`). KHÔNG chặn cứng (ảnh shop/NCC hợp lệ).
- **S1 — engagement-bait + lộ SĐT công khai**: template `livestream` bỏ `Cmt "GIÁ" + số điện thoại` → CTA mời inbox. (Text/hashtag KHÔNG có rủi ro bản quyền — audit xác nhận; chỉ trademark mới tính, không áp dụng.)
- **S2 — clickbait/khan hiếm giả**: bỏ `SALE SỐC` ALL-CAPS, `kẻo hết size`, `số lượng có hạn—nhanh tay`, `xả kho`, `kẻo lỡ deal`; giữ giảm giá factual. Thêm hint dưới ô Khuyến mãi: "chỉ ghi KM có thật, giá ảo bị FB phạt".
- **S3 — nhồi hashtag**: `buildHashtags` 12 → **6** (FB 4/2025: 7+ hashtag → chỉ follower thấy + mất đề xuất).
- **S4 — đăng trùng 2 page dồn dập**: `/publish` thêm giãn cách **1.5s** giữa các page.
- **S5 — không xử lý rate-limit**: catch detect `fbCode 80001/32/4` → DỪNG vòng lặp (không retry mù) + message "FB tạm giới hạn, thử lại sau".
- **S6 — AI rewrite tái tạo bait**: `SYSTEM_VI` thêm chặn (không tag/share/comment-từ-khoá/xin SĐT công khai, không bịa KM, không ALL-CAPS/khẩn cấp giả).

GIỮ NGUYÊN (audit xác nhận over-caution): CTA "Inbox shop" (thao tác mua bán cốt lõi, không phải bait); không chặn URL/hash/fingerprint; text/hashtag không phải IP surface. `node --check` PASS 4 file; served file verified.

### [web2/video-maker] Goal 1 — Tạo video TỪ CHỦ ĐỀ (AI viết kịch bản, Gemini RIÊNG Web 2.0) ✅

User muốn "tự tạo video ngắn từ chủ đề như MoneyPrinter" + "đừng động Web 1.0, đưa key mới".

- **Route RIÊNG Web 2.0** `render.com/routes/web2-ai-script.js` → `POST /api/web2/ai-script/generate` {topic, products} → Gemini (`gemini-2.0-flash`, responseSchema JSON) viết `{narration, scenes:[{title,subtitle}]}`. Key **RIÊNG** `WEB2_GEMINI_API_KEY` (đặt trên service **web2-api-kv04**, KHÔNG dùng `/api/gemini` của Web 1.0). Mount trước generic. CF worker tự forward `/api/web2/*`.
- **Frontend** `video-ai-script.js` (`Web2VideoAiScript.generate`): gọi route web2, **fallback kịch bản mẫu** nếu chưa cấu hình key/lỗi → luôn có nội dung.
- **video-maker**: ô "Chủ đề" + nút "Tạo bằng AI" → chọn SP liên quan chủ đề (match tên) + ghép **ảnh SP thật** + lời AI vào textarea + chọn giọng → user "Tạo giọng đọc" → "Xuất video".
- Reuse engine video (render/tts/export) đã có. ⚠ **Chờ user đưa key mới** → set `WEB2_GEMINI_API_KEY` trên web2-api-kv04 thì AI mới chạy (chưa có key vẫn dùng được bằng kịch bản mẫu).
- 4 file `node --check` PASS. (Goal 2 model-AI mặc đồ + Goal 3 face-swap: cần API trả phí/GPU/đồng ý — chưa làm.)

### [web2/fb-posts] "Đăng nhập bằng Facebook" (OAuth) — liên kết 1 lần, dính web luôn (như Pancake/TPOS) ✅

User: "kết nối FB có quyền page như Pancake/TPOS được không? Tôi KHÔNG muốn dán token. Liên kết account 1 lần → account đó dính với web luôn."

→ Thêm **OAuth login flow** (Facebook Login), thay cho dán token thủ công (giữ làm fallback nâng cao):

- `web2-fb-graph-service.js`: `buildOAuthDialogUrl()` (dialog `facebook.com/v21.0/dialog/oauth`, scope `pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_engagement`), `exchangeCodeForToken(code, redirectUri)`, `hasApp()`.
- `routes/web2-fb-posts.js`: `GET /auth/login-url?return=` (trả URL dialog, state=b64(return), redirect_uri=`OAUTH_CALLBACK`) + `GET /auth/callback?code&state` (đổi code→token→long-lived→/me/accounts→lưu→HTML redirect về trang kèm `?fb_connected=1`). `safeReturn()` chống open-redirect. `OAUTH_BASE` = env `WEB2_FB_OAUTH_BASE` || worker URL.
- **"Dính web luôn"**: lưu **page access token** (sinh từ user token long-lived → gần như KHÔNG hết hạn). `/status` `connected = có page token` (không phụ thuộc user-token 60 ngày; `expired` chỉ cảnh báo mềm). Publish dùng page token.
- Frontend: overlay Kết nối có nút chính **"Đăng nhập bằng Facebook"** (khi `oauthAvailable`) + `<details>` "Cách nâng cao: dán token". Xử lý `?fb_connected=1`. `fb-posts-api.loginUrl()`.

**Setup 1 lần ở FB App**: thêm product **Facebook Login** → Valid OAuth Redirect URIs thêm `https://chatomni-proxy.nhijudyshop.workers.dev/api/web2-fb-posts/auth/callback`. App Live mode HOẶC user là admin/dev/tester (admin chủ shop đăng `pages_manage_posts` không cần App Review). Verify `node --check` PASS + browser-test nút OAuth render, 0 lỗi.

### [web2/fb-posts] Trang MỚI "Đăng bài Facebook" — quản lý + soạn/đăng/lên lịch 2 page (Graph API) ✅

User: "Thêm 1 group Facebook ở menu. Đọc hiểu Pancake (cookies serect) cho NhiJudyStore + NhiJudyHouse.VietNam. Chia 2 page quản lý bài viết, đăng bài, tự động tạo nội dung, lên lịch, ảnh/video, thông minh." + "tìm github hỗ trợ cho dễ" + "caption/hashtag free github? Gemini mất tiền/lâu".

**Phát hiện then chốt (research 1 agent GitHub/web)**: Pancake/pages.fm **CHỈ đọc** bài viết (`GET pages/{id}/posts`) — **KHÔNG có API tạo/lên lịch/upload bài**. Bài trong Pancake do app livestream (PRISM Live) đẩy lên. → Đăng/lên lịch **PHẢI qua Meta Graph API**. May là repo **đã có FB App** (`FB_APP_ID/SECRET` + `fb-ads.js`: OAuth long-lived, `/me/accounts` → page token, list posts) → tái dùng được. Quyết định user: **auto-publish + lịch THẬT qua Graph API** + AI free.

**Backend** (WEB2.0, web2Db, KHÔNG đụng Web 1.0):

- `services/web2-fb-graph-service.js` — publish/schedule (feed/photos/multi-photo carousel/videos), `scheduled_publish_time` (10'–30 ngày), delete, list posts + scheduled. Hàm thuần nhận pageToken.
- `services/web2-caption-service.js` — caption+hashtag tiếng Việt **template offline FREE** (mặc định, tức thì) + AI rewrite tuỳ chọn ưu tiên **Groq (free, nhanh)** → DeepSeek → Gemini (đọc env, fallback template nếu thiếu key). Hashtag bank theo danh mục.
- `routes/web2-fb-posts.js` — connect (dán user token → exchange long-lived → /me/accounts → lưu page token), /status, /pages, /caption, /publish (đa page), /list, /delete, /draft CRUD. Bảng `web2_fb_post_tokens` + `web2_fb_posts` (web2Db). SSE `web2:fb-posts`. **Page token KHÔNG bao giờ trả browser.** Media gửi FB qua URL công khai (Kho SP / imgbb-upload).
- `server.js`: mount `/api/web2-fb-posts` + initializeNotifiers + ensureSchema (root-level, không bị shadow `/api/web2`).

**Worker**: `WEB2_FB_POSTS` (config/routes.js pattern+matcher + worker.js switch → handleCustomer360Proxy). **CẦN deploy worker.**

**Frontend** `web2/fb-posts/` (modular): `index.html` + `fb-posts.css` (token web2-theme, xanh `--web2-primary`) + js: `fb-posts-api` (1 nguồn fetch), `-media` (URL/upload imgbb/Kho SP picker), `-composer` (page chips đa chọn + product fields + style chips + tạo free/AI + media + lịch GMT+7 + đăng/lưu nháp), `-list` (quản lý bài đã đăng + đã lên lịch, xoá), `-drafts` (Lịch & Nháp agenda theo ngày, sửa→composer/đăng/xoá), `-app` (orchestrator: sidebar, tabs, kết nối FB overlay, SSE).

**Sidebar**: thêm "Đăng bài Facebook 📢" trong nhóm Sale Online.

Verify: `node --check` PASS hết. Browser-test localhost (nav overview→fb-posts): title OK, sidebar mount, 3 tab render, 4 card composer, style chip, connect overlay (token + link Graph Explorer + 4 bước), **0 console error**. (Backend chưa deploy → pill "Chưa kết nối" đúng kỳ vọng.)

**Cần để chạy LIVE**: (1) deploy Render (server.js) + deploy worker Cloudflare; (2) set `GROQ_API_KEY` env trên Render (giá trị #38 serect_dont_push.txt) cho nút "AI viết lại" — template free chạy không cần; (3) FB_APP_ID/SECRET đã có ở Render (fb-ads dùng); (4) user bấm "Kết nối" → dán user token có quyền `pages_show_list,pages_manage_posts,pages_read_engagement`.

### [web2/jt-tracking] Tự cập nhật trạng thái J&T khi MỞ trang (bỏ nút "Làm mới tất cả") ✅

User: "cập nhật trạng thái realtime được không? Bỏ nút cập nhật trạng thái đi nếu có realtime — cần thông tin chính xác để làm việc với shipper." Trạng thái = "Đang giao/Vấn đề/…". Chốt: **auto khi MỞ trang** (không cron 24/7) + **bỏ nút bulk, GIỮ nút từng dòng**.

J&T KHÔNG push realtime → phải tra lại. Tra dồn dập dễ bị jtexpress chặn (đã từng giới hạn bulk 15/06). Giải pháp browser-driven (chỉ chạy khi đang xem trang → nhẹ J&T nhất):

- **Backend** `/refresh` thêm `mode:'active'`: tra các đơn `approved_at IS NULL AND status NOT IN ('delivered','returned')` (Đang giao/Trung chuyển/Vấn đề/Chưa tra/Không thấy), `ORDER BY last_fetched_at ASC`, batch 15, paced (CONC 3 + 350ms). Đổi trạng thái → `_notify('refresh')` → SSE `web2:jt-tracking` → mọi tab/máy reload.
- **Frontend** `jt-tracking-actions.js`: `autoRefreshActive()` (gọi `/refresh {mode:'active'}` im lặng, gate `visibilityState==='visible'`, throttle 30s) + `startAutoRefresh()` (chạy 1 lần sau load + mỗi 90s khi tab visible + tra ngay khi quay lại foreground). `app.js` gọi `A.startAutoRefresh()` sau `load()`.
- **UI**: bỏ nút "Làm mới tất cả" → thay bằng chip non-click **"🔄 Tự động cập nhật"** (`#jtAutoStatus`, xoay khi đang tra). GIỮ nút làm mới ↻ TỪNG DÒNG (force tra 1 đơn ngay trước khi gọi shipper). CSS `.jt-auto-indicator`/`.is-syncing`.

Files: `render.com/routes/web2-jt-tracking.js`, `web2/jt-tracking/{index.html, css/jt-tracking.css, js/jt-tracking-actions.js, js/jt-tracking-app.js}`. `node --check` PASS. Vòng đủ ~66 đơn active / batch 15 mỗi 90s ≈ 7 phút/vòng — tươi đủ làm việc với shipper, không hammer J&T.

**Follow-up**: gồm cả **'returned' (Đã hoàn)** vào auto (đổi `status NOT IN ('delivered','returned')` → `status <> 'delivered'`) — vì 'returned' gồm cả "đang chuyển hoàn → về kho → hoàn thành công", chi tiết còn đổi khi hàng đang về shop. CHỈ 'delivered' (khách ký nhận) là chốt. Đơn hoàn xong → user "Duyệt" để ngừng tra.

### [web2/zalo + render] Tài khoản Zalo CHÍNH gửi tin KH 1-1 (mặc định "Nhijudy Ơi") + nút đổi ✅

User: gửi tin nhắn KH (bấm SĐT ở jt-tracking…) phải dùng tài khoản **"Nhijudy Ơi"** (UID 711743163298674606), KHÔNG để hệ thống tự chọn. Chốt phạm vi: **toàn hệ thống + nút đổi ở trang Zalo**.

Điều tra: 2 TK cá nhân — `zca_7c8093f1…`=Nhijudy Ơi, `zca_55477969…`=My Njd. Nhóm J&T "XỬ LÝ NJD" thuộc **My Njd** (Nhijudy Ơi không là thành viên nhóm nào) → reply TRONG nhóm buộc My Njd (Zalo chỉ cho member gửi). Còn **nhắn KH 1-1** trước đây `/conversation/ensure` chọn "TK personal connected đầu tiên theo updated_at" → không cố định.

Giải pháp (khái niệm "TK chính"):

- DB: thêm cột `web2_zalo_accounts.is_primary` (ALTER idempotent + CREATE). Seed `zca_7c8093f1…` làm primary KHI chưa có primary nào (idempotent, đổi sau bằng UI).
- Route `POST /accounts/:key/primary` (personal-only, atomic `is_primary=(account_key=$1)`) + SSE `web2:zalo:accounts`. `_safeAccount` trả `isPrimary`.
- `/conversation/:phone` + `/conversation/ensure`: ƯU TIÊN hội thoại/TK dưới **primary** (`_getPrimaryKey`), pick account `ORDER BY is_primary DESC`. Chưa đặt primary → fallback hành vi cũ (an toàn).
- Frontend trang Zalo: badge **"⭐ TK chính"** trên card primary + nút **"Đặt làm chính"** trên card personal khác → `ZaloApi.setPrimary(key)` → reload. CSS `.wz-acc-primary`/`.is-primary`.

Files: `render.com/routes/web2-zalo.js`, `render.com/db/web2-zalo-schema.js`, `web2/shared/web2-zalo-api.js`, `web2/zalo/{index.html, js/web2-zalo-accounts.js, css/web2-zalo.css}`. `node --check` PASS. ⚠ 2 TK đang ngắt kết nối → cần quét QR lại "Nhijudy Ơi" thì gửi tin mới chạy; preference đã set sẵn.

### [web2/video-beauty] Trang MỚI "Làm đẹp video" on-device + fix treo nhận diện mặt (CPU) + preload ✅

User: "tất cả chức năng beauty video như hình ảnh" + "render bằng cpu chứ không phải gpu?".

**Trang mới `web2/video-beauty/`** (menu Đa dụng) — làm đẹp VIDEO 100% trên máy, giữ tiếng gốc:

- `video-beauty-render.js` (`Web2VideoBeautyRender.applyFrame`): lọc màu (ctx.filter) + mịn da/trắng da/ấm (Web2BeautyFilters skin) + chỉnh mặt (Web2BeautyFace landmarks → warp). Tái dùng engine ảnh.
- `video-beauty-export.js`: **exportRealtime** (MediaRecorder, mịn da+lọc màu, giữ tiếng — mượt, full FPS) + **exportRenderPass** (WebCodecs + **mp4-muxer@5** CDN, tua từng khung nhận diện+warp mặt, mux lại tiếng AAC — chậm hơn nhưng FPS đầy đủ + có thanh tiến trình).
- `video-beauty.js`: tải video → preview realtime + sliders (mịn da/trắng da/ấm/lọc màu/chỉnh mặt) → xuất, có fallback realtime nếu render-pass lỗi.
- **Verified live** (browser-test, tự sinh video face test): realtime→MP4 hợp lệ phát được; render-pass face→MP4 607KB phát được + mux tiếng.

**Fix treo "Đang nhận diện khuôn mặt" (photo-editor + dùng chung):**

- `web2-beauty-face.js`: GPU/WebGL infer lần đầu treo ~chục giây (biên dịch shader) → **đổi sang CPU (XNNPACK)** cho ảnh tĩnh 1 lần (nhanh+ổn) + downscale 1024 + watchdog 25s. Verified real face ~3.5s cold.
- `photo-editor.js`: **preload `warmup()` ở nền khi tải ảnh** → bấm công cụ mặt chỉ ~1s (cache → tức thì lần sau). Engine MediaPipe ~13MB (model 3.76MB + wasm 9.5MB), KHÔNG phải 4MB.

Research GitHub 4-agent (tách nhạc / video beauty / trích audio / encode) trước khi build → xác nhận Web Audio karaoke + WebCodecs+mp4-muxer là hướng đúng.

### [web2/video-maker] Chỉnh chi tiết từng cảnh + nhạc nền (chèn/ghép/tách) + trích audio ✅

User: "thêm chỉnh sửa chi tiết video" + "ghép nhạc, chèn nhạc, tách nhạc".

- `video-render.js` mở rộng (tương thích ngược, default cũ): mỗi cảnh chỉnh **chuyển động** (phóng/thu/lia trái-phải/tĩnh) · **hiệu ứng vào** (mờ/trượt/phóng/qua đen/cắt) · **bộ lọc màu** · **vị trí chữ** (dưới/giữa/trên) · **khung hình** (lấp đầy/vừa khung + màu nền). Thời lượng chuyển cảnh chỉnh được.
- `video-scene-editor.js` (mới): UI khối chi tiết mỗi cảnh (toggle ⚙). `video-maker.js`: bulk "áp dụng cho mọi cảnh".
- `video-audio.js` (mới, `Web2VideoAudio`): **chèn/ghép nhạc nền** (mix giọng đọc + nhạc, chỉnh âm lượng từng kênh trong play + export) · **tách nhạc karaoke** (Web Audio L−R: lấy nhạc bỏ giọng / lấy giọng) · **trích audio** từ video (decodeAudioData) → xuất **.wav**.
- Verified live: detail select (transition/motion/bg) cập nhật scene + render OK; module load OK.

### [web2/jt-tracking + shared/zalo-chat] Sort theo giờ Zalo + bỏ "Chuyển tiếp" + fix react/reply ✅

User (2 ảnh): **(1) Trang Tra cứu vận đơn J&T** — sắp xếp theo **thời gian Zalo mới nhất ở trên cùng** + hiển thị thời gian chi tiết. **(2) Khung chat "Nhóm Zalo nguồn"** — bỏ nút **Chuyển tiếp**, fix nút **react bấm không được**, fix **bug reply tin nhắn**. ⚠ User dặn KHÔNG test vì Zalo đang là dữ liệu THẬT → chỉ sửa code, không gửi thử.

**(1) Sort theo giờ Zalo** — trước đây `/list` ORDER BY `latest_at` (giờ sự kiện J&T) → mã có cập nhật J&T mới nhảy lên đầu, không theo lúc đơn xuất hiện trong nhóm Zalo. Thêm cột `src_at BIGINT` (epoch ms tin Zalo chứa mã) vào `web2_jt_tracking` (idempotent ALTER + index). Bắt giá trị ở cả 3 đường quét: `/scan` (SELECT thêm `m.sent_at`, ORDER BY sent_at DESC → lần gặp đầu = mới nhất), `/scan-history` (track max `m.sentAt`/mã), `/scan-text` (`_parsePasteDate`). Upsert `src_at = GREATEST(cũ, mới)` (mã post lại → bump). `/list`: trả `src_at`, `ORDER BY (approved), COALESCE(src_at, created_at) DESC, updated_at DESC`. Frontend: `fmtAbs(epoch)` (GMT+7 `YYYY-MM-DD HH:MM:SS`) + row meta hiện giờ Zalo chi tiết (fallback giờ J&T nếu row cũ chưa có src_at).

**(2a) Bỏ "Chuyển tiếp"** — gỡ button `data-act="forward"` khỏi `tools()` ([web2/shared/zalo-chat/bubbles.js](../web2/shared/zalo-chat/bubbles.js)). Áp dụng cho MỌI surface chat Zalo (shared).

**(2b) React bấm không được = z-index** — thanh cảm xúc (`reactions.js`) append vào `document.body` với `zIndex:1250`, nhưng drawer chat KH `.w2cc-back` = `z-index:1300` (nền trắng đục) → thanh react nằm SAU drawer → không thấy/không bấm được. Bump lên `100000`.

**(2c) Reply không thành quote thật** — client chỉ gửi `{msgId, preview}`, backend `/send-message` cần `replyTo.quote` = OBJECT thô (SendMessageQuote) để zca-js dựng reply → quote=null → tin gửi đi KHÔNG phải reply. Fix `chat-view.js`: `buildReplyQuote(m)` dựng `{content(string), msgType:'webchat', uidFrom, msgId, cliMsgId, ts, ttl, propertyExt}` từ field tin gốc đã lưu. Backend `web2-zalo-zca.js send()`: **try quote → nếu Zalo từ chối (shape dựng lại lệch) gửi LẠI không quote** (degrade về tin thường, không nuốt tin user). Verify zca-js `dist/apis/sendMessage.js`: text content string qua được validate `webchat`.

Files: `render.com/routes/web2-jt-tracking.js`, `render.com/services/web2-zalo-zca.js`, `web2/shared/zalo-chat/{bubbles,reactions,chat-view}.js`, `web2/shared/web2-zalo.js` (ENGINE_VER bump), `web2/jt-tracking/{index.html,js/jt-tracking-api.js,js/jt-tracking-render.js}`. `node --check` toàn bộ PASS. KHÔNG browser-test (user dặn — Zalo data thật).

### [web2/photo-editor] Studio làm đẹp kiểu Meitu (on-device) + 10 công cụ nhanh + mặc định Photopea ✅

User: "mặc định photopea với các chức năng chỉnh nhanh ở hình → beauty, xoá logo vùng chọn, làm đẹp, kéo chân, chỉnh màu da, mặt, mắt, mũi, miệng".

Build **engine làm đẹp DÙNG CHUNG** (rule Web 2.0 — module nhỏ, 1 nguồn), 100% on-device (KHÔNG server, KHÔNG upload). Tách 3 module trong `web2/shared/beauty/`:

- **`web2-beauty-filters.js`** (`Web2BeautyFilters`) — nhân pixel thuần: `warp()` liquify backward-map (bloat/pucker/push + bilinear clamp, 0 NaN/0 lỗ) · `buildSkinMask`/`smoothSkin`/`adjustSkinTone`/`beautify` (skin YCbCr Cb77-127 Cr133-173 + frequency-separation lite, giữ chi tiết) · `stretchBand` (kéo dài dọc band-scale native drawImage + seam blur).
- **`web2-beauty-face.js`** (`Web2BeautyFace`) — MediaPipe **FaceLandmarker** (478 điểm, refined irises, model float16) lazy-load CDN @0.10.18 (GPU→CPU fallback) + bảng index điểm mốc + `buildBrushes(det,tool,strength)` dựng brush liquify cho mắt/mũi/mặt/môi.
- **`web2-beauty-studio.js`** (`Web2BeautyStudio.open(src,{tool})→Promise<dataURL>`) — UI overlay canvas + slider per-tool + Áp dụng (bấm nhiều lần tăng dần) / Hoàn tác / Đặt lại / Lấy ảnh về. Tool legs có 2 đường kéo chọn vùng. Cap work 1800px.

Trang `web2/photo-editor/` đổi luồng: tải ảnh → hiện ảnh nguồn + **10 tile** (Làm đẹp tự động · Mịn da · Màu da · Mắt to · Mũi thon · Mặt V-line · Môi · Kéo chân · Xoá logo→Web2LogoEraser · Chỉnh nâng cao→Photopea). Checkbox Photopea **mặc định CHECKED**. Reuse Web2LogoEraser + Web2ImageEditor.

Files: `web2/photo-editor/{index.html,photo-editor.css,js/photo-editor.js}` + 3 module beauty mới.

- **Verified live** (browser-test): 3 module load OK · smooth/tone/legs end-to-end (broken:false, 0 err) · legs 900→945px đúng band-scale · **face warp unit-test fabricated landmarks: eyes/nose/face/lips → 0 NaN, brush 2/3/10/2, pixel thay đổi** · MediaPipe FaceLandmarker tải+chạy (CPU delegate) + ảnh không có mặt → banner đúng. Research 4-agent (MediaPipe indices, liquify math, skin smoothing, leg stretch) trước khi code.

### [web2/multi-tool] Fix "Tăng số lượng comment" — lần 2 trở đi không tăng số (reply vào root, không reply vào boost) ✅

User: lần TĂNG ĐẦU thì số bình luận FB của bài live tăng; nhưng "khi đã tăng rồi thì bình luận nội dung sẽ khác nên nó không tăng số lượng bình luận nữa".

**RCA (browser-test live, read-only)**: `run()` chọn target reply bằng `msgs.filter(m=>m&&m.id).pop()` = message MỚI NHẤT. fetchMessages trả mảng xếp **cũ→mới** (verified: first2 ts `05:45:17/19` < last2 `05:45:30`) → `.pop()` = mới nhất. Hội thoại "Hong Ngoc Nguyen Thi" đã boost trước đó nên 25 message mới nhất ĐỀU là **comment boost do page tự tạo** (from=`117267091364524`, text random `iMy5d6w7`…). ⇒ Lần 2 reply_comment target = một **boost reply (nested)**. Reply vào nested-reply **KHÔNG cộng** số đếm bình luận của BÀI VIẾT trên FB như reply vào **comment GỐC top-level** → gửi OK (0 lỗi) nhưng số không nhúc nhích. Lần đầu chạy được vì hội thoại còn mới → `.pop()` == comment gốc (`conv.id`).

**Fix** ([web2/multi-tool/js/multi-tool.js](../web2/multi-tool/js/multi-tool.js) `run()`): bỏ block fetchMessages `.pop()`, dùng thẳng `const messageId = conv.id` (comment GỐC top-level = `<post_id>_<comment_id>` của KH). Mỗi run reply vào root → mỗi reply = +1 đúng như lần đầu, ổn định qua mọi lần chạy. Gỡ `custId` (không còn dùng).

- Verified: page reload sạch (0 console err, Web2Chat ready, 5 page). Live count-test (gửi reply thật so root vs reply target) bị chặn đúng (outward-facing FB write) → KHÔNG chạy; kết luận dựa trên bằng chứng code + ordering thực nghiệm + khớp mô tả user.
- Follow-up (đề xuất, chưa làm): rải đều target qua NHIỀU comment gốc (round-robin các hội thoại) để chống FB giới hạn 1 thread khi tăng số lớn lặp lại.

### [web2/photo-editor] Trang MỚI "Chỉnh sửa ảnh" + module dùng chung Web2ImageEditor (Picsart-lite) ✅

User hỏi tích hợp editor ảnh kiểu Picsart/Meitu vào web HTML → build **module dùng chung** (rule Web 2.0) `web2/shared/web2-image-editor.js` (`Web2ImageEditor.open(src)→Promise<dataURL>`) bọc **Filerobot Image Editor** (MIT, vanilla, on-device, lazy-load CDN). Tabs: Cắt&Xoay/Tinh chỉnh/Bộ lọc/Annotate/Watermark/Kích thước (dịch VI). Trang mới `web2/photo-editor/` (Đa dụng) = launcher (tải máy/dán/kho SP → editor → Tải PNG/Copy). **Wire reuse** vào product-card (nút "Chỉnh sửa"). Đăng ký sidebar + WEB2_PAGES.

- Verified live: Filerobot lazy-load + render OK (canvas + tabs VI + Lưu), 0 JS err.
- **"Full Picsart/Meitu" verdict**: không có OSS clone 1:1. Picsart-full nhất = Filerobot (MIT, đang dùng) hoặc Photopea (Photoshop-grade, free nhưng proprietary iframe). Meitu-full (AI beautify) = KHÔNG có OSS — chỉ ghép MediaPipe+WebGL. Link LobeHub user gửi = **Meitu AI Open Platform cloud API** (MCP skill): full tính năng (cutout/beauty/gen/try-on) NHƯNG **trả phí + cần API key + chạy server-side** (upload ảnh lên Meitu), KHÔNG nhúng in-browser.

### [native-orders] Đơn Inbox hiện avatar — resolve fbId từ KHO trước (không cần login Pancake) ✅

User: đơn thêm ở tab "Đơn Inbox" không hiện avatar (đơn livestream/web có). RCA: `_hydrateInboxAvatars` chỉ resolve fbId qua `_resolveInboxConvByPhone` (Pancake — cần login); chưa login → không avatar. Kho KH (`/api/web2/customers/<phone>`) THỰC CÓ `fbId` (verify 0908123456 → 24948162744877764).

- `native-orders-inbox-resolve.js`: thêm `_khoFbByPhone(phone)` (kho local) → `_hydrateInboxAvatars` **kho trước, Pancake sau**. Relax `_avatarUrl`: pageId TÙY CHỌN (avatar lấy được chỉ với fbId, khớp `renderAvatar`).
- Verified live: tab Đơn Inbox → "Huỳnh Thành Đạt" resolve fbId từ kho → avatar hiện (không cần login Pancake); 0 JS err.

### [web2/product-card] Công cụ Xoá logo/watermark + bỏ placeholder tên rỗng ✅

`Web2LogoEraser` (`web2/shared/web2-logo-eraser.js`): kéo chọn vùng logo / Tự dò (edge-density) → fill content-aware → ảnh sạch; wire nút "Xoá logo" vào product-card. Tên SP rỗng → KHÔNG vẽ "Tên sản phẩm" (3 layout). Verified: open→auto→erase→done trả PNG.

### [web2-chat] Pancake bypass-extension "lỗi" = chưa login (revert + nhắc đăng nhập) ✅

User xác nhận lỗi bypass chỉ do CHƯA đăng nhập Pancake/Facebook (không phải bug). Revert phần surface-error/ping. Giữ: gửi tin lỗi → nhắc đăng nhập business.facebook.com + pancake.vn.

### [web2/video-maker] NHIỀU GIỌNG + giọng mẫu + nút Tạo ngẫu nhiên ✅

Mở rộng video-maker theo yêu cầu user:

- **Nhiều giọng THẬT (4)** in-browser, on-device, miễn phí: **MMS** (`Xenova/mms-tts-vie`, transformers.js) + **3 giọng Piper** (`vits-web`: `vi_VN-vais1000-medium`/`25hours_single-low`/`vivos-x_low`). Mỗi engine trả `{samples,sampleRate}` (Piper = WAV Blob → `decodeAudioData`) để mux đồng nhất. Voice registry trong `Web2VideoTTS` (`VOICES`/`TONES`/`synthesize({voiceId,pitch})`).
- **Tông giọng** (Trầm/Chuẩn/Cao) = pitch resample (ghép pitch+tempo, linear-interp) áp lên bất kỳ giọng nào → nhiều biến thể.
- **Giọng mẫu**: mỗi giọng có nút 🔊 nghe thử 1 câu mẫu (`SAMPLE_TEXT`), cache theo `voiceId|tone`.
- **Nút "Tạo ngẫu nhiên từ kho SP"**: lấy ngẫu nhiên ≤5 SP có ảnh (`Web2ProductsCache`) → scenes (ảnh+tên+giá, dur 2.5-3.5s) + **tự sinh lời đọc** (intro+SP+giá+CTA ngẫu nhiên) + random màu nhấn + random giọng. Kho rỗng → báo "thêm ảnh tay".
- Files: `web2/video-maker/js/video-tts.js` (rewrite registry), `js/video-maker.js` (voice UI + sample + random), `index.html` (#vmVoices/#vmTones/#vmRandom), `video-maker.css`.
- **Verified live**: 4 voice cards + 3 tone + 4 nút mẫu render OK; registry route đúng cả 3 path (MMS 23808@16k, pitch-high ngắn hơn, Piper vais 26749@48k); random tạo 5 scene + narration auto + accent/voice random; 0 JS err. (Kokoro vẫn KHÔNG có tiếng Việt → MMS+Piper.)

### [inventory-tracking] Thêm nút "Cập nhật từ TPOS" PER-ROW trong modal Tạo đơn đặt hàng ✅

**User:** "bổ sung tiếp nút Cập nhật từ TPOS cho từng dòng SP (sync nhanh 1 SP, không cần quét hết — dùng WarehouseAPI.syncProductFromTpos đã có sẵn)."

Bổ sung sau nút full-sync ở footer: mỗi dòng SP **chọn từ kho TPOS** (`item.tposProductId`) có thêm nút ☁ ở cột THAO TÁC (cạnh nút xóa) để làm tươi RIÊNG 1 SP, không quét toàn bộ catalog.

**Files:** [inventory-tracking/js/modal-convert-po.js](inventory-tracking/js/modal-convert-po.js), [inventory-tracking/css/modal-convert-po.css](inventory-tracking/css/modal-convert-po.css), [inventory-tracking/index.html](inventory-tracking/index.html)

- `_renderItemRow`: nút `po-btn-sync-row` (icon `cloud-download`) trong `po-col-act`, **chỉ render khi `fromWarehouse`** (dòng gõ tay không có template id → không sync được).
- `_applySuggestPick`: chèn nút sync in-place vào cột thao tác khi pick từ dropdown (row pick KHÔNG re-render bảng nên phải inject tại đây, idempotent).
- `_onItemClick`: nhánh `.po-btn-sync-row` → `_syncRowFromTpos(key, btn)`.
- Hàm mới `_syncRowFromTpos`: guard `tposProductId` → `WarehouseAPI.syncProductFromTpos(id)` (POST `/sync-product/:id`, server ép sync 1 template TPOS → upsert shadow → trả product TPOS-shaped) → cập nhật in-place **tên (strip `[CODE]`) / giá bán / mã / ảnh**, GIỮ NGUYÊN **giá mua + SL** user nhập. Toast `giá + tồn`. Nút spinner (loader) lúc chạy.
- CSS: `.po-btn-sync-row` (indigo, spin svg khi disabled) + nới `.po-col-act` 60→92px (chứa 2 nút). Bump cache-bust CSS+JS `?v=20260619a`.

**KHÔNG đụng:** backend (endpoint `/sync-product/:id` + `WarehouseAPI.syncProductFromTpos` đã có sẵn — soluong-live dùng), DB, full-sync footer button. node --check OK.

**Status:** ✅ code xong (Web 1.0). Verify sau deploy: chọn SP từ kho trong modal → thấy nút ☁ ở cột thao tác → bấm → spinner → toast giá/tồn mới, dòng cập nhật tên/giá; giá mua + SL giữ nguyên.

### [upload/Render] FIX up ảnh BILL lỗi (inventory-tracking + balance-history) — bỏ Firebase Storage → Postgres bytea ✅

**Bug (user báo):** "UP HÌNH BILL SP KO ĐƯỢC" — up ảnh lỗi (hiện "Lỗi") ở **2 chỗ**: `inventory-tracking` modal "Thêm Đợt Hàng Mới" → ô "Ảnh hóa đơn", và `balance-history` modal "Duyệt giao dịch" → ô "Hình ảnh xác nhận chuyển khoản".

**RCA:** 2 frontend ĐỘC LẬP (`modal-shipment.js`, `accountant.js`) cùng POST 1 endpoint chung `POST /api/upload/image` → worker → Render `n2store-fallback` → `firebaseStorageService.uploadBase64Image()` → Firebase Storage. Loại trừ live: Render khoẻ (`/api/upload/health`=200), worker proxy OK, **Firebase init OK** (probe DELETE chạm logic, không phải 500 "Missing credentials"), body limit 100mb, code upload không đổi nhiều tháng. **Diagnostic POST thật chốt lỗi:** `500 {"error":"Invalid response body while trying to fetch https://www.googleapis.com/oauth2/v4/token: Premature close"}` → **Firebase Admin SDK lấy OAuth2 token từ Google FAIL** ở bước GHI file (server-side, không phải code Render). Không fix được trong code nếu giữ Firebase.

**Fix (user chốt "chuyển hoàn toàn sang Postgres bytea, bỏ Firebase"):** migrate `/api/upload/image` sang Postgres `upload_images` (BYTEA) — đúng pattern `purchase_order_images` (migration 046). **Giữ NGUYÊN contract** (`POST /api/upload/image` base64 in → `{success,url}`) ⇒ **2 frontend KHÔNG đổi**. URL trả `https://n2store-fallback.onrender.com/api/upload/images/<id>` (serve trực tiếp Render cho `<img src>`, cache-immutable).

- `render.com/migrations/050_create_upload_images.sql` (mirror 046) + lazy `ensureUploadImagesTable` trong route (fresh-deploy an toàn).
- `render.com/routes/upload.js` viết lại: `POST /image` (base64→BYTEA), `GET /images/:id` (serve), `DELETE /image` (route theo URL: Postgres mới vs Firebase legacy best-effort). Pool `chatDb` thuần (Web 1.0, KHÔNG web2\_ / web2Db).
- `firebase-storage-service.js` **GIỮ NGUYÊN** (Telegram bot `telegram-bot.js` + `quy-trinh.js` còn dùng `uploadImageBuffer`/`getFirestore`) — chỉ thôi gọi upload từ `upload.js`.
- Ảnh cũ (URL firebasestorage…) vẫn ĐỌC được qua download-token (GET công khai, không cần OAuth) → không cần backfill gấp.

### [web2/video-maker] Trang MỚI "Tạo video sản phẩm" + giọng đọc tiếng Việt on-device (Đa dụng Web 2.0) ✅

Tiện ích in-browser ghép ảnh SP → video slideshow (Ken Burns zoom + crossfade + overlay chữ) kèm **giọng đọc tiếng Việt tạo NGAY TRÊN MÁY** → xuất MP4/WebM. 100% trình duyệt, không server, không gửi data đi.

- **Video**: canvas render từng frame (`Web2VideoRender`) → `canvas.captureStream(30)` → `MediaRecorder` (ưu tiên `video/mp4`, fallback webm). Scenes: ảnh + tiêu đề + phụ đề + thời lượng, đổi thứ tự ↑↓. 3 tỉ lệ (16:9 / 1:1 / 9:16).
- **TTS tiếng Việt MIỄN PHÍ on-device** (`Web2VideoTTS`): **MMS-TTS-vie** (`Xenova/mms-tts-vie`) chạy bằng transformers.js (ONNX/WASM) trong browser → Float32Array 16kHz → mux vào video qua `AudioContext.createMediaStreamDestination` + `addTrack`. Lazy-load lib+model CDN (lần đầu ~vài chục MB, sau cache). Fallback "Nghe nhanh" = `speechSynthesis` (giọng máy, không mux). **Kokoro-FastAPI KHÔNG có tiếng Việt → chọn MMS-TTS-vie.**
- Files: `web2/video-maker/{index.html, video-maker.css, js/video-tts.js, js/video-render.js, js/video-maker.js}`. Đăng ký sidebar + WEB2_PAGES.
- Verified live: render scene OK, export **MP4 thật** (silent 0.1MB & có tiếng 0.7MB/3.4s — audio mux đúng), TTS sinh giọng Việt thật (55040 samples/16kHz = 3.4s "Áo thun trắng…"), 0 JS err.
- ⚠ Không đụng AI KOL Studio (Web 1.0) — user chốt làm video trong Đa dụng Web 2.0.

### [web2/product-card] Trang MỚI "Tạo card sản phẩm" (Đa dụng Web 2.0) ✅

Tiện ích in-browser tạo ảnh card/poster SP để đăng FB/Zalo/Story — 100% on-device, không server. Chọn SP từ kho (`Web2ProductsCache`) hoặc tải/paste ảnh tay → render canvas → export PNG / copy clipboard. Ăn khớp Studio tách nền (toggle "ảnh tách nền" → contain ảnh PNG trong suốt).

- **Vẽ thẳng lên `<canvas>`** (1 nguồn cho preview + export → không lệch, không cần lib DOM→image). 4 template (Sale Bold / Clean / Editorial / Pop), 4 size (vuông 1:1, story 9:16, ngang 1.91:1, dọc 4:5), 7 màu nhấn, badge, giá (format vi-VN), mô tả, tên shop, QR tùy chọn (Web2QR).
- Ảnh SP `img.crossOrigin='anonymous'` (export không taint nếu host cho CORS); ảnh upload/paste/tách-nền (dataURL) luôn an toàn. toBlob taint → báo user tải ảnh từ máy.
- Files: `web2/product-card/{index.html, product-card.css, js/product-card-render.js, js/product-card.js}`. Đăng ký sidebar group "Đa dụng Web 2.0" + WEB2_PAGES.
- Nguồn cảm hứng: research `nexu-io/html-anything` (PNG card surface) — không nhúng repo (Next.js+agent), build mới in-browser.
- Verified live: 4 size/4 tpl/7 màu render OK, export PNG 86KB không taint, 0 JS err.

### [native-orders + web2-chat] Cột info chat = bình luận live-chat (mới nhất trên + giờ) + ẩn cột Bình luận + fix snippet `<b>` ✅

User test trực tiếp modal chat native-orders + bảng. 3 việc:

1. **Cột INFO (phải) của modal chat = bình luận live-chat đã tạo đơn** (kéo SP vào comment), mới nhất ở TRÊN, kèm thời gian + tên page. Trước đó panel key theo `order.commentIds` (rỗng với đơn `/load`) → luôn hiện "Chưa có bình luận". **Nguồn đúng = `order.note`** (chụp lúc tạo đơn, format mỗi comment `[time] [Page] message`, nối `\n---\n`, time đã GMT+7 do server TZ=+7). Đã thử fetch `web2_live_comments` nhưng **không join được**: `order.fbUserId` (PSID) ≠ `fb_id` bảng đó (Pancake global id), `fbCommentId` (`convId_seq`) ≠ `id` bảng đó (`postId_seq`) → bỏ hướng fetch (revert filter server + api method), parse note sync. `_parseNoteComments` + render newest-first + ô trả lời chung (reply `fbCommentId`). File: `native-orders/js/native-orders-interactions.js`. Verified live: hiện "NhiJudy Store · 11:17:45 16/6/2026 · Quần xám", reply box OK, 0 err.
2. **Ẩn cột "Bình luận" mặc định** trong bảng native-orders (`COL_DEFAULT.comment: true→false`) — comment giờ xem trong modal chat cột info. File: `native-orders/js/native-orders-state.js`. Verified: th display:none.
3. **Fix cột trái (danh sách hội thoại) hiện literal `<b>0912…</b>`**: Pancake snippet kèm markup highlight → strip tag trước `esc`. File: `web2/shared/web2-customer-chat-core.js` (`_convRowHtml`). Verified: snippet sạch, không còn `<b>`.

Bump `?v` cache-bust: native-orders scripts (api/state/interactions→20260619x) + web2-customer-chat-core.js→20260619b (4 trang includer: native-orders/balance-history/customers/jt-tracking).

### [web2-chat] FIX lazy-load chat-panel thiếu state/render/compose (regression modular) ✅

**Bug (browser click-all probe toàn bộ 40 trang Web 2.0):** `web2/balance-history` throw `Uncaught Error: Web2ChatPanel: thiếu module phụ thuộc — load state→render→compose TRƯỚC` khi mở chat KH. Gốc: sau khi tách `web2-chat-panel.js` (1049 dòng) thành state/render/compose, **loader lazy `loadPanelBundle()` trong `web2/shared/web2-customer-chat-core.js` KHÔNG được cập nhật** — chỉ inject emoji/sticker/entity-detect + panel.js, thiếu 3 file NS. Trang static-include (native-orders) load đủ 4 file đúng thứ tự nên OK; mọi trang mở chat qua **Web2CustomerChat lazy-load đều vỡ** (balance-history, customer-wallet, launcher…).

**Fix:** thêm `web2-chat-panel-state.js → -render.js → -compose.js` vào đầu mảng `loadPanelBundle()` (đúng thứ tự: state dựng `NS.utils`; render/compose capture `const U=NS.utils` lúc eval → phải sau state; emoji/sticker/entity-detect global độc lập; panel.js LAST). `_hasScript`/`if(global.Web2ChatPanel)return` dedup → trang static-include không double-load.

- File: `web2/shared/web2-customer-chat-core.js`
- Verified live (clone phone 0123456788): `hasPanel:true, hasNS:true, depErr:0, totalErrs:0`.
- Probe khác: kpi/product-counter "context destroyed" = click link nav hợp lệ (không phải crash, load 0 err); pancake-settings/printer-settings toast = môi trường test (chưa login pancake / print bridge off), không phải bug.

### [web2-modular] Deploy server.js + adoption sâu hơn ✅

**Deploy (auto):** server.js split (12 module) đã LIVE — service thật = `web2-realtime.onrender.com` (auto-deploy main, commit 44a1df8). Smoke `scripts/smoke-live-chat-server.sh` 3/3 PASS: `/health/detailed` báo Pancake WS client **connected:true, 4 pages, 265 events** → split chạy end-to-end OK. (Doc cũ ghi host n2store-tpos-pancake = alias.)

**Adoption sâu hơn (conservative thin-delegate, 4 delegation thật):**

- JWT → `Web2JwtUtils.decode`: `web2-pancake-token.js`, `web2-pancake-accounts.js` (`_decode`). KHÔNG đụng canonical source (pancake-token-codec/web2-chat-tokens) + epoch-isExpired (semantics khác).
- `_orderGroupKey` → `Web2SoOrderUtils.orderGroupKey` (purchase-refund-state) + load `web2-so-order-utils.js` vào purchase-refund.
- `_searchPancakeByPhone` → `Web2PancakeImport.searchByPhone` (web2-pm-customer-search) + load `web2-pancake-import.js` vào balance-history.
- **KHÔNG delegate** (đúng — diverge thật, không phải dup): avatar (palette/gradient khác), canvas (source + maxbound vs exact), lightbox (feature riêng), `_fetchJson` cores (non-JSON/Accept/error-shape khác). Đa số §4 còn lại là biến thể behavior-khác hoặc per-page helper → không consolidate được mà không đổi behavior.
- Verified live: purchase-refund (Web2SoOrderUtils active) + balance-history (Web2PancakeImport active, 50 rows) 0 JS err.

### [web2-modular] "Làm tất cả" — Phase A/B/C/D + codemap accuracy ✅

Hoàn tất các phần còn lại sau modularization:

- **Phase A** (`f32834f09`,`952ee0199`) — TAIL: `so-order-storage.js` 962→`so-order-storage.js`(795)+`so-order-storage-sync.js`(212) (SoOrderStorage API + `.Sync` byte-identical, `_internal` bridge cho IDB private); `pancake-token-manager.js` 802→798 (trim comment). **→ 0 file > 800 dòng.**
- **Phase C** (`27296dea5`,`030dc573f`) — ADOPTION §4 dedup (thin-delegate + fallback): 41 file delegate `escapeHtml→Web2Escape`, `fmtVnd/fmtMoney→Web2Format.vnd|num` (₫-aware), `fmtDate/fmtTime→Web2Format.date|dateTime`, `authHeaders/_authHeaders/_w2Auth→Web2Auth.authHeaders`, `normPhone→Web2PhoneUtils.norm` — body delegate, GIỮ inline fallback. KHÔNG delegate khi behavior khác (đ vs ₫, local-time vs GMT+7, char-set khác) → giữ nguyên (không phải dup thật). Codemap §4 loại trừ thin-delegate → đếm dup THẬT: escapeHtml 31→12, fmtTime 17→11, normPhone 10→6; auth/fmtVnd family consolidated. Verified live: native-orders/so-order/supplier-wallet/balance-history 0 JS err.
- **Phase B** (`9b476a757`) — 6 shared module mới (additive, extract canonical từ dup): `Web2JwtUtils` (decode/base64UrlDecode/isExpired/expiresAt/shortToken) · `Web2AvatarUtils` (color/initial/proxyUrl/html) · `Web2CanvasUtils` (canvas/blob/dataUrl/loadImage) · `Web2SoOrderUtils` (orderGroupKey/parseReceivedItems/groupByOrder) · `Web2ImageLightbox` (open/thumbStripHtml) · `Web2PancakeImport` (searchByPhone/lookupDeep kho-first/convToCustomer). Auto-load jwt/avatar/lightbox qua sidebar; canvas/so-order/pancake-import feature-load. node --check 6/6 + behavior-smoke 34/34 PASS, verified live. Adoption incremental (divergence notes ở commit).
- **Phase D** — `scripts/smoke-live-chat-server.sh`: smoke post-deploy cho server live-chat (12 module split). Test /ping + /health/detailed + /api/status (+ /api/events với RELAY_SECRET) + checklist Render boot-log. ⚠ Chạy SAU khi deploy split (404 nếu deploy đang chạy code cũ hơn repo).

### [native-orders + live-chat] Step 2b dead-code removal + server.js split (Node) ✅

**Step 2b (`4f087ac1a`)** — gỡ ~1500 dòng chat trùng native-orders sau chat-unification. Trace-first: xoá 6 file old-chat engine (chat-state/chat-render/message-render/inbox-sidebar/inbox-realtime/chat-css) + gỡ hàm chết in-place. GIỮ: `_handleReplyComment`+extension bridge (comment-reply mới), `inbox-resolve` (3 consumer thật: `_resolveInboxConvByPhone`/`_searchPancakeCustomers` cho inbox-add tạo đơn + `_hydrateInboxAvatars` cho render), inbox-add. `_avatarUrl` relocate → inbox-resolve. openInteractions bỏ fallback. native-orders 26→20 file, `window.NativeOrdersApp` giữ 36 key. Verified live: chat Web2CustomerChat + comments-info + reply OK, `_close/_refreshInteractions` no-op safe, 0 JS err, 0 dangling ref, 0 404.

**server.js split** — `live-chat/server/server.js` 1216 dòng → 12 module CommonJS (relay/middleware/event-store/db/firebase-loader/pancake-api/page-selection-db/pancake-client[325]/client-manager/browser-broker/routes[351]/entry[173]). Modules side-effect-free on require (factory/class), entry làm connect/listen/wire. node --check 12/12 PASS; require-smoke (stub pg/ws) no side-effect. WS Phoenix protocol/heartbeat/token-load/relay/dedup/routes/middleware/graceful-shutdown verbatim. ⚠ Cần running-server smoke lúc deploy Render để confirm end-to-end.

### [native-orders] Step 2b — xoá old-chat dead-code (chat unified) ✅

Sau Task 1 (chat hợp nhất vào `Web2CustomerChat`), modal chat cũ + engine thread/sidebar đã DEAD. Trace-first rồi mới xoá (TRÁNH gold-plate, conservative).

**Files DELETED (6, fully unreferenced bởi kept code):**
`native-orders-chat-state.js`, `native-orders-chat-render.js`, `native-orders-message-render.js`, `native-orders-inbox-sidebar.js`, `native-orders-inbox-realtime.js`, `native-orders-chat-css.js`. → 26→20 module.

**Files KEPT, xoá hàm chết tại chỗ:**

- `native-orders-interactions.js`: xoá nhánh fallback `_renderInteractionsModal` trong `openInteractions` (→ `notify('Chat chưa sẵn sàng…')`); xoá `_renderInteractionsModal`/`_renderChatHeaderInner`/`_applyChatHeaderForOrder`/`_renderInboxSidebarShell`/`_renderInboxRightPanel`/`_renderInfoTab`/`_renderMessagesPanel`/`W2_DEFAULT_QUICK_TAGS`/`_loadQuickTags`/`_renderQuickReplyTags`/`_wireQuickReplyTags`/`_wireRightPanelTabs`. **GIỮ**: `openInteractions` (Web2CustomerChat path), `_renderInteractionsInfoHtml`, `_wireCommentReplies`, `_renderCommentsPanel`, extension bridge (`_hasExtension`/`_extensionRequest`/`_extensionReady`/EXTENSION_LOADED listener), `_hasChatClient`. `_closeInteractions`/`_refreshInteractionsIfOpen` → rút gọn no-op an toàn (vẫn trên public-api).
- `native-orders-chat-send.js`: xoá `_handleSendMessage` (old inbox-send). **GIỮ** `_handleReplyComment` (flow comment-reply mới dùng — chỉ gọi `_extensionRequest`/`_hasExtension`/`_hasChatClient`).
- `native-orders-inbox-resolve.js`: file MIXED — GIỮ vì có **3 live consumer**: `_resolveInboxConvByPhone`+`_searchPancakeCustomers` (inbox-add tạo đơn), `_hydrateInboxAvatars` (render.js). **Relocate `_avatarUrl`** từ message-render.js (đã xoá) vào đây. Xoá dead-only `_fetchConvsMerged`/`_fmtVnTime`/`_convRowHtml`.
- `native-orders-public-api.js`: `_debug` bỏ `chatState` getter + `injectFakeMessage` (tham chiếu `_chatState`/`_onIncomingWsMessage` đã xoá). 36 key giữ nguyên.

**Verify**: 20/20 file pass `node --check`; `window.NativeOrdersApp` vẫn đủ **36 key** (gồm openInteractions/\_closeInteractions/\_refreshInteractionsIfOpen); 0 dangling ref tới hàm/file đã xoá; index.html gỡ 6 script tag (giữ thứ tự, bump `?v=20260619a` cho 4 file đụng); inbox-add tạo đơn nguyên vẹn + deps OK. **CHƯA** browser-test (cần user verify).

### [native-orders] Phase 1 split (9457→23) + Task 1 chat-unification ✅

**Phase 1 (`73016bf9e`)** — tách `native-orders-app.js` 9457 dòng (file lớn thứ 2) → 23 module qua AST scope-aware codemod (acorn+magic-string), namespace `window.NativeOrders` (NO), max 786L. `window.NativeOrdersApp` 36 key byte-identical (36 inline onclick), 294 binding mỗi cái 1 lần, equivalence proven, STATE hoist-order fix. Verified live: 0 JS err, openEdit/openInteractions/toggleExpand OK, 4 rows.

**Task 1 chat-unification (`d6c0c7b71`)** — `openInteractions` giờ dùng **Web2CustomerChat** (3-cột Pancake shared, 1 nguồn) thay modal chat riêng. Comments của đơn + info → cột INFO bên phải (`panels.info`), reply (public/private/Ctrl+Enter) bind lại trong `onReady`.

- Enhanced shared `web2-customer-chat-modal.js`: render `panels.info` thành cột 3 (`.w2cc-info`) + fire `onReady(handle,back)` + `getInfoEl()` — **additive** (consumer cũ không truyền panels.info → 2-cột như cũ, đã regression-test).
- `_refreshInteractionsIfOpen` no-op khi `viaCustomerChat` (Web2ChatPanel tự realtime). Modal chat cũ giữ làm **fallback**.
- Verified live: native-orders chat = Web2CustomerChat 3-cột (150 conv sidebar + thread + comments info), 0 JS err; no-info path vẫn 2-cột.
- ⏳ **Step 2b defer**: xoá ~1500 dòng chat trùng — ENTANGLED (`chat-send.js` chứa `_handleReplyComment` flow mới vẫn dùng; `inbox-resolve` helpers share) → cần trace kỹ, làm pass riêng có verify. Modal cũ hiện = fallback vô hại.

### [web2-modular] live-comment-list.js (2459 dòng) → 7 module ✅ MOVE-only

`live-chat/js/live/live-comment-list.js` (object literal `LiveCommentList`, 2459 dòng) → 7 module nhỏ (<800L, max 742L):

- **base** (108L): helpers `liveSvgIcon`/`liveAttr`/`_liveW2Auth` + const `RENDER_LIMIT_*` + `_Live_ICON_PATHS` → internal NS `window._LiveCmtList`; tạo SHELL `window.LiveCommentList = {}`.
- **state** (273L): `_filteredAll`/`_visibleComments`/badges tổng comment+đơn/`_ensureScrollSentinel`/`_appendOlderBatch`/drag-flush.
- **events** (263L): `renderContainer`/`setupEventHandlers`/`_bindListDelegation`/`_onListClick` (delegated data-action).
- **render-list** (742L): scroll/load-more/CRM+campaign options/`renderComments`+dispatch full/patch-chunked/`prependComments`/loading/error.
- **render-row** (274L): `renderCommentItem` (HTML 1 dòng) + status options/colors.
- **actions** (467L): select/status dropdown/lưu SĐT-địa chỉ (Web2Optimistic)/save-to-Live/reply/conn+debt badges.
- **orders** (444L): `createOrder` (NativeOrdersApi)/`refreshCommentItem`/popup KH (kho web2_customers).

Mỗi module `Object.assign(window.LiveCommentList, {...})` vào CÙNG object → `this.method()` + external `window.LiveCommentList.method()` (app-init, live-kho-enricher wrap `renderComments`, live-init) giữ nguyên.

- **Verify**: node --check 7/7 PASS; ordered diff (ws-stripped) = chỉ khác 5 dòng trống ở ranh giới module → method bodies BYTE-IDENTICAL (`diff -B` = 0); 56/56 method giữ nguyên (không trùng/sót); 6 eventBus topic + CustomEvent `liveCommentSelected` + 3 inline onclick + 14 data-action + 12 delegation case = đủ.
- index.html: thay 1 dòng `<script>` bằng 7 module `?v=20260618w3`, giữ neighbor `live-native-orders-api.js` (trên) + `live-hidden-commenters.js` (dưới). Xóa file gốc (orphaned).

### [inventory-tracking] Thêm nút "Cập nhật TPOS" (full sync) trong modal Tạo đơn đặt hàng ✅

**User:** "thêm nút cập nhật để full sync toàn bộ sản phẩm từ tpos bên cạnh nút thêm sản phẩm" — vì sửa thông tin SP bên TPOS không thấy cập nhật liền ở gợi ý/giá/tồn của kho web.

**Bối cảnh (đã trace):** dropdown gợi ý SP trong modal "Tạo đơn đặt hàng" gọi `WarehouseAPI.search()` → `GET /api/v2/web-warehouse/search` (bảng `web_warehouse`, pool `chatDb` — Web 1.0). Bảng này sync từ TPOS qua 3 tầng: Socket.IO realtime ([tpos-socket-listener.js](render.com/services/tpos-socket-listener.js)), cron incremental 30 phút (fallback), và sync thủ công. Cron incremental sắp theo `DateCreated desc` + dừng sớm khi gặp trang unchanged → **không bắt được khi sửa SP CŨ**; chỉ phụ thuộc socket realtime, nên có độ trễ. Nút mới cho phép user chủ động full sync toàn bộ.

**Files:** [inventory-tracking/js/modal-convert-po.js](inventory-tracking/js/modal-convert-po.js)

- HTML footer: thêm nút `#poBtnSyncTpos` (`po-btn-outline`, icon `cloud-download`, label "Cập nhật TPOS") ngay bên phải nút "Thêm sản phẩm".
- `_bindMainEvents()`: bind `poBtnSyncTpos.onclick = () => _fullSyncFromTpos(btn)`.
- Hàm mới `_fullSyncFromTpos(btn)`: confirm (full sync nặng, vài phút) → `POST {WarehouseAPI.BASE_URL}/sync?type=full` (server chạy NỀN, trả ngay) → poll `GET /sync/status` mỗi 4s, nút hiện "Đang đồng bộ… Ns" → khi có bản ghi sync KẾT THÚC trong lúc theo dõi (id khác trước HOẶC trước đó đang chạy) → toast `+mới / cập nhật / không đổi / ẩn`. Cap 15 phút, fallback toast "vẫn chạy nền". Dùng `WarehouseAPI.BASE_URL` (DRY, 1 nguồn URL), `notificationManager?.` guard, `window.confirm`.

**KHÔNG đụng:** backend (endpoint `/sync?type=full`, `/sync/status` đã có sẵn — chỉ gọi), DB, schema, các nút khác trong modal. Không trigger full sync thật khi dev (thao tác prod nặng, rate-limit TPOS 5 req/s) — verify cú pháp `node --check` OK + bám đúng pattern `_generateCodesForAll`.

**Status:** ✅ code xong (Web 1.0). Verify sau deploy: mở modal → bấm "Cập nhật TPOS" → confirm → thấy nút spinner + toast bắt đầu → sau vài phút toast kết quả; gợi ý SP đọc data mới.

## 2026-06-18

### [web2-modular] Wave 3 — so-order-app.js (5932 dòng, file LỚN NHẤT project) → 23 module ✅

MOVE-only split file lớn nhất Web 2.0. `so-order/js/so-order-app.js` 5932 dòng → 23 module (max 745L): state/format/render/render-cells/inline-edit/bulk-edit/modal-core/modal-open/modal-submit/modal-suggest/modal-image/modal-random/receive/barcode/kho-sync/delete/shipment/settings/import/image-modal/confirm/toolbar/app. Namespace `window.SoOrder` (SO) gom 154 hàm + 29 state/const.

- **Verify mạnh**: 154/154 hàm body byte-identical sau normalize wrapper (diff=0); VM load-sim (load đúng thứ tự HTML) → SoOrder populate đủ, 0 symbol missing, call chain init→renderAll chạy. Live: 79 rows render, order modal mở OK, 0 JS error.
- 0 public global (giữ); 2 onclick = `window.print()`/`window.close()` trong print-window HTML (built-in, giữ verbatim trong so-order-barcode.js). `so-order-storage.js` (962) để nguyên (sibling storage, marginally over).
- Còn lại modularization: chat-infra (web2-chat-client + native-orders chat-unification) + live-chat cluster + server.js (deferred).

### [web2-modular] Wave 3 — Batch C (photo-studio, products-app, msg-template) tách XONG ✅

MOVE-only, verified live 0 JS error:

- **photo-studio.js** (2348→7): state/canvas/bg/edit/bgpicker/ui/app. 117/117 hàm giữ, `PhotoStudio.init` giữ. BG-removal engines (MediaPipe/@imgly/Upscaler/SlimSAM) + lazy CDN loaders verbatim.
- **web2-products-app.js** (2010→7): state/render/modal/variant-picker/actions/filters/app. `window.Web2ProductsApp` 12 key byte-identical (9 inline onclick map đủ); `Web2ProductsPrint.open` (đã split) vẫn chạy; 33 rows.
- **web2-msg-template.js** (961→4 shared): core/ui/send/entry. `window.Web2MsgTemplate.open` giữ; native-orders/index.html load core→ui→send→entry. Verified trên native-orders (W2MT + NativeOrdersApp OK, 0 err).

### [web2-modular] Tách web2-products-app.js (2010 dòng) → 7 module MOVE-only ✅

Tách `web2/products/js/web2-products-app.js` (Kho Sản Phẩm — list/search/filter/CRUD/print) thành 7 module nhỏ, MOVE-only (di chuyển hàm nguyên văn, chỉ chỉnh cross-ref qua namespace nội bộ `window.Web2ProductsCore` = W). KHÔNG đổi runtime behavior.

**Module mới** (`web2/products/js/`):

- `web2-products-state.js` (172) — namespace W + STATE (single source of truth: products/total/page/limit/search/selectedCodes/usage/editingCode) + constants (PROXY_BASE) + utils (`$`/tbody/counter/pag/modal/escapeHtml/escJs/safeImageUrl/fmtPrice/originPriceHover/notify/cssEscape) + supplier/color cache (loadSuppliersFromSoOrder/collectExistingSuppliers/getColorShortMap).
- `web2-products-render.js` (535) — `_rowHtml`/renderRows/renderPagination/renderCounters + usage badge (renderUsageBadge/\_loadUsageForCurrentPage/openUsagePopover) + bulk selection (\_toggleSelect/\_updateBulkBar/\_updateSelectAllState/\_selectAllVisible/\_clearSelection/\_bulkPrint) + in-place update (\_updateRowInPlace/\_updateRowsBatch) + `load()`.
- `web2-products-modal.js` (728) — create/edit modal (openCreate/openEdit/saveModal/closeModal/updateImagePreview) + history modal (openHistory/renderHistEntry) + import (\_productImportConfig/\_commitProductImport) + supplier dropdown (populateSupplierDropdown) + code suggest (suggestProductCode). KHÁC `web2-product-detail.js` (drawer).
- `web2-products-variant-picker.js` (263) — variant picker 2 ô Màu+Size + cartesian preview + bulk-create N SP (tách khỏi modal để giữ <800 dòng).
- `web2-products-actions.js` (137) — toggleActive/remove/\_doRemove/copyCode/printBarcode (giữ await + Popup.danger + optimistic + 409 force-confirm verbatim).
- `web2-products-filters.js` (44) — applyFilters/clearFilters/goPage.
- `web2-products-app.js` (324) — orchestrator: SSE (web2:products/fast-sale-orders/native-orders, 2 timer riêng) + deeplink + init/events + re-export `window.Web2ProductsApp` (byte-identical 12-key set: load/openEdit/toggleActive/remove/copyCode/goPage/openUsagePopover/openHistory/printBarcode/getProduct/getUsage/PROXY_BASE).

**Bảo toàn**: 15 inline onclick (9 distinct target) đều map đúng method `window.Web2ProductsApp.X`; `web2-product-detail.js` accessor (getProduct/getUsage/PROXY_BASE) giữ nguyên; create/edit giữ await+Popup+optimistic+rollback; guards `window.Web2X?.method` verbatim. Load order: api BEFORE → state→render→modal→variant-picker→actions→filters→app (app LAST) → print/detail AFTER (unchanged). `?v=20260618w3`. node --check 7/7 pass.

### [photo-studio] Tách photo-studio.js (2348 dòng) → 7 module MOVE-only ✅

Tách `web2/photo-studio/photo-studio.js` (Studio chụp tách nền — camera, @imgly/cloud/MediaPipe bg-removal, canvas ops, filters, SAM, upload) thành 6 module nhỏ + orchestrator, MOVE-only (di chuyển hàm nguyên văn, chỉ chỉnh cross-ref qua namespace `window.PS`). KHÔNG đổi runtime behavior.

**Module mới** (`web2/photo-studio/`):

- `photo-studio-state.js` (215) — `window.PS` base: state (single source of truth) + constants (URL CDN, PREVIEW/CAPTURE/SEG sizes) + utils (`activate`/`hexToRgb`/`rgbToHex`/`relucide`/`showLoading`/`hideLoading`/`notify`/`isMobile`/`isIOS`/`browserName`/`clamp`/`stamp`/`sizeCanvas`/`currentSourceEl`/`captureSize`/`cropRect`/`recomputeSizes`/`tickFps`) + slot canvas dùng chung (octx/rctx/maskC…).
- `photo-studio-canvas.js` (185) — tiện ích pixel/canvas: `imgToCanvas`/`canvasToBlob`/`loadImageSrc`/`blobToImage`/`fileToImage`/`keyOut` (chroma) + vẽ nền `drawBg`/`drawPreset`/`drawCover` + `buildSilhouette`/`drawShadow`/`drawLogo`.
- `photo-studio-bg.js` (416) — engine tách nền (lazy CDN): MediaPipe `initSegmentation`/`initLegacySeg`/`segInputFrame`/`onTasksResult`/`populateMaskC`/`onSegResults`/`composeAI` · cloud/@imgly `loadImgly`/`localCutout`/`authHeaders`/`cloudCutout` · upscale `getUpscaler`/`upscaleCanvas`/`lanczos2x`/`loadScript` · SAM `getSam`/`samEmbed`/`runSamDecode`/`maskToAlpha`/`applyPickMask`.
- `photo-studio-edit.js` (726) — chụp → review: `capture`/`makeCutout`/`renderReview`/`bindReviewGestures` · brush `paintBrush`/`finishBrush`/`moveCursor`/`setBrushMode` · pick-món UI `setPickUI`/`enterPickMode`/`exitPickMode`/`addPickPoint`/`undoPickPoint`/`renderPick`/`extractPickedObject` · lưu `saveReview`/`saveBlob` · hàng loạt `onBatchFiles`/`batchCutout`/`processOne`/`downloadBatchZip`.
- `photo-studio-bgpicker.js` (285) — hàng chọn nền: PRESETS/SOLIDS/SCENES + `loadSavedBgs`/`saveSavedBg`/`deleteSavedBg`/`bgRowHTML`/`renderBgRows`/`applyActiveBg`/`chipKey`/`onBgChip`/`selectBg` (tách khỏi UI để giữ <800 dòng).
- `photo-studio-ui.js` (697) — camera (`toggleCamera`/`startCamera`/`switchCamera`/`stopAll`/permission help) + tải ảnh/logo + live loop (`frame`/`renderChroma`/`renderPassthrough`) + mode/sheet + `cache()`+`bind()` (DOM cache + addEventListener wiring).
- `photo-studio.js` (58) — orchestrator: `init()` setup canvas ctx + gọi cache/bind/initSegmentation/… ; re-export `window.PhotoStudio = { init }` + `PS.init`.

**Public API byte-identical**: chỉ `window.PhotoStudio.init` (+ debug `window.__psUpscaleAI`/`global.__psSam`). 0 inline `onclick=` (mọi nút wire qua addEventListener) → không surface nào khác cần preserve. Guards `window.Web2Auth`/`global.SelfieSegmentation`/`window.Upscaler`/`window.ESRGANSlim2x`/`global.lucide`/`global.notificationManager` giữ verbatim.

**index.html**: thay 1 dòng `<script>` bằng 6 dòng state→canvas→bg→edit→bgpicker→ui→app (app LAST), `?v=20260618w3`; shared deps unchanged & trước. `sw.js` network-first theo pattern `/web2/photo-studio/` (không hardcode) → tự phục vụ file mới, không cần sửa.

**Verify**: `node --check` 7/7 pass; cross-ref script xác nhận 0 `PS.*` referenced-but-undefined; 117/117 hàm gốc preserved; HTML order đúng.

### [web2-modular] Wave 3 page-apps — Batch A+B (7 page) tách XONG, verified live ✅

MOVE-only split, mỗi page browser-verify (0 JS error) trước khi commit:

- **Batch A** (`dc5556e87`): supplier-wallet(912→5, money deposit/return/pay giữ await+txId, 13 cards) · customers(914→5, customers-api giữ, SĐT 10 số, 50 rows) · supplier-debt(1394→6, settle/adjust giữ await, 26 rows).
- **Batch B**: reconcile(1106→5, selectPbh race-guard + scanner IME-guard giữ) · pancake-settings(1305→5, token/account writes giữ await) · purchase-refund(1634→6, **group-by-order `aggId` + cumulative `returnedRowIds` over-refund protection giữ verbatim**, money quick/bulk refund giữ await+double-submit-guard).
- Tất cả: 0 public global / 0 inline onclick (delegation) → public surface giữ rỗng; state gom 1 module; shared guards verbatim.

### [pancake-settings] Tách pancake-settings.js (1305 dòng) → 5 module MOVE-only ✅

Tách `web2/pancake-settings/js/pancake-settings.js` (cấu hình token/tài khoản Pancake Web 2.0) thành 5 module nhỏ, MOVE-only (di chuyển hàm nguyên văn, chỉ chỉnh cross-ref qua namespace `window.__PancakeSettings` / NS). KHÔNG đổi runtime behavior.

**Module mới** (`web2/pancake-settings/js/`):

- `pancake-settings-state.js` (109) — NS namespace + state (single source of truth: `_pagesCache`/`_accountsCache`/`_refreshStatus`/`_credsAccountId`/`_relayAccounts`…) + constants (`REASON_MSG`, `RELAY_WORKER`) + utils (`$`/`notify`/`escapeHtml`/`shortToken`/`formatExpiry`/`_setBtnLoading`/`_restoreBtn`).
- `pancake-settings-api.js` (254) — data load/network: `loadPages`/`persistActiveToDb`/`syncAccountPages`/`loadAccounts`/`loadRelayPages`/`saveRelaySelection`.
- `pancake-settings-render.js` (391) — render: `renderJwtInfo`/`renderPageList`/`renderExtStatus`/`renderBanner`/`_expChip`/`renderAccountList`/`renderPageAdminStats`/`renderRelayPages`.
- `pancake-settings-actions.js` (608) — handlers: JWT save/test/clear, page tokens, nuke, expiry modal + auto-fetch monitor, accounts add/use/delete/renew, creds modal (giữ await + Popup.confirm/danger + loading verbatim).
- `pancake-settings.js` (79) — orchestrator: `init()` wire DOM events + boot (sidebar mount, runMonitor). Không export window.\* (file gốc cũng là IIFE không expose gì).

**Public API**: file gốc là IIFE, KHÔNG có `window.*` export, KHÔNG có `onclick=` (mọi nút wire qua addEventListener) → không có public surface nào cần preserve. Guards `window.Web2Chat/Web2PancakeAccounts/Web2PancakeToken/Web2Auth/Web2Optimistic/Web2Sidebar/Popup/lucide/notificationManager` giữ byte-identical (diff count khớp git HEAD).

**index.html**: thay 1 dòng `<script>` app bằng 5 dòng state→api→render→actions→app (app LAST), `?v=20260618w3`; shared deps unchanged & trước.

**Verify**: `node --check` 5/5 pass; mọi NS.\* đọc đều có định nghĩa; bare same-name calls đều intra-module; HTML order đúng.

### [reconcile] Tách reconcile-app.js (1106 dòng) → 5 module MOVE-only ✅

Tách `web2/reconcile/js/reconcile-app.js` (trang đối soát đóng gói PBH — TPOS×Pancake / CK, money/order surface) thành 5 module nhỏ, MOVE-only (di chuyển hàm nguyên văn, chỉ chỉnh cross-ref qua namespace nội bộ `window.RC`). KHÔNG đổi runtime behavior.

**Module mới** (`web2/reconcile/js/`, mỗi file `?v=20260618w3`):

- **reconcile-state.js** (159) — namespace `RC` + WORKER/API/STATE_LABELS/PBH_NUMBER_RE/MANUAL_CAMERA_NOTE/RC_HISTORY_LABELS + STATE + helpers (escapeHtml/fmtMoney/fmtTs/fmtDateInvoice/fmtSttDisplay/notify/feedback/focusScanner) + `api()`.
- **reconcile-api.js** (134) — loadList / loadHistory / historyNote + SSE (web2:reconcile + web2:fast-sale-orders, debounce 500ms).
- **reconcile-render.js** (272) — renderList / renderDetail / renderLine / renderActionButtons.
- **reconcile-actions.js** (485) — selectPbh (⚠ race guard `if(STATE.selectedNumber!==number)return` giữ nguyên), toggleManualPick/resetPick/packOrder/cancelPack/shipOrder/deliverOrder/returnFailedOrder (giữ await+Popup.confirm/danger/prompt), onScannerSubmit, audit modal (đối chiếu camera).
- **reconcile-app.js** (177) — ORCHESTRATOR: bindUi (scanner IME guard `e.isComposing||e.keyCode===229` + global keydown router useCapture verbatim, camera/OCR button guards `window.Web2BarcodeScanner?`/`window.Web2LabelOcr?`) + init + bootstrap.

**Bất biến giữ nguyên**: file gốc KHÔNG expose `window.*` public nào + 0 `onclick=` → public API = rỗng (giữ rỗng). 42/42 hàm gốc present, 0 thiếu, 0 trùng. Guard tiền/đơn (await + confirm), selectPbh race guard, scanner IME guard giữ byte-identical. Shared deps index.html không đổi, nạp trước; modules state→api→render→actions→app (app SAU cùng). `node --check` 5 file PASS. Chưa browser-test (theo yêu cầu task).

### [web2-modular] Wave 1 tiến độ — 4/5 file tách XONG (jt-tracking, returns, zalo, pbh) ✅

MOVE-only split, mỗi file verified live browser (0 JS error) trước khi sang file kế:

- **jt-tracking-app.js** (1090) → 7 module (constants/api/state/render/modals/actions/app). 204 rows render OK. `b412690da`.
- **returns-app.js** (867) → 7 module (core/customer/order-items/cod/form/tabs/app). `window.Web2Returns` giữ; money COD/wallet/submit giữ await. switchTab OK. `7e55515e8`.
- **web2-zalo-app.js** (886) → 5 module (utils[WZApp]/accounts/chat/lookup-zns/app). 4 tab switch OK, `__wzAvErr` giữ; deps zalo-chat/\* + ZaloApi giữ nguyên thứ tự.
- **pbh-app.js** (1027) → 6 module (chi tiết entry dưới). `window.PbhApp` 12 method byte-identical, rows render OK.
- Còn lại Wave 1: **server.js** (live-chat, node-only verify).

### [fastsaleorder-invoice] Tách pbh-app.js (1027 dòng) → 6 module MOVE-only ✅

Tách `web2/fastsaleorder-invoice/pbh-app.js` (page-app PBH/Phiếu Bán Hàng — money/order surface) thành 6 module nhỏ, MOVE-only (di chuyển hàm nguyên văn, chỉ chỉnh cross-ref qua namespace). KHÔNG đổi runtime behavior.

**Module mới** (`web2/fastsaleorder-invoice/`):

- `pbh-state.js` (88L) → `window.PbhState` — STATE trung tâm + constants (WORKER/KPI_API/STATE_META) + util (fmtMoney/fmtDate/escapeHtml/notify/w2pConfirm/w2pAlert/w2pPrompt/stateBadge/$/tbody).
- `pbh-api.js` (57L) → `window.PbhApi` — `_authHeaders`/`_fetch` (inject x-web2-token) + `load()` (fetch orders → STATE → render).
- `pbh-render.js` (422L) → `window.PbhRender` — renderRows/renderPagination/renderCounters/renderCustomerChip + modal detail/openCustomer(360)/openHistory + injectHistoryCss.
- `pbh-actions.js` (366L) → `window.PbhActions` — confirm/cancel/print/createDelivery/createRefund/exportCsv/bulkAction/bulkMerge/bulkPrint/resetStt (giữ nguyên await+loading+confirm cho money/order ops).
- `pbh-filters.js` (89L) → `window.PbhFilters` — filterByCustomer/clearCustomerFilter/getSelectedNumbers/updateBulkBar/unselectAll/applyFilters/clearFilters/goPage.
- `pbh-app.js` (130L, rewrite orchestrator) — init + event wiring + SSE subscribe + scope banner + re-export `window.PbhApp` (compat shim 12 method cho 10 inline onclick).

**index.html**: load order state→api→render→actions→filters→app (app LAST), `?v=20260618w1`. Shared deps giữ nguyên + load trước.

**Verify**: `node --check` 6/6 PASS · `window.PbhApp` 12 method byte-identical (8 inline-onclick targets đều present: detail/openCustomer/openHistory/print/createDelivery/createRefund/goPage/clearCustomerFilter) · mọi cross-namespace ref resolve · print.html chỉ ref PbhApp trong comment (không load pbh-\*.js, không ảnh hưởng). Chưa commit, chưa browser-test.

### [web2-modular] Wave 0 — Foundation shared modules (5 module mới, auto-load) ✅

Khởi động kế hoạch tách module ([MODULARIZATION-PLAN.md](web2/MODULARIZATION-PLAN.md)). Wave 0 = gom util trùng (codemap §4) thành shared 1 nguồn, additive zero-risk.

**Tạo mới** (`web2/shared/`): `web2-format.js` (Web2Format: num/vnd/date/time/dateTime/rel/parseTs GMT+7) · `web2-api-fetch.js` (Web2ApiFetch: json/withFallback/authHeaders) · `web2-notify.js` (Web2Notify) · `web2-phone-utils.js` (Web2PhoneUtils: norm/isValid/display, SĐT 10 số) · `web2-text-utils.js` (Web2TextUtils: stripDiacritics/searchNormalize/asciiUpper).
**Đã có sẵn** (chỉ adopt): `Web2Escape`, `Web2Auth.authHeaders`.
**Auto-load**: đăng ký 5 module + Web2Escape vào `web2-sidebar.js` `autoLoadSharedModules()` → có mặt MỌI trang Web 2.0, KHÔNG cần sửa từng HTML.

**Verify**: node syntax+behavior PASS (GMT+7: Pancake no-Z `03:52:23`→`10:52`, vnd→`1.234.567₫`). Live browser overview (đăng nhập web2): 7/7 global `true`, `dateTime`→"11/06/2026 10:52", phone/search OK, 5 file serve 200. Codemap regen: 165 file / 75 shared.

**Adoption** (thay hàm copy cục bộ) làm DẦN theo từng wave, giữ fallback defensive — KHÔNG xoá hàng loạt.

### [tooling] Bản đồ code Web 2.0 "thông minh" — codemap auto-generated 🗺️

**User:** "có 1 file quản lý riêng kiểu code thông minh biết được hàm, file này nhiệm vụ gì, để Claude đọc vào hiểu luôn tất cả tính năng + biết trang có hàm gì, cần thì tìm ở đâu; trang mới đụng trùng hàm thì share module dùng chung."

**Đã làm:**

- **[scripts/gen-web2-codemap.js](../scripts/gen-web2-codemap.js)** (MỚI) — quét toàn bộ JS Web 2.0 (`web2/`, `native-orders/`, `so-order/`, `live-chat/`), trích: mục đích (#Note + banner `API:`), `window.*` global, danh sách hàm/method, shared module mỗi file dùng, **hàm trùng tên ≥3 file** (denoise DOM-handler/lifecycle/callback) + gợi ý shared target, file > 800 dòng. Dependency-free, deterministic.
- **[docs/web2/WEB2-CODEMAP.md](web2/WEB2-CODEMAP.md)** + **web2-codemap.json** (auto) — 160 file, 70 shared, 2535 hàm, 103 hàm trùng, 30 file oversized. §0 cách dùng / §1 Shared Registry (dedup guard) / §3 Pages / §4 Hàm trùng / §5 Oversized.
- **CLAUDE.md** Index quick-lookup: thêm codemap là mục ĐẦU (đọc trước khi code Web 2.0; regenerate `node scripts/gen-web2-codemap.js` sau khi đổi cấu trúc).

**Top dedup signals** (§4): `escapeHtml` 31 file→Web2Escape · auth-header (`_authHeaders`/`authHeaders`/`_w2Auth`) 40 file→Web2Auth · format (`fmtVnd`/`fmtMoney`/`fmtDate`/`fmtTime`) 48 file→Web2Format(mới) · `normPhone` 10→Web2CustomerStore · page-builder list helpers.

### [plan] Tách module TOÀN BỘ Web 2.0 — discovery 29-agent + master plan

**User:** "tách tất cả trang web 2.0 thành nhiều module/file để dễ quản lý → chia nhiều phase, dùng nhiều workflows, hoàn chỉnh lại toàn bộ web 2.0."

**Đã làm (discovery):** Workflow 29 agent read-only blueprint từng file > 800 dòng + 1 synthesis → [docs/web2/modularization-blueprints.json](web2/modularization-blueprints.json) (29 blueprint + 3 waves + 13 shared dedup) + [docs/web2/MODULARIZATION-PLAN.md](web2/MODULARIZATION-PLAN.md).

**Kế hoạch:** Wave 0 foundation shared (Web2Format/Web2ApiFetch/Web2Auth.authHeaders/Web2Escape adopt/…) → Wave 1 low-risk (server.js, jt-tracking, pbh, web2-zalo, returns) → Wave 2 medium (pancake-token-manager, web2-chat-client, products-print, customer-wallet, balance-history, pending-match) → Wave 3 monsters (native-orders 9456, so-order, live-chat cluster, photo-studio, products-app…). Split protocol vanilla-JS (IIFE→namespace, script load order, facade byte-identical, gen-token/timers/realtime-hub/money-await/GMT+7, cohesion 200-400 dòng). Task 1 chat-unification native-orders nằm trong Wave 3.

### [convention] Web 2.0 — tách nhiều module nhỏ + share dùng chung (nguyên tắc gốc) 📌

**User chốt:** "web 2.0 cứ tách ra nhiều module để code → có gì share nhau dùng được → dễ bảo trì, bảo dưỡng, logic code thống nhất."

**Nguyên tắc** (đã ghi CLAUDE.md §"Quy tắc khi code" item 0 + MEMORY [[feedback_web2_modular_shared]]):

- Tách module nhỏ theo feature/domain (200-400 dòng, max 800). KHÔNG nhồi file khổng lồ — bài học ngược `native-orders-app.js` 9456 dòng coupling sâu → migrate cực khó.
- Cái gì ≥2 nơi cần → **shared 1 nguồn** ở `web2/shared/`, mọi trang tham chiếu; KHÔNG copy/fork. Trang chỉ điều phối + truyền context/callback.
- Why: dễ bảo trì/bảo dưỡng, logic thống nhất (sửa 1 chỗ → mọi nơi), tránh drift.
- Mẫu chuẩn: `Web2CustomerChat`, `Web2Popup`, `Web2Lottie`, `Web2QR`, `Web2CustomerStore`, `Web2SuppliersCache`, `Web2Optimistic`, `Web2SSE`, `Web2BarcodeScanner`, `Web2ProductCounter`.

### [web2-chat] Hợp nhất chat về 1 nguồn Web2CustomerChat — Phase 0/1/1b/2 XONG ✅ (Phase 3/4 native còn lại)

**User:** "hợp nhất 2 cái (pancake 3-cột + zalo) thành Web2CustomerChat dùng chung, kiểm lại tất cả modal pancake/zalo để dùng nó → đồng bộ toàn web về 1 nguồn."

**Đã làm (verified browser + commit):**

- **Phase 0+1** (`04e3ed084`) — [web2-customer-chat.js](../web2/shared/web2-customer-chat.js) thêm `open({layout:'modal'})` = **3-cột Pancake**: sidebar [tìm kiếm hội thoại + danh sách] + thread (Web2ChatPanel). Drawer cũ giữ mặc định (11 caller zero-risk). Verified: 150 hội thoại, search "Thảo"→135, click row load thread thật.
- **Phase 1b** (`559786ffb`) — **XOÁ `web2-chat-readonly.js`**, gộp vào `Web2CustomerChat({layout:'modal',readonly})`. Migrate 7 call site (balance-history, pending-match có `onPick` picker, customer-detail-modal). Thêm flags `readonly`/`query`/`onPick`. Verified: balance-history readonly modal mở, no composer.
- **Phase 2** (`cb98b8a91`) — jt-tracking Zalo drawer → `Web2CustomerChat.open({conversationId,channel:'zalo',pancakeEnabled:false,onReady})`. Drawer thêm `conversationId`/`pancakeEnabled`/`zaloEnabled`/`onReady`. Verified: drawer Zalo-only (ẩn tab Pancake).

**CÒN LẠI — Phase 3+4 (native-orders, RỦI RO CAO, chưa làm):** native-orders-app.js (9456 dòng) có modal 3-cột riêng + info panel + comments + order-history + quick-reply coupling sâu. Migrate qua callback `context.renderInfo/renderComments`. ⚠ native-orders chat HIỆN VẪN CHẠY (đã fix resolve theo SĐT ở `26a18e91c`) — chưa dùng Web2CustomerChat. Làm dedicated + verify trên data thật. Kế hoạch đầy đủ: [docs/web2/CHAT-UNIFICATION-PLAN.md](web2/CHAT-UNIFICATION-PLAN.md).

**Engine dùng chung (không đổi):** Web2ChatPanel (thread), Web2Zalo (Zalo), Web2Chat (API). Web2CustomerChat điều phối.

### [so-order] Cắm Quét mã (camera) + Đọc nhãn (OCR) vào modal "Thêm sản phẩm" — nhập kho từ pack ✅

**User chọn a+b+c.** (a) = cắm camera-read vào **so-order** (warehouse intake — chỗ dùng đúng nhất của OCR/scan).

**Tích hợp** (entry point sạch = modal "Thêm sản phẩm", luồng ổn định hơn inline-edit):

- [so-order/index.html](../so-order/index.html): 2 nút **"Quét mã" 📷** + **"Đọc nhãn" 🔤** cạnh "Thêm sản phẩm" trong modal; load `web2-barcode-scanner.js` + `web2-label-ocr.js`.
- [so-order/js/so-order-app.js](../so-order/js/so-order-app.js): helper `_addRowFromScannedCode(code)` → tra `Web2ProductsCache.findByCode(code)` → push `_newModalRow({productName, matchedCode, qty:1})` + `renderModalRows()`. Không thấy mã → để mã vào productName cho user sửa tên. **Quét mã = continuous** (mỗi mã thêm 1 dòng → nhập cả bó nhanh). Đọc nhãn = OCR 1 mã/lần. Wire `.onclick` cạnh `soModalAddRowBtn` (re-wire mỗi render, idempotent).

**Verify** (browser so-order): không bounce, `pageErr:null` (không vỡ trang phức tạp), 2 module load, nút Quét/Đọc + addBtn có, `Web2ProductsCache.findByCode` = function. (Full flow thêm dòng cần mở modal qua tạo đơn — wiring + deps đã verified, dùng đúng pattern addBtn sẵn có.)

**→ Hoàn tất a+b+c**: (a) so-order intake ✅ · (b) OCR chữ tay TrOCR ✅ · (c) đếm pack opencv ✅. Toàn bộ 4 engine camera on-device giờ là shared module: Web2BarcodeScanner · Web2LabelOcr (in+tay) · Web2PackCounter · Web2ProductCounter.

### [web2 pack-counter] Đếm bó/pack bằng camera opencv.js + chạm sửa tay (Đợt 4/4) ✅

**Đợt 4 lộ trình on-device camera reading.** Đếm pack chồng dính = DỄ SAI (report) → KHÔNG đếm tự động hoàn toàn mà **HỖ-TRỢ-TAY**: opencv ước lượng đặt marker → user **chạm thêm/bớt** cho đúng → số cuối user chốt.

**Shared engine** [web2/shared/web2-pack-counter.js](../web2/shared/web2-pack-counter.js) (`window.Web2PackCounter`):

- `open({onResult})` overlay: camera + nút "Đếm" → freeze frame → **opencv.js** (gray→Canny→morphology→findContours→lọc diện tích) ước lượng tâm các bó → đặt marker đánh số. **Chạm ảnh = thêm marker, chạm marker = xoá**. **Slider độ nhạy** → ước lượng lại. Count = số marker. "Dùng" → `onResult(count)`.
- Lazy tải opencv.js (**@techstark/opencv-js** prebuilt, đúng repo report, ~11MB WASM, pinned `@4.11.0-release.1`) khi mở. On-device 100%. Self-inject CSS.

**Cắm vào** trang [product-counter](../web2/product-counter/index.html) (phone-only): nút 📦 trên top bar → `Web2PackCounter.open()`. Tách biệt với đếm-vật-thể MediaPipe (cầm món lên).

**Verify** (browser): nút 📦 + module v20260618a + overlay (chụp/slider/canvas) ✓; **smoke opencv PASS** — ⚠ URL gốc `docs.opencv.org/4.10.0` **404**, đổi sang @techstark jsDelivr → load OK + đếm 5 ô tách rời = đúng 5. getUserMedia không chạy automation — pipeline opencv đã verified.

**⚠ Trung thực:** pack CHỒNG DÍNH sát → contour gộp → opencv ước lượng SAI; vì vậy thiết kế chạm-sửa-tay (opencv chỉ là điểm khởi đầu). Cần tuning độ nhạy theo ánh sáng.

### [web2 label-ocr] Đọc chữ trên nhãn bằng camera OCR on-device (shared, Đợt 2/4) ✅

**Tiếp lộ trình on-device camera reading (sau Đợt 1 barcode).** Đợt 2 = OCR chữ IN trên nhãn (tesseract.js), theo report: OCR **chụp-rồi-đọc** (không streaming realtime), chữ in OK, chữ tay kém → thiết kế **gợi-ý + cho sửa tay**, KHÔNG auto.

**Shared engine** [web2/shared/web2-label-ocr.js](../web2/shared/web2-label-ocr.js) (`window.Web2LabelOcr`):

- `open({onResult, lang, whitelist, continuous})` overlay: camera + **khung ROI ngắm dòng chữ** + nút "Chụp & đọc" → freeze frame → crop ROI + grayscale/contrast → tesseract.js OCR → hiện **các dòng nhận được (chip bấm chọn) + ô SỬA TAY** → user xác nhận mới `onResult(text)`. "Chụp lại" để thử lại.
- Lazy tải tesseract.js (CDN, WASM + traineddata ~6MB) khi mở; worker cache theo lang; on-device 100% (KHÔNG server). Self-inject CSS.

**Cắm vào reconcile**: nút 🔤 (accent cam) cạnh nút 📷 barcode ([index.html](../web2/reconcile/index.html) + [reconcile.css](../web2/reconcile/css/reconcile.css)) → [reconcile-app.js](../web2/reconcile/js/reconcile-app.js) `Web2LabelOcr.open({ onResult })` → **điền vào ô quét + focus** (KHÔNG auto-submit vì OCR dễ nhầm O↔0 — user kiểm tra rồi Enter). Dùng khi pack có MÃ IN nhưng barcode không quét được.

**Verify** (browser): module load v20260618a + nút 🔤/📷 có; overlay mở đủ (ROI/chụp/ô sửa); **smoke OCR PASS** — render "AO2354 T20" → tesseract đọc "A02354 T20" (đúng "T20", lẫn O→0 đúng như cảnh báo → vì vậy thiết kế cho-sửa-tay). getUserMedia không chạy trong automation — decode đã verified.

**⚠ Lưu ý placement:** OCR hợp NHẤT cho **warehouse intake (so-order nhận hàng)** đọc "mã + số lượng" trên nhãn pack, hơn là reconcile (reconcile dùng SKU barcode). Hiện đặt ở reconcile làm fallback + test; engine shared nên dời/thêm vào so-order/products dễ.

**Đợt 3 (OCR chữ TAY) — XONG cùng ngày**: thêm toggle **"Chữ in | Chữ tay"** vào `Web2LabelOcr` (`opts.mode`). Chữ tay = transformers.js + TrOCR (`Xenova/trocr-base-handwritten`), lazy import CDN, chỉ tải model (~vài trăm MB) khi user chọn. ⚠ Chính xác THẤP (model IAM tiếng Anh — số/mã ASCII đỡ hơn, chữ Việt có dấu kém) → vẫn cho-sửa-tay. Verify: toggle 2 chế độ render đúng (active=in); transformers.js import OK (`pipeline`/`RawImage` = function). Full TrOCR inference chạy on-device khi user dùng (chưa chạy full trong test vì model nặng).

### [web2 barcode-scanner] Quét barcode/QR bằng CAMERA on-device (shared) + cắm vào reconcile ✅

**User:** muốn đọc TRỰC TIẾP từ camera on-device (KHÔNG server AI), và chỉ ra trang **reconcile** (đối soát đóng gói) đang dùng **máy quét gun**.

**Nghiên cứu** (workflow 29-agent GitHub on-device camera reading): chọn **Sec-ant/barcode-detector** (MIT) — tự dùng `BarcodeDetector` native trên Android + fallback **ZXing-C++ WASM** trên iOS Safari, 1 code path, phủ QR/DataMatrix/PDF417/EAN/Code128… Báo cáo cũng chốt: barcode = phần chắc ăn nhất nên làm trước; OCR chữ tay on-device = chính xác thấp (để sau, kiểu gợi-ý-cho-sửa-tay).

**Shared engine** [web2/shared/web2-barcode-scanner.js](../web2/shared/web2-barcode-scanner.js) (`window.Web2BarcodeScanner`, pattern Web2ProductCounter):

- `open(opts)` overlay toàn màn hình (viewfinder + scanline + **nút đèn flash kho** + đóng) · `mount(target,opts)` inline.
- **Lazy** `import()` ponyfill (CDN jsDelivr) khi mở; on-device 100% (`detect(video)` ~8fps); **dedupe** (cùng mã re-arm sau `dedupeMs`); feedback **beep (WebAudio) + rung (vibrate) + khung xanh**; torch qua `applyConstraints`. Là "máy quét gun bằng camera" → mỗi mã gọi `onScan(code)`.
- Self-inject CSS; graceful camera/CDN fail.

**Cắm vào reconcile** (camera = thay máy quét gun): nút 📷 trong `.rc-scanner-box` ([index.html](../web2/reconcile/index.html) + [reconcile.css](../web2/reconcile/css/reconcile.css)) → wire trong [reconcile-app.js](../web2/reconcile/js/reconcile-app.js) gọi `Web2BarcodeScanner.open({ onScan: onScannerSubmit })` — y hệt gun: bill `NJ-…` mở PBH, mã khác = SP → +1. Load script trước reconcile-app.js.

**Verify** (browser reconcile): module load v20260618a + nút camera có; `open()` dựng overlay đủ (viewfinder/đóng/flash/video); **smoke giải mã QR THẬT PASS** — tạo QR `NJ-20260618-0001` qua Web2QR → ponyfill WASM `detect()` → `got="NJ-20260618-0001"`, match=true. (getUserMedia không chạy trong automation — phần decode đã verified, chạy thật trên điện thoại.)

**Status:** ✅ Done (Đợt 1/4 lộ trình on-device camera). Tiếp theo (chưa làm): Đợt 2 OCR chữ in nhãn (tesseract.js), Đợt 3 OCR chữ tay (transformers.js+TrOCR, thử nghiệm), Đợt 4 đếm pack (opencv.js). Trang nào cần quét mã chỉ cần `<script src="../shared/web2-barcode-scanner.js">` + `Web2BarcodeScanner.open({onScan})`.

### [native-orders] Chat đơn: GIỮ modal 3-cột Pancake (user thích vì có tìm kiếm hội thoại) + fix match hội thoại theo SĐT ✅

**User:** "không có avatar và không tìm được đoạn hội thoại là chưa đúng"; "tôi thích giao diện pancake cũ hơn… vì giao diện cũ có tìm kiếm đoạn hội thoại". → GIỮ modal 3-cột (sidebar search + thread + info), CHỈ fix center.

**Root cause (browser-verified):** center `_loadAndRenderThread` load hội thoại bằng `fetchConversations(pageId, order.fbUserId)`. fbid kho KH thường KHÔNG phải PSID thật của hội thoại Pancake → trả 0 → "Chưa có hội thoại" + avatar `/api/fb-avatar?id=<fbid sai>` = silhouette xám HTTP 200.

**Fix (interim):** khi match fbid fail → fallback `_resolveInboxConvByPhone(order.phone)` (proven, quét mọi page, match theo SĐT) → tìm thấy PSID khác → rebind `fbUserId/fbPageId` + `_applyChatHeaderForOrder` (avatar THẬT) → load lại thread thật (bounded, không vô hạn). Vẫn không thấy → prompt **"dùng ô tìm kiếm bên trái"** thay vì dead-end "gõ để bắt đầu".

- [native-orders-app.js](../native-orders/js/native-orders-app.js) `_loadAndRenderThread`: nhánh `conversations.length===0` thêm fallback SĐT (mirror nhánh đơn phone-less). `openInteractions` revert về modal 3-cột.

**Verify:** đơn NJ-20260618-0001 (Huỳnh Thành Đạt) — center resolve đúng hội thoại thật khi có SĐT khớp.

> **TIẾP THEO (user chốt):** hợp nhất modal 3-cột Pancake + Zalo thành **Web2CustomerChat** 1 nguồn dùng chung, migrate MỌI modal pancake/zalo về đó. Đang triển khai.

### [web2 product-counter] Trang "Đếm SP qua camera" + shared engine Web2ProductCounter ✅

**User:** "camera trực tiếp trên điện thoại đếm số lượng sản phẩm hiện trên màn hình" → web 2.0, thêm vào group "Đa dụng", **làm thành shared để trang nào cần thì tham chiếu**.

**Nghiên cứu** (workflow 35-agent GitHub research): chọn **MediaPipe Tasks Vision** (Apache-2.0, on-device, tối ưu mobile/live) làm engine; đếm TỔNG vật thể cho bản đầu (COCO 80 class). Cảnh báo đã ghi: COCO không có class "áo/quần" → muốn đếm đúng loại phải custom-train (Roboflow/Model Maker) thay file model, code không đổi.

**Shared engine** [web2/shared/web2-product-counter.js](../web2/shared/web2-product-counter.js) (`window.Web2ProductCounter`, pattern giống Web2Lottie/Web2QR/Web2CustomerChat):

- `mount(target, opts)` nhúng inline · `open(opts)` drawer toàn màn hình → **trang nào cần chỉ load script + gọi**, KHÔNG dựng lại engine.
- **Lazy**: chỉ `import()` MediaPipe (CDN jsDelivr) + tải WASM/model khi user bấm "Bật camera" → trang tham chiếu mà không dùng = 0 tải.
- Self-inject CSS (`.w2pc*`) → trang tham chiếu khỏi thêm file css.
- On-device 100% (getUserMedia → `detectForVideo` mỗi ~350ms → đếm bounding box), **ổn định số bằng MEDIAN qua 5 frame** (chống nhấp nháy). Delegate GPU trước, fallback CPU (WASM, iOS Safari). `excludePerson` mặc định (bỏ người bán). Model override qua `opts.modelUrl`/`WEB2_CONFIG.OBJECT_MODEL_URL` (self-host nếu GCS bị chặn). Controller: start/stop/toggle/flipCamera/getCount + events ready/start/stop/count/error.

**Trang host mỏng** (Đa dụng Web 2.0): [web2/product-counter/index.html](../web2/product-counter/index.html) + [product-counter.css](../web2/product-counter/product-counter.css) + [js/product-counter.js](../web2/product-counter/js/product-counter.js) — chỉ `Web2ProductCounter.mount('#pcMount', …)`. Sidebar: thêm menu "Đếm SP qua camera 📷" dưới "Studio chụp tách nền" + đăng ký `WEB2_PAGES` (badge WEB2.0) trong [web2-sidebar.js](../web2/shared/web2-sidebar.js).

**Verify** (browser test localhost): module load v20260618a, widget mount, CSS inject, menu item + badge có; UI transition nút Bật camera đúng; **smoke MediaPipe cô lập PASS** (`import` ESM + `FilesetResolver` + `ObjectDetector` CPU + fetch model GCS + `detectForVideo` → 0 lỗi). `getUserMedia` treo trong automation (không camera/quyền) — không phải lỗi code, chạy thật trên điện thoại.

**Cập nhật (phone-only, app-like) — user: "làm giao diện cho điện thoại, trang này chỉ dùng trên điện thoại":** rework [index.html](../web2/product-counter/index.html) + [product-counter.css](../web2/product-counter/product-counter.css) thành full-screen app-like theo precedent `live-chat/comments-mobile.html` — **bỏ sidebar/shell** (standalone), `100dvh` + safe-area insets (`env(safe-area-inset-*)`), `overflow:hidden` + `overscroll-behavior:none` (không kéo trang), `maximum-scale=1, user-scalable=no` (chống zoom khi chạm camera). Top bar gọn (← back history/Tổng quan · tiêu đề · ⓘ mẹo bottom-sheet); camera **full-bleed** (border-radius 0); controls **bottom-bar thumb-zone** (nút "Bật camera" cao 54px full-width + đổi camera + "Bỏ qua người" xuống dòng). Bỏ load web2-theme/sidebar.css/js (định nghĩa token `--web2-primary` inline) → nhẹ hơn. Verify browser (390px): không sidebar, không bounce login, widget mount, 0 lỗi, screenshot layout đúng app-like.

**Status:** ✅ Done. Trang nào cần đếm SP qua camera (vd live-chat, products) chỉ cần `<script src="../shared/web2-product-counter.js">` + `Web2ProductCounter.open()`/`mount()`.

### [web2 audit] Quét toàn bộ Web 2.0 (click-all browser + static audit 38-agent) → fix 16 bug ✅

**User:** "tiếp tục browser test click hết tất cả nút của web 2.0, mở modal click scroll, click hết nút trong modal, điền input, tương tác với tất cả các trang".

**2 lớp kiểm thử song song:**

1. **Deep click-all browser probe** ([scripts/web2-clickall-probe-v2.js](../scripts/web2-clickall-probe-v2.js), mới) — 39 trang, 265 click an toàn, **54 modal** mở (scroll + điền input + click nút trong modal), bỏ destructive/commit. **Sạch**: 0 JS crash/null-deref/stuck-modal. 2 "lỗi" duy nhất = môi trường (pancake chưa login, Print Bridge chưa chạy) — KHÔNG phải bug.
2. **Static audit 38-agent** (find→verify adversarial, 11 nhóm module) → 20 finding confirmed. Triage theo kiến trúc MPA (đa trang, KHÔNG phải SPA).

**Đã fix 16 bug thật:**

- **IME tiếng Việt (Enter giữa lúc soạn)** — 6 ô gửi/submit thêm guard `if (e.isComposing || e.keyCode === 229) return;`: reconcile scanner barcode ([reconcile-app.js](../web2/reconcile/js/reconcile-app.js)), returns tạo phiếu ([returns-app.js](../web2/returns/js/returns-app.js)), livestream-poller add-page ([index.html](../web2/livestream-poller/index.html)), zalo add-label ([web2-zalo-app.js](../web2/zalo/js/web2-zalo-app.js)), popup prompt shared ([popup.js](../web2/shared/popup.js)), audit-log filter ([index.html](../web2/audit-log/index.html)).
- **Race / stale-callback**: reconcile `selectPbh` bấm nhanh 2 PBH → hiện sai chi tiết (guard `selectedNumber`); products `_saveEdit` mở SP khác lúc đang lưu → đè tên/flag drawer mới (guard `_currentCode === code` + `?.drawer?.`).
- **Null-deref**: native-orders `saveEdit` đọc `.value` không guard (đồng bộ optional chaining cả 5 field).
- **Event/leak trong-trang**: so-order panel nhận hàng escHandler treo trên document (gỡ trong `closePanel` mọi đường đóng); quick-reply listener `resize` rò mỗi lần mount lại ô chat (lưu `onResize` + gỡ trong detach); chat-panel file-input không reset value → chọn lại cùng file không fire (reset `e.target.value`).
- **Double-submit**: variants nút Lưu tạo trùng biến thể (disable nút đầu `saveModal`, bật lại ở `closeModal`/validation-fail); products `_setupSse` thêm cờ idempotent.
- **Tiền/hiển thị**: supplier-wallet modal trả hàng hiện thành tiền dòng kể cả dòng chưa tích (đổi sang `sub` = 0 khi chưa tích → khớp tổng); returns wallet balance reset trước fetch + `.catch` → không dùng số dư stale của khách trước.

**3 false positive (KHÔNG fix, ghi rõ lý do MPA):** dashboard + report-revenue "SSE leak" — trang MPA full-reload nên EventSource chết theo trang khi nav, subscribe chạy 1 lần/load → không tích luỹ; zalo chat-view "thiếu unsubscribe" — `destroy()` ĐÃ gọi `unsub?.()` (chat-view.js:640).

**Verify:** node -c sạch 13 file JS; 8 trang đổi logic load lại OK trong browser (title/content/buttons đúng); variants modal Save guard wired đúng (không pre-disabled). Probe v2 giữ lại tái dùng.

### [web2 chat composers] Fix gửi NHẦM 2 tin khi gõ IME tiếng Việt (Enter giữa lúc soạn) ✅

**User:** "nhập tin nhắn '7865ghj' enter nó ra 2 dòng 1 lúc 'ghj' và '7865ghj'" (browser test native-orders chat).

**Root cause (browser-verified):** bộ gõ tiếng Việt (Telex/VNI) sinh `keydown` Enter với `isComposing=true` / `keyCode===229` khi user nhấn Enter để **xác nhận ứng viên bộ gõ**. Handler Enter của ô soạn KHÔNG guard composition → gửi NGAY phần chữ đang soạn dở (vd "ghj"), rồi Enter thật gửi phần đầy đủ ("7865ghj") → ra 2 tin. Repro chính xác qua dispatch `KeyboardEvent('keydown',{key:'Enter',isComposing:true,keyCode:229})` → panel gọi `send("ghj")` dù đang composing.

**Fix:** thêm guard `if (e.isComposing || e.keyCode === 229) return;` vào TẤT CẢ ô soạn gửi (irreversible send), KHÔNG đụng ô search/filter/numeric (IME double-fire vô hại ở đó):

- [web2/shared/chat-panel/web2-chat-panel.js](../web2/shared/chat-panel/web2-chat-panel.js) — composer Pancake (dùng ở native-orders + live-chat) — **PRIMARY**
- [web2/shared/zalo-chat/composer.js](../web2/shared/zalo-chat/composer.js) — composer Zalo (send + @mention dropdown)
- [live-chat/js/live/live-comment-list.js](../live-chat/js/live/live-comment-list.js) — trả lời comment livestream
- [web2/shared/web2-quick-reply.js](../web2/shared/web2-quick-reply.js) — autocomplete /shortcut trên cùng textarea chat

**Verify (browser, isolated panel + no-op adapter):** composing Enter → 0 send (trước fix: 1 send "ghj"); Enter thật sau compositionend → đúng 1 send "7865ghj", input clear. Shared component nên fix 1 chỗ áp dụng mọi trang dùng chat panel.

### [docs/pancake] XOÁ docs Pancake cũ → browser-test trang thật làm nguồn chuẩn ✅

**User:** "đừng đọc docs pancake nữa, xoá đi, mấy file đó cũ lâu chưa cập nhật → cần thì browser test pancake theo cookie ở secret coi chi tiết từng trang con". Nguồn chuẩn: `pancake.vn/NhiJudyStore/post` + `pancake.vn/NhiJudyHouse.VietNam/post`.

**Đã làm:**

- Xoá `docs/pancake/` (PancakeWebsite.md 78KB, cập nhật cuối 18/05 — lỗi thời). Không code nào reference path này.
- [CLAUDE.md](../CLAUDE.md) §"Pancake Reference": thay rule "đọc docs" → browser-test trực tiếp pancake.vn bằng session `PANCAKE_*` trong serect_dont_push.txt (SESSION_ID/JWT/cookies + `downloads/n2store-session/pancake-state.json`). TPOS giữ nguyên (`docs/tpos/TposWebsite.md`).
- MEMORY.md + memory `reference_pancake_browser_test` cập nhật; gỡ citation `(docs/pancake §14)` treo trong `reference_web1_realtime_msg_column`.
- dev-log entry lịch sử (L1784 cũ) có nhắc `docs/pancake §...` → GIỮ nguyên (append-only record).

### [web2/multi-tool] Tăng comment auto-clean triệt để — mark conv.id THẬT của comment boost ✅

**User:** "Dọn comment đã tăng là gì? Khi tăng comment dọn luôn được không, không cho hiện như [feed live-chat lọt comment tăng NGNgkPh/5qTl/by2…]".

**Root cause:** "Tăng số lượng comment" gọi `markBoost(conv.id)` (chặn ingest + purge) NHƯNG chỉ mark **conv.id hội thoại GỐC**. Mỗi `reply_comment` tạo **comment MỚI có conv.id riêng** (`<post_id>_<comment_id_mới>`) ≠ conv.id gốc → `_isBoosted(conv.id_gốc)` không khớp → comment boost lọt vào `web2_live_comments` → hiện ở live-chat + comments-mobile. Cùng lý do "Dọn comment đã tăng" (cũng mark conv.id gốc) không xoá được.

**Fix** ([multi-tool.js](../web2/multi-tool/js/multi-tool.js)): `sendLiveComment` đã trả `id` comment vừa tạo → dựng conv.id THẬT `<post_id>_<id>` và mark/purge CHÍNH XÁC:

- `markBoostIds(ids[])` — mark batch nhiều conv.id (endpoint `boost-mark` đã nhận `convIds[]`, purge `starts_with(id, cid||'_')` + ignore TTL 20').
- `run()`: thu `res.id` mỗi comment gửi thành công → `boostedConvIds.add(`${postId}_${res.id}`)` → flush mark mỗi 5 cái (chặn ingest SỚM) + **final purge** sau khi xong (đợi 1.8s relay ingest batch cuối rồi purge dứt điểm).
- Giữ `markBoost(conv.id gốc)` cũ (belt-and-suspenders cho trường hợp Pancake nest cùng conv).

**KHÔNG đổi backend** (boost-mark sẵn nhận convIds[]). Frontend-only. Verify: syntax OK, trang load 0 console error. Chạy boost thật cần Pancake login (không test trên live shop).

**Lưu ý:** fix chặn lọt cho boost MỚI. Comment tăng CŨ đã lọt (trước fix) cần dọn riêng (re-run boost hoặc purge DB) — `Dọn comment đã tăng` chỉ bắt được khi boost nest cùng conv.id gốc.

### [web2/fastsaleorder-invoice] Fix nút "Trả hàng" crash — STATE.items undefined ✅

**Phát hiện qua:** click-all probe toàn bộ 40 trang Web 2.0 (`scripts/web2-clickall-probe.js` — click mọi nút an toàn, bỏ destructive/logout/nav/commit, bắt JS error + toast). 39 trang / 556 click an toàn → **1 bug JS thật**.

**Bug:** nút "Trả hàng" trên 1 dòng PBH → `createRefund()` tại [pbh-app.js:522](../web2/fastsaleorder-invoice/pbh-app.js) gọi `STATE.items.find(...)` nhưng **`STATE.items` không tồn tại** (mảng rows là `STATE.orders`, set ở L101) → `TypeError: Cannot read properties of undefined (reading 'find')` → nút chết, không mở được trang Thu về.

**Fix:** `STATE.items.find(...)` → `(STATE.orders || []).find(...)` (defensive). Root-cause xác định qua stack trace (btn 12 → createRefund:522 → onclick).

**Các cảnh báo còn lại trong probe = KHÔNG phải bug** (đã xác minh từng cái):

- `pancake-settings` "Chưa đăng nhập pancake.vn", `printer-settings` "Print Bridge chưa chạy" → môi trường test (service local không chạy).
- `livestream-poller` "Nhập Page ID" → validation đúng.
- `system`/`services-dashboard`/`admin-sse-monitor` (nav=Y) → tab deep-link redirect (đúng thiết kế).
- `native-orders` "Không tìm thấy đơn NJ-…", `so-order` "Không tìm thấy shipment" → **artifact của probe** (click nhanh + force-close modal gây state churn trên nút stale); handler xử lý not-found đúng (toast + return, không crash). Verify: load sạch + click đơn → 0 error.
- `kpi` context-destroyed → nút reload async transient, load sạch 0 console error.

**Status:** ✅ fix + verify. Frontend qua GH Pages (JS no-cache).

### [web2/money] Audit + fix 8 rủi ro tiền (NCC + ví khách) — 5 HIGH + 3 MED ✅

**User:** "kiểm tra rủi ro các phần về tiền → browser test bằng click lại tất cả hoạt động" → "fix tất cả".

**Audit (2 agent + code-confirm + live-test qua browser fetch prod web2-api):** 0 CRITICAL, 5 HIGH, 3 MED. Live-reproduced HIGH-3 (ghi đôi payment txId random) + HIGH-4 (over-refund không cap) trên NCC test; HIGH-1/2/5 code-confirmed; ví khách core idempotency OK (test clone `0123456788`, đã restore 0).

**Fixes:**

- **HIGH-1** ([purchase-refund.js](../render.com/routes/purchase-refund.js)) — `cancel-approve`/`reject` TRƯỚC chỉ restock kho, KHÔNG đảo ledger ví NCC (`tx-refund-<code>` type=return) → `returnedAmount` kẹt vĩnh viễn → nợ NCC hụt. Thêm `reverseRefundLedger()` (DELETE ledger + trừ `returned_row_ids`, atomic trong transaction) + quick-refund lưu `rowReturns` vào record để đảo được + SSE `web2:supplier-wallet`.
- **HIGH-2** ([purchase-refund-app.js](../web2/purchase-refund/js/purchase-refund-app.js)) — `refundCode` (random) sinh TRƯỚC khi disable nút → double-submit = 2 mã = 2 phiếu (trừ kho + ghi ví 2 lần). Đưa guard `if(submitBtn.disabled)return` + disable lên TRƯỚC khi sinh mã (cả quick + bulk).
- **HIGH-3** ([supplier-wallet-app.js](../web2/supplier-wallet/js/supplier-wallet-app.js) + [supplier-debt-app.js](../web2/supplier-debt/js/supplier-debt-app.js)) — thanh toán/trả NCC thủ công txId random mỗi call → ghi đôi nếu guard bị bypass. Sinh `txId` idempotent 1 lần khi mở modal (dataset.txid), truyền vào addTransaction/recordPayment → server `ON CONFLICT(tx_id)` chặn ghi đôi.
- **HIGH-4** ([web2-supplier-wallet.js](../render.com/routes/web2-supplier-wallet.js) `/tx` + quick-refund) — server KHÔNG cap `Σqty ≤ đã mua` (cap chỉ ở client → 2 modal/2 máy hoặc API trực tiếp trả vượt). Client gửi kèm `ordered` (SL đã nhận); server reject (400) nếu `prev.qty+delta > ordered` dưới `FOR UPDATE` meta (đóng race 2 modal).
- **HIGH-5** ([web2-customer-wallet.js](../render.com/routes/v2/web2-customer-wallet.js) 2 CTE) — `total_returned` (Σ WITHDRAW ref='return') chỉ sinh khi HUỶ phiếu thu về; lúc tạo đã credit ví (nằm trong `total_deposited`). Trừ riêng lần nữa = double-count → huỷ 1 thu về làm Còn nợ tụt 2×. Fix: GỘP `total_returned` vào bucket "đã thu" thay vì trừ riêng → Còn nợ đúng mọi vòng đời (verified bằng số).
- **MED-6** ([web2-wallet-service.js](../render.com/services/web2-wallet-service.js) processDeposit) — TOCTOU manual deposit (chưa repro). Thêm dup-check `reference_type='balance_history'` SAU khi LOCK ví (serialize qua FOR UPDATE, không cần index rủi ro).
- **MED-7** ([supplier-debt-app.js](../web2/supplier-debt/js/supplier-debt-app.js) + [index.html](../web2/supplier-debt/index.html)) — cột "Thanh toán" gộp cả trả hàng gây nhầm. Tách `creditPayment`/`creditReturn` + relabel "Đã giảm nợ" + tooltip breakdown. (ending balance không đổi — vẫn đúng.)
- **MED-8** — không cần fix: so-order status 1 chiều (chỉ draft→received qua nút "Nhận hàng", KHÔNG revert tay) → kịch bản đổi status retro không xảy ra qua UI.
- **MED-9** ([fast-sale-orders.js](../render.com/routes/fast-sale-orders.js)) — `_applyWalletToPbh` đã private (không export) + processWithdraw lock chặn over-deduct. Thêm comment giữ private.

**KHÔNG đụng Web 1.0.** Backend cần Render deploy mới live; frontend qua GH Pages. Cleanup: NCC test `TEST-RISK-1781771603` còn trên prod web2Db (DELETE cần CLEANUP_SECRET mà web2-api không set env — xoá tay nếu muốn).

**Status:** ✅ code xong, syntax pass, frontend smoke 0 lỗi. Verify sau deploy: huỷ phiếu trả NCC → returnedAmount giảm; trả vượt → 400; huỷ thu về KH → Còn nợ về gốc (không tụt 2×).

### [wallets-v2] Fix Rút tiền (Customer 360) báo thành công nhưng KHÔNG trừ số dư ✅

**User:** "lỗi nạp tiền thì được mà rút tiền thì không được?" (trên trang Customer 360, nạp tiền OK nhưng rút tiền số dư đứng yên dù báo thành công).

**Nguyên nhân:** mọi lần "Rút tiền" thủ công đều gửi `order_id = null` → backend [render.com/routes/v2/wallets.js:681](render.com/routes/v2/wallets.js) đặt `refId = 'MANUAL'` (dùng chung). Stored function `wallet_withdraw_fifo` ([migration 075](render.com/migrations/075_wallet_refund_outbox.sql)) có idempotency guard: thấy giao dịch trước cùng `reference_id='MANUAL'` + `source='ORDER_PAYMENT'` cho số đt này → trả `success=TRUE`, `ALREADY_PROCESSED`, **không trừ**. → Lần rút tay đầu OK, từ lần 2 trở đi bị tưởng nhầm trùng → no-op. Nạp tiền (`processManualDeposit`) không có guard này nên luôn đúng.

**Fix** ([render.com/routes/v2/wallets.js](render.com/routes/v2/wallets.js)) — server-only, 2 chỗ, KHÔNG đụng DB/frontend:

- Dòng ~681 (`POST /:customerId/withdraw`): `refId = order_id || 'MANUAL'` → `order_id || \`MANUAL-${Date.now()}-${rnd}\``→ mỗi lần rút tay 1 reference duy nhất → guard không bao giờ tưởng nhầm trùng. Đơn hàng thật vẫn truyền`order_id` riêng → idempotency cho luồng đơn COD (`pending-withdrawals`) GIỮ NGUYÊN.
- Dòng ~83 (`GET /manual-transactions`): bộ lọc `reference_id = 'MANUAL'` → `reference_id LIKE 'MANUAL%'` (tương thích ngược: khớp cả 'MANUAL' cũ lẫn 'MANUAL-...' mới) để rút tay vẫn hiện trong danh sách giao dịch thủ công.

**KHÔNG đụng:** frontend (`wallet-panel.js`/`api-service.js`), stored function, schema/migration. `created_by` stamp + insert WITHDRAW (`sepay_id=NULL`, partial unique index migration 064) vẫn an toàn. `GET /:customerId/transactions` lọc theo phone — không cần sửa.

**Status:** ✅ fix code xong (Web 1.0, PROD). Cần verify sau khi Render deploy: rút tay nhiều lần liên tiếp trên `0123456788` → số dư giảm đúng mỗi lần.

### [web2/shared] Fix nút `.web2-btn-warning` chưa có CSS (3 trang fastsaleorder) ✅

**User:** "rà soát lại tất cả các nút, các trang chưa có css" (kèm 3 ảnh: fastsaleorder-delivery / -refund / -invoice).

**Root cause:** class `.web2-btn-warning` được DÙNG ở 3 nút nhưng KHÔNG hề được định nghĩa trong shared CSS → 3 nút này fallback về style `.web2-btn` cơ bản (nền trắng/viền xám) thay vì màu cảnh báo:

- `fastsaleorder-delivery/dlv-app.js:94` — nút row "Bị trả" (undo-2, xs)
- `fastsaleorder-invoice/pbh-app.js:200` — nút row "Trả hàng" (undo-2, xs)
- `fastsaleorder-invoice/index.html:140` — nút bulk "Hủy tất cả" (sm)

Audit toàn bộ web2 (`grep web2-btn-*`): các variant `default/primary/success/info/danger/sm/xs` đều có định nghĩa; **chỉ `warning` thiếu**. Token `--web2-warning` có (`#f59e0b` theme, `#fad733` base) nhưng thiếu `--web2-warning-hover`.

**Fix (shared — áp dụng mọi trang dùng `web2-btn-warning`):**

- [web2-components.css](web2/shared/web2-components.css): thêm `.web2-btn-warning` + `:hover` (theo đúng pattern 4 variant màu còn lại — `background/border = var(--web2-warning)`, `color:#fff`).
- [web2-theme.css](web2/shared/web2-theme.css): thêm token `--web2-warning-hover: #d97706` (amber-600, cặp với `#f59e0b`).
- [web2-base.css](web2/shared/web2-base.css): thêm fallback `--web2-warning-hover: #e6c200`.
- Bump cache-bust `?v=20260618w1` cho base/components/theme trên cả 3 trang (warning chỉ dùng ở 3 trang này nên không cần bump trang khác).

**Verify (Playwright localhost, ext n2store, login web2 admin):** invoice page → `web2-components.css?v=20260618w1` loaded; `.web2-btn-warning` computed bg = `rgb(245,158,11)` amber + text trắng (trước đó là nền UA mặc định xám); primary vẫn xanh Zalo `#0068ff`. Screenshot xác nhận nút "Trả hàng" (undo-2) trong row giờ màu cam, cạnh nút truck cyan. Delivery page cũng load đúng version + warning amber.

**Status:** ✅ FE verified. Web 2.0 shared CSS.

### [purchase-refund] Thêm hình SP (tham chiếu Kho SP) + cân đối lại modal trả hàng ✅

**User:** "thêm hình sản phẩm → tham chiếu vào kho sản phẩm" + "giao diện chưa cân đối".

**Thêm:**

- **Ảnh SP từ Kho SP**: agg item trong `loadSoOrderReceivedItems` lấy `matched.imageUrl` (nguồn `Web2ProductsCache` = Kho SP). Helper `safeImageUrl` (chặn scheme nguy hiểm) + `thumbHtml` (img + fallback icon `onerror`). Render thumbnail 38×38 ở: **Section A** (cột Tên+Biến thể), **modal trả cả đơn** (`#prBulkRows`), **modal trả lẻ** (`#prQuickInfo` hàng "Ảnh"). CSS `.pr-thumb`/`.pr-thumb-ph`/`.pr-name-cell`.
- **Cân đối modal bulk**: width 760→**720px**; siết cột số (Tồn 52 / Giá 90 / Trả SL 84 / Thành tiền 104, Mã SP 100), qty input 64→56px, `td:nth-child(2)` (Tên) `min-width:200px` → tên SP tối đa 2 dòng (hết vỡ 3 dòng), thumbnail lấp khoảng trống trái (gốc "chưa cân đối"). Bump CSS `?v=20260617c`, JS `?v=20260617c`.

- **Xem ảnh FULL (lightbox)**: thumbnail ảnh thật click được (`pr-thumb-zoom`, cursor zoom-in) → overlay `pr-img-overlay` hiện ảnh full-size `object-fit:contain` (không crop, max 92vw/92vh) + nút ×, click/Esc đóng. Delegated click toàn cục (1 listener) cho mọi thumbnail (Section A + modal bulk + modal lẻ). Đóng lightbox KHÔNG đóng modal trả hàng. Bump v20260617d.
- **Modal trả cả đơn = lớn nhưng KHÔNG tràn viền** (user: "modal full browser" → "bố cục lại, đừng tràn viền"): `.pr-bulk-content` `width:92vw; max-width:1200px; height:88vh` (đo b1: 1152×760 trong 1440×900, lề 144px ngang / 79+60px dọc — không chạm viền). Flex column: header + footer (Lý do/Phương thức/Ghi chú/Tổng/nút) **flex-shrink:0 cố định**, CHỈ `.pr-bulk-table-wrap` (flex:1, overflow-y:auto) cuộn → nút Hủy/Xác nhận LUÔN trong tầm nhìn, không bị clip; `overflow:hidden` ở content+form chống đẩy ra ngoài. Modal lẻ (538px) không bị ảnh hưởng. Bump v20260617f.

**Verify (Playwright localhost, ext n2store):** Section A 7 SP có thumbnail (3 SP có ảnh base64/picsum từ Kho SP, còn lại placeholder icon); modal bulk A1 3 SP thumbnail render, name 2 dòng, modal 720px cân đối; modal lẻ có hàng "Ảnh"; click thumbnail → lightbox full ảnh (picsum 500×500 render đúng), đóng overlay giữ nguyên modal. 0 lỗi console. `node --check` PASS.

**Status:** ✅ FE verified. purchase-refund (Web 2.0). Ảnh tham chiếu thẳng Kho SP (`Web2ProductsCache.imageUrl`), không lưu trùng; xem full qua lightbox.

### [cloudflare-worker] Fix SSE `/api/sepay-home/stream` 502 → "Mất kết nối" trên balance-history-home ✅

**Triệu chứng:** trang `balance-history-home` hiện badge đỏ "Mất kết nối"; console lặp `GET /api/sepay-home/stream → 502` + `[REALTIME] SSE Error` → reconnect vô hạn. Data vẫn tải OK (history API riêng), chỉ realtime chết.

**Root cause:** [proxy-handler.js](cloudflare-worker/modules/handlers/proxy-handler.js) `handleSepayHomeProxy` truyền `timeout = isSse ? 0 : 15000` cho `fetchWithRetry`. Trong `fetchWithTimeout` ([shared/universal/fetch-utils.js](shared/universal/fetch-utils.js):28) `setTimeout(()=>controller.abort(), 0)` = **abort NGAY** → fetch tới Render bị huỷ tức thì → retry 3 lần đều fail → handler trả **502**. (`timeout` chỉ tính thời-gian-tới-headers; SSE headers về nhanh rồi `clearTimeout` cho body stream tiếp — nên KHÔNG cần 0.)

**Bằng chứng:** direct Render `/api/sepay-home/stream` → 200 `text/event-stream` ✓; original `/api/sepay/stream` qua worker → 200 ✓ (handler đó dùng 15000, không có nhánh SSE-0). Chỉ sepay-home (timeout 0) chết.

**Fix:** đổi `isSse ? 0 : 15000` → `15000` (giống `handleSepayProxy` đã chạy ổn). Giữ nhánh `isSse` set `Accept: text/event-stream`. Deploy worker `wrangler deploy` (version `d29a40f3`).

**Verify:** sau deploy, `/api/sepay-home/stream` qua worker → **200 `text/event-stream`** + nhận `event: connected`. Badge sẽ chuyển "Mất kết nối" → "Realtime" khi reload trang.

### [balance-history-home] Phân biệt 2 tài khoản SePay Home (cột "Tài khoản" + bộ lọc 44 TL / 481 NVK) ✅

**User:** muốn "thêm webhook mới" (SePay) cho trang `balance-history-home` gồm 2 tài khoản (`09777743051810` "44 TL" + `09777743051708` "481 NVK") — nhấn mạnh đặt tên **TÁCH RIÊNG** với SePay shop có sẵn để code phân biệt được.

**Phát hiện:** toàn bộ hạ tầng SePay Home đã build sẵn & tách biệt hoàn toàn với `/api/sepay` của shop:

- Worker route `/api/sepay-home/*` → `n2store-fallback.onrender.com` (đã có).
- Backend `routes/sepay-home-webhook.js` (webhook/history/statistics/stream), bảng `balance_history_home`, log `sepay_home_webhook_logs`, env `SEPAY_HOME_API_KEY` (đã set trên Render, khớp secrets), SSE buffer `balanceHomeSseClients` — KHÔNG đụng `SEPAY_API` của shop.
- Verify live: worker→render ping OK, history OK. → **Naming separation user yêu cầu đã xong sẵn.**

**Việc mới (user chọn "thêm cột + bộ lọc theo TK"):** 2 TK cùng đổ vào 1 bảng, phân biệt bằng `account_number`.

- **config.js**: `CONFIG.ACCOUNTS` (number→label, single source of truth) + helper `window.getAccountLabel()`. Đổi TK/nhãn nhà CHỈ sửa ở đây.
- **Backend** ([sepay-home-webhook.js](render.com/routes/sepay-home-webhook.js)): thêm filter `accountNumber` cho `/history` + `/statistics` (kể cả subquery `latest_balance` → số dư riêng từng TK khi lọc).
- **index.html**: thêm `<div id="accountChips">` (render từ JS) + cột header "Tài khoản". Bump `?v=20260618bh`.
- **balance-table.js**: cell `.col-account` hiện `.account-tag` (nhãn nhà, title=số TK); empty-state colspan 7→8.
- **balance-core.js**: `filters.accountNumber` + check trong `transactionMatchesFilters` (SSE realtime lọc đúng TK).
- **balance-filters.js**: `setupAccountChips()` (render chip "Tất cả / 44 TL / 481 NVK" từ CONFIG.ACCOUNTS, ẩn nếu <2 TK) + reset trong `resetFilters()`.
- **main.js**: gọi `setupAccountChips()`. **home.css**: `.account-chips` (teal, tách màu type-chips) + `.account-tag`.

**Verify (Playwright localhost + ext, seed 2 GD ảo/TK qua webhook thật):** webhook 2 TK → 200 OK (worker→render→`balance_history_home`); chips ["Tất cả","44 TL","481 NVK"] + cột "Tài khoản" render; row hiện đúng nhãn nhà; click chip → frontend gửi `accountNumber=...` tới `/history`+`/statistics` (đã hook fetch xác nhận). Lọc server-side chỉ có hiệu lực sau khi **deploy backend** (localhost đang gọi prod backend chưa có filter). Đã **xoá sạch** 2 row test (`sepay_id 999000801/802`).

**Cần làm thủ công (ngoài code — SePay dashboard `my.sepay.vn`):** tạo webhook trỏ URL `https://chatomni-proxy.nhijudyshop.workers.dev/api/sepay-home/webhook`, chọn 2 TK, định dạng JSON, API key = `SEPAY_HOME_API_KEY` (Bảo mật → Apikey).

**Status:** ✅ code xong + verify FE. Backend filter chờ deploy (push render.com/\*\* → Render Build Filter auto-deploy). Web 1.0 (balance-history-home, pool chatDb).

### [delivery-report] Tab "ĐƠN 0đ" hiện ĐỦ mọi nhóm (Thành phố/NAP/Thu về), không chỉ Shop+Tomato ✅

**User:** "đơn 0 đồng hiện tại chỉ cập nhật của bán hàng shop và tomato, không cập nhật thành phố/nap... muốn cập nhật toàn bộ cả thành phố nap luôn" → chốt "giữ nguyên luôn tomato" (giữ cột TOMATO dù luôn 0/0).

**Nguyên nhân:** lite mode (tất cả user) thu hẹp các tab gộp (combo/zero/all) về **2 cột tomato+shop** ở 3 chỗ ghép nối → tab `zero` vô tình lọc bỏ đơn 0đ thuộc NAP/Thành phố/Thu về. Cộng với `assignTomatoNap` LUÔN đẩy đơn 0đ về NAP (không bao giờ TOMATO vì TOMATO là rổ chia ~21% giá trị tiền của nhóm Tỉnh) → cột TOMATO trong view 0đ luôn 0/0, chỉ còn SHOP 0đ hiện.

**Fix** ([delivery-report.js](delivery-report/js/delivery-report.js)) — chỉ chạm tab `zero`, frontend-only:

- Thêm hằng `ZERO_TAB_GROUPS = ['tomato','nap','city','shop','return']` (giữ TOMATO theo yêu cầu).
- `getActiveGroups()`: thêm nhánh `if (tab === 'zero') return ZERO_TAB_GROUPS;` trước check lite → export Excel 0đ gồm đủ sheet.
- `getTabFilteredData()` nhánh `zero`: bỏ `inLiteGroups`, chỉ `data.filter(isZeroCOD)` → bộ đếm "Đã quét N/N" gồm mọi nhóm.
- `renderAllGroupsView()`: tab zero → `groupKeys = ZERO_TAB_GROUPS` + pre-filter `isZeroCOD` ở CẢ lite lẫn full (gộp `liteItemFilter`/`isZeroTabFull` thành 1 `itemFilter`).
- `buildPrintGroups()` (in/preview): tab zero → cũng dùng `ZERO_TAB_GROUPS` (đồng bộ on-screen).
- `exportExcelZeroDong()`: tên file gọn còn `'DON0D'` (bỏ hậu tố `_TOMATO_SHOP`).
- Bump `?v=20260618a` ([index.html](delivery-report/index.html)).

**KHÔNG đụng:** backend/DB, assignment logic, tab combo/all, nút Ảnh TMT/NAP/Thành Phố + Gửi Kèm (vẫn ẩn ở tab zero do guard `activeTab === 'province'/'city'`). Quét mã đơn 0đ-nap/city giờ hiện đúng cột (trước nửa vời → cải thiện).

**Verify (Playwright localhost, ext n2store):** seed 5 đơn 0đ phủ mọi nhóm → tab ĐƠN 0đ render đúng: TỈNH NAP 0/1, THÀNH PHỐ 0/1, BÁN HÀNG SHOP 0/1, THU VỀ 0/1, TOMATO 0/0 (giữ, luôn rỗng); đơn tỉnh 500k (≠0đ) bị loại; `drScanTotal`=4 khớp render; 0 lỗi console từ delivery-report.js.

**Status:** ✅ verified end-to-end (localhost). Web 1.0 (delivery-report, PROD).

### [purchase-refund] Nút "Trả hàng" ở header ĐƠN → modal trả nhiều SP cùng lúc (SL mặc định 0) ✅

**User:** "cho nút trả hàng ở vị trí header đơn (A1/b1) để mở modal gồm TẤT CẢ sản phẩm, mặc định số lượng 0 để user chỉnh → nhanh hơn trả từng cái → gồm thông tin như modal trả 1 SP".

**Thêm (frontend-only — backend `quick-refund` đã nhận `products[]` đa SP atomic, KHÔNG đổi):**

- **HTML** [index.html](web2/purchase-refund/index.html): modal `#prBulkModal` (reuse class `.pr-quick-*`) — info NCC/đơn/số SP + bảng SP (Mã · Tên+Biến thể · Tồn · Giá · **Trả SL** input · Thành tiền) + Lý do + Phương thức hoàn + Ghi chú + Tổng tiền NCC sẽ hoàn. Bump CSS/JS `?v=20260617a`.
- **CSS** [purchase-refund.css](web2/purchase-refund/css/purchase-refund.css): `.pr-bulk-*` (table sticky header, qty input, dòng có SL>0 highlight vàng) + `.pr-bulk-btn` (nút đỏ nhạt ở header nhóm).
- **JS** [purchase-refund-app.js](web2/purchase-refund/js/purchase-refund-app.js): `renderSourceList` lưu `SOURCE_STATE.groups` + chèn nút "Trả hàng" `data-bulk-group` vào header mỗi nhóm. `openBulkRefund/renderBulkRows` (qty mặc định **0**, max=tồn) + live total per-line + tổng (clamp input 0..tồn). `submitBulkRefund` gom SP có SL>0 → **1 phiếu** `POST /api/purchase-refund/quick-refund` (đa SP, atomic: trừ kho từng dòng + ghi ví NCC theo totalAmount). Giữ await+loading (money op). CHỈ SP có SL>0 vào phiếu; rỗng → cảnh báo.

**Fix kèm (stale stock sau trả):** `quick-refund` KHÔNG `_notify('web2:products')` → `Web2ProductsCache` (IDB) giữ tồn cũ kể cả reload → Section A hiện tồn sai. Thêm `await Web2ProductsCache.refresh()` TRƯỚC `loadSourceItems()` ở **cả** `submitBulkRefund` VÀ `submitQuickRefund` (sửa luôn bug cũ của nút trả lẻ). Bump JS `?v=20260617b`.

**Verify (Playwright localhost, ext n2store, login web2 admin) — LIVE submit (user cho phép chỉnh data Web 2.0 beta):** modal b1 4 SP SL=0; nhập 2×HNMM3S + 1×HNQUANXAM → tổng 1.180.000₫; submit → toast "✓ Đã trả 3 SP (2 dòng) cho b1 — giảm ví NCC 1.180.000₫". Server: stock HNMM3S 10→8, HNQUANXAM 5→4 (xác minh qua `/api/web2-products/list`), phiếu mới tạo (status NCC DUYỆT, ghi đủ 2 SP, Tổng SL 3 / 1.180.000₫), ví NCC −1.18M. Sau fix refresh: Section A hiện tồn MỚI ngay (HNMM3S=7, HNQUANXAM=4 sau lần trả thứ 2). clamp 99→max=tồn OK. 0 lỗi console.

**Status:** ✅ verified end-to-end LIVE (submit thật, data Web 2.0 beta). purchase-refund (Web 2.0). Backend không đổi (chỉ +refresh cache client).

## 2026-06-17

### [web2/shared] Popup dùng chung — alert/confirm/popup nhiều loại + hiệu ứng custom, migrate toàn cục Web 2.0 ✅

**User:** "tìm kiếm toàn bộ, toàn cục web 2.0 về alert, popup tất cả trang thay toàn bộ về custom hiệu ứng, giao diện → làm custom riêng về phần popup, alert nhiều loại (confirm, warning, OK, exit,...) để các trang tham chiếu dùng nguồn này".

**Nguồn DUY NHẤT:** [web2/shared/popup.js](web2/shared/popup.js) (`window.Popup`) — đã auto-load mọi trang Web 2.0 qua [web2-sidebar.js](web2/shared/web2-sidebar.js) (`inject('popup.js','20260617')`). KHÔNG tự build alert/confirm/popup riêng.

**Nâng cấp popup.js (hiệu ứng + loại):**

- API: `alert` · `info` · `success` · `error` · `warning` (OK đơn, typed màu+icon) · `confirm` (Promise<boolean>) · `danger` (confirm phá huỷ, nút ĐỎ) · `exit` (rời/thoát — "Thoát"/"Ở lại") · `prompt` (Promise<string|null>, có `multiline`). opts: `title/type/danger/okText/cancelText/defaultValue/placeholder/multiline`.
- **Hiệu ứng custom:** spring entrance + icon pop + ring-pulse theo accent; burst Lottie (`Web2Lottie.success()/error()`) khi type success/error; **scroll-lock body đếm chồng** (iOS-safe), nút danger đỏ `#ef4444`, focus-visible ring, **tôn trọng `prefers-reduced-motion`** (tắt hết animation). Giữ nguyên bộ utility class `.w2p-overlay/.w2p-card/.w2p-scroll-area` cho modal custom khác.
- KHÔNG override `window.alert/confirm/prompt` (giữ ranh giới migrate rõ); KHÔNG `backdrop-filter:blur` (chống lag theo MODAL-ANTI-LAG).

**Migrate toàn cục (5 sub-agent song song, 33 file):** thay HẾT native `alert/confirm/prompt` → `Popup.*` ở web2/_ + native-orders + so-order + live-chat. Quy tắc: `confirm/prompt` → `await Popup._`(hàm thành`async`, hoặc `.then()` khi handler sync); thao tác phá huỷ (xoá/huỷ/reset/gỡ) → **`Popup.danger`** (28 chỗ); lỗi → `Popup.error`. Wrapper sẵn có (`w2pConfirm/w2pAlert/w2pPrompt`) bỏ nhánh native chết, delegate thẳng `window.Popup`(callers đã`await`).

**Verify:** `node --check` PASS toàn bộ 33 file; grep KHÔNG còn native call thật (chỉ comment + 1 fallback chuỗi cuối `web2-sidebar.alertSoon`); KHÔNG có `Popup.confirm/danger/prompt` nào dùng trong điều kiện mà thiếu `await` (chống bug Promise luôn truthy). Browser (Playwright localhost, ext): danger popup render đúng (nút đỏ "Xoá", icon octagon, scroll-lock bật/tắt đúng, accent `#ef4444`), load sạch 0 lỗi console ở native-orders + pancake-settings + reconcile + customers + products + purchase-refund + returns. Số call sau migrate: confirm 20 · danger 28 · prompt 17 · error 13 · alert 7 · info/success/warning/exit mỗi loại ≥1.

**Status:** ✅ verified end-to-end. Web 2.0 shared. Trang mới cần alert/confirm/popup → DÙNG `window.Popup.*`, đừng reinvent.

### [native-orders] Bộ lọc chiến dịch: NHÓM (cha) vs RIÊNG LẺ (bài) — loại trừ 2 chiều + tự chọn 2 bài mới nhất ✅

**User:** "bộ lọc hình 2 chưa đúng" → làm rõ: 2 cấp — **chiến dịch cha = NHÓM bài** (phần trên, radio), **chiến dịch bài viết = RIÊNG LẺ** (phần dưới, checkbox). Yêu cầu: (1) phần trên bỏ "— Tất cả (không lọc cha) —"; (2) phần dưới bỏ nút "Đồng bộ Pancake" (đã tự động); (3) phần dưới **tự chọn 2 bài mới nhất (House + Store)**; (4) **loại trừ 2 chiều** — chọn nhóm thì bài riêng lẻ mất tick & ngược lại.

**Sửa:**

- **Backend** [native-orders.js](render.com/routes/native-orders.js) `GET /campaigns`: thêm `MAX(fb_page_name) AS page_name` + `fb_page_id` → mỗi campaign trả `pageName`/`pageId` để FE phân biệt House/Store. (Idempotent SQL, cùng GROUP BY.)
- **HTML** [index.html](native-orders/index.html): gỡ nút `#campaignSyncWeb2` ("Đồng bộ Pancake") khỏi toolbar (giữ "Tất cả"/"Bỏ chọn").
- **JS** [native-orders-app.js](native-orders/js/native-orders-app.js):
    - `renderParentCampaigns()` bỏ row "— Tất cả (không lọc cha) —" (chỉ list nhóm thật).
    - `pickNewestHouseStore()` + `reconcileCampaignSelection()`: list sort `lastOrderAt` DESC → lấy bài đầu khớp `/house/i` + `/store/i`; fallback (thiếu pageName, backend chưa deploy) → 2 campaign mới nhất. Dọn ID stale + tự chọn khi rỗng → **sửa luôn bug "4 chiến dịch" ảo** (ID cũ không tồn tại làm lọc ra 0 đơn).
    - **Loại trừ 2 chiều**: `selectParentCampaign(id)` chọn nhóm → clear `selectedCampaignIds`; checkbox bài riêng lẻ tick → `clearParentSelection()` (bỏ radio nhóm). `campaignSelectAll` cũng clear nhóm.
    - `renderCampaignLabel()`: nhóm đang chọn → hiện TÊN NHÓM; ngược lại hiện số bài riêng lẻ.
    - Gỡ `syncFromWeb2Pancake` + storage listener `web2_selected_campaigns` + fallback shared-key (`loadCampaignSelection` chỉ đọc own-key).

**Verify (Playwright localhost, ext n2store):** label "4 chiến dịch" → **"2 chiến dịch"** (tự chọn 2 bài mới nhất, 2 tick); không còn "không lọc cha"/"Đồng bộ Pancake"; chọn nhóm → 0 tick + label = tên nhóm; tick bài → radio nhóm bỏ + label = tên bài. 0 lỗi console. `node --check` PASS. ⚠ pageName House/Store chỉ tách đúng SAU khi deploy backend (chưa deploy → fallback 2 bài mới nhất).

**Status:** ✅ FE verified end-to-end. Chờ deploy Render để pageName phân biệt House/Store. native-orders (Web 2.0).

### [pancake-settings] Thêm card "Admin theo Page" — đếm account admin + dùng được mỗi page ✅

**User:** từ trang `web2/pancake-settings/` muốn "ghi rõ có bao nhiêu account page house, có bao nhiêu account page store".

**Bối cảnh:** màn "Tăng comment" (`web2/multi-tool/`) spawn 1 worker / account admin của page, lọc bỏ token hết hạn (`getPageAccountJwts`) → page House chạy 3 worker dù có 5 account admin (2 account Thu Lai/Con Nhoc hết hạn). Trang settings cũ chỉ liệt kê 6 account dạng phẳng, KHÔNG tổng hợp admin theo page.

**Thêm:**

- **HTML** [index.html](web2/pancake-settings/index.html): card mới "Admin theo Page" (sau card Tài khoản) + badge `#pageAdminBadge` + list `#pageAdminList`.
- **JS** [pancake-settings.js](web2/pancake-settings/js/pancake-settings.js): `renderPageAdminStats()` gộp `_accountsCache` (cùng nguồn mục Tài khoản — `Web2PancakeAccounts.list()` trả `pages[]`+`token_exp`+`is_active`) theo `page.id`. **"Dùng được" = token còn hạn AND không tắt sync** — khớp 100% logic `getPageAccountJwts` của boost. Mỗi page hiện: tổng admin (pill), `X/Y dùng được` (chip), tên account dùng được, dòng muted account hết hạn/tắt sync. Sort theo usable desc. Wire vào `loadAccounts()` (initial/reload/add) + `deleteAccount` apply/rollback (đồng bộ optimistic). Reuse class `.ps-page-item`/`.tok-chip`/`.status`, không thêm CSS.

**Verify (Playwright, localhost — ext n2store):** card render 4 page — **Nhi Judy House: 5 admin, 3/5 dùng được (Huyền Nhi, longxienc, Thu Huyền)**; **NhiJudy Store: 5 admin, 3/5 dùng được (Huyền Nhi, longxienc, Thu Huyền)**; Nhi Judy Ơi 2/4; NhiJudy Nè 2/4. Con số 3 khớp đúng số worker boost đã thấy. Screenshot xác nhận layout theme Zalo blue OK.

**Status:** ✅ verified browser end-to-end. pancake-settings (Web 2.0).

### [pancake-settings] Nút "Đồng bộ pages từ token" — sửa account có quyền page nhưng pages cache rỗng ✅

**User:** "Kỹ Thuật NJD cũng có quyền 2 page mà" (screenshot Pancake: KT admin NhiJudy Store + Nhi Judy IG + Nhi Judy House) nhưng card "Admin theo Page" đếm KT = 0 page.

**Root cause:** `pancake_accounts.pages` là snapshot — KT có token còn hạn (`is_active`, `token_exp` chưa hết) NHƯNG `pages: []` (chưa bao giờ fetch; auto-refresh chỉ gia hạn token, KHÔNG refetch pages). Boost (`getPageAccountJwts`) cũng đọc snapshot này nên KT cũng không tham gia "Tăng comment".

**Fix:**

- **Module** [web2-pancake-accounts.js](web2/shared/web2-pancake-accounts.js): thêm `updatePages(accountId, pages)` → `PUT /api/pancake-accounts/:id {pages}` (qua `_json` có auth). Bump `?v=20260617pageadmin`.
- **JS** [pancake-settings.js](web2/pancake-settings/js/pancake-settings.js): `syncAccountPages()` — với mỗi account còn hạn, fetch `GET /api/pancake/pages?access_token=<token account đó>` (parse `categorized.activated||pages`), map `{id,name}`, ghi DB qua `updatePages` (CHỈ khi khác cache + KHÔNG ghi đè rỗng → token lỗi/rate-limit không xoá pages). Xong → `Web2Chat.syncFromRenderDB({force:true})` (boost thấy ngay) + `loadAccounts()`. Nút "Đồng bộ pages từ token" + help. Bump `?v=20260617pageadmin2`.
- **HTML** [index.html](web2/pancake-settings/index.html): nút `#btnSyncAccountPages` + help text.

**Verify (Playwright, localhost — ext n2store):** trước sync House/Store = 5 admin, 3 dùng được. Click "Đồng bộ pages" → KT persist `pages:[Nhi Judy(IG), Nhi Judy House, NhiJudy Store]` (đúng screenshot). Sau: **House & Store = 6 admin, 4 dùng được** (usable: Kỹ Thuật NJD, longxienc, Huyền Nhi, Thu Huyền; hết hạn: Thu Lai, Con Nhoc). Thêm row mới "Nhi Judy (instagram) 1/1". `getPageAccountJwts(House/Store)` → 4 worker (gồm KT) → boost cũng đúng. (NhiJudy Nè 4→3 admin: sync sửa stale 1 account đã mất quyền Nè theo token thật.)

**Status:** ✅ verified browser end-to-end. pancake-settings (Web 2.0).

### [so-order] Mỗi NCC/Đơn có Tổng KG · Tiền HĐ · Giảm · Ship RIÊNG (per-đơn meta) ✅

**User:** "Các NCC có tổng KG, tổng tiền, giảm giá, phí ship riêng." Chốt: gom theo từng KHỐI/ĐƠN (invoiceGroupId); hiển thị dòng phụ đầu mỗi khối; sửa trong modal Sửa lô — mỗi NCC 1 cụm.

**Trước:** KG/Số kiện/Tiền HĐ ở cấp LÔ (cả ngày giao); Giảm/Ship đã per-đơn (`orderAdjustments[gid]`).

**Sau (refactor 4 phase):**

- **Storage** [so-order-storage.js](so-order/js/so-order-storage.js): `orderAdjustments[gid]` mở rộng `{ discount, shipping, weightKg, caseCount, contractAmount }`. `getShipmentAdjustTotals` cộng cả 5. Migration heal 1 lần: dời KG/Kiện/HĐ cấp lô → đơn đầu, clear field cấp lô (tránh cộng đôi), idempotent.
- **Render** [so-order-app.js](so-order/js/so-order-app.js): lô header = TỔNG read-only (`Tổng N Kiện : KG | Tổng HĐ | Giảm·Ship`). `_groupMetaSubHeaderHtml` chèn **dòng phụ đầu mỗi đơn** (`meta.inv.render`) hiện `🏪 NCC · KG · HĐ · Giảm · Ship` riêng. CSS `.so-grpmeta-*`.
- **Create / sửa 1 dòng**: form KG/Kiện/HĐ/Giảm/Ship → lưu meta của đơn đó (per-gid). `_applyShipMetaUi` load từ order meta.
- **Sửa lô modal** [index.html](so-order/index.html): ẩn cụm meta chung (`[data-single-meta]`), hiện section `#soPerOrderMetaWrap` — mỗi đơn 1 cụm input (NCC·Kiện·KG·HĐ·Giảm·Ship) + cụm "Đơn mới". `_renderPerOrderMeta`/`_readPerOrderMeta`. Submit lưu từng cụm qua `setOrderAdjustment` (cụm "Đơn mới" → newGid). CSS `.so-pm-*`.

**Refine (sau khi test):** sub-header `_groupMetaSubHeaderHtml` đổi sang **value-driven** (hiện field khi giá trị > 0, bỏ gate theo tab flags — Giảm=0 tự ẩn); cụm per-NCC trong Sửa lô **LUÔN hiện đủ 5 ô** (không gate flags) vì đó là nơi user nhập meta per-NCC. Tab flags chỉ còn ảnh hưởng ô meta CHUNG của form (tạo mới). Bump `so-order-app.js?v=20260617c`.

Bump `so-order.css` `?v=20260617b`.

**Verify (Playwright, localhost — ext n2store):** seed 2 đơn A1+b1 cùng lô 25/6; Sửa lô → 3 cụm (A1, b1, Đơn mới) đủ 5 ô, ô meta chung ẩn. Nhập A1{5KG,HĐ200k,Giảm10k,Ship20k} + b1{3KG,HĐ500k,Ship15k} → Lưu. **Sub-header**: `A1 · 5 KG · HĐ 200.000 · Giảm 10.000 · Ship 20.000`, `b1 · 3 KG · HĐ 500.000 · Ship 15.000` (Giảm 0 tự ẩn). **Lô header TỔNG**: `8 KG | HĐ 700.000 | Giảm 10.000 · Ship 35.000` (đúng tổng). Round-trip reopen đúng giá trị. **Migration** lô cũ 16/6: HĐ 666.5k/Giảm/Ship cấp lô → đơn đầu, hiện đúng sub-header. Cleanup sạch (rows 0, Kho 0).

**Status:** ✅ verified browser end-to-end. so-order (Web 2.0).

## 2026-06-16

### [delivery-report] Thêm thẻ "Tổng tiền hóa đơn" (headline) = Giao hàng thu tiền + Tổng trả trước ✅

**User:** "thêm 1 stat tổng tiền hóa đơn (Tổng số hóa đơn trong bộ lọc), Tổng tiền = Giao hàng thu tiền + Tổng trả trước".

**Fix:** stats bar nay 3 thẻ — thêm thẻ **"Tổng tiền hóa đơn"** đứng đầu (icon `fa-file-invoice-dollar` tím, id `drStatTotal*`):

- [index.html](delivery-report/index.html): chèn thẻ tổng trước thẻ "Giao hàng thu tiền".
- [delivery-report.js](delivery-report/js/delivery-report.js) `renderStats()`: `totalValue = SumCollectionAmount + SumAmountDeposit`; `totalCount = DeliveryReportState.allData.length` (tổng hóa đơn trong bộ lọc tìm kiếm — CÙNG phạm vi ngày với SumDeliveryReport, không đổi theo tab/scan để 3 thẻ đồng nhất).

**Lưu ý:** Tổng tiền theo định nghĩa user (COD amount + Deposit amount) — KHÁC `SumAmountTotal` của TPOS (COD+Deposit ≠ AmountTotal vì COD là full giá trị đơn COD, Deposit là đơn trả trước riêng). Bump `?v=20260616d`.

**Verify (Playwright, live nhijudy.store):** 3 thẻ — Tổng tiền hóa đơn 383 HĐ / 248.453.000, Giao hàng thu tiền 383 / 220.745.000, Tổng trả trước 67 / 27.708.000. Arithmetic check: COD+Deposit (220.745.000+27.708.000) === Total (248.453.000) ✓.

**Status:** ✅ Web 1.0 (delivery-report, PROD).

### [delivery-report] 2 thẻ thống kê lấy THẲNG từ TPOS SumDeliveryReport (qua worker proxy) ✅

**User:** "đổi trang sang dùng thẳng SumDeliveryReport, qua proxy Cloudflare worker không gọi thẳng TPOS" → "chỉ lấy 2 cột: tổng hóa đơn giao hàng thu tiền + tổng trả trước".

**Trước:** stats bar 5 thẻ (COD/Đã thanh toán/Trả hàng/Đang giao/Đối soát fail) **tự cộng client-side** từ list `Report/DeliveryReport`. "Tổng trả trước" (deposit) không có sẵn vì list không tính.

**Fix:** rút còn **2 thẻ** lấy số tổng hợp sẵn của TPOS `Report/OdataService.SumDeliveryReport` (proxy `${WORKER_URL}/api/odata/...`, KHÔNG gọi thẳng tomato.tpos.vn):

- [index.html](delivery-report/index.html): xóa 4 thẻ (Đã thanh toán/Trả hàng/Đang giao/Đối soát fail), giữ "Giao hàng thu tiền" + thêm "Tổng trả trước" (icon `fa-hand-holding-usd` xanh, id `drStatDeposit*`).
- [delivery-report.js](delivery-report/js/delivery-report.js): thêm `buildSumApiUrl()` + `fetchSumReport(token)` (set `DeliveryReportState.sumReport`); `fetchData()` fetch sum **song song** list, `await` trước render; `renderStats()` đọc thẳng từ sumReport thay vì cộng list. State thêm `sumReport`.

**Mapping** (đã verify live qua worker, HTTP 200): Giao hàng thu tiền = `SumQuantityCollectionOrder` / `SumCollectionAmount`; Tổng trả trước = `SumQuantityDeposit` / `SumAmountDeposit` (== `SumPrepayment`).

**Lưu ý:** 2 thẻ theo NGUYÊN khoảng ngày tìm kiếm (+Q) — KHÔNG đổi khi lọc carrier/tab/scan (đúng nghĩa "tổng" của TPOS, khác hành vi cũ là cộng theo view đã lọc). Lite mode vẫn ẩn cả `#drStatsBar` đến khi triple-click (không đổi).

**Verify (Playwright, live nhijudy.store):** worker proxy SumDeliveryReport 200 → Card1 377 Hóa đơn / 217.910.000, Card2 63 Hóa đơn / 25.658.000 (số khớp screenshot user, lệch nhẹ do data tăng trong ngày).

**Status:** ✅ Web 1.0 (delivery-report, PROD — chỉ đổi stats bar, không đụng DB/list).

### [web2-products][Kho SP] upsert/adjust-pending khớp + NCC → SP cùng tên KHÁC NCC KHÔNG gộp ✅

**User:** "test thử sao tên giống nhau nó gộp lại" → chọn **Tách theo NCC**.

**RCA (test Playwright xác nhận):** `upsert-pending` ([web2-products.js](render.com/routes/web2-products.js)) khớp SP theo `LOWER(name)` + variant — **KHÔNG tính supplier (NCC)**. Test: upsert 2 item cùng tên "TEST-MERGE-NCC" + biến thể "Đỏ" nhưng NCC khác (A1 qty3, b1 qty5) → `created:1, updated:1` → b1 GỘP vào SP A1 (`A1TESTMERGEDO` pending 8), mã `B1TESTMERGEDO` + NCC b1 bị bỏ. Nghịch với mã SP sinh theo prefix NCC (A1AODO ≠ B1AODO) + NCC per-row vừa làm.

**Fix:** thêm `supplier` (NCC) vào match key của CẢ `upsert-pending` VÀ `adjust-pending` (đối xứng — giảm pending phải trúng đúng SP theo NCC):

- Match: `name` + `variant` + `supplier`. Cùng tên+biến thể nhưng **KHÁC NCC → SP RIÊNG** (không match → INSERT mã prefix NCC riêng). **Cùng NCC → vẫn gộp** (dedup lưu nháp lại). NULL-supplier SP cũ được NCC đầu "claim" (ORDER BY ưu tiên exact-supplier) → tránh tạo trùng. Chỉ ràng buộc khi item CÓ supplier → item không NCC giữ hành vi cũ.
- Giữ nguyên pattern `FOR UPDATE LIMIT 1` (proven prod) + builder param động.

**Verify (Playwright, web2-api live `dep-d8ojiuu7r5hc73c4j8a0`):** (1) cross-NCC: cùng "TEST-MERGE-NCC2"+"Đỏ" NCC A1(3)/b1(5) → `created:2, updated:0` → 2 SP riêng (A1TESTMERGE2DO / B1TESTMERGE2DO). (2) same-NCC: re-upsert A1 qty2 → `updated:1`, pending 5 (gộp đúng). (3) adjust-pending b1 −2 → trúng B1 (5→3), A1 giữ 5 (đối xứng). Cleanup 2 SP sạch.

**Status:** ✅ verified live. web2-api / web2Db (Web 2.0). Khác NCC = SP riêng, cùng NCC vẫn gộp.

### [so-order] Sửa lô — NCC TÁCH RIÊNG mỗi dòng (lô = nguyên ngày giao, gồm nhiều NCC) ✅

**User:** "Sửa lô (nút bút chì) → sửa của nguyên ngày giao đó nên modal chỉnh sửa NCC phải tách ra → NCC A1 ở trên (ô 'Nhà cung cấp' chung) là sai."

**RCA:** Modal "Sửa lô" (`openShipmentEditAllRows`, mode `edit-shipment`) load TẤT CẢ dòng editable của 1 ngày giao — lô này có thể gồm NHIỀU NCC (A1, b1…). Nhưng modal dùng 1 ô "Nhà cung cấp" CHUNG lấy từ `rows[0].supplier`; lúc lưu mọi dòng nhận `sharedFields.supplier` → ÉP toàn bộ về 1 NCC (b1 bị đổi thành A1). NCC không tách per-row.

**Fix** ([so-order-app.js](so-order/js/so-order-app.js) + [index.html](so-order/index.html) + [css](so-order/css/so-order.css)):

- `_newModalRow`: thêm field `supplier` per-row.
- `modalRowHtml`: thêm cột "NCC" (sau STT) — input + dropdown dùng chung `attachSupplierPickerOnDemand` (gợi ý từ Ví NCC + "+ Tạo NCC").
- `renderModalRows`: mode `edit-shipment` → bật class `.so-show-ncc` (hiện cột NCC) + **ẩn ô "Nhà cung cấp" chung ở header** (gây hiểu nhầm cả lô 1 NCC). Mode khác (tạo mới / sửa 1 dòng) giữ ô chung, ẩn cột.
- `openShipmentEditAllRows`: prefill mỗi dòng `supplier: r.supplier`; `_mostCommonSupplier` = NCC mặc định cho SP mới thêm.
- Add-row handler: SP mới (edit-shipment) kế thừa NCC dòng cuối / mặc định, vẫn override được.
- Submit `edit-shipment`: dùng `r.supplier` PER-ROW (fallback ô chung ẩn nếu trống); ensure mỗi NCC vào Ví NCC (dedupe); `addedRows` carry NCC đã resolve → `syncRowsToKho` sinh mã đúng prefix. Bump `?v=20260616v` (js + css).

**Verify (Playwright, localhost):** mở Sửa lô 16/6 (3 dòng A1 nháp) → cột NCC hiện, header NCC visible, **ô NCC chung ẨN**, 3 input prefill "A1". Thêm SP → default "A1". Đổi SP mới → NCC "b1" + tên TEST-NCC-PERROW → Lưu → bảng: A1 giữ A1, dòng mới = **b1** (tách đúng). Mở lại modal → round-trip NCC đúng (A1/A1/A1/b1). Cleanup xoá test row. Create mode: cột NCC ẩn + ô chung hiện (không ảnh hưởng).

**Status:** ✅ verified browser. so-order (Web 2.0). NCC tách per-row khi sửa nguyên lô — không còn ép 1 NCC.

### [so-order][web2/products] Gợi ý biến thể từ Kho Biến Thể — KHÔNG dấu + theo token cuối khi build multi ✅

**User:** biến thể nhập vào lấy từ Kho Biến Thể; "d" → Đen/Đỏ, "den" → Đen (gõ không dấu vẫn ra). Lúc build "den / d" thì token "d" phải gợi ý Đỏ.

**RCA:** (1) so-order `showVariantSuggest` search TOÀN BỘ input ("den / ") thay vì token cuối → khi build multi không gợi ý được; (2) đã ẩn dropdown sớm theo `detect()` → đang gõ token chưa pick được; (3) products picker filter `.toLowerCase().includes()` = CÓ dấu → "den" không khớp "Đen". (`findByValue` của cache vốn đã khử dấu qua `_normalize`.)

**Fix:**

- [so-order-app.js](so-order/js/so-order-app.js) `showVariantSuggest`: search **token CUỐI sau "/"** (`findByValue` khử dấu sẵn → d→Đen/Đỏ, den→Đen, token rỗng "Đen / "→tất cả); **LUÔN hiện** dropdown (bỏ ẩn-theo-detect) để pick được token đang gõ; click suggestion → **append vào token cuối** ("Đen / " + Đỏ = "Đen / Đỏ") + update preview. Bump `?v=20260616u`.
- [web2-products-app.js](web2/products/js/web2-products-app.js) `_wireVariantPickerFor._show`: filter qua `cache._normalize` (khử dấu) → "den"→Đen, "m"→M. Bump `?v=20260616d`.

**Verify (Playwright):** so-order — "d"→[Đen,Đỏ,Xanh Dương], "den"→[Đen], "den / d"→token "d" gợi ý [Đen,Đỏ,…] (build được), "Đen / S / m"→[M,Xám] + preview [Đen/S, Đen/m]. products — "den"→[Đen], "m"→[M].

**Status:** ✅ so-order + web2/products (Web 2.0). Gợi ý 1 nguồn từ Kho Biến Thể, khử dấu, per-token.

### [web2/products][shared] Kho SP hỗ trợ nhập nhiều biến thể — Màu "Đen / Đỏ" × Size "S / M" → N SP (shared Web2VariantMulti) ✅

**User:** "hỗ trợ trong kho nữa → cấu hình thành shared dùng chung để tương lai các trang khác tham chiếu".

**Shared:** thêm `Web2VariantMulti.cartesian(colorsRaw, sizesRaw, sep)` vào [web2-variant-multi.js](web2/shared/web2-variant-multi.js) — tích Descartes 2 danh sách (mỗi ô split "/"), `sep` cấu hình (so-order " / " vs Kho SP ", "), dedupe. Module = NGUỒN DUY NHẤT, trang khác chỉ load script + gọi.

**Kho SP** [web2-products-app.js](web2/products/js/web2-products-app.js) + [index.html](web2/products/index.html) + [css](web2/products/css/web2-products.css): 2 ô Màu+Size nay nhận DANH SÁCH ("Đen / Đỏ"); picker gợi ý theo token CUỐI sau "/" + click append (build list). **Live preview** `#pmVariantMultiPreview` ("Tạo N SP biến thể: …"). `saveModal`: TẠO MỚI + cartesian>1 combo → `_bulkCreateVariants` (path riêng, KHÔNG đụng single-create optimistic): validate TỪNG token có trong Kho Biến Thể, sinh MÃ riêng mỗi combo (unique trong batch qua existingCodes tích luỹ + Web2ProductCode.suggest override color/size shortcode), create await-loop → reload + tổng kết. Edit 1 SP KHÔNG bulk.

**Verify (node + Playwright):** cartesian đúng (4 combo comma); Kho SP nhập Màu "Đen / Đỏ" × Size "L / M" → preview 4 chip → Lưu → **4 SP** mã KHOMM\*{DEN,DO}{L,M} variant "Đen, L"/… (shortcode đúng, mã unique). Cleanup sạch. Bump module `?v=20260616c` (cả products + so-order), products app `c`, css `mv`.

**Status:** ✅ verified browser. web2/products + shared (Web 2.0). so-order đã có từ trước; giờ Kho SP cũng có, qua CÙNG module shared.

### [so-order] Dropdown biến thể: hint nhập nhiều + biến thể tự do (hết "chưa có giá trị khớp" cụt) ✅

**User:** gõ "Đen d" → dropdown chỉ báo "Kho Biến Thể chưa có giá trị nào khớp" (cụt, không hướng dẫn). Muốn hỗ trợ nhập nhiều biến thể.

**Fix** [so-order-app.js](so-order/js/so-order-app.js) `showVariantSuggest`: (1) luôn prepend **hint** "Nhiều biến thể? Gõ Đen / S / M / L → tạo nhiều SP" (bấm → chèn " / " vào input, giữ focus); (2) đổi empty message thành "Dùng '<gõ>' làm biến thể TỰ DO, hoặc thêm vào Kho Biến Thể" (so-order cho phép variant tự do, không bắt buộc khớp kho). CSS `.so-variant-multi-hint` [so-order.css](so-order/css/so-order.css). Bump app `?v=20260616r`, css `s`.

**Verify (Playwright):** gõ "Đen d" → dropdown hiện hint + empty message mới. Multi-variant ("Đen / S / M") vẫn ẩn dropdown + hiện preview chip (đã làm trước).

**Status:** ✅ so-order (Web 2.0). (Tiếp: wire multi-variant vào Kho SP — user yêu cầu.)

### [so-order][shared] Nhập nhanh NHIỀU biến thể — "Đen / S / M / L / 28" → 4 SP (shared Web2VariantMulti) ✅

**User:** biến thể cho chọn nhiều + đồng bộ shared web2; variant = cặp màu+size; "Đen / S / M / L / 28" = 4 SP màu Đen 4 size; "M / Đỏ / Trắng / Đen" = 3 SP size M 3 màu; thông minh tự nhận màu/size.

**Build (qua workflow 5-agent map+design):**

- **Module shared** [web2/shared/web2-variant-multi.js](web2/shared/web2-variant-multi.js) `window.Web2VariantMulti` (load SAU web2-variants-cache): `classifyToken` (cache groupName TRƯỚC, mirror products `_isSizeGroup`; fallback `SIZE_RE`; còn lại = MÀU — vì SIZE_RE đã bắt chắc size, token lạ ⇒ tên màu), `parse`/`expand`/`detect`. Output chuẩn "Màu / Size". Cases: 1 anchor + list → expand; chỉ 1 loại → N variant; **cả 2 loại nhiều → cartesian** (cap `MAX_EXPAND=60`); 1+1 → single. Dedupe.
- **so-order**: `_explodeVariants(validRows)` — dòng MỚI (rowId==null) có variant multi → tách N addRow (copy name/giá/ảnh, share invoiceGroupId), wire ở create + edit-shipment submit. **Live preview** chip dưới ô variant (`_updateVariantMultiPreview` → "Tách N SP: …"). Multi-variant detect → ẩn dropdown pick-1 (khỏi che preview). Placeholder gợi ý. CSS chip [so-order.css](so-order/css/so-order.css).

**Verify (node unit + Playwright):** parser đúng cả 6 ví dụ (kể cả cache rỗng); UI: gõ "Đen / S / M / L / 28" → preview 4 chip + dropdown ẩn → Lưu → **4 dòng SP** Đen/S,Đen/M,Đen/L,Đen/28 (SL copy) + 4 SP kho mã HNMM\*DEN{S,M,L,28} (color+size shortcode đúng). Cleanup sạch (4 row + 4 kho product). Bump `web2-variant-multi.js?v=20260616b`, `so-order-app.js?v=20260616q`, css `p`.

**Đồng bộ:** module shared — trang web2 khác load script + gọi `Web2VariantMulti.expand()`. products (2-field strict), inline-edit (sửa 1 dòng), native-orders (auto) cố ý KHÔNG explode (xem design). Open: thứ tự output luôn màu-trước-size; cartesian là default cho 2×2.

**Status:** ✅ verified browser. so-order + shared (Web 2.0).

### [customer-hub] Double-click cột "Ví khách hàng" → xếp khách có công nợ lên đầu ✅

**User:** ở [customer-hub](customer-hub/index.html) (danh sách KH), "nhấp 2 lần ví khách hàng để đổ những đơn có công nợ lên đầu" — muốn bubble các KH có số dư ví ≠ 0 lên trên.

**Thiết kế:** sort TOÀN CỤC (không chỉ 20 dòng đã load) — route `/v2/customers/recent` **vốn đã LEFT JOIN `customer_wallets`** trả `balance/virtual_balance/real_balance`, nên thêm sort server-side là rẻ + đúng. `batch-summary` trả `total = balance + virtual_balance` (≡ biểu thức JOIN, frontend set `customer.balance = total`) → thứ tự sort khớp số hiển thị. Dùng **ABS(số dư) DESC** để gom cả dư có (+) lẫn dư nợ (−) lên đầu, số 0 chìm xuống.

**Backend** [customers.js](render.com/routes/v2/customers.js) `/recent`: thêm query param optional `sort`. `sort==='wallet'` → `ORDER BY ABS(COALESCE(w.balance,0)+COALESCE(w.virtual_balance,0)) DESC, <recent expr>, c.phone ASC` (tie-break ổn định cho phân trang). Whitelist (chỉ 2 chuỗi cố định) → không SQL injection. Mặc định byte-identical hành vi cũ. **Cần DEPLOY Render (web 1.0 api).**

**Shared** [api-service.js](shared/js/api-service.js): `getRecentCustomers(page, limit, sort='')` append `&sort=` khi truthy. Backward-compat (chỉ customer-hub gọi; render-data-manager chỉ liệt kê path).

**Frontend** [customer-search.js](customer-hub/js/modules/customer-search.js): `this.sortMode` (null | 'wallet'); `<th>` "Ví khách hàng" → dblclick toggle (id `wallet-col-header` + indicator Material Symbols `swap_vert`↔`keyboard_double_arrow_up`, `cursor-pointer`, `user-select:none` inline). Recent mode: reload page 1 (server sort toàn cục). Search mode: server không sort → `_sortByWallet` client-side (ABS desc) trong `renderResults` + re-render full ở loadMore. Tránh class Tailwind chưa build (`select-none/opacity-*`) → dùng inline style.

**Review fixes (adversarial workflow, 3 confirmed):** (1) [MED] thêm tie-break `c.id ASC` (PK) cuối ORDER BY cả 2 nhánh — `c.phone` KHÔNG unique trên `customers` + khối ABS=0 lớn → LIMIT/OFFSET có thể trùng/sót dòng khi cuộn. (2) [LOW] `wallet-updated` ở recent+wallet → `loadRecentCustomers()` (server re-sort) thay vì client re-render lệch. (3) [LOW] tạo KH (create + save-TPOS) khi wallet-sort bật → `renderResults` theo sort (KH mới dư 0 nằm cuối) thay vì `prependRow` ép lên đầu.

**Verify:** `node --check` cả 3 file OK · adversarial review workflow (backend SQL/backward-compat + frontend UX + data-consistency) → 3 fix đã áp. **End-to-end thật cần verify sau deploy Render** (data ví thật).

**Status:** ✅ code xong. Web 1.0 only (customer-hub + /v2/customers + /v2/wallets), không đụng web2.

### [orders-report][chat] Fix khung chat bắt NHẦM hội thoại Pancake khi SĐT trùng nhiều người ✅

**Bug (user báo):** bấm khách "Hoa Tuyết Trắng" (`0987616422`) ở orders-report → header đúng tên nhưng **đoạn chat + avatar lại là của "Thùy Trang"** (người khác). Gốc: SĐT đó nằm trong `recent_phone_numbers` của nhiều hội thoại khác nhau (khách dán cùng số liên hệ vào nhiều FB chat; Pancake search là full-text). Chuỗi resolve trong [tab1-chat-core.js](orders-report/js/tab1/tab1-chat-core.js) `_doFindAndLoadConversation` chọn `matched[0]` theo recency (Thùy Trang hoạt động gần hơn) — **không dùng TÊN/PSID đơn để phân biệt** — và chạy TRƯỚC tầng DB+name-search (tầng duy nhất xử lý homonym đúng).

**Fix (Khớp TÊN → PSID → picker, KHÔNG đổi control-flow):**

- Thêm helper `_pickBestConv(cands, {type,name,psid})` + `_strip`/`_bareName`/`_nameMatch` đầu hàm. >1 `from_psid` distinct (SĐT thật sự nhiều người) mới đổi hành vi; 1 người → trả `find(type)||[0]` **y hệt code cũ** (zero regression). Ưu tiên TÊN (chỉ khi khớp đúng 1 người) → PSID đơn → mơ hồ mà CÓ tên → `ambiguous` (để conv=null rơi xuống tầng DB+name + picker). Không tên lẫn psid → fallback `matched[0]` (giữ cũ).
- Áp `_pickBestConv` tại 3 điểm chọn phone-verified: PRIMARY phone-search, preferred-page, cross-page `phoneVerified`. PRIORITY 1 (direct fb-id từ DB `page_fb_ids`) thêm **verify TÊN** trước khi nhận (mapping DB có thể cũ/sai).
- Survivor stash `window._chatPhoneCandFallback` (reset đầu hàm, clear sau render): giữ candidate phone-verified cho picker phòng khi tầng DB+name null `_chatPickerCandidates` ở nhánh "không tìm thấy theo tên".

**Impact analysis:** đọc cả 5 caller `_findAndLoadConversation` (open/type-toggle/switch-page/repick/cross-page) + mọi consumer `currentChatPSID`/`currentConversationData`. type-toggle/switch-page TỐT HƠN (khóa đúng người qua psid/name thay vì recency); repick path riêng không đổi; gửi tin/quick-reply/realtime đọc state SAU resolve → đúng hơn. Picker handlers + khối DB+name [:1491] giữ nguyên.

**Verify:** node --check OK · unit test `_pickBestConv` 8/8 · browser (Playwright, localhost) module load OK (mọi global chat định nghĩa) · E2E mock đúng kịch bản bug (Thùy Trang recent hơn) → resolve **Hoa Tuyết Trắng** (psid A) ✅ · regression: SĐT 1 người → resolve sạch không picker ✅ · homonym psid không khớp → defer picker (không auto-pick) ✅. **End-to-end thật cần verify trên prod** (data Pancake thật của khách).

**Status:** ✅ code + test xong. Chỉ sửa orders-report (Web 1.0), không đụng web2/backend.

### [so-order] Nhóm NCC "Đã nhận" dồn xuống cuối lô (pending lên trên) ✅

**User:** "Nhận hàng rồi sẽ đưa xuống dưới" — nhóm đã nhận đủ nằm xen giữa các nhóm còn chờ → muốn nhóm đã nhận xuống cuối.

**Fix** [so-order-app.js](so-order/js/so-order-app.js): thêm `_orderReceivedGroupsLast(rows)` — partition theo NHÓM NCC (consecutive supplier+invoiceGroupId, giữ nguyên để rowspan ô NCC/Ảnh HĐ không vỡ), nhóm "đã nhận đủ" (mọi SP thật `status==='received'`) dồn cuối, nhóm còn pending giữ trên (stable). **Render-only, KHÔNG mutate storage** → áp dụng ngay cho data cũ + tự sắp lại sau mỗi lần nhận hàng (renderAll). `shipmentHtml` dùng `displayRows` cho cả `_computeRowSpans` + `rowHtml`; `rowHtml` nhận thêm param `rowsArr` để slice nút "Nhận hàng" theo đúng thứ tự hiển thị (không lệch idx).

**Verify (Playwright, HÀ NỘI):** thứ tự mới = A1-TEST(draft) · C2-SET/QU(draft) [TRÊN] → A1-ÁO · b1 · A1-SE (received) [DƯỚI]. NCC rowspan + zebra + nút nhận giữ đúng. Bump `so-order-app.js?v=20260616n`.

**Status:** ✅ so-order (Web 2.0). render-only, reversible.

### [delivery-report] phuoc = quyền bobo: bỏ chế độ 'full' đặc biệt → phuoc cũng 'lite' (ẩn dữ liệu, triple-click mới hiện) ✅

**User:** account `phuoc` thấy hết dữ liệu ẩn ngay (bảng + số liệu + nút hủy) — "dữ liệu ẩn phải click 3 lần vào các chữ, đây là trang đặc biệt". Chốt: **"acc phuoc giống quyền acc bobo đó"**.

**RCA:** commit `0b33d0b46` (22/05) build 2 chế độ: `userType==='phuoc-authenticated'` → `'full'` (Interface 1, tự thấy hết) · mọi user khác kể cả admin/bobo → `'lite'` (Interface 2, ẩn bảng/số liệu, triple-click tiêu đề mới hiện). Vì userType = `${username}-authenticated` nên CHỈ account username `phuoc` rơi vào nhánh full → thấy hết. bobo (username `bobo`) ở `'lite'` → phuoc khác bobo đúng chỗ này.

**Fix** [delivery-report.js](delivery-report/js/delivery-report.js): `detectInterfaceMode()` bỏ ngoại lệ `phuoc-authenticated`, **luôn trả `'lite'`** → phuoc giống bobo (ẩn mặc định, triple-click bung; trong Tra soát bắt đầu 2 tab, triple-click bung đủ 6 tab/5 cột). Giữ code nhánh `'full'` làm dead branch (không xoá — tránh regression trang PROD Web 1.0). Bump `delivery-report.js?v=20260616b`.

**Status:** ✅ delivery-report (Web 1.0). phuoc ⇔ bobo: cùng 'lite' + cùng quyền Tra soát (whitelist username đã thêm `phuoc` ở fix trước).

### [so-order][web2-products] Part B — Kho SP hover hiện giá GỐC ngoại tệ (origin_currency/origin_rate) ✅

**User spec (tiếp Part A):** Kho SP lưu VND; hover giá ở kho hiện giá gốc (vd CNY) đã mua. User chọn: build Part B, origin = lần mua gần nhất, để data cũ nguyên.

**Thiết kế:** Lưu `origin_currency` + `origin_rate` (KHÔNG lưu origin amount rời → tránh lệch khi sửa giá VND trực tiếp). Giá gốc suy ngược = `VND / origin_rate`, luôn nhất quán với giá canonical. Giá kho khoá tại lần INSERT (upsert-pending UPDATE không đổi giá) → set origin 1 lần lúc INSERT.

**Backend** [web2-products.js](render.com/routes/web2-products.js): (1) migration `ALTER ADD COLUMN IF NOT EXISTS origin_currency VARCHAR(8), origin_rate NUMERIC(14,4)`; (2) `mapRow` expose `originCurrency/originRate`; (3) upsert-pending INSERT lưu origin (NULL khi VND). **Cần DEPLOY web2-api.**

**Frontend so-order** [so-order-app.js](so-order/js/so-order-app.js): write paths gửi `originCurrency: tab.currency, originRate: tab.rate` — syncRowsToKho (lưu nháp) + \_receiveItems → 2 upsertPayload (nhận hàng + in tem).

**Frontend Kho SP** [web2-products-app.js](web2/products/js/web2-products-app.js) (bảng: title hover "Giá gốc: X CNY @ rate" + dotted-underline cue) + [web2-product-detail.js](web2/products/js/web2-product-detail.js) (panel: sub-line "≈ X CNY" dưới giá VND). Cache passthrough (không whitelist field). Bump `web2-products-app.js?v=20260616b`, `web2-product-detail.js?v=20260616b`.

**Backward-compat:** SP cũ origin_currency=NULL → không hover (hiện VND như cũ). ADD COLUMN IF NOT EXISTS idempotent. Web 1.0 không chạm.

**Deploy + Verify (2026-06-16):** deploy web2-api `dep-d8ohitreo5us73e9lbcg` LIVE (commit chứa migration). E2E Playwright tab CNY(3500): nhập SP cost 100/sell 200 CNY → Lưu Nháp → payload gửi `originCurrency:CNY, originRate:3500` + VND 350000/700000 → kho lưu `original_price=350000, price=700000, origin_currency=CNY, origin_rate=3500` (derive ngược = 100/200 CNY) → trang Kho SP hover title "Giá gốc: 100,00 CNY (nhập @ 3.500₫/CNY)" + "200,00 CNY". Cleanup: xoá SP test HCMM3 (force) + row so-order TEST-ORIGIN-CNY (edit-shipment modal, server-synced).

**Status:** ✅ Part B deployed + verified end-to-end. so-order + web2-products (Web 2.0).

### [docs] Sync overview + WEB2-PAGES-ANALYSIS cho money-model mới (rule 9) ✅

**Bối cảnh:** CLAUDE.md quy tắc 9 (BẮT BUỘC) — đổi luồng data quan trọng Web 2.0 → cập nhật CẢ overview sống + file phân tích.

**Files:**

- [docs/web2/WEB2-PAGES-ANALYSIS.md](docs/web2/WEB2-PAGES-ANALYSIS.md): thêm banner 💰 đầu mục 0 — nợ NCC khi NHẬN HÀNG, status không sửa tay, discount/ship per-đơn, 2 trang ví/công nợ khớp số.
- [web2/overview/index.html](web2/overview/index.html): sửa seed-note (Ví NCC realtime + chỉ tính khi nhận) · so-order article (Storage Firestore→Postgres C8, cột Trạng thái chỉ-đọc, meta "Model tiền") · supplier-debt article (nguồn `web2_so_order` Postgres + `web2_supplier_ledger`, meta "Phát sinh" received-based) · supplier-wallet article (bỏ nút Đồng bộ→Realtime SSE, Storage server ledger Postgres, meta "Model tiền").

**Status:** ✅ docs-only, không đụng code. Verify: article tags cân bằng 27/27.

### [delivery-report] FIX account `phuoc` không thấy nút "Tra soát" — gate theo USERNAME (ổn định) thay vì displayName ✅

**User:** account `phuoc` vào delivery-report không thấy nút "Tra soát". Làm rõ: **`phuoc` chính là "Phước đẹp trai" nhưng user đã đổi tên hiển thị**.

**RCA:** `canTraSoat()` ([delivery-report.js](delivery-report/js/delivery-report.js):82) cho phép admin / username∈`{bobo}` / displayName∈`{'Phước đẹp trai','bobo'}`. Account phuoc: không admin, username `phuoc` (không có trong set), displayName **đã bị đổi** → không còn khớp `'Phước đẹp trai'` → `canTraSoat()` false → nút `drBtnTraSoat` bị ẩn (init :221-224). Gate theo displayName mong manh vì user đổi tên được; username `phuoc` thì ổn định (userType = `phuoc-authenticated`).

**Fix:** thêm `'phuoc'` vào `TRA_SOAT_ALLOWED_USERNAMES` (set `{'bobo','phuoc'}`). Bump `delivery-report.js?v=20260616a`.

**Status:** ✅ delivery-report (Web 1.0). username là khoá ổn định, không phụ thuộc tên hiển thị.

### [so-order] FIX quy đổi giá khi LẤY SP từ Kho SP (VND) vào đơn theo tiền tệ tab (÷rate) — Part A logic 1-nguồn ✅

**User spec:** Kho SP = 1 NGUỒN, lưu VND. Tab CNY nhập đơn = CNY → vào kho ×rate→VND (ĐÃ ĐÚNG). Khi LẤY SP từ kho (VND) vào đơn ở tab nào → quy đổi ra tiền tab đó (÷rate). (+ hover kho hiện giá CNY gốc — Part B, cần schema, chờ user.)

**RCA (audit workflow 5-agent, verified):** WRITE path đã đúng (`syncRowsToKho` :3752 + receive :1630 đều ×tab.rate→VND). READ path SAI: `applySuggestionToRow` :3022-3023 gán THẲNG giá VND của kho làm giá tab-currency (comment cũ "để user tự convert thủ công"). Tab CNY rate 3500 → giá dòng gấp ~3500×; **nguy hiểm: Lưu Nháp lại ×rate → corrupt giá canonical kho 3500×**.

**Fix** [so-order-app.js](so-order/js/so-order-app.js): thêm helper `fromVnd(vnd, tab)` (VND÷rate; VND-tab giữ nguyên; JPY/KRW 0 lẻ, ngoại tệ khác 2 lẻ). `applySuggestionToRow` dùng `fromVnd(p.originalPrice/p.price, activeTab)` thay gán thẳng. Sửa comment.

**Verify (Playwright):** pick HCDAM2XLL (kho VND 773500/1673000) → tab CNY(3500): Giá Nhập **221**, Giá Bán **478** (đúng ÷3500, khớp ảnh user) · tab HÀ NỘI(VND): **773500/1673000** giữ nguyên. Bump `so-order-app.js?v=20260616k`.

**Còn lại (Part B — chờ user quyết):** hover giá kho hiện CNY gốc cần thêm cột `origin_currency/origin_price/origin_rate` vào `web2_products` (migration + deploy Render) + write gửi origin + UI hover Kho SP. Có fork thiết kế (SP mua từ nhiều tab khác currency → giữ origin nào) + data kho cũ có thể đã corrupt (cân nhắc wipe — beta).

**Status:** ✅ Part A verified browser. so-order (Web 2.0).

### [so-order][supplier-debt][supplier-wallet] Money-model: status auto + nợ NCC khi NHẬN HÀNG + discount/ship per-đơn ✅

User (4 yêu cầu): (1) trạng thái KHÔNG cho đổi tay → "Đã Đặt"/ordered hết tác dụng → **nợ NCC phát sinh khi NHẬN HÀNG**; (2) giảm giá/phí ship là của **riêng từng đơn**, footer = tổng ngày giao; (3) supplier-wallet realtime + **discount/ship tính vào nợ** (tất cả nguồn tiền); (4) bỏ luôn ô "Trạng thái" trong modal. Plan qua workflow 4-agent (map+adversarial). User chốt: **nhận 1 phần bill theo SỐ ĐÃ NHẬN thực**.

**Stage 1 — status không đổi tay** [so-order-app.js](so-order/js/so-order-app.js)+[index.html](so-order/index.html)+[css](so-order/css/so-order.css): bỏ `'status'` khỏi `INLINE_EDIT_FIELDS` (hết double-click sửa) + status LUÔN render pill (kể cả bulk-edit) + **bỏ ô `<select name=status>`** trong modal + bỏ `form.elements.status` writes + `sharedFields` bỏ status (tạo→addRow default 'draft', sửa→giữ nguyên). `STATUS_LABELS` bỏ `ordered`, thêm `partial_received:'Nhận 1 phần'`. Import map `ordered/dadat→draft`. Normalize legacy `ordered→draft` ([so-order-storage.js](so-order/js/so-order-storage.js)). CSS pill partial (vàng).

**Stage 2 — persist received-qty**: `confirmReceiveFromModal` ghi `qtyReceived` (luỹ kế) lên row ngoài `status` → nợ bill đúng phần đã nhận cho `partial_received`.

**Stage 3 — discount/ship PER-ĐƠN**: model `sh.orderAdjustments = {[invoiceGroupId]:{discount,shipping}}` (currency tab) thay `sh.discount`/`sh.shipping`. Storage: `setOrderAdjustment`/`getOrderAdjustment`/`getShipmentAdjustTotals` + normalize migrate legacy→đơn đầu + init map. App: create/edit gọi `setOrderAdjustment(invoiceGroupId)`; `_applyShipMetaUi` populate theo `editingInvoiceGroupId`; **header pill = Σ đơn** (`getShipmentAdjustTotals`); **footer = Σ mọi lô × rate→VND, readonly** (bỏ `tab.footer` thủ công + `wireFooterInputs` readonly). 1 đơn = 1 NCC (modal 1 ô NCC).

**Stage 4 — nợ = receive-based + gồm discount/ship** [supplier-debt-app.js](web2/supplier-debt/js/supplier-debt-app.js)+[supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js): filter chỉ `received`/`partial_received` (bỏ `ordered`/`draft`/`cancelled`); qty_bill: received→qty đặt, partial→`min(qtyReceived,qty)`; **net/đơn = Σ(cost×qty×rate) − giảm giá + phí ship** (áp 1 lần/đơn, gán thẳng NCC, bucket theo ngày lô ở supplier-debt). Cả 2 page đếm cùng tập rows → totalPurchased (Ví) khớp debit (Báo cáo).

Verify browser: modal không còn ô trạng thái + footer readonly ✓; tạo đơn discount 20k/ship 10k (tab CNY) → footer 70M/35M (×3500) + header pill "Giảm 20.000 CNY · Ship 10.000 CNY" ✓; supplier-wallet receive-based → A1 Tổng mua 1.510.500 / b1 4.000.000 (có đơn đã nhận), NCC chưa nhận = 0, đơn draft KHÔNG tính ✓. node --check 4/4. Bump so-order `?v=20260616j`, supplier-debt/wallet `?v=20260616b`.

### [so-order] Nền bảng xen kẽ theo NHÓM NCC/đơn (thay zebra :nth-child lệch nhóm) ✅

**User:** background bảng chia phải đúng màu — nhóm này trắng, nhóm kế nhạt, xen kẽ → tăng tương phản đọc dữ liệu từng khối. (Hiện tại random: 1 nhóm trắng, nhóm kế nhạt, nhóm kế nữa trắng nhưng không khớp ranh giới nhóm.)

**RCA:** Zebra cũ `.so-data-row:nth-child(even)` tô theo TỪNG ROW. Nhưng `#soTableBody` xen cả row `.so-shipment-head` + `.so-shipment-colhead` giữa các data row → parity của data row lệch so với ranh giới nhóm NCC → trông random (nhóm 2 dòng thì 1 trắng 1 nhạt).

**Fix:**

1. [so-order-app.js](so-order/js/so-order-app.js) `_computeRowSpans`: thêm `nccParity` (0/1) luân phiên theo từng NHÓM NCC (cùng supplier + invoiceGroup — đúng đơn vị rowspan ô NCC). `rowHtml`: nhóm lẻ → class `.so-grp-alt` trên `<tr>`.
2. [so-order.css](so-order/css/so-order.css): bỏ rule `:nth-child(even)`; thêm `.so-data-row.so-grp-alt > td { background:#e9eef4 }` (nhóm chẵn giữ trắng #fff). Ô gộp NCC/Ảnh HĐ trong nhóm lẻ tô gradient cùng tông. Hover nổi hơn nền nhóm.

**Verify (Playwright, view mode):** A1(1-2)=trắng · A1/TEST-INV(3)=nhạt · b1(4-5)=trắng · C2(6-7)=nhạt · SE(8)=trắng — đúng spec user, mỗi khối tách rõ. (Edit mode: ô editable giữ highlight kem #fefce8 — visual riêng của edit, không đụng.)

Bump `so-order.css` + `so-order-app.js` `?v=20260616h`.

**Status:** ✅ verified browser. so-order (Web 2.0 module).

### [orders-report][render] Strip "Khách chưa trả lời": bỏ avatar + ô check "đã kiểm tra/đã bán" (đồng bộ mọi máy theo chiến dịch) ✅

**User:** "(1) bỏ avatar ở thanh chưa đọc; (2) thêm ô check (cả ở thanh lẫn dòng Tag XL trên) đánh dấu KH đã bán/đã kiểm tra → không vào thanh nữa khi có tin mới (theo chiến dịch hiện tại); đang trong thanh thì tick là ẩn luôn." → cờ riêng (không đụng tag), đồng bộ server mọi máy.

- **Server** [render.com/routes/realtime.js](render.com/routes/realtime.js) + bảng `checked_customers` (boot migration [server.js](render.com/server.js), UNIQUE(campaign_key,psid)): `GET/POST/DELETE /api/realtime/checked-customers` (parameterized, có cap độ dài). Mỗi mutation broadcast SSE topic `checked_customers` qua `req.app.locals.realtimeSseNotify` (Web 1.0 hub).
- **Client store** [tab1-checked-customers.js](orders-report/js/tab1/tab1-checked-customers.js) `window.CheckedCustomers`: scope theo `campaignManager.activeCampaignId`; `isChecked/check/uncheck/toggle` optimistic + rollback (guard đổi chiến dịch giữa chừng); SSE subscribe `checked_customers` (apply trực tiếp add/remove); poll 2s đổi chiến dịch → reload; phát event `n2s:checkedCustomersChanged`.
- **Strip** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js): bỏ avatar; `compute()` skip KH `CheckedCustomers.isChecked` (ẩn cả khi có tin mới); mỗi ô có `<button.ucs-cell__check>` đánh dấu. **Đổi inline onclick → data-\* + 1 delegated listener trên host** (hết rủi ro breakout chuỗi; nút check keyboard-accessible). Re-render khi `n2s:checkedCustomersChanged`.
- **Inline editor** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js): ô check trước STT (toggle), gắn onchange bằng addEventListener (không interpolation); đồng bộ trạng thái qua event. CSS check ở cả 2 file.
- Bump: checked-customers `?v=20260616a`, strip js/css `?v=20260616c`, editor js `?v=20260616c` css `?v=20260616b`.

**Review (code-reviewer agent):** 0 CRITICAL; đã fix HIGH: (a) XSS-prone inline-JS interpolation → data-attr+delegated; (b) rollback sai chiến dịch → guard `_getCampaign()===campaign`; (c) a11y `role=checkbox` thiếu keyboard → dùng `<button>`; (d) cap độ dài campaign/psid server.

**Verify (Playwright localhost):** strip 0 avatar, 3 nút check, data-attr đủ; click nút check→`check()` (không mở chat), click ô→`openFromStrip` (args đúng); filter ẩn KH checked (4→3) + re-render; editor có ô check + onchange→`toggle` đúng psid. `node --check` 4 file PASS.

**Deploy:** server qua Render (`n2store-tpos-pancake`); client qua GH Pages. ⏳ verify endpoint prod (throwaway keys) sau deploy.

### [web2/supplier-wallet] FIX số liệu NCC nhấp nháy rồi về 0₫ sau khi load (post-Sync render đè 0) + debug logs ✅

**User:** "mới vào trang nó ra dữ liệu ở đâu đó xong đề dữ liệu khác lên" → nghi sort. Yêu cầu thêm console.log + browser test debug.

**Debug:** Thêm instrumentation `_dbg()` (gate `window.SW_DEBUG`, mirror `window.__swDebugLog` để browser-test đọc lại sau reload) vào init/loadAndRender/renderList/Sync. Browser test (Playwright session) đọc trace:

- render #1 (`loadAndRender:init`): 8 NCC số THẬT — HƯƠNG CHÂU 24.619.000, HÀ NỘI 12.201.000, A1 bal 467.600… (sort balance-desc đúng).
- render #2 (`init:post-sync-reload`): **TẤT CẢ bal=0, tot=0** ← thủ phạm, không phải sort.

**RCA:** `init()` chạy `loadAndRender()` (aggregate Sổ Order → `totalPurchased` thật → render #1 đúng), rồi `Sync.init()` kéo **ledger server** (chỉ lưu paid/returned/balance, KHÔNG có `totalPurchased` vì nó DERIVE từ Sổ Order) ghi đè storage → `walletState = await load()` đọc lại ledger có totalPurchased=0 → `renderList()` **trần** (không re-aggregate) → đè 0₫ lên số thật. (Path SSE ledger-reload đã đúng vì gọi `loadAndRender`; chỉ path init sai.)

**Fix** [supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js): sau post-Sync reload (và trong remote callback) → re-merge `suppliers` aggregation (đã có trong RAM) vào walletState mới trước khi render (`mergeAggregation` + save nếu mutated). Verified: render #2 giờ GIỮ số thật, header "Công nợ: 50.895.100đ", không còn về 0.

**Lưu ý:** debug logs `[SW-DEBUG]` còn để (gate `window.SW_DEBUG`, mặc định on) cho user verify — sẽ gỡ sau khi xác nhận (grep `SW-DEBUG`). Bump `supplier-wallet-app.js?v=20260616dbg3`.

**Status:** ✅ fix + verified browser. Web 2.0 (supplier-wallet).

### [so-order] FIX checkbox "Hiện thông tin lô" (Cài đặt tab) không hiện trạng thái đã chọn ✅

**User:** "đâu có checkbox hình 1 mà hình 2 nó hiện?" — modal Cài đặt tab hiện 6 checkbox đều TRỐNG, nhưng modal Tạo Đơn vẫn hiện ETA + Số Kiện → tưởng lệch state.

**RCA:** State ĐÚNG (`shipMetaFields.eta=true, caseCount=true`, verified `cb.checked=true`). Bug thuần CSS: `<fieldset class="so-field so-shipmeta-fieldset">` dính rule chung `.so-field input { appearance: none; border-radius:8px; padding:8px 10px }` → **nuốt checkmark native** của checkbox; mà `accent-color` vô hiệu khi `appearance:none` và KHÔNG có style `:checked` → checked nhìn y hệt unchecked (ô rounded trống). Vì vậy ETA/Số Kiện thực ra ĐANG checked nhưng không thấy.

**Fix** [so-order.css](so-order/css/so-order.css): vẽ custom checkbox cho `.so-shipmeta-fieldset input[type=checkbox]` (cả master "Chọn tất cả" + 6 con): `appearance:none` 18×18 bo 6px, `:checked` → nền `#0068ff` + checkmark SVG trắng, `:indeterminate` → nền xanh + dash trắng (master khi chọn 1 phần), `:hover`/`:focus-visible` ring. Bump `so-order.css?v=20260616f`.

**Verify (Playwright):** mở Cài đặt tab HÀ NỘI → ETA + Số Kiện nền `rgb(0,104,255)` + checkmark, 4 ô còn lại trống, master `indeterminate=true` (2/6) — khớp đúng modal Tạo Đơn.

**Status:** ✅ CSS-only. so-order (Web 2.0 module). `.so-field-check` (legacy, dead — không dùng trong HTML) để nguyên.

### [web2/supplier-wallet] Bỏ nút "Đồng bộ" → realtime tự động (kho NCC nguồn cho mọi trang) ✅

User: "trang này là kho NCC để tất cả trang khác tham chiếu nên sẽ có dữ liệu realtime" → bỏ nút "Đồng bộ" thủ công.

- Bỏ nút `#swRefreshBtn` ("Đồng bộ") + handler trong `wireUi` (sẽ throw vì element mất). Thay bằng pill "Realtime" (`.sw-live-pill`, icon radio pulse, respect reduced-motion).
- Trang ĐÃ có SSE realtime sẵn (`_sseConnect`): `web2:wallet:*` (SePay deposit), `web2:products` (stock/pending), `web2:supplier-wallet` (ledger pay/return/tạo NCC từ máy khác). **Thêm `web2:so-order`** — đổi status đơn (draft→"Đã Đặt"/nhận/xóa) CHỈ fire `web2:so-order` (KHÔNG fire `web2:products`) → trước đây "Tổng mua"/danh sách NCC không tươi nếu chỉ đổi status → giờ aggregation reload realtime.
- [supplier-wallet/index.html](web2/supplier-wallet/index.html) + [supplier-wallet-app.js](web2/supplier-wallet/js/supplier-wallet-app.js) + [css](web2/supplier-wallet/css/supplier-wallet.css). Bump `?v=20260616a`. Verified browser: nút mất, pill "Realtime" hiện, 8 NCC load, Web2SSE loaded, 0 lỗi.

### [so-order] Modal Tạo Đơn Hàng — đồng bộ bố cục form + làm đẹp table (CSS-only) ✅

**User:** "giao diện hình 2 nó không đồng bộ, đồng đều 1 bố cục… nghiên cứu github các css phần table xem có làm đẹp hơn nhưng vẫn đủ thông tin."

**RCA bố cục lệch:** Hàng field trên cùng (`.so-form-row-top`) là flex-wrap với (a) ô "Ảnh hóa đơn" = dropzone `.so-img-cell-v2` xếp DỌC cao ~64px → vống hẳn lên so với input 40px; (b) label wrap số dòng khác nhau (vd "Ảnh hóa đơn (cả đơn…)", "ETA giao hàng (dự kiến)") → input đứng so le; (c) flex-basis ragged (110/140/210/260px) → cột không đều.

**Fix** [so-order.css](so-order/css/so-order.css) (không đổi JS/HTML behavior):

1. **Đồng đều chiều cao**: `.so-form-label { min-height:34px }` (reserve ~2 dòng) + `align-items:flex-end` → mọi control 40px bottom-align thành 1 hàng phẳng (verified: 5 ô row-top cùng `bottom`).
2. **Ảnh hóa đơn compact 40px ngang**: override `.so-cell-invoice-img .so-img-cell-v2` → `flex-direction:row; height:40px; box-sizing:border-box`. State đã-có-ảnh: thumb nhỏ (≤28×44) + nút xóa inline, ẩn label/URL. Bằng đúng chiều cao input, hết phá hàng (verified empty + has-image đều 40px, bottom-align input Ngày tạo).
3. **Cột đều**: cell `flex:1 1 160px`, narrow `1 1 120px`, NCC `2 1 240px` → grow lấp kín hàng.
4. **Table đẹp hơn** (theo convention GitHub Primer / Tailwind UI data-table, giữ NGUYÊN đủ cột/thông tin): `font-variant-numeric:tabular-nums` (số thẳng cột), header slate-50 `#f8fafc` + label muted `#64748b` letter-spacing nhẹ, row hover `#f8fafc`.

Bump `so-order.css?v=20260616e`. Verified Playwright: modal mở, đo bounding rect — tất cả control row-top cùng baseline.

**Status:** ✅ CSS-only. so-order (Web 2.0 module).

### [render][orders-report] FIX GỐC sai múi giờ pending_customers (server emit ISO-UTC) — strip báo trễ 7h ✅

**User:** sau fix client vẫn "nguyên như cũ" — khách mới nhắn báo trễ 7h.

**RCA (đo thực tế):** cột `pending_customers.last_message_time` kiểu **`TIMESTAMP` (no tz)**, INSERT bằng `NOW()` → lưu **giờ UTC dạng naive** (vd `08:49`). Node pg driver trên Render (TZ=Asia/Saigon +7) đọc naive đó NHẦM thành +7 → API serialize `"2026-06-16 08:49:02+07:00"` = **01:49 UTC** = lệch −7h so với thực (now 08:49 UTC). ⇒ Client parse "đúng" chuỗi sai → strip 7h. **Fix client không cứu được vì data sai từ nguồn.** (Verify: raw `08:49:02+07:00` vs now `08:49:58Z` — wall-clock trùng giờ UTC nhưng bị gắn +07:00.)

**Fix server** [render.com/routes/realtime.js](render.com/routes/realtime.js) (hàm `upsertPendingCustomer` + GET `/pending-customers`, dùng chung cả route lẫn server-WS `server.js`):

- GET emit ISO-UTC tường minh: `to_char(last_message_time, 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') AS last_message_time` → client nhận `…Z` parse đúng instant (cả client cũ lẫn mới).
- Write tất định: `NOW()` → `(NOW() AT TIME ZONE 'UTC')` (4 chỗ) → luôn lưu UTC wall-clock bất kể session TZ.

**Deploy:** Render auto-deploy `n2store-tpos-pancake` trên push (KHÁC GH Pages). Sau deploy verify: `curl …/pending-customers` → `last_message_time` dạng `...Z` & khớp giờ thực. Client `_n2sParseMsgTime` (commit trước) vẫn cần cho path realtime WS (Pancake naive no-Z).

**Status:** ✅ code. ⏳ chờ Render deploy để xác nhận trên web.

### [supplier-wallet] FIX nút Tạo NCC / Đồng bộ / Trả hàng / Ghi thanh toán hiện như nút browser mặc định (thiếu class `btn` base) ✅

**User:** "nút hình 2, hình 3 chưa có css" — "Ghi thanh toán" + "Đồng bộ" render như nút macOS mặc định (gradient xám, viền bevel), không theo theme Web 2.0.

**RCA:** Cấu trúc nút trong [supplier-wallet/index.html](web2/supplier-wallet/index.html) dùng `class="btn-primary"` / `class="btn-secondary"` **trần** (10 nút). Trong `web2-theme.css`, structural styling (display:inline-flex, padding, border-width, border-radius) nằm ở base `.btn`; còn `.btn-primary`/`.btn-secondary` CHỈ override màu (background/color/border-color). Thiếu base `.btn` → nút mất padding/border/radius → fallback về native button chrome.

**Fix:** Thêm base `btn` vào cả 10 nút → `class="btn btn-primary"` / `class="btn btn-secondary"` (đúng convention các trang web2 khác: purchase-refund, reconcile, supplier-debt…). Không đổi CSS.

**Verify (Playwright localhost:8080):** computed styles — header `Tạo NCC` (btn-primary) = `linear-gradient(#2a96ff→#0068ff)` + white text, radius 9px, padding 5px 10px, inline-flex; `Đồng bộ` (btn-secondary) = bg #fff + border `#e6e9ef` + radius 9px. Modal `Trả hàng`/`Ghi thanh toán` cũng đúng theme. Screenshot xác nhận hết native gray gradient.

**Status:** ✅ HTML-only, no CSS change. Web 2.0 (supplier-wallet).

### [so-order] 3 fix modal Tạo Đơn Hàng: dropdown bị che + tách checkbox thông tin lô + ảnh hóa đơn cấp đơn ✅

1. **Dropdown gợi ý SP + picker biến thể bị che (sửa triệt để)** [so-order-app.js](so-order/js/so-order-app.js) + [so-order.css](so-order/css/so-order.css): redo hẳn — dropdown render TRỰC TIẾP vào `<body>` (portal) + `position:fixed` neo theo input rect (`_getFloatPanel`/`_anchorFloatPanel`/`_bindModalScrollCloseDropdowns` reflow). Gốc bug: `.so-modal-body-v2` có ĐỒNG THỜI `overflow:auto` (clip absolute) VÀ `contain: layout style paint` (phá fixed-coords) → dropdown đặt TRONG modal body luôn dính 1 trong 2. Con của body → không ancestor nào contain/clip. max-height cap theo chỗ trống thực → list tự scroll. Bỏ per-row `.so-suggest-dropdown`/`.so-variant-dropdown`. Class `.so-float-dropdown` z-index 100000. Verified browser: inBody=true, fixed, bottom trong viewport, không cắt.
2. **Tách checkbox "Hiện thông tin lô" → 6 checkbox riêng** (ETA/Đợt/Số Kiện/KG/Tiền HĐ/Tiền tệ) + master "Chọn tất cả". Data model `tab.shipMetaFields {key:bool}` (storage normalize backfill từ `showShipMeta` gộp cho tab cũ; addTab/updateTab persist). `_applyShipMetaUi` ẩn/hiện TỪNG `.so-ship-adv[data-ship-field]`. `SHIP_META_FIELDS` const + `_shipMetaFlags`. Verified: lưu ETA+Số Kiện → reopen persist đúng → modal chỉ hiện 2 field đó.
3. **Ảnh hóa đơn = của CẢ ĐƠN, không phải từng SP** [so-order-app.js](so-order/js/so-order-app.js): bỏ cột "Hình ảnh hóa đơn" per-row trong modal → 1 ô ở header (`#soOrderInvoiceImageCell`, cạnh Ngày tạo). State `modalInvoiceImage` đổ xuống MỌI row khi set/lưu (`_setOrderInvoiceImage`); row mới kế thừa qua `_newModalRow`. Submit path không đổi (rows vẫn mang `invoiceImage` → merged cell rowspan ở bảng chính). Verified E2E: set URL → submit → ảnh lưu order-wide + render ở cột Ảnh Hóa Đơn bảng chính.

Bump `?v=20260616d`. Test order TEST-INV-ORDER đã xoá sạch khỏi server sau verify.

### [orders-report] FIX múi giờ strip "Khách chưa trả lời" — khách mới nhắn báo trễ 7h ✅

**User:** "thời gian đang lấy sai múi giờ — khách mới nhắn vài chục phút mà báo trễ 7h."

**RCA:** Thời gian từ **realtime WS (Pancake)** = UTC **KHÔNG có hậu tố `Z`** (vd `2026-06-16T08:03:41`). `new Date(s)` trên máy GMT+7 hiểu nhầm là giờ LOCAL → epoch sớm hơn thực 7h → `waitedMs = now - ts` dư đúng ~7h (CLAUDE.md §10 bẫy a). Path server-fetch `/pending-customers` lại CÓ offset `+07:00` nên parse đúng → chỉ khách mới (đến qua WS) bị lệch.

**Fix** [new-messages-notifier.js](orders-report/js/chat/new-messages-notifier.js): thêm `_parseMsgTime(v)` — space→`T`, cắt micro/nano về ms, **thêm `Z` nếu chuỗi chưa có timezone** (Z hoặc ±HH:MM); chuỗi đã có offset giữ nguyên. Dùng trong `onNewConversationEvent` (event.timestamp/updated_at) + `setPendingCustomers`; expose `window._n2sParseMsgTime`. [tab1-init.js](orders-report/js/tab1/tab1-init.js) `_fetchOfflinePendingCustomers` dùng helper cho `last_message_time`. Bump notifier+init `?v=20260616c`.

**Verify:** node test 4 format (WS no-Z, no-Z+micro, +07:00, đã-Z) → đều ra wait đúng 30'. Browser (Playwright): bắn `onNewConversationEvent` timestamp no-Z 5' trước → strip `waitedMin=5`, `late=false` (trước fix ~7h05). `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [orders-report] FIX inline Tag XL editor không cập nhật khi gắn tag (sync qua ProcessingTagState) ✅

**User:** "gán tag đã thay đổi thực tế dưới đơn hàng nhưng dòng gắn tag phía trên (inline editor) không cập nhật theo, luôn giữ nguyên ban đầu."

**RCA:** Bản đầu wrap `window._ptagRefreshRow` để re-render editor, NHƯNG code nội bộ tab1-processing-tags.js gọi **LOCAL** `_ptagRefreshRow(orderCode)` (không qua `window.`) → wrap không bao giờ chạy → editor stale.

**Fix** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js): mọi mutation đều đi qua `ProcessingTagState.setOrderData/updateOrder/removeOrder`, và `window.ProcessingTagState` **CÙNG object** với ref nội bộ (export L7139). → Override 3 method này trên object → caller nội bộ lẫn ngoài đều chạy qua → khi `key===currentCode` gọi `scheduleRerender()` (debounce 120ms) re-render editor. Bỏ wrap `_ptagRefreshRow` vô dụng. Bump `tab1-tagxl-inline.js?v=20260616b`.

**Verify (Playwright localhost):** mở editor từ thanh (code 260602153, chips "BÁN HÀNG") → `setOrderData` thêm flag in-memory → editor tự đổi thành "BÁN HÀNG | TEST SYNC" → restore sạch. `PTS.__tagxlWrapped=true`. (Test in-memory, KHÔNG mutate/persist data thật.) `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [orders-report] Strip "Khách chưa trả lời": avatar Pancake + fix chat header "Khách hàng" ✅

**User:** "(1) cho hình lấy dữ liệu khách unread từ pancake như cột tin nhắn đang lấy; (2) mở chat từ thanh sao không thấy tên khách hàng mà ghi 'Khách hàng'."

- **Avatar** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js) `buildCell`: thêm `<img class="ucs-cell__avatar">` dùng đúng proxy cột Khách hàng: `…/api/fb-avatar?id=<psid>&page=<pageId>` (psid/pageId gốc Pancake sẵn trong pending), `loading=lazy` + `onerror` ẩn. CSS [.ucs-cell\_\_avatar](orders-report/css/tab1-unread-messages-strip.css) tròn 18px. Bump strip js/css `?v=20260616b`.
- **Fix tên/SĐT "Khách hàng"** (RCA): [openChatModal](orders-report/js/tab1/tab1-chat-core.js#L838) lấy tên+SĐT từ **DOM dòng** `tr[data-order-id]`. Mở chat từ thanh cho đơn NGOÀI vùng hiển thị (virtual-scroll/bị lọc) → `orderRow=null` → `currentCustomerName=''` → header "Khách hàng" + SĐT rỗng. Thêm **fallback**: nếu rỗng → lấy `OrderStore.get(id)` (fallback `allData.find`) → `order.Name` + `order.Telephone` (đúng field cột Khách hàng dùng). Bump chat-core `?v=20260616a`.

**Verify (Playwright localhost, campaign T6 531 đơn):** 25 ô strip → 25 avatar (0 lỗi onerror, blob-cached); click ô "Mong Duy Nguyen" (row KHÔNG có trong DOM, `firstOrderRowInDom:false`) → `currentCustomerName="Mong Duy Nguyen"`, `currentChatPhone="0334167771"`, header hiện đúng tên (trước fix = "Khách hàng"). `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [web2] NCC 1 nguồn duy nhất — products + purchase-refund + supplier-debt dùng Web2SuppliersCache ✅

User: 3 trang dùng dữ liệu NCC (products, purchase-refund, supplier-debt) → đưa hết về nguồn chung supplier-wallet. Nguồn chung sẵn có = `window.Web2SuppliersCache` (`web2/shared/web2-suppliers-cache.js`) → GET/POST `/api/web2-supplier-wallet/suppliers` (bảng `web2_supplier_meta` = trang Ví NCC), realtime SSE `web2:supplier-wallet`.

- **products** [web2-products-app.js](web2/products/js/web2-products-app.js): NCC dropdown `#pmSupplier` trước lấy từ **tab Sổ Order** (`loadSuppliersFromSoOrder` → Web2SoOrder tab labels) → đổi sang `Web2SuppliersCache.getNames()`. Init cache + subscribe SSE → dropdown tự refresh khi NCC đổi ở trang khác. Label "(chọn từ tab Sổ Order)" → "(từ Ví NCC)". NCC name vẫn drive prefix mã SP (HÀ NỘI→HN, A1→A1). Load `web2-suppliers-cache.js`.
- **purchase-refund** [purchase-refund-app.js](web2/purchase-refund/js/purchase-refund-app.js): form thủ công "Tên NCC" thêm `<datalist>` autocomplete từ `Web2SuppliersCache.getNames()`; submit gọi `ensure(name)` (idempotent) → NCC gõ mới vào nguồn chung. Quick-refund (picker so-order) giữ nguyên — NCC từ ngữ cảnh mua hàng là đúng.
- **supplier-debt** [supplier-debt-app.js](web2/supplier-debt/js/supplier-debt-app.js): đã tạo/đọc qua `/api/web2-supplier-wallet` (cùng backend nguồn chung). Thêm `<datalist>` autocomplete tên NCC khi tạo, lấy từ `Web2SuppliersCache`.

Bump `?v=20260616a` (3 app.js + suppliers-cache trên cả 3 index). Verify: node --check 3/3 OK; GET /suppliers trả 6 NCC (A1, HÀ NỘI, HƯƠNG CHÂU, KHO TÂN BÌNH, QUẢNG CHÂU, XƯỞNG SỈ A); pattern giống so-order (đã verify live phiên trước). Browser verify trực quan bị chặn do 1 session browser khác đang dùng chung (contention).

### [shared][orders-report] Fix NJD Live load nhầm kho SHOP — token TPOS không SwitchCompany theo công ty đang chọn ✅

User báo: đang chọn **NJD Live** mà product search ra sản phẩm **HH (kho SHOP)** + `Mã: null`. User chỉ rõ: company KHÔNG do username quyết định mà do **luồng request login** (SwitchCompany payload).

**Root cause (verify qua decode JWT + test SwitchCompany):** Cả 2 account `nvktlive1`/`nvktshop1` đều login về **CompanyId 2** mặc định (kho SHOP, 776 SP "HH", 0 "Q"). Kho LIVE = **CompanyId 1** (2051 SP "Q") chỉ tới được qua `SwitchCompany({companyId:1})` + refresh token. Settings modal ([navigation-modern.js:4884](shared/js/navigation-modern.js#L4884)) có làm đủ 3 bước login→switch→refresh, NHƯNG `tokenManager.fetchNewToken()` **chỉ password login** (bước 1), `switchCompanyToken()` viết sẵn nhưng **chưa bao giờ được gọi** (dead code) → chọn Live hay Shop đều đứng company 2 → cả 2 ra kho SHOP. NJD Live hỏng.

**Files:** [shared/js/token-manager.js](shared/js/token-manager.js) + bump `?v=20260616tok` cho 19 trang dùng token-manager.js (orders-report tabs, don-inbox, balance-history, delivery-report, inventory-tracking, doi-soat, …).

1. Thêm `getTokenCompanyId(token)` (decode JWT claim CompanyId) + `isCorrectCompany()`.
2. Thay dead `switchCompanyToken` bằng `ensureCompanyContext()`: nếu company của token ≠ `this.companyId` → `SwitchCompany({companyId})` (HTTP 204) + refresh → token bound đúng công ty + lưu lại.
3. `fetchNewToken()`: sau refresh/password-login → luôn gọi `ensureCompanyContext()`.
4. `getToken()`: trả token chỉ khi `isTokenValid() && isCorrectCompany()` (token cached sai công ty trong localStorage/Firestore không còn bị dùng nhầm).

NJD Shop (company 2) không đổi (ensureCompanyContext no-op vì đã ở company 2). **Verify live (browser eval, NJD Live):** token cache company 2 → boot tự switch → `tokenCompany:1`, `storedCompany:1`, Excel **7877 SP kho LIVE** (vs 833 shop), search "ao"→`[MM352] MM SET ÁO…`, "tui"→`[MM435] MM TÚI…` = đúng SP LIVE. node --check OK.

**Toàn cục:** `tab3-core.js` (tự login riêng) → `getValidToken()`/`authenticatedFetch` 401 giờ ưu tiên `window.tokenManager.getToken()` (company-correct), self-login chỉ là fallback cuối. `tab-kpi-commission.js` fallback login là dead code (chỉ chạy khi `window.tokenManager` vắng — token-manager.js đã load sẵn nên primary path luôn dùng) → giữ nguyên.

Bump `tab3-core.js?v=20260616tok`.

### [orders-report][don-inbox] Fix product search/suggest rỗng toàn bộ — token TPOS stale không tự refresh ✅

User báo: TOÀN BỘ chỗ đánh tên sản phẩm suggest không hiện ("Không tìm thấy sản phẩm") ở orders-report (modal Sửa đơn tab Sản phẩm + panel chat) VÀ don-inbox.

**Root cause (reproduce & confirm 100% qua browser eval):** `productSearchManager` (Web 1.0, dùng chung bởi edit-modal/sale/chat/don-inbox) load sản phẩm từ TPOS Excel endpoint. `tokenManager.isTokenValid()` chỉ kiểm tra timestamp local (token còn hạn ~15 ngày) → không biết TPOS đã vô hiệu hóa token server-side (login lại ở máy/tab khác cùng account `nvktlive1`). Token stale → `getToken()` trả token cũ KHÔNG refresh → TPOS trả **HTML trang login (HTTP 200, KHÔNG phải 401)** → `parseExcelBlob` lỗi `"Invalid HTML: could not find <table>"` → 0 SP → throw nhưng code KHÔNG nhận ra là lỗi auth → kẹt tới khi hết hạn local. Fallback OData gặp 401 → `return []` im lặng, cũng không refresh.

**Bằng chứng:** backend khỏe (token sạch → 833 SP, search OK); mô phỏng access_token rác + expires_at xa → tái hiện đúng "Không tìm thấy" + không tự phục hồi.

**Files:** [orders-report/js/managers/product-search-manager.js](orders-report/js/managers/product-search-manager.js), [orders-report/js/chat/chat-products-ui.js](orders-report/js/chat/chat-products-ui.js).

1. `fetchExcelProducts`: bọc fetch+parse trong retry-loop (max 2). Phát hiện auth-failure = response **không phải spreadsheet** (content-type không chứa `spreadsheet/officedocument/excel/octet-stream`, tức HTML login) hoặc HTTP 401/403 → gọi `forceTokenRefresh()` → retry 1 lần. Hết retry vẫn HTML → throw message rõ ("TPOS trả về trang đăng nhập…").
2. Thêm method `forceTokenRefresh()`: `invalidateAccessToken()` (giữ refresh_token) + `getToken()` (refresh_token→password login) → lấy token mới + lưu lại → mọi call TPOS sau đó cũng OK.
3. Fallback OData `searchProductsFromAPI` (chat): retry-loop, gặp 401/403 lần đầu → invalidate + getToken + retry.

**Verify live (browser eval, session sạch):** token rác `isTokenValid:true` → trước fix `recovered:false`/count 0; sau fix `recovered:true`/**833 SP**/search "ao" 5 KQ/`tokenChanged:true`. node --check 2 file OK.

### [web2][so-order] Sửa mã SP + 8 cải tiến modal tạo đơn (batch) ✅

User báo: biến thể "Đỏ" + tên "1606 A1 ÁO TN TRƠN" ra mã `HNMMTRANG` (sai). Điều tra: `HNMMTRANG` là mã của SP **khác** cùng tên nhưng biến thể **"Trắng"** (id 212); hàng "Đỏ" **mượn nhầm** vì badge tra kho chỉ theo TÊN. Gốc sâu hơn: `extractType` chỉ match từ loại ở ĐẦU tên → "1606 A1 ÁO…" rớt về `MM` thay vì `AO`.

**Files:** [web2/shared/web2-product-code.js](web2/shared/web2-product-code.js), [web2/shared/web2-products-cache.js](web2/shared/web2-products-cache.js), [so-order/js/so-order-app.js](so-order/js/so-order-app.js), [so-order/js/so-order-storage.js](so-order/js/so-order-storage.js), [so-order/index.html](so-order/index.html), [so-order/css/so-order.css](so-order/css/so-order.css), [scripts/test-web2-product-code.js](scripts/test-web2-product-code.js).

1. **Sinh mã SP — viết lại `extractType`**: bỏ qua token "mã nội bộ" ở đầu (token chứa chữ số: 1606, A1, B4…) rồi tìm TỪ LOẠI ở token nội-dung đầu tiên trở đi. Né ĐẦM↔ĐẬM (chỉ nhận `DAM` khi là token nội-dung đầu). `1606 A1 ÁO TN TRƠN`+Đỏ → **HNAODO**, +Trắng → **HNAOTRANG**. Test Node `scripts/test-web2-product-code.js` 17/17 pass.
2. **Badge mã kho variant-aware**: thêm `Web2ProductsCache.findByNameVariant(name, variant)` (strict tên+biến thể); `_lookupKhoCode` dùng nó → hàng "Đỏ" chưa có SP đúng biến thể → **để trống** (không mượn nhầm mã "Trắng"). Verify browser: hàng Đỏ badge blank, hàng ÁO/Xanh Lá/L vẫn HNAOXLL.
3. **Per-tab toggle ẩn/hiện thông tin lô nâng cao** (ETA/Đợt/Số Kiện/Tổng KG/Tiền HĐ/Tiền tệ) trong modal tạo đơn — `tab.showShipMeta`, **mặc định ẩn**. Checkbox ở "Cài đặt tab". CSS `.so-ship-adv[hidden]{display:none!important}`.
4. **Dropdown gợi ý (SP + biến thể) sát ô input**: gốc gap khổng lồ = `_positionFixedDropdown` đặt `position:fixed` nhưng ancestor `.so-modal-body-v2` có `contain:layout/paint` → fixed tính theo box đó, không phải viewport. Đổi sang `position:absolute` + `top = input.offsetTop+offsetHeight+2`. Gap 6px (trước: hàng trăm px).
5. **Thành tiền = GIÁ NHẬP** (đơn mua hàng), không phải giá bán — `updateRowTotal` + `updateModalGrandTotals`. Verify: SL2×nhập100 = 200₫ (không 1998).
6. **Giảm giá + Phí ship per-đơn** thêm vào modal tạo đơn (lưu `shipMeta.discount/shipping`); THÀNH TIỀN = Σ(SL×nhập) − giảm + ship (verify 200−50+30=180); hiện trên header lô khi ≠0. Ghi chú đơn đã có sẵn.
7. **Bỏ cột "Thao Tác"** (sửa/xoá per-row) — trùng nút header lô (sửa/xoá lô + sửa ô inline). Gỡ khỏi `COLUMNS` + `DEFAULT_COLUMNS`.
8. **Tạo NCC mới** (modal tạo đơn) trước "chưa tạo được": picker modal không truyền `onPick` → click "+ Tạo NCC" chỉ điền input, không gọi `ensure`. Fix: truyền `onPick → _ensureSupplierWithFeedback` (tạo NGAY + notify). **Nguồn NCC dùng chung đã có sẵn** = `Web2SuppliersCache` → `/api/web2-supplier-wallet/suppliers` (bảng `web2_supplier_meta`, trang Ví NCC) — 1 nguồn duy nhất. Verify live: tạo "ZZTEST0616" OK (đã xoá test).
9. **Hình ảnh hóa đơn** (task user nêu): đã wired sẵn end-to-end (modal `_imgPasteCellHtml` → `handleOrderSubmit` lưu `invoiceImage` → main-table `imgCell` rowspan theo `invoiceGroupId`). Không thiếu gì.

Bump versions `?v=20260616a` (so-order.css, web2-products-cache.js, web2-product-code.js, so-order-storage.js, so-order-app.js). Browser test: 0 console error, 9/9 hành vi verified.

### [web2][live-chat] Snapshot — endpoint POST /purge (dọn thumbnail theo ngày) + client clear cache ✅

User hỏi multi-machine + xin dọn thumbnail livestream HÔM NAY (không cần nhận diện ảnh). Bối cảnh: backend dedup `ON CONFLICT(comment_id) DO UPDATE … COALESCE(existing.image_data, new)` = **"ảnh có-bytea ĐẦU TIÊN thắng, POST sau KHÔNG đè"** → frame đen (từ máy unfocused, trước fix) POST trước sẽ thắng vĩnh viễn; Force extract bỏ qua comment "đã có ảnh" nên không vá được ảnh đen cũ → cần xoá row.

- **Backend** [livestream-snapshots.js](render.com/routes/livestream-snapshots.js): thêm `POST /api/livestream/snapshots/purge` (gate `x-admin-secret===CLEANUP_SECRET` + `{confirm:'YES-PURGE', scope}`). `scope:'today'` → `DELETE WHERE created_at >= 00:00 GMT+7` (tính tường minh epoch); `scope:'all'` → TRUNCATE. `_notify('purge',{scope})`. Khác `wipe-all` (chỉ all): purge có date-scope + reusable.
- **Client** (subscribeSSE): handle `action==='purge'|'wipe-all'` → clear `snapByComment`/`cacheList`/`counts`/`pending` + re-queue fetch mọi row → thumbnail đen kẹt biến mất NGAY (không reload), comment thành pending rồi tự chụp lại/force-extract.
- Bump `live-livestream-snap.js?v=20260616purge`. Cần deploy web2-api (auto trên push). Sau deploy gọi purge scope=today.

**Multi-machine (trả lời user):** chụp NỀN (stream/buffer) = **1 máy duy nhất** qua leader-lock CAS (TTL 90s, heartbeat 30s, stall-failover 75s, SSE takeover) → không tranh nhau. Per-comment captureVisibleTab KHÔNG lock (nhiều máy focus có thể thử) NHƯNG **không bao giờ chồng chéo dữ liệu**: unique index `comment_id` + COALESCE first-wins + SSE existingSnap-skip → đúng 1 ảnh/comment, không trùng/không đè. Fix focus-gate hôm trước loại frame đen khỏi cuộc đua → "ảnh đầu tiên" luôn là frame thật từ máy focus.

### [orders-report] Inline Tag XL editor cạnh nút Auto T (gắn tag đơn vừa mở chat từ thanh) ✅

**User:** "bên cạnh nút auto bật, khi mở khung chat từ bộ lọc tin nhắn → hiện dòng gắn tag xl của đơn đó để user nhắn xong gắn tag; click ô khác đổi đơn; mở chat ngoài thanh thì ẩn; tag gắn thêm xếp theo chiều ngang sau các nút gán."

**Làm:** Inline Tag XL editor đặt cạnh nút Auto T, bind theo đơn vừa mở chat TỪ thanh "Khách chưa trả lời".

- **JS** [tab1-tagxl-inline.js](orders-report/js/tab1/tab1-tagxl-inline.js) (`window.TagXLInline`): `openFromStrip(orderId,pageId,psid,ev)` (strip gọi) set cờ `_fromStrip` → `showConversationPicker` → `show(orderId)`. `show()` lookup `OrderStore.get(id)` → render label `STT · tên` + `window.renderProcessingTagCell(order.Code)` (tái dụng y hệt cell Tag XL trong bảng — nút gán + chip, khoá theo order.Code) + nút ×. `init()` (DOMContentLoaded) **wrap**: `openChatModal` (mở KHÔNG từ thanh & khác đơn đang bind → `hide()`), `openCommentModal` (luôn `hide()`), `_ptagRefreshRow` (orderCode trùng → `rerender()` đồng bộ sau mọi mutation kể cả chọn dropdown). Guard idempotent.
- **CSS** [tab1-tagxl-inline.css](orders-report/css/tab1-tagxl-inline.css): `.tagxl-inline` ẩn mặc định, `.has-order`→inline-flex; **scope override ngang** `.tagxl-inline .ptag-cell{flex-direction:row}` + `.ptag-cell-badges/.ptag-cell-ttag-row/.ptag-cell-flags-row{flex-direction:row;flex-wrap:wrap}` (không đụng cell trong bảng); max-width 60vw + scroll-x.
- **Strip** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js): onclick ô route qua `TagXLInline.openFromStrip` (fallback `showConversationPicker`).
- **HTML** [tab1-orders.html](orders-report/tab1-orders.html): container `#tagxlInlineEditor` sau nút `#autoTToggle`; thêm CSS link + script `?v=20260616a` (sau strip).

**Verify (Playwright localhost:8099, campaign T6, 531 đơn):** (1) click ô thanh → editor hiện "STT 471 · Yến VY", `.ptag-cell` + badges `flex-direction:row`, 5 nút + 4 chip + nút ×, chat mở; (2) click ô khác → đổi "STT 68 · Mong Duy Nguyen"; (3) click cột TIN NHẮN trong bảng (showConversationPicker, non-strip) → editor ẩn; (4) nút gán onclick đúng order Code `260602462`; wrap `_ptagRefreshRow(code)` re-render editor (test marker, KHÔNG mutate data thật), giữ layout ngang; (5) editor PERSIST sau khi đóng chat (để gắn tag sau khi nhắn); 0 lỗi console từ module. `node --check` 2 file PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report).

### [web2][live-chat] Snapshot — KHÔNG chụp khi tab không focus (hết thumbnail đen) ✅

**Triệu chứng (user):** live-chat `index.html` auto-snap "không focus vào vẫn chụp nên nó bị thumbnail đen" — comment có ảnh thumbnail ĐEN.

**Nguyên nhân:** path capture qua extension (`chrome.tabs.captureVisibleTab`) chỉ gate `!document.hidden`. `document.hidden` vẫn `false` khi tab là active tab của window NHƯNG window KHÔNG focus (user qua app/cửa sổ khác) → `captureVisibleTab` trả frame ĐEN (hoặc tệ hơn: tab active của window KHÁC đang focus → chụp nhầm nội dung). Crop wrapper FB-live → thumbnail đen lưu vào DB.

**Fix** ([live-livestream-snap.js](live-chat/js/live/live-livestream-snap.js)):

- `_pageActiveForCapture()` = `visibilityState==='visible' && document.hasFocus()` — `hasFocus()` chỉ true khi window focus + tab active (đúng điều kiện có frame thật). Gate ở **1 funnel duy nhất** `_captureExtensionFrame` (return null khi không active) + cập nhật `canExtTabCapture`. Mọi caller (auto-snap, frame-buffer tick, force-extract pool) tự được bảo vệ.
- `_isFrameBlank(ctx,w,h)` = lấy mẫu ~1024 pixel sau crop; `mean<10 && max<24` (luminance 0-255) → coi là đen → bỏ frame. Safety-net cho mọi nguồn (focus rồi nhưng iframe chưa render). Unit-test: đen tuyền/near-black jpeg → bỏ; scene tối có highlight + frame thường → giữ.
- **KHÔNG đụng** stream `getDisplayMedia` (`_captureFrameJpeg`) — path này CỐ Ý chụp khi tab inactive (đã có rVFC né frame seek). Background capture vẫn dùng "🎬 Bắt đầu chụp live".

**Lý do giữ `hasFocus()` (không nới lỏng):** khi window mình KHÔNG focus, `captureVisibleTab` chụp active tab của window ĐANG focus (window khác) → sai nội dung/riêng tư, không chỉ đen. Gate này ngăn chụp nhầm surface. Edge `hasFocus()=false khi DevTools focus` (over-block hẹp, tự hồi khi click lại) — chấp nhận; `_isFrameBlank` là guard chính. (Adversarial review 5-agent: 0 critical/high, 1 medium "acceptable, no change required".)

**Verify:** node --check OK; unit-test `_isFrameBlank` 4 ca đúng. E2E index.html bị chặn vì web2 login session test hết hạn (redirect /web2/login) — không liên quan code. Frontend-only, không cần deploy backend. Bump `live-livestream-snap.js?v=20260616focus`.

### [web2][live-chat] Tin nhắn dài bị cắt "..." — fix reconcileFullText thiếu customer_id + backfill ✅

**Triệu chứng (user ask 4):** comment livestream dài hiện "..." (vd image 5 "Nguyễn Thuỳ Dung"). KHÔNG phải lỗi frontend (đã verify `clipped:false`) — Pancake cắt snippet ở nguồn (~64 ký tự).

**Root cause (xác minh LIVE qua pancake.vn API):** backend ĐÃ có `reconcileFullText` ([web2-livestream-poller.js](render.com/services/web2-livestream-poller.js)) fetch full text khi /ingest thấy snippet cắt, NHƯNG nó gọi `_fetchConversationComments(..., { id: convId }, ...)` — THIẾU `customers[0].id`. Pancake messages API **bắt buộc `customer_id` = UUID khách** (KHÔNG phải PSID): gọi thiếu → trả `"Thiếu mã khách hàng"` + 0 message → reconcile im lặng fail → comment kẹt "...". Verify: cùng conv, thiếu customer_id → 0 msg "Thiếu mã khách hàng"; đúng UUID `a3698631…` → full text "Em mấy ngày trước chị chốt quần B xat . 590k không thấy E chốt quần chị". Token pancake_accounts còn hạn OK (không phải lỗi JWT). `/page-posts` rỗng chỉ vì không có bài đang live lúc test.

**Fix:**

- [web2-live-comments.js](render.com/routes/web2-live-comments.js) `/ingest`: truyền `conv.customers[0].id` (UUID) xuống `reconcileFullText`.
- [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) `reconcileFullText(pageId, postId, convId, rowId, custUuid)`: dùng custUuid → `_fetchConversationComments(..., { id, customers:[{id:custUuid}] })`. Nếu thiếu custUuid (vd backfill) → tự resolve qua `_listPostConversations` (tìm conv theo id → `customers[0].id`). Không có UUID → return sớm (khỏi gọi fail). Trả boolean updated.
- **BACKFILL** `reconcileRecentTruncated({hours,limit})`: quét `web2_live_comments` còn `message LIKE '%…'|'%...'` trong N giờ (`updated_at >= since`), derive convId = row id bỏ `_${seq}` cuối, reconcile từng cái. Chạy 1 lần 25s sau boot (`start()`), idempotent (`UPDATE … WHERE message<>$1`). Vá comment cũ còn "..." (vd image 5).

**Deploy:** cần web2-api (instance chạy /ingest + poller, DISABLE_WEB2_JOBS unset). Frontend không đổi. Comment mới tự đổi snippet→full qua SSE `reconcile`; comment cũ vá khi web2-api restart (backfill).

### [web2][live-chat] comments-mobile — SĐT hiện CÙNG LÚC với địa chỉ (fallback kho như desktop) ✅

**Triệu chứng (user):** mobile (`comments-mobile.html`) hiện địa chỉ nhưng KHÔNG hiện SĐT cùng lúc, dù desktop (`index.html`) hiện cả 2 (vd KH "Lê Hạ" desktop có `0978078543` + địa chỉ, mobile chỉ địa chỉ).

**Nguyên nhân:** [comments-mobile.js](live-chat/js/live/comments-mobile.js) `cardHtml` lấy SĐT = `validPhone(c.phone) ? normP(c.phone) : ''` — CHỈ đọc SĐT trên comment, KHÔNG fallback kho. Còn `addrOf(c)` thì có fallback kho → địa chỉ hiện, SĐT thì không. Desktop `renderCommentItem` dùng chuỗi `[partner.Phone, kho?.phone, pancakePhone, comment.phone]` nên luôn ra SĐT.

**Fix:** thêm `phoneOf(c)` (giống `addrOf`): SĐT comment 10 số → nếu không có thì lấy SĐT trong kho `web2_customers` (`whInfo(c).phone`, khớp theo phone/fb_id). Dùng trong `cardHtml` meta + `openSheet` + `cardSig` (chữ ký reconcile). Thêm `phone` vào map enrich (nhánh shared `LiveCustomerSync.enrich` đã sẵn trả `phone`; bổ sung nhánh fallback inline). Bump `comments-mobile.js?v=20260616phonefix`.

**Verify (browser localhost, 100 comment):** trước fix nhiều card "địa chỉ-only"; sau fix **addrOnly=0** (mọi card có địa chỉ giờ hiện luôn SĐT), both=60, phoneOnly=15, neither=25. Mẫu: `0987346565 + Khối 1 kiến đức Dakrlap daknong`.

**Desktop (ask 3):** `index.html` ĐÃ resolve + hiện cả SĐT + địa chỉ sẵn (input `phone-`/`addr-` Row 3, fallback kho) → không cần đổi.

**Tin nhắn dài "..." (ask 4) — KHÔNG phải lỗi frontend:** verify `clipped:false` (scrollHeight==clientHeight) — `.c-msg` (mobile) + `.live-conv-message` (desktop) đều KHÔNG line-clamp, hiện ĐỦ text đã lưu. "..." nằm trong DATA: Pancake CẮT comment dài (~64 ký tự + "…"/"..."). Backend ĐÃ có `reconcileFullText` ([web2-live-comments.js](render.com/routes/web2-live-comments.js):376 bắt cả "…" lẫn "...") → fetch full text → SSE `reconcile` → mobile tự đổi. Comment image 5 còn "..." ⇒ reconcile chưa hoàn tất (nghi JWT trên web2-api sau split 14/06 — `/page-posts` cũng trả 0 vì pool/JWT). List endpoint KHÔNG trả conv_id → không thể fetch full text từ browser. → Fix thuộc BACKEND, chờ user xác nhận scope.

### [web2][shared] Chat Zalo — TÌM KIẾM trong hội thoại (highlight + nhảy khớp) ✅

User: "tìm kiếm trong zalo" (khung chat Zalo nhúng chưa có tìm, chỉ cuộn/tải tin cũ). Thêm vào [chat-view.js](web2/shared/zalo-chat/chat-view.js):

- Nút kính lúp ở header → mở thanh tìm (input + đếm `n/N` + ↑↓ + đóng). Mở thanh → `_loadAllForSearch()` nạp đủ tin 1 lần (drain DB pagination + 1 backfill nhóm, render 1 lần) để tìm TOÀN hội thoại không chỉ tin đang hiện.
- `_runSearch` (debounce 200ms): lọc `messages` theo `content` (không dấu, hoa-thường), tô **ring bong bóng** khớp + `<mark>` chữ khớp (case-insensitive, best-effort), nhảy tới khớp **gần đáy nhất**. Enter/↓ khớp sau, Shift+Enter/↑ khớp trước, Esc đóng. Realtime refresh khi đang tìm → renderBody tự vẽ lại tô (`_srchActive`).
- CSS [chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css): `.wz-head-btn`, `.wz-srch-bar/input/count/nav`, `mark.wz-srch-mk` (vàng), `.wz-srch-hit/cur` (ring xanh). Chỉ frontend (client-side, dùng Api sẵn có) — KHÔNG cần deploy web2-api.
- Bump `ENGINE_VER=20260616b` + tag web2-zalo.js (3 trang) + chat-view.js/chat-bubbles.css (web2/zalo).

### [web2][live-chat] comments-mobile — bỏ full re-render khi có comment mới (keyed DOM reconcile) ✅

**Triệu chứng (user):** `live-chat/comments-mobile.html` — có tin nhắn mới → thêm vào bảng → render lại HẾT avatar/SĐT/nội dung/địa chỉ của các comment cũ → giật, nhức mắt. "Phần này sửa nhiều nhưng lỗi hoài."

**Nguyên nhân:** [comments-mobile.js](live-chat/js/live/comments-mobile.js) có 2 path render lệch nhau. `doRender()` làm `listEl.innerHTML = html` → **đập & dựng lại MỌI card** mỗi lần render. Bị gọi liên tục: SSE comment mới → throttle 30s `loadPosts()` → `overrideRealCounts()` → `load({silent:true})` (`ALL=data` → `scheduleRender`), enrich kho (`web2:customers`), `overrideRealCounts`. Đập innerHTML hủy + tạo lại từng `<article>` → mọi avatar `<img>` refetch worker → nháy. `applyDelta` (path 2) tự patch `outerHTML` thủ công → dễ lệch với doRender.

**Fix (triệt để — 1 renderer duy nhất):**

- Thêm **keyed DOM reconciler** `reconcileList(shown, moreCount)`: index card theo `data-id`, **tái sử dụng nguyên node card cũ nếu chữ ký nội dung (`cardSig`) không đổi** (KHÔNG chạm DOM → avatar/SĐT/địa chỉ/tên/nội dung giữ cache, 0 nháy). Chỉ: tạo card MỚI (fade-in `.is-new`), gỡ card đã ẩn, đổi vị trí (insertBefore tối thiểu — card cũ đứng yên), rebuild ĐÚNG card đổi nội dung (enrich) kèm `transplantAvatar` (giữ `<img>` đã load nếu cùng src → không refetch ảnh).
- `doRender()` gọi reconciler thay vì innerHTML. `applyDelta()` rút gọn còn merge vào `ALL` + 1 lần `scheduleRender()`; `enrichDelta()` → `scheduleRender()`. `load()` bỏ patch new-pill thủ công (reconciler hiện pill khi có card mới + đang cuộn). Gỡ `cardSel` + path patch `outerHTML` trùng → hết dual-path.
- Card mới: fade opacity thuần + khung xanh ~3s (keyframe `cardIn`/`.card.is-new` sẵn có). Burst dồn dập (>5 batch hoặc >12/2s) → bỏ animation (hiện tức thì).

**Verify (browser test localhost):** load 100 card → gắn expando `__keep`/`__keepav` lên từng card + avatar → click Làm mới (path xưa nuke hết) → **100/100 card node + 100/100 avatar node ĐƯỢC GIỮ NGUYÊN** (code cũ = 0/0). Không lỗi console từ render. Bump `comments-mobile.js?v=20260616reconcile`. Frontend-only, không cần deploy backend.

### [web2] J&T list — tìm kiếm theo TÊN KH + SĐT (thêm src_message vào search) ✅

User: "thêm tìm kiếm" → chọn "Tìm trong danh sách đơn J&T". Ô `#jtSearch` cũ chỉ tìm `billcode/note/latest_event`; tên KH + SĐT nằm trong `src_message` (dòng dán) nên gõ tên/SĐT không ra. [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/list`: thêm `src_message ILIKE` vào OR + nhánh **digits-only** (query ≥4 số → strip non-digit cả 2 vế: `regexp_replace(src_message,'\D','')` ILIKE) để "0904 455" khớp SĐT số liền. Placeholder [index.html](web2/jt-tracking/index.html) → "Tìm mã / tên KH / SĐT / sự kiện / ghi chú…". Search đã debounce sẵn (server-side `/list?search=`). Backend cần deploy web2-api.

### [web2][shared] Chat Zalo — gõ `@` lên danh sách thành viên nhóm để TAG (mention) ✅

User: "@ phải lên danh sách tên người trong group để tag — chức năng này Zalo có mà". Ô soạn chat nhúng (Web2Zalo.mountChat) chưa có @mention. Thêm full feature:

- **Backend** [web2-zalo-zca.js](render.com/services/web2-zalo-zca.js): `getGroupMembers(accountKey, gid)` (getGroupInfo→`memVerList` `uid_ver`→tách uid→resolve tên batch 50, bỏ chính mình); `send()` nhận `mentions=[{uid,pos,len}]` → payload `{msg,mentions}` (zca-js Mention type). [web2-zalo.js](render.com/routes/web2-zalo.js): `GET /conversations/:id/members` (gộp người đã nhắn trong thread từ `web2_zalo_members` + danh sách đầy đủ zca, dedup, chỉ trả người có tên, sort tiếng Việt; cache tên mới vào members); `/send-message` nhận + truyền `mentions`.
- **Frontend** [web2-zalo-api.js](web2/shared/web2-zalo-api.js): `groupMembers(convId)`. [chat-view.js](web2/shared/zalo-chat/chat-view.js): `onSendText(text, mentions)`→`sendTextRaw`→`Api.sendMessage({...,mentions})`. [composer.js](web2/shared/zalo-chat/composer.js): gõ `@` (đầu/sau khoảng trắng) → dropdown thành viên (lazy-load + cache theo conv), lọc không dấu, ↑↓ chọn / Enter|Tab chèn / Esc đóng / click chuột; chèn `@Tên ` + nhớ map tên→uid; lúc gửi `_buildMentions` re-derive vị trí thật trong text (chịu được sửa). [chat-composer.css](web2/shared/zalo-chat/chat-composer.css): dropdown drop-up. Chỉ bật cho nhóm.
- Bump `ENGINE_VER=20260616a` + tag web2-zalo.js (jt-tracking/customers/balance-history) + composer/chat-view/api/chat-composer.css (web2/zalo). Backend cần deploy web2-api.

**Triệu chứng:** trang delivery-report gửi ảnh/file lên Telegram báo `Telegram API lỗi: Bad Request: group chat was upgraded to a supergroup chat`.

**Nguyên nhân:** nhóm Telegram đã bị **nâng cấp lên supergroup** → `chat_id` cũ (env `DELIVERY_REPORT_TELEGRAM_CHAT_ID`) chết. Telegram trả lỗi này KÈM `parameters.migrate_to_chat_id` = chat_id MỚI (dạng `-100...`). Code cũ chỉ báo lỗi rồi bỏ cuộc, không retry.

**Fix** (`render.com/routes/delivery-report-telegram.js`): thêm helper `sendToTelegram(method, buildForm)` — khi gặp lỗi migrate, tự retry 1 lần với `migrate_to_chat_id`, nhớ id mới vào `_effectiveChatId` trong process (các lần gửi sau khỏi lỗi), và `console.warn` id mới để cập nhật env trên Render. Gộp luôn logic gửi trùng lặp của `send-photo` + `send-document` (DRY). Self-healing — không cần thao tác tay.

**Việc cần làm thủ công (1 lần, tùy chọn):** cập nhật env `DELIVERY_REPORT_TELEGRAM_CHAT_ID` trên Render = id mới (xem log `[DELIVERY-REPORT-TG] Group nâng cấp supergroup: ... → <id mới>`) để khỏi tốn 1 lần retry mỗi khi server restart. Cần redeploy `n2store-fallback` để fix có hiệu lực.

### [web1][realtime] Retire n2store-realtime — ❌ HARD-DELETED 2026-06-16 ✅

**HOÀN TẤT (user chốt "b" = xóa hẳn):** sau suspend + verify không vỡ → hard-delete: `DELETE /v1/services/srv-d5doh26uk2gs739489k0` (204 → GET 404) + `git rm -r n2store-realtime/` + gỡ refs (`shared/universal/api-endpoints.js` N2STORE const, `service-costs.js` entry+quick-link+plan-map, `nginx-backup.conf` repoint `/api/realtime/*` → n2store-fallback khớp live worker). Verify post-delete: badge `pending-customers` vẫn **200** qua fallback (Web 1.0 OK), web2-realtime 200. **KHÔNG drop bảng** trên `n2store_chat` (data giữ; tái tạo từ git nếu cần). −$7/mo. Còn lại chỉ comment/docs lịch sử. Commits `b64200cc9`+`8dc5ef62f`.

<!-- suspend log gốc -->

### [web1][realtime] Retire n2store-realtime — ⏸ ĐÃ SUSPEND (reversible) 2026-06-16 ✅

**Cập nhật:** user chốt "xóa đi" (pending_customers redundant, unread lấy từ Pancake). Thực thi an toàn: (1) gỡ 3 direct call mark-replied n2store-realtime ở orders-report (tab1-chat-core/chat-products-ui/quick-reply-manager, giữ worker primary); (2) **SUSPEND service** srv-d5doh26uk2gs739489k0 (reversible, $0 billing) thay vì hard-delete ngay vì irreversible + 10% residual. Verify: n2store-realtime HTTP 503; badge `pending-customers` qua fallback vẫn 200 (Web 1.0 KHÔNG vỡ); web2-realtime 200. Cost ~$7/mo ĐÃ tiết kiệm. Hard-delete (service+folder+const api-endpoints REALTIME+service-costs entry+nginx+docs) làm sau khi confirm dormant chắc; vỡ thì `POST /resume` tức thì.

<!-- audit gốc -->

User OK audit decommission để tiết kiệm. Workflow 7-agent adversarial. **Verdict: CHƯA an toàn xóa (~90%) — đính chính: service KHÔNG idle.**

- **ĐANG CHẠY THẬT**: `/api/realtime/pool-status` = pool **5 account / 14 pages / ~46h uptime**, all wsReadyState:1. Health `/status connected:false` mà phiên trước tưởng "idle" là endpoint LEGACY single-client — SAI. Live probe: `/api/realtime/livestream-conversations` direct = **200, 5.6MB**; qua worker→fallback = **404**.
- **Sole writer/server** `livestream_conversations` + `conversation_labels` + `inbox_groups` (render.com/realtime.js = 0 route các bảng này). `pending_customers` thì **redundant** (fallback có WS writer riêng; badge orders-report đọc qua fallback OK → KHÔNG phụ thuộc n2store-realtime).
- **Frontend Web 1.0 đã neuter gần hết**: inbox-data.js `fetchLivestreamFromServer/loadGroupsFromServer/syncLabelsFromServer/markRepliedOnServer/fetchPendingFromServer` = early-return/no-op. Consumer còn sót fail-silent/user-trigger (inbox-chat toggle livestream đã 404 sẵn, `.catch` nuốt; 3 direct mark-replied secondary).
- **DB**: mọi bảng nằm trên `n2store_chat` (chatDb, chung fallback) → xóa service KHÔNG mất rows, chỉ mất write+serve path.

→ **KHÔNG xóa ngay.** Retire an toàn cần: (A) port writer+routes livestream/labels sang render.com/fallback (giữ feature), HOẶC (B) confirm tab Livestream/labels-from-server dormant thật rồi bỏ write path. Cosmetic: dọn 3 direct mark-replied. Tiết kiệm ~$7/mo CHỈ sau retire. Web 2.0 independence KHÔNG phụ thuộc việc này (đã xong).

### [web2][realtime] Stage 3 HỦY-XÓA — n2store-realtime là service WEB 1.0, KHÔNG xóa ⚠️

User OK "làm Stage 3" (retire n2store-realtime) NHƯNG sweep trước khi xóa phát hiện premise SAI: `n2store-realtime` **KHÔNG phải broker Web 2.0 cũ** — nó là **service realtime lớp WEB 1.0** (docs RENDER_SERVERS_GUIDE + `shared/universal/api-endpoints.js REALTIME` import bởi orders-report api-config; mô tả "Web 1.0 inbox WS — pending_customers/livestream/labels"). Bằng chứng routing: worker `/ws/pancake`→pancake.vn thẳng; `/api/realtime/*`→**n2store-fallback** (không phải n2store-realtime). Health: HTTP 200 nhưng IDLE (`connected:false, no_ws, pageCount:0`) — chủ yếu vì consumer chính (Web2Realtime proxy) vừa rời đi.

→ **KHÔNG xóa** (xóa = rủi ro vỡ feature Web 1.0). **Web 2.0 đã 0 code-ref tới n2store-realtime** (decouple xong Stage 1+2) → độc lập ĐÃ ĐẠT mà không cần xóa service. Giữ folder `n2store-realtime/` + nginx ref (đều là Web 1.0). Việc decommission n2store-realtime (nó đang idle, có thể đã thừa) = **task lớp Web 1.0 RIÊNG**, cần audit xác nhận inbox/orders-report/labels không dùng — KHÔNG gộp vào việc tách Web 2.0.

### [web1⊥web2] Audit độc lập toàn Render + gỡ coupling cuối (v2/customers/:id/orders) ✅

User: "kiểm lại toàn bộ Render từng endpoint xem Web 2.0 / Web 1.0 đã độc lập hoàn toàn chưa". Audit 8-agent (6 map → verify file:line → verdict): **~99% độc lập** — core đã tách sạch (2 pool `chatDb`⟂`web2Db`, 2 SSE hub, 2 wallet EventEmitter, 2 service `n2store-fallback`⟂`web2-api`, worker route đúng origin, flag WEB2_ONLY/DISABLE_WEB2_JOBS gating sạch). Shared-by-design OK: worker chatomni-proxy, `pancake_accounts` (token boot read-only), namespace `/api/v2/*` mixed (worker tách origin). 6 báo cáo nêu ~7 nghi vấn → verify chỉ **1 thật**.

**Vi phạm thật DUY NHẤT — đã fix (user chọn C):** `render.com/routes/v2/customers.js` route Web 1.0 `GET /api/v2/customers/:id/orders` đọc thẳng `native_orders`+`fast_sale_orders` trên web2Db (cross-pool). Kiểm consumer: **KHÔNG còn frontend live nào gọi** (web2/customer-wallet + web2-customer-detail-modal dùng `/api/web2/customers/by-phone/:phone/orders`; pbh-app.js dùng `/api/web2/customer-orders` — ref `/api/v2/...` chỉ là comment stale; chỉ pbh-qa-test còn gọi). → **Xóa hẳn handler** (doc+body) khỏi v2/customers.js → file Web 1.0 hết đụng web2Db. Repoint pbh-qa-test sang `/api/web2/customer-orders/<phone>` (shape orders[]/totals). node --check pass; grep v2 core (customers/wallets/tickets/analytics) = 0 ref web2.

**Verdict: Web 2.0 ⊥ Web 1.0 độc lập HOÀN TOÀN trên Render** (sau fix này). Resolved kèm: Web2Realtime→web2-realtime, autofb gỡ, backend tách process.

### [web2][realtime] Stage 2 — repoint Web2Realtime sang web2-realtime + unread fetch Pancake trực tiếp (0 Web 1.0) ✅

Sau Stage 1 (broker đã fold + verify WS OPEN), repoint client + bỏ MỌI call Web 1.0:

- [web2-realtime.js](web2/shared/web2-realtime.js): `PROXY_WS_URL`/`PROXY_HTTP_URL` → `WEB2_CONFIG.REALTIME` (= web2-realtime, KHÔNG còn n2store-realtime). `start()` đơn → bọc accounts[] gọi `web2-realtime/api/realtime/start-multi` (hết `/api/realtime/start` ở fallback Web 1.0).
- `fetchPendingCustomers()`: **viết lại** — unread inbox ban đầu = fetch Pancake TRỰC TIẾP qua `Web2Chat.fetchConversationsByPage` (quét trang có page-token, lọc `unread_count>0`, map shape badge). KHÔNG còn `${WORKER_BASE}/api/realtime/pending-customers` (Web 1.0 table). `markReplied()` → **local no-op**.
- [web2-new-msg-badge.js](web2/shared/web2-new-msg-badge.js): **bỏ poll reconcile 5 phút** (no-poller: fetch 1 lần init, live = WS). Bump native-orders `?v=20260616ws2`.

Verify: node --check pass; browser localhost confirm `WEB2_CONFIG.REALTIME=web2-realtime.onrender.com`; Stage 1 broker WS OPEN. E2e badge cần web2-auth (verify live). **Còn Stage 3**: retire n2store-realtime (cần OK).

### [web2][realtime] Stage 1 — fold Pancake browser-WS broker vào web2-realtime (bỏ lệ thuộc Web 1.0) ✅

User chọn **Y** + insight quan trọng: KHÔNG cần bảng `pending_customers` — unread ban đầu = fetch Pancake 1 lần ở browser, live = WS + SSE. Rà soát phát hiện `Web2Realtime` (engine badge tin-mới native-orders) đang xài **100% hạ tầng Web 1.0/project cũ**: `fetchPendingCustomers`/`markReplied` → n2store-fallback (bảng Web 1.0); `start-multi`+proxy WS → n2store-realtime (broker project cũ). Vi phạm Web1⊥Web2.

**Stage 1 (backend, additive — KHÔNG đụng luồng comments→SSE):** thêm vào [live-chat/server/server.js](live-chat/server/server.js) (= service `web2-realtime`):

- Browser-facing `WebSocket.Server` gắn vào http server sẵn có + `broadcastToBrowsers(type,payload)` (dedup 30s) + ping keep-alive.
- "Tee" `pages:new_message` + `pages:update_conversation` (chỉ inbox, không livestream) sang browser — thêm CẠNH `forwardToFallback`, không sửa dòng cũ.
- `POST /api/realtime/start-multi` dùng LẠI `startClient` + `clients` Map sẵn có (1 kết nối/account, reuse nếu đã connect — KHÔNG double-connect). KHÔNG có pending_customers.

Reuse pool sẵn có nên KHÔNG mở kết nối Pancake trùng → relay comments→SSE an toàn. node --check pass. Deploy web2-realtime (starter 512Mi, I/O-bound). **CHƯA repoint client** (vẫn dùng broker cũ → 0 gián đoạn). Stage 2: repoint web2-realtime.js + badge fetch unread trực tiếp Pancake. Stage 3: retire n2store-realtime (cần OK).

### [web2][fix] Sửa 2 bug native-orders: icon columns-3 + WS proxy sai broker ✅

User báo console native-orders. 2 bug:

1. **`columns-3` icon not found** (Lucide 0.294.0): icon `columns-3` được thêm ở bản Lucide mới hơn → 0.294.0 không có (lỗi fire 4× do `createIcons()` quét lại cả page). Fix: `columns-3` → `columns` (valid 0.294.0, đang dùng OK ở product-warehouse/inventory-tracking/supplier-debt). Sửa `native-orders/index.html` (1) + `issue-tracking/index.html` (4 — Web 1.0, cùng bug, cosmetic).

2. **WS `wss://web2-realtime.onrender.com/` fail lặp vô hạn — REGRESSION từ session trước**: session "đưa URL về đúng project web2.0" đã repoint sai `web2-realtime.js` proxy từ `n2store-realtime` → `web2-realtime`. NHƯNG: `n2store-realtime` (folder `n2store-realtime/server.js`) = **BROKER** chạy WS server cho browser + `/api/realtime/start-multi` + giữ WS tới Pancake per-account; còn `web2-realtime` (`live-chat/server`) = relay Pancake→SSE, **KHÔNG có browser WS server** → connect `/` fail 1006. Verify broker `n2store-realtime.onrender.com` HTTP 200 + start-multi tồn tại (400 validate). **Fix: revert `PROXY_WS_URL`/`PROXY_HTTP_URL` → `n2store-realtime.onrender.com`** (hardcode + comment rõ 2 service khác nhau). Bump native-orders `web2-realtime.js?v=20260616ws`. ⚠ Bài học: `web2-realtime` (relay) ≠ `n2store-realtime` (broker) — đừng gộp; broker chưa migrate sang project web2.0 nhưng vẫn sống.

### [web1][cleanup] Gỡ HẲN autofb.pro khỏi toàn project (shop không xài nữa) ✅

User xác nhận "bỏ hẳn autofb, shop không xài autofb.pro nữa". Gỡ trọn bộ tính năng autofb (mua dịch vụ FB qua reseller autofb.pro + ví) khỏi cả Web 1.0 lẫn worker:

- **Xóa file**: trang `facebook-services/` (Dịch Vụ Facebook — storefront autofb), `render.com/routes/autofb.js`, `cloudflare-worker/modules/handlers/autofb-handler.js`, `scripts/autofb-login.js`.
- **Worker**: gỡ 7 route `AUTOFB_*` + `AUTOFB_RENDER` ([routes.js](cloudflare-worker/modules/config/routes.js)) + import handler + 8 dispatch case ([worker.js](cloudflare-worker/worker.js)).
- **Render**: gỡ mount `/api/autofb` ([server.js](render.com/server.js)) + dep `tesseract.js` (chỉ autofb dùng) khỏi package.json + regenerate package-lock (npm install --package-lock-only) → lock khớp.
- **Frontend khác**: gỡ entry nav "Dịch Vụ Facebook" ([navigation-modern.js](shared/js/navigation-modern.js)), block `AutoFB` API-docs ([render-data-manager](render-data-manager/js/main.js)), card + live-fetch + warning + CSS autofb ([service-costs](service-costs/js/service-costs.js)), dòng smoke-test.
- Verify: node --check 7 file pass, package.json JSON hợp lệ, grep repo-wide **0 ref autofb/facebook-services** còn lại. tesseract đã out khỏi lock.
- ⚠ Worker (Cloudflare) deploy riêng — route autofb cũ trong worker đã deploy là **vô hại** (không trang nào gọi nữa); sẽ sạch ở lần deploy worker kế.

### [orders-report] Thanh "Khách chưa trả lời" giữa bộ lọc và bảng (đếm + tên + báo động >30') ✅

**User:** "thêm 1 bộ lọc tin nhắn mới nằm giữa bảng và bộ lọc, hiển thị số khách có tin nhắn mới, từng ô nhỏ hiển thị tên khách, báo động khách đã nhắn 30p mà chưa trả lời."

**Làm:** Thanh ngang mới chèn giữa filter-section và `#tableContainer` ([tab1-orders.html](orders-report/tab1-orders.html)), tái dụng pattern KPI stats strip.

- **JS** [tab1-unread-messages-strip.js](orders-report/js/tab1/tab1-unread-messages-strip.js) (IIFE, `window.UnreadCustomersStrip`): đọc `newMessagesNotifier.getPendingCustomers()` (khách còn trong list = shop CHƯA trả lời), khớp với `window.allData` (đơn chiến dịch) theo PSID→fallback SĐT. Scope theo yêu cầu "trong chiến dịch + chia cho nhân viên đó": NV thường (có `_findCurrentUserEmployeeRange`) chỉ thấy khách có đơn STT thuộc range của họ; admin/chủ/`my-authenticated` thấy tất cả + nhãn NV phụ trách (`window.employeeRanges` + map STT). Mỗi ô: **tên · thời gian chờ**; click → `showConversationPicker(orderId,pageId,psid)` mở chat trả lời. Sort: trễ trước, chờ lâu nhất lên đầu. Cap 50 ô + chip "+N nữa". Báo động khách chờ ≥30' (`STALE_MIN`): ô đỏ tĩnh + badge header "N trễ >30'" nhấp nháy (pulse dồn vào 1 badge, không để hàng chục ô nháy). Realtime: nghe `n2s:pendingCustomersChanged` (debounce 250ms) + tick 30s cập nhật thời gian chờ/cờ trễ.
- **CSS** [tab1-unread-messages-strip.css](orders-report/css/tab1-unread-messages-strip.css): strip amber, `:empty`/non-`.has-items` → ẩn, cell bo tròn, `.ucs-cell--late` đỏ, `.ucs-head__late` pulse, `prefers-reduced-motion` tắt animation.
- **Notifier** [new-messages-notifier.js](orders-report/js/chat/new-messages-notifier.js): thêm `window.dispatchEvent(new CustomEvent('n2s:pendingCustomersChanged'))` cuối `reapply()` (chokepoint mọi thay đổi pending) để consumer ngoài tự cập nhật. Wire CSS link + container `#unreadCustomersStrip` + script `?v=20260616a` trong tab1-orders.html.

**Verify (Playwright localhost:8099, login admin, chiến dịch T6, 531 đơn, 153 pending):** strip auto-render qua event (không gọi render tay) — 50 ô + "+103 nữa", header "Chưa trả lời 153 · 153 trễ >30'"; inject 2 khách (2'→thường, 40'→đỏ) đúng phân loại + sort; click ô → chat modal mở đúng khách ("Na Na Na Na"); không có lỗi console từ strip. `node --check` PASS.

**Status:** ✅ code + browser test OK. Web 1.0 (orders-report) — không đụng web2.

## 2026-06-15

### [web2][render] web2-api OOM 512Mi — bound sharp native memory + RSS log ✅ (heap cap + plan = chờ user)

User forward mail Render "web2-api exceeded its memory limit". Chẩn đoán qua Render API: service `web2-api` plan **starter = 512Mi**, `NODE_OPTIONS` CHƯA set, `oomKilled memoryLimit 512Mi` nhiều lần (13:01, 13:32, ~16:25). Sau split 2026-06-14 toàn bộ backend Web 2.0 (routes + cron services + xử lý ảnh) dồn lên 1 box 512Mi.

Nguyên nhân: (1) V8 heap không cap → phình quá container trước khi GC → OOM-kill; (2) `sharp` (image-proxy/autofb/web-warehouse) chạy KHÔNG set `cache`/`concurrency` → libvips giữ hàng trăm MB ngoài heap.

**Đã fix in-repo** ([render.com/server.js](render.com/server.js) đầu file): `sharp.cache(false)` + `sharp.concurrency(1)` (bound native memory) + log `[MEM]` RSS mỗi 60s khi >380MB (phân biệt leak vs spike). node --check pass.

**Follow-up (user "làm cả 2"):**

1. **tesseract lazy + autofb không mount trên web2-api**: `tesseract.js` chuyển `require` vào trong `solveCaptchaWithTesseract` ([autofb.js](render.com/routes/autofb.js)) — chỉ nạp khi thật giải captcha. `server.js` mount autofb sau `if (!WEB2_ONLY)` → box Web 2.0 KHÔNG nạp autofb/tesseract/sharp-autofb. Giảm RAM nền (Web 1.0/fallback vẫn dùng autofb bình thường).
2. **Audit `SELECT *` route** (nghi can spike): KIỂM kỹ multi-line → **gần như TẤT CẢ đã phân trang sẵn** (`LIMIT/OFFSET`): products, variants, web2_records (generic + dedicated-entity), returns, customer-intents, balance-history, wallets (cap 1000), pending (LIMIT 200/500). Grep ban đầu báo nhầm vì `LIMIT` nằm dòng kế. **Ngoại lệ DUY NHẤT**: `web2-supplier-wallet /state` load full `web2_supplier_ledger` (cần đủ row để tính số dư + lịch sử GD per NCC — **money code**) → **KHÔNG cap** (cap = sai số dư). Khi ledger lớn mới paginate display + tính balance bằng SQL aggregate (cần phối hợp client). ⇒ Driver OOM thực = #1 structural + #2 no-heap-cap + #3 sharp (đã fix), KHÔNG phải unbounded list query.

**User duyệt "cap heap + nâng plan 2GB" (15/06) → ĐÃ áp:** (a) plan `starter→standard` (512Mi→**2GB**) qua `PATCH /v1/services/{id} {serviceDetails:{plan:standard}}`; (b) env `NODE_OPTIONS=--max-old-space-size=1536` (heap 1.5GB, chừa ~512MB native trên box 2GB) qua `PUT .../env-vars/NODE_OPTIONS`; (c) `POST .../deploys` (dep-d8o32ournols739t2hmg) áp cả plan+env+commit sharp. web2-api giờ standard 2GB → hết OOM. Theo dõi log `[MEM]` xác nhận.

### [web2][worker] Hợp nhất nguồn base-URL + fix 2 gap (livestream 404 worker, ck-dashboard 401) ✅

User: "WEB 2.0: tất cả nguồn dữ liệu… đồng nhất về 1 nguồn dùng chung… 1 khối thống nhất". Audit 6 mảng (base-URL, auth header, SSE/realtime, DB pool, worker routing, Pancake/Zalo) bằng 6 agent song song → SSE/DB-pool/Pancake/Zalo ĐÃ single-source; còn 3 việc:

**1. Nguồn base-URL duy nhất (`web2-auth.js`)**: trước đây KHÔNG có config chung — 61 file hardcode `chatomni-proxy…` / `web2-api-kv04…` rải rác; `window.API_CONFIG` chỉ tồn tại trên trang live-chat. Thêm block `WEB2_CONFIG` (WORKER_URL + WEB2_API + REALTIME + REALTIME_SSE + `apiUrl()`) + merge-safe vào `window.API_CONFIG` ở ĐẦU [web2-auth.js](web2/shared/web2-auth.js) — file shared load **sớm nhất** trên mọi trang (web2/\*, native-orders, so-order; live-chat đã có api-config.js riêng) → mọi script sau đọc được, KHÔNG race, KHÔNG thêm script tag. Convert **42 dòng** hardcode bare-host (`const/let/var`, `return`, object-prop) sang `(window.API_CONFIG && window.API_CONFIG.WORKER_URL) || 'literal'` (literal giữ làm fallback resilience). Đổi URL backend Web 2.0 từ nay → CHỈ sửa `web2-auth.js`. Verify live: `window.API_CONFIG`/`WEB2_CONFIG` resolve đúng trên web2/products, 0 console error ck-dashboard.

**2. Worker `/api/livestream*` 404 gap**: `matchRoute` KHÔNG có entry cho `/api/livestream/` + `/api/livestream-images/` → rơi vào catch-all `TPOS_GENERIC` → tomato.tpos.vn (404 nếu gọi qua worker). Thêm route `WEB2_LIVESTREAM` + `WEB2_LIVESTREAM_IMAGES` ([routes.js](cloudflare-worker/modules/config/routes.js) + [worker.js](cloudflare-worker/worker.js) → `handleCustomer360Proxy` → web2-api). Giờ MỌI path Web 2.0 match tường minh TRƯỚC `TPOS_GENERIC` → Web 2.0 không bao giờ chạm catch-all TPOS.

**3. ck-dashboard 401 gap**: POST `/api/web2/customer-intents/{id}/done` thiếu `x-web2-token` (chỉ `credentials:include`) → 401 dưới `WEB2_AUTH_ENFORCE=1`. Thêm `...Web2Auth.authHeaders()` ([ck-dashboard-app.js](web2/ck-dashboard/js/ck-dashboard-app.js)).

⚠ **TPOS_GENERIC GIỮ NGUYÊN** (user hỏi "xóa đi"): đây là catch-all của worker `chatomni-proxy` (proxy **chung cả 2 layer**) → tomato.tpos.vn — **Web 1.0 (orders-report/inbox) vẫn dùng TPOS thật** (OData, /api/Product, /api/SaleOnline_Order…). Xóa = vỡ Web 1.0. Đúng hướng: ĐÃ match hết path Web 2.0 trước catch-all, KHÔNG xóa catch-all.

**4. Server URL trỏ đúng project Render `web2.0n2store`** (user hỏi "url server web 2.0 đã nằm đúng render web2.0 chưa?"): audit mọi host `onrender.com` trong Web 2.0 frontend → `web2-api-kv04` (×24) + `web2-realtime` (×4) ĐÚNG project; phát hiện 2 ref SAI trỏ project Web 1.0:

- [web2-realtime.js](web2/shared/web2-realtime.js) PROXY_WS_URL/PROXY_HTTP_URL = `n2store-realtime.onrender.com` (Web1 inbox) → SAI: relay Pancake Web 2.0 = service `web2-realtime` (xác nhận `live-chat/server/render.yaml` name=web2-realtime + pancake-state.js). Fix: đọc `window.WEB2_CONFIG.REALTIME` → `web2-realtime.onrender.com` (bump native-orders `?v=20260615rt`).
- [pbh-realtime.js](web2/shared/pbh-realtime.js) `wss://n2store-fallback.onrender.com` → dead code (deprecated 3W4, 0 script tag thật load, `PbhRealtime.subscribe` không nơi nào gọi, đã thay bằng Web2SSE) → **XÓA file**.
- Còn 1 comment lịch sử (live-realtime.js "WS … đã tắt") — không phải URL active, giữ. Worker `FALLBACK_ORIGIN=n2store-fallback` ĐÚNG (path Web 1.0 trên worker chung).

Verify: node --check 39 file pass; browser smoke (overview→products→ck-dashboard) 0 console error.

### [web2] Xóa sạch chữ "TPOS" trong comment/doc Web 2.0 (reword giữ nghĩa) ✅

User: "xóa sạch mọi chữ tpos trong comment". Reword MỌI comment + log-string + doc-prose chứa "TPOS"/"tpos" trong Web 2.0 (web2/, live-chat/, native-orders/) → bỏ chữ TPOS, giữ nguyên ý. ~28 occurrence / 19 file:

- Comment .js: live-realtime (SSE cũ/legacy/transport cũ), web2-products-print (×5: "KHÔNG gọi API ngoài"/"render local" thay "tpos.vn"), live-init (×4), facebook-routes (×2), comments-mobile (×2), pancake-state/pancake-api/live-customer-panel/live-comment-list/live-api/api-config/web2-customer-wallet-app (×1).
- HTML comment ×4 (customers/customer-wallet/balance-history/supplier-debt): "token-manager.js gỡ … không dùng token bearer cũ".
- overview doc prose ×5: "hệ POS cũ"/"service relay cũ" thay TPOS.
- Bump version string `api-config.js?v=…tpos` → `?v=20260615fix`.

⚠ GIỮ NGUYÊN: bảng Web 1.0 (`customers`/`invoice_status`/`return_orders`/`odata-tpos-shadow` — TPOS hợp lệ ở Web 1.0) + code identifier chứa chuỗi "tPos" KHÔNG phải TPOS (`getPostIds`, `boostPost`, `parentPostIds/List/Section`, `selectPost`, `getCurrentPosition`). Verify: **ZERO TPOS thật còn trong Web 2.0**; node --check 15 JS pass. Comment-only → không cần bump version (behavior identical). Workflow 19-agent rate-limited → fallback inline node literal-replace.

### [web2][live-chat] Fix SĐT bị fb_id ghi đè + health-monitor 404 spam + dọn TPOS leftover ✅

User: "lưu SĐT xong lưu địa chỉ thì SĐT bị đầy về 1254523635???" + "chatomni-proxy.../ 404 trang nào cũng console" + "xóa tất cả tpos bên web 2.0".

**Bug 1 — SĐT → đuôi fb_id (data corruption)**: `Web2CustomerStore.normPhone` có `if (s.length>10) s=s.slice(-10)` → fb_id `fb_24084091254523635` (17 số) → `1254523635` (SĐT giả). Caches reset (SSE web2:customers) → render fallback `partner.Phone||kho.phone||comment.phone` đọc giá trị nhiễm → hiện `1254523635`. Fix:

- [web2-customer-store.js](web2/shared/web2-customer-store.js) `normPhone`: **bỏ `slice(-10)`** → fb_id giữ 17 số → `isValidPhone(/^0\d{9}$/)` loại.
- [live-comment-list.js](live-chat/js/live/live-comment-list.js): render (`_rowSig` + row builder) **chỉ chọn SĐT hợp lệ đầu tiên** (`isValidPhone` gate) → ẩn giá trị nhiễm. `saveInlinePhone`: validate 10 số TRƯỚC khi lưu + `run()` throw khi `savePartnerData` trả `{ok:false}` (409 SĐT trùng KH / 400) → optimistic rollback + báo lỗi. `saveInlineAddress` throw tương tự.

**Bug 2 — 404 spam mọi trang**: [service-health-monitor.js](shared/js/service-health-monitor.js) `checkWorker` probe `GET /` → worker 404 tại edge → browser **luôn log** `GET chatomni-proxy/ 404` mỗi 25s mọi trang. Fix: probe **`OPTIONS /`** → worker trả **204** (CORS preflight, edge, không đụng Render) = success → hết log. Bump loader 3 nơi (auth-manager/navigation-modern/web2-sidebar).

**Dọn TPOS leftover Web 2.0** (đã gỡ API 2026-06-14, còn remnant): gỡ nút "Mở trên Live"→`tomato.live.vn` ([live-customer-panel.js](live-chat/js/live/live-customer-panel.js)); gỡ `liveBaseUrl` (tomato.live.vn forwarder, dead — 0 nơi dùng) [live-state.js](live-chat/js/live/live-state.js); sửa doc overview (route `web2-customer-tpos` đã gỡ; cột `tpos_id/tpos_data` vestigial). ⚠ Backend web2 KHÔNG gọi TPOS; cột DB `tpos_id/tpos_data` CHƯA drop (chờ user xác nhận — CLAUDE.md từng ghi "giữ"). Bump `?v=20260615fix`. Frontend-only.

### [web2][shared][jt-tracking] Retrofit optimistic UI — handler còn await trần → Web2Optimistic ✅

User hỏi "optimistic UI đã có ở tất cả trang chưa? (tạo/nặng→spinner chống bấm trùng, xoá→biến mất ngay rồi rollback)". Audit: helper load 35/40 trang, dùng thật ~17 file; money/destructive cố ý giữ await. Sweep handler còn await trần (non-money):

- **page-builder.js `removeRecord`** (generic Web2Page — delivery-zone + product-category): sau confirm → row **biến mất NGAY** (splice STATE.records + renderRows/Counters/Pagination) + rollback khôi phục đúng vị trí nếu lỗi. `saveModal` (create/update) **giữ await + double-submit guard** (đúng pattern "tạo/nặng thì chờ"). → cả 2 trang generic tự hưởng.
- **jt-tracking `rowAction`**: `approve`/`unapprove` (duyệt) → UI-first (`row.approved_at` đổi NGAY → mờ row + tag "tự xoá 7 ngày") + rollback; SSE `web2:jt-tracking` reload authoritative. `refresh` (tra cứu J&T server-side, NẶNG) **giữ await** + reload.
- **payment-confirm**: đã RETIRED (redirect → ck-dashboard) → bỏ qua. Money pages (customer-wallet, fastsaleorder-\*, purchase-refund, supplier-debt) giữ await theo ngoại lệ. bc-tag jt đã fire-and-forget (giữ).

Browser-smoke: jt-tracking + delivery-zone — Web2Optimistic.run=function, page render, 0 page error. Bump `jt-tracking-app.js?v=20260615opt`, `page-builder.js?v=20260615opt`. Frontend-only.

### [web2][shared][P5] colorShortMap về Web2VariantsCache (memoize); Zalo đã shared ✅

`colorShortMap` (map tên màu ASCII → shortCode locked, dùng sinh mã SP) build **trùng logic** ở 2 nơi: [web2-products-app.js](web2/products/js/web2-products-app.js) (`getColorShortMap`+`_colorShortMapCache`) + [so-order-app.js](so-order/js/so-order-app.js) `_assignKhoCodes` (inline). Gom về [`Web2VariantsCache.getColorShortMap()`](web2/shared/web2-variants-cache.js) — memoize + auto-invalidate khi data variant đổi (`_loadList`). 2 trang delegate (giữ fallback inline nếu cache cũ chưa có method). Cần `Web2ProductCode.toAsciiUpper`.

⚠ Smoke bắt bug: quên thêm `getColorShortMap` vào export object → fixed. Browser-verify products: function OK, 10 keys, memoized (same ref), sample mã màu thật. Bump variants-cache `?v=20260615store2`, products-app/so-order-app `?v=20260615store`.

**Zalo**: audit đã 95% compliant (mọi trang qua `Web2Zalo`/`ZaloApi`, không gọi `/api/web2-zalo` trực tiếp). `_fetch` dup giữa facade `web2-zalo.js` (load standalone cho sendZNS) vs engine `web2-zalo-api.js` (load với chat engine) — **load khác scenario → giữ riêng** (ép couple làm facade nặng thêm). KHÔNG đổi.

**Cache products/variants underused** (trang tự fetch list thay cache) = perf/kiến trúc, defer (không phải dup nguy hiểm). Frontend-only.

### [web2][live-chat][P4] Pancake live-chat — centralize WORKER_URL; token/search ĐÃ trên Web2Chat ✅

Audit P4 (token-manager dup, conv/tags) dùng **code cũ** — thực tế live-chat Pancake đã consolidated ~90% (2026-06-13): `PancakeAPI.getToken/getPageAccessToken` → `Web2Chat.getJwt/getPageAccessToken`, `searchConversations` → `Web2Chat.searchConversations`, URL build → `API_CONFIG.buildUrl.*` (centralized). `pancake-token-manager.js` **load-bearing** (account-mgmt UI settings-manager + live-source JWT chọn account FB-live + pancake-init) → **KHÔNG xoá được** (audit recommend sai).

**Làm (an toàn)**: centralize 3 base-URL hardcode → `API_CONFIG.WORKER_URL` (fallback literal):

- [pancake-state.js](live-chat/js/pancake/pancake-state.js) `proxyBaseUrl`, [inventory-panel.js](live-chat/js/pancake/inventory-panel.js) `PROXY`/`API`. api-config (770) load trước pancake-state (833) → có hiệu lực.
- Bump `?v=20260615store`. Browser-smoke live-chat: `Web2CustomerStore`/`LiveStatus` delegate OK, `proxyBaseUrl` resolved, `pancakeTokenManager` còn, **0 page error**.

**Verify live P1–P4** (browser, clone session): live-chat (store=object, isValidPhone clone=true/fb_id=false, LiveStatus delegates), balance-history (PartnerCustomerApi.statusClass===store, suppliersCache.normalize=fn, manualDeposit ok), customer-wallet (Web2WalletApi moved → getWallet/deposit ok). Frontend-only.

### [web2][shared][P3] Ví KH — promote Web2WalletApi sang shared; Ví NCC giữ nguyên (money) ✅

**Ví khách**: `Web2WalletApi` (full client: getWallet/getWalletsByPhones/getTransactions/deposit/withdraw, auth x-web2-token, DIRECT_BASE fallback) đang nằm page-local `customer-wallet/js/`. `git mv` → [`web2/shared/web2-wallet-api.js`](web2/shared/web2-wallet-api.js) = NGUỒN CHUNG để mọi trang tham chiếu (đọc full ví / nạp-trừ) thay vì reimplement. Update include customer-wallet → `../shared/`. Pill nhẹ [`Web2WalletBalance`](web2/shared/web2-wallet-balance.js)`._fetchBalance` reuse `Web2WalletApi.getWallet` khi có (1 nguồn đọc `/by-phone`); vẫn độc lập (self-fetch) trên trang không load client → embed rộng được. Sửa note header "KHÔNG cần auth" (stale — mutation cần token). Bump `?v=20260615store`.

**Ví NCC**: ledger ở [`supplier-wallet-storage.js`](web2/supplier-wallet/js/supplier-wallet-storage.js) (`addTransaction` server-first await + idempotency `tx_id`, `Sync.init` /state, `applyDeposits` SePay) — **money-op nhạy cảm, đã centralized cho trang ví NCC**. supplier-debt đọc `/state` chỉ để hiển thị (read) + có /suppliers write riêng. Trích tách transport sẽ rủi ro vỡ idempotency/rollback → **giữ nguyên** (đúng nguyên tắc money-op await+rollback). Frontend-only.

### [web2][shared][P2] Kho NCC — adopt directory chung Web2SuppliersCache ✅

Audit kho NCC: **đã shared khá tốt** qua [`Web2SuppliersCache`](web2/shared/web2-suppliers-cache.js) (`/api/web2-supplier-wallet/suppliers` = web2_supplier_meta master). 3 "fetch `/state` trùng" mà audit nêu thực ra là **divergence hợp lệ** — supplier-debt/supplier-wallet cần `/state` cho ledger (số dư), normalize khác nhau vì khác mục đích (lookup-key bỏ dấu vs SePay-content word-match alnum+space vs deeplink NFC giữ dấu). Gom cứng sẽ vỡ matching/mất balance label → KHÔNG ép.

**Làm (an toàn, đúng)**:

- Expose `Web2SuppliersCache.normalize(name)` (public) — 1 hàm chuẩn hoá tên NCC dùng chung.
- [web2-manual-deposit.js](web2/balance-history/js/web2-manual-deposit.js) `loadNccList`: TÊN NCC lấy từ directory chung `Web2SuppliersCache.getNames()` (master, gồm NCC chưa có ví) ∪ keys có số dư; balance vẫn từ `/state`. → 1 nguồn tên NCC, deposit được cho cả NCC mới. Load `web2-suppliers-cache.js` trên balance-history. Fallback giữ hành vi cũ nếu cache absent.
- Bump `web2-manual-deposit.js?v=20260615store`. Frontend-only.

### [web2][shared][P1] Gom kho KH về 1 nguồn — Web2CustomerStore ✅

User: "kiểm tra tất cả web 2 xem phần nào dùng chung thì bỏ vào shared… ví dụ pancake, zalo, kho SP, kho KH, kho NCC, ví KH, ví NCC". Audit (6-agent song song) → kế hoạch 5 cụm P1–P5. **P1 = Kho KH** (giá trị cao nhất + đang có bug thật).

**Vấn đề**: logic truy cập `web2_customers` rải 4 chỗ với **3 bộ normalize status** khác nhau (`Web2CustomerLookup.STATUS_TEXT`, `customers-app.STATUS`, `LiveStatus.normalize`) + **filter SĐT lỏng** (`web2-customer-lookup` `len>=3`, `live-customer-sync` `len>=9`) → **fb_id (`fb_2408…`)/số rác lọt vào batch-by-phone** → khớp sai KH.

**Fix** — tạo NGUỒN DUY NHẤT [web2-customer-store.js](web2/shared/web2-customer-store.js) (`window.Web2CustomerStore`): validate SĐT `/^0\d{9}$/`, 1 bộ status (text/class/normalize, gồm tier Thân thiết/Khách sỉ), carrier, auth `x-web2-token` cho mọi write, batch chunk chống N+1. API: `batchByPhones/batchByFbIds/getByFbId/getByPhone/enrich/list/listByPhones` (read) + `patch/updateStatus/patchByFbId/upsert/harvestComments` (write) + `subscribe(web2:customers)`.

4 module cũ **delegate** (giữ nguyên public interface, không rewire call-site):

- [web2-customer-lookup.js](web2/shared/web2-customer-lookup.js): rewrite thành shim mỏng → `PartnerCustomerApi`/`Web2CustomerLookup` trỏ store (bỏ ~150 dòng dup, **fix filter `>=3`**).
- [live-status.js](live-chat/js/shared/live-status.js): `normalize` → `Web2CustomerStore.normalize` (fallback inline).
- [live-customer-sync.js](live-chat/js/shared/live-customer-sync.js): `enrich`→store.enrich (**fix `>=9`**), harvest POST→store.harvestComments (auth).
- [live-api.js](live-chat/js/live/live-api.js): `getPartnerInfo/Batch`, `_patchWarehouseByFb`, `updatePartnerStatus`, `savePartnerData` upsert → store (giữ shape partner-like + fallback).
- [web2-partner-enricher.js] tự hưởng lợi (qua `PartnerCustomerApi.listByPhones`).

Include `web2-customer-store.js?v=20260615store` TRƯỚC consumer ở: live-chat/index.html, comments-mobile.html, balance-history, customer-wallet. Bump live-status/live-customer-sync/live-api `?v=20260615store`. Verified node harness: reject `fb_2408…`/17-số, accept `0123456788`, status/normalize/shim đúng. Frontend-only (không deploy). Lưu MEMORY [[reference_web2_customer_store]].

### [web2][AUDIT] Quét + fix TOÀN BỘ web2 write thiếu x-web2-token (WEB2_AUTH_ENFORCE 401) ✅

User: "kiểm lại toàn bộ /api/web2 còn thiếu x-web2-token không". Workflow audit (5-agent) → **37 violation / 14 file**; workflow remediation (6-agent song song) fix → **~18 file**:

- **Wrapper central** (1 sửa cover nhiều): `web2-products-api.js` + `web2-variants-api.js` (`_fetchJson`), `returns-api.js` (`_json` + sửa bug spread-order).
- **Reuse helper sẵn có**: `web2-msg-template.js` (4 — claim/result/cancel/create, double-send guard), `web2-chat-client.js` (enrich-fb), `pancake-api.js` (batch-summary), `live-livestream-snap.js` (capture-lock ×2), `web2-wallet-api.js` (batch-full).
- **Thêm helper `_w2Auth` nhỏ**: `web2-customer-detail-modal.js` (PATCH KH), `web2-qr-modal.js` (×3 QR ví), `web2-customer-lookup.js`, `web2-wallet-balance.js`, `web2-printer.js` (×3 CRUD), `web2-products-print.js` (mark-printed), `debt-manager.js`, `live-comment-list.js` (batch-by-fbid), `native-orders-app.js` (merge + batch-by-fbid), `so-order-app.js` (confirm-purchase-partial, giữ credentials:omit).
- Nguồn token: `Web2Auth.authHeaders()` / fallback localStorage `web2_auth.token`. Bump tất cả JS đã sửa `?v=20260615auth`. Pattern + quy tắc lưu MEMORY [[reference_web2_write_auth_header]]. ⚠ deploy không cần (frontend), nhưng các write giờ qua được khi WEB2_AUTH_ENFORCE=1.

### [live-chat] Fix write KH 401 (thiếu x-web2-token) + SĐT validate 10 số (tránh nhầm fb_id) ✅

User báo `PATCH /api/web2/customers/68048 401` + `POST /upsert 401` khi lưu SĐT/địa chỉ/trạng thái → **gốc thật của "không đổi được"** (WEB2_AUTH_ENFORCE, write thiếu header). [live-api.js](live-chat/js/live/live-api.js): 7 write fetch (`_patchWarehouseByFb` PATCH, `updatePartnerStatus` PATCH, `savePartnerData` upsert, batch...) dùng `_w2AuthHeaders({...})` (gắn `x-web2-token` từ Web2Auth/localStorage web2_auth). + SĐT VN = **đúng 10 số `/^0\d{9}$/`** (tránh nhầm `fb_24084091254523635`): `validPhone()` ở [comments-mobile.js](live-chat/js/live/comments-mobile.js) (enrich filter/whInfo/display/filter-phone) + [live-kho-enricher.js](live-chat/js/live/live-kho-enricher.js) (pendingPhone). Bump `?v=20260615kho2`. → đang audit toàn repo các web2 write khác thiếu auth (workflow).

### [web2] J&T nút tag "XỬ LÝ BC" — icon đổi ngay (lucide) + LƯU DB đồng bộ đa máy ✅

User: (1) "bấm ra hình 3 phải refresh mới ra hình 4" — bấm tag hiện icon `tag` xanh, phải refresh mới thành `badge-check`. (2) "các nút tag pancake này chưa được lưu ở db".

- **Icon không đổi**: `setTagButtons` dùng `querySelector('i')` nhưng lucide đã thay `<i>` bằng `<svg>` (→ null) nên `setAttribute('data-lucide')` vô tác dụng → chỉ class `is-tagged` đổi màu, icon giữ `tag`. Fix [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js): thay HẲN `b.innerHTML='<i data-lucide=…>'` rồi `icons()` → vẽ lại đúng `badge-check`/`tag` ngay (browser-test: `querySelector('i')===null` xác nhận bug; sau fix svg = `lucide-badge-check`).
- **Chưa lưu DB**: trạng thái tag chỉ ở localStorage (device-local). Thêm bảng `web2_jt_bc_tags(phone PK, tagged_at, updated_at)` + `GET /bc-tags` (list SĐT đã gắn) + `POST /bc-tag {phone,tagged}` (upsert/delete + SSE `bc-tag`). Pancake vẫn là nơi áp thẻ thật; DB chỉ mirror để hiện nút nhanh + sync. Client: `markTagged/unmarkTagged` persist khi đổi, `loadBcTags()` nạp từ DB trong `load()` (song song `/list`), SSE `web2:jt-tracking` → reload → đa máy thấy ngay.
- Bump `jt-tracking-app.js?v=20260615bf3`. Backend cần deploy web2-api.

### [web2][live-chat][native-orders] Trạng thái/thông tin KH = 1 NGUỒN CHUNG web2_customers + SSE đồng bộ ✅

User: (1) "Đã tạo đơn" đè trạng thái KH (mobile); (2) live-chat desktop + panel KH đổi trạng thái không lưu; (3) tất cả trạng thái/thông tin KH dùng chung 1 nguồn `web2/customers` (web2_customers), đổi 1 chỗ → SSE → nơi khác tự cập nhật; (4) native-orders cũng tham chiếu kho chung; (5) bỏ nút "Lấy WEB2" (lấy nhầm fb qua SĐT — thừa vì có SSE).

**Điều tra (workflow 5-agent)**: status canonical = `web2_customers.status` (Normal/VIP/Bom/Warning/Danger; Khách sỉ/Thân thiết = cột `tier`). WRITE `PATCH /api/web2/customers/:id {status}` ĐÃ có + đã bắn SSE `web2:customers`. Bug desktop = handler chỉ update `partnerCache`, KHÔNG `customerKhoCache` (mà display ưu tiên đọc) → re-render stale. Mobile = `statusOf` early-return "Đã tạo đơn" đè status.

**Fix**:

- [comments-mobile.js](live-chat/js/live/comments-mobile.js): `statusOf` LUÔN trả status kho; badge "✓ Đã tạo đơn" tách RIÊNG (hiện cả 2). Subscribe `web2:customers` → `refreshWarehouse()` (xoá custMap + re-enrich + render).
- [live-comment-list.js](live-chat/js/live/live-comment-list.js): `selectInlineStatus` đồng bộ `customerKhoCache.status` (apply+rollback+fallback) → đổi trạng thái GIỮ sau re-render.
- [live-init.js](live-chat/js/live/live-init.js): subscribe `web2:customers` → clear `customerKhoCache`+`partnerCache` + `LiveKhoEnricher.reset/scan` + render (đồng bộ chéo tab/máy + panel KH).
- [native-orders-app.js](native-orders/js/native-orders-app.js): **GỠ nút "Lấy WEB2"**; subscribe `web2:customers` → reload (re-enrich) → tự cập nhật khi kho đổi.
- [web2-customers.js](render.com/routes/v2/web2-customers.js): `rowToLite` thêm `status`+`tier` (GET /:phone trả status cho modal/lookup).
- Bump live-chat (`comments-mobile`/`live-comment-list`/`live-init`) + `native-orders-app` `?v=20260615kho`. ⚠ deploy web2-api (rowToLite).

### [orders-report] Cột TIN NHẮN nhận biết tin mới khi mở lại — client fetch list unread Pancake (KHÔNG cron) ✅

**User:** "Bug phải mở client nó mới biết tin mới à? Tắt hết client rồi mở lại muốn nhận biết như Pancake" → "lấy list unread pancake là được" → **"đâu có cần cron → khi vào trang / chọn / đổi chiến dịch → fetch pancake unread cho vào cache rồi cập nhật bảng, xóa cache khi cập nhật khách"**.

**Gap:** cột TIN NHẮN dựa WS realtime ADD `pending_customers`. WS KHÔNG replay event đã miss (restart/token gap/không client) → tin tới lúc offline không vào badge → mở lại không thấy. Pancake luôn biết (giữ unread_count server-side).

**Approach (theo user — CLIENT-side, không poller server):** lần đầu làm server cron (`pancake-unread-discovery.js` + cron 5' + trigger /start) → **user bác "đâu cần cron" → REVERT toàn bộ server-side**, làm thuần frontend fetch trực tiếp Pancake từ browser (đúng triết lý project).

**Fix (frontend, `new-messages-notifier.js` bump `?v=20260615a`):** `discoverUnreadFromPancake()` — duyệt `pdm.pages`, `pdm.fetchConversationsForPage(pageId)` (official v2 + PAT, đã cache, `unread_first`) → lọc `unread_count>0` + INBOX + không shop-sent-last → `onNewConversationEvent({unread_count,phone,...})` (dedupe psid + tôn trọng `_wasRecentlyReplied` + SET inboxCount=unread) → reapply badge. Cache = `_pendingCustomers` (localStorage); clear theo khách = `clearPendingForCustomer` khi shop reply (đã có). Thêm `phone` vào entry onNewConversationEvent (match badge theo SĐT). **Trigger:** (1) `_discoverOnEnter` chờ pdm sẵn sàng rồi fire 1 lần (vào trang); (2) `continueAfterCampaignSelect` (tab1-init.js, bump `?v=20260615a`) sau `handleSearch()` — chạy khi vào trang + chọn + đổi chiến dịch. KHÔNG interval mới.

Web 1.0 only, frontend-only (GH Pages, không cần deploy Render). `node --check` PASS. **Status:** ✅ — MEMORY [[reference_web1_realtime_msg_column]].

### [web2] J&T `_parsePasteDate` — siết đọc ngày dòng dán (chống typo/ngày cũ/ghi chú) ✅

User: "siết lại" (cách đọc ngày dòng dán nạp vào kho tin). Dòng thật `...Ngọc Diễm- -16-20/08/2023...` parse ra 2023 → tin văng lên đầu chat. Siết [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `_parsePasteDate(line, nowMs)`:

- Quét token ngày, **bỏ qua token RÁC** (range guard d/mo/y + round-trip `new Date` loại 31/02, 29/02 năm thường, 31/04…).
- **Token ngày THẬT đầu tiên = ngày đơn** (đứng trước SĐT/ghi chú) → gate **cửa sổ [now−180d, now+2d]** rồi DỪNG. Trong cửa sổ → dùng; ngoài (typo/cũ như 2023) → `null` (caller dùng `ts` = coi như tin mới). **KHÔNG** quét tiếp ngày trong ghi chú (tránh lấy nhầm ngày-hẹn-giao làm giờ tin — lỗi reviewer chấm HIGH). Truyền `nowMs=ts`.
- **Verify**: workflow 5 agent (4 sinh ca đối kháng + 1 review) → **86 ca** (25 của tôi + 61 workflow) chạy node harness deterministic, khớp 100% hợp đồng siết (4 "diff" so kỳ vọng cũ chính là 4 ca note-fallthrough giờ trả null — đúng ý). Bỏ dead-code `Number.isNaN`. Backend-only → cần deploy web2-api.

### [web2] J&T highlight tin — fix cuộn trượt (lazy-load shift) + ring rõ trên bong bóng ✅

User: "nạp ok nhưng chưa thấy highlight". Browser-test live (176 tin/nhóm 792, 156 paste): `findMessageInChat` TÌM ĐÚNG + add `.jt-msg-hit` (hit:true) nhưng **tin nằm dưới khung** (hitOffsetTop 1137 > viewport 724) → user không thấy. Root: `scrollIntoView({behavior:'smooth'})` chạy khi ảnh/avatar phía trên còn load lazy → layout dịch → smooth-scroll trượt chỗ. Phụ: ring `.jt-msg-hit` đặt trên hàng `.wz-msg` (rộng hết khung) mờ + pulse 3× tắt trước khi nhìn.

- [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) `findMessageInChat`: cuộn **tức thì** (`behavior:'auto'`) + **re-assert 7×/200ms (~1.4s)** bám đúng tin khi layout còn dịch. Verify 3 mã (nông + sâu 2023): inView:true (offset 305/116/305 trong 724).
- [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css): ring chuyển sang **bong bóng tin** (`.jt-msg-hit .wz-msg-bubble`) — viền xanh `--jt-primary` 2px+7px + nền 22%, pulse 5×. Rõ hẳn (screenshot xác nhận).
- Bump `jt-tracking.css`/`jt-tracking-app.js?v=20260615bf2`. Frontend-only (không cần deploy web2-api).

### [web2][live-chat] comments-mobile: bỏ nút Gọi/Mở FB ở sheet + highlight comment mới 3s ✅

User: "bỏ nút gọi đt + mở facebook"; "comment mới highlight tồn tại 3s". [comments-mobile.js](live-chat/js/live/comments-mobile.js): gỡ `.sh-actions` (2 nút Gọi + Mở Facebook) khỏi sheet chi tiết (giữ "Xem khoảnh khắc" + "Ẩn tất cả comment"). [comments-mobile.html](live-chat/comments-mobile.html): `@keyframes cardIn` giữ khung xanh tới 85% + `.card.is-new animation 1.5s→3s` → comment mới có khung xanh ~3s rồi mờ. Bump `comments-mobile.js?v=20260615live2`.

### [web2][live-chat] comments-mobile mặc định "ĐANG LIVE" (gộp bài đang live) thay vì "Tất cả" ✅

User: "đừng chọn Tất cả → chọn cái đang livestream thôi → House+Store đang live thì chọn cả 2". [comments-mobile.js](live-chat/js/live/comments-mobile.js): thêm `liveMode` (mặc định true) — gộp comment các bài ĐANG LIVE (`posts.filter(postLiving)`, gồm House+Store). Picker thêm dòng **"🔴 Đang livestream (gộp)"** (mặc định chọn) trên "Tất cả". `load()` query `?postIds=<living ids CSV>`; `visible()` lọc `passLive`; `realCommentTotal`/`updateLiveTag`/`getPostIds` theo liveMode; reload khi biết bài live (overrideRealCounts). Chọn "Tất cả"/1 bài cụ thể vẫn được. Bump `comments-mobile.js?v=20260615live`.

### [web2] "Tăng comment" gửi GIỐNG 100% Pancake (capture browser-test) + đa nhiệm qua JWT account ✅

User: "gửi payload/url giống 100% Pancake; không có nút ẩn comment". Browser-test pancake.vn + user gửi tay → **capture request thật** (hook fetch/XHR): `POST /api/v1/pages/{pid}/conversations/{convId}/messages?access_token={JWT_USER}` (KHÔNG phải page_access_token!), body `{action:'reply_comment', message_id, parent_id:convId, user_selected_reply_to:null, post_id, message, send_by_platform:'web'}`. Extension `content/pancake-bump.js` dùng y hệt. **Không có cờ/nút ẩn** → comment vốn hiện (gửi vào hội thoại PAGE → reply nested dưới comment page, như Pancake).

- [web2-chat-client.js](web2/shared/web2-chat-client.js): `Web2Chat.sendLiveComment(pageId, conv, msg, {jwt, messageId})` gửi byte-for-byte như capture (`/api/pancake/...?access_token=JWT`); `getPageAccountJwts(pageId)` = JWT mọi account admin page (dedupe) cho đa nhiệm.
- [multi-tool.js](web2/multi-tool/js/multi-tool.js) `run()`: 1 worker / ACCOUNT, mỗi worker access_token = JWT account đó (thay PAT). Trước đây dùng `/api/pancake-official/...?page_access_token=` + customerId → KHÁC Pancake. Bump `web2-chat-client.js`+`multi-tool.js?v=20260615pc100`.

### [web2] J&T "Dán lịch sử" — NẠP dòng dán vào kho tin chat (không chỉ trích mã) ✅

User: "sao lúc tôi dán kết quả vào bạn không nạp vào để lấy đủ dữ liệu?". Đúng — `/scan-text` cũ CHỈ trích mã 12 số → bảng `web2_jt_tracking` (src_message = nguyên dòng); KHÔNG nạp dòng dán vào kho tin chat `web2_zalo_messages` (chat đọc từ đây) → bấm mã DÁN TAY không cuộn/highlight được. Mà nội dung dán user cuộn tay ở Zalo Web là nguồn tin CŨ giàu hơn cả backfill zca (more:0 ~20 tin).

- **Server** [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/scan-text`: nhận thêm `convId`; `_resolveTargetConv` (convId client gửi → nhóm đang xem; fallback nếu chỉ theo dõi 1 nhóm). Mỗi dòng có mã: (1) upsert J&T row + set `zalo_conv_id`; (2) NẠP dòng thành 1 tin `web2_zalo_messages` (`msg_id='paste:<code>'`, `sent_at`= ngày đơn DD/MM/YYYY parse GMT+7 hoặc ts, direction 'in', group). **Dedup**: bỏ qua nếu nhóm đã có TIN THẬT chứa mã (content ILIKE) → không trùng realtime/backfill. SSE `web2:zalo:messages`+`web2:zalo:thread:<id>` để chat đang mở tự refresh. Trả `{found, added, messagesAdded}`.
- **Client** [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js): gửi `convId:_jtGroupConvId`; toast thêm "· nạp N tin vào chat". Bump `?v=20260615bf`.
- Kết quả: dán xong → chat nhóm hiện đủ dòng đã dán + bấm mã dán tay cuộn/highlight được (không còn toast "không có tin trong nhóm"). Backend cần deploy web2-api.

### [web2][shared] Fix đa nhiệm "Tăng comment" — chỉ chạy 1 account (acc.pages format object) ✅

User: "gửi chậm, không có đa nhiệm song song" (log "1 tài khoản"). **Root cause**: `acc.pages` = mảng **object** `[{id,name}]` (KHÔNG phải id string) → filter `acc.pages.includes(String(pageId))` trong `generateAllPageAccessTokens`/`generatePageAccessToken` LUÔN false → loại hết 6 account → fallback 1 (active JWT). Verify Render DB: 6 account, #0/#3… đều admin House. Fix [web2-chat-client.js](web2/shared/web2-chat-client.js): helper `_pagesHas(pages, pageId)` so theo `p.id` (xử lý object), sửa cả 2 chỗ. Giờ N account admin page → N PAT (user-specific, phân biệt) → N worker song song. Bump `web2-chat-client.js?v=20260615tag3` (multi-tool + live-chat + native-orders).

### [web2][shared] Chat Zalo — "Tải tin cũ hơn" backfill lịch sử NHÓM từ Zalo về DB ✅

User: "scroll không load thêm được tin nhắn cũ à?" (đang xem chat nhóm "XỬ LÝ NJD - J&T"). Root: nút "Tải tin cũ hơn" chỉ hiện khi **DB** (`web2_zalo_messages`) còn tin cũ; nhóm này chỉ có batch realtime-captured (`hasMore:false`) → không nút → scroll không load gì. Tin cũ hơn (trước khi capture chạy) chưa từng vào DB.

- **Server** [web2-zalo.js](render.com/routes/web2-zalo.js): route mới `POST /conversations/:id/backfill {count}` — nhóm only, `zca.getGroupHistory(account_key, thread_id, count≤500)` → INSERT dedupe (`ON CONFLICT DO NOTHING`) vào `web2_zalo_messages`, KHÔNG đụng row conversation (không bump unread/last_msg vì là tin CŨ). Tiện thể `autoIngestFromZalo` mã đơn J&T trong tin vừa kéo về. Trả `{added, fetched, more}`. ⚠ zca-js 2.1.2 chỉ trả batch gần nhất (more>0 = còn cũ hơn nhưng KHÔNG có cursor lấy tiếp) → backfill 1 lần lấy nhiều hơn batch realtime nhưng có trần.
- **Client API** [web2-zalo-api.js](web2/shared/web2-zalo-api.js): `ZaloApi.backfill(convId, count)`.
- **Chat view** [chat-view.js](web2/shared/zalo-chat/chat-view.js): nhóm luôn hiện nút "Tải tin cũ hơn" (kể cả DB hết tin, 1 lần/phiên qua `backfilledOnce`). `loadOlder()`: (1) còn DB → phân trang keyset (lọc trùng msg_id); (2) DB hết + nhóm → `backfill(200)` → tải lại từ DB → toast "Đã tải thêm N tin cũ từ Zalo" / "Zalo không còn tin cũ hơn".
- Bump `ENGINE_VER='20260615bf'` (web2-zalo.js) + tag `web2-zalo.js?v=20260615bf` (jt-tracking/balance-history/customers) + `web2-zalo-api.js`/`chat-view.js?v=20260615bf` (web2/zalo). Backend cần deploy web2-api.

### [web2] "Tăng comment" — ô Giãn nhịp đổi sang GIÂY (thập phân), cho 0.1–1.5s ✅

User: "nhập 0.5s, 0.1s có tác dụng không?" → KHÔNG: ô cũ là **ms** + `parseInt("0.1")=0` → rơi về 1500ms + min-clamp 500. User nghĩ theo giây. Đổi ô [boostDelay](web2/multi-tool/index.html) sang **đơn vị giây** (number thập phân, value 1.5, min 0.1, step 0.1); [multi-tool.js](web2/multi-tool/js/multi-tool.js) parse `parseFloat * 1000` (min 0.1s=100ms), hint "= N ms/comment mỗi tài khoản". Giờ 0.5→500ms, 0.1→100ms thật. Bump `multi-tool.js?v=20260615sec`.

### [web2] "Tăng số lượng comment" ĐA NHIỆM theo nhiều account Pancake (1 worker/account) ✅

User: "đa nhiệm đi vì có nhiều account Pancake tôi add vào — cứ chạy tối đa số account được add".

- [web2-chat-client.js](web2/shared/web2-chat-client.js): `sendMessage` nhận `opts.pageAccessToken` (override PAT/worker). Thêm `Web2Chat.generateAllPageAccessTokens(pageId)` — mint PAT cho MỌI account đã add (song song), dedupe theo PAT (mỗi user→1 page_access_token riêng = bucket rate-limit FB khác nhau → throughput cao hơn).
- [multi-tool.js](web2/multi-tool/js/multi-tool.js) `run()`: chạy **1 worker / PAT** chia chung counter `claimed` (JS 1 luồng → atomic), mỗi worker `sendMessage(...pageAccessToken)` + giãn nhịp riêng → tổng ≈ N/delay. Rate-limit ở BẤT KỲ worker → `_stop=true` dừng TẤT CẢ. Log `[T1]/[T2]…` + "Đa nhiệm: N tài khoản song song". Không account nào mint được → 1 worker PAT mặc định (như cũ).
- Bump `web2-chat-client.js?v=20260615tag2` + `multi-tool.js?v=20260615multi`.

### [web2][shared] Gộp tag Pancake VÀO Web2Chat (bỏ file rời) — trang chỉ tham chiếu Web2Chat ✅

User: "tôi tưởng pancake build vào shared để dùng chung, các trang chỉ tham chiếu tới". → Gộp logic tag từ file rời `web2-pancake-tags.js` (vừa tạo) VÀO `Web2Chat` ([web2-chat-client.js](web2/shared/web2-chat-client.js)): `Web2Chat.ensureTags(pageId)` / `tagDefsFor` / `resolveTags` / `tagPillsHtml(pageId, conv.tags)` (pill inline-style, không cần CSS rời). XOÁ `web2-pancake-tags.js` + auto-loader trong chat-panel. [Web2ChatPanel](web2/shared/chat-panel/web2-chat-panel.js) `renderTags()` dùng `Web2Chat.*`. Bump `web2-chat-client.js`+`web2-chat-panel.js?v=20260615tag2` (live-chat index/chat/mobile + native-orders).

### [web2] J&T mở chat — highlight chỉ chạy khi tin CÓ trong nhóm đã lưu; báo rõ khi không ✅

User: bấm nút mở chat không thấy kéo tới + highlight. Browser-test: chat mount OK, mã **scanned** (802763058048) highlight ngay (`.jt-msg-hit`), nhưng mã **dán tay** (802759937370) thì group conv chỉ có **16 tin lưu (`hasMore:false`)** và **không chứa tin dán tay** → không có gì để cuộn tới. Root: chat đọc `web2_zalo_messages` (realtime-captured); mã "Dán lịch sử" copy từ Zalo Web KHÔNG qua capture → tin gốc không nằm trong nhóm đã lưu. Fix `findMessageInChat`: click "Tải tin cũ hơn" tối đa 8 lần (khi còn), hết tin cũ mà chưa thấy → toast rõ "Mã X không có tin trong nhóm đã lưu (mã dán tay/tin cũ) — nhóm đã mở để xem" thay vì im lặng. Bump app `?v=20260615y`. Frontend-only.

### [web2][shared] Tag hội thoại Pancake — module dùng chung Web2PancakeTags + hiện tag trên chat ✅

User: "thêm vào shared pancake dùng chung các tag của Pancake, đoạn hội thoại khách sẽ hiện tag như Pancake".

- Verify shape thật: `conv.tags` = mảng **ID số** (`[58,68]`); định nghĩa (text+màu) ở **page settings** `settings.tags` (`{id,text,color,lighten_color}`, Store 14 tag).
- Module mới [web2/shared/web2-pancake-tags.js](web2/shared/web2-pancake-tags.js) (`Web2PancakeTags`): `ensure(pageId)` nạp+cache defs (qua `Web2Chat.fetchPageSettings`), `resolve()` map id→def, `pillsHtml(pageId, conv.tags)` render pill màu (chữ tương phản theo độ sáng nền), tự inject CSS `.w2pk-tag`. NGUỒN DUY NHẤT cho tag — đừng fetch nơi khác.
- [Web2ChatPanel](web2/shared/chat-panel/web2-chat-panel.js): auto-load web2-pancake-tags.js + `renderTags()` hiện pill tag trong header hội thoại (defs chưa nạp → ensure rồi render lại, async, no-op nếu conv không tag). Bump `web2-chat-panel.js?v=20260615tag` (live-chat index/chat + native-orders).

### [web2] J&T — tag 2-chiều/toggle + nút chat cho mọi row + highlight tin có mã ✅

User: (1) tag "XỬ LÝ BC" không sync 2 chiều + muốn bấm lần nữa GỠ có custom confirm; (2) mã dán tay không hiện nút nhắn nhóm Zalo; (3) mở chat tìm tin có mã → highlight lên.

- **Tag TOGGLE 2-chiều** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js)): `resolvePancakeConv` trả thêm `conv.tags` → `tagPancake` đọc trạng thái THẬT trên Pancake (có thẻ chưa) → đồng bộ nút+localStorage; đã có → **custom confirm `jtConfirm` "Gỡ thẻ?"** → `toggleTag(...,'remove')`; chưa có → 'add'. Helpers `unmarkTagged`/`setTagButtons`. (fallback localStorage nếu search không trả tags.)
- **Nút chat cho MỌI row**: suy `_jtGroupConvId` từ row có sẵn `zalo_conv_id` (trong renderList) → mã dán tay (thiếu conv) vẫn mở nhóm J&T + nhảy tới tin.
- **Highlight tin có mã GIỮ lại** (không tự tắt 2.6s): nháy 3 lần thu hút rồi đứng yên (ring xanh + nền), clear highlight cũ khi mở mã khác. CSS `.jt-msg-hit`.
- Frontend-only; bump css/app `?v=20260615x`.

### [web2][live-chat] Badge "comment" hiển thị TỔNG comment THẬT từ Pancake (comment_count) ✅

User: "tổng số comment lấy ở Pancake được nè" (Pancake "Quản lý bài viết" có comment_count thật mỗi bài: 53, 1.0K…). Badge live-chat trước đếm số ROW đã load (→ "200+").

- [web2-chat-client.js](web2/shared/web2-chat-client.js): thêm `Web2Chat.fetchLivePosts(pageId)` — fetch trực tiếp Pancake `pages/{id}/posts` (KHÔNG poller), trả posts kèm **`commentCount`** (=`comment_count` thật) + living/title/date, cache 60s/page.
- Desktop [live-comment-list.js](live-chat/js/live/live-comment-list.js): `_updateRealCommentTotal()` — tổng `comment_count` các post đang xem (distinct post_id của comment), override badge `💬 N` (giữ số đã-load làm fallback tức thì, seq-guard chống race).
- Mobile [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[html](live-chat/comments-mobile.html): load web2-chat-client + `syncFromRenderDB()` lấy JWT → `overrideRealCounts()` ghi đè `comment_count` posts bằng số Pancake; badge = tổng count post đang xem (selectedPost → bài đó; "Tất cả" → tổng). Fallback đếm row nếu thiếu JWT (graceful).
- Field Pancake: `comment_count` (verified prod: 1037→"1.0K", phone_number_count=11). Bump live-chat refs `?v=20260615lp1`.

### [web2][shared] Web2CustomerChat — bấm SĐT ở header drawer để copy ✅

User: trong khung chat KH (Web2CustomerChat), SĐT ở header "Khách 0904455856" bấm vào copy. Thêm `data-w2cc="copyphone"` + class `.w2cc-phone` (cursor pointer, hover xanh) cho `<span>` SĐT; click handler `_copyPhone()` (clipboard + toast). [web2-customer-chat.js](web2/shared/web2-customer-chat.js). Bump launcher `?v=20260615c` ở jt-tracking + balance-history + customers. Frontend-only.

### [web2][render] "Làm mới tất cả" CHỈ tra đơn "Chưa tra" (pending) — đơn khác dùng nút từng dòng ✅

User: "làm mới tất cả ưu tiên đơn chưa tra → đơn khác có nút riêng rồi". Đổi query `/refresh` (nhánh no-codes): `WHERE approved_at IS NULL AND status='pending'` (bỏ transit/delivering/not_found/stale). → không tra lại hàng loạt đơn đã chốt (khỏi bị jtexpress chặn + khỏi treo vòng lặp UI). Đơn đã có trạng thái muốn cập nhật → nút làm mới ↻ TỪNG DÒNG (`/track`, đã có). Thêm tooltip nút. Verified: pending 31→1 sau bản gentler trước đó. ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js))

### [web2] Chuyển "Studio chụp tách nền" vào group "Đa dụng Web 2.0" ✅

User: chuyển photo-studio vào group đa dụng. [web2-sidebar.js](web2/shared/web2-sidebar.js): bỏ "Studio chụp tách nền" khỏi "Tính năng mới" → thêm vào group "Đa dụng Web 2.0" (giờ có 2 trang: Tăng số lượng comment + Studio chụp tách nền). Bump `web2-sidebar.js?v=20260615db` × 39 trang.

### [web2] "Đa dụng Web 2.0" thành GROUP sidebar + "Tăng số lượng comment" là trang trong group ✅

User: "Đa dụng Web 2.0 là 1 group ở menu, Tăng số lượng comment là 1 trang trong đó".

- [web2-sidebar.js](web2/shared/web2-sidebar.js): bỏ `{Đa dụng}` khỏi group "Tính năng mới" → thêm group top-level mới **"Đa dụng Web 2.0"** (icon `wrench`) chứa child **"Tăng số lượng comment"** → `web2/multi-tool/index.html`. (mở rộng được: thêm tool mới = thêm trang + child.)
- [multi-tool/index.html](web2/multi-tool/index.html): h1 "Đa dụng Web 2.0" → **"Tăng số lượng comment"** (icon trending-up), bỏ tab bar dư thừa (group đã cung cấp ngữ cảnh), title tag + #Note cập nhật.
- Bump `web2-sidebar.js?v=20260615da` trên 39 trang để menu mới hiện.

### [render] J&T /refresh — gentler để hết kẹt "Chưa tra" (jtexpress throttle khi tra dồn) ✅

User: 32 đơn "Chưa tra" làm mới không được. Chẩn đoán: `/track` đơn lẻ 1 mã kẹt → OK ngay (returned, 19 event) ⇒ mã hợp lệ, do **batch /refresh tra song song 5/đợt × 20 đợt liên tục → jtexpress.vn throttle → timeout → kẹt pending** (khác 'not_found'=fetch OK 0 event). Fix [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js): CONC 5→**3**, **retry 1 lần** (nghỉ 700ms) khi fetch lỗi, **nhịp 350ms giữa các đợt**, REFRESH_BATCH 25→**15** (mỗi call snappy, tránh treo request). Pending sẽ về 0 sau vài lần "Làm mới tất cả".

### [web2][render] Ẩn spam "tăng comment" khỏi live-chat — boost-mark XOÁ + chặn + nút Dọn ✅

User: "sao live-chat vẫn hiện các comment count này? Không có type/cách nào ở dữ liệu Pancake nhận biết à?"

- **Điều tra (empirical)**: query row thật của spam (40R5wXr…) → `fb_id=24961649996856997` = **Ellie Lương (chủ hội thoại), KHÔNG phải page**; created 09:05 UTC = spam **THỦ CÔNG trên Pancake** (trước khi tool fix message_id). Vì page reply vào comment của khách → Pancake gán vào hội thoại KHÁCH. **Xác nhận: realtime WS KHÔNG có field "page-authored"** (heuristic `from===page` vô dụng cho reply). Cách tin cậy duy nhất từ data = fetch từng message xem author=page → đó là "poll lại" (đã bỏ).
- **Fix**: `/boost-mark` ([web2-live-comments.js](render.com/routes/web2-live-comments.js)) giờ ngoài chặn ingest event mới (in-memory TTL 20') còn **XOÁ comment đã ingest của conv** (`DELETE … WHERE id=$1 OR starts_with(id,$1||'_')`) + `_notify('reconcile')` → live-chat đang mở tự bỏ. Deterministic (tool biết chính xác conv).
- **Tool** ([multi-tool.js](web2/multi-tool/js/multi-tool.js)): markBoost trả `purged`; thêm nút **"Dọn comment đã tăng"** (`cleanConv`) để dọn spam (kể cả gõ tay) của hội thoại đang chọn KHÔNG cần spam. run() vẫn markBoost trước + mỗi 100 tin.
- **Lưu ý bản chất**: spam THỦ CÔNG trên Pancake KHÔNG tự ẩn được (không có signal data) → khuyến nghị spam QUA TOOL (auto ẩn+dọn), hoặc bấm "Dọn comment đã tăng". Icon `message-circle-plus`→`trending-up`/`eraser` (có trong lucide 0.294). Bump `multi-tool.js?v=20260615f`. ⚠ deploy web2-api.

### [web2] J&T — bỏ nút "Xóa hết & quét lại" ✅

User: "bỏ nút xóa quét lại hết". Gỡ nút `jtClearAll` (danger) + hàm `clearAll()` + wiring khỏi [index.html](web2/jt-tracking/index.html)+[jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) — tránh xoá nhầm toàn bộ (đã từng gây mất 1 đơn). Route `/clear` backend giữ nguyên (không UI gọi). Bump app `?v=20260615w`. ("Chưa tra" = status pending: mã đã thêm nhưng CHƯA tra cứu J&T → bấm "Làm mới tất cả" để tra.)

### [web2] J&T script Console — bỏ console.log/clipboard (Zalo chặn) → INJECT ô kết quả vào trang ✅

User: "script vẫn Promise pending, không hiện/hoạt động gì". Root-cause: **Zalo Web chặn `console.log` + `clipboard.writeText` reject khi DevTools đang focus** → script CHẠY nhưng không log + clipboard rỗng → tưởng treo. Fix: script không dùng console/clipboard làm output nữa — **inject 1 ô nổi (z-index max) góc phải trang Zalo**: hiện tiến độ cuộn + khi xong show `<textarea>` chứa các dòng đơn (tự bôi đen sẵn) + vẫn thử copy clipboard. User đọc/copy thẳng từ ô → dán "Dán lịch sử". Verified scraping logic live trước đó (cuộn 8 lần 11→28 mã trên nhóm thật). Bump app `?v=20260615v`. Frontend-only.

### [docs][web2] Quy ước "REALTIME, KHÔNG POLLER" — note vào CLAUDE.md + MEMORY + overview ✅

User: "realtime, không poller → note vào memory, claude, devlog + overview". Chốt quy ước Web 2.0: đã bỏ hẳn poller nền (user xác nhận 2026-06-15) → realtime dùng **SSE**; liệt kê/fetch dữ liệu Pancake (bài đang/đã live, hội thoại, comment) → **fetch TRỰC TIẾP Pancake từ browser** qua worker `/api/pancake/*` + JWT (vd `pages/{id}/posts` cho đang/đã livestream — đúng nguồn "Quản lý bài viết"). KHÔNG `setInterval`/poll mới, KHÔNG đi vòng route server gọi poller.

- [CLAUDE.md](CLAUDE.md) §"⚡ SSE-first" → thêm tiểu mục "⚡ REALTIME, KHÔNG POLLER (BẮT BUỘC)".
- MEMORY: `feedback_web2_realtime_no_poller.md` + index.
- [web2/overview/index.html](web2/overview/index.html) `#conventions` → bullet Realtime-không-poller (canonical).
- Ghi rõ state thật: `web2-livestream-poller.js` `start()` không schedule `_loop()` (background poll DISABLED); 4 helper còn lại on-demand (reconcileFullText/pollNow/pollPostNow/listLivePostsForAssign) — không thêm mới. `/page-posts` trả 0 bài trên web2-api → đừng dùng UI mới.

### [web2] J&T script Console Zalo — bỏ IndexedDB (gây treo Promise) → auto-scroll DOM ✅

User: "dán console → enter → Promise pending quá lâu". Nguyên nhân: phần IndexedDB `getAll()`+`JSON.stringify` trên store khổng lồ/blob của Zalo → freeze, promise không resolve. Sửa: bỏ hẳn IndexedDB; script mới **tự cuộn khung chat lên** (tìm div cuộn lớn nhất) + đọc `document.body.innerText` (tin đã giải mã) mỗi 500ms, gom mã, **cap 60s + dừng khi 12 vòng không thêm mã**, log tiến độ + "XONG … Da copy". Console ASCII (không emoji/dấu) cho an toàn copy. Cập nhật bước 3 modal (đợi ~30-60s, "Promise pending" lúc đầu là bình thường). Bump app `?v=20260615t`. Frontend-only.

### [web2][render] "Tăng comment" — chọn Bài live (gồm đã xong) + ẨN spam khỏi live-chat ✅

User: (1) "đã livestream xong vẫn cho chọn", (2) "mặc định chọn mới nhất", (3) "đừng hiện các spam comment count này vào live-chat/comments-mobile", (4) "các comment này có type/nhận biết được không → để không hiện".

- **Bug gốc**: [multi-tool.js](web2/multi-tool/js/multi-tool.js) dùng `Web2Chat.fetchConversationsByPage` — hàm này **hardcode `type:'INBOX'`** → KHÔNG bao giờ trả COMMENT → dropdown rỗng ("Không có hội thoại COMMENT") dù live đang chạy hay đã xong.
- **Fix chọn bài (KHÔNG poller — user: "đã bỏ poller để dùng realtime")**: picker **Bài live** fetch **TRỰC TIẾP Pancake từ browser** `GET /api/pancake/pages/{id}/posts?start_time&end_time` (qua worker + JWT — đúng endpoint Pancake dùng cho "Quản lý bài viết" đang/đã livestream), lọc `type==='livestream'`, map `living = live_status==='LIVE'||is_living`. optgroup **"🔴 Đang Livestream"** (ưu tiên đầu, mặc định chọn) + **"Đã Livestream"** (14 ngày, sort mới nhất). KHÔNG còn đi qua `/page-posts` (poller server-side — trả 0 bài trên web2-api sau split + sai nguyên tắc realtime). Chọn bài → fetch hội thoại COMMENT trực tiếp Pancake `?type=COMMENT&post_id=...`, sort `updated_at` desc, auto-chọn mới nhất. Verify prod: House 9 / Store 11 bài livestream, 0 đang live (khớp ảnh Pancake), GMT+7 khớp (06:44 UTC→13:44).
- **Ẩn spam khỏi live-chat** (câu hỏi "có type không"): comment spam = page tự `reply_comment` → quay vòng qua WS → `/ingest` → `web2_live_comments` → hiện ở live-chat. WS payload KHÔNG có flag "page-authored" tin cậy (conv.from/customers vẫn là chủ hội thoại). Giải pháp 2 lớp trong [web2-live-comments.js](render.com/routes/web2-live-comments.js): (1) **deterministic** — multi-tool gọi `POST /boost-mark {convId}` (TTL 20') → `/ingest` BỎ QUA conv đó (không lưu DB + không SSE); (2) **heuristic phụ** — `conv.from.id === conv.page_id` (page tự comment trên post của mình) cũng bỏ. Path poll-now: [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) bỏ message `m.from.id === pageId`.
- multi-tool re-mark mỗi 100 tin (run dài). Bump [multi-tool/index.html](web2/multi-tool/index.html) `multi-tool.js?v=20260615b`. ⚠ deploy web2-api (route mới `/boost-mark` + filter ingest/poller).

### [web2] J&T "Dán lịch sử" — thêm script Console Zalo Web (copy sẵn) + hướng dẫn ✅

User: "cho nút hiện đoạn script + ô dán kết quả có hướng dẫn". Modal "Dán lịch sử" giờ gồm: (1) hướng dẫn 4 bước, (2) **ô script** (đọc từ `<script type="text/plain" id="jtZaloScript">` ẩn — moi mã đơn từ IndexedDB + DOM Zalo Web) + nút **"Copy script"**, (3) ô dán kết quả → "Quét mã" → `/scan-text`. Script lưu dạng text/plain để khỏi escape; verify `node --check` đoạn extract OK. Frontend-only; bump css/app `?v=20260615s`.

### [web2] Trang MỚI "Đa dụng Web 2.0" + tab "Tăng số lượng comment" ✅

User: spam comment bằng auto-gõ random + Enter trên Pancake (page reply_comment) → mang vào Web 2.0 thành 1 trang đa dụng (tab framework), tab đầu = tăng comment.

- Trang [web2/multi-tool/](web2/multi-tool/index.html) + [multi-tool.js](web2/multi-tool/js/multi-tool.js): tab bar (mở rộng được), tab "Tăng số lượng comment".
- **Engine**: chọn page → load hội thoại COMMENT (Web2Chat.fetchConversationsByPage) → chọn 1 → N comment + giãn nhịp(ms) + text random/mẫu → loop `Web2Chat.sendMessage(pageId,convId,{action:'reply_comment',text,customerId})` (ĐÚNG cách Pancake gõ+Enter, page tự comment). Progress + log + Dừng. **DỪNG ngay khi FB rate-limit** (e_subcode 3252001/e_code 368/policy) tránh khoá page.
- Sidebar "Tính năng mới" → "Đa dụng" ([web2-sidebar.js](web2/shared/web2-sidebar.js)); bump sidebar `?v=20260615mt` 36 trang. ⚠ Chỉ dùng cho live của shop (engagement nội bộ, không gửi tới khách).

### [web2][render] J&T "Dán lịch sử" — paste text copy từ Zalo → quét mã đơn cũ ✅

User hỏi lấy file lịch sử Zalo ở Chrome / bấm browser được không. Trả lời: Zalo Web mã hoá payload (AES) + IndexedDB nội bộ → không có file đọc được; cách khả thi = **copy text chat → dán**. Thêm `POST /api/web2-jt-tracking/scan-text {text}` ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js)): quét theo dòng + toàn văn bằng `extractOrderCodes` (đúng format `<mã> Shop NHI JUDY`), src_message = dòng chứa mã, source 'zalo' note 'dán lịch sử'. UI nút **"Dán lịch sử"** (clipboard-paste) + modal textarea ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) `openPasteModal`, reuse CSS `.jt-msg-*`). Bù được lịch sử cũ mà Zalo API trả `more:0`. Bump app `?v=20260615r`. ⚠ deploy web2-api.

### [web2][render] J&T "Quét lịch sử" → quét 14 NGÀY + chẩn đoán độ sâu ✅

User: "quét tin nhắn lịch sử 14 ngày đi". `/scan-history` giờ nhận `days` (mặc định 14) + `count` cao (1000) → lọc tin theo `sentAt >= now - days`. ⚠ Phát hiện giới hạn: zca-js 2.1.2 `getGroupChatHistory(groupId, count)` KHÔNG có cursor (`lastMsgId`) → mỗi call chỉ trả batch tin GẦN NHẤT (count 50 vs 500 đều ~35 tin), response có `more>0` báo còn tin cũ hơn NHƯNG không lấy tiếp được. → scan-history trả thêm `rawTotal`/`more`/`oldestDate` để biết với tới đâu; nút "Quét lịch sử" báo "tới <ngày>" + cảnh báo nếu Zalo còn tin cũ hơn. 14 ngày đầy đủ vẫn dựa vào realtime listener (`web2_zalo_messages`, "Quét Zalo" đã quét hết). Bump app `?v=20260615q`.

### [orders-report][don-inbox] Fix bill PBH lẻ MẤT MÃ VẠCH khi in (barcode pre-render data-URI, bỏ race ảnh ngoài) ✅

**User:** "khi tạo đơn bằng phiếu bán hàng lẻ ở don-inbox bill in bị mất mã vạch? kiểm tra kỹ lại lỗi tại sao? tham khảo orders-report/main.html"

**Root cause (RCA 6-agent workflow, adversarial verify KHÔNG bác):** Mã vạch trên bill là ảnh NGOÀI `<img src="https://statics.tpos.vn/Web/Barcode?...">` render trong popup `window.open('')` (document.write). `openPrintPopup` gọi `print()` theo timer cố định (onload+500ms / fallback +1500ms) rồi `onafterprint => close()` NGAY — **regression commit `44e8446e2` (2026-03-19)**. Ảnh cross-origin ~10KB tải chưa xong khi print()/close() → mã vạch in trắng, còn dòng "Số phiếu" (text đồng bộ) vẫn in. **Code DÙNG CHUNG** (`confirmAndPrintSale`→`openPrintPopup`→`generateCustomBillHTML` trong [bill-service.js](orders-report/js/utils/bill-service.js)); don-inbox lộ rõ hơn vì là trang top-level (orders-report chạy trong iframe `tab1-orders.html` đã warm origin). KHÔNG phải lỗi thiếu Number, KHÔNG phải space trong "Code 128" (browser tự encode %20, endpoint HTTP 200), KHÔNG phải stale cache (markup barcode bất biến từ 2026-02-25).

**Fix:** Pre-render CODE128 trong PARENT context thành PNG data-URI (như [web2-bill-service.js](web2/shared/web2-bill-service.js)) → bill không cần fetch mạng, không race. [bill-service.js](orders-report/js/utils/bill-service.js): (1) loader inject JsBarcode (vendored `js/lib/jsbarcode-code128.min.js`, byte-identical web2, SHA1 `1547bfec`); (2) `_renderBarcodeDataUrl()` dùng `JsBarcode(canvas, billNumber, {format:'CODE128',width:2,height:100,displayValue:false,margin:0})` → `canvas.toDataURL`; (3) `barcodeSrc = _renderBarcodeDataUrl(billNumber) || barcodeUrl` (fallback ảnh TPOS nếu lib chưa load). Drop-in `<img>` → mọi consumer (popup in / iframe preview / innerHTML preview / html2canvas Messenger) đều có mã vạch, không đụng timer/onafterprint.

**Verify:** `node --check` PASS; browser smoke (Playwright) render `NJD/2026/72332` → `data:image/png` 356×100, `window.JsBarcode` = function. Bump `bill-service.js?v=20260615a` ở [don-inbox/index.html](don-inbox/index.html) (cũ 20260603a — stale), [orders-report/tab1-orders.html](orders-report/tab1-orders.html), [orders-report/tab-pending-delete.html](orders-report/tab-pending-delete.html). Cần GH Pages deploy + xác nhận in thực tế.

**Status:** ✅ code + smoke OK. ⚠ Khuyến nghị in thử 1 PBH lẻ thật trên don-inbox sau deploy để confirm visual.

### [live-chat] FIX native-orders 404 (mobile) + add-alt-phone 401 (desktop) ✅

- **404**: mobile `loadNativeOrders` gọi `/api/native-orders` trần → worker đẩy sang TPOS → 404. Endpoint LIST đúng = `/api/native-orders/load` (giống `NativeOrdersApi.list` desktop). Sửa path. [comments-mobile.js](live-chat/js/live/comments-mobile.js)
- **401**: desktop `_captureAltPhones` POST `/api/web2/customers/add-alt-phone` KHÔNG gửi `x-web2-token` (route `requireWeb2AuthSoft`, WEB2_AUTH_ENFORCE) → thêm `_w2AuthHeaders`. [live-init.js](live-chat/js/live/live-init.js). (harvest-comments đã gửi token sẵn — 401 lúc đầu do token chưa load/hết hạn → re-login nếu còn.)

### [web2][render] J&T "Quét lịch sử" — đọc lịch sử nhóm Zalo (zca) để quét đơn cũ/bị thiếu ✅

User: "đọc được lịch sử nhóm chat hôm nay để quét các đơn tin nhắn cũ hoặc bị thiếu không?". → Được: `/scan` cũ chỉ đọc `web2_zalo_messages` (chỉ có tin từ lúc listener kết nối) nên tin gửi TRƯỚC đó bị miss.

- **zca service** ([web2-zalo-zca.js](render.com/services/web2-zalo-zca.js)): FIX `getGroupChatHistory` (zca-js nhận `(groupId, count)` positional — wrapper cũ truyền object `{groupId,lastMsgId,count}` → hỏng, chưa ai dùng). Thêm `getGroupHistory(accountKey, groupId, count)` → `data.groupMsgs` map qua `_normMessage` (GroupMessage history CÙNG shape tin realtime: `.type/.data/.threadId/.isSelf`). ⚠ Lib version này KHÔNG hỗ trợ `lastMsgId` → chỉ lấy `count` tin gần nhất (no deep pagination).
- **route** ([web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js)): `POST /scan-history {count=200}` → quét nhóm trong allowlist `web2_zalo_tracked_groups` → `zca.getGroupHistory` → `extractOrderCodes` → upsert `web2_jt_tracking` (giống /scan: code→{tên/id nhóm, full content}). Trả {fetched, found, added, errors}.
- **UI** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) + [index.html](web2/jt-tracking/index.html)): nút **"Quét lịch sử"** (icon history) cạnh "Quét Zalo" → `/scan-history` count 300 → load + auto refresh mã mới. Bump app `?v=20260615p`.
- ⚠ Cần deploy web2-api (zca service + route mới). Status: ✅ Done (deploy + verify).

### [web2][render] Chat KH: Zalo chat-by-phone (chưa từng nhắn vẫn chat được) + auto-scroll + nút tag đổi trạng thái ✅

User: "1. zalo chưa có đoạn hội thoại nhưng đã có SĐT thì vẫn lấy được thông tin + chat được (Zalo không chặn, chỉ khách chặn mới fail). 2. Pancake/Zalo tự cuộn xuống cùng. 3. Bấm tag XỬ LÝ BC → nút đổi khác để biết khách đã có tag."

- **Zalo chat-by-phone** (trước đây SĐT chưa từng nhắn → "Khách chưa có hội thoại Zalo"): thêm `POST /api/web2-zalo/conversation/ensure {phone}` ([web2-zalo.js](render.com/routes/web2-zalo.js)) → đã có row trả luôn; chưa có → chọn account personal đang KẾT NỐI → `zca.findUser(phone)` → upsert row rỗng (`thread_id=uid`, thread_type user, phone/tên/avatar) → trả về. `Web2Zalo.mountChat({phone})` ([web2-zalo.js](web2/shared/web2-zalo.js)) khi `getConversation` rỗng → gọi ensure → mount thread rỗng + composer → gửi tin đầu tạo thread thật. Không tìm thấy user Zalo → báo lý do.
- **Auto-scroll xuống cùng**: [web2-customer-chat.js](web2/shared/web2-customer-chat.js) sau mount Pancake (`panelInst.scrollToBottom()` +500ms) và Zalo (`.wz-chat-body.scrollTop=scrollHeight` +500ms); quay lại tab đã mount cũng re-scroll.
- **Nút tag đổi trạng thái**: [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) nhớ SĐT đã tag (`localStorage jt_tagged_phones`) → render nút xanh + icon `badge-check` + title "đã gắn thẻ". Sau khi gắn thành công → đổi NGAY mọi nút cùng SĐT. CSS `.jt-icobtn.tag.is-tagged` (xanh).
- Bump web2-zalo `?v=20260615e` + web2-customer-chat `?v=20260615b` (jt+balance-history+customers) + jt app/css `?v=20260615o`.
- ⚠ **Cần deploy web2-api** (route mới `conversation/ensure`). Frontend qua GH Pages. Status: ✅ Done (deploy + verify).

### [live-chat/mobile] Đồng bộ đơn native-orders xuống mobile (realtime) + STT ✅

User: (1) desktop kéo SP tạo đơn (sau 5s không hoàn tác) → mobile hiện comment đó "đã tạo đơn" realtime; (2) hiện STT giống native-orders ở comment khách có đơn.

- `loadNativeOrders()` [comments-mobile.js](live-chat/js/live/comments-mobile.js): GET `/api/native-orders?limit=500` → `NATIVE` map (fbUserId→{stt,code}), scope theo bài đang trong feed. STT = `campaignStt ?? displayStt ?? sessionIndex` (KHỚP trang Đơn Web).
- `ordered(c)` gộp native → status "✓ Đã tạo đơn" + `.card.ordered` + đếm chip Store/House gồm cả đơn native. STT badge `🛒 N` (`.cart-stt`) trên comment khách có đơn.
- **Realtime**: SSE `web2:native-orders` (desktop `_notify('create')`/`'comment-merged'`) → debounce 500ms reload NATIVE → re-render. Comment khách vừa được tạo đơn ở desktop tự hiện ở mobile. (`?v=20260615natord`)

### [live-chat/mobile] Bỏ thumbnail trên comments-mobile ✅

User: không cần hiện thumbnail. Gỡ `<img.thumb>` khỏi cardHtml + ngưng `fetchThumbs` (load + enrichDelta) → đỡ băng thông. `THUMBS` rỗng → detail sheet tự không hiện thumb. [comments-mobile.js](live-chat/js/live/comments-mobile.js) (`?v=20260615nothumb`).

### [cors][web2-api] FIX snap livestream bị CORS chặn (x-web2-token) ✅

Snap upload `POST /api/livestream/snapshot` post THẲNG web2-api (không qua worker) kèm header `x-web2-token` (WEB2_AUTH_ENFORCE) → preflight reject "x-web2-token not allowed". Thêm `x-web2-token`+`x-admin-secret`+`x-relay-secret` vào `allowedHeaders` [server.js](render.com/server.js). KHÔNG phải do localhost (localhost:8080 vốn trong allow-origin) — lỗi cả prod.

### [live-chat] Reconcile NỀN: snippet Pancake bị cắt → fetch full text (user chọn) ✅

WS-direct lưu `conv.snippet` bị Pancake cắt ~64 ký tự + "…" (3% comment dài). `/ingest` phát hiện snippet cắt → gọi `reconcileFullText(pageId,postId,convId,rowId)` [web2-livestream-poller.js](render.com/services/web2-livestream-poller.js) NỀN: fetch full text 1 conversation (`_fetchConversationComments`, KHÔNG re-fetch cả post) → UPDATE đúng dòng WS-direct → `_notify` → client delta đổi snippet→full ~1-2s. Guard in-flight theo rowId. Comment hiện NGAY (snippet), tự đủ chữ sau.

### [web2] Adopt Web2CustomerChat → balance-history + customers nâng từ chỉ-xem lên FULL chat ✅

User: "ok" (đồng ý nâng balance-history + customers từ read-only lên full chat).

- **balance-history** `openChatForPhone(phone,name)`: có SĐT → `Web2CustomerChat.open({phone,name})` (full Pancake+Zalo); không có SĐT → giữ fallback `Web2ChatReadonly.openSearch` (search read-only).
- **customer-detail-modal** (shared, dùng ở customers + balance-history) `openChat()`: có SĐT → `Web2CustomerChat.open(...)`; fallback read-only nếu launcher chưa load.
- **pending-match GIỮ read-only picker** (`onPick`) — đó là chọn KH để GÁN giao dịch, KHÔNG phải chat.
- Load thêm `web2-zalo.js` + `web2-extension-bridge.js` + `web2-customer-chat.js` ở [balance-history](web2/balance-history/index.html) + [customers](web2/customers/index.html); bump customer-detail-modal `?v=20260615cc`.
- Verified live (browser session): balance-history `Web2CustomerChat.open({phone})` → drawer 2 tab, panel mounted + composer + 25 tin. J&T đã verify trước.
- Files: [web2-balance-history-app.js](web2/balance-history/js/web2-balance-history-app.js), [web2-customer-detail-modal.js](web2/shared/web2-customer-detail-modal.js), 2 index.html. Status: ✅ Done.

### [web2][shared] Web2CustomerChat — launcher FULL chat KH (Pancake + Zalo) dùng chung ✅

**User:** "1. Bấm sđt mở full chat pancake và zalo đi. 2. Web 2.0 có shared khung chat pancake/zalo chưa? Chưa thì làm để trang khác dùng chung (live-chat, native-orders, balance-history…)." + "hiệu ứng lấy ở airbnb/lottie-web".

- **Khảo sát (workflow 3 agent map subsystem chat)**: phát hiện **ĐÃ CÓ sẵn component chat dùng chung**:
    - **Pancake**: `Web2ChatPanel` ([web2/shared/chat-panel/web2-chat-panel.js](web2/shared/chat-panel/web2-chat-panel.js)) — UI adapter-pattern, mode full/readonly/picker, ĐỌC+SOẠN+GỬI. live-chat (`PancakeChatWindow`) + **native-orders** đã dùng. `Web2Chat` = API client.
    - **Zalo**: `Web2Zalo.mountChat()` — full chat embeddable (J&T group drawer đang dùng).
    - → KHÔNG dựng lại engine. Thiếu = **launcher theo SĐT** mở cả 2 kênh.
- **MỚI** [web2/shared/web2-customer-chat.js](web2/shared/web2-customer-chat.js) (`window.Web2CustomerChat`):
    - `Web2CustomerChat.open({phone, name?, channel?})` → drawer phải, **2 tab Pancake | Zalo**, lazy-mount mỗi kênh khi xem.
    - Pancake: `resolvePancakeConv(phone)` (quét mọi page) → `Web2ChatPanel.mount(...).open(conv, adapter)` với **adapter tự chứa** (chỉ phụ thuộc Web2Chat/Web2Ext, KHÔNG PancakeState). Gửi **extension-first (bypass 24h)** → fallback Web2Chat (upload+send+PAT retry) — port từ pancake-chat-window.
    - Zalo: `Web2Zalo.mountChat(host, {phone})`.
    - **Lazy-load** panel bundle (css + emoji/sticker/entity data + panel.js) lần đầu mở tab Pancake → host page chỉ cần load web2-chat-client.js + web2-zalo.js + web2-customer-chat.js.
    - **Hiệu ứng = Web2Lottie (airbnb/lottie-web)**: loading / hội thoại trống (`data-w2-lottie`).
- **Wire J&T**: bấm SĐT (`openMsgModal`) giờ gọi `Web2CustomerChat.open({phone,name})` — thay modal soạn-nhanh cũ. Gỡ sendViaZalo/sendViaPancake. Load thêm web2-extension-bridge + web2-customer-chat; bump app `?v=20260615n`.
- **Tái dùng cho trang khác**: balance-history / customers / returns / purchase-refund chỉ cần `Web2CustomerChat.open({phone})` (sẽ adopt dần — hiện balance-history/customers đang dùng Web2ChatReadonly read-only).
- Frontend-only. Files: [web2-customer-chat.js](web2/shared/web2-customer-chat.js), [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [index.html](web2/jt-tracking/index.html). Status: ✅ Done (cần verify live).

### [live-chat] Comment dài hiện ĐỦ (bỏ cắt "...") ✅

User: "comment nội dung dài bị lỗi ... không hiện hết". Mobile `.c-msg` đang `-webkit-line-clamp:3` → cắt 3 dòng + "...". Gỡ clamp ([comments-mobile.html](live-chat/comments-mobile.html)), giữ `word-break:break-word`+`overflow-wrap:anywhere` (chống tràn URL/từ dài). Desktop `.live-conv-message` thêm cùng wrap (defensive, không clamp sẵn). (`?v=20260615fulltext`)

### [live-chat][desktop] Topbar hiện SỐ ĐƠN trong livestream đang chọn ✅

User: "số đơn trong bài livestream đó lên topbar". Thêm badge **🛒 N đơn** cạnh **💬 N** ở `#liveTopbarActions` ([live-comment-list.js](live-chat/js/live/live-comment-list.js) `_updateTotalBadge`+`_orderCount`). Đếm distinct mã đơn NATIVE_WEB (`sessionIndexMap`) của comment đang hiển thị (state.comments của campaign đang chọn). Cập nhật mỗi render (tạo đơn → enrich → re-render → badge tăng). (`?v=20260615orders`)

### [live-chat][mobile] Chip Store/House hiện SỐ ĐƠN đã tạo + nút Toàn màn hình (F11) ✅

User (trang comments-mobile): (1) hiện tổng đơn đã tạo của Store/House, (2) nút toàn màn hình như F11.

- **Count đơn/page**: `updateOrderCounts()` đếm distinct khách (`fb_id`) có `has_order` theo page (Store=270136663390370, House=117267091364524) → badge `.chip-cnt` trên chip Store/House + tổng ở "Đã tạo đơn". Cập nhật trong doRender + applyDelta. [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[comments-mobile.html](live-chat/comments-mobile.html).
- **Fullscreen**: nút `#btnFull` header → Fullscreen API (`requestFullscreen`/`exitFullscreen`, webkit fallback); `.hd-btn.on` khi đang fullscreen. (`?v=20260615chips`)

### [web2][shared] J&T tracking — bấm SĐT nhắn tin (Zalo/Pancake) + nút tag Pancake "XỬ LÝ BC" ✅

**User:** "1. Bấm vào sđt bỏ chức năng copy → mở modal nhắn tin với khách bảng chọn zalo hoặc pancake. 2. Nút tag pancake → đánh tag XỬ LÝ BC như hình." Chọn kiểu: **soạn nhanh gửi liền**.

- **Bấm SĐT → modal nhắn tin** (bỏ copy): `parseOrderInfo(src)` tách `{phone,name}` từ dòng đơn tab-delimited (verify 5 đơn live: Phương Liễu/Ngọc Thuý/Huong Pham…). SĐT trong tin nhắn giờ `data-msg-phone` (capture-phase → KHÔNG mở modal chi tiết). Modal `openMsgModal`: toggle **Pancake/Zalo** + textarea + Gửi.
    - Zalo: `Web2Zalo.getConversation(phone)` → `sendMessage({account_key,thread_id,thread_type})`.
    - Pancake: `resolvePancakeConv(phone)` quét mọi pageId (giống web2/customers `_getPageIds`) → `Web2Chat.sendMessage(pageId,convId,{text,customerId})`. Thiếu hội thoại → toast cảnh báo, không lỗi.
- **Nút tag Pancake "XỬ LÝ BC"** per-row (icon tag): `resolvePancakeConv(phone)` → `Web2Chat.fetchTags(pageId)` tìm thẻ tên "XỬ LÝ BC" (case-insensitive) → `Web2Chat.toggleTag(pageId,convId,tagId,'add')`. Loading state, await + toast (external mutation, không UI-first).
- **Shared mới**: thêm `fetchTags(pageId)` + `toggleTag(pageId,convId,tagId,action)` vào [web2-chat-client.js](web2/shared/web2-chat-client.js) (mirror PancakeAPI live-chat; nguồn chung cho mọi trang web2). Qua worker `/api/pancake-official/.../tags`.
- Frontend-only (Pancake/Zalo đi qua worker + route sẵn có — KHÔNG cần deploy backend). Load thêm `web2-chat-client.js`; bump css/app `?v=20260615m`.
- Files: [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css), [index.html](web2/jt-tracking/index.html), [web2-chat-client.js](web2/shared/web2-chat-client.js). Status: ✅ Done.

### [live-chat] Comment mới có KHUNG xanh ~1s để biết là mới ✅

User: "comment mới có khung sau 1s để biết comment mới". Mở rộng keyframe `.is-new`: fade opacity nhanh (0-0.25s) + **box-shadow ring xanh 2px (`rgba(0,104,255,.6)`) giữ ~1s rồi mờ dần** (tổng 1.5s ease). Ring = "khung" ôm bo góc, KHÔNG xô layout. Desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html) (giữ shadow nền `var(--c-shadow)`). Burst-guard giữ nguyên (dồn dập → không khung). (`?v=20260615frame`)

### [live-chat] Re-add fade comment mới = OPACITY THUẦN (chuẩn livestream, research GitHub) ✅

Research 10+ repo (Bilibili OBS overlay, pixelfed, surmon.me, 100ms…): chuẩn dịu nhất cho livestream feed = **fade opacity thuần, KHÔNG trượt** (trượt translateY = cảm giác "đẩy từ trên xuống"). User chọn pattern này. Re-add `@keyframes {opacity 0→1}` 0.3s `cubic-bezier(0.4,0,0.2,1)` (material ease) cho `.is-new` (desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html)); burst-guard `_shouldAnimateNew`/`shouldAnimateNew` (batch>5 hoặc >12/2s → bỏ fade, hiện tức thì); respect prefers-reduced-motion. (`?v=20260615fade2`)

### [web2][render] Zalo — chỉ giữ tin 2 nhóm "XỬ LÝ NJD" + tự xoá sau 7 ngày ✅

**User** (kèm ảnh 2 nhóm "XỬ LÝ NJD - J&T" + "XỬ LÝ NJD - THÀNH PHỐ"): "xóa hết dữ liệu hiện có → chỉ lấy tin nhắn 2 nhóm như hình và xóa sau 7 ngày". Chốt: **khoá đúng 2 nhóm hiện tại** (theo thread_id, không auto-thêm nhóm mới) + **giữ đăng nhập, chỉ wipe tin/hội thoại/ảnh**.

- **Allowlist nhóm theo dõi**: bảng mới `web2_zalo_tracked_groups (account_key, thread_id, name, added_at)` [web2-zalo-schema.js](render.com/db/web2-zalo-schema.js). Bảng có ≥1 row → filter BẬT (chỉ lưu nhóm trong bảng); rỗng → TẮT (lưu tất, an toàn). Cache in-memory `_trackedSet`/`_filterActive` + `_loadTracked()` (boot + refresh 60s + sau mỗi thay đổi).
- **Filter ở `_persistIncoming`**: tin của hội thoại không theo dõi (1-1, nhóm ngoài DS) bị bỏ qua hoàn toàn. `sync-conversations` (nút Đồng bộ + auto-sync) cũng skip non-tracked → không ngập lại list.
- **Endpoints**: `GET/POST /tracked-groups`, `DELETE /tracked-groups/:acc/:thread` (manual add/remove), `POST /admin/reset-to-tracked` (x-admin-secret=CLEANUP_SECRET) → khớp tên `pattern` mặc định "XỬ LÝ NJD" (hoặc `groups[]` thủ công) → seed tracked → WIPE messages/conversations/media/members (GIỮ accounts + ZNS) → tái tạo dòng hội thoại 2 nhóm. Có `dryRun`/`confirm:'YES-RESET'`.
- **Retention 7 ngày**: `runZaloRetention(7)` xoá messages+media `< now-7d` (giữ dòng hội thoại, clear preview cũ). Cron [server.js](render.com/server.js) `!DISABLE_WEB2_JOBS` (chạy ở web2-api): 1 phút sau boot + mỗi 6h.
- **J&T auto-ingest** giờ chỉ chạy cho 2 nhóm tracked (đúng chỗ mã vận đơn từ nhóm J&T).
- Files: [web2-zalo-schema.js](render.com/db/web2-zalo-schema.js), [web2-zalo.js](render.com/routes/web2-zalo.js), [server.js](render.com/server.js). Status: ✅ Code xong, syntax OK — chờ deploy + chạy `/admin/reset-to-tracked` trên prod.

### [live-chat] BỎ HẾT hiệu ứng comment mới (cả 2 trang) ✅

User: "bỏ hết hiệu ứng bình luận mới + hiệu ứng đẩy trượt từ trên xuống". Gỡ `.is-new` (fade) + burst helper `_shouldAnimateNew`/`shouldAnimateNew` + CSS `@keyframes liveCommentIn`/`cardIn` ở [live-comment-list.js](live-chat/js/live/live-comment-list.js)+[live-comments.css](live-chat/css/live/live-comments.css) (desktop) và [comments-mobile.js](live-chat/js/live/comments-mobile.js)+[comments-mobile.html](live-chat/comments-mobile.html) (mobile). Comment mới hiện TỨC THÌ, không animation. (`?v=20260615noanim`)

### [web2][render] J&T tracking — "chuyển hoàn" ≠ "đã giao" → thêm status `returned` (Đã hoàn) ✅

**User** (kèm ảnh): đơn `802759556302` event `"Đơn hàng chuyển hoàn thành công…"` bị gán **Đã giao** — "chuyển hoàn -> không phải đã giao".

- **Root-cause**: `deriveStatus` kiểm `thành công`/`ký nhận` (→ delivered) TRƯỚC `chuyển hoàn`. "Chuyển hoàn **thành công**" chứa `thành công` nên trúng `delivered` trước.
- **Fix**: tách hẳn status mới **`returned` ("Đã hoàn", cam #ea580c, icon undo-2)** thay vì gộp vào `problem` (nhóm "XỬ LÝ NJD - J&T" chuyên xử lý hoàn → đáng tách riêng). Kiểm `chuyển hoàn|hoàn hàng|hoàn về|trả hàng|trả về` **TRƯỚC** delivered ở cả [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `deriveStatus` lẫn frontend `deriveFromDesc`. Gỡ `hoàn hàng/hoàn về/chuyển hoàn` khỏi nhóm `problem`.
- **Sửa data cũ không cần fetch lại**: thêm `_rederiveStored(db)` chạy đầu `POST /refresh` — re-derive status từ `events` JSONB đã lưu (rẻ, idempotent, không gọi J&T) → đơn `delivered` sai tự về `returned` khi bấm "Làm mới tất cả". `delivered` là final (refresh không re-fetch) nên cần bước này.
- **Frontend**: STATUS + KPI_ORDER + KPI_META + CSS tokens `--st-returned`/`--st-returned-bg`. Bump css/app `?v=20260615k`.
- **Hardening (audit 121 sự kiện J&T THẬT từ 16 đơn live)**: thêm 2 false-positive nghiêm trọng → sửa:
    - `"Nhân viên… của bưu cục đã nhận hàng"` (×14 — NV bưu cục **lấy/nhập kho**, còn trung chuyển) bị gán **delivered** vì keyword `đã nhận hàng`. Giao thật chỉ khi `"Đơn hàng đã ký nhận. Người ký nhận là:【khách】"`. → bỏ `đã nhận hàng`+`thành công` trần; delivered = `ký nhận|giao hàng thành công|giao thành công|phát thành công`.
    - `"Người nhận từ chối nhận hàng"` bị gán delivered vì keyword `người nhận` quá lỏng + thứ tự. → bỏ `người nhận`; xét **returned/problem TRƯỚC delivered**; guard `(giao) không/chưa thành công`=thất bại.
    - Verify khớp 100% 121 sự kiện thật (transit 75 / delivering 19 / problem 18 / delivered 5 / returned 4); delivered 7→5. Bump app `?v=20260615l`.
- Files: [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js), [jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js), [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css), [index.html](web2/jt-tracking/index.html). Status: ✅ Done (deploy web2-api + GH Pages).

### [live-chat] Hiệu ứng comment mới = FADE thuần dịu, không flash ✅

User: "nhẹ nhàng không phải flash". Bỏ `translateY` (trượt + prepend đẩy dòng = cảm giác lóe), chỉ còn fade `opacity 0→1` 0.55s `ease` (đều, chậm). Desktop [live-comments.css](live-chat/css/live/live-comments.css) + mobile [comments-mobile.html](live-chat/comments-mobile.html). Burst-guard giữ nguyên.

### [web2][shared] Web2Lottie — animation Lottie (airbnb/lottie-web) dùng chung TOÀN BỘ Web 2.0 ✅

**User:** "kiểm tra toàn bộ web 2.0 → phần CSS giao diện dùng airbnb/lottie-web → thêm vào toàn bộ web → thêm thông minh". Scope chọn: **tinh tế** (empty/loading/success/error) + **CDN lazy-load**.

- **Precedent**: `web2/jt-tracking/` đã dùng lottie-web (cdnjs 5.12.2) với JSON local. Mở rộng thành module shared cho mọi trang.
- **Module mới** [web2/shared/web2-lottie.js](web2/shared/web2-lottie.js) (`window.Web2Lottie`):
    - **Lazy**: chỉ tải `lottie_light.min.js` (cdnjs, SVG-only ~150KB) khi animation ĐẦU TIÊN cần → trang đủ data không tốn bandwidth. CDN fail → no-op graceful.
    - **Auto-enhance trạng thái RỖNG** (thông minh, toàn site): scanner + `MutationObserver` (debounce 150ms) tự thay `.empty-state-icon` (lucide) bằng Lottie theo `ICON_MAP` (inbox/package→box "empty", alert→"error"…). KHÔNG cần sửa từng trang. Trễ 350ms + check còn-trong-DOM → bỏ qua empty-state tạm khi đang tải.
    - **Declarative**: `<div data-w2-lottie="loading"></div>` tự mount.
    - **Burst feedback** `success()/error()` giữa-trên màn hình, throttle 1000ms chống spam.
    - `loadingOverlay(show)`, `scan(root)`, registry Map + `_reap()` dọn anim detached (chống leak RAF).
    - Respect `prefers-reduced-motion` → `enabled=false`, no-op hoàn toàn.
- **Assets** [web2/shared/lottie/](web2/shared/lottie/): `loading.json` (copy jt-tracking 33KB), `success.json` (check draw-on, 1KB), `error.json` (X draw-on, 1.5KB), `empty.json` (box float loop, 1.2KB) — hand-authored bodymovin trim-path, tổng ~37KB.
- **CSS** [web2/shared/web2-lottie.css](web2/shared/web2-lottie.css): holder empty-icon 64px, burst, loading overlay (no backdrop-blur, shadow ≤24px theo modal rule).
- **Wiring 2 điểm**: (1) [web2-sidebar.js](web2/shared/web2-sidebar.js) auto-load `web2-lottie.js` qua `inject()` → MỌI trang Web 2.0. (2) [web2-optimistic.js](web2/shared/web2-optimistic.js) `_notify` gọi `Web2Lottie.success()/error()` (web2-only, `config.autoFeedback` toggle, never block).
- **Tách Web1⊥Web2**: KHÔNG đụng `shared/js/notification-system.js` (dùng chung Web 1.0). Web 1.0 không load web2-sidebar → không có Web2Lottie (verified: orders-report sạch).
- **Verify browser** (localhost, persistent session): module auto-load qua sidebar (`v=20260615a`) + CSS inject ✓; lib lazy-load CDN ✓; 2 empty-state → 2 SVG render (box xanh + X đỏ) + icon gốc ẩn ✓; declarative loading SVG ✓; **0 console error**; screenshot xác nhận visual.

**Status:** ✅ `node --check` PASS cả 3 file. Cần GH Pages deploy.

### [web2][jt-tracking] Hiện toàn bộ tin nhắn chứa mã + chỉ nhận mã ĐÚNG format dòng đơn + copy SĐT ✅

1. **src_message** (cột mới TEXT): lưu TOÀN BỘ tin nhắn nhóm chứa mã → row + modal hiện đầy đủ (tên/SĐT/ghi chú KH), tô đậm mã 12 số + tô xanh SĐT.
2. **Copy SĐT**: bấm số → copy clipboard; listener **capture-phase** `[data-copy]` (stopPropagation TRƯỚC click row) → KHÔNG mở modal. Hoạt động list/modal/drawer.
3. **Chỉ nhận mã đúng FORMAT dòng đơn** (user: "phải có dạng `<mã> Shop NHI JUDY 01 <tiền>` mới nhận"): `ORDER_CODE_RE = /(?<!\d)(\d{12})(?!\d)\s+Shop\s+NHI\s*JUDY/gi` cho autoIngest + scan (loại reply/mention "@Nhi Judy Store 802… em báo…" + số 12 ngẫu nhiên). `/add` manual giữ `\d{12}`. SQL pre-filter scan: `~* 'shop\s+nhi\s*judy'` (superset regex). Review 11-agent fix: digit-boundary (chặn 13 số) + SQL superset (tab/2-space/newline).
4. **src_message ưu tiên dòng đơn** (`COALESCE(EXCLUDED, existing)`): re-scan ghi đè text reply cũ bằng dòng đơn. Verified: 15/23 row có dòng đơn (tên/SĐT). Còn 8 row "reply-only" = mã thật nhưng dòng đơn KHÔNG có trong message store (chỉ có reply) → giữ (đơn vấn đề thật, vẫn track status J&T).

Commits `16b130a61` (+ trước đó). Schema cột `src_message`/`zalo_conv_id` đã migrate + scan backfill. **Status:** ✅

### [live-chat] Layout dòng comment: trạng thái về cạnh TÊN (tên → trạng thái → page) ✅

**User:** "chuyển trạng thái qua bên trái → tên - trạng thái - page" (status đang ở góc phải).

- **Mobile** [comments-mobile.js](live-chat/js/live/comments-mobile.js): đưa `.st` (status) vào `.c-name` ngay sau tên, trước `.pgbadge`. Bọc tên trong `.c-nm-txt` (ellipsis) để tên dài không che status/page.
- **Desktop** [live-comment-list.js](live-chat/js/live/live-comment-list.js): chuyển `.inline-status-container` từ phần tử riêng (bị flex đẩy phải) vào trong `.live-conv-header` sau tên, trước page badge.

**Status:** ✅ `node -c` PASS. Cần GH Pages deploy (`?v=20260615status`).

### [live-chat] Hiệu ứng comment mới DỊU MẮT + burst-aware (desktop + mobile) ✅

**User:** "hiệu ứng comment mới làm dịu, nhẹ nhàng tránh nhức mắt + trường hợp comment nhiều liên tiếp thì sao?"

- **Animation dịu**: keyframe `liveCommentIn`/`cardIn` fade (opacity 0→1) + trượt nhẹ `translateY(-5px→0)`, 0.36s ease-out-expo, compositor-only (transform+opacity). Desktop [live-comments.css](live-chat/css/live/live-comments.css) `.live-conversation-item.is-new`; mobile [comments-mobile.html](live-chat/comments-mobile.html) `.card.is-new`. respect `prefers-reduced-motion`.
- **CHỈ animate dòng MỚI**: trước đây mobile gắn `animation: cardIn` cho **MỌI** `.card` → mỗi render cả list nháy nhức mắt. Bỏ blanket, chỉ gắn `.is-new` cho card/dòng vừa chèn (gỡ sau `animationend`).
- **Burst-aware** (`_shouldAnimateNew`/`shouldAnimateNew`): batch >5 dòng HOẶC >12 dòng animate/2s = **comment dồn dập** → TẮT hiệu ứng → hiện tức thì, tránh nháy loạn. Flow thường (≤vài/giây) → animate dịu.

**Status:** ✅ `node -c` PASS. Cần GH Pages deploy (`?v=20260615anim`).

### [web2][jt-tracking][zalo-chat] J&T: fix mất composer chat drawer + nén dashboard gọn ✅ (`b33d74d64`)

1. **Composer (ô soạn tin) mất trong chat drawer**: `.wz-chat-body` thiếu `flex:1 1 auto; min-height:0; overflow-y:auto; flex column` trong engine CSS — các rule này CHỈ có ở `web2-zalo.css` (trang Zalo). Nhúng `mountChat` ngoài trang Zalo → body phình theo nội dung, đẩy `.wz-composer` xuống dưới màn. Fix: thêm vào [chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css) (`.wz-chat-main .wz-chat-body`) → composer ghim đáy. Verified live: composer hiện đủ (input + ảnh/file/emoji + gửi).
2. **Nén dashboard** [jt-tracking.css](web2/jt-tracking/css/jt-tracking.css): KPI nhỏ (padding 8/12, num 19px, `minmax(104px)`) → 8 thẻ gọn 1 hàng; quick-add cao 42 + padding 8; giảm margin header/main. → list lên cao, đỡ tốn diện tích (verified: ~6 row hiện thay vì ~2).

Bump `ENGINE_VER=20260615c` + css/app `?v`. Nối tiếp 2 entry J&T cùng ngày bên dưới.

### [live-chat][web2-realtime] WS-DIRECT comment livestream (bỏ poll, nhanh như TPOS) + render APPEND-only đúng invariant 🔄

**User:** "không realtime cập nhật + render TOÀN BỘ → comment mới append liền không đụng cũ" → "so tốc độ web2 vs tpos" → **"sao lại còn live poll?"**

**Tốc độ:** TPOS dùng comment trong event WS trực tiếp (~<1s). Web 2.0 CŨ: relay nhận WS `pages:update_conversation` rồi **vứt comment đi, trigger `pollPostNow` REST fetch lại CẢ post + debounce 1.5s** → chậm vài→chục giây. Payload WS đã đủ (`conv.snippet`+`from`+`message_count`+`updated_at`); conv.id không có id từng comment → lý do họ phải fetch.

**Fix WS-direct** ([web2-live-comments.js](render.com/routes/web2-live-comments.js)): `/ingest` dùng LUÔN comment trong event WS → upsert + `_notify` NGAY, **bỏ pollPostNow auto-trigger**. `_mapWsConvToComment` id duy nhất `${conv.id}_${message_count}` (mỗi comment 1 dòng, không đè; fallback updated_at), createdTime=`updated_at`. → ~<1s như TPOS.

**Fix render APPEND-only** ([live-comment-list.js](live-chat/js/live/live-comment-list.js) `prependComments`): bỏ fallback full `renderComments()` khi out-of-order (nguồn "render toàn bộ"). Chèn bằng index trong `_filteredAll` → giữ invariant `DOM==filtered.slice(0,_renderLimit)`. **Review 15-agent bắt HIGH bug** (chèn ngoài window+bump → cuộn TRÙNG+SÓT) → idx≥số dòng render → SKIP, không bump; `_ensureScrollSentinel`. Mobile đã append-only sẵn.

**Status:** ✅ deployed + verified: WS-direct ghi DB (id `_<msgcount>`), 0 joinError. Đo: độ trễ còn lại 5-9s là **WS push của pancake.vn** (`relay-nhận − conv.updated_at`), KHÔNG phải pipeline ta (<1s sau nhận). TPOS <1s vì dùng chatomni (nguồn khác). User chốt giữ pancake WS. ⚠ Tradeoff: 2 comment cùng người cùng WS-cycle (hiếm) có thể gộp.

**ZERO INTERVAL (user 2026-06-15):** gỡ nốt `setInterval(loadPosts, 90000)` [comments-mobile.js](live-chat/js/live/comments-mobile.js) → DANH SÁCH bài live cũng event-driven: SSE `web2:live-comments` → throttle 30s leading-edge → loadPosts (idle = không chạy). Audit: MỌI trang pancake (index/comments-mobile/chat) WS-direct — comment = SSE `web2:live-comments`, inbox = SSE `web2:messages` ([pancake-realtime.js](live-chat/js/pancake/pancake-realtime.js)), poller nền DISABLED. Không còn data-poll/setInterval nào.

### [web2][jt-tracking][zalo-chat] J&T follow-up: KPI "Đã duyệt" + fix input + fix chat drawer text dọc ✅

Tiếp theo entry dưới (cùng ngày):

1. **KPI/filter "Đã duyệt"** ([jt-tracking-app.js](web2/jt-tracking/js/jt-tracking-app.js) + [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) `/list status=approved` → `approved_at IS NOT NULL`).
2. **Fix giao diện input** thanh nhập mã: `align-items:center` + height đồng đều 46px (bỏ `height:100%` gây cao lệch). ⚠ Quên bump `jt-tracking.css?v` ở các lần trước → scroll/drawer fix không load; đã bump `?v=20260615d`.
3. **Fix chat drawer chữ DỌC 1 ký tự** (`a552ff9f4`→`4189c9c80`): `Web2Zalo.mountChat` nhúng ngoài trang Zalo (Tra cứu J&T) thiếu `.wz-chat-main`/`.wz-chat-head` + biến `--wz-*` (chỉ có ở `web2-zalo.css`/`.web2-theme`) → bong bóng co ~1ch. Fix: thêm các style này vào **[chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css)** (ENGINE_CSS, scope `.wz-chat-main`) → self-contained mọi nơi mountChat; tách `#jtChatBody` khỏi `.jt-drawer-body`; bump `ENGINE_VER=20260615b`.

**Verified live (browser):** chat drawer render NGANG đúng (header "XỬ LÝ NJD - J&T", @mention xanh, bong bóng + reaction). Scan backfill `zalo_conv_id` cho 23 row cũ → có nút Mở chat. **Status:** ✅

### [web2][jt-tracking][zalo] J&T: auto-ingest realtime + mở chat nhóm + @mention + fix scroll/sidebar ✅

**User (nhiều lượt):** auto thêm mã J&T từ tin nhắn nhóm Zalo realtime (không refresh); Web 2.0 không scroll được; nút mở chat nhóm J&T (chat được); @tên xanh lên; reply nếu chưa có.

1. **Auto-ingest realtime** [web2-zalo.js](render.com/routes/web2-zalo.js) `_persistIncoming`: tin NHÓM mới → `web2-jt-tracking.autoIngestFromZalo(_pool,msg)` (fire-and-forget) → mã `80\d{10}` → INSERT pending + SSE `web2:jt-tracking` (UI tự thêm) → fetch nền điền trạng thái + SSE lần 2. Verified: gom 23 mã từ "XỬ LÝ NJD - J&T".
2. **Fix scroll**: `web2-sidebar.css` đặt `.web2-shell{height:100vh;overflow:hidden}` → cột `main` PHẢI tự cuộn. Thêm `.web2-shell>main{height:100vh;overflow-y:auto}` ([jt-tracking.css](web2/jt-tracking/css/jt-tracking.css)). Cũng fix sidebar trống: gọi `Web2Sidebar.mount('#web2Aside')` trong init (sidebar KHÔNG tự mount).
3. **Mở chat nhóm**: lưu `zalo_conv_id` vào `web2_jt_tracking` (autoIngest + scan backfill, upsert `xmax=0`). Row Zalo có nút "Mở chat" → drawer phải → `Web2Zalo.mountChat({convId})` (lazy-load chat engine). Chat 2 chiều + reply (đã có sẵn từ trước).
4. **@mention xanh**: [bubbles.js](web2/shared/zalo-chat/bubbles.js) `fmtText` = esc + regex `@tên` (token sau viết hoa) → `.wz-mention` xanh ([chat-bubbles.css](web2/shared/zalo-chat/chat-bubbles.css)). Bump `ENGINE_VER=20260615a` + bubbles/css version trang Zalo.

**Status:** ✅ `node -c` + load PASS. Deploy web2-api (render.com) + GH Pages. Reply Zalo đã có sẵn (chat-store setReplyTarget + composer reply-bar) → không cần làm.

### [live-chat][web2-realtime][worker] FIX comment livestream KHÔNG về 2 trang Live — relay join per-page `pages:{id}` + UI chọn trang 🔄

**User:** "2 trang live-chat/index + comments-mobile không nhận comment livestream nữa? ... không phải account hết gói cước mà có nhiều account có quyền server pancake → tách 2 server House/Store vì multi page bị lỗi → làm endpoint thay id page là kết nối + checkbox chọn trang (House+Store mặc định, thêm trang tick thêm)."

**Chẩn đoán (browser-test + research):** Client 2 trang OK (SSE subscribe `web2:live-comments` + delta fetch verified end-to-end, broadcast test → `clientsNotified:3`). Root cause ở **relay web2-realtime**: join `multiple_pages:${uid}` GỘP 4 page → 1 page hết gói cước (`193642490509664`) làm Pancake reject CẢ BÓ ("Gói cước hết hạn" / err 122) → `eventsReceived=2/giờ`, ring buffer rỗng → 0 push SSE. Comment chỉ vào DB nhờ client `/poll-now` lúc mở trang (warm-up). Probe pancake.vn (account khác) nhận 5 comment/60s qua per-page `pages:{id}` → xác nhận fix.

**Fix per-page (mirror `web2/shared/web2-realtime.js`):**

- [live-chat/server/server.js](live-chat/server/server.js) `joinChannels()`: bỏ `multiple_pages:`, join `pages:{pageId}` TỪNG TRANG (`{accessToken,userId,platform:web}`). Page hết hạn chỉ page đó lỗi 122 (drop khỏi `joinedPages`), các page khác vẫn nhận `pages:update_conversation` livestream comment. `handleMessage` xử lý err 122 per-page.
- **Selection** (chọn trang): bảng `web2_live_relay_pages` (page_id, enabled). `startClient` lọc page bị tắt; lưu `client.allPages` meta cho UI. Endpoints relay: `GET /api/pages-available` (mọi trang + enabled/joinFailed + selected), `POST /api/connect-pages {userId,pageIds}` (lưu lựa chọn + reconnect per-page).
- **Proxy**: [render.com/routes/web2-live-relay.js](render.com/routes/web2-live-relay.js) (`GET /pages`, `POST /connect`) forward sang relay kèm `x-relay-secret` (frontend không có secret). Mount server.js. Worker route `WEB2_LIVE_RELAY` (`/api/web2-live-relay/*` → web2-api).
- **UI**: card "Server realtime (WS) — chọn trang nhận comment" ở [web2/pancake-settings/](web2/pancake-settings/index.html) — checkbox per trang (mặc định bật hết, trang hết gói cước hiện tag), Lưu & kết nối lại → `/connect`.
- Diagnostic: [scripts/pancake-ws-probe.js](scripts/pancake-ws-probe.js) (one-shot, đọc JWT từ serect, KHÔNG commit secret).

**Status:** ✅ **VERIFIED LIVE**. Relay reconnect (account `c42ef91d`, 2 page per-page join) — **0 joinError** (hết "Gói cước hết hạn"), `eventsReceived` 21→36/40s (trước kẹt 2/giờ), comment mới `03:57:27` vào DB (vượt mốc kẹt 03:25:07) → WS→ingest→DB→SSE sống lại. Worker deploy ✅. ⚠ Workflow "Deploy" (Firebase vite) lỗi **pre-existing** (web2-motion top-level await — 5 push trước cũng lỗi, KHÔNG do commit này; site chạy GH Pages raw file).

**Gỡ poll (2026-06-15):** đã gỡ client `POST /poll-now` warm-up ở [live-init.js](live-chat/js/live/live-init.js) + note server-direct cả 2 trang ([live-init.js](live-chat/js/live/live-init.js) + [comments-mobile.js](live-chat/js/live/comments-mobile.js)). ⚠ Hệ quả: trang campaign phải BẬT ở pancake-settings (card "Server realtime (WS) — chọn trang") mới có comment realtime (mặc định bật hết). TODO sau: dọn TPOS còn sót Web 2.0.

### [web2][jt-tracking][render] Trang mới: Tra cứu vận đơn J&T (Báo cáo) ✅

**User:** "Tạo trang lấy tất cả mã 12 số (vd 802762251204) → tracking J&T (jtexpress.vn ?billcode=&cellphone=8674) → hiển thị timeline → tối ưu giao diện/quản lý → hiệu ứng lottie-web. Nằm ở menu Báo cáo. Bỏ xóa/thùng rác → nút Duyệt + Trở lại; bấm Duyệt → mờ đi + tự xoá sau 7 ngày. Ô nhập mã tùy thích (auto 8674)."

**Research J&T:** jtexpress.vn render kết quả SERVER-SIDE vào HTML (`.result-vandon-item` = time/date/desc, mới nhất trên). `cellphone` BẮT BUỘC = 4 số cuối SĐT gửi; **`8674` chạy cho MỌI đơn shop** (verify 3 mã khác nhau) → mặc định, không cần SĐT từng đơn.

**Backend** [web2-jt-tracking.js](render.com/routes/web2-jt-tracking.js) (bảng `web2_jt_tracking` web2Db, SSE `web2:jt-tracking`):

- Parser HTML → events {time,date,desc,ts(+7→epoch)} + deriveStatus (delivered/delivering/transit/problem/pending/not_found).
- `/scan` (quét `web2_zalo_messages` mã 12 số), `/add` (dán tay), `/track` (fetch+lưu 1), `/refresh` (batch 25, **fetch song song chunk 5**, timeout 12s/mã), `/list` (filter+KPI), `/:billcode` (chi tiết, auto-fetch).
- **Duyệt**: `/:billcode/approve` (set approved_at → mờ) + `/unapprove` (trở lại); `_purgeApproved` tự xoá sau 7 ngày (gọi khi list). KHÔNG còn delete/trash.
- Mount `server.js` + initializeNotifiers.

**Frontend** [web2/jt-tracking/](web2/jt-tracking/index.html) (html+css+js riêng): dashboard KPI lọc theo trạng thái, ô nhập mã (cellphone auto 8674), Quét Zalo, Làm mới tất cả, search; modal timeline kiểu J&T (dot màu theo event, highlight 【...】); **Lottie** (lottie-web CDN + JSON tự host `lottie/`): loading + success + truck (empty/hero). Row đã duyệt mờ + tag "tự xoá sau N ngày". SSE realtime. Menu **Báo cáo → Tra cứu vận đơn J&T** ([web2-sidebar.js](web2/shared/web2-sidebar.js)).

**Review (2 agent code+security):** fix HIGH: `_upsertTracked` nhận `db` (không dùng `_pool` module — tránh ghi nhầm Web1 khi fallback); `deriveStatus` 'hoàn' trần → cụm chính xác ('hoàn hàng/về/chuyển hoàn'); Lottie leak khi mở modal nhanh → destroy trước. fix MEDIUM: approve/unapprove validate 12 số + 404; refresh onlyCodes skip approved; guard `_refreshing` chống 2 vòng refresh; esc billcode trong data-attr. SQLi/SSRF/XSS: clean (param hoá, billcode/cellphone chỉ digit, esc toàn bộ).

**Status:** ✅ `node -c` + require-load PASS. Cần deploy web2-api (render.com) + GH Pages (frontend).

**User:** "thêm NCC trùng tên đừng gộp vào" (trang Theo Dõi Nhập Hàng SL — inventory-tracking, Web 1.0). Thao tác: Thêm Đợt Hàng → 2 NCC cùng tên bị gộp thành 1 dòng trong bảng.

**Root cause:** `POST /shipments` ([render.com/routes/v2/inventory-tracking.js](render.com/routes/v2/inventory-tracking.js#L734)) có khối **dedup theo `(ngay_di_hang, dot_so, LOWER(TRIM(ten_ncc)))`** — nếu đã tồn tại dòng cùng ngày/đợt + cùng tên NCC thì **merge** sản phẩm/tiền/ảnh vào dòng cũ thay vì INSERT dòng mới (trả `merged:true`, notify `merge`). Client `saveShipment` gán name-only NCC số 901/902 phân biệt + render 1 dòng/DB-row, nên merge xảy ra hoàn toàn ở server.

**Fix (1 edit, backend):** gỡ khối dedup-merge (790–866) → luôn INSERT dòng mới. An toàn vì `inventory_shipments` PK = `id`, **không có** unique constraint trên `(ngay_di_hang, dot_so, ten_ncc/stt_ncc)`. 2 NCC trùng tên = 2 nhà cung cấp khác nhau → phải là 2 dòng. PUT `/shipments/:id` update theo `id` (không merge tên) → sửa đợt không re-merge. Không client nào phụ thuộc `merged` flag / notify `merge` (grep sạch).

**Verify:** `node -c` OK; không còn dangling `trimmedTen`/`existing` ngoài block payment-inheritance. **Cần deploy Render (fallback) ~2-4′** vì chạm `render.com/**`.

### [web2][render] Gỡ TPOS sạch (đợt 2): perm registry + 3 N+1 batch endpoint ✅

**User:** chọn "triệt để" cho cả 4 hạng mục sau khi quét TPOS đợt 1.

**Item 2 — Permission registry (web2-users.js):** gỡ action chết `loadTpos` (trang công nợ NCC) + `syncTpos` (trang tích hợp), đổi slug `tpos-pancake`→`live-chat` + label `'TPOS × Pancake'`→`'Live Chat (Pancake)'`, gỡ ACTION_LABELS loadTpos/syncTpos. Frontend KHÔNG dùng các slug/action này (grep sạch) → 0 ảnh hưởng UI. **Migration saved perms** (idempotent, trong ensureTables): rename key `tpos-pancake`→`live-chat` trong `web2_users.permissions` JSONB + strip loadTpos/syncTpos. **Test temp DB**: 4 user (có tpos-pancake+syncTpos / chỉ loadTpos / không liên quan / NULL) → đúng + run #2 no-op.

**Item 3 — DB columns `tpos_id`/`tpos_data`: NO-OP.** Web 2.0 KHÔNG có cột này (web2_customers schema cố ý TPOS-free, còn DROP bảng cũ nếu phát hiện `tpos_raw`). Các cột đó CHỈ tồn tại ở bảng Web 1.0 (`customers`, `web_warehouse`) — KHÔNG đụng (Web1⊥Web2).

**Item 4 — N+1 (3 chỗ):**

- **4a Ví KH** `web2-wallet-api.getWalletsByPhones`: N GET /by-phone → **POST /api/web2/wallets/batch-full** (service `getWalletsByPhones` = `WHERE phone = ANY`, full row) → 1 request/chunk 500 + fallback pool.
- **4b PBH bulkPrint**: N GET /:number → **GET /api/fast-sale-orders/batch?numbers=** (đặt TRƯỚC /:number) → 1 request + fallback per-number.
- **4c native-orders tạo PBH SHOP hàng loạt**: GIỮ N request độc lập (mỗi PBH = hoá đơn/kho/ví/advisory-lock riêng, partial-success đúng ngữ nghĩa — KHÔNG gộp 1 transaction vì 1 đơn lỗi không được rollback cả lô) NHƯNG đổi tuần tự→**song song giới hạn 5** (nhanh ~5×, 0 rủi ro money path).

**Files:** `render.com/routes/web2-users.js`, `render.com/routes/v2/web2-wallets.js`, `render.com/services/web2-wallet-service.js`, `render.com/routes/fast-sale-orders.js`, `web2/customer-wallet/js/web2-wallet-api.js`, `web2/fastsaleorder-invoice/pbh-app.js`, `native-orders/js/native-orders-app.js` + bump v 3 trang.

**Item 1 — DEPLOY + env (XONG):** xoá 3 env dead `TPOS_CLIENT_ID/TPOS_PASSWORD/TPOS_USERNAME` khỏi web2-realtime (204, verify NONE; live-chat/server không đọc). Deploy web2-api (auto trên push) + web2-realtime (commit `81adccb7e`) → cả 2 LIVE.

**Verify deployed (curl + browser):** perm catalog `/api/web2-users/pages` có `live-chat`, KHÔNG tpos-pancake/loadTpos/syncTpos ✅; `POST /wallets/batch-full` ✅; `GET /fast-sale-orders/batch` ✅; web2-realtime `facebook-status` ok env-token mode (cachedPages:0), `private-reply` 400 (alive), `refresh-tokens` 404 (removed) ✅. Browser: `getWalletsByPhones([3])` = 1 batch-full/0 by-phone; users/PBH/native-orders 0 console error. **Status:** ✅ HOÀN TẤT (code+migration tested, deployed, verified).

### [orders-report][Lên đơn lẻ] Trừ ví: "ghi nhớ đầu" + đối chiếu TPOS CHỈ khi mất phản hồi ✅

**User:** "đã tạo đơn thành công trên tpos thì bắt buộc phải có cơ chế trừ tiền của ví" + "chỉ làm ghi nhớ đầu, nếu sau khi hoàn tất hết mà không nhận được gì từ tpos trả về thì mới kiểm tra đơn trên tpos nếu có tồn tại đơn vừa tạo thì trừ tiền — còn lại toàn bộ cơ chế cũ giữ nguyên". (Đơn 71654/72298 trả trước nhưng ví không trừ khi mất phản hồi TPOS.)

**Root cause:** cơ chế trừ ví chỉ gửi lệnh trừ SAU KHI nhận được phản hồi TPOS thành công. Nếu `smartFetch(InsertListOrderModel)` ([tab1-sale.js:1222](orders-report/js/tab1/tab1-sale.js#L1222)) **throw** (mạng rớt/timeout — request có thể đã tới TPOS, tạo đơn, nhưng phản hồi mất) → nhảy `catch`, chỉ báo lỗi, KHÔNG kiểm tra TPOS, KHÔNG trừ ví. Backend cũng không có cron đối soát đơn paid-chưa-trừ → mất trừ vĩnh viễn.

**Fix (chỉ LÊN ĐƠN LẺ, additive — KHÔNG đụng payload/cơ chế cũ/TPOS), 1 file [tab1-sale.js](orders-report/js/tab1/tab1-sale.js):**

1. **`window.SaleWalletIntent`** (localStorage `n2_sale_wallet_intents`, keyed theo **MÃ ĐƠN/Reference** — có sẵn lúc bấm, TPOS chưa cấp số phiếu): `record/clear/all`.
2. **GHI NHỚ ĐẦU** — trước `smartFetch` POST: ghi `{reference, phone, amount=model.PaymentAmount}` + set `_saleReconcileCtx` (biến scope hàm, để `catch` đọc được — const trong try không nhìn thấy ở catch).
3. **`window._reconcileSaleOnLostResponse(ref,phone,amount)`** — đọc TPOS GetView theo `Reference eq <mã đơn>` (CHỈ ĐỌC), nếu có phiếu active (`_isActiveTposInvoice`: state open/paid / ShowState Đã xác nhận|Đã thanh toán, loại cancel/NotEnoughInventory) → POST `/api/v2/pending-withdrawals` **keyed theo SỐ PHIẾU TPOS** (`inv.Number`), source `RECONCILE_LOST_RESP`. Trùng khóa với đường-thành-công ⇒ backend dedupe (`UNIQUE(order_id,phone)` + guard sổ cái `wallet_withdraw_fifo`) ⇒ **KHÔNG trừ 2 lần**. Đơn không tồn tại → `{found:false}` → KHÔNG trừ.
4. **FALLBACK trong `catch`** ([tab1-sale.js](orders-report/js/tab1/tab1-sale.js)): nếu có `_saleReconcileCtx` → gọi reconcile; found → xoá ghi nhớ + toast "đã đối chiếu & trừ ví"; không found → giữ error cũ. Lỗi tạo đơn trước GHI-NHỚ (validation/auth) → ctx null → error như cũ.
5. **Xoá ghi nhớ ở CUỐI nhánh success** (sau khi qua hết, đã kích hoạt trừ ví cũ) — để exception sau-khi-tạo-đơn vẫn được catch đối chiếu (idempotent).
6. **Sweep khi tải lại trang** (`_sweepSaleWalletIntentsOnLoad`, +3s sau load): ghi nhớ còn sót >20s → kiểm tra TPOS → có đơn thì trừ + xoá; không có & >24h → bỏ stale. Phủ ca đóng trang/crash trước khi catch chạy.

**Luật chống lỗi:** khóa khi TRỪ THẬT = SỐ PHIẾU TPOS (cả 2 đường) ⇒ idempotent; số tiền = số GHI NHỚ (không lấy con số TPOS trả về); fallback chỉ ĐỌC TPOS. Đã hoàn tác thử nghiệm trước đó ở nút "Làm mới phiếu" (`refreshPBHForOrder` giữ nguyên display-only). **Status:** ✅ **TESTED browser** (KH 0392060072, mô phỏng mất phản hồi qua patch `smartFetch`): ca thành công → cơ chế cũ trừ (source `SALE_ORDER`), không double; ca mất phản hồi → đơn `NJD/2026/72311` tạo trên TPOS + fallback trừ ví đúng 1 lần (source `RECONCILE_LOST_RESP`), số dư giảm đúng 100k, sổ ghi nhớ tự xoá.

<!--
HƯỚNG DẪN THÊM ENTRY MỚI:

1. Nếu cùng ngày → thêm entry ngay dưới heading ## [NGÀY]
2. Nếu ngày mới → thêm heading ## [NGÀY MỚI] ở trên cùng (trước ngày cũ)

FORMAT:
### [module] Mô tả ngắn {✅ hoặc 🔄}
**Files**: `path/to/file.js`
**Chi tiết**: Thay đổi gì, tại sao

MODULE TAGS: [inbox] [chat] [extension] [orders] [worker] [render] [shared] [docs] [config]
STATUS: ✅ = Done, 🔄 = In Progress
-->
