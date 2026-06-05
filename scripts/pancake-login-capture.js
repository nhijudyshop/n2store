// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 helper (dev-only, gitignored output).
// =====================================================
// Pancake login REQUEST CAPTURE (headed browser)
// =====================================================
// Mở browser thật tới pancake.vn để user đăng nhập tay. Ghi lại SHAPE của
// request login (endpoint + field names) — password được REDACT. Mục đích:
// học login API để build harvester refresh token hàng loạt.
//
// Run: node scripts/pancake-login-capture.js
// Log: downloads/n2store-session/pancake-login-capture.log

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const LOG = path.join(__dirname, '..', 'downloads', 'n2store-session', 'pancake-login-capture.log');
function log(s) {
    fs.appendFileSync(LOG, s + '\n');
    process.stdout.write(s + '\n');
}

const SENS = /pass|secret|otp|credential/i;
function redact(obj) {
    if (obj == null || typeof obj !== 'object') return obj;
    const out = Array.isArray(obj) ? [] : {};
    for (const k of Object.keys(obj)) {
        if (SENS.test(k)) out[k] = '«redacted len=' + String(obj[k]).length + '»';
        else out[k] = typeof obj[k] === 'object' ? redact(obj[k]) : obj[k];
    }
    return out;
}

const MATCH = /login|sign[_-]?in|auth|token|session|pancake_id|users\/me/i;

(async () => {
    fs.writeFileSync(LOG, '[capture started ' + new Date().toISOString() + ']\n');
    const ctx = await chromium.launchPersistentContext('/tmp/pancake-capture-profile', {
        headless: false,
        viewport: null,
        args: ['--start-maximized'],
    });
    const page = ctx.pages()[0] || (await ctx.newPage());

    page.on('request', (req) => {
        const u = req.url();
        const m = req.method();
        if (m !== 'POST' || !MATCH.test(u)) return;
        let body = null;
        try {
            body = req.postData();
        } catch {
            /* */
        }
        let parsed = null;
        try {
            parsed = JSON.parse(body);
        } catch {
            parsed = body ? '«form/non-json len=' + body.length + '»' : null;
        }
        log('\n>>> REQUEST ' + m + ' ' + u);
        log('    content-type: ' + (req.headers()['content-type'] || ''));
        log('    body(redacted): ' + JSON.stringify(redact(parsed)));
    });

    page.on('response', async (resp) => {
        const req = resp.request();
        const u = resp.url();
        if (req.method() !== 'POST' || !MATCH.test(u)) return;
        log('<<< RESPONSE ' + resp.status() + ' ' + u);
        let txt = '';
        try {
            txt = await resp.text();
        } catch {
            /* */
        }
        let j = null;
        try {
            j = JSON.parse(txt);
        } catch {
            /* */
        }
        if (j) {
            log('    resp.keys: ' + JSON.stringify(Object.keys(j)));
            const walk = (o, p) => {
                if (o && typeof o === 'object') {
                    for (const k of Object.keys(o)) {
                        if (/token|jwt|access/i.test(k))
                            log(
                                '    >> token-field: ' +
                                    p +
                                    '.' +
                                    k +
                                    ' (len=' +
                                    String(o[k]).length +
                                    ')'
                            );
                        else if (typeof o[k] === 'object') walk(o[k], p + '.' + k);
                    }
                }
            };
            walk(j, 'resp');
        } else {
            log('    resp(non-json len=' + txt.length + ')');
        }
    });

    await page.goto('https://pancake.vn/login', { waitUntil: 'domcontentloaded' }).catch(() => {});
    log('[browser mở rồi — hãy ĐĂNG NHẬP pancake bằng id/password. Đang ghi request...]');

    let lastJwt = '';
    const poll = setInterval(async () => {
        try {
            const cs = await ctx.cookies('https://pancake.vn');
            const jc = cs.find((c) => c.name === 'jwt');
            if (jc && jc.value !== lastJwt) {
                lastJwt = jc.value;
                log('[✓ jwt cookie set — login THÀNH CÔNG, len=' + jc.value.length + ']');
            }
        } catch {
            /* */
        }
    }, 2000);

    await new Promise((r) => setTimeout(r, 30 * 60 * 1000)); // keep open 30 min
    clearInterval(poll);
    await ctx.close();
})();
