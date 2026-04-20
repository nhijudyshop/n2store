// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Cloudflare Worker - Multi-API Proxy
 * Main entry point - Clean router
 *
 * Refactored from 1743 lines to modular structure
 * All handlers are in /modules/handlers/
 */

// CORS utilities
import { corsPreflightResponse, errorResponse } from './modules/utils/cors-utils.js';

// Route matching
import { matchRoute } from './modules/config/routes.js';

// Handlers
import { handleTokenRequest } from './modules/handlers/token-handler.js';
import { handleImageProxy, handleFacebookAvatar, handlePancakeAvatar, handleImgbbUpload } from './modules/handlers/image-proxy-handler.js';
import { handleFacebookSend, handleFacebookLiveVideos, handleFacebookGraph } from './modules/handlers/facebook-handler.js';
import { handlePancakeDirect, handlePancakeOfficial, handlePancakeOfficialV2, handlePancakeGeneric, handlePancakeWebSocket } from './modules/handlers/pancake-handler.js';
import {
    handleTposExportProductV2,
    handleTposExportStandardPrice,
    handleTposExportSaleOnline,
    handleTposExportSaleOnlineDetail,
    handleTposOrderLines,
    handleTposOrderLinesByRef,
    handleTposRest,
    handleTposGeneric
} from './modules/handlers/tpos-handler.js';
import {
    handleGenericProxy,
    handleSepayProxy,
    handleUploadProxy,
    handleRealtimeProxy,
    handleChatProxy,
    handleCustomersProxy,
    handleCustomer360Proxy
} from './modules/handlers/proxy-handler.js';
import { handleDeepSeek, handleDeepSeekOcr } from './modules/handlers/ai-handler.js';
import { handleSepayDashboard } from './modules/handlers/sepay-dashboard-handler.js';
import { handleAutofbBalance, handleAutofbServices, handleAutofbApiBalance, handleAutofbOrder, handleAutofbOrderStatus, handleAutofbCancel, handleAutofbPayment } from './modules/handlers/autofb-handler.js';

/**
 * Main fetch handler
 */
