// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — SỔ ORDER (so-order) server storage
// C8 (2026-06-13): migrate Firestore `web2_so_order/main` → Postgres web2Db.
//
// Model: 1 doc JSONB / shop (doc_id='main') — GIỮ NGUYÊN shape `{tabs, activeTabId, …}`
// như Firestore (KHÔNG normalize ra rows ở phase này — giảm rủi ro client rewrite).
// Cải thiện so với Firestore:
//   • Single source of truth trên Postgres (hết dual-source F1).
//   • Optimistic concurrency qua `version` (UPDATE … WHERE version=$base) → hết
//     last-write-wins; ghi đè stale → 409 conflict (client pull rồi merge/chọn).
//   • Auth qua requireWeb2AuthSoft (enforce live) — Firestore client SDK không có.
//   • SSE `web2:so-order` push realtime (thay visibilitychange-only pull).
//
// Endpoints (mount /api/web2-so-order):
//   GET  /get              → { success, data, lastUpdated, version, empty }
//   POST /save  {data, baseVersion} → optimistic; mismatch → 409 {conflict, server:{data,version,lastUpdated}}
// =====================================================

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');
// EVENT-SINK audit (2026-06-22): ghi web2_audit_events mỗi lần lưu Sổ Order
// (document-level: ai lưu, lúc nào, version). entity='so-order', id='main'.
// Per-shipment detail = đợt sau (frontend gửi changeNote). Xem audit rollout.
const { recordAuditEvent } = require('../services/web2-audit-sink');

const DOC_ID = 'main';

// -----------------------------------------------------
// SSE notifier injected từ server.js. Topic 'web2:so-order'.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, version) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:so-order',
            { action, version: version || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-SO-ORDER] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_so_order (
            doc_id      TEXT PRIMARY KEY,
            data        JSONB NOT NULL DEFAULT '{}'::jsonb,
            version     BIGINT NOT NULL DEFAULT 1,
            updated_at  BIGINT NOT NULL,
            updated_by  TEXT
        );
    `);
    _ensuredPools.add(pool);
}

// GET /get — trả doc 'main' (hoặc empty nếu chưa có).
router.get('/get', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query(
            `SELECT data, version, updated_at FROM web2_so_order WHERE doc_id = $1`,
            [DOC_ID]
        );
        if (!r.rows.length) {
            return res.json({ success: true, empty: true, data: null, version: 0, lastUpdated: 0 });
        }
        const row = r.rows[0];
        res.json({
            success: true,
            empty: false,
            data: row.data || {},
            version: Number(row.version) || 0,
            lastUpdated: Number(row.updated_at) || 0,
        });
    } catch (e) {
        console.error('[WEB2-SO-ORDER] /get error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /save  body { data, baseVersion } — optimistic concurrency.
//   • baseVersion == 0 / doc chưa có → INSERT (ON CONFLICT DO NOTHING; nếu vừa bị
//     máy khác tạo → coi như conflict).
//   • baseVersion > 0 → UPDATE … WHERE version = baseVersion (chỉ ghi nếu chưa ai
//     sửa). 0 row → 409 conflict, trả server hiện tại để client merge/chọn.
router.post('/save', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const b = req.body || {};
    const data = b.data;
    if (data == null || typeof data !== 'object') {
        return res.status(400).json({ success: false, error: 'data (object) required' });
    }
    const baseVersion = Number(b.baseVersion) || 0;
    const now = Date.now();
    const updatedBy =
        (req.web2User && (req.web2User.display_name || req.web2User.username)) ||
        String(b.userName || '').slice(0, 120) ||
        null;
    try {
        await ensureTables(pool);
        if (baseVersion <= 0) {
            // Tạo lần đầu — INSERT, nếu đã tồn tại (máy khác tạo trước) → conflict.
            const ins = await pool.query(
                `INSERT INTO web2_so_order (doc_id, data, version, updated_at, updated_by)
                 VALUES ($1, $2::jsonb, 1, $3, $4)
                 ON CONFLICT (doc_id) DO NOTHING
                 RETURNING version, updated_at`,
                [DOC_ID, JSON.stringify(data), now, updatedBy]
            );
            if (ins.rows.length) {
                _notify('create', 1);
                recordAuditEvent(pool, {
                    entity: 'so-order',
                    entityId: 'main',
                    action: 'create',
                    userId: req.web2User?.id ?? null,
                    userName: updatedBy,
                    sourcePage: 'so-order',
                    changes: { version: 1, note: b.changeNote || 'Tạo Sổ Order' },
                });
                return res.json({ success: true, version: 1, lastUpdated: now });
            }
            // Đã tồn tại → conflict, trả server hiện tại.
            const cur = await pool.query(
                `SELECT data, version, updated_at FROM web2_so_order WHERE doc_id = $1`,
                [DOC_ID]
            );
            const row = cur.rows[0] || {};
            return res.status(409).json({
                success: false,
                conflict: true,
                server: {
                    data: row.data || {},
                    version: Number(row.version) || 0,
                    lastUpdated: Number(row.updated_at) || 0,
                },
            });
        }
        // Optimistic update — chỉ ghi nếu version chưa đổi.
        const upd = await pool.query(
            `UPDATE web2_so_order
             SET data = $2::jsonb, version = version + 1, updated_at = $3, updated_by = $4
             WHERE doc_id = $1 AND version = $5
             RETURNING version, updated_at`,
            [DOC_ID, JSON.stringify(data), now, updatedBy, baseVersion]
        );
        if (upd.rows.length) {
            const v = Number(upd.rows[0].version) || baseVersion + 1;
            _notify('update', v);
            recordAuditEvent(pool, {
                entity: 'so-order',
                entityId: 'main',
                action: 'update',
                userId: req.web2User?.id ?? null,
                userName: updatedBy,
                sourcePage: 'so-order',
                changes: { version: v, note: b.changeNote || 'Lưu Sổ Order' },
            });
            return res.json({ success: true, version: v, lastUpdated: now });
        }
        // version mismatch → ai đó vừa ghi → 409 trả server hiện tại để client xử lý.
        const cur = await pool.query(
            `SELECT data, version, updated_at FROM web2_so_order WHERE doc_id = $1`,
            [DOC_ID]
        );
        const row = cur.rows[0] || {};
        return res.status(409).json({
            success: false,
            conflict: true,
            server: {
                data: row.data || {},
                version: Number(row.version) || 0,
                lastUpdated: Number(row.updated_at) || 0,
            },
        });
    } catch (e) {
        console.error('[WEB2-SO-ORDER] /save error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /reset — xoá doc 'main' (beta wipe / cleanup test). Admin only.
router.post('/reset', requireWeb2Admin, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        await pool.query(`DELETE FROM web2_so_order WHERE doc_id = $1`, [DOC_ID]);
        _notify('reset', 0);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-SO-ORDER] /reset error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
