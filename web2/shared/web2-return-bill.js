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

    async function fetchQueued(phone) {
        const ph = _normPhone(phone);
        if (!ph) return { returns: [], items: [] };
        try {
            const r = await fetch(
                `${WORKER_URL}/api/web2-returns/queued-by-phone/${encodeURIComponent(ph)}`,
                { cache: 'no-cache' }
            );
            const d = await r.json();
            if (!r.ok || d.success === false) return { returns: [], items: [] };
            return { returns: d.returns || [], items: d.items || [] };
        } catch {
            return { returns: [], items: [] };
        }
    }

    // Trả null nếu không có / user từ chối. Ngược lại {returnLines, returnCodes}.
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
        const msg = `Khách có ${items.length} SP THU VỀ đang chờ:\n\n${summary}\n\nThêm vào bill với giá 0đ?`;
        const ok = await window.Popup.confirm(msg, {
            title: 'Sản phẩm thu về',
            okText: 'Thêm 0đ vào bill',
            cancelText: 'Bỏ qua',
        });
        if (!ok) return null;
        return { returnLines: lines, returnCodes: codes };
    }

    window.NativeReturnBill = { fetchQueued, collect };
})();
