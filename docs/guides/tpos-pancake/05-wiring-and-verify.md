# Phase 17-18 — App init + cross-column wiring + checklist verify

## Phase 17 — `layout/app-init.js`

Entry point duy nhất. Chạy sau khi mọi module đã load. Bootstrap theo đúng thứ tự.

```javascript
(function (global) {
    'use strict';

    const AppInit = {
        async initialize() {
            // 1. Layout (column order, resize)
            window.ColumnManager.initialize();

            // 2. Shared services background
            window.sharedDebtManager.startCleanup();

            // 3. TPOS column
            try {
                await window.TposColumnManager.initialize('tposContent');
            } catch (e) {
                console.error('[AppInit] TPOS init failed:', e);
            }

            // 4. Pancake column
            try {
                await window.PancakeColumnManager.initialize('pancakeContent');
            } catch (e) {
                console.error('[AppInit] Pancake init failed:', e);
            }

            // 5. Settings (modals)
            window.SettingsManager.initialize();

            // 6. Cross-column events
            this._setupCrossColumnEvents();

            // 7. Global refresh button
            document.getElementById('btnRefresh')?.addEventListener('click', () => {
                window.ColumnManager.refreshColumns();
            });
        },

        _setupCrossColumnEvents() {
            // TPOS click on customer → highlight Pancake conversation
            window.eventBus.on('tpos:commentSelected', ({ userId }) => {
                window.PancakeConversationList?.highlightByUserId(userId);
            });

            // Native order created → re-render Pancake badges (if applicable)
            window.eventBus.on('tpos:orderCreated', () => {
                window.PancakeConversationList?.renderConversationList();
            });

            // Debt updated → both re-render
            window.eventBus.on('debt:updated', () => {
                window.TposCommentList?.renderComments();
                window.PancakeConversationList?.renderConversationList();
            });

            // Column swap (just refresh headings etc.)
            window.eventBus.on('layout:refresh', () => {
                window.TposCommentList?.renderComments();
                window.PancakeConversationList?.renderConversationList();
            });
        },
    };

    global.AppInit = AppInit;

    // Auto-run on DOMContentLoaded
    const start = () => AppInit.initialize();
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', start);
    } else {
        start();
    }
})(typeof window !== 'undefined' ? window : globalThis);
```

### Thứ tự final `<script>` trong `index.html`

```html
<body>
    <!-- ... topbar + columns + modals ... -->

    <!-- Shared N2Store lib (đã có) -->
    <script src="../shared/js/firebase-config.js"></script>
    <script src="../shared/js/shared-auth-manager.js"></script>
    <script src="../shared/js/notification-system.js"></script>

    <!-- Config -->
    <script src="js/api-config.js"></script>
    <script src="js/config.js"></script>

    <!-- Shared services -->
    <script src="js/shared/event-bus.js"></script>
    <script src="js/shared/utils.js"></script>
    <script src="js/shared/cache-manager.js"></script>
    <script src="js/shared/debt-manager.js"></script>

    <!-- Layout -->
    <script src="js/layout/column-manager.js"></script>
    <script src="js/layout/settings-manager.js"></script>

    <!-- TPOS modules -->
    <script src="js/tpos/tpos-token-manager.js"></script>
    <script src="js/tpos/tpos-state.js"></script>
    <script src="js/tpos/tpos-api.js"></script>
    <script src="js/tpos/tpos-native-orders-api.js"></script>
    <script src="js/tpos/tpos-realtime.js"></script>
    <script src="js/tpos/tpos-comment-list.js"></script>
    <script src="js/tpos/tpos-customer-panel.js"></script>
    <script src="js/tpos/tpos-init.js"></script>

    <!-- Pancake modules -->
    <script src="js/pancake/pancake-token-manager.js"></script>
    <script src="js/pancake/pancake-state.js"></script>
    <script src="js/pancake/pancake-api.js"></script>
    <script src="js/pancake/pancake-realtime.js"></script>
    <script src="js/pancake/pancake-page-selector.js"></script>
    <script src="js/pancake/pancake-conversation-list.js"></script>
    <script src="js/pancake/pancake-chat-window.js"></script>
    <script src="js/pancake/pancake-context-menu.js"></script>
    <script src="js/pancake/pancake-init.js"></script>

    <!-- Bootstraps everything. MUST be last. -->
    <script src="js/layout/app-init.js"></script>
</body>
```

---

## Phase 18 — Smoke-test checklist

Chạy local (serve tĩnh qua `python3 -m http.server` hoặc GitHub Pages) rồi tick từng mục:

### UI shell
- [ ] Topbar xuất hiện: trái có `🛒 TPOS` + 2 select + dot status + refresh; phải có `⊞ Pancake` + select + 4 icon.
- [ ] Body có 2 cột equal-width, giữa là vạch xám 8px.
- [ ] Kéo vạch giữa → 2 cột co giãn, min-width 300px.
- [ ] Click nút `columns` topbar → panel floating hiện, 2 dropdown "Cột 1/Cột 2".
- [ ] Đổi dropdown → 2 cột swap, F5 → vẫn đúng thứ tự (localStorage).

