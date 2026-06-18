// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — 1 NGUỒN fetch JSON (auth + fallback base) cho Web 2.0.
// =====================================================================
// Web2ApiFetch — NGUỒN DUY NHẤT gọi API JSON cho Web 2.0.
//
// Lý do (codemap §4, 2026-06-18): jsonFetch/_fetchJson/withFallback copy rải
// ~11 file. Gom 1 nguồn: tự gắn x-web2-token (Web2Auth.authHeaders), parse JSON
// content-type-aware, ném Error có .status/.body, + fallback dual-base
// (worker → render fallback).
//
// API:
//   await Web2ApiFetch.json(url, options?)
//        → body (object nếu JSON, string nếu text). Ném Error(msg) nếu !ok
//          (err.status, err.body đính kèm).
//   await Web2ApiFetch.withFallback(path, options?, bases?)
//        → thử lần lượt bases[i]+path tới khi thành công. Mặc định bases =
//          [WEB2_CONFIG.WEB2_API, WEB2_CONFIG.WORKER_URL] (lọc rỗng).
//   Web2ApiFetch.authHeaders(extra?) → headers kèm x-web2-token (proxy Web2Auth).
// =====================================================================
(function (global) {
    'use strict';
    if (global.Web2ApiFetch) return;

    function authHeaders(extra) {
        if (global.Web2Auth && typeof global.Web2Auth.authHeaders === 'function') {
            return global.Web2Auth.authHeaders(extra);
        }
        // Fallback: đọc trực tiếp localStorage web2_auth nếu Web2Auth chưa load.
        const h = { ...(extra || {}) };
        try {
            const raw = localStorage.getItem('web2_auth');
            const t = raw ? JSON.parse(raw).token : null;
            if (t) h['x-web2-token'] = t;
        } catch {
            /* ignore */
        }
        return h;
    }

    async function json(url, options) {
        const opts = { ...(options || {}), headers: authHeaders((options || {}).headers) };
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        let body = null;
        if (ct.includes('json')) {
            body = await r.json().catch(() => null);
        } else {
            body = await r.text().catch(() => '');
        }
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' && body ? body.slice(0, 200) : `HTTP ${r.status}`);
            const e = new Error(msg);
            e.status = r.status;
            e.body = body;
            throw e;
        }
        return body;
    }

    function _defaultBases() {
        const cfg = global.WEB2_CONFIG || {};
        return [cfg.WEB2_API, cfg.WORKER_URL].filter(Boolean);
    }

    async function withFallback(path, options, bases) {
        const list = bases && bases.length ? bases : _defaultBases();
        if (!list.length) return json(path, options); // không có base → coi path là URL đầy đủ
        let lastErr;
        for (const b of list) {
            try {
                return await json(`${b}${path}`, options);
            } catch (e) {
                lastErr = e;
            }
        }
        throw lastErr;
    }

    global.Web2ApiFetch = { json, withFallback, authHeaders };
})(typeof window !== 'undefined' ? window : globalThis);
