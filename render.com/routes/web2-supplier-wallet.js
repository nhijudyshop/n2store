// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// WEB 2.0 SUPPLIER WALLET — server ledger (ĐỢT E, 2026-06-12, audit vòng 3).
//
// Thay kiến trúc Firestore client-write (doc `web2_supplier_wallet/main`
// last-write-wins): mọi giao dịch ví NCC giờ là LEDGER append-only trên
// web2Db, mutation trong transaction + idempotent theo tx_id — đóng cụm bug
// đợt E: lost-update 2 tab/2 user, confirmPay fire-and-forget, saveSupplier/
// saveSupplierNote RMW mất bản ghi, purge 30 ngày mất audit, Sync.init đè
// local, nextMoveName MAX+1 client race, SePay dup cross-machine.
//
// Bảng:
//   web2_supplier_ledger  — 1 row = 1 giao dịch (payment|return), UNIQUE tx_id.
//   web2_supplier_meta    — 1 row = 1 NCC (code, note, returned_row_ids JSONB).
//   web2_supplier_move_seq — sequence sinh số bút toán PAY/<năm>/<seq>.
//
// GET /state trả ĐÚNG shape client cũ ({wallets: {…transactions[]…}}) để
// supplier-wallet/debt/purchase-refund chỉ swap tầng storage, không sửa render.
// totalPurchased/balance KHÔNG lưu server — client derive từ so-order như cũ.
//
// SSE: _notify topic 'web2:supplier-wallet' sau mutation (hub web2).
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

