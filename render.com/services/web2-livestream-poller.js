// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — server poller tự lấy comment livestream từ pancake.vn → web2_live_comments.
// =====================================================================
// web2-livestream-poller — chạy NỀN trên Render: định kỳ kiểm tra các trang
// đã bật, nếu trang đang livestream thì kéo TẤT CẢ comment (qua pancake.vn
// /api/v1 + account JWT — thấy cả comment ẩn / có SĐT, khác pages.fm public)
// và lưu vào web2_live_comments. Chạy CẢ KHI không có client mở live-chat.
//
// Config: bảng web2_live_poller_pages (seed 2 trang mặc định: NhiJudyHouse,
// NhiJudyStore). Thêm/bớt trang qua trang settings (sau).
//
// JWT: lấy account JWT từ bảng pancake_accounts (chatDb, synced từ client) —
// account nào admin trang đó + token còn hạn. Fallback env PANCAKE_JWT.
// =====================================================================

'use strict';

const PANCAKE_API = 'https://pancake.vn/api/v1';
const POLL_INTERVAL_MS = 30 * 1000; // 30s
const RECENT_LIVE_WINDOW_MS = 30 * 60 * 1000; // poll thêm 30' sau khi live kết thúc
const MAX_COMMENT_PAGES = 12; // tối đa trang phân trang comment/post mỗi cycle
const POSTS_LOOKBACK_S = 24 * 3600; // quét post 24h gần đây

const DEFAULT_PAGES = [
    {
        page_id: '117267091364524',
        page_name: 'NhiJudy House',
        page_url: 'https://www.facebook.com/NhiJudyHouse.VietNam',
    },
    {
        page_id: '270136663390370',
        page_name: 'NhiJudy Store',
        page_url: 'https://www.facebook.com/NhiJudyStore/',
    },
];

let _web2Pool = null;
let _chatPool = null;
let _liveComments = null; // web2-live-comments module (upsertComments + _notify)
let _timer = null;
let _running = false;

function _decodeExp(jwt) {
    try {
        const p = JSON.parse(Buffer.from(jwt.split('.')[1], 'base64').toString('utf8'));
        return Number(p.exp) || 0;
    } catch {
        return 0;
    }
}
function _jwtValid(jwt) {
    if (!jwt) return false;
    const exp = _decodeExp(jwt);
    return !exp || exp > Math.floor(Date.now() / 1000) + 60;
}

async function ensureConfigTable() {
    await _web2Pool.query(`
        CREATE TABLE IF NOT EXISTS web2_live_poller_pages (
            page_id    VARCHAR(50) PRIMARY KEY,
            page_name  VARCHAR(255),
            page_url   TEXT,
            enabled    BOOLEAN DEFAULT true,
            added_at   BIGINT
        );
    `);
    // Seed 2 trang mặc định (idempotent — không ghi đè enabled nếu đã có).
    const now = Date.now();
    for (const p of DEFAULT_PAGES) {
        await _web2Pool.query(
            `INSERT INTO web2_live_poller_pages (page_id, page_name, page_url, enabled, added_at)
             VALUES ($1,$2,$3,true,$4) ON CONFLICT (page_id) DO NOTHING`,
            [p.page_id, p.page_name, p.page_url, now]
        );
    }
}

async function getEnabledPages() {
    const r = await _web2Pool.query(
        'SELECT page_id, page_name FROM web2_live_poller_pages WHERE enabled = true'
    );
    return r.rows;
}

// Map pageId → account JWT (còn hạn) từ pancake_accounts; fallback env.
async function getTokenForPage(pageId) {
    try {
        const r = await _chatPool.query(
            'SELECT token, pages FROM pancake_accounts WHERE is_active = true'
        );
        for (const row of r.rows) {
            if (!_jwtValid(row.token)) continue;
            let pages = row.pages;
            if (typeof pages === 'string') {
                try {
                    pages = JSON.parse(pages);
                } catch {
                    pages = [];
                }
            }
            const ids = Array.isArray(pages)
                ? pages.map((p) => String(p.id || p.page_id || p)).filter(Boolean)
                : [];
            if (ids.includes(String(pageId))) return row.token;
        }
        // Không match page cụ thể → account còn hạn đầu tiên (đa số admin mọi page).
        const any = r.rows.find((row) => _jwtValid(row.token));
        if (any) return any.token;
    } catch (e) {
        console.warn('[LIVE-POLLER] getToken DB error:', e.message);
    }
    const env = process.env.PANCAKE_JWT;
    return _jwtValid(env) ? env : null;
}

async function _pfm(path, jwt) {
    const sep = path.includes('?') ? '&' : '?';
    const url = `${PANCAKE_API}/${path}${sep}access_token=${encodeURIComponent(jwt)}`;
    const r = await fetch(url, { headers: { Accept: 'application/json' } });
    return r.json().catch(() => ({}));
}

