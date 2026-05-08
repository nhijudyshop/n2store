// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 PostgreSQL Pool — Neon (separate DB từ v1).
 *
 * Tách khỏi `db/pool.js` để v2 data (web2_records) không tốn dung lượng
 * trên Render Postgres v1. Read connection string từ env `WEB2_DATABASE_URL`.
 *
 * Nếu env unset → return null. `app.locals.web2Db` sẽ fallback sang `chatDb`
 * trong web2-generic.js để giữ backward compat (KHÔNG break route hiện tại).
 *
 * Singleton. Imported ở server.js.
 */
const { Pool, types } = require('pg');

// Cùng timezone parser như v1 pool (TIMESTAMP+VN time, DATE raw)
types.setTypeParser(1114, (val) => (val ? val + '+07:00' : val));
types.setTypeParser(1082, (val) => val);

let pool = null;

function getWeb2Pool() {
    if (pool) return pool;
    if (!process.env.WEB2_DATABASE_URL) {
        console.log('[WEB2 POOL] WEB2_DATABASE_URL unset — web2Db will fall back to chatDb');
        return null;
    }
    pool = new Pool({
        connectionString: process.env.WEB2_DATABASE_URL,
        // Neon requires SSL — auto enabled khi connection string có sslmode=require.
        // rejectUnauthorized:false để chấp nhận Neon's self-signed chain.
        ssl: { rejectUnauthorized: false },
        max: 10, // Neon free tier có quota connections — giữ nhỏ
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000, // Neon auto-suspend → first req cần ~3-5s wake-up
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
    });
    pool.on('error', (err) => {
        console.error('[WEB2 POOL] Unexpected error:', err.message);
    });
    console.log('[WEB2 POOL] Neon pool initialized');
    return pool;
}

module.exports = getWeb2Pool();
