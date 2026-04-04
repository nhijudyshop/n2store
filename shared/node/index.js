// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Shared Node.js Modules
 * Server-side utilities for Express, etc.
 *
 * @module shared/node
 */

// Token cache
export {
    TokenCache,
    tposTokenCache,
    default as DefaultTokenCache
} from './token-cache.js';

// CORS middleware
export {
    corsMiddleware,
    simpleCors,
    setCorsHeaders,
    handlePreflight,
    DEFAULT_CORS_OPTIONS
} from './cors-middleware.js';

// Re-export universal modules for convenience
export * from '../universal/index.js';
