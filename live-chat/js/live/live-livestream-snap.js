// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Livestream Snapshot UI cho live-chat
//
// Flow:
//   1. User chọn "Snap page" từ chip header (Store / House, default Store, lưu localStorage)
//   2. Click 📸 button trên comment row → POST /api/livestream/snapshot
//      Tự resolve liveCampaignId + liveVideoId từ LiveState theo Snap page
//   3. Sau snap, badge counter trên row update + toast confirm
//   4. Click badge → popover list snapshots → mỗi entry có thumbnail + thời gian + "Xem live" deep-link
//
// SSE topic: web2:livestream-snapshots — multi-tab sync.
// =====================================================

(function () {
    'use strict';
    const global = window;
    if (global.LiveLivestreamSnap) return;

    const API = global.SHOP_CONFIG?.RENDER_API_URL || 'https://n2store-fallback.onrender.com';
    const LS_KEY_SNAP_PAGE = 'web2_snap_live_page'; // 'store' | 'house'
    const LS_KEY_SNAP_MODE = 'web2_snap_mode'; // 'live' (default) | 'lazy'
    const LS_KEY_AUTO_MODE = 'web2_snap_auto'; // 'on' | 'off' (default 'on')
    const LS_KEY_INLINE_THUMB = 'web2_snap_inline_thumb'; // 'on' | 'off' (default 'off')
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

    // Fetch live video metadata từ Live proxy → return channelCreatedTime ms.
    // Endpoint: GET /facebook/livevideo?pageid=X&limit=50 (Live auth required).
    // Cache 5 phút per pageId. Match video bằng objectId.
    // Returns: { broadcastStartMs, title, statusLive } | null
    async function _fetchLiveVideoInfo(pageId, liveVideoId) {
        if (!pageId || !liveVideoId) return null;
        const cacheKey = `${pageId}:${liveVideoId}`;
        const cached = _liveVideoInfoCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < 5 * 60 * 1000) return cached.info;
        try {
            // 2026-06-07: Live /facebook/livevideo đã gỡ → FB Graph (web2-fb-live).
            if (!global.LiveSource?.fetchVideosAsCampaigns) return null;
            const res = await global.LiveSource.fetchVideosAsCampaigns([pageId]);
            const camps = Array.isArray(res) ? res : res?.campaigns || [];
            const videoId = String(liveVideoId).replace(/^\d+_/, '');
            const match = (camps || []).find(
                (c) => c.Facebook_LiveId === liveVideoId || c.Id === videoId
            );
            if (!match) {
                console.warn('[snap] video not found in FB-live list:', liveVideoId);
                return null;
            }
            const startMs = match.DateCreated
                ? (SharedUtils.parseTimestamp(match.DateCreated)?.getTime() ?? null)
                : null;
            // FB Graph /{videoId}/thumbnails (is_preferred) — thay /picture 400.
            const thumbnailUrl = match._thumbnail || null;
            const info = {
                broadcastStartMs: Number.isFinite(startMs) ? startMs : null,
                title: match.Name || null,
                statusLive: match.StatusLive,
                thumbnailUrl,
            };
            _liveVideoInfoCache.set(cacheKey, { info, fetchedAt: Date.now() });
            // Log terse — không in title/thumbnailUrl (log noise + URL signed).
            console.log('[snap] live video info OK — statusLive:', info.statusLive);
            return info;
        } catch (e) {
            console.warn('[snap] fetch live video info fail:', e.message);
            return null;
        }
    }

    // Vanity URL slug check — phải URL-safe (ASCII, no spaces, dots OK).
    // Live Facebook_UserName là DISPLAY NAME (vd "Yến Nhi") → KHÔNG dùng được
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
        // N2Store Extension capture (no popup) — set khi nhận EXTENSION_LOADED
        extReady: false,
        extCapturePending: new Map(), // requestId → { resolve, reject, timer }
    };

    // -----------------------------------------------------
    // N2Store Extension bridge — chrome.tabs.captureVisibleTab via postMessage.
    // Khi extension active, capture frame KHÔNG cần getDisplayMedia popup.
    // Page postMessage('N2_CAPTURE_VISIBLE_TAB') → contentscript → background
    // → captureVisibleTab → dataURL trả về qua postMessage.
    // Yêu cầu extension version >= REQUIRED_EXT_VERSION (host_permission
    // <all_urls> + N2_CAPTURE_VISIBLE_TAB handler).
    // -----------------------------------------------------
    const REQUIRED_EXT_VERSION = '1.0.13';
    function _cmpVersions(a, b) {
        const aa = String(a || '0')
            .split('.')
            .map(Number);
        const bb = String(b || '0')
            .split('.')
            .map(Number);
        for (let i = 0; i < 3; i++) {
            const x = aa[i] || 0;
            const y = bb[i] || 0;
            if (x > y) return 1;
            if (x < y) return -1;
        }
        return 0;
    }

    window.addEventListener('message', (event) => {
        if (event.source !== window) return;
        const data = event.data;
        if (!data || !data.type) return;
        if (data.type === 'EXTENSION_LOADED' && data.from === 'EXTENSION') {
            // Probe version trước khi enable capture path. Outdated extension
            // (chưa có N2_CAPTURE_VISIBLE_TAB) sẽ làm capture fail mỗi 5s.
            console.log('[snap-ext] extension detected — probing version...');
            window.postMessage({ type: 'CHECK_EXTENSION_VERSION' }, '*');
        } else if (data.type === 'EXTENSION_VERSION') {
            STATE.extVersion = data.version;
            const ok = _cmpVersions(data.version, REQUIRED_EXT_VERSION) >= 0;
            if (ok) {
                STATE.extReady = true;
                console.log(`[snap-ext] v${data.version} OK — capture silent qua <all_urls>`);
            } else {
                STATE.extReady = false;
                STATE.extOutdated = true;
                console.warn(
                    `[snap-ext] v${data.version} TOO OLD — cần >= v${REQUIRED_EXT_VERSION}`
                );
            }
        } else if (
            data.type === 'N2_CAPTURE_VISIBLE_TAB_SUCCESS' ||
            data.type === 'N2_CAPTURE_VISIBLE_TAB_FAILURE'
        ) {
            const req = STATE.extCapturePending.get(data.requestId);
            if (!req) return;
            clearTimeout(req.timer);
            STATE.extCapturePending.delete(data.requestId);
            if (data.type === 'N2_CAPTURE_VISIBLE_TAB_SUCCESS') {
                req.resolve(data.dataUrl);
            } else {
                req.reject(new Error(data.error || 'ext capture failed'));
            }
        }
    });

    function _captureViaExtension(quality = 80, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            if (!STATE.extReady) {
                reject(new Error('extension not ready'));
                return;
            }
            const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const timer = setTimeout(() => {
                STATE.extCapturePending.delete(requestId);
                reject(new Error('ext capture timeout'));
            }, timeoutMs);
            STATE.extCapturePending.set(requestId, { resolve, reject, timer });
            window.postMessage({ type: 'N2_CAPTURE_VISIBLE_TAB', requestId, quality }, '*');
        });
    }

    // Capture tab + crop vào iframe wrapper rect → JPEG base64 (không có prefix
    // data:image/jpeg;base64,). Trả về null nếu fail.
    async function _captureExtensionFrame() {
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (!wrapper) return null;
        let dataUrl;
        try {
            dataUrl = await _captureViaExtension(80, 4000);
        } catch (e) {
            // Silent skip cho permission errors (user chưa grant activeTab —
            // bình thường, không cần spam warning). Other errors → log một lần.
            const msg = String(e?.message || e);
            if (!/all_urls|activeTab|permission|invoked/i.test(msg)) {
                console.warn('[snap-ext] capture fail:', msg);
            }
            return null;
        }
        // Load full tab image, crop iframe rect via canvas.
        const img = new Image();
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = () => reject(new Error('image load fail'));
            img.src = dataUrl;
        }).catch(() => null);
        if (!img.naturalWidth) return null;
        const rect = wrapper.getBoundingClientRect();
        // Tab capture trả về vùng visible viewport. Crop bằng rect viewport coords.
        // dpr scaling: nếu image natural lớn hơn viewport thì có scale factor.
        const dpr = img.naturalWidth / window.innerWidth;
        const sx = Math.max(0, Math.round(rect.left * dpr));
        const sy = Math.max(0, Math.round(rect.top * dpr));
        const sw = Math.max(1, Math.round(rect.width * dpr));
        const sh = Math.max(1, Math.round(rect.height * dpr));
        // Target 1280 wide max — giảm size frame.
        const targetW = Math.min(1280, sw);
        const targetH = Math.round((sh / sw) * targetW);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, targetW, targetH);
        const jpeg = canvas.toDataURL('image/jpeg', 0.72);
        return jpeg.split(',')[1] || null;
    }

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
    // Inline frame display LUÔN BẬT — bỏ toggle theo yêu cầu user.
    // Hiển thị frame thật khi có bytea, status badge khi chưa có / pending /
    // drm_blocked / fail. KHÔNG hiển thị thumbnail URL generic.
    function _isInlineThumbOn() {
        return true;
    }
    function _setInlineThumb(_on) {
        // No-op — toggle removed.
        document.querySelectorAll('.live-conversation-item[data-comment-id]').forEach((row) => {
            const cid = row.dataset.commentId;
            if (!cid) return;
            if (STATE.snapByComment.has(cid)) _renderThumbStripFor(cid);
            else _queueSnapByComment(cid);
        });
    }

    // Resolve page object từ allPages dựa trên snap page preference.
    function _resolvePageObj() {
        const st = global.LiveState;
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
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length || !pageObj) return null;
        const sel = st.selectedCampaign;
        if (sel && sel._pageObj?.Facebook_PageId === pageObj.Facebook_PageId) return sel;
        // Tìm campaign matching page, sắp xếp DateCreated desc (mới nhất trước)
        const matching = st.liveCampaigns
            .filter((c) => c.Facebook_UserId === pageObj.Facebook_PageId)
            .sort(
                (a, b) =>
                    SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
            );
        return matching[0] || st.liveCampaigns[0] || null;
    }

    // Tìm campaign đang LIVE (statusLive=1). Ưu tiên: matching pref page > most recent.
    // Dùng cho 1-click "🎬 Bắt đầu chụp live" — auto chọn live đang chạy.
    function _findActiveLiveCampaign() {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return null;
        // Sort by DateCreated desc → live mới nhất trước.
        const sorted = [...st.liveCampaigns].sort(
            (a, b) => SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
        );
        // Ưu tiên live của page pref (Store/House).
        const pref = _getSnapPagePref();
        const prefMatch = sorted.find((c) => {
            const pageObj = st.allPages?.find((p) => p.Facebook_PageId === c.Facebook_UserId);
            if (!pageObj) return false;
            const n = (pageObj.Name || '').toLowerCase();
            return pref === 'house' ? n.includes('house') : n.includes('store');
        });
        return prefMatch || sorted[0] || null;
    }

    // Build URL FB live page video — dùng vanity slug nếu có.
    function _buildFbLiveUrl(camp) {
        if (!camp?.Facebook_LiveId) return null;
        const st = global.LiveState;
        const pageObj = st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        const slug = _resolvePageVanity(pageObj) || camp.Facebook_UserId;
        const videoIdShort = String(camp.Facebook_LiveId).replace(/^\d+_/, '');
        return `https://www.facebook.com/${slug}/videos/${videoIdShort}/`;
    }

    // Resolve TOP-2 latest campaigns across ALL pages (user req 2026-05-23).
    // Cho auto-snap: nếu comment đến từ comment.from.id thuộc page A,
    // match campaign của page A trong top 2. Fallback campaign top 1.
    function _resolveTopCampaigns(limit = 2) {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return [];
        return st.liveCampaigns
            .slice()
            .sort(
                (a, b) =>
                    SharedUtils.toEpochMs(b.DateCreated) - SharedUtils.toEpochMs(a.DateCreated)
            )
            .slice(0, limit);
    }

    // Resolve campaign cho 1 comment cụ thể (auto-snap path):
    // 1. Nếu comment._campaignId set → dùng (đã match từ live-init)
    // 2. Else match qua comment._pageId với top-2 campaigns
    // 3. Fallback campaign mới nhất
    function _resolveCampaignForComment(comment) {
        const st = global.LiveState;
        if (!st?.liveCampaigns?.length) return null;
        // Path 1: comment đã có _campaignId
        // ⚠ DB rows: _campaignId = web2_live_parent_campaigns id (chiến dịch CHA),
        // KHÔNG cùng id-space với liveCampaigns (FB video) → thường không match,
        // giữ cho comment live-fetch cũ.
        if (comment._campaignId) {
            const found = st.liveCampaigns.find((c) => c.Id === comment._campaignId);
            if (found) return found;
        }
        // Path 1.5 (FIX 2026-06-11): match theo BÀI — DB comment có _postId,
        // Live campaign (FB video) Id/Facebook_LiveId cùng format `pageId_videoId`.
        // Thiếu path này: 2 live cùng 1 page → Path 2 (match page) chọn SAI video
        // → force extract seek nhầm VOD → thumbnail sai hàng loạt.
        const postId = String(comment._postId || comment.post_id || '');
        if (postId) {
            const short = postId.replace(/^\d+_/, '');
            const byPost = st.liveCampaigns.find((c) => {
                const lid = String(c.Facebook_LiveId || '');
                const cid = String(c.Id || '');
                return (
                    lid === postId ||
                    cid === postId ||
                    (short &&
                        (lid.replace(/^\d+_/, '') === short || cid.replace(/^\d+_/, '') === short))
                );
            });
            if (byPost) return byPost;
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

    // 2026-06-02: silent mode cho snap success toasts (user spec: "không cần
    // thông báo khi snap shot và chụp hình"). Chỉ ẩn 'ok'/'success' của snap
    // module — error vẫn show để user biết khi fail. Log console giữ debug trace.
    function _toast(msg, type = 'ok') {
        if (type === 'err' || type === 'error') {
            if (global.notificationManager?.show) {
                global.notificationManager.show(msg, 'error');
            } else {
                console.log('[snap-toast]', type, msg);
            }
            return;
        }
        // Success/ok/info: console-only, no UI notification.
        console.log('[snap-toast]', type, msg);
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

    // Hover zoom preview cho thumbnail snapshot. Floating 480x270 cạnh thumb,
    // auto-flip sang trái nếu overflow viewport. Shared single element để
    // tránh leak DOM.
    function _showZoomPreview(img) {
        if (!img?.src) return;
        let zoom = document.getElementById('live-snap-zoom-preview');
        if (!zoom) {
            zoom = document.createElement('div');
            zoom.id = 'live-snap-zoom-preview';
            zoom.style.cssText =
                'position:fixed;z-index:99500;pointer-events:none;box-shadow:0 16px 48px rgba(0,0,0,0.45);border-radius:10px;background:#000;overflow:hidden;border:2px solid #fff;';
            document.body.appendChild(zoom);
        }
        // Box auto-fit aspect ratio thật của ảnh, contain để không crop.
        // Cap kích thước theo viewport (75% width, 80% height) để luôn vừa.
        const MAX_W = Math.min(720, Math.floor(window.innerWidth * 0.6));
        const MAX_H = Math.min(720, Math.floor(window.innerHeight * 0.8));
        let bigImg = zoom.querySelector('img');
        if (!bigImg || bigImg.src !== img.src) {
            zoom.innerHTML = '';
            bigImg = document.createElement('img');
            bigImg.src = img.src;
            bigImg.style.cssText = `max-width:${MAX_W}px;max-height:${MAX_H}px;width:auto;height:auto;object-fit:contain;display:block;`;
            zoom.appendChild(bigImg);
        } else {
            bigImg.style.maxWidth = MAX_W + 'px';
            bigImg.style.maxHeight = MAX_H + 'px';
        }
        // Đo kích thước thật của zoom (sau khi ảnh fit) để position chính xác.
        const zoomW = zoom.offsetWidth || MAX_W;
        const zoomH = zoom.offsetHeight || MAX_H;
        const rect = img.getBoundingClientRect();
        let left = rect.right + 12;
        if (left + zoomW > window.innerWidth - 8) {
            left = rect.left - 12 - zoomW;
        }
        if (left < 8) left = 8;
        let top = rect.top + rect.height / 2 - zoomH / 2;
        top = Math.max(8, Math.min(window.innerHeight - zoomH - 8, top));
        zoom.style.left = left + 'px';
        zoom.style.top = top + 'px';
        zoom.style.display = 'block';
    }
    function _hideZoomPreview() {
        const zoom = document.getElementById('live-snap-zoom-preview');
        if (zoom) zoom.style.display = 'none';
    }

    // -----------------------------------------------------
    // Header chip — Snap page selector
    // -----------------------------------------------------
    // Find/create a floating host container ở góc trên live-chat page khi
    // không có header thật để mount chip. Cách này đảm bảo chip luôn hiển thị.
    function _ensureFloatingHost() {
        let host = document.getElementById('live-snap-floating-host');
        if (host) return host;
        host = document.createElement('div');
        host.id = 'live-snap-floating-host';
        // Ưu tiên mount vào topbar (#liveSnapSlot) — IN-FLOW, KHÔNG fixed → không
        // đè lên nút Pancake/CK bên phải (fix 2026-06-09). Fallback: floating cũ.
        const slot = document.getElementById('liveSnapSlot');
        if (slot) {
            host.style.cssText = 'display:inline-flex;gap:6px;align-items:center;flex-wrap:wrap;';
            slot.appendChild(host);
        } else {
            host.style.cssText =
                'position:fixed;top:8px;right:8px;z-index:1000;display:flex;gap:6px;align-items:center;background:rgba(255,255,255,0.95);padding:4px 6px;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.12);';
            document.body.appendChild(host);
        }
        return host;
    }
    function ensureHeaderChip() {
        let chip = document.getElementById('live-snap-page-chip');
        if (chip) return chip;
        // Try mount in Live header area; fallback floating host (always visible).
        const host =
            document.querySelector('.live-header-bar') ||
            document.querySelector('.live-toolbar') ||
            document.querySelector('#liveCommentHeader') ||
            _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-page-chip';
        chip.className = 'live-snap-page-chip';
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
        const chip = document.getElementById('live-snap-page-chip');
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
        let chip = document.getElementById('live-snap-real-chip');
        if (chip) return chip;
        const host =
            document.querySelector('.live-header-bar') ||
            document.querySelector('.live-toolbar') ||
            document.querySelector('#liveCommentHeader') ||
            _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-real-chip';
        chip.className = 'live-snap-real-chip';
        chip.style.cssText =
            'display:none;align-items:center;gap:6px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;margin-left:6px;user-select:none;';
        // Click chip = đổi mode (NOT toggle stream). Stream tự bật khi user
        // click 📸 trong mode='live' (lazy initialization, OS picker chỉ hiện
        // khi cần thật sự).
        chip.addEventListener('click', async () => {
            // Click 🎬 = 1-click toggle. Dùng EMBEDDED iframe FB live (no tab
            // switch). Nếu đã share/ext-capture → stop + remove iframe.
            if (STATE.captureStream || STATE.frameBufferTimer) {
                stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                _setSnapMode(MODE_LAZY);
                _toast('⏱️ Đã ngắt — auto-snap dùng metadata only', 'ok');
                return;
            }
            _setSnapMode(MODE_LIVE);
            await _enableEmbeddedLiveCapture({ interactive: true });
        });
        host.appendChild(chip);
        renderRealSnapChip();
        renderAutoModeChip();
        return chip;
    }
    function renderRealSnapChip() {
        const chip = document.getElementById('live-snap-real-chip');
        if (!chip) return;
        const streamReady = !!STATE.captureStream || !!STATE.frameBufferTimer;
        const bufSize = STATE.frameBuffer?.length || 0;
        const viaExtTab = STATE.extReady && !STATE.captureStream && !!STATE.frameBufferTimer;
        if (streamReady) {
            const sourceLabel = viaExtTab ? 'EXT tab' : 'LIVE linked';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> 🎬 ${sourceLabel} · ${bufSize} frames`;
            chip.style.background = '#fee2e2';
            chip.style.borderColor = '#fca5a5';
            chip.style.color = '#991b1b';
            chip.title = viaExtTab
                ? `Extension visible tab — chỉ capture khi live-chat là tab focused. Switch tab khác → capture dừng (browser security).`
                : `Stream FB đang link. Mỗi 5s capture 1 frame vào buffer (giữ 1h). Click chip để NGẮT stream.`;
        } else if (STATE.lockBlockedBy) {
            chip.innerHTML = `📵 Máy "<strong>${_esc(STATE.lockBlockedBy)}</strong>" đang chụp`;
            chip.style.background = '#f1f5f9';
            chip.style.borderColor = '#cbd5e1';
            chip.style.color = '#475569';
            chip.title = `Máy khác đang giữ capture (1 máy duy nhất để không đè dữ liệu).\nClick nếu muốn CHUYỂN capture sang máy này — máy kia sẽ tự dừng.`;
        } else {
            chip.innerHTML = `🎬 Bắt đầu chụp live · click 1 cái mở FB + share`;
            chip.style.background = '#fef3c7';
            chip.style.borderColor = '#fcd34d';
            chip.style.color = '#92400e';
            chip.title = `Click: tự mở tab FB live + 3s sau prompt share. Sau khi share, frame buffer chạy → mọi auto-snap dùng frame thật. Không cần làm gì thêm.`;
        }
    }

    // Update buffer count trong chip mỗi 5s — timer start/stop theo frame buffer
    // (_startFrameBuffer/_stopFrameBuffer), KHÔNG chạy module-eval mãi mãi.

    // -----------------------------------------------------
    // Auto-mode chip — khi mới có comment, tự động snap
    // -----------------------------------------------------
    function ensureAutoModeChip() {
        let chip = document.getElementById('live-snap-auto-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        // Ép Auto luôn ON, không cho user toggle (yêu cầu UX: tự động chạy).
        if (!_isAutoMode()) _setAutoMode(true);
        chip = document.createElement('div');
        chip.id = 'live-snap-auto-chip';
        // Auto luôn ON (không toggle) → ẩn chip status "Auto: ON (offset)·0" để
        // không đè giao diện (2026-06-09). Giữ trong DOM (mount loop + render OK).
        chip.style.cssText =
            'display:none !important;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;user-select:none;';
        host.appendChild(chip);
        renderAutoModeChip();
        return chip;
    }
    function renderAutoModeChip() {
        const chip = document.getElementById('live-snap-auto-chip');
        if (!chip) return;
        const on = _isAutoMode();
        const streamOk = !!STATE.captureStream;
        if (on) {
            const pathLabel = streamOk ? '🎬 stream' : '⏱ offset';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#16a34a;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> Auto: <strong>ON</strong> (${pathLabel}) · ${STATE.autoStats.total}`;
            chip.style.background = '#dcfce7';
            chip.style.borderColor = '#86efac';
            chip.style.color = '#166534';
            chip.title = `Auto-snap ON (luôn bật).
Path: ${streamOk ? 'real-frame từ FB tab share (chính xác moment)' : 'offset computed từ commentTime + broadcastStart (chính xác giây)'}
Session: ${STATE.autoStats.total} OK, ${STATE.autoStats.throttled} throttled, ${STATE.autoStats.errors} errors.
Throttle 30s/KH.`;
        } else {
            chip.innerHTML = `🤖 Auto: <strong>OFF</strong> · click bật`;
            chip.style.background = '#f3f4f6';
            chip.style.borderColor = '#d1d5db';
            chip.style.color = '#374151';
            chip.title =
                'Auto OFF. Click bật: mỗi comment mới tự snap với offset chính xác (không cần FB tab share).';
        }
    }

    // Toggle chip REMOVED — inline frame display luôn bật (user req
    // 'bỏ hết chức năng lấy thumbnail').
    function ensureInlineThumbChip() {
        return null;
    }
    function renderInlineThumbChip() {}

    // -----------------------------------------------------
    // Feature 2 — Offline batch backfill snapshots
    // Compute offsetSec = (commentTime - broadcastStart) / 1000, gửi
    // POST /offline-batch để backend lưu (background-style, không cần stream).
    // -----------------------------------------------------
    function _isStaffComment(c) {
        const st = global.LiveState;
        const fid = String(c?.from?.id || '');
        if (!fid) return false;
        // FIX 2026-06-11: multi-page mode selectedPage chỉ là 1 page → so riêng
        // selectedPage BỎ SÓT comment do page KHÁC đăng (đo thật: 830 comment
        // "NhiJudy Store" lọt khi selectedPage=House → force extract chụp vô ích
        // + harvest page vào kho KH). Check _pageId của chính comment + mọi page.
        if (c._pageId && fid === String(c._pageId)) return true;
        if (fid === String(st?.selectedPage?.Facebook_PageId || '')) return true;
        return (st?.allPages || []).some((p) => String(p.Facebook_PageId) === fid);
    }

    async function offlineBatchAll(opts) {
        opts = opts || {};
        // silent: auto-run (offline campaign load) → không toast lỗi/progress.
        const toast = (m, t) => {
            if (!opts.silent) _toast(m, t);
        };
        const st = global.LiveState;
        // 3H9 FIX (2026-06-12): group comment theo campaign/video của CHÍNH
        // comment đó (_resolveCampaignForComment — match _postId trước) như
        // vòng byVideo của Force extract, thay vì 1 pageObj + 1 campaign + 1
        // broadcastStartMs cho TẤT CẢ → multi-campaign (House + Store cùng lúc)
        // hết cảnh comment live page kia bị tính offset theo video page này
        // (snapshot sai video + sai giây hàng loạt, auto-trigger silent).
        // Cũng lọc người-bị-ẩn cho nhất quán với Force extract (1D).
        const allComments = (st?.comments || []).filter(
            (c) => c.from?.id && !_isStaffComment(c) && !global.LiveHiddenCommenters?.isHidden?.(c)
        );
        const comments = opts.customerFbUserId
            ? allComments.filter((c) => c.from.id === opts.customerFbUserId)
            : allComments;
        if (!comments.length) {
            toast(
                opts.customerFbUserId
                    ? 'KH không có comment trong campaign hiện tại'
                    : 'Không có comment nào để backfill',
                'err'
            );
            return;
        }
        const byVideo = new Map();
        let unresolved = 0;
        for (const c of comments) {
            const camp = _resolveCampaignForComment(c);
            const liveVideoId = camp?.Facebook_LiveId || null;
            if (!liveVideoId) {
                unresolved++;
                continue;
            }
            if (!byVideo.has(liveVideoId)) byVideo.set(liveVideoId, { camp, comments: [] });
            byVideo.get(liveVideoId).comments.push(c);
        }
        if (!byVideo.size) {
            toast('Không resolve được campaign/video cho comment nào', 'err');
            return;
        }
        toast(
            `🔄 Đang backfill ${comments.length - unresolved} comments / ${byVideo.size} video...`,
            'ok'
        );
        const totals = { created: 0, skipped: 0, failed: unresolved };
        const touchedIds = new Set();
        try {
            for (const { camp, comments: group } of byVideo.values()) {
                const pageObj =
                    st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) ||
                    _resolvePageObj();
                let videoInfo = null;
                if (pageObj) {
                    try {
                        videoInfo = await _fetchLiveVideoInfo(
                            pageObj.Facebook_PageId,
                            camp.Facebook_LiveId
                        );
                    } catch (_) {}
                }
                if (!pageObj || !videoInfo?.broadcastStartMs) {
                    totals.failed += group.length;
                    continue;
                }
                const payload = {
                    pageId: pageObj.Facebook_PageId,
                    pageName: pageObj.Name,
                    pageUsername: _resolvePageVanity(pageObj),
                    liveCampaignId: camp.Id ? String(camp.Id) : null,
                    liveVideoId: camp.Facebook_LiveId,
                    broadcastStartMs: videoInfo.broadcastStartMs,
                    // KHÔNG pass thumbnailUrl generic — backfill / auto offline chỉ lưu
                    // metadata. User dùng '📸 Chụp' per comment để fill ảnh thật.
                    thumbnailUrl: undefined,
                    comments: group.map((c) => {
                        const raw =
                            c.created_time || c.createdTime || c.inserted_at || c.created_at;
                        const t = raw ? (SharedUtils.parseTimestamp(raw)?.getTime() ?? NaN) : NaN;
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
                const r = await fetch(API + '/api/livestream/offline-batch', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify(payload),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'batch failed');
                totals.created += d.summary?.created || 0;
                totals.skipped += d.summary?.skipped || 0;
                totals.failed += d.summary?.failed || 0;
                group.forEach((c) => touchedIds.add(c.from.id));
            }
            toast(
                `✅ Backfill: ${totals.created} mới, ${totals.skipped} đã có, ${totals.failed} fail`,
                totals.failed > 0 ? 'err' : 'ok'
            );
            refreshCounts(Array.from(touchedIds));
            return { success: true, summary: totals };
        } catch (e) {
            toast('Lỗi backfill: ' + e.message, 'err');
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
            // KHÔNG pass thumbnailUrl generic — backfill / auto offline chỉ lưu metadata.
            // User dùng button '📸 Chụp' per comment để fill ảnh thật từ FB tab.
            thumbnailUrl: undefined,
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

    // Force extract pending — re-trigger backend yt-dlp+ffmpeg cho mọi snap
    // không có bytea (pending/fail/live_active/null). Useful khi live vừa end
    // + biết FB đã có VOD nhưng cron retry hourly chưa chạy.
    function ensureForceExtractChip() {
        let chip = document.getElementById('live-snap-force-extract-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-force-extract-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:4px;padding:4px 10px;background:#fef3c7;border:1px solid #fde68a;border-radius:14px;font-size:12px;font-weight:600;color:#92400e;cursor:pointer;user-select:none;';
        chip.innerHTML = `⚡ <strong>Force extract</strong>`;
        chip.title =
            'Force backend re-extract tất cả snap không có bytea (yt-dlp + ffmpeg).\nFilter theo live hiện tại nếu có, không thì all.\nUseful khi live vừa end + VOD đã có nhưng cron 1h chưa chạy.';
        const _resetChip = () => {
            chip.innerHTML = `⚡ <strong>Force extract</strong>`;
            chip.dataset.running = '';
            chip.style.opacity = '1';
            chip.style.pointerEvents = 'auto';
            chip.style.background = '#fef3c7';
            chip.style.borderColor = '#fde68a';
            chip.style.color = '#92400e';
        };
        const _renderProgress = (s, total) => {
            const done = s.done || 0;
            const failed = s.failed || 0;
            const drm = s.drmBlocked || 0;
            const live = s.liveActive || 0;
            const finished = done + failed + drm + live;
            const pct = Math.round((finished / Math.max(1, total)) * 100);
            const parts = [
                done > 0 ? `${done}✓` : '',
                failed > 0 ? `${failed}✗` : '',
                drm > 0 ? `${drm}🔒` : '',
                live > 0 ? `${live}🔴` : '',
            ]
                .filter(Boolean)
                .join(' ');
            chip.innerHTML = `⚡ ${finished}/${total} (${pct}%) <small style="opacity:0.75;">${parts}</small>`;
            chip.style.background = '#dbeafe';
            chip.style.borderColor = '#93c5fd';
            chip.style.color = '#1e40af';
        };
        // CLIENT-SIDE force extract (2026-06-06): backend yt-dlp/Graph bị FB chặn
        // (xem _clientCaptureAtOffset). Browser có FB auth → seek iframe VOD +
        // capture từng comment. Chỉ chạy comment CHƯA có thumbnail thật.
        chip.addEventListener('click', async () => {
            if (chip.dataset.running === '1') {
                _toast('Đang chạy — đợi xong rồi click lại', 'ok');
                return;
            }
            const st = global.LiveState;
            // Gom KH từ comment vào kho KH (web2_customers) — song song, không
            // chặn image flow. Backend KHÔNG ghi đè SĐT/địa chỉ/tên sẵn có:
            // trùng SĐT → thêm alt_phones (chính giữ nguyên), field rỗng mới fill.
            try {
                window.LiveColumnManager?._harvestCommentCustomers?.(
                    (st?.comments || []).filter(
                        (c) =>
                            c.from?.id &&
                            !_isStaffComment(c) &&
                            !global.LiveHiddenCommenters?.isHidden?.(c)
                    )
                )
                    .then((j) => {
                        if (j && (j.created || j.altAdded || j.filled || j.linked)) {
                            _toast(
                                `Kho KH: +${j.created || 0} mới, ` +
                                    `+${(j.altAdded || 0) + (j.filled || 0) + (j.linked || 0)} cập nhật`,
                                'ok'
                            );
                        }
                    })
                    .catch(() => {});
            } catch (_) {}
            // Pending = comment (non-staff, không bị ẩn) chưa có ảnh bytea thật.
            const pending = (st?.comments || []).filter((c) => {
                if (!c.from?.id || _isStaffComment(c)) return false;
                if (global.LiveHiddenCommenters?.isHidden?.(c)) return false;
                const snap = STATE.snapByComment.get(c.id);
                return !(snap?.thumbnailUrl || '').includes('/api/livestream/snapshot/');
            });
            if (!pending.length) {
                _toast('Tất cả comment đã có thumbnail rồi', 'ok');
                return;
            }
            if (!STATE.extReady && !STATE.captureStream) {
                _toast('Chưa có capture — mở live + bật capture trước đã', 'err');
                return;
            }
            if (
                !confirm(
                    `Chụp thumbnail client-side cho ${pending.length} comment chưa có ảnh?\n` +
                        `(seek VOD + capture ~3-4s/comment, chỉ ăn khi live đã end)`
                )
            )
                return;
            chip.dataset.running = '1';
            chip.style.opacity = '0.85';
            chip.style.pointerEvents = 'none';

            // Group theo video (Facebook_LiveId) — mỗi video seek iframe riêng.
            const byVideo = new Map();
            for (const c of pending) {
                const camp = _resolveCampaignForComment(c);
                if (!camp?.Facebook_LiveId) continue;
                const k = camp.Facebook_LiveId;
                if (!byVideo.has(k)) byVideo.set(k, { camp, comments: [] });
                byVideo.get(k).comments.push(c);
            }
            const total = pending.length;
            let done = 0;
            let failed = 0;
            const activeCamp = _findActiveLiveCampaign();
            try {
                for (const { camp, comments } of byVideo.values()) {
                    const pageObj = st.allPages?.find(
                        (p) => p.Facebook_PageId === camp.Facebook_UserId
                    );
                    let videoInfo = null;
                    if (pageObj) {
                        try {
                            videoInfo = await _fetchLiveVideoInfo(
                                pageObj.Facebook_PageId,
                                camp.Facebook_LiveId
                            );
                        } catch (_) {}
                    }
                    if (!pageObj || !videoInfo?.broadcastStartMs) {
                        failed += comments.length;
                        _renderProgress({ done, failed }, total);
                        continue;
                    }
                    for (const c of comments) {
                        const rawT =
                            c.created_time || c.createdTime || c.inserted_at || c.created_at;
                        const commentTimeMs = rawT
                            ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN)
                            : NaN;
                        if (!Number.isFinite(commentTimeMs)) {
                            failed++;
                            _renderProgress({ done, failed }, total);
                            continue;
                        }
                        const offsetSec = Math.max(
                            0,
                            Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
                        );
                        try {
                            const imageBase64 = await _clientCaptureAtOffset(camp, offsetSec);
                            if (!imageBase64) throw new Error('capture rỗng');
                            await _postCapturedSnap({
                                commentId: c.id,
                                customerFbUserId: c.from.id,
                                customerName: c.from.name || '?',
                                commentTimeMs,
                                offsetSec,
                                pageObj,
                                camp,
                                videoInfo,
                                imageBase64,
                                message: c.message,
                            });
                            done++;
                        } catch (e) {
                            failed++;
                            console.warn('[force-client] fail', c.id, e.message);
                        }
                        _renderProgress({ done, failed }, total);
                    }
                }
                _toast(`Client extract: ${done} OK, ${failed} fail`, done > 0 ? 'ok' : 'err');
            } catch (e) {
                _toast('Lỗi force extract: ' + e.message, 'err');
            } finally {
                try {
                    if (activeCamp) await _clientRestoreLive(activeCamp);
                } catch (_) {}
                _invalidateSnapCacheAndRefresh();
                setTimeout(_resetChip, 2500);
            }
        });
        host.appendChild(chip);
        return chip;
    }

    // Silent variant của Force extract — không confirm dialog, không update
    // chip UI, không toast verbose. Dùng cho auto-trigger khi user quay lại
    // tab sau tab inactive (capture không chạy → thumbnail rỗng → tự fill).
    // Re-entrant guard tránh chạy đè nhau khi user switch nhiều lần liên tiếp.
    async function _runSilentForceExtract() {
        if (STATE._silentExtractRunning) return;
        STATE._silentExtractRunning = true;
        // Gom KH từ comment vào kho (silent, throttle 60s tránh spam khi user
        // switch tab liên tục). Backend KHÔNG ghi đè dữ liệu chính sẵn có.
        try {
            const nowH = Date.now();
            if (nowH - (STATE._lastHarvestTs || 0) > 60_000) {
                STATE._lastHarvestTs = nowH;
                window.LiveColumnManager?._harvestCommentCustomers?.(
                    (global.LiveState?.comments || []).filter(
                        (c) =>
                            c.from?.id &&
                            !_isStaffComment(c) &&
                            !global.LiveHiddenCommenters?.isHidden?.(c)
                    )
                ).catch(() => {});
            }
        } catch (_) {}
        try {
            const camp = _findActiveLiveCampaign();
            const pageObj = _resolvePageObj();
            if (!camp?.Facebook_LiveId || !pageObj?.Facebook_PageId) {
                return; // không có live active → bỏ qua
            }
            // Step 1: backfill metadata cho comments visible (silent — background
            // run không toast lỗi lên UI, chỉ log).
            try {
                await offlineBatchAll({ skipExisting: true, silent: true });
            } catch (e) {
                console.warn('[snap-auto-extract] backfill fail:', e?.message);
            }
            // Step 2: queue extract-all-pending
            const r = await fetch(API + '/api/livestream/extract-all-pending', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({
                    liveVideoId: camp.Facebook_LiveId,
                    pageId: pageObj.Facebook_PageId,
                }),
            });
            const d = await r.json();
            if (!d.success || d.queued === 0) {
                // Vẫn refresh cache để pickup thumbs vừa được fill bytea bởi
                // các client khác / cron / previous extract batch.
                _invalidateSnapCacheAndRefresh();
                return;
            }
            _toast(`⚡ Auto-fill ${d.queued} thumbnails (tab inactive)...`, 'ok');
            // Step 3: poll status, max 5 phút (silent flow ngắn hơn manual 10min)
            const batchId = d.batchId;
            const total = d.queued;
            const startMs = Date.now();
            await new Promise((resolve) => {
                const pollTimer = setInterval(async () => {
                    if (Date.now() - startMs > 5 * 60 * 1000) {
                        clearInterval(pollTimer);
                        resolve();
                        return;
                    }
                    try {
                        // timeout 5s — fetch treo không được giữ Promise sống
                        // quá wall-clock 5 phút ở check trên.
                        const sr = await fetch(
                            API +
                                '/api/livestream/extract-status?batchId=' +
                                encodeURIComponent(batchId),
                            { signal: AbortSignal.timeout(5000) }
                        );
                        const sd = await sr.json();
                        if (!sd.success || !sd.status) {
                            clearInterval(pollTimer);
                            resolve();
                            return;
                        }
                        const s = sd.status;
                        const finished =
                            (s.done || 0) +
                            (s.failed || 0) +
                            (s.drmBlocked || 0) +
                            (s.liveActive || 0);
                        if (finished >= total) {
                            clearInterval(pollTimer);
                            if (s.done > 0) {
                                _toast(`✅ Fill xong ${s.done} thumbnails`, 'ok');
                            }
                            _invalidateSnapCacheAndRefresh();
                            resolve();
                        }
                    } catch (_) {
                        // ignore, retry next tick
                    }
                }, 2000);
            });
        } finally {
            STATE._silentExtractRunning = false;
        }
    }

    function ensureBackfillChip() {
        let chip = document.getElementById('live-snap-backfill-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'live-snap-backfill-chip';
        // ẨN visually — auto-snap on new comment + Force extract pending đã đủ
        // bao phủ flow thường. Backfill chỉ cần khi user join late + chưa có
        // user khác chụp. Giữ chức năng + handlers (revive bằng đổi display).
        chip.style.cssText =
            'display:none;align-items:center;gap:4px;padding:4px 10px;background:#ede9fe;border:1px solid #c4b5fd;border-radius:14px;font-size:12px;font-weight:600;color:#6d28d9;cursor:pointer;user-select:none;';
        chip.innerHTML = `🔄 <strong>Backfill</strong>`;
        chip.title =
            'Click: backfill snap cho mọi comment hiện tại (offset chính xác qua broadcast_start). Shift+click: manual nhập time + KH.';
        chip.addEventListener('click', async (e) => {
            if (e.shiftKey) {
                await offlineManualSnap();
                return;
            }
            const total = (global.LiveState?.comments || []).filter(
                (c) => c.from?.id && !_isStaffComment(c)
            ).length;
            if (!confirm(`Backfill ${total} comments? (skip những comment đã có snap)`)) return;
            await offlineBatchAll({ skipExisting: true });
        });
        host.appendChild(chip);
        return chip;
    }

    // -----------------------------------------------------
    // Auto-snap handler — gắn vào eventBus.on('live:newComment')
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
        // Dedup multi-client: nếu local cache đã có snap với bytea cho commentId
        // → skip POST. Backend DB unique constraint cũng dedup, đây là optimization
        // để giảm POST + giảm capture wasted khi nhiều máy mở cùng trang.
        const existingSnap = STATE.snapByComment.get(commentId);
        if (existingSnap?.thumbnailUrl?.includes('/api/livestream/snapshot/')) {
            console.log('[snap-auto] skip — snap đã có bytea cho commentId', commentId);
            return;
        }
        // User feedback 2026-05-26: bỏ throttle per-customer (trước đây 30s/KH)
        // → mỗi comment unique đều snap, không drop. Dedup đã có ở line trên
        // qua commentId (existingSnap check + backend DB unique constraint).
        // Spam capture không vấn đề vì:
        //   1. commentId unique → backend dedup, không tạo bản ghi trùng
        //   2. Chrome rate-limit captureVisibleTab ~2/sec — đủ rộng
        //   3. Throttle per-customer chặn quá tay khi KH spam 2-3 comment liền
        STATE.autoLastSnap.set(customerFbUserId, Date.now());
        try {
            // "Chỉ chụp tab đang xem": extension đã sẵn + iframe live đã nhúng +
            // tab đang hiển thị → capture frame visible tab (KHÔNG cần share màn
            // hình / buffer mode). Đây là path ưu tiên khi user xem tab live-chat.
            const canExtTabCapture =
                STATE.extReady &&
                !document.hidden &&
                !!document.getElementById('live-snap-fb-wrapper');
            const hasBufferedFrames =
                (STATE.captureStream && STATE.captureVideo?.videoWidth) ||
                (STATE.frameBufferTimer && STATE.frameBuffer?.length > 0) ||
                canExtTabCapture;
            if (hasBufferedFrames) {
                // Path 1: real-frame capture từ FB tab đã share / extension.
                // Pass comment.created_time để offset_seconds tính từ moment
                // comment, không phải thời điểm capture frame.
                const rawT =
                    comment.created_time ||
                    comment.createdTime ||
                    comment.inserted_at ||
                    comment.created_at;
                const parsedT = rawT ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN) : NaN;
                const commentTimeMs = Number.isFinite(parsedT) ? parsedT : Date.now();
                // Lookup buffered frame nearest commentTime. Window 60s (mỗi
                // tick 5s → 12 frames/min, đủ wiggle room cho clock skew giữa
                // FB timestamp và browser local). Comment cũ > 60s → no match.
                let buffered = _findNearestBufferedFrame(commentTimeMs, 60000);
                // Fallback ext mode: nếu buffer rỗng / quá cũ → capture NOW
                // qua extension thay vì gửi snap rỗng (snap không có bytea =
                // không thumbnail). Chrome rate-limit tabs.captureVisibleTab
                // ~2/sec, OK với throttle 30s/KH.
                if (!buffered && STATE.extReady) {
                    try {
                        const jpegBase64 = await _captureExtensionFrame();
                        if (jpegBase64) {
                            buffered = { capturedAt: Date.now(), blob: _base64ToBlob(jpegBase64) };
                            // Inject vào buffer luôn để comment sau dùng được.
                            STATE.frameBuffer?.push(buffered);
                            console.log(
                                '[snap-auto] ext live-capture fallback (buffer empty/stale)'
                            );
                        }
                    } catch (e) {
                        console.warn('[snap-auto] ext fallback capture fail:', e.message);
                    }
                }
                await snap(customerFbUserId, customerName, commentId, null, {
                    commentTime: commentTimeMs,
                    comment,
                    bufferedFrame: buffered, // pass for snap() to use instead of capturing current
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
                const parsed = rawTime
                    ? (SharedUtils.parseTimestamp(rawTime)?.getTime() ?? NaN)
                    : NaN;
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
            // Visible feedback: toast khi auto-snap thành công + auto-trigger
            // backend extract-frame (path 2) để fill bytea trong background.
            _toast(`🤖 Auto-snap: ${customerName}`, 'ok');
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
        const st = global.LiveState;
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
            // FB CDN signed URL từ Live (FB Graph picture endpoint trả 400)
            // KHÔNG pass thumbnailUrl generic — backfill / auto offline chỉ lưu metadata.
            // User dùng button '📸 Chụp' per comment để fill ảnh thật từ FB tab.
            thumbnailUrl: undefined,
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
        // Auto-trigger backend extract-frame cho snap vừa tạo (path 2:
        // yt-dlp + ffmpeg lấy frame thật) — fire-and-forget. SSE 'extract-done'
        // sẽ refresh thumb khi xong.
        const newSnapId = d.created?.[0]?.snapshotId;
        if (newSnapId) {
            fetch(API + '/api/livestream/extract-frame', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({ snapshotIds: [Number(newSnapId)] }),
            }).catch(() => {});
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

    // -----------------------------------------------------
    // CAPTURE LEADER LOCK — chỉ 1 MÁY capture tại 1 thời điểm (2026-06-11).
    // Nhiều máy cùng mở live-chat → nhiều nguồn frame POST đè dữ liệu snapshot
    // lẫn nhau. Server CAS atomic: POST /acquire (cũng là heartbeat — gọi lại
    // cùng holder = renew ts), POST /release. TTL 90s + heartbeat 30s.
    // SSE 'web2:capture-lock' → máy bị cướp lock TỰ DỪNG.
    // -----------------------------------------------------
    const LOCK_TTL_MS = 90 * 1000;
    const LOCK_HEARTBEAT_MS = 30 * 1000;
    // Quá lâu không có frame thật nào vào buffer (tab unfocused với captureVisible
    // Tab, screen lock, stream chết, modal Enter chưa bấm) → leader KHÔNG được
    // giữ lock nữa: heartbeat tự nhả để máy khác takeover. 75s = heartbeat tick
    // thứ 3 (90s) sau khi frame cuối — đủ rộng cho startup iframe ~10s + blip.
    const LOCK_CAPTURE_STALL_MS = 75 * 1000;
    function _lockApiBase() {
        return (
            global.LiveState?.workerUrl ||
            global.API_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function _machineId() {
        let id = localStorage.getItem('web2_capture_machine_id');
        if (!id) {
            id = 'm_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
            localStorage.setItem('web2_capture_machine_id', id);
        }
        return id;
    }
    // Holder = máy + tab. localStorage machineId share giữa các tab cùng profile
    // → 2 tab cùng tưởng mình giữ lock. sessionStorage tabId tách per-tab.
    function _tabId() {
        let id = sessionStorage.getItem('web2_capture_tab_id');
        if (!id) {
            id = 't_' + Math.random().toString(36).slice(2, 10);
            sessionStorage.setItem('web2_capture_tab_id', id);
        }
        return id;
    }
    function _holderId() {
        return _machineId() + ':' + _tabId();
    }
    async function _lockFetch(path, opts) {
        const r = await fetch(`${_lockApiBase()}/api/web2/capture-lock${path}`, opts);
        return r.json().catch(() => ({}));
    }
    // Đọc lock state hiện tại (chỉ để display/decision — KHÔNG dùng cho acquire).
    async function _readLock() {
        try {
            const j = await _lockFetch('/get/global');
            return j?.record?.data || null;
        } catch (_) {
            return null;
        }
    }
    // POST /acquire — server CAS atomic. force:true = cướp lock vô điều kiện.
    async function _postAcquire(force) {
        return _lockFetch('/acquire', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                holder: _holderId(),
                holderName: _user()?.name || _machineId(),
                force: !!force,
                ttlMs: LOCK_TTL_MS,
            }),
        });
    }
    // Acquire: {ok:true} hoặc {ok:false, holderName}. interactive → confirm cướp lock.
    async function _acquireCaptureLock(interactive) {
        let j = null;
        try {
            j = await _postAcquire(false);
        } catch (_) {}
        if (j?.success) return { ok: true };
        // Network/server error (không có current) → fail im lặng, KHÔNG confirm.
        if (!j?.current) return { ok: false };
        const who = j.current.holderName || j.current.holder || 'máy khác';
        if (!interactive) return { ok: false, holderName: who };
        const take = confirm(
            `Máy khác ("${who}") đang capture livestream.\n` +
                `Chuyển capture sang máy NÀY? (máy kia sẽ tự dừng để không đè dữ liệu)`
        );
        if (!take) return { ok: false, holderName: who };
        try {
            j = await _postAcquire(true);
        } catch (_) {
            j = null;
        }
        return j?.success ? { ok: true } : { ok: false, holderName: who };
    }
    // Heartbeat = gọi lại /acquire cùng holder (server renew ts atomic).
    // {success:false} = lock bị máy khác force cướp → tự dừng capture.
    //
    // FAILOVER (2026-06-11, user báo "máy giữ lock nhưng không capture → không
    // máy nào chụp"): heartbeat KHÔNG renew mù quáng nữa — check capture còn
    // THẬT SỰ ra frame không (STATE.lastFrameAt do frame buffer tick set). Stall
    // quá LOCK_CAPTURE_STALL_MS → tự nhả lock + dừng capture để máy standby
    // takeover (qua SSE 'web2:capture-lock' release event hoặc poll retry).
    // Máy này nếu hồi (tab refocus) sẽ tự re-acquire nếu lock còn trống.
    function _startLockHeartbeat() {
        _stopLockHeartbeat();
        STATE._lockHbTimer = setInterval(async () => {
            const sinceFrame = Date.now() - (STATE.lastFrameAt || 0);
            if (sinceFrame > LOCK_CAPTURE_STALL_MS) {
                console.warn(
                    `[snap-lock] capture stalled ${Math.round(sinceFrame / 1000)}s không có frame → nhả lock cho máy khác takeover`
                );
                _stopFrameBuffer(); // cũng release lock + stop heartbeat
                stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                STATE.autoSnapStarting = false; // cho poll loop retry khi máy hồi
                // Cooldown 3 phút: máy VỪA stall không được auto re-acquire ngay
                // (release → SSE event → chính nó nhào vào thắng CAS → lại stall
                // 90s nữa → máy khỏe mãi không tới lượt). Tab visible lại → xóa
                // cooldown (stall thường do unfocused). Click tay luôn override.
                STATE._stallCooldownUntil = Date.now() + 180000;
                renderRealSnapChip();
                _toast('📵 Capture không ra frame — nhả quyền chụp cho máy khác', 'ok');
                return;
            }
            let j = null;
            try {
                j = await _postAcquire(false);
            } catch (_) {
                return; // network blip — thử lại tick sau, TTL 90s đủ rộng
            }
            if (j && j.success === false) {
                console.log('[snap-lock] heartbeat mất lock (force takeover) → stop capture');
                _stopLockHeartbeat();
                stopRealSnap();
                _toast('📵 Máy khác đã nhận capture — máy này dừng', 'ok');
            }
        }, LOCK_HEARTBEAT_MS);
    }
    function _stopLockHeartbeat() {
        if (STATE._lockHbTimer) {
            clearInterval(STATE._lockHbTimer);
            STATE._lockHbTimer = null;
        }
    }
    // Server chỉ release nếu lock còn là của mình (bị cướp → no-op an toàn).
    async function _releaseCaptureLock() {
        _stopLockHeartbeat();
        try {
            await _lockFetch('/release', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ holder: _holderId() }),
            });
        } catch (_) {}
    }
    // SSE 'web2:capture-lock' — 2 vai:
    //   • Đang capture + máy khác cướp lock → máy này TỰ DỪNG.
    //   • Standby + lock được NHẢ (leader stall/unload/release) → thử acquire
    //     NGAY (failover tức thì, không đợi poll 3-30s). CAS server đảm bảo
    //     nhiều standby cùng nhào vào chỉ 1 máy thắng; stagger random giảm herd.
    function _subscribeLockSse() {
        if (_subscribeLockSse._done) return;
        if (!global.Web2SSE?.subscribe) return;
        _subscribeLockSse._done = true;
        global.Web2SSE.subscribe('web2:capture-lock', async () => {
            if (!STATE.captureStream && !STATE.frameBufferTimer) {
                // Standby: lock vừa đổi trạng thái. Nếu đã trống → takeover.
                const cur = await _readLock();
                const expired =
                    cur?.holder &&
                    (Number(cur.ts) || 0) + (Number(cur.ttlMs) || LOCK_TTL_MS) < Date.now();
                if (!cur?.holder || expired) {
                    STATE.autoSnapStarting = false; // cho phép re-entry
                    setTimeout(() => _maybeShowAutoSnapBanner(), Math.random() * 1500);
                }
                return;
            }
            const cur = await _readLock();
            if (cur?.holder && cur.holder !== _holderId()) {
                console.log('[snap-lock] lock taken by another machine → stop capture');
                _stopFrameBuffer();
                stopRealSnap();
                const wrapper = document.getElementById('live-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                _toast(`📵 Máy "${cur.holderName || 'khác'}" đã nhận capture — máy này dừng`, 'ok');
            }
        });
    }
    // Tab visible lại → xóa stall-cooldown (capture path captureVisibleTab
    // hoạt động lại khi focus) để máy này được quyền auto re-acquire.
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) STATE._stallCooldownUntil = 0;
    });

    // Đóng tab giữa chừng → nhả lock best-effort (sendBeacon survive unload).
    window.addEventListener('beforeunload', () => {
        if (!STATE.frameBufferTimer && !STATE.captureStream) return;
        try {
            const url = `${_lockApiBase()}/api/web2/capture-lock/release`;
            const payload = JSON.stringify({ holder: _holderId() });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
            } else {
                fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    keepalive: true,
                    body: payload,
                });
            }
        } catch (_) {}
    });

    // -----------------------------------------------------
    // EMBEDDED LIVE CAPTURE (1-click, không nhảy tab)
    // Flow: iframe FB embed ẩn → getDisplayMedia preferCurrentTab → Region
    // Capture API cropTo iframe → stream chỉ chứa video FB → buffer chạy.
    // User chỉ bấm 1 lần "BẤM 1 LẦN", không bao giờ rời live-chat tab.
    // -----------------------------------------------------
    function _ensureEmbeddedIframe(camp) {
        let wrapper = document.getElementById('live-snap-fb-wrapper');
        if (wrapper) return wrapper.querySelector('iframe');
        const fbVideoUrl = _buildFbLiveUrl(camp);
        if (!fbVideoUrl) return null;
        // User feedback 2026-05-26: capture lệch iframe + lag sau khi kết nối.
        // Root cause: render iframe 560×480 rồi scale 0.571 → DOM compositing
        // overhead + nếu FB plugin update layout, HEADER_OFFSET cố định lệch.
        //
        // Fix: render iframe AT WRAPPER SIZE (no scale transform), pass width
        // matching wrapper trực tiếp cho FB plugin URL. FB plugin tự render
        // responsive theo width → ít DOM + capture đúng video area.
        //
        // HEADER_OFFSET vẫn cần (FB plugin có thanh header mỏng ~30px ở size
        // nhỏ). Wrapper overflow:hidden + iframe translate Y up để skip header.
        // FB live từ điện thoại = DỌC (9:16). Khung ngang 16:9 → FB letterbox =
        // đen 2 bên (user feedback 2026-06-06). Đổi khung sang DỌC 9:16 → video dọc
        // fill full, hết đen 2 bên (và frame capture cũng full, không bake viền đen).
        const WRAPPER_W = 200;
        const WRAPPER_H = Math.round((WRAPPER_W * 16) / 9); // 356 — 9:16 video area (dọc)
        const HEADER_OFFSET = 30; // FB plugin header bar (~30px, gần như cố định theo control bar)
        const IFRAME_W = WRAPPER_W;
        const IFRAME_H = WRAPPER_H + HEADER_OFFSET; // total iframe height = video + header

        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbVideoUrl)}&show_text=false&width=${IFRAME_W}&height=${IFRAME_H}&autoplay=1&mute=1&allowfullscreen=false&show_share=false&show_captions=false`;
        wrapper = document.createElement('div');
        wrapper.id = 'live-snap-fb-wrapper';
        wrapper.style.cssText = `position:fixed;bottom:8px;right:8px;width:${WRAPPER_W}px;height:${WRAPPER_H}px;border:2px solid #dc2626;border-radius:8px;z-index:99000;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;`;

        // No scale transform — iframe rendered AT wrapper width (320). Chỉ
        // translate up by HEADER_OFFSET để skip FB plugin header.
        const iframe = document.createElement('iframe');
        iframe.id = 'live-snap-fb-embed';
        iframe.src = embedUrl;
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.scrolling = 'no';
        iframe.frameBorder = '0';
        iframe.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:${IFRAME_W}px;height:${IFRAME_H}px;display:block;border:0;`;
        wrapper.appendChild(iframe);
        wrapper._videoHeight = WRAPPER_H;
        wrapper._scale = 1; // no scaling
        // Minimize button đã gỡ — khi minimize iframe display:none → tab
        // capture trả pixel trống (44x44 pill không có video) → buffer toàn
        // frame rỗng. Giữ iframe luôn open để capture liên tục.
        document.body.appendChild(wrapper);
        return iframe;
    }

    async function _enableEmbeddedLiveCapture(opts) {
        if (STATE.captureStream || STATE.frameBufferTimer) {
            _toast('Đã kết nối rồi', 'ok');
            return true;
        }
        const camp = _findActiveLiveCampaign();
        if (!camp?.Facebook_LiveId) {
            _toast('Không có live nào đang chạy', 'err');
            return false;
        }
        // LEADER LOCK: 1 máy capture duy nhất. Auto path (không interactive)
        // → máy khác giữ lock thì im lặng bỏ qua (poll loop retry sau, máy kia
        // unload/hết TTL sẽ tới lượt). Click tay → confirm cướp lock.
        const lock = await _acquireCaptureLock(!!opts?.interactive);
        if (!lock.ok) {
            STATE.lockBlockedBy = lock.holderName || 'máy khác';
            STATE.autoSnapStarting = false;
            renderRealSnapChip();
            if (opts?.interactive) {
                _toast(`📵 Máy "${STATE.lockBlockedBy}" đang capture — máy này không bật`, 'err');
            }
            return false;
        }
        STATE.lockBlockedBy = null;
        const wrapperExisted = !!document.getElementById('live-snap-fb-wrapper');
        const iframe = _ensureEmbeddedIframe(camp);
        if (!iframe) {
            _toast('Không tạo được iframe embed', 'err');
            // Đã acquire lock nhưng không tới được _startFrameBuffer → nhả ngay,
            // không thì máy khác bị block tới hết TTL 90s.
            _releaseCaptureLock();
            return false;
        }
        // Đợi iframe load xong (FB plugin HTML + JS) RỒI thêm 7s buffer cho
        // FB player thực sự start video (khác với chỉ load HTML). User báo:
        // 'đợi iframe load xong rồi mới chụp chứ -> đừng vào là chụp liền'.
        // Trước: fixed 4s → frame đầu thường là FB loading spinner / blank.
        // Sau: load event + 7s = ~ thời điểm video bắt đầu play, capture frame
        // thật.
        if (!wrapperExisted) {
            _toast('⏳ Đợi iframe FB load + video play (~10s)...', 'ok');
            await new Promise((resolve) => {
                let done = false;
                const finish = () => {
                    if (done) return;
                    done = true;
                    resolve();
                };
                iframe.addEventListener('load', finish, { once: true });
                // Hard timeout 6s nếu iframe load event không fire (đôi khi FB
                // plugin defer fire). Sau timeout vẫn proceed → buffer sẽ skip
                // frame xấu qua validation tick.
                setTimeout(finish, 6000);
            });
            // FB plugin sau load event vẫn cần ~7s để actual video start (init
            // player, fetch DASH manifest, buffer chunks).
            await new Promise((r) => setTimeout(r, 7000));
        } else {
            // Wrapper đã có sẵn (auto-start inject sớm) → video chắc đang play
            // rồi, chỉ cần 500ms để frame buffer query rect ổn định.
            await new Promise((r) => setTimeout(r, 500));
        }
        // Path A — N2Store Extension đang chạy: skip getDisplayMedia. Frame
        // buffer dùng chrome.tabs.captureVisibleTab (tab focused only) hoặc
        // tab stream (tab inactive OK) tùy việc user đã click extension icon.
        if (STATE.extReady) {
            _startFrameBuffer();
            renderRealSnapChip();
            renderAutoModeChip();
            const hint = document.getElementById('live-snap-fb-hint');
            if (hint) hint.remove();
            _toast('✅ Auto-snap qua extension — không cần share popup', 'ok');
            // Modal Enter đã trigger sớm hơn ở EXTENSION_VERSION handler. Nếu
            // user chưa bấm Enter (modal đang chờ) thì stream chưa wire.
            return true;
        }
        try {
            const stream = await navigator.mediaDevices.getDisplayMedia({
                video: {
                    displaySurface: 'browser',
                    width: { ideal: 1280 },
                    height: { ideal: 720 },
                },
                audio: false,
                preferCurrentTab: true,
                selfBrowserSurface: 'include',
                surfaceSwitching: 'exclude',
            });
            // Region Capture: crop vào WRAPPER (visible bounding box, đã skip FB
            // header qua transform). Chromium 104+. KHÔNG crop iframe element vì
            // iframe rendered ngoài viewport (vùng FB header) cũng được tính.
            if (window.CropTarget?.fromElement) {
                try {
                    const wrapper = document.getElementById('live-snap-fb-wrapper');
                    const cropTarget = await CropTarget.fromElement(wrapper);
                    const track = stream.getVideoTracks()[0];
                    if (track.cropTo) {
                        await track.cropTo(cropTarget);
                        console.log('[snap] Region Capture cropped to wrapper ✓');
                    }
                } catch (e) {
                    console.warn('[snap] cropTo fail (full tab capture):', e.message);
                }
            }
            STATE.captureStream = stream;
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
            stream.getVideoTracks().forEach((t) => {
                t.addEventListener('ended', () => {
                    _stopFrameBuffer();
                    stopRealSnap();
                    _toast('🔴 Stream đã ngắt — bấm 🎬 để bật lại', 'ok');
                });
            });
            _startFrameBuffer();
            renderRealSnapChip();
            renderAutoModeChip();
            // Remove hint label sau khi connect (đã share rồi).
            const hint = document.getElementById('live-snap-fb-hint');
            if (hint) hint.remove();
            _toast('✅ Auto-snap đã kết nối — frame thật unique per comment', 'ok');
            return true;
        } catch (e) {
            console.warn('[snap-embed] fail:', e?.message);
            _toast('Hủy share: ' + e.message, 'err');
            // Cleanup wrapper nếu user hủy + nhả lock (chưa tới _startFrameBuffer).
            const wrapper = document.getElementById('live-snap-fb-wrapper');
            if (wrapper) wrapper.remove();
            _releaseCaptureLock();
            return false;
        }
    }

    // Visibility watcher — user feedback 2026-05-26: KHÔNG block switch tab
    // (browser security không cho). Thay vào đó: khi đang capture mà tab bị
    // ẩn, alert user qua 3 cách:
    //   1. Title flash đỏ "⚠️ QUAY LẠI TAB LIVESTREAM" (catch ngoại vi)
    //   2. Browser Notification (one-shot, click → focus tab)
    //   3. Khi user quay lại, show toast tip dùng 2 trình duyệt
    // Chỉ active khi `STATE.frameBufferTimer` đang chạy (đang capture).
    function _setupVisibilityWatcher() {
        if (STATE._visibilityWatcherInstalled) return;
        STATE._visibilityWatcherInstalled = true;
        const originalTitle = document.title;
        let titleFlashTimer = null;
        let lastHiddenTs = 0;
        let currentNotif = null;

        const startTitleFlash = () => {
            if (titleFlashTimer) return;
            let toggle = false;
            titleFlashTimer = setInterval(() => {
                toggle = !toggle;
                document.title = toggle
                    ? '⚠️ QUAY LẠI TAB LIVESTREAM'
                    : '🔴 Capture đang dừng — focus lại';
            }, 1000);
        };
        const stopTitleFlash = () => {
            if (titleFlashTimer) {
                clearInterval(titleFlashTimer);
                titleFlashTimer = null;
            }
            document.title = originalTitle;
        };

        const fireNotification = () => {
            if (!('Notification' in window)) return;
            if (Notification.permission === 'denied') return;
            const fire = () => {
                try {
                    currentNotif = new Notification('⚠️ Livestream Snap đang dừng', {
                        body: 'Tab live-chat không focus → capture không chạy. Click để quay lại.',
                        tag: 'live-snap-switch-away',
                        requireInteraction: false,
                    });
                    currentNotif.onclick = () => {
                        window.focus();
                        try {
                            currentNotif.close();
                        } catch (_) {}
                    };
                } catch (e) {
                    console.warn('[snap-vis] notification fail:', e?.message);
                }
            };
            if (Notification.permission === 'granted') {
                fire();
            } else if (Notification.permission === 'default') {
                Notification.requestPermission().then((p) => {
                    if (p === 'granted') fire();
                });
            }
        };

        document.addEventListener('visibilitychange', () => {
            const isCapturing = !!STATE.frameBufferTimer;
            if (!isCapturing) {
                stopTitleFlash();
                return;
            }
            if (document.visibilityState === 'hidden') {
                lastHiddenTs = Date.now();
                startTitleFlash();
                fireNotification();
            } else if (document.visibilityState === 'visible') {
                stopTitleFlash();
                if (currentNotif) {
                    try {
                        currentNotif.close();
                    } catch (_) {}
                    currentNotif = null;
                }
                const hiddenDuration = Date.now() - lastHiddenTs;
                // Hidden > 5s → show tip toast 1 lần
                if (hiddenDuration > 5000) {
                    if (!sessionStorage.getItem('web2_snap_2browser_tip_shown')) {
                        sessionStorage.setItem('web2_snap_2browser_tip_shown', '1');
                        _toast(
                            '💡 Mở 2 trình duyệt riêng — 1 cho livestream, 1 cho việc khác → capture không bị dừng',
                            'ok'
                        );
                    }
                    // Hidden > 10s → comments có thể đã arrive trong khi tab inactive
                    // (captureVisibleTab fail silently → snap row tạo nhưng không
                    // có bytea). Auto-trigger Force extract silently để fill
                    // thumbnail mà user không phải click chip thủ công.
                    if (hiddenDuration > 10000) {
                        _runSilentForceExtract().catch((e) =>
                            console.warn('[snap-vis] auto-extract fail:', e?.message)
                        );
                    }
                }
            }
        });
    }

    // Banner install/update extension. Hiện khi detect live nhưng extension
    // KHÔNG có (5s không nhận EXTENSION_LOADED) hoặc version cũ.
    //
    // User feedback 2026-05-26: "đâu cần click vào extension — đây là bước dư
    // thừa". Đúng — extension v1.0.15+ có <all_urls> host_permissions →
    // chrome.tabs.captureVisibleTab silent KHÔNG cần click icon. Prompt chỉ
    // hướng dẫn cài/update extension (no click instruction).
    function _showExtPrompt(kind) {
        if (sessionStorage.getItem('web2_ext_prompt_dismiss')) return;
        if (document.getElementById('live-snap-ext-prompt')) return;
        const box = document.createElement('div');
        box.id = 'live-snap-ext-prompt';
        const title =
            kind === 'outdated'
                ? `⚠️ N2Store Extension v${STATE.extVersion || '?'} đã cũ`
                : '⚠️ Cần cài N2Store Extension';
        const body =
            kind === 'outdated'
                ? `Auto-snap cần extension <strong>v${REQUIRED_EXT_VERSION}+</strong>. Bạn đang chạy <strong>v${STATE.extVersion || '?'}</strong>.<br><br>Mở <code>chrome://extensions</code> → "N2Store Messenger" → bấm <strong>Reload</strong>. Capture sẽ tự chạy.`
                : `Auto-snap livestream cần extension <strong>N2Store Messenger</strong>.<br><br>1. Cài: <a href="https://chromewebstore.google.com/detail/dgcicifdlgamleagjangkbbcdgbhmfea" target="_blank" style="color:#ea580c;font-weight:700;">Chrome Web Store</a><br>2. Reload trang<br><br><em>Sau khi cài, capture tự chạy ngầm — không cần thao tác gì thêm.</em>`;
        box.innerHTML = `
            <div style="font-weight:700;font-size:14px;color:#7c2d12;margin-bottom:8px;">${title}</div>
            <div style="font-size:12px;color:#451a03;line-height:1.55;">${body}</div>
            <div style="margin-top:12px;">
                <button type="button" id="live-snap-ext-prompt-ok" style="width:100%;padding:6px 12px;background:#ea580c;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Đã hiểu</button>
            </div>`;
        box.style.cssText =
            'position:fixed;bottom:80px;right:16px;width:340px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.18);z-index:99100;font-family:Inter,system-ui,sans-serif;';
        document.body.appendChild(box);
        document.getElementById('live-snap-ext-prompt-ok').onclick = () => {
            sessionStorage.setItem('web2_ext_prompt_dismiss', '1');
            box.remove();
        };
    }

    // AUTO-START — chỉ khi extension ready (user feedback 2026-05-26):
    // Detect live active + extension active → tự bật capture silent
    // (chrome.tabs.captureVisibleTab qua extension, NO popup).
    //
    // Nếu extension KHÔNG ready: KHÔNG auto-trigger getDisplayMedia (sẽ hiện
    // Chrome popup "Allow http://... to see this tab" — gây phiền). Thay vào
    // đó show prompt info 1 lần để user cài/reload extension. User vẫn snap
    // thủ công được qua nút 📸 trên từng comment row.
    //
    // Poll loop sẽ retry mỗi 2s × 60s; nếu extension load muộn (vd user vừa
    // enable rồi reload), lần poll sau sẽ catch + auto-start capture.
    async function _maybeShowAutoSnapBanner() {
        // Mobile/tablet (html.lc-mobile — chế độ đọc comment): KHÔNG auto-bật
        // iframe capture + KHÔNG prompt extension (mobile không có extension,
        // iframe floating che comment) — 2026-06-11.
        if (document.documentElement.classList.contains('lc-mobile')) return;
        if (STATE.captureStream || STATE.frameBufferTimer) return;
        if (STATE.autoSnapStarting) return;
        // Máy vừa stall-yield lock → nhường máy khác trong cooldown (xem
        // _startLockHeartbeat). Tab visible lại sẽ xóa cooldown.
        if (STATE._stallCooldownUntil && Date.now() < STATE._stallCooldownUntil) return;
        const camp = _findActiveLiveCampaign();
        if (!camp?.Facebook_LiveId) return;

        // Đợi 1500ms cho EXTENSION_LOADED message arrive trước khi decide.
        // (Lần đầu poll fire, ext có thể chưa response — content-script chậm
        // hơn page script.)
        await new Promise((r) => setTimeout(r, 1500));

        // Extension không ready → SKIP auto-trigger để tránh getDisplayMedia
        // popup. Show prompt info 1 lần. Poll loop sẽ retry.
        if (!STATE.extReady) {
            if (!STATE._extPromptShown) {
                STATE._extPromptShown = true;
                if (STATE.extOutdated) _showExtPrompt('outdated');
                else if (!STATE.extVersion) _showExtPrompt('missing');
            }
            return;
        }

        STATE.autoSnapStarting = true;
        console.log('[snap] auto-enabling live capture (extension ready, no popup)');
        try {
            await _enableEmbeddedLiveCapture();
        } catch (e) {
            console.warn('[snap] auto-enable failed:', e?.message);
            STATE.autoSnapStarting = false;
        }
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
        if (localStorage.getItem('web2_snap_picker_tutorial_seen')) return Promise.resolve();
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
                if (remember) localStorage.setItem('web2_snap_picker_tutorial_seen', '1');
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
                    _stopFrameBuffer();
                    stopRealSnap();
                    _toast('🔴 Snap thật đã tắt (user dừng share)', 'ok');
                });
            });
            // Khởi động frame buffer — capture 1 frame mỗi 5s, giữ 720 frames
            // (1 tiếng). Mỗi entry { capturedAt: ms, blob }. Auto-snap
            // sau đó dùng buffer nearest commentTime → frame unique per comment.
            _startFrameBuffer();
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
        _stopFrameBuffer();
        if (STATE.captureStream) {
            STATE.captureStream.getTracks().forEach((t) => t.stop());
            STATE.captureStream = null;
        }
        if (STATE.captureVideo) {
            STATE.captureVideo.srcObject = null;
        }
        // Remove iframe wrapper (FB embed + minimize button).
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (wrapper) wrapper.remove();
        renderRealSnapChip();
        renderAutoModeChip();
    }

    // -----------------------------------------------------
    // Frame buffer: capture 1 frame mỗi BUFFER_INTERVAL_MS (5s) khi stream active.
    // Cap 720 entries (= 1 tiếng @ 5s/frame). Auto-snap lookup nearest commentTime
    // → frame unique per comment (giải pháp duy nhất khả thi không cần FB HLS).
    // -----------------------------------------------------
    const FRAME_BUFFER_INTERVAL_MS = 5000;
    const FRAME_BUFFER_MAX = 720;

    function _startFrameBuffer() {
        _stopFrameBuffer(true); // safe re-init — KHÔNG nhả lock vừa acquire
        // Entry { capturedAt: ms, blob: Blob } — giữ Blob binary thay vì base64
        // string (~4x retained memory). Convert base64 tại điểm consume (upload).
        STATE.frameBuffer = [];
        // Mốc health ban đầu = lúc start (chưa có frame nào). Heartbeat đo stall
        // từ đây — startup iframe ~10s vẫn nằm trong LOCK_CAPTURE_STALL_MS.
        STATE.lastFrameAt = Date.now();
        _setupVisibilityWatcher(); // notify user khi switch tab
        // Capture path priority:
        //   1. captureStream (Option B: extension streamId via getUserMedia OR
        //      getDisplayMedia) → _captureFrameJpeg via canvas. Best: work khi
        //      tab inactive, no Chrome rate-limit.
        //   2. extension captureVisibleTab → tab-only crop. Chỉ work khi tab
        //      focused. Fallback nếu user chưa click extension icon.
        const tick = async () => {
            // Debug/test: giả lập capture chết (frame không vào buffer) để verify
            // heartbeat stall-failover. Set qua _lockDebug.blockFrames(true).
            if (STATE._debugBlockFrames) return;
            // Path 1 — stream-based (Option B: extension streamId OR legacy getDisplayMedia)
            // Best: work khi tab inactive, no Chrome rate-limit.
            if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
                try {
                    const blob = await _captureFrameJpeg(0.72, 1280);
                    if (!blob) return;
                    STATE.lastFrameAt = Date.now(); // capture health (leader lock failover)
                    STATE.frameBuffer.push({ capturedAt: Date.now(), blob });
                    if (STATE.frameBuffer.length > FRAME_BUFFER_MAX) {
                        STATE.frameBuffer.splice(0, STATE.frameBuffer.length - FRAME_BUFFER_MAX);
                    }
                } catch (e) {
                    console.warn('[snap-buffer-stream] tick fail:', e.message);
                }
                return;
            }
            // Path 2 — extension captureVisibleTab. Reactivated 2026-05-26:
            // manifest extension thêm <all_urls> host_permissions → chrome.tabs
            // .captureVisibleTab work silent KHÔNG cần user click extension icon.
            // Limitation: chỉ work khi tab focused. Tab inactive → silent skip
            // (chrome rate-limit ~2/sec OK với 5s interval).
            if (STATE.extReady) {
                try {
                    const jpegBase64 = await _captureExtensionFrame(80);
                    if (!jpegBase64) return;
                    STATE.lastFrameAt = Date.now(); // capture health (leader lock failover)
                    STATE.frameBuffer.push({
                        capturedAt: Date.now(),
                        blob: _base64ToBlob(jpegBase64),
                    });
                    if (STATE.frameBuffer.length > FRAME_BUFFER_MAX) {
                        STATE.frameBuffer.splice(0, STATE.frameBuffer.length - FRAME_BUFFER_MAX);
                    }
                } catch (e) {
                    // Silent: tab unfocused / chrome reject. Don't spam log.
                    if (!/activeTab|all_urls|permission|invoked/i.test(e.message)) {
                        console.warn('[snap-buffer-ext] tick fail:', e.message);
                    }
                }
            }
        };
        // Capture 1 frame ngay khi start, sau đó interval.
        tick();
        STATE.frameBufferTimer = setInterval(tick, FRAME_BUFFER_INTERVAL_MS);
        // Chip refresh 5s — chỉ sống khi buffer chạy (clear ở _stopFrameBuffer).
        STATE.chipRefreshTimer = setInterval(renderRealSnapChip, 5000);
        _startLockHeartbeat(); // giữ leader lock suốt phiên capture (1 máy duy nhất)
        const path = STATE.captureStream
            ? '(stream-based, tab inactive OK)'
            : STATE.extReady
              ? '(extension visible tab, tab focused only)'
              : '(no source)';
        console.log('[snap-buffer] started — capture mỗi', FRAME_BUFFER_INTERVAL_MS, 'ms', path);
    }

    // keepLock=true: safe re-init từ _startFrameBuffer — chỉ clear timers/buffer,
    // KHÔNG nhả lock (lock vừa acquire ngay trước đó, release sẽ mở cửa cho máy
    // khác chen vào tới khi heartbeat tick đầu 30s sau).
    function _stopFrameBuffer(keepLock) {
        if (STATE.frameBufferTimer) {
            clearInterval(STATE.frameBufferTimer);
            STATE.frameBufferTimer = null;
        }
        if (STATE.chipRefreshTimer) {
            clearInterval(STATE.chipRefreshTimer);
            STATE.chipRefreshTimer = null;
        }
        if (STATE.frameBuffer) STATE.frameBuffer = [];
        // Nhả leader lock (server chỉ release nếu còn là của mình — fire-and-forget).
        if (!keepLock) _releaseCaptureLock();
    }

    // Tìm frame buffered có capturedAt gần commentTimeMs nhất.
    // Threshold: chỉ trả về nếu diff <= maxDiffMs (default 30s).
    function _findNearestBufferedFrame(commentTimeMs, maxDiffMs = 30000) {
        const buf = STATE.frameBuffer;
        if (!buf?.length || !Number.isFinite(commentTimeMs)) return null;
        let best = null;
        let bestDiff = Infinity;
        for (const f of buf) {
            const d = Math.abs(f.capturedAt - commentTimeMs);
            if (d < bestDiff) {
                best = f;
                bestDiff = d;
            }
        }
        if (best && bestDiff <= maxDiffMs) return best;
        return null;
    }

    // Blob → base64 (no "data:image/jpeg;base64," prefix) — convert tại điểm
    // consume (upload POST), KHÔNG lưu base64 trong buffer (retained memory ~4x).
    function _blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => {
                const dataUrl = fr.result;
                resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
            };
            fr.onerror = () => reject(new Error('blob→base64 fail'));
            fr.readAsDataURL(blob);
        });
    }
    // base64 (no prefix) → Blob — cho path extension (captureVisibleTab trả base64).
    function _base64ToBlob(b64, mime = 'image/jpeg') {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    }

    // Capture 1 frame từ stream → JPEG Blob. Return null nếu stream chưa sẵn.
    async function _captureFrameJpeg(quality = 0.7, maxWidth = 1280) {
        const v = STATE.captureVideo;
        if (!STATE.captureStream || !v || !v.videoWidth) return null;
        const fullW = v.videoWidth;
        const fullH = v.videoHeight;
        // Crop về iframe wrapper region nếu có (tab capture lấy full tab, mình
        // chỉ cần khung iframe live). Nếu wrapper không có (legacy getDisplayMedia
        // đã cropTo từ trước) thì capture full frame.
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        let srcX = 0,
            srcY = 0,
            srcW = fullW,
            srcH = fullH;
        if (wrapper) {
            const rect = wrapper.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0) {
                // dpr = video native px / viewport px. Tab capture matches
                // viewport unless Chrome scales down to fit maxWidth constraint.
                const dpr = fullW / Math.max(1, window.innerWidth);
                srcX = Math.max(0, Math.round(rect.left * dpr));
                srcY = Math.max(0, Math.round(rect.top * dpr));
                srcW = Math.max(1, Math.min(fullW - srcX, Math.round(rect.width * dpr)));
                srcH = Math.max(1, Math.min(fullH - srcY, Math.round(rect.height * dpr)));
            }
        }
        // Downscale crop region to maxWidth (giữ aspect)
        let targetW = srcW;
        let targetH = srcH;
        if (srcW > maxWidth) {
            targetW = maxWidth;
            targetH = Math.round(srcH * (maxWidth / srcW));
        }
        if (!STATE.captureCanvas) {
            STATE.captureCanvas = document.createElement('canvas');
        }
        const canvas = STATE.captureCanvas;
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(v, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
        // Resolve Blob trực tiếp (skip FileReader/base64) — buffer giữ binary.
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', quality);
        });
    }

    // -----------------------------------------------------
    // Snap action — POST /api/livestream/snapshot
    // -----------------------------------------------------
    async function snap(customerFbUserId, customerName, commentId, sourceBtn, opts = {}) {
        // Resolve page + campaign — ưu tiên từ comment đang xét (qua STATE.comments
        // hoặc opts), fallback page pref (Store/House). Vì 1 button = 1 comment cụ
        // thể, phải dùng đúng broadcastStart của video chứa comment đó.
        const st = global.LiveState;
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
            _toast('Chưa chọn page — vào Live chọn page trước', 'err');
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
        // Ưu tiên: Live livevideo channelCreatedTime (= FB broadcast_start_time
        // chính xác từ Graph API qua Live proxy, đã cache 5 phút per liveVideoId).
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
                startMs = SharedUtils.toEpochMs(startedTime) || null;
                startSource = 'live-campaign(' + (camp.DateCreated ? 'DateCreated' : 'other') + ')';
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
        // Priority 1: caller pass bufferedFrame (auto-mode lookup nearest by commentTime)
        // → mỗi comment có frame unique từ buffer (Blob → base64 tại đây).
        if (opts.bufferedFrame?.blob) {
            try {
                imageBase64 = await _blobToBase64(opts.bufferedFrame.blob);
            } catch (e) {
                console.warn('[snap] bufferedFrame blob→base64 fail:', e.message);
            }
        } else if (STATE.extReady && STATE.frameBufferTimer) {
            // Priority 1.5: extension mode + no buffered frame → live capture now
            // via chrome.tabs.captureVisibleTab. Tránh fallback xuống getDisplayMedia
            // sẽ open popup (đã ẩn flow popup khi extension active).
            try {
                imageBase64 = await _captureExtensionFrame();
            } catch (e) {
                console.warn('[snap] ext live-capture fail:', e.message);
            }
        } else if (mode === MODE_LIVE) {
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
                    const blob = await _captureFrameJpeg(0.72, 1280);
                    if (blob) imageBase64 = await _blobToBase64(blob);
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
                    // FB CDN signed URL từ Live livevideo (FB Graph picture endpoint
                    // trả 400 từ 05/2026). Cached qua _fetchLiveVideoInfo.
                    thumbnailUrl: videoInfo?.thumbnailUrl || undefined,
                    user: _user(),
                    imageBase64,
                    imageMime: imageBase64 ? 'image/jpeg' : undefined,
                }),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'snap failed');
            const t = new Date(referenceMs).toLocaleTimeString('vi-VN', {
                hour12: false,
                timeZone: 'Asia/Ho_Chi_Minh',
            });
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
            `.live-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
        );
        const n = STATE.counts[customerFbUserId] || 0;
        btns.forEach((btn) => {
            let badge = btn.querySelector('.live-snap-count');
            if (n > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'live-snap-count';
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
                                  document.querySelectorAll('.live-snap-btn[data-customer-id]')
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

    // Xóa snap row + invalidate cache để row hiện trạng "chưa snap". User
    // có thể click 📸 trên row để chụp lại bằng frame hiện tại. Gọi từ nút
    // X overlay trên thumbnail (visible khi hover).
    async function _deleteSnapByComment(commentId, snapId) {
        if (!commentId) return;
        if (!confirm('Xóa thumbnail snap? Sau đó dùng nút 📸 trên comment để chụp lại.')) {
            return;
        }
        try {
            // Backend xóa qua snap.id. Nếu thiếu snapId (snap row null trong cache)
            // → fallback resolve qua by-comment-ids.
            let resolvedId = snapId;
            if (!resolvedId) {
                const r = await fetch(
                    API +
                        '/api/livestream/snapshots/by-comment-ids?commentIds=' +
                        encodeURIComponent(commentId),
                    { credentials: 'omit' }
                );
                const d = await r.json();
                resolvedId = d?.byCommentId?.[commentId]?.id;
            }
            if (!resolvedId) {
                _toast('Không tìm thấy snap để xóa', 'err');
                return;
            }
            const r = await fetch(API + '/api/livestream/snapshot/' + resolvedId, {
                method: 'DELETE',
                credentials: 'omit',
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'delete failed');
            // Clear local cache → re-queue → fetch DB sẽ trả null → row trở
            // về trạng thái "chưa snap". User click 📸 để chụp lại.
            STATE.snapByComment.delete(commentId);
            _renderThumbStripFor(commentId);
            _queueSnapByComment(commentId);
            _toast('✅ Đã xóa thumbnail — bấm 📸 trên comment để chụp lại', 'ok');
        } catch (e) {
            _toast('Lỗi xóa thumbnail: ' + e.message, 'err');
        }
    }

    // Clear STATE.snapByComment + re-queue mọi comment row visible. Gọi sau
    // Force extract done để frontend lấy fresh data (lúc trước có thể là null
    // hoặc snap chưa có bytea — giờ DB đã có bytea cho rows extracted thành công).
    function _invalidateSnapCacheAndRefresh() {
        const rows = document.querySelectorAll('.live-conversation-item[data-comment-id]');
        const cids = [];
        rows.forEach((row) => {
            const cid = row.dataset.commentId;
            if (cid) cids.push(cid);
        });
        // Wipe entries cho các commentId visible → ép re-fetch
        cids.forEach((cid) => STATE.snapByComment.delete(cid));
        // Queue lại tất cả → _flushSnapByCommentBatch fetch from DB + render
        cids.forEach((cid) => _queueSnapByComment(cid));
    }

    async function _flushSnapByCommentBatch() {
        STATE.snapByCommentTimer = null;
        const ids = Array.from(STATE.snapByCommentPending);
        STATE.snapByCommentPending.clear();
        if (!ids.length) return;
        const chunks = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
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
                for (const id of chunk) {
                    const snap = map[id];
                    // CHỈ chấp nhận snap có frozen bytea image (URL self-served
                    // /api/livestream/snapshot/:id/image) — đó là frame thật unique.
                    // Snap chỉ có thumbnail_url generic FB CDN (path 2 / backfill) → bỏ.
                    if (snap && snap.thumbnailUrl?.includes('/api/livestream/snapshot/')) {
                        STATE.snapByComment.set(id, snap);
                    } else {
                        STATE.snapByComment.set(id, null);
                    }
                    _renderThumbStripFor(id);
                }
            } catch (e) {
                // Chunk fail → KHÔNG set entry trong STATE.snapByComment cho các
                // id này → `.has()` false → lần render row tiếp theo (observer /
                // _invalidateSnapCacheAndRefresh) gọi _queueSnapByComment sẽ tự
                // re-queue → natural retry, không cần retry loop riêng.
                console.warn('[snap] by-comment-ids fail:', e.message);
            }
        }
    }

    function _renderThumbStripFor(commentId) {
        const row = document.querySelector(
            `.live-conversation-item[data-comment-id="${CSS.escape(commentId)}"]`
        );
        if (!row) return;
        let strip = row.querySelector('.live-snap-thumb-strip');
        if (!_isInlineThumbOn()) {
            if (strip) strip.remove();
            return;
        }
        const data = STATE.snapByComment.get(commentId);
        // Mount slot 1 lần.
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'live-snap-thumb-strip';
            strip.style.cssText =
                'display:inline-flex;align-items:center;flex-shrink:0;margin-left:4px;';
            const info = row.querySelector('.live-conv-info');
            if (info) info.appendChild(strip);
            else row.appendChild(strip);
        }
        // Có DB snap với frozen bytea (self-served URL) → render thumbnail thật.
        // Optimized: 72x40 (16:9), hover zoom 480x270 cạnh thumb, click lightbox.
        if (data?.thumbnailUrl?.includes('/api/livestream/snapshot/')) {
            const offsetText =
                Number.isFinite(data.offsetSeconds) && data.offsetSeconds >= 0
                    ? `${Math.floor(data.offsetSeconds / 60)}m${data.offsetSeconds % 60}s`
                    : '?';
            // Wrapper cho img + nút X xóa. Nút X hidden default, hover-show.
            strip.innerHTML = `
                <div class="live-snap-thumb-wrap" style="position:relative;display:inline-block;">
                    <img src="${_esc(data.thumbnailUrl)}"
                         alt=""
                         loading="lazy"
                         class="live-snap-thumb-img snap-pop-thumb"
                         data-snap-url="${_esc(data.livestreamUrl || '')}"
                         data-snap-offset="${data.offsetSeconds ?? ''}"
                         title="Snapshot lúc Live @ ${offsetText} — hover zoom · click mở lớn"
                         style="width:72px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:zoom-in;display:block;background:#f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.08);"
                         onerror="this.style.background='#fee2e2';this.removeAttribute('src');" />
                    <button type="button"
                            class="live-snap-thumb-del"
                            data-snap-id="${data.id || ''}"
                            data-comment-id="${_esc(commentId)}"
                            title="Xóa thumbnail — chụp lại bằng nút 📸"
                            style="position:absolute;top:-6px;right:-6px;width:18px;height:18px;border-radius:50%;background:#dc2626;color:#fff;border:2px solid #fff;font-size:11px;font-weight:700;line-height:1;cursor:pointer;display:none;align-items:center;justify-content:center;padding:0;box-shadow:0 2px 6px rgba(220,38,38,0.4);">×</button>
                </div>
            `;
            const wrap = strip.querySelector('.live-snap-thumb-wrap');
            const img = strip.querySelector('img');
            const delBtn = strip.querySelector('.live-snap-thumb-del');
            // Hover wrap → show del button
            if (wrap && delBtn) {
                wrap.addEventListener('mouseenter', () => {
                    delBtn.style.display = 'flex';
                });
                wrap.addEventListener('mouseleave', () => {
                    delBtn.style.display = 'none';
                });
            }
            if (delBtn) {
                delBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    _hideZoomPreview();
                    await _deleteSnapByComment(commentId, data.id);
                });
            }
            if (img) {
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    _hideZoomPreview();
                    _openSnapLightbox(data);
                });
                // Hover zoom — reuse popover zoom preview helper.
                img.addEventListener('mouseenter', () => _showZoomPreview(img));
                img.addEventListener('mousemove', () => _showZoomPreview(img));
                img.addEventListener('mouseleave', _hideZoomPreview);
            }
            return;
        }
        // Không có bytea → button "📸 Lấy thumbnail" cho riêng comment này.
        // Chạy backend-only (yt-dlp+ffmpeg) — không mở FB tab, không xin share screen.
        // Thay thế chức năng "Force extract" trên TOÀN BỘ snaps bằng action cho 1 comment.
        // SSE 'extract-done' sẽ refresh thumbnail tự động khi backend xong.
        strip.innerHTML = `
            <button type="button"
                    class="live-snap-extract-one-btn"
                    data-comment-id="${_esc(commentId)}"
                    title="Lấy thumbnail từ frame live tại đúng giây comment này (backend yt-dlp + ffmpeg, ~5-15s)"
                    style="display:inline-flex;align-items:center;gap:4px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;line-height:1;height:28px;white-space:nowrap;">
                📸 <span>Lấy thumbnail</span>
            </button>
        `;
        // Click handler KHÔNG gắn trực tiếp ở đây — dùng EVENT DELEGATION trên
        // document (xem _wireSnapDelegation trong init). Lý do: list comment
        // re-render thường xuyên (chọn campaign, enrichment) → row + strip bị
        // replace → listener trực tiếp chết → nút "Lấy thumbnail" bấm không ăn
        // (user feedback 2026-06-06). Delegation sống qua mọi re-render.
    }

    // Per-comment thumbnail extract — backend-only (no FB tab share).
    // Flow: resolve campaign + offset → ensure snap row (offline-batch idempotent)
    //       → extract-frame → SSE 'extract-done' auto-refresh thumb.
    // Khác _captureAtCommentTime: không fallback Path C (mở FB tab), chỉ Path B.
    async function _extractThumbnailForComment(commentId, btn) {
        const st = global.LiveState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) throw new Error('comment không có trong state');
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const commentTimeMs = rawT ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN) : NaN;
        if (!Number.isFinite(commentTimeMs)) throw new Error('comment thiếu thời gian');
        const camp = _resolveCampaignForComment(c);
        if (!camp?.Facebook_LiveId) throw new Error('không tìm được campaign cho comment');
        const pageObj = st.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        if (!pageObj) throw new Error('không tìm được page');
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, camp.Facebook_LiveId);
        if (!videoInfo?.broadcastStartMs) throw new Error('không lấy được broadcastStart');
        const offsetSec = Math.max(
            0,
            Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
        );

        if (btn) {
            btn.disabled = true;
            btn.style.opacity = '0.7';
            btn.innerHTML = '⏳ <span>Đang lấy...</span>';
        }

        // CLIENT-SIDE capture (backend yt-dlp/Graph bị FB chặn từ datacenter, xem
        // _clientCaptureAtOffset). Browser có FB auth → seek iframe VOD + capture.
        if (!STATE.extReady && !STATE.captureStream) {
            throw new Error('chưa có capture — mở live + bật capture trước');
        }
        const imageBase64 = await _clientCaptureAtOffset(camp, offsetSec);
        if (!imageBase64) {
            throw new Error('capture thất bại (live chưa end / VOD chưa load?)');
        }
        await _postCapturedSnap({
            commentId,
            customerFbUserId: c.from.id,
            customerName: c.from.name || '?',
            commentTimeMs,
            offsetSec,
            pageObj,
            camp,
            videoInfo,
            imageBase64,
            message: c.message,
        });
        _toast('✅ Đã lấy thumbnail', 'ok');
        // Restore iframe về live active để auto-snap buffer chạy tiếp.
        try {
            const ac = _findActiveLiveCampaign();
            if (ac) await _clientRestoreLive(ac);
        } catch (_) {}
    }

    // Chụp frame của FB live tại đúng moment 1 comment.
    // Flow:
    //   1. Resolve campaign + offset_seconds từ comment.
    //   2. Nếu STATE.captureStream đã active + có buffered frame nearest → dùng luôn.
    //   3. Nếu không → mở tab FB tại ?t={offset} (FB seek tới đó), prompt user
    //      share tab → capture frame hiện tại của FB tab → POST /snapshot.
    async function _captureAtCommentTime(commentId) {
        const st = global.LiveState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) throw new Error('comment không tồn tại trong state');
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const commentTimeMs = rawT ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN) : NaN;
        if (!Number.isFinite(commentTimeMs)) throw new Error('comment thiếu thời gian');
        const camp = _resolveCampaignForComment(c);
        if (!camp?.Facebook_LiveId) throw new Error('không tìm được campaign');
        const pageObj = st.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        if (!pageObj) throw new Error('không tìm được page');
        const videoInfo = await _fetchLiveVideoInfo(pageObj.Facebook_PageId, camp.Facebook_LiveId);
        if (!videoInfo?.broadcastStartMs) throw new Error('không có broadcastStart');
        const offsetSec = Math.max(
            0,
            Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
        );

        // Path A: đã có stream active + buffered frame nearest → dùng luôn (instant).
        if (STATE.captureStream && STATE.frameBuffer?.length) {
            const buffered = _findNearestBufferedFrame(commentTimeMs, 60000);
            if (buffered?.blob) {
                _toast('⚡ Dùng buffered frame...', 'ok');
                await _postCapturedSnap({
                    commentId,
                    customerFbUserId: c.from.id,
                    customerName: c.from.name || '?',
                    commentTimeMs,
                    offsetSec,
                    pageObj,
                    camp,
                    videoInfo,
                    imageBase64: await _blobToBase64(buffered.blob),
                    message: c.message,
                });
                return;
            }
        }

        // Path B: backend yt-dlp + ffmpeg extract (no user action, 5-15s).
        // Tạo snap metadata trước → enqueue extract-frame backend → SSE
        // 'extract-done' tự render thumb. KHÔNG cần share FB tab.
        _toast('⏳ Backend đang extract frame (5-15s)...', 'ok');
        const snapId = await _createMetadataSnap({
            commentId,
            customerFbUserId: c.from.id,
            customerName: c.from.name || '?',
            commentTimeMs,
            offsetSec,
            pageObj,
            camp,
            videoInfo,
            message: c.message,
        });
        if (snapId) {
            try {
                const r = await fetch(API + '/api/livestream/extract-frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify({ snapshotIds: [snapId] }),
                });
                const d = await r.json();
                if (d.success && d.queued > 0) {
                    // SSE sẽ notify 'extract-done' → strip auto-refresh.
                    return;
                }
                if (r.status === 503) {
                    _toast(
                        '⚠ Backend extract chưa sẵn sàng (đang deploy) — dùng path manual',
                        'err'
                    );
                } else {
                    console.warn('[snap] extract-frame skip:', d.error || 'unknown');
                }
            } catch (e) {
                console.warn('[snap] extract-frame fail, fallback path C:', e.message);
            }
        }

        // Path C: mở FB tab @ offset → user share → capture (last resort).
        const slug = _resolvePageVanity(pageObj) || pageObj.Facebook_PageId;
        const videoIdShort = String(camp.Facebook_LiveId).replace(/^\d+_/, '');
        const fbUrl = `https://www.facebook.com/${slug}/videos/${videoIdShort}/?t=${offsetSec}&locale=vi_VN`;
        const fbWin = window.open(fbUrl, '_blank');
        if (!fbWin) {
            throw new Error('Trình duyệt chặn popup. Cho phép popup rồi thử lại.');
        }
        _toast(
            `📺 Đã mở FB tại ${Math.floor(offsetSec / 60)}m${offsetSec % 60}s — chọn tab vừa mở khi browser hỏi share`,
            'ok'
        );
        // Đợi 4s để FB load + seek tới offset trước khi prompt share.
        await new Promise((r) => setTimeout(r, 4000));
        try {
            await ensureCaptureStream();
        } catch (e) {
            throw new Error('User hủy share: ' + e.message);
        }
        // Đợi thêm 1.5s cho video render frame sau share.
        await new Promise((r) => setTimeout(r, 1500));
        const imageBase64 = await _captureFrameJpeg(0.72, 1280);
        if (!imageBase64) throw new Error('Capture frame fail (video chưa load?)');
        await _postCapturedSnap({
            commentId,
            customerFbUserId: c.from.id,
            customerName: c.from.name || '?',
            commentTimeMs,
            offsetSec,
            pageObj,
            camp,
            videoInfo,
            imageBase64,
            message: c.message,
        });
        _toast('✅ Đã chụp + lưu snapshot', 'ok');
    }

    // Tạo snap metadata-only (no image_data) → trả về snapshotId để dùng cho
    // extract-frame backend. Idempotent qua skipExisting (offline-batch).
    async function _createMetadataSnap(p) {
        try {
            const r = await fetch(API + '/api/livestream/offline-batch', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'omit',
                body: JSON.stringify({
                    pageId: p.pageObj.Facebook_PageId,
                    pageName: p.pageObj.Name,
                    pageUsername: _resolvePageVanity(p.pageObj),
                    liveCampaignId: p.camp.Id ? String(p.camp.Id) : null,
                    liveVideoId: p.camp.Facebook_LiveId,
                    broadcastStartMs: p.videoInfo.broadcastStartMs,
                    thumbnailUrl: undefined, // KHÔNG lưu URL generic
                    comments: [
                        {
                            commentId: p.commentId,
                            customerFbUserId: p.customerFbUserId,
                            customerName: p.customerName,
                            createdTime: p.commentTimeMs,
                            message: p.message ? String(p.message).slice(0, 200) : '',
                        },
                    ],
                    skipExisting: true,
                    user: _user(),
                }),
            });
            const d = await r.json();
            if (!d.success) return null;
            // Trả về snap ID (created mới hoặc đã exist).
            const id = d.created?.[0]?.snapshotId || d.skipped?.[0]?.snapshotId;
            return id ? Number(id) : null;
        } catch (e) {
            console.warn('[snap] create metadata fail:', e.message);
            return null;
        }
    }

    async function _postCapturedSnap(p) {
        const r = await fetch(API + '/api/livestream/snapshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'omit',
            body: JSON.stringify({
                commentId: p.commentId,
                customerFbUserId: p.customerFbUserId,
                customerName: p.customerName,
                pageId: p.pageObj.Facebook_PageId,
                pageName: p.pageObj.Name,
                pageUsername: _resolvePageVanity(p.pageObj),
                liveCampaignId: p.camp.Id ? String(p.camp.Id) : null,
                liveVideoId: p.camp.Facebook_LiveId,
                capturedAt: p.commentTimeMs,
                offsetSeconds: p.offsetSec,
                thumbnailUrl: p.videoInfo.thumbnailUrl || undefined,
                user: _user(),
                imageBase64: p.imageBase64,
                imageMime: 'image/jpeg',
                note: p.message ? String(p.message).slice(0, 200) : null,
            }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'snapshot create fail');
        // Invalidate cache + re-render strip (sẽ thấy ảnh self-served).
        STATE.snapByComment.delete(p.commentId);
        _queueSnapByComment(p.commentId);
    }

    // =====================================================
    // CLIENT-SIDE FORCE EXTRACT (2026-06-06)
    // Backend yt-dlp/Graph bị FB chặn (anonymous datacenter, token Bad signature).
    // FB auth chỉ tồn tại ở browser → seek iframe FB VOD (plugin &t=offset, đã auth)
    // tới đúng giây từng comment → capture frame (extension/getDisplayMedia, crop
    // wrapper) → POST imageBase64 (bytea). Không cần yt-dlp/cookies/Graph.
    // Lưu ý: &t= seek chỉ ăn trên VOD (live đã end). Live đang chạy → auto-snap lo.
    // =====================================================
    // -----------------------------------------------------
    // FB SDK Embedded Video Player — seek/capture cho force extract.
    //
    // FIX 2026-06-11 (user: "chụp đúng 1 kiểu iframe offline"): iframe plugin
    // thuần KHÔNG autoplay VOD đã end (chỉ autoplay LIVE) → mọi capture là CÙNG
    // 1 tấm poster có nút ▶, và `&t=` plugin param không được FB hỗ trợ → 283
    // thumbnail giống hệt nhau vẫn POST "✓". Verify thật trên page: cả
    // autoplay=true lẫn t-trong-href đều đứng poster; trong khi FB JS SDK
    // XFBML player (`xfbml.ready` → instance.play()/seek()/getCurrentPosition)
    // play + seek VOD muted OK (đo: seek(600) → pos 602 → 604 đang chạy).
    // Bonus: 1 video = 1 player, seek nhiều offset KHÔNG reload iframe (~2s/
    // comment thay vì ~10s).
    // -----------------------------------------------------
    let _fbSdkPromise = null;
    const _xfbmlWaiters = new Map(); // div id → resolve(instance)
    function _ensureFbSdk() {
        if (global.FB?.XFBML && _fbSdkPromise) return _fbSdkPromise;
        if (_fbSdkPromise) return _fbSdkPromise;
        _fbSdkPromise = new Promise((resolve, reject) => {
            if (global.FB?.XFBML) return resolve(global.FB);
            const s = document.createElement('script');
            s.src = 'https://connect.facebook.net/en_US/sdk.js#xfbml=0&version=v19.0';
            s.onload = () => resolve(global.FB);
            s.onerror = () => {
                _fbSdkPromise = null;
                reject(new Error('FB SDK load fail'));
            };
            document.head.appendChild(s);
        }).then((FB) => {
            // Subscribe 1 LẦN — route instance về đúng waiter theo div id.
            FB.Event.subscribe('xfbml.ready', (msg) => {
                if (msg?.type === 'video' && msg.id && _xfbmlWaiters.has(msg.id)) {
                    const resolve = _xfbmlWaiters.get(msg.id);
                    _xfbmlWaiters.delete(msg.id);
                    resolve(msg.instance);
                }
            });
            return FB;
        });
        return _fbSdkPromise;
    }

    // Dựng XFBML player trong wrapper capture (thay iframe live). Cache theo
    // video href — cùng video chỉ parse 1 lần, các offset sau chỉ seek().
    // Wrapper GIỮ NGUYÊN element (Region Capture cropTo đã bind vào nó).
    async function _ensureSeekPlayer(camp) {
        const fbVideoUrl = _buildFbLiveUrl(camp);
        if (!fbVideoUrl) throw new Error('không build được URL video');
        if (STATE._seekPlayer && STATE._seekPlayerHref === fbVideoUrl) {
            return STATE._seekPlayer;
        }
        const FB = await _ensureFbSdk();
        if (!FB?.XFBML) throw new Error('FB SDK không sẵn sàng');
        _ensureEmbeddedIframe(camp); // đảm bảo wrapper tồn tại
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (!wrapper) throw new Error('không có wrapper capture');
        const HEADER_OFFSET = 30;
        const divId = 'fbseek_' + Math.random().toString(36).slice(2, 9);
        const host = document.createElement('div');
        host.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:200px;`;
        const div = document.createElement('div');
        div.id = divId;
        div.className = 'fb-video';
        div.setAttribute('data-href', fbVideoUrl);
        div.setAttribute('data-width', '200');
        div.setAttribute('data-allowfullscreen', 'false');
        div.setAttribute('data-show-captions', 'false');
        host.appendChild(div);
        wrapper.innerHTML = ''; // gỡ iframe live (restore lại ở _clientRestoreLive)
        wrapper.appendChild(host);
        STATE._seekPlayer = null;
        STATE._seekPlayerHref = null;
        const instance = await new Promise((resolve, reject) => {
            const t = setTimeout(() => {
                _xfbmlWaiters.delete(divId);
                reject(new Error('xfbml.ready timeout (player không load)'));
            }, 15000);
            _xfbmlWaiters.set(divId, (inst) => {
                clearTimeout(t);
                resolve(inst);
            });
            FB.XFBML.parse(host);
        });
        STATE._seekPlayer = instance;
        STATE._seekPlayerHref = fbVideoUrl;
        return instance;
    }

    // MUTEX: serialize mọi seek/capture trên iframe chung qua promise chain.
    // Force-extract loop + row-click "Lấy thumbnail" chạy song song → seek đè
    // nhau → frame sai offset. Chain đảm bảo 1 seek/capture tại 1 thời điểm.
    let _iframeChain = Promise.resolve();

    // Seek iframe tới offsetSec rồi capture 1 frame. Trả jpegBase64 (no prefix) hoặc null.
    function _clientCaptureAtOffset(camp, offsetSec) {
        const doWork = () => _clientCaptureAtOffsetInner(camp, offsetSec);
        const p = _iframeChain.then(doWork, doWork);
        // Chain không giữ rejection (caller tự handle) — tránh unhandled rejection.
        _iframeChain = p.catch(() => {});
        return p;
    }
    async function _clientCaptureAtOffsetInner(camp, offsetSec) {
        const target = Math.max(0, Number(offsetSec) || 0);
        const player = await _ensureSeekPlayer(camp);
        try {
            player.mute();
        } catch (_) {}
        player.seek(target);
        player.play();
        // Đợi player THẬT SỰ ở offset (poll getCurrentPosition ≤8s) — verify
        // bằng vị trí thay vì chờ cứng → không bao giờ chụp poster ▶ tĩnh.
        let okPos = false;
        for (let i = 0; i < 16; i++) {
            await new Promise((r) => setTimeout(r, 500));
            let pos = NaN;
            try {
                pos = player.getCurrentPosition();
            } catch (_) {}
            if (Number.isFinite(pos) && Math.abs(pos - target) < 30) {
                okPos = true;
                break;
            }
            // Seek đôi khi bị nuốt khi player còn buffering → re-seek giữa chừng.
            if (i === 7) {
                try {
                    player.seek(target);
                    player.play();
                } catch (_) {}
            }
        }
        if (!okPos) throw new Error('player không seek tới offset (buffering/DRM?)');
        await new Promise((r) => setTimeout(r, 600)); // settle frame render
        let frame = null;
        if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
            const blob = await _captureFrameJpeg(0.72, 1280);
            if (blob) frame = await _blobToBase64(blob);
        }
        if (!frame && STATE.extReady) {
            frame = await _captureExtensionFrame();
        }
        try {
            player.pause(); // tiết kiệm bandwidth giữa các offset
        } catch (_) {}
        if (!frame) throw new Error('capture rỗng');
        return frame;
    }

    // Reset wrapper về iframe live thuần sau force-extract (giữ auto-snap buffer
    // chạy tiếp). GIỮ NGUYÊN wrapper element (Region Capture cropTo bind vào nó)
    // — chỉ thay children: gỡ XFBML seek-player → iframe live (live autoplay OK
    // với plugin thuần). Constants khớp _ensureEmbeddedIframe (200 / 30 / 9:16).
    async function _clientRestoreLive(camp) {
        STATE._seekPlayer = null;
        STATE._seekPlayerHref = null;
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (!wrapper || !camp) return;
        const fbVideoUrl = _buildFbLiveUrl(camp);
        if (!fbVideoUrl) return;
        const WRAPPER_W = 200;
        const HEADER_OFFSET = 30;
        const IFRAME_H = Math.round((WRAPPER_W * 16) / 9) + HEADER_OFFSET;
        wrapper.innerHTML = '';
        const iframe = document.createElement('iframe');
        iframe.id = 'live-snap-fb-embed';
        iframe.allow = 'autoplay; encrypted-media; picture-in-picture';
        iframe.scrolling = 'no';
        iframe.frameBorder = '0';
        iframe.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:${WRAPPER_W}px;height:${IFRAME_H}px;display:block;border:0;`;
        iframe.src =
            `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbVideoUrl)}` +
            `&show_text=false&width=${WRAPPER_W}&height=${IFRAME_H}&autoplay=1&mute=1` +
            `&allowfullscreen=false&show_share=false&show_captions=false`;
        wrapper.appendChild(iframe);
    }

    // Lightbox zoom — modal full-screen mở ảnh snapshot + nút "Xem live tại giây X".
    function _openSnapLightbox(data) {
        const existing = document.querySelector('.live-snap-lightbox');
        if (existing) existing.remove();
        const lb = document.createElement('div');
        lb.className = 'live-snap-lightbox';
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
                <button type="button" class="snap-lb-play"
                        data-url="${_esc(data.livestreamUrl || '')}"
                        style="background:#3b82f6;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;text-decoration:none;cursor:pointer;">
                   🔗 Xem live tại giây ${data.offsetSeconds ?? '?'} (${offsetText})
                </button>
                <button type="button" class="snap-lb-close"
                        style="background:rgba(255,255,255,0.15);color:#fff;border:1px solid rgba(255,255,255,0.3);padding:8px 16px;border-radius:6px;font-size:13px;font-weight:600;cursor:pointer;">
                   ✕ Đóng
                </button>
            </div>
        `;
        lb.querySelector('img').addEventListener('click', (e) => e.stopPropagation());
        // Mở FB plugin player trong popup window size cố định (plugin URL stretches
        // full khi mở tab thường vì design cho iframe embed).
        lb.querySelector('.snap-lb-play').addEventListener('click', (e) => {
            e.stopPropagation();
            const url = e.currentTarget.dataset.url;
            if (!url) return;
            window.open(
                url,
                'fbVideoPlayer',
                'width=480,height=860,toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=no'
            );
        });
        // closeLb dùng cho MỌI path đóng (Escape / nút ✕ / click backdrop) để
        // listener keydown luôn được gỡ — không leak khi đóng bằng chuột.
        const closeLb = () => {
            lb.remove();
            document.removeEventListener('keydown', escClose);
        };
        const escClose = (e) => {
            if (e.key === 'Escape') closeLb();
        };
        lb.querySelector('.snap-lb-close').addEventListener('click', closeLb);
        lb.addEventListener('click', closeLb);
        document.addEventListener('keydown', escClose);
        document.body.appendChild(lb);
    }

    // Update strip cho mọi visible row của customerFbUserId — gọi sau auto-snap mới.
    function _refreshThumbStripsForCustomer(customerFbUserId) {
        document
            .querySelectorAll(
                `.live-conversation-item[data-customer-fb-id="${CSS.escape(customerFbUserId)}"], .live-conversation-item .live-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
            )
            .forEach((el) => {
                const row = el.closest('.live-conversation-item');
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
    // filterCommentId (optional): chỉ hiện snapshot match đúng comment đó
    // (không list toàn bộ snapshots của KH). Click badge 📸 → pass commentId
    // của row; nếu null → fallback hiện all (legacy behavior).
    async function togglePopover(customerFbUserId, customerName, anchor, filterCommentId) {
        const popoverKey = filterCommentId
            ? `${customerFbUserId}:${filterCommentId}`
            : customerFbUserId;
        const existing = document.querySelector('.live-snap-popover');
        if (existing && STATE.popoverOpen === popoverKey) {
            existing.remove();
            STATE.popoverOpen = null;
            return;
        }
        if (existing) existing.remove();
        STATE.popoverOpen = popoverKey;

        const pop = document.createElement('div');
        pop.className = 'live-snap-popover';
        pop.dataset.filterCommentId = filterCommentId || '';
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

        await _refreshPopoverContent(customerFbUserId, filterCommentId);
    }

    async function _refreshPopoverContent(customerFbUserId, filterCommentId) {
        const pop = document.querySelector('.live-snap-popover');
        if (!pop) return;
        const body = pop.querySelector('.snap-pop-body');
        // Param filterCommentId optional. Nếu không pass, đọc từ pop.dataset
        // (case refresh từ SSE 'extract-done' không biết filter).
        if (filterCommentId === undefined) {
            filterCommentId = pop.dataset.filterCommentId || '';
        }
        try {
            const r = await fetch(
                API +
                    '/api/livestream/snapshots?customerFbUserId=' +
                    encodeURIComponent(customerFbUserId) +
                    '&limit=30',
                { credentials: 'omit' }
            );
            const d = await r.json();
            const allSnapshots = d.snapshots || [];
            STATE.cacheList.set(customerFbUserId, allSnapshots);
            // Filter theo commentId nếu có → chỉ hiện snapshot của comment đó.
            // Snapshot có field commentId (Postgres snake_case 'comment_id'
            // → API alias 'commentId'). String compare để robust với numeric/text.
            const list = filterCommentId
                ? allSnapshots.filter((s) => String(s.commentId || '') === String(filterCommentId))
                : allSnapshots;
            // Phase 3 G: smart auto-fill — snap không có bytea + chưa extract →
            // enqueue background extract. UI sẽ tự update khi SSE 'extract-done'.
            const needExtract = list
                .filter((s) => {
                    const hasBytea =
                        s.thumbnailUrl && s.thumbnailUrl.includes('/api/livestream/snapshot/');
                    const alreadyTried = ['pending', 'fail', 'drm_blocked'].includes(
                        s.extractStatus
                    );
                    return !hasBytea && !alreadyTried;
                })
                .map((s) => Number(s.id))
                .filter(Number.isFinite);
            if (needExtract.length) {
                fetch(API + '/api/livestream/extract-frame', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify({ snapshotIds: needExtract }),
                }).catch(() => {});
            }
            if (!list.length) {
                body.innerHTML = `<div style="color:#94a3b8;font-style:italic;text-align:center;padding:14px 0;">Chưa có snapshot nào.<br>Bấm 📸 trên comment để bắt đầu.</div>`;
                return;
            }
            body.innerHTML = list
                .map((s) => {
                    const t = new Date(s.capturedAt).toLocaleString('vi-VN', {
                        hour12: false,
                        timeZone: 'Asia/Ho_Chi_Minh',
                    });
                    const url = s.livestreamUrl || '#';
                    // CHỈ hiển thị thumbnail nếu là URL self-served (frozen bytea — ảnh thật).
                    // URL khác (FB CDN signed, FB Graph) đều coi như chưa có → placeholder.
                    const isFrozenThumb =
                        s.thumbnailUrl && s.thumbnailUrl.includes('/api/livestream/snapshot/');
                    let thumb;
                    if (isFrozenThumb) {
                        thumb = `<img class="snap-pop-thumb" src="${_esc(s.thumbnailUrl)}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:6px;background:#f1f5f9;cursor:zoom-in;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" /><span style="display:none;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`;
                    } else if (s.extractStatus === 'drm_blocked') {
                        thumb = `<span title="Video bị DRM bảo vệ — không extract được tự động. Share FB tab khi đang live để dùng buffered frame." style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#fef2f2;color:#991b1b;align-items:center;justify-content:center;font-size:18px;border:1px dashed #fca5a5;">🔒</span>`;
                    } else if (s.extractStatus === 'live_active') {
                        thumb = `<span title="Live đang chạy — chưa seek backward được. Backend sẽ retry mỗi giờ; sau khi live end (VOD) tự fill ảnh. Muốn ngay → share tab FB qua chip 🎬." style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#fef9c3;color:#854d0e;align-items:center;justify-content:center;font-size:18px;border:1px dashed #fde047;">🔴</span>`;
                    } else if (s.extractStatus === 'pending') {
                        thumb = `<span title="Backend đang extract frame (5-15s)..." style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#eff6ff;color:#1e40af;align-items:center;justify-content:center;font-size:18px;border:1px dashed #93c5fd;">⏳</span>`;
                    } else if (s.extractStatus === 'fail') {
                        thumb = `<span title="Extract fail — bấm 📸 trên comment để thử lại manual" style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#fef3c7;color:#92400e;align-items:center;justify-content:center;font-size:18px;border:1px dashed #fcd34d;">⚠</span>`;
                    } else {
                        thumb = `<span title="Chưa có ảnh — backend sẽ tự extract" style="display:inline-flex;width:54px;height:54px;border-radius:6px;background:#fef3c7;color:#92400e;align-items:center;justify-content:center;font-size:18px;border:1px dashed #fcd34d;">📸</span>`;
                    }
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
                                <button type="button" class="snap-pop-play" data-url="${_esc(url)}" title="Mở FB plugin player (popup 480×860 portrait-friendly) tại thời điểm chụp" style="font-size:10px;color:#fff;background:#1877f2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;text-align:center;">▶ Xem</button>
                                <button type="button" class="snap-pop-refresh" data-id="${s.id}" title="Refresh thumbnail từ FB Graph (lazy fetch hiện tại)" style="font-size:10px;color:#0c4a6e;background:#e0f2fe;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">🔄</button>
                                <button type="button" class="snap-pop-del" data-id="${s.id}" title="Xóa snapshot" style="font-size:10px;color:#dc2626;background:#fee2e2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">Xóa</button>
                            </div>
                        </div>`;
                })
                .join('');
            // Hover zoom — preview ảnh 480x270 cạnh thumbnail khi user di chuột.
            body.querySelectorAll('.snap-pop-thumb').forEach((img) => {
                img.addEventListener('mouseenter', () => _showZoomPreview(img));
                img.addEventListener('mousemove', () => _showZoomPreview(img));
                img.addEventListener('mouseleave', _hideZoomPreview);
            });

            // ▶ Xem button: open FB plugin player trong popup window size 820x520
            // (URL plugin/video.php khi mở tab thường stretches full → xấu).
            body.querySelectorAll('.snap-pop-play').forEach((btn) => {
                btn.onclick = (e) => {
                    e.stopPropagation();
                    const url = btn.dataset.url;
                    if (!url) return;
                    window.open(
                        url,
                        'fbVideoPlayer',
                        'width=480,height=860,toolbar=no,menubar=no,location=no,status=no,resizable=yes,scrollbars=no'
                    );
                };
            });

            // 🔄 button giờ trigger backend extract-frame (yt-dlp + ffmpeg) thay vì
            // fetch thumbnail URL. Frame extract tại đúng offset_seconds → bytea.
            body.querySelectorAll('.snap-pop-refresh').forEach((btn) => {
                btn.onclick = async (e) => {
                    e.stopPropagation();
                    const id = btn.dataset.id;
                    const origText = btn.textContent;
                    btn.textContent = '...';
                    btn.disabled = true;
                    try {
                        const r = await fetch(API + '/api/livestream/extract-frame', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            credentials: 'omit',
                            body: JSON.stringify({ snapshotIds: [Number(id)] }),
                        });
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        _toast('⏳ Backend đang extract (5-15s)...', 'ok');
                        // SSE 'extract-done' sẽ refresh popover tự động.
                    } catch (err) {
                        _toast('Extract fail: ' + err.message, 'err');
                    } finally {
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
    // Gọi sau khi LiveCommentList render xong.
    // -----------------------------------------------------
    function injectSnapButtonsAll() {
        document.querySelectorAll('.live-conversation-item').forEach((row) => {
            injectSnapButton(row);
        });
    }
    function injectSnapButton(row) {
        if (!row || row.querySelector('.live-snap-btn')) return;
        const commentId = row.dataset.commentId;
        if (!commentId) return;
        const st = global.LiveState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) return;
        const customerFbUserId = c.from.id;
        const customerName = c.from.name || '?';

        // Mount kế bên badge "Ẩn" / orderBadge trong .live-conv-header (user yêu cầu).
        // Tag style để fit visually với các badge khác (House, Ẩn, Cảnh báo).
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'live-snap-btn';
        btn.dataset.customerId = customerFbUserId;
        btn.title = `📸 Snap livestream cho KH ${customerName}\nAuto mode ON: click → xem snapshot của comment này (chỉ 1)\nAuto mode OFF: click → chụp ngay\nShift+click / right-click: xem TẤT CẢ snapshot của KH`;
        // Inline SVG (lucide:camera) — KHÔNG dùng <i data-lucide> + lucide.createIcons()
        // vì createIcons() scan toàn bộ DOM mỗi call → 100 rows = 100 scan = lag.
        btn.innerHTML =
            '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-1px;"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>';
        // ẨN visually (display:none) — primary UI giờ là inline thumbnail (hover
        // zoom + click lightbox). Badge giữ logic để DOM query / event listener
        // không break, revive bằng cách đổi display:inline-flex.
        btn.style.cssText =
            'display:none;align-items:center;gap:3px;background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;border-radius:5px;padding:1px 6px;font-size:11px;font-weight:600;cursor:pointer;margin-left:4px;line-height:1;position:relative;';
        btn.onclick = (e) => {
            e.stopPropagation();
            // Auto mode ON (default) → click → view popover (snap đã chạy tự động
            // qua eventBus, không cần snap thủ công nữa). Shift / right-click vẫn
            // luôn view list. Auto OFF → click → snap thủ công như cũ.
            if (e.shiftKey || _isAutoMode()) {
                // Filter theo commentId → chỉ hiện snapshot của ĐÚNG comment.
                // Shift+click bypass filter → xem all snapshots của KH.
                togglePopover(customerFbUserId, customerName, btn, e.shiftKey ? null : commentId);
            } else {
                const commentTime = c?.created_time
                    ? SharedUtils.toEpochMs(c.created_time) || null
                    : c?.createdTime
                      ? Number(c.createdTime)
                      : null;
                snap(customerFbUserId, customerName, commentId, btn, {
                    commentTime: commentTime && Number.isFinite(commentTime) ? commentTime : null,
                    comment: c || undefined,
                });
            }
        };
        // Right-click → show popover (all snapshots, không filter)
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            togglePopover(customerFbUserId, customerName, btn);
        };

        // Mount: cuối .live-conv-header (cạnh badge "Ẩn") theo yêu cầu user.
        // Fallback các action-buttons container nếu header không tìm thấy.
        const header = row.querySelector('.live-conv-header');
        if (header) {
            header.appendChild(btn);
        } else {
            const actions =
                row.querySelector('.live-action-buttons') ||
                row.querySelector('.live-actions') ||
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
            badge.className = 'live-snap-count';
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
    // Scope observer chặt: tìm container comment list (Live render trong đó).
    // Fallback document.body nếu container chưa có. Re-attach khi container xuất
    // hiện. Tránh observe whole document → giảm 10-100x mutation callbacks.
    function _findCommentContainer() {
        return (
            document.getElementById('liveCommentList') ||
            document.querySelector('.live-comment-list') ||
            document.querySelector('[class*="live-comment"]') ||
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
                    if (n.matches?.('.live-conversation-item')) {
                        (newRows ||= []).push(n);
                    } else {
                        const inner = n.querySelectorAll?.('.live-conversation-item');
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
        // Nếu chưa scope được container Live, retry tới khi container xuất hiện.
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
            const data = msg?.data || {};
            const { customerFbUserId, action, snapshotId } = data;
            // Extract-done (Phase 2): backend ffmpeg vừa lưu bytea cho snapshot →
            // invalidate cache + re-render strip để hiện thumb thật.
            if (action === 'extract-done' && snapshotId) {
                // Tìm comment id của snap này (cache by-comment-ids đã có).
                for (const [cid, snap] of STATE.snapByComment) {
                    if (snap?.id === snapshotId || String(snap?.id) === String(snapshotId)) {
                        STATE.snapByComment.delete(cid);
                        _queueSnapByComment(cid);
                        break;
                    }
                }
                _toast('✅ Frame extract xong (backend)', 'ok');
                return;
            }
            if (!customerFbUserId) return;
            STATE.cacheList.delete(customerFbUserId);
            refreshCounts([customerFbUserId]);
            if (STATE.popoverOpen === customerFbUserId) {
                _refreshPopoverContent(customerFbUserId);
            }
            _refreshThumbStripsForCustomer(customerFbUserId);
        });
    }

    // Event delegation cho nút "Lấy thumbnail" (.live-snap-extract-one-btn) —
    // 1 listener trên document, sống qua mọi re-render của list comment. Capture
    // phase + stopPropagation để chặn row onclick (selectComment) như listener cũ.
    function _wireSnapDelegation() {
        if (_wireSnapDelegation._done) return;
        _wireSnapDelegation._done = true;
        document.addEventListener(
            'click',
            (e) => {
                const btn = e.target.closest?.('.live-snap-extract-one-btn');
                if (!btn) return;
                e.stopPropagation();
                e.preventDefault();
                if (btn.disabled) return;
                const commentId = btn.dataset.commentId;
                if (!commentId) return;
                _extractThumbnailForComment(commentId, btn).catch((err) => {
                    console.warn('[snap-extract-one] fail:', err.message);
                    _toast('Lỗi lấy thumbnail: ' + err.message, 'err');
                    btn.disabled = false;
                    btn.innerHTML = '📸 <span>Lấy thumbnail</span>';
                });
            },
            true
        );
    }

    // -----------------------------------------------------
    // Init
    // -----------------------------------------------------
    function init() {
        setupObserver();
        subscribeSSE();
        _wireSnapDelegation();
        _subscribeLockSse(); // máy khác cướp capture lock → máy này tự dừng
        // Subscribe Live new-comment event cho auto-mode (lazy — eventBus có thể
        // chưa setup tại DOMContentLoaded, fail-safe retry).
        // Cũng subscribe campaignsChanged để re-trigger _maybeShowAutoSnapBanner()
        // ngay khi user chọn campaign (user feedback 2026-05-26: nếu chọn campaign
        // sau khi poll timeout 60s, iframe không tự tạo → phải refresh).
        const subscribeNewComment = () => {
            if (global.eventBus?.on) {
                global.eventBus.on('live:newComment', _handleNewCommentAuto);
                global.eventBus.on('live:campaignsChanged', () => {
                    // Reset autoSnapStarting để cho phép retry (vd lần trước fail
                    // hoặc campaign cũ không có Facebook_LiveId).
                    if (!STATE.captureStream && !STATE.frameBufferTimer) {
                        STATE.autoSnapStarting = false;
                        console.log('[snap] campaignsChanged → re-trigger auto-snap');
                        _maybeShowAutoSnapBanner();
                    }
                });
                console.log('[snap] subscribed to live:newComment + live:campaignsChanged');
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
        // Retry mount chip 10s — Live header (#liveContent / .live-header-bar)
        // có thể chưa render tại DOMContentLoaded. Retry interval 500ms tới khi
        // host appears, max 20 attempts.
        let attempts = 0;
        const mountTimer = setInterval(() => {
            attempts++;
            const c1 = ensureHeaderChip();
            const c2 = ensureRealSnapChip();
            const c3 = ensureAutoModeChip();
            const c4 = ensureBackfillChip();
            const c5 = ensureForceExtractChip();
            if ((c1 && c2 && c3 && c4 && c5) || attempts >= 20) {
                clearInterval(mountTimer);
                console.log('[snap] chips mount done after', attempts, 'attempts');
            }
        }, 500);
        // FULL AUTO: đợi liveCampaigns load → tự bật embedded capture (no popup,
        // no manual click). Retry mỗi 3s, persistent cho tới khi capture chạy.
        // User feedback 2026-05-26: bỏ timeout 60s — nếu user chọn campaign trễ
        // (sau popup, đọc menu, etc.) poll dead → iframe không tự tạo. Giờ poll
        // sống mãi đến khi capture started; cũng có 'campaignsChanged' event
        // listener re-trigger ngay khi user thay đổi selection.
        // Cadence 2 pha: 3s trong 10 phút đầu (bắt capture sớm), sau đó hạ
        // xuống 30s nhưng KHÔNG chết — máy standby phải còn cơ hội takeover
        // khi máy leader chết/stall (TTL 90s hết → acquire CAS thành công).
        // User báo 2026-06-11: "máy giữ lock nhưng không capture → không máy
        // nào chụp" — một phần vì poll cũ dừng hẳn sau 10 phút.
        const bannerStart = Date.now();
        let bannerTick = 0;
        const bannerTimer = setInterval(() => {
            bannerTick++;
            // Sau 10 phút: chỉ chạy mỗi tick thứ 10 (≈30s) — nhẹ cho lock API.
            if (Date.now() - bannerStart > 600000 && bannerTick % 10 !== 0) return;
            if (STATE.captureStream || STATE.frameBufferTimer) {
                clearInterval(bannerTimer);
                return;
            }
            // Cheap local check TRƯỚC mọi network call: chỉ tiếp khi có live
            // campaign load. (_maybeShowAutoSnapBanner cũng tự check
            // _findActiveLiveCampaign — local — trước khi đụng lock API.)
            const st = global.LiveState;
            if (st?.liveCampaigns?.length > 0) {
                _maybeShowAutoSnapBanner();
            }
        }, 3000);
        // Initial inject ngay cho rows hiện có (nếu Live đã render trước script).
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

    // -----------------------------------------------------
    // Public capture API cho kho "Hình Livestream" (live-livestream-gallery.js)
    // -----------------------------------------------------
    // Lấy 1 frame từ khung iframe FB live đang nhúng. Priority:
    //   1. captureStream (getDisplayMedia) → frame chính xác, tab inactive OK
    //   2. extension captureVisibleTab → crop iframe (tab focused only)
    //   3. frame buffered mới nhất (lag vài giây nhưng luôn có khi đang capture)
    // Returns { jpegBase64, capturedAt } | null nếu không có nguồn frame nào.
    async function captureCurrentFrame() {
        if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
            try {
                const blob = await _captureFrameJpeg(0.8, 1280);
                if (blob) return { jpegBase64: await _blobToBase64(blob), capturedAt: Date.now() };
            } catch (e) {
                console.warn('[gallery-capture] stream frame fail:', e.message);
            }
        }
        if (STATE.extReady) {
            try {
                const jpegBase64 = await _captureExtensionFrame(85);
                if (jpegBase64) return { jpegBase64, capturedAt: Date.now() };
            } catch (e) {
                console.warn('[gallery-capture] ext frame fail:', e.message);
            }
        }
        // Buffer giữ Blob — convert base64 để giữ public API shape (gallery).
        const latest = STATE.frameBuffer?.[STATE.frameBuffer.length - 1];
        if (latest?.blob) {
            try {
                return {
                    jpegBase64: await _blobToBase64(latest.blob),
                    capturedAt: latest.capturedAt,
                };
            } catch (_) {}
        }
        return null;
    }

    // Resolve campaign context hiện tại (theo Snap page pref → active campaign).
    // Returns { pageId, pageName, liveCampaignId, liveCampaignName, liveVideoId } | null
    function getCurrentCampaignContext() {
        const st = global.LiveState;
        const pageObj = _resolvePageObj();
        const camp = (pageObj && _resolveActiveCampaign(pageObj)) || _findActiveLiveCampaign();
        if (!camp) return null;
        const resolvedPage =
            pageObj ||
            st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) ||
            st?.selectedPage;
        return {
            pageId: resolvedPage?.Facebook_PageId || camp.Facebook_UserId || null,
            pageName: resolvedPage?.Name || null,
            pageUsername: resolvedPage ? _resolvePageVanity(resolvedPage) : null,
            liveCampaignId: camp.Id ? String(camp.Id) : null,
            liveCampaignName: camp.Name || null,
            liveVideoId: camp.Facebook_LiveId || null,
        };
    }

    // Offset (giây) từ broadcast start tới NOW — cho fallback metadata-only.
    // Returns number | null.
    async function getCurrentOffsetSeconds(ctx) {
        try {
            if (!ctx?.pageId || !ctx?.liveVideoId) return null;
            const info = await _fetchLiveVideoInfo(ctx.pageId, ctx.liveVideoId);
            if (!info?.broadcastStartMs) return null;
            const sec = Math.floor((Date.now() - info.broadcastStartMs) / 1000);
            return sec > 0 ? sec : null;
        } catch {
            return null;
        }
    }

    global.LiveLivestreamSnap = {
        snap,
        togglePopover,
        refreshCounts,
        injectSnapButtonsAll,
        _getSnapPagePref,
        _setSnapPagePref,
        _setInlineThumb,
        _isInlineThumbOn,
        // Public API cho kho Hình Livestream
        captureCurrentFrame,
        getCurrentCampaignContext,
        getCurrentOffsetSeconds,
        // Auto offline backfill thumbnail theo thời gian (gọi từ live-init khi
        // load campaign đã end). silent:true → không toast.
        offlineBatchAll,
        // Debug accessors cho test scripts (entry buffer: { capturedAt, blob })
        _getStreamActive: () => !!STATE.captureStream,
        _getBufferCount: () => STATE.frameBuffer?.length || 0,
        _getLatestFrame: () => STATE.frameBuffer?.[STATE.frameBuffer.length - 1] || null,
        // Debug leader-lock failover (test scripts): đọc health + ép stall.
        _lockDebug: {
            get: () => ({
                lastFrameAt: STATE.lastFrameAt || 0,
                stallCooldownUntil: STATE._stallCooldownUntil || 0,
                lockBlockedBy: STATE.lockBlockedBy || null,
                heartbeatOn: !!STATE._lockHbTimer,
                bufferOn: !!STATE.frameBufferTimer,
            }),
            forceStall: () => {
                STATE.lastFrameAt = Date.now() - 10 * 60 * 1000;
            },
            blockFrames: (on) => {
                STATE._debugBlockFrames = !!on;
            },
        },
    };
})();
