/**
 * Shared Universal Modules
 * Works in both Browser and Node.js environments
 *
 * @module shared/universal
 */

// Fetch utilities
export {
    delay,
    fetchWithTimeout,
    fetchWithRetry,
    simpleFetch,
    safeFetch,
    SmartFetchManager,
    createSmartFetch,
} from './fetch-utils.js';

// API endpoints configuration
export {
    API_ENDPOINTS,
    buildTposODataUrl,
    buildPancakeUrl,
    buildFacebookGraphUrl,
    buildWorkerUrl,
} from './api-endpoints.js';

// CORS utilities
export {
    CORS_HEADERS,
    CORS_HEADERS_SIMPLE,
    corsResponse,
    corsPreflightResponse,
    corsErrorResponse,
    corsSuccessResponse,
    addCorsHeaders,
    proxyResponseWithCors,
} from './cors-headers.js';

// Facebook constants
export {
    FACEBOOK_CONFIG,
    isCommentConversation,
    buildGraphUrl,
    buildMessagePayload,
    buildImageAttachment,
    buildAttachmentById,
} from './facebook-constants.js';
