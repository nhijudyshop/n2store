// Probe: scan productAssignments_v2_history for May 2026 uploads + extract campaigns.

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
    const db = firebase.database();
    const tree = (await db.ref('productAssignments_v2_history').once('value')).val() || {};
    const all = [];
    for (const [uid, recs] of Object.entries(tree)) {
        for (const [fk, rec] of Object.entries(recs || {})) {
            const ts = rec.timestamp || 0;
            const cnames = new Set();
            (rec.beforeSnapshot?.assignments || []).forEach((a) => {
                (a.sttList || []).forEach((sttItem) => {
                    if (typeof sttItem === 'object' && sttItem) {
                        const cname =
                            sttItem.orderInfo?.liveCampaignName ||
                            sttItem.orderInfo?.LiveCampaignName ||
                            '';
                        if (cname) cnames.add(cname);
                    }
                });
            });
            all.push({
                uid,
                fk: fk.slice(-10),
                ts,
                tsStr: new Date(ts).toISOString(),
                campaigns: [...cnames],
            });
        }
    }
    all.sort((a, b) => b.ts - a.ts);

    // Filter to May 2026 uploads
    const may = all.filter((x) => x.tsStr.startsWith('2026-05'));
    const totalUsers = new Set(all.map((x) => x.uid));
    const adminMay = may.filter((x) => x.uid === 'admin');

    return {
        totalRecords: all.length,
        totalUsers: totalUsers.size,
        userIds: [...totalUsers],
        mayCount: may.length,
        mayCampaigns: [...new Set(may.flatMap((x) => x.campaigns))],
        mayByUser: Object.fromEntries(
            [...totalUsers].map((u) => [u, may.filter((x) => x.uid === u).length])
        ),
        adminLatest5: all.filter((x) => x.uid === 'admin').slice(0, 5).map((x) => ({
            ts: x.tsStr.slice(0, 10),
            fk: x.fk,
            campaigns: x.campaigns,
        })),
        topRecent5: all.slice(0, 5).map((x) => ({
            uid: x.uid,
            ts: x.tsStr.slice(0, 10),
            campaigns: x.campaigns,
        })),
    };
});

console.log(JSON.stringify(out, null, 2));
await browser.close();
