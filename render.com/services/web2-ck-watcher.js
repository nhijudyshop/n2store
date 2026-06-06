// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// Web 2.0 — CK Watcher "chờ tiền về" (TỰ ĐỘNG HOÀN TOÀN)
// =====================================================
//
// Khi GD SePay MỚI về (transfer_type='in'), tìm tín hiệu CK ("KH báo đã CK") CHƯA
// có GD (matched_tx_id IS NULL) khớp → tự đối soát, KHÔNG cần staff bấm tay.
//
// Xét CẢ signal status='pending' (KH vừa báo, chưa ai duyệt) LẪN 'confirmed'
// (staff đã duyệt, chờ tiền). Khi khớp CHẮC → auto-confirm (pending→confirmed) +
// cộng ví + gửi tin báo KH. Đây là điểm "tự động hoàn toàn": KH nhắn "đã ck" và
// tiền về khớp → hệ thống tự xử lý trọn vẹn.
//
// Quyết định khớp (ưu tiên giảm dần, chỉ auto khi CHẮC):
//   • phoneHit   — SĐT signal == SĐT GD (linked_customer_phone, QR registry, hoặc
//                  trong nội dung). Định danh chắc chắn.
//   • partnerHit — customer_id signal == customer_id QR (partner_id TPOS, unique).
//   • nameHit    — tên KH signal == tên KH trên QR/GD VÀ là ứng viên DUY NHẤT
//                  (cùng tên) trong các signal chưa khớp → resolve SĐT từ GD.
//   • amountHit  — đúng số tiền (order total) trong ≤24h VÀ duy nhất.
// Không chắc (đúng tiền nhiều ứng viên, tên trùng, GD gán SĐT khác) → thông báo
// staff (KHÔNG tự cộng).
//
// SĐT để cộng ví = sig.phone || SĐT resolve từ GD (QR/linked). Ví keyed theo SĐT.
//
// An toàn: linkTransaction idempotent (debt_added) → KHÔNG cộng 2 lần; cộng đúng
// SĐT resolve được nên GD ambiguous (PENDING) cũng được CK signal giải quyết.
// Best-effort (catch mọi lỗi, KHÔNG vỡ webhook SePay). 1 GD ↔ 1 signal (điểm cao nhất).

'use strict';

const WINDOW_MS = 72 * 60 * 60 * 1000; // chỉ xét signal trong 72h
const SURE_TIME_MS = 24 * 60 * 60 * 1000;

function _last9(phone) {
    const s = String(phone || '').replace(/\D/g, '');
    return s.length >= 9 ? s.slice(-9) : '';
}

