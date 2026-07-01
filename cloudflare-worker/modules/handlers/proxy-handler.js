// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Proxy Handler
 * Handles generic proxy endpoints
 *
 * @module cloudflare-worker/modules/handlers/proxy-handler
 */

import { fetchWithRetry, fetchWithTimeout } from '../utils/fetch-utils.js';
import { errorResponse, proxyResponseWithCors, CORS_HEADERS } from '../utils/cors-utils.js';

// =====================================================
// LOG REDACTION + RETRY/STREAM HELPERS (audit medium/low fixes 2026-06-20)
// =====================================================
// Query params nhạy cảm xuất hiện trong targetUrl (Pancake access_token, /me?token=,
// jwt…). KHÔNG log nguyên văn — strip giá trị trước khi console.log để token không rơi
// vào Worker logs / access logs.
const SENSITIVE_QUERY_PARAMS = ['token', 'jwt', 'access_token', 'admintoken', 'api_key', 'apikey'];

/**
 * Trả về targetUrl đã che các query param nhạy cảm (giá trị → REDACTED) để log an toàn.
 * Không ném lỗi: nếu parse thất bại, fallback về chuỗi gốc đã cắt query.
 * @param {string} targetUrl
 * @returns {string}
 */
export function redactUrlForLog(targetUrl) {
    try {
        const u = new URL(targetUrl);
        let changed = false;
        for (const key of SENSITIVE_QUERY_PARAMS) {
            if (u.searchParams.has(key)) {
                u.searchParams.set(key, 'REDACTED');
                changed = true;
            }
        }
        return changed ? u.toString() : targetUrl;
    } catch (e) {
        // URL không parse được → bỏ phần sau '?' cho chắc, tránh lộ token
        const q = targetUrl.indexOf('?');
        return q === -1 ? targetUrl : targetUrl.slice(0, q) + '?<redacted>';
    }
}

/**
 * HTTP method có an toàn để retry không (idempotent: GET/HEAD/OPTIONS).
 * Non-idempotent (POST/PUT/PATCH/DELETE) chỉ retry khi caller cung cấp idempotency key
 * (đã được whitelist forward) → tránh re-fire mutation trên timeout/5xx/429.
 * @param {string} method
 * @param {Request} request
 * @returns {boolean}
 */
function canRetryMethod(method, request) {
    const m = (method || 'GET').toUpperCase();
    if (m === 'GET' || m === 'HEAD' || m === 'OPTIONS') return true;
    // Cho retry mutation CHỈ khi có idempotency key (upstream tự dedupe)
    return !!(
        request &&
        (request.headers.get('x-idempotency-key') || request.headers.get('idempotency-key'))
    );
}

/**
 * Path có phải streaming/long-poll endpoint không (SSE-ish) → dùng plain fetch, không
 * retry/timeout để giữ stream mở. Bao gồm /sse, /stream, /events, /tpos-events và cờ
 * ?stream=1 cho endpoint stream không kết thúc bằng /sse.
 * @param {string} pathname
 * @param {URL} url
 * @param {string} acceptHeader
 * @returns {boolean}
 */
function isStreamingRequest(pathname, url, acceptHeader) {
    if (acceptHeader && acceptHeader.includes('text/event-stream')) return true;
    if (pathname.endsWith('/sse') || pathname.endsWith('/stream')) return true;
    if (pathname.endsWith('/events') || pathname.endsWith('/tpos-events')) return true;
    if (url && url.searchParams.get('stream') === '1') return true;
    return false;
}

// =====================================================
// WEB 2.0 BACKEND SPLIT (2026-06-14)
// =====================================================
// Backend Web 2.0 đã tách sang service Render riêng `web2-api` (project
// web2.0n2store, chạy cùng codebase render.com với WEB2_ONLY=1). Mọi path Web 2.0
// route sang web2-api; path Web 1.0 vẫn n2store-fallback. Web1⊥Web2.
// Đổi URL khi service đổi (Render gắn suffix ngẫu nhiên vào subdomain).
const FALLBACK_ORIGIN = 'https://n2store-fallback.onrender.com';
const WEB2_API_ORIGIN = 'https://web2-api-kv04.onrender.com';

/**
 * Path có thuộc backend Web 2.0 không (→ route sang web2-api).
 * Chỉ match prefix Web 2.0 rõ ràng; mọi path khác giữ nguyên n2store-fallback.
 * @param {string} p pathname
 * @returns {boolean}
 */
