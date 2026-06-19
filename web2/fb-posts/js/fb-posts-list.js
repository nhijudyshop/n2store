// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: quản lý bài viết (liệt kê đã đăng + đã lên lịch, xoá).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    const S = () => window.FBPosts.state;
    let _pageId = null;

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[m]
        );
    }
    function fmt(s) {
        if (!s) return '';
        const t = new Date(s).getTime();
        if (isNaN(t)) return '';
        return new Date(t).toLocaleString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            day: '2-digit',
            month: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
        });
    }

    function render() {
        const el = document.getElementById('panel-list');
        if (!el) return;
        const pages = S().pages || [];
        if (!pages.length) {
            el.innerHTML =
                '<div class="fbp-empty"><div class="empty-state-icon">📭</div>Chưa kết nối Facebook.</div>';
            return;
        }
        if (!_pageId) _pageId = pages[0].id;
        el.innerHTML = `
            <div class="fbp-card">
                <h3><i data-lucide="layout-list"></i> Bài viết của page</h3>
                <div class="fbp-pages" id="fbpListPages">
                    ${pages
                        .map(
                            (p) =>
                                `<button type="button" class="fbp-page-chip ${p.id === _pageId ? 'on' : ''}" data-pid="${esc(p.id)}">
                                    ${p.picture ? `<img src="${esc(p.picture)}" alt="" />` : ''}<span>${esc(p.name)}</span>
                                </button>`
                        )
                        .join('')}
                    <button class="fbp-btn ghost sm" id="fbpListReload" type="button" style="margin-left:auto"><i data-lucide="refresh-cw"></i> Tải lại</button>
                </div>
            </div>
            <div id="fbpScheduled"></div>
            <div id="fbpPosts"><div class="fbp-empty"><i data-lucide="loader"></i> Đang tải…</div></div>
        `;
        el.querySelectorAll('#fbpListPages .fbp-page-chip').forEach((c) =>
            c.addEventListener('click', () => {
                _pageId = c.dataset.pid;
                render();
            })
        );
        document.getElementById('fbpListReload').addEventListener('click', load);
        if (window.lucide?.createIcons) window.lucide.createIcons();
        load();
    }

    async function load() {
        const postsEl = document.getElementById('fbpPosts');
        const schedEl = document.getElementById('fbpScheduled');
        if (!postsEl) return;
        postsEl.innerHTML = '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tải…</div>';
        try {
            const r = await Api().list(_pageId, 25);
            if (!r.success) {
                postsEl.innerHTML = `<div class="fbp-empty">${esc(r.error || 'Lỗi tải bài')}</div>`;
                return;
            }
            // Scheduled
            if (r.scheduled && r.scheduled.length) {
                schedEl.innerHTML =
                    `<div class="fbp-card"><h3><i data-lucide="calendar-clock"></i> Đã lên lịch (${r.scheduled.length})</h3>` +
                    r.scheduled
                        .map(
                            (p) =>
                                `<div class="fbp-post"><div class="fbp-post-body">
                                    <p class="fbp-post-msg">${esc(p.message) || '<i>(không có nội dung)</i>'}</p>
                                    <div class="fbp-post-meta"><span><b>⏰ ${fmt(p.scheduledTime)}</b></span></div>
                                </div></div>`
                        )
                        .join('') +
                    '</div>';
            } else schedEl.innerHTML = '';
            // Published
            const posts = r.posts || [];
            if (!posts.length) {
                postsEl.innerHTML =
                    '<div class="fbp-empty"><div class="empty-state-icon">📝</div>Chưa có bài viết.</div>';
                return;
            }
            postsEl.innerHTML =
                `<div class="fbp-card"><h3><i data-lucide="check-circle-2"></i> Đã đăng (${posts.length})</h3>` +
                posts
                    .map(
                        (p) => `
                    <div class="fbp-post">
                        ${p.picture ? `<img class="fbp-post-thumb" src="${esc(p.picture)}" loading="lazy" alt="" />` : ''}
                        <div class="fbp-post-body">
                            <p class="fbp-post-msg">${esc(p.message) || '<i>(không có nội dung)</i>'}</p>
                            <div class="fbp-post-meta">
                                <span>${fmt(p.createdTime)}</span>
                                <span>${esc(p.statusType || '')}</span>
                            </div>
                        </div>
                        <div class="fbp-post-actions">
                            ${p.permalink ? `<a class="fbp-btn ghost sm" href="${esc(p.permalink)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Xem</a>` : ''}
                            <button class="fbp-btn danger sm" data-del="${esc(p.id)}" type="button"><i data-lucide="trash-2"></i> Xoá</button>
                        </div>
                    </div>`
                    )
                    .join('') +
                '</div>';
            postsEl
                .querySelectorAll('[data-del]')
                .forEach((b) => b.addEventListener('click', () => del(b.dataset.del)));
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            postsEl.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    async function del(postId) {
        const ok =
            window.Popup && window.Popup.danger
                ? await window.Popup.danger('Xoá bài viết này khỏi Facebook? Không thể hoàn tác.')
                : window.confirm('Xoá bài viết này?');
        if (!ok) return;
        try {
            const r = await Api().del(_pageId, postId);
            if (r.success) {
                notify('Đã xoá bài', 'success');
                load();
            } else notify(r.error || 'Lỗi xoá', 'error');
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    window.FBPostsList = { render };
})();
