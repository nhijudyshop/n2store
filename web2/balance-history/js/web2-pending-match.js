// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2PendingMatch — fetch + resolve multi-match transactions từ
// /api/web2/balance-history (Web 2.0 path). ENTRY của module set W2PM.
// =====================================================================
// Tách hoàn toàn khỏi Web 1.0 pending modal cũ (refreshPendingMatchList +
// resolvePendingMatch ở balance-table.js). Web 2.0 polling endpoint riêng
// + auto credit ngay khi user chọn (không cần kế toán duyệt).
//
// MOVE-only refactor (2026-06-18): tách 914 dòng → W2PM modules
//   core → modal → customer-search → picker → resolve → render → entry.
// Entry này CHỈ giữ: badge (floating count) + refresh + init + SSE/poll
// + re-export window.Web2PendingMatch (byte-identical API).
//
// Flow:
//   1. GET /api/web2/balance-history/pending → list pending matches Web 2.0
//   2. Hiện badge "Cần chọn KH (N)" + popup modal liệt kê
//   3. User click 1 KH → POST .../pending/:id/resolve {phone, name}
//      → backend credit ví Web 2.0 + đóng pending
//   4. Refresh list
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    // Floating badge — show count of pending matches in toolbar
    // 2026-06-05: BỎ badge nổi "Cần chọn KH (Web 2.0): N" theo yêu cầu user.
    // Thay bằng nút "⚠ Trùng SĐT" trên từng row pending_match (balance-history
    // table) → mở modal lọc đúng giao dịch. Giữ element detached (KHÔNG append
    // DOM) để updateBadge() không lỗi, nhưng badge không bao giờ hiện.
    function ensureBadge() {
        if (W2PM._badge) return W2PM._badge;
        const b = document.createElement('button');
        b.id = 'web2PendingBadge';
        b.hidden = true;
        b.innerHTML = `<span id="web2PendingBadgeCount">0</span>`;
        W2PM._badge = b; // detached — không append vào DOM
        return b;
    }

    function updateBadge() {
        ensureBadge();
        const count = W2PM._pendingList.length;
        const cnt = document.getElementById('web2PendingBadgeCount');
        if (cnt) cnt.textContent = count;
        W2PM._badge.hidden = count === 0;
    }

    async function refresh() {
        try {
            W2PM._pendingList = await W2PM.listPending();
            updateBadge();
        } catch (e) {
            console.warn('[Web2PendingMatch] refresh fail:', e.message);
        }
    }

    function init() {
        ensureBadge();
        refresh();
        // Auto refresh every 30s
        setInterval(refresh, 30000);
        // Subscribe SSE for realtime new pending matches
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:wallet:*', () => {
                // Web 2.0 wallet update = có thể có pending mới hoặc resolved → refresh
                setTimeout(refresh, 500);
            });
        }
    }

    W2PM.ensureBadge = ensureBadge;
    W2PM.updateBadge = updateBadge;
    W2PM.refresh = refresh;
    W2PM.init = init;

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2PendingMatch = {
        refresh,
        openModal: W2PM.openModal,
        closeModal: W2PM.closeModal,
        listPending: W2PM.listPending,
        resolvePending: W2PM.resolvePending,
        linkManual: W2PM.linkManual,
    };
})(window);
