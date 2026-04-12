// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * UNIFIED CUSTOMER 360° (Shared)
 * =====================================================
 * Aggregates customer data from multiple sources:
 *   - Render DB (Customer 360° API)
 *   - Pancake (conversations, notes, orders)
 *   - TPOS (partner info, orders)
 *   - Wallet (balance, transactions)
 *
 * Provides a single unified view for all modules.
 * =====================================================
 */

(function() {
    'use strict';

    const WORKER_URL = window.API_CONFIG?.WORKER_URL
        || window.CONFIG?.API_BASE_URL
        || 'https://chatomni-proxy.nhijudyshop.workers.dev';

    /**
     * Get full unified customer profile
     * Returns aggregated data from all sources
     */
    async function getUnifiedProfile(identifier) {
        if (!identifier) return null;

        const result = {
            customer: null,
            wallet: null,
            notes: [],
            pancakeNotes: [],
            tickets: [],
            activities: [],
            walletTransactions: [],
            risk: null,
            crossPageIds: {},
            sources: []
        };

        // 1. Render DB (primary source)
        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${identifier}`);
            const json = await resp.json();
            if (json.success && json.data) {
                result.customer = json.data.customer;
                result.wallet = json.data.wallet;
                result.notes = json.data.notes || [];
                result.tickets = json.data.recentTickets || [];
                result.activities = json.data.recentActivities || [];
                result.walletTransactions = json.data.recentWalletTransactions || [];
                result.sources.push('render_db');

                // Extract Pancake data
                if (result.customer.pancake_notes) {
                    result.pancakeNotes = result.customer.pancake_notes;
                }
                if (result.customer.pancake_data?.page_fb_ids) {
                    result.crossPageIds = result.customer.pancake_data.page_fb_ids;
                }

                // Risk assessment
                if (window.PancakeValidator) {
                    result.risk = window.PancakeValidator.assessRisk(result.customer);
                }
            }
        } catch (e) {
            console.warn('[Unified360] DB lookup failed:', e.message);
        }

        return result;
    }

    /**
     * Render a compact customer 360° card (HTML string)
     * Usable in any module's modal or panel
     */
    function renderCompactCard(profile) {
        if (!profile?.customer) return '<div style="color:#94a3b8;padding:16px;text-align:center;">Không tìm thấy dữ liệu</div>';

        const c = profile.customer;
        const w = profile.wallet;
        const esc = (s) => s ? String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;') : '';

        const ok = c.order_success_count || c.successful_orders || 0;
        const fail = c.order_fail_count || c.returned_orders || 0;
        const total = ok + fail;
        const returnRate = total > 0 ? Math.round((fail / total) * 100) : 0;
        const walletTotal = w ? (w.balance || 0) + (w.virtualBalance || 0) : 0;

        const riskBadge = profile.risk?.level === 'danger'
            ? '<span style="background:#fef2f2;color:#dc2626;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">⚠ NGUY HIỂM</span>'
            : profile.risk?.level === 'caution'
            ? '<span style="background:#fffbeb;color:#d97706;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:700;">⚠ CẢNH BÁO</span>'
            : '';

        const rows = [];
        if (c.phone) rows.push(`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#64748b;">SĐT</span><span style="font-family:monospace;cursor:pointer;" onclick="navigator.clipboard.writeText('${esc(c.phone)}')" title="Copy">${esc(c.phone)}</span></div>`);
        if (c.fb_id) rows.push(`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#64748b;">FB ID</span><span style="font-family:monospace;font-size:10px;">${esc(c.fb_id)}</span></div>`);
        if (c.global_id) rows.push(`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#64748b;">Global</span><span style="font-family:monospace;font-size:10px;">${esc(c.global_id)}</span></div>`);

        rows.push(`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#64748b;">Đơn</span><span><span style="color:#16a34a;font-weight:600;">${ok}OK</span> <span style="color:#dc2626;font-weight:600;">${fail}hoàn</span>${returnRate > 30 ? ` <span style="color:#d97706;font-weight:600;">${returnRate}%</span>` : ''}</span></div>`);

        if (walletTotal > 0) {
            rows.push(`<div style="display:flex;justify-content:space-between;padding:3px 0;font-size:12px;"><span style="color:#64748b;">Ví</span><span style="color:#16a34a;font-weight:600;">${new Intl.NumberFormat('vi-VN').format(walletTotal)}₫</span></div>`);
        }

        const allNotes = [
            ...profile.notes.map(n => ({ text: n.content, by: n.created_by })),
            ...profile.pancakeNotes.map(n => ({ text: n.message || n.content || '', by: n.created_by?.fb_name || 'Pancake' }))
        ];

        const notesHtml = allNotes.length > 0
            ? `<div style="margin-top:8px;border-top:1px solid #e5e7eb;padding-top:8px;">
                <div style="font-size:11px;font-weight:600;color:#64748b;margin-bottom:4px;">Ghi chú (${allNotes.length})</div>
                ${allNotes.slice(0, 3).map(n => `<div style="font-size:11px;padding:4px 6px;background:#f8fafc;border-radius:4px;margin-bottom:3px;border-left:2px solid #6366f1;">${esc(typeof n.text === 'string' ? n.text : '')}<span style="color:#94a3b8;margin-left:4px;">${esc(n.by || '')}</span></div>`).join('')}
            </div>`
            : '';

        return `
            <div style="padding:12px;font-family:Inter,-apple-system,sans-serif;">
                <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                    <span style="font-weight:700;font-size:14px;">${esc(c.name || 'N/A')}</span>
                    ${riskBadge}
                </div>
                ${rows.join('')}
                ${notesHtml}
            </div>
        `;
    }

    /**
     * Create or update TPOS partner from Pancake customer data
     */
    async function syncToTPOS(phone) {
        try {
            const resp = await fetch(`${WORKER_URL}/api/v2/customers/${phone}/sync-tpos`, {
                method: 'POST'
            });
            return await resp.json();
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    // Expose
    window.UnifiedCustomer360 = {
        getUnifiedProfile,
        renderCompactCard,
        syncToTPOS
    };

})();
