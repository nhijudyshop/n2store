// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — sync 2-way TPOS.
// =====================================================================
// LiveCampaignApi — TPOS OData wrapper cho web2/live-campaign
// =====================================================================
// - Mọi method gọi trực tiếp TPOS qua CF Worker proxy
// - Không có local cache; trang load realtime từ TPOS mỗi lần
// - Auth: window.tokenManager.authenticatedFetch (auto-inject Bearer)
// =====================================================================

(function () {
    'use strict';

    const PROXY = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const BASE = PROXY + '/api/odata/SaleOnline_LiveCampaign';
    const EXPORT_URL = PROXY + '/api/SaleOnline_Order/ExportFile';

    function ensureTokenManager() {
        if (!window.tokenManager || typeof window.tokenManager.authenticatedFetch !== 'function') {
            throw new Error('TokenManager chưa load — refresh trang');
        }
    }

    async function jsonFetch(url, options) {
        ensureTokenManager();
        const opts = options || {};
        opts.headers = Object.assign({ Accept: 'application/json' }, opts.headers || {});
        const res = await window.tokenManager.authenticatedFetch(url, opts);
        const contentType = res.headers.get('content-type') || '';
        let body = null;
        if (contentType.includes('json')) {
            try {
                body = await res.json();
            } catch (_) {
                body = null;
            }
        } else if (res.status !== 204) {
            try {
                body = await res.text();
            } catch (_) {
                body = null;
            }
        }
        if (!res.ok) {
            const msg =
                (body && body.error && body.error.message) ||
                (typeof body === 'string' ? body.slice(0, 200) : null) ||
                `HTTP ${res.status}`;
            const err = new Error(msg);
            err.status = res.status;
            err.body = body;
            throw err;
        }
        return body;
    }

    /**
     * List campaigns with TPOS-style filter + pagination.
     * @param {Object} opts
     * @param {number} opts.top - page size (default 20)
     * @param {number} opts.skip - offset
     * @param {string} opts.orderby - eg "DateCreated desc"
     * @param {string} opts.search - substring matched against Name
     * @param {string} opts.status - 'all' | 'active' | 'inactive'
     * @param {string} opts.dateFrom - yyyy-mm-dd
     * @param {string} opts.dateTo - yyyy-mm-dd
     * @returns {Promise<{ value: Array, count: number }>}
     */
    async function list(opts) {
        const o = opts || {};
        const params = new URLSearchParams();
        params.set('$top', String(o.top || 20));
        params.set('$skip', String(o.skip || 0));
        params.set('$orderby', o.orderby || 'DateCreated desc');
        params.set('$count', 'true');

        const filters = [];
        if (o.search && o.search.trim()) {
            // Escape single quotes for OData literal
            const esc = o.search.trim().replace(/'/g, "''");
            filters.push(`contains(Name,'${esc}')`);
        }
        if (o.status === 'active') filters.push('IsActive eq true');
        else if (o.status === 'inactive') filters.push('IsActive eq false');
        if (o.dateFrom) {
            const from = new Date(o.dateFrom + 'T00:00:00+07:00').toISOString();
            filters.push(`DateCreated ge ${from}`);
        }
        if (o.dateTo) {
            const to = new Date(o.dateTo + 'T23:59:59+07:00').toISOString();
            filters.push(`DateCreated le ${to}`);
        }
        if (filters.length) params.set('$filter', filters.join(' and '));

        const url = `${BASE}?${params.toString()}`;
        const data = await jsonFetch(url, { method: 'GET' });
        return {
            value: Array.isArray(data && data.value) ? data.value : [],
            count: data && data['@odata.count'] != null ? data['@odata.count'] : 0,
        };
    }

    async function getOne(id) {
        const url = `${BASE}(${encodeURIComponent(id)})`;
        return await jsonFetch(url, { method: 'GET' });
    }

    /**
     * Create — POST to base endpoint.
     * @param {{Name: string, Note?: string, IsActive?: boolean, Facebook_UserName?: string, Facebook_UserId?: string, Facebook_LiveId?: string}} payload
     */
    async function create(payload) {
        if (!payload || !payload.Name || !payload.Name.trim()) {
            throw new Error('Tên chiến dịch không được trống');
        }
        const body = {
            Name: payload.Name.trim(),
            Note: payload.Note ? String(payload.Note).trim() : null,
            IsActive: payload.IsActive !== false,
            Facebook_UserName: payload.Facebook_UserName || null,
            Facebook_UserId: payload.Facebook_UserId || null,
            Facebook_LiveId: payload.Facebook_LiveId || null,
            Details: [],
        };
        return await jsonFetch(BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
    }

    /**
     * Update via PUT — TPOS requires full body. We GET first, mutate, then PUT.
     * @param {string} id
     * @param {Partial<Object>} patch - fields to override on the existing record
     */
    async function update(id, patch) {
        const current = await getOne(id);
        const merged = Object.assign({}, current, patch || {});
        // Strip @odata.* metadata keys
        const body = {};
        for (const k of Object.keys(merged)) {
            if (!k.startsWith('@odata')) body[k] = merged[k];
        }
        // TPOS PUT requires Details array; default to [] if missing
        if (!Array.isArray(body.Details)) body.Details = [];
        const url = `${BASE}(${encodeURIComponent(id)})`;
        await jsonFetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json;odata.metadata=minimal' },
            body: JSON.stringify(body),
        });
        // PUT returns 204; fetch fresh state for callers
        return await getOne(id);
    }

    async function setActive(id, isActive) {
        return await update(id, { IsActive: !!isActive });
    }

    async function remove(id) {
        const url = `${BASE}(${encodeURIComponent(id)})`;
        await jsonFetch(url, { method: 'DELETE' });
        return { Id: id, deleted: true };
    }

    /**
     * Export orders for a campaign as Excel.
     * Returns a Blob (xlsx) or throws if no orders / TPOS error.
     */
    async function exportExcel(id) {
        ensureTokenManager();
        const url = `${EXPORT_URL}?campaignId=${encodeURIComponent(id)}&sort=date`;
        const res = await window.tokenManager.authenticatedFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ data: '{}' }),
        });
        if (!res.ok) {
            // TPOS returns 500 + HTML when no orders exist
            const text = await res.text().catch(() => '');
            const err = new Error(
                res.status === 500 && /<html/i.test(text)
                    ? 'Chiến dịch chưa có đơn — không có gì để xuất Excel'
                    : `HTTP ${res.status}`
            );
            err.status = res.status;
            throw err;
        }
        return await res.blob();
    }

    window.LiveCampaignApi = {
        list,
        getOne,
        create,
        update,
        setActive,
        remove,
        exportExcel,
    };
})();
