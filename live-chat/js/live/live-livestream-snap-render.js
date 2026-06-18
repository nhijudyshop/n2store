// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// LiveSnap module: snap-render (thumbnail strip, popover, lightbox, inject buttons)
// Tách MOVE-only từ live-livestream-snap.js (2026-06-19). Chia sẻ state qua
// internal namespace window.LiveSnap. Public API window.LiveLivestreamSnap do
// live-livestream-snap-init.js dựng. Load TRƯỚC snap-init theo thứ tự phụ thuộc.
// =====================================================
(function () {
    'use strict';
    const global = window;
    const NS = (global.LiveSnap = global.LiveSnap || {});

    NS._showZoomPreview = function (img) {
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
    };

    NS._hideZoomPreview = function () {
        const zoom = document.getElementById('live-snap-zoom-preview');
        if (zoom) zoom.style.display = 'none';
    };

    NS._queueSnapByComment = function (commentId) {
        if (!commentId || NS.STATE.snapByComment.has(commentId)) return;
        NS.STATE.snapByCommentPending.add(commentId);
        if (NS.STATE.snapByCommentTimer) return;
        // Debounce gom 300ms → 1 batch fetch tối đa 200 IDs.
        NS.STATE.snapByCommentTimer = setTimeout(NS._flushSnapByCommentBatch, 300);
    };

    NS._deleteSnapByComment = async function (commentId, snapId) {
        if (!commentId) return;
        if (
            !(await Popup.danger(
                'Xóa thumbnail snap? Sau đó dùng nút 📸 trên comment để chụp lại.',
                {
                    okText: 'Xóa',
                }
            ))
        ) {
            return;
        }
        try {
            // Backend xóa qua snap.id. Nếu thiếu snapId (snap row null trong cache)
            // → fallback resolve qua by-comment-ids.
            let resolvedId = snapId;
            if (!resolvedId) {
                const r = await fetch(
                    NS.API +
                        '/api/livestream/snapshots/by-comment-ids?commentIds=' +
                        encodeURIComponent(commentId),
                    { credentials: 'omit' }
                );
                const d = await r.json();
                resolvedId = d?.byCommentId?.[commentId]?.id;
            }
            if (!resolvedId) {
                NS._toast('Không tìm thấy snap để xóa', 'err');
                return;
            }
            const r = await fetch(NS.API + '/api/livestream/snapshot/' + resolvedId, {
                method: 'DELETE',
                // ENFORCE-PREP (2026-06-12)
                headers: NS._w2AuthHeaders(),
                credentials: 'omit',
            });
            const d = await r.json();
            if (!d.success) throw new Error(d.error || 'delete failed');
            // Clear local cache → re-queue → fetch DB sẽ trả null → row trở
            // về trạng thái "chưa snap". User click 📸 để chụp lại.
            NS.STATE.snapByComment.delete(commentId);
            NS._renderThumbStripFor(commentId);
            NS._queueSnapByComment(commentId);
            NS._toast('✅ Đã xóa thumbnail — bấm 📸 trên comment để chụp lại', 'ok');
        } catch (e) {
            NS._toast('Lỗi xóa thumbnail: ' + e.message, 'err');
        }
    };

    NS._invalidateSnapCacheAndRefresh = function () {
        const rows = document.querySelectorAll('.live-conversation-item[data-comment-id]');
        const cids = [];
        rows.forEach((row) => {
            const cid = row.dataset.commentId;
            if (cid) cids.push(cid);
        });
        // Wipe entries cho các commentId visible → ép re-fetch
        cids.forEach((cid) => NS.STATE.snapByComment.delete(cid));
        // Queue lại tất cả → _flushSnapByCommentBatch fetch from DB + render
        cids.forEach((cid) => NS._queueSnapByComment(cid));
    };

    NS._flushSnapByCommentBatch = async function () {
        NS.STATE.snapByCommentTimer = null;
        const ids = Array.from(NS.STATE.snapByCommentPending);
        NS.STATE.snapByCommentPending.clear();
        if (!ids.length) return;
        const chunks = [];
        for (let i = 0; i < ids.length; i += 100) chunks.push(ids.slice(i, i + 100));
        for (const chunk of chunks) {
            try {
                const r = await fetch(
                    NS.API +
                        '/api/livestream/snapshots/by-comment-ids?commentIds=' +
                        encodeURIComponent(chunk.join(',')),
                    { credentials: 'omit' }
                );
                const d = await r.json();
                const map = d.byCommentId || {};
                for (const id of chunk) {
                    const snapRow = map[id];
                    // CHỈ chấp nhận snap có frozen bytea image (URL self-served
                    // /api/livestream/snapshot/:id/image) — đó là frame thật unique.
                    // Snap chỉ có thumbnail_url generic FB CDN (path 2 / backfill) → bỏ.
                    if (snapRow && snapRow.thumbnailUrl?.includes('/api/livestream/snapshot/')) {
                        NS.STATE.snapByComment.set(id, snapRow);
                    } else {
                        NS.STATE.snapByComment.set(id, null);
                    }
                    NS._renderThumbStripFor(id);
                }
            } catch (e) {
                // Chunk fail → KHÔNG set entry trong STATE.snapByComment cho các
                // id này → `.has()` false → lần render row tiếp theo (observer /
                // _invalidateSnapCacheAndRefresh) gọi _queueSnapByComment sẽ tự
                // re-queue → natural retry, không cần retry loop riêng.
                console.warn('[snap] by-comment-ids fail:', e.message);
            }
        }
    };

    NS._renderThumbStripFor = function (commentId) {
        const row = document.querySelector(
            `.live-conversation-item[data-comment-id="${CSS.escape(commentId)}"]`
        );
        if (!row) return;
        let strip = row.querySelector('.live-snap-thumb-strip');
        if (!NS._isInlineThumbOn()) {
            if (strip) strip.remove();
            return;
        }
        const data = NS.STATE.snapByComment.get(commentId);
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
                    <img src="${NS._esc(data.thumbnailUrl)}"
                         alt=""
                         loading="lazy"
                         class="live-snap-thumb-img snap-pop-thumb"
                         data-snap-url="${NS._esc(data.livestreamUrl || '')}"
                         data-snap-offset="${data.offsetSeconds ?? ''}"
                         title="Snapshot lúc Live @ ${offsetText} — hover zoom · click mở lớn"
                         style="width:72px;height:40px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:zoom-in;display:block;background:#f1f5f9;box-shadow:0 1px 3px rgba(0,0,0,0.08);"
                         onerror="this.style.background='#fee2e2';this.removeAttribute('src');" />
                    <button type="button"
                            class="live-snap-thumb-del"
                            data-snap-id="${data.id || ''}"
                            data-comment-id="${NS._esc(commentId)}"
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
                    NS._hideZoomPreview();
                    await NS._deleteSnapByComment(commentId, data.id);
                });
            }
            if (img) {
                img.addEventListener('click', (e) => {
                    e.stopPropagation();
                    NS._hideZoomPreview();
                    NS._openSnapLightbox(data);
                });
                // Hover zoom — reuse popover zoom preview helper.
                img.addEventListener('mouseenter', () => NS._showZoomPreview(img));
                img.addEventListener('mousemove', () => NS._showZoomPreview(img));
                img.addEventListener('mouseleave', NS._hideZoomPreview);
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
                    data-comment-id="${NS._esc(commentId)}"
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
    };

    NS._openSnapLightbox = function (data) {
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
            <img src="${NS._esc(data.thumbnailUrl)}"
                 alt=""
                 style="max-width:90vw;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);cursor:default;" />
            <div style="margin-top:14px;display:flex;align-items:center;gap:12px;">
                <button type="button" class="snap-lb-play"
                        data-url="${NS._esc(data.livestreamUrl || '')}"
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
    };

    NS._refreshThumbStripsForCustomer = function (customerFbUserId) {
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
                NS.STATE.snapByComment.delete(cid);
                NS._queueSnapByComment(cid);
            });
    };

    NS.togglePopover = async function (customerFbUserId, customerName, anchor, filterCommentId) {
        const popoverKey = filterCommentId
            ? `${customerFbUserId}:${filterCommentId}`
            : customerFbUserId;
        const existing = document.querySelector('.live-snap-popover');
        if (existing && NS.STATE.popoverOpen === popoverKey) {
            existing.remove();
            NS.STATE.popoverOpen = null;
            return;
        }
        if (existing) existing.remove();
        NS.STATE.popoverOpen = popoverKey;

        const pop = document.createElement('div');
        pop.className = 'live-snap-popover';
        pop.dataset.filterCommentId = filterCommentId || '';
        pop.style.cssText =
            'position:absolute;z-index:9999;background:#fff;border:1px solid #e5e7eb;border-radius:10px;box-shadow:0 8px 24px rgba(0,0,0,0.12);padding:10px;min-width:280px;max-width:340px;max-height:420px;overflow-y:auto;font-family:Inter,system-ui,sans-serif;';
        pop.innerHTML = `
            <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:8px;border-bottom:1px solid #f1f5f9;padding-bottom:6px;">
                <span style="font-size:12px;font-weight:600;color:#111;">📸 Snapshots — ${NS._esc(customerName || '?')}</span>
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
            NS.STATE.popoverOpen = null;
        };
        setTimeout(() => {
            const closeOutside = (e) => {
                if (!pop.contains(e.target) && !anchor.contains(e.target)) {
                    pop.remove();
                    NS.STATE.popoverOpen = null;
                    document.removeEventListener('click', closeOutside);
                }
            };
            document.addEventListener('click', closeOutside);
        }, 0);

        await NS._refreshPopoverContent(customerFbUserId, filterCommentId);
    };

    NS._refreshPopoverContent = async function (customerFbUserId, filterCommentId) {
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
                NS.API +
                    '/api/livestream/snapshots?customerFbUserId=' +
                    encodeURIComponent(customerFbUserId) +
                    '&limit=30',
                { credentials: 'omit' }
            );
            const d = await r.json();
            const allSnapshots = d.snapshots || [];
            NS.STATE.cacheList.set(customerFbUserId, allSnapshots);
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
                fetch(NS.API + '/api/livestream/extract-frame', {
                    method: 'POST',
                    // ENFORCE-PREP (2026-06-12)
                    headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
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
                        thumb = `<img class="snap-pop-thumb" src="${NS._esc(s.thumbnailUrl)}" alt="" style="width:54px;height:54px;object-fit:cover;border-radius:6px;background:#f1f5f9;cursor:zoom-in;" onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex';" /><span style="display:none;width:54px;height:54px;border-radius:6px;background:#f1f5f9;align-items:center;justify-content:center;font-size:18px;">📷</span>`;
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
                        ? `<span style="font-size:10px;background:#fef3c7;color:#92400e;padding:1px 5px;border-radius:6px;font-weight:600;">${NS._esc(s.pageName.replace(/^Nhi Judy /, '').replace(/^NhiJudy /, ''))}</span>`
                        : '';
                    // Hiển thị offset dạng human-readable "+1h23m45s" với tooltip
                    // = giây tuyệt đối + chỉ thị "giây thứ N của video livestream".
                    const offsetHuman = NS._fmtOffset(s.offsetSeconds);
                    const offsetTxt = offsetHuman
                        ? ` <span title="Tại giây thứ ${s.offsetSeconds} của video livestream" style="color:#0c4a6e;font-size:10px;background:#e0f2fe;padding:1px 5px;border-radius:4px;font-weight:600;">${offsetHuman}</span>`
                        : '';
                    return `
                        <div class="snap-pop-row" data-id="${s.id}" style="display:flex;gap:8px;padding:6px 0;border-bottom:1px solid #f1f5f9;align-items:center;">
                            ${thumb}
                            <div style="flex:1;min-width:0;">
                                <div style="font-size:11px;color:#0f172a;font-weight:600;">${NS._esc(t)}${offsetTxt}</div>
                                <div style="font-size:10px;color:#64748b;margin-top:2px;display:flex;gap:4px;align-items:center;">${pageBadge}${s.note ? ' · ' + NS._esc(s.note) : ''}</div>
                            </div>
                            <div style="display:flex;flex-direction:column;gap:3px;">
                                <button type="button" class="snap-pop-play" data-url="${NS._esc(url)}" title="Mở FB plugin player (popup 480×860 portrait-friendly) tại thời điểm chụp" style="font-size:10px;color:#fff;background:#1877f2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;text-align:center;">▶ Xem</button>
                                <button type="button" class="snap-pop-refresh" data-id="${s.id}" title="Refresh thumbnail từ FB Graph (lazy fetch hiện tại)" style="font-size:10px;color:#0c4a6e;background:#e0f2fe;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">🔄</button>
                                <button type="button" class="snap-pop-del" data-id="${s.id}" title="Xóa snapshot" style="font-size:10px;color:#dc2626;background:#fee2e2;border:none;padding:3px 8px;border-radius:5px;cursor:pointer;font-weight:600;">Xóa</button>
                            </div>
                        </div>`;
                })
                .join('');
            // Hover zoom — preview ảnh 480x270 cạnh thumbnail khi user di chuột.
            body.querySelectorAll('.snap-pop-thumb').forEach((img) => {
                img.addEventListener('mouseenter', () => NS._showZoomPreview(img));
                img.addEventListener('mousemove', () => NS._showZoomPreview(img));
                img.addEventListener('mouseleave', NS._hideZoomPreview);
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
                        const r = await fetch(NS.API + '/api/livestream/extract-frame', {
                            method: 'POST',
                            // ENFORCE-PREP (2026-06-12)
                            headers: NS._w2AuthHeaders({ 'Content-Type': 'application/json' }),
                            credentials: 'omit',
                            body: JSON.stringify({ snapshotIds: [Number(id)] }),
                        });
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        NS._toast('⏳ Backend đang extract (5-15s)...', 'ok');
                        // SSE 'extract-done' sẽ refresh popover tự động.
                    } catch (err) {
                        NS._toast('Extract fail: ' + err.message, 'err');
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
                    if (!(await Popup.danger('Xóa snapshot này?', { okText: 'Xóa' }))) return;
                    try {
                        const r = await fetch(NS.API + '/api/livestream/snapshot/' + id, {
                            method: 'DELETE',
                            // ENFORCE-PREP (2026-06-12)
                            headers: NS._w2AuthHeaders(),
                            credentials: 'omit',
                        });
                        const d = await r.json();
                        if (!d.success) throw new Error(d.error);
                        NS.STATE.cacheList.delete(customerFbUserId);
                        NS.STATE.counts[customerFbUserId] = Math.max(
                            0,
                            (NS.STATE.counts[customerFbUserId] || 1) - 1
                        );
                        NS._renderBadgeFor(customerFbUserId);
                        NS._refreshPopoverContent(customerFbUserId);
                    } catch (err) {
                        NS._toast('Xóa fail: ' + err.message, 'err');
                    }
                };
            });
        } catch (e) {
            body.innerHTML = `<div style="color:#dc2626;">Lỗi tải: ${NS._esc(e.message)}</div>`;
        }
    };

    NS.injectSnapButtonsAll = function () {
        document.querySelectorAll('.live-conversation-item').forEach((row) => {
            NS.injectSnapButton(row);
        });
    };

    NS.injectSnapButton = function (row) {
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
            if (e.shiftKey || NS._isAutoMode()) {
                // Filter theo commentId → chỉ hiện snapshot của ĐÚNG comment.
                // Shift+click bypass filter → xem all snapshots của KH.
                NS.togglePopover(
                    customerFbUserId,
                    customerName,
                    btn,
                    e.shiftKey ? null : commentId
                );
            } else {
                const commentTime = c?.created_time
                    ? SharedUtils.toEpochMs(c.created_time) || null
                    : c?.createdTime
                      ? Number(c.createdTime)
                      : null;
                NS.snap(customerFbUserId, customerName, commentId, btn, {
                    commentTime: commentTime && Number.isFinite(commentTime) ? commentTime : null,
                    comment: c || undefined,
                });
            }
        };
        // Right-click → show popover (all snapshots, không filter)
        btn.oncontextmenu = (e) => {
            e.preventDefault();
            e.stopPropagation();
            NS.togglePopover(customerFbUserId, customerName, btn);
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
        const cached = NS.STATE.counts[customerFbUserId];
        if (cached && cached > 0) {
            const badge = document.createElement('span');
            badge.className = 'live-snap-count';
            badge.style.cssText =
                'background:#ef4444;color:#fff;font-size:9px;font-weight:700;padding:1px 4px;border-radius:8px;margin-left:3px;min-width:14px;text-align:center;display:inline-block;';
            badge.textContent = cached;
            btn.appendChild(badge);
        }
        // Queue thumbnail strip lookup chỉ khi toggle ON.
        if (NS._isInlineThumbOn()) {
            if (NS.STATE.snapByComment.has(commentId)) {
                NS._renderThumbStripFor(commentId);
            } else {
                NS._queueSnapByComment(commentId);
            }
        }
    };

    NS.getCurrentCampaignContext = function () {
        const st = global.LiveState;
        const pageObj = NS._resolvePageObj();
        const camp =
            (pageObj && NS._resolveActiveCampaign(pageObj)) || NS._findActiveLiveCampaign();
        if (!camp) return null;
        const resolvedPage =
            pageObj ||
            st?.allPages?.find((p) => p.Facebook_PageId === camp.Facebook_UserId) ||
            st?.selectedPage;
        return {
            pageId: resolvedPage?.Facebook_PageId || camp.Facebook_UserId || null,
            pageName: resolvedPage?.Name || null,
            pageUsername: resolvedPage ? NS._resolvePageVanity(resolvedPage) : null,
            liveCampaignId: camp.Id ? String(camp.Id) : null,
            liveCampaignName: camp.Name || null,
            liveVideoId: camp.Facebook_LiveId || null,
        };
    };

    NS.getCurrentOffsetSeconds = async function (ctx) {
        try {
            if (!ctx?.pageId || !ctx?.liveVideoId) return null;
            const info = await NS._fetchLiveVideoInfo(ctx.pageId, ctx.liveVideoId);
            if (!info?.broadcastStartMs) return null;
            const sec = Math.floor((Date.now() - info.broadcastStartMs) / 1000);
            return sec > 0 ? sec : null;
        } catch {
            return null;
        }
    };
})();
