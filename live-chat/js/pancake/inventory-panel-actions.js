// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Kho SP panel — CART actions (add/remove/clear/refreshCounts) + SSE + refresh.
// Module 3/4. Đọc deps qua shared namespace global.__PancakeInvPanelNS (state +
// render đã load trước). Bodies giữ verbatim; cross-ref render qua NS.<fn>.

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;
    const NS = global.__PancakeInvPanelNS || (global.__PancakeInvPanelNS = {});
    if (NS._actionsReady) return;
    NS._actionsReady = true;

    // Deps từ state + render (đã load trước).
    const STATE = NS.STATE;
    const API = NS.API;
    const _user = NS._user;
    const _resolveCommitContext = NS._resolveCommitContext;
    const _resolveLiveCustomer = NS._resolveLiveCustomer;

    // Auth header cho cart fetch (hardening 2026-06-29): gửi x-web2-token để backend
    // gate được /api/v2/cart/* (ENFORCE=1). Web2Auth.authHeaders merge token vào header;
    // fallback chỉ Content-Type nếu Web2Auth chưa load (soft — backend chỉ 401 khi ENFORCE).
    function _cartHeaders() {
        return global.Web2Auth && global.Web2Auth.authHeaders
            ? global.Web2Auth.authHeaders({ 'Content-Type': 'application/json' })
            : { 'Content-Type': 'application/json' };
    }

    // ─────────────────────────────────────────────────────────
    // Cart API — Optimistic UI: cập nhật badge NGAY khi drop, rollback nếu fail.
    // Drop vào comment chưa có giỏ → tự tạo giỏ hàng (entry đầu tiên trong cart_items).
    // Mỗi action add → show toast "Hoàn tác" 5s, click hoàn tác → remove ngay.
    // ─────────────────────────────────────────────────────────

    // groupKey = customerId (fbUserId) — cart gắn theo khách (URL param + cart key).
    // commentIdMeta = comment_id thật của row vừa drop — dùng để resolve FB page/post
    // từ LiveState.comments + truyền xuống native_order.fb_comment_id (audit + chat link).
    //
    // SAU REFACTOR 2026-05-22: backend /add ghi thẳng vào native_orders.products
    // ngay → không còn commit timer. 5s undo chỉ là UX window — undo = call /remove.
    // Pattern UI-first: optimistic badge + toast NGAY → backend chạy background.
    // Backend lỗi → rollback badge + remove toast optimistic + show error toast.
    // KHÔNG async/await ở caller path (drop event handler) — return ngay tức thì.
    // ponytail: in-flight dedup theo (commentId, productCode). Module-level Set
    // sống qua mọi lần drop — chặn 2 drop CÙNG SP khi request /add đang bay.
    const _addInflight = (NS._addInflight ||= new Set());

    function addToCart(groupKey, product, customer, commentIdMeta) {
        const commentId = groupKey;
        // #4 double-drop guard: drop thứ 2 cùng (commentId, code) khi request đang
        // bay → bỏ qua + báo nhẹ. Key xoá khi response settle (finally bên dưới).
        const _inflightKey = commentId + '::' + product.code;
        if (_addInflight.has(_inflightKey)) {
            NS._showToast(`⏳ Đang xử lý "${product.code}"…`, 'ok');
            return;
        }
        _addInflight.add(_inflightKey);
        const wasEmpty = !(STATE.cartCounts[commentId]?.qty > 0);
        const prev = STATE.cartCounts[commentId] || { items: 0, qty: 0 };
        // Step 1 — Optimistic UI INSTANT
        STATE.cartCounts[commentId] = {
            items: prev.items + 1,
            qty: prev.qty + 1,
        };
        NS._renderBadgeFor(commentId);
        const toast = NS._showUndoToast({
            title: wasEmpty
                ? `✓ Tạo giỏ hàng + thêm "${product.code}"`
                : `✓ Thêm "${product.code}" vào giỏ`,
            onUndo: () => {
                // Undo có thể fire trước khi /add response về. removeFromCart
                // gửi POST /remove độc lập — backend xử lý nếu product đã tồn
                // tại, no-op nếu chưa. Idempotent qua productCode merge.
                removeFromCart(commentId, product.code, { silent: true });
                NS._showToast('↶ Đã hoàn tác', 'ok');
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
                    headers: _cartHeaders(),
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
                    NS._renderBadgeFor(commentId);
                }
            } catch (e) {
                // Rollback optimistic + remove success toast + show error
                STATE.cartCounts[commentId] = prev;
                NS._renderBadgeFor(commentId);
                if (toast) {
                    toast._snapTickerCancel?.();
                    if (toast.parentNode) toast.remove();
                }
                NS._showToast(`✗ Lỗi thêm "${product.code}": ${e.message}`, 'err');
            } finally {
                // Xoá in-flight key khi response settle (success/fail) → cho phép
                // drop lại SP này. Undo trong 5s gọi removeFromCart độc lập, không
                // qua addToCart nên không đụng key.
                _addInflight.delete(_inflightKey);
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
        NS._renderBadgeFor(commentId);
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
        if (!opts.silent) NS._showToast(`✓ Đã xóa "${productCode}"`, 'ok');

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
                        headers: _cartHeaders(),
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
                NS._renderBadgeFor(commentId);
                // Restore popover row nếu còn mở
                if (openPop && removedItemRow && openPop.isConnected) {
                    if (removedItemNext && removedItemNext.parentNode === openPop) {
                        openPop.insertBefore(removedItemRow, removedItemNext);
                    } else {
                        openPop.appendChild(removedItemRow);
                    }
                }
                NS._showToast(`✗ Lỗi xóa "${productCode}": ${e.message}`, 'err');
            }
        })();
    }

    // Xóa toàn bộ đơn (clear order) — caller đã confirm trước khi gọi.
    function clearOrder(commentId) {
        // Step 1 — Optimistic UI INSTANT
        const prev = STATE.cartCounts[commentId];
        STATE.cartCounts[commentId] = { items: 0, qty: 0 };
        NS._renderBadgeFor(commentId);
        const openPop = document.querySelector(
            `.inv-cart-popover[data-cmt="${CSS.escape(commentId)}"]`
        );
        const popHtml = openPop ? openPop.outerHTML : null;
        const popParent = openPop ? openPop.parentNode : null;
        if (openPop) {
            openPop.remove();
            NS._popCleanup?.();
        }
        NS._showToast('✓ Đang xóa đơn...', 'ok');

        // Step 2 — Backend background
        (async () => {
            try {
                const r = await fetch(API + '/cart/' + encodeURIComponent(commentId) + '/clear', {
                    method: 'POST',
                    headers: _cartHeaders(),
                    credentials: 'include',
                    body: JSON.stringify({ user: _user() }),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'clear failed');
                NS._showToast(`✓ Đã xóa đơn (${d.removed} SP)`, 'ok');
            } catch (e) {
                STATE.cartCounts[commentId] = prev;
                NS._renderBadgeFor(commentId);
                // Restore popover nếu cần
                if (popHtml && popParent && popParent.isConnected) {
                    const tmp = document.createElement('div');
                    tmp.innerHTML = popHtml;
                    if (tmp.firstChild) popParent.appendChild(tmp.firstChild);
                }
                NS._showToast(`✗ Lỗi xóa đơn: ${e.message}`, 'err');
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
                NS.renderBadges();
                NS._markHasOrderRows();
            }
        } catch (e) {
            console.warn('[InventoryPanel] refreshCartCounts:', e.message);
        }
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
        // 2026-06-28: tab NCC trong panel lấy từ Sổ Order (loadTabsFromSoOrder) →
        // subscribe web2:so-order để tab NCC mới/đổi tên/xoá tự cập nhật (refresh()
        // đã reload tabs từ so-order). Trước đây chỉ web2:cart/native-orders/products.
        global.Web2SSE.subscribe('web2:so-order', _scheduleRefresh);
    }

    async function refresh() {
        const [tabs, products] = await Promise.all([NS.loadTabsFromSoOrder(), NS.loadProducts()]);
        STATE.tabs = tabs;
        STATE.products = products;
        NS.renderTabs();
        NS.applyFilter();
        refreshCartCounts();
    }

    // ── Export lên shared namespace ──
    NS.addToCart = addToCart;
    NS.removeFromCart = removeFromCart;
    NS.clearOrder = clearOrder;
    NS.refreshCartCounts = refreshCartCounts;
    NS._scheduleRefresh = _scheduleRefresh;
    NS._subscribeSSE = _subscribeSSE;
    NS.refresh = refresh;
})(typeof window !== 'undefined' ? window : globalThis);
