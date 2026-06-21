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
// C9: dùng ensureLedgerTables để /quick-refund tạo bảng ledger nếu cold-start.
const supplierWalletRoutes = require('./web2-supplier-wallet');
// HIGH (audit 2026-06-20 #40/#42): TOÀN BỘ route ở đây là money/stock side-effect
// (quick-refund mint ví NCC + trừ kho, approve/cancel/reject đảo kho+ví). TRƯỚC đây
// router KHÔNG có auth → mọi máy/khách gọi trực tiếp API là tự duyệt/mint được.
// requireWeb2AuthSoft = gate mềm: thiếu/sai token → 401 khi WEB2_AUTH_ENFORCE=1 (ĐANG BẬT).
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
// Trần over-refund SERVER-AUTHORITATIVE — đọc SL đã NHẬN THẬT từ web2_so_order.
// Lib dùng chung với web2-supplier-wallet (/tx) — xem lib/web2-so-order-qty.js.
const { loadSoOrderReceivedQtyMap } = require('../lib/web2-so-order-qty');
router.use(requireWeb2AuthSoft);

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

// loadSoOrderRowQtyMap → lib/web2-so-order-qty.js (dùng chung supplier-wallet /tx).

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
        const upd = await pool.query(
            `UPDATE web2_products SET stock = COALESCE(stock, 0) - $1, updated_at = $2 WHERE code = $3`,
            [qty, now, code]
        );
        // 1D fix: mã SP sai trước đây bị nuốt silent → phiếu approved + ví giảm mà
        // kho không đổi. Caller đều trong transaction → throw = ROLLBACK trọn phiếu.
        if (upd.rowCount === 0) {
            throw new Error(`Mã SP ${code} không tồn tại trong kho`);
        }
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
        const upd = await pool.query(
            `UPDATE web2_products SET stock = COALESCE(stock, 0) + $1, updated_at = $2 WHERE code = $3`,
            [qty, now, code]
        );
        // 1D fix: như deductStock — mã SP không tồn tại phải fail rõ, không nuốt silent.
        if (upd.rowCount === 0) {
            throw new Error(`Mã SP ${code} không tồn tại trong kho`);
        }
        const after = await pool.query(`SELECT stock FROM web2_products WHERE code = $1`, [code]);
        results.push({
            code,
            restocked: qty,
            after: after.rows[0]?.stock != null ? Number(after.rows[0].stock) : null,
        });
    }
    return results;
}

// HIGH-1 FIX (2026-06-18): đảo ghi ví NCC khi huỷ duyệt / từ chối phiếu trả đã
// approved. quick-refund (+ addTransaction client) ghi ledger type='return' với
// tx_id = `tx-refund-<code>`. TRƯỚC đây cancel-approve/reject CHỈ restock kho, KHÔNG
// xoá ledger → returnedAmount kẹt vĩnh viễn → nợ NCC hụt (shop trả thiếu tiền NCC).
// Hàm này xoá ledger entry + trừ lại returned_row_ids (đảo cộng dồn). Chạy TRONG
// transaction caller (atomic với restock). Idempotent: DELETE theo tx_id UNIQUE.
async function reverseRefundLedger(client, code, data) {
    const ledgerTxId = `tx-refund-${code}`;
    const del = await client.query(
        `DELETE FROM web2_supplier_ledger WHERE tx_id = $1 RETURNING supplier`,
        [ledgerTxId]
    );
    if (!del.rows.length) return { reversed: false, supplier: null };
    const supplier = del.rows[0].supplier;
    const rowReturns =
        data?.rowReturns && typeof data.rowReturns === 'object' ? data.rowReturns : null;
    if (rowReturns) {
        const metaQ = await client.query(
            `SELECT returned_row_ids FROM web2_supplier_meta WHERE supplier = $1 FOR UPDATE`,
            [supplier]
        );
        if (metaQ.rows.length) {
            const cur = metaQ.rows[0].returned_row_ids || {};
            for (const [rid, v] of Object.entries(rowReturns)) {
                const prev = cur[rid];
                if (!prev) continue;
                const nq = (Number(prev.qty) || 0) - (Number(v?.qty) || 0);
                const na = (Number(prev.amount) || 0) - (Number(v?.amount) || 0);
                if (nq <= 0 && na <= 0) delete cur[rid];
                else cur[rid] = { qty: Math.max(0, nq), amount: Math.max(0, na), ts: Date.now() };
            }
            await client.query(
                `UPDATE web2_supplier_meta SET returned_row_ids = $2::jsonb, updated_at = $3 WHERE supplier = $1`,
                [supplier, JSON.stringify(cur), Date.now()]
            );
        }
    }
    return { reversed: true, supplier };
}

