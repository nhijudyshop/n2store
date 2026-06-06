'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const detector = require('../render.com/services/web2-payment-signal-detector');
const watcher = require('../render.com/services/web2-ck-watcher');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_ckfeat_test';
async function main() {
    const admin = new Pool(ADMIN);
    await admin.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
    await admin.query(`CREATE DATABASE ${TESTDB}`);
    await admin.end();
    const db = new Pool({ ...ADMIN, database: TESTDB });
    let pass = 0,
        fail = 0;
    const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));
    try {
        await detector.ensureSchema(db);
        const cases = [
            ['huỷ đơn cho mình nhé', 'cancel_order'],
            ['cho mình đổi địa chỉ giao', 'change_address'],
            ['shop ơi ship tới đâu rồi', 'check_shipping'],
            ['cho xem lại đơn mình với', 'view_order'],
            ['shop ơi còn hàng không', null],
            ['đã ck rồi nha', null],
        ];
        let io = 0;
        for (const [t, e] of cases) {
            const r = detector.detectIntent(t);
            const g = r ? r.intent : null;
            if (g === e) io++;
            else console.log('  mismatch', JSON.stringify(t), '→', g, 'exp', e);
        }
        ok(io === cases.length, `detectIntent ${io}/${cases.length}`);
        const notifs = [];
        const cn = async (d) => {
            notifs.push(d);
            return 1;
        };
        const r1 = await detector.handleIntent(
            db,
            { message: 'huỷ đơn nhé', psid: 'PI1', pageId: 'PG', customerName: 'KH A' },
            null,
            cn
        );
        ok(r1 && r1.intent === 'cancel_order', 'handleIntent ghi cancel_order');
        ok(
            notifs.length === 1 && notifs[0].type === 'customer_intent',
            'handleIntent tạo notification'
        );
        const r2 = await detector.handleIntent(
            db,
            { message: 'huỷ đơn nữa', psid: 'PI1', pageId: 'PG' },
            null,
            cn
        );
        ok(r2 === null, 'dedup intent 6h');
        await db.query(
            `CREATE TABLE web2_customer_wallets (id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE, customer_id INTEGER, balance NUMERIC(14,2) DEFAULT 0, virtual_balance NUMERIC(14,2) DEFAULT 0, total_deposited NUMERIC(14,2) DEFAULT 0, total_withdrawn NUMERIC(14,2) DEFAULT 0, created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`
        );
        await db.query(
            `CREATE TABLE web2_wallet_transactions (id SERIAL PRIMARY KEY, phone VARCHAR(20), customer_id INTEGER, type TEXT, amount NUMERIC(14,2), balance_before NUMERIC(14,2), balance_after NUMERIC(14,2), virtual_balance_before NUMERIC(14,2), virtual_balance_after NUMERIC(14,2), source TEXT, reference_type TEXT, reference_id TEXT, note TEXT, performed_by TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`
        );
        await db.query(
            `CREATE TABLE web2_balance_history (id SERIAL PRIMARY KEY, sepay_id BIGINT, transfer_amount BIGINT, transfer_type TEXT, debt_added BOOLEAN DEFAULT FALSE, wallet_processed BOOLEAN DEFAULT FALSE, linked_customer_phone VARCHAR(20), display_name TEXT, match_method TEXT, verification_status TEXT, verified_at TIMESTAMPTZ, verified_by TEXT, content TEXT, description TEXT, transaction_date TIMESTAMPTZ DEFAULT NOW())`
        );
        await db.query(
            `CREATE TABLE native_orders (id SERIAL, code VARCHAR(40), total_amount NUMERIC(14,2))`
        );
        await db.query(
            `CREATE TABLE fast_sale_orders (id SERIAL, number VARCHAR(50), amount_total NUMERIC(15,2))`
        );
        const now = Date.now();
        await db.query(
            `INSERT INTO web2_payment_signals (psid,page_id,conversation_id,customer_name,phone,matched_keyword,status,created_at,history) VALUES ('PS1','PG1','C1','KH B','0901234567','ĐÃ CK','confirmed',$1,'[]'::jsonb)`,
            [now]
        );
        const tx1 = await db.query(
            `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content) VALUES (1, 199000, 'in', 'CK 0901234567 mua hang') RETURNING id`
        );
        const sent = [];
        await watcher.onNewSepayTx(db, tx1.rows[0].id, {
            notify: () => {},
            createNotification: async (d) => notifs.push(d),
            sendMessage: async (...a) => {
                sent.push(a);
                return { ok: true };
            },
        });
        const s1 = await db.query(
            `SELECT matched_tx_id FROM web2_payment_signals WHERE psid='PS1'`
        );
        ok(s1.rows[0].matched_tx_id != null, 'watcher SĐT khớp → auto-link');
        const w1 = await db.query(
            `SELECT balance FROM web2_customer_wallets WHERE phone='0901234567'`
        );
        ok(
            w1.rows.length === 1 && Number(w1.rows[0].balance) === 199000,
            'watcher cộng ví 199.000'
        );
        ok(sent.length === 1 && /199.000/.test(sent[0][3]), 'watcher gửi auto-reply kèm số dư');
        await db.query(`INSERT INTO native_orders (code, total_amount) VALUES ('ORD-2', 88000)`);
        await db.query(
            `INSERT INTO web2_payment_signals (psid,page_id,customer_name,matched_order_type,matched_order_code,status,created_at,history) VALUES ('PS2','PG1','KH C','native','ORD-2','confirmed',$1,'[]'::jsonb)`,
            [now]
        );
        const tx2 = await db.query(
            `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content) VALUES (2, 88000, 'in', 'khong co sdt') RETURNING id`
        );
        const nb = notifs.length;
        await watcher.onNewSepayTx(db, tx2.rows[0].id, {
            createNotification: async (d) => notifs.push(d),
        });
        const s2 = await db.query(
            `SELECT matched_tx_id FROM web2_payment_signals WHERE psid='PS2'`
        );
        ok(s2.rows[0].matched_tx_id == null, 'watcher đúng-tiền-không-SĐT → KHÔNG link');
        ok(
            notifs.length === nb + 1 && notifs[notifs.length - 1].type === 'ck_watch_match',
            'watcher tạo notification (không chắc)'
        );
        const tx3 = await db.query(
            `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content) VALUES (3, 5000000, 'in', 'random') RETURNING id`
        );
        const nb2 = notifs.length;
        await watcher.onNewSepayTx(db, tx3.rows[0].id, {
            createNotification: async (d) => notifs.push(d),
        });
        ok(notifs.length === nb2, 'watcher không khớp → no-op');
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message, e.stack);
    } finally {
        await db.end();
        const a2 = new Pool(ADMIN);
        await a2.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
        await a2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed --- (test DB dropped)`);
        process.exit(fail ? 1 : 0);
    }
}
main();
