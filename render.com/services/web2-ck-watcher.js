// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — CK Watcher "chờ tiền về"
// =====================================================
//
// Khi GD SePay MỚI về (transfer_type='in'), tìm tín hiệu CK đã duyệt nhưng CHƯA
// có GD (status='confirmed' AND matched_tx_id IS NULL) khớp → tự đối soát.
//
// Quyết định (user chọn): CHẮC → tự link + cộng ví; KHÔNG chắc → thông báo staff.
//   • CHẮC = SĐT signal có trong nội dung GD, HOẶC đúng tiền (order total == amount)
//     trong ≤24h. + GD chưa gán SĐT khác.
//   • KHÔNG chắc = đúng tiền nhưng không SĐT (>24h / nhiều ứng viên) HOẶC GD đã
//     gán SĐT khác → notification, KHÔNG tự cộng.
//
// An toàn: linkTransaction idempotent (debt_added) → KHÔNG cộng ví 2 lần. Best-effort
// (catch mọi lỗi, KHÔNG vỡ webhook SePay). 1 GD ↔ 1 signal (điểm cao nhất).

'use strict';

const WINDOW_MS = 72 * 60 * 60 * 1000; // chỉ xét signal confirmed trong 72h
const SURE_TIME_MS = 24 * 60 * 60 * 1000;

function _last9(phone) {
    const s = String(phone || '').replace(/\D/g, '');
    return s.length >= 9 ? s.slice(-9) : '';
}

// Score 1 signal với 1 GD. Trả { sure, phoneHit, amountHit }.
function _score(sig, tx) {
    const content = String(tx.content || tx.description || '');
    const digits = content.replace(/\D/g, '');
    const p9 = _last9(sig.phone);
    const phoneHit = !!p9 && digits.includes(p9);
    const expected = sig.order_total != null ? Number(sig.order_total) : null;
    const amount = Number(tx.transfer_amount) || 0;
    const amountHit = expected != null && expected > 0 && expected === amount;
    const txT = tx.transaction_date ? new Date(tx.transaction_date).getTime() : Date.now();
    const within24 = sig.created_at && Math.abs(txT - Number(sig.created_at)) <= SURE_TIME_MS;
    const sure = phoneHit || (amountHit && within24);
    return { sure, phoneHit, amountHit };
}

// data deps = { notify, createNotification, sendMessage } — tất cả optional.
async function onNewSepayTx(db, txId, deps = {}) {
    if (!db || !txId) return;
    try {
        const txQ = await db.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, content, description,
                    transaction_date, linked_customer_phone, debt_added
             FROM web2_balance_history WHERE id = $1`,
            [txId]
        );
        if (!txQ.rows.length) return;
        const tx = txQ.rows[0];
        if (tx.transfer_type !== 'in' || Number(tx.transfer_amount) <= 0) return;

        const now = Date.now();
        // Signals confirmed chưa có GD trong 72h, kèm order total (cho amount match).
        const sigQ = await db.query(
            `SELECT s.*,
                    COALESCE(no.total_amount, fso.amount_total) AS order_total
             FROM web2_payment_signals s
             LEFT JOIN native_orders   no  ON s.matched_order_type='native' AND no.code = s.matched_order_code
             LEFT JOIN fast_sale_orders fso ON s.matched_order_type='fast_sale' AND fso.number = s.matched_order_code
             WHERE s.status='confirmed' AND s.matched_tx_id IS NULL AND s.created_at > $1`,
            [now - WINDOW_MS]
        );
        if (!sigQ.rows.length) return;

        // Chấm điểm, ưu tiên phoneHit > amountHit.
        const scored = sigQ.rows
            .map((sig) => ({ sig, ..._score(sig, tx) }))
            .filter((x) => x.phoneHit || x.amountHit)
            .sort((a, b) => b.phoneHit - a.phoneHit || b.sure - a.sure);
        if (!scored.length) return;

        const best = scored[0];
        const sig = best.sig;
        const txPhone = tx.linked_customer_phone;
        const conflict = txPhone && _last9(txPhone) !== _last9(sig.phone);

        if (best.sure && sig.phone && !conflict) {
            // CHẮC → tự link + cộng ví.
            let credited = false;
            let balance = null;
            try {
                const balanceHistory = require('../routes/v2/web2-balance-history');
                const r = await balanceHistory.linkTransaction(db, {
                    id: tx.id,
                    phone: sig.phone,
                    name: sig.customer_name,
                    verifiedBy: 'auto-watcher',
                });
                credited = !!r.credited;
                balance = r.balance;
            } catch (e) {
                console.warn('[WEB2-CK-WATCHER] linkTransaction failed:', e.message);
            }
            // Set matched_tx_id + history (kể cả khi tx đã credited trước đó).
            await db.query(
                `UPDATE web2_payment_signals
                 SET matched_tx_id = $2, matched_tx_at = $3,
                     history = COALESCE(history,'[]'::jsonb) || $4::jsonb
                 WHERE id = $1`,
                [
                    sig.id,
                    tx.id,
                    now,
                    JSON.stringify([
                        {
                            ts: now,
                            action: 'auto-link',
                            userName: '(watcher tự động)',
                            note: `GD#${tx.id}${credited ? ' +ví' : ''}${best.phoneHit ? ' (SĐT)' : ' (đúng tiền)'}`,
                        },
                    ]),
                ]
            );
            console.log(`[WEB2-CK-WATCHER] auto-link sig#${sig.id} ↔ GD#${tx.id} (sure)`);
            if (typeof deps.notify === 'function') {
                try {
                    deps.notify(
                        'web2:payment-signals',
                        { action: 'auto-link', id: Number(sig.id), ts: now },
                        'update'
                    );
                    deps.notify(
                        'web2:balance-history',
                        { action: 'link', id: Number(tx.id), ts: now },
                        'update'
                    );
                } catch (e) {
                    /* ignore */
                }
            }
            // Auto-reply (chỉ khi vừa cộng ví) — best-effort.
            if (
                credited &&
                typeof deps.sendMessage === 'function' &&
                sig.page_id &&
                sig.conversation_id
            ) {
                const bal =
                    balance != null
                        ? `\nSố dư ví của mình hiện tại: ${Number(balance).toLocaleString('vi-VN')}₫.`
                        : '';
                deps.sendMessage(
                    sig.page_id,
                    sig.conversation_id,
                    sig.psid || null,
                    `Shop đã nhận được chuyển khoản của mình rồi nha 💕${bal}\nCảm ơn mình nhiều ạ!`
                ).catch(() => {});
            }
        } else {
            // KHÔNG chắc → thông báo staff (KHÔNG tự cộng).
            console.log(`[WEB2-CK-WATCHER] medium match GD#${tx.id} ↔ sig#${sig.id} → notify`);
            if (typeof deps.createNotification === 'function') {
                deps.createNotification({
                    type: 'ck_watch_match',
                    severity: 'warning',
                    title: 'GD SePay có thể khớp tín hiệu CK',
                    body: `GD ${Number(tx.transfer_amount).toLocaleString('vi-VN')}₫ có thể là của ${sig.customer_name || sig.phone || 'KH'} — bấm để đối chiếu & duyệt.`,
                    url: '/web2/ck-dashboard/index.html',
                    entity_type: 'payment_signal',
                    entity_id: String(sig.id),
                    dedupe_key: `ckwatch:${tx.id}:${sig.id}`,
                }).catch(() => {});
            }
        }
    } catch (e) {
        console.warn('[WEB2-CK-WATCHER] onNewSepayTx failed:', e.message);
    }
}

module.exports = { onNewSepayTx, _score, _last9 };
