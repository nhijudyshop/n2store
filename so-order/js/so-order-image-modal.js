// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — inline image edit modal + lightbox. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    SO.openLightbox = function openLightbox(src) {
        const lb = document.getElementById('soLightbox');
        const img = document.getElementById('soLightboxImg');
        if (lb && img) {
            img.src = src;
            lb.hidden = false;
        }
    };

    SO.hideLightbox = function hideLightbox() {
        const lb = document.getElementById('soLightbox');
        if (lb) lb.hidden = true;
    };

    // ---------- image upload (base64) ----------
    // Multi-row modal: image picker/paste/drop wiring now lives per-row in
    // wireModalRowInputs() + wireModalImagePasteDrop(). The helpers below
    // are shared between rows.

    SO.openInlineImageModal = function openInlineImageModal(rowId, shipmentId, field) {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const sh = tab.shipments.find((s) => s.id === shipmentId);
        const r = sh?.rows.find((x) => x.id === rowId);
        if (!r) return;
        const currentUrl = r[field] || '';
        SO.inlineImageCtx = { rowId, shipmentId, field, currentUrl, newUrl: currentUrl };
        const title = field === 'productImage' ? 'Sửa ảnh sản phẩm' : 'Sửa ảnh hóa đơn';
        const titleEl = document.getElementById('soInlineImageTitle');
        if (titleEl) titleEl.textContent = title;
        const urlInput = document.getElementById('soInlineImageUrl');
        if (urlInput) urlInput.value = currentUrl;
        SO._refreshInlineImagePreview(currentUrl);
        SO.showModal('soInlineImageModal');
        if (window.lucide?.createIcons) window.lucide.createIcons();
        setTimeout(() => {
            document.getElementById('soInlineImageDrop')?.focus();
        }, 60);
    };

    SO._refreshInlineImagePreview = function _refreshInlineImagePreview(url) {
        const prev = document.getElementById('soInlineImagePreview');
        if (!prev) return;
        if (url && url.length < 1024 * 1024 * 3) {
            prev.innerHTML = `<img src="${SO.escapeHtml(url)}" alt="Preview" />`;
        } else if (url) {
            prev.innerHTML = `<img src="${SO.escapeHtml(url)}" alt="Preview" />`;
        } else {
            prev.innerHTML = `<div class="so-inline-img-empty">Chưa có ảnh — paste/drop/click để thêm</div>`;
        }
    };

    SO._saveInlineImage = function _saveInlineImage() {
        if (!SO.inlineImageCtx) return SO.hideModal('soInlineImageModal');
        const { rowId, shipmentId, field } = SO.inlineImageCtx;
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const urlInput = document.getElementById('soInlineImageUrl');
        const newUrl = (urlInput?.value || SO.inlineImageCtx.newUrl || '').trim();
        // P1 2026-05-30: invoiceImage = share toàn group → broadcast tất cả
        // rows cùng invoiceGroupId trong shipment. productImage vẫn per-row.
        if (field === 'invoiceImage') {
            const sh = tab.shipments.find((s) => s.id === shipmentId);
            const row = sh?.rows.find((r) => r.id === rowId);
            const gid = row?.invoiceGroupId;
            if (gid && window.SoOrderStorage.updateInvoiceImageForGroup) {
                const n = window.SoOrderStorage.updateInvoiceImageForGroup(
                    SO.state,
                    tab.id,
                    shipmentId,
                    gid,
                    newUrl
                );
                SO.notify(
                    n > 1 ? `Đã lưu ảnh hóa đơn cho ${n} SP cùng nhóm` : 'Đã lưu ảnh hóa đơn',
                    'success'
                );
            } else {
                window.SoOrderStorage.updateRow(SO.state, tab.id, shipmentId, rowId, {
                    [field]: newUrl,
                });
                SO.notify('Đã lưu ảnh', 'success');
            }
        } else {
            window.SoOrderStorage.updateRow(SO.state, tab.id, shipmentId, rowId, {
                [field]: newUrl,
            });
            SO.notify('Đã lưu ảnh', 'success');
        }
        SO.pushSync();
        SO.renderAll();
        SO.flashRow(rowId);
        SO.hideModal('soInlineImageModal');
        SO.inlineImageCtx = null;
    };

    SO._clearInlineImage = function _clearInlineImage() {
        const urlInput = document.getElementById('soInlineImageUrl');
        if (urlInput) urlInput.value = '';
        if (SO.inlineImageCtx) SO.inlineImageCtx.newUrl = '';
        SO._refreshInlineImagePreview('');
    };

    SO.wireInlineImageModal = function wireInlineImageModal() {
        const drop = document.getElementById('soInlineImageDrop');
        if (drop && window.Web2Effects?.attachImageDropTarget) {
            window.Web2Effects.attachImageDropTarget(drop, {
                onResult(url) {
                    const urlInput = document.getElementById('soInlineImageUrl');
                    if (urlInput) urlInput.value = url;
                    if (SO.inlineImageCtx) SO.inlineImageCtx.newUrl = url;
                    SO._refreshInlineImagePreview(url);
                },
                notify: SO.notify,
            });
        }
        const urlInput = document.getElementById('soInlineImageUrl');
        urlInput?.addEventListener('input', () => {
            const v = urlInput.value.trim();
            if (SO.inlineImageCtx) SO.inlineImageCtx.newUrl = v;
            SO._refreshInlineImagePreview(v);
        });
        document
            .getElementById('soInlineImageSaveBtn')
            ?.addEventListener('click', SO._saveInlineImage);
        document
            .getElementById('soInlineImageClearBtn')
            ?.addEventListener('click', SO._clearInlineImage);
    };
})();
