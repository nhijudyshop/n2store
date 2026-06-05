// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
// =====================================================
// Web 2.0 — Pancake credentials encryption (AES-256-GCM)
// =====================================================
// Mã hoá identity+password để auto-refresh token. Key lấy từ env
// PANCAKE_CREDS_KEY (sha256 → 32 byte). Ciphertext format base64(iv|tag|cipher).
//
// encrypt(plaintext) → base64 string | null
// decrypt(b64)       → plaintext | null
// isConfigured()     → bool (đã có key chưa)

const crypto = require('crypto');

const ALG = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function _key() {
    const raw = process.env.PANCAKE_CREDS_KEY;
    if (!raw) return null;
    // Derive đúng 32 byte từ secret bất kỳ.
    return crypto.createHash('sha256').update(String(raw)).digest();
}

function isConfigured() {
    return !!process.env.PANCAKE_CREDS_KEY;
}

function encrypt(plaintext) {
    const key = _key();
    if (!key || plaintext == null) return null;
    try {
        const iv = crypto.randomBytes(IV_LEN);
        const cipher = crypto.createCipheriv(ALG, key, iv);
        const enc = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
        const tag = cipher.getAuthTag();
        return Buffer.concat([iv, tag, enc]).toString('base64');
    } catch {
        return null;
    }
}

function decrypt(b64) {
    const key = _key();
    if (!key || !b64) return null;
    try {
        const buf = Buffer.from(b64, 'base64');
        const iv = buf.subarray(0, IV_LEN);
        const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
        const enc = buf.subarray(IV_LEN + TAG_LEN);
        const decipher = crypto.createDecipheriv(ALG, key, iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(enc), decipher.final()]).toString('utf8');
    } catch {
        return null;
    }
}

module.exports = { encrypt, decrypt, isConfigured };
