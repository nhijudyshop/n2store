// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// Web2CustomerWalletApp — API module (data fetching / aggregation / normalization).
// Hybrid WEB2 (PartnerCustomerApi) + Web 2.0 API (overlay/aggregate/stats/QR).
// Extends shared namespace window.W2CW.
// =====================================================================

(function (global) {
    'use strict';

    const W2CW = global.W2CW || (global.W2CW = {});
    const { PROXY, FALLBACK, jsonFetch, normPhone, EXCLUDED_PBH_STATES } = W2CW;

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
        // /customers/by-phone/:phone/orders nay gate requireWeb2AuthSoft (PII) → gửi
        // x-web2-token (ENFORCE prod), nếu không 401. (audit 2026-06-30)
        const _h = window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {};
        try {
            const data = await jsonFetch(
                `${PROXY}/api/web2/customers/by-phone/${encodeURIComponent(phone)}/orders?limit=100`,
                { headers: _h }
            );
            return data?.data || data || { native: [], pbh: [] };
        } catch (e) {
            try {
                const data = await jsonFetch(
                    `${FALLBACK}/api/web2/customers/by-phone/${encodeURIComponent(phone)}/orders?limit=100`,
                    { headers: _h }
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

    // ----- QR VietQR fetch -----
    // 1 nguồn base-URL = WEB2_CONFIG (web2-auth.js load trước); literal chỉ là fallback.
    const QR_BASE =
        (window.API_CONFIG?.WORKER_URL ||
            window.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev') + '/api/web2/customer-wallet';
    const QR_DIRECT_BASE =
        (window.WEB2_CONFIG?.WEB2_API || 'https://web2-api-kv04.onrender.com') +
        '/api/web2/customer-wallet';
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

    // Expose API on W2CW
    W2CW.api = {
        AGGREGATE_BASE,
        AGGREGATE_FALLBACK,
        fetchOverlay,
        fetchAggregateWeb2Only,
        fetchAggregateStats,
        fetchPbhListForPhone,
        fetchPbhList,
        fetchNativeOrders,
        fetchWeb2Wallets,
        fetchAllWeb2Wallets,
        fetchWalletReturns,
        fetchWeb2ReturnAmountsBatch,
        normalizeOrder,
        aggregateFromPbh,
        mergeNativeOrders,
        QR_BASE,
        QR_DIRECT_BASE,
        qrFetch,
    };
})(window);
