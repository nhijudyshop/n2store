// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-init (orchestrator / entry — public API + side effects + init)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    // Re-entry guard — mirrors original IIFE top guard (init/listeners chỉ chạy 1 lần).
    if (global.LiveLivestreamSnap) return;

    NS._findCommentContainer = function () {
        return (
            document.getElementById('liveCommentList') ||
            document.querySelector('.live-comment-list') ||
            document.querySelector('[class*="live-comment"]') ||
            null
        );
    };

    NS.setupObserver = function () {
        let attached = null;
        let pendingRows = new Set();
        let scheduledFrame = null;
        let scheduledRefresh = null;

        function flushInject() {
            scheduledFrame = null;
            if (!pendingRows.size) return;
            const rows = Array.from(pendingRows);
            pendingRows = new Set();
            for (const r of rows) NS.injectSnapButton(r);
        }

        function scheduleInject(rows) {
            for (const r of rows) pendingRows.add(r);
            if (scheduledFrame) return;
            scheduledFrame = requestAnimationFrame(flushInject);
        }

        function scheduleRefresh() {
            clearTimeout(scheduledRefresh);
            scheduledRefresh = setTimeout(() => {
                if (!document.hidden) NS.refreshCounts();
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
            const target = NS._findCommentContainer() || document.body;
            if (target === attached) return;
            // re-observe ở scope mới
            if (NS.setupObserver._obs) NS.setupObserver._obs.disconnect();
            const obs = new MutationObserver(callback);
            obs.observe(target, { childList: true, subtree: true });
            NS.setupObserver._obs = obs;
            attached = target;
        }

        attach();
        // Nếu chưa scope được container Live, retry tới khi container xuất hiện.
        if (attached === document.body) {
            const retry = setInterval(() => {
                if (NS._findCommentContainer()) {
                    attach();
                    clearInterval(retry);
                }
            }, 1000);
            setTimeout(() => clearInterval(retry), 15000);
        }
    };

    NS.subscribeSSE = function () {
        if (!global.Web2SSE?.subscribe) return;
        global.Web2SSE.subscribe('web2:livestream-snapshots', (msg) => {
            const data = msg?.data || {};
            const { customerFbUserId, action, snapshotId } = data;
            // Admin dọn snapshot (POST /purge | /wipe-all) → clear toàn bộ cache snap
            // + re-queue fetch cho mọi row đang hiển thị → thumbnail đen kẹt biến mất
            // ngay (không cần reload), comment thành "pending" rồi tự chụp lại / force-extract.
            if (action === 'purge' || action === 'wipe-all') {
                NS.STATE.snapByComment.clear();
                NS.STATE.cacheList.clear();
                NS.STATE.counts = {};
                NS.STATE.snapByCommentPending?.clear?.();
                document
                    .querySelectorAll('.live-conversation-item[data-comment-id]')
                    .forEach((row) => {
                        const cid = row.dataset.commentId;
                        if (cid) NS._queueSnapByComment(cid);
                    });
                return;
            }
            // Extract-done (Phase 2): backend ffmpeg vừa lưu bytea cho snapshot →
            // invalidate cache + re-render strip để hiện thumb thật.
            if (action === 'extract-done' && snapshotId) {
                // Tìm comment id của snap này (cache by-comment-ids đã có).
                for (const [cid, snapRow] of NS.STATE.snapByComment) {
                    if (snapRow?.id === snapshotId || String(snapRow?.id) === String(snapshotId)) {
                        NS.STATE.snapByComment.delete(cid);
                        NS._queueSnapByComment(cid);
                        break;
                    }
                }
                NS._toast('✅ Frame extract xong (backend)', 'ok');
                return;
            }
            if (!customerFbUserId) return;
            NS.STATE.cacheList.delete(customerFbUserId);
            NS.refreshCounts([customerFbUserId]);
            if (NS.STATE.popoverOpen === customerFbUserId) {
                NS._refreshPopoverContent(customerFbUserId);
            }
            NS._refreshThumbStripsForCustomer(customerFbUserId);
        });
    };

    NS._wireSnapDelegation = function () {
        if (NS._wireSnapDelegation._done) return;
        NS._wireSnapDelegation._done = true;
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
                NS._extractThumbnailForComment(commentId, btn).catch((err) => {
                    console.warn('[snap-extract-one] fail:', err.message);
                    NS._toast('Lỗi lấy thumbnail: ' + err.message, 'err');
                    btn.disabled = false;
                    btn.innerHTML = '📸 <span>Lấy thumbnail</span>';
                });
            },
            true
        );
    };

    NS.init = function () {
        NS.setupObserver();
        NS.subscribeSSE();
        NS._wireSnapDelegation();
        NS._subscribeLockSse(); // máy khác cướp capture lock → máy này tự dừng
        // Subscribe Live new-comment event cho auto-mode (lazy — eventBus có thể
        // chưa setup tại DOMContentLoaded, fail-safe retry).
        // Cũng subscribe campaignsChanged để re-trigger _maybeShowAutoSnapBanner()
        // ngay khi user chọn campaign (user feedback 2026-05-26: nếu chọn campaign
        // sau khi poll timeout 60s, iframe không tự tạo → phải refresh).
        const subscribeNewComment = () => {
            if (global.eventBus?.on) {
                global.eventBus.on('live:newComment', NS._handleNewCommentAuto);
                global.eventBus.on('live:campaignsChanged', () => {
                    // Reset autoSnapStarting để cho phép retry (vd lần trước fail
                    // hoặc campaign cũ không có Facebook_LiveId).
                    if (!NS.STATE.captureStream && !NS.STATE.frameBufferTimer) {
                        NS.STATE.autoSnapStarting = false;
                        console.log('[snap] campaignsChanged → re-trigger auto-snap');
                        NS._maybeShowAutoSnapBanner();
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
            const c1 = NS.ensureHeaderChip();
            const c2 = NS.ensureRealSnapChip();
            const c3 = NS.ensureAutoModeChip();
            const c4 = NS.ensureBackfillChip();
            const c5 = NS.ensureForceExtractChip();
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
            if (NS.STATE.captureStream || NS.STATE.frameBufferTimer) {
                clearInterval(bannerTimer);
                return;
            }
            // Cheap local check TRƯỚC mọi network call: chỉ tiếp khi có live
            // campaign load. (_maybeShowAutoSnapBanner cũng tự check
            // _findActiveLiveCampaign — local — trước khi đụng lock API.)
            const st = global.LiveState;
            if (st?.liveCampaigns?.length > 0) {
                NS._maybeShowAutoSnapBanner();
            }
        }, 3000);
        // Initial inject ngay cho rows hiện có (nếu Live đã render trước script).
        // Observer sẽ handle rows mới sau đó.
        NS.injectSnapButtonsAll();
        // Refresh counts — defer cho idle để không block initial render.
        // Fallback setTimeout 1.5s nếu browser không hỗ trợ requestIdleCallback.
        const deferRefresh = () => {
            NS.injectSnapButtonsAll();
            NS.refreshCounts();
        };
        if (global.requestIdleCallback) {
            global.requestIdleCallback(deferRefresh, { timeout: 2500 });
        } else {
            setTimeout(deferRefresh, 1500);
        }
    };

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
            NS.STATE.extVersion = data.version;
            const ok = NS._cmpVersions(data.version, NS.REQUIRED_EXT_VERSION) >= 0;
            if (ok) {
                NS.STATE.extReady = true;
                console.log(`[snap-ext] v${data.version} OK — capture silent qua <all_urls>`);
            } else {
                NS.STATE.extReady = false;
                NS.STATE.extOutdated = true;
                console.warn(
                    `[snap-ext] v${data.version} TOO OLD — cần >= v${NS.REQUIRED_EXT_VERSION}`
                );
            }
        } else if (
            data.type === 'N2_CAPTURE_VISIBLE_TAB_SUCCESS' ||
            data.type === 'N2_CAPTURE_VISIBLE_TAB_FAILURE'
        ) {
            const req = NS.STATE.extCapturePending.get(data.requestId);
            if (!req) return;
            clearTimeout(req.timer);
            NS.STATE.extCapturePending.delete(data.requestId);
            if (data.type === 'N2_CAPTURE_VISIBLE_TAB_SUCCESS') {
                req.resolve(data.dataUrl);
            } else {
                req.reject(new Error(data.error || 'ext capture failed'));
            }
        }
    });

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) NS.STATE._stallCooldownUntil = 0;
    });

    window.addEventListener('beforeunload', () => {
        if (!NS.STATE.frameBufferTimer && !NS.STATE.captureStream) return;
        try {
            const url = `${NS._lockApiBase()}/api/web2/capture-lock/release`;
            // sendBeacon KHÔNG set được header → gửi token trong BODY (server
            // extractToken đọc header → query → body.token). requireWeb2AuthSoft
            // 401 nếu thiếu (WEB2_AUTH_ENFORCE=1) → lock kẹt. (audit CRITICAL)
            const tok = (NS._w2AuthHeaders && NS._w2AuthHeaders()['x-web2-token']) || '';
            const payload = JSON.stringify({ holder: NS._holderId(), token: tok });
            if (navigator.sendBeacon) {
                navigator.sendBeacon(url, new Blob([payload], { type: 'application/json' }));
            } else {
                fetch(url, {
                    method: 'POST',
                    headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                    keepalive: true,
                    body: payload,
                });
            }
        } catch (_) {}
    });

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', NS.init);
    } else {
        NS.init();
    }

    global.LiveLivestreamSnap = {
        snap: NS.snap,
        togglePopover: NS.togglePopover,
        refreshCounts: NS.refreshCounts,
        injectSnapButtonsAll: NS.injectSnapButtonsAll,
        _getSnapPagePref: NS._getSnapPagePref,
        _setSnapPagePref: NS._setSnapPagePref,
        _setInlineThumb: NS._setInlineThumb,
        _isInlineThumbOn: NS._isInlineThumbOn,
        // Public API cho kho Hình Livestream
        captureCurrentFrame: NS.captureCurrentFrame,
        getCurrentCampaignContext: NS.getCurrentCampaignContext,
        getCurrentOffsetSeconds: NS.getCurrentOffsetSeconds,
        // Auto offline backfill thumbnail theo thời gian (gọi từ live-init khi
        // load campaign đã end). silent:true → không toast.
        offlineBatchAll: NS.offlineBatchAll,
        // Debug accessors cho test scripts (entry buffer: { capturedAt, blob })
        _getStreamActive: () => !!NS.STATE.captureStream,
        _getBufferCount: () => NS.STATE.frameBuffer?.length || 0,
        _getLatestFrame: () => NS.STATE.frameBuffer?.[NS.STATE.frameBuffer.length - 1] || null,
        // Debug leader-lock failover (test scripts): đọc health + ép stall.
        _lockDebug: {
            get: () => ({
                lastFrameAt: NS.STATE.lastFrameAt || 0,
                stallCooldownUntil: NS.STATE._stallCooldownUntil || 0,
                lockBlockedBy: NS.STATE.lockBlockedBy || null,
                heartbeatOn: !!NS.STATE._lockHbTimer,
                bufferOn: !!NS.STATE.frameBufferTimer,
            }),
            forceStall: () => {
                NS.STATE.lastFrameAt = Date.now() - 10 * 60 * 1000;
            },
            blockFrames: (on) => {
                NS.STATE._debugBlockFrames = !!on;
            },
        },
    };
})();
