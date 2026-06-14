// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// N2STORE REALTIME SERVER
// WebSocket proxy for Pancake.vn
// With PostgreSQL for message persistence
// Deployed on Render.com (Standard Plan)
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const WebSocket = require('ws');
const { Pool } = require('pg');

// Startup env validation — warn-only: realtime server can run without DB
// (falls back to in-memory credentials). Log what's missing for debugging.
const REQUIRED_ENV = ['DATABASE_URL'];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
    console.warn(`[STARTUP] Missing env vars (running in degraded mode): ${missingEnv.join(', ')}`);
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

// =====================================================
// DATABASE CONNECTION
// =====================================================

let dbPool = null;

async function initDatabase() {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
        console.warn('[DATABASE] ⚠️ DATABASE_URL not set - running without database persistence');
        return null;
    }

    try {
        dbPool = new Pool({
            connectionString: databaseUrl,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            statement_timeout: 30000,
            idle_in_transaction_session_timeout: 60000,
        });

        // Without this listener, pg.Pool 'error' on idle clients crashes Node.
        dbPool.on('error', (err) => {
            console.error('[dbPool] Idle client error (non-fatal):', err.message);
        });

        // Test connection
        const client = await dbPool.connect();
        await client.query('SELECT 1');
        client.release();

        console.log('[DATABASE] ✅ PostgreSQL connected successfully');

        // Initialize tables
        await ensureTablesExist();

        return dbPool;
    } catch (error) {
        console.error('[DATABASE] ❌ Failed to connect:', error.message);
        return null;
    }
}

async function ensureTablesExist() {
    if (!dbPool) return;

    try {
        // Create realtime_credentials table (legacy single-account)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS realtime_credentials (
                id SERIAL PRIMARY KEY,
                client_type VARCHAR(20) NOT NULL UNIQUE,
                token TEXT NOT NULL,
                user_id VARCHAR(50),
                page_ids TEXT,
                cookie TEXT,
                room VARCHAR(100),
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Multi-account pool: one row per Pancake account. `verified_pages`
        // is the subset of pageIds that have successfully joined the
        // Pancake `pages:{pageId}` Phoenix channel — used to skip pages
        // we know fail (permission, dead, …) on reconnect.
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS realtime_accounts (
                account_id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(255),
                token TEXT NOT NULL,
                user_id VARCHAR(100),
                cookie TEXT,
                proposed_pages JSONB DEFAULT '[]'::jsonb,
                verified_pages JSONB DEFAULT '[]'::jsonb,
                last_seen_at TIMESTAMP DEFAULT NOW(),
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW()
            )
        `);

        // Create pending_customers table
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS pending_customers (
                id SERIAL PRIMARY KEY,
                psid VARCHAR(50) NOT NULL,
                page_id VARCHAR(50) NOT NULL,
                customer_name VARCHAR(200),
                last_message_snippet TEXT,
                last_message_time TIMESTAMP DEFAULT NOW(),
                message_count INTEGER DEFAULT 1,
                type VARCHAR(20) DEFAULT 'INBOX' CHECK (type IN ('INBOX', 'COMMENT')),
                created_at TIMESTAMP DEFAULT NOW(),
                UNIQUE(psid, page_id)
            )
        `);

        // Create indexes
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_pending_customers_psid ON pending_customers(psid, page_id);
            CREATE INDEX IF NOT EXISTS idx_pending_customers_time ON pending_customers(last_message_time DESC);
        `);

        // Drop old conversation_post_types table (replaced by livestream_conversations)
        await dbPool.query(`DROP TABLE IF EXISTS conversation_post_types`);

        // Create livestream_conversations table (single source of truth for livestream tab + labels)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS livestream_conversations (
                conv_id VARCHAR(500) PRIMARY KEY,
                post_id VARCHAR(500) NOT NULL,
                post_name TEXT,
                name VARCHAR(200),
                avatar TEXT,
                last_message TEXT,
                conv_time TIMESTAMP,
                type VARCHAR(20),
                page_id VARCHAR(255),
                page_name VARCHAR(200),
                psid VARCHAR(100),
                customer_id VARCHAR(255),
                label TEXT DEFAULT 'new',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);
        // Add post_name column if missing (for existing tables)
        await dbPool
            .query(`ALTER TABLE livestream_conversations ADD COLUMN IF NOT EXISTS post_name TEXT`)
            .catch(() => {});
        // Widen label column from VARCHAR(50) to TEXT (supports JSON arrays of multiple labels)
        await dbPool
            .query(`ALTER TABLE livestream_conversations ALTER COLUMN label TYPE TEXT`)
            .catch(() => {});
        await dbPool.query(`
            CREATE INDEX IF NOT EXISTS idx_livestream_conv_post ON livestream_conversations(post_id);
        `);

        // Drop old tables that are no longer needed
        await dbPool.query(`
            DROP TABLE IF EXISTS livestream_customers;
            DROP TABLE IF EXISTS pinned_conversations;
        `);

        // Create conversation_labels table (dedicated label storage, separate from livestream)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS conversation_labels (
                conv_id VARCHAR(500) PRIMARY KEY,
                labels TEXT NOT NULL DEFAULT '["new"]',
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // One-time migration: copy labels from livestream_conversations to conversation_labels
        await dbPool
            .query(
                `
            INSERT INTO conversation_labels (conv_id, labels, updated_at)
            SELECT conv_id, label, updated_at FROM livestream_conversations
            WHERE label IS NOT NULL AND label != 'new' AND label != '["new"]'
            ON CONFLICT (conv_id) DO NOTHING
        `
            )
            .catch(() => {});

        // Clean up: remove fake 'inbox' rows from livestream_conversations (created by old label upsert)
        await dbPool
            .query(`DELETE FROM livestream_conversations WHERE post_id = 'inbox'`)
            .catch(() => {});

        // Create inbox_groups table (group definitions synced across devices)
        await dbPool.query(`
            CREATE TABLE IF NOT EXISTS inbox_groups (
                id VARCHAR(100) PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                color VARCHAR(20) DEFAULT '#3b82f6',
                note TEXT,
                sort_order INTEGER DEFAULT 0,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        `);

        // (2026-04-18) Legacy table tpos_empty_cart_sync đã bỏ (auto-tag GIỎ TRỐNG
        // không còn dùng). Nếu bảng còn tồn tại trong DB cũ, có thể DROP thủ công.
        console.log('[DATABASE] ✅ Tables initialized');
    } catch (error) {
        console.error('[DATABASE] Error creating tables:', error.message);
    }
}

// =====================================================
// DATABASE OPERATIONS
// =====================================================

async function upsertPendingCustomer(data) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO pending_customers
                (psid, page_id, customer_name, last_message_snippet, last_message_time, message_count, type)
            VALUES ($1, $2, $3, $4, NOW(), 1, $5)
            ON CONFLICT (psid, page_id)
            DO UPDATE SET
                customer_name = COALESCE(EXCLUDED.customer_name, pending_customers.customer_name),
                last_message_snippet = EXCLUDED.last_message_snippet,
                last_message_time = NOW(),
                message_count = pending_customers.message_count + 1
        `;

        await dbPool.query(query, [
            data.psid,
            data.pageId,
            data.customerName,
            data.snippet?.substring(0, 200),
            data.type || 'INBOX',
        ]);

        console.log(`[DATABASE] ✅ Upserted pending customer: ${data.psid} (${data.type})`);
    } catch (error) {
        console.error('[DATABASE] Error upserting pending customer:', error.message);
    }
}

