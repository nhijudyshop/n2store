// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// N2STORE PANCAKE WEBSOCKET CLIENT (Multi-Account)
// Nhận tin nhắn Facebook Page realtime qua Pancake Phoenix WebSocket
// Tự động load tokens từ Firebase Firestore
// Deploy trên Render.com (service: n2store-live-chat)
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const WebSocket = require('ws');
const { Pool } = require('pg');
const facebookRoutes = require('./facebook-routes'); // WEB2.0: FB Graph (merged from n2store-facebook)

// Startup env validation — DB optional (falls back to Firebase). Warn for clarity.
const REQUIRED_ENV = ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
    console.warn(`[STARTUP] Missing env vars (Firebase disabled): ${missingEnv.join(', ')}`);
}

// Global safety net — prevent process exit on unhandled rejection / exception.
const { sendAlert } = require('./utils/alert');
process.on('unhandledRejection', (reason, promise) => {
    const stack = (reason && reason.stack) || String(reason);
    console.error('[PROCESS] Unhandled Rejection:', stack);
    sendAlert('unhandledRejection', String(reason).slice(0, 200), stack);
});
process.on('uncaughtException', (err) => {
    const stack = (err && err.stack) || String(err);
    console.error('[PROCESS] Uncaught Exception:', stack);
    sendAlert('uncaughtException', (err && err.message) || String(err), stack);
});

const app = express();
const PORT = process.env.PORT || 3000;
const MAX_EVENTS = parseInt(process.env.MAX_EVENTS || '1000');

// =====================================================
// REALTIME FORWARD → web2-api (SSE pub/sub Web 2.0). FALLBACK_BASE env trỏ web2-api sau tách 2026-06-14 (tên giữ lịch sử).
// Relay nhận event Pancake WS → forward sang fallback để:
//   • livestream comment → /api/web2-live-comments/ingest (ghi DB + SSE web2:live-comments)
//   • inbox conversation/message → /api/realtime/web2/sse/relay-notify (SSE web2:messages)
// Fire-and-forget; lỗi forward KHÔNG được làm vỡ relay WS.
// =====================================================
const FALLBACK_BASE = process.env.FALLBACK_BASE || 'https://web2-api-kv04.onrender.com';
const RELAY_SECRET = process.env.RELAY_SECRET || process.env.CLEANUP_SECRET || '';

function forwardToFallback(path, body) {
    // Node 18+ có global fetch (file đã dùng fetch cho discoverPageIds).
    // 1 retry sau 2s: fallback restart/cold-start làm rớt forward = comment
    // KHÔNG realtime (audit vòng 3 — loss point A1). Vẫn fire-and-forget với
    // relay WS; chỉ thêm 1 nhịp thử lại, không queue dài (poll-now warm-up
    // client bù phần mất lâu hơn).
    const doPost = () =>
        fetch(FALLBACK_BASE + path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-relay-secret': RELAY_SECRET },
            body: JSON.stringify(body),
        }).then((r) => {
            if (!r.ok && r.status !== 401) throw new Error(`HTTP ${r.status}`);
            return r;
        });
    try {
        doPost().catch((e1) => {
            setTimeout(() => {
                doPost().catch((e2) =>
                    console.warn('[FORWARD] fail (sau retry):', e1.message, '|', e2.message)
                );
            }, 2000);
        });
    } catch (e) {
        console.warn('[FORWARD] fail:', e.message);
    }
}

// Gate mutation routes (/api/start /api/stop /api/reload /api/reconnect) bằng
// x-relay-secret — audit 3H8: không auth thì ai cũng kill được relay realtime
// giữa buổi live. GET status/events giữ mở cho debug (không mutation).
function requireRelaySecret(req, res, next) {
    if (!RELAY_SECRET) return next(); // dev: secret rỗng → cho qua
    if ((req.headers['x-relay-secret'] || '') !== RELAY_SECRET) {
        return res.status(401).json({ success: false, error: 'unauthorized' });
    }
    next();
}

// =====================================================
// DATABASE (shared with render.com server)
// =====================================================

let db = null;

