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

    global.PancakeInventoryPanel = {
        init,
        refresh: NS.refresh,
        addToCart: NS.addToCart,
        removeFromCart: NS.removeFromCart,
        refreshCartCounts: NS.refreshCartCounts,
        LS_TAB_KEY: NS.LS_TAB_KEY,
        DEFAULT_TAB: NS.DEFAULT_TAB,
    };
})(typeof window !== 'undefined' ? window : globalThis);
