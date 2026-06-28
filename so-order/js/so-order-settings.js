// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — tab settings (currency/rate/ship-meta), tab delete, column visibility. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // Tab settings modal — currency + rate
    SO.openTabSettingsModal = function openTabSettingsModal(forNew) {
        const form = document.getElementById('soTabSettingsForm');
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        if (forNew) {
            form.elements.label.value = '';
            form.elements.currency.value = 'VND';
            form.elements.rate.value = 1;
            form.dataset.mode = 'create';
            document.getElementById('soTabDeleteBtn').style.display = 'none';
        } else {
            form.elements.label.value = tab.label;
            form.elements.currency.value = tab.currency;
            form.elements.rate.value = tab.rate;
            form.dataset.mode = 'edit';
            form.dataset.tabId = tab.id;
            // Don't allow deleting last tab
            document.getElementById('soTabDeleteBtn').style.display =
                SO.state.tabs.length > 1 ? '' : 'none';
        }
        // Per-field checkboxes thông tin lô. Tab mới → tất cả OFF; tab cũ → theo
        // flag per-field (backward-compat từ showShipMeta gộp).
        const flags = forNew ? {} : SO._shipMetaFlags(tab);
        for (const f of SO.SHIP_META_FIELDS) {
            const cb = form.elements['showMeta_' + f.key];
            if (cb) cb.checked = !!flags[f.key];
        }
        SO._syncShipMetaAllCheckbox();
        // 2026-06-28: chế độ thanh toán + bật Quản lý ảnh (per-tab).
        if (form.elements.paymentMode)
            form.elements.paymentMode.value =
                !forNew && tab.paymentMode === 'supplier' ? 'supplier' : 'batch';
        if (form.elements.imageManager)
            form.elements.imageManager.checked = forNew ? false : !!tab.imageManager;
        SO.showModal('soTabSettingsModal');
        setTimeout(() => form.elements.label.focus(), 80);
    };

    // Master "Chọn tất cả" ↔ 6 checkbox con. Bind 1 lần.
    SO._wireShipMetaAll = function _wireShipMetaAll() {
        const form = document.getElementById('soTabSettingsForm');
        const all = document.getElementById('soShipMetaAll');
        if (!form || !all || all.__bound) return;
        all.__bound = true;
        all.addEventListener('change', () => {
            for (const f of SO.SHIP_META_FIELDS) {
                const cb = form.elements['showMeta_' + f.key];
                if (cb) cb.checked = all.checked;
            }
        });
        for (const f of SO.SHIP_META_FIELDS) {
            const cb = form.elements['showMeta_' + f.key];
            if (cb) cb.addEventListener('change', SO._syncShipMetaAllCheckbox);
        }
    };

    SO._syncShipMetaAllCheckbox = function _syncShipMetaAllCheckbox() {
        const form = document.getElementById('soTabSettingsForm');
        const all = document.getElementById('soShipMetaAll');
        if (!form || !all) return;
        const states = SO.SHIP_META_FIELDS.map(
            (f) => !!form.elements['showMeta_' + f.key]?.checked
        );
        all.checked = states.every(Boolean);
        all.indeterminate = !all.checked && states.some(Boolean);
    };

    SO.handleTabSettingsSubmit = function handleTabSettingsSubmit(e) {
        e.preventDefault();
        const form = e.target;
        const mode = form.dataset.mode;
        const shipMetaFields = {};
        for (const f of SO.SHIP_META_FIELDS) {
            shipMetaFields[f.key] = !!form.elements['showMeta_' + f.key]?.checked;
        }
        const patch = {
            label: form.elements.label.value.trim() || 'Tab',
            currency: form.elements.currency.value,
            rate: Number(form.elements.rate.value) || 1,
            shipMetaFields,
            // Giữ showShipMeta cho backward-compat = có ÍT NHẤT 1 field bật.
            showShipMeta: Object.values(shipMetaFields).some(Boolean),
            paymentMode: form.elements.paymentMode?.value === 'supplier' ? 'supplier' : 'batch',
            imageManager: !!form.elements.imageManager?.checked,
        };
        if (mode === 'create') {
            window.SoOrderStorage.addTab(SO.state, patch);
            SO.notify('Đã thêm tab', 'success');
        } else {
            window.SoOrderStorage.updateTab(SO.state, form.dataset.tabId, patch);
            SO.notify('Đã cập nhật tab', 'success');
        }
        SO.hideModal('soTabSettingsModal');
        SO.pushSync();
        SO.renderAll();
    };

    SO.handleTabDelete = async function handleTabDelete() {
        const form = document.getElementById('soTabSettingsForm');
        const tabId = form.dataset.tabId;
        if (!tabId) return;
        const key = `tab:${tabId}`;
        if (SO._pendingDeleteKeys.has(key)) return;
        const tab = SO.state.tabs.find((t) => t.id === tabId);
        if (!tab) return;
        const allRows = [];
        for (const sh of tab.shipments || []) {
            for (const r of sh.rows || []) allRows.push(r);
        }
        const btn = document.getElementById('soTabDeleteBtn');
        SO._markDeletePending(key, btn);
        try {
            // P1 2026-05-29 fix orphan bug: trước đây deleteTab() bỏ qua adjust
            // pending qty của các rows trong tab → pending stuck ở web2_products.
            const buildOpts = (stockCheck) => {
                if (stockCheck && stockCheck.hasStock) {
                    const lines = stockCheck.items
                        .slice(0, 5)
                        .map((it) => `${it.name}: ${it.stock} tồn từ ${it.supplier || '?'}`);
                    if (stockCheck.items.length > 5) {
                        lines.push(`... +${stockCheck.items.length - 5} SP nữa`);
                    }
                    return {
                        title: `⚠️ Tab có ${stockCheck.items.length} SP còn tồn kho`,
                        message: `Tab này có ${allRows.length} dòng order và các SP dưới đây còn stock trong Kho:`,
                        items: lines,
                        footNote: 'Xóa tab sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.',
                        confirmText: 'Vẫn xóa tab',
                        cancelText: 'Hủy',
                        danger: true,
                    };
                }
                return {
                    title: 'Xóa tab?',
                    message: `Xóa tab và toàn bộ ${allRows.length} order trong tab này?`,
                    confirmText: 'Xóa tab',
                    cancelText: 'Hủy',
                    danger: true,
                };
            };
            const syncResult = SO._checkRowsHaveStockSync(allRows);
            let ok;
            if (syncResult) {
                ok = await SO.soConfirm(buildOpts(syncResult));
            } else {
                const ctrl = SO.soConfirmOpen({
                    ...buildOpts(null),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({ ...buildOpts(stockCheck), loading: false });
                };
                const timer = setTimeout(() => finishWith(null), 1200);
                SO._checkRowsHaveStock(allRows)
                    .then((stockCheck) => {
                        clearTimeout(timer);
                        finishWith(stockCheck);
                    })
                    .catch((e) => {
                        console.warn('[so-order] stock check fail:', e.message);
                        clearTimeout(timer);
                        finishWith(null);
                    });
                ok = await ctrl.result;
            }
            if (!ok) return;
            // Trừ pending cho rows trước khi delete tab.
            const adjustments = allRows
                .map((r) => ({ ...SO._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) }))
                .filter((a) => a.name && a.delta !== 0);
            if (window.SoOrderStorage.deleteTab(SO.state, tabId)) {
                if (adjustments.length) SO.adjustKhoPending(adjustments);
                SO.notify('Đã xóa tab', 'info');
                SO.hideModal('soTabSettingsModal');
                SO.pushSync();
                SO.renderAll();
            } else {
                SO.notify('Cần giữ lại ít nhất 1 tab', 'warning');
            }
        } finally {
            SO._unmarkDeletePending(key, btn);
        }
    };

    // Column visibility modal (per-tab — title shows which tab the
    // settings apply to so user doesn't think it's global).
    SO.openColumnModal = function openColumnModal() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const colVis = window.SoOrderStorage.getColumnVisibility(tab);
        const list = document.getElementById('soColumnList');
        // Update modal heading to reflect per-tab scope
        const modalHead = document.querySelector('#soColumnModal .so-modal-head h2');
        if (modalHead) modalHead.textContent = `Ẩn / hiện cột — tab "${tab.label}"`;
        list.innerHTML = SO.COLUMNS.map(
            (c) => `<label class="so-col-toggle">
                <input type="checkbox" data-col-key="${SO.escapeHtml(c.key)}" ${colVis[c.key] ? 'checked' : ''} />
                <span>${SO.escapeHtml(c.label)}</span>
            </label>`
        ).join('');
        list.querySelectorAll('input[type=checkbox]').forEach((input) => {
            input.addEventListener('change', () => {
                window.SoOrderStorage.setColumnVisibility(
                    SO.state,
                    tab.id,
                    input.dataset.colKey,
                    input.checked
                );
                SO.pushSync();
                SO.renderAll();
            });
        });
        SO.showModal('soColumnModal');
    };
})();
