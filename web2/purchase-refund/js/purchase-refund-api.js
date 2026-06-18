// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// purchase-refund-api.js — data fetch + supplier-wallet mutation.
// Choke point fetchJson gắn x-web2-token cho mọi call. loadList() đọc DS phiếu;
// loadSoOrderReceivedItems() join so-order ∩ web2_products thành aggregates
// theo ĐƠN (NCC+shipment). updateSupplierWallet() ghi ledger ví NCC.

(function () {
    'use strict';

    const PR = (window.PurchaseRefund = window.PurchaseRefund || {});
    const { GENERIC_API } = PR.const;
    const { STATE } = PR.state;
    const { notify } = PR.util;

    // ---------- API ----------
    // ENFORCE-PREP (2026-06-12): /api/web2/purchase-refund/* (generic
    // create/update/delete) sắp gate WEB2_AUTH_ENFORCE=1. SM_API
    // /api/purchase-refund/* không gate nhưng thêm header vô hại — gắn ở
    // choke point fetchJson cho mọi call. Page load web2-auth.js →
    // Web2Auth.authHeaders; không load → đọc thẳng localStorage 'web2_auth'.
    function _authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    async function fetchJson(url, opts) {
        // ENFORCE-PREP (2026-06-12): gắn x-web2-token mặc định.
        const o = { ...(opts || {}), headers: _authHeaders(opts?.headers) };
        const r = await fetch(url, o);
        const text = await r.text();
        let data;
        try {
            data = text ? JSON.parse(text) : {};
        } catch {
            data = { _raw: text };
        }
        if (!r.ok) throw new Error(data?.error || `HTTP ${r.status}`);
        return data;
    }

    async function loadList() {
        try {
            const data = await fetchJson(`${GENERIC_API}/list?limit=200`);
            const items = data?.items || data?.records || data?.data || [];
            STATE.items = items.map((it) => ({
                code: it.code,
                name: it.name,
                createdAt: it.created_at || it.createdAt,
                ...(it.data || {}),
                _row: it,
            }));
            PR.render.renderList();
        } catch (e) {
            notify(`Tải DS phiếu thất bại: ${e.message}`, 'error');
        }
    }

    // ---------- Picker / Section A data source ----------
    //
    // P1 2026-05-30 (refactor): user ask "sản phẩm đã NHẬN HÀNG bên so-order
    // sẽ có danh sách bên trả hàng NCC". Picker giờ source từ Firestore
    // `web2_so_order/main` (purchase context — NCC + SP user đặt), cross-ref
    // với Web2ProductsCache để biết stock thực (= max refundable qty).
    //
    // Filter: chỉ rows có matching web2_product VÀ stock > 0 (= đã nhận hàng).
    // Group by supplier (từ so-order row.supplier — NCC user thực sự mua từ,
    // KHÔNG dùng web2_products.supplier vì field đó chỉ giữ NCC đầu tiên).
    //
    // Schema mỗi item: { supplier, code, name, variant, orderedQty, stock,
    //                    price, sources: [{tab, ship, qty}] }

    /**
     * Load so-order data từ localStorage (cùng domain) → fallback Firestore.
     * Join với Web2ProductsCache. Trả về aggregates by (supplier, code) cho
     * SP đã nhận hàng (stock>0).
     *
     * Lý do localStorage trước: so-order là local-first; data trong localStorage
     * mới nhất, Firestore có thể trễ vì debounced push. Same-domain key
     * `soOrder_v1` accessible cross-page.
     */
    async function loadSoOrderReceivedItems() {
        const cache = window.Web2ProductsCache;
        if (!cache) return { items: [], err: 'Web2ProductsCache chưa load' };

        let data = null;
        let source = 'none';
        // P1 2026-05-30: soOrder_v1 chuyển sang IDB qua Web2IdbStore.
        // Đọc IDB trước, fallback localStorage (legacy nếu chưa migrate).
        if (window.Web2IdbStore) {
            try {
                const store = window.Web2IdbStore.open('so_order_storage', {
                    migrateFromLs: 'soOrder_v1',
                });
                const idbData = await store.get();
                if (idbData) {
                    data = idbData;
                    source = 'idb';
                }
            } catch (e) {
                console.warn('[picker] IDB read fail:', e.message);
            }
        }
        if (!data) {
            try {
                const raw = localStorage.getItem('soOrder_v1');
                if (raw) {
                    data = JSON.parse(raw);
                    source = 'localStorage';
                }
            } catch (e) {
                console.warn('[picker] localStorage parse fail:', e.message);
            }
        }

        // Fallback Postgres (nguồn chuẩn từ C8) nếu cả IDB + localStorage trống.
        // 2026-06-14 (Hướng D): bỏ fallback Firestore frozen — so-order đã chuyển
        // sang Postgres, đọc qua shared reader Web2SoOrder.load() (có auth header).
        // Đây là consumer C8 bị bỏ sót khi fix data-flow (đã sửa debt/wallet/products).
        if (!data || !Array.isArray(data.tabs) || data.tabs.length === 0) {
            if (!window.Web2SoOrder?.load) {
                return { items: [], err: 'Web2SoOrder reader chưa load + local trống' };
            }
            try {
                const pgData = await window.Web2SoOrder.load();
                if (pgData && Array.isArray(pgData.tabs)) {
                    data = pgData;
                    source = 'postgres';
                }
            } catch (e) {
                return { items: [], err: `Sổ Order (Postgres): ${e.message}` };
            }
        }
        if (!data) return { items: [], err: null };
        console.log(`[picker] so-order loaded from ${source}`);
        const norm = cache._normalize;

        // HashMap O(1) lookup: normalize(name|variant) → product
        const productByKey = new Map();
        for (const p of cache.getAll()) {
            const key = norm(p.name) + '|' + norm(p.variant || '');
            if (!productByKey.has(key)) productByKey.set(key, p);
        }

        // Aggregate so-order rows by (supplier, code) — sum qty across shipments
        const agg = new Map();
        for (const tab of data.tabs || []) {
            for (const sh of tab.shipments || []) {
                for (const r of sh.rows || []) {
                    const supplier = (r.supplier || '').trim();
                    const productName = (r.productName || '').trim();
                    if (!supplier || !productName) continue;
                    const variant = (r.variant || '').trim();
                    const key = norm(productName) + '|' + norm(variant);
                    const matched = productByKey.get(key);
                    if (!matched) continue; // SP chưa sync web2_products
                    const stock = Number(matched.stock || 0);
                    if (stock <= 0) continue; // chưa nhận hàng → không trả được
                    // 2026-06-07: tách theo ĐƠN (shipment/đợt) — mỗi lần "Tạo Đơn
                    // Hàng" trong Sổ Order = 1 đơn riêng, KHÔNG gộp chung NCC. SP
                    // tạo ở đợt sau → nhóm riêng dù cùng NCC. aggKey gồm sh.id.
                    const aggKey = `${supplier}::${sh.id}::${matched.code}`;
                    if (!agg.has(aggKey)) {
                        agg.set(aggKey, {
                            aggId: aggKey,
                            supplier,
                            shipmentId: sh.id,
                            shipBatch: sh.batch || '',
                            shipDate: sh.date || '',
                            tabLabel: tab.label || tab.id,
                            code: matched.code,
                            name: matched.name,
                            variant: matched.variant || variant,
                            // Ảnh SP tham chiếu thẳng từ Kho SP (Web2ProductsCache).
                            imageUrl: matched.imageUrl || '',
                            stock,
                            price: Number(matched.price || r.price || 0),
                            orderedQty: 0,
                            sources: [],
                        });
                    }
                    const entry = agg.get(aggKey);
                    entry.orderedQty += Number(r.qty || 0);
                    entry.sources.push({
                        tab: tab.label || tab.id,
                        ship: sh.id,
                        qty: Number(r.qty || 0),
                    });
                }
            }
        }
        return { items: Array.from(agg.values()), err: null };
    }

    /**
     * Add transaction type='return' to supplier wallet → giảm balance.
     * Wallet là local-first (localStorage `supplierWallet_v1` + Firestore
     * `web2_supplier_wallet/main`). Pattern: load → mutate → push.
     */
    async function updateSupplierWallet(supplier, opts) {
        if (!window.SupplierWalletStorage) {
            console.warn('[quick refund] SupplierWalletStorage missing — skip wallet');
            return;
        }
        const SW = window.SupplierWalletStorage;
        try {
            // Pull latest từ Firestore (so other tabs/máy đã mutate cũng sync)
            await SW.Sync.init();
        } catch (e) {
            console.warn('[quick refund] wallet sync init fail:', e.message);
        }
        // C6 fix 2026-06-11: SW.load() là async (IDB read) — thiếu await làm
        // state = Promise → addTransaction TypeError → ví NCC không bao giờ ghi.
        const state = await SW.load();
        const productLabel = opts.variant
            ? `${opts.productName} (${opts.variant})`
            : opts.productName;
        const byUser = opts.userName ? ` · bởi ${opts.userName}` : '';
        const note = `Trả ${opts.qty}× ${productLabel} — ${opts.refundCode} (${opts.method})${byUser}`;
        // ĐỢT E (2026-06-12): addTransaction giờ POST server ledger (await,
        // idempotent theo txId = refundCode — retry không ghi đôi). Lỗi →
        // throw cho caller (submitQuickRefund đã có try/catch ví riêng, toast
        // warning "phiếu OK + ví fail"). Hết fire-and-forget Sync.push.
        await SW.addTransaction(state, supplier, {
            type: 'return',
            amount: opts.amount,
            note,
            txId: `tx-refund-${opts.refundCode}`,
            ref: {
                refundCode: opts.refundCode,
                qty: opts.qty,
                method: opts.method,
                userId: opts.userId || null,
                userName: opts.userName || null,
            },
            performedBy: opts.userName || null,
        });
    }

    PR.api = {
        _authHeaders,
        fetchJson,
        loadList,
        loadSoOrderReceivedItems,
        updateSupplierWallet,
    };
})();
