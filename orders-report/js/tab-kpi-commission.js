// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Commission Tab - Tab "KPI - HOA HỒNG"
 * Quản lý và hiển thị KPI upselling sản phẩm
 *
 * Runs inside iframe (tab-kpi-commission.html)
 * Uses namespace pattern to avoid conflicts
 *
 * Data sources:
 * - Render PostgreSQL via Cloudflare Worker `chatomni-proxy.nhijudyshop.workers.dev`:
 *   - GET  /api/realtime/kpi-statistics         → bảng kpi_statistics (leaderboard chính)
 *   - POST /api/realtime/kpi-base/check-exists  → bảng kpi_base (detect stale)
 *   - GET  /api/social-orders/kpi-stats         → bảng social_orders (sub-tab KPI Đơn Inbox)
 *   - GET  /api/campaigns                       → bảng campaigns (dropdown filter)
 *   - kpi_audit_log: gọi qua window.kpiAuditLogger (managers/kpi-audit-logger.js)
 *   - TPOS proxy: /api/odata/FastSaleOrder, /api/FastSaleOrder/ExportFileRefund, /api/token
 * - Firestore (firebase-config.js):
 *   - settings/employee_ranges          → fallback map userId → userName
 *   - report_order_details/{campaign}   → cache chi tiết đơn cho modal "Sản phẩm"
 */

