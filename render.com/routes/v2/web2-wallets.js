// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// API V2 — Web 2.0 Wallets (ĐỘC LẬP với /v2/wallets cũ của Web 1.0)
// =====================================================================
// Endpoints:
//   GET   /api/web2/wallets               — list all wallets (paginated)
//   GET   /api/web2/wallets/by-phone/:phone — single wallet detail
//   GET   /api/web2/wallets/:phone/transactions — txn history per phone
//   POST  /api/web2/wallets/:phone/withdraw — trừ ví khi mua đơn
//   POST  /api/web2/wallets/:phone/deposit  — admin chỉnh tay cộng tiền
//
// KHÔNG có virtual_credit endpoints — Web 2.0 spec.
// =====================================================================

const express = require('express');
const router = express.Router();
const web2WalletService = require('../../services/web2-wallet-service');
const { requireWeb2AuthSoft } = require('../../middleware/web2-auth');

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2Wallets] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
}

// ── Idempotency (money op manual) ────────────────────────────────────
// Client gửi header `x-idempotency-key` → dùng làm reference_id của tx; trước
// khi chạy, dup-check web2_wallet_transactions (reference_id = key + cùng type)
// → đã có tx → trả lại tx cũ (alreadyProcessed), KHÔNG cộng/trừ lần 2.
// Không gửi header → behavior cũ (không dedupe).
function _idemKey(req) {
    const k = String(req.headers['x-idempotency-key'] || '').trim();
    return k ? k.slice(0, 120) : null;
}

async function _findIdempotentTx(db, key, type) {
    const r = await db.query(
        `SELECT * FROM web2_wallet_transactions
         WHERE reference_id = $1 AND type = $2
         ORDER BY id DESC LIMIT 1`,
        [key, type]
    );
    return r.rows[0] || null;
}

// =====================================================
// GET /api/web2/wallets — list wallets
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = Math.min(parseInt(req.query.limit) || 100, 1000);
        const offset = parseInt(req.query.offset) || 0;
        const { items, total } = await web2WalletService.listWallets(db, { limit, offset });
        res.json({ success: true, data: items, total });
    } catch (e) {
        handleError(res, e, 'List wallets');
    }
});

// =====================================================
// GET /api/web2/wallets/by-phone/:phone
// =====================================================
router.get('/by-phone/:phone', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const wallet = await web2WalletService.getWallet(db, req.params.phone);
        if (!wallet) {
            return res.status(404).json({ success: false, error: 'Wallet not found' });
        }
        res.json({ success: true, data: wallet });
    } catch (e) {
        handleError(res, e, 'Get wallet');
    }
});

// =====================================================
// GET /api/web2/wallets/:phone/transactions
// =====================================================
router.get('/:phone/transactions', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const limit = parseInt(req.query.limit) || 200;
        const type = req.query.type || null;
        const txns = await web2WalletService.listTransactions(db, req.params.phone, {
            limit,
            type,
        });
        res.json({ success: true, data: txns });
    } catch (e) {
        handleError(res, e, 'List transactions');
    }
});

// =====================================================
// POST /api/web2/wallets/:phone/withdraw
// Body: { amount, referenceType, referenceId, note }
// =====================================================
router.post('/:phone/withdraw', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const { amount, referenceType, referenceId, note, userName } = req.body || {};
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'amount > 0 required' });
        }
        const idemKey = _idemKey(req);
        if (idemKey) {
            const dup = await _findIdempotentTx(db, idemKey, 'WITHDRAW');
            if (dup) {
                return res.json({
                    success: true,
                    alreadyProcessed: true,
                    data: { transaction: dup },
                });
            }
        }
        const result = await web2WalletService.processWithdraw(
            db,
            req.params.phone,
            Number(amount),
            // idemKey → reference_type 'manual', reference_id = key (dedupe contract)
            idemKey ? 'manual' : referenceType,
            idemKey || referenceId,
            note,
            // performed_by — audit: ƯU TIÊN user từ token (req.web2User), fallback body
            (req.web2User && (req.web2User.display_name || req.web2User.username)) ||
                userName ||
                req.headers['x-user'] ||
                '(staff)'
        );
        res.json({ success: true, data: result });
    } catch (e) {
        if (String(e.message).includes('Số dư không đủ')) {
            return res.status(400).json({ success: false, error: e.message });
        }
        handleError(res, e, 'Withdraw');
    }
});

// =====================================================
// POST /api/web2/wallets/:phone/deposit
// Body: { amount, note }
// Manual admin top-up (vd: thu tiền mặt cộng vào ví)
// =====================================================
router.post('/:phone/deposit', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const { amount, note, customerId, userName } = req.body || {};
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'amount > 0 required' });
        }
        const idemKey = _idemKey(req);
        if (idemKey) {
            const dup = await _findIdempotentTx(db, idemKey, 'DEPOSIT');
            if (dup) {
                return res.json({
                    success: true,
                    alreadyProcessed: true,
                    data: { transaction: dup },
                });
            }
        }
        const result = await web2WalletService.processDeposit(
            db,
            req.params.phone,
            Number(amount),
            // idemKey → sourceId = key → service lưu reference_id = key (dedupe).
            // Service set reference_type='balance_history' khi có sourceId — dup-check
            // ở trên match theo reference_id + type nên vẫn idempotent.
            idemKey || null,
            note || 'Manual deposit',
            customerId || null,
            null,
            null,
            // performed_by — audit: ƯU TIÊN user từ token (req.web2User), fallback body
            (req.web2User && (req.web2User.display_name || req.web2User.username)) ||
                userName ||
                req.headers['x-user'] ||
                '(staff)'
        );
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Deposit');
    }
});

module.exports = router;
