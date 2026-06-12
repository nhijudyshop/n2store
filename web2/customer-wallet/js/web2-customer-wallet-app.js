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
        // Server-paged rows for current view (50/page typical, max 200)
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        // Local cache: { [phone]: row } — populated as user pages through.
        // Used for detail modal lookup + SSE in-place updates.
        cache: {},
        // Stats summary (aggregate across ALL customers, not just current page)
        stats: {},
        // WEB2 partner enrichment per phone (only for visible page)
        web2Partners: {},
        activePhone: null,
        detailTab: 'orders',
        sort: 'balance-desc',
        search: '',
        quickFilter: 'all', // server-side: all | debt | has_balance | paid_off | vip | bomb | warning
        loading: false,
        // Detail-only data (fetched on openDetail)
        detailOrders: [], // PBH list for active phone
    };

    // Diacritic strip (inline, no deps)
    function stripDiacritics(s) {
        if (!s) return '';
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }
    function searchNormalize(s) {
        return stripDiacritics(String(s || ''))
            .toLowerCase()
            .trim();
    }

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

    // ─── Aggregate endpoint (server-side join + paging) ────────────
    const AGGREGATE_BASE = `${PROXY}/api/web2/customer-wallet`;
    const AGGREGATE_FALLBACK = `${FALLBACK}/api/web2/customer-wallet`;

    // V2 (2026-05-30): WEB2 Partner làm primary source + overlay Web 2.0
    // wallet/debt data per page. Replaces /aggregate (chỉ list KH có web2
    // activity). Giờ list toàn bộ WEB2 customers (5000+ KH), debt/wallet là
    // overlay → KH chưa CK vẫn xuất hiện với balance 0 (cho phép tạo QR).
    async function fetchOverlay(phones) {
        const opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phones }),
        };
        try {
            return await jsonFetch(`${AGGREGATE_BASE}/overlay-by-phones`, opts);
        } catch (e) {
            return await jsonFetch(`${AGGREGATE_FALLBACK}/overlay-by-phones`, opts);
        }
    }

    // Hybrid filter mode: 'debt' / 'has_balance' / 'paid_off' chỉ áp KH có
    // web2 activity → dùng /aggregate (server filter + paginate). 'all' / WEB2
    // status (vip/warning/bomb) → dùng WEB2 source.
    async function fetchAggregateWeb2Only(opts) {
        const params = new URLSearchParams();
        params.set('limit', String(opts.limit || 50));
        params.set('offset', String(opts.offset || 0));
        if (opts.sort) params.set('sort', opts.sort);
        if (opts.filter && opts.filter !== 'all') params.set('filter', opts.filter);
        if (opts.search) params.set('search', opts.search);
        const qs = params.toString();
        try {
            return await jsonFetch(`${AGGREGATE_BASE}/aggregate?${qs}`);
        } catch (e) {
            return await jsonFetch(`${AGGREGATE_FALLBACK}/aggregate?${qs}`);
        }
    }

    async function fetchAggregateStats() {
        try {
            return await jsonFetch(`${AGGREGATE_BASE}/stats`);
        } catch (e) {
            return await jsonFetch(`${AGGREGATE_FALLBACK}/stats`);
        }
    }

    // ─── PBH-detail fetch (called only when opening a customer detail) ──
    async function fetchPbhListForPhone(phone) {
        // 2026-06-03: dùng kho KH riêng Web 2.0 — /api/web2/customers/by-phone/<phone>/orders
        // (query thẳng native_orders + fast_sale_orders, bỏ /api/v2/customers Web 1.0).
        // Trả về { native:[], pbh:[] }.
        try {
            const data = await jsonFetch(
                `${PROXY}/api/web2/customers/by-phone/${encodeURIComponent(phone)}/orders?limit=100`
            );
            return data?.data || data || { native: [], pbh: [] };
        } catch (e) {
            try {
                const data = await jsonFetch(
                    `${FALLBACK}/api/web2/customers/by-phone/${encodeURIComponent(phone)}/orders?limit=100`
                );
                return data?.data || data || { native: [], pbh: [] };
            } catch (_) {
                return { native: [], pbh: [] };
            }
        }
    }

    // ─── Legacy fetchers (kept for SSE refresh / single-phone use) ─────
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
    // Fetch toàn bộ ví Web 2.0 (KH đã từng có CK / wallet adjustment).
    // Để hiển thị cả KH chưa có PBH/Đơn Web nhưng đã có ví (vd backfilled
    // từ legacy customer_wallets, hoặc CK SePay đầu tiên mà chưa lập đơn).
    async function fetchAllWeb2Wallets() {
        if (!window.Web2WalletApi?.listWallets) return [];
        try {
            // listWallets ORDER BY balance DESC — KH có dư hiện trên top
            const r = await window.Web2WalletApi.listWallets({ limit: 2000, offset: 0 });
            return r?.data || [];
        } catch (e) {
            console.warn('[CW4] fetchAllWeb2Wallets fail:', e.message);
            return [];
        }
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
        dom.exportCsvBtn = document.getElementById('cwExportCsv');
        dom.statKh = document.getElementById('cwStatKh');
        dom.statDebt = document.getElementById('cwStatDebt');
        dom.statWallet = document.getElementById('cwStatWallet');
        dom.statPaid = document.getElementById('cwStatPaid');
        dom.chipAll = document.getElementById('cwChipAll');
        dom.chipDebt = document.getElementById('cwChipDebt');
        dom.chipBalance = document.getElementById('cwChipBalance');
        dom.chipVip = document.getElementById('cwChipVip');
        dom.chipWarn = document.getElementById('cwChipWarn');
        dom.chipBomb = document.getElementById('cwChipBomb');
        dom.chipsContainer = document.getElementById('cwChips');
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
        dom.pagination = document.getElementById('cwPagination');
        dom.pageInfo = document.getElementById('cwPageInfo');
        dom.pageButtons = document.getElementById('cwPageButtons');
        dom.pageSize = document.getElementById('cwPageSize');
    }

    // ─── Render ─────────────────────────────────────────────────────
    // Server-paged: state.rows is the current page from /aggregate.
    // No client-side filter/sort/search — server handles everything.
    function renderList() {
        const items = state.rows;

        if (state.loading) {
            dom.list.innerHTML = `<div class="cw-loading">Đang tải…</div>`;
            dom.empty.hidden = true;
            return;
        }
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

        renderPagination();

        // Stats overlay:
        // - Header counter pill = WEB2 total (full customer base, 90k+)
        // - Stat cards: Tổng KH (WEB2) + Có hoạt động Web 2.0 (web2 stats)
        const s = state.stats || {};
        const web2Total = Number(s.total) || 0;
        const stateTotal = Number(state.total) || 0; // primary source khi filter=all/vip/warning/bomb
        const headerTotal = web2Total || stateTotal;
        const filteredDebt = items.reduce((acc, c) => acc + Math.max(0, c.balance || 0), 0);
        dom.totalCustomers.textContent = `${items.length} / ${headerTotal.toLocaleString('vi-VN')} KH`;
        dom.totalOutstanding.textContent = `Công nợ filter: ${fmtVnd(filteredDebt)}`;

        if (dom.statKh) dom.statKh.textContent = headerTotal.toLocaleString('vi-VN');
        if (dom.statDebt) dom.statDebt.textContent = fmtVnd(s.total_debt);
        if (dom.statWallet) dom.statWallet.textContent = fmtVnd(s.total_wallet_balance);
        if (dom.statPaid) dom.statPaid.textContent = fmtVnd(s.total_paid);

        if (dom.chipAll) dom.chipAll.textContent = headerTotal.toLocaleString('vi-VN');
        if (dom.chipDebt) dom.chipDebt.textContent = (s.debt_count || 0).toLocaleString('vi-VN');
        if (dom.chipBalance)
            dom.chipBalance.textContent = (s.has_balance_count || 0).toLocaleString('vi-VN');
        // VIP/Warning/Bomb counts require WEB2 data — leave dash until WEB2 loads
        // (these filters are still implemented client-side via WEB2 partner status)
        if (dom.chipVip) dom.chipVip.textContent = state.web2PartnerCounts?.vip ?? '—';
        if (dom.chipWarn) dom.chipWarn.textContent = state.web2PartnerCounts?.warning ?? '—';
        if (dom.chipBomb) dom.chipBomb.textContent = state.web2PartnerCounts?.bomb ?? '—';

        document.querySelectorAll('#cwChips .cw-chip').forEach((b) => {
            b.classList.toggle('is-active', b.dataset.filter === state.quickFilter);
        });

        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function renderPagination() {
        const total = state.total || 0;
        const size = state.pageSize;
        const pages = Math.max(1, Math.ceil(total / size));
        const page = Math.min(Math.max(1, state.page), pages);
        const start = total === 0 ? 0 : (page - 1) * size + 1;
        const end = Math.min(page * size, total);
        if (dom.pageInfo) {
            dom.pageInfo.textContent = `${start.toLocaleString('vi-VN')}–${end.toLocaleString('vi-VN')} / ${total.toLocaleString('vi-VN')}`;
        }
        if (!dom.pageButtons) return;
        const btns = [];
        const push = (label, target, opts) => {
            const disabled = opts?.disabled ? 'disabled' : '';
            const active = opts?.active ? 'is-active' : '';
            btns.push(
                `<button type="button" class="${active}" data-page="${target}" ${disabled}>${label}</button>`
            );
        };
        push('«', 1, { disabled: page <= 1 });
        push('‹', page - 1, { disabled: page <= 1 });
        const win = 5;
        let from = Math.max(1, page - 2);
        let to = Math.min(pages, from + win - 1);
        from = Math.max(1, to - win + 1);
        for (let i = from; i <= to; i++) push(String(i), i, { active: i === page });
        push('›', page + 1, { disabled: page >= pages });
        push('»', pages, { disabled: page >= pages });
        dom.pageButtons.innerHTML = btns.join('');
    }

    function web2PartnerBadge(phone) {
        const partner = state.web2Partners[phone];
        if (!partner || !partner.Status || partner.Status === 'Normal') return '';
        const text =
            partner.StatusText || window.PartnerCustomerApi?.STATUS_TEXT?.[partner.Status] || '';
        if (!text) return '';
        const cls = (window.PartnerCustomerApi?.statusClass?.(partner.Status) || '').replace(
            'pc-status-',
            'cw-web2-status-'
        );
        return `<span class="cw-web2-status-pill ${cls}">${escapeHtml(text)}</span>`;
    }

    function cardHtml(c) {
        const debt = (c.balance || 0) > 0;
        const partner = state.web2Partners[c.phone];
        const web2Pill = web2PartnerBadge(c.phone);
        const carrier =
            partner?.NameNetwork || window.PartnerCustomerApi?.detectCarrier?.(c.phone) || '';
        // Server returns walletBalance directly (no nested object); only show
        // "no wallet" pill when the row genuinely has no wallet (paid/withdraw
        // both zero AND walletBalance is exactly 0 with no deposit history).
        const hasWallet =
            c.walletBalance != null &&
            (c.walletBalance > 0 || c.totalDeposited > 0 || c.totalWithdrawn > 0);
        const w2Balance = c.walletBalance != null ? Number(c.walletBalance || 0) : null;
        const w2Pill = hasWallet
            ? `<span class="cw-web2-balance ${w2Balance > 0 ? 'has-balance' : ''}" title="Số dư ví Web 2.0 hiện tại">💳 ${fmtVnd(w2Balance)}</span>`
            : '<span class="cw-web2-balance cw-no-wallet" title="Chưa có ví Web 2.0 — sẽ tự tạo khi nhận CK">—</span>';
        return `
            <div class="sw-card" data-phone="${escapeHtml(c.phone)}">
                <div class="sw-card-head">
                    <div>
                        <div class="sw-card-name">${escapeHtml(c.name || '(không tên)')} ${web2Pill}</div>
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
        const c = state.cache[phone];
        if (!c) return;
        dom.detailTitle.textContent = `${c.name || '(không tên)'} — ${phone}`;
        dom.statTotal.textContent = fmtVnd(c.totalPurchased);
        dom.statPaid.textContent = fmtVnd(c.paidAmount);
        dom.statReturned.textContent = fmtVnd(c.returnedAmount);
        dom.statBalance.textContent = fmtVnd(c.balance);
        renderDetailExtras(phone);
        renderDetailTabs();
        dom.detailModal.hidden = false;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        // Lazy-fetch PBH detail for this phone (not loaded for list view)
        state.detailOrders = [];
        try {
            const orders = await fetchPbhListForPhone(phone);
            state.detailOrders = orders;
            if (state.activePhone === phone && state.detailTab === 'orders') renderOrders();
        } catch (_) {}
    }
    function renderDetailExtras(phone) {
        const c = state.cache[phone];
        const partner = state.web2Partners[phone];
        const w2 = c
            ? {
                  balance: c.walletBalance,
                  total_deposited: c.totalDeposited,
                  total_withdrawn: c.totalWithdrawn,
              }
            : null;
        if (!c) return;
        const parts = [];
        if (c.pbhCount > 0) parts.push(`${c.pbhCount} PBH`);
        if (c.nativeCount > 0) parts.push(`${c.nativeCount} Đơn Web`);
        if (partner) {
            const web2Pill = web2PartnerBadge(phone);
            if (web2Pill) parts.push(web2Pill);
        }
        const editUrl = partner?.Id
            ? `../customers/index.html`
            : `../customers/index.html?search=${encodeURIComponent(phone)}`;
        parts.push(
            `<a class="cw-web2-link" href="${editUrl}" target="_blank" rel="noopener">Mở thẻ KH ↗</a>`
        );
        dom.detailSub.innerHTML = parts.join(' · ');

        let extras = document.getElementById('cwWeb2Extras');
        if (!extras) {
            extras = document.createElement('div');
            extras.id = 'cwWeb2Extras';
            extras.className = 'cw-web2-extras';
            dom.detailSub.parentNode.appendChild(extras);
        }
        const frags = [];
        if (partner?.Email) {
            frags.push(
                `<span class="cw-web2-item"><i data-lucide="mail"></i>${escapeHtml(partner.Email)}</span>`
            );
        }
        const addr =
            partner?.FullAddress ||
            [partner?.Street, partner?.Ward, partner?.District, partner?.City]
                .filter(Boolean)
                .join(', ');
        if (addr) {
            frags.push(
                `<span class="cw-web2-item"><i data-lucide="map-pin"></i>${escapeHtml(addr)}</span>`
            );
        }
        if (w2) {
            const bal = Number(w2.balance || 0);
            const dep = Number(w2.total_deposited || 0);
            const wd = Number(w2.total_withdrawn || 0);
            frags.push(
                `<span class="cw-web2-item cw-web2-wallet-info"><i data-lucide="wallet"></i>Ví Web 2.0: <b>${fmtVnd(bal)}</b> (nạp ${fmtVnd(dep)} / chi ${fmtVnd(wd)})</span>`
            );
        } else {
            frags.push(
                `<span class="cw-web2-item cw-web2-loading">Chưa có ví Web 2.0 — sẽ tự tạo khi KH chuyển khoản đầu tiên</span>`
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
        else if (state.detailTab === 'history') renderHistory();
        else if (state.detailTab === 'qr') renderQrTab();
    }

    // ----- QR VietQR tab -----
    const QR_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/customer-wallet';
    const QR_DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2/customer-wallet';
    async function qrFetch(path, options) {
        try {
            const r = await fetch(`${QR_BASE}${path}`, options);
            if (r.status === 404) return { status: 404, body: await r.json().catch(() => ({})) };
            const body = await r.json();
            if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
            return { status: r.status, body };
        } catch (e) {
            const r = await fetch(`${QR_DIRECT_BASE}${path}`, options);
            if (r.status === 404) return { status: 404, body: await r.json().catch(() => ({})) };
            const body = await r.json();
            if (!r.ok) throw new Error(body?.error || `HTTP ${r.status}`);
            return { status: r.status, body };
        }
    }
    function renderQrEmpty() {
        document.getElementById('cwQrLoading').hidden = true;
        document.getElementById('cwQrContent').hidden = true;
        document.getElementById('cwQrEmpty').hidden = false;
        if (window.lucide) window.lucide.createIcons();
    }
    function renderQrData(qr) {
        document.getElementById('cwQrLoading').hidden = true;
        document.getElementById('cwQrEmpty').hidden = true;
        document.getElementById('cwQrContent').hidden = false;
        document.getElementById('cwQrImage').src = qr.vietqr_url;
        document.getElementById('cwQrCode').textContent = qr.qr_code;
        document.getElementById('cwQrPartnerId').textContent = qr.customer_id || '—';
        document.getElementById('cwQrUseCount').textContent = qr.use_count || 0;
        document.getElementById('cwQrLastUsed').textContent = qr.last_used_at
            ? new Date(qr.last_used_at).toLocaleString('vi-VN')
            : '(chưa dùng)';
        document.getElementById('cwQrCopyImage').href = qr.vietqr_url;
        if (qr.bank) {
            document.getElementById('cwQrBank').textContent =
                `${qr.bank.code} · ${qr.bank.accountNo} · ${qr.bank.accountName}`;
        }
        if (window.lucide) window.lucide.createIcons();
    }
    async function renderQrTab() {
        const phone = state.activePhone;
        if (!phone) return;
        const loading = document.getElementById('cwQrLoading');
        const content = document.getElementById('cwQrContent');
        const empty = document.getElementById('cwQrEmpty');
        loading.hidden = false;
        loading.textContent = 'Đang tải / tạo QR…';
        content.hidden = true;
        empty.hidden = true;
        try {
            const r = await qrFetch(`/${encodeURIComponent(phone)}/qr`);
            if (r.status === 404) {
                // Auto-create: gọi POST UPSERT (backend tự lookup WEB2 partner_id)
                const c = state.cache[phone];
                const partner = state.web2Partners[phone];
                const post = await qrFetch(`/${encodeURIComponent(phone)}/qr`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerId: partner?.Id || c?.customerId || undefined,
                        customerName: partner?.Name || c?.name || undefined,
                    }),
                });
                if (post.status !== 200) {
                    throw new Error(post.body?.error || `HTTP ${post.status}`);
                }
                renderQrData(post.body.data);
                return;
            }
            renderQrData(r.body.data);
        } catch (e) {
            loading.textContent = `Lỗi: ${e.message}`;
        }
    }
    async function upsertQr() {
        const phone = state.activePhone;
        if (!phone) return;
        const c = state.cache[phone];
        const partner = state.web2Partners[phone];
        const btnCreate = document.getElementById('cwQrCreate');
        const btnUpsert = document.getElementById('cwQrUpsert');
        const targetBtn = btnUpsert?.offsetParent ? btnUpsert : btnCreate;
        if (targetBtn) {
            targetBtn.disabled = true;
            targetBtn.dataset._txt = targetBtn.innerHTML;
            targetBtn.innerHTML = '<i data-lucide="loader-2"></i> Đang xử lý…';
            if (window.lucide) window.lucide.createIcons();
        }
        try {
            const body = {
                customerId: partner?.Id || c?.customerId || undefined,
                customerName: partner?.Name || c?.name || undefined,
            };
            const r = await qrFetch(`/${encodeURIComponent(phone)}/qr`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            renderQrData(r.body.data);
            try {
                window.notificationManager?.show?.('Đã tạo QR thành công', 'success');
            } catch (_) {}
        } catch (e) {
            try {
                window.notificationManager?.show?.('Lỗi tạo QR: ' + e.message, 'error');
            } catch (_) {}
        } finally {
            if (targetBtn) {
                targetBtn.disabled = false;
                targetBtn.innerHTML = targetBtn.dataset._txt;
                if (window.lucide) window.lucide.createIcons();
            }
        }
    }
    function copyQrCode() {
        const code = document.getElementById('cwQrCode').textContent;
        if (!code || code === '—') return;
        navigator.clipboard?.writeText(code).then(
            () => window.notificationManager?.show?.('Đã copy mã QR', 'success'),
            () => window.notificationManager?.show?.('Copy thất bại', 'error')
        );
    }
    // Wire QR buttons after DOM ready
    document.addEventListener('click', (e) => {
        if (e.target.closest('#cwQrCreate, #cwQrUpsert')) {
            e.preventDefault();
            upsertQr();
        } else if (e.target.closest('#cwQrCopyCode')) {
            e.preventDefault();
            copyQrCode();
        }
    });
    function renderOrders() {
        const orders = state.detailOrders;
        const pbh = Array.isArray(orders?.pbh) ? orders.pbh : [];
        if (!pbh.length) {
            dom.ordersBody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#94a3b8;padding:24px;">${orders === null ? 'Đang tải…' : 'Chưa có PBH'}</td></tr>`;
            return;
        }
        const sorted = [...pbh].sort((a, b) =>
            String(b.dateInvoice || b.dateCreated || '').localeCompare(
                String(a.dateInvoice || a.dateCreated || '')
            )
        );
        dom.ordersBody.innerHTML = sorted
            .map((o) => {
                const totalQty = o.totalQuantity || 0;
                const date = o.dateInvoice || o.dateCreated || '';
                return `<tr>
                    <td>${escapeHtml(fmtDate(date))}</td>
                    <td><span class="cw-pbh-pill">${escapeHtml(o.number || '')}</span></td>
                    <td>${o.liveCampaign?.name ? `<span class="cw-campaign-pill">${escapeHtml(o.liveCampaign.name)}</span>` : '—'}</td>
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
        dom.historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Đang tải…</td></tr>`;
        try {
            const txns = await window.Web2WalletApi.getTransactions(phone, { limit: 100 });
            if (!txns.length) {
                dom.historyBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:#94a3b8;padding:24px;">Chưa có giao dịch</td></tr>`;
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
                    const by =
                        t.performed_by || (t.reference_type === 'sepay' ? '(SePay tự động)' : '—');
                    return `<tr>
                        <td>${escapeHtml(fmtTime(t.created_at))}</td>
                        <td><span class="sw-txn-type" data-type="${t.type.toLowerCase()}">${lbl}</span></td>
                        <td class="num sw-txn-amount ${t.type === 'DEPOSIT' ? 'is-pos' : 'is-neg'}">${sign}${fmtVnd(t.amount)}</td>
                        <td>${escapeHtml(by)}</td>
                        <td>${escapeHtml(t.note || '')}</td>
                    </tr>`;
                })
                .join('');
        } catch (e) {
            dom.historyBody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:#dc2626;padding:24px;">Lỗi tải: ${escapeHtml(e.message)}</td></tr>`;
        }
    }

    // ─── WEB2 enrichment (current page only, non-blocking) ────────────
    async function enrichWeb2ForCurrentPage() {
        if (!window.PartnerCustomerApi?.listByPhones) return;
        const phones = state.rows
            .map((r) => r.phone)
            .filter((p) => p && p.length >= 9 && !state.web2Partners[p]);
        if (!phones.length) return;
        try {
            // Concurrency 8 — chỉ enrich 50 phones tối đa (current page size)
            const map = await window.PartnerCustomerApi.listByPhones(phones, { concurrency: 8 });
            for (const [phone, partner] of map.entries()) {
                state.web2Partners[phone] = partner;
                // Cập nhật tên KH wallet-only nếu server trả về `<phone>` (chưa
                // có name từ PBH/native) — WEB2 partner thường có name chính xác.
                const row = state.rows.find((r) => r.phone === phone);
                if (row && row.name === row.phone && partner.Name) {
                    row.name = partner.Name;
                    if (state.cache[phone]) state.cache[phone].name = partner.Name;
                }
            }
            renderList();
            if (
                state.activePhone &&
                !dom.detailModal.hidden &&
                state.web2Partners[state.activePhone]
            ) {
                renderDetailExtras(state.activePhone);
            }
        } catch (e) {
            console.warn('[CW4] enrichWeb2ForCurrentPage fail:', e.message);
        }
    }

    // ─── Main load (WEB2 primary + Web 2.0 overlay) ──────────────────
    // V2 architecture (2026-05-30):
    //   1. Source primary = PartnerCustomerApi.list (WEB2 Partner OData)
    //   2. Cho phones page hiện tại → POST /overlay-by-phones lấy wallet/debt
    //   3. Merge: WEB2 partner data + overlay → state.rows
    //   4. Client-side filter cho 'debt' / 'has_balance' (chỉ trên page)
    //   5. Stats vẫn từ /stats endpoint (web2 aggregate, có thể khác total
    //      nhưng vẫn hữu ích cho summary)
    let _loadSeq = 0;
    async function load() {
        const mySeq = ++_loadSeq;
        state.loading = true;
        renderList();
        try {
            // Hybrid: wallet-focused filter → /aggregate web2-only.
            // Có thể fetch debt/has_balance globally (KH có web2 activity).
            if (
                state.quickFilter === 'debt' ||
                state.quickFilter === 'has_balance' ||
                state.quickFilter === 'paid_off'
            ) {
                const aggResult = await fetchAggregateWeb2Only({
                    limit: state.pageSize,
                    offset: (state.page - 1) * state.pageSize,
                    sort: state.sort,
                    filter: state.quickFilter,
                    search: state.search,
                });
                if (mySeq !== _loadSeq) return;
                const statsResult = await fetchAggregateStats().catch(() => ({
                    data: state.stats,
                }));
                state.rows = (aggResult?.data || []).map((r) => ({
                    ...r,
                    web2Status: 'Normal',
                    web2Active: true,
                }));
                state.total = aggResult?.total || 0;
                state.stats = statsResult?.data || {};
                for (const r of state.rows) state.cache[r.phone] = r;
                state.loading = false;
                renderList();
                enrichWeb2ForCurrentPage().catch(() => {});
                return;
            }

            // WEB2-primary mode: list toàn bộ WEB2 customers + overlay web2 data
            const web2Opts = {
                top: state.pageSize,
                skip: (state.page - 1) * state.pageSize,
                orderby: 'DateCreated desc',
            };
            if (state.search) web2Opts.search = state.search;
            if (state.quickFilter === 'vip') web2Opts.status = 'VIP';
            else if (state.quickFilter === 'warning') web2Opts.status = 'Warning';
            // 1D FIX (2026-06-12): kho web2_customers dùng enum 'Bom' (không phải
            // 'BomHang' TPOS legacy) — giá trị cũ exact-match 0 KH, chip luôn rỗng.
            else if (state.quickFilter === 'bomb') web2Opts.status = 'Bom';

            const web2Result = await window.PartnerCustomerApi.list(web2Opts);
            if (mySeq !== _loadSeq) return;
            const partners = web2Result?.value || [];
            const web2Total = web2Result?.count || partners.length;

            // 1D FIX (2026-06-12): dùng normPhone (84xxx → 0xxx) — ví server lưu
            // '0xxxxxxxxx', gửi raw '84...' overlay không match → KH hiện ví/nợ = 0 sai.
            const phones = partners
                .map((p) => normPhone(p.Phone || p.Mobile || ''))
                .filter((p) => p.length >= 9 && p.length <= 12);

            // Parallel: overlay + stats
            const [overlayResult, statsResult] = await Promise.all([
                phones.length > 0
                    ? fetchOverlay(phones).catch(() => ({ data: [] }))
                    : Promise.resolve({ data: [] }),
                fetchAggregateStats().catch(() => ({ data: state.stats })),
            ]);
            if (mySeq !== _loadSeq) return;

            const overlayMap = new Map();
            for (const o of overlayResult?.data || []) overlayMap.set(o.phone, o);

            // Merge WEB2 + overlay
            const merged = partners.map((p) => {
                const phone = normPhone(p.Phone || p.Mobile || ''); // key merge cùng chuẩn overlay
                const o = overlayMap.get(phone) || {};
                return {
                    phone,
                    name: p.Name || phone || '(không tên)',
                    customerId: p.Id,
                    web2Status: p.Status || 'Normal',
                    web2Active: p.Active !== false,
                    totalPurchased: o.totalPurchased || 0,
                    paidAmount: o.totalDeposited || 0,
                    returnedAmount: o.totalReturned || 0,
                    balance: o.balance || 0,
                    walletBalance: o.walletBalance || 0,
                    totalDeposited: o.totalDeposited || 0,
                    totalWithdrawn: o.totalWithdrawn || 0,
                    pbhCount: o.pbhCount || 0,
                    nativeCount: o.nativeCount || 0,
                };
            });

            // Client-side wallet filter (chỉ áp page hiện tại)
            let rows = merged;
            if (state.quickFilter === 'debt') {
                rows = rows.filter((r) => r.balance > 0);
            } else if (state.quickFilter === 'has_balance') {
                rows = rows.filter((r) => r.walletBalance > 0);
            }

            // Client-side sort cho wallet-related (WEB2 đã sort theo DateCreated)
            if (state.sort === 'balance-desc') {
                rows.sort((a, b) => b.balance - a.balance);
            } else if (state.sort === 'balance-asc') {
                rows.sort((a, b) => a.balance - b.balance);
            } else if (state.sort === 'wallet-desc') {
                rows.sort((a, b) => b.walletBalance - a.walletBalance);
            } else if (state.sort === 'total-desc') {
                rows.sort((a, b) => b.totalPurchased - a.totalPurchased);
            } else if (state.sort === 'paid-desc') {
                rows.sort((a, b) => b.paidAmount - a.paidAmount);
            } else if (state.sort === 'name-asc') {
                rows.sort((a, b) => String(a.name).localeCompare(String(b.name), 'vi'));
            }

            state.rows = rows;
            state.total = web2Total;
            state.stats = statsResult?.data || {};

            // Cache rows + web2Partners cho detail modal & QR
            for (const p of partners) {
                const phone = String(p.Phone || p.Mobile || '').replace(/\D/g, '');
                if (phone) state.web2Partners[phone] = p;
            }
            for (const r of state.rows) state.cache[r.phone] = r;

            state.loading = false;
            renderList();
        } catch (e) {
            if (mySeq !== _loadSeq) return;
            state.loading = false;
            state.rows = [];
            console.error('[CW4] load fail:', e.message);
            dom.list.innerHTML = `<div class="cw-error">Lỗi tải: ${escapeHtml(e.message)}</div>`;
            notify('Lỗi tải dữ liệu: ' + e.message, 'error');
        }
    }

    // ─── Refresh single wallet (SSE) ────────────────────────────────
    // For SSE deposit events: just re-fetch the current page so amounts
    // stay consistent (server-side aggregate). Cheap (~50 rows).
    const _reloadOnSse = debounce(() => load(), 800);
    async function refreshSinglePhone(phone) {
        if (!phone) return;
        // Trigger debounced page reload — server returns fresh aggregates.
        _reloadOnSse();
        // If detail modal open for this phone, update amount display from
        // single-wallet lookup (faster than full reload for modal).
        if (state.activePhone === phone && !dom.detailModal.hidden) {
            try {
                const w = await window.Web2WalletApi.getWallet(phone);
                const c = state.cache[phone];
                if (w && c) {
                    c.walletBalance = Number(w.balance || 0);
                    c.totalDeposited = Number(w.total_deposited || 0);
                    c.totalWithdrawn = Number(w.total_withdrawn || 0);
                    c.paidAmount = c.totalDeposited;
                    c.balance = (c.totalPurchased || 0) - c.paidAmount - (c.returnedAmount || 0);
                    dom.statPaid.textContent = fmtVnd(c.paidAmount);
                    dom.statBalance.textContent = fmtVnd(c.balance);
                    renderDetailExtras(phone);
                }
            } catch (e) {
                console.warn('[CW4] refreshSinglePhone modal fail:', e.message);
            }
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
            state.rows = [];
            state.total = 0;
            state.page = 1;
            state.cache = {};
            state.web2Partners = {};
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
            // 1D FIX (2026-06-12): payload đã strip PII từ S5 (chỉ {action, phone, ts})
            // — đọc msg.data.transaction.* luôn undefined nên toast cũ chết im lặng.
            // Toast generic + re-fetch số dư thật qua refreshSinglePhone.
            const phone = msg?.data?.phone;
            if (!phone) return;
            console.log('[CW4-SSE] web2:wallet:update', phone, msg?.data?.action);
            refreshSinglePhone(phone).catch(() => {});
            if (msg?.data?.action === 'update' || msg?.data?.action === 'manual-deposit') {
                notify(`💳 Ví Web 2.0 của ${phone} vừa cập nhật`, 'info');
            }
        });
        // Also subscribe to PBH changes (web2:fast-sale-orders → reload list)
        const reloadDebounced = debounce(() => load(), 1000);
        window.Web2SSE.subscribe('web2:fast-sale-orders', () => reloadDebounced());
        window.Web2SSE.subscribe('web2:native-orders', () => reloadDebounced());
    }

    // ─── CSV export (fetches up to 500 rows from server with current filter) ─
    async function exportCsv() {
        const btn = dom.exportCsvBtn;
        if (btn) btn.disabled = true;
        try {
            notify('Đang chuẩn bị CSV…', 'info');
            const result = await fetchAggregateWeb2Only({
                limit: 500,
                offset: 0,
                sort: state.sort,
                filter: state.quickFilter,
                search: state.search,
            });
            const items = result?.data || [];
            if (!items.length) {
                notify('Không có KH nào để xuất', 'warning');
                return;
            }
            const headers = [
                'Phone',
                'Name',
                'WEB2 Status',
                'Tổng mua',
                'Đã thu',
                'Đã trả',
                'Còn nợ',
                'Dư ví',
            ];
            const csvEscape = (v) => {
                const s = String(v ?? '');
                if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
                return s;
            };
            const lines = [headers.map(csvEscape).join(',')];
            for (const c of items) {
                const partner = state.web2Partners[c.phone];
                lines.push(
                    [
                        c.phone,
                        c.name || '',
                        partner?.StatusText || partner?.Status || '',
                        Math.round(c.totalPurchased || 0),
                        Math.round(c.paidAmount || 0),
                        Math.round(c.returnedAmount || 0),
                        Math.round(c.balance || 0),
                        Math.round(c.walletBalance || 0),
                    ]
                        .map(csvEscape)
                        .join(',')
                );
            }
            const csv = '﻿' + lines.join('\n');
            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            a.href = url;
            a.download = `vi-khach-hang-${state.quickFilter}-${stamp}.csv`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            notify(`Đã xuất ${items.length} KH (filter: ${state.quickFilter})`, 'success');
        } catch (e) {
            notify('Lỗi xuất CSV: ' + e.message, 'error');
        } finally {
            if (btn) btn.disabled = false;
        }
    }

    // ─── Wire UI ────────────────────────────────────────────────────
    function wireUi() {
        dom.search.addEventListener(
            'input',
            debounce(() => {
                state.search = dom.search.value.trim();
                state.page = 1;
                load();
            }, 350)
        );
        dom.sort.addEventListener('change', () => {
            state.sort = dom.sort.value;
            state.page = 1;
            load();
        });
        dom.refreshBtn?.addEventListener('click', load);
        dom.hardResetBtn?.addEventListener('click', hardReset);
        dom.exportCsvBtn?.addEventListener('click', exportCsv);

        if (dom.pageSize) {
            dom.pageSize.addEventListener('change', () => {
                state.pageSize = Number(dom.pageSize.value) || 50;
                state.page = 1;
                load();
            });
        }
        if (dom.pageButtons) {
            dom.pageButtons.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-page]');
                if (!btn || btn.disabled) return;
                const target = Number(btn.getAttribute('data-page'));
                if (!Number.isFinite(target)) return;
                state.page = Math.max(1, target);
                load();
            });
        }

        // Quick filter chips
        dom.chipsContainer?.addEventListener('click', (e) => {
            const btn = e.target.closest('.cw-chip[data-filter]');
            if (!btn) return;
            const f = btn.dataset.filter || 'all';
            // VIP/Warning/Bomb hiện chưa hỗ trợ server-side (cần join WEB2).
            // Giữ filter này local-only — load all + filter client-side. TODO.
            state.quickFilter = f;
            state.page = 1;
            load();
        });

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
            // Ctrl/⌘+K → focus search
            if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
                return;
            }
            // Esc → close modal HOẶC clear search
            if (e.key === 'Escape') {
                const openModal = document.querySelector('.sw-modal:not([hidden])');
                if (openModal) {
                    openModal.hidden = true;
                } else if (document.activeElement === dom.search && dom.search.value) {
                    dom.search.value = '';
                    renderList();
                }
            }
            // / → focus search (Gmail-style)
            if (
                e.key === '/' &&
                document.activeElement?.tagName !== 'INPUT' &&
                document.activeElement?.tagName !== 'TEXTAREA'
            ) {
                e.preventDefault();
                dom.search?.focus();
                dom.search?.select();
            }
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
