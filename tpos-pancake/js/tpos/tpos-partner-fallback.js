// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — fallback enrich tpos-pancake.
// =====================================================================
// TposPartnerFallback — khi `chatomni/info` (TposApi.getPartnerInfo) miss
// (user chưa có Partner trong CRM team, hoặc trả 400), thử lookup theo
// PHONE qua TPOS OData /Partner/ODataService.GetViewV2. Merge kết quả vào
// state.partnerCache để renderCommentItem có thông tin (tên/sđt/địa
// chỉ/trạng thái) — đặc biệt cho user vừa nhập SĐT từ inline phone input.
// =====================================================================

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    const PENDING_DEBOUNCE = 600;
    let pendingPhones = new Set();
    let flushTimer = null;
    let scanScheduled = false;

    function normPhone(p) {
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    function gatherPhonesFromState() {
        const state = window.TposState;
        if (!state || !state.partnerCache || !Array.isArray(state.comments)) return [];
        const phonesByUser = new Map(); // userId -> phone (best guess)

        // From partnerCache: collect users WITH partner data but no phone (no-op for fallback)
        // Fallback target: users WITHOUT partnerCache entry AT ALL, but who have a phone
        // saved in <input id="phone-XXX"> after user typed it
        for (const c of state.comments) {
            const userId = c.from?.id;
            if (!userId) continue;
            // Skip if already have partner data
            const cached = state.partnerCache.get(userId);
            if (cached && (cached.Phone || cached.Mobile)) continue;
            // Try DOM input
            const input = document.getElementById('phone-' + userId);
            const phone = normPhone(input?.value || '');
            if (phone && phone.length >= 9) phonesByUser.set(userId, phone);
        }
        return Array.from(new Set(phonesByUser.values()));
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, PENDING_DEBOUNCE);
    }

    async function flush() {
        flushTimer = null;
        const Api = window.PartnerCustomerApi;
        const state = window.TposState;
        if (!Api?.listByPhones || !state) return;
        const phones = Array.from(pendingPhones);
        pendingPhones.clear();
        if (!phones.length) return;
        try {
            const map = await Api.listByPhones(phones, { chunkSize: 30 });
            if (!map.size) return;
            // Merge into partnerCache by FB user id we have.
            // Match partner→user via phone (since partnerCache key is FB user id).
            const phoneToUser = new Map();
            for (const c of state.comments) {
                const userId = c.from?.id;
                if (!userId) continue;
                const input = document.getElementById('phone-' + userId);
                const p = normPhone(input?.value || '');
                if (p) phoneToUser.set(p, userId);
            }
            let merged = 0;
            for (const [phone, partner] of map.entries()) {
                const userId = phoneToUser.get(phone);
                if (!userId) continue;
                if (state.partnerCache.get(userId)) continue;
                state.partnerCache.set(userId, partner);
                merged++;
            }
            if (merged && window.TposCommentList?.renderComments) {
                window.TposCommentList.renderComments();
            }
        } catch (e) {
            console.warn('[TposPartnerFallback] flush fail:', e.message);
        }
    }

    function scan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            const phones = gatherPhonesFromState();
            if (!phones.length) return;
            for (const p of phones) pendingPhones.add(p);
            scheduleFlush();
        });
    }

    function init() {
        if (!window.PartnerCustomerApi?.listByPhones) {
            console.warn('[TposPartnerFallback] PartnerCustomerApi chưa load — skip');
            return;
        }
        if (!window.TposState) {
            // Retry sau khi state ready
            setTimeout(init, 500);
            return;
        }
        // Mỗi lần render danh sách comment lại → scan để bắt phone mới input
        const orig = window.TposCommentList?.renderComments;
        if (orig && !window.TposCommentList.__fallbackWrapped) {
            window.TposCommentList.renderComments = function () {
                const result = orig.apply(this, arguments);
                scan();
                return result;
            };
            window.TposCommentList.__fallbackWrapped = true;
        }
        // Trigger 1 lần khi load
        scan();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.TposPartnerFallback = { scan, flush };
})();
