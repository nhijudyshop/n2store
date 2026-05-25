// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * DELIVERY ASSIGNMENTS API v2
 *
 * Schema (after 2026-05-11 refactor):
 *   PRIMARY-ish key = order_number (UNIQUE).
 *   assignment_date kept as metadata (first/last save day). Not part of identity.
 *   → Impossible to have duplicate rows for the same order.
 *
 * Endpoints:
 *   GET    /                          - Load assignments (filter by ?date= / ?from=&to= / ?order_numbers=)
 *   POST   /                          - Bulk upsert (ON CONFLICT order_number DO NOTHING)
 *   POST   /lookup-batch              - Lookup groups + scan/hidden for given order_numbers
 *   PUT    /:orderNumber              - Update group (admin move)
 *   DELETE /:orderNumber              - Remove single assignment
 *
 *   PATCH  /scan/:orderNumber         - Mark scanned
 *   PATCH  /unscan/:orderNumber       - Unmark scan
 *   PATCH  /unscan-bulk               - Bulk unscan
 *   PATCH  /hide/:orderNumber         - Hide order (cancel approved)
 *
 * Legacy compat: `?date=` and per-item `.date` are accepted everywhere (used as metadata
 * for assignment_date when inserting; ignored for matching on writes).
 */

const express = require('express');
const router = express.Router();

function getDb(req) {
    return req.app.locals.chatDb;
}

function getUserFromHeaders(req) {
    try {
        const authData = req.headers['x-auth-data'];
        if (authData) {
            let jsonStr;
            try {
                jsonStr = decodeURIComponent(
                    escape(Buffer.from(authData, 'base64').toString('binary'))
                );
            } catch (_) {
                jsonStr = authData;
            }
            const parsed = JSON.parse(jsonStr);
            return parsed.userName || parsed.displayName || parsed.userId || 'anonymous';
        }
    } catch (_) {
        /* ignore */
    }
    return 'anonymous';
}

function todayLocal() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function buildPayload(rows) {
    const assignments = {};
    const scannedNumbers = [];
    const hiddenNumbers = [];
    for (const row of rows) {
        if (!row.is_hidden) {
            assignments[row.order_number] = row.group_name;
        }
        if (row.is_scanned) scannedNumbers.push(row.order_number);
        if (row.is_hidden) hiddenNumbers.push(row.order_number);
    }
    return {
        assignments,
        scannedNumbers,
        hiddenNumbers,
        totalCount: rows.length,
        scannedCount: scannedNumbers.length,
        hiddenCount: hiddenNumbers.length,
    };
}

