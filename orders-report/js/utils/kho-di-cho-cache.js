/**
 * Kho Di Cho Cache - Pre-loads product STT data for bill generation
 * Used by BillService to append kho đi chợ STT numbers to product names on bills
 */
const KhoDiChoCache = (function () {
    const API_URL =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/kho-di-cho?limit=1000&sort_by=stt&sort_order=ASC';
    const LS_KEY = 'khoDiChoCache';
    const LS_TIMESTAMP_KEY = 'khoDiChoCacheTimestamp';
    const CACHE_TTL = 30 * 60 * 1000; // 30 minutes

    // Map<normalizedProductCode, stt>
    let _sttMap = new Map();
    let _loaded = false;
    let _loading = null; // Promise deduplication

    /**
     * Normalize product code for matching:
     * "[B211A3]" -> "B211A3", "b211a3" -> "B211A3"
     */
    function normalizeCode(code) {
        if (!code) return '';
        return code.replace(/[\[\]]/g, '').trim().toUpperCase();
    }

    /**
     * Extract product code from ProductNameGet: "[CODE] Name..." -> "CODE"
     */
    function extractCodeFromName(productName) {
        if (!productName) return '';
        const match = productName.match(/\[([^\]]+)\]/);
        return match ? match[1].trim().toUpperCase() : '';
    }

    /**
     * Build the STT map from API response data
     */
    function buildMap(data) {
        _sttMap.clear();
        if (!Array.isArray(data)) return;

        data.forEach((item) => {
            if (item.product_code && item.stt != null) {
                const key = normalizeCode(item.product_code);
                _sttMap.set(key, item.stt);
            }
        });

        _loaded = true;
    }

    /**
     * Save to localStorage for offline fallback
     */
    function saveToLocalStorage(data) {
        try {
            localStorage.setItem(LS_KEY, JSON.stringify(data));
            localStorage.setItem(LS_TIMESTAMP_KEY, String(Date.now()));
        } catch (e) {
            console.warn('[KHO-DI-CHO-CACHE] localStorage save failed:', e.message);
        }
    }

    /**
     * Load from localStorage (offline fallback)
     */
    function loadFromLocalStorage() {
        try {
            const timestamp = parseInt(localStorage.getItem(LS_TIMESTAMP_KEY) || '0');
            const data = localStorage.getItem(LS_KEY);
            if (data && Date.now() - timestamp < CACHE_TTL) {
                buildMap(JSON.parse(data));
                return true;
            }
        } catch (e) {
            console.warn('[KHO-DI-CHO-CACHE] localStorage load failed:', e.message);
        }
        return false;
    }

    /**
     * Fetch data from API and build cache
     */
    async function load() {
        if (_loading) return _loading;

        _loading = (async () => {
            try {
                const res = await fetch(API_URL);
                const json = await res.json();

                if (json.success && Array.isArray(json.data)) {
                    buildMap(json.data);
                    saveToLocalStorage(json.data);
                } else {
                    console.warn('[KHO-DI-CHO-CACHE] API returned no data, trying localStorage');
                    loadFromLocalStorage();
                }
            } catch (err) {
                console.warn('[KHO-DI-CHO-CACHE] API fetch failed:', err.message);
                loadFromLocalStorage();
            } finally {
                _loading = null;
            }
        })();

        return _loading;
    }

    /**
     * Get STT for a product (SYNCHRONOUS - for use in bill generation)
     * @param {Object} orderLineItem - Order line with ProductCode, ProductNameGet, etc.
     * @returns {number} STT number, or 0 if not found
     */
    function getSTT(orderLineItem) {
        if (!_loaded || _sttMap.size === 0) return 0;

        // Try ProductCode first (bare code like "B211A3")
        const productCode =
            orderLineItem.ProductCode || orderLineItem.Product?.DefaultCode || '';
        if (productCode) {
            const normalized = normalizeCode(productCode);
            if (_sttMap.has(normalized)) {
                return _sttMap.get(normalized);
            }
        }

        // Fallback: extract code from ProductNameGet "[B211A3] Name..."
        const nameGet = orderLineItem.ProductNameGet || orderLineItem.ProductName || '';
        const extractedCode = extractCodeFromName(nameGet);
        if (extractedCode && _sttMap.has(extractedCode)) {
            return _sttMap.get(extractedCode);
        }

        return 0;
    }

    /**
     * Check if cache is loaded
     */
    function isLoaded() {
        return _loaded && _sttMap.size > 0;
    }

    /**
     * Force refresh cache
     */
    async function refresh() {
        _loaded = false;
        _sttMap.clear();
        return load();
    }

    return {
        load,
        getSTT,
        isLoaded,
        refresh,
        get size() {
            return _sttMap.size;
        },
    };
})();

// Expose globally
window.KhoDiChoCache = KhoDiChoCache;

// Auto-load on script load (non-blocking)
KhoDiChoCache.load();

