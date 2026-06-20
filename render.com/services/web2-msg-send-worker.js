// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
// =====================================================
// Web 2.0 — Bulk FB Message Send WORKER (server-side background)
// =====================================================
//
// Tiêu thụ web2_msg_send_items (state='pending') → gửi qua Pancake API ĐA-ACCOUNT
// SONG SONG. Mỗi page có thể được nhiều account Pancake quản lý → thử lần lượt
// account khác (rotation) khi token/permission lỗi. Lỗi 24h (e_code 10 /
// e_subcode 2018278) → KHÔNG xoay account được (chỉ extension bypass nổi) →
// đánh dấu 'needs_extension' để client drain qua browser extension.
//
// Pools (CROSS-POOL — đã research, chấp nhận):
//   - web2Db  : web2_msg_send_jobs / _items  (require('../db/web2-pool'))
//   - chatDb  : pancake_accounts (READ), pancake_page_access_tokens (READ + WRITE)
//             ↑ Web 1.0 shared Pancake creds. _mintPAT GHI vào pancake_page_access_tokens
//               (ON CONFLICT page_id DO UPDATE) — đồng nhất với 6h refresh cron, an toàn
//               ghi đồng thời nhờ upsert. Đây là ngoại lệ Web2⊥Web1 cho creds dùng chung.
//
// Loop pattern: copy aikol-queue-worker (FOR UPDATE SKIP LOCKED claim, stuck
// recovery, setInterval + unref). Counters + SSE qua route._recomputeAndNotify.
//
// Tắt: env WEB2_MSG_WORKER_DISABLED=1.

'use strict';

const web2Pool = require('../db/web2-pool'); // job/items (null nếu env unset)
const chatPool = require('../db/pool'); // pancake creds (Web 1.0 shared)
const jobRoute = require('./../routes/web2-msg-send'); // _recomputeAndNotify

const JOB_POOL = web2Pool || chatPool;

const WORKER_URL = process.env.CF_WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
const TICK_INTERVAL_MS = parseInt(process.env.WEB2_MSG_WORKER_INTERVAL_MS, 10) || 4000;
const MAX_CONCURRENT = parseInt(process.env.WEB2_MSG_WORKER_CONCURRENCY, 10) || 8;
const MAX_RATELIMIT_RETRY = 4;
const SENDING_STUCK_MS = 90 * 1000;
const EXT_INFLIGHT_STUCK_MS = 5 * 60 * 1000;
const FETCH_TIMEOUT_MS = 12000;
const PAT_MEM_TTL_MS = 30 * 60 * 1000; // PAT là JWT sống vài giờ — cache mềm 30'
const ACCOUNTS_TTL_MS = 60 * 1000;

let intervalHandle = null;
let _ticking = false;
const inFlight = new Set();

// ─── Caches ────────────────────────────────────────────────────────
const _patMem = new Map(); // pageId → { pat, ts }
let _accountsCache = { ts: 0, list: [] };
const _recomputeTimers = new Map(); // jobId → timeout (debounce SSE)

// Cache template_name + created_by per job (tránh query lặp mỗi item).
const _jobMetaCache = new Map(); // job_id → { templateName, createdBy }

// Chống memory creep trên process sống lâu: prune _patMem hết hạn + cap _jobMetaCache.
const JOB_META_CACHE_MAX = 500;
function _pruneCaches() {
    const now = Date.now();
    for (const [pageId, v] of _patMem) {
        if (!v || now - v.ts >= PAT_MEM_TTL_MS) _patMem.delete(pageId);
    }
    // Map giữ thứ tự insert → xoá entry cũ nhất khi vượt cap (FIFO đơn giản).
    while (_jobMetaCache.size > JOB_META_CACHE_MAX) {
        const oldest = _jobMetaCache.keys().next().value;
        if (oldest === undefined) break;
        _jobMetaCache.delete(oldest);
    }
}

// ─── HTTP helper với timeout ───────────────────────────────────────
async function _fetchJson(url, init) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, { ...init, signal: ctrl.signal });
        const text = await r.text();
        let data = null;
        try {
            data = text ? JSON.parse(text) : null;
        } catch {
            /* not json */
        }
        return { httpOk: r.ok, status: r.status, data, text };
    } finally {
        clearTimeout(t);
    }
}

