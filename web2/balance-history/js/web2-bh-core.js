// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// web2-bh-core — base namespace window.W2BH: config + shared state +
// dom-cache + utils (fetch/auth/format/notify/debounce/diacritics).
// Source-of-truth cho cross-module fns. KHÔNG đổi behavior.
// =====================================================================

(function (global) {
    'use strict';

    const W2BH = global.W2BH || (global.W2BH = {});

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/balance-history';
    const DIRECT_BASE = 'https://web2-api-kv04.onrender.com/api/web2/balance-history';

    const STATUS_FILTERS = [
        { key: 'all', label: 'Tất cả' },
        { key: 'MANUAL', label: 'Nạp/Rút tay', cls: 'chip-manual' },
        { key: 'MANUAL_ALL', label: 'Lịch sử thủ công', cls: 'chip-manual-all' },
        { key: 'AUTO_APPROVED', label: 'Tự động', cls: 'chip-auto' },
        { key: 'PENDING_MATCH', label: 'Trùng SĐT — cần chọn', cls: 'chip-pending' },
        { key: 'NO_PHONE', label: 'Chưa gán KH', cls: 'chip-no-phone' },
    ];

    const state = {
        rows: [],
        total: 0,
        page: 1,
        pageSize: 50,
        status: 'all',
        search: '',
        dateFrom: '',
        dateTo: '',
        loading: false,
        stats: {},
    };

    // Diacritic strip (inline)
    function stripDiacritics(s) {
        if (!s) return '';
        return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D');
    }
    function searchNormalize(s) {
        return stripDiacritics(String(s || ''))
            .toLowerCase()
            .trim();
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho /api/web2/balance-history/*
    // (mutations soft-gate → WEB2_AUTH_ENFORCE=1). Choke point: jsonFetch.
    function authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    async function jsonFetch(url, options) {
        const opts = { ...(options || {}), headers: authHeaders((options || {}).headers) }; // ENFORCE-PREP (2026-06-12)
        const r = await fetch(url, opts);
        const ct = r.headers.get('content-type') || '';
        const body = ct.includes('json') ? await r.json() : await r.text();
        if (!r.ok) {
            const msg =
                (body && body.error) ||
                (typeof body === 'string' ? body.slice(0, 200) : `HTTP ${r.status}`);
            const err = new Error(msg);
            err.status = r.status;
            throw err;
        }
        return body;
    }
    async function withFallback(path, options) {
        try {
            return await jsonFetch(`${BASE}${path}`, options);
        } catch (e) {
            return await jsonFetch(`${DIRECT_BASE}${path}`, options);
        }
    }

    // ----- Helpers -----
    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.num(n); // 1 nguồn (no suffix)
        return Math.round(Number(n) || 0).toLocaleString('vi-VN');
    }
    function fmtTime(iso) {
        if (!iso) return '—';
        if (window.Web2Format) return window.Web2Format.dateTime(iso) || '—'; // 1 nguồn (GMT+7)
        try {
            const d = new Date(iso);
            // GMT+7 (quy tắc 10)
            return (
                d.toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) +
                ' ' +
                d.toLocaleTimeString('vi-VN', {
                    timeZone: 'Asia/Ho_Chi_Minh',
                    hour: '2-digit',
                    minute: '2-digit',
                })
            );
        } catch {
            return iso;
        }
    }
    function escapeHtml(v) {
        if (window.Web2Escape && window.Web2Escape.escapeHtml)
            return window.Web2Escape.escapeHtml(v);
        if (window.Web2Escape) return window.Web2Escape.escapeHtml(v); // 1 nguồn
        if (v == null) return '';
        return String(v)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }
    function notify(msg, type) {
        try {
            window.notificationManager?.show?.(msg, type || 'info');
        } catch {}
    }
    function debounce(fn, delay) {
        let t = null;
        return function () {
            const args = arguments;
            if (t) clearTimeout(t);
            t = setTimeout(() => fn.apply(this, args), delay);
        };
    }

    function _currentUser() {
        try {
            const raw =
                localStorage.getItem('loginindex_auth') ||
                sessionStorage.getItem('loginindex_auth') ||
                '{}';
            const auth = JSON.parse(raw);
            return auth.username || auth.userName || auth.email || 'admin';
        } catch {
            return 'admin';
        }
    }

    function _normalizePhoneInput(raw) {
        let s = String(raw || '').replace(/[^0-9]/g, '');
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    // ----- DOM -----
    const dom = {};
    function cacheDom() {
        dom.root = document.getElementById('web2BhApp');
        dom.statsBar = document.getElementById('w2bhStatsBar');
        dom.statTotal = document.getElementById('w2bhStatTotal');
        dom.statAuto = document.getElementById('w2bhStatAuto');
        dom.statPending = document.getElementById('w2bhStatPending');
        dom.statNoPhone = document.getElementById('w2bhStatNoPhone');
        dom.statSumIn = document.getElementById('w2bhStatSumIn');
        dom.chips = document.getElementById('w2bhChips');
        dom.search = document.getElementById('w2bhSearch');
        dom.tbody = document.getElementById('w2bhTbody');
        dom.pageInfo = document.getElementById('w2bhPageInfo');
        dom.pageButtons = document.getElementById('w2bhPageButtons');
        dom.pageSize = document.getElementById('w2bhPageSize');
        dom.refreshBtn = document.getElementById('w2bhRefreshBtn');
        dom.reprocessBtn = document.getElementById('w2bhReprocessBtn');
        dom.autoAssignBtn = document.getElementById('w2bhAutoAssignBtn');
        dom.dateFrom = document.getElementById('w2bhDateFrom');
        dom.dateTo = document.getElementById('w2bhDateTo');
        dom.dateClear = document.getElementById('w2bhDateClear');
        dom.datePresets = document.getElementById('w2bhDatePresets');
        dom.csvBtn = document.getElementById('w2bhCsvBtn');
    }

    // ----- Customer-search / FB-conversation base URLs -----
    // 2026-06-03: kho KH riêng Web 2.0 (web2_customers @ web2Db) — bỏ /api/v2/customers Web 1.0
    const CUSTOMER_SEARCH_BASE = BASE.replace(
        /\/api\/web2\/balance-history$/,
        '/api/web2/customers/search'
    );
    const CUSTOMER_SEARCH_FALLBACK = DIRECT_BASE.replace(
        /\/api\/web2\/balance-history$/,
        '/api/web2/customers/search'
    );
    const FB_CONV_BASE = BASE.replace(/\/api\/web2\/balance-history$/, '/api/web2/customers');
    const FB_CONV_FALLBACK = DIRECT_BASE.replace(
        /\/api\/web2\/balance-history$/,
        '/api/web2/customers'
    );

    // Expose to namespace
    W2BH.BASE = BASE;
    W2BH.DIRECT_BASE = DIRECT_BASE;
    W2BH.STATUS_FILTERS = STATUS_FILTERS;
    W2BH.state = state;
    W2BH.dom = dom;
    W2BH.cacheDom = cacheDom;
    W2BH.stripDiacritics = stripDiacritics;
    W2BH.searchNormalize = searchNormalize;
    W2BH.authHeaders = authHeaders;
    W2BH.jsonFetch = jsonFetch;
    W2BH.withFallback = withFallback;
    W2BH.fmtVnd = fmtVnd;
    W2BH.fmtTime = fmtTime;
    W2BH.escapeHtml = escapeHtml;
    W2BH.notify = notify;
    W2BH.debounce = debounce;
    W2BH._currentUser = _currentUser;
    W2BH._normalizePhoneInput = _normalizePhoneInput;
    W2BH.CUSTOMER_SEARCH_BASE = CUSTOMER_SEARCH_BASE;
    W2BH.CUSTOMER_SEARCH_FALLBACK = CUSTOMER_SEARCH_FALLBACK;
    W2BH.FB_CONV_BASE = FB_CONV_BASE;
    W2BH.FB_CONV_FALLBACK = FB_CONV_FALLBACK;
})(window);
