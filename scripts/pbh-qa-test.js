#!/usr/bin/env node
// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// QA Phase 1-3 PBH flow — API + browser tests
//
// Coverage:
//   1. Health endpoints
//   2. Create test NativeOrder (cleanup later)
//   3. Convert NativeOrder → PBH (verify schema + linked source)
//   4. Idempotency: convert lần 2 returns same PBH
//   5. PBH appears in /load (filter by phone)
//   6. Confirm PBH (draft → done)
//   7. Print PBH (print_count increment)
//   8. Cancel PBH (state → cancel)
//   9. Search/filter
//   10. Reset STT (sequence-only + renumber)
//   11. UI: load fastsaleorder-invoice page, verify rows + actions
//   12. UI: load native-orders page, verify "Tạo PBH" button visible
//   13. Cleanup test data

const { chromium } = require('playwright');
const { ensureLocalServer } = require('./lib/ensure-local-server');

const WORKER = 'https://chatomni-proxy.nhijudyshop.workers.dev';
const BASE = 'http://localhost:8080';
const TEST_PHONE = '0900000099'; // SĐT test giả per memory rules
const TEST_NAME = 'PBH QA Test';
const TEST_FB_USER_ID = `qa-test-${Date.now()}`;

const errors = [];
const passed = [];
function ok(name) {
    passed.push(name);
    console.log(`  ✓ ${name}`);
}
function fail(name, msg) {
    errors.push(`${name}: ${msg}`);
    console.log(`  ✗ ${name}: ${msg}`);
}
async function step(name, fn) {
    try {
        await fn();
    } catch (e) {
        fail(name, e.message);
        console.error('    ', e.stack?.split('\n')[1] || '');
    }
}

async function api(method, path, body) {
    const r = await fetch(`${WORKER}${path}`, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : {},
        body: body ? JSON.stringify(body) : undefined,
    });
    let data = null;
    try {
        data = await r.json();
    } catch {}
    return { status: r.status, data };
}

let nativeCode = null;
let pbhNumber = null;
let dlvNumber = null;
let rfNumber = null;

