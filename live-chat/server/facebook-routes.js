// #Note: Đọc CLAUDE.md, MEMORY.md, docs/dev-log.md trước khi code. Cập nhật dev-log sau thay đổi. | Read these files before coding, update dev-log after changes. | WEB2.0 module.
/**
 * Facebook Graph API routes — merged into web2-realtime (2026-06-14).
 *
 * Ported 1:1 từ service cũ `n2store-facebook` (đã xoá) để gộp toàn bộ tính năng
 * realtime/messaging Web 2.0 vào MỘT service `web2-realtime`. Phục vụ:
 *   - live-chat private-reply (nhắn riêng từ comment) — đường DUY NHẤT đang dùng
 *   - serverMode='n2store' full-chat (conversations/messages/send/upload/find/read)
 *
 * Token Page Access (CRM token cũ đã gỡ 2026-06-14 — Web 2.0 không dùng):
 *   1) cache seed từ fb-tokens.json lúc boot (TTL 5') nếu có
 *   2) env PAGE_TOKEN_<pageId> (FB page token cấp sẵn trong env) — nguồn chính,
 *      đảm bảo private-reply luôn chạy (live-chat reply KHÔNG gửi token).
 */
const express = require('express');
const multer = require('multer');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');

// node-fetch v3 (ESM) — dynamic import, giữ parity với service cũ (tránh
// undici/form-data incompat khi upload multipart).
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));

const router = express.Router();

// Facebook Graph API
const FB_GRAPH_URL = 'https://graph.facebook.com/v21.0';

const TOKEN_FILE = path.join(__dirname, 'fb-tokens.json');
let tokenCache = {};
let lastFetchTime = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function loadTokensFromFile() {
    try {
        if (fs.existsSync(TOKEN_FILE)) {
            const saved = JSON.parse(fs.readFileSync(TOKEN_FILE, 'utf8'));
            tokenCache = saved.tokens || {};
            lastFetchTime = saved.timestamp || 0;
            console.log(`[FB] Loaded ${Object.keys(tokenCache).length} tokens from file`);
        }
    } catch (error) {
        console.error('[FB] Error loading tokens:', error.message);
    }
}

loadTokensFromFile();

/**
 * Page Access Token: env PAGE_TOKEN_<id> (nguồn chính) → cache seed từ
 * fb-tokens.json lúc boot (fallback). CRM fetch cũ đã gỡ 2026-06-14 —
 * Web 2.0 không dùng CRM cũ; live-chat reply KHÔNG gửi token bearer cũ.
 */
