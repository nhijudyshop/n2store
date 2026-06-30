// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2 Products — row actions / mutations: toggleActive, remove (+ force),
 * copyCode, printBarcode. Giữ nguyên await + Popup.confirm + optimistic.
 * [SPLIT 2026-06-18] tách từ web2-products-app.js. Namespace nội bộ
 * window.Web2ProductsCore (W). Cross-module call qua W.foo(...).
 */

(function () {
    'use strict';

    const W = (window.Web2ProductsCore = window.Web2ProductsCore || {});
    const STATE = W.STATE;
    const notify = W.notify;

    // UI-first: badge toggle NGAY, PATCH background. Lỗi → rollback isActive.
    function toggleActive(code, newState) {
        const product = STATE.products.find((p) => p.code === code);
        // Deep-ish snapshot (shallow clone của product) để rollback khôi phục ĐÚNG
        // bản gốc — KHÔNG dựa vào primitive đã có thể bị mutate bởi onSuccess/SSE
        // trong lúc await. Mutate object live thì rollback từ bản clone là an toàn.
        const prevSnapshot = product ? { ...product } : null;
        const u = window.AuthManager?.getCurrentUser?.() || {};
        if (window.Web2Optimistic?.run && product) {
            Web2Optimistic.run({
                snapshot: () => prevSnapshot,
                apply: () => {
                    product.isActive = newState;
                    const ok = W._updateRowInPlace(code, product);
                    if (!ok) W.renderRows();
                },
                run: async () => {
                    return await window.Web2ProductsApi.update(code, {
                        isActive: newState,
                        userId: u.uid || u.email || null,
                        userName: u.displayName || u.email || null,
                        sourcePage: 'products',
                    });
                },
                onSuccess: (resp) => {
                    if (resp.product) {
                        Object.assign(product, resp.product);
                        const ok = W._updateRowInPlace(code, resp.product);
                        if (!ok) W.renderRows();
                    }
                },
                rollback: (prev) => {
                    // prev = clone bản gốc → khôi phục isActive (field optimistic đã đổi).
                    if (product && prev) product.isActive = prev.isActive;
                    const ok = W._updateRowInPlace(code, product);
                    if (!ok) W.renderRows();
                },
                successMsg: newState ? 'Đã bật bán' : 'Đã tạm dừng',
                errLabel: `toggle ${code}`,
            });
        } else {
            (async () => {
                try {
                    const resp = await window.Web2ProductsApi.update(code, {
                        isActive: newState,
                        userId: u.uid || u.email || null,
                        userName: u.displayName || u.email || null,
                        sourcePage: 'products',
                    });
                    if (resp.product) {
                        const ok = W._updateRowInPlace(code, resp.product);
                        if (!ok) W.renderRows();
                    }
                    notify(newState ? 'Đã bật bán' : 'Đã tạm dừng', 'success');
                } catch (e) {
                    notify('Lỗi: ' + e.message, 'error');
                }
            })();
        }
    }

    // Chống double-submit: theo dõi code đang trong luồng xoá (await confirm + DELETE +
    // 409 force-confirm). Click lặp / double-click bị bỏ qua tới khi luồng kết thúc.
    const _removingCodes = new Set();

    async function remove(code) {
        if (_removingCodes.has(code)) return; // bỏ qua click reentrant
        _removingCodes.add(code);
        try {
            const ok = await window.Popup.danger(`Không thể hoàn tác.`, {
                title: `Xoá SP ${code}?`,
                okText: 'Xoá sản phẩm',
                cancelText: 'Đóng',
            });
            if (!ok) return;
            await _doRemove(code, false);
        } finally {
            _removingCodes.delete(code);
        }
    }

    async function _doRemove(code, force) {
        try {
            await window.Web2ProductsApi.remove(code, { force });
            STATE.products = STATE.products.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
            // Dọn code khỏi multi-select để bulk-bar không giữ entry "ma" của SP đã xoá
            // (chỉ luồng SSE-echo ở app.js mới xoá khỏi Set → local delete cũng phải xoá).
            if (STATE.selectedCodes?.delete(code)) W._updateBulkBar?.();
            W.renderRows();
            W.renderPagination();
            W.renderCounters();
            notify(`Đã xóa ${code}`, 'success');
            window.Web2ProductsCache?.pushTickle?.({ action: 'delete', code });
        } catch (e) {
            // 409 = SP còn pending_qty > 0, cảnh báo user trước khi force.
            if (e.status === 409 && e.body) {
                const b = e.body;
                const msg = `${b.message || ''}\n\nVẫn muốn xóa SP "${b.name}" (${b.code})?`;
                const confirmForce = await window.Popup.danger(msg, {
                    title: `SP còn ${b.pendingQty} cái CHỜ HÀNG`,
                    okText: 'Vẫn xóa',
                    cancelText: 'Hủy',
                });
                if (confirmForce) await _doRemove(code, true);
                return;
            }
            notify('Lỗi xóa: ' + e.message, 'error');
        }
    }

    function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => notify(`Đã copy ${code}`, 'success'));
        }
    }

    // Open print barcode dialog for a single product (by code).
    // PER-UNIT (logic mới): gắn mã đơn vị + QR đã mint (in LẠI đúng tem từng món) như
    // bulk print. SP chưa có unit → hành vi cũ (lặp mã SP). Clone để không bẩn cache.
    async function printBarcode(code) {
        if (!window.Web2ProductsPrint?.open) {
            notify('Print module chưa load, refresh trang', 'error');
            return;
        }
        const p = STATE.products.find((x) => x.code === code);
        if (!p) {
            notify('Không tìm thấy sản phẩm', 'error');
            return;
        }
        const item = { ...p };
        if (W._attachUnitsForPrint) await W._attachUnitsForPrint([item]);
        window.Web2ProductsPrint.open([item]);
    }

    // Export to shared namespace.
    W.toggleActive = toggleActive;
    W.remove = remove;
    W._doRemove = _doRemove;
    W.copyCode = copyCode;
    W.printBarcode = printBarcode;
})();
