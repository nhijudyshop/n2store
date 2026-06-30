// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — createPbh + custom form popup + bill helpers + view/print + split/cancel pbh/order. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // Phase 15: validate that an order has the minimum data to convert to PBH.
    // Returns { ok: true } or { ok: false, missing: ['SĐT','Địa chỉ','Sản phẩm',...] }
    NO.validateOrderForPbh = function validateOrderForPbh(o) {
        const missing = [];
        if (!o?.phone || !String(o.phone).trim()) missing.push('SĐT');
        if (!o?.address || !String(o.address).trim()) missing.push('Địa chỉ');
        const products = Array.isArray(o?.products) ? o.products : [];
        const totalQty = products.reduce((s, p) => s + (Number(p.quantity) || 0), 0);
        if (products.length === 0 || totalQty === 0) missing.push('Sản phẩm');
        return { ok: missing.length === 0, missing };
    };

    NO.createPbh = async function createPbh(code, opts = {}) {
        // shopMode: mở modal PBH nhưng phương thức giao = "BÁN HÀNG SHOP" + DISABLE
        // (không cho đổi), ship = 0. Dùng cho nút "PBH SHOP" (bán tại shop).
        const shopMode = opts.shopMode === true;
        // Custom popup: show order summary + optional deposit/delivery overrides
        const src = NO.STATE.orders.find((o) => o.code === code);
        if (!src) {
            NO.notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        // Đơn "Đơn hàng" (confirmed) đã có PBH → KHÔNG tạo PBH/PBH SHOP lại.
        if (src.status !== 'draft') {
            NO.notify(
                'Đơn đã có PBH — không tạo lại. Chỉ giỏ hàng (chưa PBH) mới tạo được PBH.',
                'warning'
            );
            return;
        }
        // Phase 15: block creation when phone or address is missing — user must
        // fill these via the Edit modal first.
        const v = NO.validateOrderForPbh(src);
        if (!v.ok) {
            await window.Popup.error(
                `Đơn ${code} chưa có ${v.missing.join(' và ')}. Vui lòng bổ sung trước khi tạo PBH.`,
                { title: 'Thiếu thông tin', okText: 'Đã hiểu' }
            );
            return;
        }
        // 2026-06-21: đơn có SP "chờ hàng" (CHO_MUA) → KHÔNG tạo PBH. o.hasChoHang do
        // server /load gắn (authoritative). Mời tạo Phiếu soạn hàng thay thế. Server
        // cũng chặn (error cho_hang_blocked) — đây là chặn sớm trước khi mở modal.
        if (src.hasChoHang) {
            const goSlip = await window.Popup.confirm(
                `Đơn ${code} có sản phẩm CHỜ HÀNG nên không tạo được PBH. Tạo Phiếu soạn hàng thay thế?`,
                { title: 'Đơn có hàng chờ', okText: 'Tạo Phiếu soạn hàng', cancelText: 'Để sau' }
            );
            if (goSlip && window.NativeOrdersPackingSlip) {
                window.NativeOrdersPackingSlip.open(src, {
                    sttDisplay: NO.computeOrderStt(src),
                    onPrint: NO._onSoanHangPrint,
                });
            }
            return;
        }
        // validateOrderForPbh already blocked empty-products orders above —
        // here products are guaranteed non-empty so totals will be > 0.
        const totals = (src.products || []).reduce(
            (acc, p) => {
                const q = Number(p.quantity) || 0;
                const price = Number(p.price) || 0;
                acc.qty += q;
                acc.amount += q * price;
                return acc;
            },
            { qty: 0, amount: 0 }
        );
        // Build a custom modal with form fields (deposit, deliveryPrice, paymentAmount, comment)
        const fmt = (n) => Number(n || 0).toLocaleString('vi-VN');

        // Resolve delivery option list + auto-pick by address.
        // Options nguồn từ entity `deliveryzone` (config Web 2.0 riêng, admin quản
        // ở web2/delivery-zone) qua DeliveryMethodPicker; fallback hardcoded OPTIONS
        // nếu API fail/trống. KHÔNG dùng `deliverycarrier` (WEB2 shadow đã tắt
        // 2026-06-07) — dữ liệu ĐVVC ít, hardcode + deliveryzone là đủ.
        const DMP = window.DeliveryMethodPicker;
        const deliveryOpts = DMP ? await DMP.getOptionsAsync() : [];
        // 2026-06-04: auto-detect 2 method (offline fuzzy + Goong) cross-validate.
        const picked = DMP
            ? DMP.pickRobust
                ? await DMP.pickRobust(src.address || '', deliveryOpts)
                : DMP.pick(src.address || '', deliveryOpts)
            : null;
        const pickedValue = picked?.option?.value || '';
        const pickedHint = (() => {
            if (!picked) return '';
            const opt = picked.option?.label ? NO.escapeHtml(picked.option.label) : '';
            const g = picked.methods?.goong;
            if (picked.confidence === 'conflict') {
                return `⚠️ <strong>CẦN KIỂM TRA</strong> — 2 nguồn lệch: offline → <strong>${NO.escapeHtml(picked.methods?.offline?.label || opt)}</strong>; Goong (${NO.escapeHtml(g?.district || '')}, ${NO.escapeHtml(g?.province || '')}) → <strong>${NO.escapeHtml(g?.zone || '?')}</strong>`;
            }
            if (picked.confidence === 'high') {
                const src2 = picked.source === 'both' ? '✅ 2 nguồn khớp' : '🎯 khớp khu vực';
                return `${src2} — <strong>${NO.escapeHtml(picked.matched?.slice(0, 4).join(', ') || opt)}</strong>`;
            }
            return `📦 ${NO.escapeHtml(picked.note || 'Độ tin cậy thấp — kiểm tra lại')}`;
        })();
        const deliveryDropdownHtml = DMP
            ? `<label style="display:flex;flex-direction:column;gap:4px;font-weight:600;grid-column:1/-1;">
                Phương thức giao hàng
                <select id="pbhDeliveryMethod"
                    style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;background:#fff;">
                    ${deliveryOpts
                        .map(
                            (o) =>
                                `<option value="${NO.escapeHtml(o.value)}" data-price="${o.price || 0}" ${o.value === pickedValue ? 'selected' : ''}>${NO.escapeHtml(o.label)}${o.price ? ' — ' + fmt(o.price) + 'đ' : ''}</option>`
                        )
                        .join('')}
                </select>
                ${pickedHint ? `<small style="color:#64748b;font-weight:500;font-size:11px;line-height:1.4;">${pickedHint}</small>` : ''}
            </label>`
            : '';

        const html = `
            <div style="display:flex;flex-direction:column;gap:10px;font-size:13px;color:#334155;">
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px 16px;background:#f8fafc;border-radius:8px;padding:12px;">
                    <div><strong>Đơn nguồn:</strong> ${NO.escapeHtml(src.code)}</div>
                    <div><strong>STT:</strong> ${src.campaignStt ?? src.displayStt ?? '—'}</div>
                    <div><strong>Khách:</strong> ${NO.escapeHtml(src.customerName || '—')}</div>
                    <div><strong>SĐT:</strong> ${NO.escapeHtml(src.phone || '—')}</div>
                    <div style="grid-column:1/-1;"><strong>Địa chỉ:</strong> ${NO.escapeHtml(src.address || '—')}</div>
                    <div><strong>SL sản phẩm:</strong> ${totals.qty}</div>
                    <div style="text-align:right;color:#10b981;font-weight:700;">${fmt(totals.amount)}đ</div>
                </div>
                ${deliveryDropdownHtml}
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Đặt cọc
                        <input id="pbhDeposit" type="text" inputmode="numeric" data-w2num value="${Number(src.deposit) || 0}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Phí giao hàng
                        <input id="pbhDeliveryPrice" type="text" inputmode="numeric" data-w2num value="${picked?.option?.price || 0}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Đã thanh toán
                        <input id="pbhPaymentAmount" type="text" inputmode="numeric" data-w2num value="0"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                    <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                        Ngày HĐ
                        <input id="pbhDateInvoice" type="date" value="${new Date().toISOString().slice(0, 10)}"
                            style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;">
                    </label>
                </div>
                <label style="display:flex;flex-direction:column;gap:4px;font-weight:600;">
                    Ghi chú
                    <textarea id="pbhComment" rows="2" placeholder="Ghi chú nội bộ (tùy chọn)"
                        style="padding:8px 10px;border:1px solid #e2e8f0;border-radius:6px;font-size:13px;resize:vertical;"></textarea>
                </label>
            </div>
        `;
        const submit = await NO.openCustomFormPopup({
            title: shopMode ? `Tạo PBH SHOP từ ${code}` : `Tạo PBH từ ${code}`,
            iconType: 'info',
            iconName: 'receipt',
            html,
            okText: shopMode ? 'Tạo PBH SHOP' : 'Tạo PBH',
            cancelText: 'Huỷ',
            // Wire dropdown change → auto-fill Phí giao hàng so user sees price react live.
            onMount: (root) => {
                // Format số tiền (đặt cọc/phí ship/đã TT) ngay khi gõ — 1.000.
                if (window.Web2NumberInput) Web2NumberInput.attachAll(root);
                const sel = root.querySelector('#pbhDeliveryMethod');
                const priceInput = root.querySelector('#pbhDeliveryPrice');
                if (sel && priceInput) {
                    sel.addEventListener('change', () => {
                        const opt = sel.options[sel.selectedIndex];
                        const price = Number(opt.dataset.price || 0);
                        if (window.Web2NumberInput) Web2NumberInput.setValue(priceInput, price);
                        else priceInput.value = price;
                    });
                }
                // shopMode: ép "BÁN HÀNG SHOP" + disable dropdown + ship = 0.
                if (shopMode && sel) {
                    let shopOpt = Array.from(sel.options).find((o) =>
                        /pbh\s*shop|bán\s*hàng\s*shop|shop/i.test(o.textContent || '')
                    );
                    if (!shopOpt) {
                        shopOpt = document.createElement('option');
                        shopOpt.value = 'PBH SHOP';
                        shopOpt.textContent = 'BÁN HÀNG SHOP';
                        shopOpt.dataset.price = '0';
                        sel.insertBefore(shopOpt, sel.firstChild);
                    }
                    sel.value = shopOpt.value;
                    sel.disabled = true;
                    sel.style.background = '#f1f5f9';
                    sel.style.cursor = 'not-allowed';
                    if (priceInput) {
                        if (window.Web2NumberInput) Web2NumberInput.setValue(priceInput, 0);
                        else priceInput.value = 0;
                    }
                }
            },
            collect: (root) => {
                const sel = root.querySelector('#pbhDeliveryMethod');
                const selectedOpt = sel ? sel.options[sel.selectedIndex] : null;
                const _gv = (sel2) => {
                    const el = root.querySelector(sel2);
                    return (
                        (window.Web2NumberInput
                            ? Web2NumberInput.getValue(el)
                            : Number(el?.value)) || 0
                    );
                };
                return {
                    deposit: _gv('#pbhDeposit'),
                    deliveryPrice: _gv('#pbhDeliveryPrice'),
                    paymentAmount: _gv('#pbhPaymentAmount'),
                    dateInvoice: NO._dateInputToIsoWithNowTime(
                        root.querySelector('#pbhDateInvoice').value
                    ),
                    comment: root.querySelector('#pbhComment').value.trim() || null,
                    // Carrier name = label without trailing price part, used by PBH print/delivery flow
                    carrierName: selectedOpt
                        ? selectedOpt.textContent.replace(/\s*—\s*[\d.,]+đ\s*$/, '').trim()
                        : null,
                };
            },
        });
        if (!submit) return;
        await NO._doCreatePbh(code, submit);
    };

    // Renders a form-style popup matching Popup styling. Returns the
    // result of `opts.collect(rootEl)` on OK, or null on cancel/Escape.
    NO.openCustomFormPopup = async function openCustomFormPopup(opts) {
        return new Promise((resolve) => {
            const root = document.createElement('div');
            // Uses shared .w2p-overlay class (no backdrop blur — see
            // docs/web2-modal-conventions.md for why).
            root.className = 'w2p-overlay';
            root.innerHTML = `
                <div class="w2p-card" style="max-width:${opts.maxWidth || 520}px;">
                    <div style="padding:18px 20px 14px;border-bottom:1px solid #f1f5f9;display:flex;align-items:center;gap:12px;">
                        <div style="width:40px;height:40px;border-radius:50%;background:#dbeafe;color:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
                            <i data-lucide="${opts.iconName || 'edit-3'}" style="width:22px;height:22px;"></i>
                        </div>
                        <strong style="font-size:15px;color:#0f172a;line-height:1.3;">${NO.escapeHtml(opts.title)}</strong>
                    </div>
                    <div class="w2p-form-body" style="padding:16px 20px;">${opts.html}</div>
                    <div style="padding:12px 20px 18px;display:flex;justify-content:flex-end;gap:8px;">
                        <button type="button" data-action="cancel" style="padding:8px 16px;border-radius:8px;border:1px solid #e2e8f0;background:#fff;color:#475569;font-size:13px;font-weight:600;cursor:pointer;font-family:inherit;">${NO.escapeHtml(opts.cancelText || 'Huỷ')}</button>
                        <button type="button" data-action="ok" ${opts.okDisabled ? 'disabled' : ''} style="padding:8px 16px;border-radius:8px;border:1px solid transparent;background:${opts.okDisabled ? '#cbd5e1' : '#0068ff'};color:#fff;font-size:13px;font-weight:600;cursor:${opts.okDisabled ? 'not-allowed' : 'pointer'};font-family:inherit;">${NO.escapeHtml(opts.okText || 'OK')}</button>
                    </div>
                </div>`;
            document.body.appendChild(root);
            if (window.lucide) lucide.createIcons();
            if (typeof opts.onMount === 'function') {
                try {
                    opts.onMount(root);
                } catch (e) {
                    console.warn('[customFormPopup] onMount failed', e);
                }
            }
            const cleanup = () => {
                root.remove();
                document.removeEventListener('keydown', onKey);
            };
            const onKey = (e) => {
                if (e.key === 'Escape') {
                    cleanup();
                    resolve(null);
                }
            };
            document.addEventListener('keydown', onKey);
            root.addEventListener('click', (e) => {
                if (e.target === root) {
                    cleanup();
                    resolve(null);
                }
            });
            root.querySelector('[data-action="cancel"]').addEventListener('click', () => {
                cleanup();
                resolve(null);
            });
            root.querySelector('[data-action="ok"]').addEventListener('click', () => {
                let result = null;
                try {
                    result = opts.collect ? opts.collect(root) : true;
                } catch (e) {
                    console.warn('[customFormPopup] collect failed', e);
                }
                cleanup();
                resolve(result);
            });
            // Focus first input/select/textarea
            setTimeout(() => {
                const first = root.querySelector('input, textarea, select');
                if (first) first.focus();
            }, 30);
        });
    };

    // Phase 15: bulk action bar — toggle visibility + count based on checked rows.
    // Convert input[type=date] value ('YYYY-MM-DD') → full ISO với current local
    // time. Tránh bug "Ngày HĐ" hiển thị 07:00 do PG parse 'YYYY-MM-DD' = midnight UTC.
    // Pass-through nếu input đã có time component (datetime-local hoặc full ISO).
    NO._dateInputToIsoWithNowTime = function _dateInputToIsoWithNowTime(raw) {
        if (!raw) return null;
        if (String(raw).includes('T') || String(raw).includes(' ')) return raw;
        const m = String(raw).match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (!m) return raw;
        const now = new Date();
        const d = new Date(
            Number(m[1]),
            Number(m[2]) - 1,
            Number(m[3]),
            now.getHours(),
            now.getMinutes(),
            now.getSeconds()
        );
        return d.toISOString();
    };

    // ---- Bill helpers (dùng chung bulkPrintBills IN + viewOrderBill XEM) ----
    // Phí ship: tra giá theo phương thức giao của đơn (DeliveryMethodPicker,
    // option.value === o.deliveryMethod). PBH SHOP/bán tại shop → 0. Fallback parse
    // "(20k)" trong label. → bill cộng ship vào TỔNG + COD (giống PBH thật).
    NO._billShipPriceOf = function _billShipPriceOf(o, deliveryOpts) {
        if (/pbh\s*shop|bán\s*hàng\s*shop|shop/i.test(o.pbhCarrierName || '')) return 0;
        if (o.deliveryMethod && deliveryOpts && deliveryOpts.length) {
            const opt = deliveryOpts.find((x) => x.value === o.deliveryMethod);
            if (opt) return Number(opt.price) || 0;
        }
        const m = (o.deliveryMethodLabel || '').match(/\((\d+)\s*k\)/i);
        return m ? parseInt(m[1], 10) * 1000 : 0;
    };

    // Dựng PBH-shape cho Web2Bill từ native order.
    //   increment=true  → bill ghi "lần in này = đã in + 1" (khi IN thật).
    //   increment=false → ghi số lần đã in hiện tại (khi chỉ XEM, không +1).
    NO._buildPbhShape = function _buildPbhShape(o, deliveryOpts, { increment = true } = {}) {
        const lines = (o.products || []).map((p) => ({
            productName: p.name || p.productName || '',
            // Biến thể: ưu tiên đã lưu trên line; fallback lookup theo mã SP (đơn cũ).
            variant:
                p.variant ||
                (NO.PRODUCT_VARIANT_MAP && NO.PRODUCT_VARIANT_MAP[p.productCode || p.code]) ||
                '',
            quantity: Number(p.quantity) || 0,
            priceUnit: Number(p.price) || 0,
            uomName: p.uomName || 'Cái',
            note: p.note || '',
        }));
        const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
        const totalAmount = lines.reduce((s, l) => s + l.quantity * l.priceUnit, 0);
        const ship = NO._billShipPriceOf(o, deliveryOpts);
        const finalTotal = totalAmount + ship;
        const printed = Number(o.printCount) || 0;
        return {
            number: o.code,
            displayStt: NO.computeOrderStt(o), // STT khớp list (gộp "1 + 2", campaignStt)
            mergedDisplayStt: null,
            createdByName: o.assignedEmployeeName || o.createdByName || '', // NV bán
            partner: {
                name: o.customerName || '',
                phone: o.phone || '',
                address: o.address || '',
            },
            orderLines: lines,
            totals: { quantity: totalQty, untaxed: totalAmount, total: finalTotal },
            payment: { amount: 0, residual: finalTotal }, // COD = SP + ship
            delivery: { price: ship, carrierName: o.pbhCarrierName || '' }, // ship + detect PBH SHOP
            channel: o.channel || '', // 'web2_inbox' → bill ghi "PBH INBOX"
            comment: o.note || '',
            dateInvoice: o.createdAt || new Date().toISOString(),
            printCount: increment ? printed + 1 : printed,
        };
    };

    // Ghi số lần in (print_count) → tránh in trùng. Bump local + re-render badge.
    // Lỗi mạng → bỏ qua (không chặn in).
    NO._markPrintedCodes = function _markPrintedCodes(codes, kind) {
        const arr = (Array.isArray(codes) ? codes : [codes]).filter(Boolean);
        if (!arr.length || !window.NativeOrdersApi?.markPrinted) return;
        window.NativeOrdersApi.markPrinted(arr, kind)
            .then((r) => {
                const counts = (r && r.counts) || {};
                const printedAt = (r && r.printedAt) || {};
                arr.forEach((c) => {
                    const o = NO.STATE.orders.find((x) => x.code === c);
                    if (o) {
                        o.printCount = counts[c] != null ? counts[c] : (o.printCount || 0) + 1;
                        o.lastPrintedAt = printedAt[c] != null ? printedAt[c] : Date.now();
                    }
                });
                NO.renderRows();
            })
            .catch((e) => {
                // In tem đã xảy ra THẬT nhưng ghi số-lần-in lên server thất bại →
                // printCount under-count (reprint-guard sai). KHÔNG nuốt im.
                console.warn('[pbh-bill] markPrinted fail:', e?.message, arr);
                NO.notify?.(
                    'Đã in nhưng chưa ghi được số lần in — tải lại trang để đồng bộ.',
                    'warning'
                );
            });
    };

    NO._getDeliveryOpts = async function _getDeliveryOpts() {
        const DMP = window.DeliveryMethodPicker;
        return DMP && DMP.getOptionsAsync ? await DMP.getOptionsAsync() : [];
    };

    // onPrint của Phiếu Soạn Hàng: LUÔN gắn tag SOẠN HÀNG. didPrint=false (admin tắt IN) →
    // 'soan_hang_tag_only' (chỉ tag, không tăng 🖨); in thật → 'soan_hang' (tag + 🖨).
    NO._onSoanHangPrint = (od, didPrint) =>
        NO._markPrintedCodes([od.code], didPrint === false ? 'soan_hang_tag_only' : 'soan_hang');

    // IN bill (nút "In bill" toolbar — các đơn đang chọn). Mỗi đơn in ĐÚNG LOẠI
    // theo trạng thái: Nháp → Phiếu Soạn Hàng (modal tuần tự), confirmed/PBH →
    // bill PBH (gộp 1 lần). Có ghi print_count.
    NO.bulkPrintBills = async function bulkPrintBills() {
        const codes = NO.getSelectedCodes();
        if (!codes.length) {
            NO.notify('Chưa chọn đơn nào để in', 'warning');
            return;
        }
        if (!window.Web2Bill) {
            NO.notify('Web2Bill chưa load — kiểm tra script', 'error');
            return;
        }
        const orders = codes.map((c) => NO.STATE.orders.find((o) => o.code === c)).filter(Boolean);
        if (!orders.length) {
            NO.notify('Không tìm thấy đơn', 'error');
            return;
        }
        const drafts = orders.filter((o) => o.status === 'draft');
        const others = orders.filter((o) => o.status !== 'draft');
        const deliveryOpts = await NO._getDeliveryOpts();

        const printConfirmedBills = async () => {
            if (!others.length) return;
            await NO.ensureVariantMap(); // map mã→biến thể để bill hiện biến thể (đơn cũ)
            const pbhs = others.map((o) => NO._buildPbhShape(o, deliveryOpts, { increment: true }));
            if (pbhs.length === 1) window.Web2Bill.openPrint(pbhs[0]);
            else window.Web2Bill.openCombinedPrint(pbhs);
            NO._markPrintedCodes(others.map((o) => o.code));
            NO.notify(`Đang in ${pbhs.length} bill PBH...`, 'info');
        };

        // Đơn nháp → mở Phiếu Soạn Hàng TUẦN TỰ; xong hết mới in bill PBH.
        if (drafts.length && window.NativeOrdersPackingSlip) {
            if (others.length)
                NO.notify(
                    `${drafts.length} giỏ hàng (soạn hàng) + ${others.length} đơn in bill PBH`,
                    'info'
                );
            let i = 0;
            const openNext = () => {
                if (i >= drafts.length) {
                    printConfirmedBills();
                    return;
                }
                const o = drafts[i++];
                window.NativeOrdersPackingSlip.open(o, {
                    sttDisplay: NO.computeOrderStt(o),
                    onClose: openNext,
                    onPrint: NO._onSoanHangPrint,
                });
            };
            openNext();
        } else {
            printConfirmedBills();
        }
    };

    // XEM bill 1 đơn (icon 🖨 per-row) — chỉ PREVIEW, KHÔNG auto-print, KHÔNG bump
    // print_count khi mở. In thật chỉ xảy ra khi user bấm nút "In bill" trong
    // preview (Web2Bill.openPreview onPrint) hoặc nút IN trong Phiếu Soạn Hàng.
    //   - Nháp (draft) → mở modal Phiếu Soạn Hàng (vốn là preview, in qua nút nội bộ)
    //   - confirmed/PBH/PBH SHOP → Web2Bill.openPreview (title tự render theo loại)
    NO.viewOrderBill = async function viewOrderBill(code) {
        if (!window.Web2Bill) {
            NO.notify('Web2Bill chưa load — kiểm tra script', 'error');
            return;
        }
        const o = NO.STATE.orders.find((x) => x.code === code);
        if (!o) {
            NO.notify('Không tìm thấy đơn', 'error');
            return;
        }
        if (o.status === 'draft') {
            if (!window.NativeOrdersPackingSlip) {
                NO.notify('Phiếu soạn hàng chưa load', 'error');
                return;
            }
            window.NativeOrdersPackingSlip.open(o, {
                sttDisplay: NO.computeOrderStt(o),
                onPrint: NO._onSoanHangPrint,
            });
            return;
        }
        await NO.ensureVariantMap();
        const deliveryOpts = await NO._getDeliveryOpts();
        const pbh = NO._buildPbhShape(o, deliveryOpts, { increment: false });
        window.Web2Bill.openPreview(pbh, {
            // Bấm "In bill" trong preview → in thật + ghi print_count.
            onPrint: (p) => {
                const printPbh = NO._buildPbhShape(o, deliveryOpts, { increment: true });
                window.Web2Bill.openPrint(printPbh);
                NO._markPrintedCodes([o.code]);
            },
        });
    };

    NO.cancelPbh = async function cancelPbh(code) {
        const ok = await NO.w2pConfirm(
            `Huỷ PBH đã tạo từ đơn ${code}? Đơn sẽ trở lại trạng thái Giỏ hàng (chưa PBH), hành động không phục hồi tự động.`,
            {
                title: `Huỷ PBH ${code}?`,
                okText: 'Huỷ PBH',
                cancelText: 'Đóng',
                type: 'error',
            }
        );
        if (!ok) return;
        try {
            const resp = await fetch(
                `${NO.WORKER_URL}/api/fast-sale-orders/by-source/${encodeURIComponent(code)}/cancel`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                    },
                }
            );
            const data = await resp.json();
            if (!resp.ok || !data.success) throw new Error(data.error || `HTTP ${resp.status}`);
            NO.notify(`Đã huỷ PBH ${data.order?.number || ''}`, 'success');
            await NO.load();
        } catch (e) {
            NO.notify('Lỗi huỷ PBH: ' + e.message, 'error');
            console.error('[cancelPbh]', e);
        }
    };

    // Gọi từ nút "Hủy PBH" trong banner lock của modal edit. Sau khi hủy PBH,
    // status đơn về 'cancelled' → user phải kéo SP mới để tạo native_order
    // mới (status='draft') vì current đã thành 'cancelled' (sync ngược).
    NO.cancelPbhFromEdit = async function cancelPbhFromEdit(code) {
        await NO.cancelPbh(code);
        NO.closeEdit();
    };

    NO._doCreatePbh = async function _doCreatePbh(code, extras) {
        try {
            const body = { nativeOrderCode: code, ...extras };
            // 2026-06-06: KH có SP "Thu về 1 phần" chờ → hỏi thêm vào bill 0đ.
            try {
                const ord = NO.STATE.orders.find((o) => o.code === code);
                if (ord?.phone && window.NativeReturnBill?.collect) {
                    const rb = await window.NativeReturnBill.collect(ord.phone);
                    if (rb && rb.returnLines.length) {
                        body.returnLines = rb.returnLines;
                        body.returnCodes = rb.returnCodes;
                    }
                }
            } catch (e) {
                console.warn('[createPbh] return-bill check fail:', e);
            }
            const r = await fetch(`${NO.WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                },
                body: JSON.stringify(body),
            });
            const data = await r.json();
            if (!r.ok || !data.success) {
                // Server trả: { error: 'over_sell', message: '...', violations: [{code, requested, available}] }
                // hoặc { error: 'missing_phone', message: '...' } v.v. Ưu tiên message Vietnamese.
                const baseMsg = data.message || data.error || `HTTP ${r.status}`;
                if (
                    data.error === 'over_sell' &&
                    Array.isArray(data.violations) &&
                    data.violations.length
                ) {
                    // Show popup với detail violations nếu có Popup, fallback toast.
                    const list = data.violations
                        .map((v) => `• ${v.code}: cần ${v.requested}, kho còn ${v.available}`)
                        .join('\n');
                    if (window.Popup?.error) {
                        await window.Popup.error(
                            `${baseMsg}\n\n${list}\n\nNhập thêm tồn kho ở trang Sản Phẩm rồi thử lại.`,
                            {
                                title: 'Không đủ tồn kho',
                                okText: 'Đã hiểu',
                            }
                        );
                    } else {
                        NO.notify(`${baseMsg}\n${list}`, 'error');
                    }
                    return;
                }
                // 2026-06-21: server chặn vì đơn có SP chờ hàng (CHO_MUA). Safety-net
                // (createPbh đã chặn sớm) cho path bulk/đua. Mời tạo Phiếu soạn hàng.
                if (data.error === 'cho_hang_blocked') {
                    const chCodes = Array.isArray(data.choHangCodes)
                        ? data.choHangCodes.join(', ')
                        : '';
                    const ord = NO.STATE.orders.find((o) => o.code === code);
                    const goSlip = window.Popup?.confirm
                        ? await window.Popup.confirm(
                              `${baseMsg}${chCodes ? `\n\nSP chờ hàng: ${chCodes}` : ''}`,
                              {
                                  title: 'Đơn có hàng chờ',
                                  okText: 'Tạo Phiếu soạn hàng',
                                  cancelText: 'Để sau',
                              }
                          )
                        : false;
                    if (goSlip && ord && window.NativeOrdersPackingSlip) {
                        window.NativeOrdersPackingSlip.open(ord, {
                            sttDisplay: NO.computeOrderStt(ord),
                            onPrint: NO._onSoanHangPrint,
                        });
                    }
                    return;
                }
                throw new Error(baseMsg);
            }
            const isIdempotent = data.idempotent;
            const pbh = data.order;
            NO.notify(
                `${isIdempotent ? 'PBH đã tồn tại' : 'Đã tạo PBH'}: ${pbh.number} (STT ${pbh.displayStt})`,
                'success'
            );
            // Celebrate fresh PBH creations (skip on idempotent — was already created)
            if (!isIdempotent && window.Web2Effects?.confetti) {
                window.Web2Effects.confetti({ particleCount: 80, spread: 70 });
            }
            await NO.load();
        } catch (e) {
            NO.notify('Lỗi tạo PBH: ' + e.message, 'error');
            console.error('[createPbh]', e);
        }
    };

    NO.removeOrder = async function removeOrder(code) {
        if (
            !(await NO.w2pConfirm(`Hành động không thể hoàn tác.`, {
                title: `Xóa đơn ${code}?`,
                okText: 'Xoá đơn',
                cancelText: 'Đóng',
                type: 'error',
            }))
        )
            return;
        try {
            await window.NativeOrdersApi.remove(code);
            NO.STATE.orders = NO.STATE.orders.filter((x) => x.code !== code);
            NO.STATE.total = Math.max(0, NO.STATE.total - 1);
            NO.renderRows();
            NO.renderPagination();
            NO.renderCounters();
            NO.notify(`Đã xóa ${code}`, 'success');
        } catch (e) {
            NO.notify('Lỗi xóa: ' + e.message, 'error');
        }
    };

    // Tách đơn nháp — tạo thêm 1 đơn mới cùng KH/SĐT/địa chỉ, giỏ trống. Original
    // giữ products. Server backfill split_index=1 cho original (nếu lần đầu) và
    // assign split_index=N+1 cho đơn mới. Hiển thị "<STT>-N" cho cả 2.
    NO.splitOrder = async function splitOrder(code) {
        const src = NO.STATE.orders.find((o) => o.code === code);
        if (!src) {
            NO.notify('Không tìm thấy đơn ' + code, 'error');
            return;
        }
        const sttDisplay =
            src.splitIndex && src.splitIndex > 0
                ? `${src.displayStt}-${src.splitIndex}`
                : String(src.displayStt ?? '');
        const ok = await NO.w2pConfirm(
            `Tách thêm 1 giỏ hàng từ ${code} (STT ${sttDisplay}) cho KH ${src.customerName || '—'}?\n\n` +
                `Đơn mới sẽ có giỏ hàng RỖNG, cùng SĐT/địa chỉ. STT đơn mới: ${src.displayStt}-N (N = max split index hiện tại + 1).`,
            {
                title: `Tách đơn ${code}?`,
                okText: 'Tách',
                cancelText: 'Đóng',
                type: 'info',
            }
        );
        if (!ok) return;
        try {
            const r = await fetch(
                `${NO.WORKER_URL}/api/native-orders/${encodeURIComponent(code)}/split-order`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                    },
                }
            );
            const data = await r.json();
            if (!r.ok || !data.success)
                throw new Error(data.message || data.error || `HTTP ${r.status}`);
            NO.notify(
                `Đã tách: ${data.source.code} (STT ${data.source.displayStt}-${data.source.splitIndex || 1}) + ${data.created.code} (STT ${data.created.displayStt}-${data.created.splitIndex})`,
                'success'
            );
            await NO.load();
        } catch (e) {
            NO.notify('Lỗi tách đơn: ' + e.message, 'error');
            console.error('[splitOrder]', e);
        }
    };

    NO.copyCode = function copyCode(code) {
        if (navigator.clipboard?.writeText) {
            navigator.clipboard.writeText(code).then(() => NO.notify(`Đã copy ${code}`, 'success'));
        }
    };

    NO.goPage = function goPage(p) {
        const totalPages = Math.max(1, Math.ceil(NO.STATE.total / NO.STATE.limit));
        NO.STATE.page = Math.min(Math.max(1, p), totalPages);
        NO.load();
    };

    // confirmDraft() đã xóa 2026-06-02 (user spec): workflow gom 1 bước, chỉ
    // dùng nút "Tạo PBH" (vừa confirm vừa tạo PBH luôn + deduct stock).

    // Tạo PBH bổ sung (tách đơn) — call /from-native-order với split=true.
    // Backend tự tăng split_index → PBH thứ 2 hiển thị STT '24-2', thứ 3 '24-3'.
    NO.splitPbh = async function splitPbh(code) {
        if (!code) return;
        const src = NO.STATE.orders.find((o) => o.code === code);
        if (!src) return NO.notify('Không tìm thấy đơn ' + code, 'error');
        if (src.status !== 'confirmed') {
            return NO.notify(
                `Đơn ${code} chưa confirmed — bấm "Tạo PBH" thường thay vì split`,
                'warning'
            );
        }
        const ok = await NO.w2pConfirm(
            `Tách đơn ${code} (STT ${src.displayStt})?\n\n` +
                `→ Tạo PBH thứ 2 với CÙNG sản phẩm + KH (clone đơn gốc).\n` +
                `→ PBH mới có STT '${src.displayStt}-2' (hoặc -3, -4 nếu tách thêm).\n` +
                `→ Stock sẽ trừ thêm 1 lần (validate over-sell — fail nếu thiếu kho).`,
            { confirmText: 'Tách đơn', cancelText: 'Hủy' }
        );
        if (!ok) return;
        try {
            // `window.NativeOrdersApi._getBaseUrl()` không tồn tại → gọi splitPbh
            // sẽ ném TypeError trước khi fetch. Dùng `NO.WORKER_URL` trực tiếp như
            // _doCreatePbh / cancelOrder (cùng endpoint from-native-order).
            const r = await fetch(`${NO.WORKER_URL}/api/fast-sale-orders/from-native-order`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                },
                body: JSON.stringify({ nativeOrderCode: code, split: true }),
            });
            const data = await r.json();
            if (!r.ok || !data.success) {
                if (data?.error === 'over_sell') {
                    const viol = (data.violations || [])
                        .map((v) => `${v.code}: cần ${v.requested}, kho ${v.available}`)
                        .join('\n');
                    throw new Error(`Tách đơn thất bại — over-sell:\n${viol}`);
                }
                throw new Error(data.error || `HTTP ${r.status}`);
            }
            const splitIdx = data.order?.splitIndex || '?';
            NO.notify(
                `✓ Tách đơn xong: PBH ${data.order?.number} (STT ${src.displayStt}-${splitIdx})`,
                'success'
            );
            await NO.load();
        } catch (e) {
            console.error('[splitPbh]', e);
            NO.notify(`Tách đơn thất bại: ${e.message}`, 'error');
        }
    };

    // Huỷ đơn web — status='cancelled'. Tự sync sang PBH (cancel + restock
    // nếu PBH active). Khác cancelPbh: cancelPbh chỉ hủy PBH, giữ đơn web
    // draft để tạo lại. cancelOrder hủy NGUYÊN ĐƠN luôn — không tạo lại.
    NO.cancelOrder = async function cancelOrder(code) {
        if (!code) return;
        const src = NO.STATE.orders.find((o) => o.code === code);
        if (!src) return NO.notify('Không tìm thấy đơn ' + code, 'error');
        if (src.status === 'cancelled') {
            return NO.notify(`Đơn ${code} đã ở trạng thái cancelled`, 'warning');
        }
        const reasonRes = await window.Popup.prompt(`Lý do huỷ đơn ${code}?`, {
            defaultValue: '',
            okText: 'Huỷ đơn',
            cancelText: 'Quay lại',
        });
        if (reasonRes === null || reasonRes === undefined || reasonRes === false) return;
        const reason = String(reasonRes || '').trim();
        const ok = await NO.w2pConfirm(
            `Xác nhận HUỶ ĐƠN ${code}?\n\n${src.status === 'confirmed' ? '⚠️ Đơn đang confirmed có PBH liên kết — PBH sẽ bị cancel + tự trả tồn về kho.' : '→ Status chuyển sang cancelled.'}\n\nHành động không thể undo (phải tạo đơn mới).`,
            { confirmText: 'Huỷ đơn', cancelText: 'Không' }
        );
        if (!ok) return;
        try {
            // `NativeOrdersApi._getBaseUrl()` không tồn tại — IIFE đóng kín
            // const `BASE`. Dùng WORKER_URL trực tiếp như cancelPbh + createPbh.
            const r = await fetch(
                `${NO.WORKER_URL}/api/native-orders/${encodeURIComponent(code)}/cancel`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                    },
                    body: JSON.stringify({ reason: reason || null }),
                }
            );
            const data = await r.json();
            if (!r.ok || !data.success) {
                throw new Error(data.error || `HTTP ${r.status}`);
            }
            const synced = data.pbhSync?.synced || 0;
            NO.notify(
                data.idempotent
                    ? `Đơn ${code} đã cancelled trước đó`
                    : `✓ Huỷ đơn ${code}${synced ? ` + sync ${synced} PBH` : ''}`,
                'success'
            );
            // SSE sẽ tự reload, nhưng update local cho responsive UX.
            if (data.order) {
                const i = NO.STATE.orders.findIndex((o) => o.code === code);
                if (i >= 0) NO.STATE.orders[i] = data.order;
                NO.renderRows(); // audit r3: trước gọi renderOrders() không tồn tại → ReferenceError, list không refresh sau huỷ
            }
        } catch (e) {
            console.error('[cancelOrder]', e);
            NO.notify(`Huỷ đơn thất bại: ${e.message}`, 'error');
        }
    };
})();
