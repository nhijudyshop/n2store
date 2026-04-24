// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Native Orders API (frontend client)
 * Talks to our own Render.com backend via Cloudflare Worker proxy:
 *   /api/native-orders/*
 *
 * This is INTENTIONALLY separate from TposApi — no TPOS token,
 * no TPOS OData. Orders created here live in PostgreSQL table
 * `native_orders` and are tagged source='NATIVE_WEB'.
 */

const NativeOrdersApi = {
    _getBaseUrl() {
        const root = window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
        return `${root}/api/native-orders`;
    },

    async _fetchJson(url, options = {}) {
        const response = await fetch(url, {
            ...options,
            headers: {
                Accept: 'application/json',
                ...(options.headers || {}),
            },
        });
        let data = null;
        try { data = await response.json(); } catch { /* non-json */ }
        if (!response.ok) {
            const msg = data?.error || `HTTP ${response.status}`;
            throw new Error(msg);
        }
        return data;
    },

    /**
     * Create a native-web order from a Facebook comment.
     * @param {object} params
     * @param {string} params.fbUserId       - Facebook AS user id (required)
     * @param {string} [params.fbUserName]
     * @param {string} [params.fbPageId]
     * @param {string} [params.fbPostId]    - Full post id (pageId_postId)
     * @param {string} [params.fbCommentId]
     * @param {number} [params.crmTeamId]
     * @param {string} [params.message]     - Comment message (stored as note)
     * @param {string} [params.phone]
     * @param {string} [params.address]
     * @param {string} [params.note]
     * @param {string} [params.createdBy]
     * @param {string} [params.createdByName]
     * @returns {Promise<{order: object, idempotent?: boolean}>}
     */
    async createFromComment(params) {
        const data = await this._fetchJson(`${this._getBaseUrl()}/from-comment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params || {}),
        });
        return data;
    },

    async getByUser(fbUserId) {
        if (!fbUserId) return null;
        const data = await this._fetchJson(
            `${this._getBaseUrl()}/by-user/${encodeURIComponent(fbUserId)}`
        );
        return data?.order || null;
    },

    async list({ status, search, fbPostId, page = 1, limit = 200 } = {}) {
        const qs = new URLSearchParams();
        if (status) qs.set('status', status);
        if (search) qs.set('search', search);
        if (fbPostId) qs.set('fbPostId', fbPostId);
        qs.set('page', String(page));
        qs.set('limit', String(limit));
        return this._fetchJson(`${this._getBaseUrl()}/load?${qs}`);
    },

    async update(code, fields) {
        return this._fetchJson(`${this._getBaseUrl()}/${encodeURIComponent(code)}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fields || {}),
        });
    },

    async remove(code) {
        return this._fetchJson(`${this._getBaseUrl()}/${encodeURIComponent(code)}`, {
            method: 'DELETE',
        });
    },
};

if (typeof window !== 'undefined') {
    window.NativeOrdersApi = NativeOrdersApi;
}
