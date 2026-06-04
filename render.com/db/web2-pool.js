// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Web 2.0 PostgreSQL Pool — Render PG `n2store-web2-db` (dpg-d8d7be).
 *
 * Kho RIÊNG cho toàn bộ data Web 2.0, tách hoàn toàn khỏi Web 1.0 `n2store_chat`.
 * Read connection string từ env `WEB2_DATABASE_URL` (trỏ Render PG n2store-web2-db).
 * Web 2.0 CHỈ dùng Render + Firebase — KHÔNG Neon, KHÔNG provider ngoài nào khác.
 *
 * Nếu env unset → return null. `app.locals.web2Db` sẽ fallback sang `chatDb`
 * để giữ backward compat.
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
        // Render PG yêu cầu SSL. rejectUnauthorized:false chấp nhận managed chain.
        ssl: { rejectUnauthorized: false },
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 15000,
        statement_timeout: 30000,
        idle_in_transaction_session_timeout: 60000,
    });
    pool.on('error', (err) => {
        console.error('[WEB2 POOL] Unexpected error:', err.message);
    });
    console.log('[WEB2 POOL] Render n2store-web2-db pool initialized');
    return pool;
}

module.exports = getWeb2Pool();