### TPOS
- [ ] Page select disabled khi load. Sau ~1s (loadCRMTeams done) → enabled, có options.
- [ ] Chọn page → campaign select enabled → click nó hiện dropdown với checkbox list.
- [ ] Bấm "Hôm nay" → tick tất cả, "Bỏ chọn" → untick.
- [ ] Chọn ≥1 campaign → comment list load, status dot đỏ nháy (SSE connected).
- [ ] Một comment có: avatar + badge STT xanh trái-trên + FB badge phải-dưới + tên + optional badge đơn + trạng thái + time + message + input SĐT/địa chỉ + debt (nếu có).
- [ ] Hover comment → hiện 4 nút action bên phải (shopping-cart tím / user / reply / eye-off).
- [ ] Click nút giỏ tím → spin → icon đổi `package-open` tím + badge `NW-20260424-XXXX` tím xuất hiện bên tên.
- [ ] Click lại trên cùng comment → toast "Đơn web đã tồn tại" (idempotent).
- [ ] F5 → order badge vẫn còn (hydrate từ `/api/native-orders/load?fbPostId=...`).
- [ ] Gõ SĐT + click icon save → partner cập nhật (và load debt).
- [ ] Settings TPOS → toggle "Hiện công nợ" → badge công nợ ẩn/hiện theo.

### Pancake
- [ ] Settings Pancake: Paste JWT hợp lệ → account vào list → tick active.
- [ ] Topbar Pancake select load pages, hiện số unread bên cạnh tên.
- [ ] Chọn page → conversations load bên sidebar trái của cột Pancake.
- [ ] Tabs: Tất cả / Inbox / Comment / Lưu TPOS — click chuyển tab → list lọc lại.
- [ ] Search: gõ tên / SĐT → conversation list filter.
- [ ] Click 1 conversation → chat window bên phải load header + messages.
- [ ] Gõ Enter → gửi OK, bubble tím hiện bên phải ngay.
- [ ] Right-click 1 conversation → context menu hiện (Đã đọc / Chưa đọc / Copy ID).
- [ ] WS realtime: tin mới đến → append vào chat window hiện tại (nếu active) hoặc update snippet trong list.

### Cross-column
- [ ] Click tên khách ở TPOS (bên trái) → Pancake (bên phải) auto-scroll và highlight conversation đó (nếu tồn tại).
- [ ] Tạo native order → (optional) Pancake update badge "Lưu TPOS" theo.

### Regression
- [ ] F5 nhiều lần → mọi selection (page TPOS, campaign, column order, page Pancake, server mode) được restore.
- [ ] Devtools console không có red error khi idle (heartbeat WS log OK, SSE retry log OK).
- [ ] Network tab: không còn request `POST /api/odata/SaleOnline_Order` (create TPOS order).

### Backend health
Chạy trong shell:
```bash
curl -s https://chatomni-proxy.nhijudyshop.workers.dev/api/native-orders/health
# → {"ok":true,"count":N}
```

Nếu `404` → CF Worker chưa deploy route. Chạy `cd cloudflare-worker && wrangler deploy`.
Nếu `500` → Render chưa deploy. Push `render.com/` thay đổi → chờ ~2 phút.

---

## Khi có bug, debug theo thứ tự này

1. **Không load được token**: F12 → Application → localStorage → xem `bearer_token_data_1` có expire chưa; xem `pancake_jwt_token_expiry` so với `Date.now()`.
2. **API 401**: check `tposTokenManager.getAuthHeader()` → nếu rỗng → re-login qua `/api/tpos-credentials/login`. Pancake: phải add JWT mới qua Settings.
3. **API 404 Not Found**: check Cloudflare Worker routes (`cloudflare-worker/modules/config/routes.js`) → pattern phải match pathname.
4. **SSE không kết nối**: devtools Network → filter `EventStream` → xem URL có `token=` không; xem server response phải là `text/event-stream`.
5. **Comment không render**: console.log `state.comments` → có data chưa? Nếu có → check `TposCommentList.renderComments()` có được gọi không.
6. **Badge native không hydrate**: gọi `window.NativeOrdersApi.list({ fbPostId: '<postId>' })` trong console → xem trả gì; gọi `TposColumnManager._loadNativeOrders('<postId>')` thủ công.

---

## Tài liệu liên quan

- Reference đầy đủ (state shape, API tables, event bus, storage keys): [99-appendix.md](99-appendix.md)
- Backend route thật đang chạy: [render.com/routes/native-orders.js](../../../render.com/routes/native-orders.js)
- Database schema: [render.com/migrations/065_native_orders_schema.sql](../../../render.com/migrations/065_native_orders_schema.sql)
- Cloudflare routing: [cloudflare-worker/modules/config/routes.js](../../../cloudflare-worker/modules/config/routes.js)
- Dev log gần nhất về trang này: [docs/dev-log.md](../../dev-log.md) (search "Native Orders")
