// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: quản lý bài viết (liệt kê đã đăng + đã lên lịch, xoá).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    const S = () => window.FBPosts.state;
    let _pageId = null;
    let _after = null; // cursor trang kế (infinite scroll)
    let _loading = false;
    let _observer = null;
    let _posts = []; // các bài đã tải (mọi loại) — lọc client-side
    let _filter = 'all'; // all | live | video | photo | text

    const TYPE_FILTERS = [
        ['all', 'Tất cả'],
        ['live', '🔴 Livestream'],
        ['video', '🎬 Video'],
        ['photo', '🖼️ Hình ảnh'],
        ['text', '📝 Bài viết'],
    ];
    function typeBadge(p) {
        if (p.type === 'live')
            return p.living
                ? '<span class="fbp-status scheduled">🔴 Đang Live</span>'
                : '<span class="fbp-status">📺 Đã Live</span>';
        if (p.type === 'video') return '<span class="fbp-status">🎬 Video</span>';
        if (p.type === 'photo') return '<span class="fbp-status">🖼️ Hình ảnh</span>';
        return '<span class="fbp-status">📝 Bài viết</span>';
    }

    function notify(msg, type) {
        if (window.notificationManager) window.notificationManager[type || 'info'](msg);
    }
    function esc(s) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(s);
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

    function postRowHtml(p) {
        return `
            <div class="fbp-post">
                ${p.picture ? `<img class="fbp-post-thumb" src="${esc(p.picture)}" data-view="${esc(p.id)}" style="cursor:pointer" loading="lazy" alt="" />` : ''}
                <div class="fbp-post-body" data-view="${esc(p.id)}" style="cursor:pointer">
                    <p class="fbp-post-msg">${esc(p.message) || '<i>(không có nội dung)</i>'}</p>
                    <div class="fbp-post-meta">
                        <span>${fmt(p.createdTime)}</span>
                        ${typeBadge(p)}
                    </div>
                </div>
                <div class="fbp-post-actions">
                    <button class="fbp-btn ghost sm" data-view="${esc(p.id)}" type="button"><i data-lucide="eye"></i> Xem</button>
                    <button class="fbp-btn ghost sm" data-history="${esc(p.id)}" type="button" title="Lịch sử thao tác"><i data-lucide="history"></i> Lịch sử</button>
                    <button class="fbp-btn danger sm" data-del="${esc(p.id)}" type="button"><i data-lucide="trash-2"></i> Xoá</button>
                </div>
            </div>`;
    }

    // Render danh sách bài (lọc client-side theo _filter).
    function renderPostsList() {
        const listEl = document.getElementById('fbpPostsList');
        if (!listEl) return;
        const arr = _filter === 'all' ? _posts : _posts.filter((p) => p.type === _filter);
        listEl.innerHTML = arr.length
            ? arr.map(postRowHtml).join('')
            : '<div class="fbp-empty" style="padding:18px">Chưa có bài loại này trong số đã tải — cuộn để tải thêm.</div>';
        wireRows(listEl);
        const cnt = document.getElementById('fbpPostCount');
        if (cnt)
            cnt.textContent = _filter === 'all' ? _posts.length : `${arr.length}/${_posts.length}`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    function wireFilterChips() {
        document.querySelectorAll('#fbpTypeFilters [data-flt]').forEach((b) => {
            b.addEventListener('click', () => {
                _filter = b.dataset.flt;
                document
                    .querySelectorAll('#fbpTypeFilters .fbp-style')
                    .forEach((x) => x.classList.toggle('on', x === b));
                renderPostsList();
            });
        });
    }

    function wireRows(container) {
        if (!container) return;
        container.querySelectorAll('[data-del]').forEach((b) => {
            if (b._wired) return;
            b._wired = 1;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                del(b.dataset.del);
            });
        });
        container.querySelectorAll('[data-view]').forEach((b) => {
            if (b._wired) return;
            b._wired = 1;
            b.addEventListener('click', () => openViewer(b.dataset.view));
        });
        container.querySelectorAll('[data-history]').forEach((b) => {
            if (b._wired) return;
            b._wired = 1;
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                openHistory(b.dataset.history);
            });
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
    }

    // Lịch sử thao tác của 1 bài FB (module shared Web2AuditLog auto-load qua sidebar).
    function openHistory(postId) {
        window.Web2AuditLog?.openRecord?.({
            entity: 'fb-post',
            entityId: postId,
            title: 'Lịch sử bài: ' + postId,
        });
    }

    async function load() {
        // Trang ĐẦU: reset + scheduled + bài page 1, rồi bật infinite scroll.
        _after = null;
        _posts = [];
        _loading = false;
        if (_observer) {
            _observer.disconnect();
            _observer = null;
        }
        const postsEl = document.getElementById('fbpPosts');
        const schedEl = document.getElementById('fbpScheduled');
        if (!postsEl) return;
        postsEl.innerHTML = '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tải…</div>';
        try {
            const r = await Api().list(_pageId, 25, null);
            if (!r.success) {
                postsEl.innerHTML = `<div class="fbp-empty">${esc(r.error || 'Lỗi tải bài')}</div>`;
                return;
            }
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
            const posts = r.posts || [];
            if (!posts.length) {
                postsEl.innerHTML =
                    '<div class="fbp-empty"><div class="empty-state-icon">📝</div>Chưa có bài viết.</div>';
                return;
            }
            _posts = posts;
            _after = r.after || null;
            postsEl.innerHTML =
                `<div class="fbp-card"><h3><i data-lucide="check-circle-2"></i> Đã đăng <span id="fbpPostCount">${posts.length}</span></h3>` +
                `<div class="fbp-styles" id="fbpTypeFilters" style="margin-bottom:12px">${TYPE_FILTERS.map(([k, l]) => `<button type="button" class="fbp-style ${k === _filter ? 'on' : ''}" data-flt="${k}">${l}</button>`).join('')}</div>` +
                `<div id="fbpPostsList"></div>` +
                `<div id="fbpSentinel" style="height:1px"></div>` +
                `<div id="fbpMoreHint" class="fbp-empty" style="padding:14px;display:none"><i data-lucide="loader"></i> Đang tải thêm…</div>` +
                '</div>';
            renderPostsList();
            wireFilterChips();
            setupInfinite();
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            postsEl.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    function setupInfinite() {
        const sentinel = document.getElementById('fbpSentinel');
        if (!sentinel || typeof IntersectionObserver === 'undefined') return;
        const root = document.querySelector('main.web2-main') || null;
        _observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((e) => e.isIntersecting)) loadMore();
            },
            { root, rootMargin: '400px' }
        );
        _observer.observe(sentinel);
    }

    async function loadMore() {
        if (_loading || !_after) return;
        _loading = true;
        const hint = document.getElementById('fbpMoreHint');
        if (hint) hint.style.display = '';
        try {
            const r = await Api().list(_pageId, 25, _after);
            const posts = (r && r.posts) || [];
            if (posts.length) {
                _posts.push(...posts);
                renderPostsList();
            }
            _after = (r && r.after) || null;
            if (!_after) {
                if (_observer) {
                    _observer.disconnect();
                    _observer = null;
                }
                if (hint) {
                    hint.innerHTML = '— Đã hết bài —';
                    hint.style.display = '';
                }
            } else if (hint) hint.style.display = 'none';
        } catch (_) {
            if (hint) hint.style.display = 'none'; // giữ _after để scroll lần sau thử lại
        } finally {
            _loading = false;
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
                    <button class="fbp-btn ghost sm" id="fbpVwEdit" type="button"><i data-lucide="pencil"></i> Sửa caption</button>
                    ${p.permalink ? `<a class="fbp-btn ghost sm" href="${esc(p.permalink)}" target="_blank" rel="noopener"><i data-lucide="external-link"></i> Mở FB</a>` : ''}
                    <button class="fbp-btn ghost sm" id="fbpVwClose" type="button">Đóng</button>
                </div>
                <div id="fbpVwMsgWrap">${p.message ? `<p id="fbpVwMsg" style="white-space:pre-wrap;line-height:1.5;font-size:.92rem;word-break:break-word">${esc(p.message)}</p>` : '<p id="fbpVwMsg" style="color:#94a3b8;font-style:italic">(không có nội dung — bấm Sửa caption để thêm)</p>'}</div>
                ${media ? `<div style="display:grid;gap:8px;margin:10px 0">${media}</div>` : ''}
                ${eng ? `<div style="font-weight:700;color:#5a6b80;padding:6px 0">${eng}</div>` : ''}
                ${cms ? `<div><h3 style="font-size:.9rem;margin:10px 0 4px"><i data-lucide="message-circle"></i> Bình luận</h3>${cms}</div>` : ''}
            `;
            box.querySelector('#fbpVwClose').onclick = () => overlay.remove();
            box.querySelector('#fbpVwEdit').onclick = () =>
                editCaption(box, postId, p.message || '');
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            box.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    // Sửa caption ngay trong viewer (POST /post-edit — giữ nguyên bài, không xoá → giữ link/tương tác).
    function editCaption(box, postId, current) {
        const wrap = box.querySelector('#fbpVwMsgWrap');
        const editBtn = box.querySelector('#fbpVwEdit');
        if (!wrap) return;
        if (editBtn) editBtn.style.display = 'none';
        wrap.innerHTML = `
            <textarea class="fbp-textarea" id="fbpVwEditTa" style="min-height:120px">${esc(current)}</textarea>
            <div style="display:flex;gap:8px;margin-top:8px">
                <button class="fbp-btn" id="fbpVwSave" type="button"><i data-lucide="save"></i> Lưu lên Facebook</button>
                <button class="fbp-btn ghost" id="fbpVwCancel" type="button">Huỷ</button>
            </div>`;
        if (window.lucide?.createIcons) window.lucide.createIcons();
        const ta = wrap.querySelector('#fbpVwEditTa');
        ta.focus();
        wrap.querySelector('#fbpVwCancel').onclick = () => {
            wrap.innerHTML = `<p id="fbpVwMsg" style="white-space:pre-wrap;line-height:1.5;font-size:.92rem;word-break:break-word">${esc(current)}</p>`;
            if (editBtn) editBtn.style.display = '';
        };
        wrap.querySelector('#fbpVwSave').onclick = async () => {
            const newMsg = ta.value;
            const btn = wrap.querySelector('#fbpVwSave');
            btn.disabled = true;
            btn.innerHTML = '<i data-lucide="loader"></i> Đang lưu…';
            if (window.lucide?.createIcons) window.lucide.createIcons();
            try {
                const r = await Api().postEdit(_pageId, postId, { message: newMsg });
                if (r.success) {
                    notify('Đã cập nhật caption trên Facebook', 'success');
                    // cập nhật local + render lại danh sách
                    const it = _posts.find((x) => String(x.id) === String(postId));
                    if (it) it.message = newMsg;
                    renderPostsList();
                    wrap.innerHTML = `<p id="fbpVwMsg" style="white-space:pre-wrap;line-height:1.5;font-size:.92rem;word-break:break-word">${esc(newMsg)}</p>`;
                    if (editBtn) editBtn.style.display = '';
                } else {
                    notify(r.error || 'Lỗi cập nhật caption', 'error');
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="save"></i> Lưu lên Facebook';
                    if (window.lucide?.createIcons) window.lucide.createIcons();
                }
            } catch (e) {
                notify(e.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save"></i> Lưu lên Facebook';
                if (window.lucide?.createIcons) window.lucide.createIcons();
            }
        };
    }

    window.FBPostsList = { render };
})();