/**
 * Auto-cleanup: Delete pending_customers older than 30 days
 */
async function cleanupExpiredPendingCustomers() {
    if (!dbPool) return;

    try {
        const result = await dbPool.query(`
            DELETE FROM pending_customers
            WHERE last_message_time < NOW() - INTERVAL '30 days'
        `);

        if (result.rowCount > 0) {
            console.log(
                `[DATABASE] 🧹 Cleaned up ${result.rowCount} expired pending customers (>30 days)`
            );
        }
    } catch (error) {
        console.error('[DATABASE] Error cleaning up expired customers:', error.message);
    }
}

async function saveRealtimeCredentials(clientType, credentials) {
    if (!dbPool) return;

    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type)
            DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;

        await dbPool.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null,
        ]);

        console.log(`[DATABASE] ✅ Saved ${clientType} credentials for auto-reconnect`);
    } catch (error) {
        console.error('[DATABASE] Error saving credentials:', error.message);
    }
}

async function loadRealtimeCredentials(clientType) {
    if (!dbPool) return null;

    try {
        const result = await dbPool.query(
            'SELECT * FROM realtime_credentials WHERE client_type = $1 AND is_active = TRUE',
            [clientType]
        );
        return result.rows[0] || null;
    } catch (error) {
        console.error('[DATABASE] Error loading credentials:', error.message);
        return null;
    }
}

async function disableRealtimeCredentials(clientType) {
    if (!dbPool) return;

    try {
        await dbPool.query(
            'UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = $1',
            [clientType]
        );
        console.log(`[DATABASE] Disabled ${clientType} auto-connect`);
    } catch (error) {
        console.error('[DATABASE] Error disabling credentials:', error.message);
    }
}

// =====================================================
// Multi-account credential persistence
// =====================================================

/**
 * Upsert an account row when the browser pushes /api/realtime/start-multi.
 * Stores token+cookie+userId so auto-reconnect after Render restart can
 * recreate the pool from DB without needing a browser to push again.
 * Page lists are recorded as `proposed_pages` (what the browser wanted)
 * and `verified_pages` (what Pancake actually accepted) — see
 * markPageVerified() below.
 */
async function saveRealtimeAccount(acc) {
    if (!dbPool) return;
    try {
        // Prefer the richer `pages: [{id, name}, ...]` shape when the
        // client sent it (labels are useful for the pool-status UI and
        // for human-readable logs). Fall back to bare ID array for
        // legacy callers that only push pageIds.
        let proposed;
        if (Array.isArray(acc.pages) && acc.pages.length) {
            proposed = acc.pages
                .map((p) => ({
                    id: String((p && (p.id || p.page_id || p.pageId)) || ''),
                    name: (p && (p.name || p.page_name)) || null,
                }))
                .filter((p) => p.id);
        } else {
            proposed = (acc.pageIds || []).map((id) => ({ id: String(id), name: null }));
        }
        await dbPool.query(
            `INSERT INTO realtime_accounts (account_id, name, token, user_id, cookie, proposed_pages, is_active, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6::jsonb, TRUE, NOW())
             ON CONFLICT (account_id) DO UPDATE SET
                name = EXCLUDED.name,
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                cookie = EXCLUDED.cookie,
                proposed_pages = EXCLUDED.proposed_pages,
                is_active = TRUE,
                last_seen_at = NOW(),
                updated_at = NOW()`,
            [
                String(acc.accountId),
                acc.name || null,
                acc.token,
                acc.userId || null,
                acc.cookie || null,
                JSON.stringify(proposed),
            ]
        );
    } catch (e) {
        console.error('[DATABASE] saveRealtimeAccount error:', e.message);
    }
}

/**
 * Read helper: normalise `proposed_pages` / `verified_pages` JSONB into a
 * uniform `[{id, name}, ...]` regardless of which shape was written.
 * Legacy rows stored bare ID strings; new rows store the richer object
 * form. Returns [] for null/empty.
 */
function _normalisePagesField(raw) {
    if (!Array.isArray(raw) || !raw.length) return [];
    return raw
        .map((p) => {
            if (typeof p === 'string') return { id: p, name: null };
            if (p && typeof p === 'object') {
                const id = String(p.id || p.page_id || p.pageId || '');
                if (!id) return null;
                return { id, name: p.name || p.page_name || null };
            }
            return null;
        })
        .filter(Boolean);
}

/**
 * When Pancake `phx_reply` confirms a `pages:{pageId}` channel join
 * with `status: "ok"`, upsert that pageId into the account's
 * `verified_pages` array. Stable list survives broker restarts so we
 * only retry pages we know actually work.
 */
async function markPageVerified(accountId, pageId) {
    if (!dbPool || !accountId || !pageId) return;
    try {
        await dbPool.query(
            `UPDATE realtime_accounts
             SET verified_pages = (
                CASE
                    WHEN verified_pages @> to_jsonb($2::text)::jsonb
                    THEN verified_pages
                    ELSE verified_pages || to_jsonb($2::text)
                END
             ),
             last_seen_at = NOW()
             WHERE account_id = $1`,
            [String(accountId), String(pageId)]
        );
    } catch (e) {
        console.error('[DATABASE] markPageVerified error:', e.message);
    }
}

