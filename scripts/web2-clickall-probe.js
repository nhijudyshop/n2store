// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — interactive click-all probe (tạm, test rủi ro).
// Drive persistent browser session (n2store-browser-session.js HTTP /cmd) qua tất cả
// trang Web 2.0, click MỌI nút an toàn (bỏ destructive/logout/nav/commit), đóng modal
// giữa các click, bắt JS error + toast lỗi. KHÔNG bấm submit-commit (tránh mutate beta).
const http = require('http');

const PORT = Number(process.argv[2] || 9947);
const BASE = process.argv[3] || 'http://localhost:8080';

const PAGES = [
    'web2/overview',
    'web2/dashboard',
    'web2/kpi',
    'web2/notifications',
    'web2/audit-log',
    'web2/customers',
    'web2/customer-wallet',
    'web2/balance-history',
    'web2/ck-dashboard',
    'web2/supplier-wallet',
    'web2/supplier-debt',
    'web2/purchase-refund',
    'web2/products',
    'web2/variants',
    'web2/product-category',
    'web2/fastsaleorder-invoice',
    'web2/fastsaleorder-delivery',
    'web2/fastsaleorder-refund',
    'web2/returns',
    'web2/reconcile',
    'web2/payment-confirm',
    'web2/report-revenue',
    'web2/report-delivery',
    'web2/delivery-zone',
    'web2/jt-tracking',
    'web2/multi-tool',
    'web2/photo-studio',
    'web2/zalo',
    'web2/pancake-settings',
    'web2/printer-settings',
    'web2/users',
    'web2/users-permissions',
    'web2/system',
    'web2/services-dashboard',
    'web2/admin-sse-monitor',
    'web2/livestream-poller',
    'so-order',
    'native-orders',
    'live-chat',
];

// Probe chạy trong page context (eval tự wrap async). Trả object JSON.
const PROBE = `
const errs=[];
const _ce=console.error; console.error=function(){try{errs.push(Array.from(arguments).map(function(a){return typeof a==='string'?a:((a&&a.message)||'')}).join(' ').slice(0,140));}catch(e){} return _ce.apply(console,arguments);};
window.addEventListener('error',function(e){errs.push('onerror:'+String(e.message||'').slice(0,110));});
window.addEventListener('unhandledrejection',function(e){errs.push('unhandled:'+String((e.reason&&e.reason.message)||e.reason||'').slice(0,110));});
const toastErrs=[];
try{var nm=window.notificationManager; if(nm&&nm.show){var _s=nm.show.bind(nm); nm.show=function(m,t){try{if(t==='error')toastErrs.push(String(m).slice(0,90));}catch(e){} return _s.apply(null,arguments);};}}catch(e){}
const SKIP=/đăng xuất|logout|xóa|xoá|\\bdelete\\b|remove|\\breset\\b|wipe|truncate|gỡ|thùng rác/i;
const COMMIT=/lưu|save|xác nhận|confirm|duyệt|approve|gửi|send|thanh toán|reject|từ chối|nạp tiền|rút tiền|trừ ví|cộng ví|submit|tạo phiếu/i;
const startUrl=location.href;
const all=[].slice.call(document.querySelectorAll('button,[role=button],.btn,.web2-btn')).filter(function(b){
  if(!b||b.offsetParent===null) return false; if(b.disabled) return false; return true;
});
var clicked=0, skipDestr=0, skipCommit=0, navAway=false, modals=0;
function closeModals(){
  var open=[].slice.call(document.querySelectorAll('.modal,[class*=modal],[id*=Modal],[id*=modal],dialog[open]')).filter(function(m){return m.offsetParent!==null && getComputedStyle(m).display!=='none' && !m.hidden;});
  if(open.length){ modals++;
    open.forEach(function(m){ var cl=m.querySelector('[data-close],.modal-close,.close,[aria-label*=óng],[aria-label*=lose],[onclick*=close],[onclick*=hidden]'); if(cl){try{cl.click();}catch(e){}} });
    try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}catch(e){}
    [].slice.call(document.querySelectorAll('[id*=Modal],[id*=modal],.modal')).forEach(function(m){try{if(m.offsetParent!==null)m.hidden=true;}catch(e){}});
  }
}
return (async function(){
  for(var i=0;i<all.length && i<50;i++){
    var b=all[i];
    var t=((b.textContent||'')+' '+(b.getAttribute('aria-label')||'')+' '+(b.title||'')).trim().slice(0,40);
    if(SKIP.test(t)){ skipDestr++; continue; }
    if(COMMIT.test(t)){ skipCommit++; continue; }
    try{ b.click(); clicked++; }catch(e){ errs.push('click['+t.slice(0,24)+']:'+String(e.message||'').slice(0,80)); }
    await new Promise(function(r){setTimeout(r,150);});
    if(location.href!==startUrl){ navAway=true; break; }
    closeModals();
    await new Promise(function(r){setTimeout(r,100);});
  }
  return { totalButtons: all.length, clicked: clicked, skipDestructive: skipDestr, skipCommit: skipCommit, navAway: navAway, modalsOpened: modals, jsErrors: errs.slice(0,10), toastErrors: toastErrs.slice(0,6) };
})();
`;

