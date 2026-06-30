// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — enrich live-chat từ kho khách hàng.
// =====================================================================
// LiveKhoEnricher — LẤP CHỖ TRỐNG SĐT/địa chỉ ở mỗi dòng comment khi Live
// Partner (chatomni/info) không có thông tin liên hệ. Khách mới comment
// thường CHƯA là Partner CRM → row trống. Nhưng khách đó có thể đã có sẵn
// trong KHO KHÁCH HÀNG warehouse Web 2.0 (`web2_customers`).
//
// DUAL-LOOKUP (2026-06-14, parity với comments-mobile.js): match theo CẢ
//   (a) fb_id  → POST /api/web2/customers/batch-by-fbid
//   (b) phone  → POST /api/web2/customers/batch-by-phone
// vì nhiều KH trong kho key theo SĐT (import từ đơn) KHÔNG có fb_id → lookup
// fb_id-only (bản cũ) miss → index.html không hiện địa chỉ dù kho có. Kết quả
// đổ vào state.customerKhoCache[fbId] → renderCommentItem dùng fallback (Live
// trước, kho KH lấp chỗ trống — KHÔNG ghi đè partnerCache).
//
// Layering: gọi API Web 2.0 (không đọc DB trực tiếp) — đúng rule 5b.
// =====================================================================

