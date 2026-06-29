// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// N2STORE API FALLBACK SERVER
// Deployed on Render.com as fallback when Cloudflare fails
// =====================================================

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// ── Memory guard (web2-api = Render starter 512Mi; OOM-killed nhiều lần 15/06) ──
// V8 heap cap đặt qua NODE_OPTIONS=--max-old-space-size trên Render (không set
// được lúc runtime). Ở đây bound NATIVE memory của libvips/sharp (default cache
// có thể giữ hàng trăm MB NGOÀI heap → cộng dồn gây OOM) + log RSS để phân biệt
// leak (tăng dần) vs spike (nhảy theo job ảnh).
try {
    const _sharp = require('sharp');
    _sharp.cache(false); // KHÔNG cache ảnh trong libvips (giảm RSS ngoài heap)
    _sharp.concurrency(1); // 1 luồng libvips — tránh N×CPU buffer đồng thời
} catch {
    /* sharp optional — bỏ qua nếu chưa cài */
}
{
    const _mb = (b) => Math.round(b / 1048576);
    setInterval(() => {
        const m = process.memoryUsage();
        if (_mb(m.rss) > 380) {
            console.warn(
                `[MEM] rss=${_mb(m.rss)}MB heapUsed=${_mb(m.heapUsed)}MB ` +
                    `external=${_mb(m.external)}MB arrayBuffers=${_mb(m.arrayBuffers)}MB (ceil ~512MB)`
            );
        }
    }, 60_000).unref();
}
const { types } = require('pg');

