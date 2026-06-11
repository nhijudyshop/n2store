// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
//
// wallet-failure-store.js — SHARED wallet identity + failure ledger (Web 1.0).
//
// Single source of truth dùng chung cho orders-report (tab1) VÀ don-inbox:
//   - window.getOrderWalletIdentity : 1 chain định danh đơn cho CẢ trừ ví lẫn hoàn ví
//   - window.WalletFailureStore     : sổ nợ localStorage các thao tác ví fail
//   - window.retryWalletOpFailures(): re-POST mọi thao tác fail (server idempotent)
//   - window._cancelledOrderNumbers / _walletWithdrawalsPromise : race guards
//
// Load TRƯỚC tab1-sale.js / tab1-fast-sale.js / tab1-fast-sale-workflow.js.
// Bọc IIFE — không tạo const global, load 2 lần vô hại.

(function () {
    'use strict';
    if (window.WalletFailureStore) return; // already loaded

    const WALLET_API_BASE = 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const WALLET_PLACEHOLDER_IDS = ['N/A', 'NA', 'UNDEFINED', 'NULL', 'NONE', ''];

    /**
     * Compute the canonical wallet identity for an order.
     * @returns {{orderNumber: string, normalizedPhone: string, valid: boolean}}
     */
    window.getOrderWalletIdentity = function (order, invoiceData) {
        order = order || {};
        invoiceData = invoiceData || {};

        const rawNumber =
            order.Number ||
            order.Code ||
            order.Reference ||
            invoiceData.Number ||
            invoiceData.Code ||
            '';
        const orderNumber = String(rawNumber).trim();

        const rawPhone =
            order.Partner?.Phone ||
            order.PartnerPhone ||
            order.Telephone ||
            order.ReceiverPhone ||
            order.Phone ||
            invoiceData.Partner?.Phone ||
            invoiceData.PartnerPhone ||
            invoiceData.ReceiverPhone ||
            '';
        let normalizedPhone = String(rawPhone || '').replace(/\D/g, '');
        if (normalizedPhone.startsWith('84') && normalizedPhone.length > 9) {
            normalizedPhone = '0' + normalizedPhone.substring(2);
        }

        const valid =
            !!orderNumber &&
            !WALLET_PLACEHOLDER_IDS.includes(orderNumber.toUpperCase()) &&
            !!normalizedPhone;

        return { orderNumber, normalizedPhone, valid };
    };

    /**
     * Persistent ledger of wallet ops that failed client-side (deduct or refund).
     * Lives in localStorage so a refresh/crash can't lose them.
     */
    window.WalletFailureStore = {
        KEY: 'n2_wallet_op_failures',
        _read() {
            try {
                return JSON.parse(localStorage.getItem(this.KEY) || '[]');
            } catch (_) {
                return [];
            }
        },
        _write(list) {
            try {
                localStorage.setItem(this.KEY, JSON.stringify(list.slice(-100)));
            } catch (_) {
                /* storage full / disabled — best effort */
            }
        },
        _key(e) {
            return `${e.type}|${e.orderNumber}|${e.phone}`;
        },
        /** entry: {type:'DEDUCT'|'REFUND', orderNumber, phone, amount, error, source, reason, note} */
        add(entry) {
            if (!entry || !entry.orderNumber) return;
            const k = this._key(entry);
            const list = this._read().filter((e) => this._key(e) !== k);
            list.push({ ...entry, ts: Date.now() });
            this._write(list);
        },
        remove(type, orderNumber, phone) {
            const k = `${type}|${orderNumber}|${phone}`;
            this._write(this._read().filter((e) => this._key(e) !== k));
        },
        all() {
            return this._read();
        },
        clear() {
            this._write([]);
        },
        notifyIfAny() {
            const list = this._read();
            if (!list.length) return;
            const deducts = list.filter((e) => e.type === 'DEDUCT').length;
            const refunds = list.filter((e) => e.type === 'REFUND').length;
            const parts = [];
            if (deducts) parts.push(`${deducts} trừ ví`);
            if (refunds) parts.push(`${refunds} hoàn ví`);
            const msg = `⚠️ Có ${list.length} thao tác ví CHƯA HOÀN TẤT (${parts.join(', ')}). ` +
                `Mở Console gõ retryWalletOpFailures() hoặc bấm thử lại để xử lý.`;
            if (window.notificationManager?.error) {
                window.notificationManager.error(msg, 0);
            }
            console.warn('[WALLET-FAILURE] Pending wallet ops need attention:', list);
        },
    };

    /** Re-attempt every stored wallet failure. Server is idempotent, so this is safe. */
    window.retryWalletOpFailures = async function () {
        const list = window.WalletFailureStore.all();
        if (!list.length) {
            window.notificationManager?.info('Không có thao tác ví nào cần thử lại');
            return;
        }
        const performedBy = window.authManager?.getAuthState()?.username || 'system';
        let ok = 0;
        let fail = 0;
        for (const e of list) {
            try {
                let resp;
                if (e.type === 'DEDUCT') {
                    resp = await fetch(`${WALLET_API_BASE}/api/v2/pending-withdrawals`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            order_id: e.orderNumber,
                            order_number: e.orderNumber,
                            phone: e.phone,
                            amount: e.amount,
                            source: e.source || 'FAST_SALE',
                            note: e.note || `Thử lại trừ ví đơn ${e.orderNumber}`,
                            created_by: performedBy,
                        }),
                    });
                } else {
                    resp = await fetch(`${WALLET_API_BASE}/api/v2/wallets/refund-by-order`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            order_id: e.orderNumber,
                            phone: e.phone,
                            reason: e.reason || 'Thử lại hoàn ví',
                            created_by: performedBy,
                        }),
                    });
                }
                const data = await resp.json().catch(() => ({}));
                if (resp.ok && data.success) {
                    window.WalletFailureStore.remove(e.type, e.orderNumber, e.phone);
                    ok++;
                } else {
                    fail++;
                }
            } catch (_) {
                fail++;
            }
        }
        const note = `Thử lại ví: ${ok} thành công${fail ? `, ${fail} vẫn lỗi` : ''}`;
        window.notificationManager?.[fail ? 'error' : 'success']?.(note);
        return { ok, fail };
    };

    // Cross-flow race guards (fix A8): orders the user cancelled before deduction
    // finished, and a handle to the in-flight deduction batch promise.
    window._cancelledOrderNumbers = window._cancelledOrderNumbers || new Set();
    window._walletWithdrawalsPromise = window._walletWithdrawalsPromise || null;

    // Surface any unfinished wallet ops shortly after the page settles.
    (function scheduleWalletFailureNotice() {
        const run = () => setTimeout(() => window.WalletFailureStore.notifyIfAny(), 1500);
        if (document.readyState === 'complete') run();
        else window.addEventListener('load', run, { once: true });
    })();
})();
