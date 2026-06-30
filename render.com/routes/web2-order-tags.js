// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
//
// Web 2.0 — TAG đơn hàng (config). CRUD bảng web2_order_tags + danh sách trigger.
// Mỗi tag gắn 1 trigger (AUTO). Logic eval + registry nằm ở services/web2-order-tags-service.
// Consumer: trang web2/order-tags (config) + native-orders /load (đọc def để tính autoTags).
// Route prefix /api/web2-order-tags → worker auto-forward (startsWith '/api/web2-').

const express = require('express');
const router = express.Router();
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const svc = require('../services/web2-order-tags-service');
const { recordAuditEvent } = require('../services/web2-audit-sink');

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// Best-effort audit event-sink (web2_audit_events) — KHÔNG await, KHÔNG throw.
function _auditTag(req, action, code, note) {
    recordAuditEvent(getPool(req), {
        entity: 'order-tag',
        entityId: code,
        action,
        userId: req.body?.userId ?? req.web2User?.id ?? null,
        userName:
            req.body?.userName || req.web2User?.display_name || req.web2User?.username || null,
        sourcePage: 'order-tags',
        changes: note ? (typeof note === 'string' ? { note } : note) : {},
    });
}

// SSE notifier — broadcast topic 'web2:order-tags' sau mỗi mutation.
let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, code) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:order-tags', { action, code: code || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-ORDER-TAGS] _notify failed:', e.message);
    }
}

function mapRow(r) {
    return {
        code: r.code,
        name: r.name,
        trigger: r.trigger,
        color: r.color || '#6b7280',
        icon: r.icon || null,
        priority: Number(r.priority) || 0,
        isActive: r.is_active !== false,
        printEnabled: r.print_enabled !== false, // toggle bật/tắt IN GIẤY (riêng soan_hang)
        createdBy: r.created_by || null,
        createdAt: r.created_at != null ? Number(r.created_at) : null,
        updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
    };
}

// GET /api/web2-order-tags/triggers — registry metadata cho trang config (1 nguồn).
router.get('/triggers', (req, res) => {
    res.json({ success: true, triggers: svc.TRIGGERS });
});

