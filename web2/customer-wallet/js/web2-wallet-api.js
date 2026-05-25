// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module — client cho /api/web2/wallets.
// =====================================================================
// Web2WalletApi — thin client cho Web 2.0 wallet endpoints
// =====================================================================
// Endpoints (Render API):
//   GET    /api/web2/wallets                    — list all
//   GET    /api/web2/wallets/by-phone/:phone    — single wallet
//   GET    /api/web2/wallets/:phone/transactions — txn history
//   POST   /api/web2/wallets/:phone/withdraw    — trừ ví
//   POST   /api/web2/wallets/:phone/deposit     — admin nạp tay
//
// KHÔNG cần auth — Render API mở rộng cho proxy CF.
// =====================================================================

(function (global) {
    'use strict';

    const BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev/api/web2/wallets';
    // Alt direct URL (bypass CF if Worker rate-limit hits)
    const DIRECT_BASE = 'https://n2store-fallback.onrender.com/api/web2/wallets';

    function normPhone(p) {
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

    async function deposit(phone, amount, note, customerId) {
        const p = normPhone(phone);
        if (!p) throw new Error('Phone không hợp lệ');
        const url = `${BASE}/${encodeURIComponent(p)}/deposit`;
        return await jsonFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, note, customerId }),
        });
    }

    async function withdraw(phone, amount, referenceType, referenceId, note) {
        const p = normPhone(phone);
        if (!p) throw new Error('Phone không hợp lệ');
        const url = `${BASE}/${encodeURIComponent(p)}/withdraw`;
        return await jsonFetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ amount, referenceType, referenceId, note }),
        });
    }

    // Batch — lấy nhiều ví song song
    async function getWalletsByPhones(phones, opts) {
        const conc = (opts && opts.concurrency) || 5;
        const list = Array.from(
            new Set((phones || []).map(normPhone).filter((p) => p && p.length >= 9))
        );
        const out = new Map();
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
