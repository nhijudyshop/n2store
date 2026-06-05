// #Note: Throwaway test — web2_unread_messages tracker (syncFromConversation authoritative). Local DB → test → DROP. KHÔNG đụng prod.
'use strict';
const { Client } = require('../render.com/node_modules/pg');
const tracker = require('../render.com/services/web2-unread-tracker');

const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_unread_test';

async function row(db, psid, page) {
    const r = await db.query(`SELECT * FROM web2_unread_messages WHERE psid=$1 AND page_id=$2`, [
        psid,
        page,
    ]);
    return r.rows[0] || null;
}
async function count(db) {
    const r = await db.query(`SELECT COUNT(*)::int n FROM web2_unread_messages`);
    return r.rows[0].n;
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
    const notify = (topic, p) => emitted.push({ topic, action: p.action });
    const sync = (d) => tracker.syncFromConversation(db, d, notify);

    try {
        await tracker.ensureSchema(db);
        await tracker.ensureSchema(db); // idempotent
        const t = await db.query(
            `SELECT 1 FROM information_schema.tables WHERE table_name='web2_unread_messages'`
        );
        ok(t.rows.length === 1, 'ensureSchema tạo bảng (idempotent ×2)');

        // 1. unread=2 → upsert count=2 (authoritative)
        await sync({
            psid: 'P1',
            pageId: 'PG1',
            unreadCount: 2,
            snippet: 'tin 1',
            customerName: 'KH A',
            conversationId: 'C1',
            shopSentLast: false,
        });
        let r = await row(db, 'P1', 'PG1');
        ok(r && r.message_count === 2, 'unread=2 → count=2');
        ok(
            emitted.some((e) => e.topic === 'web2:unread' && e.action === 'upsert'),
            'SSE upsert'
        );

        // 2. unread=5 → SET=5 (KHÔNG bump — authoritative, chống drift)
        await sync({
            psid: 'P1',
            pageId: 'PG1',
            unreadCount: 5,
            snippet: 'tin 2',
            shopSentLast: false,
        });
        r = await row(db, 'P1', 'PG1');
        ok(r && r.message_count === 5, 'unread=5 → SET=5 (không cộng dồn thành 7)');
        ok(r && r.last_message_snippet === 'tin 2', 'snippet cập nhật');

        // 3. unread=0 (đã đọc trên Pancake) → auto xoá
        await sync({ psid: 'P1', pageId: 'PG1', unreadCount: 0, shopSentLast: false });
        ok((await row(db, 'P1', 'PG1')) === null, 'unread=0 → tự xoá (đã đọc trên Pancake)');
        ok(
            emitted.some((e) => e.action === 'clear'),
            'SSE clear'
        );

        // 4. shopSentLast=true → auto xoá (shop trả lời, kể cả Pancake còn báo unread)
        await sync({
            psid: 'P2',
            pageId: 'PG1',
            unreadCount: 3,
            snippet: 'x',
            shopSentLast: false,
        });
        ok((await row(db, 'P2', 'PG1')) !== null, 'P2 unread=3 vào danh sách');
        await sync({ psid: 'P2', pageId: 'PG1', unreadCount: 3, shopSentLast: true });
        ok((await row(db, 'P2', 'PG1')) === null, 'shopSentLast=true → tự xoá (shop trả lời)');

        // 5. lastMessageTime từ Pancake được dùng nếu có
        await sync({
            psid: 'P3',
            pageId: 'PG1',
            unreadCount: 1,
            snippet: 'm',
            lastMessageTime: 1700000000000,
        });
        r = await row(db, 'P3', 'PG1');
        ok(r && Number(r.last_message_time) === 1700000000000, 'dùng lastMessageTime của Pancake');

        // 6. List query (route GET /)
        const list = await db.query(
            `SELECT psid, message_count FROM web2_unread_messages ORDER BY last_message_time DESC LIMIT 500`
        );
        ok(
            list.rows.length === 1 && list.rows[0].psid === 'P3',
            'list trả đúng (chỉ P3 còn unread)'
        );

        // 7. Không có hàm bump/onNewMessage/markSeen nữa (API gọn)
        ok(
            typeof tracker.syncFromConversation === 'function' &&
                tracker.onNewMessage === undefined &&
                tracker.markSeen === undefined,
            'API chỉ còn ensureSchema + syncFromConversation (bỏ bump/markSeen)'
        );
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
