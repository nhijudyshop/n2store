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
function _notify(action, postId, extra) {
    if (!_notifyClients) return;
    try {
        _notifyClients(
            'web2:live-comments',
            { action, postId: postId || null, ts: Date.now(), ...(extra || {}) },
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
        -- updated_at = cột CURSOR delta-sync (GET /?sinceUpdated=). Thiếu index → mỗi
        -- lần poll live = seq scan bảng lớn nhất. Index này là quick-win payoff cao nhất.
        CREATE INDEX IF NOT EXISTS idx_w2lc_updated ON web2_live_comments(updated_at);
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

// ---- Boost-suppress (2026-06-15) -------------------------------------------
// Trang "Đa dụng → Tăng số lượng comment" (web2/multi-tool) cho page tự
// reply_comment để tăng SỐ LƯỢNG comment trên live. Các comment đó KHÔNG phải
// của khách → KHÔNG được hiện ở live-chat / comments-mobile. Cơ chế nhận biết:
//   1) multi-tool gọi POST /boost-mark báo convId đang spam → ingest bỏ qua các
//      conv đó trong TTL (deterministic — ta biết chính xác conv nào đang spam).
//   2) Heuristic phụ: comment do CHÍNH PAGE tạo (conv.from.id === conv.page_id)
//      → page tự comment trên post của mình → cũng bỏ.
// "Bỏ" = KHÔNG upsert DB + KHÔNG _notify → không vào bất kỳ kênh hiển thị nào.
const _boostMarks = new Map(); // convId -> expiryMs
const BOOST_TTL_MS = 20 * 60 * 1000;
function _markBoost(convId, ttlMs) {
    if (!convId) return;
    _boostMarks.set(String(convId), Date.now() + (ttlMs > 0 ? ttlMs : BOOST_TTL_MS));
}
function _isBoosted(convId) {
    if (!convId) return false;
    const exp = _boostMarks.get(String(convId));
    if (!exp) return false;
    if (exp < Date.now()) {
        _boostMarks.delete(String(convId));
        return false;
    }
    return true;
}
function _isPageAuthored(conv) {
    return !!(conv && conv.from && conv.page_id && String(conv.from.id) === String(conv.page_id));
}
function _isSuppressedConv(conv) {
    return _isBoosted(conv && conv.id) || _isPageAuthored(conv);
}

// Giới hạn số reconcileFullText chạy đồng thời (audit LOW 2026-06-20): mỗi snippet
// bị cắt "…" fire 1 fetch Pancake messages riêng; live volume cao → bùng nổ fetch
// song song, rủi ro rate-limit Pancake. Semaphore mềm: chỉ cho tối đa N reconcile
// in-flight cùng lúc; vượt thì BỎ QUA (poller sẽ vá ở cycle/delta sau, không mất tin).
const RECONCILE_MAX_INFLIGHT = 6;
let _reconcileInflight = 0;

// Map 1 conversation (Pancake WS shape) → comment shape mà upsertComments nhận.
// Chỉ áp dụng cho livestream comment (conv.type==='COMMENT' && post.type==='livestream').
function _mapWsConvToComment(conv) {
    if (!conv || !conv.id) return null;
    // ID DUY NHẤT mỗi comment: conv.id = 1 conversation (1 người); message_count tăng
    // mỗi tin mới → `${conv.id}_${message_count}` phân biệt từng comment của cùng người
    // → mỗi comment 1 dòng (KHÔNG đè khi 1 người comment liên tục). Thiếu message_count
    // → fallback PHẢI là số non-empty: updated_at (epoch giây mỗi tin mới đổi) → Date.now()
    // cuối cùng. KHÔNG dùng '' (rỗng) — '' làm 2 comment liên tiếp cùng người gộp về
    // `${conv.id}_` đè nhau (mất tin); cũng KHÔNG dùng conv.id trần. Seq giữ là số để
    // split convId (id.replace(/_[^_]*$/,'') trong poller) + purge starts_with vẫn đúng.
    let seq;
    if (conv.message_count != null) {
        seq = conv.message_count;
    } else {
        const t = conv.updated_at ? new Date(conv.updated_at).getTime() : NaN;
        seq = Number.isFinite(t) ? Math.floor(t / 1000) : Date.now();
    }
    return {
        id: `${conv.id}_${seq}`,
        postId: conv.post_id || null,
        pageId: conv.page_id || null,
        pageName: null,
        fbId: conv.customers?.[0]?.fb_id || conv.from?.id || null,
        name: conv.from?.name || conv.customers?.[0]?.name || null,
        message: conv.snippet || '',
        // updated_at = thời điểm tin MỚI NHẤT (đúng cho comment vừa tới); fallback inserted_at.
        createdTime: conv.updated_at || conv.inserted_at || null,
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
    // Gate BẮT BUỘC bằng x-relay-secret === CLEANUP_SECRET. Trước đây secret rỗng
    // được "cho qua (dev)" → bất kỳ ai cũng POST inject/ghi đè comment livestream
    // (audit fix 2026-06-20). Secret KHÔNG set → từ chối luôn (fail-closed), không
    // còn cửa hậu anonymous ingest trên prod.
    const secret = process.env.CLEANUP_SECRET || '';
    if (!secret) {
        console.error(
            '[WEB2-LIVE-COMMENTS] /ingest: CLEANUP_SECRET chưa cấu hình — từ chối (fail-closed)'
        );
        return res.status(503).json({ success: false, error: 'ingest secret not configured' });
    }
    const provided = req.headers['x-relay-secret'] || '';
    if (provided !== secret) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
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
        // WS-DIRECT (2026-06-15 — user: bỏ poll, nhanh như TPOS): dùng LUÔN comment
        // trong event WS (conv.snippet + from + message_count) → upsert + notify NGAY.
        // Trước đây trigger pollPostNow (REST fetch lại CẢ post + debounce 1.5s) = chậm
        // vài→chục giây (scale theo độ lớn post). WS event đã đủ data 1 comment; id duy
        // nhất `${conv.id}_${message_count}` (xem _mapWsConvToComment) → mỗi comment 1
        // dòng, không đè khi 1 người comment liên tục. (Poller chỉ còn cho /poll-now thủ
        // công + listLivePostsForAssign — KHÔNG còn auto-trigger realtime.)
        // Bỏ các conv "tăng số lượng comment" (page tự spam) trước khi lưu/hiện.
        const conv0 = raw.filter((c) => !_isSuppressedConv(c));
        const suppressed = raw.length - conv0.length;
        const mapped = conv0.map(_mapWsConvToComment).filter((c) => c && c.id);
        if (!mapped.length) return res.json({ success: true, ingested: 0, suppressed });
        const saved = await upsertComments(pool, mapped);
        const postIds = [...new Set(mapped.map((c) => c.postId).filter(Boolean))];
        if (postIds.length) {
            for (const pid of postIds) _notify('realtime', pid);
        } else {
            _notify('realtime', null);
        }
        // RECONCILE NỀN: snippet Pancake bị cắt ("…"/"...") với comment dài → fetch full
        // text 1 conversation (KHÔNG re-fetch cả post) → UPDATE đúng dòng (rowId), ~1-2s
        // sau client tự đổi snippet→full qua delta. Fire-and-forget, không chặn response.
        try {
            let poller = null;
            try {
                poller = require('../services/web2-livestream-poller');
            } catch (_) {
                poller = null;
            }
            if (poller?.reconcileFullText) {
                for (const conv of conv0) {
                    const snip = (conv && conv.snippet ? String(conv.snippet) : '').trimEnd();
                    if (!snip.endsWith('…') && !snip.endsWith('...')) continue;
                    const m = _mapWsConvToComment(conv);
                    if (m && m.id && conv.id) {
                        // Cap reconcile in-flight: vượt ngưỡng thì bỏ qua (poller vá sau).
                        if (_reconcileInflight >= RECONCILE_MAX_INFLIGHT) continue;
                        // customer UUID (conv.customers[0].id) BẮT BUỘC cho messages API —
                        // truyền xuống để reconcile fetch được full text (PSID không dùng được).
                        const custUuid =
                            (conv.customers && conv.customers[0] && conv.customers[0].id) || null;
                        _reconcileInflight++;
                        Promise.resolve(
                            poller.reconcileFullText(
                                conv.page_id,
                                conv.post_id,
                                conv.id,
                                m.id,
                                custUuid
                            )
                        )
                            .catch(() => {})
                            .finally(() => {
                                _reconcileInflight--;
                            });
                    }
                }
            }
        } catch (_) {
            /* reconcile best-effort — không phá ingest */
        }
        res.json({ success: true, ingested: saved, suppressed });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] ingest error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// POST /boost-mark — trang "Đa dụng → Tăng số lượng comment" báo các conversation
// đang spam để: (1) /ingest BỎ QUA event MỚI của conv đó (in-memory, TTL 20'); (2)
// XOÁ luôn các comment ĐÃ ingest của conv đó (page tự reply để tăng count — KHÔNG
// phải khách) + broadcast SSE để live-chat đang mở tự bỏ khỏi danh sách. Vì realtime
// WS gán page-reply vào hội thoại của KHÁCH (không có field "page-authored"), cách
// duy nhất tin cậy là deterministic: tool biết chính xác conv nào đang tăng.
// Body: { convIds:[...] } | { convId }, ttlMs? (mặc định 20 phút). Soft-auth.
// Core dọn comment tăng — mark (ingest bỏ qua, TTL) + XOÁ comment đã ingest +
// SSE reconcile. Export để worker chạy nền (web2-comment-boost-worker) gọi
// in-process sau khi job xong (KHÔNG cần HTTP roundtrip). Trả { marked, purged }.
async function markBoostAndPurge(pool, rawIds, ttlMs) {
    const ids = (Array.isArray(rawIds) ? rawIds : rawIds ? [rawIds] : [])
        .map((x) => String(x || '').trim())
        .filter(Boolean);
    const ttl = Number(ttlMs);
    ids.forEach((id) => _markBoost(id, ttl));
    // Dọn comment đã ingest của các conv này. Row id = conv.id (comment gốc) hoặc
    // `${conv.id}_${message_count}` (reply). starts_with → prefix LITERAL (tránh '_'
    // bị coi là wildcard trong LIKE vì conv.id có nhiều '_').
    let purged = 0;
    if (pool && ids.length) {
        await ensureTables(pool);
        // 1 query thay vòng lặp N+1 (audit MEDIUM 2026-06-20): match exact id HOẶC
        // prefix `${cid}_` cho MỌI cid trong mảng — qua unnest + EXISTS (giữ nguyên
        // logic per-cid `id = cid OR starts_with(id, cid||'_')`, KHÔNG dùng LIKE để
        // tránh '_' wildcard vì conv.id chứa nhiều '_').
        const r = await pool.query(
            `DELETE FROM web2_live_comments lc
             WHERE EXISTS (
                 SELECT 1 FROM unnest($1::text[]) p
                 WHERE lc.id = p OR starts_with(lc.id, p || '_')
             )
             RETURNING lc.id`,
            [ids]
        );
        purged = r.rowCount || 0;
        // Trước đây _notify('reconcile') KHÔNG kèm id → client desktop chỉ delta-fetch
        // (append-only) nên KHÔNG gỡ được dòng đã purge (spam vẫn hiện — audit MEDIUM).
        // Kèm purgedIds (row id thật vừa xoá) để client gỡ ĐÚNG dòng, không cần full reload.
        if (purged > 0) _notify('reconcile', null, { purgedIds: r.rows.map((x) => x.id) });
    }
    return { marked: ids.length, purged, ttlMs: ttl > 0 ? ttl : BOOST_TTL_MS };
}

router.post('/boost-mark', requireWeb2AuthSoft, async (req, res) => {
    try {
        const b = req.body || {};
        const out = await markBoostAndPurge(
            getDb(req),
            Array.isArray(b.convIds) ? b.convIds : b.convId,
            b.ttlMs
        );
        res.json({ success: true, ...out });
    } catch (e) {
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
        // Poller FETCH comment ĐÃ BỎ (2026-06-20, user: "message thì cứ WS live") — comment
        // realtime vào DB duy nhất qua WS /ingest. Nút "poll now" giờ CHỈ vá full-text cho
        // comment WS còn bị cắt "…" (reconcileRecentTruncated UPDATE tại chỗ, KHÔNG tạo dòng trùng).
        if (!poller?.reconcileRecentTruncated)
            return res.json({ success: true, polled: 0, note: 'ws-live-only' });
        const r = await poller.reconcileRecentTruncated({ hours: 6, limit: 200 });
        res.json({
            success: true,
            polled: valid.length,
            fixed: r?.fixed || 0,
            note: 'ws-live-only',
        });
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
// AUTH (2026-06-20): comment chứa PII khách (fb_id/tên/SĐT) → BẮT BUỘC x-web2-token
// (WEB2_AUTH_ENFORCE=1 → 401 nếu thiếu). Chống xem ẩn danh qua comments-mobile.html.
router.get('/', requireWeb2AuthSoft, async (req, res) => {
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
// Soft-auth (audit LOW 2026-06-20): tổng số comment + cấu hình page là dữ liệu vận
// hành — gate đồng nhất với các mutation (poller-pages) thay vì để mở cho bất kỳ ai.
router.get('/stats', requireWeb2AuthSoft, async (req, res) => {
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
router.get('/campaigns', requireWeb2AuthSoft, async (req, res) => {
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
        _notify('campaign', null); // audit r9: SSE → tab khác cập nhật danh sách chiến dịch
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
        _notify('campaign', null); // audit r9: SSE → tab khác bỏ chiến dịch đã xoá
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /posts — bài livestream đã có comment (để gán vào chiến dịch).
router.get('/posts', requireWeb2AuthSoft, async (req, res) => {
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

// GET /assignments — map post_id → campaign_id LẤY TỪ BẢNG GÁN (web2_live_post_assign),
// KHÔNG phụ thuộc web2_live_comments. /posts ở trên driven bởi web2_live_comments nên
// bài LIVE CŨ đã hết comment (aged/pruned) sẽ KHÔNG xuất hiện → picker mất trạng thái
// "đã gom" và hiện "chưa gom" dù vẫn được đếm trong post_count (bug 2026-06-27).
// Dùng endpoint này cho picker để trạng thái gán luôn đúng theo nguồn-sự-thật.
router.get('/assignments', requireWeb2AuthSoft, async (req, res) => {
    const pool = getDb(req);
    if (!pool) return res.status(500).json({ success: false, error: 'DB unavailable' });
    try {
        await ensureCampaignTables(pool);
        const r = await pool.query(
            `SELECT post_id, campaign_id, post_title, page_id
             FROM web2_live_post_assign WHERE campaign_id IS NOT NULL`
        );
        res.json({ success: true, data: r.rows });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /page-posts — TẤT CẢ bài livestream gần đây (14 ngày) của page đã bật, kèm
// campaign_id hiện tại. Dùng cho UI "gom vào chiến dịch cha" ở native-orders +
// live-chat (chung dữ liệu). Lấy live từ poller (server-side Pancake JWT).
router.get('/page-posts', requireWeb2AuthSoft, async (req, res) => {
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
        _notify('campaign', postId); // audit r9: SSE → tab khác cập nhật gán bài↔chiến dịch
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
        _notify('campaign', postId); // audit r9: SSE → tab khác cập nhật gỡ gán
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

// GET /poller-pages — list trang đang cấu hình. Soft-auth (audit LOW 2026-06-20):
// page_id/page_url livestream là cấu hình vận hành — gate đồng nhất với mutation.
router.get('/poller-pages', requireWeb2AuthSoft, async (req, res) => {
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
        _notify('saved', null); // audit r9: SSE → tab/máy khác đồng bộ danh sách "Lưu Live"
        res.json({ success: true });
    } catch (e) {
        console.error('[WEB2-LIVE-COMMENTS] saved add error:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// GET /saved/ids → { success, data: [customer_id, ...] }
router.get('/saved/ids', requireWeb2AuthSoft, async (req, res) => {
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
        _notify('saved', null); // audit r9: SSE → tab/máy khác đồng bộ "Lưu Live"
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
module.exports.markBoostAndPurge = markBoostAndPurge; // worker tăng comment nền dọn sau job
