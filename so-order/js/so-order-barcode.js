// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — in tem/mã SP: DELEGATE 100% sang Web2ProductsPrint (module chung web2/products) + print labels from receive panel. KHÔNG fork modal. MOVE-only.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    // PER-UNIT (2026-06-29): mỗi tem 1 mã ĐƠN VỊ + QR riêng/món. Units MINT theo SL
    // kho ở web2-products (hook _syncUnits server). Ở đây CHỈ /ensure (top-up nếu thiếu)
    // rồi gắn units — qua CLIENT CHUNG window.Web2ProductUnits (1 nguồn, KHÔNG fork fetch).
    // In theo SL nhập/nhận (perItemQty). Lỗi → fallback in mã SP lặp.
    SO._attachUnitCodes = async function _attachUnitCodes(products) {
        if (!window.Web2ProductUnits) return products; // fallback an toàn nếu chưa load
        return window.Web2ProductUnits.attachForPrint(products, {
            perItemQty: (p) => p.quantity || p.qtyReceived,
        });
    };

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
                .map((it) => {
                    const code = codeByKey.get(it.key);
                    // Giá bán tem: ưu tiên giá dòng order, fallback giá Kho SP theo code
                    // (SP đã có giá trong Kho nhưng dòng order để trống) → tránh tem giá 0.
                    const khoPrice = window.Web2ProductsCache?.findByCode?.(code)?.price;
                    const temPrice = Number(it.sellPriceVnd) || Number(khoPrice) || 0;
                    return {
                        code,
                        name: it.name,
                        variant: it.variant,
                        qtyReceived: Math.max(1, it.printQty),
                        price: temPrice,
                        sellPriceVnd: temPrice,
                        stock: it.currentStock,
                        // PER-UNIT context: NCC nguồn + đợt → mint unit + QR riêng/món.
                        supplier: it.supplier || null,
                        shipmentId: it.shipmentId || null,
                        quantity: Math.max(1, it.printQty),
                    };
                });
            if (!products.length) {
                SO.notify('Không có mã SP để in tem', 'warning');
                return;
            }
            // PER-UNIT: cấp mã đơn vị + QR URL cho từng món (best-effort, không chặn in).
            await SO._attachUnitCodes(products);
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

    // ---------- In tem/mã SP — DELEGATE DUY NHẤT sang module chung web2/products ----------
    // KHÔNG fork modal in: dùng đúng Web2ProductsPrint như trang Kho SP (web2/products)
    // → 1 nguồn, cùng modal chọn giấy / SL / kiểu in / mã vạch. Items vào:
    //   {code, name, variant, qtyReceived, sellPriceVnd, price, stock, ...}
    // Map quantity = qtyReceived ("in theo SL nhận"). Thiếu module in → báo lỗi rõ,
    // KHÔNG rớt về modal legacy (đã gỡ — index.html PHẢI load đủ 5 file print).
    SO.openBarcodePrintModal = function openBarcodePrintModal(items, _supplier) {
        if (!window.Web2ProductsPrint?.open) {
            console.warn(
                '[so-order] Web2ProductsPrint.open chưa sẵn sàng — thiếu module in web2/products (utils/barcode/render/modal). Kiểm tra script trong index.html.'
            );
            SO.notify('Module in chưa tải xong — tải lại trang rồi thử lại', 'error');
            return;
        }
        const products = (items || []).map((it) => ({
            code: it.code || '',
            name: it.name || '',
            variant: it.variant || '',
            quantity: Math.max(1, Number(it.qtyReceived) || 1),
            price: Number(it.price) || Number(it.sellPriceVnd) || 0,
            stock: Number(it.stock) || 0,
            // PER-UNIT: giữ mảng unit (mỗi tem 1 mã + QR URL) nếu đã mint sẵn.
            units: Array.isArray(it.units) ? it.units : undefined,
        }));
        window.Web2ProductsPrint.open(products);
    };

    // ---------- modals ----------

    // ---------- modal multi-row helpers ----------
})();
