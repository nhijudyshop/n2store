#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
//
// Pancake livestream comment-count booster
// =========================================
// Gửi public comment-reply qua Pancake vào các thread comment đến từ
// livestream post (post.type === "livestream"). Mục đích: tăng comment count
// trên livestream post (đẩy reach), KHÔNG spam DM khách (không làm phiền).
//
// Reverse-engineered endpoint (captured 2026-05-29 via Pancake admin web):
//   POST https://pancake.vn/api/v1/pages/<pageId>/conversations/<convId>/messages
//   Body:
//     {
//       "action": "reply_comment",
//       "message_id": "<conv.id>",            // root comment id
//       "parent_id":  "<conv.id>",            // reply to root
//       "user_selected_reply_to": null,
//       "post_id": "<conv.post_id>",          // "<pageId>_<postShortId>"
//       "message": "<text>",
//       "send_by_platform": "web"
//     }
//   Response 200: { id: "<new_comment_id>", success: true }
//
// Auth: PANCAKE_JWT in URL (?access_token=…). Loaded from serect_dont_push.txt.
//
// Usage:
//   node scripts/pancake-livestream-comment-spam.js --dry-run
//   node scripts/pancake-livestream-comment-spam.js --limit 30
//   node scripts/pancake-livestream-comment-spam.js \
//     --page-id 270136663390370 \
//     --limit 50 --cap-per-conv 1 \
//     --delay-min 2500 --delay-max 5500 \
//     --templates '.|..|🙏|❤|iB shop ạ|🥰|🌹'

const fs = require('fs');
const path = require('path');

const SECRETS_PATH = path.join(__dirname, '..', 'serect_dont_push.txt');
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'pancake-comment-bump');
fs.mkdirSync(OUT_DIR, { recursive: true });

const ARGS = parseArgs(process.argv.slice(2));
const DEFAULT_TEMPLATES = [
    '.',
    '..',
    '🙏',
    '❤',
    '❤❤',
    '🌹',
    '🥰',
    'Dạ ạ',
    'iB shop ạ',
    '✓',
    '👍',
    'Đẹp ạ',
];

main().catch((e) => {
    log('FATAL', e?.stack || String(e));
    process.exit(1);
});

async function main() {
    const cfg = {
        pageId: ARGS['page-id'] || '270136663390370',
        limit: clamp(int(ARGS.limit, 30), 1, 500),
        capPerConv: clamp(int(ARGS['cap-per-conv'], 1), 1, 20),
        capPerCustomer: clamp(int(ARGS['cap-per-customer'], 1), 1, 20),
        delayMin: clamp(int(ARGS['delay-min'], 2500), 300, 60_000),
        delayMax: clamp(int(ARGS['delay-max'], 5500), 300, 60_000),
        templates: ARGS.templates ? ARGS.templates.split('|').filter(Boolean) : DEFAULT_TEMPLATES,
        dryRun: !!ARGS['dry-run'],
        postIdScope: ARGS['post-id'] || null,
        replyEvenIfAnswered: !!ARGS['reply-even-if-answered'],
    };
    if (cfg.delayMax < cfg.delayMin) cfg.delayMax = cfg.delayMin;

    const jwt = readJwt();
    log('Config:', JSON.stringify({ ...cfg, templatesCount: cfg.templates.length }, null, 2));
    if (cfg.dryRun) log('DRY-RUN — sẽ KHÔNG gửi request thật');

    const convs = await fetchLivestreamConvs(jwt, cfg);
    log(`Fetched ${convs.length} livestream comment conversations`);

    const queue = selectQueue(convs, cfg);
    log(`Selected ${queue.length} conversations to reply (limit ${cfg.limit})`);
    if (!queue.length) {
        log('Nothing to do.');
        return;
    }

    const results = [];
    const startedAt = new Date().toISOString();
    for (let i = 0; i < queue.length; i++) {
        const conv = queue[i];
        const tmpl = pick(cfg.templates);
        const planLine = `[${i + 1}/${queue.length}] ${conv.from?.name || '?'} (post=${conv.post_id.split('_')[1]}) → "${tmpl}"`;
        if (cfg.dryRun) {
            log('DRY', planLine);
            results.push({
                idx: i + 1,
                convId: conv.id,
                from: conv.from?.name,
                message: tmpl,
                dryRun: true,
            });
        } else {
            log('SEND', planLine);
            const r = await sendCommentReply(jwt, cfg.pageId, conv, tmpl);
            results.push({
                idx: i + 1,
                convId: conv.id,
                from: conv.from?.name,
                message: tmpl,
                ...r,
            });
            log(`     → ${r.ok ? 'OK ' + r.newId : 'FAIL ' + (r.error || r.status)}`);
            if (i < queue.length - 1) {
                const wait = rand(cfg.delayMin, cfg.delayMax);
                log(`     sleep ${wait}ms`);
                await sleep(wait);
            }
        }
    }

    const summary = {
        startedAt,
        finishedAt: new Date().toISOString(),
        config: cfg,
        total: results.length,
        ok: results.filter((r) => r.ok).length,
        fail: results.filter((r) => r.error || (r.status && r.status !== 200)).length,
        results,
    };
    const outPath = path.join(OUT_DIR, `bump-${Date.now()}.json`);
    fs.writeFileSync(outPath, JSON.stringify(summary, null, 2));
    log(`\nDone. ok=${summary.ok}/${summary.total} fail=${summary.fail}`);
    log('Report:', outPath);
}

