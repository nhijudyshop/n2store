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

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2Wallets] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
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
router.post('/:phone/withdraw', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const { amount, referenceType, referenceId, note, userName } = req.body || {};
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'amount > 0 required' });
        }
        const result = await web2WalletService.processWithdraw(
            db,
            req.params.phone,
            Number(amount),
            referenceType,
            referenceId,
            note,
            userName || req.headers['x-user'] || '(staff)' // performed_by — audit
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
router.post('/:phone/deposit', async (req, res) => {
    try {
        const db = req.app.locals.web2Db || req.app.locals.chatDb;
        const { amount, note, customerId, userName } = req.body || {};
        if (!amount || Number(amount) <= 0) {
            return res.status(400).json({ success: false, error: 'amount > 0 required' });
        }
        const result = await web2WalletService.processDeposit(
            db,
            req.params.phone,
            Number(amount),
            null,
            note || 'Manual deposit',
            customerId || null,
            null,
            null,
            userName || req.headers['x-user'] || '(staff)' // performed_by — audit
        );
        res.json({ success: true, data: result });
    } catch (e) {
        handleError(res, e, 'Deposit');
    }
});

module.exports = router;