// Normalize tên KH để so khớp (lowercase, bỏ dấu, collapse space).
function _normName(name) {
    if (!name) return '';
    return String(name)
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .replace(/đ/g, 'd')
        .replace(/[^a-z0-9 ]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

// Resolve danh tính GD từ QR registry (web2_payment_qr_codes) qua nội dung.
// Trả { phone, name, customerId } | {} — best-effort, KHÔNG ném lỗi.
async function _resolveTxIdentity(db, tx) {
    const out = {
        phone: tx.linked_customer_phone || null,
        name: tx.display_name || null,
        customerId: null,
    };
    try {
        const { extractIdentifier } = require('./web2-content-extractor');
        const content = String(tx.content || tx.description || '');
        const ex = extractIdentifier(content);
        const candidates = ex.qrCandidates || [];
        if (candidates.length) {
            const q = await db.query(
                `SELECT qr_code, phone, customer_name, customer_id
                 FROM web2_payment_qr_codes WHERE qr_code = ANY($1) LIMIT 1`,
                [candidates]
            );
            if (q.rows.length) {
                out.phone = out.phone || q.rows[0].phone || null;
                out.name = out.name || q.rows[0].customer_name || null;
                out.customerId =
                    q.rows[0].customer_id != null ? Number(q.rows[0].customer_id) : null;
            }
        }
    } catch (e) {
        /* registry/extractor có thể vắng ở test → bỏ qua */
    }
    return out;
}

// Score 1 signal với 1 GD (đã resolve identity txId). Trả các cờ hit.
function _score(sig, tx, txId) {
    const content = String(tx.content || tx.description || '');
    const digits = content.replace(/\D/g, '');
    const p9 = _last9(sig.phone);
    const txP9 = _last9(txId.phone);
    // phoneHit: SĐT signal khớp SĐT GD (resolve được) HOẶC xuất hiện trong nội dung.
    const phoneHit = !!p9 && ((!!txP9 && txP9 === p9) || digits.includes(p9));
    // partnerHit: customer_id signal == customer_id QR (partner_id TPOS).
    const sigCid = sig.customer_id != null ? Number(sig.customer_id) : null;
    const partnerHit = sigCid != null && txId.customerId != null && sigCid === txId.customerId;
    // nameHit: tên signal == tên GD/QR (chỉ ý nghĩa khi GD resolve được SĐT để cộng).
    const sn = _normName(sig.customer_name);
    const tn = _normName(txId.name);
    const nameHit = !!sn && !!tn && sn === tn && !!_last9(txId.phone);
    const expected = sig.order_total != null ? Number(sig.order_total) : null;
    const amount = Number(tx.transfer_amount) || 0;
    const amountHit = expected != null && expected > 0 && expected === amount;
    const txT = tx.transaction_date ? new Date(tx.transaction_date).getTime() : Date.now();
    const within24 = sig.created_at && Math.abs(txT - Number(sig.created_at)) <= SURE_TIME_MS;
    return { phoneHit, partnerHit, nameHit, amountHit, within24 };
}

// data deps = { notify, createNotification, sendMessage } — tất cả optional.
async function onNewSepayTx(db, txId, deps = {}) {
    if (!db || !txId) return;
    try {
        const txQ = await db.query(
            `SELECT id, sepay_id, transfer_amount, transfer_type, content, description,
                    display_name, transaction_date, linked_customer_phone, debt_added
             FROM web2_balance_history WHERE id = $1`,
            [txId]
        );
        if (!txQ.rows.length) return;
        const tx = txQ.rows[0];
        if (tx.transfer_type !== 'in' || Number(tx.transfer_amount) <= 0) return;

        const now = Date.now();
        const txIdentity = await _resolveTxIdentity(db, tx);

        // Signals CHƯA có GD trong 72h (pending + confirmed), kèm order total.
        // customer_id: cột mới (detector) — COALESCE NULL an toàn nếu chưa có.
        const sigQ = await db.query(
            `SELECT s.*,
                    COALESCE(no.total_amount, fso.amount_total) AS order_total
             FROM web2_payment_signals s
             LEFT JOIN native_orders   no  ON s.matched_order_type='native' AND no.code = s.matched_order_code
             LEFT JOIN fast_sale_orders fso ON s.matched_order_type='fast_sale' AND fso.number = s.matched_order_code
             WHERE s.status IN ('pending','confirmed')
               AND s.matched_tx_id IS NULL AND s.created_at > $1`,
            [now - WINDOW_MS]
        );
        if (!sigQ.rows.length) return;

        // Chấm điểm tất cả.
        const scored = sigQ.rows
            .map((sig) => ({ sig, ..._score(sig, tx, txIdentity) }))
            .filter((x) => x.phoneHit || x.partnerHit || x.nameHit || x.amountHit);
        if (!scored.length) return;

        // Đếm để xác định "duy nhất" cho nameHit / amountHit.
        const nameHitCount = scored.filter((x) => x.nameHit).length;
        const amountHitCount = scored.filter((x) => x.amountHit).length;

        // Phân loại "sure" mỗi ứng viên.
        for (const x of scored) {
            x.sure =
                x.phoneHit ||
                x.partnerHit ||
                (x.nameHit && nameHitCount === 1) ||
                (x.amountHit && x.within24 && amountHitCount === 1);
            // ưu tiên: phone > partner > name > amount
            x.rank = x.phoneHit ? 4 : x.partnerHit ? 3 : x.nameHit ? 2 : 1;
        }
        scored.sort((a, b) => b.sure - a.sure || b.rank - a.rank);

        const best = scored[0];
        const sig = best.sig;
        // SĐT để cộng ví: ưu tiên SĐT signal, fallback SĐT resolve từ GD.
        const creditPhone = sig.phone || txIdentity.phone || null;
        const txP9 = _last9(txIdentity.phone);
        const sigP9 = _last9(sig.phone);
        // Xung đột: cả 2 có SĐT nhưng khác nhau → KHÔNG auto.
        const conflict = !!sigP9 && !!txP9 && sigP9 !== txP9;

        if (best.sure && creditPhone && !conflict) {
            // CHẮC → tự link + cộng ví (GD ambiguous PENDING cũng được giải quyết
            // vì ta cộng cho ĐÚNG SĐT resolve được). + auto-confirm nếu pending.
            let credited = false;
            let reconciled = false;
            try {
                const balanceHistory = require('../routes/v2/web2-balance-history');
                const r = await balanceHistory.linkTransaction(db, {
                    id: tx.id,
                    phone: creditPhone,
                    name: sig.customer_name || txIdentity.name,
                    verifiedBy: 'auto-watcher',
                });
                credited = !!r.credited;
                reconciled = !!r.alreadyProcessed; // đã cộng đúng SĐT từ trước
            } catch (e) {
                console.warn('[WEB2-CK-WATCHER] linkTransaction failed:', e.message);
            }

            const wasPending = sig.status === 'pending';
            const hitLabel = best.phoneHit
                ? '(SĐT)'
                : best.partnerHit
                  ? '(partner)'
                  : best.nameHit
                    ? '(tên)'
                    : '(đúng tiền)';
            // Auto-confirm (nếu pending) + set matched_tx_id + SĐT (nếu signal trống)
            // + history — 1 UPDATE.
            await db.query(
                `UPDATE web2_payment_signals
                 SET status = 'confirmed',
                     confirmed_at = COALESCE(confirmed_at, $5),
                     confirmed_by = COALESCE(confirmed_by, $6),
                     phone = COALESCE(NULLIF(phone,''), $7),
                     matched_tx_id = $2, matched_tx_at = $3,
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
                            note: `GD#${tx.id}${credited ? ' +ví' : reconciled ? ' (đã cộng trước)' : ''} ${hitLabel}${wasPending ? ' · auto-duyệt' : ''}`,
                        },
                    ]),
                    now,
                    '(watcher tự động)',
                    creditPhone,
                ]
            );
            console.log(
                `[WEB2-CK-WATCHER] auto-link sig#${sig.id} ↔ GD#${tx.id} ${hitLabel}${wasPending ? ' (auto-confirm)' : ''}`
            );
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
            // Auto-reply khi cộng ví HOẶC GD đã cộng đúng SĐT (đối soát) — best-effort.
            if (
                (credited || reconciled) &&
                typeof deps.sendMessage === 'function' &&
                sig.page_id &&
                sig.conversation_id
            ) {
                const amt = `\nSố tiền chuyển khoản: ${Number(tx.transfer_amount).toLocaleString('vi-VN')}₫.`;
                deps.sendMessage(
                    sig.page_id,
                    sig.conversation_id,
                    sig.psid || null,
                    `Shop đã nhận được chuyển khoản của mình rồi nha 💕${amt}\nCảm ơn mình nhiều ạ!`
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

module.exports = { onNewSepayTx, _score, _last9, _normName, _resolveTxIdentity };
