#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// Persistent Playwright session pointed at TPOS (tomato.tpos.vn). KHÔNG auto-login —
// user login thủ công trong cửa sổ browser, sau đó gõ "done" để báo Claude tiếp tục.
//
// Mục đích: nghiên cứu API search ProductTemplate by parent code → expand variants
// để in barcode cho biến thể. Capture network responses để hiểu payload TPOS dùng.
//
// Chạy:
//   node scripts/tpos-direct-session.js
//
// Commands gửi qua FIFO /tmp/n2store-tpos.fifo:
//   nav <url>          — điều hướng
//   eval <js>          — chạy js trong page (return JSON)
//   click <selector>   — click element
//   netlast [N]        — show last N captured /odata/* calls (default 10)
//   netfilter <regex>  — filter buffer by regex on url
//   clearnet           — clear network buffer
//   shot <path>        — full-page screenshot
//   done               — báo Claude user đã login + sẵn sàng (signal file)
//   help / quit

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { chromium } = require('playwright');

const FIFO = '/tmp/n2store-tpos.fifo';
const READY_FILE = '/tmp/n2store-tpos-ready';
const OUT_DIR = path.join(__dirname, '..', 'downloads', 'n2store-session', 'tpos-direct');
fs.mkdirSync(OUT_DIR, { recursive: true });
const LOG_FILE = path.join(OUT_DIR, 'session.log');
const NET_FILE = path.join(OUT_DIR, 'network.jsonl');

const logFile = fs.createWriteStream(LOG_FILE, { flags: 'a' });
const netFile = fs.createWriteStream(NET_FILE, { flags: 'a' });
const ts = () => new Date().toISOString();
const log = (...a) => {
    const line = `[${ts()}] ${a.join(' ')}`;
    console.log(line);
    logFile.write(line + '\n');
};

// Clean ready signal file at start
try {
    fs.unlinkSync(READY_FILE);
} catch (_) {}

(async () => {
    log('Launching Chromium (no auto-login) at TPOS…');
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-application-cache', '--disk-cache-size=0'],
    });
    const ctx = await browser.newContext({
        viewport: { width: 1600, height: 900 },
        bypassCSP: true,
    });
    const page = await ctx.newPage();

    // Network buffer — only capture odata / api calls
    const netBuf = [];
    page.on('response', async (res) => {
        const u = res.url();
        if (!/tomato\.tpos\.vn\/(odata|api)/i.test(u)) return;
        let body = null;
        try {
            const ct = res.headers()['content-type'] || '';
            if (ct.includes('json')) {
                body = await res.json().catch(() => null);
            }
        } catch (_) {}
        const entry = {
            t: ts(),
            status: res.status(),
            method: res.request().method(),
            url: u,
            // Only first 2KB body to keep log readable
            body: body ? JSON.stringify(body).slice(0, 2000) : null,
        };
        netBuf.push(entry);
        if (netBuf.length > 300) netBuf.shift();
        netFile.write(JSON.stringify(entry) + '\n');
    });

    await page.goto('https://tomato.tpos.vn/#/app/producttemplate/list', {
        waitUntil: 'domcontentloaded',
    });
    log('Page loaded. Bạn login thủ công, xong gõ "done" vào FIFO.');
    log(`FIFO: ${FIFO}  (gửi lệnh:   echo "done" > ${FIFO})`);
    log(`Logs: ${LOG_FILE}`);
    log(`Network: ${NET_FILE}`);

    // Set up FIFO if not exists
    if (!fs.existsSync(FIFO)) {
        require('child_process').execSync(`mkfifo ${FIFO}`);
        log('Created FIFO:', FIFO);
    }

    const safe = async (fn, label) => {
        try {
            const r = await fn();
            const s = r === undefined ? 'undefined' : JSON.stringify(r);
            log(`${label} →`, (s == null ? String(s) : s).slice(0, 1500));
        } catch (e) {
            log(`${label} ERROR:`, String(e).slice(0, 400));
        }
    };

    const handleCmd = async (raw) => {
        const line = raw.trim();
        if (!line) return;
        const [cmd, ...rest] = line.split(/\s+/);
        const arg = rest.join(' ');
        switch (cmd) {
            case 'nav':
                await safe(async () => {
                    await page.goto(arg, { waitUntil: 'domcontentloaded' });
                    return { ok: true, url: page.url() };
                }, `nav ${arg}`);
                break;
            case 'eval':
                await safe(() => page.evaluate(arg), 'eval');
                break;
            case 'click':
                await safe(async () => {
                    await page.locator(arg).first().click({ timeout: 5000 });
                    return { ok: true };
                }, `click ${arg}`);
                break;
            case 'netlast': {
                const n = parseInt(arg) || 10;
                const slice = netBuf.slice(-n);
                log(`netlast ${n} →`, JSON.stringify(slice, null, 2).slice(0, 4000));
                break;
            }
            case 'netfilter': {
                try {
                    const re = new RegExp(arg, 'i');
                    const m = netBuf.filter((e) => re.test(e.url));
                    log(
                        `netfilter ${arg} (${m.length}) →`,
                        JSON.stringify(m, null, 2).slice(0, 6000)
                    );
                } catch (e) {
                    log('netfilter regex error:', String(e));
                }
                break;
            }
            case 'clearnet':
                netBuf.length = 0;
                log('Network buffer cleared.');
                break;
            case 'shot':
                await safe(
                    () =>
                        page.screenshot({
                            path: arg || `${OUT_DIR}/shot-${Date.now()}.png`,
                            fullPage: true,
                        }),
                    `shot ${arg}`
                );
                break;
            case 'done':
                fs.writeFileSync(READY_FILE, ts());
                log('✓ Ready signal written to', READY_FILE);
                break;
            case 'help':
                log(
                    'Commands: nav <url> | eval <js> | click <sel> | netlast [N] | netfilter <regex> | clearnet | shot <path> | done | quit'
                );
                break;
            case 'quit':
                log('Quit requested. Bye.');
                await browser.close().catch(() => {});
                process.exit(0);
                break;
            default:
                log(`Unknown command: ${cmd}. Type help.`);
        }
    };

    // Read commands from FIFO continuously
    const openFifo = () => {
        const stream = fs.createReadStream(FIFO);
        const rl = readline.createInterface({ input: stream });
        rl.on('line', (line) => {
            handleCmd(line).catch((e) => log('Command crashed:', String(e)));
        });
        rl.on('close', () => {
            // Re-open FIFO when writer closes (FIFO semantics)
            setTimeout(openFifo, 100);
        });
    };
    openFifo();

    // Keep process alive
    await new Promise(() => {});
})();