// Lấy livestream posts đang/ gần live của 1 page.
async function getActiveLivePosts(pageId, jwt) {
    const now = Math.floor(Date.now() / 1000);
    const d = await _pfm(
        `pages/${pageId}/posts?start_time=${now - POSTS_LOOKBACK_S}&end_time=${now}`,
        jwt
    );
    const posts = Array.isArray(d.posts) ? d.posts : Array.isArray(d.data) ? d.data : [];
    const out = [];
    for (const p of posts) {
        const isLive = p.type === 'livestream' || p.is_live_video || p.live_video_id;
        if (!isLive) continue;
        const insertedMs = p.inserted_at ? new Date(p.inserted_at).getTime() : 0;
        const living = p.live_status === 'LIVE' || p.is_living;
        const recent = insertedMs && Date.now() - insertedMs < RECENT_LIVE_WINDOW_MS;
        // Đang live HOẶC vừa kết thúc trong cửa sổ → poll (gom comment đuôi).
        if (living || recent) {
            out.push({ id: String(p.id), title: p.message || p.title || '(livestream)', living });
        }
    }
    return out;
}

// Kéo toàn bộ comment của 1 post (phân trang + dedupe).
async function fetchPostComments(pageId, pageName, postId, jwt) {
    const now = Math.floor(Date.now() / 1000);
    const seen = new Set();
    const comments = [];
    for (let pageNum = 1; pageNum <= MAX_COMMENT_PAGES; pageNum++) {
        const d = await _pfm(
            `pages/${pageId}/conversations?type=COMMENT&since=${now - POSTS_LOOKBACK_S}&until=${now}&post_id=${encodeURIComponent(postId)}&page_number=${pageNum}`,
            jwt
        );
        const cv = Array.isArray(d.conversations)
            ? d.conversations
            : Array.isArray(d.data)
              ? d.data
              : [];
        if (!cv.length) break;
        let matched = 0;
        let added = 0;
        for (const c of cv) {
            if (String(c.post_id) !== String(postId)) continue;
            matched++;
            const id = c.id || c.thread_id || c.thread_key;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            const from = c.from || (Array.isArray(c.customers) && c.customers[0]) || {};
            const phoneObj = Array.isArray(c.recent_phone_numbers)
                ? c.recent_phone_numbers[0]
                : null;
            comments.push({
                id: String(id),
                postId: String(postId),
                pageId: String(pageId),
                pageName,
                fbId: from.id || from.fb_id || c.from_psid || null,
                name: from.name || '',
                message: c.snippet || c.last_sent_message || '',
                createdTime: c.inserted_at || c.last_customer_interactive_at || null,
                phone: phoneObj ? phoneObj.phone_number || phoneObj.phone || null : null,
                hasOrder: !!c.has_livestream_order,
            });
            added++;
        }
        if (cv.length < 20) break;
        if (matched > 0 && added === 0) break; // trang lặp
    }
    return comments;
}

async function _cycle() {
    if (_running) return;
    _running = true;
    try {
        const pages = await getEnabledPages();
        for (const pg of pages) {
            const jwt = await getTokenForPage(pg.page_id);
            if (!jwt) {
                console.warn(`[LIVE-POLLER] no valid JWT for page ${pg.page_id} — skip`);
                continue;
            }
            let livePosts = [];
            try {
                livePosts = await getActiveLivePosts(pg.page_id, jwt);
            } catch (e) {
                console.warn(`[LIVE-POLLER] posts fail ${pg.page_id}:`, e.message);
                continue;
            }
            if (!livePosts.length) continue; // page không live → bỏ qua (không tốn)
            for (const lp of livePosts) {
                try {
                    const comments = await fetchPostComments(pg.page_id, pg.page_name, lp.id, jwt);
                    if (comments.length) {
                        const saved = await _liveComments.upsertComments(_web2Pool, comments);
                        _liveComments._notify('poll', lp.id);
                        console.log(
                            `[LIVE-POLLER] ${pg.page_name} post ${lp.id} (${lp.living ? 'LIVE' : 'recent'}) → ${comments.length} fetched, ${saved} saved`
                        );
                    }
                } catch (e) {
                    console.warn(`[LIVE-POLLER] comments fail ${lp.id}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error('[LIVE-POLLER] cycle error:', e.message);
    } finally {
        _running = false;
    }
}

function start({ web2Pool, chatPool, liveCommentsModule }) {
    _web2Pool = web2Pool;
    _chatPool = chatPool;
    _liveComments = liveCommentsModule;
    if (!_web2Pool || !_liveComments) {
        console.warn('[LIVE-POLLER] missing deps — not started');
        return;
    }
    if (_timer) return;
    ensureConfigTable()
        .then(() => {
            _timer = setInterval(_cycle, POLL_INTERVAL_MS);
            console.log(
                `[LIVE-POLLER] started — poll mỗi ${POLL_INTERVAL_MS / 1000}s, ${DEFAULT_PAGES.length} trang mặc định`
            );
            _cycle(); // chạy ngay 1 lần
        })
        .catch((e) => console.error('[LIVE-POLLER] init fail:', e.message));
}

module.exports = { start };
