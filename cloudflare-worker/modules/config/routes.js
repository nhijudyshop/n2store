// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Route Configuration
 * Maps URL patterns to handlers
 *
 * @module cloudflare-worker/modules/config/routes
 */

/**
 * Route definitions
 * Each route has: pattern, handler, method (optional)
 */
export const ROUTES = {
    // Token
    TOKEN: { pattern: '/api/token', method: 'POST' },

    // Image proxies
    IMAGE_PROXY: { pattern: '/api/image-proxy', method: 'GET' },
    FB_AVATAR: { pattern: '/api/fb-avatar', method: 'GET' },
    PANCAKE_AVATAR: { pattern: '/api/pancake-avatar', method: 'GET' },
    IMGBB_UPLOAD: { pattern: '/api/imgbb-upload', method: 'POST' },

    // Upload (proxy to render.com)
    UPLOAD: { pattern: '/api/upload/*' },

    // Facebook
    FACEBOOK_SEND: { pattern: '/api/facebook-send', method: 'POST' },
    FACEBOOK_LIVE: { pattern: '/api/facebook-graph/livevideo', method: 'GET' },

    // Pancake
    PANCAKE_DIRECT: { pattern: '/api/pancake-direct/*' },
    PANCAKE_OFFICIAL_V2: { pattern: '/api/pancake-official-v2/*' },
    PANCAKE_OFFICIAL: { pattern: '/api/pancake-official/*' },
    PANCAKE: { pattern: '/api/pancake/*' },

    // TPOS
    TPOS_EXPORT_V2: { pattern: '/api/Product/ExportProductV2', method: 'POST' },
    TPOS_EXPORT_STANDARD: { pattern: '/api/Product/ExportFileWithStandardPriceV2', method: 'POST' },
    TPOS_EXPORT_SALEONLINE: { pattern: '/api/SaleOnline_Order/ExportFile', method: 'POST' },
    TPOS_EXPORT_SALEONLINE_DETAIL: { pattern: '/api/SaleOnline_Order/ExportFileDetail', method: 'POST' },
    TPOS_ORDER_LINES: { pattern: '/tpos/order/:id/lines', method: 'GET' },
    TPOS_ORDER_REF_LINES: { pattern: '/tpos/order-ref/:ref/lines', method: 'GET' },
    TPOS_REST: { pattern: '/api/rest/*' },
    TPOS_EVENTS: { pattern: '/api/tpos-events/*', method: 'POST' },

    // AI
    DEEPSEEK: { pattern: '/api/deepseek', method: 'POST' },
    DEEPSEEK_OCR: { pattern: '/api/deepseek-ocr', method: 'POST' },

    // SePay
    SEPAY_DASHBOARD: { pattern: '/api/sepay-dashboard', method: 'POST' },

    // AutoFB
    AUTOFB_BALANCE: { pattern: '/api/autofb-balance', method: 'POST' },
    AUTOFB_SERVICES: { pattern: '/api/autofb-services', method: 'GET' },
    AUTOFB_API_BALANCE: { pattern: '/api/autofb-api-balance', method: 'GET' },
    AUTOFB_ORDER: { pattern: '/api/autofb-order', method: 'POST' },
    AUTOFB_ORDER_STATUS: { pattern: '/api/autofb-order-status', method: 'POST' },
    AUTOFB_CANCEL: { pattern: '/api/autofb-cancel', method: 'POST' },
    AUTOFB_PAYMENT: { pattern: '/api/autofb-payment', method: 'POST' },

    // Proxy
    GENERIC_PROXY: { pattern: '/api/proxy' },
    SEPAY: { pattern: '/api/sepay/*' },
    REALTIME: { pattern: '/api/realtime/*' },
    CHAT: { pattern: '/api/chat/*' },
    CUSTOMERS: { pattern: '/api/customers/*' },
    PANCAKE_ACCOUNTS: { pattern: '/api/pancake-accounts/*' },

    // Invoice Status (PostgreSQL - replaces Firestore)
    INVOICE_STATUS: { pattern: '/api/invoice-status/*' },

    // Invoice NJD Mapping (PostgreSQL - reliable NJD↔Order mapping)
    INVOICE_MAPPING: { pattern: '/api/invoice-mapping/*' },

    // Social Orders (PostgreSQL - replaces Firestore for don-inbox)
    SOCIAL_ORDERS: { pattern: '/api/social-orders/*' },

    // Admin Firebase (Firestore browser) & Render services
    ADMIN_FIREBASE: { pattern: '/api/admin/firebase/*' },
    ADMIN_RENDER: { pattern: '/api/admin/render/*' },

    // Customer 360 v2 (NEW - unified API)
    CUSTOMERS_V2: { pattern: '/api/v2/customers/*' },
    WALLETS_V2: { pattern: '/api/v2/wallets/*' },
    TICKETS_V2: { pattern: '/api/v2/tickets/*' },
    BALANCE_HISTORY_V2: { pattern: '/api/v2/balance-history/*' },
    ANALYTICS_V2: { pattern: '/api/v2/analytics/*' },
    WEB_WAREHOUSE_V2: { pattern: '/api/v2/web-warehouse/*' },

    // Customer 360 v1 (legacy)
    CUSTOMER_360: { pattern: '/api/customer360/*' },
    CUSTOMER: { pattern: '/api/customer/*' },
    WALLET: { pattern: '/api/wallet/*' },
    TICKET: { pattern: '/api/ticket*' },
    CUSTOMER_SEARCH: { pattern: '/api/customer-search*' },
    TRANSACTIONS: { pattern: '/api/transactions/*' },
    BALANCE_HISTORY: { pattern: '/api/balance-history/*' },
};

