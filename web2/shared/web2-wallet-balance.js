// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — shared helper hiển thị số dư ví KH.
// =====================================================================
// Web2WalletBalance — lấy số dư ví Web 2.0 theo SĐT + render "pill" số dư.
// Dùng chung mọi nơi có hiển thị tên/SĐT khách (balance-history bảng,
// modal chọn KH multi-match, modal gán KH, dropdown tìm KH, …).
// =====================================================================
//   • getBalances/attachBalances → POST /api/web2/wallets/batch-summary
//     (1 request cho cả trang, KHÔNG còn N request /by-phone gây 404-spam).
//     getBalance (1 SĐT) vẫn GET /by-phone/:phone cho lookup lẻ.
//   • Cache theo SĐT (TTL 60s, cache cả số dư 0) để không re-fetch.
//   • attachBalances(root): quét [data-w2wallet-phone] → inject pill số dư.
//   • SSE web2:wallet:* → invalidate cache để lần sau lấy số mới.
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/wallets';
    const DIRECT_BASE = 'https://web2-api-kv04.onrender.com/api/web2/wallets';

    function _w2Auth(extra) {
        if (window.Web2Auth && window.Web2Auth.authHeaders)
            return window.Web2Auth.authHeaders(extra || {});
        var h = Object.assign({}, extra || {});
        try {
            var t = JSON.parse(localStorage.getItem('web2_auth') || 'null');
            if (t && t.token) h['x-web2-token'] = t.token;
        } catch (e) {}
        return h;
    }
    const TTL_MS = 60000; // số dư ví đổi chậm — cache 60s là đủ tươi
    const _cache = new Map(); // phone -> { balance:number, ts:number }
    const _inflight = new Map(); // phone -> Promise<number>

    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (window.Web2PhoneUtils) return window.Web2PhoneUtils.norm(p);
        let s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) s = '0' + s.slice(2);
        return s;
    }

    function fmtVnd(n) {
        if (window.Web2Format) return window.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }

    async function _fetchBalance(phone) {
        // P3 (2026-06-15): nếu client ví đầy đủ (Web2WalletApi) có mặt → reuse
        // (1 nguồn đọc /by-phone). Pill vẫn độc lập khi trang không load client đó.
        if (global.Web2WalletApi && global.Web2WalletApi.getWallet) {
            const w = await global.Web2WalletApi.getWallet(phone);
            return w ? Number(w.balance) || 0 : 0;
        }
        const tryFetch = async (base) => {
            const r = await fetch(`${base}/by-phone/${encodeURIComponent(phone)}`);
            if (r.status === 404) return 0; // chưa có ví → số dư 0
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const body = await r.json();
            return Number(body?.data?.balance) || 0;
        };
        try {
            return await tryFetch(BASE);
        } catch {
            try {
                return await tryFetch(DIRECT_BASE);
            } catch (e) {
                console.warn('[Web2WalletBalance] fetch fail', phone, e.message);
                return null; // null = không xác định (khác 0 = đã biết = 0)
            }
        }
    }

    async function getBalance(phoneRaw) {
        const phone = normPhone(phoneRaw);
        if (!phone || phone.length < 9) return null;
        const hit = _cache.get(phone);
        if (hit && Date.now() - hit.ts < TTL_MS) return hit.balance;
        if (_inflight.has(phone)) return _inflight.get(phone);
        const p = (async () => {
            const balance = await _fetchBalance(phone);
            if (balance !== null) _cache.set(phone, { balance, ts: Date.now() });
            _inflight.delete(phone);
            return balance;
        })();
        _inflight.set(phone, p);
        return p;
    }

    // 1 request cho nhiều SĐT — POST /batch-summary (3W3). KH chưa có ví →
    // KHÔNG xuất hiện trong data → coi = 0. Trả Map phone->number (0 nếu chưa ví).
    async function _fetchBatch(phones) {
        const body = JSON.stringify({ phones });
        const tryFetch = async (base) => {
            const r = await fetch(`${base}/batch-summary`, {
                method: 'POST',
                headers: _w2Auth({ 'Content-Type': 'application/json' }),
                body,
            });
            if (!r.ok) throw new Error(`HTTP ${r.status}`);
            const j = await r.json();
            const data = (j && j.data) || {};
            const map = new Map();
            for (const ph of phones) {
                const v = data[ph];
                map.set(ph, v ? Number(v.total) || 0 : 0);
            }
            return map;
        };
        try {
            return await tryFetch(BASE);
        } catch {
            return await tryFetch(DIRECT_BASE); // throw nếu cả 2 fail → caller fallback
        }
    }

    async function getBalances(phones, opts) {
        const list = Array.from(
            new Set((phones || []).map(normPhone).filter((p) => p && p.length >= 9))
        );
        const out = new Map();
        if (!list.length) return out;

        // 1) Cache còn tươi → dùng luôn; còn lại gom để fetch.
        const now = Date.now();
        const need = [];
        for (const phone of list) {
            const hit = _cache.get(phone);
            if (hit && now - hit.ts < TTL_MS) out.set(phone, hit.balance);
            else need.push(phone);
        }
        if (!need.length) return out;

        // 2) 1 batch request cho tất cả SĐT chưa cache (thay N request /by-phone).
        try {
            const map = await _fetchBatch(need);
            const ts = Date.now();
            for (const phone of need) {
                const bal = map.has(phone) ? map.get(phone) : 0;
                _cache.set(phone, { balance: bal, ts }); // cache cả 0 → khỏi re-fetch
                out.set(phone, bal);
            }
            return out;
        } catch (e) {
            // 3) Fallback: pool per-phone (legacy) nếu batch endpoint lỗi/không tồn tại.
            const conc = (opts && opts.concurrency) || 6;
            const queue = [...need];
            const workers = [];
            const n = Math.min(conc, queue.length);
            for (let i = 0; i < n; i++) {
                workers.push(
                    (async () => {
                        while (queue.length) {
                            const phone = queue.shift();
                            out.set(phone, await getBalance(phone));
                        }
                    })()
                );
            }
            await Promise.all(workers);
            return out;
        }
    }

    // Markup 1 pill số dư ví. balance: number|null
    // Quy ước: chỉ hiện khi số dư > 0. 0đ hoặc chưa xác định → không hiện gì.
    function pillHtml(balance) {
        if (!(Number(balance) > 0)) return '';
        return `<span class="w2wb-pill w2wb-has" title="Số dư ví — bấm xem lịch sử thanh toán">Ví: ${fmtVnd(balance)}</span>`;
    }

    function ensureStyles() {
        if (document.getElementById('w2wb-styles')) return;
        const s = document.createElement('style');
        s.id = 'w2wb-styles';
        s.textContent = `
            .w2wb-pill { display: inline-flex; align-items: center; gap: 3px; padding: 1px 8px; border-radius: 999px; font-size: 11px; font-weight: 600; line-height: 1.5; white-space: nowrap; font-variant-numeric: tabular-nums; cursor: pointer; transition: filter .12s ease, box-shadow .12s ease; }
            .w2wb-pill.w2wb-has { background: #dcfce7; color: #166534; border: 1px solid #bbf7d0; }
            .w2wb-pill.w2wb-has:hover { filter: brightness(.97); box-shadow: 0 1px 4px rgba(22,101,52,.25); }
        `;
        document.head.appendChild(s);
    }

    // Quét root tìm [data-w2wallet-phone] chưa render → fetch batch → inject pill.
    async function attachBalances(root) {
        if (!root) return;
        ensureStyles();
        const els = Array.from(root.querySelectorAll('[data-w2wallet-phone]')).filter(
            (el) => !el.dataset.w2wbDone
        );
        if (!els.length) return;
        // Collect phones (pill ẩn khi loading/0 — không set placeholder)
        const phones = [];
        els.forEach((el) => {
            const phone = normPhone(el.getAttribute('data-w2wallet-phone'));
            if (!phone || phone.length < 9) {
                el.dataset.w2wbDone = '1';
                return;
            }
            el.dataset.w2wbPhone = phone;
            phones.push(phone);
        });
        if (!phones.length) return;
        const map = await getBalances(phones);
        els.forEach((el) => {
            if (el.dataset.w2wbDone) return;
            const phone = el.dataset.w2wbPhone;
            if (!phone) return;
            el.innerHTML = pillHtml(map.has(phone) ? map.get(phone) : null);
            el.dataset.w2wbDone = '1';
        });
    }

    function invalidate(phoneRaw) {
        if (!phoneRaw) {
            _cache.clear();
            return;
        }
        _cache.delete(normPhone(phoneRaw));
    }

    // ── Click pill → mở modal chi tiết KH (lịch sử ví/thanh toán + đơn) ──────
    // Modal Web2CustomerDetailModal nằm cùng folder shared. Lazy-load 1 lần từ
    // chính src của script này (không cần sửa từng trang). Hoạt động ở MỌI nơi
    // có pill (balance-history, native-orders, web2-pancake, partner-customer,
    // ck-dashboard, payment-confirm, overview).
    let _modalLoading = null;
    function _ownBase() {
        // URL folder của script này (…/web2/shared/).
        try {
            const cur =
                document.currentScript ||
                Array.from(document.scripts).find((s) =>
                    /web2-wallet-balance\.js/.test(s.src || '')
                );
            if (cur && cur.src) return cur.src.replace(/[^/]*\?.*$|[^/]*$/, '');
        } catch {}
        return '';
    }
    function _ensureModal() {
        if (global.Web2CustomerDetailModal) return Promise.resolve(true);
        if (_modalLoading) return _modalLoading;
        const base = _ownBase();
        _modalLoading = new Promise((resolve) => {
            const s = document.createElement('script');
            s.src = base + 'web2-customer-detail-modal.js?v=20260606ck';
            s.onload = () => resolve(!!global.Web2CustomerDetailModal);
            s.onerror = () => resolve(false);
            document.head.appendChild(s);
        });
        return _modalLoading;
    }
    async function _openDetail(phone, name) {
        const p = normPhone(phone);
        if (!p) return;
        const okm = await _ensureModal();
        if (okm && global.Web2CustomerDetailModal?.open) {
            global.Web2CustomerDetailModal.open(p, name || '');
        }
    }
    // Delegated click — pill có thể nằm trong row có handler riêng → stopPropagation.
    function _wireClick() {
        if (global.__w2wbClickWired) return;
        global.__w2wbClickWired = true;
        document.addEventListener(
            'click',
            (e) => {
                const pill = e.target.closest?.('.w2wb-pill');
                if (!pill) return;
                const host = pill.closest('[data-w2wallet-phone]');
                const phone =
                    host?.getAttribute?.('data-w2wallet-phone') || host?.dataset?.w2wbPhone;
                if (!phone) return;
                e.preventDefault();
                e.stopPropagation();
                // tên KH gần nhất (nếu có) để tiêu đề đẹp
                const nameEl = host.closest('[data-w2wallet-name]');
                _openDetail(phone, nameEl?.getAttribute('data-w2wallet-name') || '');
            },
            true
        );
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _wireClick);
    } else {
        _wireClick();
    }

    // SSE: ví đổi → xoá cache để lần render sau lấy số mới.
    let _sseUnsubs = [];
    function _wireSse() {
        if (!global.Web2SSE?.subscribe) return;
        try {
            _sseUnsubs.push(
                global.Web2SSE.subscribe('web2:wallet:*', (evt) => {
                    const phone = evt?.data?.phone;
                    invalidate(phone || null);
                })
            );
            _sseUnsubs.push(
                global.Web2SSE.subscribe('web2:customer-wallet', () => invalidate(null))
            );
            // Cleanup khi rời trang (shared module dùng nhiều trang → chống leak).
            global.addEventListener(
                'pagehide',
                () => {
                    _sseUnsubs.forEach((u) => {
                        try {
                            u && u();
                        } catch {}
                    });
                    _sseUnsubs = [];
                },
                { once: true }
            );
        } catch {}
    }
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', _wireSse);
    } else {
        _wireSse();
    }

    global.Web2WalletBalance = {
        normPhone,
        fmtVnd,
        getBalance,
        getBalances,
        pillHtml,
        attachBalances,
        invalidate,
        openDetail: _openDetail, // mở modal lịch sử thanh toán KH theo SĐT (programmatic)
    };
})(window);
