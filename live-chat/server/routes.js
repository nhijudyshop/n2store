// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// EXPRESS ROUTES — status/events/start/stop/reload/reconnect/pages + the
// browser realtime start-multi + the 60s self-heal interval. Side-effect-free on
// require: registerRoutes(app, deps) is called once by the entry. The self-heal
// setInterval starts inside registerRoutes (an explicit init step), not at
// module load.
// =====================================================

function registerRoutes(app, deps) {
    const {
        clients,
        eventStore,
        firestore,
        db,
        MAX_EVENTS,
        requireRelaySecret,
        startClient,
        autoConnect,
        discoverPageIds,
        getDisabledPageIds,
        savePageSelection,
    } = deps;

    app.get('/', (req, res) => {
        const connectedCount = [...clients.values()].filter((c) => c.isConnected).length;
        res.json({
            service: 'N2Store Pancake WebSocket Client',
            version: '3.0.0',
            accounts: `${connectedCount}/${clients.size} connected`,
            firebase: firestore ? 'configured' : 'not configured',
            endpoints: {
                'GET /ping': 'Health check',
                'GET /api/status': 'All clients status',
                'GET /api/events': 'Query events (?since=ISO&type=...&limit=50&account=...)',
                'GET /api/events/latest': 'Latest events (?limit=20)',
                'POST /api/start': 'Start client { token, userId, name, cookie }',
                'POST /api/reconnect': 'Reconnect all clients',
                'POST /api/stop': 'Stop all clients',
                'POST /api/reload': 'Reload tokens from Firebase',
            },
        });
    });

    app.get('/ping', (req, res) => {
        const connectedCount = [...clients.values()].filter((c) => c.isConnected).length;
        const totalEvents = [...clients.values()].reduce((sum, c) => sum + c.eventsReceived, 0);
        res.json({
            success: true,
            service: 'n2store-pancake-ws',
            accounts: { total: clients.size, connected: connectedCount },
            uptime: process.uptime(),
            eventsReceived: totalEvents,
            eventStoreSize: eventStore.length,
            timestamp: new Date().toISOString(),
        });
    });

    // Detailed health — pool stats, memory, per-client state
    app.get('/health/detailed', (req, res) => {
        const mem = process.memoryUsage();
        const connectedCount = [...clients.values()].filter((c) => c.isConnected).length;
        const perClient = [...clients.values()].map((c) => ({
            name: c.name,
            userId: c.userId,
            connected: c.isConnected,
            reconnectAttempts: c.reconnectAttempts,
            events: c.eventsReceived,
            pageCount: c.pageIds?.length || 0,
        }));
        res.json({
            service: 'n2store-live-chat',
            status: connectedCount === clients.size && clients.size > 0 ? 'ok' : 'degraded',
            uptime_sec: Math.round(process.uptime()),
            memory_mb: {
                rss: Math.round(mem.rss / 1024 / 1024),
                heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
                heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
            },
            db: db
                ? { pool: { total: db.totalCount, idle: db.idleCount, waiting: db.waitingCount } }
                : null,
            accounts: { total: clients.size, connected: connectedCount },
            clients: perClient,
            events_received: [...clients.values()].reduce((s, c) => s + c.eventsReceived, 0),
            event_store_size: eventStore.length,
            node_version: process.version,
            pid: process.pid,
            timestamp: new Date().toISOString(),
        });
    });

    app.get('/api/status', (req, res) => {
        const statuses = {};
        for (const [userId, client] of clients) {
            statuses[client.name] = client.getStatus();
        }
        res.json({
            totalClients: clients.size,
            connectedClients: [...clients.values()].filter((c) => c.isConnected).length,
            eventStoreSize: eventStore.length,
            clients: statuses,
        });
    });

    // 3H8 (2026-06-12): event log chứa NGUYÊN payload Pancake WS (tên KH, fb_id,
    // snippet tin nhắn, recent_phone_numbers) — PII, gate như mutation.
    app.get('/api/events', requireRelaySecret, (req, res) => {
        const since = req.query.since;
        const type = req.query.type;
        const account = req.query.account;
        const limit = parseInt(req.query.limit || '50');
        const offset = parseInt(req.query.offset || '0');

        let filtered = eventStore;

        if (since) {
            const sinceDate = new Date(since);
            filtered = filtered.filter((e) => new Date(e.timestamp) > sinceDate);
        }
        if (type) filtered = filtered.filter((e) => e.type === type);
        if (account) filtered = filtered.filter((e) => e.account === account);

        const total = filtered.length;
        const results = filtered.slice(offset, offset + limit);

        res.json({ total, offset, limit, events: results });
    });

    app.get('/api/events/latest', requireRelaySecret, (req, res) => {
        const limit = parseInt(req.query.limit || '20');
        const events = eventStore.slice(-limit).reverse();
        res.json({ count: events.length, events });
    });

    app.post('/api/start', requireRelaySecret, async (req, res) => {
        const { token, userId, name, cookie } = req.body;

        if (!token || !userId) {
            return res.status(400).json({ error: 'Missing required: token, userId' });
        }

        const client = await startClient(
            token,
            userId,
            name || userId.substring(0, 8),
            cookie || `jwt=${token}`
        );
        if (!client) {
            return res.status(400).json({ error: 'No pages found for this account' });
        }
        res.json({
            success: true,
            message: `Client ${client.name} started`,
            pageCount: client.pageIds.length,
            pageIds: client.pageIds,
        });
    });

    app.post('/api/reconnect', requireRelaySecret, (req, res) => {
        let count = 0;
        for (const client of clients.values()) {
            if (client.token) {
                client.reconnectAttempts = 0;
                client.maxReconnectAttempts = Infinity;
                if (client.ws) client.ws.close();
                else client.connect();
                count++;
            }
        }
        res.json({ success: true, message: `Reconnecting ${count} clients` });
    });

    // GET /api/pages-available — danh sách MỌI trang của các account + trang nào đang
    // được CHỌN (join WS) + lỗi join per-page. Dùng cho UI checkbox pancake-settings.
    app.get('/api/pages-available', requireRelaySecret, async (req, res) => {
        try {
            const disabled = await getDisabledPageIds();
            const accounts = [];
            for (const [userId, client] of clients) {
                // allPages có thể rỗng nếu client nạp qua đường Postgres fallback (không
                // qua startClient). Discover on-demand bằng token rồi cache vào client.
                if ((!client.allPages || !client.allPages.length) && client.token) {
                    try {
                        const d = await discoverPageIds(client.token);
                        if (d.pages && d.pages.length) client.allPages = d.pages;
                    } catch (e) {
                        console.warn('[pages-available] discover fail:', e.message);
                    }
                }
                const connected = new Set((client.pageIds || []).map(String));
                const failed = new Set(
                    (client.joinErrors || [])
                        .filter((e) => String(e.topic || '').startsWith('pages:'))
                        .map((e) => String(e.topic).slice('pages:'.length))
                );
                accounts.push({
                    userId,
                    name: client.name,
                    connected: client.isConnected,
                    allPages: (client.allPages || []).map((p) => ({
                        id: String(p.id),
                        name: p.name || '',
                        image: p.image_url || p.avatar_url || '',
                        // enabled = trang đang trong tập kết nối (checkbox tick). Trang
                        // discover được nhưng chưa connect → bỏ tick, user tick + Lưu để bật.
                        enabled: connected.has(String(p.id)) && !disabled.has(String(p.id)),
                        joinFailed: failed.has(String(p.id)),
                    })),
                    selectedPageIds: [...connected],
                });
            }
            res.json({ success: true, accounts });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // POST /api/connect-pages { userId?, pageIds:[...] } — đặt tập trang BẬT cho 1
    // account (mặc định account đầu nếu thiếu userId) → lưu lựa chọn + reconnect WS
    // per-page đúng các trang đó. Đây là "endpoint chỉ cần thay id page là kết nối".
    app.post('/api/connect-pages', requireRelaySecret, async (req, res) => {
        try {
            const { userId, pageIds } = req.body || {};
            if (!Array.isArray(pageIds)) {
                return res.status(400).json({ success: false, error: 'pageIds[] required' });
            }
            const client = userId ? clients.get(userId) : [...clients.values()][0];
            if (!client) return res.status(404).json({ success: false, error: 'client not found' });

            const allMeta = client.allPages && client.allPages.length ? client.allPages : null;
            const allIds = allMeta
                ? allMeta.map((p) => String(p.id))
                : [...new Set([...(client.pageIds || []), ...pageIds].map(String))];
            const enabled = pageIds.map(String).filter((id) => allIds.includes(id));
            if (!enabled.length) {
                return res.status(400).json({ success: false, error: 'no valid pageIds selected' });
            }
            await savePageSelection(
                client.userId,
                enabled,
                allMeta || enabled.map((id) => ({ id }))
            );
            // Cập nhật pageIds + reconnect (close → on('close') tự connect lại, joinChannels per-page).
            client.pageIds = enabled;
            client.reconnectAttempts = 0;
            client.maxReconnectAttempts = Infinity;
            if (client.ws) client.ws.close();
            else client.connect();
            res.json({ success: true, userId: client.userId, pageIds: enabled });
        } catch (e) {
            res.status(500).json({ success: false, error: e.message });
        }
    });

    // Self-heal: every 60s, check for dead clients (not connected, not retrying)
    // and force reconnect. Prevents silent 'accounts=N, connected=0' state.
    setInterval(() => {
        for (const client of clients.values()) {
            if (!client.token) continue;
            if (client.isConnected) continue;
            if (client.reconnectTimer) continue; // already scheduled
            console.warn(
                `${client.tag ? client.tag() : '[WS]'} Self-heal: client has no pending reconnect — forcing connect`
            );
            client.reconnectAttempts = 0;
            client.maxReconnectAttempts = Infinity;
            try {
                client.connect();
            } catch (e) {
                console.error('[Self-heal] connect threw:', e.message);
            }
        }
    }, 60000);

    app.post('/api/stop', requireRelaySecret, (req, res) => {
        for (const client of clients.values()) {
            client.stop();
        }
        clients.clear();
        res.json({ success: true, message: 'All clients stopped' });
    });

    app.post('/api/reload', requireRelaySecret, async (req, res) => {
        // Stop all existing clients
        for (const client of clients.values()) {
            client.stop();
        }
        clients.clear();

        // Reload from Firebase
        await autoConnect();
        const connectedCount = [...clients.values()].filter((c) => c.isConnected).length;
        res.json({
            success: true,
            message: `Reloaded: ${clients.size} accounts, ${connectedCount} connecting`,
            accounts: [...clients.values()].map((c) => ({
                name: c.name,
                userId: c.userId,
                pages: c.pageIds.length,
            })),
        });
    });

    // =====================================================
    // POST /api/realtime/start-multi — browser (Web2Realtime) khởi tạo pool
    // per-account. DÙNG LẠI startClient + clients Map sẵn có (1 kết nối/account,
    // KHÔNG mở trùng). Ungated (browser gọi). Folded từ n2store-realtime 2026-06-16
    // → Web 2.0 tự túc realtime, hết phụ thuộc project cũ. KHÔNG có pending_customers
    // (unread ban đầu = fetch Pancake trực tiếp ở browser; live = WS + SSE).
    // =====================================================
    app.post('/api/realtime/start-multi', async (req, res) => {
        const accounts = Array.isArray(req.body?.accounts) ? req.body.accounts : [];
        if (!accounts.length) {
            return res.status(400).json({ success: false, error: 'accounts[] required' });
        }
        let poolSize = 0;
        const pageSet = new Set();
        for (const a of accounts) {
            const token = a.token;
            const userId = String(a.userId || a.accountId || '');
            const name = a.name || (userId ? userId.slice(0, 8) : 'acc');
            if (!token || !userId) continue;
            const existing = clients.get(userId);
            if (existing && existing.isConnected) {
                // Đã kết nối → reuse, KHÔNG mở kết nối Pancake trùng.
                poolSize++;
                (existing.allPages || []).forEach((p) => pageSet.add(String(p.id || p)));
                continue;
            }
            try {
                const c = await startClient(token, userId, name, a.cookie);
                if (c) {
                    poolSize++;
                    (c.allPages || []).forEach((p) => pageSet.add(String(p.id || p)));
                }
            } catch (e) {
                console.warn(`[START-MULTI] ${name} failed: ${e.message}`);
            }
            await new Promise((r) => setTimeout(r, 500)); // stagger tránh Pancake rate-limit
        }
        res.json({
            success: true,
            poolSize,
            totalPages: pageSet.size,
            plan: 'web2-realtime-merged',
        });
    });
}

module.exports = { registerRoutes };
