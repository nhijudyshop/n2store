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

        const Scn = window.ReturnsScenario;
        // Kịch bản (scenario-first) — thay bộ ba radio method×issue×subType.
        $('scenarioGrid').addEventListener('click', (e) => {
            const b = e.target.closest('.rt-scn[data-scn]');
            if (b) Scn.selectScenario(b.dataset.scn);
        });
        // Cách hàng về (chỉ hiện với kịch bản allowMethodToggle).
        document
            .querySelectorAll('input[name="method"]')
            .forEach((r) =>
                r.addEventListener('change', (e) => Form.onMethodChange(e.target.value))
            );
        // Bên chịu phí ship.
        document
            .querySelectorAll('input[name="feeBearer"]')
            .forEach((r) =>
                r.addEventListener('change', (e) => Scn.onFeeBearerChange(e.target.value))
            );
        $('reasonSelect').addEventListener('change', (e) => Form.onReasonChange(e.target.value));
        $('reasonSelectShip').addEventListener('change', (e) =>
            Form.onReasonShipChange(e.target.value)
        );
        $('codReduction').addEventListener('input', (e) => Cod.onCodInput(e.target.value));
        // Disposition / hình thức hoàn / phí ship.
        $('dispoSelect').addEventListener('change', (e) => Scn.onDispoChange(e.target.value));
        $('refundSelect').addEventListener('change', (e) => Scn.onRefundChange(e.target.value));
        $('shipFeeInput').addEventListener('input', () => Scn.onShipFeeInput());
        // Đổi hàng — SP đổi lấy.
        $('replSearch').addEventListener('input', Scn.onReplSearch);
        $('replList').addEventListener('click', (e) => {
            const x = e.target.closest('[data-replx]');
            if (x) Scn.removeRepl(Number(x.dataset.replx));
        });
        $('replList').addEventListener('input', (e) => {
            const q = e.target.closest('[data-replqty]');
            if (q) Scn.setReplQty(Number(q.dataset.replqty), q.value);
        });
        $('replScanBtn').addEventListener('click', () => Scn.scan('repl'));
        // Thu về không đơn gốc — SP thủ công.
        $('orphanSearch').addEventListener('input', Scn.onOrphanSearch);
        $('manualItems').addEventListener('click', (e) => {
            const x = e.target.closest('[data-manx]');
            if (x) Scn.removeManual(Number(x.dataset.manx));
        });
        $('manualItems').addEventListener('input', (e) => {
            const q = e.target.closest('[data-manqty]');
            if (q) Scn.setManualQty(Number(q.dataset.manqty), q.value);
        });
        $('orphanScanBtn').addEventListener('click', () => Scn.scan('orphan'));
        // Đóng dropdown SP khi click ngoài.
        document.addEventListener('click', (e) => {
            if (!e.target.closest('#replSearch') && !e.target.closest('#replResults'))
                $('replResults').hidden = true;
            if (!e.target.closest('#orphanSearch') && !e.target.closest('#orphanResults'))
                $('orphanResults').hidden = true;
        });

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
        // Filter chips + date range (tab Danh sách).
        $('filterChips').addEventListener('click', (e) => {
            const b = e.target.closest('.rt-chip-f[data-f]');
            if (b) Tabs.setFilterChip(b.dataset.f);
        });
        $('filterFrom').addEventListener('change', Tabs.setFilterDates);
        $('filterTo').addEventListener('change', Tabs.setFilterDates);
        $('returnsBody').addEventListener('click', (e) => {
            const hist = e.target.closest('[data-hist]');
            if (hist) {
                window.Web2Returns?.openHistory?.(hist.dataset.hist);
                return;
            }
            const del = e.target.closest('[data-del]');
            if (del) Tabs.removeReturn(del.dataset.del);
        });
        $('pendingList').addEventListener('click', (e) => {
            const ap = e.target.closest('[data-approve]');
            if (ap) {
                Tabs.approve(ap.dataset.approve);
                return;
            }
            const dc = e.target.closest('[data-decline]');
            if (dc) Tabs.decline(dc.dataset.decline);
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
        // Kịch bản mặc định = Boom cả đơn (case phổ biến nhất của shop live).
        window.ReturnsScenario.renderGrid();
        window.ReturnsScenario.selectScenario('boom_ca_don');
        // Format số tiền khi nhập phí ship.
        try {
            window.Web2NumberInput?.mount?.($('shipFeeInput'));
        } catch {}
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
                    await Customer.pickCustomer(pfPhone, params.get('prefillName') || '', null);
                    // Kịch bản "Boom / không nhận cả đơn" (khong_nhan_hang) — đúng vòng đời PBH.
                    window.ReturnsScenario.selectScenario('boom_ca_don');
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
        // Lịch sử thao tác 1 phiếu (event-sink entity='return') qua module chung.
        openHistory: (code) => {
            if (!code) return;
            if (window.Web2AuditLog?.openRecord) {
                window.Web2AuditLog.openRecord({
                    entity: 'return',
                    entityId: code,
                    title: 'Lịch sử thu về ' + code,
                });
            } else {
                window.notificationManager?.show?.('Module lịch sử chưa sẵn sàng', 'warning');
            }
        },
    };
})();
