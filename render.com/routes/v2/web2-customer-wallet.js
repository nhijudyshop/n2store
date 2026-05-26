// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================================
// API V2 — Web 2.0 Customer Wallet Aggregate
// =====================================================================
// Server-side join giữa fast_sale_orders + native_orders +
// web2_customer_wallets + web2_wallet_transactions (returns) cho UI
// customer-wallet. Mục đích: thay vì client load 100k KH, chỉ paged 50
// row mỗi lần với SQL aggregate sẵn (balance, paid, returned, …).
//
// Endpoints:
//   GET /api/web2/customer-wallet/aggregate   — paged customer cards
//   GET /api/web2/customer-wallet/stats       — overall counts/totals
// =====================================================================

const express = require('express');
const router = express.Router();

function handleError(res, err, msg = 'Internal error') {
    console.error(`[Web2CustomerWallet] ${msg}:`, err.message);
    res.status(500).json({ success: false, error: msg, details: err.message });
}

// Build SQL CTE that aggregates all sources by phone. Returns CTE block +
// params list (params start fresh for each call).
function buildAggregateCte() {
    // Excluded PBH states (canceled / hủy). Match aggregateFromPbh in
    // web2-customer-wallet-app.js so totals are consistent.
    return `
        WITH purchases AS (
            SELECT partner_phone AS phone,
                   SUM(amount_total)::numeric AS total_purchased,
                   COUNT(*)::int AS pbh_count,
                   MAX(partner_name) FILTER (WHERE partner_name IS NOT NULL AND partner_name <> '') AS pbh_name
            FROM fast_sale_orders
            WHERE partner_phone IS NOT NULL
              AND LOWER(COALESCE(state, '')) NOT IN ('cancel', 'cancelled', 'canceled', 'huy', 'hủy')
            GROUP BY partner_phone
        ),
        natives AS (
            SELECT phone,
                   COUNT(*)::int AS native_count,
                   MAX(customer_name) FILTER (WHERE customer_name IS NOT NULL AND customer_name <> '') AS native_name
            FROM native_orders
            WHERE phone IS NOT NULL
            GROUP BY phone
        ),
        returns_agg AS (
            SELECT phone,
                   SUM(amount)::numeric AS total_returned
            FROM web2_wallet_transactions
            WHERE type = 'WITHDRAW' AND reference_type = 'return'
              AND phone IS NOT NULL
            GROUP BY phone
        ),
        all_phones AS (
            SELECT phone FROM web2_customer_wallets WHERE phone IS NOT NULL
            UNION
            SELECT phone FROM purchases WHERE phone IS NOT NULL
            UNION
            SELECT phone FROM natives WHERE phone IS NOT NULL
        ),
        joined AS (
            SELECT
                ap.phone,
                COALESCE(p.pbh_name, n.native_name, ap.phone) AS name,
                COALESCE(p.total_purchased, 0)::numeric AS total_purchased,
                COALESCE(p.pbh_count, 0) AS pbh_count,
                COALESCE(n.native_count, 0) AS native_count,
                COALESCE(w.total_deposited, 0)::numeric AS paid_amount,
                COALESCE(r.total_returned, 0)::numeric AS returned_amount,
                COALESCE(w.balance, 0)::numeric AS wallet_balance,
                COALESCE(w.total_deposited, 0)::numeric AS total_deposited,
                COALESCE(w.total_withdrawn, 0)::numeric AS total_withdrawn,
                w.customer_id,
                (COALESCE(p.total_purchased, 0) - COALESCE(w.total_deposited, 0) - COALESCE(r.total_returned, 0))::numeric AS balance
            FROM all_phones ap
            LEFT JOIN web2_customer_wallets w ON w.phone = ap.phone
            LEFT JOIN purchases p ON p.phone = ap.phone
            LEFT JOIN natives n ON n.phone = ap.phone
            LEFT JOIN returns_agg r ON r.phone = ap.phone
        )
    `;
}

