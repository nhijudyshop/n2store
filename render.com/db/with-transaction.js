// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * =====================================================
 * withTransaction — Pool transaction helper
 * =====================================================
 *
 * Usage:
 *   const result = await withTransaction(pool, async (client) => {
 *       await client.query('SELECT ... FOR UPDATE', ...);
 *       await processDeposit(client, ...);
 *       await client.query('UPDATE ...');
 *       return { ok: true };
 *   });
 *
 * Why this exists:
 *   Previously code used `pool.query('BEGIN')` + `pool.query('FOR UPDATE')` +
 *   `pool.query('COMMIT')` on a pg.Pool. Each `pool.query()` acquires a DIFFERENT
 *   connection from the pool — so BEGIN runs on connection A, FOR UPDATE on
 *   connection B (lock released immediately), COMMIT on connection C (no-op).
 *   → No real transaction, no real row lock. Allowed double wallet credits
 *   under race conditions (double-click "Duyệt", webhook + approve race, etc.).
 *
 *   This helper binds BEGIN/queries/COMMIT to a SINGLE client via
 *   `pool.connect()`, guaranteeing real atomic transactions with real locks.
 *
 * Invariants:
 *   - Client is always released back to the pool (finally block).
 *   - Errors trigger ROLLBACK and re-throw.
 *   - Do NOT leak the client outside the callback — its lifetime ends when
 *     withTransaction returns.
 *
 * Created: 2026-04-23 (Sprint 2 of wallet double-credit fix plan v3)
 * =====================================================
 */

/**
 * Run `fn(client)` inside a real Postgres transaction using a dedicated client.
 *
 * @param {import('pg').Pool} pool - pg.Pool instance
 * @param {(client: import('pg').PoolClient) => Promise<any>} fn - async callback
 * @returns {Promise<any>} whatever `fn` returns
 * @throws re-throws any error from `fn` (after ROLLBACK)
 */
async function withTransaction(pool, fn) {
    if (!pool || typeof pool.connect !== 'function') {
        throw new Error('withTransaction: first argument must be a pg.Pool');
    }
    if (typeof fn !== 'function') {
        throw new Error('withTransaction: second argument must be an async function');
    }

    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const result = await fn(client);
        await client.query('COMMIT');
        return result;
    } catch (err) {
        // Best-effort rollback. Swallow rollback errors to not mask the original.
        try {
            await client.query('ROLLBACK');
        } catch (rollbackErr) {
            console.error('[withTransaction] ROLLBACK failed:', rollbackErr.message);
        }
        throw err;
    } finally {
        client.release();
    }
}

module.exports = { withTransaction };
