// =====================================================
// CUSTOMER INFO MANAGER
// =====================================================

/**
 * Manages customer information associated with QR codes/unique transaction codes
 * Stores data in localStorage for persistence
 */

const CustomerInfoManager = {
    STORAGE_KEY: 'balance_history_customer_info',
    API_BASE_URL: null, // Will be set from CONFIG

    /**
     * Initialize the manager
     */
    init() {
        this.API_BASE_URL = window.CONFIG?.API_BASE_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        // Load data from database on init
        this.syncFromDatabase();
    },

    /**
     * Sync customer info from database to localStorage
     */
    async syncFromDatabase() {
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`);
            const result = await response.json();

            if (result.success && result.data) {
                // Convert array to object keyed by unique_code
                const customerData = {};
                result.data.forEach(item => {
                    customerData[item.unique_code] = {
                        name: item.customer_name || '',
                        phone: item.customer_phone || '',
                        updatedAt: item.updated_at
                    };
                });

                // Save to localStorage
                this.saveAllCustomerInfo(customerData);
                console.log('[CUSTOMER-INFO] ✅ Synced from database:', Object.keys(customerData).length, 'records');
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Failed to sync from database:', error);
        }
    },

    /**
     * Get all customer info from storage
     * @returns {Object} Customer info object keyed by unique code
     */
    getAllCustomerInfo() {
        try {
            const data = localStorage.getItem(this.STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch (error) {
            console.error('Error loading customer info:', error);
            return {};
        }
    },

    /**
     * Save all customer info to storage
     * @param {Object} data - Customer info object
     */
    saveAllCustomerInfo(data) {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
            return true;
        } catch (error) {
            console.error('Error saving customer info:', error);
            return false;
        }
    },

    /**
     * Get customer info by unique code
     * @param {string} uniqueCode - The QR unique code
     * @returns {Object|null} Customer info or null if not found
     */
    getCustomerInfo(uniqueCode) {
        if (!uniqueCode) return null;

        const allData = this.getAllCustomerInfo();
        return allData[uniqueCode] || null;
    },

    /**
     * Save or update customer info for a unique code
     * @param {string} uniqueCode - The QR unique code
     * @param {Object} customerInfo - Customer information
     * @param {string} customerInfo.name - Customer name
     * @param {string} customerInfo.phone - Customer phone
     * @returns {boolean} Success status
     */
    async saveCustomerInfo(uniqueCode, customerInfo) {
        if (!uniqueCode) return false;

        // Save to localStorage first (for offline support)
        const allData = this.getAllCustomerInfo();
        allData[uniqueCode] = {
            name: customerInfo.name || '',
            phone: customerInfo.phone || '',
            updatedAt: new Date().toISOString()
        };
        this.saveAllCustomerInfo(allData);

        // Then save to database via API
        try {
            const response = await fetch(`${this.API_BASE_URL}/api/sepay/customer-info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    uniqueCode: uniqueCode,
                    customerName: customerInfo.name || '',
                    customerPhone: customerInfo.phone || ''
                })
            });

            const result = await response.json();

            if (result.success) {
                console.log('[CUSTOMER-INFO] ✅ Saved to database:', uniqueCode);
                return true;
            } else {
                console.error('[CUSTOMER-INFO] Failed to save to database:', result.error);
                return false;
            }
        } catch (error) {
            console.error('[CUSTOMER-INFO] Error saving to database:', error);
            // Still return true since we saved to localStorage
            return true;
        }
    },

    /**
     * Update customer info fields
     * @param {string} uniqueCode - The QR unique code
     * @param {Object} updates - Fields to update
     * @returns {boolean} Success status
     */
    updateCustomerInfo(uniqueCode, updates) {
        if (!uniqueCode) return false;

        const allData = this.getAllCustomerInfo();
        const existing = allData[uniqueCode] || {};

        allData[uniqueCode] = {
            ...existing,
            ...updates,
            updatedAt: new Date().toISOString()
        };

        return this.saveAllCustomerInfo(allData);
    },

    /**
     * Delete customer info
     * @param {string} uniqueCode - The QR unique code
     * @returns {boolean} Success status
     */
    deleteCustomerInfo(uniqueCode) {
        if (!uniqueCode) return false;

        const allData = this.getAllCustomerInfo();
        delete allData[uniqueCode];

        return this.saveAllCustomerInfo(allData);
    },

    /**
     * Check if customer info exists for a unique code
     * @param {string} uniqueCode - The QR unique code
     * @returns {boolean} True if customer info exists
     */
    hasCustomerInfo(uniqueCode) {
        if (!uniqueCode) return false;

        const allData = this.getAllCustomerInfo();
        return !!allData[uniqueCode];
    },

    /**
     * Get formatted customer display string
     * @param {string} uniqueCode - The QR unique code
     * @returns {Object} Display strings for name and phone
     */
    getCustomerDisplay(uniqueCode) {
        const info = this.getCustomerInfo(uniqueCode);

        if (!info || (!info.name && !info.phone)) {
            return {
                name: 'Chưa có thông tin',
                phone: 'Chưa có thông tin',
                hasInfo: false
            };
        }

        return {
            name: info.name || 'Chưa có thông tin',
            phone: info.phone || 'Chưa có thông tin',
            hasInfo: true
        };
    },

    /**
     * Search customers by name or phone
     * @param {string} query - Search query
     * @returns {Array} Array of matching customers with their unique codes
     */
    searchCustomers(query) {
        if (!query) return [];

        const allData = this.getAllCustomerInfo();
        const results = [];
        const lowerQuery = query.toLowerCase();

        for (const [uniqueCode, info] of Object.entries(allData)) {
            if (
                info.name?.toLowerCase().includes(lowerQuery) ||
                info.phone?.includes(query)
            ) {
                results.push({
                    uniqueCode,
                    name: info.name,
                    phone: info.phone,
                    updatedAt: info.updatedAt
                });
            }
        }

        return results;
    },

    /**
     * Export all customer data as JSON
     * @returns {string} JSON string of all customer data
     */
    exportCustomerData() {
        const allData = this.getAllCustomerInfo();
        return JSON.stringify(allData, null, 2);
    },

    /**
     * Import customer data from JSON
     * @param {string} jsonString - JSON string to import
     * @returns {boolean} Success status
     */
    importCustomerData(jsonString) {
        try {
            const data = JSON.parse(jsonString);
            return this.saveAllCustomerInfo(data);
        } catch (error) {
            console.error('Error importing customer data:', error);
            return false;
        }
    },

    /**
     * Get statistics about stored customer info
     * @returns {Object} Statistics
     */
    getStatistics() {
        const allData = this.getAllCustomerInfo();
        const total = Object.keys(allData).length;
        let withName = 0;
        let withPhone = 0;
        let withBoth = 0;

        for (const info of Object.values(allData)) {
            if (info.name) withName++;
            if (info.phone) withPhone++;
            if (info.name && info.phone) withBoth++;
        }

        return {
            total,
            withName,
            withPhone,
            withBoth,
            incomplete: total - withBoth
        };
    }
};

// Make CustomerInfoManager globally available
window.CustomerInfoManager = CustomerInfoManager;