async function getPageToken(pageId) {
    const now = Date.now();
    if (tokenCache[pageId] && now - lastFetchTime < CACHE_TTL) {
        return tokenCache[pageId].token;
    }
    const envTok = process.env[`PAGE_TOKEN_${pageId}`];
    if (envTok) return envTok;
    return tokenCache[pageId]?.token || null;
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

function isCommentConversation(convId) {
    return /^\d+_\d+$/.test(convId);
}

// ---- Status (debug) ----
router.get('/api/facebook-status', (req, res) => {
    res.json({
        ok: true,
        merged_into: 'web2-realtime',
        api: 'Facebook Graph API v21.0',
        cachedPages: Object.keys(tokenCache).length,
        lastRefresh: lastFetchTime ? new Date(lastFetchTime).toISOString() : null,
    });
});

// ---- Conversations ----
router.get('/api/pages/:pageId/conversations', async (req, res) => {
    try {
        const { pageId } = req.params;
        const token = await getPageToken(pageId);
        if (!token)
            return res.status(400).json({
                success: false,
                error: `No token for page ${pageId}. Refresh tokens first.`,
            });

        const fields = 'id,participants,updated_time,unread_count,snippet,can_reply';
        const url = `${FB_GRAPH_URL}/${pageId}/conversations?fields=${fields}&access_token=${token}`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });

        const conversations = (data.data || []).map((conv) => {
            const participant = conv.participants?.data?.find((p) => p.id !== pageId) || {};
            return {
                id: conv.id,
                type: 'INBOX',
                page_id: pageId,
                updated_at: conv.updated_time,
                unread_count: conv.unread_count || 0,
                snippet: conv.snippet || '',
                can_reply: conv.can_reply !== false,
                from: { id: participant.id || '', name: participant.name || 'Unknown' },
                from_psid: participant.id || '',
                customers: [
                    {
                        id: participant.id || '',
                        psid: participant.id || '',
                        name: participant.name || 'Unknown',
                    },
                ],
            };
        });
        res.json({ success: true, data: conversations });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Messages (inbox or comment thread) ----
router.get('/api/conversations/:convId/messages', async (req, res) => {
    try {
        const { convId } = req.params;
        const { page_id } = req.query;
        const token = await getPageToken(page_id);
        if (!token)
            return res.status(400).json({ success: false, error: `No token for page ${page_id}` });

        let messages = [];
        if (isCommentConversation(convId)) {
            const commentId = convId.split('_')[1];
            const fields =
                'id,message,from,created_time,attachment,comments{id,message,from,created_time,attachment}';
            const url = `${FB_GRAPH_URL}/${commentId}?fields=${fields}&access_token=${token}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.error)
                return res.status(400).json({ success: false, error: data.error.message });

            messages.push({
                id: data.id,
                conversation_id: convId,
                from: { id: data.from?.id || '', name: data.from?.name || 'Unknown' },
                message: data.message || '',
                inserted_at: data.created_time,
                attachments: data.attachment
                    ? [
                          {
                              type: data.attachment.type === 'photo' ? 'PHOTO' : 'FILE',
                              url: data.attachment.media?.image?.src || data.attachment.url,
                          },
                      ]
                    : [],
            });
            if (data.comments?.data) {
                for (const reply of data.comments.data) {
                    messages.push({
                        id: reply.id,
                        conversation_id: convId,
                        from: { id: reply.from?.id || '', name: reply.from?.name || 'Unknown' },
                        message: reply.message || '',
                        inserted_at: reply.created_time,
                        attachments: reply.attachment
                            ? [
                                  {
                                      type: reply.attachment.type === 'photo' ? 'PHOTO' : 'FILE',
                                      url:
                                          reply.attachment.media?.image?.src ||
                                          reply.attachment.url,
                                  },
                              ]
                            : [],
                    });
                }
            }
            messages.sort((a, b) => new Date(a.inserted_at) - new Date(b.inserted_at));
        } else {
            const fields = 'id,message,from,created_time,attachments,sticker';
            const url = `${FB_GRAPH_URL}/${convId}/messages?fields=${fields}&access_token=${token}`;
            const response = await fetch(url);
            const data = await response.json();
            if (data.error)
                return res.status(400).json({ success: false, error: data.error.message });

            messages = (data.data || []).map((msg) => ({
                id: msg.id,
                conversation_id: convId,
                from: { id: msg.from?.id || '', name: msg.from?.name || 'Unknown' },
                message: msg.message || '',
                inserted_at: msg.created_time,
                attachments: (msg.attachments?.data || []).map((att) => ({
                    id: att.id,
                    type: att.mime_type?.startsWith('image')
                        ? 'PHOTO'
                        : att.mime_type?.startsWith('video')
                          ? 'VIDEO'
                          : 'FILE',
                    url: att.image_data?.url || att.video_data?.url || att.file_url,
                    name: att.name,
                })),
                sticker: msg.sticker,
            }));
        }
        res.json({ success: true, data: { messages } });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Send message (inbox via Send API, or comment reply) ----
router.post('/api/pages/:pageId/messages', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { conversation_id, recipient_id, message, attachment_id, attachment_type } = req.body;
        const token = await getPageToken(pageId);
        if (!token)
            return res.status(400).json({ success: false, error: `No token for page ${pageId}` });

        let data;
        if (conversation_id && isCommentConversation(conversation_id)) {
            const commentId = conversation_id.split('_')[1];
            const url = `${FB_GRAPH_URL}/${commentId}/comments?access_token=${token}`;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: message || '' }),
            });
            data = await response.json();
            if (data.error)
                return res.status(400).json({ success: false, error: data.error.message });
        } else {
            let psid = recipient_id;
            if (!psid && conversation_id) {
                const convUrl = `${FB_GRAPH_URL}/${conversation_id}?fields=participants&access_token=${token}`;
                const convData = await (await fetch(convUrl)).json();
                if (convData.participants?.data) {
                    psid = convData.participants.data.find((p) => p.id !== pageId)?.id;
                }
            }
            if (!psid)
                return res
                    .status(400)
                    .json({ success: false, error: 'recipient_id required for inbox messages' });

            const url = `${FB_GRAPH_URL}/${pageId}/messages?access_token=${token}`;
            let messagePayload = {};
            if (attachment_id) {
                messagePayload = {
                    attachment: { type: attachment_type || 'image', payload: { attachment_id } },
                };
            } else if (message) {
                messagePayload = { text: message };
            } else {
                return res
                    .status(400)
                    .json({ success: false, error: 'message or attachment_id required' });
            }
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    recipient: { id: psid },
                    message: messagePayload,
                    messaging_type: 'RESPONSE',
                }),
            });
            data = await response.json();
            if (data.error)
                return res.status(400).json({ success: false, error: data.error.message });
        }
        res.json({
            success: true,
            data: {
                id: data.message_id,
                message: message || '',
                from: { id: pageId },
                inserted_at: new Date().toISOString(),
            },
        });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Upload attachment ----
router.post('/api/pages/:pageId/upload', upload.single('file'), async (req, res) => {
    try {
        const { pageId } = req.params;
        const token = await getPageToken(pageId);
        if (!token)
            return res.status(400).json({ success: false, error: `No token for page ${pageId}` });
        if (!req.file) return res.status(400).json({ success: false, error: 'No file uploaded' });

        let attachmentType = 'file';
        if (req.file.mimetype.startsWith('image')) attachmentType = 'image';
        else if (req.file.mimetype.startsWith('video')) attachmentType = 'video';
        else if (req.file.mimetype.startsWith('audio')) attachmentType = 'audio';

        const formData = new FormData();
        formData.append(
            'message',
            JSON.stringify({ attachment: { type: attachmentType, payload: { is_reusable: true } } })
        );
        formData.append('filedata', req.file.buffer, {
            filename: req.file.originalname,
            contentType: req.file.mimetype,
        });
        const url = `${FB_GRAPH_URL}/${pageId}/message_attachments?access_token=${token}`;
        const response = await fetch(url, {
            method: 'POST',
            body: formData,
            headers: formData.getHeaders(),
        });
        const data = await response.json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });
        res.json({
            success: true,
            id: data.attachment_id,
            attachment_id: data.attachment_id,
            attachment_type: attachmentType.toUpperCase(),
        });
    } catch (error) {
        console.error('[FB] Upload error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Private reply (nhắn riêng từ comment) — đường live-chat dùng ----
router.post('/api/pages/:pageId/comments/:commentId/private-reply', async (req, res) => {
    try {
        const { pageId, commentId } = req.params;
        const { message } = req.body;
        const token = await getPageToken(pageId);
        if (!token)
            return res.status(400).json({ success: false, error: `No token for page ${pageId}` });
        if (!message) return res.status(400).json({ success: false, error: 'message required' });

        const url = `${FB_GRAPH_URL}/${commentId}/private_replies?access_token=${token}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message }),
        });
        const data = await response.json();
        if (data.error) {
            let errorMessage = data.error.message;
            if (data.error.code === 10903)
                errorMessage =
                    'Private Reply đã được gửi trước đó cho comment này (chỉ được 1 lần)';
            else if (data.error.code === 200)
                errorMessage = 'Không có quyền gửi Private Reply. Cần permission pages_messaging';
            else if (data.error.message?.includes('7 days'))
                errorMessage = 'Comment đã quá 7 ngày, không thể gửi Private Reply';
            return res
                .status(400)
                .json({ success: false, error: errorMessage, facebook_error: data.error });
        }
        res.json({
            success: true,
            message_id: data.id,
            recipient_id: data.recipient_id,
            message,
            info: 'Cuộc hội thoại Messenger mới đã được tạo. Dùng recipient_id để gửi tin nhắn tiếp theo.',
        });
    } catch (error) {
        console.error('[FB] Private Reply error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Find conversation by PSID ----
router.get('/api/pages/:pageId/conversations/find-by-psid', async (req, res) => {
    try {
        const { pageId } = req.params;
        const { psid } = req.query;
        const token = await getPageToken(pageId);
        if (!token)
            return res.status(400).json({ success: false, error: `No token for page ${pageId}` });
        if (!psid) return res.status(400).json({ success: false, error: 'psid required' });

        const fields = 'id,participants,updated_time,snippet';
        const url = `${FB_GRAPH_URL}/${pageId}/conversations?fields=${fields}&access_token=${token}`;
        const data = await (await fetch(url)).json();
        if (data.error) return res.status(400).json({ success: false, error: data.error.message });

        const conversation = (data.data || []).find((conv) =>
            (conv.participants?.data || []).some((p) => p.id === psid)
        );
        if (!conversation)
            return res.json({
                success: false,
                error: 'Không tìm thấy cuộc hội thoại với PSID này',
                hint: 'Conversation có thể chưa được tạo hoặc đã hết hạn',
            });

        const participant = conversation.participants?.data?.find((p) => p.id === psid) || {};
        res.json({
            success: true,
            conversation: {
                id: conversation.id,
                psid,
                customer_name: participant.name || 'Unknown',
                snippet: conversation.snippet,
                updated_time: conversation.updated_time,
            },
        });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

// ---- Mark conversation as read ----
router.post('/api/pages/:pageId/conversations/:convId/read', async (req, res) => {
    try {
        const { pageId, convId } = req.params;
        const token = await getPageToken(pageId);
        if (!token) return res.status(400).json({ success: false, error: 'No token for page' });

        const convUrl = `${FB_GRAPH_URL}/${convId}?fields=participants&access_token=${token}`;
        const convData = await (await fetch(convUrl)).json();
        let psid = null;
        if (convData.participants?.data) {
            psid = convData.participants.data.find((p) => p.id !== pageId)?.id;
        }
        if (!psid) return res.json({ success: true, message: 'No recipient found' });

        const url = `${FB_GRAPH_URL}/${pageId}/messages?access_token=${token}`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ recipient: { id: psid }, sender_action: 'mark_seen' }),
        });
        const data = await response.json();
        res.json({ success: !data.error, data });
    } catch (error) {
        console.error('[FB] Error:', error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
