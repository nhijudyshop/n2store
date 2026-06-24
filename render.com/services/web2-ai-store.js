// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | WEB2.0 MODULE.
/**
 * Web 2.0 — Trợ lý AI: LƯU TRỮ server-side (ảnh + prompt + hội thoại). Pool web2Db.
 *
 * Vì sao: (1) kiểm soát chi phí Nano Banana (đếm quota/ngày để giới hạn), (2) khỏi mất
 * công tạo lại — ảnh + prompt + đoạn chat được lưu lại, xem/tải lại trên mọi máy.
 *
 * Bảng (web2_ai_images, web2_ai_chats) tạo lazy idempotent (ensure 1 lần/process).
 * Ảnh lưu BYTEA (như purchase_order_images) — KHÔNG dùng CDN ngoài (policy Bunny).
 */
'use strict';

const MS_DAY = 86400000;
const TZ_OFFSET_MS = 7 * 3600000; // GMT+7 (Asia/Ho_Chi_Minh) — mốc "ngày" cho quota
const MAX_STORE_BYTES = 12 * 1024 * 1024; // bỏ qua lưu BYTEA nếu ảnh > 12MB (bảo vệ DB)

let _ensured = null; // Promise cache — ensureTables chạy đúng 1 lần/process (chống race).

function ensureTables(db) {
    if (_ensured) return _ensured;
    _ensured = (async () => {
        await db.query(`
            CREATE TABLE IF NOT EXISTS web2_ai_images (
                id          BIGSERIAL PRIMARY KEY,
                user_id     INTEGER,
                username    TEXT,
                provider    TEXT,
                model       TEXT,
                kind        TEXT,
                prompt      TEXT,
                mime        TEXT,
                bytes       BYTEA,
                url         TEXT,
                width       INTEGER,
                height      INTEGER,
                created_at  BIGINT
            );
            CREATE INDEX IF NOT EXISTS idx_web2_ai_images_user
                ON web2_ai_images(user_id, created_at DESC);
            CREATE TABLE IF NOT EXISTS web2_ai_chats (
                id          TEXT PRIMARY KEY,
                user_id     INTEGER,
                username    TEXT,
                title       TEXT,
                provider    TEXT,
                model       TEXT,
                messages    JSONB,
                created_at  BIGINT,
                updated_at  BIGINT
            );
            CREATE INDEX IF NOT EXISTS idx_web2_ai_chats_user
                ON web2_ai_chats(user_id, updated_at DESC);
        `);
    })().catch((e) => {
        _ensured = null; // cho phép thử lại lần sau nếu ensure lỗi (vd boot window)
        throw e;
    });
    return _ensured;
}

// Mốc đầu ngày GMT+7 (epoch ms) — đếm quota theo ngày local VN, không lệch theo TZ server.
function startOfDayGmt7(nowMs) {
    return Math.floor((nowMs + TZ_OFFSET_MS) / MS_DAY) * MS_DAY - TZ_OFFSET_MS;
}

// Tách dataURL → {mime, buf}. Trả null nếu không phải dataURL hợp lệ.
function _parseDataUrl(dataUrl) {
    const m = /^data:([^;]+);base64,(.*)$/s.exec(String(dataUrl || ''));
    if (!m) return null;
    try {
        return { mime: m[1], buf: Buffer.from(m[2], 'base64') };
    } catch {
        return null;
    }
}

// Đếm số ảnh TRẢ PHÍ (provider gemini = Nano Banana) user đã tạo HÔM NAY (GMT+7).
async function countPaidToday(db, userId, nowMs) {
    if (!userId) return 0;
    await ensureTables(db);
    const since = startOfDayGmt7(nowMs);
    const r = await db.query(
        `SELECT COUNT(*)::int AS n FROM web2_ai_images
          WHERE user_id = $1 AND provider = 'gemini' AND created_at >= $2`,
        [userId, since]
    );
    return r.rows[0]?.n || 0;
}

// Lưu 1 ảnh đã tạo (best-effort). out = {provider, dataUrl?|url?}. Trả {id, created_at} hoặc null.
async function saveImage(
    db,
    { userId, username, provider, model, kind, prompt, out, width, height }
) {
    await ensureTables(db);
    const createdAt = Date.now();
    let mime = null,
        bytes = null,
        url = null;
    const parsed = out && out.dataUrl ? _parseDataUrl(out.dataUrl) : null;
    if (parsed && parsed.buf.length <= MAX_STORE_BYTES) {
        mime = parsed.mime;
        bytes = parsed.buf;
    } else if (out && out.url) {
        url = String(out.url).slice(0, 2000);
    } else if (parsed) {
        // Ảnh quá lớn để lưu BYTEA → vẫn ghi metadata (prompt) cho lịch sử, bỏ bytes.
        mime = parsed.mime;
    }
    const r = await db.query(
        `INSERT INTO web2_ai_images
            (user_id, username, provider, model, kind, prompt, mime, bytes, url, width, height, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         RETURNING id, created_at`,
        [
            userId || null,
            username || null,
            provider || null,
            model || null,
            kind || 'image',
            String(prompt || '').slice(0, 4000),
            mime,
            bytes,
            url,
            Number.isFinite(+width) ? +width : null,
            Number.isFinite(+height) ? +height : null,
            createdAt,
        ]
    );
    return r.rows[0] || null;
}

