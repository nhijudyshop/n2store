// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 test — CK watcher tự động hoàn toàn.
// Test watcher mới: auto-confirm signal pending + resolve SĐT/partner từ GD (QR
// registry) + cộng ví + gửi reply. Local throwaway DB, KHÔNG đụng prod.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const watcher = require('../render.com/services/web2-ck-watcher');
const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_ckwatch_test';

async function schema(db) {
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
        `CREATE TABLE web2_payment_qr_codes (id SERIAL PRIMARY KEY, qr_code VARCHAR(50) UNIQUE, phone VARCHAR(20), customer_name TEXT, customer_id BIGINT, use_count INT DEFAULT 0, last_used_at TIMESTAMPTZ, last_used_balance_history_id BIGINT)`
    );
    await db.query(
        `CREATE TABLE web2_payment_signals (id BIGSERIAL PRIMARY KEY, psid TEXT, page_id TEXT, conversation_id TEXT, customer_name TEXT, raw_message TEXT, matched_keyword TEXT, phone VARCHAR(40), customer_id BIGINT, matched_order_type VARCHAR(20), matched_order_code TEXT, status VARCHAR(20) DEFAULT 'pending', created_at BIGINT, confirmed_at BIGINT, confirmed_by TEXT, matched_tx_id BIGINT, matched_tx_at BIGINT, history JSONB DEFAULT '[]'::jsonb)`
    );
    await db.query(
        `CREATE TABLE native_orders (id SERIAL, code VARCHAR(40), total_amount NUMERIC(14,2))`
    );
    await db.query(
        `CREATE TABLE fast_sale_orders (id SERIAL, number VARCHAR(50), amount_total NUMERIC(15,2))`
    );
}

let pass = 0,
    fail = 0;
const ok = (c, m) => (c ? (pass++, console.log('✅', m)) : (fail++, console.log('❌', m)));

async function insTx(db, { sepay, amount, content, phone = null, name = null }) {
    const r = await db.query(
        `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content, linked_customer_phone, display_name) VALUES ($1,$2,'in',$3,$4,$5) RETURNING id`,
        [sepay, amount, content, phone, name]
    );
    return r.rows[0].id;
}
async function insSig(db, s) {
    const r = await db.query(
        `INSERT INTO web2_payment_signals (psid,page_id,conversation_id,customer_name,phone,customer_id,matched_keyword,status,created_at,history)
         VALUES ($1,$2,$3,$4,$5,$6,'ĐÃ CK',$7,$8,'[]'::jsonb) RETURNING id`,
        [
            s.psid || 'PS',
            s.page_id || 'PG',
            s.conv || 'C1',
            s.name || null,
            s.phone || null,
            s.customer_id || null,
            s.status || 'pending',
            s.created_at || Date.now(),
        ]
    );
    return r.rows[0].id;
}
function deps(sent) {
    return {
        notify: () => {},
        createNotification: async (d) => sent.notifs.push(d),
        sendMessage: async (...a) => {
            sent.msgs.push(a);
            return { ok: true };
        },
    };
}