export function isWeb2Path(p) {
    if (p.startsWith('/api/web2')) return true; // /api/web2-*, /api/web2/*
    if (p.startsWith('/api/native-orders')) return true;
    if (p.startsWith('/api/fast-sale-orders')) return true;
    if (p.startsWith('/api/delivery-invoices')) return true; // web2 PGH (web2Db + SSE web2:delivery)
    if (p.startsWith('/api/refunds')) return true; // web2 Trả hàng (web2Db + SSE web2:refunds)
    if (p.startsWith('/api/reconcile')) return true;
    if (p.startsWith('/api/wallet-deposits')) return true;
    if (p.startsWith('/api/purchase-refund')) return true;
    if (p.startsWith('/api/services-overview')) return true;
    if (p.startsWith('/api/pbh-reports')) return true; // web2 báo cáo doanh thu/giao hàng (web2Db; consumer web2/report-*)
    if (p.startsWith('/api/admin/web2-')) return true; // admin Web 2.0 (reset ví/wipe data/import KH → web2Db) — KHÔNG đụng admin Web 1.0 (/api/admin/migration|data|firebase|render)
    if (p.startsWith('/api/livestream')) return true; // /api/livestream(-images)
    if (p.startsWith('/api/realtime/web2')) return true; // web2 SSE hub
    // /api/v2/* — CHỈ các feature Web 2.0 piggy-back (Web 1.0 v2 core giữ fallback)
    if (
        /^\/api\/v2\/(notifications|audit-log|supplier-aging|dashboard-kpi|smart-match|inventory-forecast|supplier-360|cart|kpi|web2-)/.test(
            p
        )
    )
        return true;
    return false;
}

/**
 * Origin Render đích cho 1 pathname: web2-api nếu là path Web 2.0, ngược lại fallback.
 * @param {string} pathname
 * @returns {string}
 */
export function renderOriginFor(pathname) {
    return isWeb2Path(pathname) ? WEB2_API_ORIGIN : FALLBACK_ORIGIN;
}

// =====================================================
// SSRF GUARD cho /api/proxy (open-proxy fix 2026-06-20)
// =====================================================
// `?url=` cho phép caller chọn host đích → phải chặn open-proxy/SSRF.
// Chỉ cho fetch tới các host thực sự cần (TPOS, Pancake/pages.fm, FB/fbcdn,
// Render, workers.dev, GitHub Pages + các API địa chỉ/QR Web 1.0 đang dùng
// qua /api/proxy: 34tinhthanh.com, tienich.vnhub.com, img.vietqr.io).
// Allowlist match exact-host HOẶC subdomain (`.suffix`). Mọi host khác bị 403.
const PROXY_HOST_ALLOWLIST = [
    'tomato.tpos.vn',
    'tpos.vn', // *.tpos.vn
    'pancake.vn', // *.pancake.vn (incl content.pancake.vn)
    'pages.fm', // *.pages.fm
    'graph.facebook.com',
    'fbcdn.net', // *.fbcdn.net
    'onrender.com', // *.onrender.com (n2store-fallback, web2-api)
    'workers.dev', // *.workers.dev
    'nhijudy.store', // *.nhijudy.store
    'nhijudyshop.github.io',
    // API địa chỉ / QR Web 1.0 hiện đang đi qua /api/proxy
    '34tinhthanh.com',
    'tienich.vnhub.com',
    'img.vietqr.io',
];

/**
 * Host có nằm trong allowlist không (exact hoặc subdomain của 1 suffix).
 * @param {string} hostname (đã lowercase)
 * @returns {boolean}
 */
function isHostAllowed(hostname) {
    return PROXY_HOST_ALLOWLIST.some(
        (suffix) => hostname === suffix || hostname.endsWith('.' + suffix)
    );
}

/**
 * Hostname có phải IP riêng tư / loopback / link-local không (chặn SSRF nội bộ).
 * Bao gồm IPv4 literal (127/10/172.16-31/192.168/169.254/0.x), localhost,
 * IPv6 loopback ::1 và unique-local fc00::/7.
 * @param {string} hostname (đã lowercase)
 * @returns {boolean}
 */
