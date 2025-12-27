// =====================================================
// TELEGRAM BOT WITH GEMINI AI INTEGRATION
// Webhook endpoint for Telegram bot powered by Gemini 3 Flash
// Supports: Text chat, Invoice image processing, Group chats
// =====================================================

const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// API Keys from environment variables (set on Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview'; // Latest Gemini 3 Flash model

// =====================================================
// FIREBASE INITIALIZATION
// =====================================================

let db = null;

function getFirestoreDb() {
    if (db) return db;

    try {
        // Check if Firebase is already initialized
        if (admin.apps.length === 0) {
            const projectId = process.env.FIREBASE_PROJECT_ID;
            const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
            const privateKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n');

            if (!projectId || !clientEmail || !privateKey) {
                console.log('[FIREBASE] Missing credentials, Firebase disabled');
                return null;
            }

            admin.initializeApp({
                credential: admin.credential.cert({
                    projectId,
                    clientEmail,
                    privateKey
                })
            });
            console.log('[FIREBASE] Initialized for project:', projectId);
        }

        db = admin.firestore();
        return db;
    } catch (error) {
        console.error('[FIREBASE] Init error:', error.message);
        return null;
    }
}

/**
 * Save invoice to Firestore
 */
async function saveInvoiceToFirebase(invoiceData, chatId, userId) {
    const firestore = getFirestoreDb();
    if (!firestore) {
        throw new Error('Firebase không khả dụng');
    }

    const docData = {
        ...invoiceData,
        chatId: chatId,
        userId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        status: 'confirmed'
    };

    const docRef = await firestore.collection('telegram_invoices').add(docData);
    console.log('[FIREBASE] Invoice saved with ID:', docRef.id);
    return docRef.id;
}

// Bot username (will be fetched on first request)
let BOT_USERNAME = null;

// Store conversation history per chat (in-memory, resets on server restart)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per chat

// Store pending invoice confirmations
const pendingInvoices = new Map();

// =====================================================
// INVOICE EXTRACTION PROMPT
// =====================================================

const INVOICE_EXTRACTION_PROMPT = `Bạn là chuyên gia phân tích hóa đơn viết tay. Hãy phân tích ảnh hóa đơn này và trích xuất thông tin theo format JSON.

QUAN TRỌNG:
- Đọc kỹ từng dòng sản phẩm
- SKU thường là mã số/chữ viết tắt ở đầu dòng
- Số lượng thường ở cuối dòng hoặc sau dấu x
- Nếu không đọc được rõ, ghi "unclear"

Trả về CHÍNH XÁC theo format JSON sau (không có markdown, không có \`\`\`):
{
  "success": true,
  "supplier": "Tên nhà cung cấp (nếu có)",
  "date": "DD/MM/YYYY (nếu có)",
  "products": [
    {"sku": "MÃ_SP", "name": "Tên sản phẩm", "quantity": 10},
    {"sku": "MÃ_SP2", "name": "Tên sản phẩm 2", "quantity": 5}
  ],
  "totalItems": 15,
  "notes": "Ghi chú thêm nếu có"
}

Nếu ảnh không phải hóa đơn hoặc không đọc được:
{
  "success": false,
  "error": "Lý do không xử lý được"
}`;

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Get bot info (username)
 */
async function getBotUsername() {
    if (BOT_USERNAME) return BOT_USERNAME;

    try {
        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getMe`;
        const response = await fetch(url);
        const data = await response.json();
        if (data.ok) {
            BOT_USERNAME = data.result.username;
            console.log('[TELEGRAM] Bot username:', BOT_USERNAME);
        }
    } catch (error) {
        console.error('[TELEGRAM] Failed to get bot info:', error.message);
    }
    return BOT_USERNAME;
}

/**
 * Send message to Telegram chat
 */
async function sendTelegramMessage(chatId, text, replyToMessageId = null, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const body = {
            chat_id: chatId,
            text: text
        };

        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
        }

        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });

        const data = await response.json();
        if (!data.ok) {
            console.error('[TELEGRAM] Send error:', data.description);
        }
        return data;
    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        return null;
    }
}

/**
 * Answer callback query (for inline buttons)
 */
async function answerCallbackQuery(callbackQueryId, text = '') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/answerCallbackQuery`;
    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callback_query_id: callbackQueryId,
                text: text
            })
        });
    } catch (error) {
        console.error('[TELEGRAM] answerCallbackQuery error:', error.message);
    }
}

