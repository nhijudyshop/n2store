// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — quản lý chiến dịch cha (gom bài livestream) ngay trong live-chat.
// =====================================================================
// LiveCampaignManager — nút nổi "📁 Chiến dịch" + modal: tạo chiến dịch cha,
// gán các bài livestream của page vào chiến dịch (để gom comment nhiều buổi
// live). Dùng API /api/web2-live-comments/{campaigns,posts,assign}.
// =====================================================================

(function (global) {
    'use strict';
    if (global.LiveCampaignManager) return;

    const API = (() => {
        const w = global.LiveState?.workerUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return w.replace(/\/$/, '') + '/api/web2-live-comments';
    })();

    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );

    let _camps = [];

    function _injectStyles() {
        if (document.getElementById('lcm-styles')) return;
        const s = document.createElement('style');
        s.id = 'lcm-styles';
        s.textContent = `
        .lcm-fab{position:fixed;right:18px;bottom:18px;z-index:9998;background:#6366f1;color:#fff;border:0;border-radius:999px;padding:10px 16px;font-size:13px;font-weight:600;box-shadow:0 4px 14px rgba(99,102,241,.4);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
        .lcm-fab:hover{filter:brightness(1.05)}
        .lcm-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center}
        .lcm-modal.open{display:flex}
        .lcm-back{position:absolute;inset:0;background:rgba(15,23,42,.5)}
        .lcm-panel{position:relative;background:#fff;border-radius:14px;width:min(680px,94vw);max-height:88vh;overflow:auto;padding:0}
        .lcm-head{display:flex;justify-content:space-between;align-items:center;padding:16px 20px;border-bottom:1px solid #eef2f7;position:sticky;top:0;background:#fff;z-index:1}
        .lcm-head h3{margin:0;font-size:16px}
        .lcm-x{border:0;background:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}
        .lcm-body{padding:16px 20px}
        .lcm-sec{margin-bottom:18px}
        .lcm-sec h4{margin:0 0 8px;font-size:13px;color:#374151}
        .lcm-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f4f6f9}
        .lcm-row:last-child{border-bottom:0}
        .lcm-name{flex:1;min-width:0;font-weight:600;font-size:13px}
        .lcm-sub{font-size:11.5px;color:#6b7280;font-weight:400}
        .lcm-btn{border:1px solid #d1d5db;background:#fff;border-radius:7px;padding:5px 11px;font-size:12.5px;cursor:pointer}
        .lcm-btn:hover{background:#f3f4f6}
        .lcm-btn-p{background:#6366f1;color:#fff;border-color:#6366f1}
        .lcm-btn-d{color:#dc2626;border-color:#fecaca}
        .lcm-form{display:flex;gap:8px;margin-top:10px}
        .lcm-form input,.lcm-sel{border:1px solid #d1d5db;border-radius:7px;padding:6px 10px;font-size:13px}
        .lcm-form input{flex:1}
        .lcm-empty{font-size:12.5px;color:#9ca3af;padding:6px 0}`;
        document.head.appendChild(s);
    }

    async function _api(path, opts) {
        const r = await fetch(API + path, opts);
        return r.json().catch(() => ({}));
    }

    function _pagePosts() {
        // Bài livestream của page đang chọn (từ dropdown campaign live-chat).
        const st = global.LiveState;
        const camps = (st?.liveCampaigns || []).slice();
        return camps.map((c) => ({
            postId: c.Facebook_LiveId || c.Id,
            title: c.Name || '(livestream)',
            pageId: c.Facebook_UserId,
            pageName: c.Facebook_UserName || '',
            date: c.DateCreated,
        }));
    }

    async function _render() {
        const body = document.getElementById('lcm-body');
        if (!body) return;
        const cd = await _api('/campaigns');
        _camps = cd.data || [];
        const posts = _pagePosts();
        // map post→campaign từ /posts (assign hiện tại)
        let assignMap = {};
        try {
            const pd = await _api('/posts');
            for (const p of pd.data || []) assignMap[String(p.post_id)] = p.campaign_id;
        } catch {}

        const campOpts = (sel) =>
            `<option value="">— chưa gom —</option>` +
            _camps
                .map(
                    (c) =>
                        `<option value="${c.id}" ${String(sel) === String(c.id) ? 'selected' : ''}>${esc(c.name)}</option>`
                )
                .join('');

        body.innerHTML = `
            <div class="lcm-sec">
                <h4>Chiến dịch cha</h4>
                ${
                    _camps.length
                        ? _camps
                              .map(
                                  (c) => `<div class="lcm-row" data-cid="${c.id}">
                        <div class="lcm-name">${esc(c.name)}
                            <div class="lcm-sub">${c.post_count || 0} bài · ${(c.comment_count || 0).toLocaleString('vi-VN')} comment</div>
                        </div>
                        <button class="lcm-btn" data-act="view">Xem comment</button>
                        <button class="lcm-btn lcm-btn-d" data-act="del">Xoá</button>
                    </div>`
                              )
                              .join('')
                        : '<div class="lcm-empty">Chưa có chiến dịch nào.</div>'
                }
                <div class="lcm-form">
                    <input id="lcm-newname" placeholder="Tên chiến dịch (vd: Live tháng 6)" />
                    <button class="lcm-btn lcm-btn-p" data-act="add">+ Tạo</button>
                </div>
            </div>
            <div class="lcm-sec">
                <h4>Bài livestream của page → gom vào chiến dịch</h4>
                ${
                    posts.length
                        ? posts
                              .map(
                                  (p) => `<div class="lcm-row">
                        <div class="lcm-name">${esc(p.title).slice(0, 60)}
                            <div class="lcm-sub">${esc(p.pageName)} · ${esc(String(p.date || '').slice(0, 10))}</div>
                        </div>
                        <select class="lcm-sel lcm-assign" data-post="${esc(p.postId)}" data-page="${esc(p.pageId)}" data-title="${esc(p.title)}">${campOpts(assignMap[String(p.postId)])}</select>
                    </div>`
                              )
                              .join('')
                        : '<div class="lcm-empty">Chưa có bài livestream (chọn page có live trước).</div>'
                }
            </div>`;
    }

    function _open() {
        document.getElementById('lcm-modal')?.classList.add('open');
        _render();
    }
    function _close() {
        document.getElementById('lcm-modal')?.classList.remove('open');
    }

    function _mount() {
        _injectStyles();
        if (document.getElementById('lcm-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'lcm-fab';
        fab.className = 'lcm-fab';
        fab.innerHTML = '📁 Chiến dịch';
        fab.onclick = _open;
        document.body.appendChild(fab);

        const modal = document.createElement('div');
        modal.id = 'lcm-modal';
        modal.className = 'lcm-modal';
        modal.innerHTML = `
            <div class="lcm-back"></div>
            <div class="lcm-panel">
                <div class="lcm-head"><h3>📁 Chiến dịch cha — gom buổi livestream</h3><button class="lcm-x">×</button></div>
                <div class="lcm-body" id="lcm-body"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.lcm-back').onclick = _close;
        modal.querySelector('.lcm-x').onclick = _close;

        modal.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-act]');
            if (!btn) return;
            const act = btn.dataset.act;
            try {
                if (act === 'add') {
                    const name = document.getElementById('lcm-newname').value.trim();
                    if (!name) return;
                    await _api('/campaigns', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name }),
                    });
                    _render();
                } else if (act === 'del') {
                    const cid = btn.closest('[data-cid]')?.dataset.cid;
                    if (!cid || !confirm('Xoá chiến dịch? (comment giữ nguyên, chỉ gỡ gom)'))
                        return;
                    await _api('/campaigns/' + cid, { method: 'DELETE' });
                    _render();
                } else if (act === 'view') {
                    const cid = btn.closest('[data-cid]')?.dataset.cid;
                    if (cid) _viewCampaign(cid);
                }
            } catch (err) {
                alert('Lỗi: ' + err.message);
            }
        });

        modal.addEventListener('change', async (e) => {
            const sel = e.target.closest('.lcm-assign');
            if (!sel) return;
            const postId = sel.dataset.post;
            const cid = sel.value;
            try {
                if (cid) {
                    await _api('/campaigns/' + cid + '/assign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            postId,
                            pageId: sel.dataset.page,
                            postTitle: sel.dataset.title,
                        }),
                    });
                } else {
                    await _api('/unassign', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ postId }),
                    });
                }
                _render();
            } catch (err) {
                alert('Lỗi gom: ' + err.message);
            }
        });
    }

    // Xem comment 1 chiến dịch cha → load từ DB (gom mọi bài) vào cột comment.
    async function _viewCampaign(campaignId) {
        try {
            const d = await _api('/?campaignId=' + encodeURIComponent(campaignId) + '&limit=5000');
            const rows = d.data || [];
            const st = global.LiveState;
            const mgr = global.LiveColumnManager;
            if (st && mgr?._mapDbComment) {
                st.comments = rows.map((r) => mgr._mapDbComment(r));
                st.comments.sort(
                    (a, b) =>
                        new Date(b.created_time || 0).getTime() -
                        new Date(a.created_time || 0).getTime()
                );
                global.LiveCommentList?.renderComments?.();
                _close();
                global.notificationManager?.show?.(
                    `Xem ${rows.length} comment của chiến dịch`,
                    'info'
                );
            }
        } catch (e) {
            alert('Lỗi xem: ' + e.message);
        }
    }

    global.LiveCampaignManager = { mount: _mount, open: _open };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_mount, 1500));
    } else {
        setTimeout(_mount, 1500);
    }
})(typeof window !== 'undefined' ? window : globalThis);
