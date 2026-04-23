// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * fetch-with-timeout.js — AbortController-based fetch wrapper
 *
 * Fixes "Đang tải tin nhắn..." treo vô hạn khi Pancake/Render hang.
 * Dùng cho: tab1-chat-core, pancake-data-manager, pancake-token-manager.
 *
 * Exports `window.fetchWithTimeout(url, options, timeoutMs)`.
 * Khi timeout hoặc external abort signal fire → request bị hủy + throw AbortError.
 *
 * Usage:
 *   const res = await fetchWithTimeout(url, { method: 'POST' }, 8000);
 *
 *   // External abort (propagate từ chat modal):
 *   const ctrl = new AbortController();
 *   const res = await fetchWithTimeout(url, { signal: ctrl.signal }, 8000);
 *   ctrl.abort(); // cancels regardless of timeout
 */
(function () {
    'use strict';

    const DEFAULT_TIMEOUT_MS = 10000;

    /**
     * @param {string} url
     * @param {RequestInit} [options={}]
     * @param {number} [timeoutMs=10000]
     * @returns {Promise<Response>}
     * @throws {DOMException} AbortError khi timeout hoặc bị cancel
     */
    async function fetchWithTimeout(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
        const ctrl = new AbortController();
        const externalSignal = options.signal;
        let abortHandler = null;

        // Combine external signal + internal timeout signal
        if (externalSignal) {
            if (externalSignal.aborted) {
                throw new DOMException('Aborted before fetch', 'AbortError');
            }
            abortHandler = () => ctrl.abort();
            externalSignal.addEventListener('abort', abortHandler);
        }

        const timer = setTimeout(() => ctrl.abort(), timeoutMs);

        try {
            const res = await fetch(url, { ...options, signal: ctrl.signal });
            return res;
        } catch (err) {
            if (err?.name === 'AbortError') {
                const reason = externalSignal?.aborted
                    ? 'cancelled'
                    : `timeout after ${timeoutMs}ms`;
                const wrapped = new DOMException(`fetch ${reason}: ${url}`, 'AbortError');
                wrapped.timeoutMs = timeoutMs;
                wrapped.url = url;
                throw wrapped;
            }
            throw err;
        } finally {
            clearTimeout(timer);
            // Remove external signal listener to avoid leak when signal is long-lived
            if (externalSignal && abortHandler) {
                try {
                    externalSignal.removeEventListener('abort', abortHandler);
                } catch (_) {}
            }
        }
    }

    /**
     * Helper: wrap fetchWithTimeout trả về null on failure thay vì throw.
     * Dùng cho background/enrichment fetches không muốn block chain.
     */
    async function fetchOrNull(url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
        try {
            const res = await fetchWithTimeout(url, options, timeoutMs);
            if (!res.ok) return null;
            return res;
        } catch (err) {
            return null;
        }
    }

    window.fetchWithTimeout = fetchWithTimeout;
    window.fetchOrNull = fetchOrNull;
})();
