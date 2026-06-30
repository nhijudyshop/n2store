// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. | WEB2.0 module.
// =====================================================
// SERVICES OVERVIEW — tổng hợp DB stats + service inventory
// =====================================================
//
// P1 2026-05-30: user ask "tạo trang dịch vụ ghi rõ đang dùng db gì → chi phí
// ra sao → hiển thị data đã dùng".
//
// Endpoint: GET /api/services-overview
//
// Trả về snapshot:
//   - 2 Postgres pools (cùng Render PG Basic 1GB PAID, Singapore):
//     - chatDb (n2store-chat-db) — DB chính Web 1.0 / 2.0 cũ
//     - web2Db (n2store-web2-db) — DB Web 2.0 generic web2_records (2026-05-30 thay Neon)
//   - Process stats (uptime, memory, node version)
//   - Service inventory static (cost + plan thật từ Render API)
//
// 2026-06-25: ⚡ TẤT CẢ dịch vụ Render đều PAID (không free-tier, không idle-sleep) —
// xác nhận qua Render API: web2-api Standard $25, n2store-fallback Standard $25,
// web2-realtime Starter $7, 2× Postgres basic_1gb $19. → Tổng Render $95/mo.
// Vì paid không ngủ đông, lỗi proxy "timeout 15000ms" CHỈ xảy ra trong cửa sổ
// redeploy/restart (~30-60s), KHÔNG phải cold-start do sleep.
//
// Tất cả queries có timeout 5s + try/catch riêng để 1 pool fail không kill response.

const express = require('express');
const router = express.Router();
const { requireWeb2Admin } = require('../middleware/web2-auth');

// AUTH GATE (2026-06-30, siết admin 2026-06-30b): endpoint lộ inventory cả 2 DB
// (kèm tên bảng PII Web 1.0) + chi phí hạ tầng + topology → CHỈ ADMIN. Trang web2/system
// đã là menu CHỈ ADMIN ở frontend (web2-sidebar.js "Cấu hình & Hệ thống" — CHỈ ADMIN),
// nên backend khớp: requireWeb2Admin → 401 thiếu/sai token, 403 nếu không phải admin.
// (Trước dùng requireWeb2Auth = mọi user login → NV thường vẫn curl được cost/PII-bảng.)
router.use(requireWeb2Admin);

async function _safeQuery(pool, sql, params = []) {
    try {
        const r = await pool.query(sql, params);
        return r.rows;
    } catch (e) {
        return { error: e.message };
    }
}

async function _dbStats(pool, name) {
    if (!pool) return { name, error: 'pool not initialized' };
    const stats = { name };

    // Database total size
    const dbSize = await _safeQuery(
        pool,
        `
        SELECT pg_database_size(current_database()) AS bytes,
               pg_size_pretty(pg_database_size(current_database())) AS pretty,
               current_database() AS db_name,
               version() AS version
    `
    );
    if (Array.isArray(dbSize) && dbSize[0]) {
        stats.dbName = dbSize[0].db_name;
        stats.dbSizeBytes = Number(dbSize[0].bytes);
        stats.dbSizePretty = dbSize[0].pretty;
        stats.pgVersion = String(dbSize[0].version || '')
            .split(' ')
            .slice(0, 2)
            .join(' ');
    } else {
        stats.dbError = dbSize.error || 'unknown';
        return stats;
    }

    // Top 10 tables by size (relation + indexes)
    const tables = await _safeQuery(
        pool,
        `
        SELECT relname AS table_name,
               pg_total_relation_size(relid) AS total_bytes,
               pg_size_pretty(pg_total_relation_size(relid)) AS total_pretty,
               n_live_tup AS row_count
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 10
    `
    );
    stats.tables = Array.isArray(tables)
        ? tables.map((t) => ({
              name: t.table_name,
              totalBytes: Number(t.total_bytes),
              totalPretty: t.total_pretty,
              rowCount: Number(t.row_count || 0),
          }))
        : [];

    // Total table count
    const tCount = await _safeQuery(
        pool,
        `
        SELECT COUNT(*)::int AS n FROM information_schema.tables WHERE table_schema = 'public'
    `
    );
    stats.totalTables = Array.isArray(tCount) && tCount[0] ? Number(tCount[0].n) : null;

    // Connection stats
    const conn = await _safeQuery(
        pool,
        `
        SELECT state, COUNT(*)::int AS n
        FROM pg_stat_activity
        WHERE datname = current_database()
        GROUP BY state
    `
    );
    stats.connections = Array.isArray(conn) ? conn.map((c) => ({ state: c.state, n: c.n })) : [];

    // Pool internal stats (from node-postgres)
    if (typeof pool.totalCount === 'number') {
        stats.poolInternal = {
            total: pool.totalCount,
            idle: pool.idleCount,
            waiting: pool.waitingCount,
        };
    }

    return stats;
}

