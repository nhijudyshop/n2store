// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-seek (FB SDK seek player, force-extract pool/serial)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS._fbSdkPromise = null;

    NS._xfbmlWaiters = new Map();

    NS._iframeChain = Promise.resolve();

    NS._extCapChain = Promise.resolve();

    NS._ensureFbSdk = function () {
        if (global.FB?.XFBML && NS._fbSdkPromise) return NS._fbSdkPromise;
        if (NS._fbSdkPromise) return NS._fbSdkPromise;
        NS._fbSdkPromise = new Promise((resolve, reject) => {
            if (global.FB?.XFBML) return resolve(global.FB);
            const s = document.createElement('script');
            s.src = 'https://connect.facebook.net/en_US/sdk.js#xfbml=0&version=v19.0';
            s.onload = () => resolve(global.FB);
            s.onerror = () => {
                NS._fbSdkPromise = null;
                reject(new Error('FB SDK load fail'));
            };
            document.head.appendChild(s);
        }).then((FB) => {
            // Subscribe 1 LẦN — route instance về đúng waiter theo div id.
            FB.Event.subscribe('xfbml.ready', (msg) => {
                if (msg?.type === 'video' && msg.id && NS._xfbmlWaiters.has(msg.id)) {
                    const resolve = NS._xfbmlWaiters.get(msg.id);
                    NS._xfbmlWaiters.delete(msg.id);
                    resolve(msg.instance);
                }
            });
            return FB;
        });
        return NS._fbSdkPromise;
    };

    NS._ensureSeekPlayer = async function (camp) {
        const fbVideoUrl = NS._buildFbLiveUrl(camp);
        if (!fbVideoUrl) throw new Error('không build được URL video');
        if (NS.STATE._seekPlayer && NS.STATE._seekPlayerHref === fbVideoUrl) {
            return NS.STATE._seekPlayer;
        }
        const FB = await NS._ensureFbSdk();
        if (!FB?.XFBML) throw new Error('FB SDK không sẵn sàng');
        NS._ensureEmbeddedIframe(camp); // đảm bảo wrapper tồn tại
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (!wrapper) throw new Error('không có wrapper capture');
        const HEADER_OFFSET = NS.SNAP_VIDEO_HEADER;
        const divId = 'fbseek_' + Math.random().toString(36).slice(2, 9);
        const host = document.createElement('div');
        host.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:${NS.SNAP_VIDEO_W}px;`;
        const div = document.createElement('div');
        div.id = divId;
        div.className = 'fb-video';
        div.setAttribute('data-href', fbVideoUrl);
        div.setAttribute('data-width', String(NS.SNAP_VIDEO_W));
        div.setAttribute('data-allowfullscreen', 'false');
        div.setAttribute('data-show-captions', 'false');
        host.appendChild(div);
        wrapper.innerHTML = ''; // gỡ iframe live (restore lại ở _clientRestoreLive)
        wrapper.appendChild(host);
        NS.STATE._seekPlayer = null;
        NS.STATE._seekPlayerHref = null;
        // Subscriber CỤC BỘ per-build (xem _buildSeekPlayer) — không dùng subscriber
        // chung (route fail → xfbml.ready timeout). 25s cho tải nặng.
        const instance = await new Promise((resolve, reject) => {
            let settled = false;
            const handler = (msg) => {
                if (settled || !msg || msg.type !== 'video' || msg.id !== divId) return;
                settled = true;
                clearTimeout(t);
                try {
                    FB.Event.unsubscribe('xfbml.ready', handler);
                } catch (_) {}
                resolve(msg.instance);
            };
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                try {
                    FB.Event.unsubscribe('xfbml.ready', handler);
                } catch (_) {}
                reject(new Error('xfbml.ready timeout (player không load)'));
            }, 25000);
            FB.Event.subscribe('xfbml.ready', handler);
            FB.XFBML.parse(host);
        });
        NS.STATE._seekPlayer = instance;
        NS.STATE._seekPlayerHref = fbVideoUrl;
        return instance;
    };

    NS._clientCaptureAtOffset = function (camp, offsetSec) {
        const doWork = () => NS._clientCaptureAtOffsetInner(camp, offsetSec);
        const p = NS._iframeChain.then(doWork, doWork);
        // Chain không giữ rejection (caller tự handle) — tránh unhandled rejection.
        NS._iframeChain = p.catch(() => {});
        return p;
    };

    NS._clientCaptureAtOffsetInner = async function (camp, offsetSec) {
        const target = Math.max(0, Number(offsetSec) || 0);
        const player = await NS._ensureSeekPlayer(camp);
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
        if (NS.STATE.captureStream && NS.STATE.captureVideo?.videoWidth) {
            const blob = await NS._captureFrameJpeg(0.72, 1280);
            if (blob) frame = await NS._blobToBase64(blob);
        }
        if (!frame && NS.STATE.extReady) {
            frame = await NS._captureExtensionFrame();
        }
        try {
            player.pause(); // tiết kiệm bandwidth giữa các offset
        } catch (_) {}
        if (!frame) throw new Error('capture rỗng');
        return frame;
    };

    NS._buildSeekPlayer = async function (fbVideoUrl, wrapperEl) {
        const FB = await NS._ensureFbSdk();
        if (!FB?.XFBML) throw new Error('FB SDK không sẵn sàng');
        const HEADER_OFFSET = NS.SNAP_VIDEO_HEADER;
        const divId = 'fbseek_' + Math.random().toString(36).slice(2, 9);
        const host = document.createElement('div');
        host.style.cssText = `position:absolute;left:0;top:${-HEADER_OFFSET}px;width:${NS.SNAP_VIDEO_W}px;`;
        const div = document.createElement('div');
        div.id = divId;
        div.className = 'fb-video';
        div.setAttribute('data-href', fbVideoUrl);
        div.setAttribute('data-width', String(NS.SNAP_VIDEO_W));
        div.setAttribute('data-allowfullscreen', 'false');
        div.setAttribute('data-show-captions', 'false');
        host.appendChild(div);
        wrapperEl.innerHTML = '';
        wrapperEl.appendChild(host);
        // Subscriber CỤC BỘ cho lần build này (match msg.id === divId) thay vì dựa
        // subscriber chung _ensureFbSdk + _xfbmlWaiters — subscriber chung không
        // route đúng trong ngữ cảnh force-extract (xfbml.ready timeout toàn bộ,
        // verify 2026-06-13: local subscriber 3/3 OK, shared fail). 25s cho tải nặng.
        return await new Promise((resolve, reject) => {
            let settled = false;
            const handler = (msg) => {
                if (settled || !msg || msg.type !== 'video' || msg.id !== divId) return;
                settled = true;
                clearTimeout(t);
                try {
                    FB.Event.unsubscribe('xfbml.ready', handler);
                } catch (_) {}
                resolve(msg.instance);
            };
            const t = setTimeout(() => {
                if (settled) return;
                settled = true;
                try {
                    FB.Event.unsubscribe('xfbml.ready', handler);
                } catch (_) {}
                reject(new Error('xfbml.ready timeout'));
            }, 25000);
            FB.Event.subscribe('xfbml.ready', handler);
            FB.XFBML.parse(host);
        });
    };

    NS._captureExtensionFrameThrottled = function (targetEl) {
        const p = NS._extCapChain.then(() => NS._captureExtensionFrame(targetEl));
        // 550ms gap = ~1.8 capture/giây < giới hạn Chrome captureVisibleTab 2/giây.
        // 480ms (~2.08/s) trước đây thỉnh thoảng vượt → MAX_CAPTURE_VISIBLE_TAB quota.
        // MỌI captureVisibleTab tần suất cao (3 worker pool + auto-snap) đi chung
        // chain này → tổng luôn dưới ngưỡng.
        const gap = () => new Promise((r) => setTimeout(r, 550));
        NS._extCapChain = p.then(gap, gap);
        return p;
    };

    NS._ensureWorkerStrip = function (n) {
        let strip = document.getElementById('live-snap-workers');
        if (strip) return strip;
        strip = document.createElement('div');
        strip.id = 'live-snap-workers';
        strip.style.cssText =
            'position:fixed;left:8px;bottom:8px;z-index:99000;display:flex;gap:6px;align-items:flex-end;padding:22px 6px 6px;background:rgba(15,23,42,0.92);border:1px solid #334155;border-radius:10px;box-shadow:0 6px 20px rgba(0,0,0,0.4);';
        const label = document.createElement('div');
        label.style.cssText =
            'position:absolute;top:4px;left:8px;font:600 10.5px Inter,system-ui,sans-serif;color:#cbd5e1;white-space:nowrap;';
        label.textContent = `⚡ Trích xuất ${n} luồng — chạy nền`;
        strip.appendChild(label);
        strip._wrappers = [];
        for (let i = 0; i < n; i++) {
            const w = document.createElement('div');
            w.className = 'live-snap-worker';
            w.style.cssText = `position:relative;width:${NS.SNAP_VIDEO_W}px;height:${NS.SNAP_VIDEO_H}px;border:2px solid #f59e0b;border-radius:6px;background:#000;overflow:hidden;flex:0 0 auto;`;
            strip.appendChild(w);
            strip._wrappers.push(w);
        }
        document.body.appendChild(strip);
        return strip;
    };

    NS._removeWorkerStrip = function () {
        document.getElementById('live-snap-workers')?.remove();
    };

    NS._workerSeekCapture = async function (player, wrapperEl, offsetSec, isCancelled) {
        const target = Math.max(0, Number(offsetSec) || 0);
        try {
            player.mute();
        } catch (_) {}
        player.seek(target);
        player.play();
        let okPos = false;
        for (let i = 0; i < 16; i++) {
            if (isCancelled()) return null;
            await new Promise((r) => setTimeout(r, 500));
            let pos = NaN;
            try {
                pos = player.getCurrentPosition();
            } catch (_) {}
            if (Number.isFinite(pos) && Math.abs(pos - target) < 30) {
                okPos = true;
                break;
            }
            if (i === 7) {
                try {
                    player.seek(target);
                    player.play();
                } catch (_) {}
            }
        }
        if (!okPos) throw new Error('seek fail (buffering/DRM)');
        await new Promise((r) => setTimeout(r, 600)); // settle frame render
        const frame = await NS._captureExtensionFrameThrottled(wrapperEl);
        try {
            player.pause();
        } catch (_) {}
        if (!frame) throw new Error('capture rỗng');
        return frame;
    };

    NS._forceExtractVideoBlocked = function (pageObj, videoInfo, camp, count) {
        const nm = String(camp?.Name || camp?.Facebook_LiveId || 'live').slice(0, 34);
        if (!pageObj) {
            NS._toast(`⚠ Không tìm thấy trang FB của "${nm}" — bỏ ${count} comment`, 'err');
            return true;
        }
        if (!videoInfo) {
            NS._toast(
                `⚠ Không lấy được thông tin video "${nm}" (lỗi mạng/quyền) — bỏ ${count} comment, thử lại`,
                'err'
            );
            return true;
        }
        if (videoInfo.notFound) {
            NS._toast(
                `🚫 Video livestream "${nm}" đã bị XÓA / không còn trên Facebook — ${count} comment không chụp được`,
                'err'
            );
            return true;
        }
        if (!videoInfo.broadcastStartMs) {
            NS._toast(`⚠ Không lấy được giờ bắt đầu live "${nm}" — bỏ ${count} comment`, 'err');
            return true;
        }
        return false;
    };

    NS._runForceExtractParallel = async function (
        byVideo,
        st,
        total,
        K,
        isCancelled,
        onProgress,
        stats
    ) {
        const strip = NS._ensureWorkerStrip(K);
        const workers = strip._wrappers.slice(0, K);
        try {
            for (const { camp, comments } of byVideo.values()) {
                if (isCancelled()) break;
                const pageObj = st.allPages?.find(
                    (p) => p.Facebook_PageId === camp.Facebook_UserId
                );
                let videoInfo = null;
                if (pageObj) {
                    try {
                        videoInfo = await NS._fetchLiveVideoInfo(
                            pageObj.Facebook_PageId,
                            camp.Facebook_LiveId
                        );
                    } catch (_) {}
                }
                if (NS._forceExtractVideoBlocked(pageObj, videoInfo, camp, comments.length)) {
                    stats.failed += comments.length;
                    onProgress();
                    continue;
                }
                const fbVideoUrl = NS._buildFbLiveUrl(camp);
                // Dựng K player cho video này (song song).
                const players = await Promise.all(
                    workers.map((w) =>
                        NS._buildSeekPlayer(fbVideoUrl, w).catch((e) => {
                            console.warn('[force-parallel] build player fail:', e.message);
                            return null;
                        })
                    )
                );
                if (!players.some(Boolean)) {
                    stats.failed += comments.length;
                    onProgress();
                    continue;
                }
                const queue = comments.slice();
                const runWorker = async (player, wrapperEl) => {
                    if (!player) return;
                    while (queue.length && !isCancelled()) {
                        const c = queue.shift();
                        const rawT =
                            c.created_time || c.createdTime || c.inserted_at || c.created_at;
                        const commentTimeMs = rawT
                            ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN)
                            : NaN;
                        if (!Number.isFinite(commentTimeMs)) {
                            stats.failed++;
                            onProgress();
                            continue;
                        }
                        const offsetSec = Math.max(
                            0,
                            Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
                        );
                        try {
                            const imageBase64 = await NS._workerSeekCapture(
                                player,
                                wrapperEl,
                                offsetSec,
                                isCancelled
                            );
                            if (isCancelled()) return;
                            if (!imageBase64) throw new Error('capture rỗng');
                            await NS._postCapturedSnap({
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
                            stats.done++;
                        } catch (e) {
                            stats.failed++;
                            console.warn('[force-parallel] fail', c.id, e.message);
                        }
                        onProgress();
                    }
                };
                await Promise.all(players.map((p, i) => runWorker(p, workers[i])));
            }
        } finally {
            NS._removeWorkerStrip();
        }
    };

    NS._runForceExtractSerial = async function (
        byVideo,
        st,
        total,
        isCancelled,
        onProgress,
        stats
    ) {
        for (const { camp, comments } of byVideo.values()) {
            if (isCancelled()) break;
            const pageObj = st.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
            let videoInfo = null;
            if (pageObj) {
                try {
                    videoInfo = await NS._fetchLiveVideoInfo(
                        pageObj.Facebook_PageId,
                        camp.Facebook_LiveId
                    );
                } catch (_) {}
            }
            if (NS._forceExtractVideoBlocked(pageObj, videoInfo, camp, comments.length)) {
                stats.failed += comments.length;
                onProgress();
                continue;
            }
            for (const c of comments) {
                if (isCancelled()) break;
                const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
                const commentTimeMs = rawT
                    ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN)
                    : NaN;
                if (!Number.isFinite(commentTimeMs)) {
                    stats.failed++;
                    onProgress();
                    continue;
                }
                const offsetSec = Math.max(
                    0,
                    Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
                );
                try {
                    const imageBase64 = await NS._clientCaptureAtOffset(camp, offsetSec);
                    if (isCancelled()) break;
                    if (!imageBase64) throw new Error('capture rỗng');
                    await NS._postCapturedSnap({
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
                    stats.done++;
                } catch (e) {
                    stats.failed++;
                    console.warn('[force-client] fail', c.id, e.message);
                }
                onProgress();
            }
        }
    };

    NS._clientRestoreLive = async function (camp) {
        NS.STATE._seekPlayer = null;
        NS.STATE._seekPlayerHref = null;
        const wrapper = document.getElementById('live-snap-fb-wrapper');
        if (!wrapper || !camp) return;
        const fbVideoUrl = NS._buildFbLiveUrl(camp);
        if (!fbVideoUrl) return;
        const WRAPPER_W = NS.SNAP_VIDEO_W;
        const HEADER_OFFSET = NS.SNAP_VIDEO_HEADER;
        const IFRAME_H = NS.SNAP_VIDEO_H + HEADER_OFFSET;
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
    };
})();
