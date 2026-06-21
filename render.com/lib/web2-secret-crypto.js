// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 module.
// =====================================================
// WEB 2.0 SECRET CRYPTO — mã hoá AES-256-GCM cho secret nhạy cảm AT-REST
// (Zalo session/cookie/oa_secret/access_token/refresh_token, FB user_token/page token).
//
// THIẾT KẾ AN TOÀN — fallback không vỡ:
//   - Không set env WEB2_ENC_KEY  → mã hoá TẮT: encrypt* trả NGUYÊN bản (plaintext như cũ).
//   - Có WEB2_ENC_KEY (32 byte hex/base64) → encrypt* sinh ciphertext có marker.
//   - decrypt* LUÔN nhận diện marker: có marker → giải mã; KHÔNG marker → coi là
//     plaintext legacy, trả nguyên (zero-lockout khi bật key trên data cũ).
//
// Format string đã mã hoá:  enc:v1:<base64url(iv(12) | tag(16) | ciphertext)>
// Với JSONB (session): bọc { "__enc__": "enc:v1:..." } để cột vẫn là JSON hợp lệ.
//
// KEY: hex 64 ký tự HOẶC base64 32 byte. Sinh: `openssl rand -hex 32`.
// =====================================================
const crypto = require('crypto');

const PREFIX = 'enc:v1:';
const ENC_MARK = '__enc__';

let _key = null;
let _resolved = false;

function _loadKey() {
    if (_resolved) return _key;
    _resolved = true;
    const raw = (process.env.WEB2_ENC_KEY || '').trim();
    if (!raw) {
        _key = null;
        return null;
    }
    let buf = null;
    try {
        if (/^[0-9a-fA-F]{64}$/.test(raw)) buf = Buffer.from(raw, 'hex');
        else buf = Buffer.from(raw, 'base64');
    } catch {
        buf = null;
    }
    if (!buf || buf.length !== 32) {
        console.warn(
            '[WEB2-CRYPTO] WEB2_ENC_KEY không hợp lệ (cần 32 byte hex/base64) → mã hoá TẮT.'
        );
        _key = null;
        return null;
    }
    _key = buf;
    return _key;
}

function isEnabled() {
    return _loadKey() !== null;
}

// Có phải chuỗi đã mã hoá không (để read path nhận diện).
function isCiphertext(s) {
    return typeof s === 'string' && s.startsWith(PREFIX);
}

// plaintext string -> ciphertext string (hoặc nguyên bản nếu tắt / rỗng).
function encryptString(plain) {
    if (plain == null || plain === '') return plain;
    const key = _loadKey();
    if (!key) return plain; // mã hoá tắt → giữ plaintext
    if (isCiphertext(plain)) return plain; // đã mã hoá rồi, không bọc 2 lần
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const ct = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return PREFIX + Buffer.concat([iv, tag, ct]).toString('base64url');
}

// ciphertext string -> plaintext (legacy plaintext trả nguyên). Ném nếu marker
// hợp lệ nhưng giải mã hỏng (sai key/hỏng data) — KHÔNG trả rác âm thầm.
function decryptString(stored) {
    if (!isCiphertext(stored)) return stored; // legacy plaintext / null
    const key = _loadKey();
    if (!key) {
        throw new Error('[WEB2-CRYPTO] data đã mã hoá nhưng thiếu WEB2_ENC_KEY để giải mã');
    }
    const buf = Buffer.from(stored.slice(PREFIX.length), 'base64url');
    const iv = buf.subarray(0, 12);
    const tag = buf.subarray(12, 28);
    const ct = buf.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

// JSON value (vd session object) -> dạng lưu JSONB. Bật key → { __enc__: "..." };
// tắt → trả nguyên object (JSONB như cũ).
function encryptJson(value) {
    if (value == null) return value;
    const key = _loadKey();
    if (!key) return value;
    // audit r8 (CRITICAL): idempotent — value ĐÃ mã hoá ({ __enc__: "enc:v1:..." })
    // thì trả NGUYÊN, KHÔNG bọc lần 2. Gốc bug: web2-zalo persistSession đã
    // encryptJson(credentials) rồi _saveSession encryptJson lần nữa → ciphertext
    // lồng → decryptJson ra { __enc__ } thay vì creds → cookie/imei undefined →
    // restore phiên Zalo FAIL toàn bộ khi WEB2_ENC_KEY bật (đang bật ở prod).
    if (
        typeof value === 'object' &&
        typeof value[ENC_MARK] === 'string' &&
        isCiphertext(value[ENC_MARK])
    ) {
        return value;
    }
    const plain = typeof value === 'string' ? value : JSON.stringify(value);
    return { [ENC_MARK]: encryptString(plain) };
}

// dạng lưu JSONB -> JSON value gốc. Nhận diện { __enc__: ... } → giải mã+parse;
// ngược lại trả nguyên (legacy plain object/string).
function decryptJson(value) {
    if (value && typeof value === 'object' && typeof value[ENC_MARK] === 'string') {
        const plain = decryptString(value[ENC_MARK]);
        try {
            return JSON.parse(plain);
        } catch {
            return plain; // không phải JSON → trả string
        }
    }
    return value; // legacy plaintext object/string
}

module.exports = {
    isEnabled,
    isCiphertext,
    encryptString,
    decryptString,
    encryptJson,
    decryptJson,
};
