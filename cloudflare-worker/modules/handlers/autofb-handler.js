/**
 * AutoFB Balance Handler
 * Proxies to Render server which handles SVG→PNG→Gemini Vision captcha solving
 *
 * CF Worker cannot render SVG to PNG (no canvas/sharp).
 * Render server (Node.js) has sharp + Gemini Vision for reliable OCR.
 *
 * @module cloudflare-worker/modules/handlers/autofb-handler
 */

import { errorResponse, corsResponse } from '../utils/cors-utils.js';
import { proxyResponseWithCors } from '../utils/cors-utils.js';

const RENDER_SERVER = 'https://n2store-fallback.onrender.com';

/**
 * Handle POST /api/autofb-balance
 * Proxies to Render server: POST /api/autofb/balance
 * Body: { username, password }
 */
export async function handleAutofbBalance(request, url) {
    if (request.method !== 'POST') {
        return errorResponse('Use POST method', 405);
    }

    let body;
    try {
        body = await request.json();
    } catch {
        return errorResponse('Invalid JSON body', 400);
    }

    if (!body.username || !body.password) {
        return errorResponse('Missing username or password', 400);
    }

    console.log('[AUTOFB] Proxying to Render server for:', body.username);

    try {
        const res = await fetch(`${RENDER_SERVER}/api/autofb/balance`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
            },
            body: JSON.stringify({
                username: body.username,
                password: body.password,
            }),
        });

        const data = await res.json();
        return corsResponse(data);

    } catch (e) {
        console.error('[AUTOFB] Render proxy error:', e.message);
        return errorResponse('Failed to proxy to Render server: ' + e.message, 502);
    }
}
