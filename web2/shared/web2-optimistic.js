// #Note: WEB2.0 module. UI-first optimistic op helper.
// Codifies pattern: snapshot → apply optimistic UI → fire backend background →
// rollback + notify nếu lỗi. Mục đích: mọi thao tác user trên Web 2.0 cảm thấy
// tức thì, không chờ network.
//
// Usage:
//   Web2Optimistic.run({
//       apply: () => { STATE.foo = 'new'; renderRow(); showToast('✓ Đã lưu'); },
//       rollback: (prev) => { STATE.foo = prev; renderRow(); },
//       snapshot: () => structuredClone(STATE.foo),
//       run: async () => {
//           const r = await fetch('/api/...', { ... });
//           const d = await r.json();
//           if (!d.success) throw new Error(d.error || 'unknown');
//           return d;
//       },
//       onSuccess: (d) => { /* sync silent với data authoritative nếu cần */ },
//       errLabel: 'lưu đơn',  // → "Lỗi lưu đơn: <message>"
//   });
//
// Pattern returns undefined (NOT a Promise) — caller không cần await. Backend
// chạy fire-and-forget. Errors handled internally + show toast/notif.

(function (global) {
    'use strict';

    if (global.Web2Optimistic) return;

    function _notify(msg, type) {
        // Feedback Lottie subtle (web2-only, throttled, không bao giờ chặn flow).
        // Burst success/error giữa-trên màn hình — bổ sung cho toast, không thay.
        try {
            const W2L = global.Web2Lottie;
            if (W2L && W2L.config?.autoFeedback !== false) {
                type === 'err' ? W2L.error() : W2L.success();
            }
        } catch {
            /* ignore — feedback là phụ */
        }
        if (global.notificationManager?.show) {
            global.notificationManager.show(msg, type === 'err' ? 'error' : 'success');
            return;
        }
        // Fallback: console + alert nếu critical
        if (type === 'err') console.error('[Web2Optimistic]', msg);
        else console.log('[Web2Optimistic]', msg);
    }

    /**
     * Chạy 1 thao tác UI-first.
     *
     * Flow:
     *   1. snapshot() → lưu state cũ (sync)
     *   2. apply() → update UI optimistic (sync)
     *   3. run() → fetch backend async, errors throw
     *   4a. Success → onSuccess(d) nếu có
     *   4b. Fail → rollback(prevSnapshot) + notify error
     *
     * @param {object} opts
     * @param {() => any} [opts.snapshot] Hàm trả về snapshot state để rollback. Optional.
     * @param {() => void} opts.apply Hàm apply optimistic UI (badge/toast/DOM update).
     * @param {(prev: any) => void} [opts.rollback] Hàm restore state khi lỗi. Nhận snapshot.
     * @param {() => Promise<any>} opts.run Backend op. Throw nếu fail.
     * @param {(data: any) => void} [opts.onSuccess] Hook sau backend OK — sync silent.
     * @param {string} [opts.errLabel] Phần tả lỗi (vd "lưu đơn") → "Lỗi lưu đơn: msg".
     * @param {string} [opts.successMsg] Toast success NGAY khi apply (optional).
     * @returns {void} Sync return — caller không await.
     */
    function run(opts) {
        if (!opts || typeof opts.apply !== 'function' || typeof opts.run !== 'function') {
            console.warn('[Web2Optimistic] missing apply or run');
            return;
        }
        const prev = typeof opts.snapshot === 'function' ? opts.snapshot() : null;
        try {
            opts.apply();
        } catch (e) {
            console.error('[Web2Optimistic] apply failed:', e);
            return;
        }
        if (opts.successMsg) _notify(opts.successMsg, 'ok');

        (async () => {
            try {
                const d = await opts.run();
                if (typeof opts.onSuccess === 'function') {
                    try {
                        opts.onSuccess(d);
                    } catch (e) {
                        console.warn('[Web2Optimistic] onSuccess hook fail:', e);
                    }
                }
            } catch (e) {
                if (typeof opts.rollback === 'function') {
                    try {
                        opts.rollback(prev);
                    } catch (re) {
                        console.error('[Web2Optimistic] rollback fail:', re);
                    }
                }
                const label = opts.errLabel || 'thao tác';
                const msg = e?.message || String(e);
                _notify(`✗ Lỗi ${label}: ${msg}`, 'err');
            }
        })();
    }

    global.Web2Optimistic = { run };
})(typeof window !== 'undefined' ? window : globalThis);
