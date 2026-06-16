// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   INLINE TAG XL EDITOR — cạnh nút Auto T
   Mục đích: khi mở chat TỪ thanh "Khách chưa trả lời" (unread strip), hiện dòng
   gắn Tag XL của ĐÚNG đơn đó cạnh nút Auto T để user trả lời xong gắn tag tại chỗ
   (vì bảng không cuộn về dòng đơn).

   - Mở từ thanh → show(orderId). Click ô khác trong thanh → đổi đơn.
   - Mở chat KHÔNG từ thanh (cột TIN NHẮN/BÌNH LUẬN trong bảng) → ẩn editor.
   - Tái dụng window.renderProcessingTagCell(orderCode) (nút gán + chip), khoá theo
     order.Code; CSS .tagxl-inline ép layout NGANG.
   - Đồng bộ: wrap window._ptagRefreshRow → re-render editor khi orderCode trùng.
   ===================================================== */

(function () {
    'use strict';

    if (window.__tagxlInlineLoaded) return;
    window.__tagxlInlineLoaded = true;

    const HOST_ID = 'tagxlInlineEditor';
    let _container = null;
    let currentCode = null;
    let currentOrderId = null;
    let _fromStrip = false;

    function getHost() {
        if (!_container) _container = document.getElementById(HOST_ID);
        return _container;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    }

    function lookupOrder(orderId) {
        if (!orderId) return null;
        try {
            if (window.OrderStore && typeof window.OrderStore.get === 'function') {
                const o = window.OrderStore.get(orderId);
                if (o) return o;
            }
        } catch (e) {}
        const arr = window.displayedData || window.allData || [];
        return arr.find((o) => String(o.Id) === String(orderId)) || null;
    }

    function buildLabel(order) {
        const stt = order.SessionIndex != null ? order.SessionIndex : '';
        const name = order.Name || order.PartnerName || 'Khách';
        return (
            `<span class="tagxl-inline__label"><i class="fas fa-tags"></i> ` +
            (stt !== '' ? `STT ${escapeHtml(stt)} · ` : '') +
            `<span class="tagxl-inline__name">${escapeHtml(name)}</span></span>`
        );
    }

    function renderCellHtml() {
        if (!currentCode || typeof window.renderProcessingTagCell !== 'function') return '';
        try {
            return window.renderProcessingTagCell(currentCode);
        } catch (e) {
            console.warn('[TagXLInline] renderProcessingTagCell failed:', e && e.message);
            return '';
        }
    }

    /* Hiện editor cho 1 đơn (gọi từ thanh). */
    function show(orderId) {
        const host = getHost();
        if (!host) return;
        const order = lookupOrder(orderId);
        if (!order || !order.Code) {
            hide();
            return;
        }
        currentOrderId = orderId;
        currentCode = order.Code;
        host.innerHTML =
            buildLabel(order) +
            `<div class="tagxl-inline__cell">${renderCellHtml()}</div>` +
            `<button type="button" class="tagxl-inline__close" title="Ẩn" ` +
            `onclick="window.TagXLInline && window.TagXLInline.hide()">&times;</button>`;
        host.classList.add('has-order');
    }

    function hide() {
        const host = getHost();
        if (host) {
            host.classList.remove('has-order');
            host.innerHTML = '';
        }
        currentCode = null;
        currentOrderId = null;
    }

    /* Re-render chỉ phần cell (giữ label) — gọi sau mutation Tag XL. */
    function rerender() {
        const host = getHost();
        if (!host || !currentCode) return;
        const cell = host.querySelector('.tagxl-inline__cell');
        if (cell) cell.innerHTML = renderCellHtml();
    }

    /* Mở chat từ thanh: đánh dấu nguồn → mở chat → hiện editor đơn đó. */
    function openFromStrip(orderId, pageId, psid, ev) {
        _fromStrip = true;
        try {
            if (typeof window.showConversationPicker === 'function') {
                window.showConversationPicker(orderId, pageId, psid, ev);
            }
        } finally {
            // safety net: nếu showConversationPicker không gọi openChatModal đồng bộ
            setTimeout(() => {
                _fromStrip = false;
            }, 0);
        }
        show(orderId);
    }

    function init() {
        if (!getHost()) return;
        wrapOnce();
        window.TagXLInline = { show, hide, rerender, openFromStrip };
    }

    /* Wrap các hàm global (sau khi chat-core + processing-tags đã load ở DOMContentLoaded). */
    function wrapOnce() {
        if (window.__tagxlInlineWrapped) return;
        window.__tagxlInlineWrapped = true;

        // Mở chat KHÔNG phải từ thanh (và khác đơn đang bind) → ẩn editor.
        if (typeof window.openChatModal === 'function') {
            const origOpen = window.openChatModal;
            window.openChatModal = function (orderId) {
                try {
                    if (!_fromStrip && String(orderId) !== String(currentOrderId)) hide();
                } catch (e) {}
                _fromStrip = false;
                return origOpen.apply(this, arguments);
            };
        }

        // Mở khung comment (luôn ngoài luồng thanh) → ẩn editor.
        if (typeof window.openCommentModal === 'function') {
            const origCmt = window.openCommentModal;
            window.openCommentModal = function () {
                try {
                    hide();
                } catch (e) {}
                return origCmt.apply(this, arguments);
            };
        }

        // Sau mỗi mutation Tag XL, hệ thống gọi _ptagRefreshRow(orderCode) cho cell
        // trong bảng → đồng bộ luôn inline editor khi trùng đơn.
        if (typeof window._ptagRefreshRow === 'function') {
            const origRefresh = window._ptagRefreshRow;
            window._ptagRefreshRow = function (orderCode) {
                const r = origRefresh.apply(this, arguments);
                try {
                    if (currentCode && String(orderCode) === String(currentCode)) rerender();
                } catch (e) {}
                return r;
            };
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
