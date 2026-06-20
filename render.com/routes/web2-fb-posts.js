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
const secretCrypto = require('../lib/web2-secret-crypto');
const { requireWeb2AuthSoft, requireWeb2Admin } = require('../middleware/web2-auth');

const getDb = (req) => req.app.locals.web2Db || req.app.locals.chatDb;
const now = () => Date.now();

// Base công khai mà BROWSER dùng để gọi /api/web2-fb-posts (qua worker). redirect_uri
// OAuth PHẢI khớp giữa dialog + lúc đổi code → dùng cùng 1 hằng. Whitelist URI này
// trong FB App › Facebook Login › Valid OAuth Redirect URIs.
const OAUTH_BASE = (
    process.env.WEB2_FB_OAUTH_BASE || 'https://chatomni-proxy.nhijudyshop.workers.dev'
).replace(/\/+$/, '');
const OAUTH_CALLBACK = `${OAUTH_BASE}/api/web2-fb-posts/auth/callback`;

function b64urlEncode(s) {
    return Buffer.from(String(s), 'utf8').toString('base64url');
}
function b64urlDecode(s) {
    try {
        return Buffer.from(String(s || ''), 'base64url').toString('utf8');
    } catch (_) {
        return '';
    }
}
// Chỉ cho redirect về site của mình (chống open-redirect).
function safeReturn(u) {
    const s = String(u || '');
    if (/^https?:\/\/(localhost|127\.0\.0\.1|[\w.-]*nhijudy\.(store|github\.io))/i.test(s))
        return s;
    return '';
}

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
        // Sổ quảng cáo nhập tay: gắn bài/đợt live + tiền QC + số đơn + doanh thu…
        await pool.query(`
            CREATE TABLE IF NOT EXISTS web2_fb_ad_entries (
                id             BIGSERIAL PRIMARY KEY,
                page_id        TEXT,
                post_id        TEXT,
                post_message   TEXT,
                post_permalink TEXT,
                post_picture   TEXT,
                post_type      TEXT,
                entry_date     DATE,
                ad_spend       NUMERIC DEFAULT 0,
                orders         INTEGER DEFAULT 0,
                revenue        NUMERIC DEFAULT 0,
                reach          INTEGER DEFAULT 0,
                messages       INTEGER DEFAULT 0,
                note           TEXT,
                created_by     TEXT,
                created_at     BIGINT,
                updated_at     BIGINT
            )
        `);
        await pool.query(
            `CREATE INDEX IF NOT EXISTS idx_web2_fb_ad_entries_date ON web2_fb_ad_entries(page_id, entry_date)`
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
        const row = r.rows[0] || null;
        if (row) {
            // Giải mã AT-REST trước khi dùng (legacy plaintext đi qua nguyên vẹn).
            // Mọi consumer (status/publish/refresh/list/insights/ads…) đi qua đây →
            // 1 chỗ giải mã, không sót read site.
            row.user_token = secretCrypto.decryptString(row.user_token); // TEXT
            row.pages = secretCrypto.decryptJson(row.pages); // JSONB chứa page access_token
        }
        return row;
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
        [
            userId,
            secretCrypto.encryptString(userToken), // TEXT — mã hoá AT-REST
            name || null,
            JSON.stringify(secretCrypto.encryptJson(pages || [])), // JSONB chứa page access_token
            expiresAt || null,
            now(),
        ]
    );
    // AUDIT 2026-06-20 #LOW11: model 1-account. loadToken lấy row updated_at mới nhất
    // → 2 FB account để 2 row gây "ai connect sau thành active" mơ hồ. Xoá row account
    // khác khi account mới connect → luôn đúng 1 row = kết nối shop hiện tại.
    await db.query(`DELETE FROM web2_fb_post_tokens WHERE user_id <> $1`, [userId]).catch(() => {});
}