async function loadActiveAccounts() {
    if (!dbPool) return [];
    try {
        const r = await dbPool.query(
            `SELECT account_id, name, token, user_id, cookie, proposed_pages, verified_pages
             FROM realtime_accounts
             WHERE is_active = TRUE AND token IS NOT NULL
             ORDER BY last_seen_at DESC`
        );
        return r.rows.map((row) => {
            const proposed = _normalisePagesField(row.proposed_pages);
            const verifiedIds = new Set(_normalisePagesField(row.verified_pages).map((p) => p.id));
            // Names live on `proposed` (what client sent). Re-stamp every
            // verified id with the name it had in proposed so downstream
            // code never has to chase labels separately.
            const nameById = new Map(proposed.map((p) => [p.id, p.name]));
            const pages =
                verifiedIds.size > 0
                    ? [...verifiedIds].map((id) => ({ id, name: nameById.get(id) || null }))
                    : proposed;
            return {
                accountId: row.account_id,
                name: row.name,
                token: row.token,
                userId: row.user_id,
                cookie: row.cookie,
                pages, // [{id, name}, ...]
                pageIds: pages.map((p) => p.id), // back-compat with pool.startAll
            };
        });
    } catch (e) {
        console.error('[DATABASE] loadActiveAccounts error:', e.message);
        return [];
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

app.use(
    cors({
        origin: '*',
        methods: ['GET', 'POST', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization'],
        credentials: false,
        maxAge: 86400, // Cache CORS preflight 24h → cắt ~50% requests (OPTIONS)
    })
);

app.use(express.json());

// Request logging (skip noisy health-check probes — Render pings every ~5s)
app.use((req, res, next) => {
    if (req.path !== '/health' && req.path !== '/ping' && req.path !== '/health/detailed') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    }
    next();
});

// =====================================================
// PANCAKE REALTIME CLIENT
// =====================================================

class RealtimeClient {
    constructor() {
        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 50; // Increased for 24/7 operation

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
        this.cookie = null;
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

    async start(token, userId, pageIds, cookie = null, saveCredentials = true) {
        // Always force reconnect with fresh credentials
        // Old connection may be zombie (heartbeat works but no data)
        if (this.ws) {
            console.log('[PANCAKE-WS] Closing existing connection for fresh start...');
            this.stopHeartbeat();
            clearTimeout(this.reconnectTimer);
            this.ws.close();
            this.ws = null;
            this.isConnected = false;
        }

        this.token = token;
        this.userId = userId;
        this.pageIds = pageIds.map((id) => String(id));
        this.cookie = cookie;
        this.reconnectAttempts = 0;

        // Save credentials for auto-reconnect
        if (saveCredentials) {
            await saveRealtimeCredentials('pancake', {
                token,
                userId,
                pageIds: this.pageIds,
                cookie,
            });
        }

        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[PANCAKE-WS] Connecting to Pancake...');
        const headers = {
            Origin: 'https://pancake.vn',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, { headers });

        this.ws.on('open', () => {
            console.log('[PANCAKE-WS] ✅ Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0;
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[PANCAKE-WS] Closed', code, reason?.toString());
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff with max 5 minutes
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(1.5, this.reconnectAttempts), 300000);
                this.reconnectAttempts++;
                console.log(
                    `[PANCAKE-WS] Reconnecting in ${Math.round(delay / 1000)}s (attempt ${this.reconnectAttempts})...`
                );
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error(
                    '[PANCAKE-WS] ❌ Max reconnect attempts reached. Will try again in 30 minutes.'
                );
                // Reset and try again after 30 minutes
                setTimeout(
                    () => {
                        this.reconnectAttempts = 0;
                        this.connect();
                    },
                    30 * 60 * 1000
                );
            }
        });

        this.ws.on('error', (err) => {
            console.error('[PANCAKE-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const raw = data.toString();
                const msg = JSON.parse(raw);
                this.handleMessage(msg);
            } catch (e) {
                console.error(
                    '[PANCAKE-WS] Parse error:',
                    e,
                    'raw:',
                    data?.toString?.()?.substring(0, 200)
                );
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const ref = this.makeRef();
                this.ws.send(JSON.stringify([null, ref, 'phoenix', 'heartbeat', {}]));
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

        // 1. Join User Channel
        const userRef = this.makeRef();
        const userJoinMsg = [
            userRef,
            userRef,
            `users:${this.userId}`,
            'phx_join',
            { accessToken: this.token, userId: this.userId, platform: 'web' },
        ];
        this.ws.send(JSON.stringify(userJoinMsg));
        console.log(`[PANCAKE-WS] Joining users:${this.userId} channel...`);
        console.log(`[PANCAKE-WS] Token (first 20 chars): ${this.token?.substring(0, 20)}...`);

        // 2. Join Multiple Pages Channel (with retry state)
        this._allPageIds = [...this.pageIds];
        this._retryIndex = 0;
        this._retryExhausted = false;
        this._clientSession = this.generateClientSession();
        this._joinMultiplePages(this.pageIds);

        // 2b. Join the individual `pages:{pageId}` channel for each page.
        //     Verified live in pancake.vn/NhiJudyStore — admin browsers join
        //     ONE `pages:{pageId}` channel per page they have open. The
        //     `multiple_pages:{userId}` channel carries cross-page summary
        //     traffic, but `pages:new_message` and `pages:update_conversation`
        //     are emitted on the per-page channel. Without this we only see
        //     update_conversation (which Pancake also bounces through
        //     multiple_pages) and lose every real new_message event.
        this.pageIds.forEach((pid) => {
            this._joinPageChannel(pid);
        });

        // 3. Get Online Status
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            const statusMsg = [
                null,
                statusRef,
                `multiple_pages:${this.userId}`,
                'get_online_status',
                {},
            ];
            this.ws.send(JSON.stringify(statusMsg));
        }, 2000);
    }

    _joinMultiplePages(pageIds) {
        const pagesRef = this.makeRef();
        const pagesJoinMsg = [
            pagesRef,
            pagesRef,
            `multiple_pages:${this.userId}`,
            'phx_join',
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this._clientSession,
                pageIds: pageIds,
                platform: 'web',
            },
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));
        console.log(
            `[PANCAKE-WS] Joining multiple_pages:${this.userId} with ${pageIds.length} pages: [${pageIds.join(', ')}]`
        );
    }

    /**
     * Join the per-page Phoenix channel `pages:{pageId}` — this is the
     * channel Pancake's own admin browser joins for each page open in
     * the inbox tab. Captured in live WS trace: the join payload is
     * `{ accessToken, userId, platform: "web" }` with the page id
     * embedded in the topic.
     */
    _joinPageChannel(pageId) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
        const ref = this.makeRef();
        const joinMsg = [
            ref,
            ref,
            `pages:${pageId}`,
            'phx_join',
            {
                accessToken: this.token,
                userId: this.userId,
                platform: 'web',
            },
        ];
        this.ws.send(JSON.stringify(joinMsg));
        console.log(`[PANCAKE-WS] Joining pages:${pageId} channel...`);
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        // Debug: log ALL messages from Pancake (để thấy phx_reply, heartbeat, errors)
        if (event === 'phx_reply') {
            const status = payload?.status || 'unknown';
            const resp = payload?.response;
            console.log(
                `[PANCAKE-WS] 📋 phx_reply [${topic}] status=${status}`,
                resp ? JSON.stringify(resp).substring(0, 200) : ''
            );
            // Persist verified page so reboot can skip pages we know fail.
            // Only fires when Pancake server-acks the `pages:{pageId}` join.
            if (status === 'ok' && topic.startsWith('pages:') && this.accountId) {
                const verifiedPageId = topic.slice('pages:'.length);
                markPageVerified(this.accountId, verifiedPageId);
            }
            if (status === 'error') {
                console.error(
                    `[PANCAKE-WS] ❌ Channel join FAILED: ${topic}`,
                    JSON.stringify(resp)
                );

                // Retry multiple_pages by removing one page at a time
                if (
                    topic.startsWith('multiple_pages:') &&
                    this._allPageIds &&
                    !this._retryExhausted
                ) {
                    this._retryIndex = (this._retryIndex || 0) + 1;
                    if (this._retryIndex <= this._allPageIds.length) {
                        const skipIdx = this._retryIndex - 1;
                        const retryPages = this._allPageIds.filter((_, i) => i !== skipIdx);
                        console.warn(
                            `[PANCAKE-WS] 🔄 Retry ${this._retryIndex}/${this._allPageIds.length}: without page ${this._allPageIds[skipIdx]} → [${retryPages.join(', ')}]`
                        );
                        this.pageIds = retryPages;
                        this._joinMultiplePages(retryPages);
                    } else {
                        this._retryExhausted = true;
                        console.error(
                            '[PANCAKE-WS] ❌ All page combinations failed for multiple_pages channel.'
                        );
                    }
                }
            }
        } else if (event === 'phx_error') {
            console.error(
                `[PANCAKE-WS] ❌ phx_error [${topic}]`,
                JSON.stringify(payload).substring(0, 300)
            );
        } else if (event === 'phx_close') {
            console.warn(`[PANCAKE-WS] ⚠️ phx_close [${topic}]`);
        } else if (event !== 'pages:update_conversation' && event !== 'order:tags_updated') {
            // Log mọi event khác để debug
            console.log(
                `[PANCAKE-WS] 📨 Event: ${event} [${topic}]`,
                JSON.stringify(payload).substring(0, 300)
            );
        }

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            console.log(
                '[PANCAKE-WS] 📩 New Message:',
                conversation?.id,
                '- Type:',
                conversation?.type
            );

            // 1. Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload,
            });

            // 2. Save to database for persistence
            if (conversation) {
                const customerPsid =
                    conversation.from_psid ||
                    conversation.customers?.[0]?.fb_id ||
                    conversation.from?.id;

                if (customerPsid && conversation.type !== 'COMMENT') {
                    upsertPendingCustomer({
                        psid: customerPsid,
                        pageId: conversation.page_id,
                        customerName: conversation.from?.name || conversation.customers?.[0]?.name,
                        snippet: conversation.snippet || conversation.last_message?.message,
                        type: conversation.type || 'INBOX',
                    });
                }

                // 3. Livestream detection for COMMENT conversations
                const postType = conversation.post?.type;
                const isLivestream =
                    postType === 'livestream' ||
                    conversation.post?.live_video_status === 'vod' ||
                    conversation.post?.live_video_status === 'live';

                if (conversation.type === 'COMMENT' && isLivestream && customerPsid) {
                    // Save to livestream_conversations table (single source of truth)
                    const postName = conversation.post?.message || null;
                    saveLivestreamConversation(conversation.id, conversation.post_id, {
                        postName,
                        name: conversation.from?.name || conversation.customers?.[0]?.name,
                        type: conversation.type,
                        pageId: conversation.page_id,
                        psid: customerPsid,
                        customerId: conversation.customers?.[0]?.id,
                    });

                    // WS payload often lacks post.message — fetch from API and update DB
                    if (!postName) {
                        fetchAndSavePostName(
                            conversation.id,
                            conversation.page_id,
                            conversation.post_id
                        );
                    }
                }

                if (conversation.type === 'COMMENT' && conversation.post_id) {
                    if (postType) {
                        // Cache known post type in memory
                        postTypeCache.set(conversation.post_id, {
                            postType,
                            liveVideoStatus: conversation.post?.live_video_status || null,
                            postMessage: conversation.post?.message || null,
                        });
                    } else {
                        // No post data in payload — fallback to cache + Pancake API
                        lookupPostType(conversation.id, conversation.page_id, conversation.post_id)
                            .then((result) => {
                                if (result) {
                                    broadcastToClients({
                                        type: 'post_type_detected',
                                        conversationId: conversation.id,
                                        postId: conversation.post_id,
                                        postType: result.postType,
                                        liveVideoStatus: result.liveVideoStatus,
                                    });
                                    if (result.postType === 'livestream' && customerPsid) {
                                        saveLivestreamConversation(
                                            conversation.id,
                                            conversation.post_id,
                                            {
                                                postName: result.postMessage || null,
                                                name:
                                                    conversation.from?.name ||
                                                    conversation.customers?.[0]?.name,
                                                type: conversation.type,
                                                pageId: conversation.page_id,
                                                psid: customerPsid,
                                                customerId: conversation.customers?.[0]?.id,
                                            }
                                        );
                                    }
                                }
                            })
                            .catch((err) =>
                                console.error('[LIVESTREAM] Detection error:', err.message)
                            );
                    }
                }
            }
        } else if (event === 'order:tags_updated') {
            console.log('[PANCAKE-WS] 🏷️ Tags Updated:', payload);
            broadcastToClients({
                type: 'order:tags_updated',
                payload: payload,
            });
        }

        // [INBOX] Forward new_message events for real-time chat update
        if (event === 'pages:new_message') {
            console.log('[PANCAKE-WS] 💬 New Message event → forwarding to clients');
            broadcastToClients({
                type: 'pages:new_message',
                payload: payload,
            });
        }
    }

    async stop(disableAutoConnect = true) {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.token = null;

        if (disableAutoConnect) {
            await disableRealtimeCredentials('pancake');
        }

        console.log('[PANCAKE-WS] Stopped');
    }

    getStatus() {
        // `pageLabels` (set by RealtimeClientPool.startAll) carries the
        // {id, name} pairs so status output can show "Nhi Judy House"
        // instead of bare numeric page ids.
        const labels = this.pageLabels || {};
        const pages = (this.pageIds || []).map((id) => ({
            id: String(id),
            name: labels[String(id)] || null,
        }));
        return {
            connected: this.isConnected,
            wsReadyState: this.ws?.readyState ?? 'no_ws', // 0=CONNECTING, 1=OPEN, 2=CLOSING, 3=CLOSED
            hasToken: !!this.token,
            tokenFirst20: this.token?.substring(0, 20) || null,
            userId: this.userId,
            pageIds: this.pageIds || [],
            pages, // [{id, name}, ...] — preferred for UI display
            pageCount: this.pageIds?.length || 0,
            hasCookie: !!this.cookie,
            cookieLength: this.cookie?.length || 0,
            reconnectAttempts: this.reconnectAttempts,
            heartbeatActive: !!this.heartbeatInterval,
            refCounter: this.refCounter,
        };
    }
}

