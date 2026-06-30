// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — Đăng bài FB: Lịch & Nháp (agenda theo ngày, sửa/đăng/xoá).
(function () {
    'use strict';

    const Api = () => window.FBPostsApi;
    const S = () => window.FBPosts.state;

    const STATUS_LABEL = {
        draft: 'Nháp',
        scheduled: 'Đã lên lịch',
        published: 'Đã đăng',
        failed: 'Lỗi',
    };

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
    function dayKey(ms) {
        if (!ms) return 'Không có lịch';
        return new Date(Number(ms)).toLocaleDateString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            weekday: 'long',
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
        });
    }
    function timeOf(ms) {
        if (!ms) return '';
        return new Date(Number(ms)).toLocaleTimeString('vi-VN', {
            timeZone: 'Asia/Ho_Chi_Minh',
            hour: '2-digit',
            minute: '2-digit',
        });
    }
    function pageNames(ids) {
        const map = new Map((S().pages || []).map((p) => [String(p.id), p.name]));
        return (ids || []).map((i) => map.get(String(i)) || i).join(', ');
    }

    function render() {
        const el = document.getElementById('panel-drafts');
        if (!el) return;
        el.innerHTML = `
            <div class="fbp-card">
                <h3><i data-lucide="calendar-clock"></i> Lịch nội dung &amp; Nháp</h3>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    <button class="fbp-btn ghost sm fbp-flt on" data-flt="all" type="button">Tất cả</button>
                    <button class="fbp-btn ghost sm fbp-flt" data-flt="scheduled" type="button">Đã lên lịch</button>
                    <button class="fbp-btn ghost sm fbp-flt" data-flt="draft" type="button">Nháp</button>
                    <button class="fbp-btn ghost sm fbp-flt" data-flt="published" type="button">Đã đăng</button>
                    <button class="fbp-btn ghost sm" id="fbpDraftReload" type="button" style="margin-left:auto"><i data-lucide="refresh-cw"></i> Tải lại</button>
                </div>
            </div>
            <div id="fbpDraftList"><div class="fbp-empty"><i data-lucide="loader"></i> Đang tải…</div></div>
        `;
        el.querySelectorAll('.fbp-flt').forEach((b) =>
            b.addEventListener('click', () => {
                el.querySelectorAll('.fbp-flt').forEach((x) => x.classList.toggle('on', x === b));
                load(b.dataset.flt);
            })
        );
        document.getElementById('fbpDraftReload').addEventListener('click', () => {
            const f = el.querySelector('.fbp-flt.on');
            load(f ? f.dataset.flt : 'all');
        });
        if (window.lucide?.createIcons) window.lucide.createIcons();
        load('all');
    }

    async function load(status) {
        const listEl = document.getElementById('fbpDraftList');
        if (!listEl) return;
        const isFirstLoad = !listEl.querySelector('.fbp-day');
        if (isFirstLoad && window.Web2Skeleton) {
            window.Web2Skeleton.list(listEl, { count: 6, avatar: true });
        } else {
            listEl.innerHTML =
                '<div class="fbp-empty"><i data-lucide="loader"></i> Đang tải…</div>';
        }
        try {
            const r = await Api().drafts(status || 'all');
            if (!r.success) {
                listEl.innerHTML = `<div class="fbp-empty">${esc(r.error || 'Lỗi tải')}</div>`;
                return;
            }
            const rows = r.drafts || [];
            if (!rows.length) {
                listEl.innerHTML =
                    '<div class="fbp-empty"><div class="empty-state-icon">🗓️</div>Chưa có bài nào.</div>';
                return;
            }
            // group by day (scheduled_at, else updated_at)
            const groups = new Map();
            rows.forEach((d) => {
                const k = dayKey(d.scheduled_at || d.updated_at);
                if (!groups.has(k)) groups.set(k, []);
                groups.get(k).push(d);
            });
            listEl.innerHTML = [...groups.entries()]
                .map(
                    ([day, items]) => `
                <div class="fbp-day">
                    <div class="fbp-day-head">${esc(day)}</div>
                    ${items.map((d) => rowHtml(d)).join('')}
                </div>`
                )
                .join('');
            listEl.querySelectorAll('[data-edit]').forEach((b) =>
                b.addEventListener('click', () => {
                    const d = rows.find((x) => String(x.id) === b.dataset.edit);
                    if (d) {
                        window.FBPostsComposer.loadDraft(d);
                        window.FBPosts.switchTab('composer');
                    }
                })
            );
            listEl
                .querySelectorAll('[data-del]')
                .forEach((b) => b.addEventListener('click', () => del(b.dataset.del, status)));
            listEl
                .querySelectorAll('[data-history]')
                .forEach((b) => b.addEventListener('click', () => openHistory(b.dataset.history)));
            if (window.lucide?.createIcons) window.lucide.createIcons();
        } catch (e) {
            listEl.innerHTML = `<div class="fbp-empty">${esc(e.message)}</div>`;
        }
    }

    function rowHtml(d) {
        const media = Array.isArray(d.media) ? d.media : [];
        const thumb = media.find((m) => m.type === 'photo');
        return `
        <div class="fbp-post">
            ${thumb ? `<img class="fbp-post-thumb" src="${esc(thumb.url)}" loading="lazy" alt="" />` : ''}
            <div class="fbp-post-body">
                <div style="margin-bottom:5px"><span class="fbp-status ${esc(d.status)}">${STATUS_LABEL[d.status] || d.status}</span>
                    ${d.scheduled_at ? `<b style="margin-left:8px;font-size:.82rem;color:#c87f0a">⏰ ${timeOf(d.scheduled_at)}</b>` : ''}</div>
                <p class="fbp-post-msg">${esc(d.message) || '<i>(không có nội dung)</i>'}</p>
                <div class="fbp-post-meta">
                    <span>📄 ${esc(pageNames(d.page_ids)) || '—'}</span>
                    ${media.length ? `<span>🖼️ ${media.length} media</span>` : ''}
                </div>
            </div>
            <div class="fbp-post-actions">
                <button class="fbp-btn ghost sm" data-edit="${esc(String(d.id))}" type="button"><i data-lucide="pencil"></i> Sửa</button>
                <button class="fbp-btn ghost sm" data-history="${esc(String(d.id))}" type="button" title="Lịch sử thao tác"><i data-lucide="history"></i> Lịch sử</button>
                <button class="fbp-btn danger sm" data-del="${esc(String(d.id))}" type="button"><i data-lucide="trash-2"></i> Xoá</button>
            </div>
        </div>`;
    }

    async function del(id, status) {
        const ok =
            window.Popup && window.Popup.confirm
                ? await window.Popup.confirm(
                      'Xoá bản ghi này khỏi lịch/nháp? (không xoá bài đã đăng trên FB)'
                  )
                : window.confirm('Xoá?');
        if (!ok) return;
        try {
            const r = await Api().deleteDraft(id);
            if (r.success) {
                notify('Đã xoá', 'success');
                load(status || 'all');
            } else notify(r.error || 'Lỗi xoá', 'error');
        } catch (e) {
            notify(e.message, 'error');
        }
    }

    // Lịch sử thao tác của 1 bản nháp/lịch FB (module shared Web2AuditLog auto-load qua sidebar).
    function openHistory(id) {
        window.Web2AuditLog?.openRecord?.({
            entity: 'fb-post',
            entityId: String(id),
            title: 'Lịch sử bài: ' + id,
        });
    }

    window.FBPostsDrafts = { render };
})();
