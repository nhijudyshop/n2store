// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Fetch Utilities for Cloudflare Worker
 * Re-exports from shared library
 *
 * @module cloudflare-worker/modules/utils/fetch-utils
 */

export {
    delay,
    fetchWithTimeout,
    fetchWithRetry,
    simpleFetch,
    safeFetch
} from '../../../shared/universal/fetch-utils.js';
