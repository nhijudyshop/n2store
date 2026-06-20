// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// PancakeLivestreamFilter — chọn CHIẾN DỊCH livestream cho cột chat Pancake.
// Chọn 1 chiến dịch → load danh sách KH đã comment (fb_id + SĐT) từ
// /api/web2-live-comments → build Set để phân loại hội thoại:
//   • Tab "Livestream" = hội thoại (cả inbox + comment) của người CÓ trong set.
//   • Tab "Inbox"      = hội thoại của người KHÔNG có trong set.
// Nguồn data = bài viết livestream đã gom comment (xem live-chat/index.html).
// Realtime: subscribe SSE web2:live-comments → refetch set (debounce) khi live.
// =====================================================================

(function (global) {
    'use strict';
    if (global.PancakeLivestreamFilter) return;

    const LS_KEY = 'web2_pancake_live_campaign';
    const COMMENTER_LIMIT = 5000; // cap rows kéo về để dedupe commenter

    function _worker() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            (global.WEB2_CONFIG && global.WEB2_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        ).replace(/\/$/, '');
    }
    function _api(path, opts) {
        const o = { signal: AbortSignal.timeout(20000), ...(opts || {}) };
        // ENFORCE: route soft-gated → cần x-web2-token (web2-auth). Thiếu → server 401.
        o.headers = global.Web2Auth?.authHeaders
            ? global.Web2Auth.authHeaders(o.headers)
            : (() => {
                  const h = { ...(o.headers || {}) };
                  try {
                      const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                      if (t) h['x-web2-token'] = t;
                  } catch {}
                  return h;
              })();
        return fetch(_worker() + '/api/web2-live-comments' + path, o).then((r) => {
            if (!r.ok) throw new Error('HTTP ' + r.status);
            return r.json().catch(() => ({}));
        });
    }

    function _normPhone(p) {
        if (!p) return '';
        if (global.SharedUtils?.normalizePhone) return global.SharedUtils.normalizePhone(p) || '';
        return String(p).replace(/[^\d]/g, '');
    }

    const state = {
        campaigns: [],
        selectedId: (() => {
            try {
                return localStorage.getItem(LS_KEY) || '';
            } catch {
                return '';
            }
        })(),
        fbIds: new Set(),
        phones: new Set(),
        loading: false,
    };

    function _persist() {
        try {
            if (state.selectedId) localStorage.setItem(LS_KEY, state.selectedId);
            else localStorage.removeItem(LS_KEY);
        } catch {}
    }

    // Build candidate ids/phone của 1 hội thoại Pancake để đối chiếu commenter set.
    function isLivestreamConv(conv) {
        if (!conv) return false;
        if (!state.fbIds.size && !state.phones.size) return false;
        const customer = conv.customers?.[0] || conv.from || {};
        const ids = [
            conv.from?.id,
            conv.from_psid,
            customer.psid,
            customer.id,
            customer.fb_id,
        ].filter(Boolean);
        for (const id of ids) if (state.fbIds.has(String(id))) return true;
        const ph = _normPhone(
            customer.phone || customer.phone_numbers?.[0] || conv.recent_phone_numbers?.[0] || ''
        );
        if (ph && state.phones.has(ph)) return true;
        return false;
    }

    async function _loadCampaigns() {
        try {
            const d = await _api('/campaigns');
            state.campaigns = d.data || [];
        } catch (e) {
            console.warn('[LS-FILTER] load campaigns fail:', e.message);
            state.campaigns = [];
        }
        _renderBar();
    }

    async function _loadCommenters(campaignId) {
        if (!campaignId) {
            state.fbIds = new Set();
            state.phones = new Set();
            return;
        }
        state.loading = true;
        _renderBar();
        try {
            const d = await _api(
                '/?campaignId=' + encodeURIComponent(campaignId) + '&limit=' + COMMENTER_LIMIT
            );
            const rows = d.data || [];
            const fbIds = new Set();
            const phones = new Set();
            for (const r of rows) {
                if (r.fb_id) fbIds.add(String(r.fb_id));
                const ph = _normPhone(r.phone);
                if (ph) phones.add(ph);
            }
            state.fbIds = fbIds;
            state.phones = phones;
            if (rows.length >= COMMENTER_LIMIT)
                console.warn(
                    '[LS-FILTER] chạm cap ' + COMMENTER_LIMIT + ' comment — có thể thiếu KH cũ.'
                );
        } catch (e) {
            console.warn('[LS-FILTER] load commenters fail:', e.message);
        } finally {
            state.loading = false;
        }
    }

    async function selectCampaign(campaignId) {
        state.selectedId = campaignId || '';
        _persist();
        await _loadCommenters(state.selectedId);
        _renderBar();
        // Re-render conversation list để áp filter mới ngay.
        global.PancakeConversationList?.renderConversationList?.();
    }

    function _renderBar() {
        const bar = document.getElementById('pkLivestreamBar');
        if (!bar) return;
        const esc = global.SharedUtils?.escapeHtml || ((s) => String(s == null ? '' : s));
        const opts = ['<option value="">— Chọn chiến dịch livestream —</option>']
            .concat(
                state.campaigns.map(
                    (c) =>
                        `<option value="${esc(c.id)}" ${String(c.id) === String(state.selectedId) ? 'selected' : ''}>${esc(c.name)}${c.comment_count ? ` (${Number(c.comment_count).toLocaleString('vi-VN')})` : ''}</option>`
                )
            )
            .join('');
        const count = state.loading
            ? '<span class="pk-ls-count loading">đang tải…</span>'
            : state.selectedId
              ? `<span class="pk-ls-count">${state.fbIds.size.toLocaleString('vi-VN')} khách</span>`
              : '';
        bar.innerHTML = `
            <i data-lucide="radio" class="pk-ls-icon"></i>
            <select id="pkLsCampaignSelect" class="pk-ls-select" title="Chọn chiến dịch livestream để lọc tab Livestream">${opts}</select>
            ${count}
            <button id="pkLsRefresh" class="pk-ls-refresh" title="Tải lại danh sách khách comment"><i data-lucide="refresh-cw"></i></button>`;
        const sel = bar.querySelector('#pkLsCampaignSelect');
        if (sel) sel.onchange = (e) => selectCampaign(e.target.value);
        const rf = bar.querySelector('#pkLsRefresh');
        if (rf)
            rf.onclick = async () => {
                await _loadCampaigns();
                if (state.selectedId) await selectCampaign(state.selectedId);
            };
        if (global.lucide?.createIcons) {
            try {
                global.lucide.createIcons();
            } catch {}
        }
    }

    // SSE: live đang chạy → comment mới đổ vào DB → refetch commenter set (debounce).
    let _sseTimer = null;
    function _wireSse() {
        if (!global.Web2SSE?.subscribe) return;
        try {
            global.Web2SSE.subscribe('web2:live-comments', () => {
                if (!state.selectedId) return;
                if (_sseTimer) clearTimeout(_sseTimer);
                _sseTimer = setTimeout(async () => {
                    await _loadCommenters(state.selectedId);
                    _renderBar();
                    global.PancakeConversationList?.renderConversationList?.();
                }, 4000);
            });
        } catch {}
    }

    let _initted = false;
    async function init() {
        // Luôn re-render bar vào DOM hiện tại (shell có thể re-render → bar mới rỗng),
        // nhưng chỉ load data + wire SSE 1 lần.
        _renderBar();
        if (_initted) return;
        _initted = true;
        await _loadCampaigns();
        if (state.selectedId) {
            // chiến dịch còn tồn tại?
            if (state.campaigns.some((c) => String(c.id) === String(state.selectedId))) {
                await _loadCommenters(state.selectedId);
                _renderBar();
                global.PancakeConversationList?.renderConversationList?.();
            } else {
                state.selectedId = '';
                _persist();
                _renderBar();
            }
        }
        _wireSse();
    }

    global.PancakeLivestreamFilter = {
        init,
        isLivestreamConv,
        selectCampaign,
        hasCampaign: () => !!state.selectedId,
        commenterCount: () => state.fbIds.size,
        _state: state,
    };
})(typeof window !== 'undefined' ? window : globalThis);
