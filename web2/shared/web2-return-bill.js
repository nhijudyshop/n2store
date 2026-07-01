// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// NativeReturnBill — khi tạo PBH ở native-orders, nếu KH có SP "Thu về 1 phần"
// đang chờ (web2_returns bill_status='queued') → hỏi user có thêm vào bill giá
// 0đ không. Trả {returnLines, returnCodes} để đính vào body /from-native-order.
// =====================================================================
(function () {
    'use strict';
    const WORKER_URL =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    function _normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (!p) return '';
        let s = String(p).replace(/\D/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    // Auth header cho reads (on-order/queued-by-phone giờ gated requireWeb2AuthSoft —
    // audit LOW info-leak). Native-orders đã có Web2Auth → gửi x-web2-token.
    function _authHeaders() {
        try {
            if (window.Web2Auth && window.Web2Auth.authHeaders)
                return window.Web2Auth.authHeaders();
            const t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            return t && t.token ? { 'x-web2-token': t.token } : {};
        } catch {
            return {};
        }
    }

    // SP THU VỀ đã lên bill của 1 đơn (để IN vào bill PBH cho shipper thu lại).
    // code = native order code hoặc số PBH. Trả [{productCode,productName,quantity}].
    async function onOrder(code) {
        if (!code) return [];
        try {
            const r = await fetch(
                `${WORKER_URL}/api/web2-returns/on-order/${encodeURIComponent(code)}`,
                { cache: 'no-cache', headers: _authHeaders() }
            );
            const d = await r.json();
            if (!r.ok || d.success === false) return [];
            return d.items || [];
        } catch {
            return [];
        }
    }

    async function fetchQueued(phone) {
        const ph = _normPhone(phone);
        if (!ph) return { returns: [], items: [] };
        try {
            const r = await fetch(
                `${WORKER_URL}/api/web2-returns/queued-by-phone/${encodeURIComponent(ph)}`,
                { cache: 'no-cache', headers: _authHeaders() }
            );
            const d = await r.json();
            if (!r.ok || d.success === false) return { returns: [], items: [] };
            return { returns: d.returns || [], items: d.items || [] };
        } catch {
            return { returns: [], items: [] };
        }
    }

    // Trả null nếu không có / user từ chối. Ngược lại {returnLines, returnCodes, replacementItems}.
    async function collect(phone) {
        const { returns, items } = await fetchQueued(phone);
        if (!items.length) return null;
        const lines = items.map((it) => ({
            productCode: it.productCode,
            productName: it.productName,
            quantity: it.quantity,
        }));
        const codes = [...new Set(returns.map((r) => r.code))];
        const summary = items.map((it) => `• ${it.productCode} ×${it.quantity}`).join('\n');
        // Đổi hàng: gom SP khách ĐỔI LẤY để nhắc staff thêm vào bill (giá thường).
        // Chỉ hiển thị nhắc — SP trả lên 0đ tự động; SP đổi lấy staff tự chọn giá.
        const replacementItems = [];
        for (const r of returns) {
            if (r.isExchange && Array.isArray(r.replacementItems)) {
                for (const rp of r.replacementItems) replacementItems.push(rp);
            }
        }
        const replNote = replacementItems.length
            ? `\n\n🔁 Khách ĐỔI LẤY (thêm vào bill giá thường):\n` +
              replacementItems.map((rp) => `• ${rp.productCode} ×${rp.quantity || 1}`).join('\n')
            : '';
        const msg = `Khách có ${items.length} SP THU VỀ đang chờ:\n\n${summary}${replNote}\n\nThêm SP thu về vào bill với giá 0đ?`;
        const ok = await window.Popup.confirm(msg, {
            title: 'Sản phẩm thu về',
            okText: 'Thêm 0đ vào bill',
            cancelText: 'Bỏ qua',
        });
        if (!ok) return null;
        return { returnLines: lines, returnCodes: codes, replacementItems };
    }

    window.NativeReturnBill = { fetchQueued, collect, onOrder };
})();
