// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// KPI strip cho trang Đơn Web (native-orders). Hiển thị KPI Dự báo / Thực của NV.
// Model base-delta (xem render.com/routes/v2/kpi.js GET /kpi):
//   • Dự báo = đơn chưa thành đơn hàng (draft). Thực = đơn đã thành PBH (confirmed).
//   • 5.000đ / SP. Livestream = SP upsell vượt base; Inbox = mọi SP.
// Scope theo token x-web2-token: admin thấy HẾT NV, staff thấy CỦA MÌNH.
// Realtime: subscribe SSE web2:native-orders + web2:fast-sale-orders (đơn đổi → KPI đổi).

(function (global) {
    'use strict';

    const WORKER =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const KPI_URL = `${WORKER}/api/web2/kpi/kpi`;

    // Helper KPI 1 nguồn ở window.Web2Kpi (fallback inline nếu chưa load).
    function authHeaders() {
        if (window.Web2Kpi && window.Web2Kpi.authHeaders) return window.Web2Kpi.authHeaders();
        if (window.Web2Auth) return window.Web2Auth.authHeaders();
        try {
            const t = global.Web2Auth?.getStored?.()?.token;
            if (t) return { 'x-web2-token': t };
        } catch {}
        return {};
    }
    function fmtVnd(n) {
        if (window.Web2Kpi && window.Web2Kpi.fmtVnd) return window.Web2Kpi.fmtVnd(n);
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (window.Web2Kpi && window.Web2Kpi.escapeHtml) return window.Web2Kpi.escapeHtml(s);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    let _timer = null;

    async function load() {
        const strip = document.getElementById('noKpiStrip');
        if (!strip) return;
        try {
            // Không truyền campaign_id → tổng mọi chiến dịch (live + inbox).
            const r = await fetch(KPI_URL, { headers: authHeaders() });
            const d = await r.json();
            if (!d.success) {
                strip.hidden = true;
                return;
            }
            render(strip, d);
        } catch (e) {
            strip.hidden = true;
        }
    }

    function render(strip, d) {
        const rows = d.kpi || [];
        // Phòng thủ: CHỈ scope='all' (admin, server xác nhận) mới hiện leaderboard mọi NV.
        // Thiếu viewer / scope lạ → mặc định self (gọn) → không lỡ lộ KPI người khác.
        const self = !(d.viewer && d.viewer.scope === 'all');
        if (!rows.length) {
            strip.hidden = true;
            return;
        }
        strip.hidden = false;
        const title = self ? 'KPI của bạn' : `KPI nhân viên (${rows.length})`;
        // Staff (self) → pills gọn. Admin → mini-leaderboard cuộn ngang.
        if (self) {
            const r = rows[0];
            strip.innerHTML = `
                <span class="no-kpi-label"><i data-lucide="trophy"></i> ${esc(title)}</span>
                <span class="no-kpi-pill no-kpi-forecast">Dự báo: <b>${r.forecast_qty || 0}</b> SP · ${fmtVnd(r.forecast_amount)}</span>
                <span class="no-kpi-pill no-kpi-actual">Thực: <b>${r.actual_qty || 0}</b> SP · ${fmtVnd(r.actual_amount)}</span>`;
        } else {
            const cells = rows
                .slice(0, 20)
                .map(
                    (r) => `
                <div class="no-kpi-card">
                    <div class="no-kpi-name">${esc(r.beneficiary_name || 'NV #' + r.beneficiary_user_id)}</div>
                    <div class="no-kpi-nums">
                        <span class="no-kpi-forecast">DB ${r.forecast_qty || 0} · ${fmtVnd(r.forecast_amount)}</span>
                        <span class="no-kpi-actual">Thực ${r.actual_qty || 0} · ${fmtVnd(r.actual_amount)}</span>
                    </div>
                </div>`
                )
                .join('');
            strip.innerHTML = `
                <span class="no-kpi-label"><i data-lucide="trophy"></i> ${esc(title)}</span>
                <div class="no-kpi-cards">${cells}</div>`;
        }
        if (global.lucide) global.lucide.createIcons();
    }

    function scheduleReload() {
        clearTimeout(_timer);
        _timer = setTimeout(load, 700);
    }

    function init() {
        load();
        // Realtime: đơn/PBH đổi → KPI đổi. Debounce gom burst.
        if (global.Web2SSE) {
            try {
                global.Web2SSE.subscribe('web2:native-orders', scheduleReload);
                global.Web2SSE.subscribe('web2:fast-sale-orders', scheduleReload);
            } catch {}
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.NativeOrdersKpi = { reload: load };
})(typeof window !== 'undefined' ? window : globalThis);
