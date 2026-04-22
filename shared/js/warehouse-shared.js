// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * WAREHOUSE SHARED UTILITIES
 * =====================================================
 * Common functions shared between:
 *   - web-warehouse (Web Warehouse)
 *   - product-warehouse (Kho Sản Phẩm)
 *
 * Usage: <script src="../shared/js/warehouse-shared.js"></script>
 * Access: window.WarehouseShared.*
 * =====================================================
 */

(function () {
    'use strict';

    // =====================================================
    // ENDPOINTS (single source of truth)
    // =====================================================
    const RENDER_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const API_BASE = RENDER_BASE + '/api';
    const WAREHOUSE_API = API_BASE + '/v2/web-warehouse';
    const SSE_ENDPOINT = API_BASE + '/realtime/sse';

    /**
     * Build an SSE URL for one or more keys.
     * @param {string|string[]} keys - key or list of keys to subscribe
     */
    function buildSseUrl(keys) {
        const arr = Array.isArray(keys) ? keys : [keys];
        return `${SSE_ENDPOINT}?keys=${encodeURIComponent(arr.join(','))}`;
    }

    // =====================================================
    // FORMATTING
    // =====================================================

    function formatCurrency(val) {
        if (val === null || val === undefined) return '-';
        return new Intl.NumberFormat('vi-VN').format(Math.round(val));
    }

    function formatPrice(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN');
    }

    function formatQty(val) {
        if (val === null || val === undefined) return '-';
        return val.toLocaleString('vi-VN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    function formatNum(val) {
        if (!val) return '0';
        return new Intl.NumberFormat('vi-VN').format(val);
    }

    // =====================================================
    // HTML / TEXT
    // =====================================================

    function escapeHtml(str) {
        if (!str) return '';
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }

    function highlightMatch(text, query) {
        if (!query || !text) return escapeHtml(text);
        const escaped = escapeHtml(text);
        const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
        return escaped.replace(regex, '<span class="highlight">$1</span>');
    }

    function removeVietnameseTones(str) {
        if (!str) return '';
        str = str.toLowerCase();
        str = str.replace(/à|á|ạ|ả|ã|â|ầ|ấ|ậ|ẩ|ẫ|ă|ằ|ắ|ặ|ẳ|ẵ/g, 'a');
        str = str.replace(/è|é|ẹ|ẻ|ẽ|ê|ề|ế|ệ|ể|ễ/g, 'e');
        str = str.replace(/ì|í|ị|ỉ|ĩ/g, 'i');
        str = str.replace(/ò|ó|ọ|ỏ|õ|ô|ồ|ố|ộ|ổ|ỗ|ơ|ờ|ớ|ợ|ở|ỡ/g, 'o');
        str = str.replace(/ù|ú|ụ|ủ|ũ|ư|ừ|ứ|ự|ử|ữ/g, 'u');
        str = str.replace(/ỳ|ý|ỵ|ỷ|ỹ/g, 'y');
        str = str.replace(/đ/g, 'd');
        return str;
    }

    function timeSince(date) {
        const s = Math.floor((Date.now() - date.getTime()) / 1000);
        if (s < 60) return `${s}s`;
        const m = Math.floor(s / 60);
        if (m < 60) return `${m} phút`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h} giờ`;
        return `${Math.floor(h / 24)} ngày`;
    }

    // =====================================================
    // TOAST NOTIFICATIONS
    // =====================================================

    function showToast(msg, type = 'success') {
        // Try container-based toast first (product-warehouse style)
        const container = document.getElementById('toastContainer');
        if (container) {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;
            toast.textContent = msg;
            container.appendChild(toast);
            setTimeout(() => toast.remove(), 4000);
            return;
        }

        // Fallback: floating toast (web-warehouse style)
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.textContent = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }

    // =====================================================
    // SSE REAL-TIME
    // =====================================================

    /**
     * Setup Server-Sent Events for real-time updates.
     *
     * @param {Object} options
     * @param {string} options.sseUrl - SSE endpoint URL
     * @param {Function} options.onReload - Called when data should be reloaded. Receives last payload.
     * @param {Function} [options.onEvent] - Optional: called for every event BEFORE debounce. Receives parsed payload.
     * @param {string[]} [options.ignoreActions] - Actions to skip (e.g. ['qty_change', 'update'])
     * @param {number} [options.debounceMs=2000] - Debounce reload calls
     * @returns {{ close: Function, mute: Function }} Control object
     */
    function setupSSE(options) {
        const {
            sseUrl,
            onReload,
            onEvent,
            ignoreActions = [],
            debounceMs = 2000,
        } = options;

        let source = null;
        let reloadTimer = null;
        let muteUntil = 0;
        let lastPayload = null;

        function connect() {
            if (source) { source.close(); source = null; }

            try {
                source = new EventSource(sseUrl);

                const handleEvent = (e) => {
                    // Skip if muted (own action)
                    if (Date.now() < muteUntil) return;

                    let payload = null;
                    try { payload = JSON.parse(e.data); } catch (_) {}

                    // Check for ignored actions
                    if (ignoreActions.length > 0 && payload) {
                        const action = payload?.data?.action;
                        if (ignoreActions.includes(action)) return;
                    }

                    lastPayload = payload;

                    // Notify caller about the raw event before debounce
                    if (typeof onEvent === 'function') {
                        try { onEvent(payload); } catch (err) { console.warn('[SSE] onEvent error:', err); }
                    }

                    // Debounced reload
                    if (reloadTimer) clearTimeout(reloadTimer);
                    reloadTimer = setTimeout(() => onReload(lastPayload), debounceMs);
                };

                source.addEventListener('update', handleEvent);
                source.addEventListener('deleted', handleEvent);
                source.onerror = () => console.warn('[SSE] Disconnected, auto-reconnect...');
            } catch (e) {
                console.warn('[SSE] Setup failed:', e);
            }
        }

        connect();

        return {
            close() {
                if (source) { source.close(); source = null; }
                if (reloadTimer) clearTimeout(reloadTimer);
            },
            mute(durationMs = 3000) {
                muteUntil = Date.now() + durationMs;
            },
            unmute() {
                muteUntil = 0;
            }
        };
    }

    // =====================================================
    // IMAGE ZOOM ON HOVER
    // =====================================================

    /**
     * Initialize image zoom preview on hover for product thumbnails.
     * @param {string} containerSelector - CSS selector for the table body or container
     * @param {string} [thumbSelector='.product-thumb'] - CSS selector for thumbnail images
     */
    function initImageZoomHover(containerSelector, thumbSelector = '.product-thumb') {
        let zoomEl = null;

        function getOrCreateZoom() {
            if (!zoomEl) {
                zoomEl = document.createElement('img');
                zoomEl.className = 'image-zoom-preview';
                document.body.appendChild(zoomEl);
            }
            return zoomEl;
        }

        function positionZoom(e, el) {
            const offset = 16;
            const w = 280, h = 280;
            let x = e.clientX + offset;
            let y = e.clientY - h / 2;

            if (x + w > window.innerWidth) x = e.clientX - w - offset;
            if (y < 4) y = 4;
            if (y + h > window.innerHeight - 4) y = window.innerHeight - h - 4;

            el.style.left = x + 'px';
            el.style.top = y + 'px';
        }

        const container = document.querySelector(containerSelector);
        if (!container) return;

        container.addEventListener('mouseenter', function (e) {
            const thumb = e.target.closest(thumbSelector);
            if (!thumb) return;
            const zoom = getOrCreateZoom();
            zoom.src = thumb.src;
            zoom.classList.add('visible');
            positionZoom(e, zoom);
        }, true);

        container.addEventListener('mousemove', function (e) {
            const thumb = e.target.closest(thumbSelector);
            if (!thumb || !zoomEl) return;
            positionZoom(e, zoomEl);
        }, true);

        container.addEventListener('mouseleave', function (e) {
            const thumb = e.target.closest(thumbSelector);
            if (!thumb || !zoomEl) return;
            zoomEl.classList.remove('visible');
        }, true);
    }

    // =====================================================
    // IMAGE VIEWER (full-screen overlay)
    // =====================================================

    function showImageOverlay(src) {
        const overlay = document.createElement('div');
        overlay.className = 'image-modal-overlay';
        overlay.innerHTML = `<img src="${escapeHtml(src)}" alt="Ảnh sản phẩm">`;
        overlay.addEventListener('click', () => overlay.remove());
        document.body.appendChild(overlay);
    }

    // =====================================================
    // LUCIDE ICONS HELPER
    // =====================================================

    function initIcons() {
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }

    // =====================================================
    // STOCK CLASSIFICATION
    // =====================================================

    function getQtyClass(qty) {
        if (qty <= 0) return 'qty-out-of-stock';
        if (qty <= 5) return 'qty-low-stock';
        return 'qty-in-stock';
    }

    // =====================================================
    // EXPORT
    // =====================================================

    window.WarehouseShared = {
        // Formatting
        formatCurrency,
        formatPrice,
        formatQty,
        formatNum,

        // HTML/Text
        escapeHtml,
        highlightMatch,
        removeVietnameseTones,
        timeSince,

        // UI
        showToast,
        initIcons,
        getQtyClass,

        // SSE
        setupSSE,
        buildSseUrl,
        RENDER_BASE,
        API_BASE,
        WAREHOUSE_API,
        SSE_ENDPOINT,

        // Image
        initImageZoomHover,
        showImageOverlay,
    };
})();
