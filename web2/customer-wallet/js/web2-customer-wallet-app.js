// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — customer-wallet Phase 4 (100% Web 2.0 isolation, NO Firestore).
// =====================================================================
// Web2CustomerWalletApp — Ví KH dùng 100% Web 2.0 backend.
// =====================================================================
// Data sources:
//   • /api/web2/wallets/*           → Postgres web2_customer_wallets (Web 2 isolated)
//   • /api/fast-sale-orders/load    → PBH "Tổng mua" (shared nghiệp vụ)
//   • /api/native-orders/load       → Đơn Web (Web 2 module, KH chưa lập PBH)
//   • SSE web2:wallet:*             → realtime credit từ SePay match auto
//
// KHÔNG dùng:
//   • Firestore web2_customer_wallet (Phase 3 deprecated — flash demo data)
//   • /api/wallet-deposits/load     (Web 1 legacy)
//   • SSE wallet:all                (Web 1 legacy)
//
// Card display:
//   Tổng mua = sum PBH (state='confirmed' không cancel)
//   Đã thu   = web2_wallet.total_deposited
//   Đã trả   = sum web2_wallet_transactions WHERE type='WITHDRAW' AND reference_type='return'
//   Còn nợ   = Tổng mua - Đã thu - Đã trả
// =====================================================================

