// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
//
// Kho SP panel — RENDER + drag/drop + badge + popover + toast. Module 2/4.
// Đọc deps qua shared namespace global.__PancakeInvPanelNS (state module 1/4),
// gọi cart action (module 3/4) qua NS.<fn> vì load sau. Bodies giữ verbatim.

(function (global) {
    'use strict';

    if (global.PancakeInventoryPanel) return;
    const NS = global.__PancakeInvPanelNS || (global.__PancakeInvPanelNS = {});
    if (NS._renderReady) return;
    NS._renderReady = true;

    // Deps từ state module (đã load trước).
    const STATE = NS.STATE;
    const escapeHtml = NS.escapeHtml;
    const fmtPrice = NS.fmtPrice;
    const _relTime = NS._relTime;
    const applyFilter = NS.applyFilter;
    const _getCmtMap = NS._getCmtMap;
    const _resolveLiveCustomer = NS._resolveLiveCustomer;
    const API = NS.API;
    const LS_SHOW_OOS_KEY = NS.LS_SHOW_OOS_KEY;

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
        document.getElementById('invRefresh').addEventListener('click', NS.refresh);
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
                return `<div class="inv-card${isOos ? ' oos' : ''}" draggable="${!isOos}" data-product='${productJson}'>
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
            NS.addToCart(groupKey, product, customer, commentId);
        });
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

    async function togglePopover(commentId, row) {
        const existing = document.querySelector('.inv-cart-popover');
        if (existing) {
            const wasFor = existing.dataset.cmt;
            existing.remove();
            NS._popCleanup?.();
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
                    <strong>🛒 Giỏ hàng (${d.items?.length || 0} SP)</strong>
                    <span class="inv-cart-pop-total">Tổng: ${fmtPrice(total)}</span>
                    <button class="inv-cart-pop-history" title="Xem lịch sử (15 ngày)">⏱ Lịch sử</button>
                    ${
                        (d.items?.length || 0) > 0
                            ? '<button class="inv-cart-pop-clear" title="Xóa toàn bộ giỏ (kéo nhầm)">Xóa giỏ</button>'
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
                if (NS._popCleanup === cleanup) NS._popCleanup = null;
            };
            NS._popCleanup?.();
            NS._popCleanup = cleanup;
            pop.querySelector('.inv-cart-pop-close').onclick = () => {
                pop.remove();
                cleanup();
            };
            // Xóa SP khỏi đơn — KHÔNG confirm (UX nhanh)
            pop.querySelectorAll('[data-action="remove"]').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const code = btn.closest('[data-code]').dataset.code;
                    NS.removeFromCart(commentId, code);
                };
            });
            // Xóa toàn bộ đơn — CÓ confirm (Web2Popup, không phải native confirm)
            const clearBtn = pop.querySelector('.inv-cart-pop-clear');
            if (clearBtn) {
                clearBtn.onclick = async (e) => {
                    e.stopPropagation();
                    const ok = await global.Popup.danger(
                        `Xóa toàn bộ đơn? ${d.items.length} SP sẽ bị xóa. (Dùng khi kéo nhầm)`,
                        { okText: 'Xóa đơn', cancelText: 'Hủy' }
                    );
                    if (ok) NS.clearOrder(commentId);
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

    // ── Export lên shared namespace ──
    NS.renderShell = renderShell;
    NS.renderTabs = renderTabs;
    NS.renderProductList = renderProductList;
    NS.attachAddButtons = attachAddButtons;
    NS._addProductToComposer = _addProductToComposer;
    NS.attachDragSources = attachDragSources;
    NS.attachDropTargets = attachDropTargets;
    NS._markHasOrderRows = _markHasOrderRows;
    NS._renderBadgeForRow = _renderBadgeForRow;
    NS._renderBadgeFor = _renderBadgeFor;
    NS.renderBadges = renderBadges;
    NS.togglePopover = togglePopover;
    NS.renderCartPopover = renderCartPopover;
    NS._showUndoToast = _showUndoToast;
    NS.openCartHistory = openCartHistory;
    NS._showToast = _showToast;
    // applyFilter (state module) gọi renderProductList — wire qua NS để state thấy.
    NS.renderProductList = renderProductList;
})(typeof window !== 'undefined' ? window : globalThis);