// Startup env validation — fail fast in dev/mis-configured envs. In production
// we only warn (Render sometimes injects env via platform after require-time).
const REQUIRED_ENV = [
    'DATABASE_URL',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_CLIENT_EMAIL',
    'FIREBASE_PRIVATE_KEY',
];
const missingEnv = REQUIRED_ENV.filter((k) => !process.env[k]);
if (missingEnv.length) {
    const msg = `[STARTUP] Missing required env vars: ${missingEnv.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
        console.error(msg + ' — continuing anyway (production fallback)');
    } else {
        console.error(msg);
        process.exit(1);
    }
}

// Global safety net — Node 15+ exits process on unhandled rejection by default.
// We have seen crashes from pg-pool timeouts during DB upgrades. Log + keep alive.
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

// Fix timezone: transaction_date is stored as TIMESTAMP WITHOUT TIMEZONE
// but contains Vietnam time (UTC+7). Render.com server runs in UTC,
// so pg driver would misinterpret it as UTC. This parser appends +07:00
// so browser correctly displays Vietnam time.
// OID 1114 = TIMESTAMP WITHOUT TIMEZONE
types.setTypeParser(1114, (val) => {
    if (!val) return val;
    return val + '+07:00';
});

// OID 1082 = DATE. Default parser uses new Date(year, month-1, day) which
// creates a local-midnight Date → ISO roundtrip shifts across UTC boundary
// depending on server TZ. Return as raw 'YYYY-MM-DD' string instead so date
// columns are treated as calendar dates without timezone involvement.
types.setTypeParser(1082, (val) => val);

const app = express();
const PORT = process.env.PORT || 3000;

// =====================================================
// MIDDLEWARE
// =====================================================

// Baseline security headers — inexpensive hardening against clickjacking,
// MIME sniffing, and over-sharing of referrer info. No CSP (could break
// cross-origin clients loading static assets from /public).
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
});

// CORS - Allow requests from GitHub Pages
// CORS - Allow specific origins
app.use(
    cors({
        origin: [
            'https://nhijudy.store', // Primary frontend (custom domain)
            'https://nhijudyshop.github.io', // Legacy GH Pages domain (301 → nhijudy.store)
            'http://localhost:5500', // Local development for frontend (Live Server)
            'http://localhost:3000', // Local development for this server itself
            'http://localhost:8080', // Local browser-test pattern (CLAUDE.md)
            'http://localhost:8000', // Alt local dev port
            'http://127.0.0.1:8080',
            'http://127.0.0.1:5500',
        ],
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        // x-web2-token: auth Web 2.0 (WEB2_AUTH_ENFORCE) — frontend post THẲNG web2-api
        // (vd /api/livestream/snapshot) gửi header này → phải cho qua preflight, KHÔNG
        // thì CORS chặn. x-admin-secret/x-relay-secret: admin + relay server-to-server.
        allowedHeaders: [
            'Content-Type',
            'Authorization',
            'X-Auth-Data',
            'X-User-Id',
            'X-API-Key',
            'x-web2-token',
            // x-web2-zalo-owner: trang web2/zalo gửi UUID per-máy (web2-zalo-api.js) khi
            // gọi THẲNG web2-api (DIRECT fallback). Thiếu → preflight chặn CORS.
            'x-web2-zalo-owner',
            'x-admin-secret',
            'x-relay-secret',
        ],
        credentials: false, // credentials cannot be true when origin is *
    })
);

// Body parsing - increased limit for large customer imports (80k+ records)
app.use(express.json({ limit: '100mb' }));

// Serve static files from public folder (merged from /api)
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Request logging (skip noisy health-check probes — Render pings every ~5s)
// audit r7: REDACT mọi token=/page_access_token= trong query trước khi log — tránh
// rò token phiên / Pancake vào log Render bền vững (SSE/avatar/EventSource buộc dùng
// ?token= vì không gửi header được; web2-auth verify đã chuyển sang header).
function _redactUrl(u) {
    return String(u || '').replace(
        /((?:^|[?&])(?:token|page_access_token|access_token|jwt)=)[^&#\s]+/gi,
        '$1[REDACTED]'
    );
}
app.use((req, res, next) => {
    if (req.path !== '/health' && req.path !== '/ping' && req.path !== '/health/detailed') {
        console.log(`[${new Date().toISOString()}] ${req.method} ${_redactUrl(req.url)}`);
    }
    next();
});

// =====================================================
// DATABASE CONNECTION
// =====================================================

// Reuse the singleton pool from db/pool.js. Previously this file created a
// SECOND Pool with the same config → each process could hold up to 40
// connections (20 here + 20 in cron/utils via db/pool.js singleton).
// Singleton also registers pool.on('error') so idle client failures don't
// crash the process.
const chatDbPool = require('./db/pool');

// Web 2.0 isolated DB — dedicated Render Postgres `n2store-web2-db` (WEB2_DATABASE_URL).
// Falls back to chatDb khi env unset. KHÔNG dùng Neon nữa (đã migrate sang Render).
const web2Pool = require('./db/web2-pool');

// 3W7 BOOT GUARD (2026-06-12, audit vòng 3; SIẾT "tách tuyệt đối" 2026-06-19):
// fallback `web2Pool || chatDbPool` là rủi ro HỆ THỐNG — env WEB2_DATABASE_URL
// thiếu/sai sau 1 lần deploy thì TOÀN BỘ ensureTables + write Web 2.0 (kể cả
// bytea livestream, ví) âm thầm rơi xuống chatDb PROD Web 1.0 (2 tiền lệ:
// web2_* leftover tables; chatDb full 1GB vì bytea — cb45ef604).
//
// MẶC ĐỊNH GIỜ = FAIL-FAST exit(1) — KHÔNG còn phụ thuộc nhớ set WEB2_REQUIRE_DB.
// Sau guard này, khi process còn SỐNG thì web2Pool LUÔN non-null → mọi nhánh
// `web2Db || chatDb` ở 44 route + `web2Pool || chatDbPool` ở ensureSchema trở
// thành DEAD-SAFE (nhánh `|| chatDb` không bao giờ chạy) → Web 2.0 ⊥ Web 1.0 ở
// tầng DB được CODE bảo đảm, không phụ thuộc cấu hình env.
//
// Escape hatch DUY NHẤT cho monolith/local-dev (CỐ Ý dùng chung 1 DB):
//   WEB2_ALLOW_CHATDB_FALLBACK=1  → cho phép boot + web2_* ghi vào chatDb.
// (WEB2_REQUIRE_DB cũ giờ redundant — fail-fast đã là mặc định; vẫn vô hại.)
if (!web2Pool) {
    console.error(
        '\n' +
            '═'.repeat(70) +
            '\n⚠⚠⚠  [WEB2-DB] WEB2_DATABASE_URL KHÔNG có / pool init fail —\n' +
            '⚠⚠⚠  Web 2.0 sẽ phải FALLBACK sang chatDb (PROD Web 1.0)!\n' +
            '═'.repeat(70)
    );
    if (process.env.WEB2_ALLOW_CHATDB_FALLBACK === '1') {
        console.warn(
            '[WEB2-DB] WEB2_ALLOW_CHATDB_FALLBACK=1 → CỐ Ý chạy monolith (web2_* ghi vào chatDb). Chỉ dùng local-dev/migration.'
        );
    } else {
        console.error(
            '[WEB2-DB] refuse to boot — tách tuyệt đối Web 2.0 ⊥ Web 1.0.\n' +
                '          → Set WEB2_DATABASE_URL cho instance này,\n' +
                '          → hoặc WEB2_ALLOW_CHATDB_FALLBACK=1 nếu CỐ Ý dùng chung 1 DB (local-dev).'
        );
        process.exit(1);
    }
}

// Make pool available to routes via app.locals
// ⚠ NAMING (2026-06-19): tên `chatDb`/`chatDbPool` KHÔNG có hậu tố layer → DỄ NHẦM.
//   • app.locals.chatDb  === app.locals.web1Db  → DB **Web 1.0** (n2store-chat-db).
//   • app.locals.web2Db                          → DB **Web 2.0** (n2store-web2-db).
// Code Web 2.0 PHẢI dùng `req.app.locals.web2Db` (idiom `web2Db || chatDb` giờ
// dead-safe nhờ boot-guard fail-fast ở trên — nhánh `|| chatDb` không bao giờ chạy).
// Code Web 1.0 dùng `web1Db` (RÕ) hoặc `chatDb` (legacy). TUYỆT ĐỐI không dùng
// `chatDb` để ghi data Web 2.0 (và ngược lại). Ngoại lệ DUY NHẤT được phép đọc
// chéo `chatDb` từ Web 2.0: credential Pancake (pancake_accounts /
// pancake_page_access_tokens) — infra dùng CHUNG, READ-ONLY.
app.locals.chatDb = chatDbPool;
app.locals.web1Db = chatDbPool; // alias RÕ LAYER cho code Web 1.0 mới (cùng pool chatDb)
app.locals.web2Db = web2Pool || chatDbPool;
// tposTokenManager is set after require() below — see after route imports

// =====================================================
// INSTANCE ROLE FLAGS — Web 1.0 ⊥ Web 2.0 service split (2026-06-14)
// =====================================================
// Cùng 1 codebase, 2 deployment Render khác nhau:
//   • n2store-fallback (Web 1.0 hub): cả 2 cờ unset lúc đầu; sau khi web2-api
//     online → set DISABLE_WEB2_JOBS=1 để cron Web 2.0 KHÔNG chạy 2 nơi.
//   • web2-api (project web2.0n2store): WEB2_ONLY=1 → BỎ mọi background job
//     Web 1.0 (TPOS sync/WS, invoice poller, SIP, cron/scheduler, aikol);
//     vẫn chạy job Web 2.0 + phục vụ route/SSE Web 2.0.
// Route vẫn mount CẢ HAI bên (vô hại) — Cloudflare worker quyết định traffic.
// Boot schema giữ nguyên (idempotent) — web2-api có cả 2 pool nên không crash;
// web2-unread-reconcile + pancake-refresh đọc chatDb nên cần chatDb hiện diện.
const WEB2_ONLY = process.env.WEB2_ONLY === '1';
const DISABLE_WEB2_JOBS = process.env.DISABLE_WEB2_JOBS === '1';
console.log(
    `[INSTANCE-ROLE] WEB2_ONLY=${WEB2_ONLY} DISABLE_WEB2_JOBS=${DISABLE_WEB2_JOBS} ` +
        `(web1Jobs=${!WEB2_ONLY ? 'on' : 'off'}, web2Jobs=${!DISABLE_WEB2_JOBS ? 'on' : 'off'})`
);

// Test database connection on startup
chatDbPool
    .query('SELECT NOW()')
    .then(() => {
        console.log('[DATABASE] PostgreSQL connected successfully');
        // Auto-create phone management tables (idempotent)
        if (typeof ensurePhoneManagementTables === 'function') {
            ensurePhoneManagementTables(chatDbPool).catch(() => {});
        }
        // WEB 2.0 — kho KH riêng (web2_customers) trong web2Db (n2store-web2-db).
        // Thay phụ thuộc bảng `customers` Web 1.0. Fallback chatDb nếu web2Db unset.
        try {
            const { ensureWeb2CustomersSchema } = require('./db/web2-customers-schema');
            ensureWeb2CustomersSchema(web2Pool || chatDbPool).catch((e) =>
                console.warn('[web2-customers-schema] init warn:', e.message)
            );
        } catch (e) {
            console.warn('[web2-customers-schema] require failed:', e.message);
        }
        // 2026-06-07: bỏ migration rename customers→web2_order_customers. Kho KH
        // Web 2.0 nay gộp 1 warehouse DUY NHẤT web2_customers (ensureWeb2CustomersSchema
        // ở trên tự DROP web2_order_customers + bảng web2_customers TPOS-coupled cũ).
        // WEB 2.0 — wallet isolation (TRUE isolation từ 2026-05-25):
        // tạo web2_customer_wallets/transactions/adjustments + sequence riêng.
        // DROP triggers cũ (legacy → web2 sync) — Web 2.0 service tự ghi web2_*.
        try {
            const {
                ensureSchema: ensureWalletIsolation,
            } = require('./services/web2-wallet-isolation');
            // Schema web2_* PHẢI tạo trên web2Db (tên web2_ = Web 2.0). Trước
            // đây dùng chatDbPool → tạo bảng leftover trên Web 1.0 DB.
            ensureWalletIsolation(web2Pool || chatDbPool).catch((e) =>
                console.warn('[web2-wallet-isolation] init warn:', e.message)
            );
        } catch (e) {
            console.warn('[web2-wallet-isolation] require failed:', e.message);
        }
        // WEB 2.0 — SePay matching isolation: tạo web2_balance_history +
        // web2_pending_matches để Web 2.0 webhook fan-out có chỗ ghi.
        try {
            const { ensureSchema: ensureSepayMatching } = require('./services/web2-sepay-matching');
            ensureSepayMatching(web2Pool || chatDbPool).catch((e) =>
                console.warn('[web2-sepay-matching] init warn:', e.message)
            );
        } catch (e) {
            console.warn('[web2-sepay-matching] require failed:', e.message);
        }
        // WEB 2.0 Phase 5/6: match audit log + retry queue + blacklist tables
        try {
            // Tables web2_* (audit/retry/blacklist) tạo trên web2Db — tên web2_ = Web 2.0.
            const w2SchemaPool = web2Pool || chatDbPool;
            const matchAudit = require('./services/web2-match-audit');
            matchAudit
                .ensureSchema(w2SchemaPool)
                .catch((e) => console.warn('[web2-match-audit] init warn:', e.message));
            const retry = require('./services/web2-webhook-retry');
            retry
                .ensureSchema(w2SchemaPool)
                .catch((e) => console.warn('[web2-webhook-retry] init warn:', e.message));
            const blacklist = require('./services/web2-blacklist');
            blacklist
                .ensureSchema(w2SchemaPool)
                .catch((e) => console.warn('[web2-blacklist] init warn:', e.message));
            // C7 (2026-06-13): thêm cột token_hash cho web2_user_sessions NGAY lúc boot
            // (web2-users.ensureTables là lazy) → resolveWeb2User dùng nhánh hash ngay,
            // tránh cửa sổ fallback plaintext. Idempotent.
            w2SchemaPool
                .query(
                    `ALTER TABLE IF EXISTS web2_user_sessions ADD COLUMN IF NOT EXISTS token_hash VARCHAR(64);
                     CREATE INDEX IF NOT EXISTS idx_web2_user_sessions_hash ON web2_user_sessions(token_hash) WHERE token_hash IS NOT NULL;`
                )
                .catch((e) => console.warn('[web2-auth] token_hash migration warn:', e.message));
            // 2026-06-04: DROP orphan inventory_* trên web2Db. inventory-tracking
            // là module Web 1.0 (data ở chatDb); các bảng inventory_* trên web2Db
            // là leftover từ đợt seed supplier-debt (route web2-supplier-debt đã gỡ).
            // GUARD CHẶT: chỉ chạy khi web2Pool là DB RIÊNG (≠ chatDb) → KHÔNG bao
            // giờ drop nhầm data thật trên Web 1.0. Idempotent (IF EXISTS).
            if (web2Pool && web2Pool !== chatDbPool) {
                web2Pool
                    .query(
                        `DROP TABLE IF EXISTS
                            inventory_shipments, inventory_order_bookings,
                            inventory_prepayments, inventory_other_expenses,
                            inventory_edit_history, inventory_suppliers CASCADE`
                    )
                    .then(() => console.log('[web2-cleanup] dropped orphan inventory_* on web2Db'))
                    .catch((e) =>
                        console.warn('[web2-cleanup] drop orphan inventory warn:', e.message)
                    );
            }
            // Start retry cron — re-runs failed Web 2.0 webhook payloads.
            // Delay 5s để schema tables tạo xong.
            setTimeout(() => {
                if (DISABLE_WEB2_JOBS) return; // chạy ở web2-api, không ở fallback sau cutover
                try {
                    const sepayMatching = require('./services/web2-sepay-matching');
                    const { fetchWithTimeout } = require('../shared/node/fetch-utils.cjs');
                    // Phase 6: web2 SePay data ở web2Db → retry cron đọc/ghi web2Pool.
                    const w2 = web2Pool || chatDbPool;
                    retry.startCron(w2, async (webhookData) => {
                        const { id, isDuplicate } = await sepayMatching.insertWeb2BalanceHistory(
                            w2,
                            webhookData
                        );
                        if (id && !isDuplicate && webhookData.transferType === 'in') {
                            await sepayMatching.processWeb2Match(w2, id, fetchWithTimeout);
                        }
                    });
                } catch (e) {
                    console.warn('[web2-webhook-retry] cron start fail:', e.message);
                }
            }, 5000);
            // Start reprocess cron — re-khớp các GD "chưa gán KH" định kỳ
            // (server-side, KHÔNG cần ai mở trang balance-history).
            setTimeout(() => {
                if (DISABLE_WEB2_JOBS) return; // chạy ở web2-api, không ở fallback sau cutover
                try {
                    const reprocessCron = require('./services/web2-reprocess-cron');
                    const sepayMatching = require('./services/web2-sepay-matching');
                    const { fetchWithTimeout } = require('../shared/node/fetch-utils.cjs');
                    // Phase 6: re-khớp GD web2 trên web2Db.
                    reprocessCron.startCron(
                        web2Pool || chatDbPool,
                        (db, limit) =>
                            sepayMatching.reprocessUnmatched(db, fetchWithTimeout, {
                                limit,
                                sampleLimit: 0,
                            }),
                        { intervalMs: 10 * 60 * 1000, limit: 200 }
                    );
                } catch (e) {
                    console.warn('[web2-reprocess-cron] cron start fail:', e.message);
                }
            }, 8000);
        } catch (e) {
            console.warn('[web2 phase-5] init failed:', e.message);
        }
        // DELIVERY ASSIGNMENTS — bill image storage (migrate localStorage → BYTEA).
        try {
            const {
                ensureImagesSchema,
                ensureOverridesSchema,
                ensureMergesSchema,
                ensureDateShiftsSchema,
            } = require('./routes/v2/delivery-assignments');
            if (typeof ensureImagesSchema === 'function') {
                ensureImagesSchema(chatDbPool).catch((e) =>
                    console.warn('[delivery-assignment-images] init warn:', e.message)
                );
            }
            if (typeof ensureOverridesSchema === 'function') {
                ensureOverridesSchema(chatDbPool).catch((e) =>
                    console.warn('[delivery-assignment-overrides] init warn:', e.message)
                );
            }
            if (typeof ensureMergesSchema === 'function') {
                ensureMergesSchema(chatDbPool).catch((e) =>
                    console.warn('[delivery-assignment-merges] init warn:', e.message)
                );
            }
            if (typeof ensureDateShiftsSchema === 'function') {
                ensureDateShiftsSchema(chatDbPool).catch((e) =>
                    console.warn('[delivery-assignment-date-shifts] init warn:', e.message)
                );
            }
        } catch (e) {
            console.warn('[delivery-assignment-images] require failed:', e.message);
        }
    })
    .catch((err) => console.error('[DATABASE] PostgreSQL connection error:', err.message));

// =====================================================
// REALTIME CREDENTIALS MANAGEMENT
// =====================================================

/**
 * Save realtime credentials to database for auto-reconnect on server restart
 */
async function saveRealtimeCredentials(db, clientType, credentials) {
    try {
        const query = `
            INSERT INTO realtime_credentials (client_type, token, user_id, page_ids, cookie, room, is_active, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, TRUE, NOW())
            ON CONFLICT (client_type) DO UPDATE SET
                token = EXCLUDED.token,
                user_id = EXCLUDED.user_id,
                page_ids = EXCLUDED.page_ids,
                cookie = EXCLUDED.cookie,
                room = EXCLUDED.room,
                is_active = TRUE,
                updated_at = NOW()
        `;
        await db.query(query, [
            clientType,
            credentials.token,
            credentials.userId || null,
            credentials.pageIds ? JSON.stringify(credentials.pageIds) : null,
            credentials.cookie || null,
            credentials.room || null,
        ]);
        console.log(`[CREDENTIALS] Saved ${clientType} credentials for auto-reconnect`);
        return true;
    } catch (error) {
        // Table might not exist yet, ignore error
        console.log(`[CREDENTIALS] Could not save ${clientType} credentials:`, error.message);
        return false;
    }
}

/**
 * Load and auto-connect realtime clients on server startup
 */
async function autoConnectRealtimeClients(db) {
    try {
        console.log('[AUTO-CONNECT] Checking for saved credentials...');

        const result = await db.query(`
            SELECT client_type, token, user_id, page_ids, cookie, room
            FROM realtime_credentials
            WHERE is_active = TRUE
        `);

        if (result.rows.length === 0) {
            console.log('[AUTO-CONNECT] No saved credentials found. Waiting for manual start.');
            return;
        }

        for (const row of result.rows) {
            // Mỗi row bọc try-catch RIÊNG: trước đây JSON.parse(page_ids) lỗi ở 1
            // row sẽ throw ra outer catch → log SAI "table may not exist" + BỎ
            // TẤT CẢ row còn lại → Pancake WS không bao giờ lên → cột tin nhắn
            // chết im sau restart. Giờ row hỏng chỉ skip chính nó.
            try {
                if (row.client_type === 'pancake' && row.token && row.user_id && row.page_ids) {
                    const pageIds = JSON.parse(row.page_ids);
                    if (!Array.isArray(pageIds) || pageIds.length === 0) {
                        console.error(
                            '[AUTO-CONNECT] Pancake row page_ids không phải array hợp lệ — skip:',
                            String(row.page_ids).slice(0, 80)
                        );
                        continue;
                    }
                    console.log(
                        `[AUTO-CONNECT] Starting Pancake client with ${pageIds.length} pages...`
                    );
                    realtimeClient.start(row.token, row.user_id, pageIds, row.cookie);
                } else if (row.client_type === 'tpos' && row.token) {
                    console.log(
                        `[AUTO-CONNECT] Starting TPOS client for room: ${row.room || 'tomato.tpos.vn'}...`
                    );
                    tposRealtimeClient.start(row.token, row.room || 'tomato.tpos.vn');
                }
            } catch (rowErr) {
                console.error(
                    `[AUTO-CONNECT] Bỏ qua row ${row.client_type} lỗi (không chặn row khác):`,
                    rowErr.message
                );
            }
        }
    } catch (error) {
        // Table might not exist yet
        console.log(
            '[AUTO-CONNECT] Could not load credentials (table may not exist yet):',
            error.message
        );
    }
}

// =====================================================
// ROUTES
// =====================================================

// Health check — basic liveness
app.get('/health', async (req, res) => {
    try {
        await chatDbPool.query('SELECT 1'); // Test DB connection
        res.json({
            status: 'ok',
            message: 'N2Store API Fallback Server is running',
            database: 'connected',
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    } catch (dbError) {
        console.error('[HEALTH] Database check failed:', dbError.message);
        res.status(503).json({
            status: 'degraded',
            message: 'N2Store API Fallback Server is running but database is disconnected',
            database: 'disconnected',
            error: dbError.message,
            timestamp: new Date().toISOString(),
            uptime: process.uptime(),
        });
    }
});

// Detailed health: pool stats + memory + deps (for dashboards/ops)
app.get('/health/detailed', async (req, res) => {
    const mem = process.memoryUsage();
    const poolStats = chatDbPool
        ? {
              total: chatDbPool.totalCount,
              idle: chatDbPool.idleCount,
              waiting: chatDbPool.waitingCount,
          }
        : null;
    let dbOk = false,
        dbLatencyMs = null;
    try {
        const t0 = Date.now();
        await chatDbPool.query('SELECT 1');
        dbLatencyMs = Date.now() - t0;
        dbOk = true;
    } catch (_) {}
    res.json({
        service: 'n2store-fallback',
        status: dbOk ? 'ok' : 'degraded',
        uptime_sec: Math.round(process.uptime()),
        memory_mb: {
            rss: Math.round(mem.rss / 1024 / 1024),
            heapUsed: Math.round(mem.heapUsed / 1024 / 1024),
            heapTotal: Math.round(mem.heapTotal / 1024 / 1024),
        },
        db: { ok: dbOk, latency_ms: dbLatencyMs, pool: poolStats },
        node_version: process.version,
        pid: process.pid,
        timestamp: new Date().toISOString(),
    });
});

// Server time diagnostic endpoint for debugging Facebook 24-hour policy
app.get('/api/debug/time', (req, res) => {
    const now = new Date();
    res.json({
        utc: now.toISOString(),
        unix_timestamp: now.getTime(),
        unix_seconds: Math.floor(now.getTime() / 1000),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezone_offset_minutes: now.getTimezoneOffset(),
        server_time_string: now.toString(),
        vietnam_time: new Date(now.getTime() + 7 * 60 * 60 * 1000).toISOString(), // UTC+7
        note: 'Compare this with your local time to check for clock drift',
    });
});

// Import route modules
const tokenRoutes = require('./routes/token');
const odataRoutes = require('./routes/odata');
const pancakeRoutes = require('./routes/pancake');
const imageProxyRoutes = require('./routes/image-proxy');
const sepayWebhookRoutes = require('./routes/sepay-webhook');
const sepayHomeWebhookRoutes = require('./routes/sepay-home-webhook');
const customersRoutes = require('./routes/customers');
const returnOrdersRoutes = require('./routes/return-orders');
const cloudflareBackupRoutes = require('./routes/cloudflare-backup');
const realtimeRoutes = require('./routes/realtime');
const { upsertPendingCustomer } = require('./routes/realtime');
const geminiRoutes = require('./routes/gemini');
const deepseekRoutes = require('./routes/deepseek');
const telegramBotRoutes = require('./routes/telegram-bot');
const deliveryReportTelegramRoutes = require('./routes/delivery-report-telegram'); // Web 1.0 — bot Telegram riêng cho delivery-report
const uploadImageRoutes = require('./routes/upload');
const quyTrinhRoutes = require('./routes/quy-trinh');
const goongPlacesRoutes = require('./routes/goong-places');
const aikolRoutes = require('./routes/aikol');

// === FIREBASE REPLACEMENT ROUTES (SSE + PostgreSQL) ===
const realtimeSseRoutes = require('./routes/realtime-sse'); // Web 1.0 SSE hub
const web2RealtimeSseRoutes = require('./routes/realtime-sse-web2'); // WEB2.0 — SSE hub riêng, không chia chung với Web 1.0
// WEB2.0 — detector keyword "CK XONG"/"ĐÃ CK" cho tin nhắn Pancake đến (hook trong
// RealtimeClient.handleMessage). Ghi web2_payment_signals → SSE web2:payment-signals.
const web2SignalDetector = require('./services/web2-payment-signal-detector');
// WEB2.0 — CK watcher 2 chiều: onNewSepayTx (tiền về→tìm signal), onNewSignal
// (signal "đã ck" mới→tìm GD đã về). Auto-confirm + cộng ví + reply.
const web2CkWatcher = require('./services/web2-ck-watcher');
// WEB2.0 — tracker tin nhắn chưa đọc RIÊNG (web2_unread_messages, web2Db). Độc
// lập pending_customers (Web 1.0). Hook trong RealtimeClient.handleMessage.
const web2UnreadTracker = require('./services/web2-unread-tracker');
const realtimeDbRoutes = require('./routes/realtime-db');
const adminMigrationRoutes = require('./routes/admin-migration');
const adminDataRoutes = require('./routes/admin-data');
const adminFirebaseRoutes = require('./routes/admin-firebase');
const adminRenderRoutes = require('./routes/admin-render');
const invoiceStatusRoutes = require('./routes/invoice-status');
const invoiceMappingRoutes = require('./routes/invoice-mapping');
const orderNotesRoutes = require('./routes/order-notes');
const showroomProductsRoutes = require('./routes/showroom-products'); // /showroom1/ curated catalog
const showroomCartsRoutes = require('./routes/showroom-carts'); // /showroom1/ giỏ hàng khách vãng lai (visitor ID)
const socialOrdersRoutes = require('./routes/social-orders');
const socialKpiVerifyRoutes = require('./routes/social-kpi-verify');
const nativeOrdersRoutes = require('./routes/native-orders');
const fastSaleOrdersRoutes = require('./routes/fast-sale-orders');
const reconcileRoutes = require('./routes/reconcile'); // WEB2.0 — PBH đối soát đóng gói
const walletDepositsRoutes = require('./routes/wallet-deposits'); // WEB2.0
const purchaseRefundRoutes = require('./routes/purchase-refund'); // WEB2.0 — Trả hàng NCC state machine
const servicesOverviewRoutes = require('./routes/services-overview'); // WEB2.0 — Services dashboard (DB stats + cost)
const deliveryInvoicesRoutes = require('./routes/delivery-invoices');
const refundsRoutes = require('./routes/refunds');
const pbhReportsRoutes = require('./routes/pbh-reports');
const web2ProductsRoutes = require('./routes/web2-products');
const web2ProductUnitsRoutes = require('./routes/web2-product-units'); // WEB2.0 — mã đơn vị + QR riêng/món (per-unit tracking)
const web2ReturnsRoutes = require('./routes/web2-returns'); // WEB2.0 — Thu về (goods return)
const web2VariantsRoutes = require('./routes/web2-variants');
const web2ProductTypesRoutes = require('./routes/web2-product-types');
const web2GenericRoutes = require('./routes/web2-generic');
const web2OrderTagsRoutes = require('./routes/web2-order-tags'); // WEB2.0 — TAG đơn hàng (auto theo trigger)
const web2ElevenLabsRoutes = require('./routes/web2-elevenlabs'); // WEB2.0 — ElevenLabs TTS proxy (video-maker)
const web2TtsProRoutes = require('./routes/web2-tts-pro'); // WEB2.0 — "Giọng AI Pro" TTS proxy (video-maker), tên trung tính giấu nhà cung cấp
const web2TranslateRoutes = require('./routes/web2-translate'); // WEB2.0 — Dịch thuật dùng chung (LLM free + fallback Google)
const web2AiRoutes = require('./routes/web2-ai'); // WEB2.0 — Trợ lý AI (chat free + tạo ảnh free, xoay nhiều key)
const web2StockMediaRoutes = require('./routes/web2-stock-media'); // WEB2.0 — Stock media Pexels/Pixabay (Xưởng Video AI)
const web2CampaignProductsRoutes = require('./routes/web2-campaign-products'); // WEB2.0 — SP trong chiến dịch livestream (TV board)
const attendanceRoutes = require('./routes/attendance');
const admsRoutes = require('./routes/adms');
const usersRoutes = require('./routes/users');
const quickRepliesRoutes = require('./routes/quick-replies');
const campaignsRoutes = require('./routes/campaigns');
const fbAdsRoutes = require('./routes/fb-ads');

// === ROUTES MERGED FROM /api ===
const uploadRoutes = require('./routes/upload.routes');
const productsRoutes = require('./routes/products.routes');
const attributeRoutes = require('./routes/attribute.routes');
const facebookRoutes = require('./routes/facebook.routes');
const dynamicHeadersRoutes = require('./routes/dynamic-headers.routes');
const customer360Routes = require('./routes/customer-360');
const v2Router = require('./routes/v2'); // Unified API v2
const tposSavedRoutes = require('./routes/tpos-saved');
const tposCredentialsRoutes = require('./routes/tpos-credentials');
const { saveOrderToBuffer } = require('./routes/tpos-order-buffer');
const {
    attachSipProxy,
    createRouter: createOncallRouter,
    ensurePhoneManagementTables,
} = require('./routes/oncall-sip-proxy');
const { SipRegistrarController } = require('./services/sip-registrar-controller');
const sipRegController = new SipRegistrarController(chatDbPool);
app.locals.sipRegController = sipRegController;
// Auto-start server-side SIP registrar (handoff logic: hold exts không có browser active)
setTimeout(() => {
    if (WEB2_ONLY) return; // Web 1.0 only — web2-api không chạy SIP
    sipRegController.start().catch((err) => console.error('[SIP-CTRL] start failed:', err.message));
}, 8000); // delay 8s để DB + migration sẵn sàng
const tposTokenManager = require('./services/tpos-token-manager');
const { createAuthTokenStore } = require('./services/auth-token-store');
const authTokenStore = createAuthTokenStore(chatDbPool);
app.locals.tposTokenManager = tposTokenManager;

// ===== Auth Token Cache API (protected by CLIENT_API_KEY) =====
function requireApiKey(req, res, next) {
    const key = req.headers['x-api-key'];
    const expected = process.env.CLIENT_API_KEY;
    if (!expected || key !== expected) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    next();
}

app.get('/api/auth/token/:provider', requireApiKey, async (req, res) => {
    try {
        const t = await authTokenStore.getToken(req.params.provider);
        res.json({ token: t.token, expires_at: t.expires_at, metadata: t.metadata });
    } catch (e) {
        if (e.message && e.message.startsWith('pancake:not_found')) {
            return res.status(404).json({
                error: 'no_pancake_token',
                message: 'Browser must push token via /api/realtime/start first',
            });
        }
        console.error('[AUTH-API] getToken error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.post('/api/auth/token/:provider/invalidate', requireApiKey, async (req, res) => {
    try {
        await authTokenStore.invalidate(req.params.provider);
        res.json({ ok: true });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// Mount routes
app.use('/api/token', tokenRoutes);
app.use('/api/odata', odataRoutes);
app.use('/api/pancake', pancakeRoutes);
app.use('/api/image-proxy', imageProxyRoutes);
app.use('/api/sepay', sepayWebhookRoutes);
app.use('/api/sepay-home', sepayHomeWebhookRoutes);
app.use('/api/customers', customersRoutes);
app.use('/api/tpos-saved', tposSavedRoutes);
app.use('/api/tpos-credentials', tposCredentialsRoutes);
app.use('/api', customer360Routes); // Customer 360° routes: /api/customer, /api/wallet, /api/ticket
app.use('/api/v2', v2Router); // Unified API v2: /api/v2/customers, /api/v2/wallets, /api/v2/tickets, /api/v2/analytics
app.use('/api/return-orders', returnOrdersRoutes);
app.use('/api/realtime', realtimeRoutes);
app.use('/api/gemini', geminiRoutes);
app.use('/api/deepseek', deepseekRoutes);
app.use('/api/telegram', telegramBotRoutes);
app.use('/api/delivery-report-telegram', deliveryReportTelegramRoutes); // Web 1.0 — ảnh bàn giao → nhóm Telegram
app.use('/api/upload', uploadImageRoutes);
app.use('/api/quy-trinh', quyTrinhRoutes);
app.use('/api/goong-places', goongPlacesRoutes);
app.use('/api/aikol', aikolRoutes);

// === FIREBASE REPLACEMENT ROUTES ===
// SSE TÁCH RIÊNG cho Web 2.0 (mount TRƯỚC để có path specificity rõ ràng)
// Endpoint client: /api/realtime/web2/sse?keys=web2:foo,web2:bar
app.use('/api/realtime/web2', web2RealtimeSseRoutes);
// Cross-instance SSE fan-out (Postgres LISTEN/NOTIFY trên web2Db) — fix realtime
// rớt khi web2-api chạy >1 instance / cửa sổ rolling-deploy. Single-instance: no-op.
// ⚠ CHỈ chạy trên instance GIỮ SSE client thật (web2-api). KHÔNG chạy trên
// n2store-fallback (đặt WEB2_API_FORWARD_URL): fallback đã forward notify qua HTTP
// relay sang web2-api; nếu fallback CŨNG pg-NOTIFY trên CÙNG web2Db thì web2-api
// nhận event 2 lần (relay + pg) → DOUBLE-DELIVER + đếm instance giả (audit r-sse #1,#7).
if (web2RealtimeSseRoutes.initCrossInstance) {
    if (process.env.WEB2_API_FORWARD_URL) {
        console.log(
            '[SSE-WEB2] instance có WEB2_API_FORWARD_URL (fallback) → BỎ QUA cross-instance fan-out (chỉ forward HTTP relay)'
        );
    } else {
        web2RealtimeSseRoutes.initCrossInstance(app.locals.web2Db);
    }
}
// SSE Web 1.0 (Firebase listener replacement) — celebration, kpi, held_products, tickets, ...
app.use('/api/realtime', realtimeSseRoutes);
// REST API for CRUD operations (replaces Firebase database operations) — Web 1.0
app.use('/api/realtime', realtimeDbRoutes);
// Admin migration endpoint
app.use('/api/admin', adminMigrationRoutes);
app.use('/api/admin/data', adminDataRoutes);
app.use('/api/admin/firebase', adminFirebaseRoutes);
app.use('/api/admin/render', adminRenderRoutes);
app.use('/api/invoice-status', invoiceStatusRoutes);
app.use('/api/invoice-mapping', invoiceMappingRoutes);
app.use('/api/order-notes', orderNotesRoutes);
app.use('/api/showroom-products', showroomProductsRoutes); // /showroom1/ curated catalog
app.use('/api/showroom-carts', showroomCartsRoutes); // /showroom1/ giỏ hàng khách vãng lai
// Mount KPI-verify DƯỚI prefix /api/social-orders/ (đã được Cloudflare Worker route sẵn về
// Render) → tránh phải thêm route mới vào worker. PHẢI mount TRƯỚC socialOrdersRoutes để
// /api/social-orders/kpi-verify/* khớp router này trước.
app.use('/api/social-orders/kpi-verify', socialKpiVerifyRoutes);
app.use('/api/social-orders', socialOrdersRoutes);
app.use('/api/native-orders', nativeOrdersRoutes);
app.use('/api/fast-sale-orders', fastSaleOrdersRoutes);
app.use('/api/reconcile', reconcileRoutes); // WEB2.0 — PBH đối soát đóng gói
app.use('/api/delivery-invoices', deliveryInvoicesRoutes);
app.use('/api/refunds', refundsRoutes);
app.use('/api/pbh-reports', pbhReportsRoutes);
app.use('/api/web2-products', web2ProductsRoutes);
web2ProductUnitsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-product-units', web2ProductUnitsRoutes); // WEB2.0 — per-unit code + QR (mint/resolve/assign/reprint)
app.use('/api/web2-order-tags', web2OrderTagsRoutes); // WEB2.0 — TAG đơn hàng config (auto theo trigger)
app.use('/api/web2-elevenlabs', web2ElevenLabsRoutes); // WEB2.0 — ElevenLabs TTS proxy (video-maker)
app.use('/api/web2-tts-pro', web2TtsProRoutes); // WEB2.0 — "Giọng AI Pro" TTS proxy (video-maker), tên trung tính
app.use('/api/web2-translate', web2TranslateRoutes); // WEB2.0 — Dịch thuật dùng chung
app.use('/api/web2-sepay-invoices', require('./routes/web2-sepay-invoices')); // WEB2.0 — hóa đơn SePay + QR thanh toán
app.use('/api/web2-ai', web2AiRoutes); // WEB2.0 — Trợ lý AI (chat free + tạo ảnh free, xoay nhiều key)
app.use('/api/web2-stock-media', web2StockMediaRoutes); // WEB2.0 — Stock media Pexels/Pixabay (Xưởng Video AI)
app.use('/api/web2-campaign-products', web2CampaignProductsRoutes); // WEB2.0 — SP trong chiến dịch livestream (TV board)
app.use('/api/web2-returns', web2ReturnsRoutes); // WEB2.0 — Thu về (goods return)
app.use('/api/web2-variants', web2VariantsRoutes);
app.use('/api/web2-product-types', web2ProductTypesRoutes);
app.use('/api/web2/cutout', require('./routes/web2-cutout')); // WEB2.0 photo-studio cutout (PhotoRoom) — TRƯỚC generic
// WEB2.0 video-maker: AI viết kịch bản (Gemini RIÊNG, key WEB2_GEMINI_API_KEY).
// ⚠ server.js DÙNG CHUNG web2-api + n2store-fallback (Web 1.0). Mount route Web 2.0
// MẶC ĐỊNH (giống mọi route web2 khác — worker quyết định traffic), nhưng cho phép
// loại khỏi hub Web 1.0 bằng WEB1_ONLY=1 (đặt trên n2store-fallback). Default an toàn:
// không set → vẫn mount (web2-api chạy). Try/catch để file lỗi/thiếu không sập server.
if (process.env.WEB1_ONLY !== '1') {
    try {
        app.use('/api/web2/ai-script', require('./routes/web2-ai-script'));
    } catch (e) {
        console.warn('[web2-ai-script] mount bỏ qua (không sập server):', e.message);
    }
}
// NOTE 2026-06-03: generic catch-all `/api/web2` (web2GenericRoutes) ĐÃ DỜI
// xuống SAU tất cả route dedicated `/api/web2/<entity>` bên dưới (notifications,
// audit-log, dashboard-kpi, ...). Lý do: generic có route `/:entity/list`
// → nếu mount TRƯỚC sẽ SHADOW dedicated route, trả `records:[]` rỗng thay vì data
// thật. Express match theo thứ tự đăng ký → specific PHẢI trước catch-all.
app.use('/api/wallet-deposits', walletDepositsRoutes); // WEB2.0 SePay deposits for ví NCC/KH
app.use('/api/purchase-refund', purchaseRefundRoutes); // WEB2.0 Trả hàng NCC state machine + stock
app.use('/api/services-overview', servicesOverviewRoutes); // WEB2.0 Services dashboard (DB stats + cost)
app.use('/api/admin', require('./routes/admin-web2-wallet-reset')); // WEB2.0 backup+reset ví/matching web2Db (auth via x-admin-secret)
app.use('/api/admin', require('./routes/admin-web2-data-reset')); // WEB2.0 backup+wipe SP/đơn/PBH/cart (giữ KH) → tạo lại data ảo (auth via x-admin-secret)
app.use('/api/admin', require('./routes/admin-web2-import-customers')); // WEB2.0 import KH TPOS→warehouse (dedupe phone, 1 lần, x-admin-secret)
app.use('/api/admin', require('./routes/admin-web2-import-pancake-customers')); // WEB2.0 backfill SĐT+fb_id từ Pancake INBOX → kho (1 lần, x-admin-secret)
app.use('/api/admin', require('./routes/admin-web2-import-fb-links')); // WEB2.0 backfill fb_id↔phone từ Web1 customers → warehouse (cho live-chat enrich)
app.use('/api/web2-users', require('./routes/web2-users')); // WEB2.0 user account system
const web2LiveCommentsRoutes = require('./routes/web2-live-comments'); // WEB2.0 kho comment livestream (auto-save + đọc lại đủ/bền)
app.use('/api/web2-live-comments', web2LiveCommentsRoutes);
const web2CommentBoostRoutes = require('./routes/web2-comment-boost'); // WEB2.0 job tăng comment chạy NỀN server (re-check tới >= target)
app.use('/api/web2-comment-boost', web2CommentBoostRoutes);
web2CommentBoostRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.error('[WEB2-CMT-BOOST] ensureSchema fail:', e.message));
web2CommentBoostRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-live-relay', require('./routes/web2-live-relay')); // WEB2.0 cấu hình relay WS (chọn trang join per-page) — proxy sang web2-realtime
// 2026-06-03 Phase 3 tách Web 2.0: dual-mount mỗi route Web 2.0 ở CẢ
// `/api/web2/<entity>` (mới — chuẩn đi tới) lẫn `/api/v2/<entity>` (alias cũ,
// giữ backward-compat trong lúc frontend chuyển). Bỏ alias /api/v2/* sau khi
// mọi frontend đã trỏ /api/web2/*.
const web2NotificationsRoutes = require('./routes/v2/notifications');
app.use('/api/web2/notifications', web2NotificationsRoutes); // WEB2.0 notification center (F06)
app.use('/api/v2/notifications', web2NotificationsRoutes); // alias cũ
const web2AuditLogRoutes = require('./routes/v2/audit-log');
app.use('/api/web2/audit-log', web2AuditLogRoutes); // WEB2.0 audit trail union view (F05)
app.use('/api/v2/audit-log', web2AuditLogRoutes); // alias cũ
const web2DashboardRoutes = require('./routes/v2/dashboard-kpi');
app.use('/api/web2/dashboard-kpi', web2DashboardRoutes); // WEB2.0 dashboard aggregate (F01)
app.use('/api/v2/dashboard-kpi', web2DashboardRoutes); // alias cũ
const web2CartRoutes = require('./routes/v2/cart');
app.use('/api/web2/cart', web2CartRoutes); // WEB2.0 Pancake comment cart (drag-drop SP)
app.use('/api/v2/cart', web2CartRoutes); // alias cũ
const web2KpiRoutes = require('./routes/v2/kpi');
app.use('/api/web2/kpi', web2KpiRoutes); // WEB2.0 KPI attribution (forecast + actual + ledger)
app.use('/api/v2/kpi', web2KpiRoutes); // alias cũ
// WEB 2.0 — Wallet + Balance History độc lập (NO virtual, NO accountant approval).
// Tách hoàn toàn khỏi /api/v2/wallets + /api/v2/balance-history (Web 1.0 v2 API).
const web2WalletsRoutes = require('./routes/v2/web2-wallets');
app.use('/api/web2/wallets', web2WalletsRoutes);
const web2BalanceHistoryRoutes = require('./routes/v2/web2-balance-history');
app.use('/api/web2/balance-history', web2BalanceHistoryRoutes);
const web2MonitoringRoutes = require('./routes/v2/web2-monitoring');
app.use('/api/web2/monitoring', web2MonitoringRoutes);
const web2CustomerWalletRoutes = require('./routes/v2/web2-customer-wallet');
app.use('/api/web2/customer-wallet', web2CustomerWalletRoutes);
// 2026-06-01 (per user spec): Web 2.0 customer orders aggregate endpoint —
// trả native_orders + fast_sale_orders + refunds cho 1 KH theo phone.
// Replace pattern cũ /api/v2/customers/:id/orders (Web 1.0, chỉ TPOS data).
const web2CustomerOrdersRoutes = require('./routes/v2/web2-customer-orders');
app.use('/api/web2/customer-orders', web2CustomerOrdersRoutes);
// 2026-06-04: GỠ route /api/web2/supplier-debt — nó đọc bảng inventory_shipments
// (Web 1.0) → vi phạm quy ước Web 1.0 ⊥ Web 2.0. Trang supplier-debt giờ tính
// 100% client-side từ Firestore web2_so_order + web2_supplier_wallet (Web 2.0).
// 2026-06-01: TPOS Partner live fetch cho KH — address lấy FRESH từ TPOS
// (không qua customers table cache). Per user: "địa chỉ khách hàng lấy theo
// TPOS khách hàng".
// 2026-06-03: kho KH riêng Web 2.0 (web2_customers @ web2Db) — thay /api/v2/customers Web 1.0
const web2CustomersRoutes = require('./routes/v2/web2-customers');
app.use('/api/web2/customers', web2CustomersRoutes);
// 2026-06-04: Goong geocode proxy (auto-detect địa chỉ giao hàng — Method B).
app.use('/api/web2/geocode', require('./routes/v2/web2-geocode'));
// WEB2.0 — Bulk FB message send job (server-side, refresh-safe). Mount DƯỚI
// /api/web2/msg-send (CF worker đã forward /api/web2/* về Render — không cần
// allowlist riêng). PHẢI mount TRƯỚC catch-all /api/web2 bên dưới để không bị
// generic router nuốt thành entity "msg-send". Job/items ở web2Db; worker đọc
// pancake creds từ chatDb (shared). SSE topic web2:bulk-send.
const web2MsgSendRoutes = require('./routes/web2-msg-send');
web2MsgSendRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-msg-send] schema warn:', e.message));
app.use('/api/web2/msg-send', web2MsgSendRoutes);

// WEB2.0 — Payment Signals ("KH báo đã chuyển khoản"). Detector hook trong
// RealtimeClient.handleMessage (pages:new_message) detect keyword "CK XONG"/"ĐÃ CK"
// → ghi web2_payment_signals (web2Db). Mount TRƯỚC catch-all /api/web2.
// SSE topic web2:payment-signals. Consumer: web2/payment-confirm/.
const web2PaymentSignalsRoutes = require('./routes/web2-payment-signals');
web2PaymentSignalsRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-payment-signals] schema warn:', e.message));
app.use('/api/web2/payment-signals', web2PaymentSignalsRoutes);

// WEB2.0 — Unread messages (web2_unread_messages, web2Db). Độc lập pending_customers
// (Web 1.0). Populate từ RealtimeClient.handleMessage. Mount TRƯỚC catch-all.
// SSE topic web2:unread. Consumer: web2/payment-confirm/ tab "Tin nhắn chưa đọc".
const web2UnreadRoutes = require('./routes/web2-unread');
web2UnreadRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-unread] schema warn:', e.message));
app.use('/api/web2/unread', web2UnreadRoutes);

// WEB2.0 — Customer intents (FLAG-only: huỷ đơn/đổi địa chỉ/xem đơn/ship).
// Schema do web2-payment-signals (detector) ensureSchema quản lý.
const web2CustomerIntentsRoutes = require('./routes/web2-customer-intents');
app.use('/api/web2/customer-intents', web2CustomerIntentsRoutes);

// WEB2.0 — Quick replies fork (3W1 2026-06-12): bảng web2_quick_replies trên
// web2Db, one-time seed read-only từ quick_replies (Web 1.0). Web 2.0 KHÔNG
// CRUD bảng Web 1.0 nữa. SSE topic web2:quick-replies.
const web2QuickRepliesRoutes = require('./routes/web2-quick-replies');
web2QuickRepliesRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-quick-replies', web2QuickRepliesRoutes);

// WEB2.0 — Supplier wallet server ledger (ĐỢT E 2026-06-12): thay Firestore
// client-write `web2_supplier_wallet/main`. Bảng web2_supplier_ledger +
// web2_supplier_meta (web2Db). SSE topic web2:supplier-wallet.
const web2SupplierWalletRoutes = require('./routes/web2-supplier-wallet');
web2SupplierWalletRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-supplier-wallet', web2SupplierWalletRoutes);

// C8 (2026-06-13): Sổ Order server storage (Postgres web2Db thay Firestore).
const web2SoOrderRoutes = require('./routes/web2-so-order');
web2SoOrderRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-so-order', web2SoOrderRoutes);

// WEB2.0 (2026-06-28): kho ảnh NCC theo đợt cho Sổ Order — BYTEA trong web2Db
// (KHÔNG nhét base64 vào doc). Topic SSE 'web2:so-order-images'.
const web2SoOrderImagesRoutes = require('./routes/web2-so-order-images');
web2SoOrderImagesRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-so-order-images', web2SoOrderImagesRoutes);

// WEB2.0 (2026-06-29): Cân nặng hàng khi về kiện — ảnh cân BYTEA web2Db + kg/kiện/note.
// Topic SSE 'web2:goods-weight'.
const web2GoodsWeightRoutes = require('./routes/web2-goods-weight');
web2GoodsWeightRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-goods-weight', web2GoodsWeightRoutes);

// WEB2.0 — Báo cáo kho: mua vào (Sổ Order) vs bán ra (PBH) theo SP + NCC. Read-only, no SSE.
const web2WarehouseReportRoutes = require('./routes/web2-warehouse-report');
app.use('/api/web2-warehouse-report', web2WarehouseReportRoutes);

const web2MsgTemplatesRoutes = require('./routes/web2-msg-templates');
web2MsgTemplatesRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-msg-templates', web2MsgTemplatesRoutes);

// WEB2.0 — Zalo single-source (2026-06-13): NGUỒN DUY NHẤT mọi dữ liệu/chức năng
// Zalo. personal (zca-js: đăng nhập QR/cookie, chat 2 chiều, xem thông tin) + OA
// (ZNS, tin tư vấn). Bảng web2_zalo_* (web2Db). SSE web2:zalo:*. Mount root-level
// /api/web2-zalo → KHÔNG bị shadow bởi catch-all /api/web2. restoreSessions() re-login
// acc personal từ session đã lưu khi boot (giống Pancake relay autoConnect).
const web2ZaloRoutes = require('./routes/web2-zalo');
web2ZaloRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
// GLOBAL always-on (2026-06-29): boot-restore re-login TK Zalo từ session đã lưu DB
// (giống Pancake relay autoConnect). ensureSchema → restoreSessions. Chỉ instance sở hữu
// web2 jobs (web2-api) restore để tránh 2 instance đấu phiên.
web2ZaloRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .then(() => {
        if (!DISABLE_WEB2_JOBS && web2ZaloRoutes.restoreSessions)
            return web2ZaloRoutes.restoreSessions();
    })
    .catch((e) => console.warn('[web2-zalo] schema/restore warn:', e.message));
app.use('/api/web2-zalo', web2ZaloRoutes);
// WEB2.0 — Zalo retention: xoá tin nhắn + media cũ hơn 7 ngày (rolling window).
// Chạy ở instance sở hữu web2 jobs (web2-api, DISABLE_WEB2_JOBS chưa set).
if (!DISABLE_WEB2_JOBS && web2ZaloRoutes.runZaloRetention) {
    const ZALO_RETENTION_DAYS = 7;
    const runZaloRet = () => web2ZaloRoutes.runZaloRetention(ZALO_RETENTION_DAYS).catch(() => {});
    setTimeout(runZaloRet, 60 * 1000); // 1 phút sau boot
    const t = setInterval(runZaloRet, 6 * 60 * 60 * 1000); // mỗi 6h
    if (t.unref) t.unref();
    console.log('[STARTUP] Zalo retention cron started (7d, every 6h)');
}

// WEB2.0 — Tra cứu vận đơn J&T (báo cáo). Quét mã 12 số từ tin nhắn Zalo + dán
// thủ công → fetch jtexpress.vn (server-side render) → lưu/quản lý trạng thái giao
// hàng. Bảng web2_jt_tracking (web2Db). SSE web2:jt-tracking. Mount root-level
// /api/web2-jt-tracking → KHÔNG bị shadow bởi catch-all /api/web2.
const web2JtTrackingRoutes = require('./routes/web2-jt-tracking');
web2JtTrackingRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
web2JtTrackingRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-jt-tracking] schema warn:', e.message));
app.use('/api/web2-jt-tracking', web2JtTrackingRoutes);

// WEB2.0 — Chấm công (group Quản trị viên, admin-only). Quản lý punch máy DG-600
// (agent đẩy LAN 4370 / ADMS push / nhập Excel) + cấu hình lương + bảng lương.
// Bảng web2_attendance_* (web2Db). SSE web2:attendance. Mount root-level.
const web2AttendanceRoutes = require('./routes/web2-attendance');
web2AttendanceRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
web2AttendanceRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-attendance] schema warn:', e.message));
app.use('/api/web2-attendance', web2AttendanceRoutes);

// WEB2.0 — ADMS / iclock push cho máy DG-600 (text protocol, express.text riêng).
// Agent ADMS proxy máy shop forward /iclock/* → /api/web2-attendance-adms/iclock/*.
const web2AttendanceAdmsRoutes = require('./routes/web2-attendance-adms');
web2AttendanceAdmsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2-attendance-adms', web2AttendanceAdmsRoutes);

// WEB2.0 — Quản lý chi tiêu / Sổ quỹ (group Quản trị viên, admin-only). Thu/chi,
// quỹ, loại, nguồn, số dư, báo cáo, ảnh hoá đơn (bytea), lịch sử. Bảng
// web2_cashbook_* (web2Db). SSE web2:cashbook. Mount root-level.
const web2CashbookRoutes = require('./routes/web2-cashbook');
web2CashbookRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
web2CashbookRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-cashbook] schema warn:', e.message));
app.use('/api/web2-cashbook', web2CashbookRoutes);

// WEB2.0 — "Đăng bài Facebook": quản lý + soạn/đăng/lên lịch bài cho 2 page qua
// Graph API (Pancake KHÔNG đăng được). Bảng web2_fb_post_tokens / web2_fb_posts
// (web2Db). SSE web2:fb-posts. Mount root-level → KHÔNG bị shadow bởi /api/web2.
const web2FbPostsRoutes = require('./routes/web2-fb-posts');
web2FbPostsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
web2FbPostsRoutes
    .ensureSchema(web2Pool || chatDbPool)
    .catch((e) => console.warn('[web2-fb-posts] schema warn:', e.message));
app.use('/api/web2-fb-posts', web2FbPostsRoutes);
// Sổ đăng ký server giọng VieNeu (máy shop tự báo URL tunnel → trang tự dò máy online).
try {
    app.use('/api/web2-vieneu-registry', require('./routes/web2-vieneu-registry'));
} catch (e) {
    console.warn('[web2-vieneu-registry] mount bỏ qua:', e.message);
}

// 2026-06-07: config Web 2.0 (deliveryzone, printer) tách khỏi kho generic
// web2_records → bảng RIÊNG (web2_delivery_zones, web2_printers). Mount TRƯỚC
// catch-all để chiếm slug. Shape/path giữ nguyên → consumer không đổi. Auto
// migrate từ web2_records khi boot. Xem docs/plans/web2-customer-warehouse.md Phase 0.
const {
    makeDedicatedEntityRouter,
    initializeNotifiers: initDedicatedEntityNotifiers,
} = require('./routes/web2-dedicated-entity');
initDedicatedEntityNotifiers(web2RealtimeSseRoutes.notifyClients);
app.use('/api/web2/deliveryzone', makeDedicatedEntityRouter('web2_delivery_zones', 'deliveryzone'));
app.use('/api/web2/printer', makeDedicatedEntityRouter('web2_printers', 'printer'));

// 2026-06-03: generic catch-all `/api/web2/:entity` — MOUNT CUỐI CÙNG sau mọi
// dedicated route ở trên để không shadow chúng. Entity nào không có dedicated
// route sẽ rơi xuống đây (78 generic web2 entities, CRUD bảng web2_records).
app.use('/api/web2', web2GenericRoutes);
const livestreamSnapshotsRoutes = require('./routes/livestream-snapshots');
app.use('/api/livestream', livestreamSnapshotsRoutes); // WEB2.0 livestream snapshot per customer
const livestreamImagesRoutes = require('./routes/livestream-images');
app.use('/api/livestream-images', livestreamImagesRoutes); // WEB2.0 — kho "Hình Livestream" (manual iframe capture)
app.use('/api/attendance', attendanceRoutes);
// ADMS: ZKTeco machine pushes attendance data directly (no PC needed)
app.use(
    '/iclock',
    (req, res, next) => {
        req.pool = chatDbPool;
        next();
    },
    admsRoutes
);
app.use('/api/users', usersRoutes);
app.use('/api/quick-replies', quickRepliesRoutes);
app.use('/api/campaigns', campaignsRoutes);
app.use('/api/fb-ads', fbAdsRoutes);
app.use('/api/tpos/order-buffer', require('./routes/tpos-order-buffer'));

// OnCallCX SIP Proxy (REST endpoints)
app.use('/api/oncall', createOncallRouter());

// Facebook Global ID Cache — share resolved (psid → globalUserId) across all clients
const fbGlobalIdCacheRoutes = require('./routes/fb-global-id-cache');
fbGlobalIdCacheRoutes.init(chatDbPool);
app.use('/api/fb-global-id', fbGlobalIdCacheRoutes);

// Pancake Accounts — store JWT accounts in PostgreSQL
const pancakeAccountsRoutes = require('./routes/pancake-accounts');
pancakeAccountsRoutes.init(chatDbPool);
app.use('/api/pancake-accounts', pancakeAccountsRoutes);

// Pancake Account Pages Cache — share account → pages list across all clients
const pancakeAccountPagesRoutes = require('./routes/pancake-account-pages');
pancakeAccountPagesRoutes.init(chatDbPool);
app.use('/api/pancake-account-pages', pancakeAccountPagesRoutes);

// Pancake Page Access Tokens — cache page_access_tokens on Render DB (replaces Firebase)
const pancakePageTokensRoutes = require('./routes/pancake-page-tokens');
pancakePageTokensRoutes.init(chatDbPool);
app.use('/api/pancake-page-tokens', pancakePageTokensRoutes);

// WEB2.0 — Pancake auto-refresh token (server-side login). Lưu creds mã hoá +
// cron tự gia hạn JWT sắp hết hạn. Bảng pancake_accounts (chatDb, shared store).
const web2PancakeRefreshRoutes = require('./routes/web2-pancake-refresh');
web2PancakeRefreshRoutes.init(chatDbPool);
web2PancakeRefreshRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
if (web2LiveCommentsRoutes.initializeNotifiers) {
    web2LiveCommentsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
// Livestream comment fetcher — EVENT-DRIVEN (background poll đã tắt 2026-06-11):
// relay Pancake WS → /ingest → pollPostNow fetch đúng post → upsert + SSE.
// start() chỉ init deps (pool + config table), KHÔNG chạy vòng poll nền.
if (!DISABLE_WEB2_JOBS) {
    try {
        require('./services/web2-livestream-poller').start({
            web2Pool: web2Pool || chatDbPool,
            chatPool: chatDbPool,
            liveCommentsModule: web2LiveCommentsRoutes,
        });
    } catch (e) {
        console.error('[LIVE-POLLER] start fail:', e.message);
    }
    // WEB2.0 — worker tăng comment chạy nền (re-check tới >= target). Chỉ chạy ở
    // instance sở hữu web2 jobs (web2-api). Browser đóng vẫn chạy.
    try {
        require('./services/web2-comment-boost-worker').start({
            web2Pool: web2Pool || chatDbPool,
            chatPool: chatDbPool,
            notify: web2RealtimeSseRoutes.notifyClients,
        });
    } catch (e) {
        console.error('[CMT-BOOST] start fail:', e.message);
    }
}
// One-time migrate livestream_snapshots + livestream_images chatDb → web2Db
// (2026-06-11: chatDb 1GB bị FULL vì 2 bảng Web 2.0 này kẹt lại sau tách DB
// 03/06 — route tạo trước ngày tách, tên không prefix web2_ nên bị sót).
// Idempotent — dst đủ rows thì skip. KHÔNG drop bảng nguồn (chatDb là prod).
if (web2Pool && !DISABLE_WEB2_JOBS) {
    setTimeout(() => {
        require('./services/web2-livestream-media-migrate')
            .migrate({ chatPool: chatDbPool, web2Pool })
            .catch((e) => console.error('[LS-MIGRATE] fail:', e.message));
    }, 20000); // sau boot 20s — không tranh connection lúc khởi động
}
app.use('/api/web2/pancake-refresh', web2PancakeRefreshRoutes);
if (!DISABLE_WEB2_JOBS) {
    web2PancakeRefreshRoutes.startCron(chatDbPool); // quét mỗi 6h, refresh account auto ≤5 ngày HSD
}

// SSE notifier cho web2-customer-intents.
if (web2CustomerIntentsRoutes.initializeNotifiers) {
    web2CustomerIntentsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}

// WEB2.0 — CK watcher "chờ tiền về": inject deps (SSE notify + notification +
// auto-reply gửi tin) vào sepay-webhook-core. Best-effort.
try {
    const _ckWatcherDeps = {
        notify: web2RealtimeSseRoutes.notifyClients,
        createNotification: (data) =>
            web2NotificationsRoutes.createNotification(app.locals.web2Db, data),
        sendMessage: (pageId, convId, custId, msg) =>
            require('./services/web2-msg-send-worker').sendSingleMessage(
                pageId,
                convId,
                custId,
                msg
            ),
    };
    // Chiều 1 (tiền về): sepay-webhook-core gọi onNewSepayTx với deps này.
    require('./routes/sepay-webhook-core').initWeb2CkWatcher(_ckWatcherDeps);
    // GD SePay mới → SSE web2:balance-history để trang tự cập nhật (khỏi F5).
    try {
        require('./routes/sepay-webhook-core').initSseNotify(web2RealtimeSseRoutes.notifyClients);
    } catch (e) {
        console.warn('[sepay-webhook-core] initSseNotify fail:', e.message);
    }
    // Chiều 2 (signal mới): server.js gọi onNewSignal — inject deps mặc định 1 lần.
    web2CkWatcher.initDeps(_ckWatcherDeps);
} catch (e) {
    console.warn('[ck-watcher] init failed:', e.message);
}

// SSE notifier cho web2-payment-signals (route đã mount ở trên).
if (web2PaymentSignalsRoutes.initializeNotifiers) {
    web2PaymentSignalsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}

// SSE notifier cho web2-msg-send (route đã mount ở trên, TRƯỚC catch-all /api/web2).
if (web2MsgSendRoutes.initializeNotifiers) {
    web2MsgSendRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}

// SSE notifier cho web2-customers (kho KH warehouse — topic web2:customers).
if (web2CustomersRoutes.initializeNotifiers) {
    web2CustomersRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}

// Initialize SSE notifiers in realtime-db routes
const { initializeNotifiers } = require('./routes/realtime-db');
initializeNotifiers(realtimeSseRoutes.notifyClients, realtimeSseRoutes.notifyClientsWildcard);

// WEB2.0 cross-instance forward (Web1⊥Web2 split): trên n2store-fallback (Web 1.0)
// set WEB2_API_FORWARD_URL → mọi notify web2 phát sinh ở đây (SePay web2 fan-out,
// ck-watcher, web2 wallet event) tự POST sang hub web2-api để client thật nhận
// realtime (client web2 subscribe ở web2-api sau cutover). web2-api KHÔNG set env.
if (process.env.WEB2_API_FORWARD_URL && web2RealtimeSseRoutes.setForwardTarget) {
    web2RealtimeSseRoutes.setForwardTarget({
        url: process.env.WEB2_API_FORWARD_URL,
        secret: process.env.CLEANUP_SECRET || '',
    });
}

// Initialize SSE notifier for Web 2.0 routes — dùng web2RealtimeSseRoutes (hub riêng).
// Topic naming: 'web2:<entity>'. Tách hoàn toàn khỏi Web 1.0 SSE từ 2026-05-26.
// Pattern thống nhất: gọi initializeNotifiers ở top-level if, không block-scope
// (block scope đã verified bug — SSE event không fire dù require cached).
if (web2ProductsRoutes.initializeNotifiers) {
    web2ProductsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2CampaignProductsRoutes.initializeNotifiers) {
    web2CampaignProductsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (nativeOrdersRoutes.initializeNotifiers) {
    nativeOrdersRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2OrderTagsRoutes.initializeNotifiers) {
    web2OrderTagsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2ReturnsRoutes.initializeNotifiers) {
    web2ReturnsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2GenericRoutes.initializeNotifiers) {
    web2GenericRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2VariantsRoutes.initializeNotifiers) {
    web2VariantsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2ProductTypesRoutes.initializeNotifiers) {
    web2ProductTypesRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (purchaseRefundRoutes.initializeNotifiers) {
    purchaseRefundRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (fastSaleOrdersRoutes.initializeNotifiers) {
    fastSaleOrdersRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (reconcileRoutes.initializeNotifiers) {
    reconcileRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
const web2UsersRoutes = require('./routes/web2-users');
if (web2UsersRoutes.initializeNotifiers) {
    web2UsersRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2NotificationsRoutes.initializeNotifiers) {
    web2NotificationsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2DashboardRoutes.initializeNotifiers) {
    web2DashboardRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2KpiRoutes.initializeNotifiers) {
    web2KpiRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (web2CartRoutes.initializeNotifiers) {
    web2CartRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (livestreamSnapshotsRoutes.initializeNotifiers) {
    livestreamSnapshotsRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}
if (livestreamImagesRoutes.initializeNotifiers) {
    livestreamImagesRoutes.initializeNotifiers(web2RealtimeSseRoutes.notifyClients);
}

// Initialize SSE notifiers in order-notes routes
if (orderNotesRoutes.initializeNotifiers) {
    orderNotesRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients);
}

// Initialize SSE notifiers in showroom-products routes (Web 1.0 hub, topic 'showroom_products')
if (showroomProductsRoutes.initializeNotifiers) {
    showroomProductsRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients);
}

// Initialize SSE notifiers in showroom-carts routes (Web 1.0 hub, topic 'showroom_carts')
if (showroomCartsRoutes.initializeNotifiers) {
    showroomCartsRoutes.initializeNotifiers(realtimeSseRoutes.notifyClients);
}

// Initialize SSE notifiers in web-warehouse routes
const webWarehouseRouter = require('./routes/v2/web-warehouse');
if (webWarehouseRouter.initializeNotifiers) {
    webWarehouseRouter.initializeNotifiers(
        realtimeSseRoutes.notifyClients,
        realtimeSseRoutes.notifyClientsWildcard
    );
}

// Initialize TPOS Product Sync Service + Cron
const TPOSProductSync = require('./services/sync-tpos-products');
const tposProductSync = new TPOSProductSync(
    chatDbPool,
    tposTokenManager,
    realtimeSseRoutes.notifyClients
);
if (webWarehouseRouter.initializeSyncService) {
    webWarehouseRouter.initializeSyncService(tposProductSync);
}
// Socket listener initialized after creation below
// Start incremental sync cron (every 30 minutes) + TPOS Socket.IO listener
const TPOSSocketListener = require('./services/tpos-socket-listener');
const tposSocketListener = new TPOSSocketListener(
    tposTokenManager,
    tposProductSync,
    realtimeSseRoutes.notifyClients
);

if (webWarehouseRouter.initializeSocketListener) {
    webWarehouseRouter.initializeSocketListener(tposSocketListener);
}

setTimeout(async () => {
    if (WEB2_ONLY) return; // Web 1.0 only — web2-api không sync/connect TPOS
    // Start cron as fallback (in case socket disconnects)
    tposProductSync.startCron(30 * 60 * 1000);
    console.log('[STARTUP] TPOS product sync cron started (30 min interval)');

    // Connect to TPOS Socket.IO for real-time product updates
    try {
        await tposSocketListener.connect();
        console.log('[STARTUP] TPOS Socket.IO listener started');
    } catch (err) {
        console.error('[STARTUP] TPOS Socket.IO connection failed (will retry):', err.message);
    }

    // Web 2.0 ↔ TPOS sync — ĐÃ GỠ HẲN (2026-06-09). web2-sync-worker.js +
    // scripts/web2-seed-from-tpos.js (fetch tomato.tpos.vn/odata) đã xóa. Web 2.0
    // không còn phụ thuộc TPOS API. Trang cần POS realtime đọc thẳng `/api/odata/*`
    // (live proxy, Web 1.0 shared) — không qua shadow web2_records.
}, 10000); // delay 10s after server start

// Cloudflare Worker Backup Routes (fb-avatar, pancake-avatar, proxy, pancake-direct, pancake-official, facebook-send, rest)
app.use('/api', cloudflareBackupRoutes);

// === ROUTES MERGED FROM /api ===
app.use(uploadRoutes); // /upload, /upload-batch
app.use(productsRoutes); // /products
app.use(attributeRoutes); // /attributes
app.use(facebookRoutes); // /facebook/*
app.use(dynamicHeadersRoutes); // /dynamic-headers/*
// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================

class RealtimeClient {
    constructor(db = null) {
        this.ws = null;
        this.url = 'wss://pancake.vn/socket/websocket?vsn=2.0.0';
        this.isConnected = false;
        this.refCounter = 1;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10; // Max attempts trước khi chuyển sang retry chậm 60s
        this.lastActivityAt = Date.now(); // Watchdog: thời điểm nhận message gần nhất
        this.db = db; // PostgreSQL connection pool

        // User specific data
        this.token = null;
        this.userId = null;
        this.pageIds = [];
    }

    setDb(db) {
        this.db = db;
    }

    makeRef() {
        return String(this.refCounter++);
    }

    generateClientSession() {
        // Generate 64-char random string to match browser behavior
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
        // Ensure pageIds are strings. Guard: nếu pageIds không phải array
        // (vd JSON.parse trả string/object do row credential hỏng) thì .map()
        // sẽ throw TypeError → crash connect im lặng. Coerce về [] an toàn.
        this.pageIds = Array.isArray(pageIds) ? pageIds.map((id) => String(id)) : [];
        if (this.pageIds.length === 0) {
            console.error('[SERVER-WS] start() called with empty/invalid pageIds — bỏ qua connect');
            return;
        }
        this.cookie = cookie;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log(
            '[SERVER-WS] Connecting to Pancake... (attempt',
            this.reconnectAttempts + 1,
            ')'
        );
        const headers = {
            Origin: 'https://pancake.vn',
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        // Add cookie if available (critical for Cloudflare/Auth)
        if (this.cookie) {
            headers['Cookie'] = this.cookie;
        }

        this.ws = new WebSocket(this.url, {
            headers: headers,
        });

        this.ws.on('open', () => {
            console.log('[SERVER-WS] Connected');
            this.isConnected = true;
            this.reconnectAttempts = 0; // Reset on successful connect
            this.lastActivityAt = Date.now();
            this.startHeartbeat();
            this.joinChannels();
        });

        this.ws.on('close', (code, reason) => {
            console.log('[SERVER-WS] Closed', code, reason);
            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000); // 2s, 4s, 8s, ... max 60s
                this.reconnectAttempts++;
                console.log(
                    `[SERVER-WS] Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
                );
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                // 24/7 listener: KHÔNG bao giờ bỏ cuộc vĩnh viễn. Sau max attempts
                // → retry chậm 60s/lần + reset counter (backoff lại từ đầu nếu vẫn
                // fail). Tránh WS chết im sau outage Pancake dài rồi không bao giờ
                // tự hồi (regression cũ: "Stopping reconnection" → mất tin 24/7 đến
                // khi restart server / gọi /api/realtime/start thủ công).
                console.error(
                    '[SERVER-WS] ⚠ Max reconnect attempts reached — sẽ retry chậm 60s/lần (không dừng hẳn).'
                );
                this.reconnectAttempts = 0;
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), 60000);
            }
        });

        this.ws.on('error', (err) => {
            console.error('[SERVER-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            try {
                const msg = JSON.parse(data);
                this.handleMessage(msg);
            } catch (e) {
                console.error('[SERVER-WS] Parse error:', e);
            }
        });
    }

    startHeartbeat() {
        this.stopHeartbeat();
        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                // Watchdog zombie: heartbeat 30s LUÔN nhận phx_reply nếu socket sống.
                // Không có message nào (kể cả heartbeat reply) > 90s → connection
                // half-open (TCP còn nhưng server câm) → terminate để fire 'close'
                // → reconnect. Tránh kẹt "isConnected=true nhưng không nhận tin".
                if (Date.now() - this.lastActivityAt > 90000) {
                    console.warn(
                        '[SERVER-WS] ⚠ Không có activity > 90s — terminate để reconnect (zombie connection).'
                    );
                    try {
                        this.ws.terminate();
                    } catch (e) {
                        /* ignore */
                    }
                    return;
                }
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

        // 2. Join Multiple Pages Channel
        const pagesRef = this.makeRef();
        const pagesJoinMsg = [
            pagesRef,
            pagesRef,
            `multiple_pages:${this.userId}`,
            'phx_join',
            {
                accessToken: this.token,
                userId: this.userId,
                clientSession: this.generateClientSession(),
                pageIds: this.pageIds,
                platform: 'web',
            },
        ];
        this.ws.send(JSON.stringify(pagesJoinMsg));

        // 3. Get Online Status (Mimic browser)
        setTimeout(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            const statusRef = this.makeRef();
            const statusMsg = [
                pagesRef,
                statusRef,
                `multiple_pages:${this.userId}`,
                'get_online_status',
                {},
            ];
            this.ws.send(JSON.stringify(statusMsg));
        }, 1000);
    }

    handleMessage(msg) {
        const [joinRef, ref, topic, event, payload] = msg;

        // Watchdog: mọi message (kể cả phx_reply heartbeat) refresh activity timer.
        this.lastActivityAt = Date.now();

        // Debug: log all events (not just update_conversation)
        if (event !== 'phx_reply' && event !== 'heartbeat') {
            console.log(
                `[SERVER-WS][DEBUG] Event: ${event} | topic: ${topic} | payload keys: ${Object.keys(payload || {}).join(',')}`
            );
        }

        if (event === 'phx_reply') {
            if (payload.status !== 'ok') {
                console.error(
                    `[SERVER-WS][DEBUG] Channel reply ERROR: topic=${topic}, status=${payload.status}, response=`,
                    JSON.stringify(payload.response || {}).substring(0, 200)
                );
            }
        }

        if (event === 'pages:update_conversation') {
            const conversation = payload.conversation;
            const clientCount = wss?.clients?.size || 0;
            console.log(
                `[SERVER-WS] New Message/Comment: conv=${conversation.id}, page=${conversation.page_id}, type=${conversation.type}, from="${conversation.from?.name}", snippet="${(conversation.snippet || '').substring(0, 50)}", broadcasting to ${clientCount} clients`
            );

            // Broadcast to connected frontend clients
            broadcastToClients({
                type: 'pages:update_conversation',
                payload: payload,
            });

            // Save to PostgreSQL for later retrieval
            if (this.db && conversation) {
                const convType = conversation.type || 'INBOX';
                const updateData = {
                    conversationId: conversation.id,
                    type: convType,
                    snippet: conversation.snippet || conversation.last_message?.message,
                    unreadCount: conversation.unread_count || 0,
                    pageId:
                        conversation.page_id ||
                        (conversation.id ? conversation.id.split('_')[0] : null),
                    psid: conversation.from_psid || conversation.customers?.[0]?.fb_id,
                    customerName: conversation.from?.name || conversation.customers?.[0]?.name,
                };

                // (2026-06-14) Bỏ ghi realtime_updates (hệ event-log cũ, không
                // ai đọc — xem routes/realtime.js). pending_customers là nguồn
                // DUY NHẤT cho badge cột TIN NHẮN.

                // Upsert pending_customers CHỈ cho INBOX với unread_count > 0
                // VÀ shop chưa phải người gửi cuối.
                // - unread_count = 0 → shop đã đọc → DELETE (sync mọi user)
                // - last_sent_by.id === page_id (shop là người gửi cuối) → DELETE
                //   kể cả khi Pancake vẫn báo unread > 0. Pancake đôi khi delay
                //   clearing unread_count sau khi shop reply qua direct API
                //   (đặc biệt với auto bill-send). Owner repro 2026-05-11: KH
                //   Huỳnh Thành Đạt 0123456788 stale "2 MỚI" — Pancake live
                //   unread=0 + last_sent_by=page nhưng row pending_customers
                //   trên Render vẫn count=2, snippet là shop bill template.
                if (convType === 'INBOX') {
                    const unread = conversation.unread_count || 0;
                    const pageIdStr = String(updateData.pageId || '');
                    const lastSenderId = String(
                        conversation.last_sent_by?.id || conversation.last_message?.from?.id || ''
                    );
                    const shopSentLast =
                        !!lastSenderId && !!pageIdStr && lastSenderId === pageIdStr;

                    if (shopSentLast || unread === 0) {
                        if (updateData.psid && updateData.pageId) {
                            this.db
                                .query(
                                    `DELETE FROM pending_customers WHERE psid = $1 AND page_id = $2`,
                                    [updateData.psid, updateData.pageId]
                                )
                                .then((r) => {
                                    if (r.rowCount > 0) {
                                        console.log(
                                            `[SERVER-WS] Cleared pending for ${updateData.psid} (${shopSentLast ? 'shop sent last' : 'unread=0'})`
                                        );
                                    }
                                })
                                .catch((err) =>
                                    console.error(
                                        '[SERVER-WS] Failed to clear pending on read:',
                                        err.message
                                    )
                                );
                        }
                    } else if (unread > 0) {
                        upsertPendingCustomer(this.db, updateData).catch((err) =>
                            console.error('[SERVER-WS] Failed to upsert pending:', err.message)
                        );
                    }

                    // WEB2.0 — tin chưa đọc RIÊNG (web2_unread_messages, web2Db).
                    // Logic Web 2.0 thuần: authoritative theo unread_count + shop
                    // gửi cuối từ Pancake (KHÔNG bump, KHÔNG đọc Web 1.0). Auto-clear
                    // khi unread=0 (đã đọc trên Pancake) / shop trả lời. Best-effort.
                    const web2Db = app.locals.web2Db;
                    if (web2Db) {
                        web2UnreadTracker
                            .syncFromConversation(
                                web2Db,
                                { ...updateData, shopSentLast },
                                web2RealtimeSseRoutes.notifyClients
                            )
                            .catch((err) =>
                                console.error('[SERVER-WS] web2 unread sync failed:', err.message)
                            );

                        // WEB2.0 — detect keyword "CK XONG"/"ĐÃ CK" TỪ snippet của
                        // update_conversation (nguồn tin cậy như tab "Tin chưa đọc").
                        // pages:new_message đôi khi không fire / khác field → bỏ sót.
                        // CHỈ khi tin cuối là của KHÁCH (!shopSentLast). Dedup 10' trong
                        // detector chống trùng với nhánh new_message bên dưới.
                        if (!shopSentLast && updateData.snippet) {
                            web2SignalDetector
                                .handleIncoming(
                                    web2Db,
                                    {
                                        message: updateData.snippet,
                                        psid: updateData.psid,
                                        pageId: updateData.pageId,
                                        conversationId: updateData.conversationId,
                                        customerName: updateData.customerName,
                                    },
                                    web2RealtimeSseRoutes.notifyClients
                                )
                                // Chiều 2: signal mới → quét GD đã về khớp.
                                .then((sig) => {
                                    if (sig) web2CkWatcher.onNewSignal(web2Db, sig).catch(() => {});
                                })
                                .catch((err) =>
                                    console.error(
                                        '[SERVER-WS] paysig detect (conv) failed:',
                                        err.message
                                    )
                                );
                        }
                    }
                }
            }
        }

        // [INBOX-SPECIFIC] Forward new_message events for real-time chat update
        if (event === 'pages:new_message') {
            const msg = payload?.message || payload;
            const clientCount = wss?.clients?.size || 0;
            console.log(
                `[SERVER-WS] pages:new_message → conv=${msg?.conversation_id}, msg="${(msg?.message || '').substring(0, 50)}", broadcasting to ${clientCount} clients`
            );
            broadcastToClients({
                type: 'pages:new_message',
                payload: payload,
            });

            // Also save to pending_customers (only if message is FROM customer, not from page)
            if (this.db && msg) {
                const fromPsid = msg.from?.id;
                const pageId = msg.page_id || payload.page_id;
                if (fromPsid && pageId && String(fromPsid) !== String(pageId)) {
                    const updateData = {
                        conversationId: msg.conversation_id,
                        type: 'INBOX',
                        snippet: msg.message || msg.original_message || '',
                        pageId: pageId,
                        psid: fromPsid,
                        customerName: msg.from?.name,
                    };
                    upsertPendingCustomer(this.db, updateData).catch((err) =>
                        console.error('[SERVER-WS] Failed to upsert from new_message:', err.message)
                    );

                    // WEB2.0 — detect keyword "CK XONG"/"ĐÃ CK" (data Web 2.0 → web2Db).
                    // Detector tự match keyword trước, chỉ ghi khi khớp → không đụng
                    // luồng inbox. Best-effort, không block (catch nuốt mọi lỗi).
                    const web2Db = app.locals.web2Db;
                    const msgText = msg.message || msg.original_message || '';
                    if (web2Db && msgText) {
                        web2SignalDetector
                            .handleIncoming(
                                web2Db,
                                {
                                    message: msgText,
                                    psid: fromPsid,
                                    pageId: pageId,
                                    conversationId: msg.conversation_id,
                                    customerName: msg.from?.name,
                                },
                                web2RealtimeSseRoutes.notifyClients
                            )
                            // Chiều 2: signal "đã ck" mới → quét GD đã về khớp (tiền
                            // về TRƯỚC, KH nhắn SAU) → auto-confirm + cộng ví + reply.
                            .then((sig) => {
                                if (sig) web2CkWatcher.onNewSignal(web2Db, sig).catch(() => {});
                            })
                            .catch((err) =>
                                console.error('[SERVER-WS] paysig detect failed:', err.message)
                            );

                        // WEB2.0 — Intent khác (huỷ đơn/đổi địa chỉ/xem đơn/ship) →
                        // FLAG cho staff (notification), KHÔNG auto-execute.
                        web2SignalDetector
                            .handleIntent(
                                web2Db,
                                {
                                    message: msgText,
                                    psid: fromPsid,
                                    pageId: pageId,
                                    conversationId: msg.conversation_id,
                                    customerName: msg.from?.name,
                                },
                                web2RealtimeSseRoutes.notifyClients,
                                (data) => web2NotificationsRoutes.createNotification(web2Db, data)
                            )
                            .catch((err) =>
                                console.error('[SERVER-WS] intent detect failed:', err.message)
                            );

                        // Tin chưa đọc KHÔNG xử lý ở new_message — đi hoàn toàn theo
                        // pages:update_conversation (authoritative unread_count) để
                        // không drift. new_message chỉ dùng cho keyword detector.
                    }
                }
            }
        }
    }
}

