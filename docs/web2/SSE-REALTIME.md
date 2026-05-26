# Web 2.0 — SSE Realtime Pattern

> **BẮT BUỘC đọc file này trước khi code bất kỳ realtime/data-sync feature nào trong Web 2.0** (web2/, so-order/, native-orders/, supplier-wallet/, customer-wallet/, …).

Pattern realtime của Web 2.0 dùng **Server-Sent Events (SSE)** thay vì Firebase Firestore listener. Server (Render) broadcast event khi DB thay đổi → client nào subscribe topic đó nhận update → refresh UI.

**Lý do**: Firebase tốn tiền theo số reads (mỗi listener fire = 1 read × N clients). SSE chạy trên Render flat-rate $7-25/tháng không tăng theo traffic. Pattern proven trong các dự án lớn (Stripe Dashboard, Linear, Vercel).

---

## 1. Architecture (overview)

```
┌────────────────────┐     POST/PATCH/DELETE     ┌──────────────────────────────┐
│  Browser (page A)  │ ──────────────────────►  │  Render: routes/<module>.js  │
│  edit/create/      │                          │  DB write → _notify(action)  │
│  delete entity     │                          └──────────┬───────────────────┘
└────────────────────┘                                     │
                                                           │ notifyClients(topic, data, 'update')
                                                           ▼
                                          ┌─────────────────────────────────────┐
                                          │  realtime-sse.js                    │
                                          │  Map<topic, Set<Response>>          │
                                          │  Iterate → res.write(SSE event)     │
                                          └──────────────┬──────────────────────┘
                                                         │ SSE stream
                                                         ▼
                                          ┌─────────────────────────────────────┐
                                          │  CF Worker: /api/realtime/* proxy   │
                                          │  preserves SSE streaming            │
                                          └──────────────┬──────────────────────┘
                                                         │
                                                         ▼
                                          ┌─────────────────────────────────────┐
                                          │  Browser (page B, C, …)             │
                                          │  Web2SSE.subscribe(topic, cb)       │
                                          │  → cb fires → refresh UI            │
                                          └─────────────────────────────────────┘
```

**File quan trọng** (Web 2.0 dùng hub RIÊNG từ 2026-05-26 — KHÔNG chia chung với Web 1.0 nữa):

| Layer             | File                                                                                                                                   | Vai trò                                                                                                      |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Server hub        | [render.com/routes/realtime-sse-web2.js](../../render.com/routes/realtime-sse-web2.js)                                                 | `notifyClients(topic, data, eventType)`, Map RIÊNG cho Web 2.0                                               |
| Server route      | render.com/routes/`<module>`.js                                                                                                        | Gọi `_notify(action, code)` sau mỗi DB write                                                                 |
| Server wiring     | [render.com/server.js](../../render.com/server.js)                                                                                     | `<module>Routes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients)`                                    |
| Endpoint client   | `/api/realtime/web2/sse?keys=web2:foo,web2:bar`                                                                                        | TÁCH với Web 1.0 endpoint `/api/realtime/sse` (legacy: tickets, KPI, kho, celebration, …)                    |
| Proxy             | [cloudflare-worker/modules/handlers/proxy-handler.js](../../cloudflare-worker/modules/handlers/proxy-handler.js) `handleRealtimeProxy` | Pattern `/api/realtime/*` cover cả `/web2/` → n2store-fallback. `pathname.endsWith('/sse')` preserves stream |
| Client bridge     | [web2/shared/web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js)                                                                 | Singleton `EventSource` trỏ về `/api/realtime/web2/sse`, multiplex topics qua `?keys=`                       |
| Client subscriber | per-page JS                                                                                                                            | `Web2SSE.subscribe(topic, cb)`                                                                               |

> **Lưu ý phân chia**: Web 1.0 vẫn dùng `routes/realtime-sse.js` cho topics legacy (`celebration`, `kpi_statistics`, `held_products`, `tickets`, `web_warehouse`, `tpos_token`, `wallet:<phone>` của customer-hub cũ, `order_notes_global`, `processing_tags_global`, …). Web 2.0 routes (web2-products/variants/users/generic, native-orders, fast-sale-orders, reconcile, purchase-refund, livestream-snapshots, v2/cart, v2/notifications, v2/dashboard-kpi) wire qua `web2RealtimeSseRoutes.notifyClients`. SePay → Web 2.0 wallet đi qua `web2WalletEvents` listener trong `realtime-sse-web2.js` (KHÔNG còn cross-publish từ legacy `walletEvents`).

