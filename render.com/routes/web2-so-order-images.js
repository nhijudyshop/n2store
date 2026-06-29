// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — SỔ ORDER · KHO ẢNH NCC theo đợt (so-order image pool)
// 2026-06-28: ảnh quản lý cho Sổ Order — lưu BYTEA trong Render web2Db (KHÔNG
// nhét base64 vào doc web2_so_order để tránh phình doc). Mỗi (tabId, batch/đợt,
// ncc) có: 1 ảnh hóa đơn (kind='invoice') + nhiều ảnh SP (kind='product').
//   • Ảnh hóa đơn: auto đổ vào ô "Ảnh hóa đơn" khi tạo đơn với NCC tương ứng.
//   • Ảnh SP: hiện gallery cho chọn (nhiều lần) khi tạo đơn với NCC tương ứng.
//
// Endpoints (mount /api/web2-so-order-images):
//   GET    /list?tabId=&batch=     → metadata [{id, batch, ncc, kind, sortIdx}]  (auth soft)
//   GET    /by-ncc?tabId=&batch=&ncc=  → {invoice:{id}|null, products:[{id}]}     (auth soft)
//   GET    /img/:id                → serve binary (PUBLIC — để <img src> dùng được)
//   POST   /  {tabId,batch,ncc,kind,dataUrl}  → upload (invoice = replace)        (auth soft)
//   DELETE /:id                    → xoá 1 ảnh                                     (auth soft)
//   DELETE /ncc {tabId,batch,ncc}  → xoá toàn bộ ảnh của 1 NCC trong đợt          (auth soft)
// SSE topic 'web2:so-order-images' push realtime (manager + create-order đồng bộ).
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');

