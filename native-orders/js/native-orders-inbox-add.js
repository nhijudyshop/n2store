// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — "Thêm đơn Inbox" modal (kho KH + Pancake search + inline cart). MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // In bill thermal 80mm cho các đơn được chọn (tạo PBH-shape object trong RAM,
    // không lưu DB — dùng Web2Bill template). Hữu ích preview trước khi tạo PBH.
    // 2026-06-04: Thêm đơn Inbox — nhập KH (tìm từ kho web2 → autofill tên/SĐT/địa
    // chỉ), tạo đơn channel='web2_inbox'.
    // 2026-06-05: picker SP inline (giỏ ngay trong modal, KHÔNG bắt buộc) + bind
    // fbId từ KH để avatar/hội thoại Pancake hoạt động (xem create-manual backend).
    NO.openAddInboxOrder = async function openAddInboxOrder() {
        const overlay = document.createElement('div');
        overlay.className = 'no-add-modal-overlay';
        overlay.innerHTML = `
          <div class="no-add-modal no-add-modal--wide">
            <div class="no-add-modal-head">
              <strong><i data-lucide="inbox"></i> Thêm đơn Inbox</strong>
              <button class="no-add-close" type="button" aria-label="Đóng">✕</button>
            </div>
            <div class="no-add-modal-body">
              <label>Khách hàng (gõ tên / SĐT — tìm kho KH trước, không có thì tìm Pancake)</label>
              <div class="no-add-search-wrap">
                <input type="text" id="noAddCustSearch" placeholder="Gõ tên / SĐT — tìm kho KH, fallback Pancake để nhắn tin được..." autocomplete="off" />
                <div class="no-add-suggest" id="noAddSuggest" hidden></div>
              </div>
              <div class="no-add-selected" id="noAddSelected" hidden></div>
              <div class="no-add-fb-status" id="noAddFbStatus" hidden></div>
              <div class="no-add-fb-rebind" id="noAddFbRebind" hidden>
                <div class="no-add-fb-rebind-head"><i data-lucide="search"></i> Gán Facebook đúng — tìm hội thoại Pancake theo tên / SĐT (giữ nguyên tên + SĐT đơn)</div>
                <div class="no-add-search-wrap">
                  <input type="text" id="noAddFbRebindSearch" placeholder="Tìm hội thoại Pancake (tên / SĐT) để gán đúng Facebook..." autocomplete="off" />
                  <div class="no-add-suggest" id="noAddFbRebindSuggest" hidden></div>
                </div>
              </div>
              <div class="no-add-row">
                <div><label>Tên</label><input type="text" id="noAddName" /></div>
                <div><label>SĐT</label><input type="text" id="noAddPhone" /></div>
              </div>
              <label>Địa chỉ</label>
              <input type="text" id="noAddAddress" />

              <div class="no-add-prod-section">
                <label>Sản phẩm vào giỏ <span class="no-add-prod-hint">(tuỳ chọn — tạo giỏ trống cũng được)</span></label>
                <div class="no-add-search-wrap">
                  <input type="text" id="noAddProdSearch" placeholder="Tìm SP theo mã / tên để thêm vào giỏ..." autocomplete="off" />
                  <div class="no-add-suggest" id="noAddProdSuggest" hidden></div>
                </div>
                <div class="no-add-cart" id="noAddCart"></div>
              </div>
            </div>
            <div class="no-add-modal-foot">
              <span class="no-add-cart-total" id="noAddCartTotal"></span>
              <button class="no-add-cancel" type="button">Huỷ</button>
              <button class="no-add-create" type="button"><i data-lucide="check"></i> <span class="no-add-create-label">Tạo giỏ hàng</span></button>
            </div>
          </div>`;
        document.body.appendChild(overlay);
        if (window.lucide) lucide.createIcons();
        let selectedCustomerId = null;
        let selectedFbId = null;
        let selectedFbPageId = null;
        let selectedFbUserName = null;
        let selectedConversationId = null;
        let selectedAvatarUrl = null;
        const cart = []; // [{productCode,name,price,quantity,total,imageUrl}]
        const close = () => overlay.remove();
        overlay.querySelector('.no-add-close').onclick = close;
        overlay.querySelector('.no-add-cancel').onclick = close;
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) close();
        });

        // ---- Customer search (kho KH TRƯỚC → Pancake fallback) ----
        // 1) Tìm trong kho KH (web2_customers) trước — nhanh, local, đỡ gọi Pancake
        //    mỗi lần gõ. 2) Kho KH KHÔNG có → mới fetch hội thoại Pancake (đủ
        //    fb_id + page_id). Khi chọn KH từ kho mà thiếu page → dò page nền theo
        //    SĐT để đơn vẫn nhắn tin được. SĐT/địa chỉ có thể điền sau.
        const searchInp = overlay.querySelector('#noAddCustSearch');
        const suggest = overlay.querySelector('#noAddSuggest');
        const fbStatus = overlay.querySelector('#noAddFbStatus');
        const selectedChip = overlay.querySelector('#noAddSelected');
        let timer = null;
        let searchSeq = 0;
        let selToken = 0; // invalidate background page-resolve khi đổi/bỏ chọn

        // Avatar Facebook KH (theo Pancake) — ưu tiên avatar_url thật từ hội thoại,
        // fallback proxy /api/fb-avatar theo fbId. Không có fb context → chữ cái đầu.
        const avatarHtml = (name, fbId, pageId, avatarUrl) => {
            const initial = NO.escapeHtml(((name || '?').trim().charAt(0) || '?').toUpperCase());
            const color = (NO.avatarColor && NO.avatarColor(name)) || '#7c8aa0';
            const url =
                avatarUrl || (fbId && NO._isRealFbId(fbId) ? NO._avatarUrl(fbId, pageId) : '');
            if (!url) {
                return `<span class="no-add-av" style="background:${color}">${initial}</span>`;
            }
            return `<span class="no-add-av" style="background:${color}"><span class="no-add-av-ini">${initial}</span><img class="no-add-av-img" src="${NO.escapeHtml(url)}" alt="" loading="lazy" onload="this.classList.add('loaded')" onerror="this.remove()"></span>`;
        };

        // Chip "KH đã chọn" — hiện avatar + tên + SĐT + nguồn, kèm nút "Đổi khách"
        // để tìm lại nếu nhầm KH (clear binding + focus lại ô tìm).
        const renderSelectedChip = () => {
            if (!selectedFbId && !selectedCustomerId) {
                selectedChip.hidden = true;
                selectedChip.innerHTML = '';
                return;
            }
            const name =
                selectedFbUserName || overlay.querySelector('#noAddName').value.trim() || '—';
            const phone = overlay.querySelector('#noAddPhone').value.trim();
            const srcLabel = selectedFbPageId
                ? 'Facebook · nhắn tin được'
                : selectedFbId
                  ? 'Facebook'
                  : 'Kho KH';
            selectedChip.innerHTML = `
                ${avatarHtml(name, selectedFbId, selectedFbPageId, selectedAvatarUrl)}
                <span class="no-add-selected-info">
                    <strong>${NO.escapeHtml(name)}</strong>${phone ? ' · ' + NO.escapeHtml(phone) : ''}
                    <span class="no-add-selected-src">Đã chọn · ${srcLabel}</span>
                </span>
                <span class="no-add-selected-actions">
                    <button type="button" class="no-add-selected-rebind" title="Gán Facebook khác (nếu tự dò nhầm hội thoại) — giữ nguyên tên + SĐT"><i data-lucide="repeat"></i> Gán FB khác</button>
                    <button type="button" class="no-add-selected-change" title="Đổi khách / tìm lại"><i data-lucide="rotate-ccw"></i> Đổi khách</button>
                </span>`;
            selectedChip.hidden = false;
            if (window.lucide) lucide.createIcons();
        };

        // Bỏ chọn KH hiện tại → tìm lại từ đầu.
        const clearSelection = () => {
            selToken++;
            selectedCustomerId = null;
            selectedFbId = null;
            selectedFbPageId = null;
            selectedFbUserName = null;
            selectedConversationId = null;
            selectedAvatarUrl = null;
            renderSelectedChip();
            setFbStatus();
        };

        selectedChip.addEventListener('click', (e) => {
            // "Gán FB khác" → mở panel tìm hội thoại Pancake để gán lại đúng Facebook
            // (giữ nguyên tên/SĐT của đơn). Dùng khi auto-dò theo SĐT chọn nhầm FB.
            if (e.target.closest('.no-add-selected-rebind')) {
                openFbRebind();
                return;
            }
            if (!e.target.closest('.no-add-selected-change')) return;
            clearSelection();
            closeFbRebind();
            searchInp.value = '';
            searchInp.focus();
        });

        const setFbStatus = (resolving = false) => {
            if (selectedFbId && selectedFbPageId) {
                fbStatus.className = 'no-add-fb-status is-ok';
                fbStatus.innerHTML = `<i data-lucide="message-circle"></i> Đã gắn Facebook — đơn này nhắn tin được (page …${NO.escapeHtml(String(selectedFbPageId).slice(-6))})`;
                fbStatus.hidden = false;
            } else if (selectedFbId && resolving) {
                fbStatus.className = 'no-add-fb-status is-warn';
                fbStatus.innerHTML = `<i data-lucide="loader"></i> Đang dò hội thoại Pancake theo SĐT…`;
                fbStatus.hidden = false;
            } else if (selectedFbId) {
                fbStatus.className = 'no-add-fb-status is-warn';
                fbStatus.innerHTML = `<i data-lucide="alert-triangle"></i> Có fb_id nhưng thiếu page — sẽ tự dò khi mở chat`;
                fbStatus.hidden = false;
            } else {
                fbStatus.hidden = true;
            }
            if (window.lucide) lucide.createIcons();
        };

        const whItemHtml = (c) =>
            `<button type="button" class="no-add-suggest-item no-add-suggest-flex" data-src="warehouse" data-id="${c.id || ''}" data-fbid="${NO.escapeHtml(c.fbId || '')}" data-name="${NO.escapeHtml(c.name || '')}" data-phone="${NO.escapeHtml(c.phone || '')}" data-address="${NO.escapeHtml(c.address || '')}">
                ${avatarHtml(c.name, c.fbId, '', '')}
                <span class="no-add-suggest-main">
                    <span class="no-add-suggest-line"><strong>${NO.escapeHtml(c.name || '—')}</strong>${c.phone ? ' · ' + NO.escapeHtml(c.phone) : ''}</span>
                    <span class="no-add-suggest-addr">Kho KH${c.address ? ' · ' + NO.escapeHtml(c.address) : ''}</span>
                </span>
            </button>`;
        const pkItemHtml = (c) =>
            `<button type="button" class="no-add-suggest-item no-add-suggest-pk no-add-suggest-flex" data-src="pancake" data-fbid="${NO.escapeHtml(c.fbId)}" data-pageid="${NO.escapeHtml(c.pageId || '')}" data-convid="${NO.escapeHtml(c.conversationId || '')}" data-name="${NO.escapeHtml(c.name || '')}" data-phone="${NO.escapeHtml(c.phone || '')}" data-avatar="${NO.escapeHtml(c.avatarUrl || '')}">
                ${avatarHtml(c.name, c.fbId, c.pageId, c.avatarUrl)}
                <span class="no-add-suggest-main">
                    <span class="no-add-suggest-line"><span class="no-add-suggest-badge"><i data-lucide="message-circle"></i> Nhắn được</span><strong>${NO.escapeHtml(c.name || '—')}</strong>${c.phone ? ' · ' + NO.escapeHtml(c.phone) : ''}</span>
                    <span class="no-add-suggest-addr">Facebook${c.isInbox ? ' · Inbox' : ''} · page …${NO.escapeHtml(String(c.pageId || '').slice(-6))}</span>
                </span>
            </button>`;

        // ---- Gán lại Facebook (re-bind) — tìm hội thoại Pancake (CHỈ Pancake) để
        // gán đúng FB context cho đơn khi auto-dò theo SĐT chọn nhầm. GIỮ NGUYÊN
        // tên + SĐT đang nhập (chỉ bù khi field rỗng). ----
        const fbRebind = overlay.querySelector('#noAddFbRebind');
        const fbRebindInp = overlay.querySelector('#noAddFbRebindSearch');
        const fbRebindSuggest = overlay.querySelector('#noAddFbRebindSuggest');
        let fbRebindTimer = null;
        let fbRebindSeq = 0;

        const openFbRebind = () => {
            fbRebind.hidden = false;
            const phone = overlay.querySelector('#noAddPhone').value.trim();
            const nm = overlay.querySelector('#noAddName').value.trim();
            fbRebindInp.value = phone || nm || '';
            fbRebindSuggest.hidden = true;
            fbRebindInp.focus();
            if (fbRebindInp.value.trim().length >= 2) {
                fbRebindInp.dispatchEvent(new Event('input', { bubbles: true }));
            }
        };
        const closeFbRebind = () => {
            fbRebind.hidden = true;
            fbRebindSuggest.hidden = true;
        };

        fbRebindInp.addEventListener('input', () => {
            clearTimeout(fbRebindTimer);
            const q = fbRebindInp.value.trim();
            if (q.length < 2) {
                fbRebindSuggest.hidden = true;
                return;
            }
            fbRebindTimer = setTimeout(async () => {
                const seq = ++fbRebindSeq;
                fbRebindSuggest.innerHTML =
                    '<div class="no-add-suggest-empty">Đang tìm hội thoại Pancake…</div>';
                fbRebindSuggest.hidden = false;
                const pancake = await NO._searchPancakeCustomers(q).catch(() => []);
                if (seq !== fbRebindSeq) return;
                if (!pancake.length) {
                    fbRebindSuggest.innerHTML =
                        '<div class="no-add-suggest-empty">Không tìm thấy hội thoại Pancake khớp — thử tên/SĐT khác.</div>';
                    fbRebindSuggest.hidden = false;
                    return;
                }
                fbRebindSuggest.innerHTML = pancake.map(pkItemHtml).join('');
                fbRebindSuggest.hidden = false;
                if (window.lucide) lucide.createIcons();
            }, 320);
        });

        fbRebindSuggest.addEventListener('click', (e) => {
            const item = e.target.closest('.no-add-suggest-item');
            if (!item || item.dataset.src !== 'pancake') return;
            selToken++; // huỷ background phone-resolve cũ (tránh ghi đè FB vừa gán)
            selectedFbId = item.dataset.fbid || null;
            selectedFbPageId = item.dataset.pageid || null;
            selectedConversationId = item.dataset.convid || null;
            selectedFbUserName = item.dataset.name || selectedFbUserName;
            selectedAvatarUrl = item.dataset.avatar || null;
            // Giữ tên/SĐT đơn; chỉ bù khi đang rỗng.
            const nameEl = overlay.querySelector('#noAddName');
            const phoneEl = overlay.querySelector('#noAddPhone');
            if (!nameEl.value.trim() && item.dataset.name) nameEl.value = item.dataset.name;
            if (!phoneEl.value.trim() && item.dataset.phone) phoneEl.value = item.dataset.phone;
            closeFbRebind();
            renderSelectedChip();
            setFbStatus();
            NO.notify('Đã gán lại Facebook cho đơn này', 'success');
        });

        searchInp.addEventListener('input', () => {
            clearTimeout(timer);
            // Gõ lại → bỏ chọn cũ (tránh giữ fb context của khách trước).
            selToken++;
            selectedCustomerId = null;
            selectedFbId = null;
            selectedFbPageId = null;
            selectedFbUserName = null;
            selectedConversationId = null;
            selectedAvatarUrl = null;
            renderSelectedChip();
            closeFbRebind();
            setFbStatus();
            const q = searchInp.value.trim();
            if (q.length < 2) {
                suggest.hidden = true;
                return;
            }
            timer = setTimeout(async () => {
                const seq = ++searchSeq;
                suggest.innerHTML =
                    '<div class="no-add-suggest-empty">Đang tìm trong kho KH…</div>';
                suggest.hidden = false;
                // 1) KHO KH TRƯỚC — /customers/search auth-gated (PII) → x-web2-token. (audit 2026-06-30)
                let w2Headers = {};
                if (window.Web2Auth?.authHeaders) {
                    w2Headers = window.Web2Auth.authHeaders();
                } else {
                    try {
                        const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                        if (t) w2Headers = { 'x-web2-token': t };
                    } catch {
                        /* no token */
                    }
                }
                const warehouse = await fetch(
                    `${NO.WORKER_URL}/api/web2/customers/search?search=${encodeURIComponent(q)}&limit=8`,
                    { credentials: 'include', headers: w2Headers }
                )
                    .then((r) => r.json())
                    .then((j) => j.data || [])
                    .catch(() => []);
                if (seq !== searchSeq) return; // kết quả cũ — bỏ
                if (warehouse.length) {
                    suggest.innerHTML = warehouse.map(whItemHtml).join('');
                    suggest.hidden = false;
                    if (window.lucide) lucide.createIcons();
                    return;
                }
                // 2) KHO KH RỖNG → FALLBACK PANCAKE
                suggest.innerHTML =
                    '<div class="no-add-suggest-empty">Kho KH không có — đang tìm trên Pancake…</div>';
                const pancake = await NO._searchPancakeCustomers(q).catch(() => []);
                if (seq !== searchSeq) return;
                if (!pancake.length) {
                    suggest.innerHTML =
                        '<div class="no-add-suggest-empty">Không tìm thấy — nhập tay bên dưới (có thể bổ sung Facebook sau)</div>';
                    suggest.hidden = false;
                    return;
                }
                suggest.innerHTML = pancake.map(pkItemHtml).join('');
                suggest.hidden = false;
                if (window.lucide) lucide.createIcons();
            }, 320);
        });

        suggest.addEventListener('click', (e) => {
            const item = e.target.closest('.no-add-suggest-item');
            if (!item) return;
            const nameEl = overlay.querySelector('#noAddName');
            const phoneEl = overlay.querySelector('#noAddPhone');
            const addrEl = overlay.querySelector('#noAddAddress');
            const myTok = ++selToken;
            nameEl.value = item.dataset.name || '';
            // SĐT/địa chỉ: chỉ ghi đè nếu có (Pancake có thể thiếu — điền sau).
            if (item.dataset.phone) phoneEl.value = item.dataset.phone;
            if (item.dataset.address) addrEl.value = item.dataset.address;
            if (item.dataset.src === 'pancake') {
                selectedCustomerId = null;
                selectedFbId = item.dataset.fbid || null;
                selectedFbPageId = item.dataset.pageid || null;
                selectedConversationId = item.dataset.convid || null;
                selectedFbUserName = item.dataset.name || null;
                selectedAvatarUrl = item.dataset.avatar || null;
                suggest.hidden = true;
                searchInp.value = '';
                renderSelectedChip();
                setFbStatus();
            } else {
                // Kho KH: có fb_id nhưng thiếu page → dò hội thoại Pancake theo SĐT
                // nền để đơn nhắn tin được (không chặn thao tác).
                selectedCustomerId = item.dataset.id || null;
                selectedFbId = item.dataset.fbid || null;
                selectedFbPageId = null;
                selectedConversationId = null;
                selectedFbUserName = item.dataset.name || null;
                selectedAvatarUrl = null; // avatar lấy qua proxy theo fbId (nếu có)
                suggest.hidden = true;
                searchInp.value = '';
                renderSelectedChip();
                const phoneForResolve = item.dataset.phone || '';
                if (phoneForResolve) {
                    setFbStatus(true); // "đang dò…"
                    NO._resolveInboxConvByPhone(phoneForResolve)
                        .then((r) => {
                            if (myTok !== selToken) return; // user đã đổi chọn
                            if (r && r.fbId) {
                                if (!NO._isRealFbId(selectedFbId)) selectedFbId = r.fbId;
                                selectedFbPageId = r.pageId || selectedFbPageId;
                                selectedConversationId = r.conversationId || selectedConversationId;
                                if (!selectedFbUserName && r.name) selectedFbUserName = r.name;
                                if (r.avatarUrl) selectedAvatarUrl = r.avatarUrl;
                            }
                            renderSelectedChip();
                            setFbStatus();
                        })
                        .catch(() => {
                            if (myTok === selToken) setFbStatus();
                        });
                } else {
                    setFbStatus();
                }
            }
        });

        // ---- Product picker (inline cart) ----
        const prodInp = overlay.querySelector('#noAddProdSearch');
        const prodSuggest = overlay.querySelector('#noAddProdSuggest');
        const cartEl = overlay.querySelector('#noAddCart');
        const totalEl = overlay.querySelector('#noAddCartTotal');
        const createLabel = overlay.querySelector('.no-add-create-label');
        let prodCache = null; // lazy-loaded full product list

        const renderCart = () => {
            if (!cart.length) {
                cartEl.innerHTML =
                    '<div class="no-add-cart-empty">Chưa có SP — tạo giỏ trống cũng được.</div>';
            } else {
                cartEl.innerHTML = cart
                    .map(
                        (l, i) => `
                        <div class="no-add-cart-row" data-i="${i}">
                            <div class="no-add-cart-info">
                                <div class="no-add-cart-name">${NO.escapeHtml(l.name)}</div>
                                <div class="no-add-cart-code">${NO.escapeHtml(l.productCode)} · ${(l.price || 0).toLocaleString('vi-VN')}đ</div>
                            </div>
                            <input type="number" class="no-add-cart-qty" min="1" value="${l.quantity}" data-i="${i}" />
                            <div class="no-add-cart-line-total">${(l.total || 0).toLocaleString('vi-VN')}đ</div>
                            <button type="button" class="no-add-cart-rm" data-i="${i}" title="Xoá">✕</button>
                        </div>`
                    )
                    .join('');
            }
            const totalQty = cart.reduce((s, l) => s + (Number(l.quantity) || 0), 0);
            const totalAmt = cart.reduce((s, l) => s + (Number(l.total) || 0), 0);
            totalEl.textContent = cart.length
                ? `${totalQty} SP · ${totalAmt.toLocaleString('vi-VN')}đ`
                : '';
            createLabel.textContent = cart.length
                ? `Tạo giỏ hàng (${totalQty} SP)`
                : 'Tạo giỏ hàng';
        };
        renderCart();

        const addToCart = (p) => {
            const existing = cart.find((l) => l.productCode === p.code);
            if (existing) {
                existing.quantity = (Number(existing.quantity) || 0) + 1;
                existing.total = existing.quantity * existing.price;
            } else {
                const userInfo = window.Web2UserInfo?.get('native-orders') || {};
                cart.push({
                    productCode: p.code,
                    name: p.name || p.code,
                    variant: p.variant || '',
                    price: Number(p.price) || 0,
                    quantity: 1,
                    total: Number(p.price) || 0,
                    imageUrl: p.imageUrl || null,
                    note: '',
                    source: 'native',
                    addedBy: userInfo.userName || null,
                    addedById: userInfo.userId || null,
                });
            }
            renderCart();
        };

        const renderProdResults = (q) => {
            if (prodCache === null) {
                prodSuggest.innerHTML = '<div class="no-add-suggest-empty">Đang tải kho SP…</div>';
                prodSuggest.hidden = false;
                return;
            }
            const qn = NO.stripVi(q);
            const filtered = qn
                ? prodCache.filter(
                      (p) => NO.stripVi(p.code).includes(qn) || NO.stripVi(p.name).includes(qn)
                  )
                : prodCache;
            const items = filtered.slice(0, 12);
            if (!items.length) {
                prodSuggest.innerHTML =
                    '<div class="no-add-suggest-empty">Không tìm thấy SP khớp.</div>';
                prodSuggest.hidden = false;
                return;
            }
            prodSuggest.innerHTML = items
                .map(
                    (p) =>
                        `<button type="button" class="no-add-suggest-item no-add-prod-item" data-code="${NO.escapeHtml(p.code)}"><strong>${NO.escapeHtml(p.name || p.code)}</strong> · ${(p.price || 0).toLocaleString('vi-VN')}đ<div class="no-add-suggest-addr">Mã: ${NO.escapeHtml(p.code)}</div></button>`
                )
                .join('');
            prodSuggest.hidden = false;
        };

        const ensureProdCache = async () => {
            if (prodCache !== null) return;
            try {
                const resp = await window.NativeOrdersApi.searchProducts({
                    search: '',
                    limit: 1000,
                });
                prodCache = resp.products || [];
            } catch (e) {
                console.warn('[inbox-add] product cache load failed:', e.message);
                prodCache = [];
            }
        };

        let prodTimer = null;
        prodInp.addEventListener('focus', async () => {
            await ensureProdCache();
            if (prodInp.value.trim().length >= 1) renderProdResults(prodInp.value.trim());
        });
        prodInp.addEventListener('input', () => {
            clearTimeout(prodTimer);
            const q = prodInp.value.trim();
            if (!q) {
                prodSuggest.hidden = true;
                return;
            }
            prodTimer = setTimeout(async () => {
                await ensureProdCache();
                renderProdResults(q);
            }, 200);
        });
        prodSuggest.addEventListener('click', (e) => {
            const item = e.target.closest('.no-add-prod-item');
            if (!item) return;
            const code = item.dataset.code;
            const p = (prodCache || []).find((x) => x.code === code);
            if (p) addToCart(p);
            prodInp.value = '';
            prodSuggest.hidden = true;
            prodInp.focus();
        });
        // Cart row interactions (qty change + remove)
        cartEl.addEventListener('input', (e) => {
            const qtyInp = e.target.closest('.no-add-cart-qty');
            if (!qtyInp) return;
            const i = Number(qtyInp.dataset.i);
            const line = cart[i];
            if (!line) return;
            const v = Math.max(1, parseInt(qtyInp.value, 10) || 1);
            line.quantity = v;
            line.total = v * line.price;
            renderCart();
        });
        cartEl.addEventListener('click', (e) => {
            const rm = e.target.closest('.no-add-cart-rm');
            if (!rm) return;
            const i = Number(rm.dataset.i);
            cart.splice(i, 1);
            renderCart();
        });
        // Đóng suggest khi click ngoài
        overlay.addEventListener('click', (e) => {
            if (!e.target.closest('#noAddProdSearch') && !e.target.closest('#noAddProdSuggest')) {
                prodSuggest.hidden = true;
            }
            if (!e.target.closest('#noAddCustSearch') && !e.target.closest('#noAddSuggest')) {
                suggest.hidden = true;
            }
            if (
                !e.target.closest('#noAddFbRebindSearch') &&
                !e.target.closest('#noAddFbRebindSuggest')
            ) {
                fbRebindSuggest.hidden = true;
            }
        });

        overlay.querySelector('.no-add-create').onclick = async () => {
            const name = overlay.querySelector('#noAddName').value.trim();
            const phone = overlay.querySelector('#noAddPhone').value.trim();
            const address = overlay.querySelector('#noAddAddress').value.trim();
            if (!name && !phone) {
                NO.notify('Cần tên hoặc SĐT khách', 'warning');
                return;
            }
            const btn = overlay.querySelector('.no-add-create');
            btn.disabled = true;
            try {
                const resp = await window.NativeOrdersApi.createManual({
                    customerName: name,
                    phone,
                    address,
                    customerId: selectedCustomerId,
                    fbUserId: selectedFbId || undefined,
                    fbPageId: selectedFbPageId || undefined,
                    fbUserName: selectedFbUserName || undefined,
                    conversationId: selectedConversationId || undefined,
                    products: cart.map((l) => ({
                        productCode: l.productCode,
                        name: l.name,
                        price: l.price,
                        quantity: l.quantity,
                        total: l.total,
                        imageUrl: l.imageUrl,
                        note: l.note,
                        source: l.source,
                        addedBy: l.addedBy,
                        addedById: l.addedById,
                    })),
                });
                const code = resp.order?.code;
                NO.notify(
                    cart.length
                        ? `Đã tạo giỏ hàng inbox ${code} (${cart.length} SP)`
                        : `Đã tạo giỏ hàng inbox ${code}`,
                    'success'
                );
                close();
                await NO.load();
            } catch (e) {
                btn.disabled = false;
                NO.notify('Lỗi tạo giỏ hàng: ' + e.message, 'error');
            }
        };
        setTimeout(() => searchInp.focus(), 50);
    };
})();