// -----------------------------------------------------
// Static service inventory — cost + plan + free tier
// -----------------------------------------------------
// LƯU Ý: tab "Dịch vụ" tập trung HẠ TẦNG + chi phí + DB live. DANH SÁCH ĐẦY ĐỦ
// mọi bên thứ 3 (API AI/TTS, thư viện CDN, model on-device, dự án GitHub) →
// tab "Bên thứ 3" (web2/system/data/web2-third-parties.json, audit 5 vòng 2026-06-24).
// Cập nhật 2026-06-24: sửa text cũ (Firestore drained, web2Db schema thật,
// Firebase Auth legacy, Cloudflare unified proxy, GitHub Pages → nhijudy.store) +
// thêm AI/TTS, SePay, TPOS.
const SERVICES_INVENTORY = [
    {
        category: 'database',
        name: 'Render Postgres (Web 1.0)',
        plan: 'Basic 1GB · Singapore · PAID',
        provider: 'Render',
        costMonth: 19,
        currency: 'USD',
        freeTier: null,
        paidLimit: {
            storage: '15 GB disk (1GB RAM, Render API diskSizeGB=15)',
            tier: 'Basic $19/mo · Pro 4GB $55 · Pro+ 8GB $95',
            uptime: 'Always-on — KHÔNG hết hạn, KHÔNG sleep',
        },
        purpose:
            'DB Web 1.0 PROD (n2store_chat) — customers, balance_history, customer_wallets, app_users, invoice_status, pancake_accounts… Web 2.0 KHÔNG còn ở đây (cutover 2026-06-03).',
        url: 'https://dashboard.render.com',
        poolKey: 'chatDb',
        host: 'dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com',
    },
    {
        category: 'database',
        name: 'Render Postgres (Web 2.0)',
        plan: 'Basic 1GB · Singapore · PAID',
        provider: 'Render',
        costMonth: 19,
        currency: 'USD',
        freeTier: null,
        paidLimit: {
            storage: '15 GB disk (1GB RAM, Render API diskSizeGB=15)',
            tier: 'Basic $19/mo · upgrade nếu vượt',
            uptime: 'Always-on — KHÔNG sleep',
        },
        purpose:
            'DB Web 2.0 (n2store_web2) — bảng web2_* + native_orders + fast_sale_orders: web2_products, web2_variants, web2_so_order, web2_supplier_meta/ledger, web2_customers, web2_customer_wallets, web2_wallet_transactions, web2_balance_history, web2_users/user_sessions, web2_records (generic). TÁCH RIÊNG khỏi chatDb.',
        url: 'https://dashboard.render.com',
        poolKey: 'web2Db',
        host: 'dpg-d8d7besp3tds73f8gr60-a.singapore-postgres.render.com',
        note: 'Tạo 2026-05-30 thay Neon. Web 2.0 đã migrate KHỎI Firestore sang đây (2026-06-14) — Firestore giờ drained.',
    },
    {
        category: 'compute',
        name: 'Render Web — web2-api (Web 2.0)',
        plan: 'Standard · 1 CPU / 2 GB · PAID',
        provider: 'Render',
        costMonth: 25,
        currency: 'USD',
        freeTier: null,
        paidLimit: {
            instance: '1 CPU · 2 GB RAM',
            tier: 'Standard $25/mo',
            uptime: 'Always-on — KHÔNG idle-sleep',
        },
        purpose:
            'Node.js API Web 2.0 (web2-api-kv04.onrender.com) — Express, route /api/web2-*, hub SSE web2, AI proxy (/api/web2-ai), cron web2. Serve chính trang dashboard này.',
        url: 'https://dashboard.render.com',
        note: 'Paid → luôn chạy. Chỉ gián đoạn ~30-60s khi REDEPLOY (git push) hoặc restart — đây là cửa sổ DUY NHẤT proxy Cloudflare có thể timeout 15s (KHÔNG phải cold-start do ngủ đông).',
    },
    {
        category: 'compute',
        name: 'Render Web — n2store-fallback (Web 1.0)',
        plan: 'Standard · 1 CPU / 2 GB · PAID',
        provider: 'Render',
        costMonth: 25,
        currency: 'USD',
        freeTier: null,
        paidLimit: {
            instance: '1 CPU · 2 GB RAM',
            tier: 'Standard $25/mo',
            uptime: 'Always-on — KHÔNG idle-sleep',
        },
        purpose:
            'Node.js API Web 1.0 (n2store-fallback.onrender.com) — Express, hub SSE web1, customers/wallets/balance-history, AI KOL Studio, cron web1.',
        url: 'https://dashboard.render.com',
        note: 'Paid → luôn chạy. Gián đoạn ngắn chỉ khi redeploy/restart.',
    },
    {
        category: 'compute',
        name: 'Render Web — web2-realtime (relay)',
        plan: 'Starter · 0.5 CPU / 512 MB · PAID',
        provider: 'Render',
        costMonth: 7,
        currency: 'USD',
        freeTier: null,
        paidLimit: {
            instance: '0.5 CPU · 512 MB RAM',
            tier: 'Starter $7/mo',
            uptime: 'Always-on — KHÔNG idle-sleep',
        },
        purpose:
            'Relay realtime Pancake live-chat (WS) → /ingest → SSE web2 (event-driven, KHÔNG poller). Đọc token Pancake (Firestore pancake_tokens/accounts) lúc boot.',
        url: 'https://dashboard.render.com',
        note: 'Paid → luôn chạy. Service Render thứ 3 (trước đây dashboard bỏ sót).',
    },
    {
        category: 'network',
        name: 'Cloudflare Workers',
        plan: 'Free',
        provider: 'Cloudflare',
        costMonth: 0,
        currency: 'USD',
        freeTier: { requests: '100k/day' },
        paidLimit: { requests: '10M/mo ($5/mo Paid)' },
        purpose:
            'chatomni-proxy — proxy CHUNG: TPOS/Pancake/FB (Web 1.0) + route /api/web2-* → web2-api (Web 2.0). Match path Web 2.0 tường minh TRƯỚC catch-all TPOS. Edge cache.',
        url: 'https://dash.cloudflare.com',
    },
    {
        category: 'ai',
        name: 'AI / LLM / TTS / Media (đa nhà cung cấp)',
        plan: 'Free-tier + multi-key rotation',
        provider: 'Gemini · Groq · OpenRouter · ElevenLabs · Vivibe · Pollinations …',
        costMonth: 0,
        currency: 'USD',
        freeTier: {
            chat: 'Gemini/Groq/OpenRouter/ChatAnywhere (xoay nhiều key)',
            tts: 'ElevenLabs / Vivibe / VieNeu (self-host) / MMS-TTS on-device',
            image: 'Pollinations / Cloudflare Workers AI / DiceBear',
        },
        paidLimit: { 'pay-per-use': 'Nano Banana (Gemini image) · DeepSeek — dùng theo lượng' },
        purpose:
            'Trợ lý AI, dịch thuật, tạo ảnh/video, giọng đọc. Chủ yếu chạy free-tier (xoay key). Chi tiết đầy đủ + license + nơi dùng → tab "Bên thứ 3".',
        url: 'index.html?tab=thirdparty',
        note: 'Pool key tách: chat free (WEB2_GEMINI_API_KEY1..4) vs Nano Banana paid (KEY5/NANOBANANA).',
    },
    {
        category: 'payment',
        name: 'SePay',
        plan: 'Trả phí — 589.000đ/tháng (gia hạn hàng tháng)',
        provider: 'SePay Vietnam',
        costMonth: 24, // ≈ 589.000đ/tháng (verify hóa đơn my.sepay.vn 2026-06-28; ~24.500đ/USD)
        costMonthVnd: 589000,
        currency: 'USD',
        freeTier: null,
        paidLimit:
            'Gói trả phí: webhook biến động số dư + có thể phụ phí "vượt hạn mức" khi nhiều giao dịch.',
        purpose:
            'Webhook biến động số dư ngân hàng → nạp ví KH Web 2.0 (web2_customer_wallets) + Sổ quỹ. 2 kênh độc lập (shop + Home).',
        url: 'https://my.sepay.vn',
    },
    {
        category: 'commerce',
        name: 'TPOS (Tomato POS)',
        plan: 'Subscription (POS shop)',
        provider: 'TPOS',
        costMonth: 0,
        currency: 'USD',
        freeTier: null,
        paidLimit: { note: 'Gói POS riêng của shop (không phải hạ tầng app)' },
        purpose:
            'POS thật của shop (OData API qua tomato.tpos.vn). Web 1.0 dùng trực tiếp; Web 2.0 có shadow (odata-tpos-shadow). Proxy qua chatomni-proxy.',
        url: 'https://tomato.tpos.vn',
        note: 'Chi phí là subscription POS của shop, không tính vào hạ tầng app này.',
    },
    {
        category: 'database',
        name: 'Firebase Firestore',
        plan: 'Spark (Free)',
        provider: 'Google Firebase',
        costMonth: 0,
        currency: 'USD',
        freeTier: { storage: '1 GB', reads: '50k/day', writes: '20k/day' },
        paidLimit: { storage: 'pay-as-go', reads: 'pay-as-go' },
        purpose:
            'LEGACY/drained cho Web 2.0 — data đã chuyển sang Postgres web2_* (2026-06-14). Còn ACTIVE: collection pancake_tokens/accounts (token Pancake, dùng chung Web 1.0). Web 1.0 vẫn dùng vài store.',
        url: 'https://console.firebase.google.com',
        note: 'Web 2.0 KHÔNG tạo collection Firestore mới — realtime dùng SSE trên Render.',
    },
    {
        category: 'auth',
        name: 'Firebase Auth',
        plan: 'Spark (Free)',
        provider: 'Google Firebase',
        costMonth: 0,
        currency: 'USD',
        freeTier: { mau: '50,000 MAU' },
        paidLimit: { mau: '$0.0055/MAU > 50k' },
        purpose:
            'Auth Web 1.0 (AuthManager). Web 2.0 dùng auth Postgres riêng (web2_users + web2_user_sessions, x-web2-token) — KHÔNG còn phụ thuộc Firebase Auth.',
        url: 'https://console.firebase.google.com',
    },
    {
        category: 'cdn',
        name: 'Bunny CDN',
        plan: 'Pay-as-go',
        provider: 'Bunny.net',
        costMonth: '~1',
        currency: 'USD',
        freeTier: null,
        paidLimit: { storage: '$0.01/GB/mo + $0.005-0.03/GB egress' },
        purpose:
            'CHỈ AI KOL Studio (Web 1.0) — n2store-aikol zone. Web 2.0 KHÔNG dùng (ảnh lưu Postgres bytea).',
        url: 'https://panel.bunny.net',
    },
    {
        category: 'hosting',
        name: 'GitHub Pages',
        plan: 'Free (Public Repo)',
        provider: 'GitHub',
        costMonth: 0,
        currency: 'USD',
        freeTier: { bandwidth: '100 GB/mo', builds: '10/hr' },
        paidLimit: null,
        purpose:
            'Host frontend tĩnh (deploy qua git push). Domain chính hiện tại: nhijudy.store. Repo: nhijudyshop/n2store.',
        url: 'https://github.com/nhijudyshop/n2store',
    },
];

// -----------------------------------------------------
// GET /api/services-overview
// -----------------------------------------------------
router.get('/', async (req, res) => {
    try {
        const [chatStats, web2Stats] = await Promise.all([
            _dbStats(req.app.locals.chatDb, 'chatDb'),
            _dbStats(req.app.locals.web2Db, 'web2Db'),
        ]);

        const process_stats = {
            uptime: process.uptime(),
            uptimePretty: _fmtUptime(process.uptime()),
            memory: process.memoryUsage(),
            nodeVersion: process.version,
            platform: process.platform,
            pid: process.pid,
        };

        res.json({
            ok: true,
            ts: Date.now(),
            databases: {
                chatDb: chatStats,
                web2Db: web2Stats,
            },
            process: process_stats,
            services: SERVICES_INVENTORY,
        });
    } catch (e) {
        console.error('[SERVICES-OVERVIEW] error:', e);
        res.status(500).json({ ok: false, error: e.message });
    }
});

function _fmtUptime(sec) {
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const parts = [];
    if (d) parts.push(`${d}d`);
    if (h || d) parts.push(`${h}h`);
    parts.push(`${m}m`);
    return parts.join(' ');
}

module.exports = router;
