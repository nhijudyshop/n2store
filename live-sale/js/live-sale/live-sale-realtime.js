// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * LiveSale Realtime — SSE client for live FB comments.
 * Reuses the existing CF Worker /facebook/comments/stream endpoint (same one
 * TPOS uses), so no new server code is required for Phase 1.
 */

const LiveSaleRealtime = {
    _streams: new Map(), // key = `${pageId}:${postId}` → EventSource

    _buildStreamUrl(fbPageId, fbPostId) {
        const base =
            window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        const qs = new URLSearchParams({ pageid: fbPageId, postId: fbPostId });
        return `${base}/facebook/comments/stream?${qs.toString()}`;
    },

    /**
     * Open SSE for a given page+post. Safe to call when already open (no-op).
     * New comments are appended to LiveSaleState.comments and the list re-renders.
     */
    startSSE(fbPageId, fbPostId, pageName = '') {
        const state = window.LiveSaleState;
        if (!state || !fbPageId || !fbPostId) return;

        const key = `${fbPageId}:${fbPostId}`;
        if (this._streams.has(key)) return;

        try {
            const es = new EventSource(this._buildStreamUrl(fbPageId, fbPostId));
            es.addEventListener('comment', (ev) => {
                try {
                    const comment = JSON.parse(ev.data);
                    comment._pageId = fbPageId;
                    comment._pageName = pageName;
                    // Prepend newest comment
                    state.comments.unshift(comment);
                    if (window.LiveSaleCommentList?.renderComments) {
                        window.LiveSaleCommentList.renderComments();
                    }
                } catch (err) {
                    console.warn('[LiveSale Realtime] bad event payload:', err.message);
                }
            });
            es.addEventListener('open', () => {
                window.dispatchEvent(new CustomEvent('tposRealtimeConnected'));
            });
            es.addEventListener('error', () => {
                window.dispatchEvent(new CustomEvent('tposRealtimeDisconnected'));
            });
            this._streams.set(key, es);
        } catch (err) {
            console.warn('[LiveSale Realtime] failed to open SSE:', err.message);
        }
    },

    stopSSE() {
        for (const [key, es] of this._streams) {
            try {
                es.close();
            } catch {
                /* noop */
            }
            this._streams.delete(key);
        }
        window.dispatchEvent(new CustomEvent('tposRealtimeDisconnected'));
    },

    /**
     * No-op placeholders kept for API compatibility with tpos-realtime.js.
     */
    disconnectWebSocket() {
        /* not used in LiveSale */
    },
};

if (typeof window !== 'undefined') {
    window.LiveSaleRealtime = LiveSaleRealtime;
    window.TposRealtime = window.TposRealtime || LiveSaleRealtime;
}
