// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-actions (snap POST, offline batch, counts)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS.snap = async function (customerFbUserId, customerName, commentId, sourceBtn, opts = {}) {
        // Resolve page + campaign — ưu tiên từ comment đang xét (qua STATE.comments
        // hoặc opts), fallback page pref (Store/House). Vì 1 button = 1 comment cụ
        // thể, phải dùng đúng broadcastStart của video chứa comment đó.
        const st = global.LiveState;
        const commentRef =
            opts.comment || (commentId && st?.comments?.find((x) => x.id === commentId)) || null;
        let camp = null;
        let pageObj = null;
        if (commentRef) {
            camp = NS._resolveCampaignForComment(commentRef);
            if (camp) {
                pageObj =
                    st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) || null;
            }
        }
        if (!pageObj) pageObj = NS._resolvePageObj();
        if (!pageObj) {
            NS._toast('Chưa chọn page — vào Live chọn page trước', 'err');
            return;
        }
        if (!camp) camp = NS._resolveActiveCampaign(pageObj);
        if (!camp) {
            NS._toast(`Page "${pageObj.Name}" chưa có live campaign active`, 'err');
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
        const videoInfo = await NS._fetchLiveVideoInfo(pageObj.Facebook_PageId, liveVideoId);
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
        NS.STATE.counts[customerFbUserId] = (NS.STATE.counts[customerFbUserId] || 0) + 1;
        NS._renderBadgeFor(customerFbUserId);
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
        const mode = NS._getSnapMode();
        let imageBase64 = null;
        // Priority 1: caller pass bufferedFrame (auto-mode lookup nearest by commentTime)
        // → mỗi comment có frame unique từ buffer (Blob → base64 tại đây).
        if (opts.bufferedFrame?.blob) {
            try {
                imageBase64 = await NS._blobToBase64(opts.bufferedFrame.blob);
            } catch (e) {
                console.warn('[snap] bufferedFrame blob→base64 fail:', e.message);
            }
        } else if (NS.STATE.extReady && NS.STATE.frameBufferTimer) {
            // Priority 1.5: extension mode + no buffered frame → live capture now
            // via chrome.tabs.captureVisibleTab. Tránh fallback xuống getDisplayMedia
            // sẽ open popup (đã ẩn flow popup khi extension active).
            try {
                imageBase64 = await NS._captureExtensionFrame();
            } catch (e) {
                console.warn('[snap] ext live-capture fail:', e.message);
            }
        } else if (mode === NS.MODE_LIVE) {
            // Lazy init stream nếu chưa có
            if (!NS.STATE.captureStream) {
                try {
                    await NS.ensureCaptureStream(); // sẽ mở picker (lazy init)
                } catch (e) {
                    console.warn('[snap-live] init stream fail:', e.message);
                }
            }
            // Nếu stream giờ đã sẵn → capture frame
            if (NS.STATE.captureStream && NS.STATE.captureVideo?.videoWidth) {
                try {
                    const blob = await NS._captureFrameJpeg(0.72, 1280);
                    if (blob) imageBase64 = await NS._blobToBase64(blob);
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
            const r = await fetch(NS.API + '/api/livestream/snapshot', {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'omit',
                body: JSON.stringify({
                    commentId,
                    customerFbUserId,
                    customerName,
                    pageId: pageObj.Facebook_PageId,
                    pageName: pageObj.Name,
                    pageUsername: NS._resolvePageVanity(pageObj),
                    liveCampaignId,
                    liveVideoId,
                    capturedAt: referenceMs,
                    offsetSeconds: offsetSec,
                    // FB CDN signed URL từ Live livevideo (FB Graph picture endpoint
                    // trả 400 từ 05/2026). Cached qua _fetchLiveVideoInfo.
                    thumbnailUrl: videoInfo?.thumbnailUrl || undefined,
                    user: NS._user(),
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
            NS._toast(`📸 Đã chụp lúc ${t}${offsetSec ? ' (offset ' + offsetSec + 's)' : ''}`);
            // Invalidate cached list nếu đang mở popover
            NS.STATE.cacheList.delete(customerFbUserId);
            if (NS.STATE.popoverOpen === customerFbUserId) {
                NS._refreshPopoverContent(customerFbUserId);
            }
        } catch (e) {
            // Rollback optimistic
            NS.STATE.counts[customerFbUserId] = Math.max(
                0,
                (NS.STATE.counts[customerFbUserId] || 1) - 1
            );
            NS._renderBadgeFor(customerFbUserId);
            NS._toast('Lỗi snap: ' + e.message, 'err');
        }
    };

    NS._offlineSnapOne = async function ({
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
        const camp = comment
            ? NS._resolveCampaignForComment(comment)
            : NS._resolveTopCampaigns(1)[0];
        if (!camp || !camp.Facebook_LiveId) throw new Error('no live campaign matching comment');
        // Resolve pageObj từ campaign.Facebook_UserId (page sở hữu live)
        const st = global.LiveState;
        const pageObj =
            st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) ||
            st?.selectedPage;
        if (!pageObj) throw new Error('cannot resolve pageObj from campaign');
        const videoInfo = await NS._fetchLiveVideoInfo(
            pageObj.Facebook_PageId,
            camp.Facebook_LiveId
        );
        if (!videoInfo?.broadcastStartMs) throw new Error('no broadcast_start_time');
        const payload = {
            pageId: pageObj.Facebook_PageId,
            pageName: pageObj.Name,
            pageUsername: NS._resolvePageVanity(pageObj),
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
            user: NS._user(),
        };
        const r = await fetch(NS.API + '/api/livestream/offline-batch', {
            method: 'POST',
            // ENFORCE-PREP (2026-06-12)
            headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'omit',
            body: JSON.stringify(payload),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'batch failed');
        if (d.summary?.created > 0) {
            NS.STATE.counts[customerFbUserId] = (NS.STATE.counts[customerFbUserId] || 0) + 1;
            NS._renderBadgeFor(customerFbUserId);
        }
        // Auto-trigger backend extract-frame cho snap vừa tạo (path 2:
        // yt-dlp + ffmpeg lấy frame thật) — fire-and-forget. SSE 'extract-done'
        // sẽ refresh thumb khi xong.
        const newSnapId = d.created?.[0]?.snapshotId;
        if (newSnapId) {
            fetch(NS.API + '/api/livestream/extract-frame', {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'omit',
                body: JSON.stringify({ snapshotIds: [Number(newSnapId)] }),
            }).catch(() => {});
        }
        return d;
    };

    NS._createMetadataSnap = async function (p) {
        try {
            const r = await fetch(NS.API + '/api/livestream/offline-batch', {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'omit',
                body: JSON.stringify({
                    pageId: p.pageObj.Facebook_PageId,
                    pageName: p.pageObj.Name,
                    pageUsername: NS._resolvePageVanity(p.pageObj),
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
                    user: NS._user(),
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
    };

    NS._postCapturedSnap = async function (p) {
        const r = await fetch(NS.API + '/api/livestream/snapshot', {
            method: 'POST',
            // ENFORCE-PREP (2026-06-12)
            headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
            credentials: 'omit',
            body: JSON.stringify({
                commentId: p.commentId,
                customerFbUserId: p.customerFbUserId,
                customerName: p.customerName,
                pageId: p.pageObj.Facebook_PageId,
                pageName: p.pageObj.Name,
                pageUsername: NS._resolvePageVanity(p.pageObj),
                liveCampaignId: p.camp.Id ? String(p.camp.Id) : null,
                liveVideoId: p.camp.Facebook_LiveId,
                capturedAt: p.commentTimeMs,
                offsetSeconds: p.offsetSec,
                thumbnailUrl: p.videoInfo.thumbnailUrl || undefined,
                user: NS._user(),
                imageBase64: p.imageBase64,
                imageMime: 'image/jpeg',
                note: p.message ? String(p.message).slice(0, 200) : null,
            }),
        });
        const d = await r.json();
        if (!d.success) throw new Error(d.error || 'snapshot create fail');
        // Invalidate cache + re-render strip (sẽ thấy ảnh self-served).
        NS.STATE.snapByComment.delete(p.commentId);
        NS._queueSnapByComment(p.commentId);
    };

    NS.refreshCounts = async function (customerIds) {
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
                NS.API +
                    '/api/livestream/snapshots/batch-counts?customerIds=' +
                    encodeURIComponent(ids.join(',')),
                { credentials: 'omit' }
            );
            const d = await r.json();
            const counts = d.counts || {};
            for (const id of ids) NS.STATE.counts[id] = counts[id] || 0;
            ids.forEach(NS._renderBadgeFor);
        } catch (e) {
            console.warn('[snap] refreshCounts fail:', e.message);
        }
    };

    NS._renderBadgeFor = function (customerFbUserId) {
        // Find ALL snap buttons for this customer (multiple comments cùng customer)
        const btns = document.querySelectorAll(
            `.live-snap-btn[data-customer-id="${CSS.escape(customerFbUserId)}"]`
        );
        const n = NS.STATE.counts[customerFbUserId] || 0;
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
    };

    NS.offlineBatchAll = async function (opts) {
        opts = opts || {};
        // silent: auto-run (offline campaign load) → không toast lỗi/progress.
        const toast = (m, t) => {
            if (!opts.silent) NS._toast(m, t);
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
            (c) =>
                c.from?.id && !NS._isStaffComment(c) && !global.LiveHiddenCommenters?.isHidden?.(c)
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
            const camp = NS._resolveCampaignForComment(c);
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
                    NS._resolvePageObj();
                let videoInfo = null;
                if (pageObj) {
                    try {
                        videoInfo = await NS._fetchLiveVideoInfo(
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
                    pageUsername: NS._resolvePageVanity(pageObj),
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
                    user: NS._user(),
                };
                const r = await fetch(NS.API + '/api/livestream/offline-batch', {
                    method: 'POST',
                    // ENFORCE-PREP (2026-06-12)
                    headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
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
            NS.refreshCounts(Array.from(touchedIds));
            return { success: true, summary: totals };
        } catch (e) {
            toast('Lỗi backfill: ' + e.message, 'err');
            throw e;
        }
    };

    NS.offlineManualSnap = async function () {
        const pageObj = NS._resolvePageObj();
        const camp = NS._resolveActiveCampaign(pageObj);
        if (!camp) {
            NS._toast('Chưa có campaign active', 'err');
            return;
        }
        const videoInfo = await NS._fetchLiveVideoInfo(
            pageObj.Facebook_PageId,
            camp.Facebook_LiveId
        );
        if (!videoInfo?.broadcastStartMs) {
            NS._toast('Không lấy được broadcast_start_time', 'err');
            return;
        }
        const customerId = await Popup.prompt('FB User ID khách:');
        if (!customerId) return;
        const customerName = (await Popup.prompt('Tên khách:')) || '?';
        const timeStr = await Popup.prompt('Thời gian comment (HH:MM:SS hôm nay, vd 17:32:15):', {
            defaultValue: new Date().toTimeString().slice(0, 8),
        });
        if (!timeStr) return;
        const [h, m, s] = timeStr.split(':').map(Number);
        const dt = new Date();
        dt.setHours(h || 0, m || 0, s || 0, 0);
        const commentTime = dt.getTime();
        if (commentTime < videoInfo.broadcastStartMs) {
            NS._toast('Thời gian comment trước khi live bắt đầu', 'err');
            return;
        }
        const payload = {
            pageId: pageObj.Facebook_PageId,
            pageName: pageObj.Name,
            pageUsername: NS._resolvePageVanity(pageObj),
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
            user: NS._user(),
        };
        try {
            const r = await fetch(NS.API + '/api/livestream/offline-batch', {
                method: 'POST',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                credentials: 'omit',
                body: JSON.stringify(payload),
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error);
            NS._toast(`✅ Manual snap created`, 'ok');
            NS.refreshCounts([customerId]);
        } catch (e) {
            NS._toast('Lỗi manual: ' + e.message, 'err');
        }
    };
})();
