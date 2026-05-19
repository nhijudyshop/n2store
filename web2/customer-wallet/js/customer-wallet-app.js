// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Ví KH — app controller.
//
// Flow:
//   1. Fetch PBH list from Render
//   2. Group by partner_phone → customers + tổng tiền + orderLines
//   3. Render list cards
//   4. Detail: tabs orders / history
//   5. Return modal: chọn chiến dịch → filter order_lines → tick → tạo transaction `return`
//   6. Payment modal: số tiền → transaction `payment`

(function () {
    'use strict';

    let walletState = null;
    let pbhList = []; // raw PBH from Render
    // Grouped by phone: { [phone]: { phone, name, orders: [...], totalPurchased } }
    let customers = {};
    let activePhone = null;
    let detailTab = 'orders';

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
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts));
        return (
            d.toLocaleDateString('vi-VN') +
            ' ' +
            d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
        );
    }
    function fmtDate(iso) {
        if (!iso) return '—';
        try {
            return new Date(iso).toLocaleDateString('vi-VN');
        } catch {
            return iso;
        }
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {
            /* ignore */
        }
    }

    // ---------- Aggregation ----------
    // Normalize a PBH object shape from various possible API responses.
    function normalizeOrder(o) {
        return {
            number: o.number || o.Number || '',
            date: o.dateInvoice || o.date_invoice || o.dateCreated || o.date_created || '',
            displayStt: o.displayStt || o.display_stt || null,
            phone: (o.partner?.phone || o.partner_phone || '').trim(),
            customerName: (o.partner?.name || o.partner_name || 'KH ẩn').trim(),
            campaignId: o.liveCampaign?.id || o.live_campaign_id || '',
            campaignName: o.liveCampaign?.name || o.live_campaign_name || '',
            amountTotal: Number(o.totals?.total || o.amount_total || 0),
            state: o.state || 'draft',
            lines: Array.isArray(o.orderLines || o.order_lines)
                ? (o.orderLines || o.order_lines).map((l, idx) => ({
                      key: `${o.number || o.Number}#${l.lineNumber || idx}`,
                      productCode: l.productCode || l.product_code || '',
                      productName: l.productName || l.product_name || l.name || '—',
                      quantity: Number(l.quantity || l.qty || 0),
                      price: Number(l.priceUnit || l.price_unit || l.price || 0),
                  }))
                : [],
        };
    }

    // PBH state nào KHÔNG tính vào tổng mua + không cho phép trả hàng.
    const EXCLUDED_PBH_STATES = new Set(['cancelled', 'cancel', 'canceled', 'huy', 'hủy']);

    function aggregateCustomers(orders) {
        const result = {};
        for (const raw of orders) {
            const o = normalizeOrder(raw);
            if (!o.phone) continue; // skip rows without phone (cannot dedupe)
            // Skip cancelled PBH — không tính vào ví, không cho trả hàng
            if (EXCLUDED_PBH_STATES.has(String(o.state).toLowerCase())) continue;
            if (!result[o.phone]) {
                result[o.phone] = {
                    phone: o.phone,
                    name: o.customerName,
                    orders: [],
                    totalPurchased: 0,
                    campaigns: {},
                };
            }
            const c = result[o.phone];
            c.orders.push(o);
            c.totalPurchased += o.amountTotal;
            if (o.campaignId) {
                c.campaigns[o.campaignId] = o.campaignName || o.campaignId;
            }
        }
        return result;
    }

    function mergeAggregation(wallet, agg) {
        const allPhones = new Set([...Object.keys(wallet.wallets || {}), ...Object.keys(agg)]);
        let mutated = false;
        for (const phone of allPhones) {
            const a = agg[phone];
            const w = window.CustomerWalletStorage.getOrCreateWallet(
                wallet,
                phone,
                a?.name || phone
            );
            const newTotal = a ? Math.round(a.totalPurchased) : 0;
            if (w.totalPurchased !== newTotal) {
                w.totalPurchased = newTotal;
                mutated = true;
            }
            if (a && a.name && w.name !== a.name) {
                w.name = a.name;
                mutated = true;
            }
            window.CustomerWalletStorage.recalcBalance(w);
        }
        return mutated;
    }

    // ---------- Render list ----------
    function renderList() {
        const listEl = document.getElementById('cwList');
        const emptyEl = document.getElementById('cwEmptyState');
        const search = (document.getElementById('cwSearch').value || '').trim().toLowerCase();
        const sortBy = document.getElementById('cwSort').value;
        const items = Object.keys(walletState.wallets)
            .map((p) => walletState.wallets[p])
            .filter((w) => customers[w.phone] || w.totalPurchased > 0)
            .filter(
                (w) =>
                    !search ||
                    w.name.toLowerCase().includes(search) ||
                    w.phone.toLowerCase().includes(search)
            );

        items.sort((a, b) => {
            if (sortBy === 'balance-desc') return b.balance - a.balance;
            if (sortBy === 'balance-asc') return a.balance - b.balance;
            if (sortBy === 'total-desc') return b.totalPurchased - a.totalPurchased;
            return a.name.localeCompare(b.name);
        });

        if (!items.length) {
            listEl.innerHTML = '';
            emptyEl.hidden = false;
        } else {
            emptyEl.hidden = true;
            listEl.innerHTML = items.map(cardHtml).join('');
            listEl.querySelectorAll('[data-phone]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.phone));
            });
        }
        const totalOutstanding = items.reduce((s, w) => s + Math.max(0, w.balance), 0);
        document.getElementById('cwTotalCustomers').textContent = `${items.length} KH`;
        document.getElementById('cwTotalOutstanding').textContent =
            `Công nợ: ${fmtVnd(totalOutstanding)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function cardHtml(w) {
        const debt = w.balance > 0;
        return `<div class="sw-card" data-phone="${escapeHtml(w.phone)}">
            <div class="sw-card-head">
                <div>
                    <div class="sw-card-name">${escapeHtml(w.name)}</div>
                    <div class="sw-card-phone">${escapeHtml(w.phone)}</div>
                </div>
                <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
            </div>
            <div class="sw-card-stats">
                <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(w.totalPurchased)}</span></div>
                <div><span class="label">Đã thu</span><span class="value">${fmtVnd(w.paidAmount)}</span></div>
                <div><span class="label">Đã trả</span><span class="value">${fmtVnd(w.returnedAmount)}</span></div>
                <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(w.balance)}</span></div>
            </div>
        </div>`;
    }

    // ---------- Detail ----------
    function openDetail(phone) {
        activePhone = phone;
        detailTab = 'orders';
        const w = walletState.wallets[phone];
        const c = customers[phone];
        if (!w) return;
        document.getElementById('cwDetailTitle').textContent = `${w.name} — ${phone}`;
        document.getElementById('cwDetailSub').textContent = c
            ? `${c.orders.length} PBH · ${Object.keys(c.campaigns).length} chiến dịch`
            : '—';
        document.getElementById('cwStatTotal').textContent = fmtVnd(w.totalPurchased);
        document.getElementById('cwStatPaid').textContent = fmtVnd(w.paidAmount);
        document.getElementById('cwStatReturned').textContent = fmtVnd(w.returnedAmount);
        document.getElementById('cwStatBalance').textContent = fmtVnd(w.balance);
        renderDetailTabs();
        document.getElementById('cwDetailModal').hidden = false;
    }

    function renderDetailTabs() {
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === detailTab);
        });
        document.querySelectorAll('#cwDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== detailTab;
        });
        if (detailTab === 'orders') renderOrders();
        else renderHistory();
    }

    function renderOrders() {
        const c = customers[activePhone];
        const tbody = document.getElementById('cwOrdersBody');
        if (!c || !c.orders.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có PBH</td></tr>`;
            return;
        }
        const sorted = [...c.orders].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        tbody.innerHTML = sorted
            .map((o) => {
                const totalQty = o.lines.reduce((s, l) => s + l.quantity, 0);
                return `<tr>
                    <td>${escapeHtml(fmtDate(o.date))}</td>
                    <td><span class="cw-pbh-pill">${escapeHtml(o.number)}</span></td>
                    <td>${o.campaignName ? `<span class="cw-campaign-pill">${escapeHtml(o.campaignName)}</span>` : '—'}</td>
                    <td class="num">${totalQty}</td>
                    <td class="num">${fmtVnd(o.amountTotal)}</td>
                    <td><span class="sw-status-pill">${escapeHtml(o.state || '—')}</span></td>
                </tr>`;
            })
            .join('');
    }

    function renderHistory() {
        const w = walletState.wallets[activePhone];
        const tbody = document.getElementById('cwHistoryBody');
        if (!w.transactions.length) {
            tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch 30 ngày</td></tr>`;
            return;
        }
        const sorted = [...w.transactions].sort((a, b) => b.ts - a.ts);
        tbody.innerHTML = sorted
            .map((t) => {
                const sign = 'is-pos';
                const lbl =
                    t.type === 'return'
                        ? 'Trả hàng (hoàn)'
                        : t.type === 'payment'
                          ? 'Thu tiền'
                          : 'Mua';
                return `<tr>
                    <td>${escapeHtml(fmtTime(t.ts))}</td>
                    <td><span class="sw-txn-type" data-type="${t.type}">${lbl}</span></td>
                    <td class="num sw-txn-amount ${sign}">+${fmtVnd(t.amount)}</td>
                    <td>${escapeHtml(t.note || '')}</td>
                </tr>`;
            })
            .join('');
    }

    // ---------- Return modal ----------
    function openReturnModal() {
        const c = customers[activePhone];
        if (!c) {
            notify('Không có dữ liệu chiến dịch cho KH này', 'warning');
            return;
        }
        document.getElementById('cwReturnCustomer').textContent = c.name;
        const campSel = document.getElementById('cwReturnCampaign');
        const camps = Object.keys(c.campaigns);
        if (!camps.length) {
            campSel.innerHTML = `<option value="">(Không có chiến dịch — chọn tất cả PBH)</option>`;
        } else {
            campSel.innerHTML =
                `<option value="">— Chọn chiến dịch —</option>` +
                camps
                    .map(
                        (id) =>
                            `<option value="${escapeHtml(id)}">${escapeHtml(c.campaigns[id])}</option>`
                    )
                    .join('');
        }
        // Reset body until campaign chosen
        document.getElementById('cwReturnBody').innerHTML =
            `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Chọn chiến dịch để xem sản phẩm</td></tr>`;
        document.getElementById('cwReturnTotal').textContent = fmtVnd(0);
        document.getElementById('cwReturnModal').hidden = false;
    }

    function onCampaignChange() {
        const w = walletState.wallets[activePhone];
        const c = customers[activePhone];
        const campId = document.getElementById('cwReturnCampaign').value;
        const filtered = c.orders.filter((o) => !campId || o.campaignId === campId);
        const lines = [];
        for (const o of filtered) {
            for (const l of o.lines) {
                if (w.returnedLineKeys[l.key]) continue; // skip returned
                lines.push({ ...l, pbh: o.number });
            }
        }
        const tbody = document.getElementById('cwReturnBody');
        if (!lines.length) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Không có dòng nào để trả</td></tr>`;
        } else {
            tbody.innerHTML = lines
                .map(
                    (
                        l
                    ) => `<tr data-key="${escapeHtml(l.key)}" data-price="${l.price}" data-qty="${l.quantity}" data-code="${escapeHtml(l.productCode || '')}">
                <td><input type="checkbox" class="cw-return-check" /></td>
                <td>${escapeHtml(l.productName)} <small style="color:#94a3b8">${escapeHtml(l.pbh)}</small></td>
                <td class="num">${l.quantity}</td>
                <td class="num"><input type="number" class="cw-return-qty" min="0" max="${l.quantity}" value="${l.quantity}" /></td>
                <td class="num">${fmtVnd(l.price)}</td>
                <td class="num cw-return-line-total">${fmtVnd(l.quantity * l.price)}</td>
            </tr>`
                )
                .join('');
        }
        recalcReturnTotal();
    }

    function recalcReturnTotal() {
        let total = 0;
        document.querySelectorAll('#cwReturnBody tr[data-key]').forEach((tr) => {
            const check = tr.querySelector('.cw-return-check');
            const qtyInput = tr.querySelector('.cw-return-qty');
            const lineEl = tr.querySelector('.cw-return-line-total');
            const price = Number(tr.dataset.price) || 0;
            const qty = Math.min(Number(qtyInput.value) || 0, Number(tr.dataset.qty) || 0);
            const sub = check.checked ? qty * price : 0;
            lineEl.textContent = fmtVnd(qty * price);
            total += sub;
        });
        document.getElementById('cwReturnTotal').textContent = fmtVnd(total);
    }

    async function confirmReturn() {
        const selected = [];
        const stockAdjustments = [];
        let total = 0;
        document.querySelectorAll('#cwReturnBody tr[data-key]').forEach((tr) => {
            const check = tr.querySelector('.cw-return-check');
            if (!check.checked) return;
            const qty = Math.min(
                Number(tr.querySelector('.cw-return-qty').value) || 0,
                Number(tr.dataset.qty) || 0
            );
            const price = Number(tr.dataset.price) || 0;
            const amount = qty * price;
            if (amount <= 0) return;
            selected.push({ key: tr.dataset.key, qty, amount });
            total += amount;
            const code = (tr.dataset.code || '').trim();
            if (code) stockAdjustments.push({ code, delta: qty, reason: `KH trả hàng` });
        });
        if (!selected.length) {
            notify('Chưa chọn dòng nào để trả', 'warning');
            return;
        }
        // Stock adjust: KH trả = nhập kho trở lại (+qty). Best-effort.
        try {
            if (stockAdjustments.length && window.Web2ProductsApi?.adjustStock) {
                await window.Web2ProductsApi.adjustStock(stockAdjustments);
            }
        } catch (e) {
            console.warn('[customer-wallet] stock adjust fail:', e.message);
        }
        const campId = document.getElementById('cwReturnCampaign').value || '';
        window.CustomerWalletStorage.addTransaction(walletState, activePhone, {
            type: 'return',
            amount: total,
            note: `Trả ${selected.length} dòng${campId ? ` (chiến dịch ${campId})` : ''}`,
            ref: { lineKeys: selected.map((r) => r.key), lines: selected, campaignId: campId },
        });
        pushSync();
        notify(`Đã ghi trả hàng ${fmtVnd(total)}`, 'success');
        document.getElementById('cwReturnModal').hidden = true;
        renderList();
        openDetail(activePhone);
    }

    // ---------- Payment modal ----------
    function openPayModal() {
        const w = walletState.wallets[activePhone];
        document.getElementById('cwPayCustomer').textContent = w.name;
        document.getElementById('cwPayAmount').value = 0;
        document.getElementById('cwPayNote').value = '';
        document.getElementById('cwPayModal').hidden = false;
    }

    function confirmPay() {
        const amount = Number(document.getElementById('cwPayAmount').value) || 0;
        const note = document.getElementById('cwPayNote').value || '';
        if (amount <= 0) {
            notify('Số tiền phải > 0', 'warning');
            return;
        }
        window.CustomerWalletStorage.addTransaction(walletState, activePhone, {
            type: 'payment',
            amount,
            note: note || 'Thu tiền',
        });
        pushSync();
        notify(`Đã ghi thu ${fmtVnd(amount)}`, 'success');
        document.getElementById('cwPayModal').hidden = true;
        renderList();
        openDetail(activePhone);
    }

    function pushSync() {
        if (window.CustomerWalletStorage?.Sync) {
            window.CustomerWalletStorage.Sync.push(walletState);
        }
    }

    async function loadAndRender() {
        // Pagination: loop tới khi hết (max 20 pages × 500 = 10k PBH)
        const list = await window.CustomerWalletStorage.fetchPbhList(20, 500);
        pbhList = list;
        customers = aggregateCustomers(pbhList);
        const mutated = mergeAggregation(walletState, customers);
        if (mutated) {
            window.CustomerWalletStorage.save(walletState);
            pushSync();
        }
        renderList();
        // Poll SePay deposits (incoming) → match KH theo phone → +payment
        pollDeposits().catch(() => {});
    }

    // Poll SePay deposits since lastDepositSync. Idempotent qua sepayId.
    async function pollDeposits() {
        const since = Number(walletState.lastDepositSync) || 0;
        const deposits = await window.CustomerWalletStorage.fetchDeposits(since);
        if (!Array.isArray(deposits) || !deposits.length) return;
        const added = window.CustomerWalletStorage.applyDeposits(walletState, deposits);
        // Cập nhật cursor = max ts đã thấy (kể cả khi không match wallet → tránh fetch lại)
        const maxTs = deposits.reduce((m, d) => Math.max(m, Number(d.ts) || 0), since);
        if (maxTs > since) {
            walletState.lastDepositSync = maxTs;
            window.CustomerWalletStorage.save(walletState);
        }
        if (added > 0) {
            notify(`Cập nhật ${added} thanh toán SePay`, 'success');
            pushSync();
            renderList();
            if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                openDetail(activePhone);
            }
        }
    }

    function wireUi() {
        document.getElementById('cwSearch').addEventListener('input', renderList);
        document.getElementById('cwSort').addEventListener('change', renderList);
        document.getElementById('cwRefreshBtn').addEventListener('click', loadAndRender);
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.addEventListener('click', () => {
                detailTab = b.dataset.detailTab;
                renderDetailTabs();
            });
        });
        document.getElementById('cwReturnBtn').addEventListener('click', openReturnModal);
        document.getElementById('cwPayBtn').addEventListener('click', openPayModal);
        document.getElementById('cwReturnConfirmBtn').addEventListener('click', confirmReturn);
        document.getElementById('cwPayConfirmBtn').addEventListener('click', confirmPay);
        document.getElementById('cwReturnCampaign').addEventListener('change', onCampaignChange);
        const returnBody = document.getElementById('cwReturnBody');
        returnBody.addEventListener('change', (e) => {
            if (
                e.target.classList.contains('cw-return-check') ||
                e.target.classList.contains('cw-return-qty')
            ) {
                recalcReturnTotal();
            }
        });
        returnBody.addEventListener('input', (e) => {
            if (e.target.classList.contains('cw-return-qty')) recalcReturnTotal();
        });
        document.getElementById('cwReturnSelectAll').addEventListener('change', (e) => {
            document.querySelectorAll('#cwReturnBody .cw-return-check').forEach((c) => {
                c.checked = e.target.checked;
            });
            recalcReturnTotal();
        });
        document.querySelectorAll('[data-cw-close]').forEach((el) => {
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
        walletState = window.CustomerWalletStorage.load();
        const purged = window.CustomerWalletStorage.cleanupOldTransactions(walletState);
        if (purged) window.CustomerWalletStorage.save(walletState);
        wireUi();
        await loadAndRender();
        const ok = await window.CustomerWalletStorage.Sync.init((remote) => {
            walletState = remote;
            window.CustomerWalletStorage.cleanupOldTransactions(walletState);
            renderList();
            if (activePhone && !document.getElementById('cwDetailModal').hidden) {
                openDetail(activePhone);
            }
        });
        if (ok) {
            walletState = window.CustomerWalletStorage.load();
            renderList();
            pushSync();
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
        _sseConnect();
    }

    // SSE: realtime auto-refresh khi SePay webhook nhận tiền chuyển khoản.
    // Server pipeline: SePay webhook → wallet-event-processor → walletEvents
    // .emit('wallet:update') → realtime-sse.js → notifyClientsWildcard('wallet')
    // → clients subscribe topic 'wallet:*' nhận event.
    //
    // Subscribe key bất kỳ start với 'wallet:' để nhận wildcard broadcast.
    // Dùng 'wallet:all' làm convention cho admin/page-level subscriber
    // (per-customer detail page có thể subscribe 'wallet:<phone>' riêng).
    let _sseUnsubscribe = null;
    let _sseUnsubscribeFso = null; // PHASE A1: web2:fast-sale-orders
    let _ssePollTimer = null;
    function _sseConnect() {
        if (!window.Web2SSE?.subscribe) {
            console.warn('[CustomerWallet-SSE] Web2SSE not loaded — skip realtime');
            return;
        }
        if (_sseUnsubscribe) return;
        // PHASE A1: subscribe thêm 'web2:fast-sale-orders' — khi PBH
        // confirm/cancel/print → wallet KH cần reload PBH list + recalc.
        // Cùng debounce timer với wallet:all để gom mutation burst.
        _sseUnsubscribeFso = window.Web2SSE.subscribe('web2:fast-sale-orders', (msg) => {
            if (_ssePollTimer) clearTimeout(_ssePollTimer);
            _ssePollTimer = setTimeout(async () => {
                _ssePollTimer = null;
                console.log(
                    '[CustomerWallet-SSE] PBH event:',
                    msg.data?.action,
                    msg.data?.number || ''
                );
                await loadAndRender();
            }, 800);
        });
        _sseUnsubscribe = window.Web2SSE.subscribe('wallet:all', (msg) => {
            // Server gửi event 'wallet_update' với data { phone, wallet, transaction }
            // Debounce 800ms — burst nhiều giao dịch SePay liên tiếp → 1 reload.
            if (_ssePollTimer) clearTimeout(_ssePollTimer);
            _ssePollTimer = setTimeout(async () => {
                _ssePollTimer = null;
                const phone = msg?.data?.phone;
                const amount = msg?.data?.transaction?.amount;
                console.log(
                    '[CustomerWallet-SSE] wallet_update:',
                    phone,
                    amount ? amount.toLocaleString('vi-VN') + 'đ' : ''
                );
                await pollDeposits();
                if (phone && amount) {
                    notify(
                        `💰 SePay: ${Number(amount).toLocaleString('vi-VN')}đ → ${phone}`,
                        'success'
                    );
                }
            }, 800);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
