// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — shim PartnerCustomerApi → Web2CustomerStore.
// =====================================================================
// Web2CustomerLookup / PartnerCustomerApi — SHIM tương thích ngược.
//
// Toàn bộ logic (fetch kho KH, validate SĐT 10 số, status text/class, carrier,
// money fmt) đã gom về NGUỒN DUY NHẤT `web2/shared/web2-customer-store.js`
// (window.Web2CustomerStore). File này chỉ giữ global cũ
// `window.PartnerCustomerApi` + `window.Web2CustomerLookup` để balance-history /
// customer-wallet / web2-partner-enricher không phải đổi code.
//
// ⚠ web2-customer-store.js PHẢI load TRƯỚC file này.
// =====================================================================

(function () {
    'use strict';
    if (typeof window === 'undefined') return;

    var S = window.Web2CustomerStore;
    if (!S) {
        console.warn(
            '[Web2CustomerLookup] Web2CustomerStore chưa load — load web2-customer-store.js TRƯỚC web2-customer-lookup.js'
        );
        // Shim an toàn (no-op) để consumer không vỡ; thực tế store luôn có mặt.
        S = {
            listByPhones: async function () {
                return new Map();
            },
            list: async function () {
                return { value: [], count: 0 };
            },
            STATUS_TEXT: {},
            STATUS_VALUES: [],
            statusText: function () {
                return '';
            },
            statusClass: function () {
                return '';
            },
            detectCarrier: function () {
                return '';
            },
            formatCurrency: function (v) {
                return String(v || 0);
            },
        };
    }

    var Api = {
        list: function (opts) {
            return S.list(opts);
        },
        listByPhones: function (phones) {
            return S.listByPhones(phones);
        },
        STATUS_TEXT: S.STATUS_TEXT,
        STATUS_VALUES: S.STATUS_VALUES,
        statusText: S.statusText,
        statusClass: S.statusClass,
        detectCarrier: S.detectCarrier,
        formatCurrency: S.formatCurrency,
    };

    window.PartnerCustomerApi = Api;
    window.Web2CustomerLookup = Api;
})();
