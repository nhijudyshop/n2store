// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví NCC — app controller.
//
// Flow:
//   1. Load so-order data (read-only) → derive purchases per supplier
//   2. Load wallet state (with cleanup) → merge w/ derived
//   3. Render list cards
//   4. Detail drawer: chi tiết 1 NCC + tabs (purchases / history)
//   5. Return modal: chọn row(s) → tạo transaction `return`
//   6. Payment modal: nhập số tiền → tạo transaction `payment`

(function () {
    'use strict';

    const STATUS_LABELS = {
        draft: 'Nháp',
        ordered: 'Đã Đặt',
        received: 'Đã Nhận',
        cancelled: 'Đã Hủy',
    };
    const FALLBACK_RATES = {
        VND: 1,
        CNY: 3500,
        USD: 26000,
        EUR: 28000,
        JPY: 170,
        KRW: 18,
        THB: 720,
    };

    let walletState = null;
    let soOrderData = null;
    // Aggregated suppliers — derived each render. Shape:
    //   { [supplier]: { supplier, totalPurchased, purchases: [...] } }
    let suppliers = {};
    let activeSupplier = null;
    let detailTab = 'purchases';

    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtDateVN(iso) {
        if (!iso) return '—';
        const m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (!m) return iso;
        return `${parseInt(m[3], 10)}/${parseInt(m[2], 10)}/${m[1]}`;
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }
    function rateToVnd(currency, tab) {
        if (!currency || currency === 'VND') return 1;
        if (tab && tab.currency === currency) {
            return Number(tab.rate) || FALLBACK_RATES[currency] || 1;
        }
        return FALLBACK_RATES[currency] || 1;
    }

    // ---------- Aggregation ----------
    function aggregateSuppliers(state) {
        // state = so-order state ({ tabs: [{ id, label, currency, rate, shipments: [{ id, date, rows: [...] }] }] })
        const result = {};
        if (!state || !Array.isArray(state.tabs)) return result;
        for (const tab of state.tabs) {
            const rate = rateToVnd(tab.currency, tab);
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    if (!supplier) continue;
                    if (!result[supplier]) {
                        result[supplier] = { supplier, totalPurchased: 0, purchases: [] };
                    }
                    const qty = Number(r.qty) || 0;
                    const costVnd = (Number(r.costPrice) || 0) * rate;
                    const subtotal = qty * costVnd;
                    result[supplier].totalPurchased += subtotal;
                    result[supplier].purchases.push({
                        rowId: r.id,
                        shipmentId: sh.id,
                        tabId: tab.id,
                        tabLabel: tab.label,
                        date: sh.date,
                        productName: r.productName || '',
                        variant: r.variant || '',
                        qty,
                        costVnd,
                        subtotal,
                        status: r.status || 'draft',
                    });
                }
            }
        }
        return result;
    }

    // Merge derived totals into wallet state. Update `totalPurchased` per supplier.
    function mergeAggregation(wallet, agg) {
        const allSuppliers = new Set([...Object.keys(wallet.wallets || {}), ...Object.keys(agg)]);
        let mutated = false;
        for (const supplier of allSuppliers) {
            const w = window.SupplierWalletStorage.getOrCreateWallet(wallet, supplier);
            const a = agg[supplier];
            const newTotal = a ? Math.round(a.totalPurchased) : 0;
            if (w.totalPurchased !== newTotal) {
                w.totalPurchased = newTotal;
                mutated = true;
            }
            window.SupplierWalletStorage.recalcBalance(w);
        }
        return mutated;
    }

    // ---------- Render list ----------
    function renderList() {
        const listEl = document.getElementById('swList');
        const emptyEl = document.getElementById('swEmptyState');
        const search = (document.getElementById('swSearch').value || '').trim().toLowerCase();
        const sortBy = document.getElementById('swSort').value;
        const items = Object.keys(walletState.wallets)
            .map((s) => walletState.wallets[s])
            .filter((w) => suppliers[w.supplier] || w.totalPurchased > 0)
            .filter((w) => !search || w.supplier.toLowerCase().includes(search));

        items.sort((a, b) => {
            if (sortBy === 'balance-desc') return b.balance - a.balance;
            if (sortBy === 'balance-asc') return a.balance - b.balance;
            if (sortBy === 'total-desc') return b.totalPurchased - a.totalPurchased;
            return a.supplier.localeCompare(b.supplier);
        });

        if (!items.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
        } else {
            emptyEl.hidden = true;
            listEl.innerHTML = items.map(cardHtml).join('');
            listEl.querySelectorAll('[data-supplier]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.supplier));
            });
        }
        // counters
        const totalOutstanding = items.reduce((s, w) => s + Math.max(0, w.balance), 0);
        document.getElementById('swTotalSuppliers').textContent = `${items.length} NCC`;
        document.getElementById('swTotalOutstanding').textContent =
            `Công nợ: ${fmtVnd(totalOutstanding)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function cardHtml(w) {
        const debt = w.balance > 0;
        return `<div class="sw-card" data-supplier="${escapeHtml(w.supplier)}">
            <div class="sw-card-head">
                <div class="sw-card-name">${escapeHtml(w.supplier)}</div>
                <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
            </div>
            <div class="sw-card-stats">
                <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(w.totalPurchased)}</span></div>
                <div><span class="label">Đã trả</span><span class="value">${fmtVnd(w.paidAmount)}</span></div>
                <div><span class="label">Trả hàng</span><span class="value">${fmtVnd(w.returnedAmount)}</span></div>
                <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(w.balance)}</span></div>
            </div>
        </div>`;
    }

    // ---------- Detail drawer ----------
    function openDetail(supplier) {
        activeSupplier = supplier;
        detailTab = 'purchases';
        const w = walletState.wallets[supplier];
        const agg = suppliers[supplier];
        if (!w) return;
        document.getElementById('swDetailTitle').textContent = supplier;
        document.getElementById('swDetailSub').textContent = agg
            ? `${agg.purchases.length} dòng đã mua`
            : '—';
        document.getElementById('swStatTotal').textContent = fmtVnd(w.totalPurchased);
        document.getElementById('swStatPaid').textContent = fmtVnd(w.paidAmount);
        document.getElementById('swStatReturned').textContent = fmtVnd(w.returnedAmount);
        document.getElementById('swStatBalance').textContent = fmtVnd(w.balance);
        renderDetailTabs();
        document.getElementById('swDetailModal').hidden = false;
    }

    function renderDetailTabs() {
        document.querySelectorAll('#swDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === detailTab);
        });
        document.querySelectorAll('#swDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== detailTab;
        });
        if (detailTab === 'purchases') renderPurchases();
        else renderHistory();
    }

    function renderPurchases() {
        const w = walletState.wallets[activeSupplier];
        const agg = suppliers[activeSupplier];
        const tbody = document.getElementById('swPurchasesBody');
        if (!agg || !agg.purchases.length) {
            tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có dòng nào</td></tr>`;
            return;
        }
        const sorted = [...agg.purchases].sort((a, b) =>
            String(b.date).localeCompare(String(a.date))
        );
        tbody.innerHTML = sorted
            .map((p) => {
                const returned = !!w.returnedRowIds[p.rowId];
                return `<tr class="${returned ? 'is-returned' : ''}">
                    <td>${escapeHtml(fmtDateVN(p.date))}</td>
                    <td>${escapeHtml(p.productName || '—')}</td>
                    <td>${escapeHtml(p.variant || '—')}</td>
                    <td class="num">${p.qty}</td>
                    <td class="num">${fmtVnd(p.costVnd)}</td>
                    <td class="num">${fmtVnd(p.subtotal)}</td>
                    <td><span class="sw-status-pill" data-status="${returned ? 'returned' : p.status}">${returned ? 'Đã trả' : STATUS_LABELS[p.status] || p.status}</span></td>
                </tr>`;
            })
            .join('');
    }

    function renderHistory() {
        const w = walletState.wallets[activeSupplier];
        const tbody = document.getElementById('swHistoryBody');
        if (!w.transactions.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch trong 30 ngày</td></tr>`;
            return;
        }
        const sorted = [...w.transactions].sort((a, b) => b.ts - a.ts);
        tbody.innerHTML = sorted
            .map((t) => {
                const sign = t.type === 'return' || t.type === 'payment' ? 'is-neg' : 'is-pos';
                const lbl =
                    t.type === 'return' ? 'Trả hàng' : t.type === 'payment' ? 'Thanh toán' : 'Mua';
                return `<tr>
                    <td>${escapeHtml(fmtTime(t.ts))}</td>
                    <td><span class="sw-txn-type" data-type="${t.type}">${lbl}</span></td>
                    <td class="num sw-txn-amount ${sign}">−${fmtVnd(t.amount)}</td>
                    <td>${escapeHtml(t.note || '')}</td>
                </tr>`;
            })
            .join('');
    }

    // ---------- Return modal ----------
    function openReturnModal() {
        const w = walletState.wallets[activeSupplier];
        const agg = suppliers[activeSupplier];
        if (!agg) return;
        document.getElementById('swReturnSupplier').textContent = activeSupplier;
        const tbody = document.getElementById('swReturnBody');
        const available = agg.purchases.filter((p) => !w.returnedRowIds[p.rowId]);
        if (!available.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Không còn dòng nào để trả</td></tr>`;
        } else {
            tbody.innerHTML = available
                .map(
                    (
                        p
                    ) => `<tr data-row-id="${escapeHtml(p.rowId)}" data-cost="${p.costVnd}" data-qty="${p.qty}">
                <td><input type="checkbox" class="sw-return-check" /></td>
                <td>${escapeHtml(p.productName || '—')}</td>
                <td>${escapeHtml(p.variant || '—')}</td>
                <td class="num">${p.qty}</td>
                <td class="num"><input type="number" class="sw-return-qty" min="0" max="${p.qty}" value="${p.qty}" /></td>
                <td class="num sw-return-line-total">${fmtVnd(p.qty * p.costVnd)}</td>
            </tr>`
                )
                .join('');
        }
        recalcReturnTotal();
        document.getElementById('swReturnModal').hidden = false;
    }

    function recalcReturnTotal() {
        let total = 0;
        document.querySelectorAll('#swReturnBody tr[data-row-id]').forEach((tr) => {
            const check = tr.querySelector('.sw-return-check');
            const qtyInput = tr.querySelector('.sw-return-qty');
            const lineEl = tr.querySelector('.sw-return-line-total');
            const cost = Number(tr.dataset.cost) || 0;
            const qty = Math.min(Number(qtyInput.value) || 0, Number(tr.dataset.qty) || 0);
            const sub = check.checked ? qty * cost : 0;
            lineEl.textContent = fmtVnd(qty * cost);
            total += sub;
        });
        document.getElementById('swReturnTotal').textContent = fmtVnd(total);
    }

    async function confirmReturn() {
        const selectedRows = [];
        let total = 0;
        document.querySelectorAll('#swReturnBody tr[data-row-id]').forEach((tr) => {
            const check = tr.querySelector('.sw-return-check');
            if (!check.checked) return;
            const qty = Math.min(
                Number(tr.querySelector('.sw-return-qty').value) || 0,
                Number(tr.dataset.qty) || 0
            );
            const cost = Number(tr.dataset.cost) || 0;
            const amount = qty * cost;
            if (amount <= 0) return;
            selectedRows.push({ rowId: tr.dataset.rowId, qty, amount });
            total += amount;
        });
        if (!selectedRows.length) {
            notify('Chưa chọn dòng nào để trả', 'warning');
            return;
        }
        // Stock adjust: trả NCC = xuất kho (giảm stock đã +qty khi sync).
        // Match qua productName. Best-effort, không chặn ledger nếu fail.
        try {
            const agg = suppliers[activeSupplier];
            const adjustments = [];
            for (const sel of selectedRows) {
                const p = agg?.purchases?.find((x) => x.rowId === sel.rowId);
                if (!p) continue;
                const matched = window.Web2ProductsCache?.findByNameExact?.(p.productName);
                if (matched?.code) {
                    adjustments.push({
                        code: matched.code,
                        delta: -sel.qty,
                        reason: `Trả NCC ${activeSupplier}`,
                    });
                }
            }
            if (adjustments.length && window.Web2ProductsApi?.adjustStock) {
                await window.Web2ProductsApi.adjustStock(adjustments);
                window.Web2ProductsCache?.pushTickle?.({ action: 'supplier-return' });
            }
        } catch (e) {
            console.warn('[supplier-wallet] stock adjust fail:', e.message);
        }
        window.SupplierWalletStorage.addTransaction(walletState, activeSupplier, {
            type: 'return',
            amount: total,
            note: `Trả ${selectedRows.length} dòng`,
            ref: { rowIds: selectedRows.map((r) => r.rowId), rows: selectedRows },
        });
        pushSync();
        notify(`Đã ghi trả hàng ${fmtVnd(total)} cho ${activeSupplier}`, 'success');
        document.getElementById('swReturnModal').hidden = true;
        renderList();
        openDetail(activeSupplier);
    }

    // ---------- Payment modal ----------
    function openPayModal() {
        document.getElementById('swPaySupplier').textContent = activeSupplier;
        document.getElementById('swPayAmount').value = 0;
        document.getElementById('swPayNote').value = '';
        document.getElementById('swPayModal').hidden = false;
    }

    function confirmPay() {
        const amount = Number(document.getElementById('swPayAmount').value) || 0;
        const note = document.getElementById('swPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        window.SupplierWalletStorage.addTransaction(walletState, activeSupplier, {
            type: 'payment',
            amount,
            note: note || 'Thanh toán',
        });
        pushSync();
        notify(`Đã ghi thanh toán ${fmtVnd(amount)} cho ${activeSupplier}`, 'success');
        document.getElementById('swPayModal').hidden = true;
        renderList();
        openDetail(activeSupplier);
    }

    // ---------- Sync ----------
    function pushSync() {
        if (window.SupplierWalletStorage?.Sync) {
            window.SupplierWalletStorage.Sync.push(walletState);
        }
    }

    // ---------- Init ----------
    async function loadAndRender() {
        soOrderData = await window.SupplierWalletStorage.loadSoOrderData();
        suppliers = aggregateSuppliers(soOrderData);
        const mutated = mergeAggregation(walletState, suppliers);
        if (mutated) {
            window.SupplierWalletStorage.save(walletState);
            pushSync();
        }
        renderList();
    }

    function wireUi() {
        document.getElementById('swSearch').addEventListener('input', renderList);
        document.getElementById('swSort').addEventListener('change', renderList);
        document.getElementById('swRefreshBtn').addEventListener('click', loadAndRender);
        document.querySelectorAll('#swDetailModal .sw-tab').forEach((b) => {
            b.addEventListener('click', () => {
                detailTab = b.dataset.detailTab;
                renderDetailTabs();
            });
        });
        document.getElementById('swReturnBtn').addEventListener('click', openReturnModal);
        document.getElementById('swPayBtn').addEventListener('click', openPayModal);
        document.getElementById('swReturnConfirmBtn').addEventListener('click', confirmReturn);
        document.getElementById('swPayConfirmBtn').addEventListener('click', confirmPay);
        // Return modal interactions
        const returnBody = document.getElementById('swReturnBody');
        returnBody.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('sw-return-check') ||
                e.target.classList.contains('sw-return-qty')
            ) {
                recalcReturnTotal();
            }
        });
        returnBody.addEventListener('input', (e) => {
            if (e.target.classList.contains('sw-return-qty')) recalcReturnTotal();
        });
        document.getElementById('swReturnSelectAll').addEventListener('change', (e) => {
            document.querySelectorAll('#swReturnBody .sw-return-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            recalcReturnTotal();
        });
        // Close handlers
        document.querySelectorAll('[data-sw-close]').forEach((el) => {
            el.addEventListener('click', () => {
                el.closest('.sw-modal')?.setAttribute('hidden', '');
            });
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                document
                    .querySelectorAll('.sw-modal:not([hidden])')
                    .forEach((m) => (m.hidden = true));
            }
        });
    }

    async function init() {
        walletState = window.SupplierWalletStorage.load();
        const purged = window.SupplierWalletStorage.cleanupOldTransactions(walletState);
        if (purged) window.SupplierWalletStorage.save(walletState);
        wireUi();
        // Web2ProductsCache để match productName → code khi adjust stock lúc trả hàng.
        // Init async không chặn render — return modal có check optional.
        if (window.Web2ProductsCache?.init) {
            window.Web2ProductsCache.init().catch(() => {});
        }
        await loadAndRender();
        // Firestore sync
        const ok = await window.SupplierWalletStorage.Sync.init((remote) => {
            walletState = remote;
            window.SupplierWalletStorage.cleanupOldTransactions(walletState);
            renderList();
            if (activeSupplier && !document.getElementById('swDetailModal').hidden) {
                openDetail(activeSupplier);
            }
        });
        if (ok) {
            walletState = window.SupplierWalletStorage.load();
            renderList();
            pushSync();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
