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
            status: ''
        },
        statsData: [],       // Raw kpi_statistics data [{userId, userName, dates: {...}}]
        filteredData: [],     // Filtered + aggregated data for display
        currentEmployeeOrders: [], // Orders for Modal L1
        currentOrderId: null,      // Current order in Modal L2
        currentEmployeeUserId: null,
        isLoading: false
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
        const pad = n => String(n).padStart(2, '0');
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
    // INIT (12.2)
    // ========================================
    async init() {
        console.log('[KPI Tab] Initializing...');
        try {
            this.state.isLoading = true;
            this.showEl('kpiTableLoading');
            this.hideEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');

            await this.loadCampaignOptions();
            await this.loadEmployeeOptions();
            await this.loadAllStatistics();

            this.applyFilters();
            this.reinitIcons();
            console.log('[KPI Tab] ✓ Initialized');
        } catch (error) {
            console.error('[KPI Tab] Init error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        } finally {
            this.state.isLoading = false;
        }
    },

    // ========================================
    // LOAD DATA FROM FIRESTORE
    // ========================================
    async loadAllStatistics() {
        const db = this.getDb();
        if (!db) return;

        try {
            const usersSnapshot = await db.collection('kpi_statistics').get();
            const allStats = [];

            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                const datesSnapshot = await db
                    .collection('kpi_statistics')
                    .doc(userId)
                    .collection('dates')
                    .get();

                const dates = {};
                for (const dateDoc of datesSnapshot.docs) {
                    dates[dateDoc.id] = dateDoc.data();
                }

                if (Object.keys(dates).length > 0) {
                    // Try to get userName from the first order
                    let userName = userId;
                    for (const dateKey of Object.keys(dates)) {
                        const orders = dates[dateKey].orders || [];
                        if (orders.length > 0) {
                            // We'll resolve names later from kpi_base if needed
                            break;
                        }
                    }

                    allStats.push({ userId, userName, dates });
                }
            }

            this.state.statsData = allStats;
            console.log('[KPI Tab] Loaded statistics for', allStats.length, 'users');
        } catch (error) {
            console.error('[KPI Tab] Error loading statistics:', error);
        }
    },

    // ========================================
    // LOAD CAMPAIGN OPTIONS (12.3)
    // ========================================
    async loadCampaignOptions() {
        const db = this.getDb();
        if (!db) return;

        const select = document.getElementById('kpiFilterCampaign');
        if (!select) return;

        try {
            const snapshot = await db.collection('campaigns').get();
            const campaigns = [];
            snapshot.forEach(doc => {
                const name = doc.data().name;
                if (name) campaigns.push(name);
            });

            campaigns.sort();
            campaigns.forEach(name => {
                const opt = document.createElement('option');
                opt.value = name;
                opt.textContent = name;
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('[KPI Tab] Error loading campaigns:', error);
        }
    },

    // ========================================
    // LOAD EMPLOYEE OPTIONS (12.3)
    // ========================================
    async loadEmployeeOptions() {
        const db = this.getDb();
        if (!db) return;

        const select = document.getElementById('kpiFilterEmployee');
        if (!select) return;

        try {
            // Get employee list from kpi_statistics collection (users who have KPI data)
            const usersSnapshot = await db.collection('kpi_statistics').get();
            const employees = new Map();

            for (const userDoc of usersSnapshot.docs) {
                const userId = userDoc.id;
                // Try to get name from kpi_base entries
                employees.set(userId, userId);
            }

            // Try to resolve names from kpi_base
            try {
                const baseSnapshot = await db.collection('kpi_base').limit(200).get();
                baseSnapshot.forEach(doc => {
                    const data = doc.data();
                    if (data.userId && data.userName) {
                        employees.set(data.userId, data.userName);
                    }
                });
            } catch (e) {
                console.warn('[KPI Tab] Could not resolve employee names from kpi_base:', e);
            }

            // Also update statsData with resolved names
            for (const stat of this.state.statsData) {
                if (employees.has(stat.userId)) {
                    stat.userName = employees.get(stat.userId);
                }
            }

            // Populate dropdown
            const sorted = [...employees.entries()].sort((a, b) => a[1].localeCompare(b[1]));
            sorted.forEach(([id, name]) => {
                const opt = document.createElement('option');
                opt.value = id;
                opt.textContent = name !== id ? `${name} (${id})` : id;
                select.appendChild(opt);
            });
        } catch (error) {
            console.error('[KPI Tab] Error loading employees:', error);
        }
    },


    // ========================================
    // APPLY FILTERS (12.4)
    // ========================================
    applyFilters() {
        // Read filter values
        this.state.filters.campaign = (document.getElementById('kpiFilterCampaign') || {}).value || '';
        this.state.filters.employee = (document.getElementById('kpiFilterEmployee') || {}).value || '';
        this.state.filters.dateFrom = (document.getElementById('kpiFilterDateFrom') || {}).value || '';
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
                        date: dateKey
                    });
                }
            }

            if (employeeOrders.length > 0) {
                filtered.push({
                    userId: stat.userId,
                    userName: stat.userName || stat.userId,
                    orders: employeeOrders
                });
            }
        }

        this.state.filteredData = filtered;

        // Update UI
        this.updateSummaryCards(filtered);
        this.renderKPITable(filtered);
    },

    // ========================================
    // UPDATE SUMMARY CARDS (12.5)
    // ========================================
    updateSummaryCards(filteredData) {
        let totalEmployees = filteredData.length;
        let totalOrders = 0;
        let totalNet = 0;
        let totalKPI = 0;

        for (const emp of filteredData) {
            totalOrders += emp.orders.length;
            for (const order of emp.orders) {
                totalNet += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }
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
    // RENDER KPI TABLE (12.6)
    // ========================================
    renderKPITable(filteredData) {
        this.hideEl('kpiTableLoading');

        if (!filteredData || filteredData.length === 0) {
            this.showEl('kpiTableEmpty');
            this.hideEl('kpiTableWrapper');
            return;
        }

        this.hideEl('kpiTableEmpty');
        this.showEl('kpiTableWrapper');

        const aggregated = this.aggregateByEmployee(filteredData);
        const tbody = document.getElementById('kpiTableBody');
        if (!tbody) return;

        let html = '';
        aggregated.forEach((emp, idx) => {
            const hasDisc = emp.orders.some(o => o.hasDiscrepancy);
            const statusHtml = hasDisc
                ? '<span class="status-badge status-discrepancy">⚠️ Cần đối soát</span>'
                : '<span class="status-badge status-ok">✅ OK</span>';

            html += `<tr>
                <td>${idx + 1}</td>
                <td><a class="employee-link" onclick="KPICommission.showEmployeeOrders('${this.escapeHtml(emp.userId)}')">${this.escapeHtml(emp.userName)}</a></td>
                <td>${emp.orders.length}</td>
                <td>${emp.totalNetProducts}</td>
                <td>${this.formatCurrency(emp.totalKPI)}</td>
                <td>${statusHtml}</td>
            </tr>`;
        });

        tbody.innerHTML = html;
        this.reinitIcons();
    },

    // ========================================
    // AGGREGATE BY EMPLOYEE (12.7)
    // ========================================
    aggregateByEmployee(filteredData) {
        // filteredData is already grouped by employee from applyFilters
        return filteredData.map(emp => {
            let totalNetProducts = 0;
            let totalKPI = 0;

            for (const order of emp.orders) {
                totalNetProducts += order.netProducts || 0;
                totalKPI += order.kpi || 0;
            }

            return {
                userId: emp.userId,
                userName: emp.userName || emp.userId,
                orders: emp.orders,
                totalNetProducts,
                totalKPI
            };
        }).sort((a, b) => b.totalKPI - a.totalKPI); // Sort by KPI descending
    },


    // ========================================
    // MODAL L1: SHOW EMPLOYEE ORDERS (12.8)
    // ========================================
    showEmployeeOrders(userId) {
        const emp = this.state.filteredData.find(e => e.userId === userId);
        if (!emp) {
            console.warn('[KPI Tab] Employee not found:', userId);
            return;
        }

        this.state.currentEmployeeUserId = userId;
        this.state.currentEmployeeOrders = emp.orders || [];

        // Set header
        const nameEl = document.getElementById('modalL1EmployeeName');
        if (nameEl) nameEl.textContent = emp.userName || userId;

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
        const searchVal = ((document.getElementById('modalL1Search') || {}).value || '').toLowerCase().trim();

        let orders = this.state.currentEmployeeOrders;

        if (statusVal === 'ok') {
            orders = orders.filter(o => !o.hasDiscrepancy);
        } else if (statusVal === 'discrepancy') {
            orders = orders.filter(o => o.hasDiscrepancy);
        }

        if (searchVal) {
            orders = orders.filter(o => {
                const oid = (o.orderId || '').toLowerCase();
                const stt = String(o.stt || '').toLowerCase();
                return oid.includes(searchVal) || stt.includes(searchVal);
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
        orders.forEach(order => {
            const hasDisc = order.hasDiscrepancy;
            const statusHtml = hasDisc
                ? '<span class="status-badge status-discrepancy">⚠️ Cần đối soát</span>'
                : '<span class="status-badge status-ok">✅ OK</span>';

            html += `<tr>
                <td>${this.escapeHtml(String(order.stt || '---'))}</td>
                <td><a class="order-link" onclick="KPICommission.showOrderDetails('${this.escapeHtml(order.orderId)}')">${this.escapeHtml(order.orderId)}</a></td>
                <td>${this.escapeHtml(order.campaignName || '---')}</td>
                <td>${order.netProducts || 0}</td>
                <td>${this.formatCurrency(order.kpi || 0)}</td>
                <td>${statusHtml}</td>
            </tr>`;
        });

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

        // Set header
        const orderIdEl = document.getElementById('modalL2OrderId');
        if (orderIdEl) orderIdEl.textContent = orderId;

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
        document.querySelectorAll('[data-order-tab]').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-order-tab') === tabName);
        });

        // Update tab contents
        const tabMap = {
            'kpi-compare': 'tabKpiCompare',
            'audit-log': 'tabAuditLog',
            'all-products': 'tabAllProducts',
            'base-products': 'tabBaseProducts'
        };

        Object.values(tabMap).forEach(id => {
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
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            // 1. Get BASE
            const baseDoc = await db.collection('kpi_base').doc(orderId).get();
            if (!baseDoc.exists) {
                this.hideEl('kpiCompareLoading');
                this.showEl('kpiCompareEmpty');
                const emptyEl = document.getElementById('kpiCompareEmpty');
                if (emptyEl) emptyEl.querySelector('p').textContent = 'Đơn hàng chưa có BASE snapshot. Không thể tính KPI.';
                return;
            }

            const base = baseDoc.data();
            const baseProductIds = new Set();
            (base.products || []).forEach(p => {
                const pid = p.ProductId || p.productId;
                if (pid) baseProductIds.add(Number(pid));
            });

            // 2. Get audit logs (with fallback if composite index missing)
            let auditLogs = [];
            try {
                const logsSnapshot = await db.collection('kpi_audit_log')
                    .where('orderId', '==', orderId)
                    .orderBy('timestamp', 'asc')
                    .get();
                auditLogs = logsSnapshot.docs.map(doc => doc.data());
            } catch (indexErr) {
                console.warn('[KPI Tab] Composite index query failed, using fallback:', indexErr.message);
                const fallbackSnapshot = await db.collection('kpi_audit_log')
                    .where('orderId', '==', orderId)
                    .get();
                auditLogs = fallbackSnapshot.docs.map(doc => doc.data());
                auditLogs.sort((a, b) => {
                    const tsA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : 0;
                    const tsB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : 0;
                    return tsA - tsB;
                });
            }

            // 3. Filter only NEW products (not in BASE)
            const newProductLogs = auditLogs.filter(log => {
                const pid = Number(log.productId);
                return !baseProductIds.has(pid);
            });

            // 4. Group by productId
            const netPerProduct = {};
            for (const log of newProductLogs) {
                const pid = String(log.productId);
                if (!netPerProduct[pid]) {
                    netPerProduct[pid] = {
                        code: log.productCode || '',
                        name: log.productName || '',
                        added: 0,
                        removed: 0,
                        net: 0
                    };
                }
                if (log.action === 'add') {
                    netPerProduct[pid].added += (log.quantity || 0);
                } else if (log.action === 'remove') {
                    netPerProduct[pid].removed += (log.quantity || 0);
                }
            }

            // 5. Calculate net per product
            const products = Object.entries(netPerProduct).map(([pid, data]) => {
                data.net = Math.max(0, data.added - data.removed);
                data.kpi = data.net * this.KPI_PER_PRODUCT;
                return { pid, ...data };
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

            let totalAdded = 0, totalRemoved = 0, totalNet = 0, totalKPI = 0;
            let html = '';

            products.forEach((p, idx) => {
                totalAdded += p.added;
                totalRemoved += p.removed;
                totalNet += p.net;
                totalKPI += p.kpi;

                html += `<tr>
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

        } catch (error) {
            console.error('[KPI Tab] Error rendering NET KPI tab:', error);
            this.hideEl('kpiCompareLoading');
            this.showEl('kpiCompareEmpty');
        }
    },

    // ========================================
    // RENDER AUDIT LOG TAB (12.11)
    // ========================================
    async renderAuditLogTab(orderId) {
        this.showEl('auditLogLoading');
        this.hideEl('auditLogEmpty');
        this.hideEl('auditLogWrapper');

        try {
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            // Get audit logs (with fallback if composite index missing)
            let auditLogs = [];
            try {
                const logsSnapshot = await db.collection('kpi_audit_log')
                    .where('orderId', '==', orderId)
                    .orderBy('timestamp', 'asc')
                    .get();
                auditLogs = logsSnapshot.docs.map(doc => doc.data());
            } catch (indexErr) {
                console.warn('[KPI Tab] Composite index query failed in audit tab, using fallback:', indexErr.message);
                const fallbackSnapshot = await db.collection('kpi_audit_log')
                    .where('orderId', '==', orderId)
                    .get();
                auditLogs = fallbackSnapshot.docs.map(doc => doc.data());
                auditLogs.sort((a, b) => {
                    const tsA = a.timestamp && a.timestamp.seconds ? a.timestamp.seconds : 0;
                    const tsB = b.timestamp && b.timestamp.seconds ? b.timestamp.seconds : 0;
                    return tsA - tsB;
                });
            }

            this.hideEl('auditLogLoading');

            if (auditLogs.length === 0) {
                this.showEl('auditLogEmpty');
                return;
            }

            this.showEl('auditLogWrapper');

            // Get BASE for summary calculation
            const baseDoc = await db.collection('kpi_base').doc(orderId).get();
            const base = baseDoc.exists ? baseDoc.data() : null;
            const baseProductIds = new Set();
            if (base) {
                (base.products || []).forEach(p => {
                    const pid = p.ProductId || p.productId;
                    if (pid) baseProductIds.add(Number(pid));
                });
            }

            // Non-chat sources for highlighting
            const nonChatSources = ['edit_modal_inline', 'edit_modal_remove', 'edit_modal_quantity', 'sale_modal'];

            // Render table
            const tbody = document.getElementById('auditLogBody');
            if (!tbody) return;

            let html = '';
            auditLogs.forEach((log, idx) => {
                let rowClass = '';
                let extraLabel = '';

                if (log.out_of_range === true) {
                    rowClass = 'audit-row-out-of-range';
                    extraLabel = '<span class="out-of-range-label">Ngoài phạm vi</span>';
                } else if (nonChatSources.includes(log.source)) {
                    rowClass = 'audit-row-non-chat';
                }

                html += `<tr class="${rowClass}">
                    <td>${idx + 1}</td>
                    <td>${this.formatTimestamp(log.timestamp)}</td>
                    <td>${this.escapeHtml(log.userName || log.userId || '---')}${extraLabel}</td>
                    <td><span class="${this.getActionClass(log.action)}">${this.getActionLabel(log.action)}</span></td>
                    <td>${this.escapeHtml(log.productCode || '---')}</td>
                    <td>${this.escapeHtml(log.productName || '---')}</td>
                    <td>${log.quantity || 0}</td>
                    <td>${this.getSourceBadge(log.source)}</td>
                </tr>`;
            });

            tbody.innerHTML = html;

            // Calculate summary (only new products)
            let totalAdded = 0, totalRemoved = 0;
            const newProductNet = {};

            for (const log of auditLogs) {
                const pid = Number(log.productId);
                if (baseProductIds.has(pid)) continue; // Skip base products

                const key = String(log.productId);
                if (!newProductNet[key]) newProductNet[key] = { added: 0, removed: 0 };

                if (log.action === 'add') {
                    newProductNet[key].added += (log.quantity || 0);
                    totalAdded += (log.quantity || 0);
                } else if (log.action === 'remove') {
                    newProductNet[key].removed += (log.quantity || 0);
                    totalRemoved += (log.quantity || 0);
                }
            }

            let totalNet = 0;
            for (const data of Object.values(newProductNet)) {
                totalNet += Math.max(0, data.added - data.removed);
            }
            const totalKPI = totalNet * this.KPI_PER_PRODUCT;

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
            const order = this.state.currentEmployeeOrders.find(o => o.orderId === orderId);
            const campaignName = order ? order.campaignName : null;

            if (campaignName) {
                const safeTableName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                try {
                    const doc = await db.collection('report_order_details').doc(safeTableName).get();
                    if (doc.exists) {
                        const data = doc.data();
                        const orderData = (data.orders || []).find(o =>
                            (o.Id || o.id) === orderId
                        );
                        if (orderData && orderData.Details) {
                            products = orderData.Details.map(d => ({
                                code: d.ProductCode || d.Code || d.DefaultCode || '',
                                name: d.ProductName || d.Name || '',
                                quantity: d.Quantity || 1,
                                price: d.Price || 0
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
            const db = this.getDb();
            if (!db) throw new Error('Firestore not available');

            const doc = await db.collection('kpi_base').doc(orderId).get();

            this.hideEl('baseProductsLoading');

            if (!doc.exists) {
                this.showEl('baseProductsEmpty');
                return;
            }

            const base = doc.data();
            this.showEl('baseProductsContent');

            // Render info
            const infoEl = document.getElementById('baseSnapshotInfo');
            if (infoEl) {
                const mergeNote = base.superseded_by_merge
                    ? '<span style="color:#d97706;font-weight:600;"> (Đã được merge)</span>'
                    : '';
                infoEl.innerHTML = `
                    <div class="base-info-item">
                        <i data-lucide="clock"></i>
                        <span>Thời gian: ${this.formatTimestamp(base.timestamp)}</span>
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
                if (emptyEl) emptyEl.querySelector('p').textContent = 'Không có đơn hàng nào để đối soát. Hãy áp dụng bộ lọc trước.';
                if (btn) btn.disabled = false;
                return;
            }

            const results = [];

            // Use kpiManager.reconcileKPI if available
            for (const order of allOrders) {
                try {
                    let result;
                    if (window.kpiManager && window.kpiManager.reconcileKPI) {
                        result = await window.kpiManager.reconcileKPI(order.orderId, order.campaignName);
                    } else {
                        // Fallback: basic reconciliation
                        result = {
                            orderId: order.orderId,
                            hasDiscrepancy: false,
                            expected: {},
                            actual: {},
                            discrepancies: []
                        };
                    }

                    results.push({
                        orderId: order.orderId,
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet: result.hasDiscrepancy ? '?' : (order.netProducts || 0),
                        hasDiscrepancy: result.hasDiscrepancy,
                        discrepancies: result.discrepancies || []
                    });
                } catch (e) {
                    console.error('[KPI Tab] Reconciliation error for order:', order.orderId, e);
                    results.push({
                        orderId: order.orderId,
                        stt: order.stt,
                        expectedNet: order.netProducts || 0,
                        actualNet: 'Lỗi',
                        hasDiscrepancy: true,
                        discrepancies: [{ type: 'error', message: e.message }]
                    });
                }
            }

            this.hideEl('reconLoading');

            // Filter to show only discrepancies or all
            const discrepancies = results.filter(r => r.hasDiscrepancy);

            if (discrepancies.length === 0) {
                this.showEl('reconEmpty');
                const emptyEl = document.getElementById('reconEmpty');
                if (emptyEl) emptyEl.querySelector('p').textContent = `✅ Đã kiểm tra ${results.length} đơn hàng. Không phát hiện sai lệch.`;
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
        results.forEach(r => {
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
                <td>${this.escapeHtml(r.orderId)}</td>
                <td>${r.stt || '---'}</td>
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
    exportExcel() {
        try {
            if (typeof XLSX === 'undefined') {
                alert('Thư viện XLSX chưa được tải. Vui lòng thử lại.');
                return;
            }

            const aggregated = this.aggregateByEmployee(this.state.filteredData);

            if (aggregated.length === 0) {
                alert('Không có dữ liệu để xuất. Hãy áp dụng bộ lọc trước.');
                return;
            }

            // Build data rows
            const rows = [
                ['STT', 'Tên nhân viên', 'Số đơn', 'SP NET', 'Tổng KPI (VNĐ)', 'Trạng thái']
            ];

            aggregated.forEach((emp, idx) => {
                const hasDisc = emp.orders.some(o => o.hasDiscrepancy);
                rows.push([
                    idx + 1,
                    emp.userName || emp.userId,
                    emp.orders.length,
                    emp.totalNetProducts,
                    emp.totalKPI,
                    hasDisc ? 'Cần đối soát' : 'OK'
                ]);
            });

            // Create workbook
            const ws = XLSX.utils.aoa_to_sheet(rows);

            // Set column widths
            ws['!cols'] = [
                { wch: 6 },   // STT
                { wch: 25 },  // Tên NV
                { wch: 10 },  // Số đơn
                { wch: 10 },  // SP NET
                { wch: 18 },  // Tổng KPI
                { wch: 15 }   // Trạng thái
            ];

            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'KPI Report');

            // Generate filename with date
            const now = new Date();
            const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
            const fileName = `KPI_Report_${dateStr}.xlsx`;

            XLSX.writeFile(wb, fileName);
            console.log('[KPI Tab] Exported Excel:', fileName);

        } catch (error) {
            console.error('[KPI Tab] Export error:', error);
            alert('Lỗi khi xuất Excel: ' + error.message);
        }
    },

    // ========================================
    // REFRESH DATA (12.16)
    // ========================================
    async refreshData() {
        console.log('[KPI Tab] Refreshing data...');

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

        try {
            await this.loadAllStatistics();

            // Re-resolve employee names
            const db = this.getDb();
            if (db) {
                try {
                    const baseSnapshot = await db.collection('kpi_base').limit(200).get();
                    const nameMap = new Map();
                    baseSnapshot.forEach(doc => {
                        const data = doc.data();
                        if (data.userId && data.userName) {
                            nameMap.set(data.userId, data.userName);
                        }
                    });
                    for (const stat of this.state.statsData) {
                        if (nameMap.has(stat.userId)) {
                            stat.userName = nameMap.get(stat.userId);
                        }
                    }
                } catch (e) {
                    console.warn('[KPI Tab] Could not refresh employee names:', e);
                }
            }

            this.applyFilters();
            this.reinitIcons();
            console.log('[KPI Tab] ✓ Data refreshed');
        } catch (error) {
            console.error('[KPI Tab] Refresh error:', error);
            this.hideEl('kpiTableLoading');
            this.showEl('kpiTableEmpty');
        }
    }
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
