/**
 * KPI Audit Logger - Ghi audit log sản phẩm thêm/bớt
 * 100% Render PostgreSQL via REST API
 *
 * Sources:
 * - chat_confirm_held, chat_decrease, chat_from_dropped
 * - edit_modal_inline, edit_modal_remove, edit_modal_quantity
 * - sale_modal, system
 *
 * Note: 'merge' removed - gộp đơn trùng SĐT không liên quan KPI
 */

(function () {
    'use strict';

    const KPI_API = 'https://n2store-fallback.onrender.com/api/realtime';
    const PENDING_QUEUE_KEY = 'kpi_audit_pending';
    const MAX_RETRIES = 3;

    const VALID_ACTIONS = ['add', 'remove'];
    const VALID_SOURCES = [
        'chat_confirm_held', 'chat_decrease', 'chat_from_dropped',
        'edit_modal_inline', 'edit_modal_remove', 'edit_modal_quantity',
        'sale_modal', 'system'
    ];

    // ==========================================
    // Helpers
    // ==========================================

    function getCurrentUserInfo() {
        try {
            if (window.authManager) {
                const auth = window.authManager.getAuthState();
                if (auth) {
                    return {
                        userId: auth.id || auth.Id || auth.username || 'unknown',
                        userName: auth.displayName || auth.name || auth.username || 'Unknown'
                    };
                }
            }
        } catch (e) {}
        return { userId: 'unknown', userName: 'Unknown' };
    }

    function getCampaignInfo() {
        try {
            if (window.campaignManager) {
                return {
                    campaignId: window.campaignManager.activeCampaignId || null,
                    campaignName: window.campaignManager.activeCampaign?.name
                        || window.campaignManager.activeCampaign?.displayName || null
                };
            }
        } catch (e) {}
        return { campaignId: null, campaignName: null };
    }

    // ==========================================
    // Pending Queue (offline fallback)
    // ==========================================

    function getPendingLogs() {
        try {
            const raw = localStorage.getItem(PENDING_QUEUE_KEY);
            return raw ? JSON.parse(raw) : [];
        } catch (e) { return []; }
    }

    function savePendingLogs(logs) {
        try {
            localStorage.setItem(PENDING_QUEUE_KEY, JSON.stringify(logs));
        } catch (e) {}
    }

    function addToPendingQueue(entry) {
        const pending = getPendingLogs();
        pending.push({ ...entry, _createdAt: new Date().toISOString(), _retryCount: 0 });
        savePendingLogs(pending);
    }

    // ==========================================
    // Core: logProductAction
    // ==========================================

    async function logProductAction(entry) {
        if (!entry) return { success: false, error: 'No entry' };

        // Validate
        if (!entry.orderCode || !entry.action || !entry.productCode) {
            console.warn('[KPI Audit] Missing required fields:', entry);
            return { success: false, error: 'Missing orderCode, action, or productCode' };
        }
        if (!VALID_ACTIONS.includes(entry.action)) {
            console.warn('[KPI Audit] Invalid action:', entry.action);
            return { success: false, error: `Invalid action: ${entry.action}` };
        }
        if (!VALID_SOURCES.includes(entry.source)) {
            console.warn('[KPI Audit] Invalid source:', entry.source);
            return { success: false, error: `Invalid source: ${entry.source}` };
        }

        // Auto-fill user + campaign
        const user = getCurrentUserInfo();
        const campaign = getCampaignInfo();

        const logData = {
            orderCode: String(entry.orderCode),
            orderId: entry.orderId ? String(entry.orderId) : null,
            action: entry.action,
            productId: entry.productId ? Number(entry.productId) : null,
            productCode: String(entry.productCode),
            productName: entry.productName || '',
            quantity: Math.max(1, Number(entry.quantity) || 1),
            source: entry.source,
            userId: entry.userId || user.userId,
            userName: entry.userName || user.userName,
            campaignId: entry.campaignId || campaign.campaignId,
            campaignName: entry.campaignName || campaign.campaignName,
            outOfRange: entry.out_of_range || false
        };

        // Try REST API with retry
        for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                const res = await fetch(`${KPI_API}/kpi-audit-log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(logData)
                });
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                const result = await res.json();
                console.log(`[KPI Audit] ✓ Logged: ${entry.action} ${entry.productCode} x${entry.quantity} → ${entry.source}`);
                return { success: true, id: result.id };
            } catch (e) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, Math.pow(2, attempt - 1) * 1000));
                } else {
                    console.warn('[KPI Audit] ✗ Failed after retries, queuing:', e.message);
                    addToPendingQueue(logData);
                    return { success: false, error: e.message, queued: true };
                }
            }
        }
    }

    // ==========================================
    // Query: getAuditLogsForOrder
    // ==========================================

    async function getAuditLogsForOrder(orderCode) {
        if (!orderCode) return [];
        try {
            const res = await fetch(`${KPI_API}/kpi-audit-log/${encodeURIComponent(orderCode)}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return data.logs || [];
        } catch (e) {
            console.warn('[KPI Audit] getAuditLogsForOrder error:', e.message);
            return [];
        }
    }

    // ==========================================
    // Process Pending Queue
    // ==========================================

    async function processPendingLogs() {
        const pending = getPendingLogs();
        if (pending.length === 0) return { success: 0, failed: 0 };

        let success = 0, failed = 0;
        const stillPending = [];

        // Try batch first
        try {
            const res = await fetch(`${KPI_API}/kpi-audit-log/batch`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ entries: pending })
            });
            if (res.ok) {
                const result = await res.json();
                success = result.count || pending.length;
                savePendingLogs([]);
                return { success, failed: 0 };
            }
        } catch (e) {}

        // Fallback: one by one
        for (const entry of pending) {
            try {
                const res = await fetch(`${KPI_API}/kpi-audit-log`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(entry)
                });
                if (res.ok) success++;
                else stillPending.push(entry);
            } catch (e) {
                entry._retryCount = (entry._retryCount || 0) + 1;
                if (entry._retryCount < 5) stillPending.push(entry);
                else failed++;
            }
        }

        savePendingLogs(stillPending);
        return { success, failed };
    }

    // ==========================================
    // Auto-process on page load
    // ==========================================

    document.addEventListener('DOMContentLoaded', function () {
        setTimeout(function () {
            processPendingLogs().then(function (result) {
                if (result.success > 0 || result.failed > 0) {
                    console.log('[KPI Audit] Page load pending processing:', result);
                }
            }).catch(function (e) {});
        }, 3000);
    });

    // ==========================================
    // Export
    // ==========================================

    window.kpiAuditLogger = {
        logProductAction,
        processPendingLogs,
        getAuditLogsForOrder,
        getCurrentUserInfo,
        getCampaignInfo,
        VALID_ACTIONS,
        VALID_SOURCES,
        PENDING_QUEUE_KEY
    };

})();
