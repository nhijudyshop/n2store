// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// MULTI-CLIENT MANAGER — owns the clients Map + orchestration (startClient,
// autoConnect). Side-effect-free on require: createClientManager(deps) builds the
// orchestrator; nothing connects until startClient/autoConnect is called by the
// entry. Dependencies (db, firestore, pancake-api, page-selection, firebase
// loader, client factory) are injected so this module has no global coupling.
// =====================================================

function createClientManager(deps) {
    const {
        db,
        firestore,
        discoverPageIds,
        getDisabledPageIds,
        savePageSelection,
        loadTokensFromFirebase,
        createClient, // (name) => new PancakeWebSocketClient(name, { storeEvent, forward, broadcast })
    } = deps;

    const clients = new Map(); // userId → PancakeWebSocketClient

    async function startClient(token, userId, name, cookie) {
        // Stop existing client for this userId
        if (clients.has(userId)) {
            clients.get(userId).stop();
        }

        // Discover pageIds from Pancake API
        console.log(`[MANAGER] Discovering pages for ${name}...`);
        const { pageIds, pages } = await discoverPageIds(token);

        if (pageIds.length === 0) {
            console.warn(`[MANAGER] No pages found for ${name}, skipping`);
            return null;
        }

        // Lọc theo lựa chọn user (trang bị TẮT thì không join WS). Mặc định bật hết.
        const disabled = await getDisabledPageIds();
        const selectedIds = pageIds.filter((id) => !disabled.has(String(id)));
        const connectIds = selectedIds.length ? selectedIds : pageIds;

        // Save to DB for future use
        if (db) {
            try {
                await db.query(
                    `
                    INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, is_active, updated_at)
                    VALUES ($1, $2, $3, $4, $5, TRUE, NOW())
                    ON CONFLICT (client_type, user_id) DO UPDATE SET
                        token = EXCLUDED.token,
                        page_ids = EXCLUDED.page_ids,
                        cookie = EXCLUDED.cookie,
                        is_active = TRUE,
                        updated_at = NOW()
                `,
                    [`pancake_${name}`, token, userId, JSON.stringify(pageIds), cookie]
                );
                console.log(`[MANAGER] Saved credentials for ${name} to DB`);
            } catch (e) {
                // Ignore if table structure doesn't support composite key
                console.log(`[MANAGER] Could not save to DB: ${e.message}`);
            }
        }

        console.log(
            `[MANAGER] Starting client: ${name} (${userId}) — ${connectIds.length}/${pageIds.length} pages selected`
        );
        const client = createClient(name);
        client.allPages = pages; // meta đầy đủ cho UI checkbox (id, name, image)
        client.cookieStr = cookie;
        client.start(token, userId, connectIds, cookie);
        clients.set(userId, client);
        return client;
    }

    // =====================================================
    // STARTUP - Load tokens from Firebase + DB
    // =====================================================
    async function autoConnect() {
        console.log('[STARTUP] Auto-connecting...');

        // 1. Try Firebase first
        const firebaseAccounts = await loadTokensFromFirebase(firestore);

        if (firebaseAccounts.length > 0) {
            for (const account of firebaseAccounts) {
                // Stagger connections to avoid rate limiting
                await startClient(account.token, account.userId, account.name, account.cookie);
                await new Promise((r) => setTimeout(r, 2000));
            }
            console.log(`[STARTUP] Started ${clients.size} clients from Firebase`);
            return;
        }

        // 2. Fallback to PostgreSQL
        if (!db) {
            console.log(
                '[STARTUP] No Firebase or DB configured. Use POST /api/start to connect manually.'
            );
            return;
        }

        try {
            // MEDIUM-cleanup (2026-06-13): startClient lưu client_type = 'pancake_<name>'
            // (line ~616) nhưng fallback này load WHERE client_type = 'pancake' →
            // KHÔNG match row nào → khi Firebase outage relay khởi động với 0 client
            // (realtime comment chết im lặng). Đổi sang LIKE 'pancake%'.
            const result = await db.query(
                `SELECT token, user_id, page_ids, cookie FROM realtime_credentials WHERE client_type LIKE 'pancake%' AND is_active = TRUE`
            );

            for (const row of result.rows) {
                const pageIds =
                    typeof row.page_ids === 'string' ? JSON.parse(row.page_ids) : row.page_ids;
                if (!row.token || !row.user_id || !pageIds?.length) continue;

                const client = createClient(row.user_id.substring(0, 8));
                client.start(row.token, row.user_id, pageIds, row.cookie);
                clients.set(row.user_id, client);
                await new Promise((r) => setTimeout(r, 2000));
            }
            console.log(`[STARTUP] Started ${clients.size} clients from DB`);
        } catch (err) {
            console.error('[STARTUP] DB load error:', err.message);
        }
    }

    return { clients, startClient, autoConnect };
}

module.exports = { createClientManager };
