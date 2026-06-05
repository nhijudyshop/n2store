// #Note: Throwaway test — web2_unread_messages tracker (upsert/delete/bump/markSeen). Local DB → test → DROP. KHÔNG đụng prod.
'use strict';
const { Client } = require('../render.com/node_modules/pg');
const tracker = require('../render.com/services/web2-unread-tracker');

const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_unread_test';

async function count(db) {
    const r = await db.query(`SELECT COUNT(*)::int n FROM web2_unread_messages`);
    return r.rows[0].n;
}
async function row(db, psid, page) {
    const r = await db.query(`SELECT * FROM web2_unread_messages WHERE psid=$1 AND page_id=$2`, [
        psid,
        page,
    ]);
    return r.rows[0] || null;
}

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
    let emitted = [];
    const notify = (topic, payload) => emitted.push({ topic, action: payload.action });

    try {
        await tracker.ensureSchema(db);
        await tracker.ensureSchema(db); // idempotent
        const t = await db.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name='web2_unread_messages'`
        );
        ok(t.rows.length === 1, 'ensureSchema tạo bảng (idempotent ×2)');

        // 1. update_conversation unread=2 → upsert count=2
        await tracker.onConversationUpdate(
            db,
            {
                psid: 'P1',
                pageId: 'PG1',
                unreadCount: 2,
                snippet: 'tin 1',
                customerName: 'KH A',
                conversationId: 'C1',
                shopSentLast: false,
            },
            notify
        );
        let r = await row(db, 'P1', 'PG1');
        ok(r && r.message_count === 2, 'update_conversation unread=2 → count=2 (authoritative)');
        ok(
            emitted.some((e) => e.topic === 'web2:unread' && e.action === 'upsert'),
            'SSE web2:unread upsert'
        );

        // 2. new_message từ khách → bump +1 (3)
        await tracker.onNewMessage(
            db,
            {
                psid: 'P1',
                pageId: 'PG1',
                snippet: 'tin 2',
                customerName: 'KH A',
                conversationId: 'C1',
            },
            notify
        );
        r = await row(db, 'P1', 'PG1');
        ok(r && r.message_count === 3, 'new_message bump +1 → count=3');
        ok(r && r.last_message_snippet === 'tin 2', 'snippet cập nhật');

        // 3. update_conversation unread=5 → SET=5 (không bump)
        await tracker.onConversationUpdate(
            db,
            { psid: 'P1', pageId: 'PG1', unreadCount: 5, snippet: 'tin 3', shopSentLast: false },
            notify
        );
        r = await row(db, 'P1', 'PG1');
        ok(r && r.message_count === 5, 'unread=5 authoritative SET=5 (chống drift)');

        // 4. shopSentLast=true → delete (shop trả lời)
        await tracker.onConversationUpdate(
            db,
            { psid: 'P1', pageId: 'PG1', unreadCount: 5, shopSentLast: true },
            notify
        );
        ok((await row(db, 'P1', 'PG1')) === null, 'shopSentLast=true → xoá (shop gửi cuối)');
        ok(
            emitted.some((e) => e.action === 'clear'),
            'SSE web2:unread clear'
        );

        // 5. unread=0 → delete
        await tracker.onConversationUpdate(
            db,
            { psid: 'P2', pageId: 'PG1', unreadCount: 3, snippet: 'x', shopSentLast: false },
            notify
        );
        await tracker.onConversationUpdate(
            db,
            { psid: 'P2', pageId: 'PG1', unreadCount: 0, shopSentLast: false },
            notify
        );
        ok((await row(db, 'P2', 'PG1')) === null, 'unread=0 → xoá (shop đã đọc)');

        // 6. markSeen
        await tracker.onNewMessage(db, { psid: 'P3', pageId: 'PG1', snippet: 'hi' }, notify);
        ok((await count(db)) === 1, 'còn 1 row (P3) trước markSeen');
        const n = await tracker.markSeen(db, 'P3', 'PG1', notify);
        ok(n === 1 && (await count(db)) === 0, 'markSeen xoá P3 → 0 row');

        // 7. List query (route GET /)
        await tracker.onNewMessage(
            db,
            { psid: 'P4', pageId: 'PG1', snippet: 'm', customerName: 'KH D' },
            notify
        );
        const list = await db.query(
            `SELECT psid, customer_name, message_count FROM web2_unread_messages ORDER BY last_message_time DESC LIMIT 500`
        );
        ok(list.rows.length === 1 && list.rows[0].psid === 'P4', 'list query trả P4');
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message);
    } finally {
        await db.end();
        const a2 = new Client(ADMIN);
        await a2.connect();
        await a2.query(`DROP DATABASE IF EXISTS ${TESTDB}`);
        await a2.end();
        console.log(`\n--- ${pass}/${pass + fail} passed --- (test DB dropped)`);
        process.exit(fail ? 1 : 0);
    }
}
main();