// =====================================================
// TPOS REALTIME CLIENT (Socket.IO Protocol)
// =====================================================

class TposRealtimeClient {
    constructor() {
        this.ws = null;
        // Use rt-2.tpos.app with room parameter (from browser DevTools analysis)
        this.baseUrl = 'wss://rt-2.tpos.app/socket.io/';
        this.isConnected = false;
        this.heartbeatInterval = null;
        this.reconnectTimer = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 10;

        // Server-provided timing (will be updated from transport info)
        this.pingInterval = 25000; // Default 25s
        this.pingTimeout = 20000; // Default 20s

        // Last activity tracking
        this.lastPingTime = null;

        // TPOS specific data
        this.token = null;
        this.room = 'tomato.tpos.vn';
    }

    getWebSocketUrl() {
        // Build URL with room parameter like browser does
        return `${this.baseUrl}?room=${encodeURIComponent(this.room)}&EIO=4&transport=websocket`;
    }

    start(token, room = 'tomato.tpos.vn') {
        this.token = token;
        this.room = room;
        this.reconnectAttempts = 0;
        this.connect();
    }

    connect() {
        if (this.isConnected || !this.token) return;

        console.log('[TPOS-WS] Connecting to TPOS... (attempt', this.reconnectAttempts + 1, ')');

        // Build URL with room parameter
        const wsUrl = this.getWebSocketUrl();
        console.log('[TPOS-WS] Connection URL:', wsUrl.replace(/token=[^&]+/, 'token=***'));

        const headers = {
            Origin: 'https://tomato.tpos.vn',
            Authorization: `Bearer ${this.token}`,
            'User-Agent':
                'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9,vi;q=0.8',
            'Cache-Control': 'no-cache',
            Pragma: 'no-cache',
        };

        this.ws = new WebSocket(wsUrl, {
            headers: headers,
        });

        this.ws.on('open', () => {
            console.log('[TPOS-WS] ✅ WebSocket connected, sending handshake...');
            this.reconnectAttempts = 0; // Reset on successful connect

            // Socket.IO namespace connect with auth (TPOS requires token+room in namespace connect)
            const authPayload = JSON.stringify({ token: this.token, room: this.room });
            const namespaceMsg = `40/chatomni,${authPayload}`;
            this.ws.send(namespaceMsg);
            console.log('[TPOS-WS] 📤 Sent namespace connect with auth (room:', this.room, ')');
        });

        this.ws.on('close', (code, reason) => {
            const reasonText = reason?.toString() || 'No reason provided';
            console.log(`[TPOS-WS] Closed - Code: ${code}, Reason: ${reasonText}`);

            // Log close code meanings for debugging
            const closeReasons = {
                1000: 'Normal Closure',
                1001: 'Going Away (server/browser closing)',
                1002: 'Protocol Error',
                1003: 'Unsupported Data',
                1005: 'No Status Received (abnormal closure)',
                1006: 'Abnormal Closure (no close frame)',
                1007: 'Invalid Frame Payload Data',
                1008: 'Policy Violation',
                1009: 'Message Too Big',
                1010: 'Mandatory Extension Missing',
                1011: 'Internal Server Error',
                1015: 'TLS Handshake Failed',
            };
            console.log(`[TPOS-WS] Close reason: ${closeReasons[code] || 'Unknown'}`);

            this.isConnected = false;
            this.stopHeartbeat();

            // Exponential backoff reconnect: 2s, 4s, 8s, 16s, 32s (max 60s)
            if (this.reconnectAttempts < this.maxReconnectAttempts) {
                const delay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 60000);
                this.reconnectAttempts++;
                console.log(
                    `[TPOS-WS] Reconnecting in ${delay / 1000}s... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts})`
                );
                clearTimeout(this.reconnectTimer);
                this.reconnectTimer = setTimeout(() => this.connect(), delay);
            } else {
                console.error(
                    '[TPOS-WS] ❌ Max reconnect attempts reached. Stopping reconnection.'
                );
            }
        });

