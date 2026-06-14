// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes.
// =====================================================
// DELIVERY REPORT — TELEGRAM HANDOVER PHOTO (Web 1.0 module)
// Gửi ảnh bàn giao từ trang delivery-report vào nhóm Telegram.
// Bot RIÊNG cho delivery-report — KHÔNG dùng chung TELEGRAM_BOT_TOKEN
// của bot Gemini/alert hiện có.
// Env (Render): DELIVERY_REPORT_TELEGRAM_BOT_TOKEN, DELIVERY_REPORT_TELEGRAM_CHAT_ID
// =====================================================

const express = require('express');
const router = express.Router();

const BOT_TOKEN = process.env.DELIVERY_REPORT_TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.DELIVERY_REPORT_TELEGRAM_CHAT_ID;

const MAX_IMAGE_BYTES = 9 * 1024 * 1024; // Telegram sendPhoto giới hạn 10MB
const MAX_DOCUMENT_BYTES = 45 * 1024 * 1024; // Telegram sendDocument giới hạn 50MB
const MAX_CAPTION_LENGTH = 1024; // Telegram caption limit
const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = 30;
const TELEGRAM_TIMEOUT_MS = 20_000;

let _hits = [];

function isRateLimited() {
    const now = Date.now();
    _hits = _hits.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
    if (_hits.length >= RATE_LIMIT_MAX) return true;
    _hits = [..._hits, now];
    return false;
}

// GET /api/delivery-report-telegram/status — check bot đã cấu hình chưa (không lộ secret)
router.get('/status', (req, res) => {
    res.json({ success: true, configured: Boolean(BOT_TOKEN && CHAT_ID) });
});

// POST /api/delivery-report-telegram/send-photo
// Body: { image: <dataURL hoặc base64 PNG>, caption?: string }
router.post('/send-photo', async (req, res) => {
    try {
        if (!BOT_TOKEN || !CHAT_ID) {
            return res.status(503).json({
                success: false,
                error: 'Bot Telegram delivery-report chưa cấu hình (thiếu env DELIVERY_REPORT_TELEGRAM_BOT_TOKEN / DELIVERY_REPORT_TELEGRAM_CHAT_ID trên Render)',
            });
        }
        if (isRateLimited()) {
            return res
                .status(429)
                .json({ success: false, error: 'Quá nhiều request, thử lại sau 1 phút' });
        }

        const { image, caption } = req.body || {};
        if (typeof image !== 'string' || !image) {
            return res
                .status(400)
                .json({ success: false, error: 'Thiếu field image (base64 PNG)' });
        }

        const base64 = image.replace(/^data:image\/\w+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length) {
            return res
                .status(400)
                .json({ success: false, error: 'image không phải base64 hợp lệ' });
        }
        if (buffer.length > MAX_IMAGE_BYTES) {
            return res.status(400).json({
                success: false,
                error: `Ảnh vượt giới hạn ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB`,
            });
        }

        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        if (caption) form.append('caption', String(caption).slice(0, MAX_CAPTION_LENGTH));
        form.append('photo', new Blob([buffer], { type: 'image/png' }), 'handover.png');

        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendPhoto`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        });
        const tgJson = await tgRes.json().catch(() => ({}));
        if (!tgRes.ok || !tgJson.ok) {
            console.error(
                '[DELIVERY-REPORT-TG] sendPhoto failed:',
                tgRes.status,
                tgJson.description || ''
            );
            return res.status(502).json({
                success: false,
                error: `Telegram API lỗi: ${tgJson.description || `HTTP ${tgRes.status}`}`,
            });
        }

        console.log(
            `[DELIVERY-REPORT-TG] Photo sent (${Math.round(buffer.length / 1024)}KB) → chat ${CHAT_ID}`
        );
        res.json({ success: true, messageId: tgJson.result?.message_id || null });
    } catch (error) {
        console.error('[DELIVERY-REPORT-TG] send-photo error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// POST /api/delivery-report-telegram/send-document
// Body: { document: <dataURL hoặc base64>, filename: string, caption?: string, mimeType?: string }
// Gửi file (vd Excel .xlsx) kèm danh sách đơn bàn giao vào nhóm Telegram.
router.post('/send-document', async (req, res) => {
    try {
        if (!BOT_TOKEN || !CHAT_ID) {
            return res.status(503).json({
                success: false,
                error: 'Bot Telegram delivery-report chưa cấu hình (thiếu env DELIVERY_REPORT_TELEGRAM_BOT_TOKEN / DELIVERY_REPORT_TELEGRAM_CHAT_ID trên Render)',
            });
        }
        if (isRateLimited()) {
            return res
                .status(429)
                .json({ success: false, error: 'Quá nhiều request, thử lại sau 1 phút' });
        }

        const { document, filename, caption, mimeType } = req.body || {};
        if (typeof document !== 'string' || !document) {
            return res.status(400).json({ success: false, error: 'Thiếu field document (base64)' });
        }
        const safeName =
            typeof filename === 'string' && filename.trim()
                ? filename
                      .trim()
                      .replace(/[\r\n"]/g, '')
                      .slice(0, 200)
                : 'banggiao.xlsx';

        const base64 = document.replace(/^data:[^;]+;base64,/, '');
        const buffer = Buffer.from(base64, 'base64');
        if (!buffer.length) {
            return res
                .status(400)
                .json({ success: false, error: 'document không phải base64 hợp lệ' });
        }
        if (buffer.length > MAX_DOCUMENT_BYTES) {
            return res.status(400).json({
                success: false,
                error: `File vượt giới hạn ${Math.round(MAX_DOCUMENT_BYTES / 1024 / 1024)}MB`,
            });
        }

        const form = new FormData();
        form.append('chat_id', CHAT_ID);
        if (caption) form.append('caption', String(caption).slice(0, MAX_CAPTION_LENGTH));
        form.append('document', new Blob([buffer], { type: mimeType || XLSX_MIME }), safeName);

        const tgRes = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendDocument`, {
            method: 'POST',
            body: form,
            signal: AbortSignal.timeout(TELEGRAM_TIMEOUT_MS),
        });
        const tgJson = await tgRes.json().catch(() => ({}));
        if (!tgRes.ok || !tgJson.ok) {
            console.error(
                '[DELIVERY-REPORT-TG] sendDocument failed:',
                tgRes.status,
                tgJson.description || ''
            );
            return res.status(502).json({
                success: false,
                error: `Telegram API lỗi: ${tgJson.description || `HTTP ${tgRes.status}`}`,
            });
        }

        console.log(
            `[DELIVERY-REPORT-TG] Document sent (${safeName}, ${Math.round(buffer.length / 1024)}KB) → chat ${CHAT_ID}`
        );
        res.json({ success: true, messageId: tgJson.result?.message_id || null });
    } catch (error) {
        console.error('[DELIVERY-REPORT-TG] send-document error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
