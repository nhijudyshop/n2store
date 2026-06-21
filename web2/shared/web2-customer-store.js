// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — NGUỒN DUY NHẤT truy cập kho KH web2_customers.
// =====================================================================
// Web2CustomerStore — 1 NGUỒN đọc/ghi kho khách hàng Web 2.0 (web2_customers).
//
// Trước đây logic này nằm rải rác ở 4 chỗ (web2-customer-lookup, live-status,
// live-customer-sync, live-api) với 3 bộ normalize status + 2-3 filter SĐT lỏng
// (>=3 / >=9 → nuốt fb_id thành SĐT). Gom về đây để:
//   • Validate SĐT VN = ĐÚNG 10 số `/^0\d{9}$/` (tránh nhầm fb_id `fb_2408...`).
//   • 1 bộ chuẩn hoá trạng thái KH (text/class/normalize) dùng chung.
//   • Mọi write (PATCH/upsert/harvest) tự gắn `x-web2-token` (WEB2_AUTH_ENFORCE).
//   • 1 chỗ build URL worker + chunk batch chống N+1.
//
// Các module cũ (PartnerCustomerApi/Web2CustomerLookup, LiveStatus,
// LiveCustomerSync, LiveApi) nay DELEGATE vào đây — giữ nguyên public interface
// nên không phải rewire call-site. Realtime: consumer tự subscribe SSE
// `web2:customers` (hoặc dùng Web2CustomerStore.subscribe).
// =====================================================================