        this.ws.on('error', (err) => {
            console.error('[TPOS-WS] Error:', err.message);
        });

        this.ws.on('message', (data) => {
            const message = data.toString();
            // Log all raw messages for debugging (can comment out after troubleshooting)
            if (!message.startsWith('2') && !message.startsWith('3')) {
                console.log('[TPOS-WS] 📥 Raw message:', message.substring(0, 200)); // Truncate long messages
            }
            // Log raw messages to event logger (skip ping/pong)
            if (tposEventLog.isLogging && !message.startsWith('2') && !message.startsWith('3')) {
                tposEventLog.log({ type: 'raw-ws', message: message.substring(0, 2000) });
            }
            this.handleMessage(message);
        });
    }

    handleMessage(data) {
        // Socket.IO protocol messages
        if (data === '2') {
            // Ping from TPOS server, respond with pong immediately
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send('3');
            }
            this.lastPingTime = Date.now();
            return;
        }

        if (data === '3') {
            // Pong response (not expected since we don't send pings, but handle gracefully)
            this.lastPingTime = Date.now();
            return;
        }

        if (data.startsWith('0{')) {
            // Transport info (sid, upgrades, pingInterval, pingTimeout, etc.)
            try {
                const info = JSON.parse(data.substring(1));
                console.log('[TPOS-WS] Received transport info:', JSON.stringify(info));

                // Update timing from server
                if (info.pingInterval) {
                    this.pingInterval = info.pingInterval;
                }
                if (info.pingTimeout) {
                    this.pingTimeout = info.pingTimeout;
                }
                console.log(
                    `[TPOS-WS] Server timing: pingInterval=${this.pingInterval}ms, pingTimeout=${this.pingTimeout}ms`
                );
            } catch (e) {
                console.log('[TPOS-WS] Received transport info (parse failed)');
            }
            return;
        }

        if (data.startsWith('40/chatomni,')) {
            // Namespace connected, now join room
            console.log('[TPOS-WS] ✅ Namespace connected successfully');
            console.log('[TPOS-WS] Joining room:', this.room);
            this.isConnected = true;
            this.joinRoom();
            this.startHeartbeat();
            return;
        }

        if (data.startsWith('42/chatomni,')) {
            // Event message
            const jsonStr = data.substring('42/chatomni,'.length);
            try {
                const [eventName, payload] = JSON.parse(jsonStr);
                this.handleEvent(eventName, payload);
            } catch (e) {
                console.error('[TPOS-WS] Parse error:', e);
            }
        }
    }

    handleEvent(eventName, payload) {
        console.log('[TPOS-WS] 📨 Event received:', eventName);

        // Handle join response
        if (eventName === 'join') {
            console.log('[TPOS-WS] ✅ Join room response:', JSON.stringify(payload));
        }

        // Handle authentication errors
        if (eventName === 'error' || eventName === 'unauthorized') {
            console.error('[TPOS-WS] ❌ Authentication/Error event:', JSON.stringify(payload));
        }

        // Handle 'on-events' - main TPOS realtime events
        // Only SaleOnline_Order is forwarded to clients. chatomni.on-message,
        // FastSaleOrder, Product, ProductInventory etc. are intentionally
        // ignored to keep WS bandwidth lean.
        if (eventName === 'on-events') {
            try {
                const eventData = typeof payload === 'string' ? JSON.parse(payload) : payload;
                const data = eventData.d || eventData.data || eventData;
                const eventType =
                    data.t ||
                    data.Type ||
                    data.EventName ||
                    eventData.EventName ||
                    eventData.type ||
                    eventData.Type;

                const eventAction =
                    data.EventName || eventData.EventName || data.action || eventData.action;
                const msgPreview = (data.Message || data.message || '').substring(0, 80);

                // Handle SaleOnline_Order — order created/updated
                if (eventType === 'SaleOnline_Order') {
                    console.log(
                        '[TPOS-WS] 🔥 ORDER',
                        (eventAction || '').toUpperCase() + ':',
                        msgPreview
                    );
                    broadcastToClients({
                        type: eventAction === 'updated' ? 'tpos:order-update' : 'tpos:new-order',
                        data: data,
                    });
                    // Save to buffer for catch-up polling (fire-and-forget)
                    saveOrderToBuffer(chatDbPool, data).catch(() => {});
                    return;
                }

                // Handle FastSaleOrder — broadcast MỌI action (created/updated/cancelled/deleted/...)
                // để cập nhật cột Phiếu bán hàng. Trước đây chỉ filter created|updated → khi user
                // hủy phiếu (action `cancelled`/`canceled`/`deleted`) bị nuốt → web không update.
                // Client tab1-tpos-realtime.js tự fetch lại OData để lấy ShowState mới.
                if (eventType === 'FastSaleOrder') {
                    console.log(
                        '[TPOS-WS] 📄 INVOICE',
                        (eventAction || 'unknown').toUpperCase() + ':',
                        msgPreview
                    );
                    broadcastToClients({
                        type: 'tpos:invoice-update',
                        action: eventAction || 'unknown',
                        data: data,
                    });
                    return;
                }

                // Everything else (Product, ProductInventory, etc.) is dropped
            } catch (e) {
                console.error('[TPOS-WS] Error parsing on-events payload:', e.message);
            }
        }
    }

    joinRoom() {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            console.log('[TPOS-WS] ⚠️ Cannot join room - WebSocket not ready');
            return;
        }

        const joinMessage = `42/chatomni,["join",{"room":"${this.room}","token":"${this.token ? '***' : 'MISSING'}"}]`;
        this.ws.send(`42/chatomni,["join",{"room":"${this.room}","token":"${this.token}"}]`);
        console.log('[TPOS-WS] 📤 Sent join request:', joinMessage);
    }

    startHeartbeat() {
        this.stopHeartbeat();

        // Engine.IO protocol: SERVER sends ping ('2'), CLIENT responds pong ('3').
        // We must NOT send '2' to the server — that causes TPOS to close the connection.
        // Instead, monitor that we receive pings from TPOS at the expected interval.
        // If no ping received within (pingInterval + pingTimeout), connection is dead.
        const checkMs = this.pingInterval + this.pingTimeout;

        console.log(
            `[TPOS-WS] ❤️ Starting heartbeat monitor (expect ping every ${this.pingInterval}ms, timeout ${checkMs}ms)`
        );

        this.heartbeatInterval = setInterval(() => {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                const timeSinceLastPing = Date.now() - (this.lastPingTime || Date.now());
                if (this.lastPingTime && timeSinceLastPing > checkMs) {
                    console.error(
                        `[TPOS-WS] ⚠️ No ping from TPOS for ${timeSinceLastPing}ms (timeout: ${checkMs}ms)`
                    );
                    console.log('[TPOS-WS] Connection appears dead, forcing reconnect...');
                    this.ws.close();
                    return;
                }
            }
        }, checkMs);
    }

    stopHeartbeat() {
        if (this.heartbeatInterval) {
            clearInterval(this.heartbeatInterval);
            this.heartbeatInterval = null;
        }
    }

    stop() {
        this.stopHeartbeat();
        clearTimeout(this.reconnectTimer);
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
        this.isConnected = false;
        this.reconnectAttempts = 0;
        console.log('[TPOS-WS] Stopped');
    }

    getStatus() {
        return {
            connected: this.isConnected,
            room: this.room,
            hasToken: !!this.token,
            reconnectAttempts: this.reconnectAttempts,
            pingInterval: this.pingInterval,
            pingTimeout: this.pingTimeout,
            lastPingFromTPOS: this.lastPingTime,
        };
    }
}

