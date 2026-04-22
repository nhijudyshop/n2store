// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
/**
 * Telegram alert helper — fire-and-forget notifications for crashes,
 * unhandled errors, and critical state changes. Silently no-ops if
 * TELEGRAM_BOT_TOKEN or TELEGRAM_ADMIN_CHAT_ID is not set.
 *
 * Dedup: same (tag, message-prefix) is throttled to once per 60s.
 */

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TG_CHAT = process.env.TELEGRAM_ADMIN_CHAT_ID;
const SERVICE = process.env.RENDER_SERVICE_NAME || process.env.SERVICE_NAME || 'n2store-fallback';

const _alertCache = new Map();
const DEDUP_MS = 60_000;

async function sendAlert(tag, message, details = '') {
    if (!TG_TOKEN || !TG_CHAT) return;
    const key = `${tag}:${String(message).slice(0, 120)}`;
    const now = Date.now();
    const last = _alertCache.get(key);
    if (last && now - last < DEDUP_MS) return;
    _alertCache.set(key, now);

    // Prune stale cache entries periodically
    if (_alertCache.size > 200) {
        const cutoff = now - DEDUP_MS * 10;
        for (const [k, t] of _alertCache) if (t < cutoff) _alertCache.delete(k);
    }

    const body = `🚨 [${SERVICE}] [${tag}]\n${message}${details ? `\n\n\`\`\`\n${String(details).slice(0, 3500)}\n\`\`\`` : ''}`.slice(0, 4000);
    try {
        const r = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: TG_CHAT,
                text: body,
                parse_mode: 'Markdown',
                disable_web_page_preview: true
            }),
            signal: AbortSignal.timeout(5000)
        });
        if (!r.ok) console.warn('[ALERT] TG send failed:', r.status, await r.text().catch(() => ''));
    } catch (e) {
        console.warn('[ALERT] TG send error:', e.message);
    }
}

module.exports = { sendAlert };
