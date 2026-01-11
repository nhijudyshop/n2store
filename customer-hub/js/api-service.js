// customer-hub/js/api-service.js

const API_BASE_URL = '/api'; // Assuming API is relative to the current host

async function fetchJson(url, options = {}) {
    try {
        const response = await fetch(url, {
            ...options,
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ message: response.statusText }));
            throw new Error(errorData.error || errorData.message || `API error: ${response.status}`);
        }

        return await response.json();
    } catch (error) {
        console.error('API Service Error:', error);
        throw error; // Re-throw to allow calling code to handle
    }
}

const apiService = {
    // --- Customer Endpoints ---
    getCustomer360: async (phone) => {
        return fetchJson(`${API_BASE_URL}/customer/${phone}`);
    },
    searchCustomers: async (query, limit = 50) => {
        return fetchJson(`${API_BASE_URL}/customer-search-v2`, {
            method: 'POST',
            body: JSON.stringify({ query, limit })
        });
    },
    addCustomerNote: async (phone, content, category, is_pinned, created_by) => {
        return fetchJson(`${API_BASE_URL}/customer/${phone}/note`, {
            method: 'POST',
            body: JSON.stringify({ content, category, is_pinned, created_by })
        });
    },
    // --- Bank Transaction Endpoints ---
    getUnlinkedBankTransactions: async (page = 1, limit = 10) => {
        return fetchJson(`${API_BASE_URL}/balance-history/unlinked?page=${page}&limit=${limit}`);
    },
    linkBankTransaction: async (transaction_id, phone, auto_deposit) => {
        return fetchJson(`${API_BASE_URL}/balance-history/link-customer`, {
            method: 'POST',
            body: JSON.stringify({ transaction_id, phone, auto_deposit })
        });
    },
    // --- Consolidated Transactions/Activities ---
    getConsolidatedTransactions: async (page = 1, limit = 10, filters = {}) => {
        const queryParams = new URLSearchParams({ page, limit, ...filters }).toString();
        return fetchJson(`${API_BASE_URL}/transactions/consolidated?${queryParams}`);
    }
};

export default apiService;
