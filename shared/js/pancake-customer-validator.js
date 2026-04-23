// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * PANCAKE CUSTOMER VALIDATOR (Shared)
 * =====================================================
 * Shared utility for validating and enriching customer data
 * from Pancake/Render DB across all n2store modules.
 *
 * Used by: balance-history, delivery-report, don-inbox,
 *          doi-soat, orders-report, inbox, customer-hub
 *
 * Features:
 *   - Customer lookup by phone/fb_id/global_id
 *   - Risk assessment (bom, return rate, banned)
 *   - Customer enrichment (name, notes, orders)
 *   - Badge/warning HTML generation
 *   - In-memory cache with TTL
 * =====================================================
 */

(function () {
    'use strict';

    const WORKER_URL =
        window.API_CONFIG?.WORKER_URL ||
        window.CONFIG?.API_BASE_URL ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    const cache = new Map();
    const CACHE_TTL = 3 * 60 * 1000; // 3 min

    /**
     * Lookup customer by phone, fb_id, or global_id
     * Returns enriched customer object or null
     */
    async function lookupCustomer(identifier) {
        if (!identifier) return null;
        const key = String(identifier).trim();
        if (key.length < 5) return null;

        // Check cache
        const cached = cache.get(key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

        try {
            const _fetch = (typeof window !== 'undefined' && window.fetchWithTimeout) || fetch;
            const resp = await _fetch(`${WORKER_URL}/api/v2/customers/${key}`, {}, 8000);
            if (!resp.ok) return null;
            const json = await resp.json();
            if (!json.success || !json.data) return null;

            const result = {
                customer: json.data.customer,
                wallet: json.data.wallet,
                notes: json.data.notes || [],
                recentTickets: json.data.recentTickets || [],
                risk: assessRisk(json.data.customer),
            };

            cache.set(key, { data: result, ts: Date.now() });
            return result;
        } catch (e) {
            console.warn('[PancakeValidator] Lookup failed:', e.message);
            return null;
        }
    }

    /**
     * Quick lookup - returns just customer + risk (no wallet/tickets)
     */
    async function quickLookup(phone) {
        if (!phone) return null;
        const key = String(phone).trim();

        const cached = cache.get('q_' + key);
        if (cached && Date.now() - cached.ts < CACHE_TTL) return cached.data;

        try {
            const _fetch = (typeof window !== 'undefined' && window.fetchWithTimeout) || fetch;
            const resp = await _fetch(`${WORKER_URL}/api/v2/customers/${key}/quick-view`, {}, 6000);
            if (!resp.ok) return null;
            const json = await resp.json();
            if (!json.success || !json.data) return null;

            const result = {
                customer: json.data,
                risk: assessRisk(json.data),
            };

            cache.set('q_' + key, { data: result, ts: Date.now() });
            return result;
        } catch (e) {
            return null;
        }
    }

    /**
     * Assess customer risk level
     */
    function assessRisk(customer) {
        if (!customer) return { level: 'unknown', warnings: [] };

        const warnings = [];
        let level = 'safe'; // safe, caution, danger

        // Status-based risk
        const status = customer.status || '';
        if (status === 'Bom hàng' || status === 'Nguy hiểm') {
            level = 'danger';
            warnings.push({ type: 'status', text: status, icon: 'shield-alert' });
        } else if (status === 'Cảnh báo') {
            level = 'caution';
            warnings.push({ type: 'status', text: 'Cảnh báo', icon: 'alert-triangle' });
        }

        // Return rate risk
        const ok = customer.order_success_count || customer.successful_orders || 0;
        const fail = customer.order_fail_count || customer.returned_orders || 0;
        const total = ok + fail;
        if (total >= 3) {
            const returnRate = Math.round((fail / total) * 100);
            if (returnRate > 50) {
                level = 'danger';
                warnings.push({ type: 'return', text: `Hoàn ${returnRate}%`, icon: 'package-x' });
            } else if (returnRate > 30) {
                if (level !== 'danger') level = 'caution';
                warnings.push({ type: 'return', text: `Hoàn ${returnRate}%`, icon: 'package-x' });
            }
        }

        // Can't inbox
        if (customer.can_inbox === false) {
            warnings.push({ type: 'inbox', text: 'No Inbox', icon: 'message-circle-off' });
        }

        // Pancake data
        const orderOk = customer.order_success_count || 0;
        const orderFail = customer.order_fail_count || 0;

        return {
            level,
            warnings,
            stats: { orderOk, orderFail, total: orderOk + orderFail },
            hasData: !!(customer.fb_id || customer.global_id || customer.pancake_synced_at),
        };
    }

    /**
     * Generate inline HTML badge for customer risk
     * Compact: just icon + text, fits in table cells
     */
    function renderRiskBadge(risk) {
        if (!risk || risk.level === 'unknown' || risk.level === 'safe') return '';
        if (risk.warnings.length === 0) return '';

        const colors = {
            danger: { bg: '#fef2f2', border: '#fca5a5', text: '#dc2626' },
            caution: { bg: '#fffbeb', border: '#fcd34d', text: '#d97706' },
        };
        const c = colors[risk.level] || colors.caution;

        const badges = risk.warnings
            .map(
                (w) =>
                    `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:${c.bg};border:1px solid ${c.border};color:${c.text};border-radius:4px;font-size:10px;font-weight:600;white-space:nowrap;" title="${escapeHtml(w.text)}">${escapeHtml(w.text)}</span>`
            )
            .join(' ');

        return `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">${badges}</div>`;
    }

    /**
     * Generate Pancake info badge (compact, for table cells)
     * Shows: order stats + risk warnings
     */
    function renderCustomerBadge(data) {
        if (!data) return '';
        const { customer, risk } = data;
        const parts = [];

        // Order stats
        if (risk.stats.total > 0) {
            parts.push(
                `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#dcfce7;border:1px solid #bbf7d0;color:#16a34a;border-radius:4px;font-size:10px;font-weight:600;">${risk.stats.orderOk}OK</span>`
            );
            if (risk.stats.orderFail > 0) {
                parts.push(
                    `<span style="display:inline-flex;align-items:center;gap:2px;padding:1px 5px;background:#fee2e2;border:1px solid #fca5a5;color:#dc2626;border-radius:4px;font-size:10px;font-weight:600;">${risk.stats.orderFail}hoàn</span>`
                );
            }
        }

        // Risk warnings
        const riskHtml = renderRiskBadge(risk);

        return parts.length > 0 || riskHtml
            ? `<div style="display:flex;flex-wrap:wrap;gap:3px;margin-top:2px;">${parts.join('')}</div>${riskHtml}`
            : '';
    }

    /**
     * Add note to customer
     */
    async function addNote(phone, content, createdBy) {
        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${phone}/notes`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content, created_by: createdBy || 'n2store' }),
            });
            const json = await resp.json();
            if (json.success) {
                cache.delete(phone);
                cache.delete('q_' + phone);
            }
            return json;
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    /**
     * Sync customer data from Pancake
     */
    async function syncPancakeCustomer(payload) {
        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/sync-pancake`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            return await resp.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function clearCache() {
        cache.clear();
    }

    // Expose
    window.PancakeValidator = {
        lookupCustomer,
        quickLookup,
        assessRisk,
        renderRiskBadge,
        renderCustomerBadge,
        addNote,
        syncPancakeCustomer,
        clearCache,
    };
})();
