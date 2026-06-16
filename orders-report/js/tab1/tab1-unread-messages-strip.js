// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/* =====================================================
   THANH "KHÁCH CHƯA TRẢ LỜI" (Unread customers strip)
   Vị trí: giữa bộ lọc và bảng (orders-report tab1).

   Nguồn dữ liệu:
   - window.newMessagesNotifier.getPendingCustomers() → danh sách khách đang có
     tin nhắn CHƯA TRẢ LỜI (còn trong list = shop chưa reply). Mỗi item:
     {psid, pageId, customerName, phone, inboxCount, snippet, timestamp(ms)}.
   - window.allData → đơn của CHIẾN DỊCH đang lọc (để giới hạn "trong chiến dịch").
   - window.employeeRanges → khoảng STT chia cho từng nhân viên (chiến dịch hiện tại).

   Phạm vi hiển thị (theo yêu cầu): "tất cả khách trong chiến dịch được lọc hiện
   tại và được chia cho nhân viên đó".
   - Nhân viên thường (có range riêng) → chỉ khách có đơn STT thuộc range của họ.
   - Admin / chủ shop / 'my-authenticated' (xem tất cả) → mọi khách có đơn trong
     chiến dịch, mỗi ô kèm nhãn nhân viên phụ trách để giám sát.

   Tương tác: click ô → mở chat trả lời (showConversationPicker).
   Báo động: khách chờ > 30 phút chưa trả lời → ô đỏ + nhấp nháy (visual only).

   Realtime: nghe CustomEvent 'n2s:pendingCustomersChanged' (notifier phát sau mỗi
   lần reapply) + tick mỗi 30s để cập nhật thời gian chờ và cờ "trễ".
   ===================================================== */

