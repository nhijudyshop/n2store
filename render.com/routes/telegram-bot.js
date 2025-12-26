// =====================================================
// TELEGRAM BOT WITH GEMINI AI INTEGRATION
// Webhook endpoint for Telegram bot powered by Gemini 3 Flash
// Supports both private chats and group chats
// =====================================================

const express = require('express');
const router = express.Router();

// API Keys from environment variables (set on Render)
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = 'gemini-3-flash-preview';

// Bot username (will be fetched on first request)
let BOT_USERNAME = null;

// Store conversation history per chat (in-memory, resets on server restart)
const conversationHistory = new Map();
const MAX_HISTORY_LENGTH = 20; // Keep last 20 messages per chat

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
async function sendTelegramMessage(chatId, text, replyToMessageId = null) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;

    try {
        const body = {
            chat_id: chatId,
            text: text
        };

        // Reply to specific message in groups
        if (replyToMessageId) {
            body.reply_to_message_id = replyToMessageId;
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
 * Send "typing" action to show bot is processing
 */
async function sendTypingAction(chatId) {
    const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendChatAction`;

    try {
        await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                action: 'typing'
            })
        });
    } catch (error) {
        // Ignore typing action errors
    }
}

/**
 * Call Gemini API with conversation history
 * @param {string} historyKey - Key for conversation history (chatId for groups, oderId for private)
 * @param {string} userMessage - User's message
 * @param {string} userName - User's name for context
 */
async function callGeminiAI(historyKey, userMessage, userName = null) {
    if (!GEMINI_API_KEY) {
        throw new Error('GEMINI_API_KEY not configured');
    }

    // Get or create conversation history
    if (!conversationHistory.has(historyKey)) {
        conversationHistory.set(historyKey, []);
    }
    const history = conversationHistory.get(historyKey);

    // Format message with username for group context
    const messageText = userName ? `[${userName}]: ${userMessage}` : userMessage;

    // Add user message to history
    history.push({
        role: 'user',
        parts: [{ text: messageText }]
    });

    // Trim history if too long
    while (history.length > MAX_HISTORY_LENGTH) {
        history.shift();
    }

    // Build API request with full conversation history
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

    // Add AI response to history
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
    const text = message.text || '';

    // Always respond to commands
    if (text.startsWith('/')) {
        return true;
    }

    // Respond if bot is mentioned
    if (botUsername && text.toLowerCase().includes(`@${botUsername.toLowerCase()}`)) {
        return true;
    }

    // Respond if message is a reply to bot's message
    if (message.reply_to_message && message.reply_to_message.from?.is_bot) {
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

// =====================================================
// ROUTES
// =====================================================

// Health check
router.get('/', (req, res) => {
    res.json({
        status: 'ok',
        service: 'Telegram Bot with Gemini AI',
        model: GEMINI_MODEL,
        hasBotToken: !!TELEGRAM_BOT_TOKEN,
        hasGeminiKey: !!GEMINI_API_KEY,
        botUsername: BOT_USERNAME,
        activeConversations: conversationHistory.size,
        features: ['private_chat', 'group_chat', 'mention_trigger', 'reply_trigger']
    });
});

// Telegram Webhook endpoint
// POST /api/telegram/webhook
router.post('/webhook', async (req, res) => {
    try {
        // Respond immediately to Telegram
        res.sendStatus(200);

        const update = req.body;

        // Handle message updates
        if (update.message) {
            const message = update.message;
            const chatId = message.chat.id;
            const chatType = message.chat.type; // 'private', 'group', 'supergroup'
            const userId = message.from.id;
            const text = message.text;
            const firstName = message.from.first_name || 'User';
            const messageId = message.message_id;

            const isGroup = chatType === 'group' || chatType === 'supergroup';
            const chatName = isGroup ? message.chat.title : firstName;

            // Get bot username for mention detection
            await getBotUsername();

            console.log(`[TELEGRAM] ${isGroup ? 'Group' : 'Private'} message from ${firstName} in ${chatName}: ${text?.substring(0, 50)}...`);

            // In groups, only respond if mentioned, replied to, or command
            if (isGroup && !shouldRespondInGroup(message, BOT_USERNAME)) {
                return; // Ignore message in group if not triggered
            }

            // Use chatId for groups (shared history), oderId for private (per user)
            const historyKey = isGroup ? `group_${chatId}` : `user_${userId}`;

            // Handle commands (remove @botname from commands in groups)
            const commandText = text?.split('@')[0];

            if (commandText === '/start') {
                clearHistory(historyKey);
                const groupNote = isGroup
                    ? `\n\nTrong nhom:\n- Tag @${BOT_USERNAME} de hoi\n- Hoac reply tin nhan cua bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `Xin chao ${firstName}!\n\n` +
                    `Toi la Gemini AI Assistant.\n` +
                    `Ban co the hoi toi bat ky dieu gi!\n\n` +
                    `Cac lenh:\n` +
                    `/start - Bat dau cuoc tro chuyen moi\n` +
                    `/clear - Xoa lich su tro chuyen\n` +
                    `/help - Huong dan su dung` +
                    groupNote,
                    isGroup ? messageId : null
                );
                return;
            }

            if (commandText === '/clear') {
                clearHistory(historyKey);
                await sendTelegramMessage(chatId,
                    'Da xoa lich su tro chuyen. Ban co the bat dau cuoc tro chuyen moi!',
                    isGroup ? messageId : null
                );
                return;
            }

            if (commandText === '/help') {
                const groupHelp = isGroup
                    ? `\n\nCach dung trong nhom:\n- Tag @${BOT_USERNAME} + cau hoi\n- Hoac reply tin nhan cua bot`
                    : '';

                await sendTelegramMessage(chatId,
                    `Huong dan su dung Gemini AI Bot:\n\n` +
                    `1. Gui tin nhan bat ky de tro chuyen voi AI\n` +
                    `2. Bot se nho lich su tro chuyen\n` +
                    `3. Dung /clear de xoa lich su va bat dau lai\n\n` +
                    `Model: ${GEMINI_MODEL}\n` +
                    `Powered by: Google Gemini AI` +
                    groupHelp,
                    isGroup ? messageId : null
                );
                return;
            }

            // Ignore non-text messages
            if (!text) {
                await sendTelegramMessage(chatId,
                    'Xin loi, toi chi ho tro tin nhan van ban.',
                    isGroup ? messageId : null
                );
                return;
            }

            // Check if API keys are configured
            if (!TELEGRAM_BOT_TOKEN || !GEMINI_API_KEY) {
                await sendTelegramMessage(chatId,
                    'Bot chua duoc cau hinh day du. Vui long lien he admin.',
                    isGroup ? messageId : null
                );
                return;
            }

            // Remove bot mention from text
            const cleanText = removeBotMention(text, BOT_USERNAME);

            if (!cleanText) {
                await sendTelegramMessage(chatId,
                    'Ban muon hoi gi?',
                    isGroup ? messageId : null
                );
                return;
            }

            // Show typing indicator
            await sendTypingAction(chatId);

            try {
                // Call Gemini AI (include username in groups for context)
                const aiResponse = await callGeminiAI(
                    historyKey,
                    cleanText,
                    isGroup ? firstName : null
                );

                // Send response (split if too long)
                if (aiResponse.length > 4000) {
                    // Split into chunks
                    const chunks = aiResponse.match(/[\s\S]{1,4000}/g) || [];
                    for (let i = 0; i < chunks.length; i++) {
                        await sendTelegramMessage(
                            chatId,
                            chunks[i],
                            i === 0 && isGroup ? messageId : null // Only reply to first chunk
                        );
                    }
                } else {
                    await sendTelegramMessage(chatId, aiResponse, isGroup ? messageId : null);
                }

            } catch (error) {
                console.error('[TELEGRAM] Gemini error:', error.message);
                await sendTelegramMessage(chatId,
                    `Co loi xay ra khi xu ly tin nhan:\n${error.message}\n\nVui long thu lai sau.`,
                    isGroup ? messageId : null
                );
            }
        }

    } catch (error) {
        console.error('[TELEGRAM] Webhook error:', error.message);
        // Already sent 200, just log the error
    }
});

// Manual send endpoint (for testing)
// POST /api/telegram/send
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
// POST /api/telegram/setWebhook
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
                allowed_updates: ['message']
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
// GET /api/telegram/webhookInfo
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

// Delete webhook (switch to polling mode)
// POST /api/telegram/deleteWebhook
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
