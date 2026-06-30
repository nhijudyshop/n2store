// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 shared — client ví KH /api/web2/wallets (NGUỒN CHUNG).
// =====================================================================
// Web2WalletApi — client ví KHÁCH HÀNG Web 2.0 (full read + mutation).
// SHARED (P3 2026-06-15): chuyển từ web2/customer-wallet/js/ sang web2/shared/
// để mọi trang tham chiếu CHUNG (đọc full ví, nạp/trừ) thay vì reimplement.
// Pill số dư nhẹ (Web2WalletBalance) là surface hiển thị; client này là full.
// =====================================================================
// Endpoints (Render API qua CF worker, fallback DIRECT_BASE):
//   GET    /api/web2/wallets                    — list all
//   GET    /api/web2/wallets/by-phone/:phone    — single wallet (full)
//   POST   /api/web2/wallets/batch-full         — batch full theo SĐT
//   GET    /api/web2/wallets/:phone/transactions — txn history
//   POST   /api/web2/wallets/:phone/withdraw    — trừ ví  (auth x-web2-token)
//   POST   /api/web2/wallets/:phone/deposit     — nạp tay (auth x-web2-token)
//
// ⚠ MONEY OP: deposit/withdraw giữ await + throw-on-error (caller toast/rollback).
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/wallets';
    // Alt direct URL (bypass CF if Worker rate-limit hits)
    const DIRECT_BASE = 'https://web2-api-kv04.onrender.com/api/web2/wallets';

    function normPhone(p) {
        if (window.Web2PhoneUtils && window.Web2PhoneUtils.norm)
            return window.Web2PhoneUtils.norm(p);
        if (global.Web2PhoneUtils) return global.Web2PhoneUtils.norm(p);
        const s = String(p || '').replace(/\D/g, '');
        if (!s) return '';
        if (s.startsWith('84') && s.length >= 11) return '0' + s.slice(2);
        return s;
    }

    async function jsonFetch(url, options) {
        const r = await fetch(url, options);
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

    async function getWallet(phone) {
        const p = normPhone(phone);
        if (!p) return null;
        try {
            const data = await jsonFetch(`${BASE}/by-phone/${encodeURIComponent(p)}`);
            return data?.data || null;
        } catch (e) {
            if (e.status === 404) return null;
            // Try direct if CF proxy fails
            try {
                const data = await jsonFetch(`${DIRECT_BASE}/by-phone/${encodeURIComponent(p)}`);
                return data?.data || null;
            } catch (e2) {
                console.warn('[Web2WalletApi] getWallet fail:', e2.message);
                return null;
            }
        }
    }

    async function listWallets(opts) {
        const limit = (opts && opts.limit) || 200;
        const offset = (opts && opts.offset) || 0;
        try {
            return await jsonFetch(`${BASE}?limit=${limit}&offset=${offset}`);
        } catch (e) {
            return await jsonFetch(`${DIRECT_BASE}?limit=${limit}&offset=${offset}`);
        }
    }

    async function getTransactions(phone, opts) {
        const p = normPhone(phone);
        if (!p) return [];
        const limit = (opts && opts.limit) || 100;
        const type = (opts && opts.type) || '';
        const qs = `?limit=${limit}${type ? `&type=${encodeURIComponent(type)}` : ''}`;
        try {
            const data = await jsonFetch(`${BASE}/${encodeURIComponent(p)}/transactions${qs}`);
            return data?.data || [];
        } catch (e) {
            try {
                const data = await jsonFetch(
                    `${DIRECT_BASE}/${encodeURIComponent(p)}/transactions${qs}`
                );
                return data?.data || [];
            } catch (e2) {
                console.warn('[Web2WalletApi] getTransactions fail:', e2.message);
                return [];
            }
        }
    }

    // Audit: tên staff thao tác ví → backend ghi performed_by (kiểm tra khi sai sót).
    function _userName() {
        return window.Web2UserInfo?.get?.()?.userName || window.Web2UserInfo?.label?.() || null;
    }

    // ENFORCE-PREP (2026-06-12): gắn x-web2-token cho mutation ví
    // (/api/web2/wallets/:phone/withdraw|deposit — soft-gate → WEB2_AUTH_ENFORCE=1).
    // Fallback đọc thẳng localStorage nếu page không load web2-auth.js.
    function _authHeaders(extra) {
        if (window.Web2Auth?.authHeaders) return window.Web2Auth.authHeaders(extra);
        try {
            const t = JSON.parse(localStorage.getItem('web2_auth'))?.token;
            return t ? { ...(extra || {}), 'x-web2-token': t } : { ...(extra || {}) };
        } catch {
            return { ...(extra || {}) };
        }
    }

    // audit d-fix #3 (2026-06-21): caller NÊN truyền `idempotencyKey` ỔN ĐỊNH (sinh 1
    // lần mỗi lần mở modal — KHÔNG sinh lại mỗi click) để double-click / retry 524 được
    // dedupe: server dùng nó làm reference_id (in-tx dup-check + partial unique index).
    // THIẾU key → server sinh UUID per-request → 2 request rời (double-click) mang 2 key
    // KHÁC nhau → KHÔNG dedupe → cộng/trừ ví 2 lần. (UI vẫn nên disable nút khi submit.)
    async function deposit(phone, amount, note, customerId, idempotencyKey) {
        const p = normPhone(phone);
        if (!p) throw new Error('Phone không hợp lệ');
        const url = `${BASE}/${encodeURIComponent(p)}/deposit`;
        const headers = _authHeaders({ 'Content-Type': 'application/json' }); // ENFORCE-PREP
        if (idempotencyKey) headers['x-idempotency-key'] = String(idempotencyKey);
        return await jsonFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ amount, note, customerId, userName: _userName() }),
        });
    }

    async function withdraw(phone, amount, referenceType, referenceId, note, idempotencyKey) {
        const p = normPhone(phone);
        if (!p) throw new Error('Phone không hợp lệ');
        const url = `${BASE}/${encodeURIComponent(p)}/withdraw`;
        const headers = _authHeaders({ 'Content-Type': 'application/json' }); // ENFORCE-PREP
        // referenceId (business ref, vd PBH) có thể trùng giữa các lần; idempotencyKey
        // (header) mới là khoá dedupe double-click. Mặc định fallback referenceId nếu
        // caller chưa truyền key riêng (ổn khi referenceId duy nhất/lần thao tác).
        const idem = idempotencyKey || referenceId;
        if (idem) headers['x-idempotency-key'] = String(idem);
        return await jsonFetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({
                amount,
                referenceType,
                referenceId,
                note,
                userName: _userName(),
            }),
        });
    }

    // Batch — 1 POST /batch-full cho TẤT CẢ SĐT (thay N GET /by-phone). Chunk 500.
    // Fallback: pool per-phone nếu batch endpoint lỗi/chưa deploy.
    async function getWalletsByPhones(phones, opts) {
        const list = Array.from(
            new Set((phones || []).map(normPhone).filter((p) => p && p.length >= 9))
        );
        const out = new Map();
        if (!list.length) return out;
        try {
            for (let i = 0; i < list.length; i += 500) {
                const chunk = list.slice(i, i + 500);
                const tryBatch = async (base) => {
                    const data = await jsonFetch(`${base}/batch-full`, {
                        method: 'POST',
                        headers: _authHeaders({ 'Content-Type': 'application/json' }),
                        body: JSON.stringify({ phones: chunk }),
                    });
                    return data?.data || {};
                };
                let map;
                try {
                    map = await tryBatch(BASE);
                } catch {
                    map = await tryBatch(DIRECT_BASE);
                }
                for (const phone of chunk) {
                    if (map[phone]) out.set(phone, map[phone]);
                }
            }
            return out;
        } catch (e) {
            console.warn('[Web2WalletApi] getWalletsByPhones batch fail → fallback:', e.message);
        }
        // Fallback per-phone (legacy)
        const conc = (opts && opts.concurrency) || 5;
        const queue = [...list];
        const workers = [];
        for (let i = 0; i < Math.min(conc, queue.length); i++) {
            workers.push(
                (async () => {
                    while (queue.length) {
                        const phone = queue.shift();
                        const wallet = await getWallet(phone);
                        if (wallet) out.set(phone, wallet);
                    }
                })()
            );
        }
        await Promise.all(workers);
        return out;
    }

    function formatVnd(n) {
        if (global.Web2Format) return global.Web2Format.vnd(n);
        return Math.round(Number(n) || 0).toLocaleString('vi-VN') + '₫';
    }

    global.Web2WalletApi = {
        normPhone,
        getWallet,
        listWallets,
        getTransactions,
        getWalletsByPhones,
        deposit,
        withdraw,
        formatVnd,
    };
})(window);