// ─── Pancake accounts (chatDb, shared) ─────────────────────────────
function _normalizePages(pages) {
    if (Array.isArray(pages)) return pages;
    if (typeof pages === 'string') {
        try {
            return JSON.parse(pages) || [];
        } catch {
            return [];
        }
    }
    return [];
}

async function _getAccounts() {
    const now = Date.now();
    if (_accountsCache.list.length && now - _accountsCache.ts < ACCOUNTS_TTL_MS) {
        return _accountsCache.list;
    }
    const nowSec = Math.floor(now / 1000);
    const { rows } = await chatPool.query(
        `SELECT account_id, token, token_exp, pages
         FROM pancake_accounts
         WHERE is_active = true
           AND token IS NOT NULL
           AND (token_exp IS NULL OR token_exp::bigint > $1)
         ORDER BY last_used_at DESC NULLS LAST`,
        [nowSec]
    );
    const list = rows.map((r) => ({
        accountId: r.account_id,
        token: r.token,
        pages: _normalizePages(r.pages).map((p) => String(p.id || p.pageId || p)),
    }));
    _accountsCache = { ts: now, list };
    return list;
}

// Accounts có thể quản page này (pages chứa pageId). Không match → trả hết
// (best-effort: 1 trong số đó có thể vẫn sinh được PAT).
async function _accountsForPage(pageId) {
    const all = await _getAccounts();
    const own = all.filter((a) => a.pages.includes(String(pageId)));
    return own.length ? own : all;
}

// ─── Page Access Token: cache mem → chatDb → mint qua CF worker ────
async function _getCachedPAT(pageId) {
    const mem = _patMem.get(pageId);
    if (mem && Date.now() - mem.ts < PAT_MEM_TTL_MS) return mem.pat;
    try {
        const { rows } = await chatPool.query(
            `SELECT token FROM pancake_page_access_tokens WHERE page_id = $1`,
            [pageId]
        );
        if (rows.length && rows[0].token) {
            _patMem.set(pageId, { pat: rows[0].token, ts: Date.now() });
            return rows[0].token;
        }
    } catch (e) {
        console.warn('[WEB2-MSG-WORKER] read PAT failed:', e.message);
    }
    return null;
}

// Xoá PAT khỏi cache mem khi send lỗi token/permission — tránh "PAT poisoning"
// (PAT vừa mint nhưng thiếu quyền page bị cache 30' khiến mọi item sau cùng fail).
// Chỉ xoá cache mem; bản chatDb để 6h-refresh-cron / lần mint kế ghi đè.
function _invalidatePAT(pageId) {
    _patMem.delete(pageId);
}

async function _mintPAT(pageId, accountToken) {
    const url = `${WORKER_URL}/api/pancake/pages/${encodeURIComponent(
        pageId
    )}/generate_page_access_token?access_token=${encodeURIComponent(accountToken)}`;
    const { data } = await _fetchJson(url, {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    });
    const pat = data?.page_access_token || data?.token || null;
    if (!pat) return null;
    _patMem.set(pageId, { pat, ts: Date.now() });
    // Persist vào chatDb (chia chung với web 1.0) — best-effort.
    try {
        await chatPool.query(
            `INSERT INTO pancake_page_access_tokens (page_id, token, saved_at, generated_by, updated_at)
             VALUES ($1, $2, $3, 'web2-msg-send', NOW())
             ON CONFLICT (page_id) DO UPDATE
               SET token = EXCLUDED.token, saved_at = EXCLUDED.saved_at,
                   generated_by = 'web2-msg-send', updated_at = NOW()`,
            [pageId, pat, Date.now()]
        );
    } catch (e) {
        console.warn('[WEB2-MSG-WORKER] persist PAT failed:', e.message);
    }
    return pat;
}

