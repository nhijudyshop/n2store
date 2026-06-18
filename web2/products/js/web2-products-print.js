// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * Web2ProductsPrint — ENTRY (wiring) module.
 * [SPLIT 2026-06-18] File này từng là 1293 dòng → tách thành 5 module nhỏ
 *   (cùng folder, load THEO THỨ TỰ trong index.html):
 *     1. web2-products-print-utils.js    → W2PP base/utils + constants + state
 *     2. web2-products-print-barcode.js  → JsBarcode/QR loaders + mark-printed
 *     3. web2-products-print-render.js    → buildLabelHTML (layout + CSS)
 *     4. web2-products-print-modal.js     → dialog UI + generateAndPrint + overlay
 *     5. web2-products-print.js (file này) → re-export window.Web2ProductsPrint
 *
 *   Mọi cross-module function nằm trên window.W2PP (source-of-truth). Hành vi
 *   runtime KHÔNG đổi so với bản gốc — chỉ relocate verbatim + đổi tham chiếu.
 *
 * Public API (web2-products-app.js phụ thuộc): window.Web2ProductsPrint.open.
 */
(function () {
    'use strict';

    const W2PP = window.W2PP || {};
    const open = W2PP.open;

    // ---------- Public API ----------
    window.Web2ProductsPrint = { open };
})();
