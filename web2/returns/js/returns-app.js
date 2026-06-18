// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Thu về (Goods Return) — page app ORCHESTRATOR.
//
// Sau khi chọn KH → hiện: Cách hàng về (kho) · Vấn đề (khách/shipper) · Loại thu về.
//   - Vấn đề khách: thu hàng về kho. Loại = Khách không nhận hàng (cả đơn) | Thu về 1 phần
//     (chọn SP trong đơn → bill 0đ). Lý do theo (issue, method): Khách gửi → đổi ý/khác.
//   - Vấn đề shipper: Sửa COD (shipper gọi). COD giảm + lý do; "Trừ công nợ khách" → trừ ví.
// Ví/kho: mọi mutation tiền/kho giữ await + loading (ngoại lệ UI-first cho money ops).
//
// Module wiring (load order trong index.html):
//   returns-core → returns-customer → returns-order-items → returns-cod
//   → returns-form → returns-tabs → returns-app (file này, LAST)
// =====================================================================
(function () {
    'use strict';

    const C = window.ReturnsCore;
    const { $, toast, STATE } = C;
    const Customer = window.ReturnsCustomer;
    const Items = window.ReturnsItems;
    const Cod = window.ReturnsCod;
    const Form = window.ReturnsForm;
    const Tabs = window.ReturnsTabs;

    // ---------------- SSE ----------------
    let _sseTimer = null;
    function setupSse() {
        if (!window.Web2SSE?.subscribe) return;
        window.Web2SSE.subscribe('web2:returns', () => {
            clearTimeout(_sseTimer);
            _sseTimer = setTimeout(() => {
                if (STATE.tab === 'list') Tabs.loadList();
                else if (STATE.tab === 'pending') Tabs.loadPending();
            }, 600);
        });
    }

    // ---------------- Event delegation ----------------
    function bind() {
        $('tab-create').onclick = () => Tabs.switchTab('create');
        $('tab-list').onclick = () => Tabs.switchTab('list');
        $('tab-pending').onclick = () => Tabs.switchTab('pending');

        $('custSearch').addEventListener('input', Customer.onCustInput);
        $('custResults').addEventListener('click', (e) => {
            const opt = e.target.closest('.rt-opt[data-phone]');
            if (opt) Customer.pickCustomer(opt.dataset.phone, opt.dataset.name, opt.dataset.cid);
        });

        document
            .querySelectorAll('input[name="method"]')
            .forEach((r) =>
                r.addEventListener('change', (e) => Form.onMethodChange(e.target.value))
            );
        document
            .querySelectorAll('input[name="issue"]')
            .forEach((r) =>
                r.addEventListener('change', (e) => Form.onIssueChange(e.target.value))
            );
        document
            .querySelectorAll('input[name="subType"]')
            .forEach((r) =>
                r.addEventListener('change', (e) => Form.onSubTypeChange(e.target.value))
            );
        $('reasonSelect').addEventListener('change', (e) => Form.onReasonChange(e.target.value));
        $('reasonSelectShip').addEventListener('change', (e) =>
            Form.onReasonShipChange(e.target.value)
        );
        $('codReduction').addEventListener('input', (e) => Cod.onCodInput(e.target.value));

        $('orderList').addEventListener('click', (e) => {
            const o = e.target.closest('.rt-order');
            if (o) Items.pickOrder(o.dataset.code, o.dataset.type, o.dataset.total);
        });
        $('orderItems').addEventListener('change', (e) => {
            const cb = e.target.closest('[data-line]');
            if (cb) Items.toggleLine(Number(cb.dataset.line), cb.checked);
        });
        $('orderItems').addEventListener('click', (e) => {
            if (!e.target.closest('#rtSelAll')) return;
            const allOn = STATE.lines.length > 0 && STATE.lines.every((l) => l.checked);
            STATE.lines.forEach((l) => (l.checked = !allOn));
            Items.renderOrderItems();
            Form.renderSummary();
        });
        $('orderItems').addEventListener('input', (e) => {
            const q = e.target.closest('[data-lineqty]');
            if (q) Items.setLineQty(Number(q.dataset.lineqty), q.value);
        });

        $('btnSubmit').addEventListener('click', Form.submit);
        $('listSearch').addEventListener('input', () => {
            clearTimeout(STATE._custTimer);
            STATE._custTimer = setTimeout(Tabs.loadList, 350);
        });
        $('returnsBody').addEventListener('click', (e) => {
            const del = e.target.closest('[data-del]');
            if (del) Tabs.removeReturn(del.dataset.del);
        });
        $('pendingList').addEventListener('click', (e) => {
            const ap = e.target.closest('[data-approve]');
            if (ap) Tabs.approve(ap.dataset.approve);
        });

        document.addEventListener('click', (e) => {
            if (!e.target.closest('#custSearch') && !e.target.closest('#custResults'))
                $('custResults').hidden = true;
        });

        document.addEventListener('keydown', (e) => {
            // Escape — clear selected customer when one is chosen
            if (e.key === 'Escape' && STATE.customer) {
                e.preventDefault();
                Customer.clearCustomer();
                return;
            }
            // Enter — submit when create tab is active and button is enabled
            // (bỏ qua khi đang gõ IME tiếng Việt — tránh tạo phiếu trả với chữ soạn dở)
            if (e.isComposing || e.keyCode === 229) return;
            if (e.key === 'Enter' && STATE.tab === 'create') {
                const btn = $('btnSubmit');
                if (btn && !btn.disabled && document.activeElement !== btn) {
                    e.preventDefault();
                    btn.click();
                }
            }
        });
    }

    function init() {
        try {
            window.Web2Sidebar?.mount?.('#web2Aside');
        } catch (e) {
            console.warn('[returns] sidebar mount fail:', e);
        }
        bind();
        // Task 1: autofocus customer search on create tab load so user can type immediately.
        const custEl = $('custSearch');
        if (custEl) setTimeout(() => custEl.focus(), 80);
        Form.onMethodChange('shipper_gui');
        Form.onIssueChange('van_de_khach');
        Form.onSubTypeChange('thu_ve_1_phan');
        Form.buildReasonSelect();
        setupSse();
        const params = new URLSearchParams(location.search);
        const tab = params.get('tab');
        if (tab === 'pending') Tabs.switchTab('pending');
        else if (tab === 'list') Tabs.switchTab('list');
        else Tabs.switchTab('create');
        // Prefill từ trang PBH (khai tử flow refunds.js cũ — 1D-refunds-old-flow):
        // ?prefillPhone=&prefillOrder=&prefillName= → chọn sẵn KH + đơn nguồn,
        // subType 'khong_nhan_hang' (thu hàng về + hoàn ví đúng vòng đời PBH).
        const pfPhone = params.get('prefillPhone');
        const pfOrder = params.get('prefillOrder');
        if (pfPhone) {
            (async () => {
                try {
                    Tabs.switchTab('create');
                    Form.onIssueChange('van_de_khach');
                    Form.onSubTypeChange('khong_nhan_hang');
                    const st = document.querySelector(
                        `input[name="subType"][value="khong_nhan_hang"]`
                    );
                    if (st) st.checked = true;
                    await Customer.pickCustomer(pfPhone, params.get('prefillName') || '', null);
                    await Customer.loadCustomerOrders();
                    if (pfOrder) {
                        const el = document.querySelector(
                            `#orderList .rt-order[data-code="${CSS.escape(pfOrder)}"]`
                        );
                        if (el) {
                            await Items.pickOrder(pfOrder, el.dataset.type, el.dataset.total);
                        } else {
                            toast(`Không thấy đơn ${pfOrder} trong DS đơn của khách`, 'error');
                        }
                    }
                } catch (e) {
                    console.warn('[returns] prefill fail:', e.message);
                }
            })();
        }
        if (window.lucide) lucide.createIcons();
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();

    // Public API — byte-identical names the original exposed.
    window.Web2Returns = {
        switchTab: Tabs.switchTab,
        approve: Tabs.approve,
        removeReturn: Tabs.removeReturn,
    };
})();
