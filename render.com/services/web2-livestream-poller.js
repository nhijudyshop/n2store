// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — server poller tự lấy comment livestream từ pancake.vn → web2_live_comments.
// =====================================================================
// web2-livestream-poller — EVENT-DRIVEN fetcher (background poll ĐÃ TẮT
// 2026-06-11, user: "bỏ hoàn toàn polling ở live-chat").
//
// Luồng PUSH-only: relay Pancake WS (live-chat/server, 24/7) nhận event comment
// → POST /api/web2-live-comments/ingest → pollPostNow(page,post) fetch
// per-message ĐÚNG post đó (qua pancake.vn /api/v1 + account JWT — thấy cả
// comment ẩn / có SĐT) → upsert web2_live_comments → SSE web2:live-comments.
// Client mở campaign → POST /poll-now (one-shot warm-up, không phải polling).
// `pollNow()` (full cycle on-demand) vẫn dùng được cho lookup KH tier-3.
//
// Config: bảng web2_live_poller_pages (seed 2 trang mặc định: NhiJudyHouse,
// NhiJudyStore). Thêm/bớt trang qua trang settings (sau).
//
// JWT: lấy account JWT từ bảng pancake_accounts (chatDb, synced từ client) —
// account nào admin trang đó + token còn hạn. Fallback env PANCAKE_JWT.
// =====================================================================

'use strict';

const PANCAKE_API = 'https://pancake.vn/api/v1';
// Adaptive poll: ngắn khi có bài ĐANG LIVE (gần realtime), dài khi không.
const POLL_INTERVAL_LIVE_MS = 5 * 1000; // có ≥1 bài đang LIVE → 5s (gần realtime)
const POLL_INTERVAL_IDLE_MS = 30 * 1000; // không bài nào live → 30s (tiết kiệm)
const RECENT_LIVE_WINDOW_MS = 30 * 60 * 1000; // poll thêm 30' sau khi live kết thúc
const MAX_COMMENT_PAGES = 50; // cap CỨNG số trang phân trang/post mỗi cycle (an toàn)
const COMMENTS_PER_PAGE = 20; // Pancake trả ~20 conversation/trang (heuristic has_more)
const POSTS_LOOKBACK_S = 24 * 3600; // quét post 24h gần đây
const MSG_CONCURRENCY = 4; // số conversation fetch messages song song
// Watermark theo conversation: convId → last activity stamp. Conversation KHÔNG
// đổi (không comment mới) → bỏ qua fetch messages (tiết kiệm N call/cycle). Cap để
// không phình RAM giữa nhiều livestream.
const _convWatermark = new Map();
const CONV_WATERMARK_MAX = 5000;
function _wmGet(convId) {
    return _convWatermark.get(convId);
}
function _wmSet(convId, stamp) {
    if (_convWatermark.size > CONV_WATERMARK_MAX) {
        // xoá 1/2 entry cũ nhất (Map giữ thứ tự insert)
        let n = Math.floor(CONV_WATERMARK_MAX / 2);
        for (const k of _convWatermark.keys()) {
            _convWatermark.delete(k);
            if (--n <= 0) break;
        }
    }
    _convWatermark.set(convId, stamp);
}

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
let _started = false; // đã wire setTimeout-loop chưa (thay vai trò _timer cũ)
let _hadLiveLastCycle = false; // có bài LIVE ở cycle vừa rồi → quyết interval kế tiếp

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

// Trích SĐT VN từ text comment (khách tự gõ "0766..." / "+84..." khi live).
function extractPhoneFromText(text) {
    if (!text) return null;
    const cleaned = String(text).replace(/[.\s()\-_]/g, '');
    const m = cleaned.match(/(?:\+?84|0)(\d{9})(?!\d)/);
    if (!m) return null;
    return '0' + m[1];
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
// 1. Liệt kê các conversation COMMENT của 1 post (mỗi conversation = 1 thread
//    của 1 khách trên post đó). KHÔNG còn coi conversation = 1 comment.
async function _listPostConversations(pageId, postId, jwt) {
    const now = Math.floor(Date.now() / 1000);
    const seen = new Set();
    const convs = [];
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
        const apiHasMore =
            typeof d.has_more === 'boolean'
                ? d.has_more
                : typeof d.total_pages === 'number'
                  ? pageNum < d.total_pages
                  : null;
        let matched = 0;
        let added = 0;
        for (const c of cv) {
            if (String(c.post_id) !== String(postId)) continue;
            matched++;
            const id = c.id || c.thread_id || c.thread_key;
            if (!id || seen.has(id)) continue;
            seen.add(id);
            convs.push(c);
            added++;
        }
        if (apiHasMore === false) break;
        if (apiHasMore === null && cv.length < COMMENTS_PER_PAGE) break;
        if (matched > 0 && added === 0) break;
    }
    return convs;
}