function isPrivateHost(hostname) {
    if (hostname === 'localhost' || hostname.endsWith('.localhost')) return true;
    // IPv6 literal trong URL có dạng [::1]; hostname đã được URL parse bỏ ngoặc
    if (hostname === '::1' || hostname === '::') return true;
    if (hostname.startsWith('fc') || hostname.startsWith('fd')) return true; // fc00::/7 unique-local
    if (hostname.startsWith('fe80')) return true; // link-local IPv6
    const ipv4 = hostname.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
    if (ipv4) {
        const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
        if (a === 127 || a === 10 || a === 0) return true; // loopback / private / this-network
        if (a === 192 && b === 168) return true; // 192.168.0.0/16
        if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
        if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
        if (a >= 224) return true; // multicast / reserved
    }
    return false;
}

// Header nguy hiểm KHÔNG cho client set qua ?headers= (chống relay credential +
// spoof IP/Host). Lowercase. Header an toàn khác (accept*, origin, referer, sec-*,
// content-type, user-agent, x-kas…) vẫn được phép cho các API đích cần (vd vnhub).
const PROXY_HEADER_DENYLIST = new Set([
    'host',
    'cookie',
    'authorization',
    'proxy-authorization',
    'x-forwarded-for',
    'x-forwarded-host',
    'x-forwarded-proto',
    'x-forwarded-port',
    'forwarded',
    'via',
    'x-real-ip',
    'true-client-ip',
    'x-cluster-client-ip',
    'cf-connecting-ip',
    'cf-ipcountry',
    'cf-ray',
    'cf-visitor',
]);

/**
 * Validate `?url=` đích trước khi fetch (chống open-proxy / SSRF).
 * @param {string} targetUrl
 * @returns {{ ok: true, parsed: URL } | { ok: false, status: number, message: string }}
 */
function validateProxyTarget(targetUrl) {
    let parsed;
    try {
        parsed = new URL(targetUrl);
    } catch (e) {
        return { ok: false, status: 400, message: 'Invalid url parameter' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        return { ok: false, status: 400, message: 'Only http(s) URLs are allowed' };
    }
    const hostname = parsed.hostname.toLowerCase();
    if (isPrivateHost(hostname)) {
        return { ok: false, status: 403, message: 'Target host is not allowed' };
    }
    if (!isHostAllowed(hostname)) {
        return { ok: false, status: 403, message: 'Target host is not allowed' };
    }
    return { ok: true, parsed };
}

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
            usage: '/api/proxy?url=<encoded_url>',
        });
    }

    // SSRF guard: scheme + private-IP + hostname allowlist
    const validation = validateProxyTarget(targetUrl);
    if (!validation.ok) {
        console.warn(
            '[PROXY] Rejected target:',
            redactUrlForLog(targetUrl),
            '-',
            validation.message
        );
        return errorResponse(validation.message, validation.status);
    }

    console.log('[PROXY] Fetching:', redactUrlForLog(targetUrl));

    try {
        // Read body first
        const requestBody =
            request.method !== 'GET' && request.method !== 'HEAD'
                ? await request.arrayBuffer()
                : null;

        // Build fetch options
        const fetchOptions = {
            method: request.method,
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                Accept: 'application/json, text/plain, */*',
            },
            body: requestBody,
        };

        // Preserve Content-Type from original request
        const originalContentType = request.headers.get('Content-Type');
        if (originalContentType && requestBody) {
            fetchOptions.headers['Content-Type'] = originalContentType;
        }

        // Custom headers from query param — LỌC denylist (SSRF/credential-relay).
        // URL đã allowlist host; nhưng merge thẳng ?headers= cho phép bơm Cookie/
        // Authorization (relay credential tới host allowlist) hoặc X-Forwarded-*/CF-*/
        // Host (spoof IP, request smuggling, cache poisoning). Drop các header này;
        // header an toàn (accept*, origin, referer, sec-*, content-type, x-kas…) vẫn cho.
        const customHeadersStr = url.searchParams.get('headers');
        if (customHeadersStr) {
            try {
                const customHeaders = JSON.parse(customHeadersStr);
                for (const [k, v] of Object.entries(customHeaders || {})) {
                    if (typeof k !== 'string') continue;
                    if (PROXY_HEADER_DENYLIST.has(k.toLowerCase().trim())) continue;
                    fetchOptions.headers[k] = v;
                }
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

        const sepayResponse = await fetchWithRetry(
            targetUrl,
            {
                method: request.method,
                headers: sepayHeaders,
                body: requestBody,
            },
            3,
            1000,
            15000
        );

        console.log('[SEPAY-PROXY] Response status:', sepayResponse.status);
        console.log('[SEPAY-PROXY] ========================================');

        return proxyResponseWithCors(sepayResponse);
    } catch (error) {
        console.error('[SEPAY-PROXY] Error:', error.message);
        return errorResponse('SePay proxy failed: ' + error.message, 502, { target: targetUrl });
    }
}

