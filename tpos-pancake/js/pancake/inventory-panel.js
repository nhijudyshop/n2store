// #Note: WEB2.0 module. Kho SP panel — tab cùng cấp với Chat trong Pancake column.
//
// Logic:
//   - Tabs lấy từ Firestore so_order_v2/main → data.tabs[].label/name.
//   - Filter: SP có supplier === tabName (exact, case-insensitive).
//   - Search: tokenize input, AND-match qua code/name/variant (ASCII normalize).
//   - Drag source: mỗi card SP có draggable=true; setData('application/x-web2-product', JSON).
//   - Drop target: comment rows đã có đơn (data-conv-id) ở .pk-conversation-list.
//   - Cart: POST /api/v2/cart/:commentId/add — sync qua SSE 'web2:cart' multi-tab.
//
// State khi switch tab Chat↔Kho lưu localStorage 'tpos_pancake_active_tab' (default 'kho').

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;

    const API = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2';
    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const LS_TAB_KEY = 'tpos_pancake_active_tab';
    const DEFAULT_TAB = 'kho'; // user: mặc định là Kho

    const STATE = {
        tabs: [], // ['HÀ NỘI', 'HƯƠNG CHÂU', ...]
        activeTab: 'ALL', // 'ALL' or tab name
        searchQuery: '',
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

    // ─────────────────────────────────────────────────────────
    // Load NCC tabs từ Firestore so_order_v2
    // ─────────────────────────────────────────────────────────
    async function loadTabsFromSoOrder() {
        try {
            if (typeof firebase === 'undefined' || !firebase.firestore) return [];
            const snap = await firebase.firestore().collection('so_order_v2').doc('main').get();
            if (!snap.exists) return [];
            const data = snap.data()?.data || {};
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
                <div class="inv-stats" id="invStats"></div>
                <div class="inv-list" id="invList">
                    <div class="inv-loading">Đang tải kho SP…</div>
                </div>
            </div>
        `;
        document.getElementById('invSearch').addEventListener('input', (e) => {
            STATE.searchQuery = e.target.value || '';
            applyFilter();
        });
        document.getElementById('invRefresh').addEventListener('click', refresh);
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
                return `<div class="inv-card" draggable="true" data-product='${productJson}'>
                    ${imgHtml}
                    <div class="inv-card-body">
                        <div class="inv-card-code">${escapeHtml(p.code)}</div>
                        <div class="inv-card-name" title="${escapeHtml(p.name)}">${escapeHtml(p.name)}</div>
                        <div class="inv-card-meta">
                            <span class="inv-card-price">${fmtPrice(p.price)}</span>
                            ${p.variant ? `<span class="inv-card-variant">${escapeHtml(p.variant)}</span>` : ''}
                            <span class="inv-card-stock${(p.stock ?? 0) === 0 ? ' zero' : ''}">SL ${p.stock ?? 0}</span>
                        </div>
                    </div>
                </div>`;
            })
            .join('');
        attachDragSources();
    }

    // ─────────────────────────────────────────────────────────
    // Drag source
    // ─────────────────────────────────────────────────────────
    function attachDragSources() {
        document.querySelectorAll('.inv-card').forEach((card) => {
            card.addEventListener('dragstart', (e) => {
                const json = card.getAttribute('data-product');
                e.dataTransfer.setData('application/x-web2-product', json);
                e.dataTransfer.effectAllowed = 'copy';
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => card.classList.remove('dragging'));
        });
    }

    // ─────────────────────────────────────────────────────────
    // Drop target on comment rows (only with order)
    //
    // "Comment đã có đơn": ta dùng 2 dấu hiệu:
    //   - Có icon `has-phone` (SĐT đã extract) — convention Pancake
    //   - OR có tags chứa từ khóa "đơn" / "PBH" / "TPOS"
    // Conservative: nếu KHÔNG xác định được → vẫn cho drop nhưng warn.
    // ─────────────────────────────────────────────────────────
    function attachDropTargets() {
        const list = document.querySelector('.pk-conversation-list, #pkConversationList');
        if (!list) return;

        // Event delegation — listen on container, check target row.
        // CHỈ accept drop trên row có class .inv-has-order (khách đã có đơn).
        list.addEventListener('dragover', (e) => {
            const row = e.target.closest('.pk-conversation-item');
            if (!row) return;
            if (!row.classList.contains('inv-has-order')) {
                // Khách chưa có đơn → set dropEffect=none + visual deny
                e.dataTransfer.dropEffect = 'none';
                row.classList.add('inv-drop-deny');
                return;
            }
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            row.classList.add('inv-drop-hover');
        });
        list.addEventListener('dragleave', (e) => {
            const row = e.target.closest('.pk-conversation-item');
            if (row) {
                row.classList.remove('inv-drop-hover');
                row.classList.remove('inv-drop-deny');
            }
        });
        list.addEventListener('drop', async (e) => {
            const row = e.target.closest('.pk-conversation-item');
            if (!row) return;
            row.classList.remove('inv-drop-hover');
            row.classList.remove('inv-drop-deny');
            if (!row.classList.contains('inv-has-order')) {
                _showToast('Khách chưa có đơn — không thể thêm SP', 'err');
                return;
            }
            e.preventDefault();
            const json = e.dataTransfer.getData('application/x-web2-product');
            if (!json) return;
            let product;
            try {
                product = JSON.parse(json);
            } catch {
                return;
            }
            const commentId = row.dataset.convId;
            if (!commentId) return;

            // Extract customer info from row context (Pancake state cache)
            const customer = _resolveCustomer(commentId, row);
            await addToCart(commentId, product, customer);
        });
    }

    function _resolveCustomer(commentId, row) {
        const cust = { id: null, name: null, phone: null };
        try {
            const st = global.PancakeState;
            if (st && Array.isArray(st.conversations)) {
                const c = st.conversations.find((x) => x.id === commentId);
                if (c) {
                    cust.id = c.from?.id || c.from_psid || c.customer?.id || null;
                    cust.name =
                        c.from?.name ||
                        c.customer?.name ||
                        row.querySelector('.pk-conversation-name')?.textContent?.trim() ||
                        null;
                    cust.phone = c.customer?.phone || c.phone || null;
                }
            }
        } catch {}
        return cust;
    }

    // ─────────────────────────────────────────────────────────
    // Cart API
    // ─────────────────────────────────────────────────────────
    async function addToCart(commentId, product, customer) {
        const user = global.AuthManager?.getCurrentUser?.() || {};
        try {
            const r = await fetch(API + '/cart/' + encodeURIComponent(commentId) + '/add', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    product,
                    customer,
                    user: { id: user.uid || user.email, name: user.displayName || user.email },
                    qty: 1,
                }),
            });
            const d = await r.json();
            if (d.success) {
                _showToast(`✓ Thêm "${product.code}" vào giỏ`, 'ok');
                await refreshCartCounts([commentId]);
            } else {
                _showToast(`✗ Lỗi: ${d.error || ''}`, 'err');
            }
        } catch (e) {
            _showToast(`✗ Lỗi: ${e.message}`, 'err');
        }
    }

    async function removeFromCart(commentId, productCode) {
        const user = global.AuthManager?.getCurrentUser?.() || {};
        try {
            await fetch(
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
                        user: { id: user.uid || user.email, name: user.displayName || user.email },
                    }),
                }
            );
            await refreshCartCounts([commentId]);
            await renderCartPopover(commentId); // re-render if open
        } catch (e) {
            _showToast(`✗ Lỗi xóa: ${e.message}`, 'err');
        }
    }

    async function refreshCartCounts(commentIds) {
        if (!commentIds || !commentIds.length) {
            // batch: get IDs from rendered conversation list
            commentIds = [...document.querySelectorAll('.pk-conversation-item')]
                .map((r) => r.dataset.convId)
                .filter(Boolean)
                .slice(0, 200);
        }
        if (!commentIds.length) return;
        try {
            const r = await fetch(
                API +
                    '/cart/batch/counts?commentIds=' +
                    commentIds.map(encodeURIComponent).join(','),
                { credentials: 'include' }
            );
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
    function _markHasOrderRows() {
        const st = global.PancakeState;
        if (!st || !Array.isArray(st.conversations)) return;
        const byId = new Map();
        for (const c of st.conversations) byId.set(c.id, c);
        document.querySelectorAll('.pk-conversation-item').forEach((row) => {
            const cid = row.dataset.convId;
            if (!cid) return;
            const c = byId.get(cid);
            if (!c) return;
            const customer = c.customers?.[0] || c.from || {};
            const orderCnt =
                Number(customer.success_order_count) ||
                Number(customer.order_count) ||
                Number(c.order_count) ||
                0;
            const cartCnt = STATE.cartCounts[cid]?.qty || 0;
            const hasLiveOrder = c.has_livestream_order === true;
            const hasPhone =
                c.has_phone === true ||
                (Array.isArray(c.recent_phone_numbers) && c.recent_phone_numbers.length > 0);
            const hasTag = c.tags && Object.keys(c.tags).length > 0;
            const hasOrder = hasLiveOrder || orderCnt > 0 || cartCnt > 0 || (hasPhone && hasTag);
            row.classList.toggle('inv-has-order', hasOrder);
            row.dataset.orderCount = orderCnt;
            row.dataset.orderReason = hasLiveOrder
                ? 'livestream-order'
                : orderCnt > 0
                  ? 'success-order'
                  : cartCnt > 0
                    ? 'in-cart'
                    : hasPhone && hasTag
                      ? 'phone+tag'
                      : '';
        });
    }

    function renderBadges() {
        document.querySelectorAll('.pk-conversation-item').forEach((row) => {
            const cid = row.dataset.convId;
            if (!cid) return;
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
                    const actions = row.querySelector('.pk-conversation-actions');
                    (actions || row).appendChild(badge);
                }
                badge.textContent = '🛒 ' + cnt.qty;
            } else if (badge) {
                badge.remove();
            }
        });
    }

    async function togglePopover(commentId, row) {
        const existing = document.querySelector('.inv-cart-popover');
        if (existing) {
            const wasFor = existing.dataset.cmt;
            existing.remove();
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
                    .map(
                        (
                            it
                        ) => `<div class="inv-cart-item" data-code="${escapeHtml(it.product_code)}">
                        <span class="inv-cart-item-code">${escapeHtml(it.product_code)}</span>
                        <span class="inv-cart-item-name" title="${escapeHtml(it.product_name || '')}">${escapeHtml(it.product_name || '')}</span>
                        <span class="inv-cart-item-qty">×${it.qty}</span>
                        <span class="inv-cart-item-price">${fmtPrice((Number(it.qty) || 0) * (Number(it.price) || 0))}</span>
                        <button class="inv-cart-item-remove" data-action="remove" title="Xóa">×</button>
                    </div>`
                    )
                    .join('') || '<div class="inv-cart-empty">Giỏ trống</div>';
            pop.innerHTML = `
                <div class="inv-cart-pop-head">
                    <strong>🛒 Giỏ hàng (${d.items?.length || 0})</strong>
                    <span class="inv-cart-pop-total">Tổng: ${fmtPrice(total)}</span>
                    <button class="inv-cart-pop-close">×</button>
                </div>
                <div class="inv-cart-pop-body">${itemsHtml}</div>
            `;
            document.body.appendChild(pop);
            const rect = row.getBoundingClientRect();
            pop.style.top = rect.bottom + 4 + 'px';
            pop.style.left = rect.left + 'px';
            pop.querySelector('.inv-cart-pop-close').onclick = () => pop.remove();
            pop.querySelectorAll('[data-action="remove"]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const code = btn.closest('[data-code]').dataset.code;
                    if (confirm('Xóa SP ' + code + ' khỏi giỏ?')) {
                        removeFromCart(commentId, code);
                    }
                };
            });
            document.addEventListener(
                'click',
                function _outside(ev) {
                    if (!pop.contains(ev.target)) {
                        pop.remove();
                        document.removeEventListener('click', _outside);
                    }
                },
                { capture: true }
            );
        } catch (e) {
            console.warn('[InventoryPanel] popover fail:', e.message);
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
    function _subscribeSSE() {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:cart', (msg) => {
            const cid = msg?.data?.commentId;
            if (cid) refreshCartCounts([cid]);
            else refreshCartCounts();
        });
        // SP update → reload list
        global.Web2SSE.subscribe('web2:products', () => {
            // debounce
            clearTimeout(_subscribeSSE._spTimer);
            _subscribeSSE._spTimer = setTimeout(refresh, 800);
        });
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

        // Refresh badges khi conversation list re-render (Pancake updates)
        const list = document.querySelector('.pk-conversation-list, #pkConversationList');
        if (list && global.MutationObserver) {
            new MutationObserver(() => {
                clearTimeout(init._mTimer);
                init._mTimer = setTimeout(() => refreshCartCounts(), 200);
            }).observe(list, { childList: true, subtree: false });
        }
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