// =====================================================
// POOL — multi-account realtime
// =====================================================
//
// Pancake has multi-user accounts (Thu Huyền, Huyền Nhi, Thu Lai, Chloe
// Duongg, Con Nhoc...) — each JWT has access to a different subset of
// FB pages. A single shared RealtimeClient only covers ONE user's
// pages → events for pages owned by other accounts are missed.
//
// The pool spawns ONE RealtimeClient per account. Pages are deduped:
// each FB page is owned by the FIRST account that has access (skip
// duplicates → no event echo from multiple WS connections joining the
// same `pages:{pageId}` channel).
//
// All clients forward events through the same `broadcastToClients` so
// browser subscribers don't have to know how many backend WS exist.

class RealtimeClientPool {
    constructor() {
        // accountId → RealtimeClient
        this.clients = new Map();
    }

    /**
     * Replace the entire pool with N new clients, one per account.
     * Each account joins ALL its pages — Pancake's `multiple_pages`
     * channel rejects pages the account doesn't have permission for,
     * so a single account can't reliably cover even its own list
     * (one bad page triggers retry-remove). With multiple accounts
     * each holding the same page, the pool maximises coverage:
     * whoever can join wins. Broker dedupes broadcast events by
     * conversation+message id so subscribers don't see echoes.
     *
     * @param {Array<{accountId,token,userId,pageIds,cookie,name?}>} accounts
     */
    async startAll(accounts) {
        if (!Array.isArray(accounts) || accounts.length === 0) {
            return { ok: false, reason: 'no_accounts' };
        }
        // Stop clients that aren't in the new set
        const newIds = new Set(accounts.map((a) => String(a.accountId)));
        for (const [oldId, client] of this.clients) {
            if (!newIds.has(oldId)) {
                console.log(`[POOL] Dropping account ${oldId.slice(0, 8)} (no longer in pool)`);
                try {
                    await client.stop(false);
                } catch {
                    /* ignore */
                }
                this.clients.delete(oldId);
            }
        }
        // No page dedup — each account opens its own Pancake WS and
        // joins all its pages. Broker-level event dedup handles echoes.
        const plan = accounts.filter(
            (acc) =>
                acc &&
                acc.token &&
                acc.userId &&
                Array.isArray(acc.pageIds) &&
                acc.pageIds.length > 0
        );
        const allPages = new Set();
        for (const acc of plan) for (const pid of acc.pageIds) allPages.add(String(pid));
        // Start clients
        for (const acc of plan) {
            const accId = String(acc.accountId);
            let client = this.clients.get(accId);
            if (!client) {
                client = new RealtimeClient();
                client.accountId = accId;
                client.accountName = acc.name || null;
                this.clients.set(accId, client);
            } else {
                client.accountName = acc.name || client.accountName;
            }
            // Stash {id → name} so status/log output shows page names
            // alongside ids. Source of truth: `acc.pages` (richer form
            // pushed by browser) — fall back to whatever names we got
            // from DB on auto-reconnect.
            const labels = {};
            if (Array.isArray(acc.pages)) {
                for (const p of acc.pages) {
                    const id = String((p && (p.id || p.page_id || p.pageId)) || '');
                    if (id) labels[id] = (p && (p.name || p.page_name)) || null;
                }
            }
            client.pageLabels = { ...(client.pageLabels || {}), ...labels };
            const labelStr = acc.pageIds.map((id) => labels[String(id)] || id).join(', ');
            console.log(
                `[POOL] ▶ ${acc.name || accId.slice(0, 8)} → ${acc.pageIds.length} pages: [${labelStr}]`
            );
            await client.start(acc.token, acc.userId, acc.pageIds, acc.cookie, false);
            // Persist creds + proposed pages so a broker restart can
            // rebuild the pool without waiting for a browser to push.
            // verified_pages is filled in as phx_reply OKs land.
            saveRealtimeAccount(acc);
        }
        return {
            ok: true,
            poolSize: this.clients.size,
            totalPages: allPages.size,
            plan: plan.map((p) => ({
                accountId: p.accountId,
                name: p.name,
                pageCount: p.pageIds.length,
            })),
        };
    }

