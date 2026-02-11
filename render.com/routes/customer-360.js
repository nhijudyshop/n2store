/**
 * =====================================================
 * CUSTOMER 360 ROUTES - V1 COMPATIBILITY LAYER
 * =====================================================
 *
 * DEPRECATED: All logic has been moved to V2 routes.
 * This file only provides backward-compatible proxying
 * from V1 endpoints to V2 endpoints.
 *
 * V2 Source of Truth:
 *   - render.com/routes/v2/customers.js
 *   - render.com/routes/v2/wallets.js
 *   - render.com/routes/v2/tickets.js
 *   - render.com/routes/v2/balance-history.js
 *
 * Will be removed after confirming no external callers.
 * =====================================================
 */

const express = require('express');
const router = express.Router();

// Import V2 routers to forward requests
const v2CustomersRouter = require('./v2/customers');
const v2WalletsRouter = require('./v2/wallets');
const v2TicketsRouter = require('./v2/tickets');
const v2BalanceHistoryRouter = require('./v2/balance-history');

// Helper: log deprecation warning
function deprecationWarning(req, v2Path) {
    console.warn(`[DEPRECATED] V1 ${req.method} ${req.originalUrl} → V2 ${v2Path}. Update client to use /api/v2/ endpoints.`);
}

// =====================================================
// CUSTOMER ENDPOINTS → V2 /customers
// =====================================================

// GET /api/customer/:phone/quick-view → GET /api/v2/customers/:phone/quick-view
router.get('/customer/:phone/quick-view', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}/quick-view`);
    req.url = `/${req.params.phone}/quick-view`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customer/:phone/activities → GET /api/v2/customers/:phone/activity
router.get('/customer/:phone/activities', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}/activity`);
    req.url = `/${req.params.phone}/activity`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customer/:phone/transactions → GET /api/v2/customers/:phone/transactions
router.get('/customer/:phone/transactions', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}/transactions`);
    req.url = `/${req.params.phone}/transactions`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customer/:phone/tickets → GET /api/v2/tickets?phone=:phone
router.get('/customer/:phone/tickets', (req, res, next) => {
    deprecationWarning(req, `/api/v2/tickets?phone=${req.params.phone}`);
    req.url = '/';
    req.query.phone = req.params.phone;
    v2TicketsRouter.handle(req, res, next);
});

// GET /api/customer/:phone → GET /api/v2/customers/:phone
router.get('/customer/:phone', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}`);
    req.url = `/${req.params.phone}`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customer/batch → POST /api/v2/customers/batch
router.post('/customer/batch', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/batch');
    req.url = '/batch';
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customer → POST /api/v2/customers
router.post('/customer', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers');
    req.url = '/';
    v2CustomersRouter.handle(req, res, next);
});

