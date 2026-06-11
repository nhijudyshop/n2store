// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// PURCHASE-REFUND — state machine + stock side-effects
// =====================================================
//
// Storage: web2_records (entity_slug='purchase-refund', data JSONB).
// Generic CRUD list/get/create/update qua /api/web2/purchase-refund/* (web2-generic.js).
// Endpoint này chỉ làm các state transition CÓ side-effect lên web2_products.stock:
//
//   POST /api/purchase-refund/:code/approve         draft|sent → approved + stock--
//   POST /api/purchase-refund/:code/cancel-approve  approved   → sent + stock++ (revert)
//   POST /api/purchase-refund/:code/refunded        approved   → refunded (no stock)
//   POST /api/purchase-refund/:code/reject          draft|sent|approved → rejected
//                                                   (if was approved → restock;
//                                                    KHÔNG cho từ refunded/rejected)
//
// Idempotency:
//   data.stock_deducted = true sau khi /approve thành công.
//   /cancel-approve hoặc /reject (khi state=approved) set lại false sau restock.
//   /approve chạy lại trên record đã deducted → skip stock op, vẫn return OK.
//
// Products schema (data.products): array of { code, name, qty, price } | null.
// Cho phép data.products là string JSON (sẽ parse) hoặc array sẵn.

const express = require('express');
const router = express.Router();

// -----------------------------------------------------
// SSE notifier injected từ server.js. Topic 'web2:purchase-refund'.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:purchase-refund',
            { action, code: code || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[PURCHASE-REFUND] _notify failed:', e.message);
    }
}

// -----------------------------------------------------
// Helpers
// -----------------------------------------------------

function parseProducts(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    return [];
}

function normalizeLines(products) {
    const map = new Map();
    for (const p of products || []) {
        const code = (p?.code || p?.product_code || '').trim();
        const qty = Number(p?.qty || p?.quantity || 0);
        if (!code || qty <= 0) continue;
        map.set(code, (map.get(code) || 0) + qty);
    }
    return map; // code → totalQty
}

async function loadRefund(pool, code, forUpdate = false) {
    const r = await pool.query(
        `SELECT * FROM web2_records
         WHERE entity_slug = 'purchase-refund' AND code = $1 LIMIT 1${forUpdate ? ' FOR UPDATE' : ''}`,
        [code]
    );
    return r.rows[0] || null;
}

async function saveRefundData(pool, code, dataPatch) {
    // Merge JSONB shallow vào data. Idempotent.
    // web2_records.updated_at là BIGINT (epoch millis) — KHÔNG dùng NOW()
    // (timestamptz) vì gây lỗi "column updated_at is of type bigint but
    // expression is of type timestamp with time zone" → save fail SAU khi
    // deductStock đã chạy → stock corruption + retry trừ kho nhiều lần.
    await pool.query(
        `UPDATE web2_records
         SET data = COALESCE(data, '{}'::jsonb) || $1::jsonb,
             updated_at = $3
         WHERE entity_slug = 'purchase-refund' AND code = $2`,
        [JSON.stringify(dataPatch), code, Date.now()]
    );
}

/**
 * Append entry vào data.history (audit log).
 * P1 2026-05-30 — user ask "lịch sử chỉnh sửa kèm tên user tương tác".
 * Append vs replace: load existing history, push new, save full array.
 *
 * @param {Object} existingData - data hiện tại từ row
 * @param {Object} entry - { action, userId, userName, note, extra? }
 * @returns {Array} new history array để include trong dataPatch
 */
function appendHistory(existingData, entry) {
    const history = Array.isArray(existingData?.history) ? [...existingData.history] : [];
    history.push({
        ts: Date.now(),
        action: entry.action || 'unknown',
        userId: entry.userId || null,
        userName: entry.userName || '(ẩn danh)',
        note: entry.note || null,
        ...(entry.extra || {}),
    });
    return history;
}

// Trừ tồn: web2_products.stock -= qty. CHO PHÉP âm — nếu shop trả lượng > tồn
// (vd hàng cũ chưa nhập đủ), stock âm phản ánh đúng tình trạng thực + sẽ về 0
// sau nhập kho kỳ sau. Trả về list {code, deducted, before, after}.
async function deductStock(pool, lines) {
    const results = [];
    const now = Date.now();
    for (const [code, qty] of lines) {
        const before = await pool.query(`SELECT stock FROM web2_products WHERE code = $1`, [code]);
        const stockBefore = before.rows[0]?.stock != null ? Number(before.rows[0].stock) : null;
        await pool.query(
            `UPDATE web2_products SET stock = COALESCE(stock, 0) - $1, updated_at = $2 WHERE code = $3`,
            [qty, now, code]
        );
        const after = await pool.query(`SELECT stock FROM web2_products WHERE code = $1`, [code]);
        results.push({
            code,
            deducted: qty,
            before: stockBefore,
            after: after.rows[0]?.stock != null ? Number(after.rows[0].stock) : null,
        });
    }
    return results;
}