if (process.env.DATABASE_URL) {
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 5,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
    });

    // Without this listener, pg.Pool 'error' on idle clients crashes Node.
    db.on('error', (err) => {
        console.error('[db pool] Idle client error (non-fatal):', err.message);
    });

    db.query('SELECT NOW()')
        .then(() => console.log('[DB] PostgreSQL connected'))
        .catch((err) => console.error('[DB] PostgreSQL error:', err.message));
}

// =====================================================
// FIREBASE (read Pancake tokens from Firestore)
// =====================================================

let firestore = null;

function initFirebase() {
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

    if (!projectId || !clientEmail || !privateKey) {
        console.log('[FIREBASE] Not configured (missing env vars)');
        return;
    }

    try {
        const admin = require('firebase-admin');
        admin.initializeApp({
            credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
        });
        firestore = admin.firestore();
        console.log('[FIREBASE] Initialized');
    } catch (err) {
        console.error('[FIREBASE] Init error:', err.message);
    }
}

initFirebase();

async function loadTokensFromFirebase() {
    if (!firestore) return [];

    try {
        const doc = await firestore.collection('pancake_tokens').doc('accounts').get();
        if (!doc.exists) {
            console.log('[FIREBASE] No pancake_tokens/accounts document found');
            return [];
        }

        const data = doc.data()?.data;
        if (!data) return [];

        const accounts = Object.entries(data)
            .filter(([, info]) => info.token && info.uid)
            .filter(([, info]) => {
                // Skip expired tokens
                if (info.exp && info.exp < Date.now() / 1000) {
                    console.log(
                        `[FIREBASE] Skipping expired token: ${info.name} (exp: ${new Date(info.exp * 1000).toISOString()})`
                    );
                    return false;
                }
                return true;
            })
            .map(([uid, info]) => ({
                userId: info.uid || uid,
                token: info.token,
                name: info.name || 'unknown',
                cookie: info.cookie || `jwt=${info.token}`,
            }));

        console.log(
            `[FIREBASE] Loaded ${accounts.length} accounts: ${accounts.map((a) => a.name).join(', ')}`
        );
        return accounts;
    } catch (err) {
        console.error('[FIREBASE] Load error:', err.message);
        return [];
    }
}

// =====================================================
// PANCAKE API - Auto-discover pageIds
// =====================================================

async function discoverPageIds(token) {
    try {
        const res = await fetch(
            `https://pancake.vn/api/v1/pages?access_token=${encodeURIComponent(token)}`,
            {
                headers: {
                    Accept: 'application/json, text/plain, */*',
                    'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
                    Origin: 'https://pancake.vn',
                    Referer: 'https://pancake.vn/multi_pages',
                    Cookie: `jwt=${token}; locale=vi`,
                    'User-Agent':
                        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
                    'sec-ch-ua': '"Google Chrome";v="143", "Chromium";v="143"',
                    'sec-ch-ua-mobile': '?0',
                    'sec-ch-ua-platform': '"macOS"',
                    'sec-fetch-dest': 'empty',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-site': 'same-origin',
                },
            }
        );

        if (!res.ok) {
            console.error(`[PANCAKE-API] Failed to fetch pages: ${res.status} ${res.statusText}`);
            return { pageIds: [], pages: [] };
        }

        const data = await res.json();

        if (!data.success || !data.categorized) {
            console.error(
                '[PANCAKE-API] Unexpected response:',
                JSON.stringify(data).substring(0, 200)
            );
            return { pageIds: [], pages: [] };
        }

        const allPages = data.categorized.activated || [];
        const allPageIds = data.categorized.activated_page_ids || [];

        // Filter out Instagram pages (igo_) to avoid subscription errors
        const pageIds = allPageIds.filter((id) => !id.startsWith('igo_'));
        const pages = allPages.filter((p) => !String(p.id).startsWith('igo_'));

        console.log(
            `[PANCAKE-API] Discovered ${pageIds.length} pages: ${pages.map((p) => p.name || p.id).join(', ')}`
        );
        return { pageIds, pages };
    } catch (err) {
        console.error('[PANCAKE-API] Discover pages error:', err.message);
        return { pageIds: [], pages: [] };
    }
}

// =====================================================
// IN-MEMORY EVENT STORE
// =====================================================

const eventStore = [];
let eventIdCounter = 0;

function storeEvent(type, payload, accountName) {
    const event = {
        id: ++eventIdCounter,
        type,
        account: accountName,
        timestamp: new Date().toISOString(),
        payload,
    };

    eventStore.push(event);

    while (eventStore.length > MAX_EVENTS) {
        eventStore.shift();
    }

    return event;
}

