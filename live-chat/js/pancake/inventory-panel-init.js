// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Kho SP panel — INIT + entry. Module 4/4 (load CUỐI). init() mount panel +
// wire MutationObserver Live comments; entry publish public API byte-identical
// global.PancakeInventoryPanel. Deps qua shared namespace global.__PancakeInvPanelNS.

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;
    const NS = global.__PancakeInvPanelNS || (global.__PancakeInvPanelNS = {});

    async function init(container) {
        NS.renderShell(container);
        await NS.refresh();
        NS.attachDropTargets();
        NS._subscribeSSE();

        // Wire MutationObserver cho Live comments container (#liveContent) —
        // drop target DUY NHẤT. Watch subtree để bắt re-render của LiveCommentList.
        //
        // ⚠ Anti feedback-loop (fix 2026-06-06 "chọn 4 campaign load liên tục"):
        // refreshCartCounts() → renderBadges() append/sửa badge `.inv-cart-badge`
        // BÊN TRONG row = childList mutation trong subtree → observer fire lại →
        // refresh lại → loop vô hạn ~10 req/s. Vì vậy callback CHỈ react khi danh
        // sách comment THỰC SỰ đổi (thêm/bớt `.live-conversation-item`), bỏ qua mọi
        // mutation do chính badge giỏ hàng gây ra.
        function _mutationsTouchRows(mutations) {
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (
                        n.nodeType === 1 &&
                        (n.classList?.contains('live-conversation-item') ||
                            n.querySelector?.('.live-conversation-item'))
                    )
                        return true;
                }
                for (const n of m.removedNodes) {
                    if (
                        n.nodeType === 1 &&
                        (n.classList?.contains('live-conversation-item') ||
                            n.querySelector?.('.live-conversation-item'))
                    )
                        return true;
                }
            }
            return false;
        }
        function _wireLiveObserver() {
            const liveRoot = document.getElementById('liveContent');
            if (!liveRoot) return false;
            if (liveRoot.dataset.invObserved) return true;
            liveRoot.dataset.invObserved = '1';
            new MutationObserver((mutations) => {
                if (!_mutationsTouchRows(mutations)) return; // bỏ qua badge churn
                clearTimeout(init._liveTimer);
                init._liveTimer = setTimeout(() => {
                    NS.refreshCartCounts();
                    NS._markHasOrderRows();
                }, 300);
            }).observe(liveRoot, { childList: true, subtree: true });
            NS.refreshCartCounts();
            NS._markHasOrderRows();
            return true;
        }

        // Poll DOM mỗi 2s CHỈ để chờ #liveContent xuất hiện (LiveCommentList load
        // async) rồi wire observer. Sau khi wire xong → observer + SSE tự lo refresh
        // khi list đổi → KHÔNG poll refreshCartCounts nữa (tránh load liên tục).
        let pollTries = 0;
        const pollTimer = setInterval(() => {
            pollTries++;
            if (_wireLiveObserver() || pollTries >= 60) {
                clearInterval(pollTimer);
            }
        }, 2000);
    }

    NS.init = init;

    // Thống kê GIỎ HÀNG WEB 2.0 (native_orders.products, KHÔNG phải giỏ Pancake) cho widget AI.
    // overview = ĐẦY ĐỦ (từ cartCounts /cart/batch/counts). topProducts = best-effort theo SP
    // (từ cartByCmt — chỉ giỏ đã mở chi tiết). Dùng cho gợi ý "Hỏi nhiều về SP nào" mà KHÔNG đọc comment.
    function getCartProductStats() {
        const S = NS.STATE || {};
        const counts = S.cartCounts || {};
        let customersWithCart = 0;
        let totalItems = 0;
        let totalQty = 0;
        for (const k in counts) {
            const c = counts[k];
            if (c && c.qty > 0) {
                customersWithCart++;
                totalItems += Number(c.items) || 0;
                totalQty += Number(c.qty) || 0;
            }
        }
        const prod = {};
        const cbc = S.cartByCmt;
        if (cbc && typeof cbc.forEach === 'function') {
            cbc.forEach((items) => {
                for (const it of items || []) {
                    const code = it.productCode || it.code;
                    if (!code) continue;
                    const p =
                        prod[code] ||
                        (prod[code] = {
                            code,
                            name: it.productName || it.name || '',
                            carts: 0,
                            qty: 0,
                        });
                    p.carts++;
                    p.qty += Number(
                        it.quantity != null ? it.quantity : it.qty != null ? it.qty : 1
                    );
                }
            });
        }
        const topProducts = Object.values(prod)
            .sort((a, b) => b.qty - a.qty)
            .slice(0, 30);
        return {
            cartType: 'web2 (native_orders)',
            overview: { customersWithCart, totalItems, totalQty },
            topProducts,
            cartsWithDetailLoaded: cbc?.size || 0,
            note: 'overview ĐẦY ĐỦ; topProducts chỉ tính giỏ đã mở chi tiết (cartByCmt) — có thể thiếu.',
        };
    }
    NS.getCartProductStats = getCartProductStats;

    global.PancakeInventoryPanel = {
        init,
        refresh: NS.refresh,
        addToCart: NS.addToCart,
        removeFromCart: NS.removeFromCart,
        refreshCartCounts: NS.refreshCartCounts,
        getCartProductStats, // số liệu giỏ Web 2.0 cho widget AI
        get STATE() {
            return NS.STATE;
        }, // expose state giỏ (products + cartCounts + cartByCmt) cho widget AI
        LS_TAB_KEY: NS.LS_TAB_KEY,
        DEFAULT_TAB: NS.DEFAULT_TAB,
    };
})(typeof window !== 'undefined' ? window : globalThis);
