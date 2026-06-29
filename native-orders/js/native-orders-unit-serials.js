// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// Native Orders — hiển thị MÃ ĐƠN VỊ "-xxx" (đã auto-gán theo giỏ) sau mã SP trong
// bảng "Sản phẩm trong đơn". Fetch serials theo (đơn, SP) từ
// /api/web2-product-units/by-orders → cache NO._unitSerials → re-render. Cập nhật
// sau mỗi NO.load() + SSE web2:product-units (unit gán/nhả). Quét tem -xxx ra STT
// đơn này → mã trong đơn khớp tem (auto gán). Load SAU render.js + api.js + sse-bridge.

(function () {
    'use strict';
    const NO = (window.NativeOrders = window.NativeOrders || {});

    // { [orderId]: { [productCode]: ['001','002'] } } — serials đơn vị đã gán cho đơn.
    NO._unitSerials = NO._unitSerials || {};
    let _busy = false;
    let _deb = null;

    NO._loadUnitSerials = async function _loadUnitSerials() {
        const orders = (NO.STATE && NO.STATE.orders) || [];
        // ⚠ o.id có thể là STRING ("262") từ API → Number.isInteger(string)=false làm
        // ids RỖNG → serials KHÔNG bao giờ fetch → expand thiếu "-xxx" (bug 2026-06-29).
        // Ép Number() (khớp endpoint /by-orders cũng .map(Number)).
        const ids = orders.map((o) => Number(o.id)).filter(Number.isInteger);
        if (!ids.length || _busy) return;
        _busy = true;
        try {
            const r = await fetch(`${NO.WORKER_URL}/api/web2-product-units/by-orders`, {
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    ...(window.Web2Auth?.authHeaders ? window.Web2Auth.authHeaders() : {}),
                },
                body: JSON.stringify({ orderIds: ids }),
            });
            const j = await r.json().catch(() => ({}));
            if (j && j.success) {
                NO._unitSerials = j.byOrder || {};
                if (NO.renderRows) NO.renderRows(); // re-render → expand-code hiện -xxx
            }
        } catch (_) {
            /* best-effort — không có serials thì hiện mã SP như cũ */
        } finally {
            _busy = false;
        }
    };

    function _schedule() {
        clearTimeout(_deb);
        _deb = setTimeout(() => NO._loadUnitSerials(), 400);
    }

    // Wrap NO.load → fetch serials sau mỗi load (initial + reload). Idempotent.
    if (typeof NO.load === 'function' && !NO.load._unitWrapped) {
        const _orig = NO.load;
        NO.load = function (...a) {
            const ret = _orig.apply(this, a);
            Promise.resolve(ret)
                .then(() => _schedule())
                .catch(() => {});
            return ret;
        };
        NO.load._unitWrapped = true;
    }

    // SSE: unit đổi (auto-gán khi thêm SP / nhả khi gỡ-giỏ-huỷ) → refresh serials
    // (KHÔNG cần reload cả đơn — chỉ cập nhật -xxx).
    if (window.Web2SSE && window.Web2SSE.subscribe) {
        window.Web2SSE.subscribe('web2:product-units', _schedule);
    }

    // Lần đầu (nếu orders đã load trước khi module này chạy).
    _schedule();
})();
