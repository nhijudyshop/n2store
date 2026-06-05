// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 helper (dev-only).
// =====================================================
// Pancake TOKEN HARVESTER — bulk auto-login + refresh JWT vào DB
// =====================================================
// Đăng nhập từng account Pancake (Playwright lái form login — tự xử lý
// CSRF/OAuth/redirect), lấy cookie `jwt`, upsert vào pancake_accounts (Render)
// qua endpoint /api/pancake-accounts/sync (cùng store web1/web2 dùng chung).
//
// CREDENTIALS: đọc từ file gitignored `pancake-creds.local.txt`, mỗi dòng:
//     identity|password            (identity = email / SĐT / username)
//   hoặc
//     identity,password
//   (dòng trống & dòng bắt đầu '#' bị bỏ qua)
//
// KHÔNG echo password / token ra log. Chỉ in identity (rút gọn) + kết quả.
//
// Run:
//   node scripts/pancake-token-harvester.js                 # headless
//   node scripts/pancake-token-harvester.js --headed        # hiện browser (nếu bị chặn bot)
//   node scripts/pancake-token-harvester.js --file path.txt # creds file khác
//   node scripts/pancake-token-harvester.js --dry           # login lấy token, KHÔNG ghi DB

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ARGS = process.argv.slice(2);
const HEADED = ARGS.includes('--headed');
const DRY = ARGS.includes('--dry');
const fileArg = (() => {
    const i = ARGS.indexOf('--file');
    return i >= 0 ? ARGS[i + 1] : null;
})();
const CREDS_FILE = fileArg || path.join(__dirname, '..', 'pancake-creds.local.txt');

const WORKER_URL = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const SYNC_URL = WORKER_URL + '/api/pancake-accounts/sync';
const LOGIN_URL = 'https://pancake.vn/login';
const PER_ACCOUNT_TIMEOUT = 60000;

function maskIdentity(id) {
    if (!id) return '?';
    if (id.length <= 6) return id[0] + '***';
    return id.slice(0, 3) + '***' + id.slice(-2);
}

function decodeJwt(token) {
    try {
        const p = token.split('.');
        if (p.length !== 3) return null;
        let b = p[1].replace(/-/g, '+').replace(/_/g, '/');
        const pad = b.length % 4;
        if (pad) b += '='.repeat(4 - pad);
        return JSON.parse(Buffer.from(b, 'base64').toString('utf-8'));
    } catch {
        return null;
    }
}

function parseCreds(text) {
    const out = [];
    for (const raw of text.split('\n')) {
        const line = raw.trim();
        if (!line || line.startsWith('#')) continue;
        const sep = line.includes('|') ? '|' : ',';
        const idx = line.indexOf(sep);
        if (idx < 0) continue;
        const identity = line.slice(0, idx).trim();
        const password = line.slice(idx + 1).trim();
        if (identity && password) out.push({ identity, password });
    }
    return out;
}