// Liệt kê ảnh (metadata, KHÔNG bytes). Non-admin chỉ thấy của mình.
async function listImages(db, { userId, isAdmin, all, limit, offset }) {
    await ensureTables(db);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 40, 1), 200);
    const off = Math.max(parseInt(offset, 10) || 0, 0);
    const ownAll = isAdmin && all;
    const where = ownAll ? '' : 'WHERE user_id = $3';
    const params = ownAll ? [lim, off] : [lim, off, userId || -1];
    const r = await db.query(
        `SELECT id, user_id, username, provider, model, kind, prompt, mime, url, width, height,
                created_at, (bytes IS NOT NULL) AS has_bytes
           FROM web2_ai_images
           ${where}
          ORDER BY created_at DESC
          LIMIT $1 OFFSET $2`,
        params
    );
    return r.rows;
}

// Lấy bytes 1 ảnh (kèm user_id để check quyền ở route).
async function getImage(db, id) {
    await ensureTables(db);
    const r = await db.query(
        `SELECT id, user_id, mime, bytes, url FROM web2_ai_images WHERE id = $1`,
        [parseInt(id, 10) || -1]
    );
    return r.rows[0] || null;
}

async function deleteImage(db, id, userId, isAdmin) {
    await ensureTables(db);
    const cond = isAdmin ? 'id = $1' : 'id = $1 AND user_id = $2';
    const params = isAdmin ? [parseInt(id, 10) || -1] : [parseInt(id, 10) || -1, userId || -1];
    const r = await db.query(`DELETE FROM web2_ai_images WHERE ${cond} RETURNING id`, params);
    return r.rowCount > 0;
}

// ───────────────────────── Hội thoại (chat) ─────────────────────────
// Upsert 1 cuộc trò chuyện (id do client sinh). Chỉ chủ sở hữu (hoặc bản ghi chưa có user)
// được ghi đè → tránh user A đè chat user B.
async function upsertChat(db, { id, userId, username, title, provider, model, messages }) {
    await ensureTables(db);
    const now = Date.now();
    const msgJson = JSON.stringify(Array.isArray(messages) ? messages : []);
    const r = await db.query(
        `INSERT INTO web2_ai_chats (id, user_id, username, title, provider, model, messages, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8,$8)
         ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            provider = EXCLUDED.provider,
            model = EXCLUDED.model,
            messages = EXCLUDED.messages,
            updated_at = EXCLUDED.updated_at
          WHERE web2_ai_chats.user_id IS NULL OR web2_ai_chats.user_id = $2
         RETURNING id, updated_at`,
        [
            String(id).slice(0, 64),
            userId || null,
            username || null,
            String(title || '').slice(0, 200),
            provider || null,
            model || null,
            msgJson,
            now,
        ]
    );
    return r.rows[0] || null;
}

async function listChats(db, { userId, isAdmin, all, limit }) {
    await ensureTables(db);
    const lim = Math.min(Math.max(parseInt(limit, 10) || 50, 1), 200);
    const ownAll = isAdmin && all;
    const where = ownAll ? '' : 'WHERE user_id = $2';
    const params = ownAll ? [lim] : [lim, userId || -1];
    const r = await db.query(
        `SELECT id, user_id, username, title, provider, model, updated_at, created_at
           FROM web2_ai_chats ${where}
          ORDER BY updated_at DESC LIMIT $1`,
        params
    );
    return r.rows;
}

async function getChat(db, id, userId, isAdmin) {
    await ensureTables(db);
    const r = await db.query(`SELECT * FROM web2_ai_chats WHERE id = $1`, [
        String(id).slice(0, 64),
    ]);
    const row = r.rows[0];
    if (!row) return null;
    if (!isAdmin && row.user_id && row.user_id !== userId) return null; // không phải của mình
    return row;
}

async function deleteChat(db, id, userId, isAdmin) {
    await ensureTables(db);
    const cond = isAdmin ? 'id = $1' : 'id = $1 AND (user_id = $2 OR user_id IS NULL)';
    const params = isAdmin ? [String(id).slice(0, 64)] : [String(id).slice(0, 64), userId || -1];
    const r = await db.query(`DELETE FROM web2_ai_chats WHERE ${cond} RETURNING id`, params);
    return r.rowCount > 0;
}

module.exports = {
    ensureTables,
    startOfDayGmt7,
    countPaidToday,
    saveImage,
    listImages,
    getImage,
    deleteImage,
    upsertChat,
    listChats,
    getChat,
    deleteChat,
};