(function (global) {
    'use strict';
    if (typeof global === 'undefined' || global.Web2CustomerStore) return;

    function workerUrl() {
        return (
            (global.API_CONFIG && global.API_CONFIG.WORKER_URL) ||
            'https://chatomni-proxy.nhijudyshop.workers.dev'
        );
    }
    function base() {
        return workerUrl() + '/api/web2/customers';
    }

    // ── AUTH (x-web2-token) ─────────────────────────────────────────────
    function authHeaders(extra) {
        if (global.Web2Auth && global.Web2Auth.authHeaders)
            return global.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {
            /* no token */
        }
        return h;
    }

    // ── PHONE (SĐT VN = ĐÚNG 10 số) ─────────────────────────────────────
    function normPhone(p) {
        var s = String(p == null ? '' : p).replace(/\D/g, '');
        if (!s) return '';
        if (s.indexOf('84') === 0 && s.length === 11) s = '0' + s.slice(2);
        if (s.length === 9 && s[0] !== '0') s = '0' + s;
        // ⚠ KHÔNG slice(-10) cho dãy dài: fb_id 15-17 số (vd 24084091254523635)
        // bị slice → '1254523635' trông như SĐT giả → ghi đè SĐT thật. Giữ nguyên
        // → isValidPhone (/^0\d{9}$/) loại. (fix 2026-06-15)
        return s;
    }
    function isValidPhone(p) {
        return /^0\d{9}$/.test(normPhone(p));
    }

    // ── STATUS (1 nguồn) ────────────────────────────────────────────────
    var STATUS_TEXT = {
        Normal: 'Bình thường',
        Bom: 'Bom hàng',
        BomHang: 'Bom hàng',
        Warning: 'Cảnh báo',
        Danger: 'Nguy hiểm',
        VIP: 'VIP',
    };
    var STATUS_VALUES = ['Normal', 'Bom', 'Warning', 'Danger', 'VIP'];

    function statusText(s) {
        if (s && typeof s === 'object') return s.StatusText || STATUS_TEXT[s.Status] || '';
        return STATUS_TEXT[s] || '';
    }
    function statusClass(status) {
        switch (status) {
            case 'Normal':
                return 'pc-status-normal';
            case 'Bom':
            case 'BomHang':
                return 'pc-status-bomb';
            case 'Warning':
                return 'pc-status-warning';
            case 'Danger':
                return 'pc-status-danger';
            case 'VIP':
                return 'pc-status-vip';
            default:
                return '';
        }
    }
    // normalize(raw) → {label,key} — superset (gồm cả tier "Thân thiết"/"Khách sỉ"
    // để hiển thị; giá trị lạ giữ nguyên văn, KHÔNG nuốt thông tin).
    function normalize(raw) {
        var s = String(raw == null ? '' : raw)
            .trim()
            .toLowerCase();
        if (!s || s === 'normal' || s === 'bình thường' || s === 'binh thuong')
            return { label: 'Bình thường', key: 'normal' };
        if (s.indexOf('bom') >= 0) return { label: 'Bom hàng', key: 'bom' };
        if (s.indexOf('vip') >= 0) return { label: 'VIP', key: 'vip' };
        if (s.indexOf('thân') >= 0 || s.indexOf('than') >= 0 || s.indexOf('thiết') >= 0)
            return { label: 'Thân thiết', key: 'than' };
        if (s.indexOf('sỉ') >= 0 || s === 'si' || s.indexOf('wholesale') >= 0)
            return { label: 'Khách sỉ', key: 'si' };
        if (s.indexOf('nguy') >= 0 || s.indexOf('danger') >= 0)
            return { label: 'Nguy hiểm', key: 'danger' };
        if (s.indexOf('cảnh') >= 0 || s.indexOf('canh') >= 0 || s.indexOf('warn') >= 0)
            return { label: 'Cảnh báo', key: 'warn' };
        return { label: String(raw).trim(), key: 'other' };
    }

    // ── CARRIER / MONEY ─────────────────────────────────────────────────
    var CARRIER_PREFIXES = {
        Viettel: [
            '032',
            '033',
            '034',
            '035',
            '036',
            '037',
            '038',
            '039',
            '086',
            '096',
            '097',
            '098',
        ],
        Mobifone: ['070', '076', '077', '078', '079', '089', '090', '093'],
        Vinaphone: ['081', '082', '083', '084', '085', '088', '091', '094'],
        Vietnamobile: ['052', '056', '058', '092'],
        Gmobile: ['059', '099'],
        iTel: ['087'],
    };
    var PREFIX_TO_CARRIER = (function () {
        var m = {};
        for (var c in CARRIER_PREFIXES)
            for (var i = 0; i < CARRIER_PREFIXES[c].length; i++) m[CARRIER_PREFIXES[c][i]] = c;
        return m;
    })();
    function detectCarrier(phone) {
        var n = normPhone(phone);
        if (n.length < 3) return '';
        return PREFIX_TO_CARRIER[n.slice(0, 3)] || '';
    }
    function formatCurrency(v) {
        var n = Number(v || 0);
        return n ? n.toLocaleString('vi-VN') : '0';
    }

    // audit r6 (2026-06-21): báo user 1 lần (throttle 60s) khi phiên hết hạn — thay
    // vì im lặng trả {} → cột khách trống không rõ lý do. Vẫn trả {} để không vỡ caller.
    var _authWarnedAt = 0;
    function _warnAuthExpired() {
        var now = Date.now();
        if (now - _authWarnedAt < 60000) return;
        _authWarnedAt = now;
        try {
            if (global.notificationManager && global.notificationManager.show) {
                global.notificationManager.show(
                    'Phiên Web 2.0 hết hạn — đăng nhập lại để xem dữ liệu khách.',
                    'warning'
                );
            }
        } catch (e) {}
    }

    // ── READ ────────────────────────────────────────────────────────────
    async function _post(path, body, timeoutMs) {
        try {
            var r = await fetch(base() + path, {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body),
                signal: AbortSignal.timeout(timeoutMs || 20000),
            });
            var d = await r.json().catch(function () {
                return {};
            });
            // audit r6: TRƯỚC đây không check r.ok → 401 (WEB2_AUTH_ENFORCE=1) trả {}
            // im lặng → batchByPhones/ByFbIds ra Map rỗng, UI trống không báo lỗi.
            if (!r.ok) {
                var msg = (d && d.error) || 'HTTP ' + r.status;
                if (global.console) console.warn('[Web2CustomerStore] POST ' + path + ' → ' + msg);
                if (r.status === 401) _warnAuthExpired();
                return {};
            }
            return (d && d.data) || {};
        } catch (e) {
            if (global.console)
                console.warn('[Web2CustomerStore] POST ' + path + ' fail:', e && e.message);
            return {};
        }
    }

    // batchByPhones(phones) → Map(normPhone(10 số) → rec). Lọc SĐT hợp lệ.
    async function batchByPhones(phones) {
        var map = new Map();
        var uniq = Array.from(new Set((phones || []).map(normPhone).filter(isValidPhone)));
        if (!uniq.length) return map;
        var data = await _post('/batch-by-phone', { phones: uniq });
        for (var k in data) map.set(normPhone(k), data[k]);
        return map;
    }

    // batchByFbIds(fbIds) → Map(fbId → rec). Chunk 500 (cap endpoint).
    async function batchByFbIds(fbIds) {
        var map = new Map();
        var ids = Array.from(new Set((fbIds || []).map(String).filter(Boolean)));
        if (!ids.length) return map;
        for (var i = 0; i < ids.length; i += 500) {
            var chunk = ids.slice(i, i + 500);
            var data = await _post('/batch-by-fbid', { fbIds: chunk });
            for (var j = 0; j < chunk.length; j++)
                if (data[chunk[j]]) map.set(chunk[j], data[chunk[j]]);
        }
        return map;
    }

    async function getByFbId(fbId) {
        var m = await batchByFbIds([fbId]);
        return m.get(String(fbId)) || null;
    }
    async function getByPhone(p) {
        var m = await batchByPhones([p]);
        return m.get(normPhone(p)) || null;
    }

    function _lite(v, phoneKey) {
        v = v || {};
        return {
            id: v.id || v.Id || null,
            name: v.name || v.Name || '',
            address: v.address || v.Address || '',
            status: v.status || v.Status || '',
            phone: normPhone(v.phone || v.Phone || phoneKey || ''),
        };
    }

    // enrich({phones, fbIds}) → {byPhone, byFbId} (lite shape name/address/status/phone).
    async function enrich(opts) {
        opts = opts || {};
        var out = { byPhone: {}, byFbId: {} };
        var jobs = [];
        var phones = (opts.phones || []).map(normPhone).filter(isValidPhone);
        var fbIds = (opts.fbIds || []).map(String).filter(Boolean);
        if (phones.length)
            jobs.push(
                batchByPhones(phones).then(function (m) {
                    m.forEach(function (v, k) {
                        out.byPhone[k] = _lite(v, k);
                    });
                })
            );
        if (fbIds.length)
            jobs.push(
                batchByFbIds(fbIds).then(function (m) {
                    m.forEach(function (v, k) {
                        out.byFbId[k] = _lite(v);
                    });
                })
            );
        await Promise.allSettled(jobs);
        return out;
    }

    // listByPhones(phones) compat (PartnerCustomerApi) → Map keyed by cả input gốc + normPhone.
    async function listByPhones(phones) {
        var map = new Map();
        var inputs = (phones || [])
            .map(function (p) {
                return String(p == null ? '' : p).trim();
            })
            .filter(Boolean);
        var valid = inputs.filter(isValidPhone);
        if (!valid.length) return map;
        var byNorm = await batchByPhones(valid);
        for (var i = 0; i < inputs.length; i++) {
            var orig = inputs[i];
            var rec = byNorm.get(normPhone(orig));
            if (rec) {
                map.set(orig, rec);
                map.set(normPhone(orig), rec);
            }
        }
        return map;
    }

    // list(opts) → {value,count} (partner-compat) từ /list.
    async function list(opts) {
        var o = opts || {};
        var params = new URLSearchParams();
        if (o.search) params.set('search', o.search);
        if (o.status && o.status !== 'all') params.set('status', o.status);
        var top = o.top || o.$top || 50;
        params.set('limit', String(top));
        params.set('page', String(Math.floor((o.skip || o.$skip || 0) / top) + 1));
        try {
            var r = await fetch(base() + '/list?' + params.toString(), {
                headers: authHeaders({ Accept: 'application/json' }),
            });
            var d = await r.json().catch(function () {
                return {};
            });
            var rows = Array.isArray(d.data) ? d.data : [];
            var value = rows.map(function (c) {
                return {
                    Id: c.id,
                    Name: c.name || '',
                    Phone: c.phone || '',
                    Status: c.status || 'Normal',
                    Address: c.address || '',
                    Email: c.email || '',
                };
            });
            return {
                value: value,
                count: d.total || value.length,
                '@odata.count': d.total || value.length,
            };
        } catch (e) {
            if (global.console) console.warn('[Web2CustomerStore] list fail:', e && e.message);
            return { value: [], count: 0 };
        }
    }

    // ── WRITE (tự gắn x-web2-token) ─────────────────────────────────────
    async function patch(id, fields) {
        if (!id) return false;
        try {
            var r = await fetch(base() + '/' + id, {
                method: 'PATCH',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(fields || {}),
                signal: AbortSignal.timeout(15000),
            });
            return r.ok;
        } catch (e) {
            if (global.console) console.warn('[Web2CustomerStore] patch fail:', e && e.message);
            return false;
        }
    }
    async function updateStatus(id, status) {
        return patch(id, { status: status });
    }
    async function patchByFbId(fbId, fields) {
        var rec = await getByFbId(fbId);
        if (!rec || !rec.id) return false;
        return patch(rec.id, fields);
    }
    async function upsert(body) {
        try {
            var r = await fetch(base() + '/upsert', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify(body || {}),
                signal: AbortSignal.timeout(15000),
            });
            var d = await r.json().catch(function () {
                return {};
            });
            return { ok: r.ok, data: (d && d.data) || null };
        } catch (e) {
            if (global.console) console.warn('[Web2CustomerStore] upsert fail:', e && e.message);
            return { ok: false, data: null };
        }
    }
    async function harvestComments(comments) {
        try {
            var r = await fetch(base() + '/harvest-comments', {
                method: 'POST',
                headers: authHeaders({ 'Content-Type': 'application/json' }),
                body: JSON.stringify({ comments: comments || [] }),
                signal: AbortSignal.timeout(20000),
            });
            var d = await r.json().catch(function () {
                return {};
            });
            return (d && d.success && (d.data || {})) || {};
        } catch (e) {
            if (global.console) console.warn('[Web2CustomerStore] harvest fail:', e && e.message);
            return {};
        }
    }

    // ── SSE convenience ─────────────────────────────────────────────────
    function subscribe(cb) {
        if (global.Web2SSE && global.Web2SSE.subscribe)
            return global.Web2SSE.subscribe('web2:customers', cb);
        return function () {};
    }

    global.Web2CustomerStore = {
        // phone
        normPhone: normPhone,
        isValidPhone: isValidPhone,
        // status
        STATUS_TEXT: STATUS_TEXT,
        STATUS_VALUES: STATUS_VALUES,
        statusText: statusText,
        statusClass: statusClass,
        normalize: normalize,
        // carrier/money
        detectCarrier: detectCarrier,
        formatCurrency: formatCurrency,
        // read
        batchByPhones: batchByPhones,
        batchByFbIds: batchByFbIds,
        getByFbId: getByFbId,
        getByPhone: getByPhone,
        enrich: enrich,
        listByPhones: listByPhones,
        list: list,
        // write
        patch: patch,
        updateStatus: updateStatus,
        patchByFbId: patchByFbId,
        upsert: upsert,
        harvestComments: harvestComments,
        // realtime + auth helpers (reuse cho consumer)
        subscribe: subscribe,
        authHeaders: authHeaders,
    };
})(typeof window !== 'undefined' ? window : this);