// 2. Fetch TỪNG comment (message type=COMMENT) trong 1 conversation. Mỗi message
//    = 1 dòng riêng (giống TPOS) → người comment liên tục KHÔNG bị đè. id duy nhất
//    = `${postId}_${messageId}`.
async function _fetchConversationComments(pageId, pageName, postId, conv, jwt) {
    const convId = conv.id || conv.thread_id || conv.thread_key;
    if (!convId) return [];
    const cust = (Array.isArray(conv.customers) && conv.customers[0]) || {};
    const custUuid = cust.id || null;
    const convAvatar =
        cust.avatar ||
        cust.picture?.data?.url ||
        cust.profile_pic ||
        cust.image_url ||
        conv.from?.avatar ||
        conv.from?.picture?.data?.url ||
        null;
    let d;
    try {
        const cidParam = custUuid ? `?customer_id=${encodeURIComponent(custUuid)}` : '';
        d = await _pfm(
            `pages/${pageId}/conversations/${encodeURIComponent(convId)}/messages${cidParam}`,
            jwt
        );
    } catch {
        return [];
    }
    const msgs = Array.isArray(d.messages) ? d.messages : [];
    const out = [];
    for (const m of msgs) {
        // Chỉ lấy COMMENT (bỏ INBOX); bỏ comment đã xoá. Comment ẩn vẫn lấy (đánh dấu).
        if (m.type && String(m.type).toUpperCase() !== 'COMMENT') continue;
        if (m.is_removed) continue;
        const mid = m.id;
        if (!mid) continue;
        const text = m.original_message || m.message || '';
        const phoneInfo = Array.isArray(m.phone_info) ? m.phone_info[0] : null;
        out.push({
            id: `${postId}_${mid}`,
            postId: String(postId),
            pageId: String(pageId),
            pageName,
            fbId: m.from?.id || cust.fb_id || conv.from?.id || null,
            _custUuid: custUuid,
            name: m.from?.name || cust.name || conv.from?.name || '',
            avatar: convAvatar,
            message: text,
            createdTime: m.inserted_at || conv.inserted_at || null,
            phone:
                (phoneInfo ? phoneInfo.phone_number || phoneInfo.phone || null : null) ||
                extractPhoneFromText(text),
            hasOrder: !!conv.has_livestream_order,
            isHidden: !!m.is_hidden,
        });
    }
    return out;
}

// Kéo toàn bộ comment (per-message) của 1 post. Watermark conversation: bỏ qua
// conversation không có hoạt động mới kể từ cycle trước (tiết kiệm message-fetch).
async function fetchPostComments(pageId, pageName, postId, jwt) {
    const convs = await _listPostConversations(pageId, postId, jwt);
    // Lọc conversation cần fetch messages: mới / có activity đổi so với watermark.
    const toFetch = [];
    for (const c of convs) {
        const cid = String(c.id || c.thread_id || c.thread_key || '');
        if (!cid) continue;
        const stamp = String(
            c.updated_at || c.last_sent_at || c.last_customer_interactive_at || c.inserted_at || ''
        );
        const prev = _wmGet(cid);
        if (prev !== undefined && prev === stamp) continue; // không đổi → bỏ qua
        _wmSet(cid, stamp);
        toFetch.push(c);
    }
    const comments = [];
    for (let i = 0; i < toFetch.length; i += MSG_CONCURRENCY) {
        const batch = toFetch.slice(i, i + MSG_CONCURRENCY);
        const res = await Promise.all(
            batch.map((c) => _fetchConversationComments(pageId, pageName, postId, c, jwt))
        );
        for (const rows of res) if (rows && rows.length) comments.push(...rows);
    }
    // Enrich SĐT từ CUSTOMER PROFILE Pancake (comment ~0% có SĐT inline, nhưng
    // profile customer có ~88% — recent_phone_numbers lưu từ order/chat cũ).
    await _enrichPhonesFromProfile(pageId, comments, jwt);
    return comments;
}

// Cache SĐT theo customer UUID (TTL 6h) — tránh fetch lại mỗi cycle. Cache PROMISE
// (không phải value) để 2 fetch concurrent cùng uuid share 1 request (chống race).
const _custPhoneCache = new Map(); // uuid → { promise, ts }
const CUST_PHONE_TTL_MS = 6 * 3600 * 1000;
const PHONE_FETCH_CONCURRENCY = 4;