/**
 * Match a pathname against route patterns
 * @param {string} pathname - URL pathname
 * @returns {string|null} Route key or null
 */
export function matchRoute(pathname) {
    // Exact matches first
    if (pathname === '/api/token') return 'TOKEN';
    if (pathname === '/api/image-proxy') return 'IMAGE_PROXY';
    if (pathname === '/api/fb-avatar') return 'FB_AVATAR';
    if (pathname === '/api/pancake-avatar') return 'PANCAKE_AVATAR';
    if (pathname === '/api/imgbb-upload') return 'IMGBB_UPLOAD';
    if (pathname === '/api/facebook-send') return 'FACEBOOK_SEND';
    if (pathname === '/api/facebook-graph/livevideo') return 'FACEBOOK_LIVE';
    if (pathname === '/api/facebook-graph') return 'FACEBOOK_GRAPH';
    if (pathname === '/api/deepseek') return 'DEEPSEEK';
    if (pathname === '/api/deepseek-ocr') return 'DEEPSEEK_OCR';
    if (pathname === '/api/Product/ExportProductV2') return 'TPOS_EXPORT_V2';
    if (pathname === '/api/Product/ExportFileWithStandardPriceV2') return 'TPOS_EXPORT_STANDARD';
    if (pathname === '/api/SaleOnline_Order/ExportFile') return 'TPOS_EXPORT_SALEONLINE';
    if (pathname === '/api/SaleOnline_Order/ExportFileDetail') return 'TPOS_EXPORT_SALEONLINE_DETAIL';
    if (pathname === '/api/sepay-dashboard') return 'SEPAY_DASHBOARD';
    if (pathname === '/api/autofb-balance') return 'AUTOFB_BALANCE';
    if (pathname === '/api/autofb-services') return 'AUTOFB_SERVICES';
    if (pathname === '/api/autofb-api-balance') return 'AUTOFB_API_BALANCE';
    if (pathname === '/api/autofb-order') return 'AUTOFB_ORDER';
    if (pathname === '/api/autofb-order-status') return 'AUTOFB_ORDER_STATUS';
    if (pathname === '/api/autofb-cancel') return 'AUTOFB_CANCEL';
    if (pathname === '/api/autofb-payment') return 'AUTOFB_PAYMENT';
    if (pathname === '/api/proxy') return 'GENERIC_PROXY';

    // Pattern matches
    if (pathname.startsWith('/api/upload/')) return 'UPLOAD';
    if (pathname.startsWith('/api/pancake-direct/')) return 'PANCAKE_DIRECT';
    if (pathname.startsWith('/api/pancake-official-v2/')) return 'PANCAKE_OFFICIAL_V2';
    if (pathname.startsWith('/api/pancake-official/')) return 'PANCAKE_OFFICIAL';
    if (pathname.startsWith('/api/pancake/')) return 'PANCAKE';

    if (pathname.startsWith('/api/rest/')) return 'TPOS_REST';
    if (pathname.startsWith('/api/tpos-events/')) return 'TPOS_EVENTS';

    if (pathname.startsWith('/api/admin/firebase/')) return 'ADMIN_FIREBASE';
    if (pathname.startsWith('/api/admin/render/')) return 'ADMIN_RENDER';
    if (pathname.startsWith('/api/invoice-mapping/')) return 'INVOICE_MAPPING';
    if (pathname.startsWith('/api/invoice-status/')) return 'INVOICE_STATUS';
    if (pathname.startsWith('/api/social-orders/')) return 'SOCIAL_ORDERS';
    if (pathname.startsWith('/api/sepay/')) return 'SEPAY';
    if (pathname.startsWith('/api/realtime/')) return 'REALTIME';
    if (pathname.startsWith('/api/chat/')) return 'CHAT';
    if (pathname.startsWith('/api/customers/') || pathname === '/api/customers') return 'CUSTOMERS';
    if (pathname.startsWith('/api/pancake-accounts/') || pathname === '/api/pancake-accounts') return 'PANCAKE_ACCOUNTS';

    // Customer 360 v2 routes (match FIRST before v1)
    if (pathname.startsWith('/api/v2/customers/') || pathname === '/api/v2/customers') return 'CUSTOMERS_V2';
    if (pathname.startsWith('/api/v2/wallets/') || pathname === '/api/v2/wallets') return 'WALLETS_V2';
    if (pathname.startsWith('/api/v2/wallet/')) return 'WALLETS_V2'; // Singular alias
    if (pathname.startsWith('/api/v2/tickets/') || pathname === '/api/v2/tickets') return 'TICKETS_V2';
    if (pathname.startsWith('/api/v2/balance-history/') || pathname === '/api/v2/balance-history') return 'BALANCE_HISTORY_V2';
    if (pathname.startsWith('/api/v2/pending-withdrawals/') || pathname === '/api/v2/pending-withdrawals') return 'WALLETS_V2';
    if (pathname.startsWith('/api/v2/analytics/') || pathname === '/api/v2/analytics') return 'ANALYTICS_V2';
    if (pathname.startsWith('/api/v2/web-warehouse/') || pathname === '/api/v2/web-warehouse') return 'WEB_WAREHOUSE_V2';
    if (pathname.startsWith('/api/v2/kho-di-cho/') || pathname === '/api/v2/kho-di-cho') return 'WEB_WAREHOUSE_V2'; // backward compat

    // Customer 360 v1 routes (legacy)
    if (pathname.startsWith('/api/customer360/')) return 'CUSTOMER_360';
    if (pathname.startsWith('/api/customer/')) return 'CUSTOMER';
    if (pathname.startsWith('/api/wallet/')) return 'WALLET';
    if (pathname.startsWith('/api/ticket')) return 'TICKET';
    if (pathname.startsWith('/api/customer-search')) return 'CUSTOMER_SEARCH';
    if (pathname.startsWith('/api/transactions/')) return 'TRANSACTIONS';
    if (pathname.startsWith('/api/balance-history/')) return 'BALANCE_HISTORY';

    // TPOS Order patterns
    if (/^\/tpos\/order\/\d+\/lines$/.test(pathname)) return 'TPOS_ORDER_LINES';
    if (/^\/tpos\/order-ref\/.+\/lines$/.test(pathname)) return 'TPOS_ORDER_REF_LINES';

    // Catch-all for /api/* (TPOS generic)
    if (pathname.startsWith('/api/')) return 'TPOS_GENERIC';

    return null;
}
