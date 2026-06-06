// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — page app.
//
// Cha = cách hàng về (TỒN KHO): khach_gui (+kho thật) / shipper_gui (+kho thu về chờ duyệt).
// Ví LUÔN cộng ngay. Con: khong_nhan_hang (hoàn cả đơn) / thu_ve_1_phan (chọn SP lẻ → bill 0đ).
// Mọi mutation đụng tiền/kho → giữ await + loading (ngoại lệ UI-first cho money ops).
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
    };
    const STOCK_LABEL = { applied: 'Đã vào kho thật', pending: 'Chờ duyệt', approved: 'Đã duyệt' };

    const STATE = {
        tab: 'create',
        customer: null, // {phone, name, customerId}
        method: 'khach_gui',
        subType: 'khong_nhan_hang',
        reason: 'khach_boom',
        sourceOrder: null, // {code, type, totalAmount}
        partial: [], // [{productCode, productName, quantity, price}]
        list: [],
        pending: [],
        _custTimer: null,
        _prodTimer: null,
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

    function pickCustomer(phone, name, cid) {
        STATE.customer = { phone, name, customerId: cid ? Number(cid) : null };
        STATE.sourceOrder = null;
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
        if (STATE.subType === 'khong_nhan_hang') loadCustomerOrders();
        renderSummary();
    }

    function clearCustomer() {
        STATE.customer = null;
        STATE.sourceOrder = null;
        $('custSelected').hidden = true;
        $('orderList').innerHTML = '';
        renderSummary();
    }

    // ---------------- Method / SubType ----------------
    function onMethodChange(v) {
        STATE.method = v;
        $('stockHint').innerHTML =
            v === 'shipper_gui'
                ? '<i data-lucide="clock"></i> Tồn kho <b>THU VỀ</b> — chờ duyệt mới cộng vào kho thật. Sản phẩm sẽ có badge "Thu về" ở Kho SP.'
                : '<i data-lucide="package-check"></i> Cộng <b>tồn kho thật</b> ngay lập tức.';
        if (window.lucide) lucide.createIcons();
        renderSummary();
    }

    function onSubTypeChange(v) {
        STATE.subType = v;
        $('boomSection').hidden = v !== 'khong_nhan_hang';
        $('partialSection').hidden = v !== 'thu_ve_1_phan';
        if (v === 'khong_nhan_hang' && STATE.customer) loadCustomerOrders();
        renderSummary();
    }

    function onReasonChange(v) {
        STATE.reason = v;
        $('reasonNoteWrap').hidden = v !== 'khac';
        renderSummary();
    }

    // ---------------- Khách không nhận hàng: order picker ----------------
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

    function pickOrder(code, type, total) {
        STATE.sourceOrder = { code, type, totalAmount: Number(total) || 0 };
        document.querySelectorAll('#orderList .rt-order').forEach((el) => {
            el.classList.toggle('is-picked', el.dataset.code === code);
        });
        renderSummary();
    }

    // ---------------- Thu về 1 phần: product picker ----------------
    function onProdInput(e) {
        const q = e.target.value.trim();
        clearTimeout(STATE._prodTimer);
        if (q.length < 1) {
            $('prodResults').hidden = true;
            return;
        }
        STATE._prodTimer = setTimeout(async () => {
            try {
                const d = await api.searchProducts(q);
                const list = d.products || [];
                $('prodResults').innerHTML = list.length
                    ? list
                          .map(
                              (p) =>
                                  `<div class="rt-opt" data-code="${esc(p.code)}" data-name="${esc(p.name)}" data-price="${p.price}">
                                     <strong>${esc(p.code)}</strong> <span>${esc(p.name)}</span>
                                     <span class="rt-muted">${fmt(p.price)} · tồn ${p.stock}</span>
                                   </div>`
                          )
                          .join('')
                    : '<div class="rt-opt rt-muted">Không tìm thấy SP</div>';
                $('prodResults').hidden = false;
            } catch (err) {
                toast('Lỗi tìm SP: ' + err.message, 'error');
            }
        }, 300);
    }

    function addPartial(code, name, price) {
        const exist = STATE.partial.find((x) => x.productCode === code);
        if (exist) exist.quantity += 1;
        else
            STATE.partial.push({
                productCode: code,
                productName: name,
                quantity: 1,
                price: Number(price) || 0,
            });
        $('prodResults').hidden = true;
        $('prodSearch').value = '';
        renderPartial();
    }

    function setPartialQty(code, qty) {
        const it = STATE.partial.find((x) => x.productCode === code);
        if (it) it.quantity = Math.max(1, Number(qty) || 1);
        renderSummary();
    }

    function removePartial(code) {
        STATE.partial = STATE.partial.filter((x) => x.productCode !== code);
        renderPartial();
    }

    function renderPartial() {
        const body = $('partialBody');
        if (!STATE.partial.length) {
            body.innerHTML =
                '<tr><td colspan="5" class="rt-muted" style="text-align:center;padding:14px;">Chưa chọn SP — tìm và bấm để thêm</td></tr>';
        } else {
            body.innerHTML = STATE.partial
                .map(
                    (it) => `<tr>
                        <td><b>${esc(it.productCode)}</b><div class="rt-muted">${esc(it.productName)}</div></td>
                        <td>${fmt(it.price)}</td>
                        <td><input type="number" min="1" value="${it.quantity}" class="rt-qty" data-code="${esc(it.productCode)}"/></td>
                        <td>${fmt(it.price * it.quantity)}</td>
                        <td><button class="rt-x" data-rm="${esc(it.productCode)}">✕</button></td>
                    </tr>`
                )
                .join('');
        }
        renderSummary();
    }

    // ---------------- Summary + submit ----------------
    function computeCredit() {
        if (STATE.subType === 'thu_ve_1_phan') {
            return STATE.partial.reduce((s, it) => s + it.price * it.quantity, 0);
        }
        // khong_nhan_hang: ví hoàn = phần đã trừ ví của đơn (tính server-side).
        return null;
    }

    function renderSummary() {
        const credit = computeCredit();
        const el = $('creditPreview');
        if (STATE.subType === 'thu_ve_1_phan') {
            el.innerHTML = `Cộng ví khách: <b>${fmt(credit)}</b> <span class="rt-muted">(giá bán × SL)</span>`;
        } else {
            el.innerHTML = STATE.sourceOrder
                ? `Hoàn cả đơn <b>${esc(STATE.sourceOrder.code)}</b> — ví hoàn <b>phần đã trừ ví</b> của đơn (hiện sau khi tạo).`
                : 'Chọn 1 đơn của khách để hoàn.';
        }
        const ok = canSubmit();
        $('btnSubmit').disabled = !ok;
    }

    function canSubmit() {
        if (!STATE.customer) return false;
        if (STATE.subType === 'thu_ve_1_phan') return STATE.partial.length > 0;
        return !!STATE.sourceOrder;
    }

    async function submit() {
        if (!canSubmit()) return;
        const btn = $('btnSubmit');
        btn.disabled = true;
        const orig = btn.innerHTML;
        btn.innerHTML = 'Đang lưu…';
        const base = {
            phone: STATE.customer.phone,
            customerName: STATE.customer.name,
            customerId: STATE.customer.customerId,
            method: STATE.method,
            subType: STATE.subType,
            note: $('noteInput').value.trim() || null,
        };
        let payload;
        if (STATE.subType === 'thu_ve_1_phan') {
            payload = { ...base, items: STATE.partial };
        } else {
            payload = {
                ...base,
                reason: STATE.reason,
                reasonNote: STATE.reason === 'khac' ? $('reasonNote').value.trim() : null,
                sourceOrderCode: STATE.sourceOrder.code,
                sourceOrderType: STATE.sourceOrder.type,
            };
        }
        try {
            const d = await api.create(payload);
            const r = d.return;
            toast(
                `Đã tạo ${r.code} — ví +${fmt(r.walletCredited)}${
                    STATE.method === 'shipper_gui' ? ' · kho thu về chờ duyệt' : ' · đã vào kho'
                }`,
                'success'
            );
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
        STATE.partial = [];
        $('noteInput').value = '';
        if ($('reasonNote')) $('reasonNote').value = '';
        renderPartial();
        $('orderList').innerHTML = '';
        if (STATE.customer && STATE.subType === 'khong_nhan_hang') loadCustomerOrders();
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

    function renderList() {
        const body = $('returnsBody');
        if (!STATE.list.length) {
            body.innerHTML =
                '<tr><td colspan="8" class="rt-muted" style="text-align:center;padding:16px;">Chưa có phiếu thu về.</td></tr>';
            return;
        }
        body.innerHTML = STATE.list
            .map((r) => {
                const subLabel =
                    r.subType === 'thu_ve_1_phan'
                        ? 'Thu về 1 phần'
                        : `Không nhận hàng${r.reason ? ' · ' + (REASON_LABEL[r.reason] || r.reason) : ''}`;
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
                return `<tr class="${cancelled ? 'rt-row-cancelled' : ''}">
                    <td><b>${esc(r.code)}</b></td>
                    <td>${esc(r.customerName || '')}<div class="rt-muted" data-w2wallet-phone="${esc(r.phone || '')}">${esc(r.phone || '')}</div></td>
                    <td><span class="rt-tag">${METHOD_LABEL[r.method] || r.method}</span></td>
                    <td>${esc(subLabel)} ${billTag}</td>
                    <td>${r.items?.length || 0} SP</td>
                    <td>${fmt(r.walletCredited)}</td>
                    <td><span class="rt-chip ${stockCls}">${STOCK_LABEL[r.stockStatus] || r.stockStatus}</span></td>
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
        if (!confirm(`Huỷ phiếu ${code}? Sẽ hoàn lại ví đã cộng và trừ lại tồn kho đã thêm.`))
            return;
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
            .querySelectorAll('input[name="subType"]')
            .forEach((r) => r.addEventListener('change', (e) => onSubTypeChange(e.target.value)));
        $('reasonSelect').addEventListener('change', (e) => onReasonChange(e.target.value));

        $('orderList').addEventListener('click', (e) => {
            const o = e.target.closest('.rt-order');
            if (o) pickOrder(o.dataset.code, o.dataset.type, o.dataset.total);
        });

        $('prodSearch').addEventListener('input', onProdInput);
        $('prodResults').addEventListener('click', (e) => {
            const opt = e.target.closest('.rt-opt[data-code]');
            if (opt) addPartial(opt.dataset.code, opt.dataset.name, opt.dataset.price);
        });
        $('partialBody').addEventListener('input', (e) => {
            if (e.target.classList.contains('rt-qty'))
                setPartialQty(e.target.dataset.code, e.target.value);
        });
        $('partialBody').addEventListener('click', (e) => {
            const rm = e.target.closest('[data-rm]');
            if (rm) removePartial(rm.dataset.rm);
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

        // close dropdowns on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#custSearch') && !e.target.closest('#custResults'))
                $('custResults').hidden = true;
            if (!e.target.closest('#prodSearch') && !e.target.closest('#prodResults'))
                $('prodResults').hidden = true;
        });
    }

    function init() {
        bind();
        onMethodChange('khach_gui');
        onSubTypeChange('khong_nhan_hang');
        onReasonChange('khach_boom');
        renderPartial();
        setupSse();
        // Deep-link từ notification: ?tab=pending&search=TV-...
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
