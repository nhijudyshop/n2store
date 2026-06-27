// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Quản lý chi tiêu / Sổ quỹ (admin).
// =====================================================================
// Sổ quỹ Web 2.0 — quản lý thu/chi, quỹ (tiền mặt/ngân hàng/ví), loại tuỳ
// chỉnh, nguồn, số dư đầu–cuối kỳ, lọc nhiều chiều, báo cáo, ảnh hoá đơn,
// lịch sử chỉnh sửa. Toàn bộ admin-only (group Quản trị viên).
//
// Loại phiếu: receipt (thu) | payment_cn (chi cá nhân) | payment_kd (chi kinh doanh).
// Quỹ: cash | bank | ewallet. Mã phiếu tự sinh: TTM/TNH/TVD (thu), CCN, CKD.
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (Web 2.0 — KHÔNG ghi Web 1.0).
// Ảnh: bytea trong web2_cashbook_images, serve GET /images/:id (theo policy:
//   KHÔNG Bunny/CDN ngoài AI KOL — lưu Postgres + serve qua route).
// Realtime: web2:cashbook (SSE). Tiền: BIGINT (VND nguyên, luôn dương; dấu theo type).
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();
const { requireWeb2Admin } = require('../middleware/web2-auth');
const {
    TYPES,
    FUNDS,
    ensureSchema,
    nextCode,
    saveImage,
    cleanAmount,
    buildVoucherFilter,
} = require('../lib/web2-cashbook-lib');

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// ── SSE notifier ─────────────────────────────────────────────────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, extra) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:cashbook', { action, ...(extra || {}), ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-CASHBOOK] _notify failed:', e.message);
    }
}

function ok(res, data) {
    return res.json({ success: true, ...data });
}
function fail(res, code, error) {
    return res.status(code).json({ success: false, error });
}

function auditRow(client, v, action, changes, req) {
    const u = req.web2User || {};
    return client
        .query(
            `INSERT INTO web2_cashbook_audit (voucher_id, voucher_code, action, changes, user_name, username, user_id, created_at)
             VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8)`,
            [
                v.id,
                v.code || null,
                action,
                JSON.stringify(changes || {}),
                u.display_name || null,
                u.username || null,
                u.id || null,
                now(),
            ]
        )
        .catch((e) => console.warn('[WEB2-CASHBOOK] audit warn:', e.message));
}

// =====================================================================
// IMAGES
// =====================================================================
router.post('/images', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const id = await saveImage(db, req.body?.dataUrl);
        if (!id) return fail(res, 400, 'Ảnh không hợp lệ');
        return ok(res, { id });
    } catch (e) {
        console.error('[WEB2-CASHBOOK] image upload:', e.message);
        return fail(res, 500, e.message);
    }
});

router.get('/images/:id', async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(`SELECT mime, data FROM web2_cashbook_images WHERE id = $1`, [
            Number(req.params.id),
        ]);
        if (!r.rows.length) return res.status(404).send('Not found');
        res.set('Content-Type', r.rows[0].mime || 'image/jpeg');
        res.set('Cache-Control', 'public, max-age=31536000, immutable');
        return res.send(r.rows[0].data);
    } catch (e) {
        return res.status(500).send('Error');
    }
});

