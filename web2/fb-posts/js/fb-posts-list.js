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
                        ${p.picture ? `<img class="fbp-post-thumb" src="${esc(p.picture)}" data-view="${esc(p.id)}" style="cursor:pointer" loading="lazy" alt="" />` : ''}
                        <div class="fbp-post-body" data-view="${esc(p.id)}" style="cursor:pointer">
                            <p class="fbp-post-msg">${esc(p.message) || '<i>(không có nội dung)</i>'}</p>
                            <div class="fbp-post-meta">
                                <span>${fmt(p.createdTime)}</span>
                                <span>${esc(p.statusType || '')}</span>
                            </div>
                        </div>
                        <div class="fbp-post-actions">
                            <button class="fbp-btn ghost sm" data-view="${esc(p.id)}" type="button"><i data-lucide="eye"></i> Xem</button>
                            <button class="fbp-btn danger sm" data-del="${esc(p.id)}" type="button"><i data-lucide="trash-2"></i> Xoá</button>
                        </div>
                    </div>`
                    )
                    .join('') +
                '</div>';
            postsEl
                .querySelectorAll('[data-del]')
                .forEach((b) => b.addEventListener('click', () => del(b.dataset.del)));
            postsEl
                .querySelectorAll('[data-view]')
                .forEach((b) => b.addEventListener('click', () => openViewer(b.dataset.view)));
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

    // Xem nguyên bài như trên Facebook (đủ ảnh + nội dung + tương tác + bình luận).
    async function openViewer(postId) {
        const overlay = document.createElement('div');
        overlay.style.cssText =
            'position:fixed;inset:0;background:rgba(15,23,42,.6);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow:auto';
        overlay.innerHTML =
            '<div class="fbp-card" style="max-width:600px;width:100%;margin:auto"><div class="fbp-empty"><i data-lucide="loader"></i> Đang tải bài…</div></div>';
        document.body.appendChild(overlay);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.remove();
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const box = overlay.querySelector('.fbp-card');
        try {
            const r = await Api().postDetail(_pageId, postId);
            if (!r.success) {
                box.innerHTML = `<div class="fbp-empty">${esc(r.error || 'Lỗi tải bài')}</div>`;
                return;
            }
            const p = r.post || {};
            const eng = [
                p.likes != null ? `👍 ${p.likes}` : '',
                p.comments != null ? `💬 ${p.comments}` : '',
                p.shares != null ? `🔁 ${p.shares}` : '',
            ]
                .filter(Boolean)
                .join('   ');
            const media =
                (p.images || [])
                    .map(
                        (u) =>
                            `<img src="${esc(u)}" loading="lazy" style="width:100%;border-radius:10px;display:block" alt="" />`
                    )
                    .join('') +
                (p.videos || [])
                    .map(
                        (u) =>
                            `<video src="${esc(u)}" controls style="width:100%;border-radius:10px"></video>`
                    )
                    .join('');
            const cms = (p.commentList || [])
                .map(
                    (
                        c
                    ) => `<div style="display:flex;gap:8px;padding:8px 0;border-top:1px solid #eef2f7">
                        ${c.picture ? `<img src="${esc(c.picture)}" style="width:30px;height:30px;border-radius:50%;flex:0 0 auto" alt="" />` : ''}
                        <div style="min-width:0"><b style="font-size:.84rem">${esc(c.name || 'Khách')}</b>
                        <div style="font-size:.85rem;white-space:pre-wrap;word-break:break-word">${esc(c.message)}</div></div></div>`
                )
                .join('');
            box.innerHTML = `
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">
                    <strong style="flex:1">Bài viết · ${esc(fmt(p.createdTime))}</strong>
                    ${p.permalink ? `<a class="fbp-btn ghost sm" href="${esc(p.permalink)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Mở FB</a>` : ''}
                    <button class="fbp-btn ghost sm" id="fbpVwClose" type="button">Đóng</button>
                </div>
                ${p.message ? `<p style="white-space:pre-wrap;line-height:1.5;font-size:.92rem;word-break:break-word">${esc(p.message)}</p>` : ''}
                ${media ? `<div style="display:grid;gap:8px;margin:10px 0">${media}</div>` : ''}
                ${eng ? `<div style="font-weight:700;color:#5a6b80;padding:6px 0">${eng}</div>` : ''}
                ${cms ? `<div><h3 style="font-size:.9rem;margin:10px 0 4px"><i data-lucide="message-circle"></i> Bình luận</h3>${cms}</div>` : ''}
            `;
            box.querySelector('#fbpVwClose').onclick = () => overlay.remove();
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            box.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    window.FBPostsList = { render };
})();