// =====================================================
// PANCAKE WEBSOCKET CLIENT (Phoenix Protocol v2)
// =====================================================

class PancakeWebSocketClient {
    constructor(name = 'default') {
        this.name = name;
        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;

        this.connectedAt = null;
        this.eventsReceived = 0;
        this.joinErrors = [];
    }

    tag() {
        return `[WS:${this.name}]`;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        let result = '';
        for (let i = 0; i < 64; i++) {
            result += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return result;
    }

    start(token, userId, pageIds, cookie = null) {
        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map((id) => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;
        // Never give up — if we stop reconnecting, the service silently dies
        // (accounts=N, connected=0) and noone notices. Infinity + 60s cap keeps
        // retrying indefinitely but doesn't hammer the upstream.
        this.maxReconnectAttempts = Infinity;
        this.joinErrors = [];
        this.connect();
    }

    stop() {
        clearTimeout(this.reconnectTimer);
        this.stopHeartbeat();
        this.maxReconnectAttempts = 0;
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.connectedAt = null;
        console.log(`${this.tag()} Stopped`);
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log(
            `${this.tag()} Connecting... (attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`
        );

        const headers = {
            Origin: 'https://pancake.vn',
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log(`${this.tag()} Connected!`);
            this.isConnected = true;
            this.connectedAt = new Date().toISOString();
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code) => {
            console.log(`${this.tag()} Closed (code: ${code})`);
            this.isConnected = false;
            this.connectedAt = null;
            this.stopHeartbeat();

            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                // Exponential backoff capped at 60s — prevents hammering while
                // still retrying indefinitely (maxReconnectAttempts = Infinity).
                const cappedAttempts = Math.min(this.reconnectAttempts, 5);
                const delay = Math.min(2000 * Math.pow(2, cappedAttempts), 60000);
                this.reconnectAttempts++;
                console.log(
                    `${this.tag()} Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts})`
                );
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error(`${this.tag()} Max reconnect attempts reached.`);
            }
        });

        this.ws.on('error', (err) => {
            console.error(`${this.tag()} Error: ${err.message}`);
        });

        this.ws.on('message', (data) => {
            try {
                this.handleMessage(JSON.parse(data));
            } catch (e) {
                console.error(`${this.tag()} Parse error: ${e.message}`);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(JSON.stringify([null, this.makeRef(), 'phoenix', 'heartbeat', {}]));
            }
        }, 30000);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    joinChannels() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        const userRef = this.makeRef();
        this.ws.send(
            JSON.stringify([
                userRef,
                userRef,
                `users:${this.userId}`,
                'phx_join',
                { accessToken: this.token, userId: this.userId, platform: 'web' },
            ])
        );
        console.log(`${this.tag()} Joining users:${this.userId}`);

        // PER-PAGE join `pages:{pageId}` thay `multiple_pages:` (2026-06-15).
        // Vì sao: `multiple_pages:` GỘP mọi page vào 1 join — chỉ cần 1 page hết gói
        // cước, Pancake reject CẢ BÓ ("Gói cước hết hạn" / err 122) → 0 comment cho
        // mọi page (bug realtime live-chat: relay eventsReceived=2/giờ). Per-page:
        // page hết hạn chỉ page ĐÓ lỗi 122 (drop), các page còn hạn vẫn nhận
        // `pages:update_conversation` livestream comment. Mirror web2/shared/web2-realtime.js.
        this.joinedPages = new Set();
        for (const pageId of this.pageIds) {
            const ref = this.makeRef();
            this.ws.send(
                JSON.stringify([
                    ref,
                    ref,
                    `pages:${pageId}`,
                    'phx_join',
                    { accessToken: this.token, userId: this.userId, platform: 'web' },
                ])
            );
            this.joinedPages.add(String(pageId));
        }
        console.log(
            `${this.tag()} Joining ${this.pageIds.length} per-page channels: [${this.pageIds.join(', ')}]`
        );
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        if (event === 'phx_reply') {
            if (payload.status === 'ok') {
                if (topic.startsWith('users:')) {
                    console.log(`${this.tag()} Joined users channel`);
                } else if (topic.startsWith('pages:')) {
                    // per-page join ok — nhận pages:update_conversation cho page này
                } else if (topic.startsWith('multiple_pages:')) {
                    console.log(`${this.tag()} Joined multiple_pages channel`);
                }
            } else if (payload.status === 'error') {
                const errMsg = JSON.stringify(payload.response || {}).substring(0, 200);
                console.error(`${this.tag()} Join ERROR: topic=${topic} ${errMsg}`);
                this.joinErrors.push({
                    topic,
                    error: payload.response,
                    time: new Date().toISOString(),
                });
                // Per-page hết gói cước (err 122) → page đó rớt, các page khác vẫn chạy.
                if (topic.startsWith('pages:') && this.joinedPages) {
                    this.joinedPages.delete(topic.slice('pages:'.length));
                }
            }
            return;
        }

        if (topic === 'phoenix') return;

        if (event === 'pages:update_conversation') {
            this.eventsReceived++;
            const conv = payload.conversation;
            const stored = storeEvent('update_conversation', payload, this.name);

            console.log(`${this.tag()} ========================================`);
            console.log(`${this.tag()} #${stored.id} UPDATE_CONVERSATION`);
            console.log(`  Page:    ${conv.page_id}`);
            console.log(`  Type:    ${conv.type}`);
            console.log(`  From:    ${conv.from?.name || 'unknown'} (${conv.from?.id || ''})`);
            console.log(`  Snippet: ${(conv.snippet || '').substring(0, 100)}`);
            console.log(`  Unread:  ${conv.unread_count || 0}`);
            console.log(`  ConvID:  ${conv.id}`);
            console.log(`  Time:    ${conv.updated_at || stored.timestamp}`);
            if (conv.customers?.length) {
                console.log(`  Customer: ${conv.customers[0].name} (${conv.customers[0].fb_id})`);
            }
            console.log(`${this.tag()} ========================================`);

            // Forward → fallback (realtime push tới browser).
            if (conv.type === 'COMMENT' && conv.post?.type === 'livestream') {
                forwardToFallback('/api/web2-live-comments/ingest', { conversations: [conv] });
                console.log(`[REALTIME] livestream comment → ingest post=${conv.post_id}`);
            } else {
                forwardToFallback('/api/realtime/web2/sse/relay-notify', {
                    key: 'web2:messages',
                    data: {
                        action: 'update_conversation',
                        pageId: conv.page_id,
                        convId: conv.id,
                        ts: Date.now(),
                    },
                });
                // Tee sang browser WS broker (Web2Realtime) — chỉ inbox, không livestream.
                broadcastToBrowsers('pages:update_conversation', payload);
            }
            return;
        }

        if (event === 'pages:new_message') {
            this.eventsReceived++;
            broadcastToBrowsers('pages:new_message', payload); // tee → browser WS broker
            const message = payload.message || payload;
            const stored = storeEvent('new_message', payload, this.name);
            console.log(
                `${this.tag()} #${stored.id} NEW_MESSAGE | from=${message.from?.name || 'unknown'} | "${(message.message || '').substring(0, 80)}"`
            );
            forwardToFallback('/api/realtime/web2/sse/relay-notify', {
                key: 'web2:messages',
                data: { action: 'new_message', ts: Date.now() },
            });
            return;
        }

        if (event === 'order:tags_updated' || event === 'tags_updated') {
            this.eventsReceived++;
            storeEvent('tags_updated', payload, this.name);
            console.log(`${this.tag()} TAGS_UPDATED: conv=${payload.conversation_id}`);
            return;
        }

        if (event === 'online_status' || event === 'presence_state' || event === 'presence_diff')
            return;

        this.eventsReceived++;
        storeEvent(event, payload, this.name);
        console.log(
            `${this.tag()} EVENT: ${event} | keys: ${Object.keys(payload || {}).join(', ')}`
        );
    }

