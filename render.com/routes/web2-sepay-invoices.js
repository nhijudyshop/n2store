// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================================
// SePay invoices — theo dõi hóa đơn gói SePay (my.sepay.vn) + QR thanh toán.
//
// SePay userapi KHÔNG expose billing → đăng nhập my.sepay.vn (SEPAY_LOGIN_EMAIL/PASSWORD env)
// → DataTables ajax /invoices/ajax_invoices_list → list hóa đơn. Hóa đơn CHƯA thanh toán →
// QR VietQR (vietqr.app, MBBank account thu của SePay) để admin quét trả.
//
// Login flow (CodeIgniter CSRF): GET /login (csrf1) → POST /login/do_login → GET /invoices (csrf2)
// → POST ajax_invoices_list (csrf2). Cookie jar dedupe theo tên (ci_session regenerate khi login).
//
// Endpoint: GET /api/web2-sepay-invoices  (cache 10 phút — login tốn 3 round-trip).
// =====================================================================
const express = require('express');
const router = express.Router();

const BASE = 'https://my.sepay.vn';
const UA = 'Mozilla/5.0 (Macintosh) AppleWebKit/537.36 Chrome/120 Safari/537.36';
const CACHE_MS = 10 * 60 * 1000;
let _cache = { at: 0, data: null };

function csrfFrom(html) {
    const m =
        html.match(/name="csrf_main"\s+value="([^"]+)"/) ||
        html.match(/"csrf_main"\s*,\s*"([^"]+)"/);
    return m ? m[1] : '';
}
// Cookie jar dedupe theo tên (latest wins) — ci_session đổi sau login, không được gửi cookie cũ.
function makeJar() {
    const jar = {};
    return {
        add(setCookieArr) {
            (setCookieArr || []).forEach((c) => {
                const nv = c.split(';')[0];
                const i = nv.indexOf('=');
                if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
            });
        },
        str() {
            return Object.entries(jar)
                .map(([k, v]) => `${k}=${v}`)
                .join('; ');
        },
    };
}

function stripTags(s) {
    return String(s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}
function hrefIn(s) {
    const m = String(s || '').match(/href='([^']+)'|href="([^"]+)"/);
    return m ? m[1] || m[2] : '';
}
// des VietQR: 'SEP' + id pad 8 (vd 37172 → SEP00037172). amount = số tiền VND.
function buildQr(id, amountVnd) {
    return (
        'https://vietqr.app/img?bank=MBBank&acc=7788888678888&template=&amount=' +
        encodeURIComponent(amountVnd) +
        '&des=SEP' +
        String(id).padStart(8, '0')
    );
}

async function _login(jar, email, pass) {
    const r1 = await fetch(`${BASE}/login`, { headers: { 'User-Agent': UA } });
    jar.add(r1.headers.getSetCookie?.());
    const csrf1 = csrfFrom(await r1.text());
    const r2 = await fetch(`${BASE}/login/do_login`, {
        method: 'POST',
        redirect: 'manual',
        headers: {
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: jar.str(),
            Referer: `${BASE}/login`,
            'X-Requested-With': 'XMLHttpRequest',
        },
        body: new URLSearchParams({ csrf_main: csrf1, email, password: pass }).toString(),
    });
    jar.add(r2.headers.getSetCookie?.());
    let ok = false;
    try {
        ok = JSON.parse(await r2.text())?.status === true;
    } catch (_) {}
    return ok;
}

async function _fetchInvoices(email, pass) {
    const jar = makeJar();
    if (!(await _login(jar, email, pass)))
        throw new Error('SePay login thất bại (sai email/password?)');
    // GET /invoices → csrf cho ajax
    const rI = await fetch(`${BASE}/invoices`, {
        headers: { 'User-Agent': UA, Cookie: jar.str() },
    });
    jar.add(rI.headers.getSetCookie?.());
    const csrf2 = csrfFrom(await rI.text());
    // POST DataTables ajax
    const body = new URLSearchParams({
        csrf_main: csrf2,
        draw: '1',
        start: '0',
        length: '20',
        'order[0][column]': '0',
        'order[0][dir]': 'desc',
        'search[value]': '',
    });
    const rA = await fetch(`${BASE}/index.php/invoices/ajax_invoices_list`, {
        method: 'POST',
        headers: {
            'User-Agent': UA,
            Cookie: jar.str(),
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: `${BASE}/invoices`,
        },
        body: body.toString(),
    });
    if (!rA.ok) throw new Error('ajax_invoices_list HTTP ' + rA.status);
    const j = await rA.json();
    // row = [stt, '#id (link)', 'loại', 'trạng thái (badge)', 'số tiền đ', 'ngày', 'Xem (link)']
    const invoices = (j.data || []).map((row) => {
        const numCell = stripTags(row[1]);
        const id =
            (numCell.match(/#(\d+)/) || [])[1] || (hrefIn(row[1]).match(/\/(\d+)\b/) || [])[1];
        const status = stripTags(row[3]);
        const paid = /đã thanh toán/i.test(status);
        const amountStr = stripTags(row[4]); // '589,000 đ'
        const amountVnd = Number((amountStr.match(/[\d.,]+/) || ['0'])[0].replace(/[.,]/g, ''));
        return {
            id: id ? Number(id) : null,
            number: numCell.replace(/\s*Xem.*$/, '').trim(),
            type: stripTags(row[2]),
            status,
            paid,
            amountStr,
            amountVnd,
            date: stripTags(row[5]),
            detailUrl: hrefIn(row[6]) || hrefIn(row[1]) || '',
            qrUrl: !paid && id ? buildQr(id, amountVnd) : null, // QR chỉ cho hóa đơn chưa trả
        };
    });
    const unpaid = invoices.filter((i) => !i.paid);
    return {
        ok: true,
        fetchedAt: Date.now(),
        invoices,
        summary: {
            total: invoices.length,
            unpaidCount: unpaid.length,
            unpaidAmountVnd: unpaid.reduce((s, i) => s + i.amountVnd, 0),
            latestPaid: invoices.find((i) => i.paid) || null,
            monthlyVnd:
                (invoices.find((i) => i.paid && /gia hạn/i.test(i.type)) || {}).amountVnd || null,
        },
    };
}

// GET /api/web2-sepay-invoices  (?fresh=1 bỏ cache)
router.get('/', async (req, res) => {
    const email = process.env.SEPAY_LOGIN_EMAIL;
    const pass = process.env.SEPAY_LOGIN_PASSWORD;
    if (!email || !pass)
        return res.json({
            ok: false,
            error: 'Chưa cấu hình SEPAY_LOGIN_EMAIL / SEPAY_LOGIN_PASSWORD trên Render.',
            configured: false,
        });
    const fresh = req.query.fresh === '1';
    if (!fresh && _cache.data && Date.now() - _cache.at < CACHE_MS) {
        return res.json({ ..._cache.data, cached: true });
    }
    try {
        const data = await _fetchInvoices(email, pass);
        _cache = { at: Date.now(), data };
        res.json(data);
    } catch (e) {
        console.error('[SEPAY-INVOICES]', e.message);
        // còn cache cũ → trả kèm cảnh báo, không để trống
        if (_cache.data) return res.json({ ..._cache.data, cached: true, staleError: e.message });
        res.status(502).json({ ok: false, error: e.message });
    }
});

module.exports = router;
