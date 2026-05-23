// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Livestream Snapshot UI cho tpos-pancake
//
// Flow:
//   1. User chọn "Snap page" từ chip header (Store / House, default Store, lưu localStorage)
//   2. Click 📸 button trên comment row → POST /api/livestream/snapshot
//      Tự resolve liveCampaignId + liveVideoId từ TposState theo Snap page
//   3. Sau snap, badge counter trên row update + toast confirm
//   4. Click badge → popover list snapshots → mỗi entry có thumbnail + thời gian + "Xem live" deep-link
//
// SSE topic: web2:livestream-snapshots — multi-tab sync.
// =====================================================

(function () {
    'use strict';
    const global = window;
    if (global.TposLivestreamSnap) return;

    const API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://n2store-fallback.onrender.com';
    const LS_KEY_SNAP_PAGE = 'tpos_snap_live_page'; // 'store' | 'house'
    const LS_KEY_SNAP_MODE = 'tpos_snap_mode'; // 'live' (default) | 'lazy'
    const LS_KEY_AUTO_MODE = 'tpos_snap_auto'; // 'on' | 'off' (default 'on')
    const LS_KEY_INLINE_THUMB = 'tpos_snap_inline_thumb'; // 'on' | 'off' (default 'off')
    const AUTO_THROTTLE_MS = 30 * 1000; // 30s per customer — tránh spam khi 1 KH spam comment
    // Mode definitions:
    //   'live' = 🎬 Chụp Live — getDisplayMedia capture frame từ tab FB live đã share
    //            (cần user mở FB live tab + chọn tab trong picker 1 lần đầu phiên).
    //            Ảnh exact moment, 1280x720, lưu bytea Postgres.
    //   'lazy' = ⏱️ Lưu Time — chỉ lưu metadata (time, video_id, offset). Browser
    //            lazy-fetch FB Graph picture URL khi mở popover. Không cần FB tab.
    //            Ảnh lag 5-30s do FB CDN refresh.
    const MODE_LIVE = 'live';
    const MODE_LAZY = 'lazy';
    // FB vanity URL mapping cho deep-link đẹp. Known từ user feedback.
    // Fallback pageId numeric → FB tự redirect, vẫn work nhưng URL xấu.
    const PAGE_VANITY = {
        117267091364524: 'NhiJudyHouse.VietNam', // Nhi Judy House
        270136663390370: 'NhiJudyStore', // NhiJudy Store
    };
    // Cache broadcast_start_time per liveVideoId (memory). Broadcast start
    // không đổi suốt phiên live → fetch 1 lần đầu, reuse cho mọi snap sau.
    // Key: liveVideoId raw (compound hoặc stripped).
    const _liveVideoInfoCache = new Map();

    // Fetch live video metadata từ TPOS proxy → return channelCreatedTime ms.
    // Endpoint: GET /facebook/livevideo?pageid=X&limit=50 (TPOS auth required).
    // Cache 5 phút per pageId. Match video bằng objectId.
    // Returns: { broadcastStartMs, title, statusLive } | null
    async function _fetchLiveVideoInfo(pageId, liveVideoId) {
        if (!pageId || !liveVideoId) return null;
        const cacheKey = `${pageId}:${liveVideoId}`;
        const cached = _liveVideoInfoCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached.info;
        try {
            const st = global.TposState;
            const proxyBase = st?.proxyBaseUrl;
            if (!proxyBase || !global.TposApi?.authenticatedFetch) return null;
            const r = await global.TposApi.authenticatedFetch(
                `${proxyBase}/facebook/livevideo?pageid=${encodeURIComponent(pageId)}&limit=50`
            );
            if (!r.ok) return null;
            const json = await r.json();
            const videos = json?.data?.data || [];
            // TPOS objectId có thể là videoId raw HOẶC compound — match cả 2 dạng.
            const videoId = String(liveVideoId).replace(/^\d+_/, '');
            const match = videos.find((v) => v.objectId === liveVideoId || v.objectId === videoId);
            if (!match) {
                console.warn('[snap] video not found in TPOS livevideo list:', liveVideoId);
                return null;
            }
            // channelCreatedTime có thể là ISO string ('2026-05-23T12:01:51+07:00')
            // hoặc number ms. Dùng new Date().getTime() handle cả 2.
            const startMs = match.channelCreatedTime
                ? new Date(match.channelCreatedTime).getTime()
                : null;
            // TPOS exposes video.thumbnail.url (FB CDN signed URL, public) —
            // dùng làm thumbnail vì FB Graph picture endpoint giờ trả 400 cho
            // mọi video (FB policy change 2026-05).
            const thumbnailUrl =
                match.thumbnail?.url || match.thumbnail?.uri || match.thumbnailUrl || null;
            const info = {
                broadcastStartMs: Number.isFinite(startMs) ? startMs : null,
                title: match.title || null,
                statusLive: match.statusLive,
                thumbnailUrl,
            };
            _liveVideoInfoCache.set(cacheKey, { info, fetchedAt: Date.now() });
            console.log('[snap] live video info:', info);
            return info;
        } catch (e) {
            console.warn('[snap] fetch live video info fail:', e.message);
            return null;
        }
    }

    // Vanity URL slug check — phải URL-safe (ASCII, no spaces, dots OK).
    // TPOS Facebook_UserName là DISPLAY NAME (vd "Yến Nhi") → KHÔNG dùng được
    // làm vanity. Chỉ chấp nhận giá trị match regex slug.
    function _isVanitySlug(v) {
        return typeof v === 'string' && /^[A-Za-z0-9._-]+$/.test(v) && v.length >= 3;
    }
    function _resolvePageVanity(pageObj) {
        if (!pageObj) return null;
        // Ưu tiên PAGE_VANITY mapping (known good) → các field potential khác phải
        // pass _isVanitySlug check trước khi dùng.
        const mapping = PAGE_VANITY[pageObj.Facebook_PageId];
        if (mapping) return mapping;
        for (const f of ['Username', 'Vanity', 'Facebook_UserName']) {
            const v = pageObj[f];
            if (_isVanitySlug(v)) return v;
        }
        return null;
    }
    const STATE = {
        counts: {}, // customerFbUserId → count
        cacheList: new Map(), // customerFbUserId → snapshots[]
        snapByComment: new Map(), // commentId → { thumbnailUrl, livestreamUrl, offsetSeconds, id }
        snapByCommentPending: new Set(), // commentIds chờ fetch (debounce gom batch)
        snapByCommentTimer: null,
        popoverOpen: null, // customerFbUserId
        // Phase 3 — persistent screen capture stream
        captureStream: null, // MediaStream
        captureVideo: null, // <video> element (hidden, dùng draw frame)
        captureCanvas: null, // <canvas> element (cached)
        // Auto-mode — throttle per customer
        autoLastSnap: new Map(), // customerFbUserId → lastTs (ms)
        autoStats: { total: 0, throttled: 0, errors: 0 }, // session counter
    };

    function _getSnapPagePref() {
        return localStorage.getItem(LS_KEY_SNAP_PAGE) || 'store';
    }
    function _setSnapPagePref(v) {
        localStorage.setItem(LS_KEY_SNAP_PAGE, v);
        renderHeaderChip();
    }
    function _getSnapMode() {
        return localStorage.getItem(LS_KEY_SNAP_MODE) || MODE_LIVE;
    }
    function _setSnapMode(v) {
        localStorage.setItem(LS_KEY_SNAP_MODE, v);
        renderRealSnapChip();
        renderAutoModeChip();
    }
    function _isAutoMode() {
        // Default ON: nếu chưa từng set, coi như 'on' để user vào livestream
        // là tự nhận diện + chụp ngay. User có thể tắt qua chip.
        const v = localStorage.getItem(LS_KEY_AUTO_MODE);
        return v === null ? true : v === 'on';
    }
    function _setAutoMode(on) {
        localStorage.setItem(LS_KEY_AUTO_MODE, on ? 'on' : 'off');
        renderAutoModeChip();
    }
    // Toggle hiển thị inline thumbnail strip dưới mỗi comment. Default OFF.
    function _isInlineThumbOn() {
        return localStorage.getItem(LS_KEY_INLINE_THUMB) === 'on';
    }
    function _setInlineThumb(on) {
        localStorage.setItem(LS_KEY_INLINE_THUMB, on ? 'on' : 'off');
        renderInlineThumbChip();
        if (on) {
            // Bật → queue tất cả visible commentIds để fetch + render strip.
            document.querySelectorAll('.tpos-conversation-item[data-comment-id]').forEach((row) => {
                const cid = row.dataset.commentId;
                if (!cid) return;
                if (STATE.snapByComment.has(cid)) _renderThumbStripFor(cid);
                else _queueSnapByComment(cid);
            });
        } else {
            // Tắt → xóa toàn bộ strip hiện có.
            document.querySelectorAll('.tpos-snap-thumb-strip').forEach((s) => s.remove());
        }
    }

    // Resolve page object từ allPages dựa trên snap page preference.
    function _resolvePageObj() {
        const st = global.TposState;
        if (!st?.allPages) return null;
        const pref = _getSnapPagePref();
        return (
            st.allPages.find((p) => {
                const n = (p.Name || '').toLowerCase();
                if (pref === 'house') return n.includes('house');
                return n.includes('store');
            }) || st.selectedPage
        );
    }

    // Resolve active live campaign cho page đã chọn — strict mode (1 page).
    function _resolveActiveCampaign(pageObj) {
        const st = global.TposState;
        if (!st?.liveCampaigns?.length || !pageObj) return null;
        const sel = st.selectedCampaign;
        if (sel && sel._pageObj?.Facebook_PageId === pageObj.Facebook_PageId) return sel;
        // Tìm campaign matching page, sắp xếp DateCreated desc (mới nhất trước)
        const matching = st.liveCampaigns
            .filter((c) => c.Facebook_UserId === pageObj.Facebook_PageId)
            .sort((a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0));
        return matching[0] || st.liveCampaigns[0] || null;
    }

    // Resolve TOP-2 latest campaigns across ALL pages (user req 2026-05-23).
    // Cho auto-snap: nếu comment đến từ comment.from.id thuộc page A,
    // match campaign của page A trong top 2. Fallback campaign top 1.
    function _resolveTopCampaigns(limit = 2) {
        const st = global.TposState;
        if (!st?.liveCampaigns?.length) return [];
        return st.liveCampaigns
            .slice()
            .sort((a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0))
            .slice(0, limit);
    }

    // Resolve campaign cho 1 comment cụ thể (auto-snap path):
    // 1. Nếu comment._campaignId set → dùng (đã match từ tpos-init)
    // 2. Else match qua comment._pageId với top-2 campaigns
    // 3. Fallback campaign mới nhất
    function _resolveCampaignForComment(comment) {
        const st = global.TposState;
        if (!st?.liveCampaigns?.length) return null;
        // Path 1: comment đã có _campaignId
        if (comment._campaignId) {
            const found = st.liveCampaigns.find((c) => c.Id === comment._campaignId);
            if (found) return found;
        }
        // Path 2: match qua pageId
        const top = _resolveTopCampaigns(2);
        const commentPageId = comment._pageId || comment.from?.id;
        if (commentPageId) {
            const match = top.find((c) => c.Facebook_UserId === commentPageId);
            if (match) return match;
        }
        // Path 3: campaign mới nhất
        return top[0] || null;
    }

    function _user() {
        const u = global.AuthManager?.getCurrentUser?.() || {};
        return { id: u.uid || u.email || null, name: u.displayName || u.email || null };
    }

    function _toast(msg, type = 'ok') {
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type === 'err' ? 'error' : 'success');
        } else {
            console.log('[snap-toast]', type, msg);
        }
    }

    // Format offset seconds → human-readable: "+1h23m45s" / "+5m12s" / "+45s".
    function _fmtOffset(sec) {
        const n = Number(sec);
        if (!Number.isFinite(n) || n <= 0) return '';
        const h = Math.floor(n / 3600);
        const m = Math.floor((n % 3600) / 60);
        const s = n % 60;
        if (h) return `+${h}h${String(m).padStart(2, '0')}m${String(s).padStart(2, '0')}s`;
        if (m) return `+${m}m${String(s).padStart(2, '0')}s`;
        return `+${s}s`;
    }

    function _esc(s) {
        return String(s || '').replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    }

    // -----------------------------------------------------
    // Header chip — Snap page selector
    // -----------------------------------------------------
    // Find/create a floating host container ở góc trên tpos-pancake page khi
    // không có header thật để mount chip. Cách này đảm bảo chip luôn hiển thị.
    function _ensureFloatingHost() {
        let host = document.getElementById('tpos-snap-floating-host');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'tpos-snap-floating-host';
        host.style.cssText =
            'position:fixed;top:8px;right:8px;z-index:1000;display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.95);padding:4px 6px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);';
        document.body.appendChild(host);
        return host;
    }
    function ensureHeaderChip() {
        let chip = document.getElementById('tpos-snap-page-chip');
        if (chip) return chip;
        // Try mount in TPOS header area; fallback floating host (always visible).
        const host =
            document.querySelector('.tpos-header-bar') ||
            document.querySelector('.tpos-toolbar') ||
            document.querySelector('#tposCommentHeader') ||
            _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-page-chip';
        chip.className = 'tpos-snap-page-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#fef3c7;border:1px solid #fcd34d;border-radius:14px;font-size:12px;font-weight:600;color:#92400e;cursor:pointer;margin-left:8px;user-select:none;';
        chip.addEventListener('click', () => {
            const next = _getSnapPagePref() === 'store' ? 'house' : 'store';
            _setSnapPagePref(next);
            _toast(`📡 Snap live: ${next === 'house' ? 'Nhi Judy House' : 'NhiJudy Store'}`, 'ok');
        });
        host.appendChild(chip);
        renderHeaderChip();
        return chip;
    }
    function renderHeaderChip() {
        const chip = document.getElementById('tpos-snap-page-chip');
        if (!chip) return;
        const pref = _getSnapPagePref();
        const label = pref === 'house' ? 'House' : 'Store';
        chip.innerHTML = `📡 Snap live: <strong>${label}</strong> <span style="opacity:0.6;font-size:10px;">▼</span>`;
        chip.title = `Click để đổi (current: ${pref}). Snap button sẽ chụp từ live của page này.`;
    }

    // -----------------------------------------------------
    // Phase 3 — Real screenshot via getDisplayMedia (persistent stream)
    //
    // User click "🔴 Bật snap thật" 1 lần đầu phiên → browser hiện picker → user
    // chọn tab FB live. Stream lưu vào STATE.captureStream. Mỗi click 📸 sau đó
    // = drawImage(video) → JPEG base64 → POST silent.
    // -----------------------------------------------------
    function ensureRealSnapChip() {
        let chip = document.getElementById('tpos-snap-real-chip');
        if (chip) return chip;
        const host =
            document.querySelector('.tpos-header-bar') ||
            document.querySelector('.tpos-toolbar') ||
            document.querySelector('#tposCommentHeader') ||
            _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-real-chip';
        chip.className = 'tpos-snap-real-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;margin-left:6px;user-select:none;';
        // Click chip = đổi mode (NOT toggle stream). Stream tự bật khi user
        // click 📸 trong mode='live' (lazy initialization, OS picker chỉ hiện
        // khi cần thật sự).
        chip.addEventListener('click', () => {
            const next = _getSnapMode() === MODE_LIVE ? MODE_LAZY : MODE_LIVE;
            _setSnapMode(next);
            // Nếu chuyển sang lazy → tắt stream cũ
            if (next === MODE_LAZY && STATE.captureStream) {
                stopRealSnap();
            }
            _toast(
                next === MODE_LIVE
                    ? '🎬 Đã đổi sang Chụp Live (lần đầu bấm 📸 sẽ hỏi tab FB)'
                    : '⏱️ Đã đổi sang Lưu Time (không cần FB tab)',
                'ok'
            );
        });
        host.appendChild(chip);
        renderRealSnapChip();
        renderAutoModeChip();
        return chip;
    }
    function renderRealSnapChip() {
        const chip = document.getElementById('tpos-snap-real-chip');
        if (!chip) return;
        const mode = _getSnapMode();
        const streamReady = !!STATE.captureStream;
        if (mode === MODE_LIVE) {
            if (streamReady) {
                chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> Mode: <strong>🎬 Chụp Live</strong> · sẵn sàng`;
                chip.style.background = '#fee2e2';
                chip.style.borderColor = '#fca5a5';
                chip.style.color = '#991b1b';
                chip.title =
                    'Click bấm 📸 sẽ chụp ảnh thật từ FB live tab. Click chip để đổi sang ⏱️ Lưu Time mode.';
            } else {
                chip.innerHTML = `🎬 Mode: <strong>Chụp Live</strong> · click bấm 📸 sẽ hỏi chọn FB tab`;
                chip.style.background = '#fef3c7';
                chip.style.borderColor = '#fcd34d';
                chip.style.color = '#92400e';
                chip.title =
                    'Mode Chụp Live: cần mở thêm 1 tab FB live + chọn tab khi browser hỏi. Ảnh exact moment, 1280x720. Click chip để đổi sang ⏱️ Lưu Time.';
            }
        } else {
            // MODE_LAZY
            chip.innerHTML = `⏱️ Mode: <strong>Lưu Time</strong> · click chip đổi sang Chụp Live`;
            chip.style.background = '#dbeafe';
            chip.style.borderColor = '#93c5fd';
            chip.style.color = '#1e40af';
            chip.title =
                'Mode Lưu Time: chỉ lưu thời gian, không chụp ảnh. Mở popover sẽ tự fetch FB Graph thumb (lag 5-30s). Không cần mở FB tab. Click để đổi sang 🎬 Chụp Live.';
        }
    }

    // -----------------------------------------------------
    // Auto-mode chip — khi mới có comment, tự động snap
    // -----------------------------------------------------
    function ensureAutoModeChip() {
        let chip = document.getElementById('tpos-snap-auto-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-auto-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;user-select:none;';
        chip.addEventListener('click', () => {
            const next = !_isAutoMode();
            // KHÔNG cần pre-check stream — auto fallback offline path khi không
            // có stream (compute offset từ commentTime + broadcastStart).
            _setAutoMode(next);
            _toast(next ? '🤖 Auto ON — KH mới comment tự snap' : '🤖 Auto OFF', 'ok');
        });
        host.appendChild(chip);
        renderAutoModeChip();
        return chip;
    }
    function renderAutoModeChip() {
        const chip = document.getElementById('tpos-snap-auto-chip');
        if (!chip) return;
        const on = _isAutoMode();
        const streamOk = !!STATE.captureStream;
        if (on) {
            const pathLabel = streamOk ? '🎬 stream' : '⏱ offset';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#16a34a;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> Auto: <strong>ON</strong> (${pathLabel}) · ${STATE.autoStats.total}`;
            chip.style.background = '#dcfce7';
            chip.style.borderColor = '#86efac';
            chip.style.color = '#166534';
            chip.title = `Auto-snap ON.
Path: ${streamOk ? 'real-frame từ FB tab share (chính xác moment)' : 'offset computed từ commentTime + broadcastStart (chính xác giây)'}
Session: ${STATE.autoStats.total} OK, ${STATE.autoStats.throttled} throttled, ${STATE.autoStats.errors} errors.
Throttle 30s/KH. Click để tắt.`;
        } else {
            chip.innerHTML = `🤖 Auto: <strong>OFF</strong> · click bật`;
            chip.style.background = '#f3f4f6';
            chip.style.borderColor = '#d1d5db';
            chip.style.color = '#374151';
            chip.title =
                'Auto OFF. Click bật: mỗi comment mới tự snap với offset chính xác (không cần FB tab share).';
        }
    }

    // Toggle chip: bật/tắt hiển thị thumbnail snapshot inline trong comment row.
    function ensureInlineThumbChip() {
        let chip = document.getElementById('tpos-snap-thumb-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-thumb-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;cursor:pointer;user-select:none;';
        chip.addEventListener('click', () => {
            const next = !_isInlineThumbOn();
            _setInlineThumb(next);
            _toast(
                next ? '🖼 Inline thumb ON — hiện ảnh dưới comment' : '🖼 Inline thumb OFF',
                'ok'
            );
        });
        host.appendChild(chip);
        renderInlineThumbChip();
        return chip;
    }
    function renderInlineThumbChip() {
        const chip = document.getElementById('tpos-snap-thumb-chip');
        if (!chip) return;
        const on = _isInlineThumbOn();
        if (on) {
            chip.innerHTML = `🖼 Thumb: <strong>ON</strong>`;
            chip.style.background = '#dbeafe';
            chip.style.borderColor = '#93c5fd';
            chip.style.color = '#1e40af';
            chip.title =
                'Inline thumbnail ON. Mỗi comment có snap sẽ hiện ảnh nhỏ trong row. Click ảnh để zoom.';
        } else {
            chip.innerHTML = `🖼 Thumb: <strong>OFF</strong>`;
            chip.style.background = '#f3f4f6';
            chip.style.borderColor = '#d1d5db';
            chip.style.color = '#374151';
            chip.title =
                'Inline thumbnail OFF. Click bật để hiện ảnh snapshot trực tiếp trong từng row comment.';
        }
    }

    // -----------------------------------------------------
    // Feature 2 — Offline batch backfill snapshots
    // Compute offsetSec = (commentTime - broadcastStart) / 1000, gửi
    // POST /offline-batch để backend lưu (background-style, không cần stream).
    // -----------------------------------------------------
    function _isStaffComment(c) {
        const st = global.TposState;
        const pageObj = st?.selectedPage;
        return pageObj && c.from?.id === pageObj.Facebook_PageId;
    }

    async function offlineBatchAll(opts) {
        opts = opts || {};
        const pageObj = _resolvePageObj();
        if (!pageObj) {
            _toast('Chưa chọn page', 'err');
            return;
        }
        const camp = _resolveActiveCampaign(pageObj);
        if (!camp) {
            _toast(`Page "${pageObj.Name}" chưa có live campaign`, 'err');
            return;
        }
        const liveVideoId = camp.Facebook_LiveId || null;
        if (!liveVideoId) {
            _toast('Không tìm được liveVideoId', 'err');
            return;
        }
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, liveVideoId);
        if (!videoInfo?.broadcastStartMs) {
            _toast('Không lấy được broadcast_start_time (TPOS livevideo fail)', 'err');
            return;
        }
        const allComments = (global.TposState?.comments || []).filter(
            (c) => c.from?.id && !_isStaffComment(c)
        );
        const comments = opts.customerFbUserId
            ? allComments.filter((c) => c.from.id === opts.customerFbUserId)
            : allComments;
        if (!comments.length) {
            _toast(
                opts.customerFbUserId
                    ? 'KH không có comment trong campaign hiện tại'
                    : 'Không có comment nào để backfill',
                'err'
            );
            return;
        }
        const payload = {
            pageId: pageObj.Facebook_PageId,
            pageName: pageObj.Name,
            pageUsername: _resolvePageVanity(pageObj),
            liveCampaignId: camp.Id ? String(camp.Id) : null,
            liveVideoId,
            broadcastStartMs: videoInfo.broadcastStartMs,
            thumbnailUrl: videoInfo.thumbnailUrl || undefined,
            comments: comments.map((c) => {
                const raw = c.created_time || c.createdTime || c.inserted_at || c.created_at;
                const t = raw ? new Date(raw).getTime() : NaN;
                return {
                    commentId: c.id,
                    customerFbUserId: c.from.id,
                    customerName: c.from.name || '?',
                    createdTime: Number.isFinite(t) ? t : Date.now(),
                    message: c.message || '',
                };
            }),
            skipExisting: opts.skipExisting !== false,
            user: _user(),
        };
        _toast(`🔄 Đang backfill ${payload.comments.length} comments...`, 'ok');
        try {
            const r = await fetch(API + '/api/livestream/offline-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'batch failed');
            _toast(
                `✅ Backfill: ${d.summary.created} mới, ${d.summary.skipped} đã có, ${d.summary.failed} fail`,
                d.summary.failed > 0 ? 'err' : 'ok'
            );
            const ids = Array.from(new Set(comments.map((c) => c.from.id)));
            refreshCounts(ids);
            return d;
        } catch (e) {
            _toast('Lỗi backfill: ' + e.message, 'err');
            throw e;
        }
    }

    async function offlineManualSnap() {
        const pageObj = _resolvePageObj();
        const camp = _resolveActiveCampaign(pageObj);
        if (!camp) {
            _toast('Chưa có campaign active', 'err');
            return;
        }
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, camp.Facebook_LiveId);
        if (!videoInfo?.broadcastStartMs) {
            _toast('Không lấy được broadcast_start_time', 'err');
            return;
        }
        const customerId = prompt('FB User ID khách:');
        if (!customerId) return;
        const customerName = prompt('Tên khách:') || '?';
        const timeStr = prompt(
            'Thời gian comment (HH:MM:SS hôm nay, vd 17:32:15):',
            new Date().toTimeString().slice(0, 8)
        );
        if (!timeStr) return;
        const [h, m, s] = timeStr.split(':').map(Number);
        const dt = new Date();
        dt.setHours(h || 0, m || 0, s || 0, 0);
        const commentTime = dt.getTime();
        if (commentTime < videoInfo.broadcastStartMs) {
            _toast('Thời gian comment trước khi live bắt đầu', 'err');
            return;
        }
        const payload = {
            pageId: pageObj.Facebook_PageId,
            pageName: pageObj.Name,
            pageUsername: _resolvePageVanity(pageObj),
            liveCampaignId: camp.Id ? String(camp.Id) : null,
            liveVideoId: camp.Facebook_LiveId,
            broadcastStartMs: videoInfo.broadcastStartMs,
            thumbnailUrl: videoInfo.thumbnailUrl || undefined,
            comments: [
                {
                    commentId: `manual_${Date.now()}`,
                    customerFbUserId: customerId,
                    customerName,
                    createdTime: commentTime,
                    message: '[manual offline snap]',
                },
            ],
            skipExisting: false,
            user: _user(),
        };
        try {
            const r = await fetch(API + '/api/livestream/offline-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            _toast(`✅ Manual snap created`, 'ok');
            refreshCounts([customerId]);
        } catch (e) {
            _toast('Lỗi manual: ' + e.message, 'err');
        }
    }

    function ensureBackfillChip() {
        let chip = document.getElementById('tpos-snap-backfill-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-backfill-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:14px;font-size:12px;font-weight:600;color:#6d28d9;cursor:pointer;user-select:none;';
        chip.innerHTML = `🔄 <strong>Backfill</strong>`;
        chip.title =
            'Click: backfill snap cho mọi comment hiện tại (offset chính xác qua broadcast_start). Shift+click: manual nhập time + KH.';
        chip.addEventListener('click', async (e) => {
            if (e.shiftKey) {
                await offlineManualSnap();
                return;
            }
            const total = (global.TposState?.comments || []).filter(
                (c) => c.from?.id && !_isStaffComment(c)
            ).length;
            if (!confirm(`Backfill ${total} comments? (skip những comment đã có snap)`)) return;
            await offlineBatchAll({ skipExisting: true });
        });
        host.appendChild(chip);
        return chip;
    }

    // -----------------------------------------------------
    // Auto-snap handler — gắn vào eventBus.on('tpos:newComment')
    // -----------------------------------------------------
    // Auto-snap handler — 2 paths theo capability:
    //   1. captureStream sẵn → snap() real-frame (chính xác moment user thấy)
    //   2. Không có stream → offline path (POST /offline-batch với 1 comment)
    //      Compute offset = (commentTime - broadcastStart)/1000 từ FB Graph
    //      KHÔNG cần FB tab share → auto chạy tự động không setup gì.
    async function _handleNewCommentAuto(payload) {
        if (!_isAutoMode()) return;
        const comment = payload?.comment;
        if (!comment || payload.isStaff) return;
        const customerFbUserId = comment.from?.id;
        const customerName = comment.from?.name || '?';
        const commentId = comment.id;
        if (!customerFbUserId) return;
        // Throttle per customer
        const lastTs = STATE.autoLastSnap.get(customerFbUserId) || 0;
        const now = Date.now();
        if (now - lastTs < AUTO_THROTTLE_MS) {
            STATE.autoStats.throttled++;
            renderAutoModeChip();
            return;
        }
        STATE.autoLastSnap.set(customerFbUserId, now);
        try {
            if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
                // Path 1: real-frame capture từ FB tab đã share.
                // Pass comment.created_time để offset_seconds tính từ moment
                // comment, không phải thời điểm capture frame.
                const rawT =
                    comment.created_time ||
                    comment.createdTime ||
                    comment.inserted_at ||
                    comment.created_at;
                const parsedT = rawT ? new Date(rawT).getTime() : NaN;
                const commentTimeMs = Number.isFinite(parsedT) ? parsedT : Date.now();
                await snap(customerFbUserId, customerName, commentId, null, {
                    commentTime: commentTimeMs,
                    comment,
                });
            } else {
                // Path 2: offline computed offset — không cần FB tab.
                // commentTime ưu tiên FB created_time (chính xác từ FB), fallback
                // Pancake inserted_at, last resort Date.now() (sẽ log warning).
                const rawTime =
                    comment.created_time ||
                    comment.createdTime ||
                    comment.inserted_at ||
                    comment.created_at;
                const parsed = rawTime ? new Date(rawTime).getTime() : NaN;
                const commentTime = Number.isFinite(parsed) ? parsed : Date.now();
                if (!Number.isFinite(parsed)) {
                    console.warn(
                        '[snap-auto] comment missing valid created_time, falling back Date.now(). Comment keys:',
                        Object.keys(comment).join(',')
                    );
                }
                await _offlineSnapOne({
                    commentId,
                    customerFbUserId,
                    customerName,
                    commentTime,
                    message: comment.message,
                    comment, // pass full comment để resolve campaign theo _campaignId / _pageId
                });
            }
            STATE.autoStats.total++;
        } catch (e) {
            STATE.autoStats.errors++;
            console.warn('[snap-auto] fail:', e.message);
        }
        renderAutoModeChip();
    }

    // Internal: single comment offline snap qua /offline-batch.
    // Resolve page + campaign + broadcastStart (cached). Auto-skip nếu fail
    // (eg. no campaign active, no broadcast time).
    async function _offlineSnapOne({
        commentId,
        customerFbUserId,
        customerName,
        commentTime,
        message,
        comment,
    }) {
        // Resolve campaign theo comment (deep extract pageId + videoId + campaign).
        // User req: 'all pages + 2 campaigns mới nhất'. Logic:
        //   1. comment._campaignId / comment._pageId → exact match
        //   2. fallback: top-2 campaigns mới nhất, match qua pageId
        //   3. fallback: campaign mới nhất bất kỳ
        const camp = comment ? _resolveCampaignForComment(comment) : _resolveTopCampaigns(1)[0];
        if (!camp || !camp.Facebook_LiveId) throw new Error('no live campaign matching comment');
        // Resolve pageObj từ campaign.Facebook_UserId (page sở hữu live)
        const st = global.TposState;
        const pageObj =
            st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) ||
            st?.selectedPage;
        if (!pageObj) throw new Error('cannot resolve pageObj from campaign');
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, camp.Facebook_LiveId);
        if (!videoInfo?.broadcastStartMs) throw new Error('no broadcast_start_time');
        const payload = {
            pageId: pageObj.Facebook_PageId,
            pageName: pageObj.Name,
            pageUsername: _resolvePageVanity(pageObj),
            liveCampaignId: camp.Id ? String(camp.Id) : null,
            liveVideoId: camp.Facebook_LiveId,
            broadcastStartMs: videoInfo.broadcastStartMs,
            // FB CDN signed URL từ TPOS (FB Graph picture endpoint trả 400)
            thumbnailUrl: videoInfo.thumbnailUrl || undefined,
            comments: [
                {
                    commentId,
                    customerFbUserId,
                    customerName,
                    createdTime: commentTime,
                    message: message ? String(message).slice(0, 200) : '',
                },
            ],
            skipExisting: true,
            user: _user(),
        };
        const r = await fetch(API + '/api/livestream/offline-batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'batch failed');
        if (d.summary?.created > 0) {
            STATE.counts[customerFbUserId] = (STATE.counts[customerFbUserId] || 0) + 1;
            _renderBadgeFor(customerFbUserId);
        }
        return d;
    }

    // Init capture stream (no-op nếu đã có). Trả về stream hoặc throw.
    // Tách khỏi toggleRealSnap (đã deprecated trong chip click) để snap() có
    // thể lazy-init mà không sợ stop nhầm stream sẵn có.
    async function ensureCaptureStream() {
        if (STATE.captureStream) return STATE.captureStream;
        return _requestCaptureStream();
    }

    async function toggleRealSnap() {
        if (STATE.captureStream) {
            stopRealSnap();
            return;
        }
        return _requestCaptureStream();
    }

    // Hiển thị modal hướng dẫn 3 bước trước khi mở picker. Chỉ show 1 lần đầu
    // (localStorage flag), những lần sau skip để user không bị phiền.
    function _showPickerTutorial() {
        if (localStorage.getItem('tpos_snap_picker_tutorial_seen')) return Promise.resolve();
        return new Promise((resolve) => {
            const overlay = document.createElement('div');
            overlay.style.cssText =
                'position:fixed;inset:0;z-index:99998;background:rgba(15,23,42,0.7);display:flex;align-items:center;justify-content:center;padding:20px;font-family:Inter,system-ui,sans-serif;';
            overlay.innerHTML = `
                <div style="background:#fff;border-radius:14px;padding:24px 28px;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.3);">
                    <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#0f172a;">📷 Cách chụp livestream lần đầu</h3>
                    <p style="margin:0 0 14px;font-size:13px;color:#475569;line-height:1.5;">
                        Sau khi bấm "Tiếp tục", browser sẽ hiện 1 cửa sổ chọn tab.
                        Làm theo 3 bước:
                    </p>
                    <ol style="margin:0 0 16px 18px;padding:0;font-size:13px;color:#334155;line-height:1.7;">
                        <li><strong>Click hàng "(...) Facebook"</strong> trong cột trái</li>
                        <li>Cột phải sẽ hiện preview tab FB</li>
                        <li>Click nút <strong>Share</strong> (góc phải dưới)</li>
                    </ol>
                    <p style="margin:0 0 16px;font-size:12px;color:#94a3b8;line-height:1.5;background:#f8fafc;padding:8px 10px;border-radius:6px;border-left:3px solid #f59e0b;">
                        💡 Lần sau bạn KHÔNG cần làm lại — stream giữ nguyên suốt phiên.
                    </p>
                    <div style="display:flex;gap:8px;justify-content:flex-end;">
                        <button class="snap-tut-skip" style="background:transparent;border:1px solid #cbd5e1;color:#475569;padding:8px 14px;border-radius:6px;font-size:13px;cursor:pointer;">Bỏ qua, không hỏi lại</button>
                        <button class="snap-tut-ok" style="background:#7c3aed;border:none;color:#fff;padding:8px 18px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">Tiếp tục</button>
                    </div>
                </div>
            `;
            document.body.appendChild(overlay);
            const close = (remember) => {
                if (remember) localStorage.setItem('tpos_snap_picker_tutorial_seen', '1');
                overlay.remove();
                resolve();
            };
            overlay.querySelector('.snap-tut-ok').onclick = () => close(false);
            overlay.querySelector('.snap-tut-skip').onclick = () => close(true);
        });
    }

    async function _requestCaptureStream() {
        try {
            await _showPickerTutorial();
            // Hint user trước khi mở picker (notification toast)
            _toast('⚙ Browser mở picker — click tab Facebook + bấm Share', 'ok');
            // getDisplayMedia với preferences: prefer browser tab, no audio, no cursor
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    cursor: 'never',
                    displaySurface: 'browser',
                    width: { ideal: 1920, max: 1920 },
                    height: { ideal: 1080, max: 1080 },
                },
                audio: false,
                preferCurrentTab: false,
                selfBrowserSurface: 'exclude',
            });
            STATE.captureStream = stream;
            // Tạo hidden video để draw frame
            if (!STATE.captureVideo) {
                STATE.captureVideo = document.createElement('video');
                STATE.captureVideo.muted = true;
                STATE.captureVideo.playsInline = true;
                STATE.captureVideo.style.cssText =
                    'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
                document.body.appendChild(STATE.captureVideo);
            }
            STATE.captureVideo.srcObject = stream;
            await STATE.captureVideo.play();
            // Lắng nghe khi user "Stop sharing" qua browser UI
            stream.getVideoTracks().forEach((t) => {
                t.addEventListener('ended', () => {
                    console.log('[snap-real] user stopped sharing → revert OFF');
                    stopRealSnap();
                    _toast('🔴 Snap thật đã tắt (user dừng share)', 'ok');
                });
            });
            renderRealSnapChip();
            renderAutoModeChip();
            _toast('🔴 Snap thật ON — mỗi 📸 sẽ chụp thật từ tab đã chọn', 'ok');
        } catch (e) {
            console.warn('[snap-real] getDisplayMedia rejected:', e?.message);
            if (e?.name === 'NotAllowedError') {
                _toast('Đã hủy chọn tab', 'err');
            } else {
                _toast('Bật snap thật thất bại: ' + e.message, 'err');
            }
            STATE.captureStream = null;
            renderRealSnapChip();
            renderAutoModeChip();
        }
    }

    function stopRealSnap() {
        if (STATE.captureStream) {
            STATE.captureStream.getTracks().forEach((t) => t.stop());
            STATE.captureStream = null;
        }
        if (STATE.captureVideo) {
            STATE.captureVideo.srcObject = null;
        }
        renderRealSnapChip();
        renderAutoModeChip();
    }

    // Capture 1 frame từ stream → JPEG base64. Return null nếu stream chưa sẵn.
    async function _captureFrameJpeg(quality = 0.7, maxWidth = 1280) {
        const v = STATE.captureVideo;
        if (!STATE.captureStream || !v || !v.videoWidth) return null;
        const w = v.videoWidth;
        const h = v.videoHeight;
        // Downscale to maxWidth (giữ aspect)
        let targetW = w;
        let targetH = h;
        if (w > maxWidth) {
            targetW = maxWidth;
            targetH = Math.round(h * (maxWidth / w));
        }
        if (!STATE.captureCanvas) {
            STATE.captureCanvas = document.createElement('canvas');
        }
        const canvas = STATE.captureCanvas;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(v, 0, 0, targetW, targetH);
        return new Promise((resolve) => {
            canvas.toBlob(
                (blob) => {
                    if (!blob) return resolve(null);
                    const fr = new FileReader();
                    fr.onload = () => {
                        const dataUrl = fr.result;
                        // strip "data:image/jpeg;base64,"
                        const i = dataUrl.indexOf(',');
                        resolve(dataUrl.slice(i + 1));
                    };
                    fr.readAsDataURL(blob);
                },
                'image/jpeg',
                quality
            );
        });
    }

    // -----------------------------------------------------
    // Snap action — POST /api/livestream/snapshot
    // -----------------------------------------------------
    async function snap(customerFbUserId, customerName, commentId, sourceBtn, opts = {}) {
        // Resolve page + campaign — ưu tiên từ comment đang xét (qua STATE.comments
        // hoặc opts), fallback page pref (Store/House). Vì 1 button = 1 comment cụ
        // thể, phải dùng đúng broadcastStart của video chứa comment đó.
        const st = global.TposState;
        const commentRef =
            opts.comment || (commentId && st?.comments?.find((x) => x.id === commentId)) || null;
        let camp = null;
        let pageObj = null;
        if (commentRef) {
            camp = _resolveCampaignForComment(commentRef);
            if (camp) {
                pageObj =
                    st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) || null;
            }
        }
        if (!pageObj) pageObj = _resolvePageObj();
        if (!pageObj) {
            _toast('Chưa chọn page — vào TPOS chọn page trước', 'err');
            return;
        }
        if (!camp) camp = _resolveActiveCampaign(pageObj);
        if (!camp) {
            _toast(`Page "${pageObj.Name}" chưa có live campaign active`, 'err');
            return;
        }
        const liveVideoId = camp.Facebook_LiveId || null;
        const liveCampaignId = camp.Id ? String(camp.Id) : null;
        // capturedAt = thời điểm comment xảy ra (đại diện moment trong livestream).
        // Ưu tiên opts.commentTime do caller truyền (= comment.created_time từ FB).
        // Fallback Date.now() chỉ khi không có (vd snap thủ công không gắn comment).
        const referenceMs =
            opts.commentTime && Number.isFinite(opts.commentTime) ? opts.commentTime : Date.now();
        // Ưu tiên: TPOS livevideo channelCreatedTime (= FB broadcast_start_time
        // chính xác từ Graph API qua TPOS proxy, đã cache 5 phút per liveVideoId).
        // Fallback: campaign.DateCreated (gần đúng, có thể lệch vài phút).
        let startMs = null;
        let startSource = null;
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, liveVideoId);
        if (videoInfo?.broadcastStartMs) {
            startMs = videoInfo.broadcastStartMs;
            startSource = 'fb-graph(channelCreatedTime)';
        } else {
            const startedTime =
                camp.StartedTime ||
                camp.StartedDate ||
                camp.Started_At ||
                camp.StartDate ||
                camp.LiveAt ||
                camp.LiveStartedAt ||
                camp.Facebook_LiveStartedTime ||
                camp.DateCreated ||
                null;
            if (startedTime) {
                startMs = new Date(startedTime).getTime();
                startSource = 'tpos-campaign(' + (camp.DateCreated ? 'DateCreated' : 'other') + ')';
            }
        }
        const offsetSec =
            startMs && referenceMs > startMs ? Math.floor((referenceMs - startMs) / 1000) : null;
        console.log(
            '[snap] offset:',
            offsetSec,
            's | source:',
            startSource || 'NONE',
            '| startMs:',
            startMs
        );

        // Optimistic: increment badge count NGAY
        STATE.counts[customerFbUserId] = (STATE.counts[customerFbUserId] || 0) + 1;
        _renderBadgeFor(customerFbUserId);
        // Visual feedback button
        if (sourceBtn) {
            sourceBtn.classList.add('snap-flash');
            setTimeout(() => sourceBtn.classList.remove('snap-flash'), 400);
        }

        // Mode = 'live' (🎬 Chụp Live, default) → auto-prompt getDisplayMedia
        // ở lần đầu phiên (lazy init). User chọn FB tab → stream lưu vào STATE.
        // Mọi snap sau đó tự dùng stream → không hỏi lại.
        // Mode = 'lazy' (⏱️ Lưu Time) → skip capture, backend lazy fetch FB Graph
        // sau (browser <img src=thumbnailUrl> resolve tại view-time).
        const mode = _getSnapMode();
        let imageBase64 = null;
        if (mode === MODE_LIVE) {
            // Lazy init stream nếu chưa có
            if (!STATE.captureStream) {
                try {
                    await ensureCaptureStream(); // sẽ mở picker (lazy init)
                } catch (e) {
                    console.warn('[snap-live] init stream fail:', e.message);
                }
            }
            // Nếu stream giờ đã sẵn → capture frame
            if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
                try {
                    imageBase64 = await _captureFrameJpeg(0.72, 1280);
                } catch (e) {
                    console.warn('[snap-live] capture frame failed:', e.message);
                }
            }
            // Nếu user hủy picker → imageBase64 = null → fallback lazy mode cho snap này
            if (!imageBase64) {
                console.log('[snap-live] no frame → fallback lazy (FB Graph URL)');
            }
        }

        try {
            const r = await fetch(API + '/api/livestream/snapshot', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({
                    commentId,
                    customerFbUserId,
                    customerName,
                    pageId: pageObj.Facebook_PageId,
                    pageName: pageObj.Name,
                    pageUsername: _resolvePageVanity(pageObj),
                    liveCampaignId,
                    liveVideoId,
                    capturedAt: referenceMs,
                    offsetSeconds: offsetSec,
                    // FB CDN signed URL từ TPOS livevideo (FB Graph picture endpoint
                    // trả 400 từ 05/2026). Cached qua _fetchLiveVideoInfo.
                    thumbnailUrl: videoInfo?.thumbnailUrl || undefined,
                    user: _user(),
                    imageBase64,
                    imageMime: imageBase64 ? 'image/jpeg' : undefined,
                }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'snap failed');
            const t = new Date(referenceMs).toLocaleTimeString('vi-VN', { hour12: false });
            _toast(`📸 Đã chụp lúc ${t}${offsetSec ? ' (offset ' + offsetSec + 's)' : ''}`);
            // Invalidate cached list nếu đang mở popover
            STATE.cacheList.delete(customerFbUserId);
            if (STATE.popoverOpen === customerFbUserId) {
                _refreshPopoverContent(customerFbUserId);
            }
        } catch (e) {
            // Rollback optimistic
            STATE.counts[customerFbUserId] = Math.max(0, (STATE.counts[customerFbUserId] || 1) - 1);
            _renderBadgeFor(customerFbUserId);
            _toast('Lỗi snap: ' + e.message, 'err');
        }
    }

    // -----------------------------------------------------
    // Badge counter
    // -----------------------------------------------------
    function _renderBadgeFor(customerFbUserId) {
        // Find ALL snap buttons for this customer (multiple comments cùng customer)
        const btns = document.querySelectorAll(
            `.tpos-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
        );
        const n = STATE.counts[customerFbUserId] || 0;
        btns.forEach((btn) => {
            let badge = btn.querySelector('.tpos-snap-count');
            if (n > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tpos-snap-count';
                    badge.style.cssText =
                        'background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:8px;margin-left:3px;min-width:14px;text-align:center;display:inline-block;';
                    btn.appendChild(badge);
                }
                badge.textContent = n;
            } else if (badge) {
                badge.remove();
            }
        });
    }

    async function refreshCounts(customerIds) {
        try {
            const ids =
                customerIds && customerIds.length
                    ? customerIds
                    : Array.from(
                          new Set(
                              Array.from(
                                  document.querySelectorAll('.tpos-snap-btn[data-customer-id]')
                              )
                                  .map((b) => b.dataset.customerId)
                                  .filter(Boolean)
                          )
                      );
            if (!ids.length) return;
            const r = await fetch(
                API +
                    '/api/livestream/snapshots/batch-counts?customerIds=' +
                    encodeURIComponent(ids.join(',')),
                { credentials: 'omit' }
            );
            const d = await r.json();
            const counts = d.counts || {};
            for (const id of ids) STATE.counts[id] = counts[id] || 0;
            ids.forEach(_renderBadgeFor);
        } catch (e) {
            console.warn('[snap] refreshCounts fail:', e.message);
        }
    }

    // -----------------------------------------------------
    // Inline thumbnail strip — hiển thị ảnh snapshot ngay dưới mỗi comment row
    // -----------------------------------------------------
    function _queueSnapByComment(commentId) {
        if (!commentId || STATE.snapByComment.has(commentId)) return;
        STATE.snapByCommentPending.add(commentId);
        if (STATE.snapByCommentTimer) return;
        // Debounce gom 300ms → 1 batch fetch tối đa 200 IDs.
        STATE.snapByCommentTimer = setTimeout(_flushSnapByCommentBatch, 300);
    }

    async function _flushSnapByCommentBatch() {
        STATE.snapByCommentTimer = null;
        const ids = Array.from(STATE.snapByCommentPending);
        STATE.snapByCommentPending.clear();
        if (!ids.length) return;
        // Bước 1: bulk fetch exact snap (frozen bytea image) theo comment_id.
        const chunks = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        const exactMap = new Map();
        for (const chunk of chunks) {
            try {
                const r = await fetch(
                    API +
                        '/api/livestream/snapshots/by-comment-ids?commentIds=' +
                        encodeURIComponent(chunk.join(',')),
                    { credentials: 'omit' }
                );
                const d = await r.json();
                const map = d.byCommentId || {};
                for (const id of chunk) if (map[id]) exactMap.set(id, map[id]);
            } catch (e) {
                console.warn('[snap] by-comment-ids fail:', e.message);
            }
        }
        // Bước 2: cho mỗi commentId thiếu exact snap → compute từ comment.time
        // + broadcastStartMs (cached qua _fetchLiveVideoInfo) → tạo data có cùng
        // shape { thumbnailUrl, livestreamUrl, offsetSeconds } nhưng source='computed'.
        for (const id of ids) {
            const exact = exactMap.get(id);
            if (exact) {
                STATE.snapByComment.set(id, exact);
                _renderThumbStripFor(id);
                continue;
            }
            // Compute path (async — không block batch).
            _computeAndRenderForComment(id).catch(() => {});
        }
    }

    // Compute snapshot-equivalent data cho 1 comment: offset_seconds derived từ
    // comment.created_time - broadcastStartMs, URL với ?t={offset}, thumbnail từ
    // videoInfo.thumbnailUrl (FB CDN signed). Không hit DB — tính client-side.
    async function _computeAndRenderForComment(commentId) {
        const st = global.TposState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) {
            STATE.snapByComment.set(commentId, null);
            return;
        }
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const tMs = rawT ? new Date(rawT).getTime() : NaN;
        if (!Number.isFinite(tMs)) {
            STATE.snapByComment.set(commentId, null);
            return;
        }
        const camp = _resolveCampaignForComment(c);
        if (!camp?.Facebook_LiveId) {
            STATE.snapByComment.set(commentId, null);
            return;
        }
        const pageId = camp.Facebook_UserId;
        const liveVideoId = camp.Facebook_LiveId;
        const videoInfo = await _fetchLiveVideoInfo(pageId, liveVideoId);
        if (!videoInfo?.broadcastStartMs) {
            STATE.snapByComment.set(commentId, null);
            return;
        }
        const offsetSec = Math.max(0, Math.floor((tMs - videoInfo.broadcastStartMs) / 1000));
        const pageObj = st.allPages?.find((p) => p.Facebook_PageId === pageId);
        const slug = _resolvePageVanity(pageObj) || pageId;
        const videoIdShort = String(liveVideoId).replace(/^\d+_/, '');
        const url = `https://www.facebook.com/${encodeURIComponent(slug)}/videos/${encodeURIComponent(videoIdShort)}/?locale=vi_VN&t=${offsetSec}`;
        STATE.snapByComment.set(commentId, {
            thumbnailUrl: videoInfo.thumbnailUrl || null,
            livestreamUrl: url,
            offsetSeconds: offsetSec,
            capturedAt: tMs,
            source: 'computed',
        });
        _renderThumbStripFor(commentId);
    }

    function _renderThumbStripFor(commentId) {
        const row = document.querySelector(
            `.tpos-conversation-item[data-comment-id="${CSS.escape(commentId)}"]`
        );
        if (!row) return;
        let strip = row.querySelector('.tpos-snap-thumb-strip');
        // Toggle OFF → xóa nếu có, không render.
        if (!_isInlineThumbOn()) {
            if (strip) strip.remove();
            return;
        }
        const data = STATE.snapByComment.get(commentId);
        if (!data || !data.thumbnailUrl) {
            if (strip) strip.remove();
            return;
        }
        const offsetText =
            Number.isFinite(data.offsetSeconds) && data.offsetSeconds >= 0
                ? `${Math.floor(data.offsetSeconds / 60)}m${data.offsetSeconds % 60}s`
                : '?';
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'tpos-snap-thumb-strip';
            // Mount INSIDE .tpos-conv-info để cùng row với phone/address.
            // Address (flex:1) sẽ tự thu lại nhường chỗ → bố cục gọn 1 dòng.
            strip.style.cssText =
                'display:inline-flex;align-items:center;flex-shrink:0;margin-left:4px;';
            const info = row.querySelector('.tpos-conv-info');
            if (info) info.appendChild(strip);
            else row.appendChild(strip);
        }
        strip.innerHTML = `
            <img src="${_esc(data.thumbnailUrl)}"
                 alt=""
                 loading="lazy"
                 class="tpos-snap-thumb-img"
                 data-snap-url="${_esc(data.livestreamUrl || '')}"
                 data-snap-offset="${data.offsetSeconds ?? ''}"
                 title="Snapshot lúc Live @ ${offsetText} — click để zoom"
                 style="width:56px;height:32px;object-fit:cover;border-radius:5px;border:1px solid #e2e8f0;cursor:zoom-in;display:block;background:#f1f5f9;"
                 onerror="this.style.background='#fee2e2';this.removeAttribute('src');" />
        `;
        const img = strip.querySelector('img');
        if (img) {
            img.addEventListener('click', (e) => {
                e.stopPropagation();
                _openSnapLightbox(data);
            });
        }
    }

    // Lightbox zoom — modal full-screen mở ảnh snapshot + nút "Xem live tại giây X".
    function _openSnapLightbox(data) {
        const existing = document.querySelector('.tpos-snap-lightbox');
        if (existing) existing.remove();
        const lb = document.createElement('div');
        lb.className = 'tpos-snap-lightbox';
        lb.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
        const offsetText =
            Number.isFinite(data.offsetSeconds) && data.offsetSeconds >= 0
                ? `${Math.floor(data.offsetSeconds / 60)}m${data.offsetSeconds % 60}s`
                : '?';
        lb.innerHTML = `
            <img src="${_esc(data.thumbnailUrl)}"
                 alt=""
                 style="max-width:90vw;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);cursor:default;" />
            <div style="margin-top:14px;display:flex;align-items:center;gap:12px;">
                <a href="${_esc(data.livestreamUrl || '#')}" target="_blank" rel="noopener"
                   style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;">
                   🔗 Xem live tại giây ${data.offsetSeconds ?? '?'} (${offsetText})
                </a>
                <button type="button"
                        style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
                   ✕ Đóng
                </button>
            </div>
        `;
        lb.querySelector('img').addEventListener('click', (e) => e.stopPropagation());
        lb.querySelector('a').addEventListener('click', (e) => e.stopPropagation());
        lb.querySelector('button').addEventListener('click', () => lb.remove());
        lb.addEventListener('click', () => lb.remove());
        const escClose = (e) => {
            if (e.key === 'Escape') {
                lb.remove();
                document.removeEventListener('keydown', escClose);
            }
        };
        document.addEventListener('keydown', escClose);
        document.body.appendChild(lb);
    }

    // Update strip cho mọi visible row của customerFbUserId — gọi sau auto-snap mới.
    function _refreshThumbStripsForCustomer(customerFbUserId) {
        document
            .querySelectorAll(
                `.tpos-conversation-item[data-customer-fb-id="${CSS.escape(customerFbUserId)}"], .tpos-conversation-item .tpos-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
            )
            .forEach((el) => {
                const row = el.closest('.tpos-conversation-item');
                if (!row) return;
                const cid = row.dataset.commentId;
                if (!cid) return;
                // Invalidate + refetch
                STATE.snapByComment.delete(cid);
                _queueSnapByComment(cid);
            });
    }

    // -----------------------------------------------------
    // Popover — list snapshots
    // -----------------------------------------------------
    async function togglePopover(customerFbUserId, customerName, anchor) {
        const existing = document.querySelector('.tpos-snap-popover');
        if (existing && STATE.popoverOpen === customerFbUserId) {
            existing.remove();
            STATE.popoverOpen = null;
            return;
        }
        if (existing) existing.remove();
        STATE.popoverOpen = customerFbUserId;

        const pop = document.createElement('div');
        pop.className = 'tpos-snap-popover';
        pop.style.cssText =
            'position:absolute;z-index:9999;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:10px;min-width:280px;max-width:340px;max-height:420px;overflow-y:auto;font-family:Inter,system-ui,sans-serif;';
        pop.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;">
                <span style="font-size:12px;font-weight:600;color:#111;">📸 Snapshots — ${_esc(customerName || '?')}</span>
                <button type="button" class="snap-pop-close" style="background:none;border:none;font-size:18px;cursor:pointer;color:#94a3b8;">×</button>
            </div>
            <div class="snap-pop-body" style="font-size:12px;color:#475569;">Đang tải…</div>
        `;
        document.body.appendChild(pop);
        // Position near anchor
        const rect = anchor.getBoundingClientRect();
        pop.style.top = `${window.scrollY + rect.bottom + 6}px`;
        pop.style.left = `${Math.max(8, Math.min(window.innerWidth - 360, rect.left))}px`;
        // Close handlers
        pop.querySelector('.snap-pop-close').onclick = () => {
            pop.remove();
            STATE.popoverOpen = null;
        };
        setTimeout(() => {
            const closeOutside = (e) => {
                if (!pop.contains(e.target) && !anchor.contains(e.target)) {
                    pop.remove();
                    STATE.popoverOpen = null;
                    document.removeEventListener('click', closeOutside);
                }
            };
            document.addEventListener('click', closeOutside);
        }, 0);

        await _refreshPopoverContent(customerFbUserId);
    }

    async function _refreshPopoverContent(customerFbUserId) {
        const pop = document.querySelector('.tpos-snap-popover');
        if (!pop) return;
        const body = pop.querySelector('.snap-pop-body');
        try {
            const r = await fetch(
                API +
                    '/api/livestream/snapshots?customerFbUserId=' +
                    encodeURIComponent(customerFbUserId) +
                    '&limit=30',
                { credentials: 'omit' }
            );
            const d = await r.json();
            const list = d.snapshots || [];
            STATE.cacheList.set(customerFbUserId, list);
            if (!list.length) {
                body.innerHTML = `<div style="color:#94a3b8;font-style:italic;text-align:center;padding:14px 0;">Chưa có snapshot nào.<br>Bấm 📸 trên comment để bắt đầu.</div>`;
                return;
            }
            body.innerHTML = list
                .map((s) => {
                    const t = new Date(s.capturedAt).toLocaleString('vi-VN', { hour12: false });
                    const url = s.livestreamUrl || '#';
                    const thumb = s.thumbnailUrl
                        ? `<img src="${_esc(s.thumbnailUrl)}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:6px;background:#f1f5f9;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" /><span style="display:none;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`
                        : `<span style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`;
                    const pageBadge = s.pageName
                        ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:6px;font-weight:600;">${_esc(s.pageName.replace(/^Nhi Judy /, '').replace(/^NhiJudy /, ''))}</span>`
                        : '';
                    // Hiển thị offset dạng human-readable "+1h23m45s" với tooltip
                    // = giây tuyệt đối + chỉ thị "giây thứ N của video livestream".
                    const offsetHuman = _fmtOffset(s.offsetSeconds);
                    const offsetTxt = offsetHuman
                        ? ` <span title="Tại giây thứ ${s.offsetSeconds} của video livestream" style="color:#0c4a6e;font-size:10px;background:#e0f2fe;padding:1px 5px;border-radius:4px;font-weight:600;">${offsetHuman}</span>`
                        : '';
                    return `
                        <div class="snap-pop-row" data-id="${s.id}" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;align-items:center;">
                            ${thumb}
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:11px;color:#0f172a;font-weight:600;">${_esc(t)}${offsetTxt}</div>
                                <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;gap:4px;align-items:center;">${pageBadge}${s.note ? ' · ' + _esc(s.note) : ''}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:3px;">
                                <a href="${_esc(url)}" target="_blank" rel="noopener" title="Mở FB live tại thời điểm chụp" style="font-size:10px;color:#fff;background:#1877f2;padding:3px 8px;border-radius:5px;text-decoration:none;font-weight:600;text-align:center;">▶ Xem</a>
                                <button type="button" class="snap-pop-refresh" data-id="${s.id}" title="Refresh thumbnail từ FB Graph (lazy fetch hiện tại)" style="font-size:10px;color:#0c4a6e;background:#e0f2fe;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">🔄</button>
                                <button type="button" class="snap-pop-del" data-id="${s.id}" title="Xóa snapshot" style="font-size:10px;color:#dc2626;background:#fee2e2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">Xóa</button>
                            </div>
                        </div>`;
                })
                .join('');
            // 🔄 Refresh thumb: resolve TPOS thumbnail.url (FB CDN signed) →
            // POST với URL đó trong body. Backend fetch URL + save bytea.
            // FB Graph picture endpoint trả 400 từ 05/2026 → cần thumbnail
            // URL từ TPOS proxy (TPOS token).
            body.querySelectorAll('.snap-pop-refresh').forEach((btn) => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const origText = btn.textContent;
                    btn.textContent = '...';
                    btn.disabled = true;
                    try {
                        // Find snap row → get pageId + liveVideoId → resolve fresh
                        // TPOS thumbnail.url. Snap data đã có trong STATE.cacheList.
                        const list = STATE.cacheList.get(customerFbUserId) || [];
                        const snap = list.find((s) => String(s.id) === String(id));
                        let bodyThumbUrl = null;
                        if (snap?.pageId && snap?.liveVideoId) {
                            const info = await _fetchLiveVideoInfo(snap.pageId, snap.liveVideoId);
                            if (info?.thumbnailUrl) bodyThumbUrl = info.thumbnailUrl;
                        }
                        const r = await fetch(
                            API + '/api/livestream/snapshot/' + id + '/refresh-thumbnail',
                            {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                credentials: 'omit',
                                body: JSON.stringify({ thumbnailUrl: bodyThumbUrl }),
                            }
                        );
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        STATE.cacheList.delete(customerFbUserId);
                        _toast('🔄 Đã cập nhật thumb', 'ok');
                        _refreshPopoverContent(customerFbUserId);
                    } catch (err) {
                        _toast('Refresh fail: ' + err.message, 'err');
                        btn.textContent = origText;
                        btn.disabled = false;
                    }
                };
            });
            body.querySelectorAll('.snap-pop-del').forEach((btn) => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    if (!confirm('Xóa snapshot này?')) return;
                    try {
                        const r = await fetch(API + '/api/livestream/snapshot/' + id, {
                            method: 'DELETE',
                            credentials: 'omit',
                        });
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        STATE.cacheList.delete(customerFbUserId);
                        STATE.counts[customerFbUserId] = Math.max(
                            0,
                            (STATE.counts[customerFbUserId] || 1) - 1
                        );
                        _renderBadgeFor(customerFbUserId);
                        _refreshPopoverContent(customerFbUserId);
                    } catch (err) {
                        _toast('Xóa fail: ' + err.message, 'err');
                    }
                };
            });
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải: ${_esc(e.message)}</div>`;
        }
    }

    // -----------------------------------------------------
    // Inject snap button vào mỗi comment row.
    // Gọi sau khi TposCommentList render xong.
    // -----------------------------------------------------
    function injectSnapButtonsAll() {
        document.querySelectorAll('.tpos-conversation-item').forEach((row) => {
            injectSnapButton(row);
        });
    }
    function injectSnapButton(row) {
        if (!row || row.querySelector('.tpos-snap-btn')) return;
        const commentId = row.dataset.commentId;
        if (!commentId) return;
        const st = global.TposState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) return;
        const customerFbUserId = c.from.id;
        const customerName = c.from.name || '?';

        // Mount kế bên badge "Ẩn" / orderBadge trong .tpos-conv-header (user yêu cầu).
        // Tag style để fit visually với các badge khác (House, Ẩn, Cảnh báo).
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'tpos-snap-btn';
        btn.dataset.customerId = customerFbUserId;
        btn.title = `📸 Snap livestream cho KH ${customerName}\nAuto mode ON: click → xem list snapshots (đã tự động chụp)\nAuto mode OFF: click → chụp ngay\nShift+click / right-click: luôn xem list`;
        // Inline SVG (lucide:camera) — KHÔNG dùng <i data-lucide> + lucide.createIcons()
        // vì createIcons() scan toàn bộ DOM mỗi call → 100 rows = 100 scan = lag.
        btn.innerHTML =
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
        btn.style.cssText =
            'display:inline-flex;align-items:center;gap:3px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600;cursor:pointer;margin-left:4px;line-height:1;position:relative;';
        btn.onclick = (e) => {
            e.stopPropagation();
            // Auto mode ON (default) → click → view popover (snap đã chạy tự động
            // qua eventBus, không cần snap thủ công nữa). Shift / right-click vẫn
            // luôn view list. Auto OFF → click → snap thủ công như cũ.
            if (e.shiftKey || _isAutoMode()) {
                togglePopover(customerFbUserId, customerName, btn);
            } else {
                const commentTime = c?.created_time
                    ? new Date(c.created_time).getTime()
                    : c?.createdTime
                      ? Number(c.createdTime)
                      : null;
                snap(customerFbUserId, customerName, commentId, btn, {
                    commentTime: commentTime && Number.isFinite(commentTime) ? commentTime : null,
                    comment: c || undefined,
                });
            }
        };
        // Right-click → show popover
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePopover(customerFbUserId, customerName, btn);
        };

        // Mount: cuối .tpos-conv-header (cạnh badge "Ẩn") theo yêu cầu user.
        // Fallback các action-buttons container nếu header không tìm thấy.
        const header = row.querySelector('.tpos-conv-header');
        if (header) {
            header.appendChild(btn);
        } else {
            const actions =
                row.querySelector('.tpos-action-buttons') ||
                row.querySelector('.tpos-actions') ||
                row.querySelector('[class*="action"]');
            if (actions) actions.appendChild(btn);
            else row.appendChild(btn);
        }

        // KHÔNG gọi _renderBadgeFor tại inject time — sẽ batch update sau khi
        // refreshCounts trả về. Tránh O(n²) querySelectorAll khi inject hàng loạt.
        // Nếu count đã cached (vd qua SSE) thì render ngay cho riêng button này.
        const cached = STATE.counts[customerFbUserId];
        if (cached && cached > 0) {
            const badge = document.createElement('span');
            badge.className = 'tpos-snap-count';
            badge.style.cssText =
                'background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:8px;margin-left:3px;min-width:14px;text-align:center;display:inline-block;';
            badge.textContent = cached;
            btn.appendChild(badge);
        }
        // Queue thumbnail strip lookup chỉ khi toggle ON.
        if (_isInlineThumbOn()) {
            if (STATE.snapByComment.has(commentId)) {
                _renderThumbStripFor(commentId);
            } else {
                _queueSnapByComment(commentId);
            }
        }
    }

    // -----------------------------------------------------
    // Observer — auto-inject khi comment list update
    // -----------------------------------------------------
    // Scope observer chặt: tìm container comment list (TPOS render trong đó).
    // Fallback document.body nếu container chưa có. Re-attach khi container xuất
    // hiện. Tránh observe whole document → giảm 10-100x mutation callbacks.
    function _findCommentContainer() {
        return (
            document.getElementById('tposCommentList') ||
            document.querySelector('.tpos-comment-list') ||
            document.querySelector('[class*="tpos-comment"]') ||
            null
        );
    }

    function setupObserver() {
        let attached = null;
        let pendingRows = new Set();
        let scheduledFrame = null;
        let scheduledRefresh = null;

        function flushInject() {
            scheduledFrame = null;
            if (!pendingRows.size) return;
            const rows = Array.from(pendingRows);
            pendingRows = new Set();
            for (const r of rows) injectSnapButton(r);
        }

        function scheduleInject(rows) {
            for (const r of rows) pendingRows.add(r);
            if (scheduledFrame) return;
            scheduledFrame = requestAnimationFrame(flushInject);
        }

        function scheduleRefresh() {
            clearTimeout(scheduledRefresh);
            scheduledRefresh = setTimeout(() => {
                if (!document.hidden) refreshCounts();
            }, 400);
        }

        const callback = (muts) => {
            let newRows = null;
            for (const m of muts) {
                if (m.type !== 'childList') continue;
                for (const n of m.addedNodes) {
                    if (n.nodeType !== 1) continue;
                    if (n.matches?.('.tpos-conversation-item')) {
                        (newRows ||= []).push(n);
                    } else {
                        const inner = n.querySelectorAll?.('.tpos-conversation-item');
                        if (inner && inner.length) {
                            (newRows ||= []).push(...inner);
                        }
                    }
                }
            }
            if (newRows) {
                scheduleInject(newRows);
                scheduleRefresh();
            }
        };

        function attach() {
            const target = _findCommentContainer() || document.body;
            if (target === attached) return;
            // re-observe ở scope mới
            if (setupObserver._obs) setupObserver._obs.disconnect();
            const obs = new MutationObserver(callback);
            obs.observe(target, { childList: true, subtree: true });
            setupObserver._obs = obs;
            attached = target;
        }

        attach();
        // Nếu chưa scope được container TPOS, retry tới khi container xuất hiện.
        if (attached === document.body) {
            const retry = setInterval(() => {
                if (_findCommentContainer()) {
                    attach();
                    clearInterval(retry);
                }
            }, 1000);
            setTimeout(() => clearInterval(retry), 15000);
        }
    }

    // -----------------------------------------------------
    // SSE subscribe — multi-tab sync
    // -----------------------------------------------------
    function subscribeSSE() {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:livestream-snapshots', (msg) => {
            const { customerFbUserId, action } = msg?.data || {};
            if (!customerFbUserId) return;
            // Invalidate cache + refetch count
            STATE.cacheList.delete(customerFbUserId);
            refreshCounts([customerFbUserId]);
            if (STATE.popoverOpen === customerFbUserId) {
                _refreshPopoverContent(customerFbUserId);
            }
            // Invalidate thumbnail strip cache → re-fetch để hiện ảnh mới.
            _refreshThumbStripsForCustomer(customerFbUserId);
        });
    }

    // -----------------------------------------------------
    // Init
    // -----------------------------------------------------
    function init() {
        setupObserver();
        subscribeSSE();
        // Subscribe TPOS new-comment event cho auto-mode (lazy — eventBus có thể
        // chưa setup tại DOMContentLoaded, fail-safe retry)
        const subscribeNewComment = () => {
            if (global.eventBus?.on) {
                global.eventBus.on('tpos:newComment', _handleNewCommentAuto);
                console.log('[snap] subscribed to tpos:newComment for auto-mode');
                return true;
            }
            return false;
        };
        if (!subscribeNewComment()) {
            const evTimer = setInterval(() => {
                if (subscribeNewComment()) clearInterval(evTimer);
            }, 500);
            setTimeout(() => clearInterval(evTimer), 10000);
        }
        // Retry mount chip 10s — TPOS header (#tposContent / .tpos-header-bar)
        // có thể chưa render tại DOMContentLoaded. Retry interval 500ms tới khi
        // host appears, max 20 attempts.
        let attempts = 0;
        const mountTimer = setInterval(() => {
            attempts++;
            const c1 = ensureHeaderChip();
            const c2 = ensureRealSnapChip();
            const c3 = ensureAutoModeChip();
            const c4 = ensureBackfillChip();
            const c5 = ensureInlineThumbChip();
            if ((c1 && c2 && c3 && c4 && c5) || attempts >= 20) {
                clearInterval(mountTimer);
                console.log('[snap] chips mount done after', attempts, 'attempts');
            }
        }, 500);
        // Initial inject ngay cho rows hiện có (nếu TPOS đã render trước script).
        // Observer sẽ handle rows mới sau đó.
        injectSnapButtonsAll();
        // Refresh counts — defer cho idle để không block initial render.
        // Fallback setTimeout 1.5s nếu browser không hỗ trợ requestIdleCallback.
        const deferRefresh = () => {
            injectSnapButtonsAll();
            refreshCounts();
        };
        if (global.requestIdleCallback) {
            global.requestIdleCallback(deferRefresh, { timeout: 2500 });
        } else {
            setTimeout(deferRefresh, 1500);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    global.TposLivestreamSnap = {
        snap,
        togglePopover,
        refreshCounts,
        injectSnapButtonsAll,
        _getSnapPagePref,
        _setSnapPagePref,
        _setInlineThumb,
        _isInlineThumbOn,
    };
})();
