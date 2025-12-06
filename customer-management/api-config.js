/**
 * API Configuration for Customer Management
 * With automatic fallback to Firebase
 */

// Feature flag: Use PostgreSQL API or Firebase
const USE_POSTGRES_API = localStorage.getItem('use_postgres_api') === 'true';

// API Base URL (Render.com backend)
const API_BASE_URL = 'https://n2shop-api.onrender.com';

// Check if API is available
let isAPIAvailable = false;

/**
 * Check API health
 */
async function checkAPIHealth() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`, {
            method: 'GET',
            cache: 'no-cache',
            signal: AbortSignal.timeout(5000) // 5s timeout
        });

        if (response.ok) {
            const data = await response.json();
            isAPIAvailable = data.status === 'ok';
            console.log('[API-CONFIG] ✅ PostgreSQL API is available');
        } else {
            isAPIAvailable = false;
            console.log('[API-CONFIG] ⚠️  PostgreSQL API returned:', response.status);
        }
    } catch (error) {
        isAPIAvailable = false;
        console.log('[API-CONFIG] ⚠️  PostgreSQL API not available, using Firebase fallback');
    }

    return isAPIAvailable;
}

// Auto-check on load
checkAPIHealth();

// API Endpoints
const API_ENDPOINTS = {
    // Customer Management
    CUSTOMERS_SEARCH: `${API_BASE_URL}/api/customers/search`,
    CUSTOMERS_STATS: `${API_BASE_URL}/api/customers/stats`,
    CUSTOMERS_LIST: `${API_BASE_URL}/api/customers`,
    CUSTOMERS_GET: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_CREATE: `${API_BASE_URL}/api/customers`,
    CUSTOMERS_UPDATE: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_DELETE: (id) => `${API_BASE_URL}/api/customers/${id}`,
    CUSTOMERS_BATCH: `${API_BASE_URL}/api/customers/batch`,

    // Transaction History (existing)
    TRANSACTIONS_BY_PHONE: (phone) => `https://chatomni-proxy.nhijudyshop.workers.dev/api/sepay/transactions-by-phone?phone=${encodeURIComponent(phone)}&limit=100`
};

// API Helper Functions with automatic fallback
const API = {
    /**
     * Check if should use PostgreSQL API
     */
    shouldUsePostgres() {
        return USE_POSTGRES_API && isAPIAvailable;
    },

    /**
     * Search customers
     */
    async searchCustomers(searchTerm, limit = 100, status = null) {
        // Check if API is available first
        if (!isAPIAvailable && USE_POSTGRES_API) {
            console.log('[API] PostgreSQL API not available, falling back to Firebase');
            return { success: false, fallback: true };
        }

        if (!this.shouldUsePostgres()) {
            // Use Firebase
            return { success: false, fallback: true };
        }

        const url = new URL(API_ENDPOINTS.CUSTOMERS_SEARCH);
        url.searchParams.set('q', searchTerm);
        url.searchParams.set('limit', limit);
        if (status) url.searchParams.set('status', status);

        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            if (!response.ok) {
                throw new Error(`Search failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Search error:', error.message);
            console.log('[API] Falling back to Firebase');
            return { success: false, fallback: true };
        }
    },

    /**
     * Get customer statistics
     */
    async getStats() {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        try {
            const response = await fetch(API_ENDPOINTS.CUSTOMERS_STATS, {
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Get stats failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Get stats error:', error.message);
            return { success: false, fallback: true };
        }
    },

    /**
     * Get paginated customer list
     */
    async getCustomers(page = 1, limit = 100, status = null) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        const url = new URL(API_ENDPOINTS.CUSTOMERS_LIST);
        url.searchParams.set('page', page);
        url.searchParams.set('limit', limit);
        if (status) url.searchParams.set('status', status);

        try {
            const response = await fetch(url, {
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Get customers failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Get customers error:', error.message);
            return { success: false, fallback: true };
        }
    },

    /**
     * Get single customer by ID
     */
    async getCustomer(id) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        try {
            const response = await fetch(API_ENDPOINTS.CUSTOMERS_GET(id), {
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                throw new Error(`Get customer failed: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Get customer error:', error.message);
            return { success: false, fallback: true };
        }
    },

    /**
     * Create new customer
     */
    async createCustomer(customerData) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        try {
            const response = await fetch(API_ENDPOINTS.CUSTOMERS_CREATE, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(customerData),
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Create customer failed');
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Create customer error:', error.message);
            return { success: false, fallback: true, error: error.message };
        }
    },

    /**
     * Update existing customer
     */
    async updateCustomer(id, customerData) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        try {
            const response = await fetch(API_ENDPOINTS.CUSTOMERS_UPDATE(id), {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(customerData),
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Update customer failed');
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Update customer error:', error.message);
            return { success: false, fallback: true, error: error.message };
        }
    },

    /**
     * Delete customer
     */
    async deleteCustomer(id, hardDelete = false) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        const url = new URL(API_ENDPOINTS.CUSTOMERS_DELETE(id));
        if (hardDelete) url.searchParams.set('hard_delete', 'true');

        try {
            const response = await fetch(url, {
                method: 'DELETE',
                signal: AbortSignal.timeout(10000)
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Delete customer failed');
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Delete customer error:', error.message);
            return { success: false, fallback: true, error: error.message };
        }
    },

    /**
     * Batch create customers
     */
    async batchCreateCustomers(customers) {
        if (!this.shouldUsePostgres()) {
            return { success: false, fallback: true };
        }

        try {
            const response = await fetch(API_ENDPOINTS.CUSTOMERS_BATCH, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ customers }),
                signal: AbortSignal.timeout(30000) // 30s for batch
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.message || 'Batch create failed');
            }

            return await response.json();
        } catch (error) {
            console.error('[API] Batch create error:', error.message);
            return { success: false, fallback: true, error: error.message };
        }
    }
};

/**
 * Enable PostgreSQL API (for testing when backend is ready)
 */
function enablePostgresAPI() {
    localStorage.setItem('use_postgres_api', 'true');
    console.log('[API-CONFIG] ✅ PostgreSQL API enabled - reload page to take effect');
    console.log('[API-CONFIG] Run: location.reload()');
}

/**
 * Disable PostgreSQL API (fallback to Firebase)
 */
function disablePostgresAPI() {
    localStorage.setItem('use_postgres_api', 'false');
    console.log('[API-CONFIG] ✅ Using Firebase (default) - reload page to take effect');
    console.log('[API-CONFIG] Run: location.reload()');
}

// Make available globally
if (typeof window !== 'undefined') {
    window.API_ENDPOINTS = API_ENDPOINTS;
    window.API = API;
    window.enablePostgresAPI = enablePostgresAPI;
    window.disablePostgresAPI = disablePostgresAPI;
    window.checkAPIHealth = checkAPIHealth;
}

// Export for modules
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { API_ENDPOINTS, API, enablePostgresAPI, disablePostgresAPI };
}

// Show current mode in console
console.log(`[API-CONFIG] Mode: ${USE_POSTGRES_API ? 'PostgreSQL (if available)' : 'Firebase'}`);
console.log('[API-CONFIG] To switch modes, run in console:');
console.log('  - enablePostgresAPI()  // Use PostgreSQL API');
console.log('  - disablePostgresAPI() // Use Firebase (default)');