async function _doFetchCustomerPhone(pageId, uuid, jwt) {
    let phone = null;
    try {
        const d = await _pfm(`pages/${pageId}/customers/${encodeURIComponent(uuid)}`, jwt);
        const c = d.customer || d.data || d || {};
        const arr = c.recent_phone_numbers;
        if (Array.isArray(arr) && arr.length) {
            const p = arr[0];
            phone = (typeof p === 'string' ? p : p.phone_number || p.phone || p.captured) || null;
        }
    } catch (_) {
        /* bỏ qua */
    }
    return phone;
}

function _fetchCustomerPhone(pageId, uuid, jwt) {
    const cached = _custPhoneCache.get(uuid);
    if (cached && Date.now() - cached.ts < CUST_PHONE_TTL_MS) return cached.promise;
    const promise = _doFetchCustomerPhone(pageId, uuid, jwt);
    _custPhoneCache.set(uuid, { promise, ts: Date.now() });
    return promise;
}

async function _enrichPhonesFromProfile(pageId, comments, jwt) {
    // Chỉ enrich comment CHƯA có phone + có customer UUID.
    const need = comments.filter((c) => !c.phone && c._custUuid);
    const uuids = [...new Set(need.map((c) => c._custUuid))];
    const phoneByUuid = {};
    for (let i = 0; i < uuids.length; i += PHONE_FETCH_CONCURRENCY) {
        const batch = uuids.slice(i, i + PHONE_FETCH_CONCURRENCY);
        const res = await Promise.all(batch.map((u) => _fetchCustomerPhone(pageId, u, jwt)));
        batch.forEach((u, k) => {
            if (res[k]) phoneByUuid[u] = res[k];
        });
    }
    for (const c of need) {
        if (phoneByUuid[c._custUuid]) c.phone = phoneByUuid[c._custUuid];
    }
}

