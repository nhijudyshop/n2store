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
        .lcm-fab{background:#2a96ff;color:#fff;border:0;border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:5px;align-items:center;white-space:nowrap;flex-shrink:0}
        .lcm-fab.lcm-fab-float{position:fixed;right:18px;bottom:18px;z-index:9998;border-radius:999px;padding:10px 16px;font-size:13px;box-shadow:0 4px 14px rgba(0, 104, 255,.4)}
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
        .lcm-btn-p{background:#2a96ff;color:#fff;border-color:#2a96ff}
        .lcm-btn-d{color:#dc2626;border-color:#fecaca}
        .lcm-form{display:flex;gap:8px;margin-top:10px}
        .lcm-form input,.lcm-sel{border:1px solid #d1d5db;border-radius:7px;padding:6px 10px;font-size:13px}
        .lcm-form input{flex:1}
        .lcm-empty{font-size:12.5px;color:#9ca3af;padding:6px 0}`;
        document.head.appendChild(s);
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated (WEB2_AUTH_ENFORCE).
    // Không token (chưa login web2) → bỏ qua header, request vẫn đi (server enforce → 401).
    function _w2AuthHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
    }

    async function _api(path, opts) {
        const o = {
            signal: AbortSignal.timeout(15000),
            ...(opts || {}),
        };
        // ENFORCE-PREP (2026-06-12): choke point — mọi call (campaigns/assign/unassign…) đi qua đây.
        o.headers = _w2AuthHeaders(o.headers);
        const r = await fetch(API + path, o);
        if (!r.ok) throw new Error('HTTP ' + r.status);
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

    // Generation counter: render gọi chồng (add/del/assign liên tiếp) → chỉ
    // lần gọi MỚI NHẤT được ghi DOM, các lần cũ bỏ sau mỗi await.
    let _renderGen = 0;

    async function _render() {
        const body = document.getElementById('lcm-body');
        if (!body) return;
        const gen = ++_renderGen;
        let camps;
        try {
            // DÙNG CHUNG: campaign CRUD + bài gom 1 nguồn ở web2/shared/web2-campaign.js
            // (trước đây fork y hệt native-orders → drift). Trang chỉ điều phối UI.
            camps = await global.Web2Campaign.list();
        } catch (e) {
            if (gen !== _renderGen) return;
            body.innerHTML =
                '<div style="padding:16px;color:#ef4444">Lỗi tải: ' + esc(e.message) + '</div>';
            return;
        }
        if (gen !== _renderGen) return;
        _camps = camps || [];
        const posts = _pagePosts();
        // map post→campaign LẤY TỪ BẢNG GÁN (web2_live_post_assign) — KHÔNG phụ
        // thuộc comment. Trước đây dùng listPosts() (driven web2_live_comments) →
        // live CŨ đã hết comment hiện "chưa gom" dù đã gom (gán vẫn LƯU, chỉ UI
        // mất trạng thái → user tưởng "không gán được", bug 2026-06-27).
        let assignMap = {};
        try {
            const pa = await global.Web2Campaign.listAssignments();
            for (const p of pa || []) assignMap[String(p.post_id)] = p.campaign_id;
        } catch {
            // Fallback khi backend chưa có /assignments (deploy gap): comment-driven như cũ.
            try {
                const pd = await global.Web2Campaign.listPosts();
                for (const p of pd || []) assignMap[String(p.post_id)] = p.campaign_id;
            } catch {}
        }
        if (gen !== _renderGen) return;

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
                    <button class="lcm-btn" data-act="ai-name" title="AI gợi ý tên chiến dịch">✨ AI</button>
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
                        <select class="lcm-sel lcm-assign" data-post="${esc(p.postId)}" data-page="${esc(p.pageId)}" data-title="${esc(p.title)}" data-prev="${esc(assignMap[String(p.postId)] || '')}">${campOpts(assignMap[String(p.postId)])}</select>
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
        fab.innerHTML = '📁 Chiến dịch';
        fab.onclick = _open;
        // Ưu tiên gắn vào topbar (#liveTopbarActions) để iframe livestream góc
        // dưới KHÔNG che; fallback floating nếu chưa có slot.
        const slot = document.getElementById('liveTopbarActions');
        if (slot) {
            fab.className = 'lcm-fab';
            slot.appendChild(fab);
        } else {
            fab.className = 'lcm-fab lcm-fab-float';
            document.body.appendChild(fab);
        }

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
                    const input = document.getElementById('lcm-newname');
                    const name = input.value.trim();
                    if (!name) return;
                    // UI-first: xoá ô nhập NGAY (cảm giác đã tạo), run nền, onSuccess re-render
                    // ra campaign mới; lỗi → khôi phục tên đã gõ. (Web2Optimistic.run)
                    if (global.Web2Optimistic?.run) {
                        global.Web2Optimistic.run({
                            snapshot: () => name,
                            apply: () => {
                                input.value = '';
                            },
                            run: () => global.Web2Campaign.create(name),
                            onSuccess: () => _render(),
                            rollback: (prev) => {
                                input.value = prev;
                            },
                            errLabel: 'tạo chiến dịch',
                        });
                    } else {
                        await global.Web2Campaign.create(name);
                        _render();
                    }
                } else if (act === 'ai-name') {
                    // AI gợi ý tên chiến dịch (free) — gọi /api/web2-ai/complete, điền vào ô tên.
                    const input = document.getElementById('lcm-newname');
                    const orig = btn.textContent;
                    btn.disabled = true;
                    btn.textContent = '⏳';
                    try {
                        const base =
                            global.API_CONFIG?.WORKER_URL ||
                            'https://chatomni-proxy.nhijudyshop.workers.dev';
                        const today = new Intl.DateTimeFormat('vi-VN', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            timeZone: 'Asia/Ho_Chi_Minh',
                        }).format(new Date());
                        const recent = _camps
                            .slice(0, 6)
                            .map((c) => c.name)
                            .filter(Boolean);
                        const sys =
                            'Bạn đặt tên chiến dịch livestream bán hàng cho shop thời trang nữ. ' +
                            'Trả về DUY NHẤT 1 tên ngắn (≤6 từ), có sức hút, tiếng Việt, ' +
                            'KHÔNG giải thích, KHÔNG dấu ngoặc kép.';
                        const usr =
                            `Hôm nay ${today}. Đặt 1 tên chiến dịch livestream mới.` +
                            (recent.length
                                ? ` Tên đã dùng (tránh trùng): ${recent.join('; ')}.`
                                : '');
                        // 2 lần thử: provider free xoay vòng đôi khi trả rỗng (vd OpenRouter
                        // "phản hồi rỗng") → thử lại 1 lần thường rơi vào provider khác (gemini).
                        let name = '';
                        let lastErr = '';
                        for (let attempt = 0; attempt < 2 && !name; attempt++) {
                            const r = await fetch(base + '/api/web2-ai/complete', {
                                method: 'POST',
                                headers: _w2AuthHeaders({ 'content-type': 'application/json' }),
                                body: JSON.stringify({
                                    messages: [{ role: 'user', content: usr }],
                                    system: sys,
                                    temperature: 0.9,
                                    // ⚠ Gemini 2.5 Flash là model "thinking" → đốt token SUY NGHĨ
                                    // trước khi xuất; maxTokens thấp (40) → tên bị CẮT ("Sóng",
                                    // "Thời Trang N"). 800 đủ chỗ thinking + tên ngắn.
                                    maxTokens: 800,
                                }),
                            }).catch(() => null);
                            const d = r ? await r.json().catch(() => ({})) : {};
                            if (r && r.ok && d && d.text) {
                                name = String(d.text)
                                    .trim()
                                    .replace(/^["'“”\s]+|["'“”\s]+$/g, '')
                                    .split('\n')[0]
                                    .slice(0, 60);
                            } else {
                                lastErr = (d && d.error) || 'HTTP ' + (r ? r.status : '?');
                            }
                        }
                        if (!name) throw new Error(lastErr || 'AI không phản hồi');
                        if (input) {
                            input.value = name;
                            input.focus();
                        }
                    } catch (err) {
                        (global.notificationManager?.show
                            ? global.notificationManager.show.bind(global.notificationManager)
                            : (m) => console.warn(m))('AI gợi ý tên lỗi: ' + err.message, 'error');
                    } finally {
                        btn.disabled = false;
                        btn.textContent = orig;
                    }
                } else if (act === 'del') {
                    const cid = btn.closest('[data-cid]')?.dataset.cid;
                    if (
                        !cid ||
                        !(await Popup.danger('Xoá chiến dịch? (comment giữ nguyên, chỉ gỡ gom)', {
                            okText: 'Xoá',
                        }))
                    )
                        return;
                    await global.Web2Campaign.remove(cid);
                    _render();
                } else if (act === 'view') {
                    const cid = btn.closest('[data-cid]')?.dataset.cid;
                    if (cid) _viewCampaign(cid);
                }
            } catch (err) {
                Popup.error('Lỗi: ' + err.message);
            }
        });

        modal.addEventListener('change', async (e) => {
            const sel = e.target.closest('.lcm-assign');
            if (!sel) return;
            const postId = sel.dataset.post;
            const cid = sel.value;
            const doRun = () =>
                cid
                    ? global.Web2Campaign.assignPost(cid, {
                          postId,
                          pageId: sel.dataset.page,
                          postTitle: sel.dataset.title,
                      })
                    : global.Web2Campaign.unassignPost(postId);
            // UI-first: <select> đã đổi value (native) ngay khi user chọn → cảm giác tức
            // thì. run nền; lỗi → rollback value cũ + re-render. (Web2Optimistic.run)
            if (global.Web2Optimistic?.run) {
                const prevVal = sel.dataset.prev != null ? sel.dataset.prev : '';
                global.Web2Optimistic.run({
                    snapshot: () => prevVal,
                    apply: () => {
                        sel.dataset.prev = cid; // mốc mới cho lần sau
                    },
                    run: doRun,
                    onSuccess: () => _render(),
                    rollback: (prev) => {
                        sel.value = prev;
                        sel.dataset.prev = prev;
                    },
                    errLabel: 'gom bài',
                });
            } else {
                try {
                    await doRun();
                    _render();
                } catch (err) {
                    Popup.error('Lỗi gom: ' + err.message);
                }
            }
        });
    }

    // Banner "← Quay lại live" hiện trên đầu cột comment khi đang xem chiến dịch.
    function _showBackBanner(campName) {
        _removeBackBanner();
        const list = document.getElementById('liveCommentList');
        if (!list || !list.parentNode) return;
        const bar = document.createElement('div');
        bar.id = 'lcm-back-banner';
        bar.style.cssText =
            'display:flex;align-items:center;gap:8px;padding:7px 12px;background:#eef2ff;border-bottom:1px solid #c7d2fe;font-size:12.5px;color:#3730a3';
        bar.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📁 Đang xem chiến dịch${campName ? ': <strong>' + esc(campName) + '</strong>' : ''}</span>
            <button class="lcm-btn" id="lcm-back-live" style="white-space:nowrap">← Quay lại live</button>`;
        list.parentNode.insertBefore(bar, list);
        bar.querySelector('#lcm-back-live').onclick = exitCampaignView;
    }
    function _removeBackBanner() {
        document.getElementById('lcm-back-banner')?.remove();
    }

    // Thoát chế độ xem chiến dịch → khôi phục comments live ban đầu.
    function exitCampaignView() {
        const st = global.LiveState;
        const mgr = global.LiveColumnManager;
        _removeBackBanner();
        if (st && mgr && mgr._origComments) {
            st.comments = mgr._origComments;
            mgr._origComments = null;
            global.LiveCommentList?.renderComments?.();
        }
    }

    // Xem comment 1 chiến dịch cha → load từ DB (gom mọi bài) vào cột comment.
    // MEDIUM-cleanup (2026-06-13): giảm limit mặc định 5000 → 1500 (1 request
    // kéo 5000 row map+sort+render 1 lần gây lag). Khi chạm cap → cảnh báo user
    // chỉ thấy 1500 comment mới nhất (phân trang đầy đủ để sau, tránh phá UX).
    const VIEW_LIMIT = 1500;
    async function _viewCampaign(campaignId) {
        try {
            const d = await _api(
                '/?campaignId=' + encodeURIComponent(campaignId) + '&limit=' + VIEW_LIMIT
            );
            const rows = d.data || [];
            if (rows.length >= VIEW_LIMIT) {
                console.warn(
                    '[LiveCampaignManager] chạm cap ' +
                        VIEW_LIMIT +
                        ' comment — chỉ hiển thị phần mới nhất.'
                );
            }
            const st = global.LiveState;
            const mgr = global.LiveColumnManager;
            if (st && mgr?._mapDbComment) {
                // Giữ comments live gốc để "← Quay lại live" khôi phục được.
                if (!mgr._origComments) mgr._origComments = st.comments;
                st.comments = rows.map((r) => mgr._mapDbComment(r));
                st.comments.sort(
                    (a, b) =>
                        SharedUtils.toEpochMs(b.created_time) -
                        SharedUtils.toEpochMs(a.created_time)
                );
                global.LiveCommentList?.renderComments?.();
                const camp = _camps.find((c) => String(c.id) === String(campaignId));
                _showBackBanner(camp?.name || '');
                _close();
                global.notificationManager?.show?.(
                    rows.length >= VIEW_LIMIT
                        ? `Xem ${rows.length} comment mới nhất của chiến dịch (giới hạn ${VIEW_LIMIT})`
                        : `Xem ${rows.length} comment của chiến dịch`,
                    'info'
                );
            }
        } catch (e) {
            Popup.error('Lỗi xem: ' + e.message);
        }
    }

    global.LiveCampaignManager = { mount: _mount, open: _open, exitCampaignView };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_mount, 1500));
    } else {
        setTimeout(_mount, 1500);
    }
})(typeof window !== 'undefined' ? window : globalThis);