/**
 * Handle /api/sepay-home/*
 * SePay Home (account #2) webhook proxy — độc lập với /api/sepay/*
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleSepayHomeProxy(request, url, pathname) {
    const homePath = pathname.replace(/^\/api\/sepay-home\//, '');
    const targetUrl = `https://n2store-fallback.onrender.com/api/sepay-home/${homePath}${url.search}`;

    console.log('[SEPAY-HOME-PROXY] ========================================');
    console.log('[SEPAY-HOME-PROXY] Forwarding to:', targetUrl);
    console.log('[SEPAY-HOME-PROXY] Method:', request.method);

    const sepayHeaders = new Headers();
    sepayHeaders.set('Content-Type', request.headers.get('Content-Type') || 'application/json');
    sepayHeaders.set('Accept', 'application/json');
    sepayHeaders.set('User-Agent', 'Cloudflare-Worker-SePay-Home-Proxy/1.0');

    const authHeader = request.headers.get('Authorization');
    if (authHeader) {
        sepayHeaders.set('Authorization', authHeader);
        console.log('[SEPAY-HOME-PROXY] Authorization header forwarded');
    }

    // SSE: forward Accept: text/event-stream and stream response
    const acceptHeader = request.headers.get('Accept');
    const isSse =
        pathname.endsWith('/stream') ||
        (acceptHeader && acceptHeader.includes('text/event-stream'));
    if (isSse) {
        sepayHeaders.set('Accept', 'text/event-stream');
        sepayHeaders.set('Cache-Control', 'no-cache');
    }

    try {
        let requestBody = null;
        if (request.method !== 'GET' && request.method !== 'HEAD') {
            requestBody = await request.arrayBuffer();
            console.log('[SEPAY-HOME-PROXY] Request body size:', requestBody.byteLength, 'bytes');
        }

        // ⚠ timeout governs time-to-headers, KHÔNG phải tổng đời kết nối. Khi headers
        // SSE về (rất nhanh), fetch() resolve + clearTimeout → body stream tiếp không bị
        // abort. KHÔNG dùng 0 (fetchWithTimeout hiểu 0 = setTimeout(abort,0) = abort NGAY
        // → 502). Dùng 15000 giống handleSepayProxy (đã chạy ổn cho /api/sepay/stream).
        const sepayResponse = await fetchWithRetry(
            targetUrl,
            {
                method: request.method,
                headers: sepayHeaders,
                body: requestBody,
            },
            3,
            1000,
            15000
        );

        console.log('[SEPAY-HOME-PROXY] Response status:', sepayResponse.status);
        console.log('[SEPAY-HOME-PROXY] ========================================');

        return proxyResponseWithCors(sepayResponse);
    } catch (error) {
        console.error('[SEPAY-HOME-PROXY] Error:', error.message);
        return errorResponse('SePay Home proxy failed: ' + error.message, 502, {
            target: targetUrl,
        });
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

        const uploadResponse = await fetchWithRetry(
            targetUrl,
            {
                method: request.method,
                headers: uploadHeaders,
                body: requestBody,
            },
            3,
            1000,
            30000
        ); // 30s timeout for uploads

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
 * Generic Render Express-router endpoints wrapper. Each of these paths maps 1:1 to an
 * `app.use('/api/<name>', <nameRoutes>)` line in render.com/server.js:
 *   attendance, gemini, deepseek (sub-paths), telegram, quick-replies, fb-ads,
 *   fb-global-id, pancake-account-pages, tpos-credentials.
 * Without these explicit CF routes, the TPOS_GENERIC catch-all would forward them to
 * tomato.tpos.vn/<path> (404) — breaking AI chat, attendance sync, FB ads, etc.
 * @param {Request} request
 * @param {URL} url
 * @param {string} pathname
 * @returns {Promise<Response>}
 */