---

## 2. Topic naming convention (BẮT BUỘC theo)

| Pattern                  | Ý nghĩa                                   | Ví dụ                                                                  |
| ------------------------ | ----------------------------------------- | ---------------------------------------------------------------------- |
| `web2:<entity>`          | Global topic cho 1 entity loại            | `web2:products`, `web2:variants`, `web2:native-orders`                 |
| `web2:<entity>:<id>`     | Per-instance topic (giảm broadcast scope) | `web2:supplier-wallet:0901234567` (per phone)                          |
| `web2:<feature>:<scope>` | Sub-feature trong entity                  | `web2:products:stock` (chỉ stock changes) — chỉ dùng khi cần phân biệt |

**Tránh**:

- ❌ Tên không có prefix `web2:` — đụng với topics khác của project
- ❌ Tên dài/dùng dấu cách — URL param encoding rắc rối
- ❌ Topic chung kiểu `update` / `change` — không biết entity nào

---

## 3. Server-side recipe (thêm SSE cho 1 route mới)

### Step 1: Inject notifier vào route file

Thêm vào TOP file `render.com/routes/<module>.js`:

```javascript
const express = require('express');
const router = express.Router();

// -----------------------------------------------------
// SSE notifier — injected từ server.js. Sau mỗi DB mutation, broadcast
// topic 'web2:<entity>' để các client subscribe nhận update.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:<entity>', // ← đổi <entity> theo module
            { action, code: code || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[<MODULE>] _notify failed:', e.message);
    }
}
```

### Step 2: Gọi `_notify` sau MỖI successful write

```javascript
router.post('/', async (req, res) => {
    // ... DB INSERT ...
    _notify('create', newRow.code);
    res.json({ success: true, item: newRow });
});

router.patch('/:code', async (req, res) => {
    // ... DB UPDATE ...
    _notify('update', updatedRow.code);
    res.json({ success: true });
});

router.delete('/:code', async (req, res) => {
    // ... DB DELETE ...
    _notify('delete', deletedCode);
    res.json({ success: true });
});
```

**Lưu ý**:

- Gọi `_notify` SAU khi DB write thành công, TRƯỚC `res.json()`
- Trong bulk/transaction endpoints: gọi `_notify(action, null)` 1 lần sau commit (không phải mỗi item)
- Action tự do dạng `'create' | 'update' | 'delete' | 'adjust' | 'batch' | ...`
- Code có thể null nếu broadcast batch (vd `adjust-stock` cho nhiều mã)

### Step 3: Export + wire trong server.js

Cuối file route:

```javascript
router.initializeNotifiers = initializeNotifiers;
module.exports = router;
```

Trong `render.com/server.js` sau khi mount routes:

```javascript
if (<moduleName>Routes.initializeNotifiers) {
    <moduleName>Routes.initializeNotifiers(realtimeSseRoutes.notifyClients);
}
```

---

## 4. Client-side recipe (subscribe trong 1 page)

### Step 1: Load Web2SSE bridge vào HTML

`<script src="../web2/shared/web2-sse-bridge.js?v=20260519a">` PHẢI ở TRƯỚC script app của page:

```html
<!-- Đúng thứ tự -->
<script src="../web2/shared/web2-sse-bridge.js?v=20260519a"></script>
<script src="js/my-page-app.js?v=20260519a"></script>
```

### Step 2: Subscribe trong app.js

```javascript
function init() {
    // ... khác ...
    _sseConnect();
}

let _sseUnsubscribe = null;
let _sseReloadTimer = null;

function _sseConnect() {
    if (!window.Web2SSE?.subscribe) {
        console.warn('[<MODULE>-SSE] Web2SSE not loaded — skip realtime');
        return;
    }
    if (_sseUnsubscribe) return;

    _sseUnsubscribe = window.Web2SSE.subscribe('web2:<entity>', (msg) => {
        // Debounce 500-600ms để gom nhiều mutation gần nhau thành 1 reload.
        if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
        _sseReloadTimer = setTimeout(() => {
            _sseReloadTimer = null;
            console.log('[<MODULE>-SSE] event:', msg.data?.action, msg.data?.code || '');
            // Action tuỳ page: reload list, refresh 1 row, refetch cache, …
            load(); // ← thay bằng hàm refresh của page
        }, 600);
    });
}
```

**Message format** (`msg` object):

