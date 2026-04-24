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

    // State — MỖI ENTRY là 1 candidate: {stt, order|null, error|null, selected, key}
    // 1 STT input có thể expand thành nhiều entry nếu nhiều đơn cùng SessionIndex.
    let parsedSTTs = [];

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

    // Trả về TẤT CẢ đơn có SessionIndex = stt (có thể trùng giữa các session live).
    // Dedup theo Code/Id. Đơn trong displayedData được đặt trước (priority) để user chọn dễ.
    function findAllOrdersBySTT(stt) {
        const seen = new Map(); // key = Code || Id, value = order
        const matches = (o) =>
            o && (o.SessionIndex === stt || String(o.SessionIndex) === String(stt));
        const add = (o) => {
            if (!o) return;
            const key = o.Code || o.Id;
            if (key && !seen.has(key)) seen.set(key, o);
        };
        // 1. displayedData trước (đơn user đang nhìn trong bảng).
        const list =
            (typeof window.displayedData !== 'undefined' && window.displayedData) || [];
        list.filter(matches).forEach(add);
        // 2. OrderStore.getAll() — quét toàn bộ dataset để thấy mọi STT trùng.
        if (window.OrderStore && typeof window.OrderStore.getAll === 'function') {
            try {
                window.OrderStore.getAll().filter(matches).forEach(add);
            } catch (_) {
                // Fallback nếu getAll lỗi: dùng getBySTT (chỉ trả 1 đơn).
                if (typeof window.OrderStore.getBySTT === 'function') {
                    add(window.OrderStore.getBySTT(stt));
                }
            }
        }
        return Array.from(seen.values());
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
        // displayedData lookup nhanh để mark đơn nào "đang trong bảng".
        const displayedCodes = new Set(
            ((typeof window.displayedData !== 'undefined' && window.displayedData) || [])
                .map((o) => o && (o.Code || o.Id))
                .filter(Boolean)
        );
        // Giữ trạng thái selected cũ theo key (stt+Code) khi user gõ thêm/bớt.
        const prevSel = new Map(parsedSTTs.map((p) => [p.key, p.selected]));
        const next = [];
        for (const stt of stts) {
            const orders = findAllOrdersBySTT(stt);
            if (orders.length === 0) {
                next.push({
                    stt,
                    order: null,
                    error: 'STT không tồn tại trong danh sách',
                    selected: false,
                    key: `err:${stt}`,
                });
                continue;
            }
            for (const order of orders) {
                const code = order.Code || order.Id || '';
                const key = `${stt}:${code}`;
                const isDuplicate = orders.length > 1;
                const inDisplayed = displayedCodes.has(code);
                // Default selection rules:
                //  - Giữ nguyên nếu user đã tick/untick rồi.
                //  - Nếu chỉ 1 đơn: tick mặc định.
                //  - Nếu nhiều đơn (duplicate): chỉ tick đơn nằm trong bảng hiện tại
                //    (để user thấy ngay đơn đúng) — đơn khác mặc định untick.
                //    Nếu KHÔNG đơn nào trong bảng → untick hết, user phải tự chọn.
                const defaultSel = isDuplicate ? inDisplayed : true;
                next.push({
                    stt,
                    order,
                    error: null,
                    selected: prevSel.has(key) ? prevSel.get(key) : defaultSel,
                    key,
                    isDuplicate,
                    inDisplayed,
                });
            }
        }
        parsedSTTs = next;
        renderPreview();
    }

    function toggleRow(key, checked) {
        const row = parsedSTTs.find((p) => p.key === key);
        if (row) {
            row.selected = !!checked;
            updateSummaryAndConfirm();
            updateSelectAllCheckbox();
        }
    }

    function toggleSelectAll(checked) {
        parsedSTTs.forEach((p) => {
            if (p.order) p.selected = !!checked;
        });
        renderPreview(); // Re-render để cập nhật checkbox
    }

    function updateSelectAllCheckbox() {
        const cb = document.getElementById('bulkKdhSelectAllCb');
        if (!cb) return;
        const valid = parsedSTTs.filter((p) => p.order);
        const sel = valid.filter((p) => p.selected).length;
        cb.checked = valid.length > 0 && sel === valid.length;
        cb.indeterminate = sel > 0 && sel < valid.length;
    }

    function updateSummaryAndConfirm() {
        const summaryEl = document.getElementById('bulkKdhSummary');
        const confirmBtn = document.getElementById('bulkKdhConfirmBtn');
        if (!summaryEl || !confirmBtn) return;
        const valid = parsedSTTs.filter((p) => p.order);
        const selected = valid.filter((p) => p.selected).length;
        const errorCount = parsedSTTs.length - valid.length;
        summaryEl.innerHTML =
            `<span class="bulk-kdh-count-ok">${selected}/${valid.length} chọn</span>` +
            (errorCount > 0 ? ` · <span class="bulk-kdh-count-err">${errorCount} lỗi</span>` : '');
        confirmBtn.disabled = selected === 0;
        confirmBtn.innerHTML = `<i class="fas fa-check"></i> Xác nhận gán${selected > 0 ? ` (${selected})` : ''}`;
    }

    function renderPreview() {
        const previewEl = document.getElementById('bulkKdhPreview');
        const toolbarEl = document.getElementById('bulkKdhToolbar');
        if (!previewEl) return;

        if (parsedSTTs.length === 0) {
            previewEl.innerHTML = `<div class="bulk-kdh-empty"><i class="fas fa-inbox"></i><p>Nhập STT để xem trước đơn hàng sẽ được gán tag.</p></div>`;
            if (toolbarEl) toolbarEl.style.display = 'none';
            updateSummaryAndConfirm();
            return;
        }

        if (toolbarEl) toolbarEl.style.display = '';

        const rowsHtml = parsedSTTs
            .map((p) => {
                if (p.order) {
                    const name = p.order.Name || p.order.PartnerName || '(không tên)';
                    const code = p.order.Code || p.order.Id || '';
                    const checked = p.selected ? 'checked' : '';
                    const dupBadge = p.isDuplicate
                        ? `<span class="bulk-kdh-dup-badge" title="Có nhiều đơn cùng STT — hãy chọn đơn đúng">trùng STT</span>`
                        : '';
                    const inViewBadge = p.isDuplicate && p.inDisplayed
                        ? `<span class="bulk-kdh-inview-badge" title="Đơn này đang hiện trong bảng">trong bảng</span>`
                        : '';
                    return `<label class="bulk-kdh-row bulk-kdh-row--ok ${checked ? '' : 'bulk-kdh-row--unchecked'}">
                        <input type="checkbox" class="bulk-kdh-row-cb" ${checked} data-key="${escapeAttr(p.key)}" />
                        <span class="bulk-kdh-stt">STT ${p.stt}</span>
                        <span class="bulk-kdh-name">${escapeHtml(name)}</span>
                        <span class="bulk-kdh-code">${escapeHtml(code)}</span>
                        ${inViewBadge}
                        ${dupBadge}
                    </label>`;
                }
                return `<div class="bulk-kdh-row bulk-kdh-row--err">
                    <span class="bulk-kdh-stt">STT ${p.stt}</span>
                    <span class="bulk-kdh-err-msg"><i class="fas fa-exclamation-triangle"></i> ${escapeHtml(p.error || '')}</span>
                </div>`;
            })
            .join('');
        previewEl.innerHTML = rowsHtml;

        // Wire checkbox listeners
        previewEl.querySelectorAll('.bulk-kdh-row-cb').forEach((cb) => {
            cb.addEventListener('change', (e) => {
                const key = cb.getAttribute('data-key');
                toggleRow(key, e.target.checked);
                const row = cb.closest('.bulk-kdh-row');
                if (row) row.classList.toggle('bulk-kdh-row--unchecked', !e.target.checked);
            });
        });

        updateSelectAllCheckbox();
        updateSummaryAndConfirm();
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

    // Cho data-attribute — chỉ cần escape quote.
    function escapeAttr(s) {
        return String(s || '').replace(/"/g, '&quot;');
    }

    // ===== Apply =====
    async function executeAssign() {
        // Chỉ gán những row được chọn (selected !== false) và có order hợp lệ.
        const targets = parsedSTTs.filter((p) => p.order && p.selected !== false);
        if (targets.length === 0) return;

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

        for (const p of targets) {
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
            `Đã gán "KHÔNG ĐỂ HÀNG" cho ${success}/${targets.length} đơn` +
            (failed > 0 ? ` (${failed} lỗi)` : '');
        if (window.notificationManager) {
            // Gọi trực tiếp trên object để giữ `this` — ternary rồi call() sẽ mất context.
            if (failed > 0) window.notificationManager.warning(msg, 4000);
            else window.notificationManager.success(msg, 4000);
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
        const selectAllCb = document.getElementById('bulkKdhSelectAllCb');
        if (selectAllCb && !selectAllCb._bulkKdhWired) {
            selectAllCb.addEventListener('change', (e) => toggleSelectAll(e.target.checked));
            selectAllCb._bulkKdhWired = true;
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
