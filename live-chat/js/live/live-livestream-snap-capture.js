// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-capture (extension capture, frame encode worker, frame buffer)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS.FRAME_BUFFER_INTERVAL_MS = 5000;

    NS.FRAME_BUFFER_MAX = 720;

    // NS._encodeWorker starts undefined (declared lazily)

    NS._encodeSeq = 0;

    NS._encodeWaiters = new Map();

    NS._captureViaExtension = function (quality = 80, timeoutMs = 4000) {
        return new Promise((resolve, reject) => {
            if (!NS.STATE.extReady) {
                reject(new Error('extension not ready'));
                return;
            }
            const requestId = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            const timer = setTimeout(() => {
                NS.STATE.extCapturePending.delete(requestId);
                reject(new Error('ext capture timeout'));
            }, timeoutMs);
            NS.STATE.extCapturePending.set(requestId, { resolve, reject, timer });
            window.postMessage({ type: 'N2_CAPTURE_VISIBLE_TAB', requestId, quality }, '*');
        });
    };

    NS._captureExtensionFrame = async function (targetEl) {
        // targetEl: element cần crop (mặc định wrapper dock). Force-extract song
        // song truyền wrapper của từng worker. Guard: bỏ qua arg không phải Element
        // (call cũ truyền quality number `_captureExtensionFrame(80)` — vô hại).
        const wrapper =
            targetEl instanceof Element
                ? targetEl
                : document.getElementById('live-snap-fb-wrapper');
        if (!wrapper) return null;
        // GATE: window không focus / tab ẩn → captureVisibleTab trả frame đen.
        // Bỏ qua hẳn (khỏi tốn quota + chắc chắn không lưu ảnh đen). Capture nền khi
        // tab inactive là việc của stream getDisplayMedia, KHÔNG phải path này.
        if (!NS._pageActiveForCapture()) return null;
        let dataUrl;
        try {
            dataUrl = await NS._captureViaExtension(80, 4000);
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
        // Dock ẩn (Kho SP collapsed → display:none) hoặc ngoài màn → rect ~0 →
        // skip, tránh crop pixel rác. Auto-snap tick tự bỏ frame null.
        if (rect.width < 2 || rect.height < 2) return null;
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
        // Frame đen (window vừa mất focus giữa chừng / iframe FB chưa render) → bỏ,
        // tránh lưu thumbnail đen. Auto-snap / buffer tick tự skip frame null.
        if (NS._isFrameBlank(ctx, targetW, targetH)) return null;
        const jpeg = canvas.toDataURL('image/jpeg', 0.72);
        return jpeg.split(',')[1] || null;
    };

    NS._blobToBase64 = function (blob) {
        return new Promise((resolve, reject) => {
            const fr = new FileReader();
            fr.onload = () => {
                const dataUrl = fr.result;
                resolve(dataUrl.slice(dataUrl.indexOf(',') + 1));
            };
            fr.onerror = () => reject(new Error('blob→base64 fail'));
            fr.readAsDataURL(blob);
        });
    };

    NS._base64ToBlob = function (b64, mime = 'image/jpeg') {
        const bin = atob(b64);
        const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        return new Blob([arr], { type: mime });
    };

    NS._getEncodeWorker = function () {
        if (NS._encodeWorker !== undefined) return NS._encodeWorker;
        try {
            if (
                typeof Worker === 'undefined' ||
                typeof OffscreenCanvas === 'undefined' ||
                typeof createImageBitmap !== 'function'
            ) {
                NS._encodeWorker = false;
                return false;
            }
            const src = `let oc=null,ctx=null;self.onmessage=async(e)=>{const{id,bitmap,quality}=e.data;try{if(!oc||oc.width!==bitmap.width||oc.height!==bitmap.height){oc=new OffscreenCanvas(bitmap.width,bitmap.height);ctx=oc.getContext('2d',{alpha:false});}ctx.drawImage(bitmap,0,0);bitmap.close();const blob=await oc.convertToBlob({type:'image/jpeg',quality});self.postMessage({id,blob});}catch(err){try{bitmap.close&&bitmap.close();}catch(_){}; self.postMessage({id,error:String(err&&err.message||err)});}};`;
            const url = URL.createObjectURL(new Blob([src], { type: 'text/javascript' }));
            const w = new Worker(url);
            URL.revokeObjectURL(url);
            w.onmessage = (e) => {
                const waiter = NS._encodeWaiters.get(e.data.id);
                if (!waiter) return;
                NS._encodeWaiters.delete(e.data.id);
                if (e.data.error) waiter.reject(new Error(e.data.error));
                else waiter.resolve(e.data.blob);
            };
            w.onerror = () => {}; // waiters tự timeout → fallback
            NS._encodeWorker = w;
            return w;
        } catch (_) {
            NS._encodeWorker = false;
            return false;
        }
    };

    NS._encodeBitmapInWorker = function (bitmap, quality) {
        const w = NS._getEncodeWorker();
        if (!w) {
            try {
                bitmap.close && bitmap.close();
            } catch (_) {}
            return Promise.reject(new Error('no encode worker'));
        }
        const id = ++NS._encodeSeq;
        return new Promise((resolve, reject) => {
            NS._encodeWaiters.set(id, { resolve, reject });
            try {
                w.postMessage({ id, bitmap, quality }, [bitmap]);
            } catch (e) {
                NS._encodeWaiters.delete(id);
                reject(e);
                return;
            }
            setTimeout(() => {
                if (NS._encodeWaiters.has(id)) {
                    NS._encodeWaiters.delete(id);
                    reject(new Error('encode timeout'));
                }
            }, 4000);
        });
    };

    NS._captureFrameJpeg = async function (quality = 0.7, maxWidth = 1280) {
        const v = NS.STATE.captureVideo;
        if (!NS.STATE.captureStream || !v || !v.videoWidth) return null;
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
        // ƯU TIÊN off-thread: createImageBitmap crop+resize (1 op GPU, rẻ) → encode
        // JPEG trong worker (convertToBlob) → KHÔNG block main-thread = hết giật.
        if (NS._getEncodeWorker()) {
            try {
                const bmp = await createImageBitmap(v, srcX, srcY, srcW, srcH, {
                    resizeWidth: targetW,
                    resizeHeight: targetH,
                    resizeQuality: 'low',
                });
                return await NS._encodeBitmapInWorker(bmp, quality); // bitmap close trong worker
            } catch (e) {
                // worker/createImageBitmap lỗi → rơi xuống canvas main-thread (an toàn).
            }
        }
        // FALLBACK (main-thread): canvas drawImage + toBlob — hành vi cũ.
        if (!NS.STATE.captureCanvas) {
            NS.STATE.captureCanvas = document.createElement('canvas');
        }
        const canvas = NS.STATE.captureCanvas;
        canvas.width = targetW;
        canvas.height = targetH;
        // alpha:false → JPEG không cần kênh alpha; compositor bỏ qua alpha →
        // readback/encode nhẹ hơn. desynchronized:true giảm latency hàng đợi.
        const ctx =
            NS.STATE._captureCtx ||
            (NS.STATE._captureCtx = canvas.getContext('2d', {
                alpha: false,
                desynchronized: true,
            }));
        ctx.drawImage(v, srcX, srcY, srcW, srcH, 0, 0, targetW, targetH);
        // Resolve Blob trực tiếp (skip FileReader/base64) — buffer giữ binary.
        return new Promise((resolve) => {
            canvas.toBlob((blob) => resolve(blob || null), 'image/jpeg', quality);
        });
    };

    NS._findNearestBufferedFrame = function (commentTimeMs, maxDiffMs = 30000) {
        const buf = NS.STATE.frameBuffer;
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
    };

    NS._startFrameBuffer = function () {
        NS._stopFrameBuffer(true); // safe re-init — KHÔNG nhả lock vừa acquire
        // Entry { capturedAt: ms, blob: Blob } — giữ Blob binary thay vì base64
        // string (~4x retained memory). Convert base64 tại điểm consume (upload).
        NS.STATE.frameBuffer = [];
        // Mốc health ban đầu = lúc start (chưa có frame nào). Heartbeat đo stall
        // từ đây — startup iframe ~10s vẫn nằm trong LOCK_CAPTURE_STALL_MS.
        NS.STATE.lastFrameAt = Date.now();
        NS._setupVisibilityWatcher(); // notify user khi switch tab
        // Capture path priority:
        //   1. captureStream (Option B: extension streamId via getUserMedia OR
        //      getDisplayMedia) → _captureFrameJpeg via canvas. Best: work khi
        //      tab inactive, no Chrome rate-limit.
        //   2. extension captureVisibleTab → tab-only crop. Chỉ work khi tab
        //      focused. Fallback nếu user chưa click extension icon.
        const tick = async () => {
            // Debug/test: giả lập capture chết (frame không vào buffer) để verify
            // heartbeat stall-failover. Set qua _lockDebug.blockFrames(true).
            if (NS.STATE._debugBlockFrames) return;
            // Path 1 — stream-based (Option B: extension streamId OR legacy getDisplayMedia)
            // Best: work khi tab inactive, no Chrome rate-limit.
            if (NS.STATE.captureStream && NS.STATE.captureVideo?.videoWidth) {
                try {
                    // rVFC: đợi 1 frame MỚI được present trước khi chụp → né frame
                    // đen/trùng (lúc seek/buffering). Timeout 400ms phòng video pause.
                    const cv = NS.STATE.captureVideo;
                    if (typeof cv.requestVideoFrameCallback === 'function') {
                        await new Promise((res) => {
                            let done = false;
                            const fin = () => {
                                if (!done) {
                                    done = true;
                                    res();
                                }
                            };
                            try {
                                cv.requestVideoFrameCallback(() => fin());
                            } catch (_) {
                                fin();
                            }
                            setTimeout(fin, 400);
                        });
                    }
                    const blob = await NS._captureFrameJpeg(0.72, 1280);
                    if (!blob) return;
                    NS.STATE.lastFrameAt = Date.now(); // capture health (leader lock failover)
                    NS.STATE.frameBuffer.push({ capturedAt: Date.now(), blob });
                    if (NS.STATE.frameBuffer.length > NS.FRAME_BUFFER_MAX) {
                        NS.STATE.frameBuffer.splice(
                            0,
                            NS.STATE.frameBuffer.length - NS.FRAME_BUFFER_MAX
                        );
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
            if (NS.STATE.extReady) {
                try {
                    // Qua throttle chung → không đua quota captureVisibleTab với pool
                    // force-extract (cùng 1 hàng đợi 550ms).
                    const jpegBase64 = await NS._captureExtensionFrameThrottled();
                    if (!jpegBase64) return;
                    NS.STATE.lastFrameAt = Date.now(); // capture health (leader lock failover)
                    NS.STATE.frameBuffer.push({
                        capturedAt: Date.now(),
                        blob: NS._base64ToBlob(jpegBase64),
                    });
                    if (NS.STATE.frameBuffer.length > NS.FRAME_BUFFER_MAX) {
                        NS.STATE.frameBuffer.splice(
                            0,
                            NS.STATE.frameBuffer.length - NS.FRAME_BUFFER_MAX
                        );
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
        NS.STATE.frameBufferTimer = setInterval(tick, NS.FRAME_BUFFER_INTERVAL_MS);
        // Chip refresh 5s — chỉ sống khi buffer chạy (clear ở _stopFrameBuffer).
        NS.STATE.chipRefreshTimer = setInterval(NS.renderRealSnapChip, 5000);
        NS._startLockHeartbeat(); // giữ leader lock suốt phiên capture (1 máy duy nhất)
        const path = NS.STATE.captureStream
            ? '(stream-based, tab inactive OK)'
            : NS.STATE.extReady
              ? '(extension visible tab, tab focused only)'
              : '(no source)';
        console.log('[snap-buffer] started — capture mỗi', NS.FRAME_BUFFER_INTERVAL_MS, 'ms', path);
    };

    NS._stopFrameBuffer = function (keepLock) {
        if (NS.STATE.frameBufferTimer) {
            clearInterval(NS.STATE.frameBufferTimer);
            NS.STATE.frameBufferTimer = null;
        }
        if (NS.STATE.chipRefreshTimer) {
            clearInterval(NS.STATE.chipRefreshTimer);
            NS.STATE.chipRefreshTimer = null;
        }
        if (NS.STATE.frameBuffer) NS.STATE.frameBuffer = [];
        // Nhả leader lock (server chỉ release nếu còn là của mình — fire-and-forget).
        if (!keepLock) NS._releaseCaptureLock();
    };

    NS.captureCurrentFrame = async function () {
        if (NS.STATE.captureStream && NS.STATE.captureVideo?.videoWidth) {
            try {
                const blob = await NS._captureFrameJpeg(0.8, 1280);
                if (blob)
                    return { jpegBase64: await NS._blobToBase64(blob), capturedAt: Date.now() };
            } catch (e) {
                console.warn('[gallery-capture] stream frame fail:', e.message);
            }
        }
        if (NS.STATE.extReady) {
            try {
                const jpegBase64 = await NS._captureExtensionFrame(85);
                if (jpegBase64) return { jpegBase64, capturedAt: Date.now() };
            } catch (e) {
                console.warn('[gallery-capture] ext frame fail:', e.message);
            }
        }
        // Buffer giữ Blob — convert base64 để giữ public API shape (gallery).
        const latest = NS.STATE.frameBuffer?.[NS.STATE.frameBuffer.length - 1];
        if (latest?.blob) {
            try {
                return {
                    jpegBase64: await NS._blobToBase64(latest.blob),
                    capturedAt: latest.capturedAt,
                };
            } catch (_) {}
        }
        return null;
    };
})();
