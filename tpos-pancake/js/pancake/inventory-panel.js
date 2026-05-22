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
            // Bỏ SP hết hàng (SL=0) khỏi panel — user request không cho drag
            const stock = Number(p.stock) || 0;
            if (stock <= 0) return false;
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
    // Drop target: CHỈ TPOS COMMENTS panel (left column).
    // Pancake conv rows KHÔNG nhận drop (user explicit request).
    // ─────────────────────────────────────────────────────────
    function attachDropTargets() {
        document.addEventListener('dragover', (e) => {
            const row = e.target.closest('.tpos-conversation-item');
            if (!row) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
            row.classList.add('inv-drop-hover');
        });
        document.addEventListener('dragleave', (e) => {
            const row = e.target.closest('.tpos-conversation-item');
            if (row) row.classList.remove('inv-drop-hover');
        });
        document.addEventListener('drop', async (e) => {
            const row = e.target.closest('.tpos-conversation-item');
            if (!row) return;
            row.classList.remove('inv-drop-hover');
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
            const customer = _resolveTposCustomer(commentId, row);
            await addToCart(commentId, product, customer);
        });
    }

    function _resolveTposCustomer(commentId, row) {
        const cust = { id: null, name: null, phone: null };
        try {
            const st = global.TposState;
            if (st && Array.isArray(st.comments)) {
                const c = st.comments.find((x) => x.id === commentId);
                if (c) {
                    cust.id = c.from?.id || null;
                    cust.name =
                        c.from?.name ||
                        row.querySelector('.tpos-conv-name, .from-name')?.textContent?.trim() ||
                        null;
                    cust.phone = c.phone || c.customer_phone || null;
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

    // Pending commit timers — commentId → setTimeout handle (5s)
    const _pendingCommits = new Map();

    function _resolveCommitContext(commentId, row, customer) {
        const ctx = {
            fbUserId: customer?.id || null,
            fbUserName: customer?.name || null,
            phone: customer?.phone || '',
            fbPageId: null,
            fbPageName: null,
            fbPostId: null,
            crmTeamId: null,
            liveCampaignId: null,
            liveCampaignName: null,
            message: '',
        };
        try {
            const st = global.TposState;
            const c = st?.comments?.find((x) => x.id === commentId);
            if (c) {
                const pageObj = c._pageObj || st.selectedPage;
                const camp = c._campaignId
                    ? st.liveCampaigns?.find((x) => x.Id === c._campaignId)
                    : st.selectedCampaign;
                ctx.fbPageId = pageObj?.Facebook_PageId || pageObj?.FacebookPageId || null;
                ctx.fbPageName = pageObj?.Name || pageObj?.PageName || null;
                ctx.fbPostId = camp?.Facebook_LiveId || null;
                ctx.crmTeamId = pageObj?.Id || null;
                ctx.liveCampaignId = camp?.Id ? String(camp.Id) : null;
                ctx.liveCampaignName = camp?.Name || null;
                ctx.message = c.message || '';
            }
        } catch {}
        return ctx;
    }

    async function _doCommit(commentId, ctx) {
        try {
            const r = await fetch(API + '/cart/' + encodeURIComponent(commentId) + '/commit', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ ...ctx, user: _user() }),
            });
            const d = await r.json();
            if (d.success) {
                console.log('[InventoryPanel] commit OK:', d.native_order_code);
            }
        } catch (e) {
            console.warn('[InventoryPanel] commit fail:', e.message);
        }
    }

    async function addToCart(commentId, product, customer) {
        // Optimistic: tăng badge ngay (rollback nếu API fail)
        const wasEmpty = !(STATE.cartCounts[commentId]?.qty > 0);
        const prev = STATE.cartCounts[commentId] || { items: 0, qty: 0 };
        STATE.cartCounts[commentId] = {
            items: prev.items + 1,
            qty: prev.qty + 1,
        };
        renderBadges();

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
                }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'unknown');

            // Nếu native_order_code đã tồn tại (committed trước đó) → SP đã được sync
            // sang native-orders tự động qua backend. Vẫn show toast Undo cho UX.
            const alreadyCommitted = !!d.native_order_code;
            const row = document.querySelector(
                `.tpos-conversation-item[data-comment-id="${CSS.escape(commentId)}"]`
            );
            const ctx = _resolveCommitContext(commentId, row, customer);

            // Schedule commit sau 5s nếu chưa committed (đơn mới chưa tạo)
            if (!alreadyCommitted) {
                if (_pendingCommits.has(commentId)) {
                    clearTimeout(_pendingCommits.get(commentId));
                }
                const tHandle = setTimeout(() => {
                    _pendingCommits.delete(commentId);
                    _doCommit(commentId, ctx);
                }, 5000);
                _pendingCommits.set(commentId, tHandle);
            }

            // Show toast với Undo (5s)
            _showUndoToast({
                title: wasEmpty
                    ? `✓ Tạo đơn mới + thêm "${product.code}" (5s)`
                    : alreadyCommitted
                      ? `✓ Thêm "${product.code}" vào đơn`
                      : `✓ Thêm "${product.code}" vào đơn nháp (5s)`,
                onUndo: async () => {
                    // Cancel pending commit nếu có
                    if (_pendingCommits.has(commentId)) {
                        clearTimeout(_pendingCommits.get(commentId));
                        _pendingCommits.delete(commentId);
                    }
                    await removeFromCart(commentId, product.code, { silent: true });
                    _showToast('↶ Đã hoàn tác', 'ok');
                },
            });
            // Sync server real state
            refreshCartCounts([commentId]);
        } catch (e) {
            // Rollback optimistic
            STATE.cartCounts[commentId] = prev;
            renderBadges();
            _showToast(`✗ Lỗi: ${e.message}`, 'err');
        }
    }

    async function removeFromCart(commentId, productCode, opts) {
        opts = opts || {};
        // Optimistic: giảm badge ngay
        const prev = STATE.cartCounts[commentId] || { items: 0, qty: 0 };
        const newQty = Math.max(0, prev.qty - 1);
        const newItems = Math.max(0, prev.items - 1);
        STATE.cartCounts[commentId] =
            newQty > 0 ? { items: newItems, qty: newQty } : { items: 0, qty: 0 };
        renderBadges();
        // Re-render popover nếu đang mở
        const openPop = document.querySelector(
            `.inv-cart-popover[data-cmt="${CSS.escape(commentId)}"]`
        );
        if (openPop) {
            const itemRow = openPop.querySelector(
                `.inv-cart-item[data-code="${CSS.escape(productCode)}"]`
            );
            if (itemRow) itemRow.remove();
        }

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
                    body: JSON.stringify({ user: _user() }),
                }
            );
            // Sync hard
            refreshCartCounts([commentId]);
            if (!opts.silent) _showToast(`Đã xóa "${productCode}"`, 'ok');
        } catch (e) {
            STATE.cartCounts[commentId] = prev; // rollback
            renderBadges();
            _showToast(`✗ Lỗi xóa: ${e.message}`, 'err');
        }
    }

    // Xóa toàn bộ đơn (clear order) — có confirm
    async function clearOrder(commentId) {
        // Optimistic
        const prev = STATE.cartCounts[commentId];
        STATE.cartCounts[commentId] = { items: 0, qty: 0 };
        renderBadges();
        const openPop = document.querySelector(
            `.inv-cart-popover[data-cmt="${CSS.escape(commentId)}"]`
        );
        if (openPop) openPop.remove();

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
            refreshCartCounts([commentId]);
        } catch (e) {
            STATE.cartCounts[commentId] = prev;
            renderBadges();
            _showToast(`✗ Lỗi xóa đơn: ${e.message}`, 'err');
        }
    }

    async function refreshCartCounts(commentIds) {
        if (!commentIds || !commentIds.length) {
            // CHỈ TPOS comment IDs (drop target duy nhất)
            commentIds = [...document.querySelectorAll('.tpos-conversation-item')]
                .map((r) => r.dataset.commentId)
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
    // Mark TPOS comment rows = drop target. Tất cả TPOS rows đều mặc định
    // được drop (TPOS chỉ show comment đã link session/order).
    function _markHasOrderRows() {
        document.querySelectorAll('.tpos-conversation-item').forEach((row) => {
            row.classList.add('inv-has-order');
            row.dataset.orderReason = 'tpos-comment';
        });
    }

    function renderBadges() {
        // CHỈ TPOS comment rows nhận badge
        document.querySelectorAll('.tpos-conversation-item').forEach((row) => {
            const cid = row.dataset.commentId;
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
                    const slot = row.querySelector('.tpos-conv-header-info') || row;
                    slot.appendChild(badge);
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
                    <strong>🛒 Đơn hàng (${d.items?.length || 0} SP)</strong>
                    <span class="inv-cart-pop-total">Tổng: ${fmtPrice(total)}</span>
                    ${
                        (d.items?.length || 0) > 0
                            ? '<button class="inv-cart-pop-clear" title="Xóa toàn bộ đơn (kéo nhầm)">Xóa đơn</button>'
                            : ''
                    }
                    <button class="inv-cart-pop-close">×</button>
                </div>
                <div class="inv-cart-pop-body">${itemsHtml}</div>
            `;
            document.body.appendChild(pop);
            const rect = row.getBoundingClientRect();
            pop.style.top = rect.bottom + 4 + 'px';
            pop.style.left = rect.left + 'px';
            pop.querySelector('.inv-cart-pop-close').onclick = () => pop.remove();
            // Xóa SP khỏi đơn — KHÔNG confirm (UX nhanh)
            pop.querySelectorAll('[data-action="remove"]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const code = btn.closest('[data-code]').dataset.code;
                    removeFromCart(commentId, code);
                };
            });
            // Xóa toàn bộ đơn — CÓ confirm
            const clearBtn = pop.querySelector('.inv-cart-pop-clear');
            if (clearBtn) {
                clearBtn.onclick = (e) => {
                    e.stopPropagation();
                    if (
                        confirm(
                            `Xóa toàn bộ đơn? ${d.items.length} SP sẽ bị xóa. (Dùng khi kéo nhầm)`
                        )
                    ) {
                        clearOrder(commentId);
                    }
                };
            }
            // Attach outside-click AFTER current click finishes — tránh badge.click()
            // tự bubble vào listener mới attach → đóng popover ngay tức thì.
            setTimeout(() => {
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

        // Wire MutationObserver cho TPOS comments container (#tposContent) —
        // drop target DUY NHẤT. Watch subtree để bắt re-render của TposCommentList.
        function _wireTposObserver() {
            const tposRoot = document.getElementById('tposContent');
            if (!tposRoot) return false;
            if (tposRoot.dataset.invObserved) return true;
            tposRoot.dataset.invObserved = '1';
            new MutationObserver(() => {
                clearTimeout(init._tposTimer);
                init._tposTimer = setTimeout(() => {
                    refreshCartCounts();
                    _markHasOrderRows();
                }, 200);
            }).observe(tposRoot, { childList: true, subtree: true });
            refreshCartCounts();
            _markHasOrderRows();
            return true;
        }

        // Poll DOM mỗi 2s cho đến khi #tposContent có rows (TposCommentList load async).
        // Sau 2 phút giảm xuống 5s safety check.
        let pollTries = 0;
        const pollTimer = setInterval(() => {
            pollTries++;
            _wireTposObserver();
            refreshCartCounts();
            _markHasOrderRows();
            if (pollTries === 60) {
                clearInterval(pollTimer);
                setInterval(() => {
                    _wireTposObserver();
                    _markHasOrderRows();
                }, 5000);
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
