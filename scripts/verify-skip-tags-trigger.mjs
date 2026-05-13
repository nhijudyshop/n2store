// Find an upload that targets campaign 23/04/2026 (has skip tags),
// run reconcile, verify skippedCount > 0.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${m}`);

await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', 'admin');
await page.fill('#password', 'admin@@');
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);

await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(7000);

// Sample-driven: fetch a few campaigns' Excel, build skip-stt set per campaign,
// then scan all uploads for ANY (cname, stt) overlap with skip-stt.
log('Scanning campaigns for skip-stts, then finding upload overlap…');
const candidate = await page.evaluate(async () => {
    const WORKER =
        window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev';
    const headers = await window.tokenManager.getAuthHeader();
    const odataRes = await fetch(
        `${WORKER}/api/odata/SaleOnline_LiveCampaign?$top=40&$orderby=DateCreated+desc`,
        { headers: { ...headers, Accept: 'application/json' } }
    );
    const odata = await odataRes.json();
    const campaigns = (odata.value || []).slice(0, 20).filter((c) => c.Id && c.Name);

    const skipNorm = (s) =>
        String(s || '')
            .normalize('NFD')
            .replace(/[̀-ͯ]/g, '')
            .replace(/đ/gi, 'd')
            .toLowerCase()
            .trim()
            .replace(/\s+/g, ' ');
    const SKIP = new Set(['da gop ko chot', 'khong can chot']);

    // campaignName → Set<sttStr with skip tag>
    const skipByCampaign = new Map();
    for (const c of campaigns) {
        try {
            const url = `${WORKER}/api/SaleOnline_Order/ExportFile?campaignId=${c.Id}&sort=date`;
            const r = await fetch(url, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json', Accept: '*/*' },
                body: JSON.stringify({ data: '{}' }),
            });
            if (!r.ok) continue;
            const buf = await r.arrayBuffer();
            const wb = XLSX.read(buf, { type: 'array' });
            const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {
                range: 2,
                defval: null,
            });
            const cols = rows.length ? Object.keys(rows[0]) : [];
            const sttKey = cols.find((k) => k === '###') || cols[1];
            const tagKey =
                cols.find((k) => /^Nh[aã]n$/i.test(k)) || cols.find((k) => /Nh[aã]n/i.test(k));
            if (!tagKey) continue;
            const skipSet = new Set();
            for (const row of rows) {
                const t = String(row[tagKey] || '');
                if (!t) continue;
                for (const tok of t.split(/[,;\/\n\r]+/).map((x) => x.trim()).filter(Boolean)) {
                    if (SKIP.has(skipNorm(tok))) {
                        skipSet.add(String(row[sttKey] || '').trim());
                        break;
                    }
                }
            }
            if (skipSet.size > 0) skipByCampaign.set(c.Name, skipSet);
        } catch (_) {}
    }

    // Now scan uploads for overlap
    const tree =
        (await firebase.database().ref('productAssignments_v2_history').once('value')).val() || {};
    let best = null;
    for (const [uid, recs] of Object.entries(tree)) {
        for (const [fk, rec] of Object.entries(recs || {})) {
            let overlap = 0;
            (rec.beforeSnapshot?.assignments || []).forEach((a) => {
                (a.sttList || []).forEach((sttItem) => {
                    if (typeof sttItem !== 'object' || !sttItem) return;
                    const cname =
                        sttItem.orderInfo?.liveCampaignName ||
                        sttItem.orderInfo?.LiveCampaignName ||
                        '';
                    const skipSet = skipByCampaign.get(cname);
                    if (skipSet && skipSet.has(String(sttItem.stt))) {
                        overlap += 1;
                    }
                });
            });
            if (overlap > 0 && (!best || overlap > best.overlap)) {
                best = { uid, fk, overlap };
            }
        }
    }
    return best;
});
log(`Candidate: ${JSON.stringify(candidate)}`);
if (!candidate) {
    console.log('FAIL: no upload found targeting 23/04/2026');
    await browser.close();
    process.exit(1);
}

log('Backup existing reconcileResult…');
const existing = await page.evaluate(
    async ({ fk, uid }) => {
        const ref = firebase
            .database()
            .ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`);
        const snap = await ref.once('value');
        return snap.val();
    },
    { fk: candidate.fk, uid: candidate.uid }
);

log('Clear + trigger postUploadReconcileV2…');
const result = await page.evaluate(
    async ({ fk, uid }) => {
        await firebase
            .database()
            .ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`)
            .remove();
        await window.postUploadReconcileV2(fk);
        const snap = await firebase
            .database()
            .ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`)
            .once('value');
        return snap.val();
    },
    { fk: candidate.fk, uid: candidate.uid }
);

console.log('===== RECONCILE RESULT =====');
console.log(JSON.stringify(result, null, 2));

const samples = (result.skipped || []).slice(0, 5);
console.log('\nSkipped samples:');
for (const s of samples) {
    console.log(`  STT ${s.stt} · ${s.productCode} · tag: ${s.reason} · campaign: ${s.fromCampaign}`);
}

// Restore
await page.evaluate(
    async ({ fk, uid, val }) => {
        const ref = firebase
            .database()
            .ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`);
        if (val) await ref.set(val);
        else await ref.remove();
    },
    { fk: candidate.fk, uid: candidate.uid, val: existing }
);

console.log('===== VERDICT =====');
const ok = (result.skippedCount || 0) > 0 && (result.skipped || []).length > 0;
console.log(ok ? `✅ PASS — skippedCount=${result.skippedCount}, recognized skip tags from Excel` : '❌ FAIL — no skipped detected');

await browser.close();
process.exit(ok ? 0 : 1);
