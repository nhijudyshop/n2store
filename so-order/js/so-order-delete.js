// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — row/shipment delete + trash UI (soft delete, restore, purge). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    /** Build confirm opts từ stock-check kết quả cho 1 row. */
    SO._buildRowDeleteConfirm = function _buildRowDeleteConfirm(stockCheck) {
        if (stockCheck && stockCheck.hasStock) {
            const it = stockCheck.items[0];
            return {
                title: '⚠️ Sản phẩm còn tồn kho',
                message: `SP "${it.name}${it.variant ? ' (' + it.variant + ')' : ''}" còn ${it.stock} cái tồn kho từ NCC ${it.supplier || '?'}.`,
                footNote: 'Xóa dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.',
                confirmText: 'Vẫn xóa',
                cancelText: 'Hủy',
                danger: true,
            };
        }
        return {
            title: 'Xóa dòng order?',
            message: 'Bạn có chắc muốn xóa dòng order này?',
            confirmText: 'Xóa',
            cancelText: 'Hủy',
            danger: true,
        };
    };

    SO.deleteRow = async function deleteRow(shipmentId, rowId) {
        const key = `row:${rowId}`;
        if (SO._pendingDeleteKeys.has(key)) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        if (r.status === 'received') {
            SO.notify('Dòng "Đã nhận" — không xóa được', 'warning');
            return;
        }
        const btn = document.querySelector(
            `[data-row-action='delete'][data-row-id='${CSS.escape(rowId)}']`
        );
        SO._markDeletePending(key, btn);
        try {
            // Fast path: cache ready → sync lookup → open popup với final
            // content NGAY, no loading flash.
            const syncResult = SO._checkRowsHaveStockSync([r]);
            let ok;
            if (syncResult) {
                ok = await SO.soConfirm(SO._buildRowDeleteConfirm(syncResult));
            } else {
                // Cold start fallback: cache đang load → mở popup với loading.
                // P1 2026-05-30: timeout 1.2s → bỏ qua check, dùng confirm
                // generic. User feedback "kiểm tra tồn kho quá lâu".
                const ctrl = SO.soConfirmOpen({
                    ..._buildRowDeleteConfirm(null),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                const STOCK_CHECK_TIMEOUT_MS = 1200;
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({
                        ..._buildRowDeleteConfirm(stockCheck),
                        loading: false,
                    });
                };
                const timer = setTimeout(() => finishWith(null), STOCK_CHECK_TIMEOUT_MS);
                SO._checkRowsHaveStock([r])
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
            const adj = { ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) };
            window.SoOrderStorage.deleteRow(SO.state, tab.id, shipmentId, rowId);
            SO.notify('Đã xóa dòng', 'info');
            if (adj.name && adj.delta !== 0) SO.adjustKhoPending([adj]);
            SO.pushSync();
            SO.renderAll();
        } finally {
            SO._unmarkDeletePending(key, btn);
        }
    };

    /** Build confirm opts từ stock-check kết quả cho cả 1 lô. */
    SO._buildShipmentDeleteConfirm = function _buildShipmentDeleteConfirm(stockCheck, n) {
        if (stockCheck && stockCheck.hasStock) {
            const lines = stockCheck.items
                .slice(0, 5)
                .map(
                    (it) =>
                        `${it.name}${it.variant ? ' (' + it.variant + ')' : ''}: ${it.stock} tồn từ ${it.supplier || '?'}`
                );
            if (stockCheck.items.length > 5) {
                lines.push(`... +${stockCheck.items.length - 5} SP nữa`);
            }
            return {
                title: `⚠️ Lô này có ${stockCheck.items.length} SP còn tồn kho`,
                message: 'Các sản phẩm dưới đây đã nhận hàng và còn stock trong Kho:',
                items: lines,
                footNote: `Xóa lô + ${n} dòng order sẽ mất link tracking nhưng KHÔNG xóa stock trong Kho.`,
                confirmText: 'Vẫn xóa lô',
                cancelText: 'Hủy',
                danger: true,
            };
        }
        return {
            title: 'Xóa lô?',
            message: `Xóa lô này + ${n} dòng order bên trong?`,
            confirmText: 'Xóa lô',
            cancelText: 'Hủy',
            danger: true,
        };
    };

    SO.deleteShipment = async function deleteShipment(shipmentId) {
        const key = `ship:${shipmentId}`;
        if (SO._pendingDeleteKeys.has(key)) return;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        if (!sh) return;
        const n = sh.rows.length;
        const btn = document.querySelector(
            `[data-shipment-action='delete-shipment'][data-shipment-id='${CSS.escape(shipmentId)}']`
        );
        SO._markDeletePending(key, btn);
        try {
            // Fast path: cache ready → sync lookup → final content luôn.
            const syncResult = SO._checkRowsHaveStockSync(sh.rows || []);
            let ok;
            if (syncResult) {
                ok = await SO.soConfirm(SO._buildShipmentDeleteConfirm(syncResult, n));
            } else {
                // Cold start fallback — timeout 1.2s để không treo lâu.
                const ctrl = SO.soConfirmOpen({
                    ..._buildShipmentDeleteConfirm(null, n),
                    loading: true,
                    loadingText: 'Đang kiểm tra tồn kho...',
                });
                let resolved = false;
                const finishWith = (stockCheck) => {
                    if (resolved || ctrl.closed) return;
                    resolved = true;
                    ctrl.update({
                        ..._buildShipmentDeleteConfirm(stockCheck, n),
                        loading: false,
                    });
                };
                const timer = setTimeout(() => finishWith(null), 1200);
                SO._checkRowsHaveStock(sh.rows || [])
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
            return SO._finalizeDeleteShipment(tab, sh, shipmentId);
        } finally {
            SO._unmarkDeletePending(key, btn);
        }
    };

    SO._finalizeDeleteShipment = function _finalizeDeleteShipment(tab, sh, shipmentId) {
        // 2026-05-30: nếu MỌI rows trong lô đã nhận (status='received') → soft
        // delete vào trash với retention 7 ngày. User có thể restore trong
        // "Thùng rác". Lô có draft/ordered rows vẫn hard delete như cũ.
        const rows = sh.rows || [];
        const allReceived = rows.length > 0 && rows.every((r) => r.status === 'received');
        if (allReceived) {
            const entry = window.SoOrderStorage.softDeleteShipment(SO.state, tab.id, shipmentId);
            if (entry) {
                SO.notify(`Đã chuyển lô vào Thùng rác. Tự xoá vĩnh viễn sau 7 ngày.`, 'info');
                SO.pushSync();
                SO.renderAll();
                return;
            }
        }
        const adjustments = rows
            .map((r) => ({ ..._rowToKhoMatch(r), delta: -(Number(r.qty) || 0) }))
            .filter((a) => a.name && a.delta !== 0);
        window.SoOrderStorage.deleteShipment(SO.state, tab.id, shipmentId);
        SO.notify('Đã xóa lô', 'info');
        if (adjustments.length) SO.adjustKhoPending(adjustments);
        SO.pushSync();
        SO.renderAll();
    };

    // ---------- Trash UI ----------

    SO._fmtTrashDate = function _fmtTrashDate(ts) {
        const d = new Date(Number(ts) || 0);
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    };

    SO._daysUntilPurge = function _daysUntilPurge(deletedAt) {
        const remainMs = 7 * 24 * 60 * 60 * 1000 - (Date.now() - Number(deletedAt));
        if (remainMs <= 0) return 0;
        return Math.ceil(remainMs / (24 * 60 * 60 * 1000));
    };

    SO.updateTrashCountBadge = function updateTrashCountBadge() {
        const badge = document.getElementById('soTrashCount');
        if (!badge) return;
        const trash = window.SoOrderStorage.getTrash(SO.state);
        if (!trash.length) {
            badge.hidden = true;
            badge.textContent = '0';
        } else {
            badge.hidden = false;
            badge.textContent = String(trash.length);
        }
    };

    SO.openTrashModal = function openTrashModal() {
        SO.renderTrashList();
        SO.showModal('soTrashModal');
    };

    SO.renderTrashList = function renderTrashList() {
        const list = document.getElementById('soTrashList');
        if (!list) return;
        const trash = [...window.SoOrderStorage.getTrash(SO.state)].sort(
            (a, b) => Number(b.deletedAt) - Number(a.deletedAt)
        );
        if (!trash.length) {
            list.innerHTML = `<div class="so-trash-empty">Thùng rác trống.</div>`;
            if (window.lucide?.createIcons) window.lucide.createIcons();
            return;
        }
        list.innerHTML = trash
            .map((entry) => {
                const sh = entry.shipment || {};
                const rows = sh.rows || [];
                const suppliers = Array.from(new Set(rows.map((r) => r.supplier).filter(Boolean)));
                const supplierLabel = suppliers.join(', ') || '—';
                const totalQty = rows.reduce((s, r) => s + (Number(r.qty) || 0), 0);
                const daysLeft = SO._daysUntilPurge(entry.deletedAt);
                const dateLabel = sh.batch
                    ? `Đợt ${SO.escapeHtml(sh.batch)}`
                    : SO.formatDateVN(sh.date) || '—';
                return `<div class="so-trash-card" data-trash-id="${SO.escapeHtml(entry.id)}">
                    <div class="so-trash-card-main">
                        <div class="so-trash-card-title">
                            <span class="so-trash-tab">${SO.escapeHtml(entry.tabLabel || entry.tabId)}</span>
                            <span class="so-trash-batch">${dateLabel}</span>
                        </div>
                        <div class="so-trash-card-sub">
                            <span><i data-lucide="store"></i> ${SO.escapeHtml(supplierLabel)}</span>
                            <span><i data-lucide="package"></i> ${rows.length} SP · ${totalQty} món</span>
                            <span><i data-lucide="clock"></i> Xoá ${SO.escapeHtml(SO._fmtTrashDate(entry.deletedAt))}</span>
                            <span class="so-trash-countdown ${daysLeft <= 1 ? 'is-urgent' : ''}">
                                <i data-lucide="hourglass"></i> Còn ${daysLeft} ngày
                            </span>
                        </div>
                    </div>
                    <div class="so-trash-card-actions">
                        <button class="btn-secondary" type="button" data-trash-action="restore" data-trash-id="${SO.escapeHtml(entry.id)}">
                            <i data-lucide="rotate-ccw"></i> Khôi phục
                        </button>
                        <button class="btn-danger" type="button" data-trash-action="purge" data-trash-id="${SO.escapeHtml(entry.id)}">
                            <i data-lucide="trash-2"></i> Xoá vĩnh viễn
                        </button>
                    </div>
                </div>`;
            })
            .join('');
        list.querySelectorAll('[data-trash-action]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const action = btn.dataset.trashAction;
                const id = btn.dataset.trashId;
                if (action === 'restore') SO.handleTrashRestore(id);
                else if (action === 'purge') SO.handleTrashPurge(id);
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO.handleTrashRestore = function handleTrashRestore(id) {
        const ok = window.SoOrderStorage.restoreFromTrash(SO.state, id);
        if (!ok) {
            SO.notify('Không tìm thấy entry để khôi phục', 'error');
            return;
        }
        SO.notify('Đã khôi phục lô', 'success');
        SO.pushSync();
        SO.renderAll();
        SO.updateTrashCountBadge();
        SO.renderTrashList();
    };

    SO.handleTrashPurge = async function handleTrashPurge(id) {
        const ok = await SO.soConfirm({
            title: 'Xoá vĩnh viễn?',
            body: 'Lô này sẽ bị xoá hoàn toàn, không thể khôi phục.',
            confirmText: 'Xoá vĩnh viễn',
            cancelText: 'Huỷ',
            danger: true,
        });
        if (!ok) return;
        window.SoOrderStorage.purgeFromTrash(SO.state, id);
        SO.notify('Đã xoá vĩnh viễn', 'info');
        SO.pushSync();
        SO.updateTrashCountBadge();
        SO.renderTrashList();
    };

    // Spam guard: track delete actions đang pending. Click lần 2 trên cùng
    // target → bỏ qua. CSS [data-pending-delete='1'] làm icon mờ.
    SO._pendingDeleteKeys = new Set();
    SO._markDeletePending = function _markDeletePending(key, btn) {
        SO._pendingDeleteKeys.add(key);
        if (btn) btn.dataset.pendingDelete = '1';
    };
    SO._unmarkDeletePending = function _unmarkDeletePending(key, btn) {
        SO._pendingDeleteKeys.delete(key);
        if (btn) delete btn.dataset.pendingDelete;
    };
})();
