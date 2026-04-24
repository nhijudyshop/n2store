# Phase 3-4 — Shared services + Layout managers

Tham khảo file thật: [tpos-pancake/js/shared/](../../../tpos-pancake/js/shared/) và [tpos-pancake/js/layout/](../../../tpos-pancake/js/layout/).

## Phase 3a — `api-config.js` + `config.js`

### `js/api-config.js`

Tập trung mọi URL — thay đổi endpoint ở đây thay vì hardcode.

```javascript
(function (global) {
    'use strict';

    const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

    const API_CONFIG = {
        WORKER_URL,
        RENDER_URL: 'https://n2store-fallback.onrender.com',
        TPOS_ODATA: `${WORKER_URL}/api/odata`,
        PANCAKE:    `${WORKER_URL}/api/pancake`,

        // URL builders (real signatures từ tpos-pancake/js/api-config.js)
        buildUrl: {
            tposOData: (endpoint, params = '') => {
                const u = `${WORKER_URL}/api/odata/${endpoint}`;
                return params ? `${u}?${params}` : u;
            },
            pancake: (endpoint, params = '') => {
                const u = `${WORKER_URL}/api/pancake/${endpoint}`;
                return params ? `${u}?${params}` : u;
            },
            // Pancake Direct (24h-policy bypass, path includes pageId + jwt + access_token)
            pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
                const qs = new URLSearchParams({ page_id: pageId, jwt: jwtToken, access_token: accessToken });
                return `${WORKER_URL}/api/pancake-direct/${endpoint}?${qs}`;
            },
            // Pancake Official (pages.fm Public API, dùng page_access_token)
            pancakeOfficial: (endpoint, pageAccessToken) => {
                const u = `${WORKER_URL}/api/pancake-official/${endpoint}`;
                return pageAccessToken ? `${u}?page_access_token=${pageAccessToken}` : u;
            },
            facebookSend: () => `${WORKER_URL}/api/facebook-send`,
            // Helper cho NativeOrdersApi
            nativeOrders: (path = '') => `${WORKER_URL}/api/native-orders${path ? '/' + path : ''}`,
        },
    };

    global.API_CONFIG = API_CONFIG;
})(typeof window !== 'undefined' ? window : globalThis);
```

### `js/config.js`

```javascript
(function (global) {
    'use strict';

    global.APP_CONFIG = {
        CACHE_EXPIRY_MS: 24 * 60 * 60 * 1000,      // 24h
        BATCH_SIZE: 50,
        FILTER_DEBOUNCE_MS: 500,
        SCROLL_NEAR_BOTTOM_PX: 100,
    };

    // Firebase init (config đã có ở /shared/js/firebase-config.js).
    // Nếu không dùng shared lib, tạo firebaseConfig inline rồi:
    //   firebase.initializeApp(firebaseConfig);
    //   window.db = firebase.firestore();
    //   window.database = firebase.database();
    //   window.storageRef = firebase.storage().ref();
    // Ở project này shared lib lo việc này, chỉ expose ra window sau khi init.
})(typeof window !== 'undefined' ? window : globalThis);
```

Thêm vào `<body>` của `index.html` (cuối, trước các script khác):

```html
<!-- Config -->
<script src="js/api-config.js"></script>
<script src="js/config.js"></script>
```

---

## Phase 3b — `shared/event-bus.js`

Pub-sub đơn giản để các module nói chuyện với nhau mà không coupling.

```javascript
(function (global) {
    'use strict';

    class EventBus {
        constructor() { this._handlers = new Map(); }

        on(event, cb) {
            if (!this._handlers.has(event)) this._handlers.set(event, new Set());
            this._handlers.get(event).add(cb);
            return () => this.off(event, cb);
        }
        once(event, cb) {
            const off = this.on(event, (d) => { off(); cb(d); });
            return off;
        }
        off(event, cb) {
            const set = this._handlers.get(event);
            if (set) set.delete(cb);
        }
        emit(event, data) {
            const set = this._handlers.get(event);
            if (!set) return;
            for (const cb of set) {
                try { cb(data); }
                catch (e) { console.error(`[eventBus] handler error for "${event}":`, e); }
            }
        }
        removeAll(event) {
            if (event) this._handlers.delete(event);
            else this._handlers.clear();
        }
    }

    global.eventBus = new EventBus();
})(typeof window !== 'undefined' ? window : globalThis);
```

### Event names (cheat sheet)

