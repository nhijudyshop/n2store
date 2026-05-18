// Visible demo: mở tab3 → modal Lịch Sử → click "Đối soát toàn chiến dịch"
// → chụp screenshot picker để user thấy chiến dịch mới nhất là gì.
// Đồng thời probe Firebase liveCampaignName của các upload mới nhất.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';
const SLOW = Number(process.env.SLOW || 350);
const KEEP = Number(process.env.KEEP || 90);

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}`);

const browser = await chromium.launch({
    headless: false,
    slowMo: SLOW,
    args: ['--window-size=1480,920', '--window-position=80,40'],
});
const ctx = await browser.newContext({ viewport: { width: 1440, height: 880 } });
const page = await ctx.newPage();

log('1/6  Đăng nhập admin…');
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

// Probe Firebase: 3 bản ghi NEWEST + liveCampaignName của chúng
log('3/6  Probe Firebase: 3 bản ghi mới nhất + liveCampaignName…');
const probe = await page.evaluate(async () => {
    const tree =
        (await firebase.database().ref('productAssignments_v2_history').once('value')).val() || {};
    const all = [];
    for (const [uid, recs] of Object.entries(tree)) {
        for (const [fk, rec] of Object.entries(recs || {})) {
            const cnames = new Set();
            (rec.beforeSnapshot?.assignments || []).forEach((a) => {
                (a.sttList || []).forEach((sttItem) => {
                    if (typeof sttItem === 'object' && sttItem) {
                        const c =
                            sttItem.orderInfo?.liveCampaignName ||
                            sttItem.orderInfo?.LiveCampaignName ||
                            '';
                        if (c) cnames.add(c);
                    }
                });
            });
            all.push({
                uid,
                fk: fk.slice(-10),
                ts: rec.timestamp || 0,
                tsStr: new Date(rec.timestamp || 0).toLocaleString('vi-VN'),
                campaigns: [...cnames],
            });
        }
    }
    all.sort((a, b) => b.ts - a.ts);
    return all.slice(0, 5);
});
log(`     Top 5 most recent records:`);
probe.forEach((r, i) =>
    log(`       ${i + 1}. ${r.tsStr}  user=${r.uid}  campaigns=[${r.campaigns.join(', ')}]`)
);

log('4/6  Mở Lịch Sử Upload V2…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(3500);

log('5/6  Click "Đối soát toàn chiến dịch" (header) → chụp picker…');
await page.click('#reconcileAllCampaignBtn');
// Wait for Firebase scan + picker render
await page
    .waitForFunction(() => !!document.getElementById('bulkReconCampaignSelect'), { timeout: 30000 })
    .catch(() => {});
await page.waitForTimeout(1000);

const pickerInfo = await page.evaluate(() => {
    const sel = document.getElementById('bulkReconCampaignSelect');
    return {
        defaultLabel: sel?.options[sel.selectedIndex]?.textContent.trim(),
        top10: [...(sel?.options || [])].slice(0, 10).map((o) => o.textContent.trim()),
    };
});
log(`     default: ${pickerInfo.defaultLabel}`);
log(`     top 10:`);
pickerInfo.top10.forEach((l, i) => log(`       ${i + 1}. ${l}`));

await page.screenshot({
    path: 'downloads/n2store-session/tab3-bulk-recon-picker.png',
    fullPage: false,
});
log('     → Screenshot lưu tại downloads/n2store-session/tab3-bulk-recon-picker.png');

log('');
log(`6/6  Giữ browser mở ${KEEP}s để xem trực tiếp…`);
await page.waitForTimeout(KEEP * 1000);
await browser.close();
log('Đóng browser.');
