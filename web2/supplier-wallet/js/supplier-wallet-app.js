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
    // A2 (2026-06-13): 1 dòng mua được coi "đã trả ĐỦ" khi qty đã trả >= qty mua.
    // `entry` = web2_supplier_meta.returned_row_ids[rowId]: dạng mới {qty,amount,ts}
    // (object) hoặc legacy truthy (boolean true = trả đủ). Trả 1 phần (qty>0 &
    // qty<qty mua) → CHƯA đủ → dòng còn xuất hiện trong modal trả + không badge.
    //
    // ⚠ AN TOÀN với data legacy {qty:0} (C18 — fallback cũ ghi qty:0 khi thiếu
    // rowReturns): qty<=0 nghĩa là entry rác/legacy boolean-style → coi như ĐÃ TRẢ
    // ĐỦ (KHÔNG cho trả lại → tránh over-refund ví NCC). Partial return THẬT luôn
    // có qty>0 (rowReturns gửi qty thật). C18 đã chặn ghi mới {qty:0}.
    function _isRowFullyReturned(entry, orderedQty) {
        if (!entry) return false;
        if (typeof entry === 'object') {
            const q = Number(entry.qty) || 0;
            if (q <= 0) return true; // legacy/garbage {qty:0} → coi đã trả đủ (an toàn)
            return q >= (Number(orderedQty) || 0);
        }
        return true; // legacy boolean → coi như trả đủ
    }
    // Audit: tên staff ghi trả/thanh toán NCC → lưu vào transaction (kiểm tra khi sai).
    function _swBy() {
        return (
            window.Web2UserInfo?.get?.()?.userName || window.Web2UserInfo?.label?.() || '(ẩn danh)'
        );
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
        // Hiển thị MỌI wallet entry trong state: derived từ Sổ Order (có
        // purchases) HOẶC manually-created qua nút "Tạo NCC" (transactions
        // rỗng + totalPurchased = 0). Empty entries vẫn hữu ích vì có mặt
        // trong dropdown gợi ý so-order.
        const items = Object.keys(walletState.wallets)
            .map((s) => walletState.wallets[s])
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
        // Cross-links: Công nợ + Sổ Order (injected into modal header each open)
        const _xlinks = document.getElementById('swDetailXLinks');
        if (window.Web2Deeplink?.url && window.Web2Deeplink?.linkBtn) {
            const _linksHtml =
                Web2Deeplink.linkBtn({
                    label: 'Công nợ',
                    icon: 'file-text',
                    url: Web2Deeplink.url.supplierDebt(supplier),
                    title: 'Xem bảng công nợ NCC',
                }) +
                Web2Deeplink.linkBtn({
                    label: 'Sổ Order',
                    icon: 'notebook',
                    url: Web2Deeplink.url.soOrder({ supplier }),
                    title: 'Xem Sổ Order của NCC này',
                });
            if (_xlinks) {
                _xlinks.innerHTML = _linksHtml;
            } else {
                const _sub = document.getElementById('swDetailSub');
                const _wrap = document.createElement('div');
                _wrap.id = 'swDetailXLinks';
                _wrap.className = 'sw-detail-xlinks';
                _wrap.innerHTML = _linksHtml;
                _sub.insertAdjacentElement('afterend', _wrap);
            }
            if (window.lucide?.createIcons) window.lucide.createIcons();
        }
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
                // A2 (2026-06-13): 'Đã trả' khi qty đã trả >= qty mua, KHÔNG phải chỉ
                // cần có entry. returnedRowIds[rowId] = {qty,amount,ts} (object) hoặc
                // truthy legacy (boolean cũ = trả đủ). Trả 1 phần (qty<p.qty) → CHƯA
                // returned → vẫn cho trả tiếp.
                const returned = _isRowFullyReturned(w.returnedRowIds[p.rowId], p.qty);
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
            tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch trong 30 ngày</td></tr>`;
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
                    <td>${escapeHtml(t.performedBy || '—')}</td>
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
        const available = agg.purchases.filter(
            (p) => !_isRowFullyReturned(w.returnedRowIds[p.rowId], p.qty)
        );
        if (!available.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Không còn dòng nào để trả</td></tr>`;
        } else {
            tbody.innerHTML = available
                .map((p) => {
                    // [12] (2026-06-13): SL CÒN LẠI = SL mua − SL đã trả tích luỹ
                    // (returnedRowIds[rowId].qty). max/value/data-qty/total dùng remaining
                    // → KHÔNG cho trả quá phần còn lại (tránh over-refund khi trả nhiều đợt).
                    const already = Number(w.returnedRowIds[p.rowId]?.qty) || 0;
                    const remaining = Math.max(0, (Number(p.qty) || 0) - already);
                    const alreadyTag =
                        already > 0
                            ? ` <span style="color:#16a34a;font-size:11px;">(đã trả ${already})</span>`
                            : '';
                    return `<tr data-row-id="${escapeHtml(p.rowId)}" data-cost="${p.costVnd}" data-qty="${remaining}">
                <td><input type="checkbox" class="sw-return-check" /></td>
                <td>${escapeHtml(p.productName || '—')}</td>
                <td>${escapeHtml(p.variant || '—')}</td>
                <td class="num">${remaining}${alreadyTag}</td>
                <td class="num"><input type="number" class="sw-return-qty" min="0" max="${remaining}" value="${remaining}" /></td>
                <td class="num sw-return-line-total">${fmtVnd(remaining * p.costVnd)}</td>
            </tr>`;
                })
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
        const btn = document.getElementById('swReturnConfirmBtn');
        if (btn?.disabled) return; // guard: đang xử lý (chống double-click)
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
        if (btn) btn.disabled = true; // chống double-click ghi ledger 2 lần
        try {
            // Stock adjust: trả NCC = xuất kho (giảm stock đã +qty khi sync).
            // Match qua productName. Best-effort, không chặn ledger nếu fail.
            try {
                const agg = suppliers[activeSupplier];
                const adjustments = [];
                for (const sel of selectedRows) {
                    const p = agg?.purchases?.find((x) => x.rowId === sel.rowId);
                    if (!p) continue;
                    // E-match-ten fix (đợt E): ưu tiên MÃ SP của chính row so-order
                    // (p.code) — match tên không phân biệt variant trả nhầm SP.
                    const code =
                        p.code ||
                        window.Web2ProductsCache?.findByNameExact?.(p.productName)?.code ||
                        null;
                    if (code) {
                        adjustments.push({
                            code,
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
            // ĐỢT E: money op — await server ledger; rowReturns lưu qty/amount
            // THẬT từng dòng (server merge vào returned_row_ids).
            const rowReturns = {};
            for (const r of selectedRows) rowReturns[r.rowId] = { qty: r.qty, amount: r.amount };
            try {
                await window.SupplierWalletStorage.addTransaction(walletState, activeSupplier, {
                    type: 'return',
                    amount: total,
                    note: `Trả ${selectedRows.length} dòng`,
                    ref: { rowIds: selectedRows.map((r) => r.rowId), rows: selectedRows },
                    rowReturns,
                    performedBy: _swBy(), // audit: ai ghi trả hàng
                });
            } catch (e) {
                notify(`Ghi trả hàng thất bại: ${e.message}`, 'error');
                return;
            }
            notify(`Đã ghi trả hàng ${fmtVnd(total)} cho ${activeSupplier}`, 'success');
            document.getElementById('swReturnModal').hidden = true;
            renderList();
            openDetail(activeSupplier);
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ---------- Create NCC modal ----------
    function openCreateModal() {
        const input = document.getElementById('swCreateName');
        if (input) input.value = '';
        document.getElementById('swCreateModal').hidden = false;
        setTimeout(() => input?.focus(), 80);
    }

    async function confirmCreate() {
        const input = document.getElementById('swCreateName');
        const rawName = (input?.value || '').trim();
        if (!rawName) {
            notify('Cần nhập tên NCC', 'warning');
            input?.focus();
            return;
        }
        // Đối chiếu case-insensitive với state hiện tại trước khi viết.
        const existingKey = Object.keys(walletState.wallets || {}).find(
            (k) => k.toLowerCase() === rawName.toLowerCase()
        );
        if (existingKey) {
            notify(`NCC "${existingKey}" đã tồn tại`, 'warning');
            document.getElementById('swCreateModal').hidden = true;
            return;
        }
        // Tạo wallet entry rỗng + push Firestore qua SupplierWalletStorage để
        // bảo toàn migration shape. Sau đó cũng đồng bộ Web2SuppliersCache
        // (giúp các trang khác đang mở thấy ngay qua snapshot listener).
        window.SupplierWalletStorage.getOrCreateWallet(walletState, rawName);
        window.SupplierWalletStorage.save(walletState);
        // ĐỢT E: NCC mới ghi vào meta server (atomic ON CONFLICT) qua cache.
        if (window.Web2SuppliersCache?.ensure) {
            try {
                await window.Web2SuppliersCache.ensure(rawName);
            } catch (e) {
                notify(`Lưu NCC lên server thất bại: ${e.message}`, 'error');
                return;
            }
        }
        notify(`Đã tạo NCC "${rawName}"`, 'success');
        document.getElementById('swCreateModal').hidden = true;
        renderList();
    }

    // ---------- Payment modal ----------
    function openPayModal() {
        document.getElementById('swPaySupplier').textContent = activeSupplier;
        document.getElementById('swPayAmount').value = 0;
        document.getElementById('swPayNote').value = '';
        document.getElementById('swPayModal').hidden = false;
        // Task 7: autofocus + select so typing replaces the prefilled 0
        setTimeout(() => {
            const el = document.getElementById('swPayAmount');
            el?.focus();
            el?.select();
        }, 30);
    }

    async function confirmPay() {
        const btn = document.getElementById('swPayConfirmBtn');
        if (btn?.disabled) return; // guard: đang xử lý (chống double-click)
        const amount = Number(document.getElementById('swPayAmount').value) || 0;
        const note = document.getElementById('swPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        if (btn) btn.disabled = true; // chống double-click ghi ledger 2 lần
        try {
            // ĐỢT E: money op — await server, lỗi → toast, KHÔNG ghi local lệch.
            await window.SupplierWalletStorage.addTransaction(walletState, activeSupplier, {
                type: 'payment',
                amount,
                note: note || 'Thanh toán',
                performedBy: _swBy(), // audit: ai ghi thanh toán
            });
            notify(`Đã ghi thanh toán ${fmtVnd(amount)} cho ${activeSupplier}`, 'success');
            document.getElementById('swPayModal').hidden = true;
            renderList();
            openDetail(activeSupplier);
        } catch (e) {
            notify(`Ghi thanh toán thất bại: ${e.message}`, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
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
        // H5 fix 2026-06-11: loadSoOrderData() trả null khi lỗi load — nếu vẫn
        // aggregate/merge sẽ set totalPurchased=0 cho MỌI NCC rồi save + pushSync
        // đẩy state hỏng lên Firestore. Nguồn null → KHÔNG mutate/push, render
        // với state hiện có.
        if (soOrderData == null) {
            console.warn(
                '[supplier-wallet] loadSoOrderData null — skip merge, render state hiện có'
            );
        } else {
            suppliers = aggregateSuppliers(soOrderData);
            const mutated = mergeAggregation(walletState, suppliers);
            if (mutated) {
                window.SupplierWalletStorage.save(walletState);
                pushSync();
            }
        }
        renderList();
        // Poll SePay deposits (refund từ NCC → giảm balance)
        pollDeposits().catch(() => {});
    }

    async function pollDeposits() {
        const since = Number(walletState.lastDepositSync) || 0;
        const deposits = await window.SupplierWalletStorage.fetchDeposits(since);
        if (!Array.isArray(deposits) || !deposits.length) return;
        const added = await window.SupplierWalletStorage.applyDeposits(walletState, deposits);
        const maxTs = deposits.reduce((m, d) => Math.max(m, Number(d.ts) || 0), since);
        if (maxTs > since) {
            walletState.lastDepositSync = maxTs;
            window.SupplierWalletStorage.save(walletState);
        }
        if (added > 0) {
            notify(`Cập nhật ${added} refund SePay từ NCC`, 'success');
            pushSync();
            renderList();
            if (activeSupplier && !document.getElementById('swDetailModal').hidden) {
                openDetail(activeSupplier);
            }
        }
    }

    function wireUi() {
        document.getElementById('swSearch').addEventListener('input', renderList);
        document.getElementById('swSort').addEventListener('change', renderList);
        document.getElementById('swRefreshBtn').addEventListener('click', loadAndRender);
        document.getElementById('swCreateBtn')?.addEventListener('click', openCreateModal);
        document.getElementById('swCreateConfirmBtn')?.addEventListener('click', confirmCreate);
        document.getElementById('swCreateName')?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmCreate();
            }
        });
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
            // Task 6: Enter-to-submit for swPayModal and swReturnModal.
            // swCreateModal already handles Enter on its own input.
            // Skip when isComposing (IME) or focus is in a <textarea>.
            if (e.key !== 'Enter' || e.isComposing) return;
            if (e.target.tagName === 'TEXTAREA') return;
            const openModal = document.querySelector(
                '#swPayModal:not([hidden]), #swReturnModal:not([hidden])'
            );
            if (!openModal) return;
            e.preventDefault();
            openModal.querySelector('.btn-primary')?.click();
        });
    }

    async function init() {
        // P1 2026-05-30: SupplierWalletStorage.load() giờ async (IDB read)
        walletState = await window.SupplierWalletStorage.load();
        const purged = window.SupplierWalletStorage.cleanupOldTransactions(walletState);
        if (purged) window.SupplierWalletStorage.save(walletState);
        wireUi();
        // Task 6 (2026-06-14): loading placeholder trước khi fetch so-order + aggregate.
        const _listEl = document.getElementById('swList');
        if (_listEl && !Object.keys(walletState.wallets || {}).length) {
            _listEl.innerHTML =
                '<div style="padding:20px;text-align:center;color:#64748b;display:flex;flex-direction:column;align-items:center;gap:12px">' +
                Array.from({ length: 3 })
                    .map(
                        () =>
                            '<div class="w2-skel" style="width:100%;max-width:520px;height:76px;border-radius:12px"></div>'
                    )
                    .join('') +
                '<span style="font-size:13px;font-weight:500">Đang tải danh sách NCC…</span>' +
                '</div>';
        }
        // Web2ProductsCache để match productName → code khi adjust stock lúc trả hàng.
        // Init async không chặn render — return modal có check optional.
        if (window.Web2ProductsCache?.init) {
            window.Web2ProductsCache.init().catch(() => {});
        }
        await loadAndRender();
        // Deep-link: ?supplier=<name> → auto-open detail drawer
        const _dlSup = window.Web2Deeplink?.param('supplier');
        if (_dlSup) {
            if (walletState.wallets[_dlSup]) {
                openDetail(_dlSup);
            } else {
                notify('Không tìm thấy NCC: ' + _dlSup, 'warning');
            }
        }
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
            walletState = await window.SupplierWalletStorage.load();
            renderList();
            pushSync();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: realtime auto-refresh khi SePay webhook nhận tiền (refund từ NCC).
    // Server pipeline (hub Web 2.0): SePay webhook → web2-wallet-service →
    // web2WalletEvents → realtime-sse-web2.js broadcast key 'web2:wallet:<phone>'.
    // Subscribe wildcard 'web2:wallet:*' (server match prefix 'web2:wallet')
    // để nhận mọi event. Topic cũ 'wallet:all' KHÔNG tồn tại trên hub web2.
    //
    // Khác biệt với customer-wallet: NCC ít khi chuyển tiền cho shop (chỉ khi
    // refund/hoàn), nên rate event thấp. Cùng pattern, debounce 800ms.
    let _sseUnsubs = [];
    let _ssePollTimer = null;
    let _sseReloadTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[SupplierWallet-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (_sseUnsubs.length) return;

        // 1. web2:wallet:* — SePay deposit (refund từ NCC), wildcard prefix match
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:wallet:*', (msg) => {
                if (_ssePollTimer) clearTimeout(_ssePollTimer);
                _ssePollTimer = setTimeout(async () => {
                    _ssePollTimer = null;
                    const phone = msg?.data?.phone;
                    const amount = msg?.data?.transaction?.amount;
                    console.log(
                        '[SupplierWallet-SSE] wallet_update:',
                        phone,
                        amount ? amount.toLocaleString('vi-VN') + 'đ' : ''
                    );
                    await pollDeposits();
                }, 800);
            })
        );

        // PHASE A2: web2:products — stock change từ so-order / web2/products ảnh
        // hưởng công nợ NCC. Khi adjust-stock / upsert-pending / confirm-purchase
        // → reload supplier aggregation.
        const scheduleAggregateReload = (label) => () => {
            if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
            _sseReloadTimer = setTimeout(async () => {
                _sseReloadTimer = null;
                console.log('[SupplierWallet-SSE] aggregate reload triggered by:', label);
                await loadAndRender();
            }, 1200);
        };
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:products', scheduleAggregateReload('web2:products'))
        );
        // ĐỢT E: web2:supplier-wallet giờ là topic CHÍNH của server ledger —
        // máy khác ghi payment/return/tạo NCC → re-pull /state TRƯỚC rồi mới
        // derive lại so-order (loadAndRender một mình chỉ render ledger cũ).
        _sseUnsubs.push(
            window.Web2SSE.subscribe('web2:supplier-wallet', () => {
                if (_sseReloadTimer) clearTimeout(_sseReloadTimer);
                _sseReloadTimer = setTimeout(async () => {
                    _sseReloadTimer = null;
                    console.log('[SupplierWallet-SSE] ledger reload (web2:supplier-wallet)');
                    await window.SupplierWalletStorage.Sync.init();
                    walletState = await window.SupplierWalletStorage.load();
                    await loadAndRender();
                    if (activeSupplier && !document.getElementById('swDetailModal').hidden) {
                        openDetail(activeSupplier);
                    }
                }, 800);
            })
        );
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
