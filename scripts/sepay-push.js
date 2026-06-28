#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0.
// =====================================================================
// sepay-push — scrape hóa đơn SePay TỪ MÁY IP NHÀ rồi đẩy snapshot lên Render.
//
// Lý do: SePay (Cloudflare WAF) CHẶN IP datacenter Render (403). Máy IP nhà (Mac/shop) login OK →
// script này scrape /invoices + dựng QR VietQR → POST /api/web2-sepay-invoices/push (secret).
// Trang web2/system tab Services đọc snapshot này khi server không tự lấy được.
//
// Chạy:  node scripts/sepay-push.js            (đọc creds + secret + worker URL từ serect_dont_push.txt)
// Định kỳ: launchd/cron mỗi 30-60 phút (xem scripts/sepay-push.plist).
// =====================================================================
const fs = require('fs');
const path = require('path');

const SECRETS = path.join(__dirname, '..', 'serect_dont_push.txt');
const BASE = 'https://my.sepay.vn';
const UA =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function read(file) {
    return fs.readFileSync(file, 'utf8');
}
function creds(sec) {
    const m = sec.match(/do_login[\s\S]*?"body"\s*:\s*"([^"]+)"/);
    if (!m) throw new Error('Không thấy block do_login trong secrets');
    const p = new URLSearchParams(m[1].replace(/\\u0026/g, '&'));
    return { email: p.get('email'), pass: p.get('password') };
}
function pushSecret(sec) {
    return (sec.match(/SEPAY_PUSH_SECRET[^:]*:\s*(\S+)/) || [])[1];
}
function workerUrl(sec) {
    return (
        (sec.match(/chatomni-proxy[^\s"']+/) || [])[0]?.replace(/\/+$/, '') ||
        'https://chatomni-proxy.nhijudyshop.workers.dev'
    );
}
const csrfOf = (h) => (h.match(/name="csrf_main"\s+value="([^"]+)"/) || [])[1] || '';
function makeJar() {
    const jar = {};
    return {
        add: (a) =>
            (a || []).forEach((c) => {
                const nv = c.split(';')[0];
                const i = nv.indexOf('=');
                if (i > 0) jar[nv.slice(0, i).trim()] = nv.slice(i + 1);
            }),
        str: () =>
            Object.entries(jar)
                .map(([k, v]) => `${k}=${v}`)
                .join('; '),
    };
}
const strip = (s) =>
    String(s || '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
const hrefIn = (s) => {
    const m = String(s || '').match(/href='([^']+)'|href="([^"]+)"/);
    return m ? m[1] || m[2] : '';
};
const qrUrl = (id, amt) =>
    `https://vietqr.app/img?bank=MBBank&acc=7788888678888&template=&amount=${encodeURIComponent(amt)}&des=SEP${String(id).padStart(8, '0')}`;
const H = (extra) => ({
    'User-Agent': UA,
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'vi-VN,vi;q=0.9,en;q=0.8',
    'Sec-Ch-Ua': '"Chromium";v="126", "Google Chrome";v="126", "Not.A/Brand";v="24"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"macOS"',
    'Sec-Fetch-Dest': 'empty',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Site': 'same-origin',
    Origin: BASE,
    ...extra,
});

async function scrape(email, pass) {
    const jar = makeJar();
    const r1 = await fetch(`${BASE}/login`, { headers: H() });
    jar.add(r1.headers.getSetCookie?.());
    const csrf1 = csrfOf(await r1.text());
    const r2 = await fetch(`${BASE}/login/do_login`, {
        method: 'POST',
        redirect: 'manual',
        headers: H({
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: jar.str(),
            Referer: `${BASE}/login`,
        }),
        body: new URLSearchParams({ csrf_main: csrf1, email, password: pass }).toString(),
    });
    jar.add(r2.headers.getSetCookie?.());
    if (JSON.parse(await r2.text())?.status !== true) throw new Error('login fail (creds?)');
    const rI = await fetch(`${BASE}/invoices`, { headers: H({ Cookie: jar.str() }) });
    jar.add(rI.headers.getSetCookie?.());
    const csrf2 = csrfOf(await rI.text());
    const rA = await fetch(`${BASE}/index.php/invoices/ajax_invoices_list`, {
        method: 'POST',
        headers: H({
            Cookie: jar.str(),
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded',
            Referer: `${BASE}/invoices`,
        }),
        body: new URLSearchParams({
            csrf_main: csrf2,
            draw: '1',
            start: '0',
            length: '20',
            'order[0][column]': '0',
            'order[0][dir]': 'desc',
            'search[value]': '',
        }).toString(),
    });
    if (!rA.ok) throw new Error('ajax HTTP ' + rA.status);
    const j = await rA.json();
    const invoices = (j.data || []).map((row) => {
        const numCell = strip(row[1]);
        const id =
            (numCell.match(/#(\d+)/) || [])[1] || (hrefIn(row[1]).match(/\/(\d+)\b/) || [])[1];
        const paid = /đã thanh toán/i.test(strip(row[3]));
        const amountStr = strip(row[4]);
        const amountVnd = Number((amountStr.match(/[\d.,]+/) || ['0'])[0].replace(/[.,]/g, ''));
        return {
            id: id ? Number(id) : null,
            number: numCell.replace(/\s*Xem.*$/, '').trim(),
            type: strip(row[2]),
            status: strip(row[3]),
            paid,
            amountStr,
            amountVnd,
            date: strip(row[5]),
            qrUrl: !paid && id ? qrUrl(id, amountVnd) : null,
        };
    });
    const unpaid = invoices.filter((i) => !i.paid);
    return {
        invoices,
        summary: {
            total: invoices.length,
            unpaidCount: unpaid.length,
            unpaidAmountVnd: unpaid.reduce((s, i) => s + i.amountVnd, 0),
            monthlyVnd:
                (invoices.find((i) => i.paid && /gia hạn/i.test(i.type)) || {}).amountVnd || null,
        },
    };
}

(async () => {
    const sec = read(SECRETS);
    const { email, pass } = creds(sec);
    const secret = pushSecret(sec);
    const worker = workerUrl(sec);
    if (!secret) throw new Error('Thiếu SEPAY_PUSH_SECRET trong secrets (chạy lại setup)');
    const data = await scrape(email, pass);
    const r = await fetch(`${worker}/api/web2-sepay-invoices/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ secret, ...data }),
    });
    const j = await r.json();
    console.log(
        `[sepay-push] ${new Date().toISOString()} → ${j.ok ? 'OK stored ' + j.stored : 'FAIL ' + (j.error || r.status)} | ` +
            `${data.summary.total} HĐ, ${data.summary.unpaidCount} chưa trả, gói ${data.summary.monthlyVnd || '?'}đ`
    );
    process.exit(j.ok ? 0 : 1);
})().catch((e) => {
    console.error('[sepay-push] ERR', e.message);
    process.exit(1);
});