// Initialize Global TPOS Client
const tposRealtimeClient = new TposRealtimeClient();

// =====================================================
// TPOS WS WATCHDOG — auto-detect dead socket, refresh token, reconnect
// =====================================================
// Vấn đề: TPOS thỉnh thoảng silent half-close socket (WS readyState vẫn OPEN
// nhưng không gửi ping nữa, không nhận event nữa) → orders-report mất realtime.
// Giải pháp: mỗi 60s check status; nếu !connected hoặc lastPing > 90s thì
// force refresh token (TPOS_USERNAME/PASSWORD env vars) và restart client.
const TPOS_WATCHDOG_INTERVAL_MS = 60_000;
const TPOS_DEAD_THRESHOLD_MS = 90_000;
let tposWatchdogRunning = false;

setInterval(async () => {
    if (WEB2_ONLY) return; // Web 1.0 only — web2-api không giám sát TPOS WS
    if (tposWatchdogRunning) return; // tránh chạy chồng nếu cycle trước chưa xong
    const status = tposRealtimeClient.getStatus();
    const now = Date.now();
    const sinceLastPing = status.lastPingFromTPOS ? now - status.lastPingFromTPOS : Infinity;

    // Chỉ watchdog nếu client đã từng start (có token). Nếu chưa start thì skip.
    if (!status.hasToken) return;

    const isDead =
        !status.connected || (status.lastPingFromTPOS && sinceLastPing > TPOS_DEAD_THRESHOLD_MS);

    if (!isDead) return;

    tposWatchdogRunning = true;
    console.warn(
        '[TPOS-WATCHDOG] ⚠️ Dead socket detected — connected:',
        status.connected,
        '| sinceLastPing:',
        sinceLastPing === Infinity ? 'never' : `${sinceLastPing}ms`,
        '| auto-restarting…'
    );

    try {
        // Force fresh token (sẽ throw nếu env vars thiếu)
        await tposTokenManager.refresh();
        const newToken = await tposTokenManager.getToken();

        // Stop old client (close ws, clear timers), wait nhỏ rồi start lại
        tposRealtimeClient.stop();
        await new Promise((r) => setTimeout(r, 1500));
        tposRealtimeClient.start(newToken, status.room || 'tomato.tpos.vn');

        // Persist token mới để auto-reconnect khi server restart
        await saveRealtimeCredentials(chatDbPool, 'tpos', {
            token: newToken,
            room: status.room || 'tomato.tpos.vn',
        }).catch((e) => console.warn('[TPOS-WATCHDOG] save credentials warn:', e.message));

        console.log('[TPOS-WATCHDOG] ✅ Restarted with fresh token');
    } catch (e) {
        console.error('[TPOS-WATCHDOG] ❌ Auto-restart failed:', e.message);
    } finally {
        tposWatchdogRunning = false;
    }
}, TPOS_WATCHDOG_INTERVAL_MS);
console.log(
    `[TPOS-WATCHDOG] Active — checks every ${TPOS_WATCHDOG_INTERVAL_MS / 1000}s, dead threshold ${TPOS_DEAD_THRESHOLD_MS / 1000}s`
);

