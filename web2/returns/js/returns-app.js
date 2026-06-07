// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — page app.
//
// Sau khi chọn KH → hiện: Cách hàng về (kho) · Vấn đề (khách/shipper) · Loại thu về.
//   - Vấn đề khách: thu hàng về kho. Loại = Khách không nhận hàng (cả đơn) | Thu về 1 phần
//     (chọn SP trong đơn → bill 0đ). Lý do theo (issue, method): Khách gửi → đổi ý/khác.
//   - Vấn đề shipper: Sửa COD (shipper gọi). COD giảm + lý do; "Trừ công nợ khách" → trừ ví.
// Ví/kho: mọi mutation tiền/kho giữ await + loading (ngoại lệ UI-first cho money ops).
// =====================================================================
(function () {
    'use strict';

    const api = window.Web2ReturnsApi;
    const fmt = (n) => (Number(n) || 0).toLocaleString('vi-VN') + '₫';
    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    const $ = (id) => document.getElementById(id);
    const toast = (msg, type = 'success') => {
        try {
            window.notificationManager?.show?.(msg, type);
        } catch {}
    };

    const METHOD_LABEL = { khach_gui: 'Khách gửi', shipper_gui: 'Shipper gửi' };
    const REASON_LABEL = {
        khach_boom: 'Khách boom',
        khong_lien_lac: 'Không liên lạc được',
        sai_dia_chi: 'Sai địa chỉ',
        doi_y: 'Đổi ý',
        khac: 'Khác',
        tinh_sai_ship: 'Tính sai ship',
        tru_cong_no_khach: 'Trừ công nợ khách',
        giam_gia_le_tien: 'Giảm giá/Lẻ tiền',
        khach_nhan_1_phan: 'Khách nhận 1 phần',
        tra_hang_don_cu: 'Trả hàng đơn cũ',
    };
    const STOCK_LABEL = { applied: 'Đã vào kho thật', pending: 'Chờ duyệt', approved: 'Đã duyệt' };
    // Lý do "Vấn đề khách" theo cách hàng về.
    const KHACH_REASONS_FULL = ['khach_boom', 'khong_lien_lac', 'sai_dia_chi', 'doi_y', 'khac'];
    const KHACH_REASONS_KHACHGUI = ['doi_y', 'khac']; // KH chủ động gửi → chỉ đổi ý/khác

    const STATE = {
        tab: 'create',
        customer: null, // {phone, name, customerId}
        method: 'shipper_gui',
        issue: 'van_de_khach',
        subType: 'thu_ve_1_phan',
        reason: 'khach_boom',
        reasonShip: 'tinh_sai_ship',
        sourceOrder: null, // {code,type,totalAmount,items,walletDeducted,cod,ship}
        lines: [], // [{productCode,productName,price,maxQty,qty,checked}] cho thu_ve_1_phan/cả đơn
        codReduction: 0,
        walletBalance: 0,
        list: [],
        pending: [],
        _custTimer: null,
    };

    // ---------------- Tabs ----------------
    function switchTab(tab) {
        STATE.tab = tab;
        ['create', 'list', 'pending'].forEach((t) => {
            $('tab-' + t)?.classList.toggle('is-active', t === tab);
            const p = $('panel-' + t);
            if (p) p.hidden = t !== tab;
        });
        if (tab === 'list') loadList();
        if (tab === 'pending') loadPending();
    }

    // ---------------- Customer picker ----------------
    function onCustInput(e) {
        const q = e.target.value.trim();
        clearTimeout(STATE._custTimer);
        if (q.length < 2) {
            $('custResults').hidden = true;
            return;
        }
        STATE._custTimer = setTimeout(async () => {
            try {
                const d = await api.searchCustomers(q);
                const list = d.data || d.customers || [];
                $('custResults').innerHTML = list.length
                    ? list
                          .map(
                              (c) =>
                                  `<div class="rt-opt" data-phone="${esc(c.phone)}" data-name="${esc(c.name || '')}" data-cid="${esc(c.id || '')}">
                                     <strong>${esc(c.name || '(không tên)')}</strong>
                                     <span class="rt-muted">${esc(c.phone || '')}</span>
                                   </div>`
                          )
                          .join('')
                    : '<div class="rt-opt rt-muted">Không tìm thấy KH</div>';
                $('custResults').hidden = false;
            } catch (err) {
                toast('Lỗi tìm KH: ' + err.message, 'error');
            }
        }, 300);
    }

    async function pickCustomer(phone, name, cid) {
        STATE.customer = { phone, name, customerId: cid ? Number(cid) : null };
        STATE.sourceOrder = null;
        STATE.lines = [];
        $('custResults').hidden = true;
        $('custSearch').value = '';
        const pill =
            `<span class="rt-cust-name">${esc(name || '(không tên)')}</span>` +
            `<span class="rt-muted">${esc(phone)}</span>` +
            `<span data-w2wallet-phone="${esc(phone)}"></span>`;
        $('custSelected').innerHTML =
            pill + `<button class="rt-x" id="custClear" title="Bỏ chọn">✕</button>`;
        $('custClear').onclick = clearCustomer;
        $('custSelected').hidden = false;
        try {
            window.Web2WalletBalance?.attachBalances?.($('custSelected'));
        } catch {}
        // Hiện form + body
        $('formSections').hidden = false;
        $('rightEmpty').hidden = true;
        $('rightBody').hidden = false;
        // Wallet balance cho COD "trừ công nợ khách"
        api.walletBalance(phone).then((b) => {
            STATE.walletBalance = b;
            renderCodWallet();
        });
        loadCustomerOrders();
        renderSummary();
    }

    function clearCustomer() {
        STATE.customer = null;
        STATE.sourceOrder = null;
        STATE.lines = [];
        $('custSelected').hidden = true;
        $('formSections').hidden = true;
        $('rightBody').hidden = true;
        $('rightEmpty').hidden = false;
        $('orderItems').hidden = true;
        $('orderSummary').hidden = true;
        renderSummary();
    }

    // ---------------- Cách hàng về / Vấn đề / Loại ----------------
    function onMethodChange(v) {
        STATE.method = v;
        $('stockHint').innerHTML =
            v === 'shipper_gui'
                ? '<i data-lucide="clock"></i> Tồn kho <b>THU VỀ</b> — chờ duyệt mới cộng kho thật. SP có badge "Thu về" ở Kho SP.'
                : '<i data-lucide="package-check"></i> Cộng <b>tồn kho thật</b> ngay lập tức.';
        // #4: Khách gửi → "Khách không nhận hàng" đổi nhãn "Thu cả đơn".
        const lbl = $('lblCaDon');
        if (lbl) lbl.textContent = v === 'khach_gui' ? 'Thu cả đơn' : 'Khách không nhận hàng';
        if (window.lucide) lucide.createIcons();
        buildReasonSelect();
        renderSummary();
    }

    function onIssueChange(v) {
        STATE.issue = v;
        const isShip = v === 'van_de_shipper';
        $('panelKhach').hidden = isShip;
        $('panelShipper').hidden = !isShip;
        // Loại thu về chỉ ý nghĩa với Vấn đề khách → ẩn khi shipper cho gọn.
        $('subTypeBlock').hidden = isShip;
        $('orderPickTitle').textContent = isShip ? 'Chọn đơn (áp COD)' : 'Chọn đơn';
        buildReasonSelect();
        // Re-render nội dung đơn theo flow
        if (STATE.sourceOrder) {
            renderOrderItems();
            renderCodCalc();
            renderCodWallet();
        }
        renderSummary();
    }

    function onSubTypeChange(v) {
        STATE.subType = v;
        renderOrderItems();
        renderSummary();
    }

    // Build lại dropdown Lý do (khách) theo (issue, method).
    function buildReasonSelect() {
        const sel = $('reasonSelect');
        if (!sel) return;
        const codes = STATE.method === 'khach_gui' ? KHACH_REASONS_KHACHGUI : KHACH_REASONS_FULL;
        sel.innerHTML = codes
            .map((c) => `<option value="${c}">${esc(REASON_LABEL[c])}</option>`)
            .join('');
        if (!codes.includes(STATE.reason)) STATE.reason = codes[0];
        sel.value = STATE.reason;
        $('reasonNoteWrap').hidden = STATE.reason !== 'khac';
    }

    function onReasonChange(v) {
        STATE.reason = v;
        $('reasonNoteWrap').hidden = v !== 'khac';
        renderSummary();
    }

    function onReasonShipChange(v) {
        STATE.reasonShip = v;
        renderCodWallet();
        renderSummary();
    }

    // ---------------- Order picker (dùng chung khách + shipper) ----------------
    async function loadCustomerOrders() {
        if (!STATE.customer) return;
        $('orderList').innerHTML = '<div class="rt-muted">Đang tải đơn của khách…</div>';
        try {
            const d = await api.customerOrders(STATE.customer.phone);
            const orders = (d.orders || []).filter(
                (o) => o.source !== 'refund' && o.state !== 'cancelled' && o.state !== 'cancel'
            );
            if (!orders.length) {
                $('orderList').innerHTML = '<div class="rt-muted">Khách chưa có đơn nào.</div>';
                return;
            }
            $('orderList').innerHTML = orders
                .map((o) => {
                    const sel = STATE.sourceOrder?.code === o.number ? ' is-picked' : '';
                    const srcBadge = o.source === 'pbh' ? 'PBH' : 'Đơn Web';
                    return `<label class="rt-order${sel}" data-code="${esc(o.number)}" data-type="${o.source}" data-total="${o.totalAmount}">
                        <input type="radio" name="srcOrder" ${sel ? 'checked' : ''}/>
                        <span class="rt-order-main">
                            <b>${esc(o.number)}</b> <span class="rt-tag">${srcBadge}</span>
                            <span class="rt-muted">${esc((o.date || '').slice(0, 10))} · ${o.itemCount} SP</span>
                        </span>
                        <span class="rt-order-amt">${fmt(o.totalAmount)}</span>
                    </label>`;
                })
                .join('');
        } catch (err) {
            $('orderList').innerHTML =
                `<div class="rt-muted">Lỗi tải đơn: ${esc(err.message)}</div>`;
        }
    }

    async function pickOrder(code, type, total) {
        STATE.sourceOrder = {
            code,
            type,
            totalAmount: Number(total) || 0,
            items: null,
            walletDeducted: null,
            cod: 0,
            ship: 0,
        };
        STATE.lines = [];
        document.querySelectorAll('#orderList .rt-order').forEach((el) => {
            el.classList.toggle('is-picked', el.dataset.code === code);
        });
        $('orderSummary').hidden = false;
        $('orderSummary').innerHTML = '<div class="rt-muted">Đang tải chi tiết đơn…</div>';
        try {
            const d = await api.sourceOrder(type, code);
            if (STATE.sourceOrder?.code !== code) return; // đổi đơn trong lúc tải
            STATE.sourceOrder.items = d.items || [];
            STATE.sourceOrder.walletDeducted = Number(d.walletDeducted) || 0;
            STATE.sourceOrder.cod = Number(d.cod) || 0;
            STATE.sourceOrder.ship = Number(d.ship) || 0;
            // Build lines cho chọn SP (thu về 1 phần / cả đơn)
            STATE.lines = (d.items || []).map((it) => ({
                productCode: it.productCode,
                productName: it.productName || '',
                price: Number(it.price) || 0,
                maxQty: Number(it.quantity) || 0,
                qty: Number(it.quantity) || 0,
                checked: false,
            }));
            renderOrderSummary();
            renderOrderItems();
            renderCodCalc();
            renderCodWallet();
            renderSummary();
        } catch (err) {
            $('orderSummary').innerHTML =
                `<div class="rt-muted">Lỗi tải đơn: ${esc(err.message)}</div>`;
        }
    }

    function renderOrderSummary() {
        const so = STATE.sourceOrder;
        if (!so || so.items == null) return;
        $('orderSummary').hidden = false;
        $('orderSummary').innerHTML =
            `<div class="rt-os-row"><span class="rt-muted">Tổng tiền</span><b>${fmt(so.totalAmount)}</b></div>` +
            `<div class="rt-os-row"><span class="rt-muted">COD</span><b>${fmt(so.cod)}</b></div>` +
            `<div class="rt-os-row"><span class="rt-muted">Ship</span><b>${fmt(so.ship)}</b></div>`;
    }

    // Render danh sách SP của đơn: cả đơn (read-only) hoặc 1 phần (checkbox + qty).
    function renderOrderItems() {
        const box = $('orderItems');
        if (
            STATE.issue !== 'van_de_khach' ||
            !STATE.sourceOrder ||
            STATE.sourceOrder.items == null
        ) {
            box.hidden = true;
            return;
        }
        box.hidden = false;
        if (!STATE.lines.length) {
            box.innerHTML =
                '<div class="rt-muted" style="padding:6px 4px;">Đơn không có dòng SP.</div>';
            return;
        }
        const partial = STATE.subType === 'thu_ve_1_phan';
        const title = partial ? 'Chọn SP thu về' : 'Sản phẩm hoàn (cả đơn)';
        const rows = STATE.lines
            .map((l, i) =>
                partial
                    ? `<div class="rt-oi-row rt-oi-sel">
                         <label class="rt-oi-check"><input type="checkbox" data-line="${i}" ${l.checked ? 'checked' : ''}/>
                           <span><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span></label>
                         <span class="rt-muted">${fmt(l.price)}</span>
                         <input type="number" class="rt-qty" data-lineqty="${i}" min="1" max="${l.maxQty}" value="${l.qty}" ${l.checked ? '' : 'disabled'}/>
                       </div>`
                    : `<div class="rt-oi-row">
                         <span><b>${esc(l.productCode)}</b> ${esc(l.productName)}</span>
                         <span class="rt-muted">${fmt(l.price)} × ${l.qty}</span>
                       </div>`
            )
            .join('');
        box.innerHTML = `<div class="rt-oi-title">${title} (${STATE.lines.length})</div>` + rows;
    }

    function toggleLine(i, checked) {
        if (STATE.lines[i]) STATE.lines[i].checked = checked;
        const qtyEl = document.querySelector(`[data-lineqty="${i}"]`);
        if (qtyEl) qtyEl.disabled = !checked;
        renderSummary();
    }
    function setLineQty(i, qty) {
        const l = STATE.lines[i];
        if (!l) return;
        l.qty = Math.max(1, Math.min(l.maxQty, Number(qty) || 1));
        renderSummary();
    }

    // ---------------- COD (shipper) ----------------
    function onCodInput(v) {
        STATE.codReduction = Math.max(0, Number(v) || 0);
        renderCodCalc();
        renderCodWallet();
        renderSummary();
    }

    function renderCodCalc() {
        const el = $('codCalc');
        if (STATE.issue !== 'van_de_shipper' || !STATE.sourceOrder) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const cod = STATE.sourceOrder.cod || 0;
        const giam = STATE.codReduction || 0;
        el.innerHTML =
            `<span>COD còn phải thu: <b class="rt-green">${fmt(cod - giam)}</b></span>` +
            `<span>Phải trả ĐVVC: <b class="rt-red">${fmt(giam)}</b></span>`;
    }

    function renderCodWallet() {
        const el = $('codWallet');
        if (
            STATE.issue !== 'van_de_shipper' ||
            STATE.reasonShip !== 'tru_cong_no_khach' ||
            !STATE.sourceOrder
        ) {
            el.hidden = true;
            return;
        }
        el.hidden = false;
        const bal = STATE.walletBalance || 0;
        const giam = STATE.codReduction || 0;
        const conLai = bal - giam;
        const thieu = conLai < 0;
        el.innerHTML =
            `<div class="rt-cw-row"><span>Số dư ví hiện tại: <b>${fmt(bal)}</b></span>` +
            `<span>Trừ vào ví: <b class="rt-red">${fmt(giam)}</b></span></div>` +
            `<div class="rt-cw-row"><span>Ví còn lại: <b>${fmt(Math.max(0, conLai))}</b></span>` +
            (thieu
                ? `<span class="rt-red">⚠ Ví không đủ (thiếu ${fmt(-conLai)})</span>`
                : '<span></span>') +
            `</div>`;
    }

    // ---------------- Summary + submit ----------------
    function selectedLines() {
        return STATE.lines.filter((l) => l.checked && l.qty > 0);
    }

    function renderSummary() {
        const el = $('creditPreview');
        if (STATE.issue === 'van_de_shipper') {
            const giam = STATE.codReduction || 0;
            const truVi = STATE.reasonShip === 'tru_cong_no_khach';
            el.innerHTML = truVi
                ? `Trừ ví khách: <b>${fmt(giam)}</b> · Phải trả ĐVVC: <b>${fmt(giam)}</b>`
                : `Phải trả ĐVVC: <b>${fmt(giam)}</b> <span class="rt-muted">(không trừ ví)</span>`;
        } else if (STATE.subType === 'thu_ve_1_phan') {
            const credit = selectedLines().reduce((s, l) => s + l.price * l.qty, 0);
            el.innerHTML = `Cộng ví khách: <b>${fmt(credit)}</b> <span class="rt-muted">(giá bán × SL)</span>`;
        } else {
            const so = STATE.sourceOrder;
            if (!so) el.innerHTML = 'Chọn 1 đơn của khách để hoàn.';
            else if (so.walletDeducted != null)
                el.innerHTML =
                    so.walletDeducted > 0
                        ? `Hoàn cả đơn <b>${esc(so.code)}</b> — cộng ví <b>${fmt(so.walletDeducted)}</b> <span class="rt-muted">(phần đã trừ ví)</span>`
                        : `Hoàn cả đơn <b>${esc(so.code)}</b> — <span class="rt-muted">đơn chưa trừ ví → chỉ +kho</span>`;
            else el.innerHTML = `Hoàn cả đơn <b>${esc(so.code)}</b> …`;
        }
        $('btnSubmit').disabled = !canSubmit();
    }

    function canSubmit() {
        if (!STATE.customer || !STATE.sourceOrder || STATE.sourceOrder.items == null) return false;
        if (STATE.issue === 'van_de_shipper') {
            if (!(STATE.codReduction > 0)) return false;
            if (
                STATE.reasonShip === 'tru_cong_no_khach' &&
                STATE.codReduction > STATE.walletBalance
            )
                return false; // ví không đủ
            return true;
        }
        if (STATE.subType === 'thu_ve_1_phan') return selectedLines().length > 0;
        return true; // khong_nhan_hang: đã có đơn
    }

    async function submit() {
        if (!canSubmit()) return;
        const btn = $('btnSubmit');
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = 'Đang lưu…';
        const c = STATE.customer;
        const so = STATE.sourceOrder;
        let payload;
        if (STATE.issue === 'van_de_shipper') {
            payload = {
                phone: c.phone,
                customerName: c.name,
                customerId: c.customerId,
                method: 'shipper_gui',
                subType: 'cod_shipper',
                issue: 'van_de_shipper',
                reason: STATE.reasonShip,
                sourceOrderCode: so.code,
                sourceOrderType: so.type,
                codReduction: STATE.codReduction,
                note: $('noteInput').value.trim() || null,
            };
        } else {
            const base = {
                phone: c.phone,
                customerName: c.name,
                customerId: c.customerId,
                method: STATE.method,
                issue: 'van_de_khach',
                sourceOrderCode: so.code,
                sourceOrderType: so.type,
                note: $('noteInput').value.trim() || null,
            };
            if (STATE.subType === 'thu_ve_1_phan') {
                payload = {
                    ...base,
                    subType: 'thu_ve_1_phan',
                    items: selectedLines().map((l) => ({
                        productCode: l.productCode,
                        productName: l.productName,
                        quantity: l.qty,
                        price: l.price,
                    })),
                };
            } else {
                payload = {
                    ...base,
                    subType: 'khong_nhan_hang',
                    reason: STATE.reason,
                    reasonNote: STATE.reason === 'khac' ? $('reasonNote').value.trim() : null,
                };
            }
        }
        try {
            const d = await api.create(payload);
            const r = d.return;
            const msg =
                STATE.issue === 'van_de_shipper'
                    ? `Đã tạo ${r.code} — COD giảm ${fmt(r.codReduction)}${r.walletCredited < 0 ? ' · trừ ví ' + fmt(-r.walletCredited) : ''}`
                    : `Đã tạo ${r.code} — ví +${fmt(r.walletCredited)}${STATE.method === 'shipper_gui' ? ' · kho thu về chờ duyệt' : ' · đã vào kho'}`;
            toast(msg, 'success');
            resetForm();
            switchTab('list');
        } catch (err) {
            toast('Lỗi tạo phiếu: ' + err.message, 'error');
        } finally {
            btn.innerHTML = orig;
            btn.disabled = false;
        }
    }

    function resetForm() {
        STATE.sourceOrder = null;
        STATE.lines = [];
        STATE.codReduction = 0;
        if ($('noteInput')) $('noteInput').value = '';
        if ($('reasonNote')) $('reasonNote').value = '';
        if ($('codReduction')) $('codReduction').value = '';
        $('orderItems').hidden = true;
        $('orderSummary').hidden = true;
        $('codCalc').hidden = true;
        $('codWallet').hidden = true;
        if (STATE.customer) loadCustomerOrders();
    }

    // ---------------- List ----------------
    async function loadList() {
        const body = $('returnsBody');
        body.innerHTML =
            '<tr><td colspan="8" class="rt-muted" style="text-align:center;padding:16px;">Đang tải…</td></tr>';
        try {
            const search = $('listSearch').value.trim();
            const d = await api.list(search ? { search } : {});
            STATE.list = d.returns || [];
            renderList();
        } catch (err) {
            body.innerHTML = `<tr><td colspan="8" class="rt-muted" style="text-align:center;">Lỗi: ${esc(err.message)}</td></tr>`;
        }
    }

    function _typeLabel(r) {
        if (r.issue === 'van_de_shipper')
            return `Sửa COD${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
        if (r.subType === 'thu_ve_1_phan') return 'Thu về 1 phần';
        return `Không nhận hàng${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
    }

    function renderList() {
        const body = $('returnsBody');
        if (!STATE.list.length) {
            body.innerHTML =
                '<tr><td colspan="8" class="rt-muted" style="text-align:center;padding:16px;">Chưa có phiếu thu về.</td></tr>';
            return;
        }
        body.innerHTML = STATE.list
            .map((r) => {
                const isShip = r.issue === 'van_de_shipper';
                const stockCls =
                    r.stockStatus === 'pending'
                        ? 'rt-st-pending'
                        : r.stockStatus === 'approved'
                          ? 'rt-st-approved'
                          : 'rt-st-applied';
                const cancelled = r.status === 'cancelled';
                const billTag =
                    r.billStatus === 'queued'
                        ? '<span class="rt-tag rt-tag-bill">Chờ bill 0đ</span>'
                        : r.billStatus === 'consumed'
                          ? '<span class="rt-tag">Đã lên bill</span>'
                          : '';
                // Cột "Ví cộng": shipper trừ ví → hiện âm; khách → cộng.
                const walletCell = isShip
                    ? r.walletCredited < 0
                        ? `<span class="rt-red">−${fmt(-r.walletCredited)}</span>`
                        : `<span class="rt-muted">COD ${fmt(r.codReduction)}</span>`
                    : fmt(r.walletCredited);
                const stockCell = isShip
                    ? '<span class="rt-muted">—</span>'
                    : `<span class="rt-chip ${stockCls}">${STOCK_LABEL[r.stockStatus] || r.stockStatus}</span>`;
                return `<tr class="${cancelled ? 'rt-row-cancelled' : ''}">
                    <td><b>${esc(r.code)}</b></td>
                    <td>${esc(r.customerName || '')}<div class="rt-muted" data-w2wallet-phone="${esc(r.phone || '')}">${esc(r.phone || '')}</div></td>
                    <td><span class="rt-tag">${isShip ? 'Shipper' : METHOD_LABEL[r.method] || r.method}</span></td>
                    <td>${esc(_typeLabel(r))} ${billTag}</td>
                    <td>${isShip ? '—' : (r.items?.length || 0) + ' SP'}</td>
                    <td>${walletCell}</td>
                    <td>${stockCell}</td>
                    <td class="rt-actions">
                        ${cancelled ? '<span class="rt-muted">Đã huỷ</span>' : `<button class="rt-btn-del" data-del="${esc(r.code)}" title="Huỷ phiếu + hoàn lại ví/kho">Huỷ</button>`}
                    </td>
                </tr>`;
            })
            .join('');
        try {
            window.Web2WalletBalance?.attachBalances?.(body);
        } catch {}
    }

    async function removeReturn(code) {
        if (!confirm(`Huỷ phiếu ${code}? Sẽ hoàn lại ví/kho đã thay đổi.`)) return;
        try {
            await api.remove(code);
            toast(`Đã huỷ ${code}`, 'success');
            loadList();
        } catch (err) {
            toast('Lỗi huỷ: ' + err.message, 'error');
        }
    }

    // ---------------- Pending (duyệt) ----------------
    async function loadPending() {
        const wrap = $('pendingList');
        wrap.innerHTML = '<div class="rt-muted">Đang tải…</div>';
        try {
            const d = await api.pending();
            STATE.pending = d.items || [];
            renderPending();
        } catch (err) {
            wrap.innerHTML = `<div class="rt-muted">Lỗi: ${esc(err.message)}</div>`;
        }
    }

    function renderPending() {
        const wrap = $('pendingList');
        $('pendingCount').textContent = STATE.pending.length;
        if (!STATE.pending.length) {
            wrap.innerHTML =
                '<div class="rt-empty"><i data-lucide="check-circle"></i> Không có phiếu nào chờ duyệt.</div>';
            if (window.lucide) lucide.createIcons();
            return;
        }
        wrap.innerHTML = STATE.pending
            .map((r) => {
                const items = (r.items || [])
                    .map(
                        (it) =>
                            `<span class="rt-pill">${esc(it.productCode)} ×${it.quantity}</span>`
                    )
                    .join(' ');
                return `<div class="rt-pending-card ${r.overdue ? 'is-overdue' : ''}">
                    <div class="rt-pending-head">
                        <b>${esc(r.code)}</b>
                        <span class="rt-muted">${esc(r.customerName || '')} · ${esc(r.phone || '')}</span>
                        <span class="rt-age ${r.overdue ? 'is-overdue' : ''}">${r.ageDays} ngày${r.overdue ? ' ⚠ quá hạn' : ''}</span>
                    </div>
                    <div class="rt-pending-items">${items}</div>
                    <div class="rt-pending-foot">
                        <span class="rt-muted">Ví đã cộng: ${fmt(r.walletCredited)}</span>
                        <button class="rt-btn-approve" data-approve="${esc(r.code)}"><i data-lucide="check"></i> Duyệt → cộng kho thật</button>
                    </div>
                </div>`;
            })
            .join('');
        if (window.lucide) lucide.createIcons();
    }

    async function approve(code) {
        const btn = document.querySelector(`[data-approve="${CSS.escape(code)}"]`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = 'Đang duyệt…';
        }
        try {
            await api.approve(code);
            toast(`Đã duyệt ${code} — cộng vào kho thật`, 'success');
            loadPending();
        } catch (err) {
            toast('Lỗi duyệt: ' + err.message, 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = 'Duyệt';
            }
        }
    }

    // ---------------- SSE ----------------
    let _sseTimer = null;
    function setupSse() {
        if (!window.Web2SSE?.subscribe) return;
        window.Web2SSE.subscribe('web2:returns', () => {
            clearTimeout(_sseTimer);
            _sseTimer = setTimeout(() => {
                if (STATE.tab === 'list') loadList();
                else if (STATE.tab === 'pending') loadPending();
            }, 600);
        });
    }

    // ---------------- Event delegation ----------------
    function bind() {
        $('tab-create').onclick = () => switchTab('create');
        $('tab-list').onclick = () => switchTab('list');
        $('tab-pending').onclick = () => switchTab('pending');

        $('custSearch').addEventListener('input', onCustInput);
        $('custResults').addEventListener('click', (e) => {
            const opt = e.target.closest('.rt-opt[data-phone]');
            if (opt) pickCustomer(opt.dataset.phone, opt.dataset.name, opt.dataset.cid);
        });

        document
            .querySelectorAll('input[name="method"]')
            .forEach((r) => r.addEventListener('change', (e) => onMethodChange(e.target.value)));
        document
            .querySelectorAll('input[name="issue"]')
            .forEach((r) => r.addEventListener('change', (e) => onIssueChange(e.target.value)));
        document
            .querySelectorAll('input[name="subType"]')
            .forEach((r) => r.addEventListener('change', (e) => onSubTypeChange(e.target.value)));
        $('reasonSelect').addEventListener('change', (e) => onReasonChange(e.target.value));
        $('reasonSelectShip').addEventListener('change', (e) => onReasonShipChange(e.target.value));
        $('codReduction').addEventListener('input', (e) => onCodInput(e.target.value));

        $('orderList').addEventListener('click', (e) => {
            const o = e.target.closest('.rt-order');
            if (o) pickOrder(o.dataset.code, o.dataset.type, o.dataset.total);
        });
        $('orderItems').addEventListener('change', (e) => {
            const cb = e.target.closest('[data-line]');
            if (cb) toggleLine(Number(cb.dataset.line), cb.checked);
        });
        $('orderItems').addEventListener('input', (e) => {
            const q = e.target.closest('[data-lineqty]');
            if (q) setLineQty(Number(q.dataset.lineqty), q.value);
        });

        $('btnSubmit').addEventListener('click', submit);
        $('listSearch').addEventListener('input', () => {
            clearTimeout(STATE._custTimer);
            STATE._custTimer = setTimeout(loadList, 350);
        });
        $('returnsBody').addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) removeReturn(del.dataset.del);
        });
        $('pendingList').addEventListener('click', (e) => {
            const ap = e.target.closest('[data-approve]');
            if (ap) approve(ap.dataset.approve);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#custSearch') && !e.target.closest('#custResults'))
                $('custResults').hidden = true;
        });
    }

    function init() {
        try {
            window.Web2Sidebar?.mount?.('#web2Aside');
        } catch (e) {
            console.warn('[returns] sidebar mount fail:', e);
        }
        bind();
        onMethodChange('shipper_gui');
        onIssueChange('van_de_khach');
        onSubTypeChange('thu_ve_1_phan');
        buildReasonSelect();
        setupSse();
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab === 'pending') switchTab('pending');
        else if (tab === 'list') switchTab('list');
        else switchTab('create');
        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    window.Web2Returns = { switchTab, approve, removeReturn };
})();
