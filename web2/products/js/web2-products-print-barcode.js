// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2ProductsPrint — BARCODE/QR module.
 * [SPLIT 2026-06-18] Tách từ web2-products-print.js. Module này: JsBarcode + QR
 *   lib loaders (lazy CDN), genQrDataUrl (davidshimjs fallback), mark-printed API.
 *   Cross-module qua window.W2PP (load SAU utils).
 */
(function () {
    'use strict';

    const W2PP = (window.W2PP = window.W2PP || {});

    // JsBarcode CDN — Code 128 generator (chuẩn ISO/IEC 15417 identical WEB2 visual).
    // Lazy load lần đầu mở print modal. Inline trong iframe print thay vì script
    // src CDN để tránh load latency lúc print (đã được pre-loaded trên parent page).
    const JSBARCODE_URL = 'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js';
    let jsBarcodeLoadPromise = null;
    function loadJsBarcode() {
        if (window.JsBarcode) return Promise.resolve();
        if (jsBarcodeLoadPromise) return jsBarcodeLoadPromise;
        jsBarcodeLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = JSBARCODE_URL;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('JsBarcode load failed'));
            document.head.appendChild(s);
        });
        return jsBarcodeLoadPromise;
    }

    // QR generator (davidshimjs/qrcodejs) — render QR ra canvas. Pre-render dataURL
    // trên parent (KHÔNG cần CDN trong cửa sổ in → robust cho in nhiệt timing).
    const QR_URL = 'https://cdn.jsdelivr.net/gh/davidshimjs/qrcodejs@master/qrcode.min.js';
    let qrLoadPromise = null;
    function loadQrLib() {
        if (window.QRCode && window.QRCode.CorrectLevel) return Promise.resolve();
        if (qrLoadPromise) return qrLoadPromise;
        qrLoadPromise = new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = QR_URL;
            s.onload = () => resolve();
            s.onerror = () => reject(new Error('QR lib load failed'));
            document.head.appendChild(s);
        });
        return qrLoadPromise;
    }
    // Tạo dataURL PNG của QR cho 1 mã (canvas, correctLevel H).
    // 2026-06-09: EC = H (30% phục hồi) vì biến thể overlay GIỮA QR + mã SP
    // overlay GÓC PHẢI DƯỚI → cần dung sai cao để vẫn quét được.
    function genQrDataUrl(code) {
        try {
            const tmp = document.createElement('div');
            // eslint-disable-next-line no-new
            new window.QRCode(tmp, {
                text: String(code),
                width: 320,
                height: 320,
                correctLevel: window.QRCode.CorrectLevel.H,
            });
            const c = tmp.querySelector('canvas');
            if (c) return c.toDataURL('image/png');
            const im = tmp.querySelector('img');
            return im ? im.src : '';
        } catch (e) {
            console.warn('[w2p-print] QR gen fail', code, e.message);
            return '';
        }
    }

    // ---------- Label HTML generator — exact WEB2 mirror ----------
    // [2026-06-05] Ghi số lần in tem (print_count) cho SP → tránh in tem trùng.
    // 1 lần in = +1 cho mỗi mã SP (unique), không tính theo số tem. Lỗi → bỏ qua.
    function _markProductsPrinted(items) {
        try {
            const codes = [...new Set((items || []).map((it) => it.code).filter(Boolean))];
            if (!codes.length) return;
            const base =
                (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
                'https://chatomni-proxy.nhijudyshop.workers.dev';
            fetch(base + '/api/web2-products/mark-printed', {
                method: 'POST',
                headers: W2PP._w2Auth({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ codes }),
            }).catch(() => {});
        } catch (e) {
            /* noop */
        }
    }

    // Export ra namespace shared.
    W2PP.JSBARCODE_URL = JSBARCODE_URL;
    W2PP.loadJsBarcode = loadJsBarcode;
    W2PP.QR_URL = QR_URL;
    W2PP.loadQrLib = loadQrLib;
    W2PP.genQrDataUrl = genQrDataUrl;
    W2PP._markProductsPrinted = _markProductsPrinted;
})();
