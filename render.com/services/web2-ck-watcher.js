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
// ⚠ amountHit (CHỈ trùng số tiền, KHÔNG định danh) KHÔNG auto — 2 KH có thể cùng
//   số tiền → gửi nhầm khách. Chỉ NOTIFY staff duyệt tay. → chỉ auto khi định
//   danh khách thật sự khớp GD (đảm bảo gửi đúng khách trong danh sách "đã ck").
// Không chắc (chỉ trùng tiền, tên trùng nhiều, GD gán SĐT khác) → thông báo
// staff (KHÔNG tự cộng/gửi).
//
// SĐT để cộng ví = sig.phone || SĐT resolve từ GD (QR/linked). Ví keyed theo SĐT.
//
// An toàn: linkTransaction idempotent (debt_added) → KHÔNG cộng 2 lần; cộng đúng
// SĐT resolve được nên GD ambiguous (PENDING) cũng được CK signal giải quyết.
// Best-effort (catch mọi lỗi, KHÔNG vỡ webhook SePay). 1 GD ↔ 1 signal (điểm cao nhất).

'use strict';

const WINDOW_MS = 72 * 60 * 60 * 1000; // chỉ xét signal/GD trong 72h
const SURE_TIME_MS = 24 * 60 * 60 * 1000;

// Deps mặc định (SSE notify + createNotification + sendMessage) — inject 1 lần
// lúc boot qua initDeps. Dùng cho onNewSignal (server.js) khi không truyền deps;
// onNewSepayTx (sepay-webhook-core) vẫn truyền deps explicit (merge, explicit thắng).
let _deps = {};
function initDeps(deps) {
    _deps = deps || {};
}

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

function _hitLabel(h) {
    return h.phoneHit ? '(SĐT)' : h.partnerHit ? '(partner)' : h.nameHit ? '(tên)' : '(đúng tiền)';
}

// Phân loại "sure" + "rank" cho mảng scored (mỗi phần tử có cờ hit từ _score).
// CHỈ auto khi ĐỊNH DANH khách khớp GD → đảm bảo gửi đúng khách trong danh sách
// "đã ck": phone / partner_id (TPOS) / tên-duy-nhất.
// ⚠ amountHit (CHỈ trùng số tiền) KHÔNG đủ để auto — 2 KH có thể cùng số tiền →
//   gửi nhầm khách. amountHit chỉ là tín hiệu phụ → đẩy về NOTIFY staff duyệt tay.
function _classify(scored) {
    const nameHitCount = scored.filter((x) => x.nameHit).length;
    for (const x of scored) {
        x.sure =
            x.phoneHit || // SĐT khớp — chắc chắn đúng người
            x.partnerHit || // partner_id TPOS khớp — chắc chắn
            (x.nameHit && nameHitCount === 1); // tên trùng GD/QR + DUY NHẤT
        // amountHit KHÔNG vào "sure" nữa (tránh gửi nhầm khách trùng số tiền).
        x.rank = x.phoneHit ? 4 : x.partnerHit ? 3 : x.nameHit ? 2 : 1; // phone>partner>tên>tiền
    }
}