const KPICommission = {
    // ========================================
    // STATE MANAGEMENT (12.1)
    // ========================================
    state: {
        filters: {
            campaign: '',
            employee: '',
            dateFrom: '',
            dateTo: '',
        },
        statsData: [], // Raw kpi_statistics data [{userId, userName, dates: {...}}]
        filteredData: [], // Filtered + aggregated data for display
        currentEmployeeOrders: [], // Orders for Modal L1
        currentOrderId: null, // Current order in Modal L2
        currentEmployeeUserId: null,
        currentEmployeeName: '',
        isLoading: false,
        employeeNameCache: {}, // Cache for resolved employee names (Bug #4 fix)
        // 'simple' = chỉ hiển thị đơn/user có KPI > 0 (default, hành vi cũ).
        // 'full'   = hiển thị TẤT CẢ đơn gồm cả đơn chưa tick KPI (KPI = 0).
        // Persist localStorage per-user để giữ giữa session.
        displayMode: (() => {
            try {
                return localStorage.getItem('kpiDisplayMode') || 'simple';
            } catch (e) {
                return 'simple';
            }
        })(),
    },

    KPI_PER_PRODUCT: 5000,

    // ========================================
    // HELPERS
    // ========================================
    formatCurrency(amount) {
        return new Intl.NumberFormat('vi-VN').format(amount || 0) + 'đ';
    },

    formatTimestamp(ts) {
        if (!ts) return '---';
        let date;
        if (ts.toDate && typeof ts.toDate === 'function') {
            date = ts.toDate();
        } else if (ts.seconds) {
            date = new Date(ts.seconds * 1000);
        } else if (ts instanceof Date) {
            date = ts;
        } else {
            date = new Date(ts);
        }
        if (isNaN(date.getTime())) return '---';
        const pad = (n) => String(n).padStart(2, '0');
        return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
    },

    escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    },

    reinitIcons() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    },

    getDb() {
        if (window.firebase && window.firebase.firestore) {
            return window.firebase.firestore();
        }
        return null;
    },

    showEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = '';
    },

    hideEl(id) {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    },

    getSourceBadge(source) {
        const chatSources = ['chat_confirm_held', 'chat_decrease', 'chat_from_dropped'];
        const mergeSources = ['merge'];
        if (chatSources.includes(source)) {
            return `<span class="source-badge source-chat">${this.escapeHtml(source)}</span>`;
        }
        if (mergeSources.includes(source)) {
            return `<span class="source-badge source-merge">${this.escapeHtml(source)}</span>`;
        }
        return `<span class="source-badge source-non-chat">${this.escapeHtml(source)}</span>`;
    },

    getActionClass(action) {
        if (action === 'add') return 'action-add';
        if (action === 'remove') return 'action-remove';
        if (action === 'merge') return 'action-merge';
        return '';
    },

    getActionLabel(action) {
        if (action === 'add') return '+ Thêm';
        if (action === 'remove') return '− Xóa';
        if (action === 'merge') return '⇄ Merge';
        return action || '';
    },

    // ========================================
    // EMPLOYEE NAME RESOLUTION (20.1 - Bug #4 fix)
    // ========================================
    /**
     * Resolve employee name from multiple sources with caching.
     * Priority: kpi_statistics → kpi_base → employee_ranges → users → fallback
     * Never returns raw userId alone.
     * @param {string} userId
     * @returns {Promise<string>} resolved display name
     */
    async resolveEmployeeName(userId) {
        if (!userId) return 'Không xác định';
        if (userId === 'unassigned') {
            this.state.employeeNameCache[userId] = 'Chưa phân công';
            return 'Chưa phân công';
        }
        if (this.state.employeeNameCache[userId]) {
            return this.state.employeeNameCache[userId];
        }

        let name = null;

        // Source 1: statsData (already loaded from PostgreSQL)
        for (const stat of this.state.statsData) {
            if (stat.userId === userId && stat.userName && stat.userName !== userId) {
                name = stat.userName;
                break;
            }
        }

        // Source 2: employee_ranges (Firebase settings - admin panel)
        if (!name) {
            const db = this.getDb();
            if (db) {
                try {
                    const rangesDoc = await db.collection('settings').doc('employee_ranges').get();
                    if (rangesDoc.exists) {
                        const ranges = rangesDoc.data().ranges || [];
                        const found = ranges.find((r) => (r.userId || r.id) === userId);
                        if (found) name = found.userName || found.name || null;
                    }
                } catch (e) {}
            }
        }

        // Source 3: admin pattern
        if (!name && userId.startsWith('user_admin_')) name = 'Administrator';

        // Fallback
        if (!name) name = `Nhân viên (${userId})`;

        this.state.employeeNameCache[userId] = name;
        return name;
    },

    // ========================================
    // BATCH RESOLVE EMPLOYEE NAMES (Performance optimization)
    // ========================================
    /**
     * Resolve employee names in batch to avoid N+1 Firestore queries.
     * Loads employee_ranges once, then batch queries kpi_base and users.
     * @param {string[]} userIds - array of unique user IDs
     */
    async batchResolveEmployeeNames(userIds) {
        if (!userIds || userIds.length === 0) return;

        // Special cases
        for (const uid of userIds) {
            if (uid === 'unassigned') this.state.employeeNameCache[uid] = 'Chưa phân công';
            else if (uid.startsWith('user_admin_'))
                this.state.employeeNameCache[uid] = 'Administrator';
        }

        const unresolved = userIds.filter((id) => !this.state.employeeNameCache[id]);
        if (unresolved.length === 0) return;

        // Source 1: statsData (already from PostgreSQL)
        for (const uid of unresolved) {
            for (const stat of this.state.statsData) {
                if (stat.userId === uid && stat.userName && stat.userName !== uid) {
                    this.state.employeeNameCache[uid] = stat.userName;
                    break;
                }
            }
        }

        // Source 2: employee_ranges (Firebase settings - admin panel)
        let stillUnresolved = unresolved.filter((id) => !this.state.employeeNameCache[id]);
        if (stillUnresolved.length > 0) {
            const db = this.getDb();
            if (db) {
                try {
                    const rangesDoc = await db.collection('settings').doc('employee_ranges').get();
                    if (rangesDoc.exists) {
                        const ranges = rangesDoc.data().ranges || [];
                        for (const uid of stillUnresolved) {
                            const found = ranges.find((r) => (r.userId || r.id) === uid);
                            if (found) {
                                const name = found.userName || found.name;
                                if (name) this.state.employeeNameCache[uid] = name;
                            }
                        }
                    }
                } catch (e) {}
            }
        }

        // Fallback
        for (const uid of unresolved) {
            if (!this.state.employeeNameCache[uid]) {
                this.state.employeeNameCache[uid] = `Nhân viên (${uid})`;
            }
        }
    },

    // ========================================
    // STALE STATISTICS DETECTION (20.3 - Bug #4 fix)
    // ========================================
    /**
     * Detect stale statistics by checking BASE existence for each order.
     * Batch queries kpi_base in chunks of 10 (Firestore 'in' query limit).
     * Marks orders with missing BASE as _stale: true.
     * @param {Array} statsData - array of {userId, userName, dates: {...}}
     * @returns {Promise<Array>} statsData with stale markers
     */
    async detectStaleStatistics(statsData) {
        if (!statsData || statsData.length === 0) return statsData;
        const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

        // Collect all unique orderCodes from statistics
        const allOrderCodes = new Set();
        for (const stat of statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.orderCode) allOrderCodes.add(order.orderCode);
                }
            }
        }

        if (allOrderCodes.size === 0) return statsData;

        // Batch check BASE existence via REST API
        let existingBases = new Set();
        try {
            const res = await fetch(`${KPI_API}/kpi-base/check-exists`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ orderCodes: [...allOrderCodes] }),
            });
            if (res.ok) {
                const data = await res.json();
                existingBases = new Set(data.existing || []);
            }
        } catch (e) {
            console.warn('[KPI Tab] detectStaleStatistics: check-exists failed:', e.message);
        }

        // Mark stale orders (BASE missing)
        for (const stat of statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.orderCode && !existingBases.has(order.orderCode)) {
                        order._stale = true;
                        order._staleReason = 'BASE đã bị xóa';
                    }
                }
            }
        }

        return statsData;
    },

    // ========================================
    // EMPTY STATE (20.6 - Bug #4 fix)
    // ========================================
    /**
     * Display empty state message when kpi_statistics is empty.
     * Shows a user-friendly message instead of a blank table or error.
     */
    renderEmptyState() {
        this.hideEl('kpiTableLoading');
        this.hideEl('kpiTableWrapper');
        this.showEl('kpiTableEmpty');

        const emptyEl = document.getElementById('kpiTableEmpty');
        if (emptyEl) {
            const msgEl = emptyEl.querySelector('p');
            if (msgEl) {
                msgEl.textContent =
                    'Chưa có dữ liệu KPI. Dữ liệu sẽ xuất hiện sau khi gửi tin nhắn hàng loạt và nhân viên thao tác sản phẩm.';
            }
        }

        // Reset summary cards to zero
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setVal('totalEmployees', '0');
        setVal('totalOrdersWithBase', '0');
        setVal('totalNetProducts', '0');
        setVal('totalKPIAmount', '0đ');
    },

    // ========================================
    // INIT (12.2)
    // ========================================
    // ========================================
    // KPI INBOX (don-inbox social orders — phân riêng)
    // ========================================

    _inboxKpiByUser: new Map(), // userId → { userName, orderCount, totalQty, totalKPI }
    _inboxKpiLoadedAt: 0,
    _inboxKpiTotals: { orderCount: 0, totalQty: 0, totalKPI: 0 },

    /**
     * Load KPI inbox từ social_orders qua Render API.
     * KPI = total_quantity × 5.000đ flat. Attribute theo created_by.
     * Filter theo date range của KPI tab hiện tại.
     */
    async loadInboxKpiStats() {
        try {
            const { dateFrom, dateTo } = this.state.filters || {};
            const params = new URLSearchParams();
            if (dateFrom) {
                params.set('from', new Date(dateFrom + 'T00:00:00').getTime());
            }
            if (dateTo) {
                params.set('to', new Date(dateTo + 'T23:59:59').getTime());
            }
            const WORKER =
                window.API_CONFIG?.WORKER_URL ||
                window.parent?.API_CONFIG?.WORKER_URL ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            const url = `${WORKER}/api/social-orders/kpi-stats${params.toString() ? '?' + params.toString() : ''}`;
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'kpi-stats failed');

            this._inboxKpiByUser = new Map();
            for (const [uid, v] of Object.entries(data.perUser || {})) {
                this._inboxKpiByUser.set(uid, v);
            }
            this._inboxKpiTotals = data.totals || { orderCount: 0, totalQty: 0, totalKPI: 0 };
            this._inboxKpiLoadedAt = Date.now();
            console.log(
                `[KPI Inbox] Loaded ${this._inboxKpiByUser.size} users, total KPI=${this._inboxKpiTotals.totalKPI}đ`
            );
        } catch (e) {
            console.warn('[KPI Inbox] load failed:', e?.message);
            this._inboxKpiByUser = new Map();
            this._inboxKpiTotals = { orderCount: 0, totalQty: 0, totalKPI: 0 };
        }
    },

    // Inbox tab state
    _inboxSubtabPreset: '30d', // 'today' | '7d' | '30d' | 'thismonth' | 'all' | 'custom'
    _inboxCustomRange: { from: null, to: null }, // ms khi preset = 'custom'
    _activeKpiSubtab: 'orders', // 'orders' | 'inbox'

    /**
     * Resolve date range cho inbox tab theo preset.
     * @returns {{from: number, to: number, label: string}|null} — null = không filter
     */
    _resolveInboxDateRange(preset) {
        const now = Date.now();
        const startOfDay = (d) => {
            const x = new Date(d);
            x.setHours(0, 0, 0, 0);
            return x.getTime();
        };
        const endOfDay = (d) => {
            const x = new Date(d);
            x.setHours(23, 59, 59, 999);
            return x.getTime();
        };
        const today = new Date();
        if (preset === 'today') {
            return { from: startOfDay(today), to: endOfDay(today), label: 'Hôm nay' };
        }
        if (preset === '7d') {
            return { from: now - 7 * 86400000, to: now, label: '7 ngày' };
        }
        if (preset === '30d') {
            return { from: now - 30 * 86400000, to: now, label: '30 ngày' };
        }
        if (preset === 'thismonth') {
            const first = new Date(today.getFullYear(), today.getMonth(), 1);
            return { from: startOfDay(first), to: endOfDay(today), label: 'Tháng này' };
        }
        if (preset === 'custom') {
            const { from, to } = this._inboxCustomRange || {};
            if (from != null && to != null && from <= to) {
                return { from, to, label: 'Tùy chọn' };
            }
            return null;
        }
        // 'all' → không filter
        return null;
    },

    /**
     * Load Inbox KPI riêng cho tab (KHÔNG đụng date filter của campaign tab).
     * Trả về { perUser: Map, totals }. Cache tách biệt từ _inboxKpiByUser
     * (cái này phục vụ tab campaign — đã bị loại bỏ ở cells nhưng để lại
     * helper cho backward-compat).
     */
    async loadInboxSubtabStats() {
        const range = this._resolveInboxDateRange(this._inboxSubtabPreset);
        const params = new URLSearchParams();
        if (range) {
            params.set('from', range.from);
            params.set('to', range.to);
        }
        // 2026-05-19: chỉ count đơn được tính KPI (loại 'draft').
        params.set('excludeDraft', '1');
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        const url = `${WORKER}/api/social-orders/kpi-stats?${params.toString()}`;
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'failed');
            this._inboxSubtabStats = data;
            return data;
        } catch (e) {
            console.warn('[KPI Inbox Tab] load failed:', e?.message);
            this._inboxSubtabStats = {
                perUser: {},
                totals: { orderCount: 0, totalQty: 0, totalKPI: 0 },
            };
            return this._inboxSubtabStats;
        }
    },

    /**
     * Resolve display name cho 1 user trong inbox KPI — ưu tiên name từ user table
     * (kpi_statistics → userName) nếu trùng userId, fallback name trong social_orders.
     */
    _resolveInboxUserName(userId, fallbackName) {
        if (!userId) return fallbackName || 'Không rõ';
        // Tìm trong statsData (đã có name resolved đúng) trước
        const stat = (this.state.statsData || []).find((s) => s.userId === userId);
        if (stat?.userName) return stat.userName;
        return fallbackName || userId;
    },

    // ----- Drill-down state -----
    // Cache đơn theo userId, key bao gồm preset để invalidate khi đổi date range
    _inboxOrdersCache: new Map(), // `${userId}|${preset}` → { orders, loadedAt }
    _inboxOrdersInFlight: new Map(), // userId → Promise (tránh fetch trùng)
    _inboxExpandedUsers: new Set(), // userId đang mở
    _INBOX_STATUS_LABELS: {
        draft: { label: 'Nháp', cls: 'is-draft' },
        order: { label: 'Đơn hàng', cls: 'is-order' },
        processing: { label: 'Đang xử lý', cls: 'is-processing' },
        completed: { label: 'Hoàn thành', cls: 'is-completed' },
        cancelled: { label: 'Đã hủy', cls: 'is-cancelled' },
    },

    /**
     * Render inbox KPI leaderboard table + summary stats.
     * Mỗi dòng NV expandable → drill-down list đơn của NV đó.
     */
    async renderInboxKpiView() {
        const tbody = document.getElementById('kpiInboxTableBody');
        const wrapper = document.getElementById('kpiInboxTableWrapper');
        const empty = document.getElementById('kpiInboxEmpty');
        if (!tbody) return;

        // Trong khi load, không clear bảng cũ (smooth UX)
        const data = await this.loadInboxSubtabStats();
        const perUser = data?.perUser || {};
        const totals = data?.totals || { orderCount: 0, totalQty: 0, totalKPI: 0 };

        // Update summary cards
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        const userCount = Object.keys(perUser).length;
        set('kpiInboxUserCount', userCount.toLocaleString('vi-VN'));
        set('kpiInboxOrderCount', (totals.orderCount || 0).toLocaleString('vi-VN'));
        set('kpiInboxQtyTotal', (totals.totalQty || 0).toLocaleString('vi-VN'));
        set('kpiInboxKpiTotal', this.formatCurrency(totals.totalKPI || 0));

        // Build sorted user list by KPI desc
        const users = Object.values(perUser).sort((a, b) => (b.totalKPI || 0) - (a.totalKPI || 0));

        // Re-render reset trạng thái expand (tránh row index lệch sau khi sort khác)
        this._inboxExpandedUsers = new Set();

        if (users.length === 0) {
            tbody.innerHTML = '';
            if (wrapper) wrapper.style.display = 'none';
            if (empty) empty.style.display = '';
            return;
        }
        if (wrapper) wrapper.style.display = '';
        if (empty) empty.style.display = 'none';

        const COLS = 7; // 1 chevron + 6 data cols
        let html = '';
        users.forEach((u, idx) => {
            const displayName = this._resolveInboxUserName(u.userId, u.userName);
            const uid = u.userId || '';
            const safeUid = this.escapeHtml(uid);
            html += `<tr class="kpi-inbox-user-row" data-user-id="${safeUid}">
                <td class="col-inbox-expand">
                    <button class="kpi-inbox-expand-btn" type="button"
                        data-action="toggle-inbox-user" data-user-id="${safeUid}"
                        aria-expanded="false" title="Xem chi tiết đơn">
                        <i data-lucide="chevron-right"></i>
                    </button>
                </td>
                <td>${idx + 1}</td>
                <td>${this.escapeHtml(displayName)}</td>
                <td>${(u.orderCount || 0).toLocaleString('vi-VN')}</td>
                <td>${(u.totalQty || 0).toLocaleString('vi-VN')}</td>
                <td>${this.formatCurrency(u.totalAmount || 0)}</td>
                <td class="col-kpi-inbox has-inbox">${this.formatCurrency(u.totalKPI || 0)}</td>
            </tr>
            <tr class="kpi-inbox-details-row" data-user-id="${safeUid}" hidden>
                <td colspan="${COLS}" class="kpi-inbox-details-cell">
                    <div class="kpi-inbox-details-placeholder">
                        <i data-lucide="loader-2" class="kpi-inbox-spin"></i>
                        <span>Đang tải danh sách đơn...</span>
                    </div>
                </td>
            </tr>`;
        });
        tbody.innerHTML = html;
        this._bindInboxExpandHandlers();
        this.reinitIcons();
    },

    /**
     * Event delegation cho nút expand. Bind 1 lần lên tbody — re-render thay
     * tbody.innerHTML nên cần bind lại sau mỗi render.
     */
    _bindInboxExpandHandlers() {
        const tbody = document.getElementById('kpiInboxTableBody');
        if (!tbody || tbody.__inboxExpandBound) return;
        tbody.__inboxExpandBound = true;
        tbody.addEventListener('click', (e) => {
            const btn = e.target.closest('[data-action="toggle-inbox-user"]');
            if (!btn) return;
            const uid = btn.dataset.userId;
            if (!uid) return;
            this.toggleInboxUserExpand(uid);
        });
    },

    /** Toggle expand 1 user row + lazy-load đơn nếu chưa cache. */
    async toggleInboxUserExpand(userId) {
        const tbody = document.getElementById('kpiInboxTableBody');
        if (!tbody) return;
        const userRow = tbody.querySelector(
            `tr.kpi-inbox-user-row[data-user-id="${CSS.escape(userId)}"]`
        );
        const detailRow = tbody.querySelector(
            `tr.kpi-inbox-details-row[data-user-id="${CSS.escape(userId)}"]`
        );
        if (!userRow || !detailRow) return;
        const btn = userRow.querySelector('[data-action="toggle-inbox-user"]');

        const isOpen = this._inboxExpandedUsers.has(userId);
        if (isOpen) {
            this._inboxExpandedUsers.delete(userId);
            detailRow.hidden = true;
            userRow.classList.remove('is-expanded');
            if (btn) btn.setAttribute('aria-expanded', 'false');
            return;
        }

        this._inboxExpandedUsers.add(userId);
        detailRow.hidden = false;
        userRow.classList.add('is-expanded');
        if (btn) btn.setAttribute('aria-expanded', 'true');

        const cell = detailRow.querySelector('.kpi-inbox-details-cell');
        if (!cell) return;

        const cacheKey = this._inboxCacheKey(userId);
        const cached = this._inboxOrdersCache.get(cacheKey);
        if (cached && Array.isArray(cached.orders)) {
            this._renderInboxUserOrders(cell, cached.orders);
            return;
        }

        // Hiện spinner sẵn (đã render trong HTML)
        try {
            const orders = await this._loadInboxOrdersForUser(userId);
            // User đã collapse trong lúc đợi → không render
            if (!this._inboxExpandedUsers.has(userId)) return;
            this._renderInboxUserOrders(cell, orders);
        } catch (e) {
            cell.innerHTML = `<div class="kpi-inbox-details-error">
                <i data-lucide="alert-triangle"></i>
                <span>Lỗi tải danh sách đơn: ${this.escapeHtml(e?.message || String(e))}</span>
            </div>`;
            this.reinitIcons();
        }
    },

    /**
     * Fetch danh sách đơn cho 1 user trong khoảng thời gian hiện tại của
     * inbox subtab. Cache + dedupe in-flight.
     */
    /**
     * Build cache key per user theo preset hiện tại. Với 'custom' phải include
     * from/to để invalidate tự động khi đổi khoảng.
     */
    _inboxCacheKey(userId) {
        if (this._inboxSubtabPreset === 'custom') {
            const r = this._inboxCustomRange || {};
            return `${userId}|custom|${r.from || ''}-${r.to || ''}`;
        }
        return `${userId}|${this._inboxSubtabPreset}`;
    },

    async _loadInboxOrdersForUser(userId) {
        const cacheKey = this._inboxCacheKey(userId);
        const cached = this._inboxOrdersCache.get(cacheKey);
        if (cached && Array.isArray(cached.orders)) return cached.orders;

        if (this._inboxOrdersInFlight.has(cacheKey)) {
            return this._inboxOrdersInFlight.get(cacheKey);
        }

        const range = this._resolveInboxDateRange(this._inboxSubtabPreset);
        const params = new URLSearchParams();
        params.set('userId', userId);
        if (range) {
            params.set('from', String(range.from));
            params.set('to', String(range.to));
        }
        params.set('excludeDraft', '1');
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        const url = `${WORKER}/api/social-orders/kpi-stats/orders?${params.toString()}`;

        const promise = (async () => {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            if (!data?.success) {
                throw new Error(data?.error || 'kpi-stats/orders failed');
            }
            const orders = Array.isArray(data.orders) ? data.orders : [];
            this._inboxOrdersCache.set(cacheKey, { orders, loadedAt: Date.now() });
            return orders;
        })();

        this._inboxOrdersInFlight.set(cacheKey, promise);
        try {
            return await promise;
        } finally {
            this._inboxOrdersInFlight.delete(cacheKey);
        }
    },

    /** Render sub-table chi tiết đơn vào cell. */
    _renderInboxUserOrders(cell, orders) {
        if (!cell) return;
        if (!orders || orders.length === 0) {
            cell.innerHTML = `<div class="kpi-inbox-details-empty">
                <i data-lucide="inbox"></i>
                <span>Không có đơn nào.</span>
            </div>`;
            this.reinitIcons();
            return;
        }
        const rows = orders
            .map((o) => {
                const cfg = this._INBOX_STATUS_LABELS[o.status] || this._INBOX_STATUS_LABELS.draft;
                const sttDisp =
                    o.stt != null && o.stt !== '' ? Number(o.stt).toLocaleString('vi-VN') : '—';
                const orderAtDisp = o.orderAt ? this.formatTimestamp(o.orderAt) : '—';
                return `<tr>
                    <td class="col-num">${sttDisp}</td>
                    <td class="col-id"><code>${this.escapeHtml(o.id || '—')}</code></td>
                    <td class="col-num">${(o.totalQuantity || 0).toLocaleString('vi-VN')}</td>
                    <td class="col-money">${this.formatCurrency(o.kpi || 0)}</td>
                    <td class="col-date">${orderAtDisp}</td>
                    <td><span class="kpi-inbox-status-badge ${cfg.cls}">${cfg.label}</span></td>
                </tr>`;
            })
            .join('');
        cell.innerHTML = `
            <div class="kpi-inbox-details-wrap">
                <table class="kpi-inbox-details-table">
                    <thead>
                        <tr>
                            <th class="col-num">STT</th>
                            <th>Số phiếu</th>
                            <th class="col-num">SL Món</th>
                            <th class="col-money">KPI</th>
                            <th class="col-date">Ngày đơn</th>
                            <th>Trạng thái</th>
                        </tr>
                    </thead>
                    <tbody>${rows}</tbody>
                </table>
            </div>`;
        this.reinitIcons();
    },

    /** User click "Tải lại" trong inbox tab — clear cache đơn để fetch lại. */
    refreshInboxKpi() {
        this._inboxOrdersCache = new Map();
        return this.renderInboxKpiView();
    },

    /**
     * Switch giữa 2 sub-tab KPI: 'orders' (campaign-driven) và 'inbox' (don-inbox).
     * Hide/show views + ensure inbox view loaded khi active.
     */
    switchKpiSubTab(name) {
        this._activeKpiSubtab = name;
        // Update active state on buttons
        document.querySelectorAll('[data-kpi-subtab]').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.kpiSubtab === name);
        });
        // Toggle view containers
        const views = {
            orders: document.getElementById('kpiOrdersView'),
            inbox: document.getElementById('kpiInboxView'),
            'check-history': document.getElementById('kpiCheckHistoryView'),
            livestream: document.getElementById('kpiLivestreamView'),
        };
        Object.entries(views).forEach(([key, el]) => {
            if (!el) return;
            const isActive = key === name;
            el.classList.toggle('is-active', isActive);
            el.style.display = isActive ? '' : 'none';
        });
        if (name === 'inbox') {
            this.renderInboxKpiView();
        } else if (name === 'check-history') {
            // Đảm bảo store đã init (idempotent — promise reused)
            this._orderCheckStore.init().catch(() => {});
            this._renderCheckHistory();
        } else if (name === 'livestream') {
            this.renderLivestreamKpiView();
        }
    },

    // ========================================
    // KPI LIVESTREAM (SP bán thêm — cột "BH")
    // Đọc trực tiếp /kpi-livestream-flag/list, gom theo chiến dịch live.
    // Chỉ đếm SL (không tính tiền). Lọc preset ngày phía client (chuỗi +7).
    // ========================================
    _livePreset: '30d',
    _liveRows: null,

    /** Bind preset buttons tab KPI Livestream (idempotent). */
    _bindLivestreamPresets() {
        const btns = document.querySelectorAll('[data-live-preset]');
        btns.forEach((btn) => {
            if (btn.__livePresetBound) return;
            btn.__livePresetBound = true;
            btn.addEventListener('click', () => {
                this._livePreset = btn.dataset.livePreset;
                btns.forEach((b) => b.classList.toggle('is-active', b === btn));
                this.renderLivestreamKpiView();
            });
        });
    },

    /** "YYYY-MM-DD" của 1 instant theo GMT+7 (Vietnam, không DST). */
    _gmt7DateStr(ms) {
        return new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Asia/Ho_Chi_Minh',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
        }).format(new Date(ms));
    },

    /** Lọc rows theo preset, so sánh trên phần ngày (YYYY-MM-DD, +7). */
    _filterLiveRowsByPreset(rows, preset) {
        if (!Array.isArray(rows)) return [];
        if (!preset || preset === 'all') return rows;
        const DAY = 86400000;
        const today = this._gmt7DateStr(Date.now());
        let pass;
        if (preset === 'today') {
            pass = (d) => d === today;
        } else if (preset === '7d') {
            const min = this._gmt7DateStr(Date.now() - 6 * DAY);
            pass = (d) => d >= min;
        } else if (preset === 'thismonth') {
            const ym = today.slice(0, 7);
            pass = (d) => d.slice(0, 7) === ym;
        } else {
            // 30d (default)
            const min = this._gmt7DateStr(Date.now() - 29 * DAY);
            pass = (d) => d >= min;
        }
        return rows.filter((r) => pass(String(r.updatedAt || '').slice(0, 10)));
    },

    /**
     * Render tab KPI Livestream: fetch list (cache), lọc preset, gom theo
     * chiến dịch live, sort theo tổng SL desc.
     * @param {boolean} [forceReload] bỏ cache, fetch lại từ server.
     */
    async renderLivestreamKpiView(forceReload) {
        const tbody = document.getElementById('kpiLivestreamBody');
        if (!tbody) return;
        this._bindLivestreamPresets();
        document
            .querySelectorAll('[data-live-preset]')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.livePreset === this._livePreset));

        if (forceReload || !this._liveRows) {
            tbody.innerHTML =
                '<tr><td colspan="5" style="text-align:center;padding:24px;color:#9ca3af">Đang tải...</td></tr>';
            try {
                const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
                const res = await fetch(`${KPI_API}/kpi-livestream-flag/list?days=365`);
                if (!res.ok) throw new Error('HTTP ' + res.status);
                const data = await res.json();
                this._liveRows = Array.isArray(data.rows) ? data.rows : [];
            } catch (e) {
                console.warn('[KPI Live] load failed:', e?.message);
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:24px;color:#ef4444">Lỗi tải dữ liệu: ${e?.message || e}</td></tr>`;
                return;
            }
        }

        const esc = (s) =>
            String(s == null ? '' : s).replace(
                /[&<>"]/g,
                (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
            );
        const fmtTime = (s) => {
            const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
            return m ? `${m[3]}/${m[2]} ${m[4]}:${m[5]}` : esc(s);
        };

        const rows = this._filterLiveRowsByPreset(this._liveRows, this._livePreset);

        // Group theo campaign
        const groups = new Map(); // campaignKey -> { name, rows:[], qty }
        let totalQty = 0;
        for (const r of rows) {
            const name = (r.campaignName || '').trim() || 'Không xác định / Đơn lẻ';
            const key = name;
            if (!groups.has(key)) groups.set(key, { name, rows: [], qty: 0 });
            const g = groups.get(key);
            g.rows.push(r);
            g.qty += Number(r.quantity) || 0;
            totalQty += Number(r.quantity) || 0;
        }
        const sorted = Array.from(groups.values()).sort((a, b) => b.qty - a.qty);

        // Summary
        const setText = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        setText('kpiLiveCampaignCount', sorted.length);
        setText('kpiLiveLineCount', rows.length);
        setText('kpiLiveQtyTotal', totalQty);

        const empty = document.getElementById('kpiLiveEmpty');
        const wrapper = document.getElementById('kpiLiveTableWrapper');
        if (rows.length === 0) {
            if (empty) empty.style.display = '';
            if (wrapper) wrapper.style.display = 'none';
            tbody.innerHTML = '';
            return;
        }
        if (empty) empty.style.display = 'none';
        if (wrapper) wrapper.style.display = '';

        tbody.innerHTML = sorted
            .map((g) => {
                const header = `
                <tr class="kpi-live-group">
                    <td colspan="2"><strong>📡 ${esc(g.name)}</strong></td>
                    <td style="text-align:center"><strong>${g.qty}</strong></td>
                    <td colspan="2">${g.rows.length} dòng SP</td>
                </tr>`;
                const items = g.rows
                    .map(
                        (r) => `
                <tr>
                    <td style="padding-left:20px">${esc(r.productName)}${r.productCode ? `<div style="font-size:11px;color:#6b7280">Mã: ${esc(r.productCode)}</div>` : ''}</td>
                    <td>${esc(r.orderCode)}</td>
                    <td style="text-align:center">${Number(r.quantity) || 0}</td>
                    <td>${esc(r.setByUserName || '')}</td>
                    <td>${fmtTime(r.updatedAt)}</td>
                </tr>`
                    )
                    .join('');
                return header + items;
            })
            .join('');
    },

    /** Bind preset buttons + custom date range trong inbox tab. */
    _bindInboxPresets() {
        const btns = document.querySelectorAll('[data-inbox-preset]');
        btns.forEach((btn) => {
            if (btn.__inboxPresetBound) return;
            btn.__inboxPresetBound = true;
            btn.addEventListener('click', () => {
                this._inboxSubtabPreset = btn.dataset.inboxPreset;
                btns.forEach((b) => b.classList.toggle('is-active', b === btn));
                this.renderInboxKpiView();
            });
        });

        // Custom date range: "Áp dụng" → switch preset='custom' + reload.
        const fromInput = document.getElementById('kpiInboxDateFrom');
        const toInput = document.getElementById('kpiInboxDateTo');
        const applyBtn = document.getElementById('kpiInboxDateApply');
        if (applyBtn && !applyBtn.__inboxDateBound) {
            applyBtn.__inboxDateBound = true;
            applyBtn.addEventListener('click', () => {
                const fromStr = fromInput?.value;
                const toStr = toInput?.value;
                if (!fromStr || !toStr) {
                    alert('Vui lòng chọn cả ngày Từ và ngày Đến.');
                    return;
                }
                const fromDate = new Date(fromStr + 'T00:00:00');
                const toDate = new Date(toStr + 'T23:59:59.999');
                if (isNaN(fromDate) || isNaN(toDate) || fromDate > toDate) {
                    alert('Khoảng ngày không hợp lệ.');
                    return;
                }
                this._inboxCustomRange = { from: fromDate.getTime(), to: toDate.getTime() };
                this._inboxSubtabPreset = 'custom';
                btns.forEach((b) => b.classList.remove('is-active'));
                this.renderInboxKpiView();
            });
        }
    },

    /**
     * Lookup KPI inbox cho 1 user — tries multiple id forms (userId, username,
     * displayName) vì created_by của social_orders có thể là userId hoặc
     * username tùy thời điểm tạo.
     */
    _getInboxKpiForUser(emp) {
        if (!this._inboxKpiByUser || this._inboxKpiByUser.size === 0) {
            return { orderCount: 0, totalQty: 0, totalKPI: 0 };
        }
        const candidates = [
            emp.userId,
            emp.resolvedName,
            emp.userName,
            (emp.userId || '').toLowerCase(),
            (emp.resolvedName || '').toLowerCase(),
        ].filter(Boolean);
        // Tìm theo exact key
        for (const k of candidates) {
            if (this._inboxKpiByUser.has(k)) return this._inboxKpiByUser.get(k);
        }
        // Fallback: case-insensitive match userName
        const empNameLower = (emp.resolvedName || emp.userName || '').toLowerCase();
        if (empNameLower) {
            for (const v of this._inboxKpiByUser.values()) {
                if ((v.userName || '').toLowerCase() === empNameLower) return v;
            }
        }
        return { orderCount: 0, totalQty: 0, totalKPI: 0 };
    },

    async init() {
        try {
            this.state.isLoading = true;
            this.showEl('kpiTableLoading');
            this.hideEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');

            this._orderCheckStore.init().catch(() => {});

            // Load invoice status + KPI stats in parallel from Render API.
            // (KHÔNG load Inbox KPI ở đây: _inboxKpiByUser không còn cell nào đọc —
            // sub-tab "KPI Đơn Inbox" tự load qua loadInboxSubtabStats khi mở.)
            await Promise.all([this.loadInvoiceStatusData(), this.loadAllStatistics()]);
            // Derive filters from loaded data
            await this.loadCampaignOptions();
            await this.loadEmployeeOptions();

            // (Campaign auto-select chuyển vào _restoreFilters — ưu tiên cache,
            // fallback parent active → campaign mới nhất.)

            // Sync nút toggle mode với state đã khôi phục từ localStorage
            this.updateDisplayModeLabel();

            // Bind filter v2 (date presets, status chips, more menu) — sets default 30d
            this._bindFilterV2();
            // Bind inbox subtab preset buttons (tab "KPI Đơn Inbox")
            this._bindInboxPresets();

            await this.applyFilters();
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Init error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        } finally {
            this.state.isLoading = false;
        }
    },

    // ========================================
    // LOAD DATA FROM RENDER PostgreSQL
    // ========================================
    async loadAllStatistics() {
        const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

        try {
            const res = await fetch(`${KPI_API}/kpi-statistics`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            const rows = data.statistics || [];

            if (rows.length === 0) {
                this.state.statsData = [];
                this.renderEmptyState();
                return;
            }

            // Group by userId → dates
            const userMap = {};
            for (const row of rows) {
                if (!userMap[row.userId]) {
                    userMap[row.userId] = {
                        userId: row.userId,
                        userName: row.userName || row.userId,
                        dates: {},
                    };
                }
                const dateKey =
                    typeof row.date === 'string' ? row.date.substring(0, 10) : String(row.date);
                userMap[row.userId].dates[dateKey] = {
                    totalNetProducts: row.totalNetProducts || 0,
                    totalKPI: row.totalKPI || 0,
                    orders: row.orders || [],
                };
                // Use userName from row if available
                if (row.userName && row.userName !== row.userId) {
                    userMap[row.userId].userName = row.userName;
                }
            }

            const allStats = Object.values(userMap);
            this.state.statsData = allStats;

            // Handle unassigned and admin display names
            for (const stat of allStats) {
                if (stat.userId === 'unassigned') {
                    stat.userName = 'Chưa phân công';
                } else if (stat.userId.startsWith('user_admin_') && stat.userName === stat.userId) {
                    stat.userName = 'Administrator';
                }
                this.state.employeeNameCache[stat.userId] = stat.userName;
            }

            // Detect stale statistics (BASE missing)
            await this.detectStaleStatistics(allStats);
        } catch (error) {
            console.error('[KPI Tab] Error loading statistics:', error);
        }
    },

    // ========================================
    // LOAD CAMPAIGN OPTIONS (12.3)
    // ========================================
    async loadCampaignOptions() {
        const select = document.getElementById('kpiFilterCampaign');
        if (!select) return;

        // Idempotent: xóa options cũ (giữ lại "Tất cả campaign") trước khi
        // append. Nếu init() chạy 2 lần (vd hot reload) → tránh duplicate.
        const opts = [...select.options];
        for (const opt of opts) {
            if (opt.value !== '') opt.remove();
        }

        // Giữ thứ tự giống tab1 "Cài Đặt Chiến Dịch": /api/campaigns sort
        // created_at DESC (mới nhất đầu). KHÔNG alphabetize, dùng insertion order.
        const orderedNames = [];
        const seen = new Set();

        // 1) Lấy FULL danh sách campaign từ /api/campaigns (giống tab1) —
        // tránh case "campaign chưa có KPI thì không xuất hiện trong filter".
        try {
            const parentApi = window.parent?.CampaignAPI || window.top?.CampaignAPI;
            let list = [];
            if (parentApi?.loadAll) {
                list = await parentApi.loadAll();
            } else {
                const url =
                    (window.API_CONFIG?.WORKER_URL ||
                        window.parent?.API_CONFIG?.WORKER_URL ||
                        'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/campaigns';
                const res = await fetch(url);
                if (res.ok) {
                    const data = await res.json();
                    list = data.campaigns || [];
                }
            }
            for (const c of list) {
                const name = c?.name || c?.displayName || c?.id;
                if (name && !seen.has(name)) {
                    seen.add(name);
                    orderedNames.push(name);
                }
            }
        } catch (e) {
            console.warn('[KPI Tab] Load full campaign list failed:', e?.message);
        }

        // 2) Bổ sung campaign từ statsData (case campaign đã bị xóa nhưng
        // KPI history vẫn còn — vẫn cần filter được để xem lại). Append cuối
        // để giữ campaign đang active của API ở trên.
        for (const stat of this.state.statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    const name = order.campaignName;
                    if (name && !seen.has(name)) {
                        seen.add(name);
                        orderedNames.push(name);
                    }
                }
            }
        }

        orderedNames.forEach((name) => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = name;
            select.appendChild(opt);
        });
    },

    // ========================================
    // SYNC CAMPAIGN FROM PARENT WINDOW
    // ========================================
    syncCampaignFromParent() {
        try {
            const parentCM = window.parent?.campaignManager;
            if (!parentCM?.activeCampaign) return;

            const activeName =
                parentCM.activeCampaign.name || parentCM.activeCampaign.displayName || '';
            if (!activeName) return;

            const select = document.getElementById('kpiFilterCampaign');
            if (!select) return;

            // Exact match first
            for (const opt of select.options) {
                if (opt.value === activeName) {
                    select.value = activeName;
                    console.log('[KPI Tab] Auto-selected campaign:', activeName);
                    return;
                }
            }

            // Partial match fallback (campaign name in KPI stats may differ slightly)
            const normalizedActive = activeName.trim().toLowerCase();
            for (const opt of select.options) {
                if (opt.value && opt.value.trim().toLowerCase() === normalizedActive) {
                    select.value = opt.value;
                    console.log('[KPI Tab] Auto-selected campaign (normalized):', opt.value);
                    return;
                }
            }

            console.warn('[KPI Tab] Active campaign not found in KPI data:', activeName);
        } catch (e) {
            // Cross-origin or iframe access error — silently ignore
        }
    },

    // ========================================
    // LOAD EMPLOYEE OPTIONS (12.3)
    // ========================================
    async loadEmployeeOptions() {
        const select = document.getElementById('kpiFilterEmployee');
        if (!select) return;

        try {
            // Use already-loaded statsData + cached names from batchResolve
            const employees = new Map();
            for (const stat of this.state.statsData) {
                const name =
                    this.state.employeeNameCache[stat.userId] || stat.userName || stat.userId;
                employees.set(stat.userId, name);
            }

            // Populate dropdown
            const sorted = [...employees.entries()].sort((a, b) => a[1].localeCompare(b[1]));
            sorted.forEach(([id, name]) => {
                const opt = document.createElement('option');
                opt.value = id;
                if (id === 'unassigned') {
                    opt.textContent = 'Chưa phân công';
                } else {
                    opt.textContent = name && name !== id ? name : id;
                }
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('[KPI Tab] Error loading employees:', error);
        }
    },

    // ========================================
    // APPLY FILTERS (12.4)
    // ========================================
    /**
     * Toggle giữa 2 chế độ hiển thị:
     *   - 'simple' (default, strict): chỉ count SP đã tick (post-feature behavior).
     *   - 'full' (legacy): count MỌI SP qualify variants, bỏ qua sale flag
     *     (pre-feature behavior — như trước khi thêm checkbox).
     * Dashboard swap giữa order.kpi ↔ order.kpiLegacy ngay (dữ liệu đã persist).
     * Persist localStorage, re-apply filters + refresh detail modal (nếu đang mở).
     */
    toggleDisplayMode() {
        const next = this.state.displayMode === 'simple' ? 'full' : 'simple';
        this.state.displayMode = next;
        try {
            localStorage.setItem('kpiDisplayMode', next);
        } catch (e) {}
        this.updateDisplayModeLabel();
        // Re-apply filter + render với mode mới
        this.applyFilters();
        // Nếu modal chi tiết KPI (Modal L1) đang mở → re-render table theo mode mới
        const modalL1 = document.getElementById('modalEmployeeOrders');
        if (modalL1 && modalL1.style.display !== 'none' && this.state.currentEmployeeOrders) {
            this.filterEmployeeOrders();
        }
        // Nếu modal chi tiết đơn (Modal L2) đang mở trên tab "So sánh KPI" → re-render
        const modalL2 = document.getElementById('modalOrderDetails');
        if (modalL2 && modalL2.style.display !== 'none' && this.state.currentOrderId) {
            this.renderNetKPITab(this.state.currentOrderId);
        }
    },

    /** Update label + icon trên nút toggle dựa trên state hiện tại. */
    updateDisplayModeLabel() {
        const label = document.getElementById('displayModeLabel');
        const btn = document.getElementById('btnToggleDisplayMode');
        if (!label || !btn) return;
        if (this.state.displayMode === 'full') {
            label.textContent = 'Hiển thị đầy đủ';
            btn.title = 'Đang xem TẤT CẢ đơn (gồm cả chưa tick KPI). Click để chỉ xem đơn có KPI.';
        } else {
            label.textContent = 'Chỉ có KPI';
            btn.title = 'Đang ẩn đơn không có KPI. Click để xem đầy đủ (bao gồm đơn chưa tick).';
        }
    },

    async applyFilters() {
        // Read filter values từ inputs (chips trạng thái OK/Sai lệch đã bỏ 2026-06-10)
        this.state.filters.campaign =
            (document.getElementById('kpiFilterCampaign') || {}).value || '';
        this.state.filters.employee =
            (document.getElementById('kpiFilterEmployee') || {}).value || '';
        this.state.filters.dateFrom =
            (document.getElementById('kpiFilterDateFrom') || {}).value || '';
        this.state.filters.dateTo = (document.getElementById('kpiFilterDateTo') || {}).value || '';
        this._renderFiltersSummary();
        // Nhớ lựa chọn cho lần mở sau (không có cache → default Hôm nay + campaign mới nhất)
        this._persistFilterCache();

        const { campaign, employee, dateFrom, dateTo } = this.state.filters;

        // Filter statsData
        let filtered = [];

        for (const stat of this.state.statsData) {
            // Filter by employee
            if (employee && stat.userId !== employee) continue;

            const employeeOrders = [];

            for (const [dateKey, dateData] of Object.entries(stat.dates)) {
                // Filter by date range
                if (dateFrom && dateKey < dateFrom) continue;
                if (dateTo && dateKey > dateTo) continue;

                const orders = dateData.orders || [];
                for (const order of orders) {
                    // Filter by campaign
                    if (campaign && order.campaignName !== campaign) continue;

                    // Loại đơn có phiếu Hủy bỏ HOÀN TOÀN khỏi KPI — không
                    // tính, không hiển thị. User chốt: "đơn nào trạng thái HỦY
                    // thì không tính vào và không cần hiển thị".
                    const inv = this._invoiceCache?.get(order.orderId);
                    if (this._isInvoiceCancelled(inv)) continue;

                    // Đơn chưa có phiếu / phiếu Nháp → VẪN hiển thị nhưng đánh dấu
                    // "Chờ phiếu" + KHÔNG cộng KPI (loại ở các chỗ tính tổng).
                    employeeOrders.push({
                        ...order,
                        date: dateKey,
                        _kpiPending: this._isOrderKpiPending(order),
                    });
                }
            }

            if (employeeOrders.length > 0) {
                filtered.push({
                    userId: stat.userId,
                    userName: stat.userName || stat.userId,
                    orders: employeeOrders,
                });
            }
        }

        this.state.filteredData = filtered;

        // (Đã bỏ reload Inbox KPI + render lần 2 ở đây: _inboxKpiByUser không có
        // consumer trong bảng campaign — sub-tab Inbox dùng loadInboxSubtabStats
        // riêng. Trước đây mỗi lần lọc renderKPITable chạy 2 LẦN + 1 fetch thừa.)

        // Update UI
        this.updateSummaryCards(filtered);
        await this.renderKPITable(filtered);
    },

    // ========================================
    // UPDATE SUMMARY CARDS (12.5)
    // ========================================
    updateSummaryCards(filteredData) {
        let totalEmployees = 0;
        let totalOrders = 0;
        let totalNet = 0;
        let totalKPI = 0;

        const fullMode = this.state.displayMode === 'full';

        for (const emp of filteredData) {
            let empHasValidOrders = false;
            for (const order of emp.orders) {
                // Exclude stale orders regardless of mode.
                if (order._stale) continue;
                // Đơn "Chờ phiếu" (chưa có phiếu / phiếu Nháp) → KHÔNG cộng KPI/NET.
                if (order._kpiPending) continue;
                // Simple mode: bỏ qua đơn KPI = 0. Full mode: đếm hết.
                const hasKpi = (order.netProducts || 0) > 0 || (order.kpi || 0) > 0;
                if (!fullMode && !hasKpi) continue;
                empHasValidOrders = true;
                totalOrders++;
                totalNet += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }
            if (empHasValidOrders) totalEmployees++;
        }

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };

        setVal('totalEmployees', totalEmployees);
        setVal('totalOrdersWithBase', totalOrders);
        setVal('totalNetProducts', totalNet);
        setVal('totalKPIAmount', this.formatCurrency(totalKPI));
    },

    // ========================================
    // INVOICE STATUS — self-contained, fetches from Render API directly
    // ========================================

    // ShowState display config (mirrors Tab 1)
    _SHOW_STATE_CONFIG: {
        Nháp: { color: '#6c757d', bgColor: '#f3f4f6', borderColor: '#d1d5db' },
        'Đã xác nhận': { color: '#2563eb', bgColor: '#dbeafe', borderColor: '#93c5fd' },
        'Huỷ bỏ': {
            color: '#dc2626',
            bgColor: '#fee2e2',
            borderColor: '#fca5a5',
            style: 'text-decoration: line-through;',
        },
        'Đã thanh toán': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
        'Hoàn thành': { color: '#059669', bgColor: '#d1fae5', borderColor: '#6ee7b7' },
    },
    _STATE_CODE_CONFIG: {
        draft: { label: 'Nháp', color: '#17a2b8' },
        NotEnoughInventory: { label: 'Chờ nhập hàng', color: '#e67e22' },
        cancel: { label: 'Hủy', color: '#6c757d', style: 'text-decoration: line-through;' },
        IsMergeCancel: {
            label: 'Hủy do gộp đơn',
            color: '#6c757d',
            style: 'text-decoration: line-through;',
        },
        CrossCheckingError: { label: 'Lỗi đối soát', color: '#c0392b' },
        CrossCheckComplete: { label: 'Hoàn thành đối soát', color: '#27ae60' },
        CrossCheckSuccess: { label: 'Đối soát OK', color: '#27ae60' },
        CrossChecking: { label: 'Đang đối soát', color: '#27ae60' },
        None: { label: 'Chưa đối soát', color: '#6c757d' },
    },

    // Invoice data cache: SaleOnlineId → latest invoice object
    _invoiceCache: new Map(),
    _invoiceCacheLoaded: false,

    /**
     * Load invoice status data directly from Render API.
     * Builds a Map of SaleOnlineId → latest invoice entry.
     */
    async loadInvoiceStatusData() {
        if (this._invoiceCacheLoaded) return;
        try {
            const apiBase =
                (window.API_CONFIG?.WORKER_URL ||
                    'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/invoice-status';
            const response = await fetch(`${apiBase}/load`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const result = await response.json();
            if (!result.success) throw new Error(result.error || 'Load failed');

            // Group by SaleOnlineId, keep latest by timestamp
            const latestMap = new Map();
            for (const row of result.entries || []) {
                const soId = row.sale_online_id;
                if (!soId) continue;
                const ts = parseInt(row.entry_timestamp) || 0;
                const existing = latestMap.get(soId);
                if (!existing || ts > existing._ts) {
                    latestMap.set(soId, {
                        SaleOnlineId: soId,
                        Id: row.tpos_id,
                        Number: row.number,
                        Reference: row.reference,
                        ShowState: row.show_state,
                        StateCode: row.state_code,
                        IsMergeCancel: row.is_merge_cancel,
                        UserName: row.user_name,
                        CarrierName: row.carrier_name,
                        DateInvoice: row.date_invoice,
                        _ts: ts,
                    });
                }
            }
            this._invoiceCache = latestMap;
            this._invoiceCacheLoaded = true;
            console.log(`[KPI] Loaded ${latestMap.size} invoice entries`);
        } catch (e) {
            console.error('[KPI] Failed to load invoice status:', e);
        }
    },

    _getShowStateConfig(showState) {
        return (
            this._SHOW_STATE_CONFIG[showState] || {
                color: '#6c757d',
                bgColor: '#f3f4f6',
                borderColor: '#d1d5db',
            }
        );
    },

    _getStateCodeConfig(stateCode, isMergeCancel) {
        if (isMergeCancel) return this._STATE_CODE_CONFIG.IsMergeCancel;
        return this._STATE_CODE_CONFIG[stateCode] || this._STATE_CODE_CONFIG.None;
    },

    /**
     * Phiếu TPOS có bị hủy không? (cả Huỷ bỏ thường lẫn IsMergeCancel/state=cancel).
     * Đơn có invoice hủy KHÔNG được tính KPI (giống đơn refund).
     * @param {object|null|undefined} invoice
     * @returns {boolean}
     */
    _isInvoiceCancelled(invoice) {
        if (!invoice) return false;
        const showState = invoice.ShowState || '';
        const stateCode = invoice.StateCode || '';
        return (
            invoice.State === 'cancel' ||
            stateCode === 'cancel' ||
            invoice.IsMergeCancel === true ||
            showState === 'Huỷ bỏ' ||
            showState === 'Hủy bỏ'
        );
    },

    /**
     * Đơn CHƯA đủ điều kiện tính KPI vì phiếu bán hàng chưa hợp lệ:
     *   - chưa có phiếu (không có entry trong _invoiceCache), HOẶC
     *   - phiếu còn Nháp (ShowState='Nháp' / StateCode='draft').
     * Đơn HỦY KHÔNG rơi vào đây — đã bị ẩn hoàn toàn ở applyFilters.
     * Đơn pending VẪN hiển thị (đánh dấu "Chờ phiếu") nhưng KHÔNG cộng KPI/NET.
     * Khi phiếu được xác nhận + reload → tự hết pending → tính lại.
     * @param {object} order
     * @returns {boolean}
     */
    _isOrderKpiPending(order) {
        const inv = this._invoiceCache?.get(order?.orderId);
        if (!inv) return true; // chưa có phiếu bán hàng
        if (this._isInvoiceCancelled(inv)) return false; // Hủy → ẩn riêng, không pending
        const showState = inv.ShowState || '';
        const stateCode = (inv.StateCode || '').toLowerCase();
        return showState === 'Nháp' || stateCode === 'draft';
    },

    /**
     * Render invoice status cell for a single order in KPI tab.
     * @param {string} orderId - SaleOnlineId
     * @returns {string} HTML string
     */
    renderKPIInvoiceStatusCell(orderId) {
        const invoiceData = this._invoiceCache.get(orderId);
        if (!invoiceData) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        const showState = invoiceData.ShowState || '';
        const stateCode = invoiceData.StateCode || 'None';
        const isMergeCancel = invoiceData.IsMergeCancel === true;
        const showStateConfig = this._getShowStateConfig(showState);
        const stateCodeConfig = this._getStateCodeConfig(stateCode, isMergeCancel);
        const stateCodeStyle = stateCodeConfig.style || '';

        let html = '<div style="display: flex; flex-direction: column; gap: 2px;">';

        // Row 1: ShowState badge + UserName + Invoice Number
        html += '<div style="display: flex; align-items: center; gap: 4px; flex-wrap: wrap;">';

        if (showState) {
            const showStateStyle = showStateConfig.style || '';
            html += `<span style="background: ${showStateConfig.bgColor}; color: ${showStateConfig.color}; border: 1px solid ${showStateConfig.borderColor}; font-size: 11px; padding: 1px 6px; border-radius: 4px; font-weight: 500; ${showStateStyle}" title="Số phiếu: ${invoiceData.Number || ''}">${showState}</span>`;
        }

        if (invoiceData.UserName) {
            html += `<span style="background: #e0e7ff; color: #4338ca; font-size: 10px; padding: 1px 5px; border-radius: 3px; font-weight: 500;" title="Người tạo bill">${invoiceData.UserName}</span>`;
        }

        if (invoiceData.Number) {
            const shortNum = invoiceData.Number.replace(/^NJD\//, '');
            html += `<span style="background: #f0f9ff; color: #0369a1; font-size: 9px; padding: 1px 4px; border-radius: 3px; font-weight: 500; border: 1px solid #bae6fd; cursor: pointer;" onclick="navigator.clipboard.writeText('${invoiceData.Number.replace(/'/g, "\\'")}'); event.stopPropagation();" title="Click để copy mã phiếu">${shortNum}</span>`;
        }

        html += '</div>';

        // Row 2: StateCode text
        html += `<div style="font-size: 11px; color: ${stateCodeConfig.color}; ${stateCodeStyle}">${stateCodeConfig.label}</div>`;

        // Row 3: DateInvoice
        if (invoiceData.DateInvoice) {
            const d = new Date(invoiceData.DateInvoice);
            if (!isNaN(d.getTime())) {
                const dd = String(d.getDate()).padStart(2, '0');
                const mm = String(d.getMonth() + 1).padStart(2, '0');
                const hh = String(d.getHours()).padStart(2, '0');
                const mi = String(d.getMinutes()).padStart(2, '0');
                html += `<div style="font-size: 10px; color: #6b7280;" title="${d.toLocaleString('vi-VN')}">${dd}/${mm} ${hh}:${mi}</div>`;
            }
        }

        html += '</div>';
        return html;
    },

    /**
     * Render aggregate invoice status summary for employee row.
     * Shows count badges by ShowState: "120 Đã TT | 5 Đã XN | 2 Hủy | 3 −"
     * @param {Array} orders - Array of order objects for this employee
     * @returns {string} HTML string
     */
    renderKPIInvoiceStatusSummary(orders) {
        if (!orders || orders.length === 0) {
            return '<span style="color: #9ca3af;">−</span>';
        }

        // Count orders by ShowState
        const counts = {};
        let noInvoice = 0;

        for (const order of orders) {
            const invoiceData = this._invoiceCache.get(order.orderId);
            if (!invoiceData) {
                noInvoice++;
                continue;
            }
            const state = invoiceData.ShowState || 'Không rõ';
            counts[state] = (counts[state] || 0) + 1;
        }

        // Build badges in priority order
        const stateOrder = ['Đã thanh toán', 'Đã xác nhận', 'Nháp', 'Huỷ bỏ'];
        const shortLabels = {
            'Đã thanh toán': 'Đã TT',
            'Đã xác nhận': 'Đã XN',
            Nháp: 'Nháp',
            'Huỷ bỏ': 'Hủy',
            'Hoàn thành': 'HT',
        };

        let html = '<div style="display:flex; flex-wrap:wrap; gap:3px;">';

        for (const state of stateOrder) {
            if (!counts[state]) continue;
            const cfg = this._getShowStateConfig(state);
            const label = shortLabels[state] || state;
            const style = cfg.style || '';
            html += `<span style="background:${cfg.bgColor};color:${cfg.color};border:1px solid ${cfg.borderColor};font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;${style}">${counts[state]} ${label}</span>`;
            delete counts[state];
        }

        // Any remaining states not in stateOrder
        for (const [state, count] of Object.entries(counts)) {
            const cfg = this._getShowStateConfig(state);
            const label = shortLabels[state] || state;
            const style = cfg?.style || '';
            html += `<span style="background:${cfg?.bgColor || '#f3f4f6'};color:${cfg?.color || '#6c757d'};border:1px solid ${cfg?.borderColor || '#d1d5db'};font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;${style}">${count} ${label}</span>`;
        }

        if (noInvoice > 0) {
            html += `<span style="background:#f3f4f6;color:#9ca3af;font-size:10px;padding:1px 5px;border-radius:3px;font-weight:500;">${noInvoice} −</span>`;
        }

        html += '</div>';
        return html;
    },

    // ========================================
    // INVOICE DETAIL MODAL — click số phiếu xem chi tiết
    // ========================================

    async showInvoiceDetail(invoiceId, invoiceNumber) {
        // Tạo modal nếu chưa có
        let modal = document.getElementById('invoiceDetailModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'invoiceDetailModal';
            modal.className = 'modal-overlay invoice-detail-modal';
            modal.innerHTML = `
                <div class="modal-container invoice-detail-container">
                    <div class="modal-header">
                        <h3 class="modal-title">
                            <i data-lucide="receipt"></i>
                            Chi tiết phiếu <span id="invDetailNumber">—</span>
                        </h3>
                        <div class="invoice-detail-actions">
                            <a href="#" target="_blank" id="invDetailTposLink" class="kpi-icon-btn" title="Mở trên TPOS">
                                <i data-lucide="external-link"></i> TPOS
                            </a>
                            <button class="modal-close" onclick="document.getElementById('invoiceDetailModal').style.display='none'">
                                <i data-lucide="x"></i>
                            </button>
                        </div>
                    </div>
                    <div class="modal-body invoice-detail-body" id="invDetailBody">
                        <div class="loading-state"><div class="spinner"></div><p>Đang tải...</p></div>
                    </div>
                </div>`;
            document.body.appendChild(modal);
            // Click outside to close
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.style.display = 'none';
            });
        }
        modal.style.display = 'flex';
        document.getElementById('invDetailNumber').textContent = invoiceNumber || '—';
        const tposLink = document.getElementById('invDetailTposLink');
        if (tposLink && invoiceId) {
            tposLink.href = `https://tomato.tpos.vn/#/app/fastsaleorder/${invoiceId}`;
        }
        const body = document.getElementById('invDetailBody');
        if (body)
            body.innerHTML =
                '<div class="loading-state"><div class="spinner"></div><p>Đang tải chi tiết phiếu...</p></div>';
        if (window.lucide?.createIcons) window.lucide.createIcons();

        if (!invoiceId) {
            if (body)
                body.innerHTML =
                    '<div class="empty-state"><p>Phiếu không có ID — không thể tải chi tiết.</p></div>';
            return;
        }

        try {
            const data = await this._fetchInvoiceDetail(invoiceId);
            if (!data) {
                if (body)
                    body.innerHTML =
                        '<div class="empty-state"><p>Không tải được chi tiết phiếu từ TPOS.</p></div>';
                return;
            }
            this._renderInvoiceDetail(body, data);
        } catch (e) {
            console.warn('[KPI Tab] Invoice detail fetch failed:', e?.message);
            if (body)
                body.innerHTML = `<div class="empty-state"><p>Lỗi: ${this.escapeHtml(e.message || '')}</p></div>`;
        }
    },

    async _fetchInvoiceDetail(invoiceId) {
        if (!this._invoiceDetailCache) this._invoiceDetailCache = new Map();
        if (this._invoiceDetailCache.has(invoiceId)) {
            return this._invoiceDetailCache.get(invoiceId);
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else {
            // Fallback to /api/token
            const companyId =
                window.ShopConfig?.getConfig?.()?.CompanyId ||
                window.parent?.ShopConfig?.getConfig?.()?.CompanyId ||
                1;
            const creds =
                companyId === 2
                    ? {
                          grant_type: 'password',
                          username: 'nvktshop1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      }
                    : {
                          grant_type: 'password',
                          username: 'nvktlive1',
                          password: 'Aa@28612345678',
                          client_id: 'tmtWebApp',
                      };
            const formData = new URLSearchParams();
            for (const [k, v] of Object.entries(creds)) formData.append(k, v);
            const tokenRes = await fetch(`${WORKER}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: formData.toString(),
            });
            const tokenData = await tokenRes.json();
            authHeader = { Authorization: `Bearer ${tokenData.access_token}` };
        }
        const res = await fetch(
            `${WORKER}/api/odata/FastSaleOrder(${invoiceId})?$expand=OrderLines,Partner,User`,
            {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        this._invoiceDetailCache.set(invoiceId, data);
        return data;
    },

    _renderInvoiceDetail(container, data) {
        if (!container) return;
        const fmt = (n) => (n || 0).toLocaleString('vi-VN') + ' ₫';
        const date = data.DateInvoice ? new Date(data.DateInvoice).toLocaleString('vi-VN') : '—';
        const lines = data.OrderLines || [];
        const totalQty = lines.reduce((s, l) => s + (l.Quantity || 0), 0);

        const linesHtml = lines.length
            ? `<table class="inv-detail-items">
                <thead>
                    <tr>
                        <th>Sản phẩm</th>
                        <th>Mã</th>
                        <th>SL</th>
                        <th>Đơn giá</th>
                        <th>Thành tiền</th>
                    </tr>
                </thead>
                <tbody>
                    ${lines
                        .map(
                            (l) => `<tr>
                        <td>${this.escapeHtml(l.ProductName || l.ProductNameGet || l.Name || '—')}</td>
                        <td><code>${this.escapeHtml(l.ProductCode || '—')}</code></td>
                        <td class="num">${l.Quantity || 0}</td>
                        <td class="num">${fmt(l.Price)}</td>
                        <td class="num"><strong>${fmt(l.PriceSubTotal || (l.Price || 0) * (l.Quantity || 0))}</strong></td>
                    </tr>`
                        )
                        .join('')}
                </tbody>
            </table>`
            : '<div class="empty-state"><p>Phiếu không có dòng sản phẩm.</p></div>';

        container.innerHTML = `
            <div class="inv-detail-grid">
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Số phiếu</div>
                    <div class="inv-detail-value"><strong>${this.escapeHtml(data.Number || '')}</strong></div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Ngày lập</div>
                    <div class="inv-detail-value">${this.escapeHtml(date)}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Trạng thái</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.ShowState || data.State || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Khách hàng</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.PartnerDisplayName || data.Partner?.Name || '—')}<br><small>${this.escapeHtml(data.Phone || data.Partner?.Phone || '')}</small></div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">SĐT giao hàng</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.Phone || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">Địa chỉ</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.Address || data.FullAddress || '—')}</div>
                </div>
                <div class="inv-detail-card">
                    <div class="inv-detail-label">NV bán</div>
                    <div class="inv-detail-value">${this.escapeHtml(data.UserName || data.User?.Name || '—')}</div>
                </div>
                <div class="inv-detail-card inv-detail-total">
                    <div class="inv-detail-label">Tổng tiền</div>
                    <div class="inv-detail-value"><strong>${fmt(data.AmountTotal)}</strong></div>
                </div>
            </div>
            ${data.Comment || data.Note ? `<div class="inv-detail-note"><strong>Ghi chú:</strong> ${this.escapeHtml(data.Comment || data.Note)}</div>` : ''}
            <h4 class="inv-detail-section-title"><i data-lucide="package"></i> Sản phẩm (${lines.length} loại, ${totalQty} SP)</h4>
            ${linesHtml}
        `;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    // ========================================
    // FILTER BAR V2 — date presets, status chips, more menu
    // ========================================

    _formatDateForInput(d) {
        const yy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, '0');
        const dd = String(d.getDate()).padStart(2, '0');
        return `${yy}-${mm}-${dd}`;
    },

    _applyDatePreset(preset) {
        const fromEl = document.getElementById('kpiFilterDateFrom');
        const toEl = document.getElementById('kpiFilterDateTo');
        const customWrap = document.getElementById('kpiDateCustom');
        if (!fromEl || !toEl) return;
        const today = new Date();
        const setRange = (from, to) => {
            fromEl.value = this._formatDateForInput(from);
            toEl.value = this._formatDateForInput(to);
        };
        if (preset === 'today') {
            setRange(today, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === '7d') {
            const from = new Date(today);
            from.setDate(from.getDate() - 6);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === '30d') {
            const from = new Date(today);
            from.setDate(from.getDate() - 29);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'thismonth') {
            const from = new Date(today.getFullYear(), today.getMonth(), 1);
            setRange(from, today);
            if (customWrap) customWrap.style.display = 'none';
        } else if (preset === 'custom') {
            if (customWrap) customWrap.style.display = '';
        }
    },

    /** Đổ options cho dropdown chọn tháng: 3 tháng tới → 12 tháng trước (mới nhất ở trên). */
    _populateMonthOptions(sel) {
        const today = new Date();
        const opts = ['<option value="">Chọn tháng…</option>'];
        for (let i = 3; i >= -12; i--) {
            const d = new Date(today.getFullYear(), today.getMonth() + i, 1);
            const yy = d.getFullYear();
            const mm = d.getMonth() + 1;
            const val = `${yy}-${String(mm).padStart(2, '0')}`;
            opts.push(`<option value="${val}">${mm}-${yy}</option>`);
        }
        sel.innerHTML = opts.join('');
    },

    /** Set khoảng ngày = ngày 1 → ngày cuối của tháng đã chọn (val = "YYYY-MM"). */
    _applyMonthRange(val) {
        const fromEl = document.getElementById('kpiFilterDateFrom');
        const toEl = document.getElementById('kpiFilterDateTo');
        const customWrap = document.getElementById('kpiDateCustom');
        if (!fromEl || !toEl) return;
        const [yy, mm] = val.split('-').map(Number);
        const from = new Date(yy, mm - 1, 1);
        const to = new Date(yy, mm, 0); // ngày cuối tháng
        fromEl.value = this._formatDateForInput(from);
        toEl.value = this._formatDateForInput(to);
        if (customWrap) customWrap.style.display = 'none';
    },

    _bindFilterV2() {
        if (this.__filterV2Bound) return;
        this.__filterV2Bound = true;

        // Date preset buttons
        document.querySelectorAll('.kpi-preset-btn').forEach((btn) => {
            btn.addEventListener('click', () => {
                document
                    .querySelectorAll('.kpi-preset-btn')
                    .forEach((b) => b.classList.toggle('is-active', b === btn));
                // Bấm preset → bỏ chọn tháng cụ thể
                const monthSel = document.getElementById('kpiFilterMonth');
                if (monthSel) {
                    monthSel.classList.remove('is-active');
                    monthSel.value = '';
                }
                const preset = btn.dataset.preset;
                this._applyDatePreset(preset);
                if (preset !== 'custom') {
                    this.applyFilters();
                }
            });
        });

        // Month picker (thay cho nút "Tháng này" — chọn tháng cụ thể vd 5-2026)
        const monthSel = document.getElementById('kpiFilterMonth');
        if (monthSel) {
            this._populateMonthOptions(monthSel);
            monthSel.addEventListener('change', () => {
                const val = monthSel.value;
                if (!val) {
                    monthSel.classList.remove('is-active');
                    return;
                }
                // Chọn tháng cụ thể → bỏ active các preset button
                document
                    .querySelectorAll('.kpi-preset-btn')
                    .forEach((b) => b.classList.remove('is-active'));
                monthSel.classList.add('is-active');
                this._applyMonthRange(val);
                this.applyFilters();
            });
        }

        // Auto-apply on date inputs change
        ['kpiFilterDateFrom', 'kpiFilterDateTo'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.applyFilters());
            }
        });
        // Auto-apply on campaign / employee change
        ['kpiFilterCampaign', 'kpiFilterEmployee'].forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener('change', () => this.applyFilters());
            }
        });

        // More actions menu
        const moreBtn = document.getElementById('btnKpiMoreActions');
        const moreMenu = document.getElementById('kpiMoreMenu');
        if (moreBtn && moreMenu) {
            moreBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                moreMenu.classList.toggle('is-open');
            });
            document.addEventListener('click', () => {
                moreMenu.classList.remove('is-open');
            });
            moreMenu.addEventListener('click', (e) => e.stopPropagation());
        }

        // Khôi phục lựa chọn lần trước từ localStorage; KHÔNG có cache →
        // default HÔM NAY + campaign MỚI NHẤT (user chốt 2026-06-10).
        this._restoreFilters();
    },

    // ── Filter cache: nhớ lựa chọn giữa các lần mở tab ──
    _FILTER_CACHE_KEY: 'kpiFilterCache_v1',

    /** Lưu lựa chọn filter hiện tại (gọi sau mỗi applyFilters). */
    _persistFilterCache() {
        try {
            const activeBtn = document.querySelector('.kpi-preset-btn.is-active');
            const monthSel = document.getElementById('kpiFilterMonth');
            const monthActive = monthSel?.classList.contains('is-active');
            localStorage.setItem(
                this._FILTER_CACHE_KEY,
                JSON.stringify({
                    // Lưu PRESET (today/7d/...) thay vì ngày cứng → hôm sau mở
                    // "Hôm nay" vẫn là ngày mới. Ngày cứng chỉ lưu cho custom.
                    datePreset: monthActive ? null : activeBtn?.dataset.preset || null,
                    month: monthActive ? monthSel.value : null,
                    dateFrom: this.state.filters.dateFrom,
                    dateTo: this.state.filters.dateTo,
                    campaign: this.state.filters.campaign,
                    employee: this.state.filters.employee,
                })
            );
        } catch (e) {}
    },

    /**
     * Khôi phục filter khi mở tab:
     *   - Date: cache (preset/tháng/custom) → không có → HÔM NAY.
     *   - Campaign: cache → campaign active của parent → MỚI NHẤT (option đầu
     *     dropdown — /api/campaigns đã sort created_at DESC).
     *   - NV: cache (nếu còn trong options).
     * Gọi từ _bindFilterV2 (sau khi options campaign/NV + tháng đã populate).
     */
    _restoreFilters() {
        let cache = null;
        try {
            cache = JSON.parse(localStorage.getItem(this._FILTER_CACHE_KEY) || 'null');
        } catch (e) {}

        const setPresetActive = (preset) => {
            document
                .querySelectorAll('.kpi-preset-btn')
                .forEach((b) => b.classList.toggle('is-active', b.dataset.preset === preset));
        };

        // 1) Khoảng ngày
        const monthSel = document.getElementById('kpiFilterMonth');
        const PRESETS = ['today', '7d', '30d', 'thismonth'];
        if (cache?.month && monthSel) {
            monthSel.value = cache.month;
            if (monthSel.value === cache.month) {
                setPresetActive('__none__');
                monthSel.classList.add('is-active');
                this._applyMonthRange(cache.month);
            } else {
                // Tháng cache không còn trong options → fallback hôm nay
                setPresetActive('today');
                this._applyDatePreset('today');
            }
        } else if (cache?.datePreset === 'custom' && cache?.dateFrom && cache?.dateTo) {
            const fromEl = document.getElementById('kpiFilterDateFrom');
            const toEl = document.getElementById('kpiFilterDateTo');
            const customWrap = document.getElementById('kpiDateCustom');
            if (fromEl) fromEl.value = cache.dateFrom;
            if (toEl) toEl.value = cache.dateTo;
            if (customWrap) customWrap.style.display = '';
            setPresetActive('custom');
        } else if (cache?.datePreset && PRESETS.includes(cache.datePreset)) {
            setPresetActive(cache.datePreset);
            this._applyDatePreset(cache.datePreset);
        } else {
            // KHÔNG có cache → mặc định HÔM NAY
            setPresetActive('today');
            this._applyDatePreset('today');
        }

        // 2) Campaign: cache → parent active → mới nhất
        const campSel = document.getElementById('kpiFilterCampaign');
        if (campSel) {
            let applied = false;
            if (cache?.campaign) {
                campSel.value = cache.campaign;
                applied = campSel.value === cache.campaign;
            }
            if (!applied) {
                this.syncCampaignFromParent();
                applied = !!campSel.value;
            }
            if (!applied) {
                const firstOpt = [...campSel.options].find((o) => o.value);
                if (firstOpt) campSel.value = firstOpt.value;
            }
        }

        // 3) Nhân viên (chỉ từ cache)
        const empSel = document.getElementById('kpiFilterEmployee');
        if (empSel && cache?.employee) {
            empSel.value = cache.employee;
            if (empSel.value !== cache.employee) empSel.value = '';
        }
    },

    _renderFiltersSummary() {
        const el = document.getElementById('kpiFiltersSummary');
        if (!el) return;
        const parts = [];
        const f = this.state.filters || {};
        if (f.dateFrom && f.dateTo) {
            parts.push(`📅 ${f.dateFrom} → ${f.dateTo}`);
        }
        if (f.campaign) parts.push(`🎯 ${f.campaign}`);
        if (f.employee) {
            const empSel = document.getElementById('kpiFilterEmployee');
            const label = empSel?.options[empSel.selectedIndex]?.text || f.employee;
            parts.push(`👤 ${label}`);
        }
        el.textContent = parts.length ? 'Filter: ' + parts.join(' · ') : '';
    },

    // ========================================
    // LEADERBOARD + HERO HELPERS (redesign)
    // ========================================

    _initials(name) {
        const parts = String(name || '')
            .trim()
            .split(/\s+/)
            .filter(Boolean);
        if (parts.length === 0) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    },

    _avatarColor(seed) {
        const palette = [
            'linear-gradient(135deg, #6366f1, #ec4899)',
            'linear-gradient(135deg, #06b6d4, #3b82f6)',
            'linear-gradient(135deg, #f59e0b, #ef4444)',
            'linear-gradient(135deg, #10b981, #14b8a6)',
            'linear-gradient(135deg, #8b5cf6, #d946ef)',
            'linear-gradient(135deg, #ec4899, #f97316)',
        ];
        let hash = 0;
        for (let i = 0; i < (seed || '').length; i++) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
        return palette[hash % palette.length];
    },

    _renderLeaderboard(aggregated) {
        const wrap = document.getElementById('kpiLeaderboardWrapper');
        if (!wrap) return;
        if (!aggregated || aggregated.length === 0) {
            wrap.innerHTML = '';
            return;
        }
        const reconRan = !!(this._reconKpiLossByUser && this._reconKpiLossByUser.size > 0);
        const fullMode = this.state.displayMode === 'full';
        const maxNetKpi = aggregated.reduce((max, e) => {
            const loss = (this._reconKpiLossByUser?.get(e.userId) || {}).kpiLost || 0;
            return Math.max(max, e.totalKPI - loss);
        }, 0);
        let html = '';
        aggregated.forEach((emp, idx) => {
            const rank = idx + 1;
            let rankCls = '';
            if (rank === 1) rankCls = 'is-gold';
            else if (rank === 2) rankCls = 'is-silver';
            else if (rank === 3) rankCls = 'is-bronze';
            const rankIcon = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;

            const orderCount = emp.orders.filter((o) => {
                if (o._stale) return false;
                if (o._kpiPending) return false; // chờ phiếu → không tính vào "X đơn"
                if (fullMode) return true;
                return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
            }).length;

            const lossInfo = this._reconKpiLossByUser?.get(emp.userId) || {
                kpiLost: 0,
                refundCount: 0,
            };
            const kpiNet = emp.totalKPI - lossInfo.kpiLost;
            const netPct = maxNetKpi > 0 ? Math.max(2, Math.round((kpiNet / maxNetKpi) * 100)) : 2;
            const lossPct =
                emp.totalKPI > 0 ? Math.round((lossInfo.kpiLost / emp.totalKPI) * 100) : 0;

            const initials = this._initials(emp.resolvedName);
            const avatarBg = this._avatarColor(emp.userId || emp.resolvedName);

            const refundBadge =
                reconRan && lossInfo.refundCount > 0
                    ? `<span class="lb-emp-refund-badge"><i data-lucide="undo-2"></i>${lossInfo.refundCount} hoàn</span>`
                    : '';

            const pendingBadge =
                (emp.pendingCount || 0) > 0
                    ? `<span class="lb-emp-pending-badge" title="Đơn chưa có phiếu / phiếu Nháp — chưa tính KPI">⏳ ${emp.pendingCount} chờ phiếu</span>`
                    : '';

            // KPI Inbox đã chuyển sang tab riêng — không badge ở đây nữa.

            html += `<div class="lb-row" onclick="window.KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')" tabindex="0" role="button">
                <div class="lb-rank ${rankCls}" title="Hạng ${rank}">${rankIcon}</div>
                <div class="lb-employee">
                    <div class="lb-emp-info">
                        <div class="lb-emp-name">${this.escapeHtml(emp.resolvedName)}</div>
                        <div class="lb-emp-meta">
                            <span class="lb-emp-meta-item"><i data-lucide="package"></i>${orderCount} đơn</span>
                            <span class="lb-emp-meta-item"><i data-lucide="layers"></i>${emp.totalNetProducts} SP NET</span>
                            ${refundBadge}
                            ${pendingBadge}
                        </div>
                    </div>
                </div>
                <div class="lb-kpi-bar-wrap">
                    <div class="lb-kpi-bar-label">
                        <span>KPI thực</span>
                        <span class="lb-kpi-bar-pct">${maxNetKpi > 0 ? Math.round((kpiNet / maxNetKpi) * 100) : 0}%</span>
                    </div>
                    <div class="lb-kpi-bar">
                        <div class="lb-kpi-bar-net" style="width:${netPct}%;"></div>
                        ${lossInfo.kpiLost > 0 ? `<div class="lb-kpi-bar-loss" style="left:${netPct}%;width:${Math.min(lossPct, 100 - netPct)}%;" title="Bị loại do refund: ${this.formatCurrency(lossInfo.kpiLost)}"></div>` : ''}
                    </div>
                </div>
                <div class="lb-kpi-amount">
                    <div class="lb-kpi-amount-net">${this.formatCurrency(kpiNet)}</div>
                    <div class="lb-kpi-amount-gross ${lossInfo.kpiLost > 0 ? 'has-loss' : ''}">${lossInfo.kpiLost > 0 ? `gross ${this.formatCurrency(emp.totalKPI)} − ${this.formatCurrency(lossInfo.kpiLost)} hoàn` : 'không có loss'}</div>
                </div>
                <div class="lb-action">
                    <button class="lb-detail-btn" onclick="event.stopPropagation();window.KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')"><i data-lucide="chevron-right"></i> Chi tiết</button>
                </div>
            </div>`;
        });
        wrap.innerHTML = html;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    _updateHeroStats(aggregated) {
        const totalKpiNet = aggregated.reduce((sum, e) => {
            const loss = (this._reconKpiLossByUser?.get(e.userId) || {}).kpiLost || 0;
            return sum + (e.totalKPI - loss);
        }, 0);
        const totalKpiGross = aggregated.reduce((sum, e) => sum + e.totalKPI, 0);
        const totalRefunds = [...(this._reconKpiLossByUser?.values() || [])].reduce(
            (sum, v) => sum + (v.refundCount || 0),
            0
        );
        const reconRan = !!(this._reconKpiLossByUser && this._reconKpiLossByUser.size > 0);

        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        set('kpiHeroTotal', this.formatCurrency(totalKpiNet));
        set(
            'kpiHeroSub',
            reconRan
                ? `Đã đối soát · gross ${this.formatCurrency(totalKpiGross)}, loại ${this.formatCurrency(totalKpiGross - totalKpiNet)}`
                : 'Chưa chạy đối soát — hãy chạy để loại đơn hoàn'
        );
        set('kpiHeroEmps', aggregated.length.toLocaleString('vi-VN'));
        set('kpiHeroRefunds', reconRan ? totalRefunds.toLocaleString('vi-VN') : '—');
    },

    _bindLeaderboardToggle() {
        const btns = document.querySelectorAll('.lb-toggle-btn');
        btns.forEach((b) => {
            if (b.__lbBound) return;
            b.__lbBound = true;
            b.addEventListener('click', () => {
                const view = b.dataset.view;
                this._kpiViewMode = view;
                btns.forEach((x) => x.classList.toggle('is-active', x === b));
                const lbWrap = document.getElementById('kpiLeaderboardWrapper');
                const tableWrap = document.getElementById('kpiTableWrapper');
                if (view === 'leaderboard') {
                    if (lbWrap) lbWrap.style.display = '';
                    if (tableWrap) tableWrap.style.display = 'none';
                } else {
                    if (lbWrap) lbWrap.style.display = 'none';
                    if (tableWrap) tableWrap.style.display = '';
                }
            });
        });
    },

    _bindModalL1Tabs() {
        const tabs = document.querySelectorAll('.modalL1-tab');
        tabs.forEach((t) => {
            if (t.__l1Bound) return;
            t.__l1Bound = true;
            t.addEventListener('click', () => {
                const key = t.dataset.l1Tab;
                tabs.forEach((x) => x.classList.toggle('is-active', x === t));
                this._applyL1Tab(key);
            });
        });
    },

    _applyL1Tab(key) {
        this._l1ActiveTab = key;
        const tbody = document.getElementById('modalL1TableBody');
        const wrapper = document.getElementById('modalL1TableWrapper');
        const summary = document.getElementById('modalL1Summary');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-l1-order]');
        if (key === 'overview') {
            // Show only summary, hide table
            if (summary) summary.style.display = '';
            if (wrapper) wrapper.style.display = 'none';
            return;
        }
        if (wrapper) wrapper.style.display = '';
        if (summary) summary.style.display = '';
        rows.forEach((r) => {
            const isRefunded = r.classList.contains('is-refunded');
            const show = key === 'orders' || (key === 'refunds' && isRefunded);
            r.style.display = show ? '' : 'none';
            const detail = r.nextElementSibling;
            if (detail && detail.classList.contains('l1-detail-row')) {
                detail.style.display = show && detail.dataset.open === '1' ? '' : 'none';
            }
        });
    },

    // ========================================
    // RENDER KPI TABLE (12.6)
    // ========================================
    async renderKPITable(filteredData) {
        this.hideEl('kpiTableLoading');

        if (!filteredData || filteredData.length === 0) {
            this.showEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');
            const lbWrap = document.getElementById('kpiLeaderboardWrapper');
            if (lbWrap) lbWrap.style.display = 'none';
            return;
        }

        this.hideEl('kpiTableEmpty');

        const aggregated = await this.aggregateByEmployee(filteredData);

        // Render leaderboard cards (default view) + table (alt view)
        this._renderLeaderboard(aggregated);
        this._updateHeroStats(aggregated);
        this._bindLeaderboardToggle();

        // Apply current view
        const viewMode = this._kpiViewMode || 'leaderboard';
        const lbWrap = document.getElementById('kpiLeaderboardWrapper');
        const tableWrap = document.getElementById('kpiTableWrapper');
        if (viewMode === 'leaderboard') {
            if (lbWrap) lbWrap.style.display = '';
            if (tableWrap) tableWrap.style.display = 'none';
        } else {
            if (lbWrap) lbWrap.style.display = 'none';
            if (tableWrap) tableWrap.style.display = '';
        }

        const tbody = document.getElementById('kpiTableBody');
        if (!tbody) return;

        // Hydrate cache cho mọi employee đang hiển thị (nếu chưa có recon
        // trong session) — đảm bảo per-employee recon đã cache hiển thị đúng.
        this._hydrateL1ReconCachesForEmployees(aggregated.map((e) => e.userId));

        const fullMode = this.state.displayMode === 'full';
        let html = '';
        aggregated.forEach((emp, idx) => {
            // reconRan per-employee: true nếu employee này đã có recon results
            // (từ global recon hoặc per-employee recon trong modal L1).
            const reconRan = !!(
                this._reconKpiLossByUser && this._reconKpiLossByUser.has(emp.userId)
            );
            const invoiceSummaryHtml = this.renderKPIInvoiceStatusSummary(emp.orders);

            const orderCount = emp.orders.filter((o) => {
                if (o._stale) return false;
                if (o._kpiPending) return false; // chờ phiếu → không tính vào "X đơn"
                if (fullMode) return true;
                return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
            }).length;

            // Đơn cancelled đã bị filter khỏi emp.orders từ applyFilters →
            // emp.totalKPI đã là KPI sau khi loại cancelled. lossInfo chỉ
            // còn refund excel (cần recon mới biết).
            const lossInfo = this._reconKpiLossByUser?.get(emp.userId) || {
                kpiLost: 0,
                refundCount: 0,
            };
            const kpiNet = emp.totalKPI - lossInfo.kpiLost;
            const hasLoss = lossInfo.kpiLost > 0;
            const lossTitle = `${lossInfo.refundCount} đơn hoàn — bị loại ${this.formatCurrency(lossInfo.kpiLost)}`;

            const grossCellHtml = hasLoss
                ? `<td class="col-kpi-gross" title="Tổng KPI trước khi loại đơn hoàn">${this.formatCurrency(emp.totalKPI)}</td>`
                : `<td class="col-kpi-gross" style="text-decoration:none;color:inherit;">${this.formatCurrency(emp.totalKPI)}</td>`;

            const refundCellHtml = reconRan
                ? `<td class="col-refund-count"><span class="refund-badge ${lossInfo.refundCount === 0 ? 'is-zero' : ''}" title="${lossTitle}">↩ ${lossInfo.refundCount}</span></td>`
                : `<td class="col-refund-count" style="color:#9ca3af;font-size:11px;" title="Chưa chạy đối soát">—</td>`;

            const netCellHtml = `<td class="col-kpi-net ${hasLoss ? 'has-loss' : ''}" title="${hasLoss ? lossTitle : 'Không có đơn hoàn'}">${this.formatCurrency(kpiNet)}</td>`;

            // KPI Inbox phân vào tab riêng "KPI Đơn Inbox" — không hiển thị ở đây
            // để tránh đụng filter campaign của KPI Đơn Hàng.

            html += `<tr>
                <td>${idx + 1}</td>
                <td><a class="employee-link" onclick="KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')">${this.escapeHtml(emp.resolvedName)}</a></td>
                <td>${orderCount}</td>
                <td>${emp.totalNetProducts}</td>
                ${grossCellHtml}
                ${refundCellHtml}
                ${netCellHtml}
                <td>${invoiceSummaryHtml}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
        this.reinitIcons();
    },

    // ========================================
    // AGGREGATE BY EMPLOYEE (12.7)
    // ========================================
    async aggregateByEmployee(filteredData) {
        // filteredData is already grouped by employee from applyFilters.
        // Sum strict KPI (order.kpi) cho mọi mode. Simple mode: ẨN user có
        // totalKPI = 0 (không có SP nào được tick trong các đơn của user).
        const simpleMode = this.state.displayMode === 'simple';
        const results = [];
        for (const emp of filteredData) {
            let totalNetProducts = 0;
            let totalKPI = 0;
            let pendingCount = 0;

            for (const order of emp.orders) {
                // Đơn stale (BASE đã xóa) → loại khỏi tổng — đồng nhất với
                // updateSummaryCards (trước đây leaderboard cộng cả stale →
                // tổng card với tổng bảng lệch nhau).
                if (order._stale) continue;
                // Đơn "Chờ phiếu" → KHÔNG cộng KPI/NET (đếm riêng để hiện badge).
                if (order._kpiPending) {
                    pendingCount++;
                    continue;
                }
                totalNetProducts += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }

            // Simple mode: ẨN user có totalKPI = 0 (không có đơn nào được tính KPI)
            if (simpleMode && totalKPI <= 0 && totalNetProducts <= 0) continue;

            // Resolve employee name (Bug #4 fix - never show raw userId)
            const resolvedName = await this.resolveEmployeeName(emp.userId);

            results.push({
                userId: emp.userId,
                userName: emp.userName || emp.userId,
                resolvedName,
                orders: emp.orders,
                totalNetProducts,
                totalKPI,
                pendingCount,
            });
        }

        return results.sort((a, b) => b.totalKPI - a.totalKPI); // Sort by KPI descending
    },

    // ========================================
    // MODAL L1: SHOW EMPLOYEE ORDERS (12.8)
    // ========================================
    async showEmployeeOrders(userId) {
        const emp = this.state.filteredData.find((e) => e.userId === userId);
        if (!emp) {
            console.warn('[KPI Tab] Employee not found:', userId);
            return;
        }

        this.state.currentEmployeeUserId = userId;
        this.state.currentEmployeeOrders = emp.orders || [];
        this.state.currentEmployeeName = emp.resolvedName || emp.userName || '';

        // Set header - use resolved name (Bug #4 fix)
        const nameEl = document.getElementById('modalL1EmployeeName');
        if (nameEl) {
            const resolvedName = await this.resolveEmployeeName(userId);
            nameEl.textContent = resolvedName;
            this.state.currentEmployeeName = resolvedName;
        }

        // Reset filters
        const statusFilter = document.getElementById('modalL1FilterStatus');
        if (statusFilter) statusFilter.value = '';
        const searchInput = document.getElementById('modalL1Search');
        if (searchInput) searchInput.value = '';

        // Áp dụng cache recon nếu có (cache TTL 7 ngày). Khi cache hết hạn
        // hoặc chưa từng đối soát → table render ở trạng thái "chưa check".
        const cached = this._readL1ReconCache(userId);
        if (cached?.results) {
            this._applyL1ReconCache(userId, cached.results);
        } else {
            this.renderEmployeeOrdersTable(this.state.currentEmployeeOrders);
        }

        // Update button label + cache info
        this._setL1ReconCacheInfo(userId);

        // Show modal
        this.showEl('modalEmployeeOrders');
        this.reinitIcons();
    },

    filterEmployeeOrders() {
        const statusVal = (document.getElementById('modalL1FilterStatus') || {}).value || '';
        const searchVal = ((document.getElementById('modalL1Search') || {}).value || '')
            .toLowerCase()
            .trim();

        let orders = this.state.currentEmployeeOrders;

        if (statusVal === 'ok') {
            orders = orders.filter((o) => !o.hasDiscrepancy);
        } else if (statusVal === 'discrepancy') {
            orders = orders.filter((o) => o.hasDiscrepancy);
        }

        if (searchVal) {
            orders = orders.filter((o) => {
                const oid = (o.orderId || '').toLowerCase();
                const code = (o.orderCode || '').toLowerCase();
                const stt = String(o.stt != null ? o.stt : '').toLowerCase();
                return (
                    oid.includes(searchVal) || code.includes(searchVal) || stt.includes(searchVal)
                );
            });
        }

        this.renderEmployeeOrdersTable(orders);
    },

    renderEmployeeOrdersTable(orders) {
        this.hideEl('modalL1Loading');

        if (!orders || orders.length === 0) {
            this.showEl('modalL1Empty');
            this.hideEl('modalL1TableWrapper');
            return;
        }

        this.hideEl('modalL1Empty');
        this.showEl('modalL1TableWrapper');

        const tbody = document.getElementById('modalL1TableBody');
        if (!tbody) return;

        const simpleMode = this.state.displayMode === 'simple';
        const reconRan = !!(this._reconByOrder && this._reconByOrder.size > 0);
        let html = '';
        let totalOrders = 0;
        let okOrders = 0;
        let refundOrders = 0;
        let pendingOrders = 0;
        let kpiGross = 0;
        let kpiLost = 0;

        orders.forEach((order) => {
            if (order._stale) return;
            // Đơn cancelled đã filter ở applyFilters → mọi order ở đây
            // đều còn hiệu lực. isRefunded chỉ còn refund excel.
            const recon = this._reconByOrder?.get(order.orderId);
            const refLoss = recon?.refundedKpiAmount || 0; // KPI bị loại (chỉ món được tính KPI)
            const hasKpiLoss = refLoss > 0;
            // "Có hoàn" (đơn có phiếu hoàn) TÁCH khỏi "bị loại KPI": đơn hoàn mà món
            // hoàn không tính KPI vẫn hiện "có hoàn" nhưng loss = 0.
            const isRefunded = !!recon?.isRefunded || hasKpiLoss;
            // Đơn "Chờ phiếu" (chưa có phiếu / phiếu Nháp) → hiển thị nhưng KHÔNG tính KPI.
            const isPending = !!order._kpiPending;
            // Simple mode: ẩn đơn 0 KPI — NHƯNG luôn hiện refunded + pending để user thấy
            // lý do "đã hoàn / chờ phiếu — không tính KPI" dù KPI=0.
            if (
                simpleMode &&
                !isRefunded &&
                !isPending &&
                (order.netProducts || 0) <= 0 &&
                (order.kpi || 0) <= 0
            )
                return;

            const invoiceHtml = this.renderKPIInvoiceStatusCell(order.orderId);
            const hasDiscrepancy = !!recon?.hasDiscrepancy && !isRefunded && !isPending;
            const invNumber =
                recon?.invoiceNumber || this._invoiceCache?.get(order.orderId)?.Number || '';

            if (isPending) {
                // Chờ phiếu → KHÔNG cộng KPI/đơn; đếm riêng để hiện stat + pill.
                pendingOrders++;
            } else {
                totalOrders++;
                kpiGross += order.kpi || 0;
                if (isRefunded) {
                    refundOrders++;
                    // Chỉ trừ KPI khi món hoàn thực sự được tính KPI (refLoss>0).
                    // Cap theo order.kpi (defensive vì order.kpi có thể stale).
                    kpiLost += Math.min(refLoss, order.kpi || 0);
                } else {
                    okOrders++;
                }
            }

            const baseClass = isPending
                ? 'is-kpi-pending'
                : hasKpiLoss
                  ? 'is-refunded'
                  : isRefunded
                    ? 'is-refunded is-refunded-nokpi'
                    : hasDiscrepancy
                      ? 'is-discrepancy'
                      : '';
            // Dual-key: record kiểm tra có thể lưu theo SỐ PHIẾU (đơn đã có phiếu lúc
            // đánh dấu) HOẶC theo MÃ ĐH (đơn chưa có phiếu lúc đánh dấu → checkKey =
            // orderCode). Tra cứu cả 2 để không mất dấu ✓ sau khi đơn được gán số phiếu.
            const orderCheckCode = order.orderCode || '';
            const isChecked =
                (!!invNumber && this._orderCheckStore.isChecked(invNumber)) ||
                (!!orderCheckCode && this._orderCheckStore.isChecked(orderCheckCode));
            // Backfill: đơn được đánh dấu khi CHƯA có phiếu (record key = orderCode,
            // number rỗng) → nay đã có số phiếu thì ghi bổ sung để Lịch sử kiểm tra
            // hiển thị đúng số phiếu thay vì "—". Method tự guard tránh ghi lặp.
            if (isChecked && invNumber && orderCheckCode) {
                this._orderCheckStore.backfillNumber(orderCheckCode, invNumber);
            }
            const rowClass = [baseClass, isChecked ? 'kpi-l1-row-checked' : '']
                .filter(Boolean)
                .join(' ');

            let statusPill;
            if (isPending) {
                statusPill =
                    '<span class="kpi-status-pill pill-pending" title="Đơn chưa có phiếu bán hàng / phiếu còn Nháp → CHƯA tính KPI. Khi phiếu được xác nhận sẽ tự tính lại.">⏳ Chờ phiếu · chưa tính</span>';
            } else if (hasKpiLoss) {
                statusPill = '<span class="kpi-status-pill pill-refund">↩ Đã hoàn</span>';
            } else if (isRefunded) {
                statusPill =
                    '<span class="kpi-status-pill pill-refund-nokpi" title="Đơn có phiếu hoàn nhưng món hoàn không nằm trong SP tính KPI → không trừ KPI">↩ Có hoàn · 0đ</span>';
            } else if (hasDiscrepancy) {
                statusPill = '<span class="kpi-status-pill pill-discrepancy">⚠ Sai lệch</span>';
            } else if (reconRan) {
                statusPill = '<span class="kpi-status-pill pill-ok">✓ OK</span>';
            } else {
                statusPill =
                    '<span class="kpi-status-pill pill-untracked" title="Chưa chạy đối soát">— chưa check</span>';
            }

            const invId = this._invoiceCache?.get(order.orderId)?.Id;
            const invHtml = invNumber
                ? `<a class="recon-invoice-num is-link" href="javascript:void(0)" onclick="event.stopPropagation();window.KPICommission.showInvoiceDetail('${invId || ''}', '${this.escapeHtml(invNumber)}')" title="Xem chi tiết phiếu ${this.escapeHtml(invNumber)}">${this.escapeHtml(invNumber)}</a>`
                : '<span class="recon-invoice-num is-empty">—</span>';

            const toggleBtn = isRefunded
                ? `<button class="recon-toggle-btn l1-toggle-btn" onclick="window.KPICommission._toggleL1OrderDetail('${this.escapeHtml(order.orderId)}')" title="Xem món trả + lý do"><i data-lucide="chevron-right"></i></button>`
                : '';

            html += `<tr class="${rowClass}" data-l1-order="${this.escapeHtml(order.orderId)}" data-l1-number="${this.escapeHtml(invNumber)}" data-l1-order-code="${this.escapeHtml(order.orderCode || '')}">
                <td data-col="stt">${toggleBtn}${order.stt != null ? this.escapeHtml(String(order.stt)) : '---'}</td>
                <td><a class="order-link" onclick="KPICommission.showOrderDetails('${this.escapeHtml(order.orderId)}')">${this.escapeHtml(order.orderCode || order.orderId)}</a></td>
                <td>${invHtml}</td>
                <td>${this.escapeHtml(order.campaignName || '---')}</td>
                <td>${order.netProducts || 0}</td>
                <td>${isPending ? `<span class="kpi-pending-amount" title="KPI tiềm năng — chưa tính vì chưa có phiếu hợp lệ">${this.formatCurrency(order.kpi || 0)}</span>` : this.formatCurrency(order.kpi || 0)}</td>
                <td>${statusPill}</td>
                <td>${invoiceHtml}</td>
            </tr>`;

            // Detail row — empty initially, populated lazy on click cho đơn refunded
            if (isRefunded) {
                html += `<tr class="recon-detail-row l1-detail-row" data-open="0" style="display:none;">
                    <td colspan="8">
                        <div class="recon-detail-content l1-detail-content">
                            <em>Click để load chi tiết món trả...</em>
                        </div>
                    </td>
                </tr>`;
            }
        });

        if (!html) {
            this.showEl('modalL1Empty');
            this.hideEl('modalL1TableWrapper');
            return;
        }

        tbody.innerHTML = html;

        // Render summary card — luôn populate values cho đúng count.
        // Show/hide xử lý ở _applyL1Tab (tab Tổng quan luôn show summary kèm
        // empty-state nếu chưa recon).
        const summary = document.getElementById('modalL1Summary');
        if (summary) {
            const set = (id, v) => {
                const el = document.getElementById(id);
                if (el) el.textContent = v;
            };
            set('l1SumTotalOrders', totalOrders.toLocaleString('vi-VN'));
            set('l1SumOkOrders', okOrders.toLocaleString('vi-VN'));
            set('l1SumRefundOrders', refundOrders.toLocaleString('vi-VN'));
            set('l1SumPendingOrders', pendingOrders.toLocaleString('vi-VN'));
            set('l1SumKpiGross', this.formatCurrency(kpiGross));
            set('l1SumKpiLost', this.formatCurrency(kpiLost));
            set('l1SumKpiNet', this.formatCurrency(kpiGross - kpiLost));
            // Ẩn card "Chờ phiếu" nếu không có đơn pending (đỡ rối).
            const pendingCard = document.getElementById('l1SumPendingCard');
            if (pendingCard) pendingCard.style.display = pendingOrders > 0 ? '' : 'none';
        }
        this._l1ReconRan = reconRan;

        // Update tab counts
        const setTab = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        // "Tất cả đơn" tab hiển thị cả đơn chờ phiếu → count gồm cả pending.
        setTab('l1TabCountAll', totalOrders + pendingOrders);
        setTab('l1TabCountRefund', refundOrders);

        // Bind tab clicks (idempotent)
        this._bindModalL1Tabs();
        // Apply current tab filter (default = orders)
        if (!this._l1ActiveTab) this._l1ActiveTab = 'orders';
        document
            .querySelectorAll('.modalL1-tab')
            .forEach((t) => t.classList.toggle('is-active', t.dataset.l1Tab === this._l1ActiveTab));
        this._applyL1Tab(this._l1ActiveTab);

        if (window.lucide?.createIcons) window.lucide.createIcons();
    },

    closeEmployeeOrders() {
        this.hideEl('modalEmployeeOrders');
        this.state.currentEmployeeUserId = null;
        this.state.currentEmployeeOrders = [];
    },

    // ========================================
    // PER-EMPLOYEE RECONCILIATION + 7-DAY CACHE
    // ========================================

    _L1_RECON_CACHE_TTL_MS: 7 * 24 * 60 * 60 * 1000, // 7 ngày
    // v2: record có refundedKpiAmount (đối soát theo MÓN).
    // v3: chỉ trừ KPI món được tính KPI (skip excludedBySaleFlag) + tách "có hoàn"
    //     khỏi "bị loại KPI" + refundedProducts[].kpiLost. Bump để bỏ cache v2 lỗi.
    _L1_RECON_CACHE_PREFIX: 'kpi_recon_l1_v3__',

    _getL1ReconCacheKey(userId) {
        return `${this._L1_RECON_CACHE_PREFIX}${userId}`;
    },

    _readL1ReconCache(userId) {
        try {
            const key = this._getL1ReconCacheKey(userId);
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const obj = JSON.parse(raw);
            if (!obj || typeof obj !== 'object') return null;
            if (!obj.savedAt || !obj.results) return null;
            const ageMs = Date.now() - obj.savedAt;
            if (ageMs > this._L1_RECON_CACHE_TTL_MS) {
                localStorage.removeItem(key);
                return null;
            }
            return obj;
        } catch (e) {
            console.warn('[KPI L1] Read cache failed:', e?.message);
            return null;
        }
    },

    _writeL1ReconCache(userId, results) {
        try {
            const key = this._getL1ReconCacheKey(userId);
            const payload = {
                savedAt: Date.now(),
                ttlMs: this._L1_RECON_CACHE_TTL_MS,
                results,
            };
            localStorage.setItem(key, JSON.stringify(payload));
        } catch (e) {
            console.warn('[KPI L1] Write cache failed:', e?.message);
        }
    },

    _formatL1ReconAge(savedAt) {
        const diffMs = Date.now() - savedAt;
        if (diffMs < 60 * 1000) return 'vừa xong';
        const diffMin = Math.floor(diffMs / (60 * 1000));
        if (diffMin < 60) return `${diffMin} phút trước`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `${diffHr} giờ trước`;
        const diffDay = Math.floor(diffHr / 24);
        return `${diffDay} ngày trước`;
    },

    /**
     * Hydrate per-employee recon cache vào maps in-memory. Idempotent.
     * Gọi trước khi render main KPI table để các employee đã có cache
     * hiển thị KPI loss + Hoàn count ngay (không cần reopen modal).
     */
    _hydrateL1ReconCachesForEmployees(userIds) {
        if (!Array.isArray(userIds) || userIds.length === 0) return;
        if (!this._reconByOrder) this._reconByOrder = new Map();
        if (!this._reconKpiLossByUser) this._reconKpiLossByUser = new Map();
        for (const userId of userIds) {
            if (this._reconKpiLossByUser.has(userId)) continue;
            const cache = this._readL1ReconCache(userId);
            if (!cache?.results) continue;
            for (const r of cache.results) this._reconByOrder.set(r.orderId, r);
            const emp = this.state.filteredData?.find((e) => e.userId === userId);
            let lossSum = 0;
            let refundCount = 0;
            for (const order of emp?.orders || []) {
                const r = this._reconByOrder.get(order.orderId);
                const refLoss = r?.refundedKpiAmount || 0;
                // "Có hoàn" (kể cả loss=0) vẫn đếm refundCount; chỉ cộng loss khi
                // món hoàn thực sự được tính KPI (refLoss>0), cap theo order.kpi.
                if (r?.isRefunded || refLoss > 0) {
                    if (refLoss > 0) lossSum += Math.min(refLoss, order.kpi || 0);
                    refundCount++;
                }
            }
            this._reconKpiLossByUser.set(userId, { kpiLost: lossSum, refundCount });
        }
    },

    _setL1ReconCacheInfo(userId) {
        const infoEl = document.getElementById('modalL1ReconCacheInfo');
        const btn = document.getElementById('btnModalL1Recon');
        const lbl = document.getElementById('btnModalL1ReconLabel');
        if (!infoEl || !btn || !lbl) return;
        const cache = this._readL1ReconCache(userId);
        if (!cache) {
            infoEl.style.display = 'none';
            infoEl.className = 'l1-recon-cache-info';
            btn.classList.remove('is-cached');
            lbl.textContent = 'Chạy đối soát';
            return;
        }
        const ageMs = Date.now() - cache.savedAt;
        const isStale = ageMs > 3 * 24 * 60 * 60 * 1000; // > 3 ngày
        infoEl.style.display = '';
        infoEl.className = 'l1-recon-cache-info ' + (isStale ? 'is-stale' : 'is-fresh');
        infoEl.textContent = `Đã đối soát ${this._formatL1ReconAge(cache.savedAt)}`;
        btn.classList.add('is-cached');
        lbl.textContent = 'Đối soát lại';
    },

    /**
     * Áp dụng cache recon (1 employee) vào _reconByOrder + _reconKpiLossByUser
     * và re-render modal L1. Gọi khi mở modal nếu có cache fresh.
     */
    _applyL1ReconCache(userId, cachedResults) {
        if (!this._reconByOrder) this._reconByOrder = new Map();
        if (!this._reconKpiLossByUser) this._reconKpiLossByUser = new Map();

        const orders = this.state.currentEmployeeOrders || [];
        let lossSum = 0;
        let refundCount = 0;
        for (const r of cachedResults || []) {
            this._reconByOrder.set(r.orderId, r);
        }
        for (const order of orders) {
            const r = this._reconByOrder.get(order.orderId);
            const refLoss = r?.refundedKpiAmount || 0;
            // "Có hoàn" (kể cả loss=0) vẫn đếm refundCount; chỉ cộng loss khi món
            // hoàn thực sự được tính KPI (refLoss>0), cap theo order.kpi.
            if (r?.isRefunded || refLoss > 0) {
                if (refLoss > 0) lossSum += Math.min(refLoss, order.kpi || 0);
                refundCount++;
            }
        }
        this._reconKpiLossByUser.set(userId, { kpiLost: lossSum, refundCount });

        // Re-render table với reconRan=true
        this.renderEmployeeOrdersTable(orders);
    },

    /**
     * Run reconciliation for ONLY the current employee in modal L1.
     * Always runs fresh and overwrites the 7-day cache. Cache lookup happens
     * automatically on `showEmployeeOrders` open — clicking the button is the
     * explicit "đối soát lại" action.
     */
    async runEmployeeReconciliation() {
        const userId = this.state.currentEmployeeUserId;
        if (!userId) {
            console.warn('[KPI L1] No employee selected');
            return;
        }

        const orders = (this.state.currentEmployeeOrders || []).filter((o) => !o._stale);
        if (orders.length === 0) {
            if (window.notificationManager?.warning) {
                window.notificationManager.warning('Không có đơn nào để đối soát', 2000);
            }
            return;
        }

        const btn = document.getElementById('btnModalL1Recon');
        const lbl = document.getElementById('btnModalL1ReconLabel');
        if (btn) {
            btn.disabled = true;
            btn.classList.add('is-running');
        }
        if (lbl) lbl.textContent = 'Đang đối soát...';

        try {
            // Step 1: đảm bảo invoice cache + refund excel CHI TIẾT
            const [, refundInfoRaw] = await Promise.all([
                this.loadInvoiceStatusData().catch((e) => {
                    console.warn('[KPI L1] Load invoice cache failed:', e?.message);
                }),
                this.fetchRefundDetailByInvoice(3).catch((e) => {
                    console.warn('[KPI L1] Fetch refund detail excel failed:', e?.message);
                    return { refundByInvoice: new Map(), codes: new Set(), totalRows: 0 };
                }),
            ]);
            const refundInfo = refundInfoRaw || { refundByInvoice: new Map(), codes: new Set() };
            const refundByInvoice = refundInfo.refundByInvoice || new Map();

            // Step 2: reconcile từng đơn — worker pool concurrency 6
            const CONCURRENCY = Math.min(6, orders.length);
            const total = orders.length;
            const results = new Array(total);
            let nextIdx = 0;

            // Logic đối soát 1 đơn dùng chung với recon toàn cục: _buildReconRecord.
            const reconcileOne = async (idx) => {
                const order = orders[idx];
                const invoice = this._invoiceCache?.get(order.orderId) || null;
                results[idx] = await this._buildReconRecord(order, invoice, refundByInvoice);
            };

            const workers = Array.from({ length: CONCURRENCY }, async () => {
                while (true) {
                    const myIdx = nextIdx++;
                    if (myIdx >= total) break;
                    await reconcileOne(myIdx);
                }
            });
            await Promise.all(workers);

            // Step 3: lưu cache 7 ngày + apply vào maps + re-render
            this._writeL1ReconCache(userId, results);
            this._applyL1ReconCache(userId, results);

            // Update main KPI table (cho employee này) để KPI thực reflect ngay
            try {
                await this.renderKPITable(this.state.filteredData || []);
            } catch (e) {
                console.warn('[KPI L1] Sync main table failed:', e?.message);
            }

            if (window.notificationManager?.success) {
                const refundCnt = results.filter((r) => r.isRefunded).length;
                const discCnt = results.filter((r) => r.hasDiscrepancy && !r.isRefunded).length;
                window.notificationManager.success(
                    `Đối soát xong ${total} đơn (hoàn: ${refundCnt}, sai lệch: ${discCnt})`,
                    2500
                );
            }
        } catch (e) {
            console.error('[KPI L1] Reconciliation failed:', e);
            if (window.notificationManager?.error) {
                window.notificationManager.error(`Đối soát thất bại: ${e.message}`, 3000);
            }
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.classList.remove('is-running');
            }
            this._setL1ReconCacheInfo(userId);
        }
    },

    // ========================================
    // MODAL L2: SHOW ORDER DETAILS (12.9)
    // ========================================
    async showOrderDetails(orderId) {
        if (!orderId) return;

        this.state.currentOrderId = orderId;

        // Set header - show orderCode instead of raw orderId
        const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
        const orderCode = order?.orderCode || '';
        const orderIdEl = document.getElementById('modalL2OrderId');
        if (orderIdEl) orderIdEl.textContent = orderCode || orderId;

        // Banner refund (hiển thị xuyên suốt các tab nếu đơn có hoàn)
        this._renderOrderRefundBanner(orderId);

        // Show modal + reset to first tab (hiện loading ngay)
        this.showEl('modalOrderDetails');
        this.switchOrderTab('kpi-compare');
        this.reinitIcons();

        // Ensure snapshot đơn thật TPOS (fetch 1 lần nếu thiếu) để KPI NET + "Tất cả SP"
        // đối chiếu đúng (final − BASE). Có rồi → chỉ GET, nhanh.
        if (orderCode && window.kpiManager?.ensureKpiFinalSnapshot) {
            try {
                await window.kpiManager.ensureKpiFinalSnapshot(orderCode, orderId);
            } catch (e) {}
        }

        // Render lại tab KPI với snapshot đã sẵn sàng (reconciled).
        await this.renderNetKPITab(orderId);
    },

    switchOrderTab(tabName) {
        // Update tab buttons
        document.querySelectorAll('[data-order-tab]').forEach((btn) => {
            btn.classList.toggle('active', btn.getAttribute('data-order-tab') === tabName);
        });

        // Update tab contents
        const tabMap = {
            'kpi-compare': 'tabKpiCompare',
            'audit-log': 'tabAuditLog',
            'all-products': 'tabAllProducts',
            'base-products': 'tabBaseProducts',
            inbox: 'tabInbox',
        };

        Object.values(tabMap).forEach((id) => {
            const el = document.getElementById(id);
            if (el) {
                el.style.display = 'none';
                el.classList.remove('active');
            }
        });

        const activeId = tabMap[tabName];
        if (activeId) {
            const el = document.getElementById(activeId);
            if (el) {
                el.style.display = '';
                el.classList.add('active');
            }
        }

        // Load tab data
        const orderId = this.state.currentOrderId;
        if (!orderId) return;

        if (tabName === 'kpi-compare') this.renderNetKPITab(orderId);
        else if (tabName === 'audit-log') this.renderAuditLogTab(orderId);
        else if (tabName === 'all-products') this.renderAllProductsTab(orderId);
        else if (tabName === 'base-products') this.renderBaseProductsTab(orderId);
        else if (tabName === 'inbox') this.renderInboxTab(orderId);
    },

    closeOrderDetails() {
        const orderId = this.state.currentOrderId;
        const number = orderId ? this._getInvoiceNumberForOrder(orderId) : '';
        const order = orderId
            ? this.state.currentEmployeeOrders.find((o) => o.orderId === orderId)
            : null;
        const orderCode = order?.orderCode || '';
        // Fallback identifier khi đơn chưa có phiếu bán hàng → dùng Mã ĐH (orderCode).
        // Giữ confirm modal hiển thị cho TẤT CẢ đơn trong bảng, không phụ thuộc phiếu.
        const checkKey = number || orderCode;
        // No permission OR không có cả number lẫn orderCode OR already checked → close ngay.
        if (
            !checkKey ||
            !this._canMarkOrderChecked() ||
            this._orderCheckStore.isChecked(checkKey)
        ) {
            this._doCloseOrderDetails();
            return;
        }
        const invoiceId = this._invoiceCache?.get(orderId)?.Id || '';
        this._pendingCheckCtx = {
            checkKey,
            number,
            invoiceId,
            orderCode,
            campaignName: order?.campaignName || '',
            kpiOwnerUserId: this.state.currentEmployeeUserId || '',
            kpiOwnerUserName: this.state.currentEmployeeName || '',
            kpiAmount: order?.kpi || 0,
            netProducts: order?.netProducts || 0,
        };
        const el = this._ensureCheckConfirmModal();
        el.querySelector('#kpi-confirm-number').textContent = number || orderCode;
        const secondary = number
            ? orderCode
                ? `Mã ĐH: ${orderCode}`
                : ''
            : '(Chưa có phiếu bán hàng)';
        el.querySelector('#kpi-confirm-secondary').textContent = secondary;
        el.style.display = 'flex';
    },

    // Kiểm tra quyền "canMarkOrderChecked" trong page baocaosaleonline (orders-report).
    // Inline check (không phụ thuộc PermissionHelper.js) để không thêm script dependency
    // vào tab-kpi-commission.html. Pattern mirror PermissionHelper.hasPermission:
    //   admin (isAdmin === true | roleTemplate === 'admin') → bypass.
    //   non-admin → check detailedPermissions.baocaosaleonline.canMarkOrderChecked === true.
    _canMarkOrderChecked() {
        try {
            const raw =
                sessionStorage.getItem('loginindex_auth') ||
                localStorage.getItem('loginindex_auth');
            if (!raw) return false;
            const auth = JSON.parse(raw);
            if (auth?.isAdmin === true || auth?.roleTemplate === 'admin') return true;
            return auth?.detailedPermissions?.baocaosaleonline?.canMarkOrderChecked === true;
        } catch (e) {
            return false;
        }
    },

    _doCloseOrderDetails() {
        this.hideEl('modalOrderDetails');
        this.state.currentOrderId = null;
        this._pendingCheckCtx = null;
    },

    _applyL1CheckedStyles() {
        const tbody = document.getElementById('modalL1TableBody');
        if (!tbody) return;
        tbody.querySelectorAll('tr[data-l1-order]').forEach((tr) => {
            const number = tr.getAttribute('data-l1-number') || '';
            const orderCode = tr.getAttribute('data-l1-order-code') || '';
            // Dual-key (xem renderEmployeeOrdersTable): tra cứu cả số phiếu lẫn Mã ĐH.
            const shouldBe =
                (!!number && this._orderCheckStore.isChecked(number)) ||
                (!!orderCode && this._orderCheckStore.isChecked(orderCode));
            tr.classList.toggle('kpi-l1-row-checked', shouldBe);
        });
    },

    // Render bảng "Lịch sử kiểm tra" — đọc từ _orderCheckStore._data (đã được
    // listener Firestore đồng bộ realtime). Sort theo checkedAt DESC.
    _renderCheckHistory() {
        const tbody = document.getElementById('kpiCheckHistoryBody');
        const countEl = document.getElementById('kpiCheckHistoryCount');
        if (!tbody) return;
        const search = (document.getElementById('kpiCheckHistorySearch')?.value || '')
            .trim()
            .toLowerCase();
        const all = Array.from(this._orderCheckStore._data.values())
            .filter((v) => v && (v.number || v.orderCode || v.checkKey))
            .sort((a, b) => (b.checkedAt || 0) - (a.checkedAt || 0));
        const filtered = !search
            ? all
            : all.filter((entry) => {
                  const blob = [
                      entry.number,
                      entry.orderCode,
                      entry.campaignName,
                      entry.kpiOwnerUserName,
                      entry.checkedBy,
                      entry.checkedByDisplayName,
                      entry.customerName,
                      entry.phone,
                  ]
                      .filter(Boolean)
                      .join(' ')
                      .toLowerCase();
                  return blob.includes(search);
              });

        if (countEl) {
            countEl.textContent = search
                ? `(${filtered.length}/${all.length})`
                : `${all.length} đơn`;
        }

        if (!filtered.length) {
            tbody.innerHTML = `<tr><td colspan="8" style="text-align:center;padding:24px;color:#9ca3af;">${
                all.length === 0
                    ? 'Chưa có đơn nào được đánh dấu kiểm tra.'
                    : 'Không có kết quả phù hợp.'
            }</td></tr>`;
            return;
        }

        const fmtTime = (ts) => {
            if (!ts) return '---';
            const d = new Date(ts);
            if (isNaN(d.getTime())) return '---';
            const pad = (n) => String(n).padStart(2, '0');
            return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
        };

        let html = '';
        filtered.forEach((entry, idx) => {
            const checker = entry.checkedByDisplayName || entry.checkedBy || '—';
            html += `<tr>
                <td>${idx + 1}</td>
                <td><strong>${this.escapeHtml(entry.number || '—')}</strong></td>
                <td>${this.escapeHtml(entry.orderCode || '—')}</td>
                <td>${this.escapeHtml(entry.campaignName || '—')}</td>
                <td>${this.escapeHtml(entry.kpiOwnerUserName || '—')}</td>
                <td style="text-align:right;font-variant-numeric:tabular-nums;">${entry.kpiAmount ? this.formatCurrency(entry.kpiAmount) : '—'}</td>
                <td>${this.escapeHtml(checker)}</td>
                <td>${fmtTime(entry.checkedAt)}</td>
            </tr>`;
        });
        tbody.innerHTML = html;
    },

    _getInvoiceNumberForOrder(orderId) {
        const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
        const recon = this._reconByOrder?.get(orderId);
        return (
            recon?.invoiceNumber ||
            this._invoiceCache?.get(orderId)?.Number ||
            order?.invoiceNumber ||
            ''
        );
    },

    // Confirm dialog "Xác nhận kiểm tra đơn" — UI mirror pattern từ delivery-report,
    // NHƯNG check store RIÊNG: markChecked ghi vào kpi_commission/data/order_checks
    // (xem comment _orderCheckStore bên dưới), KHÔNG share trạng thái với Thống Kê Giao Hàng.
    _ensureCheckConfirmModal() {
        let el = document.getElementById('kpi-check-confirm-modal');
        if (el) return el;
        el = document.createElement('div');
        el.id = 'kpi-check-confirm-modal';
        el.style.cssText =
            'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10010;align-items:center;justify-content:center;padding:20px;';
        el.innerHTML = `
            <div style="background:white;border-radius:12px;box-shadow:0 20px 60px rgba(0,0,0,0.3);width:100%;max-width:420px;overflow:hidden;font-family:inherit;">
                <div style="padding:16px 18px;border-bottom:1px solid #e5e7eb;background:#f8fafc;">
                    <h3 style="margin:0;font-size:16px;font-weight:600;color:#111827;">Xác nhận kiểm tra đơn</h3>
                </div>
                <div style="padding:16px 18px;font-size:13px;color:#374151;line-height:1.55;">
                    <div>Đơn <strong id="kpi-confirm-number" style="color:#111827;"></strong> đã được kiểm tra chưa?</div>
                    <div id="kpi-confirm-secondary" style="color:#6b7280;margin-top:4px;"></div>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:8px;padding:12px 18px;border-top:1px solid #e5e7eb;background:#f8fafc;">
                    <button type="button" id="kpi-confirm-skip" style="padding:8px 14px;border:1px solid #d1d5db;background:white;color:#374151;border-radius:6px;font-size:13px;font-weight:500;cursor:pointer;">Chưa duyệt</button>
                    <button type="button" id="kpi-confirm-yes" style="padding:8px 14px;background:#10b981;color:white;border:none;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">✓ Đã kiểm tra</button>
                </div>
            </div>`;
        document.body.appendChild(el);

        const self = this;
        const hide = () => {
            el.style.display = 'none';
        };
        el.querySelector('#kpi-confirm-skip').addEventListener('click', () => {
            hide();
            self._doCloseOrderDetails();
        });
        el.querySelector('#kpi-confirm-yes').addEventListener('click', async () => {
            const ctx = self._pendingCheckCtx;
            hide();
            self._doCloseOrderDetails();
            if (ctx?.checkKey) {
                await self._orderCheckStore.markChecked(ctx.checkKey, ctx);
            }
        });
        el.addEventListener('click', (e) => {
            if (e.target === el) {
                hide();
                self._doCloseOrderDetails();
            }
        });
        return el;
    },

    // Firestore collection 'kpi_commission/data/order_checks' — RIÊNG cho tab KPI
    // (không chia sẻ với delivery-report). Mỗi báo cáo có check store độc lập:
    // đánh dấu đã kiểm tra ở KPI KHÔNG ảnh hưởng tới Thống Kê Giao Hàng và ngược lại.
    // Document ID encode '/' → '__' để hợp lệ (số phiếu dạng NJD/2026/xxxxx).
    _orderCheckStore: {
        _data: new Map(),
        _initialized: false,
        _initPromise: null,
        _listener: null,

        _getCol() {
            if (!window.firebase?.firestore) return null;
            try {
                return firebase
                    .firestore()
                    .collection('kpi_commission')
                    .doc('data')
                    .collection('order_checks');
            } catch (e) {
                return null;
            }
        },

        _sanitizeDocId(number) {
            return String(number).replace(/\//g, '__');
        },

        // Chờ Firebase + Firestore sẵn sàng thay vì bail im lặng khi chưa kịp init.
        // Config (firebase-config.js) load đồng bộ trước app JS nên hầu như resolve
        // ngay lần check đầu; poll ~150ms, trần ~3s. Trả true nếu sẵn sàng.
        _ensureFirebaseReady() {
            const ready = () => !!(window.firebase?.firestore && window.firebase?.apps?.length);
            if (ready()) return Promise.resolve(true);
            return new Promise((resolve) => {
                let waited = 0;
                const timer = setInterval(() => {
                    if (ready()) {
                        clearInterval(timer);
                        resolve(true);
                    } else if ((waited += 150) >= 3000) {
                        clearInterval(timer);
                        resolve(false);
                    }
                }, 150);
            });
        },

        init() {
            // Key resolution:
            //   1. data.checkKey (đơn không phiếu → bằng orderCode)
            //   2. data.number    (đơn có phiếu — cũng là doc data có sẵn)
            //   3. doc.id         (backward compat cho doc không có 2 field trên)
            const resolveKey = (data, docId) => data.checkKey || data.number || docId;
            if (this._initPromise) return this._initPromise;
            this._initPromise = (async () => {
                // Chờ firebase sẵn sàng thay vì bail im lặng. Nếu vẫn chưa có col →
                // KHÔNG để _initPromise đã-resolve cache lại (self-poisoning khiến
                // listener không bao giờ gắn) → reset null để lần init() sau (tab
                // switch / page-load) retry THẬT.
                await this._ensureFirebaseReady();
                const col = this._getCol();
                if (!col) {
                    this._initPromise = null;
                    return;
                }
                try {
                    const snap = await col.get();
                    this._data.clear();
                    snap.forEach((doc) => {
                        const data = doc.data() || {};
                        this._data.set(resolveKey(data, doc.id), data);
                    });
                    window.KPICommission?._applyL1CheckedStyles?.();
                    window.KPICommission?._renderCheckHistory?.();
                } catch (e) {
                    console.warn('[KPI-ORDER-CHECK] initial load failed:', e?.message);
                }
                try {
                    this._listener = col.onSnapshot(
                        (snap) => {
                            this._data.clear();
                            snap.forEach((doc) => {
                                const data = doc.data() || {};
                                this._data.set(resolveKey(data, doc.id), data);
                            });
                            window.KPICommission?._applyL1CheckedStyles?.();
                            window.KPICommission?._renderCheckHistory?.();
                        },
                        (err) => console.warn('[KPI-ORDER-CHECK] listener error:', err?.message)
                    );
                    // Chỉ coi là init thành công khi listener đã gắn.
                    this._initialized = true;
                } catch (e) {
                    console.warn('[KPI-ORDER-CHECK] listener setup failed:', e?.message);
                    // Listener không gắn được → cho phép init() sau thử lại.
                    this._initPromise = null;
                }
            })();
            return this._initPromise;
        },

        isChecked(checkKey) {
            return !!checkKey && this._data.has(checkKey);
        },

        // Ghi bổ sung số phiếu vào record được đánh dấu khi đơn CHƯA có phiếu
        // (key = Mã ĐH, number rỗng). Idempotent: chỉ ghi khi record tồn tại, number
        // còn rỗng, và chưa backfill trong session. Merge chỉ field 'number'.
        backfillNumber(checkKey, number) {
            if (!checkKey || !number) return;
            const rec = this._data.get(checkKey);
            if (!rec || rec.number) return; // không có record HOẶC đã có số phiếu → bỏ qua
            if (!this._backfilled) this._backfilled = new Set();
            if (this._backfilled.has(checkKey)) return; // tránh ghi lặp trong session
            this._backfilled.add(checkKey);
            this._data.set(checkKey, { ...rec, number });
            const col = this._getCol();
            if (!col) return;
            col.doc(this._sanitizeDocId(checkKey))
                .set({ number }, { merge: true })
                .then(() => window.KPICommission?._renderCheckHistory?.())
                .catch((e) => console.warn('[KPI-ORDER-CHECK] backfill failed:', e?.message));
        },

        async markChecked(checkKey, meta) {
            if (!checkKey) return;
            // Iframe `tab-kpi-commission.html` không load shared-auth-manager
            // (parent main.html mới load) → `window.authManager` thường undefined
            // trong iframe. Đọc thẳng `loginindex_auth` từ storage (same-origin
            // → storage chia sẻ giữa iframe và parent). Fallback authManager nếu có.
            let username = 'unknown';
            let displayName = '';
            try {
                const raw =
                    sessionStorage.getItem('loginindex_auth') ||
                    localStorage.getItem('loginindex_auth');
                if (raw) {
                    const auth = JSON.parse(raw);
                    username = auth.username || username;
                    displayName = auth.displayName || auth.fullName || '';
                }
            } catch (e) {
                // ignore parse errors → keep defaults
            }
            if (username === 'unknown') {
                const info =
                    window.authManager?.getUserInfo?.() ||
                    window.parent?.authManager?.getUserInfo?.() ||
                    {};
                username = info.username || username;
                displayName = displayName || info.displayName || info.fullName || '';
            }
            const payload = {
                // checkKey = doc identifier (number nếu có phiếu, else orderCode).
                // number  = phiếu bán hàng thực tế (rỗng khi đơn chưa có phiếu).
                checkKey,
                number: meta?.number || '',
                checkedBy: username,
                checkedByDisplayName: displayName,
                checkedAt: Date.now(),
                customerName: meta?.customerName || '',
                phone: meta?.phone || '',
                invoiceId: meta?.invoiceId || '',
                orderCode: meta?.orderCode || '',
                campaignName: meta?.campaignName || '',
                kpiOwnerUserId: meta?.kpiOwnerUserId || '',
                kpiOwnerUserName: meta?.kpiOwnerUserName || '',
                kpiAmount: meta?.kpiAmount || 0,
                netProducts: meta?.netProducts || 0,
                source: 'kpi-commission',
            };
            // Optimistic: tô ✓ ngay cho UX mượt, NHƯNG xác minh ghi thật sự thành
            // công (retry + backoff). Nếu fail hẳn → rollback ✓ + báo lỗi để người
            // dùng biết — hết cảnh "tưởng đã lưu mà không lưu" (bug cũ nuốt lỗi).
            this._data.set(checkKey, payload);
            window.KPICommission?._applyL1CheckedStyles?.();
            window.KPICommission?._renderCheckHistory?.();
            await this._ensureFirebaseReady();
            const ok = await this._persistWithRetry(checkKey, payload);
            if (!ok) {
                // Rollback CHỈ khi ghi thất bại THẬT (set reject hết retry / không có
                // col). Không xoá khi set đã resolve (offline+persistence sẽ tự sync).
                this._data.delete(checkKey);
                window.KPICommission?._applyL1CheckedStyles?.();
                window.KPICommission?._renderCheckHistory?.();
                this._notify('Lưu kiểm tra thất bại, vui lòng thử lại', 'error');
            }
            // Thành công → im lặng (✓ đã hiện sẵn) theo quyết định UX.
        },

        // Ghi payload với retry + backoff. set() RESOLVE ⇒ Firestore đã nhận ghi vào
        // hàng đợi bền (online: server ack; offline+persistence: commit local sẽ tự
        // sync) ⇒ thành công. set() REJECT ⇒ retry; hết lượt ⇒ false. KHÔNG dùng
        // get({source:'server'}) để xác minh (false-negative khi offline-sẽ-sync).
        async _persistWithRetry(checkKey, payload) {
            const col = this._getCol();
            if (!col) return false;
            const docRef = col.doc(this._sanitizeDocId(checkKey));
            const delays = [600, 1500, 3000];
            for (let attempt = 0; attempt <= delays.length; attempt++) {
                try {
                    await docRef.set(payload, { merge: true });
                    return true;
                } catch (e) {
                    console.warn(
                        `[KPI-ORDER-CHECK] save failed (attempt ${attempt + 1}/${delays.length + 1}):`,
                        e?.message
                    );
                    if (attempt < delays.length) {
                        await new Promise((r) => setTimeout(r, delays[attempt]));
                    }
                }
            }
            return false;
        },

        // Toast inline tự chứa (orders-report cố ý KHÔNG load notification-system).
        // Theo quyết định UX: chỉ dùng để báo LỖI; thành công thì im lặng.
        _notify(msg, type) {
            try {
                const pm = window.parent?.notificationManager;
                if (pm?.show) {
                    pm.show(msg, type === 'error' ? 'error' : 'info');
                    return;
                }
            } catch (e) {
                // parent không truy cập được / không có manager → fallback tự render
            }
            let host = document.getElementById('kpi-toast-host');
            if (!host) {
                host = document.createElement('div');
                host.id = 'kpi-toast-host';
                host.style.cssText =
                    'position:fixed;right:16px;bottom:16px;z-index:10020;display:flex;flex-direction:column;gap:8px;font-family:inherit;';
                document.body.appendChild(host);
            }
            const toast = document.createElement('div');
            const isErr = type === 'error';
            toast.style.cssText =
                'min-width:220px;max-width:340px;padding:10px 14px;border-radius:8px;font-size:13px;font-weight:500;box-shadow:0 8px 24px rgba(0,0,0,0.18);' +
                (isErr
                    ? 'background:#fef2f2;color:#991b1b;border:1px solid #fecaca;'
                    : 'background:#f0fdf4;color:#166534;border:1px solid #bbf7d0;');
            toast.textContent = msg;
            host.appendChild(toast);
            setTimeout(() => {
                toast.style.transition = 'opacity .3s';
                toast.style.opacity = '0';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },
    },

    // ========================================
    // REFUND-AWARE HELPERS (modal Chi tiết đơn hàng)
    // ========================================

    /**
     * Map món hoàn của 1 đơn (từ recon cache _reconByOrder) keyed theo code UPPER.
     * Chỉ chứa món THỰC SỰ được tính KPI & hoàn (sau FIX A: skip excludedBySaleFlag).
     * @returns {Map<string, {qty:number, kpiLost:number, name:string}>}
     */
    _getRefundedProductMap(orderId) {
        const map = new Map();
        const recon = this._reconByOrder?.get(orderId);
        for (const p of recon?.refundedProducts || []) {
            const code = (p.code || '').trim().toUpperCase();
            if (!code) continue;
            const prev = map.get(code) || { qty: 0, kpiLost: 0, name: p.name || '' };
            prev.qty += p.qty || 0;
            prev.kpiLost += p.kpiLost || 0;
            if (!prev.name && p.name) prev.name = p.name;
            map.set(code, prev);
        }
        return map;
    },

    /**
     * Banner đầu modal Chi tiết đơn hàng — chỉ hiện khi đơn CÓ HOÀN (recon.isRefunded).
     * Ghi rõ món hoàn + KPI bị trừ THEO MÓN (không trừ nguyên đơn). Đơn có hoàn mà
     * món hoàn không tính KPI → ghi rõ "không trừ KPI".
     */
    _renderOrderRefundBanner(orderId) {
        const el = document.getElementById('orderRefundBanner');
        if (!el) return;
        const recon = this._reconByOrder?.get(orderId);
        if (!recon || !recon.isRefunded) {
            el.style.display = 'none';
            el.innerHTML = '';
            return;
        }
        const order = this.state.currentEmployeeOrders?.find((o) => o.orderId === orderId);
        const gross = order?.kpi || recon.kpiAmount || 0;
        const lost = Math.min(recon.refundedKpiAmount || 0, gross);
        const net = Math.max(0, gross - lost);
        const hasLoss = lost > 0;
        const refunded = recon.refundedProducts || [];

        const itemsHtml = refunded
            .map(
                (p) =>
                    `<li><span class="orb-code">${this.escapeHtml(p.code || '')}</span> ${this.escapeHtml(p.name || '')} — hoàn ${p.qty || 0}${hasLoss ? ` → <span class="orb-minus">−${this.formatCurrency(p.kpiLost || 0)}</span>` : ''}</li>`
            )
            .join('');

        el.className = 'order-refund-banner ' + (hasLoss ? 'orb-loss' : 'orb-nokpi');
        el.style.display = '';
        el.innerHTML = hasLoss
            ? `<div class="orb-title">↩ Đơn có hoàn — trừ KPI theo MÓN</div>
               <ul class="orb-list">${itemsHtml}</ul>
               <div class="orb-totals">
                   <span>KPI gross: <strong>${this.formatCurrency(gross)}</strong></span>
                   <span>Hoàn (loại): <strong class="orb-minus">−${this.formatCurrency(lost)}</strong></span>
                   <span>KPI thực: <strong class="orb-net">${this.formatCurrency(net)}</strong></span>
               </div>`
            : `<div class="orb-title">↩ Đơn có hoàn · không trừ KPI</div>
               <div class="orb-note">Các món hoàn KHÔNG nằm trong SP tính KPI (chưa tick / đã loại) → <strong>không trừ KPI</strong>. KPI thực giữ nguyên <strong>${this.formatCurrency(gross)}</strong>.</div>`;
    },

    // ========================================
    // RENDER NET KPI TAB (12.10)
    // ========================================
    async renderNetKPITab(orderId) {
        this.showEl('kpiCompareLoading');
        this.hideEl('kpiCompareEmpty');
        this.hideEl('kpiCompareWrapper');

        try {
            // Find orderCode from current employee orders
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            // 1. Get BASE from REST API (chỉ để check sự tồn tại cho empty state)
            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;
            if (!base) {
                this.hideEl('kpiCompareLoading');
                this.showEl('kpiCompareEmpty');
                const emptyEl = document.getElementById('kpiCompareEmpty');
                if (emptyEl)
                    emptyEl.querySelector('p').textContent =
                        'Đơn hàng chưa có BASE snapshot. Không thể tính KPI.';
                return;
            }

            // 2. Gọi calculateNetKPI để áp đúng filter (productId + template + name-normalize + out_of_range)
            const kpiResult = window.kpiManager
                ? await window.kpiManager.calculateNetKPI(orderCode)
                : { details: {}, netProducts: 0, kpiAmount: 0 };

            // 3. Load sale flags cho orderCode này → highlight row nào được tick tính KPI
            if (window.KpiSaleFlagStore) {
                try {
                    await window.KpiSaleFlagStore.load(orderCode);
                } catch (e) {
                    console.warn('[KPI Tab] load sale flags failed:', e?.message);
                }
            }

            const simpleMode = this.state.displayMode === 'simple';

            const products = Object.entries(kpiResult.details || {})
                .map(([pid, data]) => {
                    const isSaleChecked = !!(
                        window.KpiSaleFlagStore && window.KpiSaleFlagStore.get(orderCode, pid)
                    );
                    const excluded = data.excludedBySaleFlag === true;
                    const unitKPI = data.unitKPI || this.KPI_PER_PRODUCT;
                    // KPI = 0 cho SP bị loại (chưa tick); ngược lại = net * unitKPI.
                    const kpi = excluded ? 0 : (data.net || 0) * unitKPI;
                    return {
                        pid,
                        code: data.code || '',
                        name: data.name || '',
                        added: data.added || 0,
                        removed: data.removed || 0,
                        net: data.net || 0,
                        real: typeof data.real === 'number' ? data.real : null,
                        baseQty: typeof data.baseQty === 'number' ? data.baseQty : null,
                        kpi,
                        excluded,
                        isSaleChecked,
                    };
                })
                // Simple mode: chỉ show SP được tick (KPI > 0). Full mode: show tất cả
                // (row KPI > 0 tô xanh, row 0đ trắng — user review được SP nào chưa tick).
                .filter((p) => !simpleMode || !p.excluded);

            this.hideEl('kpiCompareLoading');

            if (products.length === 0) {
                const emptyEl = document.getElementById('kpiCompareEmpty');
                const excluded = kpiResult.excludedCount || 0;
                if (emptyEl) {
                    const pEl = emptyEl.querySelector('p');
                    if (pEl)
                        pEl.textContent =
                            excluded > 0
                                ? `Không có món nào được tính KPI (${excluded} món chưa tick / đã loại).`
                                : 'Không có sản phẩm mới (NET = 0).';
                }
                this.showEl('kpiCompareEmpty');
                return;
            }

            this.showEl('kpiCompareWrapper');

            // Banner trạng thái đối chiếu: NET tính theo ĐƠN THẬT TPOS (reconciled)
            // hay fallback audit log (chưa có snapshot → bấm "Làm mới dữ liệu").
            this._renderReconcileBanner(!!kpiResult.reconciled);

            // Render table body
            const tbody = document.getElementById('kpiCompareBody');
            const tfoot = document.getElementById('kpiCompareFoot');
            if (!tbody) return;

            const refundMap = this._getRefundedProductMap(orderId);
            let totalAdded = 0,
                totalRemoved = 0,
                totalNet = 0,
                totalKPI = 0,
                totalRefunded = 0;
            let html = '';

            products.forEach((p, idx) => {
                totalAdded += p.added;
                totalRemoved += p.removed;
                totalNet += p.net;
                totalKPI += p.kpi;

                const ref = refundMap.get((p.code || '').trim().toUpperCase());
                if (ref) totalRefunded += ref.kpiLost || 0;
                const refundCell = ref
                    ? `<span class="kpi-refund-badge" title="Hoàn ${ref.qty} → trừ ${this.formatCurrency(ref.kpiLost || 0)}">↩ ${ref.qty} · −${this.formatCurrency(ref.kpiLost || 0)}</span>`
                    : '<span class="kpi-refund-none">—</span>';

                // Row tô xanh nhạt khi thực sự đóng góp KPI (p.kpi > 0); món hoàn → tô đỏ nhạt.
                const rowClass = [p.kpi > 0 ? 'kpi-row-checked' : '', ref ? 'kpi-row-refunded' : '']
                    .filter(Boolean)
                    .join(' ');

                // Drift: audit log (added−removed) khác NET thật (final−base) → đánh dấu
                // để thấy rõ audit bị thêm trùng / xóa ảo, NET đã chỉnh theo đơn thật.
                const auditNet = (p.added || 0) - (p.removed || 0);
                const hasDrift = p.real !== null && auditNet !== p.net;
                const netCell = hasDrift
                    ? `<strong>${p.net}</strong> <span class="kpi-drift-badge" title="Audit log: +${p.added}/−${p.removed} = ${auditNet}. Đơn thật TPOS: ${p.real}${p.baseQty ? ` (base ${p.baseQty})` : ''} → NET ${p.net}">⚠ đơn thật ${p.real}</span>`
                    : `<strong>${p.net}</strong>`;

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.code)}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td class="action-add">+${p.added}</td>
                    <td class="action-remove">-${p.removed}</td>
                    <td>${netCell}</td>
                    <td>${this.formatCurrency(p.kpi)}</td>
                    <td>${refundCell}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            if (tfoot) {
                const totalRefundedCapped = Math.min(totalRefunded, totalKPI);
                const totalNetKpi = Math.max(0, totalKPI - totalRefundedCapped);
                let footHtml = `<tr>
                    <td colspan="3"><strong>Tổng cộng</strong></td>
                    <td class="action-add"><strong>+${totalAdded}</strong></td>
                    <td class="action-remove"><strong>-${totalRemoved}</strong></td>
                    <td><strong>${totalNet}</strong></td>
                    <td><strong>${this.formatCurrency(totalKPI)}</strong></td>
                    <td>${totalRefunded > 0 ? `<strong class="orb-minus">−${this.formatCurrency(totalRefundedCapped)}</strong>` : '—'}</td>
                </tr>`;
                if (totalRefunded > 0) {
                    footHtml += `<tr class="kpi-foot-net">
                        <td colspan="6" style="text-align:right;"><strong>KPI thực (gross − hoàn)</strong></td>
                        <td colspan="2"><strong class="orb-net">${this.formatCurrency(totalNetKpi)}</strong></td>
                    </tr>`;
                }
                tfoot.innerHTML = footHtml;
            }

            // Per-user attribution breakdown (audit-based, không phải chủ đơn)
            this.renderPerUserBreakdown(kpiResult);
        } catch (error) {
            console.error('[KPI Tab] Error rendering NET KPI tab:', error);
            this.hideEl('kpiCompareLoading');
            this.showEl('kpiCompareEmpty');
        }
    },

    // Banner: NET tính theo đơn thật TPOS (reconciled) hay fallback audit log.
    _renderReconcileBanner(reconciled) {
        const wrapper = document.getElementById('kpiCompareWrapper');
        if (!wrapper) return;
        let el = document.getElementById('kpiReconcileBanner');
        if (!el) {
            el = document.createElement('div');
            el.id = 'kpiReconcileBanner';
            el.style.cssText =
                'margin-bottom:10px;padding:8px 12px;border-radius:8px;font-size:12.5px;font-weight:600;display:flex;align-items:center;gap:6px;';
            wrapper.insertBefore(el, wrapper.firstChild);
        }
        if (reconciled) {
            el.style.background = '#ecfdf5';
            el.style.color = '#047857';
            el.style.border = '1px solid #a7f3d0';
            el.textContent =
                '✓ NET đối chiếu theo ĐƠN THẬT trên TPOS (final − BASE). Cột THÊM/XÓA là audit log; NET là số thật.';
        } else {
            el.style.background = '#fffbeb';
            el.style.color = '#b45309';
            el.style.border = '1px solid #fde68a';
            el.textContent =
                '⚠ Chưa có snapshot đơn thật — NET đang tính tạm theo audit log (có thể lệch). Bấm "Làm mới dữ liệu" để fetch đơn thật từ TPOS.';
        }
    },

    renderPerUserBreakdown(kpiResult) {
        const wrapper = document.getElementById('kpiCompareWrapper');
        if (!wrapper) return;

        let breakdownEl = document.getElementById('kpiPerUserBreakdown');
        if (!breakdownEl) {
            breakdownEl = document.createElement('div');
            breakdownEl.id = 'kpiPerUserBreakdown';
            breakdownEl.style.cssText =
                'margin-top:16px;padding:12px;background:#f9fafb;border-radius:8px;border:1px solid #e5e7eb;';
            wrapper.appendChild(breakdownEl);
        }

        const perUserKPI = kpiResult.perUserKPI || {};
        const perUserNet = kpiResult.perUserNet || {};
        const perUserNames = kpiResult.perUserNames || {};
        const userIds = Object.keys(perUserKPI).filter((uid) => (perUserKPI[uid] || 0) > 0);

        if (userIds.length === 0) {
            breakdownEl.innerHTML =
                '<div style="color:#6b7280;font-size:13px;">Chưa có nhân viên nào được tính KPI cho đơn này.</div>';
            return;
        }

        userIds.sort((a, b) => (perUserKPI[b] || 0) - (perUserKPI[a] || 0));

        let rows = '';
        userIds.forEach((uid, i) => {
            rows += `<tr>
                <td>${i + 1}</td>
                <td>${this.escapeHtml(perUserNames[uid] || uid)}</td>
                <td><strong>${perUserNet[uid] || 0}</strong></td>
                <td><strong>${this.formatCurrency(perUserKPI[uid] || 0)}</strong></td>
            </tr>`;
        });

        breakdownEl.innerHTML = `
            <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:8px;">
                KPI theo nhân viên (người thêm SP — đã chỉnh theo NET đơn thật)
                <span style="display:block;font-weight:400;color:#9ca3af;font-size:11px;margin-top:2px;">
                    Lưu ý: lương thực tế lưu theo quy tắc CHỦ KHOẢNG STT (My tính riêng), không phải bảng này.
                </span>
            </div>
            <table style="width:100%;font-size:13px;border-collapse:collapse;">
                <thead>
                    <tr style="background:#f3f4f6;">
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">#</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">Nhân viên</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">SP NET</th>
                        <th style="padding:6px 8px;text-align:left;border:1px solid #e5e7eb;">KPI</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`;
    },

    // ========================================
    // RENDER AUDIT LOG TAB (12.11)
    // ========================================
    async renderAuditLogTab(orderId) {
        this.showEl('auditLogLoading');
        this.hideEl('auditLogEmpty');
        this.hideEl('auditLogWrapper');

        try {
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            // Get audit logs from REST API
            let auditLogs = [];
            if (window.kpiAuditLogger) {
                auditLogs = await window.kpiAuditLogger.getAuditLogsForOrder(orderCode);
            }

            this.hideEl('auditLogLoading');

            if (auditLogs.length === 0) {
                this.showEl('auditLogEmpty');
                return;
            }

            this.showEl('auditLogWrapper');

            // Get BASE from REST API
            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;
            const baseProductIds = new Set();
            if (base) {
                (base.products || []).forEach((p) => {
                    const pid = p.ProductId || p.productId;
                    if (pid) baseProductIds.add(Number(pid));
                });
            }

            // Non-chat sources for highlighting
            const nonChatSources = [
                'edit_modal_inline',
                'edit_modal_remove',
                'edit_modal_quantity',
                'sale_modal',
            ];

            // Render table
            const tbody = document.getElementById('auditLogBody');
            if (!tbody) return;

            let html = '';
            auditLogs.forEach((log, idx) => {
                let rowClass = '';
                let extraLabel = '';

                if (log.outOfRange === true || log.out_of_range === true) {
                    rowClass = 'audit-row-out-of-range';
                    extraLabel = '<span class="out-of-range-label">Ngoài phạm vi</span>';
                } else if (nonChatSources.includes(log.source)) {
                    rowClass = 'audit-row-non-chat';
                }

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.formatTimestamp(log.createdAt || log.timestamp)}</td>
                    <td>${this.escapeHtml(log.userName || log.userId || '---')}${extraLabel}</td>
                    <td><span class="${this.getActionClass(log.action)}">${this.getActionLabel(log.action)}</span></td>
                    <td>${this.escapeHtml(log.productCode || '---')}</td>
                    <td>${this.escapeHtml(log.productName || '---')}</td>
                    <td>${log.quantity || 0}</td>
                    <td>${this.getSourceBadge(log.source)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            // Summary: tính qua calculateNetKPI để áp đúng filter biến thể
            // (productId + tpos_template_id + normalized name + out_of_range).
            const kpiResult = window.kpiManager
                ? await window.kpiManager.calculateNetKPI(orderCode)
                : { details: {}, netProducts: 0, kpiAmount: 0 };

            let totalAdded = 0,
                totalRemoved = 0;
            for (const data of Object.values(kpiResult.details || {})) {
                totalAdded += data.added || 0;
                totalRemoved += data.removed || 0;
            }
            const totalNet = kpiResult.netProducts || 0;
            const totalKPI = kpiResult.kpiAmount || totalNet * this.KPI_PER_PRODUCT;

            // Render summary
            const summaryEl = document.getElementById('auditLogSummary');
            if (summaryEl) {
                summaryEl.innerHTML = `
                    <div class="audit-summary-row">
                        <span class="label">BASE products:</span>
                        <span class="value">${baseProductIds.size} sản phẩm</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">Tổng thêm (SP mới):</span>
                        <span class="value action-add">+${totalAdded}</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">Tổng xóa (SP mới):</span>
                        <span class="value action-remove">-${totalRemoved}</span>
                    </div>
                    <div class="audit-summary-row">
                        <span class="label">NET (SP mới):</span>
                        <span class="value">${totalNet}</span>
                    </div>
                    ${
                        (kpiResult.excludedCount || 0) > 0
                            ? `<div class="audit-summary-row">
                        <span class="label">Món chưa tick (không tính KPI):</span>
                        <span class="value action-remove">${kpiResult.excludedCount}</span>
                    </div>`
                            : ''
                    }
                    <div class="audit-summary-row total">
                        <span class="label">Tổng KPI:</span>
                        <span class="value">${this.formatCurrency(totalKPI)}</span>
                    </div>`;
            }
        } catch (error) {
            console.error('[KPI Tab] Error rendering audit log tab:', error);
            this.hideEl('auditLogLoading');
            this.showEl('auditLogEmpty');
        }
    },

    // ========================================
    // RENDER ALL PRODUCTS TAB (12.12)
    // ========================================
    async renderAllProductsTab(orderId) {
        this.showEl('allProductsLoading');
        this.hideEl('allProductsEmpty');
        this.hideEl('allProductsWrapper');

        try {
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            // Try to get from report_order_details first
            let products = null;

            // Find campaign name from current order data
            const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const campaignName = order ? order.campaignName : null;

            if (campaignName) {
                const safeTableName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                try {
                    const doc = await db
                        .collection('report_order_details')
                        .doc(safeTableName)
                        .get();
                    if (doc.exists) {
                        const data = doc.data();
                        const orderData = (data.orders || []).find(
                            (o) => (o.Id || o.id) === orderId
                        );
                        if (orderData && orderData.Details) {
                            products = orderData.Details.map((d) => ({
                                code: d.ProductCode || d.Code || d.DefaultCode || '',
                                name: d.ProductName || d.Name || '',
                                quantity: d.Quantity || 1,
                                price: d.Price || 0,
                            }));
                        }
                    }
                } catch (e) {
                    console.warn('[KPI Tab] Error loading from report_order_details:', e);
                }
            }

            // Fallback: cache report_order_details trống → đọc SNAPSHOT đơn thật TPOS
            // (kpi_final_snapshot). Chưa có thì ensure (fetch TPOS 1 lần rồi lưu).
            if ((!products || products.length === 0) && window.kpiManager) {
                try {
                    const orderCode = order?.orderCode || orderId;
                    let snap = await window.kpiManager.getKpiFinalSnapshot(orderCode);
                    if (!snap || !snap.products || snap.products.length === 0) {
                        snap = await window.kpiManager.ensureKpiFinalSnapshot(orderCode, orderId);
                    }
                    if (snap && Array.isArray(snap.products) && snap.products.length > 0) {
                        products = snap.products.map((d) => ({
                            code: d.ProductCode || d.Code || d.DefaultCode || '',
                            name: d.ProductName || d.Name || '',
                            quantity: d.Quantity || 1,
                            price: d.Price || 0,
                        }));
                    }
                } catch (e) {
                    console.warn('[KPI Tab] All-products snapshot fallback failed:', e?.message);
                }
            }

            this.hideEl('allProductsLoading');

            if (!products || products.length === 0) {
                this.showEl('allProductsEmpty');
                return;
            }

            this.showEl('allProductsWrapper');

            const tbody = document.getElementById('allProductsBody');
            if (!tbody) return;

            let html = '';
            products.forEach((p, idx) => {
                html += `<tr>
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.code)}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td>${p.quantity}</td>
                    <td>${this.formatCurrency(p.price)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;
        } catch (error) {
            console.error('[KPI Tab] Error rendering all products tab:', error);
            this.hideEl('allProductsLoading');
            this.showEl('allProductsEmpty');
        }
    },

    // ========================================
    // RENDER BASE PRODUCTS TAB (12.13)
    // ========================================
    async renderBaseProductsTab(orderId) {
        this.showEl('baseProductsLoading');
        this.hideEl('baseProductsEmpty');
        this.hideEl('baseProductsContent');

        try {
            const orderData = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            const orderCode = orderData?.orderCode || orderId;

            const base = window.kpiManager ? await window.kpiManager.getKPIBase(orderCode) : null;

            this.hideEl('baseProductsLoading');

            if (!base) {
                this.showEl('baseProductsEmpty');
                return;
            }

            this.showEl('baseProductsContent');

            // Render info
            const infoEl = document.getElementById('baseSnapshotInfo');
            if (infoEl) {
                const mergeNote = '';
                infoEl.innerHTML = `
                    <div class="base-info-item">
                        <i data-lucide="clock"></i>
                        <span>Thời gian: ${this.formatTimestamp(base.createdAt || base.timestamp)}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="user"></i>
                        <span>Người lưu: ${this.escapeHtml(base.userName || base.userId || '---')}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="hash"></i>
                        <span>STT: ${base.stt || '---'}</span>
                    </div>
                    <div class="base-info-item">
                        <i data-lucide="tag"></i>
                        <span>Campaign: ${this.escapeHtml(base.campaignName || '---')}${mergeNote}</span>
                    </div>`;
            }

            // Render products table
            const products = base.products || [];
            const tbody = document.getElementById('baseProductsBody');
            if (!tbody) return;

            let html = '';
            products.forEach((p, idx) => {
                html += `<tr>
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.ProductCode || p.code || '')}</td>
                    <td>${this.escapeHtml(p.ProductName || p.productName || '')}</td>
                    <td>${p.Quantity || p.quantity || 0}</td>
                    <td>${this.formatCurrency(p.Price || p.price || 0)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Error rendering BASE products tab:', error);
            this.hideEl('baseProductsLoading');
            this.showEl('baseProductsEmpty');
        }
    },

    // ========================================
    // INBOX TAB — Pancake/Messenger messages của khách đặt đơn
    // ========================================

    /**
     * Lấy auth header TPOS — dùng chung cho mọi gọi OData từ KPI iframe.
     * Ưu tiên tokenManager nếu có; fallback POST /api/token với cred từ
     * KPI manager (đã có sẵn trong fetchRefundDetailByInvoice).
     */
    async _getKpiTposAuthHeader() {
        if (this._kpiTposAuth?.expiresAt > Date.now()) return this._kpiTposAuth.header;
        const tokenManager =
            window.tokenManager || window.parent?.tokenManager || window.top?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            const header = await tokenManager.getAuthHeader();
            // tokenManager tự refresh, không cache thêm
            return header;
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        const creds = {
            grant_type: 'password',
            username: 'nvktlive1',
            password: 'Aa@28612345678',
            client_id: 'tmtWebApp',
        };
        const body = new URLSearchParams();
        for (const [k, v] of Object.entries(creds)) body.append(k, v);
        const tokenRes = await fetch(`${WORKER}/api/token`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: body.toString(),
        });
        if (!tokenRes.ok) throw new Error(`Token HTTP ${tokenRes.status}`);
        const tj = await tokenRes.json();
        if (!tj.access_token) throw new Error('Invalid token response');
        const header = { Authorization: `Bearer ${tj.access_token}` };
        this._kpiTposAuth = { header, expiresAt: Date.now() + 50 * 60 * 1000 };
        return header;
    },

    /**
     * Lookup SaleOnline_Order on TPOS để lấy Facebook_PageId, Facebook_ASUserId,
     * Facebook_PostId, PartnerId. Cache trong-memory mỗi orderId 5 phút.
     */
    async _fetchSaleOnlineOrderForInbox(orderId) {
        if (!this._inboxOrderCache) this._inboxOrderCache = new Map();
        const cached = this._inboxOrderCache.get(orderId);
        if (cached && Date.now() - cached.savedAt < 5 * 60 * 1000) return cached.data;

        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';

        const authHeader = await this._getKpiTposAuthHeader();
        const url = `${WORKER}/api/odata/SaleOnline_Order(${orderId})?$expand=Partner`;
        const res = await fetch(url, {
            headers: {
                ...authHeader,
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
        });
        if (!res.ok) throw new Error(`SaleOnline_Order HTTP ${res.status}`);
        const data = await res.json();
        this._inboxOrderCache.set(orderId, { savedAt: Date.now(), data });
        return data;
    },

    async renderInboxTab(orderId) {
        this.showEl('inboxLoading');
        this.hideEl('inboxEmpty');
        this.hideEl('inboxContent');

        try {
            const order = await this._fetchSaleOnlineOrderForInbox(orderId);
            const postId = order?.Facebook_PostId || '';
            // Facebook_PageId thường null cho đơn từ LIVE → derive từ
            // Facebook_PostId (format: "pageId_postId").
            const pageId =
                order?.Facebook_PageId || (postId ? String(postId).split('_')[0] : '') || '';
            const psid = order?.Facebook_ASUserId || '';
            const fbUserName = order?.Facebook_UserName || '';
            const partnerName = order?.Partner?.Name || order?.PartnerName || fbUserName || '';
            const partnerPhone = order?.Partner?.Phone || order?.Telephone || '';

            if (!pageId || !psid) {
                this.hideEl('inboxLoading');
                this.showEl('inboxEmpty');
                const emp = document.getElementById('inboxEmpty');
                if (emp) {
                    emp.querySelector('p').textContent =
                        !pageId && !psid
                            ? 'Đơn không có Facebook_PageId/PostId & Facebook_ASUserId — không map được Pancake.'
                            : !pageId
                              ? 'Đơn không có Facebook_PageId/PostId.'
                              : 'Đơn không có Facebook_ASUserId (psid).';
                }
                return;
            }

            // Render meta + messages
            const channelId = postId ? String(postId).split('_')[0] : pageId;
            const pancakeInboxUrl = `https://pages.fm/#!/conversation/${pageId}/inbox?psid=${psid}`;
            const meta = document.getElementById('inboxMeta');
            if (meta) {
                meta.innerHTML = `
                    <div class="inbox-meta-row">
                        <span class="inbox-meta-label">Khách:</span>
                        <span class="inbox-meta-value">${this.escapeHtml(partnerName || '—')}${partnerPhone ? ' · ' + this.escapeHtml(partnerPhone) : ''}</span>
                    </div>
                    <div class="inbox-meta-row">
                        <span class="inbox-meta-label">Page ID:</span>
                        <code class="inbox-code">${this.escapeHtml(pageId)}</code>
                        <span class="inbox-meta-label">PSID:</span>
                        <code class="inbox-code">${this.escapeHtml(psid)}</code>
                    </div>
                    <div class="inbox-meta-row">
                        <a class="inbox-pancake-link" href="${pancakeInboxUrl}" target="_blank" rel="noopener">
                            <i data-lucide="external-link"></i> Mở trên Pancake
                        </a>
                    </div>`;
            }

            // Fetch messages via PDM — flow giống tab1-chat-core:
            //   1) fetchConversationsByCustomerFbId(pageId, psid) → conversationId
            //   2) fetchMessages(pageId, convId, null, customerId) → messages[]
            const pdm =
                window.pancakeDataManager ||
                window.parent?.pancakeDataManager ||
                window.top?.pancakeDataManager;

            let messages = [];
            let conversationId = null;
            let usedPageId = pageId;
            let fetchError = null;

            if (pdm?.fetchConversationsByCustomerFbId && pdm?.fetchMessages) {
                try {
                    // Ensure pancakeTokenManager initialized (đọc JWT từ localStorage
                    // — đã login qua tab1 thì cùng origin → token sẵn sàng).
                    if (pdm.tm?.initialize) {
                        await pdm.tm.initialize().catch(() => {});
                    }

                    // 1) Resolve conversation từ pageId + psid
                    let convRes = await pdm.fetchConversationsByCustomerFbId(pageId, psid);
                    let convs = convRes?.conversations || [];
                    let conv = convs.find((c) => c.type === 'INBOX') || convs[0];

                    // 2) Nếu pageId derive sai → multi-page search
                    if (!conv && pdm.fetchConversationsByCustomerIdMultiPage) {
                        const mpRes = await pdm.fetchConversationsByCustomerIdMultiPage(psid);
                        const mpConvs = mpRes?.conversations || [];
                        conv = mpConvs.find((c) => c.type === 'INBOX') || mpConvs[0];
                        if (conv) {
                            usedPageId = conv.page_id || conv.from_psid_page || pageId;
                        }
                    }

                    // 3) Fetch messages
                    if (conv?.id) {
                        conversationId = conv.id;
                        const customerId = conv.from?.id || conv.from_id || psid;
                        const msgRes = await pdm.fetchMessages(
                            usedPageId,
                            conversationId,
                            null,
                            customerId
                        );
                        messages = msgRes?.messages || [];
                    } else {
                        fetchError =
                            'Không tìm thấy conversation cho PSID này (có thể đã bị xóa hoặc subscription page đã hết hạn).';
                    }
                } catch (e) {
                    console.warn('[KPI Inbox] PDM fetch failed:', e?.message || e);
                    fetchError = e?.message || 'Lỗi không xác định';
                }
            } else {
                fetchError =
                    'Pancake stack chưa load (cần shared/js/pancake-token-manager.js + pancake-data-manager.js).';
            }

            this._renderInboxMessages(messages, {
                pageId: usedPageId,
                psid,
                pancakeInboxUrl,
                conversationId,
                hasPdm: !!pdm,
                error: fetchError,
            });
            this.hideEl('inboxLoading');
            this.showEl('inboxContent');
            this.reinitIcons();
        } catch (e) {
            console.error('[KPI Inbox] Error:', e);
            this.hideEl('inboxLoading');
            this.showEl('inboxEmpty');
            const emp = document.getElementById('inboxEmpty');
            if (emp) {
                emp.querySelector('p').textContent = `Lỗi tải tin nhắn: ${e.message}`;
            }
        }
    },

    _renderInboxMessages(messages, ctx) {
        const wrap = document.getElementById('inboxMessages');
        if (!wrap) return;

        if (!messages || messages.length === 0) {
            const errText = ctx.error
                ? `<p class="inbox-err">${this.escapeHtml(ctx.error)}</p>`
                : '<p>Conversation rỗng (chưa có tin nhắn nào).</p>';
            wrap.innerHTML = `
                <div class="inbox-empty-list">
                    ${errText}
                    <p><a href="${ctx.pancakeInboxUrl}" target="_blank" rel="noopener">Mở trực tiếp trên Pancake</a> để xem full lịch sử.</p>
                </div>`;
            return;
        }

        // Sort by inserted_at / created_time ascending (oldest first → newest at bottom)
        const sorted = [...messages].sort((a, b) => {
            const ta = new Date(a.inserted_at || a.created_time || a.timestamp || 0).getTime();
            const tb = new Date(b.inserted_at || b.created_time || b.timestamp || 0).getTime();
            return ta - tb;
        });

        const pageId = String(ctx.pageId);
        let html = '';
        for (const msg of sorted) {
            const fromId = msg?.from?.id || msg.from_id || '';
            const isFromPage = String(fromId) === pageId;
            const side = isFromPage ? 'page' : 'customer';
            // Pancake Public API v1 messages có `original_message` (raw text) + `message` (HTML)
            const text = msg.original_message || this._stripHtml(msg.message || msg.text || '');
            const senderName = msg?.from?.name || (isFromPage ? 'Page' : 'Khách') || 'Unknown';
            const t = msg.inserted_at || msg.created_time || msg.timestamp || '';
            const tStr = t ? new Date(t).toLocaleString('vi-VN') : '';
            const attachments = msg.attachments || [];

            let attachHtml = '';
            for (const a of attachments) {
                const url = a.url || a.image_url || a.payload?.url || a.thumbnail_url || '';
                if (!url) continue;
                const typeStr = String(a.type || '').toLowerCase();
                if (typeStr === 'image' || /\.(jpg|jpeg|png|gif|webp)$/i.test(url)) {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener"><img src="${this.escapeHtml(url)}" class="inbox-attach-img" alt="" loading="lazy" /></a>`;
                } else if (typeStr === 'video' || /\.(mp4|webm|mov)$/i.test(url)) {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="inbox-attach-file">🎬 Video</a>`;
                } else {
                    attachHtml += `<a href="${this.escapeHtml(url)}" target="_blank" rel="noopener" class="inbox-attach-file">📎 ${this.escapeHtml(a.name || 'Tệp đính kèm')}</a>`;
                }
            }

            html += `
                <div class="inbox-msg inbox-msg-${side}">
                    <div class="inbox-msg-bubble">
                        ${text ? `<div class="inbox-msg-text">${this.escapeHtml(text)}</div>` : ''}
                        ${attachHtml ? `<div class="inbox-msg-attach">${attachHtml}</div>` : ''}
                    </div>
                    <div class="inbox-msg-meta">
                        <span class="inbox-msg-sender">${this.escapeHtml(senderName)}</span>
                        ${tStr ? `<span class="inbox-msg-time">${this.escapeHtml(tStr)}</span>` : ''}
                    </div>
                </div>`;
        }

        wrap.innerHTML = html;
        // Scroll to bottom (latest message visible)
        wrap.scrollTop = wrap.scrollHeight;
    },

    _stripHtml(html) {
        if (!html) return '';
        const tmp = document.createElement('div');
        tmp.innerHTML = String(html);
        return tmp.textContent || tmp.innerText || '';
    },

    // ========================================
    // FETCH REFUND EXCEL (3 months) — TPOS FastSaleOrder/ExportFileRefund
    // ========================================

    /**
     * Parse cột "Chi tiết" của refund excel → list { code, qty } các MÓN được hoàn.
     * Format mỗi cell: "<SL> x [<CODE>] <tên>... (đvt) (...)" — nhiều món cách nhau " ; ".
     * VD: "1 x [B1924A36] ... ; 2 x [B1926A36] ..." → [{code:'B1924A36',qty:1},{code:'B1926A36',qty:2}]
     * Code normalize: trim + uppercase (khớp với productCode trong KPI details).
     */
    _parseRefundChiTiet(chiTiet) {
        const items = [];
        if (!chiTiet) return items;
        const re = /(\d+)\s*x\s*\[([^\]]+)\]/g;
        let m;
        while ((m = re.exec(String(chiTiet))) !== null) {
            const qty = parseInt(m[1], 10) || 0;
            const code = (m[2] || '').trim().toUpperCase();
            if (code && qty > 0) items.push({ code, qty });
        }
        return items;
    },

    /**
     * Fetch + parse refund excel CHI TIẾT 3 tháng gần nhất.
     * Trả map theo từng đơn (key = "Tham chiếu" = số phiếu gốc, vd "NJD/2026/62621")
     * → Map<productCode, qtyHoàn> các MÓN được hoàn trong đơn đó.
     *
     * Endpoint MỚI: POST /api/FastSaleOrder/ExportFileDetail?TagIds=&type=refund
     *   (khác ExportFileRefund cũ ở chỗ có thêm cột "Chi tiết" liệt kê từng món hoàn)
     * Body: { data: JSON.stringify({Filter:{...}}), ids: [] }
     * Response: XLSX binary, header row 3 (range:2 in JSON parse).
     *
     * @returns {{ refundByInvoice: Map<string, Map<string, number>>, codes: Set<string>,
     *             totalRows: number, startISO: string, endISO: string }}
     *   - refundByInvoice: số phiếu gốc → (productCode → tổng SL hoàn)
     *   - codes: Set số phiếu gốc đã hoàn (giữ tương thích chỗ chỉ cần biết "đơn có hoàn")
     */
    async fetchRefundDetailByInvoice(monthsBack = 3) {
        if (typeof XLSX === 'undefined') {
            await new Promise((resolve, reject) => {
                const s = document.createElement('script');
                s.src = 'https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js';
                s.onload = resolve;
                s.onerror = reject;
                document.head.appendChild(s);
            });
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';
        // KPI iframe không có tokenManager — lấy token qua proxy /api/token chế độ
        // JSON proxy-auth: worker giữ credentials TPOS server-side, browser CHỈ gửi
        // { companyId } (bỏ hardcode user/pass trong client JS — pattern chuẩn đã
        // dùng ở orders-report/js/core/token-manager.js, shared/js/token-manager.js).
        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else {
            const companyId =
                window.ShopConfig?.getConfig?.()?.CompanyId ||
                window.parent?.ShopConfig?.getConfig?.()?.CompanyId ||
                1;
            const tokenRes = await fetch(`${WORKER}/api/token`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ companyId }),
            });
            if (!tokenRes.ok) throw new Error(`Token HTTP ${tokenRes.status}`);
            const tokenData = await tokenRes.json();
            if (!tokenData.access_token) throw new Error('Invalid token response');
            authHeader = { Authorization: `Bearer ${tokenData.access_token}` };
        }
        const headers = authHeader;
        const endDate = new Date();
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - monthsBack);
        const startISO = new Date(
            startDate.setHours(0, 0, 0, 0) - 7 * 60 * 60 * 1000
        ).toISOString();
        const endISO = new Date(
            endDate.setHours(23, 59, 59, 999) - 7 * 60 * 60 * 1000
        ).toISOString();
        const filter = {
            Filter: {
                logic: 'and',
                filters: [
                    { field: 'Type', operator: 'eq', value: 'refund' },
                    { field: 'DateInvoice', operator: 'gte', value: startISO },
                    { field: 'DateInvoice', operator: 'lte', value: endISO },
                    { field: 'IsMergeCancel', operator: 'neq', value: true },
                ],
            },
        };
        const res = await fetch(
            `${WORKER}/api/FastSaleOrder/ExportFileDetail?TagIds=&type=refund`,
            {
                method: 'POST',
                headers: {
                    ...headers,
                    Accept: '*/*',
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ data: JSON.stringify(filter), ids: [] }),
            }
        );
        if (!res.ok) throw new Error(`ExportFileDetail HTTP ${res.status}`);
        const buf = await res.arrayBuffer();
        const wb = XLSX.read(buf, { type: 'array' });
        const sheet = wb.Sheets[wb.SheetNames[0]];
        // range:2 = skip 2 title rows, header is row 3 ("STT", ..., "Tham chiếu", ..., "Chi tiết", ...)
        const rows = XLSX.utils.sheet_to_json(sheet, { range: 2, defval: null });
        const refundByInvoice = new Map(); // số phiếu gốc → Map<productCode, qtyHoàn>
        const codes = new Set();
        for (const row of rows) {
            const ref = String(row['Tham chiếu'] || '').trim();
            if (!ref) continue;
            codes.add(ref);
            const items = this._parseRefundChiTiet(row['Chi tiết']);
            if (items.length === 0) continue;
            let codeMap = refundByInvoice.get(ref);
            if (!codeMap) {
                codeMap = new Map();
                refundByInvoice.set(ref, codeMap);
            }
            // Aggregate SL theo code (1 phiếu nhiều dòng / 1 dòng nhiều món)
            for (const it of items) {
                codeMap.set(it.code, (codeMap.get(it.code) || 0) + it.qty);
            }
        }
        console.log(
            `[KPI Tab] Refund detail excel ${monthsBack} tháng: ${rows.length} dòng, ` +
                `${codes.size} phiếu unique, ${refundByInvoice.size} phiếu có chi tiết món`
        );
        return { refundByInvoice, codes, totalRows: rows.length, startISO, endISO };
    },

    /**
     * So khớp món hoàn (refund excel CHI TIẾT) với món tính KPI của 1 đơn.
     * Chỉ món có code khớp giữa KPI details và refund "Chi tiết" mới bị loại KPI,
     * trừ theo SL = min(SL hoàn, SL net KPI) × KPI_PER_PRODUCT (owner chốt: chính xác theo SL).
     *
     * @param {string} invNumber - số phiếu TPOS của đơn (invoice.Number)
     * @param {object} details - KPI per-product { [pid]: {code, name, net, unitKPI, excludedBySaleFlag, ...} } (từ reconcileKPI)
     * @param {Map<string, Map<string, number>>} refundByInvoice - từ fetchRefundDetailByInvoice
     * @returns {{ refundedKpiAmount:number, refundedProducts:Array<{code,name,qty,kpiLost}>, hasRefundRow:boolean }}
     */
    _matchRefundForOrder(invNumber, details, refundByInvoice) {
        const refundItems = invNumber ? refundByInvoice?.get(invNumber) : null;
        const out = {
            refundedKpiAmount: 0,
            refundedProducts: [],
            hasRefundRow: !!refundItems,
        };
        if (!refundItems || !details) return out;
        for (const d of Object.values(details)) {
            // CHỈ trừ KPI cho món THỰC SỰ được tính KPI: bỏ qua món chưa sale-tick
            // (excludedBySaleFlag) — món đó đóng góp 0 KPI nên hoàn về cũng không trừ.
            // (calculateNetKPI set data.net cho MỌI món kể cả món loại → phải check flag.)
            if (d?.excludedBySaleFlag === true) continue;
            const net = d?.net || 0;
            if (net <= 0) continue;
            const code = (d.code || '').trim().toUpperCase();
            if (!code) continue;
            const refQty = refundItems.get(code) || 0;
            if (refQty <= 0) continue;
            const lostQty = Math.min(refQty, net);
            const unit = d.unitKPI || this.KPI_PER_PRODUCT || 5000;
            const kpiLost = lostQty * unit;
            out.refundedKpiAmount += kpiLost;
            out.refundedProducts.push({ code: d.code, name: d.name || '', qty: lostQty, kpiLost });
        }
        return out;
    },

    /**
     * Đối soát MỘT đơn: reconcileKPI (NET thật + per-product details) + so khớp
     * món hoàn theo SẢN PHẨM → trả record kết quả chuẩn cho bảng đối soát.
     * Dùng chung cho đối soát toàn cục (runReconciliation) và per-NV modal L1
     * (runEmployeeReconciliation) — trước đây ~80 dòng duplicate ở mỗi nơi.
     *
     * @param {object} order - order từ filteredData ({orderId, orderCode, kpi, stt, netProducts, campaignName})
     * @param {object|null} invoice - entry từ _invoiceCache (hoặc null)
     * @param {Map} refundByInvoice - từ fetchRefundDetailByInvoice
     * @returns {Promise<object>} recon record (cả error-shape khi lỗi)
     */
    async _buildReconRecord(order, invoice, refundByInvoice) {
        const invNumber = invoice?.Number || '';
        const baseFields = {
            orderId: order.orderId,
            orderCode: order.orderCode || '',
            invoiceNumber: invNumber,
            invoiceState: invoice?.ShowState || '',
            kpiAmount: order.kpi || 0,
            stt: order.stt,
            expectedNet: order.netProducts || 0,
        };
        try {
            let result = {
                hasDiscrepancy: false,
                discrepancies: [],
                actualNet: null,
                details: {},
            };
            if (window.kpiManager?.reconcileKPI) {
                result = await window.kpiManager.reconcileKPI(
                    order.orderId,
                    order.campaignName,
                    order.orderCode
                );
            }
            // So khớp món hoàn theo SẢN PHẨM (chỉ trừ KPI món được tính KPI).
            const refund = this._matchRefundForOrder(invNumber, result.details, refundByInvoice);
            const kpiLost = Math.min(refund.refundedKpiAmount, order.kpi || 0);
            // "Có hoàn" TÁCH khỏi "bị loại KPI": đơn có phiếu hoàn mà món hoàn
            // không tính KPI vẫn flag isRefunded nhưng loss=0.
            const isRefunded = refund.hasRefundRow || refund.refundedKpiAmount > 0;
            const refundDiscrepancy = !isRefunded
                ? []
                : refund.refundedKpiAmount > 0
                  ? [
                        {
                            type: 'refunded',
                            message: `Hoàn ${refund.refundedProducts.length} món KPI (${refund.refundedProducts
                                .map((p) => p.code)
                                .join(', ')}) — loại ${this.formatCurrency(kpiLost)}`,
                        },
                    ]
                  : [
                        {
                            type: 'refunded_no_kpi',
                            message: `Đơn có hoàn nhưng món hoàn không nằm trong SP tính KPI → không trừ KPI`,
                        },
                    ];
            return {
                ...baseFields,
                actualNet: result.actualNet != null ? result.actualNet : order.netProducts || 0,
                hasDiscrepancy: refund.refundedKpiAmount > 0 || result.hasDiscrepancy,
                isRefunded,
                refundedKpiAmount: refund.refundedKpiAmount,
                refundedProducts: refund.refundedProducts,
                hasRefundRow: refund.hasRefundRow,
                discrepancies: [...refundDiscrepancy, ...(result.discrepancies || [])],
            };
        } catch (e) {
            console.error('[KPI Recon] error for order:', order.orderId, e);
            return {
                ...baseFields,
                actualNet: 'Lỗi',
                hasDiscrepancy: true,
                isRefunded: false,
                refundedKpiAmount: 0,
                refundedProducts: [],
                hasRefundRow: refundByInvoice.has(invNumber),
                discrepancies: [{ type: 'error', message: e?.message || 'lỗi' }],
            };
        }
    },

    // ========================================
    // RECONCILIATION HELPERS (UI redesign)
    // ========================================

    _setReconProgress(stage, pct, detail) {
        const el = document.getElementById('reconProgress');
        if (!el) return;
        el.style.display = '';
        const stageEl = document.getElementById('reconProgressStage');
        const pctEl = document.getElementById('reconProgressPct');
        const fillEl = document.getElementById('reconProgressFill');
        const detailEl = document.getElementById('reconProgressDetail');
        if (stageEl) stageEl.textContent = stage || '';
        if (pctEl) pctEl.textContent = `${Math.round(pct || 0)}%`;
        if (fillEl) fillEl.style.width = `${Math.max(2, Math.min(100, pct || 0))}%`;
        if (detailEl) detailEl.textContent = detail || '';
    },

    _hideReconProgress() {
        const el = document.getElementById('reconProgress');
        if (el) el.style.display = 'none';
    },

    _animateCount(el, target, duration = 600) {
        if (!el) return;
        const start = parseInt((el.textContent || '0').replace(/\D/g, '')) || 0;
        const delta = target - start;
        if (delta === 0) {
            el.textContent = target.toLocaleString('vi-VN');
            return;
        }
        const t0 = performance.now();
        const tick = (now) => {
            const elapsed = now - t0;
            const t = Math.min(1, elapsed / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const v = Math.round(start + delta * eased);
            el.textContent = v.toLocaleString('vi-VN');
            if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
    },

    _formatVnd(amount) {
        if (!amount) return '0 ₫';
        return amount.toLocaleString('vi-VN') + ' ₫';
    },

    _bindReconChips() {
        const chips = document.querySelectorAll('.recon-chip');
        const cards = document.querySelectorAll('.recon-stat-card');
        const apply = (key) => {
            this._reconFilter = key;
            chips.forEach((c) => c.classList.toggle('is-active', c.dataset.filter === key));
            cards.forEach((c) => c.classList.toggle('is-active', c.dataset.filter === key));
            this._applyReconFilter();
        };
        chips.forEach((chip) => {
            if (chip.__reconBound) return;
            chip.__reconBound = true;
            chip.addEventListener('click', () => apply(chip.dataset.filter));
        });
        cards.forEach((card) => {
            if (card.__reconBound) return;
            card.__reconBound = true;
            card.addEventListener('click', () => apply(card.dataset.filter));
        });
    },

    _applyReconFilter() {
        const filter = this._reconFilter || 'all';
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const rows = tbody.querySelectorAll('tr[data-recon-row]');
        let visible = 0;
        rows.forEach((row) => {
            const status = row.dataset.reconStatus;
            const show =
                filter === 'all' ||
                (filter === 'ok' && status === 'ok') ||
                (filter === 'refunded' && status === 'refunded') ||
                (filter === 'discrepancy' && status === 'discrepancy');
            row.style.display = show ? '' : 'none';
            const detail = row.nextElementSibling;
            if (detail && detail.classList.contains('recon-detail-row')) {
                detail.style.display = show && detail.dataset.open === '1' ? '' : 'none';
            }
            if (show) visible++;
        });
        const emptyFilterEl = document.getElementById('reconEmptyFilter');
        if (emptyFilterEl) emptyFilterEl.style.display = visible === 0 ? '' : 'none';
    },

    _bindReconSort() {
        const headers = document.querySelectorAll('#reconResultsWrapper thead th[data-sort]');
        headers.forEach((th) => {
            if (th.__reconBound) return;
            th.__reconBound = true;
            th.addEventListener('click', () => {
                const key = th.dataset.sort;
                const cur = this._reconSort || {};
                const dir = cur.key === key && cur.dir === 'asc' ? 'desc' : 'asc';
                this._reconSort = { key, dir };
                headers.forEach((h) => h.classList.toggle('is-sorted', h === th));
                this._sortReconResults();
            });
        });
    },

    _sortReconResults() {
        const sort = this._reconSort;
        if (!sort) return;
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const allRows = Array.from(tbody.children);
        const pairs = [];
        for (let i = 0; i < allRows.length; i++) {
            if (allRows[i].dataset.reconRow != null) {
                const detail = allRows[i + 1]?.classList.contains('recon-detail-row')
                    ? allRows[i + 1]
                    : null;
                pairs.push({ main: allRows[i], detail });
            }
        }
        pairs.sort((a, b) => {
            const av = a.main.dataset[`sort_${sort.key}`] || '';
            const bv = b.main.dataset[`sort_${sort.key}`] || '';
            const an = parseFloat(av);
            const bn = parseFloat(bv);
            const isNum = !isNaN(an) && !isNaN(bn);
            const cmp = isNum ? an - bn : av.localeCompare(bv);
            return sort.dir === 'asc' ? cmp : -cmp;
        });
        const frag = document.createDocumentFragment();
        pairs.forEach(({ main, detail }) => {
            frag.appendChild(main);
            if (detail) frag.appendChild(detail);
        });
        tbody.appendChild(frag);
    },

    _toggleReconDetail(orderId) {
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;
        const main = tbody.querySelector(`tr[data-order-id="${orderId}"]`);
        if (!main) return;
        const detail = main.nextElementSibling;
        if (!detail || !detail.classList.contains('recon-detail-row')) return;
        const isOpen = detail.dataset.open === '1';
        detail.dataset.open = isOpen ? '0' : '1';
        detail.style.display = isOpen ? 'none' : '';
        const btn = main.querySelector('.recon-toggle-btn');
        if (btn) btn.classList.toggle('is-open', !isOpen);
    },

    async exportReconciliationExcel() {
        if (!this._reconResults || this._reconResults.length === 0) {
            alert('Không có dữ liệu đối soát để xuất');
            return;
        }
        if (typeof XLSX === 'undefined') {
            alert('XLSX chưa load');
            return;
        }
        const rows = [
            [
                'Mã ĐH',
                'Số phiếu (TPOS)',
                'STT',
                'Expected',
                'Actual',
                'Delta',
                'KPI bị loại',
                'Món hoàn',
                'Trạng thái',
                'Ghi chú',
            ],
        ];
        for (const r of this._reconResults) {
            const status =
                r.refundedKpiAmount > 0
                    ? 'Đã hoàn (loại KPI)'
                    : r.isRefunded
                      ? 'Có hoàn (0đ KPI)'
                      : r.hasDiscrepancy
                        ? 'Sai lệch'
                        : 'OK';
            const note = (r.discrepancies || []).map((d) => `[${d.type}] ${d.message}`).join(' | ');
            const refundedProductsStr = (r.refundedProducts || [])
                .map((p) => `${p.qty} x [${p.code}]`)
                .join(', ');
            rows.push([
                r.orderCode,
                r.invoiceNumber || '',
                r.stt != null ? r.stt : '',
                r.expectedNet,
                typeof r.actualNet === 'number' ? r.actualNet : r.actualNet,
                typeof r.actualNet === 'number' ? r.actualNet - r.expectedNet : '',
                Math.min(r.refundedKpiAmount || 0, r.kpiAmount || 0),
                refundedProductsStr,
                status,
                note,
            ]);
        }
        const ws = XLSX.utils.aoa_to_sheet(rows);
        ws['!cols'] = [
            { wch: 14 },
            { wch: 18 },
            { wch: 8 },
            { wch: 12 },
            { wch: 12 },
            { wch: 10 },
            { wch: 12 },
            { wch: 30 },
            { wch: 22 },
            { wch: 60 },
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Đối soát KPI');
        const fname = `doi-soat-kpi-${new Date().toISOString().slice(0, 10)}.xlsx`;
        XLSX.writeFile(wb, fname);
    },

    // ========================================
    // RUN RECONCILIATION (12.14) — refresh + check refund excel
    // ========================================
    async runReconciliation() {
        const btn = document.getElementById('btnRunReconciliation');
        if (btn) btn.disabled = true;

        this.hideEl('reconEmpty');
        this.hideEl('reconResultsWrapper');
        const statsEl = document.getElementById('reconStatsCards');
        const ctrlEl = document.getElementById('reconControlBar');
        if (statsEl) statsEl.style.display = 'none';
        if (ctrlEl) ctrlEl.style.display = 'none';
        this._setReconProgress('Đang khởi tạo...', 2, '');

        const setLoadingMsg = (msg, pct, detail) => {
            this._setReconProgress(msg, pct, detail || '');
        };

        try {
            // Collect all orders from filtered data
            const allOrders = [];
            for (const emp of this.state.filteredData) {
                for (const order of emp.orders) {
                    allOrders.push(order);
                }
            }

            if (allOrders.length === 0) {
                this.hideEl('reconLoading');
                this.showEl('reconEmpty');
                const emptyEl = document.getElementById('reconEmpty');
                if (emptyEl)
                    emptyEl.querySelector('p').textContent =
                        'Không có đơn hàng nào để đối soát. Hãy áp dụng bộ lọc trước.';
                if (btn) btn.disabled = false;
                return;
            }

            // Step 1: Load invoice cache + fetch refund excel SONG SONG
            // (independent — không phụ thuộc nhau, dùng Promise.all)
            setLoadingMsg(
                'Load invoice cache + refund excel song song...',
                8,
                'Promise.all 2 tasks độc lập'
            );
            const t1 = performance.now();
            const [, refundResult] = await Promise.all([
                this.loadInvoiceStatusData().catch((e) => {
                    console.warn('[KPI Tab] Load invoice cache failed:', e?.message);
                }),
                this.fetchRefundDetailByInvoice(3).catch((e) => {
                    console.warn('[KPI Tab] Fetch refund detail excel failed:', e?.message);
                    if (window.notificationManager?.warning) {
                        window.notificationManager.warning(
                            'Không tải được refund excel — đối soát chỉ check trạng thái đơn',
                            2500
                        );
                    }
                    return { refundByInvoice: new Map(), codes: new Set(), totalRows: 0 };
                }),
            ]);
            const refundInfo = refundResult || {
                refundByInvoice: new Map(),
                codes: new Set(),
                totalRows: 0,
            };
            const refundByInvoice = refundInfo.refundByInvoice || new Map();
            console.log(
                `[KPI Tab] Step 1 (parallel) hoàn tất trong ${Math.round(performance.now() - t1)}ms`
            );

            // Step 1c: Map orderId → invoice. Số đơn có món hoàn (candidate) chỉ để
            // hiển thị progress — KPI loss thực tính per-product trong reconcileOne.
            const orderIdToInvoice = new Map();
            let refundCandidateCount = 0;
            for (const order of allOrders) {
                const inv = this._invoiceCache.get(order.orderId);
                const invNumber = inv?.Number || '';
                orderIdToInvoice.set(order.orderId, inv || null);
                if (invNumber && refundByInvoice.has(invNumber)) refundCandidateCount++;
            }

            // Step 2: Reconcile từng đơn — WORKER POOL CONCURRENCY 8 (song song)
            // Trước: 134 sequential awaits ~30-60s. Sau: 8 workers parallel ~5-10s.
            const CONCURRENCY = 8;
            const total = allOrders.length;
            setLoadingMsg(
                `Kiểm tra audit log song song ${CONCURRENCY} workers (0/${total})`,
                25,
                `${refundCandidateCount} đơn có món hoàn — so khớp theo món`
            );
            const results = new Array(total); // preserve order via index
            let processed = 0;
            let nextIdx = 0;
            const t2 = performance.now();

            // Logic đối soát 1 đơn dùng chung với per-NV: _buildReconRecord.
            const reconcileOne = async (idx) => {
                const order = allOrders[idx];
                const invoice = orderIdToInvoice.get(order.orderId);
                results[idx] = await this._buildReconRecord(order, invoice, refundByInvoice);
            };

            // Throttled progress UI update — chỉ refresh mỗi 200ms để tránh
            // reflow liên tục khi 8 workers fire callback đồng thời
            let lastProgressUpdate = 0;
            const updateProgress = (force) => {
                const now = performance.now();
                if (!force && now - lastProgressUpdate < 200) return;
                lastProgressUpdate = now;
                const pct = 25 + Math.round((processed / total) * 70);
                const refundedSoFar = results.filter((r) => r?.refundedKpiAmount > 0).length;
                setLoadingMsg(
                    `Kiểm tra song song ${CONCURRENCY} workers (${processed}/${total})`,
                    pct,
                    `${refundedSoFar} đơn có món KPI hoàn · ${results.filter((r) => r?.hasDiscrepancy && !r?.isRefunded).length} sai lệch khác`
                );
            };

            // Worker pool: spawn N concurrent workers, each pulls from queue
            const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, async () => {
                while (true) {
                    const myIdx = nextIdx++;
                    if (myIdx >= total) break;
                    await reconcileOne(myIdx);
                    processed++;
                    updateProgress(false);
                }
            });
            await Promise.all(workers);
            updateProgress(true);
            console.log(
                `[KPI Tab] Step 2 (concurrency ${CONCURRENCY}) hoàn tất ${total} đơn trong ${Math.round(performance.now() - t2)}ms`
            );

            setLoadingMsg('Render bảng kết quả...', 98, '');
            await new Promise((r) => setTimeout(r, 100));

            this._reconResults = results;
            this._indexReconResults(results);
            this._renderReconciliationUI(results, refundInfo);
            // Đồng bộ refund vào main KPI table (re-render để show cột Hoàn + KPI thực)
            try {
                await this.renderKPITable(this.state.filteredData || []);
            } catch (e) {
                console.warn('[KPI Tab] Sync KPI table after recon failed:', e?.message);
            }
            this._hideReconProgress();
        } catch (error) {
            console.error('[KPI Tab] Reconciliation error:', error);
            this._hideReconProgress();
            this.showEl('reconEmpty');
            const emptyEl = document.getElementById('reconEmpty');
            if (emptyEl) emptyEl.querySelector('p').textContent = `Lỗi đối soát: ${error.message}`;
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    /**
     * Build maps để các bảng khác (main KPI, modal L1) đọc nhanh:
     *   - _reconByOrder: orderId → { isRefunded, hasDiscrepancy, invoiceNumber, ... }
     *   - _reconRefundedRowMap: invoiceNumber → row excel (Khách hàng, Số phiếu, Tổng tiền,...)
     *   - _reconKpiLossByUser: userId → tổng KPI bị loại do refund
     */
    _indexReconResults(results) {
        this._reconByOrder = new Map();
        this._reconKpiLossByUser = new Map();
        for (const r of results) {
            this._reconByOrder.set(r.orderId, r);
        }
        // Aggregate KPI loss per user — PER-PRODUCT: chỉ cộng phần KPI của món
        // thực sự bị hoàn (refundedKpiAmount), KHÔNG loại cả đơn.
        for (const emp of this.state.filteredData || []) {
            let lossSum = 0;
            let refundCount = 0;
            for (const order of emp.orders || []) {
                const r = this._reconByOrder.get(order.orderId);
                const refLoss = r?.refundedKpiAmount || 0;
                // "Có hoàn" (kể cả loss=0) vẫn đếm refundCount; chỉ cộng loss khi
                // món hoàn thực sự được tính KPI (refLoss>0), cap theo order.kpi.
                if (r?.isRefunded || refLoss > 0) {
                    if (refLoss > 0) lossSum += Math.min(refLoss, order.kpi || 0);
                    refundCount++;
                }
            }
            this._reconKpiLossByUser.set(emp.userId, {
                kpiLost: lossSum,
                refundCount,
            });
        }
    },

    /**
     * Fetch FastSaleOrder refund detail (món trả + lý do) on-demand cho 1 invoice.
     * Cache trong _reconRefundDetailCache để tránh fetch lặp.
     */
    async _fetchRefundDetailForInvoice(originalInvoiceNumber) {
        if (!this._reconRefundDetailCache) this._reconRefundDetailCache = new Map();
        if (this._reconRefundDetailCache.has(originalInvoiceNumber)) {
            return this._reconRefundDetailCache.get(originalInvoiceNumber);
        }
        const WORKER =
            window.API_CONFIG?.WORKER_URL ||
            window.parent?.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev';

        let authHeader;
        const tokenManager = window.tokenManager || window.parent?.tokenManager;
        if (tokenManager?.getAuthHeader) {
            authHeader = await tokenManager.getAuthHeader();
        } else if (this._reconAuthHeader) {
            authHeader = this._reconAuthHeader;
        } else {
            // Re-fetch token (shouldn't reach normally)
            authHeader = { Authorization: '' };
        }

        try {
            // Step 1: Find original invoice by Number qua GetView (OData direct trả 500)
            const findFilter = encodeURIComponent(
                "(Type eq 'invoice' and Number eq '" +
                    originalInvoiceNumber.replace(/'/g, "''") +
                    "')"
            );
            const findUrl = `${WORKER}/api/odata/FastSaleOrder/ODataService.GetView?$filter=${findFilter}&$top=1`;
            const findRes = await fetch(findUrl, {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            });
            if (!findRes.ok) throw new Error(`Find HTTP ${findRes.status}`);
            const findData = await findRes.json();
            const origInvoice = findData.value?.[0];
            if (!origInvoice?.Id) {
                this._reconRefundDetailCache.set(originalInvoiceNumber, null);
                return null;
            }

            // Step 2: Find refund by RefundOrderId = origInvoice.Id (qua GetView)
            const refundFilter = encodeURIComponent(
                "(Type eq 'refund' and RefundOrderId eq " + origInvoice.Id + ')'
            );
            const refundUrl = `${WORKER}/api/odata/FastSaleOrder/ODataService.GetView?$filter=${refundFilter}&$top=5`;
            const refundRes = await fetch(refundUrl, {
                headers: {
                    ...authHeader,
                    accept: 'application/json',
                    'feature-version': '2',
                    'x-tpos-lang': 'vi',
                },
            });
            if (!refundRes.ok) throw new Error(`Refund HTTP ${refundRes.status}`);
            const refundDataList = await refundRes.json();
            const refundSummaries = refundDataList.value || [];

            // Step 3: GET full FastSaleOrder({id})?$expand=OrderLines cho mỗi refund
            const refunds = [];
            for (const summ of refundSummaries) {
                try {
                    const fullRes = await fetch(
                        `${WORKER}/api/odata/FastSaleOrder(${summ.Id})?$expand=OrderLines`,
                        {
                            headers: {
                                ...authHeader,
                                accept: 'application/json',
                                'feature-version': '2',
                                'x-tpos-lang': 'vi',
                            },
                        }
                    );
                    if (fullRes.ok) {
                        const full = await fullRes.json();
                        refunds.push(full);
                    } else {
                        refunds.push(summ);
                    }
                } catch (_) {
                    refunds.push(summ);
                }
            }
            const detail = {
                originalNumber: originalInvoiceNumber,
                refunds: refunds.map((r) => ({
                    Number: r.Number,
                    DateInvoice: r.DateInvoice,
                    AmountTotal: r.AmountTotal,
                    Comment: r.Comment || r.Note || '',
                    State: r.State,
                    ShowState: r.ShowState,
                    OrderLines: (r.OrderLines || []).map((l) => ({
                        ProductName: l.ProductName || l.ProductNameGet || l.Name,
                        Quantity: l.Quantity,
                        Price: l.Price,
                        Note: l.Note || '',
                    })),
                })),
            };
            this._reconRefundDetailCache.set(originalInvoiceNumber, detail);
            return detail;
        } catch (e) {
            console.warn('[KPI Tab] Fetch refund detail failed:', e?.message);
            this._reconRefundDetailCache.set(originalInvoiceNumber, null);
            return null;
        }
    },

    /**
     * Modal L1: expand row để load + hiển thị chi tiết món trả (cho đơn refunded).
     */
    async _toggleL1OrderDetail(orderId) {
        const tbody = document.getElementById('modalL1TableBody');
        if (!tbody) return;
        const row = tbody.querySelector(`tr[data-l1-order="${orderId}"]`);
        if (!row) return;
        const detail = row.nextElementSibling;
        if (!detail || !detail.classList.contains('l1-detail-row')) return;
        const isOpen = detail.dataset.open === '1';
        detail.dataset.open = isOpen ? '0' : '1';
        detail.style.display = isOpen ? 'none' : '';
        const btn = row.querySelector('.l1-toggle-btn');
        if (btn) btn.classList.toggle('is-open', !isOpen);
        if (!isOpen && detail.dataset.loaded !== '1') {
            // Lazy fetch refund detail
            const recon = this._reconByOrder?.get(orderId);
            const invNumber = recon?.invoiceNumber;
            const contentEl = detail.querySelector('.l1-detail-content');
            if (recon?.isRefunded && invNumber && contentEl) {
                contentEl.innerHTML =
                    '<div class="l1-detail-loading"><i class="fas fa-spinner fa-spin"></i> Đang tải chi tiết refund từ TPOS...</div>';
                const refundDetail = await this._fetchRefundDetailForInvoice(invNumber);
                if (!refundDetail || refundDetail.refunds.length === 0) {
                    contentEl.innerHTML =
                        '<div class="l1-detail-empty">Không tìm thấy chi tiết refund trên TPOS.</div>';
                } else {
                    contentEl.innerHTML = refundDetail.refunds
                        .map((rf) => {
                            const date = rf.DateInvoice
                                ? new Date(rf.DateInvoice).toLocaleString('vi-VN')
                                : '';
                            const reasonHtml = rf.Comment
                                ? `<div class="l1-detail-reason"><strong>Lý do:</strong> ${this.escapeHtml(rf.Comment)}</div>`
                                : '<div class="l1-detail-reason l1-detail-reason-empty">Không có lý do.</div>';
                            const itemsHtml = rf.OrderLines.length
                                ? `<table class="l1-detail-items"><thead><tr><th>SP</th><th>SL</th><th>Giá</th><th>Ghi chú</th></tr></thead><tbody>${rf.OrderLines.map(
                                      (l) =>
                                          `<tr><td>${this.escapeHtml(l.ProductName || '—')}</td><td>${l.Quantity}</td><td>${(l.Price || 0).toLocaleString('vi-VN')}đ</td><td>${this.escapeHtml(l.Note || '')}</td></tr>`
                                  ).join('')}</tbody></table>`
                                : '<div class="l1-detail-empty">Không có dòng sản phẩm trong refund.</div>';
                            return `<div class="l1-detail-refund">
                                <div class="l1-detail-header">
                                    <span class="l1-detail-tag">↩ ${this.escapeHtml(rf.Number)}</span>
                                    <span class="l1-detail-date">${this.escapeHtml(date)}</span>
                                    <span class="l1-detail-amount">${(rf.AmountTotal || 0).toLocaleString('vi-VN')}đ</span>
                                </div>
                                ${reasonHtml}
                                <div class="l1-detail-items-title">Món trả:</div>
                                ${itemsHtml}
                            </div>`;
                        })
                        .join('');
                }
            } else if (contentEl) {
                contentEl.innerHTML =
                    '<div class="l1-detail-empty">Đơn này không có refund. Click order link để xem chi tiết KPI items.</div>';
            }
            detail.dataset.loaded = '1';
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    },

    _renderReconciliationUI(results, refundInfo) {
        const refundedCount = results.filter((r) => r.isRefunded).length;
        const otherDiscrepancies = results.filter((r) => r.hasDiscrepancy && !r.isRefunded).length;
        const okCount = results.length - refundedCount - otherDiscrepancies;

        // PER-PRODUCT: tổng KPI bị loại = Σ refundedKpiAmount (chỉ phần món hoàn),
        // KHÔNG phải kpiAmount cả đơn. Cap mỗi đơn ≤ KPI đã earn (r.kpiAmount):
        // đơn gốc KPI=0 (chưa từng +KPI) → loại 0, tránh trừ nhầm.
        const refundedKpiAmount = results.reduce(
            (sum, r) => sum + Math.min(r.refundedKpiAmount || 0, r.kpiAmount || 0),
            0
        );

        // Show stats cards + animate count
        const statsEl = document.getElementById('reconStatsCards');
        if (statsEl) statsEl.style.display = '';
        this._animateCount(document.getElementById('reconStatTotal'), results.length);
        this._animateCount(document.getElementById('reconStatOk'), okCount);
        this._animateCount(document.getElementById('reconStatRefunded'), refundedCount);
        this._animateCount(document.getElementById('reconStatDiscrepancy'), otherDiscrepancies);
        const refundSubEl = document.getElementById('reconStatRefundedSub');
        if (refundSubEl) {
            refundSubEl.textContent = refundedKpiAmount
                ? `Loại bỏ KPI: ${this._formatVnd(refundedKpiAmount)}`
                : '0 ₫ KPI bị loại';
        }

        // Show control bar + chip counts
        const ctrlEl = document.getElementById('reconControlBar');
        if (ctrlEl) ctrlEl.style.display = '';
        const setChip = (id, n) => {
            const el = document.getElementById(id);
            if (el) el.textContent = n.toLocaleString('vi-VN');
        };
        setChip('chipCountAll', results.length);
        setChip('chipCountOk', okCount);
        setChip('chipCountRefunded', refundedCount);
        setChip('chipCountDiscrepancy', otherDiscrepancies);
        const metaEl = document.getElementById('reconMetaInfo');
        if (metaEl) {
            metaEl.textContent = `Refund excel: ${refundInfo.totalRows} dòng · ${refundInfo.codes.size} mã đơn unique · check 3 tháng`;
        }

        // Render table
        this.showEl('reconResultsWrapper');
        this.hideEl('reconEmpty');
        // Remove old summary nếu có
        const oldSummary = document.getElementById('reconSummary');
        if (oldSummary) oldSummary.remove();
        this.renderReconciliationResults(results);

        // Bind chips/sort/cards (idempotent)
        this._bindReconChips();
        this._bindReconSort();

        // Default filter: highlight refunded + discrepancy first
        if (refundedCount > 0 || otherDiscrepancies > 0) {
            this._reconFilter = 'refunded';
            if (refundedCount === 0) this._reconFilter = 'discrepancy';
        } else {
            this._reconFilter = 'all';
        }
        document
            .querySelectorAll('.recon-chip')
            .forEach((c) =>
                c.classList.toggle('is-active', c.dataset.filter === this._reconFilter)
            );
        document
            .querySelectorAll('.recon-stat-card')
            .forEach((c) =>
                c.classList.toggle('is-active', c.dataset.filter === this._reconFilter)
            );
        this._applyReconFilter();

        // Re-init lucide icons cho elements mới
        if (window.lucide?.createIcons) {
            window.lucide.createIcons();
        }
    },

    renderReconciliationResults(results) {
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;

        let html = '';
        results.forEach((r, idx) => {
            const deltaNum = typeof r.actualNet === 'number' ? r.actualNet - r.expectedNet : null;
            let deltaClass = 'delta-zero';
            if (deltaNum != null) {
                if (deltaNum > 0) deltaClass = 'delta-positive';
                else if (deltaNum < 0) deltaClass = 'delta-negative';
            }

            const hasKpiLoss = (r.refundedKpiAmount || 0) > 0;
            const status = r.isRefunded ? 'refunded' : r.hasDiscrepancy ? 'discrepancy' : 'ok';

            let statusHtml;
            if (hasKpiLoss) {
                statusHtml =
                    '<span class="status-badge status-refunded">↩ Đã hoàn (loại KPI)</span>';
            } else if (r.isRefunded) {
                statusHtml =
                    '<span class="status-badge status-refunded-nokpi" title="Đơn có phiếu hoàn nhưng món hoàn không nằm trong SP tính KPI → không trừ KPI">↩ Có hoàn · 0đ</span>';
            } else if (r.hasDiscrepancy) {
                statusHtml = '<span class="status-badge status-discrepancy">⚠ Sai lệch</span>';
            } else {
                statusHtml = '<span class="status-badge status-ok">✅ OK</span>';
            }

            const invId = this._invoiceCache?.get(r.orderId)?.Id;
            const invHtml = r.invoiceNumber
                ? `<a class="recon-invoice-num is-link" href="javascript:void(0)" onclick="event.stopPropagation();window.KPICommission.showInvoiceDetail('${invId || ''}', '${this.escapeHtml(r.invoiceNumber)}')" title="Xem chi tiết phiếu ${this.escapeHtml(r.invoiceNumber)}">${this.escapeHtml(r.invoiceNumber)}</a>${r.invoiceState ? ` <span style="font-size:11px;color:#6b7280;">${this.escapeHtml(r.invoiceState)}</span>` : ''}`
                : '<span class="recon-invoice-num is-empty">— chưa có invoice</span>';

            const hasDetail = (r.discrepancies || []).length > 0;
            const toggleBtn = hasDetail
                ? `<button class="recon-toggle-btn" onclick="window.KPICommission._toggleReconDetail('${this.escapeHtml(r.orderId)}')" title="Xem chi tiết"><i data-lucide="chevron-right"></i></button>`
                : '';

            const refundedClass = hasKpiLoss
                ? 'is-refunded'
                : r.isRefunded
                  ? 'is-refunded is-refunded-nokpi'
                  : '';
            const animDelay = Math.min(idx * 12, 600); // stagger fade-in

            html += `<tr class="${refundedClass}" data-recon-row="1" data-recon-status="${status}" data-order-id="${this.escapeHtml(r.orderId)}" data-sort_orderCode="${this.escapeHtml(r.orderCode || '')}" data-sort_stt="${r.stt != null ? r.stt : ''}" data-sort_expectedNet="${r.expectedNet}" data-sort_actualNet="${typeof r.actualNet === 'number' ? r.actualNet : ''}" data-sort_delta="${deltaNum != null ? deltaNum : ''}" style="animation-delay:${animDelay}ms;">
                <td>${toggleBtn}</td>
                <td class="recon-cell-code"><strong>${this.escapeHtml(r.orderCode || r.orderId)}</strong></td>
                <td>${invHtml}</td>
                <td class="recon-cell-num">${r.stt != null ? r.stt : '—'}</td>
                <td class="recon-cell-num">${(r.expectedNet || 0).toLocaleString('vi-VN')}</td>
                <td class="recon-cell-num">${typeof r.actualNet === 'number' ? r.actualNet.toLocaleString('vi-VN') : this.escapeHtml(String(r.actualNet))}</td>
                <td class="recon-cell-num ${deltaClass}">${deltaNum != null ? (deltaNum >= 0 ? '+' : '') + deltaNum.toLocaleString('vi-VN') : '—'}</td>
                <td>${statusHtml}</td>
            </tr>`;

            if (hasDetail) {
                const tagMap = {
                    refunded: 'tag-refund',
                    error: 'tag-error',
                    discrepancy: 'tag-discrepancy',
                    productMissing: 'tag-discrepancy',
                    quantityMismatch: 'tag-discrepancy',
                    statusMismatch: 'tag-discrepancy',
                };
                const detailItems = r.discrepancies
                    .map((d) => {
                        const tagClass = tagMap[d.type] || 'tag-discrepancy';
                        return `<li><span class="recon-detail-tag ${tagClass}">${this.escapeHtml(d.type)}</span> ${this.escapeHtml(d.message || '')}</li>`;
                    })
                    .join('');
                html += `<tr class="recon-detail-row" data-open="0" style="display:none;">
                    <td colspan="8">
                        <div class="recon-detail-content">
                            <div style="font-weight:600;color:#374151;margin-bottom:6px;">Chi tiết sai lệch / lý do loại:</div>
                            <ul>${detailItems}</ul>
                        </div>
                    </td>
                </tr>`;
            }
        });

        tbody.innerHTML = html;
    },

    // ========================================
    // EXPORT EXCEL (12.15)
    // ========================================
    async exportExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                alert('Thư viện XLSX chưa được tải. Vui lòng thử lại.');
                return;
            }

            const aggregated = await this.aggregateByEmployee(this.state.filteredData);

            if (aggregated.length === 0) {
                alert('Không có dữ liệu để xuất. Hãy áp dụng bộ lọc trước.');
                return;
            }

            // Build data rows
            const rows = [
                ['STT', 'Tên nhân viên', 'Số đơn', 'SP NET', 'Tổng KPI (VNĐ)', 'Phiếu bán hàng'],
            ];

            const fullMode = this.state.displayMode === 'full';
            aggregated.forEach((emp, idx) => {
                // Build invoice status summary text for Excel
                let invoiceSummary = '';
                const counts = {};
                let noInvoice = 0;
                for (const order of emp.orders) {
                    const inv = this._invoiceCache.get(order.orderId);
                    if (!inv) {
                        noInvoice++;
                        continue;
                    }
                    const state = inv.ShowState || 'Không rõ';
                    counts[state] = (counts[state] || 0) + 1;
                }
                const parts = [];
                for (const [state, count] of Object.entries(counts)) {
                    parts.push(`${count} ${state}`);
                }
                if (noInvoice > 0) parts.push(`${noInvoice} Chưa có`);
                invoiceSummary = parts.join(', ');

                // Đếm đơn CÙNG TIÊU CHÍ với bảng (renderKPITable): bỏ stale +
                // chờ-phiếu; full mode đếm cả đơn KPI=0.
                const orderCount = emp.orders.filter((o) => {
                    if (o._stale) return false;
                    if (o._kpiPending) return false;
                    if (fullMode) return true;
                    return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
                }).length;

                rows.push([
                    idx + 1,
                    emp.resolvedName || emp.userName || emp.userId,
                    orderCount,
                    emp.totalNetProducts,
                    emp.totalKPI,
                    invoiceSummary || '−',
                ]);
            });

            // Create workbook
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Set column widths
            ws['!cols'] = [
                { wch: 6 }, // STT
                { wch: 25 }, // Tên NV
                { wch: 10 }, // Số đơn
                { wch: 10 }, // SP NET
                { wch: 18 }, // Tổng KPI
                { wch: 30 }, // Phiếu bán hàng
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'KPI Report');

            // Generate filename with date
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const fileName = `KPI_Report_${dateStr}.xlsx`;

            XLSX.writeFile(wb, fileName);
        } catch (error) {
            console.error('[KPI Tab] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        }
    },

    // ========================================
    // RECOMPUTE ALL KPI (backfill — áp logic mới cho data cũ)
    // Lấy mọi orderCode đã xuất hiện trong kpi_statistics (theo dateFrom/dateTo filter
    // đang chọn, hoặc toàn bộ nếu chưa chọn), chạy lại calculateNetKPI để áp logic
    // detect biến thể mới, rồi save lại statistics.
    // ========================================
    async recomputeAllKPI() {
        if (!window.kpiManager || !window.kpiManager.recalculateAndSaveKPI) {
            alert('KPI manager chưa sẵn sàng.');
            return;
        }

        const btn = document.getElementById('btnRecomputeAllKPI');
        const dateFrom = (document.getElementById('kpiFilterDateFrom') || {}).value || '';
        const dateTo = (document.getElementById('kpiFilterDateTo') || {}).value || '';

        const rangeText =
            dateFrom || dateTo
                ? `từ ${dateFrom || '—'} đến ${dateTo || '—'}`
                : 'TOÀN BỘ data (không có filter ngày)';
        if (
            !confirm(
                `Tính lại KPI ${rangeText}?\n\nHành động này:\n• Chạy calculateNetKPI cho từng đơn\n• Lưu đè lên kpi_statistics hiện tại\n• Có thể mất vài phút tùy số đơn\n\nTiếp tục?`
            )
        )
            return;

        const originalHTML = btn ? btn.innerHTML : '';
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader-2"></i> Đang tính…';
            this.reinitIcons();
        }

        try {
            // 1) Lấy danh sách orderCode cần tính lại.
            //    PHẢI lấy từ kpi_base (source of truth của đơn có BASE) — không phải
            //    kpi_statistics (chỉ chứa đơn ĐÃ CÓ KPI > 0 hoặc đã được save).
            //    Trước đây source từ kpi_statistics → đơn có BASE nhưng chưa tick SP
            //    nào (KPI=0) bị bỏ qua → không migrate được.
            //    Dùng endpoint /kpi-base/list-meta có support filter date/campaign.
            const campaign = this.state.filters.campaign || '';
            const qs = new URLSearchParams();
            if (dateFrom) qs.append('dateFrom', dateFrom);
            if (dateTo) qs.append('dateTo', dateTo);
            if (campaign) qs.append('campaign', campaign);
            const basesRes = await window.kpiManager.kpiAPI(
                'GET',
                `/kpi-base/list-meta${qs.toString() ? '?' + qs.toString() : ''}`
            );
            const bases = (basesRes && basesRes.bases) || [];

            const orderCodes = new Set();
            for (const b of bases) {
                if (b && b.orderCode) orderCodes.add(b.orderCode);
            }

            const total = orderCodes.size;
            if (total === 0) {
                alert('Không có đơn nào trong khoảng đã chọn.');
                return;
            }

            console.log(`[KPI Recompute] Bắt đầu tính lại ${total} đơn (parallel=20)...`);

            const CONCURRENCY = 20;
            const queue = Array.from(orderCodes);
            let done = 0;
            let failed = 0;

            const updateProgress = () => {
                if (!btn) return;
                btn.innerHTML = `<i data-lucide="loader-2"></i> ${done}/${total}…`;
                this.reinitIcons();
            };

            // Worker pool: mỗi worker pull 1 orderCode từ queue rồi recompute.
            // KHÔNG gọi DELETE /kpi-statistics/order riêng ở đây nữa —
            // recalculateAndSaveKPI ĐÃ tự wipe orderCode khỏi mọi (userId, stat_date)
            // row trước khi ghi lại (kpi-manager.js). Gọi thêm = double request/đơn.
            const worker = async () => {
                while (queue.length > 0) {
                    const orderCode = queue.shift();
                    if (!orderCode) break;
                    try {
                        await window.kpiManager.recalculateAndSaveKPI(orderCode);
                    } catch (e) {
                        failed++;
                        console.warn(`[KPI Recompute] Fail ${orderCode}:`, e?.message || e);
                    }
                    done++;
                    if (done % 10 === 0 || done === total) updateProgress();
                }
            };

            const workers = Array.from({ length: Math.min(CONCURRENCY, total) }, () => worker());
            await Promise.all(workers);

            console.log(`[KPI Recompute] Xong: ${done - failed}/${total} đơn, fail ${failed}`);
            alert(
                `Hoàn tất: ${done - failed}/${total} đơn.\nFailed: ${failed}\n\nĐang refresh bảng…`
            );
            await this.refreshData();
        } catch (e) {
            console.error('[KPI Recompute] error:', e);
            alert('Lỗi khi tính lại KPI: ' + (e?.message || e));
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalHTML;
                this.reinitIcons();
            }
        }
    },

    // ========================================
    // REFRESH DATA (12.16)
    // ========================================
    async refreshData() {
        this.showEl('kpiTableLoading');
        this.hideEl('kpiTableEmpty');
        this.hideEl('kpiTableWrapper');

        // Reset summary cards
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        setVal('totalEmployees', '0');
        setVal('totalOrdersWithBase', '0');
        setVal('totalNetProducts', '0');
        setVal('totalKPIAmount', '0đ');

        // Clear name cache to force re-resolution
        this.state.employeeNameCache = {};

        // Refresh invoice cache: trạng thái phiếu (Chờ phiếu / Nháp / Hủy) đổi
        // liên tục trên TPOS — giữ cache cũ làm đơn kẹt "Chờ phiếu" (không cộng
        // KPI) dù phiếu đã xác nhận, phải F5 cả trang mới hết.
        this._invoiceCacheLoaded = false;

        try {
            await Promise.all([this.loadAllStatistics(), this.loadInvoiceStatusData()]);
            await this.applyFilters();
            this.reinitIcons();
            // Nền: fetch + lưu snapshot SP cuối thật cho đơn ĐANG HIỂN THỊ chưa có
            // (đơn nào có rồi bỏ qua). Không await → bảng hiện ngay. Đơn nào VỪA có
            // snapshot lần đầu (vd phiếu mới xuất sau lần thao tác cuối) được recalc
            // luôn trong sweep → reload số mới silent. User KHÔNG cần bấm "Tính lại
            // toàn bộ KPI" cho case này nữa.
            this._ensureSnapshotsForVisibleOrders()
                .then(async (reconciledCount) => {
                    if (reconciledCount > 0) {
                        await this.loadAllStatistics();
                        await this.applyFilters();
                    }
                })
                .catch((e) => console.warn('[KPI Tab] snapshot sweep failed:', e?.message));
        } catch (error) {
            console.error('[KPI Tab] Refresh error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        }
    },

    // Fetch + lưu snapshot SP cuối thật (TPOS) cho các đơn đang hiển thị mà CHƯA có
    // snapshot. "Có rồi bỏ qua" (getMissingFinalSnapshots). Worker pool, non-fatal.
    // Đơn VỪA có snapshot lần đầu → recalc luôn (số đã lưu trước đó là audit-replay
    // vì lúc nhân viên thao tác phiếu chưa xuất; TPOS không bắn event khi xuất phiếu
    // nên không gì tự re-trigger). Trả về số đơn đã recalc để caller reload bảng.
    async _ensureSnapshotsForVisibleOrders() {
        if (!window.kpiManager?.ensureKpiFinalSnapshot) return 0;
        const map = new Map(); // orderCode -> orderId
        for (const emp of this.state.filteredData || []) {
            for (const o of emp.orders || []) {
                if (o.orderCode && !map.has(o.orderCode)) map.set(o.orderCode, o.orderId || null);
            }
        }
        if (map.size === 0) return 0;

        let missing;
        try {
            missing = await window.kpiManager.getMissingFinalSnapshots([...map.keys()]);
        } catch (e) {
            return 0;
        }
        // KHÔNG lọc theo orderId: nguồn "đơn thật" hiện là PHIẾU BÁN HÀNG
        // (KPI_FINAL_SOURCE='invoice' → fetchInvoiceLinesFromTPOS dùng orderCode, KHÔNG
        // cần orderId). Lọc orderId làm rơi đơn fetch được → kẹt "Chưa có snapshot".
        // orderId vẫn truyền (null OK) để lưu kèm + phòng khi đổi nguồn sang saleonline.
        const todo = [...missing].map((code) => ({ code, orderId: map.get(code) || null }));
        if (todo.length === 0) return 0;

        console.log(`[KPI Tab] Snapshot sweep: ${todo.length} đơn thiếu — đang fetch TPOS…`);
        const CONC = 6;
        let i = 0,
            ok = 0,
            recalced = 0;
        const worker = async () => {
            while (i < todo.length) {
                const item = todo[i++];
                try {
                    const r = await window.kpiManager.ensureKpiFinalSnapshot(
                        item.code,
                        item.orderId
                    );
                    if (r) {
                        ok++;
                        // Snapshot MỚI (đơn này nằm trong danh sách "missing") →
                        // statistics đang giữ số audit-replay → recalc để chuyển
                        // sang NET = đơn thật − BASE.
                        if (window.kpiManager.recalculateAndSaveKPI) {
                            await window.kpiManager.recalculateAndSaveKPI(item.code);
                            recalced++;
                        }
                    }
                } catch (e) {}
            }
        };
        await Promise.all(Array.from({ length: Math.min(CONC, todo.length) }, worker));
        console.log(
            `[KPI Tab] Snapshot sweep xong: ${ok}/${todo.length} snapshot mới, recalc ${recalced} đơn.`
        );
        return recalced;
    },
};

// ========================================
// WAIT FOR FIREBASE SDK
// ========================================
function waitForFirebase(timeout, interval) {
    timeout = timeout || 15000;
    interval = interval || 100;
    return new Promise(function (resolve, reject) {
        if (window.firebase && window.firebase.firestore) {
            return resolve();
        }
        var elapsed = 0;
        var timer = setInterval(function () {
            elapsed += interval;
            if (window.firebase && window.firebase.firestore) {
                clearInterval(timer);
                return resolve();
            }
            if (elapsed >= timeout) {
                clearInterval(timer);
                return reject(new Error('Firebase SDK load timeout after ' + timeout + 'ms'));
            }
        }, interval);
    });
}

// ========================================
// AUTO-INIT on DOMContentLoaded
// ========================================
document.addEventListener('DOMContentLoaded', function () {
    waitForFirebase(15000, 100)
        .then(function () {
            KPICommission.init();
        })
        .catch(function (err) {
            console.error('[KPI Tab] Firebase init failed:', err);
            KPICommission.hideEl('kpiTableLoading');
            var emptyEl = document.getElementById('kpiTableEmpty');
            if (emptyEl) {
                emptyEl.style.display = '';
                var msgEl = emptyEl.querySelector('p');
                if (msgEl) {
                    msgEl.textContent = 'Không thể kết nối Firebase. Vui lòng tải lại trang.';
                }
            }
        });
});

// Expose to window — `const KPICommission` không tự attach cho iframe parent / debug
try {
    window.KPICommission = KPICommission;
} catch (e) {}