// =====================================================
// INVOICE STATE POLLING — fallback cho event TPOS không emit
// =====================================================
// TPOS chatomni socket KHÔNG emit FastSaleOrder.cancelled khi user click
// "Hủy phiếu bán hàng" trên TPOS UI. Verified bằng 2-tab live test:
// 35 phút log chỉ thấy actions `created` và `fast_sale_order_payment`,
// không có `cancelled`/`deleted`/`updated` cho bất kỳ invoice nào.
// Giải pháp: poll TPOS OData mỗi 60s lấy invoices recent, diff State với
// cache local, broadcast `tpos:invoice-update` cho mọi state change → web
// realtime cập nhật cancel/state đổi mà không cần TPOS event.
const https = require('https');
const TPOS_ODATA_BASE_POLL = 'https://tomato.tpos.vn/odata';
const tposPollHttpsAgent = new https.Agent({ rejectUnauthorized: false });
const INVOICE_POLL_INTERVAL_MS = 60_000;
// TPOS OData GetView IGNORE filter `WriteDate ge X` (verified empty result),
// `Id eq X` (verified random record), `State eq 'cancel'` (verified empty).
// CHỈ filter `DateInvoice ge X` hoạt động → lookback theo ngày TẠO phiếu.
// Lookback 60 phút cover phiếu vừa tạo + bị cancel ngay sau (user thường
// hủy phiếu mới trong vòng vài phút). Phiếu cũ hơn 60 phút bị hủy sẽ KHÔNG
// detect realtime — cần refresh manual hoặc tăng lookback (cost: thêm load).
const INVOICE_POLL_LOOKBACK_MIN = 60;
const INVOICE_POLL_TOP = 100;
const recentInvoiceState = new Map(); // invoiceId -> { stateKey, ts }
let invoicePollColdStart = true; // lần đầu chỉ populate cache, không broadcast
let invoicePollRunning = false;

