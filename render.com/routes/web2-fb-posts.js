// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — Quản lý + đăng bài Facebook 2 page (compose/schedule/AI/media).
// =====================================================================
// Web 2.0 — "Đăng bài Facebook": quản lý bài viết + soạn/đăng/lên lịch cho 2 page
//   (NhiJudyStore + NhiJudyHouse.VietNam) qua Graph API. Pancake KHÔNG đăng được.
//
// Pool: req.app.locals.web2Db || req.app.locals.chatDb (Web 2.0 — KHÔNG ghi Web 1.0).
//   Bảng RIÊNG web2_fb_post_tokens / web2_fb_posts (web2Db). KHÔNG đọc fb_ads_tokens.
// FB App: dùng chung FB_APP_ID/FB_APP_SECRET env (config dùng chung, không phải data W1).
// Realtime: SSE web2:fb-posts.
//
// Page access token KHÔNG bao giờ trả về browser — chỉ id/name/picture/canPost.
// Media gửi FB qua URL công khai (Kho SP / studio / imgbb-upload) — {type,url}.
// =====================================================================

'use strict';

const express = require('express');
const router = express.Router();
const fb = require('../services/web2-fb-graph-service');
const caption = require('../services/web2-caption-service');

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// ── SSE notifier ────────────────────────────────────────────────────────
let _notifyClients = null;
function initializeNotifiers(fn) {
    _notifyClients = fn;
}
function _notify(action, id) {
    if (!_notifyClients) return;
    try {
        _notifyClients('web2:fb-posts', { action, id: id || null, ts: now() }, 'update');
    } catch (e) {
        console.warn('[WEB2-FB-POSTS] _notify failed:', e.message);
    }
}

