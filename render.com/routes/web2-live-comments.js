// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — lưu comment livestream vào DB (auto-save + đọc lại đủ/bền).
// =====================================================================
// web2-live-comments — kho comment livestream Web 2.0 (web2Db).
//
// Vì sao: live-chat fetch comment trực tiếp pages.fm (cửa sổ thời gian + phân
// trang lặp + chỉ post đang chọn) → dễ THIẾU / mất khi reload. Lưu vào DB để:
//   • Hiển thị ĐỦ + BỀN (không phụ thuộc cửa sổ pages.fm).
//   • Gom theo bài livestream (post_id) + chiến dịch cha (campaign_id).
//   • Báo cáo / quản lý sau buổi live.
//
// Routes (mount /api/web2-live-comments):
//   POST /bulk            { comments:[{id,postId,pageId,pageName,fbId,name,message,createdTime,phone,address,hasOrder}] }
//   GET  /?postIds=a,b&pageIds=&campaignId=&since=&limit=  → { success, data:[...] }
//   GET  /stats?postId=   → { count }
// SSE topic: web2:live-comments
// =====================================================================

'use strict';
const express = require('express');
// 1D-auth (2026-06-12): mutation cấu hình poller gate SOFT (enforce qua env) —
// anonymous không tắt được thu comment giữa buổi live.
const { requireWeb2AuthSoft } = require('../middleware/web2-auth');
const router = express.Router();

function getDb(req) {
    return req.app.locals.web2Db || req.app.locals.chatDb;
}

let _notifyClients = null;
function initializeNotifiers(notifyClients) {
    _notifyClients = notifyClients;
}
function _notify(action, postId) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:live-comments',
            { action, postId: postId || null, ts: Date.now() },
            'update'
        );
    } catch (e) {
        console.warn('[WEB2-LIVE-COMMENTS] _notify failed:', e.message);
    }
}

