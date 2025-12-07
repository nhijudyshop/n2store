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
          'Access-Control-Allow-Headers': 'Content-Type, Authorization, Accept, X-Auth-Data, X-User-Id',
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

      // ========== IMAGE PROXY ENDPOINT ==========
      if (pathname === '/api/image-proxy' && request.method === 'GET') {
        const imageUrl = url.searchParams.get('url');

        if (!imageUrl) {
          return new Response(JSON.stringify({
            error: 'Missing url parameter',
            usage: '/api/image-proxy?url=<encoded_url>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        console.log('[IMAGE-PROXY] Fetching:', imageUrl);

        try {
          // Fetch image from external source
          const imageResponse = await fetch(imageUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
              'Referer': 'https://tomato.tpos.vn/'
            }
          });

          if (!imageResponse.ok) {
            console.error('[IMAGE-PROXY] Failed:', imageResponse.status, imageResponse.statusText);
            return new Response(JSON.stringify({
              error: `Failed to fetch image: ${imageResponse.status} ${imageResponse.statusText}`
            }), {
              status: imageResponse.status,
              headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Get content type
          const contentType = imageResponse.headers.get('content-type') || 'image/jpeg';

          // Create response with CORS headers
          const newResponse = new Response(imageResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400', // Cache for 1 day
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Accept',
            },
          });

          console.log('[IMAGE-PROXY] Success:', contentType);
          return newResponse;

        } catch (error) {
          console.error('[IMAGE-PROXY] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to proxy image',
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

      // ========== FACEBOOK/PANCAKE AVATAR PROXY ENDPOINT ==========
      if (pathname === '/api/fb-avatar' && request.method === 'GET') {
        const fbId = url.searchParams.get('id');
        const pageId = url.searchParams.get('page') || '270136663390370'; // Default page ID
        const accessToken = url.searchParams.get('token'); // Pancake JWT token (optional)

        if (!fbId) {
          return new Response(JSON.stringify({
            error: 'Missing id parameter',
            usage: '/api/fb-avatar?id=<facebook_user_id>&page=<page_id>&token=<jwt_token>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        // Use Pancake Avatar API which handles the hash lookup
        let pancakeAvatarUrl = `https://pancake.vn/api/v1/pages/${pageId}/avatar/${fbId}`;
        if (accessToken) {
          pancakeAvatarUrl += `?access_token=${accessToken}`;
        }
        console.log('[FB-AVATAR] Fetching from Pancake:', pancakeAvatarUrl);

        try {
          // Fetch from Pancake Avatar API (it will redirect to content.pancake.vn)
          const avatarResponse = await fetch(pancakeAvatarUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
              'Referer': 'https://pancake.vn/'
            },
            redirect: 'follow'
          });

          if (!avatarResponse.ok) {
            console.error('[FB-AVATAR] Pancake failed:', avatarResponse.status, '- falling back to Facebook');
            // Fallback to Facebook Graph API
            const fbAvatarUrl = `https://graph.facebook.com/${fbId}/picture?width=80&height=80&type=normal`;
            const fbResponse = await fetch(fbAvatarUrl, {
              method: 'GET',
              headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Accept': 'image/*,*/*',
              },
              redirect: 'follow'
            });

            if (fbResponse.ok) {
              const contentType = fbResponse.headers.get('content-type') || 'image/jpeg';
              return new Response(fbResponse.body, {
                status: 200,
                headers: {
                  'Content-Type': contentType,
                  'Cache-Control': 'public, max-age=86400',
                  'Access-Control-Allow-Origin': '*',
                },
              });
            }

            // Return default avatar SVG
            return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          // Get content type
          const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';

          // Create response with CORS headers
          return new Response(avatarResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400', // Cache for 1 day
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET, OPTIONS',
              'Access-Control-Allow-Headers': 'Content-Type, Accept',
            },
          });

        } catch (error) {
          console.error('[FB-AVATAR] Error:', error.message);
          // Return default avatar SVG on error
          return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Cache-Control': 'public, max-age=3600',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== PANCAKE AVATAR PROXY ENDPOINT ==========
      if (pathname === '/api/pancake-avatar' && request.method === 'GET') {
        const avatarHash = url.searchParams.get('hash');

        if (!avatarHash) {
          return new Response(JSON.stringify({
            error: 'Missing hash parameter',
            usage: '/api/pancake-avatar?hash=<avatar_hash>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        const pancakeAvatarUrl = `https://content.pancake.vn/2.1-24/avatars/${avatarHash}`;
        console.log('[PANCAKE-AVATAR] Fetching:', pancakeAvatarUrl);

        try {
          const avatarResponse = await fetch(pancakeAvatarUrl, {
            method: 'GET',
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'image/*,*/*',
              'Referer': 'https://pancake.vn/'
            }
          });

          if (!avatarResponse.ok) {
            return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
              status: 200,
              headers: {
                'Content-Type': 'image/svg+xml',
                'Cache-Control': 'public, max-age=3600',
                'Access-Control-Allow-Origin': '*',
              },
            });
          }

          const contentType = avatarResponse.headers.get('content-type') || 'image/jpeg';
          return new Response(avatarResponse.body, {
            status: 200,
            headers: {
              'Content-Type': contentType,
              'Cache-Control': 'public, max-age=86400',
              'Access-Control-Allow-Origin': '*',
            },
          });
        } catch (error) {
          return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#e5e7eb"/><circle cx="20" cy="15" r="7" fill="#9ca3af"/><ellipse cx="20" cy="32" rx="11" ry="8" fill="#9ca3af"/></svg>`, {
            status: 200,
            headers: {
              'Content-Type': 'image/svg+xml',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }
      }

      // ========== GENERIC PROXY ENDPOINT (For TinhThanhPho, etc.) ==========
      if (pathname === '/api/proxy') {
        const targetUrl = url.searchParams.get('url');

        if (!targetUrl) {
          return new Response(JSON.stringify({
            error: 'Missing url parameter',
            usage: '/api/proxy?url=<encoded_url>'
          }), {
            status: 400,
            headers: {
              'Content-Type': 'application/json',
              'Access-Control-Allow-Origin': '*',
            },
          });
        }

        console.log('[PROXY] Fetching:', targetUrl);

        try {
          // Forward request
          const fetchOptions = {
            method: request.method,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              'Accept': 'application/json, text/plain, */*',
            },
            body: request.method !== 'GET' && request.method !== 'HEAD'
              ? await request.arrayBuffer()
              : null,
          };

          // Check for custom headers passed via query param 'headers' (JSON string)
          const customHeadersStr = url.searchParams.get('headers');
          if (customHeadersStr) {
            try {
              const customHeaders = JSON.parse(customHeadersStr);
              Object.assign(fetchOptions.headers, customHeaders);
            } catch (e) {
              console.error('[PROXY] Failed to parse custom headers:', e);
            }
          }

          const proxyResponse = await fetch(targetUrl, fetchOptions);

          // Clone response and add CORS headers
          const newResponse = new Response(proxyResponse.body, proxyResponse);
          newResponse.headers.set('Access-Control-Allow-Origin', '*');
          newResponse.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
          newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

          return newResponse;

        } catch (error) {
          console.error('[PROXY] Error:', error.message);
          return new Response(JSON.stringify({
            error: 'Failed to proxy request',
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
      let isTPOSRequest = false;
      let isPancakeRequest = false;

      if (pathname.startsWith('/api/pancake/')) {
        // Pancake API
        const apiPath = pathname.replace(/^\/api\/pancake\//, '');
        targetUrl = `https://pancake.vn/api/v1/${apiPath}${url.search}`;
        isPancakeRequest = true;
      } else if (pathname === '/api/realtime/start') {
        // Realtime Server (Render)
        targetUrl = `https://n2store-fallback.onrender.com/api/realtime/start`;
      } else if (pathname.startsWith('/api/chat/')) {
        // Chat Server (Render) - Using same server as realtime
        const chatPath = pathname.replace(/^\/api\/chat\//, '');
        targetUrl = `https://n2store-fallback.onrender.com/api/chat/${chatPath}${url.search}`;
      } else if (pathname.startsWith('/api/sepay/')) {
        // Sepay Webhook & Balance History (Render)
        const sepayPath = pathname.replace(/^\/api\/sepay\//, '');
        targetUrl = `https://n2store-fallback.onrender.com/api/sepay/${sepayPath}${url.search}`;
      } else if (pathname.startsWith('/api/customers/') || pathname === '/api/customers') {
        // Customers API (Render) - PostgreSQL backend
        const customersPath = pathname.replace(/^\/api\/customers\/?/, '');
        targetUrl = `https://n2store-fallback.onrender.com/api/customers/${customersPath}${url.search}`;
      } else if (pathname.startsWith('/api/')) {
        // TPOS API (catch-all)
        const apiPath = pathname.replace(/^\/api\//, '');
        targetUrl = `https://tomato.tpos.vn/${apiPath}${url.search}`;
        isTPOSRequest = true;
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

      // Build headers based on target API
      let headers;

      if (isTPOSRequest) {
        // TPOS API headers - copy from original request
        headers = new Headers(request.headers);
        headers.set('Origin', 'https://tomato.tpos.vn/');
        headers.set('Referer', 'https://tomato.tpos.vn/');
      } else if (isPancakeRequest) {
        // Pancake API headers - build clean headers
        headers = new Headers();

        // Only forward essential headers
        const contentType = request.headers.get('Content-Type');
        if (contentType) {
          headers.set('Content-Type', contentType);
        }

        // Set Pancake-specific headers
        headers.set('Accept', 'application/json, text/plain, */*');
        headers.set('Accept-Language', 'vi,en-US;q=0.9,en;q=0.8');
        headers.set('Origin', 'https://pancake.vn');
        headers.set('Referer', 'https://pancake.vn/multi_pages');
        headers.set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36');
      } else {
        // Other APIs - copy all headers
        headers = new Headers(request.headers);
      }

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
      newResponse.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept, X-Auth-Data, X-User-Id');

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