    getStatus() {
        return {
            name: this.name,
            connected: this.isConnected,
            connectedAt: this.connectedAt,
            uptime: this.connectedAt
                ? Math.round((Date.now() - new Date(this.connectedAt).getTime()) / 1000)
                : 0,
            userId: this.userId,
            pageIds: this.pageIds,
            pageCount: this.pageIds.length,
            eventsReceived: this.eventsReceived,
            reconnectAttempts: this.reconnectAttempts,
            wsState: this.ws ? this.ws.readyState : null,
            joinErrors: this.joinErrors,
        };
    }
}

// =====================================================
// MULTI-CLIENT MANAGER
// =====================================================

const clients = new Map(); // userId → PancakeWebSocketClient

// =====================================================
// PAGE SELECTION — relay chỉ join WS các trang được CHỌN (per-page).
// Mặc định: tất cả trang discover được (page hết gói cước tự rớt err 122).
// User tick/bỏ tick ở pancake-settings → POST /api/connect-pages → ghi bảng này.
// =====================================================
const SELECTION_TABLE = 'web2_live_relay_pages';
let _selectionTableReady = false;
async function ensureSelectionTable() {
    if (!db || _selectionTableReady) return;
    await db.query(`
        CREATE TABLE IF NOT EXISTS ${SELECTION_TABLE} (
            page_id    VARCHAR(50) PRIMARY KEY,
            page_name  VARCHAR(255),
            user_id    VARCHAR(80),
            enabled    BOOLEAN DEFAULT true,
            updated_at BIGINT
        )
    `);
    _selectionTableReady = true;
}
// Trang bị TẮT (enabled=false). Trang không có row = mặc định BẬT.
async function getDisabledPageIds() {
    if (!db) return new Set();
    try {
        await ensureSelectionTable();
        const r = await db.query(`SELECT page_id FROM ${SELECTION_TABLE} WHERE enabled = false`);
        return new Set(r.rows.map((x) => String(x.page_id)));
    } catch (e) {
        console.warn('[SELECTION] getDisabled fail:', e.message);
        return new Set();
    }
}
// Lưu lựa chọn: pages BẬT = enabledIds; mọi page khác của account (trong allPages) = TẮT.
async function savePageSelection(userId, enabledIds, allPages) {
    if (!db) return;
    await ensureSelectionTable();
    const enabled = new Set((enabledIds || []).map(String));
    const now = Date.now();
    for (const p of allPages || []) {
        const pid = String(p.id);
        await db.query(
            `INSERT INTO ${SELECTION_TABLE} (page_id, page_name, user_id, enabled, updated_at)
             VALUES ($1,$2,$3,$4,$5)
             ON CONFLICT (page_id) DO UPDATE SET
                page_name = EXCLUDED.page_name, user_id = EXCLUDED.user_id,
                enabled = EXCLUDED.enabled, updated_at = EXCLUDED.updated_at`,
            [pid, p.name || null, userId, enabled.has(pid), now]
        );
    }
}

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
    const client = new PancakeWebSocketClient(name);
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
    const firebaseAccounts = await loadTokensFromFirebase();

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

            const client = new PancakeWebSocketClient(row.user_id.substring(0, 8));
            client.start(row.token, row.user_id, pageIds, row.cookie);
            clients.set(row.user_id, client);
            await new Promise((r) => setTimeout(r, 2000));
        }
        console.log(`[STARTUP] Started ${clients.size} clients from DB`);
    } catch (err) {
        console.error('[STARTUP] DB load error:', err.message);
    }
}

