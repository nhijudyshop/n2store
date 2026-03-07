/**
 * Shared TPOS Customer Lookup Service
 * Reusable across pages (balance-history, orders-report, etc.)
 *
 * Usage: Include this script, then call window.tposCustomerLookup.search(phone)
 */
(function () {
    const _cache = {};

    /**
     * Fetch customer(s) from TPOS by phone number
     * @param {string} phone - 10-digit phone number
     * @returns {Promise<{success: boolean, customers: Array, count: number}>}
     */
    async function search(phone) {
        const API_BASE_URL = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';

        // Check cache first
        if (_cache[phone]) {
            return _cache[phone];
        }

        try {
            const response = await fetch(`${API_BASE_URL}/api/sepay/tpos/customer/${phone}`);
            const result = await response.json();

            if (result.success) {
                const cacheResult = {
                    success: true,
                    customers: result.data || [],
                    count: result.count || 0
                };
                // Cache for 5 minutes
                _cache[phone] = cacheResult;
                setTimeout(() => delete _cache[phone], 5 * 60 * 1000);
                return cacheResult;
            } else {
                return { success: false, customers: [], count: 0, error: result.error };
            }
        } catch (error) {
            console.error('[TPOS-LOOKUP] Error:', error);
            return { success: false, customers: [], count: 0, error: error.message };
        }
    }

    window.tposCustomerLookup = { search };
})();
