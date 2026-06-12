// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
/**
 * SSE topic registry — single source of truth cho tên topic.
 * Dùng kèm Web2SSE.subscribe(Web2SSETopics.PRODUCTS, cb).
 */
(function (global) {
    'use strict';
    if (global.Web2SSETopics) return;
    global.Web2SSETopics = Object.freeze({
        PRODUCTS: 'web2:products',
        VARIANTS: 'web2:variants',
        PRODUCT_CATEGORY: 'web2:productcategory',
        NATIVE_ORDERS: 'web2:native-orders',
        FAST_SALE_ORDERS: 'web2:fast-sale-orders',
        RECONCILE: 'web2:reconcile',
        PURCHASE_REFUND: 'web2:purchase-refund',
        // Wildcard mọi ví KH Web 2.0 (server notifyClientsWildcard('web2:wallet')
        // match key 'web2:wallet:*'). Giá trị cũ 'wallet:all' là topic Web 1.0
        // chết — không server Web 2.0 nào publish.
        WALLET_ALL: 'web2:wallet:*',
        CUSTOMER_WALLET: 'web2:customer-wallet',
        SUPPLIER_WALLET: 'web2:supplier-wallet',
        USERS: 'web2:users',
        NOTIFICATIONS: 'web2:notifications',
        KPI_DASHBOARD: 'web2:kpi-dashboard',
        // SUPPLIER_RATING: bỏ 2026-06-12 — dead topic (registry có, 0 publisher).
    });
})(typeof window !== 'undefined' ? window : globalThis);
