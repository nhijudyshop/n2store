// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-extract (auto-snap handler, per-comment extract, silent extract)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS._runSilentForceExtract = async function () {
        if (NS.STATE._silentExtractRunning) return;
        NS.STATE._silentExtractRunning = true;
        // Gom KH từ comment vào kho (silent, throttle 60s tránh spam khi user
        // switch tab liên tục). Backend KHÔNG ghi đè dữ liệu chính sẵn có.
        try {
            const nowH = Date.now();
            if (nowH - (NS.STATE._lastHarvestTs || 0) > 60_000) {
                NS.STATE._lastHarvestTs = nowH;
                window.LiveColumnManager?._harvestCommentCustomers?.(
                    (global.LiveState?.comments || []).filter(
                        (c) =>
                            c.from?.id &&
                            !NS._isStaffComment(c) &&
                            !global.LiveHiddenCommenters?.isHidden?.(c)
                    )
                ).catch(() => {});
            }
        } catch (_) {}
        try {
            const camp = NS._findActiveLiveCampaign();
            const pageObj = NS._resolvePageObj();
            if (!camp?.Facebook_LiveId || !pageObj?.Facebook_PageId) {
                return; // không có live active → bỏ qua
            }
            // Step 1: backfill metadata cho comments visible (silent — background
            // run không toast lỗi lên UI, chỉ log).
            try {
                await NS.offlineBatchAll({ skipExisting: true, silent: true });
            } catch (e) {
                console.warn('[snap-auto-extract] backfill fail:', e?.message);
            }
            // Step 2: queue extract-all-pending
            const r = await fetch(NS.API + '/api/livestream/extract-all-pending', {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
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
                NS._invalidateSnapCacheAndRefresh();
                return;
            }
            NS._toast(`⚡ Auto-fill ${d.queued} thumbnails (tab inactive)...`, 'ok');
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
                            NS.API +
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
                                NS._toast(`✅ Fill xong ${s.done} thumbnails`, 'ok');
                            }
                            NS._invalidateSnapCacheAndRefresh();
                            resolve();
                        }
                    } catch (_) {
                        // ignore, retry next tick
                    }
                }, 2000);
            });
        } finally {
            NS.STATE._silentExtractRunning = false;
        }
    };

    NS._handleNewCommentAuto = async function (payload) {
        if (!NS._isAutoMode()) return;
        const comment = payload?.comment;
        if (!comment || payload.isStaff) return;
        // MEDIUM-cleanup (2026-06-13): bỏ qua người-bị-ẩn (mặc định 2 page shop)
        // — Force extract đã lọc isHidden, path auto thì chưa → phí capture +
        // POST snapshot cho comment shop tự reply.
        if (global.LiveHiddenCommenters?.isHidden?.(comment)) return;
        const customerFbUserId = comment.from?.id;
        const customerName = comment.from?.name || '?';
        const commentId = comment.id;
        if (!customerFbUserId) return;
        // Dedup multi-client: nếu local cache đã có snap với bytea cho commentId
        // → skip POST. Backend DB unique constraint cũng dedup, đây là optimization
        // để giảm POST + giảm capture wasted khi nhiều máy mở cùng trang.
        const existingSnap = NS.STATE.snapByComment.get(commentId);
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
        NS.STATE.autoLastSnap.set(customerFbUserId, Date.now());
        try {
            // "Chỉ chụp tab đang xem": extension đã sẵn + iframe live đã nhúng +
            // tab đang hiển thị → capture frame visible tab (KHÔNG cần share màn
            // hình / buffer mode). Đây là path ưu tiên khi user xem tab live-chat.
            const canExtTabCapture =
                NS.STATE.extReady &&
                NS._pageActiveForCapture() &&
                !!document.getElementById('live-snap-fb-wrapper');
            const hasBufferedFrames =
                (NS.STATE.captureStream && NS.STATE.captureVideo?.videoWidth) ||
                (NS.STATE.frameBufferTimer && NS.STATE.frameBuffer?.length > 0) ||
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
                let buffered = NS._findNearestBufferedFrame(commentTimeMs, 60000);
                // Fallback ext mode: nếu buffer rỗng / quá cũ → capture NOW
                // qua extension thay vì gửi snap rỗng (snap không có bytea =
                // không thumbnail). Chrome rate-limit tabs.captureVisibleTab
                // ~2/sec, OK với throttle 30s/KH.
                if (!buffered && NS.STATE.extReady) {
                    try {
                        const jpegBase64 = await NS._captureExtensionFrame();
                        if (jpegBase64) {
                            buffered = {
                                capturedAt: Date.now(),
                                blob: NS._base64ToBlob(jpegBase64),
                            };
                            // Inject vào buffer luôn để comment sau dùng được.
                            NS.STATE.frameBuffer?.push(buffered);
                            console.log(
                                '[snap-auto] ext live-capture fallback (buffer empty/stale)'
                            );
                        }
                    } catch (e) {
                        console.warn('[snap-auto] ext fallback capture fail:', e.message);
                    }
                }
                await NS.snap(customerFbUserId, customerName, commentId, null, {
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
                await NS._offlineSnapOne({
                    commentId,
                    customerFbUserId,
                    customerName,
                    commentTime,
                    message: comment.message,
                    comment, // pass full comment để resolve campaign theo _campaignId / _pageId
                });
            }
            NS.STATE.autoStats.total++;
            // Visible feedback: toast khi auto-snap thành công + auto-trigger
            // backend extract-frame (path 2) để fill bytea trong background.
            NS._toast(`🤖 Auto-snap: ${customerName}`, 'ok');
        } catch (e) {
            NS.STATE.autoStats.errors++;
            console.warn('[snap-auto] fail:', e.message);
        }
        NS.renderAutoModeChip();
    };

    NS._extractThumbnailForComment = async function (commentId, btn) {
        const st = global.LiveState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) throw new Error('comment không có trong state');
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const commentTimeMs = rawT ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN) : NaN;
        if (!Number.isFinite(commentTimeMs)) throw new Error('comment thiếu thời gian');
        const camp = NS._resolveCampaignForComment(c);
        if (!camp?.Facebook_LiveId) throw new Error('không tìm được campaign cho comment');
        const pageObj = st.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        if (!pageObj) throw new Error('không tìm được page');
        const videoInfo = await NS._fetchLiveVideoInfo(
            pageObj.Facebook_PageId,
            camp.Facebook_LiveId
        );
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
        if (!NS.STATE.extReady && !NS.STATE.captureStream) {
            throw new Error('chưa có capture — mở live + bật capture trước');
        }
        const imageBase64 = await NS._clientCaptureAtOffset(camp, offsetSec);
        if (!imageBase64) {
            throw new Error('capture thất bại (live chưa end / VOD chưa load?)');
        }
        await NS._postCapturedSnap({
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
        NS._toast('✅ Đã lấy thumbnail', 'ok');
        // Restore iframe về live active để auto-snap buffer chạy tiếp.
        try {
            const ac = NS._findActiveLiveCampaign();
            if (ac) await NS._clientRestoreLive(ac);
        } catch (_) {}
    };

    NS._captureAtCommentTime = async function (commentId) {
        const st = global.LiveState;
        const c = st?.comments?.find((x) => x.id === commentId);
        if (!c?.from?.id) throw new Error('comment không tồn tại trong state');
        const rawT = c.created_time || c.createdTime || c.inserted_at || c.created_at;
        const commentTimeMs = rawT ? (SharedUtils.parseTimestamp(rawT)?.getTime() ?? NaN) : NaN;
        if (!Number.isFinite(commentTimeMs)) throw new Error('comment thiếu thời gian');
        const camp = NS._resolveCampaignForComment(c);
        if (!camp?.Facebook_LiveId) throw new Error('không tìm được campaign');
        const pageObj = st.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId);
        if (!pageObj) throw new Error('không tìm được page');
        const videoInfo = await NS._fetchLiveVideoInfo(
            pageObj.Facebook_PageId,
            camp.Facebook_LiveId
        );
        if (!videoInfo?.broadcastStartMs) throw new Error('không có broadcastStart');
        const offsetSec = Math.max(
            0,
            Math.floor((commentTimeMs - videoInfo.broadcastStartMs) / 1000)
        );

        // Path A: đã có stream active + buffered frame nearest → dùng luôn (instant).
        if (NS.STATE.captureStream && NS.STATE.frameBuffer?.length) {
            const buffered = NS._findNearestBufferedFrame(commentTimeMs, 60000);
            if (buffered?.blob) {
                NS._toast('⚡ Dùng buffered frame...', 'ok');
                await NS._postCapturedSnap({
                    commentId,
                    customerFbUserId: c.from.id,
                    customerName: c.from.name || '?',
                    commentTimeMs,
                    offsetSec,
                    pageObj,
                    camp,
                    videoInfo,
                    imageBase64: await NS._blobToBase64(buffered.blob),
                    message: c.message,
                });
                return;
            }
        }

        // Path B: backend yt-dlp + ffmpeg extract (no user action, 5-15s).
        // Tạo snap metadata trước → enqueue extract-frame backend → SSE
        // 'extract-done' tự render thumb. KHÔNG cần share FB tab.
        NS._toast('⏳ Backend đang extract frame (5-15s)...', 'ok');
        const snapId = await NS._createMetadataSnap({
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
                const r = await fetch(NS.API + '/api/livestream/extract-frame', {
                    method: 'POST',
                    // ENFORCE-PREP (2026-06-12)
                    headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                    credentials: 'omit',
                    body: JSON.stringify({ snapshotIds: [snapId] }),
                });
                const d = await r.json();
                if (d.success && d.queued > 0) {
                    // SSE sẽ notify 'extract-done' → strip auto-refresh.
                    return;
                }
                if (r.status === 503) {
                    NS._toast(
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
        const slug = NS._resolvePageVanity(pageObj) || pageObj.Facebook_PageId;
        const videoIdShort = String(camp.Facebook_LiveId).replace(/^\d+_/, '');
        const fbUrl = `https://www.facebook.com/${slug}/videos/${videoIdShort}/?t=${offsetSec}&locale=vi_VN`;
        const fbWin = window.open(fbUrl, '_blank');
        if (!fbWin) {
            throw new Error('Trình duyệt chặn popup. Cho phép popup rồi thử lại.');
        }
        NS._toast(
            `📺 Đã mở FB tại ${Math.floor(offsetSec / 60)}m${offsetSec % 60}s — chọn tab vừa mở khi browser hỏi share`,
            'ok'
        );
        // Đợi 4s để FB load + seek tới offset trước khi prompt share.
        await new Promise((r) => setTimeout(r, 4000));
        try {
            await NS.ensureCaptureStream();
        } catch (e) {
            throw new Error('User hủy share: ' + e.message);
        }
        // Đợi thêm 1.5s cho video render frame sau share.
        await new Promise((r) => setTimeout(r, 1500));
        const imageBase64 = await NS._captureFrameJpeg(0.72, 1280);
        if (!imageBase64) throw new Error('Capture frame fail (video chưa load?)');
        await NS._postCapturedSnap({
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
        NS._toast('✅ Đã chụp + lưu snapshot', 'ok');
    };
})();
