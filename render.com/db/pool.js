// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * PostgreSQL Connection Pool
 * Singleton pattern - returns same pool instance
 */

const { Pool, types } = require('pg');

// Fix timezone: TIMESTAMP WITHOUT TIMEZONE contains Vietnam time (UTC+7)
// Append +07:00 so browser correctly interprets it
types.setTypeParser(1114, (val) => val ? val + '+07:00' : val);

let pool = null;

function getPool() {
    if (!pool) {
        pool = new Pool({
            connectionString: process.env.DATABASE_URL,
            ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
            max: 20,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });

        pool.on('error', (err) => {
            console.error('[DB POOL] Unexpected error:', err);
        });

        console.log('[DB POOL] PostgreSQL pool initialized');
    }
    return pool;
}

// Export as singleton
module.exports = getPool();