(function () {
    'use strict';

    if (window.__unreadCustomersStripLoaded) return;
    window.__unreadCustomersStripLoaded = true;

    const HOST_ID = 'unreadCustomersStrip';
    const STALE_MIN = 30; // ngưỡng báo động (phút)
    const STALE_MS = STALE_MIN * 60 * 1000;
    const TICK_MS = 30 * 1000; // recompute thời gian chờ + cờ trễ mỗi 30s
    const MAX_CELLS = 50; // số ô tối đa render (urgent nhất trước); dư → "+N nữa"

    let _tickTimer = null;
    let _renderTimer = null;

    /* Render gom burst — reapply() có thể bắn nhiều lần khi virtual-scroll bảng. */
    function scheduleRender() {
        clearTimeout(_renderTimer);
        _renderTimer = setTimeout(render, 250);
    }

    function getHost() {
        return document.getElementById(HOST_ID);
    }

    /* Chuẩn hoá SĐT VN (giống new-messages-notifier._normPhone). */
    function normPhone(raw) {
        if (!raw) return '';
        let d = String(raw).replace(/\D/g, '');
        if (!d) return '';
        if (d.startsWith('84') && d.length >= 10) d = '0' + d.slice(2);
        if (d.length < 8 || d.length > 12) return '';
        return d;
    }

    function escapeHtml(s) {
        return String(s == null ? '' : s).replace(
            /[&<>"']/g,
            (c) =>
                ({
                    '&': '&amp;',
                    '<': '&lt;',
                    '>': '&gt;',
                    '"': '&quot;',
                    "'": '&#39;',
                })[c]
        );
    }

    /* Thời gian chờ gọn cho ô: "vừa xong" / "12'" / "2h" / "2h15'". */
    function fmtWait(ms) {
        if (!ms || ms < 0) return '';
        const m = Math.floor(ms / 60000);
        if (m < 1) return 'vừa xong';
        if (m < 60) return m + "'";
        const h = Math.floor(m / 60);
        const rem = m % 60;
        return rem ? `${h}h${rem}'` : `${h}h`;
    }

    /* Map STT → range nhân viên (window.employeeRanges: {id,name,start,end}[]). */
    function empByStt(stt) {
        const ranges = window.employeeRanges || [];
        if (isNaN(stt) || !ranges.length) return null;
        for (const r of ranges) {
            const start = parseInt(r.start);
            const end = parseInt(r.end);
            if (!isNaN(start) && !isNaN(end) && stt >= start && stt <= end) return r;
        }
        return null;
    }

    /* Xác định phạm vi xem của người đăng nhập. */
    function getScope() {
        const isAdmin = !!(window.authManager && window.authManager.isAdminTemplate
            ? window.authManager.isAdminTemplate()
            : false);
        const auth =
            window.authManager && window.authManager.getAuthState
                ? window.authManager.getAuthState()
                : null;
        const isMyUser = auth && auth.userType === 'my-authenticated';

        let ownRange = null;
        try {
            if (typeof window._findCurrentUserEmployeeRange === 'function') {
                ownRange = window._findCurrentUserEmployeeRange();
            }
        } catch (e) {
            ownRange = null;
        }
        const seeAll = isAdmin || isMyUser || !ownRange;
        return { isAdmin, isMyUser, seeAll, ownRange };
    }

    /* Build map psid/phone → đơn (chiến dịch đang load). Lấy đơn đầu tiên trùng. */
    function buildOrderIndex() {
        const all = window.allData || [];
        const byPsid = new Map();
        const byPhone = new Map();
        for (const o of all) {
            const ps = String(o.Facebook_ASUserId || '');
            if (ps && !byPsid.has(ps)) byPsid.set(ps, o);
            const ph = normPhone(o.Telephone);
            if (ph && !byPhone.has(ph)) byPhone.set(ph, o);
        }
        return { byPsid, byPhone };
    }

    /* Trả về danh sách khách chưa trả lời ĐÃ scope, kèm metadata để render. */
    function compute() {
        const nm = window.newMessagesNotifier;
        if (!nm || typeof nm.getPendingCustomers !== 'function') return [];
        const pending = nm.getPendingCustomers() || [];
        if (!pending.length) return [];

        const { byPsid, byPhone } = buildOrderIndex();
        const scope = getScope();
        const now = Date.now();
        const out = [];

        const checked = window.CheckedCustomers;
        for (const pc of pending) {
            // KH đã đánh dấu "đã kiểm tra/đã bán" cho chiến dịch này → ẩn khỏi thanh
            // (kể cả khi có tin mới).
            if (checked && checked.isChecked && checked.isChecked(pc.psid)) continue;

            // Khớp khách → đơn trong chiến dịch (ưu tiên PSID, fallback SĐT).
            let order = (pc.psid && byPsid.get(String(pc.psid))) || null;
            if (!order) {
                const ph = normPhone(pc.phone);
                if (ph) order = byPhone.get(ph) || null;
            }
            if (!order) continue; // không có đơn trong chiến dịch → ngoài phạm vi

            const stt = parseInt(order.SessionIndex);
            const emp = empByStt(stt);

            // Scope theo nhân viên (nếu không phải xem-tất-cả).
            if (!scope.seeAll && scope.ownRange) {
                const s = parseInt(scope.ownRange.start);
                const e = parseInt(scope.ownRange.end);
                if (isNaN(stt) || stt < s || stt > e) continue;
            }

            const ts = pc.timestamp || 0;
            const waitedMs = ts ? now - ts : 0;
            const pageId =
                String(pc.pageId || '') ||
                (order.Facebook_PostId ? String(order.Facebook_PostId).split('_')[0] : '');

            out.push({
                psid: String(pc.psid || ''),
                pageId,
                orderId: order.Id,
                name: pc.customerName || order.Name || order.PartnerName || 'Khách',
                timestamp: ts,
                waitedMs,
                late: ts > 0 && waitedMs >= STALE_MS,
                count: pc.inboxCount || 0,
                empName: emp && emp.name ? emp.name : '',
                stt,
                showEmp: scope.seeAll, // chỉ hiện nhãn NV khi xem tất cả (admin/chủ)
            });
        }

        // Sắp xếp: trễ trước, rồi khách chờ lâu nhất (timestamp cũ nhất) lên đầu.
        out.sort((a, b) => {
            if (a.late !== b.late) return a.late ? -1 : 1;
            const ta = a.timestamp || Infinity;
            const tb = b.timestamp || Infinity;
            return ta - tb;
        });
        return out;
    }

    function buildCell(c) {
        // Dùng data-* + delegated listener (KHÔNG nhúng JS nội tuyến → tránh mọi rủi ro
        // breakout chuỗi). Click ô → mở chat; click nút check → đánh dấu đã kiểm tra.
        const lateCls = c.late ? ' ucs-cell--late' : '';
        const wait = fmtWait(c.waitedMs);
        const empTag =
            c.showEmp && c.empName ? `<span class="ucs-cell__emp">${escapeHtml(c.empName)}</span>` : '';
        const title =
            `${c.name} · đã chờ ${wait || 'vừa xong'} chưa trả lời` +
            (c.empName ? ` · NV: ${c.empName}` : '') +
            (c.count ? ` · ${c.count} tin` : '');
        return (
            `<div class="ucs-cell${lateCls}" title="${escapeHtml(title)}" ` +
            `data-order-id="${escapeHtml(c.orderId)}" data-page-id="${escapeHtml(c.pageId)}" ` +
            `data-psid="${escapeHtml(c.psid)}">` +
            `<button type="button" class="ucs-cell__check" data-act="check" ` +
            `title="Đã kiểm tra / đã bán — ẩn khỏi thanh" aria-label="Đã kiểm tra / đã bán"></button>` +
            `<span class="ucs-cell__name">${escapeHtml(c.name)}</span>` +
            (wait ? `<span class="ucs-cell__sep">·</span><span class="ucs-cell__time">${wait}</span>` : '') +
            empTag +
            `</div>`
        );
    }

    /* Delegated click trên host: phân biệt nút check vs mở chat (đọc data-*). */
    function onHostClick(e) {
        const cell = e.target.closest('.ucs-cell');
        if (!cell) return;
        const psid = cell.dataset.psid || '';
        const pageId = cell.dataset.pageId || '';
        const orderId = cell.dataset.orderId || '';
        if (e.target.closest('[data-act="check"]')) {
            if (window.CheckedCustomers && window.CheckedCustomers.check) {
                window.CheckedCustomers.check(psid, pageId);
            }
            return;
        }
        if (window.TagXLInline && window.TagXLInline.openFromStrip) {
            window.TagXLInline.openFromStrip(orderId, pageId, psid, e);
        } else if (window.showConversationPicker) {
            window.showConversationPicker(orderId, pageId, psid, e);
        }
    }

    function render() {
        const host = getHost();
        if (!host) return;

        let list;
        try {
            list = compute();
        } catch (e) {
            console.warn('[UnreadStrip] compute failed:', e && e.message);
            list = [];
        }

        if (!list.length) {
            host.innerHTML = '';
            host.classList.remove('has-items');
            return;
        }

        const lateCount = list.filter((c) => c.late).length;
        const headCls = lateCount ? 'ucs-head ucs-head--alarm' : 'ucs-head';
        const header =
            `<span class="${headCls}"><i class="fas fa-comment-dots"></i> Chưa trả lời ` +
            `<b>${list.length}</b>` +
            (lateCount
                ? ` · <span class="ucs-head__late">${lateCount} trễ &gt;${STALE_MIN}'</span>`
                : '') +
            `</span>`;

        const shown = list.slice(0, MAX_CELLS);
        const overflow = list.length - shown.length;
        const overflowChip =
            overflow > 0 ? `<span class="ucs-more">+${overflow} nữa</span>` : '';

        host.innerHTML = header + shown.map(buildCell).join('') + overflowChip;
        host.classList.add('has-items');
    }

    function startTick() {
        if (_tickTimer) return;
        _tickTimer = setInterval(render, TICK_MS);
    }

    function init() {
        const host = getHost();
        if (!host) return;

        // Delegated click (1 listener trên host, sống qua mọi lần render innerHTML).
        host.addEventListener('click', onHostClick);

        // Realtime: notifier phát event này sau mỗi reapply (tin mới / đã trả lời /
        // fetch server). Strip tự đọc lại getPendingCustomers(). Debounce gom burst.
        window.addEventListener('n2s:pendingCustomersChanged', scheduleRender);
        // KH "đã kiểm tra" đổi (tick ở máy này / máy khác qua SSE) → render lại để ẩn/hiện.
        window.addEventListener('n2s:checkedCustomersChanged', scheduleRender);

        // Cập nhật thời gian chờ + cờ "trễ" định kỳ.
        startTick();

        // Render lần đầu sau khi bảng + pending sẵn sàng.
        setTimeout(render, 1500);

        window.UnreadCustomersStrip = { render, compute, STALE_MIN };
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }
})();
