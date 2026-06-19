// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — inbox sidebar load/search + tag/condition filter. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    NO._loadInboxSidebar = async function _loadInboxSidebar(order) {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        // Sidebar is independent of the order's page — like web2-pancake's
        // PancakeColumnManager + pancake.vn merge mode, it loads ALL pages
        // the user has access to so any customer chat is reachable even
        // when modal was opened from a single-page order.
        if (!window.Web2Chat?.fetchConversationsByPage) {
            list.innerHTML =
                '<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Web2Chat chưa hỗ trợ list theo page</div>';
            return;
        }
        // Wait for the account sync that the chat panel kicks off — without
        // a JWT this list call would 401. The sync is cached so this is a
        // single-flight Promise the second caller awaits.
        if (window.Web2Chat.syncFromRenderDB) {
            try {
                await window.Web2Chat.syncFromRenderDB();
            } catch {
                /* tolerate; sidebar will show no_jwt error if it really is missing */
            }
        }
        try {
            const pageIds = NO._getSidebarPageIds(order);
            const res = await NO._fetchConvsMerged(pageIds, 50);
            if (!res.ok || !res.conversations.length) {
                list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Chưa có hội thoại${res.reason ? ` (${NO.escapeHtml(res.reason)})` : ''}</div>`;
                return;
            }
            list.innerHTML = res.conversations.map((c) => NO._convRowHtml(c, order)).join('');
            if (window.lucide?.createIcons) window.lucide.createIcons();
            // Auto-scroll to active row
            const active = list.querySelector('.w2-inbox-conv.is-active');
            if (active) active.scrollIntoView({ block: 'center' });
            // Wire row clicks — switch chat to that customer (and stay in
            // the same modal; we re-trigger _loadAndRenderThread with a
            // synthetic order-like object containing the customer info).
            list.querySelectorAll('.w2-inbox-conv').forEach((row) => {
                row.addEventListener('click', () => {
                    const fbId = row.dataset.fbId;
                    const cName = row.dataset.cName;
                    const rowPage = row.dataset.pageId || '';
                    if (!fbId) return;
                    NO._switchChatToCustomer(order, fbId, cName, rowPage);
                    // Mark row read locally
                    row.classList.remove('is-unread');
                    row.querySelector('.w2-inbox-conv-badge')?.remove();
                });
            });
            // Subscribe to page-wide WS so the sidebar updates without a
            // full re-fetch when new messages arrive in other conversations.
            NO._wireSidebarRealtime(order);
            // Wire the search input — server-side conversation search via
            // Pancake's POST /api/v1/pages/{pageId}/conversations/search.
            NO._wireSidebarSearch(order, res.conversations);
            // Wire the "Lọc theo" dropdown + apply current filter.
            NO._wireSidebarFilter(order);
            NO._applySidebarFilter();
        } catch (e) {
            console.warn('[NativeOrders] sidebar load failed:', e.message);
            list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#dc2626;font-size:12px;text-align:center;">Lỗi tải: ${NO.escapeHtml(e.message)}</div>`;
        }
    };

    /**
     * Sidebar search: debounce 300ms after the user stops typing, then
     * hit `Web2Chat.searchConversations(pageId, query)` and rebuild the
     * list with the results. Empty query → restore the original page
     * list. AbortController cancels an in-flight request when a newer
     * keystroke arrives so we never render stale data on top of fresh.
     */
    NO._searchAbort = null;

    NO._searchTimer = null;

    NO._wireSidebarSearch = function _wireSidebarSearch(order, baselineConvs) {
        const input = document.getElementById('w2InboxSearch');
        if (!input || !window.Web2Chat?.searchConversations) return;
        // Idempotent — bail if already wired.
        if (input.dataset.searchWired === '1') return;
        input.dataset.searchWired = '1';

        const doSearch = async (query) => {
            const list = document.getElementById('w2InboxConvList');
            if (!list) return;
            if (NO._searchAbort) NO._searchAbort.abort();
            if (!query.trim()) {
                // Empty query → restore baseline page list
                list.innerHTML = baselineConvs.map((c) => NO._convRowHtml(c, order)).join('');
                NO._bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                NO._applySidebarFilter();
                return;
            }
            // Đơn inbox tay chưa bind page (order.fbPageId rỗng) → KHÔNG gọi
            // server search (cần pageId). Lọc client-side trên baseline đa-page
            // đã load để user tìm đúng hội thoại theo tên/SĐT.
            if (!order.fbPageId) {
                const qn = NO.stripVi(query.trim());
                const matched = baselineConvs.filter((c) => {
                    const cust = c.customers?.[0] || c.from || {};
                    const hay = NO.stripVi(
                        [
                            cust.name,
                            cust.full_name,
                            cust.phone,
                            c.snippet,
                            c.last_message?.message,
                            c.last_message_text,
                        ]
                            .filter(Boolean)
                            .join(' ')
                    );
                    return hay.includes(qn);
                });
                if (!matched.length) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Không có hội thoại khớp "${NO.escapeHtml(query)}"<br><span style="font-size:11px;">Xoá ô tìm để xem tất cả hội thoại.</span></div>`;
                    return;
                }
                list.innerHTML = matched.map((c) => NO._convRowHtml(c, order)).join('');
                NO._bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                NO._applySidebarFilter();
                return;
            }
            NO._searchAbort = new AbortController();
            // Visual hint: dim the list while we wait
            list.style.opacity = '0.55';
            try {
                const res = await window.Web2Chat.searchConversations(
                    order.fbPageId,
                    query.trim(),
                    { signal: NO._searchAbort.signal }
                );
                if (res.reason === 'aborted') return; // newer keystroke superseded
                if (!res.ok) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#dc2626;font-size:12px;text-align:center;">Lỗi tìm: ${NO.escapeHtml(res.reason || 'unknown')}</div>`;
                    return;
                }
                if (!res.conversations.length) {
                    list.innerHTML = `<div class="w2-inbox-sb-empty" style="padding:24px;color:#94a3b8;font-size:12px;text-align:center;">Không có kết quả cho "${NO.escapeHtml(query)}"</div>`;
                    return;
                }
                list.innerHTML = res.conversations.map((c) => NO._convRowHtml(c, order)).join('');
                NO._bindConvRowClicks(list, order);
                if (window.lucide?.createIcons) window.lucide.createIcons();
                NO._applySidebarFilter();
            } finally {
                list.style.opacity = '';
            }
        };

        input.addEventListener('input', () => {
            const v = input.value;
            if (NO._searchTimer) clearTimeout(NO._searchTimer);
            NO._searchTimer = setTimeout(() => doSearch(v), 300);
        });
        // Enter triggers immediate fire (no wait for debounce)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (NO._searchTimer) clearTimeout(NO._searchTimer);
                doSearch(input.value);
            }
        });

        // Đơn inbox tay chưa bind hội thoại → tự điền ô tìm (ưu tiên SĐT vì khớp
        // chính xác hơn tên) để list lọc sẵn đúng hội thoại, user chỉ việc click.
        if (!order.fbPageId) {
            const seed = (order.phone || order.customerName || '').trim();
            if (seed) {
                input.value = seed;
                doSearch(seed);
            }
        }
    };

    // ---------- Sidebar filter (Lọc theo) ----------
    // Client-side row filter applied on top of whatever is currently in
    // `#w2InboxConvList` (initial load, search results, or merged poll
    // updates). Decoupled from search so a user can search "0123" then
    // narrow to unread, or filter unread and then search.
    // Pancake-style filter state: tag include/exclude + conditions, all AND-combined.
    // Untagged is modelled as a pseudo-tag id "__untagged" inside the
    // include/exclude sets so the existing AND logic handles it uniformly.
    NO.UNTAGGED = '__untagged';

    NO._filter = {
        includeTags: new Set(), // tag IDs (or UNTAGGED) — pass if row has ANY
        excludeTags: new Set(), // tag IDs (or UNTAGGED) — pass if row has NONE
        conditions: new Set(), // 'unread'|'read'|'unreplied'|'has-phone'|'has-live'
    };

    NO._CONDITION_LABELS = {
        unread: 'Chưa đọc',
        read: 'Đã đọc',
        unreplied: 'Chưa trả lời',
        'has-phone': 'Có SĐT',
        'has-live': 'Có đơn livestream',
    };

    // Tag dictionary from Pancake page settings: { [id]: { id, text, color } }.
    // Populated lazily on first filter-menu open per page.
    NO._pageTagDict = new Map();
    // pageId → Map<id, tagObj>
    NO._activeSubCat = null;
    // 'include-tags'|'exclude-tags'|'conditions'|null
    NO._currentPageId = null;

    // Persisted filter state per-page so reopening the modal restores
    // the user's selection. Pancake itself resets filteredTag/Type to
    // ALL/false on reload (Redux memory only); we go one better.
    NO._LS_FILTER = 'n2store_native_inbox_filter_v1';

    NO._loadFilterStateFor = function _loadFilterStateFor(pageId) {
        NO._filter.includeTags.clear();
        NO._filter.excludeTags.clear();
        NO._filter.conditions.clear();
        if (!pageId) return;
        try {
            const raw = localStorage.getItem(NO._LS_FILTER);
            if (!raw) return;
            const obj = JSON.parse(raw);
            const entry = obj?.[pageId];
            if (!entry) return;
            (entry.includeTags || []).forEach((t) => NO._filter.includeTags.add(String(t)));
            (entry.excludeTags || []).forEach((t) => NO._filter.excludeTags.add(String(t)));
            (entry.conditions || []).forEach((c) => NO._filter.conditions.add(String(c)));
        } catch {
            /* ignore corrupt */
        }
    };

    NO._persistFilterState = function _persistFilterState() {
        if (!NO._currentPageId) return;
        try {
            const raw = localStorage.getItem(NO._LS_FILTER);
            const obj = raw ? JSON.parse(raw) || {} : {};
            const total =
                NO._filter.includeTags.size +
                NO._filter.excludeTags.size +
                NO._filter.conditions.size;
            if (total === 0) {
                delete obj[NO._currentPageId];
            } else {
                obj[NO._currentPageId] = {
                    includeTags: Array.from(NO._filter.includeTags),
                    excludeTags: Array.from(NO._filter.excludeTags),
                    conditions: Array.from(NO._filter.conditions),
                };
            }
            localStorage.setItem(NO._LS_FILTER, JSON.stringify(obj));
        } catch {
            /* quota — non-critical */
        }
    };

    NO._filterActiveCount = function _filterActiveCount() {
        return (
            NO._filter.includeTags.size + NO._filter.excludeTags.size + NO._filter.conditions.size
        );
    };

    NO._rowMatchesFilter = function _rowMatchesFilter(row) {
        const unread = row.classList.contains('is-unread');
        const tagged = Number(row.dataset.tagCount || 0) > 0;
        const hasPhone = row.dataset.hasPhone === '1';
        const hasLive = row.dataset.hasLive === '1';
        const replied = row.dataset.replied === '1';
        const rowTagIds = (row.dataset.tagIds || '').split(',').filter(Boolean);

        // Tag include: pass if includeTags empty, else row must have at least
        // one of the included tags (or UNTAGGED matches if row has no tags).
        if (NO._filter.includeTags.size > 0) {
            let ok = false;
            if (NO._filter.includeTags.has(NO.UNTAGGED) && rowTagIds.length === 0) ok = true;
            if (!ok) {
                for (const id of rowTagIds) {
                    if (NO._filter.includeTags.has(id)) {
                        ok = true;
                        break;
                    }
                }
            }
            if (!ok) return false;
        }
        // Tag exclude: pass if row has none of the excluded tags.
        if (NO._filter.excludeTags.size > 0) {
            if (NO._filter.excludeTags.has(NO.UNTAGGED) && rowTagIds.length === 0) return false;
            for (const id of rowTagIds) {
                if (NO._filter.excludeTags.has(id)) return false;
            }
        }
        // Conditions AND-combined.
        for (const cond of NO._filter.conditions) {
            switch (cond) {
                case 'unread':
                    if (!unread) return false;
                    break;
                case 'read':
                    if (unread) return false;
                    break;
                case 'unreplied':
                    if (replied) return false;
                    break;
                case 'tagged':
                    if (!tagged) return false;
                    break;
                case 'has-phone':
                    if (!hasPhone) return false;
                    break;
                case 'has-live':
                    if (!hasLive) return false;
                    break;
            }
        }
        return true;
    };

    NO._applySidebarFilter = function _applySidebarFilter() {
        const list = document.getElementById('w2InboxConvList');
        if (!list) return;
        const rows = list.querySelectorAll('.w2-inbox-conv');
        let visible = 0;
        rows.forEach((row) => {
            const show = NO._rowMatchesFilter(row);
            row.style.display = show ? '' : 'none';
            if (show) visible += 1;
        });
        const existingHint = list.querySelector('[data-filter-empty]');
        if (existingHint) existingHint.remove();
        if (rows.length > 0 && visible === 0 && NO._filterActiveCount() > 0) {
            const empty = document.createElement('div');
            empty.dataset.filterEmpty = '1';
            empty.style.cssText =
                'padding:24px;color:#94a3b8;font-size:12px;text-align:center;font-style:italic;';
            empty.textContent = 'Không có hội thoại nào khớp bộ lọc';
            list.appendChild(empty);
        }
        NO._updateFilterButtonVisual();
        NO._updateFilterCatCounts();
    };

    NO._updateFilterButtonVisual = function _updateFilterButtonVisual() {
        const btn = document.getElementById('w2InboxFilterBtn');
        const countEl = document.getElementById('w2InboxFilterCount');
        if (!btn || !countEl) return;
        const n = NO._filterActiveCount();
        btn.classList.toggle('is-active', n > 0);
        if (n > 0) {
            countEl.removeAttribute('hidden');
            countEl.textContent = String(n);
        } else {
            countEl.setAttribute('hidden', '');
            countEl.textContent = '';
        }
    };

    NO._updateFilterCatCounts = function _updateFilterCatCounts() {
        const menu = document.getElementById('w2InboxFilterMenu');
        if (!menu) return;
        const map = {
            'include-tags': NO._filter.includeTags.size,
            'exclude-tags': NO._filter.excludeTags.size,
            conditions: NO._filter.conditions.size,
        };
        menu.querySelectorAll('.w2-fm-cat-count').forEach((el) => {
            const key = el.dataset.for;
            const n = map[key] || 0;
            el.textContent = n > 0 ? String(n) : '';
        });
    };

    /**
     * Render the right-hand sub-panel content based on which category the
     * user clicked. Tag pickers (include/exclude) share a list renderer.
     */
    NO._renderFilterSub = function _renderFilterSub(cat) {
        const sub = document.getElementById('w2InboxFilterSub');
        if (!sub) return;
        NO._activeSubCat = cat;
        document
            .querySelectorAll('#w2InboxFilterMenu .w2-fm-cat')
            .forEach((b) => b.classList.toggle('is-active', b.dataset.cat === cat));
        if (cat === 'include-tags' || cat === 'exclude-tags') {
            sub.innerHTML = NO._renderFilterSubTags(cat);
            NO._wireFilterSubTags(cat);
        } else if (cat === 'conditions') {
            sub.innerHTML = NO._renderFilterSubConditions();
            NO._wireFilterSubConditions();
        } else {
            sub.innerHTML =
                '<div class="w2-fm-sub-placeholder">Chọn nhóm điều kiện bên trái để xem tuỳ chọn.</div>';
        }
        if (window.lucide?.createIcons) window.lucide.createIcons();
    };

    NO._tagDictForCurrentPage = function _tagDictForCurrentPage() {
        return NO._pageTagDict.get(NO._currentPageId) || new Map();
    };

    NO._renderFilterSubTags = function _renderFilterSubTags(cat) {
        const set = cat === 'include-tags' ? NO._filter.includeTags : NO._filter.excludeTags;
        const dict = NO._tagDictForCurrentPage();
        const tags = Array.from(dict.values()).sort((a, b) =>
            String(a.text || '').localeCompare(String(b.text || ''), 'vi')
        );
        const untaggedChecked = set.has(NO.UNTAGGED);
        const rows = [
            `<label class="w2-fm-row" data-tagid="${NO.UNTAGGED}">
                <input type="checkbox" ${untaggedChecked ? 'checked' : ''} />
                <span class="w2-fm-tag-chip w2-fm-tag-chip-empty">Không gắn thẻ</span>
            </label>`,
        ];
        for (const tag of tags) {
            const id = String(tag.id);
            const checked = set.has(id);
            const color = tag.color || '#94a3b8';
            const text = NO.escapeHtml(tag.text || `Thẻ #${id}`);
            rows.push(
                `<label class="w2-fm-row" data-tagid="${NO.escapeHtml(id)}">
                    <input type="checkbox" ${checked ? 'checked' : ''} />
                    <span class="w2-fm-tag-chip" style="background:${NO.escapeHtml(color)};">${text}</span>
                </label>`
            );
        }
        const body = tags.length
            ? rows.join('')
            : `<div class="w2-fm-sub-empty">Đang tải danh sách thẻ…</div>`;
        return `
            <div class="w2-fm-sub-search">
                <i class="w2-fm-sub-search-icon" data-lucide="search" style="width:13px;height:13px;"></i>
                <input type="text" placeholder="Tìm kiếm thẻ" data-tag-search />
            </div>
            <div class="w2-fm-sub-list" data-tag-list>${body}</div>`;
    };

    NO._wireFilterSubTags = function _wireFilterSubTags(cat) {
        const sub = document.getElementById('w2InboxFilterSub');
        if (!sub) return;
        const set = cat === 'include-tags' ? NO._filter.includeTags : NO._filter.excludeTags;
        const list = sub.querySelector('[data-tag-list]');
        const search = sub.querySelector('[data-tag-search]');
        list?.addEventListener('change', (e) => {
            const row = e.target.closest('.w2-fm-row');
            if (!row) return;
            const id = row.dataset.tagid;
            if (e.target.checked) set.add(id);
            else set.delete(id);
            NO._applySidebarFilter();
            NO._persistFilterState();
        });
        search?.addEventListener('input', () => {
            const q = (search.value || '').trim().toLowerCase();
            list.querySelectorAll('.w2-fm-row').forEach((row) => {
                const txt = row.textContent.toLowerCase();
                row.style.display = !q || txt.includes(q) ? '' : 'none';
            });
        });
    };

    NO._renderFilterSubConditions = function _renderFilterSubConditions() {
        const items = Object.entries(NO._CONDITION_LABELS)
            .map(([key, label]) => {
                const checked = NO._filter.conditions.has(key);
                return `<label class="w2-fm-row" data-cond="${NO.escapeHtml(key)}">
                    <input type="checkbox" ${checked ? 'checked' : ''} />
                    <span>${NO.escapeHtml(label)}</span>
                </label>`;
            })
            .join('');
        return `<div class="w2-fm-sub-list">${items}</div>`;
    };

    NO._wireFilterSubConditions = function _wireFilterSubConditions() {
        const sub = document.getElementById('w2InboxFilterSub');
        sub?.addEventListener('change', (e) => {
            const row = e.target.closest('.w2-fm-row[data-cond]');
            if (!row) return;
            const key = row.dataset.cond;
            if (e.target.checked) NO._filter.conditions.add(key);
            else NO._filter.conditions.delete(key);
            NO._applySidebarFilter();
            NO._persistFilterState();
        });
    };

    /**
     * Load page tag definitions via Web2Chat.fetchPageSettings + merge any
     * tag IDs seen on rendered convs (so we still show numeric placeholders
     * if the settings call fails). Re-renders the open sub-panel.
     */
    NO._loadPageTagsForFilter = async function _loadPageTagsForFilter(pageId) {
        if (!pageId) return;
        NO._currentPageId = pageId;
        // Seed dictionary with IDs collected from rendered rows — covers
        // the case where settings call later fails / is slow.
        if (!NO._pageTagDict.has(pageId)) NO._pageTagDict.set(pageId, new Map());
        const dict = NO._pageTagDict.get(pageId);
        document.querySelectorAll('#w2InboxConvList .w2-inbox-conv').forEach((row) => {
            (row.dataset.tagIds || '')
                .split(',')
                .filter(Boolean)
                .forEach((id) => {
                    if (!dict.has(id)) dict.set(id, { id, text: `Thẻ #${id}`, color: '#94a3b8' });
                });
        });
        if (!window.Web2Chat?.fetchPageSettings) return;
        try {
            const res = await window.Web2Chat.fetchPageSettings(pageId);
            if (!res.ok) return;
            const tags = res.settings?.tags;
            if (!Array.isArray(tags)) return;
            for (const t of tags) {
                if (t && t.id != null) {
                    dict.set(String(t.id), {
                        id: String(t.id),
                        text: t.text || `Thẻ #${t.id}`,
                        color: t.color || '#94a3b8',
                    });
                }
            }
            // Refresh open sub-panel so newly-loaded names/colors show.
            if (NO._activeSubCat === 'include-tags' || NO._activeSubCat === 'exclude-tags') {
                NO._renderFilterSub(NO._activeSubCat);
            }
        } catch (e) {
            console.warn('[NativeOrders] loadPageTagsForFilter failed:', e.message);
        }
    };

    NO._wireSidebarFilter = function _wireSidebarFilter(order) {
        const btn = document.getElementById('w2InboxFilterBtn');
        const menu = document.getElementById('w2InboxFilterMenu');
        if (!btn || !menu) return;
        // Page context refresh — runs every time a sidebar reloads even if
        // listeners are already wired, so switching to a different page
        // picks up that page's stored filter.
        const nextPageId = order?.fbPageId || null;
        if (nextPageId !== NO._currentPageId) {
            NO._currentPageId = nextPageId;
            NO._loadFilterStateFor(NO._currentPageId);
        }
        if (btn.dataset.filterWired === '1') return;
        btn.dataset.filterWired = '1';

        const close = () => menu.setAttribute('hidden', '');
        const open = () => {
            menu.removeAttribute('hidden');
            // Default to the most useful panel: conditions list.
            if (!NO._activeSubCat) NO._renderFilterSub('conditions');
            else NO._renderFilterSub(NO._activeSubCat);
            // Lazy-load page tags for the tag pickers.
            NO._loadPageTagsForFilter(NO._currentPageId);
        };

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            if (menu.hasAttribute('hidden')) open();
            else close();
        });
        menu.addEventListener('click', (e) => {
            const cat = e.target.closest('.w2-fm-cat');
            if (cat) {
                e.stopPropagation();
                NO._renderFilterSub(cat.dataset.cat);
                return;
            }
            const reset = e.target.closest('#w2InboxFilterReset');
            if (reset) {
                NO._filter.includeTags.clear();
                NO._filter.excludeTags.clear();
                NO._filter.conditions.clear();
                NO._applySidebarFilter();
                NO._persistFilterState();
                if (NO._activeSubCat) NO._renderFilterSub(NO._activeSubCat);
            }
        });
        // Close on outside click (capture so popup-internal clicks reach handlers first)
        document.addEventListener(
            'click',
            (e) => {
                if (!menu.parentElement?.contains(e.target)) close();
            },
            { capture: true }
        );
        NO._updateFilterButtonVisual();
        NO._updateFilterCatCounts();
    };

    /**
     * Shared click binding for sidebar rows — extracted so both initial
     * render and search-result render reuse the same handler instead of
     * duplicating the logic.
     */
    NO._bindConvRowClicks = function _bindConvRowClicks(list, order) {
        list.querySelectorAll('.w2-inbox-conv').forEach((row) => {
            row.addEventListener('click', () => {
                const fbId = row.dataset.fbId;
                const cName = row.dataset.cName;
                const rowPage = row.dataset.pageId || '';
                if (!fbId) return;
                NO._switchChatToCustomer(order, fbId, cName, rowPage);
                row.classList.remove('is-unread');
                row.querySelector('.w2-inbox-conv-badge')?.remove();
            });
        });
    };
})();