// =====================================================
// MIDDLEWARE
// =====================================================

// Baseline security headers
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// CORS — frontend (nhijudy.store / github.io) gọi FB Graph endpoints cross-origin
app.use(cors({ origin: '*' }));

app.use(express.json());

// Request logging (skip noisy health-check probes — Render pings every ~5s)
app.use((req, res, next) => {
    if (req.path !== '/ping' && req.path !== '/health' && req.path !== '/health/detailed') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// Facebook Graph API routes (merged from n2store-facebook 2026-06-14):
// /api/pages/*, /api/conversations/*, /api/refresh-tokens, /api/facebook-status
app.use(facebookRoutes);

// =====================================================
// ROUTES
// =====================================================

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
        await savePageSelection(client.userId, enabled, allMeta || enabled.map((id) => ({ id })));
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
    res.json({ success: true, poolSize, totalPages: pageSet.size, plan: 'web2-realtime-merged' });
});

// =====================================================
// START SERVER
// =====================================================

const httpServer = app.listen(PORT, () => {
    console.log('');
    console.log('=====================================================');
    console.log(' N2STORE PANCAKE WEBSOCKET CLIENT v3.0');
    console.log(' Multi-Account + Firebase Integration');
    console.log('=====================================================');
    console.log(`  Port:          ${PORT}`);
    console.log(`  Max Events:    ${MAX_EVENTS}`);
    console.log(`  Database:      ${db ? 'configured' : 'NOT SET'}`);
    console.log(`  Firebase:      ${firestore ? 'configured' : 'NOT SET'}`);
    console.log(`  Server URL:    http://localhost:${PORT}`);
    console.log('=====================================================');
    console.log('');

    setTimeout(() => autoConnect(), 2000);
});

