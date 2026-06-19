// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 — deep interactive click-all probe v2 (modal scroll + fill inputs + inner buttons).
// Drive persistent browser session (n2store-browser-session.js HTTP /cmd) qua tất cả trang
// Web 2.0. Mỗi trang: điền input an toàn → click MỌI nút an toàn → khi mở modal thì
// scroll + điền input modal + click nút an toàn TRONG modal → đóng. Bỏ destructive/commit.
// Bắt JS error + toast lỗi. KHÔNG bấm submit-commit (tránh mutate beta / gửi tin / tiền).
const http = require('http');

const PORT = Number(process.argv[2] || 9931);
const BASE = process.argv[3] || 'http://localhost:8080';
const ONLY = process.argv[4] || ''; // optional: chỉ chạy 1 page substring

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
    'web2/product-counter',
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
].filter((p) => !ONLY || p.includes(ONLY));

// Probe chạy trong page context (eval tự wrap async). Trả object JSON.
const PROBE = `
const errs=[];
const _ce=console.error; console.error=function(){try{var s=Array.from(arguments).map(function(a){return typeof a==='string'?a:((a&&a.message)||'')}).join(' '); if(!/favicon|net::ERR|Failed to load resource|404|ResizeObserver/i.test(s)) errs.push(s.slice(0,150));}catch(e){} return _ce.apply(console,arguments);};
window.addEventListener('error',function(e){var m=String(e.message||''); if(!/ResizeObserver|Script error/i.test(m)) errs.push('onerror:'+m.slice(0,120));});
window.addEventListener('unhandledrejection',function(e){errs.push('unhandled:'+String((e.reason&&e.reason.message)||e.reason||'').slice(0,120));});
const toastErrs=[];
try{var nm=window.notificationManager; if(nm&&nm.show){var _s=nm.show.bind(nm); nm.show=function(m,t){try{if(t==='error')toastErrs.push(String(m).slice(0,100));}catch(e){} return _s.apply(null,arguments);};}}catch(e){}
try{var P=window.Popup; if(P){['error','danger'].forEach(function(k){ if(typeof P[k]==='function'){var o=P[k].bind(P); P[k]=function(){try{toastErrs.push('popup.'+k+':'+String(arguments[0]||'').slice(0,80));}catch(e){} return o.apply(null,arguments);};}});}}catch(e){}

const SKIP=/đăng xuất|logout|xóa|xoá|\\bdelete\\b|remove|\\breset\\b|wipe|truncate|gỡ|thùng rác|huỷ đơn|hủy đơn|cancel order/i;
const COMMIT=/lưu|save|xác nhận|confirm|duyệt|approve|gửi|send|thanh toán|reject|từ chối|nạp tiền|rút tiền|trừ ví|cộng ví|submit|tạo phiếu|tạo pbh|chốt|gộp đơn|tách đơn|in bill|nhận hàng|hoàn tất/i;

function visible(el){ if(!el) return false; if(el.disabled) return false; if(el.offsetParent===null && getComputedStyle(el).position!=='fixed') return false; var r=el.getBoundingClientRect(); return r.width>0&&r.height>0; }
function label(b){ return ((b.textContent||'')+' '+(b.getAttribute&&(b.getAttribute('aria-label')||'')||'')+' '+(b.title||'')).trim().slice(0,40); }

function fillInputs(scope){
  var filled=0;
  var inputs=[].slice.call(scope.querySelectorAll('input,textarea,select')).filter(visible);
  inputs.forEach(function(el){
    try{
      var tag=el.tagName.toLowerCase(); var type=(el.type||'text').toLowerCase();
      if(type==='password'||type==='file'||type==='hidden'||type==='checkbox'||type==='radio'||el.readOnly) return;
      if(tag==='select'){ if(el.options&&el.options.length>1 && el.selectedIndex<=0){ el.selectedIndex=1; el.dispatchEvent(new Event('change',{bubbles:true})); filled++; } return; }
      if(el.value) return; // không đè giá trị sẵn có
      var v='test';
      if(type==='number') v='1';
      else if(type==='tel') v='0123456788';
      else if(type==='email') v='test@test.local';
      else if(type==='date') return; else if(type==='search'||type==='text') v='test';
      el.value=v; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); filled++;
    }catch(e){}
  });
  return filled;
}

function findOpenModal(){
  var sel='.modal,[class*=modal],[id*=Modal],[id*=modal],dialog[open],.w2-popup,.popup-overlay,[class*=overlay],[class*=drawer]';
  return [].slice.call(document.querySelectorAll(sel)).filter(function(m){
    if(m.hidden) return false; var st=getComputedStyle(m); if(st.display==='none'||st.visibility==='hidden'||parseFloat(st.opacity||'1')===0) return false;
    var r=m.getBoundingClientRect(); return r.width>120&&r.height>80;
  });
}
function closeModals(){
  var open=findOpenModal();
  open.forEach(function(m){ var cl=m.querySelector('[data-close],.modal-close,.close,[aria-label*=óng],[aria-label*=lose],[onclick*=close],[onclick*=hidden],.w2-popup-close'); if(cl){try{cl.click();}catch(e){}} });
  try{document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));}catch(e){}
  // hard-hide leftovers
  open.forEach(function(m){try{ if(m.classList){m.classList.remove('show','visible','active','open');} }catch(e){}});
}
async function interactModal(m, report){
  report.modalsOpened++;
  // 1) fill inputs
  try{ report.modalInputsFilled += fillInputs(m); }catch(e){ errs.push('modalfill:'+String(e.message||'').slice(0,70)); }
  // 2) scroll body bottom→top
  try{
    var body=m.querySelector('.modal-body,.w2-popup-body,[class*=body],[class*=content]')||m;
    body.scrollTop=body.scrollHeight; await new Promise(function(r){setTimeout(r,80);}); body.scrollTop=0;
  }catch(e){}
  // 3) click safe non-commit buttons inside modal
  var mb=[].slice.call(m.querySelectorAll('button,[role=button],.btn,.web2-btn')).filter(visible);
  for(var j=0;j<mb.length && j<12;j++){
    var t=label(mb[j]); if(SKIP.test(t)||COMMIT.test(t)) continue;
    // bỏ nút đóng (để vòng đóng cuối xử lý) để khỏi mất modal sớm
    if(/đóng|close|×|huỷ|hủy|cancel/i.test(t)) continue;
    try{ mb[j].click(); report.modalBtnClicked++; }catch(e){ errs.push('mbtn['+t.slice(0,18)+']:'+String(e.message||'').slice(0,60)); }
    await new Promise(function(r){setTimeout(r,90);});
    if(location.href!==report.startUrl) return; // navigated
  }
}

return (async function(){
  var report={ startUrl: location.href, totalButtons:0, clicked:0, skipDestructive:0, skipCommit:0, navAway:false, modalsOpened:0, modalBtnClicked:0, inputsFilled:0, modalInputsFilled:0 };
  // điền input trên trang trước
  try{ report.inputsFilled = fillInputs(document); }catch(e){ errs.push('pagefill:'+String(e.message||'').slice(0,70)); }
  await new Promise(function(r){setTimeout(r,120);});

  var all=[].slice.call(document.querySelectorAll('button,[role=button],.btn,.web2-btn,[data-action]')).filter(visible);
  report.totalButtons=all.length;
  for(var i=0;i<all.length && i<70;i++){
    var b=all[i]; if(!document.body.contains(b)) continue;
    var t=label(b);
    if(SKIP.test(t)){ report.skipDestructive++; continue; }
    if(COMMIT.test(t)){ report.skipCommit++; continue; }
    var before=findOpenModal().length;
    try{ b.click(); report.clicked++; }catch(e){ errs.push('click['+t.slice(0,22)+']:'+String(e.message||'').slice(0,70)); }
    await new Promise(function(r){setTimeout(r,160);});
    if(location.href!==report.startUrl){ report.navAway=true; break; }
    var openNow=findOpenModal();
    if(openNow.length>before && openNow[0]){
      try{ await interactModal(openNow[0], report); }catch(e){ errs.push('modal:'+String(e.message||'').slice(0,70)); }
      closeModals();
    } else {
      closeModals();
    }
    await new Promise(function(r){setTimeout(r,90);});
  }
  return Object.assign(report, { jsErrors: errs.slice(0,14), toastErrors: toastErrs.slice(0,8) });
})();
`;