```javascript
{
    topic: 'web2:products',           // topic name
    eventType: 'update',              // 'update' | 'created' | 'deleted' | 'change'
    data: {
        action: 'create',             // gì đã xảy ra (server quyết định)
        code: 'KHO-ABC123',           // null nếu batch
        ts: 1716120800000             // server timestamp
    },
    timestamp: 1716120800050           // CF Worker timestamp (slight diff)
}
```

### Step 3: Cleanup khi page navigate đi (nếu page là SPA)

```javascript
// Khi user navigate đi khỏi page
function teardown() {
    if (_sseUnsubscribe) {
        _sseUnsubscribe();
        _sseUnsubscribe = null;
    }
}
```

Web2SSE tự đóng `EventSource` khi không còn subscriber nào — đỡ phải gọi `close()` thủ công. Nhưng nếu page là full page (không SPA) thì browser tự cleanup khi unload.

---

## 5. Echo guard (tránh tự fire khi mình mutate)

Khi user mutate ở **chính tab này** (PATCH → server response trả về → render local), SSE broadcast cũng đến chính tab này. Mặc định reload sẽ chạy 2 lần:

1. Render từ response của API call (local update)
2. Render từ SSE event (reload từ DB)

**Giải pháp**:

- **Đơn giản (đề xuất)**: Debounce SSE handler 500-600ms. Local update + SSE reload trùng → chỉ 1 reload cuối thắng. Acceptable cho hầu hết case.
- **Strict (nếu cần)**: Track `clientId` trong server payload + skip nếu match. Pattern này dùng trong Firestore tickle cũ (`state.clientId`).

```javascript
// Strict version — server cần stamp clientId
_notify('update', code, req.headers['x-client-id']); // server
// và
_notifyClients(topic, { ...data, by: clientId }, 'update');

// Client side
if (msg.data?.by === state.clientId) return; // skip own echo
```

Hiện tại hầu hết các module dùng debounce — chưa cần strict.

---

## 6. Migration checklist (từ Firebase Firestore listener → SSE)

Đây là checklist khi migrate 1 module từ pattern Firestore tickle cũ sang SSE:

- [ ] Identify topic name: `web2:<entity>` theo convention
- [ ] Server side:
    - [ ] Thêm `initializeNotifiers + _notify` ở đầu route file
    - [ ] Gọi `_notify(action, code)` sau mỗi successful DB write
    - [ ] Export `router.initializeNotifiers`
- [ ] Server wiring trong `server.js`: thêm `<moduleName>Routes.initializeNotifiers(realtimeSseRoutes.notifyClients)` sau khi mount route
- [ ] Client cache layer (`web2/shared/<entity>-cache.js`):
    - [ ] `_setupRealtime()`: ưu tiên `Web2SSE.subscribe(topic, cb)`, fallback Firestore tickle khi bridge không load
    - [ ] Giữ Firestore tickle write trong `pushTickle()` 1-2 ngày cho transition. Sau khi verify production OK → remove.
- [ ] HTML pages dùng cache:
    - [ ] Thêm `<script src="../shared/web2-sse-bridge.js?v=...">` TRƯỚC cache script
    - [ ] Bump cache version
- [ ] Page-specific app.js (nếu chỉ render list mà không qua cache):
    - [ ] Thêm `_sseConnect()` trong `init()`
- [ ] Test live:
    - [ ] 2 browser tab cùng entity → mutate ở A → B nhận update <1s
    - [ ] `curl -N "https://chatomni-proxy.../api/realtime/sse?keys=web2:<entity>"` thấy event
    - [ ] Render logs: `[<MODULE>] _notify` hoặc `[SSE] Notified N clients for key: web2:<entity>`
- [ ] Verify Firestore reads của collection cũ giảm gần về 0 sau 24h
- [ ] Commit + push (Render auto-deploy ~3-5 phút)

---

## 7. Verification & debugging

### A. SSE endpoint sống không?

```bash
curl -N "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse?keys=web2:products" 2>&1 | head -20
# Expect: "event: connected\ndata: {...,\"server\":\"web2\"}" trong 1-2s đầu
# Sau đó: ":heartbeat <ts>" mỗi 30s
```

### B. Server stats

```bash
curl -s "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse/stats" | jq
# Expect: { "server":"web2", totalClients, uniqueKeys, keyStats: { "web2:products": 3, ... } }
```

### C. Browser DevTools

- Network tab → filter `sse` → phải thấy 1 EventSource connection mở (status "pending"), nhận event stream
- Console tab → log của bridge: `[Web2SSE]` + per-module `[<MODULE>-SSE] event: ...`
- Application tab → không có Firestore listener đăng ký nữa (nếu đã drop)