export default {
    async fetch(request, env, ctx) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return corsPreflightResponse();
        }

        try {
            // Parse request URL
            const url = new URL(request.url);
            const pathname = url.pathname;

            // WebSocket upgrade - proxy before route matching
            if (request.headers.get('Upgrade') === 'websocket') {
                if (pathname === '/ws/pancake' || pathname.startsWith('/ws/pancake')) {
                    return handlePancakeWebSocket(request, url);
                }
                return errorResponse('Unknown WebSocket route', 404);
            }

            // Match route
            const route = matchRoute(pathname);

            // Route to appropriate handler
            switch (route) {
                // Token
                case 'TOKEN':
                    return handleTokenRequest(request);

                // Image proxies
                case 'IMAGE_PROXY':
                    return handleImageProxy(request, url);
                case 'FB_AVATAR':
                    return handleFacebookAvatar(request, url);
                case 'PANCAKE_AVATAR':
                    return handlePancakeAvatar(request, url);
                case 'IMGBB_UPLOAD':
                    return handleImgbbUpload(request);

                // Facebook
                case 'FACEBOOK_SEND':
                    return handleFacebookSend(request, url);
                case 'FACEBOOK_GRAPH':
                    return handleFacebookGraph(request, url);
                case 'FACEBOOK_LIVE':
                    return handleFacebookLiveVideos(request, url);

                // Pancake
                case 'PANCAKE_DIRECT':
                    return handlePancakeDirect(request, url, pathname);
                case 'PANCAKE_OFFICIAL_V2':
                    return handlePancakeOfficialV2(request, url, pathname);
                case 'PANCAKE_OFFICIAL':
                    return handlePancakeOfficial(request, url, pathname);
                case 'PANCAKE':
                    return handlePancakeGeneric(request, url, pathname);

                // TPOS
                case 'TPOS_EXPORT_V2':
                    return handleTposExportProductV2(request, url);
                case 'TPOS_EXPORT_STANDARD':
                    return handleTposExportStandardPrice(request, url);
                case 'TPOS_EXPORT_SALEONLINE':
                    return handleTposExportSaleOnline(request, url);
                case 'TPOS_EXPORT_SALEONLINE_DETAIL':
                    return handleTposExportSaleOnlineDetail(request, url);
                case 'TPOS_ORDER_LINES':
                    return handleTposOrderLines(request, pathname);
                case 'TPOS_ORDER_REF_LINES':
                    return handleTposOrderLinesByRef(request, pathname);
                case 'TPOS_REST':
                    return handleTposRest(request, url, pathname);

                // AI
                case 'DEEPSEEK':
                    return handleDeepSeek(request, url);
                case 'DEEPSEEK_OCR':
                    return handleDeepSeekOcr(request, url);

                // SePay Dashboard (direct login + scrape)
                case 'SEPAY_DASHBOARD':
                    return handleSepayDashboard(request, url);

                // AutoFB
                case 'AUTOFB_BALANCE':
                    return handleAutofbBalance(request, url);
                case 'AUTOFB_SERVICES':
                    return handleAutofbServices(request, url);
                case 'AUTOFB_API_BALANCE':
                    return handleAutofbApiBalance(request, url);
                case 'AUTOFB_ORDER':
                    return handleAutofbOrder(request, url);
                case 'AUTOFB_ORDER_STATUS':
                    return handleAutofbOrderStatus(request, url);
                case 'AUTOFB_CANCEL':
                    return handleAutofbCancel(request, url);
                case 'AUTOFB_PAYMENT':
                    return handleAutofbPayment(request, url);

                // Proxy
                case 'GENERIC_PROXY':
                    return handleGenericProxy(request, url);
                case 'UPLOAD':
                    return handleUploadProxy(request, url, pathname);
                case 'SEPAY':
                    return handleSepayProxy(request, url, pathname);
                case 'INVOICE_STATUS':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'INVOICE_MAPPING':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'SOCIAL_ORDERS':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'ORDER_NOTES':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'ADMIN_FIREBASE':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'ADMIN_RENDER':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'TPOS_EVENTS':
                    return handleCustomer360Proxy(request, url, pathname);
                case 'REALTIME':
                    return handleRealtimeProxy(request, url, pathname);
                case 'CHAT':
                    return handleChatProxy(request, url, pathname);
                case 'CUSTOMERS':
                    return handleCustomersProxy(request, url, pathname);
                case 'PANCAKE_ACCOUNTS':
                    return handleCustomer360Proxy(request, url, pathname);

                // Customer 360 v2 (unified API)
                case 'CUSTOMERS_V2':
                case 'WALLETS_V2':
                case 'TICKETS_V2':
                case 'BALANCE_HISTORY_V2':
                case 'ANALYTICS_V2':
                case 'WEB_WAREHOUSE_V2':
                    return handleCustomer360Proxy(request, url, pathname);

                // Customer 360 v1 (legacy)
                case 'CUSTOMER_360':
                case 'CUSTOMER':
                case 'WALLET':
                case 'TICKET':
                case 'CUSTOMER_SEARCH':
                case 'TRANSACTIONS':
                case 'BALANCE_HISTORY':
                    return handleCustomer360Proxy(request, url, pathname);

                // TPOS generic (catch-all for /api/*)
                case 'TPOS_GENERIC':
                    return handleTposGeneric(request, url, pathname);

                // Unknown route
                default:
                    return errorResponse('Invalid API route', 404, {
                        message: 'Use /api/* routes',
                        pathname: pathname
                    });
            }

        } catch (error) {
            console.error('[WORKER] Unhandled error:', error);
            return errorResponse(error.message, 500, { stack: error.stack });
        }
    },
};
// Trigger deploy 20260115153551
