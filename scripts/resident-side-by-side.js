#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.

/**
 * Mở 2 tab Chromium song song:
 *   Tab A: clone local (resident/index.html) — qua HTTP server local 1 lần
 *   Tab B: live https://app.resident.vn (dùng auth-state.json)
 *
 * Đồng thời tiếp tục capture XHR từ tab B vào downloads/resident-crawl/<ts>-live/api
 * để bổ sung mock cho clone.
 *
 * Routes navigate đồng bộ giữa 2 tab (gõ vào terminal "go /rooms" → cả 2 cùng đi).
 *
 * Usage:
 *   node scripts/resident-side-by-side.js
 */

const fs = require('fs');
const http = require('http');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const STATE_FILE = path.join(ROOT, 'downloads', 'resident-crawl', 'auth-state.json');
const CLONE_DIR = path.join(ROOT, 'resident');
const PORT = Number(process.env.PORT || 8765);

const TS = new Date().toISOString().replace(/[:.]/g, '-');
const OUT_DIR = path.join(ROOT, 'downloads', 'resident-crawl', TS + '-live');
const API_DIR = path.join(OUT_DIR, 'api');
fs.mkdirSync(API_DIR, { recursive: true });

if (!fs.existsSync(STATE_FILE)) {
    console.error('[fatal] Không tìm thấy auth-state. Chạy resident-save-auth.js trước.');
    process.exit(1);
}

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.ico': 'image/x-icon',
};

function startStaticServer() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const u = decodeURIComponent((req.url || '/').split('?')[0]);
            let p = path.join(CLONE_DIR, u === '/' ? 'index.html' : u);
            if (!p.startsWith(CLONE_DIR)) {
                res.writeHead(403);
                return res.end('forbidden');
            }
            fs.stat(p, (err, st) => {
                if (err || !st.isFile()) {
                    res.writeHead(404);
                    return res.end('not found: ' + u);
                }
                res.writeHead(200, {
                    'Content-Type':
                        MIME[path.extname(p).toLowerCase()] || 'application/octet-stream',
                    'Cache-Control': 'no-store',
                });
                fs.createReadStream(p).pipe(res);
            });
        });
        server.listen(PORT, () => {
            console.log(`[ok] Clone server: http://localhost:${PORT}/`);
            resolve(server);
        });
    });
}

function slug(u) {
    try {
        const url = new URL(u);
        return (url.host + url.pathname + url.search)
            .replace(/[^a-z0-9]+/gi, '_')
            .replace(/^_+|_+$/g, '')
            .slice(0, 140);
    } catch {
        return 'unknown';
    }
}

async function main() {
    await startStaticServer();

    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled'],
    });

    // Tab A: clone — context riêng (không cần auth)
    const ctxClone = await browser.newContext({ viewport: { width: 960, height: 850 } });
    const tabA = await ctxClone.newPage();

    // Tab B: live — context với storageState
    const ctxLive = await browser.newContext({
        viewport: { width: 960, height: 850 },
        storageState: STATE_FILE,
        userAgent:
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const tabB = await ctxLive.newPage();

    let counter = 0;
    const captured = [];
    tabB.on('response', async (res) => {
        const url = res.url();
        if (!url.includes('api.resident.vn')) return;
        const req = res.request();
        if (!['xhr', 'fetch'].includes(req.resourceType())) return;
        try {
            const ct = (res.headers()['content-type'] || '').toLowerCase();
            if (!ct.includes('json')) return;
            const buf = await res.body().catch(() => null);
            if (!buf) return;
            const idx = String(++counter).padStart(4, '0');
            const fname = `${idx}-${req.method()}-${slug(url)}.json`;
            fs.writeFileSync(path.join(API_DIR, fname), buf);
            captured.push({ idx, method: req.method(), url, status: res.status(), file: fname });
        } catch {}
    });

    // Open both
    await tabA.goto(`http://localhost:${PORT}/`, { waitUntil: 'domcontentloaded' });
    await tabB.goto('https://app.resident.vn/', { waitUntil: 'domcontentloaded' });
    await tabB.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});

    if (tabB.url().includes('/auth/signin')) {
        console.error('[fatal] State hết hạn — chạy resident-save-auth.js để login lại.');
    } else {
        console.log('[ok] Tab A (clone) + Tab B (live) đều ready.');
    }

    // Đóng khi browser bị đóng tay
    browser.on('disconnected', async () => {
        fs.writeFileSync(
            path.join(OUT_DIR, 'live-captures.json'),
            JSON.stringify(captured, null, 2)
        );
        console.log(`[ok] saved ${captured.length} captures to ${OUT_DIR}`);
        process.exit(0);
    });

    // Nếu không có TTY (chạy background) → chỉ giữ alive, đợi user đóng browser
    if (!process.stdin.isTTY) {
        console.log(
            '\n[ok] 2 tab đã mở (clone trái, live phải). Đóng cửa sổ Chromium để kết thúc.'
        );
        return; // không setup REPL
    }

    // REPL: nhập "go <route>" để cả 2 tab cùng đi
    console.log('\n=== Side-by-side REPL ===');
    console.log('Lệnh:');
    console.log('  go <route>          → cả 2 tab navigate (vd: go /rooms)');
    console.log('  rebuild             → đồng bộ mock data từ live captures');
    console.log('  q | quit | exit     → đóng');
    console.log('--------------------------------\n');

    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.setPrompt('resident> ');
    rl.prompt();
    rl.on('line', async (line) => {
        const cmd = line.trim();
        if (!cmd) return rl.prompt();
        if (['q', 'quit', 'exit'].includes(cmd)) {
            rl.close();
            return;
        }
        if (cmd.startsWith('go ')) {
            const route = cmd.slice(3).trim();
            const target = route.startsWith('/') ? route : '/' + route;
            try {
                await Promise.all([
                    tabA.goto(`http://localhost:${PORT}/#${target}`, {
                        waitUntil: 'domcontentloaded',
                    }),
                    tabB.goto(`https://app.resident.vn${target}`, {
                        waitUntil: 'domcontentloaded',
                    }),
                ]);
                await tabB.waitForLoadState('networkidle', { timeout: 6000 }).catch(() => {});
                console.log(`[ok] navigated. live API captured: ${captured.length}`);
            } catch (e) {
                console.warn('[err]', e.message);
            }
        } else if (cmd === 'rebuild') {
            // copy live captures into resident/data
            const dest = path.join(CLONE_DIR, 'data');
            let n = 0;
            for (const c of captured) {
                try {
                    const u = new URL(c.url);
                    const key =
                        c.method.toLowerCase() +
                        '-' +
                        u.pathname.replace(/^\//, '').replace(/\//g, '-');
                    fs.copyFileSync(path.join(API_DIR, c.file), path.join(dest, key + '.json'));
                    n++;
                } catch {}
            }
            console.log(`[ok] rebuilt ${n} mock files`);
        } else {
            console.log('Unknown command. Try: go /rooms');
        }
        rl.prompt();
    });

    rl.on('close', async () => {
        // ghi manifest live
        fs.writeFileSync(
            path.join(OUT_DIR, 'live-captures.json'),
            JSON.stringify(captured, null, 2)
        );
        console.log(`[ok] saved ${captured.length} captures to ${OUT_DIR}`);
        await browser.close();
        process.exit(0);
    });
}

main().catch((e) => {
    console.error('[fatal]', e);
    process.exit(1);
});
