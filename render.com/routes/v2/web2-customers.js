// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — route kho KH warehouse (web2_customers, web2Db). KHÔNG TPOS.
// =====================================================================
// /api/web2/customers — KHO KHÁCH HÀNG RIÊNG Web 2.0 (warehouse).
// ĐỘC LẬP TPOS: không lookup/push/sync TPOS. Nguồn: Pancake/FB/nhập tay.
//
//   GET    /list                       — list + search/filter/paginate (CRUD)
//   GET    /search?search=&limit=       — autocomplete (id,phone,name,address,fbId)
//   GET    /:phone                      — 1 KH theo SĐT
//   GET    /by-phone/:phone/orders      — lịch sử đơn (native + PBH)
//   GET    /:phone/fb-conversation      — resolve SĐT → ngữ cảnh chat FB
//   POST   /create                      — tạo KH (CRUD)
//   POST   /upsert                      — upsert theo SĐT (chat → "Thêm KH")
//   POST   /enrich-fb                   — link fb_id vào kho (Web2Chat tự gọi)
//   POST   /merge                       — gộp 2 KH trùng
//   PATCH  /:id                         — sửa KH (mọi trang Web 2.0)
//   DELETE /:id                         — xoá/soft-archive KH
//
// SSE: _notify('web2:customers', …) sau mỗi mutation (realtime đa tab/máy).
// =====================================================================

const express = require('express');
const router = express.Router();
const {
    getOrCreateWeb2Customer,
    findWeb2CustomerByFbId,
    linkWeb2CustomerFbId,
    normPhoneWeb2,
    _historyEntry,
} = require('../../db/web2-customers-schema');

// ─── SSE notifier (wired ở server.js: initializeNotifiers) ──────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:customers', { action, id: id || null, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[web2-customers] _notify failed:', e.message);
    }
}

