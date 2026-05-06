// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PRODUCT CODE GENERATOR
 * File: product-code-generator.js
 * Purpose: Auto-generate product codes using configurable prefix mapping.
 *
 * Source of truth: Render REST API (PostgreSQL).
 *   - Prefix rules:    GET  /api/v2/purchase-orders/code-rules    (admin_settings table)
 *   - Existing codes:  GET  /api/v2/purchase-orders/product-codes (purchase_orders.items[*])
 *
 * No Firestore dependency — config + data đều đọc qua API duy nhất.
 */

window.ProductCodeGenerator = (function () {
    'use strict';

    const API_BASE =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/purchase-orders';

    /**
     * Default prefix rules (used when API config not available)
     */
    const DEFAULT_PREFIX_RULES = [
        { match: 'MM', codePrefix: 'MM' },
        { match: 'HH', codePrefix: 'HH' },
        { match: 'B', codePrefix: 'B' },
        { match: 'S', codePrefix: 'S' },
        { match: 'C', codePrefix: 'C' },
    ];

    const DEFAULT_PREFIX = 'N';

    // ========================================
    // PREFIX RULES (config) — cached
    // ========================================
    let cachedConfig = null;

    async function loadPrefixConfig() {
        if (cachedConfig) return cachedConfig;

        try {
            const res = await fetch(`${API_BASE}/code-rules`);
            const data = await res.json();
            if (
                res.ok &&
                data &&
                data.success &&
                Array.isArray(data.rules) &&
                data.rules.length > 0
            ) {
                cachedConfig = {
                    rules: data.rules,
                    defaultPrefix: data.defaultPrefix || DEFAULT_PREFIX,
                };
                console.log(
                    '[ProductCodeGen] Loaded prefix rules from API:',
                    cachedConfig.rules.length,
                    'rules'
                );
                return cachedConfig;
            }
        } catch (e) {
            console.warn('[ProductCodeGen] Failed to load rules from API:', e.message);
        }

        cachedConfig = {
            rules: DEFAULT_PREFIX_RULES,
            defaultPrefix: DEFAULT_PREFIX,
        };
        console.log('[ProductCodeGen] Using default prefix rules');
        return cachedConfig;
    }

    /** Clear cached prefix-rules config (call after saving new rules) */
    function clearCache() {
        cachedConfig = null;
    }

    /**
     * Detect code prefix from product name using prefix rules
     * @param {string} productName
     * @param {Array} rules - Prefix rules array
     * @param {string} defaultPrefix - Fallback prefix when no rule matches
     * @returns {string|null}
     */
    function detectCodePrefix(productName, rules, defaultPrefix) {
        if (!productName || typeof productName !== 'string') return null;

        let name = productName.trim();
        if (!name) return null;

        // Extract supplier code prefix from product name (e.g., "2003 B5 SET ÁO" → "B" from B5)
        if (window.SupplierDetector && window.SupplierDetector.parseProductInfo) {
            const info = window.SupplierDetector.parseProductInfo(name);
            if (info.supplierCode) {
                return info.supplierCode.charAt(0).toUpperCase();
            }
        }

        // Fallback: try matching rules against clean product name
        const sorted = [...rules].sort((a, b) => b.match.length - a.match.length);

        for (const rule of sorted) {
            if (name.toLowerCase().startsWith(rule.match.toLowerCase())) {
                return rule.codePrefix;
            }
        }

        return defaultPrefix || DEFAULT_PREFIX;
    }

    /**
     * Get max number from form items
     * @param {Array} items - Form items
     * @param {string} prefix - Code prefix
     * @returns {number}
     */
    function getMaxNumberFromItems(items, prefix) {
        if (!items || !Array.isArray(items) || !prefix) return 0;

        const regex = new RegExp(`^${prefix}(\\d+)`, 'i');
        let maxNum = 0;

        for (const item of items) {
            const code = item.productCode || item.product_code || item._tempProductCode;
            if (code) {
                const match = code.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            }
        }

        return maxNum;
    }

    // ========================================
    // EXISTING CODES (from DB) — cached Set
    // ========================================
    let _codesCache = null;
    let _codesCacheTime = 0;
    const CACHE_TTL = 60000; // 60 seconds

    async function loadDbCodes() {
        if (_codesCache && Date.now() - _codesCacheTime < CACHE_TTL) {
            return _codesCache;
        }

        try {
            const res = await fetch(`${API_BASE}/product-codes`);
            const data = await res.json();
            if (!res.ok || !data || !data.success) {
                throw new Error(data?.error || `API error: ${res.status}`);
            }
            const codes = new Set();
            for (const c of data.codes || []) {
                if (typeof c === 'string' && c) codes.add(c.toUpperCase());
            }
            _codesCache = codes;
            _codesCacheTime = Date.now();
            console.log(
                `[ProductCodeGen] Cached ${_codesCache.size} product codes from DB`
            );
            return _codesCache;
        } catch (e) {
            console.warn('[ProductCodeGen] Failed to load codes from DB:', e.message);
            return new Set();
        }
    }

    /** Force-reload DB codes Set on next call (use after creating/updating an order) */
    function invalidateCodesCache() {
        _codesCache = null;
        _codesCacheTime = 0;
    }

    /**
     * Get max number from DB (purchase_orders.items[*].productCode)
     * Uses cached Set to avoid repeated full-collection loads.
     * @param {string} prefix
     * @returns {Promise<number>}
     */
    async function getMaxNumberFromDb(prefix) {
        try {
            const codes = await loadDbCodes();
            const upperPrefix = prefix.toUpperCase();
            const regex = new RegExp(`^${upperPrefix}(\\d+)`, 'i');
            let maxNum = 0;

            for (const code of codes) {
                const match = code.match(regex);
                if (match) {
                    const num = parseInt(match[1], 10);
                    if (num > maxNum) maxNum = num;
                }
            }

            console.log(`[ProductCodeGen] DB max for ${upperPrefix}: ${maxNum}`);
            return maxNum;
        } catch (error) {
            console.error('[ProductCodeGen] Error getting max number from DB:', error);
            return 0;
        }
    }

    /**
     * Get max number from TPOS via TPOSClient.getMaxProductCode
     * @param {string} prefix
     * @returns {Promise<number>}
     */
    async function getMaxNumberFromTPOS(prefix) {
        try {
            if (!window.TPOSClient || !window.TPOSClient.getMaxProductCode) return 0;
            return await window.TPOSClient.getMaxProductCode(prefix);
        } catch (error) {
            console.error('[ProductCodeGen] Error getting max number from TPOS:', error);
            return 0;
        }
    }

    /**
     * Check if product code exists in form items
     * @param {string} code
     * @param {Array} items
     * @returns {boolean}
     */
    function codeExistsInItems(code, items) {
        if (!code || !items) return false;
        const upperCode = code.toUpperCase();
        return items.some((item) => {
            const itemCode = (
                item.productCode ||
                item.product_code ||
                item._tempProductCode ||
                ''
            ).toUpperCase();
            return itemCode === upperCode;
        });
    }

    /**
     * Check if product code exists in DB (cached Set lookup)
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsInDb(code) {
        try {
            const codes = await loadDbCodes();
            return codes.has(code.toUpperCase());
        } catch (error) {
            console.error('[ProductCodeGen] Error checking code in DB:', error);
            return false;
        }
    }

    /**
     * Check if product code exists on TPOS
     * @param {string} code
     * @returns {Promise<boolean>}
     */
    async function codeExistsOnTPOS(code) {
        try {
            if (!window.TPOSClient || !window.TPOSClient.searchProduct) return false;
            const result = await window.TPOSClient.searchProduct(code);
            return result && result.length > 0;
        } catch (error) {
            console.error('[ProductCodeGen] Error checking code on TPOS:', error);
            return false;
        }
    }

    /**
     * Generate product code from max number using prefix rules
     * @param {string} productName
     * @param {Array} existingItems - Form items to check against
     * @param {number} maxAttempts
     * @returns {Promise<string|null>}
     */
    async function generateProductCodeFromMax(productName, existingItems = [], maxAttempts = 30) {
        const config = await loadPrefixConfig();

        const codePrefix = detectCodePrefix(productName, config.rules, config.defaultPrefix);
        if (!codePrefix) {
            console.warn('[ProductCodeGen] Could not detect code prefix for:', productName);
            return null;
        }

        const [maxFromDb, maxFromTPOS] = await Promise.all([
            getMaxNumberFromDb(codePrefix),
            getMaxNumberFromTPOS(codePrefix),
        ]);
        const maxFromItems = getMaxNumberFromItems(existingItems, codePrefix);
        const maxNumber = Math.max(maxFromItems, maxFromDb, maxFromTPOS);
        console.log(
            `[ProductCodeGen] Max for ${codePrefix}: form=${maxFromItems}, db=${maxFromDb}, tpos=${maxFromTPOS} → next=${maxNumber + 1}`
        );

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const number = maxNumber + attempt;
            const candidateCode = `${codePrefix}${number}`;

            if (codeExistsInItems(candidateCode, existingItems)) continue;
            if (await codeExistsInDb(candidateCode)) continue;
            if (await codeExistsOnTPOS(candidateCode)) continue;

            return candidateCode;
        }

        console.warn(
            `[ProductCodeGen] Failed to generate code after ${maxAttempts} attempts for:`,
            productName
        );
        return null;
    }

    /**
     * Generate product code from a custom prefix (e.g., "MM" → MM01, MM02, ...)
     * @param {string} prefix
     * @param {Array} existingItems
     * @param {number} maxAttempts
     * @returns {Promise<string|null>}
     */
    async function generateCodeWithPrefix(prefix, existingItems = [], maxAttempts = 30) {
        if (!prefix || typeof prefix !== 'string') return null;

        const upperPrefix = prefix.toUpperCase();

        const [maxFromDb, maxFromTPOS] = await Promise.all([
            getMaxNumberFromDb(upperPrefix),
            getMaxNumberFromTPOS(upperPrefix),
        ]);
        const maxFromItems = getMaxNumberFromItems(existingItems, upperPrefix);
        const maxNumber = Math.max(maxFromItems, maxFromDb, maxFromTPOS);
        console.log(
            `[ProductCodeGen] Prefix "${upperPrefix}" max: form=${maxFromItems}, db=${maxFromDb}, tpos=${maxFromTPOS} → next=${maxNumber + 1}`
        );

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            const number = maxNumber + attempt;
            const candidateCode = `${upperPrefix}${number}`;

            if (codeExistsInItems(candidateCode, existingItems)) continue;
            if (await codeExistsInDb(candidateCode)) continue;
            if (await codeExistsOnTPOS(candidateCode)) continue;

            return candidateCode;
        }

        console.warn(
            `[ProductCodeGen] Failed to generate code with prefix "${upperPrefix}" after ${maxAttempts} attempts`
        );
        return null;
    }

    function isPurePrefix(str) {
        return /^[A-Za-z]{2,}$/.test(str?.trim());
    }

    /**
     * Simple synchronous code generation (without DB checks) — uses cached rules if available
     */
    function generateProductCodeSync(productName, existingItems = []) {
        const config = cachedConfig || {
            rules: DEFAULT_PREFIX_RULES,
            defaultPrefix: DEFAULT_PREFIX,
        };
        const codePrefix = detectCodePrefix(productName, config.rules, config.defaultPrefix);
        if (!codePrefix) return null;

        const maxFromItems = getMaxNumberFromItems(existingItems, codePrefix);
        const number = maxFromItems + 1;
        return `${codePrefix}${number}`;
    }

    /**
     * Extract base product code from variant code: "N123VX" → "N123", "P045-01" → "P045"
     */
    function extractBaseProductCode(code) {
        if (!code || typeof code !== 'string') return '';
        const match = code.match(/^([A-Z]+\d+)/i);
        return match ? match[1].toUpperCase() : code.toUpperCase();
    }

    function isValidProductCode(code) {
        if (!code || typeof code !== 'string') return false;
        return /^[A-Z]+\d{1,}[A-Z0-9]*$/i.test(code.trim());
    }

    return {
        // Prefix rules / detection
        detectCodePrefix,
        loadPrefixConfig,
        clearCache,
        // Max number sources
        getMaxNumberFromItems,
        getMaxNumberFromDb,
        getMaxNumberFromTPOS,
        // Generators
        generateProductCodeFromMax,
        generateCodeWithPrefix,
        generateProductCodeSync,
        // Existence checks
        codeExistsInItems,
        codeExistsInDb,
        codeExistsOnTPOS,
        // Cache control
        invalidateCodesCache,
        // Utils
        isPurePrefix,
        extractBaseProductCode,
        isValidProductCode,
        // Constants for reference
        DEFAULT_PREFIX_RULES,
        DEFAULT_PREFIX,
    };
})();
