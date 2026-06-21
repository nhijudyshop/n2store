// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 — Message Templates (mẫu tin nhắn bulk-send) server storage
// Hướng D (2026-06-14): migrate Firestore `web2_message_templates` → Postgres web2Db.
//
// Lý do: dọn nốt Firestore Web 2.0 (theo Task 1 "gỡ cái không cần firebase").
// Send-job đã ở Render (/api/web2/msg-send); chỉ CRUD template còn trên Firestore.
//
// Model: 1 row / template. Giữ field name client đang dùng (Name/Content qua map).
// Cột Postgres lowercase; route trả {id, name, content, order, active} → client map
// sang {id, Name, Content, order, active} để KHÔNG phải sửa rộng modal.
//
// Endpoints (mount /api/web2-msg-templates):
//   GET  /            → { success, items:[{id,name,content,order,active}] } (seed 4 default nếu rỗng)
//   POST /  {id?,name,content,order?,active?} → create (gen id) hoặc update (nếu id) → { success, item }
//   DELETE /:id       → { success }
// SSE topic 'web2:msg-templates'.
// =====================================================

const express = require('express');
const crypto = require('crypto');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');

// -----------------------------------------------------
// SSE notifier injected từ server.js. Topic 'web2:msg-templates'.
// -----------------------------------------------------
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:msg-templates', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-MSG-TPL] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

const DEFAULTS = [
    {
        Name: 'Chốt đơn',
        Content:
            'Dạ chào chị {partner.name},\n\nEm gửi đến mình các sản phẩm mà mình đã đặt bên em gồm:\n\n{order.details}\n\nĐơn hàng của mình sẽ được gửi về địa chỉ "{partner.address}"\n\nChị xác nhận giúp em để em gửi hàng nha ạ! 🙏',
    },
    {
        Name: 'Xác nhận địa chỉ',
        Content:
            'Dạ chị {partner.name} ơi,\n\nEm xác nhận lại địa chỉ nhận hàng của chị là:\n📍 {partner.address}\n\nChị kiểm tra giúp em địa chỉ đã chính xác chưa ạ?',
    },
    {
        Name: 'Thông báo giao hàng',
        Content:
            'Dạ chị {partner.name} ơi,\n\nĐơn hàng #{order.code} của chị đã được giao cho đơn vị vận chuyển rồi ạ.\n\nChị chú ý điện thoại để nhận hàng nha! 📦',
    },
    {
        Name: 'Cảm ơn khách hàng',
        Content:
            'Dạ cảm ơn chị {partner.name} đã ủng hộ shop ạ! 🙏❤️\n\nChị dùng hàng có gì thắc mắc cứ inbox shop em hỗ trợ nha.\n\nChúc chị một ngày vui vẻ! 😊',
    },
];

const _ensuredPools = new WeakSet();
async function ensureTables(pool) {
    if (_ensuredPools.has(pool)) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_msg_templates (
            id          TEXT PRIMARY KEY,
            name        TEXT NOT NULL DEFAULT '',
            content     TEXT NOT NULL DEFAULT '',
            "order"     INTEGER NOT NULL DEFAULT 0,
            active      BOOLEAN NOT NULL DEFAULT TRUE,
            created_at  BIGINT NOT NULL,
            updated_at  BIGINT NOT NULL
        );
    `);
    _ensuredPools.add(pool);
}

function _newId() {
    return 'tpl_' + crypto.randomBytes(8).toString('hex');
}

function _rowOut(r) {
    return {
        id: r.id,
        name: r.name || '',
        content: r.content || '',
        order: Number(r.order) || 0,
        active: r.active !== false,
    };
}

// Seed 4 default nếu bảng rỗng (1 lần). Idempotent: chỉ chạy khi count=0.
async function _seedIfEmpty(pool) {
    const c = await pool.query(`SELECT COUNT(*)::int AS n FROM web2_msg_templates`);
    if ((c.rows[0]?.n || 0) > 0) return;
    const now = Date.now();
    for (let i = 0; i < DEFAULTS.length; i++) {
        const d = DEFAULTS[i];
        await pool.query(
            `INSERT INTO web2_msg_templates (id, name, content, "order", active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, TRUE, $5, $5) ON CONFLICT (id) DO NOTHING`,
            [_newId(), d.Name, d.Content, i + 1, now]
        );
    }
}

// GET / — list (seed nếu rỗng).
router.get('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        await _seedIfEmpty(pool);
        const r = await pool.query(
            `SELECT id, name, content, "order", active FROM web2_msg_templates ORDER BY "order" ASC, created_at ASC`
        );
        res.json({ success: true, items: r.rows.map(_rowOut) });
    } catch (e) {
        console.error('[WEB2-MSG-TPL] GET error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST / — create (no id) hoặc update (id). Body {id?, name|Name, content|Content, order?, active?}.
router.post('/', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const b = req.body || {};
    const name = String(b.name || b.Name || '').slice(0, 300);
    const content = String(b.content || b.Content || '');
    if (!name || !content) {
        return res.status(400).json({ success: false, error: 'name + content required' });
    }
    const active = b.active !== false;
    const now = Date.now();
    try {
        await ensureTables(pool);
        if (b.id) {
            const upd = await pool.query(
                `UPDATE web2_msg_templates SET name=$2, content=$3, active=$4,
                    "order"=COALESCE($5, "order"), updated_at=$6
                 WHERE id=$1 RETURNING id, name, content, "order", active`,
                [b.id, name, content, active, b.order != null ? Number(b.order) : null, now]
            );
            if (!upd.rows.length) {
                return res.status(404).json({ success: false, error: 'template not found' });
            }
            _notify('update', b.id);
            return res.json({ success: true, item: _rowOut(upd.rows[0]) });
        }
        // create — order = max+1 nếu không truyền
        let order = b.order != null ? Number(b.order) : null;
        if (order == null) {
            const mx = await pool.query(
                `SELECT COALESCE(MAX("order"), 0)::int AS m FROM web2_msg_templates`
            );
            order = (mx.rows[0]?.m || 0) + 1;
        }
        const id = _newId();
        const ins = await pool.query(
            `INSERT INTO web2_msg_templates (id, name, content, "order", active, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6) RETURNING id, name, content, "order", active`,
            [id, name, content, order, active, now]
        );
        _notify('create', id);
        res.json({ success: true, item: _rowOut(ins.rows[0]) });
    } catch (e) {
        console.error('[WEB2-MSG-TPL] POST error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /:id
router.delete('/:id', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const id = req.params.id;
    if (!id) return res.status(400).json({ success: false, error: 'id required' });
    try {
        await ensureTables(pool);
        // audit r9: RETURNING + rowCount → 404 nếu id không tồn tại (idempotent đúng
        // semantics), tránh false 200 + SSE 'delete' giả khiến mọi tab reload thừa.
        const del = await pool.query(`DELETE FROM web2_msg_templates WHERE id=$1 RETURNING id`, [
            id,
        ]);
        if (!del.rows.length) {
            return res.status(404).json({ success: false, error: 'template not found' });
        }
        _notify('delete', id);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-MSG-TPL] DELETE error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
