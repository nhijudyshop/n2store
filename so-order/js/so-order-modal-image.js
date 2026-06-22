// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — modal image paste/drop (per-row + order-invoice cell). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // P1 2026-05-30: paste image cell helper — show thumbnail card khi đã
    // có ảnh thay vì input "data:image/jpeg;base..." raw. User feedback
    // "area khi paste hình làm đẹp hơn".
    SO._imgPasteCellHtml = function _imgPasteCellHtml(row, fieldName) {
        const val = row[fieldName] || '';
        const isDataUrl = val.startsWith('data:');
        const inputValueDisplay = isDataUrl ? '' : val;
        const placeholderText = val ? 'Đổi URL (xóa input để thay ảnh)' : 'Hoặc dán URL';
        const hasImg = !!val;
        return `
            <div class="so-img-cell-v2${hasImg ? ' has-image' : ''}" tabindex="0" data-img-cell data-uid="${row.uid}" data-img-name="${fieldName}">
                ${
                    hasImg
                        ? `<div class="so-img-thumb-wrap">
                                <img class="so-img-thumb" src="${SO.escapeHtml(val)}" alt="" onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22300%22%20height=%22300%22%3E%3Crect%20width=%22300%22%20height=%22300%22%20fill=%22%23eef2f7%22/%3E%3Ctext%20x=%22150%22%20y=%22165%22%20font-family=%22sans-serif%22%20font-size=%2248%22%20fill=%22%23b6c2d2%22%20text-anchor=%22middle%22%3E%E2%80%94%3C/text%3E%3C/svg%3E';}" />
                                <button type="button" class="so-img-thumb-clear" data-uid="${row.uid}" data-img-name="${fieldName}" title="Xóa ảnh"><i data-lucide="x"></i></button>
                                <div class="so-img-thumb-label"><i data-lucide="check-circle-2"></i> Đã có ảnh</div>
                           </div>`
                        : `<div class="so-img-cell-hint">
                                <i data-lucide="clipboard-paste"></i>
                                <span>Ctrl+V / Kéo thả ảnh</span>
                           </div>`
                }
                <input
                    type="text"
                    data-field="${fieldName}"
                    data-uid="${row.uid}"
                    placeholder="${placeholderText}"
                    class="so-input-v2 so-input-mini so-input-url"
                    value="${SO.escapeHtml(inputValueDisplay)}"
                />
            </div>`;
    };

    // 2026-06-16: Ảnh hóa đơn cấp ĐƠN (1 ô ở header modal) — thay cột ảnh per-row
    // (đã bỏ). Giá trị đổ xuống mọi row khi set/lưu.
    SO._orderInvoiceImageHtml = function _orderInvoiceImageHtml() {
        const val = SO.modalInvoiceImage || '';
        const isDataUrl = val.startsWith('data:');
        const inputValueDisplay = isDataUrl ? '' : val;
        const placeholderText = val ? 'Đổi URL (xóa input để thay ảnh)' : 'Hoặc dán URL';
        const hasImg = !!val;
        return `
            <div class="so-img-cell-v2${hasImg ? ' has-image' : ''}" tabindex="0" data-order-invoice-cell>
                ${
                    hasImg
                        ? `<div class="so-img-thumb-wrap">
                                <img class="so-img-thumb" src="${SO.escapeHtml(val)}" alt="" onerror="if(!this.dataset.fb){this.dataset.fb=1;this.src='data:image/svg+xml,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20width=%22300%22%20height=%22300%22%3E%3Crect%20width=%22300%22%20height=%22300%22%20fill=%22%23eef2f7%22/%3E%3Ctext%20x=%22150%22%20y=%22165%22%20font-family=%22sans-serif%22%20font-size=%2248%22%20fill=%22%23b6c2d2%22%20text-anchor=%22middle%22%3E%E2%80%94%3C/text%3E%3C/svg%3E';}" />
                                <button type="button" class="so-img-thumb-clear" data-order-invoice-clear title="Xóa ảnh"><i data-lucide="x"></i></button>
                                <div class="so-img-thumb-label"><i data-lucide="check-circle-2"></i> Đã có ảnh</div>
                           </div>`
                        : `<div class="so-img-cell-hint">
                                <i data-lucide="clipboard-paste"></i>
                                <span>Ctrl+V / Kéo thả ảnh</span>
                           </div>`
                }
                <input
                    type="text"
                    data-order-invoice-url
                    placeholder="${placeholderText}"
                    class="so-input-v2 so-input-mini so-input-url"
                    value="${SO.escapeHtml(inputValueDisplay)}"
                />
            </div>`;
    };

    SO._renderOrderInvoiceImage = function _renderOrderInvoiceImage() {
        const host = document.getElementById('soOrderInvoiceImageCell');
        if (!host) return;
        host.innerHTML = SO._orderInvoiceImageHtml();
        if (window.lucide?.createIcons) window.lucide.createIcons();
        SO._wireOrderInvoiceImage();
    };

    // Set ảnh hóa đơn của đơn → đổ xuống MỌI row hiện có + re-render ô header.
    SO._setOrderInvoiceImage = function _setOrderInvoiceImage(val) {
        SO.modalInvoiceImage = val || '';
        for (const r of SO.modalRows) r.invoiceImage = SO.modalInvoiceImage;
        SO._renderOrderInvoiceImage();
    };

    SO._wireOrderInvoiceImage = function _wireOrderInvoiceImage() {
        const cell = document.querySelector('[data-order-invoice-cell]');
        if (!cell) return;
        const urlInput = cell.querySelector('[data-order-invoice-url]');
        if (urlInput) {
            urlInput.addEventListener('input', () => {
                SO.modalInvoiceImage = urlInput.value.trim();
                for (const r of SO.modalRows) r.invoiceImage = SO.modalInvoiceImage;
            });
            // Gõ/paste URL thường (không phải data:) → re-render để hiện thumbnail.
            urlInput.addEventListener('change', () => {
                const v = urlInput.value.trim();
                if (v && !v.startsWith('data:')) SO._setOrderInvoiceImage(v);
            });
        }
        const clearBtn = cell.querySelector('[data-order-invoice-clear]');
        if (clearBtn) clearBtn.addEventListener('click', () => SO._setOrderInvoiceImage(''));
        // Ctrl+V / kéo-thả ảnh (resize + nén JPEG qua Web2Effects như cell cũ).
        if (window.Web2Effects?.attachImageDropTarget) {
            window.Web2Effects.attachImageDropTarget(cell, {
                noClickPicker: true,
                onResult(dataUrl) {
                    SO._setOrderInvoiceImage(dataUrl);
                },
                notify: SO.notify,
            });
        }
    };

    SO._applyImageToRow = function _applyImageToRow(uid, name, dataUrl) {
        const row = SO.modalRows.find((r) => r.uid === uid);
        if (!row) return;
        row[name] = dataUrl;
        // P1 2026-05-30: nếu dataUrl là blob/data → re-render row để show
        // thumbnail card thay vì input có raw data URL ugly text.
        if (typeof dataUrl === 'string' && dataUrl.startsWith('data:')) {
            SO.renderModalRows();
            return;
        }
        const formInput = document.querySelector(
            `#soModalProductsBody input[data-field="${name}"][data-uid="${uid}"]`
        );
        if (formInput) formInput.value = dataUrl;
        SO.updateRowImagePreview(uid, name, dataUrl);
    };

    // (pickImageForRow / file picker đã bỏ — chỉ dùng Ctrl+V / kéo thả qua
    // attachImageDropTarget. Ảnh tự động được resize + nén JPEG.)

    SO.wireModalImagePasteDrop = function wireModalImagePasteDrop() {
        const cells = document.querySelectorAll('#soModalProductsBody [data-img-cell]');
        cells.forEach((cell) => {
            const uid = cell.dataset.uid;
            const name = cell.dataset.imgName;
            if (!uid || !name) return;
            // Click vào cell (vùng trống, không phải input/button con) → focus
            // để Ctrl+V land vào đây. Còn click → mở file picker được bỏ qua
            // (`noClickPicker`) vì caller đã có nút upload riêng.
            if (window.Web2Effects?.attachImageDropTarget) {
                window.Web2Effects.attachImageDropTarget(cell, {
                    noClickPicker: true,
                    onResult(dataUrl) {
                        SO._applyImageToRow(uid, name, dataUrl);
                    },
                    notify: SO.notify,
                });
            }
            // Wire thumbnail clear button (P1 2026-05-30)
            const clearBtn = cell.querySelector('.so-img-thumb-clear');
            if (clearBtn) {
                clearBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    SO._applyImageToRow(uid, name, '');
                });
            }
        });
    };

    SO.fileToDataUrl = function fileToDataUrl(file) {
        return new Promise((resolve, reject) => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.onerror = reject;
            r.readAsDataURL(file);
        });
    };

    // ---------- wiring ----------
})();
