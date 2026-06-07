// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — enrich live-chat từ kho khách hàng.
// =====================================================================
// LiveKhoEnricher — LẤP CHỖ TRỐNG SĐT/địa chỉ ở mỗi dòng comment khi Live
// Partner (chatomni/info) không có thông tin liên hệ. Khách mới comment
// thường CHƯA là Partner CRM → row trống. Nhưng khách đó có thể đã có sẵn
// trong KHO KHÁCH HÀNG (Web 1.0 Render DB `customers`) — match theo fb_id
// (comment luôn có fb_id). Batch lookup qua POST /api/v2/customers/batch
// {fb_ids:[...]} → fill state.customerKhoCache → renderCommentItem dùng làm
// fallback (Live trước, kho KH lấp chỗ trống — KHÔNG ghi đè partnerCache).
//
// Lưu ý layering: gọi API Web 1.0 (không đọc DB trực tiếp) — đúng pattern
// rule 5b; trang này đã gọi /api/v2/customers/* sẵn (showPancakeCustomerInfo).
// =====================================================================

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    const PENDING_DEBOUNCE = 600;
    const BATCH_CAP = 200; // cap fb_ids/request — tránh payload lớn khi list dài
    let pending = new Set(); // fb_ids chờ flush
    let attempted = new Set(); // fb_ids đã hỏi kho (kể cả miss) — không hỏi lại
    let flushTimer = null;
    let scanScheduled = false;

    function normPhone(p) {
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    // Thu fb_ids cần enrich: có trong comment, CHƯA có Phone từ Live partnerCache,
    // CHƯA hỏi kho lần nào.
    function gatherFbIds() {
        const state = window.LiveState;
        if (!state || !Array.isArray(state.comments)) return [];
        const ids = new Set();
        for (const c of state.comments) {
            const fbId = c.from?.id;
            if (!fbId || attempted.has(fbId)) continue;
            const partner = state.partnerCache?.get(fbId);
            if (partner && partner.Phone) continue; // Live đã có SĐT → bỏ qua
            ids.add(fbId);
        }
        return Array.from(ids);
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, PENDING_DEBOUNCE);
    }

    async function flush() {
        flushTimer = null;
        const state = window.LiveState;
        if (!state) return;
        const fbIds = Array.from(pending).slice(0, BATCH_CAP);
        pending = new Set(Array.from(pending).slice(BATCH_CAP)); // giữ phần dư cho lần sau
        if (!fbIds.length) return;

        // Đánh dấu đã hỏi NGAY (kể cả request fail) để không loop vô hạn.
        for (const id of fbIds) attempted.add(id);

        const workerUrl = state.workerUrl;
        try {
            // 2026-06-07: đọc kho KH warehouse Web 2.0 (Live + Web1.0 customers đã gỡ).
            const resp = await fetch(`${workerUrl}/api/web2/customers/batch-by-fbid`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fbIds: fbIds }),
            });
            const json = await resp.json();
            const map = json && json.success ? json.data || {} : {};
            let merged = 0;
            for (const fbId of Object.keys(map)) {
                const c = map[fbId] || {};
                const phone = normPhone(c.phone);
                const address = c.address || '';
                if (!phone && !address) continue;
                state.customerKhoCache.set(fbId, {
                    phone,
                    address,
                    name: c.name || '',
                    status: c.status || '',
                });
                merged++;
            }
            if (merged && window.LiveCommentList?.renderComments) {
                window.LiveCommentList.renderComments();
            }
        } catch (e) {
            console.warn('[LiveKhoEnricher] flush fail:', e.message);
        }

        // Còn phần dư (list rất dài) → flush tiếp.
        if (pending.size) scheduleFlush();
    }

    function scan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            const fbIds = gatherFbIds();
            if (!fbIds.length) return;
            for (const id of fbIds) pending.add(id);
            scheduleFlush();
        });
    }

    function init() {
        if (!window.LiveState || !window.LiveCommentList) {
            setTimeout(init, 500);
            return;
        }
        // Mỗi lần render danh sách comment → scan để bắt user mới (realtime/load thêm).
        const orig = window.LiveCommentList.renderComments;
        if (orig && !window.LiveCommentList.__khoEnricherWrapped) {
            window.LiveCommentList.renderComments = function () {
                const result = orig.apply(this, arguments);
                scan();
                return result;
            };
            window.LiveCommentList.__khoEnricherWrapped = true;
        }
        scan();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    window.LiveKhoEnricher = { scan, flush };
})();
