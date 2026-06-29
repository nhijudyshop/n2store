// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared.
// =====================================================================
// Web2ProductUnits — CLIENT DUY NHẤT cho /api/web2-product-units/* (mã đơn vị per-unit).
// Gom boilerplate base-URL + token + fetch (ensure / reprint / by-product / resolve /
// events / attachForPrint) vốn bị FORK ở 4 nơi (so-order-barcode, web2-products-render,
// unit-scan, web2-unit-reprint). KHÔNG cache/SSE — chỉ là fetch wrapper mỏng.
// LƯU Ý: mint THẬT theo SL kho = hook web2-products `_syncUnits` (server). Ở client chỉ
// /ensure (top-up nếu thiếu) + đọc + in-lại. Đặc tả: docs/web2/KB-PRODUCT-CODE-UNITS.md.
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ProductUnits) return;

    function base() {
        return (
            global.API_CONFIG?.WORKER_URL ||
            global.WEB2_CONFIG?.WORKER_URL ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function token() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.token || '';
        } catch (_) {
            return '';
        }
    }
    function userName() {
        try {
            return JSON.parse(localStorage.getItem('web2_auth') || 'null')?.username || '';
        } catch (_) {
            return '';
        }
    }
    function headers(extra) {
        const t = token();
        return {
            'Content-Type': 'application/json',
            ...(t ? { 'x-web2-token': t } : {}),
            ...(extra || {}),
        };
    }
    const URL_ = () => base() + '/api/web2-product-units';

    // GET /resolve?u=<id> | ?code=<unitCode> → { unit, product, orders, clearance, metrics }
    async function resolve(target) {
        const q =
            target.id != null
                ? 'u=' + encodeURIComponent(target.id)
                : 'code=' + encodeURIComponent(target.code);
        const r = await fetch(URL_() + '/resolve?' + q, { headers: headers() });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
        return data;
    }

    // GET /:id/events → events[]
    async function events(unitId) {
        const r = await fetch(URL_() + '/' + unitId + '/events', { headers: headers() });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
        return data.events || [];
    }

    // GET /by-product/:code → units[] (mọi unit của 1 SP, kèm status/orderStt)
    async function byProduct(code) {
        const r = await fetch(URL_() + '/by-product/' + encodeURIComponent(code), {
            headers: headers(),
        });
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error || 'HTTP ' + r.status);
        return data.units || [];
    }

    // POST /ensure {productCodes} → { byCode } (top-up units = SL kho, server đọc stock+pending)
    async function ensure(productCodes) {
        const codes = Array.isArray(productCodes) ? productCodes : [productCodes];
        const list = [...new Set(codes.map((c) => String(c || '').trim()).filter(Boolean))];
        if (!list.length) return {};
        const r = await fetch(URL_() + '/ensure', {
            method: 'POST',
            headers: headers(),
            body: JSON.stringify({ productCodes: list }),
        });
        if (!r.ok) throw new Error('ensure HTTP ' + r.status);
        return (await r.json()).byCode || {};
    }

    // POST /reprint {unitIds, userName?} → print_count++ (best-effort, KHÔNG throw)
    async function reprint(unitIds, opts = {}) {
        const ids = (Array.isArray(unitIds) ? unitIds : [unitIds]).filter((x) => x != null);
        if (!ids.length) return;
        const body = { unitIds: ids, userName: opts.userName != null ? opts.userName : userName() };
        try {
            await fetch(URL_() + '/reprint', {
                method: 'POST',
                headers: headers(),
                body: JSON.stringify(body),
            });
        } catch (_) {
            /* print_count không tăng cũng không chặn in */
        }
    }

    // Gắn .units (+ .quantity) cho products[] (in-place, clone caller truyền) qua /ensure
    // theo SL kho. opts.qrBase (mặc định location.origin) → qrUrl = qrBase+'/web2/unit-scan/?u='+id.
    // opts.perItemQty(p) → SL muốn in cho product p (mặc định = tất cả units của SP).
    // opts.bumpReprint !== false → fire-and-forget print_count++. Lỗi /ensure → để nguyên (in mã SP lặp).
    async function attachForPrint(products, opts = {}) {
        const list = (products || []).filter((p) => p && p.code);
        if (!list.length) return products;
        const qrPrefix = (opts.qrBase || location.origin) + '/web2/unit-scan/?u=';
        let byCode;
        try {
            byCode = await ensure(list.map((p) => p.code));
        } catch (e) {
            return products; // fallback: không units → in mã SP lặp (hành vi cũ)
        }
        const minted = [];
        for (const p of list) {
            const units = byCode[p.code] || [];
            if (!units.length) continue;
            const want = opts.perItemQty
                ? Math.max(1, Number(opts.perItemQty(p)) || units.length)
                : units.length;
            const slice = units.slice(0, want);
            p.units = slice.map((u) => ({ unitCode: u.unitCode, qrUrl: qrPrefix + u.id }));
            p.quantity = slice.length;
            slice.forEach((u) => minted.push(u.id));
        }
        if (opts.bumpReprint !== false && minted.length) reprint(minted);
        return products;
    }

    global.Web2ProductUnits = {
        resolve,
        events,
        byProduct,
        ensure,
        reprint,
        attachForPrint,
        _base: base,
        _token: token,
        _userName: userName,
        _headers: headers,
    };
})(typeof window !== 'undefined' ? window : this);
