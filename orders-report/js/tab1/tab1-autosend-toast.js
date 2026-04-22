// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Auto-Send Bill Progress Toast
 *
 * Lightweight floating toast (bottom-right) showing realtime progress of
 * the parallel auto-send-bill pipeline (after Fast Sale creates invoices).
 *
 * Contract (called by tab1-fast-sale-workflow.js > autoSendBillsIfEnabled):
 *   - window.showAutoSendToast(progress)     // open toast
 *   - window.updateAutoSendToast(progress)   // update counter
 *   - window.finishAutoSendToast(progress, errors)  // mark done, auto-dismiss on success
 *
 * progress = { total, sent, failed, done }
 *
 * @version 1.0.0
 */
(function () {
    'use strict';

    const TOAST_ID = 'autoSendBillToast';
    const AUTO_DISMISS_MS = 5000;

    let autoDismissTimer = null;
    let currentErrors = [];

    function buildToast() {
        let toast = document.getElementById(TOAST_ID);
        if (toast) return toast;

        toast = document.createElement('div');
        toast.id = TOAST_ID;
        toast.className = 'autosend-toast';
        toast.innerHTML = `
            <div class="autosend-toast__header">
                <i class="fab fa-facebook-messenger autosend-toast__icon"></i>
                <span class="autosend-toast__title">Đang gửi bill...</span>
                <button type="button" class="autosend-toast__close" aria-label="Đóng" data-action="close">&times;</button>
            </div>
            <div class="autosend-toast__body">
                <div class="autosend-toast__progress">
                    <div class="autosend-toast__bar"><div class="autosend-toast__fill" style="width:0%"></div></div>
                    <div class="autosend-toast__counter">0 / 0</div>
                </div>
                <div class="autosend-toast__stats">
                    <span class="autosend-toast__stat autosend-toast__stat--sent">
                        <i class="fas fa-check-circle"></i> <span data-slot="sent">0</span> thành công
                    </span>
                    <span class="autosend-toast__stat autosend-toast__stat--failed" style="display:none;">
                        <i class="fas fa-exclamation-circle"></i> <span data-slot="failed">0</span> lỗi
                    </span>
                </div>
            </div>
            <div class="autosend-toast__errors" style="display:none;"></div>
        `;
        document.body.appendChild(toast);

        toast.addEventListener('click', (e) => {
            const closeBtn = e.target.closest('[data-action="close"]');
            if (closeBtn) {
                hideToast();
                return;
            }
            // Toggle error panel ONLY when clicking header and errors exist
            const onHeader = !!e.target.closest('.autosend-toast__header');
            if (onHeader && currentErrors.length > 0) {
                const panel = toast.querySelector('.autosend-toast__errors');
                if (panel) {
                    panel.style.display = panel.style.display === 'block' ? 'none' : 'block';
                }
            }
        });

        return toast;
    }

    function hideToast() {
        const toast = document.getElementById(TOAST_ID);
        if (!toast) return;
        toast.classList.remove('autosend-toast--visible');
        setTimeout(() => {
            if (toast.parentNode) toast.parentNode.removeChild(toast);
        }, 300);
        if (autoDismissTimer) {
            clearTimeout(autoDismissTimer);
            autoDismissTimer = null;
        }
        currentErrors = [];
    }

    function render(progress) {
        const toast = document.getElementById(TOAST_ID);
        if (!toast) return;

        const { total = 0, sent = 0, failed = 0, done = 0 } = progress || {};
        const pct = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

        const fill = toast.querySelector('.autosend-toast__fill');
        if (fill) fill.style.width = pct + '%';

        const counter = toast.querySelector('.autosend-toast__counter');
        if (counter) counter.textContent = `${done} / ${total}`;

        const sentSlot = toast.querySelector('[data-slot="sent"]');
        if (sentSlot) sentSlot.textContent = String(sent);

        const failedSlot = toast.querySelector('[data-slot="failed"]');
        const failedStat = toast.querySelector('.autosend-toast__stat--failed');
        if (failedSlot) failedSlot.textContent = String(failed);
        if (failedStat) failedStat.style.display = failed > 0 ? 'inline-flex' : 'none';
    }

    window.showAutoSendToast = function showAutoSendToast(progress) {
        if (autoDismissTimer) {
            clearTimeout(autoDismissTimer);
            autoDismissTimer = null;
        }
        currentErrors = [];
        const toast = buildToast();
        // Reset stale visual state from a previous run (done/errors classes)
        toast.classList.remove('autosend-toast--done', 'autosend-toast--has-errors');
        const title = toast.querySelector('.autosend-toast__title');
        if (title) title.textContent = 'Đang gửi bill...';
        const errorPanel = toast.querySelector('.autosend-toast__errors');
        if (errorPanel) {
            errorPanel.style.display = 'none';
            errorPanel.innerHTML = '';
        }
        render(progress);
        // Force reflow → enable transition
        void toast.offsetWidth;
        toast.classList.add('autosend-toast--visible');
    };

    window.updateAutoSendToast = function updateAutoSendToast(progress) {
        render(progress);
    };

    window.finishAutoSendToast = function finishAutoSendToast(progress, errors) {
        const toast = document.getElementById(TOAST_ID);
        if (!toast) return;

        render(progress);
        currentErrors = Array.isArray(errors) ? errors.slice() : [];

        const title = toast.querySelector('.autosend-toast__title');
        if (progress.failed > 0) {
            toast.classList.add('autosend-toast--has-errors');
            if (title) title.textContent = `Hoàn thành (${progress.failed} lỗi — click để xem)`;
            // Populate error panel
            const panel = toast.querySelector('.autosend-toast__errors');
            if (panel) {
                const items = currentErrors.slice(0, 10).map((msg) => {
                    const safe = String(msg)
                        .replace(/&/g, '&amp;')
                        .replace(/</g, '&lt;')
                        .replace(/>/g, '&gt;');
                    return `<li>${safe}</li>`;
                });
                const extra = currentErrors.length > 10
                    ? `<li style="opacity:.7;">... và ${currentErrors.length - 10} lỗi khác (xem console)</li>`
                    : '';
                panel.innerHTML = `<ul>${items.join('')}${extra}</ul>`;
            }
            // Sticky — don't auto-dismiss when there are errors
        } else {
            toast.classList.add('autosend-toast--done');
            if (title) title.textContent = 'Đã gửi bill xong';
            autoDismissTimer = setTimeout(hideToast, AUTO_DISMISS_MS);
        }
    };

    // Manual close (for tests or external use)
    window.hideAutoSendToast = hideToast;
})();