setInterval(async () => {
    if (WEB2_ONLY) return; // Web 1.0 only — web2-api không poll invoice TPOS
    if (invoicePollRunning) return;
    invoicePollRunning = true;
    try {
        const token = await tposTokenManager.getToken().catch(() => null);
        if (!token) return;
        const since = new Date(Date.now() - INVOICE_POLL_LOOKBACK_MIN * 60_000).toISOString();
        const filter = `DateInvoice ge ${since}`;
        const url =
            `${TPOS_ODATA_BASE_POLL}/FastSaleOrder/ODataService.GetView` +
            `?$top=${INVOICE_POLL_TOP}&$orderby=DateInvoice desc` +
            `&$filter=${encodeURIComponent(filter)}`;
        const resp = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
            agent: tposPollHttpsAgent,
        });
        if (!resp.ok) return;
        const result = await resp.json();
        const invoices = Array.isArray(result?.value) ? result.value : [];

        let broadcasted = 0;
        const currentIds = new Set();
        for (const inv of invoices) {
            if (!inv.Id) continue;
            currentIds.add(inv.Id);
            const stateKey = `${inv.State || ''}|${inv.ShowState || ''}`;
            const cached = recentInvoiceState.get(inv.Id);
            if (!invoicePollColdStart && (!cached || cached.stateKey !== stateKey)) {
                // Broadcast lean payload giống event TPOS thật → client logic
                // (tab1-tpos-realtime.js handleInvoiceUpdate) handle đã có sẵn:
                // fetch by Id qua single-key endpoint, update InvoiceStatusStore.
                broadcastToClients({
                    type: 'tpos:invoice-update',
                    action: 'polled-state-change',
                    data: {
                        Id: inv.Id,
                        Number: inv.Number,
                        Reference: inv.Reference,
                        State: inv.State,
                        ShowState: inv.ShowState,
                        Order: { Id: inv.Id, Code: inv.Number },
                    },
                });
                broadcasted++;
                console.log(
                    '[INVOICE-POLL] State change:',
                    inv.Number || `Id=${inv.Id}`,
                    cached?.stateKey || '(new)',
                    '→',
                    stateKey
                );
            }
            recentInvoiceState.set(inv.Id, {
                stateKey,
                ts: Date.now(),
                lastSeenInPoll: Date.now(),
            });
        }
        if (invoicePollColdStart) {
            console.log(
                `[INVOICE-POLL] Cold start populated ${invoices.length} invoices, polling armed`
            );
            invoicePollColdStart = false;
        }

        // DELETE DETECTION: entries vừa thấy trong cache (< 2 cycles ago) NHƯNG
        // không xuất hiện trong current poll result → suspect deleted khỏi TPOS.
        // Verify bằng single-key endpoint /FastSaleOrder({id}) — 404 = confirmed deleted.
        // Broadcast `polled-deleted` để client cleanup InvoiceStatusStore + DB.
        if (!invoicePollColdStart) {
            const deleteCutoff = Date.now() - 2 * INVOICE_POLL_INTERVAL_MS; // 120s
            const candidatesDeleted = [];
            for (const [id, v] of recentInvoiceState) {
                if (currentIds.has(id)) continue;
                if (v.lastSeenInPoll && v.lastSeenInPoll > deleteCutoff) {
                    candidatesDeleted.push(id);
                }
            }
            for (const id of candidatesDeleted) {
                try {
                    const verifyResp = await fetch(`${TPOS_ODATA_BASE_POLL}/FastSaleOrder(${id})`, {
                        headers: {
                            Authorization: `Bearer ${token}`,
                            accept: 'application/json',
                        },
                        agent: tposPollHttpsAgent,
                    });
                    if (verifyResp.status === 404) {
                        console.log('[INVOICE-POLL] DELETE detected: Id', id);
                        broadcastToClients({
                            type: 'tpos:invoice-update',
                            action: 'polled-deleted',
                            data: { Id: id },
                        });
                        broadcasted++;
                        recentInvoiceState.delete(id);
                    } else if (verifyResp.ok) {
                        // Vẫn tồn tại nhưng ra ngoài DateInvoice lookback — refresh lastSeen
                        recentInvoiceState.set(id, { ...v, lastSeenInPoll: Date.now() });
                    }
                } catch (e) {
                    // network error — skip, retry next cycle
                }
            }
        }
        // Cleanup cache > 30 phút (tránh memory leak)
        const cutoff = Date.now() - 30 * 60_000;
        for (const [id, v] of recentInvoiceState) {
            if (v.ts < cutoff) recentInvoiceState.delete(id);
        }
        if (broadcasted > 0) {
            console.log(`[INVOICE-POLL] Broadcasted ${broadcasted} state-change events`);
        }
    } catch (e) {
        console.warn('[INVOICE-POLL] error:', e.message);
    } finally {
        invoicePollRunning = false;
    }
}, INVOICE_POLL_INTERVAL_MS);
console.log(
    `[INVOICE-POLL] Active — every ${INVOICE_POLL_INTERVAL_MS / 1000}s, lookback ${INVOICE_POLL_LOOKBACK_MIN}min, top ${INVOICE_POLL_TOP}`
);

// =====================================================
// INVOICE STATE — STALE CHECK (long-tail)
// =====================================================
// Vấn đề: 60-min lookback poll ở trên KHÔNG cover invoice cũ hơn (vd user
// hủy phiếu 4 ngày tuổi → state changed → poll không thấy → InvoiceStatusStore
// các client stale "Đã xác nhận" trong khi TPOS đã "Huỷ bỏ").
//
// Fix: chu kỳ 5 phút quét DB invoice_status entries gần đây (≤ 7 ngày, state
// còn-mutable), batch fetch TPOS by Reference (chunk 20), diff State/ShowState
// với DB → broadcast `tpos:invoice-update` action='polled-stale-change'.
const INVOICE_STALE_CHECK_INTERVAL_MS = 5 * 60_000;
const INVOICE_STALE_LOOKBACK_DAYS = 7;
const INVOICE_STALE_BATCH = 20; // TPOS OData GetView limit ~20 OR clauses
const INVOICE_STALE_MAX_PER_CYCLE = 200; // cap để không quá tải
let invoiceStaleRunning = false;

setInterval(async () => {
    if (WEB2_ONLY) return; // Web 1.0 only — web2-api không check invoice stale
    if (invoiceStaleRunning) return;
    invoiceStaleRunning = true;
    try {
        if (!chatDbPool) return;
        // Chỉ check entries chưa final — paid/cancel/done tránh waste API.
        // Sort updated_at ASC NULLS FIRST: rotate cũ nhất trước, mỗi cycle pick
        // 200 entry chưa check lâu nhất → đảm bảo phủ toàn bộ pool sau N cycles.
        // Trước đây DESC by entry_timestamp → luôn lặp 200 entry mới nhất,
        // entry cũ rank > 200 không bao giờ được check (vd 63983 day 3 ranked > 200).
        const sinceMs = Date.now() - INVOICE_STALE_LOOKBACK_DAYS * 86400_000;
        const { rows: entries } = await chatDbPool.query(
            `SELECT compound_key, sale_online_id, tpos_id, reference, state, show_state
               FROM invoice_status
              WHERE tpos_id IS NOT NULL
                AND reference IS NOT NULL
                AND entry_timestamp >= $1
                AND (state IS NULL OR state NOT IN ('cancel','paid','done'))
              ORDER BY updated_at ASC NULLS FIRST
              LIMIT $2`,
            [sinceMs, INVOICE_STALE_MAX_PER_CYCLE]
        );
        if (entries.length === 0) {
            invoiceStaleRunning = false;
            return;
        }

        const token = await tposTokenManager.getToken().catch(() => null);
        if (!token) {
            invoiceStaleRunning = false;
            return;
        }

        // Group by Reference (Order.Code) — TPOS OData chỉ accept Reference filter.
        // 1 reference có thể có N invoices → match lại theo tpos_id.
        const tposIdMap = new Map(); // tpos_id → entry
        const referenceSet = new Set();
        for (const e of entries) {
            tposIdMap.set(e.tpos_id, e);
            if (e.reference) referenceSet.add(e.reference);
        }
        const references = Array.from(referenceSet);

        let broadcasted = 0;
        let checked = 0;
        for (let i = 0; i < references.length; i += INVOICE_STALE_BATCH) {
            const chunk = references.slice(i, i + INVOICE_STALE_BATCH);
            const orFilter = chunk
                .map((r) => `Reference eq '${String(r).replace(/'/g, "''")}'`)
                .join(' or ');
            const filter = `(Type eq 'invoice' and (${orFilter}))`;
            const url =
                `${TPOS_ODATA_BASE_POLL}/FastSaleOrder/ODataService.GetView` +
                `?$top=500&$filter=${encodeURIComponent(filter)}`;
            try {
                const resp = await fetch(url, {
                    headers: { Authorization: `Bearer ${token}`, accept: 'application/json' },
                    agent: tposPollHttpsAgent,
                });
                if (!resp.ok) continue;
                const result = await resp.json();
                const invoices = Array.isArray(result?.value) ? result.value : [];
                for (const inv of invoices) {
                    const cached = tposIdMap.get(inv.Id);
                    if (!cached) continue;
                    checked++;
                    const newKey = `${inv.State || ''}|${inv.ShowState || ''}`;
                    const oldKey = `${cached.state || ''}|${cached.show_state || ''}`;
                    if (newKey === oldKey) continue;
                    // State changed — broadcast giống event TPOS thật.
                    broadcastToClients({
                        type: 'tpos:invoice-update',
                        action: 'polled-stale-change',
                        data: {
                            Id: inv.Id,
                            Number: inv.Number,
                            Reference: inv.Reference,
                            State: inv.State,
                            ShowState: inv.ShowState,
                            Order: { Id: inv.Id, Code: inv.Number },
                        },
                    });
                    // Cập nhật seed cache để 60s poll cũng nhận state mới.
                    recentInvoiceState.set(inv.Id, {
                        stateKey: newKey,
                        ts: Date.now(),
                        lastSeenInPoll: Date.now(),
                    });
                    // Cập nhật DB ngay để chu kỳ stale-check tiếp theo không re-broadcast.
                    try {
                        await chatDbPool.query(
                            `UPDATE invoice_status
                                SET state = $1, show_state = $2, state_code = $3,
                                    is_merge_cancel = $4, updated_at = CURRENT_TIMESTAMP
                              WHERE tpos_id = $5`,
                            [
                                inv.State || null,
                                inv.ShowState || null,
                                inv.StateCode || null,
                                inv.IsMergeCancel === true,
                                inv.Id,
                            ]
                        );
                    } catch (dbErr) {
                        console.warn('[INVOICE-STALE] DB update failed:', inv.Id, dbErr.message);
                    }
                    broadcasted++;
                    console.log(
                        '[INVOICE-STALE] State change:',
                        inv.Number || `Id=${inv.Id}`,
                        oldKey,
                        '→',
                        newKey
                    );
                }
            } catch (e) {
                // network error — skip, retry next cycle
            }
        }
        if (broadcasted > 0 || checked > 0) {
            console.log(
                `[INVOICE-STALE] Cycle done — checked ${checked}/${entries.length}, broadcasted ${broadcasted}`
            );
        }
    } catch (e) {
        console.warn('[INVOICE-STALE] error:', e.message);
    } finally {
        invoiceStaleRunning = false;
    }
}, INVOICE_STALE_CHECK_INTERVAL_MS);
console.log(
    `[INVOICE-STALE] Active — every ${INVOICE_STALE_CHECK_INTERVAL_MS / 1000}s, lookback ${INVOICE_STALE_LOOKBACK_DAYS}d, max ${INVOICE_STALE_MAX_PER_CYCLE}/cycle`
);

// Initialize Global Client with DB connection
const realtimeClient = new RealtimeClient();
realtimeClient.setDb(chatDbPool); // Pass PostgreSQL pool for saving updates

// (2026-06-14) Cột `phone` cho pending_customers — để match badge cột TIN NHẮN
// theo SĐT (fallback khi PSID TPOS lệch PSID Pancake: đơn comment/livestream,
// khác page). Idempotent, chạy 1 lần lúc boot (không có migration runner riêng).
chatDbPool
    .query('ALTER TABLE IF EXISTS pending_customers ADD COLUMN IF NOT EXISTS phone VARCHAR(20)')
    .then(() => console.log('[SCHEMA] pending_customers.phone ensured'))
    .catch((e) => console.warn('[SCHEMA] ensure pending_customers.phone failed:', e.message));

// (2026-06-16) Bảng `checked_customers` — đánh dấu KH "đã kiểm tra/đã bán" theo
// CHIẾN DỊCH → loại khỏi thanh "Khách chưa trả lời" (kể cả khi có tin mới), đồng
// bộ mọi máy. Idempotent, chạy lúc boot.
chatDbPool
    .query(
        `CREATE TABLE IF NOT EXISTS checked_customers (
            id SERIAL PRIMARY KEY,
            campaign_key VARCHAR(120) NOT NULL,
            psid VARCHAR(50) NOT NULL,
            page_id VARCHAR(50),
            checked_by VARCHAR(120),
            checked_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(campaign_key, psid)
        );
        CREATE INDEX IF NOT EXISTS idx_checked_customers_campaign ON checked_customers(campaign_key);`
    )
    .then(() => console.log('[SCHEMA] checked_customers ensured'))
    .catch((e) => console.warn('[SCHEMA] ensure checked_customers failed:', e.message));

// API to start the Pancake client from the browser
app.post('/api/realtime/start', async (req, res) => {
    // Defense-in-depth: Pancake WS realtime là Web 1.0 (chatDb). web2-api
    // (WEB2_ONLY=1) KHÔNG được chạy client này. Cloudflare đã route path này về
    // n2store-fallback; guard này phòng gọi thẳng origin / routing lỗi.
    if (WEB2_ONLY) {
        return res.status(403).json({
            error: 'Not available on web2-api — Web 1.0 realtime runs on n2store-fallback',
        });
    }
    const { token, userId, pageIds, cookie } = req.body;
    if (!token || !userId || !pageIds) {
        return res.status(400).json({ error: 'Missing parameters' });
    }
    if (!Array.isArray(pageIds) || pageIds.length === 0) {
        return res.status(400).json({ error: 'pageIds must be a non-empty array' });
    }

    realtimeClient.start(token, userId, pageIds, cookie);

    // Save credentials for auto-reconnect on server restart. Nếu lưu FAIL, WS
    // vẫn chạy NHƯNG sẽ không auto-reconnect sau restart → trả cờ cảnh báo rõ
    // (trước đây nuốt lỗi + trả success:true → cột tin nhắn chết im sau deploy).
    const credsSaved = await saveRealtimeCredentials(chatDbPool, 'pancake', {
        token,
        userId,
        pageIds,
        cookie,
    });

    // Also cache in auth_token_cache so /api/auth/token/pancake can serve all clients
    try {
        let expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000); // default 7 days
        try {
            const payload = JSON.parse(
                Buffer.from(token.split('.')[1], 'base64url').toString('utf8')
            );
            if (payload.exp) expiresAt = new Date(payload.exp * 1000);
        } catch (_) {
            /* use default */
        }

        await chatDbPool.query(
            `
            INSERT INTO auth_token_cache (provider, token, refresh_token, expires_at, metadata, updated_at)
            VALUES ('pancake', $1, NULL, $2, $3, NOW())
            ON CONFLICT (provider) DO UPDATE SET
                token = EXCLUDED.token,
                expires_at = EXCLUDED.expires_at,
                metadata = EXCLUDED.metadata,
                updated_at = NOW()
        `,
            [token, expiresAt, JSON.stringify({ userId, provider: 'pancake' })]
        );
        console.log(
            `[AUTH-STORE] ✅ Pancake token cached in auth_token_cache (expires ${expiresAt.toISOString()})`
        );
    } catch (e) {
        console.warn('[AUTH-STORE] Failed to cache pancake token:', e.message);
    }

    res.json({
        success: true,
        credentialsSaved: credsSaved !== false,
        message:
            credsSaved !== false
                ? 'Realtime client started on server (credentials saved for auto-reconnect)'
                : 'Realtime client started BUT credentials NOT saved — auto-reconnect after restart may fail (check DB)',
    });
});

// API to start the TPOS client from the browser
app.post('/api/realtime/tpos/start', async (req, res) => {
    const { token, room } = req.body;
    if (!token) {
        return res.status(400).json({ error: 'Missing token' });
    }

    tposRealtimeClient.start(token, room || 'tomato.tpos.vn');

    // Save credentials for auto-reconnect on server restart
    await saveRealtimeCredentials(chatDbPool, 'tpos', { token, room: room || 'tomato.tpos.vn' });

    res.json({
        success: true,
        message: 'TPOS Realtime client started on server (credentials saved for auto-reconnect)',
    });
});

// API to get saved Pancake credentials from DB (for frontends to load token)
app.get('/api/realtime/credentials/pancake', async (req, res) => {
    try {
        const r = await chatDbPool.query(
            `SELECT token, user_id, page_ids, cookie, is_active, updated_at
             FROM realtime_credentials WHERE client_type = 'pancake' LIMIT 1`
        );
        if (r.rows.length === 0) return res.json({ found: false });
        const row = r.rows[0];
        let pageIds = [];
        try {
            pageIds = row.page_ids ? JSON.parse(row.page_ids) : [];
        } catch (_) {}
        res.json({
            found: true,
            token: row.token,
            userId: row.user_id,
            pageIds,
            cookie: row.cookie || null,
            isActive: row.is_active,
            updatedAt: row.updated_at,
        });
    } catch (e) {
        console.error('[CREDENTIALS] GET pancake error:', e.message);
        res.status(500).json({ error: e.message });
    }
});

// API to get Pancake client status
app.get('/api/realtime/status', (req, res) => {
    res.json({
        connected: realtimeClient.isConnected,
        hasToken: !!realtimeClient.token,
        userId: realtimeClient.userId,
        pageCount: realtimeClient.pageIds?.length || 0,
        pageIds: realtimeClient.pageIds || [],
        wsState: realtimeClient.ws ? realtimeClient.ws.readyState : null,
        reconnectAttempts: realtimeClient.reconnectAttempts,
        connectedClients: wss?.clients?.size || 0,
        serverUptime: Math.round(process.uptime()),
    });
});

// API to stop Pancake client and disable auto-connect
app.post('/api/realtime/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(
            `UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'pancake'`
        );
    } catch (e) {
        /* ignore */
    }

    // Close WebSocket if connected
    if (realtimeClient.ws) {
        realtimeClient.ws.close();
        realtimeClient.ws = null;
    }
    realtimeClient.isConnected = false;
    realtimeClient.token = null;

    res.json({ success: true, message: 'Pancake Realtime client stopped (auto-connect disabled)' });
});

// API to stop the TPOS client
app.post('/api/realtime/tpos/stop', async (req, res) => {
    // Disable auto-connect in database
    try {
        await chatDbPool.query(
            `UPDATE realtime_credentials SET is_active = FALSE WHERE client_type = 'tpos'`
        );
    } catch (e) {
        /* ignore */
    }

    tposRealtimeClient.stop();
    res.json({ success: true, message: 'TPOS Realtime client stopped (auto-connect disabled)' });
});

// API to get TPOS client status
app.get('/api/realtime/tpos/status', (req, res) => {
    res.json({
        ...tposRealtimeClient.getStatus(),
        wsReadyState: tposRealtimeClient.ws ? tposRealtimeClient.ws.readyState : null,
        wsReadyStateLabel: tposRealtimeClient.ws
            ? ['CONNECTING', 'OPEN', 'CLOSING', 'CLOSED'][tposRealtimeClient.ws.readyState]
            : 'NO_WS',
    });
});

