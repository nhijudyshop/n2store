// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — livestream snapshot cache + comment/line thumbnails + lightbox. MOVE-only.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // ---------- Livestream snapshot per product line ----------
    // SP có fbCommentId (kéo từ WEB2-Pancake) → fetch thumbnail snapshot từ
    // livestream tại đúng moment comment. Cache module-wide để khỏi re-fetch.
    // 3 trạng thái cache: undefined (chưa fetch), null (đã fetch nhưng không
    // có thumbnail bytea), object (có thumbnail self-served).
    NO.RENDER_API =
        (window.API_CONFIG && window.API_CONFIG.WEB2_API) || 'https://web2-api-kv04.onrender.com';

    NO._snapCache = new Map();
    // commentId → snap | null
    NO._snapPendingFetch = new Set();
    // commentIds đang/đã queue fetch
    NO._snapFetchTimer = null;

    NO._queueSnapFetch = function _queueSnapFetch(commentId, onDone) {
        if (!commentId) return;
        if (NO._snapCache.has(commentId)) {
            onDone?.();
            return;
        }
        NO._snapPendingFetch.add(commentId);
        if (NO._snapFetchTimer) return;
        NO._snapFetchTimer = setTimeout(() => NO._flushSnapFetch(onDone), 150);
    };

    NO._flushSnapFetch = async function _flushSnapFetch(onDone) {
        NO._snapFetchTimer = null;
        const ids = Array.from(NO._snapPendingFetch);
        NO._snapPendingFetch.clear();
        if (!ids.length) return;
        try {
            const r = await fetch(
                `${NO.RENDER_API}/api/livestream/snapshots/by-comment-ids?commentIds=${encodeURIComponent(ids.join(','))}`,
                { credentials: 'omit' }
            );
            // Phân biệt lỗi mạng/HTTP với "không có snapshot" (audit MEDIUM 2026-06-20):
            // r.json() trên response lỗi có thể throw/sai → check r.ok trước.
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const d = await r.json();
            const map = (d && d.byCommentId) || {};
            for (const id of ids) {
                const snap = map[id];
                if (
                    snap &&
                    typeof snap.thumbnailUrl === 'string' &&
                    snap.thumbnailUrl.includes('/api/livestream/snapshot/')
                ) {
                    NO._snapCache.set(id, snap);
                } else {
                    NO._snapCache.set(id, null);
                }
            }
        } catch (e) {
            console.warn('[native-orders] fetch snapshots fail:', e.message);
            for (const id of ids) {
                if (!NO._snapCache.has(id)) NO._snapCache.set(id, null);
            }
        }
        onDone?.();
    };

    // Render block "BÌNH LUẬN" read-only cho modal sửa đơn. Hiển thị `o.note`
    // (auto-captured FB comment với format `[time] [Page] message`) cạnh
    // thumbnail snapshot (nếu có) từ `o.fbCommentId`. Trả '' nếu không có
    // note (đơn tạo manual không qua FB).
    NO._renderCommentReadonlyBlock = function _renderCommentReadonlyBlock(o) {
        const noteText = (o.note || '').trim();
        const cid = o.fbCommentId || null;
        if (!noteText && !cid) return '';
        // Queue fetch snap nếu có commentId → re-render modal khi xong (giống
        // line thumbnail flow). Find modal node sau khi flush + re-render block.
        if (cid && !NO._snapCache.has(cid)) {
            NO._queueSnapFetch(cid, () => {
                const slot = document.querySelector('#commentReadonlyBlock');
                if (!slot) return;
                const snap = NO._snapCache.get(cid);
                const thumb = snap ? NO._renderCommentThumbHtml(snap) : '';
                const thumbSlot = slot.querySelector('.comment-thumb-slot');
                if (thumbSlot) thumbSlot.innerHTML = thumb;
            });
        }
        const snap = cid ? NO._snapCache.get(cid) : null;
        const thumbHtml = snap ? NO._renderCommentThumbHtml(snap) : '';
        const labelText = noteText ? 'Bình luận khách' : 'Bình luận khách (chưa có)';
        return `
            <div class="field-row" id="commentReadonlyBlock">
                <label>${labelText}</label>
                <div class="comment-readonly-wrap">
                    <div class="comment-thumb-slot">${thumbHtml}</div>
                    <div class="comment-readonly-text" title="Nội dung comment auto-lưu từ FB — read-only">${NO.escapeHtml(noteText) || '<em style="color:#94a3b8;">(không có nội dung)</em>'}</div>
                </div>
            </div>`;
    };

    NO._renderCommentThumbHtml = function _renderCommentThumbHtml(snap) {
        if (!snap?.thumbnailUrl) return '';
        const url = snap.thumbnailUrl;
        const offsetText =
            Number.isFinite(snap.offsetSeconds) && snap.offsetSeconds >= 0
                ? `${Math.floor(snap.offsetSeconds / 60)}m${snap.offsetSeconds % 60}s`
                : '';
        const liveUrl = snap.livestreamUrl || '';
        const tip = `Thumbnail livestream${offsetText ? ' @ ' + offsetText : ''} · Click để xem lớn`;
        return `<img src="${NO.escapeHtml(url)}"
                     alt=""
                     loading="lazy"
                     class="comment-snap-thumb"
                     data-snap-url="${NO.escapeHtml(url)}"
                     data-snap-live-url="${NO.escapeHtml(liveUrl)}"
                     data-snap-offset="${offsetText}"
                     title="${NO.escapeHtml(tip)}"
                     onclick="NativeOrdersApp.openSnapLightbox(this)" />`;
    };

    NO._renderLineSnapThumb = function _renderLineSnapThumb(commentId) {
        if (!commentId) return '';
        const snap = NO._snapCache.get(commentId);
        if (!snap) return '';
        const url = snap.thumbnailUrl;
        const offsetText =
            Number.isFinite(snap.offsetSeconds) && snap.offsetSeconds >= 0
                ? `${Math.floor(snap.offsetSeconds / 60)}m${snap.offsetSeconds % 60}s`
                : '';
        const liveUrl = snap.livestreamUrl || '';
        const tipParts = ['Thumbnail từ livestream'];
        if (offsetText) tipParts.push(`@ ${offsetText}`);
        tipParts.push('Click để xem lớn');
        return `<img src="${NO.escapeHtml(url)}"
                     alt=""
                     loading="lazy"
                     class="line-snap-thumb"
                     data-snap-url="${NO.escapeHtml(url)}"
                     data-snap-live-url="${NO.escapeHtml(liveUrl)}"
                     data-snap-offset="${offsetText}"
                     title="${NO.escapeHtml(tipParts.join(' · '))}"
                     onclick="NativeOrdersApp.openSnapLightbox(this)" />`;
    };

    // Lightbox đơn giản cho snapshot — full-screen overlay click-to-close.
    NO.openSnapLightbox = function openSnapLightbox(imgEl) {
        if (!imgEl?.dataset) return;
        const url = imgEl.dataset.snapUrl;
        if (!url) return;
        const liveUrl = imgEl.dataset.snapLiveUrl || '';
        const offset = imgEl.dataset.snapOffset || '';
        const existing = document.querySelector('.native-snap-lightbox');
        if (existing) existing.remove();
        const lb = document.createElement('div');
        lb.className = 'native-snap-lightbox';
        lb.style.cssText =
            'position:fixed;inset:0;background:rgba(0,0,0,0.85);z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;cursor:zoom-out;';
        lb.innerHTML = `
            <img src="${NO.escapeHtml(url)}" alt=""
                 style="max-width:92vw;max-height:78vh;object-fit:contain;border-radius:8px;box-shadow:0 8px 32px rgba(0,0,0,0.6);cursor:default;background:#111;" />
            <div style="margin-top:14px;display:flex;align-items:center;gap:12px;color:#fff;font-size:13px;">
                ${offset ? `<span style="background:rgba(255,255,255,0.15);padding:4px 10px;border-radius:6px;">@ ${NO.escapeHtml(offset)}</span>` : ''}
                ${liveUrl ? `<a href="${NO.escapeHtml(liveUrl)}" target="_blank" rel="noopener" style="background:#3b82f6;color:#fff;padding:8px 16px;border-radius:6px;text-decoration:none;font-weight:600;">▶ Xem live tại giây này</a>` : ''}
                <button type="button" class="snap-lb-close" style="background:#475569;color:#fff;border:none;padding:8px 16px;border-radius:6px;font-weight:600;cursor:pointer;">Đóng</button>
            </div>
        `;
        const close = () => lb.remove();
        lb.addEventListener('click', (e) => {
            if (e.target === lb || e.target.classList?.contains('snap-lb-close')) close();
        });
        document.body.appendChild(lb);
        // Stop click bubbling on inner controls
        lb.querySelectorAll('img, a').forEach((el) => {
            el.addEventListener('click', (e) => e.stopPropagation());
        });
    };
})();
