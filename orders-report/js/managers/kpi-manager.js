// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Manager - Quản lý KPI upselling sản phẩm
 * 100% Render PostgreSQL - không dùng Firebase cho KPI
 *
 * Flow:
 * 1. Bulk Message Sender hoàn tất → saveAutoBaseSnapshot() lưu BASE
 * 2. Nhân viên thao tác SP → Audit Log ghi qua kpi-audit-logger.js
 * 3. Sau mỗi thao tác → recalculateAndSaveKPI() tính NET KPI
 * 4. NET KPI = chỉ tính SP MỚI (không trong BASE), net = add - remove (min 0)
 * 5. Tổng KPI = SUM(net per product) × 5,000 VNĐ
 *
 * Storage: 100% Render PostgreSQL via REST API (NO Firebase)
 * - kpi_base (key: order_code)
 * - kpi_audit_log (key: order_code)
 * - kpi_statistics (key: user_id + stat_date)
 * - report_order_details (key: table_name) — product data for BASE snapshots
 * - campaign_employee_ranges (key: campaign_name) — STT → employee mapping
 */

(function () {
    'use strict';

    const KPI_API = 'https://n2store-fallback.onrender.com/api/realtime';
    const KPI_AMOUNT_PER_DIFFERENCE = 5000;

    // ========================================
    // REST API Helper
    // ========================================
    async function kpiAPI(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${KPI_API}${path}`, opts);
        if (!res.ok) throw new Error(`KPI API ${method} ${path}: ${res.status}`);
        return res.json();
    }

    function sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    function getCurrentDateString() {
        const now = new Date();
        return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    }

    // ========================================
    // KPI BASE
    // ========================================

    async function checkKPIBaseExists(orderCode) {
        if (!orderCode) return false;
        try {
            const result = await kpiAPI('GET', `/kpi-base/${encodeURIComponent(orderCode)}`);
            return result.exists === true;
        } catch (e) {
            console.warn('[KPI] checkKPIBaseExists error:', e.message);
            return false;
        }
    }

    async function getKPIBase(orderCode) {
        if (!orderCode) return null;
        try {
            const result = await kpiAPI('GET', `/kpi-base/${encodeURIComponent(orderCode)}`);
            return result.exists ? result.data : null;
        } catch (e) {
            console.warn('[KPI] getKPIBase error:', e.message);
            return null;
        }
    }

    // ========================================
    // Fetch products from TPOS API (Tier 3 fallback)
    // ========================================
    async function fetchProductsFromTPOS(orderId) {
        if (!window.tokenManager || !window.tokenManager.getAuthHeader) return [];
        try {
            const headers = await window.tokenManager.getAuthHeader();
            const apiUrl = `https://chatomni-proxy.nhijudyshop.workers.dev/api/odata/SaleOnline_Order(${orderId})?$expand=Details`;
            const response = await fetch(apiUrl, {
                headers: { ...headers, 'accept': 'application/json' }
            });
            if (!response.ok) return [];
            const data = await response.json();
            return (data.Details || []).map(d => ({
                ProductId: d.ProductId || null,
                ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                ProductName: d.ProductNameGet || d.ProductName || d.Name || '',
                Quantity: d.Quantity || 1,
                Price: d.Price || 0
            })).filter(p => p.ProductCode);
        } catch (e) {
            console.error('[KPI] fetchProductsFromTPOS failed:', e);
            return [];
        }
    }

    // ========================================
    // Save Auto Base Snapshot (after bulk message send)
    // ========================================
    async function saveAutoBaseSnapshot(successOrders, campaignName, userId) {
        if (!Array.isArray(successOrders) || successOrders.length === 0) {
            return { saved: 0, skipped: 0, failed: 0 };
        }

        let userName = 'Unknown';
        if (window.authManager) {
            const auth = window.authManager.getAuthState();
            if (auth) userName = auth.displayName || auth.userType || auth.username || 'Unknown';
        }

        let campaignId = null;
        if (window.campaignManager?.activeCampaignId) {
            campaignId = window.campaignManager.activeCampaignId;
        }
        if (!campaignName && window.campaignManager?.activeCampaign) {
            campaignName = window.campaignManager.activeCampaign.name || window.campaignManager.activeCampaign.displayName;
        }

        // Load report_order_details for product data + STT + Code (from Render PostgreSQL)
        let reportOrdersMap = {};
        try {
            if (campaignName) {
                const safeTable = campaignName.replace(/[.$#\[\]\/]/g, '_');
                const result = await kpiAPI('GET', `/report-order-details/${encodeURIComponent(safeTable)}`);
                if (result.exists && Array.isArray(result.orders)) {
                    result.orders.forEach(o => {
                        const oid = o.Id || o.id;
                        if (oid) reportOrdersMap[oid] = o;
                    });
                }
            }
        } catch (e) {
            console.warn('[KPI] Could not load report_order_details:', e.message);
        }

        // Build base entries
        const orderCodes = [];
        const basesToSave = [];

        for (const order of successOrders) {
            const orderId = String(order.Id || order.id || '');
            if (!orderId) continue;

            const reportOrder = reportOrdersMap[orderId];

            // Get orderCode (primary key)
            const orderCode = order.Code || order.code
                || (reportOrder && (reportOrder.Code || reportOrder.code)) || '';
            if (!orderCode) continue;

            orderCodes.push(orderCode);

            // Get STT - try multiple sources
            // successOrders doesn't have STT, so fallback to reportOrder and OrderStore
            const storeOrder = window.OrderStore ? window.OrderStore.get(orderId) : null;
            const stt = parseInt(
                order.STT || order.stt
                || (reportOrder && (reportOrder.STT || reportOrder.SessionIndex || reportOrder.stt))
                || (storeOrder && (storeOrder.SessionIndex || storeOrder.STT || storeOrder.stt))
                || 0) || 0;
            if (!stt) {
                console.warn(`[KPI] STT=0 for order ${orderCode} (orderId=${orderId})`);
                console.warn('[KPI] Debug: reportOrder keys=', reportOrder ? Object.keys(reportOrder) : 'NULL');
                console.warn('[KPI] Debug: storeOrder keys=', storeOrder ? Object.keys(storeOrder).slice(0, 10) : 'NULL');
                if (reportOrder) console.warn('[KPI] reportOrder STT fields:', { STT: reportOrder.STT, SessionIndex: reportOrder.SessionIndex, stt: reportOrder.stt });
                if (storeOrder) console.warn('[KPI] storeOrder STT fields:', { SessionIndex: storeOrder.SessionIndex, STT: storeOrder.STT, stt: storeOrder.stt });
            }

            // Get products (3-tier fallback)
            let products = [];
            if (reportOrder?.Details?.length > 0) {
                products = reportOrder.Details.map(d => ({
                    ProductId: d.ProductId || null,
                    ProductCode: d.ProductCode || d.Code || d.DefaultCode || '',
                    ProductName: d.ProductName || d.Name || '',
                    Quantity: d.Quantity || 1,
                    Price: d.Price || 0
                })).filter(p => p.ProductCode);
            }

            if (products.length === 0) {
                const local = order.Details || order.products || order.mainProducts || [];
                products = local.map(p => ({
                    ProductId: p.ProductId || null,
                    ProductCode: p.ProductCode || p.Code || p.DefaultCode || '',
                    ProductName: p.ProductName || p.Name || '',
                    Quantity: p.Quantity || 1,
                    Price: p.Price || 0
                })).filter(p => p.ProductCode);
            }

            if (products.length === 0) {
                try { products = await fetchProductsFromTPOS(orderId); } catch (e) {}
            }

            if (products.length === 0) continue;

            basesToSave.push({
                orderCode, orderId, campaignId, campaignName,
                userId, userName, stt, products
            });
        }

        if (basesToSave.length === 0) return { saved: 0, skipped: 0, failed: 0 };

        // Check existing
        let existingSet = new Set();
        try {
            const { existing } = await kpiAPI('POST', '/kpi-base/check-exists', { orderCodes });
            existingSet = new Set(existing);
        } catch (e) {
            console.warn('[KPI] check-exists failed:', e.message);
        }

        const newBases = basesToSave.filter(b => !existingSet.has(b.orderCode));
        if (newBases.length === 0) return { saved: 0, skipped: basesToSave.length, failed: 0 };

        // Batch save with retry
        let saved = 0, failed = 0;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const result = await kpiAPI('POST', '/kpi-base/batch', { bases: newBases });
                saved = result.saved || 0;
                failed = 0;
                break;
            } catch (e) {
                console.warn(`[KPI] saveAutoBaseSnapshot attempt ${attempt}/3 failed:`, e.message);
                if (attempt < 3) await sleep(Math.pow(2, attempt - 1) * 1000);
                else failed = newBases.length;
            }
        }

        return { saved, skipped: existingSet.size, failed };
    }

    // ========================================
    // Calculate NET KPI
    // ========================================
    async function calculateNetKPI(orderCode) {
        const emptyResult = { netProducts: 0, kpiAmount: 0, details: {}, baseProductCount: 0 };
        if (!orderCode) return emptyResult;

        try {
            const base = await getKPIBase(orderCode);
            if (!base || !base.products || base.products.length === 0) return emptyResult;

            // Build BASE product ID set
            const baseProductIds = new Set();
            for (const p of base.products) {
                if (p.ProductId) baseProductIds.add(Number(p.ProductId));
            }

            // Get audit logs from PostgreSQL
            const { logs } = await kpiAPI('GET', `/kpi-audit-log/${encodeURIComponent(orderCode)}`);
            if (!logs || logs.length === 0) return { ...emptyResult, baseProductCount: baseProductIds.size };

            // Filter logs after BASE creation
            const baseTime = base.createdAt ? new Date(base.createdAt) : null;
            const relevantLogs = baseTime
                ? logs.filter(l => new Date(l.createdAt) >= baseTime)
                : logs;

            // Only NEW products (not in BASE)
            const newProductLogs = relevantLogs.filter(l => {
                const pid = Number(l.productId);
                return !baseProductIds.has(pid);
            });

            // Group by productId and calculate net
            const netPerProduct = {};
            for (const log of newProductLogs) {
                const pid = String(log.productId);
                if (!netPerProduct[pid]) {
                    netPerProduct[pid] = { code: log.productCode, name: log.productName, added: 0, removed: 0, net: 0 };
                }
                if (log.action === 'add') netPerProduct[pid].added += (log.quantity || 0);
                else if (log.action === 'remove') netPerProduct[pid].removed += (log.quantity || 0);
            }

            let totalNet = 0;
            for (const [pid, data] of Object.entries(netPerProduct)) {
                data.net = Math.max(0, data.added - data.removed);
                totalNet += data.net;
            }

            return {
                netProducts: totalNet,
                kpiAmount: totalNet * KPI_AMOUNT_PER_DIFFERENCE,
                details: netPerProduct,
                baseProductCount: baseProductIds.size
            };
        } catch (e) {
            console.error('[KPI] calculateNetKPI error:', e);
            return emptyResult;
        }
    }

    // ========================================
    // Save KPI Statistics (Atomic PATCH via REST)
    // ========================================
    async function saveKPIStatistics(userId, date, statistics) {
        if (!userId || !date || !statistics) return;

        try {
            // Get employee name
            let userName = null;
            try {
                const assigned = await getAssignedEmployeeForSTT(statistics.stt, statistics.campaignName);
                if (assigned.userName && assigned.userName !== 'Chưa phân') userName = assigned.userName;
            } catch (e) {}

            // Atomic server-side upsert — no client-side read-modify-write race condition
            await kpiAPI('PATCH', `/kpi-statistics/${encodeURIComponent(userId)}/${date}/order`, {
                orderCode: statistics.orderCode,
                orderId: statistics.orderId || null,
                stt: statistics.stt,
                campaignName: statistics.campaignName || null,
                netProducts: statistics.netProducts || 0,
                kpi: statistics.kpi || 0,
                hasDiscrepancy: statistics.hasDiscrepancy || false,
                details: statistics.details || {},
                userName
            });
        } catch (e) {
            console.error('[KPI] saveKPIStatistics error:', e);
        }
    }

    // ========================================
    // Recalculate & Save KPI
    // ========================================
    async function recalculateAndSaveKPI(orderCode) {
        try {
            if (!orderCode) return null;

            const base = await getKPIBase(orderCode);
            if (!base) return null;
            if (!base.products || base.products.length === 0) return null;

            // Recover STT if BASE has 0
            let stt = base.stt || 0;
            if (!stt && base.orderId && window.OrderStore) {
                const storeOrder = window.OrderStore.get(base.orderId);
                if (storeOrder) {
                    stt = parseInt(storeOrder.SessionIndex || storeOrder.STT || storeOrder.stt || 0) || 0;
                    if (stt) {
                        // Update BASE with recovered STT
                        try { await kpiAPI('PUT', `/kpi-base/${encodeURIComponent(orderCode)}`, { ...base, stt }); } catch (e) {}
                        console.log(`[KPI] Recovered STT=${stt} for ${orderCode}`);
                    }
                }
            }
            const assignedEmployee = await getAssignedEmployeeForSTT(stt, base.campaignName);
            const employeeUserId = assignedEmployee.userId;

            const result = await calculateNetKPI(orderCode);

            const date = getCurrentDateString();
            await saveKPIStatistics(employeeUserId, date, {
                orderCode: orderCode,
                orderId: base.orderId || null,
                stt: stt,
                campaignName: base.campaignName || null,
                netProducts: result.netProducts,
                kpi: result.kpiAmount,
                hasDiscrepancy: false,
                details: result.details
            });

            // UI badge + toast (non-blocking)
            try {
                updateKPIBadge(orderCode, result.netProducts, result.kpiAmount, true);
                showKPIToast(result.netProducts, result.kpiAmount);
            } catch (e) {}

            return { netProducts: result.netProducts, kpiAmount: result.kpiAmount };
        } catch (e) {
            console.error('[KPI] recalculateAndSaveKPI error:', e);
            return null;
        }
    }

    // ========================================
    // Employee Range Lookup (Render PostgreSQL)
    // ========================================
    const CAMPAIGNS_API = 'https://n2store-fallback.onrender.com/api/campaigns';
    let _employeeRangesCache = null;
    let _employeeRangesCacheTime = 0;
    const RANGES_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

    async function getAssignedEmployeeForSTT(stt, campaignName) {
        const unassigned = { userId: 'unassigned', userName: 'Chưa phân' };
        if (!stt && stt !== 0) return unassigned;

        try {
            const sttNum = Number(stt);

            // 1. Campaign-specific ranges (priority)
            if (campaignName) {
                try {
                    const safeName = campaignName.replace(/[.$#\[\]\/]/g, '_');
                    const result = await fetch(`${CAMPAIGNS_API}/employee-ranges/${encodeURIComponent(safeName)}`).then(r => r.json());
                    if (result.success && Array.isArray(result.employeeRanges) && result.employeeRanges.length > 0) {
                        const found = _findInRanges(result.employeeRanges, sttNum);
                        if (found) return found;
                    }
                } catch (e) {}
            }

            // 2. General ranges (all campaigns, cached)
            try {
                const now = Date.now();
                if (!_employeeRangesCache || (now - _employeeRangesCacheTime) > RANGES_CACHE_TTL) {
                    const result = await fetch(`${CAMPAIGNS_API}/employee-ranges`).then(r => r.json());
                    if (result.success) {
                        _employeeRangesCache = result.rangesByCampaign || {};
                        _employeeRangesCacheTime = now;
                    }
                }
                if (_employeeRangesCache) {
                    for (const ranges of Object.values(_employeeRangesCache)) {
                        const found = _findInRanges(ranges, sttNum);
                        if (found) return found;
                    }
                }
            } catch (e) {}

            console.warn(`[KPI] STT ${stt} not found in any Employee_Range`);
            return unassigned;
        } catch (e) {
            return unassigned;
        }
    }

    function _findInRanges(ranges, sttNum) {
        if (Array.isArray(ranges)) {
            for (const r of ranges) {
                const from = r.fromSTT || r.from || r.start || 0;
                const to = r.toSTT || r.to || r.end || Infinity;
                if (sttNum >= from && sttNum <= to) {
                    return {
                        userId: r.userId || r.id || 'unassigned',
                        userName: r.userName || r.name || r.userId || r.id || 'Chưa phân'
                    };
                }
            }
        } else if (typeof ranges === 'object') {
            for (const [uid, r] of Object.entries(ranges)) {
                if (!r || typeof r !== 'object') continue;
                if (uid === 'ranges') continue;
                const from = r.from || r.start || r.fromSTT || 0;
                const to = r.to || r.end || r.toSTT || Infinity;
                if (sttNum >= from && sttNum <= to) {
                    return { userId: uid, userName: r.userName || uid };
                }
            }
        }
        return null;
    }

    // ========================================
    // KPI Badge + Toast (UI helpers)
    // ========================================
    function formatKPICurrency(amount) {
        return (amount || 0).toLocaleString('vi-VN') + 'đ';
    }

    function updateKPIBadge(orderCode, netProducts, kpiAmount, hasBase) {
        try {
            const container = document.getElementById('kpi-badge-container');
            const badge = document.getElementById('kpi-badge');
            if (!container || !badge) return;
            container.style.display = 'block';
            if (!hasBase) {
                badge.textContent = 'Chưa có BASE';
                badge.style.background = '#f1f5f9'; badge.style.color = '#94a3b8';
            } else if (netProducts > 0) {
                badge.textContent = 'KPI: +' + netProducts + ' SP = ' + formatKPICurrency(kpiAmount);
                badge.style.background = '#dcfce7'; badge.style.color = '#16a34a';
            } else {
                badge.textContent = 'KPI: 0';
                badge.style.background = '#f1f5f9'; badge.style.color = '#94a3b8';
            }
        } catch (e) {}
    }

    function showKPIToast(netProducts, kpiAmount) {
        try {
            if (netProducts <= 0) return;
            let c = document.getElementById('kpi-toast-container');
            if (!c) {
                c = document.createElement('div');
                c.id = 'kpi-toast-container';
                c.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
                document.body.appendChild(c);
            }
            const t = document.createElement('div');
            t.style.cssText = 'background:#16a34a;color:white;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;box-shadow:0 4px 12px rgba(0,0,0,0.15);pointer-events:auto;opacity:0;transform:translateY(12px);transition:all 0.3s ease;';
            t.textContent = 'KPI: +' + netProducts + ' SP = ' + formatKPICurrency(kpiAmount);
            c.appendChild(t);
            requestAnimationFrame(() => { t.style.opacity = '1'; t.style.transform = 'translateY(0)'; });
            setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(12px)'; setTimeout(() => t.remove(), 300); }, 3000);
        } catch (e) {}
    }

    async function initKPIBadge(orderCode) {
        try {
            if (!orderCode) return;
            const hasBase = await checkKPIBaseExists(orderCode);
            if (hasBase) {
                const result = await calculateNetKPI(orderCode);
                updateKPIBadge(orderCode, result.netProducts, result.kpiAmount, true);
            } else {
                updateKPIBadge(orderCode, 0, 0, false);
            }
        } catch (e) {}
    }

    // ========================================
    // Export
    // ========================================
    window.kpiManager = {
        checkKPIBaseExists,
        getKPIBase,
        saveAutoBaseSnapshot,
        calculateNetKPI,
        recalculateAndSaveKPI,
        saveKPIStatistics,
        getAssignedEmployeeForSTT,
        fetchProductsFromTPOS,
        getCurrentDateString,
        updateKPIBadge,
        showKPIToast,
        initKPIBadge,
        KPI_AMOUNT_PER_DIFFERENCE,
        kpiAPI
    };

})();
