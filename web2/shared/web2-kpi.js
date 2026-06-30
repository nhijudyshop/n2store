// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Web2Kpi — NGUỒN DUY NHẤT helper KPI phía FRONTEND (Web 2.0). Trước 2026-06-21 các trang
// fork riêng: authHeaders / fmtVnd / escapeHtml / isAdmin + hardcode *5000. Giờ mọi trang
// KPI tham chiếu window.Web2Kpi (kpi-dashboard, native-orders strip + health-bar, popup tag).
//   - RATE_PER_SP (fallback; LUÔN ưu tiên rate_per_sp từ API response nếu có)
//   - authHeaders(extra) — gắn x-web2-token (Web2Auth) → scope đúng (NV thấy mình)
//   - isAdmin() — role='admin' (web2 user) → thấy mọi NV
//   - fmtVnd(n) · escapeHtml(s)
//   - fetchKpi(workerBase, params) / fetchEvents(...) — fetch scope-aware (kèm authHeaders)
// KHÔNG fork lại — sửa 1 chỗ áp mọi nơi.
(function (global) {
    'use strict';

    const RATE_PER_SP = 5000;

    function authHeaders(extra) {
        const base = extra ? { ...extra } : {};
        try {
            if (global.Web2Auth && global.Web2Auth.authHeaders) {
                return Object.assign(base, global.Web2Auth.authHeaders());
            }
            const t = global.Web2Auth?.getStored?.()?.token;
            if (t) base['x-web2-token'] = t;
        } catch {}
        return base;
    }

    // Admin Web 2.0? (role='admin'). Khớp logic web2-sidebar _isAdmin (fallback Web 1.0 auth).
    function isAdmin() {
        try {
            const u = global.Web2Auth?.getStored?.()?.user;
            if (u && u.role) return String(u.role).toLowerCase() === 'admin';
            const auth = JSON.parse(
                localStorage.getItem('loginindex_auth') ||
                    sessionStorage.getItem('loginindex_auth') ||
                    '{}'
            );
            const userType = localStorage.getItem('userType') || '';
            return (
                auth.isAdmin === true ||
                auth.roleTemplate === 'admin' ||
                userType.startsWith('admin')
            );
        } catch {
            return false;
        }
    }

    function fmtVnd(n) {
        if (window.Web2Format && window.Web2Format.vnd) return window.Web2Format.vnd(n);
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }

    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape && global.Web2Escape.escapeHtml) {
            return global.Web2Escape.escapeHtml(s);
        }
        const d = document.createElement('div');
        d.textContent = String(s == null ? '' : s);
        return d.innerHTML;
    }

    // Đơn giá KPI: ưu tiên rate_per_sp server trả về (1 nguồn ở web2-kpi-core), fallback const.
    function rateFrom(apiResp) {
        const r = apiResp && Number(apiResp.rate_per_sp);
        return Number.isFinite(r) && r > 0 ? r : RATE_PER_SP;
    }

    async function fetchKpi(workerBase, params) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const r = await fetch(`${workerBase}/api/web2/kpi/kpi${qs}`, {
            headers: authHeaders(),
            cache: 'no-store',
        });
        return r.json();
    }
    async function fetchEvents(workerBase, params) {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const r = await fetch(`${workerBase}/api/web2/kpi/events${qs}`, {
            headers: authHeaders(),
            cache: 'no-store',
        });
        return r.json();
    }

    global.Web2Kpi = {
        RATE_PER_SP,
        authHeaders,
        isAdmin,
        fmtVnd,
        escapeHtml,
        rateFrom,
        fetchKpi,
        fetchEvents,
    };
})(typeof window !== 'undefined' ? window : globalThis);