// Áp 1 match CHẮC: CLAIM signal (atomic) → cộng ví → auto-confirm → reply.
// CLAIM (UPDATE ... WHERE matched_tx_id IS NULL) đảm bảo chỉ 1 nguồn thắng race
// (onNewSepayTx vs onNewSignal chạy gần nhau) → KHÔNG double-credit/double-reply.
// Trả 'applied' | 'lost_race' | 'not_sure'.
async function _applyMatch(db, sig, tx, txIdentity, best, deps, now) {
    const creditPhone = sig.phone || txIdentity.phone || null;
    const txP9 = _last9(txIdentity.phone);
    const sigP9 = _last9(sig.phone);
    const conflict = !!sigP9 && !!txP9 && sigP9 !== txP9; // 2 SĐT khác nhau → KHÔNG auto
    if (!best.sure || !creditPhone || conflict) return 'not_sure';

    // 1) CLAIM atomic (chỉ thắng nếu signal chưa có GD).
    const claim = await db.query(
        `UPDATE web2_payment_signals
         SET status='confirmed',
             confirmed_at = COALESCE(confirmed_at, $3),
             confirmed_by = COALESCE(confirmed_by, $4),
             phone = COALESCE(NULLIF(phone,''), $5),
             matched_tx_id = $2, matched_tx_at = $3
         WHERE id = $1 AND matched_tx_id IS NULL
         RETURNING id`,
        [sig.id, tx.id, now, '(watcher tự động)', creditPhone]
    );
    if (!claim.rows.length) return 'lost_race'; // signal đã được nguồn khác link

    // 2) Cộng ví — idempotent (debt_added). GD ambiguous PENDING cũng giải quyết
    //    vì cộng cho ĐÚNG SĐT resolve được.
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

    // 3) history.
    const wasPending = sig.status === 'pending';
    const label = _hitLabel(best);
    await db.query(
        `UPDATE web2_payment_signals
         SET history = COALESCE(history,'[]'::jsonb) || $2::jsonb WHERE id = $1`,
        [
            sig.id,
            JSON.stringify([
                {
                    ts: now,
                    action: 'auto-link',
                    userName: '(watcher tự động)',
                    note: `GD#${tx.id}${credited ? ' +ví' : reconciled ? ' (đã cộng trước)' : ''} ${label}${wasPending ? ' · auto-duyệt' : ''}`,
                },
            ]),
        ]
    );
    console.log(
        `[WEB2-CK-WATCHER] auto-link sig#${sig.id} ↔ GD#${tx.id} ${label}${wasPending ? ' (auto-confirm)' : ''}`
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
    return 'applied';
}

function _notifyMedium(deps, tx, sig) {
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

// ═══════════════════════════════════════════════════════════════════════
// Chiều 1: GD SePay MỚI về → tìm signal "đã ck" khớp (KH nhắn TRƯỚC, tiền SAU).
// deps optional (sepay-webhook-core truyền explicit).
// ═══════════════════════════════════════════════════════════════════════
async function onNewSepayTx(db, txId, deps = {}) {
    if (!db || !txId) return;
    const d = { ..._deps, ...deps };
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

        const scored = sigQ.rows
            .map((sig) => ({ sig, ..._score(sig, tx, txIdentity) }))
            .filter((x) => x.phoneHit || x.partnerHit || x.nameHit || x.amountHit);
        if (!scored.length) return;
        _classify(scored);
        scored.sort((a, b) => b.sure - a.sure || b.rank - a.rank);

        const best = scored[0];
        const res = await _applyMatch(db, best.sig, tx, txIdentity, best, d, now);
        if (res === 'not_sure') _notifyMedium(d, tx, best.sig);
    } catch (e) {
        console.warn('[WEB2-CK-WATCHER] onNewSepayTx failed:', e.message);
    }
}

// ═══════════════════════════════════════════════════════════════════════
// Chiều 2: signal "đã ck" MỚI tạo → tìm GD SePay ĐÃ về khớp (tiền về TRƯỚC,
// KH nhắn "đã ck" SAU). sig = row vừa INSERT (handleIncoming). deps optional
// (server.js inject qua initDeps lúc boot).
// ═══════════════════════════════════════════════════════════════════════
async function onNewSignal(db, sig, deps = {}) {
    if (!db || !sig || !sig.id || sig.matched_tx_id) return;
    const d = { ..._deps, ...deps };
    try {
        const now = Date.now();
        // order_total cho amountHit.
        let orderTotal = null;
        if (sig.matched_order_code && sig.matched_order_type) {
            try {
                const oq =
                    sig.matched_order_type === 'native'
                        ? await db.query(
                              `SELECT total_amount AS t FROM native_orders WHERE code=$1`,
                              [sig.matched_order_code]
                          )
                        : await db.query(
                              `SELECT amount_total AS t FROM fast_sale_orders WHERE number=$1`,
                              [sig.matched_order_code]
                          );
                orderTotal = oq.rows[0]?.t != null ? Number(oq.rows[0].t) : null;
            } catch (e) {
                /* ignore */
            }
        }
        const sigT = { ...sig, order_total: orderTotal };

        // GD 'in' 72h CHƯA bị signal nào claim.
        const txQ = await db.query(
            `SELECT bh.id, bh.sepay_id, bh.transfer_amount, bh.transfer_type, bh.content, bh.description,
                    bh.display_name, bh.transaction_date, bh.linked_customer_phone, bh.debt_added
             FROM web2_balance_history bh
             WHERE bh.transfer_type='in' AND bh.transfer_amount > 0
               AND bh.transaction_date > NOW() - INTERVAL '72 hours'
               AND NOT EXISTS (SELECT 1 FROM web2_payment_signals s2 WHERE s2.matched_tx_id = bh.id)
             ORDER BY bh.transaction_date DESC
             LIMIT 200`
        );
        if (!txQ.rows.length) return;

        const scored = [];
        for (const tx of txQ.rows) {
            const txIdentity = await _resolveTxIdentity(db, tx);
            const sc = _score(sigT, tx, txIdentity);
            if (sc.phoneHit || sc.partnerHit || sc.nameHit || sc.amountHit) {
                scored.push({
                    tx,
                    txIdentity,
                    ...sc,
                    txTime: tx.transaction_date ? new Date(tx.transaction_date).getTime() : 0,
                });
            }
        }
        if (!scored.length) return;
        _classify(scored);
        scored.sort((a, b) => b.sure - a.sure || b.rank - a.rank || b.txTime - a.txTime);

        const best = scored[0];
        const res = await _applyMatch(db, sigT, best.tx, best.txIdentity, best, d, now);
        if (res === 'not_sure') _notifyMedium(d, best.tx, sigT);
    } catch (e) {
        console.warn('[WEB2-CK-WATCHER] onNewSignal failed:', e.message);
    }
}

module.exports = {
    onNewSepayTx,
    onNewSignal,
    initDeps,
    _score,
    _last9,
    _normName,
    _resolveTxIdentity,
};