// Root route
app.get('/', (req, res) => {
    res.json({
        name: 'N2Store API Fallback Server',
        version: '2.0.0',
        description: 'Backup server for Cloudflare Worker - Full API compatibility',
        endpoints: {
            core: [
                'POST /api/token - TPOS Token with caching',
                'GET /api/odata/* - TPOS OData proxy',
                'GET /api/rest/* - TPOS REST API v2.0',
            ],
            pancake: [
                'GET /api/pancake/* - Pancake API proxy',
                'ALL /api/pancake-direct/* - Pancake 24h bypass',
                'ALL /api/pancake-official/* - pages.fm Public API',
            ],
            facebook: [
                'POST /api/facebook-send - Send message with tag',
                'GET /api/fb-avatar - Facebook/Pancake avatar',
                'GET /api/pancake-avatar - Pancake content avatar',
            ],
            media: ['GET /api/image-proxy - Image proxy bypass CORS'],
            utility: [
                'GET /api/proxy - Generic proxy',
                'GET /api/customers/* - Customers API (PostgreSQL)',
                'POST /api/sepay/* - SePay webhook & balance',
            ],
            realtime: [
                'POST /api/realtime/start - Start Pancake WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/stop - Stop Pancake WebSocket (disables auto-reconnect)',
                'GET /api/realtime/status - Get Pancake client status',
                'GET /api/realtime/pending-customers?limit={n} - Khách chưa trả lời (badge cột TIN NHẮN)',
                'POST /api/realtime/mark-replied - Xóa khách khỏi pending (đã trả lời)',
                'DELETE /api/realtime/cleanup?days={n} - Cleanup leftover realtime_updates (deprecated table)',
                'POST /api/realtime/tpos/start - Start TPOS WebSocket (saves credentials for auto-reconnect)',
                'POST /api/realtime/tpos/stop - Stop TPOS WebSocket (disables auto-reconnect)',
                'GET /api/realtime/tpos/status - Get TPOS client status',
            ],
            telegram: [
                'GET /api/telegram - Telegram bot status',
                'POST /api/telegram/webhook - Telegram webhook (Gemini AI)',
                'POST /api/telegram/setWebhook - Set webhook URL',
                'GET /api/telegram/webhookInfo - Get webhook info',
                'POST /api/telegram/deleteWebhook - Delete webhook',
            ],
            upload: [
                'POST /api/upload/image - Upload image to Firebase Storage',
                'DELETE /api/upload/image - Delete image from Firebase Storage',
                'GET /api/upload/health - Upload service health check',
            ],
            health: [
                'GET /health - Server health check',
                'GET /api/debug/time - Server time diagnostic',
            ],
        },
    });
});

// ============== TPOS LOG ENDPOINTS ==============
app.post('/api/tpos-log/start', (req, res) => {
    const minutes = req.body?.minutes || 10;
    tposEventLog.start(minutes);
    res.json({
        success: true,
        message: `Logging started for ${minutes} minutes`,
        willStopAt: new Date(Date.now() + minutes * 60 * 1000).toISOString(),
    });
});

app.post('/api/tpos-log/stop', (req, res) => {
    tposEventLog.stop();
    res.json({ success: true, ...tposEventLog.getSummary() });
});

app.get('/api/tpos-log/summary', (req, res) => {
    res.json(tposEventLog.getSummary());
});

app.get('/api/tpos-log/events', (req, res) => {
    const { type, eventType, limit } = req.query;
    let events = tposEventLog.events;
    if (type) events = events.filter((e) => e.type === type);
    if (eventType) events = events.filter((e) => e.eventType === eventType);
    if (limit) events = events.slice(-parseInt(limit));
    res.json({ total: events.length, events });
});

app.get('/api/tpos-log/all', (req, res) => {
    res.json(tposEventLog.getAll());
});
// ============== END TPOS LOG ENDPOINTS ==============

// ============== TPOS EXTENSION EVENTS ==============
// Receives events from N2Store Chrome Extension (e.g., tag assignments on TPOS)
// and broadcasts to all connected WebSocket clients
app.post('/api/tpos-events/broadcast', (req, res) => {
    const event = req.body;
    if (!event || !event.type) {
        return res.status(400).json({ error: 'Missing event type' });
    }
    console.log('[TPOS-EXT] Event from extension:', event.type, event.orderId || '');
    broadcastToClients(event);
    res.json({ success: true, broadcasted: true });
});
// ============== END TPOS EXTENSION EVENTS ==============

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        error: 'Not Found',
        path: req.url,
    });
});

// Error handler
app.use((err, req, res, next) => {
    console.error('[GLOBAL_ERROR]', err);
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    res.status(statusCode).json({
        success: false,
        error: err.name || 'ServerError',
        message: message,
        details: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    });
});

// =====================================================
// WEBSOCKET SERVER & CLIENT (REALTIME)
// =====================================================
const WebSocket = require('ws');
const http = require('http');

// Create HTTP server from Express app
const server = http.createServer(app);

// Create WebSocket Server for Frontend Clients (exclude /api/oncall/ws path)
const wss = new WebSocket.Server({ noServer: true });

// Attach OnCallCX SIP Proxy WebSocket handler
const sipWss = attachSipProxy(server);

// Route WebSocket upgrades: /api/oncall/ws → SIP proxy, others → default wss
server.on('upgrade', (request, socket, head) => {
    const pathname = require('url').parse(request.url).pathname;
    if (pathname === '/api/oncall/ws') {
        // Handled by attachSipProxy
        return;
    }
    // Default WebSocket for frontend clients
    wss.handleUpgrade(request, socket, head, (ws) => {
        wss.emit('connection', ws, request);
    });
});

// ============== TPOS EVENT LOGGER ==============
const tposEventLog = {
    events: [],
    isLogging: false,
    startTime: null,
    duration: 10 * 60 * 1000, // default 10 minutes
    stopTimer: null,

    start(durationMinutes = 10) {
        this.events = [];
        this.isLogging = true;
        this.startTime = Date.now();
        this.duration = durationMinutes * 60 * 1000;
        clearTimeout(this.stopTimer);
        this.stopTimer = setTimeout(() => this.stop(), this.duration);
        console.log(`[TPOS-LOG] 📝 Started logging for ${durationMinutes} minutes`);
    },

    stop() {
        this.isLogging = false;
        clearTimeout(this.stopTimer);
        const elapsed = this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0;
        console.log(
            `[TPOS-LOG] ⏹ Stopped after ${elapsed}s, captured ${this.events.length} events`
        );
    },

    log(data) {
        if (!this.isLogging) return;
        this.events.push({
            timestamp: new Date().toISOString(),
            elapsed: Math.round((Date.now() - this.startTime) / 1000),
            ...data,
        });
    },

    getSummary() {
        const typeCounts = {};
        const eventTypes = {};
        const samples = {};

        this.events.forEach((e) => {
            // Count by broadcast type
            const t = e.type || 'unknown';
            typeCounts[t] = (typeCounts[t] || 0) + 1;

            // Count by TPOS eventType
            if (e.eventType) {
                eventTypes[e.eventType] = (eventTypes[e.eventType] || 0) + 1;
                // Keep first sample of each type
                if (!samples[e.eventType]) {
                    samples[e.eventType] = e;
                }
            }

            // For raw events, track event names
            if (e.type === 'tpos:event' && e.event) {
                const key = `raw:${e.event}`;
                eventTypes[key] = (eventTypes[key] || 0) + 1;
                if (!samples[key]) samples[key] = e;
            }
        });

        return {
            isLogging: this.isLogging,
            startTime: this.startTime ? new Date(this.startTime).toISOString() : null,
            elapsedSeconds: this.startTime ? Math.round((Date.now() - this.startTime) / 1000) : 0,
            totalEvents: this.events.length,
            byBroadcastType: typeCounts,
            byEventType: eventTypes,
            samples,
        };
    },

    getAll() {
        return {
            ...this.getSummary(),
            events: this.events,
        };
    },
};

// (Log endpoints registered before 404 handler)
// ============== END TPOS EVENT LOGGER ==============

// Broadcast function
const broadcastToClients = (data) => {
    // Log event if logging is active
    tposEventLog.log(data);
    let sentCount = 0;
    let totalClients = wss.clients.size;
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
            sentCount++;
        }
    });
    console.log(
        `[SERVER-WS][DEBUG] Broadcast: type=${data.type}, sent to ${sentCount}/${totalClients} clients`
    );
};

// Expose broadcast to routes (use req.app.locals.broadcastToClients)
app.locals.broadcastToClients = broadcastToClients;

// Expose SSE notifier to routes (use req.app.locals.realtimeSseNotify)
// Cho phép routes cross-broadcast SSE topic không phải của mình
// (vd order-notes broadcast tickets, KPI route broadcast order-status).
app.locals.realtimeSseNotify = realtimeSseRoutes.notifyClients;

// WEB2.0 — SSE notifier riêng (req.app.locals.web2RealtimeSseNotify).
// Dùng cho cross-broadcast Web 2.0: native-orders/merge-to-pbh broadcast
// web2:fast-sale-orders + web2:customer-wallet, fast-sale-orders broadcast
// web2:native-orders sau status bump, v.v.
app.locals.web2RealtimeSseNotify = web2RealtimeSseRoutes.notifyClients;

// Heartbeat for Frontend Clients (Keep-Alive)
const interval = setInterval(function ping() {
    wss.clients.forEach(function each(ws) {
        // if (ws.isAlive === false) return ws.terminate(); // Disable for stability

        ws.isAlive = false;
        ws.ping();
    });
}, 30000);

wss.on('connection', function connection(ws, req) {
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    console.log(
        `[SERVER-WS][DEBUG] Frontend client CONNECTED from ${ip}. Total clients: ${wss.clients.size}`
    );
    ws.on('close', () => {
        console.log(
            `[SERVER-WS][DEBUG] Frontend client DISCONNECTED from ${ip}. Total clients: ${wss.clients.size}`
        );
    });
});

wss.on('close', function close() {
    clearInterval(interval);
});

// =====================================================
// START SERVER
// =====================================================

server.listen(PORT, () => {
    console.log('='.repeat(50));
    console.log('🚀 N2Store API Fallback Server');
    console.log('='.repeat(50));
    console.log(`📍 Running on port: ${PORT}`);
    console.log(`🌐 Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`⏰ Started at: ${new Date().toISOString()}`);
    console.log('='.repeat(50));

    // Pre-seed auth token cache (fire-and-forget)
    authTokenStore.preSeed().catch((e) => console.warn('[AUTH-STORE] Pre-seed error:', e.message));

    // Pre-download yt-dlp binary so first /api/aikol/import/channel call is fast
    // (only runs on Linux Render — silently noops on macOS/Windows where binary
    // doesn't apply; that's fine since channel scraping is a Render-only feature).
    if (process.platform === 'linux') {
        try {
            const ytdlp = require('./services/aikol-ytdlp-service');
            ytdlp
                .ensureYtDlp()
                .then((bin) => console.log('[ytdlp] Ready at', bin))
                .catch((e) => console.warn('[ytdlp] Pre-warm failed:', e.message));
        } catch (e) {
            console.warn('[ytdlp] require failed:', e.message);
        }
    }

    // Auto-connect realtime clients after server starts (with delay to ensure DB is ready)
    setTimeout(() => {
        if (WEB2_ONLY) return; // Web 1.0 only — web2-api không connect Pancake/TPOS WS
        autoConnectRealtimeClients(chatDbPool);
    }, 3000);

    // WEB2.0 — Unread reconcile: lưới an toàn cho event "đã đọc" bị miss khi WS
    // ngắt/restart. Chạy 1 lần lúc boot (delay 60s cho WS connect + token sẵn)
    // → dọn row kẹt sau deploy; rồi định kỳ 2 phút.
    try {
        const web2UnreadReconcile = require('./services/web2-unread-reconcile');
        const _runReconcile = () =>
            web2UnreadReconcile
                .reconcileAll(
                    app.locals.web2Db || web2Pool,
                    chatDbPool,
                    web2RealtimeSseRoutes.notifyClients
                )
                .catch((e) => console.warn('[WEB2-UNREAD-RECONCILE] run error:', e.message));
        if (!DISABLE_WEB2_JOBS) {
            setTimeout(_runReconcile, 60000); // boot (dọn row kẹt sau restart)
            setInterval(_runReconcile, 2 * 60 * 1000); // định kỳ 2 phút
        }
    } catch (e) {
        console.warn('[WEB2-UNREAD-RECONCILE] schedule failed:', e.message);
    }
});

// Start cron jobs (Web 1.0 scheduler) — web2-api KHÔNG chạy.
if (!WEB2_ONLY) {
    require('./cron/scheduler');
}

// Boot AI KOL Studio queue worker (Sprint 3 — Fal.ai + Kling pollers) — Web 1.0.
if (!WEB2_ONLY) {
    try {
        require('./services/aikol-queue-worker').start();
    } catch (e) {
        console.warn('[server] aikol-queue-worker boot failed:', e.message);
    }
}

// WEB2.0 — Bulk FB message send worker (Pancake API đa-account + 24h→extension)
if (!DISABLE_WEB2_JOBS) {
    try {
        require('./services/web2-msg-send-worker').start();
    } catch (e) {
        console.warn('[server] web2-msg-send-worker boot failed:', e.message);
    }
}

// WEB2.0 — Notifications scan (pain points: PBH draft >24h, stock thấp, ví KH âm,
// thu về quá hạn) mỗi 10 phút. CHUYỂN từ cron/scheduler.js (nay là Web 1.0-only)
// sang đây để chạy đúng instance web2 (gated DISABLE_WEB2_JOBS). Dùng web2Pool
// (bảng web2_*); hàm tự broadcast SSE web2:notifications. [WEB2-NOTI-SCAN]
if (!DISABLE_WEB2_JOBS && web2Pool) {
    try {
        const { scanAndCreateNotifications } = require('./routes/v2/notifications');
        const _scanWeb2Noti = async () => {
            try {
                const created = await scanAndCreateNotifications(web2Pool);
                if (created && created.length) {
                    console.log(`[WEB2-NOTI-SCAN] ${created.length} noti mới`);
                }
            } catch (e) {
                console.error('[WEB2-NOTI-SCAN] error:', e.message);
            }
        };
        setTimeout(_scanWeb2Noti, 90_000); // boot scan sau 90s
        setInterval(_scanWeb2Noti, 10 * 60 * 1000);
    } catch (e) {
        console.warn('[WEB2-NOTI-SCAN] schedule failed:', e.message);
    }
}

// Graceful shutdown — close HTTP + WS + DB pool before process exits.
// Render sends SIGTERM then waits 30s before SIGKILL; we want all in-flight
// requests to finish and DB clients to release cleanly.
let _shuttingDown = false;
async function gracefulShutdown(signal) {
    if (_shuttingDown) return;
    _shuttingDown = true;
    console.log(`[SHUTDOWN] Received ${signal}, starting graceful shutdown...`);
    const deadline = Date.now() + 25_000;
    // Đóng SSE Web 2.0 TRƯỚC (gửi event reconnect + end) để client EventSource
    // reconnect NHANH sang instance mới + gỡ LISTEN/heartbeat + xoá dòng registry,
    // trước khi đóng HTTP server. Idempotent (module cũng tự bắt SIGTERM).
    try {
        if (web2RealtimeSseRoutes && web2RealtimeSseRoutes.gracefulClose) {
            await web2RealtimeSseRoutes.gracefulClose(); // await: DELETE registry xong trước web2Pool.end()
        }
    } catch (e) {
        console.warn('[SHUTDOWN] SSE gracefulClose error:', e.message);
    }
    // Dừng watchdog + đóng listener Zalo (zca) → nhường phiên cho instance mới, tránh
    // deploy chồng instance "đấu" phiên (kick 3000/3003). Không await (chỉ stop in-RAM).
    try {
        if (typeof web2ZaloRoutes !== 'undefined' && web2ZaloRoutes.stopZalo) {
            web2ZaloRoutes.stopZalo();
        }
    } catch (e) {
        console.warn('[SHUTDOWN] Zalo stop error:', e.message);
    }
    try {
        // Stop accepting new HTTP requests
        await new Promise((resolve) => server.close(resolve));
        console.log('[SHUTDOWN] HTTP server closed');
    } catch (e) {
        console.warn('[SHUTDOWN] HTTP close error:', e.message);
    }
    // Close websocket clients
    try {
        if (typeof wss !== 'undefined' && wss.clients) {
            for (const client of wss.clients) {
                try {
                    client.close(1001, 'server shutdown');
                } catch (_) {}
            }
        }
    } catch (_) {}
    // Close DB pools (chatDb + web2Db) — release connections trước khi exit.
    try {
        const ends = [];
        if (chatDbPool && typeof chatDbPool.end === 'function') ends.push(chatDbPool.end());
        if (
            typeof web2Pool !== 'undefined' &&
            web2Pool &&
            web2Pool !== chatDbPool &&
            typeof web2Pool.end === 'function'
        ) {
            ends.push(web2Pool.end());
        }
        if (ends.length) {
            await Promise.race([
                Promise.allSettled(ends),
                new Promise((r) => setTimeout(r, Math.max(1000, deadline - Date.now()))),
            ]);
            console.log('[SHUTDOWN] DB pools closed');
        }
    } catch (e) {
        console.warn('[SHUTDOWN] DB close error:', e.message);
    }
    console.log('[SHUTDOWN] Done, exiting 0');
    process.exit(0);
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