    async stopAll() {
        for (const client of this.clients.values()) {
            try {
                await client.stop(false);
            } catch {
                /* ignore */
            }
        }
        this.clients.clear();
    }

    getStatus() {
        const clients = [];
        let totalPages = 0;
        let connectedCount = 0;
        for (const [accId, c] of this.clients) {
            const s = c.getStatus();
            clients.push({
                accountId: accId,
                name: c.accountName || null,
                connected: s.connected,
                wsReadyState: s.wsReadyState,
                userId: s.userId,
                pageIds: s.pageIds,
                pages: s.pages, // [{id, name}, ...] — RealtimeClient.getStatus stamps names
                pageCount: s.pageCount,
                reconnectAttempts: s.reconnectAttempts,
            });
            totalPages += s.pageCount;
            if (s.connected) connectedCount += 1;
        }
        return {
            poolSize: this.clients.size,
            connectedCount,
            totalPages,
            clients,
        };
    }
}

// =====================================================
// GLOBAL INSTANCES
// =====================================================

const realtimeClient = new RealtimeClient(); // legacy single-account (back-compat)
const realtimePool = new RealtimeClientPool(); // multi-account (preferred)

// =====================================================
// LIVESTREAM DETECTION (server-side, per post_id)
// =====================================================

const postTypeCache = new Map(); // post_id → { postType, liveVideoStatus } (in-memory only)
const pageAccessTokenCache = new Map(); // page_id → { token, cachedAt }
const postTypeLookupInFlight = new Set(); // dedupe concurrent lookups for same post_id
const PAGE_TOKEN_TTL = 3600000; // 1 hour
const PAGE_TOKEN_NEG_TTL = 600000; // 10 min — negative cache: stop retry/log spam on invalid JWT

/**
 * Save a conversation to livestream_conversations table (single source of truth)
 */
async function saveLivestreamConversation(convId, postId, data) {
    if (!dbPool || !convId || !postId) return;
    try {
        await dbPool.query(
            `
            INSERT INTO livestream_conversations (conv_id, post_id, post_name, name, type, page_id, psid, customer_id, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, CURRENT_TIMESTAMP)
            ON CONFLICT (conv_id) DO UPDATE SET
                post_id = EXCLUDED.post_id,
                post_name = COALESCE(EXCLUDED.post_name, livestream_conversations.post_name),
                name = COALESCE(EXCLUDED.name, livestream_conversations.name),
                type = COALESCE(EXCLUDED.type, livestream_conversations.type),
                page_id = COALESCE(EXCLUDED.page_id, livestream_conversations.page_id),
                psid = COALESCE(EXCLUDED.psid, livestream_conversations.psid),
                customer_id = COALESCE(EXCLUDED.customer_id, livestream_conversations.customer_id),
                updated_at = CURRENT_TIMESTAMP
        `,
            [
                convId,
                postId,
                data.postName || null,
                data.name || null,
                data.type || null,
                data.pageId || null,
                data.psid || null,
                data.customerId || null,
            ]
        );
        console.log(`[LIVESTREAM] ✅ Saved livestream conversation: ${convId} → post ${postId}`);
    } catch (error) {
        console.error('[LIVESTREAM] Error saving livestream conversation:', error.message);
    }
}

/**
 * Fetch post name from Pancake messages API and update DB
 * Used when WS payload lacks post.message
 */
async function fetchAndSavePostName(conversationId, pageId, postId) {
    try {
        // Check if we already have the name in cache
        const cached = postTypeCache.get(postId);
        if (cached?.postMessage) {
            await dbPool.query(
                `UPDATE livestream_conversations SET post_name = $1 WHERE post_id = $2 AND post_name IS NULL`,
                [cached.postMessage, postId]
            );
            return;
        }

        const pageAccessToken = await getOrFetchPageAccessToken(pageId);
        if (!pageAccessToken) return;

        const url = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?page_access_token=${pageAccessToken}&limit=1`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return;

        const data = await response.json();
        const post = data.post || data.conversation?.post;
        // Livestream posts have message=null, fallback to story or date+admin
        const postName =
            post?.message ||
            post?.story ||
            (post?.inserted_at
                ? `Live ${new Date(post.inserted_at).toLocaleDateString('vi-VN')}${post.admin_creator?.name ? ' - ' + post.admin_creator.name : ''}`
                : null);

        if (postName && dbPool) {
            await dbPool.query(
                `UPDATE livestream_conversations SET post_name = $1 WHERE post_id = $2 AND post_name IS NULL`,
                [postName, postId]
            );
            if (cached) cached.postMessage = postName;
            console.log(
                `[LIVESTREAM] ✅ Fetched & saved post name for ${postId}: "${postName.substring(0, 50)}"`
            );
        }
    } catch (error) {
        console.error(`[LIVESTREAM] Error fetching post name for ${postId}:`, error.message);
    }
}

/**
 * Resolve a Pancake JWT for a page. In multi-account POOL mode the live token
 * lives on the pool client that owns the page; the legacy single-account
 * `realtimeClient.token` is usually stale/expired — that mismatch was the root
 * cause of the repeated "Invalid access_token" log spam. Prefer the owning pool
 * client, then any connected pool client, then the legacy client.
 */
function getJwtForPage(pageId) {
    const pid = String(pageId);
    for (const client of realtimePool.clients.values()) {
        if (client.token && (client.pageIds || []).map(String).includes(pid)) {
            return client.token;
        }
    }
    for (const client of realtimePool.clients.values()) {
        if (client.token) return client.token;
    }
    return realtimeClient.token || null;
}

/**
 * Get or fetch page_access_token for a page (positive cache 1h, negative cache
 * 10min so an invalid JWT doesn't re-spam Pancake + logs on every comment).
 */
async function getOrFetchPageAccessToken(pageId) {
    const cached = pageAccessTokenCache.get(pageId);
    if (cached) {
        if (cached.token && Date.now() - cached.cachedAt < PAGE_TOKEN_TTL) {
            return cached.token;
        }
        // Negative cache hit → fail silently (no log spam) until TTL expires
        if (cached.failed && Date.now() - cached.cachedAt < PAGE_TOKEN_NEG_TTL) {
            return null;
        }
    }

    const jwt = getJwtForPage(pageId);
    if (!jwt) {
        pageAccessTokenCache.set(pageId, { token: null, failed: true, cachedAt: Date.now() });
        console.warn('[LIVESTREAM] No JWT token available for page_access_token generation');
        return null;
    }

    try {
        const url = `https://pancake.vn/api/v1/pages/${pageId}/generate_page_access_token?access_token=${jwt}`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
                Accept: 'application/json',
                'Content-Type': 'application/json',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) {
            pageAccessTokenCache.set(pageId, { token: null, failed: true, cachedAt: Date.now() });
            console.error(
                `[LIVESTREAM] Failed to get page_access_token for ${pageId}: HTTP ${response.status}`
            );
            return null;
        }

        const data = await response.json();
        if (data.success && data.page_access_token) {
            pageAccessTokenCache.set(pageId, {
                token: data.page_access_token,
                cachedAt: Date.now(),
            });
            console.log(`[LIVESTREAM] ✅ Cached page_access_token for page ${pageId}`);
            return data.page_access_token;
        }

        pageAccessTokenCache.set(pageId, { token: null, failed: true, cachedAt: Date.now() });
        console.warn(
            `[LIVESTREAM] No page_access_token in response for ${pageId}:`,
            data.message || ''
        );
        return null;
    } catch (error) {
        pageAccessTokenCache.set(pageId, { token: null, failed: true, cachedAt: Date.now() });
        console.error(
            `[LIVESTREAM] Error fetching page_access_token for ${pageId}:`,
            error.message
        );
        return null;
    }
}

