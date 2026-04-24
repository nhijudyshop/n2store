// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Sale Flag Store
 *
 * Per-product-line boolean flag: sale nhan viên tự đánh dấu SP nào là
 * "bán hàng thật" để tính KPI. Không có flag hoặc flag=false → SP bỏ qua
 * khi tính KPI (áp dụng cho orders có BASE tạo sau KPI_SALE_FLAG_EFFECTIVE_FROM).
 *
 * Storage: PostgreSQL qua `/api/realtime/kpi-sale-flag` (bảng kpi_sale_flag).
 *
 * Cache: in-memory per orderCode để UI không phải GET lại mỗi lần render.
 * Sau mỗi set thành công: emit event 'kpi-sale-flag-changed' để UI refresh
 * và tự trigger window.KPIManager.recalculateAndSaveKPI(orderCode).
 */

(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

    // _cache: orderCode (string) -> Map<productIdString, boolean>
    // _loading: orderCode -> Promise (để tránh GET trùng lặp song song)
    const _cache = new Map();
    const _loading = new Map();

    function getCurrentUserInfo() {
        try {
            if (window.authManager) {
                const auth = window.authManager.getAuthState?.() || window.authManager.getUserInfo?.();
                if (auth) {
                    return {
                        userId: auth.id || auth.Id || auth.uid || auth.username || 'unknown',
                        userName: auth.displayName || auth.name || auth.username || 'Unknown'
                    };
                }
            }
        } catch (e) {}
        return { userId: 'unknown', userName: 'Unknown' };
    }

    async function apiFetch(method, path, body) {
        const opts = { method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        const res = await fetch(`${API_BASE}${path}`, opts);
        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`KPI Sale Flag API ${method} ${path}: ${res.status} ${text}`);
        }
        return res.json();
    }

    /**
     * Load flags cho một orderCode từ server. Cache kết quả.
     * Nếu đang load → trả về promise đang pending (dedupe).
     *
     * @param {string} orderCode
     * @param {{force?: boolean}} [opts] force=true để bỏ qua cache
     * @returns {Promise<Map<string, boolean>>}
     */
    async function load(orderCode, opts = {}) {
        if (!orderCode) return new Map();
        if (!opts.force && _cache.has(orderCode)) return _cache.get(orderCode);
        if (_loading.has(orderCode)) return _loading.get(orderCode);

        const p = (async () => {
            try {
                const resp = await apiFetch('GET', `/kpi-sale-flag/${encodeURIComponent(orderCode)}`);
                const map = new Map();
                for (const f of resp.flags || []) {
                    map.set(String(f.productId), f.isSaleProduct === true);
                }
                _cache.set(orderCode, map);
                return map;
            } catch (e) {
                console.warn('[KPI-SaleFlag] load failed:', e?.message);
                // Trả về Map rỗng — KPI calc sẽ default FALSE cho post-cutoff orders
                const empty = new Map();
                _cache.set(orderCode, empty);
                return empty;
            } finally {
                _loading.delete(orderCode);
            }
        })();
        _loading.set(orderCode, p);
        return p;
    }

    /**
     * Đọc flag đã cache (đồng bộ). Trả về false nếu chưa load hoặc không có.
     * Caller nên gọi load() trước render.
     *
     * @param {string} orderCode
     * @param {number|string} productId
     * @returns {boolean}
     */
    function get(orderCode, productId) {
        if (!orderCode || productId == null) return false;
        const map = _cache.get(orderCode);
        if (!map) return false;
        return map.get(String(productId)) === true;
    }

    /**
     * Đọc toàn bộ flags của orderCode đã cache (đồng bộ).
     * @returns {Map<string, boolean>}
     */
    function getAll(orderCode) {
        if (!orderCode) return new Map();
        return _cache.get(orderCode) || new Map();
    }

    /**
     * Upsert flag cho (orderCode, productId). Optimistic cache update,
     * roll back nếu server lỗi. Sau khi thành công:
     *   1. emit event 'kpi-sale-flag-changed' với detail {orderCode, productId, isSale}
     *   2. auto-trigger window.KPIManager.recalculateAndSaveKPI(orderCode)
     *
     * @param {string} orderCode
     * @param {number} productId
     * @param {boolean} isSale
     * @returns {Promise<boolean>} success
     */
    async function set(orderCode, productId, isSale) {
        if (!orderCode) throw new Error('orderCode required');
        const pid = Number(productId);
        if (!Number.isFinite(pid) || pid <= 0) throw new Error('productId must be positive number');
        const bool = isSale === true;

        // Optimistic cache update
        let map = _cache.get(orderCode);
        if (!map) {
            map = new Map();
            _cache.set(orderCode, map);
        }
        const prev = map.get(String(pid));
        map.set(String(pid), bool);

        const user = getCurrentUserInfo();
        try {
            await apiFetch(
                'PUT',
                `/kpi-sale-flag/${encodeURIComponent(orderCode)}/${pid}`,
                { isSaleProduct: bool, userId: user.userId, userName: user.userName }
            );
        } catch (e) {
            // Rollback cache
            if (prev === undefined) map.delete(String(pid));
            else map.set(String(pid), prev);
            console.error('[KPI-SaleFlag] set failed:', e?.message);
            throw e;
        }

        // Notify UI listeners (table row, badge, etc.)
        try {
            window.dispatchEvent(new CustomEvent('kpi-sale-flag-changed', {
                detail: { orderCode, productId: pid, isSale: bool }
            }));
        } catch (e) {}

        // Auto recalc KPI cho order này
        try {
            if (window.KPIManager && typeof window.KPIManager.recalculateAndSaveKPI === 'function') {
                // Không await — UI không phải chờ recalc. Recalc sẽ update statistics + badge async.
                window.KPIManager.recalculateAndSaveKPI(orderCode).catch((err) => {
                    console.warn('[KPI-SaleFlag] recalc after toggle failed:', err?.message);
                });
            }
        } catch (e) {
            console.warn('[KPI-SaleFlag] recalc trigger failed:', e?.message);
        }

        return true;
    }

    /**
     * Clear cache cho một orderCode (để force reload lần tới).
     * @param {string} orderCode
     */
    function invalidate(orderCode) {
        if (!orderCode) return;
        _cache.delete(orderCode);
        _loading.delete(orderCode);
    }

    /**
     * Clear toàn bộ cache.
     */
    function invalidateAll() {
        _cache.clear();
        _loading.clear();
    }

    window.KpiSaleFlagStore = {
        load,
        get,
        getAll,
        set,
        invalidate,
        invalidateAll,
    };
})();