async function main() {
    const admin = new Pool(ADMIN);
    await admin.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
    await admin.query(`CREATE DATABASE ${TESTDB}`);
    await admin.end();
    const db = new Pool({ ...ADMIN, database: TESTDB });
    try {
        await schema(db);
        const now = Date.now();

        // ── Case 1: pending signal có SĐT, GD nội dung chứa SĐT → auto-confirm+credit+reply
        const sig1 = await insSig(db, {
            name: 'KH Một',
            phone: '0901111111',
            status: 'pending',
            created_at: now,
        });
        const tx1 = await insTx(db, {
            sepay: 1,
            amount: 111000,
            content: 'CK 0901111111 mua hang',
        });
        const d1 = deps({ notifs: [], msgs: [] });
        const s1 = { notifs: d1.createNotification, msgs: [] };
        const cap1 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx1, deps(cap1));
        let r = await db.query(
            `SELECT status, matched_tx_id, phone FROM web2_payment_signals WHERE id=$1`,
            [sig1]
        );
        ok(
            r.rows[0].status === 'confirmed' && Number(r.rows[0].matched_tx_id) === tx1,
            'C1 pending→auto-confirm + link (phoneHit)'
        );
        let w = await db.query(
            `SELECT balance FROM web2_customer_wallets WHERE phone='0901111111'`
        );
        ok(w.rows.length === 1 && Number(w.rows[0].balance) === 111000, 'C1 cộng ví 111.000');
        ok(cap1.msgs.length === 1 && /111.000/.test(cap1.msgs[0][3]), 'C1 auto-reply kèm số tiền');

        // ── Case 2: pending signal phone=NULL nhưng customer_id khớp QR (partnerHit)
        //    → resolve SĐT từ QR registry → credit + reply.
        await db.query(
            `INSERT INTO web2_payment_qr_codes (qr_code, phone, customer_name, customer_id) VALUES ('NGUYENTAM562767','0123456788','Nguyễn Tâm',9988)`
        );
        const sig2 = await insSig(db, {
            name: 'Nguyễn Tâm',
            phone: null,
            customer_id: 9988,
            status: 'pending',
            created_at: now,
        });
        const tx2 = await insTx(db, {
            sepay: 2,
            amount: 2222,
            content: 'MBVCB.14546195952.590265.NGUYENTAM562767.CT tu 9906952802 HUYNH THANH DAT',
        });
        const cap2 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx2, deps(cap2));
        r = await db.query(
            `SELECT status, matched_tx_id, phone FROM web2_payment_signals WHERE id=$1`,
            [sig2]
        );
        ok(
            r.rows[0].status === 'confirmed' && Number(r.rows[0].matched_tx_id) === tx2,
            'C2 partnerHit → auto-confirm + link'
        );
        ok(r.rows[0].phone === '0123456788', 'C2 resolve + lưu SĐT từ QR vào signal');
        w = await db.query(`SELECT balance FROM web2_customer_wallets WHERE phone='0123456788'`);
        ok(
            w.rows.length === 1 && Number(w.rows[0].balance) === 2222,
            'C2 cộng ví 2.222 (GD ambiguous được giải quyết)'
        );
        ok(cap2.msgs.length === 1, 'C2 auto-reply gửi');
        let tr = await db.query(`SELECT debt_added FROM web2_balance_history WHERE id=$1`, [tx2]);
        ok(tr.rows[0].debt_added === true, 'C2 GD debt_added=TRUE (hết "Đang xử lý")');

        // ── Case 3: pending signal phone=NULL, KHÔNG partner, nhưng tên DUY NHẤT khớp QR
        await db.query(
            `INSERT INTO web2_payment_qr_codes (qr_code, phone, customer_name, customer_id) VALUES ('LANANH771234','0903333333','Lan Anh',7712)`
        );
        const sig3 = await insSig(db, {
            name: 'Lan Anh',
            phone: null,
            customer_id: null,
            status: 'pending',
            created_at: now,
        });
        const tx3 = await insTx(db, {
            sepay: 3,
            amount: 5000,
            content: 'CK LANANH771234 thanh toan',
        });
        const cap3 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx3, deps(cap3));
        r = await db.query(
            `SELECT status, matched_tx_id, phone FROM web2_payment_signals WHERE id=$1`,
            [sig3]
        );
        ok(
            Number(r.rows[0].matched_tx_id) === tx3 && r.rows[0].phone === '0903333333',
            'C3 nameHit duy nhất → credit (resolve SĐT)'
        );
        ok(cap3.msgs.length === 1, 'C3 auto-reply gửi');

        // ── Case 4: tên TRÙNG (2 signal "Trùng Tên") → KHÔNG auto, chỉ notify
        await db.query(
            `INSERT INTO web2_payment_qr_codes (qr_code, phone, customer_name, customer_id) VALUES ('TRUNGTEN880001','0904444444','Trùng Tên',8800)`
        );
        const sigA = await insSig(db, {
            name: 'Trùng Tên',
            phone: null,
            status: 'pending',
            created_at: now,
        });
        const sigB = await insSig(db, {
            name: 'Trùng Tên',
            phone: null,
            status: 'pending',
            created_at: now,
        });
        const tx4 = await insTx(db, { sepay: 4, amount: 7000, content: 'CK TRUNGTEN880001 abc' });
        const cap4 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx4, deps(cap4));
        const ra = await db.query(
            `SELECT matched_tx_id FROM web2_payment_signals WHERE id IN ($1,$2)`,
            [sigA, sigB]
        );
        ok(
            ra.rows.every((x) => x.matched_tx_id == null),
            'C4 tên trùng → KHÔNG auto-link'
        );
        ok(
            cap4.notifs.length === 1 && cap4.notifs[0].type === 'ck_watch_match',
            'C4 tạo notification staff'
        );
        ok(cap4.msgs.length === 0, 'C4 KHÔNG gửi reply');

        // ── Case 5: confirmed signal (đã duyệt tay) + GD SĐT khớp → vẫn link + reply
        const sig5 = await insSig(db, {
            name: 'KH Năm',
            phone: '0905555555',
            status: 'confirmed',
            created_at: now,
        });
        const tx5 = await insTx(db, { sepay: 5, amount: 9000, content: 'CK 0905555555' });
        const cap5 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx5, deps(cap5));
        r = await db.query(`SELECT matched_tx_id FROM web2_payment_signals WHERE id=$1`, [sig5]);
        ok(
            Number(r.rows[0].matched_tx_id) === tx5,
            'C5 confirmed signal vẫn auto-link (giữ behavior cũ)'
        );

        // ── Case 6: conflict — signal SĐT khác GD SĐT → KHÔNG auto
        const sig6 = await insSig(db, {
            name: 'KH Sáu',
            phone: '0906666666',
            status: 'pending',
            created_at: now,
        });
        const tx6 = await insTx(db, { sepay: 6, amount: 6000, content: 'CK', phone: '0907777777' });
        // amount không khớp đơn, phone signal không trong content, txphone khác → no hit at all
        const cap6 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx6, deps(cap6));
        r = await db.query(`SELECT matched_tx_id FROM web2_payment_signals WHERE id=$1`, [sig6]);
        ok(r.rows[0].matched_tx_id == null, 'C6 không hit → no-op (an toàn)');

        // ── Case 7: idempotent — re-fire cùng GD đã link → không cộng ví lần 2
        const balBefore = (
            await db.query(`SELECT balance FROM web2_customer_wallets WHERE phone='0901111111'`)
        ).rows[0].balance;
        await watcher.onNewSepayTx(db, tx1, deps({ notifs: [], msgs: [] }));
        const balAfter = (
            await db.query(`SELECT balance FROM web2_customer_wallets WHERE phone='0901111111'`)
        ).rows[0].balance;
        ok(Number(balBefore) === Number(balAfter), 'C7 idempotent — GD đã link, không cộng lại');

        const getSig = async (id) =>
            (await db.query(`SELECT * FROM web2_payment_signals WHERE id=$1`, [id])).rows[0];

        // ══ CHIỀU 2: tiền về TRƯỚC, "đã ck" SAU (onNewSignal) ══
        // ── Case 8: GD đã về (SĐT trong nội dung) → signal mới có SĐT → auto-confirm+credit+reply
        const tx8 = await insTx(db, {
            sepay: 8,
            amount: 88000,
            content: 'CK 0908888888 thanh toan',
        });
        const sig8 = await insSig(db, {
            name: 'KH Tám',
            phone: '0908888888',
            status: 'pending',
            created_at: now,
        });
        const cap8 = { notifs: [], msgs: [] };
        await watcher.onNewSignal(db, await getSig(sig8), deps(cap8));
        r = await db.query(`SELECT status, matched_tx_id FROM web2_payment_signals WHERE id=$1`, [
            sig8,
        ]);
        ok(
            r.rows[0].status === 'confirmed' && Number(r.rows[0].matched_tx_id) === tx8,
            'C8 onNewSignal: GD về trước → auto-confirm + link'
        );
        w = await db.query(`SELECT balance FROM web2_customer_wallets WHERE phone='0908888888'`);
        ok(w.rows.length === 1 && Number(w.rows[0].balance) === 88000, 'C8 cộng ví 88.000');
        ok(cap8.msgs.length === 1 && /88.000/.test(cap8.msgs[0][3]), 'C8 auto-reply gửi');

        // ── Case 9: GD về trước (QR partner), signal phone=NULL + customer_id khớp → partnerHit
        await db.query(
            `INSERT INTO web2_payment_qr_codes (qr_code, phone, customer_name, customer_id) VALUES ('HAIYEN990077','0909999000','Hải Yến',7799)`
        );
        const tx9 = await insTx(db, { sepay: 9, amount: 4500, content: 'CK HAIYEN990077 ck xong' });
        const sig9 = await insSig(db, {
            name: 'Hải Yến',
            phone: null,
            customer_id: 7799,
            status: 'pending',
            created_at: now,
        });
        const cap9 = { notifs: [], msgs: [] };
        await watcher.onNewSignal(db, await getSig(sig9), deps(cap9));
        r = await db.query(`SELECT matched_tx_id, phone FROM web2_payment_signals WHERE id=$1`, [
            sig9,
        ]);
        ok(
            Number(r.rows[0].matched_tx_id) === tx9 && r.rows[0].phone === '0909999000',
            'C9 onNewSignal partnerHit → resolve SĐT + link'
        );
        ok(cap9.msgs.length === 1, 'C9 auto-reply gửi');

        // ── Case 10: signal mới KHÔNG có GD khớp → no-op (vẫn pending, không reply)
        const sig10 = await insSig(db, {
            name: 'KH Mười',
            phone: '0901010101',
            status: 'pending',
            created_at: now,
        });
        const cap10 = { notifs: [], msgs: [] };
        await watcher.onNewSignal(db, await getSig(sig10), deps(cap10));
        r = await db.query(`SELECT status, matched_tx_id FROM web2_payment_signals WHERE id=$1`, [
            sig10,
        ]);
        ok(
            r.rows[0].status === 'pending' && r.rows[0].matched_tx_id == null,
            'C10 không GD khớp → no-op (chờ tiền về)'
        );
        ok(cap10.msgs.length === 0, 'C10 KHÔNG gửi reply khi chưa có tiền');

        // ── Case 11: GD về trước nhưng đã bị signal khác claim → signal mới KHÔNG cướp
        const tx11 = await insTx(db, { sepay: 11, amount: 7700, content: 'CK 0911110000' });
        const sigClaim = await insSig(db, {
            name: 'KH A11',
            phone: '0911110000',
            status: 'pending',
            created_at: now,
        });
        await watcher.onNewSignal(db, await getSig(sigClaim), deps({ notifs: [], msgs: [] })); // claim tx11
        const sigLate = await insSig(db, {
            name: 'KH A11',
            phone: '0911110000',
            status: 'pending',
            created_at: now,
        });
        const cap11 = { notifs: [], msgs: [] };
        await watcher.onNewSignal(db, await getSig(sigLate), deps(cap11));
        r = await db.query(`SELECT matched_tx_id FROM web2_payment_signals WHERE id=$1`, [sigLate]);
        ok(
            r.rows[0].matched_tx_id == null,
            'C11 GD đã claimed → signal mới KHÔNG cướp (1 GD ↔ 1 signal)'
        );

        // ── Case 12: CHỈ trùng số tiền (amountHit), KHÔNG định danh khớp → KHÔNG
        //    auto (tránh gửi nhầm khách trùng số tiền) → notify staff duyệt tay.
        await db.query(`INSERT INTO native_orders (code, total_amount) VALUES ('ORD-AMT', 50000)`);
        const sig12 = (
            await db.query(
                `INSERT INTO web2_payment_signals (psid,page_id,conversation_id,customer_name,phone,matched_order_type,matched_order_code,matched_keyword,status,created_at,history)
                 VALUES ('PS12','PG','C12','KH Tiền','0912000001','native','ORD-AMT','ĐÃ CK','pending',$1,'[]'::jsonb) RETURNING id`,
                [now]
            )
        ).rows[0].id;
        const tx12 = await insTx(db, { sepay: 12, amount: 50000, content: 'CK chuyen khoan' });
        const cap12 = { notifs: [], msgs: [] };
        await watcher.onNewSepayTx(db, tx12, deps(cap12));
        r = await db.query(`SELECT matched_tx_id FROM web2_payment_signals WHERE id=$1`, [sig12]);
        ok(
            r.rows[0].matched_tx_id == null,
            'C12 chỉ trùng tiền → KHÔNG auto-link (tránh gửi nhầm)'
        );
        ok(cap12.msgs.length === 0, 'C12 KHÔNG gửi reply');
        ok(
            cap12.notifs.length === 1 && cap12.notifs[0].type === 'ck_watch_match',
            'C12 báo staff duyệt tay'
        );
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
