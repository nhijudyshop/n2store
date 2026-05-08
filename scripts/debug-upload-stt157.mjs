// Reproduce the bug: upload #32240280 history claims B914 → STT 157,
// but the actual order STT 157 doesn't show B914. Inspect Firebase record
// (uploadResults, beforeSnapshot) to see if the upload reported success.

import { chromium } from 'playwright';

const BASE = process.env.BASE || 'http://localhost:8080';
const USER = process.env.U || 'admin';
const PASS = process.env.P || 'admin@@';
const TARGET_SHORT = process.env.SHORT || '32240280';
const TARGET_STT = process.env.STT || '157';
const TARGET_PCODE = process.env.PCODE || 'B914';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
const page = await ctx.newPage();

const log = (msg) => console.log(`[${new Date().toISOString().slice(11, 23)}] ${msg}`);

// 1) Login.
await page.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await page.fill('#username', USER);
await page.fill('#password', PASS);
await page.press('#password', 'Enter');
await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(1500);
log(`Login OK. URL=${page.url()}`);

// 2) Open tab3-product-assignment directly (not via main.html iframe — easier to drive).
await page.goto(`${BASE}/orders-report/tab3-product-assignment.html?t=${Date.now()}`, {
    waitUntil: 'domcontentloaded',
});
await page.waitForTimeout(8000);

