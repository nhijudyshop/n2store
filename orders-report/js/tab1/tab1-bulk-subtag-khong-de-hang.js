// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// BULK ASSIGN SUBTAG "KHÔNG ĐỂ HÀNG" THEO STT
// Trigger: nút "+" trên row "KHÔNG ĐỂ HÀNG" trong panel Chốt Đơn
// =====================================================

(function () {
    'use strict';

    const LOG = '[BULK-KDH]';
    const MODAL_ID = 'bulkSubtagKhongDeHangModal';
    const SUBTAG_KEY = 'KHONG_DE_HANG';
    const CATEGORY = 3; // KHÔNG CẦN CHỐT

    // State
    let parsedSTTs = []; // {stt, order|null, error|null}

    // ===== Parse helpers =====
    // Hỗ trợ "1, 2, 3", "1-5", "1 5-10 15", xuống dòng đều OK.
    function parseSTTInput(raw) {
        const result = new Set();
        if (!raw || !raw.trim()) return [];
        const parts = raw.split(/[,\s\n]+/).filter((p) => p.trim());
        for (let part of parts) {
            part = part.trim();
            if (!part) continue;
            if (part.includes('-')) {
                const [a, b] = part.split('-').map((n) => parseInt(n.trim(), 10));
                if (Number.isFinite(a) && Number.isFinite(b) && a <= b && b - a < 10000) {
                    for (let i = a; i <= b; i++) result.add(i);
                }
            } else {
                const n = parseInt(part, 10);
                if (Number.isFinite(n) && n > 0) result.add(n);
            }
        }
        return Array.from(result).sort((x, y) => x - y);
    }

    function findOrderBySTT(stt) {
        if (window.OrderStore && typeof window.OrderStore.getBySTT === 'function') {
            const o = window.OrderStore.getBySTT(stt);
            if (o) return o;
        }
        const list = (typeof window.displayedData !== 'undefined' && window.displayedData) || [];
        return list.find((o) => o && o.SessionIndex === stt) || null;
    }

    // ===== Open / close =====
    function openModal() {
        const modal = document.getElementById(MODAL_ID);
        if (!modal) {
            console.error(LOG, 'Modal element not found');
            return;
        }
        // Reset state
        parsedSTTs = [];
        const ta = document.getElementById('bulkKdhSttInput');
        if (ta) ta.value = '';
        renderPreview();
        modal.classList.add('show');
        // Focus input
        setTimeout(() => ta && ta.focus(), 50);
    }

    function closeModal() {
        const modal = document.getElementById(MODAL_ID);
        if (modal) modal.classList.remove('show');
    }

    // ===== Preview =====
    function onInputChange() {
        const raw = (document.getElementById('bulkKdhSttInput') || {}).value || '';
        const stts = parseSTTInput(raw);
        parsedSTTs = stts.map((stt) => {
            const order = findOrderBySTT(stt);
            return {
                stt,
                order,
                error: order ? null : 'STT không tồn tại trong danh sách hiện tại',
            };
        });
        renderPreview();
    }

    function renderPreview() {
        const previewEl = document.getElementById('bulkKdhPreview');
        const summaryEl = document.getElementById('bulkKdhSummary');
        const confirmBtn = document.getElementById('bulkKdhConfirmBtn');
        if (!previewEl || !summaryEl || !confirmBtn) return;

        const validCount = parsedSTTs.filter((p) => p.order).length;
        const errorCount = parsedSTTs.length - validCount;

        if (parsedSTTs.length === 0) {
            previewEl.innerHTML = `<div class="bulk-kdh-empty"><i class="fas fa-inbox"></i><p>Nhập STT để xem trước đơn hàng sẽ được gán tag.</p></div>`;
            summaryEl.textContent = '';
            confirmBtn.disabled = true;
            return;
        }

        const rowsHtml = parsedSTTs
            .map((p) => {
                if (p.order) {
                    const name = p.order.Name || p.order.PartnerName || '(không tên)';
                    const code = p.order.Code || '';
                    return `<div class="bulk-kdh-row bulk-kdh-row--ok">
                        <span class="bulk-kdh-stt">STT ${p.stt}</span>
                        <span class="bulk-kdh-name">${escapeHtml(name)}</span>
                        <span class="bulk-kdh-code">${escapeHtml(code)}</span>
                        <i class="fas fa-check-circle bulk-kdh-ok-icon"></i>
                    </div>`;
                }
                return `<div class="bulk-kdh-row bulk-kdh-row--err">
                    <span class="bulk-kdh-stt">STT ${p.stt}</span>
                    <span class="bulk-kdh-err-msg"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(p.error || '')}</span>
                </div>`;
            })
            .join('');
        previewEl.innerHTML = rowsHtml;

        summaryEl.innerHTML = `<span class="bulk-kdh-count-ok">${validCount} hợp lệ</span>${errorCount > 0 ? ` · <span class="bulk-kdh-count-err">${errorCount} lỗi</span>` : ''}`;
        confirmBtn.disabled = validCount === 0;
    }

    function escapeHtml(s) {
        return String(s || '').replace(
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

    // ===== Apply =====
    async function executeAssign() {
        const valid = parsedSTTs.filter((p) => p.order);
        if (valid.length === 0) return;

        if (typeof window.assignOrderCategory !== 'function') {
            const msg = 'window.assignOrderCategory chưa sẵn sàng — vui lòng tải lại trang.';
            console.error(LOG, msg);
            window.notificationManager?.error?.(msg, 4000) || alert(msg);
            return;
        }

        const confirmBtn = document.getElementById('bulkKdhConfirmBtn');
        if (confirmBtn) {
            confirmBtn.disabled = true;
            confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang gán...';
        }

        let success = 0;
        let failed = 0;
        const errors = [];

        for (const p of valid) {
            try {
                await window.assignOrderCategory(p.order.Code, CATEGORY, {
                    subTag: SUBTAG_KEY,
                    source: 'Bulk KHÔNG ĐỂ HÀNG',
                });
                success++;
            } catch (e) {
                failed++;
                errors.push(`STT ${p.stt}: ${(e && e.message) || e}`);
                console.error(LOG, 'Assign failed for STT', p.stt, e);
            }
        }

        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check"></i> Xác nhận gán';
        }

        const msg =
            `Đã gán "KHÔNG ĐỂ HÀNG" cho ${success}/${valid.length} đơn` +
            (failed > 0 ? ` (${failed} lỗi)` : '');
        if (window.notificationManager) {
            (failed > 0 ? window.notificationManager.warning : window.notificationManager.success)(
                msg,
                4000
            );
        } else {
            alert(msg + (errors.length ? '\n\n' + errors.slice(0, 5).join('\n') : ''));
        }

        if (success > 0) {
            // Refresh panel để cập nhật count
            if (typeof window.renderPanelContent === 'function') {
                try {
                    window.renderPanelContent();
                } catch (e) {
                    /* noop */
                }
            }
            closeModal();
        }
    }

    // ===== Wire up =====
    function attachInputListener() {
        const ta = document.getElementById('bulkKdhSttInput');
        if (ta && !ta._bulkKdhWired) {
            ta.addEventListener('input', onInputChange);
            ta._bulkKdhWired = true;
        }
    }

    // Public API
    window.openBulkSubtagKhongDeHangModal = function () {
        attachInputListener();
        openModal();
    };
    window.closeBulkSubtagKhongDeHangModal = closeModal;
    window.executeBulkSubtagKhongDeHangAssign = executeAssign;

    // Close on backdrop click
    document.addEventListener('click', (e) => {
        const modal = document.getElementById(MODAL_ID);
        if (modal && modal.classList.contains('show') && e.target === modal) {
            closeModal();
        }
    });

    // Close on ESC
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        const modal = document.getElementById(MODAL_ID);
        if (modal && modal.classList.contains('show')) closeModal();
    });
})();
