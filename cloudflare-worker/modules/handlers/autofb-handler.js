/**
 * AutoFB Handler
 * Proxies to Render server for balance (captcha) and API operations (services, orders)
 *
 * @module cloudflare-worker/modules/handlers/autofb-handler
 */

import { errorResponse, corsResponse } from '../utils/cors-utils.js';

const RENDER_SERVER = 'https://n2store-fallback.onrender.com';

/**
 * Generic proxy helper - forwards request to Render server
 */
async function proxyToRender(path, options = {}) {
    const res = await fetch(`${RENDER_SERVER}${path}`, {
        method: options.method || 'GET',
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
        },
        ...(options.body ? { body: JSON.stringify(options.body) } : {}),
    });

    const data = await res.json();
    return corsResponse(data);
}

/**
 * POST /api/autofb-balance — Login + captcha solve for balance
 */
export async function handleAutofbBalance(request, url) {
    if (request.method !== 'POST') return errorResponse('Use POST method', 405);

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400); }
    if (!body.username || !body.password) return errorResponse('Missing username or password', 400);

    try {
        return await proxyToRender('/api/autofb/balance', {
            method: 'POST',
            body: { username: body.username, password: body.password },
        });
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}

/**
 * GET /api/autofb-services — List all services
 */
export async function handleAutofbServices(request, url) {
    try {
        return await proxyToRender('/api/autofb/services');
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}

/**
 * GET /api/autofb-api-balance — Check API balance (no captcha)
 */
export async function handleAutofbApiBalance(request, url) {
    try {
        return await proxyToRender('/api/autofb/api-balance');
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}

/**
 * POST /api/autofb-order — Create order
 */
export async function handleAutofbOrder(request, url) {
    if (request.method !== 'POST') return errorResponse('Use POST method', 405);

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400); }
    if (!body.service || !body.link || !body.quantity) return errorResponse('Missing service, link, or quantity', 400);

    try {
        return await proxyToRender('/api/autofb/order', { method: 'POST', body });
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}

/**
 * POST /api/autofb-order-status — Check order status
 */
export async function handleAutofbOrderStatus(request, url) {
    if (request.method !== 'POST') return errorResponse('Use POST method', 405);

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400); }

    try {
        return await proxyToRender('/api/autofb/order-status', { method: 'POST', body });
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}

/**
 * POST /api/autofb-cancel — Cancel order
 */
export async function handleAutofbCancel(request, url) {
    if (request.method !== 'POST') return errorResponse('Use POST method', 405);

    let body;
    try { body = await request.json(); } catch { return errorResponse('Invalid JSON body', 400); }
    if (!body.order_id) return errorResponse('Missing order_id', 400);

    try {
        return await proxyToRender('/api/autofb/cancel', { method: 'POST', body });
    } catch (e) {
        return errorResponse('Render proxy error: ' + e.message, 502);
    }
}