| Event | Emitter | Listener | Payload |
|---|---|---|---|
| `tpos:crmTeamChanged` | TposCommentList | TposColumnManager | pageId |
| `tpos:campaignsChanged` | TposCommentList | TposColumnManager | `[campaignIds]` |
| `tpos:refreshRequested` | TposCommentList | TposColumnManager | — |
| `tpos:loadMoreRequested` | TposCommentList | TposColumnManager | — |
| `tpos:commentSelected` | TposCommentList | AppInit → PancakeConversationList | `{ userId, comment }` |
| `tpos:newComment` | TposRealtime | TposCommentList | `{ comment, pageName }` |
| `tpos:orderCreated` | TposCommentList | (cross-column badge refresh) | `{ code, fromId }` |
| `pancake:conversationSelected` | PancakeConversationList | PancakeChatWindow | `{ convId, pageId }` |
| `pancake:messageSent` | PancakeChatWindow | (analytics) | `{ convId, message }` |
| `pancake:newMessage` | PancakeRealtime | PancakeChatWindow | `{ message, convId }` |
| `debt:updated` | sharedDebtManager | both columns | `{ phones: [] }` |
| `layout:columnSwapped` | ColumnManager | AppInit | `{ order: [] }` |
| `layout:refresh` | ColumnManager | both columns | — |

---

## Phase 3c — `shared/utils.js`

Helper thuần — không state.

