// Visible demo cho bulk reconcile button.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';
const SLOW = Number(process.env.SLOW || 350);
const KEEP = Number(process.env.KEEP || 60);

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}`);

const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW,
    args: ['--window-size=1480,920', '--window-position=80,40'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
const page = await ctx.newPage();

log('1/7  Đăng nhập…');
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

log('2/7  Vào tab Gán Sản Phẩm - STT…');
await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

log('3/7  Mở Lịch Sử Upload V2…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(3500);

log('4/7  Highlight nút "Đối soát toàn chiến dịch" (vàng) trong header…');
await page.evaluate(() => {
    const btn = document.getElementById('reconcileAllCampaignBtn');
    if (btn) {
        btn.scrollIntoView({ behavior: 'smooth', block: 'center' });
        btn.style.outline = '3px solid red';
        btn.style.outlineOffset = '4px';
    }
});
await page.waitForTimeout(2500);

log('5/7  Click "Đối soát toàn chiến dịch" → mở picker…');
await page.click('#reconcileAllCampaignBtn');
await page.waitForTimeout(2000);

const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    return {
        optionCount: sel?.options.length || 0,
        selected: sel?.value,
        firstThree: [...(sel?.options || [])].slice(0, 3).map((o) => o.textContent.trim()),
    };
});
log(`     → picker: ${pickerInfo.optionCount} chiến dịch, default = "${pickerInfo.selected}"`);

log('6/7  Click "Chạy đối soát" → fetch Excel + so sánh…');
const t0 = Date.now();
await page.click('#bulkReconRunBtn');
await page
    .waitForFunction(
        () => {
            const out = document.getElementById('bulkReconRunOutput');
            const txt = out?.textContent || '';
            return txt.includes('khớp') || txt.includes('TPOS không có') || txt.includes('thành công') || txt.includes('Lỗi');
        },
        { timeout: 60000 }
    )
    .catch(() => {});
log(`     → render xong sau ${Date.now() - t0}ms`);

const final = await page.evaluate(() => {
    const out = document.getElementById('bulkReconRunOutput');
    return {
        summary: out?.querySelector('.alert')?.textContent.replace(/\s+/g, ' ').trim(),
        droppedRowsCount: out?.querySelectorAll('table tbody tr').length || 0,
    };
});
log(`     summary: ${final.summary}`);
log(`     drops:   ${final.droppedRowsCount} sản phẩm rớt`);

// Scroll panel kết quả lên đầu cho user xem
await page.evaluate(() => {
    const out = document.getElementById('bulkReconcileResults');
    if (out) out.scrollIntoView({ behavior: 'smooth', block: 'start' });
});

log('');
log(`7/7  ✅ Xong. Giữ browser ${KEEP}s để xem kết quả…`);
await page.waitForTimeout(KEEP * 1000);

await browser.close();
log('Đóng browser. Demo kết thúc.');
