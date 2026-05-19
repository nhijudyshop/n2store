// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// COLUMN TOGGLE - INVENTORY TRACKING
// Per-column hide/show for the invoice tables. State
// persisted via UIState. Hover any <th> → eye-off icon
// hides that column across all .invoice-table elements.
// Toolbar button "Cột ẩn (N)" opens a panel to restore.
// =====================================================

window.ColumnToggle = (function () {
    'use strict';

    // Column metadata. The `key` is the CSS class on <th>/<td>.
    // Labels are shown in restore chips and tooltips.
    const COL_META = [
        { key: 'col-ncc', label: 'NCC' },
        { key: 'col-stt', label: 'STT' },
        { key: 'col-sku', label: 'Mã hàng' },
        { key: 'col-desc', label: 'Mô tả' },
        { key: 'col-colors', label: 'Chi tiết màu' },
        { key: 'col-qty', label: 'Tổng SL' },
        { key: 'col-price', label: 'Đơn giá' },
        { key: 'col-amount', label: 'Tiền HĐ' },
        { key: 'col-total', label: 'Tổng Món' },
        { key: 'col-shortage', label: 'Thiếu' },
        { key: 'col-image', label: 'Ảnh' },
        { key: 'col-invoice-note', label: 'Ghi Chú' },
        { key: 'col-cost', label: 'Chi Phí' },
        { key: 'col-cost-note', label: 'Ghi Chú CP' },
    ];

    const STYLE_ID = 'invColumnToggleCss';
    const BTN_CLASS = 'col-hide-btn';
    let _panelOpen = false;

    function _labelFor(key) {
        const meta = COL_META.find((c) => c.key === key);
        return meta ? meta.label : key;
    }

    function _applyCss() {
        const hidden = UIState.getHiddenCols();
        let style = document.getElementById(STYLE_ID);
        if (!style) {
            style = document.createElement('style');
            style.id = STYLE_ID;
            document.head.appendChild(style);
        }
        if (hidden.length === 0) {
            style.textContent = '';
            return;
        }
        const selectors = hidden
            .map((k) => `.invoice-table th.${k}, .invoice-table td.${k}`)
            .join(', ');
        style.textContent = `${selectors} { display: none !important; }`;
    }

    function _renderToolbarBadge() {
        const btn = document.getElementById('btnHiddenCols');
        if (!btn) return;
        const hidden = UIState.getHiddenCols();
        const countEl = btn.querySelector('.hidden-cols-count');
        if (countEl) countEl.textContent = hidden.length;
        btn.classList.toggle('has-hidden-cols', hidden.length > 0);
    }

    function _attachThButtons() {
        // Idempotent: only add if not already there
        const ths = document.querySelectorAll('.invoice-table thead th');
        ths.forEach((th) => {
            // Find the col-X class on this th
            const colKey = Array.from(th.classList).find((c) => c.startsWith('col-'));
            if (!colKey) return;
            if (th.querySelector(`.${BTN_CLASS}`)) return;

            const btn = document.createElement('button');
            btn.className = BTN_CLASS;
            btn.type = 'button';
            btn.title = `Ẩn cột "${_labelFor(colKey)}"`;
            btn.dataset.colKey = colKey;
            btn.innerHTML =
                '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.526 13.526 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><line x1="2" y1="2" x2="22" y2="22"/></svg>';
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                hide(colKey);
            });
            th.appendChild(btn);
        });
    }

    function _renderPanel() {
        const panel = document.getElementById('hiddenColsPanel');
        if (!panel) return;
        const hidden = UIState.getHiddenCols();

        if (hidden.length === 0) {
            panel.innerHTML = `
                <div class="hidden-cols-empty">
                    Không có cột nào ẩn. Hover vào tiêu đề cột → bấm <span class="hidden-cols-eye-hint">👁︎</span> để ẩn.
                </div>
            `;
            return;
        }

        const chips = hidden
            .map(
                (key) => `
                <button class="hidden-col-chip" data-col-key="${key}" title="Hiện lại cột này">
                    <span>${_labelFor(key)}</span>
                    <i data-lucide="plus" style="width:12px;height:12px"></i>
                </button>
            `
            )
            .join('');

        panel.innerHTML = `
            <div class="hidden-cols-header">
                <strong>Cột đang ẩn (${hidden.length})</strong>
                <button class="hidden-cols-show-all" type="button">
                    <i data-lucide="eye"></i> Hiện tất cả
                </button>
            </div>
            <div class="hidden-cols-chip-list">${chips}</div>
        `;

        panel.querySelectorAll('.hidden-col-chip').forEach((el) => {
            el.addEventListener('click', () => show(el.dataset.colKey));
        });
        const showAll = panel.querySelector('.hidden-cols-show-all');
        if (showAll) showAll.addEventListener('click', showAll_handler);

        if (window.lucide) lucide.createIcons();
    }

    function showAll_handler() {
        UIState.clearHiddenCols();
        _applyCss();
        _renderToolbarBadge();
        _renderPanel();
    }

    function togglePanel(force) {
        const panel = document.getElementById('hiddenColsPanel');
        if (!panel) return;
        const next = force !== undefined ? force : !_panelOpen;
        _panelOpen = next;
        panel.classList.toggle('open', next);
        if (next) _renderPanel();
    }

    function hide(colKey) {
        UIState.hideCol(colKey);
        _applyCss();
        _renderToolbarBadge();
        if (_panelOpen) _renderPanel();
    }

    function show(colKey) {
        UIState.showCol(colKey);
        _applyCss();
        _renderToolbarBadge();
        _renderPanel();
    }

    function refresh() {
        _applyCss();
        _attachThButtons();
        _renderToolbarBadge();
        if (_panelOpen) _renderPanel();
    }

    function init() {
        _applyCss();

        // Toolbar button listener
        const btn = document.getElementById('btnHiddenCols');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                togglePanel();
            });
        }

        // Close panel on outside click
        document.addEventListener('click', (e) => {
            if (!_panelOpen) return;
            const panel = document.getElementById('hiddenColsPanel');
            const btn = document.getElementById('btnHiddenCols');
            if (panel && !panel.contains(e.target) && btn && !btn.contains(e.target)) {
                togglePanel(false);
            }
        });

        // Watch the table containers for re-renders; re-attach hide buttons each time.
        const target = document.body;
        const observer = new MutationObserver((mutations) => {
            let hasNewTh = false;
            for (const m of mutations) {
                for (const node of m.addedNodes) {
                    if (
                        node.nodeType === 1 &&
                        node.querySelector?.('table.invoice-table thead th')
                    ) {
                        hasNewTh = true;
                        break;
                    }
                }
                if (hasNewTh) break;
            }
            if (hasNewTh) _attachThButtons();
        });
        observer.observe(target, { childList: true, subtree: true });

        _attachThButtons();
        _renderToolbarBadge();
    }

    return {
        init,
        hide,
        show,
        refresh,
        togglePanel,
    };
})();

console.log('[COL-TOGGLE] Column toggle module loaded');
