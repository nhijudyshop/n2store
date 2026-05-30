// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// TABLE TOUCH SCROLL — drag-to-scroll cho table-container.
//
// iPad + trackpad đã pan native qua touch / two-finger swipe nhờ
// `overflow-x: auto`. JS này bổ sung **mouse / pen drag-to-scroll** cho
// vùng trống của bảng: nhấn giữ chuột rồi kéo ngang/dọc để pan, giống
// behavior của Excel / Google Sheets trên desktop.
//
// Tránh trigger khi user click vào control (button, input, link, td có
// editable, drag handle) — chỉ kích hoạt ở vùng chrome (table padding,
// shipment background, table header trống).
// =====================================================

(function () {
    'use strict';

    const SKIP_SELECTORS =
        'button, a, input, select, textarea, label, ' +
        '.editable-cell, .drag-stt, .ncc-name, .pkg-check-label, ' +
        '.pkg-check-all-label, .ncc-done-label, .shipment-actions, ' +
        '.shipment-hidden-badge, .shipment-packages-badge, .col-image, ' +
        '.col-shortage, .stt-num, .sub-invoice-indicator';

    // Threshold giữ trước khi xác nhận đây là drag (px). Dưới threshold thì
    // event vẫn truyền cho click handler bên trong.
    const DRAG_THRESHOLD = 6;

    function initContainer(container) {
        if (container.dataset.touchScrollInit === '1') return;
        container.dataset.touchScrollInit = '1';

        let pointerId = null;
        let startX = 0;
        let startY = 0;
        let scrollLeftStart = 0;
        let scrollTopStart = 0;
        let isDragging = false;
        let armed = false;

        function onPointerDown(e) {
            // Bỏ qua khi user chạm vào control hoặc nội dung tương tác.
            if (e.target.closest(SKIP_SELECTORS)) return;
            // Chỉ trái-chuột (button 0) hoặc touch/pen.
            if (e.pointerType === 'mouse' && e.button !== 0) return;

            pointerId = e.pointerId;
            startX = e.clientX;
            startY = e.clientY;
            scrollLeftStart = container.scrollLeft;
            scrollTopStart = container.scrollTop;
            armed = true;
            isDragging = false;
        }

        function onPointerMove(e) {
            if (!armed || e.pointerId !== pointerId) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            if (!isDragging) {
                if (Math.abs(dx) < DRAG_THRESHOLD && Math.abs(dy) < DRAG_THRESHOLD) return;
                isDragging = true;
                container.classList.add('is-dragging');
                try {
                    container.setPointerCapture(pointerId);
                } catch (_) {
                    /* ignore */
                }
            }

            container.scrollLeft = scrollLeftStart - dx;
            container.scrollTop = scrollTopStart - dy;
            // Chặn text-select & native scroll khi đang drag.
            e.preventDefault();
        }

        function onPointerEnd(e) {
            if (e.pointerId !== pointerId) return;
            if (isDragging) {
                try {
                    container.releasePointerCapture(pointerId);
                } catch (_) {
                    /* ignore */
                }
                container.classList.remove('is-dragging');
                // Suppress click vừa kết thúc kéo để không trigger handler.
                const suppressClick = (ev) => {
                    ev.stopPropagation();
                    ev.preventDefault();
                    container.removeEventListener('click', suppressClick, true);
                };
                container.addEventListener('click', suppressClick, true);
                setTimeout(() => {
                    container.removeEventListener('click', suppressClick, true);
                }, 50);
            }
            pointerId = null;
            armed = false;
            isDragging = false;
        }

        container.addEventListener('pointerdown', onPointerDown);
        container.addEventListener('pointermove', onPointerMove);
        container.addEventListener('pointerup', onPointerEnd);
        container.addEventListener('pointercancel', onPointerEnd);
    }

    function scanAndInit() {
        document
            .querySelectorAll('.shipment-table-section .table-container')
            .forEach(initContainer);
    }

    // Re-scan mỗi khi DOM được render thêm shipment-card. Render path bắn
    // event `render:done` ở cuối applyFiltersAndRender (best-effort — nếu
    // không có cũng OK vì MutationObserver bên dưới sẽ phát hiện).
    document.addEventListener('render:done', scanAndInit);

    // MutationObserver bắt các DOM update mà render path không phát event.
    const obs = new MutationObserver((mutations) => {
        for (const m of mutations) {
            for (const node of m.addedNodes) {
                if (node.nodeType !== 1) continue;
                if (
                    node.matches?.('.shipment-table-section .table-container') ||
                    node.querySelector?.('.shipment-table-section .table-container')
                ) {
                    scanAndInit();
                    return;
                }
            }
        }
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            scanAndInit();
            obs.observe(document.body, { childList: true, subtree: true });
        });
    } else {
        scanAndInit();
        obs.observe(document.body, { childList: true, subtree: true });
    }

    console.log('[TOUCH-SCROLL] Table drag-to-scroll initialized');
})();
