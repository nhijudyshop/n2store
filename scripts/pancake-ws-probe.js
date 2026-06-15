// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — probe Pancake WS để hiểu kênh nhận comment live (server-direct, không poll).
//
// Mục đích (one-shot diagnostic, KHÔNG commit secret): mở pancake.vn bằng JWT account
// trong serect_dont_push.txt → hook MỌI WebSocket frame (Phoenix Channels) → in:
//   • Các topic phx_join + reply ok/error (phát hiện "Gói cước hết hạn")
//   • Event nhận comment livestream (pages:update_conversation type=COMMENT post=livestream)
//   • Topic/payload chính xác để biết server đọc comment trực tiếp kiểu gì
//
// Chạy: node scripts/pancake-ws-probe.js [--secs 240] [--post <pancake-post-url>]
// Secret CHỈ đọc từ file, KHÔNG echo ra log.

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const SECRET_FILE = path.join(__dirname, '..', 'serect_dont_push.txt');
const argv = process.argv.slice(2);
const getArg = (k, d) => {
    const i = argv.indexOf(k);
    return i >= 0 && argv[i + 1] ? argv[i + 1] : d;
};
const SECS = parseInt(getArg('--secs', '240'), 10);
const POST_URL = getArg('--post', 'https://pancake.vn/NhiJudyStore/post');

function readSecret(label) {
    const txt = fs.readFileSync(SECRET_FILE, 'utf8');
    const m = txt.match(new RegExp('^' + label + '\\s*[:=]\\s*(.+)$', 'm'));
    return m ? m[1].trim().split(/\s+#/)[0].trim() : '';
}

(async () => {
    const jwt = readSecret('PANCAKE_JWT');
    const uid = readSecret('PANCAKE_USER_UID');
    if (!jwt) {
        console.error('PANCAKE_JWT không có trong serect_dont_push.txt — abort');
        process.exit(1);
    }
    console.log(`[probe] account uid=${uid} (jwt len=${jwt.length}) — KHÔNG in jwt`);
    console.log(`[probe] capture ${SECS}s · post=${POST_URL}`);

    const browser = await chromium.launch({ headless: false });
    const ctx = await browser.newContext();
    await ctx.addCookies([
        { name: 'jwt', value: jwt, domain: '.pancake.vn', path: '/' },
        { name: 'access_token', value: jwt, domain: '.pancake.vn', path: '/' },
    ]);
    const page = await ctx.newPage();

    const joins = []; // {topic}
    const replies = []; // {topic, status, resp}
    const commentEvents = []; // {topic, postId, type, from, snippet}
    const otherEvents = {}; // event → count
    const topicsSeen = new Set();

    function onFrame(dir, raw) {
        let msg;
        try {
            msg = JSON.parse(raw);
        } catch {
            return;
        }
        if (!Array.isArray(msg)) return;
        const [, , topic, event, payload] = msg;
        if (topic) topicsSeen.add(topic);
        if (event === 'phx_join') joins.push({ topic, dir });
        else if (event === 'phx_reply') {
            const status = payload && payload.status;
            const resp = payload && payload.response;
            replies.push({
                topic,
                status,
                resp: resp ? JSON.stringify(resp).slice(0, 160) : '',
            });
        } else if (event && event !== 'phx_reply' && event !== 'heartbeat') {
            otherEvents[event] = (otherEvents[event] || 0) + 1;
            // comment livestream?
            const conv = payload && payload.conversation;
            if (
                conv &&
                (conv.type === 'COMMENT' || (conv.post && conv.post.type === 'livestream'))
            ) {
                commentEvents.push({
                    topic,
                    event,
                    postId: conv.post_id,
                    type: conv.type,
                    postType: conv.post && conv.post.type,
                    from: conv.from && conv.from.name,
                    snippet: (conv.snippet || '').slice(0, 50),
                });
            }
        }
    }

    page.on('websocket', (ws) => {
        console.log(`[probe] WS opened: ${ws.url().slice(0, 80)}`);
        ws.on('framesent', (f) => onFrame('→', f.payload));
        ws.on('framereceived', (f) => onFrame('←', f.payload));
        ws.on('close', () => console.log('[probe] WS closed'));
    });

    try {
        await page.goto(POST_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
    } catch (e) {
        console.log('[probe] goto warn:', e.message);
    }

    const t0 = Date.now();
    let lastReport = 0;
    while (Date.now() - t0 < SECS * 1000) {
        await page.waitForTimeout(2000);
        const el = Math.round((Date.now() - t0) / 1000);
        if (el - lastReport >= 30) {
            lastReport = el;
            console.log(
                `[probe] +${el}s · joins=${joins.length} replies=${replies.length} commentEvents=${commentEvents.length} topics=${topicsSeen.size}`
            );
        }
    }

    console.log('\n========== PANCAKE WS PROBE RESULT ==========');
    console.log('TOPICS SEEN:', [...topicsSeen].slice(0, 40));
    console.log('\nJOIN attempts:');
    [...new Set(joins.map((j) => j.topic))].forEach((t) => console.log('  join →', t));
    console.log('\nREPLIES (status per topic):');
    const seenRep = new Set();
    replies.forEach((r) => {
        const k = r.topic + '|' + r.status + '|' + r.resp;
        if (seenRep.has(k)) return;
        seenRep.add(k);
        console.log(`  [${r.status}] ${r.topic} ${r.resp}`);
    });
    console.log('\nNON-REPLY EVENTS (count):', JSON.stringify(otherEvents, null, 0));
    console.log('\nCOMMENT/LIVESTREAM EVENTS:', commentEvents.length);
    commentEvents
        .slice(0, 15)
        .forEach((c) =>
            console.log(
                `  topic=${c.topic} event=${c.event} post=${c.postId} type=${c.type}/${c.postType} from=${c.from} "${c.snippet}"`
            )
        );
    console.log('=============================================\n');

    await browser.close();
    process.exit(0);
})();
