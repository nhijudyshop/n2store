import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { env } from './env.js';
import { logger } from '../utils/logger.js';

// ═══════════════════════════════════════════════════════════════════════════════
// PostgreSQL Connection Pool
// ═══════════════════════════════════════════════════════════════════════════════

const pool = new Pool({
  connectionString: env.DATABASE_URL,
  ssl: env.isProduction ? { rejectUnauthorized: false } : false,
  max: 20, // Maximum number of clients in the pool
  idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
  connectionTimeoutMillis: 10000, // Return error after 10 seconds if connection fails
});

pool.on('error', (err) => {
  logger.error('Unexpected database pool error', { error: err.message });
});

pool.on('connect', () => {
  logger.debug('New database connection established');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Database Query Functions
// ═══════════════════════════════════════════════════════════════════════════════

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params?: unknown[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Executed query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Query error', { text: text.substring(0, 100), error });
    throw error;
  }
}

export async function getClient(): Promise<PoolClient> {
  return pool.connect();
}

// ═══════════════════════════════════════════════════════════════════════════════
// Transaction Wrapper (CRITICAL for Financial Operations)
// ═══════════════════════════════════════════════════════════════════════════════
//
// BẮT BUỘC sử dụng cho mọi thao tác thay đổi số dư ví:
// - Đảm bảo ACID properties
// - Sử dụng Row-level Locking (SELECT ... FOR UPDATE)
// - Tự động ROLLBACK khi có lỗi
// ═══════════════════════════════════════════════════════════════════════════════

export interface TransactionClient {
  query: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;

  // Helper để SELECT ... FOR UPDATE
  queryForUpdate: <T extends QueryResultRow = QueryResultRow>(
    text: string,
    params?: unknown[]
  ) => Promise<QueryResult<T>>;
}

export type TransactionCallback<T> = (client: TransactionClient) => Promise<T>;

/**
 * Execute a database transaction with automatic commit/rollback
 *
 * CRITICAL: Sử dụng hàm này cho TẤT CẢ các thao tác thay đổi số dư ví
 *
 * @example
 * ```typescript
 * const result = await db.transaction(async (tx) => {
 *   // Lock the wallet row
 *   const { rows: [wallet] } = await tx.query(
 *     'SELECT * FROM wallets WHERE phone = $1 FOR UPDATE',
 *     [phone]
 *   );
 *
 *   // Perform operations
 *   await tx.query('UPDATE wallets SET real_balance = $1 WHERE phone = $2', [newBalance, phone]);
 *   await tx.query('INSERT INTO wallet_transactions (...) VALUES (...)', [...]);
 *
 *   return wallet;
 * });
 * ```
 */
export async function transaction<T>(callback: TransactionCallback<T>): Promise<T> {
  const client = await pool.connect();
  const startTime = Date.now();

  try {
    await client.query('BEGIN');
    logger.debug('Transaction started');

    const txClient: TransactionClient = {
      query: async <R extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<R>> => {
        return client.query<R>(text, params);
      },

      queryForUpdate: async <R extends QueryResultRow = QueryResultRow>(
        text: string,
        params?: unknown[]
      ): Promise<QueryResult<R>> => {
        // Automatically append FOR UPDATE if not present
        const forUpdateText = text.trim().toUpperCase().endsWith('FOR UPDATE')
          ? text
          : `${text} FOR UPDATE`;
        return client.query<R>(forUpdateText, params);
      },
    };

    const result = await callback(txClient);

    await client.query('COMMIT');
    const duration = Date.now() - startTime;
    logger.debug('Transaction committed', { duration });

    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    const duration = Date.now() - startTime;
    logger.error('Transaction rolled back', { duration, error });
    throw error;
  } finally {
    client.release();
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Health Check
// ═══════════════════════════════════════════════════════════════════════════════

export async function healthCheck(): Promise<boolean> {
  try {
    const result = await query('SELECT NOW() as current_time');
    return result.rows.length > 0;
  } catch {
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Shutdown
// ═══════════════════════════════════════════════════════════════════════════════

export async function shutdown(): Promise<void> {
  logger.info('Closing database pool...');
  await pool.end();
  logger.info('Database pool closed');
}

// Export pool for advanced usage (use with caution)
export { pool };

// Default export for convenience
export const db = {
  query,
  getClient,
  transaction,
  healthCheck,
  shutdown,
  pool,
};

export default db;
