// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * tab1-chat-cache-warmer.js — P6 Chat Cache Warming
 *
 * Preload inboxMapByPSID for top N visible orders via requestIdleCallback.
 * When user opens chat for a warmed order → PATH D cache hit → skip first API call
 * → chat opens ~300-800ms faster.
 *
 * Trigger: called from renderTable() in tab1-table.js.
 * Throttle: min 30s between warming runs to avoid spamming Pancake.
 * Budget: max 20 orders per run, scheduled on idle callback.
 */
(function () {
    'use strict';

    const TOP_N_VISIBLE = 20; // Warm top 20 orders
    const MIN_INTERVAL_MS = 30000; // Min 30s between runs
    const IDLE_DEADLINE_MS = 200; // Max time per idle batch
    const MAX_MAP_SIZE = 2000; // Memory safety cap

    let _lastWarmAt = 0;
    let _scheduled = false;

    function _getVisibleOrders() {
        if (!Array.isArray(window.displayedData)) return [];
        // Top N by display order (already sorted)
        return window.displayedData.slice(0, TOP_N_VISIBLE);
    }

    function _shouldWarm() {
        const pdm = window.pancakeDataManager;
        if (!pdm) return false;
        // Don't warm if map already large (prevents memory bloat)
        if (pdm.inboxMapByPSID && pdm.inboxMapByPSID.size > MAX_MAP_SIZE) return false;
        // Throttle
        if (Date.now() - _lastWarmAt < MIN_INTERVAL_MS) return false;
        return true;
    }

    async function _warmOrder(order) {
        const pdm = window.pancakeDataManager;
        if (!pdm) return;

        const pageId = order.channelId || order.pageId;
        const psid = order.psid || order.customerId;
        if (!pageId || !psid) return;

        // Already cached → skip
        if (pdm.inboxMapByPSID?.has(String(psid))) return;

        try {
            // Use timeout-wrapped fetch
            await pdm.fetchConversationsByCustomerFbId(pageId, psid, { signal: undefined });
        } catch (_) {
            // Silent — this is opportunistic warming
        }
    }

    async function _runWarming() {
        if (!_shouldWarm()) return;
        _lastWarmAt = Date.now();

        const orders = _getVisibleOrders();
        if (orders.length === 0) return;

        // Deduplicate by pageId+psid to avoid double-fetching.
        // Skip orders missing either pageId or psid entirely (they'd dedup under "undefined:undefined").
        const seen = new Set();
        const unique = [];
        for (const o of orders) {
            const pid = o.channelId || o.pageId;
            const sid = o.psid || o.customerId;
            if (!pid || !sid) continue;
            const key = `${pid}:${sid}`;
            if (seen.has(key)) continue;
            seen.add(key);
            unique.push(o);
        }

        console.log(`[ChatWarmer] Warming cache for ${unique.length} visible orders`);

        // Process sequentially with small delays to avoid spike
        for (let i = 0; i < unique.length; i++) {
            await _warmOrder(unique[i]);
            // 100ms gap between requests — spreads load over ~2s
            if (i < unique.length - 1) {
                await new Promise((r) => setTimeout(r, 100));
            }
        }

        console.log(
            `[ChatWarmer] Warmed, inboxMapByPSID size: ${window.pancakeDataManager?.inboxMapByPSID?.size}`
        );
    }

    window.warmChatCacheForVisibleOrders = function () {
        if (_scheduled) return;
        _scheduled = true;

        const runner = () => {
            _scheduled = false;
            _runWarming().catch((e) => console.warn('[ChatWarmer] error:', e.message));
        };

        // Schedule on idle; fallback to setTimeout if requestIdleCallback unsupported
        if (typeof requestIdleCallback === 'function') {
            requestIdleCallback(runner, { timeout: 3000 });
        } else {
            setTimeout(runner, 500);
        }
    };
})();
