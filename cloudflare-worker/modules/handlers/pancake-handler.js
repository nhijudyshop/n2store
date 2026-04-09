// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Pancake Handler
 * Handles Pancake API related endpoints
 *
 * @module cloudflare-worker/modules/handlers/pancake-handler
 */

import { fetchWithRetry } from '../utils/fetch-utils.js';
import { errorResponse, proxyResponseWithCors, CORS_HEADERS } from '../utils/cors-utils.js';
import { buildPancakeHeaders } from '../utils/header-learner.js';

/**
 * Handle /api/pancake-direct/*
 * Pancake Direct API with custom Referer and JWT cookie
 * Used for 24h policy bypass
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeDirect(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-direct\//, '');
    const pageId = url.searchParams.get('page_id');
    const jwtToken = url.searchParams.get('jwt');

    // Remove custom params from forwarding
    const forwardParams = new URLSearchParams(url.search);
    forwardParams.delete('page_id');
    forwardParams.delete('jwt');
    const forwardSearch = forwardParams.toString() ? `?${forwardParams.toString()}` : '';

    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${forwardSearch}`;

    console.log('[PANCAKE-DIRECT] Target URL:', targetUrl);
    console.log('[PANCAKE-DIRECT] Page ID:', pageId);

    // Determine Referer based on pageId
    let refererUrl = 'https://pancake.vn/multi_pages';
    if (pageId === '117267091364524') {
        refererUrl = 'https://pancake.vn/NhiJudyHouse.VietNam';
    } else if (pageId === '270136663390370') {
        refererUrl = 'https://pancake.vn/NhiJudyStore';
    } else if (pageId === '112678138086607') {
        refererUrl = 'https://pancake.vn/NhiJudyOi';
    }

    console.log('[PANCAKE-DIRECT] Referer:', refererUrl);

    // Build headers
    const headers = buildPancakeHeaders(refererUrl, jwtToken);

    // Set Content-Type from original request
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[PANCAKE-DIRECT] Response status:', response.status);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE-DIRECT] Error:', error.message);
        return errorResponse('Pancake direct API failed: ' + error.message, 500);
    }
}

/**
 * Handle /api/pancake-official/*
 * Pancake Official API (pages.fm Public API)
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeOfficial(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-official\//, '');
    const targetUrl = `https://pages.fm/api/public_api/v1/${apiPath}${url.search}`;

    console.log('[PANCAKE-OFFICIAL] Target URL:', targetUrl);

    // Build headers for pages.fm
    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
    headers.set('Origin', 'https://pages.fm');
    headers.set('Referer', 'https://pages.fm/');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[PANCAKE-OFFICIAL] Response status:', response.status);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE-OFFICIAL] Error:', error.message);
        return errorResponse('Pancake Official API failed: ' + error.message, 500);
    }
}

/**
 * Handle /api/pancake-official-v2/*
 * Pancake Official API v2 (pages.fm Public API v2)
 * Used for conversations listing with page_access_token
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeOfficialV2(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake-official-v2\//, '');
    const targetUrl = `https://pages.fm/api/public_api/v2/${apiPath}${url.search}`;

    console.log('[PANCAKE-OFFICIAL-V2] Target URL:', targetUrl);

    // Edge cache (Cache API) for conversations listing — TTL 60s.
    // Key includes page_access_token in URL → tự động invalidate khi token đổi.
    // Chỉ cache GET request cho endpoint pages/{id}/conversations.
    const isConvList = request.method === 'GET' && /^pages\/[^/]+\/conversations$/.test(apiPath);
    const cache = caches.default;
    const cacheKey = new Request(`https://cache.pancake-proxy${url.pathname}${url.search}`, { method: 'GET' });
    if (isConvList) {
        const cached = await cache.match(cacheKey);
        if (cached) {
            console.log('[PANCAKE-OFFICIAL-V2] Cache HIT:', apiPath);
            const headers = new Headers(cached.headers);
            headers.set('X-Cache', 'HIT');
            for (const [k, v] of Object.entries(CORS_HEADERS)) headers.set(k, v);
            return new Response(cached.body, { status: cached.status, headers });
        }
    }

    // Build headers for pages.fm (same as v1)
    const headers = new Headers();
    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'en-US,en;q=0.9,vi;q=0.8');
    headers.set('Origin', 'https://pages.fm');
    headers.set('Referer', 'https://pages.fm/');
    headers.set('User-Agent', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36');
    headers.set('sec-ch-ua', '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"');
    headers.set('sec-ch-ua-mobile', '?0');
    headers.set('sec-ch-ua-platform', '"macOS"');
    headers.set('sec-fetch-dest', 'empty');
    headers.set('sec-fetch-mode', 'cors');
    headers.set('sec-fetch-site', 'same-origin');

    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        console.log('[PANCAKE-OFFICIAL-V2] Response status:', response.status);

        // Cache successful conversation list responses (60s edge TTL)
        if (isConvList && response.ok) {
            try {
                const cloned = response.clone();
                const buf = await cloned.arrayBuffer();
                // Peek body để tránh cache response chứa error_code
                let shouldCache = true;
                try {
                    const text = new TextDecoder().decode(buf);
                    const json = JSON.parse(text);
                    if (json && json.error_code) shouldCache = false;
                } catch (_) {}
                if (shouldCache) {
                    const cacheHeaders = new Headers(response.headers);
                    cacheHeaders.set('Cache-Control', 'public, max-age=60');
                    cacheHeaders.set('X-Cache', 'MISS');
                    const toCache = new Response(buf, { status: response.status, headers: cacheHeaders });
                    // Async write to cache (non-blocking)
                    cache.put(cacheKey, toCache.clone()).catch(e => console.warn('[PANCAKE-OFFICIAL-V2] cache.put failed:', e.message));
                    const respHeaders = new Headers(cacheHeaders);
                    for (const [k, v] of Object.entries(CORS_HEADERS)) respHeaders.set(k, v);
                    return new Response(buf, { status: response.status, headers: respHeaders });
                }
            } catch (e) {
                console.warn('[PANCAKE-OFFICIAL-V2] Cache wrap failed:', e.message);
            }
        }

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE-OFFICIAL-V2] Error:', error.message);
        return errorResponse('Pancake Official API v2 failed: ' + error.message, 500);
    }
}

/**
 * Handle /api/pancake/*
 * Generic Pancake API proxy
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handlePancakeGeneric(request, url, pathname) {
    const apiPath = pathname.replace(/^\/api\/pancake\//, '');
    const targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;

    console.log('[PANCAKE] Target URL:', targetUrl);

    // Build headers
    const headers = new Headers();
    const contentType = request.headers.get('Content-Type');
    if (contentType) {
        headers.set('Content-Type', contentType);
    }

    headers.set('Accept', 'application/json, text/plain, */*');
    headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
    headers.set('Origin', 'https://pancake.vn');
    headers.set('Referer', 'https://pancake.vn/multi_pages');
    headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36');

    // Also set JWT cookie from access_token for endpoints that support cookie auth
    const accessToken = url.searchParams.get('access_token');
    if (accessToken) {
        headers.set('Cookie', `jwt=${accessToken}; locale=vi`);
    }

    try {
        const response = await fetchWithRetry(targetUrl, {
            method: request.method,
            headers: headers,
            body: request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null,
        }, 3, 1000, 15000);

        return proxyResponseWithCors(response);

    } catch (error) {
        console.error('[PANCAKE] Error:', error.message);
        return errorResponse('Pancake API failed: ' + error.message, 500);
    }
}

/**
 * Handle /ws/pancake WebSocket proxy
 * Proxies WebSocket connections to wss://pancake.vn/socket/websocket
 * Sets correct Origin/Host headers to bypass origin checks
 * @param {Request} request
 * @param {URL} url
 * @returns {Promise<Response>}
 */
export async function handlePancakeWebSocket(request, url) {
    // Build target URL with query params (vsn=2.0.0, access_token, etc.)
    const targetUrl = new URL('https://pancake.vn/socket/websocket');
    for (const [key, value] of url.searchParams) {
        targetUrl.searchParams.set(key, value);
    }

    console.log('[PANCAKE-WS] Proxying WebSocket to:', targetUrl.toString());

    // Forward request headers but override Origin/Host
    const headers = new Headers(request.headers);
    headers.set('Host', 'pancake.vn');
    headers.set('Origin', 'https://pancake.vn');

    // Cloudflare Workers transparently proxy WebSocket when upstream returns 101
    return fetch(targetUrl.toString(), {
        method: request.method,
        headers: headers,
    });
}
