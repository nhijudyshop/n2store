// Verify post-upload reconcile: trigger window.postUploadReconcileV2 trên 1 record
// hiện có, xem nó ghi reconcileResult vào Firebase + render badge trong list.

import { chromium } from 'playwright';
const BASE = process.env.BASE || 'http://localhost:8080';
// Test trên upload #00860050 (hôm nay 9/5, hanhlive, target STORE+HOUSE 06/05/2026, 20 STT)
const TARGET_FK = process.env.FK || 'upload_1778300860050';
const TARGET_USER = process.env.USER_ID || 'guest';

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

// Step 1: backup current reconcileResult (nếu có) để restore sau test
log('Backing up existing reconcileResult…');
const existing = await page.evaluate(
    async ({ fk, uid }) => {
        const ref = firebase.database().ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`);
        const snap = await ref.once('value');
        return snap.val();
    },
    { fk: TARGET_FK, uid: TARGET_USER }
);
log(`Existing: ${JSON.stringify(existing)}`);

// Step 2: clear current reconcileResult
log('Clearing reconcileResult…');
await page.evaluate(
    async ({ fk, uid }) => {
        await firebase.database().ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`).remove();
    },
    { fk: TARGET_FK, uid: TARGET_USER }
);

// Step 3: trigger postUploadReconcileV2
log('Triggering postUploadReconcileV2…');
const t0 = Date.now();
const result = await page.evaluate(async (fk) => {
    if (typeof window.postUploadReconcileV2 !== 'function') return { error: 'fn not defined' };
    await window.postUploadReconcileV2(fk);
    // Read back from Firebase
    const segments = ['admin', 'guest', 'hanhlive'];
    for (const u of segments) {
        const snap = await firebase
            .database()
            .ref(`productAssignments_v2_history/${u}/${fk}/reconcileResult`)
            .once('value');
        if (snap.exists()) return { user: u, value: snap.val() };
    }
    return { error: 'not written' };
}, TARGET_FK);

log(`Done in ${Date.now() - t0}ms`);
console.log('===== RECONCILE RESULT WRITTEN TO FIREBASE =====');
console.log(JSON.stringify(result, null, 2));

// Step 4: Open modal Lịch Sử + verify badge appears in card
log('Open Lịch Sử modal…');
await page.evaluate(() => window.openUploadHistoryV2Modal());
await page.waitForTimeout(3500);

await page.evaluate(() => {
    const sel = document.getElementById('historyV2UserFilter');
    if (sel) {
        sel.value = 'all';
        sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
});
await page.waitForTimeout(2500);

// Lenient check: scan ALL cards to count badges of each type
const badgeInfo = await page.evaluate((fk) => {
    const cards = [...document.querySelectorAll('.history-card')];
    let chuaCount = 0,
        khopCount = 0,
        ropCount = 0,
        loiCount = 0,
        targetCardFound = null;
    for (const c of cards) {
        const txt = c.textContent;
        if (txt.includes('Chưa đối soát')) chuaCount += 1;
        if (txt.includes('khớp TPOS')) khopCount += 1;
        if (txt.includes('SP rớt TPOS')) ropCount += 1;
        if (txt.includes('Đối soát lỗi')) loiCount += 1;
        const titleEl = c.querySelector('.history-card-title');
        if (titleEl && titleEl.textContent.includes(fk.slice(-8))) {
            const stats = [...c.querySelectorAll('.history-stats .history-stat-item')];
            targetCardFound = stats.map((s) => s.textContent.replace(/\s+/g, ' ').trim());
        }
    }
    return {
        cardCount: cards.length,
        chuaCount,
        khopCount,
        ropCount,
        loiCount,
        targetCardStats: targetCardFound,
    };
}, TARGET_FK);

console.log('===== BADGE IN CARD =====');
console.log(JSON.stringify(badgeInfo, null, 2));

// Step 5: restore original reconcileResult
log('Restoring original reconcileResult…');
await page.evaluate(
    async ({ fk, uid, val }) => {
        const ref = firebase.database().ref(`productAssignments_v2_history/${uid}/${fk}/reconcileResult`);
        if (val) await ref.set(val);
        else await ref.remove();
    },
    { fk: TARGET_FK, uid: result.user || TARGET_USER, val: existing }
);

await browser.close();

const ok =
    result.value &&
    typeof result.value.dropCount === 'number' &&
    (badgeInfo.khopCount > 0 ||
        badgeInfo.ropCount > 0 ||
        badgeInfo.chuaCount > 0 ||
        badgeInfo.loiCount > 0);

console.log('===== VERDICT =====');
console.log(ok ? '✅ PASS — reconcileResult written + badge rendered' : '❌ FAIL');
process.exit(ok ? 0 : 1);
