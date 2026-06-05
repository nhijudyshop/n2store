// #Note: Throwaway test — web2_payment_signals schema + detector.handleIncoming + route JOIN. Tạo local DB → test → DROP. KHÔNG đụng prod.
'use strict';
const { Client } = require('../render.com/node_modules/pg');
const detector = require('../render.com/services/web2-payment-signal-detector');

const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_paysig_test';

async function main() {
    const admin = new Client(ADMIN);
    await admin.connect();
    await admin.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
    await admin.query(`CREATE DATABASE ${TESTDB}`);
    await admin.end();

    const db = new Client({ ...ADMIN, database: TESTDB });
    await db.connect();
    let pass = 0,
        fail = 0;
    const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));

    try {
        // 1. ensureSchema idempotent (chạy 2 lần — Render restart sẽ chạy lại)
        await detector.ensureSchema(db);
        await detector.ensureSchema(db);
        const t = await db.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name='web2_payment_signals'`
        );
        ok(t.rows.length === 1, 'ensureSchema tạo bảng (idempotent ×2)');

        // 2. Stub tables cho match + JOIN
        await db.query(
            `CREATE TABLE web2_customers (id SERIAL, phone VARCHAR(20), name VARCHAR(255), fb_id VARCHAR(50), synced_at TIMESTAMPTZ DEFAULT NOW())`
        );
        await db.query(
            `CREATE TABLE native_orders (id SERIAL, code VARCHAR(40), customer_name VARCHAR(255), phone VARCHAR(40), status VARCHAR(20) DEFAULT 'draft', total_amount NUMERIC(14,2) DEFAULT 0, created_at BIGINT)`
        );
        await db.query(
            `CREATE TABLE fast_sale_orders (id SERIAL, number VARCHAR(50), partner_name VARCHAR(255), partner_phone VARCHAR(40), amount_total NUMERIC(15,2) DEFAULT 0, created_at BIGINT)`
        );

        await db.query(
            `INSERT INTO web2_customers (phone, name, fb_id) VALUES ('0901234567','Test KH','FBPSID1')`
        );
        await db.query(
            `INSERT INTO native_orders (code, customer_name, phone, total_amount, created_at) VALUES ('TEST-NO-1','Test KH','0901234567', 250000, $1)`,
            [Date.now()]
        );

        // 3. handleIncoming: KH "FBPSID1" nhắn "CK XONG" → ghi signal + khớp native order
        let notified = null;
        const notify = (topic, payload) => (notified = { topic, payload });
        const sig = await detector.handleIncoming(
            db,
            {
                message: 'ck xong rồi nha',
                psid: 'FBPSID1',
                pageId: 'PAGE1',
                conversationId: 'CONV1',
                customerName: 'Test KH',
            },
            notify
        );
        ok(!!sig, 'handleIncoming ghi signal khi keyword match');
        ok(sig && sig.matched_keyword === 'CK XONG', 'keyword = CK XONG');
        ok(sig && sig.phone === '0901234567', 'resolve phone từ fb_id (web2_customers)');
        ok(
            sig && sig.matched_order_type === 'native' && sig.matched_order_code === 'TEST-NO-1',
            'khớp native_orders theo phone'
        );
        ok(
            notified && notified.topic === 'web2:payment-signals',
            'SSE notify web2:payment-signals'
        );

        // 3b. History seed = entry "detect" (hệ thống tự nhận)
        ok(
            Array.isArray(sig.history) &&
                sig.history.length === 1 &&
                sig.history[0].action === 'detect',
            'history seed entry "detect" lúc INSERT'
        );

        // 3c. Append history "confirm" với userName (giống route _appendHistory)
        await db.query(
            `UPDATE web2_payment_signals
             SET history = COALESCE(history,'[]'::jsonb) || $2::jsonb
             WHERE id = $1`,
            [
                sig.id,
                JSON.stringify([
                    { ts: Date.now(), action: 'confirm', userName: 'Nhân Viên A', note: null },
                ]),
            ]
        );
        const hq = await db.query(`SELECT history FROM web2_payment_signals WHERE id=$1`, [sig.id]);
        const hist = hq.rows[0].history;
        ok(
            hist.length === 2 && hist[1].action === 'confirm' && hist[1].userName === 'Nhân Viên A',
            'append history "confirm" lưu tên user xác nhận'
        );

        // 4. Dedup: nhắn lại trong window → null
        const sig2 = await detector.handleIncoming(
            db,
            { message: 'đã ck', psid: 'FBPSID1', pageId: 'PAGE1' },
            notify
        );
        ok(sig2 === null, 'dedup: signal trùng psid+page trong window → bỏ qua');

        // 4b. Sau khi DISMISS, update_conversation re-fire cùng snippet → KHÔNG tạo lại
        await db.query(`UPDATE web2_payment_signals SET status='dismissed' WHERE id=$1`, [sig.id]);
        const sigReappear = await detector.handleIncoming(
            db,
            { message: 'ck xong', psid: 'FBPSID1', pageId: 'PAGE1' },
            notify
        );
        ok(sigReappear === null, 'không tái tạo signal sau dismiss (dedup ANY status)');
        // Khôi phục pending cho các test JOIN/enrich phía dưới
        await db.query(`UPDATE web2_payment_signals SET status='pending' WHERE id=$1`, [sig.id]);

        // 5. Không match → không ghi
        const sig3 = await detector.handleIncoming(
            db,
            { message: 'đã ck chưa shop?', psid: 'FBPSID9', pageId: 'PAGE1' },
            notify
        );
        ok(sig3 === null, 'câu hỏi "đã ck chưa?" → không ghi');

        // 6. Route JOIN query (copy logic từ web2-payment-signals.js GET /)
        const joinSql = `
            SELECT s.*,
                COALESCE(no.code, fso.number)                AS o_code,
                COALESCE(no.customer_name, fso.partner_name) AS o_name,
                COALESCE(no.phone, fso.partner_phone)        AS o_phone,
                COALESCE(no.total_amount, fso.amount_total)  AS o_total,
                no.status                                    AS o_status
            FROM web2_payment_signals s
            LEFT JOIN native_orders   no  ON s.matched_order_type='native' AND no.code = s.matched_order_code
            LEFT JOIN fast_sale_orders fso ON s.matched_order_type='fast_sale' AND fso.number = s.matched_order_code
            WHERE s.status='pending' ORDER BY s.created_at DESC LIMIT 200`;
        const j = await db.query(joinSql);
        ok(j.rows.length === 1, 'JOIN list trả 1 signal pending');
        ok(
            j.rows[0].o_code === 'TEST-NO-1' && Number(j.rows[0].o_total) === 250000,
            'JOIN enrich order info (code + total)'
        );

        // 7. Confirm flip
        await db.query(
            `UPDATE web2_payment_signals SET status='confirmed', confirmed_at=$1 WHERE id=$2`,
            [Date.now(), sig.id]
        );
        const enrich = await db.query(
            `SELECT status, matched_keyword FROM web2_payment_signals WHERE matched_order_type='native' AND matched_order_code='TEST-NO-1' AND status IN ('pending','confirmed')`
        );
        ok(
            enrich.rows.length === 1 && enrich.rows[0].status === 'confirmed',
            'native-orders enrich query thấy signal confirmed'
        );
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message);
    } finally {
        await db.end();
        const admin2 = new Client(ADMIN);
        await admin2.connect();
        await admin2.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
        await admin2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed --- (test DB dropped)`);
        process.exit(fail ? 1 : 0);
    }
}
main();