async function restockStock(pool, lines) {
    const results = [];
    const now = Date.now();
    for (const [code, qty] of lines) {
        await pool.query(
            `UPDATE web2_products SET stock = COALESCE(stock, 0) + $1, updated_at = $2 WHERE code = $3`,
            [qty, now, code]
        );
        const after = await pool.query(`SELECT stock FROM web2_products WHERE code = $1`, [code]);
        results.push({
            code,
            restocked: qty,
            after: after.rows[0]?.stock != null ? Number(after.rows[0].stock) : null,
        });
    }
    return results;
}

// -----------------------------------------------------
// POST /:code/approve — draft|sent → approved + deduct stock
// Body: { note?: string }
// -----------------------------------------------------
router.post('/:code/approve', async (req, res) => {
    // P1 2026-05-30: 2 DB pools — records ở web2Db, products ở chatDb
    const recordsPool = req.app.locals.web2Db;
    const productsPool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!recordsPool || !productsPool) return res.status(500).json({ error: 'DB unavailable' });
    const code = req.params.code;
    // records + products cùng nằm trên web2Db → 1 transaction bao trọn
    // (SELECT FOR UPDATE + deductStock + saveRefundData) để: (1) khóa record
    // chống double-approve / Worker retry trừ kho đôi, (2) atomic — crash giữa
    // chừng = ROLLBACK, không còn cảnh trừ kho nhưng record không update.
    const client = await recordsPool.connect();
    let committed = false;
    try {
        await client.query('BEGIN');
        const row = await loadRefund(client, code, true);
        if (!row) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Refund not found' });
        }
        const data = row.data || {};
        const currentStatus = data.status || 'draft';

        // Idempotent: nếu đã approved + đã trừ kho → skip (đọc trong lock nên
        // request thứ 2 chờ COMMIT của request thứ 1 rồi mới thấy state mới)
        if (currentStatus === 'approved' && data.stock_deducted === true) {
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                idempotent: true,
                refund: { code, status: 'approved' },
            });
        }
        if (!['draft', 'sent'].includes(currentStatus)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ approve được từ draft/sent (hiện: ${currentStatus})`,
            });
        }

        const lines = normalizeLines(parseProducts(data.products));
        if (lines.size === 0) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: 'Phiếu trả hàng không có SP nào (data.products rỗng)',
            });
        }

        const stockResults = await deductStock(client, lines);
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'approve',
            userId: req.body?.userId,
            userName,
            note: `Duyệt phiếu + trừ kho ${stockResults.length} dòng SP`,
            extra: { stockResults },
        });
        await saveRefundData(client, code, {
            status: 'approved',
            stock_deducted: true,
            approved_at: Date.now(),
            approved_note: req.body?.note || null,
            approved_by: userName,
            approved_by_id: req.body?.userId || null,
            history: newHistory,
        });
        await client.query('COMMIT');
        committed = true;
        _notify('approve', code);
        res.json({
            success: true,
            refund: { code, status: 'approved' },
            stock: stockResults,
            linesProcessed: stockResults.length,
        });
    } catch (e) {
        if (!committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
        }
        console.error('[PURCHASE-REFUND] /approve error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /:code/cancel-approve — approved → sent + restock (revert)
// Body: { reason?: string }
// -----------------------------------------------------
router.post('/:code/cancel-approve', async (req, res) => {
    const recordsPool = req.app.locals.web2Db;
    const productsPool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!recordsPool || !productsPool) return res.status(500).json({ error: 'DB unavailable' });
    const code = req.params.code;
    // 1 transaction bao trọn (SELECT FOR UPDATE + restock + saveRefundData):
    // khóa record chống revoke đôi + atomic restock/record-update.
    const client = await recordsPool.connect();
    let committed = false;
    try {
        await client.query('BEGIN');
        const row = await loadRefund(client, code, true);
        if (!row) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Refund not found' });
        }
        const data = row.data || {};
        const currentStatus = data.status || 'draft';
        if (currentStatus !== 'approved') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ revoke được khi đang approved (hiện: ${currentStatus})`,
            });
        }
        const lines = normalizeLines(parseProducts(data.products));
        const stockResults = data.stock_deducted ? await restockStock(client, lines) : [];
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'cancel-approve',
            userId: req.body?.userId,
            userName,
            note: `Hủy duyệt + trả tồn ${stockResults.length} dòng. Lý do: ${req.body?.reason || '(không)'}`,
            extra: { stockResults },
        });
        await saveRefundData(client, code, {
            status: 'sent',
            stock_deducted: false,
            cancel_approve_at: Date.now(),
            cancel_approve_reason: req.body?.reason || null,
            cancel_approve_by: userName,
            history: newHistory,
        });
        await client.query('COMMIT');
        committed = true;
        _notify('cancel-approve', code);
        res.json({
            success: true,
            refund: { code, status: 'sent' },
            stock: stockResults,
            linesProcessed: stockResults.length,
        });
    } catch (e) {
        if (!committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
        }
        console.error('[PURCHASE-REFUND] /cancel-approve error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

// -----------------------------------------------------
// POST /:code/refunded — approved → refunded (NCC đã hoàn tiền, no stock)
// Body: { refundMethod?: 'cash'|'bank'|'debt_offset'|'replace', refundAmount?, note? }
// -----------------------------------------------------
router.post('/:code/refunded', async (req, res) => {
    const recordsPool = req.app.locals.web2Db;
    if (!recordsPool) return res.status(500).json({ error: 'DB unavailable' });
    const code = req.params.code;
    try {
        const row = await loadRefund(recordsPool, code);
        if (!row) return res.status(404).json({ error: 'Refund not found' });
        const data = row.data || {};
        if (data.status !== 'approved') {
            return res.status(400).json({
                error: `Chỉ mark refunded sau khi approved (hiện: ${data.status})`,
            });
        }
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'refunded',
            userId: req.body?.userId,
            userName,
            note: `NCC đã hoàn tiền (${req.body?.refundMethod || data.refundMethod || 'unknown'})`,
        });
        await saveRefundData(recordsPool, code, {
            status: 'refunded',
            refunded_at: Date.now(),
            refundMethod: req.body?.refundMethod || data.refundMethod || null,
            refundAmount: req.body?.refundAmount ?? data.totalAmount ?? null,
            refunded_note: req.body?.note || null,
            refunded_by: userName,
            history: newHistory,
        });
        _notify('refunded', code);
        res.json({ success: true, refund: { code, status: 'refunded' } });
    } catch (e) {
        console.error('[PURCHASE-REFUND] /refunded error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// -----------------------------------------------------
// POST /:code/reject — draft|sent|approved → rejected. Nếu đang approved → restock.
// KHÔNG cho reject từ refunded (tiền đã hoàn) hoặc rejected (idempotent OK).
// Body: { reason?: string }
// -----------------------------------------------------
router.post('/:code/reject', async (req, res) => {
    const recordsPool = req.app.locals.web2Db;
    const productsPool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!recordsPool || !productsPool) return res.status(500).json({ error: 'DB unavailable' });
    const code = req.params.code;
    // H4 fix 2026-06-11: cùng pattern /approve + /cancel-approve — 1 transaction
    // bao trọn (SELECT FOR UPDATE + restock + saveRefundData): khóa record chống
    // reject đôi / race với approve, atomic restock/record-update.
    const client = await recordsPool.connect();
    let committed = false;
    try {
        await client.query('BEGIN');
        const row = await loadRefund(client, code, true);
        if (!row) {
            await client.query('ROLLBACK');
            return res.status(404).json({ error: 'Refund not found' });
        }
        const data = row.data || {};
        const currentStatus = data.status || 'draft';
        if (currentStatus === 'rejected') {
            await client.query('ROLLBACK');
            return res.json({ success: true, idempotent: true });
        }
        if (!['draft', 'sent', 'approved'].includes(currentStatus)) {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ reject được từ draft/sent/approved (hiện: ${currentStatus})`,
            });
        }
        let stockResults = [];
        if (data.stock_deducted) {
            const lines = normalizeLines(parseProducts(data.products));
            stockResults = await restockStock(client, lines);
        }
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'reject',
            userId: req.body?.userId,
            userName,
            note: `NCC từ chối${stockResults.length ? ` + trả tồn ${stockResults.length} dòng` : ''}. Lý do: ${req.body?.reason || '(không)'}`,
            extra: { stockResults },
        });
        await saveRefundData(client, code, {
            status: 'rejected',
            stock_deducted: false,
            rejected_at: Date.now(),
            rejected_reason: req.body?.reason || null,
            rejected_by: userName,
            history: newHistory,
        });
        await client.query('COMMIT');
        committed = true;
        _notify('reject', code);
        res.json({
            success: true,
            refund: { code, status: 'rejected' },
            stock: stockResults,
            linesProcessed: stockResults.length,
        });
    } catch (e) {
        if (!committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
        }
        console.error('[PURCHASE-REFUND] /reject error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
    }
});

router.initializeNotifiers = initializeNotifiers;
module.exports = router;