// SSE notify ví NCC sau khi đảo ledger (supplier-wallet/debt pages tự refresh).
function _notifySupplierWallet(req, supplier) {
    if (!supplier) return;
    try {
        req.app.locals.web2RealtimeSseNotify?.(
            'web2:supplier-wallet',
            { action: 'tx', supplier, ts: Date.now() },
            'update'
        );
    } catch (_) {}
}

// -----------------------------------------------------
// POST /:code/approve — draft|sent → approved + deduct stock
// Body: { note?: string }
// -----------------------------------------------------
router.post('/:code/approve', async (req, res) => {
    // ⚠ Sau tách DB (06/2026): CẢ records VÀ products đều ở **web2Db** (web2_records,
    // web2_products). `|| chatDb` chỉ là dead-safe fallback (boot-guard fail-fast → không chạy).
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
// C9 (2026-06-13): POST /quick-refund — ATOMIC create + approve + ghi ví NCC.
// TRƯỚC đây client gọi 3 bước rời (create → approve → wallet); nếu approve FAIL
// sau create → để lại phiếu draft MỒ CÔI (kho chưa trừ, ví chưa ghi, list rối).
// Giờ gộp 1 transaction: tạo phiếu (status=approved) + trừ kho + ghi ledger ví
// NCC (type=return). Lỗi bất kỳ → ROLLBACK trọn → KHÔNG còn draft mồ côi.
// Idempotent: record theo (entity_slug, code); ledger theo txId=tx-refund-<code>.
// KHÔNG đụng /tx live (inline ledger pattern để zero-regression money path).
// Body: { code, name?, supplier|supplierName, supplierCode?, refundDate?, reason?,
//   refundMethod?, totalQty?, totalAmount, note?, products:[{code,name,qty,price}],
//   sourcePurchaseCode?, userId?, userName?, rowReturns? }
// -----------------------------------------------------
router.post('/quick-refund', async (req, res) => {
    const pool = req.app.locals.web2Db || req.app.locals.chatDb;
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    const b = req.body || {};
    const code = String(b.code || '').trim();
    const supplier = String(b.supplier || b.supplierName || '').trim();
    if (!code) return res.status(400).json({ error: 'code required' });
    if (!supplier) return res.status(400).json({ error: 'supplier required' });
    const products = parseProducts(b.products);
    const lines = normalizeLines(products);
    if (lines.size === 0)
        return res.status(400).json({ error: 'products rỗng (không có SP hợp lệ)' });
    let amount = Number(b.totalAmount) || 0;
    if (amount <= 0) return res.status(400).json({ error: 'totalAmount phải > 0' });
    // SERVER-AUTHORITATIVE (audit 2026-06-20 #42): credit ledger NCC PHẢI nhất quán
    // với CHÍNH line items đã trừ kho — trước đây tin `totalAmount` client tách rời
    // → client gửi qty=1 (trừ 1 kho) nhưng totalAmount phồng → credit ví NCC quá tay.
    // Tính Σ(qty×price) từ products đã submit; nếu client vượt >1% → CAP về computed
    // (cho phép shop refund ÍT hơn: giảm giá/đối trừ; chỉ chặn phồng lên).
    const computedAmount = (products || []).reduce((s, p) => {
        const q = Number(p?.qty || p?.quantity || 0);
        const pr = Number(p?.price || p?.unitPrice || 0);
        return s + (q > 0 && pr > 0 ? q * pr : 0);
    }, 0);
    if (computedAmount > 0 && amount > computedAmount * 1.01) {
        console.warn(
            `[PURCHASE-REFUND] quick-refund ${code}: client amount=${amount} > computed=${computedAmount} → cap`
        );
        amount = computedAmount;
    }
    const userName = b.userName || '(ẩn danh)';
    const userId = b.userId || null;
    const now = Date.now();
    const txId = `tx-refund-${code}`;

    // Cold-start: đảm bảo bảng ledger NCC tồn tại (best-effort, không chặn).
    try {
        await supplierWalletRoutes.ensureLedgerTables(pool);
    } catch (e) {
        console.warn('[PURCHASE-REFUND] ensureLedgerTables warn:', e.message);
    }

    const client = await pool.connect();
    let committed = false;
    try {
        await client.query('BEGIN');

        // 1. Tạo phiếu (approved + stock_deducted) — idempotent theo (entity_slug, code).
        const data = {
            supplierName: supplier,
            supplierCode: b.supplierCode || null,
            refundDate: b.refundDate || new Date(now).toISOString().slice(0, 10),
            reason: b.reason || '',
            refundMethod: b.refundMethod || '',
            totalQty: Number(b.totalQty) || 0,
            totalAmount: amount,
            note: b.note || '',
            products,
            // HIGH-1 FIX: lưu rowReturns để cancel-approve/reject đảo returned_row_ids.
            rowReturns: b.rowReturns && typeof b.rowReturns === 'object' ? b.rowReturns : null,
            status: 'approved',
            stock_deducted: true,
            approved_at: now,
            approved_by: userName,
            approved_by_id: userId,
            sourcePurchaseCode: b.sourcePurchaseCode || null,
            createdByName: userName,
            history: [
                {
                    ts: now,
                    action: 'create',
                    userId,
                    userName,
                    note: `Tạo phiếu trả (quick) cho ${supplier}`,
                },
                {
                    ts: now,
                    action: 'approve',
                    userId,
                    userName,
                    note: 'Duyệt + trừ kho (atomic quick-refund)',
                },
            ],
        };
        const recIns = await client.query(
            `INSERT INTO web2_records (entity_slug, code, name, data, is_active, created_by, created_at, updated_at)
             VALUES ('purchase-refund', $1, $2, $3::jsonb, TRUE, $4, $5, $5)
             ON CONFLICT (entity_slug, code) WHERE code IS NOT NULL DO NOTHING
             RETURNING *`,
            [code, b.name || `Trả hàng ${supplier}`, JSON.stringify(data), userId, now]
        );
        if (recIns.rows.length === 0) {
            // code đã tồn tại (retry / double-submit) → phiếu đã tạo+approve trước đó →
            // idempotent, KHÔNG trừ kho/ghi ví lần nữa.
            const existing = await loadRefund(client, code, false);
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                idempotent: true,
                refund: { code, status: existing?.data?.status || 'approved' },
            });
        }

        // 2. Trừ kho (deductStock throw nếu mã SP không tồn tại → ROLLBACK trọn phiếu).
        const stockResults = await deductStock(client, lines);

        // 3. Ghi ledger ví NCC type='return' (idempotent theo txId). Inline pattern
        //    của web2-supplier-wallet /tx — KHÔNG gọi /tx (giữ money path live nguyên).
        await client.query(
            `INSERT INTO web2_supplier_meta (supplier, created_at, updated_at)
             VALUES ($1, $2, $2) ON CONFLICT (supplier) DO NOTHING`,
            [supplier, now]
        );
        const metaQ = await client.query(
            `SELECT returned_row_ids FROM web2_supplier_meta WHERE supplier = $1 FOR UPDATE`,
            [supplier]
        );
        const led = await client.query(
            `INSERT INTO web2_supplier_ledger
                (tx_id, supplier, ts, type, amount, note, ref, performed_by, move_name, created_at)
             VALUES ($1, $2, $3, 'return', $4, $5, $6, $7, NULL, $8)
             ON CONFLICT (tx_id) DO NOTHING RETURNING *`,
            [
                txId,
                supplier,
                now,
                amount,
                b.note || `Trả hàng ${code}`,
                JSON.stringify({
                    refundCode: code,
                    qty: Number(b.totalQty) || 0,
                    method: b.refundMethod || null,
                    userId,
                    userName,
                }),
                userName,
                now,
            ]
        );
        // returned_row_ids: lưu qty/amount THẬT nếu client gửi rowReturns (xem C18).
        const rowReturns = b.rowReturns && typeof b.rowReturns === 'object' ? b.rowReturns : null;
        if (rowReturns) {
            const cur = metaQ.rows[0]?.returned_row_ids || {};
            // SL đã NHẬN THẬT lấy từ web2_so_order (server), KHÔNG tin client `ordered`.
            // Đọc 1 lần trong transaction.
            const receivedMap = await loadSoOrderReceivedQtyMap(client);
            for (const [rid, v] of Object.entries(rowReturns)) {
                // [11]: cộng dồn delta (xem web2-supplier-wallet /tx).
                const prev = cur[rid] || {};
                const newQty = (Number(prev.qty) || 0) + (Number(v?.qty) || 0);
                // FIX over-refund 2026-06-21 (audit #1/#2): cap SERVER-AUTHORITATIVE.
                // serverQty = SL đã NHẬN từ so-order, tính LẠI mỗi lần (client không sửa
                // được) → là trần khi tra được, KHÔNG pin min-với-client (tránh khoá vĩnh
                // viễn khi client gửi `ordered` nhỏ lần đầu). Pin `ordered = cap` để lần
                // sau còn trần khi so-order bị wipe. so-order KHÔNG tra được → fallback
                // tightest(prevOrdered, clientOrdered); không nguồn nào → REJECT.
                const serverQty = receivedMap.get(String(rid));
                const clientOrdered = Number(v?.ordered);
                const prevOrdered = Number(prev.ordered);
                let cap;
                if (Number.isFinite(serverQty) && serverQty > 0) {
                    cap = serverQty; // authoritative — bỏ qua client/pin
                } else {
                    cap = null;
                    for (const cand of [prevOrdered, clientOrdered]) {
                        if (Number.isFinite(cand) && cand > 0)
                            cap = cap === null ? cand : Math.min(cap, cand);
                    }
                }
                if (cap === null) {
                    const err = new Error(
                        `Không xác định được SL đã nhận của dòng ${rid} (so-order trống) — không thể trả`
                    );
                    err.httpStatus = 400;
                    throw err;
                }
                if (newQty > cap) {
                    const err = new Error(
                        `Trả vượt số đã nhận (row ${rid}: đã trả+lần này=${newQty} > đã nhận=${cap})`
                    );
                    err.httpStatus = 400;
                    throw err;
                }
                cur[rid] = {
                    qty: newQty,
                    amount: (Number(prev.amount) || 0) + (Number(v?.amount) || 0),
                    ts: now,
                    ordered: cap, // pin trần (audit #2: symmetry với /tx prevOrdered)
                };
            }
            await client.query(
                `UPDATE web2_supplier_meta SET returned_row_ids = $2::jsonb, updated_at = $3 WHERE supplier = $1`,
                [supplier, JSON.stringify(cur), now]
            );
        }

        await client.query('COMMIT');
        committed = true;
        _notify('approve', code);
        try {
            req.app.locals.web2RealtimeSseNotify?.(
                'web2:supplier-wallet',
                { action: 'tx', supplier, ts: now },
                'update'
            );
        } catch {}
        res.json({
            success: true,
            refund: { code, status: 'approved' },
            stock: stockResults,
            wallet: { txId, amount, alreadyCredited: led.rows.length === 0 },
        });
    } catch (e) {
        if (!committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
        }
        console.error('[PURCHASE-REFUND] /quick-refund error:', e.message);
        res.status(e.httpStatus || 500).json({ error: e.message });
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
    // HIGH-1: đảm bảo bảng ledger tồn tại TRƯỚC transaction (DELETE ledger không
    // được throw giữa transaction → abort). Best-effort.
    try {
        await supplierWalletRoutes.ensureLedgerTables(recordsPool);
    } catch (_) {}
    // 1 transaction bao trọn (SELECT FOR UPDATE + restock + reverse ledger + save):
    // khóa record chống revoke đôi + atomic restock/record-update + đảo ví NCC.
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
        // HIGH-1 FIX: đảo ledger ví NCC (xoá tx-refund-<code> + trừ returned_row_ids)
        // — atomic với restock. Lỗi → throw → ROLLBACK trọn (không restock mà nợ sai).
        const ledgerRev = await reverseRefundLedger(client, code, data);
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'cancel-approve',
            userId: req.body?.userId,
            userName,
            note: `Hủy duyệt + trả tồn ${stockResults.length} dòng${ledgerRev.reversed ? ' + đảo ghi ví NCC' : ''}. Lý do: ${req.body?.reason || '(không)'}`,
            extra: { stockResults, ledgerReversed: ledgerRev.reversed },
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
        _notifySupplierWallet(req, ledgerRev.supplier);
        res.json({
            success: true,
            refund: { code, status: 'sent' },
            stock: stockResults,
            linesProcessed: stockResults.length,
            ledgerReversed: ledgerRev.reversed,
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
    // 1D fix: cùng pattern /reject — transaction + FOR UPDATE. Trước đây đọc
    // không lock rồi save → race với cancel-approve: mark 'refunded' trên state
    // stale trong khi kho đã được trả lại.
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
        // Idempotent: đã refunded → trả OK, không ghi thêm gì.
        if (currentStatus === 'refunded') {
            await client.query('ROLLBACK');
            return res.json({
                success: true,
                idempotent: true,
                alreadyDone: true,
                refund: { code, status: 'refunded' },
            });
        }
        if (currentStatus !== 'approved') {
            await client.query('ROLLBACK');
            return res.status(400).json({
                error: `Chỉ mark refunded sau khi approved (hiện: ${currentStatus})`,
            });
        }
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'refunded',
            userId: req.body?.userId,
            userName,
            note: `NCC đã hoàn tiền (${req.body?.refundMethod || data.refundMethod || 'unknown'})`,
        });
        await saveRefundData(client, code, {
            status: 'refunded',
            refunded_at: Date.now(),
            refundMethod: req.body?.refundMethod || data.refundMethod || null,
            refundAmount: req.body?.refundAmount ?? data.totalAmount ?? null,
            refunded_note: req.body?.note || null,
            refunded_by: userName,
            history: newHistory,
        });
        await client.query('COMMIT');
        committed = true;
        _notify('refunded', code);
        res.json({ success: true, refund: { code, status: 'refunded' } });
    } catch (e) {
        if (!committed) {
            try {
                await client.query('ROLLBACK');
            } catch (_) {}
        }
        console.error('[PURCHASE-REFUND] /refunded error:', e.message);
        res.status(500).json({ error: e.message });
    } finally {
        client.release();
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
    // HIGH-1: ensure ledger table trước transaction (DELETE không throw giữa tx).
    try {
        await supplierWalletRoutes.ensureLedgerTables(recordsPool);
    } catch (_) {}
    // H4 fix 2026-06-11: cùng pattern /approve + /cancel-approve — 1 transaction
    // bao trọn (SELECT FOR UPDATE + restock + reverse ledger + saveRefundData): khóa
    // record chống reject đôi / race với approve, atomic restock + đảo ví NCC.
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
        // HIGH-1 FIX: đảo ledger ví NCC (idempotent; no-op nếu phiếu chưa ghi ví).
        const ledgerRev = await reverseRefundLedger(client, code, data);
        const userName = req.body?.userName || '(ẩn danh)';
        const newHistory = appendHistory(data, {
            action: 'reject',
            userId: req.body?.userId,
            userName,
            note: `NCC từ chối${stockResults.length ? ` + trả tồn ${stockResults.length} dòng` : ''}${ledgerRev.reversed ? ' + đảo ghi ví NCC' : ''}. Lý do: ${req.body?.reason || '(không)'}`,
            extra: { stockResults, ledgerReversed: ledgerRev.reversed },
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
        _notifySupplierWallet(req, ledgerRev.supplier);
        res.json({
            success: true,
            refund: { code, status: 'rejected' },
            stock: stockResults,
            linesProcessed: stockResults.length,
            ledgerReversed: ledgerRev.reversed,
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
