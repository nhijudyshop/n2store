// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — pending match modal.
// =====================================================================
// Web2PendingMatch — fetch + resolve multi-match transactions từ
// /api/web2/balance-history (Web 2.0 path)
// =====================================================================
// Tách hoàn toàn khỏi Web 1.0 pending modal cũ (refreshPendingMatchList +
// resolvePendingMatch ở balance-table.js). Web 2.0 polling endpoint riêng
// + auto credit ngay khi user chọn (không cần kế toán duyệt).
//
// Flow:
//   1. GET /api/web2/balance-history/pending → list pending matches Web 2.0
//   2. Hiện badge "Cần chọn KH (N)" + popup modal liệt kê
//   3. User click 1 KH → POST .../pending/:id/resolve {phone, name}
//      → backend credit ví Web 2.0 + đóng pending
//   4. Refresh list
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2/balance-history';

    async function jsonFetch(url, options) {
        const r = await fetch(url, options);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`);
            throw new Error(msg);
        }
        return body;
    }

    async function withFallback(path, options) {
        try {
            return await jsonFetch(`${BASE}${path}`, options);
        } catch (e) {
            return await jsonFetch(`${DIRECT_BASE}${path}`, options);
        }
    }

    async function listPending() {
        const r = await withFallback('/pending');
        return Array.isArray(r?.data) ? r.data : [];
    }

    async function resolvePending(id, phone, name, resolvedBy) {
        return await withFallback(`/pending/${encodeURIComponent(id)}/resolve`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name, resolvedBy }),
        });
    }

    async function linkManual(txId, phone, name) {
        return await withFallback(`/${encodeURIComponent(txId)}/link`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, name }),
        });
    }

    function escapeHtml(value) {
        if (value == null) return '';
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function fmtVnd(n) {
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }

    function fmtTime(iso) {
        if (!iso) return '—';
        try {
            const d = new Date(iso);
            return (
                d.toLocaleDateString('vi-VN') +
                ' ' +
                d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
            );
        } catch {
            return iso;
        }
    }

    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
        console.log(`[Web2Pending:${type || 'info'}]`, msg);
    }

    function getCurrentUserName() {
        try {
            const authStr =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(authStr);
            return auth.username || auth.userName || auth.email || 'admin';
        } catch {
            return 'admin';
        }
    }

    let _modal = null;
    let _pendingList = [];
    let _searchQuery = '';
    let _searchDebounceTimer = null;

    function ensureModalDom() {
        if (_modal) return _modal;
        const div = document.createElement('div');
        div.id = 'web2PendingModal';
        div.className = 'w2pm-modal';
        div.hidden = true;
        div.innerHTML = `
            <div class="w2pm-backdrop"></div>
            <div class="w2pm-panel">
                <header class="w2pm-head">
                    <h3>Chọn khách hàng cho giao dịch (Web 2.0)</h3>
                    <button type="button" class="w2pm-close" aria-label="Đóng">&times;</button>
                </header>
                <p class="w2pm-info">SePay match đa SĐT cùng đuôi — chọn đúng KH để cộng tiền vào ví Web 2.0.</p>
                <div class="w2pm-search-wrap">
                    <input
                        type="search"
                        id="web2PendingSearch"
                        class="w2pm-search"
                        placeholder="Tìm SĐT / tên KH / nội dung CK / số tiền…"
                        autocomplete="off"
                    />
                    <span class="w2pm-search-count" id="web2PendingSearchCount"></span>
                </div>
                <div class="w2pm-body" id="web2PendingBody"></div>
                <footer class="w2pm-foot">
                    <button type="button" class="w2pm-refresh">Tải lại</button>
                </footer>
            </div>
        `;
        document.body.appendChild(div);
        div.querySelector('.w2pm-backdrop').addEventListener('click', closeModal);
        div.querySelector('.w2pm-close').addEventListener('click', closeModal);
        div.querySelector('.w2pm-refresh').addEventListener('click', refreshModal);
        const searchInput = div.querySelector('#web2PendingSearch');
        searchInput.addEventListener('input', onSearchInput);
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchInput.value) {
                e.preventDefault();
                e.stopPropagation();
                searchInput.value = '';
                _searchQuery = '';
                renderModalBody();
            }
        });
        _modal = div;
        ensureStyles();
        return div;
    }

    function _normalize(s) {
        return String(s || '')
            .toLowerCase()
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/g, 'd')
            .trim();
    }

    function onSearchInput(e) {
        const raw = e.currentTarget.value || '';
        if (_searchDebounceTimer) clearTimeout(_searchDebounceTimer);
        _searchDebounceTimer = setTimeout(() => {
            _searchQuery = raw;
            renderModalBody();
        }, 120);
    }

    function _filterPendingList() {
        const q = _normalize(_searchQuery);
        if (!q) return _pendingList;
        // Multi-token AND: tokens cách nhau space, mỗi token đều phải match.
        const tokens = q.split(/\s+/).filter(Boolean);
        if (!tokens.length) return _pendingList;
        return _pendingList.filter((item) => {
            const choiceText = (Array.isArray(item.matched_customers) ? item.matched_customers : [])
                .flatMap((m) =>
                    (m.customers || []).map((c) => `${m.phone || c.phone || ''} ${c.name || ''}`)
                )
                .join(' ');
            const amountText = String(item.transfer_amount || '');
            const haystack = _normalize(
                [item.content || '', item.sepay_id || '', amountText, choiceText].join(' ')
            );
            return tokens.every((t) => haystack.includes(t));
        });
    }

    function ensureStyles() {
        if (document.getElementById('web2PendingMatchStyles')) return;
        const s = document.createElement('style');
        s.id = 'web2PendingMatchStyles';
        s.textContent = `
            .w2pm-modal { position: fixed; inset: 0; z-index: 9999; display: flex; align-items: center; justify-content: center; }
            .w2pm-modal[hidden] { display: none; }
            .w2pm-backdrop { position: absolute; inset: 0; background: rgba(15,23,42,.55); }
            .w2pm-panel { position: relative; background: #fff; border-radius: 10px; width: min(760px, 92vw); max-height: 86vh; display: flex; flex-direction: column; box-shadow: 0 24px 80px rgba(15,23,42,.32); overflow: hidden; }
            .w2pm-head { padding: 14px 18px; border-bottom: 1px solid #e5e7eb; display: flex; align-items: center; justify-content: space-between; }
            .w2pm-head h3 { margin: 0; font-size: 16px; font-weight: 700; color: #0f172a; }
            .w2pm-close { background: transparent; border: none; font-size: 22px; color: #475569; cursor: pointer; line-height: 1; padding: 4px 8px; }
            .w2pm-info { margin: 10px 18px 0; font-size: 12px; color: #475569; padding: 8px 12px; background: #eff6ff; border-radius: 6px; border: 1px solid #bfdbfe; }
            .w2pm-search-wrap { padding: 10px 18px 0; display: flex; align-items: center; gap: 10px; }
            .w2pm-search { flex: 1; height: 36px; padding: 0 12px; border: 1px solid #d1d5db; border-radius: 8px; font: 400 14px Inter, sans-serif; color: #0f172a; outline: none; transition: border-color .12s, box-shadow .12s; }
            .w2pm-search::-webkit-search-cancel-button { cursor: pointer; }
            .w2pm-search:focus { border-color: #0891b2; box-shadow: 0 0 0 3px rgba(8,145,178,.15); }
            .w2pm-search-count { font-size: 12px; color: #64748b; min-width: 64px; text-align: right; font-variant-numeric: tabular-nums; }
            .w2pm-body { padding: 12px 18px; overflow-y: auto; flex: 1; }
            .w2pm-foot { padding: 10px 18px; border-top: 1px solid #e5e7eb; display: flex; justify-content: flex-end; gap: 8px; background: #f9fafb; }
            .w2pm-refresh { background: #fff; border: 1px solid #d1d5db; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 13px; }
            .w2pm-refresh:hover { background: #f3f4f6; }
            .w2pm-empty { text-align: center; padding: 32px; color: #94a3b8; font-style: italic; }
            .w2pm-item { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px; margin-bottom: 10px; background: #fff; }
            .w2pm-item-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
            .w2pm-item-amount { font-size: 16px; font-weight: 700; color: #0891b2; }
            .w2pm-item-time { font-size: 11px; color: #94a3b8; }
            .w2pm-item-headright { display: inline-flex; align-items: center; gap: 10px; }
            .w2pm-chat-btn { border: 1px solid #bfdbfe; background: #eff6ff; color: #1d4ed8; font-size: 12px; font-weight: 600; padding: 3px 9px; border-radius: 7px; cursor: pointer; white-space: nowrap; }
            .w2pm-chat-btn:hover { background: #dbeafe; border-color: #93c5fd; }
            .w2pm-fb { margin: 8px 0; border: 1px solid #dbeafe; border-radius: 8px; background: #f5f9ff; padding: 7px 9px; }
            .w2pm-fb-head { font-size: 11px; font-weight: 600; color: #1d4ed8; margin-bottom: 5px; }
            .w2pm-fb-rows { display: flex; flex-direction: column; gap: 4px; }
            .w2pm-fb-loading, .w2pm-fb-empty { font-size: 12px; color: #94a3b8; font-style: italic; padding: 3px 2px; }
            .w2pm-fb-row { display: flex; align-items: center; gap: 9px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; padding: 5px 8px; }
            .w2pm-fb-av { position: relative; width: 30px; height: 30px; flex: 0 0 auto; border-radius: 50%; overflow: hidden; background: #c7d2fe; }
            .w2pm-fb-av .w2pm-fb-ini { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; color: #3730a3; font-weight: 700; font-size: 12px; }
            .w2pm-fb-av img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
            .w2pm-fb-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
            .w2pm-fb-name { font-weight: 600; font-size: 13px; color: #0f172a; }
            .w2pm-fb-phone { font-size: 11px; color: #2563eb; }
            .w2pm-fb-bal { font-size: 11px; }
            .w2pm-fb-pick { flex: 0 0 auto; border: none; background: #16a34a; color: #fff; font-size: 11px; font-weight: 700; padding: 5px 10px; border-radius: 6px; cursor: pointer; white-space: nowrap; }
            .w2pm-fb-pick:hover { background: #15803d; }
            .w2pm-custom-divider { font-size: 11px; font-weight: 600; color: #1d4ed8; padding: 6px 10px 3px; border-top: 1px dashed #dbeafe; margin-top: 3px; }
            .w2pm-custom-item.is-fb:hover { background: #eff6ff; }
            .w2pm-fb-tag { font-size: 9px; font-weight: 700; color: #fff; background: #2563eb; border-radius: 3px; padding: 1px 4px; letter-spacing: .03em; }
            .w2pm-item-content { font-size: 12px; color: #475569; background: #f8fafc; padding: 6px 8px; border-radius: 4px; margin-bottom: 8px; max-height: 60px; overflow: auto; }
            .w2pm-choices { display: flex; flex-direction: column; gap: 5px; }
            .w2pm-choice { display: flex; align-items: center; gap: 10px; padding: 6px 10px; background: #f1f5f9; border-radius: 5px; cursor: pointer; transition: all .12s; }
            .w2pm-choice:hover { background: #dbeafe; }
            .w2pm-choice-phone { font-weight: 600; color: #1d4ed8; min-width: 110px; }
            .w2pm-choice-name { flex: 1; color: #0f172a; font-size: 13px; }
            .w2pm-choice-btn { background: #0891b2; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 11px; }
            .w2pm-custom { margin-top: 10px; padding-top: 10px; border-top: 1px dashed #cbd5e1; }
            .w2pm-custom-label { font-size: 12px; color: #475569; margin-bottom: 6px; font-weight: 600; }
            .w2pm-custom-row { display: flex; gap: 6px; align-items: center; }
            .w2pm-custom-search-wrap { position: relative; flex: 1; min-width: 0; }
            .w2pm-custom-search, .w2pm-custom-name { height: 32px; padding: 0 10px; border: 1px solid #cbd5e1; border-radius: 6px; font: 400 13px Inter, sans-serif; color: #0f172a; outline: none; }
            .w2pm-custom-search { width: 100%; box-sizing: border-box; }
            .w2pm-custom-name { width: 140px; flex-shrink: 0; }
            .w2pm-custom-search:focus, .w2pm-custom-name:focus { border-color: #0891b2; box-shadow: 0 0 0 2px rgba(8,145,178,.18); }
            .w2pm-custom-btn { background: #047857; color: #fff; border: none; padding: 0 14px; height: 32px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600; flex-shrink: 0; }
            .w2pm-custom-btn:hover { background: #065f46; }
            .w2pm-custom-btn:disabled { background: #94a3b8; cursor: not-allowed; }
            .w2pm-custom-hint { font-size: 11px; color: #94a3b8; margin-top: 4px; }
            .w2pm-custom-dropdown { position: absolute; top: 100%; left: 0; right: 0; z-index: 20; margin-top: 2px; background: #fff; border: 1px solid #e5e7eb; border-radius: 6px; box-shadow: 0 10px 24px rgba(15,23,42,.14); max-height: 220px; overflow-y: auto; padding: 4px; min-width: 220px; }
            .w2pm-custom-item { display: flex; align-items: center; gap: 10px; padding: 6px 10px; border: none; background: transparent; border-radius: 4px; text-align: left; cursor: pointer; width: 100%; font-size: 12px; }
            .w2pm-custom-item:hover { background: #ecfdf5; }
            .w2pm-custom-item-phone { font-weight: 600; color: #047857; min-width: 110px; }
            .w2pm-custom-item-name { flex: 1; color: #0f172a; }
            .w2pm-custom-loading { padding: 10px; text-align: center; color: #94a3b8; font-size: 12px; font-style: italic; }
            .w2pm-badge-trigger { display: inline-flex; align-items: center; gap: 4px; background: #fef3c7; color: #92400e; padding: 4px 10px; border-radius: 999px; font-size: 12px; cursor: pointer; font-weight: 600; border: 1px solid #fde68a; }
            .w2pm-badge-trigger:hover { background: #fde68a; }
            .w2pm-badge-trigger[hidden] { display: none !important; }
        `;
        document.head.appendChild(s);
    }

    function renderModalBody() {
        const body = document.getElementById('web2PendingBody');
        if (!body) return;
        const countEl = document.getElementById('web2PendingSearchCount');
        if (!_pendingList.length) {
            body.innerHTML = '<div class="w2pm-empty">Không có giao dịch nào chờ chọn KH 🎉</div>';
            if (countEl) countEl.textContent = '';
            return;
        }
        const filtered = _filterPendingList();
        if (countEl) {
            countEl.textContent = _searchQuery
                ? `${filtered.length}/${_pendingList.length}`
                : `${_pendingList.length}`;
        }
        if (!filtered.length) {
            const q = escapeHtml(_searchQuery);
            body.innerHTML = `<div class="w2pm-empty">Không tìm thấy giao dịch nào khớp "${q}".</div>`;
            return;
        }
        body.innerHTML = filtered.map(renderItem).join('');
        body.querySelectorAll('[data-w2pm-resolve]').forEach((btn) => {
            btn.addEventListener('click', onResolveClick);
        });
        body.querySelectorAll('[data-w2pm-search]').forEach((input) => {
            input.addEventListener('input', onCustomSearchInput);
            input.addEventListener('focus', onCustomSearchInput);
            input.addEventListener('blur', () => {
                const id = input.dataset.w2pmSearch;
                setTimeout(() => {
                    const dd = body.querySelector(`[data-w2pm-dropdown="${CSS.escape(id)}"]`);
                    if (dd) dd.hidden = true;
                }, 150);
            });
        });
        body.querySelectorAll('[data-w2pm-custom-resolve]').forEach((btn) => {
            btn.addEventListener('click', onCustomResolveClick);
        });
        // Nút 💬 Hội thoại mỗi giao dịch → mở chat read-only (tìm theo đuôi SĐT).
        // Mỗi hội thoại có nút "Gán KH này" → resolve pending bằng SĐT+tên từ chat.
        body.querySelectorAll('[data-w2pm-chat]').forEach((btn) => {
            btn.addEventListener('click', () => {
                const q = btn.getAttribute('data-w2pm-chat') || '';
                const card = btn.closest('.w2pm-item');
                const pendingId = card && card.getAttribute('data-pending-id');
                if (!window.Web2ChatReadonly?.openSearch) {
                    notify('Module hội thoại chưa load', 'warning');
                    return;
                }
                window.Web2ChatReadonly.openSearch({
                    query: q,
                    onPick: pendingId
                        ? (cust) => _resolveFromChat(pendingId, cust.phone, cust.name)
                        : undefined,
                });
            });
        });
        // Số dư ví cho các SĐT ứng viên (chỉ hiện khi > 0).
        window.Web2WalletBalance?.attachBalances?.(body);
        // Lazy-load list KH từ hội thoại FB cho từng card khi cuộn tới (tránh
        // 200 card × search Pancake cùng lúc).
        _setupFbObserver(body);
    }

    // ---- Custom KH picker per item ----
    const _customSearchDebounceTimers = new Map();
    const _customSearchCache = new Map();
    // 2026-06-03: kho KH riêng Web 2.0 (web2_customers @ web2Db) — bỏ /api/v2/customers Web 1.0
    const CUSTOMER_SEARCH_BASE =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/customers/search';
    const CUSTOMER_SEARCH_FALLBACK =
        'https://n2store-fallback.onrender.com/api/web2/customers/search';

    async function _searchCustomers(query) {
        const q = String(query || '').trim();
        if (q.length < 2) return [];
        if (_customSearchCache.has(q)) return _customSearchCache.get(q);
        const url = (base) =>
            `${base}?search=${encodeURIComponent(q)}&limit=8&sort=last_order_date&order=desc`;
        const tryFetch = async (base) => {
            const r = await fetch(url(base));
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
            const out = await tryFetch(CUSTOMER_SEARCH_BASE);
            _customSearchCache.set(q, out);
            return out;
        } catch {
            try {
                const out = await tryFetch(CUSTOMER_SEARCH_FALLBACK);
                _customSearchCache.set(q, out);
                return out;
            } catch (e) {
                console.warn('[Web2PendingMatch] custom search fail:', e.message);
                return [];
            }
        }
    }

    // Gợi ý tên KH từ HỘI THOẠI PANCAKE theo SĐT (recent_phone_numbers chính là
    // SĐT khách tự gõ trong chat → đáng tin để gán ví đúng người).
    const _pancakeSearchCache = new Map();
    async function _searchPancakeByPhone(query) {
        const digits = String(query || '').replace(/\D/g, '');
        if (digits.length < 4) return []; // chỉ tìm Pancake khi giống SĐT
        if (_pancakeSearchCache.has(digits)) return _pancakeSearchCache.get(digits);
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
        _pancakeSearchCache.set(digits, res);
        return res;
    }

    function _renderCustomItem(c, id, isFb) {
        return `<button type="button" class="w2pm-custom-item${isFb ? ' is-fb' : ''}"
                        data-w2pm-pick-phone="${escapeHtml(c.phone)}"
                        data-w2pm-pick-name="${escapeHtml(c.name || '')}"
                        data-w2pm-pick-id="${escapeHtml(String(id))}">
                        ${isFb ? '<span class="w2pm-fb-tag">FB</span>' : ''}
                        <span class="w2pm-custom-item-phone">${escapeHtml(c.phone)}</span>
                        <span class="w2pm-custom-item-name">${escapeHtml(c.name || '(không tên)')}</span>
                        <span class="w2pm-custom-item-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
                    </button>`;
    }

    // ---- Inline list KH từ hội thoại Facebook (hiện luôn trong card) ----
    const _WORKER_AVATAR = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/fb-avatar';
    const _fbTailCache = new Map();
    let _fbObserver = null;

    async function _fetchFbByTail(tail) {
        const digits = String(tail || '').replace(/\D/g, '');
        if (digits.length < 4) return [];
        if (_fbTailCache.has(digits)) return _fbTailCache.get(digits);
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
        _fbTailCache.set(digits, res);
        return res;
    }

    function _fbRowHtml(c, pendingId) {
        const ini = escapeHtml(
            (
                String(c.name || '?')
                    .trim()
                    .charAt(0) || '?'
            ).toUpperCase()
        );
        const avUrl = c.psid
            ? `${_WORKER_AVATAR}?id=${encodeURIComponent(c.psid)}&page=${encodeURIComponent(c.page)}`
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
                _resolveFromChat(
                    btn.getAttribute('data-fb-pick-id'),
                    btn.getAttribute('data-phone'),
                    btn.getAttribute('data-name')
                )
            );
        });
    }

    function _setupFbObserver(body) {
        if (_fbObserver) _fbObserver.disconnect();
        _fbObserver = new IntersectionObserver(
            (entries) => {
                for (const en of entries) {
                    if (!en.isIntersecting) continue;
                    _fbObserver.unobserve(en.target);
                    _fillFbList(en.target);
                }
            },
            { root: body, rootMargin: '300px' }
        );
        body.querySelectorAll('.w2pm-fb').forEach((el) => _fbObserver.observe(el));
    }

    function onCustomSearchInput(e) {
        const input = e.currentTarget;
        const id = input.dataset.w2pmSearch;
        const q = input.value || '';
        const prev = _customSearchDebounceTimers.get(id);
        if (prev) clearTimeout(prev);
        const timer = setTimeout(async () => {
            const dd = document.querySelector(`[data-w2pm-dropdown="${CSS.escape(id)}"]`);
            if (!dd) return;
            if (q.trim().length < 2) {
                dd.hidden = true;
                dd.innerHTML = '';
                return;
            }
            dd.innerHTML = '<div class="w2pm-custom-loading">Đang tìm…</div>';
            dd.hidden = false;
            // WEB2/kho KH + Pancake song song. Pancake = gợi ý tên KH theo SĐT
            // tìm trong hội thoại (ask user 2026-06-05).
            const [results, fb] = await Promise.all([
                _searchCustomers(q),
                _searchPancakeByPhone(q),
            ]);
            if (!results.length && !fb.length) {
                dd.innerHTML =
                    '<div class="w2pm-custom-loading">Không tìm thấy KH. Có thể gõ thẳng SĐT rồi bấm "Chọn KH này".</div>';
                return;
            }
            let html = results.map((c) => _renderCustomItem(c, id, false)).join('');
            if (fb.length) {
                html += '<div class="w2pm-custom-divider">📘 Từ hội thoại Facebook</div>';
                html += fb.map((c) => _renderCustomItem(c, id, true)).join('');
            }
            dd.innerHTML = html;
            window.Web2WalletBalance?.attachBalances?.(dd);
            dd.querySelectorAll('.w2pm-custom-item').forEach((btn) => {
                btn.addEventListener('mousedown', (ev) => ev.preventDefault());
                btn.addEventListener('click', () => {
                    const pid = btn.dataset.w2pmPickId;
                    const phone = btn.dataset.w2pmPickPhone;
                    const name = btn.dataset.w2pmPickName || '';
                    const root = document.querySelector(`[data-w2pm-custom="${CSS.escape(pid)}"]`);
                    if (root) {
                        const sInput = root.querySelector(
                            `[data-w2pm-search="${CSS.escape(pid)}"]`
                        );
                        const nInput = root.querySelector(
                            `[data-w2pm-custom-name="${CSS.escape(pid)}"]`
                        );
                        if (sInput) sInput.value = phone;
                        if (nInput) nInput.value = name;
                    }
                    dd.hidden = true;
                });
            });
        }, 240);
        _customSearchDebounceTimers.set(id, timer);
    }

    function _normalizePhoneInput(raw) {
        let s = String(raw || '').replace(/[^0-9]/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    async function onCustomResolveClick(e) {
        const btn = e.currentTarget;
        const id = btn.dataset.w2pmCustomResolve;
        const root = document.querySelector(`[data-w2pm-custom="${CSS.escape(id)}"]`);
        const sInput = root?.querySelector(`[data-w2pm-search="${CSS.escape(id)}"]`);
        const nInput = root?.querySelector(`[data-w2pm-custom-name="${CSS.escape(id)}"]`);
        const rawPhone = sInput?.value || '';
        const phone = _normalizePhoneInput(rawPhone);
        const name = (nInput?.value || '').trim();
        if (!phone || phone.length < 9 || phone.length > 11) {
            notify('SĐT phải có 9-11 số. Vui lòng kiểm tra lại.', 'warning');
            sInput?.focus();
            return;
        }
        btn.disabled = true;
        const oldText = btn.textContent;
        btn.textContent = 'Đang xử lý…';
        try {
            const result = await resolvePending(id, phone, name, getCurrentUserName());
            const amt = result?.data?.amount || 0;
            notify(`✅ Đã cộng ${fmtVnd(amt)} vào ví Web 2.0 của ${name || phone}`, 'success');
            _pendingList = _pendingList.filter((it) => String(it.id) !== String(id));
            renderModalBody();
            updateBadge();
            if (!_pendingList.length) {
                setTimeout(closeModal, 1500);
            }
        } catch (err) {
            notify('Lỗi: ' + err.message, 'error');
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }

    function renderItem(item) {
        const matched = Array.isArray(item.matched_customers) ? item.matched_customers : [];
        const choices = matched
            .flatMap((m) =>
                (m.customers || []).map((c) => ({
                    pending_id: item.id,
                    phone: m.phone || c.phone,
                    name: c.name || '',
                }))
            )
            .filter((c) => c.phone);
        return `
            <div class="w2pm-item" data-pending-id="${escapeHtml(String(item.id))}">
                <div class="w2pm-item-head">
                    <span class="w2pm-item-amount">+${fmtVnd(item.transfer_amount)}</span>
                    <span class="w2pm-item-headright">
                        <button type="button" class="w2pm-chat-btn" data-w2pm-chat="${escapeHtml(item.extracted_phone || '')}" title="Mở đoạn hội thoại Facebook (tìm theo đuôi SĐT của giao dịch)">💬 Hội thoại</button>
                        <span class="w2pm-item-time">${escapeHtml(fmtTime(item.transaction_date))} · ${escapeHtml(item.sepay_id || '')}</span>
                    </span>
                </div>
                <div class="w2pm-item-content">${escapeHtml(item.content || '')}</div>
                <div class="w2pm-choices">
                    ${choices
                        .map(
                            (c) => `
                        <div class="w2pm-choice">
                            <span class="w2pm-choice-phone">${escapeHtml(c.phone)}</span>
                            <span class="w2pm-choice-name">${escapeHtml(c.name || '(không tên)')}</span>
                            <span class="w2pm-choice-bal" data-w2wallet-phone="${escapeHtml(c.phone)}"></span>
                            <button class="w2pm-choice-btn" type="button"
                                data-w2pm-resolve="${item.id}"
                                data-phone="${escapeHtml(c.phone)}"
                                data-name="${escapeHtml(c.name || '')}">
                                Chọn
                            </button>
                        </div>
                    `
                        )
                        .join('')}
                </div>
                <div class="w2pm-fb" data-w2pm-fb-tail="${escapeHtml(item.extracted_phone || '')}" data-w2pm-fb-id="${escapeHtml(String(item.id))}">
                    <div class="w2pm-fb-head">📘 Khách từ hội thoại Facebook (khớp đuôi SĐT) — bấm để gán:</div>
                    <div class="w2pm-fb-rows"><div class="w2pm-fb-loading">…</div></div>
                </div>
                <div class="w2pm-custom" data-w2pm-custom="${escapeHtml(String(item.id))}">
                    <div class="w2pm-custom-label">
                        <span>Không có KH đúng? Tự chọn KH khác:</span>
                    </div>
                    <div class="w2pm-custom-row">
                        <div class="w2pm-custom-search-wrap">
                            <input type="search"
                                class="w2pm-custom-search"
                                data-w2pm-search="${escapeHtml(String(item.id))}"
                                placeholder="Gõ 5-10 số đuôi SĐT / tên KH…"
                                autocomplete="off" />
                            <div class="w2pm-custom-dropdown" data-w2pm-dropdown="${escapeHtml(String(item.id))}" hidden></div>
                        </div>
                        <input type="text"
                            class="w2pm-custom-name"
                            data-w2pm-custom-name="${escapeHtml(String(item.id))}"
                            placeholder="Tên (tuỳ chọn)" />
                        <button class="w2pm-custom-btn" type="button"
                            data-w2pm-custom-resolve="${escapeHtml(String(item.id))}">
                            Chọn KH này
                        </button>
                    </div>
                    <div class="w2pm-custom-hint">
                        Gõ 5-10 số đuôi SĐT để hiện danh sách KH khớp, hoặc gõ đủ 9-10 số rồi bấm <strong>Chọn KH này</strong>.
                    </div>
                </div>
            </div>
        `;
    }

    async function onResolveClick(e) {
        const btn = e.currentTarget;
        const id = btn.getAttribute('data-w2pm-resolve');
        const phone = btn.getAttribute('data-phone');
        const name = btn.getAttribute('data-name') || '';
        btn.disabled = true;
        btn.textContent = 'Đang xử lý…';
        try {
            const result = await resolvePending(id, phone, name, getCurrentUserName());
            const amt = result?.data?.amount || 0;
            notify(`✅ Đã cộng ${fmtVnd(amt)} vào ví Web 2.0 của ${name || phone}`, 'success');
            // Remove this item from list and re-render
            _pendingList = _pendingList.filter((it) => String(it.id) !== String(id));
            renderModalBody();
            updateBadge();
            if (!_pendingList.length) {
                setTimeout(closeModal, 1500);
            }
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
            btn.disabled = false;
            btn.textContent = 'Chọn';
        }
    }

    // Resolve pending bằng KH chọn từ list hội thoại FB (nút "Gán KH này").
    async function _resolveFromChat(id, phone, name) {
        const p = _normalizePhoneInput(phone);
        if (!p || p.length < 9) {
            notify('SĐT từ hội thoại không hợp lệ', 'warning');
            return;
        }
        try {
            const result = await resolvePending(id, p, name || '', getCurrentUserName());
            const amt = result?.data?.amount || 0;
            notify(`✅ Đã cộng ${fmtVnd(amt)} vào ví Web 2.0 của ${name || p}`, 'success');
            _pendingList = _pendingList.filter((it) => String(it.id) !== String(id));
            renderModalBody();
            updateBadge();
            if (!_pendingList.length) setTimeout(closeModal, 1200);
        } catch (e) {
            notify('Lỗi: ' + e.message, 'error');
        }
    }

    async function refreshModal() {
        try {
            _pendingList = await listPending();
        } catch (e) {
            notify('Lỗi tải pending: ' + e.message, 'error');
            return;
        }
        renderModalBody();
        updateBadge();
    }

    // openModal(seedSearch?) — nếu truyền seed (vd sepay_id từ row "Trùng SĐT")
    // thì set sẵn ô tìm để lọc đúng giao dịch đó.
    function openModal(seedSearch) {
        ensureModalDom();
        _modal.hidden = false;
        const seed = typeof seedSearch === 'string' ? seedSearch.trim() : '';
        _searchQuery = seed;
        renderModalBody();
        refreshModal();
        setTimeout(() => {
            const search = document.getElementById('web2PendingSearch');
            if (search) {
                search.value = seed;
                search.focus();
            }
        }, 60);
    }

    function closeModal() {
        if (_modal) _modal.hidden = true;
    }

    // Floating badge — show count of pending matches in toolbar
    let _badge = null;
    // 2026-06-05: BỎ badge nổi "Cần chọn KH (Web 2.0): N" theo yêu cầu user.
    // Thay bằng nút "⚠ Trùng SĐT" trên từng row pending_match (balance-history
    // table) → mở modal lọc đúng giao dịch. Giữ element detached (KHÔNG append
    // DOM) để updateBadge() không lỗi, nhưng badge không bao giờ hiện.
    function ensureBadge() {
        if (_badge) return _badge;
        const b = document.createElement('button');
        b.id = 'web2PendingBadge';
        b.hidden = true;
        b.innerHTML = `<span id="web2PendingBadgeCount">0</span>`;
        _badge = b; // detached — không append vào DOM
        return b;
    }

    function updateBadge() {
        ensureBadge();
        const count = _pendingList.length;
        const cnt = document.getElementById('web2PendingBadgeCount');
        if (cnt) cnt.textContent = count;
        _badge.hidden = count === 0;
    }

    async function refresh() {
        try {
            _pendingList = await listPending();
            updateBadge();
        } catch (e) {
            console.warn('[Web2PendingMatch] refresh fail:', e.message);
        }
    }

    function init() {
        ensureBadge();
        refresh();
        // Auto refresh every 30s
        setInterval(refresh, 30000);
        // Subscribe SSE for realtime new pending matches
        if (window.Web2SSE?.subscribe) {
            window.Web2SSE.subscribe('web2:wallet:*', () => {
                // Web 2.0 wallet update = có thể có pending mới hoặc resolved → refresh
                setTimeout(refresh, 500);
            });
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.Web2PendingMatch = {
        refresh,
        openModal,
        closeModal,
        listPending,
        resolvePending,
        linkManual,
    };
})(window);
