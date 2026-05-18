// Visible browser demo — chạy non-headless để user xem trực tiếp.
// Mở Chrome → login → tab3 → Lịch Sử Upload → click "Đối Soát TPOS" trên 1 card →
// đợi reconcile xong → giữ browser mở 30s để user nhìn rồi tự đóng.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const SLOW = Number(process.env.SLOW || 250); // ms slow-mo cho mỗi action
const KEEP_OPEN_S = Number(process.env.KEEP || 60); // giây giữ browser sau khi xong

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);

const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW,
    args: ['--window-size=1480,920', '--window-position=80,40'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
const page = await ctx.newPage();

log('1/6  Đăng nhập…');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

log('2/6  Vào tab Gán Sản Phẩm - STT…');
await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

log('3/6  Mở Lịch Sử Upload V2…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(3500);

log('4/6  Cuộn xem nút Đối Soát TPOS mới (vàng)…');
await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.btn-warning')].find((b) =>
        (b.textContent || '').includes('Đối Soát TPOS')
    );
    if (btn) btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
});
await page.waitForTimeout(2500);

log('5/6  Click "Đối Soát TPOS" trên card đầu tiên…');
const target = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button.btn-warning')].find(
        (b) => (b.textContent || '').includes('Đối Soát TPOS') && b.offsetParent !== null
    );
    if (!btn) return null;
    btn.setAttribute('data-demo-target', '1');
    return {
        onclick: btn.getAttribute('onclick'),
        text: btn.textContent.replace(/\s+/g, ' ').trim(),
    };
});
log(`     → button: ${JSON.stringify(target)}`);
await page.click('button[data-demo-target="1"]');

log('6/6  Đợi reconcile render (Excel TPOS đang tải)…');
const t0 = Date.now();
await page
    .waitForFunction(
        () => {
            const el = document.getElementById('tab3ReconcileResults');
            const txt = el?.textContent || '';
            return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('Lỗi');
        },
        { timeout: 60000 }
    )
    .catch(() => {});
log(`     → render xong sau ${Date.now() - t0}ms`);

const final = await page.evaluate(() => {
    const el = document.getElementById('tab3ReconcileResults');
    if (!el) return { error: 'no element' };
    return {
        summary: el.querySelector('.alert')?.textContent.replace(/\s+/g, ' ').trim(),
        excelLine: el.querySelector('.text-muted.small')?.textContent.replace(/\s+/g, ' ').trim(),
        droppedRowsCount: el.querySelectorAll('table tbody tr').length,
    };
});
log(`     summary: ${final.summary}`);
log(`     excel:   ${final.excelLine}`);
log(`     drops:   ${final.droppedRowsCount} row(s)`);

// Scroll modal-body để thấy bảng kết quả full
await page.evaluate(() => {
    const el = document.getElementById('tab3ReconcileResults');
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

log('');
log(`✅ Xong. Giữ browser mở ${KEEP_OPEN_S}s để xem (Ctrl+C để đóng sớm)…`);
await page.waitForTimeout(KEEP_OPEN_S * 1000);

await browser.close();
log('Đóng browser. Kết thúc demo.');