let _tablesReady = false;
async function ensureTables(pool) {
    if (_tablesReady) return;
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_comments (
            id            VARCHAR(120) PRIMARY KEY,   -- pages.fm comment id (postId_commentId)
            post_id       VARCHAR(120),               -- bài livestream (FB post id)
            page_id       VARCHAR(50),
            page_name     VARCHAR(255),
            campaign_id   VARCHAR(120),               -- gán chiến dịch cha (tuỳ chọn)
            fb_id         VARCHAR(50),
            customer_name VARCHAR(255),
            message       TEXT,
            created_time  TIMESTAMPTZ,
            phone         VARCHAR(20),
            address       TEXT,
            has_order     BOOLEAN DEFAULT false,
            avatar        TEXT,                       -- URL/hash avatar khách (pages.fm)
            data          JSONB,
            created_at    BIGINT,
            updated_at    BIGINT
        );
        ALTER TABLE web2_live_comments ADD COLUMN IF NOT EXISTS avatar TEXT;
        CREATE INDEX IF NOT EXISTS idx_w2lc_post ON web2_live_comments(post_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_page ON web2_live_comments(page_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_campaign ON web2_live_comments(campaign_id);
        CREATE INDEX IF NOT EXISTS idx_w2lc_created ON web2_live_comments(created_time DESC);
    `);
    // MIGRATION one-time (marker-gated) 2026-06-11: created_time từng bị lưu
    // lệch -7h — new Date(inserted_at UTC KHÔNG hậu tố Z) trên server
    // TZ=Asia/Saigon → epoch -7h → UI hiện giờ UTC thay vì GMT+7. Parse đã fix
    // (parseUtcTs); rows cũ shift +7h về đúng UTC. Marker chống chạy lặp
    // (double-shift) qua restart.
    await pool.query(
        `CREATE TABLE IF NOT EXISTS web2_migrations (id TEXT PRIMARY KEY, applied_at BIGINT)`
    );
    const mig = await pool.query(`SELECT 1 FROM web2_migrations WHERE id = $1`, [
        'w2lc_tz_fix_20260611',
    ]);
    if (!mig.rows.length) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const u = await client.query(
                `UPDATE web2_live_comments
                 SET created_time = created_time + interval '7 hours'
                 WHERE created_time IS NOT NULL`
            );
            await client.query(
                `INSERT INTO web2_migrations (id, applied_at) VALUES ($1, $2)
                 ON CONFLICT (id) DO NOTHING`,
                ['w2lc_tz_fix_20260611', Date.now()]
            );
            await client.query('COMMIT');
            console.log(
                `[WEB2-LIVE-COMMENTS] tz_fix_20260611: shifted created_time +7h (${u.rowCount} rows)`
            );
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[WEB2-LIVE-COMMENTS] tz_fix_20260611 failed:', e.message);
            throw e;
        } finally {
            client.release();
        }
    }
    // MIGRATION #2 2026-06-11: deploy 88e456aa3 (parse fix, CHƯA có migration #1)
    // chạy 04:05–04:13Z đã ghi rows ĐÚNG; migration #1 boot sau đó shift +7h đè
    // lên các rows này → created_time = E+7h (tương lai). Tự phát hiện: comment
    // không thể được lưu TRƯỚC khi nó xảy ra → created_time > created_at (epoch
    // ghi row) + 1h slack = over-shifted → trả về -7h. WHERE tự idempotent
    // (sau -7h hết match) nhưng vẫn marker-gate cho sạch.
    const mig2 = await pool.query(`SELECT 1 FROM web2_migrations WHERE id = $1`, [
        'w2lc_tz_fix2_20260611',
    ]);
    if (!mig2.rows.length) {
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            const u = await client.query(
                `UPDATE web2_live_comments
                 SET created_time = created_time - interval '7 hours'
                 WHERE created_time IS NOT NULL AND created_at IS NOT NULL
                   AND created_time > to_timestamp(created_at / 1000.0) + interval '1 hour'`
            );
            await client.query(
                `INSERT INTO web2_migrations (id, applied_at) VALUES ($1, $2)
                 ON CONFLICT (id) DO NOTHING`,
                ['w2lc_tz_fix2_20260611', Date.now()]
            );
            await client.query('COMMIT');
            console.log(
                `[WEB2-LIVE-COMMENTS] tz_fix2_20260611: un-shifted ${u.rowCount} over-shifted rows -7h`
            );
        } catch (e) {
            await client.query('ROLLBACK').catch(() => {});
            console.error('[WEB2-LIVE-COMMENTS] tz_fix2_20260611 failed:', e.message);
            throw e;
        } finally {
            client.release();
        }
    }
    // "Lưu Live" — danh sách khách được đánh dấu giữ lại sau buổi live (nút
    // "+ Lưu vào Live" + filter tab "Lưu Live" cột Pancake). Trước 2026-06-12
    // client POST /api/live-saved vào relay — route KHÔNG tồn tại → 404 vĩnh
    // viễn (audit 3H8). Chuyển về đây (web2Db, prefix web2_) cho đúng convention.
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_saved (
            customer_id   VARCHAR(50) PRIMARY KEY,    -- FB user id (Pancake from.id)
            customer_name VARCHAR(255),
            page_id       VARCHAR(50),
            page_name     VARCHAR(255),
            saved_by      VARCHAR(120),
            notes         TEXT,
            created_at    BIGINT
        );
    `);
    _tablesReady = true;
}

const norm = (v) => (v == null ? null : String(v));

// Parse timestamp về Date đúng UTC. Pancake inserted_at = "2026-06-11T03:52:23"
// (UTC, KHÔNG hậu tố Z); Render server chạy TZ=Asia/Saigon (+7) nên
// new Date(naiveString) bị hiểu thành giờ +7 → epoch lệch -7h (bug created_time
// 2026-06-11). String không có timezone PHẢI append 'Z'. Nhận cả epoch ms/s.
function parseUtcTs(v) {
    if (v == null || v === '') return null;
    if (typeof v === 'number' || /^\d+$/.test(String(v))) {
        const n = Number(v);
        const d = new Date(n > 9999999999 ? n : n * 1000);
        return isNaN(d.getTime()) ? null : d;
    }
    const s = String(v);
    const hasTz = /(?:Z|[+-]\d{2}:?\d{2})$/.test(s);
    const d = new Date(hasTz ? s : s + 'Z');
    return isNaN(d.getTime()) ? null : d;
}

// Upsert nhiều comment vào web2_live_comments. Dùng chung cho /bulk + server poller.
async function upsertComments(pool, arr) {
    if (!Array.isArray(arr) || !arr.length) return 0;
    await ensureTables(pool);
    // Kế thừa campaign_id từ gán bài→chiến dịch cha (web2_live_post_assign) để
    // comment poller/auto-save tự gom vào chiến dịch cha tương ứng.
    try {
        const postIds = [...new Set(arr.map((c) => c && c.postId).filter(Boolean))].map(String);
        if (postIds.length) {
            const a = await pool.query(
                'SELECT post_id, campaign_id FROM web2_live_post_assign WHERE post_id = ANY($1) AND campaign_id IS NOT NULL',
                [postIds]
            );
            if (a.rows.length) {
                const map = {};
                for (const row of a.rows) map[row.post_id] = String(row.campaign_id);
                for (const c of arr) {
                    if (c && !c.campaignId && map[String(c.postId)])
                        c.campaignId = map[String(c.postId)];
                }
            }
        }
    } catch (_) {
        /* bảng chưa tạo / lỗi tra cứu → bỏ qua, lưu comment bình thường */
    }
    const now = Date.now();
    let saved = 0;
    const BATCH = 200;
    for (let i = 0; i < arr.length; i += BATCH) {
        const chunk = arr.slice(i, i + BATCH).filter((c) => c && c.id);
        if (!chunk.length) continue;
        const params = [];
        chunk.forEach((c) => {
            params.push(
                norm(c.id),
                norm(c.postId),
                norm(c.pageId),
                norm(c.pageName),
                norm(c.campaignId),
                norm(c.fbId),
                norm(c.name),
                c.message == null ? null : String(c.message),
                parseUtcTs(c.createdTime),
                norm(c.phone),
                c.address == null ? null : String(c.address),
                !!c.hasOrder,
                norm(c.avatar),
                now
            );
        });
        const sql = `
            INSERT INTO web2_live_comments
                (id, post_id, page_id, page_name, campaign_id, fb_id, customer_name,
                 message, created_time, phone, address, has_order, avatar, created_at, updated_at)
            VALUES ${chunk
                .map((_, k) => {
                    const b = k * 14;
                    return `($${b + 1},$${b + 2},$${b + 3},$${b + 4},$${b + 5},$${b + 6},$${b + 7},$${b + 8},$${b + 9},$${b + 10},$${b + 11},$${b + 12},$${b + 13},$${b + 14},$${b + 14})`;
                })
                .join(',')}
            ON CONFLICT (id) DO UPDATE SET
                message = EXCLUDED.message,
                phone = COALESCE(NULLIF(web2_live_comments.phone,''), EXCLUDED.phone),
                address = COALESCE(NULLIF(web2_live_comments.address,''), EXCLUDED.address),
                customer_name = COALESCE(NULLIF(web2_live_comments.customer_name,''), EXCLUDED.customer_name),
                avatar = COALESCE(NULLIF(web2_live_comments.avatar,''), EXCLUDED.avatar),
                has_order = web2_live_comments.has_order OR EXCLUDED.has_order,
                campaign_id = COALESCE(EXCLUDED.campaign_id, web2_live_comments.campaign_id),
                updated_at = EXCLUDED.updated_at`;
        const r = await pool.query(sql, params);
        saved += r.rowCount || chunk.length;
    }
    return saved;
}

// Map 1 conversation (Pancake WS shape) → comment shape mà upsertComments nhận.
// Chỉ áp dụng cho livestream comment (conv.type==='COMMENT' && post.type==='livestream').
function _mapWsConvToComment(conv) {
    if (!conv || !conv.id) return null;
    return {
        id: conv.id,
        postId: conv.post_id || null,
        pageId: conv.page_id || null,
        pageName: null, // upsert giữ page_name cũ nếu đã có (COALESCE), poller fill sau
        fbId: conv.customers?.[0]?.fb_id || conv.from?.id || null,
        name: conv.from?.name || conv.customers?.[0]?.name || null,
        message: conv.snippet || '',
        createdTime: conv.inserted_at || conv.updated_at || null,
        phone: conv.recent_phone_numbers?.[0]?.phone_number || null,
        address: null,
        hasOrder: conv.has_livestream_order || false,
        avatar: null,
    };
}

// POST /ingest — relay realtime (live-chat WS) đẩy livestream comment vào DB +
// broadcast SSE web2:live-comments. GATED bằng x-relay-secret === CLEANUP_SECRET.
// Body: { conversations:[<conv WS shape>] } HOẶC 1 conv ({...}).
router.post('/ingest', async (req, res) => {
    // Gate: secret set → bắt buộc match; secret rỗng (dev) → cho qua + warn.
    const secret = process.env.CLEANUP_SECRET || '';
    const provided = req.headers['x-relay-secret'] || '';
    if (secret) {
        if (provided !== secret) {
            return res.status(401).json({ success: false, error: 'unauthorized' });
        }
    } else {
        console.warn('[WEB2-LIVE-COMMENTS] /ingest: CLEANUP_SECRET không set — cho qua (dev only)');
    }

    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });

    try {
        const body = req.body || {};
        const raw = Array.isArray(body.conversations)
            ? body.conversations
            : body.conversation
              ? [body.conversation]
              : body.id
                ? [body]
                : [];
        // WS đẩy CONVERSATION update (không phải từng comment). KHÔNG map conv→1
        // comment nữa (gây đè comment cũ khi 1 người comment liên tục). Thay vào đó:
        // trigger poller fetch per-message ĐÚNG post đó (debounce 1.5s gom burst) →
        // poller tự upsert từng comment + _notify('poll'). Fallback: nếu poller chưa
        // sẵn sàng thì vẫn map thô để không mất data realtime.
        const pairs = [];
        const seenPair = new Set();
        for (const conv of raw) {
            const pageId = conv && (conv.page_id || conv.pageId);
            const postId = conv && (conv.post_id || conv.postId);
            if (!pageId || !postId) continue;
            const k = `${pageId}:${postId}`;
            if (seenPair.has(k)) continue;
            seenPair.add(k);
            pairs.push({ pageId: String(pageId), postId: String(postId) });
        }
        let poller = null;
        try {
            poller = require('../services/web2-livestream-poller');
        } catch (_) {
            poller = null;
        }
        if (poller?.pollPostNow && pairs.length) {
            // Fire-and-forget: trả về ngay, poller fetch + notify khi xong (debounced).
            for (const p of pairs) {
                poller.pollPostNow(p.pageId, p.postId).catch(() => {});
            }
            return res.json({ success: true, triggered: pairs.length });
        }
        // Fallback (poller absent): map thô conv→comment để không mất realtime.
        const mapped = raw.map(_mapWsConvToComment).filter((c) => c && c.id);
        if (!mapped.length) return res.json({ success: true, ingested: 0 });
        const saved = await upsertComments(pool, mapped);
        const postIds = [...new Set(mapped.map((c) => c.postId).filter(Boolean))];
        if (postIds.length) {
            for (const pid of postIds) _notify('realtime', pid);
        } else {
            _notify('realtime', null);
        }
        res.json({ success: true, ingested: saved });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] ingest error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /poll-now — client mở campaign gọi để poller fetch per-message NGAY post(s)
// đang chọn (comment hiện liền, không chờ cycle 5s). Body: { posts:[{pageId,postId}] }
// HOẶC { pageId, postId }. immediate=true (không debounce) để client thấy ngay.
router.post('/poll-now', requireWeb2AuthSoft, async (req, res) => {
    try {
        const body = req.body || {};
        const posts = Array.isArray(body.posts)
            ? body.posts
            : body.pageId && body.postId
              ? [{ pageId: body.pageId, postId: body.postId }]
              : [];
        const valid = posts
            .map((p) => ({ pageId: String(p.pageId || ''), postId: String(p.postId || '') }))
            .filter((p) => p.pageId && p.postId)
            // LC-pollnow-auth (2026-06-12): cap fan-out — mỗi post là tới 50 trang
            // conversations + N message-fetch trên pancake.vn; campaign thật ≤ vài post.
            .slice(0, 10);
        if (!valid.length) return res.json({ success: true, polled: 0 });
        let poller = null;
        try {
            poller = require('../services/web2-livestream-poller');
        } catch (_) {
            poller = null;
        }
        if (!poller?.pollPostNow) return res.json({ success: false, error: 'poller unavailable' });
        const results = await Promise.all(
            valid.map((p) => poller.pollPostNow(p.pageId, p.postId, { immediate: true }))
        );
        const saved = results.reduce((s, r) => s + (r?.saved || 0), 0);
        res.json({ success: true, polled: valid.length, saved });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] poll-now error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /bulk — upsert nhiều comment (auto-save khi live load/realtime).
router.post('/bulk', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const arr = Array.isArray(req.body?.comments) ? req.body.comments : [];
    if (!arr.length) return res.json({ success: true, saved: 0 });
    try {
        const saved = await upsertComments(pool, arr);
        // KHÔNG _notify ở client auto-save (tránh reload→re-save loop). CHỈ server
        // poller _notify('poll') — nguồn authoritative cho realtime reload.
        res.json({ success: true, saved });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] bulk error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET / — đọc comment đã lưu (theo post/page/campaign).
router.get('/', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const where = [];
        const params = [];
        const add = (clause, val) => {
            params.push(val);
            where.push(clause.replace('$?', `$${params.length}`));
        };
        const list = (s) =>
            String(s || '')
                .split(',')
                .map((x) => x.trim())
                .filter(Boolean);
        const postIds = list(req.query.postIds);
        const pageIds = list(req.query.pageIds);
        if (postIds.length) add('post_id = ANY($?)', postIds);
        if (pageIds.length) add('page_id = ANY($?)', pageIds);
        if (req.query.campaignId) add('campaign_id = $?', String(req.query.campaignId));
        if (req.query.since) add('created_time >= $?', new Date(Number(req.query.since)));
        // Delta cursor theo updated_at (epoch ms server-assigned, bump mỗi upsert).
        // Vì sao KHÔNG dùng created_time làm cursor delta: (a) comment bị UPDATE
        // (poller fill phone/has_order) không đổi created_time → client không thấy
        // (H11); (b) multi-post: comment post B về trễ với created_time < max(post A)
        // bị `created_time >= since` loại VĨNH VIỄN → "mất tin nhắn" (2026-06-12).
        if (req.query.sinceUpdated) add('updated_at >= $?', Number(req.query.sinceUpdated) || 0);
        const limit = Math.min(Number(req.query.limit) || 1000, 5000);
        const sql = `SELECT id, post_id, page_id, page_name, campaign_id, fb_id, customer_name,
                            message, created_time, phone, address, has_order, avatar, updated_at
                     FROM web2_live_comments
                     ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
                     ORDER BY created_time DESC LIMIT ${limit}`;
        const r = await pool.query(sql, params);
        res.json({ success: true, data: r.rows });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] list error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /stats?postId= — đếm comment đã lưu cho 1 post.
router.get('/stats', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const postId = req.query.postId ? String(req.query.postId) : null;
        const r = postId
            ? await pool.query(
                  'SELECT COUNT(*)::int AS count FROM web2_live_comments WHERE post_id = $1',
                  [postId]
              )
            : await pool.query('SELECT COUNT(*)::int AS count FROM web2_live_comments');
        res.json({ success: true, count: r.rows[0]?.count || 0 });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Chiến dịch cha (gom nhiều bài livestream) ─────────────────────────
async function ensureCampaignTables(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_parent_campaigns (
            id         BIGSERIAL PRIMARY KEY,
            name       VARCHAR(255) NOT NULL,
            note       TEXT,
            created_at BIGINT
        );
        CREATE TABLE IF NOT EXISTS web2_live_post_assign (
            post_id     VARCHAR(120) PRIMARY KEY,
            campaign_id BIGINT,
            page_id     VARCHAR(50),
            post_title  TEXT,
            assigned_at BIGINT
        );
        -- Tên bài livestream (FB post message) — persist để hiện trong picker
        -- viewer (mobile/desktop) kể cả khi JWT Pancake hết hạn. Ghi từ /page-posts
        -- (piggyback call hiện có, KHÔNG thêm call Pancake mới).
        CREATE TABLE IF NOT EXISTS web2_live_post_titles (
            post_id    VARCHAR(120) PRIMARY KEY,
            page_id    VARCHAR(50),
            title      TEXT,
            updated_at BIGINT
        );
    `);
}

// Best-effort upsert tên bài (từ /page-posts). KHÔNG throw — title là phụ trợ.
async function _persistPostTitles(pool, posts) {
    if (!Array.isArray(posts) || !posts.length) return;
    try {
        const rows = posts.filter((p) => p && p.postId && p.title && p.title !== '(livestream)');
        if (!rows.length) return;
        const now = Date.now();
        const vals = [];
        const params = [];
        rows.forEach((p, i) => {
            const b = i * 4;
            vals.push(`($${b + 1},$${b + 2},$${b + 3},$${b + 4})`);
            params.push(String(p.postId), String(p.pageId || ''), String(p.title), now);
        });
        await pool.query(
            `INSERT INTO web2_live_post_titles (post_id, page_id, title, updated_at)
             VALUES ${vals.join(',')}
             ON CONFLICT (post_id) DO UPDATE SET
                title = EXCLUDED.title, page_id = EXCLUDED.page_id, updated_at = EXCLUDED.updated_at`,
            params
        );
    } catch (e) {
        console.warn('[WEB2-LIVE-COMMENTS] persist post titles fail:', e.message);
    }
}

// GET /campaigns — list chiến dịch cha + số bài + số comment.
router.get('/campaigns', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureCampaignTables(pool);
        const r = await pool.query(`
            SELECT c.id, c.name, c.note, c.created_at,
                   COUNT(DISTINCT a.post_id)::int AS post_count,
                   COALESCE(cc.cnt, 0)::int AS comment_count
            FROM web2_live_parent_campaigns c
            LEFT JOIN web2_live_post_assign a ON a.campaign_id = c.id
            LEFT JOIN (SELECT campaign_id, COUNT(*) cnt FROM web2_live_comments WHERE campaign_id IS NOT NULL GROUP BY campaign_id) cc
                   ON cc.campaign_id = c.id::text
            GROUP BY c.id, cc.cnt ORDER BY c.created_at DESC`);
        res.json({ success: true, data: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /campaigns { name, note } — tạo chiến dịch cha.
router.post('/campaigns', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const name = String(req.body?.name || '').trim();
    if (!name) return res.status(400).json({ success: false, error: 'name required' });
    try {
        await ensureCampaignTables(pool);
        const r = await pool.query(
            'INSERT INTO web2_live_parent_campaigns (name, note, created_at) VALUES ($1,$2,$3) RETURNING id',
            [name, req.body?.note || null, Date.now()]
        );
        res.json({ success: true, id: r.rows[0].id });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /campaigns/:id — xoá (gỡ gán post, KHÔNG xoá comment).
router.delete('/campaigns/:id', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureCampaignTables(pool);
        const id = Number(req.params.id);
        await pool.query(
            'UPDATE web2_live_post_assign SET campaign_id = NULL WHERE campaign_id = $1',
            [id]
        );
        await pool.query(
            'UPDATE web2_live_comments SET campaign_id = NULL WHERE campaign_id = $1',
            [String(id)]
        );
        await pool.query('DELETE FROM web2_live_parent_campaigns WHERE id = $1', [id]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /posts — bài livestream đã có comment (để gán vào chiến dịch).
router.get('/posts', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        await ensureCampaignTables(pool);
        const r = await pool.query(`
            SELECT lc.post_id, lc.page_id,
                   MAX(lc.page_name) AS page_name,
                   COUNT(*)::int AS comment_count,
                   MAX(lc.created_time) AS last_at,
                   a.campaign_id,
                   COALESCE(t.title, a.post_title) AS title
            FROM web2_live_comments lc
            LEFT JOIN web2_live_post_assign a ON a.post_id = lc.post_id
            LEFT JOIN web2_live_post_titles t ON t.post_id = lc.post_id
            WHERE lc.post_id IS NOT NULL
            GROUP BY lc.post_id, lc.page_id, a.campaign_id, t.title, a.post_title
            ORDER BY last_at DESC LIMIT 200`);
        res.json({ success: true, data: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /page-posts — TẤT CẢ bài livestream gần đây (14 ngày) của page đã bật, kèm
// campaign_id hiện tại. Dùng cho UI "gom vào chiến dịch cha" ở native-orders +
// live-chat (chung dữ liệu). Lấy live từ poller (server-side Pancake JWT).
router.get('/page-posts', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureCampaignTables(pool);
        let posts = [];
        try {
            const poller = require('../services/web2-livestream-poller');
            posts = (await poller.listLivePostsForAssign()) || [];
        } catch (e) {
            console.warn('[web2-live-comments] page-posts poller fail:', e.message);
        }
        // Persist tên bài (best-effort) → /posts đọc lại được kể cả khi JWT hết hạn.
        await _persistPostTitles(pool, posts);
        // Merge campaign_id từ web2_live_post_assign.
        const a = await pool.query('SELECT post_id, campaign_id FROM web2_live_post_assign');
        const map = {};
        for (const row of a.rows) map[String(row.post_id)] = row.campaign_id;
        const data = posts.map((p) => ({ ...p, campaign_id: map[String(p.postId)] ?? null }));
        res.json({ success: true, data });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /campaigns/:id/assign { postId, postTitle, pageId } — gán bài vào chiến dịch.
router.post('/campaigns/:id/assign', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const campaignId = Number(req.params.id);
    const postId = String(req.body?.postId || '').trim();
    if (!postId) return res.status(400).json({ success: false, error: 'postId required' });
    try {
        await ensureCampaignTables(pool);
        await pool.query(
            `INSERT INTO web2_live_post_assign (post_id, campaign_id, page_id, post_title, assigned_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (post_id) DO UPDATE SET campaign_id = EXCLUDED.campaign_id, assigned_at = EXCLUDED.assigned_at`,
            [postId, campaignId, req.body?.pageId || null, req.body?.postTitle || null, Date.now()]
        );
        // Gán campaign_id cho comment đã có của post (string-typed cột campaign_id).
        await pool.query('UPDATE web2_live_comments SET campaign_id = $1 WHERE post_id = $2', [
            String(campaignId),
            postId,
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /unassign { postId } — gỡ bài khỏi chiến dịch.
router.post('/unassign', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const postId = String(req.body?.postId || '').trim();
    if (!postId) return res.status(400).json({ success: false, error: 'postId required' });
    try {
        await ensureCampaignTables(pool);
        await pool.query('DELETE FROM web2_live_post_assign WHERE post_id = $1', [postId]);
        await pool.query('UPDATE web2_live_comments SET campaign_id = NULL WHERE post_id = $1', [
            postId,
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ─── Poller pages config (trang tự lấy comment khi livestream) ─────────
async function ensurePollerTable(pool) {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_poller_pages (
            page_id    VARCHAR(50) PRIMARY KEY,
            page_name  VARCHAR(255),
            page_url   TEXT,
            enabled    BOOLEAN DEFAULT true,
            added_at   BIGINT
        );
    `);
}

// GET /poller-pages — list trang đang cấu hình.
router.get('/poller-pages', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        const r = await pool.query(
            'SELECT page_id, page_name, page_url, enabled, added_at FROM web2_live_poller_pages ORDER BY added_at ASC'
        );
        res.json({ success: true, data: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /poller-pages { pageId, pageName, pageUrl } — thêm/cập nhật trang.
router.post('/poller-pages', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    const pageId = String(req.body?.pageId || '').trim();
    if (!pageId) return res.status(400).json({ success: false, error: 'pageId required' });
    try {
        await ensurePollerTable(pool);
        await pool.query(
            `INSERT INTO web2_live_poller_pages (page_id, page_name, page_url, enabled, added_at)
             VALUES ($1,$2,$3,true,$4)
             ON CONFLICT (page_id) DO UPDATE SET
                page_name = COALESCE(EXCLUDED.page_name, web2_live_poller_pages.page_name),
                page_url = COALESCE(EXCLUDED.page_url, web2_live_poller_pages.page_url),
                enabled = true`,
            [pageId, req.body?.pageName || null, req.body?.pageUrl || null, Date.now()]
        );
        _notify('poller-pages', null); // tab/máy khác sync trạng thái cấu hình
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// PATCH /poller-pages/:pageId { enabled } — bật/tắt.
router.patch('/poller-pages/:pageId', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        await pool.query('UPDATE web2_live_poller_pages SET enabled = $1 WHERE page_id = $2', [
            !!req.body?.enabled,
            String(req.params.pageId),
        ]);
        _notify('poller-pages', null);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /poller-pages/:pageId
router.delete('/poller-pages/:pageId', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensurePollerTable(pool);
        await pool.query('DELETE FROM web2_live_poller_pages WHERE page_id = $1', [
            String(req.params.pageId),
        ]);
        _notify('poller-pages', null);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// =====================================================================
// "Lưu Live" — thay thế /api/live-saved (relay) đã chết 404 (audit 3H8).
// Client: live-api.saveToLive + pancake-api.loadLiveSavedIds/removeFromLiveSaved.
// =====================================================================

// POST /saved { customerId, customerName, pageId, pageName, savedBy, notes }
router.post('/saved', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const b = req.body || {};
        if (!b.customerId)
            return res.status(400).json({ success: false, error: 'customerId bắt buộc' });
        await pool.query(
            `INSERT INTO web2_live_saved (customer_id, customer_name, page_id, page_name, saved_by, notes, created_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7)
             ON CONFLICT (customer_id) DO UPDATE SET
                customer_name = COALESCE(EXCLUDED.customer_name, web2_live_saved.customer_name),
                page_id = COALESCE(EXCLUDED.page_id, web2_live_saved.page_id),
                page_name = COALESCE(EXCLUDED.page_name, web2_live_saved.page_name),
                notes = COALESCE(EXCLUDED.notes, web2_live_saved.notes)`,
            [
                String(b.customerId),
                norm(b.customerName),
                norm(b.pageId),
                norm(b.pageName),
                norm(b.savedBy),
                norm(b.notes),
                Date.now(),
            ]
        );
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] saved add error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /saved/ids → { success, data: [customer_id, ...] }
router.get('/saved/ids', async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        const r = await pool.query('SELECT customer_id FROM web2_live_saved');
        res.json({ success: true, data: r.rows.map((x) => x.customer_id) });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /saved/:customerId
router.delete('/saved/:customerId', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureTables(pool);
        await pool.query('DELETE FROM web2_live_saved WHERE customer_id = $1', [
            String(req.params.customerId),
        ]);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

module.exports = router;
module.exports.initializeNotifiers = initializeNotifiers;
module.exports.upsertComments = upsertComments;
module.exports.ensureTables = ensureTables;
module.exports._notify = _notify;
module.exports.parseUtcTs = parseUtcTs;