// Thứ tự ưu tiên hiển thị page (user chốt 2026-06-19): Store → House → Ơi → Nè.
// Sort ở 1 nơi (server) → mọi trang (composer/insights/ads) hiển thị nhất quán.
function _pageRank(name) {
    const s = String(name || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '') // bỏ dấu: ơi→oi, nè→ne
        .replace(/đ/g, 'd');
    if (s.includes('store')) return 0;
    if (s.includes('house')) return 1;
    if (/\boi\b|oi$/.test(s)) return 2; // "nhijudy oi"
    if (/\bne\b|ne$/.test(s)) return 3; // "nhijudy ne"
    return 50;
}

/** Trả pages an toàn (không kèm access_token) cho client, sắp theo thứ tự ưu tiên. */
function safePages(pages) {
    return (pages || [])
        .map((p) => ({
            id: p.id,
            name: p.name,
            picture: p.picture || '',
            category: p.category || '',
            fan_count: p.fan_count || 0,
            canPost: p.canPost !== false,
        }))
        .sort((a, b) => _pageRank(a.name) - _pageRank(b.name) || a.name.localeCompare(b.name));
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
        if (!row)
            return res.json({
                success: true,
                connected: false,
                pages: [],
                oauthAvailable: fb.hasApp(),
                aiAvailable: caption.hasAnyAiKey(),
            });
        // "Dính với web luôn" như Pancake/TPOS: page access token (sinh từ user token
        // long-lived) gần như KHÔNG hết hạn → còn page token là còn kết nối, kể cả khi
        // user token 60 ngày đã hết. expired = cảnh báo mềm (nên đăng nhập lại để đồng bộ).
        const hasPageTokens = (row.pages || []).some((p) => p.access_token);
        const userExpired = row.expires_at && row.expires_at < now();
        res.json({
            success: true,
            connected: hasPageTokens,
            expired: !!userExpired,
            user: { id: row.user_id, name: row.name },
            pages: safePages(row.pages),
            aiAvailable: caption.hasAnyAiKey(),
            oauthAvailable: fb.hasApp(),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── OAuth "Đăng nhập bằng Facebook" (như Pancake/TPOS — KHÔNG dán token) ──

// GET /auth/login-url?return=<url>&scope=full|min — trả URL dialog OAuth.
//   scope=full (mặc định): xin trọn quyền (đăng bài + read_insights + ads_read + business_management)
//     → 1 lần đăng nhập chạy được cả thống kê tương tác + quảng cáo tự động.
//   scope=min: chỉ quyền đăng bài (giữ tối thiểu nếu user không muốn cấp insights/ads).
router.get('/auth/login-url', (req, res) => {
    if (!fb.hasApp())
        return res.status(400).json({
            success: false,
            error: 'FB App chưa cấu hình trên server (FB_APP_ID/FB_APP_SECRET)',
        });
    const ret = safeReturn(req.query.return) || OAUTH_BASE;
    const scopes = req.query.scope === 'min' ? fb.SCOPES_POST : fb.SCOPES_FULL;
    const state = b64urlEncode(JSON.stringify({ r: ret, t: now() }));
    const url = fb.buildOAuthDialogUrl({ redirectUri: OAUTH_CALLBACK, state, scopes });
    res.json({ success: true, url, redirectUri: OAUTH_CALLBACK, scopes });
});

// GET /auth/callback?code&state — FB redirect về đây (qua worker → Render). Đổi code →
// token → /me/accounts → lưu → trả HTML tự điều hướng về trang fb-posts.
router.get('/auth/callback', async (req, res) => {
    const db = getDb(req);
    let ret = OAUTH_BASE;
    try {
        const st = JSON.parse(b64urlDecode(req.query.state) || '{}');
        ret = safeReturn(st.r) || OAUTH_BASE;
    } catch (_) {}
    const fail = (msg) =>
        res.set('Content-Type', 'text/html; charset=utf-8').send(
            `<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:24px">
             <h3>❌ Kết nối Facebook thất bại</h3><p>${String(msg).replace(/[<>&]/g, '')}</p>
             <p><a href="${ret}">← Quay lại</a></p></body>`
        );
    try {
        if (req.query.error)
            return fail(req.query.error_description || req.query.error || 'Bị từ chối');
        const code = req.query.code;
        if (!code) return fail('Thiếu code');
        const short = await fb.exchangeCodeForToken(code, OAUTH_CALLBACK);
        const { token: longLived, expiresAt } = await fb.exchangeLongLivedToken(short);
        const me = await fb.getMe(longLived);
        const pages = await fb.getPages(longLived);
        if (!pages.length)
            return fail(
                'Tài khoản không quản lý page nào (cần quyền pages_show_list + pages_manage_posts).'
            );
        await saveToken(db, {
            userId: me.id,
            userToken: longLived,
            name: me.name,
            pages,
            expiresAt,
        });
        _notify('connect', me.id);
        const back = ret + (ret.includes('?') ? '&' : '?') + 'fb_connected=1';
        res.set('Content-Type', 'text/html; charset=utf-8').send(
            `<!doctype html><meta charset=utf-8><body style="font-family:sans-serif;padding:24px">
             <h3>✅ Đã kết nối Facebook (${pages.length} page)</h3><p>Đang quay lại…</p>
             <script>location.replace(${JSON.stringify(back)})</script></body>`
        );
    } catch (e) {
        fail(e.message);
    }
});

// POST /connect { token } — dán user access token (hoặc token session FB) →
// đổi long-lived → lấy /me + danh sách page (kèm page token) → lưu.
router.post('/connect', requireWeb2Admin, async (req, res) => {
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
router.post('/disconnect', requireWeb2Admin, async (req, res) => {
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
router.post('/refresh-pages', requireWeb2Admin, async (req, res) => {
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
// POST /caption { product:{name,price,discount,desc,category}, products:[…], style, ai:bool }
//   products (nhiều SP từ Kho SP) → caption tổng hợp 1 bài. Không có → dùng product đơn.
router.post('/caption', requireWeb2AuthSoft, async (req, res) => {
    try {
        const { product = {}, products = null, style = 'sale', ai = false } = req.body || {};
        const list = Array.isArray(products) ? products.filter((p) => p && p.name) : [];
        let out;
        if (list.length > 1) {
            out = ai
                ? await caption.generateMultiAI(list, style)
                : { ...caption.generateMultiTemplate(list, style), provider: 'template' };
        } else {
            const p = list[0] || product;
            out = ai
                ? await caption.generateAI(p, style)
                : { ...caption.generateTemplate(p, style), provider: 'template' };
        }
        res.json({ success: true, ...out, styles: caption.STYLES });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ── Publish / schedule ─────────────────────────────────────────────────────
// POST /publish { pageIds[], message, media[], link, scheduledTime?, draftId? }
router.post('/publish', requireWeb2AuthSoft, async (req, res) => {
    const db = getDb(req);
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

    // ── Chống đăng-trùng (double-publish): publish gọi FB nhiều lần + chờ → 1 cú
    // double-click / retry mạng có thể đăng 2 lần cùng nội dung. Khoá advisory
    // theo draftId (re-publish nháp) hoặc theo nội dung (page+message+media) để
    // serialize. Dùng session-level pg_try_advisory_lock trên 1 client riêng (giữ
    // suốt vòng publish, KHÔNG ôm transaction qua các call FB chậm); kẹt khoá →
    // 409 (đang có lần publish y hệt chạy dở), client KHÔNG retry mù.
    const dedupeKey =
        'fbpub:' +
        (draftId
            ? `draft:${draftId}`
            : `${[...pageIds].map(String).sort().join(',')}|${message}|${JSON.stringify(media)}`);
    let lockClient = null;
    let lockAcquired = false;
    try {
        if (db && typeof db.connect === 'function') {
            lockClient = await db.connect();
            const lk = await lockClient.query('SELECT pg_try_advisory_lock(hashtext($1)) AS got', [
                dedupeKey,
            ]);
            lockAcquired = !!(lk.rows[0] && lk.rows[0].got);
            if (!lockAcquired) {
                return res.status(409).json({
                    success: false,
                    error: 'Bài này đang được đăng (tránh đăng trùng) → thử lại sau giây lát.',
                });
            }
        }

        const row = await loadToken(db);
        if (!row) return res.status(400).json({ success: false, error: 'Chưa kết nối Facebook' });

        const results = [];
        let rateLimited = false;
        for (let i = 0; i < pageIds.length; i++) {
            const pid = pageIds[i];
            const page = findPage(row.pages, pid);
            if (!page || !page.access_token) {
                results.push({ pageId: pid, ok: false, error: 'Không có page token' });
                continue;
            }
            // Giãn cách giữa các page → tránh đăng dồn dập (spam/IB) + nhịp FB dễ chịu.
            if (i > 0) await new Promise((r) => setTimeout(r, 1500));
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
                // FB rate-limit (80001 app / 32 page) → DỪNG, không retry mù
                // (gọi quá hạn vẫn tính vào cửa sổ kế → càng kẹt).
                if (err.fbCode === 80001 || err.fbCode === 32 || err.fbCode === 4) {
                    rateLimited = true;
                    break;
                }
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
        res.json({
            success: anyOk,
            id: savedId,
            status,
            results,
            rateLimited,
            ...(rateLimited
                ? { message: 'Facebook tạm giới hạn (rate-limit) → đã dừng, thử lại sau ít phút.' }
                : {}),
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    } finally {
        if (lockClient) {
            try {
                if (lockAcquired)
                    await lockClient.query('SELECT pg_advisory_unlock(hashtext($1))', [dedupeKey]);
            } catch (_) {}
            lockClient.release();
        }
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
        const after = req.query.after || null;
        if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        const [postsRes, liveMap] = await Promise.all([
            fb.listPagePosts(page.id, page.access_token, limit, after),
            fb.getLiveVideoMap(page.id, page.access_token),
        ]);
        // Phân loại từng bài: live | video | photo | text (+ living).
        const posts = postsRes.posts.map((p) => ({ ...p, ...fb.classifyPost(p, liveMap) }));
        // scheduled chỉ lấy ở trang đầu (after rỗng) — trang sau chỉ append bài đã đăng.
        const scheduled = after
            ? []
            : await fb.listScheduledPosts(page.id, page.access_token, limit);
        res.json({ success: true, posts, after: postsRes.after, scheduled });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /post-detail?pageId=&postId= — chi tiết 1 bài (đủ ảnh + comment + tương tác)
router.get('/post-detail', async (req, res) => {
    try {
        const db = getDb(req);
        const { pageId, postId } = req.query;
        if (!pageId || !postId)
            return res.status(400).json({ success: false, error: 'Thiếu pageId/postId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        const post = await fb.getPostDetail(postId, page.access_token);
        res.json({ success: true, post });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /delete { pageId, postId }
router.post('/delete', requireWeb2Admin, async (req, res) => {
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

// POST /post-edit { pageId, postId, message?, scheduledTime? } — sửa caption và/hoặc
// đổi giờ lên lịch (scheduledTime chỉ áp dụng bài CHƯA đăng). Không xoá → giữ nguyên link bài.
router.post('/post-edit', requireWeb2AuthSoft, async (req, res) => {
    try {
        const db = getDb(req);
        const { pageId, postId, message, scheduledTime } = req.body || {};
        if (!pageId || !postId)
            return res.status(400).json({ success: false, error: 'Thiếu pageId/postId' });
        if ((message === undefined || message === null) && !scheduledTime)
            return res.status(400).json({ success: false, error: 'Không có gì để cập nhật' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        const out = await fb.updatePost(postId, page.access_token, { message, scheduledTime });
        _notify('edit', postId);
        res.json({ success: true, ...out });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message, fbCode: e.fbCode });
    }
});

// ── Thống kê tương tác ───────────────────────────────────────────────────
// GET /engagement?pageId=&limit= — follower + tổng tương tác từ N bài + per-post.
router.get('/engagement', async (req, res) => {
    try {
        const db = getDb(req);
        const pageId = req.query.pageId;
        const limit = Math.min(100, parseInt(req.query.limit, 10) || 50);
        if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res
                .status(400)
                .json({ success: false, error: 'Chưa kết nối / không có page token' });
        const liveMap = await fb.getLiveVideoMap(page.id, page.access_token).catch(() => ({}));
        const [basic, eng, pageInsights] = await Promise.all([
            fb.getPageBasic(page.id, page.access_token).catch(() => ({})),
            fb.getEngagementPosts(page.id, page.access_token, limit, liveMap),
            fb
                .getPageInsights(page.id, page.access_token)
                .catch(() => ({ metrics: {}, available: [] })),
        ]);
        // Insights THẬT per-post (reach/impressions/reactions/video views) — cần read_insights.
        const enriched = await fb
            .enrichPostsWithInsights(page.access_token, eng.posts)
            .catch(() => ({ posts: eng.posts, hasInsights: false }));
        res.json({
            success: true,
            page: {
                name: basic.name || page.name,
                fans: basic.fan_count ?? null,
                followers: basic.followers_count ?? null,
                talkingAbout: basic.talking_about_count ?? null,
            },
            posts: enriched.posts,
            hasEngagement: eng.hasEngagement,
            hasInsights: enriched.hasInsights,
            pageInsights: pageInsights.metrics || {},
            insightsAvailable: pageInsights.available || [],
        });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /insights-probe?pageId=&postId= — CHẨN ĐOÁN: thử từng metric post riêng lẻ, báo
// metric nào FB còn cho. postId trống → lấy bài mới nhất của page. Dùng để biết metric
// nào deprecated thay vì đoán mò.
router.get('/insights-probe', async (req, res) => {
    try {
        const db = getDb(req);
        const { pageId } = req.query;
        if (!pageId) return res.status(400).json({ success: false, error: 'Thiếu pageId' });
        const row = await loadToken(db);
        const page = row && findPage(row.pages, pageId);
        if (!page || !page.access_token)
            return res.status(400).json({ success: false, error: 'Chưa kết nối / không có token' });
        let postId = req.query.postId;
        if (!postId) {
            const r = await fb.listPagePosts(page.id, page.access_token, 1, null);
            postId = r.posts[0] && r.posts[0].id;
        }
        if (!postId) return res.json({ success: true, postId: null, probe: [] });
        const probe = await fb.probePostMetrics(postId, page.access_token);
        res.json({ success: true, postId, probe });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message, fbCode: e.fbCode });
    }
});

// ── Thống kê quảng cáo ──────────────────────────────────────────────────────
// GET /ad-accounts — danh sách tài khoản quảng cáo (dùng user token).
router.get('/ad-accounts', async (req, res) => {
    try {
        const db = getDb(req);
        const row = await loadToken(db);
        if (!row || !row.user_token)
            return res.status(400).json({ success: false, error: 'Chưa kết nối Facebook' });
        const accounts = await fb.getAdAccounts(row.user_token);
        res.json({ success: true, accounts });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// GET /ad-insights?actId=&preset= — insights + campaign breakdown 1 tài khoản.
router.get('/ad-insights', async (req, res) => {
    try {
        const db = getDb(req);
        const { actId, preset } = req.query;
        if (!actId) return res.status(400).json({ success: false, error: 'Thiếu actId' });
        const row = await loadToken(db);
        if (!row || !row.user_token)
            return res.status(400).json({ success: false, error: 'Chưa kết nối Facebook' });
        const data = await fb.getAdInsights(actId, row.user_token, preset || 'last_30d');
        res.json({ success: true, ...data });
    } catch (e) {
        res.status(400).json({ success: false, error: e.message });
    }
});

// ── Sổ quảng cáo NHẬP TAY (web2_fb_ad_entries) ─────────────────────────────
// GET /ad-entries?pageId=&from=&to= — danh sách bản ghi (mới → cũ).
router.get('/ad-entries', async (req, res) => {
    try {
        const db = getDb(req);
        const { pageId, from, to } = req.query;
        const cond = [];
        const params = [];
        if (pageId) {
            params.push(pageId);
            cond.push(`page_id = $${params.length}`);
        }
        if (from) {
            params.push(from);
            cond.push(`entry_date >= $${params.length}`);
        }
        if (to) {
            params.push(to);
            cond.push(`entry_date <= $${params.length}`);
        }
        const where = cond.length ? `WHERE ${cond.join(' AND ')}` : '';
        const r = await db.query(
            `SELECT * FROM web2_fb_ad_entries ${where} ORDER BY entry_date DESC NULLS LAST, id DESC LIMIT 1000`,
            params
        );
        res.json({ success: true, entries: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /ad-entry — tạo/sửa bản ghi quảng cáo nhập tay.
router.post('/ad-entry', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        const b = req.body || {};
        const num = (v) => Number(String(v == null ? 0 : v).replace(/[^\d.-]/g, '')) || 0;
        const post = b.post || {};
        const fields = {
            page_id: b.pageId || null,
            post_id: post.id || null,
            post_message: post.message || null,
            post_permalink: post.permalink || null,
            post_picture: post.picture || null,
            post_type: post.type || null,
            entry_date: b.entryDate || null,
            ad_spend: num(b.adSpend),
            orders: Math.round(num(b.orders)),
            revenue: num(b.revenue),
            reach: Math.round(num(b.reach)),
            messages: Math.round(num(b.messages)),
            note: b.note || null,
            created_by: b.createdBy || null,
        };
        if (!fields.entry_date)
            return res.status(400).json({ success: false, error: 'Thiếu ngày (entryDate)' });
        if (b.id) {
            await db.query(
                `UPDATE web2_fb_ad_entries SET page_id=$1, post_id=$2, post_message=$3, post_permalink=$4,
                    post_picture=$5, post_type=$6, entry_date=$7, ad_spend=$8, orders=$9, revenue=$10,
                    reach=$11, messages=$12, note=$13, updated_at=$14 WHERE id=$15`,
                [
                    fields.page_id,
                    fields.post_id,
                    fields.post_message,
                    fields.post_permalink,
                    fields.post_picture,
                    fields.post_type,
                    fields.entry_date,
                    fields.ad_spend,
                    fields.orders,
                    fields.revenue,
                    fields.reach,
                    fields.messages,
                    fields.note,
                    now(),
                    b.id,
                ]
            );
            _notify('ad-entry', String(b.id));
            return res.json({ success: true, id: b.id });
        }
        const ins = await db.query(
            `INSERT INTO web2_fb_ad_entries (page_id, post_id, post_message, post_permalink, post_picture,
                post_type, entry_date, ad_spend, orders, revenue, reach, messages, note, created_by, created_at, updated_at)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15) RETURNING id`,
            [
                fields.page_id,
                fields.post_id,
                fields.post_message,
                fields.post_permalink,
                fields.post_picture,
                fields.post_type,
                fields.entry_date,
                fields.ad_spend,
                fields.orders,
                fields.revenue,
                fields.reach,
                fields.messages,
                fields.note,
                fields.created_by,
                now(),
            ]
        );
        _notify('ad-entry', String(ins.rows[0].id));
        res.json({ success: true, id: ins.rows[0].id });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// DELETE /ad-entry/:id
router.delete('/ad-entry/:id', requireWeb2Admin, async (req, res) => {
    try {
        const db = getDb(req);
        await db.query(`DELETE FROM web2_fb_ad_entries WHERE id=$1`, [req.params.id]);
        _notify('ad-entry-delete', req.params.id);
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
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
router.post('/draft', requireWeb2Admin, async (req, res) => {
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
router.delete('/draft/:id', requireWeb2Admin, async (req, res) => {
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
