// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Kho "Hình Livestream" — UI chụp iframe + sidebar gallery (live-chat)
//
// 2 nút thêm vào header chip strip:
//   • 📷 "Chụp Live" — đặt TRƯỚC chip "Snap live". Chụp frame iframe FB live
//     đang nhúng (qua LiveLivestreamSnap.captureCurrentFrame) → POST kho riêng
//     livestream_images. Fallback: nếu chưa lấy được frame → lưu metadata +
//     offset, backend extract sau (nút ⚡ trên tile).
//   • 🖼 "Kho Hình" — bật/tắt sidebar phải hiển thị gallery, filter theo
//     campaign (mặc định campaign đang chọn).
//
// UI-first: tile hiện ngay (preview local), POST chạy nền, lỗi thì gỡ + toast.
// SSE topic: web2:livestream-images — đồng bộ đa tab / đa máy.
// =====================================================
(function () {
    'use strict';
    const global = window;
    if (global.LiveLivestreamGallery) return;

    const API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://web2-api-kv04.onrender.com';

    const STATE = {
        sidebarOpen: false,
        filterCampaignId: null, // null = chưa init, 'all' = tất cả, '<id>' = 1 campaign
        images: [], // last loaded list (cho filter view hiện tại)
        loading: false,
        reloadTimer: null,
    };

    // -------------------- utils --------------------
    function _user() {
        const u = global.AuthManager?.getCurrentUser?.() || {};
        return { id: u.uid || u.email || null, name: u.displayName || u.email || null };
    }
    function _toast(msg, type = 'ok') {
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type === 'err' ? 'error' : 'success');
        } else {
            console.log('[gallery-toast]', type, msg);
        }
    }
    function _esc(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
        );
    }
    function _fmtTime(ms) {
        const n = Number(ms);
        if (!Number.isFinite(n)) return '';
        // Hiển thị GMT+7 cố định (quy ước Web 2.0), không phụ thuộc TZ máy.
        const parts = new Intl.DateTimeFormat('en-GB', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            day: '2-digit',
            month: '2-digit',
            hour12: false,
            timeZone: 'Asia/Ho_Chi_Minh',
        }).formatToParts(new Date(n));
        const g = (t) => parts.find((p) => p.type === t)?.value || '00';
        return `${g('hour')}:${g('minute')}:${g('second')} ${g('day')}/${g('month')}`;
    }
    function _snapApi() {
        return global.LiveLivestreamSnap || null;
    }

    // -------------------- header buttons --------------------
    function _makeChip(id, html, title) {
        const el = document.createElement('div');
        el.id = id;
        el.className = 'live-lsimg-chip';
        el.innerHTML = html;
        if (title) el.title = title;
        return el;
    }

    function ensureButtons() {
        // Mount cạnh các chip snap (cùng host). Chờ #live-snap-page-chip xuất hiện.
        const anchor = document.getElementById('live-snap-page-chip');
        const host =
            anchor?.parentElement ||
            document.getElementById('live-snap-floating-host') ||
            document.querySelector('.live-header-bar');
        if (!host) return false;

        // Nút chụp — đặt TRƯỚC chip "Snap live" (anchor) nếu cùng host.
        if (!document.getElementById('live-lsimg-capture-chip')) {
            const cap = _makeChip(
                'live-lsimg-capture-chip',
                '📷 <strong>Chụp Live</strong>',
                'Chụp frame iframe FB live hiện tại, lưu vào kho "Hình Livestream" (riêng, không liên quan thumbnail).'
            );
            cap.classList.add('live-lsimg-chip--capture');
            cap.addEventListener('click', captureAndSave);
            if (anchor && anchor.parentElement === host) host.insertBefore(cap, anchor);
            else host.appendChild(cap);
        }

        // Nút mở sidebar — đặt cuối (bên phải).
        if (!document.getElementById('live-lsimg-toggle-chip')) {
            const tog = _makeChip(
                'live-lsimg-toggle-chip',
                '🖼 <strong>Kho Hình</strong>',
                'Mở/đóng kho Hình Livestream (filter theo campaign).'
            );
            tog.classList.add('live-lsimg-chip--toggle');
            tog.addEventListener('click', toggleSidebar);
            host.appendChild(tog);
        }
        return true;
    }

    // -------------------- capture --------------------
    async function captureAndSave() {
        const api = _snapApi();
        if (!api?.captureCurrentFrame) {
            _toast('Module snap chưa sẵn sàng', 'err');
            return;
        }
        const ctx = api.getCurrentCampaignContext?.() || {};
        if (!ctx.liveVideoId) {
            _toast('Chưa nhận diện được live đang chạy', 'err');
            return;
        }
        // Mở sidebar + đặt filter về campaign đang chụp để user thấy ảnh mới.
        STATE.filterCampaignId = ctx.liveCampaignId || 'all';
        openSidebar();

        const capChip = document.getElementById('live-lsimg-capture-chip');
        if (capChip) capChip.classList.add('is-busy');

        let frame = null;
        try {
            frame = await api.captureCurrentFrame();
        } catch (e) {
            console.warn('[gallery] capture frame fail:', e.message);
        }
        let offsetSeconds;
        if (!frame?.jpegBase64) {
            // Fallback: chưa lấy được frame → lưu metadata + offset, extract sau.
            offsetSeconds = (await api.getCurrentOffsetSeconds?.(ctx)) ?? undefined;
        }

        const tempId = 'temp_' + Date.now();
        const previewUrl = frame?.jpegBase64 ? 'data:image/jpeg;base64,' + frame.jpegBase64 : null;
        _prependTempTile(tempId, previewUrl, ctx, !frame?.jpegBase64);

        const body = {
            pageId: ctx.pageId,
            pageName: ctx.pageName,
            liveCampaignId: ctx.liveCampaignId,
            liveCampaignName: ctx.liveCampaignName,
            liveVideoId: ctx.liveVideoId,
            capturedAt: frame?.capturedAt || Date.now(),
            offsetSeconds,
            imageBase64: frame?.jpegBase64 || undefined,
            imageMime: 'image/jpeg',
            user: _user(),
        };

        const doPost = async () => {
            const r = await fetch(API + '/api/livestream-images', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify(body),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'save failed');
            return d.image;
        };

        const finish = () => {
            if (capChip) capChip.classList.remove('is-busy');
        };

        // UI-first qua Web2Optimistic nếu có; fallback manual.
        if (global.Web2Optimistic?.run) {
            global.Web2Optimistic.run({
                apply: () => {}, // tile đã prepend ở trên
                run: doPost,
                onSuccess: () => {
                    reload();
                    finish();
                },
                rollback: () => {
                    _removeTile(tempId);
                    finish();
                },
                successMsg: frame?.jpegBase64
                    ? '📷 Đã lưu vào kho Hình Livestream'
                    : '⏱️ Đã lưu mốc thời gian — bấm ⚡ để lấy frame',
                errLabel: 'Lưu hình livestream',
            });
        } else {
            doPost()
                .then(() => {
                    reload();
                    finish();
                })
                .catch((e) => {
                    _removeTile(tempId);
                    _toast('Lỗi lưu hình: ' + e.message, 'err');
                    finish();
                });
        }
    }

    // -------------------- sidebar --------------------
    function ensureSidebar() {
        let aside = document.getElementById('live-lsimg-sidebar');
        if (aside) return aside;
        aside = document.createElement('aside');
        aside.id = 'live-lsimg-sidebar';
        aside.className = 'live-lsimg-sidebar';
        aside.innerHTML = `
            <div class="live-lsimg-head">
                <span class="live-lsimg-title">🖼 Hình Livestream</span>
                <select id="live-lsimg-filter" class="live-lsimg-filter" title="Lọc theo campaign"></select>
                <button id="live-lsimg-close" class="live-lsimg-close" title="Đóng">✕</button>
            </div>
            <div id="live-lsimg-body" class="live-lsimg-body"></div>`;
        document.body.appendChild(aside);
        aside.querySelector('#live-lsimg-close').addEventListener('click', closeSidebar);
        aside.querySelector('#live-lsimg-filter').addEventListener('change', (e) => {
            STATE.filterCampaignId = e.target.value;
            reload();
        });
        return aside;
    }

    function openSidebar() {
        const aside = ensureSidebar();
        STATE.sidebarOpen = true;
        aside.classList.add('is-open');
        const tog = document.getElementById('live-lsimg-toggle-chip');
        if (tog) tog.classList.add('is-active');
        // Init filter mặc định = campaign đang chọn nếu chưa set.
        if (STATE.filterCampaignId == null) {
            const ctx = _snapApi()?.getCurrentCampaignContext?.();
            STATE.filterCampaignId = ctx?.liveCampaignId || 'all';
        }
        reload();
    }

    function closeSidebar() {
        const aside = document.getElementById('live-lsimg-sidebar');
        if (aside) aside.classList.remove('is-open');
        STATE.sidebarOpen = false;
        const tog = document.getElementById('live-lsimg-toggle-chip');
        if (tog) tog.classList.remove('is-active');
        _hidePreview();
    }

    function toggleSidebar() {
        if (STATE.sidebarOpen) closeSidebar();
        else openSidebar();
    }

    // -------------------- data load + render --------------------
    async function _loadCampaignsInto(selectEl) {
        let campaigns = [];
        try {
            const r = await fetch(API + '/api/livestream-images/campaigns', {
                credentials: 'omit',
            });
            const d = await r.json();
            if (d.success) campaigns = d.campaigns || [];
        } catch {
            /* ignore */
        }
        // Ensure campaign đang chọn luôn có trong list (kể cả khi 0 ảnh).
        const ctx = _snapApi()?.getCurrentCampaignContext?.();
        if (
            ctx?.liveCampaignId &&
            !campaigns.some((c) => c.liveCampaignId === ctx.liveCampaignId)
        ) {
            campaigns.unshift({
                liveCampaignId: ctx.liveCampaignId,
                liveCampaignName: ctx.liveCampaignName || 'Campaign hiện tại',
                count: 0,
            });
        }
        const opts = [`<option value="all">Tất cả campaign</option>`];
        for (const c of campaigns) {
            const label = `${_esc(c.liveCampaignName || c.liveCampaignId || '(không tên)')}${c.count ? ` (${c.count})` : ''}`;
            opts.push(`<option value="${_esc(c.liveCampaignId || '')}">${label}</option>`);
        }
        selectEl.innerHTML = opts.join('');
        selectEl.value = STATE.filterCampaignId || 'all';
    }

    // Generation counter chống race khi reload gọi chồng (SSE burst + đổi filter):
    // chỉ lần reload mới nhất được ghi DOM. Đang loading → queue 1 lần trailing.
    let _gen = 0;

    async function reload() {
        if (STATE.loading) {
            STATE._reloadQueued = true;
            return;
        }
        const aside = ensureSidebar();
        const body = aside.querySelector('#live-lsimg-body');
        const filter = aside.querySelector('#live-lsimg-filter');
        if (!body) return;
        const g = ++_gen;
        STATE.loading = true;
        try {
            await _loadCampaignsInto(filter);
            if (g !== _gen) return;
            body.innerHTML = `<div class="live-lsimg-empty">Đang tải…</div>`;
            const qs =
                STATE.filterCampaignId && STATE.filterCampaignId !== 'all'
                    ? `?liveCampaignId=${encodeURIComponent(STATE.filterCampaignId)}`
                    : '';
            const r = await fetch(API + '/api/livestream-images' + qs, { credentials: 'omit' });
            const d = await r.json();
            if (g !== _gen) return;
            STATE.images = d.success ? d.images || [] : [];
            _renderGrid(body);
        } catch (e) {
            if (g === _gen) {
                STATE.images = [];
                body.innerHTML = `<div class="live-lsimg-empty">Lỗi tải: ${_esc(e.message)}</div>`;
            }
        } finally {
            STATE.loading = false;
            // Trailing coalesce: có reload bị queue khi đang loading → chạy 1 lần nữa.
            if (STATE._reloadQueued) {
                STATE._reloadQueued = false;
                reload();
            }
        }
    }

    function _renderGrid(body) {
        if (!STATE.images.length) {
            body.innerHTML = `<div class="live-lsimg-empty">Chưa có hình nào.<br>Bấm 📷 Chụp Live để lưu khoảnh khắc.</div>`;
            return;
        }
        body.innerHTML = `<div class="live-lsimg-grid">${STATE.images.map(_tileHtml).join('')}</div>`;
        body.querySelectorAll('[data-del]').forEach((b) =>
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                _deleteImage(b.dataset.del);
            })
        );
        body.querySelectorAll('[data-extract]').forEach((b) =>
            b.addEventListener('click', (e) => {
                e.stopPropagation();
                _extractImage(b.dataset.extract, b);
            })
        );
        body.querySelectorAll('[data-open]').forEach((a) =>
            a.addEventListener('click', (e) => {
                if (e.target.closest('[data-del],[data-extract]')) return;
                const url = a.dataset.open;
                if (url) global.open(url, '_blank', 'noopener');
            })
        );
        // Hover ảnh → phóng to (popup nổi bên trái drawer, tránh bị contain/overflow cắt).
        // Delegated + bind 1 lần trên body (innerHTML rebuild mỗi _renderGrid →
        // listener per-image/scroll attach lại sẽ leak/chồng).
        if (!body.dataset.lsimgBound) {
            body.dataset.lsimgBound = '1';
            body.addEventListener('mouseover', (e) => {
                const im = e.target.closest('.live-lsimg-thumb img');
                if (im) _showPreview(im);
            });
            body.addEventListener('mouseout', (e) => {
                const im = e.target.closest('.live-lsimg-thumb img');
                if (im && e.relatedTarget !== im) _hidePreview();
            });
            body.addEventListener('scroll', _hidePreview, { passive: true });
        }
    }

    // -------------------- hover preview (zoom) --------------------
    function _ensurePreview() {
        let el = document.getElementById('live-lsimg-preview');
        if (!el) {
            el = document.createElement('div');
            el.id = 'live-lsimg-preview';
            el.className = 'live-lsimg-preview';
            el.innerHTML = '<img alt="phóng to">';
            document.body.appendChild(el);
        }
        return el;
    }

    function _showPreview(imgEl) {
        const src = imgEl?.currentSrc || imgEl?.src;
        if (!src) return;
        const el = _ensurePreview();
        const pic = el.querySelector('img');
        if (pic.src !== src) pic.src = src;

        const PAD = 12;
        const drawerW = 380; // đồng bộ với .live-lsimg-sidebar width
        const maxW = Math.min(460, global.innerWidth - drawerW - PAD * 2);
        if (maxW < 160) return; // màn quá hẹp → bỏ qua zoom
        el.style.width = maxW + 'px';

        // canh giữa theo chiều dọc của tile, clamp trong viewport
        const r = imgEl.getBoundingClientRect();
        const estH = maxW * (9 / 16) + 8;
        let top = r.top + r.height / 2 - estH / 2;
        top = Math.max(PAD, Math.min(top, global.innerHeight - estH - PAD));
        el.style.top = top + 'px';
        el.style.right = drawerW + PAD + 'px';
        el.classList.add('is-show');
    }

    function _hidePreview() {
        const el = document.getElementById('live-lsimg-preview');
        if (el) el.classList.remove('is-show');
    }

    function _tileHtml(img) {
        const pending = img.extractStatus === 'pending' && !img.imageUrl;
        const failed = img.extractStatus === 'fail' && !img.imageUrl;
        let media;
        if (img.imageUrl) {
            media = `<img src="${_esc(img.imageUrl)}" loading="lazy" alt="frame">`;
        } else if (pending) {
            media = `<span class="live-lsimg-badge">⏱️ Chờ frame
                <button class="live-lsimg-extract" data-extract="${img.id}" title="Lấy frame từ VOD">⚡</button></span>`;
        } else if (failed) {
            media = `<span class="live-lsimg-badge live-lsimg-badge--fail">⚠ Lỗi lấy frame
                <button class="live-lsimg-extract" data-extract="${img.id}" title="Thử lại">⚡</button></span>`;
        } else {
            media = `<span class="live-lsimg-badge">📷</span>`;
        }
        return `
            <div class="live-lsimg-tile" data-open="${_esc(img.livestreamUrl || '')}">
                <div class="live-lsimg-thumb">${media}
                    <button class="live-lsimg-del" data-del="${img.id}" title="Xóa">🗑</button>
                </div>
                <div class="live-lsimg-meta">
                    <span class="live-lsimg-tm">${_fmtTime(img.capturedAt)}</span>
                    ${img.liveCampaignName ? `<span class="live-lsimg-camp">${_esc(img.liveCampaignName)}</span>` : ''}
                </div>
            </div>`;
    }

    function _prependTempTile(tempId, previewUrl, ctx, isPending) {
        const aside = ensureSidebar();
        const body = aside.querySelector('#live-lsimg-body');
        if (!body) return;
        let grid = body.querySelector('.live-lsimg-grid');
        if (!grid) {
            body.innerHTML = `<div class="live-lsimg-grid"></div>`;
            grid = body.querySelector('.live-lsimg-grid');
        }
        const media = previewUrl
            ? `<img src="${_esc(previewUrl)}" alt="đang lưu">`
            : `<span class="live-lsimg-badge">${isPending ? '⏱️ Đang lưu mốc…' : '📷'}</span>`;
        const tile = document.createElement('div');
        tile.className = 'live-lsimg-tile is-temp';
        tile.dataset.temp = tempId;
        tile.innerHTML = `
            <div class="live-lsimg-thumb">${media}<span class="live-lsimg-spin"></span></div>
            <div class="live-lsimg-meta">
                <span class="live-lsimg-tm">đang lưu…</span>
                ${ctx?.liveCampaignName ? `<span class="live-lsimg-camp">${_esc(ctx.liveCampaignName)}</span>` : ''}
            </div>`;
        grid.insertBefore(tile, grid.firstChild);
        const empty = body.querySelector('.live-lsimg-empty');
        if (empty) empty.remove();
    }

    function _removeTile(tempId) {
        const t = document.querySelector(`[data-temp="${CSS.escape(tempId)}"]`);
        if (t) t.remove();
    }

    async function _deleteImage(id) {
        if (!(await Popup.danger('Xóa hình này khỏi kho?', { okText: 'Xóa' }))) return;
        const tile = document
            .querySelector(`.live-lsimg-tile [data-del="${CSS.escape(String(id))}"]`)
            ?.closest('.live-lsimg-tile');
        const run = async () => {
            const r = await fetch(API + '/api/livestream-images/' + encodeURIComponent(id), {
                method: 'DELETE',
                credentials: 'omit',
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'delete failed');
        };
        if (global.Web2Optimistic?.run) {
            const parent = tile?.parentElement;
            const next = tile?.nextSibling;
            global.Web2Optimistic.run({
                apply: () => tile?.remove(),
                run,
                onSuccess: () => {},
                rollback: () => {
                    if (parent && tile) parent.insertBefore(tile, next);
                },
                successMsg: 'Đã xóa hình',
                errLabel: 'Xóa hình livestream',
            });
        } else {
            try {
                await run();
                tile?.remove();
            } catch (e) {
                _toast('Lỗi xóa: ' + e.message, 'err');
            }
        }
    }

    async function _extractImage(id, btn) {
        if (btn) {
            btn.disabled = true;
            btn.textContent = '…';
        }
        try {
            const r = await fetch(
                API + '/api/livestream-images/' + encodeURIComponent(id) + '/extract',
                {
                    method: 'POST',
                    credentials: 'omit',
                    headers: { 'Content-Type': 'application/json' },
                    body: '{}',
                }
            );
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'extract failed');
            _toast('✅ Đã lấy frame từ VOD', 'ok');
            reload();
        } catch (e) {
            _toast('Lỗi lấy frame: ' + e.message, 'err');
            if (btn) {
                btn.disabled = false;
                btn.textContent = '⚡';
            }
        }
    }

    // -------------------- SSE realtime --------------------
    function _setupSSE() {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:livestream-images', () => {
            if (!STATE.sidebarOpen) return;
            clearTimeout(STATE.reloadTimer);
            STATE.reloadTimer = setTimeout(reload, 500);
        });
    }

    // -------------------- init --------------------
    function init() {
        let attempts = 0;
        const timer = setInterval(() => {
            attempts++;
            if (ensureButtons() || attempts >= 30) clearInterval(timer);
        }, 500);
        _setupSSE();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.LiveLivestreamGallery = {
        captureAndSave,
        toggleSidebar,
        openSidebar,
        closeSidebar,
        reload,
    };
})();
