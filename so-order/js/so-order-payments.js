// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Sổ Order — THANH TOÁN CK theo ĐỢT (2026-06-28, S5 money-plan).
//
// Mỗi thanh toán = 1 bút toán ledger NCC (`/api/web2-supplier-wallet/tx`,
// type=payment, amount VND) → Ví NCC + Công nợ NCC tự trừ nợ realtime. Gắn 1 NCC;
// ref = { source:'so-order', tabId, batch, shipmentId, ncc } để quy về đợt.
//
// TỔNG TT của 1 đợt = Σ payments có ref.shipmentId ∈ các lô của đợt. Đọc /state,
// build SO._paymentsByShipment (Map shipmentId→vnd) cho getBatchTotals (render).
//
// Money op (CLAUDE.md rule 8 NGOẠI LỆ): GIỮ await + loading + rollback toast,
// KHÔNG Web2Optimistic fire-and-forget. Idempotent theo txId sinh lúc mở modal.

(function () {
    'use strict';

    const SO = (window.SoOrder = window.SoOrder || {});

    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = `${WORKER_URL}/api/web2-supplier-wallet`;
    const API_FALLBACK = 'https://web2-api-kv04.onrender.com/api/web2-supplier-wallet';

    function _payHeaders(extra) {
        return SO._w2Auth(Object.assign({ 'Content-Type': 'application/json' }, extra || {}));
    }

    // Dual-base (worker → Render direct). Mutation idempotent theo txId → retry an toàn.
    async function _payApi(path, options) {
        const opts = options || {};
        try {
            const r = await fetch(API_BASE + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        } catch (e) {
            const r = await fetch(API_FALLBACK + path, opts);
            const d = await r.json().catch(() => ({}));
            if (!r.ok || d?.success === false) throw new Error(d?.error || `HTTP ${r.status}`);
            return d;
        }
    }

    // Tất cả payment so-order (mọi đợt/tab) — nguồn để derive map + list.
    SO._soPayments = [];

    // Đọc ledger /state → lọc payment có ref.source==='so-order' → build:
    //   - SO._soPayments: [{ id, ts, amount, note, supplier, moveName, shipmentId, batch, tabId }]
    //   - SO._paymentsByShipment: Map<shipmentId, vndTong> (cho getBatchTotals)
    SO.loadPayments = async function loadPayments() {
        try {
            const d = await _payApi('/state', { headers: _payHeaders() });
            const wallets = d?.data?.wallets || {};
            const list = [];
            const byShip = new Map();
            for (const supplier of Object.keys(wallets)) {
                const txs = wallets[supplier]?.transactions || [];
                for (const tx of txs) {
                    if (tx.type !== 'payment') continue;
                    const ref = tx.ref || null;
                    if (!ref || ref.source !== 'so-order') continue;
                    const amount = Number(tx.amount) || 0;
                    if (amount <= 0) continue;
                    const shipmentId = ref.shipmentId || '';
                    list.push({
                        id: tx.id || '',
                        ts: Number(tx.ts) || 0,
                        amount,
                        note: tx.note || '',
                        supplier,
                        moveName: tx.moveName || '',
                        shipmentId,
                        batch: ref.batch != null ? String(ref.batch) : '',
                        tabId: ref.tabId || '',
                    });
                    if (shipmentId) byShip.set(shipmentId, (byShip.get(shipmentId) || 0) + amount);
                }
            }
            SO._soPayments = list;
            SO._paymentsByShipment = byShip;
            if (SO.renderFooterTotals) SO.renderFooterTotals();
        } catch (e) {
            console.warn('[so-order/payments] load fail:', e.message);
            // Giữ map cũ (nếu có) — không xoá để tránh nhấp nháy TT về 0 khi mạng chập.
            if (!SO._paymentsByShipment) SO._paymentsByShipment = new Map();
        }
    };

    // Distinct NCC trong đợt đang chọn (từ rows các lô). Dùng cho select NCC.
    SO.suppliersInActiveBatch = function suppliersInActiveBatch() {
        const out = [];
        const seen = new Set();
        for (const sh of SO.shipmentsInActiveBatch()) {
            for (const r of sh.rows || []) {
                const s = (r.supplier || '').trim();
                if (s && !seen.has(s)) {
                    seen.add(s);
                    out.push(s);
                }
            }
        }
        return out;
    };

    // Payments của đợt đang chọn (theo shipmentId ∈ lô của đợt), mới nhất đầu.
    SO.paymentsForActiveBatch = function paymentsForActiveBatch() {
        const ids = new Set(SO.shipmentsInActiveBatch().map((s) => s.id));
        return SO._soPayments.filter((p) => ids.has(p.shipmentId)).sort((a, b) => b.ts - a.ts);
    };

    // Lô của đợt chứa NCC này (để gắn ref.shipmentId); fallback lô đầu của đợt.
    SO._shipmentForSupplierInBatch = function _shipmentForSupplierInBatch(supplier) {
        const shipments = SO.shipmentsInActiveBatch();
        const sup = (supplier || '').trim();
        const hit = shipments.find((sh) =>
            (sh.rows || []).some((r) => (r.supplier || '').trim() === sup)
        );
        return hit || shipments[0] || null;
    };

    // Ghi thanh toán → ledger NCC. amountVnd VND, idempotent theo txId.
    SO.recordSoPayment = async function recordSoPayment({
        supplier,
        amountVnd,
        date,
        note,
        shipmentId,
        batchKey,
        tabId,
        txId,
    }) {
        if (!supplier) throw new Error('Thiếu NCC');
        const amount = Math.round(Number(amountVnd) || 0);
        if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền không hợp lệ');
        const ts = date ? new Date(date + 'T12:00:00+07:00').getTime() : Date.now();
        const body = {
            supplier,
            type: 'payment',
            amount,
            ts,
            note: note || `Thanh toán CK đợt ${batchKey === '' ? '(chưa đặt)' : batchKey}`,
            ref: {
                source: 'so-order',
                tabId: tabId || '',
                batch: batchKey == null ? '' : String(batchKey),
                shipmentId: shipmentId || '',
                ncc: supplier,
            },
            performedBy: window.Web2UserInfo?.get?.()?.userName || null,
            txId: txId || 'so-pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        };
        const d = await _payApi('/tx', {
            method: 'POST',
            headers: _payHeaders(),
            body: JSON.stringify(body),
        });
        return d?.tx || null;
    };

    // ------ Modal Thanh toán CK theo đợt → dùng CHUNG Web2SupplierPay (2026-06-28) ------
    // Component shared lo UI (NCC picker tab-strip + tìm kiếm + summary + history);
    // so-order truyền context đợt + slot Chi phí (extraHtml) + onSubmit ghi ledger.

    // Markup slot Chi phí đợt (dùng class so-order.css sẵn có — modal ở cùng page).
    SO._payExpensesHtml = function _payExpensesHtml() {
        return `<div class="so-expenses-wrap so-pay-expenses-wrap" id="soPayExpensesWrap">
            <div class="so-expenses-head">
                <i data-lucide="receipt"></i> Chi phí đợt
                <span class="so-expenses-hint">(ship nội địa, phí gom, thuế… — cộng vào CÒN LẠI)</span>
                <span class="so-expenses-total" id="soPayExpTotal"></span>
            </div>
            <div id="soPayExpList" class="so-expenses-list"></div>
            <button type="button" class="btn btn-secondary so-expenses-add" id="soPayExpAddBtn">
                <i data-lucide="plus-circle"></i> Thêm chi phí
            </button>
        </div>`;
    };

    SO.openPaymentModal = function openPaymentModal() {
        if (!window.Web2SupplierPay) {
            SO.notify('Module thanh toán chưa load — refresh trang', 'error');
            return;
        }
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const ALL = window.SoOrderStorage.ALL_BATCH;
        const batchKey = SO.activeBatchKey();
        const shipments = SO.shipmentsInActiveBatch();
        if (!shipments.length) {
            SO.notify('Đợt chưa có lô nào để thanh toán', 'warning');
            return;
        }
        const suppliers = SO.suppliersInActiveBatch();
        if (!suppliers.length) {
            SO.notify('Đợt chưa có NCC (chưa có SP) — thêm SP trước khi thanh toán', 'warning');
            return;
        }
        const t = SO.getBatchTotals(shipments);
        const batchLabel = batchKey === ALL ? 'Tất cả đợt' : SO.batchLabelOf(batchKey);
        SO._payState = { batchKey, tabId: tab.id };
        window.Web2SupplierPay.open({
            title: `Thanh toán CK — ${batchLabel} · ${tab.label}`,
            summary: SO._paySummaryCards(t),
            ncc: { mode: 'picker', suppliers, selected: suppliers[0] },
            amountVnd: Math.max(0, Math.round(t.remainingVnd)),
            notePlaceholder: 'Vd: CK Vietcombank…',
            extraHtml: SO._payExpensesHtml(),
            onMount: (root) => SO._mountPayExpenses(root),
            history: SO.paymentsForActiveBatch().map((p) => ({
                ts: p.ts,
                supplier: p.supplier,
                amountVnd: p.amount,
                moveName: p.moveName,
            })),
            historyHead: 'Lịch sử thanh toán đợt',
            onSubmit: async ({ supplier, amountVnd, date, note, txId }) => {
                const sh = SO._shipmentForSupplierInBatch(supplier);
                if (!sh) throw new Error('Không tìm thấy lô để gắn thanh toán');
                await SO.recordSoPayment({
                    supplier,
                    amountVnd,
                    date,
                    note,
                    shipmentId: sh.id,
                    batchKey: window.SoOrderStorage.batchKeyOf(sh),
                    tabId: tab.id,
                    txId,
                });
                await SO.loadPayments();
                SO.renderAll();
                SO.notify(
                    `Đã ghi thanh toán CK ${SO.fmtVnd(amountVnd)} cho ${supplier}`,
                    'success'
                );
            },
        });
    };

    SO._paySummaryCards = function _paySummaryCards(t) {
        return [
            { label: 'Phải trả (HĐ+CP)', value: SO.fmtVnd(t.payableVnd) },
            { label: 'Đã trả', value: SO.fmtVnd(t.paidVnd) },
            { label: 'Còn lại', value: SO.fmtVnd(t.remainingVnd), tone: 'danger' },
        ];
    };

    // ------ Chi phí (CP) đợt — sửa NGAY trong modal Thanh toán ------
    // CP gắn per-shipment (sh.expenses). Gộp expenses MỌI lô của đợt (mỗi dòng giữ
    // shipmentId riêng); dòng MỚI gắn lô ĐẦU của đợt. Cùng storage API với Sửa lô.
    SO._payExpRows = function _payExpRows() {
        const out = [];
        for (const sh of SO.shipmentsInActiveBatch()) {
            for (const e of sh.expenses || []) out.push({ shipmentId: sh.id, exp: e });
        }
        return out;
    };
    SO._payExpRowHtml = function _payExpRowHtml(shipmentId, e, cur) {
        return `<div class="so-exp-row" data-exp-id="${SO.escapeHtml(e.id)}" data-exp-ship="${SO.escapeHtml(shipmentId)}">
            <input class="so-input-v2 so-exp-label" data-exp-field="label" value="${SO.escapeHtml(e.label || '')}" placeholder="Tên chi phí (Ship nội địa, phí gom, thuế…)" />
            <div class="so-exp-amount-wrap">
                <input class="so-input-v2 so-input-num so-exp-amount" data-exp-field="amount" inputmode="decimal" data-w2num="decimal" value="${Number(e.amount) || 0}" />
                <span class="so-exp-cur">${SO.escapeHtml(cur)}</span>
            </div>
            <input class="so-input-v2 so-exp-note" data-exp-field="note" value="${SO.escapeHtml(e.note || '')}" placeholder="Ghi chú…" />
            <button type="button" class="so-exp-del" data-exp-del title="Xoá chi phí">
                <i data-lucide="trash-2"></i>
            </button>
        </div>`;
    };
    SO._renderPayExpenses = function _renderPayExpenses(root) {
        const scope = root || document;
        const list = scope.querySelector('#soPayExpList');
        if (!list) return;
        const cur = window.SoOrderStorage.getActiveTab(SO.state).currency || 'VND';
        const rows = SO._payExpRows();
        list.innerHTML = rows.map((r) => SO._payExpRowHtml(r.shipmentId, r.exp, cur)).join('');
        const totalEl = scope.querySelector('#soPayExpTotal');
        if (totalEl) {
            const total = rows.reduce((s, r) => s + (Number(r.exp.amount) || 0), 0);
            totalEl.textContent = total ? 'Tổng CP: ' + SO.fmtCurrency(total, cur) : '';
        }
        if (window.Web2NumberInput) Web2NumberInput.attachAll(list);
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };
    // Sau khi CP đổi: cập nhật summary modal (CÒN LẠI) + stat cards nền + sync.
    SO._afterPayExpenseChange = function _afterPayExpenseChange() {
        SO.pushSync();
        const t = SO.getBatchTotals(SO.shipmentsInActiveBatch());
        if (window.Web2SupplierPay?.setSummary) Web2SupplierPay.setSummary(SO._paySummaryCards(t));
        SO.renderFooterTotals(); // stat cards sau modal
    };
    // Wire slot Chi phí trong modal shared — bind MỚI mỗi lần mở (markup re-inject).
    SO._mountPayExpenses = function _mountPayExpenses(root) {
        SO._renderPayExpenses(root);
        const addBtn = root.querySelector('#soPayExpAddBtn');
        const list = root.querySelector('#soPayExpList');
        const tabId = () => window.SoOrderStorage.getActiveTab(SO.state).id;
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                const sh = SO.shipmentsInActiveBatch()[0];
                if (!sh) {
                    SO.notify('Đợt chưa có lô để thêm chi phí', 'warning');
                    return;
                }
                window.SoOrderStorage.addExpense(SO.state, tabId(), sh.id, {
                    label: '',
                    amount: 0,
                    note: '',
                });
                SO._renderPayExpenses(root);
                SO._afterPayExpenseChange();
                const rows = list.querySelectorAll('.so-exp-row');
                rows[rows.length - 1]?.querySelector('[data-exp-field="label"]')?.focus();
            });
        }
        if (list) {
            list.addEventListener('change', (e) => {
                const field = e.target?.dataset?.expField;
                if (!field) return;
                const row = e.target.closest('.so-exp-row');
                const expId = row?.dataset?.expId;
                const shipmentId = row?.dataset?.expShip;
                if (!expId || !shipmentId) return;
                let val = e.target.value;
                if (field === 'amount')
                    val = window.Web2NumberInput
                        ? Web2NumberInput.getValue(e.target)
                        : Number(val) || 0;
                window.SoOrderStorage.updateExpense(SO.state, tabId(), shipmentId, expId, {
                    [field]: val,
                });
                if (field === 'amount') {
                    const cur = window.SoOrderStorage.getActiveTab(SO.state).currency || 'VND';
                    const total = SO._payExpRows().reduce(
                        (s, r) => s + (Number(r.exp.amount) || 0),
                        0
                    );
                    const totalEl = root.querySelector('#soPayExpTotal');
                    if (totalEl)
                        totalEl.textContent = total ? 'Tổng CP: ' + SO.fmtCurrency(total, cur) : '';
                }
                SO._afterPayExpenseChange();
            });
            list.addEventListener('click', (e) => {
                const del = e.target.closest('[data-exp-del]');
                if (!del) return;
                const row = del.closest('.so-exp-row');
                const expId = row?.dataset?.expId;
                const shipmentId = row?.dataset?.expShip;
                if (!expId || !shipmentId) return;
                window.SoOrderStorage.deleteExpense(SO.state, tabId(), shipmentId, expId);
                SO._renderPayExpenses(root);
                SO._afterPayExpenseChange();
            });
        }
    };

    SO.wirePaymentPanel = function wirePaymentPanel() {
        const payBtn = document.getElementById('soStatPayBtn');
        if (payBtn && !payBtn.__payBound) {
            payBtn.__payBound = true;
            payBtn.addEventListener('click', SO.openPaymentModal);
        }
        // SSE — TT đồng bộ realtime (ledger NCC đổi / máy khác thanh toán).
        if (window.Web2SSE && !SO._paySseBound) {
            SO._paySseBound = true;
            let timer = null;
            window.Web2SSE.subscribe('web2:supplier-wallet', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    SO.loadPayments().then(() => {
                        // Modal mở → cập nhật summary live (CÒN LẠI sau khi NCC khác trả).
                        if (window.Web2SupplierPay?.isOpen?.()) {
                            const tt = SO.getBatchTotals(SO.shipmentsInActiveBatch());
                            Web2SupplierPay.setSummary(SO._paySummaryCards(tt));
                        }
                    });
                }, 500);
            });
        }
        SO.loadPayments();
    };
})();
