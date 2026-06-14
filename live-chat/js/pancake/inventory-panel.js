// #Note: WEB2.0 module. Kho SP panel — tab cùng cấp với Chat trong Pancake column.
//
// Logic:
//   - Tabs lấy từ Firestore web2_so_order/main → data.tabs[].label/name.
//   - Filter: SP có supplier === tabName (exact, case-insensitive).
//   - Search: tokenize input, AND-match qua code/name/variant (ASCII normalize).
//   - Drag source: mỗi card SP có draggable=true; setData('application/x-web2-product', JSON).
//   - Drop target: comment rows đã có đơn (data-conv-id) ở .pk-conversation-list.
//   - Cart: POST /api/web2/cart/:commentId/add — sync qua SSE 'web2:cart' multi-tab.
//
// State khi switch tab Chat↔Kho lưu localStorage 'web2_pancake_active_tab' (default 'kho').

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;

    const API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2';
    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
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
            // Tab filter: exact supplier
            if (tabUpper) {
                const sup = asciiUpper(p.supplier || '');
                if (sup !== tabUpper) return false;
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
        renderProductList();
    }

    // ─────────────────────────────────────────────────────────
    // Render UI
    // ─────────────────────────────────────────────────────────
    function renderShell(container) {
        container.innerHTML = `
            <div class="inv-panel">
                <div class="inv-search-wrap">
                    <input id="invSearch" placeholder="🔍 Tìm: ao bi den, quan dai 32…" />
                    <button id="invRefresh" title="Tải lại từ DB">↻</button>
                </div>
                <div class="inv-tabs" id="invTabs"></div>
                <div class="inv-stats">
                    <span id="invStats"></span>
                    <label class="inv-oos-toggle" title="Hiện cả SP hết hàng (tồn = 0)">
                        <input type="checkbox" id="invShowOos" ${STATE.showOutOfStock ? 'checked' : ''} />
                        <span>Hiện SP hết hàng</span>
                    </label>
                </div>
                <div class="inv-list" id="invList">
                    <div class="inv-loading">Đang tải kho SP…</div>
                </div>
            </div>
        `;
        // Debounce 150ms: tránh filter 2000 SP + rebuild 200 card mỗi keystroke.
        let _searchTimer = null;
        document.getElementById('invSearch').addEventListener('input', (e) => {
            STATE.searchQuery = e.target.value || '';
            clearTimeout(_searchTimer);
            _searchTimer = setTimeout(applyFilter, 150);
        });
        document.getElementById('invRefresh').addEventListener('click', refresh);
        document.getElementById('invShowOos').addEventListener('change', (e) => {
            STATE.showOutOfStock = e.target.checked;
            localStorage.setItem(LS_SHOW_OOS_KEY, STATE.showOutOfStock ? '1' : '0');
            applyFilter();
        });
    }

    function renderTabs() {
        const root = document.getElementById('invTabs');
        if (!root) return;
        const html = [
            '<button class="inv-tab' +
                (STATE.activeTab === 'ALL' ? ' active' : '') +
                '" data-tab="ALL">Tất cả</button>',
        ];
        for (const t of STATE.tabs) {
            html.push(
                `<button class="inv-tab${STATE.activeTab === t ? ' active' : ''}" data-tab="${escapeHtml(t)}">${escapeHtml(t)}</button>`
            );
        }
        root.innerHTML = html.join('');
        root.querySelectorAll('.inv-tab').forEach((btn) => {
            btn.addEventListener('click', () => {
                STATE.activeTab = btn.dataset.tab;
                renderTabs();
                applyFilter();
            });
        });
    }

    function renderProductList() {
        const root = document.getElementById('invList');
        const stats = document.getElementById('invStats');
        if (!root) return;
        if (stats) stats.textContent = `${STATE.filtered.length} / ${STATE.products.length} SP`;
        if (!STATE.filtered.length) {
            root.innerHTML = '<div class="inv-empty">Không có SP nào khớp</div>';
            return;
        }
        // Render limit first 200 để fast scroll
        const list = STATE.filtered.slice(0, 200);
        root.innerHTML = list
            .map((p) => {
                const productJson = escapeHtml(
                    JSON.stringify({
                        code: p.code,
                        name: p.name,
                        imageUrl: p.imageUrl || p.image_url || null,
                        price: Number(p.price) || 0,
                        variant: p.variant || '',
                        supplier: p.supplier || '',
                    })
                );
                const img = p.imageUrl || p.image_url;
                const imgHtml = img
                    ? `<img class="inv-img" src="${escapeHtml(img)}" alt="" loading="lazy" onerror="this.style.display='none'">`
                    : `<div class="inv-img-placeholder">📦</div>`;
                const stock = Number(p.stock) || 0;
                const isOos = stock <= 0;
                // stock tier badge màu: hết / nguy cấp ≤5 / sắp hết ≤15 / còn
                const tier = isOos ? 'zero' : stock <= 5 ? 'crit' : stock <= 15 ? 'low' : '';
                return `<div class="inv-card${isOos ? ' oos' : ''}" draggable="true" data-product='${productJson}'>
                    <div class="inv-card-imgwrap">
                        ${imgHtml}
                    </div>
                    <div class="inv-card-body">
                        <div class="inv-card-code">${escapeHtml(p.code)}</div>
                        <div class="inv-card-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
                        <div class="inv-card-meta">
                            <span class="inv-card-price">${fmtPrice(p.price)}</span>
                            ${p.variant ? `<span class="inv-card-variant">${escapeHtml(p.variant)}</span>` : ''}
                            <span class="inv-card-stock${tier ? ' ' + tier : ''}">SL ${stock}</span>
                        </div>
                    </div>
                    ${isOos ? '' : `<button class="inv-card-add" title="Thêm SP vào ô soạn tin" data-add-product='${productJson}'><i data-lucide="plus"></i></button>`}
                </div>`;
            })
            .join('');
        // Báo truncate khi list bị cắt 200 — tránh user tưởng kho chỉ có nhiêu đó.
        if (STATE.filtered.length > 200) {
            root.insertAdjacentHTML(
                'beforeend',
                `<div class="inv-empty" style="padding:8px 10px;font-size:11.5px">Hiện 200/${STATE.filtered.length} SP — gõ thêm từ khóa để thu hẹp</div>`
            );
        }
        attachDragSources();
        attachAddButtons();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // ─────────────────────────────────────────────────────────
    // Tap-to-add: nút "+" trên card → chèn SP vào ô soạn tin của hội thoại
    // đang mở (mobile-friendly thay drag). Drag (drop vào live-comment) vẫn giữ.
    // ─────────────────────────────────────────────────────────
    let _addDelegated = false;
    function attachAddButtons() {
        if (_addDelegated) return;
        _addDelegated = true;
        const root = document.getElementById('invList');
        if (!root) return;
        root.addEventListener('click', (e) => {
            const btn = e.target.closest('.inv-card-add');
            if (!btn) return;
            e.stopPropagation();
            let product;
            try {
                product = JSON.parse(btn.getAttribute('data-add-product'));
            } catch {
                return;
            }
            _addProductToComposer(product, btn);
        });
    }

    // Chèn dòng SP (mã · tên · giá) vào textarea composer của Web2ChatPanel đang mở.
    function _addProductToComposer(product, btn) {
        const ta = document.querySelector('#pkChatWindow [data-w2cp="input"]');
        if (!ta) {
            if (global.notificationManager?.show)
                global.notificationManager.show('Mở 1 hội thoại để thêm SP', 'warning');
            return;
        }
        const line = `${product.code} · ${product.name}${product.price ? ' · ' + fmtPrice(product.price) : ''}`;
        ta.value = (ta.value ? ta.value.replace(/\s*$/, '') + '\n' : '') + line;
        ta.dispatchEvent(new Event('input', { bubbles: true }));
        ta.focus();
        // feedback pop
        if (btn) {
            btn.classList.add('pk-added');
            setTimeout(() => btn.classList.remove('pk-added'), 200);
        }
        if (global.navigator?.vibrate) global.navigator.vibrate(10);
    }

    // ─────────────────────────────────────────────────────────
    // Drag source
    // ─────────────────────────────────────────────────────────
    // Event delegation: 1 listener trên #invList thay vì N listener/card +
    // re-attach mỗi lần filter render (trước đây ~400 listener churn). dragstart
    // bubble; `.inv-card *` có pointer-events:none nên e.target = card.
    let _dragDelegated = false;
    function attachDragSources() {
        if (_dragDelegated) return;
        const root = document.getElementById('invList');
        if (!root) return;
        _dragDelegated = true;
        root.addEventListener('dragstart', (e) => {
            const card = e.target.closest('.inv-card');
            if (!card) return;
            e.dataTransfer.setData('application/x-web2-product', card.getAttribute('data-product'));
            e.dataTransfer.effectAllowed = 'copy';
            card.classList.add('dragging');
            // Báo comment-list HOÃN re-render trong lúc kéo: enrichment/SSE churn
            // DOM (replaceWith / innerHTML='' / outerHTML) hủy drop target dưới con
            // trỏ → drop trượt hoặc rơi nhầm dòng + giật. dragend xả lại (live-comment-list).
            if (global.LiveState) global.LiveState._dragActive = true;
        });
        root.addEventListener('dragend', (e) => {
            const card = e.target.closest('.inv-card');
            if (card) card.classList.remove('dragging');
            if (global.LiveState) global.LiveState._dragActive = false;
        });
    }

    // ─────────────────────────────────────────────────────────
    // Drop target: CHỈ Live COMMENTS panel (left column).
    // Pancake conv rows KHÔNG nhận drop (user explicit request).
    // ─────────────────────────────────────────────────────────
    let _dropDelegated = false;
    function attachDropTargets() {
        // Guard 1-lần như _dragDelegated: init() có 2 call site độc lập (panel
        // Kho SP phải ở index.html + mode "Kho" cột Pancake ở mode-switcher),
        // mỗi nơi guard riêng → mở cả 2 là listener document đăng ký ×2 →
        // 1 drop = add ×2 SL (bug 2026-06-12).
        if (_dropDelegated) return;
        _dropDelegated = true;
        // Anti-lag: dragover fires ~60×/s while dragging. Skip redundant work
        // khi hover stay trên cùng row (chỉ touch DOM khi đổi row).
        let _lastHoverRow = null;
        document.addEventListener('dragover', (e) => {
            const row = e.target.closest('.live-conversation-item');
            if (!row) {
                if (_lastHoverRow) {
                    _lastHoverRow.classList.remove('inv-drop-hover');
                    _lastHoverRow = null;
                }
                return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            if (_lastHoverRow !== row) {
                if (_lastHoverRow) _lastHoverRow.classList.remove('inv-drop-hover');
                row.classList.add('inv-drop-hover');
                _lastHoverRow = row;
            }
        });
        document.addEventListener('dragleave', (e) => {
            const row = e.target.closest('.live-conversation-item');
            if (row && row === _lastHoverRow && !row.contains(e.relatedTarget)) {
                row.classList.remove('inv-drop-hover');
                _lastHoverRow = null;
            }
        });
        document.addEventListener('dragend', () => {
            if (_lastHoverRow) {
                _lastHoverRow.classList.remove('inv-drop-hover');
                _lastHoverRow = null;
            }
            // Belt-and-suspenders: cờ luôn được tắt khi kết thúc kéo (kể cả khi
            // drag bị hủy ngoài vùng drop). comment-list cũng tự tắt + xả ở dragend.
            if (global.LiveState) global.LiveState._dragActive = false;
        });
        document.addEventListener('drop', (e) => {
            const row = e.target.closest('.live-conversation-item');
            if (!row) return;
            row.classList.remove('inv-drop-hover');
            if (_lastHoverRow === row) _lastHoverRow = null;
            e.preventDefault();
            const json = e.dataTransfer.getData('application/x-web2-product');
            if (!json) return;
            let product;
            try {
                product = JSON.parse(json);
            } catch {
                return;
            }
            const commentId = row.dataset.commentId;
            if (!commentId) return;
            const customer = _resolveLiveCustomer(commentId, row);
            // Cart gắn theo CUSTOMER (fbUserId), không phải comment_id.
            // 1 khách có nhiều comment → share 1 cart. Fallback commentId nếu thiếu.
            const groupKey = customer.id || commentId;
            // UI-first: addToCart sync return ngay, backend chạy background.
            addToCart(groupKey, product, customer, commentId);
        });
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

    // ─────────────────────────────────────────────────────────
    // Cart API — Optimistic UI: cập nhật badge NGAY khi drop, rollback nếu fail.
    // Drop vào comment chưa có đơn → tự tạo đơn (entry đầu tiên trong cart_items).
    // Mỗi action add → show toast "Hoàn tác" 5s, click hoàn tác → remove ngay.
    // ─────────────────────────────────────────────────────────
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

    // groupKey = customerId (fbUserId) — cart gắn theo khách (URL param + cart key).
    // commentIdMeta = comment_id thật của row vừa drop — dùng để resolve FB page/post
    // từ LiveState.comments + truyền xuống native_order.fb_comment_id (audit + chat link).
    //
    // SAU REFACTOR 2026-05-22: backend /add ghi thẳng vào native_orders.products
    // ngay → không còn commit timer. 5s undo chỉ là UX window — undo = call /remove.
    // Pattern UI-first: optimistic badge + toast NGAY → backend chạy background.
    // Backend lỗi → rollback badge + remove toast optimistic + show error toast.
    // KHÔNG async/await ở caller path (drop event handler) — return ngay tức thì.
    function addToCart(groupKey, product, customer, commentIdMeta) {
        const commentId = groupKey;
        const wasEmpty = !(STATE.cartCounts[commentId]?.qty > 0);
        const prev = STATE.cartCounts[commentId] || { items: 0, qty: 0 };
        // Step 1 — Optimistic UI INSTANT
        STATE.cartCounts[commentId] = {
            items: prev.items + 1,
            qty: prev.qty + 1,
        };
        _renderBadgeFor(commentId);
        const toast = _showUndoToast({
            title: wasEmpty
                ? `✓ Tạo đơn mới + thêm "${product.code}"`
                : `✓ Thêm "${product.code}" vào đơn`,
            onUndo: () => {
                // Undo có thể fire trước khi /add response về. removeFromCart
                // gửi POST /remove độc lập — backend xử lý nếu product đã tồn
                // tại, no-op nếu chưa. Idempotent qua productCode merge.
                removeFromCart(commentId, product.code, { silent: true });
                _showToast('↶ Đã hoàn tác', 'ok');
            },
        });

        // Step 2 — Backend background. KHÔNG return promise lên caller.
        const realCommentId = commentIdMeta || commentId;
        const row = document.querySelector(
            `.live-conversation-item[data-comment-id="${CSS.escape(realCommentId)}"]`
        );
        const ctx = _resolveCommitContext(realCommentId, row, customer);
        ctx.fbCommentId = realCommentId;
        const clientEventId = 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);

        (async () => {
            try {
                const r = await fetch(API + '/cart/' + encodeURIComponent(commentId) + '/add', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({
                        product,
                        customer,
                        user: _user(),
                        qty: 1,
                        clientEventId,
                        fbContext: {
                            fbUserId: ctx.fbUserId,
                            fbUserName: ctx.fbUserName,
                            fbPageId: ctx.fbPageId,
                            fbPageName: ctx.fbPageName,
                            fbPostId: ctx.fbPostId,
                            fbCommentId: ctx.fbCommentId,
                            liveCampaignId: ctx.liveCampaignId,
                            liveCampaignName: ctx.liveCampaignName,
                            message: ctx.message,
                        },
                    }),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'unknown');
                // Sync silent: dùng qty authoritative từ response, không show toast lại.
                if (Number.isFinite(d.qty)) {
                    STATE.cartCounts[commentId] = {
                        items: STATE.cartCounts[commentId]?.items || 1,
                        qty: d.qty,
                    };
                    _renderBadgeFor(commentId);
                }
            } catch (e) {
                // Rollback optimistic + remove success toast + show error
                STATE.cartCounts[commentId] = prev;
                _renderBadgeFor(commentId);
                if (toast) {
                    toast._snapTickerCancel?.();
                    if (toast.parentNode) toast.remove();
                }
                _showToast(`✗ Lỗi thêm "${product.code}": ${e.message}`, 'err');
            }
        })();
    }

    function removeFromCart(commentId, productCode, opts) {
        opts = opts || {};
        // Step 1 — Optimistic UI INSTANT: giảm badge + xóa row khỏi popover
        const prev = STATE.cartCounts[commentId] || { items: 0, qty: 0 };
        const newQty = Math.max(0, prev.qty - 1);
        const newItems = Math.max(0, prev.items - 1);
        STATE.cartCounts[commentId] =
            newQty > 0 ? { items: newItems, qty: newQty } : { items: 0, qty: 0 };
        _renderBadgeFor(commentId);
        const openPop = document.querySelector(
            `.inv-cart-popover[data-cmt="${CSS.escape(commentId)}"]`
        );
        let removedItemRow = null;
        let removedItemNext = null;
        if (openPop) {
            removedItemRow = openPop.querySelector(
                `.inv-cart-item[data-code="${CSS.escape(productCode)}"]`
            );
            if (removedItemRow) {
                removedItemNext = removedItemRow.nextSibling;
                removedItemRow.remove();
            }
        }
        if (!opts.silent) _showToast(`✓ Đã xóa "${productCode}"`, 'ok');

        // Step 2 — Backend background. Rollback nếu lỗi.
        (async () => {
            try {
                const r = await fetch(
                    API +
                        '/cart/' +
                        encodeURIComponent(commentId) +
                        '/' +
                        encodeURIComponent(productCode) +
                        '/remove',
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            user: _user(),
                            clientEventId:
                                'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10),
                        }),
                    }
                );
                const d = await r.json().catch(() => ({}));
                if (r.ok && d?.success === false) throw new Error(d.error || 'remove failed');
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
            } catch (e) {
                STATE.cartCounts[commentId] = prev;
                _renderBadgeFor(commentId);
                // Restore popover row nếu còn mở
                if (openPop && removedItemRow && openPop.isConnected) {
                    if (removedItemNext && removedItemNext.parentNode === openPop) {
                        openPop.insertBefore(removedItemRow, removedItemNext);
                    } else {
                        openPop.appendChild(removedItemRow);
                    }
                }
                _showToast(`✗ Lỗi xóa "${productCode}": ${e.message}`, 'err');
            }
        })();
    }

    // Xóa toàn bộ đơn (clear order) — caller đã confirm trước khi gọi.
    function clearOrder(commentId) {
        // Step 1 — Optimistic UI INSTANT
        const prev = STATE.cartCounts[commentId];
        STATE.cartCounts[commentId] = { items: 0, qty: 0 };
        _renderBadgeFor(commentId);
        const openPop = document.querySelector(
            `.inv-cart-popover[data-cmt="${CSS.escape(commentId)}"]`
        );
        const popHtml = openPop ? openPop.outerHTML : null;
        const popParent = openPop ? openPop.parentNode : null;
        if (openPop) {
            openPop.remove();
            _popCleanup?.();
        }
        _showToast('✓ Đang xóa đơn...', 'ok');

        // Step 2 — Backend background
        (async () => {
            try {
                const r = await fetch(API + '/cart/' + encodeURIComponent(commentId) + '/clear', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'include',
                    body: JSON.stringify({ user: _user() }),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'clear failed');
                _showToast(`✓ Đã xóa đơn (${d.removed} SP)`, 'ok');
            } catch (e) {
                STATE.cartCounts[commentId] = prev;
                _renderBadgeFor(commentId);
                // Restore popover nếu cần
                if (popHtml && popParent && popParent.isConnected) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = popHtml;
                    if (tmp.firstChild) popParent.appendChild(tmp.firstChild);
                }
                _showToast(`✗ Lỗi xóa đơn: ${e.message}`, 'err');
            }
        })();
    }

    async function refreshCartCounts(commentIds) {
        if (!commentIds || !commentIds.length) {
            // Collect CUSTOMER IDs (fbUserId) — dedupe vì 1 khách có nhiều comments.
            const set = new Set();
            document.querySelectorAll('.live-conversation-item').forEach((row) => {
                const cmt = row.dataset.commentId;
                if (!cmt) return;
                const customer = _resolveLiveCustomer(cmt, row);
                const k = customer.id || cmt;
                if (k) set.add(k);
            });
            commentIds = [...set].slice(0, 200);
        }
        if (!commentIds.length) return;
        try {
            // POST body thay vì GET query — 200 ids dồn vào URL dễ vượt limit proxy.
            const r = await fetch(API + '/cart/batch/counts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ commentIds }),
            });
            const d = await r.json();
            if (d.success) {
                STATE.cartCounts = d.counts || {};
                renderBadges();
                _markHasOrderRows();
            }
        } catch (e) {
            console.warn('[InventoryPanel] refreshCartCounts:', e.message);
        }
    }

    // Mark conversation rows của khách ĐÃ CÓ ĐƠN.
    // Pancake conversation list shape: `has_livestream_order` + `has_phone` + customer fields.
    // Signal heuristic (any-of):
    //   - has_livestream_order === true (Pancake xác nhận đơn live)
    //   - customer.success_order_count > 0 (sau khi fetch customer detail)
    //   - has_phone === true && có tag (đã extract SĐT + đã được sale gán tag → coi như đơn)
    //   - cart count > 0 (đã có SP trong giỏ local — cho phép drop tiếp)
    // Mark Live comment rows = drop target. Tất cả Live rows đều mặc định
    // được drop (Live chỉ show comment đã link session/order).
    function _markHasOrderRows() {
        // Anti-lag: skip nếu row đã được mark (idempotent + tránh attribute
        // mutation writes spam khi MutationObserver fire dồn dập).
        document.querySelectorAll('.live-conversation-item:not(.inv-has-order)').forEach((row) => {
            row.classList.add('inv-has-order');
            row.dataset.orderReason = 'live-comment';
        });
    }

    // Build/update badge cho 1 row (anti-lag: dùng khi optimistic update sau
    // drop thay vì renderBadges toàn list). Cũng dùng nội bộ trong renderBadges.
    function _renderBadgeForRow(row, cmtMap) {
        const commentId = row.dataset.commentId;
        if (!commentId) return;
        const c = (cmtMap || _getCmtMap()).get(commentId);
        const cid = c?.from?.id || commentId;
        const cnt = STATE.cartCounts[cid];
        let badge = row.querySelector('.inv-cart-badge');
        if (cnt && cnt.qty > 0) {
            if (!badge) {
                badge = document.createElement('button');
                badge.className = 'inv-cart-badge';
                badge.title = 'Click xem giỏ';
                badge.addEventListener('click', (e) => {
                    e.stopPropagation();
                    togglePopover(cid, row);
                });
                const slot = row.querySelector('.live-conv-header-info') || row;
                slot.appendChild(badge);
            }
            badge.textContent = '🛒 ' + cnt.qty;
        } else if (badge) {
            badge.remove();
        }
    }

    // Update badge cho all rows thuộc 1 customer (anti-lag optimistic). Khách
    // có thể có N comments → cần render badge cho tất cả row cùng customerId.
    function _renderBadgeFor(customerOrCommentId) {
        const cmtMap = _getCmtMap();
        const rows = document.querySelectorAll('.live-conversation-item');
        for (const row of rows) {
            const cid = row.dataset.commentId;
            if (!cid) continue;
            const c = cmtMap.get(cid);
            const matchId = c?.from?.id || cid;
            if (matchId === customerOrCommentId) {
                _renderBadgeForRow(row, cmtMap);
            }
        }
    }

    function renderBadges() {
        // Badge resolve theo CUSTOMER (fbUserId). 1 khách có N comments → mọi row hiện badge.
        // Build cmt map 1 lần thay vì N lần (O(N) thay vì O(N²)).
        const cmtMap = _getCmtMap();
        document.querySelectorAll('.live-conversation-item').forEach((row) => {
            _renderBadgeForRow(row, cmtMap);
        });
    }

    // Cleanup outside-click listener của popover đang mở (tránh orphan capture
    // listener khi popover bị đóng bởi path khác: nút ×, toggle, clear order).
    let _popCleanup = null;

    async function togglePopover(commentId, row) {
        const existing = document.querySelector('.inv-cart-popover');
        if (existing) {
            const wasFor = existing.dataset.cmt;
            existing.remove();
            _popCleanup?.();
            if (wasFor === commentId) return;
        }
        await renderCartPopover(commentId, row);
    }

    async function renderCartPopover(commentId, row) {
        if (!row)
            row = document.querySelector(
                `.pk-conversation-item[data-conv-id="${CSS.escape(commentId)}"]`
            );
        if (!row) return;
        try {
            const r = await fetch(API + '/cart/' + encodeURIComponent(commentId), {
                credentials: 'include',
            });
            const d = await r.json();
            if (!d.success) return;
            STATE.cartByCmt.set(commentId, d.items);
            const pop = document.createElement('div');
            pop.className = 'inv-cart-popover';
            pop.dataset.cmt = commentId;
            const total = (d.items || []).reduce(
                (s, it) => s + (Number(it.qty) || 0) * (Number(it.price) || 0),
                0
            );
            const itemsHtml =
                (d.items || [])
                    .map((it) => {
                        const addedAt = it.added_at ? new Date(it.added_at) : null;
                        const addedRel = addedAt ? _relTime(addedAt) : '';
                        const addedAbs = addedAt ? addedAt.toLocaleString('vi-VN') : '';
                        return `<div class="inv-cart-item" data-code="${escapeHtml(it.product_code)}">
                            <span class="inv-cart-item-code">${escapeHtml(it.product_code)}</span>
                            <span class="inv-cart-item-name" title="${escapeHtml(it.product_name || '')}">${escapeHtml(it.product_name || '')}</span>
                            <span class="inv-cart-item-qty">×${it.qty}</span>
                            <span class="inv-cart-item-price">${fmtPrice((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
                            <span class="inv-cart-item-time" title="Thêm vào: ${escapeHtml(addedAbs)}">${escapeHtml(addedRel)}</span>
                            <button class="inv-cart-item-remove" data-action="remove" title="Xóa">×</button>
                        </div>`;
                    })
                    .join('') || '<div class="inv-cart-empty">Giỏ trống</div>';
            pop.innerHTML = `
                <div class="inv-cart-pop-head">
                    <strong>🛒 Đơn hàng (${d.items?.length || 0} SP)</strong>
                    <span class="inv-cart-pop-total">Tổng: ${fmtPrice(total)}</span>
                    <button class="inv-cart-pop-history" title="Xem lịch sử (15 ngày)">⏱ Lịch sử</button>
                    ${
                        (d.items?.length || 0) > 0
                            ? '<button class="inv-cart-pop-clear" title="Xóa toàn bộ đơn (kéo nhầm)">Xóa đơn</button>'
                            : ''
                    }
                    <button class="inv-cart-pop-close">×</button>
                </div>
                <div class="inv-cart-pop-body">${itemsHtml}</div>
                <div class="inv-cart-pop-foot">
                    Cart được giữ 15 ngày · auto xóa khi PBH tạo thành công
                </div>
            `;
            document.body.appendChild(pop);
            const rect = row.getBoundingClientRect();
            pop.style.top = rect.bottom + 4 + 'px';
            pop.style.left = rect.left + 'px';
            // Outside-click + cleanup: mọi path đóng popover đều phải gỡ listener
            // capture trên document (tránh orphan listener tích dồn).
            const _outside = (ev) => {
                if (!pop.isConnected) {
                    cleanup();
                    return;
                }
                if (!pop.contains(ev.target)) {
                    pop.remove();
                    cleanup();
                }
            };
            const cleanup = () => {
                cleanup._done = true;
                document.removeEventListener('click', _outside, { capture: true });
                if (_popCleanup === cleanup) _popCleanup = null;
            };
            _popCleanup?.();
            _popCleanup = cleanup;
            pop.querySelector('.inv-cart-pop-close').onclick = () => {
                pop.remove();
                cleanup();
            };
            // Xóa SP khỏi đơn — KHÔNG confirm (UX nhanh)
            pop.querySelectorAll('[data-action="remove"]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const code = btn.closest('[data-code]').dataset.code;
                    removeFromCart(commentId, code);
                };
            });
            // Xóa toàn bộ đơn — CÓ confirm (Web2Popup, không phải native confirm)
            const clearBtn = pop.querySelector('.inv-cart-pop-clear');
            if (clearBtn) {
                clearBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const ok = global.Popup
                        ? await global.Popup.confirm(
                              `Xóa toàn bộ đơn? ${d.items.length} SP sẽ bị xóa. (Dùng khi kéo nhầm)`,
                              { type: 'warning', okText: 'Xóa đơn', cancelText: 'Hủy' }
                          )
                        : confirm(
                              `Xóa toàn bộ đơn? ${d.items.length} SP sẽ bị xóa. (Dùng khi kéo nhầm)`
                          );
                    if (ok) clearOrder(commentId);
                };
            }
            // Lịch sử cart
            const histBtn = pop.querySelector('.inv-cart-pop-history');
            if (histBtn) {
                histBtn.onclick = (e) => {
                    e.stopPropagation();
                    openCartHistory(commentId);
                };
            }
            // Attach outside-click AFTER current click finishes — tránh badge.click()
            // tự bubble vào listener mới attach → đóng popover ngay tức thì.
            setTimeout(() => {
                if (cleanup._done) return; // đã đóng trước khi listener kịp attach
                document.addEventListener('click', _outside, { capture: true });
            }, 0);
        } catch (e) {
            console.warn('[InventoryPanel] popover fail:', e.message);
        }
    }

    // Toast với nút Hoàn tác — tự đóng sau 5s, click Hoàn tác → callback
    function _showUndoToast({ title, onUndo }) {
        // Bỏ toast cũ cùng kiểu (chỉ 1 undo toast tại 1 lúc)
        document.querySelectorAll('.inv-toast-undo').forEach((t) => t.remove());
        const t = document.createElement('div');
        t.className = 'inv-toast inv-toast-undo';
        t.innerHTML = `
            <span class="inv-toast-msg">${escapeHtml(title)}</span>
            <button class="inv-toast-undo-btn">↶ Hoàn tác</button>
            <span class="inv-toast-countdown">5</span>
        `;
        document.body.appendChild(t);
        let remain = 5;
        const cd = t.querySelector('.inv-toast-countdown');
        const tick = setInterval(() => {
            remain--;
            if (cd) cd.textContent = String(remain);
            if (remain <= 0) {
                clearInterval(tick);
                t.remove();
            }
        }, 1000);
        t.querySelector('.inv-toast-undo-btn').onclick = () => {
            clearInterval(tick);
            t.remove();
            try {
                onUndo && onUndo();
            } catch (e) {
                console.warn(e);
            }
        };
        // Trả về element + ticker để caller có thể remove khi backend lỗi
        // (clear interval để tránh leak khi UI-first rollback).
        t._snapTickerCancel = () => clearInterval(tick);
        return t;
    }

    async function openCartHistory(commentId) {
        try {
            const r = await fetch(
                API + '/cart/' + encodeURIComponent(commentId) + '/history?limit=200',
                { credentials: 'include' }
            );
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            if (d && d.success === false) throw new Error(d.error || 'history failed');
            const back = document.createElement('div');
            back.className = 'inv-hist-backdrop';
            const items = d.items || [];
            const rowsHtml = items.length
                ? items
                      .map((h) => {
                          const t = h.created_at ? new Date(h.created_at) : null;
                          const tStr = t ? t.toLocaleString('vi-VN') : '';
                          const actionLabel =
                              {
                                  add: '➕ Thêm',
                                  remove: '➖ Xóa SP',
                                  'qty-change': '✏ Đổi SL',
                                  'clear-order': '🗑 Xóa đơn',
                                  'pbh-created': '✅ Tạo PBH',
                                  'auto-clear': '⏳ Auto',
                              }[h.action] || h.action;
                          return `<tr>
                            <td class="t">${escapeHtml(tStr)}</td>
                            <td>${escapeHtml(actionLabel)}</td>
                            <td><code>${escapeHtml(h.product_code || '')}</code></td>
                            <td>${escapeHtml(h.product_name || '')}</td>
                            <td class="n">${h.qty_before ?? '—'} → ${h.qty_after ?? '—'}</td>
                            <td>${escapeHtml(h.user_name || '—')}</td>
                          </tr>`;
                      })
                      .join('')
                : '<tr><td colspan="6" class="empty">Chưa có lịch sử</td></tr>';
            back.innerHTML = `
                <div class="inv-hist-modal">
                    <div class="inv-hist-head">
                        <strong>⏱ Lịch sử cart (15 ngày)</strong>
                        <span class="inv-hist-sub">${items.length} entries</span>
                        <button class="inv-hist-close">×</button>
                    </div>
                    <div class="inv-hist-body">
                        <table class="inv-hist-tbl">
                            <thead><tr><th>Thời gian</th><th>Action</th><th>Mã SP</th><th>Tên</th><th>SL</th><th>User</th></tr></thead>
                            <tbody>${rowsHtml}</tbody>
                        </table>
                    </div>
                </div>
            `;
            document.body.appendChild(back);
            const close = () => back.remove();
            back.querySelector('.inv-hist-close').onclick = close;
            back.onclick = (e) => {
                if (e.target === back) close();
            };
        } catch (e) {
            _showToast('Lỗi load history: ' + e.message, 'err');
        }
    }

    function _showToast(msg, type) {
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type === 'err' ? 'error' : 'success');
            return;
        }
        const t = document.createElement('div');
        t.className = 'inv-toast inv-toast-' + (type || 'ok');
        t.textContent = msg;
        document.body.appendChild(t);
        setTimeout(() => t.remove(), 2500);
    }

    // ─────────────────────────────────────────────────────────
    // SSE subscribe: web2:cart event → refresh badges (cross-tab sync)
    // ─────────────────────────────────────────────────────────
    // Coalesce: 3 topics (cart / native-orders / products) thường fire dồn dập
    // cùng 1 mutation → gom về 1 timer duy nhất, 1 refresh() (refresh đã bao gồm
    // refreshCartCounts ở cuối) thay vì 3 debounce riêng chạy song song.
    let _refreshTimer = null;
    function _scheduleRefresh() {
        clearTimeout(_refreshTimer);
        _refreshTimer = setTimeout(refresh, 800);
    }

    function _subscribeSSE() {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:cart', _scheduleRefresh);
        // Sau refactor 1-nguồn: native_orders.products là source. Khi modal
        // Đơn Web edit/delete/PATCH products → backend fire web2:native-orders →
        // Live panel cart badge phải re-fetch counts để đồng bộ.
        global.Web2SSE.subscribe('web2:native-orders', _scheduleRefresh);
        // SP update → reload list
        global.Web2SSE.subscribe('web2:products', _scheduleRefresh);
    }

    async function refresh() {
        const [tabs, products] = await Promise.all([loadTabsFromSoOrder(), loadProducts()]);
        STATE.tabs = tabs;
        STATE.products = products;
        renderTabs();
        applyFilter();
        refreshCartCounts();
    }

    async function init(container) {
        renderShell(container);
        await refresh();
        attachDropTargets();
        _subscribeSSE();

        // Wire MutationObserver cho Live comments container (#liveContent) —
        // drop target DUY NHẤT. Watch subtree để bắt re-render của LiveCommentList.
        //
        // ⚠ Anti feedback-loop (fix 2026-06-06 "chọn 4 campaign load liên tục"):
        // refreshCartCounts() → renderBadges() append/sửa badge `.inv-cart-badge`
        // BÊN TRONG row = childList mutation trong subtree → observer fire lại →
        // refresh lại → loop vô hạn ~10 req/s. Vì vậy callback CHỈ react khi danh
        // sách comment THỰC SỰ đổi (thêm/bớt `.live-conversation-item`), bỏ qua mọi
        // mutation do chính badge giỏ hàng gây ra.
        function _mutationsTouchRows(mutations) {
            for (const m of mutations) {
                for (const n of m.addedNodes) {
                    if (
                        n.nodeType === 1 &&
                        (n.classList?.contains('live-conversation-item') ||
                            n.querySelector?.('.live-conversation-item'))
                    )
                        return true;
                }
                for (const n of m.removedNodes) {
                    if (
                        n.nodeType === 1 &&
                        (n.classList?.contains('live-conversation-item') ||
                            n.querySelector?.('.live-conversation-item'))
                    )
                        return true;
                }
            }
            return false;
        }
        function _wireLiveObserver() {
            const liveRoot = document.getElementById('liveContent');
            if (!liveRoot) return false;
            if (liveRoot.dataset.invObserved) return true;
            liveRoot.dataset.invObserved = '1';
            new MutationObserver((mutations) => {
                if (!_mutationsTouchRows(mutations)) return; // bỏ qua badge churn
                clearTimeout(init._liveTimer);
                init._liveTimer = setTimeout(() => {
                    refreshCartCounts();
                    _markHasOrderRows();
                }, 300);
            }).observe(liveRoot, { childList: true, subtree: true });
            refreshCartCounts();
            _markHasOrderRows();
            return true;
        }

        // Poll DOM mỗi 2s CHỈ để chờ #liveContent xuất hiện (LiveCommentList load
        // async) rồi wire observer. Sau khi wire xong → observer + SSE tự lo refresh
        // khi list đổi → KHÔNG poll refreshCartCounts nữa (tránh load liên tục).
        let pollTries = 0;
        const pollTimer = setInterval(() => {
            pollTries++;
            if (_wireLiveObserver() || pollTries >= 60) {
                clearInterval(pollTimer);
            }
        }, 2000);
    }

    global.PancakeInventoryPanel = {
        init,
        refresh,
        addToCart,
        removeFromCart,
        refreshCartCounts,
        LS_TAB_KEY,
        DEFAULT_TAB,
    };
})(typeof window !== 'undefined' ? window : globalThis);
