// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — barcode/QR print (Web2ProductsPrint delegate + legacy modal + print labels from receive panel). MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // 2026-06-07: In tem QR theo SL — KHÔNG cần nhận lại (dùng cho SP đã nhận đủ
    // cần in/in lại tem, hoặc in trước khi xác nhận). SL mỗi SP = qty nhập (>0) →
    // else đã nhận → else qty đặt. Resolve code: dùng code có sẵn (server lookup),
    // thiếu thì upsertPending lấy code (KHÔNG đổi tồn — chỉ confirm-purchase mới đổi).
    SO.printLabelsFromReceivePanel = async function printLabelsFromReceivePanel() {
        const panelRow = document.querySelector('.so-receive-panel-row');
        const btn = panelRow?.querySelector('#soReceivePrintBtn');
        if (!btn || btn.disabled) return;
        if (!SO._receiveItems.length) {
            SO.notify('Không có SP để in tem', 'warning');
            return;
        }
        const inputByKey = new Map();
        panelRow.querySelectorAll('input[data-receive-qty]').forEach((inp) => {
            inputByKey.set(inp.dataset.receiveQty, Math.max(0, Number(inp.value) || 0));
        });
        const items = SO._receiveItems.map((it) => {
            const entered = inputByKey.get(it.key) || 0;
            const printQty =
                entered > 0 ? entered : it.alreadyReceived > 0 ? it.alreadyReceived : it.qty;
            return { ...it, printQty: Math.max(1, Number(printQty) || 1) };
        });
        const orig = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader-2"></i> Đang tạo tem…';
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            const codeByKey = new Map();
            items.forEach((it) => {
                if (it.code) codeByKey.set(it.key, it.code);
            });
            const needCode = items.filter((it) => !codeByKey.has(it.key));
            if (needCode.length && window.Web2ProductsApi?.upsertPending) {
                const upsertPayload = needCode.map((it) => ({
                    name: it.name,
                    variant: it.variant,
                    qty: it.qty,
                    costPrice: it.costPriceVnd,
                    sellPrice: it.sellPriceVnd,
                    supplier: it.supplier,
                    imageUrl: it.imageUrl,
                    // địa danh nhập hàng → field RIÊNG region (KHÔNG nhét note)
                    region: it.note,
                    originCurrency: it.originCurrency,
                    originRate: it.originRate,
                }));
                SO._assignKhoCodes(upsertPayload);
                // MEDIUM-cleanup (2026-06-13): in tem chỉ cần MÃ — resolveOnly:true
                // để KHÔNG cộng pending_qty (trước đây upsert qty gốc → double-pending,
                // pending ảo bị confirm-purchase convert thành tồn ảo). Gốc H15.
                const r = await window.Web2ProductsApi.upsertPending(upsertPayload, {
                    resolveOnly: true,
                });
                const ui = (r && r.items) || [];
                for (let i = 0; i < ui.length && i < needCode.length; i++) {
                    if (ui[i].code) codeByKey.set(needCode[i].key, ui[i].code);
                }
                // SP lỗi tạo mã (action:'error') → không có code → bị loại khỏi hàng
                // đợi in tem. Báo user để biết tem nào thiếu (đừng in thiếu im lặng).
                const erroredTem = ui.filter((x) => x && x.action === 'error');
                if (erroredTem.length) {
                    const names = erroredTem.map((x) => x.name || x.code || '?').join(', ');
                    console.warn(
                        '[so-order-barcode] không tạo được mã, bỏ khỏi in tem:',
                        erroredTem
                    );
                    SO.notify(
                        `${erroredTem.length} SP không tạo được mã — KHÔNG in tem: ${names}`,
                        'warning'
                    );
                }
            }
            // openBarcodePrintModal map quantity = it.qtyReceived → đặt đúng field.
            const products = items
                .filter((it) => codeByKey.get(it.key))
                .map((it) => ({
                    code: codeByKey.get(it.key),
                    name: it.name,
                    variant: it.variant,
                    qtyReceived: Math.max(1, it.printQty),
                    price: it.sellPriceVnd,
                    sellPriceVnd: it.sellPriceVnd,
                    stock: it.currentStock,
                }));
            if (!products.length) {
                SO.notify('Không có mã SP để in tem', 'warning');
                return;
            }
            const uniqSuppliers = Array.from(new Set(items.map((it) => it.supplier)));
            const supplierLabel =
                uniqSuppliers.length === 1 ? uniqSuppliers[0] : `${uniqSuppliers.length} NCC`;
            SO.openBarcodePrintModal(products, supplierLabel);
        } catch (e) {
            console.warn('[so-order] print labels fail:', e);
            SO.notify('Lỗi tạo tem: ' + (e.message || e), 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    };

    // ---------- Barcode print modal ----------
    SO.openBarcodePrintModal = function openBarcodePrintModal(items, supplier) {
        // P1 2026-05-30: delegate sang Web2ProductsPrint để dùng cùng modal
        // chọn giấy / SL / kiểu in / có giá... như trang web2/products.
        // Items đã có {code, name, variant, qtyReceived, sellPriceVnd, ...}
        // Map: quantity = qtyReceived (caller request "in theo SL nhận").
        if (window.Web2ProductsPrint?.open) {
            try {
                const products = items.map((it) => ({
                    code: it.code || '',
                    name: it.name || '',
                    variant: it.variant || '',
                    quantity: Math.max(1, Number(it.qtyReceived) || 1),
                    price: Number(it.price) || Number(it.sellPriceVnd) || 0,
                    stock: Number(it.stock) || 0,
                }));
                window.Web2ProductsPrint.open(products);
                return;
            } catch (e) {
                console.warn(
                    '[so-order] Web2ProductsPrint.open failed, fallback legacy modal:',
                    e?.message
                );
            }
        }
        // Fallback: legacy inline modal nếu Web2ProductsPrint chưa load
        let modal = document.getElementById('soBarcodeModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'soBarcodeModal';
            modal.className = 'so-modal';
            modal.hidden = true;
            modal.innerHTML = `
                <div class="so-modal-backdrop" data-so-barcode-close></div>
                <div class="so-modal-panel">
                    <header class="so-modal-head">
                        <h2>In mã vạch — <span id="soBarcodeSupplier">—</span></h2>
                        <button class="so-modal-close" type="button" data-so-barcode-close>
                            <i data-lucide="x"></i>
                        </button>
                    </header>
                    <div class="so-modal-body">
                        <div class="so-barcode-toolbar">
                            <label><input type="checkbox" id="soBarcodeCheckAll" checked /> Chọn tất cả</label>
                            <span class="so-barcode-summary" id="soBarcodeSummary"></span>
                        </div>
                        <div class="so-barcode-list" id="soBarcodeList"></div>
                    </div>
                    <footer class="so-modal-foot">
                        <button class="btn btn-secondary" type="button" data-so-barcode-close>Bỏ qua</button>
                        <button class="btn btn-primary" type="button" id="soBarcodePrintBtn">
                            <i data-lucide="printer"></i> In mã vạch
                        </button>
                    </footer>
                </div>`;
            document.body.appendChild(modal);
            modal.querySelectorAll('[data-so-barcode-close]').forEach((el) => {
                el.addEventListener('click', () => {
                    modal.hidden = true;
                });
            });
            document.getElementById('soBarcodeCheckAll').addEventListener('change', (e) => {
                document.querySelectorAll('#soBarcodeList input[type=checkbox]').forEach((cb) => {
                    cb.checked = e.target.checked;
                });
                SO._updateBarcodeSummary();
            });
            document
                .getElementById('soBarcodePrintBtn')
                .addEventListener('click', SO.printBarcodes);
        }
        document.getElementById('soBarcodeSupplier').textContent = supplier;
        const listEl = document.getElementById('soBarcodeList');
        listEl.innerHTML = items
            .map((p) => {
                return `<label class="so-barcode-row">
                <input type="checkbox" data-bc-code="${SO.escapeHtml(p.code)}" data-bc-name="${SO.escapeHtml(p.name)}" checked />
                <span class="so-barcode-code">[${SO.escapeHtml(p.code)}]</span>
                <span class="so-barcode-name">${SO.escapeHtml(p.name)}</span>
                ${p.variant ? `<span class="so-barcode-variant">${SO.escapeHtml(p.variant)}</span>` : ''}
            </label>`;
            })
            .join('');
        listEl.querySelectorAll('input[type=checkbox]').forEach((cb) => {
            cb.addEventListener('change', SO._updateBarcodeSummary);
        });
        SO._updateBarcodeSummary();
        modal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    SO._updateBarcodeSummary = function _updateBarcodeSummary() {
        const checks = document.querySelectorAll('#soBarcodeList input[type=checkbox]:checked');
        const el = document.getElementById('soBarcodeSummary');
        if (el) el.textContent = `${checks.length} mã sẽ in`;
    };

    SO.printBarcodes = function printBarcodes() {
        const selected = Array.from(
            document.querySelectorAll('#soBarcodeList input[type=checkbox]:checked')
        ).map((cb) => ({
            code: cb.dataset.bcCode,
            name: cb.dataset.bcName,
        }));
        if (!selected.length) {
            SO.notify('Chưa chọn mã nào', 'warning');
            return;
        }
        // Open print window with barcode layout
        const w = window.open('', '_blank', 'width=700,height=900');
        if (!w) {
            SO.notify('Trình duyệt chặn popup — cho phép popup rồi thử lại', 'warning');
            return;
        }
        const labels = selected
            .map(
                (p) => `
            <div class="bc-label">
                <div class="bc-svg-wrap"><svg class="bc-svg" data-bc="${SO.escapeHtml(p.code)}"></svg></div>
                <div class="bc-code">${SO.escapeHtml(p.code)}</div>
                <div class="bc-name">${SO.escapeHtml(p.name)}</div>
            </div>`
            )
            .join('');
        w.document.write(`<!doctype html>
<html><head><meta charset="utf-8"><title>In mã vạch</title>
<script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"></script>
<style>
body{font-family:'Inter',sans-serif;margin:0;padding:8mm;background:#fff;color:#000}
.bc-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:6mm}
.bc-label{border:1px dashed #999;border-radius:4px;padding:6mm 4mm;text-align:center;page-break-inside:avoid}
.bc-svg-wrap{display:flex;justify-content:center}
.bc-svg{max-width:100%;height:auto}
.bc-code{font-family:'SF Mono',monospace;font-size:11px;color:#475569;margin-top:2mm}
.bc-name{font-size:12px;font-weight:600;margin-top:1mm;line-height:1.3}
@media print {.no-print{display:none}}
.no-print{position:sticky;top:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:8px 0 12px;margin-bottom:10px;display:flex;gap:8px;justify-content:center}
.btn{background:#0058da;color:#fff;border:0;padding:8px 18px;border-radius:6px;font-weight:600;cursor:pointer}
.btn-2{background:#f1f5f9;color:#334155;border:1px solid #cbd5e1}
</style></head><body>
<div class="no-print">
    <button class="btn" onclick="window.print()">🖨 In</button>
    <button class="btn btn-2" onclick="window.close()">Đóng</button>
</div>
<div class="bc-grid">${labels}</div>
<script>
window.addEventListener('load', () => {
    document.querySelectorAll('.bc-svg').forEach(el => {
        try {
            JsBarcode(el, el.dataset.bc, { format: 'CODE128', width: 1.6, height: 50, fontSize: 11, margin: 4 });
        } catch (e) { el.outerHTML = '<div style="color:red">Lỗi: ' + e.message + '</div>'; }
    });
});
</script>
</body></html>`);
        w.document.close();
        SO.notify(`Đã mở cửa sổ in ${selected.length} mã vạch`, 'success');
    };

    // ---------- modals ----------

    // ---------- modal multi-row helpers ----------
})();
