// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi.
// =====================================================
// AIKOL TELEGRAM SERVICE — send notifications on gen completion / topup paid.
//
// Reads `TELEGRAM_BOT_TOKEN` from env (already configured for the main bot).
// Users link their chat_id via /api/aikol/settings PATCH (settings page).
// =====================================================

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const pool = require('../db/pool');

async function sendTelegramMessage(chatId, text) {
    if (!TELEGRAM_BOT_TOKEN) {
        console.warn('[aikol-telegram] TELEGRAM_BOT_TOKEN not set — skipping notification');
        return { ok: false, reason: 'no_token' };
    }
    if (!chatId) return { ok: false, reason: 'no_chat_id' };
    try {
        const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text,
                parse_mode: 'Markdown',
                disable_web_page_preview: true,
            }),
        });
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok && data.ok, status: res.status, data };
    } catch (e) {
        console.warn('[aikol-telegram] sendMessage failed:', e.message);
        return { ok: false, error: e.message };
    }
}

/**
 * Look up user's notification preferences + chat_id, then send if applicable.
 * Returns { ok, reason }. Never throws — telegram is best-effort.
 */
async function notifyUser(userId, kind, text) {
    try {
        const { rows } = await pool.query(
            `SELECT telegram_chat_id, notify_on_done, notify_on_error
             FROM aikol_user_settings WHERE user_id = $1`,
            [userId]
        );
        const s = rows[0];
        if (!s || !s.telegram_chat_id) return { ok: false, reason: 'no_chat_id' };
        if (kind === 'done' && !s.notify_on_done) return { ok: false, reason: 'opted_out_done' };
        if (kind === 'error' && !s.notify_on_error) {
            return { ok: false, reason: 'opted_out_error' };
        }
        return await sendTelegramMessage(s.telegram_chat_id, text);
    } catch (e) {
        console.warn('[aikol-telegram] notifyUser failed:', e.message);
        return { ok: false, error: e.message };
    }
}

module.exports = { sendTelegramMessage, notifyUser };
