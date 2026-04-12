// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Debt Manager for TPOS-Pancake
 * Unified debt/wallet loading used by both TPOS and Pancake columns
 */

class DebtManager {
    constructor() {
        this._cache = new SharedCache({
            maxSize: 500,
            ttl: 10 * 60 * 1000,
            name: 'DebtCache'
        });
        this._pendingFetches = new Map(); // phone -> Promise (dedup concurrent requests)
        this._proxyBaseUrl = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    }

    /**
     * Get cached debt for a phone number
     * @param {string} phone - Raw or normalized phone
     * @returns {number|null}
     */
    getDebt(phone) {
        const normalized = SharedUtils.normalizePhone(phone);
        if (!normalized) return null;
        return this._cache.get(normalized);
    }

    /**
     * Set debt in cache
     * @param {string} phone
     * @param {number} amount
     */
    setDebt(phone, amount) {
        const normalized = SharedUtils.normalizePhone(phone);
        if (normalized) {
            this._cache.set(normalized, amount);
        }
    }

    /**
     * Load debt for a batch of phone numbers via wallet API
     * Skips phones already in cache
     * @param {string[]} phones - Array of phone numbers
     * @returns {Promise<Map<string, number>>} phone -> debt amount
     */
    async loadBatch(phones) {
        const results = new Map();
        const toFetch = [];

        for (const phone of phones) {
            const normalized = SharedUtils.normalizePhone(phone);
            if (!normalized) continue;

            const cached = this._cache.get(normalized);
            if (cached !== null) {
                results.set(normalized, cached);
            } else {
                toFetch.push(normalized);
            }
        }

        if (toFetch.length === 0) return results;

        const uniquePhones = [...new Set(toFetch)];

        try {
            const response = await fetch(`${this._proxyBaseUrl}/api/v2/wallets/batch-summary`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phones: uniquePhones })
            });

            if (!response.ok) {
                console.warn('[DebtManager] Wallet API error:', response.status);
                return results;
            }

            const result = await response.json();
            if (result.success && result.data) {
                for (const [phone, walletData] of Object.entries(result.data)) {
                    const normalized = SharedUtils.normalizePhone(phone);
                    const amount = walletData.total || 0;
                    this._cache.set(normalized, amount);
                    results.set(normalized, amount);
                }
            }
        } catch (error) {
            console.warn('[DebtManager] Error loading debt batch:', error);
        }

        return results;
    }

    /**
     * Load debt for a single phone number (with dedup)
     * @param {string} phone
     * @returns {Promise<number|null>}
     */
    async loadSingle(phone) {
        const normalized = SharedUtils.normalizePhone(phone);
        if (!normalized) return null;

        const cached = this._cache.get(normalized);
        if (cached !== null) return cached;

        // Dedup: if already fetching this phone, return the same promise
        if (this._pendingFetches.has(normalized)) {
            return this._pendingFetches.get(normalized);
        }

        const promise = this.loadBatch([normalized]).then(results => {
            this._pendingFetches.delete(normalized);
            return results.get(normalized) ?? null;
        });

        this._pendingFetches.set(normalized, promise);
        return promise;
    }

    /**
     * Format debt badge HTML
     * @param {number|null} amount
     * @param {object} [options]
     * @param {boolean} [options.showZero=false] - Show badge when debt is 0
     * @returns {string} HTML string
     */
    formatBadge(amount, options = {}) {
        if (amount === null || amount === undefined) return '';
        if (amount === 0 && !options.showZero) return '';

        const isPositive = amount > 0;
        const color = isPositive ? '#ef4444' : '#22c55e';
        const text = SharedUtils.formatDebt(amount);

        return `<span class="debt-badge" style="color:${color};font-size:11px;font-weight:600">${text}</span>`;
    }

    /**
     * Start periodic cache cleanup
     */
    startCleanup() {
        this._cache.startCleanup();
    }

    /**
     * Clear all cached debt data
     */
    clear() {
        this._cache.clear();
        this._pendingFetches.clear();
    }

    /**
     * Destroy manager
     */
    destroy() {
        this._cache.destroy();
        this._pendingFetches.clear();
    }
}

// Export singleton
if (typeof window !== 'undefined') {
    window.DebtManager = DebtManager;
    window.sharedDebtManager = new DebtManager();
}
