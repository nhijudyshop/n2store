// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web2SoOrder — reader CHUNG đọc Sổ Order từ Postgres (C8, 2026-06-13).
//
// Sau C8, nguồn chuẩn so-order là Postgres `/api/web2-so-order/get` (KHÔNG còn
// Firestore `web2_so_order/main`). Các trang TIÊU THỤ so-order (supplier-debt,
// supplier-wallet, web2/products, live-chat inventory-panel) PHẢI đọc qua đây —
// KHÔNG đọc Firestore (đã frozen tại thời điểm migrate → dữ liệu cũ).
//
// API: Web2SoOrder.load() → Promise<{tabs:[...], activeTabId} | null>
//   - Trả `data` (object state) hoặc null nếu chưa có / lỗi.
//   - Gửi x-web2-token (enforce live). Auth lỗi → null (trang tự xử lý empty).
// =====================================================
(function (global) {
    'use strict';
    if (global.Web2SoOrder) return;

    const API_BASE =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        (global.LiveState && global.LiveState.workerUrl) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    function _authHeaders() {
        const h = {};
        try {
            if (global.Web2Auth && global.Web2Auth.authHeaders)
                return global.Web2Auth.authHeaders(h);
            const t = JSON.parse(localStorage.getItem('web2_auth') || '{}').token;
            if (t) h['x-web2-token'] = t;
        } catch (e) {
            /* ignore */
        }
        return h;
    }

    async function load() {
        try {
            const r = await fetch(`${API_BASE}/api/web2-so-order/get`, {
                headers: _authHeaders(),
            });
            if (!r.ok) return null;
            const j = await r.json();
            if (!j || !j.success || j.empty || !j.data) return null;
            return j.data;
        } catch (e) {
            console.warn('[Web2SoOrder] load fail:', e.message);
            return null;
        }
    }

    global.Web2SoOrder = { load };
})(typeof window !== 'undefined' ? window : globalThis);
