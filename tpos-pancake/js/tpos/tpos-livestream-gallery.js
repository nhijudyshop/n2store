// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Kho "Hình Livestream" — UI chụp iframe + sidebar gallery (tpos-pancake)
//
// 2 nút thêm vào header chip strip:
//   • 📷 "Chụp Live" — đặt TRƯỚC chip "Snap live". Chụp frame iframe FB live
//     đang nhúng (qua TposLivestreamSnap.captureCurrentFrame) → POST kho riêng
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
    if (global.TposLivestreamGallery) return;

    const API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://n2store-fallback.onrender.com';

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
        const d = new Date(n);
        const pad = (x) => String(x).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
    }
    function _snapApi() {
        return global.TposLivestreamSnap || null;
    }

    // -------------------- header buttons --------------------
    function _makeChip(id, html, title) {
        const el = document.createElement('div');
        el.id = id;
        el.className = 'tpos-lsimg-chip';
        el.innerHTML = html;
        if (title) el.title = title;
        return el;
    }

    function ensureButtons() {
        // Mount cạnh các chip snap (cùng host). Chờ #tpos-snap-page-chip xuất hiện.
        const anchor = document.getElementById('tpos-snap-page-chip');
        const host =
            anchor?.parentElement ||
            document.getElementById('tpos-snap-floating-host') ||
            document.querySelector('.tpos-header-bar');
        if (!host) return false;

        // Nút chụp — đặt TRƯỚC chip "Snap live" (anchor) nếu cùng host.
        if (!document.getElementById('tpos-lsimg-capture-chip')) {
            const cap = _makeChip(
                'tpos-lsimg-capture-chip',
                '📷 <strong>Chụp Live</strong>',
                'Chụp frame iframe FB live hiện tại, lưu vào kho "Hình Livestream" (riêng, không liên quan thumbnail).'
            );
            cap.classList.add('tpos-lsimg-chip--capture');
            cap.addEventListener('click', captureAndSave);
            if (anchor && anchor.parentElement === host) host.insertBefore(cap, anchor);
            else host.appendChild(cap);
        }

        // Nút mở sidebar — đặt cuối (bên phải).
        if (!document.getElementById('tpos-lsimg-toggle-chip')) {
            const tog = _makeChip(
                'tpos-lsimg-toggle-chip',
                '🖼 <strong>Kho Hình</strong>',
                'Mở/đóng kho Hình Livestream (filter theo campaign).'
            );
            tog.classList.add('tpos-lsimg-chip--toggle');
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

        const capChip = document.getElementById('tpos-lsimg-capture-chip');
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
        let aside = document.getElementById('tpos-lsimg-sidebar');
        if (aside) return aside;
        aside = document.createElement('aside');
        aside.id = 'tpos-lsimg-sidebar';
        aside.className = 'tpos-lsimg-sidebar';
        aside.innerHTML = `
            <div class="tpos-lsimg-head">
                <span class="tpos-lsimg-title">🖼 Hình Livestream</span>
                <select id="tpos-lsimg-filter" class="tpos-lsimg-filter" title="Lọc theo campaign"></select>
                <button id="tpos-lsimg-close" class="tpos-lsimg-close" title="Đóng">✕</button>
            </div>
            <div id="tpos-lsimg-body" class="tpos-lsimg-body"></div>`;
        document.body.appendChild(aside);
        aside.querySelector('#tpos-lsimg-close').addEventListener('click', closeSidebar);
        aside.querySelector('#tpos-lsimg-filter').addEventListener('change', (e) => {
            STATE.filterCampaignId = e.target.value;
            reload();
        });
        return aside;
    }

    function openSidebar() {
        const aside = ensureSidebar();
        STATE.sidebarOpen = true;
        aside.classList.add('is-open');
        const tog = document.getElementById('tpos-lsimg-toggle-chip');
        if (tog) tog.classList.add('is-active');
        // Init filter mặc định = campaign đang chọn nếu chưa set.
        if (STATE.filterCampaignId == null) {
            const ctx = _snapApi()?.getCurrentCampaignContext?.();
            STATE.filterCampaignId = ctx?.liveCampaignId || 'all';
        }
        reload();
    }

    function closeSidebar() {
        const aside = document.getElementById('tpos-lsimg-sidebar');
        if (aside) aside.classList.remove('is-open');
        STATE.sidebarOpen = false;
        const tog = document.getElementById('tpos-lsimg-toggle-chip');
        if (tog) tog.classList.remove('is-active');
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

    async function reload() {
        const aside = ensureSidebar();
        const body = aside.querySelector('#tpos-lsimg-body');
        const filter = aside.querySelector('#tpos-lsimg-filter');
        if (!body) return;
        await _loadCampaignsInto(filter);
        STATE.loading = true;
        body.innerHTML = `<div class="tpos-lsimg-empty">Đang tải…</div>`;
        try {
            const qs =
                STATE.filterCampaignId && STATE.filterCampaignId !== 'all'
                    ? `?liveCampaignId=${encodeURIComponent(STATE.filterCampaignId)}`
                    : '';
            const r = await fetch(API + '/api/livestream-images' + qs, { credentials: 'omit' });
            const d = await r.json();
            STATE.images = d.success ? d.images || [] : [];
        } catch (e) {
            STATE.images = [];
            body.innerHTML = `<div class="tpos-lsimg-empty">Lỗi tải: ${_esc(e.message)}</div>`;
            STATE.loading = false;
            return;
        }
        STATE.loading = false;
        _renderGrid(body);
    }

    function _renderGrid(body) {
        if (!STATE.images.length) {
            body.innerHTML = `<div class="tpos-lsimg-empty">Chưa có hình nào.<br>Bấm 📷 Chụp Live để lưu khoảnh khắc.</div>`;
            return;
        }
        body.innerHTML = `<div class="tpos-lsimg-grid">${STATE.images.map(_tileHtml).join('')}</div>`;
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
    }

    function _tileHtml(img) {
        const pending = img.extractStatus === 'pending' && !img.imageUrl;
        const failed = img.extractStatus === 'fail' && !img.imageUrl;
        let media;
        if (img.imageUrl) {
            media = `<img src="${_esc(img.imageUrl)}" loading="lazy" alt="frame">`;
        } else if (pending) {
            media = `<span class="tpos-lsimg-badge">⏱️ Chờ frame
                <button class="tpos-lsimg-extract" data-extract="${img.id}" title="Lấy frame từ VOD">⚡</button></span>`;
        } else if (failed) {
            media = `<span class="tpos-lsimg-badge tpos-lsimg-badge--fail">⚠ Lỗi lấy frame
                <button class="tpos-lsimg-extract" data-extract="${img.id}" title="Thử lại">⚡</button></span>`;
        } else {
            media = `<span class="tpos-lsimg-badge">📷</span>`;
        }
        return `
            <div class="tpos-lsimg-tile" data-open="${_esc(img.livestreamUrl || '')}">
                <div class="tpos-lsimg-thumb">${media}
                    <button class="tpos-lsimg-del" data-del="${img.id}" title="Xóa">🗑</button>
                </div>
                <div class="tpos-lsimg-meta">
                    <span class="tpos-lsimg-tm">${_fmtTime(img.capturedAt)}</span>
                    ${img.liveCampaignName ? `<span class="tpos-lsimg-camp">${_esc(img.liveCampaignName)}</span>` : ''}
                </div>
            </div>`;
    }

    function _prependTempTile(tempId, previewUrl, ctx, isPending) {
        const aside = ensureSidebar();
        const body = aside.querySelector('#tpos-lsimg-body');
        if (!body) return;
        let grid = body.querySelector('.tpos-lsimg-grid');
        if (!grid) {
            body.innerHTML = `<div class="tpos-lsimg-grid"></div>`;
            grid = body.querySelector('.tpos-lsimg-grid');
        }
        const media = previewUrl
            ? `<img src="${_esc(previewUrl)}" alt="đang lưu">`
            : `<span class="tpos-lsimg-badge">${isPending ? '⏱️ Đang lưu mốc…' : '📷'}</span>`;
        const tile = document.createElement('div');
        tile.className = 'tpos-lsimg-tile is-temp';
        tile.dataset.temp = tempId;
        tile.innerHTML = `
            <div class="tpos-lsimg-thumb">${media}<span class="tpos-lsimg-spin"></span></div>
            <div class="tpos-lsimg-meta">
                <span class="tpos-lsimg-tm">đang lưu…</span>
                ${ctx?.liveCampaignName ? `<span class="tpos-lsimg-camp">${_esc(ctx.liveCampaignName)}</span>` : ''}
            </div>`;
        grid.insertBefore(tile, grid.firstChild);
        const empty = body.querySelector('.tpos-lsimg-empty');
        if (empty) empty.remove();
    }

    function _removeTile(tempId) {
        const t = document.querySelector(`[data-temp="${CSS.escape(tempId)}"]`);
        if (t) t.remove();
    }

    async function _deleteImage(id) {
        if (!confirm('Xóa hình này khỏi kho?')) return;
        const tile = document
            .querySelector(`.tpos-lsimg-tile [data-del="${CSS.escape(String(id))}"]`)
            ?.closest('.tpos-lsimg-tile');
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

    global.TposLivestreamGallery = {
        captureAndSave,
        toggleSidebar,
        openSidebar,
        closeSidebar,
        reload,
        _state: STATE,
    };
})();
