// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE — worker tăng comment chạy NỀN trên server.
// =====================================================================
// web2-comment-boost-worker — chạy NỀN trên server (web2-api).
//
// Mục tiêu: user chọn 1 bài live + 1 hội thoại comment + "số comment muốn THÊM"
// (vd 700). Server chụp comment_count hiện tại của bài (baseline, vd 362), tính
// target = baseline + add (1062), rồi đăng `reply_comment` (page tự comment, y
// hệt trang "Tăng số lượng comment") qua NHIỀU account Pancake song song. Sau mỗi
// vòng, RE-CHECK comment_count thật của bài; nếu < target thì chạy tiếp tới khi
// >= target (có safety cap + backoff khi FB rate-limit). Browser đóng vẫn chạy.
//
// Vì sao chạy nền server (không phải tab browser): job dài (hàng trăm comment),
// đóng tab không được dừng; cần re-check vòng lặp tự động.
//
// Pancake: gọi TRỰC TIẾP pancake.vn/api/v1 (như web2-livestream-poller). JWT lấy
// từ bảng `pancake_accounts` (chatDb) — tất cả account admin của page.
// =====================================================================

'use strict';

const PANCAKE_API = 'https://pancake.vn/api/v1';

// ── Tham số an toàn ──────────────────────────────────────────────────
const TICK_INTERVAL_MS = 4000; // quét job pending mỗi 4s
const MAX_CONCURRENT_JOBS = 2; // tối đa 2 job boost chạy cùng lúc
const MIN_DELAY_MS = 1000; // giãn nhịp tối thiểu / account
const RECHECK_DELAY_MS = 7000; // chờ Pancake cập nhật count trước khi re-check
const MAX_ROUNDS = 40; // chặn vòng lặp vô hạn
const SAFETY_SEND_MULT = 3; // tổng gửi tối đa = add_target * 3 + 50
const RATE_LIMIT_BACKOFF_MS = 60000; // FB rate-limit → nghỉ 60s
const MAX_CONSEC_RATELIMIT = 3; // 3 vòng rate-limit liên tiếp → dừng an toàn
const MAX_COUNT_FAIL = 4; // không đọc được count quá 4 lần → lỗi
const PERSIST_EVERY = 12; // mỗi 12 comment ghi tiến độ + SSE 1 lần

const _CH = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
function randText() {
    const n = 5 + Math.floor(Math.random() * 5);
    let s = '';
    for (let i = 0; i < n; i++) s += _CH.charAt(Math.floor(Math.random() * _CH.length));
    return s;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── State ────────────────────────────────────────────────────────────
let _web2Pool = null;
let _chatPool = null;
let _notify = null;
let _interval = null;
let _ticking = false;
const _inFlight = new Set(); // jobId đang chạy

// ── JWT helpers (copy từ web2-livestream-poller) ─────────────────────
function _decodeExp(jwt) {
    try {
        const p = JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64').toString('utf8'));
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

// Tất cả account JWT (còn hạn) admin của page → [{ accountId, name, jwt }].
// Như getPageAccountJwts client-side. Không match page nào → fallback all valid.
async function getAllAccountTokensForPage(chatPool, pageId) {
    const out = [];
    const seen = new Set();
    try {
        const r = await chatPool.query(
            'SELECT account_id, token, pages, fb_name FROM pancake_accounts WHERE is_active = true'
        );
        const valid = r.rows.filter((row) => _jwtValid(row.token));
        const matched = [];
        const all = [];
        for (const row of valid) {
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
            const item = {
                accountId: row.account_id,
                name: row.fb_name || row.account_id,
                jwt: row.token,
            };
            all.push(item);
            if (ids.includes(String(pageId))) matched.push(item);
        }
        const pick = matched.length ? matched : all;
        for (const it of pick) {
            if (seen.has(it.jwt)) continue;
            seen.add(it.jwt);
            out.push(it);
        }
    } catch (e) {
        console.warn('[CMT-BOOST] getAllTokens DB error:', e.message);
    }
    if (!out.length) {
        const env = process.env.PANCAKE_JWT;
        if (_jwtValid(env)) out.push({ accountId: 'env', name: 'env', jwt: env });
    }
    return out;
}

// comment_count THẬT của bài (FB) qua Pancake posts list. null nếu không đọc được.
async function fetchPostCommentCount(chatPool, pageId, postId, jwtHint) {
    let jwt = _jwtValid(jwtHint) ? jwtHint : null;
    if (!jwt) {
        const toks = await getAllAccountTokensForPage(chatPool, pageId);
        jwt = toks[0] && toks[0].jwt;
    }
    if (!jwt) return null;
    const now = Math.floor(Date.now() / 1000);
    const url =
        `${PANCAKE_API}/pages/${encodeURIComponent(pageId)}/posts` +
        `?start_time=${now - 31 * 86400}&end_time=${now}&access_token=${encodeURIComponent(jwt)}`;
    try {
        const r = await fetch(url, { headers: { Accept: 'application/json' } });
        const d = await r.json().catch(() => ({}));
        const posts = Array.isArray(d.posts) ? d.posts : Array.isArray(d.data) ? d.data : [];
        const p = posts.find((x) => String(x.id) === String(postId));
        if (p && p.comment_count != null) return Number(p.comment_count) || 0;
        return null;
    } catch (e) {
        console.warn('[CMT-BOOST] count fetch error:', e.message);
        return null;
    }
}

// Đăng 1 reply_comment GIỐNG 100% trang "Tăng comment" (sendLiveComment client).
async function postReplyComment({ pageId, convId, messageId, postId, message, jwt }) {
    const body = {
        action: 'reply_comment',
        message_id: messageId || convId,
        parent_id: convId,
        user_selected_reply_to: null,
        post_id: postId || null,
        message: String(message == null ? '' : message),
        send_by_platform: 'web',
    };
    const url = `${PANCAKE_API}/pages/${encodeURIComponent(pageId)}/conversations/${encodeURIComponent(
        convId
    )}/messages?access_token=${encodeURIComponent(jwt)}`;
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify(body),
        });
        const d = await r.json().catch(() => ({}));
        if (d && d.success) return { ok: true, id: d.id };
        const reason = (d && d.message) || (d && d.e_code != null ? `FB #${d.e_code}` : 'fail');
        const rateLimited =
            d &&
            (d.e_subcode === 3252001 ||
                d.e_code === 368 ||
                /rate|limit|spam|chặn|policy|block/i.test(String(reason)));
        return {
            ok: false,
            reason,
            e_code: d && d.e_code,
            e_subcode: d && d.e_subcode,
            rateLimited,
        };
    } catch (e) {
        return { ok: false, reason: e.message };
    }
}

