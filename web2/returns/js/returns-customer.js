// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — CUSTOMER: search/picker/selection + load đơn KH.
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { api, esc, $, toast, STATE } = C;

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
        // Task 2: scroll next step into view so user sees the order-picker right away.
        setTimeout(() => {
            ($('rightBody') || $('formSections'))?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }, 50);
        // Wallet balance cho COD "trừ công nợ khách". Reset trước khi fetch + .catch
        // để KHÔNG dùng số dư stale của khách trước nếu fetch lỗi (tránh trừ nhầm công nợ).
        STATE.walletBalance = null;
        window.ReturnsCod.renderCodWallet();
        api.walletBalance(phone)
            .then((b) => {
                STATE.walletBalance = b;
                window.ReturnsCod.renderCodWallet();
            })
            .catch((e) => {
                STATE.walletBalance = 0;
                window.ReturnsCod.renderCodWallet();
                console.warn('[returns] walletBalance fetch failed:', e && e.message);
            });
        loadCustomerOrders();
        window.ReturnsForm.renderSummary();
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
        window.ReturnsForm.renderSummary();
    }

    // ---------------- Load đơn của khách ----------------
    async function loadCustomerOrders() {
        if (!STATE.customer) return;
        $('orderList').innerHTML = '<div class="rt-muted">Đang tải đơn của khách…</div>';
        try {
            // Fetch đơn + phiếu thu về active của KH song song → đánh dấu đơn đã có phiếu
            // (audit #LOW: tránh tạo trùng, chỉ biết sau khi bấm & nhận lỗi 400).
            const [d, rets] = await Promise.all([
                api.customerOrders(STATE.customer.phone),
                api
                    .list({ search: STATE.customer.phone, status: 'active', limit: 200 })
                    .catch(() => ({ returns: [] })),
            ]);
            const returnedCodes = new Set(
                (rets.returns || []).filter((r) => r.sourceOrderCode).map((r) => r.sourceOrderCode)
            );
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
                    const retBadge = returnedCodes.has(o.number)
                        ? '<span class="rt-tag rt-tag-ret">Đã có phiếu</span>'
                        : '';
                    return `<label class="rt-order${sel}" data-code="${esc(o.number)}" data-type="${o.source}" data-total="${o.totalAmount}">
                        <input type="radio" name="srcOrder" ${sel ? 'checked' : ''}/>
                        <span class="rt-order-main">
                            <b>${esc(o.number)}</b> <span class="rt-tag">${srcBadge}</span> ${retBadge}
                            <span class="rt-muted">${esc((o.date || '').slice(0, 10))} · ${o.itemCount} SP</span>
                        </span>
                        <span class="rt-order-amt">${C.fmt(o.totalAmount)}</span>
                    </label>`;
                })
                .join('');
            // Bớt 1 bước: khách chỉ có 1 đơn → tự chọn luôn.
            if (orders.length === 1 && !STATE.sourceOrder) {
                const o = orders[0];
                window.ReturnsItems.pickOrder(o.number, o.source, o.totalAmount);
            }
        } catch (err) {
            $('orderList').innerHTML =
                `<div class="rt-muted">Lỗi tải đơn: ${esc(err.message)}</div>`;
        }
    }

    window.ReturnsCustomer = {
        onCustInput,
        pickCustomer,
        clearCustomer,
        loadCustomerOrders,
    };
})();
