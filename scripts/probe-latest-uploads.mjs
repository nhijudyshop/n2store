// Probe records with timestamp >= today 00:00 → list uploadId + liveCampaignName.
// Goal: confirm what campaign #06888131 + #06678443 actually target.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const page = await (await browser.newContext()).newPage();

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(6000);

const out = await page.evaluate(async () => {
    const tree =
        (await firebase.database().ref('productAssignments_v2_history').once('value')).val() || {};
    const today0 = new Date();
    today0.setHours(0, 0, 0, 0);
    const cutoff = today0.getTime();

    const todayRecords = [];
    for (const [uid, recs] of Object.entries(tree)) {
        for (const [fk, rec] of Object.entries(recs || {})) {
            const ts = rec.timestamp || 0;
            if (ts < cutoff) continue;
            const cnames = new Set();
            const sttCount = (rec.beforeSnapshot?.assignments || []).reduce((s, a) => {
                (a.sttList || []).forEach((sttItem) => {
                    if (typeof sttItem === 'object' && sttItem) {
                        const c =
                            sttItem.orderInfo?.liveCampaignName ||
                            sttItem.orderInfo?.LiveCampaignName ||
                            '';
                        if (c) cnames.add(c);
                    }
                });
                return s + (a.sttList?.length || 0);
            }, 0);
            todayRecords.push({
                uid,
                fk: fk.slice(-10),
                tsStr: new Date(ts).toLocaleString('vi-VN'),
                ts,
                campaigns: [...cnames],
                sttCount,
            });
        }
    }
    todayRecords.sort((a, b) => b.ts - a.ts);

    // Aggregate today's campaigns
    const allCampaignsToday = [...new Set(todayRecords.flatMap((r) => r.campaigns))];

    return {
        totalToday: todayRecords.length,
        campaignsTodayTouches: allCampaignsToday,
        records: todayRecords.map((r) => ({
            tsStr: r.tsStr,
            uid: r.uid,
            fk: r.fk,
            sttCount: r.sttCount,
            campaigns: r.campaigns,
        })),
    };
});

console.log(`Total today's records: ${out.totalToday}`);
console.log(`Campaigns touched today: ${JSON.stringify(out.campaignsTodayTouches)}`);
console.log('\nList today (newest first):');
out.records.slice(0, 30).forEach((r, i) => {
    console.log(`  ${i + 1}. ${r.tsStr}  user=${r.uid}  fk=#${r.fk}  ${r.sttCount} STT  campaigns=[${r.campaigns.join(', ')}]`);
});

await browser.close();