// =====================================================
// GET / — Load assignments
// Filters (any one): ?date= | ?from=&to= | ?order_numbers=N1,N2,...
// With deduped schema each order has at most 1 row.
// =====================================================
router.get('/', async (req, res) => {
    try {
        const db = getDb(req);
        let { date, from, to, order_numbers: orderNumbers } = req.query;

        // Backward compat: single ?date= treated as from=to=date
        if (date && !from && !to) {
            from = date;
            to = date;
        }

        let rows;
        if (orderNumbers) {
            const nums = String(orderNumbers)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean)
                .slice(0, 1000);
            if (nums.length === 0) {
                return res.json({ success: true, data: buildPayload([]) });
            }
            const ph = nums.map((_, i) => `$${i + 1}`).join(', ');
            const result = await db.query(
                `SELECT order_number, group_name, is_scanned, is_hidden, assignment_date
                 FROM delivery_assignments
                 WHERE order_number IN (${ph})`,
                nums
            );
            rows = result.rows;
        } else if (from && to) {
            if (from > to) {
                const tmp = from;
                from = to;
                to = tmp;
            }
            const result = await db.query(
                `SELECT order_number, group_name, is_scanned, is_hidden, assignment_date
                 FROM delivery_assignments
                 WHERE assignment_date BETWEEN $1 AND $2`,
                [from, to]
            );
            rows = result.rows;
        } else {
            return res.status(400).json({
                success: false,
                error: 'Missing filter — provide ?date= or ?from=&to= or ?order_numbers=',
            });
        }

        const payload = buildPayload(rows);
        res.json({
            success: true,
            data: {
                ...payload,
                ...(from && to ? { from, to, date: from === to ? from : undefined } : {}),
            },
        });
    } catch (err) {
        console.error('[delivery-assignments] GET / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST / — Bulk upsert (ON CONFLICT order_number DO NOTHING)
// Body: { date?, assignments: [{orderNumber, groupName, date?, amountTotal?, cashOnDelivery?, carrierName?}, ...] }
// =====================================================
router.post('/', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, assignments } = req.body;
        const user = getUserFromHeaders(req);

        if (!assignments || !Array.isArray(assignments) || assignments.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing assignments array' });
        }

        const fallback = date || todayLocal();
        const values = [];
        const params = [];
        let p = 1;

        for (const a of assignments) {
            if (!a.orderNumber || !a.groupName) continue;
            const rowDate = a.date || fallback;
            values.push(
                `($${p}, $${p + 1}, $${p + 2}, $${p + 3}, $${p + 4}, $${p + 5}, $${p + 6})`
            );
            params.push(
                rowDate,
                a.orderNumber,
                a.groupName,
                a.amountTotal || 0,
                a.cashOnDelivery || 0,
                a.carrierName || '',
                user
            );
            p += 7;
        }

        if (values.length === 0) {
            return res.json({ success: true, data: { inserted: 0, skipped: 0 } });
        }

        // ON CONFLICT (order_number) DO UPDATE — smart upsert:
        //   - Insert nếu Number chưa có
        //   - Update nếu Number tồn tại VÀ metadata khác (date/group/carrier/COD/amount)
        //     → tự dọn ghost: khi đơn cũ bị xóa rồi tạo lại với date/carrier khác trên TPOS,
        //       lần saveAssignments tiếp theo sẽ overwrite row cũ với data mới.
        //   - No-op nếu metadata giống hệt (WHERE filter ngăn update không cần thiết).
        //   - is_scanned, scanned_at, scanned_by KHÔNG bị reset (chỉ /scan endpoint update).
        const query = `
            INSERT INTO delivery_assignments
                (assignment_date, order_number, group_name, amount_total, cash_on_delivery, carrier_name, assigned_by)
            VALUES ${values.join(', ')}
            ON CONFLICT (order_number) DO UPDATE
            SET
                assignment_date  = EXCLUDED.assignment_date,
                group_name       = EXCLUDED.group_name,
                amount_total     = EXCLUDED.amount_total,
                cash_on_delivery = EXCLUDED.cash_on_delivery,
                carrier_name     = EXCLUDED.carrier_name,
                updated_at       = NOW()
            WHERE
                delivery_assignments.assignment_date  IS DISTINCT FROM EXCLUDED.assignment_date
             OR delivery_assignments.group_name       IS DISTINCT FROM EXCLUDED.group_name
             OR delivery_assignments.carrier_name     IS DISTINCT FROM EXCLUDED.carrier_name
             OR delivery_assignments.cash_on_delivery IS DISTINCT FROM EXCLUDED.cash_on_delivery
             OR delivery_assignments.amount_total     IS DISTINCT FROM EXCLUDED.amount_total
            RETURNING order_number, (xmax = 0) AS was_inserted
        `;

        const result = await db.query(query, params);
        const insertedRows = result.rows.filter((r) => r.was_inserted);
        const updatedRows = result.rows.filter((r) => !r.was_inserted);
        const inserted = insertedRows.length;
        const updated = updatedRows.length;
        const unchanged = assignments.length - inserted - updated;

        console.log(
            `[delivery-assignments] POST: ${inserted} inserted, ${updated} updated, ${unchanged} unchanged`
        );

        res.json({
            success: true,
            data: {
                inserted,
                updated,
                unchanged,
                // backward-compat alias — old clients đọc `skipped` (giờ là unchanged)
                skipped: unchanged,
                insertedOrders: insertedRows.map((r) => r.order_number),
                updatedOrders: updatedRows.map((r) => r.order_number),
            },
        });
    } catch (err) {
        console.error('[delivery-assignments] POST / error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /scan/:orderNumber — Mark as scanned
// `?date=` accepted but ignored (legacy compat).
// =====================================================
router.patch('/scan/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const user = getUserFromHeaders(req);

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = TRUE, scanned_at = NOW(), scanned_by = $1, updated_at = NOW()
             WHERE order_number = $2
             RETURNING order_number, is_scanned`,
            [user, orderNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Order not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /scan error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /unscan/:orderNumber — Unmark scan
// =====================================================
router.patch('/unscan/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = FALSE, scanned_at = NULL, scanned_by = NULL, updated_at = NOW()
             WHERE order_number = $1
             RETURNING order_number`,
            [orderNumber]
        );

        res.json({ success: true, data: { unscanned: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /unscan error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /unscan-bulk — Bulk unscan
// Body: { orderNumbers: [...] }  (preferred)
//   or  { items: [{orderNumber, date}] }  (legacy compat — date ignored)
//   or  { date, orderNumbers }            (legacy compat — date ignored)
// =====================================================
router.patch('/unscan-bulk', async (req, res) => {
    try {
        const db = getDb(req);
        const body = req.body || {};
        let orderNumbers = [];
        if (Array.isArray(body.orderNumbers) && body.orderNumbers.length > 0) {
            orderNumbers = body.orderNumbers;
        } else if (Array.isArray(body.items) && body.items.length > 0) {
            orderNumbers = body.items.map((it) => it && it.orderNumber).filter(Boolean);
        }

        if (orderNumbers.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing orderNumbers' });
        }

        const ph = orderNumbers.map((_, i) => `$${i + 1}`).join(', ');
        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_scanned = FALSE, scanned_at = NULL, scanned_by = NULL, updated_at = NOW()
             WHERE order_number IN (${ph})
             RETURNING order_number`,
            orderNumbers
        );

        res.json({ success: true, data: { unscanned: result.rows.length } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /unscan-bulk error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /hide/:orderNumber — Hide order (cancel approved)
// =====================================================
router.patch('/hide/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;

        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_hidden = TRUE, is_scanned = FALSE, updated_at = NOW()
             WHERE order_number = $1
             RETURNING order_number`,
            [orderNumber]
        );

        res.json({ success: true, data: { hidden: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /hide error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PUT /:orderNumber — Update group (admin move)
// Body: { groupName }
// =====================================================
router.put('/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;
        const { groupName } = req.body;
        const user = getUserFromHeaders(req);

        if (!groupName) {
            return res.status(400).json({ success: false, error: 'Missing groupName' });
        }

        const validGroups = ['tomato', 'nap', 'city', 'shop', 'return'];
        if (!validGroups.includes(groupName)) {
            return res.status(400).json({
                success: false,
                error: `Invalid groupName. Must be one of: ${validGroups.join(', ')}`,
            });
        }

        const result = await db.query(
            `UPDATE delivery_assignments
             SET group_name = $1, assigned_by = $2, updated_at = NOW()
             WHERE order_number = $3
             RETURNING *`,
            [groupName, user, orderNumber]
        );

        if (result.rows.length === 0) {
            return res.status(404).json({ success: false, error: 'Assignment not found' });
        }

        res.json({ success: true, data: result.rows[0] });
    } catch (err) {
        console.error('[delivery-assignments] PUT error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// DELETE /:orderNumber — Remove single assignment
// =====================================================
router.delete('/:orderNumber', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumber } = req.params;

        const result = await db.query(
            `DELETE FROM delivery_assignments WHERE order_number = $1 RETURNING *`,
            [orderNumber]
        );

        res.json({ success: true, data: { deleted: result.rows.length > 0 } });
    } catch (err) {
        console.error('[delivery-assignments] DELETE error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// POST /lookup-batch — Lookup groups + scan/hidden for given order_numbers
// Body: { orderNumbers: [...] }
// Returns: { assignments, scannedNumbers, hiddenNumbers, totalCount, scannedCount, hiddenCount }
// =====================================================
router.post('/lookup-batch', async (req, res) => {
    try {
        const db = getDb(req);
        const { orderNumbers } = req.body || {};

        if (!orderNumbers || !Array.isArray(orderNumbers) || orderNumbers.length === 0) {
            return res.json({ success: true, data: buildPayload([]) });
        }

        const nums = orderNumbers.slice(0, 1000);
        const ph = nums.map((_, i) => `$${i + 1}`).join(', ');

        const result = await db.query(
            `SELECT order_number, group_name, is_scanned, is_hidden, assignment_date
             FROM delivery_assignments
             WHERE order_number IN (${ph})`,
            nums
        );

        res.json({ success: true, data: buildPayload(result.rows) });
    } catch (err) {
        console.error('[delivery-assignments] POST /lookup-batch error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// GET /stats — thống kê chia đơn giao hàng
// Query params:
//   ?date=YYYY-MM-DD          → stats 1 ngày (default: today)
//   ?from=YYYY-MM-DD&to=YYYY-MM-DD → stats khoảng ngày
//   ?group_by=group|carrier|both  → granularity (default: group)
// Returns:
//   {
//     range: {from, to},
//     totals: { orderCount, amountTotal, codTotal, scannedCount, hiddenCount },
//     byGroup: [{ groupName, orderCount, amountTotal, codTotal, scannedCount, hiddenCount }],
//     byCarrier: [{ carrierName, orderCount, amountTotal, codTotal }],
//   }
// User-facing: trang thống kê chia đơn giao hàng cho mỗi shipper.
// =====================================================
router.get('/stats', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, from, to, group_by } = req.query;
        // Resolve date range
        const today = todayLocal();
        const fromDate = (from || date || today).slice(0, 10);
        const toDate = (to || date || today).slice(0, 10);

        // Totals + breakdown by group
        const totalsQuery = `
            SELECT
                COUNT(*)::int                                                AS order_count,
                COALESCE(SUM(amount_total), 0)::numeric                      AS amount_total,
                COALESCE(SUM(cash_on_delivery), 0)::numeric                  AS cod_total,
                COUNT(*) FILTER (WHERE is_scanned = TRUE)::int               AS scanned_count,
                COUNT(*) FILTER (WHERE is_hidden = TRUE)::int                AS hidden_count
            FROM delivery_assignments
            WHERE assignment_date BETWEEN $1 AND $2
        `;
        const groupQuery = `
            SELECT
                COALESCE(NULLIF(group_name, ''), '(chưa chia)')              AS group_name,
                COUNT(*)::int                                                AS order_count,
                COALESCE(SUM(amount_total), 0)::numeric                      AS amount_total,
                COALESCE(SUM(cash_on_delivery), 0)::numeric                  AS cod_total,
                COUNT(*) FILTER (WHERE is_scanned = TRUE)::int               AS scanned_count,
                COUNT(*) FILTER (WHERE is_hidden = TRUE)::int                AS hidden_count
            FROM delivery_assignments
            WHERE assignment_date BETWEEN $1 AND $2
            GROUP BY COALESCE(NULLIF(group_name, ''), '(chưa chia)')
            ORDER BY order_count DESC
        `;
        const carrierQuery = `
            SELECT
                COALESCE(NULLIF(carrier_name, ''), '(không rõ)')             AS carrier_name,
                COUNT(*)::int                                                AS order_count,
                COALESCE(SUM(amount_total), 0)::numeric                      AS amount_total,
                COALESCE(SUM(cash_on_delivery), 0)::numeric                  AS cod_total
            FROM delivery_assignments
            WHERE assignment_date BETWEEN $1 AND $2
            GROUP BY COALESCE(NULLIF(carrier_name, ''), '(không rõ)')
            ORDER BY order_count DESC
        `;

        const [totalsR, groupR, carrierR] = await Promise.all([
            db.query(totalsQuery, [fromDate, toDate]),
            db.query(groupQuery, [fromDate, toDate]),
            db.query(carrierQuery, [fromDate, toDate]),
        ]);

        const fmt = (n) => Number(n) || 0;
        const totalsRow = totalsR.rows[0] || {};
        res.json({
            success: true,
            range: { from: fromDate, to: toDate },
            totals: {
                orderCount: fmt(totalsRow.order_count),
                amountTotal: fmt(totalsRow.amount_total),
                codTotal: fmt(totalsRow.cod_total),
                scannedCount: fmt(totalsRow.scanned_count),
                hiddenCount: fmt(totalsRow.hidden_count),
            },
            byGroup: groupR.rows.map((r) => ({
                groupName: r.group_name,
                orderCount: fmt(r.order_count),
                amountTotal: fmt(r.amount_total),
                codTotal: fmt(r.cod_total),
                scannedCount: fmt(r.scanned_count),
                hiddenCount: fmt(r.hidden_count),
            })),
            byCarrier: carrierR.rows.map((r) => ({
                carrierName: r.carrier_name,
                orderCount: fmt(r.order_count),
                amountTotal: fmt(r.amount_total),
                codTotal: fmt(r.cod_total),
            })),
        });
    } catch (err) {
        console.error('[delivery-assignments] GET /stats error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// GET /by-date-group — Aggregate scanned counts + COD per (date, group_name)
// Query: ?from=YYYY-MM-DD&to=YYYY-MM-DD[&scanned_only=1]
// Used by delivery-report Báo cáo modal (chỉ tính đơn đã quét).
// =====================================================
router.get('/by-date-group', async (req, res) => {
    try {
        const db = getDb(req);
        const { from, to, scanned_only: scannedOnly } = req.query;
        if (!from || !to) {
            return res.status(400).json({
                success: false,
                error: 'Missing from/to query params (YYYY-MM-DD)',
            });
        }
        const fromDate = String(from).slice(0, 10);
        const toDate = String(to).slice(0, 10);
        const onlyScanned = scannedOnly === '1' || scannedOnly === 'true';

        const sql = `
            SELECT
                assignment_date::text                                         AS date,
                COALESCE(NULLIF(group_name, ''), '')                          AS group_name,
                COUNT(*)::int                                                 AS order_count,
                COUNT(*) FILTER (WHERE is_scanned = TRUE)::int                AS scanned_count,
                COALESCE(SUM(cash_on_delivery), 0)::numeric                   AS cod_total,
                COALESCE(SUM(cash_on_delivery)
                    FILTER (WHERE is_scanned = TRUE), 0)::numeric             AS scanned_cod
            FROM delivery_assignments
            WHERE assignment_date BETWEEN $1 AND $2
              AND is_hidden = FALSE
              ${onlyScanned ? 'AND is_scanned = TRUE' : ''}
            GROUP BY assignment_date, COALESCE(NULLIF(group_name, ''), '')
            ORDER BY assignment_date ASC, group_name ASC
        `;
        const result = await db.query(sql, [fromDate, toDate]);
        const rows = result.rows.map((r) => ({
            date: r.date,
            groupName: r.group_name,
            orderCount: Number(r.order_count) || 0,
            scannedCount: Number(r.scanned_count) || 0,
            codTotal: Number(r.cod_total) || 0,
            scannedCod: Number(r.scanned_cod) || 0,
        }));
        res.json({
            success: true,
            range: { from: fromDate, to: toDate },
            scannedOnly: onlyScanned,
            rows,
        });
    } catch (err) {
        console.error('[delivery-assignments] GET /by-date-group error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