// =====================================================
// BROWSER-FACING WS BROKER (folded từ n2store-realtime 2026-06-16)
// web2-realtime giờ phục vụ CẢ: (1) relay Pancake→SSE (forwardToFallback — GIỮ
// NGUYÊN) + (2) WS server cho browser (Web2Realtime proxy fallback). KHÔNG mở
// thêm kết nối Pancake — chỉ "tee" event đã nhận sang browser. Hợp đồng client
// (web2/shared/web2-realtime.js): connect wss://<host>/ (no path) → nhận JSON
// { type, payload }. Dedup 30s để 2 account cùng page không bắn trùng.
// =====================================================
const browserWss = new WebSocket.Server({ server: httpServer });
const _bSeen = new Map();
const _B_DEDUP_MS = 30_000;
function _bDedupKey(type, p) {
    if (!type || !p) return null;
    if (type === 'pages:new_message') {
        const m = p.message || {};
        if (m.id) return `nm:${m.id}`;
    }
    if (type === 'pages:update_conversation') {
        const c = p.conversation || {};
        const lm = c.last_message && c.last_message.id;
        if (c.id && lm) return `uc:${c.id}:${lm}`;
        if (c.id) return `uc:${c.id}:${c.updated_at || c.last_sent_at || ''}`;
    }
    return null;
}
function broadcastToBrowsers(type, payload) {
    if (!browserWss.clients.size) return;
    const key = _bDedupKey(type, payload);
    if (key) {
        const now = Date.now();
        const last = _bSeen.get(key);
        if (last && now - last < _B_DEDUP_MS) return; // echo multi-account cùng page → bỏ
        _bSeen.set(key, now);
        if (_bSeen.size > 500) {
            for (const [k, t] of _bSeen) if (now - t > _B_DEDUP_MS) _bSeen.delete(k);
        }
    }
    const msg = JSON.stringify({ type, payload });
    browserWss.clients.forEach((c) => {
        if (c.readyState === WebSocket.OPEN) c.send(msg);
    });
}
const _browserPing = setInterval(() => {
    browserWss.clients.forEach((ws) => {
        if (ws.isAlive === false) return ws.terminate();
        ws.isAlive = false;
        try {
            ws.ping();
        } catch {
            /* ignore */
        }
    });
}, 30_000);
browserWss.on('connection', (ws) => {
    ws.isAlive = true;
    ws.on('pong', () => {
        ws.isAlive = true;
    });
    console.log(`[BROKER-WS] browser connected (total ${browserWss.clients.size})`);
    ws.on('close', () =>
        console.log(`[BROKER-WS] browser disconnected (total ${browserWss.clients.size})`)
    );
});
browserWss.on('close', () => clearInterval(_browserPing));

// Graceful shutdown — close HTTP + WS clients + DB pool cleanly.
let _shuttingDown = false;
async function gracefulShutdown(signal) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[SHUTDOWN] Received ${signal}, closing...`);
    try {
        for (const client of clients.values()) {
            try {
                client.stop();
            } catch (_) {}
        }
        clients.clear();
    } catch (_) {}
    try {
        await new Promise((resolve) => httpServer.close(resolve));
        console.log('[SHUTDOWN] HTTP server closed');
    } catch (e) {
        console.warn('[SHUTDOWN] HTTP close error:', e.message);
    }
    try {
        if (db && typeof db.end === 'function') {
            await Promise.race([db.end(), new Promise((r) => setTimeout(r, 5000))]);
            console.log('[SHUTDOWN] DB pool closed');
        }
    } catch (e) {
        console.warn('[SHUTDOWN] DB close error:', e.message);
    }
    console.log('[SHUTDOWN] Done, exit 0');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