// ─── Send 1 message qua Pancake official API ───────────────────────
async function _sendPancake(pageId, convId, customerId, message, pat, cliMsgId) {
    const url = `${WORKER_URL}/api/pancake-official/pages/${encodeURIComponent(
        pageId
    )}/conversations/${encodeURIComponent(convId)}/messages?page_access_token=${encodeURIComponent(
        pat
    )}`;
    const payload = { action: 'reply_inbox', message, conversation_id: convId };
    if (customerId) payload.customer_id = customerId;
    // AUDIT 2026-06-20 #21: idempotency key ổn định (= item.id) để retry proxy/recover
    // không sinh tin trùng cho khách (Pancake/worker có thể dedupe theo field này).
    if (cliMsgId) payload.client_message_id = String(cliMsgId);
    const { httpOk, status, data, text } = await _fetchJson(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
    if (!httpOk) {
        return {
            ok: false,
            transient: status >= 500,
            reason: `HTTP ${status}: ${(text || '').slice(0, 120)}`,
        };
    }
    // Pancake trả 200 + success:false cho lỗi FB.
    if (data && data.success === false) {
        return {
            ok: false,
            eCode: data.e_code != null ? Number(data.e_code) : null,
            eSubcode: data.e_subcode != null ? Number(data.e_subcode) : null,
            reason: data.message || (data.e_code != null ? `FB error #${data.e_code}` : 'unknown'),
        };
    }
    return { ok: true };
}

function _is24hError(eCode, eSubcode) {
    // 24h policy: e_code 10 / e_subcode 2018278. e_code 10 nói chung = ngoài cửa sổ.
    return eCode === 10 || eSubcode === 2018278;
}
function _isRateLimit(eSubcode) {
    return eSubcode === 3252001;
}

// ─── Xử lý 1 item: Pancake API + account rotation ─────────────────
async function _processItem(item) {
    const {
        id,
        page_id: pageId,
        conv_id: convId,
        customer_id: customerId,
        message,
        attempts,
    } = item;
    if (!pageId || !convId || !message) {
        return _finishItem(item, 'error', { error: 'missing pageId/convId/message' });
    }

    // 1. PAT sẵn có (cache/db) → thử gửi.
    let pat = await _getCachedPAT(pageId);
    let last = null;
    if (pat) {
        last = await _sendPancake(pageId, convId, customerId, message, pat, item.id);
        if (last.ok) return _finishItem(item, 'done', { via: 'pancake' });
        if (_is24hError(last.eCode, last.eSubcode)) {
            return _finishItem(item, 'needs_extension', _errFields(last));
        }
        if (_isRateLimit(last.eSubcode)) {
            return _maybeRetryOrExt(item, last);
        }
        // token/permission/unknown → PAT cache có thể đã hỏng → xoá rồi xoay account.
        _invalidatePAT(pageId);
    }

    // 2. Account rotation: mint PAT mới từ từng account quản page này, thử lại.
    const accounts = await _accountsForPage(pageId);
    for (const acc of accounts) {
        let fresh;
        try {
            fresh = await _mintPAT(pageId, acc.token);
        } catch (e) {
            continue;
        }
        if (!fresh || fresh === pat) continue;
        pat = fresh;
        const r = await _sendPancake(pageId, convId, customerId, message, pat, item.id);
        last = r;
        if (r.ok) return _finishItem(item, 'done', { via: 'pancake' });
        if (_is24hError(r.eCode, r.eSubcode)) {
            return _finishItem(item, 'needs_extension', _errFields(r));
        }
        if (_isRateLimit(r.eSubcode)) {
            return _maybeRetryOrExt(item, r);
        }
        // PAT vừa mint nhưng send lỗi token/permission → xoá cache, thử account khác.
        _invalidatePAT(pageId);
        // tiếp account khác
    }

    // 3. Hết account vẫn lỗi → mặc định đẩy sang extension (user: "có lỗi thì
    //    cứ gửi qua extension"). Extension bypass 24h + dùng phiên FB trình duyệt.
    return _finishItem(item, 'needs_extension', _errFields(last || { reason: 'pancake_failed' }));
}

function _errFields(r) {
    return { eCode: r.eCode ?? null, eSubcode: r.eSubcode ?? null, error: r.reason || null };
}

async function _maybeRetryOrExt(item, r) {
    if ((item.attempts || 0) < MAX_RATELIMIT_RETRY) {
        // Quay lại 'pending' để tick sau gửi lại (giãn cách tự nhiên theo tick).
        await JOB_POOL.query(
            `UPDATE web2_msg_send_items SET state='pending', error=$2, updated_at=NOW() WHERE id=$1`,
            [item.id, 'rate-limited, retrying']
        );
        _scheduleRecompute(item.job_id);
        return;
    }
    return _finishItem(item, 'needs_extension', _errFields(r));
}

async function _finishItem(item, state, fields = {}) {
    await JOB_POOL.query(
        `UPDATE web2_msg_send_items
         SET state=$2, via=COALESCE($3, via), e_code=$4, e_subcode=$5, error=$6, updated_at=NOW()
         WHERE id=$1`,
        [
            item.id,
            state,
            fields.via || null,
            fields.eCode ?? null,
            fields.eSubcode ?? null,
            fields.error || null,
        ]
    );
    // KPI: gửi "Chốt đơn" thành công → khóa base cho đơn livestream của khách này.
    if (state === 'done' && item.fb_user_id) {
        _maybeSnapshotKpiBase(item).catch((e) =>
            console.warn('[WEB2-MSG-WORKER] kpi base snapshot failed:', e.message)
        );
    }
    _scheduleRecompute(item.job_id);
}

async function _getJobMeta(jobId) {
    if (_jobMetaCache.has(jobId)) return _jobMetaCache.get(jobId);
    const r = await JOB_POOL.query(
        `SELECT template_name, created_by FROM web2_msg_send_jobs WHERE id=$1`,
        [jobId]
    );
    const meta = {
        templateName: r.rows[0]?.template_name || '',
        createdBy: r.rows[0]?.created_by || null,
    };
    _jobMetaCache.set(jobId, meta);
    return meta;
}

// Chỉ khóa base khi template là "Chốt đơn" (normalize bỏ dấu để khớp linh hoạt).
function _isChotDonTemplate(name) {
    if (!name) return false;
    const n = String(name)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd')
        .toLowerCase();
    return n.includes('chot don');
}

async function _maybeSnapshotKpiBase(item) {
    const meta = await _getJobMeta(item.job_id);
    if (!_isChotDonTemplate(meta.templateName)) return;
    const nativeOrders = require('../routes/native-orders');
    if (typeof nativeOrders.snapshotKpiBase !== 'function') return;
    await nativeOrders.snapshotKpiBase(JOB_POOL, {
        fbUserId: item.fb_user_id,
        byName: meta.createdBy,
    });
}

// Debounce SSE recompute per job (gom burst nhiều item cùng job).
function _scheduleRecompute(jobId) {
    if (_recomputeTimers.has(jobId)) return;
    const t = setTimeout(async () => {
        _recomputeTimers.delete(jobId);
        try {
            await jobRoute._recomputeAndNotify(JOB_POOL, jobId);
        } catch (e) {
            console.warn('[WEB2-MSG-WORKER] recompute failed:', e.message);
        }
    }, 500);
    t.unref?.();
    _recomputeTimers.set(jobId, t);
}

// ─── Claim pending items ───────────────────────────────────────────
async function _claimPending(limit) {
    if (limit <= 0) return [];
    const { rows } = await JOB_POOL.query(
        `WITH nx AS (
             SELECT id FROM web2_msg_send_items
             WHERE state = 'pending'
             ORDER BY created_at ASC
             LIMIT $1
             FOR UPDATE SKIP LOCKED
         )
         UPDATE web2_msg_send_items it
         SET state='sending', attempts = it.attempts + 1, updated_at=NOW()
         FROM nx
         WHERE it.id = nx.id AND it.state='pending'
         RETURNING it.id, it.job_id, it.page_id, it.conv_id, it.customer_id, it.message, it.attempts, it.fb_user_id`,
        [limit]
    );
    return rows;
}

// ─── Recovery: stuck 'sending' / 'ext_inflight' ────────────────────
async function _recoverStuck() {
    const sStuck = await JOB_POOL.query(
        `UPDATE web2_msg_send_items SET state='pending', updated_at=NOW()
         WHERE state='sending' AND updated_at < NOW() - INTERVAL '${Math.floor(
             SENDING_STUCK_MS / 1000
         )} seconds' RETURNING id`
    );
    const eStuck = await JOB_POOL.query(
        `UPDATE web2_msg_send_items SET state='needs_extension', updated_at=NOW()
         WHERE state='ext_inflight' AND updated_at < NOW() - INTERVAL '${Math.floor(
             EXT_INFLIGHT_STUCK_MS / 1000
         )} seconds' RETURNING id`
    );
    if (sStuck.rows.length || eStuck.rows.length) {
        console.warn(
            `[WEB2-MSG-WORKER] recovered sending=${sStuck.rows.length} ext_inflight=${eStuck.rows.length}`
        );
    }
}

// ─── Tick ──────────────────────────────────────────────────────────
async function tick() {
    if (_ticking) return;
    _ticking = true;
    try {
        await _recoverStuck().catch((e) =>
            console.warn('[WEB2-MSG-WORKER] recover failed:', e.message)
        );
        _pruneCaches();
        const slots = MAX_CONCURRENT - inFlight.size;
        const batch = await _claimPending(slots);
        for (const item of batch) {
            if (inFlight.has(item.id)) continue;
            inFlight.add(item.id);
            _processItem(item)
                .catch((e) => {
                    console.warn('[WEB2-MSG-WORKER] item', item.id, 'failed:', e.message);
                    return _finishItem(item, 'needs_extension', { error: e.message });
                })
                .finally(() => inFlight.delete(item.id));
        }
    } catch (e) {
        console.error('[WEB2-MSG-WORKER] tick error:', e.message);
    } finally {
        _ticking = false;
    }
}

function start() {
    if (intervalHandle) return;
    if (process.env.WEB2_MSG_WORKER_DISABLED === '1') {
        console.log('[WEB2-MSG-WORKER] disabled via WEB2_MSG_WORKER_DISABLED=1');
        return;
    }
    if (!JOB_POOL) {
        console.warn('[WEB2-MSG-WORKER] no DB pool — worker not started');
        return;
    }
    console.log(
        `[WEB2-MSG-WORKER] start (concurrency=${MAX_CONCURRENT}, tick=${TICK_INTERVAL_MS}ms, worker=${WORKER_URL})`
    );
    intervalHandle = setInterval(() => {
        tick().catch((e) => console.error('[WEB2-MSG-WORKER] interval tick failed:', e.message));
    }, TICK_INTERVAL_MS);
    intervalHandle.unref?.();
    setImmediate(() => tick().catch(() => {}));
}

function stop() {
    if (intervalHandle) {
        clearInterval(intervalHandle);
        intervalHandle = null;
    }
}

// ─── Gửi 1 tin nhắn lẻ (auto-reply CK, báo số dư) — best-effort ──────
// Trả { ok, needsExtension?, error? }. KHÔNG throw (caller fire-and-forget).
async function sendSingleMessage(pageId, convId, customerId, message) {
    if (!pageId || !convId || !message) return { ok: false, error: 'missing-args' };
    try {
        let pat = await _getCachedPAT(pageId);
        if (pat) {
            const r = await _sendPancake(pageId, convId, customerId, message, pat);
            if (r.ok) return { ok: true };
            if (_is24hError(r.eCode, r.eSubcode)) return { ok: false, needsExtension: true };
            // token/permission/unknown → PAT cache có thể hỏng → xoá rồi xoay account.
            _invalidatePAT(pageId);
        }
        // Account rotation: mint PAT mới từ account quản page.
        const accounts = await _accountsForPage(pageId);
        for (const acc of accounts) {
            let fresh;
            try {
                fresh = await _mintPAT(pageId, acc.token);
            } catch (e) {
                continue;
            }
            if (!fresh || fresh === pat) continue;
            pat = fresh;
            const r = await _sendPancake(pageId, convId, customerId, message, pat);
            if (r.ok) return { ok: true };
            if (_is24hError(r.eCode, r.eSubcode)) return { ok: false, needsExtension: true };
            // PAT vừa mint nhưng send lỗi → xoá cache, thử account khác.
            _invalidatePAT(pageId);
        }
        return { ok: false, error: 'send-failed' };
    } catch (e) {
        return { ok: false, error: e.message };
    }
}

module.exports = { tick, start, stop, sendSingleMessage };