// Body parser riêng — ảnh dataUrl base64 (~nén 500KB → ~700KB). 12mb dư an toàn.
const jsonBody = express.json({ limit: '12mb' });

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, payload) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:so-order-images',
            { action, ...(payload || {}), ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-SO-ORDER-IMAGES] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_so_order_images (
            id           TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
            tab_id       TEXT NOT NULL,
            batch        TEXT NOT NULL DEFAULT '',
            ncc          TEXT NOT NULL,
            kind         TEXT NOT NULL CHECK (kind IN ('invoice','product')),
            data         BYTEA NOT NULL,
            content_type VARCHAR(50) NOT NULL DEFAULT 'image/jpeg',
            sort_idx     INTEGER NOT NULL DEFAULT 0,
            created_at   BIGINT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_w2soi_loc
            ON web2_so_order_images(tab_id, batch, ncc);
    `);
    _ensuredPools.add(pool);
}

// data:image/jpeg;base64,XXXX → { buf, mime }. Trả null nếu không hợp lệ.
function parseDataUrl(dataUrl) {
    const m = /^data:([^;,]+);base64,(.+)$/i.exec(String(dataUrl || ''));
    if (!m) return null;
    const mime = m[1];
    if (!/^image\/(jpeg|png|webp|gif)$/i.test(mime)) return null;
    try {
        const buf = Buffer.from(m[2], 'base64');
        if (!buf.length || buf.length > 11 * 1024 * 1024) return null;
        return { buf, mime };
    } catch {
        return null;
    }
}

// GET /list — metadata mọi ảnh của tab (lọc batch nếu truyền). Không trả bytea.
router.get('/list', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const tabId = String(req.query.tabId || '');
        if (!tabId) return res.status(400).json({ success: false, error: 'Thiếu tabId' });
        const params = [tabId];
        let where = 'tab_id = $1';
        if (req.query.batch !== undefined) {
            params.push(String(req.query.batch));
            where += ` AND batch = $${params.length}`;
        }
        const r = await pool.query(
            `SELECT id, batch, ncc, kind, sort_idx FROM web2_so_order_images
             WHERE ${where} ORDER BY ncc, kind, sort_idx, created_at`,
            params
        );
        res.json({
            success: true,
            items: r.rows.map((x) => ({
                id: x.id,
                batch: x.batch,
                ncc: x.ncc,
                kind: x.kind,
                sortIdx: x.sort_idx,
            })),
        });
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] list:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /by-ncc — ảnh của 1 NCC trong đợt (cho create-order: auto invoice + gallery SP).
router.get('/by-ncc', requireWeb2AuthSoft, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const tabId = String(req.query.tabId || '');
        const batch = String(req.query.batch || '');
        const ncc = String(req.query.ncc || '');
        if (!tabId || !ncc)
            return res.status(400).json({ success: false, error: 'Thiếu tabId/ncc' });
        const r = await pool.query(
            `SELECT id, kind, sort_idx FROM web2_so_order_images
             WHERE tab_id=$1 AND batch=$2 AND ncc=$3 ORDER BY kind, sort_idx, created_at`,
            [tabId, batch, ncc]
        );
        const invoice = r.rows.find((x) => x.kind === 'invoice');
        res.json({
            success: true,
            invoice: invoice ? { id: invoice.id } : null,
            products: r.rows.filter((x) => x.kind === 'product').map((x) => ({ id: x.id })),
        });
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] by-ncc:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /img/:id — serve binary (PUBLIC, immutable cache để <img src> dùng trực tiếp).
router.get('/img/:id', async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const r = await pool.query(
            'SELECT data, content_type FROM web2_so_order_images WHERE id=$1',
            [req.params.id]
        );
        if (!r.rows.length) return res.status(404).json({ success: false, error: 'Không có ảnh' });
        const { data, content_type } = r.rows[0];
        res.setHeader('Content-Type', content_type || 'image/jpeg');
        res.setHeader('Content-Length', data.length);
        res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.send(data);
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] img:', e.message);
        res.status(500).json({ success: false, error: 'Không tải được ảnh' });
    }
});

// POST / — upload 1 ảnh. kind='invoice' → REPLACE ảnh hóa đơn cũ của (tab,batch,ncc).
router.post('/', jsonBody, requireWeb2Admin, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const b = req.body || {};
        const tabId = String(b.tabId || '');
        const batch = String(b.batch || '');
        const ncc = String(b.ncc || '').trim();
        const kind = b.kind === 'invoice' ? 'invoice' : 'product';
        if (!tabId || !ncc)
            return res.status(400).json({ success: false, error: 'Thiếu tabId/ncc' });
        const parsed = parseDataUrl(b.dataUrl);
        if (!parsed)
            return res
                .status(400)
                .json({ success: false, error: 'Ảnh không hợp lệ (cần data:image base64)' });
        const now = Date.now();
        if (kind === 'invoice') {
            // 1 hóa đơn / NCC / đợt → xoá cũ rồi insert.
            await pool.query(
                `DELETE FROM web2_so_order_images WHERE tab_id=$1 AND batch=$2 AND ncc=$3 AND kind='invoice'`,
                [tabId, batch, ncc]
            );
        }
        // sort_idx = max+1 cho product (giữ thứ tự thêm).
        let sortIdx = 0;
        if (kind === 'product') {
            const mx = await pool.query(
                `SELECT COALESCE(MAX(sort_idx),-1) AS mx FROM web2_so_order_images
                 WHERE tab_id=$1 AND batch=$2 AND ncc=$3 AND kind='product'`,
                [tabId, batch, ncc]
            );
            sortIdx = (Number(mx.rows[0].mx) || -1) + 1;
        }
        const r = await pool.query(
            `INSERT INTO web2_so_order_images (tab_id, batch, ncc, kind, data, content_type, sort_idx, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [tabId, batch, ncc, kind, parsed.buf, parsed.mime, sortIdx, now]
        );
        _notify('upload', { tabId, batch, ncc, kind });
        res.json({ success: true, id: r.rows[0].id });
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] upload:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /ncc — xoá toàn bộ ảnh của 1 NCC trong đợt (xoá NCC card).
router.delete('/ncc', jsonBody, requireWeb2Admin, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const b = req.body || {};
        const tabId = String(b.tabId || '');
        const batch = String(b.batch || '');
        const ncc = String(b.ncc || '').trim();
        if (!tabId || !ncc)
            return res.status(400).json({ success: false, error: 'Thiếu tabId/ncc' });
        const r = await pool.query(
            `DELETE FROM web2_so_order_images WHERE tab_id=$1 AND batch=$2 AND ncc=$3 RETURNING id`,
            [tabId, batch, ncc]
        );
        _notify('delete-ncc', { tabId, batch, ncc });
        res.json({ success: true, deleted: r.rowCount });
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] delete-ncc:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id — xoá 1 ảnh.
router.delete('/:id', requireWeb2Admin, async (req, res) => {
    try {
        const pool = getPool(req);
        await ensureTables(pool);
        const r = await pool.query(
            'DELETE FROM web2_so_order_images WHERE id=$1 RETURNING tab_id, batch, ncc',
            [req.params.id]
        );
        if (!r.rowCount) return res.status(404).json({ success: false, error: 'Không có ảnh' });
        const x = r.rows[0];
        _notify('delete', { tabId: x.tab_id, batch: x.batch, ncc: x.ncc });
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-SO-ORDER-IMAGES] delete:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