### D. Trigger test event thủ công

```bash
curl -X POST "https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/web2/sse/test" \
  -H "Content-Type: application/json" \
  -d '{"key":"web2:products","data":{"action":"test","ts":'$(date +%s%3N)'}}'
# → tất cả client subscribe web2:products phải nhận `event: test`
```

### E. Render logs — cấu trúc log SSE Web 2.0

Render Dashboard → `n2store-fallback` → Logs. Filter `[SSE-WEB2]` (không nhầm với `[SSE]` của Web 1.0).

| Log line                                                                                    | Khi nào fire                                                                  | Đọc gì                                                                                                |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[SSE-WEB2] Client connected (web2conn_<ts>_<rand>), watching: web2:products,web2:variants` | Browser mở EventSource đến `/api/realtime/web2/sse?keys=...`                  | Topic mà client đăng ký, connectionId duy nhất                                                        |
| `[SSE-WEB2] Active connections: N`                                                          | Sau mỗi connect/disconnect                                                    | Tổng số subscriber (sum per-topic) hiện tại                                                           |
| `[SSE-WEB2] Notified N clients for key: web2:products`                                      | Route gọi `_notify(action, code)` SAU DB write thành công                     | N clients được fire event. Nếu N=0 → log thành `No clients listening to key: web2:products`           |
| `[<MODULE>] _notify failed: <msg>`                                                          | Lỗi khi gọi `_notifyClients` (vd module chưa init notifier)                   | Module name + lý do (vd token chưa expire, JSON stringify lỗi)                                        |
| `[SSE-WEB2] No clients listening to key: web2:products`                                     | Route fire broadcast nhưng không client nào subscribe                         | Bình thường khi không có tab nào mở page liên quan. Nếu page mở mà vẫn log này → bridge endpoint sai. |
| `[SSE-WEB2] Wildcard notified N clients for pattern: web2:wallet`                           | `notifyClientsWildcard('web2:wallet', ...)` cho list pages (admin)            | Pattern match prefix → fire all subscribers có topic bắt đầu bằng prefix                              |
| `[SSE-WEB2] Error sending to client: <err>`                                                 | `res.write()` throw — socket đã đóng nhưng chưa được cleanup                  | Tự cleanup ở next `req.on('close')`                                                                   |
| `[SSE-WEB2] Client disconnected (web2conn_...) after <Ns>s`                                 | Browser đóng tab / network drop / proxy timeout                               | Connection time. Quá ngắn (<5s) lặp đi lặp lại = reconnect bug                                        |
| `[SSE-WEB2] Web 2.0 wallet event subscription initialized`                                  | Server boot xong, attach listener `web2WalletEvents.on('web2:wallet:update')` | Phải thấy 1 lần khi server start. Nếu KHÔNG thấy → web2-wallet-service không load                     |

### F. Read–write loop (UI realtime, không cần refresh)

Đây là contract mà toàn bộ Web 2.0 dùng để sync UI không cần refresh:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  WRITE path (tab A — user mutate dữ liệu)                                   │
│                                                                              │
│  user click button                                                           │
│    → fetch('/api/web2-products/KHO-X', { method:'PATCH', body: ... })        │
│      → CF Worker proxy → Render route handler                                │
│        → pg query: UPDATE web2_products SET ... WHERE code='KHO-X'           │
│        → DB commit OK                                                        │
│        → _notify('update', 'KHO-X')                                          │
│          → web2RealtimeSseRoutes.notifyClients('web2:products', {            │
│              action: 'update', code: 'KHO-X', ts: Date.now()                 │
│            }, 'update')                                                      │
│          → Render log: "[SSE-WEB2] Notified 3 clients for key: web2:products"│
│        → res.json({ success: true })                                         │
│    → tab A local UI update từ response                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│  READ path (tab B, C, D — đang mở Web2SSE.subscribe)                         │
│                                                                              │
│  EventSource open: /api/realtime/web2/sse?keys=web2:products                 │
│    → CF Worker stream proxy (text/event-stream, no buffering)                │
│    → Render route SSE write:                                                 │
│        event: update                                                         │
│        data: {"key":"web2:products","data":{"action":"update",               │
│              "code":"KHO-X","ts":1779778500},"event":"update", ...}          │
│    → Browser EventSource fires 'update' event                                │
│    → web2-sse-bridge.js dispatch → callback của subscriber                   │
│    → Page handler:                                                           │
│        if (debounceTimer) clearTimeout(debounceTimer)                        │
│        debounceTimer = setTimeout(() => reload(), 600)                       │
│    → 600ms sau: page re-fetch + re-render → UI fresh                         │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Không cần page refresh** vì:

1. Server side: route nào mutate DB cũng PHẢI gọi `_notify(action, code)` sau commit (xem [Step 2 Section 3](#step-2-gọi-_notify-sau-mỗi-successful-write))
2. Client side: page nào hiển thị data PHẢI `Web2SSE.subscribe(topic, cb)` trong `init()` (xem [Step 2 Section 4](#step-2-subscribe-trong-appjs))
3. Bridge maintain 1 EventSource singleton, multiplex topics qua `?keys=`, auto-reconnect khi mất kết nối

### G. Debug khi UI không update (cheatsheet)

| Hiện tượng                                     | Check                                                                                                                                          |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Mutate ở tab A → tab B không update            | DevTools tab B → Network → tìm EventSource đến `/api/realtime/web2/sse` (status pending). Không có? → bridge chưa load / endpoint sai          |
| Stream có nhưng không fire callback            | Console tab B → bridge log `[Web2SSE]` payload nhận được? Topic có match? Subscriber có register kịp init() không?                             |
| Render log show "Notified 0 clients"           | Tab nào đang mở? Browser cache cũ `?v=` → bridge cũ vẫn trỏ về `/api/realtime/sse` (Web 1.0). Hard refresh / bump `?v=`                        |
| Render log không có `[SSE-WEB2] Notified`      | Route handler chưa gọi `_notify(action, code)` sau DB write. Hoặc `initializeNotifiers` trong server.js chưa wire qua `web2RealtimeSseRoutes`. |
| `[SSE-WEB2] Wallet event subscription` missing | `services/web2-wallet-service.js` không load — check stack trace server boot                                                                   |
| Stream connect rồi disconnect liên tục         | CF Worker timeout? Heartbeat (30s) bị drop ở middlebox? Check `req.on('error')` log                                                            |

---

## 8. Cost comparison (thực tế dự án)

Với shop ~100 mutations/ngày × 5 clients online:

| Pattern                          |                     Firestore reads/day |   Firestore writes/day |        Cost/month (estimate) |
| -------------------------------- | --------------------------------------: | ---------------------: | ---------------------------: |
| Firebase Firestore listener (cũ) | 5,000-15,000 (mỗi mutation × N clients) | 100-300 (tickle write) |                        $5-30 |
| SSE pub/sub (mới)                |                                       0 |                      0 | $0 (Render flat-rate đã trả) |

**Note**: SSE connection ăn 1 long-lived TCP socket/client. Render free tier 100 concurrent, paid 10K+ — dư cho shop nhỏ-trung.

---

## 9. Existing topics map (cập nhật khi thêm topic mới)

| Topic                         | Server notify                                                                                    | Client subscribers                                                                                 | Status  | Migrated date |
| ----------------------------- | ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------- | ------------- |
| `web2:products`               | `routes/web2-products.js` (7 endpoints)                                                          | web2/products (cache), so-order, supplier-wallet (cache), customer-wallet, supplier-debt (báo cáo) | ✅ Live | 2026-05-19    |
| `web2:variants`               | `routes/web2-variants.js` (3 endpoints)                                                          | web2/variants (cache), so-order                                                                    | ✅ Live | 2026-05-19    |
| `web2:users`                  | `routes/web2-users.js` (5 endpoints)                                                             | web2/users                                                                                         | ✅ Live | 2026-05-19    |
| `web2:native-orders`          | `routes/native-orders.js` (5 endpoints)                                                          | native-orders                                                                                      | ✅ Live | 2026-05-19    |
| `web2:fast-sale-orders`       | `routes/fast-sale-orders.js` (8+ endpoints)                                                      | PBH page (dùng WS qua `PbhRealtime`), supplier-debt (báo cáo)                                      | ✅ Live | 2026-05-19    |
| `web2:<slug>` (78 generic)    | `routes/web2-generic.js` × 5 endpoints                                                           | tất cả pages dùng `Web2Shell.bootstrap({ slug })` (page-builder framework auto)                    | ✅ Live | 2026-05-19    |
| `wallet:<phone>` / `wallet:*` | `services/wallet-event-processor` → `walletEvents.emit('wallet:update')` → realtime-sse listener | customer-wallet (`wallet:all`), supplier-wallet (`wallet:all`), supplier-debt                      | ✅ Live | 2026-05-19    |

**Khi thêm topic mới**: update bảng này + update [WEB2-INDEX.md](WEB2-INDEX.md).

### Pipeline note — SePay → wallet realtime

```
SePay app/bank → POST /api/sepay/webhook → sepay-webhook-core.js
  → wallet-event-processor.processIncomingPayment()
     → Postgres TX: UPDATE customer_wallets, INSERT customer_wallet_transactions
     → walletEvents.emit('wallet:update', { phone, wallet, transaction })
  → realtime-sse.js listener (line 369)
     → SSE broadcast topic 'wallet:<phone>' + wildcard 'wallet:*'
  → Web2SSE.subscribe('wallet:all', cb) on customer/supplier-wallet pages
     → debounce 800ms → pollDeposits() + toast 💰