// =====================================================================
// CATEGORIES + SOURCES
// =====================================================================
router.get('/categories', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const type = String(req.query.type || '');
        const params = [];
        let where = 'WHERE active = TRUE';
        if (TYPES.includes(type)) {
            where += ' AND type = $1';
            params.push(type);
        }
        const r = await db.query(
            `SELECT id, type, name, source_code, sort_order FROM web2_cashbook_categories ${where}
              ORDER BY type, sort_order, name`,
            params
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.post('/categories', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const type = String(req.body?.type || '');
        const name = String(req.body?.name || '')
            .trim()
            .slice(0, 160);
        if (!TYPES.includes(type) || !name) return fail(res, 400, 'type/name không hợp lệ');
        const r = await db.query(
            `INSERT INTO web2_cashbook_categories (type, name, source_code, created_at)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (type, name) DO UPDATE SET active = TRUE, source_code = EXCLUDED.source_code
             RETURNING id, type, name, source_code`,
            [
                type,
                name,
                req.body?.sourceCode ? String(req.body.sourceCode).slice(0, 40) : null,
                now(),
            ]
        );
        _notify('categories', {});
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.delete('/categories/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`UPDATE web2_cashbook_categories SET active = FALSE WHERE id = $1`, [
            Number(req.params.id),
        ]);
        _notify('categories', {});
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.get('/sources', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(
            `SELECT code, name, is_default FROM web2_cashbook_sources ORDER BY is_default DESC, name`
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.post('/sources', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const code = String(req.body?.code || '')
            .trim()
            .slice(0, 40);
        const name = String(req.body?.name || '')
            .trim()
            .slice(0, 160);
        if (!code || !name) return fail(res, 400, 'code/name không hợp lệ');
        await db.query(
            `INSERT INTO web2_cashbook_sources (code, name, is_default, created_at)
             VALUES ($1,$2,$3,$4)
             ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, is_default = EXCLUDED.is_default`,
            [code, name, req.body?.isDefault === true, now()]
        );
        _notify('sources', {});
        return ok(res, { code });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

router.delete('/sources/:code', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`DELETE FROM web2_cashbook_sources WHERE code = $1`, [
            String(req.params.code).slice(0, 40),
        ]);
        _notify('sources', {});
        return ok(res, {});
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// VOUCHERS
// =====================================================================

// GET /vouchers — list có phân trang + filter.
router.get('/vouchers', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const { whereSql, params, nextIdx } = buildVoucherFilter(req.query);
        const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 100));
        const page = Math.max(1, Number(req.query.page) || 1);
        const offset = (page - 1) * limit;
        const countR = await db.query(
            `SELECT COUNT(*)::int AS total FROM web2_cashbook_vouchers ${whereSql}`,
            params
        );
        const r = await db.query(
            `SELECT * FROM web2_cashbook_vouchers ${whereSql}
              ORDER BY voucher_time DESC, id DESC
              LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
            [...params, limit, offset]
        );
        return ok(res, {
            items: r.rows,
            meta: { total: countR.rows[0].total, page, limit },
        });
    } catch (e) {
        console.error('[WEB2-CASHBOOK] vouchers list:', e.message);
        return fail(res, 500, e.message);
    }
});

router.get('/vouchers/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(`SELECT * FROM web2_cashbook_vouchers WHERE id = $1`, [
            Number(req.params.id),
        ]);
        if (!r.rows.length) return fail(res, 404, 'Không tìm thấy phiếu');
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

// Các cột cho phép sửa (PATCH) + create.
const EDITABLE = [
    'category',
    'note',
    'source_code',
    'object_type',
    'person_name',
    'person_code',
    'phone',
    'address',
    'collector',
    'account_name',
    'account_number',
    'transfer_content',
    'branch',
];
// camelCase body → snake_case col.
const BODY_MAP = {
    sourceCode: 'source_code',
    objectType: 'object_type',
    personName: 'person_name',
    personCode: 'person_code',
    accountName: 'account_name',
    accountNumber: 'account_number',
    transferContent: 'transfer_content',
};
function bodyVal(b, col) {
    // tìm theo snake_case hoặc camelCase tương ứng.
    if (b[col] !== undefined) return b[col];
    const camel = Object.keys(BODY_MAP).find((k) => BODY_MAP[k] === col);
    return camel && b[camel] !== undefined ? b[camel] : undefined;
}

// POST /vouchers — tạo phiếu (mã tự sinh, audit, ảnh).
router.post('/vouchers', requireWeb2Admin, async (req, res) => {
    const db = getDb(req);
    const client = await db.connect();
    try {
        const b = req.body || {};
        const type = String(b.type || '');
        const fundType = FUNDS.includes(b.fundType) ? b.fundType : 'cash';
        if (!TYPES.includes(type)) return fail(res, 400, 'type không hợp lệ');
        const amount = cleanAmount(b.amount);
        if (amount <= 0) return fail(res, 400, 'Số tiền phải > 0');
        const vTime = b.voucherTime ? new Date(b.voucherTime) : new Date();
        if (isNaN(vTime.getTime())) return fail(res, 400, 'Thời gian phiếu không hợp lệ');

        await client.query('BEGIN');
        let imageId = b.imageId ? Number(b.imageId) : null;
        if (!imageId && b.imageDataUrl) imageId = await saveImage(client, b.imageDataUrl);
        const code = await nextCode(client, type, fundType);
        const u = req.web2User || {};
        const cols = [
            'code',
            'type',
            'fund_type',
            'amount',
            'image_id',
            'voucher_time',
            ...EDITABLE,
            'created_by',
            'created_by_username',
            'created_by_user_id',
            'created_at',
            'updated_at',
        ];
        const vals = [
            code,
            type,
            fundType,
            amount,
            imageId,
            vTime.toISOString(),
            ...EDITABLE.map((c) => {
                const v = bodyVal(b, c);
                return v === undefined || v === '' ? null : v;
            }),
            u.display_name || null,
            u.username || null,
            u.id || null,
            now(),
            now(),
        ];
        const ph = vals.map((_, idx) => `$${idx + 1}`).join(',');
        const r = await client.query(
            `INSERT INTO web2_cashbook_vouchers (${cols.join(',')}) VALUES (${ph}) RETURNING *`,
            vals
        );
        const v = r.rows[0];
        await auditRow(client, v, 'create', { amount, type, fundType, category: v.category }, req);
        await client.query('COMMIT');
        _notify('voucher', { id: v.id, action: 'create' });
        return ok(res, { item: v });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-CASHBOOK] voucher create:', e.message);
        return fail(res, 500, e.message);
    } finally {
        client.release();
    }
});

// PATCH /vouchers/:id — sửa phiếu (audit thay đổi).
router.patch('/vouchers/:id', requireWeb2Admin, async (req, res) => {
    const db = getDb(req);
    const client = await db.connect();
    try {
        const id = Number(req.params.id);
        const b = req.body || {};
        await client.query('BEGIN');
        const cur = await client.query(
            `SELECT * FROM web2_cashbook_vouchers WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (!cur.rows.length) {
            await client.query('ROLLBACK');
            return fail(res, 404, 'Không tìm thấy phiếu');
        }
        const prev = cur.rows[0];
        if (prev.status === 'cancelled') {
            await client.query('ROLLBACK');
            return fail(res, 409, 'Phiếu đã huỷ — không sửa được');
        }
        const sets = [];
        const vals = [];
        const changes = {};
        let i = 1;
        // amount + fund + voucher_time + editable fields.
        if (b.amount !== undefined) {
            const amt = cleanAmount(b.amount);
            if (amt <= 0) {
                await client.query('ROLLBACK');
                return fail(res, 400, 'Số tiền phải > 0');
            }
            sets.push(`amount = $${i++}`);
            vals.push(amt);
            if (amt !== Number(prev.amount)) changes.amount = [Number(prev.amount), amt];
        }
        if (b.fundType !== undefined && FUNDS.includes(b.fundType)) {
            sets.push(`fund_type = $${i++}`);
            vals.push(b.fundType);
            if (b.fundType !== prev.fund_type) changes.fund_type = [prev.fund_type, b.fundType];
        }
        if (b.voucherTime !== undefined) {
            const vt = new Date(b.voucherTime);
            if (!isNaN(vt.getTime())) {
                sets.push(`voucher_time = $${i++}`);
                vals.push(vt.toISOString());
            }
        }
        for (const c of EDITABLE) {
            const v = bodyVal(b, c);
            if (v !== undefined) {
                const nv = v === '' ? null : v;
                sets.push(`${c} = $${i++}`);
                vals.push(nv);
                if (String(prev[c] ?? '') !== String(nv ?? '')) changes[c] = [prev[c], nv];
            }
        }
        if (b.imageDataUrl) {
            const imgId = await saveImage(client, b.imageDataUrl);
            if (imgId) {
                sets.push(`image_id = $${i++}`);
                vals.push(imgId);
            }
        } else if (b.imageId !== undefined) {
            sets.push(`image_id = $${i++}`);
            vals.push(b.imageId ? Number(b.imageId) : null);
        }
        if (!sets.length) {
            await client.query('ROLLBACK');
            return fail(res, 400, 'Không có trường cập nhật');
        }
        sets.push(`updated_at = $${i++}`);
        vals.push(now());
        vals.push(id);
        const r = await client.query(
            `UPDATE web2_cashbook_vouchers SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
            vals
        );
        await auditRow(client, r.rows[0], 'update', changes, req);
        await client.query('COMMIT');
        _notify('voucher', { id, action: 'update' });
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-CASHBOOK] voucher patch:', e.message);
        return fail(res, 500, e.message);
    } finally {
        client.release();
    }
});

// POST /vouchers/:id/cancel — huỷ mềm (giữ audit).
router.post('/vouchers/:id/cancel', requireWeb2Admin, async (req, res) => {
    const db = getDb(req);
    const client = await db.connect();
    try {
        const id = Number(req.params.id);
        await client.query('BEGIN');
        const cur = await client.query(
            `SELECT * FROM web2_cashbook_vouchers WHERE id = $1 FOR UPDATE`,
            [id]
        );
        if (!cur.rows.length) {
            await client.query('ROLLBACK');
            return fail(res, 404, 'Không tìm thấy phiếu');
        }
        if (cur.rows[0].status === 'cancelled') {
            await client.query('ROLLBACK');
            return ok(res, { item: cur.rows[0] });
        }
        const r = await client.query(
            `UPDATE web2_cashbook_vouchers SET status='cancelled', cancelled_at=$1, cancel_reason=$2, updated_at=$1
              WHERE id=$3 RETURNING *`,
            [now(), req.body?.reason ? String(req.body.reason).slice(0, 300) : null, id]
        );
        await auditRow(client, r.rows[0], 'cancel', { reason: req.body?.reason || null }, req);
        await client.query('COMMIT');
        _notify('voucher', { id, action: 'cancel' });
        return ok(res, { item: r.rows[0] });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-CASHBOOK] voucher cancel:', e.message);
        return fail(res, 500, e.message);
    } finally {
        client.release();
    }
});

// DELETE /vouchers/:id — xoá hẳn (admin; phiếu nhập nhầm). Giữ audit dòng delete.
router.delete('/vouchers/:id', requireWeb2Admin, async (req, res) => {
    const db = getDb(req);
    const client = await db.connect();
    try {
        const id = Number(req.params.id);
        await client.query('BEGIN');
        const cur = await client.query(`SELECT * FROM web2_cashbook_vouchers WHERE id = $1`, [id]);
        if (!cur.rows.length) {
            await client.query('ROLLBACK');
            return fail(res, 404, 'Không tìm thấy phiếu');
        }
        await auditRow(client, cur.rows[0], 'delete', { code: cur.rows[0].code }, req);
        await client.query(`DELETE FROM web2_cashbook_vouchers WHERE id = $1`, [id]);
        await client.query('COMMIT');
        _notify('voucher', { id, action: 'delete' });
        return ok(res, {});
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[WEB2-CASHBOOK] voucher delete:', e.message);
        return fail(res, 500, e.message);
    } finally {
        client.release();
    }
});

// GET /vouchers/:id/audit — lịch sử 1 phiếu.
router.get('/vouchers/:id/audit', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const r = await db.query(
            `SELECT id, action, changes, user_name, username, created_at
                 FROM web2_cashbook_audit WHERE voucher_id = $1 ORDER BY id DESC`,
            [Number(req.params.id)]
        );
        return ok(res, { items: r.rows });
    } catch (e) {
        return fail(res, 500, e.message);
    }
});

// =====================================================================
// SUMMARY + REPORT
// =====================================================================

// GET /summary?start&end&fund → số dư đầu kỳ + tổng thu/chi + số dư cuối kỳ.
router.get('/summary', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const fund = FUNDS.includes(req.query.fund) ? req.query.fund : null;
        const start = req.query.start ? String(req.query.start).slice(0, 10) : null;
        const end = req.query.end ? String(req.query.end).slice(0, 10) : null;
        const fundClause = fund ? ` AND fund_type = '${fund}'` : '';

        // Số dư đầu kỳ = Σ(thu − chi) các phiếu paid TRƯỚC start.
        let opening = 0;
        if (start) {
            const startTs = new Date(`${start}T00:00:00+07:00`).toISOString();
            const oR = await db.query(
                `SELECT
                    COALESCE(SUM(CASE WHEN type='receipt' THEN amount ELSE -amount END),0)::bigint AS bal
                   FROM web2_cashbook_vouchers
                  WHERE status='paid' AND voucher_time < $1 ${fundClause}`,
                [startTs]
            );
            opening = Number(oR.rows[0].bal) || 0;
        }
        // Tổng trong kỳ.
        const params = [];
        const where = [`status='paid'`];
        let i = 1;
        if (start) {
            where.push(`voucher_time >= $${i++}`);
            params.push(new Date(`${start}T00:00:00+07:00`).toISOString());
        }
        if (end) {
            // FIX audit R3 (#5): biên cuối EXCLUSIVE (< 00:00 ngày kế) thay vì <= 23:59:59
            // → không bỏ sót phiếu có sub-second trong giây cuối (vd 23:59:59.7). +1 ngày
            // an toàn (VN không DST). Nhất quán với biên đầu kỳ (>= 00:00 ngày start).
            where.push(`voucher_time < $${i++}`);
            params.push(
                new Date(new Date(`${end}T00:00:00+07:00`).getTime() + 86400000).toISOString()
            );
        }
        if (fund) {
            where.push(`fund_type = $${i++}`);
            params.push(fund);
        }
        const tR = await db.query(
            `SELECT
                COALESCE(SUM(CASE WHEN type='receipt' THEN amount ELSE 0 END),0)::bigint AS receipts,
                COALESCE(SUM(CASE WHEN type='payment_cn' THEN amount ELSE 0 END),0)::bigint AS pay_cn,
                COALESCE(SUM(CASE WHEN type='payment_kd' THEN amount ELSE 0 END),0)::bigint AS pay_kd,
                COUNT(*)::int AS cnt
               FROM web2_cashbook_vouchers WHERE ${where.join(' AND ')}`,
            params
        );
        const row = tR.rows[0];
        const receipts = Number(row.receipts) || 0;
        const payCn = Number(row.pay_cn) || 0;
        const payKd = Number(row.pay_kd) || 0;
        return ok(res, {
            summary: {
                opening,
                receipts,
                paymentsCN: payCn,
                paymentsKD: payKd,
                payments: payCn + payKd,
                closing: opening + receipts - payCn - payKd,
                count: row.cnt,
            },
        });
    } catch (e) {
        console.error('[WEB2-CASHBOOK] summary:', e.message);
        return fail(res, 500, e.message);
    }
});

// GET /report?start&end&fund → breakdown loại + theo tháng + nguồn + quỹ.
router.get('/report', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const fund = FUNDS.includes(req.query.fund) ? req.query.fund : null;
        const start = req.query.start ? String(req.query.start).slice(0, 10) : null;
        const end = req.query.end ? String(req.query.end).slice(0, 10) : null;
        const params = [];
        const where = [`status='paid'`];
        let i = 1;
        if (start) {
            where.push(`voucher_time >= $${i++}`);
            params.push(new Date(`${start}T00:00:00+07:00`).toISOString());
        }
        if (end) {
            // FIX audit R3 (#5): biên cuối EXCLUSIVE (< 00:00 ngày kế) thay vì <= 23:59:59
            // → không bỏ sót phiếu có sub-second trong giây cuối (vd 23:59:59.7). +1 ngày
            // an toàn (VN không DST). Nhất quán với biên đầu kỳ (>= 00:00 ngày start).
            where.push(`voucher_time < $${i++}`);
            params.push(
                new Date(new Date(`${end}T00:00:00+07:00`).getTime() + 86400000).toISOString()
            );
        }
        if (fund) {
            where.push(`fund_type = $${i++}`);
            params.push(fund);
        }
        const w = where.join(' AND ');
        const tzMonth = `to_char(voucher_time AT TIME ZONE 'Asia/Ho_Chi_Minh','YYYY-MM')`;
        const [byCat, byMonth, bySource, byFund] = await Promise.all([
            db.query(
                `SELECT type, category, COALESCE(SUM(amount),0)::bigint AS total, COUNT(*)::int AS cnt
                   FROM web2_cashbook_vouchers WHERE ${w}
                  GROUP BY type, category ORDER BY total DESC`,
                params
            ),
            db.query(
                `SELECT ${tzMonth} AS month,
                    COALESCE(SUM(CASE WHEN type='receipt' THEN amount ELSE 0 END),0)::bigint AS receipts,
                    COALESCE(SUM(CASE WHEN type='payment_cn' THEN amount ELSE 0 END),0)::bigint AS pay_cn,
                    COALESCE(SUM(CASE WHEN type='payment_kd' THEN amount ELSE 0 END),0)::bigint AS pay_kd
                   FROM web2_cashbook_vouchers WHERE ${w}
                  GROUP BY 1 ORDER BY 1`,
                params
            ),
            db.query(
                `SELECT COALESCE(source_code,'(không nguồn)') AS source,
                    COALESCE(SUM(CASE WHEN type='receipt' THEN amount ELSE 0 END),0)::bigint AS receipts,
                    COALESCE(SUM(CASE WHEN type<>'receipt' THEN amount ELSE 0 END),0)::bigint AS payments
                   FROM web2_cashbook_vouchers WHERE ${w}
                  GROUP BY 1 ORDER BY receipts DESC`,
                params
            ),
            db.query(
                `SELECT fund_type,
                    COALESCE(SUM(CASE WHEN type='receipt' THEN amount ELSE -amount END),0)::bigint AS net
                   FROM web2_cashbook_vouchers WHERE ${w}
                  GROUP BY fund_type`,
                params
            ),
        ]);
        return ok(res, {
            report: {
                byCategory: byCat.rows,
                byMonth: byMonth.rows,
                bySource: bySource.rows,
                byFund: byFund.rows,
            },
        });
    } catch (e) {
        console.error('[WEB2-CASHBOOK] report:', e.message);
        return fail(res, 500, e.message);
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.ensureSchema = ensureSchema;
