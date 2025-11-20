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
          // Get request headers (simple approach like your working code)
          const headers = new Headers(request.headers);
          headers.set('Origin', 'https://tomato.tpos.vn/');
          headers.set('Referer', 'https://tomato.tpos.vn/');

          // Forward to TPOS token endpoint
          const tposResponse = await fetch('https://tomato.tpos.vn/token', {
            method: 'POST',
            headers: headers,
            body: await request.arrayBuffer(),
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

      // ========== GENERIC PROXY (like your working code) ==========
      let targetUrl;

      if (pathname.startsWith('/api/pancake/')) {
        // Pancake API
        const apiPath = pathname.replace(/^\/api\/pancake\//, '');
        targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;
      } else if (pathname === '/api/realtime/start') {
        // Realtime Server (Render)
        targetUrl = `https://n2store-fallback.onrender.com/api/realtime/start`;
      } else if (pathname.startsWith('/api/')) {
        // TPOS API (catch-all)
        const apiPath = pathname.replace(/^\/api\//, '');
        targetUrl = `https://tomato.tpos.vn/${apiPath}${url.search}`;
      } else {
        // Unknown route
        return new Response(JSON.stringify({
          error: 'Invalid API route',
          message: 'Use /api/* routes'
        }), {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
        });
      }

      // Get request headers (simple approach)
      const headers = new Headers(request.headers);
      headers.set('Origin', 'https://tomato.tpos.vn/');
      headers.set('Referer', 'https://tomato.tpos.vn/');

      // Forward request
      const response = await fetch(targetUrl, {
        method: request.method,
        headers: headers,
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
