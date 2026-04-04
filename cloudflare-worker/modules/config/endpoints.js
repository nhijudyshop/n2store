// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * API Endpoints Configuration
 * Re-exports from shared library
 *
 * @module cloudflare-worker/modules/config/endpoints
 */

export {
    API_ENDPOINTS,
    buildTposODataUrl,
    buildPancakeUrl,
    buildFacebookGraphUrl,
    buildWorkerUrl
} from '../../../shared/universal/api-endpoints.js';