// ── Schema (idempotent) ───────────────────────────────────────────────────
async function ensureSchema(pool) {
    if (!pool) return;
    try {
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_fb_post_tokens (
                user_id      TEXT PRIMARY KEY,
                user_token   TEXT NOT NULL,
                name         TEXT,
                pages        JSONB DEFAULT '[]'::jsonb,
                expires_at   BIGINT,
                updated_at   BIGINT
            )
        `);
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_fb_posts (
                id            BIGSERIAL PRIMARY KEY,
                page_ids      JSONB DEFAULT '[]'::jsonb,
                message       TEXT,
                media         JSONB DEFAULT '[]'::jsonb,
                link          TEXT,
                status        TEXT DEFAULT 'draft',
                scheduled_at  BIGINT,
                results       JSONB DEFAULT '[]'::jsonb,
                created_by    TEXT,
                created_at    BIGINT,
                updated_at    BIGINT
            )
        `);
        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_web2_fb_posts_status ON web2_fb_posts(status, scheduled_at)`
        );
        console.log('[web2-fb-posts] schema ready (web2Db)');
    } catch (e) {
        console.error('[web2-fb-posts] ensureSchema failed:', e.message);
    }
}

// ── Token store (web2Db) ──────────────────────────────────────────────────
async function loadToken(db) {
    if (!db) return null;
    try {
        const r = await db.query(
            `SELECT * FROM web2_fb_post_tokens ORDER BY updated_at DESC NULLS LAST LIMIT 1`
        );
        return r.rows[0] || null;
    } catch (_) {
        return null;
    }
}
async function saveToken(db, { userId, userToken, name, pages, expiresAt }) {
    await db.query(
        `INSERT INTO web2_fb_post_tokens (user_id, user_token, name, pages, expires_at, updated_at)
         VALUES ($1,$2,$3,$4::jsonb,$5,$6)
         ON CONFLICT (user_id) DO UPDATE SET
            user_token=EXCLUDED.user_token, name=EXCLUDED.name, pages=EXCLUDED.pages,
            expires_at=EXCLUDED.expires_at, updated_at=EXCLUDED.updated_at`,
        [userId, userToken, name || null, JSON.stringify(pages || []), expiresAt || null, now()]
    );
}

/** Trả pages an toàn (không kèm access_token) cho client. */
function safePages(pages) {
    return (pages || []).map((p) => ({
        id: p.id,
        name: p.name,
        picture: p.picture || '',
        category: p.category || '',
        fan_count: p.fan_count || 0,
        canPost: p.canPost !== false,
    }));
}
function findPage(pages, pageId) {
    return (pages || []).find((p) => String(p.id) === String(pageId)) || null;
}

// ── Auth / connect ─────────────────────────────────────────────────────────

// GET /status — đã kết nối FB chưa + page nào.
router.get('/status', async (req, res) => {
    try {
        const db = getDb(req);
        const row = await loadToken(db);
        if (!row) return res.json({ success: true, connected: false, pages: [] });
        const expired = row.expires_at && row.expires_at < now();
        res.json({
            success: true,
            connected: !expired,
            expired: !!expired,
            user: { id: row.user_id, name: row.name },
            pages: safePages(row.pages),
            aiAvailable: caption.hasAnyAiKey(),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /connect { token } — dán user access token (hoặc token session FB) →
// đổi long-lived → lấy /me + danh sách page (kèm page token) → lưu.
router.post('/connect', async (req, res) => {
    try {
        const db = getDb(req);
        const token = (req.body?.token || '').trim();
        if (!token) return res.status(400).json({ success: false, error: 'Thiếu token' });
        const { token: longLived, expiresAt } = await fb.exchangeLongLivedToken(token);
        const me = await fb.getMe(longLived);
        const pages = await fb.getPages(longLived);
        if (!pages.length) {
            return res.status(400).json({
                success: false,
                error: 'Token hợp lệ nhưng không quản lý page nào (cần quyền pages_show_list + pages_manage_posts).',
            });
        }
        await saveToken(db, {
            userId: me.id,
            userToken: longLived,
            name: me.name,
            pages,
            expiresAt,
        });
        _notify('connect', me.id);
        res.json({ success: true, user: { id: me.id, name: me.name }, pages: safePages(pages) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message, fbCode: e.fbCode });
    }
});

// POST /disconnect
router.post('/disconnect', async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`DELETE FROM web2_fb_post_tokens`);
        _notify('disconnect');
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /refresh-pages — đồng bộ lại danh sách page + page token từ FB.
router.post('/refresh-pages', async (req, res) => {
    try {
        const db = getDb(req);
        const row = await loadToken(db);
        if (!row) return res.status(400).json({ success: false, error: 'Chưa kết nối Facebook' });
        const pages = await fb.getPages(row.user_token);
        await saveToken(db, {
            userId: row.user_id,
            userToken: row.user_token,
            name: row.name,
            pages,
            expiresAt: row.expires_at,
        });
        res.json({ success: true, pages: safePages(pages) });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Caption AI (free template / optional AI) ───────────────────────────────
// POST /caption { product:{name,price,discount,desc,category}, style, ai:bool }
router.post('/caption', async (req, res) => {
    try {
        const { product = {}, style = 'sale', ai = false } = req.body || {};
        const out = ai
            ? await caption.generateAI(product, style)
            : { ...caption.generateTemplate(product, style), provider: 'template' };
        res.json({ success: true, ...out, styles: caption.STYLES });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Publish / schedule ─────────────────────────────────────────────────────
// POST /publish { pageIds[], message, media[], link, scheduledTime?, draftId? }
router.post('/publish', async (req, res) => {
    const db = getDb(req);
    try {
        const {
            pageIds = [],
            message = '',
            media = [],
            link = '',
            scheduledTime = null,
            draftId = null,
            createdBy = '',
        } = req.body || {};
        if (!Array.isArray(pageIds) || !pageIds.length)
            return res.status(400).json({ success: false, error: 'Chọn ít nhất 1 page' });
        if (!message.trim() && !media.length)
            return res.status(400).json({ success: false, error: 'Cần nội dung hoặc ảnh/video' });

        const row = await loadToken(db);
        if (!row) return res.status(400).json({ success: false, error: 'Chưa kết nối Facebook' });

        const results = [];
        for (const pid of pageIds) {
            const page = findPage(row.pages, pid);
            if (!page || !page.access_token) {
                results.push({ pageId: pid, ok: false, error: 'Không có page token' });
                continue;
            }
            try {
                const r = await fb.publishToPage({
                    pageId: page.id,
                    pageToken: page.access_token,
                    message,
                    media,
                    link,
                    scheduledTime,
                });
                results.push({ pageId: pid, pageName: page.name, ok: true, ...r });
            } catch (err) {
                results.push({
                    pageId: pid,
                    pageName: page.name,
                    ok: false,
                    error: err.message,
                    fbCode: err.fbCode,
                });
            }
        }

        const anyOk = results.some((r) => r.ok);
        const status = scheduledTime ? 'scheduled' : anyOk ? 'published' : 'failed';
        // Lưu record (cho lịch/quản lý). Nếu là draft → cập nhật, không thì tạo mới.
        let savedId = draftId;
        if (draftId) {
            await db.query(
                `UPDATE web2_fb_posts SET page_ids=$1::jsonb, message=$2, media=$3::jsonb, link=$4,
                    status=$5, scheduled_at=$6, results=$7::jsonb, updated_at=$8 WHERE id=$9`,
                [
                    JSON.stringify(pageIds),
                    message,
                    JSON.stringify(media),
                    link,
                    status,
                    scheduledTime ? toMs(scheduledTime) : null,
                    JSON.stringify(results),
                    now(),
                    draftId,
                ]
            );
        } else {
            const ins = await db.query(
                `INSERT INTO web2_fb_posts (page_ids, message, media, link, status, scheduled_at, results, created_by, created_at, updated_at)
                 VALUES ($1::jsonb,$2,$3::jsonb,$4,$5,$6,$7::jsonb,$8,$9,$9) RETURNING id`,
                [
                    JSON.stringify(pageIds),
                    message,
                    JSON.stringify(media),
                    link,
                    status,
                    scheduledTime ? toMs(scheduledTime) : null,
                    JSON.stringify(results),
                    createdBy || null,
                    now(),
                ]
            );
            savedId = ins.rows[0].id;
        }
        _notify(status, String(savedId));
        res.json({ success: anyOk, id: savedId, status, results });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

function toMs(t) {
    const n = Number(t);
    if (!isNaN(n)) return n > 1e12 ? n : n * 1000;
    return new Date(t).getTime();
}

// ── List / manage posts ────────────────────────────────────────────────────
// GET /list?pageId=&limit= — bài đã đăng + đã lên lịch (Graph).
router.get('/list', async (req, res) => {
    try {
        const db = getDb(req);
        const pageId = req.query.pageId;
        const limit = Math.min(50, parseInt(req.query.limit, 10) || 25);
        if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        const [posts, scheduled] = await Promise.all([
            fb.listPagePosts(page.id, page.access_token, limit),
            fb.listScheduledPosts(page.id, page.access_token, limit),
        ]);
        res.json({ success: true, posts, scheduled });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /delete { pageId, postId }
router.post('/delete', async (req, res) => {
    try {
        const db = getDb(req);
        const { pageId, postId } = req.body || {};
        if (!pageId || !postId)
            return res.status(400).json({ success: false, error: 'Thiếu pageId/postId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        await fb.deletePost(postId, page.access_token);
        _notify('delete', postId);
        res.json({ success: true });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Drafts / scheduled store (web2_fb_posts) ───────────────────────────────
// GET /drafts?status=draft|scheduled|all
router.get('/drafts', async (req, res) => {
    try {
        const db = getDb(req);
        const status = req.query.status || 'all';
        const where = status === 'all' ? '' : `WHERE status = $1`;
        const params = status === 'all' ? [] : [status];
        const r = await db.query(
            `SELECT id, page_ids, message, media, link, status, scheduled_at, results, created_at, updated_at
             FROM web2_fb_posts ${where} ORDER BY COALESCE(scheduled_at, updated_at) DESC LIMIT 200`,
            params
        );
        res.json({ success: true, drafts: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /draft { id?, pageIds, message, media, link, scheduledTime } — lưu nháp
router.post('/draft', async (req, res) => {
    try {
        const db = getDb(req);
        const {
            id,
            pageIds = [],
            message = '',
            media = [],
            link = '',
            scheduledTime = null,
        } = req.body || {};
        const sched = scheduledTime ? toMs(scheduledTime) : null;
        if (id) {
            await db.query(
                `UPDATE web2_fb_posts SET page_ids=$1::jsonb, message=$2, media=$3::jsonb, link=$4,
                    scheduled_at=$5, updated_at=$6 WHERE id=$7`,
                [JSON.stringify(pageIds), message, JSON.stringify(media), link, sched, now(), id]
            );
            _notify('draft', String(id));
            return res.json({ success: true, id });
        }
        const ins = await db.query(
            `INSERT INTO web2_fb_posts (page_ids, message, media, link, status, scheduled_at, created_at, updated_at)
             VALUES ($1::jsonb,$2,$3::jsonb,$4,'draft',$5,$6,$6) RETURNING id`,
            [JSON.stringify(pageIds), message, JSON.stringify(media), link, sched, now()]
        );
        _notify('draft', String(ins.rows[0].id));
        res.json({ success: true, id: ins.rows[0].id });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /draft/:id
router.delete('/draft/:id', async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`DELETE FROM web2_fb_posts WHERE id=$1`, [req.params.id]);
        _notify('draft-delete', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

router.initializeNotifiers = initializeNotifiers;
router.ensureSchema = ensureSchema;
module.exports = router;