```

Subscribe convention:

- **`wallet:<phone>`**: detail page chỉ xem 1 khách/NCC cụ thể
- **`wallet:all`**: admin/list page xem mọi giao dịch (match wildcard `wallet:*` của server `notifyClientsWildcard('wallet', …)`)

---

## 10. Anti-patterns / Gotchas

### ❌ Không gọi `_notify` trong middleware

```javascript
// SAI — middleware chạy cả endpoint không write
router.use((req, res, next) => {
    _notify('access', null); // KHÔNG ĐƯỢC
    next();
});
```

→ Chỉ gọi sau confirmed DB write.

### ❌ Không broadcast PII trong payload

```javascript
// SAI
_notify('create', code, { phone: '0901234567', email: '...' }); // KHÔNG
```

→ Payload chỉ chứa `{ action, code, ts }`. Client tự fetch full data nếu cần. Lý do: SSE stream qua CF cache có thể được log.

### ❌ Không subscribe topic trong 1 vòng lặp

```javascript
// SAI
products.forEach((p) => Web2SSE.subscribe(`web2:products:${p.code}`, cb)); // 1000 topics!
```

→ Subscribe 1 topic broadcast, server emit cho tất cả qua 1 lần. Filter ở client.

### ❌ Quên debounce ở client subscriber

```javascript
// SAI — burst 10 mutations = 10 reloads
Web2SSE.subscribe('web2:products', () => load());
```

→ Luôn debounce 500-600ms cho UI updates.

### ❌ Không bump cache version sau edit bridge

Edit `web2-sse-bridge.js` mà quên bump `?v=` → browser cache JS cũ → behaviour cũ.

### ❌ Để Firestore tickle chạy song song lâu

Sau verify 1-2 ngày, PHẢI remove Firestore `pushTickle` write + `_setupRealtime` Firestore fallback. Để lâu sẽ tốn Firestore reads vô ích.

---

## 11. Khi nào KHÔNG dùng SSE pattern này

| Use case                                        | Dùng gì thay                                                                            |
| ----------------------------------------------- | --------------------------------------------------------------------------------------- |
| Bidirectional realtime (chat, presence, typing) | WebSocket (build mới hoặc dùng `Web2Realtime` Pancake WS)                               |
| Cross-tab same-machine sync only                | `BroadcastChannel` API (rẻ hơn, không cần server)                                       |
| Page edit-heavy local-first (vd Sổ Order)       | Local-first + `pullOnce()` on visibility change (xem `so-order/js/so-order-storage.js`) |
| Push notification khi user OFFLINE              | FCM / Web Push API (SSE chỉ work khi tab mở)                                            |
| Large file streaming                            | HTTP streaming chunked response                                                         |

---

## Tham khảo nhanh — file cần đọc khi code

- [render.com/routes/realtime-sse.js](../../render.com/routes/realtime-sse.js) — server hub, `notifyClients` API
- [render.com/routes/web2-products.js](../../render.com/routes/web2-products.js) — ví dụ mẫu integrated notify
- [render.com/routes/native-orders.js](../../render.com/routes/native-orders.js) — ví dụ mẫu thứ 2
- [web2/shared/web2-sse-bridge.js](../../web2/shared/web2-sse-bridge.js) — client singleton
- [web2/shared/web2-products-cache.js](../../web2/shared/web2-products-cache.js) — ví dụ cache layer subscribe
- [native-orders/js/native-orders-app.js](../../native-orders/js/native-orders-app.js) `_sseConnect()` — ví dụ direct subscribe

**Khi confused, đọc thêm code 2 module đã migrate (web2-products + native-orders) để thấy pattern thực tế.**
