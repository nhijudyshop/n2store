// #Note: Throwaway test — web2-unread-reconcile applyConversations + _convToSyncData. Local DB → test → DROP.
'use strict';
const { Client } = require('../render.com/node_modules/pg');
const tracker = require('../render.com/services/web2-unread-tracker');
const reconcile = require('../render.com/services/web2-unread-reconcile');

const ADMIN = { host: 'localhost', port: 5432, database: 'postgres', user: process.env.USER };
const TESTDB = 'n2store_reconcile_test';
const PAGE = '270136663390370';

async function has(db, psid) {
    const r = await db.query(`SELECT 1 FROM web2_unread_messages WHERE psid=$1 AND page_id=$2`, [
        psid,
        PAGE,
    ]);
    return r.rows.length > 0;
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

    try {
        await tracker.ensureSchema(db);

        // _convToSyncData: psid từ conv id "{page}_{psid}", shopSentLast
        const d1 = reconcile._convToSyncData(
            {
                id: `${PAGE}_AAA`,
                unread_count: 2,
                from: { name: 'KH A' },
                snippet: 'hi',
                last_sent_by: { id: 'AAA' },
            },
            PAGE
        );
        ok(
            d1 && d1.psid === 'AAA' && d1.unreadCount === 2 && d1.shopSentLast === false,
            '_convToSyncData: psid + unread + customer last'
        );
        const d2 = reconcile._convToSyncData(
            { id: `${PAGE}_BBB`, unread_count: 3, last_sent_by: { id: PAGE } },
            PAGE
        );
        ok(d2 && d2.shopSentLast === true, '_convToSyncData: shopSentLast khi last_sent_by=page');

        // Seed: 3 row đang có trong DB
        for (const [psid, snip] of [
            ['PKEEP', 'đã ck'],
            ['PREAD', 'cũ'],
            ['PSHOP', 'cũ'],
        ]) {
            await tracker.syncFromConversation(
                db,
                {
                    psid,
                    pageId: PAGE,
                    unreadCount: 1,
                    snippet: snip,
                    conversationId: `${PAGE}_${psid}`,
                },
                null
            );
        }
        ok(
            (await has(db, 'PKEEP')) && (await has(db, 'PREAD')) && (await has(db, 'PSHOP')),
            'seed 3 row'
        );

        // Pancake trả về trạng thái THẬT:
        //  PKEEP còn unread (giữ) · PREAD đã đọc unread=0 (xoá) ·
        //  PSHOP shop trả lời (xoá) · PNEW unread mới (thêm — event ADD bị miss)
        const convs = [
            {
                id: `${PAGE}_PKEEP`,
                unread_count: 1,
                from: { name: 'Keep' },
                snippet: 'đã ck',
                last_sent_by: { id: 'PKEEP' },
            },
            {
                id: `${PAGE}_PREAD`,
                unread_count: 0,
                from: { name: 'Read' },
                snippet: 'x',
                last_sent_by: { id: 'PREAD' },
            },
            {
                id: `${PAGE}_PSHOP`,
                unread_count: 2,
                from: { name: 'Shop' },
                snippet: 'x',
                last_sent_by: { id: PAGE },
            },
            {
                id: `${PAGE}_PNEW`,
                unread_count: 1,
                from: { name: 'New' },
                snippet: 'CK XONG',
                last_sent_by: { id: 'PNEW' },
            },
        ];
        const applied = await reconcile.applyConversations(db, PAGE, convs, null);
        ok(applied === 4, 'applyConversations xử lý 4 conv');

        ok(await has(db, 'PKEEP'), 'PKEEP còn unread → GIỮ');
        ok(!(await has(db, 'PREAD')), 'PREAD unread=0 → XOÁ (đã đọc trên Pancake)');
        ok(!(await has(db, 'PSHOP')), 'PSHOP shop trả lời → XOÁ');
        ok(await has(db, 'PNEW'), 'PNEW unread mới → THÊM (bắt event ADD bị miss)');

        const cnt = await db.query(`SELECT COUNT(*)::int n FROM web2_unread_messages`);
        ok(cnt.rows[0].n === 2, 'còn đúng 2 row (PKEEP + PNEW)');
    } catch (e) {
        fail++;
        console.error('❌ EXCEPTION:', e.message, e.stack);
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