// ── DB job helpers ───────────────────────────────────────────────────
async function _updateJob(id, fields) {
    const cols = Object.keys(fields);
    if (!cols.length) return;
    const set = cols.map((c, i) => `${c}=$${i + 2}`).join(', ');
    const vals = cols.map((c) => fields[c]);
    await _web2Pool.query(
        `UPDATE web2_comment_boost_jobs SET ${set}, updated_at=$${cols.length + 2} WHERE id=$1`,
        [id, ...vals, Date.now()]
    );
}
function _notifyJob(id) {
    if (!_notify) return;
    try {
        _notify('web2:comment-boost', { action: 'update', jobId: id, ts: Date.now() }, 'update');
    } catch (e) {
        console.warn('[CMT-BOOST] notify failed:', e.message);
    }
}
async function _isStopped(id) {
    try {
        const r = await _web2Pool.query('SELECT state FROM web2_comment_boost_jobs WHERE id=$1', [
            id,
        ]);
        return !r.rows.length || r.rows[0].state === 'stopped';
    } catch {
        return false;
    }
}

// ── 1 vòng đăng comment: work-stealing N account, delay/account, rate-limit guard ──
async function runRound(job, tokens, remaining, delay, onProgress, jobId) {
    const tpl = (job.tpl || '').trim();
    let claimed = 0;
    let ok = 0;
    let err = 0;
    let rateLimited = false;
    let roundStop = false;
    const nextIdx = () => (!roundStop && claimed < remaining ? claimed++ : -1);

    async function worker(jwt) {
        while (true) {
            const i = nextIdx();
            if (i < 0) break;
            const text = tpl || randText();
            const res = await postReplyComment({
                pageId: job.page_id,
                convId: job.conv_id,
                messageId: job.message_id,
                postId: job.post_id,
                message: text,
                jwt,
            });
            if (res.ok) ok++;
            else {
                err++;
                if (res.rateLimited) {
                    rateLimited = true;
                    roundStop = true; // dừng cả vòng để backoff
                    break;
                }
            }
            const done = ok + err;
            if (done % PERSIST_EVERY === 0) {
                onProgress(ok, err);
                if (await _isStopped(jobId)) {
                    roundStop = true;
                    break;
                }
            }
            if (!roundStop && claimed < remaining) await sleep(delay);
        }
    }

    await Promise.all(tokens.map((t) => worker(t.jwt)));
    onProgress(ok, err);
    return { ok, err, rateLimited };
}

