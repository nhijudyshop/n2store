// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — XEM comment chiến dịch trong live-chat; TẠO/GÁN/QUẢN LÝ ở trang campaign-manager (1 nguồn).
// =====================================================================
// LiveCampaignManager — nút "📁 Chiến dịch" + modal CHỈ ĐỌC: liệt kê chiến
// dịch cha + "Xem comment" (gom mọi bài của chiến dịch vào cột comment live).
//
// 2026-07-01: GỠ tạo/gán/xoá chiến dịch khỏi live-chat (giống native-orders —
// chỉ CHỌN/XEM, KHÔNG quản lý). Tạo + gom bài + xoá = 1 NGUỒN duy nhất ở trang
// Quản lý chiến dịch (`web2/campaign-manager/`). Nút "Tạo / Quản lý" mở trang đó.
// Route đọc dùng chung: /api/web2-live-comments/{campaigns,?campaignId} qua Web2Campaign.
// =====================================================================

(function (global) {
    'use strict';
    if (global.LiveCampaignManager) return;

    const API = (() => {
        const w = global.LiveState?.workerUrl || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return w.replace(/\/$/, '') + '/api/web2-live-comments';
    })();

    // Trang quản lý chiến dịch (1 nguồn tạo/gán/xoá). Relative từ live-chat/.
    const MANAGER_URL = '../web2/campaign-manager/index.html';

    const esc = (s) =>
        String(s == null ? '' : s).replace(
            /[&<>"]/g,
            (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
        );

    let _camps = [];

    function _injectStyles() {
        if (document.getElementById('lcm-styles')) return;
        const s = document.createElement('style');
        s.id = 'lcm-styles';
        s.textContent = `
        .lcm-fab{background:#2a96ff;color:#fff;border:0;border-radius:8px;padding:5px 12px;font-size:12.5px;font-weight:600;cursor:pointer;display:inline-flex;gap:5px;align-items:center;white-space:nowrap;flex-shrink:0}
        .lcm-fab.lcm-fab-float{position:fixed;right:18px;bottom:18px;z-index:9998;border-radius:999px;padding:10px 16px;font-size:13px;box-shadow:0 4px 14px rgba(0, 104, 255,.4)}
        .lcm-fab:hover{filter:brightness(1.05)}
        .lcm-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center}
        .lcm-modal.open{display:flex}
        .lcm-back{position:absolute;inset:0;background:rgba(15,23,42,.5)}
        .lcm-panel{position:relative;background:#fff;border-radius:14px;width:min(560px,94vw);max-height:88vh;overflow:auto;padding:0}
        .lcm-head{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #eef2f7;position:sticky;top:0;background:#fff;z-index:1}
        .lcm-head h3{margin:0;font-size:16px}
        .lcm-head-actions{display:flex;align-items:center;gap:8px}
        .lcm-x{border:0;background:none;font-size:22px;cursor:pointer;color:#6b7280;line-height:1}
        .lcm-body{padding:16px 20px}
        .lcm-sec{margin-bottom:14px}
        .lcm-sec h4{margin:0 0 8px;font-size:13px;color:#374151}
        .lcm-note{font-size:12px;color:#6b7280;background:#f8fafc;border:1px solid #eef2f7;border-radius:9px;padding:9px 11px;margin-bottom:12px;line-height:1.5}
        .lcm-note a{color:#2a96ff;font-weight:600;text-decoration:none}
        .lcm-row{display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid #f4f6f9}
        .lcm-row:last-child{border-bottom:0}
        .lcm-name{flex:1;min-width:0;font-weight:600;font-size:13px}
        .lcm-sub{font-size:11.5px;color:#6b7280;font-weight:400}
        .lcm-btn{border:1px solid #d1d5db;background:#fff;border-radius:7px;padding:5px 11px;font-size:12.5px;cursor:pointer}
        .lcm-btn:hover{background:#f3f4f6}
        .lcm-btn-p{background:#2a96ff;color:#fff;border-color:#2a96ff}
        .lcm-empty{font-size:12.5px;color:#9ca3af;padding:6px 0}`;
        document.head.appendChild(s);
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho route soft-gated (WEB2_AUTH_ENFORCE).
    function _w2AuthHeaders(extra) {
        if (global.Web2Auth?.authHeaders) return global.Web2Auth.authHeaders(extra);
        const h = { ...(extra || {}) };
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* no token */
        }
        return h;
    }

    async function _api(path, opts) {
        const o = { signal: AbortSignal.timeout(15000), ...(opts || {}) };
        o.headers = _w2AuthHeaders(o.headers);
        const r = await fetch(API + path, o);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json().catch(() => ({}));
    }

    // Mở trang quản lý (1 nguồn tạo/gán/xoá). create=true → deep-link ?create=1.
    function _openManager(create) {
        window.open(MANAGER_URL + (create ? '?create=1' : ''), '_blank', 'noopener');
    }

    // Generation counter: render chồng → chỉ lần MỚI NHẤT ghi DOM.
    let _renderGen = 0;

    async function _render() {
        const body = document.getElementById('lcm-body');
        if (!body) return;
        const gen = ++_renderGen;
        let camps;
        try {
            // DÙNG CHUNG: campaign list 1 nguồn ở web2/shared/web2-campaign.js.
            camps = await global.Web2Campaign.list();
        } catch (e) {
            if (gen !== _renderGen) return;
            body.innerHTML =
                '<div style="padding:16px;color:#ef4444">Lỗi tải: ' + esc(e.message) + '</div>';
            return;
        }
        if (gen !== _renderGen) return;
        _camps = camps || [];
        body.innerHTML = `
            <div class="lcm-note">
                Tạo chiến dịch, gom bài livestream, xoá… ở
                <a href="#" id="lcm-open-mgr">trang Quản lý chiến dịch ↗</a>
                (1 nguồn duy nhất). Ở đây chỉ <b>xem comment</b> đã gom.
            </div>
            <div class="lcm-sec">
                <h4>Chiến dịch cha</h4>
                ${
                    _camps.length
                        ? _camps
                              .map(
                                  (c) => `<div class="lcm-row" data-cid="${c.id}">
                        <div class="lcm-name">${esc(c.name)}
                            <div class="lcm-sub">${c.post_count || 0} bài · ${(c.comment_count || 0).toLocaleString('vi-VN')} comment</div>
                        </div>
                        <button class="lcm-btn lcm-btn-p" data-act="view">Xem comment</button>
                    </div>`
                              )
                              .join('')
                        : '<div class="lcm-empty">Chưa có chiến dịch nào. Bấm “trang Quản lý chiến dịch ↗” để tạo.</div>'
                }
            </div>`;
    }

    function _open() {
        document.getElementById('lcm-modal')?.classList.add('open');
        _render();
    }
    function _close() {
        document.getElementById('lcm-modal')?.classList.remove('open');
    }

    function _mount() {
        _injectStyles();
        if (document.getElementById('lcm-fab')) return;
        const fab = document.createElement('button');
        fab.id = 'lcm-fab';
        fab.innerHTML = '📁 Chiến dịch';
        fab.onclick = _open;
        // Ưu tiên gắn vào topbar (#liveTopbarActions) để iframe livestream không che.
        const slot = document.getElementById('liveTopbarActions');
        if (slot) {
            fab.className = 'lcm-fab';
            slot.appendChild(fab);
        } else {
            fab.className = 'lcm-fab lcm-fab-float';
            document.body.appendChild(fab);
        }

        const modal = document.createElement('div');
        modal.id = 'lcm-modal';
        modal.className = 'lcm-modal';
        modal.innerHTML = `
            <div class="lcm-back"></div>
            <div class="lcm-panel">
                <div class="lcm-head">
                    <h3>📁 Chiến dịch cha</h3>
                    <div class="lcm-head-actions">
                        <button class="lcm-btn lcm-btn-p" id="lcm-manage">+ Tạo / Quản lý</button>
                        <button class="lcm-x" title="Đóng">×</button>
                    </div>
                </div>
                <div class="lcm-body" id="lcm-body"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.querySelector('.lcm-back').onclick = _close;
        modal.querySelector('.lcm-x').onclick = _close;
        // "+ Tạo / Quản lý" → mở trang campaign-manager (deep-link chế độ tạo).
        modal.querySelector('#lcm-manage').onclick = () => _openManager(true);

        // CHỈ ĐỌC: "Xem comment" (consumer live-chat) + link mở trang quản lý.
        modal.addEventListener('click', async (e) => {
            if (e.target.closest('#lcm-open-mgr')) {
                e.preventDefault();
                _openManager(false);
                return;
            }
            const btn = e.target.closest('[data-act="view"]');
            if (!btn) return;
            const cid = btn.closest('[data-cid]')?.dataset.cid;
            if (cid) _viewCampaign(cid);
        });
    }

    // Banner "← Quay lại live" hiện trên đầu cột comment khi đang xem chiến dịch.
    function _showBackBanner(campName) {
        _removeBackBanner();
        const list = document.getElementById('liveCommentList');
        if (!list || !list.parentNode) return;
        const bar = document.createElement('div');
        bar.id = 'lcm-back-banner';
        bar.style.cssText =
            'display:flex;align-items:center;gap:8px;padding:7px 12px;background:#eef2ff;border-bottom:1px solid #c7d2fe;font-size:12.5px;color:#3730a3';
        bar.innerHTML = `<span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">📁 Đang xem chiến dịch${campName ? ': <strong>' + esc(campName) + '</strong>' : ''}</span>
            <button class="lcm-btn" id="lcm-back-live" style="white-space:nowrap">← Quay lại live</button>`;
        list.parentNode.insertBefore(bar, list);
        bar.querySelector('#lcm-back-live').onclick = exitCampaignView;
    }
    function _removeBackBanner() {
        document.getElementById('lcm-back-banner')?.remove();
    }

    // Thoát chế độ xem chiến dịch → khôi phục comments live ban đầu.
    function exitCampaignView() {
        const st = global.LiveState;
        const mgr = global.LiveColumnManager;
        _removeBackBanner();
        if (st && mgr && mgr._origComments) {
            st.comments = mgr._origComments;
            mgr._origComments = null;
            global.LiveCommentList?.renderComments?.();
        }
    }

    // Xem comment 1 chiến dịch cha → load từ DB (gom mọi bài) vào cột comment.
    // limit 1500 (1 request kéo nhiều row map+sort+render 1 lần gây lag).
    const VIEW_LIMIT = 1500;
    async function _viewCampaign(campaignId) {
        try {
            const d = await _api(
                '/?campaignId=' + encodeURIComponent(campaignId) + '&limit=' + VIEW_LIMIT
            );
            const rows = d.data || [];
            if (rows.length >= VIEW_LIMIT) {
                console.warn(
                    '[LiveCampaignManager] chạm cap ' +
                        VIEW_LIMIT +
                        ' comment — chỉ hiển thị phần mới nhất.'
                );
            }
            const st = global.LiveState;
            const mgr = global.LiveColumnManager;
            if (st && mgr?._mapDbComment) {
                // Giữ comments live gốc để "← Quay lại live" khôi phục được.
                if (!mgr._origComments) mgr._origComments = st.comments;
                st.comments = rows.map((r) => mgr._mapDbComment(r));
                st.comments.sort(
                    (a, b) =>
                        SharedUtils.toEpochMs(b.created_time) -
                        SharedUtils.toEpochMs(a.created_time)
                );
                global.LiveCommentList?.renderComments?.();
                const camp = _camps.find((c) => String(c.id) === String(campaignId));
                _showBackBanner(camp?.name || '');
                _close();
                global.notificationManager?.show?.(
                    rows.length >= VIEW_LIMIT
                        ? `Xem ${rows.length} comment mới nhất của chiến dịch (giới hạn ${VIEW_LIMIT})`
                        : `Xem ${rows.length} comment của chiến dịch`,
                    'info'
                );
            }
        } catch (e) {
            Popup.error('Lỗi xem: ' + e.message);
        }
    }

    global.LiveCampaignManager = { mount: _mount, open: _open, exitCampaignView };

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(_mount, 1500));
    } else {
        setTimeout(_mount, 1500);
    }
})(typeof window !== 'undefined' ? window : globalThis);
