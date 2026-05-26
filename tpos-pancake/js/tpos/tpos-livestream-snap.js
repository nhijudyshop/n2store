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
                // Extension v1.0.15+ có <all_urls> → chrome.tabs.captureVisibleTab
                // hoạt động NGẦM, không cần click icon. Set consent flag để skip
                // các modal cũ (đã bị deprecate).
                localStorage.setItem('tpos_stream_consented', '1');
            } else {
                STATE.extReady = false;
                STATE.extOutdated = true;
                console.warn(
                    `[snap-ext] v${data.version} TOO OLD — cần >= v${REQUIRED_EXT_VERSION}`
                );
            }
        } else if (data.type === 'N2_TAB_STREAM_ID' && data.streamId) {
            // Option B: extension popup grab streamId → page tạo MediaStream
            // qua getUserMedia. Stream bound vào tab SPECIFIC → capture mượt
            // dù tab inactive / browser minimize. Replace captureVisibleTab
            // path (chỉ work khi tab focused).
            console.log('[snap-ext] received streamId — switching to stream mode');
            _initStreamFromExtensionStreamId(data.streamId).catch((e) => {
                console.warn('[snap-ext] stream init fail:', e.message);
                _toast('Lỗi kết nối stream extension: ' + e.message, 'err');
            });
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

    // Option B init — page consume streamId từ extension popup, tạo MediaStream
    // qua getUserMedia. Stream bound tab SPECIFIC → tab inactive vẫn capture.
    // Replace captureVisibleTab (chỉ work tab focused). Frame buffer dùng
    // _captureFrameJpeg() (canvas + STATE.captureVideo) như getDisplayMedia path.
    async function _initStreamFromExtensionStreamId(streamId) {
        // Stop existing stream nếu có (re-init when user re-click extension icon)
        if (STATE.captureStream) {
            STATE.captureStream.getTracks().forEach((t) => t.stop());
            STATE.captureStream = null;
        }
        // getUserMedia với chromeMediaSource: 'tab' (legacy syntax, vẫn work MV3
        // cho tab stream ID từ chrome.tabCapture). Chrome 10s deadline kể từ
        // khi getMediaStreamId trả về.
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'tab',
                    chromeMediaSourceId: streamId,
                    maxWidth: 1920,
                    maxHeight: 1080,
                    maxFrameRate: 5,
                },
            },
        });
        STATE.captureStream = stream;
        // Tạo hidden video element + play (giống getDisplayMedia path).
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
        // Listen 'ended' (user closes tab / stream revoked)
        stream.getVideoTracks().forEach((t) => {
            t.addEventListener('ended', () => {
                console.log('[snap-ext] tab stream ended');
                _stopFrameBuffer();
                STATE.captureStream = null;
                renderRealSnapChip();
                // User feedback 2026-05-26: bỏ toast click hint. Khi stream
                // ngắt, poll loop sẽ retry + _showExtPrompt sẽ guide nếu cần.
                _showExtPrompt('missing');
            });
        });
        // Khởi động frame buffer (giờ dùng _captureFrameJpeg, không phải
        // _captureExtensionFrame). Stream-based capture không bị Chrome
        // rate-limit, work khi tab inactive.
        _startFrameBuffer();
        renderRealSnapChip();
        renderAutoModeChip();
        _toast('✅ Stream extension OK — tab inactive vẫn capture', 'ok');
        STATE.extStreamActive = true;
        // Set consent flag → subsequent page loads skip mandatory modal,
        // dùng silent auto-grab qua content script's click listener.
        localStorage.setItem('tpos_stream_consented', '1');
        // Remove any open modal/reminder (đã wire xong)
        document.getElementById('tpos-snap-stream-modal')?.remove();
        document.getElementById('tpos-snap-stream-reminder')?.remove();
    }

    // Reminder banner (non-blocking) — show khi consent đã có nhưng stream
    // chưa wire sau 30s. User chỉ cần click bất kỳ đâu trên trang (content
    // script auto-grab fires) hoặc click banner để trigger grab.
    function _showStreamModeReminder() {
        if (STATE.captureStream) return;
        if (document.getElementById('tpos-snap-stream-reminder')) return;
        const box = document.createElement('div');
        box.id = 'tpos-snap-stream-reminder';
        box.innerHTML = `
            <span style="font-size:16px;margin-right:8px;">🎬</span>
            <span style="flex:1;color:#0c4a6e;font-size:12px;font-weight:600;">Stream chưa kết nối — click đâu cũng được</span>
            <button type="button" style="margin-left:8px;background:#0284c7;color:#fff;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;">Bật ngay</button>
        `;
        box.style.cssText =
            'position:fixed;bottom:16px;right:16px;display:inline-flex;align-items:center;background:#f0f9ff;border:1px solid #7dd3fc;border-radius:10px;padding:8px 12px;box-shadow:0 4px 16px rgba(0,0,0,0.12);z-index:99100;font-family:Inter,system-ui,sans-serif;max-width:360px;';
        document.body.appendChild(box);
        box.querySelector('button').onclick = () => {
            window.postMessage({ type: 'N2_TAB_STREAM_GRAB_REQUEST', _activation: 1 }, '*');
        };
    }

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
        const wrapper = document.getElementById('tpos-snap-fb-wrapper');
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
        document.querySelectorAll('.tpos-conversation-item[data-comment-id]').forEach((row) => {
            const cid = row.dataset.commentId;
            if (!cid) return;
            if (STATE.snapByComment.has(cid)) _renderThumbStripFor(cid);
            else _queueSnapByComment(cid);
        });
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

    // Tìm campaign đang LIVE (statusLive=1). Ưu tiên: matching pref page > most recent.
    // Dùng cho 1-click "🎬 Bắt đầu chụp live" — auto chọn live đang chạy.
    function _findActiveLiveCampaign() {
        const st = global.TposState;
        if (!st?.liveCampaigns?.length) return null;
        // Sort by DateCreated desc → live mới nhất trước.
        const sorted = [...st.liveCampaigns].sort(
            (a, b) => new Date(b.DateCreated || 0) - new Date(a.DateCreated || 0)
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
        const st = global.TposState;
        const pageObj = st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        const slug = _resolvePageVanity(pageObj) || camp.Facebook_UserId;
        const videoIdShort = String(camp.Facebook_LiveId).replace(/^\d+_/, '');
        return `https://www.facebook.com/${slug}/videos/${videoIdShort}/`;
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

    // Hover zoom preview cho thumbnail snapshot. Floating 480x270 cạnh thumb,
    // auto-flip sang trái nếu overflow viewport. Shared single element để
    // tránh leak DOM.
    function _showZoomPreview(img) {
        if (!img?.src) return;
        let zoom = document.getElementById('tpos-snap-zoom-preview');
        if (!zoom) {
            zoom = document.createElement('div');
            zoom.id = 'tpos-snap-zoom-preview';
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
        const zoom = document.getElementById('tpos-snap-zoom-preview');
        if (zoom) zoom.style.display = 'none';
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
            'display:none;align-items:center;gap:6px;padding:4px 10px;background:#f3f4f6;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;color:#374151;cursor:pointer;margin-left:6px;user-select:none;';
        // Click chip = đổi mode (NOT toggle stream). Stream tự bật khi user
        // click 📸 trong mode='live' (lazy initialization, OS picker chỉ hiện
        // khi cần thật sự).
        chip.addEventListener('click', async () => {
            // Click 🎬 = 1-click toggle. Dùng EMBEDDED iframe FB live (no tab
            // switch). Nếu đã share/ext-capture → stop + remove iframe.
            if (STATE.captureStream || STATE.frameBufferTimer) {
                stopRealSnap();
                const wrapper = document.getElementById('tpos-snap-fb-wrapper');
                if (wrapper) wrapper.remove();
                _setSnapMode(MODE_LAZY);
                _toast('⏱️ Đã ngắt — auto-snap dùng metadata only', 'ok');
                return;
            }
            _setSnapMode(MODE_LIVE);
            await _enableEmbeddedLiveCapture();
        });
        host.appendChild(chip);
        renderRealSnapChip();
        renderAutoModeChip();
        return chip;
    }
    function renderRealSnapChip() {
        const chip = document.getElementById('tpos-snap-real-chip');
        if (!chip) return;
        const streamReady = !!STATE.captureStream || !!STATE.frameBufferTimer;
        const bufSize = STATE.frameBuffer?.length || 0;
        const viaExtStream = !!STATE.extStreamActive && !!STATE.captureStream;
        const viaExtTab = STATE.extReady && !STATE.captureStream && !!STATE.frameBufferTimer;
        if (streamReady) {
            const sourceLabel = viaExtStream ? 'EXT stream' : viaExtTab ? 'EXT tab' : 'LIVE linked';
            chip.innerHTML = `<span style="display:inline-block;width:8px;height:8px;background:#dc2626;border-radius:50%;animation:snap-pulse 1.4s ease-in-out infinite;"></span> 🎬 ${sourceLabel} · ${bufSize} frames`;
            chip.style.background = '#fee2e2';
            chip.style.borderColor = '#fca5a5';
            chip.style.color = '#991b1b';
            chip.title = viaExtStream
                ? `Extension tab stream — capture mọi lúc dù tab inactive / browser minimize. Buffer giữ 1h. Click chip để NGẮT.`
                : viaExtTab
                  ? `Extension visible tab — chỉ capture khi tpos-pancake là tab focused. Click icon N2Store để upgrade stream mode (tab inactive OK).`
                  : `Stream FB đang link. Mỗi 5s capture 1 frame vào buffer (giữ 1h). Auto-snap dùng frame nearest commentTime.
Click chip để NGẮT stream.`;
        } else {
            chip.innerHTML = `🎬 Bắt đầu chụp live · click 1 cái mở FB + share`;
            chip.style.background = '#fef3c7';
            chip.style.borderColor = '#fcd34d';
            chip.style.color = '#92400e';
            chip.title = `Click: tự mở tab FB live + 3s sau prompt share. Sau khi share, frame buffer chạy → mọi auto-snap dùng frame thật. Không cần làm gì thêm.`;
        }
    }

    // Update buffer count trong chip mỗi 5s khi stream active.
    setInterval(() => {
        if (STATE.captureStream) renderRealSnapChip();
    }, 5000);

    // -----------------------------------------------------
    // Auto-mode chip — khi mới có comment, tự động snap
    // -----------------------------------------------------
    function ensureAutoModeChip() {
        let chip = document.getElementById('tpos-snap-auto-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        // Ép Auto luôn ON, không cho user toggle (yêu cầu UX: tự động chạy).
        if (!_isAutoMode()) _setAutoMode(true);
        chip = document.createElement('div');
        chip.id = 'tpos-snap-auto-chip';
        chip.style.cssText =
            'display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border:1px solid #d1d5db;border-radius:14px;font-size:12px;font-weight:600;user-select:none;';
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
            // KHÔNG pass thumbnailUrl generic — backfill / auto offline chỉ lưu metadata.
            // User dùng button '📸 Chụp' per comment để fill ảnh thật từ FB tab.
            thumbnailUrl: undefined,
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
        let chip = document.getElementById('tpos-snap-force-extract-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-force-extract-chip';
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
        chip.addEventListener('click', async () => {
            // Re-entry guard: nếu đang chạy → block second click. Chip vẫn
            // pointerEvents:none nhưng safety check thêm.
            if (chip.dataset.running === '1') {
                _toast('Force extract đang chạy — đợi xong rồi click lại', 'ok');
                return;
            }
            const camp = _findActiveLiveCampaign();
            const pageObj = _resolvePageObj();
            const body = {};
            if (camp?.Facebook_LiveId) body.liveVideoId = camp.Facebook_LiveId;
            if (pageObj?.Facebook_PageId) body.pageId = pageObj.Facebook_PageId;
            const scope = camp?.Facebook_LiveId
                ? `live "${camp.Name || camp.Facebook_LiveId}"`
                : 'TẤT CẢ lives';
            if (!confirm(`Force re-extract pending snaps trong ${scope}?`)) return;
            chip.dataset.running = '1';
            chip.style.opacity = '0.85';
            chip.style.pointerEvents = 'none';
            chip.innerHTML = `⏳ Queuing...`;
            try {
                const r = await fetch(API + '/api/livestream/extract-all-pending', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    credentials: 'omit',
                    body: JSON.stringify(body),
                });
                const d = await r.json();
                if (!d.success) throw new Error(d.error || 'request failed');
                if (d.queued === 0) {
                    _toast('Không có snap pending nào — tất cả đã extract', 'ok');
                    _resetChip();
                    return;
                }
                const batchId = d.batchId;
                const total = d.queued;
                _toast(`⚡ Queued ${total} snaps — backend chạy song song nhiều worker`, 'ok');
                _renderProgress({}, total);
                // Poll status mỗi 1s, stop khi finished >= total hoặc timeout 10 phút.
                const startMs = Date.now();
                const pollTimer = setInterval(async () => {
                    if (Date.now() - startMs > 10 * 60 * 1000) {
                        clearInterval(pollTimer);
                        _toast('Force extract timeout 10 phút — check backend logs', 'err');
                        _resetChip();
                        return;
                    }
                    try {
                        const sr = await fetch(
                            API +
                                '/api/livestream/extract-status?batchId=' +
                                encodeURIComponent(batchId)
                        );
                        const sd = await sr.json();
                        if (!sd.success || !sd.status) {
                            clearInterval(pollTimer);
                            _resetChip();
                            return;
                        }
                        const s = sd.status;
                        const liveActive = s.liveActive || 0;
                        const finished =
                            (s.done || 0) + (s.failed || 0) + (s.drmBlocked || 0) + liveActive;
                        _renderProgress(s, total);
                        if (finished >= total) {
                            clearInterval(pollTimer);
                            const parts = [];
                            if (s.done > 0) parts.push(`${s.done} OK`);
                            if (s.failed > 0) parts.push(`${s.failed} fail`);
                            if (s.drmBlocked > 0) parts.push(`${s.drmBlocked} DRM`);
                            if (liveActive > 0) parts.push(`${liveActive} live đang chạy`);
                            _toast(`Extract xong: ${parts.join(', ')}`, s.done > 0 ? 'ok' : 'err');
                            // Nếu có errors → log chi tiết ra console + show 1 error trong toast
                            if (s.lastErrors?.length) {
                                console.warn('[force-extract] errors:', s.lastErrors);
                                setTimeout(() => {
                                    _toast(
                                        `Lỗi 1 snap: ${s.lastErrors[0].msg.slice(0, 100)}`,
                                        'err'
                                    );
                                }, 1500);
                            }
                            setTimeout(_resetChip, 3000);
                        }
                    } catch (pe) {
                        console.warn('[force-extract] poll fail:', pe.message);
                    }
                }, 1000);
            } catch (e) {
                _toast('Lỗi force extract: ' + e.message, 'err');
                _resetChip();
            }
        });
        host.appendChild(chip);
        return chip;
    }

    function ensureBackfillChip() {
        let chip = document.getElementById('tpos-snap-backfill-chip');
        if (chip) return chip;
        const host = _ensureFloatingHost();
        if (!host) return null;
        chip = document.createElement('div');
        chip.id = 'tpos-snap-backfill-chip';
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
        // Dedup multi-client: nếu local cache đã có snap với bytea cho commentId
        // → skip POST. Backend DB unique constraint cũng dedup, đây là optimization
        // để giảm POST + giảm capture wasted khi nhiều máy mở cùng trang.
        const existingSnap = STATE.snapByComment.get(commentId);
        if (existingSnap?.thumbnailUrl?.includes('/api/livestream/snapshot/')) {
            console.log('[snap-auto] skip — snap đã có bytea cho commentId', commentId);
            return;
        }
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
            const hasBufferedFrames =
                (STATE.captureStream && STATE.captureVideo?.videoWidth) ||
                (STATE.frameBufferTimer && STATE.frameBuffer?.length > 0);
            if (hasBufferedFrames) {
                // Path 1: real-frame capture từ FB tab đã share / extension.
                // Pass comment.created_time để offset_seconds tính từ moment
                // comment, không phải thời điểm capture frame.
                const rawT =
                    comment.created_time ||
                    comment.createdTime ||
                    comment.inserted_at ||
                    comment.created_at;
                const parsedT = rawT ? new Date(rawT).getTime() : NaN;
                const commentTimeMs = Number.isFinite(parsedT) ? parsedT : Date.now();
                // Lookup buffered frame nearest commentTime. Window 60s (mỗi
                // tick 5s → 12 frames/min, đủ wiggle room cho clock skew giữa
                // FB timestamp và browser local). Comment cũ > 60s → no match.
                let buffered = _findNearestBufferedFrame(commentTimeMs, 60000);
                // Fallback ext mode: nếu buffer rỗng / quá cũ → capture NOW
                // qua extension thay vì gửi snap rỗng (snap không có bytea =
                // không thumbnail). Chrome rate-limit tabs.captureVisibleTab
                // ~2/sec, OK với throttle 30s/KH.
                if (!buffered && STATE.extReady && STATE.frameBufferTimer) {
                    try {
                        const jpegBase64 = await _captureExtensionFrame();
                        if (jpegBase64) {
                            buffered = { capturedAt: Date.now(), jpegBase64 };
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
    // EMBEDDED LIVE CAPTURE (1-click, không nhảy tab)
    // Flow: iframe FB embed ẩn → getDisplayMedia preferCurrentTab → Region
    // Capture API cropTo iframe → stream chỉ chứa video FB → buffer chạy.
    // User chỉ bấm 1 lần "BẤM 1 LẦN", không bao giờ rời tpos-pancake tab.
    // -----------------------------------------------------
    function _ensureEmbeddedIframe(camp) {
        let wrapper = document.getElementById('tpos-snap-fb-wrapper');
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
        const WRAPPER_W = 320;
        const WRAPPER_H = Math.round((WRAPPER_W * 9) / 16); // 180 — 16:9 video area
        const HEADER_OFFSET = 30; // FB plugin header @ width 320 (~30px)
        const IFRAME_W = WRAPPER_W;
        const IFRAME_H = WRAPPER_H + HEADER_OFFSET; // total iframe height = video + header

        const embedUrl = `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(fbVideoUrl)}&show_text=false&width=${IFRAME_W}&height=${IFRAME_H}&autoplay=1&mute=1&allowfullscreen=false&show_share=false&show_captions=false`;
        wrapper = document.createElement('div');
        wrapper.id = 'tpos-snap-fb-wrapper';
        wrapper.style.cssText = `position:fixed;bottom:8px;right:8px;width:${WRAPPER_W}px;height:${WRAPPER_H}px;border:2px solid #dc2626;border-radius:8px;z-index:99000;background:#000;box-shadow:0 4px 12px rgba(0,0,0,0.3);overflow:hidden;`;

        // No scale transform — iframe rendered AT wrapper width (320). Chỉ
        // translate up by HEADER_OFFSET để skip FB plugin header.
        const iframe = document.createElement('iframe');
        iframe.id = 'tpos-snap-fb-embed';
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

    async function _enableEmbeddedLiveCapture() {
        if (STATE.captureStream || STATE.frameBufferTimer) {
            _toast('Đã kết nối rồi', 'ok');
            return true;
        }
        const camp = _findActiveLiveCampaign();
        if (!camp?.Facebook_LiveId) {
            _toast('Không có live nào đang chạy', 'err');
            return false;
        }
        const wrapperExisted = !!document.getElementById('tpos-snap-fb-wrapper');
        const iframe = _ensureEmbeddedIframe(camp);
        if (!iframe) {
            _toast('Không tạo được iframe embed', 'err');
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
            const hint = document.getElementById('tpos-snap-fb-hint');
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
                    const wrapper = document.getElementById('tpos-snap-fb-wrapper');
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
            const hint = document.getElementById('tpos-snap-fb-hint');
            if (hint) hint.remove();
            _toast('✅ Auto-snap đã kết nối — frame thật unique per comment', 'ok');
            return true;
        } catch (e) {
            console.warn('[snap-embed] fail:', e?.message);
            _toast('Hủy share: ' + e.message, 'err');
            // Cleanup wrapper nếu user hủy.
            const wrapper = document.getElementById('tpos-snap-fb-wrapper');
            if (wrapper) wrapper.remove();
            return false;
        }
    }

    // DEPRECATED — user feedback 2026-05-26: bỏ Enter modal, chỉ giữ
    // _showExtPrompt làm nguồn duy nhất. Function giữ làm no-op để tránh
    // ReferenceError nếu có caller cũ.
    function _showStreamModePromptDeprecated_REMOVED() {
        if (STATE.captureStream) return; // đã có stream → không cần
        if (document.getElementById('tpos-snap-stream-modal')) return;
        const overlay = document.createElement('div');
        overlay.id = 'tpos-snap-stream-modal';
        overlay.style.cssText =
            'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.75);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;backdrop-filter:blur(4px);';
        const isMac = /Mac|iPhone|iPad/.test(navigator.platform);
        const shortcutLabel = isMac ? 'Cmd+Shift+S' : 'Ctrl+Shift+S';
        overlay.innerHTML = `
            <div style="background:#fff;border-radius:16px;padding:32px 36px;max-width:520px;width:100%;box-shadow:0 32px 80px rgba(0,0,0,0.4);">
                <div style="display:flex;align-items:center;gap:12px;margin-bottom:12px;">
                    <span style="font-size:32px;">🎬</span>
                    <h3 style="margin:0;font-size:18px;font-weight:800;color:#0f172a;">Bật capture stream — bấm phím tắt</h3>
                </div>
                <p style="margin:0 0 16px;font-size:14px;color:#475569;line-height:1.6;">
                    Chrome yêu cầu <strong>extension invocation</strong> để lấy stream tab (page click không count).
                    Cách dễ nhất: bấm <strong>${shortcutLabel}</strong> 1 lần — sau đó capture chạy tự động dù
                    anh switch sang tab khác / minimize browser.
                </p>
                <div style="background:#fef3c7;border:1px solid #fcd34d;border-radius:10px;padding:14px 16px;margin-bottom:14px;">
                    <div style="font-size:11px;color:#78350f;text-transform:uppercase;letter-spacing:0.5px;font-weight:700;margin-bottom:8px;">Phím tắt (recommended)</div>
                    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                        <kbd style="padding:8px 14px;background:#fff;border:1px solid #cbd5e1;border-bottom-width:3px;border-radius:6px;font-family:ui-monospace,monospace;font-size:14px;font-weight:700;color:#0f172a;">${shortcutLabel}</kbd>
                        <span style="font-size:13px;color:#78350f;font-weight:600;">— Bật stream capture</span>
                    </div>
                </div>
                <div style="background:#f1f5f9;border-radius:10px;padding:12px 14px;margin-bottom:18px;font-size:12px;color:#475569;line-height:1.5;">
                    <strong>Hoặc</strong>: click icon <strong>N2Store</strong> trên thanh extension Chrome →
                    popup tự grab streamId.
                </div>
                <button type="button" id="tpos-snap-stream-modal-go" autofocus style="width:100%;padding:14px 18px;background:linear-gradient(135deg,#0284c7,#0369a1);color:#fff;border:none;border-radius:10px;font-weight:800;font-size:15px;cursor:pointer;box-shadow:0 6px 16px rgba(2,132,199,0.35);">
                    🎬 Thử lại (Enter — best effort)
                </button>
                <div id="tpos-snap-stream-modal-status" style="margin-top:14px;font-size:12px;color:#64748b;line-height:1.5;min-height:18px;text-align:center;"></div>
            </div>`;
        document.body.appendChild(overlay);
        const status = overlay.querySelector('#tpos-snap-stream-modal-status');
        const goBtn = overlay.querySelector('#tpos-snap-stream-modal-go');
        let attempts = 0;
        const triggerGrab = () => {
            attempts++;
            goBtn.disabled = true;
            goBtn.style.opacity = '0.6';
            status.style.color = '#0c4a6e';
            status.textContent = `⏳ Đang grab streamId (attempt ${attempts})...`;
            // Send message in synchronous click/keydown context → activation
            // hopefully propagates.
            window.postMessage({ type: 'N2_TAB_STREAM_GRAB_REQUEST', _activation: 1 }, '*');
            // Timeout 3s — nếu streamId không về thì instruct user click icon.
            const checkTimer = setTimeout(() => {
                if (STATE.captureStream) {
                    status.style.color = '#15803d';
                    status.textContent = '✅ Stream OK — modal sẽ tự đóng.';
                    setTimeout(() => overlay.remove(), 800);
                } else {
                    goBtn.disabled = false;
                    goBtn.style.opacity = '1';
                    status.style.color = '#b91c1c';
                    status.innerHTML = `❌ Chrome reject. Click <strong>icon N2Store</strong> trên thanh extension Chrome → popup tự bật stream.`;
                }
            }, 3000);
            const onStream = (e) => {
                if (e.source !== window || e.data?.type !== 'N2_TAB_STREAM_ID') return;
                clearTimeout(checkTimer);
                status.style.color = '#15803d';
                status.textContent = '✅ Stream OK — modal đóng...';
                window.removeEventListener('message', onStream);
                setTimeout(() => overlay.remove(), 800);
            };
            window.addEventListener('message', onStream);
        };
        goBtn.onclick = triggerGrab;
        // MANDATORY Enter — block ALL key events khác. Escape không dismiss.
        const onKey = (e) => {
            if (!document.getElementById('tpos-snap-stream-modal')) {
                document.removeEventListener('keydown', onKey, true);
                return;
            }
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                triggerGrab();
            }
            // KHÔNG handle Escape — modal không dismiss được.
        };
        document.addEventListener('keydown', onKey, true);
        setTimeout(() => goBtn.focus(), 50);
    }

    // Banner install/update extension. Hiện khi detect live nhưng extension
    // KHÔNG có (5s không nhận EXTENSION_LOADED) hoặc version cũ.
    //
    // User feedback 2026-05-26: "đâu cần click vào extension — đây là bước dư
    // thừa". Đúng — extension v1.0.15+ có <all_urls> host_permissions →
    // chrome.tabs.captureVisibleTab silent KHÔNG cần click icon. Prompt chỉ
    // hướng dẫn cài/update extension (no click instruction).
    function _showExtPrompt(kind) {
        if (sessionStorage.getItem('tpos_ext_prompt_dismiss')) return;
        if (document.getElementById('tpos-snap-ext-prompt')) return;
        const box = document.createElement('div');
        box.id = 'tpos-snap-ext-prompt';
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
                <button type="button" id="tpos-snap-ext-prompt-ok" style="width:100%;padding:6px 12px;background:#ea580c;color:#fff;border:none;border-radius:6px;font-weight:600;font-size:12px;cursor:pointer;">Đã hiểu</button>
            </div>`;
        box.style.cssText =
            'position:fixed;bottom:80px;right:16px;width:340px;background:#fff7ed;border:1px solid #fed7aa;border-radius:12px;padding:14px 16px;box-shadow:0 8px 24px rgba(0,0,0,0.18);z-index:99100;font-family:Inter,system-ui,sans-serif;';
        document.body.appendChild(box);
        document.getElementById('tpos-snap-ext-prompt-ok').onclick = () => {
            sessionStorage.setItem('tpos_ext_prompt_dismiss', '1');
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
        if (STATE.captureStream || STATE.frameBufferTimer) return;
        if (STATE.autoSnapStarting) return;
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
                    _stopFrameBuffer();
                    stopRealSnap();
                    _toast('🔴 Snap thật đã tắt (user dừng share)', 'ok');
                });
            });
            // Khởi động frame buffer — capture 1 frame mỗi 5s, giữ 720 frames
            // (1 tiếng). Mỗi entry { capturedAt: ms, jpegBase64 }. Auto-snap
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
        const wrapper = document.getElementById('tpos-snap-fb-wrapper');
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
        _stopFrameBuffer(); // safe re-init
        STATE.frameBuffer = []; // [{ capturedAt: ms, jpegBase64: string }]
        // Capture path priority:
        //   1. captureStream (Option B: extension streamId via getUserMedia OR
        //      getDisplayMedia) → _captureFrameJpeg via canvas. Best: work khi
        //      tab inactive, no Chrome rate-limit.
        //   2. extension captureVisibleTab → tab-only crop. Chỉ work khi tab
        //      focused. Fallback nếu user chưa click extension icon.
        const tick = async () => {
            // Path 1 — stream-based (Option B: extension streamId OR legacy getDisplayMedia)
            // Best: work khi tab inactive, no Chrome rate-limit.
            if (STATE.captureStream && STATE.captureVideo?.videoWidth) {
                try {
                    const jpegBase64 = await _captureFrameJpeg(0.72, 1280);
                    if (!jpegBase64) return;
                    STATE.frameBuffer.push({ capturedAt: Date.now(), jpegBase64 });
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
                    STATE.frameBuffer.push({ capturedAt: Date.now(), jpegBase64 });
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
        const path = STATE.captureStream
            ? '(stream-based, tab inactive OK)'
            : STATE.extReady
              ? '(extension visible tab, tab focused only)'
              : '(no source)';
        console.log('[snap-buffer] started — capture mỗi', FRAME_BUFFER_INTERVAL_MS, 'ms', path);
    }

    function _stopFrameBuffer() {
        if (STATE.frameBufferTimer) {
            clearInterval(STATE.frameBufferTimer);
            STATE.frameBufferTimer = null;
        }
        if (STATE.frameBuffer) STATE.frameBuffer = [];
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

    // Capture 1 frame từ stream → JPEG base64. Return null nếu stream chưa sẵn.
    async function _captureFrameJpeg(quality = 0.7, maxWidth = 1280) {
        const v = STATE.captureVideo;
        if (!STATE.captureStream || !v || !v.videoWidth) return null;
        const fullW = v.videoWidth;
        const fullH = v.videoHeight;
        // Crop về iframe wrapper region nếu có (tab capture lấy full tab, mình
        // chỉ cần khung iframe live). Nếu wrapper không có (legacy getDisplayMedia
        // đã cropTo từ trước) thì capture full frame.
        const wrapper = document.getElementById('tpos-snap-fb-wrapper');
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
        // Priority 1: caller pass bufferedFrame (auto-mode lookup nearest by commentTime)
        // → mỗi comment có frame unique từ buffer, không phải current frame.
        if (opts.bufferedFrame?.jpegBase64) {
            imageBase64 = opts.bufferedFrame.jpegBase64;
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
                console.warn('[snap] by-comment-ids fail:', e.message);
            }
        }
    }

    function _renderThumbStripFor(commentId) {
        const row = document.querySelector(
            `.tpos-conversation-item[data-comment-id="${CSS.escape(commentId)}"]`
        );
        if (!row) return;
        let strip = row.querySelector('.tpos-snap-thumb-strip');
        if (!_isInlineThumbOn()) {
            if (strip) strip.remove();
            return;
        }
        const data = STATE.snapByComment.get(commentId);
        // Mount slot 1 lần.
        if (!strip) {
            strip = document.createElement('div');
            strip.className = 'tpos-snap-thumb-strip';
            strip.style.cssText =
                'display:inline-flex;align-items:center;flex-shrink:0;margin-left:4px;';
            const info = row.querySelector('.tpos-conv-info');
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
            strip.innerHTML = `
                <img src="${_esc(data.thumbnailUrl)}"
                     alt=""
                     loading="lazy"
                     class="tpos-snap-thumb-img snap-pop-thumb"
                     data-snap-url="${_esc(data.livestreamUrl || '')}"
                     data-snap-offset="${data.offsetSeconds ?? ''}"
                     title="Snapshot lúc Live @ ${offsetText} — hover zoom · click mở lớn"
                     style="width:72px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:zoom-in;display:block;background:#f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.08);"
                     onerror="this.style.background='#fee2e2';this.removeAttribute('src');" />
            `;
            const img = strip.querySelector('img');
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
        // Không có bytea → button "📸 Chụp" ẨN visually (display:none) nhưng giữ
        // chức năng. Auto-snap qua extension/share đã fill ảnh tự động → manual
        // capture hiếm khi cần. Bằng cách này nếu user muốn revive UI sau này
        // chỉ cần đổi 1 CSS rule.
        strip.innerHTML = `
            <button type="button"
                    class="tpos-snap-capture-btn"
                    data-comment-id="${_esc(commentId)}"
                    title="Mở tab FB tại đúng giây comment + share để chụp frame thật"
                    style="display:none;align-items:center;gap:4px;background:#fef3c7;border:1px solid #fcd34d;color:#92400e;padding:3px 8px;border-radius:5px;font-size:11px;font-weight:600;cursor:pointer;line-height:1;height:28px;">
                📸 <span>Chụp</span>
            </button>
        `;
        const btn = strip.querySelector('button');
        if (btn) {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                _captureAtCommentTime(commentId).catch((err) => {
                    console.warn('[snap-capture] fail:', err.message);
                    _toast('Lỗi chụp: ' + err.message, 'err');
                });
            });
        }
    }

    // Chụp frame của FB live tại đúng moment 1 comment.
    // Flow:
    //   1. Resolve campaign + offset_seconds từ comment.
    //   2. Nếu STATE.captureStream đã active + có buffered frame nearest → dùng luôn.
    //   3. Nếu không → mở tab FB tại ?t={offset} (FB seek tới đó), prompt user
    //      share tab → capture frame hiện tại của FB tab → POST /snapshot.
    async function _captureAtCommentTime(commentId) {
        const st = global.TposState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) throw new Error('comment không tồn tại trong state');
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const commentTimeMs = rawT ? new Date(rawT).getTime() : NaN;
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
            if (buffered?.jpegBase64) {
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
                    imageBase64: buffered.jpegBase64,
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
        lb.querySelector('.snap-lb-close').addEventListener('click', () => lb.remove());
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
    // filterCommentId (optional): chỉ hiện snapshot match đúng comment đó
    // (không list toàn bộ snapshots của KH). Click badge 📸 → pass commentId
    // của row; nếu null → fallback hiện all (legacy behavior).
    async function togglePopover(customerFbUserId, customerName, anchor, filterCommentId) {
        const popoverKey = filterCommentId
            ? `${customerFbUserId}:${filterCommentId}`
            : customerFbUserId;
        const existing = document.querySelector('.tpos-snap-popover');
        if (existing && STATE.popoverOpen === popoverKey) {
            existing.remove();
            STATE.popoverOpen = null;
            return;
        }
        if (existing) existing.remove();
        STATE.popoverOpen = popoverKey;

        const pop = document.createElement('div');
        pop.className = 'tpos-snap-popover';
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
        const pop = document.querySelector('.tpos-snap-popover');
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
        // Right-click → show popover (all snapshots, không filter)
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

    // -----------------------------------------------------
    // Init
    // -----------------------------------------------------
    function init() {
        setupObserver();
        subscribeSSE();
        // Subscribe TPOS new-comment event cho auto-mode (lazy — eventBus có thể
        // chưa setup tại DOMContentLoaded, fail-safe retry).
        // Cũng subscribe campaignsChanged để re-trigger _maybeShowAutoSnapBanner()
        // ngay khi user chọn campaign (user feedback 2026-05-26: nếu chọn campaign
        // sau khi poll timeout 60s, iframe không tự tạo → phải refresh).
        const subscribeNewComment = () => {
            if (global.eventBus?.on) {
                global.eventBus.on('tpos:newComment', _handleNewCommentAuto);
                global.eventBus.on('tpos:campaignsChanged', () => {
                    // Reset autoSnapStarting để cho phép retry (vd lần trước fail
                    // hoặc campaign cũ không có Facebook_LiveId).
                    if (!STATE.captureStream && !STATE.frameBufferTimer) {
                        STATE.autoSnapStarting = false;
                        console.log('[snap] campaignsChanged → re-trigger auto-snap');
                        _maybeShowAutoSnapBanner();
                    }
                });
                console.log('[snap] subscribed to tpos:newComment + tpos:campaignsChanged');
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
        const bannerTimer = setInterval(() => {
            if (STATE.captureStream || STATE.frameBufferTimer) {
                clearInterval(bannerTimer);
                return;
            }
            const st = global.TposState;
            if (st?.liveCampaigns?.length > 0) {
                _maybeShowAutoSnapBanner();
            }
        }, 3000);
        // KHÔNG clearInterval timeout — poll sống cho tới khi capture chạy.
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
        // Debug accessors cho test scripts
        _getStreamActive: () => !!STATE.captureStream,
        _getBufferCount: () => STATE.frameBuffer?.length || 0,
        _getLatestFrame: () => STATE.frameBuffer?.[STATE.frameBuffer.length - 1] || null,
    };
})();
