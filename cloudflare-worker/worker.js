/**
 * Cloudflare Worker - Multi-API Proxy
 * Bypass CORS for tomato.tpos.vn and pancake.vn API calls
 */

// =====================================================
// TPOS TOKEN CACHE (In-memory)
// =====================================================
const tokenCache = {
  access_token: null,
  expiry: null,
  expires_in: null,
  token_type: null
};

/**
 * Check if cached token is still valid
 * @returns {boolean}
 */
function isCachedTokenValid() {
  if (!tokenCache.access_token || !tokenCache.expiry) {
    return false;
  }

  // Add 5-minute buffer before expiry
  const buffer = 5 * 60 * 1000;
  const now = Date.now();

  return now < (tokenCache.expiry - buffer);
}

/**
 * Cache token data
 * @param {object} tokenData - Token response from TPOS
 */
function cacheToken(tokenData) {
  const expiryTimestamp = Date.now() + (tokenData.expires_in * 1000);

  tokenCache.access_token = tokenData.access_token;
  tokenCache.expiry = expiryTimestamp;
  tokenCache.expires_in = tokenData.expires_in;
  tokenCache.token_type = tokenData.token_type || 'Bearer';

  console.log('[WORKER-TOKEN] ✅ Token cached, expires at:', new Date(expiryTimestamp).toISOString());
}

/**
 * Get cached token if valid
 * @returns {object|null}
 */
function getCachedToken() {
  if (isCachedTokenValid()) {
    console.log('[WORKER-TOKEN] ✅ Using cached token');
    return {
      access_token: tokenCache.access_token,
      expires_in: Math.floor((tokenCache.expiry - Date.now()) / 1000),
      token_type: tokenCache.token_type
    };
  }
  return null;
}

export default {
  async fetch(request, env, ctx) {
    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    try {
      // Parse request URL
      const url = new URL(request.url);
      const pathname = url.pathname;

      // ========== SPECIAL HANDLER: TOKEN ENDPOINT WITH CACHING ==========
      if (pathname === '/api/token' && request.method === 'POST') {
        // Check cache first
        const cachedToken = getCachedToken();
        if (cachedToken) {
          console.log('[WORKER-TOKEN] 🚀 Returning cached token');
          return new Response(JSON.stringify(cachedToken), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // Cache miss - fetch new token from TPOS
        console.log('[WORKER-TOKEN] 🔄 Cache miss, fetching new token from TPOS...');

        try {
          // Parse request body to get credentials
          const requestBody = await request.text();

          // Forward to TPOS token endpoint
          const tposResponse = await fetch('https://tomato.tpos.vn/token', {
            method: 'POST',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'content-type': 'application/json;charset=UTF-8',
              'tposappversion': '5.11.16.1',
              'x-tpos-lang': 'vi',
              'Referer': 'https://tomato.tpos.vn/'
            },
            body: requestBody,
          });

          if (!tposResponse.ok) {
            const errorText = await tposResponse.text();
            console.error(`[WORKER-TOKEN] ❌ TPOS error ${tposResponse.status}:`, errorText);
            throw new Error(`TPOS API responded with ${tposResponse.status}: ${tposResponse.statusText}`);
          }

          const tokenData = await tposResponse.json();

          // Validate response
          if (!tokenData.access_token) {
            console.error('[WORKER-TOKEN] ❌ Response missing access_token:', tokenData);
            throw new Error('Invalid token response - missing access_token');
          }

          // Cache the token
          cacheToken(tokenData);

          console.log('[WORKER-TOKEN] ✅ New token fetched and cached');

          // Return token data
          return new Response(JSON.stringify(tokenData), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });

        } catch (error) {
          console.error('[WORKER-TOKEN] ❌ Error fetching token:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to fetch token',
            message: error.message
          }), {
            status: 500,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      let targetUrl;
      let targetHeaders = new Headers(request.headers);

      // Route based on path prefix
      if (pathname.startsWith('/api/pancake/')) {
        // ========== PANCAKE PROXY ==========
        const apiPath = pathname.replace(/^\/api\/pancake\//, '');
        targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;

        // Pancake headers - mimic browser
        targetHeaders.set('accept', 'application/json');
        targetHeaders.set('accept-language', 'vi,en-US;q=0.9,en;q=0.8');
        targetHeaders.set('referer', 'https://pancake.vn/multi_pages');
        targetHeaders.set('sec-ch-ua', '"Chromium";v="142", "Google Chrome";v="142", "Not_A Brand";v="99"');
        targetHeaders.set('sec-ch-ua-mobile', '?0');
        targetHeaders.set('sec-ch-ua-platform', '"Windows"');
        targetHeaders.set('sec-fetch-dest', 'empty');
        targetHeaders.set('sec-fetch-mode', 'cors');
        targetHeaders.set('sec-fetch-site', 'same-origin');

      } else if (pathname.startsWith('/api/')) {
        // ========== TPOS PROXY (catch-all for TPOS routes) ==========
        // Strip '/api/' prefix and forward to TPOS
        // Examples:
        //   /api/odata/... → https://tomato.tpos.vn/odata/...
        //   /api/Product/... → https://tomato.tpos.vn/Product/...
        //   /api/api-ms/... → https://tomato.tpos.vn/api-ms/...
        //   /api/token → https://tomato.tpos.vn/token
        const apiPath = pathname.replace(/^\/api\//, '');
        targetUrl = `https://tomato.tpos.vn/${apiPath}${url.search}`;

        // TPOS headers - mimic browser requests to tomato.tpos.vn
        targetHeaders.set('accept', 'application/json, text/plain, */*');
        targetHeaders.set('tposappversion', '5.11.16.1');
        targetHeaders.set('x-tpos-lang', 'vi');
        targetHeaders.set('Origin', 'https://tomato.tpos.vn');
        targetHeaders.set('Referer', 'https://tomato.tpos.vn/');

      } else {
        // Unknown route (not /api/*)
        return new Response(JSON.stringify({
          error: 'Invalid API route',
          message: 'Use /api/* routes',
          examples: {
            tpos_odata: '/api/odata/SaleOnline_Order/...',
            tpos_product: '/api/Product/...',
            tpos_chatomni: '/api/api-ms/chatomni/v1/...',
            pancake: '/api/pancake/pages?access_token=xxx'
          }
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Forward request
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: targetHeaders,
        body: request.method !== 'GET' && request.method !== 'HEAD'
          ? await request.arrayBuffer()
          : null,
      });

      // Clone response and add CORS headers
      const newResponse = new Response(response.body, response);
      newResponse.headers.set('Access-Control-Allow-Origin', '*');
      newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

      return newResponse;

    } catch (error) {
      return new Response(JSON.stringify({
        error: error.message,
        stack: error.stack
      }), {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
      });
    }
  },
};
