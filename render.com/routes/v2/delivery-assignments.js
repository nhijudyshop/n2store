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
// POST /cleanup-ghosts — Auto-hide rows not present in live TPOS data for a date.
// Body: { date: "YYYY-MM-DD", validNumbers: ["NJD/X", ...], mode?: "hide"|"delete" }
//   - Hide (default): SET is_hidden=TRUE — soft, reversible.
//   - Delete: DELETE row hoàn toàn — irreversible.
// Caller (frontend Tra Soát) bảo đảm validNumbers là TPOS live cho ngày đó,
// fetch không bị filter keyword. Server an toàn: KHÔNG cleanup nếu validNumbers rỗng.
// =====================================================
router.post('/cleanup-ghosts', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, validNumbers, mode, force } = req.body || {};
        if (!date || !Array.isArray(validNumbers)) {
            return res
                .status(400)
                .json({ success: false, error: 'Missing date or validNumbers (array)' });
        }
        const dateStr = String(date).slice(0, 10);
        if (validNumbers.length === 0) {
            return res.json({
                success: true,
                data: {
                    date: dateStr,
                    hiddenCount: 0,
                    hiddenOrders: [],
                    skipped: 'empty-valid-list',
                },
            });
        }

        // Safety guardrail: đếm trước bao nhiêu rows sẽ bị hide. Nếu hidden / total
        // > 50% (suspicious — chắc client gửi list TPOS bị thiếu/truncate) thì
        // reject trừ khi force=true. Tránh repeat của bug: 1 valid → 72 hidden.
        const phPreview = validNumbers.map((_, i) => `$${i + 2}`).join(', ');
        const previewSql = `
            SELECT
                COUNT(*) FILTER (WHERE order_number NOT IN (${phPreview}))::int AS would_hide,
                COUNT(*) FILTER (WHERE is_hidden = FALSE)::int                  AS active_total
            FROM delivery_assignments
            WHERE assignment_date = $1`;
        const preview = await db.query(previewSql, [dateStr, ...validNumbers]);
        const wouldHide = Number(preview.rows[0]?.would_hide) || 0;
        const activeTotal = Number(preview.rows[0]?.active_total) || 0;
        const ratio = activeTotal > 0 ? wouldHide / activeTotal : 0;
        if (!force && wouldHide > 5 && ratio > 0.5) {
            console.warn(
                `[cleanup-ghosts] REJECT date=${dateStr}: would hide ${wouldHide}/${activeTotal} (${(ratio * 100).toFixed(0)}%) — suspicious, require force=true`
            );
            return res.json({
                success: true,
                data: {
                    date: dateStr,
                    hiddenCount: 0,
                    hiddenOrders: [],
                    skipped: 'safety-guardrail',
                    wouldHide,
                    activeTotal,
                    ratio,
                    note: 'Refused — would hide more than 50% of active rows for this date. Pass force=true to override.',
                },
            });
        }

        const cleanMode = mode === 'delete' ? 'delete' : 'hide';
        const ph = validNumbers.map((_, i) => `$${i + 2}`).join(', ');
        let sql;
        if (cleanMode === 'delete') {
            sql = `DELETE FROM delivery_assignments
                   WHERE assignment_date = $1
                     AND order_number NOT IN (${ph})
                   RETURNING order_number`;
        } else {
            sql = `UPDATE delivery_assignments
                   SET is_hidden = TRUE, updated_at = NOW()
                   WHERE assignment_date = $1
                     AND order_number NOT IN (${ph})
                     AND is_hidden = FALSE
                   RETURNING order_number`;
        }
        const result = await db.query(sql, [dateStr, ...validNumbers]);
        const affectedCount = result.rows.length;
        console.log(
            `[cleanup-ghosts] date=${dateStr} mode=${cleanMode}: ${affectedCount} ghost(s) hidden (active ${activeTotal})`
        );
        res.json({
            success: true,
            data: {
                date: dateStr,
                mode: cleanMode,
                hiddenCount: affectedCount,
                hiddenOrders: result.rows.map((r) => r.order_number),
            },
        });
    } catch (err) {
        console.error('[delivery-assignments] POST /cleanup-ghosts error:', err.message);
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
// POST /sync-dates — Bulk fix ghost orders: UPDATE assignment_date theo TPOS
// live + SET is_hidden=TRUE cho đơn truly deleted.
// Body: {
//   updates: [{orderNumber, newDate}],  // shift assignment_date
//   hiddenNumbers: [...],                 // is_hidden=TRUE
//   dryRun: true|false (default false)
// }
// Safety: dryRun trả về preview KHÔNG đụng DB. Default apply.
// =====================================================
router.post('/sync-dates', async (req, res) => {
    try {
        const db = getDb(req);
        const { updates = [], hiddenNumbers = [], dryRun = false } = req.body || {};
        if (!Array.isArray(updates) && !Array.isArray(hiddenNumbers)) {
            return res
                .status(400)
                .json({ success: false, error: 'Missing updates or hiddenNumbers array' });
        }
        // Validate updates shape
        const validUpdates = (updates || []).filter(
            (u) =>
                u &&
                typeof u.orderNumber === 'string' &&
                typeof u.newDate === 'string' &&
                /^\d{4}-\d{2}-\d{2}$/.test(u.newDate)
        );
        const validHidden = (hiddenNumbers || []).filter((n) => typeof n === 'string');

        // Safety: bulk size limit
        if (validUpdates.length > 2000 || validHidden.length > 2000) {
            return res
                .status(400)
                .json({ success: false, error: 'Too many changes (max 2000 per call)' });
        }

        if (dryRun) {
            return res.json({
                success: true,
                data: {
                    dryRun: true,
                    proposedUpdates: validUpdates.length,
                    proposedHidden: validHidden.length,
                    sampleUpdates: validUpdates.slice(0, 5),
                    sampleHidden: validHidden.slice(0, 5),
                },
            });
        }

        let updatedCount = 0;
        let hiddenCount = 0;
        const updatedOrders = [];
        const hiddenOrders = [];

        // Batch UPDATE assignment_date in groups of 100
        for (let i = 0; i < validUpdates.length; i += 100) {
            const batch = validUpdates.slice(i, i + 100);
            for (const u of batch) {
                const r = await db.query(
                    `UPDATE delivery_assignments
                     SET assignment_date = $1, updated_at = NOW()
                     WHERE order_number = $2
                       AND assignment_date <> $1
                     RETURNING order_number`,
                    [u.newDate, u.orderNumber]
                );
                if (r.rows.length > 0) {
                    updatedCount++;
                    updatedOrders.push(u.orderNumber);
                }
            }
        }

        // Bulk hide truly deleted
        if (validHidden.length > 0) {
            const ph = validHidden.map((_, i) => `$${i + 1}`).join(', ');
            const r = await db.query(
                `UPDATE delivery_assignments
                 SET is_hidden = TRUE, updated_at = NOW()
                 WHERE order_number IN (${ph})
                   AND is_hidden = FALSE
                 RETURNING order_number`,
                validHidden
            );
            hiddenCount = r.rows.length;
            hiddenOrders.push(...r.rows.map((row) => row.order_number));
        }

        console.log(`[sync-dates] applied: ${updatedCount} date-updates, ${hiddenCount} hidden`);
        res.json({
            success: true,
            data: {
                updatedCount,
                hiddenCount,
                updatedOrders,
                hiddenOrders,
            },
        });
    } catch (err) {
        console.error('[delivery-assignments] POST /sync-dates error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// PATCH /unhide-bulk — Bulk un-hide (restore từ is_hidden=TRUE → FALSE).
// Body: { orderNumbers: [...] }
// Use case: recover sau khi cleanup-ghosts hide nhầm, hoặc restore đơn user
// đã ẩn thủ công.
// =====================================================
router.patch('/unhide-bulk', async (req, res) => {
    try {
        const db = getDb(req);
        const body = req.body || {};
        const orderNumbers = Array.isArray(body.orderNumbers) ? body.orderNumbers : [];
        if (orderNumbers.length === 0) {
            return res.status(400).json({ success: false, error: 'Missing orderNumbers (array)' });
        }
        const ph = orderNumbers.map((_, i) => `$${i + 1}`).join(', ');
        const result = await db.query(
            `UPDATE delivery_assignments
             SET is_hidden = FALSE, updated_at = NOW()
             WHERE order_number IN (${ph})
               AND is_hidden = TRUE
             RETURNING order_number`,
            orderNumbers
        );
        res.json({
            success: true,
            data: {
                unhidden: result.rows.length,
                unhiddenOrders: result.rows.map((r) => r.order_number),
            },
        });
    } catch (err) {
        console.error('[delivery-assignments] PATCH /unhide-bulk error:', err.message);
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

// =====================================================
// IMAGES — bill-image per (assignment_date, group_name)
// Migrated 2026-05-25 từ localStorage `dr-report-overrides-v1.billImage` →
// Postgres BYTEA để ảnh persist cross-device/browser.
// =====================================================

async function ensureImagesSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS delivery_assignment_images (
            assignment_date DATE NOT NULL,
            group_name VARCHAR(20) NOT NULL,
            image_data BYTEA NOT NULL,
            mime_type VARCHAR(64) NOT NULL DEFAULT 'image/jpeg',
            file_size INTEGER,
            uploaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            uploaded_by VARCHAR(100) DEFAULT 'anonymous',
            PRIMARY KEY (assignment_date, group_name)
        )
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_delivery_assignment_images_date
        ON delivery_assignment_images(assignment_date)
    `);
}

// Parse data URL → { mime, buffer }
function parseDataUrl(dataUrl) {
    if (typeof dataUrl !== 'string') return null;
    const m = /^data:([^;,]+)?(?:;base64)?,(.*)$/i.exec(dataUrl);
    if (!m) return null;
    const mime = (m[1] || 'image/jpeg').toLowerCase();
    const body = m[2] || '';
    let buffer;
    if (/;base64/i.test(dataUrl)) {
        try {
            buffer = Buffer.from(body, 'base64');
        } catch (_) {
            return null;
        }
    } else {
        try {
            buffer = Buffer.from(decodeURIComponent(body), 'utf-8');
        } catch (_) {
            return null;
        }
    }
    return { mime, buffer };
}

function isValidGroup(g) {
    return ['tomato', 'nap', 'city', 'shop', 'return'].includes(g);
}
function isValidDate(d) {
    return /^\d{4}-\d{2}-\d{2}$/.test(d || '');
}

// PUT /image/:date/:group — upsert bill image
// Body: { dataUrl: "data:image/jpeg;base64,..." } (≤10MB)
router.put('/image/:date/:group', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, group } = req.params;
        if (!isValidDate(date) || !isValidGroup(group)) {
            return res.status(400).json({ success: false, error: 'Invalid date or group' });
        }
        const { dataUrl } = req.body || {};
        if (!dataUrl) {
            return res.status(400).json({ success: false, error: 'Missing dataUrl' });
        }
        const parsed = parseDataUrl(dataUrl);
        if (!parsed || !parsed.buffer.length) {
            return res.status(400).json({ success: false, error: 'Invalid dataUrl' });
        }
        if (parsed.buffer.length > 10 * 1024 * 1024) {
            return res.status(413).json({ success: false, error: 'Image too large (max 10MB)' });
        }
        const user = getUserFromHeaders(req);
        await db.query(
            `INSERT INTO delivery_assignment_images
                (assignment_date, group_name, image_data, mime_type, file_size, uploaded_by, uploaded_at)
             VALUES ($1, $2, $3, $4, $5, $6, NOW())
             ON CONFLICT (assignment_date, group_name) DO UPDATE
             SET image_data = EXCLUDED.image_data,
                 mime_type = EXCLUDED.mime_type,
                 file_size = EXCLUDED.file_size,
                 uploaded_by = EXCLUDED.uploaded_by,
                 uploaded_at = NOW()`,
            [date, group, parsed.buffer, parsed.mime, parsed.buffer.length, user]
        );
        res.json({
            success: true,
            data: { date, group, mime: parsed.mime, size: parsed.buffer.length },
        });
    } catch (err) {
        console.error('[delivery-assignments] PUT /image error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /image/:date/:group — serve image binary
router.get('/image/:date/:group', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, group } = req.params;
        if (!isValidDate(date) || !isValidGroup(group)) {
            return res.status(400).send('Invalid date or group');
        }
        const result = await db.query(
            `SELECT image_data, mime_type, file_size, uploaded_at
             FROM delivery_assignment_images
             WHERE assignment_date = $1 AND group_name = $2`,
            [date, group]
        );
        if (result.rows.length === 0) {
            return res.status(404).send('Image not found');
        }
        const row = result.rows[0];
        res.setHeader('Content-Type', row.mime_type || 'image/jpeg');
        res.setHeader('Cache-Control', 'private, max-age=60');
        res.setHeader('ETag', `"${date}-${group}-${new Date(row.uploaded_at).getTime()}"`);
        res.send(row.image_data);
    } catch (err) {
        console.error('[delivery-assignments] GET /image error:', err.message);
        res.status(500).send('Server error');
    }
});

// DELETE /image/:date/:group
router.delete('/image/:date/:group', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, group } = req.params;
        if (!isValidDate(date) || !isValidGroup(group)) {
            return res.status(400).json({ success: false, error: 'Invalid date or group' });
        }
        const result = await db.query(
            `DELETE FROM delivery_assignment_images
             WHERE assignment_date = $1 AND group_name = $2
             RETURNING assignment_date`,
            [date, group]
        );
        res.json({ success: true, data: { deleted: result.rows.length } });
    } catch (err) {
        console.error('[delivery-assignments] DELETE /image error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /image-flags?from=YYYY-MM-DD&to=YYYY-MM-DD
// Returns: { flags: ["YYYY-MM-DD__group", ...] } — frontend dùng để biết
// cell nào có ảnh (hiện icon đầy).
router.get('/image-flags', async (req, res) => {
    try {
        const db = getDb(req);
        const { from, to } = req.query;
        if (!isValidDate(from) || !isValidDate(to)) {
            return res.status(400).json({ success: false, error: 'Invalid from/to (YYYY-MM-DD)' });
        }
        const result = await db.query(
            `SELECT assignment_date::text AS date, group_name
             FROM delivery_assignment_images
             WHERE assignment_date BETWEEN $1 AND $2`,
            [from, to]
        );
        const flags = result.rows.map((r) => `${r.date}__${r.group_name}`);
        res.json({ success: true, data: { flags, range: { from, to } } });
    } catch (err) {
        console.error('[delivery-assignments] GET /image-flags error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// =====================================================
// OVERRIDES — manual entry fields per (assignment_date, group_name).
// Migrated 2026-05-25 từ localStorage `dr-report-overrides-v1` (slShip/thuVe/
// boCK/atruongCK/ckTruoc/note) → Postgres để persist cross-device.
// =====================================================

async function ensureOverridesSchema(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS delivery_assignment_overrides (
            assignment_date DATE NOT NULL,
            group_name VARCHAR(20) NOT NULL,
            sl_ship INTEGER NOT NULL DEFAULT 0,
            thu_ve NUMERIC(15,2) NOT NULL DEFAULT 0,
            bo_ck NUMERIC(15,2) NOT NULL DEFAULT 0,
            atruong_ck NUMERIC(15,2) NOT NULL DEFAULT 0,
            ck_truoc NUMERIC(15,2) NOT NULL DEFAULT 0,
            note TEXT NOT NULL DEFAULT '',
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updated_by VARCHAR(100) DEFAULT 'anonymous',
            PRIMARY KEY (assignment_date, group_name)
        )
    `);
    // Idempotent ALTER — thêm column approved nếu chưa có (deploy < 2026-05-26).
    await pool.query(`
        ALTER TABLE delivery_assignment_overrides
        ADD COLUMN IF NOT EXISTS approved BOOLEAN NOT NULL DEFAULT FALSE
    `);
    await pool.query(`
        CREATE INDEX IF NOT EXISTS idx_delivery_assignment_overrides_date
        ON delivery_assignment_overrides(assignment_date)
    `);
}

function rowToOverride(row) {
    return {
        slShip: Number(row.sl_ship) || 0,
        thuVe: Number(row.thu_ve) || 0,
        boCK: Number(row.bo_ck) || 0,
        atruongCK: Number(row.atruong_ck) || 0,
        ckTruoc: Number(row.ck_truoc) || 0,
        note: row.note || '',
        approved: !!row.approved,
    };
}

function isOverrideEmpty(o) {
    if (!o) return true;
    return (
        !Number(o.slShip || 0) &&
        !Number(o.thuVe || 0) &&
        !Number(o.boCK || 0) &&
        !Number(o.atruongCK || 0) &&
        !Number(o.ckTruoc || 0) &&
        !(o.note && String(o.note).trim()) &&
        !o.approved
    );
}

// GET /overrides?from=&to= — bulk fetch all overrides cho range
router.get('/overrides', async (req, res) => {
    try {
        const db = getDb(req);
        const { from, to } = req.query;
        if (!isValidDate(from) || !isValidDate(to)) {
            return res.status(400).json({ success: false, error: 'Invalid from/to (YYYY-MM-DD)' });
        }
        const result = await db.query(
            `SELECT assignment_date::text AS date, group_name,
                    sl_ship, thu_ve, bo_ck, atruong_ck, ck_truoc, note, approved,
                    updated_at, updated_by
             FROM delivery_assignment_overrides
             WHERE assignment_date BETWEEN $1 AND $2`,
            [from, to]
        );
        // Map: { "YYYY-MM-DD__group": override }
        const overrides = {};
        for (const r of result.rows) {
            overrides[`${r.date}__${r.group_name}`] = rowToOverride(r);
        }
        res.json({
            success: true,
            data: { overrides, count: result.rows.length, range: { from, to } },
        });
    } catch (err) {
        console.error('[delivery-assignments] GET /overrides error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// PUT /overrides/:date/:group — upsert all 6 fields. Empty → DELETE row.
router.put('/overrides/:date/:group', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, group } = req.params;
        if (!isValidDate(date) || !isValidGroup(group)) {
            return res.status(400).json({ success: false, error: 'Invalid date or group' });
        }
        const body = req.body || {};
        const ov = {
            slShip: Math.max(0, Number(body.slShip) || 0),
            thuVe: Number(body.thuVe) || 0,
            boCK: Number(body.boCK) || 0,
            atruongCK: Number(body.atruongCK) || 0,
            ckTruoc: Number(body.ckTruoc) || 0,
            note: String(body.note || '').trim(),
            approved: !!body.approved,
        };
        if (isOverrideEmpty(ov)) {
            // Empty → DELETE để storage sạch
            const del = await db.query(
                `DELETE FROM delivery_assignment_overrides
                 WHERE assignment_date = $1 AND group_name = $2
                 RETURNING assignment_date`,
                [date, group]
            );
            return res.json({
                success: true,
                data: { date, group, deleted: del.rows.length, override: null },
            });
        }
        const user = getUserFromHeaders(req);
        await db.query(
            `INSERT INTO delivery_assignment_overrides
                (assignment_date, group_name, sl_ship, thu_ve, bo_ck, atruong_ck, ck_truoc, note, approved, updated_by, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
             ON CONFLICT (assignment_date, group_name) DO UPDATE
             SET sl_ship = EXCLUDED.sl_ship,
                 thu_ve = EXCLUDED.thu_ve,
                 bo_ck = EXCLUDED.bo_ck,
                 atruong_ck = EXCLUDED.atruong_ck,
                 ck_truoc = EXCLUDED.ck_truoc,
                 note = EXCLUDED.note,
                 approved = EXCLUDED.approved,
                 updated_by = EXCLUDED.updated_by,
                 updated_at = NOW()`,
            [
                date,
                group,
                ov.slShip,
                ov.thuVe,
                ov.boCK,
                ov.atruongCK,
                ov.ckTruoc,
                ov.note,
                ov.approved,
                user,
            ]
        );
        res.json({ success: true, data: { date, group, override: ov } });
    } catch (err) {
        console.error('[delivery-assignments] PUT /overrides error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// DELETE /overrides/:date/:group
router.delete('/overrides/:date/:group', async (req, res) => {
    try {
        const db = getDb(req);
        const { date, group } = req.params;
        if (!isValidDate(date) || !isValidGroup(group)) {
            return res.status(400).json({ success: false, error: 'Invalid date or group' });
        }
        const result = await db.query(
            `DELETE FROM delivery_assignment_overrides
             WHERE assignment_date = $1 AND group_name = $2
             RETURNING assignment_date`,
            [date, group]
        );
        res.json({ success: true, data: { deleted: result.rows.length } });
    } catch (err) {
        console.error('[delivery-assignments] DELETE /overrides error:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
module.exports.ensureImagesSchema = ensureImagesSchema;
module.exports.ensureOverridesSchema = ensureOverridesSchema;