function cmd(c, timeoutMs = 120000) {
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
        if (idx < 0) return { _raw: out.slice(0, 220) };
        return JSON.parse(out.slice(idx + 'eval → '.length));
    } catch (e) {
        return { _parseError: e.message, _raw: String(raw).slice(0, 220) };
    }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    const results = [];
    for (const p of PAGES) {
        const navUrl = `${BASE}/${p}/index.html?t=${Date.now()}`;
        await cmd(`nav ${navUrl}`);
        await sleep(4200);
        const raw = await cmd(`eval ${PROBE}`, 120000);
        const r = parseEval(raw);
        results.push({ page: p, ...r });
        const errN = (r.jsErrors || []).length + (r.toastErrors || []).length;
        const flag = errN > 0 ? '  ⚠️ ERR' : '';
        console.log(
            `${p.padEnd(32)} btn=${String(r.totalButtons ?? '?').padStart(3)} clk=${String(r.clicked ?? 0).padStart(3)} mdl=${r.modalsOpened ?? 0} mBtn=${r.modalBtnClicked ?? 0} inp=${r.inputsFilled ?? 0}+${r.modalInputsFilled ?? 0} nav=${r.navAway ? 'Y' : 'n'}${flag}`
        );
        if (errN) {
            (r.jsErrors || []).forEach((e) => console.log(`        JS:    ${e}`));
            (r.toastErrors || []).forEach((e) => console.log(`        TOAST: ${e}`));
        }
        if (r._parseError || r._raw)
            console.log(`        PARSE: ${r._parseError || ''} ${r._raw || ''}`);
    }
    const withErr = results.filter(
        (r) => (r.jsErrors || []).length + (r.toastErrors || []).length > 0
    );
    const totalClicks = results.reduce((s, r) => s + (r.clicked || 0), 0);
    const totalModals = results.reduce((s, r) => s + (r.modalsOpened || 0), 0);
    console.log('\n===== SUMMARY =====');
    console.log(
        `Pages: ${results.length} | safe clicks: ${totalClicks} | modals opened: ${totalModals} | pages w/ errors: ${withErr.length}`
    );
    if (withErr.length) console.log('Error pages: ' + withErr.map((r) => r.page).join(', '));
    else console.log('✅ No JS/toast errors on any page during deep interaction.');
    try {
        require('fs').writeFileSync(
            'downloads/n2store-session/clickall-v2-report.json',
            JSON.stringify(results, null, 2)
        );
    } catch (e) {}
})();