/**
 * Lookup post type for a COMMENT conversation
 * 2-step: in-memory cache → Pancake API (once per post_id)
 */
async function lookupPostType(conversationId, pageId, postId) {
    if (!postId || !pageId) return null;

    // 1. Check in-memory cache
    const cached = postTypeCache.get(postId);
    if (cached) return cached;

    // 2. Dedupe: skip if another lookup for same post_id is in-flight
    if (postTypeLookupInFlight.has(postId)) return null;
    postTypeLookupInFlight.add(postId);

    try {
        const pageAccessToken = await getOrFetchPageAccessToken(pageId);
        if (!pageAccessToken) return null;

        const url = `https://pages.fm/api/public_api/v1/pages/${pageId}/conversations/${conversationId}/messages?page_access_token=${pageAccessToken}&limit=1`;
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            },
            signal: controller.signal,
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        const post = data.post || data.conversation?.post;

        if (post && post.type) {
            const postMessage =
                post.message ||
                post.story ||
                (post.inserted_at
                    ? `Live ${new Date(post.inserted_at).toLocaleDateString('vi-VN')}${post.admin_creator?.name ? ' - ' + post.admin_creator.name : ''}`
                    : null);
            const entry = {
                postType: post.type,
                liveVideoStatus: post.live_video_status || null,
                postMessage,
            };
            postTypeCache.set(postId, entry);
            console.log(
                `[LIVESTREAM] ✅ API detected post ${postId}: ${entry.postType} (${entry.liveVideoStatus || 'n/a'})`
            );
            return entry;
        }

        return null;
    } catch (error) {
        console.error(`[LIVESTREAM] Error looking up post_type for ${postId}:`, error.message);
        return null;
    } finally {
        postTypeLookupInFlight.delete(postId);
    }
}

// =====================================================
// AUTO-CONNECT ON SERVER START
// =====================================================

async function autoConnectClients() {
    console.log('[AUTO-CONNECT] Checking for saved credentials...');

    // Preferred: multi-account pool from realtime_accounts. Every account
    // we saved via /api/realtime/start-multi gets respawned with its
    // verified page list so the pool comes back exactly as the user left it.
    const accounts = await loadActiveAccounts();
    if (accounts.length) {
        console.log(`[AUTO-CONNECT] Found ${accounts.length} account(s) → starting pool`);
        const result = await realtimePool.startAll(accounts);
        console.log(
            `[AUTO-CONNECT] Pool started: ${result.poolSize} accounts, ${result.totalPages} unique pages`
        );
        return;
    }

    // Fallback: legacy single-account credentials (back-compat for installs
    // that haven't migrated to /api/realtime/start-multi yet).
    const pancakeCredentials = await loadRealtimeCredentials('pancake');
    if (pancakeCredentials && pancakeCredentials.token) {
        console.log('[AUTO-CONNECT] Legacy single-account credentials found');
        const pageIds = pancakeCredentials.page_ids ? JSON.parse(pancakeCredentials.page_ids) : [];
        await realtimeClient.start(
            pancakeCredentials.token,
            pancakeCredentials.user_id,
            pageIds,
            pancakeCredentials.cookie,
            false
        );
    } else {
        console.log('[AUTO-CONNECT] No credentials found — pool empty');
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        message: 'N2Store Realtime Server is running',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        database: dbPool ? 'connected' : 'not configured',
        clients: {
            pancake: realtimeClient.getStatus(),
        },
    });
});

// Detailed health — pool stats, memory, Pancake WS state
app.get('/health/detailed', (req, res) => {
    const mem = process.memoryUsage();
    res.json({
        service: 'n2store-realtime',
        status: 'ok',
        uptime_sec: Math.round(process.uptime()),
        memory_mb: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        db: dbPool
            ? {
                  pool: {
                      total: dbPool.totalCount,
                      idle: dbPool.idleCount,
                      waiting: dbPool.waitingCount,
                  },
              }
            : null,
        pancake_ws: realtimeClient.getStatus(),
        pancake_pool: realtimePool.getStatus(),
        node_version: process.version,
        pid: process.pid,
        timestamp: new Date().toISOString(),
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store Realtime Server',
        version: '2.1.0',
        description: 'WebSocket proxy for Pancake.vn with database persistence',
        database: dbPool ? 'connected' : 'not configured',
        endpoints: {
            pancake: [
                'POST /api/realtime/start - Start Pancake WebSocket',
                'POST /api/realtime/stop - Stop Pancake WebSocket',
                'GET /api/realtime/status - Get Pancake status',
            ],
            pendingCustomers: [
                'GET /api/realtime/pending-customers - Get pending customers',
                'POST /api/realtime/mark-replied - Mark customer as replied',
            ],
            health: ['GET /health - Server health check'],
        },
    });
});

// ===== PANCAKE REALTIME =====

app.post('/api/realtime/start', async (req, res) => {
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res
            .status(400)
            .json({ error: 'Missing parameters: token, userId, pageIds required' });
    }

    await realtimeClient.start(token, userId, pageIds, cookie);
    res.json({
        success: true,
        message: 'Pancake Realtime client started (credentials saved for auto-reconnect)',
    });
});

/**
 * Multi-account realtime: browser POSTs the full list of Pancake
 * accounts it has tokens for. The pool spawns one WS per account and
 * dedupes pages so every FB page is covered without duplicates.
 *
 * Body shape:
 *   { accounts: [
 *       { accountId, token, userId, pageIds: [...], cookie?, name? },
 *       ...
 *     ] }
 *
 * Browser caller: Web2Realtime.startMulti() — collects accounts from
 * Web2Chat.getAllAccounts() and posts them here.
 */
app.post('/api/realtime/start-multi', async (req, res) => {
    const { accounts } = req.body || {};
    if (!Array.isArray(accounts) || accounts.length === 0) {
        return res.status(400).json({ error: 'Missing parameters: accounts[] required' });
    }
    const result = await realtimePool.startAll(accounts);
    if (!result.ok) return res.status(400).json(result);
    res.json({
        success: true,
        ...result,
        message: `Pool started with ${result.poolSize} account(s), covering ${result.totalPages} page(s)`,
    });
});