function cmd(c, timeoutMs = 60000) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ cmd: c });
        const req = http.request(
            {
                host: '127.0.0.1',
                port: PORT,
                path: '/cmd',
                method: 'POST',
                headers: {
                    'content-type': 'application/json',
                    'content-length': Buffer.byteLength(body),
                },
                timeout: timeoutMs,
            },
            (res) => {
                let d = '';
                res.on('data', (x) => (d += x));
                res.on('end', () => resolve(d));
            }
        );
        req.on('error', (e) => resolve(JSON.stringify({ error: e.message })));
        req.on('timeout', () => {
            req.destroy();
            resolve(JSON.stringify({ error: 'timeout' }));
        });
        req.write(body);
        req.end();
    });
}

function parseEval(raw) {
    try {
        const o = JSON.parse(raw);
        const out = o.output || '';
        const idx = out.indexOf('eval → ');
        if (idx < 0) return { _raw: out.slice(0, 200) };
        return JSON.parse(out.slice(idx + 'eval → '.length));
    } catch (e) {
        return { _parseError: e.message, _raw: String(raw).slice(0, 200) };
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const results = [];
    for (const p of PAGES) {
        const url = `${BASE}/${p}/index.html?t=${Date.now()}`.replace(
            '//index.html',
            '/index.html'
        );
        const navUrl =
            p.includes('/') || ['so-order', 'native-orders', 'live-chat'].includes(p)
                ? `${BASE}/${p}/index.html?t=${Date.now()}`
                : url;
        await cmd(`nav ${navUrl}`);
        await sleep(3800);
        const raw = await cmd(`eval ${PROBE}`, 90000);
        const r = parseEval(raw);
        results.push({ page: p, ...r });
        const errN = (r.jsErrors || []).length + (r.toastErrors || []).length;
        const flag = errN > 0 ? '  ⚠️ ERR' : '';
        console.log(
            `${p.padEnd(34)} btn=${String(r.totalButtons ?? '?').padStart(3)} click=${String(r.clicked ?? 0).padStart(3)} skipD=${r.skipDestructive ?? 0} skipC=${r.skipCommit ?? 0} modal=${r.modalsOpened ?? 0} nav=${r.navAway ? 'Y' : 'n'}${flag}`
        );
        if (errN) {
            (r.jsErrors || []).forEach((e) => console.log(`        JS:    ${e}`));
            (r.toastErrors || []).forEach((e) => console.log(`        TOAST: ${e}`));
        }
        if (r._parseError || r._raw)
            console.log(`        PARSE: ${r._parseError || ''} ${r._raw || ''}`);
    }
    // summary
    const withErr = results.filter(
        (r) => (r.jsErrors || []).length + (r.toastErrors || []).length > 0
    );
    const totalClicks = results.reduce((s, r) => s + (r.clicked || 0), 0);
    console.log('\n===== SUMMARY =====');
    console.log(
        `Pages probed: ${results.length} | total safe clicks: ${totalClicks} | pages with errors: ${withErr.length}`
    );
    if (withErr.length) console.log('Pages with errors: ' + withErr.map((r) => r.page).join(', '));
    else console.log('✅ Không trang nào lỗi JS/toast khi click các nút an toàn.');
})();
