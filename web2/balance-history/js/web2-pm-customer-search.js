// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// W2PM customer-search — tra cứu KH: kho Web 2.0 (web2_customers) +
// Pancake phone-based chat-customer fallback + lazy FB-inline list
// (IntersectionObserver). MOVE-only split của web2-pending-match.js.
// =====================================================================

(function (global) {
    'use strict';

    const W2PM = global.W2PM || (global.W2PM = {});

    async function _searchCustomers(query) {
        const q = String(query || '').trim();
        if (q.length < 2) return [];
        if (W2PM._customSearchCache.has(q)) return W2PM._customSearchCache.get(q);
        const url = (base) =>
            `${base}?search=${encodeURIComponent(q)}&limit=8&sort=last_order_date&order=desc`;
        const tryFetch = async (base) => {
            // /customers/search nay gate requireWeb2AuthSoft → BẮT BUỘC gửi x-web2-token
            // (ENFORCE đang bật prod), nếu không 401.
            const r = await fetch(url(base), {
                headers: W2PM.authHeaders ? W2PM.authHeaders() : {},
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            const arr = Array.isArray(data?.customers)
                ? data.customers
                : Array.isArray(data?.data)
                  ? data.data
                  : Array.isArray(data)
                    ? data
                    : [];
            return arr
                .map((c) => ({
                    phone: c.phone || '',
                    name: c.name || c.full_name || '',
                    id: c.id || c.customer_id || null,
                }))
                .filter((c) => c.phone);
        };
        try {
            const out = await tryFetch(W2PM.CUSTOMER_SEARCH_BASE);
            W2PM._customSearchCache.set(q, out);
            return out;
        } catch {
            try {
                const out = await tryFetch(W2PM.CUSTOMER_SEARCH_FALLBACK);
                W2PM._customSearchCache.set(q, out);
                return out;
            } catch (e) {
                console.warn('[Web2PendingMatch] custom search fail:', e.message);
                return [];
            }
        }
    }

    // Gợi ý tên KH từ HỘI THOẠI PANCAKE theo SĐT (recent_phone_numbers chính là
    // SĐT khách tự gõ trong chat → đáng tin để gán ví đúng người).
    async function _searchPancakeByPhone(query) {
        const digits = String(query || '').replace(/\D/g, '');
        if (digits.length < 4) return []; // chỉ tìm Pancake khi giống SĐT
        if (W2PM._pancakeSearchCache.has(digits)) return W2PM._pancakeSearchCache.get(digits);
        // Delegate to shared Web2PancakeImport (1 nguồn Pancake fallback). Giữ
        // cache wrapper ở đây (shared cố ý không cache). Caller chỉ đọc name/phone
        // nên field source ('pancake' vs 'fb' cũ) + fbId/pageId thêm là vô hại.
        if (window.Web2PancakeImport?.searchByPhone) {
            const res = await window.Web2PancakeImport.searchByPhone(query);
            W2PM._pancakeSearchCache.set(digits, res);
            return res;
        }
        const Web2Chat = window.Web2Chat;
        if (!Web2Chat || !Web2Chat.searchConversations) return [];
        try {
            if (Web2Chat.syncFromRenderDB) await Web2Chat.syncFromRenderDB().catch(() => {});
        } catch (_) {}
        const pages = Object.keys(
            (Web2Chat.getAllPageAccessTokens && Web2Chat.getAllPageAccessTokens()) || {}
        );
        if (!pages.length) return [];
        const seen = new Set();
        const out = [];
        await Promise.all(
            pages.map(async (pg) => {
                try {
                    const r = await Web2Chat.searchConversations(pg, digits);
                    if (!r || !r.ok) return;
                    for (const c of r.conversations || []) {
                        const name =
                            (c.customers && c.customers[0] && c.customers[0].name) ||
                            (c.from && c.from.name) ||
                            '';
                        const phones = (c.recent_phone_numbers || [])
                            .map((x) => x && x.phone_number)
                            .filter(Boolean);
                        const phone =
                            phones.find((p) => String(p).replace(/\D/g, '').includes(digits)) ||
                            phones[0] ||
                            '';
                        if (!phone || !name) continue; // cần cả SĐT + tên mới gợi ý
                        const key = phone + '|' + name;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        out.push({ name, phone, source: 'fb' });
                    }
                } catch (_) {}
            })
        );
        const res = out.slice(0, 8);
        W2PM._pancakeSearchCache.set(digits, res);
        return res;
    }

    // ---- Inline list KH từ hội thoại Facebook (hiện luôn trong card) ----
    async function _fetchFbByTail(tail) {
        const digits = String(tail || '').replace(/\D/g, '');
        if (digits.length < 4) return [];
        if (W2PM._fbTailCache.has(digits)) return W2PM._fbTailCache.get(digits);
        const Web2Chat = window.Web2Chat;
        if (!Web2Chat || !Web2Chat.searchConversations) return [];
        try {
            if (Web2Chat.syncFromRenderDB) await Web2Chat.syncFromRenderDB().catch(() => {});
        } catch (_) {}
        const pages = Object.keys(
            (Web2Chat.getAllPageAccessTokens && Web2Chat.getAllPageAccessTokens()) || {}
        );
        if (!pages.length) return [];
        const seen = new Set();
        const out = [];
        await Promise.all(
            pages.map(async (pg) => {
                try {
                    const r = await Web2Chat.searchConversations(pg, digits);
                    if (!r || !r.ok) return;
                    for (const c of r.conversations || []) {
                        const name =
                            (c.customers && c.customers[0] && c.customers[0].name) ||
                            (c.from && c.from.name) ||
                            '';
                        const phones = (c.recent_phone_numbers || [])
                            .map((x) => x && x.phone_number)
                            .filter(Boolean);
                        const phone =
                            phones.find((p) => String(p).replace(/\D/g, '').includes(digits)) ||
                            phones[0] ||
                            '';
                        const psid =
                            (c.from && c.from.id) ||
                            (c.customers && c.customers[0] && c.customers[0].fb_id) ||
                            '';
                        if (!phone || !name) continue;
                        const key = phone + '|' + name;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        out.push({ name, phone, psid, page: pg });
                    }
                } catch (_) {}
            })
        );
        // ưu tiên SĐT KẾT THÚC đúng đuôi (đúng người) lên đầu.
        out.sort((a, b) => {
            const ea = a.phone.replace(/\D/g, '').endsWith(digits) ? 0 : 1;
            const eb = b.phone.replace(/\D/g, '').endsWith(digits) ? 0 : 1;
            return ea - eb;
        });
        const res = out.slice(0, 6);
        W2PM._fbTailCache.set(digits, res);
        return res;
    }

    function _fbRowHtml(c, pendingId) {
        const escapeHtml = W2PM.escapeHtml;
        const ini = escapeHtml(
            (
                String(c.name || '?')
                    .trim()
                    .charAt(0) || '?'
            ).toUpperCase()
        );
        const avUrl = c.psid
            ? `${W2PM._WORKER_AVATAR}?id=${encodeURIComponent(c.psid)}&page=${encodeURIComponent(c.page)}`
            : '';
        const av = `<span class="w2pm-fb-av"><span class="w2pm-fb-ini">${ini}</span>${avUrl ? `<img src="${escapeHtml(avUrl)}" alt="" loading="lazy" onerror="this.remove()" />` : ''}</span>`;
        return `<div class="w2pm-fb-row">
            ${av}
            <span class="w2pm-fb-info">
                <span class="w2pm-fb-name">${escapeHtml(c.name)}</span>
                <span class="w2pm-fb-phone">${escapeHtml(c.phone)}</span>
            </span>
            <span class="w2pm-fb-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
            <button type="button" class="w2pm-fb-pick" data-fb-pick-id="${escapeHtml(String(pendingId))}"
                data-phone="${escapeHtml(c.phone)}" data-name="${escapeHtml(c.name)}">Gán KH này</button>
        </div>`;
    }

    async function _fillFbList(el) {
        const tail = el.getAttribute('data-w2pm-fb-tail');
        const pendingId = el.getAttribute('data-w2pm-fb-id');
        const rowsEl = el.querySelector('.w2pm-fb-rows');
        if (!rowsEl) return;
        if (!tail) {
            el.hidden = true;
            return;
        }
        const list = await _fetchFbByTail(tail);
        if (!list.length) {
            rowsEl.innerHTML =
                '<div class="w2pm-fb-empty">Không có hội thoại Facebook khớp đuôi.</div>';
            return;
        }
        rowsEl.innerHTML = list.map((c) => _fbRowHtml(c, pendingId)).join('');
        window.Web2WalletBalance?.attachBalances?.(rowsEl);
        rowsEl.querySelectorAll('.w2pm-fb-pick').forEach((btn) => {
            btn.addEventListener('click', () =>
                W2PM._resolveFromChat(
                    btn.getAttribute('data-fb-pick-id'),
                    btn.getAttribute('data-phone'),
                    btn.getAttribute('data-name')
                )
            );
        });
    }

    function _setupFbObserver(body) {
        if (W2PM._fbObserver) W2PM._fbObserver.disconnect();
        W2PM._fbObserver = new IntersectionObserver(
            (entries) => {
                for (const en of entries) {
                    if (!en.isIntersecting) continue;
                    W2PM._fbObserver.unobserve(en.target);
                    _fillFbList(en.target);
                }
            },
            { root: body, rootMargin: '300px' }
        );
        body.querySelectorAll('.w2pm-fb').forEach((el) => W2PM._fbObserver.observe(el));
    }

    W2PM._searchCustomers = _searchCustomers;
    W2PM._searchPancakeByPhone = _searchPancakeByPhone;
    W2PM._fetchFbByTail = _fetchFbByTail;
    W2PM._fbRowHtml = _fbRowHtml;
    W2PM._fillFbList = _fillFbList;
    W2PM._setupFbObserver = _setupFbObserver;
})(window);