(function (global) {
    'use strict';

    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const FALLBACK = 'https://n2store-fallback.onrender.com';

    const state = {
        customers: {}, // { [phone]: { phone, name, totalPurchased, paidAmount, returnedAmount, balance, orders[], campaigns{} } }
        web2Wallets: {}, // { [phone]: { phone, balance, total_deposited, total_withdrawn, customer_id } }
        web2ReturnAmounts: {}, // { [phone]: number } — sum of WITHDRAW return transactions
        tposPartners: {}, // { [phone]: TPOS partner } enriched
        activePhone: null,
        detailTab: 'orders',
        sort: 'balance-desc',
        search: '',
        loading: false,
    };

    // ─── Helpers ────────────────────────────────────────────────────
    const EXCLUDED_PBH_STATES = new Set(['cancelled', 'cancel', 'canceled', 'huy', 'hủy']);

    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }
    function escapeHtml(s) {
        if (s == null) return '';
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function fmtTime(ts) {
        if (!ts) return '—';
        const d = new Date(Number(ts) || ts);
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
    function normPhone(p) {
        if (!p) return '';
        const s = String(p).replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }
    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    async function jsonFetch(url, opts) {
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            throw new Error(
                (body && body.error) ||
                    (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`)
            );
        }
        return body;
    }

    // ─── Data fetch ─────────────────────────────────────────────────
    async function fetchPbhList(maxPages = 20, pageSize = 500) {
        const all = [];
        for (let page = 0; page < maxPages; page++) {
            const offset = page * pageSize;
            try {
                const data = await jsonFetch(
                    `${PROXY}/api/fast-sale-orders/load?limit=${pageSize}&offset=${offset}`
                );
                const batch = Array.isArray(data)
                    ? data
                    : Array.isArray(data.data)
                      ? data.data
                      : Array.isArray(data.orders)
                        ? data.orders
                        : [];
                if (!batch.length) break;
                all.push(...batch);
                if (batch.length < pageSize) break;
            } catch (e) {
                console.warn('[CW4] fetchPbhList fail:', e.message);
                break;
            }
        }
        return all;
    }
    async function fetchNativeOrders(maxPages = 20, pageSize = 200) {
        const all = [];
        for (let page = 1; page <= maxPages; page++) {
            try {
                const data = await jsonFetch(
                    `${PROXY}/api/native-orders/load?limit=${pageSize}&page=${page}`
                );
                const batch = Array.isArray(data?.orders)
                    ? data.orders
                    : Array.isArray(data?.data)
                      ? data.data
                      : Array.isArray(data)
                        ? data
                        : [];
                if (!batch.length) break;
                all.push(...batch);
                if (batch.length < pageSize) break;
            } catch (e) {
                console.warn('[CW4] fetchNativeOrders fail:', e.message);
                break;
            }
        }
        return all;
    }
    async function fetchWeb2Wallets(phones) {
        if (!window.Web2WalletApi?.getWalletsByPhones) return new Map();
        return await window.Web2WalletApi.getWalletsByPhones(phones, { concurrency: 5 });
    }
    async function fetchWalletReturns(phone) {
        if (!window.Web2WalletApi?.getTransactions) return 0;
        const txns = await window.Web2WalletApi.getTransactions(phone, {
            type: 'WITHDRAW',
            limit: 500,
        });
        return (txns || [])
            .filter((t) => t.reference_type === 'return')
            .reduce((s, t) => s + Number(t.amount || 0), 0);
    }
    async function fetchWeb2ReturnAmountsBatch(phones, concurrency = 5) {
        const out = {};
        const queue = [...phones];
        const workers = [];
        for (let i = 0; i < Math.min(concurrency, queue.length); i++) {
            workers.push(
                (async () => {
                    while (queue.length) {
                        const p = queue.shift();
                        try {
                            out[p] = await fetchWalletReturns(p);
                        } catch (_) {
                            out[p] = 0;
                        }
                    }
                })()
            );
        }
        await Promise.all(workers);
        return out;
    }

    // ─── Aggregation ────────────────────────────────────────────────
    function normalizeOrder(o) {
        return {
            number: o.number || o.Number || '',
            date: o.dateInvoice || o.date_invoice || o.dateCreated || o.date_created || '',
            phone: normPhone(o.partner?.phone || o.partner_phone || ''),
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

    function aggregateFromPbh(orders) {
        const out = {};
        for (const raw of orders) {
            const o = normalizeOrder(raw);
            if (!o.phone) continue;
            if (EXCLUDED_PBH_STATES.has(String(o.state).toLowerCase())) continue;
            if (!out[o.phone]) {
                out[o.phone] = {
                    phone: o.phone,
                    name: o.customerName,
                    orders: [],
                    totalPurchased: 0,
                    campaigns: {},
                };
            }
            const c = out[o.phone];
            c.orders.push(o);
            c.totalPurchased += o.amountTotal;
            if (o.campaignId) c.campaigns[o.campaignId] = o.campaignName || o.campaignId;
        }
        return out;
    }
    function mergeNativeOrders(agg, nativeOrders) {
        for (const row of nativeOrders || []) {
            const phone = normPhone(row.phone || row.partner_phone || '');
            if (!phone) continue;
            const name = (row.customerName || row.customer_name || row.fbUserName || '').trim();
            if (!agg[phone]) {
                agg[phone] = {
                    phone,
                    name: name || phone,
                    orders: [],
                    totalPurchased: 0,
                    campaigns: {},
                };
            } else if (!agg[phone].name || agg[phone].name === phone) {
                if (name) agg[phone].name = name;
            }
        }
        return agg;
    }

    // ─── DOM ────────────────────────────────────────────────────────
    const dom = {};
    function cacheDom() {
        dom.list = document.getElementById('cwList');
        dom.empty = document.getElementById('cwEmptyState');
        dom.search = document.getElementById('cwSearch');
        dom.sort = document.getElementById('cwSort');
        dom.totalCustomers = document.getElementById('cwTotalCustomers');
        dom.totalOutstanding = document.getElementById('cwTotalOutstanding');
        dom.refreshBtn = document.getElementById('cwRefreshBtn');
        dom.hardResetBtn = document.getElementById('cwHardResetBtn');
        dom.detailModal = document.getElementById('cwDetailModal');
        dom.detailTitle = document.getElementById('cwDetailTitle');
        dom.detailSub = document.getElementById('cwDetailSub');
        dom.statTotal = document.getElementById('cwStatTotal');
        dom.statPaid = document.getElementById('cwStatPaid');
        dom.statReturned = document.getElementById('cwStatReturned');
        dom.statBalance = document.getElementById('cwStatBalance');
        dom.ordersBody = document.getElementById('cwOrdersBody');
        dom.historyBody = document.getElementById('cwHistoryBody');
        dom.returnBtn = document.getElementById('cwReturnBtn');
        dom.payBtn = document.getElementById('cwPayBtn');
    }

    // ─── Render ─────────────────────────────────────────────────────
    function renderList() {
        const search = (dom.search.value || '').trim().toLowerCase();
        const sortBy = dom.sort.value;
        const items = Object.values(state.customers).filter(
            (c) =>
                !search || (c.name || '').toLowerCase().includes(search) || c.phone.includes(search)
        );

        // Compute paidAmount + returnedAmount + balance from Web 2.0 sources
        for (const c of items) {
            const w = state.web2Wallets[c.phone];
            c.paidAmount = w ? Number(w.total_deposited || 0) : 0;
            c.returnedAmount = Number(state.web2ReturnAmounts[c.phone] || 0);
            c.balance = (c.totalPurchased || 0) - c.paidAmount - c.returnedAmount;
            c.web2Wallet = w || null;
        }

        items.sort((a, b) => {
            if (sortBy === 'balance-desc') return b.balance - a.balance;
            if (sortBy === 'balance-asc') return a.balance - b.balance;
            if (sortBy === 'total-desc') return b.totalPurchased - a.totalPurchased;
            return (a.name || '').localeCompare(b.name || '');
        });

        if (!items.length) {
            dom.list.innerHTML = '';
            dom.empty.hidden = false;
        } else {
            dom.empty.hidden = true;
            dom.list.innerHTML = items.map(cardHtml).join('');
            dom.list.querySelectorAll('[data-phone]').forEach((el) => {
                el.addEventListener('click', () => openDetail(el.dataset.phone));
            });
        }

        const totalOutstanding = items.reduce((s, c) => s + Math.max(0, c.balance), 0);
        dom.totalCustomers.textContent = `${items.length} KH`;
        dom.totalOutstanding.textContent = `Công nợ: ${fmtVnd(totalOutstanding)}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function tposPartnerBadge(phone) {
        const partner = state.tposPartners[phone];
        if (!partner || !partner.Status || partner.Status === 'Normal') return '';
        const text =
            partner.StatusText || window.PartnerCustomerApi?.STATUS_TEXT?.[partner.Status] || '';
        if (!text) return '';
        const cls = (window.PartnerCustomerApi?.statusClass?.(partner.Status) || '').replace(
            'pc-status-',
            'cw-tpos-status-'
        );
        return `<span class="cw-tpos-status-pill ${cls}">${escapeHtml(text)}</span>`;
    }

    function cardHtml(c) {
        const debt = c.balance > 0;
        const partner = state.tposPartners[c.phone];
        const tposPill = tposPartnerBadge(c.phone);
        const carrier =
            partner?.NameNetwork || window.PartnerCustomerApi?.detectCarrier?.(c.phone) || '';
        const w2 = c.web2Wallet;
        const w2Balance = w2 ? Number(w2.balance || 0) : null;
        const w2Pill =
            w2Balance != null
                ? `<span class="cw-web2-balance ${w2Balance > 0 ? 'has-balance' : ''}" title="Số dư ví Web 2.0 hiện tại">💳 ${fmtVnd(w2Balance)}</span>`
                : '<span class="cw-web2-balance cw-no-wallet" title="Chưa có ví Web 2.0 — sẽ tự tạo khi nhận CK">—</span>';
        return `
            <div class="sw-card" data-phone="${escapeHtml(c.phone)}">
                <div class="sw-card-head">
                    <div>
                        <div class="sw-card-name">${escapeHtml(c.name || '(không tên)')} ${tposPill}</div>
                        <div class="sw-card-phone">${escapeHtml(c.phone)}${carrier ? ` <span class="cw-carrier">· ${escapeHtml(carrier)}</span>` : ''} ${w2Pill}</div>
                    </div>
                    <span class="sw-card-badge ${debt ? 'is-debt' : ''}">${debt ? 'Còn nợ' : 'Đủ'}</span>
                </div>
                <div class="sw-card-stats">
                    <div><span class="label">Tổng mua</span><span class="value">${fmtVnd(c.totalPurchased)}</span></div>
                    <div><span class="label">Đã thu</span><span class="value">${fmtVnd(c.paidAmount)}</span></div>
                    <div><span class="label">Đã trả</span><span class="value">${fmtVnd(c.returnedAmount)}</span></div>
                    <div class="balance"><span class="label">Còn nợ</span><span class="value">${fmtVnd(c.balance)}</span></div>
                </div>
            </div>
        `;
    }

    // ─── Detail drawer ──────────────────────────────────────────────
    async function openDetail(phone) {
        state.activePhone = phone;
        state.detailTab = 'orders';
        const c = state.customers[phone];
        if (!c) return;
        dom.detailTitle.textContent = `${c.name || '(không tên)'} — ${phone}`;
        renderDetailExtras(phone);
        dom.statTotal.textContent = fmtVnd(c.totalPurchased);
        dom.statPaid.textContent = fmtVnd(c.paidAmount);
        dom.statReturned.textContent = fmtVnd(c.returnedAmount);
        dom.statBalance.textContent = fmtVnd(c.balance);
        renderDetailTabs();
        dom.detailModal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function renderDetailExtras(phone) {
        const c = state.customers[phone];
        const partner = state.tposPartners[phone];
        const w2 = state.web2Wallets[phone];
        if (!c) return;
        const parts = [];
        if (c.orders.length) {
            parts.push(`${c.orders.length} PBH · ${Object.keys(c.campaigns).length} chiến dịch`);
        }
        if (partner) {
            const tposPill = tposPartnerBadge(phone);
            if (tposPill) parts.push(tposPill);
        }
        const editUrl = partner?.Id
            ? `../partner-customer/index.html?id=${encodeURIComponent(partner.Id)}`
            : `../partner-customer/index.html?search=${encodeURIComponent(phone)}`;
        parts.push(
            `<a class="cw-tpos-link" href="${editUrl}" target="_blank" rel="noopener">Mở thẻ KH ↗</a>`
        );
        dom.detailSub.innerHTML = parts.join(' · ');

        let extras = document.getElementById('cwTposExtras');
        if (!extras) {
            extras = document.createElement('div');
            extras.id = 'cwTposExtras';
            extras.className = 'cw-tpos-extras';
            dom.detailSub.parentNode.appendChild(extras);
        }
        const frags = [];
        if (partner?.Email) {
            frags.push(
                `<span class="cw-tpos-item"><i data-lucide="mail"></i>${escapeHtml(partner.Email)}</span>`
            );
        }
        const addr =
            partner?.FullAddress ||
            [partner?.Street, partner?.Ward, partner?.District, partner?.City]
                .filter(Boolean)
                .join(', ');
        if (addr) {
            frags.push(
                `<span class="cw-tpos-item"><i data-lucide="map-pin"></i>${escapeHtml(addr)}</span>`
            );
        }
        if (w2) {
            const bal = Number(w2.balance || 0);
            const dep = Number(w2.total_deposited || 0);
            const wd = Number(w2.total_withdrawn || 0);
            frags.push(
                `<span class="cw-tpos-item cw-web2-wallet-info"><i data-lucide="wallet"></i>Ví Web 2.0: <b>${fmtVnd(bal)}</b> (nạp ${fmtVnd(dep)} / chi ${fmtVnd(wd)})</span>`
            );
        } else {
            frags.push(
                `<span class="cw-tpos-item cw-tpos-loading">Chưa có ví Web 2.0 — sẽ tự tạo khi KH chuyển khoản đầu tiên</span>`
            );
        }
        extras.innerHTML = frags.join('');
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }
    function renderDetailTabs() {
        document.querySelectorAll('#cwDetailModal .sw-tab').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.detailTab === state.detailTab);
        });
        document.querySelectorAll('#cwDetailModal .sw-detail-panel').forEach((p) => {
            p.hidden = p.dataset.panel !== state.detailTab;
        });
        if (state.detailTab === 'orders') renderOrders();
        else renderHistory();
    }
    function renderOrders() {
        const c = state.customers[state.activePhone];
        if (!c || !c.orders.length) {
            dom.ordersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có PBH</td></tr>`;
            return;
        }
        const sorted = [...c.orders].sort((a, b) => String(b.date).localeCompare(String(a.date)));
        dom.ordersBody.innerHTML = sorted
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
    async function renderHistory() {
        const phone = state.activePhone;
        if (!phone) return;
        dom.historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Đang tải…</td></tr>`;
        try {
            const txns = await window.Web2WalletApi.getTransactions(phone, { limit: 100 });
            if (!txns.length) {
                dom.historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch</td></tr>`;
                return;
            }
            dom.historyBody.innerHTML = txns
                .map((t) => {
                    const lbl =
                        t.type === 'DEPOSIT'
                            ? t.reference_type === 'sepay'
                                ? 'CK SePay'
                                : 'Nạp tay'
                            : t.type === 'WITHDRAW'
                              ? t.reference_type === 'return'
                                  ? 'Hoàn (trả hàng)'
                                  : 'Trừ ví (mua đơn)'
                              : t.type;
                    const sign = t.type === 'DEPOSIT' ? '+' : '-';
                    return `<tr>
                        <td>${escapeHtml(fmtTime(t.created_at))}</td>
                        <td><span class="sw-txn-type" data-type="${t.type.toLowerCase()}">${lbl}</span></td>
                        <td class="num sw-txn-amount ${t.type === 'DEPOSIT' ? 'is-pos' : 'is-neg'}">${sign}${fmtVnd(t.amount)}</td>
                        <td>${escapeHtml(t.note || '')}</td>
                    </tr>`;
                })
                .join('');
        } catch (e) {
            dom.historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;padding:24px;">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // ─── TPOS enrichment ────────────────────────────────────────────
    async function enrichTpos() {
        if (!window.PartnerCustomerApi?.listByPhones) return;
        const phones = Object.keys(state.customers).filter(
            (p) => p && p.length >= 9 && !state.tposPartners[p]
        );
        if (!phones.length) return;
        try {
            const map = await window.PartnerCustomerApi.listByPhones(phones, { chunkSize: 30 });
            for (const [phone, partner] of map.entries()) {
                state.tposPartners[phone] = partner;
            }
            renderList();
            if (
                state.activePhone &&
                !dom.detailModal.hidden &&
                state.tposPartners[state.activePhone]
            ) {
                renderDetailExtras(state.activePhone);
            }
        } catch (e) {
            console.warn('[CW4] enrichTpos fail:', e.message);
        }
    }

    // ─── Main load ──────────────────────────────────────────────────
    async function load() {
        state.loading = true;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        try {
            // Step 1: PBH + native-orders (parallel)
            const [pbhList, natOrders] = await Promise.all([
                fetchPbhList(20, 500),
                fetchNativeOrders(20, 200).catch(() => []),
            ]);
            // Step 2: Aggregate to customer map
            const customers = aggregateFromPbh(pbhList);
            mergeNativeOrders(customers, natOrders);
            state.customers = customers;
            const phones = Object.keys(customers);
            // Step 3: Fetch Web 2.0 wallets for all phones (parallel batches)
            const [walletsMap, returnAmts] = await Promise.all([
                fetchWeb2Wallets(phones),
                fetchWeb2ReturnAmountsBatch(phones, 5),
            ]);
            state.web2Wallets = {};
            for (const [p, w] of walletsMap.entries()) state.web2Wallets[p] = w;
            state.web2ReturnAmounts = returnAmts;
            state.loading = false;
            renderList();
            // Step 4: enrich TPOS partners (async, non-blocking)
            enrichTpos().catch(() => {});
        } catch (e) {
            state.loading = false;
            console.error('[CW4] load fail:', e.message);
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
    }

    // ─── Refresh single wallet (SSE) ────────────────────────────────
    async function refreshSinglePhone(phone) {
        if (!phone) return;
        try {
            const w = await window.Web2WalletApi.getWallet(phone);
            if (w) {
                state.web2Wallets[phone] = w;
                // Re-fetch return amount cũng
                state.web2ReturnAmounts[phone] = await fetchWalletReturns(phone);
                // Ensure customer entry exists (KH mới chỉ có Web 2.0 wallet, chưa có PBH)
                if (!state.customers[phone]) {
                    state.customers[phone] = {
                        phone,
                        name: phone,
                        orders: [],
                        totalPurchased: 0,
                        campaigns: {},
                    };
                }
                renderList();
                if (state.activePhone === phone && !dom.detailModal.hidden) {
                    renderDetailExtras(phone);
                    const c = state.customers[phone];
                    if (c) {
                        c.paidAmount = Number(w.total_deposited || 0);
                        c.returnedAmount = Number(state.web2ReturnAmounts[phone] || 0);
                        c.balance = (c.totalPurchased || 0) - c.paidAmount - c.returnedAmount;
                        dom.statPaid.textContent = fmtVnd(c.paidAmount);
                        dom.statReturned.textContent = fmtVnd(c.returnedAmount);
                        dom.statBalance.textContent = fmtVnd(c.balance);
                    }
                }
            }
        } catch (e) {
            console.warn('[CW4] refreshSinglePhone fail:', e.message);
        }
    }

    // ─── Hard reset ─────────────────────────────────────────────────
    async function hardReset() {
        if (
            !confirm(
                'Hard reset?\n• Xoá toàn bộ localStorage cache\n• Reload data từ /api/web2/* (KHÔNG Firestore)\n\nDữ liệu Web 2.0 backend không bị xoá.'
            )
        )
            return;
        try {
            localStorage.removeItem('customerWallet_v1');
            localStorage.removeItem('customerWallet_v2');
            localStorage.removeItem('web2CustomerWallet');
            state.customers = {};
            state.web2Wallets = {};
            state.web2ReturnAmounts = {};
            state.tposPartners = {};
            renderList();
            notify('Đã clear cache. Đang reload từ Web 2.0…', 'info');
            await load();
            notify('Reload xong từ /api/web2/*', 'success');
        } catch (e) {
            notify('Lỗi hard reset: ' + e.message, 'error');
        }
    }

    // ─── SSE realtime ───────────────────────────────────────────────
    let _sseUnsub = null;
    function setupSSE() {
        if (!window.Web2SSE?.subscribe) return;
        // web2:wallet:* — wildcard cho mọi update từ Web 2.0 wallet service
        _sseUnsub = window.Web2SSE.subscribe('web2:wallet:*', (msg) => {
            const phone = msg?.data?.phone;
            const amount = msg?.data?.transaction?.amount;
            const txType = msg?.data?.transaction?.type;
            if (!phone) return;
            console.log('[CW4-SSE] web2:wallet:update', phone, txType, amount);
            refreshSinglePhone(phone).catch(() => {});
            if (amount && Number(amount) > 0 && txType === 'DEPOSIT') {
                notify(`💳 Ví Web 2.0: +${fmtVnd(amount)} → ${phone}`, 'success');
            }
        });
        // Also subscribe to PBH changes (web2:fast-sale-orders → reload list)
        const reloadDebounced = debounce(() => load(), 1000);
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => reloadDebounced());
        window.Web2SSE.subscribe('web2:native-orders', () => reloadDebounced());
    }

    // ─── Wire UI ────────────────────────────────────────────────────
    function wireUi() {
        dom.search.addEventListener('input', debounce(renderList, 200));
        dom.sort.addEventListener('change', renderList);
        dom.refreshBtn?.addEventListener('click', load);
        dom.hardResetBtn?.addEventListener('click', hardReset);
        document.addEventListener('click', (e) => {
            if (e.target.closest('[data-cw-close]')) {
                document.querySelectorAll('.sw-modal:not([hidden])').forEach((m) => {
                    m.hidden = true;
                });
            }
            const tab = e.target.closest('[data-detail-tab]');
            if (tab) {
                state.detailTab = tab.dataset.detailTab;
                renderDetailTabs();
            }
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape')
                document.querySelectorAll('.sw-modal:not([hidden])').forEach((m) => {
                    m.hidden = true;
                });
        });
    }

    // ─── Init ───────────────────────────────────────────────────────
    async function init() {
        cacheDom();
        wireUi();
        await load();
        setupSSE();
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2CustomerWalletApp = { load, hardReset, refreshSinglePhone, state };
})(window);