/**
 * Edit message text
 */
async function editMessageText(chatId, messageId, text, replyMarkup = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/editMessageText`;
    try {
        const body = {
            chat_id: chatId,
            message_id: messageId,
            text: text
        };
        if (replyMarkup) {
            body.reply_markup = replyMarkup;
        }
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        });
        return await response.json();
    } catch (error) {
        console.error('[TELEGRAM] editMessageText error:', error.message);
        return null;
    }
}

/**
 * Send "typing" or "upload_photo" action
 */
async function sendChatAction(chatId, action = 'typing') {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: action
            })
        });
    } catch (error) {
        // Ignore action errors
    }
}

/**
 * Get file from Telegram and return as base64
 */
async function getTelegramFileAsBase64(fileId) {
    // Get file path
    const fileInfoUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getFile?file_id=${fileId}`;
    const fileInfoResponse = await fetch(fileInfoUrl);
    const fileInfo = await fileInfoResponse.json();

    if (!fileInfo.ok) {
        throw new Error('Could not get file info from Telegram');
    }

    // Download file
    const filePath = fileInfo.result.file_path;
    const fileUrl = `https://api.telegram.org/file/bot${TELEGRAM_BOT_TOKEN}/${filePath}`;
    const fileResponse = await fetch(fileUrl);
    const arrayBuffer = await fileResponse.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');

    // Determine mime type
    const extension = filePath.split('.').pop().toLowerCase();
    const mimeTypes = {
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg',
        'png': 'image/png',
        'gif': 'image/gif',
        'webp': 'image/webp'
    };
    const mimeType = mimeTypes[extension] || 'image/jpeg';

    return { base64, mimeType };
}

/**
 * Call Gemini Vision API with image
 */
async function analyzeInvoiceImage(base64Image, mimeType) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                parts: [
                    { text: INVOICE_EXTRACTION_PROMPT },
                    {
                        inline_data: {
                            mime_type: mimeType,
                            data: base64Image
                        }
                    }
                ]
            }],
            generationConfig: {
                temperature: 0.1,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 4096
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const responseText = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!responseText) {
        throw new Error('Empty response from Gemini');
    }

    // Parse JSON response
    try {
        // Clean response (remove markdown code blocks if present)
        let cleanJson = responseText.trim();
        if (cleanJson.startsWith('```')) {
            cleanJson = cleanJson.replace(/```json?\n?/g, '').replace(/```/g, '');
        }
        return JSON.parse(cleanJson);
    } catch (parseError) {
        console.error('[TELEGRAM] JSON parse error:', parseError.message);
        console.error('[TELEGRAM] Raw response:', responseText);
        return {
            success: false,
            error: 'Không thể parse kết quả từ AI',
            rawResponse: responseText
        };
    }
}

/**
 * Call Gemini API with conversation history (for text chat)
 */