export async function handleRenderMiscProxy(request, url, pathname) {
    // Tag extracted from pathname so logs remain useful (e.g. ATTENDANCE-PROXY, GEMINI-PROXY)
    const segment = (pathname.match(/^\/api\/([a-z0-9-]+)/i) || [, 'RENDER-MISC'])[1];
    return handleRenderFallbackProxy(request, url, pathname, `${segment.toUpperCase()}-PROXY`);
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
    const targetUrl = `${renderOriginFor(pathname)}${pathname}${url.search}`;

    const acceptHeader = request.headers.get('Accept') || '';
    const isSSE = isStreamingRequest(pathname, url, acceptHeader);

    console.log(`[${tag}] Forwarding to:`, redactUrlForLog(targetUrl), isSSE ? '(SSE stream)' : '');

    try {
        const forwardHeaders = new Headers(request.headers);
        // Strip hop-by-hop / host headers that would confuse the upstream
        forwardHeaders.delete('host');
        forwardHeaders.delete('cf-connecting-ip');
        forwardHeaders.delete('cf-ray');

        const fetchInit = {
            method: request.method,
            headers: forwardHeaders,
            body:
                request.method !== 'GET' && request.method !== 'HEAD'
                    ? await request.arrayBuffer()
                    : null,
        };

        let response;
        if (isSSE) {
            // SSE/stream: plain fetch, no timeout/retry — we need the stream to stay open
            response = await fetch(targetUrl, fetchInit);
        } else if (canRetryMethod(request.method, request)) {
            // Idempotent (or idempotency-keyed) → safe to retry transient 5xx/429
            response = await fetchWithRetry(targetUrl, fetchInit, 3, 1000, 15000);
        } else {
            // Non-idempotent mutation (POST/PUT/PATCH/DELETE) → single attempt, no retry
            // so a transient timeout/5xx never re-fires the write twice.
            response = await fetchWithTimeout(targetUrl, fetchInit, 15000);
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
        const response = await fetchWithRetry(
            targetUrl,
            {
                method: request.method,
                headers: new Headers(request.headers),
                body:
                    request.method !== 'GET' && request.method !== 'HEAD'
                        ? await request.arrayBuffer()
                        : null,
            },
            3,
            1000,
            15000
        );

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
        const response = await fetchWithRetry(
            targetUrl,
            {
                method: request.method,
                headers: new Headers(request.headers),
                body:
                    request.method !== 'GET' && request.method !== 'HEAD'
                        ? await request.arrayBuffer()
                        : null,
            },
            3,
            1000,
            15000
        );

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

    const targetUrl = `${renderOriginFor(pathname)}/api/${apiPath}${url.search}`;

    console.log('[CUSTOMER360] Proxying to:', redactUrlForLog(targetUrl));

    try {
        const fetchInit = {
            method: request.method,
            headers: new Headers(request.headers),
            body:
                request.method !== 'GET' && request.method !== 'HEAD'
                    ? await request.arrayBuffer()
                    : null,
        };

        // AI generation (Nano Banana tạo ảnh / img2img / ghép đồ qua /api/web2-ai/*)
        // chạy ~15-40s — cap 15s mặc định giết chúng ngay sát mép (img2img đo được 13.7s
        // trực tiếp, chập chờn 502 qua worker). Nới ceiling cho đúng nhóm AI gen; các
        // mutation khác giữ 15s để không treo. ponytail: chỉ nới path AI, không nới toàn bộ.
        const timeoutMs = pathname.startsWith('/api/web2-ai/') ? 90000 : 15000;

        // Web 2.0 writes (native-orders/fast-sale-orders/purchase-refund/wallet-deposits…)
        // flow through here. Retry ONLY idempotent (or idempotency-keyed) requests so a
        // transient 5xx/429/timeout never re-fires a mutation twice.
        const response = canRetryMethod(request.method, request)
            ? await fetchWithRetry(targetUrl, fetchInit, 3, 1000, timeoutMs)
            : await fetchWithTimeout(targetUrl, fetchInit, timeoutMs);

        return proxyResponseWithCors(response);
    } catch (error) {
        console.error('[CUSTOMER360] Error:', error.message);
        return errorResponse('Customer 360 proxy failed: ' + error.message, 502);
    }
}