(function () {
    'use strict';

    if (typeof window === 'undefined') return;

    const PENDING_DEBOUNCE = 600;
    const BATCH_CAP = 200; // cap fb_ids/phones per request — tránh payload lớn
    let pendingFb = new Set(); // fb_ids chờ flush
    let pendingPhone = new Set(); // phones (normalized) chờ flush
    let attemptedFb = new Set(); // fb_ids đã hỏi kho (kể cả miss)
    let attemptedPhone = new Set(); // phones đã hỏi kho
    let flushTimer = null;
    let scanScheduled = false;

    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    // SĐT của 1 comment: DB (c.phone) → _phones[0] → regex trong message.
    function commentPhone(c) {
        if (c.phone) return normPhone(c.phone);
        const arr = c._phones;
        const ph = Array.isArray(arr) && arr.length ? arr[0] : null;
        if (ph) return normPhone(typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '');
        const m = String(c.message || '')
            .replace(/[.\s()\-_]/g, '')
            .match(/(?:\+?84|0)(\d{9})(?!\d)/);
        return m ? '0' + m[1] : '';
    }

    // Comment cần enrich = chưa có SĐT/địa chỉ từ Live partnerCache & kho cache.
    function needsEnrich(state, c) {
        const fbId = c.from?.id;
        const partner = fbId && state.partnerCache?.get(fbId);
        if (partner && (partner.Phone || partner.Street)) return false;
        const kho = fbId && state.customerKhoCache?.get(fbId);
        if (kho && (kho.phone || kho.address)) return false;
        return true;
    }

    function gather() {
        const state = window.LiveState;
        if (!state || !Array.isArray(state.comments)) return;
        for (const c of state.comments) {
            if (!needsEnrich(state, c)) continue;
            const fbId = c.from?.id;
            if (fbId && !attemptedFb.has(fbId)) pendingFb.add(fbId);
            // SĐT VN = ĐÚNG 10 số bắt đầu '0' — tránh nhầm fb_id / dãy số khác.
            const phone = commentPhone(c);
            if (/^0\d{9}$/.test(phone) && !attemptedPhone.has(phone)) pendingPhone.add(phone);
        }
    }

    function scheduleFlush() {
        if (flushTimer) return;
        flushTimer = setTimeout(flush, PENDING_DEBOUNCE);
    }

    async function postBatch(url, body) {
        try {
            // ENFORCE (2026-06-26): /api/web2/customers/batch-* gated requireWeb2AuthSoft
            // → cần x-web2-token (fallback path khi LiveCustomerSync chưa load).
            const headers = window.Web2Auth?.authHeaders
                ? window.Web2Auth.authHeaders({ 'Content-Type': 'application/json' })
                : (() => {
                      const h = { 'Content-Type': 'application/json' };
                      try {
                          const t = JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token;
                          if (t) h['x-web2-token'] = t;
                      } catch {
                          /* ignore */
                      }
                      return h;
                  })();
            const resp = await fetch(url, {
                method: 'POST',
                headers,
                body: JSON.stringify(body),
            });
            const json = await resp.json();
            return json && json.success ? json.data || {} : {};
        } catch (e) {
            console.warn('[LiveKhoEnricher] batch fail:', e.message);
            return {};
        }
    }

    async function flush() {
        flushTimer = null;
        const state = window.LiveState;
        if (!state) return;

        const fbIds = Array.from(pendingFb).slice(0, BATCH_CAP);
        pendingFb = new Set(Array.from(pendingFb).slice(BATCH_CAP));
        const phones = Array.from(pendingPhone).slice(0, BATCH_CAP);
        pendingPhone = new Set(Array.from(pendingPhone).slice(BATCH_CAP));
        if (!fbIds.length && !phones.length) return;

        // Đánh dấu đã hỏi NGAY (kể cả request fail) → không loop vô hạn.
        for (const id of fbIds) attemptedFb.add(id);
        for (const p of phones) attemptedPhone.add(p);

        const workerUrl = state.workerUrl;
        let byFb = {};
        let byPhone = {};
        if (window.LiveCustomerSync) {
            // NGUỒN CHUNG (shared) — cùng engine enrich với mobile.
            const res = await window.LiveCustomerSync.enrich({ workerUrl, fbIds, phones });
            byFb = res.byFbId || {};
            byPhone = res.byPhone || {};
        } else {
            // Fallback (module chưa load): fetch trực tiếp.
            const jobs = [];
            if (fbIds.length)
                jobs.push(postBatch(`${workerUrl}/api/web2/customers/batch-by-fbid`, { fbIds }));
            else jobs.push(Promise.resolve({}));
            if (phones.length)
                jobs.push(postBatch(`${workerUrl}/api/web2/customers/batch-by-phone`, { phones }));
            else jobs.push(Promise.resolve({}));
            const [fb, byPhoneRaw] = await Promise.all(jobs);
            byFb = fb;
            for (const k of Object.keys(byPhoneRaw)) byPhone[normPhone(k)] = byPhoneRaw[k];
        }

        let merged = 0;
        const setKho = (fbId, rec) => {
            if (!fbId || !rec) return;
            const phone = normPhone(rec.phone || rec.Phone);
            const address = rec.address || rec.Address || '';
            if (!phone && !address) return;
            // Không ghi đè nếu đã có cache đầy đủ.
            const ex = state.customerKhoCache.get(fbId);
            if (ex && ex.phone && ex.address) return;
            state.customerKhoCache.set(fbId, {
                phone,
                address,
                name: rec.name || rec.Name || (ex && ex.name) || '',
                status: rec.status || rec.Status || (ex && ex.status) || '',
            });
            merged++;
        };

        // (a) fb_id hits → set trực tiếp theo fbId.
        for (const fbId of Object.keys(byFb)) setKho(fbId, byFb[fbId]);

        // (b) phone hits → áp cho MỌI comment có SĐT khớp (key theo fbId của comment đó).
        if (Object.keys(byPhone).length) {
            for (const c of state.comments) {
                const fbId = c.from?.id;
                if (!fbId) continue;
                const existing = state.customerKhoCache.get(fbId);
                if (existing && existing.phone && existing.address) continue;
                const rec = byPhone[commentPhone(c)];
                if (rec) setKho(fbId, rec);
            }
        }

        if (merged && window.LiveCommentList?.renderComments) {
            window.LiveCommentList.renderComments();
        }

        if (pendingFb.size || pendingPhone.size) scheduleFlush();
    }

    function scan() {
        if (scanScheduled) return;
        scanScheduled = true;
        requestAnimationFrame(() => {
            scanScheduled = false;
            gather();
            if (pendingFb.size || pendingPhone.size) scheduleFlush();
        });
    }

    // Clear khi đổi campaign/page (KH cũ không còn bị coi "đã hỏi" cho list mới).
    function reset() {
        pendingFb = new Set();
        pendingPhone = new Set();
        attemptedFb = new Set();
        attemptedPhone = new Set();
        if (flushTimer) {
            clearTimeout(flushTimer);
            flushTimer = null;
        }
    }

    function init() {
        if (!window.LiveState || !window.LiveCommentList) {
            setTimeout(init, 500);
            return;
        }
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

    window.LiveKhoEnricher = { scan, flush, reset, clearAttempted: reset };
})();