// =====================================================
// GET /aggregate
// Query:
//   ?limit=50&offset=0
//   &filter=all|debt|has_balance|paid_off  (server filter)
//   &sort=balance-desc|balance-asc|wallet-desc|total-desc|name-asc|paid-desc
//   &search=<phone digits OR name substring>
// =====================================================
router.get('/aggregate', async (req, res) => {
    try {
        const db = req.app.locals.chatDb || req.app.locals.db;
        const limit = Math.min(parseInt(req.query.limit) || 50, 500);
        const offset = Math.max(parseInt(req.query.offset) || 0, 0);
        const filter = String(req.query.filter || 'all').toLowerCase();
        const sortKey = String(req.query.sort || 'balance-desc');
        const search = String(req.query.search || '').trim();

        const cte = buildAggregateCte();
        const where = [];
        const params = [];

        if (filter === 'debt') {
            where.push(`balance > 0`);
        } else if (filter === 'has_balance') {
            where.push(`wallet_balance > 0`);
        } else if (filter === 'paid_off') {
            where.push(`balance <= 0 AND total_purchased > 0`);
        }

        if (search) {
            const digits = search.replace(/\D/g, '');
            if (digits.length >= 3) {
                params.push(`%${digits}%`);
                params.push(`%${search}%`);
                where.push(`(phone LIKE $${params.length - 1} OR name ILIKE $${params.length})`);
            } else {
                params.push(`%${search}%`);
                where.push(`name ILIKE $${params.length}`);
            }
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
        const orderBy = (() => {
            switch (sortKey) {
                case 'balance-asc':
                    return 'balance ASC NULLS LAST, phone';
                case 'wallet-desc':
                    return 'wallet_balance DESC, phone';
                case 'total-desc':
                    return 'total_purchased DESC, phone';
                case 'paid-desc':
                    return 'paid_amount DESC, phone';
                case 'name-asc':
                    return 'name ASC, phone';
                case 'balance-desc':
                default:
                    return 'balance DESC NULLS LAST, phone';
            }
        })();

        params.push(limit);
        const limitParam = `$${params.length}`;
        params.push(offset);
        const offsetParam = `$${params.length}`;

        const listSql = `
            ${cte}
            SELECT * FROM joined
            ${whereSql}
            ORDER BY ${orderBy}
            LIMIT ${limitParam} OFFSET ${offsetParam}
        `;
        const countSql = `
            ${cte}
            SELECT COUNT(*)::int AS n FROM joined ${whereSql}
        `;
        // Use same params (without limit/offset for count)
        const countParams = params.slice(0, params.length - 2);

        const [listResult, countResult] = await Promise.all([
            db.query(listSql, params),
            db.query(countSql, countParams),
        ]);

        const rows = listResult.rows.map((r) => ({
            phone: r.phone,
            name: r.name,
            totalPurchased: Number(r.total_purchased) || 0,
            paidAmount: Number(r.paid_amount) || 0,
            returnedAmount: Number(r.returned_amount) || 0,
            balance: Number(r.balance) || 0,
            walletBalance: Number(r.wallet_balance) || 0,
            totalDeposited: Number(r.total_deposited) || 0,
            totalWithdrawn: Number(r.total_withdrawn) || 0,
            pbhCount: r.pbh_count,
            nativeCount: r.native_count,
            customerId: r.customer_id,
        }));

        res.json({
            success: true,
            data: rows,
            total: countResult.rows[0].n || 0,
            limit,
            offset,
            sort: sortKey,
            filter,
            search,
        });
    } catch (e) {
        handleError(res, e, 'Aggregate list');
    }
});

// =====================================================
// GET /stats — overall counts/totals (no pagination)
// Result cached aggressively (5s TTL in-memory to avoid hammering on
// rapid filter toggles).
// =====================================================
const _statsCache = { ts: 0, data: null };
const STATS_TTL_MS = 5_000;

router.get('/stats', async (req, res) => {
    try {
        if (Date.now() - _statsCache.ts < STATS_TTL_MS && _statsCache.data) {
            return res.json({ success: true, data: _statsCache.data, cached: true });
        }
        const db = req.app.locals.chatDb || req.app.locals.db;
        const cte = buildAggregateCte();
        const r = await db.query(`
            ${cte}
            SELECT
                COUNT(*)::int AS total,
                COUNT(*) FILTER (WHERE balance > 0)::int AS debt_count,
                COUNT(*) FILTER (WHERE wallet_balance > 0)::int AS has_balance_count,
                COUNT(*) FILTER (WHERE balance <= 0 AND total_purchased > 0)::int AS paid_off_count,
                COALESCE(SUM(CASE WHEN balance > 0 THEN balance ELSE 0 END), 0)::numeric AS total_debt,
                COALESCE(SUM(wallet_balance), 0)::numeric AS total_wallet_balance,
                COALESCE(SUM(paid_amount), 0)::numeric AS total_paid,
                COALESCE(SUM(total_purchased), 0)::numeric AS total_purchased
            FROM joined
        `);
        const row = r.rows[0] || {};
        const data = {
            total: row.total || 0,
            debt_count: row.debt_count || 0,
            has_balance_count: row.has_balance_count || 0,
            paid_off_count: row.paid_off_count || 0,
            total_debt: Number(row.total_debt) || 0,
            total_wallet_balance: Number(row.total_wallet_balance) || 0,
            total_paid: Number(row.total_paid) || 0,
            total_purchased: Number(row.total_purchased) || 0,
        };
        _statsCache.ts = Date.now();
        _statsCache.data = data;
        res.json({ success: true, data, cached: false });
    } catch (e) {
        handleError(res, e, 'Stats');
    }
});

module.exports = router;
