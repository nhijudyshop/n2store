// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Kho SP panel — STATE + constants + normalize helpers + data loaders + filter.
// Module 1/4. Tạo shared namespace global.__PancakeInvPanelNS; các module sau
// (render / actions / init) gắn function của mình lên NS và đọc deps qua NS.
//
// Logic gốc (giữ nguyên từ inventory-panel.js):
//   - Tabs lấy từ so-order Postgres (Web2SoOrder) → data.tabs[].label/name (= vùng).
//   - Filter: SP có region === tabName (exact, case-insensitive).
//   - Search: tokenize input, AND-match qua code/name/variant (ASCII normalize).

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;

    // Shared namespace: carrier cho STATE + constants + mọi function dùng chéo
    // giữa các module (mỗi <script> là 1 scope riêng, không share closure được).
    const NS = global.__PancakeInvPanelNS || (global.__PancakeInvPanelNS = {});
    if (NS._stateReady) return;
    NS._stateReady = true;

    // 1 nguồn API_CONFIG.WORKER_URL (fallback literal nếu chưa load).
    const PROXY =
        (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API = `${PROXY}/api/v2`;
    const LS_TAB_KEY = 'web2_pancake_active_tab';
    const LS_SHOW_OOS_KEY = 'web2_pancake_show_oos'; // toggle hiện SP hết hàng (stock=0)
    const DEFAULT_TAB = 'kho'; // user: mặc định là Kho

    const STATE = {
        tabs: [], // ['HÀ NỘI', 'HƯƠNG CHÂU', ...]
        activeTab: 'ALL', // 'ALL' or tab name
        searchQuery: '',
        showOutOfStock: localStorage.getItem(LS_SHOW_OOS_KEY) === '1', // mặc định ẩn SP hết hàng
        products: [], // full list từ /api/web2-products/list
        filtered: [], // sau khi apply tab + search
        cartCounts: {}, // { commentId: { items, qty } }
        cartByCmt: new Map(), // commentId → items array (cache for popovers)
    };

    // ─────────────────────────────────────────────────────────
    // Normalize helpers
    // ─────────────────────────────────────────────────────────
    function asciiUpper(s) {
        return String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .replace(/Đ/g, 'D')
            .toUpperCase();
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (s == null) return '';
        const d = document.createElement('div');
        d.textContent = String(s);
        return d.innerHTML;
    }
    function fmtPrice(n) {
        return (Number(n) || 0).toLocaleString('vi-VN') + 'đ';
    }
    function _relTime(d) {
        if (!d) return '';
        const date = d instanceof Date ? d : new Date(d);
        const diff = (Date.now() - date.getTime()) / 1000;
        if (diff < 60) return 'vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ';
        if (diff < 86400 * 7) return Math.floor(diff / 86400) + ' ngày';
        return date.toLocaleDateString('vi-VN');
    }

    // ─────────────────────────────────────────────────────────
    // Load NCC tabs từ so-order Postgres (C8 — Web2SoOrder, thay Firestore)
    // ─────────────────────────────────────────────────────────
    async function loadTabsFromSoOrder() {
        try {
            if (!window.Web2SoOrder || !window.Web2SoOrder.load) return [];
            const data = await window.Web2SoOrder.load();
            if (!data) return [];
            const names = [];
            const seen = new Set();
            for (const tab of data.tabs || []) {
                const lbl = (tab.label || tab.name || '').trim();
                if (lbl && !seen.has(lbl)) {
                    seen.add(lbl);
                    names.push(lbl);
                }
            }
            return names;
        } catch (e) {
            console.warn('[InventoryPanel] load tabs fail:', e.message);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────
    // Load products từ /api/web2-products/list (paged unwrap)
    // ─────────────────────────────────────────────────────────
    async function loadProducts() {
        try {
            const r = await fetch(PROXY + '/api/web2-products/list?limit=2000', {
                credentials: 'include',
            });
            const d = await r.json();
            return d.products || d.items || [];
        } catch (e) {
            console.warn('[InventoryPanel] load products fail:', e.message);
            return [];
        }
    }

    // ─────────────────────────────────────────────────────────
    // Filter logic
    // ─────────────────────────────────────────────────────────
    function applyFilter() {
        const q = asciiUpper(STATE.searchQuery).trim();
        const tokens = q ? q.split(/\s+/).filter(Boolean) : [];
        const tabUpper = STATE.activeTab !== 'ALL' ? asciiUpper(STATE.activeTab) : null;

        STATE.filtered = STATE.products.filter((p) => {
            if (p.isActive === false) return false;
            // Bỏ SP hết hàng (SL=0) khỏi panel — user request không cho drag.
            // Có toggle bật để vẫn hiện SP hết hàng khi cần.
            if (!STATE.showOutOfStock) {
                const stock = Number(p.stock) || 0;
                if (stock <= 0) return false;
            }
            // Tab filter: exact region. Sổ Order tabs = vùng/khu (HÀ NỘI, HƯƠNG
            // CHÂU) → khớp p.region, KHÔNG phải p.supplier (xưởng/NCC cụ thể).
            if (tabUpper) {
                const reg = asciiUpper(p.region || '');
                if (reg !== tabUpper) return false;
            }
            // Search tokens AND-match
            if (tokens.length) {
                const hay =
                    asciiUpper(p.code || '') +
                    ' ' +
                    asciiUpper(p.name || '') +
                    ' ' +
                    asciiUpper(p.variant || '');
                for (const t of tokens) {
                    if (!hay.includes(t)) return false;
                }
            }
            return true;
        });
        NS.renderProductList();
    }

    // Anti-lag cache: O(1) lookup commentId → comment thay vì find() O(N).
    // Rebuild khi LiveState.comments thay đổi (track qua length + first/last id).
    const _cmtIndex = { sig: null, map: null };
    function _getCmtMap() {
        const st = global.LiveState;
        const comments = st && Array.isArray(st.comments) ? st.comments : [];
        const sig = comments.length
            ? `${comments.length}:${comments[0]?.id || ''}:${comments[comments.length - 1]?.id || ''}`
            : '0';
        if (_cmtIndex.sig === sig && _cmtIndex.map) return _cmtIndex.map;
        const m = new Map();
        for (const c of comments) {
            if (c?.id) m.set(c.id, c);
        }
        _cmtIndex.sig = sig;
        _cmtIndex.map = m;
        return m;
    }

    // 2026-06-01: enrich SĐT + địa chỉ từ 3 nguồn (ưu tiên giảm dần):
    // (1) Inline input user vừa sửa thủ công (#phone-{fromId} / #addr-{fromId})
    // (2) Partner cache Live đã load (state.partnerCache.get(fromId).Phone / .Street)
    // (3) Field cũ trên comment object (c.phone / c.address — hiếm)
    // → đảm bảo native_order tạo từ drag-drop luôn có SĐT/địa chỉ nếu KH đã có data
    // bên Live. Backend /from-comment vẫn fallback FB-ID chain lookup nếu vẫn rỗng.
    function _resolveLiveCustomer(commentId, row) {
        const cust = { id: null, name: null, phone: null, address: null };
        try {
            const map = _getCmtMap();
            const c = map.get(commentId);
            if (c) {
                cust.id = c.from?.id || null;
                cust.name =
                    c.from?.name ||
                    row?.querySelector?.('.live-conv-name, .from-name')?.textContent?.trim() ||
                    null;
                // Source 1: inline inputs (user just typed)
                const inlinePhone = row?.querySelector?.(`input[id^="phone-"]`)?.value?.trim();
                const inlineAddr = row?.querySelector?.(`input[id^="addr-"]`)?.value?.trim();
                // Source 2: Live partner cache (loaded by loadPartnerInfoForComments)
                const partner = cust.id ? global.LiveState?.partnerCache?.get(cust.id) : null;
                cust.phone =
                    inlinePhone ||
                    partner?.Phone ||
                    partner?.Mobile ||
                    c.phone ||
                    c.customer_phone ||
                    null;
                cust.address =
                    inlineAddr ||
                    partner?.Street ||
                    [partner?.Street, partner?.Ward, partner?.District, partner?.City]
                        .filter(Boolean)
                        .join(', ') ||
                    c.address ||
                    null;
                // Normalize phone: digits-only, keep last 10 (VN convention)
                if (cust.phone) {
                    const digits = String(cust.phone).replace(/\D/g, '');
                    cust.phone = digits.length >= 10 ? digits.slice(-10) : digits;
                }
            }
        } catch {}
        return cust;
    }

    function _user() {
        const u = global.AuthManager?.getCurrentUser?.() || {};
        return { id: u.uid || u.email || null, name: u.displayName || u.email || null };
    }

    function _resolveCommitContext(commentId, row, customer) {
        const ctx = {
            fbUserId: customer?.id || null,
            fbUserName: customer?.name || null,
            phone: customer?.phone || '',
            address: customer?.address || '',
            fbPageId: null,
            fbPageName: null,
            fbPostId: null,
            fbCommentId: commentId || null,
            liveCampaignId: null,
            liveCampaignName: null,
            message: '',
        };
        try {
            const st = global.LiveState;
            const c = _getCmtMap().get(commentId);
            if (c) {
                const pageObj = c._pageObj || st.selectedPage;
                const camp = c._campaignId
                    ? st.liveCampaigns?.find((x) => x.Id === c._campaignId)
                    : st.selectedCampaign;
                ctx.fbPageId = pageObj?.Facebook_PageId || pageObj?.FacebookPageId || null;
                ctx.fbPageName = pageObj?.Name || pageObj?.PageName || null;
                ctx.fbPostId = camp?.Facebook_LiveId || null;
                ctx.liveCampaignId = camp?.Id ? String(camp.Id) : null;
                ctx.liveCampaignName = camp?.Name || null;
                ctx.message = c.message || '';
            }
        } catch {}
        return ctx;
    }

    // ── Export lên shared namespace ──
    NS.PROXY = PROXY;
    NS.API = API;
    NS.LS_TAB_KEY = LS_TAB_KEY;
    NS.LS_SHOW_OOS_KEY = LS_SHOW_OOS_KEY;
    NS.DEFAULT_TAB = DEFAULT_TAB;
    NS.STATE = STATE;
    NS.asciiUpper = asciiUpper;
    NS.escapeHtml = escapeHtml;
    NS.fmtPrice = fmtPrice;
    NS._relTime = _relTime;
    NS.loadTabsFromSoOrder = loadTabsFromSoOrder;
    NS.loadProducts = loadProducts;
    NS.applyFilter = applyFilter;
    NS._getCmtMap = _getCmtMap;
    NS._resolveLiveCustomer = _resolveLiveCustomer;
    NS._user = _user;
    NS._resolveCommitContext = _resolveCommitContext;
    // _popCleanup: shared mutable (set/đọc giữa render & actions) → để trên NS.
    NS._popCleanup = null;
})(typeof window !== 'undefined' ? window : globalThis);