function readJwt() {
    const txt = fs.readFileSync(SECRETS_PATH, 'utf-8');
    const m = txt.match(/^PANCAKE_JWT:\s*(\S+)/m);
    if (!m) throw new Error('PANCAKE_JWT not found in serect_dont_push.txt');
    return m[1].trim();
}

async function fetchLivestreamConvs(jwt, cfg) {
    const url =
        `https://pancake.vn/api/v1/pages/${encodeURIComponent(cfg.pageId)}/conversations` +
        `?unread_first=false&mode=OR&tags=%22ALL%22&except_tags=[]` +
        `&access_token=${encodeURIComponent(jwt)}` +
        `&cursor_mode=true&from_platform=web`;
    const r = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ type: 'COMMENT' }),
    });
    if (!r.ok) throw new Error(`Fetch convs failed: ${r.status} ${await r.text().catch(() => '')}`);
    const j = await r.json();
    let convs = (j?.conversations || []).filter((c) => c?.post?.type === 'livestream');
    if (cfg.postIdScope) {
        convs = convs.filter(
            (c) => c.post_id === cfg.postIdScope || c.post_id?.endsWith('_' + cfg.postIdScope)
        );
    }
    return convs;
}

function selectQueue(convs, cfg) {
    const sorted = [...convs].sort((a, b) => {
        const ta = Date.parse(a.last_customer_interactive_at || a.inserted_at || 0) || 0;
        const tb = Date.parse(b.last_customer_interactive_at || b.inserted_at || 0) || 0;
        return tb - ta;
    });
    const perConv = new Map();
    const perCust = new Map();
    const out = [];
    for (const c of sorted) {
        if (out.length >= cfg.limit) break;
        if (!cfg.replyEvenIfAnswered && c.last_sent_by?.id === cfg.pageId) continue;
        const convKey = c.id;
        const custKey = c.customers?.[0]?.fb_id || c.from?.id || c.from?.name;
        if ((perConv.get(convKey) || 0) >= cfg.capPerConv) continue;
        if ((perCust.get(custKey) || 0) >= cfg.capPerCustomer) continue;
        perConv.set(convKey, (perConv.get(convKey) || 0) + 1);
        perCust.set(custKey, (perCust.get(custKey) || 0) + 1);
        out.push(c);
    }
    return out;
}

async function sendCommentReply(jwt, pageId, conv, message) {
    const url =
        `https://pancake.vn/api/v1/pages/${encodeURIComponent(pageId)}` +
        `/conversations/${encodeURIComponent(conv.id)}/messages` +
        `?access_token=${encodeURIComponent(jwt)}`;
    const body = {
        action: 'reply_comment',
        message_id: conv.id,
        parent_id: conv.id,
        user_selected_reply_to: null,
        post_id: conv.post_id,
        message,
        send_by_platform: 'web',
    };
    try {
        const r = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Accept: 'application/json',
                Referer: 'https://pancake.vn/',
                Origin: 'https://pancake.vn',
            },
            body: JSON.stringify(body),
        });
        const text = await r.text();
        let j = null;
        try {
            j = JSON.parse(text);
        } catch (_) {}
        if (r.ok && j?.success) return { ok: true, status: r.status, newId: j.id };
        return { ok: false, status: r.status, error: text.slice(0, 200) };
    } catch (e) {
        return { ok: false, error: String(e).slice(0, 200) };
    }
}

function parseArgs(a) {
    const o = {};
    for (let i = 0; i < a.length; i++) {
        const k = a[i];
        if (!k.startsWith('--')) continue;
        const key = k.slice(2);
        const next = a[i + 1];
        if (next === undefined || next.startsWith('--')) o[key] = true;
        else {
            o[key] = next;
            i++;
        }
    }
    return o;
}

function int(v, d) {
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : d;
}
function clamp(n, lo, hi) {
    return Math.max(lo, Math.min(hi, n));
}
function pick(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
}
function rand(lo, hi) {
    return Math.floor(lo + Math.random() * (hi - lo + 1));
}
function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
}
function log(...a) {
    const ts = new Date().toISOString();
    console.log(`[${ts}]`, ...a);
}