// ── Chạy 1 job tới khi đạt target (hoặc cap/stop) ────────────────────
async function runJob(job) {
    const jobId = job.id;
    _inFlight.add(jobId);
    try {
        await _updateJob(jobId, { state: 'running', error: null });
        _notifyJob(jobId);

        const tokens = await getAllAccountTokensForPage(_chatPool, job.page_id);
        if (!tokens.length) {
            await _updateJob(jobId, { state: 'error', error: 'no_account_jwt' });
            _notifyJob(jobId);
            return;
        }

        const target = Number(job.target_count) || 0;
        const delay = Math.max(MIN_DELAY_MS, Number(job.delay_ms) || 1000);
        const totalCap = (Number(job.add_target) || 0) * SAFETY_SEND_MULT + 50;
        let sentOk = Number(job.sent_ok) || 0;
        let sentErr = Number(job.sent_err) || 0;
        let rounds = Number(job.rounds) || 0;
        let consecRate = 0;
        let countFail = 0;
        let stopReason = null;
        let stopped = false;

        while (rounds < MAX_ROUNDS) {
            if (await _isStopped(jobId)) {
                stopped = true;
                stopReason = 'stopped';
                break;
            }
            const count = await fetchPostCommentCount(
                _chatPool,
                job.page_id,
                job.post_id,
                tokens[0].jwt
            );
            if (count == null) {
                countFail++;
                if (countFail >= MAX_COUNT_FAIL) {
                    stopped = true;
                    stopReason = 'count_unreadable';
                    break;
                }
                await sleep(RECHECK_DELAY_MS);
                continue;
            }
            countFail = 0;
            await _updateJob(jobId, { last_count: count, rounds });
            _notifyJob(jobId);

            if (count >= target) break; // ✅ đạt

            if (sentOk + sentErr >= totalCap) {
                stopped = true;
                stopReason = 'safety_cap';
                break;
            }
            let remaining = target - count;
            remaining = Math.min(remaining, totalCap - (sentOk + sentErr));
            if (remaining <= 0) break;

            rounds++;
            const round = await runRound(
                job,
                tokens,
                remaining,
                delay,
                (rok, rerr) => {
                    _updateJob(jobId, {
                        sent_ok: sentOk + rok,
                        sent_err: sentErr + rerr,
                        rounds,
                    }).catch(() => {});
                    _notifyJob(jobId);
                },
                jobId
            );
            sentOk += round.ok;
            sentErr += round.err;
            await _updateJob(jobId, { sent_ok: sentOk, sent_err: sentErr, rounds });
            _notifyJob(jobId);

            if (round.rateLimited) {
                consecRate++;
                if (consecRate >= MAX_CONSEC_RATELIMIT) {
                    stopped = true;
                    stopReason = 'rate_limit';
                    break;
                }
                await sleep(RATE_LIMIT_BACKOFF_MS);
            } else {
                consecRate = 0;
            }
            await sleep(RECHECK_DELAY_MS); // chờ Pancake cập nhật count
        }

        if (!stopped && rounds >= MAX_ROUNDS) stopReason = 'max_rounds';

        // Chốt: re-check count lần cuối.
        const finalCount = await fetchPostCommentCount(
            _chatPool,
            job.page_id,
            job.post_id,
            tokens[0].jwt
        );
        const lc = finalCount != null ? finalCount : Number(job.last_count) || null;
        const reached = lc != null && lc >= target;
        let state;
        if (reached) state = 'done';
        else if (stopReason === 'stopped') state = 'stopped';
        else state = 'error';
        await _updateJob(jobId, {
            state,
            last_count: lc,
            sent_ok: sentOk,
            sent_err: sentErr,
            rounds,
            note: reached ? `Đạt ${lc}/${target}` : stopReason || 'not_reached',
            error: reached ? null : stopReason || 'not_reached',
        });
        _notifyJob(jobId);
        console.log(
            `[CMT-BOOST] job ${jobId} ${state} count=${lc}/${target} sent=${sentOk}/${sentErr} rounds=${rounds}`
        );
    } catch (e) {
        console.error('[CMT-BOOST] runJob error:', e.message);
        try {
            await _updateJob(jobId, { state: 'error', error: e.message });
            _notifyJob(jobId);
        } catch {
            /* ignore */
        }
    } finally {
        _inFlight.delete(jobId);
    }
}

// ── Tick: nhặt job pending/running chưa in-flight ────────────────────
async function tick() {
    if (_ticking || !_web2Pool) return;
    _ticking = true;
    try {
        if (_inFlight.size >= MAX_CONCURRENT_JOBS) return;
        const r = await _web2Pool.query(
            `SELECT * FROM web2_comment_boost_jobs
             WHERE state IN ('pending','running')
             ORDER BY created_at ASC LIMIT 10`
        );
        for (const job of r.rows) {
            if (_inFlight.size >= MAX_CONCURRENT_JOBS) break;
            if (_inFlight.has(job.id)) continue;
            runJob(job).catch((e) => console.error('[CMT-BOOST] runJob throw:', e.message));
        }
    } catch (e) {
        console.error('[CMT-BOOST] tick error:', e.message);
    } finally {
        _ticking = false;
    }
}

function triggerTick() {
    setImmediate(() => tick().catch(() => {}));
}

function start({ web2Pool, chatPool, notify }) {
    _web2Pool = web2Pool;
    _chatPool = chatPool;
    _notify = notify || null;
    if (!_web2Pool || !_chatPool) {
        console.warn('[CMT-BOOST] missing pool — worker not started');
        return;
    }
    if (_interval) return;
    console.log('[CMT-BOOST] worker start');
    _interval = setInterval(() => {
        tick().catch((e) => console.error('[CMT-BOOST] tick failed:', e.message));
    }, TICK_INTERVAL_MS);
    _interval.unref?.();
    triggerTick();
}

module.exports = {
    start,
    triggerTick,
    // helpers dùng bởi route (baseline count + token check khi tạo job)
    getAllAccountTokensForPage,
    fetchPostCommentCount,
};