async function loginOne(browser, cred) {
    const ctx = await browser.newContext();
    const result = { identity: cred.identity, ok: false };
    try {
        const page = await ctx.newPage();
        page.setDefaultTimeout(PER_ACCOUNT_TIMEOUT);
        await page.goto(LOGIN_URL, { waitUntil: 'networkidle' });

        // Fill login form (account.pancake.vn OAuth page)
        await page.waitForSelector('input[name="identity"]', { timeout: 20000 });
        await page.waitForTimeout(800); // chờ form hydrate
        // Ant Design controlled inputs: phải gõ thật (pressSequentially) để
        // React onChange fire — page.fill() set DOM value nhưng state vẫn rỗng
        // → submit báo "Email không được để trống".
        const idEl = page.locator('input[name="identity"]');
        await idEl.click();
        await idEl.pressSequentially(cred.identity, { delay: 25 });
        const pwEl = page.locator('input[name="password"]');
        await pwEl.click();
        await pwEl.pressSequentially(cred.password, { delay: 25 });
        await page.click('button[type="submit"]:has-text("Đăng nhập")');

        // Wait for jwt cookie on pancake.vn (login + oauth approve + redirect done)
        let jwt = null;
        const deadline = Date.now() + 35000;
        while (Date.now() < deadline) {
            // Some accounts show an OAuth approve button on first authorize
            const approveBtn = await page
                .$(
                    'button:has-text("Cho phép"), button:has-text("Đồng ý"), button:has-text("Allow")'
                )
                .catch(() => null);
            if (approveBtn) await approveBtn.click().catch(() => {});

            const cookies = await ctx.cookies('https://pancake.vn').catch(() => []);
            const jc = cookies.find((c) => c.name === 'jwt' && c.value && c.value.length > 50);
            if (jc) {
                jwt = jc.value;
                break;
            }
            // OTP / verification challenge → cannot automate
            const otp = await page
                .$('input[name*="otp" i], input[placeholder*="OTP" i], input[placeholder*="mã" i]')
                .catch(() => null);
            if (otp) {
                result.reason = 'needs_otp';
                await ctx.close();
                return result;
            }
            await page.waitForTimeout(1500);
        }

        if (!jwt) {
            // capture a hint of why (wrong pass shows an error toast)
            const errTxt = await page
                .$$eval(
                    '.ant-message-error, .ant-form-item-explain-error, [class*="error" i]',
                    (els) =>
                        els
                            .map((e) => e.innerText)
                            .filter(Boolean)
                            .join(' | ')
                            .slice(0, 120)
                )
                .catch(() => '');
            result.reason = errTxt || 'no_jwt_timeout';
            await ctx.close();
            return result;
        }

        const decoded = decodeJwt(jwt);
        result.uid = decoded?.uid || null;
        result.name = decoded?.fb_name || decoded?.name || null;
        result.exp = decoded?.exp || null;
        result.jwt = jwt; // kept in-memory only, never logged
        result.ok = true;
        await ctx.close();
        return result;
    } catch (e) {
        result.reason = (e.message || 'error').slice(0, 120);
        try {
            await ctx.close();
        } catch {
            /* */
        }
        return result;
    }
}

async function saveToDb(harvested) {
    const accounts = {};
    for (const r of harvested) {
        if (!r.ok || !r.uid || !r.jwt) continue;
        accounts[r.uid] = {
            token: r.jwt,
            exp: r.exp,
            uid: r.uid,
            name: r.name,
            savedAt: Date.now(),
        };
    }
    if (Object.keys(accounts).length === 0) return { upserted: 0 };
    const res = await fetch(SYNC_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accounts }),
    });
    const j = await res.json().catch(() => ({}));
    return { upserted: j.upserted ?? 0, status: res.status, raw: j };
}

(async () => {
    if (!fs.existsSync(CREDS_FILE)) {
        console.error('❌ Không thấy creds file:', CREDS_FILE);
        console.error('   Tạo file đó, mỗi dòng: identity|password');
        process.exit(1);
    }
    const creds = parseCreds(fs.readFileSync(CREDS_FILE, 'utf-8'));
    if (!creds.length) {
        console.error('❌ Creds file rỗng / sai format. Mỗi dòng: identity|password');
        process.exit(1);
    }
    console.log(
        `🔑 ${creds.length} account. Mode: ${HEADED ? 'headed' : 'headless'}${DRY ? ' (DRY, không ghi DB)' : ''}\n`
    );

    const browser = await chromium.launch({ headless: !HEADED });
    const harvested = [];
    for (let i = 0; i < creds.length; i++) {
        const c = creds[i];
        process.stdout.write(`[${i + 1}/${creds.length}] ${maskIdentity(c.identity)} … `);
        const r = await loginOne(browser, c);
        if (r.ok)
            console.log(
                `✓ uid=${r.uid} name=${r.name || '?'} exp=${r.exp ? new Date(r.exp * 1000).toISOString().slice(0, 10) : '?'}`
            );
        else console.log(`✗ ${r.reason || 'fail'}`);
        harvested.push(r);
    }
    await browser.close();

    const okCount = harvested.filter((r) => r.ok).length;
    console.log(`\n— Đăng nhập: ${okCount}/${creds.length} thành công —`);

    if (DRY) {
        console.log('(DRY) Bỏ qua ghi DB.');
    } else if (okCount > 0) {
        const save = await saveToDb(harvested);
        console.log(`💾 Đã upsert ${save.upserted} account vào DB (HTTP ${save.status || '?'}).`);
    }

    const failed = harvested.filter((r) => !r.ok);
    if (failed.length) {
        console.log('\n⚠ Cần xử lý tay:');
        for (const f of failed) console.log(`   - ${maskIdentity(f.identity)}: ${f.reason}`);
    }
})();