function getPool(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

// Hàng search gọn (autocomplete) — giữ shape cũ cho frontend hiện tại.
function rowToLite(r) {
    return {
        id: r.id,
        phone: r.phone || '',
        name: r.name || '',
        address: r.address || '',
        email: r.email || '',
        fbId: r.fb_id || '',
    };
}

// Bản đầy đủ (list + detail).
function rowToFull(r) {
    return {
        id: Number(r.id),
        code: r.code || null,
        name: r.name || '',
        phone: r.phone || '',
        email: r.email || '',
        address: r.address || '',
        ward: r.ward || null,
        district: r.district || null,
        city: r.city || null,
        carrier: r.carrier || null,
        status: r.status || 'Normal',
        tier: r.tier || null,
        tags: Array.isArray(r.tags) ? r.tags : [],
        aliases: Array.isArray(r.aliases) ? r.aliases : [],
        note: r.note || null,
        fbId: r.fb_id || null,
        fbPsids: r.fb_psids || {},
        globalId: r.global_id || null,
        fbPageId: r.fb_page_id || null,
        fbName: r.fb_name || null,
        pancakeCustomerId: r.pancake_customer_id || null,
        pancakeConversationId: r.pancake_conversation_id || null,
        pancakePageId: r.pancake_page_id || null,
        totalOrders: Number(r.total_orders || 0),
        totalSpent: Number(r.total_spent || 0),
        bomCount: Number(r.bom_count || 0),
        lastOrderAt: r.last_order_at != null ? Number(r.last_order_at) : null,
        source: r.source || null,
        createdBy: r.created_by || null,
        history: Array.isArray(r.history) ? r.history : [],
        isActive: !!r.is_active,
        createdAt: r.created_at != null ? Number(r.created_at) : null,
        updatedAt: r.updated_at != null ? Number(r.updated_at) : null,
    };
}

// ─── GET /list — list + search/filter/paginate (CRUD UI) ────────────────
router.get('/list', async (req, res) => {
    const db = getPool(req);
    if (!db) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        const { search, status, tier, source, tag, activeOnly } = req.query;
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(500, Math.max(1, parseInt(req.query.limit, 10) || 50));
        const offset = (page - 1) * limit;
        const conds = [];
        const params = [];
        if (activeOnly === 'true' || activeOnly === '1') conds.push('is_active = true');
        if (search) {
            params.push(`%${search}%`);
            const i = params.length;
            conds.push(
                `(phone ILIKE $${i} OR name ILIKE $${i} OR fb_id ILIKE $${i} OR global_id ILIKE $${i})`
            );
        }
        if (status) {
            params.push(status);
            conds.push(`status = $${params.length}`);
        }
        if (tier) {
            params.push(tier);
            conds.push(`tier = $${params.length}`);
        }
        if (source) {
            params.push(source);
            conds.push(`source = $${params.length}`);
        }
        if (tag) {
            params.push(JSON.stringify([tag]));
            conds.push(`tags @> $${params.length}::jsonb`);
        }
        const where = conds.length ? 'WHERE ' + conds.join(' AND ') : '';
        const countR = await db.query(
            `SELECT COUNT(*)::int n FROM web2_customers ${where}`,
            params
        );
        const total = countR.rows[0].n;
        const lp = [...params, limit, offset];
        const r = await db.query(
            `SELECT * FROM web2_customers ${where}
             ORDER BY updated_at DESC NULLS LAST
             LIMIT $${lp.length - 1} OFFSET $${lp.length}`,
            lp
        );
        res.json({
            success: true,
            data: r.rows.map(rowToFull),
            total,
            page,
            limit,
            hasMore: offset + r.rows.length < total,
        });
    } catch (e) {
        console.error('[web2-customers] list error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: [] });
    }
});

// ─── GET /search?search=...&limit=8 — autocomplete (warehouse only) ─────
router.get('/search', async (req, res) => {
    const db = getPool(req);
    const q = String(req.query.search || '').trim();
    const limit = Math.min(parseInt(req.query.limit, 10) || 8, 50);
    if (q.length < 2) return res.json({ success: true, data: [] });
    try {
        const like = `%${q}%`;
        let r;
        try {
            // accent-insensitive name + phone/fb match
            r = await db.query(
                `SELECT id, phone, name, email, address, fb_id
                 FROM web2_customers
                 WHERE unaccent(name) ILIKE unaccent($1) OR phone ILIKE $1 OR fb_id ILIKE $1
                 ORDER BY updated_at DESC NULLS LAST
                 LIMIT $2`,
                [like, limit]
            );
        } catch (unaccentErr) {
            console.warn('[web2-customers] unaccent fallback:', unaccentErr.message);
            r = await db.query(
                `SELECT id, phone, name, email, address, fb_id
                 FROM web2_customers
                 WHERE name ILIKE $1 OR phone ILIKE $1 OR fb_id ILIKE $1
                 ORDER BY updated_at DESC NULLS LAST
                 LIMIT $2`,
                [like, limit]
            );
        }
        res.json({ success: true, data: r.rows.map(rowToLite) });
    } catch (e) {
        console.error('[web2-customers] search error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: [] });
    }
});

// ─── GET /by-phone/:phone/orders — lịch sử đơn (native + PBH) ───────────
router.get('/by-phone/:phone/orders', async (req, res) => {
    const db = getPool(req);
    let phone = String(req.params.phone || '').replace(/\D/g, '');
    if (phone && !phone.startsWith('0')) phone = '0' + phone.slice(-9);
    const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const [nwRes, pbhRes] = await Promise.all([
            db.query(
                `SELECT code, display_stt, status, customer_name, phone, total_amount,
                        total_quantity, live_campaign_id, live_campaign_name, created_at, updated_at
                 FROM native_orders
                 WHERE phone = $1
                 ORDER BY created_at DESC LIMIT $2`,
                [phone, limit]
            ),
            db.query(
                `SELECT number, display_stt, state, partner_name, partner_phone, amount_total,
                        total_quantity, live_campaign_id, live_campaign_name,
                        date_invoice, date_created, date_updated
                 FROM fast_sale_orders
                 WHERE partner_phone = $1
                 ORDER BY date_created DESC LIMIT $2`,
                [phone, limit]
            ),
        ]);
        const native = nwRes.rows.map((r) => ({
            code: r.code,
            displayStt: r.display_stt,
            status: r.status,
            customerName: r.customer_name,
            phone: r.phone,
            totalAmount: Number(r.total_amount || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            createdAt: r.created_at,
            updatedAt: r.updated_at,
        }));
        const pbh = pbhRes.rows.map((r) => ({
            number: r.number,
            displayStt: r.display_stt,
            state: r.state,
            partnerName: r.partner_name,
            partnerPhone: r.partner_phone,
            amountTotal: Number(r.amount_total || 0),
            totalQuantity: r.total_quantity,
            liveCampaign: { id: r.live_campaign_id, name: r.live_campaign_name },
            dateInvoice: r.date_invoice,
            dateCreated: r.date_created,
            dateUpdated: r.date_updated,
        }));
        res.json({
            success: true,
            data: { native, pbh, summary: { nativeCount: native.length, pbhCount: pbh.length } },
        });
    } catch (e) {
        console.error('[web2-customers] by-phone orders error:', e.message);
        res.status(500).json({ success: false, error: e.message, data: { native: [], pbh: [] } });
    }
});

// ─── GET /:phone/fb-conversation — SĐT → ngữ cảnh chat FB ───────────────
router.get('/:phone/fb-conversation', async (req, res) => {
    const db = getPool(req);
    const phone = String(req.params.phone || '')
        .replace(/\D/g, '')
        .slice(-10);
    if (!phone) return res.json({ success: true, found: false, reason: 'invalid_phone' });
    try {
        // 1) native_orders — fb_page_id + fb_user_id đi cùng nhau (đáng tin nhất)
        const no = await db.query(
            `SELECT fb_page_id, fb_user_id, fb_user_name
               FROM native_orders
              WHERE (phone = $1 OR phone LIKE '%' || $1)
                AND fb_user_id IS NOT NULL AND fb_page_id IS NOT NULL
              ORDER BY id DESC LIMIT 1`,
            [phone]
        );
        if (no.rows.length) {
            const r = no.rows[0];
            return res.json({
                success: true,
                found: true,
                source: 'native_orders',
                pageId: r.fb_page_id,
                psid: r.fb_user_id,
                name: r.fb_user_name || null,
            });
        }
        // 2) web2_customers — fb_page_id + fb_id nếu có, fallback psid-only
        const wc = await db.query(
            `SELECT fb_id, fb_page_id, name FROM web2_customers
              WHERE phone = $1 AND fb_id IS NOT NULL AND fb_id <> '' LIMIT 1`,
            [phone]
        );
        if (wc.rows.length) {
            return res.json({
                success: true,
                found: true,
                source: 'web2_customers',
                pageId: wc.rows[0].fb_page_id || null,
                psid: wc.rows[0].fb_id,
                name: wc.rows[0].name || null,
            });
        }
        res.json({ success: true, found: false, reason: 'no_fb_link' });
    } catch (e) {
        console.error('[web2-customers] fb-conversation:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── GET /:phone — 1 KH theo SĐT (warehouse only) ──────────────────────
router.get('/:phone', async (req, res) => {
    const db = getPool(req);
    const phone = normPhoneWeb2(req.params.phone);
    if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
    try {
        const r = await db.query('SELECT * FROM web2_customers WHERE phone = $1 LIMIT 1', [phone]);
        if (r.rows.length) {
            return res.json({ success: true, customer: rowToLite(r.rows[0]), source: 'local' });
        }
        res.json({ success: true, customer: null });
    } catch (e) {
        console.error('[web2-customers] get error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /create — tạo KH mới (CRUD UI) ───────────────────────────────
router.post('/create', async (req, res) => {
    const db = getPool(req);
    const b = req.body || {};
    const phone = normPhoneWeb2(b.phone);
    const name = String(b.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    try {
        const now = Date.now();
        const r = await db.query(
            `INSERT INTO web2_customers
                (code, name, phone, email, address, ward, district, city, carrier,
                 status, tier, tags, note, fb_id, global_id, fb_page_id,
                 source, created_by, history, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13,$14,$15,$16,$17,$18,$19::jsonb,$20,$20)
             RETURNING *`,
            [
                b.code || null,
                name,
                phone,
                b.email || null,
                b.address || null,
                b.ward || null,
                b.district || null,
                b.city || null,
                b.carrier || null,
                b.status || 'Normal',
                b.tier || null,
                JSON.stringify(Array.isArray(b.tags) ? b.tags : []),
                b.note || null,
                b.fbId || null,
                b.globalId || null,
                b.fbPageId || null,
                b.source || 'manual',
                b.userId || b.createdBy || null,
                JSON.stringify([
                    _historyEntry('create', { userId: b.userId, userName: b.userName }),
                ]),
                now,
            ]
        );
        _notify('create', r.rows[0].id);
        res.json({ success: true, customer: rowToFull(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') {
            return res.status(409).json({ success: false, error: 'SĐT hoặc mã KH đã tồn tại' });
        }
        console.error('[web2-customers] create error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /upsert — upsert theo SĐT (chat → "Thêm KH"). KHÔNG TPOS. ─────
router.post('/upsert', async (req, res) => {
    const db = getPool(req);
    const b = req.body || {};
    const phone = normPhoneWeb2(b.phone);
    const name = b.name !== undefined ? String(b.name).trim() : undefined;
    const address = b.address !== undefined ? String(b.address).trim() : undefined;
    if (!phone) return res.status(400).json({ success: false, error: 'thiếu/không hợp lệ phone' });
    if (!name && !address) {
        return res.status(400).json({ success: false, error: 'cần ít nhất name hoặc address' });
    }
    try {
        const r = await getOrCreateWeb2Customer(db, phone, {
            name,
            address,
            fbId: b.fbId || undefined,
            source: b.source || 'manual',
        });
        _notify(r.created ? 'create' : 'update', r.customerId);
        res.json({ success: true, id: r.customerId, created: r.created, phone });
    } catch (e) {
        console.error('[web2-customers] upsert error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /enrich-fb — link fb_id vào kho (Web2Chat tự gọi). KHÔNG TPOS. ─
// Body: { fbId(psid), name?, phone?, globalId?, fbPageId? }. Idempotent.
router.post('/enrich-fb', async (req, res) => {
    const db = getPool(req);
    const fbId = String(req.body?.fbId || '').trim();
    const name = String(req.body?.name || '').trim();
    const phone = normPhoneWeb2(req.body?.phone);
    if (!fbId) return res.json({ success: true, action: 'no_fbid' });
    try {
        // 1) Đã có fb_id trong kho → bỏ qua.
        const existing = await findWeb2CustomerByFbId(db, fbId);
        if (existing) return res.json({ success: true, action: 'exists', id: existing.id });

        // 2) Có phone → upsert theo phone + link fb_id.
        if (phone) {
            const goc = await getOrCreateWeb2Customer(db, phone, {
                name: name || undefined,
                fbId,
                globalId: req.body?.globalId || undefined,
                fbPageId: req.body?.fbPageId || undefined,
                source: 'pancake',
            });
            await linkWeb2CustomerFbId(db, phone, fbId);
            _notify('update', goc.customerId);
            return res.json({ success: true, action: 'linked_by_phone', id: goc.customerId });
        }

        // 3) Không phone → tạo KH FB-only (warehouse độc lập, không cần TPOS).
        const now = Date.now();
        const ins = await db.query(
            `INSERT INTO web2_customers (name, fb_id, global_id, fb_page_id, source, history, created_at, updated_at)
             VALUES ($1,$2,$3,$4,'pancake',$5::jsonb,$6,$6)
             RETURNING id`,
            [
                name || 'Khách FB',
                fbId,
                req.body?.globalId || null,
                req.body?.fbPageId || null,
                JSON.stringify([_historyEntry('create', { note: 'FB-only từ chat' })]),
                now,
            ]
        );
        _notify('create', ins.rows[0].id);
        res.json({ success: true, action: 'created_fb_only', id: ins.rows[0].id });
    } catch (e) {
        console.error('[web2-customers] enrich-fb:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── POST /merge — gộp 2 KH trùng (keep primary, di chuyển đơn + xoá phụ) ─
// Body: { primaryId, secondaryId }. Repoint native_orders/fast_sale_orders.
router.post('/merge', async (req, res) => {
    const db = getPool(req);
    const primaryId = parseInt(req.body?.primaryId, 10);
    const secondaryId = parseInt(req.body?.secondaryId, 10);
    if (!Number.isFinite(primaryId) || !Number.isFinite(secondaryId) || primaryId === secondaryId) {
        return res
            .status(400)
            .json({ success: false, error: 'primaryId/secondaryId không hợp lệ' });
    }
    const client = await db.connect();
    try {
        await client.query('BEGIN');
        const [pr, sr] = await Promise.all([
            client.query('SELECT * FROM web2_customers WHERE id = $1', [primaryId]),
            client.query('SELECT * FROM web2_customers WHERE id = $1', [secondaryId]),
        ]);
        if (!pr.rows.length || !sr.rows.length) {
            await client.query('ROLLBACK');
            return res.status(404).json({ success: false, error: 'KH không tồn tại' });
        }
        const p = pr.rows[0];
        const s = sr.rows[0];
        // Survivorship: giữ field primary, lấp field rỗng từ secondary; gộp tags/aliases.
        const mergedTags = Array.from(
            new Set([...(p.tags || []), ...(s.tags || [])].map((t) => JSON.stringify(t)))
        ).map((t) => JSON.parse(t));
        const mergedAliases = Array.from(new Set([...(p.aliases || []), ...(s.aliases || [])]));
        const hist = Array.isArray(p.history) ? p.history.slice() : [];
        hist.push(_historyEntry('merge', { note: `gộp KH #${secondaryId} (${s.name})` }));
        await client.query(
            `UPDATE web2_customers SET
                name      = CASE WHEN name IN ('','Khách hàng mới') THEN $2 ELSE name END,
                phone     = COALESCE(phone, $3),
                email     = COALESCE(NULLIF(email,''), $4),
                address   = COALESCE(NULLIF(address,''), $5),
                fb_id     = COALESCE(NULLIF(fb_id,''), $6),
                global_id = COALESCE(NULLIF(global_id,''), $7),
                tags      = $8::jsonb,
                aliases   = $9::jsonb,
                total_orders = total_orders + $10,
                total_spent  = total_spent + $11,
                bom_count    = bom_count + $12,
                history   = $13::jsonb,
                updated_at = $14
             WHERE id = $1`,
            [
                primaryId,
                s.name,
                s.phone,
                s.email,
                s.address,
                s.fb_id,
                s.global_id,
                JSON.stringify(mergedTags),
                JSON.stringify(mergedAliases),
                Number(s.total_orders || 0),
                Number(s.total_spent || 0),
                Number(s.bom_count || 0),
                JSON.stringify(hist),
                Date.now(),
            ]
        );
        // Repoint đơn (best-effort, native_orders/fast_sale_orders dùng customer_id).
        await client.query('UPDATE native_orders SET customer_id = $1 WHERE customer_id = $2', [
            primaryId,
            secondaryId,
        ]);
        await client.query('UPDATE fast_sale_orders SET customer_id = $1 WHERE customer_id = $2', [
            primaryId,
            secondaryId,
        ]);
        await client.query('DELETE FROM web2_customers WHERE id = $1', [secondaryId]);
        await client.query('COMMIT');
        _notify('merge', primaryId);
        res.json({ success: true, primaryId, merged: secondaryId });
    } catch (e) {
        await client.query('ROLLBACK').catch(() => {});
        console.error('[web2-customers] merge error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    } finally {
        client.release();
    }
});

// ─── PATCH /:id — sửa KH (mọi trang). KHÔNG TPOS. :id = web2_customers.id ─
router.patch('/:id', async (req, res) => {
    const db = getPool(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'id không hợp lệ' });
    }
    const b = req.body || {};
    const sets = [];
    const params = [id];
    const setCol = (col, val) => {
        params.push(val);
        sets.push(`${col} = $${params.length}`);
    };
    if (b.name !== undefined) setCol('name', String(b.name).trim());
    if (b.phone !== undefined) setCol('phone', normPhoneWeb2(b.phone));
    if (b.email !== undefined) setCol('email', b.email || null);
    if (b.address !== undefined) setCol('address', b.address || null);
    if (b.ward !== undefined) setCol('ward', b.ward || null);
    if (b.district !== undefined) setCol('district', b.district || null);
    if (b.city !== undefined) setCol('city', b.city || null);
    if (b.carrier !== undefined) setCol('carrier', b.carrier || null);
    if (b.status !== undefined) setCol('status', b.status || 'Normal');
    if (b.tier !== undefined) setCol('tier', b.tier || null);
    if (b.note !== undefined) setCol('note', b.note || null);
    if (b.fbId !== undefined) setCol('fb_id', b.fbId || null);
    if (b.globalId !== undefined) setCol('global_id', b.globalId || null);
    if (b.fbPageId !== undefined) setCol('fb_page_id', b.fbPageId || null);
    if (Array.isArray(b.tags)) {
        params.push(JSON.stringify(b.tags));
        sets.push(`tags = $${params.length}::jsonb`);
    }
    if (!sets.length) {
        return res.status(400).json({ success: false, error: 'không có field nào để sửa' });
    }
    params.push(Date.now());
    sets.push(`updated_at = $${params.length}`);
    try {
        // Append history entry.
        const cur = await db.query('SELECT history FROM web2_customers WHERE id = $1', [id]);
        if (!cur.rows.length) return res.status(404).json({ success: false, error: 'Not found' });
        const hist = Array.isArray(cur.rows[0].history) ? cur.rows[0].history.slice() : [];
        hist.push(_historyEntry('update', { userId: b.userId, userName: b.userName }));
        params.push(JSON.stringify(hist));
        sets.push(`history = $${params.length}::jsonb`);
        const r = await db.query(
            `UPDATE web2_customers SET ${sets.join(', ')} WHERE id = $1 RETURNING *`,
            params
        );
        _notify('update', id);
        res.json({ success: true, customer: rowToFull(r.rows[0]) });
    } catch (e) {
        if (e.code === '23505') {
            return res.status(409).json({ success: false, error: 'SĐT đã tồn tại ở KH khác' });
        }
        console.error('[web2-customers] patch error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── DELETE /:id — xoá KH (guard: nếu có đơn → soft-archive is_active=false) ─
router.delete('/:id', async (req, res) => {
    const db = getPool(req);
    const id = parseInt(req.params.id, 10);
    if (!Number.isFinite(id)) {
        return res.status(400).json({ success: false, error: 'id không hợp lệ' });
    }
    const force = req.query.force === 'true' || req.query.force === '1';
    try {
        const linked = await db.query(
            `SELECT (SELECT COUNT(*) FROM native_orders WHERE customer_id = $1)::int
                  + (SELECT COUNT(*) FROM fast_sale_orders WHERE customer_id = $1)::int AS n`,
            [id]
        );
        const orderCount = linked.rows[0]?.n || 0;
        if (orderCount > 0 && !force) {
            // Soft-archive thay vì xoá cứng (giữ liên kết đơn).
            await db.query(
                'UPDATE web2_customers SET is_active = false, updated_at = $2 WHERE id = $1',
                [id, Date.now()]
            );
            _notify('archive', id);
            return res.json({ success: true, archived: true, orderCount });
        }
        await db.query('DELETE FROM web2_customers WHERE id = $1', [id]);
        _notify('delete', id);
        res.json({ success: true, deleted: true });
    } catch (e) {
        console.error('[web2-customers] delete error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
