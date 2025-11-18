/**
 * Cloudflare Worker - Multi-API Proxy
 * Bypass CORS for tomato.tpos.vn and pancake.vn API calls
 */

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
