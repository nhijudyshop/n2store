// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * KPI Livestream Flag Store (cột "BH" / Bán hàng livestream)
 *
 * Per-product-line boolean flag: nhân viên tự đánh dấu SP nào "bán thêm trong
 * livestream". Tách HOÀN TOÀN khỏi KpiSaleFlagStore (KPI thường) — feature riêng.
 * BH KHÔNG cộng tiền KPI, KHÔNG trigger kpiManager.recalculateAndSaveKPI.
 * Loại trừ lẫn nhau với KPI flag ở tầng UI (modal Sửa đơn hàng).
 *
 * Storage: PostgreSQL qua `/api/realtime/kpi-livestream-flag` (bảng kpi_livestream_flag).
 * set() lưu kèm snapshot (product_name, quantity, campaign, ...) để tab KPI Livestream
 * self-contained.
 *
 * Cache: in-memory per orderCode. Sau mỗi set() thành công: emit event
 * 'kpi-livestream-flag-changed' để UI refresh.
 */

(function () {
    'use strict';

    const API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/realtime';

    // _cache: orderCode (string) -> Map<productIdString, boolean>
    const _cache = new Map();
    const _loading = new Map();

    function getCurrentUserInfo() {
        try {
            if (window.authManager) {
                const auth =
                    window.authManager.getAuthState?.() || window.authManager.getUserInfo?.();
                if (auth) {
                    return {
                        userId: auth.id || auth.Id || auth.uid || auth.username || 'unknown',
                        userName: auth.displayName || auth.name || auth.username || 'Unknown',
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
            throw new Error(`KPI Livestream Flag API ${method} ${path}: ${res.status} ${text}`);
        }
        return res.json();
    }

    /**
     * Load flags BH cho một orderCode từ server. Cache kết quả + dedupe.
     * @param {string} orderCode
     * @param {{force?: boolean}} [opts]
     * @returns {Promise<Map<string, boolean>>}
     */
    async function load(orderCode, opts = {}) {
        if (!orderCode) return new Map();
        if (!opts.force && _cache.has(orderCode)) return _cache.get(orderCode);
        if (_loading.has(orderCode)) return _loading.get(orderCode);

        const p = (async () => {
            try {
                const resp = await apiFetch(
                    'GET',
                    `/kpi-livestream-flag/${encodeURIComponent(orderCode)}`
                );
                const map = new Map();
                for (const f of resp.flags || []) {
                    map.set(String(f.productId), f.isLivestreamProduct === true);
                }
                _cache.set(orderCode, map);
                return map;
            } catch (e) {
                console.warn('[KPI-LiveFlag] load failed:', e?.message);
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
     * Đọc toàn bộ flags BH của orderCode đã cache (đồng bộ).
     * @returns {Map<string, boolean>}
     */
    function getAll(orderCode) {
        if (!orderCode) return new Map();
        return _cache.get(orderCode) || new Map();
    }

    /**
     * Upsert flag BH cho (orderCode, productId) kèm snapshot. Optimistic cache,
     * rollback nếu server lỗi. KHÔNG trigger KPI recalc (BH tách khỏi KPI tiền).
     *
     * @param {string} orderCode
     * @param {number} productId
     * @param {boolean} isLive
     * @param {{productCode?, productName?, quantity?, price?, campaignId?, campaignName?, sellerName?, customerName?}} [snapshot]
     * @returns {Promise<boolean>} success
     */
    async function set(orderCode, productId, isLive, snapshot = {}) {
        if (!orderCode) throw new Error('orderCode required');
        const pid = Number(productId);
        if (!Number.isFinite(pid) || pid <= 0) throw new Error('productId must be positive number');
        const bool = isLive === true;

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
            await apiFetch('PUT', `/kpi-livestream-flag/${encodeURIComponent(orderCode)}/${pid}`, {
                isLivestreamProduct: bool,
                productCode: snapshot.productCode || null,
                productName: snapshot.productName || null,
                quantity: snapshot.quantity != null ? Number(snapshot.quantity) : 1,
                price: snapshot.price != null ? Number(snapshot.price) : 0,
                campaignId: snapshot.campaignId != null ? String(snapshot.campaignId) : null,
                campaignName: snapshot.campaignName || null,
                sellerName: snapshot.sellerName || null,
                customerName: snapshot.customerName || null,
                userId: user.userId,
                userName: user.userName,
            });
        } catch (e) {
            // Rollback cache
            if (prev === undefined) map.delete(String(pid));
            else map.set(String(pid), prev);
            console.error('[KPI-LiveFlag] set failed:', e?.message);
            throw e;
        }

        // Notify UI listeners
        try {
            window.dispatchEvent(
                new CustomEvent('kpi-livestream-flag-changed', {
                    detail: { orderCode, productId: pid, isLive: bool },
                })
            );
        } catch (e) {}

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

    /** Clear toàn bộ cache. */
    function invalidateAll() {
        _cache.clear();
        _loading.clear();
    }

    window.KpiLivestreamFlagStore = {
        load,
        get,
        getAll,
        set,
        invalidate,
        invalidateAll,
    };
})();
