// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// BUNNY STORAGE SERVICE — for AI KOL Studio
// Wraps Bunny Storage REST API for upload/download/delete.
// CDN delivery via pull zone https://<BUNNY_CDN_HOSTNAME>/<key>
// =====================================================

const https = require('https');

const ZONE = process.env.BUNNY_STORAGE_ZONE || 'n2store-aikol';
const KEY = process.env.BUNNY_STORAGE_KEY;
const CDN_HOSTNAME = process.env.BUNNY_CDN_HOSTNAME || `${ZONE}.b-cdn.net`;
// Endpoint format depends on storage region. Frankfurt = storage.bunnycdn.com
// (Singapore = sg.storage.bunnycdn.com, NY = ny.storage.bunnycdn.com, etc.)
const ENDPOINT_HOST = (process.env.BUNNY_STORAGE_ENDPOINT || 'https://storage.bunnycdn.com')
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '');

if (!KEY) {
    console.warn('[bunny-storage] BUNNY_STORAGE_KEY is not set — uploads will fail');
}

/**
 * Upload a buffer to Bunny Storage.
 * @param {Buffer} buffer - file bytes
 * @param {string} key - storage key, e.g. 'aikol/models/123.jpg'
 * @param {string} [contentType] - MIME type
 * @returns {Promise<{ok:true, key:string, cdnUrl:string, size:number}>}
 */
function uploadBuffer(buffer, key, contentType = 'application/octet-stream') {
    if (!KEY) throw new Error('BUNNY_STORAGE_KEY not configured');
    if (!buffer || !Buffer.isBuffer(buffer)) throw new Error('buffer is required');
    if (!key || typeof key !== 'string') throw new Error('key is required');

    const cleanKey = key.replace(/^\/+/, '');

    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: ENDPOINT_HOST,
                method: 'PUT',
                path: `/${ZONE}/${cleanKey}`,
                headers: {
                    AccessKey: KEY,
                    'Content-Type': contentType,
                    'Content-Length': buffer.length,
                },
            },
            (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        resolve({
                            ok: true,
                            key: cleanKey,
                            cdnUrl: `https://${CDN_HOSTNAME}/${cleanKey}`,
                            size: buffer.length,
                        });
                    } else {
                        reject(new Error(`Bunny upload ${res.statusCode}: ${body.slice(0, 300)}`));
                    }
                });
            }
        );
        req.on('error', reject);
        req.write(buffer);
        req.end();
    });
}

/**
 * Delete an object from Bunny Storage.
 * @param {string} key
 * @returns {Promise<{ok:boolean, status:number}>}
 */
function deleteObject(key) {
    if (!KEY) throw new Error('BUNNY_STORAGE_KEY not configured');
    const cleanKey = key.replace(/^\/+/, '');
    return new Promise((resolve, reject) => {
        const req = https.request(
            {
                hostname: ENDPOINT_HOST,
                method: 'DELETE',
                path: `/${ZONE}/${cleanKey}`,
                headers: { AccessKey: KEY },
            },
            (res) => {
                let body = '';
                res.on('data', (c) => (body += c));
                res.on('end', () => {
                    // 200 = ok, 404 = already gone (treat as ok)
                    resolve({
                        ok: res.statusCode === 200 || res.statusCode === 404,
                        status: res.statusCode,
                    });
                });
            }
        );
        req.on('error', reject);
        req.end();
    });
}

/**
 * Build the public CDN URL for a stored key.
 * Files served via 30-day cache by default (configured in Bunny pull zone).
 */
function cdnUrl(key) {
    if (!key) return null;
    return `https://${CDN_HOSTNAME}/${key.replace(/^\/+/, '')}`;
}

module.exports = {
    uploadBuffer,
    deleteObject,
    cdnUrl,
    ZONE,
    CDN_HOSTNAME,
};
