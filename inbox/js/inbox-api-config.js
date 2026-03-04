/* =====================================================
   INBOX API CONFIG - Setup API_CONFIG for Pancake managers
   Reuses same pattern as orders-report/js/modules/core/api-config.js
   but as a plain script (not ES module)
   ===================================================== */

const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';

window.API_CONFIG = {
    WORKER_URL,

    get PANCAKE() {
        return `${WORKER_URL}/api/pancake`;
    },

    buildUrl: {
        pancake: (endpoint, params = '') => {
            const baseUrl = `${WORKER_URL}/api/pancake/${endpoint}`;
            return params ? `${baseUrl}?${params}` : baseUrl;
        },

        pancakeDirect: (endpoint, pageId, jwtToken, accessToken) => {
            const params = new URLSearchParams();
            params.set('page_id', pageId);
            params.set('jwt', jwtToken);
            params.set('access_token', accessToken);
            return `${WORKER_URL}/api/pancake-direct/${endpoint}?${params.toString()}`;
        },

        pancakeOfficial: (endpoint, pageAccessToken) => {
            const baseUrl = `${WORKER_URL}/api/pancake-official/${endpoint}`;
            return pageAccessToken ? `${baseUrl}?page_access_token=${pageAccessToken}` : baseUrl;
        },

        facebookSend: () => {
            return `${WORKER_URL}/api/facebook-send`;
        }
    },

    smartFetch: async function(url, options = {}) {
        return fetch(url, options);
    }
};

console.log('[INBOX-API] API_CONFIG initialized:', { worker: WORKER_URL });
