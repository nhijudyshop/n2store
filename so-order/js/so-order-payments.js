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

    // ------ Modal Thanh toán CK theo đợt ------

    function _todayVN() {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
                new Date()
            );
        } catch {
            return new Date().toISOString().slice(0, 10);
        }
    }

    // Ngữ cảnh đợt lúc mở modal (txId idempotent sinh tại đây — chống double-click).
    SO._payState = { batchKey: null, tabId: null, txId: null };

    SO.openPaymentModal = function openPaymentModal() {
        const tab = window.SoOrderStorage.getActiveTab(SO.state);
        const ALL = window.SoOrderStorage.ALL_BATCH;
        const batchKey = SO.activeBatchKey();
        const shipments = SO.shipmentsInActiveBatch();
        if (!shipments.length) {
            SO.notify('Đợt chưa có lô nào để thanh toán', 'warning');
            return;
        }
        const t = SO.getBatchTotals(shipments);
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        const batchLabel = batchKey === ALL ? 'Tất cả đợt' : SO.batchLabelOf(batchKey);
        set('soPayTitle', `Thanh toán CK — ${batchLabel} · ${tab.label}`);
        set('soPaySumPayable', SO.fmtVnd(t.payableVnd));
        set('soPaySumPaid', SO.fmtVnd(t.paidVnd));
        set('soPaySumRemain', SO.fmtVnd(t.remainingVnd));

        const suppliers = SO.suppliersInActiveBatch();
        const sel = document.getElementById('soPaySupplier');
        if (sel) {
            sel.innerHTML = suppliers
                .map((s) => `<option value="${SO.escapeHtml(s)}">${SO.escapeHtml(s)}</option>`)
                .join('');
        }
        const saveBtn = document.getElementById('soPaySaveBtn');
        if (saveBtn) saveBtn.disabled = !suppliers.length;
        if (!suppliers.length) {
            SO.notify('Đợt chưa có NCC (chưa có SP) — thêm SP trước khi thanh toán', 'warning');
        }

        const dateEl = document.getElementById('soPayDate');
        if (dateEl) dateEl.value = _todayVN();
        const amtEl = document.getElementById('soPayAmount');
        const defAmt = Math.max(0, Math.round(t.remainingVnd));
        if (amtEl) {
            if (window.Web2NumberInput) Web2NumberInput.setValue(amtEl, defAmt);
            else amtEl.value = defAmt;
        }
        const noteEl = document.getElementById('soPayNote');
        if (noteEl) noteEl.value = '';

        SO._payState = {
            batchKey,
            tabId: tab.id,
            txId: 'so-pay-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7),
        };
        SO._renderPayHistory();
        SO.showModal('soPaymentModal');
        if (window.Web2NumberInput)
            Web2NumberInput.attachAll(document.getElementById('soPaymentModal'));
    };

    SO._renderPayHistory = function _renderPayHistory() {
        const host = document.getElementById('soPayHistory');
        if (!host) return;
        const pays = SO.paymentsForActiveBatch();
        if (!pays.length) {
            host.innerHTML = '<div class="so-pay-empty">Chưa có thanh toán nào cho đợt này.</div>';
            return;
        }
        host.innerHTML = pays
            .map((p) => {
                const d = p.ts
                    ? new Intl.DateTimeFormat('vi-VN', {
                          timeZone: 'Asia/Ho_Chi_Minh',
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                      }).format(new Date(p.ts))
                    : '';
                return `<div class="so-pay-hist-row">
                    <span class="so-pay-hist-date">${SO.escapeHtml(d)}</span>
                    <span class="so-pay-hist-ncc" title="${SO.escapeHtml(p.supplier)}">${SO.escapeHtml(p.supplier)}</span>
                    <span class="so-pay-hist-amt">${SO.escapeHtml(SO.fmtVnd(p.amount))}</span>
                    <span class="so-pay-hist-move">${SO.escapeHtml(p.moveName || '')}</span>
                </div>`;
            })
            .join('');
    };

    // SSE đến lúc modal mở → cập nhật summary + history (KHÔNG đụng input đang gõ).
    SO._refreshPayModalLive = function _refreshPayModalLive() {
        const modal = document.getElementById('soPaymentModal');
        if (!modal || modal.hidden) return;
        const t = SO.getBatchTotals(SO.shipmentsInActiveBatch());
        const set = (id, v) => {
            const el = document.getElementById(id);
            if (el) el.textContent = v;
        };
        set('soPaySumPayable', SO.fmtVnd(t.payableVnd));
        set('soPaySumPaid', SO.fmtVnd(t.paidVnd));
        set('soPaySumRemain', SO.fmtVnd(t.remainingVnd));
        SO._renderPayHistory();
    };

    SO._submitPayment = async function _submitPayment() {
        const saveBtn = document.getElementById('soPaySaveBtn');
        const supplier = document.getElementById('soPaySupplier')?.value || '';
        const amtEl = document.getElementById('soPayAmount');
        const dateEl = document.getElementById('soPayDate');
        const noteEl = document.getElementById('soPayNote');
        const amountVnd = window.Web2NumberInput
            ? Web2NumberInput.getValue(amtEl)
            : Number(amtEl?.value) || 0;
        if (!supplier) {
            SO.notify('Chọn NCC để thanh toán', 'warning');
            return;
        }
        if (!amountVnd || amountVnd <= 0) {
            SO.notify('Nhập số tiền hợp lệ', 'warning');
            return;
        }
        const { tabId, txId } = SO._payState;
        const sh = SO._shipmentForSupplierInBatch(supplier);
        if (!sh) {
            SO.notify('Không tìm thấy lô để gắn thanh toán', 'error');
            return;
        }
        // ref.batch = batch THẬT của lô được gắn (kể cả đang xem "Tất cả").
        const refBatch = window.SoOrderStorage.batchKeyOf(sh);
        // Money op (rule 8 ngoại lệ): GIỮ await + loading + rollback toast.
        const orig = saveBtn.innerHTML;
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<span class="so-confirm-spinner"></span> Đang lưu...';
        try {
            await SO.recordSoPayment({
                supplier,
                amountVnd,
                date: dateEl?.value,
                note: noteEl?.value,
                shipmentId: sh.id,
                batchKey: refBatch,
                tabId,
                txId,
            });
            await SO.loadPayments();
            SO.renderAll();
            SO.notify(`Đã ghi thanh toán CK ${SO.fmtVnd(amountVnd)} cho ${supplier}`, 'success');
            SO.hideModal('soPaymentModal');
        } catch (e) {
            SO.notify('Lỗi thanh toán: ' + (e?.message || e), 'error');
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = orig;
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
    };

    SO.wirePaymentPanel = function wirePaymentPanel() {
        const payBtn = document.getElementById('soStatPayBtn');
        if (payBtn && !payBtn.__payBound) {
            payBtn.__payBound = true;
            payBtn.addEventListener('click', SO.openPaymentModal);
        }
        const saveBtn = document.getElementById('soPaySaveBtn');
        if (saveBtn && !saveBtn.__payBound) {
            saveBtn.__payBound = true;
            saveBtn.addEventListener('click', SO._submitPayment);
        }
        // SSE — TT đồng bộ realtime (ledger NCC đổi / máy khác thanh toán).
        if (window.Web2SSE && !SO._paySseBound) {
            SO._paySseBound = true;
            let timer = null;
            window.Web2SSE.subscribe('web2:supplier-wallet', () => {
                clearTimeout(timer);
                timer = setTimeout(() => {
                    SO.loadPayments().then(() => SO._refreshPayModalLive());
                }, 500);
            });
        }
        SO.loadPayments();
    };
})();
