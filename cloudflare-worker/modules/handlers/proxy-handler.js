// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Proxy Handler
 * Handles generic proxy endpoints
 *
 * @module cloudflare-worker/modules/handlers/proxy-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { errorResponse, proxyResponseWithCors, CORS_HEADERS } from '../utils/cors-utils.js';

/**
 * Handle /api/proxy
 * Generic proxy endpoint
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handleGenericProxy(request, url) {
    const targetUrl = url.searchParams.get('url');

    if (!targetUrl) {
        return errorResponse('Missing url parameter', 400, {
            usage: '/api/proxy?url=<encoded_url>'
        });
    }

    console.log('[PROXY] Fetching:', targetUrl);

    try {
        // Read body first
        const requestBody = request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : null;

        // Build fetch options
        const fetchOptions = {
            method: request.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'application/json, text/plain, */*',
            },
            body: requestBody,
        };

        // Preserve Content-Type from original request
        const originalContentType = request.headers.get('Content-Type');
        if (originalContentType && requestBody) {
            fetchOptions.headers['Content-Type'] = originalContentType;
        }

        // Custom headers from query param
        const customHeadersStr = url.searchParams.get('headers');
        if (customHeadersStr) {
            try {
                const customHeaders = JSON.parse(customHeadersStr);
                Object.assign(fetchOptions.headers, customHeaders);
            } catch (e) {
                console.error('[PROXY] Failed to parse custom headers:', e);
            }
        }

        console.log('[PROXY] Request method:', request.method);

        const proxyResponse = await fetchWithRetry(targetUrl, fetchOptions, 3, 1000, 15000);

        console.log('[PROXY] Response status:', proxyResponse.status);

        return proxyResponseWithCors(proxyResponse);

    } catch (error) {
        console.error('[PROXY] Error:', error.message);
        return errorResponse('Failed to proxy request: ' + error.message, 500);
    }
}

/**
 * Handle /api/sepay/*
 * SePay webhook proxy
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleSepayProxy(request, url, pathname) {
    const sepayPath = pathname.replace(/^\/api\/sepay\//, '');
    const targetUrl = `https://n2store-fallback.onrender.com/api/sepay/${sepayPath}${url.search}`;

    console.log('[SEPAY-PROXY] ========================================');
    console.log('[SEPAY-PROXY] Forwarding to:', targetUrl);
    console.log('[SEPAY-PROXY] Method:', request.method);

    // Build headers
    const sepayHeaders = new Headers();
    sepayHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    sepayHeaders.set('Accept', 'application/json');
    sepayHeaders.set('User-Agent', 'Cloudflare-Worker-SePay-Proxy/1.0');

    // Forward Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        sepayHeaders.set('Authorization', authHeader);
        console.log('[SEPAY-PROXY] Authorization header forwarded');
    }

    try {
        let requestBody = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            requestBody = await request.arrayBuffer();
            console.log('[SEPAY-PROXY] Request body size:', requestBody.byteLength, 'bytes');
        }

        const sepayResponse = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: sepayHeaders,
            body: requestBody,
        }, 3, 1000, 15000);

        console.log('[SEPAY-PROXY] Response status:', sepayResponse.status);
        console.log('[SEPAY-PROXY] ========================================');

        return proxyResponseWithCors(sepayResponse);

    } catch (error) {
        console.error('[SEPAY-PROXY] Error:', error.message);
        return errorResponse('SePay proxy failed: ' + error.message, 502, { target: targetUrl });
    }
}

/**
 * Handle /api/upload/*
 * Upload proxy to render.com
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleUploadProxy(request, url, pathname) {
    const uploadPath = pathname.replace(/^\/api\/upload\//, '');
    const targetUrl = `https://n2store-fallback.onrender.com/api/upload/${uploadPath}${url.search}`;

    console.log('[UPLOAD-PROXY] ========================================');
    console.log('[UPLOAD-PROXY] Forwarding to:', targetUrl);
    console.log('[UPLOAD-PROXY] Method:', request.method);

    // Build headers
    const uploadHeaders = new Headers();
    uploadHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    uploadHeaders.set('Accept', 'application/json');
    uploadHeaders.set('User-Agent', 'Cloudflare-Worker-Upload-Proxy/1.0');

    // Forward Authorization header
    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        uploadHeaders.set('Authorization', authHeader);
    }

    try {
        let requestBody = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            requestBody = await request.arrayBuffer();
            console.log('[UPLOAD-PROXY] Request body size:', requestBody.byteLength, 'bytes');
        }

        const uploadResponse = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: uploadHeaders,
            body: requestBody,
        }, 3, 1000, 30000); // 30s timeout for uploads

        console.log('[UPLOAD-PROXY] Response status:', uploadResponse.status);
        console.log('[UPLOAD-PROXY] ========================================');

        return proxyResponseWithCors(uploadResponse);

    } catch (error) {
        console.error('[UPLOAD-PROXY] Error:', error.message);
        return errorResponse('Upload proxy failed: ' + error.message, 502, { target: targetUrl });
    }
}

/**
 * Handle /api/realtime/*
 * Realtime server proxy → n2store-fallback (pending-customers, SSE streams, processing-tags,
 * mark-replied, etc. all live on the fallback server).
 * Preserves SSE streaming by skipping retry/timeout when the client asks for text/event-stream.
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleRealtimeProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'REALTIME-PROXY');
}

/**
 * Handle /api/oncall/*
 * On-call / phone widget endpoints → n2store-fallback
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleOncallProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'ONCALL-PROXY');
}

/**
 * Handle /api/users/*
 * User settings endpoints (menu_layout, preferences) → n2store-fallback
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleUsersProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'USERS-PROXY');
}

/**
 * Handle /api/campaigns/*
 * Campaign / employee-range endpoints → n2store-fallback
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleCampaignsProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'CAMPAIGNS-PROXY');
}

/**
 * Handle /facebook/*
 * Render server's Facebook endpoints (crm-teams, live-campaigns, comments, comments/stream SSE,
 * comment-orders). Used by tpos-pancake chat + anything embedding the Facebook live-comment stream.
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleFacebookRenderProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'FACEBOOK-RENDER-PROXY');
}

/**
 * Handle /api/v2/* (catch-all Render fallback).
 * Every /api/v2/* path in this codebase is served by Render; this route prevents the TPOS_GENERIC
 * catch-all from incorrectly forwarding to tomato.tpos.vn (which doesn't own /api/v2/*).
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleRenderV2FallbackProxy(request, url, pathname) {
    return handleRenderFallbackProxy(request, url, pathname, 'RENDER-V2-FALLBACK');
}

/**
 * Generic forwarder to n2store-fallback.onrender.com preserving full pathname and query.
 * - SSE (text/event-stream) uses plain fetch to preserve long-lived streaming.
 * - Everything else uses fetchWithRetry so transient 5xx during Render redeploys are absorbed.
 * - CORS headers are always injected on the response so the browser never trips on 502/5xx.
 *
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @param {string} tag - Log tag
 * @returns {Promise<Response>}
 */
