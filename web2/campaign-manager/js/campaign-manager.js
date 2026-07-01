// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — Quản lý chiến dịch livestream (CHA span 2 page). Admin-only. Dùng Web2Campaign + Web2Chat (fetch Pancake 2 page).
(function () {
    'use strict';

    // ---------- State ----------
    const state = {
        campaigns: [], // [{id,name,note,post_count,comment_count,created_at}]
        assignMap: new Map(), // post_id(String) -> {campaign_id, post_title, page_id}
        posts: [], // Pancake livestream posts (cả 2 page)
        postsLoaded: false,
        selectedId: null, // campaign đang xem (null = chưa chọn)
        mode: 'idle', // 'idle' | 'create' | 'campaign'
        picked: new Set(), // postId đã tick trong create-picker
        busy: false,
    };

    // ---------- Helpers ----------
    const esc = (s) =>
        window.Web2Escape && window.Web2Escape.escapeHtml
            ? window.Web2Escape.escapeHtml(s)
            : String(s == null ? '' : s).replace(
                  /[&<>"']/g,
                  (c) =>
                      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
              );

    // Pancake inserted_at = UTC KHÔNG hậu tố Z → append Z (GMT+7 hiển thị đúng).
    function parseTs(s) {
        if (!s) return 0;
        if (typeof s === 'number') return s < 1e12 ? s * 1000 : s;
        let str = String(s);
        if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?$/.test(str)) str += 'Z';
        const t = Date.parse(str);
        return isNaN(t) ? 0 : t;
    }
    function fmtDate(s) {
        const t = parseTs(s);
        if (!t) return '';
        try {
            return new Intl.DateTimeFormat('vi-VN', {
                timeZone: 'Asia/Ho_Chi_Minh',
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
            }).format(new Date(t));
        } catch (_) {
            return '';
        }
    }
    const isAdmin = () => !window.Web2Perm || window.Web2Perm.isAdmin();
    function toast(msg, type) {
        try {
            if (window.notificationManager && window.notificationManager.show)
                return window.notificationManager.show(msg, type || 'info');
        } catch (_) {}
        console.log('[campaign-manager]', type || 'info', msg);
    }
    async function confirmDanger(msg) {
        if (window.Popup && window.Popup.danger) return window.Popup.danger(msg);
        if (window.Popup && window.Popup.confirm) return window.Popup.confirm(msg);
        return window.confirm(msg);
    }
    const icon = () => window.lucide && window.lucide.createIcons && window.lucide.createIcons();
    const $ = (id) => document.getElementById(id);

    // ---------- Data ----------
    async function loadCampaigns() {
        const [list, assigns] = await Promise.all([
            window.Web2Campaign.list().catch(() => []),
            window.Web2Campaign.listAssignments().catch(() => []),
        ]);
        state.campaigns = Array.isArray(list) ? list : [];
        state.assignMap = new Map();
        for (const a of assigns || []) {
            if (a && a.post_id != null)
                state.assignMap.set(String(a.post_id), {
                    campaign_id: a.campaign_id,
                    post_title: a.post_title,
                    page_id: a.page_id,
                });
        }
    }

    // Fetch bài livestream TRỰC TIẾP từ mọi page Pancake tài khoản quản lý (2 page
    // Store + House). Fallback: Web2Campaign.listPagePosts() (poller /page-posts).
    async function loadPancakePosts() {
        const out = [];
        const W = window.Web2Chat;
        const jwt = W && W.getJwt && W.getJwt();
        const worker = (W && W._internal && W._internal.WORKER_URL) || '';
        if (jwt && W.listPages) {
            try {
                const raw = await W.listPages();
                const pages = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
                const now = Math.floor(Date.now() / 1000);
                for (const pg of pages) {
                    const pid = pg && (pg.id || pg.pageId);
                    if (!pid) continue;
                    const qs = new URLSearchParams({
                        access_token: jwt,
                        start_time: String(now - 14 * 86400),
                        end_time: String(now),
                    });
                    const url = `${worker}/api/pancake/pages/${encodeURIComponent(pid)}/posts?${qs}`;
                    let postsRaw = [];
                    try {
                        const d = await fetch(url).then((r) => r.json());
                        postsRaw = Array.isArray(d && d.posts)
                            ? d.posts
                            : Array.isArray(d && d.data)
                              ? d.data
                              : [];
                    } catch (_) {
                        continue;
                    }
                    for (const p of postsRaw) {
                        if (!p || !(p.type === 'livestream' || p.is_live_video || p.live_video_id))
                            continue;
                        out.push({
                            postId: String(p.id),
                            pageId: String(pid),
                            pageName: pg.name || pg.pageName || '',
                            title: p.message || p.title || '(livestream)',
                            date: p.inserted_at || p.created_time || p.updated_at || null,
                            living: p.live_status === 'LIVE' || !!p.is_living,
                            commentCount: Number(p.comment_count) || 0,
                        });
                    }
                }
                if (out.length) return dedupeSort(out);
            } catch (_) {
                /* rơi xuống fallback */
            }
        }
        // Fallback poller
        try {
            const pp = (await window.Web2Campaign.listPagePosts()) || [];
            for (const p of pp) {
                out.push({
                    postId: String(p.postId || p.post_id || ''),
                    pageId: String(p.pageId || p.page_id || ''),
                    pageName: p.pageName || p.page_name || '',
                    title: p.title || p.post_title || p.message || '(bài live)',
                    date: p.date || p.inserted_at || null,
                    living: !!(p.living || p.is_living),
                    commentCount: Number(p.commentCount || p.comment_count) || 0,
                });
            }
        } catch (_) {}
        return dedupeSort(out);
    }
    function dedupeSort(arr) {
        const seen = new Set();
        const uniq = [];
        for (const p of arr) {
            if (!p.postId || seen.has(p.postId)) continue;
            seen.add(p.postId);
            uniq.push(p);
        }
        return uniq.sort(
            (a, b) => (b.living ? 1 : 0) - (a.living ? 1 : 0) || parseTs(b.date) - parseTs(a.date)
        );
    }
    async function ensurePosts() {
        if (state.postsLoaded) return;
        state.posts = await loadPancakePosts();
        state.postsLoaded = true;
    }

    // ---------- Render: list ----------
    function renderList() {
        const el = $('cmList');
        const cnt = $('cmListCount');
        if (cnt) cnt.textContent = state.campaigns.length;
        if (!el) return;
        if (!state.campaigns.length) {
            el.innerHTML = `<div class="cm-hint">Chưa có chiến dịch nào.</div>`;
            return;
        }
        el.innerHTML = state.campaigns
            .map(
                (c) => `
            <div class="cm-card${String(c.id) === String(state.selectedId) ? ' is-active' : ''}" data-cid="${esc(c.id)}" role="button" tabindex="0">
                <div class="cm-card-name">${esc(c.name)}</div>
                <div class="cm-card-meta">
                    <span><i data-lucide="clapperboard"></i> ${Number(c.post_count) || 0} bài</span>
                    <span><i data-lucide="message-circle"></i> ${Number(c.comment_count) || 0}</span>
                </div>
            </div>`
            )
            .join('');
        icon();
    }

    // ---------- Render: detail ----------
    function renderDetail() {
        const el = $('cmDetail');
        if (!el) return;
        if (state.mode === 'create') return renderCreate(el);
        if (state.mode === 'campaign' && state.selectedId != null) {
            const c = state.campaigns.find((x) => String(x.id) === String(state.selectedId));
            if (c) return renderCampaign(el, c);
        }
        el.innerHTML = `<div class="cm-empty"><i data-lucide="megaphone"></i>
            <p>Chọn 1 chiến dịch bên trái, hoặc bấm “Tạo chiến dịch”.</p></div>`;
        icon();
    }

    function postRowHtml(p, opts) {
        opts = opts || {};
        const owner = state.assignMap.get(p.postId);
        const ownedElse =
            owner && String(owner.campaign_id) !== String(opts.campaignId || '') ? owner : null;
        const ownerName = ownedElse
            ? (state.campaigns.find((c) => String(c.id) === String(ownedElse.campaign_id)) || {})
                  .name || '#' + ownedElse.campaign_id
            : '';
        return `
            <label class="cm-post${opts.picked ? ' is-picked' : ''}" data-postid="${esc(p.postId)}">
                ${opts.checkbox ? `<input type="checkbox" class="cm-post-check" ${opts.picked ? 'checked' : ''} data-postid="${esc(p.postId)}" />` : ''}
                <div class="cm-post-body">
                    <div class="cm-post-title">${esc(p.title)}</div>
                    <div class="cm-post-sub">
                        ${p.pageName ? `<span class="cm-badge cm-badge-page">${esc(p.pageName)}</span>` : ''}
                        ${p.living ? `<span class="cm-badge cm-badge-live">LIVE</span>` : ''}
                        ${p.date ? `<span>${esc(fmtDate(p.date))}</span>` : ''}
                        ${p.commentCount ? `<span><i data-lucide="message-circle"></i> ${p.commentCount}</span>` : ''}
                        ${ownedElse ? `<span class="cm-badge cm-badge-owned" title="Đang thuộc chiến dịch khác">↔ ${esc(ownerName)}</span>` : ''}
                    </div>
                </div>
                ${opts.trailing || ''}
            </label>`;
    }

    function renderCreate(el) {
        const admin = isAdmin();
        el.innerHTML = `
        <div class="cm-detail-inner">
            <div class="cm-detail-head">
                <div><h2>Tạo chiến dịch mới</h2>
                <div class="cm-note">Nhập tên + tick các bài Facebook để gán trong 1 lượt.</div></div>
                <div class="cm-detail-actions">
                    <button class="cm-btn cm-btn-ghost cm-btn-sm" id="cmCancelCreate">Đóng</button>
                </div>
            </div>
            ${admin ? '' : `<div class="cm-readonly-note"><i data-lucide="lock"></i> Chỉ admin được tạo/gán chiến dịch.</div>`}
            <div class="cm-field">
                <label for="cmName">Tên chiến dịch *</label>
                <input class="cm-input" id="cmName" maxlength="120" placeholder="vd: Live 01/07/2026" ${admin ? '' : 'disabled'} />
            </div>
            <div class="cm-field">
                <label for="cmNote">Ghi chú</label>
                <textarea class="cm-textarea" id="cmNote" placeholder="Mục đích, ghi chú quản lý…" ${admin ? '' : 'disabled'}></textarea>
            </div>
            <div class="cm-section-label">
                <span>Bài Facebook (đang / đã livestream) <span id="cmPickCount"></span></span>
                <button class="cm-btn cm-btn-ghost cm-btn-sm" id="cmReloadPosts"><i data-lucide="refresh-cw"></i> Tải bài</button>
            </div>
            <div class="cm-posts" id="cmPosts"><div class="cm-hint">Đang tải bài livestream…</div></div>
            <div class="cm-form-actions">
                <button class="cm-btn cm-btn-ghost" id="cmCancelCreate2">Hủy</button>
                <button class="cm-btn cm-btn-primary" id="cmSaveCreate" ${admin ? '' : 'disabled'}><i data-lucide="check"></i> Lưu chiến dịch</button>
            </div>
        </div>`;
        icon();
        renderPickerInto('cmPosts', { checkbox: true, picked: true });
        ensurePosts().then(() => renderPickerInto('cmPosts', { checkbox: true, picked: true }));
    }

    function renderPickerInto(containerId, opts) {
        const box = $(containerId);
        if (!box) return;
        if (!state.postsLoaded) {
            box.innerHTML = `<div class="cm-hint">Đang tải bài livestream…</div>`;
            return;
        }
        const list = opts.filter ? state.posts.filter(opts.filter) : state.posts;
        if (!list.length) {
            box.innerHTML = `<div class="cm-hint">Không tìm thấy bài livestream nào (14 ngày). Kiểm tra token Pancake ở “Cấu hình → Pancake (Token)”.</div>`;
            return;
        }
        box.innerHTML = list
            .map((p) =>
                postRowHtml(p, {
                    checkbox: !!opts.checkbox,
                    picked: opts.checkbox && state.picked.has(p.postId),
                    campaignId: opts.campaignId,
                    trailing: opts.trailing ? opts.trailing(p) : '',
                })
            )
            .join('');
        icon();
        updatePickCount();
    }
    function updatePickCount() {
        const el = $('cmPickCount');
        if (el) el.textContent = state.picked.size ? `— đã chọn ${state.picked.size}` : '';
    }

    function renderCampaign(el, c) {
        const admin = isAdmin();
        const assigned = [];
        for (const [postId, info] of state.assignMap.entries()) {
            if (String(info.campaign_id) === String(c.id)) {
                const full = state.posts.find((p) => p.postId === postId);
                assigned.push(
                    full || {
                        postId,
                        title: info.post_title || '(bài đã gán)',
                        pageName: '',
                        pageId: info.page_id,
                        date: null,
                    }
                );
            }
        }
        el.innerHTML = `
        <div class="cm-detail-inner">
            <div class="cm-detail-head">
                <div>
                    <h2>${esc(c.name)}</h2>
                    ${c.note ? `<div class="cm-note">${esc(c.note)}</div>` : ''}
                    <div class="cm-card-meta" style="margin-top:6px">
                        <span><i data-lucide="clapperboard"></i> ${assigned.length} bài</span>
                        <span><i data-lucide="message-circle"></i> ${Number(c.comment_count) || 0} comment</span>
                    </div>
                </div>
                <div class="cm-detail-actions">
                    ${admin ? `<button class="cm-btn cm-btn-danger cm-btn-sm" id="cmDelete" title="Xóa chiến dịch"><i data-lucide="trash-2"></i></button>` : ''}
                </div>
            </div>
            ${admin ? '' : `<div class="cm-readonly-note"><i data-lucide="lock"></i> Chỉ admin được gán/gỡ bài & sửa/xóa.</div>`}

            <div class="cm-section-label"><span>Bài đã gán (${assigned.length})</span></div>
            <div class="cm-assigned" id="cmAssigned">
                ${
                    assigned.length
                        ? assigned
                              .map(
                                  (p) => `
                    <div class="cm-assigned-row" data-postid="${esc(p.postId)}">
                        <div class="cm-post-body">
                            <div class="cm-post-title">${esc(p.title)}</div>
                            <div class="cm-post-sub">
                                ${p.pageName ? `<span class="cm-badge cm-badge-page">${esc(p.pageName)}</span>` : ''}
                                ${p.living ? `<span class="cm-badge cm-badge-live">LIVE</span>` : ''}
                                ${p.date ? `<span>${esc(fmtDate(p.date))}</span>` : ''}
                            </div>
                        </div>
                        ${admin ? `<button class="cm-btn cm-btn-danger cm-btn-sm" data-unassign="${esc(p.postId)}" title="Gỡ bài"><i data-lucide="x"></i></button>` : ''}
                    </div>`
                              )
                              .join('')
                        : `<div class="cm-hint">Chưa gán bài nào.</div>`
                }
            </div>

            ${
                admin
                    ? `<div class="cm-section-label">
                        <span>Gán thêm bài</span>
                        <button class="cm-btn cm-btn-ghost cm-btn-sm" id="cmReloadPosts2"><i data-lucide="refresh-cw"></i> Tải bài</button>
                    </div>
                    <div class="cm-posts" id="cmAddPosts"><div class="cm-hint">Đang tải bài livestream…</div></div>`
                    : ''
            }
        </div>`;
        icon();
        if (admin) {
            const renderAdd = () =>
                renderPickerInto('cmAddPosts', {
                    campaignId: c.id,
                    // ẩn bài đã gán vào CHÍNH chiến dịch này
                    filter: (p) => {
                        const owner = state.assignMap.get(p.postId);
                        return !owner || String(owner.campaign_id) !== String(c.id);
                    },
                    trailing: (p) =>
                        `<button class="cm-btn cm-btn-ghost cm-btn-sm" data-assign="${esc(p.postId)}"><i data-lucide="plus"></i></button>`,
                });
            renderAdd();
            ensurePosts().then(renderAdd);
        }
    }

    // ---------- Actions ----------
    async function reloadAll(keepPosts) {
        await loadCampaigns();
        if (!keepPosts) {
            state.postsLoaded = false;
        }
        renderList();
        renderDetail();
    }

    async function doCreate() {
        if (state.busy) return;
        const name = ($('cmName')?.value || '').trim();
        const note = ($('cmNote')?.value || '').trim();
        if (!name) return toast('Nhập tên chiến dịch', 'error');
        state.busy = true;
        const btn = $('cmSaveCreate');
        if (btn) btn.disabled = true;
        try {
            const id = await window.Web2Campaign.create(name, note || null);
            if (!id) throw new Error('Không nhận được id chiến dịch');
            const picks = [...state.picked];
            for (const postId of picks) {
                const p = state.posts.find((x) => x.postId === postId);
                if (!p) continue;
                await window.Web2Campaign.assignPost(id, {
                    postId: p.postId,
                    postTitle: p.title,
                    pageId: p.pageId,
                }).catch((e) => console.warn('assign fail', postId, e.message));
            }
            await toast(
                `Đã tạo “${name}”${picks.length ? ` + gán ${picks.length} bài` : ''}`,
                'success'
            );
            state.picked.clear();
            state.mode = 'campaign';
            state.selectedId = id;
            await reloadAll(true);
        } catch (e) {
            await toast('Lỗi tạo chiến dịch: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    async function doAssign(postId) {
        if (state.busy || state.selectedId == null) return;
        const p = state.posts.find((x) => x.postId === postId);
        if (!p) return;
        state.busy = true;
        try {
            await window.Web2Campaign.assignPost(state.selectedId, {
                postId: p.postId,
                postTitle: p.title,
                pageId: p.pageId,
            });
            await toast('Đã gán bài', 'success');
            await reloadAll(true);
        } catch (e) {
            await toast('Lỗi gán bài: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    async function doUnassign(postId) {
        if (state.busy) return;
        state.busy = true;
        try {
            await window.Web2Campaign.unassignPost(postId);
            await toast('Đã gỡ bài', 'success');
            await reloadAll(true);
        } catch (e) {
            await toast('Lỗi gỡ bài: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    async function doDelete(c) {
        const ok = await confirmDanger(
            `Xóa chiến dịch “${c.name}”? Gỡ mọi bài đã gán + comment/đơn liên quan sẽ mất liên kết chiến dịch cha (không xóa đơn).`
        );
        if (!ok) return;
        state.busy = true;
        try {
            await window.Web2Campaign.remove(c.id);
            await toast('Đã xóa chiến dịch', 'success');
            state.selectedId = null;
            state.mode = 'idle';
            await reloadAll(true);
        } catch (e) {
            await toast('Lỗi xóa: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    // Đồng bộ đơn NHÁP theo gán bài hiện tại (dùng khi gán lại/xóa bài sau khi đã có
    // đơn nháp). CHỈ đụng đơn draft; đơn đã PBH (lên kệ + KPI) giữ nguyên.
    async function doResync() {
        if (!isAdmin()) return toast('Chỉ admin được đồng bộ', 'error');
        if (state.busy) return;
        const ok = await confirmDanger(
            'Đồng bộ đơn NHÁP theo gán bài hiện tại — TOÀN HỆ THỐNG?\n\n' +
                '• Quét TẤT CẢ đơn nháp gán nhầm trên MỌI chiến dịch (không chỉ chiến dịch đang xem).\n' +
                '• Dời đơn nháp (chưa chốt PBH) sang chiến dịch cha đúng + cấp lại STT kệ.\n' +
                '• KHÔNG đụng đơn đã PBH (đã lên kệ vật lý + KPI đã tính).\n\n' +
                'Dùng khi bạn vừa gán lại / xóa bài mà đã lỡ có đơn nháp gán nhầm.'
        );
        if (!ok) return;
        state.busy = true;
        try {
            const base =
                (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
                (window.WEB2_CONFIG && window.WEB2_CONFIG.WORKER_URL) ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            const headers = { 'Content-Type': 'application/json' };
            const tok =
                window.Web2Auth && window.Web2Auth.getStored && window.Web2Auth.getStored()?.token;
            if (tok) headers['x-web2-token'] = tok;
            const r = await fetch(`${base}/api/native-orders/resync-campaigns`, {
                method: 'POST',
                headers,
                body: '{}',
            });
            const d = await r.json().catch(() => ({}));
            if (r.status === 401 || r.status === 403) throw new Error('Cần đăng nhập admin');
            if (!r.ok) throw new Error(d.error || 'Lỗi không xác định');
            await toast(`Đã đồng bộ ${d.moved || 0} đơn nháp theo gán bài`, 'success');
            await reloadAll(true);
        } catch (e) {
            await toast('Lỗi đồng bộ: ' + e.message, 'error');
        } finally {
            state.busy = false;
        }
    }

    // ---------- Events ----------
    function wireEvents() {
        // List column: click campaign
        $('cmList')?.addEventListener('click', (e) => {
            const card = e.target.closest('.cm-card');
            if (!card) return;
            state.selectedId = card.getAttribute('data-cid');
            state.mode = 'campaign';
            renderList();
            renderDetail();
        });
        $('cmList')?.addEventListener('keydown', (e) => {
            if (e.key !== 'Enter' && e.key !== ' ') return;
            const card = e.target.closest('.cm-card');
            if (!card) return;
            e.preventDefault();
            card.click();
        });

        // New campaign
        $('cmNewBtn')?.addEventListener('click', () => {
            if (!isAdmin()) return toast('Chỉ admin được tạo chiến dịch', 'error');
            state.mode = 'create';
            state.selectedId = null;
            state.picked.clear();
            renderList();
            renderDetail();
        });
        $('cmRefresh')?.addEventListener('click', () => reloadAll(false));
        $('cmResync')?.addEventListener('click', doResync);

        // Detail column: delegated (create + campaign controls)
        $('cmDetail')?.addEventListener('click', (e) => {
            const t = e.target;
            if (t.closest('#cmCancelCreate') || t.closest('#cmCancelCreate2')) {
                state.mode = state.selectedId != null ? 'campaign' : 'idle';
                renderDetail();
                return;
            }
            if (t.closest('#cmSaveCreate')) return void doCreate();
            if (t.closest('#cmReloadPosts') || t.closest('#cmReloadPosts2')) {
                state.postsLoaded = false;
                ensurePosts().then(() => renderDetail());
                return;
            }
            const assignBtn = t.closest('[data-assign]');
            if (assignBtn) return void doAssign(assignBtn.getAttribute('data-assign'));
            const unassignBtn = t.closest('[data-unassign]');
            if (unassignBtn) return void doUnassign(unassignBtn.getAttribute('data-unassign'));
            if (t.closest('#cmDelete')) {
                const c = state.campaigns.find((x) => String(x.id) === String(state.selectedId));
                if (c) doDelete(c);
                return;
            }
        });
        // Create picker checkbox toggle
        $('cmDetail')?.addEventListener('change', (e) => {
            const cb = e.target.closest('.cm-post-check');
            if (!cb) return;
            const postId = cb.getAttribute('data-postid');
            if (cb.checked) state.picked.add(postId);
            else state.picked.delete(postId);
            cb.closest('.cm-post')?.classList.toggle('is-picked', cb.checked);
            updatePickCount();
        });
    }

    // ---------- SSE realtime ----------
    function subscribeRealtime() {
        try {
            if (window.Web2Campaign && window.Web2Campaign.subscribe) {
                let t = null;
                window.Web2Campaign.subscribe(() => {
                    clearTimeout(t);
                    t = setTimeout(() => reloadAll(true), 500);
                });
            }
        } catch (_) {}
    }

    // ---------- Boot ----------
    async function boot() {
        try {
            if (window.Web2Sidebar && window.Web2Sidebar.mount)
                window.Web2Sidebar.mount('#web2Aside', { activeRoute: 'campaign-manager' });
        } catch (_) {}
        icon();
        wireEvents();
        subscribeRealtime();
        try {
            await loadCampaigns();
            renderList();
            renderDetail();
        } catch (e) {
            const el = $('cmDetail');
            if (el)
                el.innerHTML = `<div class="cm-hint is-error">Lỗi tải chiến dịch: ${esc(e.message)}</div>`;
        }
    }

    async function waitDeps(tries = 40) {
        for (let i = 0; i < tries; i++) {
            if (window.Web2Campaign && window.Web2Auth) return true;
            await new Promise((r) => setTimeout(r, 100));
        }
        return !!window.Web2Campaign;
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => waitDeps().then(boot));
    } else {
        waitDeps().then(boot);
    }
})();
