// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 shared.
/**
 * LiveCustomerSync — NGUỒN CHUNG đồng bộ KH giữa 2 trang comment livestream
 * (live-chat/index.html desktop + comments-mobile.html) và KHO KH web2_customers.
 *
 * Bidirectional:
 *   • READ  (kho → trang): enrich({phones, fbIds}) gọi batch-by-phone +
 *     batch-by-fbid → trả {byPhone, byFbId} (name/phone/address/status) để trang
 *     lấp SĐT/địa chỉ/trạng thái lên từng dòng comment.
 *   • WRITE (trang → kho): harvest(comments) gom KH MỚI từ comment (fb_id/name/
 *     phone/page) → POST /harvest-comments (server KHÔNG ghi đè SĐT/địa chỉ/tên
 *     sẵn có: trùng SĐT→alt_phones, field rỗng mới fill, KH mới thì tạo) →
 *     server _notify('web2:customers') → trang web2/customers/ tự reload.
 *
 * Xử lý CẢ 2 shape comment: desktop FB-native (c.from.id, c._phones, c._pageObj)
 * và mobile raw DB row (c.fb_id, c.phone, c.page_id). Harvest có dedupe + debounce.
 */
(function (global) {
    'use strict';
    if (global.LiveCustomerSync) return;

    var WORKER_DEFAULT =
        (window.API_CONFIG && window.API_CONFIG.WORKER_URL) ||
        'https://chatomni-proxy.nhijudyshop.workers.dev';

    // /customers/* gate requireWeb2AuthSoft (PII) → fallback path (khi Web2CustomerStore
    // chưa load) PHẢI tự gửi x-web2-token, không lệ thuộc caller truyền headers. (audit 2026-06-30)
    function authHeaders() {
        var base = { 'Content-Type': 'application/json' };
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(base);
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) base['x-web2-token'] = t.token;
        } catch (e) {
            /* no token */
        }
        return base;
    }

    function norm(s) {
        var d = String(s == null ? '' : s).replace(/\D/g, '');
        if (d.indexOf('84') === 0 && d.length >= 11) d = '0' + d.slice(2);
        if (d.length === 9 && d[0] !== '0') d = '0' + d;
        return d;
    }
    function pickFb(c) {
        return String(c.fb_id || (c.from && c.from.id) || '');
    }
    function pickName(c) {
        return String(c.customer_name || (c.from && c.from.name) || '');
    }
    function pickPhone(c) {
        if (c.phone) {
            var n0 = norm(c.phone);
            if (n0.length === 10) return n0;
        }
        var a = c._phones;
        var ph = Array.isArray(a) && a.length ? a[0] : null;
        if (ph) {
            var v = typeof ph === 'string' ? ph : ph.phone_number || ph.phone || '';
            var n = norm(v);
            if (n.length === 10) return n;
        }
        var m = String(c.message || '')
            .replace(/[.\s()\-_]/g, '')
            .match(/(?:\+?84|0)(\d{9})(?!\d)/);
        return m ? '0' + m[1] : '';
    }
    function pickPageId(c) {
        return String(
            c.page_id || (c._pageObj && (c._pageObj.Facebook_PageId || c._pageObj.Id)) || ''
        );
    }

    async function post(url, body, headers) {
        var r = await fetch(url, {
            method: 'POST',
            headers: headers || { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(15000),
        });
        var j = await r.json().catch(function () {
            return null;
        });
        return j && j.success ? j.data || {} : {};
    }

    // ---- READ: enrich từ kho web2_customers (dual phone + fb_id) ----
    async function enrich(opts) {
        opts = opts || {};
        // NGUỒN DUY NHẤT: Web2CustomerStore.enrich (gom 2026-06-15) — validate
        // SĐT 10 số chặt + auth header. Fallback inline nếu store chưa load.
        if (global.Web2CustomerStore && global.Web2CustomerStore.enrich)
            return global.Web2CustomerStore.enrich({
                phones: opts.phones || [],
                fbIds: opts.fbIds || [],
            });
        var worker = opts.workerUrl || WORKER_DEFAULT;
        var headers = opts.headers || authHeaders();
        var phones = (opts.phones || []).map(norm).filter(function (p) {
            return p && p.length >= 9;
        });
        var fbIds = (opts.fbIds || []).map(String).filter(Boolean);
        var out = { byPhone: {}, byFbId: {} };
        var jobs = [];
        if (phones.length) {
            jobs.push(
                post(
                    worker + '/api/web2/customers/batch-by-phone',
                    { phones: phones },
                    headers
                ).then(function (d) {
                    for (var k in d) {
                        var v = d[k] || {};
                        out.byPhone[norm(k)] = {
                            name: v.Name || v.name || '',
                            address: v.Address || v.address || '',
                            status: v.Status || v.status || '',
                            phone: norm(v.Phone || v.phone || k),
                        };
                    }
                })
            );
        }
        if (fbIds.length) {
            jobs.push(
                post(worker + '/api/web2/customers/batch-by-fbid', { fbIds: fbIds }, headers).then(
                    function (d) {
                        for (var k in d) {
                            var v = d[k] || {};
                            out.byFbId[String(k)] = {
                                name: v.name || v.Name || '',
                                address: v.address || v.Address || '',
                                status: v.status || v.Status || '',
                                phone: norm(v.phone || v.Phone || ''),
                            };
                        }
                    }
                )
            );
        }
        await Promise.allSettled(jobs);
        return out;
    }

    // ---- WRITE: harvest KH mới từ comment → kho (dedupe + debounce 1.5s) ----
    var _seen = new Set();
    var _queue = [];
    var _timer = null;
    var _opts = null;

    function harvest(comments, opts) {
        if (opts) _opts = opts;
        var list = Array.isArray(comments) ? comments : [];
        for (var i = 0; i < list.length; i++) {
            var c = list[i];
            var fbId = pickFb(c);
            if (!fbId) continue;
            var phone = pickPhone(c);
            var dk = fbId + '|' + phone;
            if (_seen.has(dk)) continue;
            _seen.add(dk);
            _queue.push({
                fbId: fbId,
                name: pickName(c),
                phone: phone || undefined,
                fbPageId: pickPageId(c) || undefined,
            });
        }
        if (_queue.length && !_timer) _timer = setTimeout(flushHarvest, 1500);
    }

    async function flushHarvest() {
        _timer = null;
        var batch = _queue.splice(0, 500);
        if (!batch.length) return;
        try {
            // NGUỒN DUY NHẤT: Web2CustomerStore.harvestComments (auth header).
            if (global.Web2CustomerStore && global.Web2CustomerStore.harvestComments) {
                await global.Web2CustomerStore.harvestComments(batch);
            } else {
                var worker = (_opts && _opts.workerUrl) || WORKER_DEFAULT;
                var headers = (_opts && _opts.headers) || authHeaders();
                await post(
                    worker + '/api/web2/customers/harvest-comments',
                    { comments: batch },
                    headers
                );
            }
        } catch (e) {
            if (global.console) console.warn('[LiveCustomerSync] harvest fail:', e && e.message);
        }
        if (_queue.length) _timer = setTimeout(flushHarvest, 1500);
    }

    function reset() {
        _seen = new Set();
        _queue = [];
        if (_timer) {
            clearTimeout(_timer);
            _timer = null;
        }
    }

    global.LiveCustomerSync = {
        enrich: enrich,
        harvest: harvest,
        reset: reset,
        norm: norm,
    };
})(typeof window !== 'undefined' ? window : this);