async function handleRenderFallbackProxy(request, url, pathname, tag) {
    const targetUrl = `https://n2store-fallback.onrender.com${pathname}${url.search}`;

    const acceptHeader = request.headers.get('Accept') || '';
    const isSSE = acceptHeader.includes('text/event-stream') || pathname.endsWith('/sse');

    console.log(`[${tag}] Forwarding to:`, targetUrl, isSSE ? '(SSE stream)' : '');

    try {
        const forwardHeaders = new Headers(request.headers);
        // Strip hop-by-hop / host headers that would confuse the upstream
        forwardHeaders.delete('host');
        forwardHeaders.delete('cf-connecting-ip');
        forwardHeaders.delete('cf-ray');

        const body = request.method !== 'GET' && request.method !== 'HEAD'
            ? await request.arrayBuffer()
            : null;

        let response;
        if (isSSE) {
            // SSE: plain fetch, no timeout/retry — we need the stream to stay open
            response = await fetch(targetUrl, {
                method: request.method,
                headers: forwardHeaders,
                body,
            });
        } else {
            response = await fetchWithRetry(targetUrl, {
                method: request.method,
                headers: forwardHeaders,
                body,
            }, 3, 1000, 15000);
        }

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error(`[${tag}] Error:`, error.message);
        // CRITICAL: return JSON with CORS headers so browser-side code sees a consistent
        // error shape even when Render is fully down. This is the whole point of routing
        // through Cloudflare — 502s with no CORS headers are what broke the app earlier.
        return errorResponse(`${tag} failed: ${error.message}`, 502, { target: targetUrl });
    }
}

/**
 * Handle /api/chat/*
 * Chat server proxy
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleChatProxy(request, url, pathname) {
    const chatPath = pathname.replace(/^\/api\/chat\//, '');
    const targetUrl = `https://n2store-fallback.onrender.com/api/chat/${chatPath}${url.search}`;

    console.log('[CHAT-PROXY] Forwarding to:', targetUrl);

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: new Headers(request.headers),
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[CHAT-PROXY] Error:', error.message);
        return errorResponse('Chat proxy failed: ' + error.message, 502);
    }
}

/**
 * Handle /api/customers/*
 * Customers API proxy
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleCustomersProxy(request, url, pathname) {
    const customersPath = pathname.replace(/^\/api\/customers\/?/, '');
    const targetUrl = `https://n2store-fallback.onrender.com/api/customers/${customersPath}${url.search}`;

    console.log('[CUSTOMERS-PROXY] Forwarding to:', targetUrl);

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: new Headers(request.headers),
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[CUSTOMERS-PROXY] Error:', error.message);
        return errorResponse('Customers proxy failed: ' + error.message, 502);
    }
}

/**
 * Handle Customer 360 API routes
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleCustomer360Proxy(request, url, pathname) {
    let apiPath;
    if (pathname.startsWith('/api/customer360/')) {
        apiPath = pathname.replace(/^\/api\/customer360\//, '');
    } else {
        apiPath = pathname.replace(/^\/api\//, '');
    }

    const targetUrl = `https://n2store-fallback.onrender.com/api/${apiPath}${url.search}`;

    console.log('[CUSTOMER360] Proxying to:', targetUrl);

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: new Headers(request.headers),
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[CUSTOMER360] Error:', error.message);
        return errorResponse('Customer 360 proxy failed: ' + error.message, 502);
    }
}