```javascript
(function (global) {
    'use strict';

    const SharedUtils = {
        escapeHtml(str) {
            if (str == null) return '';
            const div = document.createElement('div');
            div.textContent = String(str);
            return div.innerHTML;
        },

        truncate(text, max = 100) {
            if (!text) return '';
            text = String(text);
            return text.length > max ? text.slice(0, max - 1) + '…' : text;
        },

        // VN phone: "+84912345678" → "0912345678"
        normalizePhone(phone) {
            if (!phone) return '';
            const digits = String(phone).replace(/\D/g, '');
            if (digits.startsWith('84') && digits.length >= 11) return '0' + digits.slice(2);
            return digits;
        },

        formatDebt(amount) {
            if (amount == null || isNaN(amount)) return '';
            const num = Math.abs(Number(amount));
            return num.toLocaleString('vi-VN') + 'đ';
        },

        parseTimestamp(ts) {
            if (!ts) return null;
            if (typeof ts === 'number') return ts > 1e12 ? ts : ts * 1000;
            const t = Date.parse(ts);
            return isNaN(t) ? null : t;
        },

        formatTime(ts) {
            const ms = this.parseTimestamp(ts);
            if (!ms) return '';
            const d = new Date(ms);
            const now = new Date();
            const sameDay = d.toDateString() === now.toDateString();
            if (sameDay) {
                return d.getHours().toString().padStart(2, '0') + ':' + d.getMinutes().toString().padStart(2, '0');
            }
            return `${d.getDate()}/${d.getMonth() + 1}`;
        },

        formatFullTime(ts) {
            const ms = this.parseTimestamp(ts);
            if (!ms) return '';
            const d = new Date(ms);
            return d.toLocaleString('vi-VN');
        },

        getAvatarPlaceholder(name, size = 36) {
            const initial = (name || '?').trim().charAt(0).toUpperCase();
            const colors = ['#6366f1','#8b5cf6','#ec4899','#ef4444','#f59e0b','#10b981','#3b82f6','#06b6d4'];
            const idx = (name || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0) % colors.length;
            const bg = colors[idx];
            return {
                bg,
                initial,
                html: `<div class="avatar-placeholder" style="width:${size}px;height:${size}px;border-radius:50%;background:${bg};color:white;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:${Math.round(size/2.5)}px;">${initial}</div>`,
            };
        },

        getAvatarUrl(fbId, pageId, token, directUrl) {
            if (directUrl) return directUrl;
            if (!fbId) return '';
            // Graph API avatar qua CF Worker proxy để né CORS
            return `${window.API_CONFIG.WORKER_URL}/api/fb-avatar?id=${fbId}${pageId ? '&page_id=' + pageId : ''}`;
        },

        debounce(fn, delay = 300) {
            let timer;
            return function (...args) {
                clearTimeout(timer);
                timer = setTimeout(() => fn.apply(this, args), delay);
            };
        },

        throttle(fn, limit = 200) {
            let last = 0;
            return function (...args) {
                const now = Date.now();
                if (now - last >= limit) {
                    last = now;
                    fn.apply(this, args);
                }
            };
        },
    };

    global.SharedUtils = SharedUtils;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 3d — `shared/cache-manager.js`

LRU cache với TTL.

```javascript
(function (global) {
    'use strict';

    class SharedCache {
        constructor({ maxSize = 200, ttl = 10 * 60 * 1000, name = 'cache' } = {}) {
            this.maxSize = maxSize;
            this.ttl = ttl;
            this.name = name;
            this._map = new Map(); // key → { value, expiresAt }
            this._cleanupTimer = null;
        }

        get(key) {
            const entry = this._map.get(key);
            if (!entry) return null;
            if (entry.expiresAt < Date.now()) { this._map.delete(key); return null; }
            // LRU: re-insert to the end
            this._map.delete(key);
            this._map.set(key, entry);
            return entry.value;
        }

        set(key, value) {
            if (this._map.size >= this.maxSize) {
                // Evict 20% oldest
                const n = Math.ceil(this.maxSize * 0.2);
                const keys = Array.from(this._map.keys()).slice(0, n);
                keys.forEach((k) => this._map.delete(k));
            }
            this._map.set(key, { value, expiresAt: Date.now() + this.ttl });
        }

        has(key)    { return this.get(key) != null; }
        delete(key) { return this._map.delete(key); }
        clear()     { this._map.clear(); }

        cleanup() {
            const now = Date.now();
            for (const [k, v] of this._map) if (v.expiresAt < now) this._map.delete(k);
        }

        startCleanup(interval = 5 * 60 * 1000) {
            this.stopCleanup();
            this._cleanupTimer = setInterval(() => this.cleanup(), interval);
        }
        stopCleanup() {
            if (this._cleanupTimer) clearInterval(this._cleanupTimer);
            this._cleanupTimer = null;
        }
        destroy() { this.stopCleanup(); this.clear(); }
    }

    global.SharedCache = SharedCache;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 3e — `shared/debt-manager.js`

Lookup công nợ theo SĐT qua `/api/v2/wallets/batch-summary`.

```javascript
(function (global) {
    'use strict';

    class DebtManager {
        constructor() {
            this._cache = new SharedCache({ maxSize: 500, ttl: 10 * 60 * 1000, name: 'debt' });
            this._pendingFetches = new Map(); // phone → Promise (dedupe)
        }

        getDebt(phone) {
            const norm = SharedUtils.normalizePhone(phone);
            return norm ? this._cache.get(norm) : null;
        }

        setDebt(phone, amount) {
            const norm = SharedUtils.normalizePhone(phone);
            if (norm) this._cache.set(norm, Number(amount) || 0);
        }

        async loadBatch(phones) {
            const norms = [...new Set(phones.map(SharedUtils.normalizePhone).filter(Boolean))];
            const missing = norms.filter((p) => this._cache.get(p) == null);
            if (missing.length === 0) return;

            try {
                const res = await fetch(`${window.API_CONFIG.WORKER_URL}/api/v2/wallets/batch-summary`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ phones: missing }),
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const data = await res.json();
                // Expected: { success, data: { "<phone>": { balance: number, ... }, ... } }
                const map = data.data || data.balances || {};
                for (const phone of missing) {
                    const entry = map[phone];
                    const balance = entry?.balance != null ? entry.balance : 0;
                    // Convention: debt > 0 means customer owes money (negative balance)
                    this._cache.set(phone, -Number(balance) || 0);
                }
                window.eventBus?.emit('debt:updated', { phones: missing });
            } catch (e) {
                console.warn('[debt] batch load failed:', e.message);
            }
        }

        async loadSingle(phone) {
            const norm = SharedUtils.normalizePhone(phone);
            if (!norm) return null;
            if (this._cache.get(norm) != null) return this._cache.get(norm);
            if (this._pendingFetches.has(norm)) return this._pendingFetches.get(norm);
            const p = this.loadBatch([norm]).then(() => this._cache.get(norm));
            this._pendingFetches.set(norm, p);
            p.finally(() => this._pendingFetches.delete(norm));
            return p;
        }

        startCleanup() { this._cache.startCleanup(); }
        clear()        { this._cache.clear(); }
        destroy()      { this._cache.destroy(); }
    }

    global.sharedDebtManager = new DebtManager();
})(typeof window !== 'undefined' ? window : globalThis);
```

---

### Wire 5 file shared vào `index.html` (trước `</body>`):

```html
<script src="js/shared/event-bus.js"></script>
<script src="js/shared/utils.js"></script>
<script src="js/shared/cache-manager.js"></script>
<script src="js/shared/debt-manager.js"></script>
```

### Verify Phase 3
Console F12:
```javascript
window.eventBus.emit('test', 'hello');
window.SharedUtils.normalizePhone('+84912345678'); // → "0912345678"
window.SharedUtils.formatDebt(50000);              // → "50.000đ"
new window.SharedCache({ name: 't' }).set('a', 1); // no error
window.sharedDebtManager.getDebt('0912345678');    // → null (chưa load)
```

---

## Phase 4a — `layout/column-manager.js`

Cột resize được (drag chuột), swap cột, lưu thứ tự vào localStorage.

```javascript
(function (global) {
    'use strict';

    const STORAGE_KEY = 'tpos_pancake_column_order';
    const MIN_WIDTH = 300;

    const ColumnManager = (() => {
        let _container, _tposCol, _pancakeCol, _handle;
        let _dragState = null;

        function initialize() {
            _container = document.getElementById('dualColumnContainer');
            _tposCol = document.getElementById('tposColumn');
            _pancakeCol = document.getElementById('pancakeColumn');
            _handle = document.getElementById('resizeHandle');
            if (!_container || !_handle) return;

            _applyStoredOrder();
            _wireResize();
            _wireSettingsPanel();
        }

        function _applyStoredOrder() {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (!stored) return;
            try {
                const order = JSON.parse(stored);
                if (Array.isArray(order) && order[0] === 'pancake') {
                    _container.insertBefore(_pancakeCol, _tposCol);
                }
            } catch {}
        }

        function getOrder() {
            return [..._container.querySelectorAll('.column-wrapper')].map((el) => el.dataset.column);
        }

        function swapColumns() {
            const first = _container.querySelector('.column-wrapper');
            const second = first.nextElementSibling?.nextElementSibling; // handle ở giữa
            if (second) _container.insertBefore(second, first);
            localStorage.setItem(STORAGE_KEY, JSON.stringify(getOrder()));
            window.eventBus?.emit('layout:columnSwapped', { order: getOrder() });
        }

        function refreshColumns() {
            window.eventBus?.emit('layout:refresh');
        }

        function _wireResize() {
            const startDrag = (clientX) => {
                const firstCol = _container.querySelector('.column-wrapper');
                const secondCol = firstCol.nextElementSibling?.nextElementSibling;
                if (!secondCol) return;
                _dragState = {
                    startX: clientX,
                    firstStart: firstCol.getBoundingClientRect().width,
                    secondStart: secondCol.getBoundingClientRect().width,
                    firstCol,
                    secondCol,
                };
                _handle.classList.add('active');
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
            };
            const onMove = (clientX) => {
                if (!_dragState) return;
                const delta = clientX - _dragState.startX;
                let w1 = _dragState.firstStart + delta;
                let w2 = _dragState.secondStart - delta;
                if (w1 < MIN_WIDTH) { w1 = MIN_WIDTH; w2 = _dragState.firstStart + _dragState.secondStart - MIN_WIDTH; }
                if (w2 < MIN_WIDTH) { w2 = MIN_WIDTH; w1 = _dragState.firstStart + _dragState.secondStart - MIN_WIDTH; }
                _dragState.firstCol.style.flex = `0 0 ${w1}px`;
                _dragState.secondCol.style.flex = `0 0 ${w2}px`;
            };
            const endDrag = () => {
                if (!_dragState) return;
                _dragState = null;
                _handle.classList.remove('active');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';
            };

            _handle.addEventListener('mousedown', (e) => { e.preventDefault(); startDrag(e.clientX); });
            window.addEventListener('mousemove', (e) => onMove(e.clientX));
            window.addEventListener('mouseup', endDrag);

            _handle.addEventListener('touchstart', (e) => startDrag(e.touches[0].clientX), { passive: true });
            window.addEventListener('touchmove', (e) => onMove(e.touches[0].clientX), { passive: true });
            window.addEventListener('touchend', endDrag);
        }

        function _wireSettingsPanel() {
            const panel = document.getElementById('settingsPanel');
            const btnOpen = document.getElementById('btnColumnSettings');
            const btnClose = document.getElementById('btnCloseSettings');
            const c1 = document.getElementById('column1Select');
            const c2 = document.getElementById('column2Select');

            btnOpen?.addEventListener('click', () => {
                const order = getOrder();
                if (c1) c1.value = order[0];
                if (c2) c2.value = order[1];
                panel?.classList.toggle('show');
            });
            btnClose?.addEventListener('click', () => panel?.classList.remove('show'));

            const sync = () => {
                if (!c1 || !c2) return;
                if (c1.value === c2.value) { c2.value = c1.value === 'tpos' ? 'pancake' : 'tpos'; }
                const wanted = [c1.value, c2.value];
                if (JSON.stringify(wanted) !== JSON.stringify(getOrder())) {
                    swapColumns();
                }
                localStorage.setItem(STORAGE_KEY, JSON.stringify(wanted));
            };
            c1?.addEventListener('change', sync);
            c2?.addEventListener('change', sync);
        }

        // Set content HTML for a column (replaces innerHTML)
        function setColumnContent(key, html) {
            const el = document.getElementById(`${key}Content`);
            if (el) {
                el.innerHTML = html;
                if (typeof lucide !== 'undefined') lucide.createIcons();
            }
        }

        return { initialize, swapColumns, refreshColumns, setColumnContent, getOrder };
    })();

    global.ColumnManager = ColumnManager;
    // Global notification hook (có thể thay bằng shared/notification-system)
    global.showNotification = global.showNotification || function (msg, type = 'info') {
        console.log(`[notif:${type}]`, msg);
    };
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 4b — `layout/settings-manager.js`

Toggle debt display + switch Pancake server mode + quản lý account JWT (list + add + delete). Bộ khung:

```javascript
(function (global) {
    'use strict';

    const SettingsManager = (() => {
        function initialize() {
            _wireTposSettings();
            _wirePancakeSettings();
        }

        function _wireTposSettings() {
            const btn = document.getElementById('btnTposSettings');
            const modal = document.getElementById('tposSettingsModal');
            btn?.addEventListener('click', () => _openTposModal(modal));
        }

        function _openTposModal(modal) {
            modal.querySelector('.pk-modal-content').innerHTML = `
                <div class="pk-modal-header">
                    <h3 style="margin:0;font-size:14px;font-weight:700;">Cài đặt TPOS</h3>
                    <button class="btn-icon" onclick="this.closest('.pk-modal-overlay').classList.remove('active')">
                        <i data-lucide="x" style="width:14px;height:14px;"></i>
                    </button>
                </div>
                <div class="pk-modal-body">
                    <label style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                        <input type="checkbox" id="settShowDebt">
                        Hiện công nợ trong danh sách
                    </label>
                    <label style="display:flex;align-items:center;gap:8px;padding:8px 0;">
                        <input type="checkbox" id="settShowZeroDebt">
                        Hiện cả khách nợ = 0đ
                    </label>
                </div>
            `;
            const a = modal.querySelector('#settShowDebt');
            const b = modal.querySelector('#settShowZeroDebt');
            a.checked = localStorage.getItem('tpos_show_debt') !== 'false';
            b.checked = localStorage.getItem('tpos_show_zero_debt') === 'true';
            a.onchange = () => {
                localStorage.setItem('tpos_show_debt', a.checked);
                if (window.TposState) window.TposState.showDebt = a.checked;
                window.eventBus?.emit('layout:refresh');
            };
            b.onchange = () => {
                localStorage.setItem('tpos_show_zero_debt', b.checked);
                if (window.TposState) window.TposState.showZeroDebt = b.checked;
                window.eventBus?.emit('layout:refresh');
            };
            modal.classList.add('active');
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }

        function _wirePancakeSettings() {
            const btn = document.getElementById('btnPancakeSettings');
            const modal = document.getElementById('pancakeSettingsModal');
            btn?.addEventListener('click', () => _openPancakeModal(modal));
        }

        async function _openPancakeModal(modal) {
            const tm = window.pancakeTokenManager;
            const accounts = tm ? tm.getAllAccounts() : [];
            const activeId = tm ? tm.getActiveAccountId() : null;
            const mode = localStorage.getItem('pancake_server_mode') || 'pancake';

            modal.querySelector('.pk-modal-content').innerHTML = `
                <div class="pk-modal-header">
                    <h3 style="margin:0;font-size:14px;font-weight:700;">Cài đặt Pancake</h3>
                    <button class="btn-icon" onclick="this.closest('.pk-modal-overlay').classList.remove('active')">
                        <i data-lucide="x" style="width:14px;height:14px;"></i>
                    </button>
                </div>
                <div class="pk-modal-body" style="min-width:420px;">
                    <section style="margin-bottom:16px;">
                        <h4 style="margin:0 0 8px;font-size:12px;">Server mode</h4>
                        <label style="display:inline-flex;gap:6px;align-items:center;margin-right:12px;">
                            <input type="radio" name="serverMode" value="pancake" ${mode === 'pancake' ? 'checked' : ''}>
                            Pancake API
                        </label>
                        <label style="display:inline-flex;gap:6px;align-items:center;">
                            <input type="radio" name="serverMode" value="n2store" ${mode === 'n2store' ? 'checked' : ''}>
                            N2Store proxy
                        </label>
                    </section>
                    <section>
                        <h4 style="margin:0 0 8px;font-size:12px;">Tài khoản Pancake (JWT)</h4>
                        <div id="pkAcctList"></div>
                        <div style="margin-top:8px;display:flex;gap:6px;">
                            <input id="pkJwtInput" placeholder="Paste JWT token..." style="flex:1;padding:6px 8px;border:1px solid var(--border);border-radius:6px;font-size:11px;">
                            <button class="btn btn-primary" id="pkAddAcctBtn" style="padding:6px 12px;">Add</button>
                        </div>
                    </section>
                </div>
            `;
            // Render accounts
            const list = modal.querySelector('#pkAcctList');
            list.innerHTML = accounts.length === 0
                ? `<div style="color:var(--gray-500);font-size:12px;">Chưa có tài khoản nào.</div>`
                : accounts.map((a) => `
                    <div style="display:flex;align-items:center;gap:8px;padding:6px 8px;border:1px solid var(--border);border-radius:6px;margin-bottom:4px;${a.id === activeId ? 'background:#eef2ff;' : ''}">
                        <input type="radio" name="activeAcct" value="${a.id}" ${a.id === activeId ? 'checked' : ''}>
                        <span style="flex:1;font-size:12px;">${SharedUtils.escapeHtml(a.fb_name || a.email || a.id)}</span>
                        <button class="btn-icon" data-del="${a.id}" style="width:24px;height:24px;"><i data-lucide="trash-2" style="width:12px;height:12px;"></i></button>
                    </div>
                `).join('');

            modal.classList.add('active');
            if (typeof lucide !== 'undefined') lucide.createIcons();

            // Wire events
            modal.querySelectorAll('input[name=serverMode]').forEach((r) => {
                r.onchange = () => {
                    localStorage.setItem('pancake_server_mode', r.value);
                    if (window.PancakeState) window.PancakeState.serverMode = r.value;
                    document.getElementById('serverModeIndicator').textContent = r.value;
                };
            });
            modal.querySelectorAll('input[name=activeAcct]').forEach((r) => {
                r.onchange = () => tm?.setActiveAccount(r.value).then(() => window.eventBus?.emit('layout:refresh'));
            });
            modal.querySelectorAll('[data-del]').forEach((b) => {
                b.onclick = () => tm?.deleteAccount(b.dataset.del).then(() => _openPancakeModal(modal));
            });
            modal.querySelector('#pkAddAcctBtn').onclick = async () => {
                const input = modal.querySelector('#pkJwtInput');
                const jwt = input.value.trim();
                if (!jwt) return;
                try {
                    await tm.addAccount(jwt);
                    input.value = '';
                    _openPancakeModal(modal);
                } catch (e) {
                    alert('JWT không hợp lệ: ' + e.message);
                }
            };
        }

        return { initialize };
    })();

    global.SettingsManager = SettingsManager;
})(typeof window !== 'undefined' ? window : globalThis);
```

---

## Phase 4c — Wire vào `index.html` (thêm trước `</body>`):

```html
<script src="js/layout/column-manager.js"></script>
<script src="js/layout/settings-manager.js"></script>
```

Chưa wire `app-init.js` — sẽ wire ở Phase 17 sau khi đủ mọi module.

### Verify Phase 4
Mở console:
```javascript
window.ColumnManager.initialize();       // không error
window.ColumnManager.getOrder();         // → ["tpos","pancake"]
// Kéo thử resize handle → 2 cột co giãn, localStorage 'tpos_pancake_column_order' cập nhật sau refresh.
window.ColumnManager.swapColumns();      // 2 cột đổi chỗ
```

Click `btnColumnSettings` → panel floating slide xuống, chọn 2 dropdown → cột swap.
Click `btnTposSettings` → modal hiện với 2 checkbox debt.

---

Xong Phase 3-4. Tiếp sang [03-tpos-column.md](03-tpos-column.md) để dựng cột TPOS (token, state, API, comment list, realtime, create order).
