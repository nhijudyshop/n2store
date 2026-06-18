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
        const prevState = product?.isActive;
        const u = window.AuthManager?.getCurrentUser?.() || {};
        if (window.Web2Optimistic?.run && product) {
            Web2Optimistic.run({
                snapshot: () => prevState,
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
                    if (product) product.isActive = prev;
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

    async function remove(code) {
        const ok = await window.Popup.danger(`Không thể hoàn tác.`, {
            title: `Xoá SP ${code}?`,
            okText: 'Xoá sản phẩm',
            cancelText: 'Đóng',
        });
        if (!ok) return;
        await _doRemove(code, false);
    }

    async function _doRemove(code, force) {
        try {
            await window.Web2ProductsApi.remove(code, { force });
            STATE.products = STATE.products.filter((x) => x.code !== code);
            STATE.total = Math.max(0, STATE.total - 1);
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
    // Uses dedicated Web2ProductsPrint module — no WEB2 API, pure local render.
    function printBarcode(code) {
        if (!window.Web2ProductsPrint?.open) {
            notify('Print module chưa load, refresh trang', 'error');
            return;
        }
        const p = STATE.products.find((x) => x.code === code);
        if (!p) {
            notify('Không tìm thấy sản phẩm', 'error');
            return;
        }
        window.Web2ProductsPrint.open([p]);
    }

    // Export to shared namespace.
    W.toggleActive = toggleActive;
    W.remove = remove;
    W._doRemove = _doRemove;
    W.copyCode = copyCode;
    W.printBarcode = printBarcode;
})();