// PUT /api/customer/:phone → PATCH /api/v2/customers/:phone
router.put('/customer/:phone', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}`);
    req.method = 'PATCH';
    req.url = `/${req.params.phone}`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customer/:phone/note → POST /api/v2/customers/:phone/notes
router.post('/customer/:phone/note', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.phone}/notes`);
    req.url = `/${req.params.phone}/notes`;
    req.params.id = req.params.phone;
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customer-search-v2 → POST /api/v2/customers/search
router.post('/customer-search-v2', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/search');
    req.url = '/search';
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/transactions/consolidated → GET /api/v2/customers/:phone/transactions
router.get('/transactions/consolidated', (req, res, next) => {
    const phone = req.query.phone;
    if (!phone) {
        return res.status(400).json({ success: false, error: 'phone query parameter is required' });
    }
    deprecationWarning(req, `/api/v2/customers/${phone}/transactions`);
    req.url = `/${phone}/transactions`;
    req.params = { id: phone };
    v2CustomersRouter.handle(req, res, next);
});

// =====================================================
// WALLET ENDPOINTS → V2 /wallets
// =====================================================

// POST /api/wallet/batch-summary → POST /api/v2/wallets/batch-summary
router.post('/wallet/batch-summary', (req, res, next) => {
    deprecationWarning(req, '/api/v2/wallets/batch-summary');
    req.url = '/batch-summary';
    v2WalletsRouter.handle(req, res, next);
});

// POST /api/wallet/cron/expire → POST /api/v2/wallets/cron/expire
router.post('/wallet/cron/expire', (req, res, next) => {
    deprecationWarning(req, '/api/v2/wallets/cron/expire');
    req.url = '/cron/expire';
    v2WalletsRouter.handle(req, res, next);
});

// POST /api/wallet/cron/process-bank-transactions → POST /api/v2/wallets/cron/process-bank
router.post('/wallet/cron/process-bank-transactions', (req, res, next) => {
    deprecationWarning(req, '/api/v2/wallets/cron/process-bank');
    req.url = '/cron/process-bank';
    v2WalletsRouter.handle(req, res, next);
});

// GET /api/wallet/:phone → GET /api/v2/wallets/:phone
router.get('/wallet/:phone', (req, res, next) => {
    deprecationWarning(req, `/api/v2/wallets/${req.params.phone}`);
    req.url = `/${req.params.phone}`;
    req.params.customerId = req.params.phone;
    v2WalletsRouter.handle(req, res, next);
});

// POST /api/wallet/:phone/deposit → POST /api/v2/wallets/:phone/deposit
router.post('/wallet/:phone/deposit', (req, res, next) => {
    deprecationWarning(req, `/api/v2/wallets/${req.params.phone}/deposit`);
    req.url = `/${req.params.phone}/deposit`;
    req.params.customerId = req.params.phone;
    v2WalletsRouter.handle(req, res, next);
});

// POST /api/wallet/:phone/withdraw → POST /api/v2/wallets/:phone/withdraw
router.post('/wallet/:phone/withdraw', (req, res, next) => {
    deprecationWarning(req, `/api/v2/wallets/${req.params.phone}/withdraw`);
    req.url = `/${req.params.phone}/withdraw`;
    req.params.customerId = req.params.phone;
    v2WalletsRouter.handle(req, res, next);
});

// POST /api/wallet/:phone/virtual-credit → POST /api/v2/wallets/:phone/credit
router.post('/wallet/:phone/virtual-credit', (req, res, next) => {
    deprecationWarning(req, `/api/v2/wallets/${req.params.phone}/credit`);
    req.url = `/${req.params.phone}/credit`;
    req.params.customerId = req.params.phone;
    v2WalletsRouter.handle(req, res, next);
});

// =====================================================
// TICKET ENDPOINTS → V2 /tickets
// =====================================================

// GET /api/ticket/stats → GET /api/v2/tickets/stats (must be before :code)
router.get('/ticket/stats', (req, res, next) => {
    deprecationWarning(req, '/api/v2/tickets/stats');
    req.url = '/stats';
    v2TicketsRouter.handle(req, res, next);
});

// GET /api/ticket → GET /api/v2/tickets
router.get('/ticket', (req, res, next) => {
    deprecationWarning(req, '/api/v2/tickets');
    req.url = '/';
    v2TicketsRouter.handle(req, res, next);
});

// GET /api/ticket/:code → GET /api/v2/tickets/:code
router.get('/ticket/:code', (req, res, next) => {
    deprecationWarning(req, `/api/v2/tickets/${req.params.code}`);
    req.url = `/${req.params.code}`;
    req.params.id = req.params.code;
    v2TicketsRouter.handle(req, res, next);
});

// POST /api/ticket → POST /api/v2/tickets
router.post('/ticket', (req, res, next) => {
    deprecationWarning(req, '/api/v2/tickets');
    req.url = '/';
    v2TicketsRouter.handle(req, res, next);
});

// PUT /api/ticket/:code → PATCH /api/v2/tickets/:code
router.put('/ticket/:code', (req, res, next) => {
    deprecationWarning(req, `/api/v2/tickets/${req.params.code}`);
    req.method = 'PATCH';
    req.url = `/${req.params.code}`;
    req.params.id = req.params.code;
    v2TicketsRouter.handle(req, res, next);
});

// POST /api/ticket/:code/action → POST /api/v2/tickets/:code/resolve
router.post('/ticket/:code/action', (req, res, next) => {
    deprecationWarning(req, `/api/v2/tickets/${req.params.code}/resolve`);
    req.url = `/${req.params.code}/resolve`;
    req.params.id = req.params.code;
    v2TicketsRouter.handle(req, res, next);
});

// DELETE /api/ticket/:code → DELETE /api/v2/tickets/:code
router.delete('/ticket/:code', (req, res, next) => {
    deprecationWarning(req, `/api/v2/tickets/${req.params.code}`);
    req.url = `/${req.params.code}`;
    req.params.id = req.params.code;
    v2TicketsRouter.handle(req, res, next);
});

// =====================================================
// BALANCE HISTORY ENDPOINTS → V2 /balance-history
// =====================================================

// GET /api/balance-history/unlinked → GET /api/v2/balance-history?linked=false
router.get('/balance-history/unlinked', (req, res, next) => {
    deprecationWarning(req, '/api/v2/balance-history?linked=false');
    req.url = '/';
    req.query.linked = 'false';
    v2BalanceHistoryRouter.handle(req, res, next);
});

// POST /api/balance-history/link-customer → POST /api/v2/balance-history/:id/link
router.post('/balance-history/link-customer', (req, res, next) => {
    const transactionId = req.body.transaction_id;
    if (!transactionId) {
        return res.status(400).json({ success: false, error: 'transaction_id is required' });
    }
    deprecationWarning(req, `/api/v2/balance-history/${transactionId}/link`);
    req.url = `/${transactionId}/link`;
    req.params = { id: transactionId };
    v2BalanceHistoryRouter.handle(req, res, next);
});

module.exports = router;