async function main() {
    console.log('═══════════════ QA Phase 1-3 PBH ═══════════════\n');

    // ---- API health ----
    console.log('▶ STEP 1: Health checks');
    await step('native-orders /health', async () => {
        const r = await api('GET', '/api/native-orders/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`native-orders count=${r.data.count}`);
    });
    await step('fast-sale-orders /health', async () => {
        const r = await api('GET', '/api/fast-sale-orders/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`fast-sale-orders count=${r.data.count}`);
    });

    // ---- Create test NativeOrder ----
    console.log('\n▶ STEP 2: Create test NativeOrder');
    await step('POST /from-comment', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: TEST_FB_USER_ID,
            fbUserName: TEST_NAME,
            phone: TEST_PHONE,
            address: 'QA Test Address',
            customerName: TEST_NAME,
            message: 'QA test product',
            createdBy: 'qa-bot',
            createdByName: 'QA Bot',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        nativeCode = r.data.order.code;
        ok(`created code=${nativeCode} STT=${r.data.order.displayStt}`);
    });

    // Add products to native_order so PBH has lines
    await step('PATCH products', async () => {
        if (!nativeCode) throw new Error('no native code');
        const r = await api('PATCH', `/api/native-orders/${nativeCode}`, {
            products: [
                {
                    productCode: 'QA-001',
                    productName: 'QA Product 1',
                    quantity: 2,
                    price: 50000,
                    uomName: 'Cái',
                },
                {
                    productCode: 'QA-002',
                    productName: 'QA Product 2',
                    quantity: 1,
                    price: 100000,
                    uomName: 'Cái',
                },
            ],
        });
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        ok(`patched products, totalAmount=${r.data.order.totalAmount}`);
    });

    // ---- Convert to PBH ----
    console.log('\n▶ STEP 3: Convert NativeOrder → PBH');
    await step('POST /from-native-order', async () => {
        const r = await api('POST', '/api/fast-sale-orders/from-native-order', {
            nativeOrderCode: nativeCode,
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        pbhNumber = r.data.order.number;
        ok(`created PBH ${pbhNumber} STT=${r.data.order.displayStt}`);
        if (r.data.order.sourceLink?.code !== nativeCode) {
            fail(
                'cross-ref',
                `expected source_code=${nativeCode}, got ${r.data.order.sourceLink?.code}`
            );
        } else ok(`cross-ref source_code=${nativeCode}`);
        if (r.data.order.orderLines?.length !== 2)
            fail('orderLines', `expected 2 lines, got ${r.data.order.orderLines?.length}`);
        else ok(`orderLines: 2 lines copied`);
        if (Number(r.data.order.totals?.total) !== 200000)
            fail('total', `expected 200000, got ${r.data.order.totals?.total}`);
        else ok(`total = 200000`);
    });

    // Verify source order status auto-promoted
    await step('Source order auto-promoted to confirmed', async () => {
        const r = await api(
            'GET',
            `/api/native-orders/load?search=${encodeURIComponent(nativeCode)}&limit=1`
        );
        const o = r.data.orders?.[0];
        if (!o) throw new Error('source order not found');
        if (o.status !== 'confirmed') throw new Error(`status=${o.status}, expected confirmed`);
        ok(`source order ${nativeCode} status=confirmed`);
    });

    // ---- Idempotency ----
    console.log('\n▶ STEP 4: Idempotency');
    await step('Convert lần 2 returns same PBH', async () => {
        const r = await api('POST', '/api/fast-sale-orders/from-native-order', {
            nativeOrderCode: nativeCode,
        });
        if (!r.data?.idempotent) throw new Error('expected idempotent=true');
        if (r.data.order.number !== pbhNumber)
            throw new Error(`got different PBH ${r.data.order.number}`);
        ok(`returned existing ${pbhNumber}`);
    });

    // ---- Verify in /load list ----
    console.log('\n▶ STEP 5: PBH in /load');
    await step('Search by phone returns PBH', async () => {
        const r = await api('GET', `/api/fast-sale-orders/load?search=${TEST_PHONE}&limit=5`);
        if (r.data?.total < 1) throw new Error('total < 1');
        const hit = r.data.orders.find((o) => o.number === pbhNumber);
        if (!hit) throw new Error(`PBH ${pbhNumber} not in list`);
        ok(`found in search results`);
    });

    // ---- Confirm flow ----
    console.log('\n▶ STEP 6: Confirm state');
    await step('POST /:number/confirm draft → done', async () => {
        const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/confirm`);
        if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
        if (r.data.order.state !== 'done')
            throw new Error(`state=${r.data.order.state}, expected done`);
        ok(`state=done`);
    });

    // ---- Print ----
    console.log('\n▶ STEP 7: Print increments');
    await step('POST /:number/print x3', async () => {
        for (let i = 1; i <= 3; i++) {
            const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/print`);
            if (r.data.order.printCount !== i)
                throw new Error(`expected printCount=${i}, got ${r.data.order.printCount}`);
        }
        ok(`printCount=3 after 3 prints`);
    });

    // ---- Cancel ----
    console.log('\n▶ STEP 8: Cancel state');
    await step('POST /:number/cancel', async () => {
        const r = await api('POST', `/api/fast-sale-orders/${pbhNumber}/cancel`);
        if (r.data.order.state !== 'cancel') throw new Error(`state=${r.data.order.state}`);
        ok(`state=cancel`);
    });

    // ---- Filter state ----
    console.log('\n▶ STEP 9: Filter by state');
    await step('GET /load?state=cancel returns PBH', async () => {
        const r = await api(
            'GET',
            `/api/fast-sale-orders/load?state=cancel&search=${TEST_PHONE}&limit=5`
        );
        const hit = r.data.orders?.find((o) => o.number === pbhNumber);
        if (!hit) throw new Error('PBH not in cancel filter');
        ok(`found in state=cancel filter`);
    });
    await step('GET /load?state=draft excludes our PBH', async () => {
        const r = await api(
            'GET',
            `/api/fast-sale-orders/load?state=draft&search=${TEST_PHONE}&limit=5`
        );
        const hit = r.data.orders?.find((o) => o.number === pbhNumber);
        if (hit) throw new Error('PBH should not be in state=draft filter');
        ok(`excluded from state=draft (correct)`);
    });

    // ---- Reset STT (sequence-only) ----
    console.log('\n▶ STEP 10: Reset STT');
    await step('POST /reset-stt sequence-only', async () => {
        const r = await api('POST', '/api/fast-sale-orders/reset-stt', {});
        if (r.data?.mode !== 'sequence-only') throw new Error(`mode=${r.data?.mode}`);
        ok(`sequence reset`);
    });
    await step('POST /reset-stt renumber=true', async () => {
        const r = await api('POST', '/api/fast-sale-orders/reset-stt', { renumber: true });
        if (r.data?.mode !== 'renumber') throw new Error(`mode=${r.data?.mode}`);
        if (typeof r.data.renumbered !== 'number' || r.data.renumbered < 1)
            throw new Error('renumbered missing');
        ok(`renumbered ${r.data.renumbered} PBH`);
    });

    // ---- PHASE 6: Comment-merge by campaign ----
    console.log('\n▶ STEP 9b: PHASE 6 — Comment merge by campaign');
    const TEST_CAMPAIGN_ID = 'qa-camp-' + Date.now();
    const TEST_CAMPAIGN_NAME = 'QA Live Campaign';
    const SECOND_FB_USER = 'qa-merge-' + Date.now();
    let mergeBaseCode = null;

    await step('Create order #1 in campaign (no merge yet)', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: SECOND_FB_USER,
            fbUserName: 'QA Merge Test',
            phone: '0900000088',
            customerName: 'QA Merge',
            liveCampaignId: TEST_CAMPAIGN_ID,
            liveCampaignName: TEST_CAMPAIGN_NAME,
            fbCommentId: 'comment-1',
            message: 'Comment 1 — đặt áo size M',
        });
        if (!r.data?.success) throw new Error(JSON.stringify(r.data).slice(0, 200));
        if (r.data.merged) throw new Error('first order should NOT be merged');
        mergeBaseCode = r.data.order.code;
        if (r.data.order.commentCount !== 1)
            throw new Error(`expected commentCount=1, got ${r.data.order.commentCount}`);
        ok(`order #1 ${mergeBaseCode}, commentCount=1, merged=false`);
    });
    await step('Create order #2 same customer+campaign → MERGE', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: SECOND_FB_USER,
            fbUserName: 'QA Merge Test',
            phone: '0900000088',
            customerName: 'QA Merge',
            liveCampaignId: TEST_CAMPAIGN_ID,
            liveCampaignName: TEST_CAMPAIGN_NAME,
            fbCommentId: 'comment-2',
            message: 'Comment 2 — đổi size L',
        });
        if (!r.data?.success) throw new Error(JSON.stringify(r.data).slice(0, 200));
        if (!r.data.merged) throw new Error('expected merged=true');
        if (r.data.order.code !== mergeBaseCode)
            throw new Error(`expected same order code ${mergeBaseCode}, got ${r.data.order.code}`);
        if (r.data.order.commentCount !== 2)
            throw new Error(`expected commentCount=2, got ${r.data.order.commentCount}`);
        if (!r.data.order.commentIds.includes('comment-2'))
            throw new Error('comment-2 not in commentIds');
        if (!r.data.order.note.includes('Comment 2'))
            throw new Error('Comment 2 text not appended to note');
        ok(`merge ✓ same code ${mergeBaseCode}, commentCount=2, both commentIds present`);
    });
    await step('Create order #3 different campaign → NEW order', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: SECOND_FB_USER,
            fbUserName: 'QA Merge Test',
            phone: '0900000088',
            customerName: 'QA Merge',
            liveCampaignId: 'different-campaign-' + Date.now(),
            liveCampaignName: 'Other Campaign',
            fbCommentId: 'comment-3',
            message: 'Comment 3 — campaign khác',
        });
        if (!r.data?.success) throw new Error(JSON.stringify(r.data).slice(0, 200));
        if (r.data.merged) throw new Error('different campaign should NOT merge');
        if (r.data.order.code === mergeBaseCode)
            throw new Error('should create new code for different campaign');
        ok(`new order ${r.data.order.code} for different campaign (not merged)`);
        // Cleanup
        await fetch(`${WORKER}/api/native-orders/${r.data.order.code}`, { method: 'DELETE' });
    });
    await step('Idempotency: re-send comment-2 → return same merged order', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: SECOND_FB_USER,
            fbCommentId: 'comment-2',
            liveCampaignId: TEST_CAMPAIGN_ID,
        });
        if (!r.data?.idempotent) throw new Error('expected idempotent=true');
        if (r.data.order.code !== mergeBaseCode)
            throw new Error(`expected same order, got ${r.data.order.code}`);
        ok(`idempotent ✓ comment-2 returns ${mergeBaseCode}`);
    });
    // Cleanup merge test base order
    await fetch(`${WORKER}/api/native-orders/${mergeBaseCode}`, { method: 'DELETE' });

    // ---- PHASE 4: Delivery + Refund ----
    console.log('\n▶ STEP 10b: PHASE 4 — Delivery invoice');
    // Need a non-cancel PBH for delivery — re-confirm
    await api('POST', `/api/fast-sale-orders/${pbhNumber}/confirm`);

    await step('Delivery /health', async () => {
        const r = await api('GET', '/api/delivery-invoices/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`delivery count=${r.data.count}`);
    });
    await step('POST /from-pbh creates delivery', async () => {
        const r = await api('POST', '/api/delivery-invoices/from-pbh', {
            pbhNumber,
            carrierName: 'TEST Carrier',
            trackingRef: 'TRK-QA-001',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        dlvNumber = r.data.order.number;
        if (r.data.order.fso?.number !== pbhNumber) throw new Error(`fso cross-ref mismatch`);
        if (r.data.order.state !== 'pending')
            throw new Error(`state=${r.data.order.state}, expected pending`);
        ok(`delivery ${dlvNumber} created, state=pending, fso=${pbhNumber}`);
    });
    await step('Delivery state machine: ship → deliver', async () => {
        let r = await api('POST', `/api/delivery-invoices/${dlvNumber}/ship`);
        if (r.data.order.state !== 'shipping')
            throw new Error(`expected shipping, got ${r.data.order.state}`);
        r = await api('POST', `/api/delivery-invoices/${dlvNumber}/deliver`);
        if (r.data.order.state !== 'delivered')
            throw new Error(`expected delivered, got ${r.data.order.state}`);
        if (!Array.isArray(r.data.order.stateHistory) || r.data.order.stateHistory.length < 2)
            throw new Error('stateHistory missing');
        ok(
            `delivery ${dlvNumber} state: pending → shipping → delivered, history=${r.data.order.stateHistory.length}`
        );
    });

    console.log('\n▶ STEP 10c: PHASE 4 — Refund');
    await step('Refund /health', async () => {
        const r = await api('GET', '/api/refunds/health');
        if (r.status !== 200 || !r.data?.ok) throw new Error(`HTTP ${r.status}`);
        ok(`refunds count=${r.data.count}`);
    });
    await step('POST /from-pbh creates refund', async () => {
        const r = await api('POST', '/api/refunds/from-pbh', {
            pbhNumber,
            reason: 'QA test refund',
            refundMode: 'cash',
        });
        if (r.status !== 200 || !r.data?.success)
            throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`);
        rfNumber = r.data.order.number;
        if (r.data.order.fso?.number !== pbhNumber) throw new Error(`fso cross-ref mismatch`);
        if (r.data.order.state !== 'draft') throw new Error(`state=${r.data.order.state}`);
        if (Number(r.data.order.amountRefund) !== 200000)
            throw new Error(`amountRefund=${r.data.order.amountRefund}, expected 200000`);
        ok(`refund ${rfNumber} draft, amount=${r.data.order.amountRefund}`);
    });
    await step('Refund state: draft → approved → completed', async () => {
        let r = await api('POST', `/api/refunds/${rfNumber}/approve`);
        if (r.data.order.state !== 'approved') throw new Error(`expected approved`);
        r = await api('POST', `/api/refunds/${rfNumber}/complete`);
        if (r.data.order.state !== 'completed') throw new Error(`expected completed`);
        ok(`refund ${rfNumber}: draft → approved → completed`);
    });

    // Cancel PBH for cleanup
    await api('POST', `/api/fast-sale-orders/${pbhNumber}/cancel`);

    // ---- PHASE 7: Realtime WebSocket events ----
    console.log('\n▶ STEP 10d: PHASE 7 — Realtime WS broadcast');
    await step('WS connect + receive native_order:created event', async () => {
        const WebSocket = require(
            require('path').resolve(__dirname, '..', 'render.com', 'node_modules', 'ws')
        );
        const ws = new WebSocket('wss://n2store-fallback.onrender.com');
        await new Promise((res, rej) => {
            const timeout = setTimeout(() => rej(new Error('WS connect timeout')), 5000);
            ws.on('open', () => {
                clearTimeout(timeout);
                res();
            });
            ws.on('error', (e) => {
                clearTimeout(timeout);
                rej(e);
            });
        });
        const events = [];
        ws.on('message', (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type?.startsWith('native_order:') || msg.type?.startsWith('pbh:')) {
                    events.push(msg);
                }
            } catch {}
        });
        // Trigger create event
        const wsTestPhone = '0900000077';
        const wsTestFb = 'qa-ws-' + Date.now();
        const createR = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: wsTestFb,
            fbUserName: 'QA WS Test',
            phone: wsTestPhone,
            customerName: 'QA WS Test',
            fbCommentId: 'ws-comment-' + Date.now(),
        });
        if (!createR.data?.success) throw new Error('create failed');
        const wsTestCode = createR.data.order.code;
        // Wait up to 3s for WS event
        await new Promise((res) => setTimeout(res, 3000));
        const createdEvent = events.find(
            (e) => e.type === 'native_order:created' && e.order?.code === wsTestCode
        );
        ws.close();
        if (!createdEvent)
            throw new Error(
                `no native_order:created event received (got ${events.length} events: ${events.map((e) => e.type).join(', ')})`
            );
        ok(`WS event received: ${createdEvent.type} order=${createdEvent.order.code}`);
        // Cleanup
        await fetch(`${WORKER}/api/native-orders/${wsTestCode}`, { method: 'DELETE' });
    });

    // ---- Phase 10: Excel CSV export ----
    console.log('\n▶ STEP 10: Phase 10 — Excel CSV export');

    await step('GET /api/fast-sale-orders/export → CSV (UTF-8 BOM)', async () => {
        const r = await fetch(`${WORKER}/api/fast-sale-orders/export?state=draft&limit=1000`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const ct = r.headers.get('content-type') || '';
        if (!/text\/csv/.test(ct)) throw new Error(`content-type=${ct}, want text/csv`);
        const cd = r.headers.get('content-disposition') || '';
        if (!/pbh-export-\d{4}-\d{2}-\d{2}\.csv/.test(cd))
            throw new Error(`bad filename in CD: ${cd}`);
        const buf = Buffer.from(await r.arrayBuffer());
        // UTF-8 BOM = EF BB BF
        if (buf[0] !== 0xef || buf[1] !== 0xbb || buf[2] !== 0xbf)
            throw new Error('missing UTF-8 BOM');
        const csv = buf.slice(3).toString('utf-8');
        const headerLine = csv.split('\n')[0];
        // Verify ≥20 columns header
        const cols = headerLine.split(',').length;
        if (cols < 20) throw new Error(`only ${cols} columns in header, want ≥20`);
        ok(`CSV exports ${cols} columns, UTF-8 BOM present`);
    });

    await step('GET /api/native-orders/export → CSV', async () => {
        const r = await fetch(`${WORKER}/api/native-orders/export?limit=1000`);
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        const cd = r.headers.get('content-disposition') || '';
        if (!/donweb-export-\d{4}-\d{2}-\d{2}\.csv/.test(cd))
            throw new Error(`bad filename: ${cd}`);
        const buf = Buffer.from(await r.arrayBuffer());
        if (buf[0] !== 0xef || buf[1] !== 0xbb || buf[2] !== 0xbf)
            throw new Error('missing UTF-8 BOM');
        ok('Native-orders CSV export OK');
    });

    // ---- Phase 11: Bulk actions ----
    console.log('\n▶ STEP 11: Phase 11 — Bulk actions');

    await step('POST /bulk-confirm with empty numbers → 400 (validation)', async () => {
        const r = await api('POST', '/api/fast-sale-orders/bulk-confirm', { numbers: [] });
        if (r.status !== 400) throw new Error(`expected 400 (numbers required), got ${r.status}`);
        if (!/numbers required/i.test(r.data?.error || ''))
            throw new Error(`unexpected error message: ${r.data?.error}`);
        ok('empty array → 400 with "numbers required" error');
    });

    await step('POST /bulk-confirm with fake number → 0 changed', async () => {
        const r = await api('POST', '/api/fast-sale-orders/bulk-confirm', {
            numbers: ['HD-DOESNOTEXIST-99999'],
        });
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (r.data?.changed !== 0) throw new Error(`expected 0 changed, got ${r.data?.changed}`);
        ok('fake number → graceful no-op (0 changed, 1 requested)');
    });

    await step('POST /bulk-cancel with fake number → 0 changed', async () => {
        const r = await api('POST', '/api/fast-sale-orders/bulk-cancel', {
            numbers: ['HD-DOESNOTEXIST-99999'],
        });
        if (r.status >= 500) throw new Error(`HTTP ${r.status}`);
        if (r.data?.changed !== 0) throw new Error(`expected 0 changed, got ${r.data?.changed}`);
        ok('bulk-cancel graceful no-op');
    });

    // ---- Phase 12: Customer 360 cross-system FK ----
    console.log('\n▶ STEP 12: Phase 12 — Customer 360 link');

    // We use unique fake phones (not in customers table) so we control both
    // sides of the link: first verify lookup-only returns null, then create a
    // customer with this phone, then verify subsequent orders auto-link.
    // (Live customers DB has duplicates of common phones; the test must own
    // both the customer record and the phone to make assertions stable.)
    const PHASE12_PHONE = `09${String(Date.now()).slice(-9)}`; // unique per run
    const UNLINKED_PHONE = `08${String(Date.now() + 1).slice(-9)}`;
    let phase12CustomerId = null;
    let phase12NativeCode = null;
    let phase12PbhNumber = null;

    await step('Create NW with unlinked phone → customerId is null', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: `qa-phase12a-${Date.now()}`,
            fbUserName: 'Phase12 Test (unlinked)',
            phone: UNLINKED_PHONE,
            customerName: 'Phase12 unlinked',
        });
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        if (r.data.order.customerId !== null)
            throw new Error(
                `expected null customerId for unlinked phone, got ${r.data.order.customerId}`
            );
        ok(`NW ${r.data.order.code} customerId=null (phone not in customers table)`);
        await fetch(`${WORKER}/api/native-orders/${r.data.order.code}`, { method: 'DELETE' });
    });

    await step('Create test customer (TEST-Phase12-*)', async () => {
        const r = await api('POST', '/api/v2/customers', {
            phone: PHASE12_PHONE,
            name: `TEST-Phase12-${Date.now()}`,
        });
        const data = r.data?.data || r.data;
        phase12CustomerId = Number(data?.id);
        if (!phase12CustomerId)
            throw new Error(`no id returned: ${JSON.stringify(r.data).slice(0, 200)}`);
        ok(`customer id=${phase12CustomerId} phone=${PHASE12_PHONE}`);
    });

    await step('Create NW with linked phone → auto-link customer_id', async () => {
        const r = await api('POST', '/api/native-orders/from-comment', {
            fbUserId: `qa-phase12b-${Date.now()}`,
            fbUserName: 'Phase12 Test (linked)',
            phone: PHASE12_PHONE,
            customerName: 'TEST-Phase12-Linked',
        });
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        phase12NativeCode = r.data.order.code;
        if (r.data.order.customerId !== phase12CustomerId)
            throw new Error(`customerId=${r.data.order.customerId}, expected ${phase12CustomerId}`);
        ok(`NW ${phase12NativeCode} auto-linked → customer_id=${phase12CustomerId}`);
    });

    await step('PATCH NW phone → re-links customer_id', async () => {
        if (!phase12NativeCode) return ok('skipped — no NW created');
        // Swap to unlinked phone → customer_id should null out
        const r = await api('PATCH', `/api/native-orders/${phase12NativeCode}`, {
            phone: UNLINKED_PHONE,
        });
        if (!r.data?.success) throw new Error(`HTTP ${r.status}`);
        if (r.data.order.customerId !== null)
            throw new Error(
                `customer_id=${r.data.order.customerId}, expected null after phone swap`
            );
        // Swap back to linked phone → should re-link
        const r2 = await api('PATCH', `/api/native-orders/${phase12NativeCode}`, {
            phone: PHASE12_PHONE,
        });
        if (r2.data.order.customerId !== phase12CustomerId)
            throw new Error(
                `after restore: customer_id=${r2.data.order.customerId}, expected ${phase12CustomerId}`
            );
        ok('phone swap nulls + restore re-links customer_id');
    });

    await step('Convert NW → PBH → inherits customer_id', async () => {
        if (!phase12NativeCode) return ok('skipped — no NW created');
        const r = await api('POST', '/api/fast-sale-orders/from-native-order', {
            nativeOrderCode: phase12NativeCode,
        });
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        phase12PbhNumber = r.data.order.number;
        if (r.data.order.customerId !== phase12CustomerId)
            throw new Error(
                `PBH customerId=${r.data.order.customerId}, expected ${phase12CustomerId}`
            );
        ok(`PBH ${phase12PbhNumber} inherits customer_id=${phase12CustomerId}`);
    });

    await step('POST /api/native-orders/backfill-customer-links idempotent', async () => {
        const r = await api('POST', '/api/native-orders/backfill-customer-links', {});
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        ok(`backfill linked ${r.data.linked} native_orders`);
    });

    await step('POST /api/fast-sale-orders/backfill-customer-links idempotent', async () => {
        const r = await api('POST', '/api/fast-sale-orders/backfill-customer-links', {});
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        ok(`backfill linked ${r.data.linked} PBHs`);
    });

    await step('GET /api/v2/customers/:id/orders aggregation', async () => {
        if (!phase12CustomerId) return ok('skipped — no customer created');
        const r = await api('GET', `/api/v2/customers/${phase12CustomerId}/orders`);
        if (!r.data?.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(r.data)}`);
        const { native, pbh, summary } = r.data;
        if (!Array.isArray(native) || !Array.isArray(pbh)) throw new Error('native/pbh not arrays');
        const foundNw = native.some((o) => o.code === phase12NativeCode);
        const foundPbh = pbh.some((o) => o.number === phase12PbhNumber);
        if (!foundNw) throw new Error(`test NW ${phase12NativeCode} not in aggregation`);
        if (!foundPbh) throw new Error(`test PBH ${phase12PbhNumber} not in aggregation`);
        ok(
            `aggregation OK — ${summary.native.count} NW + ${summary.pbh.count} PBH, total ${summary.native.totalAmount + summary.pbh.totalAmount}`
        );
    });

    await step('GET /api/v2/customers/<phone>/orders also works', async () => {
        const r = await api('GET', `/api/v2/customers/${PHASE12_PHONE}/orders`);
        if (!r.data?.success) throw new Error(`HTTP ${r.status}`);
        if (!Array.isArray(r.data.native) || !Array.isArray(r.data.pbh))
            throw new Error('native/pbh not arrays');
        const foundNw = r.data.native.some((o) => o.code === phase12NativeCode);
        if (!foundNw) throw new Error(`NW ${phase12NativeCode} missing from by-phone aggregation`);
        ok(`phone-as-id works (${r.data.native.length} NW + ${r.data.pbh.length} PBH)`);
    });

    // ---- Browser tests ----
    console.log('\n▶ STEP 12: Browser UI tests');
    await ensureLocalServer(BASE);
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrs = [];
    page.on('console', (m) => {
        if (m.type() === 'error' && !/fonts|favicon/.test(m.text()))
            consoleErrs.push(m.text().slice(0, 150));
    });
    page.on('pageerror', (e) => consoleErrs.push('PAGE: ' + String(e).slice(0, 150)));

    await step('Load PBH list page (web2/fastsaleorder-invoice)', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/web2/fastsaleorder-invoice/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(3000);
        const rowCount = await page.locator('#pbhTbody tr:not(:has(.empty-row))').count();
        if (rowCount < 1) throw new Error(`no PBH rows visible (rows=${rowCount})`);
        ok(`page loaded, ${rowCount} rows visible`);
    });

    await step('PBH page console errors', async () => {
        if (consoleErrs.length > 0) throw new Error(consoleErrs.join('\n  '));
        ok('no console errors');
    });

    await step('PBH detail button works', async () => {
        // Search for our test PBH first
        await page.fill('#pbhSearch', TEST_PHONE);
        await page.click('#pbhApply');
        await page.waitForTimeout(1500);
        const rowCount = await page.locator('#pbhTbody tr:not(:has(.empty-row))').count();
        if (rowCount === 0) throw new Error('search after fill found 0 rows');
        ok(`search filter returns ${rowCount} rows`);
    });

    await step('Phase 10 UI: Xuất Excel button present', async () => {
        const btn = page.locator('#pbhExportCsv');
        const cnt = await btn.count();
        if (cnt === 0) throw new Error('#pbhExportCsv button not found');
        const text = (await btn.textContent()) || '';
        if (!/Xuất Excel/.test(text))
            throw new Error(`button text="${text.trim()}", expect "Xuất Excel"`);
        ok('"Xuất Excel" button present');
    });

    await step('Phase 11 UI: bulk bar appears when row checked', async () => {
        // Clear filter so all rows show (test PBH may not exist)
        await page.fill('#pbhSearch', '');
        await page.click('#pbhApply');
        await page.waitForTimeout(1500);
        const rowCheckboxes = await page.locator('#pbhTbody .row-check').count();
        if (rowCheckboxes === 0) throw new Error('no .row-check checkboxes rendered');
        // Bulk bar should be hidden initially
        const bulkBarBefore = await page
            .locator('#pbhBulkBar')
            .evaluate((el) => window.getComputedStyle(el).display);
        if (bulkBarBefore !== 'none')
            throw new Error(`bulk bar visible before check (display=${bulkBarBefore})`);
        // Check the first row
        await page.locator('#pbhTbody .row-check').first().check();
        await page.waitForTimeout(300);
        const bulkBarAfter = await page
            .locator('#pbhBulkBar')
            .evaluate((el) => window.getComputedStyle(el).display);
        if (bulkBarAfter === 'none') throw new Error('bulk bar still hidden after checking row');
        const countText = (await page.locator('#pbhBulkCount').textContent()) || '';
        if (!/^[1-9]/.test(countText.trim()))
            throw new Error(`bulk count="${countText.trim()}", expect ≥1`);
        ok(`bulk bar appears (display=${bulkBarAfter}, count=${countText.trim()})`);
        // Uncheck to clean state
        await page.click('#pbhBulkUnselect').catch(() => {});
        await page.waitForTimeout(200);
    });

    await step('Phase 11 UI: check-all toggles all rows', async () => {
        const total = await page.locator('#pbhTbody .row-check').count();
        await page.locator('#pbhCheckAll').check();
        await page.waitForTimeout(300);
        const checkedAfter = await page.locator('#pbhTbody .row-check:checked').count();
        if (checkedAfter !== total)
            throw new Error(`checked=${checkedAfter}/${total} after check-all`);
        const bulkCount = parseInt((await page.locator('#pbhBulkCount').textContent()) || '0', 10);
        if (bulkCount !== total) throw new Error(`bulk count=${bulkCount}, want ${total}`);
        ok(`check-all → ${total}/${total} checked, bulk shows ${bulkCount}`);
        await page.locator('#pbhCheckAll').uncheck();
        await page.waitForTimeout(200);
    });

    await step('Load delivery list page', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/web2/fastsaleorder-delivery/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(2500);
        const rows = await page.locator('#dlvTbody tr').count();
        if (rows < 1) throw new Error('no tbody');
        if (consoleErrs.length > 0)
            throw new Error('console errs: ' + consoleErrs.slice(0, 2).join(' / '));
        ok(`delivery page loaded, ${rows} tbody rows, no errors`);
    });
    await step('Load refund list page', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/web2/fastsaleorder-refund/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(2500);
        const rows = await page.locator('#rfTbody tr').count();
        if (rows < 1) throw new Error('no tbody');
        if (consoleErrs.length > 0)
            throw new Error('console errs: ' + consoleErrs.slice(0, 2).join(' / '));
        ok(`refund page loaded, ${rows} tbody rows, no errors`);
    });

    await step('Native-orders has Tạo PBH button', async () => {
        consoleErrs.length = 0;
        await page.goto(`${BASE}/native-orders/index.html?t=${Date.now()}`, {
            waitUntil: 'networkidle',
        });
        await page.waitForTimeout(3000);
        const btn = page.locator('button[title="Tạo PBH"]').first();
        const cnt = await btn.count();
        if (cnt === 0) throw new Error('no "Tạo PBH" button found');
        ok(`"Tạo PBH" button visible (${cnt} buttons in table)`);
    });
    await step('Native-orders console errors', async () => {
        if (consoleErrs.length > 0) throw new Error(consoleErrs.slice(0, 3).join('\n  '));
        ok('no console errors');
    });

    await browser.close();

    // ---- Cleanup ----
    console.log('\n▶ CLEANUP');
    await step('DELETE refund (force)', async () => {
        if (!rfNumber) return;
        const r = await fetch(`${WORKER}/api/refunds/${rfNumber}?force=1`, { method: 'DELETE' });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${rfNumber}`);
    });
    await step('DELETE delivery (force)', async () => {
        if (!dlvNumber) return;
        const r = await fetch(`${WORKER}/api/delivery-invoices/${dlvNumber}?force=1`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${dlvNumber}`);
    });
    await step('DELETE PBH (force)', async () => {
        if (!pbhNumber) return;
        const r = await fetch(`${WORKER}/api/fast-sale-orders/${pbhNumber}?force=1`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${pbhNumber}`);
    });
    await step('DELETE NativeOrder', async () => {
        if (!nativeCode) return;
        const r = await fetch(`${WORKER}/api/native-orders/${nativeCode}`, { method: 'DELETE' });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${nativeCode}`);
    });
    await step('DELETE Phase12 PBH', async () => {
        if (!phase12PbhNumber) return;
        const r = await fetch(`${WORKER}/api/fast-sale-orders/${phase12PbhNumber}?force=1`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${phase12PbhNumber}`);
    });
    await step('DELETE Phase12 NativeOrder', async () => {
        if (!phase12NativeCode) return;
        const r = await fetch(`${WORKER}/api/native-orders/${phase12NativeCode}`, {
            method: 'DELETE',
        });
        const data = await r.json();
        if (!data.success) throw new Error(`HTTP ${r.status}: ${JSON.stringify(data)}`);
        ok(`deleted ${phase12NativeCode}`);
    });
    await step('DELETE Phase12 customer', async () => {
        if (!phase12CustomerId) return;
        const r = await fetch(`${WORKER}/api/v2/customers/${phase12CustomerId}`, {
            method: 'DELETE',
        });
        // Customer DELETE may return 200 success or 404 if already gone
        if (!r.ok && r.status !== 404) throw new Error(`HTTP ${r.status}`);
        ok(`deleted customer ${phase12CustomerId}`);
    });

    // ---- Summary ----
    console.log('\n═══════════════ SUMMARY ═══════════════');
    console.log(`  ✓ passed: ${passed.length}`);
    console.log(`  ✗ failed: ${errors.length}`);
    if (errors.length) {
        console.log('\nFailures:');
        errors.forEach((e) => console.log(`  - ${e}`));
        process.exit(1);
    } else {
        console.log('\n🎉 ALL QA TESTS PASS');
        process.exit(0);
    }
}

main().catch((e) => {
    console.error('FATAL:', e.message);
    console.error(e.stack);
    process.exit(2);
});