// 3) Read Firebase directly for the upload record. The page already has Firebase
// initialized + auth session. Browse productAssignments_v2_history and find the
// record whose uploadId ends with TARGET_SHORT.
const result = await page.evaluate(async ({ shortKey, targetStt, pcode }) => {
    const out = { foundIn: null, record: null, error: null, sttDetails: null };
    try {
        const db = firebase.database();
        const allUsers = await db.ref('productAssignments_v2_history').once('value');
        const tree = allUsers.val() || {};

        // Find record whose firebaseKey ends with shortKey across all users
        let foundUserId = null;
        let foundFirebaseKey = null;
        let foundRecord = null;
        for (const [uid, recs] of Object.entries(tree)) {
            if (!recs || typeof recs !== 'object') continue;
            for (const [fk, rec] of Object.entries(recs)) {
                if (fk.endsWith(shortKey) || (rec && rec.uploadId && rec.uploadId.endsWith(shortKey))) {
                    foundUserId = uid;
                    foundFirebaseKey = fk;
                    foundRecord = rec;
                    break;
                }
            }
            if (foundRecord) break;
        }

        out.foundIn = { userId: foundUserId, firebaseKey: foundFirebaseKey };
        if (!foundRecord) {
            out.error = 'Record not found';
            return out;
        }

        out.record = {
            uploadId: foundRecord.uploadId,
            uploadStatus: foundRecord.uploadStatus,
            timestamp: foundRecord.timestamp,
            ts: new Date(foundRecord.timestamp).toISOString(),
            totalSTTs: foundRecord.totalSTTs ?? foundRecord.totalAssignments,
            successCount: foundRecord.successCount,
            failCount: foundRecord.failCount,
            uploadedSTTsCount: (foundRecord.uploadedSTTs || []).length,
            note: foundRecord.note || null,
        };

        // Find target STT in uploadResults
        const targetResult = (foundRecord.uploadResults || []).find((r) => String(r.stt) === String(targetStt));
        out.sttDetails = {
            inUploadResults: !!targetResult,
            success: targetResult?.success,
            error: targetResult?.error,
            orderId: targetResult?.orderId,
            existingProductsCodes: (targetResult?.existingProducts || []).map(
                (p) => p.code || p.productCode || (p.Product && p.Product.DefaultCode)
            ),
        };

        // Find target product B914 in beforeSnapshot.assignments to confirm the claim
        const assignments = foundRecord.beforeSnapshot?.assignments || [];
        const matchingAssignment = assignments.find(
            (a) => (a.productCode || '').toUpperCase() === pcode.toUpperCase()
        );
        out.assignmentClaim = matchingAssignment
            ? {
                  productCode: matchingAssignment.productCode,
                  productName: matchingAssignment.productName,
                  productId: matchingAssignment.productId,
                  sttList: (matchingAssignment.sttList || []).map((s) =>
                      typeof s === 'object' ? s.stt : s
                  ),
                  containsTargetStt: (matchingAssignment.sttList || [])
                      .map((s) => String(typeof s === 'object' ? s.stt : s))
                      .includes(String(targetStt)),
              }
            : null;

        // For comparison: check the ACTUAL TPOS state of the order
        if (targetResult?.orderId) {
            const orderId = targetResult.orderId;
            try {
                const url = `${window.API_CONFIG?.WORKER_URL || 'https://chatomni-proxy.nhijudyshop.workers.dev'}/api/odata/SaleOnline_Order(${orderId})?$expand=Details($expand=Product),Partner,User`;
                const headers = window.tokenManager
                    ? await window.tokenManager.getAuthHeader()
                    : {};
                const r = await fetch(url, { headers });
                if (r.ok) {
                    const ord = await r.json();
                    const codes = (ord.Details || []).map(
                        (d) => d.Product?.DefaultCode || d.ProductCode || ''
                    );
                    out.tposCurrentState = {
                        orderId,
                        Number: ord.Number,
                        SessionIndex: ord.SessionIndex,
                        ReceiverName: ord.ReceiverName,
                        DateInvoice: ord.DateInvoice,
                        productCodes: codes,
                        productCount: codes.length,
                        containsTargetProduct: codes
                            .map((c) => (c || '').toUpperCase())
                            .includes(pcode.toUpperCase()),
                    };
                } else {
                    out.tposCurrentState = { error: `TPOS fetch failed: ${r.status}` };
                }
            } catch (e) {
                out.tposCurrentState = { error: String(e) };
            }
        }

        // Removals: scan productRemovals_history for actions on TARGET_STT.
        try {
            const removalsAll = await db.ref('productRemovals_history').once('value');
            const removalsTree = removalsAll.val() || {};
            const removalsForStt = [];
            for (const [uid, recs] of Object.entries(removalsTree)) {
                if (!recs || typeof recs !== 'object') continue;
                for (const [hid, rec] of Object.entries(recs)) {
                    const success = (rec.results && rec.results.success) || [];
                    const hits = success.filter((x) => String(x.stt) === String(targetStt));
                    if (hits.length) {
                        removalsForStt.push({
                            historyId: hid,
                            ts: rec.timestamp ? new Date(rec.timestamp).toISOString() : null,
                            userId: uid,
                            removedProducts: hits.map((h) => ({
                                productCode: h.productCode || h.code || h.product?.DefaultCode,
                                productId: h.productId || h.product?.Id,
                                productName: h.productName,
                            })),
                        });
                    }
                }
            }
            removalsForStt.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));
            out.removalsTouchingStt = removalsForStt;
        } catch (e) {
            out.removalsTouchingStt = { error: String(e) };
        }

        // For comparison: list ALL upload records that touch TARGET_STT so we can spot overlap
        const overlap = [];
        for (const [uid, recs] of Object.entries(tree)) {
            if (!recs || typeof recs !== 'object') continue;
            for (const [fk, rec] of Object.entries(recs)) {
                const r = rec.uploadResults || [];
                const hit = r.find((x) => String(x.stt) === String(targetStt));
                if (hit) {
                    overlap.push({
                        userId: uid,
                        firebaseKey: fk.slice(-8),
                        uploadId: rec.uploadId,
                        ts: new Date(rec.timestamp).toISOString(),
                        success: hit.success,
                        error: hit.error,
                        productCodesInBeforeSnapshot: (rec.beforeSnapshot?.assignments || [])
                            .filter((a) =>
                                (a.sttList || [])
                                    .map((s) => String(typeof s === 'object' ? s.stt : s))
                                    .includes(String(targetStt))
                            )
                            .map((a) => a.productCode),
                    });
                }
            }
        }
        // Sort by timestamp
        overlap.sort((a, b) => a.ts.localeCompare(b.ts));
        out.allUploadsTouchingStt = overlap;
    } catch (e) {
        out.error = String(e);
    }
    return out;
}, { shortKey: TARGET_SHORT, targetStt: TARGET_STT, pcode: TARGET_PCODE });

console.log('===== TARGET UPLOAD =====');
console.log(JSON.stringify(result, null, 2));

await browser.close();
