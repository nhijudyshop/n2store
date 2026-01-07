/**
 * Customer Service - API Layer
 * Handles all API calls to the backend
 */

const CustomerService = {
    /**
     * Make API request
     */
    async request(endpoint, options = {}) {
        const url = `${CONFIG.API_BASE_URL}${endpoint}`;
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json'
            }
        };

        try {
            const response = await fetch(url, { ...defaultOptions, ...options });
            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || data.message || 'API Error');
            }

            return data;
        } catch (error) {
            console.error('API Error:', error);
            throw error;
        }
    },

    // ========================
    // CUSTOMER APIs
    // ========================

    /**
     * Search customers
     */
    async searchCustomers(query, options = {}) {
        const params = new URLSearchParams({
            q: query || '',
            limit: options.limit || CONFIG.PAGE_SIZE,
            offset: options.offset || 0,
            status: options.status || ''
        });

        return this.request(`/customer/search?${params}`);
    },

    /**
     * Get customer by phone (360° view)
     */
    async getCustomer(phone) {
        return this.request(`/customer/${encodeURIComponent(phone)}`);
    },

    /**
     * Create customer
     */
    async createCustomer(data) {
        return this.request('/customer', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    /**
     * Update customer
     */
    async updateCustomer(phone, data) {
        return this.request(`/customer/${encodeURIComponent(phone)}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    /**
     * Get customer statistics
     */
    async getCustomerStats() {
        return this.request('/customer/stats');
    },

    /**
     * Get customer activities
     */
    async getCustomerActivities(phone, limit = 50) {
        return this.request(`/customer/${encodeURIComponent(phone)}/activities?limit=${limit}`);
    },

    /**
     * Add customer note
     */
    async addCustomerNote(phone, content, isImportant = false) {
        return this.request(`/customer/${encodeURIComponent(phone)}/note`, {
            method: 'POST',
            body: JSON.stringify({ content, is_important: isImportant })
        });
    },

    // ========================
    // WALLET APIs
    // ========================

    /**
     * Get wallet info
     */
    async getWallet(phone) {
        return this.request(`/wallet/${encodeURIComponent(phone)}`);
    },

    /**
     * Deposit to wallet
     */
    async deposit(phone, amount, note = '', reference = '') {
        return this.request(`/wallet/${encodeURIComponent(phone)}/deposit`, {
            method: 'POST',
            body: JSON.stringify({ amount, note, reference_code: reference })
        });
    },

    /**
     * Withdraw from wallet
     */
    async withdraw(phone, amount, note = '') {
        return this.request(`/wallet/${encodeURIComponent(phone)}/withdraw`, {
            method: 'POST',
            body: JSON.stringify({ amount, note })
        });
    },

    /**
     * Add virtual credit
     */
    async addVirtualCredit(phone, amount, reason, expiresAt = null) {
        return this.request(`/wallet/${encodeURIComponent(phone)}/virtual-credit`, {
            method: 'POST',
            body: JSON.stringify({ amount, reason, expires_at: expiresAt })
        });
    },

    /**
     * Get wallet transactions
     */
    async getTransactions(phone, limit = 50, offset = 0) {
        return this.request(`/customer/${encodeURIComponent(phone)}/transactions?limit=${limit}&offset=${offset}`);
    },

    // ========================
    // TICKET APIs
    // ========================

    /**
     * Get customer tickets
     */
    async getCustomerTickets(phone, limit = 50) {
        return this.request(`/customer/${encodeURIComponent(phone)}/tickets?limit=${limit}`);
    },

    /**
     * Create ticket
     */
    async createTicket(data) {
        return this.request('/ticket', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    /**
     * Get ticket by code
     */
    async getTicket(code) {
        return this.request(`/ticket/${encodeURIComponent(code)}`);
    },

    /**
     * Update ticket
     */
    async updateTicket(code, data) {
        return this.request(`/ticket/${encodeURIComponent(code)}`, {
            method: 'PUT',
            body: JSON.stringify(data)
        });
    },

    /**
     * Add ticket action (comment, status change, etc.)
     */
    async addTicketAction(code, actionType, data = {}) {
        return this.request(`/ticket/${encodeURIComponent(code)}/action`, {
            method: 'POST',
            body: JSON.stringify({ action: actionType, ...data })
        });
    },

    /**
     * Get ticket statistics
     */
    async getTicketStats() {
        return this.request('/ticket/stats');
    },

    // ========================
    // BATCH APIs
    // ========================

    /**
     * Get wallet summaries for multiple phones
     */
    async getWalletBatchSummary(phones) {
        return this.request('/wallet/batch-summary', {
            method: 'POST',
            body: JSON.stringify({ phones })
        });
    }
};

// Export for use in other modules
window.CustomerService = CustomerService;