// Chạy 1 cycle. Trả về true nếu có ÍT NHẤT 1 bài đang LIVE (status live, không
// phải đã kết thúc) — dùng để chọn interval cho cycle kế tiếp (adaptive poll).
async function _cycle() {
    if (_running) return _hadLiveLastCycle;
    _running = true;
    let anyLive = false;
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
                if (lp.living) anyLive = true; // có bài đang LIVE thật → poll nhanh
                try {
                    const comments = await fetchPostComments(pg.page_id, pg.page_name, lp.id, jwt);
                    if (comments.length) {
                        const saved = await _liveComments.upsertComments(_web2Pool, comments);
                        // Broadcast SSE web2:live-comments → tab live-chat reload từ DB.
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
        _hadLiveLastCycle = anyLive;
    }
    return anyLive;
}

// Loop đệ quy bằng setTimeout (KHÔNG setInterval) để đổi interval ĐỘNG sau mỗi
// cycle: có bài LIVE → 5s (gần realtime), không → 30s. _running guard trong
// _cycle chống overlap; setTimeout chỉ schedule cycle kế sau khi cycle này xong.
function _scheduleNext(hadLive) {
    if (!_started) return;
    const interval = hadLive ? POLL_INTERVAL_LIVE_MS : POLL_INTERVAL_IDLE_MS;
    _timer = setTimeout(_loop, interval);
}

async function _loop() {
    const hadLive = await _cycle();
    _scheduleNext(hadLive);
}

function start({ web2Pool, chatPool, liveCommentsModule }) {
    _web2Pool = web2Pool;
    _chatPool = chatPool;
    _liveComments = liveCommentsModule;
    if (!_web2Pool || !_liveComments) {
        console.warn('[LIVE-POLLER] missing deps — not started');
        return;
    }
    if (_started) return;
    _started = true;
    // BACKGROUND POLL ĐÃ TẮT (user 2026-06-11: "bỏ hoàn toàn polling ở live-chat").
    // Comment livestream giờ là PUSH-only: relay Pancake WS (live-chat/server)
    // nhận event 24/7 → POST /ingest → pollPostNow(page,post) fetch per-message
    // ĐÚNG post có comment mới (event-driven, debounce 1.5s) → upsert + SSE.
    // start() chỉ init deps (pools + config table) cho pollPostNow/pollNow/
    // listLivePostsForAssign hoạt động — KHÔNG schedule _loop() cycle nữa.
    ensureConfigTable()
        .then(() => {
            console.log(
                '[LIVE-POLLER] deps ready — background poll DISABLED, event-driven only (WS relay → pollPostNow)'
            );
        })
        .catch((e) => {
            _started = false;
            console.error('[LIVE-POLLER] init fail:', e.message);
        });
}

// Danh sách TẤT CẢ bài livestream gần đây (14 ngày) của các page đã bật — cho
// UI "gom vào chiến dịch cha" (native-orders + live-chat dùng chung). Khác
// getActiveLivePosts (chỉ living/recent) — đây lấy cả bài đã end để gom.
const ASSIGN_LOOKBACK_S = 14 * 24 * 3600;
async function listLivePostsForAssign() {
    if (!_web2Pool || !_chatPool) return [];
    const pages = await getEnabledPages();
    const now = Math.floor(Date.now() / 1000);
    const out = [];
    for (const pg of pages) {
        const jwt = await getTokenForPage(pg.page_id);
        if (!jwt) continue;
        try {
            const d = await _pfm(
                `pages/${pg.page_id}/posts?start_time=${now - ASSIGN_LOOKBACK_S}&end_time=${now}`,
                jwt
            );
            const posts = Array.isArray(d.posts) ? d.posts : Array.isArray(d.data) ? d.data : [];
            for (const p of posts) {
                const isLive = p.type === 'livestream' || p.is_live_video || p.live_video_id;
                if (!isLive) continue;
                out.push({
                    postId: String(p.id),
                    title: p.message || p.title || '(livestream)',
                    pageId: String(pg.page_id),
                    pageName: pg.page_name || '',
                    date: p.inserted_at || p.created_time || null,
                    living: p.live_status === 'LIVE' || !!p.is_living,
                });
            }
        } catch (e) {
            console.warn('[LIVE-POLLER] listLivePostsForAssign fail', pg.page_id, e.message);
        }
    }
    out.sort(
        (a, b) => (new Date(b.date || 0).getTime() || 0) - (new Date(a.date || 0).getTime() || 0)
    );
    return out;
}

// On-demand: chạy NGAY 1 cycle (fetch comment các bài đang/ vừa live → upsert
// web2_live_comments) rồi resolve. Dùng cho tier-3 "live fetch" của lookup KH:
// chỉ giúp khi KH đang comment ở livestream HIỆN TẠI (chưa kịp poll 30s).
// Trả { ok, ran } — ran=false nếu chưa start (thiếu deps).
async function pollNow() {
    if (!_web2Pool || !_liveComments) return { ok: false, ran: false };
    try {
        await _cycle();
        return { ok: true, ran: true };
    } catch (e) {
        console.warn('[LIVE-POLLER] pollNow fail:', e.message);
        return { ok: false, ran: true, error: e.message };
    }
}

// On-demand TARGETED: fetch comment per-message của ĐÚNG 1 post (page+post) →
// upsert + notify. Dùng cho:
//  • WS relay /ingest: có comment realtime đến → poll ngay post đó (gần-tức-thời).
//  • Client mở campaign: poll ngay để comment hiện liền (không chờ cycle 5s).
// Debounce 1.5s/post: gom burst WS event (nhiều comment liên tiếp) thành 1 fetch.
const _pollPostTimers = new Map(); // `${pageId}:${postId}` → { timer, pending }
const POLL_POST_DEBOUNCE_MS = 1500;
async function _doPollPost(pageId, postId) {
    if (!_web2Pool || !_liveComments) return { ok: false, ran: false };
    try {
        const jwt = await getTokenForPage(pageId);
        if (!jwt) return { ok: false, ran: false, error: 'no jwt' };
        // pageName best-effort từ enabled pages (không bắt buộc).
        let pageName = '';
        try {
            const pgs = await getEnabledPages();
            pageName = pgs.find((p) => String(p.page_id) === String(pageId))?.page_name || '';
        } catch (_) {
            /* ignore */
        }
        const comments = await fetchPostComments(pageId, pageName, String(postId), jwt);
        let saved = 0;
        if (comments.length) {
            saved = await _liveComments.upsertComments(_web2Pool, comments);
            _liveComments._notify('poll', String(postId));
        }
        return { ok: true, ran: true, fetched: comments.length, saved };
    } catch (e) {
        console.warn('[LIVE-POLLER] pollPostNow fail:', e.message);
        return { ok: false, ran: true, error: e.message };
    }
}
function pollPostNow(pageId, postId, { immediate = false } = {}) {
    if (!pageId || !postId) return Promise.resolve({ ok: false, ran: false });
    if (immediate) return _doPollPost(pageId, postId);
    const key = `${pageId}:${postId}`;
    return new Promise((resolve) => {
        const existing = _pollPostTimers.get(key);
        if (existing) {
            existing.waiters.push(resolve);
            return;
        }
        const entry = { timer: null, waiters: [resolve] };
        entry.timer = setTimeout(async () => {
            _pollPostTimers.delete(key);
            const r = await _doPollPost(pageId, postId);
            entry.waiters.forEach((w) => w(r));
        }, POLL_POST_DEBOUNCE_MS);
        _pollPostTimers.set(key, entry);
    });
}

module.exports = { start, listLivePostsForAssign, pollNow, pollPostNow };
