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
//   - 2 Postgres pools (chatDb=Supabase + web2Db=Neon) với:
//     - DB size (pg_database_size)
//     - Top 10 tables theo size
//     - Connection stats (pg_stat_activity)
//     - Active queries count
//   - Process stats (uptime, memory, node version)
//   - Service inventory static (cost + plan + free tier limits)
//
// Tất cả queries có timeout 5s + try/catch riêng để 1 pool fail không kill response.

const express = require('express');
const router = express.Router();

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
const SERVICES_INVENTORY = [
    {
        category: 'database',
        name: 'Render Postgres',
        plan: 'Basic 1GB (Singapore)',
        provider: 'Render',
        costMonth: 19,
        currency: 'USD',
        freeTier: { storage: '1 GB', expiration: '90 days' },
        paidLimit: { storage: '1 GB Basic $19/mo · 4 GB Pro $55/mo · 8 GB Pro+ $95/mo' },
        purpose:
            'DB chính — web2_products, native_orders, fast_sale_orders, customers, invoice_status, ...',
        url: 'https://dashboard.render.com',
        poolKey: 'chatDb',
        host: 'dpg-d4kr80npm1nc738em3j0-a.singapore-postgres.render.com',
    },
    {
        category: 'database',
        name: 'Neon Postgres',
        plan: 'Free Tier',
        provider: 'Neon',
        costMonth: 0,
        currency: 'USD',
        freeTier: { storage: '0.5 GB', connections: '100 (autoscale)', branches: 10 },
        paidLimit: { storage: '3 GB (Launch $19/mo)', connections: 'unlimited' },
        purpose:
            '⚠️ DUPLICATE provider — web2_records (199MB, 131k rows). User đề xuất consolidate về Render Postgres (cùng provider, đã trả phí).',
        url: 'https://console.neon.tech',
        poolKey: 'web2Db',
        host: 'ep-orange-cloud-aox4ddrx.c-2.ap-southeast-1.aws.neon.tech',
        warning:
            'Đang dùng 38.9% Free Tier. Khuyến nghị: migrate sang Render Postgres để giảm số service + tránh hit Free limit.',
    },
    {
        category: 'compute',
        name: 'Render Backend',
        plan: 'Starter',
        provider: 'Render',
        costMonth: 7,
        currency: 'USD',
        freeTier: { hours: '750/mo', cpu: '0.5', ram: '512 MB' },
        paidLimit: { hours: 'unlimited', cpu: '0.5', ram: '512 MB' },
        purpose: 'Node.js API server — Express, SSE hubs, cron, services',
        url: 'https://dashboard.render.com',
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
        purpose: 'chatomni-proxy — TPOS/Pancake/FB proxy, Edge Cache',
        url: 'https://dash.cloudflare.com',
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
        purpose: 'Web 2.0 data (so-order, wallets, snapshots) + tickle pub/sub',
        url: 'https://console.firebase.google.com',
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
        purpose: 'Legacy n2store auth (AuthManager) + web 2.0 fallback',
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
        purpose: 'CHỈ AI KOL Studio — n2store-aikol zone',
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
        purpose: 'Static frontend hosting — nhijudyshop.github.io/n2store',
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
