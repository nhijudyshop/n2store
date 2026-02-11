/**
 * =====================================================
 * CUSTOMERS ROUTES - V1 COMPATIBILITY LAYER
 * =====================================================
 *
 * DEPRECATED: All logic has been moved to V2 routes.
 * This file only provides backward-compatible proxying
 * from V1 endpoints to V2 endpoints.
 *
 * V2 Source of Truth: render.com/routes/v2/customers.js
 *
 * Will be removed after confirming no external callers.
 * =====================================================
 */

const express = require('express');
const router = express.Router();

// Import V2 router
const v2CustomersRouter = require('./v2/customers');

// Helper: log deprecation warning
function deprecationWarning(req, v2Path) {
    console.warn(`[DEPRECATED] V1 ${req.method} ${req.originalUrl} → V2 ${v2Path}. Update client to use /api/v2/ endpoints.`);
}

// =====================================================
// STATIC ROUTES (before /:id to avoid conflicts)
// =====================================================

// GET /api/customers/search → POST /api/v2/customers/search
router.get('/search', async (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/search');
    // Convert GET query to POST body for V2
    req.method = 'POST';
    req.url = '/search';
    req.body = {
        query: req.query.q || req.query.query || '',
        limit: parseInt(req.query.limit) || 50
    };
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customers/stats → GET /api/v2/customers/stats
router.get('/stats', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/stats');
    req.url = '/stats';
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customers/duplicates → GET /api/v2/customers/duplicates
router.get('/duplicates', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/duplicates');
    req.url = '/duplicates';
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customers/recent → GET /api/v2/customers/recent
router.get('/recent', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/recent');
    req.url = '/recent';
    v2CustomersRouter.handle(req, res, next);
});

// GET /api/customers → GET /api/v2/customers
router.get('/', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers');
    req.url = '/';
    v2CustomersRouter.handle(req, res, next);
});

// =====================================================
// PARAMETERIZED ROUTES
// =====================================================

// GET /api/customers/:id → GET /api/v2/customers/:id
router.get('/:id', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.id}`);
    req.url = `/${req.params.id}`;
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customers → POST /api/v2/customers
router.post('/', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers');
    req.url = '/';
    v2CustomersRouter.handle(req, res, next);
});

// POST /api/customers/batch → POST /api/v2/customers/import
router.post('/batch', (req, res, next) => {
    deprecationWarning(req, '/api/v2/customers/import');
    req.url = '/import';
    v2CustomersRouter.handle(req, res, next);
});

// PUT /api/customers/:id → PATCH /api/v2/customers/:id
router.put('/:id', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.id}`);
    req.method = 'PATCH';
    req.url = `/${req.params.id}`;
    v2CustomersRouter.handle(req, res, next);
});

// DELETE /api/customers/all → (admin only, kept as warning)
router.delete('/all', (req, res) => {
    deprecationWarning(req, 'N/A');
    res.status(410).json({
        success: false,
        error: 'This endpoint has been removed. Contact admin for bulk operations.'
    });
});

// DELETE /api/customers/:id → DELETE /api/v2/customers/:id
router.delete('/:id', (req, res, next) => {
    deprecationWarning(req, `/api/v2/customers/${req.params.id}`);
    req.url = `/${req.params.id}`;
    v2CustomersRouter.handle(req, res, next);
});

module.exports = router;