// GET /api/web2-order-tags/list?search=&activeOnly=true
router.get('/list', async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await svc.ensureTable(pool);
        const conds = [];
        const params = [];
        if (String(req.query.activeOnly) === 'true') conds.push('is_active = true');
        const search = String(req.query.search || '').trim();
        if (search) {
            params.push(`%${search}%`);
            conds.push(`(code ILIKE $${params.length} OR name ILIKE $${params.length})`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const r = await pool.query(
            `SELECT * FROM web2_order_tags ${where} ORDER BY priority ASC, name ASC`,
            params
        );
        res.json({ success: true, records: r.rows.map(mapRow), total: r.rows.length });
    } catch (e) {
        console.error('[WEB2-ORDER-TAGS] list error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// POST /api/web2-order-tags/create  { code, name, trigger, color?, icon?, priority? }
router.post('/create', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await svc.ensureTable(pool);
        const b = req.body || {};
        const code = String(b.code || '').trim();
        const name = String(b.name || '').trim();
        const trigger = String(b.trigger || '').trim();
        if (!code || !name || !trigger) {
            return res.status(400).json({ error: 'code + name + trigger required' });
        }
        if (!svc.TRIGGER_IDS.has(trigger)) {
            return res.status(400).json({ error: `trigger không hợp lệ: ${trigger}` });
        }
        // Mỗi trigger chỉ 1 thẻ (2 thẻ cùng trigger = pill trùng, vô nghĩa).
        const dupT = await pool.query(
            `SELECT code FROM web2_order_tags WHERE trigger = $1 LIMIT 1`,
            [trigger]
        );
        if (dupT.rows.length) {
            return res.status(409).json({
                error: `Trigger "${trigger}" đã được dùng bởi thẻ "${dupT.rows[0].code}". Mỗi trigger chỉ gắn 1 thẻ.`,
            });
        }
        const now = Date.now();
        const color = String(b.color || '#6b7280').trim();
        const icon = b.icon ? String(b.icon).trim() : null;
        const priority = Number.isFinite(Number(b.priority)) ? parseInt(b.priority, 10) : 0;
        try {
            const r = await pool.query(
                `INSERT INTO web2_order_tags (code, name, trigger, color, icon, priority, created_by, created_at, updated_at)
                 VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,
                [
                    code,
                    name,
                    trigger,
                    color,
                    icon,
                    priority,
                    b.createdBy || req.web2User?.username || null,
                    now,
                ]
            );
            _notify('create', code);
            _auditTag(req, 'create', code, { name, trigger });
            res.json({ success: true, record: mapRow(r.rows[0]) });
        } catch (e) {
            if (e.code === '23505') {
                return res.status(409).json({ error: `Mã "${code}" đã tồn tại` });
            }
            throw e;
        }
    } catch (e) {
        console.error('[WEB2-ORDER-TAGS] create error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// PATCH /api/web2-order-tags/update/:code  { name?, trigger?, color?, icon?, priority?, isActive? }
router.patch('/update/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await svc.ensureTable(pool);
        const code = req.params.code;
        const b = req.body || {};
        const sets = [];
        const params = [];
        const add = (col, val) => {
            params.push(val);
            sets.push(`${col} = $${params.length}`);
        };
        if (b.name != null) add('name', String(b.name).trim());
        if (b.trigger != null) {
            const trigger = String(b.trigger).trim();
            if (!svc.TRIGGER_IDS.has(trigger)) {
                return res.status(400).json({ error: `trigger không hợp lệ: ${trigger}` });
            }
            // Đổi trigger sang cái đã có thẻ khác dùng → chặn (giữ 1 trigger/1 thẻ).
            const dupT = await pool.query(
                `SELECT code FROM web2_order_tags WHERE trigger = $1 AND code <> $2 LIMIT 1`,
                [trigger, code]
            );
            if (dupT.rows.length) {
                return res.status(409).json({
                    error: `Trigger "${trigger}" đã được dùng bởi thẻ "${dupT.rows[0].code}". Mỗi trigger chỉ gắn 1 thẻ.`,
                });
            }
            add('trigger', trigger);
        }
        if (b.color != null) add('color', String(b.color).trim());
        if (b.icon !== undefined) add('icon', b.icon ? String(b.icon).trim() : null);
        if (b.priority != null && Number.isFinite(Number(b.priority)))
            add('priority', parseInt(b.priority, 10));
        if (b.isActive != null) add('is_active', b.isActive === true || b.isActive === 'true');
        if (b.printEnabled != null)
            add('print_enabled', b.printEnabled === true || b.printEnabled === 'true');
        if (!sets.length) return res.status(400).json({ error: 'Không có field nào để cập nhật' });
        params.push(Date.now());
        sets.push(`updated_at = $${params.length}`);
        params.push(code);
        const r = await pool.query(
            `UPDATE web2_order_tags SET ${sets.join(', ')} WHERE code = $${params.length} RETURNING *`,
            params
        );
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('update', code);
        _auditTag(req, 'update', code, { fields: sets });
        res.json({ success: true, record: mapRow(r.rows[0]) });
    } catch (e) {
        console.error('[WEB2-ORDER-TAGS] update error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// DELETE /api/web2-order-tags/delete/:code — hard delete (autoTags tự tính lại, không drift).
router.delete('/delete/:code', requireWeb2AuthSoft, async (req, res) => {
    const pool = getPool(req);
    if (!pool) return res.status(500).json({ error: 'DB unavailable' });
    try {
        await svc.ensureTable(pool);
        const code = req.params.code;
        const r = await pool.query(`DELETE FROM web2_order_tags WHERE code = $1 RETURNING code`, [
            code,
        ]);
        if (!r.rows.length) return res.status(404).json({ error: 'Not found' });
        _notify('delete', code);
        _auditTag(req, 'delete', code);
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-ORDER-TAGS] delete error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
