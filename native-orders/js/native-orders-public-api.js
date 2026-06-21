// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — public API (window.NativeOrdersApp) + DOMContentLoaded init. Builds NativeOrdersApp LAST. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    window.NativeOrdersApp = {
        openEdit: NO.openEdit,
        quickStatus: NO.quickStatus,
        openDeliveryMenu: NO.openDeliveryMenu,
        setDeliveryMethod: NO.setDeliveryMethod,
        createPbh: NO.createPbh,
        cancelPbh: NO.cancelPbh,
        cancelPbhFromEdit: NO.cancelPbhFromEdit,
        setLineNote: NO.setLineNote,
        cancelOrder: NO.cancelOrder,
        splitPbh: NO.splitPbh,
        splitOrder: NO.splitOrder,
        removeOrder: NO.removeOrder,
        bulkCreatePbh: NO.bulkCreatePbh,
        bulkSendMessage: NO.bulkSendMessage,
        // 2026-06-09: XEM bill 1 đơn (icon 🖨) — preview đúng loại theo trạng thái,
        // KHÔNG auto-in, KHÔNG bump print_count khi mở (in thật qua nút trong preview).
        viewOrderBill: NO.viewOrderBill,
        // Exposed for Web2MsgTemplate (port từ orders-report) — gọi extension
        // qua window.postMessage bridge với promise wrapper + timeout.
        _extensionRequest: NO._extensionRequest,
        unselectAllOrders: NO.unselectAllOrders,
        copyCode: NO.copyCode,
        // 2026-06-21: bấm pill TAG (cột Thẻ) → popup lý do chi tiết (SP chờ hàng /
        // SP âm mã + ai đang giữ). Web2OrderTagDetail (shared).
        openTagDetail: NO.openTagDetail,
        goPage: NO.goPage,
        toggleFilter: NO.toggleFilter,
        toggleExpand: NO.toggleExpand,
        openCustomer: NO.openCustomer,
        filterByCustomer: NO.filterByCustomer,
        clearCustomerFilter: NO.clearCustomerFilter,
        // Phase 18: interactions modal (Tin nhắn + Bình luận)
        openInteractions: NO.openInteractions,
        _closeInteractions: NO._closeInteractions,
        _refreshInteractionsIfOpen: NO._refreshInteractionsIfOpen,
        // Product picker + line management (inline onclicks)
        addLineFromPicker: NO.addLineFromPicker,
        changeLineQty: NO.changeLineQty,
        setLineQty: NO.setLineQty,
        removeLine: NO.removeLine,
        // Livestream snapshot per-line — click thumbnail mở lightbox
        openSnapLightbox: NO.openSnapLightbox,
        // Customer side-panel (slide-in từ phải khi hover avatar 500ms)
        onCustAvatarEnter: NO._onCustAvatarEnter,
        onCustAvatarLeave: NO._onCustAvatarLeave,
        // 2026-06-01: nút "Lấy WEB2" thủ công khi đơn từ web2-pancake rỗng phone/address
        fetchCustomerFromWeb2: NO.fetchCustomerFromWeb2,
        // Debug surface — inspect realtime + livestream snapshot cache from devtools.
        // (Chat-thread debug helpers — chatState/injectFakeMessage — removed when the
        // bespoke chat modal was retired; chat now lives in Web2CustomerChat which has
        // its own realtime via Web2ChatPanel.)
        _debug: {
            get realtimeStatus() {
                return {
                    wsConnected: !!window.Web2Realtime?.isConnected(),
                    wsUrl: window.Web2Realtime?._internal?.WS_URL,
                    subscriberCount: window.Web2Realtime?._internal?.subscribers?.length,
                };
            },
            // Inspect livestream snapshot cache (per-line thumbnails từ WEB2-Pancake).
            get snapCache() {
                return Object.fromEntries(NO._snapCache);
            },
            // Simulate khi EDIT_LINES có fbCommentId — inject vào current modal +
            // re-render. Test wiring không cần thật sự kéo SP.
            simulateLineCommentId(idx, commentId) {
                if (!NO.EDIT_LINES[idx]) return { err: 'no line at idx ' + idx };
                NO.EDIT_LINES[idx].fbCommentId = commentId;
                NO.renderOrderLines();
                return { ok: true, line: NO.EDIT_LINES[idx] };
            },
        },
    };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', NO.init);
    } else {
        NO.init();
    }
})();