async function callGeminiAI(historyKey, userMessage, userName = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    if (!conversationHistory.has(historyKey)) {
        conversationHistory.set(historyKey, []);
    }
    const history = conversationHistory.get(historyKey);

    const messageText = userName ? `[${userName}]: ${userMessage}` : userMessage;

    history.push({
        role: 'user',
        parts: [{ text: messageText }]
    });

    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GEMINI_API_KEY}`;

    const response = await fetch(apiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: history,
            generationConfig: {
                temperature: 0.7,
                topP: 0.95,
                topK: 40,
                maxOutputTokens: 2048
            }
        })
    });

    const data = await response.json();

    if (data.error) {
        throw new Error(data.error.message);
    }

    const aiResponse = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!aiResponse) {
        throw new Error('Empty response from Gemini');
    }

    history.push({
        role: 'model',
        parts: [{ text: aiResponse }]
    });

    return aiResponse;
}

/**
 * Clear conversation history for a chat
 */
function clearHistory(historyKey) {
    conversationHistory.delete(historyKey);
}

/**
 * Check if bot should respond in group
 */
function shouldRespondInGroup(message, botUsername) {
    const text = message.text || message.caption || '';

    // Always respond to commands
    if (text.startsWith('/')) {
        return true;
    }

    // Always respond to photos (invoice processing)
    if (message.photo) {
        return true;
    }

    // Check Telegram entities for mention
    const entities = message.entities || message.caption_entities || [];
    if (entities.length > 0 && botUsername) {
        for (const entity of entities) {
            if (entity.type === 'mention') {
                const mentionText = text.substring(entity.offset, entity.offset + entity.length);
                if (mentionText.toLowerCase() === `@${botUsername.toLowerCase()}`) {
                    console.log('[TELEGRAM] Bot mentioned via entity:', mentionText);
                    return true;
                }
            }
        }
    }

    // Fallback: check if bot username appears in text
    if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        console.log('[TELEGRAM] Bot mentioned in text');
        return true;
    }

    // Respond if message is a reply to bot's message
    if (message.reply_to_message && message.reply_to_message.from?.is_bot) {
        console.log('[TELEGRAM] Reply to bot message');
        return true;
    }

    return false;
}

/**
 * Remove bot mention from text
 */
function removeBotMention(text, botUsername) {
    if (!botUsername) return text;
    const regex = new RegExp(`@${botUsername}\\s*`, 'gi');
    return text.replace(regex, '').trim();
}

/**
 * Format invoice data for display
 */
function formatInvoicePreview(invoiceData) {
    if (!invoiceData.success) {
        return `❌ Không thể xử lý hóa đơn:\n${invoiceData.error}`;
    }

    let text = `📋 KẾT QUẢ PHÂN TÍCH HÓA ĐƠN\n`;
    text += `${'─'.repeat(30)}\n`;

    if (invoiceData.supplier) {
        text += `🏪 NCC: ${invoiceData.supplier}\n`;
    }
    if (invoiceData.date) {
        text += `📅 Ngày: ${invoiceData.date}\n`;
    }

    text += `\n📦 DANH SÁCH SẢN PHẨM:\n`;

    if (invoiceData.products && invoiceData.products.length > 0) {
        invoiceData.products.forEach((p, i) => {
            text += `${i + 1}. ${p.sku || '?'} - ${p.name || 'N/A'}: ${p.quantity} cái\n`;
        });
    } else {
        text += `(Không có sản phẩm)\n`;
    }

    text += `\n📊 Tổng: ${invoiceData.totalItems || 0} sản phẩm`;

    if (invoiceData.notes) {
        text += `\n📝 Ghi chú: ${invoiceData.notes}`;
    }

    return text;
}

// =====================================================
// ROUTES
// =====================================================

// Health check
router.get('/', (req, res) => {
    const firestore = getFirestoreDb();
    res.json({
        status: 'ok',
        service: 'Telegram Bot with Gemini AI',
        model: GEMINI_MODEL,
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        hasFirebase: !!firestore,
        botUsername: BOT_USERNAME,
        activeConversations: conversationHistory.size,
        pendingInvoices: pendingInvoices.size,
        features: ['text_chat', 'invoice_processing', 'group_chat', 'mention_trigger', 'firebase_storage']
    });
});

// Telegram Webhook endpoint
router.post('/webhook', async (req, res) => {
    try {
        // Respond immediately to Telegram
        res.sendStatus(200);

        const update = req.body;

        // Handle callback queries (button clicks)
        if (update.callback_query) {
            const callbackQuery = update.callback_query;
            const chatId = callbackQuery.message.chat.id;
            const messageId = callbackQuery.message.message_id;
            const data = callbackQuery.data;

            await answerCallbackQuery(callbackQuery.id);

            if (data.startsWith('confirm_invoice_')) {
                const invoiceId = data.replace('confirm_invoice_', '');
                const invoiceData = pendingInvoices.get(invoiceId);

                if (invoiceData) {
                    try {
                        // Save to Firebase
                        const userId = callbackQuery.from.id;
                        const docId = await saveInvoiceToFirebase(invoiceData, chatId, userId);
                        pendingInvoices.delete(invoiceId);

                        await editMessageText(chatId, messageId,
                            `✅ ĐÃ LƯU THÀNH CÔNG!\n\n` +
                            `📋 Mã hóa đơn: ${docId}\n` +
                            `📦 Tổng: ${invoiceData.totalItems || 0} sản phẩm\n` +
                            `🏪 NCC: ${invoiceData.supplier || 'N/A'}`
                        );
                    } catch (error) {
                        console.error('[TELEGRAM] Firebase save error:', error.message);
                        await editMessageText(chatId, messageId,
                            `❌ Lỗi lưu hóa đơn:\n${error.message}\n\nVui lòng thử lại.`
                        );
                    }
                } else {
                    await editMessageText(chatId, messageId,
                        `⚠️ Hóa đơn đã hết hạn. Vui lòng gửi lại ảnh.`
                    );
                }
            } else if (data.startsWith('cancel_invoice_')) {
                const invoiceId = data.replace('cancel_invoice_', '');
                pendingInvoices.delete(invoiceId);

                await editMessageText(chatId, messageId,
                    `❌ Đã hủy. Bạn có thể gửi lại ảnh hóa đơn khác.`
                );
            }
            return;
        }

        // Handle message updates
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const chatType = message.chat.type;
            const userId = message.from.id;
            const text = message.text || message.caption || '';
            const firstName = message.from.first_name || 'User';
            const messageId = message.message_id;

            const isGroup = chatType === 'group' || chatType === 'supergroup';
            const chatName = isGroup ? message.chat.title : firstName;

            await getBotUsername();

            console.log(`[TELEGRAM] ${isGroup ? 'Group' : 'Private'} message from ${firstName} in ${chatName}`);

            // In groups, check if should respond
            if (isGroup && !shouldRespondInGroup(message, BOT_USERNAME)) {
                console.log('[TELEGRAM] Skipping - not triggered in group');
                return;
            }

            const historyKey = isGroup ? `group_${chatId}` : `user_${userId}`;

            // ==========================================
            // HANDLE PHOTO MESSAGES (Invoice Processing)
            // ==========================================
            if (message.photo) {
                console.log('[TELEGRAM] Photo received - processing invoice');

                await sendChatAction(chatId, 'typing');
                await sendTelegramMessage(chatId, '🔍 Đang phân tích hóa đơn...', messageId);

                try {
                    // Get the largest photo
                    const photo = message.photo[message.photo.length - 1];
                    const { base64, mimeType } = await getTelegramFileAsBase64(photo.file_id);

                    // Analyze with Gemini Vision
                    const invoiceData = await analyzeInvoiceImage(base64, mimeType);

                    // Format and send preview
                    const previewText = formatInvoicePreview(invoiceData);

                    if (invoiceData.success) {
                        // Generate unique invoice ID
                        const invoiceId = `${chatId}_${Date.now()}`;
                        pendingInvoices.set(invoiceId, invoiceData);

                        // Auto-expire after 10 minutes
                        setTimeout(() => pendingInvoices.delete(invoiceId), 10 * 60 * 1000);

                        // Send with confirmation buttons
                        await sendTelegramMessage(chatId, previewText, messageId, {
                            inline_keyboard: [
                                [
                                    { text: '✅ Xác nhận lưu', callback_data: `confirm_invoice_${invoiceId}` },
                                    { text: '❌ Hủy', callback_data: `cancel_invoice_${invoiceId}` }
                                ]
                            ]
                        });
                    } else {
                        await sendTelegramMessage(chatId, previewText, messageId);
                    }

                } catch (error) {
                    console.error('[TELEGRAM] Invoice processing error:', error.message);
                    await sendTelegramMessage(chatId,
                        `❌ Lỗi xử lý hóa đơn:\n${error.message}`,
                        messageId
                    );
                }
                return;
            }

            // ==========================================
            // HANDLE TEXT MESSAGES
            // ==========================================

            const commandText = text?.split('@')[0];

            // /start command
            if (commandText === '/start') {
                clearHistory(historyKey);
                const groupNote = isGroup
                    ? `\n\nTrong nhóm:\n- Tag @${BOT_USERNAME} để hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `Xin chào ${firstName}! 👋\n\n` +
                    `Tôi là Gemini AI Assistant.\n\n` +
                    `📸 Gửi ẢNH HÓA ĐƠN để tôi phân tích\n` +
                    `💬 Hoặc nhắn tin để trò chuyện với AI\n\n` +
                    `Các lệnh:\n` +
                    `/start - Bắt đầu lại\n` +
                    `/clear - Xóa lịch sử chat\n` +
                    `/help - Hướng dẫn` +
                    groupNote,
                    messageId
                );
                return;
            }

            // /clear command
            if (commandText === '/clear') {
                clearHistory(historyKey);
                await sendTelegramMessage(chatId,
                    'Đã xóa lịch sử trò chuyện!',
                    messageId
                );
                return;
            }

            // /help command
            if (commandText === '/help') {
                const groupHelp = isGroup
                    ? `\n\nCách dùng trong nhóm:\n- Tag @${BOT_USERNAME} + câu hỏi\n- Hoặc reply tin nhắn của bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `📖 HƯỚNG DẪN SỬ DỤNG\n` +
                    `${'─'.repeat(25)}\n\n` +
                    `📸 XỬ LÝ HÓA ĐƠN:\n` +
                    `- Gửi ảnh hóa đơn viết tay\n` +
                    `- Bot sẽ phân tích và trích xuất dữ liệu\n` +
                    `- Xác nhận để lưu vào hệ thống\n\n` +
                    `💬 TRÒ CHUYỆN AI:\n` +
                    `- Gửi tin nhắn bất kỳ\n` +
                    `- Bot sẽ trả lời bằng Gemini AI\n\n` +
                    `Model: ${GEMINI_MODEL}` +
                    groupHelp,
                    messageId
                );
                return;
            }

            // Regular text message - chat with AI
            if (!text) {
                await sendTelegramMessage(chatId,
                    'Gửi tin nhắn văn bản hoặc ảnh hóa đơn để tôi xử lý.',
                    messageId
                );
                return;
            }

            if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
                await sendTelegramMessage(chatId,
                    'Bot chưa được cấu hình đầy đủ.',
                    messageId
                );
                return;
            }

            const cleanText = removeBotMention(text, BOT_USERNAME);

            if (!cleanText) {
                await sendTelegramMessage(chatId, 'Bạn muốn hỏi gì?', messageId);
                return;
            }

            await sendChatAction(chatId, 'typing');

            try {
                const aiResponse = await callGeminiAI(
                    historyKey,
                    cleanText,
                    isGroup ? firstName : null
                );

                if (aiResponse.length > 4000) {
                    const chunks = aiResponse.match(/[\s\S]{1,4000}/g) || [];
                    for (let i = 0; i < chunks.length; i++) {
                        await sendTelegramMessage(
                            chatId,
                            chunks[i],
                            i === 0 ? messageId : null
                        );
                    }
                } else {
                    await sendTelegramMessage(chatId, aiResponse, messageId);
                }

            } catch (error) {
                console.error('[TELEGRAM] Gemini error:', error.message);
                await sendTelegramMessage(chatId,
                    `Có lỗi xảy ra:\n${error.message}`,
                    messageId
                );
            }
        }

    } catch (error) {
        console.error('[TELEGRAM] Webhook error:', error.message);
    }
});

// Manual send endpoint
router.post('/send', async (req, res) => {
    try {
        const { chatId, text } = req.body;

        if (!chatId || !text) {
            return res.status(400).json({ error: 'Missing chatId or text' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const result = await sendTelegramMessage(chatId, text);
        res.json(result);

    } catch (error) {
        console.error('[TELEGRAM] Send error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Set webhook URL
router.post('/setWebhook', async (req, res) => {
    try {
        const { webhookUrl } = req.body;

        if (!webhookUrl) {
            return res.status(400).json({ error: 'Missing webhookUrl' });
        }

        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url: webhookUrl,
                allowed_updates: ['message', 'callback_query']
            })
        });

        const data = await response.json();
        console.log('[TELEGRAM] Webhook set:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] setWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Get webhook info
router.get('/webhookInfo', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo`;
        const response = await fetch(url);
        const data = await response.json();

        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] webhookInfo error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// Delete webhook
router.post('/deleteWebhook', async (req, res) => {
    try {
        if (!TELEGRAM_BOT_TOKEN) {
            return res.status(500).json({ error: 'TELEGRAM_BOT_TOKEN not configured' });
        }

        const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/deleteWebhook`;
        const response = await fetch(url);
        const data = await response.json();

        console.log('[TELEGRAM] Webhook deleted:', data);
        res.json(data);

    } catch (error) {
        console.error('[TELEGRAM] deleteWebhook error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

module.exports = router;
