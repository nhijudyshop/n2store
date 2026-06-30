// #Note: WEB2.0 module. F06 notification bell — mount sau sidebar.
(function (global) {
    'use strict';
    if (global.Web2NotificationBell) return;

    const API_BASE =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';
    let _container = null;
    let _items = [];
    let _unread = 0;
    let _open = false;

    // 3H21 (2026-06-12): gắn x-web2-token — auth là token-based, credentials:
    // 'include' (cookie) vô nghĩa với backend; thiếu header thì bật enforce là
    // bell chết im lặng (catch {} nuốt lỗi).
    function _authHeaders() {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders({});
        try {
            const t = global.Web2Auth?.getStored?.()?.token;
            return t ? { 'x-web2-token': t } : {};
        } catch {
            return {};
        }
    }

    async function _fetchUnreadCount() {
        try {
            const r = await fetch(API_BASE + '/api/web2/notifications/unread-count', {
                headers: _authHeaders(),
            });
            const d = await r.json();
            if (d.success) _unread = d.count;
        } catch {}
    }
    async function _fetchList() {
        try {
            const r = await fetch(API_BASE + '/api/web2/notifications/list?limit=20', {
                headers: _authHeaders(),
            });
            const d = await r.json();
            if (d.success) _items = d.items;
        } catch {}
    }
    async function _markRead(id) {
        try {
            await fetch(API_BASE + '/api/web2/notifications/' + id + '/read', {
                method: 'POST',
                headers: _authHeaders(),
            });
        } catch {}
    }
    async function _markAllRead() {
        try {
            await fetch(API_BASE + '/api/web2/notifications/mark-all-read', {
                method: 'POST',
                headers: _authHeaders(),
            });
        } catch {}
    }

    function _render() {
        if (!_container) return;
        const badge =
            _unread > 0
                ? `<span class="w2-bell-badge">${_unread > 99 ? '99+' : _unread}</span>`
                : '';
        const list = _items.length
            ? _items
                  .map(
                      (
                          it
                      ) => `<a class="w2-bell-item ${it.read_at ? 'read' : 'unread'} sev-${it.severity || 'info'}"
                              href="${escapeAttr(safeUrl(it.url))}"
                              data-id="${it.id}">
                        <div class="w2-bell-item-title">${escapeHtml(it.title)}</div>
                        ${it.body ? `<div class="w2-bell-item-body">${escapeHtml(it.body)}</div>` : ''}
                        <div class="w2-bell-item-meta">${escapeHtml(_relTime(it.created_at))}</div>
                      </a>`
                  )
                  .join('')
            : '<div class="w2-bell-empty">Chưa có thông báo</div>';
        _container.innerHTML = `
            <button class="w2-bell-btn" aria-label="Thông báo (${_unread} chưa đọc)" data-w2bell-toggle>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/></svg>
                ${badge}
            </button>
            <div class="w2-bell-dropdown" ${_open ? '' : 'hidden'}>
                <div class="w2-bell-head">
                    <strong>Thông báo</strong>
                    <button data-w2bell-markall>Đánh dấu đã đọc</button>
                </div>
                <div class="w2-bell-list">${list}</div>
                <a class="w2-bell-foot" href="${_resolveOverviewBase()}notifications/index.html">Xem tất cả →</a>
            </div>
        `;
        // wire events
        _container.querySelector('[data-w2bell-toggle]').onclick = (e) => {
            e.stopPropagation();
            _open = !_open;
            _render();
            if (_open) _refresh();
        };
        const markAll = _container.querySelector('[data-w2bell-markall]');
        if (markAll)
            markAll.onclick = async (e) => {
                e.preventDefault();
                await _markAllRead();
                await _refresh();
            };
        _container.querySelectorAll('.w2-bell-item').forEach((el) => {
            el.onclick = () => {
                const id = el.getAttribute('data-id');
                if (id) _markRead(id);
            };
        });
    }

    function _resolveOverviewBase() {
        // From host page, web2/notifications path relative
        const pn = location.pathname;
        if (/\/web2\/[^/]+\/[^/]*$/.test(pn)) return '../';
        return '../web2/';
    }

    async function _refresh() {
        await Promise.all([_fetchUnreadCount(), _fetchList()]);
        _render();
    }

    function _attachOutsideClick() {
        document.addEventListener('click', (e) => {
            if (!_open) return;
            if (!_container.contains(e.target)) {
                _open = false;
                _render();
            }
        });
    }

    function _subscribeSSE() {
        if (!global.Web2SSE) return;
        global.Web2SSE.subscribe('web2:notifications', () => _refresh());
    }

    function mount(selector) {
        _container = typeof selector === 'string' ? document.querySelector(selector) : selector;
        if (!_container) return;
        _container.classList.add('w2-bell-root');
        _render();
        _attachOutsideClick();
        _refresh();
        _subscribeSSE();
        // poll fallback 60s if SSE off
        setInterval(_refresh, 60000);
    }

    function _relTime(iso) {
        const d = new Date(iso);
        const diff = (Date.now() - d.getTime()) / 1000;
        if (diff < 60) return 'vừa xong';
        if (diff < 3600) return Math.floor(diff / 60) + ' phút trước';
        if (diff < 86400) return Math.floor(diff / 3600) + ' giờ trước';
        return d.toLocaleString('vi-VN');
    }
    function escapeHtml(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
        if (global.Web2Escape) return global.Web2Escape.escapeHtml(s);
        const d = document.createElement('div');
        d.textContent = String(s ?? '');
        return d.innerHTML;
    }
    function escapeAttr(s) {
        return String(s ?? '').replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    // S7 fix 2026-06-11: chặn javascript:/data: URL từ it.url — chỉ cho
    // http(s), protocol-relative, path tuyệt đối, path tương đối ../,
    // fragment. Defense-in-depth (server-side validation là lớp chính).
    function safeUrl(u) {
        const s = String(u ?? '').trim();
        return /^(https?:)?\/\/|^\/|^\.\.\/|^#/.test(s) ? s : '#';
    }

    global.Web2NotificationBell = Object.freeze({ mount });
})(typeof window !== 'undefined' ? window : globalThis);
