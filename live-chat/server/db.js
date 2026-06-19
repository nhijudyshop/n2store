// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// DATABASE (shared with render.com server)
// Side-effect-free on require: createDbPool() is called by the entry. Requiring
// this module does NOT connect — `new Pool(...)` only runs inside the factory.
// Returns null when DATABASE_URL is absent (relay falls back to Firebase).
// =====================================================
const { Pool } = require('pg');

function createDbPool() {
    if (!process.env.DATABASE_URL) return null;

    const db = new Pool({
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

    return db;
}

module.exports = { createDbPool };
