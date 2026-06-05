// #Note: Throwaway test — CK review backend (linkTransaction reuse + approve SQL + offset). Local DB → test → DROP.
'use strict';
const { Pool } = require('../render.com/node_modules/pg');
const detector = require('../render.com/services/web2-payment-signal-detector');
const balanceHistory = require('../render.com/routes/v2/web2-balance-history');

const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_ckreview_test';

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
        // Schema
        await detector.ensureSchema(db);
        await detector.ensureSchema(db); // idempotent ×2 (ALTER matched_tx_id)
        const col = await db.query(
            `SELECT 1 FROM information_schema.columns WHERE table_name='web2_payment_signals' AND column_name='matched_tx_id'`
        );
        ok(col.rows.length === 1, 'ALTER matched_tx_id idempotent (×2)');

        await db.query(`CREATE TABLE web2_customer_wallets (
            id SERIAL PRIMARY KEY, phone VARCHAR(20) UNIQUE, customer_id INTEGER,
            balance NUMERIC(14,2) DEFAULT 0, virtual_balance NUMERIC(14,2) DEFAULT 0,
            total_deposited NUMERIC(14,2) DEFAULT 0, total_withdrawn NUMERIC(14,2) DEFAULT 0,
            created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW())`);
        await db.query(`CREATE TABLE web2_wallet_transactions (
            id SERIAL PRIMARY KEY, phone VARCHAR(20), customer_id INTEGER, type TEXT, amount NUMERIC(14,2),
            balance_before NUMERIC(14,2), balance_after NUMERIC(14,2),
            virtual_balance_before NUMERIC(14,2), virtual_balance_after NUMERIC(14,2),
            source TEXT, reference_type TEXT, reference_id TEXT, note TEXT, created_at TIMESTAMPTZ DEFAULT NOW())`);
        await db.query(`CREATE TABLE web2_balance_history (
            id SERIAL PRIMARY KEY, sepay_id BIGINT, transfer_amount BIGINT, transfer_type TEXT,
            debt_added BOOLEAN DEFAULT FALSE, wallet_processed BOOLEAN DEFAULT FALSE,
            linked_customer_phone VARCHAR(20), display_name TEXT, match_method TEXT,
            verification_status TEXT, verified_at TIMESTAMPTZ, verified_by TEXT,
            content TEXT, transaction_date TIMESTAMPTZ DEFAULT NOW())`);

        // --- linkTransaction (money path, reuse từ PATCH /link) ---
        const txR = await db.query(
            `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content)
             VALUES (123456, 250000, 'in', 'CK 0901234567') RETURNING id`
        );
        const txId = txR.rows[0].id;
        const linkRes = await balanceHistory.linkTransaction(db, {
            id: txId,
            phone: '0901234567',
            name: 'KH A',
            verifiedBy: 'NV A',
        });
        ok(linkRes.linked && linkRes.credited, 'linkTransaction: linked + credited');
        const txAfter = await db.query(`SELECT * FROM web2_balance_history WHERE id=$1`, [txId]);
        ok(
            txAfter.rows[0].debt_added === true &&
                txAfter.rows[0].linked_customer_phone === '0901234567',
            'GD: debt_added + linked_customer_phone set'
        );
        const wal = await db.query(
            `SELECT balance FROM web2_customer_wallets WHERE phone='0901234567'`
        );
        ok(wal.rows.length === 1 && Number(wal.rows[0].balance) === 250000, 'ví cộng 250.000');

        // Re-link đã xử lý → alreadyProcessed
        const linkAgain = await balanceHistory.linkTransaction(db, {
            id: txId,
            phone: '0901234567',
            name: 'KH A',
        });
        ok(
            linkAgain.alreadyProcessed === true,
            'link lại GD đã xử lý → alreadyProcessed (chống cộng ví 2 lần)'
        );

        // --- Approve SQL: với txId (replicate endpoint UPDATE) ---
        const tx2 = await db.query(
            `INSERT INTO web2_balance_history (sepay_id, transfer_amount, transfer_type, content)
             VALUES (222, 99000, 'in', 'CK') RETURNING id`
        );
        const tx2Id = tx2.rows[0].id;
        const sig1 = await db.query(
            `INSERT INTO web2_payment_signals (psid,page_id,customer_name,raw_message,matched_keyword,status,created_at,history)
             VALUES ('P1','PG','KH B','đã ck','ĐÃ CK','pending',$1,'[]'::jsonb) RETURNING id`,
            [Date.now()]
        );
        const sig1Id = sig1.rows[0].id;
        const now = Date.now();
        await db.query(
            `UPDATE web2_payment_signals
             SET status='confirmed', confirmed_at=$2, confirmed_by=$3,
                 phone = COALESCE(NULLIF(phone,''), $4),
                 customer_name = COALESCE(NULLIF(customer_name,''), $5),
                 matched_tx_id = COALESCE($6, matched_tx_id),
                 matched_tx_at = CASE WHEN $6 IS NOT NULL THEN $2 ELSE matched_tx_at END
             WHERE id=$1`,
            [sig1Id, now, 'NV B', '0911222333', 'KH B', tx2Id]
        );
        const s1 = await db.query(`SELECT * FROM web2_payment_signals WHERE id=$1`, [sig1Id]);
        ok(
            s1.rows[0].status === 'confirmed' &&
                Number(s1.rows[0].matched_tx_id) === tx2Id &&
                s1.rows[0].phone === '0911222333' &&
                s1.rows[0].confirmed_by === 'NV B',
            'approve có txId: confirmed + matched_tx_id + phone + confirmed_by'
        );

        // --- Approve no-txId ---
        const sig2 = await db.query(
            `INSERT INTO web2_payment_signals (psid,page_id,customer_name,raw_message,matched_keyword,status,created_at,history)
             VALUES ('P2','PG','','ck xong','CK XONG','pending',$1,'[]'::jsonb) RETURNING id`,
            [Date.now()]
        );
        await db.query(
            `UPDATE web2_payment_signals
             SET status='confirmed', confirmed_at=$2, confirmed_by=$3,
                 phone = COALESCE(NULLIF(phone,''), $4),
                 customer_name = COALESCE(NULLIF(customer_name,''), $5),
                 matched_tx_id = COALESCE($6, matched_tx_id),
                 matched_tx_at = CASE WHEN $6 IS NOT NULL THEN $2 ELSE matched_tx_at END
             WHERE id=$1`,
            [sig2.rows[0].id, Date.now(), 'NV C', '0900000001', 'KH C', null]
        );
        const s2 = await db.query(`SELECT * FROM web2_payment_signals WHERE id=$1`, [
            sig2.rows[0].id,
        ]);
        ok(
            s2.rows[0].status === 'confirmed' &&
                s2.rows[0].matched_tx_id === null &&
                s2.rows[0].phone === '0900000001' &&
                s2.rows[0].customer_name === 'KH C',
            'approve no-txId: confirmed + phone/name lưu + matched_tx_id NULL (ví không đổi)'
        );

        // --- Offset pagination (GET /) ---
        for (let i = 0; i < 25; i++) {
            await db.query(
                `INSERT INTO web2_payment_signals (psid,page_id,status,created_at,history) VALUES ($1,'PG','pending',$2,'[]'::jsonb)`,
                ['PG_' + i, Date.now() + i]
            );
        }
        const total = (
            await db.query(
                `SELECT COUNT(*)::int n FROM web2_payment_signals WHERE status='pending'`
            )
        ).rows[0].n;
        const p0 = await db.query(
            `SELECT id FROM web2_payment_signals WHERE status='pending' ORDER BY created_at DESC LIMIT 10 OFFSET 0`
        );
        const p2 = await db.query(
            `SELECT id FROM web2_payment_signals WHERE status='pending' ORDER BY created_at DESC LIMIT 10 OFFSET 20`
        );
        ok(p0.rows.length === 10, 'offset page 0 → 10 rows');
        ok(0 + 10 < total === true, 'hasMore=true ở page 0');
        ok(p2.rows.length === total - 20, 'offset page cuối đúng số dư');
        // không trùng id giữa page 0 và page 2
        const set0 = new Set(p0.rows.map((r) => r.id));
        ok(
            p2.rows.every((r) => !set0.has(r.id)),
            'page 0 và page 2 không trùng id'
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