app.get('/api/realtime/pool-status', (req, res) => {
    res.json(realtimePool.getStatus());
});

app.post('/api/realtime/stop', async (req, res) => {
    await realtimeClient.stop();
    res.json({ success: true, message: 'Pancake Realtime client stopped' });
});

app.get('/api/realtime/status', (req, res) => {
    res.json(realtimeClient.getStatus());
});

// Debug: force reconnect to test
app.post('/api/realtime/reconnect', async (req, res) => {
    console.log('[PANCAKE-WS] 🔄 Force reconnect requested');
    if (realtimeClient.ws) {
        realtimeClient.ws.close();
        realtimeClient.ws = null;
    }
    realtimeClient.isConnected = false;
    realtimeClient.reconnectAttempts = 0;
    realtimeClient.connect();
    res.json({ success: true, message: 'Force reconnect initiated' });
});

// ===== PENDING CUSTOMERS API =====

app.get('/api/realtime/pending-customers', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured',
        });
    }

    try {
        const limit = Math.min(parseInt(req.query.limit) || 500, 1500);

        const result = await dbPool.query(
            `
            SELECT
                psid,
                page_id,
                customer_name,
                last_message_snippet,
                last_message_time,
                message_count,
                type
            FROM pending_customers
            ORDER BY last_message_time DESC
            LIMIT $1
        `,
            [limit]
        );

        res.json({
            success: true,
            count: result.rows.length,
            customers: result.rows,
        });
    } catch (error) {
        console.error('[API] Error fetching pending customers:', error);
        res.status(500).json({ error: 'Failed to fetch pending customers' });
    }
});

app.post('/api/realtime/mark-replied', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({
            error: 'Database not available',
            message: 'DATABASE_URL not configured',
        });
    }

    try {
        const { psid, pageId } = req.body;

        if (!psid) {
            return res.status(400).json({ error: 'Missing psid parameter' });
        }

        let query, params;
        if (pageId) {
            query = 'DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2 RETURNING *';
            params = [psid, pageId];
        } else {
            query = 'DELETE FROM pending_customers WHERE psid = $1 RETURNING *';
            params = [psid];
        }

        const result = await dbPool.query(query, params);

        console.log(`[API] ✅ Marked replied: ${psid} (${result.rowCount} removed)`);

        res.json({
            success: true,
            removed: result.rowCount,
        });
    } catch (error) {
        console.error('[API] Error marking replied:', error);
        res.status(500).json({ error: 'Failed to mark as replied' });
    }
});

// Clear all pending customers (for debugging)
app.post('/api/realtime/clear-pending', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }

    const { confirm } = req.body;
    if (confirm !== 'yes') {
        return res.status(400).json({ error: 'Must confirm with { "confirm": "yes" }' });
    }

    try {
        const result = await dbPool.query('DELETE FROM pending_customers RETURNING *');
        console.log(`[API] ⚠️ Cleared ${result.rowCount} pending customers`);
        res.json({ success: true, cleared: result.rowCount });
    } catch (error) {
        console.error('[API] Error clearing pending:', error);
        res.status(500).json({ error: 'Failed to clear pending customers' });
    }
});

// =====================================================
// LIVESTREAM CONVERSATIONS ROUTES (single source of truth)
// =====================================================

// GET /api/realtime/livestream-conversations - All conversations grouped by post_id
app.get('/api/realtime/livestream-conversations', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const result = await dbPool.query(
            'SELECT * FROM livestream_conversations ORDER BY updated_at DESC'
        );

        // Group by post_id + collect post names
        const posts = {};
        const postNames = {};
        for (const row of result.rows) {
            if (!posts[row.post_id]) posts[row.post_id] = [];
            posts[row.post_id].push({
                conv_id: row.conv_id,
                name: row.name,
                type: row.type,
                page_id: row.page_id,
                psid: row.psid,
                customer_id: row.customer_id,
                label: row.label,
                updated_at: row.updated_at,
            });
            // First non-null post_name wins per post_id
            if (row.post_name && !postNames[row.post_id]) {
                postNames[row.post_id] = row.post_name;
            }
        }

        res.json({
            success: true,
            posts,
            postNames,
            totalConversations: result.rows.length,
        });
    } catch (error) {
        console.error('[API] Error getting livestream conversations:', error);
        res.status(500).json({ error: 'Failed to get livestream conversations' });
    }
});

// PUT /api/realtime/livestream-conversation - Upsert one conversation
app.put('/api/realtime/livestream-conversation', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const { convId, postId, postName, name, type, pageId, psid, customerId, label } = req.body;
        if (!convId || !postId) {
            return res.status(400).json({ error: 'convId and postId required' });
        }

        await saveLivestreamConversation(convId, postId, {
            postName,
            name,
            type,
            pageId,
            psid,
            customerId,
        });

        // Update label if provided
        if (label) {
            await dbPool.query(
                'UPDATE livestream_conversations SET label = $2 WHERE conv_id = $1',
                [convId, label]
            );
        }

        res.json({ success: true });
    } catch (error) {
        console.error('[API] Error saving livestream conversation:', error);
        res.status(500).json({ error: 'Failed to save livestream conversation' });
    }
});

// DELETE /api/realtime/livestream-conversations - Delete by post_id, conv_id, or all
app.delete('/api/realtime/livestream-conversations', async (req, res) => {
    if (!dbPool) {
        return res.status(503).json({ error: 'Database not available' });
    }
    try {
        const postId = req.query.post_id;
        const convId = req.query.conv_id;
        let result;
        if (convId) {
            result = await dbPool.query('DELETE FROM livestream_conversations WHERE conv_id = $1', [
                convId,
            ]);
        } else if (postId) {
            result = await dbPool.query('DELETE FROM livestream_conversations WHERE post_id = $1', [
                postId,
            ]);
        } else {
            result = await dbPool.query('DELETE FROM livestream_conversations');
        }

        res.json({ success: true, deleted: result.rowCount });
    } catch (error) {
        console.error('[API] Error deleting livestream conversations:', error);
        res.status(500).json({ error: 'Failed to delete livestream conversations' });
    }
});

