// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Commission Tab - Tab "KPI - HOA HỒNG"
 * Quản lý và hiển thị KPI upselling sản phẩm
 *
 * Runs inside iframe (tab-kpi-commission.html)
 * Uses namespace pattern to avoid conflicts
 * Firebase initialized via firebase-config.js in HTML
 *
 * Firestore Collections:
 * - kpi_statistics/{userId}/dates/{date}
 * - kpi_audit_log/{auto-id}
 * - kpi_base/{orderId}
 * - report_order_details/{campaignName}
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
            status: '',
        },
        statsData: [], // Raw kpi_statistics data [{userId, userName, dates: {...}}]
        filteredData: [], // Filtered + aggregated data for display
        currentEmployeeOrders: [], // Orders for Modal L1
        currentOrderId: null, // Current order in Modal L2
        currentEmployeeUserId: null,
        isLoading: false,
        employeeNameCache: {}, // Cache for resolved employee names (Bug #4 fix)
        // 'simple' = chỉ hiển thị đơn/user có KPI > 0 (default, hành vi cũ).
        // 'full'   = hiển thị TẤT CẢ đơn gồm cả đơn chưa tick KPI (KPI = 0).
        // Persist localStorage per-user để giữ giữa session.
        displayMode: (() => {
            try { return localStorage.getItem('kpiDisplayMode') || 'simple'; }
            catch (e) { return 'simple'; }
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
    async init() {
        try {
            this.state.isLoading = true;
            this.showEl('kpiTableLoading');
            this.hideEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');

            // Load invoice status + KPI stats in parallel from Render API
            await Promise.all([this.loadInvoiceStatusData(), this.loadAllStatistics()]);
            // Derive filters from loaded data
            await this.loadCampaignOptions();
            await this.loadEmployeeOptions();

            // Auto-select campaign from parent window's active campaign
            this.syncCampaignFromParent();

            // Sync nút toggle mode với state đã khôi phục từ localStorage
            this.updateDisplayModeLabel();

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

        // Derive campaigns from loaded statsData
        const campaigns = new Set();
        for (const stat of this.state.statsData) {
            for (const dateData of Object.values(stat.dates || {})) {
                for (const order of dateData.orders || []) {
                    if (order.campaignName) campaigns.add(order.campaignName);
                }
            }
        }

        [...campaigns].sort().forEach((name) => {
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
     *   - 'simple' (default): ẩn đơn/user có KPI = 0 (chỉ xem KPI có giá trị).
     *   - 'full': hiển thị TẤT CẢ đơn kể cả chưa tick — giúp sale review lại SP nào chưa được đánh dấu.
     * Persist localStorage, re-apply filters sau khi đổi.
     */
    toggleDisplayMode() {
        const next = this.state.displayMode === 'simple' ? 'full' : 'simple';
        this.state.displayMode = next;
        try { localStorage.setItem('kpiDisplayMode', next); } catch (e) {}
        this.updateDisplayModeLabel();
        // Re-apply filter + render với mode mới
        this.applyFilters();
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
        // Read filter values
        this.state.filters.campaign =
            (document.getElementById('kpiFilterCampaign') || {}).value || '';
        this.state.filters.employee =
            (document.getElementById('kpiFilterEmployee') || {}).value || '';
        this.state.filters.dateFrom =
            (document.getElementById('kpiFilterDateFrom') || {}).value || '';
        this.state.filters.dateTo = (document.getElementById('kpiFilterDateTo') || {}).value || '';
        this.state.filters.status = (document.getElementById('kpiFilterStatus') || {}).value || '';

        const { campaign, employee, dateFrom, dateTo, status } = this.state.filters;

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

                    // Filter by status
                    if (status === 'ok' && order.hasDiscrepancy) continue;
                    if (status === 'discrepancy' && !order.hasDiscrepancy) continue;

                    employeeOrders.push({
                        ...order,
                        date: dateKey,
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

        // FULL MODE: bổ sung đơn có BASE nhưng chưa có entry trong kpi_statistics
        // (KPI = 0 do sale chưa tick SP nào). Fetch kpi_base metadata và merge vào.
        if (this.state.displayMode === 'full') {
            try {
                await this.mergeBaseOnlyOrders(filtered);
            } catch (e) {
                console.warn('[KPI Tab] mergeBaseOnlyOrders failed:', e?.message);
            }
        }

        this.state.filteredData = filtered;

        // Update UI
        this.updateSummaryCards(filtered);
        await this.renderKPITable(filtered);
    },

    /**
     * Fetch kpi_base metadata qua REST endpoint /kpi-base/list-meta + merge
     * những đơn chưa có entry trong kpi_statistics vào mảng filtered (full mode).
     *
     * Mutates `filtered` in-place:
     *   - đơn đã có trong statsData → skip (giữ dữ liệu KPI thật)
     *   - đơn có BASE chưa có trong statsData → thêm synthetic order (kpi=0, netProducts=0)
     *   - user không có trong filtered nhưng có BASE → thêm user mới với orders synthetic
     */
    async mergeBaseOnlyOrders(filtered) {
        const KPI_API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';
        const { campaign, employee, dateFrom, dateTo } = this.state.filters;

        const qs = new URLSearchParams();
        if (dateFrom) qs.append('dateFrom', dateFrom);
        if (dateTo) qs.append('dateTo', dateTo);
        if (campaign) qs.append('campaign', campaign);
        const url = `${KPI_API}/kpi-base/list-meta${qs.toString() ? '?' + qs.toString() : ''}`;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const bases = data.bases || [];

        // Index filtered by userId + orderCode set để check nhanh
        const byUser = new Map();
        for (const emp of filtered) {
            const orderCodes = new Set(emp.orders.map((o) => o.orderCode));
            byUser.set(emp.userId, { emp, orderCodes });
        }

        for (const b of bases) {
            // Respect employee filter (đã filter qua campaign + date ở backend).
            if (employee && b.userId !== employee) continue;

            const synthetic = {
                orderCode: b.orderCode,
                orderId: b.orderId,
                stt: b.stt,
                campaignName: b.campaignName,
                netProducts: 0,
                kpi: 0,
                hasDiscrepancy: false,
                details: {},
                date: b.createdAt
                    ? new Date(b.createdAt).toISOString().substring(0, 10)
                    : '',
                _fromBaseOnly: true,
            };

            const entry = byUser.get(b.userId);
            if (!entry) {
                // User chưa có trong filtered → thêm mới
                const newEmp = {
                    userId: b.userId,
                    userName: b.userName || b.userId,
                    orders: [synthetic],
                };
                filtered.push(newEmp);
                byUser.set(b.userId, {
                    emp: newEmp,
                    orderCodes: new Set([b.orderCode]),
                });
            } else if (!entry.orderCodes.has(b.orderCode)) {
                // User đã có nhưng chưa có đơn này → append synthetic
                entry.emp.orders.push(synthetic);
                entry.orderCodes.add(b.orderCode);
            }
            // else: đơn đã có KPI thật trong statsData → không override
        }
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
    // RENDER KPI TABLE (12.6)
    // ========================================
    async renderKPITable(filteredData) {
        this.hideEl('kpiTableLoading');

        if (!filteredData || filteredData.length === 0) {
            this.showEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');
            return;
        }

        this.hideEl('kpiTableEmpty');
        this.showEl('kpiTableWrapper');

        const aggregated = await this.aggregateByEmployee(filteredData);
        const tbody = document.getElementById('kpiTableBody');
        if (!tbody) return;

        const fullMode = this.state.displayMode === 'full';
        let html = '';
        aggregated.forEach((emp, idx) => {
            const invoiceSummaryHtml = this.renderKPIInvoiceStatusSummary(emp.orders);

            // "SỐ ĐƠN" column:
            //   Simple mode → chỉ đếm đơn có KPI > 0 (hành vi cũ).
            //   Full mode   → đếm TẤT CẢ đơn không stale (bao gồm đơn KPI = 0).
            const orderCount = emp.orders.filter((o) => {
                if (o._stale) return false;
                if (fullMode) return true;
                return (o.netProducts || 0) > 0 || (o.kpi || 0) > 0;
            }).length;

            html += `<tr>
                <td>${idx + 1}</td>
                <td><a class="employee-link" onclick="KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')">${this.escapeHtml(emp.resolvedName)}</a></td>
                <td>${orderCount}</td>
                <td>${emp.totalNetProducts}</td>
                <td>${this.formatCurrency(emp.totalKPI)}</td>
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
        // filteredData is already grouped by employee from applyFilters
        const results = [];
        for (const emp of filteredData) {
            let totalNetProducts = 0;
            let totalKPI = 0;

            for (const order of emp.orders) {
                totalNetProducts += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }

            // Resolve employee name (Bug #4 fix - never show raw userId)
            const resolvedName = await this.resolveEmployeeName(emp.userId);

            results.push({
                userId: emp.userId,
                userName: emp.userName || emp.userId,
                resolvedName,
                orders: emp.orders,
                totalNetProducts,
                totalKPI,
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

        // Set header - use resolved name (Bug #4 fix)
        const nameEl = document.getElementById('modalL1EmployeeName');
        if (nameEl) {
            const resolvedName = await this.resolveEmployeeName(userId);
            nameEl.textContent = resolvedName;
        }

        // Reset filters
        const statusFilter = document.getElementById('modalL1FilterStatus');
        if (statusFilter) statusFilter.value = '';
        const searchInput = document.getElementById('modalL1Search');
        if (searchInput) searchInput.value = '';

        // Render table
        this.renderEmployeeOrdersTable(this.state.currentEmployeeOrders);

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

        let html = '';
        orders.forEach((order) => {
            // Ẩn đơn stale hoặc SP NET = 0 và KPI = 0
            if (order._stale) return;
            if ((order.netProducts || 0) <= 0 && (order.kpi || 0) <= 0) return;

            const invoiceHtml = this.renderKPIInvoiceStatusCell(order.orderId);

            html += `<tr>
                <td>${order.stt != null ? this.escapeHtml(String(order.stt)) : '---'}</td>
                <td><a class="order-link" onclick="KPICommission.showOrderDetails('${this.escapeHtml(order.orderId)}')">${this.escapeHtml(order.orderCode || order.orderId)}</a></td>
                <td>${this.escapeHtml(order.campaignName || '---')}</td>
                <td>${order.netProducts || 0}</td>
                <td>${this.formatCurrency(order.kpi || 0)}</td>
                <td>${invoiceHtml}</td>
            </tr>`;
        });

        // Nếu sau filter không còn đơn nào
        if (!html) {
            this.showEl('modalL1Empty');
            this.hideEl('modalL1TableWrapper');
            return;
        }

        tbody.innerHTML = html;
    },

    closeEmployeeOrders() {
        this.hideEl('modalEmployeeOrders');
        this.state.currentEmployeeUserId = null;
        this.state.currentEmployeeOrders = [];
    },

    // ========================================
    // MODAL L2: SHOW ORDER DETAILS (12.9)
    // ========================================
    async showOrderDetails(orderId) {
        if (!orderId) return;

        this.state.currentOrderId = orderId;

        // Set header - show orderCode instead of raw orderId
        const orderIdEl = document.getElementById('modalL2OrderId');
        if (orderIdEl) {
            const order = this.state.currentEmployeeOrders.find((o) => o.orderId === orderId);
            orderIdEl.textContent = order?.orderCode || orderId;
        }

        // Reset to first tab
        this.switchOrderTab('kpi-compare');

        // Show modal
        this.showEl('modalOrderDetails');
        this.reinitIcons();

        // Load first tab data
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
    },

    closeOrderDetails() {
        this.hideEl('modalOrderDetails');
        this.state.currentOrderId = null;
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

            const products = Object.entries(kpiResult.details || {}).map(([pid, data]) => {
                const isSaleChecked = !!(window.KpiSaleFlagStore
                    && window.KpiSaleFlagStore.get(orderCode, pid));
                const excluded = data.excludedBySaleFlag === true;
                const unitKPI = data.unitKPI || this.KPI_PER_PRODUCT;
                // KPI = 0 cho SP bị loại (chưa tick); ngược lại = net * unitKPI.
                // Dùng cờ excluded do calculateNetKPI gán để đồng nhất với logic server-side.
                const kpi = excluded ? 0 : (data.net || 0) * unitKPI;
                return {
                    pid,
                    code: data.code || '',
                    name: data.name || '',
                    added: data.added || 0,
                    removed: data.removed || 0,
                    net: data.net || 0,
                    kpi,
                    excluded,
                    isSaleChecked,
                };
            });

            this.hideEl('kpiCompareLoading');

            if (products.length === 0) {
                this.showEl('kpiCompareEmpty');
                return;
            }

            this.showEl('kpiCompareWrapper');

            // Render table body
            const tbody = document.getElementById('kpiCompareBody');
            const tfoot = document.getElementById('kpiCompareFoot');
            if (!tbody) return;

            let totalAdded = 0,
                totalRemoved = 0,
                totalNet = 0,
                totalKPI = 0;
            let html = '';

            products.forEach((p, idx) => {
                totalAdded += p.added;
                totalRemoved += p.removed;
                totalNet += p.net;
                totalKPI += p.kpi;

                // Row tô xanh nhạt khi thực sự đóng góp KPI (p.kpi > 0).
                // Đồng bộ visual với cột "KPI (VNĐ)": row có tiền → xanh; row 0đ → trắng.
                const rowClass = p.kpi > 0 ? 'kpi-row-checked' : '';

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.escapeHtml(p.code)}</td>
                    <td>${this.escapeHtml(p.name)}</td>
                    <td class="action-add">+${p.added}</td>
                    <td class="action-remove">-${p.removed}</td>
                    <td><strong>${p.net}</strong></td>
                    <td>${this.formatCurrency(p.kpi)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            if (tfoot) {
                tfoot.innerHTML = `<tr>
                    <td colspan="3"><strong>Tổng cộng</strong></td>
                    <td class="action-add"><strong>+${totalAdded}</strong></td>
                    <td class="action-remove"><strong>-${totalRemoved}</strong></td>
                    <td><strong>${totalNet}</strong></td>
                    <td><strong>${this.formatCurrency(totalKPI)}</strong></td>
                </tr>`;
            }

            // Per-user attribution breakdown (audit-based, không phải chủ đơn)
            this.renderPerUserBreakdown(kpiResult);
        } catch (error) {
            console.error('[KPI Tab] Error rendering NET KPI tab:', error);
            this.hideEl('kpiCompareLoading');
            this.showEl('kpiCompareEmpty');
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
                KPI theo nhân viên (dựa trên audit log — người thực sự upsell)
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
    // RUN RECONCILIATION (12.14)
    // ========================================
    async runReconciliation() {
        const btn = document.getElementById('btnRunReconciliation');
        if (btn) btn.disabled = true;

        this.showEl('reconLoading');
        this.hideEl('reconEmpty');
        this.hideEl('reconResultsWrapper');

        try {
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

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

            const results = [];

            // Use kpiManager.reconcileKPI if available
            for (const order of allOrders) {
                try {
                    let result;
                    if (window.kpiManager && window.kpiManager.reconcileKPI) {
                        result = await window.kpiManager.reconcileKPI(
                            order.orderId,
                            order.campaignName,
                            order.orderCode
                        );
                    } else {
                        // Fallback: basic reconciliation
                        result = {
                            orderId: order.orderId,
                            hasDiscrepancy: false,
                            expected: {},
                            actual: {},
                            discrepancies: [],
                        };
                    }

                    results.push({
                        orderId: order.orderId,
                        orderCode: order.orderCode || '',
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet:
                            result.actualNet != null ? result.actualNet : order.netProducts || 0,
                        hasDiscrepancy: result.hasDiscrepancy,
                        discrepancies: result.discrepancies || [],
                    });
                } catch (e) {
                    console.error('[KPI Tab] Reconciliation error for order:', order.orderId, e);
                    results.push({
                        orderCode: order.orderCode || '',
                        orderId: order.orderId,
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet: 'Lỗi',
                        hasDiscrepancy: true,
                        discrepancies: [{ type: 'error', message: e.message }],
                    });
                }
            }

            this.hideEl('reconLoading');

            // Filter to show only discrepancies or all
            const discrepancies = results.filter((r) => r.hasDiscrepancy);

            if (discrepancies.length === 0) {
                this.showEl('reconEmpty');
                const emptyEl = document.getElementById('reconEmpty');
                if (emptyEl)
                    emptyEl.querySelector('p').textContent =
                        `✅ Đã kiểm tra ${results.length} đơn hàng. Không phát hiện sai lệch.`;
            } else {
                this.showEl('reconResultsWrapper');
                this.renderReconciliationResults(results);
            }
        } catch (error) {
            console.error('[KPI Tab] Reconciliation error:', error);
            this.hideEl('reconLoading');
            this.showEl('reconEmpty');
        } finally {
            if (btn) btn.disabled = false;
        }
    },

    renderReconciliationResults(results) {
        const tbody = document.getElementById('reconTableBody');
        if (!tbody) return;

        let html = '';
        results.forEach((r) => {
            const delta = typeof r.actualNet === 'number' ? r.actualNet - r.expectedNet : '---';
            let deltaClass = 'delta-zero';
            if (typeof delta === 'number') {
                if (delta > 0) deltaClass = 'delta-positive';
                else if (delta < 0) deltaClass = 'delta-negative';
            }

            const statusHtml = r.hasDiscrepancy
                ? '<span class="status-badge status-discrepancy">⚠️ Sai lệch</span>'
                : '<span class="status-badge status-ok">✅ OK</span>';

            html += `<tr>
                <td>${this.escapeHtml(r.orderCode || r.orderId)}</td>
                <td>${r.stt != null ? r.stt : '---'}</td>
                <td>${r.expectedNet}</td>
                <td>${r.actualNet}</td>
                <td class="${deltaClass}">${typeof delta === 'number' ? (delta >= 0 ? '+' : '') + delta : delta}</td>
                <td>${statusHtml}</td>
            </tr>`;
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

                rows.push([
                    idx + 1,
                    emp.resolvedName || emp.userName || emp.userId,
                    emp.orders.filter(
                        (o) => !o._stale && ((o.netProducts || 0) > 0 || (o.kpi || 0) > 0)
                    ).length,
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
            // 1) Lấy danh sách orderCode cần tính lại
            const qs = new URLSearchParams();
            if (dateFrom) qs.append('dateFrom', dateFrom);
            if (dateTo) qs.append('dateTo', dateTo);
            const statsRes = await window.kpiManager.kpiAPI(
                'GET',
                `/kpi-statistics${qs.toString() ? '?' + qs.toString() : ''}`
            );
            const statistics = (statsRes && statsRes.statistics) || [];

            const orderCodes = new Set();
            for (const s of statistics) {
                for (const o of s.orders || []) {
                    if (o && o.orderCode) orderCodes.add(o.orderCode);
                }
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

            // Smoke test endpoint cleanup — fail fast nếu Render chưa deploy DELETE route.
            let cleanupAvailable = true;
            try {
                await window.kpiManager.kpiAPI(
                    'DELETE',
                    `/kpi-statistics/order/${encodeURIComponent('__probe_' + Date.now())}`
                );
            } catch (e) {
                const msg = String(e?.message || e);
                if (msg.includes('404')) {
                    cleanupAvailable = false;
                    console.warn(
                        '[KPI Recompute] DELETE /kpi-statistics/order chưa có trên server (404). Render có thể đang deploy — bấm lại sau vài phút.'
                    );
                    alert(
                        '⚠ Server Render chưa có endpoint dọn orphan (chưa deploy xong).\nBackfill vẫn sẽ chạy nhưng các đơn duplicate cũ SẼ KHÔNG ĐƯỢC DỌN.\n\nKhuyến nghị: đợi 2-3 phút cho Render deploy xong rồi bấm lại.'
                    );
                }
                // Non-404 errors: orderCode ngẫu nhiên không match row nào → server trả 200 hoặc lỗi khác — vẫn coi là available.
            }

            // Worker pool: mỗi worker pull 1 orderCode từ queue, cleanup + recompute, repeat.
            let cleanupFailures = 0;
            const worker = async () => {
                while (queue.length > 0) {
                    const orderCode = queue.shift();
                    if (!orderCode) break;
                    try {
                        // (1) Xoá orderCode khỏi mọi (userId, stat_date) row để dẹp orphan
                        //     từ các lần save cũ (sai ngày hoặc sai userId).
                        if (cleanupAvailable) {
                            try {
                                await window.kpiManager.kpiAPI(
                                    'DELETE',
                                    `/kpi-statistics/order/${encodeURIComponent(orderCode)}`
                                );
                            } catch (e) {
                                cleanupFailures++;
                                if (cleanupFailures <= 5) {
                                    console.warn(
                                        `[KPI Recompute] Cleanup fail ${orderCode}:`,
                                        e?.message || e
                                    );
                                }
                            }
                        }
                        // (2) Recompute + save vào đúng (userId, baseDate).
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

            console.log(
                `[KPI Recompute] Xong: ${done - failed}/${total} đơn, fail ${failed}, cleanup fail ${cleanupFailures}`
            );
            const cleanupWarn = !cleanupAvailable
                ? '\n\n⚠ Không dọn được orphan — các đơn duplicate cũ vẫn còn.\nĐợi Render deploy xong rồi bấm lại.'
                : cleanupFailures > 0
                  ? `\n\n⚠ ${cleanupFailures} đơn dọn orphan lỗi (xem console).`
                  : '';
            alert(
                `Hoàn tất: ${done - failed}/${total} đơn.\nFailed: ${failed}${cleanupWarn}\n\nĐang refresh bảng…`
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

        try {
            await this.loadAllStatistics();
            await this.applyFilters();
            this.reinitIcons();
        } catch (error) {
            console.error('[KPI Tab] Refresh error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        }
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
