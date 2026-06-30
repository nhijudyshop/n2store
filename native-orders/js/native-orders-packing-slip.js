// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Phiếu Soạn Hàng cho giỏ hàng (native-orders chưa PBH).
// =====================================================
// PHIẾU SOẠN HÀNG — native-orders (Web 2.0)
//
// Port từ don-inbox/js/tab-social-packing-slip.js nhưng:
//   - Nhận thẳng ORDER object (không đọc SocialOrderState).
//   - Data Web 2.0: order.products[].name/price/quantity/note, customerName,
//     phone, address, assignedEmployeeName||createdByName, STT = computeOrderStt
//     (đơn gộp "243 + 678").
//   - Modal TỰ DỰNG động (không cần sửa index.html).
//
// Workflow: giỏ hàng → "In bill" → modal Phiếu Soạn Hàng → tick "Chờ Hàng" +
// ghi chú từng SP → in (iframe). Ghi chú in: SP tick Chờ Hàng → thêm "CHỜ HÀNG" đậm.
// =====================================================
(function (global) {
    'use strict';
    if (global.NativeOrdersPackingSlip) return;

    let _order = null;
    let _products = [];
    let _stt = '';
    let _onClose = null;
    let _onPrint = null;

    function _esc(s) {
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(s);
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function _notify(msg, type) {
        if (global.notificationManager?.show) global.notificationManager.show(msg, type || 'info');
        else console.log('[packing-slip][' + (type || 'info') + ']', msg);
    }
    // Người bán = USER ĐANG ĐĂNG NHẬP (Web2UserInfo) — ưu tiên; fallback NV gắn đơn.
    function _seller(o) {
        try {
            const u = global.Web2UserInfo && global.Web2UserInfo.get && global.Web2UserInfo.get();
            if (u && u.userName && u.userName !== '(ẩn danh)') return u.userName;
        } catch (e) {
            /* chưa load */
        }
        return (o && (o.assignedEmployeeName || o.createdByName)) || '';
    }

    // ── Modal (dựng 1 lần, tái sử dụng) ──
    let _modal = null;
    function _ensureModal() {
        if (_modal && _modal.isConnected) return _modal;
        const ov = document.createElement('div');
        ov.id = 'noPackingSlipModal';
        ov.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:10050;display:none;align-items:flex-start;justify-content:center;padding:40px 16px;overflow:auto;';
        ov.innerHTML = `
            <div style="background:#fff;border-radius:14px;width:760px;max-width:96vw;box-shadow:0 20px 60px rgba(0,0,0,.3);overflow:hidden;font-family:Inter,system-ui,sans-serif;">
                <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eef2f7;">
                    <span style="font-size:20px;">📋</span>
                    <h3 style="margin:0;font-size:18px;font-weight:700;color:#1e293b;">Phiếu Soạn Hàng</h3>
                </div>
                <div id="noPsHeader" style="background:#fffbeb;border-bottom:1px solid #fde68a;padding:12px 20px;font-size:13.5px;color:#334155;line-height:1.6;"></div>
                <div style="padding:14px 20px 4px;font-size:13px;color:#64748b;">Đánh dấu sản phẩm đang <b style="color:#b45309;">Chờ Hàng</b>:</div>
                <div style="padding:6px 20px 16px;max-height:52vh;overflow:auto;">
                    <table style="width:100%;border-collapse:collapse;font-size:13.5px;">
                        <thead>
                            <tr style="border-bottom:2px solid #e5e7eb;color:#475569;text-transform:uppercase;font-size:11.5px;letter-spacing:.3px;">
                                <th style="padding:10px 6px;text-align:center;width:42px;">STT</th>
                                <th style="padding:10px 6px;text-align:center;width:60px;">Chờ Hàng</th>
                                <th style="padding:10px 6px;text-align:left;">Sản phẩm</th>
                                <th style="padding:10px 6px;text-align:center;width:46px;">SL</th>
                                <th style="padding:10px 6px;text-align:left;width:190px;">Ghi chú</th>
                            </tr>
                        </thead>
                        <tbody id="noPsBody"></tbody>
                    </table>
                </div>
                <div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #eef2f7;background:#f8fafc;">
                    <button id="noPsCancel" style="height:40px;padding:0 18px;border:1px solid #cbd5e1;background:#fff;border-radius:8px;font-weight:600;cursor:pointer;color:#475569;">Hủy</button>
                    <button id="noPsPrint" style="height:40px;padding:0 20px;border:0;background:#0068ff;color:#fff;border-radius:8px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:7px;">🖨 In Phiếu Soạn Hàng</button>
                </div>
            </div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', (e) => {
            if (e.target === ov) close();
        });
        ov.querySelector('#noPsCancel').addEventListener('click', close);
        ov.querySelector('#noPsPrint').addEventListener('click', _print);
        _modal = ov;
        return ov;
    }

    // Set mã SP đang CHỜ HÀNG (web2_products.status = CHO_MUA) — lấy từ autoTag 'cho_hang'
    // detail.products (server đính ở /load). Phiếu soạn hàng TỰ TICK các SP này.
    function _waitingCodes(o) {
        const set = new Set();
        const tag = ((o && o.autoTags) || []).find((t) => t && t.trigger === 'cho_hang');
        const prods =
            tag && tag.detail && Array.isArray(tag.detail.products) ? tag.detail.products : [];
        for (const p of prods) {
            const c = p && (p.code || p.productCode);
            if (c) set.add(String(c));
        }
        return set;
    }
    function _isWaiting(p, waitSet) {
        const code = p.productCode || p.product_code || p.code || '';
        return code ? waitSet.has(String(code)) : false;
    }

    function _renderRows() {
        const tbody = _modal.querySelector('#noPsBody');
        if (!_products.length) {
            tbody.innerHTML =
                '<tr><td colspan="5" style="text-align:center;padding:22px;color:#9ca3af;">Không có sản phẩm</td></tr>';
            return;
        }
        const waitSet = _waitingCodes(_order);
        let totalQty = 0;
        const rows = _products
            .map((p, idx) => {
                const name = p.name || p.productName || '';
                const note = p.note || '';
                const qty = parseFloat(p.quantity) || 1;
                totalQty += qty;
                const channel = _order.channel || p.source || '';
                const isWaiting = _isWaiting(p, waitSet);
                return `
                <tr style="border-bottom:1px solid #f3f4f6;">
                    <td style="padding:10px 6px;text-align:center;font-weight:600;">${idx + 1}</td>
                    <td style="padding:10px 6px;text-align:center;">
                        <input type="checkbox" data-ps-wait="${idx}" ${isWaiting ? 'checked' : ''}
                            style="width:18px;height:18px;cursor:pointer;accent-color:#f59e0b;" />
                    </td>
                    <td style="padding:10px 6px;text-align:left;word-break:break-word;">
                        ${_esc(name)}
                        ${channel ? `<div style="font-size:11px;color:#f59e0b;font-style:italic;margin-top:2px;">${_esc(channel)}</div>` : ''}
                        ${note ? `<div style="font-size:11px;color:#64748b;font-style:italic;margin-top:2px;">${_esc(note)}</div>` : ''}
                    </td>
                    <td style="padding:10px 6px;text-align:center;">${qty}</td>
                    <td style="padding:10px 6px;">
                        <input type="text" data-ps-note="${idx}" placeholder="Nhập ghi chú..."
                            style="width:100%;padding:6px 8px;border:1px solid #d1d5db;border-radius:6px;font-size:12.5px;outline:none;" />
                    </td>
                </tr>`;
            })
            .join('');
        const total = `
            <tr style="border-top:2px solid #e5e7eb;font-weight:700;background:#f9fafb;">
                <td colspan="3" style="padding:10px 6px;text-align:right;">Tổng:</td>
                <td style="padding:10px 6px;text-align:center;">${totalQty}</td>
                <td></td>
            </tr>`;
        tbody.innerHTML = rows + total;
    }

    // ── Print HTML — khớp mẫu Phiếu Soạn Hàng (PHIẾU SOẠN HÀNG / STT / KH / NV /
    //    bảng STT|Sản phẩm|SL|Giá|Ghi chú; SP chờ hàng → "CHỜ HÀNG" đậm). ──
    function _buildPrintHTML(waiting, notes) {
        const o = _order;
        const customerName = o.customerName || '';
        const phone = o.phone || '';
        const address = o.address || '';
        const staff = _seller(o);
        // Lần in = số lần đã in + lần này (markPrinted chạy sau print) → tránh in trùng.
        const printNo = (Number(o.printCount) || 0) + 1;
        const now = new Date();
        const dateStr =
            `${String(now.getDate()).padStart(2, '0')}/${String(now.getMonth() + 1).padStart(2, '0')}/${now.getFullYear()} ` +
            `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
        let totalQty = 0;
        let totalAmount = 0;
        const rows = _products
            .map((p, idx) => {
                const name = p.name || p.productName || '';
                const note = p.note || '';
                const qty = parseFloat(p.quantity) || 1;
                const price = parseFloat(p.price) || parseFloat(p.sellingPrice) || 0;
                const channel = o.channel || p.source || '';
                const isWaiting = waiting.has(idx);
                const userNote = notes[idx] || '';
                totalQty += qty;
                totalAmount += qty * price;
                const priceShort = Math.round(price / 1000);
                let ghiChu = '';
                if (isWaiting)
                    ghiChu += '<b style="font-size:13px;white-space:nowrap;">CHỜ HÀNG</b>';
                if (userNote)
                    ghiChu +=
                        (ghiChu ? ' ' : '') +
                        `<span style="font-size:12px;">${_esc(userNote)}</span>`;
                return `
                <tr>
                    <td style="border:1px solid #000;padding:5px 4px;text-align:center;">${idx + 1}</td>
                    <td style="border:1px solid #000;padding:5px 4px;text-align:left;word-break:break-word;font-size:14px;font-weight:bold;">
                        ${_esc(name)}
                        ${channel ? `<div style="font-size:11px;font-weight:normal;font-style:italic;">${_esc(channel)}</div>` : ''}
                        ${note ? `<div style="font-size:13px;font-weight:bold;margin-top:2px;">${_esc(note)}</div>` : ''}
                    </td>
                    <td style="border:1px solid #000;padding:5px 4px;text-align:center;">${qty}</td>
                    <td style="border:1px solid #000;padding:5px 4px;text-align:right;font-size:11px;">${priceShort}</td>
                    <td style="border:1px solid #000;padding:5px 4px;text-align:center;">${ghiChu}</td>
                </tr>`;
            })
            .join('');
        const totalRow = `
            <tr>
                <td colspan="2" style="border:1px solid #000;padding:5px 4px;text-align:right;font-weight:bold;">Tổng:</td>
                <td style="border:1px solid #000;padding:5px 4px;text-align:center;font-weight:bold;">${totalQty}</td>
                <td style="border:1px solid #000;padding:5px 4px;text-align:right;font-weight:bold;">${totalAmount.toLocaleString('vi-VN')}</td>
                <td style="border:1px solid #000;padding:5px 4px;"></td>
            </tr>`;
        return `<!DOCTYPE html><html><head><meta charset="utf-8" /><title>Phiếu Soạn Hàng</title>
<style>
@page { margin: 5mm 3mm; }
body { font-family: Arial, Helvetica, sans-serif; font-size: 13px; color: #000; margin: 0; padding: 0; }
.container { width: 100%; padding: 3px; }
h2 { text-align: center; margin: 8px 0 4px; font-size: 20px; text-transform: uppercase; }
table { width: 100%; border-collapse: collapse; margin-top: 8px; }
th { border: 1px solid #000; padding: 4px 3px; text-align: center; background: #f5f5f5; font-size: 11px; }
</style></head>
<body><div class="container">
    <h2>Phiếu Soạn Hàng</h2>
    <div style="text-align:center;margin-bottom:8px;">
        <span style="font-size:22px;font-weight:bold;">${_esc(_stt)}</span>
        <span style="font-size:12px;margin-left:10px;">${dateStr}</span>
        ${printNo > 0 ? `<span style="font-size:12px;margin-left:10px;">🖨 ${printNo}</span>` : ''}
    </div>
    <div style="margin-bottom:3px;"><b>Khách hàng:</b> ${_esc(customerName)}</div>
    <div style="margin-bottom:3px;"><b>SĐT:</b> ${_esc(phone)}${staff ? `  -  <b>Nhân viên:</b> ${_esc(staff)}` : ''}</div>
    ${address ? `<div style="margin-bottom:3px;"><b>Địa chỉ:</b> ${_esc(address)}</div>` : ''}
    <table>
        <thead><tr>
            <th style="width:15px;font-size:9px;">STT</th>
            <th>Sản phẩm</th>
            <th style="width:15px;font-size:9px;">SL</th>
            <th style="width:30px;font-size:9px;">Giá</th>
            <th style="width:46px;font-size:9px;">Ghi chú</th>
        </tr></thead>
        <tbody>${rows}${totalRow}</tbody>
    </table>
</div></body></html>`;
    }

    // Fallback iframe nội bộ (chỉ khi Web2Bill chưa load) — tái dùng 1 frame.
    let _frame = null;
    function _printViaLocalIframe(html) {
        if (!_frame || !_frame.isConnected) {
            _frame = document.createElement('iframe');
            _frame.style.cssText =
                'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;';
            document.body.appendChild(_frame);
        }
        const win = _frame.contentWindow;
        const doc = win.document;
        doc.open();
        doc.write(html);
        doc.close();
        let printed = false;
        const go = () => {
            if (printed) return;
            printed = true;
            try {
                win.focus();
                win.print();
            } catch (e) {
                console.warn('[packing-slip] print error', e.message);
            }
        };
        win.onload = go;
        if (typeof win.requestAnimationFrame === 'function')
            win.requestAnimationFrame(() => win.requestAnimationFrame(go));
        else setTimeout(go, 60);
    }

    async function _print() {
        if (!_order || !_products.length) {
            _notify('Không có dữ liệu để in', 'warning');
            return;
        }
        const waiting = new Set();
        _modal.querySelectorAll('[data-ps-wait]').forEach((cb) => {
            if (cb.checked) waiting.add(parseInt(cb.dataset.psWait, 10));
        });
        const notes = {};
        _modal.querySelectorAll('[data-ps-note]').forEach((inp) => {
            const v = inp.value.trim();
            if (v) notes[parseInt(inp.dataset.psNote, 10)] = v;
        });
        // Toggle IN (admin, thẻ 'soan_hang' ở Cấu hình thẻ): BẬT → in giấy thật; TẮT → KHÔNG
        // in giấy nhưng VẪN gắn tag SOẠN HÀNG. Fail-open (lỗi / chưa load API → in như cũ).
        let doPrint = true;
        try {
            if (global.NativeOrdersApi && global.NativeOrdersApi.soanHangPrintEnabled)
                doPrint = await global.NativeOrdersApi.soanHangPrintEnabled();
        } catch (_) {}
        if (doPrint) {
            const html = _buildPrintHTML(waiting, notes);
            // DÙNG CHUNG đường in của Web2Bill (1 nguồn): role 'pbh' có máy bridge (IP) → in
            // THẲNG ESC/POS không hộp thoại; chưa gán máy → fallback hộp thoại. Web2Bill chưa
            // load → iframe nội bộ (defensive).
            if (global.Web2Bill && global.Web2Bill.printDocHtml) {
                global.Web2Bill.printDocHtml(html, { role: 'pbh', label: 'Phiếu Soạn Hàng' });
            } else {
                _printViaLocalIframe(html);
            }
        } else {
            _notify('Đã đánh dấu Soạn Hàng (chức năng IN đang tắt — admin)', 'info');
        }
        // LUÔN gắn tag SOẠN HÀNG (onPrint) — kể cả khi không in giấy. Truyền doPrint để caller
        // chọn bump 🖨 (in thật) hay chỉ gắn tag (in tắt).
        if (_onPrint) {
            try {
                _onPrint(_order, doPrint);
            } catch (e) {
                /* noop */
            }
        }
        close();
    }

    /**
     * Mở Phiếu Soạn Hàng.
     * @param {object} order — native order ({products, customerName, phone, address, ...})
     * @param {object} opts  — { sttDisplay: string }
     */
    function open(order, opts = {}) {
        if (!order) {
            _notify('Không tìm thấy đơn', 'error');
            return;
        }
        _order = order;
        _products = Array.isArray(order.products) ? order.products.slice() : [];
        _stt = opts.sttDisplay != null ? String(opts.sttDisplay) : String(order.displayStt || '');
        // onClose: fire 1 lần khi modal đóng (hủy/in xong) → dùng để xếp hàng in
        // nhiều giỏ hàng tuần tự (chọn mix trạng thái).
        _onClose = typeof opts.onClose === 'function' ? opts.onClose : null;
        // onPrint(order): fire khi bấm IN → ghi số lần in.
        _onPrint = typeof opts.onPrint === 'function' ? opts.onPrint : null;
        _ensureModal();
        const staff = _seller(order);
        _modal.querySelector('#noPsHeader').innerHTML = `
            <div style="display:flex;gap:8px 22px;flex-wrap:wrap;">
                <div><b>Khách hàng:</b> ${_esc(order.customerName || '')}</div>
                <div><b>SĐT:</b> ${_esc(order.phone || '')}</div>
                ${staff ? `<div><b>Nhân viên:</b> ${_esc(staff)}</div>` : ''}
                <div><b>STT:</b> ${_esc(_stt)}</div>
            </div>
            ${order.address ? `<div style="margin-top:4px;"><b>Địa chỉ:</b> ${_esc(order.address)}</div>` : ''}`;
        _renderRows();
        _modal.style.display = 'flex';
    }
    function close() {
        if (_modal) _modal.style.display = 'none';
        const cb = _onClose;
        _onClose = null; // chỉ fire 1 lần
        if (cb) {
            try {
                cb();
            } catch (e) {
                console.warn('[packing-slip] onClose error', e.message);
            }
        }
    }

    global.NativeOrdersPackingSlip = { open, close };
})(typeof window !== 'undefined' ? window : globalThis);