// GET /api/realtime/conversation-labels - Get all labels from dedicated table
app.get('/api/realtime/conversation-labels', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const result = await dbPool.query(`
            SELECT conv_id, labels FROM conversation_labels
            WHERE labels != '["new"]' AND labels != 'new'
            ORDER BY updated_at DESC LIMIT 5000
        `);
        const labelMap = {};
        for (const row of result.rows) {
            labelMap[row.conv_id] = row.labels;
        }
        res.json({ success: true, labelMap, total: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/conversation-label - Upsert label for any conversation
app.put('/api/realtime/conversation-label', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { convId, labels } = req.body;
        // Support both old format {convId, label} and new format {convId, labels}
        const labelsStr = labels || req.body.label;
        if (!convId || !labelsStr)
            return res.status(400).json({ error: 'convId and labels required' });
        const result = await dbPool.query(
            `
            INSERT INTO conversation_labels (conv_id, labels, updated_at)
            VALUES ($1, $2, NOW())
            ON CONFLICT (conv_id) DO UPDATE SET labels = $2, updated_at = NOW()
        `,
            [convId, labelsStr]
        );
        res.json({ success: true, upserted: result.rowCount });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/conversation-labels/bulk - Bulk upsert labels (for initial sync from localStorage)
app.put('/api/realtime/conversation-labels/bulk', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { labelMap } = req.body;
        if (!labelMap || typeof labelMap !== 'object')
            return res.status(400).json({ error: 'labelMap required' });
        let upserted = 0;
        for (const [convId, labels] of Object.entries(labelMap)) {
            const labelsStr = typeof labels === 'string' ? labels : JSON.stringify(labels);
            if (labelsStr === '["new"]' || labelsStr === 'new') continue;
            await dbPool.query(
                `
                INSERT INTO conversation_labels (conv_id, labels, updated_at)
                VALUES ($1, $2, NOW())
                ON CONFLICT (conv_id) DO UPDATE SET labels = $2, updated_at = NOW()
            `,
                [convId, labelsStr]
            );
            upserted++;
        }
        res.json({ success: true, upserted });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// GET /api/realtime/inbox-groups - Get all group definitions
app.get('/api/realtime/inbox-groups', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const result = await dbPool.query(
            'SELECT id, name, color, note, sort_order FROM inbox_groups ORDER BY sort_order ASC'
        );
        res.json({ success: true, groups: result.rows });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// PUT /api/realtime/inbox-groups - Bulk save group definitions (upsert + delete missing)
app.put('/api/realtime/inbox-groups', async (req, res) => {
    if (!dbPool) return res.status(503).json({ error: 'Database not available' });
    try {
        const { groups } = req.body;
        if (!Array.isArray(groups)) return res.status(400).json({ error: 'groups array required' });

        const client = await dbPool.connect();
        try {
            await client.query('BEGIN');

            // Get current group IDs
            const incomingIds = groups.map((g) => g.id).filter(Boolean);

            // Delete groups not in the new list
            if (incomingIds.length > 0) {
                await client.query(
                    `DELETE FROM inbox_groups WHERE id NOT IN (${incomingIds.map((_, i) => `$${i + 1}`).join(',')})`,
                    incomingIds
                );
            } else {
                await client.query('DELETE FROM inbox_groups');
            }

            // Upsert each group
            for (let i = 0; i < groups.length; i++) {
                const g = groups[i];
                if (!g.id || !g.name) continue;
                await client.query(
                    `
                    INSERT INTO inbox_groups (id, name, color, note, sort_order, updated_at)
                    VALUES ($1, $2, $3, $4, $5, NOW())
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        color = EXCLUDED.color,
                        note = EXCLUDED.note,
                        sort_order = EXCLUDED.sort_order,
                        updated_at = NOW()
                `,
                    [g.id, g.name, g.color || '#3b82f6', g.note || '', g.sort_order ?? i]
                );
            }

            await client.query('COMMIT');
            console.log(`[API] Saved ${groups.length} inbox groups`);
            res.json({ success: true, count: groups.length });
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    } catch (error) {
        console.error('[API] Error saving inbox groups:', error);
        res.status(500).json({ error: error.message });
    }
});

// (2026-04-18) Endpoint /api/tpos/empty-cart-sync đã bỏ — auto-tag GIỎ TRỐNG
// không còn dùng. Client phía orders-report giờ ở chế độ cleanup-only, gọi
// TPOS AssignTag trực tiếp để gỡ tag nếu phát hiện đơn còn tag GIỎ TRỐNG.

// =====================================================
// WEBSOCKET SERVER FOR FRONTEND CLIENTS
// =====================================================

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Broadcast to all connected frontend clients
// Dedup window: when multiple pool clients are joined to the same
// Pancake page (different accounts), Pancake emits the same event to
// each — we'd otherwise broadcast it N times to every browser. Track
// recent event keys for ~30s and skip echoes.
const _broadcastSeen = new Map(); // key → timestamp
const _BROADCAST_DEDUP_MS = 30_000;
function _broadcastDedupKey(data) {
    const t = data?.type;
    const p = data?.payload;
    if (!t || !p) return null;
    if (t === 'pages:new_message') {
        const m = p.message || {};
        if (m.id) return `nm:${m.id}`;
    }
    if (t === 'pages:update_conversation') {
        const conv = p.conversation || {};
        const lmId = conv.last_message?.id;
        if (conv.id && lmId) return `uc:${conv.id}:${lmId}`;
        if (conv.id) return `uc:${conv.id}:${conv.updated_at || conv.last_sent_at || ''}`;
    }
    return null;
}
const broadcastToClients = (data) => {
    const dedupKey = _broadcastDedupKey(data);
    if (dedupKey) {
        const now = Date.now();
        const lastSeen = _broadcastSeen.get(dedupKey);
        if (lastSeen && now - lastSeen < _BROADCAST_DEDUP_MS) return; // echo, skip
        _broadcastSeen.set(dedupKey, now);
        // GC old entries (lazy, every ~100 inserts)
        if (_broadcastSeen.size > 500) {
            for (const [k, t] of _broadcastSeen) {
                if (now - t > _BROADCAST_DEDUP_MS) _broadcastSeen.delete(k);
            }
        }
    }
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
};

// Keep-alive ping for frontend clients
const interval = setInterval(() => {
    wss.clients.forEach((ws) => {
        if (ws.isAlive === false) {
            return ws.terminate();
        }
        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', (ws) => {
    console.log('[WSS] Frontend client connected. Total:', wss.clients.size);
    ws.isAlive = true;

    ws.on('pong', () => {
        ws.isAlive = true;
    });

    ws.on('close', () => {
        console.log('[WSS] Frontend client disconnected. Total:', wss.clients.size);
    });
});

wss.on('close', () => {
    clearInterval(interval);
});

// =====================================================
// 404 & ERROR HANDLERS
// =====================================================

app.use((req, res) => {
    res.status(404).json({ error: 'Not Found', path: req.url });
});

app.use((err, req, res, next) => {
    console.error('[ERROR]', err);
    res.status(500).json({ error: 'Internal Server Error', message: err.message });
});

// =====================================================
// START SERVER
// =====================================================

async function startServer() {
    // Initialize database first
    await initDatabase();

    // Start HTTP server
    server.listen(PORT, () => {
        console.log('='.repeat(60));
        console.log('🚀 N2Store Realtime Server v2.1');
        console.log('='.repeat(60));
        console.log(`📍 Port: ${PORT}`);
        console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
        console.log(`💾 Database: ${dbPool ? 'Connected' : 'Not configured'}`);
        console.log(`⏰ Started: ${new Date().toISOString()}`);
        console.log('='.repeat(60));

        // Auto-connect after 3 seconds (give DB time to init)
        setTimeout(() => {
            autoConnectClients();
        }, 3000);

        // Cleanup expired pending_customers on start and every hour
        setTimeout(() => {
            cleanupExpiredPendingCustomers();
        }, 5000);

        // Run cleanup every hour (3600000ms)
        setInterval(() => {
            cleanupExpiredPendingCustomers();
        }, 3600000);
    });
}

startServer();

// Graceful shutdown — Render sends SIGTERM then waits 30s before SIGKILL.
let _shuttingDown = false;
async function gracefulShutdown(signal) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[SHUTDOWN] Received ${signal}, closing...`);
    try {
        if (typeof server !== 'undefined') {
            await new Promise((resolve) => server.close(resolve));
            console.log('[SHUTDOWN] HTTP server closed');
        }
    } catch (e) {
        console.warn('[SHUTDOWN] HTTP close error:', e.message);
    }
    try {
        if (dbPool && typeof dbPool.end === 'function') {
            await Promise.race([dbPool.end(), new Promise((r) => setTimeout(r, 5000))]);
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
