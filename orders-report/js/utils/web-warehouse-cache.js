// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web Warehouse Cache - Pre-loads product STT data for bill generation
 * Used by BillService to append warehouse STT numbers to product names on bills
 */
const WebWarehouseCache = (function () {
    const API_URL =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/v2/web-warehouse?limit=1000&sort_by=stt&sort_order=ASC';
    const LS_KEY = 'webWarehouseCache';
    const LS_TIMESTAMP_KEY = 'webWarehouseCacheTimestamp';
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
        return code
            .replace(/[\[\]]/g, '')
            .trim()
            .toUpperCase();
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
            console.warn('[WEB-WAREHOUSE-CACHE] localStorage save failed:', e.message);
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
            console.warn('[WEB-WAREHOUSE-CACHE] localStorage load failed:', e.message);
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
                    console.warn('[WEB-WAREHOUSE-CACHE] API returned no data, trying localStorage');
                    loadFromLocalStorage();
                }
            } catch (err) {
                console.warn('[WEB-WAREHOUSE-CACHE] API fetch failed:', err.message);
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
        const productCode = orderLineItem.ProductCode || orderLineItem.Product?.DefaultCode || '';
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

    // =====================================================
    // SSE REAL-TIME INVALIDATION
    // Auto-refresh cache when TPOS sync lands in Render DB
    // =====================================================
    const SSE_URL =
        'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime/sse?keys=web_warehouse';
    let _sseSource = null;
    let _refreshDebounce = null;

    function _scheduleRefresh() {
        if (_refreshDebounce) clearTimeout(_refreshDebounce);
        _refreshDebounce = setTimeout(() => {
            console.log('[WEB-WAREHOUSE-CACHE] SSE triggered refresh');
            refresh().catch((e) =>
                console.warn('[WEB-WAREHOUSE-CACHE] Refresh failed:', e.message)
            );
        }, 3000);
    }

    function setupSSE() {
        if (typeof EventSource === 'undefined') return;
        if (_sseSource) return;

        try {
            _sseSource = new EventSource(SSE_URL);
            const handle = () => _scheduleRefresh();
            _sseSource.addEventListener('update', handle);
            _sseSource.addEventListener('deleted', handle);
            _sseSource.onerror = () => {
                // Browser auto-reconnects; just log
                console.warn('[WEB-WAREHOUSE-CACHE] SSE disconnected, auto-reconnect…');
            };
        } catch (e) {
            console.warn('[WEB-WAREHOUSE-CACHE] SSE setup failed:', e.message);
        }
    }

    return {
        load,
        getSTT,
        isLoaded,
        refresh,
        setupSSE,
        get size() {
            return _sttMap.size;
        },
    };
})();

// Expose globally
window.WebWarehouseCache = WebWarehouseCache;
window.KhoDiChoCache = WebWarehouseCache; // backward compat

// Auto-load on script load (non-blocking)
WebWarehouseCache.load();

// Auto-subscribe to SSE so cache invalidates when TPOS syncs update Render DB
WebWarehouseCache.setupSSE();
