// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// PancakeLivestreamFilter — chọn nguồn livestream cho cột chat Pancake:
//   • CHIẾN DỊCH CHA (radio)  → gom nhiều buổi live (1 chiến dịch).
//   • BÀI LIVESTREAM (checkbox, "Hôm nay" / "Bỏ chọn") → chọn từng bài live.
// Loại trừ 2 chiều (chọn cha → bỏ bài; chọn bài → bỏ cha). Từ lựa chọn →
// load KH đã comment (fb_id + SĐT) từ /api/web2-live-comments → build Set:
//   Tab "Livestream" = hội thoại (inbox + comment) của người CÓ trong set;
//   Tab "Inbox"      = hội thoại của người KHÔNG có trong set.
// Realtime: SSE web2:live-comments → refetch set (debounce). KHÔNG poller.
// =====================================================================

(function (global) {
    'use strict';
    if (global.PancakeLivestreamFilter) return;

    const LS_KEY = 'web2_pancake_live_filter';
    const COMMENTER_LIMIT = 5000;
    const PAGE_LABELS = {
        270136663390370: { t: 'Store', c: '#0ea5e9' },
        117267091364524: { t: 'House', c: '#f59e0b' },
    };

    function _worker() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        ).replace(/\/$/, '');
    }
    function _authHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra || {});
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {}
        return h;
    }
    function _api(path) {
        return fetch(_worker() + '/api/web2-live-comments' + path, {
            headers: _authHeaders(),
            signal: AbortSignal.timeout(20000),
        }).then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json().catch(() => ({}));
        });
    }
    const _esc = (s) =>
        global.SharedUtils?.escapeHtml
            ? global.SharedUtils.escapeHtml(s)
            : String(s == null ? '' : s).replace(
                  /[&<>"]/g,
                  (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
              );
    function _normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (!p) return '';
        if (global.SharedUtils?.normalizePhone) return global.SharedUtils.normalizePhone(p) || '';
        return String(p).replace(/[^\d]/g, '');
    }
    function _pageLabel(pid) {
        return PAGE_LABELS[String(pid)] || { t: 'Page', c: '#6b7280' };
    }
    function _fmtDate(s) {
        if (!s) return '';
        const d = new Date(s);
        if (isNaN(d.getTime())) return '';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                timeZone: 'Asia/Ho_Chi_Minh',
            }).format(d);
        } catch {
            return '';
        }
    }
    function _ymd7(s) {
        try {
            return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(
                new Date(s)
            );
        } catch {
            return '';
        }
    }

    const state = {
        campaigns: [],
        posts: [],
        mode: '', // '' | 'campaign' | 'posts'
        campaignId: '',
        postIds: new Set(),
        fbIds: new Set(),
        phones: new Set(),
        loading: false,
        open: false,
    };

    // ---- persistence ----
    (function _restore() {
        try {
            const s = JSON.parse(localStorage.getItem(LS_KEY) || 'null');
            if (s && typeof s === 'object') {
                state.mode = s.mode || '';
                state.campaignId = s.campaignId || '';
                state.postIds = new Set((s.postIds || []).map(String));
            }
        } catch {}
    })();
    function _persist() {
        try {
            localStorage.setItem(
                LS_KEY,
                JSON.stringify({
                    mode: state.mode,
                    campaignId: state.campaignId,
                    postIds: [...state.postIds],
                })
            );
        } catch {}
    }

    // ---- public predicate ----
    function isLivestreamConv(conv) {
        if (!conv) return false;
        if (!state.fbIds.size && !state.phones.size) return false;
        const customer = conv.customers?.[0] || conv.from || {};
        const ids = [
            conv.from?.id,
            conv.from_psid,
            customer.psid,
            customer.id,
            customer.fb_id,
        ].filter(Boolean);
        for (const id of ids) if (state.fbIds.has(String(id))) return true;
        const ph = _normPhone(
            customer.phone || customer.phone_numbers?.[0] || conv.recent_phone_numbers?.[0] || ''
        );
        if (ph && state.phones.has(ph)) return true;
        return false;
    }

    // ---- data loads ----
    async function _loadCampaigns() {
        try {
            const d = await _api('/campaigns');
            state.campaigns = d.data || [];
        } catch (e) {
            console.warn('[LS-FILTER] campaigns fail:', e.message);
            state.campaigns = [];
        }
    }
    async function _loadPosts() {
        try {
            const d = await _api('/posts');
            state.posts = (d.data || []).slice().sort((a, b) => {
                const ta = new Date(a.last_at || 0).getTime() || 0;
                const tb = new Date(b.last_at || 0).getTime() || 0;
                return tb - ta;
            });
        } catch (e) {
            console.warn('[LS-FILTER] posts fail:', e.message);
            state.posts = [];
        }
    }

    function _setSetsFromRows(rows) {
        const fbIds = new Set();
        const phones = new Set();
        for (const r of rows || []) {
            if (r.fb_id) fbIds.add(String(r.fb_id));
            const ph = _normPhone(r.phone);
            if (ph) phones.add(ph);
        }
        state.fbIds = fbIds;
        state.phones = phones;
    }

    // Áp lựa chọn hiện tại (campaign hoặc posts) → fetch commenter → set.
    async function _applySelection() {
        state.loading = true;
        _renderBar();
        try {
            if (state.mode === 'campaign' && state.campaignId) {
                const d = await _api(
                    '/?campaignId=' +
                        encodeURIComponent(state.campaignId) +
                        '&limit=' +
                        COMMENTER_LIMIT
                );
                _setSetsFromRows(d.data);
            } else if (state.mode === 'posts' && state.postIds.size) {
                const d = await _api(
                    '/?postIds=' +
                        encodeURIComponent([...state.postIds].join(',')) +
                        '&limit=' +
                        COMMENTER_LIMIT
                );
                _setSetsFromRows(d.data);
            } else {
                state.fbIds = new Set();
                state.phones = new Set();
            }
        } catch (e) {
            console.warn('[LS-FILTER] apply fail:', e.message);
        } finally {
            state.loading = false;
            _renderBar();
            global.PancakeConversationList?.renderConversationList?.();
        }
    }

    // ---- selection mutations ----
    function selectCampaign(id) {
        state.campaignId = id || '';
        state.mode = id ? 'campaign' : '';
        state.postIds = new Set(); // loại trừ 2 chiều
        _persist();
        _renderBar();
        _applySelection();
    }
    let _postApplyTimer = null;
    function togglePost(postId, checked) {
        const pid = String(postId);
        if (checked) state.postIds.add(pid);
        else state.postIds.delete(pid);
        state.campaignId = ''; // loại trừ 2 chiều
        state.mode = state.postIds.size ? 'posts' : '';
        _persist();
        _renderBar();
        if (_postApplyTimer) clearTimeout(_postApplyTimer);
        _postApplyTimer = setTimeout(_applySelection, 350);
    }
    function selectToday() {
        let today = '';
        try {
            today = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Ho_Chi_Minh',
            }).format(new Date());
        } catch {}
        state.postIds = new Set(
            state.posts.filter((p) => _ymd7(p.last_at) === today).map((p) => String(p.post_id))
        );
        state.campaignId = '';
        state.mode = state.postIds.size ? 'posts' : '';
        _persist();
        _renderBar();
        _applySelection();
    }
    function clearAll() {
        state.postIds = new Set();
        state.campaignId = '';
        state.mode = '';
        _persist();
        _renderBar();
        _applySelection();
    }

    // ---- UI ----
    function _btnLabel() {
        if (state.mode === 'campaign') {
            const c = state.campaigns.find((x) => String(x.id) === String(state.campaignId));
            const nm = c ? c.name : 'Chiến dịch cha';
            return nm.length > 24 ? nm.slice(0, 24) + '…' : nm;
        }
        if (state.mode === 'posts') return state.postIds.size + ' bài live';
        return 'Chọn chiến dịch / bài live';
    }
    function _campaignRows() {
        if (!state.campaigns.length)
            return '<div class="pk-ls-empty">Chưa có chiến dịch cha. Tạo ở trang Live Comment.</div>';
        return state.campaigns
            .map((c) => {
                const on = state.mode === 'campaign' && String(c.id) === String(state.campaignId);
                return `<label class="pk-ls-row ${on ? 'on' : ''}">
                    <input type="radio" name="pk-ls-camp" value="${_esc(String(c.id))}" ${on ? 'checked' : ''}>
                    <span class="pk-ls-row-name">${_esc(c.name)}</span>
                    <span class="pk-ls-row-sub">${c.post_count || 0} bài · ${Number(c.comment_count || 0).toLocaleString('vi-VN')}</span>
                </label>`;
            })
            .join('');
    }
    function _postRows() {
        if (!state.posts.length)
            return '<div class="pk-ls-empty">Chưa có bài livestream đã lưu comment.</div>';
        return state.posts
            .map((p) => {
                const pid = String(p.post_id);
                const on = state.postIds.has(pid);
                const lbl = _pageLabel(p.page_id);
                const title = p.title
                    ? _esc(String(p.title).slice(0, 46))
                    : 'Live ' + _fmtDate(p.last_at);
                return `<label class="pk-ls-row ${on ? 'on' : ''}">
                    <input type="checkbox" class="pk-ls-post" value="${_esc(pid)}" ${on ? 'checked' : ''}>
                    <span class="pk-ls-badge" style="background:${lbl.c}">${lbl.t}</span>
                    <span class="pk-ls-row-name">${title}</span>
                    <span class="pk-ls-row-sub">${Number(p.comment_count || 0).toLocaleString('vi-VN')}</span>
                </label>`;
            })
            .join('');
    }
    function _renderBar() {
        const bar = document.getElementById('pkLivestreamBar');
        if (!bar) return;
        const count = state.loading
            ? '<span class="pk-ls-count loading">đang tải…</span>'
            : state.mode
              ? `<span class="pk-ls-count">${state.fbIds.size.toLocaleString('vi-VN')} khách</span>`
              : '';
        bar.innerHTML = `
            <i data-lucide="radio" class="pk-ls-icon"></i>
            <button type="button" id="pkLsBtn" class="pk-ls-btn ${state.mode ? 'on' : ''}" title="Chọn chiến dịch cha hoặc bài livestream">
                <span class="pk-ls-btn-text">${_esc(_btnLabel())}</span>
                <i data-lucide="chevron-down"></i>
            </button>
            ${count}
            <button type="button" id="pkLsRefresh" class="pk-ls-refresh" title="Tải lại danh sách"><i data-lucide="refresh-cw"></i></button>
            <div id="pkLsDropdown" class="pk-ls-dropdown" style="display:${state.open ? 'block' : 'none'}">
                <div class="pk-ls-section">
                    <div class="pk-ls-section-head"><i data-lucide="folder"></i> Chiến dịch cha</div>
                    <div class="pk-ls-list">${_campaignRows()}</div>
                </div>
                <div class="pk-ls-section">
                    <div class="pk-ls-section-head">
                        <span><i data-lucide="tv"></i> Bài livestream</span>
                        <span class="pk-ls-actions">
                            <button type="button" id="pkLsToday" class="pk-ls-mini">Hôm nay</button>
                            <button type="button" id="pkLsClear" class="pk-ls-mini ghost">Bỏ chọn</button>
                        </span>
                    </div>
                    <div class="pk-ls-list pk-ls-list-posts">${_postRows()}</div>
                </div>
            </div>`;
        _wireBar(bar);
        if (global.lucide?.createIcons) {
            try {
                global.lucide.createIcons();
            } catch {}
        }
    }
    function _wireBar(bar) {
        const btn = bar.querySelector('#pkLsBtn');
        if (btn)
            btn.onclick = (e) => {
                e.stopPropagation();
                state.open = !state.open;
                const dd = bar.querySelector('#pkLsDropdown');
                if (dd) dd.style.display = state.open ? 'block' : 'none';
            };
        const rf = bar.querySelector('#pkLsRefresh');
        if (rf)
            rf.onclick = async () => {
                await Promise.all([_loadCampaigns(), _loadPosts()]);
                _renderBar();
                _applySelection();
            };
        const dd = bar.querySelector('#pkLsDropdown');
        if (dd) {
            dd.addEventListener('click', (e) => e.stopPropagation());
            dd.addEventListener('change', (e) => {
                const camp = e.target.closest('input[name="pk-ls-camp"]');
                if (camp) {
                    selectCampaign(camp.value);
                    return;
                }
                const post = e.target.closest('.pk-ls-post');
                if (post) togglePost(post.value, post.checked);
            });
            const today = dd.querySelector('#pkLsToday');
            if (today) today.onclick = selectToday;
            const clr = dd.querySelector('#pkLsClear');
            if (clr) clr.onclick = clearAll;
        }
    }
    // Click ngoài → đóng dropdown.
    document.addEventListener('click', (e) => {
        if (!state.open) return;
        const bar = document.getElementById('pkLivestreamBar');
        if (bar && !bar.contains(e.target)) {
            state.open = false;
            const dd = bar.querySelector('#pkLsDropdown');
            if (dd) dd.style.display = 'none';
        }
    });

    // ---- SSE ----
    let _sseTimer = null;
    function _wireSse() {
        if (!global.Web2SSE?.subscribe) return;
        try {
            global.Web2SSE.subscribe('web2:live-comments', () => {
                if (!state.mode) return;
                if (_sseTimer) clearTimeout(_sseTimer);
                _sseTimer = setTimeout(_applySelection, 4000);
            });
        } catch {}
    }

    // ---- init ----
    let _initted = false;
    async function init() {
        _renderBar(); // shell có thể re-render → luôn vẽ lại bar
        if (_initted) return;
        _initted = true;
        await Promise.all([_loadCampaigns(), _loadPosts()]);
        // chiến dịch đã chọn không còn → reset.
        if (
            state.mode === 'campaign' &&
            !state.campaigns.some((c) => String(c.id) === String(state.campaignId))
        ) {
            state.mode = '';
            state.campaignId = '';
            _persist();
        }
        _renderBar();
        if (state.mode) _applySelection();
        _wireSse();
    }

    global.PancakeLivestreamFilter = {
        init,
        isLivestreamConv,
        selectCampaign,
        hasCampaign: () => !!state.mode,
        commenterCount: () => state.fbIds.size,
        _state: state,
    };
})(typeof window !== 'undefined' ? window : globalThis);
