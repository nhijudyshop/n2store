// =====================================================
// FETCH NO-CACHE WRAPPER - Disable caching for all fetch requests
// =====================================================

(function() {
    'use strict';

    // Store original fetch
    const originalFetch = window.fetch;

    // Override global fetch to add no-cache headers
    window.fetch = function(...args) {
        let [resource, config] = args;

        // Default config if not provided
        config = config || {};

        // Add cache: 'no-store' to disable caching
        config.cache = 'no-store';

        // Add no-cache headers
        config.headers = config.headers || {};
        config.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate';
        config.headers['Pragma'] = 'no-cache';
        config.headers['Expires'] = '0';

        console.log('[FETCH NO-CACHE] Request:', resource);

        // Call original fetch with modified config
        return originalFetch(resource, config);
    };

    console.log('[FETCH NO-CACHE] Fetch wrapper installed - all requests will bypass cache');
})();
