# Shared Library

Thư viện dùng chung cho tất cả các module trong n2store project.

## Cấu trúc

```
/shared/
├── universal/          # Works in Browser + Node.js
│   ├── fetch-utils.js          # fetchWithTimeout, fetchWithRetry
│   ├── api-endpoints.js        # All API endpoint configs
│   ├── cors-headers.js         # CORS header utilities
│   ├── facebook-constants.js   # Facebook Graph API constants
│   └── index.js
│
├── browser/            # Browser-only modules
│   ├── token-manager.js        # TPOS token manager
│   ├── pancake-token-manager.js # Pancake JWT manager
│   └── index.js
│
├── node/               # Node.js-only modules
│   ├── token-cache.js          # Server-side token cache
│   ├── cors-middleware.js      # Express CORS middleware
│   └── index.js
│
└── README.md
```

## Sử dụng

### Browser (ES Modules)

```html
<script type="module">
import {
    fetchWithRetry,
    API_ENDPOINTS,
    TokenManager
} from '/shared/browser/index.js';

// Fetch với retry
const response = await fetchWithRetry('https://api.example.com/data', {
    method: 'GET'
}, 3, 1000, 10000);

// Token manager
const tokenManager = new TokenManager();
const token = await tokenManager.getToken();
</script>
```

### Node.js (ES Modules)

```javascript
import {
    fetchWithRetry,
    API_ENDPOINTS,
    corsMiddleware,
    tposTokenCache
} from '../shared/node/index.js';

// Express app
import express from 'express';
const app = express();

// Add CORS middleware
app.use(corsMiddleware());

// Use token cache
if (!tposTokenCache.isValid()) {
    const tokenData = await fetchNewToken();
    tposTokenCache.set(tokenData);
}
const token = tposTokenCache.get();
```

### Cloudflare Worker

```javascript
import {
    fetchWithRetry,
    corsResponse,
    corsPreflightResponse
} from '../shared/universal/index.js';

export default {
    async fetch(request) {
        if (request.method === 'OPTIONS') {
            return corsPreflightResponse();
        }

        const response = await fetchWithRetry('https://api.example.com/data');
        return corsResponse(await response.json());
    }
};
```

## API Reference

### universal/fetch-utils.js

| Function | Description |
|----------|-------------|
| `delay(ms)` | Promise-based delay |
| `fetchWithTimeout(url, options, timeout)` | Fetch with timeout |
| `fetchWithRetry(url, options, retries, delayMs, timeoutMs)` | Fetch with retry & exponential backoff |
| `simpleFetch(url, options)` | Simple fetch with JSON parsing |
| `safeFetch(url, options, config)` | Safe fetch returning `{success, data, error}` |

### universal/api-endpoints.js

| Export | Description |
|--------|-------------|
| `API_ENDPOINTS` | All API endpoint URLs |
| `buildTposODataUrl(endpoint, params)` | Build TPOS OData URL |
| `buildPancakeUrl(endpoint, params)` | Build Pancake API URL |
| `buildFacebookGraphUrl(endpoint, token)` | Build Facebook Graph URL |
| `buildWorkerUrl(route, endpoint, params)` | Build Worker proxy URL |

### universal/cors-headers.js

| Export | Description |
|--------|-------------|
| `CORS_HEADERS` | Standard CORS headers object |
| `corsResponse(body, status, headers)` | Create Response with CORS |
| `corsPreflightResponse()` | CORS preflight response |
| `corsErrorResponse(message, status)` | Error response with CORS |
| `addCorsHeaders(response)` | Add CORS to existing Response |

### browser/token-manager.js

```javascript
const manager = new TokenManager({
    apiUrl: 'https://...',
    storageKey: 'my_token',
    firebasePath: 'tokens/my_token',
    credentials: { ... }
});

await manager.getToken();           // Get valid token
await manager.getAuthHeader();      // Get { Authorization: 'Bearer ...' }
await manager.authenticatedFetch(url, options);
await manager.refresh();            // Force refresh
manager.getTokenInfo();             // Display info
```

### browser/pancake-token-manager.js

```javascript
const manager = new PancakeTokenManager();
await manager.initialize();

manager.getToken();                 // Get JWT token
manager.getPageAccessToken(pageId); // Get page token
await manager.setToken(token, expiry, accountId);
await manager.setPageAccessToken(pageId, token, pageName);
```

### node/token-cache.js

```javascript
import { TokenCache, tposTokenCache } from '../shared/node/index.js';

// Generic cache
const cache = new TokenCache({ bufferTime: 5 * 60 * 1000 });
cache.set('key', 'token', 3600);
const token = cache.get('key');

// Singleton TPOS cache
tposTokenCache.set({ access_token: '...', expires_in: 3600 });
const tposToken = tposTokenCache.get();
```

### node/cors-middleware.js

```javascript
import { corsMiddleware, simpleCors } from '../shared/node/index.js';

// Full middleware
app.use(corsMiddleware({
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: true
}));

// Simple middleware
app.use(simpleCors());
```

## Migration Guide

### Từ orders-report/js/core/token-manager.js

```javascript
// Old
const tokenManager = new TokenManager();

// New
import { TokenManager } from '/shared/browser/index.js';
const tokenManager = new TokenManager();
```

### Từ cloudflare-worker/worker.js

```javascript
// Old (inline)
async function fetchWithRetry(...) { ... }

// New
import { fetchWithRetry } from './modules/utils/fetch-utils.js';
```

## Notes

- Tất cả modules sử dụng ES Modules (`export`/`import`)
- Browser modules yêu cầu `<script type="module">`
- Node.js cần `"type": "module"` trong package.json hoặc `.mjs` extension
- Cloudflare Worker tự động bundle với wrangler