let _notifyClients = null;
router.initializeNotifiers = (notifyClients) => {
    _notifyClients = notifyClients;
};
function _notify(action, supplier) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:supplier-wallet',
            { action, supplier: supplier || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-SUPPLIER-WALLET] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_supplier_ledger (
            id           BIGSERIAL PRIMARY KEY,
            tx_id        TEXT UNIQUE NOT NULL,
            supplier     TEXT NOT NULL,
            ts           BIGINT NOT NULL,
            type         TEXT NOT NULL,
            amount       NUMERIC(15,2) NOT NULL,
            note         TEXT,
            ref          JSONB,
            performed_by TEXT,
            move_name    TEXT,
            created_at   BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2sl_supplier ON web2_supplier_ledger(supplier);
        CREATE INDEX IF NOT EXISTS idx_w2sl_ts ON web2_supplier_ledger(ts);
        CREATE TABLE IF NOT EXISTS web2_supplier_meta (
            supplier         TEXT PRIMARY KEY,
            code             TEXT,
            note             TEXT,
            returned_row_ids JSONB NOT NULL DEFAULT '{}'::jsonb,
            created_at       BIGINT,
            updated_at       BIGINT
        );
        CREATE SEQUENCE IF NOT EXISTS web2_supplier_move_seq;
    `);
    _ensuredPools.add(pool);
}

const TX_TYPES = new Set(['payment', 'return']);

function mapTx(row) {
    return {
        id: row.tx_id,
        ts: Number(row.ts),
        type: row.type,
        amount: Number(row.amount) || 0,
        note: row.note || '',
        ref: row.ref || null,
        performedBy: row.performed_by || null,
        moveName: row.move_name || null,
    };
}

// =====================================================
// GET /api/web2-supplier-wallet/state
// Trả shape client cũ: { wallets, suppliers, lastUpdated, empty }
// =====================================================
router.get('/state', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
        await ensureTables(pool);
        const [metaQ, ledgerQ] = await Promise.all([
            pool.query(`SELECT * FROM web2_supplier_meta ORDER BY supplier`),
            pool.query(`SELECT * FROM web2_supplier_ledger ORDER BY ts ASC, id ASC`),
        ]);
        const wallets = {};
        const getW = (name) => {
            if (!wallets[name]) {
                wallets[name] = {
                    supplier: name,
                    totalPurchased: 0, // client derive từ so-order
                    paidAmount: 0,
                    returnedAmount: 0,
                    balance: 0,
                    returnedRowIds: {},
                    transactions: [],
                };
            }
            return wallets[name];
        };
        for (const m of metaQ.rows) {
            const w = getW(m.supplier);
            w.returnedRowIds = m.returned_row_ids || {};
        }
        for (const t of ledgerQ.rows) {
            const w = getW(t.supplier);
            const tx = mapTx(t);
            w.transactions.push(tx);
            if (tx.type === 'return') w.returnedAmount += tx.amount;
            else if (tx.type === 'payment') w.paidAmount += tx.amount;
        }
        const suppliers = metaQ.rows.map((m) => ({
            name: m.supplier,
            code: m.code || '',
            note: m.note || '',
            createdAt: Number(m.created_at) || null,
        }));
        res.json({
            success: true,
            data: {
                wallets,
                suppliers,
                lastUpdated: Date.now(),
                empty: metaQ.rows.length === 0 && ledgerQ.rows.length === 0,
            },
        });
    } catch (e) {
        console.error('[WEB2-SUPPLIER-WALLET] /state error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// GET /api/web2-supplier-wallet/suppliers — list nhẹ cho Web2SuppliersCache
// =====================================================
router.get('/suppliers', async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT supplier, code, note FROM web2_supplier_meta ORDER BY supplier`
        );
        res.json({
            success: true,
            data: r.rows.map((m) => ({
                name: m.supplier,
                code: m.code || '',
                note: m.note || '',
            })),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/web2-supplier-wallet/tx — GHI 1 giao dịch (money op).
// Body: { supplier, type: payment|return, amount>0, note?, ref?, performedBy?,
//         txId?, ts?, moveName?, rowReturns?: {[rowId]:{qty,amount}} }
// Idempotent theo txId (UNIQUE) — retry/2 máy cùng ghi → alreadyProcessed.
// type=payment không gửi moveName → server sinh PAY/<năm>/<seq> (sequence,
// hết race MAX+1 client). rowReturns merge vào meta.returned_row_ids (lock
// FOR UPDATE) — lưu qty/amount THẬT (hết returnedRowIds {qty:0,amount:0}).
// =====================================================
router.post('/tx', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const b = req.body || {};
    const supplier = String(b.supplier || '').trim();
    const type = String(b.type || '').trim();
    const amount = Number(b.amount);
    if (!supplier) return res.status(400).json({ success: false, error: 'supplier required' });
    if (!TX_TYPES.has(type))
        return res.status(400).json({ success: false, error: `type phải là payment|return` });
    if (!Number.isFinite(amount) || amount <= 0)
        return res.status(400).json({ success: false, error: 'amount phải > 0' });
    const txId =
        String(b.txId || '').trim() || `tx-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const ts = Number(b.ts) || Date.now();
    const performedBy =
        b.performedBy || req.web2User?.display_name || req.web2User?.username || null;
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        // Meta row: tạo nếu chưa có + LOCK (serialize returned_row_ids merge).
        await client.query(
            `INSERT INTO web2_supplier_meta (supplier, created_at, updated_at)
             VALUES ($1, $2, $2) ON CONFLICT (supplier) DO NOTHING`,
            [supplier, Date.now()]
        );
        const metaQ = await client.query(
            `SELECT returned_row_ids FROM web2_supplier_meta WHERE supplier = $1 FOR UPDATE`,
            [supplier]
        );
        // Bút toán: payment không có moveName → sinh từ sequence.
        let moveName = String(b.moveName || '').trim() || null;
        if (!moveName && type === 'payment') {
            const seq = await client.query(`SELECT nextval('web2_supplier_move_seq')::int AS n`);
            const year = new Date(ts).getFullYear();
            moveName = `PAY/${year}/${String(seq.rows[0].n).padStart(4, '0')}`;
        }
        const ins = await client.query(
            `INSERT INTO web2_supplier_ledger
                (tx_id, supplier, ts, type, amount, note, ref, performed_by, move_name, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
             ON CONFLICT (tx_id) DO NOTHING
             RETURNING *`,
            [
                txId,
                supplier,
                ts,
                type,
                amount,
                b.note || '',
                b.ref ? JSON.stringify(b.ref) : null,
                performedBy,
                moveName,
                Date.now(),
            ]
        );
        if (!ins.rows.length) {
            // tx_id đã tồn tại — retry/double-submit/2 máy → trả tx cũ, không ghi đôi.
            const existing = await client.query(
                `SELECT * FROM web2_supplier_ledger WHERE tx_id = $1`,
                [txId]
            );
            await client.query('COMMIT');
            return res.json({
                success: true,
                alreadyProcessed: true,
                tx: existing.rows.length ? mapTx(existing.rows[0]) : null,
            });
        }
        // returnedRowIds: CHỈ lưu khi có rowReturns (qty/amount THẬT).
        // C18 (2026-06-13): bỏ fallback ghi {qty:0,amount:0} theo ref.rowIds —
        // entry qty:0 là rác (không phân biệt được "trả 0" với "đã trả đủ") + gây
        // rủi ro over-refund khi filter A2 coi qty:0 = chưa trả. Thiếu rowReturns →
        // KHÔNG ghi returned_row_ids (ledger tx vẫn ghi đủ — không chặn money op).
        if (type === 'return') {
            const cur = metaQ.rows[0]?.returned_row_ids || {};
            const rowReturns =
                b.rowReturns && typeof b.rowReturns === 'object' ? b.rowReturns : null;
            let mutated = false;
            if (rowReturns) {
                for (const [rid, v] of Object.entries(rowReturns)) {
                    cur[rid] = {
                        qty: Number(v?.qty) || 0,
                        amount: Number(v?.amount) || 0,
                        ts,
                    };
                    mutated = true;
                }
            }
            if (mutated) {
                await client.query(
                    `UPDATE web2_supplier_meta
                     SET returned_row_ids = $2::jsonb, updated_at = $3
                     WHERE supplier = $1`,
                    [supplier, JSON.stringify(cur), Date.now()]
                );
            }
        }
        await client.query('COMMIT');
        _notify('tx', supplier);
        res.json({ success: true, tx: mapTx(ins.rows[0]) });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-SUPPLIER-WALLET] /tx error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// POST /api/web2-supplier-wallet/suppliers — upsert NCC (tạo / sửa code+note).
// Atomic ON CONFLICT per-row → hết saveSupplier/saveSupplierNote RMW
// lost-update + dup code='' của bản Firestore.
// =====================================================
router.post('/suppliers', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
        await ensureTables(pool);
        const b = req.body || {};
        const name = String(b.name || '').trim();
        if (!name) return res.status(400).json({ success: false, error: 'name required' });
        const r = await pool.query(
            `INSERT INTO web2_supplier_meta (supplier, code, note, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $4)
             ON CONFLICT (supplier) DO UPDATE SET
                code = COALESCE(NULLIF($2, ''), web2_supplier_meta.code),
                note = COALESCE($3, web2_supplier_meta.note),
                updated_at = $4
             RETURNING *`,
            [name, String(b.code || '').trim(), b.note ?? null, Date.now()]
        );
        _notify('supplier', name);
        const m = r.rows[0];
        res.json({
            success: true,
            supplier: { name: m.supplier, code: m.code || '', note: m.note || '' },
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================
// POST /api/web2-supplier-wallet/import — one-time migration từ Firestore.
// Body: { wallets: {…shape cũ…}, suppliers?: [{code,name,note?,createdAt?}] }
// CHỈ chạy khi ledger + meta đều rỗng (server-guarded, gọi lặp vô hại).
// =====================================================
router.post('/import', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const b = req.body || {};
    const wallets = b.wallets && typeof b.wallets === 'object' ? b.wallets : {};
    const suppliers = Array.isArray(b.suppliers) ? b.suppliers : [];
    const client = await pool.connect();
    try {
        await ensureTables(pool);
        await client.query('BEGIN');
        const cnt = await client.query(
            `SELECT (SELECT COUNT(*)::int FROM web2_supplier_ledger) AS l,
                    (SELECT COUNT(*)::int FROM web2_supplier_meta) AS m`
        );
        if (cnt.rows[0].l > 0 || cnt.rows[0].m > 0) {
            await client.query('ROLLBACK');
            return res.json({ success: true, skipped: true, reason: 'server đã có data' });
        }
        let txCount = 0;
        let metaCount = 0;
        const now = Date.now();
        for (const [name, w] of Object.entries(wallets)) {
            const supplier = String(name || '').trim();
            if (!supplier) continue;
            await client.query(
                `INSERT INTO web2_supplier_meta
                    (supplier, returned_row_ids, created_at, updated_at)
                 VALUES ($1, $2::jsonb, $3, $3) ON CONFLICT (supplier) DO NOTHING`,
                [supplier, JSON.stringify(w.returnedRowIds || {}), now]
            );
            metaCount++;
            const txs = Array.isArray(w.transactions) ? w.transactions : [];
            for (const t of txs) {
                if (!TX_TYPES.has(t?.type)) continue; // 'purchase' synthetic — derive lại từ so-order
                const amt = Number(t.amount) || 0;
                if (amt <= 0) continue;
                await client.query(
                    `INSERT INTO web2_supplier_ledger
                        (tx_id, supplier, ts, type, amount, note, ref, performed_by, move_name, created_at)
                     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                     ON CONFLICT (tx_id) DO NOTHING`,
                    [
                        String(t.id || `mig-${supplier}-${t.ts}-${txCount}`),
                        supplier,
                        Number(t.ts) || now,
                        t.type,
                        amt,
                        t.note || '',
                        t.ref ? JSON.stringify(t.ref) : null,
                        t.performedBy || null,
                        t.moveName || null,
                        now,
                    ]
                );
                txCount++;
            }
        }
        for (const sp of suppliers) {
            const name = String(sp?.name || '').trim();
            if (!name) continue;
            await client.query(
                `INSERT INTO web2_supplier_meta (supplier, code, note, created_at, updated_at)
                 VALUES ($1, $2, $3, $4, $4)
                 ON CONFLICT (supplier) DO UPDATE SET
                    code = COALESCE(NULLIF(EXCLUDED.code, ''), web2_supplier_meta.code),
                    note = COALESCE(EXCLUDED.note, web2_supplier_meta.note)`,
                [name, String(sp.code || '').trim(), sp.note ?? null, Number(sp.createdAt) || now]
            );
        }
        await client.query('COMMIT');
        console.log(
            `[WEB2-SUPPLIER-WALLET] import one-time: ${metaCount} NCC, ${txCount} giao dịch (từ Firestore)`
        );
        _notify('import', null);
        res.json({ success: true, imported: { suppliers: metaCount, transactions: txCount } });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-SUPPLIER-WALLET] /import error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// =====================================================
// DELETE /api/web2-supplier-wallet/supplier/:name — maintenance/admin.
// Xoá 1 NCC + toàn bộ ledger của nó (vd dọn data TEST-). Gate CỨNG
// x-admin-secret = CLEANUP_SECRET (fail-closed) — không phải page-flow.
// =====================================================
router.delete('/supplier/:name', async (req, res) => {
    const secret = process.env.CLEANUP_SECRET || '';
    if (!secret || (req.headers['x-admin-secret'] || '') !== secret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const name = String(req.params.name || '').trim();
        if (!name) return res.status(400).json({ success: false, error: 'name required' });
        const l = await pool.query(`DELETE FROM web2_supplier_ledger WHERE supplier = $1`, [name]);
        const m = await pool.query(`DELETE FROM web2_supplier_meta WHERE supplier = $1`, [name]);
        _notify('supplier-deleted', name);
        res.json({ success: true, deleted: { ledger: l.rowCount, meta: m.rowCount } });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// C9 (2026-06-13): export ensureTables để purchase-refund /quick-refund (atomic
// create+approve+ledger) tạo bảng ledger nếu cold-start chưa có. Không đổi hành vi.
router.ensureLedgerTables = ensureTables;

module.exports = router;
